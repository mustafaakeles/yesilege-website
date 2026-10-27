# Yeşil Ege: Google/Bing görünürlüğü ve kurumsal e-posta kurulum kontrolü

## 26 Ekim 2026 doğrulanan durum
- Web sitesinin A kaydı: `76.76.21.21` (Vercel).
- DNS yetkili ad sunucuları: `lakas.ns.cloudflare.com`, `tia.ns.cloudflare.com`.
- `yesilege.com.tr` alanının MX kayıtları yok. Gelen `info@` ve `form@` postaları teslim edilemez; Gmail posta teslimini web sitesi IP adresinde deneyip zaman aşımına düşer.
- DNS TXT kaydı da sorgulama sırasında bulunmadı. SPF, DKIM, DMARC ve alan doğrulamaları yapılandırılmalıdır.
- GitHub/Vercel kaynak kodu DNS yönetim panelini değiştirmez. Site kodunda kurumsal MX kontrolü ve çalışır harici alıcıya yönlendirme koruması bulunmaktadır.

## İşletme sahibinin veya DNS yetkilisinin yapması gerekenler
1. Hangi e-posta sağlayıcısını kullanacağınızı belirleyin (ör. Google Workspace, Microsoft 365, Zoho veya barındırma firmanız).
2. Cloudflare > yesilege.com.tr > DNS sayfasında **yalnızca seçilen sağlayıcının resmî MX kayıtlarını**, doğru öncelikleriyle oluşturun. Site A kaydına ve Vercel yönlendirmesine dokunmayın.
3. E-posta sağlayıcının verdiği SPF, DKIM ve DMARC TXT kayıtlarını sağlayıcının yönergesine göre ekleyin. SPF kaydını rastgele iki ayrı kayıt halinde eklemeyin.
4. Vercel > Project > Settings > Environment Variables: `RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `CONTACT_FROM_EMAIL` değerlerinin gerçekten kullanılacak ve doğrulanmış adreslerle uyumlu olduğunu kontrol edin. Anahtarları kaynağa veya GitHub issue'larına yazmayın.
5. `CONTACT_TO_EMAIL` için aktif bir **harici yedek teslimat adresi** kullanmak, kurumsal posta kurulumu tamamlanana kadar teklif kaybını önlemeye yardımcı olur.
6. Üyelik sistemindeki doğrulama ve şifre sıfırlama e-postaları da bu DNS kayıtlarına bağlıdır; kurulum adımları için `docs/UYELIK_KURULUM.md`.
7. DNS MX görünür olduktan sonra harici Gmail hesabından `info@` ve `form@` adreslerine gerçek test e-postası gönderin. Gelen kutusuna ulaştığını doğrulayın. Ardından test teklif formu göndererek formun *gerçekten* hedef gelen kutuya ulaştığını kontrol edin.

## Google ve Bing
1. Google Search Console'da **domain property** ekleyin; verilen TXT doğrulama değerini Cloudflare DNS'e yerleştirin. `https://yesilege.com.tr/sitemap.xml` gönderin.
2. Bing Webmaster Tools'da alan adını doğrulayın veya Search Console mülkünü içe aktarın. Aynı site haritasını gönderin.
3. IndexNow anahtarı web kökünde `/875d02a249d9bc85e542d6304848d337.txt` olarak barındırılır. Dağıtım doğrulandıktan sonra `https://www.indexnow.org/` üzerinden gönderim yapılabilir. Bu Bing uyumlu sistem içindir; Google'ın Search Console doğrulamasının yerini tutmaz.
4. Gerçek işletme için Google İşletme Profili sahiplik talebini resmî Google sürecinde sürdürün. Adres No:225, telefonlar 0535 080 59 51 / 0532 324 72 88 tutarlı kalmalı; komşu işletmenin No:231 kaydıyla karıştırılmamalıdır.
5. Gerçek proje fotoğrafları, izinli müşteri referansları, özgün hizmet/ürün açıklamaları ve gerçek yorumlarla içerikleri düzenli güncelleyin. Arama sonuçlarında birincilik garanti edilemez.
