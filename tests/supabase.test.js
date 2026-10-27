import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSupabase, readSupabaseConfig, SupabaseError, eq } from '../api/_lib/supabase.js';
import { limitKey, hitLimit, LIMITS } from '../api/_lib/ratelimit.js';
import { fakeFetch } from './helpers/http.js';

const URL_ = 'https://p.supabase.co';
const client = (routes) => {
    const fetchImpl = fakeFetch(routes);
    return { fetchImpl, supabase: createSupabase({ url: URL_, anonKey: 'anon-key', serviceKey: 'service-key', fetchImpl }) };
};

test('signIn şifre ile token uç noktasını anon anahtarla çağırır', async () => {
    const session = { access_token: 'at', refresh_token: 'rt', expires_in: 3600, user: { id: 'u1' } };
    const { fetchImpl, supabase } = client({ 'POST /auth/v1/token': { body: session } });
    assert.deepEqual(await supabase.auth.signIn({ email: 'a@b.test', password: 'pw' }), session);
    const [call] = fetchImpl.calls;
    assert.equal(call.url, `${URL_}/auth/v1/token?grant_type=password`);
    assert.equal(call.headers.apikey, 'anon-key');
    assert.deepEqual(call.body, { email: 'a@b.test', password: 'pw' });
});

test('getUser kullanıcı token\'ını Authorization başlığıyla gönderir', async () => {
    const { fetchImpl, supabase } = client({ 'GET /auth/v1/user': { body: { id: 'u1' } } });
    assert.deepEqual(await supabase.auth.getUser('tok'), { id: 'u1' });
    assert.equal(fetchImpl.calls[0].headers.authorization, 'Bearer tok');
    assert.equal(fetchImpl.calls[0].headers.apikey, 'anon-key');
});

test('auth yardımcıları doğru uç noktaları ve gövdeleri kullanır', async () => {
    const session = { access_token: 'at', refresh_token: 'rt2', expires_in: 3600 };
    const { fetchImpl, supabase } = client({
        'POST /auth/v1/signup': { body: { id: 'u1' } },
        'POST /auth/v1/token': { body: session },
        'POST /auth/v1/verify': { body: session },
        'POST /auth/v1/recover': { body: {} },
        'POST /auth/v1/resend': { body: {} },
        'POST /auth/v1/logout': { status: 204 },
        'PUT /auth/v1/user': { body: { id: 'u1' } }
    });
    await supabase.auth.signUp({ email: 'a@b.test', password: 'pw', data: { full_name: 'A' } });
    await supabase.auth.refresh('rt');
    await supabase.auth.verify({ tokenHash: 'h', type: 'email' });
    await supabase.auth.recover('a@b.test');
    await supabase.auth.resend('a@b.test');
    await supabase.auth.logout('at', 'others');
    await supabase.auth.updatePassword('at', 'yeni-sifre-1');
    const [signup, refresh, verify, recover, resend, logout, update] = fetchImpl.calls;
    assert.deepEqual(signup.body, { email: 'a@b.test', password: 'pw', data: { full_name: 'A' } });
    assert.equal(refresh.search, '?grant_type=refresh_token');
    assert.deepEqual(refresh.body, { refresh_token: 'rt' });
    assert.deepEqual(verify.body, { token_hash: 'h', type: 'email' });
    assert.deepEqual(recover.body, { email: 'a@b.test' });
    assert.deepEqual(resend.body, { type: 'signup', email: 'a@b.test' });
    assert.equal(logout.search, '?scope=others');
    assert.equal(logout.headers.authorization, 'Bearer at');
    assert.deepEqual(update.body, { password: 'yeni-sifre-1' });
});

test('db.select service anahtarını yalnızca apikey başlığında gönderir', async () => {
    const { fetchImpl, supabase } = client({ 'GET /rest/v1/profiles': { body: [{ id: 'x' }] } });
    assert.deepEqual(await supabase.db.select('profiles', 'id=' + eq('a b')), [{ id: 'x' }]);
    const [call] = fetchImpl.calls;
    assert.equal(call.url, `${URL_}/rest/v1/profiles?id=eq.a%20b`);
    assert.equal(call.headers.apikey, 'service-key');
    assert.equal('authorization' in call.headers, false);
});

test('db yazma işlemleri temsil döndürmesini ister', async () => {
    const { fetchImpl, supabase } = client({
        'POST /rest/v1/addresses': { status: 201, body: [{ id: '1' }] },
        'PATCH /rest/v1/addresses': { body: [] },
        'DELETE /rest/v1/addresses': { body: [{ id: '1' }] },
        'POST /rest/v1/rpc/rate_limit_hit': { body: true }
    });
    assert.deepEqual(await supabase.db.insert('addresses', { title: 'Ev' }), [{ id: '1' }]);
    assert.deepEqual(await supabase.db.update('addresses', 'id=eq.1', { title: 'İş' }), []);
    assert.deepEqual(await supabase.db.remove('addresses', 'id=eq.1'), [{ id: '1' }]);
    assert.equal(await supabase.db.rpc('rate_limit_hit', { p_key: 'k' }), true);
    for (const call of fetchImpl.calls.slice(0, 3)) assert.equal(call.headers.prefer, 'return=representation');
    assert.equal(fetchImpl.calls[1].method, 'PATCH');
});

test('2xx dışı yanıt sırları içermeyen SupabaseError fırlatır', async () => {
    const { supabase } = client({ 'POST /auth/v1/token': { status: 400, body: { error_code: 'invalid_credentials', msg: 'x' } } });
    await assert.rejects(supabase.auth.signIn({ email: 'a@b.test', password: 'gizli-sifre' }), (error) => {
        assert.ok(error instanceof SupabaseError);
        assert.equal(error.status, 400);
        assert.equal(error.code, 'invalid_credentials');
        for (const secret of ['gizli-sifre', 'anon-key', 'service-key']) assert.ok(!error.message.includes(secret));
        return true;
    });
});

test('ağ hatası veya zaman aşımı status 0 olarak bildirilir', async () => {
    const abort = Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' });
    const { supabase } = client({ 'GET /auth/v1/user': abort });
    await assert.rejects(supabase.auth.getUser('t'), (error) => error instanceof SupabaseError && error.status === 0);
});

test('readSupabaseConfig eksik değişkenleri listeler', () => {
    assert.deepEqual(readSupabaseConfig({}).missing.sort(),
        ['SITE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL']);
    const full = readSupabaseConfig({ SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's', SITE_URL: 'x' });
    assert.deepEqual(full.missing, []);
    assert.deepEqual(full.config, { url: 'u', anonKey: 'a', serviceKey: 's', siteUrl: 'x' });
});

test('limitKey ham e-postayı saklamaz', () => {
    const key = limitKey('loginEmail', 'ayse@example.test');
    assert.match(key, /^loginEmail:[0-9a-f]{64}$/);
    assert.ok(!key.includes('ayse'));
    assert.equal(key, limitKey('loginEmail', 'ayse@example.test'));
});

test('hitLimit RPC sonucunu döndürür', async () => {
    const { fetchImpl, supabase } = client({ 'POST /rest/v1/rpc/rate_limit_hit': { body: false } });
    assert.equal(await hitLimit(supabase, 'k', ...LIMITS.loginEmail), false);
    assert.deepEqual(fetchImpl.calls[0].body, { p_key: 'k', p_max: 5, p_window_seconds: 900 });
    assert.deepEqual(LIMITS, { registerIp: [5, 600], loginIp: [10, 600], loginEmail: [5, 900], recoverIp: [5, 900], recoverEmail: [3, 3600] });
});
