// Gerçek Chromium ile masaüstü/mobil arayüz denetimi.
// Çalıştırma: npm install --no-save playwright@1.56.1
//           npx playwright install chromium
//           node tools/ui_smoke.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
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
        { name: 'mobile', width: 375, height: 812 },
        { name: 'tablet', width: 768, height: 1024 },
        { name: 'desktop', width: 1440, height: 900 }
    ];

    for (const size of sizes) {
        const page = await browser.newPage({
            viewport: { width: size.width, height: size.height },
            reducedMotion: 'reduce'
        });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));

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

        await page.goto(origin + '/contact.html', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(250);
        await page.screenshot({ path: join(SCREENSHOTS, size.name + '-contact.png') });
        const contactOverflow = await page.evaluate(() =>
            document.documentElement.scrollWidth - window.innerWidth
        );
        assert.ok(contactOverflow <= 2, size.name + ': iletişim sayfasında yatay taşma ' + contactOverflow);
        assert.deepEqual(errors, [], size.name + ': JavaScript sayfa hataları');
        console.log(size.name + ': başarılı');
        await page.close();
    }

    console.log('Chromium mobil/tablet/masaüstü UI denetimi tamamlandı.');
} finally {
    if (browser) await browser.close();
    if (server.listening) await new Promise(resolveClose => server.close(resolveClose));
}
