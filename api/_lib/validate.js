// Üyelik ve hesap formlarının doğrulaması (saf fonksiyonlar, testlenebilir).

import { EMAIL_RE, PHONE_RE } from './contact.js';

const MAX_PASSWORD_BYTES = 72; // bcrypt yalnızca ilk 72 baytı kullanır
const MIN_PASSWORD_LENGTH = 10;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ERRORS = Object.freeze({
    fullName: 'Ad soyad 2-100 karakter olmalıdır.',
    email: 'Geçerli bir e-posta adresi girin.',
    passwordShort: 'Şifre en az 10 karakter olmalıdır.',
    passwordLong: 'Şifre çok uzun. Lütfen daha kısa bir şifre seçin.',
    passwordEmpty: 'Şifrenizi girin.',
    phone: 'Geçerli bir telefon numarası girin.',
    kvkk: 'Devam etmek için KVKK aydınlatma metnini onaylayın.',
    consent: 'İzin tercihi geçersiz.',
    address: 'Adres bilgilerini kontrol edin.'
});

const clean = (value) => (typeof value === 'string' ? value.trim() : '');
const bag = (input) => (input && typeof input === 'object' ? input : {});
const invalid = (error) => ({ ok: false, error });

export function normalizeEmail(value) {
    return clean(value).toLowerCase();
}

function checkEmail(value) {
    const email = normalizeEmail(value);
    return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

function checkName(value, min = 2, max = 100) {
    const text = clean(value);
    return text.length >= min && text.length <= max && !CONTROL_RE.test(text) ? text : null;
}

// Boş telefon null olur; dolu ama geçersizse undefined döner.
function checkOptionalPhone(value) {
    const phone = clean(value);
    if (!phone) return null;
    return PHONE_RE.test(phone) ? phone : undefined;
}

function passwordError(password, { policy }) {
    if (typeof password !== 'string' || password.length === 0) return ERRORS.passwordEmpty;
    if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) return ERRORS.passwordLong;
    if (policy && (password.length < MIN_PASSWORD_LENGTH || !password.trim())) return ERRORS.passwordShort;
    return null;
}

export function validateRegistration(input) {
    const body = bag(input);
    if (clean(body['bot-field'])) return { ok: true, spam: true };

    const fullName = checkName(body.fullName);
    if (!fullName) return invalid(ERRORS.fullName);
    const email = checkEmail(body.email);
    if (!email) return invalid(ERRORS.email);
    const error = passwordError(body.password, { policy: true });
    if (error) return invalid(error);
    const phone = checkOptionalPhone(body.phone);
    if (phone === undefined) return invalid(ERRORS.phone);
    if (body.kvkk !== true) return invalid(ERRORS.kvkk);

    return { ok: true, data: { fullName, email, password: body.password, phone, marketing: body.marketing === true } };
}

export function validateCredentials(input) {
    const body = bag(input);
    const email = checkEmail(body.email);
    if (!email) return invalid(ERRORS.email);
    const error = passwordError(body.password, { policy: false });
    if (error) return invalid(error);
    return { ok: true, data: { email, password: body.password } };
}

export function validateEmailOnly(input) {
    const email = checkEmail(bag(input).email);
    return email ? { ok: true, data: { email } } : invalid(ERRORS.email);
}

export function validateNewPassword(input) {
    const { password } = bag(input);
    const error = passwordError(password, { policy: true });
    return error ? invalid(error) : { ok: true, data: { password } };
}

export function validateProfile(input) {
    const body = bag(input);
    const fullName = checkName(body.fullName);
    if (!fullName) return invalid(ERRORS.fullName);
    const phone = checkOptionalPhone(body.phone);
    if (phone === undefined) return invalid(ERRORS.phone);
    return { ok: true, data: { fullName, phone } };
}

export function validateConsent(input) {
    const { marketing } = bag(input);
    return typeof marketing === 'boolean' ? { ok: true, data: { marketing } } : invalid(ERRORS.consent);
}

export function validateAddress(input) {
    const body = bag(input);
    const id = body.id === undefined || body.id === null || body.id === '' ? null : body.id;
    if (id !== null && !(typeof id === 'string' && UUID_RE.test(id))) return invalid(ERRORS.address);

    const data = {
        id,
        title: checkName(body.title, 1, 40),
        recipientName: checkName(body.recipientName),
        phone: PHONE_RE.test(clean(body.phone)) ? clean(body.phone) : null,
        city: checkName(body.city, 2, 60),
        district: checkName(body.district, 2, 60),
        neighbourhood: checkName(body.neighbourhood, 2, 60),
        line: checkName(body.line, 5, 250),
        postalCode: clean(body.postalCode) || null,
        isDefault: body.isDefault === true
    };
    const required = ['title', 'recipientName', 'phone', 'city', 'district', 'neighbourhood', 'line'];
    if (required.some(key => !data[key])) return invalid(ERRORS.address);
    if (data.postalCode !== null && !/^\d{5}$/.test(data.postalCode)) return invalid(ERRORS.address);
    return { ok: true, data };
}
