// Katalog, sipariş ve yönetim uç noktalarının ortak yardımcıları (saf fonksiyonlar + ayar okuma).

import { eq } from './supabase.js';

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
