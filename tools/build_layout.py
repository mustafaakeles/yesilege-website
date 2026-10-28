"""Ortak üst menü ve alt bilgiyi tüm sayfalara uygular (idempotent).

Kullanım (repo kökünden):  python tools/build_layout.py
Menü/footer değişikliği gerektiğinde bu dosyadaki şablonları düzenleyip tekrar çalıştırın.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# style.css / script.js / mascot.* / motion.* / screens.* / doctor.* değiştiğinde artırın: tarayıcı önbelleğindeki eski dosyaları geçersiz kılar
ASSET_VERSION = "20261028i"

# Navbar hesap bağlantısı: Supabase canlı ortamda kurulup doğrulanınca True yapın (docs/UYELIK_KURULUM.md).
ACCOUNT_LINK_ENABLED = True

# Mağaza: menüde "Projeler" yerine "Mağaza" görünür (docs/superpowers/plans/2026-10-28-eticaret-alt-proje-2-5.md).
SHOP_LINK_ENABLED = True
# Çevrim içi sipariş: sağda sepet simgesi ve footer'da mesafeli satış bağlantıları. Vercel'de ORDERS_OPEN=true ile
# birlikte açılır; kapalıyken mağaza vitrindir (ürünler "Stokta yok"), yasal metinler hukukçu onayını bekler.
ORDERING_ENABLED = False

SERVICES = [
    ("garden-materials", "Bahçe Malzemeleri"),
    ("indoor-plants", "İç Mekan Süs Bitkileri"),
    ("outdoor-plants", "Dış Mekan Süs Bitkileri"),
    ("cactus", "Kaktüs ve Sukulentler"),
    ("pots", "Saksı Grupları"),
    ("landscape", "Peyzaj Tasarım"),
    ("project", "Proje Uygulama"),
]

NAV_ITEMS = [
    ("index.html", "Ana Sayfa"),
    ("services.html", "Hizmetler & Ürünler"),
    ("care.html", "Bakım Rehberi"),
    ("bitki-doktoru.html", "Bitki Doktoru"),
    ("blog.html", "Blog"),
    ("index.html#projeler", "Projeler"),
    ("contact.html", "İletişim"),
]


def nav_items():
    if not SHOP_LINK_ENABLED:
        return NAV_ITEMS
    return [("magaza.html", "Mağaza") if href == "index.html#projeler" else (href, label) for href, label in NAV_ITEMS]


def nav_html(prefix: str, active: str) -> str:
    items = []
    for href, label in nav_items():
        current = ' aria-current="page"' if href == active else ''
        if href == "services.html":
            sub = "\n".join(
                f'                        <li><a href="{prefix}services.html#{anchor}">{text}</a></li>'
                for anchor, text in SERVICES
            )
            items.append(
                f'                <li class="dropdown">\n'
                f'                    <a href="{prefix}services.html" class="dropdown-toggle" aria-haspopup="true" aria-expanded="false"{current}>Hizmetler<span class="nav-extra"> &amp; Ürünler</span> <i class="fas fa-chevron-down" aria-hidden="true"></i></a>\n'
                f'                    <ul class="dropdown-menu">\n{sub}\n                    </ul>\n'
                f'                </li>'
            )
        else:
            items.append(f'                <li><a href="{prefix}{href}"{current}>{label}</a></li>')
    links = "\n".join(items)
    account = (f'                <a href="{prefix}giris.html" class="nav-account" data-account-link aria-label="Giriş yap">'
               '<i class="fas fa-user" aria-hidden="true"></i><span>Giriş</span></a>\n') if ACCOUNT_LINK_ENABLED else ''
    cart = (f'                <a href="{prefix}sepet.html" class="nav-cart" aria-label="Sepetim">'
            '<i class="fas fa-shopping-basket" aria-hidden="true"></i><span class="nav-cart-count" data-cart-count hidden>0</span></a>\n') if ORDERING_ENABLED else ''
    return f'''    <nav class="navbar" id="navbar" aria-label="Ana menü">
        <div class="container nav-content">
            <a href="{prefix}index.html" class="logo" aria-label="Yeşil Ege Peyzaj ana sayfa">
                <img src="{prefix}images/logo-dark.png" alt="Yeşil Ege Peyzaj" width="398" height="160">
            </a>
            <ul class="nav-links" id="nav-links">
{links}
            </ul>
            <div class="nav-actions">
                <a href="tel:+905350805951" class="nav-phone" aria-label="Telefon: 0535 080 59 51"><i class="fas fa-phone-alt" aria-hidden="true"></i><span>0535 080 59 51</span></a>
{cart}{account}                <a href="{prefix}contact.html#teklif" class="btn btn-primary btn-sm">Teklif Alın</a>
                <button class="hamburger" type="button" aria-label="Menüyü aç/kapat" aria-expanded="false" aria-controls="nav-links"><span></span><span></span><span></span></button>
            </div>
        </div>
    </nav>'''


def footer_html(prefix: str, with_newsletter: bool) -> str:
    newsletter = f'''
            <div class="footer-newsletter">
                <h4>Bitki bakım önerileri</h4>
                <p>Mevsimlik bakım ipuçlarımızı ve yeni yazılarımızı blogumuzda bulabilirsiniz.</p>
                <a href="{prefix}blog.html" class="btn btn-ghost">Blogu keşfedin <i class="fas fa-arrow-right" aria-hidden="true"></i></a>
            </div>''' if with_newsletter else ''
    legal = (f' · <a href="{prefix}mesafeli-satis-sozlesmesi.html">Mesafeli Satış Sözleşmesi</a>'
             f' · <a href="{prefix}iade-ve-cayma.html">İade ve Cayma</a>') if ORDERING_ENABLED else ''
    return f'''    <footer>
        <div class="container footer-content">
            <div class="footer-brand">
                <a href="{prefix}index.html" class="logo-footer" aria-label="Yeşil Ege Peyzaj ana sayfa">
                    <img src="{prefix}images/logo-light.png" alt="Yeşil Ege Peyzaj" width="398" height="160" loading="lazy">
                </a>
                <p>1996'dan beri Bayındır'da sera ve fidanlık üretimi, İzmir ve Ege'de peyzaj tasarımı ve bahçe bakımı.</p>
                <div class="footer-social">
                    <a href="https://www.instagram.com/yesilegepeyzaj/" target="_blank" rel="noopener" aria-label="Instagram"><i class="fab fa-instagram" aria-hidden="true"></i></a>
                    <a href="https://wa.me/905350805951" target="_blank" rel="noopener" aria-label="WhatsApp"><i class="fab fa-whatsapp" aria-hidden="true"></i></a>
                    <a href="https://linkedin.com/company/yesilege-peyzaj" target="_blank" rel="noopener" aria-label="LinkedIn"><i class="fab fa-linkedin-in" aria-hidden="true"></i></a>
                </div>
            </div>
            <div class="footer-links">
                <h4>Keşfedin</h4>
                <ul>
                    <li><a href="{prefix}services.html">Hizmetler &amp; Ürünler</a></li>
                    <li><a href="{prefix}index.html#projeler">Projeler</a></li>
                    <li><a href="{prefix}care.html">Bitki Bakım Rehberi</a></li>
                    <li><a href="{prefix}bitki-doktoru.html">Bitki Doktoru</a></li>
                    <li><a href="{prefix}blog.html">Blog</a></li>
                    <li><a href="{prefix}index.html#sss">Sıkça Sorulanlar</a></li>
                </ul>
            </div>
            <div class="footer-contact">
                <h4>İletişim</h4>
                <ul>
                    <li><i class="fas fa-map-marker-alt" aria-hidden="true"></i><a href="https://maps.app.goo.gl/BhpF9Gh1Xto5Y9368" target="_blank" rel="noopener">Karaveliler, Kazım Dirik Cd. No: 225, 35847 Bayındır/İzmir</a></li>
                    <li><i class="fas fa-phone-alt" aria-hidden="true"></i><a href="tel:+905350805951">+90 535 080 59 51</a></li>
                    <li><i class="fas fa-phone-alt" aria-hidden="true"></i><a href="tel:+905323247288">+90 532 324 72 88</a></li>
                    <li><i class="fas fa-clock" aria-hidden="true"></i><span>Hafta içi 09:00 – 18:00</span></li>
                </ul>
            </div>{newsletter}
        </div>
        <div class="footer-bottom">
            <p>&copy; 2026 Yeşil Ege Peyzaj. Tüm hakları saklıdır. · <a href="{prefix}kvkk.html">KVKK Aydınlatma Metni</a>{legal}</p>
            <div class="codera-signature">
                Software &amp; Design by <a href="https://www.codera.com.tr" target="_blank" rel="noopener">CODERA</a>
            </div>
        </div>
    </footer>'''


FONT_LINK = ('<link\n        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500'
             '&family=Inter:wght@400;500;600&display=swap"\n        rel="stylesheet">')

NAV_RE = re.compile(r'[ \t]*(?:<!-- NAV:START -->.*?<!-- NAV:END -->|<nav class="navbar".*?</nav>)', re.S)
FOOTER_RE = re.compile(r'[ \t]*(?:<!-- FOOTER:START -->.*?<!-- FOOTER:END -->|<footer\b.*?</footer>)', re.S)
FONT_RE = re.compile(r'<link\s+href="https://fonts\.googleapis\.com/css2\?[^"]*"\s+rel="stylesheet">', re.S)
GSAP_RE = re.compile(r'[ \t]*(?:<!-- Premium Animation Libraries -->\s*)?<script src="https://cdnjs\.cloudflare\.com/ajax/libs/gsap/[^"]+"[^>]*></script>\r?\n?', re.S)
SLIDER_CSS_RE = re.compile(r'[ \t]*<link rel="stylesheet" href="slider-nav\.css">\r?\n?')
STYLE_BLOCK_RE = re.compile(r'[ \t]*<style>.*?</style>\r?\n?', re.S)
BLOG_BG_RE = re.compile(r"\.blog-detail-header\s*\{[^}]*?background-image:\s*url\('([^']+)'\)", re.S)


SHOP_PAGES = {"urun.html", "sepet.html", "odeme.html"}


def active_for(path: Path) -> str:
    if path.parent.name == "blog-yazilari":
        return "blog.html"
    if path.name in SHOP_PAGES:
        return "magaza.html"
    return path.name


def process(path: Path, check_only: bool = False) -> bool:
    raw = path.read_bytes().decode("utf-8")
    eol = "\r\n" if "\r\n" in raw else "\n"
    text = raw.replace("\r\n", "\n")
    prefix = "../" if path.parent.name == "blog-yazilari" else ""

    if not NAV_RE.search(text):
        return False  # menüsüz sayfa (ör. 404)

    text = NAV_RE.sub(lambda _: nav_html(prefix, active_for(path)), text, count=1)
    text = FOOTER_RE.sub(lambda _: footer_html(prefix, path.name == "index.html"), text, count=1)
    text = FONT_RE.sub(FONT_LINK, text)
    text = GSAP_RE.sub("", text)
    text = SLIDER_CSS_RE.sub("", text)

    # Blog yazıları: kapak görselini inline style niteliğine taşı, sayfa içi <style> bloğunu kaldır
    if path.parent.name == "blog-yazilari":
        bg = BLOG_BG_RE.search(text)
        if bg:
            text = text.replace('<header class="blog-detail-header">',
                                f'<header class="blog-detail-header" style="background-image: url(\'{bg.group(1)}\');">', 1)
        text = STYLE_BLOCK_RE.sub("", text)
    elif path.name in ("care.html", "blog.html"):
        text = STYLE_BLOCK_RE.sub("", text)

    # Erişilebilirlik: içeriğe geç bağlantısı ve <main> sarmalayıcı
    if 'class="skip-link"' not in text:
        text = text.replace("<body>", '<body>\n    <a class="skip-link" href="#main">İçeriğe geç</a>', 1)
    if "<main" not in text:
        text = re.sub(r"(</nav>\n)", r'\1\n    <main id="main">\n', text, count=1)
        text = re.sub(r"(\n[ \t]*<footer>)", r"\n    </main>\n\1", text, count=1)
    elif 'id="main"' not in text:
        text = text.replace("<main", '<main id="main"', 1)

    # Betikleri ertele, CSS/JS adreslerine sürüm ekle (önbellek kırma)
    text = re.sub(r'<script src="((?:\.\./)?(?:script|mascot|screens|doctor)\.js)(?:\?v=\w+)?"( defer)?></script>',
                  rf'<script src="\1?v={ASSET_VERSION}" defer></script>', text)
    text = re.sub(r'<script type="module" src="((?:\.\./)?(?:account|account-shop|shop|cart|yonetim)\.js)(?:\?v=\w+)?"></script>',
                  rf'<script type="module" src="\1?v={ASSET_VERSION}"></script>', text)
    text = re.sub(r'href="((?:\.\./)?(?:style|mascot|motion|screens|doctor|account|shop)\.css)(?:\?v=\w+)?"', rf'href="\1?v={ASSET_VERSION}"', text)
    text = re.sub(r'<script src="((?:\.\./)?motion\.js)(?:\?v=\w+)?"></script>', rf'<script src="\1?v={ASSET_VERSION}"></script>', text)

    # Motion katmanı: style.css'in hemen ardından, <head> içinde senkron (ilk boyamadan önce html sınıflarını kurar)
    if "motion.css" not in text:
        text = re.sub(r'([ \t]*)(<link rel="stylesheet" href="(?:\.\./)?style\.css\?v=\w+">)',
                      rf'\1\2\n\1<link rel="stylesheet" href="{prefix}motion.css?v={ASSET_VERSION}">'
                      rf'\n\1<script src="{prefix}motion.js?v={ASSET_VERSION}"></script>', text, count=1)

    # Magnolia sohbet widget'ı kullanılan her sayfada stilini de yükle
    if "mascot.js" in text and "mascot.css" not in text:
        text = re.sub(r'([ \t]*)(<link rel="stylesheet" href="(?:\.\./)?style\.css\?v=\w+">)',
                      rf'\1\2\n\1<link rel="stylesheet" href="{prefix}mascot.css?v={ASSET_VERSION}">', text, count=1)

    new = text.replace("\n", eol)
    if new != raw:
        if not check_only:
            path.write_bytes(new.encode("utf-8"))
        return True
    return False


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Dosyaları değiştirmeden şablon tutarlılığını denetle")
    args = parser.parse_args()
    pages = sorted(ROOT.glob("*.html")) + sorted((ROOT / "blog-yazilari").glob("*.html"))
    changed = 0
    for page in pages:
        differs = process(page, check_only=args.check)
        changed += differs
        print(("fark var    " if args.check and differs else "güncellendi " if differs else "aynı        ") + str(page.relative_to(ROOT)))
    if args.check and changed:
        raise SystemExit(1)
