// Vercel Function: oturum açmış kullanıcının profili, ticari ileti izni, adres defteri ve hesap silme talebi.
// Her sorgu oturumdaki kullanıcı kimliğiyle sınırlanır; kullanıcı kimliği istemciden asla okunmaz.

import { fail } from './_lib/http.js';
import { authed, createEndpoint, rateLimited } from './_lib/endpoint.js';
import { eq } from './_lib/supabase.js';
import { LIMITS } from './_lib/ratelimit.js';
import { sendEmail, escapeHtml } from './_lib/resend.js';
import { verifiedRecipients } from './contact.js';
import { validateAddress, validateAddressId, validateConsent, validateProfile } from './_lib/validate.js';

const MAX_ADDRESSES = 10;
const ADDRESS_FIELDS = Object.freeze({
    title: 'title', recipientName: 'recipient_name', phone: 'phone', city: 'city', district: 'district',
    neighbourhood: 'neighbourhood', line: 'line', postalCode: 'postal_code', isDefault: 'is_default'
});

const ok = (res, extra = {}) => res.status(200).json({ success: true, ...extra });

function toAddressRow(data) {
    return Object.fromEntries(Object.entries(ADDRESS_FIELDS).map(([key, column]) => [column, data[key]]));
}

function fromAddressRow(row) {
    return { id: row.id, ...Object.fromEntries(Object.entries(ADDRESS_FIELDS).map(([key, column]) => [key, row[column]])) };
}

async function me(ctx) {
    const [profile] = await ctx.supabase.db.select('profiles', `id=${eq(ctx.uid)}&select=full_name,phone,role,marketing_consent`);
    if (!profile) return fail(ctx.res, 404, 'Profil bulunamadı.');
    return ok(ctx.res, {
        user: {
            email: ctx.user.email,
            emailVerified: Boolean(ctx.user.email_confirmed_at),
            fullName: profile.full_name,
            phone: profile.phone,
            marketingConsent: profile.marketing_consent,
            role: profile.role
        }
    });
}

async function updateProfile(ctx) {
    const result = validateProfile(ctx.body);
    if (!result.ok) return fail(ctx.res, 400, result.error);
    await ctx.supabase.db.update('profiles', `id=${eq(ctx.uid)}`, { full_name: result.data.fullName, phone: result.data.phone });
    return ok(ctx.res);
}

async function consent(ctx) {
    const result = validateConsent(ctx.body);
    if (!result.ok) return fail(ctx.res, 400, result.error);
    const { marketing } = result.data;
    await ctx.supabase.db.update('profiles', `id=${eq(ctx.uid)}`, {
        marketing_consent: marketing,
        marketing_consent_at: marketing ? new Date().toISOString() : null
    });
    return ok(ctx.res);
}

async function addresses(ctx) {
    const rows = await ctx.supabase.db.select('addresses', `user_id=${eq(ctx.uid)}&order=is_default.desc,created_at.asc`);
    return ok(ctx.res, { addresses: rows.map(fromAddressRow) });
}

async function saveAddress(ctx) {
    const result = validateAddress(ctx.body);
    if (!result.ok) return fail(ctx.res, 400, result.error);
    const { id, ...data } = result.data;
    const owned = `user_id=${eq(ctx.uid)}`;

    if (!id) {
        const existing = await ctx.supabase.db.select('addresses', `${owned}&select=id`);
        if (existing.length >= MAX_ADDRESSES) return fail(ctx.res, 400, `En fazla ${MAX_ADDRESSES} adres kaydedebilirsiniz.`);
    }
    if (data.isDefault) {
        await ctx.supabase.db.update('addresses', `${owned}&is_default=eq.true`, { is_default: false });
    }
    if (!id) {
        const [row] = await ctx.supabase.db.insert('addresses', { ...toAddressRow(data), user_id: ctx.uid });
        return ok(ctx.res, { id: row?.id });
    }
    const rows = await ctx.supabase.db.update('addresses', `id=${eq(id)}&${owned}`, toAddressRow(data));
    if (rows.length === 0) return fail(ctx.res, 404, 'Adres bulunamadı.');
    return ok(ctx.res, { id });
}

async function deleteAddress(ctx) {
    const result = validateAddressId(ctx.body);
    if (!result.ok) return fail(ctx.res, 400, result.error);
    const rows = await ctx.supabase.db.remove('addresses', `id=${eq(result.data.id)}&user_id=${eq(ctx.uid)}`);
    if (rows.length === 0) return fail(ctx.res, 404, 'Adres bulunamadı.');
    return ok(ctx.res);
}

async function notifyDeletion(ctx, requestedAt) {
    const { RESEND_API_KEY: apiKey, CONTACT_TO_EMAIL: to, CONTACT_FROM_EMAIL: from } = ctx.env;
    if (!apiKey || !to || !from) {
        console.error('Hesap silme bildirimi gönderilemedi: e-posta yapılandırması eksik.');
        return;
    }
    try {
        const delivery = await verifiedRecipients(to);
        if (!delivery.to) return;
        const lines = ['Bir müşteri hesabının silinmesini talep etti.', `Kullanıcı kimliği: ${ctx.uid}`, `Talep zamanı: ${requestedAt}`];
        await ctx.sendEmailImpl({ apiKey, to: delivery.to, from }, {
            subject: 'Hesap silme talebi',
            text: lines.join('\n'),
            html: lines.map(line => `<p>${escapeHtml(line)}</p>`).join('')
        });
    } catch (error) {
        console.error('Hesap silme bildirimi gönderilemedi:', error?.message?.slice(0, 80));
    }
}

async function deleteRequest(ctx) {
    const password = typeof ctx.body.password === 'string' ? ctx.body.password : '';
    if (!password) return fail(ctx.res, 400, 'Şifrenizi girin.');
    if (await rateLimited(ctx, [['loginEmail', ctx.user.email, LIMITS.loginEmail]])) return;
    try {
        await ctx.supabase.auth.signIn({ email: ctx.user.email, password });
    } catch (error) {
        if (error?.status >= 400 && error?.status < 500) return fail(ctx.res, 401, 'Şifre hatalı.');
        throw error;
    }

    const requestedAt = new Date().toISOString();
    await ctx.supabase.db.update('profiles', `id=${eq(ctx.uid)}`, { deletion_requested_at: requestedAt });
    await ctx.supabase.db.insert('audit_log', { actor_id: ctx.uid, action: 'account.delete_request', target: `profile:${ctx.uid}`, ip: ctx.ip });
    await notifyDeletion(ctx, requestedAt);
    return ok(ctx.res, { message: 'Talebiniz alındı. Hesabınız en geç 30 gün içinde silinecek ve size bilgi verilecektir.' });
}

const LEDGER_LIMIT = 100;

async function loyalty(ctx) {
    const [balance] = await ctx.supabase.db.rpc('loyalty_balance', { p_user: ctx.uid });
    const [entries, settings] = await Promise.all([
        ctx.supabase.db.select('loyalty_ledger', `user_id=${eq(ctx.uid)}&select=kind,points,available_at,expires_at,note,created_at&order=id.desc&limit=${LEDGER_LIMIT}`),
        ctx.supabase.db.select('settings', 'key=eq.loyalty&select=value')
    ]);
    const rates = settings[0]?.value || {};
    return ok(ctx.res, {
        available: Math.max(0, balance?.available || 0),
        pending: balance?.pending || 0,
        rates: { pointsPerUnit: rates.points_per_unit, unitValue: rates.unit_value, maxRatio: rates.max_ratio, activationDays: rates.activation_days, validMonths: rates.valid_months },
        entries: entries.map(entry => ({
            kind: entry.kind, points: entry.points, availableAt: entry.available_at, expiresAt: entry.expires_at, note: entry.note || '', createdAt: entry.created_at
        }))
    });
}

const POST = ['POST'];
const GET = ['GET'];
export const ACTIONS = Object.freeze({
    me: { methods: GET, run: authed(me) },
    'update-profile': { methods: POST, run: authed(updateProfile) },
    consent: { methods: POST, run: authed(consent) },
    addresses: { methods: GET, run: authed(addresses) },
    'address-save': { methods: POST, run: authed(saveAddress) },
    'address-delete': { methods: POST, run: authed(deleteAddress) },
    'delete-request': { methods: POST, run: authed(deleteRequest) },
    loyalty: { methods: GET, run: authed(loyalty) }
});

export function createHandler({ sendEmailImpl = sendEmail, ...options } = {}) {
    return createEndpoint('account', ACTIONS, { ...options, sendEmailImpl });
}

export default createHandler();
