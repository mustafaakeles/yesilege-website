// Bitki Doktoru formu: doğrulama ve e-posta içeriği (saf fonksiyonlar, testlenebilir).
// Fotoğraflar sunucuda saklanmaz; tarayıcıda küçültülmüş JPEG olarak gelir ve e-posta eki olarak iletilir.

import { escapeHtml } from './resend.js';

export const FORM_NAME = 'bitki-doktoru';

export const LIMITS = Object.freeze({
    name: 100,
    email: 254,
    phone: 30,
    plant: 100,
    message: 2000,
    photos: 3,
    photoBytes: 1_500_000,
    // Vercel Function gövde sınırı 4,5 MB; base64 şişmesi için pay bırakılır
    bodyBytes: 4_000_000,
    // Bundan hızlı doldurulan form bot sayılır
    minFillMs: 3000
});

const LOCATIONS = Object.freeze({ ic: 'İç mekân', dis: 'Dış mekân', sera: 'Sera / balkon' });

const SYMPTOMS = Object.freeze({
    sararma: 'Sararma',
    leke: 'Kahverengi leke',
    sarkma: 'Sarkma / pörsüme',
    bocek: 'Böcek / zararlı',
    curume: 'Kök / gövde çürümesi',
    dokulme: 'Yaprak dökme',
    diger: 'Diğer'
});

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const PHONE_RE = /^[0-9+()\s-]{7,30}$/;
const PHOTO_RE = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/;

const clean = (value) => (typeof value === 'string' ? value.trim() : '');
const checked = (value) => value === true || value === 'on' || value === 'true';
const fail = (error) => ({ ok: false, error });

function parsePhotos(input) {
    const list = Array.isArray(input) ? input : [];
    if (list.length === 0) return fail('En az bir fotoğraf ekleyin.');
    if (list.length > LIMITS.photos) return fail(`En fazla ${LIMITS.photos} fotoğraf gönderebilirsiniz.`);

    const photos = [];
    for (const item of list) {
        const match = typeof item === 'string' ? PHOTO_RE.exec(item) : null;
        if (!match) return fail('Fotoğraflar JPEG biçiminde olmalı.');
        const bytes = Buffer.from(match[1], 'base64');
        if (bytes.length > LIMITS.photoBytes) return fail('Fotoğraflardan biri çok büyük.');
        // Gerçek JPEG mi? (FF D8 FF ile başlar)
        if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return fail('Fotoğraflar JPEG biçiminde olmalı.');
        photos.push(match[1]);
    }
    return { ok: true, photos };
}

/**
 * Gelen Bitki Doktoru gönderimini doğrular.
 * @returns {{ ok: true, data: object } | { ok: false, error: string } | { ok: true, spam: true }}
 */
export function validatePlantSubmission(input, now = Date.now()) {
    const body = input && typeof input === 'object' ? input : {};

    if (clean(body['bot-field'])) return { ok: true, spam: true };
    if (clean(body['form-name']) !== FORM_NAME) return fail('Geçersiz form.');

    const started = Number(body.started);
    if (!Number.isFinite(started)) return fail('Geçersiz form.');
    if (now - started < LIMITS.minFillMs) return { ok: true, spam: true };

    const name = clean(body.name);
    const email = clean(body.email).toLowerCase();
    const phone = clean(body.phone);
    const plant = clean(body.plant);
    const message = clean(body.message);
    const locationKey = clean(body.location);
    const symptomKeys = (Array.isArray(body.symptoms) ? body.symptoms : [body.symptoms]).map(clean).filter(Boolean);

    if (!name || name.length > LIMITS.name) return fail('Adınızı girin (en fazla 100 karakter).');
    if (!email || email.length > LIMITS.email || !EMAIL_RE.test(email)) return fail('Geçerli bir e-posta adresi girin.');
    if (phone && !PHONE_RE.test(phone)) return fail('Telefon numarası geçersiz.');
    if (plant.length > LIMITS.plant) return fail('Bitki adı çok uzun.');
    if (!Object.hasOwn(LOCATIONS, locationKey)) return fail('Bitkinin bulunduğu yeri seçin.');
    if (symptomKeys.some(key => !Object.hasOwn(SYMPTOMS, key))) return fail('Geçersiz belirti seçimi.');
    if (!message || message.length > LIMITS.message) return fail('Sorunu kısaca anlatın (en fazla 2000 karakter).');
    if (!checked(body.kvkk)) return fail('Devam etmek için KVKK aydınlatma metnini onaylayın.');

    const parsed = parsePhotos(body.photos);
    if (!parsed.ok) return parsed;

    return {
        ok: true,
        data: {
            name,
            email,
            phone,
            plant: plant || 'Belirtilmedi',
            location: LOCATIONS[locationKey],
            symptoms: [...new Set(symptomKeys)].map(key => SYMPTOMS[key]),
            message,
            photos: parsed.photos,
            publish: checked(body.publish)
        }
    };
}

/** Doğrulanmış veriden e-posta konusu, gövde ve fotoğraf eklerini üretir. */
export function buildPlantEmail(data) {
    const symptoms = data.symptoms.length ? data.symptoms.join(', ') : 'Belirtilmedi';
    const publish = data.publish ? 'evet' : 'hayır';
    const rows = [
        ['Ad Soyad', data.name],
        ['E-posta', data.email],
        ['Telefon', data.phone || '-'],
        ['Bitki', data.plant],
        ['Konum', data.location],
        ['Belirtiler', symptoms],
        ['Fotoğraf', `${data.photos.length} adet (ekte)`],
        ['İsimsiz yayın izni', publish]
    ];

    return {
        subject: `Bitki Doktoru: ${data.plant} – ${symptoms} (yayın izni: ${publish})`,
        text: [...rows.map(([k, v]) => `${k}: ${v}`), '', data.message].join('\n'),
        html: [
            '<table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif">',
            ...rows.map(([k, v]) => `<tr><td><strong>${k}</strong></td><td>${escapeHtml(v)}</td></tr>`),
            '</table>',
            `<p style="white-space:pre-wrap;font-family:sans-serif">${escapeHtml(data.message)}</p>`
        ].join(''),
        attachments: data.photos.map((content, i) => ({ filename: `bitki-${i + 1}.jpg`, content }))
    };
}
