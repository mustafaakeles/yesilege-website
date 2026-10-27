// Yeşil Ege — tarayıcıdaki sepet. Yalnızca ürün kimliği ve adet saklanır; fiyat her zaman sunucuda hesaplanır.

const KEY = 'ye_cart_v1';
export const MAX_LINES = 30;
export const MAX_QTY = 99;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const clampQty = (value) => Math.min(MAX_QTY, Math.max(1, Math.trunc(Number(value)) || 1));

/** Bozuk veya elle değiştirilmiş kayıtları ayıklar. */
export function sanitize(raw) {
    const lines = Array.isArray(raw) ? raw : [];
    const seen = new Set();
    const clean = [];
    for (const line of lines) {
        const id = String(line?.id || '');
        if (!UUID_RE.test(id) || seen.has(id)) continue;
        seen.add(id);
        clean.push({ id, qty: clampQty(line.qty) });
        if (clean.length >= MAX_LINES) break;
    }
    return clean;
}

export function readCart() {
    try {
        return sanitize(JSON.parse(localStorage.getItem(KEY) || '[]'));
    } catch {
        return [];
    }
}

function write(lines) {
    const clean = sanitize(lines);
    try {
        localStorage.setItem(KEY, JSON.stringify(clean));
    } catch {
        // Gizli pencere veya dolu depolama: sepet yalnızca bu sayfada kalır.
    }
    window.dispatchEvent(new CustomEvent('cart:change', { detail: clean }));
    return clean;
}

export function addToCart(id, qty = 1) {
    const lines = readCart();
    const line = lines.find(item => item.id === id);
    if (line) line.qty = clampQty(line.qty + qty);
    else if (lines.length < MAX_LINES) lines.push({ id, qty: clampQty(qty) });
    else return { ok: false, lines };
    return { ok: true, lines: write(lines) };
}

export const setQty = (id, qty) => write(readCart().map(item => (item.id === id ? { ...item, qty: clampQty(qty) } : item)));
export const removeFromCart = (id) => write(readCart().filter(item => item.id !== id));
export const replaceCart = (lines) => write(lines);
export const clearCart = () => write([]);
export const cartCount = (lines = readCart()) => lines.reduce((sum, item) => sum + item.qty, 0);
