// Yeşil Ege — mağaza (ürün listesi) ve ürün sayfası. Bağımlılıksız ES modülü.

import { api, el, errorText, formatPrice, icon, isSignedIn, loginUrl } from './api-client.js';
import { addToCart, MAX_QTY } from './cart-store.js';

const params = new URLSearchParams(location.search);
const PLACEHOLDER = 'images/favicon.png';

function productImage(product, { large = false } = {}) {
    const [src] = product.images;
    const img = el('img', {
        attrs: {
            src: src || PLACEHOLDER, alt: src ? product.name : '', loading: large ? 'eager' : 'lazy', decoding: 'async',
            width: large ? 800 : 480, height: large ? 800 : 480
        }
    });
    if (!src) img.classList.add('is-placeholder');
    return img;
}

function priceBlock(product) {
    const block = el('p', { className: 'product-price' }, [el('span', { text: formatPrice(product.price) })]);
    if (product.compareAtPrice) {
        block.append(el('s', { text: formatPrice(product.compareAtPrice), attrs: { 'aria-label': `Eski fiyat ${formatPrice(product.compareAtPrice)}` } }));
    }
    return block;
}

function stockBadge(product) {
    if (!product.inStock) return el('span', { className: 'stock-badge is-out', text: 'Tükendi' });
    if (product.lowStock) return el('span', { className: 'stock-badge is-low', text: 'Son birkaç adet' });
    return null;
}

function toast(message) {
    let region = document.querySelector('[data-shop-toast]');
    if (!region) {
        region = el('div', { className: 'shop-toast', attrs: { 'data-shop-toast': true, role: 'status', 'aria-live': 'polite' } });
        document.body.append(region);
    }
    region.textContent = message;
    region.classList.add('is-visible');
    clearTimeout(region.hideTimer);
    region.hideTimer = setTimeout(() => region.classList.remove('is-visible'), 2600);
}

function addButton(product, getQty = () => 1) {
    const button = el('button', {
        className: 'btn btn-primary btn-sm add-to-cart',
        attrs: { type: 'button', disabled: !product.inStock }
    }, [icon('shopping-basket'), el('span', { text: product.inStock ? 'Sepete ekle' : 'Tükendi' })]);
    button.addEventListener('click', () => {
        const result = addToCart(product.id, getQty());
        toast(result.ok ? `${product.name} sepete eklendi.` : 'Sepetiniz dolu. Lütfen önce sepetinizi tamamlayın.');
    });
    return button;
}

async function toggleFavorite(button, product) {
    if (!isSignedIn()) {
        location.assign(loginUrl());
        return;
    }
    const on = button.getAttribute('aria-pressed') !== 'true';
    button.disabled = true;
    const result = await api('catalog', 'favorite', { body: { productId: product.id, on } });
    button.disabled = false;
    if (result.status === 401) return location.assign(loginUrl());
    if (!result.ok) return toast(errorText(result));
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? `${product.name} favorilerden çıkar` : `${product.name} favorilere ekle`);
    toast(on ? 'Favorilere eklendi.' : 'Favorilerden çıkarıldı.');
}

function favoriteButton(product, favorites) {
    const on = favorites.has(product.id);
    const button = el('button', {
        className: 'favorite-toggle',
        attrs: { type: 'button', 'aria-pressed': String(on), 'aria-label': on ? `${product.name} favorilerden çıkar` : `${product.name} favorilere ekle` }
    }, [icon('heart')]);
    button.addEventListener('click', () => toggleFavorite(button, product));
    return button;
}

const productUrl = (product) => `urun.html?u=${encodeURIComponent(product.slug)}`;

export function productCard(product, favorites = new Set()) {
    const link = el('a', { className: 'product-card-media', attrs: { href: productUrl(product), tabindex: '-1', 'aria-hidden': 'true' } }, [productImage(product)]);
    const title = el('h3', { className: 'product-card-title' }, [el('a', { text: product.name, attrs: { href: productUrl(product) } })]);
    const meta = el('div', { className: 'product-card-meta' }, [
        product.category ? el('span', { className: 'product-card-category', text: product.category.name }) : null,
        stockBadge(product)
    ]);
    const footer = el('div', { className: 'product-card-footer' }, [priceBlock(product), addButton(product)]);
    return el('article', { className: 'product-card' }, [link, favoriteButton(product, favorites), el('div', { className: 'product-card-body' }, [meta, title, footer])]);
}

async function loadFavorites() {
    if (!isSignedIn()) return new Set();
    const result = await api('catalog', 'favorites', { method: 'GET' });
    return new Set(result.ok ? result.data.products.map(product => product.id) : []);
}

function emptyState(title, text) {
    return el('div', { className: 'shop-empty' }, [
        icon('seedling'), el('h2', { text: title }), el('p', { text }),
        el('a', { className: 'btn btn-ghost', attrs: { href: 'contact.html#teklif' } }, [el('span', { text: 'Bize ulaşın' })])
    ]);
}

// ---------- Mağaza ----------

async function initCatalog(root) {
    const grid = root.querySelector('[data-product-grid]');
    const chips = root.querySelector('[data-category-chips]');
    const search = root.querySelector('[data-product-search]');
    const status = root.querySelector('[data-shop-status]');
    const selected = params.get('kategori') || '';

    const [result, favorites] = await Promise.all([api('catalog', 'list', { method: 'GET' }), loadFavorites()]);
    grid.removeAttribute('aria-busy');
    if (!result.ok) {
        grid.replaceChildren(emptyState('Ürünler yüklenemedi', errorText(result)));
        return;
    }
    const { products, categories } = result.data;
    if (products.length === 0) {
        grid.replaceChildren(emptyState('Mağazamız hazırlanıyor', 'Çevrim içi satışa sunacağımız ürünleri yakında burada bulabilirsiniz. O zamana kadar ürünlerimiz için bize ulaşabilirsiniz.'));
        return;
    }

    let category = categories.some(item => item.slug === selected) ? selected : '';
    const render = () => {
        const term = search.value.trim().toLocaleLowerCase('tr');
        const visible = products.filter(product => (!category || product.category?.slug === category)
            && (!term || `${product.name} ${product.summary}`.toLocaleLowerCase('tr').includes(term)));
        grid.replaceChildren(...(visible.length ? visible.map(product => productCard(product, favorites))
            : [emptyState('Sonuç bulunamadı', 'Farklı bir kategori ya da arama terimi deneyin.')]));
        status.textContent = `${visible.length} ürün gösteriliyor`;
        for (const chip of chips.querySelectorAll('button')) chip.setAttribute('aria-pressed', String(chip.dataset.category === category));
    };

    const chip = (slug, label) => {
        const button = el('button', { className: 'filter-chip', text: label, attrs: { type: 'button', 'data-category': slug } });
        button.addEventListener('click', () => {
            category = slug;
            const url = new URL(location.href);
            if (slug) url.searchParams.set('kategori', slug);
            else url.searchParams.delete('kategori');
            history.replaceState(null, '', url);
            render();
        });
        return button;
    };
    chips.replaceChildren(chip('', `Tümü (${products.length})`),
        ...categories.filter(item => products.some(product => product.category?.slug === item.slug)).map(item => chip(item.slug, item.name)));
    chips.hidden = categories.length === 0;
    search.addEventListener('input', render);
    render();
}

// ---------- Ürün sayfası ----------

function setMeta(product) {
    document.title = `${product.name} | Yeşil Ege Peyzaj`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', product.summary || `${product.name} — Yeşil Ege Peyzaj`);
    const data = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        description: product.summary || product.description || product.name,
        image: product.images,
        brand: { '@type': 'Brand', name: 'Yeşil Ege Peyzaj' },
        offers: {
            '@type': 'Offer',
            priceCurrency: 'TRY',
            price: (product.price / 100).toFixed(2),
            availability: product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            url: location.href
        }
    };
    const script = el('script', { attrs: { type: 'application/ld+json' } });
    script.textContent = JSON.stringify(data);
    document.head.append(script);
}

function gallery(product) {
    const main = el('div', { className: 'product-gallery-main' }, [productImage(product, { large: true })]);
    const wrapper = el('div', { className: 'product-gallery' }, [main]);
    if (product.images.length > 1) {
        const thumbs = el('div', { className: 'product-thumbs' });
        product.images.forEach((src, index) => {
            const button = el('button', { className: 'product-thumb', attrs: { type: 'button', 'aria-label': `${index + 1}. görsel`, 'aria-pressed': String(index === 0) } },
                [el('img', { attrs: { src, alt: '', width: 96, height: 96, loading: 'lazy' } })]);
            button.addEventListener('click', () => {
                main.querySelector('img').src = src;
                thumbs.querySelectorAll('button').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
            });
            thumbs.append(button);
        });
        wrapper.append(thumbs);
    }
    return wrapper;
}

function quantityStepper() {
    const input = el('input', { attrs: { type: 'number', id: 'qty', min: 1, max: MAX_QTY, value: 1, inputmode: 'numeric' } });
    const step = (delta) => { input.value = String(Math.min(MAX_QTY, Math.max(1, (Number(input.value) || 1) + delta))); };
    const minus = el('button', { attrs: { type: 'button', 'aria-label': 'Adedi azalt' } }, [icon('minus')]);
    const plus = el('button', { attrs: { type: 'button', 'aria-label': 'Adedi artır' } }, [icon('plus')]);
    minus.addEventListener('click', () => step(-1));
    plus.addEventListener('click', () => step(1));
    const wrapper = el('div', { className: 'qty-stepper' }, [minus, input, plus]);
    return { wrapper, value: () => Math.min(MAX_QTY, Math.max(1, Math.trunc(Number(input.value)) || 1)) };
}

async function initProduct(root) {
    const slug = params.get('u') || '';
    const holder = root.querySelector('[data-product-detail]');
    const [result, favorites] = await Promise.all([api('catalog', 'product', { method: 'GET', query: { slug } }), loadFavorites()]);
    holder.removeAttribute('aria-busy');
    if (!result.ok) {
        holder.replaceChildren(emptyState(result.status === 404 ? 'Ürün bulunamadı' : 'Ürün yüklenemedi',
            result.status === 404 ? 'Bu ürün satıştan kaldırılmış olabilir.' : errorText(result)));
        return;
    }
    const { product, related } = result.data;
    setMeta(product);
    const crumb = root.querySelector('[data-product-crumb]');
    crumb.textContent = product.name;
    if (product.category) {
        const link = root.querySelector('[data-category-crumb]');
        link.textContent = product.category.name;
        link.href = `magaza.html?kategori=${encodeURIComponent(product.category.slug)}`;
        link.parentElement.hidden = false;
    }

    const qty = quantityStepper();
    const delivery = product.shippable
        ? el('li', {}, [icon('truck'), el('span', { text: 'Cumartesi toplu kargo ile gönderilir.' })])
        : el('li', {}, [icon('store'), el('span', { text: 'Bu ürün yalnızca Bayındır\'daki fidanlığımızdan teslim alınabilir.' })]);
    const info = el('div', { className: 'product-info' }, [
        product.category ? el('p', { className: 'product-eyebrow', text: product.category.name }) : null,
        el('h1', { text: product.name }),
        product.summary ? el('p', { className: 'product-summary', text: product.summary }) : null,
        priceBlock(product),
        stockBadge(product),
        el('div', { className: 'product-buy' }, [
            el('label', { className: 'visually-hidden', text: 'Adet', attrs: { for: 'qty' } }),
            qty.wrapper,
            addButton(product, qty.value),
            favoriteButton(product, favorites)
        ]),
        el('ul', { className: 'product-perks' }, [
            delivery,
            el('li', {}, [icon('university'), el('span', { text: 'Havale/EFT veya mağazada ödeme.' })]),
            el('li', {}, [icon('seedling'), el('span', { text: 'Her siparişte sadakat puanı kazanırsınız.' })])
        ]),
        product.description ? el('div', { className: 'product-description' }, product.description.split(/\n{2,}/).map(text => el('p', { text }))) : null
    ]);
    holder.replaceChildren(gallery(product), info);

    const relatedSection = root.querySelector('[data-related]');
    if (related.length) {
        relatedSection.querySelector('[data-related-grid]').replaceChildren(...related.map(item => productCard(item, favorites)));
        relatedSection.hidden = false;
    }
}

const root = document.querySelector('[data-shop]');
if (root?.dataset.shop === 'catalog') initCatalog(root);
if (root?.dataset.shop === 'product') initProduct(root);
