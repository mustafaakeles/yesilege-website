// Yeşil Ege Peyzaj — anasayfa canlı ekranları (bağımlılıksız)
// Hizmet kartlarındaki mini arayüzler, rulo sayaçlar, kaydırmayla aydınlanan manifesto ve üst üste binen kartlar.
// Ekranlar yalnızca görünürken çalışır; hareket azaltıldığında son durumları statik çizilir.

(() => {
    'use strict';

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const SVG_NS = 'http://www.w3.org/2000/svg';

    document.addEventListener('DOMContentLoaded', () => {
        initOdometers();
        initScrub();
        initStack();
        initScreens();
    });

    const svgEl = (tag, attrs) => {
        const el = document.createElementNS(SVG_NS, tag);
        Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
        return el;
    };

    const onScrollFrame = (fn) => {
        let ticking = false;
        const run = () => { ticking = false; fn(); };
        const request = () => {
            if (!ticking) {
                ticking = true;
                requestAnimationFrame(run);
            }
        };
        window.addEventListener('scroll', request, { passive: true });
        window.addEventListener('resize', request);
        request();
    };

    // 1. Rulo sayaçlar: her rakam kendi şeridinde döner (script.js'teki düz sayaç yerine)
    function initOdometers() {
        if (reducedMotion) return;
        const numbers = document.querySelectorAll('.stat-item .number[data-target]');
        if (!numbers.length) return;

        numbers.forEach(el => {
            const text = Number(el.dataset.target).toLocaleString('tr-TR') + (el.dataset.suffix || '');
            el.setAttribute('aria-label', text);
            el.textContent = '';
            const odo = document.createElement('span');
            odo.className = 'odo';
            odo.setAttribute('aria-hidden', 'true');
            let column = 0;
            [...text].forEach(char => {
                if (!/\d/.test(char)) {
                    odo.appendChild(document.createTextNode(char));
                    return;
                }
                const col = document.createElement('span');
                col.className = 'odo-col';
                const strip = document.createElement('span');
                strip.className = 'odo-strip';
                strip.style.setProperty('--od', `${column++ * 90}ms`);
                // 0–9 iki tur: hedef rakama en az bir tam dönüşle varılır
                for (let i = 0; i < 20; i++) {
                    const digit = document.createElement('span');
                    digit.textContent = String(i % 10);
                    strip.appendChild(digit);
                }
                strip.dataset.to = String(10 + Number(char));
                col.appendChild(strip);
                odo.appendChild(col);
            });
            el.appendChild(odo);
        });

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                observer.unobserve(entry.target);
                entry.target.querySelectorAll('.odo-strip').forEach(strip => {
                    strip.style.transform = `translate3d(0, ${-Number(strip.dataset.to) * 1.1}em, 0)`;
                });
            });
        }, { threshold: 0.5 });
        numbers.forEach(el => observer.observe(el));
    }

    // 2. Manifesto: kaydırdıkça kelimeler sırayla aydınlanır
    function initScrub() {
        const text = document.querySelector('.manifesto .scrub');
        if (!text || reducedMotion) return;

        const words = text.textContent.trim().split(/\s+/);
        text.setAttribute('aria-label', words.join(' '));
        text.textContent = '';
        const spans = words.map(word => {
            const span = document.createElement('span');
            span.className = /^(1996|halkası|özen)/i.test(word) ? 'sw accent' : 'sw';
            span.setAttribute('aria-hidden', 'true');
            span.textContent = word;
            text.append(span, ' ');
            return span;
        });
        document.documentElement.classList.add('scrub-on');

        onScrollFrame(() => {
            const rect = text.getBoundingClientRect();
            const vh = window.innerHeight;
            const progress = Math.min(Math.max((vh * 0.85 - rect.top) / (rect.height + vh * 0.35), 0), 1);
            const lit = Math.round(progress * spans.length);
            spans.forEach((span, i) => span.classList.toggle('lit', i < lit));
        });
    }

    // 3. Üst üste binen kartlar: alttaki kart gelirken üstteki küçülüp kararır (yalnızca geniş ekran)
    function initStack() {
        const cards = [...document.querySelectorAll('.svc-stack .svc-card')];
        if (cards.length < 2 || reducedMotion) return;
        const wide = window.matchMedia('(min-width: 900px)');

        onScrollFrame(() => {
            cards.forEach((card, i) => {
                const next = cards[i + 1];
                if (!next || !wide.matches) {
                    card.style.removeProperty('--stack');
                    return;
                }
                const top = card.getBoundingClientRect().top;
                const gap = next.getBoundingClientRect().top - top;
                const progress = Math.min(Math.max(1 - gap / card.offsetHeight, 0), 1);
                card.style.setProperty('--stack', progress.toFixed(3));
            });
        });
    }

    // 4. Canlı ekranlar: görünürken çalışır, ekrandan çıkınca durur
    function initScreens() {
        const factories = { plan, tray, indoor, care, irrigation, routes };
        const screens = [...document.querySelectorAll('.screen[data-screen]')]
            .map(el => ({ el, api: factories[el.dataset.screen]?.(el) }))
            .filter(screen => screen.api);
        if (!screens.length) return;

        if (reducedMotion) {
            screens.forEach(({ api }) => api.still());
            return;
        }

        const byEl = new Map(screens.map(screen => [screen.el, screen.api]));
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const api = byEl.get(entry.target);
                if (entry.isIntersecting) api.start();
                else api.stop();
            });
        }, { threshold: 0.25 });
        screens.forEach(({ el }) => observer.observe(el));
    }

    // Belirli aralıkla tick çalıştıran başlat/durdur yardımcısı
    function ticker(ms, tick, onStart) {
        let timer = null;
        return {
            start() {
                if (timer) return;
                onStart?.();
                tick();
                timer = setInterval(tick, ms);
            },
            stop() {
                clearInterval(timer);
                timer = null;
            }
        };
    }

    // 4a. Peyzaj planı: proje çizilir, ağaçlar dikilir, render yüzdesi dolar; 9 sn'de bir baştan
    function plan(el) {
        const bar = el.querySelector('.bar');
        const pct = el.querySelector('.pct');
        let elapsed = 0;
        const setProgress = (value) => {
            bar.style.setProperty('--p', `${value}%`);
            pct.textContent = `${value}%`;
        };
        const restart = () => {
            el.classList.remove('run');
            void el.offsetWidth;
            el.classList.add('run');
            elapsed = 0;
        };
        const loop = ticker(100, () => {
            elapsed += 100;
            setProgress(Math.min(100, Math.round((elapsed / 3600) * 100)));
            if (elapsed >= 9000) restart();
        }, restart);
        return { ...loop, still: () => setProgress(100) };
    }

    // 4b. Fide tablası: rastgele hücreler büyür, olgunlar sevk edilip yerine yenisi ekilir
    function tray(el) {
        const grid = el.querySelector('.tray');
        const counter = el.querySelector('.tray-count');
        const levels = Array.from({ length: 40 }, (_, i) => (i * 7) % 4);
        const cells = levels.map(() => grid.appendChild(document.createElement('i')));
        let shipped = 12480;
        const render = () => {
            cells.forEach((cell, i) => { cell.className = levels[i] ? `l${levels[i]}` : ''; });
            counter.textContent = shipped.toLocaleString('tr-TR');
        };
        const random = (fn) => {
            const pool = levels.map((level, i) => (fn(level) ? i : -1)).filter(i => i >= 0);
            return pool.length ? pool[Math.floor(Math.random() * pool.length)] : -1;
        };
        let picking = -1;
        const loop = ticker(650, () => {
            if (picking >= 0) {
                levels[picking] = 0;
                shipped += 24;
                picking = -1;
            }
            for (let n = 0; n < 3; n++) {
                const i = random(level => level < 3);
                if (i >= 0) levels[i] += 1;
            }
            render();
            picking = random(level => level === 3);
            if (picking >= 0) cells[picking].classList.add('pick');
        });
        render();
        return { ...loop, still: render };
    }

    // 4c. İç mekan bitki kartı: bitkiler sırayla gelir, ışık/nem göstergeleri güncellenir
    function indoor(el) {
        const plants = [
            { name: 'Monstera', light: 'Yarı gölge', water: '7 günde bir', l: 58, h: 70 },
            { name: 'Paşa kılıcı', light: 'Gölgeye dayanıklı', water: '14 günde bir', l: 35, h: 40 },
            { name: 'Orkide', light: 'Dolaylı ışık', water: '10 günde bir', l: 64, h: 78 },
            { name: 'Zeytin (saksı)', light: 'Tam güneş', water: '5 günde bir', l: 92, h: 45 },
            { name: 'Kauçuk', light: 'Aydınlık', water: '8 günde bir', l: 72, h: 60 }
        ];
        const card = el.querySelector('.plant-card');
        const name = el.querySelector('.plant-name');
        const light = el.querySelector('.plant-light');
        const water = el.querySelector('.plant-water');
        const gauges = [...el.querySelectorAll('.gauge')];
        const circumference = 113.1;
        let index = 0;
        const show = (plant) => {
            name.textContent = plant.name;
            light.textContent = plant.light;
            water.textContent = plant.water;
            card.classList.remove('swap');
            void card.offsetWidth;
            card.classList.add('swap');
            gauges.forEach(gauge => {
                const value = gauge.dataset.key === 'light' ? plant.l : plant.h;
                gauge.querySelector('.g-val').style.strokeDashoffset = String(circumference * (1 - value / 100));
                gauge.querySelector('b').textContent = `${value}%`;
            });
        };
        const loop = ticker(3200, () => {
            show(plants[index]);
            index = (index + 1) % plants.length;
        });
        return { ...loop, still: () => show(plants[0]) };
    }

    // 4d. Bakım takvimi: halkada aylar sırayla yanar, ortada o ayın işleri
    function care(el) {
        const months = [
            ['Ocak', 'Kış budaması', 'Ağaç dikimi'], ['Şubat', 'Meyve ağacı budaması', 'Toprak hazırlığı'],
            ['Mart', 'Gübreleme', 'Çim yenileme'], ['Nisan', 'Mevsimlik dikim', 'Sulama kontrolü'],
            ['Mayıs', 'Çim biçme', 'Zararlı kontrolü'], ['Haziran', 'Sabah sulaması', 'Malçlama'],
            ['Temmuz', 'Damla sulama ayarı', 'Gölgeleme'], ['Ağustos', 'Derin sulama', 'Çit budaması'],
            ['Eylül', 'Çim tohumlama', 'Sonbahar gübresi'], ['Ekim', 'Soğan dikimi', 'Ağaç dikimi'],
            ['Kasım', 'Yaprak toplama', 'Kış koruması'], ['Aralık', 'Don koruması', 'Alet bakımı']
        ];
        const ring = el.querySelector('.ring');
        const now = el.querySelector('.season-now');
        const label = el.querySelector('.season-month');
        const tasks = el.querySelector('.season-tasks');
        const dots = months.map(([month], i) => {
            const dot = document.createElement('span');
            dot.textContent = month.charAt(0);
            dot.style.setProperty('--a', `${i * 30}deg`);
            return ring.appendChild(dot);
        });
        let current = new Date().getMonth();
        const show = (index) => {
            dots.forEach((dot, i) => {
                dot.classList.toggle('on', i === index);
                dot.classList.toggle('past', i !== index && (index - i + 12) % 12 <= 3);
            });
            const [month, ...jobs] = months[index];
            label.textContent = month;
            tasks.innerHTML = '';
            jobs.forEach(job => tasks.appendChild(document.createElement('li')).append(job));
            now.classList.remove('swap');
            void now.offsetWidth;
            now.classList.add('swap');
        };
        const loop = ticker(1900, () => {
            show(current);
            current = (current + 1) % 12;
        });
        return { ...loop, still: () => show(new Date().getMonth()) };
    }

    // 4e. Sulama: bölgeler sırayla sulanır, nem dolar, diğerleri yavaşça kurur
    function irrigation(el) {
        const rows = [...el.querySelectorAll('.zones li')];
        const water = el.querySelector('.water');
        const moisture = [46, 38, 55, 42];
        let active = 0;
        let liters = 860;
        const render = () => {
            rows.forEach((row, i) => {
                row.querySelector('.z-bar i').style.setProperty('--m', `${moisture[i].toFixed(0)}%`);
                const state = i === active ? 'wet' : moisture[i] >= 88 ? 'done' : '';
                row.className = state;
                row.querySelector('.z-state').textContent = state === 'wet' ? 'Suluyor' : state === 'done' ? 'Tamam' : 'Bekliyor';
            });
            water.textContent = `${liters.toLocaleString('tr-TR')} L`;
        };
        const loop = ticker(300, () => {
            moisture.forEach((value, i) => {
                if (i !== active) moisture[i] = Math.max(30, value - 0.25);
            });
            moisture[active] = Math.min(92, moisture[active] + 2.4);
            liters += 2;
            if (moisture[active] >= 92) active = (active + 1) % rows.length;
            render();
        });
        render();
        return { ...loop, still: render };
    }

    // 4f. Sevkiyat: Bayındır'dan şehirlere rotalar, tır seçili rotada ilerler
    function routes(el) {
        const svg = el.querySelector('svg.routes');
        const to = el.querySelector('.route-to');
        const home = { name: 'Bayındır', x: 62, y: 112 };
        const cities = [
            { name: 'İstanbul', x: 88, y: 30 }, { name: 'Ankara', x: 172, y: 66 },
            { name: 'Antalya', x: 150, y: 142 }, { name: 'Bursa', x: 102, y: 52 },
            { name: 'Konya', x: 182, y: 118 }, { name: 'Muğla', x: 82, y: 148 },
            { name: 'Kayseri', x: 232, y: 92 }, { name: 'Eskişehir', x: 132, y: 60 }
        ];
        const paths = cities.map(city => {
            const mx = (home.x + city.x) / 2;
            const my = Math.min(home.y, city.y) - 24;
            const path = svgEl('path', { class: 'rt', d: `M${home.x} ${home.y}Q${mx} ${my} ${city.x} ${city.y}` });
            svg.appendChild(path);
            return path;
        });
        const dots = cities.map(city => {
            svg.appendChild(svgEl('text', { x: city.x + 5, y: city.y - 4 })).textContent = city.name;
            return svg.appendChild(svgEl('circle', { class: 'city', cx: city.x, cy: city.y, r: 2.6 }));
        });
        svg.appendChild(svgEl('circle', { class: 'home-pulse', cx: home.x, cy: home.y, r: 5 }));
        svg.appendChild(svgEl('circle', { class: 'home', cx: home.x, cy: home.y, r: 4.5 }));
        svg.appendChild(svgEl('text', { x: home.x - 8, y: home.y + 14 })).textContent = home.name;
        const truck = svg.appendChild(svgEl('circle', { class: 'truck', r: 3.4, cx: home.x, cy: home.y }));

        let route = 0;
        let started = 0;
        let rafId = 0;
        const select = (i) => {
            paths.forEach((path, n) => path.classList.toggle('on', n === i));
            dots.forEach((dot, n) => dot.classList.toggle('on', n === i));
            to.textContent = cities[i].name;
        };
        const drive = (time) => {
            const path = paths[route];
            const progress = Math.min((time - started) / 2600, 1);
            const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
            const point = path.getPointAtLength(path.getTotalLength() * eased);
            truck.setAttribute('cx', point.x.toFixed(1));
            truck.setAttribute('cy', point.y.toFixed(1));
            if (time - started > 3200) {
                route = (route + 1) % paths.length;
                started = time;
                select(route);
            }
            rafId = requestAnimationFrame(drive);
        };
        return {
            start() {
                if (rafId) return;
                select(route);
                started = performance.now();
                rafId = requestAnimationFrame(drive);
            },
            stop() {
                cancelAnimationFrame(rafId);
                rafId = 0;
            },
            still: () => select(0)
        };
    }
})();
