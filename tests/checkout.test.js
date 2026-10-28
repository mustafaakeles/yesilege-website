import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cartItems, createHandler } from '../api/checkout.js';
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
const P1 = '44444444-4444-4444-8444-444444444444';
const ADDR = '66666666-6666-4666-8666-666666666666';
const ORDER_ID = '77777777-7777-4777-8777-777777777777';
const USER = { id: UID, email: 'ayse@example.test', email_confirmed_at: '2026-10-27T10:00:00Z' };
const SETTINGS = [
    { key: 'shipping', value: { fee: 15000, free_threshold: 200000 } },
    { key: 'bank', value: { bank_name: 'Test Bankası', account_holder: 'Yeşil Ege', iban: 'TR00 0000' } },
    { key: 'store', value: { pickup_address: 'Bayındır', pickup_hours: '09-18' } },
    { key: 'loyalty', value: { points_per_unit: 100, unit_value: 500, max_ratio: 0.3 } }
];
const ORDER_ROW = {
    id: ORDER_ID, code: 'ABCD2345', user_id: UID, status: 'awaiting_payment', payment_method: 'bank_transfer', delivery_method: 'cargo',
    ship_date: '2026-10-31', shipping_address: { city: 'İzmir' }, note: null, subtotal: 45000, shipping_fee: 15000, discount: 0,
    points_used: 0, total: 60000, created_at: '2026-10-28T10:00:00Z'
};
const QUOTE = { lines: [], subtotal: 45000, shipping_fee: 15000, free_threshold: 200000, discount: 0, points: 0, available_points: 0, max_points: 0, total: 60000, ship_date: '2026-10-31', errors: [] };
const base = {
    'GET /auth/v1/user': { body: USER },
    'POST /rest/v1/rpc/rate_limit_hit': { body: true },
    'GET /rest/v1/settings': { body: SETTINGS },
    'GET /rest/v1/profiles': { body: [{ full_name: 'Ayşe Yılmaz', phone: null }] },
    'POST /rest/v1/audit_log': { status: 201, body: [{}] },
    'GET /rest/v1/order_items': { body: [{ order_id: ORDER_ID, name: 'Monstera', unit_price: 45000, qty: 1, line_total: 45000 }] },
    'GET /rest/v1/order_events': { body: [{ status: 'awaiting_payment', created_at: '2026-10-28T10:00:00Z' }] },
    'GET /rest/v1/orders': { body: [ORDER_ROW] }
};
const validPlace = { items: [{ id: P1, qty: 1 }], delivery: 'cargo', payment: 'bank_transfer', addressId: ADDR, accept: true };

async function call(action, { routes = {}, body = {}, method = 'POST', query = {}, cookie = 'ye_at=at-1' } = {}) {
    const fetchImpl = fakeFetch({ ...base, ...routes });
    const res = mockRes();
    const sent = [];
    await createHandler({ env: ENV, fetchImpl, sendEmailImpl: async (config, email) => { sent.push({ config, email }); } })(
        makeReq({ method, body, headers: cookie ? { cookie } : {}, query: { action, ...query } }), res);
    return { res, calls: fetchImpl.calls, sent };
}
const rpcCalls = (calls, fn) => calls.filter(c => c.path === `/rest/v1/rpc/${fn}`);

test('sepet satırları yalnızca kimlik ve adet olarak okunur', () => {
    assert.deepEqual(cartItems([{ id: P1, qty: 2, price: 1, unitPrice: 1 }]), [{ product_id: P1, qty: 2 }]);
    for (const bad of [[], null, [{ id: P1, qty: 0 }], [{ id: P1, qty: 100 }], [{ id: P1, qty: 1.5 }], [{ id: 'x', qty: 1 }], Array(31).fill({ id: P1, qty: 1 })]) {
        assert.equal(cartItems(bad), null);
    }
});

test('fiyat teklifi istemcinin tutar alanlarını veritabanına iletmez', async () => {
    const { res, calls } = await call('quote', {
        cookie: '', body: { items: [{ id: P1, qty: 2, price: 1 }], delivery: 'pickup', total: 1 },
        routes: { 'POST /rest/v1/rpc/quote_order': { body: QUOTE } }
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(rpcCalls(calls, 'quote_order')[0].body, { p_user: null, p_items: [{ product_id: P1, qty: 2 }], p_delivery: 'pickup', p_points: 0 });
    assert.equal(res.body.quote.total, 60000);
});

test('oturumsuz puan kullanımı 401', async () => {
    const { res } = await call('quote', { cookie: '', body: { items: [{ id: P1, qty: 1 }], delivery: 'pickup', points: 100 } });
    assert.equal(res.statusCode, 401);
});

test('sipariş oturum, sözleşme onayı ve doğrulanmış e-posta ister', async () => {
    assert.equal((await call('place', { cookie: '', body: validPlace })).res.statusCode, 401);
    assert.equal((await call('place', { body: { ...validPlace, accept: false } })).res.statusCode, 400);
    const unverified = await call('place', { body: validPlace, routes: { 'GET /auth/v1/user': { body: { ...USER, email_confirmed_at: null } } } });
    assert.equal(unverified.res.statusCode, 403);
});

test('kargo adresi kullanıcıya ait olmalıdır', async () => {
    const { res, calls } = await call('place', { body: validPlace, routes: { 'GET /rest/v1/addresses': { body: [] } } });
    assert.equal(res.statusCode, 404);
    assert.match(calls.find(c => c.path === '/rest/v1/addresses').search, new RegExp(`id=eq\\.${ADDR}&user_id=eq\\.${UID}`));
    assert.equal(rpcCalls(calls, 'place_order').length, 0);
});

test('başarılı sipariş: kimlik oturumdan, adres anlık kopya, müşteri ve işletmeye e-posta, havale bilgisi', async () => {
    const { res, calls, sent } = await call('place', {
        body: { ...validPlace, userId: 'baskasi', total: 1 },
        routes: {
            'GET /rest/v1/addresses': { body: [{ id: ADDR, user_id: UID, title: 'Ev', recipient_name: 'Ayşe', phone: '0532', city: 'İzmir', district: 'Bayındır', neighbourhood: 'Merkez', line: 'Sk. 1', postal_code: null }] },
            'POST /rest/v1/rpc/place_order': { body: { id: ORDER_ID, code: 'ABCD2345', total: 60000 } }
        }
    });
    assert.equal(res.statusCode, 200);
    const args = rpcCalls(calls, 'place_order')[0].body;
    assert.equal(args.p_user, UID);
    assert.equal(args.p_address.city, 'İzmir');
    assert.equal('total' in args, false);
    assert.equal(args.p_contact.email, 'ayse@example.test');
    assert.equal(res.body.order.code, 'ABCD2345');
    assert.equal(res.body.bank.iban, 'TR00 0000');
    assert.deepEqual(sent.map(s => s.config.to).sort(), ['ayse@example.test', 'isletme@x.test']);
    assert.match(sent.find(s => s.config.to === 'ayse@example.test').email.text, /TR00 0000/);
});

test('veritabanı iş kuralı hataları Türkçe mesaja çevrilir', async () => {
    const { res } = await call('place', {
        body: { ...validPlace, delivery: 'pickup', payment: 'pay_at_store' },
        routes: { 'POST /rest/v1/rpc/place_order': { status: 400, body: { code: 'P0001', message: 'out_of_stock' } } }
    });
    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /stoğu yetersiz/);
});

test('beklenmeyen veritabanı hatası iç ayrıntı sızdırmaz', async () => {
    const { res } = await call('place', {
        body: { ...validPlace, delivery: 'pickup', payment: 'pay_at_store' },
        routes: { 'POST /rest/v1/rpc/place_order': { status: 500, body: { code: 'XX000', message: 'relation secret does not exist' } } }
    });
    assert.equal(res.statusCode, 502);
    assert.doesNotMatch(JSON.stringify(res.body), /secret/);
});

test('sipariş ayrıntısı ve iptal yalnızca kullanıcının kendi siparişinde çalışır', async () => {
    const detail = await call('order', { method: 'GET', query: { code: 'abcd2345' } });
    assert.equal(detail.res.statusCode, 200);
    assert.match(detail.calls.find(c => c.path === '/rest/v1/orders').search, new RegExp(`code=eq\\.ABCD2345&user_id=eq\\.${UID}`));
    assert.equal(detail.res.body.bank.iban, 'TR00 0000');

    const missing = await call('cancel', { body: { code: 'ZZZZ2345' }, routes: { 'GET /rest/v1/orders': { body: [] } } });
    assert.equal(missing.res.statusCode, 404);

    const late = await call('cancel', {
        body: { code: 'ABCD2345' },
        routes: { 'POST /rest/v1/rpc/cancel_order': { status: 400, body: { code: 'P0001', message: 'cannot_cancel' } } }
    });
    assert.equal(late.res.statusCode, 409);
    assert.deepEqual(rpcCalls(late.calls, 'cancel_order')[0].body.p_admin, false);
});
