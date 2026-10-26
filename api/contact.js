// Vercel Function: site formlarını doğrular ve Resend ile e-posta olarak iletir.
// Gerekli ortam değişkenleri: RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL

import { validateSubmission, buildEmail } from './_lib/contact.js';

const MAX_BODY_BYTES = 20_000;
const WINDOW_MS = 10 * 60_000;
const MAX_REQUESTS = 5;

// Aynı serverless örneğinde ek koruma sağlar; dağıtık limit için Vercel WAF gerekir.
export function createRateLimiter({ max = MAX_REQUESTS, windowMs = WINDOW_MS, now = Date.now } = {}) {
    const buckets = new Map();
    return {
        check(ip) {
            if (!ip) return { allowed: true };
            const time = now();
            if (buckets.size > 500) {
                for (const [key, bucket] of buckets) {
                    if (bucket.resetAt <= time) buckets.delete(key);
                }
                if (buckets.size > 500) buckets.clear();
            }
            let bucket = buckets.get(ip);
            if (!bucket || bucket.resetAt <= time) {
                buckets.set(ip, { count: 1, resetAt: time + windowMs });
                return { allowed: true };
            }
            if (bucket.count >= max) {
                return { allowed: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - time) / 1000)) };
            }
            bucket.count++;
            return { allowed: true };
        }
    };
}

const sharedLimiter = createRateLimiter();

function getClientIp(req) {
    // Vercel edge tarafından sağlanan başlık, proxy zincirine göre daha güvenilir.
    const forwarded = req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'];
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return (typeof ip === 'string' ? ip.split(',')[0].trim() : '') || req.socket?.remoteAddress || '';
}

function readConfig(env) {
    const config = {
        apiKey: env.RESEND_API_KEY,
        to: env.CONTACT_TO_EMAIL,
        from: env.CONTACT_FROM_EMAIL
    };
    const missing = Object.entries(config).filter(([, v]) => !v).map(([k]) => k);
    return { config, missing };
}

export async function sendEmail({ apiKey, to, from }, email, replyTo, fetchImpl = fetch) {
    const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from,
            to: to.split(',').map(s => s.trim()).filter(Boolean),
            reply_to: replyTo,
            subject: email.subject,
            text: email.text,
            html: email.html
        })
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Resend HTTP ${response.status}: ${detail.slice(0, 300)}`);
    }
}

export function createHandler({ env = process.env, fetchImpl = fetch, limiter = sharedLimiter } = {}) {
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
            await sendEmail(config, buildEmail(result.data), result.data.email, fetchImpl);
            return res.status(200).json({ success: true });
        } catch (error) {
            console.error('Form e-postası gönderilemedi:', error);
            return res.status(502).json({ success: false, error: 'Mesaj şu anda iletilemiyor.' });
        }
    };
}

export default createHandler();
