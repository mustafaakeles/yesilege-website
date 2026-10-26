import { randomBytes, createHash, createCipheriv, createDecipheriv } from 'node:crypto';

const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;
const EXPIRY_MS = 48 * 60 * 60 * 1000;

export function normalizeSubscriberEmail(value) {
    if (typeof value !== 'string') return null;
    const email = value.trim().toLowerCase();
    return email.length <= 254 && EMAIL_PATTERN.test(email) ? email : null;
}

function encryptionKey(secret) {
    if (typeof secret !== 'string' || secret.length < 32) {
        throw new Error('NEWSLETTER_SECRET en az 32 karakter olmalıdır.');
    }
    return createHash('sha256').update(secret).digest();
}

// Alıcının adresi doğrulama URL'sinde açık metin olarak tutulmaz.
export function createVerificationToken(email, secret, now = Date.now()) {
    const normalized = normalizeSubscriberEmail(email);
    if (!normalized) throw new Error('Geçersiz e-posta adresi.');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
    const plaintext = Buffer.from(JSON.stringify({ email: normalized, issuedAt: now, expiresAt: now + EXPIRY_MS, v: 1 }));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}

export function verifyVerificationToken(token, secret, now = Date.now()) {
    if (typeof token !== 'string' || token.length > 800 || !/^[A-Za-z0-9_-]{32,800}$/.test(token)) return null;
    try {
        const bytes = Buffer.from(token, 'base64url');
        if (bytes.length < 32) return null;
        const iv = bytes.subarray(0, 12);
        const tag = bytes.subarray(12, 28);
        const ciphertext = bytes.subarray(28);
        const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        const data = JSON.parse(decrypted.toString('utf8'));
        if (data.v !== 1 || !Number.isFinite(data.issuedAt) || !Number.isFinite(data.expiresAt)) return null;
        if (data.issuedAt > now + 5 * 60_000 || data.expiresAt <= now) return null;
        if (data.expiresAt !== data.issuedAt + EXPIRY_MS) return null;
        return normalizeSubscriberEmail(data.email);
    } catch {
        return null;
    }
}
