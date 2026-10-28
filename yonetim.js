// Yeşil Ege — yönetim paneli. Yetki sunucuda denetlenir (rol + TOTP); bu betik yalnızca arayüzdür.

import { api, el, errorText, formatDate, formatDateTime, formatPrice, icon, loginUrl, show } from './api-client.js';
import { DRAFT_CATEGORIES, PRODUCT_DRAFTS } from './product-drafts.js';

const root = document.querySelector('[data-admin]');
const STATUS = {
    awaiting_payment: 'Ödeme bekleniyor', paid: 'Ödeme alındı', preparing: 'Hazırlanıyor', shipped: 'Kargoya verildi',
    ready_for_pickup: 'Teslim almaya hazır', delivered: 'Teslim edildi', cancelled: 'İptal edildi'
};
const PAYMENT = { bank_transfer: 'Havale/EFT', pay_at_store: 'Mağazada ödeme' };
const DELIVERY = { cargo: 'Kargo', pickup: 'Teslim alma' };

// ---------- Küçük yardımcılar ----------

/** "1.250,50" ya da "1250.5" biçimindeki TL tutarını kuruşa çevirir; geçersizse NaN. */
export function parseLira(value) {
    const raw = String(value ?? '').trim().replace(/[₺\s]/g, '');
    if (!raw) return NaN;
    const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return NaN;
    return Math.round(Number(normalized) * 100);
}
const liraInput = (kurus) => (kurus || kurus === 0 ? (kurus / 100).toFixed(2).replace('.', ',') : '');

export function slugify(text) {
    const map = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
    return String(text).toLocaleLowerCase('tr').replace(/[çğıiöşüâîû]/g, char => map[char] || char)
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

const feedbackEl = () => el('p', { className: 'form-feedback', attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });

function field(label, input, hint) {
    const id = input.id || `f-${Math.random().toString(36).slice(2, 9)}`;
    input.id = id;
    return el('div', { className: 'form-group' }, [el('label', { text: label, attrs: { for: id } }), input, hint ? el('small', { className: 'field-hint', text: hint }) : null]);
}
const input = (attrs) => el('input', { attrs: { type: 'text', ...attrs } });
const checkbox = (label, checked, name) => {
    const box = el('input', { attrs: { type: 'checkbox', name, checked } });
    return { box, node: el('label', { className: 'checkbox-label' }, [box, el('span', { text: label })]) };
};
const button = (text, attrs = {}, className = 'btn btn-ghost btn-sm') => el('button', { className, text, attrs: { type: 'button', ...attrs } });
const statusPill = (status) => el('span', { className: 'status-pill', text: STATUS[status] || status, attrs: { 'data-status': status } });

async function guarded(result) {
    if (result.status === 401) location.assign(loginUrl());
    if (result.status === 403 && result.data?.mfaRequired) location.reload();
    return result;
}
const call = async (action, options) => guarded(await api('admin', action, options));

// ---------- İki adımlı doğrulama ----------

function codeForm(factorId, onDone) {
    const code = input({ inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 7, pattern: '[0-9 ]*', required: true });
    const feedback = feedbackEl();
    const submit = el('button', { className: 'btn btn-primary', text: 'Doğrula', attrs: { type: 'submit' } });
    const form = el('form', { className: 'contact-form admin-card', attrs: { novalidate: true } }, [field('Doğrulama uygulamasındaki 6 haneli kod', code), submit, feedback]);
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        submit.disabled = true;
        show(feedback, 'Doğrulanıyor…', 'sending');
        const result = await api('admin', 'mfa-verify', { body: { factorId, code: code.value } });
        submit.disabled = false;
        if (!result.ok) return show(feedback, errorText(result), 'error');
        onDone();
    });
    setTimeout(() => code.focus(), 0);
    return form;
}

async function renderMfa(holder, status) {
    const intro = el('p', { text: 'Yönetim paneli, şifrenize ek olarak telefonunuzdaki doğrulama uygulamasından (Google Authenticator, Microsoft Authenticator vb.) alınan kodla açılır.' });
    if (status.enrolled) {
        holder.replaceChildren(el('div', { className: 'admin-mfa' }, [el('h2', { text: 'İki adımlı doğrulama' }), intro, codeForm(status.factorId, () => location.reload())]));
        return;
    }
    const start = button('Doğrulama uygulamasını kur', {}, 'btn btn-primary');
    const area = el('div', { className: 'admin-mfa' }, [el('h2', { text: 'İki adımlı doğrulamayı kurun' }), intro, start]);
    holder.replaceChildren(area);
    start.addEventListener('click', async () => {
        start.disabled = true;
        const result = await api('admin', 'mfa-enroll', { body: {} });
        if (!result.ok) {
            start.disabled = false;
            return area.append(el('p', { className: 'form-feedback', text: errorText(result), attrs: { 'data-state': 'error' } }));
        }
        const { factorId, qr, secret } = result.data;
        start.remove();
        area.append(
            el('ol', { className: 'admin-steps' }, [
                el('li', { text: 'Doğrulama uygulamasını açın ve "hesap ekle / QR kodu tara" seçeneğini seçin.' }),
                el('li', { text: 'Aşağıdaki QR kodu tarayın. Tarayamazsanız kurulum anahtarını elle girin.' }),
                el('li', { text: 'Uygulamanın gösterdiği 6 haneli kodu girin.' })
            ]),
            el('img', { className: 'admin-qr', attrs: { src: qr, alt: 'İki adımlı doğrulama QR kodu', width: 200, height: 200 } }),
            el('p', {}, [el('span', { text: 'Kurulum anahtarı: ' }), el('code', { className: 'admin-secret', text: secret })]),
            codeForm(factorId, () => location.reload())
        );
    });
}

// ---------- Özet ----------

async function renderDashboard(panel) {
    const result = await call('dashboard', { method: 'GET' });
    if (!result.ok) return panel.replaceChildren(el('p', { className: 'form-feedback', text: errorText(result), attrs: { 'data-state': 'error' } }));
    const { summary } = result.data;
    const stat = (label, value, status) => el('button', { className: 'admin-stat', attrs: { type: 'button', 'data-goto': status || '' } }, [el('strong', { text: value }), el('span', { text: label })]);
    const stats = el('div', { className: 'admin-stats' }, [
        stat('Ödeme bekleyen', String(summary.by_status.awaiting_payment || 0), 'awaiting_payment'),
        stat('Hazırlanacak', String((summary.by_status.paid || 0) + (summary.by_status.preparing || 0)), 'paid'),
        stat('Teslim almaya hazır', String(summary.by_status.ready_for_pickup || 0), 'ready_for_pickup'),
        stat('Son 30 gün ciro', formatPrice(summary.revenue_30d))
    ]);
    stats.querySelectorAll('[data-goto]').forEach(node => node.addEventListener('click', () => {
        if (node.dataset.goto) openTab('siparisler', { status: node.dataset.goto });
    }));
    const batches = summary.batches.length
        ? el('table', { className: 'ledger' }, [el('tbody', {}, summary.batches.map(batch => el('tr', {}, [
            el('td', { text: formatDate(batch.ship_date) }), el('td', { text: `${batch.reserved} / ${batch.capacity} sipariş` }),
            el('td', {}, [button('Listeyi aç', { 'data-date': batch.ship_date })])
        ])))])
        : el('p', { className: 'field-hint', text: `Henüz kargo siparişi yok. İlk uygun kargo günü: ${formatDate(summary.next_ship_date)}.` });
    batches.querySelectorAll?.('[data-date]').forEach(node => node.addEventListener('click', () => openTab('kargo', { date: node.dataset.date })));
    panel.replaceChildren(
        stats,
        el('div', { className: 'admin-grid' }, [
            el('section', { className: 'admin-card' }, [el('h3', { text: 'Cumartesi kargo günleri' }), batches]),
            el('section', { className: 'admin-card' }, [el('h3', { text: 'Azalan stok' }), summary.low_stock.length
                ? el('ul', { className: 'admin-list' }, summary.low_stock.map(item => el('li', {}, [el('span', { text: item.name }), el('strong', { text: `${item.stock} adet` })])))
                : el('p', { className: 'field-hint', text: 'Stoğu 3 adedin altına düşen yayındaki ürün yok.' })])
        ])
    );
}

// ---------- Siparişler ----------

const NEXT = (order) => {
    if (order.status === 'awaiting_payment') return order.paymentMethod === 'pay_at_store' ? ['preparing', 'ready_for_pickup'] : ['paid'];
    if (order.status === 'paid') return ['preparing', order.deliveryMethod === 'cargo' ? 'shipped' : 'ready_for_pickup'];
    if (order.status === 'preparing') return [order.deliveryMethod === 'cargo' ? 'shipped' : 'ready_for_pickup'];
    if (order.status === 'shipped' || order.status === 'ready_for_pickup') return ['delivered'];
    return [];
};
const ACTION_LABEL = { paid: 'Ödeme alındı', preparing: 'Hazırlanıyor', shipped: 'Kargoya verildi', ready_for_pickup: 'Teslim almaya hazır', delivered: 'Teslim edildi' };

function addressBlock(address) {
    if (!address) return null;
    return el('p', { className: 'admin-address', text: [address.recipient_name, address.phone, address.line, address.neighbourhood,
        `${address.district}/${address.city}`, address.postal_code].filter(Boolean).join(' · ') });
}

function orderCard(order, reload) {
    const feedback = feedbackEl();
    const carrier = input({ placeholder: 'Kargo firması', maxlength: 60, value: order.carrier });
    const tracking = input({ placeholder: 'Takip numarası', maxlength: 60, value: order.trackingNumber });
    const actions = el('div', { className: 'form-actions' });
    const act = async (status) => {
        actions.querySelectorAll('button').forEach(node => { node.disabled = true; });
        const result = await call('order-status', { body: { code: order.code, status, carrier: carrier.value, tracking: tracking.value } });
        if (!result.ok) {
            actions.querySelectorAll('button').forEach(node => { node.disabled = false; });
            return show(feedback, errorText(result), 'error');
        }
        reload();
    };
    for (const status of NEXT(order)) {
        const node = button(ACTION_LABEL[status], {}, status === 'paid' || status === 'delivered' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm');
        node.addEventListener('click', () => {
            if (status === 'paid' && !window.confirm(`${order.code}: ${formatPrice(order.total)} tutarındaki havale hesaba ulaştı mı?`)) return;
            act(status);
        });
        actions.append(node);
    }
    if (order.status !== 'cancelled') {
        const cancel = button(order.status === 'delivered' ? 'İade / iptal' : 'İptal et');
        cancel.addEventListener('click', async () => {
            const reason = window.prompt(`${order.code} neden iptal ediliyor? (müşteriye gösterilmez)`);
            if (!reason) return;
            const result = await call('order-cancel', { body: { code: order.code, reason } });
            if (!result.ok) return show(feedback, errorText(result), 'error');
            reload();
        });
        actions.append(cancel);
    }
    const shippingInputs = order.deliveryMethod === 'cargo' && NEXT(order).includes('shipped') ? el('div', { className: 'admin-inline' }, [carrier, tracking]) : null;
    return el('details', { className: 'order-item' }, [
        el('summary', {}, [
            el('div', {}, [
                el('span', { className: 'order-item-code', text: order.code }),
                el('div', { className: 'order-item-meta', text: `${formatDateTime(order.createdAt)} · ${order.contact?.name || ''} · ${formatPrice(order.total)} · ${PAYMENT[order.paymentMethod]} · ${DELIVERY[order.deliveryMethod]}${order.shipDate ? ` (${formatDate(order.shipDate)})` : ''}` })
            ]),
            statusPill(order.status)
        ]),
        el('div', { className: 'order-item-body' }, [
            el('ul', { className: 'summary-lines' }, order.items.map(item => el('li', {}, [el('span', { text: `${item.qty} × ${item.name}` }), el('span', { text: formatPrice(item.lineTotal) })]))),
            el('p', { text: `Ara toplam ${formatPrice(order.subtotal)} · Kargo ${formatPrice(order.shippingFee)}${order.discount ? ` · Puan −${formatPrice(order.discount)}` : ''} · Toplam ${formatPrice(order.total)}` }),
            el('p', { className: 'admin-address', text: [order.contact?.name, order.contact?.email, order.contact?.phone].filter(Boolean).join(' · ') }),
            addressBlock(order.address),
            order.note ? el('p', { className: 'admin-note', text: `Not: ${order.note}` }) : null,
            order.carrier || order.trackingNumber ? el('p', { text: `Kargo: ${[order.carrier, order.trackingNumber].filter(Boolean).join(' · ')}` }) : null,
            shippingInputs, actions, feedback
        ])
    ]);
}

async function renderOrders(panel, { status = 'awaiting_payment' } = {}) {
    const select = el('select', { attrs: { id: 'order-status-filter' } }, [el('option', { text: 'Tümü', attrs: { value: '' } }),
        ...Object.entries(STATUS).map(([value, label]) => el('option', { text: label, attrs: { value, selected: value === status } }))]);
    const code = input({ placeholder: 'Sipariş kodu', maxlength: 8, autocapitalize: 'characters' });
    const list = el('div', { attrs: { 'aria-live': 'polite' } });
    const load = async () => {
        list.replaceChildren(el('p', { className: 'shop-loading', text: 'Siparişler yükleniyor…' }));
        const query = code.value.trim() ? { code: code.value.trim() } : select.value ? { status: select.value } : {};
        const result = await call('orders', { method: 'GET', query });
        if (!result.ok) return list.replaceChildren(el('p', { className: 'form-feedback', text: errorText(result), attrs: { 'data-state': 'error' } }));
        list.replaceChildren(result.data.orders.length
            ? el('ul', { className: 'order-list' }, result.data.orders.map(order => el('li', {}, [orderCard(order, load)])))
            : el('p', { className: 'field-hint', text: 'Bu filtreye uyan sipariş yok.' }));
    };
    select.addEventListener('change', () => { code.value = ''; load(); });
    code.addEventListener('keydown', (event) => { if (event.key === 'Enter') load(); });
    const search = button('Ara');
    search.addEventListener('click', load);
    panel.replaceChildren(el('div', { className: 'admin-toolbar' }, [field('Durum', select), field('Kodla ara', code), search]), list);
    await load();
}

// ---------- Kargo listesi ----------

async function renderShipping(panel, { date } = {}) {
    const dash = await call('dashboard', { method: 'GET' });
    const dates = dash.ok ? dash.data.summary.batches.map(batch => batch.ship_date) : [];
    const selected = date || dates[0] || (dash.ok ? dash.data.summary.next_ship_date : '');
    const picker = el('input', { attrs: { type: 'date', value: selected, id: 'ship-date' } });
    const list = el('div');
    const load = async () => {
        const result = await call('orders', { method: 'GET', query: { shipDate: picker.value } });
        if (!result.ok) return list.replaceChildren(el('p', { className: 'form-feedback', text: errorText(result), attrs: { 'data-state': 'error' } }));
        const orders = result.data.orders.filter(order => order.status !== 'cancelled');
        list.replaceChildren(orders.length ? el('table', { className: 'ledger admin-ship' }, [
            el('thead', {}, [el('tr', {}, ['Kod', 'Alıcı ve adres', 'Ürünler', 'Durum'].map(text => el('th', { text, attrs: { scope: 'col' } })))]),
            el('tbody', {}, orders.map(order => el('tr', {}, [
                el('td', { text: order.code }),
                el('td', {}, [addressBlock(order.address)]),
                el('td', { text: order.items.map(item => `${item.qty} × ${item.name}`).join(', ') }),
                el('td', {}, [statusPill(order.status)])
            ])))
        ]) : el('p', { className: 'field-hint', text: 'Bu tarih için kargo siparişi yok.' }));
    };
    picker.addEventListener('change', load);
    const print = button('Yazdır');
    print.addEventListener('click', () => window.print());
    panel.replaceChildren(el('div', { className: 'admin-toolbar' }, [field('Kargo günü', picker), print]), list);
    await load();
}

// ---------- Ürünler ve kategoriler ----------

async function resizeImage(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.75, 0.65]) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
        if (blob && blob.size <= 1_400_000) {
            const buffer = new Uint8Array(await blob.arrayBuffer());
            let binary = '';
            for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
            return { type: blob.type, data: btoa(binary) };
        }
    }
    throw new Error('Görsel küçültülemedi.');
}

function productForm(product, categories, onSaved, onCancel) {
    const isNew = !product.id;
    const name = input({ value: product.name || '', maxlength: 120, required: true });
    const slug = input({ value: product.slug || '', maxlength: 80, required: true, pattern: '[a-z0-9-]+' });
    let slugTouched = !isNew;
    slug.addEventListener('input', () => { slugTouched = true; });
    name.addEventListener('input', () => { if (!slugTouched) slug.value = slugify(name.value); });
    const category = el('select', {}, [el('option', { text: 'Kategorisiz', attrs: { value: '' } }),
        ...categories.map(item => el('option', { text: item.name, attrs: { value: item.id, selected: item.id === product.categoryId } }))]);
    const price = input({ value: liraInput(product.price), inputmode: 'decimal', required: true });
    const compare = input({ value: liraInput(product.compareAtPrice), inputmode: 'decimal' });
    const stock = el('input', { attrs: { type: 'number', min: 0, max: 100000, value: product.stock ?? 0 } });
    const sort = el('input', { attrs: { type: 'number', min: -1000, max: 1000, value: product.sortOrder ?? 0 } });
    const summary = input({ value: product.summary || '', maxlength: 200 });
    const description = el('textarea', { text: product.description || '', attrs: { rows: 6, maxlength: 4000 } });
    const shippable = checkbox('Kargoya uygun', product.shippable ?? true, 'shippable');
    const active = checkbox('Yayında (mağazada görünür)', product.isActive ?? false, 'isActive');
    let images = [...(product.images || [])];
    const gallery = el('div', { className: 'admin-gallery' });
    const feedback = feedbackEl();

    const renderGallery = () => {
        gallery.replaceChildren(...images.map((url, index) => {
            const remove = button('Kaldır');
            remove.addEventListener('click', () => { images = images.filter(item => item !== url); renderGallery(); });
            const first = button('Kapak yap', { disabled: index === 0 });
            first.addEventListener('click', () => { images = [url, ...images.filter(item => item !== url)]; renderGallery(); });
            return el('figure', {}, [el('img', { attrs: { src: url, alt: '', width: 120, height: 120, loading: 'lazy' } }), el('figcaption', {}, [first, remove])]);
        }));
        if (!images.length) gallery.append(el('p', { className: 'field-hint', text: 'Henüz görsel yok.' }));
    };
    renderGallery();
    const upload = el('input', { attrs: { type: 'file', accept: 'image/jpeg,image/png,image/webp', disabled: isNew } });
    upload.addEventListener('change', async () => {
        const [file] = upload.files;
        if (!file) return;
        show(feedback, 'Görsel küçültülüp yükleniyor…', 'sending');
        try {
            const image = await resizeImage(file);
            const result = await call('product-image', { body: { productId: product.id, ...image } });
            if (!result.ok) return show(feedback, errorText(result), 'error');
            images.push(result.data.url);
            renderGallery();
            show(feedback, 'Görsel eklendi.', 'success');
        } catch (error) {
            show(feedback, error.message, 'error');
        } finally {
            upload.value = '';
        }
    });

    const submit = el('button', { className: 'btn btn-primary', text: isNew ? 'Ürünü oluştur' : 'Kaydet', attrs: { type: 'submit' } });
    const cancel = button('Vazgeç');
    cancel.addEventListener('click', onCancel);
    const form = el('form', { className: 'contact-form admin-card admin-form', attrs: { novalidate: true } }, [
        el('h3', { text: isNew ? 'Yeni ürün' : product.name }),
        el('div', { className: 'form-row' }, [field('Ürün adı', name), field('Bağlantı adı', slug, 'Sayfa adresi: urun.html?u=…')]),
        el('div', { className: 'form-row' }, [field('Kategori', category), field('Sıra', sort, 'Küçük sayı önce görünür.')]),
        el('div', { className: 'form-row' }, [field('Fiyat (₺, KDV dahil)', price), field('Eski fiyat (₺, isteğe bağlı)', compare, 'İndirimi göstermek için.')]),
        el('div', { className: 'form-row' }, [field('Stok (adet)', stock), el('div', { className: 'form-group admin-checks' }, [shippable.node, active.node])]),
        field('Kısa açıklama', summary, 'Kartlarda ve arama sonuçlarında görünür (en fazla 200 karakter).'),
        field('Açıklama', description, 'Paragrafları boş satırla ayırın.'),
        el('div', { className: 'form-group' }, [el('span', { className: 'admin-label', text: 'Görseller (en fazla 6; ilk görsel kapaktır)' }), gallery,
            isNew ? el('small', { className: 'field-hint', text: 'Görsel eklemek için önce ürünü oluşturun.' }) : field('Görsel ekle', upload, 'JPEG, PNG ya da WebP; tarayıcıda 1600 px\'e küçültülür.')]),
        el('div', { className: 'form-actions' }, [submit, cancel]),
        feedback
    ]);
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const priceValue = parseLira(price.value);
        const compareValue = compare.value.trim() ? parseLira(compare.value) : null;
        if (!Number.isInteger(priceValue) || priceValue < 1) return show(feedback, 'Fiyatı "1250" ya da "1.250,50" biçiminde girin.', 'error');
        if (compareValue !== null && !Number.isInteger(compareValue)) return show(feedback, 'Eski fiyat geçersiz.', 'error');
        submit.disabled = true;
        show(feedback, 'Kaydediliyor…', 'sending');
        const result = await call('product-save', {
            body: {
                id: product.id, name: name.value, slug: slug.value.trim(), categoryId: category.value || null, price: priceValue,
                compareAtPrice: compareValue, stock: Number(stock.value), sortOrder: Number(sort.value), summary: summary.value,
                description: description.value, shippable: shippable.box.checked, isActive: active.box.checked, images
            }
        });
        submit.disabled = false;
        if (!result.ok) return show(feedback, errorText(result), 'error');
        // Görselsiz yeni ürün görsel eklemek için açık kalır; görseli olan ürün listeye döner
        onSaved(result.data.id, isNew && images.length === 0);
    });
    return form;
}

async function renderProducts(panel, { editId } = {}) {
    const result = await call('products', { method: 'GET' });
    if (!result.ok) return panel.replaceChildren(el('p', { className: 'form-feedback', text: errorText(result), attrs: { 'data-state': 'error' } }));
    const { products, categories } = result.data;
    const reload = (id) => renderProducts(panel, { editId: id });
    const open = (product) => panel.replaceChildren(productForm(product, categories, (id, isNew) => reload(isNew ? id : null), () => reload()));
    if (editId) {
        const product = products.find(item => item.id === editId);
        if (product) return open(product);
    }
    const create = button('Yeni ürün', {}, 'btn btn-primary btn-sm');
    create.addEventListener('click', () => open({}));
    const categoryName = new Map(categories.map(item => [item.id, item.name]));
    const rows = products.map(product => {
        const edit = button('Düzenle');
        edit.addEventListener('click', () => open(product));
        return el('tr', {}, [
            el('td', {}, [el('div', { className: 'admin-product' }, [
                el('img', { className: product.images[0] ? '' : 'is-placeholder', attrs: { src: product.images[0] || 'images/favicon.png', alt: '', width: 48, height: 48, loading: 'lazy' } }),
                el('div', {}, [el('strong', { text: product.name }), el('div', { className: 'order-item-meta', text: categoryName.get(product.categoryId) || 'Kategorisiz' })])
            ])]),
            el('td', { text: formatPrice(product.price) }),
            el('td', { text: `${product.stock} adet` }),
            el('td', {}, [el('span', { className: 'status-pill', text: product.isActive ? 'Yayında' : 'Taslak', attrs: { 'data-status': product.isActive ? 'paid' : 'cancelled' } })]),
            el('td', {}, [edit])
        ]);
    });
    // Hazır taslaklar: gerçek fotoğraf, ad, kategori ve açıklama hazır; fiyat ve stok işletme tarafından girilir
    const useDraft = async (draft, trigger) => {
        trigger.disabled = true;
        let category = categories.find(item => item.slug === draft.category);
        if (!category) {
            const meta = DRAFT_CATEGORIES.find(item => item.slug === draft.category);
            const created = await call('category-save', { body: { name: meta.name, slug: meta.slug, sortOrder: meta.sortOrder, isActive: true, description: '' } });
            if (!created.ok) {
                trigger.disabled = false;
                return window.alert(errorText(created));
            }
            category = { id: created.data.id, slug: meta.slug, name: meta.name };
            categories.push(category);
        }
        open({ name: draft.name, slug: draft.slug, categoryId: category.id, summary: draft.summary, description: draft.description,
            shippable: draft.shippable, isActive: true, stock: 0, images: [draft.image] });
    };
    const existing = new Set(products.map(item => item.slug));
    const drafts = PRODUCT_DRAFTS.filter(draft => !existing.has(draft.slug));
    const draftCard = (draft) => {
        const use = button('Fiyat gir ve ekle', {}, 'btn btn-primary btn-sm');
        use.addEventListener('click', () => useDraft(draft, use));
        return el('article', { className: 'admin-draft' }, [
            el('img', { attrs: { src: draft.image, alt: draft.name, width: 160, height: 160, loading: 'lazy' } }),
            el('div', {}, [el('strong', { text: draft.name }), el('p', { className: 'order-item-meta', text: draft.summary })]),
            use
        ]);
    };
    const draftGroups = DRAFT_CATEGORIES
        .map(meta => ({ meta, items: drafts.filter(draft => draft.category === meta.slug) }))
        .filter(group => group.items.length)
        .map(({ meta, items }) => el('div', { className: 'admin-draft-group' }, [
            el('h4', { text: `${meta.name} (${items.length})` }),
            el('div', { className: 'admin-drafts' }, items.map(draftCard))
        ]));
    const draftSection = drafts.length ? el('section', { className: 'admin-card' }, [
        el('h3', { text: 'Hazır taslaklar' }),
        el('p', { className: 'field-hint', text: 'Fotoğrafı, adı ve açıklaması hazır ürünler. Seçtiğiniz taslakta yalnızca fiyatı ve stoğu girip kaydedin; fotoğrafı sonra kendi çektiğinizle değiştirebilirsiniz.' }),
        ...draftGroups
    ]) : null;

    panel.replaceChildren(
        el('div', { className: 'admin-toolbar' }, [el('p', { className: 'field-hint', text: `${products.length} ürün · ${products.filter(item => item.isActive).length} yayında` }), create]),
        products.length
            ? el('div', { className: 'admin-table-wrap' }, [el('table', { className: 'ledger admin-table' }, [
                el('thead', {}, [el('tr', {}, ['Ürün', 'Fiyat', 'Stok', 'Durum', ''].map(text => el('th', { text, attrs: { scope: 'col' } })))]),
                el('tbody', {}, rows)
            ])])
            : el('p', { className: 'field-hint', text: 'Henüz ürün yok. Aşağıdaki hazır taslaklardan başlayabilir ya da "Yeni ürün" ile ekleyebilirsiniz.' }),
        draftSection
    );
}

async function renderCategories(panel) {
    const result = await call('products', { method: 'GET' });
    if (!result.ok) return panel.replaceChildren(el('p', { className: 'form-feedback', text: errorText(result), attrs: { 'data-state': 'error' } }));
    const form = (category = {}) => {
        const name = input({ value: category.name || '', maxlength: 60 });
        const slug = input({ value: category.slug || '', maxlength: 60 });
        if (!category.id) name.addEventListener('input', () => { slug.value = slugify(name.value).slice(0, 60); });
        const description = input({ value: category.description || '', maxlength: 500 });
        const sort = el('input', { attrs: { type: 'number', min: -1000, max: 1000, value: category.sortOrder ?? 0 } });
        const active = checkbox('Yayında', category.isActive ?? true, 'isActive');
        const feedback = feedbackEl();
        const submit = el('button', { className: 'btn btn-primary btn-sm', text: category.id ? 'Kaydet' : 'Kategori ekle', attrs: { type: 'submit' } });
        const node = el('form', { className: 'contact-form admin-card', attrs: { novalidate: true } }, [
            el('div', { className: 'form-row' }, [field('Kategori adı', name), field('Bağlantı adı', slug)]),
            el('div', { className: 'form-row' }, [field('Açıklama', description), field('Sıra', sort)]),
            active.node, el('div', { className: 'form-actions' }, [submit]), feedback
        ]);
        node.addEventListener('submit', async (event) => {
            event.preventDefault();
            submit.disabled = true;
            const saved = await call('category-save', { body: { id: category.id, name: name.value, slug: slug.value.trim(), description: description.value, sortOrder: Number(sort.value), isActive: active.box.checked } });
            submit.disabled = false;
            if (!saved.ok) return show(feedback, errorText(saved), 'error');
            renderCategories(panel);
        });
        return node;
    };
    panel.replaceChildren(
        el('h3', { text: 'Yeni kategori' }), form(),
        el('h3', { text: 'Kategoriler' }),
        ...(result.data.categories.length ? result.data.categories.map(category => el('details', { className: 'order-item' }, [
            el('summary', {}, [el('span', { className: 'order-item-code', text: category.name }), el('span', { className: 'status-pill', text: category.isActive ? 'Yayında' : 'Gizli', attrs: { 'data-status': category.isActive ? 'paid' : 'cancelled' } })]),
            el('div', { className: 'order-item-body' }, [form(category)])
        ])) : [el('p', { className: 'field-hint', text: 'Henüz kategori yok.' })])
    );
}

// ---------- Müşteri ve puan ----------

function renderCustomers(panel) {
    const email = input({ type: 'email', placeholder: 'musteri@ornek.com', autocomplete: 'off' });
    const holder = el('div');
    const search = el('button', { className: 'btn btn-primary btn-sm', text: 'Bul', attrs: { type: 'submit' } });
    const form = el('form', { className: 'admin-toolbar', attrs: { novalidate: true } }, [field('Müşteri e-postası', email), search]);
    const load = async () => {
        const result = await call('customer', { method: 'GET', query: { email: email.value.trim() } });
        if (!result.ok) return holder.replaceChildren(el('p', { className: 'form-feedback', text: errorText(result), attrs: { 'data-state': 'error' } }));
        const { customer, balance, entries } = result.data;
        const points = el('input', { attrs: { type: 'number', step: 1, placeholder: 'ör. 200 ya da -100' } });
        const note = input({ maxlength: 300, placeholder: 'Açıklama (zorunlu, müşteriye görünür)' });
        const feedback = feedbackEl();
        const apply = el('button', { className: 'btn btn-primary btn-sm', text: 'Düzeltmeyi kaydet', attrs: { type: 'submit' } });
        const adjust = el('form', { className: 'contact-form admin-card', attrs: { novalidate: true } }, [
            el('h3', { text: 'Puan düzeltmesi' }),
            el('p', { className: 'field-hint', text: 'Defterdeki kayıtlar değiştirilmez; düzeltme yeni bir kayıt olarak eklenir. Eksi değer puan düşer.' }),
            el('div', { className: 'form-row' }, [field('Puan', points), field('Açıklama', note)]), apply, feedback
        ]);
        adjust.addEventListener('submit', async (event) => {
            event.preventDefault();
            const value = Number(points.value);
            if (!Number.isInteger(value) || value === 0) return show(feedback, 'Sıfırdan farklı bir tam sayı girin.', 'error');
            if (!window.confirm(`${customer.email} hesabına ${value > 0 ? '+' : ''}${value} puan işlensin mi?`)) return;
            apply.disabled = true;
            const saved = await call('points-adjust', { body: { userId: customer.id, points: value, note: note.value } });
            apply.disabled = false;
            if (!saved.ok) return show(feedback, errorText(saved), 'error');
            load();
        });
        holder.replaceChildren(
            el('section', { className: 'admin-card' }, [
                el('h3', { text: customer.fullName }),
                el('p', { text: [customer.email, customer.phone, `Üyelik: ${formatDate(customer.createdAt)}`].filter(Boolean).join(' · ') }),
                el('div', { className: 'points-hero' }, [
                    el('div', { className: 'points-stat' }, [el('strong', { text: String(balance.available) }), el('span', { text: 'kullanılabilir puan' })]),
                    el('div', { className: 'points-stat' }, [el('strong', { text: String(balance.pending) }), el('span', { text: 'bekleyen puan' })])
                ]),
                entries.length ? el('table', { className: 'ledger' }, [el('tbody', {}, entries.map(entry => el('tr', {}, [
                    el('td', { text: entry.kind }), el('td', { text: `${formatDateTime(entry.createdAt)} · ${entry.note}` }),
                    el('td', { className: entry.points > 0 ? 'is-plus' : 'is-minus', text: String(entry.points) })
                ])))]) : el('p', { className: 'field-hint', text: 'Puan hareketi yok.' })
            ]),
            adjust
        );
    };
    form.addEventListener('submit', (event) => { event.preventDefault(); load(); });
    panel.replaceChildren(form, holder);
}

// ---------- Ayarlar ----------

async function renderSettings(panel) {
    const result = await call('settings', { method: 'GET' });
    if (!result.ok) return panel.replaceChildren(el('p', { className: 'form-feedback', text: errorText(result), attrs: { 'data-state': 'error' } }));
    const { shipping, bank, store, loyalty } = result.data.settings;
    const f = {
        fee: input({ value: liraInput(shipping.fee), inputmode: 'decimal' }),
        free: input({ value: liraInput(shipping.freeThreshold), inputmode: 'decimal' }),
        capacity: el('input', { attrs: { type: 'number', min: 0, max: 1000, value: shipping.weeklyCapacity } }),
        cutoff: el('input', { attrs: { type: 'number', min: 0, max: 23, value: shipping.orderCutoffHour } }),
        bankName: input({ value: bank.bankName, maxlength: 80 }),
        holder: input({ value: bank.accountHolder, maxlength: 120 }),
        iban: input({ value: bank.iban, maxlength: 40, placeholder: 'TR00 0000 0000 0000 0000 0000 00' }),
        address: input({ value: store.pickupAddress, maxlength: 200 }),
        hours: input({ value: store.pickupHours, maxlength: 100 }),
        perLira: el('input', { attrs: { type: 'number', min: 0, max: 10, step: 0.1, value: loyalty.pointsPerLira } }),
        perUnit: el('input', { attrs: { type: 'number', min: 1, max: 10000, value: loyalty.pointsPerUnit } }),
        unitValue: input({ value: liraInput(loyalty.unitValue), inputmode: 'decimal' }),
        maxRatio: el('input', { attrs: { type: 'number', min: 0, max: 100, value: Math.round(loyalty.maxRatio * 100) } }),
        activation: el('input', { attrs: { type: 'number', min: 0, max: 90, value: loyalty.activationDays } }),
        months: el('input', { attrs: { type: 'number', min: 1, max: 60, value: loyalty.validMonths } })
    };
    const feedback = feedbackEl();
    const submit = el('button', { className: 'btn btn-primary', text: 'Ayarları kaydet', attrs: { type: 'submit' } });
    const group = (title, children) => el('fieldset', { className: 'checkout-step' }, [el('legend', {}, [el('span', { text: title })]), ...children]);
    const form = el('form', { className: 'contact-form admin-form', attrs: { novalidate: true } }, [
        group('Kargo', [el('div', { className: 'form-row' }, [field('Kargo ücreti (₺)', f.fee), field('Ücretsiz kargo eşiği (₺)', f.free)]),
            el('div', { className: 'form-row' }, [field('Haftalık kargo kapasitesi (sipariş)', f.capacity), field('Sipariş kesim saati', f.cutoff, 'Bu saatten sonra verilen sipariş bir gün sonraki cumartesiye göre planlanır.')])]),
        group('Havale/EFT', [el('p', { className: 'field-hint', text: 'IBAN boşken müşteriler yalnızca mağazada ödemeyi seçebilir ve kargo kapalıdır.' }),
            el('div', { className: 'form-row' }, [field('Banka', f.bankName), field('Hesap sahibi', f.holder)]), field('IBAN', f.iban)]),
        group('Teslim alma', [field('Adres', f.address), field('Saatler', f.hours)]),
        group('Sadakat puanı', [el('div', { className: 'form-row' }, [field('1 ₺ için puan', f.perLira), field('Kullanım birimi (puan)', f.perUnit)]),
            el('div', { className: 'form-row' }, [field('Birimin değeri (₺)', f.unitValue), field('Puanla ödenebilecek en fazla oran (%)', f.maxRatio)]),
            el('div', { className: 'form-row' }, [field('Aktifleşme süresi (gün)', f.activation), field('Geçerlilik (ay)', f.months)])]),
        el('div', { className: 'form-actions' }, [submit]), feedback
    ]);
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        submit.disabled = true;
        const saved = await call('settings-save', {
            body: {
                shipping: { fee: parseLira(f.fee.value), freeThreshold: parseLira(f.free.value), weeklyCapacity: Number(f.capacity.value), orderCutoffHour: Number(f.cutoff.value) },
                bank: { bankName: f.bankName.value, accountHolder: f.holder.value, iban: f.iban.value },
                store: { pickupAddress: f.address.value, pickupHours: f.hours.value },
                loyalty: {
                    pointsPerLira: Number(f.perLira.value), pointsPerUnit: Number(f.perUnit.value), unitValue: parseLira(f.unitValue.value),
                    maxRatio: Number(f.maxRatio.value) / 100, activationDays: Number(f.activation.value), validMonths: Number(f.months.value)
                }
            }
        });
        submit.disabled = false;
        show(feedback, saved.ok ? 'Ayarlar kaydedildi.' : errorText(saved), saved.ok ? 'success' : 'error');
    });
    panel.replaceChildren(form);
}

async function renderAudit(panel) {
    const result = await call('audit', { method: 'GET' });
    if (!result.ok) return panel.replaceChildren(el('p', { className: 'form-feedback', text: errorText(result), attrs: { 'data-state': 'error' } }));
    panel.replaceChildren(el('div', { className: 'admin-table-wrap' }, [el('table', { className: 'ledger admin-table' }, [
        el('thead', {}, [el('tr', {}, ['Zaman', 'İşlem', 'Hedef'].map(text => el('th', { text, attrs: { scope: 'col' } })))]),
        el('tbody', {}, result.data.entries.map(entry => el('tr', {}, [
            el('td', { text: formatDateTime(entry.at) }), el('td', { text: entry.action }), el('td', { text: entry.target || '' })
        ])))
    ])]));
}

// ---------- Sekmeler ----------

const TABS = [
    ['ozet', 'Özet', 'chart-line', renderDashboard],
    ['siparisler', 'Siparişler', 'box', renderOrders],
    ['kargo', 'Kargo listesi', 'truck', renderShipping],
    ['urunler', 'Ürünler', 'seedling', renderProducts],
    ['kategoriler', 'Kategoriler', 'tags', renderCategories],
    ['musteri', 'Müşteri ve puan', 'user', renderCustomers],
    ['ayarlar', 'Ayarlar', 'cog', renderSettings],
    ['kayitlar', 'Kayıtlar', 'history', renderAudit]
];
let openTab = () => {};

function renderPanel(holder) {
    const tablist = el('div', { className: 'account-tabs admin-tabs', attrs: { role: 'tablist', 'aria-label': 'Yönetim bölümleri' } });
    const panel = el('section', { className: 'account-panel admin-panel', attrs: { role: 'tabpanel', tabindex: '0', 'aria-live': 'polite' } });
    const buttons = TABS.map(([name, label, iconName]) => {
        const tab = el('button', { attrs: { type: 'button', role: 'tab', 'data-tab': name, id: `admin-tab-${name}`, 'aria-selected': 'false' } }, [icon(iconName), el('span', { text: label })]);
        tab.addEventListener('click', () => openTab(name));
        return tab;
    });
    tablist.append(...buttons);
    openTab = (name, options = {}) => {
        const [, , , render] = TABS.find(([tab]) => tab === name) || TABS[0];
        for (const tab of buttons) tab.setAttribute('aria-selected', String(tab.dataset.tab === name));
        panel.setAttribute('aria-labelledby', `admin-tab-${name}`);
        history.replaceState(null, '', `#${name}`);
        panel.replaceChildren(el('p', { className: 'shop-loading', text: 'Yükleniyor…' }));
        render(panel, options);
    };
    holder.replaceChildren(tablist, panel);
    const initial = location.hash.slice(1);
    openTab(TABS.some(([name]) => name === initial) ? initial : 'ozet');
}

async function init() {
    const holder = root.querySelector('[data-admin-body]');
    const greeting = root.querySelector('[data-admin-greeting]');
    const status = await api('admin', 'mfa-status', { method: 'GET' });
    if (status.status === 401) return location.assign(loginUrl());
    if (!status.ok) {
        greeting.textContent = errorText(status);
        holder.replaceChildren();
        return;
    }
    greeting.textContent = `Hoş geldiniz, ${status.data.name}.`;
    if (status.data.aal !== 'aal2') return renderMfa(holder, status.data);
    renderPanel(holder);
}

if (root) init();
