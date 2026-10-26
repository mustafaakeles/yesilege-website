// Bülten altyapısı: açık onay + e-posta doğrulaması + Resend Contacts.
// NEWSLETTER_ENABLED=true olmadan abonelik başlatılmaz.
// Gerekli: RESEND_API_KEY, CONTACT_FROM_EMAIL, NEWSLETTER_SECRET (32+ karakter),
// NEWSLETTER_TOPIC_ID, NEWSLETTER_PUBLIC_ORIGIN=https://yesilege.com.tr
// Yayına açmadan önce KVKK aydınlatması ve pazarlama izni ayrı değerlendirilmelidir.

import { createRateLimiter } from './contact.js';
import { normalizeSubscriberEmail, createVerificationToken, verifyVerificationToken } from './_lib/newsletter.js';

const MAX_BODY_BYTES = 4_000;
const limiter = createRateLimiter({ max: 5, windowMs: 10 * 60_000 });

function clientIp(req) {
    const header = req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'];
    const forwarded = Array.isArray(header) ? header[0] : header;
    return (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '')
        || req.socket?.remoteAddress || '';
}

function getConfig(env) {
    if (env.NEWSLETTER_ENABLED !== 'true') return null;
    const required = [
        'RESEND_API_KEY',
        'CONTACT_FROM_EMAIL',
        'NEWSLETTER_SECRET',
        'NEWSLETTER_TOPIC_ID',
        'NEWSLETTER_PUBLIC_ORIGIN'
    ];
    if (required.some(key => !env[key]) || env.NEWSLETTER_SECRET.length < 32) return null;
    try {
        const url = new URL(env.NEWSLETTER_PUBLIC_ORIGIN);
        if (url.protocol !== 'https:' || url.origin !== 'https://yesilege.com.tr') return null;
        return {
            apiKey: env.RESEND_API_KEY,
            from: env.CONTACT_FROM_EMAIL,
            secret: env.NEWSLETTER_SECRET,
            topicId: env.NEWSLETTER_TOPIC_ID,
            origin: url.origin
        };
    } catch {
        return null;
    }
}

async function postResend(fetchImpl, url, apiKey, payload) {
    const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + apiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    return response;
}

export function createNewsletterHandler({ env = process.env, fetchImpl = fetch, rateLimiter = limiter, now = Date.now } = {}) {
    return async function handler(req, res) {
        res.setHeader('Cache-Control', 'no-store');

        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ success: false, error: 'Yalnızca POST desteklenir.' });
        }
        const config = getConfig(env);
        if (!config) {
            return res.status(503).json({ success: false, error: 'Bülten aboneliği henüz kullanıma açık değil.' });
        }
        const contentType = String(req.headers['content-type'] || '');
        if (!/^application\/json(?:;|$)/i.test(contentType)) {
            return res.status(415).json({ success: false, error: 'JSON içeriği bekleniyor.' });
        }
        let size = 0;
        try {
            size = Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8');
        } catch {
            return res.status(400).json({ success: false, error: 'Geçersiz istek.' });
        }
        if (size > MAX_BODY_BYTES) {
            return res.status(413).json({ success: false, error: 'İstek çok büyük.' });
        }
        const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
        if (body.action !== 'request' && body.action !== 'confirm') {
            return res.status(400).json({ success: false, error: 'Geçersiz işlem.' });
        }

        const limit = rateLimiter.check(clientIp(req));
        if (!limit.allowed) {
            res.setHeader('Retry-After', String(limit.retryAfter));
            return res.status(429).json({ success: false, error: 'Çok fazla istek. Lütfen sonra tekrar deneyin.' });
        }

        try {
            if (body.action === 'request') {
                // Honeypot: botu bilgilendirmeden yanıtla, asla e-posta gönderme.
                if (body.website) return res.status(200).json({ success: true, pending: true });
                const email = normalizeSubscriberEmail(body.email);
                if (!email || body.marketingConsent !== true) {
                    return res.status(400).json({ success: false, error: 'Geçerli e-posta ve açık bülten izni gereklidir.' });
                }
                const token = createVerificationToken(email, config.secret, now());
                const confirmation = new URL('/subscription/confirm.html', config.origin);
                confirmation.searchParams.set('token', token);
                const href = confirmation.toString();
                const response = await postResend(fetchImpl, 'https://api.resend.com/emails', config.apiKey, {
                    from: config.from,
                    to: [email],
                    subject: 'Yeşil Ege — bülten aboneliğinizi doğrulayın',
                    text: 'Yeşil Ege bültenine katılmak için bağlantıyı açıp onaylayın: ' + href
                        + '\n\nSiz istemediyseniz bu mesajı yok sayabilirsiniz.',
                    html: '<p>Yeşil Ege bültenine katılmak için e-posta adresinizi doğrulayın.</p>'
                        + '<p><a href="' + href + '">Aboneliğimi doğrula</a></p>'
                        + '<p>Siz istemediyseniz bu mesajı yok sayabilirsiniz.</p>'
                });
                if (!response.ok) {
                    console.error('Bülten doğrulama e-postası reddedildi: HTTP', response.status);
                    return res.status(502).json({ success: false, error: 'Doğrulama e-postası gönderilemedi.' });
                }
                return res.status(200).json({ success: true, pending: true });
            }

            const email = verifyVerificationToken(body.token, config.secret, now());
            if (!email) {
                return res.status(400).json({ success: false, error: 'Onay bağlantısı geçersiz veya süresi dolmuş.' });
            }
            // Kaydı ancak kullanıcı onay ekranındaki düğmeye bastığında oluştur.
            const response = await postResend(fetchImpl, 'https://api.resend.com/contacts', config.apiKey, {
                email,
                unsubscribed: false,
                topics: [{ id: config.topicId, subscription: 'opt_in' }]
            });
            if (response.status === 409) {
                return res.status(409).json({
                    success: false,
                    error: 'Bu e-posta zaten kayıtlı. Abonelik tercihlerinizi önceki bültenlerden yönetin.'
                });
            }
            if (!response.ok) {
                console.error('Bülten kişi kaydı reddedildi: HTTP', response.status);
                return res.status(502).json({ success: false, error: 'Abonelik tamamlanamadı.' });
            }
            return res.status(200).json({ success: true, subscribed: true });
        } catch (error) {
            // E-posta, token ve sağlayıcı yanıtı günlükte tutulmaz.
            console.error('Bülten sağlayıcısına erişilemedi.');
            return res.status(502).json({ success: false, error: 'İşlem şu anda tamamlanamıyor.' });
        }
    };
}

export default createNewsletterHandler();
