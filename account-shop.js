// Yeşil Ege — Hesabım sayfasının alışveriş sekmeleri (Siparişlerim, Favorilerim, Puanlarım). Sekme ilk açıldığında yüklenir.
// account.js sekme değişiminde 'account:tab' olayını yayınlar; bu modül ondan önce yüklenir.

import { api, el, errorText, formatDate, formatDateTime, formatPrice, icon, show } from './api-client.js';
import { productCard } from './shop.js';

const page = document.querySelector('[data-account-page]');
const loaded = new Set();

function message(text, action) {
    return el('div', { className: 'shop-empty' }, [icon('seedling'), el('p', { text }), action]);
}

const shopLink = (text) => el('a', { className: 'btn btn-ghost', text, attrs: { href: 'magaza.html' } });

// ---------- Favorilerim ----------

async function loadFavorites() {
    const grid = page.querySelector('[data-favorite-grid]');
    const result = await api('catalog', 'favorites', { method: 'GET' });
    grid.removeAttribute('aria-busy');
    if (!result.ok) return grid.replaceChildren(message(errorText(result)));
    const { products } = result.data;
    if (products.length === 0) {
        return grid.replaceChildren(message('Henüz favori ürününüz yok. Beğendiğiniz ürünlerdeki kalp simgesine dokunarak buraya ekleyebilirsiniz.', shopLink('Mağazaya göz atın')));
    }
    const favorites = new Set(products.map(product => product.id));
    grid.replaceChildren(...products.map(product => productCard(product, favorites)));
}

// ---------- Siparişlerim ----------

const PAYMENT = { bank_transfer: 'Havale/EFT', pay_at_store: 'Mağazada ödeme' };
const DELIVERY = { cargo: 'Cumartesi kargo', pickup: 'Fidanlıktan teslim alma' };

function addressText(address) {
    if (!address) return '';
    return [address.recipient_name, address.line, address.neighbourhood, `${address.district}/${address.city}`, address.phone].filter(Boolean).join(', ');
}

function orderDetails(order, reload) {
    const rows = [
        ['Ödeme', PAYMENT[order.paymentMethod]],
        ['Teslimat', DELIVERY[order.deliveryMethod]],
        order.shipDate ? ['Kargo günü', formatDate(order.shipDate)] : null,
        order.address ? ['Adres', addressText(order.address)] : null,
        order.carrier || order.trackingNumber ? ['Kargo takip', [order.carrier, order.trackingNumber].filter(Boolean).join(' · ')] : null,
        order.note ? ['Not', order.note] : null
    ].filter(Boolean);
    const info = el('dl', { className: 'order-summary-rows' });
    for (const [label, value] of rows) info.append(el('dt', { text: label }), el('dd', { text: value }));

    const items = el('ul', { className: 'summary-lines' }, order.items.map(item => el('li', {}, [
        el('span', { text: `${item.qty} × ${item.name}` }), el('span', { text: formatPrice(item.lineTotal) })
    ])));
    const totals = el('dl', { className: 'order-summary-rows' });
    const add = (label, value, className) => totals.append(el('dt', { className, text: label }), el('dd', { className, text: value }));
    add('Ara toplam', formatPrice(order.subtotal));
    add('Kargo', order.shippingFee ? formatPrice(order.shippingFee) : 'Ücretsiz');
    if (order.discount) add(`Puan indirimi (${order.pointsUsed} puan)`, `−${formatPrice(order.discount)}`);
    add('Toplam', formatPrice(order.total), 'is-total');

    const body = el('div', { className: 'order-item-body' }, [items, totals, info]);
    if (order.status === 'awaiting_payment' && order.paymentMethod === 'bank_transfer') {
        const bankHolder = el('div', { className: 'bank-box' }, [el('p', { text: 'Havale bilgileri yükleniyor…' })]);
        body.append(bankHolder);
        api('checkout', 'order', { method: 'GET', query: { code: order.code } }).then(result => {
            const bank = result.ok ? result.data.bank : null;
            if (!bank) return bankHolder.remove();
            bankHolder.replaceChildren(el('h3', { text: 'Havale/EFT bilgileri' }), el('dl', {}, [
                el('dt', { text: 'Banka' }), el('dd', { text: bank.bankName }),
                el('dt', { text: 'Hesap sahibi' }), el('dd', { text: bank.accountHolder }),
                el('dt', { text: 'IBAN' }), el('dd', { className: 'iban', text: bank.iban }),
                el('dt', { text: 'Açıklama' }), el('dd', { text: order.code })
            ]));
        });
    }
    if (order.status === 'awaiting_payment') {
        const feedback = el('p', { className: 'form-feedback', attrs: { role: 'status', 'aria-live': 'polite' } });
        const cancel = el('button', { className: 'btn btn-ghost btn-sm', text: 'Siparişi iptal et', attrs: { type: 'button' } });
        cancel.addEventListener('click', async () => {
            if (!window.confirm(`${order.code} kodlu sipariş iptal edilsin mi?`)) return;
            cancel.disabled = true;
            const result = await api('checkout', 'cancel', { body: { code: order.code } });
            if (!result.ok) {
                cancel.disabled = false;
                return show(feedback, errorText(result), 'error');
            }
            reload();
        });
        body.append(el('div', { className: 'form-actions' }, [cancel]), feedback);
    }
    return body;
}

function orderItem(order, reload) {
    const count = order.items.reduce((sum, item) => sum + item.qty, 0);
    const summary = el('summary', {}, [
        el('div', {}, [
            el('span', { className: 'order-item-code', text: order.code }),
            el('div', { className: 'order-item-meta', text: `${formatDateTime(order.createdAt)} · ${count} ürün · ${formatPrice(order.total)}` })
        ]),
        el('span', { className: 'status-pill', text: order.statusLabel, attrs: { 'data-status': order.status } })
    ]);
    const details = el('details', { className: 'order-item' }, [summary]);
    details.addEventListener('toggle', () => {
        if (details.open && details.childElementCount === 1) details.append(orderDetails(order, reload));
    }, { once: false });
    return el('li', {}, [details]);
}

async function loadOrders() {
    const holder = page.querySelector('[data-order-list]');
    const result = await api('checkout', 'orders', { method: 'GET' });
    holder.removeAttribute('aria-busy');
    if (!result.ok) return holder.replaceChildren(message(errorText(result)));
    const { orders } = result.data;
    if (orders.length === 0) return holder.replaceChildren(message('Henüz siparişiniz yok.', shopLink('Alışverişe başlayın')));
    holder.replaceChildren(el('ul', { className: 'order-list' }, orders.map(order => orderItem(order, loadOrders))));
    if (orders.length && new URLSearchParams(location.search).get('siparis') === orders[0].code) holder.querySelector('details').open = true;
}

// ---------- Puanlarım ----------

const KIND = { earn: 'Kazanılan', spend: 'Harcanan', refund: 'İade edilen', reversal: 'Geri alınan', adjust: 'Düzeltme' };

async function loadPoints() {
    const holder = page.querySelector('[data-points]');
    const result = await api('account', 'loyalty', { method: 'GET' });
    holder.removeAttribute('aria-busy');
    if (!result.ok) return holder.replaceChildren(message(errorText(result)));
    const { available, pending, rates, entries } = result.data;
    const value = Math.floor(available / rates.pointsPerUnit) * rates.unitValue;
    const stat = (number, label) => el('div', { className: 'points-stat' }, [el('strong', { text: number }), el('span', { text: label })]);
    const rows = entries.map(entry => {
        const future = entry.points > 0 && new Date(entry.availableAt) > new Date();
        const detail = [
            entry.note,
            future ? `${formatDate(entry.availableAt)} tarihinde kullanılabilir` : null,
            entry.expiresAt && entry.points > 0 ? `Son kullanma: ${formatDate(entry.expiresAt)}` : null
        ].filter(Boolean).join(' · ');
        return el('tr', {}, [
            el('td', { text: KIND[entry.kind] || entry.kind }),
            el('td', { text: `${formatDate(entry.createdAt)}${detail ? ` · ${detail}` : ''}` }),
            el('td', { className: entry.points > 0 ? 'is-plus' : 'is-minus', text: `${entry.points > 0 ? '+' : '−'}${Math.abs(entry.points)}` })
        ]);
    });
    holder.replaceChildren(
        el('div', { className: 'points-hero' }, [
            stat(String(available), `kullanılabilir puan (${formatPrice(value)} indirim)`),
            stat(String(pending), 'bekleyen puan')
        ]),
        el('p', { className: 'field-hint', text: `Teslim edilen siparişlerinizde her 1 ₺ için 1 puan kazanırsınız. Puanlar teslimden ${rates.activationDays} gün sonra kullanılabilir olur ve ${rates.validMonths} ay geçerlidir. ${rates.pointsPerUnit} puan = ${formatPrice(rates.unitValue)}; puanla sipariş tutarının en fazla %${Math.round(rates.maxRatio * 100)}'ü ödenebilir.` }),
        entries.length
            ? el('table', { className: 'ledger' }, [
                el('thead', {}, [el('tr', {}, [el('th', { text: 'Hareket', attrs: { scope: 'col' } }), el('th', { text: 'Ayrıntı', attrs: { scope: 'col' } }), el('th', { text: 'Puan', attrs: { scope: 'col' } })])]),
                el('tbody', {}, rows)
            ])
            : message('Henüz puan hareketiniz yok. İlk siparişiniz teslim edildiğinde puanlarınız burada görünür.', shopLink('Mağazaya göz atın'))
    );
}

const LOADERS = { favoriler: loadFavorites, siparisler: loadOrders, puanlar: loadPoints };

page?.addEventListener('account:tab', (event) => {
    const name = event.detail;
    if (!LOADERS[name] || loaded.has(name)) return;
    loaded.add(name);
    LOADERS[name]();
});
