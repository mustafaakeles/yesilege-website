// Yeşil Ege — sepet ve ödeme sayfaları. Tutarlar her zaman sunucudan (quote) gelir; tarayıcı yalnızca kimlik ve adet tutar.

import { api, el, errorText, formatDate, formatPrice, icon, isSignedIn, loginUrl, show } from './api-client.js';
import { MAX_QTY, clearCart, readCart, removeFromCart, replaceCart, setQty } from './cart-store.js';

const DELIVERY_KEY = 'ye_delivery';
const PLACEHOLDER = 'images/favicon.png';
const QUOTE_ERRORS = {
    product_unavailable: 'Sepetinizdeki bir ürün artık satışta değil; listeden çıkarıldı.',
    out_of_stock: 'Bazı ürünlerin stoğu istediğiniz adetten az. Lütfen adetleri güncelleyin.',
    not_shippable: 'Sepetinizde kargoyla gönderilemeyen ürün var. Teslim almayı seçin ya da ürünü çıkarın.',
    invalid_qty: 'Ürün adetleri 1 ile 99 arasında olmalıdır.',
    points_exceed: 'Puanla sipariş tutarının en fazla %30\'unu ödeyebilirsiniz.',
    points_insufficient: 'Puan bakiyeniz yetersiz.',
    points_invalid: 'Puan miktarı geçersiz.'
};

const readDelivery = () => {
    try {
        return sessionStorage.getItem(DELIVERY_KEY) === 'pickup' ? 'pickup' : 'cargo';
    } catch {
        return 'cargo';
    }
};
const saveDelivery = (value) => {
    try { sessionStorage.setItem(DELIVERY_KEY, value); } catch { /* yalnızca bu sayfa için */ }
};

async function fetchQuote(delivery, points = 0) {
    const items = readCart();
    if (items.length === 0) return { ok: true, empty: true };
    const result = await api('checkout', 'quote', { body: { items, delivery, points } });
    if (!result.ok) return result;
    // Satıştan kalkan ürünler sepetten sessizce çıkarılır
    const known = new Set(result.data.quote.lines.map(line => line.id));
    if (known.size !== items.length) replaceCart(items.filter(item => known.has(item.id)));
    return { ok: true, quote: result.data.quote };
}

function summaryRows(quote, { showPoints = false } = {}) {
    const rows = [
        ['Ara toplam', formatPrice(quote.subtotal)],
        ['Kargo', quote.shippingFee ? formatPrice(quote.shippingFee) : 'Ücretsiz']
    ];
    if (showPoints && quote.discount) rows.push([`Puan indirimi (${quote.points} puan)`, `−${formatPrice(quote.discount)}`]);
    const list = el('dl', { className: 'order-summary-rows' });
    for (const [label, value] of rows) list.append(el('dt', { text: label }), el('dd', { text: value }));
    list.append(el('dt', { className: 'is-total', text: 'Toplam' }), el('dd', { className: 'is-total', text: formatPrice(quote.total) }));
    return list;
}

function freeShippingHint(quote, delivery) {
    if (delivery !== 'cargo' || !quote.shippingFee || !quote.freeThreshold) return null;
    const left = quote.freeThreshold - quote.subtotal;
    return el('p', { className: 'free-shipping-hint' }, [icon('truck'), el('span', { text: `${formatPrice(left)} daha ekleyin, kargo ücretsiz olsun.` })]);
}

function deliveryChoice(name, current, onChange, store) {
    const option = (value, title, text, iconName) => {
        const input = el('input', { attrs: { type: 'radio', name, value, checked: current === value } });
        input.addEventListener('change', () => onChange(value));
        return el('label', { className: 'choice-card' }, [input, el('span', { className: 'choice-card-body' }, [
            el('span', { className: 'choice-card-title' }, [icon(iconName), el('span', { text: title })]),
            el('span', { className: 'choice-card-text', text })
        ])]);
    };
    return el('div', { className: 'choice-grid', attrs: { role: 'radiogroup', 'aria-label': 'Teslimat yöntemi' } }, [
        option('cargo', 'Cumartesi kargo', 'Siparişiniz ilk uygun cumartesi kargoya verilir.', 'truck'),
        option('pickup', 'Fidanlıktan teslim al', store?.pickupAddress ? `${store.pickupAddress} · ${store.pickupHours}` : 'Bayındır\'daki fidanlığımızdan teslim alın.', 'store')
    ]);
}

function lineRow(line, onChange) {
    const qty = el('input', { attrs: { type: 'number', min: 1, max: MAX_QTY, value: line.qty, inputmode: 'numeric', 'aria-label': `${line.name} adedi` } });
    const commit = (value) => {
        const next = Math.min(MAX_QTY, Math.max(1, Math.trunc(Number(value)) || 1));
        qty.value = String(next);
        setQty(line.id, next);
        onChange();
    };
    qty.addEventListener('change', () => commit(qty.value));
    const minus = el('button', { attrs: { type: 'button', 'aria-label': `${line.name} adedini azalt` } }, [icon('minus')]);
    const plus = el('button', { attrs: { type: 'button', 'aria-label': `${line.name} adedini artır` } }, [icon('plus')]);
    minus.addEventListener('click', () => commit(Number(qty.value) - 1));
    plus.addEventListener('click', () => commit(Number(qty.value) + 1));
    const remove = el('button', { className: 'cart-remove', attrs: { type: 'button', 'aria-label': `${line.name} ürününü sepetten çıkar` } }, [icon('trash-alt')]);
    remove.addEventListener('click', () => { removeFromCart(line.id); onChange(); });

    const warnings = [];
    if (!line.stockOk) warnings.push('Stok bu adet için yetersiz.');
    return el('li', { className: 'cart-line' }, [
        el('a', { className: 'cart-line-media', attrs: { href: `urun.html?u=${encodeURIComponent(line.slug)}`, tabindex: '-1', 'aria-hidden': 'true' } },
            [el('img', { className: line.image ? '' : 'is-placeholder', attrs: { src: line.image || PLACEHOLDER, alt: '', width: 96, height: 96, loading: 'lazy' } })]),
        el('div', { className: 'cart-line-info' }, [
            el('a', { className: 'cart-line-name', text: line.name, attrs: { href: `urun.html?u=${encodeURIComponent(line.slug)}` } }),
            el('span', { className: 'cart-line-unit', text: `${formatPrice(line.unitPrice)} / adet` }),
            line.shippable ? null : el('span', { className: 'cart-line-note', text: 'Yalnızca teslim alınabilir' }),
            ...warnings.map(text => el('span', { className: 'cart-line-warning', text }))
        ]),
        el('div', { className: 'qty-stepper' }, [minus, qty, plus]),
        el('strong', { className: 'cart-line-total', text: formatPrice(line.lineTotal) }),
        remove
    ]);
}

function emptyCart() {
    return el('div', { className: 'shop-empty' }, [
        icon('shopping-basket'), el('h2', { text: 'Sepetiniz boş' }),
        el('p', { text: 'Mağazamızdaki bitkilere göz atarak sepetinize ürün ekleyebilirsiniz.' }),
        el('a', { className: 'btn btn-primary', text: 'Mağazaya git', attrs: { href: 'magaza.html' } })
    ]);
}

// ---------- Sepet ----------

async function initCart(root) {
    const body = root.querySelector('[data-cart-body]');
    const optionsResult = await api('checkout', 'options', { method: 'GET' });
    const store = optionsResult.ok ? optionsResult.data.store : null;
    let delivery = readDelivery();

    const render = async () => {
        body.setAttribute('aria-busy', 'true');
        const result = await fetchQuote(delivery);
        body.removeAttribute('aria-busy');
        if (result.empty) return body.replaceChildren(emptyCart());
        if (!result.ok) return body.replaceChildren(el('p', { className: 'form-feedback', text: errorText(result), attrs: { 'data-state': 'error' } }));
        const { quote } = result;
        if (quote.lines.length === 0) return body.replaceChildren(emptyCart());

        const notices = quote.errors.map(code => QUOTE_ERRORS[code]).filter(Boolean);
        const checkout = el('a', { className: 'btn btn-primary btn-block', attrs: { href: isSignedIn() ? 'odeme.html' : loginUrl('/odeme.html') } },
            [el('span', { text: isSignedIn() ? 'Ödemeye geç' : 'Giriş yap ve ödemeye geç' }), icon('arrow-right')]);
        if (quote.errors.length) {
            checkout.setAttribute('aria-disabled', 'true');
            checkout.classList.add('is-disabled');
            checkout.addEventListener('click', event => event.preventDefault());
        }
        body.replaceChildren(
            el('div', { className: 'cart-main' }, [
                el('ul', { className: 'cart-lines' }, quote.lines.map(line => lineRow(line, render))),
                ...notices.map(text => el('p', { className: 'form-feedback', text, attrs: { 'data-state': 'error', role: 'alert' } }))
            ]),
            el('aside', { className: 'order-summary', attrs: { 'aria-label': 'Sipariş özeti' } }, [
                el('h2', { text: 'Teslimat' }),
                deliveryChoice('cart-delivery', delivery, (value) => { delivery = value; saveDelivery(value); render(); }, store),
                el('h2', { text: 'Özet' }),
                summaryRows(quote),
                freeShippingHint(quote, delivery),
                checkout,
                el('a', { className: 'link-arrow', text: 'Alışverişe devam et', attrs: { href: 'magaza.html' } })
            ])
        );
    };
    window.addEventListener('storage', (event) => { if (event.key === 'ye_cart_v1') render(); });
    await render();
}

// ---------- Ödeme ----------

function addressOption(address, checked) {
    const input = el('input', { attrs: { type: 'radio', name: 'addressId', value: address.id, checked, required: true } });
    const text = [address.line, address.neighbourhood, `${address.district}/${address.city}`].filter(Boolean).join(', ');
    return el('label', { className: 'choice-card' }, [input, el('span', { className: 'choice-card-body' }, [
        el('span', { className: 'choice-card-title' }, [icon('map-marker-alt'), el('span', { text: `${address.title} · ${address.recipientName}` })]),
        el('span', { className: 'choice-card-text', text }),
        el('span', { className: 'choice-card-text', text: address.phone })
    ])]);
}

function confirmation(order, bank) {
    const copy = (value) => {
        const button = el('button', { className: 'btn btn-ghost btn-sm', attrs: { type: 'button' } }, [icon('copy'), el('span', { text: 'Kopyala' })]);
        button.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(value);
                button.lastChild.textContent = 'Kopyalandı';
            } catch {
                button.lastChild.textContent = 'Kopyalanamadı';
            }
        });
        return button;
    };
    const steps = bank
        ? el('div', { className: 'bank-box' }, [
            el('h3', { text: 'Havale/EFT bilgileri' }),
            el('dl', {}, [
                el('dt', { text: 'Banka' }), el('dd', { text: bank.bankName }),
                el('dt', { text: 'Hesap sahibi' }), el('dd', { text: bank.accountHolder }),
                el('dt', { text: 'IBAN' }), el('dd', {}, [el('span', { className: 'iban', text: bank.iban }), copy(bank.iban.replace(/\s/g, ''))]),
                el('dt', { text: 'Açıklama' }), el('dd', {}, [el('strong', { text: order.code }), copy(order.code)]),
                el('dt', { text: 'Tutar' }), el('dd', { text: formatPrice(order.total) })
            ]),
            el('p', { text: 'Ödemeniz hesabımıza ulaştığında siparişinizi onaylayıp size e-posta göndereceğiz.' })
        ])
        : el('p', { text: 'Siparişiniz hazır olduğunda size haber vereceğiz. Ödemeyi fidanlığımızda teslim alırken yapabilirsiniz.' });
    return el('div', { className: 'order-confirmation', attrs: { tabindex: '-1' } }, [
        el('span', { className: 'order-confirmation-icon' }, [icon('check')]),
        el('h1', { text: 'Siparişiniz alındı' }),
        el('p', { className: 'order-code' }, [el('span', { text: 'Sipariş kodu: ' }), el('strong', { text: order.code })]),
        order.deliveryMethod === 'cargo' && order.shipDate ? el('p', { text: `Planlanan kargo günü: ${formatDate(order.shipDate)} (cumartesi)` }) : null,
        steps,
        el('div', { className: 'form-actions' }, [
            el('a', { className: 'btn btn-primary', text: 'Siparişlerime git', attrs: { href: 'hesabim.html#siparisler' } }),
            el('a', { className: 'btn btn-ghost', text: 'Alışverişe devam et', attrs: { href: 'magaza.html' } })
        ])
    ]);
}

async function initCheckout(root) {
    if (!isSignedIn()) return location.assign(loginUrl());
    const holder = root.querySelector('[data-checkout-body]');
    if (readCart().length === 0) return holder.replaceChildren(emptyCart());

    const [me, options, addresses] = await Promise.all([
        api('account', 'me', { method: 'GET' }),
        api('checkout', 'options', { method: 'GET' }),
        api('account', 'addresses', { method: 'GET' })
    ]);
    if (me.status === 401) return location.assign(loginUrl());
    if (!me.ok || !options.ok) return holder.replaceChildren(el('p', { className: 'form-feedback', text: errorText(me.ok ? options : me), attrs: { 'data-state': 'error' } }));
    if (!me.data.user.emailVerified) {
        return holder.replaceChildren(el('div', { className: 'shop-empty' }, [icon('envelope'), el('h2', { text: 'E-posta adresinizi doğrulayın' }),
            el('p', { text: 'Sipariş verebilmek için e-postanıza gönderdiğimiz doğrulama bağlantısına tıklayın.' })]));
    }

    const { bankEnabled, store } = options.data;
    const savedAddresses = addresses.ok ? addresses.data.addresses : [];
    let delivery = readDelivery();
    let points = 0;
    let payment = bankEnabled ? 'bank_transfer' : 'pay_at_store';
    if (!bankEnabled) delivery = 'pickup';

    const form = el('form', { className: 'checkout-form', attrs: { novalidate: true } });
    const summary = el('aside', { className: 'order-summary', attrs: { 'aria-label': 'Sipariş özeti', 'aria-live': 'polite' } });
    const feedback = el('p', { className: 'form-feedback', attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } });
    const submit = el('button', { className: 'btn btn-primary btn-block', attrs: { type: 'submit' } }, [el('span', { text: 'Siparişi onayla' }), icon('lock')]);
    let lastQuote = null;

    const section = (number, title, content) => el('fieldset', { className: 'checkout-step' }, [
        el('legend', {}, [el('span', { className: 'step-number', text: number }), el('span', { text: title })]), ...content
    ]);

    const renderSummary = async () => {
        summary.setAttribute('aria-busy', 'true');
        const result = await fetchQuote(delivery, points);
        summary.removeAttribute('aria-busy');
        if (result.empty) return holder.replaceChildren(emptyCart());
        if (!result.ok) return show(feedback, errorText(result), 'error');
        lastQuote = result.quote;
        const errors = lastQuote.errors.map(code => QUOTE_ERRORS[code]).filter(Boolean);
        summary.replaceChildren(
            el('h2', { text: 'Sipariş özeti' }),
            el('ul', { className: 'summary-lines' }, lastQuote.lines.map(line => el('li', {}, [
                el('span', { text: `${line.qty} × ${line.name}` }), el('span', { text: formatPrice(line.lineTotal) })
            ]))),
            summaryRows(lastQuote, { showPoints: true }),
            delivery === 'cargo' && lastQuote.shipDate ? el('p', { className: 'ship-date' }, [icon('calendar-alt'), el('span', { text: `Planlanan kargo: ${formatDate(lastQuote.shipDate)}` })]) : null,
            ...errors.map(text => el('p', { className: 'form-feedback', text, attrs: { 'data-state': 'error' } }))
        );
        submit.disabled = lastQuote.errors.length > 0;
        renderPoints();
    };

    // Teslimat ve ödeme
    const addressBlock = el('div', { className: 'address-block' });
    const paymentBlock = el('div', { className: 'choice-grid', attrs: { role: 'radiogroup', 'aria-label': 'Ödeme yöntemi' } });
    const renderAddress = () => {
        addressBlock.hidden = delivery !== 'cargo';
        if (savedAddresses.length === 0) {
            addressBlock.replaceChildren(el('p', { text: 'Kayıtlı adresiniz yok.' }),
                el('a', { className: 'btn btn-ghost btn-sm', text: 'Adres ekle', attrs: { href: 'hesabim.html#adresler' } }));
            return;
        }
        const defaultId = (savedAddresses.find(address => address.isDefault) || savedAddresses[0]).id;
        addressBlock.replaceChildren(el('div', { className: 'choice-grid' }, savedAddresses.map(address => addressOption(address, address.id === defaultId))),
            el('a', { className: 'link-arrow', text: 'Yeni adres ekle', attrs: { href: 'hesabim.html#adresler' } }));
    };
    const renderPayment = () => {
        if (delivery === 'cargo' && payment === 'pay_at_store') payment = 'bank_transfer';
        const option = (value, title, text, iconName, enabled) => {
            const input = el('input', { attrs: { type: 'radio', name: 'payment', value, checked: payment === value, disabled: !enabled } });
            input.addEventListener('change', () => { payment = value; });
            return el('label', { className: `choice-card${enabled ? '' : ' is-disabled'}` }, [input, el('span', { className: 'choice-card-body' }, [
                el('span', { className: 'choice-card-title' }, [icon(iconName), el('span', { text: title })]), el('span', { className: 'choice-card-text', text })
            ])]);
        };
        paymentBlock.replaceChildren(
            option('bank_transfer', 'Havale/EFT', bankEnabled ? 'IBAN bilgisi sipariş sonrası gösterilir ve e-postayla gönderilir.' : 'Şu anda kullanılamıyor.', 'university', bankEnabled),
            option('pay_at_store', 'Mağazada öde', 'Yalnızca fidanlıktan teslim almada.', 'store', delivery === 'pickup')
        );
    };
    const deliveryBlock = deliveryChoice('delivery', delivery, (value) => {
        delivery = value;
        saveDelivery(value);
        renderAddress();
        renderPayment();
        renderSummary();
    }, store);
    if (!bankEnabled) deliveryBlock.querySelector('input[value="cargo"]').disabled = true;

    // Puan
    const pointsBlock = el('div', { className: 'points-block' });
    const renderPoints = () => {
        if (!lastQuote) return;
        const { availablePoints, maxPoints } = lastQuote;
        if (!availablePoints) {
            pointsBlock.replaceChildren(el('p', { className: 'field-hint', text: 'Kullanılabilir puanınız yok. Teslim edilen her siparişten puan kazanırsınız.' }));
            return;
        }
        const input = el('input', { attrs: { type: 'number', id: 'points', min: 0, max: maxPoints, step: 100, value: points, inputmode: 'numeric' } });
        const apply = el('button', { className: 'btn btn-ghost btn-sm', text: 'Uygula', attrs: { type: 'button' } });
        const all = el('button', { className: 'btn btn-ghost btn-sm', text: `Tümünü kullan (${maxPoints})`, attrs: { type: 'button', disabled: maxPoints === 0 } });
        apply.addEventListener('click', () => { points = Math.max(0, Math.floor((Number(input.value) || 0) / 100) * 100); renderSummary(); });
        all.addEventListener('click', () => { points = maxPoints; renderSummary(); });
        pointsBlock.replaceChildren(
            el('p', { text: `Kullanılabilir puanınız: ${availablePoints}. Bu siparişte en fazla ${maxPoints} puan kullanabilirsiniz (100 puan = ${formatPrice(500)}).` }),
            el('div', { className: 'points-row' }, [el('label', { className: 'visually-hidden', text: 'Kullanılacak puan', attrs: { for: 'points' } }), input, apply, all])
        );
    };

    const note = el('textarea', { attrs: { id: 'order-note', name: 'note', rows: 3, maxlength: 500, placeholder: 'Teslimatla ilgili notunuz (isteğe bağlı)' } });
    const accept = el('input', { attrs: { type: 'checkbox', id: 'accept', name: 'accept', required: true } });
    const legal = el('label', { className: 'checkbox-label', attrs: { for: 'accept' } }, [
        accept,
        el('span', {}, [
            el('a', { text: 'Ön Bilgilendirme Formu', attrs: { href: 'on-bilgilendirme-formu.html', target: '_blank', rel: 'noopener' } }),
            document.createTextNode('\'nu ve '),
            el('a', { text: 'Mesafeli Satış Sözleşmesi', attrs: { href: 'mesafeli-satis-sozlesmesi.html', target: '_blank', rel: 'noopener' } }),
            document.createTextNode('\'ni okudum, onaylıyorum.')
        ])
    ]);

    form.append(
        section('1', 'Teslimat', [deliveryBlock, addressBlock]),
        section('2', 'Ödeme', [paymentBlock]),
        section('3', 'Sadakat puanı', [pointsBlock]),
        section('4', 'Not', [el('label', { className: 'visually-hidden', text: 'Sipariş notu', attrs: { for: 'order-note' } }), note]),
        el('div', { className: 'checkout-confirm' }, [legal, submit, feedback])
    );
    holder.replaceChildren(form, summary);
    renderAddress();
    renderPayment();
    await renderSummary();

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (submit.disabled) return;
        if (!accept.checked) return show(feedback, 'Devam etmek için sözleşmeleri onaylayın.', 'error');
        const addressId = form.querySelector('input[name="addressId"]:checked')?.value;
        if (delivery === 'cargo' && !addressId) return show(feedback, 'Kargo için bir teslimat adresi seçin.', 'error');
        submit.disabled = true;
        form.setAttribute('aria-busy', 'true');
        show(feedback, 'Siparişiniz oluşturuluyor…', 'sending');
        const result = await api('checkout', 'place', {
            body: { items: readCart(), delivery, payment, addressId, points: lastQuote?.points || 0, note: note.value, accept: true }
        });
        form.removeAttribute('aria-busy');
        if (!result.ok) {
            submit.disabled = false;
            show(feedback, errorText(result), 'error');
            if (result.status === 409) renderSummary();
            return;
        }
        clearCart();
        const done = confirmation(result.data.order, result.data.bank);
        holder.replaceChildren(done);
        root.querySelector('[data-checkout-title]')?.setAttribute('hidden', '');
        done.focus();
        window.scrollTo({ top: 0 });
    });
}

const root = document.querySelector('[data-cart]');
if (root?.dataset.cart === 'cart') initCart(root);
if (root?.dataset.cart === 'checkout') initCheckout(root);
