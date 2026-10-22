import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validatePlantSubmission, buildPlantEmail, LIMITS } from '../api/_lib/plant-doctor.js';
import { createPlantHandler } from '../api/plant-doctor.js';

const NOW = 1_800_000_000_000;
const jpeg = (size = 200) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size)]).toString('base64');
const photo = (size) => `data:image/jpeg;base64,${jpeg(size)}`;

const valid = () => ({
    'form-name': 'bitki-doktoru',
    started: String(NOW - 60_000),
    name: 'Ayşe Yılmaz',
    email: 'Ayse@Example.test ',
    phone: '0532 000 00 00',
    plant: 'Monstera',
    location: 'ic',
    symptoms: ['sararma', 'leke'],
    message: 'Alt yaprakları iki haftadır sararıyor.',
    photos: [photo(), photo()],
    kvkk: 'on',
    publish: 'on'
});

const ENV = { RESEND_API_KEY: 'test-key', CONTACT_TO_EMAIL: 'a@x.test', CONTACT_FROM_EMAIL: 'Site <form@x.test>' };

function mockRes() {
    const res = { statusCode: 200, headers: {}, body: undefined };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    res.setHeader = (k, v) => { res.headers[k] = v; };
    return res;
}

const req = (body, headers = {}) => ({ method: 'POST', headers, body });

test('geçerli gönderim normalize edilir', () => {
    const r = validatePlantSubmission(valid(), NOW);
    assert.equal(r.ok, true);
    assert.equal(r.data.email, 'ayse@example.test');
    assert.equal(r.data.location, 'İç mekân');
    assert.deepEqual(r.data.symptoms, ['Sararma', 'Kahverengi leke']);
    assert.equal(r.data.photos.length, 2);
    assert.equal(r.data.publish, true);
});

test('bitki adı ve belirti isteğe bağlıdır', () => {
    const body = { ...valid(), plant: '', symptoms: undefined, publish: undefined };
    const r = validatePlantSubmission(body, NOW);
    assert.equal(r.ok, true);
    assert.equal(r.data.plant, 'Belirtilmedi');
    assert.deepEqual(r.data.symptoms, []);
    assert.equal(r.data.publish, false);
});

test('tek belirti dizi yerine metin olarak da gelebilir', () => {
    const r = validatePlantSubmission({ ...valid(), symptoms: 'bocek' }, NOW);
    assert.deepEqual(r.data.symptoms, ['Böcek / zararlı']);
});

test('honeypot dolu ise spam sayılır', () => {
    assert.deepEqual(validatePlantSubmission({ ...valid(), 'bot-field': 'x' }, NOW), { ok: true, spam: true });
});

test('çok hızlı doldurulan form spam sayılır', () => {
    const r = validatePlantSubmission({ ...valid(), started: String(NOW - 1000) }, NOW);
    assert.deepEqual(r, { ok: true, spam: true });
});

test('KVKK onayı zorunludur', () => {
    const r = validatePlantSubmission({ ...valid(), kvkk: undefined }, NOW);
    assert.equal(r.ok, false);
    assert.match(r.error, /KVKK/);
});

test('fotoğraf olmadan gönderilemez', () => {
    assert.equal(validatePlantSubmission({ ...valid(), photos: [] }, NOW).ok, false);
});

test('en fazla 3 fotoğraf kabul edilir', () => {
    const r = validatePlantSubmission({ ...valid(), photos: [photo(), photo(), photo(), photo()] }, NOW);
    assert.equal(r.ok, false);
    assert.match(r.error, /3/);
});

test('JPEG olmayan dosya reddedilir', () => {
    const png = `data:image/jpeg;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString('base64')}`;
    assert.equal(validatePlantSubmission({ ...valid(), photos: [png] }, NOW).ok, false);
    assert.equal(validatePlantSubmission({ ...valid(), photos: ['data:image/png;base64,AAAA'] }, NOW).ok, false);
});

test('sınırı aşan büyük fotoğraf reddedilir', () => {
    const r = validatePlantSubmission({ ...valid(), photos: [photo(LIMITS.photoBytes + 10)] }, NOW);
    assert.equal(r.ok, false);
});

test('geçersiz konum ve bilinmeyen belirti reddedilir', () => {
    assert.equal(validatePlantSubmission({ ...valid(), location: 'mars' }, NOW).ok, false);
    assert.equal(validatePlantSubmission({ ...valid(), symptoms: ['uydurma'] }, NOW).ok, false);
});

test('e-posta: konu, kaçışlı HTML ve ekler', () => {
    const r = validatePlantSubmission({ ...valid(), message: '<script>x</script>' }, NOW);
    const email = buildPlantEmail(r.data);
    assert.match(email.subject, /^Bitki Doktoru: Monstera/);
    assert.match(email.subject, /yayın izni: evet/);
    assert.ok(!email.html.includes('<script>'));
    assert.equal(email.attachments.length, 2);
    assert.equal(email.attachments[0].filename, 'bitki-1.jpg');
    assert.equal(email.attachments[0].content, jpeg());
});

test('handler: başarılı gönderimde Resend\'e ekler iletilir', async () => {
    let sent = null;
    const fetchImpl = async (url, init) => { sent = JSON.parse(init.body); return { ok: true }; };
    const handler = createPlantHandler({ env: { ...ENV, PLANT_DOCTOR_TO_EMAIL: 'doktor@x.test' }, fetchImpl, now: () => NOW });
    const res = mockRes();
    await handler(req(valid()), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true });
    assert.deepEqual(sent.to, ['doktor@x.test']);
    assert.equal(sent.reply_to, 'ayse@example.test');
    assert.equal(sent.attachments.length, 2);
});

test('handler: ayrı adres yoksa iletişim adresine gider', async () => {
    let sent = null;
    const fetchImpl = async (url, init) => { sent = JSON.parse(init.body); return { ok: true }; };
    await createPlantHandler({ env: ENV, fetchImpl, now: () => NOW })(req(valid()), mockRes());
    assert.deepEqual(sent.to, ['a@x.test']);
});

test('handler: büyük istek 413 döner', async () => {
    const res = mockRes();
    await createPlantHandler({ env: ENV, now: () => NOW })(req(valid(), { 'content-length': String(LIMITS.bodyBytes + 1) }), res);
    assert.equal(res.statusCode, 413);
});

test('handler: doğrulama hatası 400, eksik ortam 500, Resend hatası 502', async () => {
    const bad = mockRes();
    await createPlantHandler({ env: ENV, now: () => NOW })(req({ ...valid(), email: 'x' }), bad);
    assert.equal(bad.statusCode, 400);

    const noEnv = mockRes();
    await createPlantHandler({ env: {}, now: () => NOW })(req(valid()), noEnv);
    assert.equal(noEnv.statusCode, 500);

    const failing = mockRes();
    const fetchImpl = async () => ({ ok: false, status: 422, text: async () => 'hata' });
    await createPlantHandler({ env: ENV, fetchImpl, now: () => NOW })(req(valid()), failing);
    assert.equal(failing.statusCode, 502);
});

test('handler: spam sessizce başarılı döner, e-posta gönderilmez', async () => {
    let called = false;
    const fetchImpl = async () => { called = true; return { ok: true }; };
    const res = mockRes();
    await createPlantHandler({ env: ENV, fetchImpl, now: () => NOW })(req({ ...valid(), 'bot-field': 'x' }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(called, false);
});

test('handler: yalnızca POST', async () => {
    const res = mockRes();
    await createPlantHandler({ env: ENV })({ method: 'GET', headers: {} }, res);
    assert.equal(res.statusCode, 405);
});
