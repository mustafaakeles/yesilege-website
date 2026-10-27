// Yerel geliştirme ve uçtan uca testler için bellek içi sahte Supabase (yalnızca bu projenin kullandığı alt küme).
// Gerçek Supabase davranışını taklit eder: doğrulanmamış giriş reddi, tek kullanımlık e-posta bağlantısı,
// refresh token rotasyonu, migration'daki kayıt tetikleyicisi kuralları ve rate_limit_hit.

import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';

export const FAKE_KEYS = Object.freeze({ anon: 'fake-anon-key', service: 'fake-service-key' });

const ACCESS_TTL_SECONDS = 3600;
// supabase/migrations/0002_catalog.sql ile aynı varsayılanlar
const DEFAULT_SETTINGS = [
    { key: 'shipping', value: { fee: 15000, free_threshold: 200000, weekly_capacity: 20, order_cutoff_hour: 18 } },
    { key: 'loyalty', value: { points_per_lira: 1, points_per_unit: 100, unit_value: 500, max_ratio: 0.3, activation_days: 14, valid_months: 12 } },
    { key: 'bank', value: { bank_name: '', account_holder: '', iban: '' } },
    { key: 'store', value: { pickup_address: 'Karaveliler, Kazım Dirik Cd. No: 225, 35847 Bayındır/İzmir', pickup_hours: 'Hafta içi 09:00 – 18:00' } }
];
const COMPOSITE_KEYS = { favorites: ['user_id', 'product_id'], settings: ['key'] };
const token = () => randomBytes(18).toString('base64url');

function send(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
}

async function readJson(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString('utf8');
    return text ? JSON.parse(text) : {};
}

// PostgREST sorgusundan yalnızca eq / in / is.null filtreleri, select, order ve limit desteklenir.
function parseQuery(search) {
    const filters = [];
    let select = null;
    let order = [];
    let limit = Infinity;
    for (const [key, value] of new URLSearchParams(search)) {
        if (key === 'select') select = value.split(',');
        else if (key === 'order') order = value.split(',').map(part => { const [col, dir] = part.split('.'); return { col, desc: dir === 'desc' }; });
        else if (key === 'limit') limit = Number(value);
        else if (value.startsWith('eq.')) filters.push([key, (cell) => String(cell) === value.slice(3)]);
        else if (value.startsWith('in.(')) { const set = new Set(value.slice(4, -1).split(',')); filters.push([key, (cell) => set.has(String(cell))]); }
        else if (value === 'is.null') filters.push([key, (cell) => cell === null || cell === undefined]);
    }
    return { filters, select, order, limit };
}

const matches = (row, filters) => filters.every(([col, test]) => test(row[col]));
const pick = (row, select) => (select ? Object.fromEntries(select.map(col => [col, row[col]])) : { ...row });

function sortRows(rows, order) {
    return [...rows].sort((a, b) => {
        for (const { col, desc } of order) {
            if (a[col] === b[col]) continue;
            const result = a[col] > b[col] ? 1 : -1;
            return desc ? -result : result;
        }
        return 0;
    });
}

export function createFakeState({ onMail = () => {} } = {}) {
    const state = {
        users: new Map(),          // e-posta → kullanıcı
        access: new Map(),         // erişim token'ı → { userId, exp }
        refresh: new Map(),        // refresh token'ı → userId
        otps: new Map(),           // token_hash → { userId, type }
        mailbox: [],
        tables: {
            profiles: [], addresses: [], audit_log: [], categories: [], products: [], favorites: [],
            settings: structuredClone(DEFAULT_SETTINGS)
        },
        limits: new Map()
    };

    const userById = (id) => [...state.users.values()].find(user => user.id === id);
    const publicUser = (user) => ({ id: user.id, email: user.email, email_confirmed_at: user.confirmedAt, user_metadata: {} });

    function mail(user, type) {
        const tokenHash = token();
        state.otps.set(tokenHash, { userId: user.id, type });
        const entry = { type, email: user.email, tokenHash };
        state.mailbox.push(entry);
        onMail(entry);
    }

    function issueSession(user) {
        const accessToken = token();
        const refreshToken = token();
        state.access.set(accessToken, { userId: user.id, exp: Date.now() + ACCESS_TTL_SECONDS * 1000 });
        state.refresh.set(refreshToken, user.id);
        return { access_token: accessToken, refresh_token: refreshToken, expires_in: ACCESS_TTL_SECONDS, token_type: 'bearer', user: publicUser(user) };
    }

    function bearerUser(req) {
        const match = /^Bearer (.+)$/.exec(req.headers.authorization || '');
        const entry = match && state.access.get(match[1]);
        if (!entry || entry.exp < Date.now()) return null;
        return { user: userById(entry.userId), accessToken: match[1] };
    }

    const auth = {
        'POST /auth/v1/signup'(body) {
            const email = String(body.email || '').toLowerCase();
            if (state.users.has(email)) return [200, { id: randomUUID(), email }]; // Supabase gibi gizlenmiş yanıt
            const meta = body.data || {};
            const fullName = String(meta.full_name || '').trim();
            // Migration'daki handle_new_user tetikleyicisinin kuralları
            if (meta.kvkk !== 'true' || fullName.length < 2 || fullName.length > 100) return [500, { error_code: 'unexpected_failure' }];
            const user = { id: randomUUID(), email, password: body.password, confirmedAt: null };
            state.users.set(email, user);
            const marketing = meta.marketing === 'true';
            state.tables.profiles.push({
                id: user.id, full_name: fullName, phone: meta.phone || null, role: 'customer',
                marketing_consent: marketing, marketing_consent_at: marketing ? new Date().toISOString() : null,
                kvkk_accepted_at: new Date().toISOString(), deletion_requested_at: null
            });
            mail(user, 'email');
            return [200, publicUser(user)];
        },
        'POST /auth/v1/token'(body, req, url) {
            const grant = url.searchParams.get('grant_type');
            if (grant === 'password') {
                const user = state.users.get(String(body.email || '').toLowerCase());
                if (!user || user.password !== body.password) return [400, { error_code: 'invalid_credentials' }];
                if (!user.confirmedAt) return [400, { error_code: 'email_not_confirmed' }];
                return [200, issueSession(user)];
            }
            if (grant === 'refresh_token') {
                const userId = state.refresh.get(body.refresh_token);
                if (!userId) return [400, { error_code: 'refresh_token_not_found' }];
                state.refresh.delete(body.refresh_token);
                return [200, issueSession(userById(userId))];
            }
            return [400, { error_code: 'unsupported_grant_type' }];
        },
        'POST /auth/v1/verify'(body) {
            const otp = state.otps.get(body.token_hash);
            if (!otp || otp.type !== body.type) return [403, { error_code: 'otp_expired' }];
            state.otps.delete(body.token_hash);
            const user = userById(otp.userId);
            if (otp.type === 'email') user.confirmedAt = new Date().toISOString();
            return [200, issueSession(user)];
        },
        'POST /auth/v1/recover'(body) {
            const user = state.users.get(String(body.email || '').toLowerCase());
            if (user) mail(user, 'recovery');
            return [200, {}];
        },
        'POST /auth/v1/resend'(body) {
            const user = state.users.get(String(body.email || '').toLowerCase());
            if (user && !user.confirmedAt) mail(user, 'email');
            return [200, {}];
        },
        'POST /auth/v1/logout'(body, req, url) {
            const session = bearerUser(req);
            if (!session) return [401, { error_code: 'bad_jwt' }];
            const scope = url.searchParams.get('scope') || 'local';
            for (const [key, entry] of state.access) {
                const own = entry.userId === session.user.id;
                if ((scope === 'local' && key === session.accessToken) || (scope === 'global' && own) || (scope === 'others' && own && key !== session.accessToken)) {
                    state.access.delete(key);
                }
            }
            if (scope !== 'others') {
                for (const [key, userId] of state.refresh) if (userId === session.user.id) state.refresh.delete(key);
            }
            return [204];
        },
        'GET /auth/v1/user'(body, req) {
            const session = bearerUser(req);
            return session ? [200, publicUser(session.user)] : [401, { error_code: 'bad_jwt' }];
        },
        'PUT /auth/v1/user'(body, req) {
            const session = bearerUser(req);
            if (!session) return [401, { error_code: 'bad_jwt' }];
            if (body.password === session.user.password) return [422, { error_code: 'same_password' }];
            session.user.password = body.password;
            return [200, publicUser(session.user)];
        }
    };

    function rest(method, table, url, body) {
        const rows = state.tables[table];
        if (!rows) return [404, { code: 'PGRST205' }];
        const { filters, select, order, limit } = parseQuery(url.search);
        if (method === 'GET') return [200, sortRows(rows.filter(row => matches(row, filters)), order).slice(0, limit).map(row => pick(row, select))];
        if (method === 'POST') {
            const now = new Date().toISOString();
            const keys = COMPOSITE_KEYS[table];
            if (keys && rows.some(row => keys.every(key => row[key] === body[key]))) return [409, { code: '23505' }];
            const row = { ...(keys ? {} : { id: table === 'audit_log' ? rows.length + 1 : randomUUID() }), created_at: now, updated_at: now, ...body };
            rows.push(row);
            return [201, [row]];
        }
        const hit = rows.filter(row => matches(row, filters));
        if (method === 'PATCH') {
            for (const row of hit) Object.assign(row, body, { updated_at: new Date().toISOString() });
            return [200, hit.map(row => ({ ...row }))];
        }
        if (method === 'DELETE') {
            state.tables[table] = rows.filter(row => !hit.includes(row));
            return [200, hit];
        }
        return [405, {}];
    }

    function rateLimitHit({ p_key: key, p_max: max, p_window_seconds: windowSeconds }) {
        const now = Date.now();
        const entry = state.limits.get(key);
        const next = !entry || entry.resetAt <= now ? { count: 1, resetAt: now + windowSeconds * 1000 } : { ...entry, count: entry.count + 1 };
        state.limits.set(key, next);
        return next.count <= max;
    }

    async function handle(req, res) {
        const url = new URL(req.url, 'http://fake');
        let body;
        try {
            body = await readJson(req);
        } catch {
            return send(res, 400, { code: 'invalid_json' });
        }
        const key = `${req.method} ${url.pathname}`;
        if (url.pathname.startsWith('/auth/v1/')) {
            if (req.headers.apikey !== FAKE_KEYS.anon) return send(res, 401, { error_code: 'invalid_api_key' });
            const route = auth[key];
            if (!route) return send(res, 404, { error_code: 'not_found' });
            const [status, payload] = route(body, req, url);
            return send(res, status, payload);
        }
        if (url.pathname.startsWith('/rest/v1/')) {
            if (req.headers.apikey !== FAKE_KEYS.service) return send(res, 401, { message: 'Invalid API key' });
            if (key === 'POST /rest/v1/rpc/rate_limit_hit') return send(res, 200, rateLimitHit(body));
            const [status, payload] = rest(req.method, url.pathname.slice('/rest/v1/'.length), url, body);
            return send(res, status, payload);
        }
        return send(res, 404, {});
    }

    return { state, handle };
}

/** Yalnızca yerel geliştirme ve uçtan uca testler için örnek katalog (canlı veriye asla yazılmaz). */
export function seedDemoCatalog(state) {
    const now = new Date().toISOString();
    const categories = [
        { id: randomUUID(), slug: 'ic-mekan', name: 'İç Mekan Bitkileri', description: null, sort_order: 0, is_active: true },
        { id: randomUUID(), slug: 'dis-mekan', name: 'Dış Mekan Bitkileri', description: null, sort_order: 1, is_active: true }
    ];
    const product = (category, slug, name, price, stock, extra = {}) => ({
        id: randomUUID(), slug, category_id: category.id, name, summary: `${name} için örnek açıklama.`, description: null,
        price, compare_at_price: null, stock, shippable: true, images: [], is_active: true, sort_order: 0,
        created_at: now, updated_at: now, ...extra
    });
    state.tables.categories.push(...categories.map(row => ({ ...row, created_at: now, updated_at: now })));
    state.tables.products.push(
        product(categories[0], 'ornek-monstera', 'Örnek Monstera', 45000, 12, { compare_at_price: 52000 }),
        product(categories[0], 'ornek-sukulent', 'Örnek Sukulent Seti', 18000, 2),
        product(categories[0], 'ornek-orkide', 'Örnek Orkide', 39000, 0),
        product(categories[1], 'ornek-zeytin', 'Örnek Zeytin Fidanı', 125000, 5, { shippable: false }),
        product(categories[1], 'ornek-lavanta', 'Örnek Lavanta', 9000, 40)
    );
}

export async function startFakeSupabase({ port = 0, onMail, demoCatalog = false } = {}) {
    const { state, handle } = createFakeState({ onMail });
    if (demoCatalog) seedDemoCatalog(state);
    const server = createServer((req, res) => {
        handle(req, res).catch(() => send(res, 500, { error_code: 'unexpected_failure' }));
    });
    await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
    return {
        url: `http://127.0.0.1:${server.address().port}`,
        mailbox: state.mailbox,
        users: state.users,
        state,
        close: () => new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve); })
    };
}
