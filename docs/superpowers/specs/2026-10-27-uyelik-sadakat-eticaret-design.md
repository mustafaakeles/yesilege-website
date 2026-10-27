# Üyelik, Sadakat ve E-Ticaret: Tasarım Dokümanı

- **Tarih:** 2026-10-27
- **Durum:** İnceleme bekliyor
- **Kapsam:** (1) Tüm programın yol haritası ve değişmez güvenlik kuralları; (2) Alt Proje 1'in (Temel Altyapı + Üyelik) ayrıntılı tasarımı. Alt Proje 2–5'in her biri, sırası geldiğinde ayrı bir tasarım dokümanı alır.

---

## 1. Amaç ve başarı ölçütleri

**İşletme sahibinin istekleri:** siteye giriş/üyelik; düzenli müşteriler için sadakat hesabı; dışarıdan müdahaleyle bedava ürün alınamayacak bir güvenlik altyapısı; sitede alışveriş; favoriler. İlerleme adım adım ve kontrollü olacak.

**Başarı ölçütleri**
1. Müşteri hesap açabilir, e-postasını doğrulayabilir, giriş/çıkış yapabilir, şifresini sıfırlayabilir.
2. Müşteri ürünleri inceleyebilir, favorilere ekleyebilir, sepete koyabilir ve sipariş verebilir.
3. Sadakat puanı yalnızca gerçekten ödenmiş ve teslim edilmiş siparişlerden kazanılır, kurallara uygun harcanır.
4. Bölüm 4'teki saldırı senaryolarının her biri otomatik bir testle reddedildiği kanıtlanır.
5. Mevcut site tasarımı, SEO'su ve performansı korunur; mevcut testler geçmeye devam eder.

## 2. Alınan kararlar

| Konu | Karar |
|---|---|
| Teslimat | **Cumartesi toplu kargo** (cumartesiye kadar onaylanan siparişler o gün kargoya verilir) + kargoya uygun olmayan ürünler için **Bayındır'dan teslim alma**. Ürün bazında `kargoya_uygun` işareti. Sabit kargo ücreti + belirli tutarın üstünde ücretsiz kargo. Haftalık kargo kapasite sınırı; sınır dolunca bir sonraki cumartesi önerilir. |
| Ödeme | İlk sürümde **havale/EFT + mağazada ödeme**; sipariş, 2FA'lı yönetici "ödeme alındı" diyene kadar beklemede kalır. Ödeme katmanı soyut kurulur; iyzico/PayTR hesabı açılınca kart ödemesi eklenir. |
| Sadakat | **Puan defteri:** 1 ₺ = 1 puan; 100 puan = 5 ₺; puan teslim + 14 gün sonra aktif olur; siparişin en fazla %30'u puanla ödenir; puanlar 12 ay geçerli. Tüm oranlar `settings` tablosundan değiştirilebilir. |
| Altyapı | **Supabase** (yönetilen Postgres + Auth) + mevcut **Vercel** fonksiyonları. Tarayıcı Supabase ile doğrudan konuşmaz. |
| Ön yüz | Mevcut statik HTML/CSS + vanilla JS düzeni; framework eklenmez. |

## 3. Yol haritası (alt projeler)

Her alt proje kendi döngüsünden geçer: tasarım → plan → uygulama (TDD) → inceleme → ayrı PR.

1. **Temel altyapı + Üyelik** *(bu dokümanda ayrıntılı)*: Supabase projesi, migration düzeni, oturum çerezleri, kayıt/giriş/çıkış, e-posta doğrulama, şifre sıfırlama, Hesabım (profil, adresler, izinler, silme talebi).
2. **Katalog + Favoriler:** `categories`, `products` (fiyat, stok, `kargoya_uygun`, görseller, aktif/pasif), `magaza.html`, `urun.html`, favoriler; ürün sayfalarında SEO (Product şeması).
3. **Sepet + Sipariş + Ödeme:** yerel sepet, sunucuda yeniden fiyatlama, teslimat seçimi, cumartesi kapasitesi (`shipping_batches`), havale/EFT akışı, sipariş durumları, sipariş e-postaları, yasal sayfalar (Mesafeli Satış Sözleşmesi, Ön Bilgilendirme Formu, İade/Cayma; metinler hukukçu onayına tabidir).
4. **Sadakat:** `loyalty_ledger`, kazanma/aktifleşme/harcama/iade/sona erme kuralları, "Puanlarım" sekmesi, ödeme adımında puan kullanımı.
5. **Yönetim paneli:** ürün/stok yönetimi, ödeme onayı, sipariş durumu ve cumartesi gönderi listesi, puan düzeltme (ters kayıtla), `audit_log` görüntüleme; zorunlu TOTP 2FA.
6. *(Sonra)* **Kart ödemesi:** iyzico veya PayTR; imzalı bildirim (webhook) doğrulaması.

## 4. Değişmez güvenlik kuralları (tüm alt projeler için bağlayıcı)

1. **Fiyat, stok, kargo ücreti, indirim ve puan değerleri yalnızca sunucuda, veritabanından hesaplanır.** İstek gövdesindeki tutar alanları yok sayılır.
2. Adet 1–99 arası tam sayı olmalıdır; stok, sipariş işleminin içinde satır kilidiyle düşülür.
3. Sipariş, ancak (a) 2FA'lı yönetici havale/EFT ödemesini onaylarsa veya (b) imzası doğrulanmış ve tutarı birebir eşleşen sağlayıcı bildirimi gelirse "ödendi" olur. Tarayıcıdan gelen "ödendi" bilgisi hiçbir koşulda kabul edilmez.
4. Para, stok ve puanla ilgili her değişiklik **tek bir veritabanı işleminde** (Postgres fonksiyonu/RPC) yapılır; ya tamamı uygulanır ya hiçbiri.
5. Puan bakiyesi saklanmaz; `loyalty_ledger` kayıtlarından hesaplanır. Defter **yalnızca eklemeye açıktır** (UPDATE/DELETE veritabanı seviyesinde yasak). Düzeltmeler ters kayıtla yapılır. Harcama, kullanıcı satırında kilit alınarak yapılır; bakiye eksiye düşemez.
6. Kazanılan puan yalnızca **ödenmiş ve teslim edilmiş** siparişten doğar ve teslimden 14 gün sonra aktifleşir. İptal veya iadede harcanan puan geri yüklenir, kazanılacak puan iptal edilir.
7. Puan indirimi sipariş ara toplamının en fazla %30'u olabilir.
8. Sipariş vermek ve puan kazanmak için **doğrulanmış e-posta** zorunludur.
9. Her kullanıcı verisi sorgusu oturumdaki kullanıcı kimliğiyle sınırlanır (sunucu kontrolü + RLS). Dışarıya açılan sipariş kimlikleri tahmin edilemez (UUID veya rastgele kod).
10. RLS tüm tablolarda açıktır ve `anon`/`authenticated` rolleri için **varsayılan olarak reddeder**. `SUPABASE_SERVICE_ROLE_KEY` yalnızca Vercel ortam değişkeninde durur; kaynağa, istemciye veya loglara yazılmaz.
11. Yönetici işlemleri sunucuda rol kontrolü + TOTP (AAL2) gerektirir ve `audit_log`'a yazılır.
12. Durum değiştiren her API isteği `Origin` kontrolünden geçer; gövde boyutu sınırlandırılır; hata mesajları iç ayrıntı sızdırmaz.

## 5. Mimari

```
Tarayıcı (statik HTML + vanilla JS)
   │  fetch('/api/...')  (aynı köken, HttpOnly çerezler otomatik gider)
   ▼
Vercel Functions (api/*.js)  ── doğrulama, Origin kontrolü, oran sınırı
   │  fetch (service role / kullanıcı token'ı)
   ▼
Supabase: Auth (GoTrue REST) + Postgres (RLS, RPC fonksiyonları)
```

- **CSP değişmez:** `connect-src 'self'` korunur; Supabase'e yalnızca sunucu bağlanır.
- **Bağımlılık:** Supabase'e erişim `fetch` ile REST üzerinden yapılır (Auth: `/auth/v1/*`, veri: `/rest/v1/*` ve `/rest/v1/rpc/*`). Çalışma zamanına npm paketi eklenmez; bu, reponun mevcut sıfır bağımlılık düzenini korur.
- **Fonksiyon bütçesi:** Vercel Hobby planı en fazla 12 fonksiyon çalıştırır. Hedef dağılım: mevcut 3 + `api/auth.js`, `api/account.js`, `api/catalog.js`, `api/checkout.js`, `api/loyalty.js`, `api/admin.js` = **9**. Her dosya içinde `?action=` ile yönlendirme yapılır.
- **Ortak kod:** `api/_lib/` altında (Vercel bunları fonksiyon saymaz): `supabase.js` (REST istemcisi), `session.js` (çerezler), `http.js` (gövde okuma, Origin, JSON yanıt), `ratelimit.js`, `validate.js`. Mevcut `createRateLimiter` ve `getClientIp` buraya taşınır; `api/contact.js` buradan içe aktarır (davranış değişmez, testleri korunur).
- **Migration:** `supabase/migrations/NNNN_ad.sql` dosyaları repoda tutulur; Supabase SQL editörü veya Supabase CLI ile sırayla uygulanır.

## 6. Alt Proje 1: Temel Altyapı + Üyelik (ayrıntılı)

### 6.1 Ortam değişkenleri

| Değişken | Kullanım |
|---|---|
| `SUPABASE_URL` | Proje URL'si |
| `SUPABASE_ANON_KEY` | Auth uç noktaları için `apikey` başlığı (yalnızca sunucuda kullanılır) |
| `SUPABASE_SERVICE_ROLE_KEY` | Veritabanı yönetici erişimi (yalnızca sunucu) |
| `SITE_URL` | `https://yesilege.com.tr`; e-posta bağlantıları ve Origin kontrolü için |

Değişkenler eksikse uç noktalar `503` döner ve eksik değişken adını yalnızca sunucu loguna yazar (mevcut `readConfig` kalıbı).

### 6.2 Veritabanı (`0001_foundation.sql`)

- **`profiles`**: `id uuid PK → auth.users(id) ON DELETE CASCADE`, `full_name text NOT NULL (≤100)`, `phone text NULL (≤30)`, `role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin'))`, `marketing_consent boolean NOT NULL DEFAULT false`, `marketing_consent_at timestamptz`, `kvkk_accepted_at timestamptz NOT NULL`, `deletion_requested_at timestamptz`, `created_at`, `updated_at`.
  - `auth.users` tablosuna yeni kayıt eklendiğinde bir tetikleyici `profiles` satırını kayıt meta verisinden (`full_name`, `phone`, `marketing_consent`, `kvkk_accepted_at`) oluşturur. `role` meta veriden **asla** okunmaz.
- **`addresses`**: `id uuid PK`, `user_id → profiles`, `title (≤40)`, `recipient_name`, `phone`, `city`, `district`, `neighbourhood`, `line (≤250)`, `postal_code NULL`, `is_default boolean`, zaman damgaları. Kullanıcı başına en fazla 10 adres (sunucu kontrolü). Kullanıcı başına tek varsayılan adres (kısmi benzersiz indeks).
- **`audit_log`**: `id bigserial`, `actor_id uuid NULL`, `action text`, `target text`, `details jsonb`, `ip text`, `created_at`. Yalnızca ekleme (UPDATE/DELETE'i engelleyen tetikleyici).
- **`rate_limits`**: `key text PK`, `count int`, `reset_at timestamptz` + `rate_limit_hit(p_key text, p_max int, p_window_seconds int) RETURNS boolean` fonksiyonu (tek ifadede atomik upsert). Bellek içi sınırlayıcı serverless örnekleri arasında paylaşılmadığı için giriş ve şifre sıfırlama bu dağıtık sınırı kullanır.
- **RLS:** dört tabloda da açık; `anon` ve `authenticated` için politika tanımlanmaz (= her şey reddedilir). Erişim yalnızca service role ile, sunucu fonksiyonlarından.

### 6.3 Oturum çerezleri

| Çerez | İçerik | Bayraklar |
|---|---|---|
| `ye_at` | Supabase erişim token'ı (JWT) | `HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=3600` |
| `ye_rt` | Supabase refresh token'ı | `HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=2592000` |
| `ye_session` | `1` (yalnızca arayüz ipucu, gizli bilgi değil) | `Secure; SameSite=Lax; Path=/; Max-Age=2592000` |

- Sunucu her istekte `ye_at`'ı Supabase `/auth/v1/user` ile doğrular. Doğrulama başarısız olur ve `ye_rt` varsa token'ı yeniler ve yeni çerezleri yazar (refresh token rotasyonu Supabase tarafında açık). Bu da başarısızsa tüm çerezleri siler ve `401` döner.
- `ye_session`, statik sayfalarda navbar'ın her sayfada istek atmadan "Hesabım/Giriş" durumunu göstermesi içindir. Yetki kararlarında hiçbir zaman kullanılmaz.

### 6.4 `api/auth.js` uç noktaları

Tümü `POST` ve JSON (gövde ≤ 10 KB). `Origin`, `SITE_URL` ile eşleşmelidir (geliştirmede `localhost` istisnası yapılandırmayla açılır).

| action | Girdi | Davranış |
|---|---|---|
| `register` | `fullName, email, password, phone?, kvkk:true, marketing:boolean` + bal küpü alanı | Doğrulama → Supabase `signup` (meta veri ile; `email_redirect_to` kullanılmaz, e-posta şablonu kendi bağlantımızı üretir). Kullanıcı zaten kayıtlı olsa bile yanıt **aynıdır**: `{ ok:true, message:'Doğrulama e-postası gönderildi' }`. IP başına 5 / 10 dk. |
| `login` | `email, password` | Supabase `token?grant_type=password`. Başarıda çerezler yazılır. Hata her durumda `401 "E-posta veya şifre hatalı ya da e-posta adresi henüz doğrulanmadı"` (Supabase doğrulanmamış hesabın girişine izin vermez; mesaj hesabın varlığını sızdırmaz). Sınırlar: IP başına 10 / 10 dk ve e-posta başına 5 / 15 dk (`rate_limit_hit`). |
| `resend` | `email` | Doğrulama e-postasını yeniden gönderir (Supabase `resend`, `type: signup`). Yanıt her zaman `{ success:true }`. Sınırlar `recover` ile aynı. |
| `logout` | `scope?: 'local' \| 'global'` | Supabase `logout?scope=…`, çerezleri siler. Hata olsa da çerezler silinir. |
| `confirm` | `GET ?token_hash&type=email\|recovery` | E-postadaki bağlantı buraya gelir. Supabase `verify` (`token_hash` + `type`; kayıt doğrulamasında Supabase'in tip adı `email`) → oturum çerezleri yazılır → `email` ise `/hesabim.html?dogrulandi=1`, `recovery` ise `/sifre-sifirla.html?adim=yeni` adresine 303 yönlendirmesi. Geçersiz/süresi dolmuş bağlantıda `/giris.html?hata=baglanti`. Bu tasarım farklı cihazda açılan e-posta bağlantısında da çalışır (PKCE doğrulayıcısı gerektirmez). |
| `recover` | `email` | Supabase `recover`. Yanıt her zaman `{ ok:true }`. IP başına 5 / 15 dk, e-posta başına 3 / saat. |
| `update-password` | `password` (oturum gerekli) | Supabase `PUT /auth/v1/user`. Sıfırlama akışında da kullanılır (`confirm` oturum açtığı için). Başarıda diğer oturumlar `logout?scope=others` ile kapatılır. |

**Supabase Auth ayarları (panelden):** e-posta doğrulaması zorunlu; "Secure email change" açık; refresh token rotasyonu açık; minimum şifre uzunluğu 10; Supabase Auth'un kendi oran sınırları açık; e-posta şablonları (`Confirm signup`, `Reset password`) bağlantıyı `{{ .SiteURL }}/api/auth?action=confirm&token_hash={{ .TokenHash }}&type=…` biçiminde üretir; özel SMTP olarak Resend.

### 6.5 `api/account.js` uç noktaları (oturum gerekli)

| action | Yöntem | Davranış |
|---|---|---|
| `me` | GET | `{ email, emailVerified, fullName, phone, marketingConsent, role }`. Oturum yoksa `401` ve `ye_session` silinir. |
| `update-profile` | POST | `fullName, phone` güncellenir. |
| `consent` | POST | `marketing:boolean`; `marketing_consent_at` güncellenir. |
| `addresses` | GET | Kullanıcının adresleri. |
| `address-save` | POST | Ekleme/güncelleme. Güncellemede `id`'nin kullanıcıya ait olduğu sorgu koşulunda doğrulanır (`user_id = oturum`). Başkasının kaydına dokunma girişimi `404` döner. |
| `address-delete` | POST | Aynı sahiplik koşuluyla silme. |
| `delete-request` | POST | `password` ile yeniden doğrulama → `deletion_requested_at` yazılır, `audit_log` kaydı, işletmeye bilgi e-postası. Gerçek silme/anonimleştirme yönetici tarafından yapılır (vergi mevzuatı gereği sipariş kayıtları saklanır; Alt Proje 5). |

### 6.6 Doğrulama kuralları (`api/_lib/validate.js`, saf fonksiyonlar)

- `email`: mevcut `EMAIL_RE`, ≤254, küçük harfe çevrilir.
- `password`: en az 10 karakter ve UTF-8 olarak en fazla 72 bayt (bcrypt sınırı; Türkçe harfler 2 bayt sayılır), yalnızca boşluktan oluşamaz.
- `fullName`: 2–100 karakter, kontrol karakteri içeremez.
- `phone`: isteğe bağlı, mevcut `PHONE_RE`.
- Adres alanları: zorunlu alanlar dolu, uzunluk sınırları, `city` ve `district` serbest metin (ilk sürüm).
- Bilinmeyen alanlar yok sayılır; tip uyuşmazlığı `400` ve Türkçe, alan bazlı hata mesajı döner.

### 6.7 Arayüz

- **Yeni sayfalar:** `giris.html`, `kayit.html`, `sifre-sifirla.html` (iki adım: e-posta iste → yeni şifre), `hesabim.html` (sekmeler: Profil, Adreslerim, Güvenlik; Siparişler/Favoriler/Puanlarım sekmeleri bu sürümde hiç gösterilmez; her biri ilgili alt projede eklenir).
- **Ortak script:** `account.js` (tüm hesap sayfaları). Navbar'daki "Giriş Yap" / "Hesabım" bağlantısı, her sayfada zaten yüklenen `script.js` içinde `ye_session` çerezine göre güncellenir (ayrı dosya gerekmez).
- **Navbar:** `nav-actions` içine hesap ikonu bağlantısı. `tools/build_layout.py` ortak düzen üretiyorsa değişiklik oradan yapılır; böylece `npm run check:layout` tutarlılığı korunur.
- **Yeni sayfalar `noindex`** olur ve `sitemap.xml`'e eklenmez; `robots.txt` güncellenir.
- **Formlar:** mevcut form erişilebilirlik kalıpları (etiketler, `aria-live` geri bildirim, hata odağı). Şifre göster/gizle düğmesi, `autocomplete` (`email`, `current-password`, `new-password`) değerleri.
- **Yasal metin:** `kvkk.html` üyelik verilerini (hesap, adres, iletişim izni) kapsayacak şekilde güncellenir (taslak; hukukçu onayına tabi).

### 6.8 Hata yönetimi

- Supabase ağ hatası veya 5xx: `502 "Şu anda işleminizi tamamlayamıyoruz, lütfen biraz sonra tekrar deneyin"`; ayrıntı yalnızca sunucu logunda (token, şifre, e-posta loglanmaz).
- Oran sınırı: `429` + `Retry-After`.
- Geçersiz JSON / büyük gövde: `400` / `413`.
- Origin uyuşmazlığı: `403`.
- İstemci tarafı: her hata mesajı formun `aria-live` alanında gösterilir; düğme işlem süresince devre dışı kalır (çift gönderim engeli).

### 6.9 Testler

- **Birim (`node --test`):** doğrulama fonksiyonları; çerez üretimi (bayraklar, Max-Age, silme); Origin kontrolü.
- **Uç nokta (Supabase `fetch` enjekte edilerek taklit edilir, mevcut `mxLookup` enjeksiyon kalıbı):** kayıtlı/kayıtsız e-postada aynı kayıt yanıtı; yanlış şifre ile kayıtsız e-postada aynı giriş hatası; oran sınırında 429; süresi dolmuş erişim token'ında otomatik yenileme ve yeni çerezler; yenileme başarısızsa çerezlerin silinmesi; başka kullanıcının adresini güncelleme/silme girişiminde 404; `role` alanının kayıt meta verisinden alınamaması; Origin'siz POST'ta 403.
- **Veritabanı (SQL test dosyası, staging projesinde çalıştırılır):** `anon` ve `authenticated` rolleriyle dört tabloya okuma/yazma denemesinin reddedilmesi; `audit_log` üzerinde UPDATE/DELETE'in reddedilmesi; `rate_limit_hit` doğruluğu.
- **Uçtan uca (Playwright, staging Supabase ile):** kayıt → doğrulama bağlantısı → Hesabım → çıkış → giriş → şifre sıfırlama; 375 px mobil görünüm ve klavyeyle gezinme.
- Mevcut tüm testler (`npm test`, `npm run check:layout`) geçmeye devam eder.

### 6.10 Kapsam dışı (Alt Proje 1)

Google/Apple ile giriş, SMS doğrulama, kullanıcı tarafında e-posta değiştirme arayüzü, katalog, sepet, sipariş, puan, yönetim paneli.

## 7. Dış bağımlılıklar ve işletme sahibinin yapması gerekenler

1. Supabase hesabı ve projesi (bölge: Frankfurt `eu-central-1`, Türkiye'ye en yakın). Anahtarlar yalnızca Vercel ortam değişkenlerine girilir.
2. **DNS:** Resend alan adı doğrulaması (SPF/DKIM) ve MX kayıtları. Bunlar olmadan doğrulama e-postaları güvenilir şekilde ulaşmaz (bkz. `SEARCH_AND_EMAIL_SETUP.md`). Hazır olana kadar geliştirme staging projesinde yürür.
3. Ayrı bir **staging** Supabase projesi (testler ve önizleme dağıtımları için), canlı projeden bağımsız.
4. Yasal metinlerin (KVKK güncellemesi; Alt Proje 3'te Mesafeli Satış Sözleşmesi, Ön Bilgilendirme Formu, İade/Cayma) hukukçu tarafından onaylanması.
5. Vercel planı: fonksiyon sayısı Hobby sınırının altında tasarlandı; ticari kullanım için Vercel kullanım koşulları ayrıca değerlendirilmelidir (Hobby planı ticari olmayan kullanım içindir).

## 8. Riskler

| Risk | Etki | Azaltma |
|---|---|---|
| E-posta altyapısı hazır değil | Kayıt tamamlanamaz | DNS kurulumu Alt Proje 1'in canlıya çıkış ön koşulu; staging'de Supabase test e-postası |
| Supabase ücretsiz katmanında 7 gün etkinlik olmazsa proje duraklatılır | Site üyelik özellikleri durur | Canlıya çıkışta Pro plan veya düzenli trafik; bu durum izlenir |
| Serverless soğuk başlatma | Giriş birkaç yüz ms gecikebilir | Kabul edilebilir; bağımlılıksız `fetch` istemcisi açılışı hafif tutar |
| Kapsamın büyümesi | Gecikme | Her alt proje ayrı tasarım/PR; YAGNI |
