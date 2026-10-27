import { test } from 'node:test';
import assert from 'node:assert/strict';

import { guardRequest, allowedOrigins, appendCookies } from '../api/_lib/http.js';
import { parseCookies, sessionCookies, clearedSessionCookies, requireUser, COOKIES } from '../api/_lib/session.js';
import { createRateLimiter, getClientIp } from '../api/contact.js';
import { mockRes, makeReq } from './helpers/http.js';

const ORIGINS = ['https://yesilege.com.tr'];
const SESSION = { access_token: 'yeni-at', refresh_token: 'yeni-rt', expires_in: 3600 };
const cookieOf = (list, name) => list.find(value => value.startsWith(name + '='));

test('parseCookies bozuk başlıkta çökmez ve geçersiz değerleri atar', () => {
    assert.deepEqual(parseCookies('=x; ye_at=; ye_at=%ZZ; a; ye_rt=abc'), { ye_rt: 'abc' });
    assert.deepEqual(parseCookies(undefined), {});
    assert.deepEqual(parseCookies('ye_at=1; ye_at=2'), { ye_at: '1' });
});

test('sessionCookies doğru bayraklarla üç çerez üretir', () => {
    const cookies = sessionCookies({ ...SESSION, expires_in: 7200 });
    const at = cookieOf(cookies, COOKIES.access);
    const rt = cookieOf(cookies, COOKIES.refresh);
    const hint = cookieOf(cookies, COOKIES.hint);
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/api', 'Max-Age=3600']) assert.ok(at.includes(flag), flag);
    assert.ok(rt.includes('HttpOnly') && rt.includes('Max-Age=2592000') && rt.includes('Path=/api'));
    assert.ok(hint.startsWith('ye_session=1;'));
    assert.ok(!hint.includes('HttpOnly'));
    assert.ok(hint.includes('Path=/;') || hint.endsWith('Path=/'));
    assert.ok(at.startsWith('ye_at=yeni-at;'));
});

test('clearedSessionCookies üç çerezi Max-Age=0 ile siler', () => {
    const cookies = clearedSessionCookies();
    assert.equal(cookies.length, 3);
    for (const cookie of cookies) assert.ok(cookie.includes('Max-Age=0'), cookie);
});

test('guardRequest yöntem, içerik türü, boyut ve kökeni denetler', () => {
    const run = (req) => { const res = mockRes(); const ok = guardRequest(req, res, { methods: ['POST'], origins: ORIGINS }); return { ok, res }; };

    let r = run(makeReq({ method: 'GET' }));
    assert.equal(r.ok, false); assert.equal(r.res.statusCode, 405); assert.equal(r.res.getHeader('Allow'), 'POST');

    r = run(makeReq({ headers: { 'content-type': 'text/plain' } }));
    assert.equal(r.res.statusCode, 415);

    r = run(makeReq({ body: { x: 'a'.repeat(10_001) } }));
    assert.equal(r.res.statusCode, 413);

    r = run(makeReq({ headers: { origin: 'https://kotu.example' } }));
    assert.equal(r.res.statusCode, 403);

    const noOrigin = makeReq();
    delete noOrigin.headers.origin;
    r = run(noOrigin);
    assert.equal(r.res.statusCode, 403);
    assert.equal(r.res.body.success, false);

    r = run(makeReq({ body: { a: 1 } }));
    assert.equal(r.ok, true);
});

test('GET istekleri Origin kontrolüne takılmaz', () => {
    const req = makeReq({ method: 'GET' });
    delete req.headers.origin;
    assert.equal(guardRequest(req, mockRes(), { methods: ['GET'], origins: ORIGINS }), true);
});

test('allowedOrigins site ve geliştirme kökenlerini normalize eder', () => {
    assert.deepEqual(
        allowedOrigins({ SITE_URL: 'https://yesilege.com.tr/', ALLOWED_DEV_ORIGINS: ' http://localhost:8090 ,' }),
        ['https://yesilege.com.tr', 'http://localhost:8090']
    );
});

test('appendCookies önceki Set-Cookie değerlerini korur', () => {
    const res = mockRes();
    appendCookies(res, ['a=1', 'b=2']);
    appendCookies(res, ['c=3', 'd=4']);
    assert.deepEqual(res.getHeader('Set-Cookie'), ['a=1', 'b=2', 'c=3', 'd=4']);
});

function fakeSupabase({ valid = ['iyi-token'], refreshOk = true } = {}) {
    const unauthorized = () => Object.assign(new Error('yetkisiz'), { status: 401 });
    return {
        auth: {
            async getUser(token) {
                if (valid.includes(token)) return { id: 'u1', email: 'a@b.test' };
                throw unauthorized();
            },
            async refresh(rt) {
                if (refreshOk && rt === 'iyi-rt') { valid.push(SESSION.access_token); return SESSION; }
                throw unauthorized();
            }
        }
    };
}

test('requireUser geçerli token ile kullanıcıyı döndürür', async () => {
    const res = mockRes();
    const result = await requireUser(makeReq({ headers: { cookie: 'ye_at=iyi-token' } }), res, fakeSupabase());
    assert.equal(result.user.id, 'u1');
    assert.equal(result.accessToken, 'iyi-token');
    assert.equal(res.getHeader('Set-Cookie'), undefined);
});

test('requireUser süresi dolmuş token için oturumu yeniler', async () => {
    const res = mockRes();
    const result = await requireUser(makeReq({ headers: { cookie: 'ye_at=eski; ye_rt=iyi-rt' } }), res, fakeSupabase());
    assert.equal(result.user.id, 'u1');
    assert.equal(result.accessToken, 'yeni-at');
    assert.ok(cookieOf(res.getHeader('Set-Cookie'), 'ye_at').startsWith('ye_at=yeni-at;'));
});

test('requireUser yenileme başarısızsa çerezleri siler ve 401 döner', async () => {
    const res = mockRes();
    const result = await requireUser(makeReq({ headers: { cookie: 'ye_at=eski; ye_rt=kotu' } }), res, fakeSupabase());
    assert.equal(result, null);
    assert.equal(res.statusCode, 401);
    assert.equal(res.getHeader('Set-Cookie').filter(c => c.includes('Max-Age=0')).length, 3);
});

test('requireUser çerez yokken 401 döner', async () => {
    const res = mockRes();
    assert.equal(await requireUser(makeReq(), res, fakeSupabase()), null);
    assert.equal(res.statusCode, 401);
});

test('requireUser Supabase erişilemezse 502 döner', async () => {
    const res = mockRes();
    const supabase = { auth: { async getUser() { throw Object.assign(new Error('ağ'), { status: 0 }); }, async refresh() { throw new Error(); } } };
    assert.equal(await requireUser(makeReq({ headers: { cookie: 'ye_at=x' } }), res, supabase), null);
    assert.equal(res.statusCode, 502);
});

test('sınırlayıcı ve IP yardımcıları contact.js üzerinden hâlâ dışa aktarılır', () => {
    assert.equal(typeof createRateLimiter, 'function');
    assert.equal(getClientIp({ headers: { 'x-vercel-forwarded-for': '1.2.3.4, 5.6.7.8' } }), '1.2.3.4');
});
