import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const pages = [
    ...readdirSync(ROOT).filter(name => name.endsWith('.html') && name !== '404.html'),
    ...readdirSync(join(ROOT, 'blog-yazilari'))
        .filter(name => name.endsWith('.html'))
        .map(name => 'blog-yazilari/' + name)
];

test('ana içerik hedefi ve klavye ile atlama bağlantısı her sayfada bulunur', () => {
    for (const path of pages) {
        const html = read(path);
        assert.match(html, /class="skip-link" href="#main"/, path);
        assert.match(html, /<main id="main"/, path);
        assert.match(html, /aria-label="Ana menü"/, path);
    }
});

test('galeri görselleri açıkça etkileşimli ve klavyeyle erişilebilir', () => {
    const html = read('index.html');
    const cards = [...html.matchAll(/<figure class="gallery-item"[^>]*>/g)].map(x => x[0]);
    assert.equal(cards.length, 6);
    for (const card of cards) {
        assert.match(card, /role="button"/);
        assert.match(card, /tabindex="0"/);
        assert.match(card, /aria-label="/);
    }
    const script = read('script.js');
    assert.match(script, /e\.key === 'Enter' \|\| e\.key === ' '/);
});

test('AJAX formları için anons edilen başarı veya hata durumu vardır', () => {
    const script = read('script.js');
    assert.match(script, /aria-live', 'polite'/);
    assert.match(script, /aria-atomic', 'true'/);
    assert.match(script, /response\.status === 429/);
});

test('Magnolia yalnızca açılınca odaklanabilir ve Escape ile kapanır', () => {
    const script = read('mascot.js');
    assert.match(script, /aria-hidden="true" inert/);
    assert.match(script, /windowEl\.inert = !open/);
    assert.match(script, /e\.key === 'Escape'/);
});
