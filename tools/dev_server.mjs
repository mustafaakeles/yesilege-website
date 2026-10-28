// Yerel geliştirme sunucusu: statik dosyalar + api/*.js işleyicileri, vercel.json güvenlik başlıklarıyla.
// Kullanım: node tools/dev_server.mjs [--fake-supabase [--demo-catalog] [--sql]]   (PORT, varsayılan 8090)
// --sql: veri katmanı PGlite'ta gerçek migration'larla çalışır (npm install --no-save @electric-sql/pglite@0.3.15).
// --fake-supabase: gerçek hesap gerekmez; doğrulama bağlantıları konsola yazılır.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startFakeSupabase, FAKE_KEYS } from './fake_supabase.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const MAX_BODY_BYTES = 1_000_000;
const BLOCKED = /^(?:\.[^/]*|_internal|supabase|node_modules|tests|tools|docs|artifacts|api)(?:\/|$)/;
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.woff2': 'font/woff2'
};

const vercelHeaders = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')).headers
    .map(rule => ({ pattern: new RegExp(`^${rule.source}$`), headers: rule.headers }));

// Sahte Supabase'in görsel deposu (yalnızca yerel); CSP img-src'ye eklenir.
let devImageOrigin = '';

function applyHeaders(res, pathname) {
    for (const { pattern, headers } of vercelHeaders) {
        if (!pattern.test(pathname)) continue;
        for (const { key, value } of headers) {
            // http://localhost üzerinde HTTPS'e yükseltme ve HSTS yerel geliştirmeyi bozar.
            if (key === 'Strict-Transport-Security') continue;
            const csp = () => value.replace(/;\s*upgrade-insecure-requests/, '').replace(/img-src ([^;]*)/, `img-src $1${devImageOrigin ? ` ${devImageOrigin}` : ''}`);
            res.setHeader(key, key === 'Content-Security-Policy' ? csp() : value);
        }
    }
}

function notFound(res) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Bulunamadı');
}

async function serveStatic(req, res, pathname) {
    const relative = normalize(decodeURIComponent(pathname)).replace(/^[\\/]+/, '').replaceAll('\\', '/') || 'index.html';
    const file = resolve(ROOT, relative);
    if (!file.startsWith(ROOT + sep) || BLOCKED.test(relative)) return notFound(res);
    try {
        if (!(await stat(file)).isFile()) return notFound(res);
    } catch {
        return notFound(res);
    }
    applyHeaders(res, '/' + relative);
    res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(await readFile(file));
}

async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) throw new Error('çok büyük');
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
}

// Vercel Node çalışma zamanının req/res yardımcılarını taklit eder.
async function serveApi(req, res, name, url, env, handlers) {
    const file = join(ROOT, 'api', `${name}.js`);
    if (!/^[a-z][a-z-]*$/.test(name) || !existsSync(file)) return notFound(res);
    if (!handlers.has(name)) {
        const module = await import(pathToFileURL(file).href);
        handlers.set(name, module.createHandler ? module.createHandler({ env }) : module.default);
    }
    req.query = Object.fromEntries(url.searchParams);
    const text = await readBody(req);
    req.body = {};
    if (text && /^application\/json/i.test(req.headers['content-type'] || '')) {
        try { req.body = JSON.parse(text); } catch { req.body = undefined; }
    }
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body)); return res; };
    applyHeaders(res, url.pathname);
    await handlers.get(name)(req, res);
}

export async function startDevServer({ port = 8090, env = process.env, fakeSupabase = false, demoCatalog = false, sqlBackend = false, onMail } = {}) {
    let fake = null;
    let effectiveEnv = env;
    const handlers = new Map();
    const server = createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const api = /^\/api\/([^/]+)$/.exec(url.pathname);
        const work = api ? serveApi(req, res, api[1], url, effectiveEnv, handlers) : serveStatic(req, res, url.pathname);
        work.catch((error) => {
            console.error('Geliştirme sunucusu hatası:', error.message);
            if (!res.headersSent) { res.writeHead(500); res.end(); }
        });
    });
    await new Promise(done => server.listen(port, '127.0.0.1', done));
    const origin = `http://localhost:${server.address().port}`;

    if (fakeSupabase) {
        fake = await startFakeSupabase({
            demoCatalog,
            sqlBackend,
            onMail: (mail) => onMail?.({ ...mail, link: `${origin}/api/auth?action=confirm&token_hash=${mail.tokenHash}&type=${mail.type}` })
        });
        devImageOrigin = fake.url;
        effectiveEnv = {
            ...env,
            SUPABASE_URL: fake.url,
            SUPABASE_ANON_KEY: FAKE_KEYS.anon,
            SUPABASE_SERVICE_ROLE_KEY: FAKE_KEYS.service,
            SITE_URL: origin,
            // Uçtan uca testler sipariş akışını sınar; vitrin modu için ORDERS_OPEN=false verin
            ORDERS_OPEN: env.ORDERS_OPEN ?? 'true',
            ALLOWED_DEV_ORIGINS: `http://127.0.0.1:${server.address().port}`
        };
    }

    return {
        url: origin,
        fake,
        close: async () => {
            server.closeAllConnections?.();
            await new Promise(done => server.close(done));
            if (fake) await fake.close();
        }
    };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    const port = Number(process.env.PORT) || 8090;
    const useFake = process.argv.includes('--fake-supabase');
    const server = await startDevServer({
        port,
        fakeSupabase: useFake,
        demoCatalog: useFake && process.argv.includes('--demo-catalog'),
        sqlBackend: useFake && process.argv.includes('--sql'),
        onMail: (mail) => console.log(`\n[sahte e-posta] ${mail.type} → ${mail.email}\n  ${mail.link}\n`)
    });
    console.log(`Geliştirme sunucusu: ${server.url}${useFake ? ' (sahte Supabase)' : ''}`);
}
