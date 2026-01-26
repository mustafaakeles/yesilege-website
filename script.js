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
        // Show Hero Content Immediately
        const heroContent = document.querySelector('.hero-content');
        if (heroContent) heroContent.style.opacity = '1';

        // Trigger animations immediately (without delay)
        startHeroAnimations();
    } else {
        // First Visit: Run Animation
        window.scrollTo(0, 0);
        sessionStorage.setItem('visited', 'true');

        setTimeout(() => {
            if (preloader) {
                preloader.style.opacity = '0';
                preloader.style.pointerEvents = 'none';
                document.body.style.overflow = '';
                document.querySelector('.hero-content').style.opacity = '1';
                startHeroAnimations();
                // Remove from DOM after fade out to prevent clicks/overlaps
                setTimeout(() => {
                    preloader.style.display = 'none';
                }, 500);
            }
        }, 3500);
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

    // Preloader Animation
    const preloaderTl = gsap.timeline();

    preloaderTl.to(".loader-text", {
        y: 0,
        duration: 1,
        ease: "power4.out",
        delay: 0.2
    })
        .to(".preloader", {
            y: "-100%",
            duration: 1.2,
            ease: "power3.inOut",
            delay: 0.5,
            onComplete: () => {
                document.body.style.overflow = ''; // Re-enable scroll
                // Start Hero Animations after preloader is gone
                startHeroAnimations();
            }
        });

    // 3. Hero Animations (Intro) - Wrapped in function
    function startHeroAnimations() {
        if (animationsStarted) return;
        animationsStarted = true;

        const tl = gsap.timeline();

        tl.from(".logo", {
            y: -30,
            opacity: 0,
            duration: 1,
            ease: "power3.out"
        })
            .from(".nav-links li", {
                y: -20,
                opacity: 0,
                duration: 0.8,
                stagger: 0.1,
                ease: "power3.out"
            }, "-=0.5")
            .from(".hero h1", {
                y: 100,
                opacity: 0,
                duration: 1.2,
                ease: "power4.out"
            }, "-=0.8")
            .from(".hero p", {
                y: 50,
                opacity: 0,
                duration: 1,
                ease: "power3.out"
            }, "-=0.8")
            .from(".hero-btns a", {
                y: 30,
                opacity: 0,
                duration: 0.8,
                stagger: 0.2,
                ease: "power3.out"
            }, "-=0.6")
            .from(".scroll-down", {
                opacity: 0,
                y: -10,
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

    hamburger.addEventListener('click', () => {
        if (navLinks.style.display === 'flex') {
            gsap.to(navLinks, { opacity: 0, y: -20, duration: 0.3, onComplete: () => navLinks.style.display = 'none' });
        } else {
            navLinks.style.display = 'flex';
            navLinks.style.flexDirection = 'column';
            navLinks.style.position = 'absolute';
            navLinks.style.top = '100%';
            navLinks.style.left = '0';
            navLinks.style.width = '100%';
            navLinks.style.background = 'white';
            navLinks.style.padding = '2rem';

            // Force Link Colors for Mobile
            navLinks.querySelectorAll('a').forEach(a => {
                a.style.color = '#1a3c34';
                if (a.classList.contains('btn-primary')) {
                    a.style.color = 'white';
                }
            });

            gsap.fromTo(navLinks, { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.3 });
        }
    });

    // Ensure nav links reappear if resized to desktop
    window.addEventListener('resize', () => {
        if (window.innerWidth > 900) {
            navLinks.style.display = '';
            navLinks.style.opacity = '';
            navLinks.style.transform = ''; /* Clear GSAP transforms */
            // Clear inline styles set by JS
            navLinks.removeAttribute('style');
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
