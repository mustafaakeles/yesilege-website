import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    validateRegistration, validateCredentials, validateEmailOnly, validateNewPassword,
    validateProfile, validateConsent, validateAddress, normalizeEmail
} from '../api/_lib/validate.js';

const registration = {
    fullName: 'Ayşe Yılmaz',
    email: ' Ayse@Example.TEST ',
    password: 'guclu-sifre-123',
    phone: '',
    kvkk: true
};

const address = {
    title: 'Ev',
    recipientName: 'Ayşe Yılmaz',
    phone: '0532 000 00 00',
    city: 'İzmir',
    district: 'Bayındır',
    neighbourhood: 'Karaveliler',
    line: 'Kazım Dirik Cd. No: 225',
    postalCode: '35847',
    isDefault: true
};

test('geçerli kayıt normalize edilir', () => {
    const result = validateRegistration(registration);
    assert.equal(result.ok, true);
    assert.deepEqual(result.data, {
        fullName: 'Ayşe Yılmaz',
        email: 'ayse@example.test',
        password: 'guclu-sifre-123',
        phone: null,
        marketing: false
    });
});

test('KVKK onayı yalnızca boolean true ile kabul edilir', () => {
    assert.deepEqual(validateRegistration({ ...registration, kvkk: 'true' }),
        { ok: false, error: 'Devam etmek için KVKK aydınlatma metnini onaylayın.' });
});

test('şifre uzunluğu karakter değil bayt ile sınırlanır', () => {
    assert.deepEqual(validateRegistration({ ...registration, password: 'a'.repeat(9) }),
        { ok: false, error: 'Şifre en az 10 karakter olmalıdır.' });
    assert.deepEqual(validateRegistration({ ...registration, password: 'ş'.repeat(37) }),
        { ok: false, error: 'Şifre çok uzun. Lütfen daha kısa bir şifre seçin.' });
    assert.equal(validateRegistration({ ...registration, password: 'ş'.repeat(36) }).ok, true);
    assert.equal(validateRegistration({ ...registration, password: ' '.repeat(12) }).ok, false);
});

test('ad soyadda kontrol karakteri reddedilir', () => {
    assert.deepEqual(validateRegistration({ ...registration, fullName: 'Ali\u0000' }),
        { ok: false, error: 'Ad soyad 2-100 karakter olmalıdır.' });
});

test('geçersiz e-posta ve telefon reddedilir', () => {
    assert.deepEqual(validateRegistration({ ...registration, email: 'abc' }),
        { ok: false, error: 'Geçerli bir e-posta adresi girin.' });
    assert.deepEqual(validateRegistration({ ...registration, phone: 'ara beni' }),
        { ok: false, error: 'Geçerli bir telefon numarası girin.' });
});

test('bal küpü alanı doluysa kayıt spam sayılır', () => {
    assert.deepEqual(validateRegistration({ ...registration, 'bot-field': 'x' }), { ok: true, spam: true });
});

test('kayıtta bilinmeyen alanlar (role) veriye geçmez', () => {
    const result = validateRegistration({ ...registration, role: 'admin', marketing: true });
    assert.equal('role' in result.data, false);
    assert.equal(result.data.marketing, true);
});

test('girişte şifre politikası uygulanmaz ama bayt sınırı uygulanır', () => {
    assert.deepEqual(validateCredentials({ email: 'A@B.test', password: 'abc' }),
        { ok: true, data: { email: 'a@b.test', password: 'abc' } });
    assert.equal(validateCredentials({ email: 'a@b.test', password: 'ş'.repeat(37) }).ok, false);
    assert.equal(validateCredentials({ email: 'a@b.test', password: '' }).ok, false);
});

test('e-posta ve yeni şifre doğrulayıcıları', () => {
    assert.deepEqual(validateEmailOnly({ email: ' X@Y.test' }), { ok: true, data: { email: 'x@y.test' } });
    assert.equal(validateEmailOnly({}).ok, false);
    assert.equal(validateNewPassword({ password: 'kisa' }).ok, false);
    assert.deepEqual(validateNewPassword({ password: 'yeterince-uzun' }), { ok: true, data: { password: 'yeterince-uzun' } });
});

test('profil doğrulama', () => {
    assert.deepEqual(validateProfile({ fullName: ' Ali Veli ', phone: '0532 111 22 33', role: 'admin' }),
        { ok: true, data: { fullName: 'Ali Veli', phone: '0532 111 22 33' } });
    assert.equal(validateProfile({ fullName: 'A' }).ok, false);
});

test('izin yalnızca boolean kabul eder', () => {
    assert.deepEqual(validateConsent({ marketing: true }), { ok: true, data: { marketing: true } });
    assert.equal(validateConsent({ marketing: 'true' }).ok, false);
});

test('adres doğrulama', () => {
    const ok = validateAddress(address);
    assert.equal(ok.ok, true);
    assert.equal(ok.data.id, null);
    assert.equal(ok.data.isDefault, true);
    assert.deepEqual(validateAddress({ ...address, id: '1 OR 1=1' }), { ok: false, error: 'Adres bilgilerini kontrol edin.' });
    assert.equal(validateAddress({ ...address, postalCode: '3584' }).ok, false);
    assert.equal(validateAddress({ ...address, postalCode: '' }).data.postalCode, null);
    assert.equal(validateAddress({ ...address, isDefault: 'yes' }).data.isDefault, false);
    assert.equal(validateAddress({ ...address, id: '5b0c3f0e-8a5e-4c1e-9f1d-2f0f1c6f9a11' }).data.id, '5b0c3f0e-8a5e-4c1e-9f1d-2f0f1c6f9a11');
    assert.equal(validateAddress({ ...address, line: 'kısa' }).ok, false);
    assert.equal(validateAddress({ ...address, phone: '' }).ok, false);
});

test('normalizeEmail büyük harf ve boşlukları giderir', () => {
    assert.equal(normalizeEmail('  Ayse@Example.TEST '), 'ayse@example.test');
    assert.equal(normalizeEmail(42), '');
});
