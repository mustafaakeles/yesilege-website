// Yeşil Ege Premium Interactive Script

document.addEventListener('DOMContentLoaded', () => {

    // Global flag to prevent duplicate animations
    let animationsStarted = false;

    // 0. Disable Scroll on Load
    document.body.style.overflow = 'hidden';
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }

    // Check Session Storage for First Visit
    const hasVisited = sessionStorage.getItem('visited');
    const preloader = document.querySelector('.preloader');

    if (hasVisited) {
        // Subsequent Visit: Instant Load
        if (preloader) {
            preloader.style.display = 'none'; // Completely remove
        }
        document.body.style.overflow = ''; // Enable scroll immediately

        // INSTANTLY REVEAL ELEMENTS (Since CSS hides them by default now)
        // Ensure opacity is 1 to avoid flash
        gsap.set([".logo", ".nav-links li", ".hero h1", ".hero p", ".hero-btns a", ".scroll-down"], {
            opacity: 1,
            y: 0,
            overwrite: true
        });

        // Show Hero Content Immediately
        const heroContent = document.querySelector('.hero-content');
        if (heroContent) heroContent.style.opacity = '1';

        // Trigger animations immediately (without delay) - Logic handled by set above, but function can run safely
    } else {
        // First Visit: Run Optimized Animation
        // Only scroll to top if NO hash is present (allow direct linking)
        if (!window.location.hash) {
            window.scrollTo(0, 0);
        }
        sessionStorage.setItem('visited', 'true');
        // Logic handled by GSAP timeline below to prevent conflicts
    }

    // 1. Smooth Scrolling with Lenis
    // 1. Smooth Scrolling with Lenis
    /* 
    // DISABLED FOR PERFORMANCE
    try {
        if (typeof Lenis !== 'undefined') {
            const lenis = new Lenis({
                duration: 1.2,
                easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
                direction: 'vertical',
                gestureDirection: 'vertical',
                smooth: true,
                mouseMultiplier: 1,
                smoothTouch: false,
                touchMultiplier: 2,
            });

            function raf(time) {
                lenis.raf(time);
                requestAnimationFrame(raf);
            }

            requestAnimationFrame(raf);
        } else {
            console.warn("Lenis library not loaded. Smooth scrolling disabled.");
        }
    } catch (e) {
        console.warn("Lenis initialization failed:", e);
    }
    */

    // 2. Register GSAP Plugins
    gsap.registerPlugin(ScrollTrigger);

    // Optimized Preloader Animation (Fast & Smooth)
    const preloaderTl = gsap.timeline();

    // Only run if preloader exists and hasn't been removed by "hasVisited" logic
    const preloaderEl = document.querySelector('.preloader');
    if (preloaderEl && preloaderEl.style.display !== 'none') {
        preloaderTl.to(".loader-text", {
            y: 0,
            opacity: 1,
            duration: 0.5,
            ease: "back.out(1.7)", // Subtle pop for premium feel
            delay: 0.1
        })
            .to(".preloader", {
                opacity: 0, // Fade out instead of slide up to prevent "jumping"
                duration: 0.4,
                ease: "power2.inOut",
                delay: 0.2, // Short pause to read text
                onComplete: () => {
                    if (preloaderEl) preloaderEl.style.display = 'none';
                    document.body.style.overflow = '';
                    startHeroAnimations();
                }
            });
    } else {
        // Fallback for pages without preloader or if already visited
        document.body.style.overflow = '';
        if (typeof startHeroAnimations === 'function') startHeroAnimations();
    }

    // 3. Hero Animations (Intro) - Modified to .to() because CSS sets initial hidden state
    function startHeroAnimations() {
        if (animationsStarted) return;
        animationsStarted = true;

        const tl = gsap.timeline();

        // Reveal Logo & Nav
        tl.to(".logo", {
            y: 0,
            opacity: 1,
            duration: 1,
            ease: "power3.out"
        })
            .to(".nav-links li", {
                y: 0,
                opacity: 1,
                duration: 0.8,
                stagger: 0.1,
                ease: "power3.out"
            }, "-=0.5")

            // Reveal Hero Content
            .to(".hero h1", {
                y: 0,
                opacity: 1,
                duration: 1.2,
                ease: "power4.out"
            }, "-=0.8")
            .to(".hero p", {
                y: 0,
                opacity: 0.9, // Match CSS opacity logic if needed, or 1
                duration: 1,
                ease: "power3.out"
            }, "-=0.8")
            .to(".hero-btns a", {
                y: 0,
                opacity: 1,
                duration: 0.8,
                stagger: 0.2,
                ease: "power3.out"
            }, "-=0.6")
            .to(".scroll-down", {
                opacity: 0.8,
                y: 0,
                duration: 1,
                ease: "power2.out"
            }, "-=0.4");
    } // End of startHeroAnimations

    // 4. Parallax Effect for Hero Background (if we had an image wrapper) - Simulating with background-position
    // Note: CSS background-attachment: fixed handles this natively well, but GSAP offers more control. 
    // We will leave the CSS version for performance on background-image, but animate elements.

    // 5. Features Reveal
    gsap.utils.toArray('.feature-card').forEach((card, i) => {
        gsap.from(card, {
            scrollTrigger: {
                trigger: card,
                start: "top 85%",
                toggleActions: "play none none reverse"
            },
            y: 50,
            opacity: 0,
            duration: 0.8,
            delay: i * 0.2,
            ease: "power3.out"
        });
    });

    // 6. About Section - Paralax Image & Text Reveal
    gsap.from(".about-image", {
        scrollTrigger: {
            trigger: ".about",
            start: "top 75%",
        },
        x: -50,
        opacity: 0,
        duration: 1.2,
        ease: "power3.out"
    });

    gsap.from(".about-text", {
        scrollTrigger: {
            trigger: ".about",
            start: "top 75%",
        },
        x: 50,
        opacity: 0,
        duration: 1.2,
        ease: "power3.out",
        delay: 0.2
    });

    // 7. Services Cards Stagger
    // 7. Services Cards Stagger (Fixed)
    const serviceCards = gsap.utils.toArray(".service-card");
    if (serviceCards.length > 0) {
        gsap.set(serviceCards, { y: 50, opacity: 0 }); // Initial state

        ScrollTrigger.batch(serviceCards, {
            start: "top 90%",
            onEnter: batch => gsap.to(batch, {
                opacity: 1,
                y: 0,
                duration: 0.8,
                stagger: 0.15,
                ease: "power3.out",
                overwrite: true
            }),
            once: true // Animasyon sadece bir kere çalışsın (performans ve bug önleme)
        });
    }

    // 7.5. Gallery Grid Animation
    const galleryItemsAnim = gsap.utils.toArray('.gallery-item');
    if (galleryItemsAnim.length > 0) {
        gsap.set(galleryItemsAnim, { opacity: 0, y: 50 });

        ScrollTrigger.batch(galleryItemsAnim, {
            start: "top 85%",
            onEnter: batch => gsap.to(batch, {
                opacity: 1,
                y: 0,
                duration: 0.8,
                stagger: 0.15, // Stagger effect
                ease: "power3.out",
                overwrite: true
            }),
            once: true
        });
    }

    // 8. Navbar Background on Scroll (Throttled)
    let scrollTimeout;
    const navbar = document.getElementById('navbar');

    window.addEventListener('scroll', () => {
        if (!scrollTimeout) {
            scrollTimeout = setTimeout(() => {
                if (window.scrollY > 50) {
                    navbar.classList.add('scrolled');
                } else {
                    navbar.classList.remove('scrolled');
                }
                scrollTimeout = null;
            }, 100);
        }
    });

    // 9. Mobile Menu
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');

    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            if (navLinks.style.display === 'flex') {
                // Menüyü kapat
                gsap.to(navLinks, {
                    opacity: 0,
                    y: -10,
                    duration: 0.25,
                    ease: "power2.in",
                    onComplete: () => {
                        navLinks.style.display = 'none';
                        // Tüm dropdown'ları kapat
                        document.querySelectorAll('.dropdown.active').forEach(d => d.classList.remove('active'));
                    }
                });
            } else {
                // Menüyü aç
                navLinks.style.display = 'flex';
                navLinks.style.opacity = '0';

                // li elemanlarının opacity'sini zorla 1 yap (animasyondan dolayı 0 olabilir)
                navLinks.querySelectorAll('li').forEach(li => {
                    li.style.opacity = '1';
                    li.style.transform = 'none';
                });

                gsap.fromTo(navLinks,
                    { opacity: 0, y: -10 },
                    { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }
                );
            }
        });

        // Menü dışına tıklanınca kapat
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 1024) {
                if (!navLinks.contains(e.target) && !hamburger.contains(e.target)) {
                    if (navLinks.style.display === 'flex') {
                        gsap.to(navLinks, {
                            opacity: 0,
                            y: -10,
                            duration: 0.2,
                            onComplete: () => navLinks.style.display = 'none'
                        });
                    }
                }
            }
        });
    }

    // Mobile Dropdown Toggle Logic
    const dropdownToggles = document.querySelectorAll('.dropdown > a');
    dropdownToggles.forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            // Only on mobile (CSS breakpoint ile uyumlu)
            if (window.innerWidth <= 1024) {
                e.preventDefault();
                const parent = toggle.parentElement;
                parent.classList.toggle('active');

                // Chevron döndür
                const icon = toggle.querySelector('i');
                if (icon) {
                    gsap.to(icon, { rotation: parent.classList.contains('active') ? 180 : 0, duration: 0.3 });
                }
            }
        });
    });

    // Pencere boyutu değişince nav'ı resetle
    window.addEventListener('resize', () => {
        if (window.innerWidth > 1024) {
            navLinks.style.display = '';
            navLinks.style.opacity = '';
            navLinks.style.transform = '';
            navLinks.removeAttribute('style');
            // Dropdown'ları da kapat
            document.querySelectorAll('.dropdown.active').forEach(d => d.classList.remove('active'));
        }
    });

    // 10. Number Counter Animation (keeping the logic but wrapping in ScrollTrigger)
    const statsSection = document.querySelector('.stats');
    if (statsSection) {
        ScrollTrigger.create({
            trigger: ".stats",
            start: "top 70%",
            once: true,
            onEnter: () => {
                document.querySelectorAll('.stat-item .number').forEach(el => {
                    let goal = parseInt(el.dataset.target);
                    // Reset to 0 before animating since we have default values in HTML now
                    el.textContent = '0';

                    // Use GSAP's object animation for smooth counting
                    let obj = { val: 0 };
                    gsap.to(obj, {
                        val: goal,
                        duration: 2,
                        ease: "power2.out",
                        onUpdate: () => {
                            // Format number nicely (e.g. 1.000)
                            el.textContent = Math.floor(obj.val).toLocaleString('tr-TR') + "+";
                        }
                    });
                });
            }
        });
    }

    // 11. Hero Background Slider
    // 11. Hero Background Slider
    const slides = document.querySelectorAll('.slide');
    const prevBtn = document.querySelector('.nav-btn.prev');
    const nextBtn = document.querySelector('.nav-btn.next');

    let currentSlide = 0;
    let isAnimating = false;
    let slideInterval;
    const intervalTime = 6000;

    function goToSlide(index, direction) {
        if (isAnimating || index === currentSlide) return;
        isAnimating = true;

        const activeSlide = slides[currentSlide];
        const nextSlide = slides[index];

        // Determine animation direction if not provided
        // (Optional: could add direction-based sliding, but fade is safer/classier)

        // Ensure the incoming slide is visible and on top
        nextSlide.style.zIndex = '3'; // Higher than active (2)
        activeSlide.style.zIndex = '2';

        gsap.to(activeSlide, {
            opacity: 0,
            duration: 1.0,
            ease: "power2.inOut"
        });

        gsap.fromTo(nextSlide,
            { opacity: 0, scale: 1.1 },
            {
                opacity: 1,
                scale: 1,
                duration: 1.0,
                ease: "power2.inOut",
                onComplete: () => {
                    activeSlide.classList.remove('active');
                    nextSlide.classList.add('active');

                    // Reset inline styles to let CSS class handle z-index
                    activeSlide.style.zIndex = '';
                    activeSlide.style.opacity = '';
                    nextSlide.style.zIndex = '';

                    isAnimating = false;
                }
            }
        );

        currentSlide = index;
    }

    function nextSlide() {
        let newIndex = (currentSlide + 1) % slides.length;
        goToSlide(newIndex, 'next');
    }

    function prevSlide() {
        let newIndex = (currentSlide - 1 + slides.length) % slides.length;
        goToSlide(newIndex, 'prev');
    }

    // Event Listeners
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            resetInterval();
            nextSlide();
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            resetInterval();
            prevSlide();
        });
    }

    function resetInterval() {
        clearInterval(slideInterval);
        slideInterval = setInterval(nextSlide, intervalTime);
    }

    // Start Loop
    resetInterval();

    // Initial State ensure
    gsap.set(slides, { opacity: 0 });
    gsap.set(slides[0], { opacity: 1 });

    // 12. Contact Form Handling (Hybrid: AJAX or Simulation)
    const contactForm = document.querySelector('.contact-form form');
    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = contactForm.querySelector('button');
            const originalText = btn.textContent;

            // UI Loading State
            btn.textContent = 'Gönderiliyor...';
            btn.style.opacity = '0.7';
            btn.disabled = true;

            const formData = new FormData(contactForm);
            const action = contactForm.getAttribute('action');

            try {
                if (action && action.includes('http')) {
                    // Real Submission via AJAX
                    const response = await fetch(action, {
                        method: contactForm.method,
                        body: formData,
                        headers: {
                            'Accept': 'application/json'
                        }
                    });

                    if (response.ok) {
                        btn.textContent = 'Mesajınız İletildi! ✓';
                        btn.style.backgroundColor = '#4d7c6e';
                        contactForm.reset();
                    } else {
                        throw new Error('Form gönderilemedi');
                    }
                } else {
                    // Fallback Simulation (if no action URL provided)
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    btn.textContent = 'Simülasyon: Mesaj Alındı! ✓';
                    btn.style.backgroundColor = '#4d7c6e';
                    contactForm.reset();
                }
            } catch (error) {
                console.error(error);
                btn.textContent = 'Hata Oluştu!';
                btn.style.backgroundColor = '#d9534f';
            } finally {
                btn.style.opacity = '1';
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.style.backgroundColor = '';
                    btn.disabled = false;
                }, 3000);
            }
        });
    }

    // 13. Lightbox Functionality
    const galleryItems = document.querySelectorAll('.gallery-item');
    if (galleryItems.length > 0) {
        // Create Lightbox DOM
        const lightbox = document.createElement('div');
        lightbox.className = 'lightbox';
        lightbox.innerHTML = `
            <button class="lightbox-close">&times;</button>
            <img src="" alt="Galeri Büyük Boy">
        `;
        document.body.appendChild(lightbox);

        const lightboxImg = lightbox.querySelector('img');
        const closeBtn = lightbox.querySelector('.lightbox-close');

        // Open Lightbox
        galleryItems.forEach(item => {
            item.addEventListener('click', () => {
                // Get image source from the img tag inside the gallery item
                const img = item.querySelector('img');

                if (img && img.src) {
                    lightboxImg.src = img.src;
                    lightbox.classList.add('active');
                    document.body.style.overflow = 'hidden'; // Scroll'u engelle
                }
            });
        });

        // Close Lightbox
        const closeLightbox = () => {
            lightbox.classList.remove('active');
            document.body.style.overflow = '';
            setTimeout(() => {
                lightboxImg.src = '';
            }, 300); // Transition bitince sil
        };

        closeBtn.addEventListener('click', closeLightbox);

        // Close on outside click
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) {
                closeLightbox();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && lightbox.classList.contains('active')) {
                closeLightbox();
            }
        });
    }
});
