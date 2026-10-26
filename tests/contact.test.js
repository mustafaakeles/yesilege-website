import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateSubmission, buildEmail } from '../api/_lib/contact.js';
import { createHandler, createRateLimiter, verifiedRecipients } from '../api/contact.js';

const validContact = {
    'form-name': 'iletisim',
    name: 'Ayşe Yılmaz',
    email: 'Ayse@Example.test ',
    phone: '0532 000 00 00',
    subject: 'peyzaj',
    message: 'Bahçe projesi için teklif istiyorum.'
};

const ENV = { RESEND_API_KEY: 'test-key', CONTACT_TO_EMAIL: 'a@x.test, b@x.test', CONTACT_FROM_EMAIL: 'Site <form@x.test>' };

function mockRes() {
    const res = { statusCode: 200, headers: {}, body: undefined };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    res.setHeader = (k, v) => { res.headers[k] = v; };
    return res;
}

const req = (body, method = 'POST') => ({ method, headers: {}, body });

test('geçerli iletişim formu normalize edilir', () => {
    const r = validateSubmission(validContact);
    assert.equal(r.ok, true);
    assert.equal(r.data.email, 'ayse@example.test');
    assert.equal(r.data.subject, 'Peyzaj Projesi');
});

test('bilinmeyen form adı reddedilir', () => {
    assert.equal(validateSubmission({ ...validContact, 'form-name': 'x' }).ok, false);
});

test('geçersiz e-posta, boş mesaj ve hatalı telefon reddedilir', () => {
    assert.equal(validateSubmission({ ...validContact, email: 'abc' }).ok, false);
    assert.equal(validateSubmission({ ...validContact, message: '   ' }).ok, false);
    assert.equal(validateSubmission({ ...validContact, phone: 'ara beni' }).ok, false);
    assert.equal(validateSubmission({ ...validContact, message: 'x'.repeat(5001) }).ok, false);
});

test('honeypot dolu ise spam olarak işaretlenir', () => {
    assert.deepEqual(validateSubmission({ ...validContact, 'bot-field': 'http://spam' }), { ok: true, spam: true });
});

test('abonelik altyapısı yokken bülten isteği reddedilir', () => {
    assert.equal(validateSubmission({ 'form-name': 'bulten', email: 'a@b.test' }).ok, false);
});

test('e-posta HTML gövdesi kullanıcı girdisini escape eder', () => {
    const { data } = validateSubmission({ ...validContact, name: '<script>x</script>' });
    const email = buildEmail(data);
    assert.ok(!email.html.includes('<script>'));
    assert.ok(email.html.includes('&lt;script&gt;'));
});

test('handler: POST dışı istek 405 döner', async () => {
    const res = mockRes();
    await createHandler({ env: ENV, fetchImpl: async () => ({ ok: true }) })(req({}, 'GET'), res);
    assert.equal(res.statusCode, 405);
});

test('handler: geçersiz veri 400 döner ve e-posta gönderilmez', async () => {
    let called = false;
    const res = mockRes();
    await createHandler({ env: ENV, fetchImpl: async () => { called = true; return { ok: true }; } })(
        req({ ...validContact, email: '' }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(called, false);
});

test('handler: spam 200 döner ama e-posta gönderilmez', async () => {
    let called = false;
    const res = mockRes();
    await createHandler({ env: ENV, fetchImpl: async () => { called = true; return { ok: true }; } })(
        req({ ...validContact, 'bot-field': 'x' }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(called, false);
});

test('handler: geçerli form Resend API çağrısı yapar', async () => {
    let sent;
    const res = mockRes();
    await createHandler({
        env: ENV,
        fetchImpl: async (url, opts) => { sent = { url, opts }; return { ok: true }; }
    })(req(validContact), res);
    assert.equal(res.statusCode, 200);
    assert.equal(sent.url, 'https://api.resend.com/emails');
    assert.equal(sent.opts.headers.Authorization, 'Bearer test-key');
    const payload = JSON.parse(sent.opts.body);
    assert.deepEqual(payload.to, ['a@x.test', 'b@x.test']);
    assert.equal(payload.reply_to, 'ayse@example.test');
});

test('handler: eksik ortam değişkeni 500 döner', async () => {
    const res = mockRes();
    const origError = console.error;
    console.error = () => {};
    try {
        await createHandler({ env: {}, fetchImpl: async () => ({ ok: true }) })(req(validContact), res);
    } finally {
        console.error = origError;
    }
    assert.equal(res.statusCode, 500);
});

test('handler: Resend hatası 502 döner', async () => {
    const res = mockRes();
    const origError = console.error;
    console.error = () => {};
    try {
        await createHandler({
            env: ENV,
            fetchImpl: async () => ({ ok: false, status: 403, text: async () => 'forbidden' })
        })(req(validContact), res);
    } finally {
        console.error = origError;
    }
    assert.equal(res.statusCode, 502);
});

const validQuote = {
    'form-name': 'teklif',
    name: 'Mehmet Kaya',
    email: 'mehmet@example.test',
    phone: '0532 111 22 33',
    subject: 'sulama',
    district: 'Torbalı',
    area: 'orta',
    message: 'Bahçeye damla sulama kurdurmak istiyorum.'
};

test('teklif formu: ilçe, alan ve yeni konular kabul edilir', () => {
    const r = validateSubmission(validQuote);
    assert.equal(r.ok, true);
    assert.equal(r.data.subject, 'Otomatik Sulama');
    assert.equal(r.data.district, 'Torbalı');
    assert.equal(r.data.area, '100–500 m²');
    assert.equal(validateSubmission({ ...validQuote, subject: 'toptan' }).data.subject, 'Toptan Bitki Siparişi');
});

test('teklif formu: ilçe ve alan isteğe bağlıdır, geçersiz alan reddedilir', () => {
    const r = validateSubmission({ ...validQuote, district: '', area: '' });
    assert.equal(r.ok, true);
    assert.equal(r.data.district, '');
    assert.equal(r.data.area, '');
    assert.equal(validateSubmission({ ...validQuote, area: 'dev' }).ok, false);
    assert.equal(validateSubmission({ ...validQuote, district: 'x'.repeat(101) }).ok, false);
});

test('teklif e-postası: konu ve ek satırlar', () => {
    const email = buildEmail(validateSubmission(validQuote).data);
    assert.match(email.subject, /^Teklif talebi: Otomatik Sulama - Mehmet Kaya/);
    assert.match(email.text, /İlçe \/ konum: Torbalı/);
    assert.match(email.text, /Alan: 100–500 m²/);
});

test('iletişim e-postası ilçe/alan satırı eklemez', () => {
    const email = buildEmail(validateSubmission(validContact).data);
    assert.ok(!email.text.includes('İlçe'));
    assert.match(email.subject, /^Web sitesi mesajı/);
});

test('rate limit: aynı IP 5 başarılı isteğin ardından 429 alır', async () => {
    let clock = 0;
    const limiter = createRateLimiter({ max: 5, windowMs: 60_000, now: () => clock });
    const handler = createHandler({ env: ENV, limiter, fetchImpl: async () => ({ ok: true }) });
    for (let i = 0; i < 5; i++) {
        const res = mockRes();
        await handler({ ...req(validContact), headers: { 'x-forwarded-for': '192.0.2.10' } }, res);
        assert.equal(res.statusCode, 200);
    }
    const blocked = mockRes();
    await handler({ ...req(validContact), headers: { 'x-forwarded-for': '192.0.2.10' } }, blocked);
    assert.equal(blocked.statusCode, 429);
    assert.equal(blocked.headers['Retry-After'], '60');
    clock = 60_001;
    const renewed = mockRes();
    await handler({ ...req(validContact), headers: { 'x-forwarded-for': '192.0.2.10' } }, renewed);
    assert.equal(renewed.statusCode, 200);
});

test('rate limit: farklı IP bağımsız ve JSON olmayan içerik reddedilir', async () => {
    const limiter = createRateLimiter({ max: 1 });
    const handler = createHandler({ env: ENV, limiter, fetchImpl: async () => ({ ok: true }) });
    const first = mockRes();
    await handler({ ...req(validContact), headers: { 'x-forwarded-for': '192.0.2.11' } }, first);
    assert.equal(first.statusCode, 200);
    const other = mockRes();
    await handler({ ...req(validContact), headers: { 'x-forwarded-for': '192.0.2.12' } }, other);
    assert.equal(other.statusCode, 200);
    const wrong = mockRes();
    await handler({ ...req(validContact), headers: { 'content-type': 'text/plain' } }, wrong);
    assert.equal(wrong.statusCode, 415);
});

test('gövde boyutu yanlış bildirilse bile büyük JSON reddedilir', async () => {
    const handler = createHandler({ env: ENV, fetchImpl: async () => ({ ok: true }) });
    const res = mockRes();
    await handler({ ...req({ ...validContact, message: 'x'.repeat(21000) }), headers: { 'content-length': '10' } }, res);
    assert.equal(res.statusCode, 413);
});

test('Vercel IP başlığı, dış proxy tarafından aktarılan başlığa önceliklidir', async () => {
    const limiter = createRateLimiter({ max: 1 });
    const handler = createHandler({ env: ENV, limiter, fetchImpl: async () => ({ ok: true }) });
    const makeRequest = (client) => ({
        ...req(validContact),
        headers: { 'x-vercel-forwarded-for': '198.51.100.9', 'x-forwarded-for': client }
    });
    const first = mockRes();
    await handler(makeRequest('203.0.113.1'), first);
    assert.equal(first.statusCode, 200);
    const second = mockRes();
    await handler(makeRequest('203.0.113.2'), second);
    assert.equal(second.statusCode, 429);
});

test('MX kaydı yoksa kurumsal alıcıya sahte teslim başarısı dönmez', async () => {
    const env = { ...ENV, CONTACT_TO_EMAIL: 'form@yesilege.com.tr' };
    let sent = false;
    const handler = createHandler({
        env,
        mxLookup: async () => [],
        fetchImpl: async () => { sent = true; return { ok: true }; }
    });
    const origError = console.error;
    console.error = () => {};
    try {
        const res = mockRes();
        await handler(req(validQuote), res);
        assert.equal(res.statusCode, 503);
        assert.equal(res.body.success, false);
        assert.match(res.body.error, /telefon veya WhatsApp/);
    } finally {
        console.error = origError;
    }
    assert.equal(sent, false);
});

test('MX yoksa yalnızca çalışır harici e-posta alıcısına gönderir', async () => {
    const targets = await verifiedRecipients('form@yesilege.com.tr, iletisim@gmail.com', async () => []);
    assert.equal(targets.to, 'iletisim@gmail.com');
    assert.deepEqual(targets.excluded, ['form@yesilege.com.tr']);
});

test('MX kayıtları düzelirse kurumsal alıcıya teslim denemesi yapılabilir', async () => {
    const targets = await verifiedRecipients('info@yesilege.com.tr', async () => [
        { exchange: 'mx.example.net', priority: 10 }
    ]);
    assert.equal(targets.to, 'info@yesilege.com.tr');
    assert.deepEqual(targets.excluded, []);
});

test('harici e-posta alıcıları için MX sorgusuna gerek yoktur', async () => {
    let called = false;
    const targets = await verifiedRecipients('test@example.com', async () => { called = true; return []; });
    assert.equal(targets.to, 'test@example.com');
    assert.equal(called, false);
});
