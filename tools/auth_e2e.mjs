// Üyelik akışının gerçek Chromium ile uçtan uca testi (sahte Supabase'li geliştirme sunucusu).
// Çalıştırma: npm install --no-save playwright@1.56.1
//           npx playwright install chromium
//           node tools/auth_e2e.mjs
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { startDevServer } from './dev_server.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SCREENSHOTS = join(ROOT, 'artifacts', 'auth-e2e');
const VIEWPORTS = [
    { name: 'masaustu', width: 1280, height: 800 },
    { name: 'mobil', width: 375, height: 812 }
];
const PASSWORD = 'e2e-test-sifresi-1';
const NEW_PASSWORD = 'e2e-yeni-sifre-22';

const server = await startDevServer({ port: 0, fakeSupabase: true });
const mailFor = (email, type) => {
    const mail = server.fake.mailbox.filter(m => m.email === email && m.type === type).at(-1);
    assert.ok(mail, `${type} e-postası bulunamadı: ${email}`);
    return `${server.url}/api/auth?action=confirm&token_hash=${mail.tokenHash}&type=${type}`;
};

async function runFlow(browser, viewport) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
    page.on('console', message => {
        if (message.type() === 'error' && /Content Security Policy|Refused to/i.test(message.text())) problems.push(`CSP: ${message.text()}`);
    });

    const email = `e2e-${viewport.name}@test.invalid`;
    const at = (path) => page.goto(server.url + path);
    const feedbackOf = (selector) => page.locator(`${selector} .form-feedback`).first();
    // Hesap bağlantısı tools/build_layout.py bayrağıyla gizliyse navbar denetimi atlanır.
    const expectNavLabel = async (label) => {
        const link = page.locator('[data-account-link] span');
        if (await link.count() === 0) return;
        assert.equal((await link.first().textContent()).trim(), label);
    };
    const noHorizontalScroll = async (label) => {
        const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
        assert.ok(scroll <= inner, `${label}: yatay kaydırma (${scroll} > ${inner})`);
    };
    const step = (n, text) => console.log(`  ✓ ${viewport.name} ${n}. ${text}`);

    await at('/kayit.html');
    await page.fill('#fullName', 'E2E Test Kişi');
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.check('input[name="kvkk"]');
    await page.click('[data-form="register"] button[type="submit"]');
    await assert.doesNotReject(feedbackOf('[data-form="register"]').filter({ hasText: 'Doğrulama e-postası' }).waitFor());
    await noHorizontalScroll('kayıt');
    await page.screenshot({ path: join(SCREENSHOTS, `${viewport.name}-kayit.png`), fullPage: true });
    step(1, 'kayıt');

    await at('/giris.html');
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.click('[data-form="login"] button[type="submit"]');
    await feedbackOf('[data-form="login"]').filter({ hasText: 'henüz doğrulanmadı' }).waitFor();
    step(2, 'doğrulanmadan giriş reddedildi');

    const confirmLink = mailFor(email, 'email');
    await page.goto(confirmLink);
    await page.waitForURL(/hesabim\.html\?dogrulandi=1/);
    await page.locator('[data-page-notice]').filter({ hasText: 'doğrulandı' }).waitFor();
    await expectNavLabel('Hesabım');
    await noHorizontalScroll('hesabım');
    step(3, 'doğrulama bağlantısı oturum açtı');

    await page.goto(confirmLink);
    await page.waitForURL(/giris\.html\?hata=baglanti/);
    await page.locator('[data-page-notice]').filter({ hasText: 'daha önce kullanılmış' }).waitFor();
    step(4, 'kullanılmış bağlantı reddedildi');

    await at('/hesabim.html#adresler');
    await page.click('[data-address-new]');
    const address = { '#addr-title': 'Ev', '#addr-recipient': 'E2E Test Kişi', '#addr-phone': '0532 000 00 00', '#addr-city': 'İzmir', '#addr-district': 'Bayındır', '#addr-neighbourhood': 'Karaveliler', '#addr-line': 'Deneme Sk. No: 1' };
    for (const [selector, value] of Object.entries(address)) await page.fill(selector, value);
    await page.click('[data-account-form="address"] button[type="submit"]');
    await page.locator('.address-card').filter({ hasText: 'Deneme Sk. No: 1' }).waitFor();
    await noHorizontalScroll('adresler');
    await page.screenshot({ path: join(SCREENSHOTS, `${viewport.name}-adresler.png`), fullPage: true });
    step(5, 'adres eklendi');

    await page.click('.account-header [data-logout="local"]');
    await page.waitForURL(/giris\.html$/);
    await expectNavLabel('Giriş');
    await at('/hesabim.html');
    await page.waitForURL(/giris\.html\?donus=/);
    step(6, 'çıkış ve oturumsuz yönlendirme');

    await at('/sifre-sifirla.html');
    await page.fill('#email', email);
    await page.click('[data-form="recover"] button[type="submit"]');
    await feedbackOf('[data-form="recover"]').filter({ hasText: 'bağlantısı gönderdik' }).waitFor();
    await page.goto(mailFor(email, 'recovery'));
    await page.waitForURL(/sifre-sifirla\.html\?adim=yeni/);
    await page.fill('#new-password', NEW_PASSWORD);
    await page.fill('#new-passwordConfirm', NEW_PASSWORD);
    await page.click('[data-form="new-password"] button[type="submit"]');
    await feedbackOf('[data-form="new-password"]').filter({ hasText: 'güncellendi' }).waitFor();
    await page.request.post(`${server.url}/api/auth?action=logout`, { headers: { origin: server.url }, data: {} });
    await context.clearCookies();
    await at('/giris.html');
    await page.fill('#email', email);
    await page.fill('#password', NEW_PASSWORD);
    await page.click('[data-form="login"] button[type="submit"]');
    await page.waitForURL(/hesabim\.html/);
    step(7, 'şifre sıfırlama ve yeni şifreyle giriş');

    assert.deepEqual(problems, [], 'sayfa hatası veya CSP ihlali');
    step(8, 'sayfa hatası ve CSP ihlali yok');
    await context.close();
}

let browser;
try {
    await mkdir(SCREENSHOTS, { recursive: true });
    browser = await chromium.launch({ headless: true });
    for (const viewport of VIEWPORTS) await runFlow(browser, viewport);
    console.log('Üyelik uçtan uca testi tamamlandı.');
} catch (error) {
    console.error('Üyelik uçtan uca testi başarısız:', error.message);
    process.exitCode = 1;
} finally {
    await browser?.close();
    await server.close();
}
