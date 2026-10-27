// Derin arayüz denetimi: tüm sayfalar × 6 genişlik, gerçek Chromium (Playwright).
// Yatay taşma ve sebebi, kutusundan taşan metin, küçük dokunma alanı, küçük yazı,
// düşük kontrast, boyutsuz görsel, konsol hatası. Rapor JSON olarak artifacts/ui-audit/ altına yazılır.
// Çalıştırma: npm install --no-save playwright@1.56.1 && npx playwright install chromium
//            node tools/ui_audit.mjs [--shots]
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises';
import { extname, resolve, sep, join, relative } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'artifacts', 'ui-audit');
const SHOTS = process.argv.includes('--shots');
const WIDTHS = [320, 375, 768, 1024, 1440, 1920];
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

async function htmlPages(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (['node_modules', '.git', '_internal', 'artifacts', '.claude', 'subscription'].includes(entry.name)) continue;
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...await htmlPages(abs));
        else if (entry.name.endsWith('.html')) out.push(relative(ROOT, abs).replaceAll('\\', '/'));
    }
    return out.sort();
}

const server = createServer(async (req, res) => {
    if (req.url.startsWith('/api/')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end('{"success":true}');
    }
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        const path = resolve(ROOT, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (path !== ROOT && !path.startsWith(ROOT + sep)) throw new Error('forbidden');
        const body = await readFile(path);
        res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
        res.end(body);
    } catch {
        res.writeHead(404);
        res.end('404');
    }
});

// Sayfa içinde çalışan ölçüm (tarayıcı bağlamı)
function measure() {
    const vw = document.documentElement.clientWidth;
    const mobile = vw < 768;
    const describe = (el) => {
        const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
        const id = el.id ? '#' + el.id : '';
        const text = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        return `${el.tagName.toLowerCase()}${id}${cls}${text ? ' "' + text + '"' : ''}`;
    };
    const visible = (el) => {
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    };
    const clippedByAncestor = (el) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const s = getComputedStyle(p);
            if (/(hidden|clip|auto|scroll)/.test(s.overflowX) || /(hidden|clip)/.test(s.overflow)) return true;
            if (s.position === 'fixed') return true;
        }
        return false;
    };
    const all = [...document.body.querySelectorAll('*')].filter(el => !el.closest('svg, .magnolia-chat-widget, script, style, noscript'));

    const overflow = { doc: document.documentElement.scrollWidth - vw, culprits: [] };
    for (const el of all) {
        if (!visible(el)) continue;
        const s = getComputedStyle(el);
        if (s.position === 'fixed') continue;
        const r = el.getBoundingClientRect();
        const sx = window.scrollX;
        if ((r.right + sx > vw + 1 || r.left + sx < -1) && !clippedByAncestor(el)) overflow.culprits.push(`${describe(el)} [${Math.round(r.left)}→${Math.round(r.right)}]`);
    }
    overflow.culprits = overflow.culprits.slice(0, 12);

    const textOverflow = [];
    for (const el of all) {
        if (!visible(el) || !el.children.length === 0) continue;
        const s = getComputedStyle(el);
        if (s.overflowX !== 'visible' || ['INPUT', 'TEXTAREA', 'SELECT', 'IFRAME', 'CANVAS', 'IMG'].includes(el.tagName)) continue;
        if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) {
            textOverflow.push(`${describe(el)} (${el.scrollWidth}>${el.clientWidth})`);
        }
    }

    const smallTargets = [];
    if (mobile) {
        for (const el of document.querySelectorAll('a[href], button, [role="button"], input:not([type=hidden]), select, summary')) {
            if (!visible(el) || el.closest('p, li p, .footer-bottom, .breadcrumb, figcaption, .magnolia-chat-widget')) continue;
            if (getComputedStyle(el).display === 'inline' && el.closest('p, li')) continue;
            const r = el.getBoundingClientRect();
            if (r.height < 40 || r.width < 40) smallTargets.push(`${describe(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
    }

    const smallText = [];
    if (mobile) {
        for (const el of document.querySelectorAll('p, li, td, label, figcaption, .card-content span, small')) {
            if (!visible(el)) continue;
            const fs = parseFloat(getComputedStyle(el).fontSize);
            if (fs < 13) smallText.push(`${describe(el)} ${fs}px`);
        }
    }

    // Kontrast: metnin rengi ile ilk opak arka plan (görsel/degrade üzerindekileri atla)
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const lowContrast = [];
    for (const el of all) {
        if (!visible(el) || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 2)) continue;
        const s = getComputedStyle(el);
        const fg = parse(s.color);
        if (!fg || fg.a < 0.5) continue;
        let bg = null;
        let skip = false;
        for (let p = el; p; p = p.parentElement) {
            const ps = getComputedStyle(p);
            if (ps.backgroundImage !== 'none' && !/gradient/.test(ps.backgroundImage)) { skip = true; break; }
            if (/gradient/.test(ps.backgroundImage)) { skip = true; break; }
            const c = parse(ps.backgroundColor);
            if (c && c.a > 0.9) { bg = c; break; }
        }
        if (skip) continue;
        bg = bg || { r: 255, g: 255, b: 255 };
        const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
        const ratio = (l1 + 0.05) / (l2 + 0.05);
        const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && Number(s.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5)) lowContrast.push(`${describe(el)} ${ratio.toFixed(2)}`);
    }

    const images = [...document.images].filter(i => !i.closest('.magnolia-chat-widget'));
    return {
        overflow,
        textOverflow: textOverflow.slice(0, 10),
        smallTargets: smallTargets.slice(0, 15),
        smallTextCount: smallText.length, smallText: smallText.slice(0, 6),
        lowContrast: lowContrast.slice(0, 12), lowContrastCount: lowContrast.length,
        imgNoDims: images.filter(i => !i.getAttribute('width') || !i.getAttribute('height')).map(i => i.getAttribute('src')).slice(0, 8),
        imgNoAlt: images.filter(i => !i.hasAttribute('alt')).map(i => i.getAttribute('src')),
        h1: document.querySelectorAll('h1').length
    };
}

await mkdir(OUT, { recursive: true });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch();
// --only=index.html,services.html → yalnızca bu sayfalar
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',');
const pages = (await htmlPages(ROOT)).filter(path => !only || only.includes(path));
const report = {};
try {
    for (const width of WIDTHS) {
        const context = await browser.newContext({ viewport: { width, height: width < 768 ? 800 : 900 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
        await context.addInitScript(() => { try { sessionStorage.setItem('ye-intro', '1'); } catch { } });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(String(e.message).slice(0, 160)));
        page.on('console', m => { if (m.type() === 'error' && !/_vercel|favicon|404/.test(m.text())) errors.push(m.text().slice(0, 160)); });
        for (const path of pages) {
            errors.length = 0;
            await page.goto(origin + '/' + path, { waitUntil: 'load' });
            await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 15)); } window.scrollTo(0, 0); });
            await page.waitForTimeout(150);
            const result = await page.evaluate(measure);
            result.errors = [...new Set(errors)];
            (report[path] ||= {})[width] = result;
            if (SHOTS && (width === 375 || width === 1440)) {
                await page.screenshot({ path: join(OUT, `${path.replaceAll('/', '_')}-${width}.png`), fullPage: true });
            }
        }
        await context.close();
    }
} finally {
    await browser.close();
    server.close();
}

await writeFile(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
// Özet
const summary = {};
for (const [path, byWidth] of Object.entries(report)) {
    for (const [w, r] of Object.entries(byWidth)) {
        const issues = [];
        if (r.overflow.doc > 0) issues.push(`TAŞMA ${r.overflow.doc}px`);
        if (r.overflow.culprits.length) issues.push(`taşan öğe ${r.overflow.culprits.length}`);
        if (r.textOverflow.length) issues.push(`metin taşması ${r.textOverflow.length}`);
        if (r.smallTargets.length) issues.push(`küçük hedef ${r.smallTargets.length}`);
        if (r.smallTextCount) issues.push(`küçük yazı ${r.smallTextCount}`);
        if (r.lowContrastCount) issues.push(`kontrast ${r.lowContrastCount}`);
        if (r.imgNoDims.length) issues.push(`boyutsuz görsel ${r.imgNoDims.length}`);
        if (r.imgNoAlt.length) issues.push(`alt eksik ${r.imgNoAlt.length}`);
        if (r.errors.length) issues.push(`hata ${r.errors.length}`);
        if (r.h1 !== 1) issues.push(`h1=${r.h1}`);
        if (issues.length) (summary[path] ||= {})[w] = issues.join(', ');
    }
}
console.log(JSON.stringify(summary, null, 1));
