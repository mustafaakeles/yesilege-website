// Gerçek Chromium ile masaüstü/mobil arayüz denetimi.
// Çalıştırma: npm install --no-save playwright@1.56.1
//           npx playwright install chromium
//           node tools/ui_smoke.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import { extname, resolve, sep, join } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const SCREENSHOTS = join(ROOT, 'artifacts', 'ui-smoke');
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon'
};

let mockedSubmissions = 0;
const server = createServer(async (req, res) => {
    if (req.url === '/api/contact' && req.method === 'POST') {
        mockedSubmissions++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
    }
    try {
        const url = new URL(req.url, 'http://localhost');
        const pathname = decodeURIComponent(url.pathname);
        const path = resolve(ROOT, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (path !== ROOT && !path.startsWith(ROOT + sep)) {
            res.writeHead(403);
            res.end();
            return;
        }
        const body = await readFile(path);
        res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
        res.end(body);
    } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bulunamadı');
    }
});

let browser;
try {
    await mkdir(SCREENSHOTS, { recursive: true });
    await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
    const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ headless: true });
    const sizes = [
        { name: 'small-mobile', width: 320, height: 700 },
        { name: 'mobile', width: 375, height: 812 },
        { name: 'tablet', width: 768, height: 1024 },
        { name: 'laptop', width: 1024, height: 768 },
        { name: 'desktop', width: 1440, height: 900 },
        { name: 'zoomed-desktop', width: 1536, height: 768 },
        { name: 'wide-desktop', width: 1920, height: 960 }
    ];

    const articles = (await readdir(join(ROOT, 'blog-yazilari')))
        .filter(name => name.endsWith('.html'))
        .map(name => '/blog-yazilari/' + name);

    for (const size of sizes) {
        const page = await browser.newPage({
            viewport: { width: size.width, height: size.height },
            reducedMotion: 'reduce'
        });
        const errors = [];
        const missingAssets = new Set();
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => {
            const url = new URL(response.url());
            if (url.origin === origin && response.status() === 404
                && !url.pathname.startsWith('/_vercel/')) {
                missingAssets.add(url.pathname);
            }
        });

        await page.goto(origin + '/index.html', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#magnoliaTrigger');
        await page.waitForTimeout(450);

        const dimensions = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth
        }));
        await page.screenshot({ path: join(SCREENSHOTS, size.name + '-home.png') });
        assert.ok(dimensions.scrollWidth <= dimensions.innerWidth + 2,
            size.name + ': yatay taşma ' + JSON.stringify(dimensions));

        const homeContact = await page.locator('#iletisim').evaluate(section => {
            const nav = document.querySelector('.navbar');
            const info = section.querySelector('.contact-info');
            const form = section.querySelector('.contact-form');
            return {
                sectionHeight: Math.ceil(section.getBoundingClientRect().height),
                navHeight: Math.ceil(nav.getBoundingClientRect().height),
                viewportHeight: window.innerHeight,
                cardHeights: [
                    Math.ceil(info.getBoundingClientRect().height),
                    Math.ceil(form.getBoundingClientRect().height)
                ]
            };
        });
        if (size.width >= 1024 && size.height >= 768) {
            assert.ok(homeContact.sectionHeight + homeContact.navHeight <= size.height + 8,
                size.name + ': ana sayfa iletişim bölümü tek ekrana sığmıyor: '
                + JSON.stringify(homeContact));
            assert.ok(Math.abs(homeContact.cardHeights[0] - homeContact.cardHeights[1]) <= 2,
                size.name + ': iletişim kartları aynı hizada değil: '
                + JSON.stringify(homeContact));
        }
        await page.locator('#iletisim').screenshot({
            path: join(SCREENSHOTS, size.name + '-home-contact.png'),
            animations: 'disabled'
        });

        if (size.width <= 960) {
            const menuButton = page.locator('.hamburger');
            await menuButton.click();
            assert.equal(await menuButton.getAttribute('aria-expanded'), 'true', size.name + ': mobil menü');
            await page.keyboard.press('Escape');
            assert.equal(await menuButton.getAttribute('aria-expanded'), 'false', size.name + ': mobil Escape');
        } else {
            const firstGallery = page.locator('.gallery-item').first();
            await firstGallery.focus();
            await page.keyboard.press('Enter');
            assert.ok(await page.locator('.lightbox').evaluate(el => el.classList.contains('active')),
                'Galeri Enter ile açılmalı');
            await page.keyboard.press('Escape');
            assert.ok(!await page.locator('.lightbox').evaluate(el => el.classList.contains('active')),
                'Galeri Escape ile kapanmalı');
        }

        await page.locator('#magnoliaTrigger').click();
        assert.equal(await page.locator('#magnoliaTrigger').getAttribute('aria-expanded'), 'true');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#magnoliaTrigger').getAttribute('aria-expanded'), 'false');

        if (size.name === 'desktop') {
            const form = page.locator('#contactForm');
            await form.locator('input[name="name"]').fill('Test Kişisi');
            await form.locator('input[name="email"]').fill('test@example.test');
            await form.locator('textarea[name="message"]').fill('Otomatik deneme mesajı');
            await form.locator('button[type="submit"]').click();
            await page.waitForFunction(() => document.querySelector('#contactForm .form-feedback')
                ?.textContent.includes('başarıyla iletildi'));
            assert.equal(mockedSubmissions, 1);
        }

        // Tüm temel sayfalar her çözünürlükte; tüm blog yazıları mobil ve masaüstünde.
        const routes = [
            '/services.html', '/care.html', '/blog.html', '/contact.html',
            ...(size.name === 'mobile' || size.name === 'desktop' ? articles : []),
            ...(size.name === 'mobile' || size.name === 'desktop' ? ['/subscription/confirm.html'] : [])
        ];
        for (const route of routes) {
            await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
            const view = await page.evaluate(() => ({
                doc: document.documentElement.scrollWidth,
                body: document.body.scrollWidth,
                window: window.innerWidth
            }));
            assert.ok(Math.max(view.doc, view.body) <= view.window + 2,
                size.name + ' ' + route + ': yatay taşma ' + JSON.stringify(view));

            if (['mobile', 'desktop'].includes(size.name)
                && ['/services.html', '/care.html', '/blog.html', '/contact.html'].includes(route)) {
                await page.screenshot({
                    path: join(SCREENSHOTS, size.name + '-' + route.slice(1).replace('.html', '') + '.png')
                });
            }
        }
        assert.deepEqual([...missingAssets], [], size.name + ': eksik yerel görsel/CSS/JS');
        assert.deepEqual(errors, [], size.name + ': JavaScript sayfa hataları');
        console.log(size.name + ': ' + (routes.length + 1) + ' sayfa denetlendi');
        await page.close();
    }

    console.log('Chromium mobil/tablet/masaüstü UI denetimi tamamlandı.');
} finally {
    if (browser) await browser.close();
    if (server.listening) await new Promise(resolveClose => server.close(resolveClose));
}
