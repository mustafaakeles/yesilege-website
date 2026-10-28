// Vercel Function: sepet fiyatı, sipariş verme, siparişlerim ve müşteri iptali.
// Tutar, stok, kargo ücreti ve puan yalnızca veritabanı fonksiyonlarında hesaplanır; gövdedeki tutar alanları yok sayılır.

import { fail } from './_lib/http.js';
import { authed, createEndpoint, rateLimited } from './_lib/endpoint.js';
import { parseCookies, COOKIES, requireUser } from './_lib/session.js';
import { eq } from './_lib/supabase.js';
import { UUID_RE, inList, loadSettings, ordersOpen } from './_lib/shop.js';
import { ORDER_CODE_RE, orderEmail, orderError, publicOrder } from './_lib/orders.js';
import { sendEmail } from './_lib/resend.js';

const MAX_LINES = 30;
const MAX_ORDERS = 50;
const ORDER_LIMIT = [10, 3600];
const ok = (res, extra = {}) => res.status(200).json({ success: true, ...extra });

/** Sepet satırlarını { product_id, qty } biçimine çevirir; yalnızca kimlik ve adet okunur. */
export function cartItems(input) {
    if (!Array.isArray(input) || input.length === 0 || input.length > MAX_LINES) return null;
    const items = [];
    for (const line of input) {
        const id = String(line?.id || '');
        const qty = Number(line?.qty);
        if (!UUID_RE.test(id) || !Number.isInteger(qty) || qty < 1 || qty > 99) return null;
        items.push({ product_id: id, qty });
    }
    return items;
}

const DELIVERY = new Set(['cargo', 'pickup']);
const PAYMENT = new Set(['bank_transfer', 'pay_at_store']);
const pointsOf = (value) => (Number.isInteger(value) && value >= 0 && value <= 1_000_000 ? value : null);
export const ORDERS_CLOSED = 'Mağazamız şu anda çevrim içi sipariş almıyor. Ürünlerimiz için bize telefonla ya da iletişim formundan ulaşabilirsiniz.';

/** Sipariş kapalıyken sepet fiyatı ve sipariş işlemlerini reddeder. */
const whenOpen = (run) => (ctx) => (ordersOpen(ctx.env) ? run(ctx) : fail(ctx.res, 403, ORDERS_CLOSED));

function publicQuote(quote) {
    return {
        lines: quote.lines.map(line => ({
            id: line.product_id, name: line.name, slug: line.slug, unitPrice: line.unit_price, qty: line.qty,
            lineTotal: line.line_total, stockOk: line.stock_ok, shippable: line.shippable, image: line.image || null
        })),
        subtotal: quote.subtotal || 0,
        shippingFee: quote.shipping_fee || 0,
        freeThreshold: quote.free_threshold || 0,
        discount: quote.discount || 0,
        points: quote.points || 0,
        availablePoints: quote.available_points || 0,
        maxPoints: quote.max_points || 0,
        total: quote.total || 0,
        shipDate: quote.ship_date || null,
        errors: quote.errors || []
    };
}

async function options(ctx) {
    const { shipping, bank, store, loyalty } = await loadSettings(ctx.supabase);
    ctx.res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    return ok(ctx.res, {
        ordersOpen: ordersOpen(ctx.env),
        bankEnabled: Boolean(bank?.iban),
        shipping: { fee: shipping.fee, freeThreshold: shipping.free_threshold },
        store: { pickupAddress: store.pickup_address, pickupHours: store.pickup_hours },
        loyalty: { pointsPerUnit: loyalty.points_per_unit, unitValue: loyalty.unit_value, maxRatio: loyalty.max_ratio }
    });
}

async function quote(ctx) {
    const items = cartItems(ctx.body.items);
    const delivery = DELIVERY.has(ctx.body.delivery) ? ctx.body.delivery : 'cargo';
    const points = pointsOf(ctx.body.points ?? 0);
    if (!items || points === null) return fail(ctx.res, 400, 'Sepet bilgisi geçersiz.');

    // Oturum varsa puan bakiyesi de hesaplanır; oturumsuz sepet fiyatı herkese açıktır.
    let uid = null;
    const cookies = parseCookies(ctx.req.headers.cookie);
    if (cookies[COOKIES.access] || cookies[COOKIES.refresh]) {
        const session = await requireUser(ctx.req, ctx.res, ctx.supabase);
        if (!session) return;
        uid = session.user.id;
    }
    if (!uid && points > 0) return fail(ctx.res, 401, 'Puan kullanmak için giriş yapın.');
    const result = await ctx.supabase.db.rpc('quote_order', { p_user: uid, p_items: items, p_delivery: delivery, p_points: points });
    return ok(ctx.res, { quote: publicQuote(result) });
}

async function notify(ctx, order, { subject, heading, intro, toCustomer = true, toBusiness = true, withBank = false }) {
    const { RESEND_API_KEY: apiKey, CONTACT_TO_EMAIL: business, CONTACT_FROM_EMAIL: from, SITE_URL: siteUrl } = ctx.env;
    if (!apiKey || !from) {
        console.error('Sipariş e-postası gönderilemedi: e-posta yapılandırması eksik.');
        return;
    }
    const { bank, store } = await loadSettings(ctx.supabase, ['bank', 'store']).catch(() => ({}));
    const body = orderEmail(order, { heading, intro, bank: withBank ? bank : null, store, siteUrl });
    const jobs = [];
    if (toCustomer && ctx.user?.email) jobs.push(ctx.sendEmailImpl({ apiKey, to: ctx.user.email, from }, { subject, ...body }));
    if (toBusiness && business) {
        jobs.push(ctx.sendEmailImpl({ apiKey, to: business, from }, { subject: `[Sipariş] ${subject}`, ...orderEmail(order, { heading, intro: `${intro} Müşteri: ${ctx.user?.email || '-'}`, store }) }));
    }
    const results = await Promise.allSettled(jobs);
    for (const result of results) {
        if (result.status === 'rejected') console.error('Sipariş e-postası gönderilemedi:', result.reason?.message?.slice(0, 80));
    }
}

async function loadOrder(ctx, filter) {
    const [row] = await ctx.supabase.db.select('orders', `${filter}&select=*`);
    if (!row) return null;
    const [items, events] = await Promise.all([
        ctx.supabase.db.select('order_items', `order_id=${eq(row.id)}&order=id.asc`),
        ctx.supabase.db.select('order_events', `order_id=${eq(row.id)}&select=status,created_at&order=id.asc`)
    ]);
    return { row, order: publicOrder(row, items, events) };
}

async function place(ctx) {
    const body = ctx.body;
    const items = cartItems(body.items);
    const points = pointsOf(body.points ?? 0);
    if (!items || points === null) return fail(ctx.res, 400, 'Sepet bilgisi geçersiz.');
    if (!DELIVERY.has(body.delivery) || !PAYMENT.has(body.payment)) return fail(ctx.res, 400, 'Teslimat veya ödeme seçimi geçersiz.');
    if (body.accept !== true) return fail(ctx.res, 400, 'Devam etmek için Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi\'ni onaylayın.');
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
    if (!ctx.user.email_confirmed_at) return fail(ctx.res, 403, 'Sipariş verebilmek için e-posta adresinizi doğrulamanız gerekir.');
    if (await rateLimited(ctx, [['orderUser', ctx.uid, ORDER_LIMIT]])) return;

    const [profile] = await ctx.supabase.db.select('profiles', `id=${eq(ctx.uid)}&select=full_name,phone`);
    let address = null;
    if (body.delivery === 'cargo') {
        const addressId = String(body.addressId || '');
        if (!UUID_RE.test(addressId)) return fail(ctx.res, 400, 'Kargo için bir teslimat adresi seçin.');
        const [row] = await ctx.supabase.db.select('addresses', `id=${eq(addressId)}&user_id=${eq(ctx.uid)}`);
        if (!row) return fail(ctx.res, 404, 'Adres bulunamadı.');
        address = {
            title: row.title, recipient_name: row.recipient_name, phone: row.phone, city: row.city, district: row.district,
            neighbourhood: row.neighbourhood, line: row.line, postal_code: row.postal_code
        };
    }
    const contact = { name: profile?.full_name || '', email: ctx.user.email, phone: profile?.phone || address?.phone || null };

    let placed;
    try {
        placed = await ctx.supabase.db.rpc('place_order', {
            p_user: ctx.uid, p_items: items, p_delivery: body.delivery, p_payment: body.payment,
            p_address: address, p_contact: contact, p_note: note || null, p_points: points
        });
    } catch (error) {
        const mapped = orderError(error);
        if (mapped) return fail(ctx.res, mapped.status, mapped.message);
        throw error;
    }
    await ctx.supabase.db.insert('audit_log', { actor_id: ctx.uid, action: 'order.place', target: `order:${placed.id}`, ip: ctx.ip });

    const loaded = await loadOrder(ctx, `id=${eq(placed.id)}`);
    const bankTransfer = body.payment === 'bank_transfer';
    await notify(ctx, loaded.order, {
        subject: `Siparişiniz alındı (${placed.code})`,
        heading: 'Siparişiniz alındı',
        intro: bankTransfer
            ? 'Teşekkür ederiz. Ödemeniz hesabımıza ulaştığında siparişinizi hazırlamaya başlayacağız.'
            : 'Teşekkür ederiz. Siparişiniz hazır olduğunda size haber vereceğiz; ödemeyi teslim alırken yapabilirsiniz.',
        withBank: bankTransfer
    });
    const { bank } = bankTransfer ? await loadSettings(ctx.supabase, ['bank']) : {};
    return ok(ctx.res, {
        order: loaded.order,
        bank: bankTransfer ? { bankName: bank.bank_name, accountHolder: bank.account_holder, iban: bank.iban } : null
    });
}

async function orders(ctx) {
    const rows = await ctx.supabase.db.select('orders', `user_id=${eq(ctx.uid)}&select=*&order=created_at.desc&limit=${MAX_ORDERS}`);
    if (rows.length === 0) return ok(ctx.res, { orders: [] });
    const items = await ctx.supabase.db.select('order_items', `order_id=${inList(rows.map(row => row.id))}&order=id.asc`);
    return ok(ctx.res, { orders: rows.map(row => publicOrder(row, items.filter(item => item.order_id === row.id))) });
}

async function order(ctx) {
    const code = String(ctx.req.query?.code || '').toUpperCase();
    if (!ORDER_CODE_RE.test(code)) return fail(ctx.res, 404, 'Sipariş bulunamadı.');
    const loaded = await loadOrder(ctx, `code=${eq(code)}&user_id=${eq(ctx.uid)}`);
    if (!loaded) return fail(ctx.res, 404, 'Sipariş bulunamadı.');
    let bank = null;
    if (loaded.row.status === 'awaiting_payment' && loaded.row.payment_method === 'bank_transfer') {
        const settings = await loadSettings(ctx.supabase, ['bank']);
        bank = { bankName: settings.bank.bank_name, accountHolder: settings.bank.account_holder, iban: settings.bank.iban };
    }
    return ok(ctx.res, { order: loaded.order, bank });
}

async function cancel(ctx) {
    const code = String(ctx.body.code || '').toUpperCase();
    if (!ORDER_CODE_RE.test(code)) return fail(ctx.res, 404, 'Sipariş bulunamadı.');
    const [row] = await ctx.supabase.db.select('orders', `code=${eq(code)}&user_id=${eq(ctx.uid)}&select=id`);
    if (!row) return fail(ctx.res, 404, 'Sipariş bulunamadı.');
    try {
        await ctx.supabase.db.rpc('cancel_order', { p_order: row.id, p_actor: ctx.uid, p_admin: false, p_reason: 'Müşteri iptali' });
    } catch (error) {
        const mapped = orderError(error);
        if (mapped) return fail(ctx.res, mapped.status, mapped.message);
        throw error;
    }
    await ctx.supabase.db.insert('audit_log', { actor_id: ctx.uid, action: 'order.cancel', target: `order:${row.id}`, ip: ctx.ip });
    const loaded = await loadOrder(ctx, `id=${eq(row.id)}`);
    await notify(ctx, loaded.order, { subject: `Siparişiniz iptal edildi (${code})`, heading: 'Siparişiniz iptal edildi', intro: 'Siparişiniz isteğiniz üzerine iptal edildi.' });
    return ok(ctx.res, { order: loaded.order });
}

const GET = ['GET'];
const POST = ['POST'];
export const ACTIONS = Object.freeze({
    options: { methods: GET, run: options },
    quote: { methods: POST, run: whenOpen(quote) },
    place: { methods: POST, run: whenOpen(authed(place)) },
    orders: { methods: GET, run: authed(orders) },
    order: { methods: GET, run: authed(order) },
    cancel: { methods: POST, run: authed(cancel) }
});

export function createHandler({ sendEmailImpl = sendEmail, ...options } = {}) {
    return createEndpoint('checkout', ACTIONS, { ...options, sendEmailImpl });
}

export default createHandler();
