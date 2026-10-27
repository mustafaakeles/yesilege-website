// Oturum çerezleri: token'lar yalnızca HttpOnly çerezlerde tutulur, tarayıcı JavaScript'i göremez.

import { appendCookies, fail } from './http.js';

export const COOKIES = Object.freeze({ access: 'ye_at', refresh: 'ye_rt', hint: 'ye_session' });

const ACCESS_MAX_AGE = 3600;
const REFRESH_MAX_AGE = 30 * 24 * 3600;
const SECURE_API = 'HttpOnly; Secure; SameSite=Lax; Path=/api';
const HINT_FLAGS = 'Secure; SameSite=Lax; Path=/';

export function parseCookies(header) {
    const cookies = {};
    for (const part of String(header || '').split(';')) {
        const index = part.indexOf('=');
        if (index <= 0) continue;
        const name = part.slice(0, index).trim();
        if (!name || name in cookies) continue;
        let value;
        try {
            value = decodeURIComponent(part.slice(index + 1).trim());
        } catch {
            continue;
        }
        if (value) cookies[name] = value;
    }
    return cookies;
}

export function sessionCookies({ access_token, refresh_token, expires_in }) {
    const accessAge = Math.min(Number(expires_in) || ACCESS_MAX_AGE, ACCESS_MAX_AGE);
    return [
        `${COOKIES.access}=${encodeURIComponent(access_token)}; ${SECURE_API}; Max-Age=${accessAge}`,
        `${COOKIES.refresh}=${encodeURIComponent(refresh_token)}; ${SECURE_API}; Max-Age=${REFRESH_MAX_AGE}`,
        `${COOKIES.hint}=1; ${HINT_FLAGS}; Max-Age=${REFRESH_MAX_AGE}`
    ];
}

export function clearedSessionCookies() {
    return [
        `${COOKIES.access}=; ${SECURE_API}; Max-Age=0`,
        `${COOKIES.refresh}=; ${SECURE_API}; Max-Age=0`,
        `${COOKIES.hint}=; ${HINT_FLAGS}; Max-Age=0`
    ];
}

const isUnauthorized = (error) => error?.status === 401 || error?.status === 403;

function expire(res) {
    appendCookies(res, clearedSessionCookies());
    fail(res, 401, 'Oturumunuzun süresi doldu, lütfen tekrar giriş yapın.');
    return null;
}

/** Oturumdaki kullanıcıyı doğrular; erişim token'ı dolmuşsa refresh token ile yeniler. */
export async function requireUser(req, res, supabase) {
    const cookies = parseCookies(req.headers.cookie);
    const accessToken = cookies[COOKIES.access];
    const refreshToken = cookies[COOKIES.refresh];

    try {
        if (accessToken) {
            try {
                return { user: await supabase.auth.getUser(accessToken), accessToken };
            } catch (error) {
                if (!isUnauthorized(error)) throw error;
            }
        }
        if (!refreshToken) return expire(res);

        let session;
        try {
            session = await supabase.auth.refresh(refreshToken);
        } catch (error) {
            if (isUnauthorized(error) || error?.status === 400) return expire(res);
            throw error;
        }
        appendCookies(res, sessionCookies(session));
        return { user: await supabase.auth.getUser(session.access_token), accessToken: session.access_token };
    } catch (error) {
        console.error('Oturum doğrulanamadı:', error?.status ?? 'ağ hatası');
        fail(res, 502, 'Şu anda işleminizi tamamlayamıyoruz, lütfen biraz sonra tekrar deneyin.');
        return null;
    }
}
