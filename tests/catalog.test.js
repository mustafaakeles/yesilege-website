import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createHandler } from '../api/catalog.js';
import { fakeFetch, makeReq, mockRes } from './helpers/http.js';

const ENV = {
    SUPABASE_URL: 'https://p.supabase.co',
    SUPABASE_ANON_KEY: 'anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    SITE_URL: 'https://yesilege.com.tr'
};
const UID = '11111111-1111-4111-8111-111111111111';
const CAT = '33333333-3333-4333-8333-333333333333';
const P1 = '44444444-4444-4444-8444-444444444444';
const P2 = '55555555-5555-4555-8555-555555555555';
const USER = { id: UID, email: 'ayse@example.test', email_confirmed_at: '2026-10-27T10:00:00Z' };
const CATEGORY = { id: CAT, slug: 'ic-mekan', name: 'İç Mekan', description: null, sort_order: 0 };
const product = (id, extra = {}) => ({
    id, slug: `urun-${id.slice(0, 4)}`, category_id: CAT, name: 'Monstera', summary: null, description: null,
    price: 45000, compare_at_price: null, stock: 7, shippable: true, images: [], sort_order: 0, ...extra
});

async function call(action, { routes = {}, body = {}, method = 'GET', query = {}, cookie = '' } = {}) {
    const fetchImpl = fakeFetch({ 'GET /auth/v1/user': { body: USER }, 'GET /rest/v1/categories': { body: [CATEGORY] }, ...routes });
    const res = mockRes();
    await createHandler({ env: ENV, fetchImpl })(makeReq({ method, body, headers: cookie ? { cookie } : {}, query: { action, ...query } }), res);
    return { res, calls: fetchImpl.calls };
}
const restCalls = (calls, method, table) => calls.filter(c => c.method === method && c.path === `/rest/v1/${table}`);

test('liste yalnızca yayındaki ürünleri ister ve stok adedini paylaşmaz', async () => {
    const { res, calls } = await call('list', { routes: { 'GET /rest/v1/products': { body: [product(P1), product(P2, { stock: 0 })] } } });
    assert.equal(res.statusCode, 200);
    assert.match(restCalls(calls, 'GET', 'products')[0].search, /is_active=eq\.true/);
    const [first, second] = res.body.products;
    assert.equal(first.inStock, true);
    assert.equal(second.inStock, false);
    assert.equal('stock' in first, false);
    assert.deepEqual(first.category, { slug: 'ic-mekan', name: 'İç Mekan' });
    assert.match(res.headers['cache-control'], /s-maxage=60/);
});

test('liste kategoriye göre süzer; bilinmeyen kategori 404, geçersiz kısa ad 400', async () => {
    const { calls } = await call('list', { query: { category: 'ic-mekan' }, routes: { 'GET /rest/v1/products': { body: [] } } });
    assert.match(restCalls(calls, 'GET', 'products')[0].search, new RegExp(`category_id=eq\\.${CAT}`));
    assert.equal((await call('list', { query: { category: 'yok' } })).res.statusCode, 404);
    assert.equal((await call('list', { query: { category: 'Kötü Ad' } })).res.statusCode, 400);
});

test('ürün sayfası benzer ürünleri kendisi hariç döndürür; yayında değilse 404', async () => {
    const { res } = await call('product', {
        query: { slug: 'urun-4444' },
        routes: { 'GET /rest/v1/products': (c) => ({ body: /slug=/.test(c.search) ? [product(P1)] : [product(P1), product(P2)] }) }
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.product.id, P1);
    assert.deepEqual(res.body.related.map(p => p.id), [P2]);

    const missing = await call('product', { query: { slug: 'urun-yok' }, routes: { 'GET /rest/v1/products': { body: [] } } });
    assert.equal(missing.res.statusCode, 404);
    assert.equal((await call('product', { query: { slug: '../etc' } })).res.statusCode, 404);
});

test('favoriler oturum ister', async () => {
    assert.equal((await call('favorites')).res.statusCode, 401);
    assert.equal((await call('favorite', { method: 'POST', body: { productId: P1, on: true } })).res.statusCode, 401);
});

test('favori ekleme kullanıcı kimliğini oturumdan alır ve yayında olmayan ürünü reddeder', async () => {
    const { res, calls } = await call('favorite', {
        method: 'POST', cookie: 'ye_at=at-1', body: { productId: P1, on: true, userId: 'baskasi' },
        routes: {
            'GET /rest/v1/products': { body: [{ id: P1 }] },
            'GET /rest/v1/favorites': { body: [] },
            'POST /rest/v1/favorites': { status: 201, body: [{}] }
        }
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(restCalls(calls, 'POST', 'favorites')[0].body, { user_id: UID, product_id: P1 });

    const hidden = await call('favorite', {
        method: 'POST', cookie: 'ye_at=at-1', body: { productId: P1, on: true },
        routes: { 'GET /rest/v1/products': { body: [] } }
    });
    assert.equal(hidden.res.statusCode, 404);
});

test('favori kaldırma yalnızca kullanıcının kaydını siler; geçersiz kimlik 400', async () => {
    const { calls } = await call('favorite', {
        method: 'POST', cookie: 'ye_at=at-1', body: { productId: P1, on: false },
        routes: { 'DELETE /rest/v1/favorites': { body: [] } }
    });
    assert.match(restCalls(calls, 'DELETE', 'favorites')[0].search, new RegExp(`user_id=eq\\.${UID}&product_id=eq\\.${P1}`));
    const bad = await call('favorite', { method: 'POST', cookie: 'ye_at=at-1', body: { productId: 'x', on: true } });
    assert.equal(bad.res.statusCode, 400);
});

test('favori listesi yayından kalkan ürünleri atlar ve eklenme sırasını korur', async () => {
    const { res } = await call('favorites', {
        cookie: 'ye_at=at-1',
        routes: {
            'GET /rest/v1/favorites': { body: [{ product_id: P2 }, { product_id: P1 }] },
            'GET /rest/v1/products': { body: [product(P1)] }
        }
    });
    assert.deepEqual(res.body.products.map(p => p.id), [P1]);
});
