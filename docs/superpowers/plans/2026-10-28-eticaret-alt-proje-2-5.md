# E-ticaret Alt Proje 2–5: uygulama planı

- **Tarih:** 2026-10-28
- **Dayanak:** `docs/superpowers/specs/2026-10-27-uyelik-sadakat-eticaret-design.md` §2–4 (kararlar ve değişmez güvenlik kuralları)
- **Yetki:** İşletme sahibi 2026-10-28'de dört alt projenin sırayla uygulanmasını, main'e gönderilmesini ve canlı Supabase'te ekleyici migration'ların çalıştırılmasını onayladı.

## Sabit kararlar

| Konu | Karar |
|---|---|
| Para | Tüm tutarlar **kuruş** (`integer`). Arayüz `₺` biçimler. |
| İş kuralları | Sipariş, stok, iptal, teslim ve puan işlemleri **Postgres fonksiyonlarında**, tek işlemde (§4.4). API yalnızca doğrular ve fonksiyonu çağırır. |
| Fonksiyonlar | `api/catalog.js` (katalog, favoriler), `api/checkout.js` (sepet fiyatı, sipariş, siparişlerim), `api/account.js` + `loyalty` işlemi, `api/admin.js` (panel). |
| Görseller | Supabase Storage `products` herkese açık kovası; yükleme yalnızca yönetici API'siyle. CSP `img-src` Supabase alan adını içerir. |
| Mağaza görünürlüğü | `tools/build_layout.py` → `SHOP_LINK_ENABLED`. İşletme ürünleri panelden girene kadar menüde gizli. Ürün/fiyat **uydurulmaz**. |
| Ödeme | Havale/EFT ve mağazada ödeme. Kart ödemesi kapsam dışı (Alt Proje 6). |
| Yasal metinler | Mesafeli Satış Sözleşmesi, Ön Bilgilendirme Formu, İade ve Cayma: **TASLAK**; satıcı kimlik bilgileri `[doldurulacak]`. |
| Yönetici | `profiles.role = 'admin'` + oturumda TOTP (JWT `aal = aal2`). Her işlem `audit_log`'a yazılır. |
| SQL testleri | `tools/db_test.mjs`: PGlite üzerinde tüm migration'lar + `supabase/tests/*.test.sql`. `npm install --no-save @electric-sql/pglite` gerekir. |

## Adımlar

1. **Alt Proje 2 — Katalog + Favoriler:** `0002_catalog.sql` (categories, products, favorites, settings), `api/catalog.js`, `magaza.html`, `urun.html`, Hesabım → Favorilerim.
2. **Alt Proje 3 — Sepet + Sipariş:** `0003_orders.sql` (orders, order_items, shipping_batches, `place_order`, `cancel_order`), `api/checkout.js`, `sepet.html`, `odeme.html`, sipariş e-postaları, yasal sayfalar, Hesabım → Siparişlerim.
3. **Alt Proje 4 — Sadakat:** `0004_loyalty.sql` (loyalty_ledger, FIFO bakiye, teslimde kazanım, iptalde iade), ödeme adımında puan, Hesabım → Puanlarım.
4. **Alt Proje 5 — Yönetim paneli:** `api/admin.js`, `yonetim.html`; TOTP kaydı/doğrulaması, siparişler, ödeme onayı, durum, cumartesi listesi, ürün/kategori/stok/görsel, puan düzeltme, ayarlar, denetim kaydı.
5. **Son adım (kullanıcı isteği):** Ürün kartlarında boş yer tutucu kalmasın; `images/` altındaki gerçek fidanlık/ürün fotoğrafları kullanılarak örnek ve taslak ürünlere birebir gerçek görseller yerleştirilir.
6. Her adım sonunda: `npm test`, `node tools/db_test.mjs`, `python tools/build_layout.py --check`, UI denetimi → commit → main → canlı Supabase'te migration + SQL testi.

## Durum (2026-10-28 sabahı)

Dört alt proje uygulandı, testleri geçti ve canlıya gönderildi; 0002–0004 migration'ları canlı Supabase'te çalıştırıldı ve SQL testleri orada da geçti.
Mağaza menüde gizli (`SHOP_LINK_ENABLED = False`). Yönetim panelinde gerçek site fotoğraflarıyla 10 hazır ürün taslağı var; fiyat ve stok girilince yayına çıkar.

## İşletme sahibine kalanlar

- Kendi hesabını yönetici yapmak (Supabase SQL Editor):
  `update public.profiles set role = 'admin' where id = (select id from auth.users where lower(email) = 'mustafaakeles@gmail.com');`
- yesilege.com.tr/yonetim.html → doğrulama uygulamasını (TOTP) kurmak.

- Ürünleri, fiyatları, stokları ve görselleri panelden girmek; ardından `SHOP_LINK_ENABLED = True`.
- Ayarlar: banka/IBAN bilgisi, kargo ücreti, ücretsiz kargo eşiği, haftalık kapasite.
- Yasal metinlerin hukukçu onayı ve satıcı kimlik bilgileri.
