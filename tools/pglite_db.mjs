// Bellek içi Postgres (PGlite) üzerinde Supabase'in en küçük taklidi + repodaki tüm migration'lar.
// tools/db_test.mjs ve SQL destekli sahte Supabase (tools/fake_supabase.mjs) ortak kullanır.
// Gereksinim: npm install --no-save --package-lock=false @electric-sql/pglite@0.3.15
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

export const SUPABASE_STUB = `
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

export const sqlFiles = (dir) => readdirSync(join(ROOT, dir)).filter(name => name.endsWith('.sql')).sort().map(name => join(dir, name));
export const readSql = (file) => readFileSync(join(ROOT, file), 'utf8');

/** Taklit şema ve migration'ları uygulanmış yeni bir PGlite örneği. */
export async function createDatabase({ onMigration = () => {} } = {}) {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite();
    await db.exec(SUPABASE_STUB);
    for (const file of sqlFiles('supabase/migrations')) {
        await db.exec(readSql(file));
        onMigration(file);
    }
    return db;
}
