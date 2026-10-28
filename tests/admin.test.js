import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createHandler, qrImage, tokenAal } from '../api/admin.js';
import { validateSettings, decodeImage } from '../api/_lib/admin-validate.js';
import { fakeFetch, makeReq, mockRes } from './helpers/http.js';

const ENV = {
    SUPABASE_URL: 'https://p.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    SITE_URL: 'https://yesilege.com.tr',
    RESEND_API_KEY: 'resend-key',
    CONTACT_FROM_EMAIL: 'Site <form@x.test>'
};
const UID = '11111111-1111-4111-8111-111111111111';
const P1 = '44444444-4444-4444-8444-444444444444';
const FACTOR = '88888888-8888-4888-8888-888888888888';
const ORDER_ID = '77777777-7777-4777-8777-777777777777';
const jwt = (payload) => `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
const AAL1 = jwt({ sub: UID, aal: 'aal1' });
const AAL2 = jwt({ sub: UID, aal: 'aal2' });
const USER = { id: UID, email: 'yonetici@example.test', email_confirmed_at: '2026-10-27T10:00:00Z', factors: [{ id: FACTOR, factor_type: 'totp', status: 'verified' }] };
const ORDER_ROW = {
    id: ORDER_ID, code: 'ABCD2345', user_id: 'x', status: 'paid', payment_method: 'bank_transfer', delivery_method: 'cargo',
    ship_date: '2026-10-31', shipping_address: { city: 'İzmir' }, contact: { email: 'musteri@example.test' }, subtotal: 45000,
    shipping_fee: 0, discount: 0, points_used: 0, total: 45000, created_at: '2026-10-28T10:00:00Z'
};
const base = (role = 'admin') => ({
    'GET /auth/v1/user': { body: USER },
    'GET /rest/v1/profiles': { body: [{ role, full_name: 'Yönetici' }] },
    'POST /rest/v1/audit_log': { status: 201, body: [{}] },
    'POST /rest/v1/rpc/rate_limit_hit': { body: true }
});

async function call(action, { routes = {}, body = {}, method = 'POST', query = {}, token = AAL2, role = 'admin' } = {}) {
    const inner = fakeFetch({ ...base(role), ...routes });
    // Storage yükleme yolu rastgele dosya adı içerir: rota anahtarı için klasör yoluna indirgenir
    const fetchImpl = (url, init) => inner(String(url).replace(/(\/storage\/v1\/object\/products\/[^/]+)\/[^/?]+/, '$1/DOSYA'), init);
    fetchImpl.calls = inner.calls;
    const res = mockRes();
    const sent = [];
    await createHandler({ env: ENV, fetchImpl, sendEmailImpl: async (config, email) => { sent.push({ config, email }); } })(
        makeReq({ method, body, headers: token ? { cookie: `ye_at=${token}` } : {}, query: { action, ...query } }), res);
    return { res, calls: fetchImpl.calls, sent };
}

test('tokenAal yalnızca aal2 yükünü kabul eder', () => {
    assert.equal(tokenAal(AAL2), 'aal2');
    assert.equal(tokenAal(AAL1), 'aal1');
    assert.equal(tokenAal('bozuk'), 'aal1');
});

test('QR kodu ham SVG veya önekli SVG olsa da açılabilir base64 veri adresine çevrilir', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:#000000"/></svg>';
    const expected = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    assert.equal(qrImage(svg), expected);
    assert.equal(qrImage(`data:image/svg+xml;utf-8,${svg}`), expected);
    assert.equal(qrImage(`data:image/svg+xml;utf-8,${encodeURIComponent(svg)}`), expected);
    assert.equal(qrImage('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
    assert.equal(qrImage(undefined), null);

    const enrolled = await call('mfa-enroll', {
        token: AAL1,
        routes: {
            'GET /auth/v1/user': { body: { ...USER, factors: [] } },
            'POST /auth/v1/factors': { body: { id: FACTOR, totp: { qr_code: svg, secret: 'ABC' } } }
        }
    });
    assert.equal(enrolled.res.statusCode, 200);
    assert.equal(enrolled.res.body.qr, expected);
});

test('oturumsuz 401, müşteri rolü 403', async () => {
    assert.equal((await call('dashboard', { method: 'GET', token: '' })).res.statusCode, 401);
    const customer = await call('dashboard', { method: 'GET', role: 'customer' });
    assert.equal(customer.res.statusCode, 403);
    assert.equal(customer.res.body.mfaRequired, undefined);
});

test('yönetici AAL1 oturumla yalnızca iki adımlı doğrulama işlemlerine erişir', async () => {
    const blocked = await call('orders', { method: 'GET', token: AAL1 });
    assert.equal(blocked.res.statusCode, 403);
    assert.equal(blocked.res.body.mfaRequired, true);
    const status = await call('mfa-status', { method: 'GET', token: AAL1 });
    assert.equal(status.res.statusCode, 200);
    assert.equal(status.res.body.enrolled, true);
    assert.equal(status.res.body.aal, 'aal1');
});

test('TOTP doğrulaması yeni oturum çerezlerini yazar ve hatalı kodu reddeder', async () => {
    const routes = {
        [`POST /auth/v1/factors/${FACTOR}/challenge`]: { body: { id: 'ch-1' } },
        [`POST /auth/v1/factors/${FACTOR}/verify`]: (c) => (c.body.code === '123456'
            ? { body: { access_token: AAL2, refresh_token: 'rt-2', expires_in: 3600 } }
            : { status: 422, body: { error_code: 'mfa_verification_failed' } })
    };
    const good = await call('mfa-verify', { token: AAL1, body: { factorId: FACTOR, code: '123 456' }, routes });
    assert.equal(good.res.statusCode, 200);
    assert.ok(good.res.headers['set-cookie'].some(cookie => cookie.startsWith(`ye_at=${encodeURIComponent(AAL2)}`)));
    const bad = await call('mfa-verify', { token: AAL1, body: { factorId: FACTOR, code: '000000' }, routes });
    assert.equal(bad.res.statusCode, 401);
    assert.equal((await call('mfa-verify', { token: AAL1, body: { factorId: FACTOR, code: 'abc' } })).res.statusCode, 400);
});

test('sipariş durumu veritabanı fonksiyonuyla değişir, denetim kaydı ve müşteri e-postası oluşur', async () => {
    const { res, calls, sent } = await call('order-status', {
        body: { code: 'abcd2345', status: 'shipped', carrier: 'Kargo A', tracking: 'TR1' },
        routes: {
            'GET /rest/v1/orders': { body: [ORDER_ROW] },
            'POST /rest/v1/rpc/admin_set_order_status': { body: null },
            'GET /rest/v1/order_items': { body: [{ name: 'Monstera', unit_price: 45000, qty: 1, line_total: 45000 }] },
            'GET /rest/v1/settings': { body: [{ key: 'store', value: { pickup_address: 'Bayındır', pickup_hours: '09-18' } }] }
        }
    });
    assert.equal(res.statusCode, 200);
    const rpc = calls.find(c => c.path === '/rest/v1/rpc/admin_set_order_status').body;
    assert.equal(rpc.p_actor, UID);
    assert.equal(rpc.p_status, 'shipped');
    assert.equal(calls.filter(c => c.path === '/rest/v1/audit_log').length, 1);
    assert.equal(sent[0].config.to, 'musteri@example.test');
    assert.match(sent[0].email.subject, /kargoya verildi \(ABCD2345\)/);
});

test('geçersiz durum geçişi Türkçe hata döner; iptal neden ister', async () => {
    const { res } = await call('order-status', {
        body: { code: 'ABCD2345', status: 'delivered' },
        routes: { 'GET /rest/v1/orders': { body: [ORDER_ROW] }, 'POST /rest/v1/rpc/admin_set_order_status': { status: 400, body: { code: 'P0001', message: 'invalid_transition' } } }
    });
    assert.equal(res.statusCode, 409);
    const cancel = await call('order-cancel', { body: { code: 'ABCD2345', reason: '' }, routes: { 'GET /rest/v1/orders': { body: [ORDER_ROW] } } });
    assert.equal(cancel.res.statusCode, 400);
});

test('ürün kaydı fiyatı kuruş tam sayı ister ve yalnızca kendi Storage kovasındaki görselleri kabul eder', async () => {
    const product = { name: 'Monstera', slug: 'monstera', price: 45000, stock: 3, shippable: true, isActive: true, images: [] };
    const saved = await call('product-save', { body: product, routes: { 'POST /rest/v1/products': { status: 201, body: [{ id: P1 }] } } });
    assert.equal(saved.res.statusCode, 200);
    assert.equal(saved.calls.find(c => c.path === '/rest/v1/products').body.price, 45000);
    assert.equal((await call('product-save', { body: { ...product, price: 450.5 } })).res.statusCode, 400);
    assert.equal((await call('product-save', { body: { ...product, slug: 'Kötü Ad' } })).res.statusCode, 400);
    assert.equal((await call('product-save', { body: { ...product, images: ['https://kotu.example/x.jpg'] } })).res.statusCode, 400);
    assert.equal((await call('product-save', { body: { ...product, images: ['images/orchid_care_blooming.webp'] }, routes: { 'POST /rest/v1/products': { status: 201, body: [{ id: P1 }] } } })).res.statusCode, 200);
    assert.equal((await call('product-save', { body: { ...product, images: ['images/urunler/orkide-phalaenopsis.webp'] }, routes: { 'POST /rest/v1/products': { status: 201, body: [{ id: P1 }] } } })).res.statusCode, 200);
    assert.equal((await call('product-save', { body: { ...product, images: ['images/../api/admin.js'] } })).res.statusCode, 400);
    assert.equal((await call('product-save', { body: { ...product, images: ['images/../x.webp'] } })).res.statusCode, 400);
    assert.equal((await call('product-save', { body: { ...product, images: ['images/a/b/x.webp'] } })).res.statusCode, 400);
    const ownImage = 'https://p.supabase.co/storage/v1/object/public/products/a/b.webp';
    assert.equal((await call('product-save', { body: { ...product, images: [ownImage] }, routes: { 'POST /rest/v1/products': { status: 201, body: [{ id: P1 }] } } })).res.statusCode, 200);
    const duplicate = await call('product-save', { body: product, routes: { 'POST /rest/v1/products': { status: 409, body: { code: '23505' } } } });
    assert.equal(duplicate.res.statusCode, 409);
});

test('görsel yükleme dosya imzasını doğrular ve ürün klasörüne yazar', async () => {
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    assert.equal(decodeImage({ type: 'image/png', data: Buffer.from('<svg/>').toString('base64') }).ok, false);
    assert.equal(decodeImage({ type: 'image/svg+xml', data: png.toString('base64') }).ok, false);
    const { res, calls } = await call('product-image', {
        body: { productId: P1, type: 'image/png', data: png.toString('base64') },
        routes: {
            'GET /rest/v1/products': { body: [{ id: P1, images: [] }] },
            'PATCH /rest/v1/products': { body: [{ id: P1 }] },
            [`POST /storage/v1/object/products/${P1}/DOSYA`]: { body: {} }
        }
    });
    assert.equal(res.statusCode, 200);
    const upload = calls.find(c => c.path.startsWith('/storage/'));
    assert.equal(upload.headers['content-type'], 'image/png');
    assert.match(res.body.url, new RegExp(`^https://p\.supabase\.co/storage/v1/object/public/products/${P1}/`));
    assert.deepEqual(calls.find(c => c.method === 'PATCH').body.images, [res.body.url]);
    const bad = await call('product-image', { body: { productId: P1, type: 'image/png', data: Buffer.from('not an image').toString('base64') } });
    assert.equal(bad.res.statusCode, 400);
});

test('ayarlar: IBAN biçimi ve zorunlu alanlar', () => {
    const settings = {
        shipping: { fee: 15000, freeThreshold: 200000, weeklyCapacity: 20, orderCutoffHour: 18 },
        bank: { bankName: 'Banka', accountHolder: 'Yeşil Ege', iban: 'TR33 0006 1005 1978 6457 8413 26' },
        store: { pickupAddress: 'Karaveliler, Bayındır', pickupHours: 'Hafta içi 09-18' },
        loyalty: { pointsPerLira: 1, pointsPerUnit: 100, unitValue: 500, maxRatio: 0.3, activationDays: 14, validMonths: 12 }
    };
    const result = validateSettings(settings);
    assert.equal(result.ok, true);
    assert.equal(result.data.bank.iban, 'TR33 0006 1005 1978 6457 8413 26');
    assert.equal(validateSettings({ ...settings, bank: { ...settings.bank, iban: 'TR12' } }).ok, false);
    assert.equal(validateSettings({ ...settings, bank: { bankName: '', accountHolder: '', iban: 'TR330006100519786457841326' } }).ok, false);
    assert.equal(validateSettings({ ...settings, bank: { bankName: '', accountHolder: '', iban: '' } }).ok, true);
    assert.equal(validateSettings({ ...settings, loyalty: { ...settings.loyalty, maxRatio: 2 } }).ok, false);
});
