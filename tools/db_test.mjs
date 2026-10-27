// Migration'ları ve SQL testlerini bellek içi Postgres'te (PGlite) çalıştırır; Supabase hesabı gerekmez.
// Supabase'in sağladığı auth şeması, roller ve storage tablosu en küçük hâliyle taklit edilir.
// Çalıştırma: npm install --no-save --package-lock=false @electric-sql/pglite@0.3.15
//            node tools/db_test.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const ROOT = resolve(import.meta.dirname, '..');
const sqlFiles = (dir) => readdirSync(join(ROOT, dir)).filter(name => name.endsWith('.sql')).sort().map(name => join(dir, name));

const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    email_confirmed_at timestamptz
);
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false,
    file_size_limit bigint, allowed_mime_types text[]);
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

const db = new PGlite();
const notices = [];
let failed = false;
try {
    await db.exec(SUPABASE_STUB);
    for (const file of sqlFiles('supabase/migrations')) {
        await db.exec(readFileSync(join(ROOT, file), 'utf8'));
        console.log(`✓ ${file}`);
    }
    for (const file of sqlFiles('supabase/tests')) {
        try {
            await db.exec(readFileSync(join(ROOT, file), 'utf8'), { onNotice: notice => notices.push(notice.message) });
            const passed = notices.filter(message => /testleri geçti/.test(message));
            console.log(`✓ ${file}${passed.length ? ` (${passed.at(-1)})` : ''}`);
        } catch (error) {
            failed = true;
            console.error(`✖ ${file}: ${error.message}`);
            await db.exec('rollback').catch(() => {});
        }
    }
} catch (error) {
    failed = true;
    console.error(`✖ ${error.message}`);
} finally {
    await db.close();
}
if (failed) process.exit(1);
console.log('Veritabanı testleri tamamlandı.');
