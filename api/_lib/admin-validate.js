// Yönetim paneli formlarının doğrulaması (saf fonksiyonlar). Bilinmeyen alanlar yok sayılır.

import { SLUG_RE, UUID_RE } from './shop.js';

const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const invalid = (error) => ({ ok: false, error });
const bag = (input) => (input && typeof input === 'object' && !Array.isArray(input) ? input : {});
const text = (value, max, { min = 0, multiline = false } = {}) => {
    if (value === undefined || value === null) return min ? undefined : '';
    if (typeof value !== 'string') return undefined;
    const clean = value.trim();
    if (clean.length < min || clean.length > max) return undefined;
    if (CONTROL_RE.test(multiline ? clean.replace(/[\r\n\t]/g, '') : clean.replace(/\t/g, ''))) return undefined;
    if (!multiline && /[\r\n]/.test(clean)) return undefined;
    return clean;
};
const int = (value, min, max) => (Number.isInteger(value) && value >= min && value <= max ? value : undefined);
const bool = (value) => (typeof value === 'boolean' ? value : undefined);

export function validateProduct(input, { imageBase }) {
    const body = bag(input);
    const id = body.id ? String(body.id) : null;
    if (id && !UUID_RE.test(id)) return invalid('Ürün kimliği geçersiz.');
    const name = text(body.name, 120, { min: 2 });
    if (!name) return invalid('Ürün adı 2-120 karakter olmalıdır.');
    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
    if (!SLUG_RE.test(slug) || slug.length > 80) return invalid('Bağlantı adı yalnızca küçük harf, rakam ve tire içerebilir (en fazla 80 karakter).');
    const summary = text(body.summary, 200);
    const description = text(body.description, 4000, { multiline: true });
    if (summary === undefined || description === undefined) return invalid('Kısa açıklama en fazla 200, açıklama en fazla 4000 karakter olabilir.');
    const categoryId = body.categoryId ? String(body.categoryId) : null;
    if (categoryId && !UUID_RE.test(categoryId)) return invalid('Kategori geçersiz.');
    const price = int(body.price, 1, 100_000_000);
    if (price === undefined) return invalid('Fiyat 0,01 ₺ ile 1.000.000 ₺ arasında olmalıdır.');
    const compareAtPrice = body.compareAtPrice === null || body.compareAtPrice === undefined || body.compareAtPrice === 0 ? null : int(body.compareAtPrice, price + 1, 100_000_000);
    if (compareAtPrice === undefined) return invalid('Eski fiyat yeni fiyattan yüksek olmalıdır.');
    const stock = int(body.stock, 0, 100_000);
    if (stock === undefined) return invalid('Stok 0 ile 100.000 arasında bir tam sayı olmalıdır.');
    const sortOrder = int(body.sortOrder ?? 0, -1000, 1000);
    const shippable = bool(body.shippable);
    const isActive = bool(body.isActive);
    if (sortOrder === undefined || shippable === undefined || isActive === undefined) return invalid('Ürün seçenekleri geçersiz.');
    const images = Array.isArray(body.images) ? body.images : [];
    if (images.length > 6 || !images.every(url => typeof url === 'string' && url.startsWith(imageBase) && /^[A-Za-z0-9/._-]+$/.test(url.slice(imageBase.length)))) {
        return invalid('Görsel listesi geçersiz.');
    }
    return {
        ok: true,
        data: {
            id,
            row: {
                name, slug, summary: summary || null, description: description || null, category_id: categoryId, price,
                compare_at_price: compareAtPrice, stock, shippable, is_active: isActive, sort_order: sortOrder, images
            }
        }
    };
}

export function validateCategory(input) {
    const body = bag(input);
    const id = body.id ? String(body.id) : null;
    if (id && !UUID_RE.test(id)) return invalid('Kategori kimliği geçersiz.');
    const name = text(body.name, 60, { min: 2 });
    if (!name) return invalid('Kategori adı 2-60 karakter olmalıdır.');
    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
    if (!SLUG_RE.test(slug) || slug.length > 60) return invalid('Bağlantı adı yalnızca küçük harf, rakam ve tire içerebilir.');
    const description = text(body.description, 500, { multiline: true });
    const sortOrder = int(body.sortOrder ?? 0, -1000, 1000);
    const isActive = bool(body.isActive);
    if (description === undefined || sortOrder === undefined || isActive === undefined) return invalid('Kategori bilgileri geçersiz.');
    return { ok: true, data: { id, row: { name, slug, description: description || null, sort_order: sortOrder, is_active: isActive } } };
}

const IBAN_RE = /^TR\d{24}$/;

export function validateSettings(input) {
    const body = bag(input);
    const shipping = bag(body.shipping);
    const bank = bag(body.bank);
    const store = bag(body.store);
    const loyalty = bag(body.loyalty);

    const fee = int(shipping.fee, 0, 10_000_000);
    const freeThreshold = int(shipping.freeThreshold, 0, 100_000_000);
    const weeklyCapacity = int(shipping.weeklyCapacity, 0, 1000);
    const cutoff = int(shipping.orderCutoffHour, 0, 23);
    if ([fee, freeThreshold, weeklyCapacity, cutoff].includes(undefined)) return invalid('Kargo ayarlarını kontrol edin.');

    const iban = typeof bank.iban === 'string' ? bank.iban.replace(/\s+/g, '').toUpperCase() : '';
    const bankName = text(bank.bankName, 80);
    const accountHolder = text(bank.accountHolder, 120);
    if (bankName === undefined || accountHolder === undefined || (iban && !IBAN_RE.test(iban))) return invalid('IBAN "TR" ve 24 rakamdan oluşmalıdır.');
    if (iban && (!bankName || !accountHolder)) return invalid('IBAN girdiyseniz banka adını ve hesap sahibini de girin.');

    const pickupAddress = text(store.pickupAddress, 200, { min: 5 });
    const pickupHours = text(store.pickupHours, 100, { min: 2 });
    if (!pickupAddress || !pickupHours) return invalid('Teslim alma adresi ve saatleri gerekli.');

    const pointsPerLira = typeof loyalty.pointsPerLira === 'number' && loyalty.pointsPerLira >= 0 && loyalty.pointsPerLira <= 10 ? loyalty.pointsPerLira : undefined;
    const pointsPerUnit = int(loyalty.pointsPerUnit, 1, 10_000);
    const unitValue = int(loyalty.unitValue, 1, 100_000);
    const maxRatio = typeof loyalty.maxRatio === 'number' && loyalty.maxRatio >= 0 && loyalty.maxRatio <= 1 ? loyalty.maxRatio : undefined;
    const activationDays = int(loyalty.activationDays, 0, 90);
    const validMonths = int(loyalty.validMonths, 1, 60);
    if ([pointsPerLira, pointsPerUnit, unitValue, maxRatio, activationDays, validMonths].includes(undefined)) return invalid('Sadakat ayarlarını kontrol edin.');

    return {
        ok: true,
        data: {
            shipping: { fee, free_threshold: freeThreshold, weekly_capacity: weeklyCapacity, order_cutoff_hour: cutoff },
            bank: { bank_name: bankName, account_holder: accountHolder, iban: iban ? iban.replace(/(.{4})/g, '$1 ').trim() : '' },
            store: { pickup_address: pickupAddress, pickup_hours: pickupHours },
            loyalty: {
                points_per_lira: pointsPerLira, points_per_unit: pointsPerUnit, unit_value: unitValue, max_ratio: maxRatio,
                activation_days: activationDays, valid_months: validMonths
            }
        }
    };
}

const IMAGE_TYPES = Object.freeze({
    'image/webp': { ext: 'webp', check: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
    'image/jpeg': { ext: 'jpg', check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    'image/png': { ext: 'png', check: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) }
});
export const MAX_IMAGE_BYTES = 1_500_000;

/** Base64 görseli çözer; içerik türünü dosya imzasından doğrular. */
export function decodeImage(input) {
    const body = bag(input);
    const type = IMAGE_TYPES[body.type];
    if (!type || typeof body.data !== 'string' || body.data.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4) return invalid('Görsel WebP, JPEG ya da PNG olmalı ve 1,5 MB\'ı aşmamalıdır.');
    const buffer = Buffer.from(body.data, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES || !type.check(buffer)) return invalid('Görsel dosyası okunamadı.');
    return { ok: true, data: { buffer, contentType: body.type, ext: type.ext } };
}
