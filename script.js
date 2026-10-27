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
    initServiceSubnav();
    initBlogFilter();
    initScrollStrips();
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
// Durum iletisi kalıcıdır ve ekran okuyucular için canlı bölgedir.
function initForms() {
    document.querySelectorAll('form[data-ajax-form]').forEach((form, index) => {
        const btn = form.querySelector('button[type="submit"]');
        if (!btn) return;

        let feedback = form.nextElementSibling?.classList.contains('form-status')
            ? form.nextElementSibling
            : null;

        if (!feedback) {
            feedback = document.createElement('p');
            feedback.className = 'form-feedback';
            btn.insertAdjacentElement('afterend', feedback);
        }
        feedback.id ||= `form-feedback-${index + 1}`;
        feedback.setAttribute('role', 'status');
        feedback.setAttribute('aria-live', 'polite');
        feedback.setAttribute('aria-atomic', 'true');

        const description = btn.getAttribute('aria-describedby');
        btn.setAttribute('aria-describedby', [description, feedback.id].filter(Boolean).join(' '));

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (btn.disabled) return;

            const show = (message, state) => {
                feedback.textContent = message;
                feedback.dataset.state = state;
            };

            btn.disabled = true;
            form.setAttribute('aria-busy', 'true');
            show('Mesajınız gönderiliyor…', 'sending');

            try {
                const response = await fetch(form.getAttribute('action'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(Object.fromEntries(new FormData(form)))
                });
                const result = await response.json().catch(() => ({}));

                if (!response.ok || result.success !== true) {
                    let errorMessage = 'Gönderilemedi. Lütfen telefonla iletişime geçin.';
                    if ((response.status === 400 || response.status === 503) && result.error) {
                        errorMessage = result.error;
                    } else if (response.status === 429) {
                        errorMessage = 'Çok sayıda istek gönderildi. Lütfen biraz sonra tekrar deneyin.';
                    }
                    show(errorMessage, 'error');
                    return;
                }

                show('Talebiniz e-posta gönderim servisine aktarıldı. Yanıt alamazsanız bizi telefonla arayın.', 'success');
                form.reset();
            } catch (error) {
                console.error('Form gönderme hatası:', error);
                show('Bağlantı sorunu oluştu. Lütfen telefonla iletişime geçin.', 'error');
            } finally {
                form.removeAttribute('aria-busy');
                btn.disabled = false;
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

// 8. Hizmetler: kategori şeridinde bulunulan bölümü vurgula, etkin düğmeyi şeritte görünür tut
function initServiceSubnav() {
    const nav = document.querySelector('.svc-subnav');
    if (!nav) return;

    const strip = nav.querySelector('ul');
    const links = [...nav.querySelectorAll('a[href^="#"]')];
    const sections = links.map(link => document.getElementById(link.hash.slice(1))).filter(Boolean);

    const activate = (id) => {
        links.forEach(link => {
            const on = link.hash === '#' + id;
            if (on) link.setAttribute('aria-current', 'true');
            else link.removeAttribute('aria-current');
            // Yalnızca şeridi yatay kaydır; sayfanın dikey konumuna dokunma
            if (on && strip.scrollWidth > strip.clientWidth) {
                strip.scrollTo({ left: link.offsetLeft - (strip.clientWidth - link.offsetWidth) / 2, behavior: 'smooth' });
            }
        });
        if (!id) strip.scrollTo({ left: 0, behavior: 'smooth' });
    };

    // Ekranın üst %40'ını geçmiş son bölüm etkindir; ilk bölüme gelinmeden hiçbiri seçili değildir
    let current = null;
    let ticking = false;
    const update = () => {
        ticking = false;
        const line = window.innerHeight * 0.4;
        const passed = sections.filter(section => section.getBoundingClientRect().top <= line);
        const id = passed.length ? passed[passed.length - 1].id : null;
        if (id !== current) {
            current = id;
            activate(id);
        }
    };
    window.addEventListener('scroll', () => {
        if (!ticking) {
            ticking = true;
            requestAnimationFrame(update);
        }
    }, { passive: true });
    update();
}

// 9. Blog: kartlardaki kategorilerden filtre düğmeleri üret
function initBlogFilter() {
    const bar = document.querySelector('.blog-filters');
    const grid = document.querySelector('.blog-grid');
    if (!bar || !grid) return;

    const status = document.querySelector('.blog-filter-status');
    const cards = [...grid.querySelectorAll('.blog-card')];
    const categoryOf = (card) => card.querySelector('.blog-category')?.textContent.trim() || 'Diğer';
    const counts = cards.reduce((acc, card) => {
        const name = categoryOf(card);
        return { ...acc, [name]: (acc[name] || 0) + 1 };
    }, {});
    const names = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, 'tr'));

    const makeButton = (label, value) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'filter-chip';
        button.dataset.value = value;
        button.setAttribute('aria-pressed', String(value === ''));
        button.textContent = label;
        return button;
    };
    bar.append(makeButton(`Tümü (${cards.length})`, ''), ...names.map(name => makeButton(name, name)));

    bar.addEventListener('click', (e) => {
        const button = e.target.closest('.filter-chip');
        if (!button) return;
        const value = button.dataset.value;
        bar.querySelectorAll('.filter-chip').forEach(chip => chip.setAttribute('aria-pressed', String(chip === button)));
        let shown = 0;
        cards.forEach(card => {
            const match = !value || categoryOf(card) === value;
            card.hidden = !match;
            if (match) shown++;
        });
        grid.classList.toggle('is-filtered', Boolean(value));
        if (status) status.textContent = `${shown} yazı gösteriliyor`;
    });
}

// 10. Yatay kayan şeritler: devamı varsa kenarda solma göster (taşma yalnızca şerit içinde)
function initScrollStrips() {
    document.querySelectorAll('.svc-subnav ul, .blog-filters').forEach(strip => {
        const update = () => {
            const max = strip.scrollWidth - strip.clientWidth;
            strip.classList.toggle('fade-end', max > 2 && strip.scrollLeft < max - 2);
            strip.classList.toggle('fade-start', strip.scrollLeft > 2);
        };
        strip.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
        // Blog düğmeleri DOMContentLoaded'da üretildiği için bir kare sonra ölç
        requestAnimationFrame(update);
    });
}
