// Yönetim panelinin gerçek Chromium ile uçtan uca testi (sahte Supabase + gerçek migration'lı PGlite).
// TOTP kurulumu, ürün/görsel, sipariş durumları, teslimde puan kazanımı ve ayarlar.
// Çalıştırma: npm install --no-save playwright@1.56.1 @electric-sql/pglite@0.3.15
//           npx playwright install chromium
//           node tools/admin_e2e.mjs
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { startDevServer } from './dev_server.mjs';
import { totpCode } from './fake_supabase.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SCREENSHOTS = join(ROOT, 'artifacts', 'admin-e2e');
const EMAIL = 'yonetici@test.invalid';
const PASSWORD = 'e2e-yonetici-sifresi-1';

const server = await startDevServer({ port: 0, fakeSupabase: true, demoCatalog: true, sqlBackend: true });
const step = (n, text) => console.log(`  ✓ ${n}. ${text}`);

await mkdir(SCREENSHOTS, { recursive: true });
const browser = await chromium.launch();
try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() === 'error' && /Content Security Policy|Refused to/i.test(message.text())) problems.push(`CSP: ${message.text()}`);
    });
    const shot = (name) => page.screenshot({ path: join(SCREENSHOTS, `${name}.png`), fullPage: true });

    // Müşteri hesabı aç ve doğrula
    await page.goto(server.url + '/kayit.html');
    await page.fill('#fullName', 'Yönetici Test');
    await page.fill('#email', EMAIL);
    await page.fill('#password', PASSWORD);
    await page.check('input[name="kvkk"]');
    await page.click('[data-form="register"] button[type="submit"]');
    await page.locator('[data-form="register"] .form-feedback').filter({ hasText: 'Doğrulama e-postası' }).waitFor();
    const mail = server.fake.mailbox.find(m => m.email === EMAIL && m.type === 'email');
    await page.goto(`${server.url}/api/auth?action=confirm&token_hash=${mail.tokenHash}&type=email`);
    await page.waitForURL(/hesabim\.html/);

    await page.goto(server.url + '/yonetim.html');
    await page.locator('[data-admin-greeting]', { hasText: 'yetkiniz yok' }).waitFor();
    step(1, 'müşteri rolü panele giremez');

    await server.fake.sql.db.query(`update public.profiles set role = 'admin' where id = (select id from auth.users where email = $1)`, [EMAIL]);
    await page.reload();
    await page.locator('button', { hasText: 'Doğrulama uygulamasını kur' }).click();
    const secret = (await page.locator('.admin-secret').textContent()).trim();
    await page.fill('.admin-mfa input', '000000');
    await page.click('.admin-mfa button[type="submit"]');
    await page.locator('.admin-mfa .form-feedback', { hasText: 'Kod hatalı' }).waitFor();
    await page.fill('.admin-mfa input', totpCode(secret));
    await page.click('.admin-mfa button[type="submit"]');
    await page.locator('.admin-stats').waitFor();
    step(2, 'TOTP kurulumu: hatalı kod reddedilir, doğru kodla panel açılır');

    // Kategori ve ürün
    await page.click('#admin-tab-kategoriler');
    await page.locator('form .form-group input').first().fill('Saksı Bitkileri');
    await page.click('button:has-text("Kategori ekle")');
    await page.locator('details.order-item summary', { hasText: 'Saksı Bitkileri' }).waitFor();
    await page.click('#admin-tab-urunler');
    await page.click('button:has-text("Yeni ürün")');
    const form = page.locator('form.admin-form');
    await form.getByLabel('Ürün adı', { exact: true }).fill('Kauçuk Bitkisi');
    assert.equal(await form.getByLabel('Bağlantı adı', { exact: true }).inputValue(), 'kaucuk-bitkisi');
    await form.getByLabel('Fiyat (₺, KDV dahil)', { exact: true }).fill('1.250,50');
    await form.getByLabel('Stok (adet)', { exact: true }).fill('4');
    await form.locator('select').selectOption({ label: 'Saksı Bitkileri' });
    await form.locator('input[name="isActive"]').check();
    await form.locator('button[type="submit"]').click();
    await page.locator('form.admin-form input[type="file"]').waitFor();
    await page.setInputFiles('form.admin-form input[type="file"]', join(ROOT, 'images', 'favicon.png'));
    await page.locator('.admin-gallery img').first().waitFor();
    await page.click('form.admin-form button[type="submit"]');
    await page.locator('.admin-table td', { hasText: 'Kauçuk Bitkisi' }).waitFor();
    const { rows: [saved] } = await server.fake.sql.db.query(`select price, stock, is_active, cardinality(images) as images from public.products where slug = 'kaucuk-bitkisi'`);
    assert.deepEqual({ ...saved }, { price: 125050, stock: 4, is_active: true, images: 1 });
    await shot('urunler');
    step(3, 'kategori ve ürün oluşturma, TL → kuruş, görsel yükleme');

    // Hazır taslak: gerçek fotoğraf ve açıklama hazır, yalnızca fiyat/stok girilir
    const draft = page.locator('.admin-draft', { hasText: 'Orkide (Phalaenopsis)' });
    await draft.locator('button').click();
    const draftForm = page.locator('form.admin-form');
    assert.equal(await draftForm.getByLabel('Bağlantı adı', { exact: true }).inputValue(), 'orkide-phalaenopsis');
    await draftForm.getByLabel('Fiyat (₺, KDV dahil)', { exact: true }).fill('590');
    await draftForm.getByLabel('Stok (adet)', { exact: true }).fill('3');
    await draftForm.locator('button[type="submit"]').click();
    await page.locator('.admin-table td', { hasText: 'Orkide (Phalaenopsis)' }).waitFor();
    const { rows: [orchid] } = await server.fake.sql.db.query(`select price, images, (select slug from public.categories c where c.id = p.category_id) as category from public.products p where slug = 'orkide-phalaenopsis'`);
    assert.deepEqual({ ...orchid }, { price: 59000, images: ['images/orchid_care_blooming.webp'], category: 'ic-mekan-bitkileri' });
    await page.goto(server.url + '/urun.html?u=orkide-phalaenopsis');
    await page.locator('.product-gallery-main img[src="images/orchid_care_blooming.webp"]').waitFor();
    assert.ok(await page.locator('.product-gallery-main img').evaluate(img => img.complete && img.naturalWidth > 0));
    await page.goto(server.url + '/yonetim.html#urunler');
    await page.locator('.admin-table').waitFor();
    step('3b', 'hazır taslaktan gerçek fotoğraflı ürün; kategori otomatik oluşur');

    // Ayarlar: banka bilgisi
    await page.click('#admin-tab-ayarlar');
    await page.getByLabel('IBAN', { exact: true }).fill('TR33 0006 1005 1978 6457 8413 26');
    await page.click('button:has-text("Ayarları kaydet")');
    await page.locator('.admin-form .form-feedback', { hasText: 'kaydedildi' }).waitFor();
    step(4, 'ayarlar kaydedilir');

    // Yönetici aynı zamanda müşteri: ürünü sipariş eder (teslim alma + havale)
    const productId = (await server.fake.sql.db.query(`select id from public.products where slug = 'kaucuk-bitkisi'`)).rows[0].id;
    await page.evaluate((id) => localStorage.setItem('ye_cart_v1', JSON.stringify([{ id, qty: 2 }])), productId);
    await page.evaluate(() => sessionStorage.setItem('ye_delivery', 'pickup'));
    await page.goto(server.url + '/odeme.html');
    await page.locator('.checkout-form').waitFor();
    await page.check('#accept');
    await page.click('.checkout-confirm button[type="submit"]');
    await page.locator('.order-confirmation').waitFor();
    const code = (await page.locator('.order-code strong').textContent()).trim();
    step(5, `sipariş verildi (${code})`);

    // Panel: ödeme alındı → hazır → teslim edildi
    await page.goto(server.url + '/yonetim.html#siparisler');
    const card = page.locator('details.order-item', { hasText: code });
    await card.locator('summary').click();
    page.once('dialog', dialog => dialog.accept());
    await card.locator('button', { hasText: 'Ödeme alındı' }).click();
    await page.selectOption('#order-status-filter', 'paid');
    await page.locator('details.order-item', { hasText: code }).locator('summary').click();
    await page.locator('details.order-item', { hasText: code }).locator('button', { hasText: 'Teslim almaya hazır' }).click();
    await page.selectOption('#order-status-filter', 'ready_for_pickup');
    await page.locator('details.order-item', { hasText: code }).locator('summary').click();
    await page.locator('details.order-item', { hasText: code }).locator('button', { hasText: 'Teslim edildi' }).click();
    await page.selectOption('#order-status-filter', 'delivered');
    await page.locator('details.order-item', { hasText: code }).waitFor();
    const { rows: [order] } = await server.fake.sql.db.query(`select status, paid_at is not null as paid, (select stock from public.products where slug = 'kaucuk-bitkisi') as stock from public.orders where code = $1`, [code]);
    assert.deepEqual({ ...order }, { status: 'delivered', paid: true, stock: 2 });
    step(6, 'ödeme onayı ve teslim; stok 4 → 2');

    await page.goto(server.url + '/hesabim.html#puanlar');
    await page.locator('.points-hero').waitFor();
    assert.match(await page.locator('.points-stat').nth(1).textContent(), /2501/); // 2 × 1250,50 ₺ → 2501 bekleyen puan
    step(7, 'teslimde 2501 puan bekleyen olarak yazıldı');

    await page.goto(server.url + '/yonetim.html#musteri');
    await page.fill('input[type="email"]', EMAIL);
    await page.click('button:has-text("Bul")');
    await page.locator('.admin-card h3', { hasText: 'Yönetici Test' }).waitFor();
    await page.getByLabel('Puan', { exact: true }).fill('150');
    await page.getByLabel('Açıklama', { exact: true }).fill('Hoş geldin hediyesi');
    page.once('dialog', dialog => dialog.accept());
    await page.click('button:has-text("Düzeltmeyi kaydet")');
    await page.locator('.points-stat strong', { hasText: '150' }).waitFor();
    await page.click('#admin-tab-kayitlar');
    await page.locator('td', { hasText: 'admin.points_adjust' }).waitFor();
    await shot('kayitlar');
    step(8, 'puan düzeltmesi ve denetim kaydı');

    await page.setViewportSize({ width: 375, height: 812 });
    await page.click('#admin-tab-urunler');
    await page.locator('.admin-table').waitFor();
    const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    assert.ok(scroll <= inner, `mobil yatay kaydırma (${scroll} > ${inner})`);
    await shot('mobil-urunler');
    assert.deepEqual(problems, []);
    step(9, 'mobilde yatay taşma yok; sayfa hatası ve CSP ihlali yok');
    console.log('Yönetim paneli uçtan uca testi tamamlandı.');
} finally {
    await browser.close();
    await server.close();
}
