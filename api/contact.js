// Vercel Function: site formlarını doğrular ve Resend ile e-posta olarak iletir.
// Gerekli ortam değişkenleri: RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL

import { validateSubmission, buildEmail } from './_lib/contact.js';
import { resolveMx } from 'node:dns/promises';
import { sendEmail } from './_lib/resend.js';
import { createRateLimiter, getClientIp } from './_lib/http.js';

export { sendEmail, createRateLimiter, getClientIp };

const MAX_BODY_BYTES = 20_000;
const sharedLimiter = createRateLimiter();

function readConfig(env) {
    const config = {
        apiKey: env.RESEND_API_KEY,
        to: env.CONTACT_TO_EMAIL,
        from: env.CONTACT_FROM_EMAIL
    };
    const missing = Object.entries(config).filter(([, v]) => !v).map(([k]) => k);
    return { config, missing };
}

// Kurumsal alan adının MX kaydı yokken Resend'in kabul yanıtı gerçek teslimat demek değildir.
// Varsa çalışan harici alıcılara gönderir; hiçbir alıcı kalmıyorsa formu hatayla sonlandırır.
export async function verifiedRecipients(to, mxLookup = resolveMx) {
    const recipients = to.split(',').map(value => value.trim()).filter(Boolean);
    const own = recipients.filter(value => /@yesilege\.com\.tr$/i.test(value));
    if (own.length === 0) return { to: recipients.join(','), excluded: [] };

    let records = [];
    try {
        records = await mxLookup('yesilege.com.tr');
    } catch (error) {
        console.warn('Kurumsal e-posta MX sorgusu başarısız:', error?.code || error?.message);
    }
    const hasMx = Array.isArray(records) && records.some(record => record.exchange && record.exchange !== '.');
    if (hasMx) return { to: recipients.join(','), excluded: [] };

    return {
        to: recipients.filter(value => !own.includes(value)).join(','),
        excluded: own
    };
}

export function createHandler({ env = process.env, fetchImpl = fetch, limiter = sharedLimiter, mxLookup = resolveMx } = {}) {
    return async function handler(req, res) {
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST');
            return res.status(405).json({ success: false, error: 'Yalnızca POST desteklenir.' });
        }

        const contentType = String(req.headers['content-type'] || '');
        if (contentType && !/^application\/json(?:;|$)/i.test(contentType)) {
            return res.status(415).json({ success: false, error: 'JSON içeriği bekleniyor.' });
        }

        const contentLength = Number(req.headers['content-length'] || 0);
        if (contentLength > MAX_BODY_BYTES) {
            return res.status(413).json({ success: false, error: 'İstek çok büyük.' });
        }

        // Content-Length bulunmasa veya hatalı bildirilse bile gövde sınırını uygula.
        let payloadBytes = 0;
        try {
            payloadBytes = Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8');
        } catch {
            return res.status(400).json({ success: false, error: 'İstek içeriği geçersiz.' });
        }
        if (payloadBytes > MAX_BODY_BYTES) {
            return res.status(413).json({ success: false, error: 'İstek çok büyük.' });
        }

        const result = validateSubmission(req.body);
        if (!result.ok) {
            return res.status(400).json({ success: false, error: result.error });
        }
        if (result.spam) {
            return res.status(200).json({ success: true });
        }

        const limit = limiter.check(getClientIp(req));
        if (!limit.allowed) {
            res.setHeader('Retry-After', String(limit.retryAfter));
            return res.status(429).json({ success: false, error: 'Çok fazla istek gönderdiniz. Lütfen biraz sonra tekrar deneyin.' });
        }

        const { config, missing } = readConfig(env);
        if (missing.length > 0) {
            console.error(`Form e-postası gönderilemedi, eksik ortam değişkenleri: ${missing.join(', ')}`);
            return res.status(500).json({ success: false, error: 'Mesaj şu anda iletilemiyor.' });
        }

        try {
            const delivery = await verifiedRecipients(config.to, mxLookup);
            if (delivery.excluded.length) {
                console.error('MX kaydı olmayan kurumsal e-posta alıcıları atlandı. Lütfen Cloudflare DNS ayarlarını düzeltin.');
            }
            if (!delivery.to) {
                return res.status(503).json({
                    success: false,
                    error: 'E-posta teslimi yapılandırılmamış. Lütfen telefon veya WhatsApp ile ulaşın.'
                });
            }
            await sendEmail({ ...config, to: delivery.to }, buildEmail(result.data), result.data.email, fetchImpl);
            return res.status(200).json({ success: true });
        } catch (error) {
            console.error('Form e-postası gönderilemedi:', error);
            return res.status(502).json({ success: false, error: 'Mesaj şu anda iletilemiyor.' });
        }
    };
}

export default createHandler();
