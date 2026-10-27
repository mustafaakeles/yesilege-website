# Alt Proje 1: Temel Altyapı + Üyelik Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Müşterilerin hesap açıp e-postasını doğrulayabildiği, giriş/çıkış yapabildiği, şifresini sıfırlayabildiği ve profil/adres/izin bilgilerini yönetebildiği güvenli bir üyelik sistemi kurmak.

**Architecture:** Statik site aynen kalır. Yeni Vercel fonksiyonları `api/auth.js` ve `api/account.js`, Supabase Auth ve PostgREST'e yalnızca sunucudan `fetch` ile bağlanır. Oturum HttpOnly çerezlerde tutulur, tarayıcı Supabase'i hiç görmez. Veritabanında RLS her şeyi reddeder; erişim yalnızca service key ile, sunucudan yapılır.

**Tech Stack:** Node ≥20 (CI'da 22), ES modülleri, `node:test`, Vercel Functions (Node), Supabase (Auth + Postgres), vanilla JS/CSS, Playwright 1.56.1 (yalnızca CI ve yerel e2e; `--no-save`).

**Spec:** `docs/superpowers/specs/2026-10-27-uyelik-sadakat-eticaret-design.md` (Bölüm 4, 5, 6 ve 7)

## Global Constraints

- Çalışma zamanına **npm paketi eklenmez**; Supabase'e `fetch` ile REST üzerinden erişilir. `package.json`'a yalnızca `scripts` eklenebilir.
- `vercel.json` içindeki CSP **değişmez** (`connect-src 'self'`).
- Fonksiyon sayısı: mevcut 3 + `api/auth.js` + `api/account.js` = 5 (Hobby sınırı 12). `api/_lib/` fonksiyon sayılmaz.
- API yanıt biçimi repodaki kalıbı izler: başarı `{ success: true, ... }`, hata `{ success: false, error: '<Türkçe mesaj>' }`.
- Kullanıcıya görünen tüm metinler Türkçedir; hata mesajları iç ayrıntı (Supabase hata kodu, yığın izi) içermez.
- Token, şifre, e-posta ve service key **asla loglanmaz**. Loglarda yalnızca işlem adı ve HTTP durum kodu bulunur.
- Çerezler: `ye_at` (`HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=3600`), `ye_rt` (`HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=2592000`), `ye_session=1` (`Secure; SameSite=Lax; Path=/; Max-Age=2592000`).
- Durum değiştiren her istek: `Origin` ∈ izinli kökenler, aksi halde `403`. İzinli kökenler: `SITE_URL` kökeni + `ALLOWED_DEV_ORIGINS` (virgülle ayrılmış, yalnızca geliştirme ortamı).
- Gövde sınırı 10 000 bayt (`413`); JSON dışı içerik `415`; izin verilmeyen yöntem `405` + `Allow`.
- Ortam değişkenleri: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL`, isteğe bağlı `ALLOWED_DEV_ORIGINS`. Eksikse `503 "Üyelik sistemi şu anda kullanılamıyor."` döner ve yalnızca eksik değişken adları loglanır.
- Supabase anahtarları: eski JWT anahtarları (`anon`/`service_role`) veya yeni anahtarlar (`sb_publishable_…`/`sb_secret_…`) çalışmalıdır. Bu yüzden service çağrılarında **yalnızca `apikey` başlığı** gönderilir, `Authorization` gönderilmez. Kullanıcı çağrılarında `apikey: ANON` + `Authorization: Bearer <kullanıcı token'ı>` gönderilir.
- Her Supabase isteği 8 saniyede zaman aşımına uğrar (`AbortSignal.timeout(8000)`); zaman aşımı ve ağ hatası `502` olarak döner.
- Oran sınırları (dağıtık, `rate_limit_hit`): kayıt IP 5/600 sn; giriş IP 10/600 sn ve e-posta 5/900 sn; şifre sıfırlama ve yeniden gönderme IP 5/900 sn ve e-posta 3/3600 sn. E-posta anahtarları SHA-256 özeti olarak saklanır.
- Yeni sayfalar `<meta name="robots" content="noindex, nofollow">` içerir, `sitemap.xml`'e eklenmez, canonical içermez.
- Mevcut testler (`npm test`, `npm run check:layout`, `node tools/ui_smoke.mjs`) geçmeye devam eder.
- **Commit adımları yalnızca kullanıcı onayıyla çalıştırılır** (kullanıcının genel kuralı). Onay yoksa değişiklikler commit edilmeden bırakılır ve "Commit" adımı atlanır.

## Review Focus

1. **Türkçe karakterli uzun şifre:** 40 Türkçe harf 80 bayttır; bcrypt sessizce keser. Doğrulama karakter değil bayt sayar ve 72 baytı aşan şifreyi açık bir mesajla reddeder. → Görev 2'de test.
2. **Büyük harfli e-posta ile giriş:** `Ayse@Example.TEST` ile kayıt olup `ayse@example.test` ile giriş yapan kullanıcı aynı hesaba ulaşır; oran sınırı anahtarı da aynıdır. → Görev 2 ve Görev 4'te test.
3. **E-posta bağlantısına ikinci kez tıklamak veya süresi dolmuş bağlantı:** 500 değil, `/giris.html?hata=baglanti` adresine 303 yönlendirmesi olur. → Görev 4'te test.
4. **Supabase'in yanıt vermemesi (zaman aşımı/ağ hatası):** Türkçe genel bir mesajla 502 döner; yanıt gövdesinde Supabase ayrıntısı veya anahtar bulunmaz. → Görev 3 ve Görev 4'te test.
5. **Bozuk veya fazlalık içeren Cookie başlığı** (`=x; ye_at=; ye_at=%ZZ; a`): ayrıştırıcı çökmez, geçersiz değeri yok sayar ve oturum yok kabul edilir. → Görev 1'de test.

---

## Dosya yapısı

| Dosya | Sorumluluk |
|---|---|
| `api/_lib/http.js` (yeni) | `createRateLimiter`, `getClientIp` (contact.js'ten taşınır), istek koruması, Origin listesi, `fail`, `appendCookies` |
| `api/_lib/session.js` (yeni) | Çerez ayrıştırma/üretme/silme, `requireUser` (doğrulama + otomatik yenileme) |
| `api/_lib/supabase.js` (yeni) | Bağımlılıksız Supabase REST istemcisi (auth + db + rpc), `SupabaseError`, yapılandırma okuma |
| `api/_lib/ratelimit.js` (yeni) | `limitKey`, `hitLimit` (dağıtık sınır, `rate_limit_hit` RPC) |
| `api/_lib/validate.js` (yeni) | Üyelik/hesap girdilerinin saf doğrulama fonksiyonları |
| `api/auth.js` (yeni) | register, login, logout, confirm, recover, resend, update-password |
| `api/account.js` (yeni) | me, update-profile, consent, addresses, address-save, address-delete, delete-request |
| `api/contact.js` (değişir) | Sınırlayıcı ve IP fonksiyonlarını `_lib/http.js`'ten içe aktarıp yeniden dışa aktarır |
| `supabase/migrations/0001_foundation.sql` (yeni) | profiles, addresses, audit_log, rate_limits, tetikleyiciler, RLS |
| `supabase/tests/0001_foundation.test.sql` (yeni) | Staging'de elle çalıştırılan RLS ve kısıt testleri |
| `giris.html`, `kayit.html`, `sifre-sifirla.html`, `hesabim.html` (yeni) | Hesap sayfaları |
| `account.js`, `account-utils.js`, `account.css` (yeni) | Hesap sayfalarının istemci mantığı (ES modülü), saf yardımcılar ve stiller |
| `tools/build_layout.py` (değişir) | Navbar'a hesap bağlantısı; `account.*` dosyalarını sürüm parametresi kapsamına alma |
| `script.js` (değişir) | `ye_session` çerezine göre navbar hesap bağlantısı |
| `kvkk.html` (değişir) | Üyelik verileri bölümü (taslak) |
| `tools/dev_server.mjs`, `tools/fake_supabase.mjs`, `tools/auth_e2e.mjs` (yeni) | Yerel geliştirme sunucusu, sahte Supabase, uçtan uca test |
| `tests/helpers/http.js` (yeni) | Testler için `mockRes`, `makeReq`, sahte `fetch` kaydedicisi |
| `docs/UYELIK_KURULUM.md` (yeni) | Supabase/Vercel/DNS kurulum kontrol listesi |

---

### Görev 0: Çalışma dalı

- [ ] **Adım 1:** Kullanıcıya sor: `feat/bitki-doktoru-v2` main'e birleştirildi mi? Birleştirildiyse `git fetch origin` ve ardından `git switch -c feat/uyelik origin/main`. Birleştirilmediyse kullanıcının seçtiği tabandan dal aç. **Kullanıcının izni olmadan dal değiştirme.**
- [ ] **Adım 2:** `npm test` ve `python tools/build_layout.py --check` çalıştır. Beklenen: tümü geçer. Bu, sonraki görevler için temel çizgidir.

---

### Görev 1: HTTP ve oturum çekirdeği

**Files:**
- Create: `api/_lib/http.js`, `api/_lib/session.js`, `tests/helpers/http.js`, `tests/http-session.test.js`
- Modify: `api/contact.js` (satır 10–48: sabitler, `createRateLimiter`, `getClientIp` taşınır)

**Interfaces:**
- Produces (`api/_lib/http.js`):
  - `createRateLimiter(opts) ` ve `getClientIp(req)`: contact.js'teki ile birebir aynı davranış.
  - `allowedOrigins(env): string[]`: `new URL(env.SITE_URL).origin` + `ALLOWED_DEV_ORIGINS` ögeleri (boşluk kırpılmış, boş olanlar atılmış).
  - `fail(res, status: number, error: string)`: `res.status(status).json({ success:false, error })` döner.
  - `guardRequest(req, res, { methods: string[], origins: string[], maxBytes = 10_000 }): boolean`: sırayla 405 (+`Allow`), POST için 415 / 413 (Content-Length veya `JSON.stringify(req.body)` bayt sayısı), GET dışı yöntemde Origin kontrolü (403). Hata yanıtını kendisi gönderir ve `false` döner.
  - `appendCookies(res, cookies: string[])`: mevcut `Set-Cookie` değerini (`res.getHeader`) koruyarak ekler.
- Produces (`api/_lib/session.js`):
  - `COOKIES = { access:'ye_at', refresh:'ye_rt', hint:'ye_session' }`
  - `parseCookies(header?: string): Record<string,string>`: bozuk parçaları ve çözülemeyen `%` kodlamalarını yok sayar, ilk geçen değeri alır.
  - `sessionCookies({ access_token, refresh_token, expires_in }): string[]`: üç çerez; `ye_at` Max-Age = `min(expires_in, 3600)`.
  - `clearedSessionCookies(): string[]`: aynı yol ve bayraklarla `Max-Age=0`.
  - `requireUser(req, res, supabase): Promise<{ user, accessToken } | null>`: Görev 3'teki `supabase.auth.getUser` / `refresh` fonksiyonlarını kullanır. Akış: `ye_at` varsa `getUser` → 401 alınırsa ve `ye_rt` varsa `refresh` → yeni çerezleri ekle → `getUser`. Başarısızlıkta çerezleri siler, `401 "Oturumunuzun süresi doldu, lütfen tekrar giriş yapın."` gönderir ve `null` döner. 401 dışındaki Supabase hataları `502` olur.
- Produces (`tests/helpers/http.js`): `mockRes()` (`status`, `json`, `setHeader`, `getHeader`, `end`, `statusCode`, `headers`, `body`), `makeReq({ method='POST', body={}, headers={}, query={} })` (varsayılan `origin: 'https://yesilege.com.tr'`, `content-type: 'application/json'`), `fakeFetch(routes)`: `"METHOD /yol"` anahtarlı yanıt tablosu döndürür, çağrıları `calls` dizisine kaydeder ve tanımsız rota için test hatası fırlatır.

- [ ] **Adım 1: Başarısız testleri yaz** (`tests/http-session.test.js`)
  - `parseCookies` bozuk başlıkta çökmez: `parseCookies('=x; ye_at=; ye_at=%ZZ; a; ye_rt=abc')` → `{ ye_rt: 'abc' }` (boş ve çözülemeyen değer atılır).
  - `sessionCookies` bayrakları: `ye_at` içinde `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/api`, `Max-Age=3600` bulunur; `ye_rt` içinde `Max-Age=2592000` bulunur; `ye_session=1` içinde `HttpOnly` **bulunmaz** ve `Path=/` bulunur; `expires_in: 7200` verilince `ye_at` `Max-Age=3600` olur.
  - `clearedSessionCookies` üç çerezin hepsini `Max-Age=0` ile döndürür.
  - `guardRequest`: GET → 405 ve `Allow: POST`; `content-type: text/plain` → 415; 10 001 baytlık gövde → 413; `origin: 'https://kotu.example'` → 403; Origin yok → 403; geçerli istek → `true`.
  - `allowedOrigins({ SITE_URL:'https://yesilege.com.tr/', ALLOWED_DEV_ORIGINS:' http://localhost:8090 ,' })` → `['https://yesilege.com.tr','http://localhost:8090']`.
  - `appendCookies` iki çağrıda dört çerezi korur.
  - `requireUser`: geçerli token'da kullanıcı döner; süresi dolmuş token + geçerli `ye_rt` → yeni çerezler eklenir ve kullanıcı döner; yenileme de başarısızsa 401 + üç silme çerezi + `null`. (`supabase` burada `{ auth: { getUser, refresh } }` biçiminde elle yazılmış bir sahte nesnedir.)
  - Mevcut `tests/contact.test.js` değişmeden geçer (taşıma sonrası `createRateLimiter` hâlâ `api/contact.js`'ten içe aktarılabilir).
- [ ] **Adım 2:** `node --test tests/http-session.test.js` → modül bulunamadığı için FAIL.
- [ ] **Adım 3:** `http.js`, `session.js` ve `tests/helpers/http.js` dosyalarını uygula; `api/contact.js` bu iki fonksiyonu `_lib/http.js`'ten içe aktarıp `export { createRateLimiter, getClientIp }` ile yeniden dışa aktarsın.
- [ ] **Adım 4:** `npm test` → tümü PASS.
- [ ] **Adım 5: Commit** (onaylıysa): `feat: üyelik için HTTP ve oturum çerezi çekirdeğini ekle`

---

### Görev 2: Girdi doğrulama

**Files:**
- Create: `api/_lib/validate.js`, `tests/validate.test.js`

**Interfaces:**
- Consumes: yok. `EMAIL_RE` ve `PHONE_RE` `api/_lib/contact.js`'teki ile aynı ifadelerdir; oradan dışa aktarılıp içe aktarılır (kopyalanmaz).
- Produces: hepsi `{ ok:true, data } | { ok:false, error } ` döner. Kayıt ayrıca `{ ok:true, spam:true }` dönebilir.
  - `validateRegistration(input)` → `data: { fullName, email, password, phone|null, marketing:boolean }`. `kvkk !== true` ise hata. `bot-field` doluysa spam.
  - `validateCredentials(input)` → `{ email, password }` (giriş: yalnızca dolu ve ≤72 bayt kontrolü, uzunluk politikası uygulanmaz).
  - `validateEmailOnly(input)` → `{ email }`
  - `validateNewPassword(input)` → `{ password }`
  - `validateProfile(input)` → `{ fullName, phone|null }`
  - `validateConsent(input)` → `{ marketing:boolean }` (boolean değilse hata)
  - `validateAddress(input)` → `{ id|null, title, recipientName, phone, city, district, neighbourhood, line, postalCode|null, isDefault:boolean }`; `id` verilirse UUID biçiminde olmalıdır.
  - `normalizeEmail(value): string`: kırpar ve `toLowerCase()` uygular.
- Sınırlar: `fullName` 2–100, kontrol karakteri (`/[\u0000-\u001f\u007f]/`) yasak; `email` ≤254; şifre ≥10 karakter, ≤72 bayt (`Buffer.byteLength`), yalnızca boşluk olamaz; adres: `title` ≤40, `recipientName` 2–100, `phone` zorunlu `PHONE_RE`, `city`/`district`/`neighbourhood` 2–60, `line` 5–250, `postalCode` boş veya `/^\d{5}$/`.
- Hata metinleri (bire bir): `'Ad soyad 2-100 karakter olmalıdır.'`, `'Geçerli bir e-posta adresi girin.'`, `'Şifre en az 10 karakter olmalıdır.'`, `'Şifre çok uzun. Lütfen daha kısa bir şifre seçin.'`, `'Geçerli bir telefon numarası girin.'`, `'Devam etmek için KVKK aydınlatma metnini onaylayın.'`, `'Adres bilgilerini kontrol edin.'`

- [ ] **Adım 1: Başarısız testleri yaz** (`tests/validate.test.js`)
  - Geçerli kayıt normalize edilir: `email: ' Ayse@Example.TEST '` → `'ayse@example.test'`, `marketing` verilmezse `false`, `phone: ''` → `null`.
  - `kvkk: 'true'` (string) → hata `'Devam etmek için KVKK aydınlatma metnini onaylayın.'`.
  - 9 karakterlik şifre → `'Şifre en az 10 karakter olmalıdır.'`; `'ş'.repeat(37)` (74 bayt) → `'Şifre çok uzun…'`; `'ş'.repeat(36)` (72 bayt) → geçerli; `' '.repeat(12)` → hata.
  - `fullName: 'Ali\u0000'` → hata.
  - `bot-field: 'x'` → `{ ok:true, spam:true }`.
  - `role: 'admin'` girdisi `data` içinde hiç bulunmaz (bilinmeyen alan yok sayılır).
  - `validateCredentials`: `'ş'.repeat(37)` reddedilir, 3 karakterlik şifre kabul edilir (girişte politika uygulanmaz).
  - `validateAddress`: `id: '1 OR 1=1'` → hata; `postalCode: '3584'` → hata; `isDefault: 'yes'` → `false`.
  - `validateConsent({ marketing: 'true' })` → hata.
- [ ] **Adım 2:** `node --test tests/validate.test.js` → FAIL.
- [ ] **Adım 3:** `api/_lib/validate.js` dosyasını uygula; `api/_lib/contact.js`'te `EMAIL_RE` ve `PHONE_RE` dışa aktarılsın.
- [ ] **Adım 4:** `npm test` → PASS.
- [ ] **Adım 5: Commit** (onaylıysa): `feat: üyelik ve adres girdisi doğrulamasını ekle`

---

### Görev 3: Supabase REST istemcisi ve dağıtık oran sınırı

**Files:**
- Create: `api/_lib/supabase.js`, `api/_lib/ratelimit.js`, `tests/supabase.test.js`

**Interfaces:**
- Produces (`supabase.js`):
  - `class SupabaseError extends Error { status: number; code: string }`: `status` HTTP durumu (ağ/zaman aşımında `0`), `code` Supabase'in `error_code`/`code`/`error` alanı.
  - `readSupabaseConfig(env) → { config: { url, anonKey, serviceKey, siteUrl }, missing: string[] }`
  - `createSupabase({ url, anonKey, serviceKey, fetchImpl = fetch })` →
    - `auth.signUp({ email, password, data })`: `POST /auth/v1/signup`
    - `auth.signIn({ email, password }) → session`: `POST /auth/v1/token?grant_type=password`
    - `auth.refresh(refreshToken) → session`: `POST /auth/v1/token?grant_type=refresh_token`
    - `auth.verify({ tokenHash, type }) → session`: `POST /auth/v1/verify` gövde `{ token_hash, type }`
    - `auth.recover(email)`: `POST /auth/v1/recover`
    - `auth.resend(email)`: `POST /auth/v1/resend` gövde `{ type:'signup', email }`
    - `auth.logout(accessToken, scope: 'local'|'global'|'others')`: `POST /auth/v1/logout?scope=…`
    - `auth.getUser(accessToken) → user`: `GET /auth/v1/user`
    - `auth.updatePassword(accessToken, password)`: `PUT /auth/v1/user`
    - `db.select(table, query) → rows`, `db.insert(table, row) → rows`, `db.update(table, query, patch) → rows`, `db.remove(table, query) → rows`: `/rest/v1/<table>?<query>`, yazma işlemlerinde `Prefer: return=representation`.
    - `db.rpc(fn, args) → any`: `POST /rest/v1/rpc/<fn>`
    - `session` = `{ access_token, refresh_token, expires_in, user }`
  - `eq(value) → 'eq.' + encodeURIComponent(String(value))`: sorgu oluşturan tüm çağrılar bunu kullanır.
  - Başlıklar Global Constraints'teki anahtar kuralına uyar. Her istekte `AbortSignal.timeout(8000)`. 2xx dışı yanıt veya ağ hatası `SupabaseError` fırlatır; hata mesajına anahtar, token veya istek gövdesi konmaz.
- Produces (`ratelimit.js`):
  - `limitKey(kind: string, value: string) → string`: `${kind}:${sha256hex(value)}`
  - `hitLimit(supabase, key, max, windowSeconds) → Promise<boolean>`: `db.rpc('rate_limit_hit', { p_key, p_max, p_window_seconds })`; `true` = izinli.
  - `LIMITS = { registerIp:[5,600], loginIp:[10,600], loginEmail:[5,900], recoverIp:[5,900], recoverEmail:[3,3600] }`

- [ ] **Adım 1: Başarısız testleri yaz** (`tests/supabase.test.js`, `fakeFetch` ile)
  - `signIn`: URL `https://p.supabase.co/auth/v1/token?grant_type=password`, `apikey` = anon, gövde `{ email, password }`, dönen oturum aynen geçirilir.
  - `getUser('tok')`: `Authorization: Bearer tok` ve `apikey: anon` gönderilir.
  - `db.select('profiles', 'id=' + eq('a b'))`: URL `…/rest/v1/profiles?id=eq.a%20b`, `apikey` = service key, `Authorization` başlığı **yoktur**.
  - `db.insert`: `Prefer: return=representation` gönderilir.
  - 400 yanıtı `{ error_code:'invalid_credentials' }` → `SupabaseError` (`status 400`, `code 'invalid_credentials'`); `message` içinde anahtar ya da şifre geçmez.
  - `fetchImpl` reddederse (`AbortError`) → `SupabaseError` (`status 0`).
  - `readSupabaseConfig({})` → `missing` dört değişkenin hepsini içerir.
  - `limitKey('loginEmail','ayse@example.test')` sabit bir 64 hex karakterli özet içerir ve ham e-postayı içermez.
  - `hitLimit`, RPC'yi `{ p_key, p_max:5, p_window_seconds:900 }` ile çağırır ve `false` yanıtını `false` olarak döndürür.
- [ ] **Adım 2:** `node --test tests/supabase.test.js` → FAIL.
- [ ] **Adım 3:** İki modülü uygula (`node:crypto` `createHash('sha256')`).
- [ ] **Adım 4:** `npm test` → PASS.
- [ ] **Adım 5: Commit** (onaylıysa): `feat: bağımlılıksız Supabase REST istemcisi ve dağıtık oran sınırı ekle`

---

### Görev 4: Veritabanı temeli (migration)

**Files:**
- Create: `supabase/migrations/0001_foundation.sql`, `supabase/tests/0001_foundation.test.sql`, `tests/migration.test.js`

**Interfaces:**
- Produces: Spec 6.2'deki tablolar, birebir sütun adlarıyla. Görev 5 ve 6 bu adları kullanır: `profiles(id, full_name, phone, role, marketing_consent, marketing_consent_at, kvkk_accepted_at, deletion_requested_at, created_at, updated_at)`, `addresses(id, user_id, title, recipient_name, phone, city, district, neighbourhood, line, postal_code, is_default, created_at, updated_at)`, `audit_log(id, actor_id, action, target, details, ip, created_at)`, `rate_limits(key, count, reset_at)`, `rate_limit_hit(p_key text, p_max int, p_window_seconds int) returns boolean`.
- Kararlar:
  - `handle_new_user()` tetikleyicisi (`after insert on auth.users`, `security definer`, `set search_path = ''`): `raw_user_meta_data->>'kvkk' = 'true'` değilse `raise exception`. `full_name` meta veriden okunur ve 2–100 karakter olmalıdır. `marketing_consent = (meta->>'marketing') = 'true'` olur ve doğruysa `marketing_consent_at = now()` yazılır. `kvkk_accepted_at = now()`. `role` sütununa hiçbir değer yazılmaz (varsayılan `customer` kalır).
  - `addresses`: `unique (user_id) where is_default` kısmi indeksi; `user_id` indeksi.
  - `audit_log`: `before update or delete` tetikleyicisi `raise exception 'audit_log yalnızca eklemeye açıktır'`.
  - `rate_limit_hit`: tek bir `insert … on conflict (key) do update` ifadesinde, pencere dolmuşsa sayaç sıfırlanır, değilse artırılır; `count <= p_max` döner.
  - `updated_at` için `set_updated_at()` tetikleyicisi (profiles, addresses).
  - Dört tabloda da `enable row level security`; politika **yok**. `revoke all on all four from anon, authenticated`. `rate_limit_hit` için `revoke execute … from public, anon, authenticated`.
- `tests/migration.test.js`: SQL dosyasını metin olarak okuyup değişmez kuralları denetleyen statik test (veritabanı gerektirmez).

- [ ] **Adım 1: Başarısız statik testi yaz** (`tests/migration.test.js`)
  - Dört tablonun her biri için `alter table public.<t> enable row level security` bulunur.
  - Dosyada `create policy` **geçmez**.
  - `revoke` satırları `anon` ve `authenticated` rollerini kapsar; `rate_limit_hit` için `revoke execute` bulunur.
  - Tetikleyici fonksiyon gövdesinde `'role'` meta veri okuması **yoktur** (`/raw_user_meta_data->>'role'/` eşleşmez).
  - `security definer` kullanan her fonksiyonda `set search_path = ''` bulunur.
- [ ] **Adım 2:** `node --test tests/migration.test.js` → FAIL.
- [ ] **Adım 3:** `0001_foundation.sql` dosyasını yaz.
- [ ] **Adım 4:** `node --test tests/migration.test.js` → PASS.
- [ ] **Adım 5:** `supabase/tests/0001_foundation.test.sql` dosyasını yaz: `begin; … rollback;` içinde `set local role anon` ve `set local role authenticated` ile dört tabloda select/insert denemeleri, her biri `permission denied` beklentili `DO` bloklarında. Ayrıca `audit_log` update denemesinin reddedildiği, `rate_limit_hit('t',2,60)` çağrısının üç kez çağrıldığında `true,true,false` döndüğü ve `kvkk` meta verisi olmadan `auth.users` eklemesinin reddedildiği denetlenir. Başarılı çalıştırma `NOTICE: 0001 testleri geçti` yazar.
- [ ] **Adım 6:** Kullanıcının staging Supabase projesi hazırsa migration'ı ve test SQL'ini SQL editöründe çalıştır. Beklenen: `0001 testleri geçti`. Proje hazır değilse bu adımı **açıkça "çalıştırılmadı"** olarak raporla.
- [ ] **Adım 7: Commit** (onaylıysa): `feat: üyelik veritabanı şeması, RLS ve oran sınırı fonksiyonunu ekle`

---

### Görev 5: `api/auth.js`

**Files:**
- Create: `api/auth.js`, `tests/auth.test.js`

**Interfaces:**
- Consumes: Görev 1 (`guardRequest`, `allowedOrigins`, `fail`, `appendCookies`, `getClientIp`, `sessionCookies`, `clearedSessionCookies`, `parseCookies`, `COOKIES`, `requireUser`), Görev 2 (doğrulayıcılar), Görev 3 (`createSupabase`, `readSupabaseConfig`, `SupabaseError`, `hitLimit`, `limitKey`, `LIMITS`).
- Produces: `createHandler({ env = process.env, fetchImpl = fetch } = {})` ve `export default createHandler()`. Yönlendirme `req.query.action` ile yapılır; bilinmeyen eylem `404 "İşlem bulunamadı."`.
- Davranışlar (spec 6.4):
  - `register`: doğrula → spam ise `200 { success:true }` (Supabase çağrılmaz) → IP sınırı → `signUp({ email, password, data:{ full_name, phone, kvkk:'true', marketing:String(bool) } })`. Supabase 4xx veya kayıtlı e-posta durumunda da yanıt `200 { success:true, message:'Doğrulama e-postası gönderildi. Lütfen gelen kutunuzu kontrol edin.' }` olur. Yalnızca ağ hatası/5xx `502` döner.
  - `login`: doğrula → IP ve e-posta sınırı → `signIn` → çerezler + `200 { success:true }`. Supabase 400/401/422 → `401 'E-posta veya şifre hatalı ya da e-posta adresi henüz doğrulanmadı.'`.
  - `logout`: `scope` ∈ {`local`,`global`} (varsayılan `local`), `ye_at` varsa `auth.logout`. Hata olsa da silme çerezleri yazılır ve `200` döner.
  - `confirm` (GET, Origin kontrolü yok): `type` ∈ {`email`,`recovery`} ve `token_hash` 1–200 karakterlik `/^[A-Za-z0-9_-]+$/` olmalıdır, aksi halde doğrudan hata yönlendirmesi. `verify` başarılıysa çerezler + `303 Location: /hesabim.html?dogrulandi=1` ya da `/sifre-sifirla.html?adim=yeni`. Her hatada `303 /giris.html?hata=baglanti`.
  - `recover` / `resend`: doğrula → IP ve e-posta sınırı (`recoverIp`/`recoverEmail` kind adları `recover`/`resend` ayrı tutulur) → Supabase çağrısı → sonuç ne olursa olsun `200 { success:true }`. Ağ hatası da `200` döner ve loglanır (hesap varlığı sızmaz).
  - `update-password`: `requireUser` → `validateNewPassword` → `updatePassword` → `logout(token,'others')` (hatası yok sayılır) → `200`. Supabase 422 (`same_password`, `weak_password`) → `400 'Bu şifre kullanılamıyor. Lütfen farklı bir şifre seçin.'`.
  - Oran sınırı aşılınca `429` + `Retry-After` (pencere saniyesi) + `'Çok fazla deneme yaptınız. Lütfen biraz sonra tekrar deneyin.'`. `hitLimit` hata verirse `502`.
  - Yapılandırma eksikse `503`.

- [ ] **Adım 1: Başarısız testleri yaz** (`tests/auth.test.js`, `fakeFetch` + `makeReq` + `mockRes`)
  - Kayıt: kayıtlı ve kayıtsız e-posta (Supabase 200 ya da 422) için yanıtlar **bayt bayt aynı**.
  - Kayıt: `signUp` gövdesindeki `data` içinde `role` yoktur, `kvkk:'true'` vardır; istemci `role:'admin'` gönderse bile değişmez.
  - Kayıt: spam alanı doluyken `fakeFetch.calls` boştur.
  - Giriş: başarıda `Set-Cookie` üç çerez içerir; yanlış şifre (400) ve doğrulanmamış e-posta (400 `email_not_confirmed`) aynı 401 mesajını verir.
  - Giriş: `Ayse@Example.TEST` ve `ayse@example.test` için `rate_limit_hit` aynı `p_key` ile çağrılır.
  - Giriş: `rate_limit_hit` `false` dönerse 429 + `Retry-After` gelir ve `signIn` hiç çağrılmaz.
  - Origin'siz POST → 403, Supabase çağrılmaz.
  - `confirm`: geçerli `token_hash` → 303 `/hesabim.html?dogrulandi=1` + çerezler; `type=recovery` → `/sifre-sifirla.html?adim=yeni`; Supabase 403 (kullanılmış/süresi dolmuş) → 303 `/giris.html?hata=baglanti`; `token_hash='<x>'` → Supabase çağrılmadan aynı yönlendirme.
  - `recover`: Supabase ağ hatasında da `200 { success:true }`.
  - `update-password`: oturum yoksa 401; başarıda `logout?scope=others` çağrılır.
  - Supabase zaman aşımı (giriş) → 502; yanıt gövdesinde `supabase`, `apikey` veya ortam değişkeni değeri geçmez.
  - Ortam eksikse 503.
  - Bilinmeyen `action` → 404.
- [ ] **Adım 2:** `node --test tests/auth.test.js` → FAIL.
- [ ] **Adım 3:** `api/auth.js` dosyasını uygula. Her eylem ayrı bir küçük fonksiyon olsun (`handleRegister(ctx)` vb.; `ctx = { req, res, supabase, config, ip }`), dosya 250 satırı aşmasın.
- [ ] **Adım 4:** `npm test` → PASS.
- [ ] **Adım 5: Commit** (onaylıysa): `feat: kayıt, giriş, doğrulama ve şifre sıfırlama API'sini ekle`

---

### Görev 6: `api/account.js`

**Files:**
- Create: `api/account.js`, `tests/account.test.js`

**Interfaces:**
- Consumes: Görev 1–3; `sendEmail` (`api/_lib/resend.js`) ve `verifiedRecipients` (`api/contact.js`).
- Produces: `createHandler({ env, fetchImpl, sendEmailImpl = sendEmail })`. Tüm eylemler önce `requireUser` çağırır. GET: `me`, `addresses`. POST: diğerleri.
- Davranışlar (spec 6.5):
  - `me` → `{ success:true, user:{ email, emailVerified: !!user.email_confirmed_at, fullName, phone, marketingConsent, role } }`. `profiles` satırı `id=eq.<user.id>` ile okunur.
  - `update-profile` → `update('profiles', 'id='+eq(uid), { full_name, phone })`.
  - `consent` → `{ marketing_consent, marketing_consent_at: marketing ? new Date().toISOString() : null }`.
  - `addresses` → `select('addresses', 'user_id='+eq(uid)+'&order=is_default.desc,created_at.asc')`, camelCase'e çevrilir.
  - `address-save`: `id` yoksa önce sayım (`select=id`); 10 veya daha fazlaysa `400 'En fazla 10 adres kaydedebilirsiniz.'`. `isDefault` doğruysa önce `update('addresses','user_id='+eq(uid)+'&is_default=eq.true',{is_default:false})`. Güncellemede sorgu **her zaman** `id=eq.<id>&user_id=eq.<uid>` olur; dönen satır sayısı 0 ise `404 'Adres bulunamadı.'`. `user_id` istemciden asla okunmaz.
  - `address-delete`: aynı sahiplik sorgusuyla silme; 0 satır → 404.
  - `delete-request`: gövde `{ password }` → `signIn({ email:user.email, password })` ile yeniden doğrulama (`loginEmail` sınırına tabidir; başarısızsa `401 'Şifre hatalı.'`) → `deletion_requested_at` yazılır → `audit_log` eklenir (`action:'account.delete_request'`, `actor_id:uid`, `ip`) → `CONTACT_TO_EMAIL` adresine bilgi e-postası gider (gönderilemezse loglanır, istek yine başarılı sayılır) → `200`. Bu eylem `ye_*` çerezlerini değiştirmez.

- [ ] **Adım 1: Başarısız testleri yaz** (`tests/account.test.js`)
  - Oturum yokken her eylem 401 döner.
  - `me` doğru alanları döndürür; `email_confirmed_at: null` → `emailVerified:false`.
  - **Başka kullanıcının adresi:** `address-save` ile başka bir `id` gönderilince PATCH URL'si `user_id=eq.<oturumdaki uid>` içerir; Supabase `[]` döner → 404.
  - `address-delete` için de aynı sahiplik koşulu ve 404 geçerlidir.
  - İstemci gövdesindeki `user_id`/`userId` alanı yazma isteğine geçmez.
  - 10 adres varken yeni adres → 400.
  - `isDefault:true` → önce diğer varsayılanları kaldıran PATCH çağrısı, sonra kayıt yapılır (çağrı sırası `calls` ile doğrulanır).
  - `update-profile` gövdesindeki `role:'admin'` PATCH gövdesine geçmez.
  - `delete-request`: yanlış şifre → 401 ve `deletion_requested_at` yazılmaz; doğru şifre → `audit_log` insert'ü yapılır; e-posta gönderimi hata verse de 200 döner.
  - Süresi dolmuş `ye_at` + geçerli `ye_rt` ile `me` → 200 ve yeni `Set-Cookie`.
- [ ] **Adım 2:** `node --test tests/account.test.js` → FAIL.
- [ ] **Adım 3:** `api/account.js` dosyasını uygula (≤250 satır).
- [ ] **Adım 4:** `npm test` → PASS.
- [ ] **Adım 5: Commit** (onaylıysa): `feat: hesap profili, adres defteri ve silme talebi API'sini ekle`

---

### Görev 7: Yerel geliştirme sunucusu ve sahte Supabase

**Files:**
- Create: `tools/dev_server.mjs`, `tools/fake_supabase.mjs`, `tests/fake-supabase.test.js`
- Modify: `package.json` (`"dev": "node tools/dev_server.mjs --fake-supabase"`), `.claude/launch.json` (izlenmeyen dosya; `yesilege-dev` yapılandırması, port 8090)

**Interfaces:**
- Produces (`fake_supabase.mjs`): `startFakeSupabase({ port = 0 }) → Promise<{ url, close(), mailbox: Array<{ type:'email'|'recovery', email, tokenHash }>, users }>`. Bellek içi uygulama: Görev 3'teki tüm auth uç noktaları (signup doğrulanmamış kullanıcı yaratır ve `mailbox`'a token ekler, doğrulanmamış girişte 400 `email_not_confirmed`, verify token'ı tek kullanımlık tüketir ve ikinci kullanımda 403 döner, refresh token rotasyonu yapar, erişim token'ı 3600 sn ömürlüdür), `profiles`/`addresses`/`audit_log` için yalnızca bu projenin kullandığı PostgREST alt kümesi (`eq.` filtreleri, `order`, `select=id`, `return=representation`) ve `rpc/rate_limit_hit`. Signup sırasında migration'daki tetikleyici kuralları taklit edilir (kvkk yoksa 500, role yazılmaz).
- Produces (`dev_server.mjs`): `startDevServer({ port, env }) → Promise<{ url, close() }>`. Depo kökünden statik dosya sunar (yalnızca kök içinde; `..` ile dizin dışına çıkmak engellenir, `_internal/`, `supabase/`, `.git/` ve `node_modules/` 404 döner). `/api/<ad>` isteklerini `api/<ad>.js` default handler'ına Vercel benzeri `req` (`query`, JSON `body`, `headers`) ve `res` (`status`, `json`, `setHeader`, `getHeader`, `end`) ile iletir. `vercel.json` başlıklarını (CSP dahil) uygular. `--fake-supabase` bayrağıyla sahte Supabase'i başlatır ve env'i ona yönlendirir (`SITE_URL=http://localhost:<port>`). CLI olarak çalıştırıldığında `PORT` (varsayılan 8090) kullanılır ve doğrulama bağlantıları konsola yazdırılır.

- [ ] **Adım 1: Başarısız testleri yaz** (`tests/fake-supabase.test.js`): Görev 3 istemcisi ile sahte sunucu üzerinden signup → doğrulanmamış girişte 400 → `mailbox` token'ı ile verify → giriş başarılı → aynı token ile ikinci verify 403 → `rate_limit_hit` üçüncü çağrıda `false`. Ayrıca dev sunucusunda `GET /../package.json` ve `GET /supabase/migrations/0001_foundation.sql` → 404, `GET /index.html` yanıtında `Content-Security-Policy` başlığı bulunur.
- [ ] **Adım 2:** `node --test tests/fake-supabase.test.js` → FAIL.
- [ ] **Adım 3:** İki aracı uygula (yalnızca `node:http`, `node:fs`, `node:path`, `node:crypto`).
- [ ] **Adım 4:** `npm test` → PASS. Ardından `npm run dev` ile sunucuyu başlat, `curl -i http://localhost:8090/api/account?action=me` → 401.
- [ ] **Adım 5: Commit** (onaylıysa; `.claude/launch.json` commit edilmez): `chore: yerel geliştirme sunucusu ve sahte Supabase ekle`

---

### Görev 8: Navbar hesap bağlantısı ve yerleşim aracı

**Files:**
- Modify: `tools/build_layout.py` (`nav_html` içindeki `nav-actions` bloğu; satır 145–180 arasındaki sürüm regex'leri), `script.js`, `style.css` (yalnızca `.nav-account` kuralları), `tests/layout.test.js`
- Bütün sayfalar: `python tools/build_layout.py` ile yeniden üretilir.

**Interfaces:**
- Produces: her sayfada, `nav-actions` içinde telefon bağlantısından sonra `<a href="{prefix}giris.html" class="nav-account" data-account-link aria-label="Giriş yap"><i class="fas fa-user" aria-hidden="true"></i><span>Giriş</span></a>`. `script.js` sayfa yüklenince `document.cookie` içinde `ye_session=1` bulursa `href`'i `{aynı prefix}hesabim.html`, etiketi `Hesabım` ve `aria-label`'ı `Hesabım` yapar. Prefix, mevcut `href`'teki `giris.html` öncesinden türetilir.
- `build_layout.py` sürüm regex'lerine `account` adı eklenir (`account.js` defer + `?v=`, `account.css` + `?v=`). `ASSET_VERSION` yeni bir değere artırılır.
- Mobilde (`< 768px`) yalnızca ikon görünür, metin gizlenir; dokunma alanı ≥44×44 px.

- [ ] **Adım 1: Başarısız testi yaz** (`tests/layout.test.js`): menülü her sayfada `data-account-link` bulunur, blog yazılarında `href="../giris.html"` geçer; `script.js` içinde `ye_session=1` denetimi bulunur.
- [ ] **Adım 2:** `npm test` → FAIL.
- [ ] **Adım 3:** `build_layout.py`, `script.js` ve `style.css` dosyalarını güncelle; `python tools/build_layout.py` çalıştır.
- [ ] **Adım 4:** `npm test` ve `python tools/build_layout.py --check` → PASS. `node tools/ui_smoke.mjs` → PASS (navbar taşması yok).
- [ ] **Adım 5: Commit** (onaylıysa): `feat: navbar'a hesap bağlantısı ekle`

---

### Görev 9: Giriş, kayıt ve şifre sıfırlama sayfaları

**Files:**
- Create: `giris.html`, `kayit.html`, `sifre-sifirla.html`, `account.js`, `account-utils.js`, `account.css`, `tests/account-pages.test.js`
- Modify: `robots.txt` (`Disallow: /hesabim.html`, `/giris.html`, `/kayit.html`, `/sifre-sifirla.html`, `/api/`)

**Interfaces:**
- Consumes: Görev 5 uç noktaları; Görev 8 sürüm regex'leri.
- Sayfa iskeleti `kvkk.html`'den alınır (head bağlantıları, `skip-link`, `<main id="main">`, `<nav class="navbar"…>` yer tutucusu, footer, `script.js` + `account.js` defer). Ardından `python tools/build_layout.py` çalıştırılır.
- Formlar mevcut `.form-group` sınıflarını kullanır. Her formda `<p class="form-status" role="status" aria-live="polite" aria-atomic="true">` bulunur. `data-form="login|register|recover|resend|new-password"` ile `account.js` tarafından yakalanır.
- `account-utils.js`: DOM kullanmayan saf ES modülü; Node testlerinden doğrudan içe aktarılır. Dışa aktarır: `safeReturnPath(value: string|null): string`.
- `account.js` bir ES modülüdür (`<script type="module" src="account.js?v=…">`) ve `import { safeReturnPath } from './account-utils.js'` ile yardımcıyı alır. Görev 8'de `build_layout.py` sürüm regex'ine eklenen `account` kuralı `type="module"` biçimini de kapsar. Her sayfada `document.querySelector('[data-form]')` varsa çalışır:
  - `postJson(action, body) → Promise<{ ok, status, data }>`: `fetch('/api/auth?action='+action, { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'} })`. 429'da sunucu mesajı, ağ hatasında `'Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin.'` gösterilir.
  - Gönderim sırasında düğme `disabled` + `aria-busy="true"` olur (çift gönderim engeli).
  - Giriş başarılıysa `?donus=` parametresi yalnızca `/` ile başlayıp `//` ile başlamıyorsa kullanılır (açık yönlendirme engeli), aksi halde `hesabim.html`.
  - Şifre göster/gizle düğmesi (`aria-pressed`).
  - `giris.html?hata=baglanti` → `'Bağlantının süresi dolmuş veya daha önce kullanılmış. Yeni bir bağlantı isteyin.'`.
  - `sifre-sifirla.html`: `?adim=yeni` yoksa e-posta formu, varsa yeni şifre formu (`update-password`).
- Alanlar: `autocomplete` değerleri `name`, `email`, `tel`, `current-password`, `new-password`. KVKK onay kutusu `kvkk.html`'e bağlantı verir. Ticari ileti kutusu işaretsiz gelir. Bal küpü alanı `bot-field` görsel ve erişilebilirlik ağacından gizlenir (mevcut iletişim formundaki gibi).
- Her sayfada `<meta name="robots" content="noindex, nofollow">` bulunur; canonical bulunmaz; `<title>` ve `description` benzersizdir.

- [ ] **Adım 1: Başarısız testleri yaz** (`tests/account-pages.test.js`, statik HTML denetimi)
  - Üç sayfada `noindex, nofollow` var, `rel="canonical"` yok; `sitemap.xml` bu sayfaları içermiyor.
  - Şifre alanlarının `autocomplete` değerleri doğru (girişte `current-password`, kayıt ve yeni şifrede `new-password`).
  - Kayıt formunda `name="marketing"` kutusu `checked` değil; `name="kvkk"` `required`.
  - Her formda `aria-live="polite"` durum alanı var.
  - `safeReturnPath` (`account-utils.js`'ten içe aktarılır): `safeReturnPath('//evil.example')` → `'hesabim.html'`, `safeReturnPath('https://evil.example')` → `'hesabim.html'`, `safeReturnPath('/hesabim.html')` → `'/hesabim.html'`, `safeReturnPath(null)` → `'hesabim.html'`.
  - `robots.txt` yeni `Disallow` satırlarını içerir ve `Sitemap` satırı korunur.
- [ ] **Adım 2:** `npm test` → FAIL.
- [ ] **Adım 3:** Sayfaları, `account-utils.js`, `account.js` ve `account.css` dosyalarını yaz; `python tools/build_layout.py` çalıştır. (`package.json`'da `"type": "module"` olduğu için Node testleri `account-utils.js`'i doğrudan içe aktarabilir.)
- [ ] **Adım 4:** `npm test`, `python tools/build_layout.py --check` → PASS. `npm run dev` ile tarayıcıda kayıt → konsoldaki doğrulama bağlantısı → giriş → çıkış akışını elle dene; 375 px genişlikte yatay kaydırma olmadığını doğrula.
- [ ] **Adım 5: Commit** (onaylıysa): `feat: giriş, kayıt ve şifre sıfırlama sayfalarını ekle`

---

### Görev 10: Hesabım sayfası ve KVKK güncellemesi

**Files:**
- Create: `hesabim.html`
- Modify: `account.js`, `account.css`, `kvkk.html`, `tests/account-pages.test.js`

**Interfaces:**
- Consumes: Görev 6 uç noktaları.
- Sekmeler: Profil, Adreslerim, Güvenlik. WAI-ARIA tab deseni kullanılır (`role="tablist"`, ok tuşlarıyla gezinme, `aria-selected`, `aria-controls`). URL hash'i (`#adresler`, `#guvenlik`) sekmeyi açar.
- Açılışta `GET /api/account?action=me` çağrılır; 401 gelirse `giris.html?donus=/hesabim.html` adresine yönlendirilir. `?dogrulandi=1` → `'E-posta adresiniz doğrulandı. Hoş geldiniz!'`.
- Profil: ad soyad, telefon, e-posta (salt okunur), ticari ileti anahtarı (`consent`).
- Adreslerim: liste, ekle/düzenle formu (aynı form), sil (onay iletişim kutusu `<dialog>`), varsayılan rozeti; 10 adres sınırına ulaşılınca "Yeni adres" düğmesi gizlenir.
- Güvenlik: şifre değiştir (`update-password`), "Bu cihazdan çık" (`logout local`), "Tüm cihazlardan çık" (`logout global`), hesap silme talebi (`<dialog>` içinde şifre + açıklama: siparişlerin yasal saklama süresi boyunca anonimleştirilerek tutulacağı).
- Kullanıcı verisi DOM'a yalnızca `textContent` ile yazılır (`innerHTML` kullanılmaz).
- `kvkk.html`: "Üyelik ve hesap verileri" bölümü eklenir (işlenen veriler: ad, e-posta, telefon, adres, oturum kayıtları, ticari ileti izni; amaç; hukuki sebep; saklama; Supabase'in AB bölgesinde barındırılması; mevcut "TASLAK — hukuki onay bekliyor" notu korunur). `meta description` üyeliği kapsayacak şekilde güncellenir.

- [ ] **Adım 1: Başarısız testleri yaz** (`tests/account-pages.test.js`'e ek)
  - `hesabim.html` `noindex, nofollow` içerir; `role="tablist"` ve üç `role="tab"` bulunur.
  - `account.js` içinde `innerHTML` geçmez.
  - `kvkk.html` "Üyelik" başlığını ve "TASLAK" notunu içerir.
- [ ] **Adım 2:** `npm test` → FAIL.
- [ ] **Adım 3:** Sayfayı ve kodu uygula; `python tools/build_layout.py` çalıştır.
- [ ] **Adım 4:** `npm test`, `--check` → PASS. `npm run dev` ile profil kaydet, adres ekle/düzenle/sil, şifre değiştir ve her iki çıkış yolunu elle dene; klavyeyle sekmeler arasında gezin.
- [ ] **Adım 5: Commit** (onaylıysa): `feat: Hesabım sayfasını ekle ve KVKK metnine üyelik verilerini işle`

---

### Görev 11: Uçtan uca test, CI ve kurulum kılavuzu

**Files:**
- Create: `tools/auth_e2e.mjs`, `docs/UYELIK_KURULUM.md`
- Modify: `.github/workflows/quality.yml` (`browser-smoke` işine `node tools/auth_e2e.mjs` adımı), `SEARCH_AND_EMAIL_SETUP.md` (üyelik e-postalarının da DNS'e bağlı olduğuna dair tek satır ve kılavuza bağlantı)

**Interfaces:**
- Consumes: Görev 7 `startDevServer({ env })` + `startFakeSupabase()`.
- `auth_e2e.mjs`: `tools/ui_smoke.mjs` ile aynı Playwright kalıbı; ekran görüntüleri `artifacts/auth-e2e/` altına. Senaryo (masaüstü 1280 ve mobil 375):
  1. `kayit.html` doldur → başarı mesajı.
  2. Doğrulanmadan giriş → 401 mesajı.
  3. `mailbox` bağlantısını aç → `hesabim.html?dogrulandi=1` ve hoş geldin mesajı; navbar'da "Hesabım".
  4. Aynı bağlantıyı tekrar aç → `giris.html?hata=baglanti` mesajı.
  5. Adres ekle → listede görünür.
  6. Çıkış → navbar'da "Giriş"; `hesabim.html` açılınca giriş sayfasına yönlenir.
  7. Şifremi unuttum → `mailbox` recovery bağlantısı → yeni şifre → yeni şifreyle giriş başarılı.
  8. Sayfada `pageerror` veya CSP ihlali konsol mesajı yok; `document.documentElement.scrollWidth <= innerWidth`.
- `docs/UYELIK_KURULUM.md` adım listesi: staging ve canlı Supabase projesi (Frankfurt); Auth ayarları (e-posta doğrulaması açık, secure email change, refresh token rotasyonu, minimum şifre 10, Site URL `https://yesilege.com.tr`); iki e-posta şablonunun tam bağlantı metni (`{{ .SiteURL }}/api/auth?action=confirm&token_hash={{ .TokenHash }}&type=email` ve `…&type=recovery`); Resend özel SMTP; migration ve test SQL'inin çalıştırılması; Vercel ortam değişkenleri (Production ve Preview için ayrı projeler); canlıya çıkış öncesi kontrol listesi (DNS SPF/DKIM doğrulandı, KVKK metni hukukçu onaylı, gerçek posta kutusuna test kaydı ulaştı). Anahtar değerleri belgeye **yazılmaz**.

- [ ] **Adım 1:** `tools/auth_e2e.mjs` dosyasını yaz; `npm install --no-save --package-lock=false playwright@1.56.1` (zaten varsa atla) sonrasında `node tools/auth_e2e.mjs` çalıştır. Beklenen: 8 adım için `✓` ve sıfır çıkış kodu.
- [ ] **Adım 2:** CI iş akışına adımı ekle; kılavuzu yaz.
- [ ] **Adım 3: Tam doğrulama:** `npm test`, `python tools/build_layout.py --check`, `node tools/ui_smoke.mjs`, `node tools/auth_e2e.mjs` → hepsi PASS. `git diff --stat` ile yalnızca bu planın dosyalarının değiştiğini doğrula.
- [ ] **Adım 4:** `security-reviewer` ve `code-reviewer` incelemesi (tüm dal). CRITICAL ve HIGH bulgular düzeltilmeden PR açılmaz.
- [ ] **Adım 5: Commit** (onaylıysa): `test: üyelik akışı için uçtan uca test, CI adımı ve kurulum kılavuzu ekle`
- [ ] **Adım 6:** PR yalnızca kullanıcı isterse açılır.

---

## Canlıya çıkış ön koşulları (kod dışı, kullanıcıda)

Bu plan tamamlandığında üyelik **staging'de** çalışır durumdadır. Canlıya çıkmak için `docs/UYELIK_KURULUM.md`'deki kontrol listesinin tamamlanması gerekir: DNS SPF/DKIM doğrulaması, canlı Supabase projesi, ortam değişkenleri ve KVKK metninin hukukçu onayı. Bunlar tamamlanmadan `kayit.html` canlıda ana menüden erişilebilir olsa bile e-postalar ulaşmayabilir. Bu yüzden Görev 8'deki navbar bağlantısı, canlı yapılandırma hazır olana kadar `main`'e birleştirilmemelidir; PR açıklamasında bu belirtilir.
