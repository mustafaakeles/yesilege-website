// Vercel fonksiyonları için ortak istek koruması, oran sınırı ve yanıt yardımcıları.

const WINDOW_MS = 10 * 60_000;
const MAX_REQUESTS = 5;
const DEFAULT_MAX_BYTES = 10_000;

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

export function getClientIp(req) {
    // Vercel edge tarafından sağlanan başlık, proxy zincirine göre daha güvenilir.
    const forwarded = req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'];
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return (typeof ip === 'string' ? ip.split(',')[0].trim() : '') || req.socket?.remoteAddress || '';
}

export function allowedOrigins(env) {
    const origins = [];
    try {
        if (env.SITE_URL) origins.push(new URL(env.SITE_URL).origin);
    } catch {
        // Geçersiz SITE_URL: hiçbir köken eklenmez, istekler reddedilir.
    }
    for (const value of String(env.ALLOWED_DEV_ORIGINS || '').split(',')) {
        const origin = value.trim();
        if (origin) origins.push(origin);
    }
    return origins;
}

export function fail(res, status, error) {
    return res.status(status).json({ success: false, error });
}

function bodyBytes(req) {
    try {
        return Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8');
    } catch {
        return Infinity;
    }
}

/** Yöntem, içerik türü, gövde boyutu ve köken kontrolü. Başarısızsa yanıtı gönderir ve false döner. */
export function guardRequest(req, res, { methods, origins, maxBytes = DEFAULT_MAX_BYTES }) {
    if (!methods.includes(req.method)) {
        res.setHeader('Allow', methods.join(', '));
        fail(res, 405, 'Bu işlem için yöntem desteklenmiyor.');
        return false;
    }
    if (req.method === 'GET') return true;

    const contentType = String(req.headers['content-type'] || '');
    if (!/^application\/json(?:;|$)/i.test(contentType)) {
        fail(res, 415, 'JSON içeriği bekleniyor.');
        return false;
    }
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > maxBytes || bodyBytes(req) > maxBytes) {
        fail(res, 413, 'İstek çok büyük.');
        return false;
    }
    if (!origins.includes(String(req.headers.origin || ''))) {
        fail(res, 403, 'İstek reddedildi.');
        return false;
    }
    return true;
}

export function appendCookies(res, cookies) {
    const current = res.getHeader('Set-Cookie');
    const existing = current === undefined ? [] : Array.isArray(current) ? current : [String(current)];
    res.setHeader('Set-Cookie', [...existing, ...cookies]);
}
