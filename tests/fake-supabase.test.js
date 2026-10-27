import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startFakeSupabase, FAKE_KEYS } from '../tools/fake_supabase.mjs';
import { startDevServer } from '../tools/dev_server.mjs';
import { createSupabase, eq } from '../api/_lib/supabase.js';

let fake;
let supabase;
before(async () => {
    fake = await startFakeSupabase();
    supabase = createSupabase({ url: fake.url, anonKey: FAKE_KEYS.anon, serviceKey: FAKE_KEYS.service });
});
after(() => fake.close());

const META = { full_name: 'Test Kişi', phone: null, kvkk: 'true', marketing: 'false' };

test('kayıt → doğrulanmamış giriş reddi → doğrulama → giriş', async () => {
    await supabase.auth.signUp({ email: 'akis@test.invalid', password: 'guclu-sifre-1', data: META });
    await assert.rejects(supabase.auth.signIn({ email: 'akis@test.invalid', password: 'guclu-sifre-1' }),
        (e) => e.status === 400 && e.code === 'email_not_confirmed');

    const mail = fake.mailbox.find(m => m.email === 'akis@test.invalid' && m.type === 'email');
    const verified = await supabase.auth.verify({ tokenHash: mail.tokenHash, type: 'email' });
    assert.ok(verified.access_token);

    await assert.rejects(supabase.auth.verify({ tokenHash: mail.tokenHash, type: 'email' }), (e) => e.status === 403);

    const session = await supabase.auth.signIn({ email: 'akis@test.invalid', password: 'guclu-sifre-1' });
    const user = await supabase.auth.getUser(session.access_token);
    assert.equal(user.email, 'akis@test.invalid');
    assert.ok(user.email_confirmed_at);

    const [profile] = await supabase.db.select('profiles', `id=${eq(user.id)}`);
    assert.equal(profile.role, 'customer');
});

test('KVKK onayı olmadan kayıt tetikleyici gibi reddedilir, rol meta veriden alınmaz', async () => {
    await assert.rejects(supabase.auth.signUp({ email: 'kvkksiz@test.invalid', password: 'guclu-sifre-1', data: { full_name: 'X Y' } }),
        (e) => e.status === 500);
    await supabase.auth.signUp({ email: 'rol@test.invalid', password: 'guclu-sifre-1', data: { ...META, role: 'admin' } });
    const id = fake.users.get('rol@test.invalid').id;
    const [profile] = await supabase.db.select('profiles', `id=${eq(id)}`);
    assert.equal(profile.role, 'customer');
});

test('refresh token bir kez kullanılabilir', async () => {
    await supabase.auth.signUp({ email: 'rt@test.invalid', password: 'guclu-sifre-1', data: META });
    const mail = fake.mailbox.find(m => m.email === 'rt@test.invalid');
    const first = await supabase.auth.verify({ tokenHash: mail.tokenHash, type: 'email' });
    const second = await supabase.auth.refresh(first.refresh_token);
    assert.notEqual(second.refresh_token, first.refresh_token);
    await assert.rejects(supabase.auth.refresh(first.refresh_token), (e) => e.status === 400);
});

test('yanlış anahtarlar reddedilir', async () => {
    const wrong = createSupabase({ url: fake.url, anonKey: 'x', serviceKey: 'y' });
    await assert.rejects(wrong.auth.signIn({ email: 'a@b.test', password: 'x' }), (e) => e.status === 401);
    await assert.rejects(wrong.db.select('profiles', ''), (e) => e.status === 401);
});

test('rate_limit_hit üçüncü çağrıda false döner', async () => {
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await supabase.db.rpc('rate_limit_hit', { p_key: 'test:k', p_max: 2, p_window_seconds: 60 }));
    assert.deepEqual(results, [true, true, false]);
});

test('adres CRUD eq filtrelerine uyar', async () => {
    const uid = '33333333-3333-4333-8333-333333333333';
    const [row] = await supabase.db.insert('addresses', { user_id: uid, title: 'Ev', is_default: true });
    assert.ok(row.id);
    assert.deepEqual(await supabase.db.update('addresses', `id=${eq(row.id)}&user_id=${eq('baska')}`, { title: 'X' }), []);
    assert.equal((await supabase.db.update('addresses', `id=${eq(row.id)}&user_id=${eq(uid)}`, { title: 'İş' }))[0].title, 'İş');
    assert.equal((await supabase.db.select('addresses', `user_id=${eq(uid)}&select=id`)).length, 1);
    assert.equal((await supabase.db.remove('addresses', `id=${eq(row.id)}&user_id=${eq(uid)}`)).length, 1);
});

test('geliştirme sunucusu gizli dosyaları sunmaz ve CSP başlığını uygular', async () => {
    const server = await startDevServer({ port: 0, env: {} });
    try {
        for (const path of ['/..%2f..%2f..%2fWindows%2fwin.ini', '/supabase/migrations/0001_foundation.sql', '/_internal/TODO.md', '/api/_lib/supabase.js', '/.git/HEAD']) {
            const response = await fetch(server.url + path);
            assert.equal(response.status, 404, path);
        }
        const page = await fetch(server.url + '/index.html');
        assert.equal(page.status, 200);
        assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
        assert.match(page.headers.get('content-type'), /text\/html/);
    } finally {
        await server.close();
    }
});

test('geliştirme sunucusu API isteklerini işleyicilere yönlendirir', async () => {
    const server = await startDevServer({ port: 0, fakeSupabase: true });
    try {
        const me = await fetch(server.url + '/api/account?action=me');
        assert.equal(me.status, 401);
        const unknown = await fetch(server.url + '/api/yok?action=x');
        assert.equal(unknown.status, 404);
        const register = await fetch(server.url + '/api/auth?action=register', {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: server.url },
            body: JSON.stringify({ fullName: 'Dev Kişi', email: 'dev@test.invalid', password: 'guclu-sifre-1', kvkk: true })
        });
        assert.equal(register.status, 200);
        assert.ok(server.fake.mailbox.some(m => m.email === 'dev@test.invalid'));
    } finally {
        await server.close();
    }
});
