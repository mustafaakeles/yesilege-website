// Migration SQL'inin güvenlik değişmezlerini statik olarak denetler (veritabanı gerektirmez).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/migrations/0001_foundation.sql', import.meta.url), 'utf8').toLowerCase();
const TABLES = ['profiles', 'addresses', 'audit_log', 'rate_limits'];

test('dört tabloda da RLS açık', () => {
    for (const table of TABLES) {
        assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`), table);
    }
});

test('anon/authenticated için hiçbir politika tanımlanmaz', () => {
    assert.doesNotMatch(sql, /create policy/);
});

test('tablo yetkileri ve rate_limit_hit çalıştırma izni geri alınır', () => {
    for (const table of TABLES) {
        assert.match(sql, new RegExp(`revoke all on (table )?public\\.${table} from anon, authenticated`), table);
    }
    assert.match(sql, /revoke execute on function public\.rate_limit_hit\([^)]*\) from public, anon, authenticated/);
});

test('kayıt tetikleyicisi rolü meta veriden okumaz ve KVKK onayı ister', () => {
    assert.doesNotMatch(sql, /raw_user_meta_data\s*->>\s*'role'/);
    assert.match(sql, /raw_user_meta_data\s*->>\s*'kvkk'/);
});

test('security definer fonksiyonları boş search_path kullanır', () => {
    const functions = sql.split(/create or replace function/).slice(1);
    assert.ok(functions.length >= 4);
    for (const body of functions) {
        if (body.includes('security definer')) assert.match(body, /set search_path = ''/, body.slice(0, 60));
    }
});

test('audit_log güncelleme ve silmeye kapalı', () => {
    assert.match(sql, /before update or delete on public\.audit_log/);
});
