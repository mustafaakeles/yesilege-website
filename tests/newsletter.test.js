import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    normalizeSubscriberEmail,
    createVerificationToken,
    verifyVerificationToken
} from '../api/_lib/newsletter.js';
import { createNewsletterHandler } from '../api/newsletter.js';
import { createRateLimiter } from '../api/contact.js';

const SECRET = 'local-test-only-newsletter-secret-with-adequate-length';
const ENV = {
    NEWSLETTER_ENABLED: 'true',
    RESEND_API_KEY: 'test-key',
    CONTACT_FROM_EMAIL: 'Yeşil Ege <site@example.test>',
    NEWSLETTER_SECRET: SECRET,
    NEWSLETTER_TOPIC_ID: 'topic-example',
    NEWSLETTER_PUBLIC_ORIGIN: 'https://yesilege.com.tr'
};

function mockRes() {
    const res = { statusCode: 200, headers: {}, body: undefined };
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => { res.body = body; return res; };
    res.setHeader = (key, value) => { res.headers[key] = value; };
    return res;
}

const request = body => ({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vercel-forwarded-for': '192.0.2.91' },
    body
});

function handler(env = ENV, fetchImpl = async () => ({ ok: true, status: 200 })) {
    return createNewsletterHandler({
        env,
        fetchImpl,
        rateLimiter: createRateLimiter({ max: 20 })
    });
}

test('bülten e-postası normalize edilir, hatalı adresler reddedilir', () => {
    assert.equal(normalizeSubscriberEmail('  A@Example.org '), 'a@example.org');
    assert.equal(normalizeSubscriberEmail('abc'), null);
    assert.equal(normalizeSubscriberEmail('a@b'), null);
    assert.equal(normalizeSubscriberEmail({}), null);
});

test('onay anahtarı şifreli ve zaman kısıtlıdır', () => {
    const token = createVerificationToken('A@Example.org', SECRET, 1_000_000);
    assert.equal(verifyVerificationToken(token, SECRET, 1_000_100), 'a@example.org');
    assert.ok(!token.includes('example'));
    assert.equal(verifyVerificationToken(token, 'wrong-secret-but-sufficiently-long!', 1_000_100), null);
    assert.equal(verifyVerificationToken(token, SECRET, 1_000_000 + 48 * 60 * 60 * 1000), null);
});

test('bozulmuş, gelecekte üretilmiş ve kısa onay anahtarı reddedilir', () => {
    const token = createVerificationToken('test@example.org', SECRET, 1_000_000);
    assert.equal(verifyVerificationToken(token.slice(0, -3) + 'abc', SECRET, 1_000_100), null);
    assert.equal(verifyVerificationToken(token, SECRET, 1), null);
    assert.equal(verifyVerificationToken('short', SECRET), null);
});

test('özellik kapalıysa hiçbir sağlayıcı çağrısı yapılmaz', async () => {
    let calls = 0;
    const res = mockRes();
    await handler({}, async () => { calls++; return { ok: true }; })(
        request({ action: 'request', email: 'a@example.org', marketingConsent: true }), res
    );
    assert.equal(res.statusCode, 503);
    assert.equal(calls, 0);
});

test('eksik açık bülten izni ve geçersiz e-posta reddedilir', async () => {
    let calls = 0;
    const h = handler(ENV, async () => { calls++; return { ok: true }; });
    const withoutConsent = mockRes();
    await h(request({ action: 'request', email: 'a@example.org', marketingConsent: false }), withoutConsent);
    assert.equal(withoutConsent.statusCode, 400);
    const invalidEmail = mockRes();
    await h(request({ action: 'request', email: 'not-an-email', marketingConsent: true }), invalidEmail);
    assert.equal(invalidEmail.statusCode, 400);
    assert.equal(calls, 0);
});

test('ilk başvuru Resend üzerinden yalnızca onay e-postası gönderir', async () => {
    const sent = [];
    const h = handler(ENV, async (url, init) => {
        sent.push({ url, init });
        return { ok: true, status: 200 };
    });
    const res = mockRes();
    await h(request({ action: 'request', email: 'a@example.org', marketingConsent: true }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.pending, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, 'https://api.resend.com/emails');
    const email = JSON.parse(sent[0].init.body);
    assert.deepEqual(email.to, ['a@example.org']);
    assert.match(email.text, /subscription\/confirm\.html\?token=/);
    assert.ok(!email.text.includes('contacts'));
});

test('doğrulanmış onay, Resend Contacts Topic opt-in kaydı oluşturur', async () => {
    const calls = [];
    const h = handler(ENV, async (url, init) => {
        calls.push({ url, init });
        return { ok: true, status: 201 };
    });
    const token = createVerificationToken('A@Example.org', SECRET);
    const res = mockRes();
    await h(request({ action: 'confirm', token }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.subscribed, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.resend.com/contacts');
    const payload = JSON.parse(calls[0].init.body);
    assert.equal(payload.email, 'a@example.org');
    assert.deepEqual(payload.topics, [{ id: 'topic-example', subscription: 'opt_in' }]);
});

test('mevcut kayıt için yanıltıcı başarı yanıtı verilmez', async () => {
    const h = handler(ENV, async () => ({ ok: false, status: 409 }));
    const res = mockRes();
    await h(request({ action: 'confirm', token: createVerificationToken('a@example.org', SECRET) }), res);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.success, false);
});

test('onay anahtarı geçersizse dış servise istek gönderilmez', async () => {
    let calls = 0;
    const h = handler(ENV, async () => { calls++; return { ok: true }; });
    const res = mockRes();
    await h(request({ action: 'confirm', token: 'invalid' }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(calls, 0);
});

test('sağlayıcı hatası ve büyük gövde kontrollü yanıtlanır', async () => {
    const h = handler(ENV, async () => ({ ok: false, status: 500 }));
    const res = mockRes();
    const originalError = console.error;
    console.error = () => {};
    try {
        await h(request({ action: 'request', email: 'a@example.org', marketingConsent: true }), res);
    } finally {
        console.error = originalError;
    }
    assert.equal(res.statusCode, 502);
    const large = mockRes();
    await h(request({ action: 'request', email: 'a@example.org', marketingConsent: true, extra: 'x'.repeat(5000) }), large);
    assert.equal(large.statusCode, 413);
});

test('GET ve JSON olmayan içerik reddedilir', async () => {
    const h = handler();
    const get = mockRes();
    await h({ ...request({}), method: 'GET' }, get);
    assert.equal(get.statusCode, 405);
    const wrongType = mockRes();
    await h({ ...request({}), headers: { 'content-type': 'text/plain' } }, wrongType);
    assert.equal(wrongType.statusCode, 415);
});
