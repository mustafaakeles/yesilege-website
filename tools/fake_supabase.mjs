// Yerel geliştirme ve uçtan uca testler için bellek içi sahte Supabase (yalnızca bu projenin kullandığı alt küme).
// Gerçek Supabase davranışını taklit eder: doğrulanmamış giriş reddi, tek kullanımlık e-posta bağlantısı,
// refresh token rotasyonu, migration'daki kayıt tetikleyicisi kuralları ve rate_limit_hit.

import { createServer } from 'node:http';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';

export const FAKE_KEYS = Object.freeze({ anon: 'fake-anon-key', service: 'fake-service-key' });

const ACCESS_TTL_SECONDS = 3600;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 6238 TOTP (SHA-1, 30 sn, 6 hane); sahte Supabase ve uçtan uca testler ortak kullanır. */
export function totpCode(secret, time = Date.now()) {
    let bits = '';
    for (const char of secret.replace(/=+$/, '')) bits += BASE32.indexOf(char).toString(2).padStart(5, '0');
    const key = Buffer.from(bits.match(/.{8}/g).map(byte => parseInt(byte, 2)));
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
    const hmac = createHmac('sha1', key).update(counter).digest();
    const offset = hmac[hmac.length - 1] & 0xf;
    return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

// Gerçek Supabase gibi "aal" alanı taşıyan JWT biçimli erişim token'ı (imzasız; yalnızca yerel)
const jwtLike = (payload) => `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${randomBytes(12).toString('base64url')}`;
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

export function createFakeState({ onMail = () => {}, sql = null } = {}) {
    const state = {
        users: new Map(),          // e-posta → kullanıcı
        access: new Map(),         // erişim token'ı → { userId, exp }
        refresh: new Map(),        // refresh token'ı → userId
        otps: new Map(),           // token_hash → { userId, type }
        factors: new Map(),        // kullanıcı kimliği → [{ id, factor_type, status, secret }]
        challenges: new Map(),     // challenge id → factor id
        objects: new Map(),        // storage yolu → { buffer, contentType }
        mailbox: [],
        tables: {
            profiles: [], addresses: [], audit_log: [], categories: [], products: [], favorites: [],
            settings: structuredClone(DEFAULT_SETTINGS)
        },
        limits: new Map()
    };

    const userById = (id) => [...state.users.values()].find(user => user.id === id);
    const publicUser = (user) => ({
        id: user.id, email: user.email, email_confirmed_at: user.confirmedAt, user_metadata: {},
        factors: (state.factors.get(user.id) || []).map(({ id, factor_type, status }) => ({ id, factor_type, status }))
    });

    function mail(user, type) {
        const tokenHash = token();
        state.otps.set(tokenHash, { userId: user.id, type });
        const entry = { type, email: user.email, tokenHash };
        state.mailbox.push(entry);
        onMail(entry);
    }

    function issueSession(user, aal = 'aal1') {
        const accessToken = jwtLike({ sub: user.id, aal });
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
        async 'POST /auth/v1/signup'(body) {
            const email = String(body.email || '').toLowerCase();
            if (state.users.has(email)) return [200, { id: randomUUID(), email }]; // Supabase gibi gizlenmiş yanıt
            const meta = body.data || {};
            if (sql) {
                // Gerçek migration tetikleyicisi profili oluşturur ya da kaydı reddeder
                const user = { id: randomUUID(), email, password: body.password, confirmedAt: null };
                try {
                    await sql.db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)', [user.id, email, JSON.stringify(meta)]);
                } catch {
                    return [500, { error_code: 'unexpected_failure' }];
                }
                state.users.set(email, user);
                mail(user, 'email');
                return [200, publicUser(user)];
            }
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
        async 'POST /auth/v1/verify'(body) {
            const otp = state.otps.get(body.token_hash);
            if (!otp || otp.type !== body.type) return [403, { error_code: 'otp_expired' }];
            state.otps.delete(body.token_hash);
            const user = userById(otp.userId);
            if (otp.type === 'email') user.confirmedAt = new Date().toISOString();
            if (otp.type === 'email' && sql) await sql.db.query('update auth.users set email_confirmed_at = now() where id = $1', [user.id]);
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
        'POST /auth/v1/factors'(body, req) {
            const session = bearerUser(req);
            if (!session) return [401, { error_code: 'bad_jwt' }];
            const secret = Array.from(randomBytes(20), byte => BASE32[byte % 32]).join('');
            const factor = { id: randomUUID(), factor_type: 'totp', status: 'unverified', secret };
            state.factors.set(session.user.id, [...(state.factors.get(session.user.id) || []), factor]);
            const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#eee"/></svg>';
            return [200, { id: factor.id, type: 'totp', totp: { secret, qr_code: `data:image/svg+xml;utf-8,${encodeURIComponent(svg)}`, uri: `otpauth://totp/YesilEge?secret=${secret}` } }];
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

    function factorAction(req, factorId, action, body) {
        const session = bearerUser(req);
        if (!session) return [401, { error_code: 'bad_jwt' }];
        const list = state.factors.get(session.user.id) || [];
        const factor = list.find(item => item.id === factorId);
        if (!factor) return [404, { error_code: 'mfa_factor_not_found' }];
        if (action === 'delete' && req.method === 'DELETE') {
            state.factors.set(session.user.id, list.filter(item => item !== factor));
            return [200, { id: factor.id }];
        }
        if (action === 'challenge') {
            const id = randomUUID();
            state.challenges.set(id, factor.id);
            return [200, { id, type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 }];
        }
        if (action === 'verify') {
            if (state.challenges.get(body.challenge_id) !== factor.id) return [422, { error_code: 'mfa_challenge_expired' }];
            state.challenges.delete(body.challenge_id);
            const valid = [-30000, 0, 30000].some(skew => totpCode(factor.secret, Date.now() + skew) === String(body.code));
            if (!valid) return [422, { error_code: 'mfa_verification_failed' }];
            factor.status = 'verified';
            return [200, issueSession(session.user, 'aal2')];
        }
        return [405, {}];
    }

    async function storage(req, res, url) {
        if (req.headers.apikey !== FAKE_KEYS.service && !url.pathname.startsWith('/storage/v1/object/public/')) return send(res, 401, { message: 'Invalid API key' });
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const path = url.pathname.replace(/^\/storage\/v1\/object\/(?:public\/)?/, '');
        if (req.method === 'POST') {
            state.objects.set(path, { buffer: Buffer.concat(chunks), contentType: req.headers['content-type'] });
            return send(res, 200, { Key: path });
        }
        const object = state.objects.get(path);
        if (req.method === 'GET' && object) {
            res.writeHead(200, { 'content-type': object.contentType, 'access-control-allow-origin': '*' });
            return res.end(object.buffer);
        }
        return send(res, 404, { message: 'not found' });
    }

    async function handle(req, res) {
        const url = new URL(req.url, 'http://fake');
        if (url.pathname.startsWith('/storage/v1/')) return storage(req, res, url);
        let body;
        try {
            body = await readJson(req);
        } catch {
            return send(res, 400, { code: 'invalid_json' });
        }
        const key = `${req.method} ${url.pathname}`;
        if (url.pathname.startsWith('/auth/v1/')) {
            if (req.headers.apikey !== FAKE_KEYS.anon) return send(res, 401, { error_code: 'invalid_api_key' });
            const factorRoute = /^\/auth\/v1\/factors\/([^/]+)(?:\/(challenge|verify))?$/.exec(url.pathname);
            if (factorRoute) return send(res, ...factorAction(req, factorRoute[1], factorRoute[2] || 'delete', body));
            const route = auth[key];
            if (!route) return send(res, 404, { error_code: 'not_found' });
            const [status, payload] = await route(body, req, url);
            return send(res, status, payload);
        }
        if (url.pathname.startsWith('/rest/v1/')) {
            if (req.headers.apikey !== FAKE_KEYS.service) return send(res, 401, { message: 'Invalid API key' });
            if (sql) {
                const path = url.pathname.slice('/rest/v1/'.length);
                const [status, payload] = path.startsWith('rpc/') ? await sql.rpc(path.slice(4), body) : await sql.rest(req.method, path, url, body);
                return send(res, status, payload);
            }
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
        product(categories[0], 'ornek-monstera', 'Örnek Monstera', 45000, 12, { compare_at_price: 52000, images: ['images/chris-lee-70l1tDAI6rM-unsplash.webp'] }),
        product(categories[0], 'ornek-sukulent', 'Örnek Sukulent Seti', 18000, 2, { images: ['images/cactus_gen.webp'] }),
        product(categories[0], 'ornek-orkide', 'Örnek Orkide', 39000, 0, { images: ['images/orchid_care_blooming.webp'] }),
        product(categories[1], 'ornek-zeytin', 'Örnek Zeytin Fidanı', 125000, 5, { shippable: false, images: ['images/xeriscape_mediterranean_garden_olive.webp'] }),
        product(categories[1], 'ornek-siklamen', 'Örnek Sıklamen', 9000, 40, { images: ['images/winter_garden_flowers_cyclamen_primula.webp'] })
    );
}

/** SQL arka uçlu sahte Supabase için örnek katalog, banka bilgisi ve yönetici yok (yalnızca yerel). */
async function seedDemoCatalogSql(db) {
    const state = { tables: { categories: [], products: [] } };
    seedDemoCatalog(state);
    await db.query(`insert into public.categories (id, slug, name, sort_order, is_active)
        select id, slug, name, sort_order, is_active from json_populate_recordset(null::public.categories, $1::json)`, [JSON.stringify(state.tables.categories)]);
    await db.query(`insert into public.products (id, slug, category_id, name, summary, price, compare_at_price, stock, shippable, images, is_active, sort_order)
        select id, slug, category_id, name, summary, price, compare_at_price, stock, shippable, images, is_active, sort_order
        from json_populate_recordset(null::public.products, $1::json)`, [JSON.stringify(state.tables.products)]);
    await db.query(`update public.settings set value = value || '{"bank_name": "Örnek Banka", "account_holder": "Yeşil Ege (örnek)", "iban": "TR00 0000 0000 0000 0000 0000 00"}' where key = 'bank'`);
}

export async function startFakeSupabase({ port = 0, onMail, demoCatalog = false, sqlBackend = false } = {}) {
    let sql = null;
    if (sqlBackend) {
        const { createDatabase } = await import('./pglite_db.mjs');
        const { createSqlRest } = await import('./fake_sql_rest.mjs');
        const db = await createDatabase();
        sql = { db, ...createSqlRest(db) };
        if (demoCatalog) await seedDemoCatalogSql(db);
    }
    const { state, handle } = createFakeState({ onMail, sql });
    if (demoCatalog && !sql) seedDemoCatalog(state);
    const server = createServer((req, res) => {
        handle(req, res).catch(() => send(res, 500, { error_code: 'unexpected_failure' }));
    });
    await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
    return {
        url: `http://127.0.0.1:${server.address().port}`,
        mailbox: state.mailbox,
        users: state.users,
        state,
        sql,
        close: async () => {
            await new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve); });
            await sql?.db.close();
        }
    };
}
