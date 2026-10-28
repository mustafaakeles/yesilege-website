// Katalog, sipariş ve yönetim uç noktalarının ortak yardımcıları (saf fonksiyonlar + ayar okuma).

import { eq } from './supabase.js';
import { DRAFT_CATEGORIES, PRODUCT_DRAFTS } from '../../product-drafts.js';

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const PRODUCT_COLUMNS = 'id,slug,category_id,name,summary,description,price,compare_at_price,stock,shippable,images,sort_order';
export const CATEGORY_COLUMNS = 'id,slug,name,description,sort_order';

/** PostgREST "in" filtresi için değer listesi; yalnızca UUID'ler kabul edilir. */
export function inList(ids) {
    const safe = ids.filter(id => UUID_RE.test(String(id)));
    return `in.(${safe.join(',')})`;
}

/** Müşteriye gösterilen ürün: stok sayısı yerine yalnızca stok durumu döner. */
export function publicProduct(row, categories = new Map()) {
    const category = categories.get(row.category_id);
    return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        summary: row.summary || '',
        description: row.description || '',
        price: row.price,
        compareAtPrice: row.compare_at_price || null,
        inStock: row.stock > 0,
        lowStock: row.stock > 0 && row.stock <= 3,
        shippable: row.shippable,
        images: Array.isArray(row.images) ? row.images : [],
        category: category ? { slug: category.slug, name: category.name } : null
    };
}

export function publicCategory(row) {
    return { slug: row.slug, name: row.name, description: row.description || '' };
}

/**
 * Çevrim içi sipariş yalnızca ORDERS_OPEN=true ortam değişkeniyle açılır. Kapalıyken mağaza vitrin olarak çalışır:
 * ürünler "Stokta yok" görünür, sepet fiyatı ve sipariş reddedilir. Açarken tools/build_layout.py → ORDERING_ENABLED da True olmalı.
 */
export const ordersOpen = (env) => env?.ORDERS_OPEN === 'true';

const DRAFT_CATEGORY_BY_SLUG = new Map(DRAFT_CATEGORIES.map(category => [category.slug, category]));

/** Vitrindeki taslak ürün: fiyatı ve kimliği yoktur, satın alınamaz. */
export function showcaseProduct(draft) {
    const category = DRAFT_CATEGORY_BY_SLUG.get(draft.category);
    return {
        id: null,
        slug: draft.slug,
        name: draft.name,
        summary: draft.summary,
        description: draft.description,
        price: null,
        compareAtPrice: null,
        inStock: false,
        lowStock: false,
        shippable: draft.shippable,
        images: [draft.image],
        category: category ? { slug: category.slug, name: category.name } : null
    };
}

/** Sipariş kapalıyken: yayındaki ürünler stoksuz gösterilir, panelde henüz eklenmemiş taslaklar vitrine eklenir. */
export function showcaseCatalog(products, categories) {
    const known = new Set(products.map(product => product.slug));
    const all = [
        ...products.map(product => ({ ...product, inStock: false, lowStock: false })),
        ...PRODUCT_DRAFTS.filter(draft => !known.has(draft.slug)).map(showcaseProduct)
    ];
    const categoryList = [...categories];
    for (const meta of DRAFT_CATEGORIES) {
        if (!categoryList.some(category => category.slug === meta.slug)) categoryList.push({ slug: meta.slug, name: meta.name, description: '' });
    }
    return { products: all, categories: categoryList };
}

export const showcaseDraft = (slug) => {
    const draft = PRODUCT_DRAFTS.find(item => item.slug === slug);
    return draft ? showcaseProduct(draft) : null;
};

export const showcaseRelated = (product, limit) => PRODUCT_DRAFTS
    .filter(draft => draft.category === product.category?.slug && draft.slug !== product.slug)
    .slice(0, limit)
    .map(showcaseProduct);

export const SETTING_KEYS = Object.freeze(['shipping', 'loyalty', 'bank', 'store']);

/** settings tablosundan anahtar → değer haritası. */
export async function loadSettings(supabase, keys = SETTING_KEYS) {
    const safe = keys.filter(key => SETTING_KEYS.includes(key));
    const rows = await supabase.db.select('settings', `key=in.(${safe.join(',')})&select=key,value`);
    return Object.fromEntries(rows.map(row => [row.key, row.value]));
}

export async function activeCategories(supabase) {
    const rows = await supabase.db.select('categories', `is_active=eq.true&select=${CATEGORY_COLUMNS}&order=sort_order.asc,name.asc`);
    return new Map(rows.map(row => [row.id, row]));
}

export async function activeProductBySlug(supabase, slug) {
    const [row] = await supabase.db.select('products', `slug=${eq(slug)}&is_active=eq.true&select=${PRODUCT_COLUMNS}`);
    return row || null;
}
