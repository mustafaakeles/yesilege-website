import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createHandler } from '../api/auth.js';
import { limitKey } from '../api/_lib/ratelimit.js';
import { fakeFetch, makeReq, mockRes } from './helpers/http.js';

const ENV = {
    SUPABASE_URL: 'https://p.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    SITE_URL: 'https://yesilege.com.tr'
};
const SESSION = { access_token: 'at-1', refresh_token: 'rt-1', expires_in: 3600, user: { id: 'u1' } };
const REGISTER = { fullName: 'Ayşe Yılmaz', email: 'ayse@example.test', password: 'guclu-sifre-123', kvkk: true };
const allow = { 'POST /rest/v1/rpc/rate_limit_hit': { body: true } };

async function call(action, { routes = {}, body = {}, method = 'POST', headers = {}, query = {}, env = ENV } = {}) {
    const fetchImpl = fakeFetch({ ...allow, ...routes });
    const res = mockRes();
    await createHandler({ env, fetchImpl })(makeReq({ method, body, headers, query: { action, ...query } }), res);
    return { res, calls: fetchImpl.calls };
}
const supabaseCalls = (calls, path) => calls.filter(c => c.path === path);

test('kayıtlı ve kayıtsız e-posta için kayıt yanıtı aynıdır', async () => {
    const fresh = await call('register', { body: REGISTER, routes: { 'POST /auth/v1/signup': { body: { id: 'u1' } } } });
    const taken = await call('register', { body: REGISTER, routes: { 'POST /auth/v1/signup': { status: 422, body: { error_code: 'user_already_exists' } } } });
    assert.equal(fresh.res.statusCode, 200);
    assert.equal(JSON.stringify(fresh.res.body), JSON.stringify(taken.res.body));
    assert.equal(fresh.res.statusCode, taken.res.statusCode);
    assert.equal(fresh.res.body.message, 'Doğrulama e-postası gönderildi. Lütfen gelen kutunuzu kontrol edin.');
});

test('kayıt meta verisinde rol bulunmaz, KVKK onayı bulunur', async () => {
    const { calls } = await call('register', { body: { ...REGISTER, role: 'admin', marketing: true }, routes: { 'POST /auth/v1/signup': { body: {} } } });
    const [signup] = supabaseCalls(calls, '/auth/v1/signup');
    assert.deepEqual(signup.body.data, { full_name: 'Ayşe Yılmaz', phone: null, kvkk: 'true', marketing: 'true' });
});

test('bal küpü doluyken Supabase çağrılmaz', async () => {
    const { res, calls } = await call('register', { body: { ...REGISTER, 'bot-field': 'x' } });
    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 0);
});

test('geçersiz kayıt 400 döner', async () => {
    const { res } = await call('register', { body: { ...REGISTER, kvkk: false } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Devam etmek için KVKK aydınlatma metnini onaylayın.');
});

test('başarılı giriş üç oturum çerezi yazar', async () => {
    const { res } = await call('login', { body: { email: 'ayse@example.test', password: 'pw' }, routes: { 'POST /auth/v1/token': { body: SESSION } } });
    assert.equal(res.statusCode, 200);
    const cookies = res.getHeader('Set-Cookie');
    assert.equal(cookies.length, 3);
    assert.ok(cookies[0].startsWith('ye_at=at-1;'));
});

test('yanlış şifre ve doğrulanmamış e-posta aynı 401 mesajını verir', async () => {
    const wrong = await call('login', { body: { email: 'a@b.test', password: 'x' }, routes: { 'POST /auth/v1/token': { status: 400, body: { error_code: 'invalid_credentials' } } } });
    const unconfirmed = await call('login', { body: { email: 'a@b.test', password: 'x' }, routes: { 'POST /auth/v1/token': { status: 400, body: { error_code: 'email_not_confirmed' } } } });
    assert.equal(wrong.res.statusCode, 401);
    assert.deepEqual(wrong.res.body, unconfirmed.res.body);
    assert.equal(wrong.res.body.error, 'E-posta veya şifre hatalı ya da e-posta adresi henüz doğrulanmadı.');
});

test('büyük harfli e-posta aynı oran sınırı anahtarını kullanır', async () => {
    const routes = { 'POST /auth/v1/token': { body: SESSION } };
    const upper = await call('login', { body: { email: 'Ayse@Example.TEST', password: 'pw' }, routes });
    const lower = await call('login', { body: { email: 'ayse@example.test', password: 'pw' }, routes });
    const emailKey = (calls) => supabaseCalls(calls, '/rest/v1/rpc/rate_limit_hit').map(c => c.body.p_key).find(k => k.startsWith('loginEmail:'));
    assert.equal(emailKey(upper.calls), limitKey('loginEmail', 'ayse@example.test'));
    assert.equal(emailKey(upper.calls), emailKey(lower.calls));
});

test('oran sınırı aşılınca 429 döner ve giriş denenmez', async () => {
    const { res, calls } = await call('login', {
        body: { email: 'a@b.test', password: 'pw' },
        routes: { 'POST /rest/v1/rpc/rate_limit_hit': { body: false } }
    });
    assert.equal(res.statusCode, 429);
    assert.ok(Number(res.getHeader('Retry-After')) > 0);
    assert.equal(supabaseCalls(calls, '/auth/v1/token').length, 0);
});

test('Origin olmayan POST 403 döner ve Supabase çağrılmaz', async () => {
    const fetchImpl = fakeFetch(allow);
    const res = mockRes();
    const req = makeReq({ body: REGISTER, query: { action: 'register' } });
    delete req.headers.origin;
    await createHandler({ env: ENV, fetchImpl })(req, res);
    assert.equal(res.statusCode, 403);
    assert.equal(fetchImpl.calls.length, 0);
});

test('geçerli doğrulama bağlantısı oturum açar ve Hesabım sayfasına yönlendirir', async () => {
    const { res, calls } = await call('confirm', { method: 'GET', query: { token_hash: 'abc_DEF-123', type: 'email' }, routes: { 'POST /auth/v1/verify': { body: SESSION } } });
    assert.equal(res.statusCode, 303);
    assert.equal(res.getHeader('Location'), '/hesabim.html?dogrulandi=1');
    assert.equal(res.getHeader('Set-Cookie').length, 3);
    assert.deepEqual(supabaseCalls(calls, '/auth/v1/verify')[0].body, { token_hash: 'abc_DEF-123', type: 'email' });
});

test('şifre sıfırlama bağlantısı yeni şifre adımına yönlendirir', async () => {
    const { res } = await call('confirm', { method: 'GET', query: { token_hash: 'abc', type: 'recovery' }, routes: { 'POST /auth/v1/verify': { body: SESSION } } });
    assert.equal(res.getHeader('Location'), '/sifre-sifirla.html?adim=yeni');
});

test('kullanılmış veya süresi dolmuş bağlantı giriş sayfasına yönlendirir', async () => {
    const { res } = await call('confirm', { method: 'GET', query: { token_hash: 'abc', type: 'email' }, routes: { 'POST /auth/v1/verify': { status: 403, body: { error_code: 'otp_expired' } } } });
    assert.equal(res.statusCode, 303);
    assert.equal(res.getHeader('Location'), '/giris.html?hata=baglanti');
    assert.equal(res.getHeader('Set-Cookie'), undefined);
});

test('biçimsiz doğrulama parametreleri Supabase çağrılmadan reddedilir', async () => {
    for (const query of [{ token_hash: '<x>', type: 'email' }, { token_hash: 'abc', type: 'signup' }, { type: 'email' }]) {
        const { res, calls } = await call('confirm', { method: 'GET', query });
        assert.equal(res.getHeader('Location'), '/giris.html?hata=baglanti');
        assert.equal(calls.length, 0);
    }
});

test('şifre sıfırlama isteği Supabase hatasında bile aynı yanıtı verir', async () => {
    const network = Object.assign(new Error('ağ'), { name: 'TypeError' });
    const failed = await call('recover', { body: { email: 'a@b.test' }, routes: { 'POST /auth/v1/recover': network } });
    const ok = await call('recover', { body: { email: 'a@b.test' }, routes: { 'POST /auth/v1/recover': { body: {} } } });
    assert.equal(failed.res.statusCode, 200);
    assert.deepEqual(failed.res.body, ok.res.body);
});

test('yeniden gönderme kendi oran sınırı anahtarlarını kullanır', async () => {
    const { res, calls } = await call('resend', { body: { email: 'a@b.test' }, routes: { 'POST /auth/v1/resend': { body: {} } } });
    assert.equal(res.statusCode, 200);
    const keys = supabaseCalls(calls, '/rest/v1/rpc/rate_limit_hit').map(c => c.body.p_key.split(':')[0]);
    assert.deepEqual(keys.sort(), ['resendEmail', 'resendIp']);
});

test('şifre güncelleme oturum gerektirir', async () => {
    const { res } = await call('update-password', { body: { password: 'yeni-sifre-123' } });
    assert.equal(res.statusCode, 401);
});

test('şifre güncellenince diğer oturumlar kapatılır', async () => {
    const { res, calls } = await call('update-password', {
        body: { password: 'yeni-sifre-123' },
        headers: { cookie: 'ye_at=at-1' },
        routes: {
            'GET /auth/v1/user': { body: { id: 'u1', email: 'a@b.test' } },
            'PUT /auth/v1/user': { body: { id: 'u1' } },
            'POST /auth/v1/logout': { status: 204 }
        }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(supabaseCalls(calls, '/auth/v1/logout')[0].search, '?scope=others');
});

test('aynı şifre kullanılamaz mesajı', async () => {
    const { res } = await call('update-password', {
        body: { password: 'yeni-sifre-123' },
        headers: { cookie: 'ye_at=at-1' },
        routes: { 'GET /auth/v1/user': { body: { id: 'u1' } }, 'PUT /auth/v1/user': { status: 422, body: { error_code: 'same_password' } } }
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Bu şifre kullanılamıyor. Lütfen farklı bir şifre seçin.');
});

test('çıkış Supabase hatasında bile çerezleri siler', async () => {
    const { res } = await call('logout', { headers: { cookie: 'ye_at=at-1' }, routes: { 'POST /auth/v1/logout': { status: 500, body: {} } } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.getHeader('Set-Cookie').filter(c => c.includes('Max-Age=0')).length, 3);
});

test('Supabase zaman aşımında 502 döner ve ayrıntı sızdırmaz', async () => {
    const timeout = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    const { res } = await call('login', { body: { email: 'a@b.test', password: 'pw' }, routes: { 'POST /auth/v1/token': timeout } });
    assert.equal(res.statusCode, 502);
    const text = JSON.stringify(res.body).toLowerCase();
    for (const secret of ['supabase', 'anon-key', 'service-key', 'p.supabase.co']) assert.ok(!text.includes(secret), secret);
});

test('yapılandırma eksikse 503 döner', async () => {
    const { res } = await call('login', { body: { email: 'a@b.test', password: 'pw' }, env: { SITE_URL: ENV.SITE_URL } });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'Üyelik sistemi şu anda kullanılamıyor.');
});

test('bilinmeyen işlem 404 döner', async () => {
    const { res } = await call('hack');
    assert.equal(res.statusCode, 404);
});
