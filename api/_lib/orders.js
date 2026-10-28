// Sipariş uç noktalarının ortak yardımcıları: hata kodu çevirisi, sipariş biçimlendirme ve sipariş e-postaları.

import { escapeHtml } from './resend.js';

export const ORDER_ERRORS = Object.freeze({
    cart_empty: 'Sepetiniz boş.',
    too_many_lines: 'Sepetinizde en fazla 30 farklı ürün olabilir.',
    invalid_qty: 'Ürün adetleri 1 ile 99 arasında olmalıdır.',
    product_unavailable: 'Sepetinizdeki bir ürün artık satışta değil. Lütfen sepetinizi kontrol edin.',
    out_of_stock: 'Sepetinizdeki bir ürünün stoğu yetersiz. Lütfen adetleri kontrol edin.',
    not_shippable: 'Sepetinizde kargoyla gönderilemeyen bir ürün var. Teslim almayı seçin ya da ürünü çıkarın.',
    invalid_delivery: 'Teslimat seçimi geçersiz.',
    invalid_payment: 'Ödeme seçimi geçersiz. Mağazada ödeme yalnızca teslim almada kullanılabilir.',
    bank_unavailable: 'Havale/EFT şu anda kullanılamıyor. Lütfen mağazada ödemeyi seçin ya da bizimle iletişime geçin.',
    address_required: 'Kargo için bir teslimat adresi seçin.',
    email_not_verified: 'Sipariş verebilmek için e-posta adresinizi doğrulamanız gerekir.',
    points_invalid: 'Puan miktarı geçersiz.',
    points_insufficient: 'Puan bakiyeniz yetersiz.',
    points_exceed: 'Puanla sipariş tutarının en fazla %30\'unu ödeyebilirsiniz.',
    capacity_full: 'Önümüzdeki haftaların kargo kapasitesi dolu. Lütfen teslim almayı seçin ya da bizimle iletişime geçin.',
    order_not_found: 'Sipariş bulunamadı.',
    already_cancelled: 'Bu sipariş zaten iptal edilmiş.',
    cannot_cancel: 'Bu sipariş artık iptal edilemiyor. Lütfen bizimle iletişime geçin.',
    invalid_transition: 'Bu durum değişikliği yapılamaz.',
    invalid_adjustment: 'Puan düzeltmesi geçersiz. Miktar ve en az 3 karakterlik açıklama girin.',
    user_not_found: 'Kullanıcı bulunamadı.'
});

export const STATUS_LABELS = Object.freeze({
    awaiting_payment: 'Ödeme bekleniyor',
    paid: 'Ödeme alındı',
    preparing: 'Hazırlanıyor',
    shipped: 'Kargoya verildi',
    ready_for_pickup: 'Teslim almaya hazır',
    delivered: 'Teslim edildi',
    cancelled: 'İptal edildi'
});

export const ORDER_CODE_RE = /^[A-Z0-9]{8}$/;

/** Veritabanı iş kuralı hatasını { status, message } yanıtına çevirir; bilinmeyen hata için null. */
export function orderError(error) {
    const message = ORDER_ERRORS[error?.reason];
    if (!message) return null;
    const status = error.reason === 'order_not_found' ? 404 : error.reason === 'email_not_verified' ? 403 : 409;
    return { status, message };
}

const lira = (kurus) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(kurus / 100);
const date = (value) => (value ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'long', timeZone: 'Europe/Istanbul' }).format(new Date(value)) : '');

export function publicOrder(row, items = [], events = []) {
    return {
        code: row.code,
        status: row.status,
        statusLabel: STATUS_LABELS[row.status] || row.status,
        paymentMethod: row.payment_method,
        deliveryMethod: row.delivery_method,
        shipDate: row.ship_date,
        address: row.shipping_address,
        note: row.note || '',
        subtotal: row.subtotal,
        shippingFee: row.shipping_fee,
        discount: row.discount,
        pointsUsed: row.points_used,
        total: row.total,
        carrier: row.carrier || '',
        trackingNumber: row.tracking_number || '',
        createdAt: row.created_at,
        paidAt: row.paid_at,
        deliveredAt: row.delivered_at,
        cancelledAt: row.cancelled_at,
        items: items.map(item => ({ name: item.name, unitPrice: item.unit_price, qty: item.qty, lineTotal: item.line_total })),
        events: events.map(event => ({ status: event.status, label: STATUS_LABELS[event.status] || event.status, at: event.created_at }))
    };
}

/** Sipariş e-postasının metin ve HTML gövdesi (kullanıcı verisi kaçışlanır). */
export function orderEmail(order, { heading, intro, bank, store, siteUrl }) {
    const lines = [
        heading,
        intro,
        `Sipariş kodu: ${order.code}`,
        ...order.items.map(item => `${item.qty} × ${item.name} — ${lira(item.lineTotal)}`),
        `Ara toplam: ${lira(order.subtotal)}`,
        order.shippingFee ? `Kargo: ${lira(order.shippingFee)}` : null,
        order.discount ? `Puan indirimi: −${lira(order.discount)}` : null,
        `Toplam: ${lira(order.total)}`,
        order.deliveryMethod === 'cargo' && order.shipDate ? `Planlanan kargo günü: ${date(order.shipDate)} (cumartesi)` : null,
        order.deliveryMethod === 'pickup' && store?.pickup_address ? `Teslim alma adresi: ${store.pickup_address} (${store.pickup_hours || ''})` : null,
        order.carrier || order.trackingNumber ? `Kargo: ${[order.carrier, order.trackingNumber].filter(Boolean).join(' · ')}` : null,
        bank ? `Havale/EFT: ${bank.bank_name} · ${bank.account_holder} · ${bank.iban} — açıklamaya sipariş kodunu (${order.code}) yazın.` : null,
        siteUrl ? `Siparişlerinizi görmek için: ${siteUrl}/hesabim.html#siparisler` : null,
        'Yeşil Ege Peyzaj · Bayındır, İzmir'
    ].filter(Boolean);
    return {
        text: lines.join('\n'),
        html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#12261f;line-height:1.6;max-width:560px">${lines
            .map((line, index) => (index === 0 ? `<h2 style="color:#1f4d3a">${escapeHtml(line)}</h2>` : `<p>${escapeHtml(line)}</p>`)).join('')}</div>`
    };
}
