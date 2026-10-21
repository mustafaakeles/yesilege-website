# 🌿 Yeşil Ege Web Sitesi — Kapsamlı Analiz & İyileştirme Raporu

> **Tarih:** 12 Şubat 2026
> **Analiz Kapsamı:** index.html, blog.html, services.html, contact.html, care.html, blog-yazilari/*, style.css, mascot.css, slider-nav.css, script.js, mascot.js, sitemap.xml, robots.txt
> **Toplam İncelenen Dosya:** 20+ dosya, ~2000 satır CSS, ~570 satır JS, ~1500 satır HTML

---

## 📖 İçindekiler

1. [Kritik Hatalar (Hemen Düzeltilmesi Gereken)](#1-kritik-hatalar)
2. [Tasarım & UI/UX İyileştirmeleri](#2-tasarım--uiux-iyileştirmeleri)
3. [Performans Optimizasyonları](#3-performans-optimizasyonları)
4. [SEO & Erişilebilirlik](#4-seo--erişilebilirlik)
5. [Kod Kalitesi & Bakımlanabilirlik](#5-kod-kalitesi--bakımlanabilirlik)
6. [Mobil Uyumluluk & Responsive](#6-mobil-uyumluluk--responsive)
7. [İçerik & Tutarlılık](#7-içerik--tutarlılık)
8. [Güvenlik](#8-güvenlik)
9. [Önerilen Yeni Özellikler](#9-önerilen-yeni-özellikler)
10. [Öncelik Tablosu & Yol Haritası](#10-öncelik-tablosu--yol-haritası)

---

## 1. Kritik Hatalar

### 🔴 1.1. İletişim Formu Çalışmıyor
- **Dosya:** `index.html` satır 426
- **Sorun:** Form action değeri `https://formspree.io/f/YOUR_FORM_ID` — placeholder bırakılmış, gerçek bir form ID girilmemiş.
- **Etki:** Ziyaretçilerin gönderdiği mesajlar **hiçbir yere ulaşmıyor**. Bu direkt **müşteri kaybı** demek.
- **Çözüm:** Formspree'de hesap oluşturup gerçek form ID'si ile değiştirilmeli. Alternatif olarak Netlify Forms, EmailJS veya kendi backend'iniz kullanılabilir.

### 🔴 1.2. Contact.html'de Sahte Telefon Numarası
- **Dosya:** `contact.html` satır 92, 188
- **Sorun:** `+90 555 555 55 55` — placeholder telefon numarası bırakılmış. Ana sayfa `index.html`'de doğru numara (`+90 535 080 59 51`) var ama contact.html'de değil.
- **Etki:** SEO ve kullanıcı güveni açısından ciddi sorun. Google My Business ile uyumsuz NAP (Name, Address, Phone) verileri sıralama kaybına neden olur.
- **Çözüm:** Tüm sayfalarda real telefon numarası kullanılmalı (`+90 535 080 59 51` ve `+90 532 324 72 88`).

### 🔴 1.3. Contact.html'de Adres Bilgisi Eksik
- **Dosya:** `contact.html` satır 82
- **Sorun:** Adres "Bayındır Çiçekçilik Bölgesi, İzmir" olarak yazılmış. Ana sayfadaki tam adres: "Karaveliler, Kazım Dirik Cd. No: 231, 35847 Bayındır/İzmir".
- **Çözüm:** Tutarlı adres bilgisi tüm sayfalara yansıtılmalı.

### 🔴 1.4. Contact.html'de Sosyal Medya Linkleri Boş
- **Dosya:** `contact.html` satır 113-115
- **Sorun:** Sosyal medya linkleri hepsi `href="#"` — tıklandığında hiçbir yere gitmiyor.
- **Çözüm:** Gerçek Instagram (`https://www.instagram.com/yesilegepeyzaj/`) ve LinkedIn linkleri eklenmeli. Facebook kaldırılmış ama contact.html'de hala var.

### 🔴 1.5. Blog Yazılarında Logo Tutarsızlığı
- **Dosya:** `blog-yazilari/kis-bahcesi-bakimi.html` satır 81, 150
- **Sorun:** Blog yazılarında logo hala **metin tabanlı** (`Yeşil<span class="highlight">Ege</span>.`), diğer tüm sayfalarda **logo.png** kullanılıyor.
- **Etki:** Marka tutarsızlığı, profesyonel görünümü zedeler.
- **Çözüm:** Tüm blog yazılarında navbar ve footer'da `<img src="../images/logo.png">` kullanılmalı.

### 🔴 1.6. Copyright Yılı Eski
- **Tüm sayfalar**
- **Sorun:** Footer'da `© 2024 Yeşil Ege Peyzaj` yazıyor. 2026 yılındayız.
- **Çözüm:** Dinamik copyright yılı eklemek (`new Date().getFullYear()`) veya manuel olarak 2026 yapılmalı.

---

## 2. Tasarım & UI/UX İyileştirmeleri

### 🟡 2.1. Gallery Overlay Gizlenmiş — Bilgi Kaybı
- **Dosya:** `style.css` satır 1877-1878
- **Sorun:** `.gallery-overlay { display: none !important; }` — Galeri kartlarındaki açıklama metinleri (`Lüks Villa Bahçesi`, `Modern Havuz Başı` vb.) tamamen gizlenmiş.
- **Etki:** Kullanıcı neye baktığını anlamıyor. SEO açısından da kayıp.
- **Öneri:** Overlay'i geri getirin ama **daha minimal** bir tasarımla:
  ```css
  .gallery-overlay {
      opacity: 0;
      transition: opacity 0.4s ease;
      /* display: none kaldırılmalı */
  }
  .gallery-item:hover .gallery-overlay {
      opacity: 1;
  }
  ```

### 🟡 2.2. Features Section — Hero ile Çakışma
- **Dosya:** `style.css` satır 684-690
- **Sorun:** `.features` bölümünün `margin-top: -5rem` değeri hero bölümünün üstüne binmesi için kullanılmış ama mobilde bozulmaya neden olabiliyor.
- **Öneri:** Negatif margin yerine CSS Grid veya transform ile konumlandırma yapılmalı. Feature kartlarına hafif bir gölge ve arka plan gradyanı eklenerek ayrım güçlendirilmeli.

### 🟡 2.3. CTA Bölümü Çok Sade
- **Dosya:** `index.html` satır 374-381
- **Sorun:** CTA (Call to Action) bölümü düz yeşil arka plan üzerine beyaz metin. Görsel etki düşük.
- **Öneri:**
  - Arka plana **subtle bir pattern veya fotoğraf** ekleyin (overlay ile)
  - Buton animasyonu ekleyin (hover'da pulse efekti)
  - Sayı/istatistik ekleyin ("Ücretsiz keşif" yerine "7 gün içinde ücretsiz keşif ziyareti")

### 🟡 2.4. Stats Bölümü — Mobilde Renk Kaybı
- **Dosya:** `style.css` satır 1934-1950
- **Sorun:** Mobilde `.stat-item .number` rengi `var(--color-primary)` (koyu yeşil) olarak override ediliyor, ama arka plan beyaz yapılmış. Genel tasarımla uyumsuz.
- **Öneri:** Mobilde de koyu arka plan üzerine altın (#c59d5f) rengi sayılar tutulmalı veya mobil tasarıma uygun bir kart tasarımı yapılmalı.

### 🟡 2.5. Footer — Newsletter Fonksiyonsuz
- **Dosya:** `index.html` satır 470-477
- **Sorun:** Footer'daki "Bülten" e-posta inputu hiçbir yere bağlı değil. Butona tıklayınca hiçbir şey olmuyor.
- **Öneri:** Ya gerçek bir mail servisine (Mailchimp, Brevo) bağlayın ya da tamamen kaldırın. Çalışmayan bir form güvenilirliği düşürür.

### 🟡 2.6. Services Sayfasının Hero/Header'ı Yok
- **Dosya:** `services.html` satır 58-60
- **Sorun:** Services sayfasının başında bir hero/header bölümü yok. Direkt içerik başlıyor. Diğer sayfalarda hero/header var.
- **Öneri:** Services sayfasına da bir hero bölümü eklemek tutarlılık sağlar:
  ```html
  <header class="page-header" style="background-image: url(...)">
      <div class="overlay-dark"></div>
      <div class="container header-content">
          <h1>Hizmetler & Ürünler</h1>
          <p>Doğanın gücünü yaşam alanlarınıza taşıyoruz.</p>
      </div>
  </header>
  ```

### 🟡 2.7. Blog Kartları — Hover Efekti Yetersiz
- **Dosya:** `blog.html` inline CSS
- **Sorun:** Blog kartlarında hover sadece `translateY(-10px)` yapıyor. Daha çekici bir etkileşim olmalı.
- **Öneri:**
  - Blog görseline zoom efekti (`transform: scale(1.05)`)
  - Kart kenarına accent renk border geçişi
  - Okuma süresi badge'i daha belirgin olmalı
  - Yazar avatarı veya tarih ikonları eklenebilir

### 🟡 2.8. Care.html — mascot.css Eksik
- **Dosya:** `care.html` satır 26
- **Sorun:** `mascot.css` ve `mascot.js` linkleri eksik. Magnolia chatbot bu sayfada çalışmıyor.
- **Çözüm:** `<link rel="stylesheet" href="mascot.css">` ve `<script src="mascot.js"></script>` eklenmeli.

### 🟢 2.9. Preloader Görseli Harici URL
- **Dosya:** `style.css` satır 552
- **Sorun:** Preloader arka plan fotoğrafı Unsplash'ten çekiliyor. Yavaş bağlantıda yüklenmeyebilir.
- **Öneri:** Preloader görseli yerel olarak barındırılmalı veya sadece düz renk arka plan kullanılmalı (zaten üstünde opak overlay var).

### 🟢 2.10. Genel Tipografi İyileştirmeleri
- **Öneri:**
  - Paragraf satır aralığı (line-height) tutarlı hale getirilmeli (şu an `1.6` ve `1.8` karışık)
  - `letter-spacing` değerleri normalize edilmeli
  - Mobilde başlık boyutları kademeli küçülmeli (`clamp()` fonksiyonu kullanılabilir)
  ```css
  .hero h1 {
      font-size: clamp(2rem, 5vw, 4.5rem);
  }
  ```

---

## 3. Performans Optimizasyonları

### 🔴 3.1. Büyük Boyutlu Görseller
- **Sorun:** `images/` klasöründe birçok görsel 700KB-1.1MB arasında (PNG formatında):
  | Dosya | Boyut |
  |-------|-------|
  | `xeriscape_mediterranean_garden_olive.png` | 1.15 MB |
  | `villa_garden_privacy_hedge_bamboo.png` | 1.08 MB |
  | `minimalist_garden_geometric_path.png` | 1.04 MB |
  | `landscape_architecture_project_3d_render.png` | 1.00 MB |
  | `winter_garden_flowers_cyclamen_primula.png` | 1.02 MB |
  | `mulching_garden_winter_protection.png` | 902 KB |
  | `pots_gen.png` | 878 KB |
  | `minimalist_peyzaj_hero.png` | 810 KB |
- **Etki:** Toplam sayfa boyutu çok yüksek. Özellikle mobil kullanıcılarda yavaş yükleme.
- **Çözüm:**
  1. PNG → **WebP** formatına dönüştürün (%60-80 küçülme)
  2. `<picture>` elementi ile fallback sağlayın
  3. Hedef: her görsel **max 200KB** olmalı
  4. `srcset` ile farklı boyutlar sunun
  ```html
  <picture>
      <source srcset="images/villa.webp" type="image/webp">
      <img src="images/villa.jpg" alt="Villa" loading="lazy">
  </picture>
  ```

### 🟡 3.2. Hero Slider'da 10 Tam Ekran Görsel
- **Dosya:** `index.html` satır 91-121
- **Sorun:** Hero section'da **10 adet** tam ekran görsel var. Bunların hepsi sayfa yüklenirken indirilmeye çalışılıyor.
- **Çözüm:**
  1. İlk 2 slide dışındakileri `loading="lazy"` veya JavaScript ile lazy-load yapın
  2. Slider görselleri için ayrı bir array tanımlayıp, sadece aktif slide ve sonraki slide'ı önceden yükleyin
  3. 10 slayt çok fazla. **5-6 slayta düşürün** veya atlıkarınca yerine **tek hero görsel** ile modern bir tasarım tercih edin

### 🟡 3.3. CSS'de Tekrar Eden Kurallar
- **Dosya:** `style.css` satır 129-141
- **Sorun:** Aynı kural **3 kez** tekrarlanmış:
  ```css
  section[id] { scroll-margin-top: 120px; }
  section[id] { scroll-margin-top: 120px; }
  section[id] { scroll-margin-top: 120px; }
  ```
- **Çözüm:** Fazlalıklar silinmeli (sadece 1 tanesi kalmalı).

### 🟡 3.4. Harici CDN Bağımlılıkları
- **Sorun:** Birçok harici CDN kullanılıyor:
  - Font Awesome (6.4.0) — 32 KB+ CSS
  - GSAP (3.12.2) — 68 KB JS
  - GSAP ScrollTrigger — 28 KB JS
  - Lenis (1.0.29) — Yükleniyor ama **kullanılmıyor** (KOD DEVRE DIŞI, satır 50-77)
  - Google Fonts (2 font ailesi)
- **Çözüm:**
  1. **Lenis script'ini tamamen kaldırın** (devre dışı bırakılmış, gereksiz bandwidth tüketiyor)
  2. Font Awesome yerine sadece kullanılan ikonları içeren bir **subset** oluşturun veya **SVG ikonlara** geçin
  3. Google Fonts'u self-host yapın (`@font-face` ile) — GDPR ve hız avantajı

### 🟡 3.5. Mobilde Tüm Animasyonlar Devre Dışı
- **Dosya:** `style.css` satır 1952-1956
- **Sorun:**
  ```css
  @media (max-width: 768px) {
      * {
          animation-duration: 0.1s !important;
          transition-duration: 0.1s !important;
      }
  }
  ```
  Bu kural **tüm** animasyonları öldürüyor. Anlık görünüm/kaybolma oluyor.
- **Çözüm:** Sadece ağır animasyonları hedefleyin, hover ve feedback animasyonlarını koruyun:
  ```css
  @media (max-width: 768px) {
      .feature-card, .service-card, .gallery-item {
          transition-duration: 0.15s !important;
      }
  }
  ```

### 🟢 3.6. Favicon Harici URL
- **Dosya:** `index.html` satır 20
- **Sorun:** Favicon Flaticon CDN'den çekiliyor. Bağlantı kesilirse favicon görünmez.
- **Çözüm:** Favicon'u yerel olarak barındırın ve birden fazla boyut sağlayın:
  ```html
  <link rel="icon" type="image/png" sizes="32x32" href="images/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="images/favicon-16x16.png">
  <link rel="apple-touch-icon" href="images/apple-touch-icon.png">
  ```

---

## 4. SEO & Erişilebilirlik

### 🔴 4.1. Services.html'de Meta Description Eksik
- **Dosya:** `services.html`
- **Sorun:** `<meta name="description">` etiketi hiç yok.
- **Çözüm:** Eklenmeli:
  ```html
  <meta name="description" content="Yeşil Ege - Peyzaj tasarımı, bitki üretimi, bahçe bakımı, sulama sistemleri ve toptan/perakende satış hizmetleri. İzmir Bayındır.">
  ```

### 🔴 4.2. Contact.html Sitemap'te Yok
- **Dosya:** `sitemap.xml`
- **Sorun:** `contact.html` sitemap'e dahil edilmemiş. Google tarayıcısı bu sayfayı görmeyebilir.
- **Çözüm:** Sitemap'e eklenmeli:
  ```xml
  <url>
      <loc>https://yesilege.com.tr/contact.html</loc>
      <changefreq>monthly</changefreq>
      <priority>0.8</priority>
  </url>
  ```

### 🟡 4.3. Open Graph Görselleri Harici URL
- **Dosya:** `index.html` satır 15, `blog.html` satır 13
- **Sorun:** OG image URL'leri Unsplash'ten çekiliyor. Paylaşımlarda görseller yüklenmeyebilir.
- **Çözüm:** OG görselleri yerel olarak barındırın ve orijinal URL'yi kullanın:
  ```html
  <meta property="og:image" content="https://yesilege.com.tr/images/og-image.jpg">
  ```

### 🟡 4.4. Erişilebilirlik (a11y) Eksiklikleri
| Sorun | Konum | Çözüm |
|-------|-------|-------|
| Slider butonlarında `aria-label` yok | `index.html` satır 128-129 | `aria-label="Önceki slayt"` / `aria-label="Sonraki slayt"` ekleyin |
| Form select'inde `aria-label` yok | `index.html` satır 434 | `aria-label="Konu seçin"` ekleyin |
| Lightbox'ta focus trap yok | `script.js` | Lightbox açıkken Tab tuşu dışarı çıkmamalı |
| Gallery görselleri alt text yetersiz | `index.html` | Daha açıklayıcı alt text'ler yazılmalı |
| Contact.html hero görseli kırık URL | `contact.html` satır 56 | URL'de "photo-1423666639041-f14d7045b5bddd" — fazla "d" harfi var, görsel yüklenmiyor olabilir |
| `lang` attribute tutarlılığı | Tüm sayfalar | Hepsi `tr` — ✅ Doğru |
| `skip-to-content` linki yok | Tüm sayfalar | Ekran okuyucu kullanıcıları için `<a href="#main" class="skip-link">İçeriğe Atla</a>` |

### 🟡 4.5. Structured Data (Schema.org) Eksik
- **Sorun:** Hiçbir sayfada yapılandırılmış veri yok.
- **Çözüm:** Aşağıdaki schema'lar eklenebilir:
  - **LocalBusiness** schema (ana sayfa) — Google Maps ve aramada zengin sonuç
  - **Article** schema (blog yazıları) — arama sonuçlarında tarih, yazar gösterimi
  - **BreadcrumbList** schema (alt sayfalar) — navigasyon izi
  ```html
  <script type="application/ld+json">
  {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      "name": "Yeşil Ege Peyzaj",
      "address": {
          "@type": "PostalAddress",
          "streetAddress": "Karaveliler, Kazım Dirik Cd. No: 231",
          "addressLocality": "Bayındır",
          "addressRegion": "İzmir",
          "postalCode": "35847"
      },
      "telephone": "+905350805951",
      "url": "https://yesilege.com.tr",
      "image": "https://yesilege.com.tr/images/logo.png"
  }
  </script>
  ```

### 🟡 4.6. Canonical URL Eksik
- **Tüm sayfalar**
- **Sorun:** `<link rel="canonical">` etiketi hiçbir sayfada yok.
- **Çözüm:**
  ```html
  <link rel="canonical" href="https://yesilege.com.tr/">
  ```

---

## 5. Kod Kalitesi & Bakımlanabilirlik

### 🟡 5.1. CSS Dosyası Çok Büyük ve Karmaşık
- **Dosya:** `style.css` — **1957 satır, 40.5KB**
- **Sorunlar:**
  - Tekrar eden kurallar (scroll-margin-top 3 kez)
  - Farklı sayfaların stilleri tek bir dosyada (contact page styles, services page styles)
  - Aşırı `!important` kullanımı (özellikle mobil menü bölümünde 20+ kez)
  - Yorum satırları tutarsız (bazıları İngilizce, bazıları Türkçe)
- **Öneri:**
  1. CSS'i modüllere bölün: `base.css`, `components.css`, `pages/contact.css` vb.
  2. `!important` kullanımını minimize edin — specificity sorunlarını kökten çözün
  3. CSS Custom Properties'i daha fazla kullanın (renk geçişleri, gölgeler, boşluklar)

### 🟡 5.2. Inline Style Kullanımı
- **Birçok dosyada** `style="..."` inline stiller kullanılmış:
  - `index.html` satır 49: `style="width: 120px; height: auto;"`
  - `index.html` satır 62-63: `style="font-size: 0.7em;"`
  - Blog yazılarında metinler inline style ile biçimlendirilmiş
- **Çözüm:** Tüm inline style'lar CSS class'larına taşınmalı.

### 🟡 5.3. Blog Sayfaları İçinde Inline CSS
- **Dosya:** `blog.html`, `care.html`
- **Sorun:** `<style>` etiketleri içinde sayfa-özel CSS yazılmış (~100 satır). Her sayfada tekrar ediyor.
- **Çözüm:** `blog.css`, `care.css` gibi ayrı dosyalara taşınmalı.

### 🟡 5.4. Duplicate CSS Selektörleri
- **Dosya:** `style.css`
- **Sorun:** Aşağıdaki CSS blokları çift veya çelişkili tanımlanmış:
  - `.gallery-item` → satır 927 ve satır 1854 (iki kere tanımlanmış)
  - `.gallery-item img` → satır 940 ve satır 1864 (iki kere tanımlanmış, farklı transition)
  - `.gallery-item:hover img` → `scale(1.1)` ve `scale(1.05)` çelişkili
  - `.form-group input` → satır 1136 ve satır 1806 (iki kere tanımlanmış)
  - `.preloader` → satır 545 ve satır 1548 (iki kere tanımlanmış)
  - `.loader-text` → satır 582 ve satır 1562 (iki kere tanımlanmış)
  - `.footer-bottom` → satır 1249 ve satır 1906 (farklı stiller, çakışma potansiyeli)
- **Çözüm:** CSS dosyası refactor edilmeli, duplicate kurallar birleştirilmeli.

### 🟡 5.5. JavaScript'te Devre Dışı Kod
- **Dosya:** `script.js` satır 48-77
- **Sorun:** Lenis smooth scroll kodu tamamen **yorum satırına** alınmış ama dosyadan silinmemiş. İlgili script dosyası hala `<head>`'de yükleniyor.
- **Çözüm:** Ya Lenis'i etkinleştirin ya da hem yorum satırlarını hem de `<script>` etiketini kaldırın.

### 🟢 5.6. Navbar Tutarsızlığı (Header Yapısı)
- **Sorun:** Her sayfada navbar farklı yapıda. Dropdown linkleri, aktif sayfa gösterimi ve menü öğeleri sayfadan sayfaya değişiyor.
  | Sayfa | Dropdown İçeriği | Eksik Öğe |
  |-------|-----------------|-----------|
  | `index.html` | 7 alt menü | Konum ikonu var |
  | `blog.html` | 7 alt menü | Konum ikonu yok |
  | `contact.html` | 4 alt menü (3 eksik!) | Projeler linki yok, Konum ikonu yok |
  | `care.html` | 7 alt menü | Konum ikonu yok, "Bitki Bakım Rehberi" fazladan menü |
  | `services.html` | 7 alt menü | Konum ikonu yok |
- **Çözüm:** Navbar'ı bir **şablon/partial** haline getirin. Tüm sayfalarda aynı HTML yapısı kullanılmalı. JavaScript ile `include` veya build tool kullanılabilir.

---

## 6. Mobil Uyumluluk & Responsive

### 🟡 6.1. Mobil Menü — `!important` Bombardımanı
- **Dosya:** `style.css` satır 1256-1410
- **Sorun:** Mobil menüde **20'den fazla `!important`** kullanılmış. Bu, gelecekte stil değişikliğini neredeyse imkansız hale getiriyor.
- **Öneri:** Specificity sorunlarını kökten çözmek için:
  ```css
  /* Yerine: */
  .navbar .nav-links.mobile-open { ... } /* !important olmadan */
  ```

### 🟡 6.2. `page-header` Stili — Contact ve Care Sayfaları
- **Sorun:** `contact.html`'deki `.page-header` inline style ile `background-image` alıyor ama bu CSS class'ı `style.css`'te tanımlı değil. Sadece `care.html` **içinde** `<style>` bloğunda tanımlı.
- **Çözüm:** `.page-header` stilini `style.css`'e taşıyın, tüm alt sayfalar için kullanılabilir hale getirin.

### 🟡 6.3. Tablet Breakpoint Eksik
- **Sorun:** Mevcut breakpoint'ler:
  - `1024px` (mobil nav)
  - `900px` (grid düzenleme)
  - `768px` (performans, slider)
  - `600px` (tek sütun)
- Tablet boyutlarında (768-1024px arası) bazı bileşenler sıkışık görünebilir.
- **Çözüm:** `768px` ve `1024px` arası için özel tablet tasarımı yapılmalı.

### 🟡 6.4. Hero Butonlar Mobilde Yan Yana Sığamıyor
- **Sorun:** "Projelerimiz" ve "Randevu Alın" butonları mobilde yan yana kalıyor, ekrandan taşabilir.
- **Çözüm:**
  ```css
  @media (max-width: 600px) {
      .hero-btns {
          flex-direction: column;
          align-items: center;
          gap: 0.8rem;
      }
  }
  ```

---

## 7. İçerik & Tutarlılık

### 🟡 7.1. Sayfa Arası Navigasyon Kopukluğu
- **Sorun:**
  - `care.html` ana navigasyondan bağlantılı değil (hiçbir sayfada link yok)
  - `contact.html` ana sayfada sadece `#contact` anchor'ına yönlendirme var, ayrı sayfaya link yok
  - `devir-teslim.html` navigationda hiç yok
- **Çözüm:** Site haritasını netleştirin ve tüm sayfaları navigasyona dahil edin.

### 🟡 7.2. Footer Tutarsızlıkları
| Sayfa | Footer Yapısı | Newsletter | Codera İmza |
|-------|---------------|-----------|-------------|
| `index.html` | 3 sütun (Brand, Links, Newsletter) | ✅ Var | ✅ Var |
| `blog.html` | 2 sütun (Brand, Links) | ❌ Yok | ✅ Var |
| `services.html` | 2 sütun (Brand, Links) | ❌ Yok | ✅ Var |
| `contact.html` | 3 sütun (Brand, Links, Contact) | ❌ Yok | ✅ Var |
| `care.html` | 2 sütun (Brand, Links) | ❌ Yok | ✅ Var |

- **Çözüm:** Tüm sayfalarda aynı footer yapısı kullanılmalı.

### 🟡 7.3. Blog Yazılarında `villa-bahce-trendleri-2026.html` Kontrol
- **blog-yazilari** klasöründe **11 adet uploaded_media dosyası** var — bunlar muhtemelen gereksiz dosyalar.
- Temizlenmeli ve kullanılmayan görseller silinmeli.

### 🟢 7.4. Blog Yazıları — İçerik Zenginleştirme
- Mevcut blog yazıları iyi ama geliştirilebilir:
  - **İlişkili yazılar** bölümü ekleyin
  - **Paylaşım butonları** ekleyin (WhatsApp, Instagram, X)
  - **İçindekiler** listesi ekleyin (uzun yazılar için)
  - Yazar bilgisi ve profil fotoğrafı ekleyin

---

## 8. Güvenlik

### 🟡 8.1. Harici Kaynaklarda `integrity` Hash Eksik
- **Tüm sayfalar**
- **Sorun:** CDN'den yüklenen script ve CSS dosyalarında SRI (Subresource Integrity) hash'i yok:
  ```html
  <!-- Mevcut: -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
  
  <!-- Olması gereken: -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"
          integrity="sha512-..." crossorigin="anonymous"></script>
  ```
- **Çözüm:** Tüm CDN kaynaklarına `integrity` ve `crossorigin="anonymous"` ekleyin.

### 🟡 8.2. Magnolia Chatbot — XSS Riski
- **Dosya:** `mascot.js` satır 97-101
- **Sorun:** `appendMessage()` fonksiyonunda `div.textContent = text;` kullanılıyor — bu güvenli. ✅
- Ancak `generateResponse()` fonksiyonunun döndürdüğü değer de `textContent` ile ekleniyor, bu da güvenli. ✅
- **Not:** Eğer ileride HTML içeren yanıtlar döndürülürse `innerHTML` kullanılmamalı.

### 🟢 8.3. Form CSRF Koruması
- **Sorun:** İletişim formunda CSRF token yok. Formspree bunu kendi tarafında yönetiyor ama özel backend kullanılırsa gerekli.
- **Not:** Şu an Formspree kullanıldığı için acil risk yok.

---

## 9. Önerilen Yeni Özellikler

### 💡 9.1. Testimonial / Müşteri Yorumları Bölümü
- Ana sayfaya Google Reviews veya manuel müşteri referansları ekleyin
- Slider formatında 3-5 müşteri yorumu gösterin
- Güven oluşturur, dönüşüm oranını artırır

### 💡 9.2. Before/After (Öncesi/Sonrası) Galeri
- Peyzaj projelerinin öncesi ve sonrası karşılaştırmalı görselleri
- İnteraktif slider ile (ortadaki çizgiyi sürükleyerek karşılaştırma)
- Çok etkileyici ve dönüşüm artırıcı

### 💡 9.3. Hizmet Fiyatlandırma Tablosu
- Yaklaşık fiyat aralıkları veya "başlangıç fiyatı" bilgileri
- Müşteri beklentisini yönetir ve gereksiz iletişimi azaltır

### 💡 9.4. "Sık Sorulan Sorular" (FAQ) Bölümü
- Ana sayfada veya ayrı bir sayfada
- SEO açısından çok değerli (Google FAQ schema)
- Accordion formatında

### 💡 9.5. Google Maps Entegrasyonu — Ana Sayfa
- Ana sayfanın contact bölümüne küçük bir harita embed'i
- Contact.html'deki harita embed'i var ama ana sayfada yok

### 💡 9.6. Proje Detay Sayfaları
- Galeri bölümündeki projelere tıklanınca detaylı proje sayfasına geçiş
- Her proje için: açıklama, öncesi/sonrası, kullanılan bitkiler, süre

### 💡 9.7. Dark Mode Desteği
- `prefers-color-scheme: dark` media query ile otomatik dark mode
- Modern ve premium bir özellik

---

## 10. Öncelik Tablosu & Yol Haritası

### 🔴 Acil (Bu Hafta)
| # | İş | Dosya | Tahmini Süre |
|---|-----|-------|-------------|
| 1 | Form action'ı düzelt (Formspree ID) | `index.html` | 15 dk |
| 2 | [x] Contact.html telefon/adres güncelle | `contact.html` | 15 dk |
| 3 | [x] Contact.html sosyal medya linkleri | `contact.html` | 10 dk |
| 4 | [x] Blog yazıları logo güncelle (5 dosya) | `blog-yazilari/*.html` | 30 dk |
| 5 | [x] Copyright yılını 2026 yap | Tüm sayfalar | 15 dk |
| 6 | [x] Sitemap'e contact.html ekle | `sitemap.xml` | 5 dk |
| 7 | [x] Services.html meta description ekle | `services.html` | 5 dk |

### 🟡 Kısa Vadeli (1-2 Hafta)
| # | İş | Tahmini Süre |
|---|-----|-------------|
| 8 | Görselleri WebP'ye dönüştür | 2 saat |
| 9 | [x] Lenis script'ini kaldır | 15 dk |
| 10 | [x] CSS duplicate kuralları temizle | 1 saat |
| 11 | [x] Gallery overlay'i geri getir (minimal) | 30 dk |
| 12 | [x] Favicon'u yerel dosyaya taşı | 30 dk |
| 13 | [x] Services sayfasına hero ekle | 45 dk |
| 14 | [x] Navbar'ı tüm sayfalarda eşitle (Blog dahil) | 1 saat |
| 15 | [x] Footer'ı tüm sayfalarda eşitle | 1 saat |
| 16 | [x] Care.html'e mascot ekle | 10 dk |
| 17 | [x] Canonical URL ekle (tüm sayfalar) | 30 dk |

### 🟢 Orta Vadeli (2-4 Hafta)
| # | İş | Tahmini Süre |
|---|-----|-------------|
| 18 | CSS modüler yapıya bölme | 3 saat |
| 19 | Schema.org structured data ekle | 2 saat |
| 20 | Inline style'ları CSS'e taşı | 2 saat |
| 21 | Hero slider'ı optimize et (5 slide) | 1 saat |
| 22 | CDN'lere SRI hash ekle | 1 saat |
| 23 | Erişilebilirlik (a11y) düzeltmeleri | 2 saat |
| 24 | CTA bölümünü zenginleştir | 1 saat |
| 25 | Blog yazılarına paylaşım butonları | 1 saat |

### 💡 Uzun Vadeli (4-8 Hafta)
| # | İş | Tahmini Süre |
|---|-----|-------------|
| 26 | Testimonial/Müşteri yorumları ekleme | 4 saat |
| 27 | Before/After galeri özelliği | 6 saat |
| 28 | FAQ bölümü + Schema | 3 saat |
| 29 | Proje detay sayfaları | 8 saat |
| 30 | Dark mode desteği | 4 saat |
| 31 | Newsletter entegrasyonu (gerçek) | 3 saat |
| 32 | Google Analytics / Tag Manager | 1 saat |

---

## 📊 Genel Puan Tablosu

| Kategori | Mevcut Puan | Hedef Puan | Açıklama |
|----------|------------|------------|----------|
| **Tasarım/UI** | ⭐⭐⭐⭐ (7/10) | 9/10 | Güzel tema, premium hissi var. CTA ve Gallery geliştirilebilir |
| **Performans** | ⭐⭐⭐ (5/10) | 8/10 | Büyük görseller ve gereksiz scriptler performansı düşürüyor |
| **SEO** | ⭐⭐⭐ (6/10) | 9/10 | Temel SEO yapılmış ama schema, canonical, OG image eksik |
| **Erişilebilirlik** | ⭐⭐ (4/10) | 7/10 | Aria label, skip link, focus management eksik |
| **Kod Kalitesi** | ⭐⭐⭐ (5/10) | 8/10 | CSS karmaşık, duplicate kurallar, tutarsız yapı |
| **Mobil Uyumluluk** | ⭐⭐⭐⭐ (7/10) | 9/10 | Mobil menü çalışıyor ama animasyon kaybı ve !important sorunları var |
| **İçerik** | ⭐⭐⭐⭐ (7/10) | 9/10 | Blog zengin ama form çalışmıyor, bilgi tutarsızlıkları var |
| **Güvenlik** | ⭐⭐⭐ (6/10) | 8/10 | SRI hash eksik, form koruması Formspree'ye emanet |

> **Toplam Skor:** 47/80 → **%59**
> **Hedef Skor:** 67/80 → **%84**

---

*Bu rapor, sitenin tüm dosyalarının satır satır incelenmesi sonucu hazırlanmıştır. Sorularınız veya öncelik değişiklikleri için iletişime geçin.*

*Son Güncelleme: 12 Şubat 2026*
