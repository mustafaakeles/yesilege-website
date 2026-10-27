import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const pages = [
    ...readdirSync(ROOT).filter(name => name.endsWith('.html') && name !== '404.html'),
    ...readdirSync(join(ROOT, 'blog-yazilari')).filter(name => name.endsWith('.html')).map(name => 'blog-yazilari/' + name)
];

test('tüm sayfalarda doğru işletme telefonları ve 225 adresi yer alır', () => {
    for (const path of pages) {
        const html = read(path);
        assert.match(html, /0535 080 59 51/, path);
        assert.match(html, /(?:0532 324 72 88|\+90 532 324 72 88)/, path);
        assert.match(html, /No: 225/, path);
        assert.doesNotMatch(html, /No: 231|0532 575 58 76/, path);
    }
});

test('bülten formu gerçek abonelik sistemi kurulana kadar yayınlanmaz', () => {
    for (const path of pages) {
        assert.doesNotMatch(read(path), /name="bulten"|Bültene kaydoldunuz/, path);
    }
});

test('yerel HTML bağlantıları ve görseller depoda bulunur', () => {
    for (const path of pages) {
        const html = read(path);
        const links = [...html.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)].map(m => m[1]);
        for (const href of links) {
            if (/^(?:https?:|tel:|mailto:|data:|#|\/)/.test(href)) continue;
            const relative = href.split(/[?#]/)[0];
            if (!relative) continue;
            const target = resolve(ROOT, dirname(path), relative);
            assert.ok(existsSync(target), path + ' -> ' + href);
        }
    }
});

test('animasyonlu ekranlar temsili olduğu açıkça belirtilerek sunulur', () => {
    const html = read('index.html');
    assert.match(html, /canlı sera veya stok verisi değildir/);
    assert.doesNotMatch(html, /500\+|100\.000\+|50\+ Uzman/);
});

test('menülü her sayfada hesap bağlantısı bulunur', () => {
    for (const path of pages) {
        const html = read(path);
        if (!html.includes('aria-label="Ana menü"')) continue;
        const prefix = path.startsWith('blog-yazilari/') ? '../' : '';
        assert.ok(html.includes(`<a href="${prefix}giris.html" class="nav-account" data-account-link aria-label="Giriş yap">`), path);
    }
});

test('script.js oturum ipucu çerezine göre hesap bağlantısını günceller', () => {
    const script = read('script.js');
    assert.match(script, /ye_session=1/);
    assert.match(script, /hesabim\.html/);
});
