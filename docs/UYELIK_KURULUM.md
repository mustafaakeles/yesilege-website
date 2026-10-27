# Üyelik sistemi: kurulum ve canlıya çıkış kontrol listesi

Bu belge, üyelik altyapısının (kayıt, giriş, e-posta doğrulama, şifre sıfırlama, Hesabım) Supabase ve Vercel üzerinde nasıl kurulacağını anlatır. Anahtar ve şifre değerlerini **bu belgeye, koda, GitHub issue'larına veya sohbetlere yazmayın**; yalnızca Vercel ortam değişkenlerine girin.

Tasarım: `docs/superpowers/specs/2026-10-27-uyelik-sadakat-eticaret-design.md`

## 1. Yerel geliştirme (hesap gerekmez)

```bash
npm run dev
```

`http://localhost:8090` adresinde site açılır. Gerçek Supabase yerine bellek içi sahte bir Supabase çalışır; doğrulama ve şifre sıfırlama bağlantıları e-posta yerine konsola yazdırılır. Sunucu kapanınca tüm hesaplar silinir.

Testler:

```bash
npm test
node tools/auth_e2e.mjs
```

`auth_e2e.mjs` için bir kez `npm install --no-save playwright@1.56.1` ve `npx playwright install chromium` gerekir.

## 2. Supabase projeleri

İki ayrı proje açın: **staging** (deneme ve Vercel önizlemeleri) ve **canlı**. İkisi de **Frankfurt (eu-central-1)** bölgesinde olmalı.

Her proje için:

1. **SQL Editor** içinde sırasıyla çalıştırın:
   - `supabase/migrations/0001_foundation.sql`
   - `supabase/tests/0001_foundation.test.sql` → çıktıda `0001 testleri geçti` bildirimi görünmeli. Test dosyası değişiklikleri geri alır (`rollback`).
2. **Authentication → Providers → Email**
   - Email provider: açık
   - Confirm email: **açık**
   - Secure email change: açık
   - Minimum password length: **10**
3. **Authentication → Sessions / Settings**
   - Refresh token rotation: açık
4. **Authentication → URL Configuration**
   - Site URL: canlıda `https://yesilege.com.tr`, staging'de önizleme adresiniz
5. **Authentication → Email Templates**: bağlantılar sitemizdeki doğrulama uç noktasına gitmeli.
   - *Confirm signup* şablonundaki bağlantı:
     `{{ .SiteURL }}/api/auth?action=confirm&token_hash={{ .TokenHash }}&type=email`
   - *Reset password* şablonundaki bağlantı:
     `{{ .SiteURL }}/api/auth?action=confirm&token_hash={{ .TokenHash }}&type=recovery`
   - Konu ve metinleri Türkçe yazın. Şablonda `{{ .ConfirmationURL }}` **kullanmayın**.
6. **Authentication → SMTP Settings**: özel SMTP olarak Resend'i girin (Resend panelindeki SMTP bilgileri). Gönderen adres, Resend'de doğrulanmış alan adından olmalı.
7. Kullanıcıları panelden **elle oluşturmayın**. Kayıt tetikleyicisi KVKK onayı ister ve panelden açılan hesabı reddeder. Hesaplar yalnızca sitedeki kayıt formundan açılır.

## 3. Vercel ortam değişkenleri

**Settings → Environment Variables** (Production için canlı, Preview için staging projesinin değerleri):

| Değişken | Nereden |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Aynı sayfadaki `anon` / publishable anahtar |
| `SUPABASE_SERVICE_ROLE_KEY` | Aynı sayfadaki `service_role` / secret anahtar (**gizli**) |
| `SITE_URL` | `https://yesilege.com.tr` (Preview'da önizleme adresi) |

`ALLOWED_DEV_ORIGINS` canlıda **tanımlanmaz**; yalnızca yerel geliştirme içindir.

Bir değişken eksikse üyelik uç noktaları `503 Üyelik sistemi şu anda kullanılamıyor` döner ve eksik değişkenin adı Vercel loglarına yazılır.

Service role anahtarı veritabanının tamamına erişir. Sızdığından şüphelenirseniz Supabase panelinden hemen yenileyin ve Vercel'de güncelleyin.

## 4. Staging doğrulaması

1. Staging önizlemesinde gerçek bir e-posta adresinizle kayıt olun; doğrulama e-postasının **gelen kutusuna** ulaştığını kontrol edin.
2. Bağlantıya tıklayın → Hesabım sayfası açılmalı.
3. Aynı bağlantıya tekrar tıklayın → "bağlantının süresi dolmuş" uyarısı görünmeli.
4. Adres ekleyin, düzenleyin, silin; ticari ileti iznini açıp kapatın.
5. Çıkış yapın, şifre sıfırlama e-postası isteyin, yeni şifreyle giriş yapın.
6. Supabase → Table Editor → `profiles` tablosunda `role` sütununun `customer` olduğunu kontrol edin.

## 5. Canlıya çıkış ön koşulları

- [ ] DNS: alan adının MX, SPF ve DKIM kayıtları kuruldu ve Resend alan adını doğruladı (bkz. `SEARCH_AND_EMAIL_SETUP.md`).
- [ ] Canlı Supabase projesi 2. bölümdeki ayarlarla kuruldu, SQL testleri geçti.
- [ ] Vercel Production ortam değişkenleri girildi.
- [ ] KVKK aydınlatma metni (`kvkk.html`, "TASLAK" notu) bir hukukçu tarafından onaylandı ve taslak notu kaldırıldı.
- [ ] Staging doğrulaması (4. bölüm) gerçek posta kutusuyla tamamlandı.
- [ ] Vercel planı ticari kullanıma uygun (Hobby planı ticari olmayan kullanım içindir).
- [ ] Supabase ücretsiz planında 7 gün hareketsiz kalan proje duraklatılır; canlıda Pro plan veya düzenli trafik olduğu doğrulandı.

Navbar'daki "Giriş" ikonu şu an **gizli**dir (`tools/build_layout.py` içinde `ACCOUNT_LINK_ENABLED = False`). Hesap sayfaları URL ile açılabilir ama menüde görünmez ve arama motorlarına kapalıdır. Yukarıdaki maddeler tamamlanınca:

1. `tools/build_layout.py` içinde `ACCOUNT_LINK_ENABLED = True` yapın.
2. `python tools/build_layout.py` çalıştırın (tüm sayfaların menüsü güncellenir).
3. `npm test` ve `python tools/build_layout.py --check` geçtikten sonra commit edip main'e gönderin.

## 6. Hesap silme talepleri

Müşteri Hesabım sayfasından silme talebi gönderdiğinde `profiles.deletion_requested_at` doldurulur, `audit_log` tablosuna kayıt düşer ve `CONTACT_TO_EMAIL` adresine bilgi e-postası gider. Talep **en geç 30 gün içinde** işlenmelidir. Silme/anonimleştirme işlemi yönetim paneli (Alt Proje 5) gelene kadar Supabase panelinden elle yapılır; sipariş ve fatura kayıtları yasal süre boyunca anonim olarak saklanır.
