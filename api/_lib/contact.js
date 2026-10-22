// Form doğrulama ve e-posta içeriği üretimi (saf fonksiyonlar, testlenebilir).

export const FORM_TYPES = Object.freeze({
    iletisim: 'İletişim Sayfası',
    'iletisim-anasayfa': 'Ana Sayfa İletişim',
    teklif: 'Teklif Formu (İletişim Sayfası)',
    bulten: 'Bülten Aboneliği'
});

const SUBJECTS = Object.freeze({
    peyzaj: 'Peyzaj Projesi',
    bitki: 'Bitki Siparişi / Satın Alma',
    bakim: 'Bahçe Bakımı',
    sulama: 'Otomatik Sulama',
    toptan: 'Toptan Bitki Siparişi',
    diger: 'Diğer'
});

// Teklif formundaki isteğe bağlı alan büyüklüğü
const AREAS = Object.freeze({
    kucuk: "100 m²'den küçük",
    orta: '100–500 m²',
    buyuk: '500–2.000 m²',
    cokbuyuk: "2.000 m²'den büyük",
    bilmiyorum: 'Bilmiyorum'
});

const LIMITS = Object.freeze({ name: 100, email: 254, phone: 30, district: 100, message: 5000 });
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
const PHONE_RE = /^[0-9+()\s-]{7,30}$/;

const clean = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Gelen form verisini doğrular.
 * @returns {{ ok: true, data: object } | { ok: false, error: string } | { ok: true, spam: true }}
 */
export function validateSubmission(input) {
    const body = input && typeof input === 'object' ? input : {};

    // Honeypot dolu ise bot: sessizce başarılı say, e-posta gönderme
    if (clean(body['bot-field'])) {
        return { ok: true, spam: true };
    }

    const formName = clean(body['form-name']);
    if (!Object.hasOwn(FORM_TYPES, formName)) {
        return { ok: false, error: 'Geçersiz form.' };
    }

    const email = clean(body.email).toLowerCase();
    if (!email || email.length > LIMITS.email || !EMAIL_RE.test(email)) {
        return { ok: false, error: 'Geçerli bir e-posta adresi girin.' };
    }

    if (formName === 'bulten') {
        return { ok: true, data: { formName, email } };
    }

    const name = clean(body.name);
    const message = clean(body.message);
    const phone = clean(body.phone);
    const subjectKey = clean(body.subject);
    const district = clean(body.district);
    const areaKey = clean(body.area);

    if (!name || name.length > LIMITS.name) {
        return { ok: false, error: 'Adınızı girin (en fazla 100 karakter).' };
    }
    if (!message || message.length > LIMITS.message) {
        return { ok: false, error: 'Mesajınızı girin (en fazla 5000 karakter).' };
    }
    if (phone && !PHONE_RE.test(phone)) {
        return { ok: false, error: 'Telefon numarası geçersiz.' };
    }
    if (district.length > LIMITS.district) {
        return { ok: false, error: 'İlçe / konum en fazla 100 karakter olabilir.' };
    }
    if (areaKey && !Object.hasOwn(AREAS, areaKey)) {
        return { ok: false, error: 'Geçersiz alan büyüklüğü.' };
    }

    return {
        ok: true,
        data: {
            formName,
            name,
            email,
            phone,
            subject: SUBJECTS[subjectKey] || 'Belirtilmedi',
            district,
            area: areaKey ? AREAS[areaKey] : '',
            message
        }
    };
}

const escapeHtml = (text) => String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Doğrulanmış veriden e-posta konusu, düz metin ve HTML gövdesi üretir. */
export function buildEmail(data) {
    const source = FORM_TYPES[data.formName];

    if (data.formName === 'bulten') {
        return {
            subject: `Yeni bülten aboneliği: ${data.email}`,
            text: `Web sitesinden yeni bülten aboneliği:\n\n${data.email}`,
            html: `<p>Web sitesinden yeni bülten aboneliği:</p><p><strong>${escapeHtml(data.email)}</strong></p>`
        };
    }

    const rows = [
        ['Kaynak', source],
        ['Ad Soyad', data.name],
        ['E-posta', data.email],
        ['Telefon', data.phone || '-'],
        ['Konu', data.subject],
        ...(data.district ? [['İlçe / konum', data.district]] : []),
        ...(data.area ? [['Alan', data.area]] : [])
    ];
    const prefix = data.formName === 'teklif' ? 'Teklif talebi' : 'Web sitesi mesajı';

    return {
        subject: `${prefix}: ${data.subject} - ${data.name}`,
        text: [...rows.map(([k, v]) => `${k}: ${v}`), '', data.message].join('\n'),
        html: [
            '<table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif">',
            ...rows.map(([k, v]) => `<tr><td><strong>${k}</strong></td><td>${escapeHtml(v)}</td></tr>`),
            '</table>',
            `<p style="white-space:pre-wrap;font-family:sans-serif">${escapeHtml(data.message)}</p>`
        ].join('')
    };
}
