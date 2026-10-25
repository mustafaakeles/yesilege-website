// Yeşil Ege Peyzaj — site etkileşimleri (bağımlılıksız)
// Reveal, giriş ve sayfa geçişi animasyonları motion.js'tedir.

document.addEventListener('DOMContentLoaded', () => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    initNavbar();
    initMobileMenu();
    initCounters(prefersReducedMotion);
    initHeroSlider(prefersReducedMotion);
    initForms();
    initLightbox();
});

// 1. Navbar: kaydırınca gölge
function initNavbar() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    const update = () => navbar.classList.toggle('scrolled', window.scrollY > 10);
    update();
    window.addEventListener('scroll', update, { passive: true });
}

// 2. Mobil menü ve açılır alt menü
function initMobileMenu() {
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');
    if (!hamburger || !navLinks) return;

    const isMobile = () => window.matchMedia('(max-width: 960px)').matches;

    const setOpen = (open) => {
        navLinks.classList.toggle('mobile-open', open);
        hamburger.setAttribute('aria-expanded', String(open));
        document.body.classList.toggle('menu-open', open);
        if (!open) {
            document.querySelectorAll('.dropdown.active').forEach(d => d.classList.remove('active'));
            document.querySelectorAll('.dropdown-toggle').forEach(toggle => toggle.setAttribute('aria-expanded', 'false'));
        }
    };

    hamburger.addEventListener('click', () => setOpen(!navLinks.classList.contains('mobile-open')));

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navLinks.classList.contains('mobile-open')) {
            setOpen(false);
            hamburger.focus();
        }
    });

    // Menüdeki bir bağlantıya (alt menü başlığı hariç) tıklanınca kapat
    navLinks.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link && !link.classList.contains('dropdown-toggle') && isMobile()) setOpen(false);
    });

    // Mobilde alt menü başlığı açılır/kapanır; masaüstünde normal bağlantı
    document.querySelectorAll('.dropdown-toggle').forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            if (!isMobile()) return;
            e.preventDefault();
            const parent = toggle.closest('.dropdown');
            const open = !parent.classList.contains('active');
            parent.classList.toggle('active', open);
            toggle.setAttribute('aria-expanded', String(open));
        });
    });

    window.addEventListener('resize', () => {
        if (!isMobile() && navLinks.classList.contains('mobile-open')) setOpen(false);
    });
}

// 3. Rakam sayaçları
function initCounters(reducedMotion) {
    const numbers = document.querySelectorAll('.stat-item .number[data-target]');
    // motion.js etkinse anasayfadaki rulo sayaçlar (screens.js) devreye girer
    if (!numbers.length || reducedMotion || !('IntersectionObserver' in window)) return;
    if (document.documentElement.classList.contains('motion')) return;

    const format = (n) => n.toLocaleString('tr-TR');
    const animate = (el) => {
        const target = Number(el.dataset.target);
        const suffix = el.dataset.suffix || '';
        const duration = 1600;
        const start = performance.now();
        const step = (now) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = format(Math.round(target * eased)) + suffix;
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animate(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    numbers.forEach(n => observer.observe(n));
}

// 4. Hero slider (ilk görsel hariç diğerleri sırası gelince yüklenir)
function initHeroSlider(reducedMotion) {
    const slides = document.querySelectorAll('.hero-slider .slide');
    if (slides.length < 2) return;

    const prevBtn = document.querySelector('.nav-btn.prev');
    const nextBtn = document.querySelector('.nav-btn.next');
    const intervalTime = 6500;
    let current = 0;
    let timer = null;

    const loadSlide = (index) => {
        const slide = slides[index];
        if (slide && slide.dataset.bg) {
            slide.style.backgroundImage = `url('${slide.dataset.bg}')`;
            delete slide.dataset.bg;
        }
    };

    const goTo = (index) => {
        const next = (index + slides.length) % slides.length;
        if (next === current) return;
        loadSlide(next);
        loadSlide((next + 1) % slides.length);
        slides[current].classList.remove('active');
        slides[next].classList.add('active');
        current = next;
    };

    const restart = () => {
        clearInterval(timer);
        if (!reducedMotion) timer = setInterval(() => goTo(current + 1), intervalTime);
    };

    nextBtn?.addEventListener('click', () => { goTo(current + 1); restart(); });
    prevBtn?.addEventListener('click', () => { goTo(current - 1); restart(); });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) clearInterval(timer);
        else restart();
    });

    window.addEventListener('load', () => loadSlide(1));
    restart();
}

// 5. Formlar (Vercel Function /api/contact)
// Bülten gibi kompakt formlar sonucu buton yerine yandaki .form-status alanında gösterir.
function initForms() {
    document.querySelectorAll('form[data-ajax-form]').forEach(form => {
        const status = form.nextElementSibling?.classList.contains('form-status') ? form.nextElementSibling : null;
        const messages = { success: 'Mesajınız iletildi! ✓', error: 'Gönderilemedi, lütfen bizi arayın.' };

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            const originalHTML = btn.innerHTML;
            let errorText = messages.error;

            const show = (text, color) => {
                if (status) {
                    status.textContent = text;
                } else {
                    btn.textContent = text;
                    btn.style.backgroundColor = color;
                }
            };

            show('Gönderiliyor...', '');
            btn.disabled = true;

            try {
                const response = await fetch(form.getAttribute('action'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(Object.fromEntries(new FormData(form)))
                });
                const result = await response.json().catch(() => ({}));

                if (!response.ok || !result.success) {
                    // Sunucunun doğrulama mesajını (400) göster, diğer durumlarda genel metin
                    if (response.status === 400 && result.error) errorText = result.error;
                    throw new Error(`Form gönderilemedi (HTTP ${response.status})`);
                }
                show(messages.success, '#2c5244');
                form.reset();
            } catch (error) {
                console.error(error);
                show(errorText, '#8a4a29');
            } finally {
                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                    btn.style.backgroundColor = '';
                    btn.disabled = false;
                    if (status) status.textContent = '';
                }, 4000);
            }
        });
    });
}

// 6. Galeri lightbox
function initLightbox() {
    const items = document.querySelectorAll('.gallery-item');
    if (!items.length) return;

    const lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-modal', 'true');
    lightbox.setAttribute('aria-label', 'Galeri görseli');
    lightbox.setAttribute('aria-hidden', 'true');
    lightbox.innerHTML = '<button class="lightbox-close" aria-label="Kapat">&times;</button><img alt="">';
    document.body.appendChild(lightbox);

    const img = lightbox.querySelector('img');
    const closeBtn = lightbox.querySelector('.lightbox-close');
    let lastFocus = null;
    let previousOverflow = '';

    const open = (item) => {
        const source = item.querySelector('img');
        if (!source) return;
        lastFocus = item;
        previousOverflow = document.body.style.overflow;
        img.src = source.currentSrc || source.src;
        img.alt = source.alt;
        lightbox.classList.add('active');
        lightbox.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        closeBtn.focus();
    };

    const close = () => {
        lightbox.classList.remove('active');
        lightbox.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = previousOverflow;
        lastFocus?.focus();
    };

    items.forEach(item => {
        item.addEventListener('click', () => open(item));
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open(item);
            }
        });
    });

    closeBtn.addEventListener('click', close);
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) close(); });
    document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('active')) return;
        if (e.key === 'Escape') close();
        // Diyalogda tek etkileşimli öğe kapatma düğmesi; Tab ile arka plana kaçılmasın.
        if (e.key === 'Tab') {
            e.preventDefault();
            closeBtn.focus();
        }
    });
}
