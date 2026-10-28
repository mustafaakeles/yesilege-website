// Vercel Function: yönetim paneli. Her işlem oturum + profiles.role = 'admin' + TOTP ile yükseltilmiş oturum (AAL2) ister
// ve audit_log'a yazılır. Para, stok ve puan değişiklikleri veritabanı fonksiyonlarında yapılır.

import { randomUUID } from 'node:crypto';
import { appendCookies, fail } from './_lib/http.js';
import { authed, createEndpoint, rateLimited } from './_lib/endpoint.js';
import { sessionCookies } from './_lib/session.js';
import { eq } from './_lib/supabase.js';
import { UUID_RE, inList, loadSettings } from './_lib/shop.js';
import { ORDER_CODE_RE, STATUS_LABELS, orderEmail, orderError, publicOrder } from './_lib/orders.js';
import { decodeImage, MAX_IMAGE_BYTES, validateCategory, validateProduct, validateSettings } from './_lib/admin-validate.js';
import { sendEmail } from './_lib/resend.js';

const BUCKET = 'products';
const MFA_LIMIT = [5, 900];
const LIST_LIMIT = 200;
const ok = (res, extra = {}) => res.status(200).json({ success: true, ...extra });

/** Supabase'in doğruladığı erişim token'ının "aal" alanı (imza getUser ile zaten doğrulanmıştır). */
export function tokenAal(accessToken) {
    try {
        const payload = JSON.parse(Buffer.from(String(accessToken).split('.')[1], 'base64url').toString('utf8'));
        return payload.aal === 'aal2' ? 'aal2' : 'aal1';
    } catch {
        return 'aal1';
    }
}

function admin(run, { mfa = true } = {}) {
    return authed(async (ctx) => {
        const [profile] = await ctx.supabase.db.select('profiles', `id=${eq(ctx.uid)}&select=role,full_name`);
        if (profile?.role !== 'admin') return fail(ctx.res, 403, 'Bu sayfaya erişim yetkiniz yok.');
        const aal = tokenAal(ctx.accessToken);
        if (mfa && aal !== 'aal2') {
            return ctx.res.status(403).json({ success: false, error: 'Devam etmek için iki adımlı doğrulama kodunu girin.', mfaRequired: true });
        }
        return run({ ...ctx, aal, adminName: profile.full_name });
    });
}

const audit = (ctx, action, target, details = {}) =>
    ctx.supabase.db.insert('audit_log', { actor_id: ctx.uid, action, target, details, ip: ctx.ip });

// ---------- İki adımlı doğrulama ----------

async function mfaStatus(ctx) {
    const factors = (ctx.user.factors || []).filter(factor => factor.factor_type === 'totp');
    return ok(ctx.res, {
        aal: ctx.aal,
        name: ctx.adminName,
        enrolled: factors.some(factor => factor.status === 'verified'),
        factorId: factors.find(factor => factor.status === 'verified')?.id || null
    });
}

async function mfaEnroll(ctx) {
    const factors = (ctx.user.factors || []).filter(factor => factor.factor_type === 'totp');
    if (factors.some(factor => factor.status === 'verified')) return fail(ctx.res, 409, 'Doğrulama uygulaması zaten kayıtlı.');
    for (const factor of factors) await ctx.supabase.auth.unenroll(ctx.accessToken, factor.id).catch(() => {});
    const enrolled = await ctx.supabase.auth.enrollTotp(ctx.accessToken);
    await audit(ctx, 'admin.mfa_enroll', `user:${ctx.uid}`);
    return ok(ctx.res, { factorId: enrolled.id, qr: enrolled.totp?.qr_code, secret: enrolled.totp?.secret });
}

async function mfaVerify(ctx) {
    const factorId = String(ctx.body.factorId || '');
    const code = String(ctx.body.code || '').replace(/\s/g, '');
    if (!UUID_RE.test(factorId) || !/^\d{6}$/.test(code)) return fail(ctx.res, 400, 'Uygulamadaki 6 haneli kodu girin.');
    if (await rateLimited(ctx, [['mfaUser', ctx.uid, MFA_LIMIT]])) return;
    let session;
    try {
        const challenge = await ctx.supabase.auth.challenge(ctx.accessToken, factorId);
        session = await ctx.supabase.auth.verifyTotp(ctx.accessToken, factorId, challenge.id, code);
    } catch (error) {
        if (error?.status >= 400 && error?.status < 500) return fail(ctx.res, 401, 'Kod hatalı ya da süresi geçmiş. Yeni kodu deneyin.');
        throw error;
    }
    appendCookies(ctx.res, sessionCookies(session));
    await audit(ctx, 'admin.mfa_verify', `user:${ctx.uid}`);
    return ok(ctx.res, { aal: 'aal2' });
}

// ---------- Özet ve siparişler ----------

async function dashboard(ctx) {
    return ok(ctx.res, { summary: await ctx.supabase.db.rpc('admin_dashboard', {}) });
}

function adminOrder(row, items = [], events = []) {
    return { ...publicOrder(row, items, events), contact: row.contact, userId: row.user_id };
}

async function orders(ctx) {
    const status = String(ctx.req.query?.status || '');
    const code = String(ctx.req.query?.code || '').toUpperCase();
    const shipDate = String(ctx.req.query?.shipDate || '');
    let filter = `select=*&order=created_at.desc&limit=${LIST_LIMIT}`;
    if (status) {
        if (!STATUS_LABELS[status]) return fail(ctx.res, 400, 'Durum geçersiz.');
        filter += `&status=${eq(status)}`;
    }
    if (code) {
        if (!ORDER_CODE_RE.test(code)) return ok(ctx.res, { orders: [] });
        filter += `&code=${eq(code)}`;
    }
    if (shipDate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(shipDate)) return fail(ctx.res, 400, 'Tarih geçersiz.');
        filter += `&ship_date=${eq(shipDate)}`;
    }
    const rows = await ctx.supabase.db.select('orders', filter);
    if (rows.length === 0) return ok(ctx.res, { orders: [] });
    const items = await ctx.supabase.db.select('order_items', `order_id=${inList(rows.map(row => row.id))}&order=id.asc`);
    return ok(ctx.res, { orders: rows.map(row => adminOrder(row, items.filter(item => item.order_id === row.id))) });
}

const CUSTOMER_MAIL = Object.freeze({
    paid: { subject: 'Ödemeniz alındı', intro: 'Ödemeniz hesabımıza ulaştı. Siparişinizi hazırlamaya başlıyoruz.' },
    shipped: { subject: 'Siparişiniz kargoya verildi', intro: 'Siparişiniz kargoya verildi.' },
    ready_for_pickup: { subject: 'Siparişiniz teslim almaya hazır', intro: 'Siparişiniz hazır; fidanlığımızdan teslim alabilirsiniz.' },
    delivered: { subject: 'Siparişiniz teslim edildi', intro: 'Siparişiniz teslim edildi. Bu siparişten kazandığınız puanlar 14 gün sonra kullanılabilir olacak. Bizi tercih ettiğiniz için teşekkür ederiz.' },
    cancelled: { subject: 'Siparişiniz iptal edildi', intro: 'Siparişiniz iptal edildi. Ödeme yaptıysanız iade için sizinle iletişime geçeceğiz.' }
});

async function mailCustomer(ctx, orderId, status) {
    const template = CUSTOMER_MAIL[status];
    const { RESEND_API_KEY: apiKey, CONTACT_FROM_EMAIL: from, SITE_URL: siteUrl } = ctx.env;
    if (!template || !apiKey || !from) return;
    try {
        const [row] = await ctx.supabase.db.select('orders', `id=${eq(orderId)}&select=*`);
        const to = row?.contact?.email;
        if (!to) return;
        const items = await ctx.supabase.db.select('order_items', `order_id=${eq(orderId)}&order=id.asc`);
        const { store } = await loadSettings(ctx.supabase, ['store']);
        const order = publicOrder(row, items);
        const body = orderEmail(order, { heading: template.subject, intro: template.intro, store, siteUrl });
        await ctx.sendEmailImpl({ apiKey, to, from }, { subject: `${template.subject} (${order.code})`, ...body });
    } catch (error) {
        console.error('Müşteri bilgilendirme e-postası gönderilemedi:', error?.message?.slice(0, 80));
    }
}

async function orderByCode(ctx) {
    const code = String(ctx.body.code || '').toUpperCase();
    if (!ORDER_CODE_RE.test(code)) return null;
    const [row] = await ctx.supabase.db.select('orders', `code=${eq(code)}&select=id,code`);
    return row || null;
}

async function orderStatus(ctx) {
    const row = await orderByCode(ctx);
    if (!row) return fail(ctx.res, 404, 'Sipariş bulunamadı.');
    const status = String(ctx.body.status || '');
    if (!STATUS_LABELS[status] || status === 'cancelled') return fail(ctx.res, 400, 'Durum geçersiz.');
    const clip = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : null);
    try {
        await ctx.supabase.db.rpc('admin_set_order_status', {
            p_order: row.id, p_status: status, p_actor: ctx.uid, p_note: clip(ctx.body.note, 300),
            p_carrier: clip(ctx.body.carrier, 60), p_tracking: clip(ctx.body.tracking, 60)
        });
    } catch (error) {
        const mapped = orderError(error);
        if (mapped) return fail(ctx.res, mapped.status, mapped.message);
        throw error;
    }
    await audit(ctx, 'admin.order_status', `order:${row.id}`, { status });
    await mailCustomer(ctx, row.id, status);
    return ok(ctx.res);
}

async function orderCancel(ctx) {
    const row = await orderByCode(ctx);
    if (!row) return fail(ctx.res, 404, 'Sipariş bulunamadı.');
    const reason = typeof ctx.body.reason === 'string' ? ctx.body.reason.trim().slice(0, 300) : '';
    if (reason.length < 3) return fail(ctx.res, 400, 'İptal nedenini yazın.');
    try {
        await ctx.supabase.db.rpc('cancel_order', { p_order: row.id, p_actor: ctx.uid, p_admin: true, p_reason: reason });
    } catch (error) {
        const mapped = orderError(error);
        if (mapped) return fail(ctx.res, mapped.status, mapped.message);
        throw error;
    }
    await audit(ctx, 'admin.order_cancel', `order:${row.id}`, { reason });
    await mailCustomer(ctx, row.id, 'cancelled');
    return ok(ctx.res);
}

// ---------- Ürünler ve kategoriler ----------

const imageBase = (ctx) => ctx.supabase.storage.publicUrl(BUCKET, '');

async function products(ctx) {
    const [rows, categories] = await Promise.all([
        ctx.supabase.db.select('products', `select=*&order=sort_order.asc,name.asc&limit=1000`),
        ctx.supabase.db.select('categories', 'select=*&order=sort_order.asc,name.asc')
    ]);
    return ok(ctx.res, {
        imageBase: imageBase(ctx),
        categories: categories.map(row => ({ id: row.id, slug: row.slug, name: row.name, description: row.description || '', sortOrder: row.sort_order, isActive: row.is_active })),
        products: rows.map(row => ({
            id: row.id, slug: row.slug, name: row.name, summary: row.summary || '', description: row.description || '', categoryId: row.category_id,
            price: row.price, compareAtPrice: row.compare_at_price, stock: row.stock, shippable: row.shippable, isActive: row.is_active,
            sortOrder: row.sort_order, images: row.images || []
        }))
    });
}

async function saveRow(ctx, table, { id, row }, action) {
    try {
        const [saved] = id
            ? await ctx.supabase.db.update(table, `id=${eq(id)}`, row)
            : await ctx.supabase.db.insert(table, row);
        if (!saved) return fail(ctx.res, 404, 'Kayıt bulunamadı.');
        await audit(ctx, action, `${table}:${saved.id}`, { slug: row.slug });
        return ok(ctx.res, { id: saved.id });
    } catch (error) {
        if (error?.status === 409) return fail(ctx.res, 409, 'Bu bağlantı adı başka bir kayıtta kullanılıyor.');
        if (error?.status === 400) return fail(ctx.res, 400, 'Kayıt veritabanı kurallarına uymuyor. Değerleri kontrol edin.');
        throw error;
    }
}

async function productSave(ctx) {
    const result = validateProduct(ctx.body, { imageBase: imageBase(ctx) });
    if (!result.ok) return fail(ctx.res, 400, result.error);
    return saveRow(ctx, 'products', result.data, result.data.id ? 'admin.product_update' : 'admin.product_create');
}

async function productImage(ctx) {
    const productId = String(ctx.body.productId || '');
    if (!UUID_RE.test(productId)) return fail(ctx.res, 400, 'Ürün geçersiz.');
    const image = decodeImage(ctx.body);
    if (!image.ok) return fail(ctx.res, 400, image.error);
    const [product] = await ctx.supabase.db.select('products', `id=${eq(productId)}&select=id,images`);
    if (!product) return fail(ctx.res, 404, 'Ürün bulunamadı.');
    if ((product.images || []).length >= 6) return fail(ctx.res, 400, 'Bir ürüne en fazla 6 görsel eklenebilir.');
    const path = `${productId}/${randomUUID()}.${image.data.ext}`;
    await ctx.supabase.storage.upload(BUCKET, path, image.data.buffer, image.data.contentType);
    const url = ctx.supabase.storage.publicUrl(BUCKET, path);
    await ctx.supabase.db.update('products', `id=${eq(productId)}`, { images: [...(product.images || []), url] });
    await audit(ctx, 'admin.product_image', `products:${productId}`, { path });
    return ok(ctx.res, { url });
}

async function categorySave(ctx) {
    const result = validateCategory(ctx.body);
    if (!result.ok) return fail(ctx.res, 400, result.error);
    return saveRow(ctx, 'categories', result.data, result.data.id ? 'admin.category_update' : 'admin.category_create');
}

// ---------- Müşteri ve puan ----------

async function customer(ctx) {
    const email = String(ctx.req.query?.email || '').trim();
    if (!email || email.length > 254) return fail(ctx.res, 400, 'E-posta adresi girin.');
    const [user] = await ctx.supabase.db.rpc('admin_find_user', { p_email: email });
    if (!user) return fail(ctx.res, 404, 'Bu e-postayla kayıtlı müşteri bulunamadı.');
    const [[balance], entries] = await Promise.all([
        ctx.supabase.db.rpc('loyalty_balance', { p_user: user.id }),
        ctx.supabase.db.select('loyalty_ledger', `user_id=${eq(user.id)}&select=kind,points,note,created_at,available_at&order=id.desc&limit=50`)
    ]);
    return ok(ctx.res, {
        customer: { id: user.id, email: user.email, fullName: user.full_name, phone: user.phone, createdAt: user.created_at },
        balance: { available: balance?.available || 0, pending: balance?.pending || 0 },
        entries: entries.map(entry => ({ kind: entry.kind, points: entry.points, note: entry.note || '', createdAt: entry.created_at, availableAt: entry.available_at }))
    });
}

async function pointsAdjust(ctx) {
    const userId = String(ctx.body.userId || '');
    const points = ctx.body.points;
    const note = typeof ctx.body.note === 'string' ? ctx.body.note.trim().slice(0, 300) : '';
    if (!UUID_RE.test(userId) || !Number.isInteger(points) || points === 0) return fail(ctx.res, 400, 'Puan miktarı geçersiz.');
    try {
        await ctx.supabase.db.rpc('admin_adjust_points', { p_user: userId, p_points: points, p_note: note, p_actor: ctx.uid });
    } catch (error) {
        const mapped = orderError(error);
        if (mapped) return fail(ctx.res, mapped.status, mapped.message);
        throw error;
    }
    await audit(ctx, 'admin.points_adjust', `user:${userId}`, { points, note });
    return ok(ctx.res);
}

// ---------- Ayarlar ve kayıtlar ----------

async function settings(ctx) {
    const { shipping, bank, store, loyalty } = await loadSettings(ctx.supabase);
    return ok(ctx.res, {
        settings: {
            shipping: { fee: shipping.fee, freeThreshold: shipping.free_threshold, weeklyCapacity: shipping.weekly_capacity, orderCutoffHour: shipping.order_cutoff_hour },
            bank: { bankName: bank.bank_name, accountHolder: bank.account_holder, iban: bank.iban },
            store: { pickupAddress: store.pickup_address, pickupHours: store.pickup_hours },
            loyalty: {
                pointsPerLira: loyalty.points_per_lira, pointsPerUnit: loyalty.points_per_unit, unitValue: loyalty.unit_value,
                maxRatio: loyalty.max_ratio, activationDays: loyalty.activation_days, validMonths: loyalty.valid_months
            }
        }
    });
}

async function settingsSave(ctx) {
    const result = validateSettings(ctx.body);
    if (!result.ok) return fail(ctx.res, 400, result.error);
    for (const [key, value] of Object.entries(result.data)) {
        await ctx.supabase.db.update('settings', `key=${eq(key)}`, { value });
    }
    await ctx.supabase.db.rpc('admin_set_weekly_capacity', { p_capacity: result.data.shipping.weekly_capacity });
    await audit(ctx, 'admin.settings', 'settings', { keys: Object.keys(result.data) });
    return ok(ctx.res);
}

async function auditLog(ctx) {
    const rows = await ctx.supabase.db.select('audit_log', 'select=id,actor_id,action,target,details,created_at&order=id.desc&limit=100');
    return ok(ctx.res, { entries: rows.map(row => ({ action: row.action, target: row.target, details: row.details, actor: row.actor_id, at: row.created_at })) });
}

const GET = ['GET'];
const POST = ['POST'];
export const ACTIONS = Object.freeze({
    'mfa-status': { methods: GET, run: admin(mfaStatus, { mfa: false }) },
    'mfa-enroll': { methods: POST, run: admin(mfaEnroll, { mfa: false }) },
    'mfa-verify': { methods: POST, run: admin(mfaVerify, { mfa: false }) },
    dashboard: { methods: GET, run: admin(dashboard) },
    orders: { methods: GET, run: admin(orders) },
    'order-status': { methods: POST, run: admin(orderStatus) },
    'order-cancel': { methods: POST, run: admin(orderCancel) },
    products: { methods: GET, run: admin(products) },
    'product-save': { methods: POST, run: admin(productSave) },
    'product-image': { methods: POST, run: admin(productImage), maxBytes: Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 2000 },
    'category-save': { methods: POST, run: admin(categorySave) },
    customer: { methods: GET, run: admin(customer) },
    'points-adjust': { methods: POST, run: admin(pointsAdjust) },
    settings: { methods: GET, run: admin(settings) },
    'settings-save': { methods: POST, run: admin(settingsSave) },
    audit: { methods: GET, run: admin(auditLog) }
});

export function createHandler({ sendEmailImpl = sendEmail, ...options } = {}) {
    return createEndpoint('admin', ACTIONS, { ...options, sendEmailImpl });
}

export default createHandler();
