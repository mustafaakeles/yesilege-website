// Hesap sayfalarının SEO, form erişilebilirliği ve istemci güvenliği denetimleri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { safeReturnPath } from '../account-utils.js';

const ROOT = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const AUTH_PAGES = ['giris.html', 'kayit.html', 'sifre-sifirla.html'];
const inputTag = (html, name) => (html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`, 'g')) || []);

test('hesap sayfaları dizine eklenmez ve site haritasında yer almaz', () => {
    const sitemap = read('sitemap.xml');
    for (const page of AUTH_PAGES) {
        const html = read(page);
        assert.match(html, /<meta name="robots" content="noindex, nofollow">/, page);
        assert.doesNotMatch(html, /rel="canonical"/, page);
        assert.ok(!sitemap.includes(page), page);
    }
});

test('şifre alanlarında doğru autocomplete değerleri kullanılır', () => {
    assert.match(inputTag(read('giris.html'), 'password')[0], /autocomplete="current-password"/);
    assert.match(inputTag(read('kayit.html'), 'password')[0], /autocomplete="new-password"/);
    const reset = inputTag(read('sifre-sifirla.html'), 'password');
    assert.ok(reset.length >= 1);
    for (const tag of reset) assert.match(tag, /autocomplete="new-password"/);
});

test('ticari ileti izni önceden işaretli değildir, KVKK onayı zorunludur', () => {
    const html = read('kayit.html');
    const [marketing] = inputTag(html, 'marketing');
    const [kvkk] = inputTag(html, 'kvkk');
    assert.ok(marketing && !/\bchecked\b/.test(marketing));
    assert.match(kvkk, /\brequired\b/);
    assert.match(html, /href="kvkk\.html"/);
    assert.equal(inputTag(html, 'bot-field').length, 1);
});

test('her hesap formunun anons edilen bir durum alanı vardır', () => {
    for (const page of AUTH_PAGES) {
        const html = read(page);
        const forms = html.match(/<form[^>]*data-form="[^"]+"[\s\S]*?<\/form>/g) || [];
        assert.ok(forms.length >= 1, page);
        for (const form of forms) assert.match(form, /class="form-feedback"[^>]*aria-live="polite"/, page);
        assert.match(html, /<script type="module" src="account\.js\?v=\w+"><\/script>/, page);
    }
});

test('dönüş adresi yalnızca site içi göreli yol olabilir', () => {
    assert.equal(safeReturnPath('//evil.example'), 'hesabim.html');
    assert.equal(safeReturnPath('https://evil.example'), 'hesabim.html');
    assert.equal(safeReturnPath('/\\evil.example'), 'hesabim.html');
    assert.equal(safeReturnPath('javascript:alert(1)'), 'hesabim.html');
    assert.equal(safeReturnPath('/hesabim.html'), '/hesabim.html');
    assert.equal(safeReturnPath('/hesabim.html#adresler'), '/hesabim.html#adresler');
    assert.equal(safeReturnPath(null), 'hesabim.html');
});

test('robots.txt hesap sayfalarını ve API\'yi taramaya kapatır, site haritasını korur', () => {
    const robots = read('robots.txt');
    for (const path of ['/hesabim.html', '/giris.html', '/kayit.html', '/sifre-sifirla.html', '/api/']) {
        assert.ok(robots.includes(`Disallow: ${path}`), path);
    }
    assert.match(robots, /Sitemap: https:\/\/yesilege\.com\.tr\/sitemap\.xml/);
});

test('hesap betikleri kullanıcı verisini innerHTML ile yazmaz', () => {
    assert.doesNotMatch(read('account.js'), /innerHTML/);
});

test('Hesabım sayfası dizine eklenmez ve erişilebilir sekme yapısı kullanır', () => {
    const html = read('hesabim.html');
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    assert.doesNotMatch(html, /rel="canonical"/);
    assert.match(html, /role="tablist"/);
    assert.equal((html.match(/role="tab"/g) || []).length, 3);
    assert.equal((html.match(/role="tabpanel"/g) || []).length, 3);
    for (const form of ['profile', 'address', 'password', 'delete-request']) {
        assert.match(html, new RegExp(`data-account-form="${form}"`), form);
    }
    assert.match(html, /<dialog[^>]*id="delete-dialog"/);
});

test('KVKK metni üyelik verilerini kapsar ve taslak notunu korur', () => {
    const html = read('kvkk.html');
    assert.match(html, /<h2>[^<]*Üyelik[^<]*<\/h2>/);
    assert.match(html, /TASLAK/);
    assert.match(html, /Supabase/);
});
