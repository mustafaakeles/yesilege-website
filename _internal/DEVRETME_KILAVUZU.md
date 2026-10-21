# Yeşil Ege Web Sitesi - Devretme ve Sorumluluk Transferi Kılavuzu

Bu belge, **Yeşil Ege** web sitesinin tüm sahipliğini (Alan adı, Hosting ve Kaynak Kodları) müşteriye/yeni sahibine devretmek için izlenmesi gereken adımları içerir. Bu işlemler tamamlandığında, teknik ve idari tüm sorumluluk devralan tarafa geçer.

## 📋 Ön Hazırlık (Müşteriden İstenmesi Gerekenler)

Devir işlemini başlatmadan önce devralacak kişiden (müşteriden) aşağıdaki hesapları oluşturmasını isteyin:

1.  **Bir GitHub Hesabı:** Kaynak kodları devralmak için. (Ücretsiz)
2.  **Bir Netlify Hesabı:** Web sitesinin yayınını devralmak için. (Ücretsiz Plan yeterli)
3.  **Bir Natro Hesabı:** Alan adını (`yesilege.com.tr`) devralmak için.

---

## 1. Kaynak Kodların Devri (GitHub)

Sitenin kodlarının bulunduğu GitHub deposunun sahipliğini devrederek kod üzerindeki tüm hakları ve geçmişi aktarmış olursunuz.

1.  GitHub'da **yesilege-website** deposuna gidin.
2.  **Settings** (Ayarlar) sekmesine tıklayın.
3.  Sayfanın en altına inin (**Danger Zone** bölümü).
4.  **Transfer ownership** butonuna tıklayın.
5.  Açılan kutucuğa **müşterinin GitHub kullanıcı adını** yazın.
6.  Onaylayın (Genellikle depo adını yazmanızı ister: `mustafaakeles/yesilege-website`).
7.  **Sonuç:** Müşteriye bir e-posta gider. Onayladığında depo tamamen onun hesabına geçer ve sizin repolarınızdan silinir (erişiminiz kalırsa bile artık sahibi o olur).

---

## 2. Web Sitesi Yayınının Devri (Netlify)

Web sitesinin canlı yayınını ve hosting yönetimini devretmek için:

1.  Netlify panelinizde **Yeşil Ege** sitesine girin.
2.  **Site settings** > **General** > **Site details** bölümüne gidin.
3.  **Transfer site** butonuna tıklayın.
4.  Açılan ekrana **müşterinin Netlify e-posta adresini** (veya varsa Team slug'ını) girin.
5.  **Sonuç:** Site, müşterinin Netlify paneline taşınır. Fatura, bant genişliği vb. tüm sorumluluk ona geçer. Sitenin yayını kesilmez.

---

## 3. Alan Adı Devri (Natro)

Domainin (`yesilege.com.tr`) yasal sahipliğinin ve yenileme ödemelerinin devri için en kolay yol **Natro Hesaplar Arası Transfer (Push)** işlemidir.

1.  Natro Müşteri Panelinize giriş yapın.
2.  **Alan Adı Yönetimi** > **Aktif Alan Adlarım** menüsüne gidin.
3.  `yesilege.com.tr` alan adını seçin.
4.  İşlemler menüsünden **Hesaplar Arası Transfer (Push)** seçeneğini bulun.
5.  Devralacak kişinin **Natro Müşteri Numarasını** (veya e-posta adresini) girin.
6.  **Sonuç:** Alan adı anında diğer hesaba geçer. Artık yenileme ücretlerinden ve yönetiminden yeni hesap sorumludur.

---

## ✅ Kontrol Listesi

Devir işlemi bittikten sonra şunları kontrol edin:

- [ ] GitHub reposu artık sizin profilinizde "Owner" olarak görünmüyor mu?
- [ ] Netlify panelinizde site listesinden kalktı mı?
- [ ] Natro panelinizde alan adı listenizden düştü mü?

Bu 3 madde tamamlandığında, teknik olarak proje ile ilgili **hiçbir yasal veya maddi sorumluluğunuz kalmamış olur.** Güle güle kullansınlar!
