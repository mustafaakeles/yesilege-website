// Bağımlılıksız Supabase REST istemcisi (Auth + PostgREST). Yalnızca sunucuda kullanılır.
// Service anahtarı yalnızca `apikey` başlığında gönderilir: eski JWT ve yeni sb_secret_ anahtarlarıyla çalışır.

const TIMEOUT_MS = 8000;

export class SupabaseError extends Error {
    constructor(status, code) {
        super(`Supabase isteği başarısız (durum ${status}${code ? `, ${code}` : ''})`);
        this.name = 'SupabaseError';
        this.status = status;
        this.code = code || '';
    }
}

export function readSupabaseConfig(env) {
    const config = {
        url: env.SUPABASE_URL,
        anonKey: env.SUPABASE_ANON_KEY,
        serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
        siteUrl: env.SITE_URL
    };
    const names = { url: 'SUPABASE_URL', anonKey: 'SUPABASE_ANON_KEY', serviceKey: 'SUPABASE_SERVICE_ROLE_KEY', siteUrl: 'SITE_URL' };
    const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => names[key]);
    return { config, missing };
}

export const eq = (value) => 'eq.' + encodeURIComponent(String(value));

export function createSupabase({ url, anonKey, serviceKey, fetchImpl = fetch }) {
    const base = String(url).replace(/\/+$/, '');

    async function request(method, path, { headers = {}, body, raw } = {}) {
        let response;
        try {
            response = await fetchImpl(base + path, {
                method,
                headers: { 'Content-Type': 'application/json', ...headers },
                body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
                signal: AbortSignal.timeout(TIMEOUT_MS)
            });
        } catch {
            throw new SupabaseError(0, 'network');
        }
        const text = await response.text();
        let data = null;
        if (text) {
            try { data = JSON.parse(text); } catch { data = null; }
        }
        if (!response.ok) {
            const error = new SupabaseError(response.status, data?.error_code || data?.code || data?.error || '');
            // Veritabanı fonksiyonlarının "raise exception" ile verdiği iş kuralı kodu (ör. out_of_stock)
            if (data?.code === 'P0001' && /^[a-z_]{3,40}$/.test(String(data.message || ''))) error.reason = data.message;
            throw error;
        }
        return data;
    }

    const anon = (extra = {}) => ({ apikey: anonKey, ...extra });
    const user = (token) => anon({ Authorization: `Bearer ${token}` });
    const service = (extra = {}) => ({ apikey: serviceKey, ...extra });
    const represent = service({ Prefer: 'return=representation' });

    return {
        auth: {
            signUp: ({ email, password, data }) => request('POST', '/auth/v1/signup', { headers: anon(), body: { email, password, data } }),
            signIn: ({ email, password }) => request('POST', '/auth/v1/token?grant_type=password', { headers: anon(), body: { email, password } }),
            refresh: (refreshToken) => request('POST', '/auth/v1/token?grant_type=refresh_token', { headers: anon(), body: { refresh_token: refreshToken } }),
            verify: ({ tokenHash, type }) => request('POST', '/auth/v1/verify', { headers: anon(), body: { token_hash: tokenHash, type } }),
            recover: (email) => request('POST', '/auth/v1/recover', { headers: anon(), body: { email } }),
            resend: (email) => request('POST', '/auth/v1/resend', { headers: anon(), body: { type: 'signup', email } }),
            logout: (accessToken, scope = 'local') => request('POST', `/auth/v1/logout?scope=${encodeURIComponent(scope)}`, { headers: user(accessToken) }),
            getUser: (accessToken) => request('GET', '/auth/v1/user', { headers: user(accessToken) }),
            updatePassword: (accessToken, password) => request('PUT', '/auth/v1/user', { headers: user(accessToken), body: { password } }),
            // TOTP iki adımlı doğrulama (kullanıcının kendi token'ıyla)
            enrollTotp: (accessToken) => request('POST', '/auth/v1/factors', { headers: user(accessToken), body: { factor_type: 'totp', friendly_name: `Yeşil Ege yönetim ${Date.now()}` } }),
            unenroll: (accessToken, factorId) => request('DELETE', `/auth/v1/factors/${encodeURIComponent(factorId)}`, { headers: user(accessToken) }),
            challenge: (accessToken, factorId) => request('POST', `/auth/v1/factors/${encodeURIComponent(factorId)}/challenge`, { headers: user(accessToken), body: {} }),
            verifyTotp: (accessToken, factorId, challengeId, code) => request('POST', `/auth/v1/factors/${encodeURIComponent(factorId)}/verify`,
                { headers: user(accessToken), body: { challenge_id: challengeId, code } })
        },
        storage: {
            upload: (bucket, path, buffer, contentType) => request('POST', `/storage/v1/object/${bucket}/${path}`,
                { headers: service({ 'Content-Type': contentType, 'x-upsert': 'false', 'cache-control': '31536000' }), raw: buffer }),
            remove: (bucket, paths) => request('DELETE', `/storage/v1/object/${bucket}`, { headers: service(), body: { prefixes: paths } }),
            publicUrl: (bucket, path) => `${base}/storage/v1/object/public/${bucket}/${path}`
        },
        db: {
            select: (table, query = '') => request('GET', `/rest/v1/${table}?${query}`, { headers: service() }),
            insert: (table, row) => request('POST', `/rest/v1/${table}`, { headers: represent, body: row }),
            update: (table, query, patch) => request('PATCH', `/rest/v1/${table}?${query}`, { headers: represent, body: patch }),
            remove: (table, query) => request('DELETE', `/rest/v1/${table}?${query}`, { headers: represent }),
            rpc: (fn, args) => request('POST', `/rest/v1/rpc/${fn}`, { headers: service(), body: args })
        }
    };
}
