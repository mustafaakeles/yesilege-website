// Vercel Function: kayıt, giriş, çıkış, e-posta doğrulama ve şifre sıfırlama.
// Gerekli ortam değişkenleri: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SITE_URL

import { appendCookies, fail } from './_lib/http.js';
import { clearedSessionCookies, COOKIES, parseCookies, requireUser, sessionCookies } from './_lib/session.js';
import { createEndpoint, rateLimited } from './_lib/endpoint.js';
import { LIMITS } from './_lib/ratelimit.js';
import { validateCredentials, validateEmailOnly, validateNewPassword, validateRegistration } from './_lib/validate.js';

const REGISTER_MESSAGE = 'Doğrulama e-postası gönderildi. Lütfen gelen kutunuzu kontrol edin.';
const LOGIN_FAILED = 'E-posta veya şifre hatalı ya da e-posta adresi henüz doğrulanmadı.';
const PASSWORD_REJECTED = 'Bu şifre kullanılamıyor. Lütfen farklı bir şifre seçin.';
const LINK_FAILED = '/giris.html?hata=baglanti';
const CONFIRM_TARGETS = Object.freeze({ email: '/hesabim.html?dogrulandi=1', recovery: '/sifre-sifirla.html?adim=yeni' });
const TOKEN_HASH_RE = /^[A-Za-z0-9_-]{1,200}$/;

// Ağ hatası (0) ve sunucu hataları dışındaki Supabase yanıtları kullanıcı kaynaklıdır.
const isClientError = (error) => error?.status >= 400 && error?.status < 500;

function redirect(res, location) {
    res.setHeader('Location', location);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(303).end();
}

async function register(ctx) {
    const result = validateRegistration(ctx.body);
    if (!result.ok) return fail(ctx.res, 400, result.error);
    if (result.spam) return ctx.res.status(200).json({ success: true, message: REGISTER_MESSAGE });
    if (await rateLimited(ctx, [['registerIp', ctx.ip, LIMITS.registerIp]])) return;

    const { fullName, email, password, phone, marketing } = result.data;
    try {
        await ctx.supabase.auth.signUp({
            email,
            password,
            data: { full_name: fullName, phone, kvkk: 'true', marketing: String(marketing) }
        });
    } catch (error) {
        // Kayıtlı e-posta gibi istemci hataları da aynı yanıtı alır: hesap varlığı sızmaz.
        if (!isClientError(error)) throw error;
    }
    return ctx.res.status(200).json({ success: true, message: REGISTER_MESSAGE });
}

async function login(ctx) {
    const result = validateCredentials(ctx.body);
    if (!result.ok) return fail(ctx.res, 400, result.error);
    const { email, password } = result.data;
    if (await rateLimited(ctx, [['loginIp', ctx.ip, LIMITS.loginIp], ['loginEmail', email, LIMITS.loginEmail]])) return;

    let session;
    try {
        session = await ctx.supabase.auth.signIn({ email, password });
    } catch (error) {
        if (isClientError(error)) return fail(ctx.res, 401, LOGIN_FAILED);
        throw error;
    }
    appendCookies(ctx.res, sessionCookies(session));
    return ctx.res.status(200).json({ success: true });
}

async function logout(ctx) {
    const scope = ctx.body.scope === 'global' ? 'global' : 'local';
    const accessToken = parseCookies(ctx.req.headers.cookie)[COOKIES.access];
    if (accessToken) {
        try {
            await ctx.supabase.auth.logout(accessToken, scope);
        } catch (error) {
            console.warn('Supabase çıkışı başarısız:', error?.status ?? 'ağ hatası');
        }
    }
    appendCookies(ctx.res, clearedSessionCookies());
    return ctx.res.status(200).json({ success: true });
}

async function confirm(ctx) {
    const { token_hash: tokenHash, type } = ctx.req.query || {};
    if (typeof tokenHash !== 'string' || !TOKEN_HASH_RE.test(tokenHash) || !Object.hasOwn(CONFIRM_TARGETS, type)) {
        return redirect(ctx.res, LINK_FAILED);
    }
    let session;
    try {
        session = await ctx.supabase.auth.verify({ tokenHash, type });
    } catch (error) {
        console.warn('E-posta bağlantısı doğrulanamadı:', error?.status ?? 'ağ hatası');
        return redirect(ctx.res, LINK_FAILED);
    }
    appendCookies(ctx.res, sessionCookies(session));
    return redirect(ctx.res, CONFIRM_TARGETS[type]);
}

// Şifre sıfırlama ve doğrulama e-postasını yeniden gönderme: yanıt her zaman aynıdır.
function emailRequest(kind, send) {
    return async function run(ctx) {
        const result = validateEmailOnly(ctx.body);
        if (!result.ok) return fail(ctx.res, 400, result.error);
        const { email } = result.data;
        if (await rateLimited(ctx, [[`${kind}Ip`, ctx.ip, LIMITS.recoverIp], [`${kind}Email`, email, LIMITS.recoverEmail]])) return;
        try {
            await send(ctx.supabase, email);
        } catch (error) {
            console.warn(`${kind} e-postası gönderilemedi:`, error?.status ?? 'ağ hatası');
        }
        return ctx.res.status(200).json({ success: true });
    };
}

async function updatePassword(ctx) {
    const session = await requireUser(ctx.req, ctx.res, ctx.supabase);
    if (!session) return;
    const result = validateNewPassword(ctx.body);
    if (!result.ok) return fail(ctx.res, 400, result.error);

    try {
        await ctx.supabase.auth.updatePassword(session.accessToken, result.data.password);
    } catch (error) {
        if (error?.status === 422 || error?.status === 400) return fail(ctx.res, 400, PASSWORD_REJECTED);
        throw error;
    }
    try {
        await ctx.supabase.auth.logout(session.accessToken, 'others');
    } catch (error) {
        console.warn('Diğer oturumlar kapatılamadı:', error?.status ?? 'ağ hatası');
    }
    return ctx.res.status(200).json({ success: true });
}

const POST = ['POST'];
export const ACTIONS = Object.freeze({
    register: { methods: POST, run: register },
    login: { methods: POST, run: login },
    logout: { methods: POST, run: logout },
    confirm: { methods: ['GET'], run: confirm },
    recover: { methods: POST, run: emailRequest('recover', (supabase, email) => supabase.auth.recover(email)) },
    resend: { methods: POST, run: emailRequest('resend', (supabase, email) => supabase.auth.resend(email)) },
    'update-password': { methods: POST, run: updatePassword }
});

export function createHandler(options = {}) {
    return createEndpoint('auth', ACTIONS, options);
}

export default createHandler();
