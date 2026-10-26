import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = name => readFileSync(resolve(root, name), 'utf8');
const urls = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
const pages = ['index.html', 'services.html', 'contact.html', 'bayindir-fidanlik.html', 'izmir-peyzaj.html'];

test('Google ve Bing tarama izni ile site haritası bulunur', () => {
    const robots = read('robots.txt');
    assert.match(robots, /^User-agent: \*\nAllow: \/\n/m);
    assert.match(robots, /Sitemap: https:\/\/yesilege\.com\.tr\/sitemap\.xml/);
    assert.doesNotMatch(robots, /Crawl-delay:/);
    assert.equal(new Set(urls).size, urls.length, 'site haritasında tekrar var');
    assert.ok(urls.length >= 21);
    for (const url of urls) {
        assert.ok(url.startsWith('https://yesilege.com.tr/'), url);
        const path = new URL(url).pathname.slice(1) || 'index.html';
        assert.ok(read(path).includes('<html'), path);
    }
});

test('öncelikli sayfaların başlıkları, açıklamaları ve canonicals benzersiz', () => {
    const titles = new Set();
    const descriptions = new Set();
    for (const path of pages) {
        const html = read(path);
        const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
        const desc = html.match(/<meta name="description"\s+content="([^"]+)"/)?.[1]
            || html.match(/<meta name="description"\s*\n\s*content="([^"]+)"/)?.[1];
        assert.ok(title && title.length >= 25 && title.length <= 82, path + ': title');
        assert.ok(desc && desc.length >= 90 && desc.length <= 220, path + ': description');
        assert.ok(!titles.has(title), path + ': tekrar başlık');
        assert.ok(!descriptions.has(desc), path + ': tekrar açıklama');
        titles.add(title);
        descriptions.add(desc);
        const canonical = path === 'index.html' ? 'https://yesilege.com.tr/' : 'https://yesilege.com.tr/' + path;
        assert.ok(html.includes('rel="canonical" href="' + canonical + '"'), path + ': canonical');
    }
});

test('yerel hizmetler sayfalarında doğrulanabilir işletme bilgisi ve yapılandırılmış veri var', () => {
    for (const path of ['bayindir-fidanlik.html', 'izmir-peyzaj.html']) {
        const html = read(path);
        assert.match(html, /No: 225/);
        assert.match(html, /0535 080 59 51/);
        assert.match(html, /0532 324 72 88/);
        const data = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
            .flatMap(match => {
                const json = JSON.parse(match[1]);
                return json['@graph'] || [json];
            });
        assert.ok(data.some(item => item['@type'] === 'BreadcrumbList'), path + ': breadcrumb');
        assert.ok(data.some(item => item['@type'] === 'Service'), path + ': service');
    }
    assert.match(read('index.html'), /href="bayindir-fidanlik.html"/);
    assert.match(read('index.html'), /href="izmir-peyzaj.html"/);
    assert.match(read('services.html'), /href="bayindir-fidanlik.html"/);
    assert.match(read('services.html'), /href="izmir-peyzaj.html"/);
});

test('bozuk e-posta yönlendirmesine doğrudan bağlantı sunulmaz', () => {
    const contact = read('contact.html');
    assert.doesNotMatch(contact, /mailto:info@yesilege\.com\.tr/);
    assert.match(contact, /href="tel:\+905323247288"/);
    assert.doesNotMatch(read('index.html'), /"email": "info@yesilege\.com\.tr"/);
});

test('teklif formunda 3 çift alan ve kısa mesaj kutusu var', () => {
    const contact = read('contact.html');
    const quote = contact.slice(contact.indexOf('name="teklif"'), contact.indexOf('</form>', contact.indexOf('name="teklif"')));
    assert.equal((quote.match(/class="form-row"/g) || []).length, 3);
    assert.match(quote, /name="message" rows="3"/);
});
