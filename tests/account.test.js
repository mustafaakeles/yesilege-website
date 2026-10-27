import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createHandler } from '../api/account.js';
import { fakeFetch, makeReq, mockRes } from './helpers/http.js';

const ENV = {
    SUPABASE_URL: 'https://p.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    SITE_URL: 'https://yesilege.com.tr',
    RESEND_API_KEY: 'resend-key',
    CONTACT_TO_EMAIL: 'isletme@x.test',
    CONTACT_FROM_EMAIL: 'Site <form@x.test>'
};
const UID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const USER = { id: UID, email: 'ayse@example.test', email_confirmed_at: '2026-10-27T10:00:00Z' };
const PROFILE = { id: UID, full_name: 'Ayşe Yılmaz', phone: null, role: 'customer', marketing_consent: false };
const ADDRESS = {
    title: 'Ev', recipientName: 'Ayşe Yılmaz', phone: '0532 000 00 00', city: 'İzmir',
    district: 'Bayındır', neighbourhood: 'Karaveliler', line: 'Kazım Dirik Cd. No: 225', postalCode: '35847'
};
const authed = {
    'GET /auth/v1/user': { body: USER },
    'POST /rest/v1/rpc/rate_limit_hit': { body: true }
};

async function call(action, { routes = {}, body = {}, method = 'POST', cookie = 'ye_at=at-1', sendEmailImpl } = {}) {
    const fetchImpl = fakeFetch({ ...authed, ...routes });
    const res = mockRes();
    const sent = [];
    const send = sendEmailImpl || (async (config, email) => { sent.push({ config, email }); });
    await createHandler({ env: ENV, fetchImpl, sendEmailImpl: send })(
        makeReq({ method, body, headers: cookie ? { cookie } : {}, query: { action } }), res);
    return { res, calls: fetchImpl.calls, sent };
}
const restCalls = (calls, method, table) => calls.filter(c => c.method === method && c.path === `/rest/v1/${table}`);

test('oturum yokken her işlem 401 döner', async () => {
    for (const [action, method] of [['me', 'GET'], ['addresses', 'GET'], ['update-profile', 'POST'], ['address-save', 'POST'], ['delete-request', 'POST']]) {
        const { res } = await call(action, { method, cookie: '' });
        assert.equal(res.statusCode, 401, action);
    }
});

test('me profil alanlarını döndürür', async () => {
    const { res, calls } = await call('me', { method: 'GET', routes: { 'GET /rest/v1/profiles': { body: [PROFILE] } } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.user, {
        email: 'ayse@example.test', emailVerified: true, fullName: 'Ayşe Yılmaz', phone: null, marketingConsent: false, role: 'customer'
    });
    assert.match(restCalls(calls, 'GET', 'profiles')[0].search, new RegExp(`id=eq\\.${UID}`));
});

test('doğrulanmamış e-posta emailVerified false döner', async () => {
    const { res } = await call('me', { method: 'GET', routes: { 'GET /auth/v1/user': { body: { ...USER, email_confirmed_at: null } }, 'GET /rest/v1/profiles': { body: [PROFILE] } } });
    assert.equal(res.body.user.emailVerified, false);
});

test('süresi dolmuş erişim token\'ı yenilenerek me çalışır', async () => {
    const { res } = await call('me', {
        method: 'GET',
        cookie: 'ye_at=eski; ye_rt=rt-1',
        routes: {
            'GET /auth/v1/user': (c) => c.headers.authorization === 'Bearer yeni' ? { body: USER } : { status: 401, body: {} },
            'POST /auth/v1/token': { body: { access_token: 'yeni', refresh_token: 'rt-2', expires_in: 3600 } },
            'GET /rest/v1/profiles': { body: [PROFILE] }
        }
    });
    assert.equal(res.statusCode, 200);
    assert.ok(res.getHeader('Set-Cookie').some(c => c.startsWith('ye_at=yeni;')));
});

test('profil güncellemesine rol geçmez', async () => {
    const { res, calls } = await call('update-profile', { body: { fullName: 'Ayşe Kaya', phone: '', role: 'admin' }, routes: { 'PATCH /rest/v1/profiles': { body: [PROFILE] } } });
    assert.equal(res.statusCode, 200);
    const [patch] = restCalls(calls, 'PATCH', 'profiles');
    assert.deepEqual(patch.body, { full_name: 'Ayşe Kaya', phone: null });
    assert.match(patch.search, new RegExp(`id=eq\\.${UID}`));
});

test('izin güncellemesi zaman damgası yazar', async () => {
    const { calls } = await call('consent', { body: { marketing: true }, routes: { 'PATCH /rest/v1/profiles': { body: [PROFILE] } } });
    const [patch] = restCalls(calls, 'PATCH', 'profiles');
    assert.equal(patch.body.marketing_consent, true);
    assert.ok(Date.parse(patch.body.marketing_consent_at));
    const off = await call('consent', { body: { marketing: false }, routes: { 'PATCH /rest/v1/profiles': { body: [PROFILE] } } });
    assert.equal(restCalls(off.calls, 'PATCH', 'profiles')[0].body.marketing_consent_at, null);
});

test('adres listesi kullanıcıyla sınırlanır ve camelCase döner', async () => {
    const row = { id: 'a1', user_id: UID, title: 'Ev', recipient_name: 'A', phone: '1', city: 'İzmir', district: 'B', neighbourhood: 'K', line: 'L', postal_code: null, is_default: true };
    const { res, calls } = await call('addresses', { method: 'GET', routes: { 'GET /rest/v1/addresses': { body: [row] } } });
    assert.match(restCalls(calls, 'GET', 'addresses')[0].search, new RegExp(`user_id=eq\\.${UID}`));
    assert.deepEqual(res.body.addresses[0], {
        id: 'a1', title: 'Ev', recipientName: 'A', phone: '1', city: 'İzmir', district: 'B', neighbourhood: 'K', line: 'L', postalCode: null, isDefault: true
    });
});

test('başka kullanıcının adresini güncelleme denemesi 404 döner', async () => {
    const { res, calls } = await call('address-save', { body: { ...ADDRESS, id: OTHER }, routes: { 'PATCH /rest/v1/addresses': { body: [] } } });
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.error, 'Adres bulunamadı.');
    const [patch] = restCalls(calls, 'PATCH', 'addresses');
    assert.match(patch.search, new RegExp(`id=eq\\.${OTHER}`));
    assert.match(patch.search, new RegExp(`user_id=eq\\.${UID}`));
});

test('başka kullanıcının adresini silme denemesi 404 döner', async () => {
    const { res, calls } = await call('address-delete', { body: { id: OTHER }, routes: { 'DELETE /rest/v1/addresses': { body: [] } } });
    assert.equal(res.statusCode, 404);
    assert.match(restCalls(calls, 'DELETE', 'addresses')[0].search, new RegExp(`user_id=eq\\.${UID}`));
});

test('istemciden gelen user_id yazmaya geçmez', async () => {
    const { calls } = await call('address-save', {
        body: { ...ADDRESS, user_id: OTHER, userId: OTHER },
        routes: { 'GET /rest/v1/addresses': { body: [] }, 'POST /rest/v1/addresses': { status: 201, body: [{ id: 'a1' }] } }
    });
    const [insert] = restCalls(calls, 'POST', 'addresses');
    assert.equal(insert.body.user_id, UID);
    assert.equal('userId' in insert.body, false);
});

test('10 adres sınırında yeni adres reddedilir', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ id: String(i) }));
    const { res, calls } = await call('address-save', { body: ADDRESS, routes: { 'GET /rest/v1/addresses': { body: ten } } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'En fazla 10 adres kaydedebilirsiniz.');
    assert.equal(restCalls(calls, 'POST', 'addresses').length, 0);
});

test('varsayılan adres kaydında önce eski varsayılan kaldırılır', async () => {
    const { res, calls } = await call('address-save', {
        body: { ...ADDRESS, isDefault: true },
        routes: { 'GET /rest/v1/addresses': { body: [] }, 'PATCH /rest/v1/addresses': { body: [] }, 'POST /rest/v1/addresses': { status: 201, body: [{ id: 'a1' }] } }
    });
    assert.equal(res.statusCode, 200);
    const writes = calls.filter(c => c.path === '/rest/v1/addresses' && c.method !== 'GET');
    assert.deepEqual(writes.map(c => c.method), ['PATCH', 'POST']);
    assert.deepEqual(writes[0].body, { is_default: false });
    assert.match(writes[0].search, /is_default=eq\.true/);
});

test('silme talebi yanlış şifrede kaydedilmez', async () => {
    const { res, calls } = await call('delete-request', { body: { password: 'yanlis' }, routes: { 'POST /auth/v1/token': { status: 400, body: {} } } });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Şifre hatalı.');
    assert.equal(restCalls(calls, 'PATCH', 'profiles').length, 0);
});

test('silme talebi denetim kaydı yazar ve e-posta hatasında da başarılı olur', async () => {
    const { res, calls } = await call('delete-request', {
        body: { password: 'dogru-sifre' },
        routes: {
            'POST /auth/v1/token': { body: { access_token: 'x', refresh_token: 'y', expires_in: 3600 } },
            'PATCH /rest/v1/profiles': { body: [PROFILE] },
            'POST /rest/v1/audit_log': { status: 201, body: [{}] }
        },
        sendEmailImpl: async () => { throw new Error('resend kapalı'); }
    });
    assert.equal(res.statusCode, 200);
    assert.ok(restCalls(calls, 'PATCH', 'profiles')[0].body.deletion_requested_at);
    const [audit] = restCalls(calls, 'POST', 'audit_log');
    assert.equal(audit.body.action, 'account.delete_request');
    assert.equal(audit.body.actor_id, UID);
    assert.equal(res.getHeader('Set-Cookie'), undefined);
});

test('silme talebi işletmeye şifre içermeyen bir e-posta gönderir', async () => {
    const { sent } = await call('delete-request', {
        body: { password: 'dogru-sifre' },
        routes: {
            'POST /auth/v1/token': { body: { access_token: 'x', refresh_token: 'y', expires_in: 3600 } },
            'PATCH /rest/v1/profiles': { body: [PROFILE] },
            'POST /rest/v1/audit_log': { status: 201, body: [{}] }
        }
    });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].config.to, 'isletme@x.test');
    assert.ok(!JSON.stringify(sent[0].email).includes('dogru-sifre'));
});
