// Yeşil Ege — Hesabım sayfasının alışveriş sekmeleri (Favorilerim). Sekme ilk açıldığında yüklenir.
// account.js sekme değişiminde 'account:tab' olayını yayınlar; bu modül ondan önce yüklenir.

import { api, el, errorText, icon } from './api-client.js';
import { productCard } from './shop.js';

const page = document.querySelector('[data-account-page]');
const loaded = new Set();

function message(text, action) {
    return el('div', { className: 'shop-empty' }, [icon('seedling'), el('p', { text }), action]);
}

async function loadFavorites() {
    const grid = page.querySelector('[data-favorite-grid]');
    const result = await api('catalog', 'favorites', { method: 'GET' });
    grid.removeAttribute('aria-busy');
    if (!result.ok) return grid.replaceChildren(message(errorText(result)));
    const { products } = result.data;
    if (products.length === 0) {
        return grid.replaceChildren(message('Henüz favori ürününüz yok. Beğendiğiniz ürünlerdeki kalp simgesine dokunarak buraya ekleyebilirsiniz.',
            el('a', { className: 'btn btn-ghost', text: 'Mağazaya göz atın', attrs: { href: 'magaza.html' } })));
    }
    const favorites = new Set(products.map(product => product.id));
    grid.replaceChildren(...products.map(product => productCard(product, favorites)));
}

const LOADERS = { favoriler: loadFavorites };

page?.addEventListener('account:tab', (event) => {
    const name = event.detail;
    if (!LOADERS[name] || loaded.has(name)) return;
    loaded.add(name);
    LOADERS[name]();
});
