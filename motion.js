// Yeşil Ege Peyzaj — motion katmanı ("Sera" konsepti, bağımlılıksız)
// <head> içinde senkron yüklenir: ilk boyamadan önce html sınıflarını kurar, gerisi DOMContentLoaded'da çalışır.
// Hareket azaltma tercihi varsa hiçbir şey yapmaz; içerik style.css ile olduğu gibi görünür.

(() => {
    'use strict';

    const root = document.documentElement;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const store = {
        get: (key) => { try { return sessionStorage.getItem(key); } catch { return null; } },
        set: (key, value) => { try { sessionStorage.setItem(key, value); } catch { /* gizli sekme: yok say */ } }
    };

    root.classList.add('motion');
    if (store.get('ye-curtain') === '1') {
        root.classList.add('cur-on');
        store.set('ye-curtain', '0');
    } else if (store.get('ye-intro') !== '1') {
        root.classList.add('pl-on');
    }

    // "ready": preloader/perde çekildi, giriş animasyonları başlayabilir
    let isReady = false;
    const readyFns = [];
    const markReady = () => {
        if (isReady) return;
        isReady = true;
        root.classList.add('is-ready');
        readyFns.forEach(fn => fn());
    };
    const onReady = (fn) => (isReady ? fn() : readyFns.push(fn));
    // Emniyet: bir şey takılsa bile içerik gizli kalmasın
    setTimeout(markReady, 4000);

    document.addEventListener('DOMContentLoaded', () => {
        initReveal();
        initSeraCanvases();
        initHeroParallax();
        initScrollVine();
        initMagnetic();
        initGlowCards();
        initPageTransitions();
        startIntro();
    });

    // 1. Giriş: sayfa geçiş perdesi ya da (oturumda bir kez) filizlenen preloader
    function startIntro() {
        if (root.classList.contains('cur-on')) {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                root.classList.add('cur-lift');
                markReady();
                setTimeout(() => root.classList.remove('cur-on', 'cur-lift'), 900);
            }));
            return;
        }

        const preloader = document.querySelector('.preloader');
        if (!root.classList.contains('pl-on') || !preloader) {
            root.classList.remove('pl-on');
            markReady();
            return;
        }

        store.set('ye-intro', '1');
        countYear(preloader.querySelector('.pl-year'), 1996, 2026);
        const minTime = new Promise(resolve => setTimeout(resolve, 1700));
        Promise.all([minTime, waitForHeroImage(2600)]).then(() => {
            preloader.classList.add('is-done');
            setTimeout(markReady, 250);
            setTimeout(() => {
                preloader.remove();
                root.classList.remove('pl-on');
            }, 1100);
        });
    }

    function countYear(el, from, to) {
        if (!el) return;
        const duration = 1300;
        const start = performance.now() + 300;
        const step = (now) => {
            const progress = Math.min(Math.max((now - start) / duration, 0), 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = String(Math.round(from + (to - from) * eased));
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    function waitForHeroImage(limit) {
        const slide = document.querySelector('.hero-slider .slide.active');
        const match = slide && /url\(['"]?([^'")]+)/.exec(slide.style.backgroundImage);
        if (!match) return Promise.resolve();
        return new Promise(resolve => {
            const img = new Image();
            img.onload = img.onerror = resolve;
            img.src = match[1];
            setTimeout(resolve, limit);
        });
    }

    // 2. Reveal: öğeleri türüne göre etiketler, görünür olduklarında sırayla açar, sonra temizler
    const WORDS = '.hero h1, .page-header h1, .blog-detail-header h1, .blog-header h1, .section-header h2, '
        + '.about-text h2, .text-content h2, .area-grid h2, .cta-box h2, .contact-info h3';
    const IMAGES = '.card-media, .img-wrapper > img, .image-content, .gallery-item, .blog-img, .care-img';
    const LISTS = '.about-list, .feature-list, .area-list, .info-items';
    const GROUPS = `.trust-grid, .services-grid, .process-grid, .stats-container, .faq-list, .care-grid, .blog-grid, `
        + `.hero-btns, .cta-actions, .footer-content, ${LISTS}`;
    const SINGLES = '.reveal, .hero-eyebrow, .hero-content > p, .header-content > p, .header-content .article-meta, '
        + '.blog-header .subtitle, .blog-header p, .section-header > .subtitle, .section-header > p, '
        + '.about-text > .subtitle, .about-text > p, .text-content > p, .text-content > .btn, .floating-card';

    function initReveal() {
        const tag = (el, type) => { if (!el.hasAttribute('data-r')) el.setAttribute('data-r', type); };

        document.querySelectorAll(WORDS).forEach(el => { splitWords(el); tag(el, 'words'); });
        document.querySelectorAll(IMAGES).forEach(el => tag(el, 'img'));
        document.querySelectorAll(GROUPS).forEach(group => {
            const type = group.matches(LISTS) ? 'leaf' : 'up';
            Array.from(group.children).forEach(child => tag(child, type));
        });
        document.querySelectorAll(SINGLES).forEach(el => tag(el, 'up'));

        // Tamamen kırpılmış görseli tarayıcı "görünmez" sayar; onu üst öğesi üzerinden gözle
        const targets = new Map();
        let order = 0;
        const reveal = (el) => {
            const delay = Math.min(order++, 8) * 85;
            el.style.setProperty('--d', `${delay}ms`);
            el.classList.add('in');
            // Animasyon bitince niteliği kaldır: hover dönüşümleri yeniden çalışsın
            setTimeout(() => {
                el.removeAttribute('data-r');
                el.classList.remove('in');
                el.style.removeProperty('--d');
            }, delay + 1900);
        };

        const observer = new IntersectionObserver((entries) => {
            order = 0;
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                observer.unobserve(entry.target);
                (targets.get(entry.target) || []).forEach(reveal);
                targets.delete(entry.target);
            });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });

        onReady(() => document.querySelectorAll('[data-r]').forEach(el => {
            const watched = el.dataset.r === 'img' ? el.parentElement : el;
            if (!targets.has(watched)) {
                targets.set(watched, []);
                observer.observe(watched);
            }
            targets.get(watched).push(el);
        }));
    }

    // Başlığı kelime kelime sarar; ekran okuyucular için asıl metin aria-label'da kalır
    function splitWords(el) {
        if (el.dataset.split) return;
        el.dataset.split = '1';
        el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
        let index = 0;

        const walk = (node) => {
            Array.from(node.childNodes).forEach(child => {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    if (child.tagName !== 'BR') walk(child);
                    return;
                }
                if (child.nodeType !== Node.TEXT_NODE) return;

                const fragment = document.createDocumentFragment();
                child.textContent.split(/(\s+)/).forEach(part => {
                    if (!part) return;
                    if (!part.trim()) {
                        fragment.appendChild(document.createTextNode(' '));
                        return;
                    }
                    const outer = document.createElement('span');
                    outer.className = 'w';
                    outer.setAttribute('aria-hidden', 'true');
                    const inner = document.createElement('span');
                    inner.className = 'wi';
                    inner.style.setProperty('--wi', index++);
                    inner.textContent = part;
                    outer.appendChild(inner);
                    fragment.appendChild(outer);
                });
                child.replaceWith(fragment);
            });
        };
        walk(el);
    }

    // 3. Sera canvas'ı: cam çatı ızgarası üzerinde gezen güneş parıltısı, yükselen polenler, süzülen yapraklar
    function initSeraCanvases() {
        document.querySelectorAll('.hero, .page-header, .blog-detail-header').forEach(host => {
            const canvas = document.createElement('canvas');
            canvas.className = 'sera-canvas';
            canvas.setAttribute('aria-hidden', 'true');
            const overlay = host.querySelector(':scope > .overlay, :scope > .overlay-dark, :scope > .blog-overlay');
            if (overlay) overlay.after(canvas);
            else host.prepend(canvas);
            createSera(canvas, host, host.classList.contains('hero') ? 1 : 0.65);
        });
    }

    function createSera(canvas, host, intensity) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const small = window.matchMedia('(max-width: 640px)').matches;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cell = small ? 64 : 92;
        const pointer = { x: -9999, y: -9999 };
        const rand = (i) => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };
        let width = 0;
        let height = 0;
        let panes = [];
        let motes = [];
        let leaves = [];
        let visible = false;
        let rafId = 0;
        let last = 0;
        let bornAt = 0;

        function resize() {
            const rect = host.getBoundingClientRect();
            width = rect.width;
            height = rect.height;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            panes = [];
            const rowH = cell * 0.78;
            for (let y = 0, r = 0; y < height; y += rowH, r++) {
                for (let x = 0, c = 0; x < width; x += cell, c++) {
                    // Metnin durduğu sol-alt bölgeyi boş bırakan maske (sağ-üst güçlü)
                    const mask = Math.min(Math.max((x / width) * 1.1 + (1 - y / height) * 0.7 - 0.55, 0), 1);
                    if (mask > 0.02) panes.push({ x, y, w: cell, h: rowH, mask, fog: rand(r * 97 + c) * 0.035 });
                }
            }

            const moteCount = Math.round((small ? 16 : 38) * intensity);
            const leafCount = Math.round((small ? 4 : 9) * intensity);
            motes = Array.from({ length: moteCount }, (_, i) => ({
                x: rand(i + 1) * width,
                y: rand(i + 50) * height,
                r: 0.8 + rand(i + 99) * 1.8,
                vy: 0.012 + rand(i + 7) * 0.022,
                phase: rand(i + 3) * Math.PI * 2,
                alpha: 0.3 + rand(i + 11) * 0.45,
                ox: 0,
                oy: 0
            }));
            leaves = Array.from({ length: leafCount }, (_, i) => ({
                x: rand(i + 200) * width,
                y: rand(i + 300) * height,
                size: 6 + rand(i + 400) * 8,
                vy: 0.012 + rand(i + 500) * 0.02,
                rot: rand(i + 600) * Math.PI * 2,
                vr: (rand(i + 700) - 0.5) * 0.0016,
                phase: rand(i + 800) * Math.PI * 2,
                ox: 0,
                oy: 0
            }));
        }

        function push(item, time) {
            const dx = item.x + item.ox - pointer.x;
            const dy = item.y + item.oy - pointer.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 130 && dist > 0.1) {
                const force = (1 - dist / 130) * 26;
                item.ox += (dx / dist) * force * 0.08;
                item.oy += (dy / dist) * force * 0.08;
            }
            item.ox *= 0.94;
            item.oy *= 0.94;
            return Math.sin(time / 1800 + item.phase);
        }

        function drawPanes(time, fade) {
            const sweep = ((time / 9000) % 1) * 1.8 - 0.4;
            ctx.lineWidth = 1;
            panes.forEach(p => {
                const s = (p.x + p.y * 0.6) / (width + height * 0.6);
                const glint = Math.exp(-Math.pow((s - sweep) / 0.07, 2));
                const near = Math.max(0, 1 - Math.hypot(p.x + p.w / 2 - pointer.x, p.y + p.h / 2 - pointer.y) / 200);
                const a = p.mask * intensity * fade;
                const fill = (p.fog + glint * 0.07 + near * 0.09) * a;
                if (fill > 0.003) {
                    ctx.fillStyle = `rgba(255, 246, 225, ${fill.toFixed(3)})`;
                    ctx.fillRect(p.x + 2, p.y + 2, p.w - 4, p.h - 4);
                }
                ctx.strokeStyle = `rgba(255, 255, 255, ${((0.075 + glint * 0.16 + near * 0.12) * a).toFixed(3)})`;
                ctx.strokeRect(p.x + 1.5, p.y + 1.5, p.w - 3, p.h - 3);
            });
        }

        function drawMotes(time, dt, fade) {
            motes.forEach(m => {
                const sway = push(m, time);
                m.y -= m.vy * dt;
                if (m.y < -12) {
                    m.y = height + 12;
                    m.x = Math.random() * width;
                }
                const x = m.x + sway * 14 + m.ox;
                const y = m.y + m.oy;
                const a = m.alpha * fade;
                ctx.fillStyle = `rgba(232, 211, 173, ${(a * 0.18).toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(x, y, m.r * 3.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = `rgba(255, 244, 220, ${a.toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(x, y, m.r, 0, Math.PI * 2);
                ctx.fill();
            });
        }

        function drawLeaves(time, dt, fade) {
            leaves.forEach(l => {
                const sway = push(l, time);
                l.y += l.vy * dt;
                l.rot += l.vr * dt;
                if (l.y > height + 24) {
                    l.y = -24;
                    l.x = Math.random() * width;
                }
                const s = l.size;
                ctx.save();
                ctx.translate(l.x + sway * 28 + l.ox, l.y + l.oy);
                ctx.rotate(l.rot);
                ctx.scale(Math.cos(time / 1400 + l.phase), 1);
                ctx.fillStyle = `rgba(183, 201, 179, ${(0.55 * fade).toFixed(3)})`;
                ctx.beginPath();
                ctx.moveTo(0, -s);
                ctx.quadraticCurveTo(s * 0.85, 0, 0, s);
                ctx.quadraticCurveTo(-s * 0.85, 0, 0, -s);
                ctx.fill();
                ctx.strokeStyle = `rgba(31, 61, 51, ${(0.35 * fade).toFixed(3)})`;
                ctx.beginPath();
                ctx.moveTo(0, -s * 0.8);
                ctx.lineTo(0, s * 0.8);
                ctx.stroke();
                ctx.restore();
            });
        }

        function frame(time) {
            rafId = 0;
            if (!visible || document.hidden) return;
            const dt = Math.min(time - (last || time), 50);
            last = time;
            const fade = Math.min((time - bornAt) / 1400, 1);
            ctx.clearRect(0, 0, width, height);
            drawPanes(time, fade);
            drawLeaves(time, dt, fade);
            drawMotes(time, dt, fade);
            rafId = requestAnimationFrame(frame);
        }

        const play = () => {
            if (!rafId && visible && !document.hidden && isReady) {
                last = 0;
                rafId = requestAnimationFrame(frame);
            }
        };

        resize();
        let resizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(resize, 150);
        });

        new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
            play();
        }).observe(host);
        document.addEventListener('visibilitychange', play);

        if (finePointer) {
            host.addEventListener('pointermove', (e) => {
                const rect = host.getBoundingClientRect();
                pointer.x = e.clientX - rect.left;
                pointer.y = e.clientY - rect.top;
            });
            host.addEventListener('pointerleave', () => { pointer.x = -9999; pointer.y = -9999; });
        }

        onReady(() => {
            bornAt = performance.now();
            play();
        });
    }

    // 4. Hero parallax: görsel yavaş kalır, içerik yukarı süzülüp söner
    function initHeroParallax() {
        const hero = document.querySelector('.hero');
        if (!hero) return;
        let ticking = false;
        const update = () => {
            ticking = false;
            const progress = Math.min(Math.max(window.scrollY / hero.offsetHeight, 0), 1);
            hero.style.setProperty('--hero-p', progress.toFixed(3));
        };
        window.addEventListener('scroll', () => {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(update);
            }
        }, { passive: true });
        update();
    }

    // 5. Sayfa üstünde kaydırmayla büyüyen sap
    function initScrollVine() {
        const vine = document.createElement('div');
        vine.className = 'scroll-vine';
        vine.setAttribute('aria-hidden', 'true');
        document.body.appendChild(vine);
        let ticking = false;
        const update = () => {
            ticking = false;
            const max = document.documentElement.scrollHeight - window.innerHeight;
            vine.style.transform = `scaleX(${max > 0 ? (window.scrollY / max).toFixed(4) : 0})`;
        };
        window.addEventListener('scroll', () => {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(update);
            }
        }, { passive: true });
        update();
    }

    // 6. Mıknatıs butonlar
    function initMagnetic() {
        if (!finePointer) return;
        document.querySelectorAll('.hero-btns .btn, .cta-actions .btn, .nav-actions .btn, .whatsapp-float').forEach(el => {
            el.classList.add('magnetic');
            el.addEventListener('pointermove', (e) => {
                const rect = el.getBoundingClientRect();
                el.style.setProperty('--mx', `${((e.clientX - rect.left - rect.width / 2) * 0.28).toFixed(1)}px`);
                el.style.setProperty('--my', `${((e.clientY - rect.top - rect.height / 2) * 0.35).toFixed(1)}px`);
            });
            el.addEventListener('pointerleave', () => {
                el.style.removeProperty('--mx');
                el.style.removeProperty('--my');
            });
        });
    }

    // 7. Kartlarda imleci izleyen sıcak sera ışığı
    function initGlowCards() {
        if (!finePointer) return;
        document.querySelectorAll('.service-card, .process-step, .care-card, .blog-card, .trust-item').forEach(card => {
            card.classList.add('glow-card');
            card.addEventListener('pointermove', (e) => {
                const rect = card.getBoundingClientRect();
                card.style.setProperty('--gx', `${e.clientX - rect.left}px`);
                card.style.setProperty('--gy', `${e.clientY - rect.top}px`);
            });
        });
    }

    // 8. Site içi bağlantılarda perdeyle geçiş
    function initPageTransitions() {
        const normalize = (path) => path.replace(/index\.html$/, '');

        document.addEventListener('click', (e) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const link = e.target.closest('a[href]');
            if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;

            const url = new URL(link.href, window.location.href);
            if (url.origin !== window.location.origin || !/(\.html|\/)$/.test(url.pathname)) return;
            if (normalize(url.pathname) === normalize(window.location.pathname)) return; // aynı sayfa / çapa

            e.preventDefault();
            store.set('ye-curtain', '1');
            root.classList.add('cur-out');
            setTimeout(() => { window.location.href = url.href; }, 420);
        });

        // Geri tuşuyla önbellekten dönülürse perdeyi kaldır
        window.addEventListener('pageshow', (e) => {
            if (e.persisted) root.classList.remove('cur-out');
        });
    }
})();
