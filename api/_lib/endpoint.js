// ?action= ile yönlendirilen Vercel fonksiyonları için ortak iskelet:
// bilinmeyen işlem, istek koruması, yapılandırma ve beklenmeyen hata yönetimi tek yerde.

import { allowedOrigins, fail, getClientIp, guardRequest } from './http.js';
import { createSupabase, readSupabaseConfig } from './supabase.js';
import { hitLimit, limitKey } from './ratelimit.js';
import { requireUser } from './session.js';

export const UNAVAILABLE = 'Şu anda işleminizi tamamlayamıyoruz, lütfen biraz sonra tekrar deneyin.';
const TOO_MANY = 'Çok fazla deneme yaptınız. Lütfen biraz sonra tekrar deneyin.';

/** actions: { [ad]: { methods: string[], run(ctx) } } */
export function createEndpoint(name, actions, { env = process.env, fetchImpl = fetch, ...deps } = {}) {
    return async function handler(req, res) {
        const action = String(req.query?.action || '');
        const spec = Object.hasOwn(actions, action) ? actions[action] : null;
        if (!spec) return fail(res, 404, 'İşlem bulunamadı.');
        if (!guardRequest(req, res, { methods: spec.methods, origins: allowedOrigins(env), maxBytes: spec.maxBytes })) return;

        const { config, missing } = readSupabaseConfig(env);
        if (missing.length > 0) {
            console.error(`${name}: eksik ortam değişkenleri: ${missing.join(', ')}`);
            return fail(res, 503, 'Üyelik sistemi şu anda kullanılamıyor.');
        }

        const supabase = createSupabase({ url: config.url, anonKey: config.anonKey, serviceKey: config.serviceKey, fetchImpl });
        const ctx = { req, res, env, config, supabase, ip: getClientIp(req), body: req.body ?? {}, ...deps };
        try {
            return await spec.run(ctx);
        } catch (error) {
            // Token, şifre veya e-posta loglanmaz; yalnızca işlem ve durum kodu.
            console.error(`${name}/${action} başarısız:`, error?.status ?? error?.name ?? 'bilinmeyen hata');
            if (!res.headersSent && !res.writableEnded && !res.ended) return fail(res, 502, UNAVAILABLE);
        }
    };
}

/** İşlemi oturum doğrulamasıyla sarar; ctx.user, ctx.uid ve ctx.accessToken eklenir. */
export function authed(run) {
    return async function withUser(ctx) {
        const session = await requireUser(ctx.req, ctx.res, ctx.supabase);
        if (!session) return;
        return run({ ...ctx, user: session.user, uid: session.user.id, accessToken: session.accessToken });
    };
}

/** checks: [[tür, kimlik, [en fazla, pencere sn]], ...]. Sınır aşıldıysa 429 gönderir ve true döner. */
export async function rateLimited(ctx, checks) {
    for (const [kind, value, [max, windowSeconds]] of checks) {
        if (!(await hitLimit(ctx.supabase, limitKey(kind, value), max, windowSeconds))) {
            ctx.res.setHeader('Retry-After', String(windowSeconds));
            fail(ctx.res, 429, TOO_MANY);
            return true;
        }
    }
    return false;
}
