// Vercel Function: herkese açık ürün kataloğu ve oturum açmış kullanıcının favorileri.
// Katalog yalnızca yayındaki ürünleri döndürür; stok adedi değil, yalnızca stok durumu paylaşılır.

import { fail } from './_lib/http.js';
import { authed, createEndpoint } from './_lib/endpoint.js';
import { eq } from './_lib/supabase.js';
import {
    PRODUCT_COLUMNS, SLUG_RE, UUID_RE, activeCategories, activeProductBySlug, inList, ordersOpen, publicCategory, publicProduct,
    showcaseCatalog, showcaseDraft, showcaseRelated
} from './_lib/shop.js';

const RELATED_LIMIT = 4;
const MAX_FAVORITES = 200;
const ok = (res, extra = {}) => res.status(200).json({ success: true, ...extra });
const cachePublic = (res) => res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
const soldOut = (product) => ({ ...product, inStock: false, lowStock: false });

async function list(ctx) {
    const categorySlug = String(ctx.req.query?.category || '');
    if (categorySlug && !SLUG_RE.test(categorySlug)) return fail(ctx.res, 400, 'Kategori geçersiz.');
    const open = ordersOpen(ctx.env);

    const categories = await activeCategories(ctx.supabase);
    let filter = 'is_active=eq.true';
    if (categorySlug && open) {
        const category = [...categories.values()].find(row => row.slug === categorySlug);
        if (!category) return fail(ctx.res, 404, 'Kategori bulunamadı.');
        filter += `&category_id=${eq(category.id)}`;
    }
    const rows = await ctx.supabase.db.select('products', `${filter}&select=${PRODUCT_COLUMNS}&order=sort_order.asc,name.asc`);
    cachePublic(ctx.res);
    const catalog = {
        categories: [...categories.values()].map(publicCategory),
        products: rows.map(row => publicProduct(row, categories))
    };
    if (open) return ok(ctx.res, { ordersOpen: true, ...catalog });

    // Vitrin: sipariş kapalı, her ürün "Stokta yok"
    const showcase = showcaseCatalog(catalog.products, catalog.categories);
    const products = categorySlug ? showcase.products.filter(item => item.category?.slug === categorySlug) : showcase.products;
    return ok(ctx.res, { ordersOpen: false, categories: showcase.categories, products });
}

async function product(ctx) {
    const slug = String(ctx.req.query?.slug || '');
    if (!SLUG_RE.test(slug) || slug.length > 80) return fail(ctx.res, 404, 'Ürün bulunamadı.');
    const open = ordersOpen(ctx.env);
    const row = await activeProductBySlug(ctx.supabase, slug);
    if (!row) {
        const draft = open ? null : showcaseDraft(slug);
        if (!draft) return fail(ctx.res, 404, 'Ürün bulunamadı.');
        cachePublic(ctx.res);
        return ok(ctx.res, { ordersOpen: false, product: draft, related: showcaseRelated(draft, RELATED_LIMIT) });
    }

    const categories = await activeCategories(ctx.supabase);
    let related = [];
    if (row.category_id) {
        const rows = await ctx.supabase.db.select('products',
            `is_active=eq.true&category_id=${eq(row.category_id)}&select=${PRODUCT_COLUMNS}&order=sort_order.asc,name.asc&limit=${RELATED_LIMIT + 1}`);
        related = rows.filter(item => item.id !== row.id).slice(0, RELATED_LIMIT).map(item => publicProduct(item, categories));
    }
    cachePublic(ctx.res);
    const shown = publicProduct(row, categories);
    return ok(ctx.res, open
        ? { ordersOpen: true, product: shown, related }
        : { ordersOpen: false, product: soldOut(shown), related: related.map(soldOut) });
}

async function favorites(ctx) {
    const rows = await ctx.supabase.db.select('favorites', `user_id=${eq(ctx.uid)}&select=product_id&order=created_at.desc&limit=${MAX_FAVORITES}`);
    if (rows.length === 0) return ok(ctx.res, { products: [] });
    const ids = rows.map(row => row.product_id);
    const [products, categories] = await Promise.all([
        ctx.supabase.db.select('products', `id=${inList(ids)}&is_active=eq.true&select=${PRODUCT_COLUMNS}`),
        activeCategories(ctx.supabase)
    ]);
    const byId = new Map(products.map(row => [row.id, row]));
    return ok(ctx.res, { products: ids.filter(id => byId.has(id)).map(id => publicProduct(byId.get(id), categories)) });
}

async function favorite(ctx) {
    const productId = String(ctx.body.productId || '');
    if (!UUID_RE.test(productId) || typeof ctx.body.on !== 'boolean') return fail(ctx.res, 400, 'Ürün seçimi geçersiz.');
    const owned = `user_id=${eq(ctx.uid)}&product_id=${eq(productId)}`;

    if (!ctx.body.on) {
        await ctx.supabase.db.remove('favorites', owned);
        return ok(ctx.res, { on: false });
    }
    const [product] = await ctx.supabase.db.select('products', `id=${eq(productId)}&is_active=eq.true&select=id`);
    if (!product) return fail(ctx.res, 404, 'Ürün bulunamadı.');
    const existing = await ctx.supabase.db.select('favorites', `${owned}&select=product_id`);
    if (existing.length === 0) {
        const count = await ctx.supabase.db.select('favorites', `user_id=${eq(ctx.uid)}&select=product_id`);
        if (count.length >= MAX_FAVORITES) return fail(ctx.res, 400, `En fazla ${MAX_FAVORITES} ürünü favorilere ekleyebilirsiniz.`);
        await ctx.supabase.db.insert('favorites', { user_id: ctx.uid, product_id: productId });
    }
    return ok(ctx.res, { on: true });
}

const GET = ['GET'];
export const ACTIONS = Object.freeze({
    list: { methods: GET, run: list },
    product: { methods: GET, run: product },
    favorites: { methods: GET, run: authed(favorites) },
    favorite: { methods: ['POST'], run: authed(favorite) }
});

export function createHandler(options = {}) {
    return createEndpoint('catalog', ACTIONS, options);
}

export default createHandler();
