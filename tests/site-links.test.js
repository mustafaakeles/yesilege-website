// Tüm yayımlanan HTML sayfalarının yerel bağlantıları ve içerik bütünlüğü.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const HOST = 'https://yesilege.com.tr';

function htmlFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const absolute = join(directory, entry.name);
        if (entry.isDirectory()) {
            if (['_internal', 'node_modules', 'artifacts', '.git'].includes(entry.name)) return [];
            return htmlFiles(absolute);
        }
        return entry.name.endsWith('.html') ? [absolute] : [];
    });
}

const pages = htmlFiles(ROOT);

test('Yayımlanan HTML sayfaları ve yerel dosya bağlantıları eksiksiz', () => {
    assert.ok(pages.length >= 20, 'Yayındaki sayfalar beklenenden az');
    let checked = 0;
    for (const page of pages) {
        const path = relative(ROOT, page).replaceAll('\\', '/');
        const content = readFileSync(page, 'utf8');
        const ids = [...content.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
        assert.equal(new Set(ids).size, ids.length, path + ': yinelenen HTML id');

        for (const match of content.matchAll(/<(?:a|img|script|link)\b[^>]*?\b(?:src|href)=["']([^"']+)["'][^>]*>/gi)) {
            const href = match[1];
            if (/^(?:https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(href)) continue;
            const url = new URL(href, HOST + '/' + path);
            if (url.origin !== HOST) continue;
            const target = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
            if (/^(?:api\/|_vercel\/)/.test(target)) continue;
            const absolute = resolve(ROOT, target);
            assert.ok(absolute.startsWith(ROOT + '/') && existsSync(absolute),
                path + ': eksik dosya ' + href);
            if (url.hash && target.endsWith('.html')) {
                const html = readFileSync(absolute, 'utf8');
                const id = decodeURIComponent(url.hash.slice(1));
                assert.ok(html.includes('id="' + id + '"') || html.includes("id='" + id + "'"),
                    path + ': eksik bağlantı hedefi ' + href);
            }
            checked++;
        }
        for (const match of content.matchAll(/<img\b[^>]*>/gi)) {
            assert.match(match[0], /\balt=["'][^"']*["']/, path + ': açıklaması eksik görsel');
        }
    }
    assert.ok(checked >= 350, 'Yeterli sayıda iç bağlantı kontrol edilmedi');
});
