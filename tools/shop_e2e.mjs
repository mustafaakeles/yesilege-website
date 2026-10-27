// Mağaza akışının gerçek Chromium ile uçtan uca testi (sahte Supabase + örnek katalog).
// Çalıştırma: npm install --no-save playwright@1.56.1
//           npx playwright install chromium
//           node tools/shop_e2e.mjs
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { startDevServer } from './dev_server.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SCREENSHOTS = join(ROOT, 'artifacts', 'shop-e2e');
const VIEWPORTS = [
    { name: 'masaustu', width: 1280, height: 800 },
    { name: 'mobil', width: 375, height: 812 }
];
const PASSWORD = 'e2e-test-sifresi-1';

const server = await startDevServer({ port: 0, fakeSupabase: true, demoCatalog: true });

/** Sahte Supabase'te doğrulanmış bir kullanıcı açar ve tarayıcıda oturum başlatır. */
async function signIn(page, email) {
    await page.goto(server.url + '/kayit.html');
    await page.fill('#fullName', 'Mağaza Test');
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.check('input[name="kvkk"]');
    await page.click('[data-form="register"] button[type="submit"]');
    await page.locator('[data-form="register"] .form-feedback').filter({ hasText: 'Doğrulama e-postası' }).waitFor();
    const mail = server.fake.mailbox.filter(m => m.email === email && m.type === 'email').at(-1);
    await page.goto(`${server.url}/api/auth?action=confirm&token_hash=${mail.tokenHash}&type=email`);
    await page.waitForURL(/hesabim\.html/);
}

async function noHorizontalScroll(page, label) {
    const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert.ok(scroll <= inner, `${label}: yatay kaydırma (${scroll} > ${inner})`);
}

async function runFlow(browser, viewport) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() === 'error' && /Content Security Policy|Refused to/i.test(message.text())) problems.push(`CSP: ${message.text()}`);
    });
    const shot = (name) => page.screenshot({ path: join(SCREENSHOTS, `${viewport.name}-${name}.png`), fullPage: true });
    const step = (n, text) => console.log(`  ✓ ${viewport.name} ${n}. ${text}`);

    await page.goto(server.url + '/magaza.html');
    await page.locator('.product-card').first().waitFor();
    assert.equal(await page.locator('.product-card').count(), 5);
    await page.click('[data-category="dis-mekan"]');
    assert.equal(await page.locator('.product-card').count(), 2);
    assert.match(page.url(), /kategori=dis-mekan/);
    await page.fill('[data-product-search]', 'lavanta');
    assert.equal(await page.locator('.product-card').count(), 1);
    await noHorizontalScroll(page, 'mağaza');
    await shot('magaza');
    step(1, 'katalog, kategori ve arama');

    await page.goto(server.url + '/urun.html?u=ornek-monstera');
    await page.locator('.product-info h1').waitFor();
    assert.equal(await page.title(), 'Örnek Monstera | Yeşil Ege Peyzaj');
    const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').last().textContent());
    assert.equal(ld.offers.price, '450.00');
    await page.click('.product-buy [aria-label="Adedi artır"]');
    await page.click('.product-buy .add-to-cart');
    const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('ye_cart_v1')));
    assert.equal(cart.length, 1);
    assert.equal(cart[0].qty, 2);
    assert.ok(await page.locator('.product-buy .add-to-cart').isEnabled());
    await noHorizontalScroll(page, 'ürün');
    await shot('urun');
    step(2, 'ürün sayfası, Product şeması ve sepete ekleme');

    await page.goto(server.url + '/urun.html?u=ornek-orkide');
    await page.locator('.product-info h1').waitFor();
    assert.ok(await page.locator('.product-buy .add-to-cart').isDisabled());
    await page.goto(server.url + '/urun.html?u=olmayan-urun');
    await page.locator('.shop-empty h2', { hasText: 'Ürün bulunamadı' }).waitFor();
    step(3, 'tükenen ve olmayan ürün');

    await page.goto(server.url + '/magaza.html');
    await page.locator('.favorite-toggle').first().click();
    await page.waitForURL(/giris\.html\?donus=/);
    await signIn(page, `magaza-${viewport.name}@test.invalid`);
    await page.goto(server.url + '/urun.html?u=ornek-lavanta');
    const heart = page.locator('.product-buy .favorite-toggle');
    await heart.click();
    await page.waitForFunction(() => document.querySelector('.product-buy .favorite-toggle')?.getAttribute('aria-pressed') === 'true');
    await page.goto(server.url + '/hesabim.html#favoriler');
    await page.locator('[data-favorite-grid] .product-card').first().waitFor();
    assert.equal(await page.locator('[data-favorite-grid] .product-card').count(), 1);
    await noHorizontalScroll(page, 'favoriler');
    await shot('favoriler');
    step(4, 'oturumsuz favori girişe yönlendirir; favori Hesabım\'da görünür');

    assert.deepEqual(problems, []);
    step(5, 'sayfa hatası ve CSP ihlali yok');
    await context.close();
}

await mkdir(SCREENSHOTS, { recursive: true });
const browser = await chromium.launch();
try {
    for (const viewport of VIEWPORTS) await runFlow(browser, viewport);
    console.log('Mağaza uçtan uca testi tamamlandı.');
} finally {
    await browser.close();
    await server.close();
}
