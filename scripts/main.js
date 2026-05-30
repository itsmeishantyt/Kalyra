// The CATALOG is now managed in scripts/catalog.js, but storefront now uses API directly.
const getImageUrl = (url) => url?.startsWith('/') ? (window.API_HOST || 'https://api.kalyraa.com') + url : url;

// Component Loading System
const components = {
    navbar: 'components/navbar.html',
    footer: 'components/footer.html',
    marquee: 'components/marquee.html',
    hero: 'sections/hero.html',
    about: 'sections/about.html',
    shop: 'sections/products.html',
    faq: 'sections/faq.html',
    cta: 'sections/cta.html'
};

async function loadComponent(elementId, filePath) {
    const element = document.getElementById(elementId);
    if (!element) return false;

    // Skip loading if already has substantial inlined content, unless it's a loading placeholder
    const isLoader = element.querySelector('.product-loading') || element.querySelector('.loader');
    if (!isLoader && (element.children.length > 0 || element.innerText.trim().length > 100)) {
        return true;
    }

    try {
        const response = await fetch(filePath);
        if (!response.ok) {
            console.warn(`Fetch to ${filePath} failed, trying absolute path...`);
            const currentDir = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
            const fullPath = currentDir + filePath;
            const res2 = await fetch(fullPath);
            if (!res2.ok) throw new Error(`HTTP error! status: ${res2.status}`);
            const html = await res2.text();
            element.innerHTML = html;
            return true;
        }

        const html = await response.text();
        element.innerHTML = html;
        console.log(`Injected ${elementId}, html length: ${html.length}, grid found: ${!!element.querySelector('#shop-items-container') || !!element.querySelector('.products-grid')}`);
        return true;
    } catch (error) {
        console.error(`Error loading ${filePath}:`, error);
        return false;
    }
}

async function loadAllComponents() {
    const isShopPage = window.location.href.toLowerCase().includes('shop.html') || window.location.pathname.endsWith('/shop') || !!document.getElementById('shop-items-container');

    console.log('Loading components...', { pathname: window.location.pathname, isShopPage });

    const loadPromises = Object.keys(components).map(id => {
        let path = components[id];
        if (id === 'shop' && isShopPage) {
            path = 'sections/shop-content.html';
        }
        return loadComponent(id, path);
    });

    await Promise.all(loadPromises);

    // Recalculate isShopPage after components are loaded into the DOM
    const shopGridExists = !!document.getElementById('shop-items-container') || !!document.querySelector('#shop .products-grid');
    const finalIsShopPage = isShopPage || shopGridExists;

    console.log('Components loaded.', { finalIsShopPage, shopGridExists });

    if (document.getElementById('gallery-strip')) {
        await loadGalleryStrip();
    }

    // Inject mobile drawer at body level
    if (!document.getElementById('nav-drawer')) {
        const drawersHTML = `
            <div class="nav-drawer" id="nav-drawer">
                <div class="drawer-header">
                    <div class="drawer-logo">KALYRA</div>
                    <div class="drawer-close" id="drawer-close">&times;</div>
                </div>
                <div class="drawer-content">
                    <ul class="drawer-links">
                        <li><a href="index.html">Home</a></li>
                        <li class="has-dropdown">
                            <div class="drawer-link-row">
                                <a href="shop.html">Shop</a>
                                <button class="drawer-dropdown-toggle">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
                                </button>
                            </div>
                            <ul class="drawer-submenu">
                                <li><a href="shop.html?category=bespoke">Bespoke Collection</a></li>
                                <li><a href="shop.html?category=artistry">Artistry Collection</a></li>
                                <li><a href="shop.html?category=living">Living Collection</a></li>
                                <li><a href="shop.html?category=wearable">Wearable Collection</a></li>
                            </ul>
                        </li>
                        <li><a href="apparel.html">Apparel</a></li>
                        <li><a href="about.html">About Us</a></li>
                        <li><a href="contact.html">Contact</a></li>
                    </ul>
                </div>
                <div class="drawer-footer"><p>ELEVATE YOUR LIFESTYLE</p></div>
            </div>
            <div class="nav-overlay" id="nav-overlay"></div>`;
        document.body.insertAdjacentHTML('beforeend', drawersHTML);
    }

    // Load and inject login + signup modals
    if (!document.getElementById('login-modal')) {
        try {
            const loginRes = await fetch('components/login-modal.html');
            const loginHTML = await loginRes.text();
            document.body.insertAdjacentHTML('beforeend', loginHTML);
        } catch (e) {
            console.error('Could not load login modal:', e);
        }
    }
    if (!document.getElementById('signup-modal')) {
        try {
            const signupRes = await fetch('components/signup-modal.html');
            const signupHTML = await signupRes.text();
            document.body.insertAdjacentHTML('beforeend', signupHTML);
        } catch (e) {
            console.error('Could not load signup modal:', e);
        }
    }

    // Initialize all functionality
    initNavbarScroll();
    initFaqAccordion();
    initMobileMenu();
    initMobileSearch();
    initGlobalSearch();
    // Modal wiring is handled by auth.js (wireModals is called automatically)

    if (finalIsShopPage) {
        console.log('Detected Shop Page, initializing filters...');
        // Use a more robust check for DOM readiness
        const waitForGrid = (retries = 0) => {
            let grid = document.getElementById('shop-items-container');
            // Check within the #shop container specifically if global ID lookup fails
            if (!grid) grid = document.getElementById('shop')?.querySelector('#shop-items-container') || document.getElementById('shop')?.querySelector('.products-grid');

            if (grid) {
                if (grid.id !== 'shop-items-container') grid.id = 'shop-items-container'; // Ensure ID for later use
                initShopFilters();
            } else if (retries < 10) {
                console.log(`Waiting for grid... retry ${retries + 1}`);
                setTimeout(() => waitForGrid(retries + 1), 100);
            } else {
                console.error('Timed out waiting for Shop Products Grid.');
            }
        };
        waitForGrid();
    }

    const isProductPage = window.location.pathname.includes('product.html') || window.location.pathname.endsWith('/product') || window.location.href.includes('product.html');
    if (isProductPage) {
        console.log('Detected Product Page, initializing details...');
        await initProductPage();
    }

    if (window.KalyraCart) window.KalyraCart.init();
    
    // Load dynamic homepage CMS settings
    await loadDynamicHomepageContent();

    // Always run scroll reveal last
    initScrollReveal();
}

async function loadDynamicHomepageContent() {
    // Helper to restore and fade in default assets in case of errors
    const revealDefaults = () => {
        const heroTitle = document.querySelector('.hero-title');
        const heroSub = document.querySelector('.hero-sub');
        const heroImg = document.querySelector('.hero-right img');
        const heroRight = document.querySelector('.hero-right');
        const ctaTitle = document.querySelector('.cta-title');
        const ctaImages = document.querySelectorAll('.cta-img img');
        const ctaContainers = document.querySelectorAll('.cta-img');

        if (heroTitle) heroTitle.classList.add('loaded');
        if (heroSub) heroSub.classList.add('loaded');
        if (heroImg) {
            heroImg.src = 'assets/pearl-hat-portrait.jpg';
            heroImg.classList.add('loaded');
            if (heroRight) heroRight.classList.remove('loading-shimmer');
        }

        if (ctaTitle) ctaTitle.classList.add('loaded');
        
        const defaults = ['assets/wedding-resin-plate.jpg', 'assets/mirror-butterfly-art.jpg', 'assets/floral-gem-art.jpg'];
        ctaImages.forEach((img, i) => {
            if (img) {
                img.src = defaults[i];
                img.classList.add('loaded');
                if (ctaContainers[i]) ctaContainers[i].classList.remove('loading-shimmer');
            }
        });
    };

    try {
        const host = window.API_HOST || 'https://api.kalyraa.com';
        const res = await fetch(`${host}/api/v1/settings`);
        const data = await res.json();
        if (data.success && data.data) {
            const settings = data.data;

            // Helper to fade in elements smoothly
            const revealText = (el, text, isHTML = false) => {
                if (!el) return;
                if (isHTML) el.innerHTML = text;
                else el.textContent = text;
                el.classList.add('loaded');
            };

            // Helper to lazy-load image and fade in, removing shimmer container loading class
            const loadImage = (imgEl, containerEl, srcUrl) => {
                if (!imgEl) return;
                const tempImg = new Image();
                tempImg.onload = () => {
                    imgEl.src = srcUrl;
                    imgEl.classList.add('loaded');
                    if (containerEl) containerEl.classList.remove('loading-shimmer');
                };
                tempImg.onerror = () => {
                    imgEl.src = srcUrl;
                    imgEl.classList.add('loaded');
                    if (containerEl) containerEl.classList.remove('loading-shimmer');
                };
                tempImg.src = srcUrl;
            };

            // Update Hero Banner
            const heroTitle = document.querySelector('.hero-title');
            const heroSub = document.querySelector('.hero-sub');
            const heroImg = document.querySelector('.hero-right img');
            const heroRight = document.querySelector('.hero-right');
            
            if (settings.hero_title) revealText(heroTitle, settings.hero_title, true);
            else if (heroTitle) heroTitle.classList.add('loaded');

            if (settings.hero_sub) revealText(heroSub, settings.hero_sub, false);
            else if (heroSub) heroSub.classList.add('loaded');

            if (heroImg && settings.hero_image_url) {
                loadImage(heroImg, heroRight, getImageUrl(settings.hero_image_url));
            } else if (heroImg) {
                heroImg.classList.add('loaded');
                if (heroRight) heroRight.classList.remove('loading-shimmer');
            }

            // Update CTA Banner
            const ctaTitle = document.querySelector('.cta-title');
            const ctaImages = document.querySelectorAll('.cta-img img');
            const ctaContainers = document.querySelectorAll('.cta-img');
            
            if (settings.cta_title) revealText(ctaTitle, settings.cta_title, true);
            else if (ctaTitle) ctaTitle.classList.add('loaded');
            
            if (ctaImages.length > 0 && settings.cta_image_1) {
                loadImage(ctaImages[0], ctaContainers[0], getImageUrl(settings.cta_image_1));
            } else if (ctaImages.length > 0) {
                ctaImages[0].classList.add('loaded');
                if (ctaContainers[0]) ctaContainers[0].classList.remove('loading-shimmer');
            }

            if (ctaImages.length > 1 && settings.cta_image_2) {
                loadImage(ctaImages[1], ctaContainers[1], getImageUrl(settings.cta_image_2));
            } else if (ctaImages.length > 1) {
                ctaImages[1].classList.add('loaded');
                if (ctaContainers[1]) ctaContainers[1].classList.remove('loading-shimmer');
            }

            if (ctaImages.length > 2 && settings.cta_image_3) {
                loadImage(ctaImages[2], ctaContainers[2], getImageUrl(settings.cta_image_3));
            } else if (ctaImages.length > 2) {
                ctaImages[2].classList.add('loaded');
                if (ctaContainers[2]) ctaContainers[2].classList.remove('loading-shimmer');
            }
        } else {
            revealDefaults();
        }
    } catch (e) {
        console.error('Error loading dynamic homepage content:', e);
        revealDefaults();
    }
}

function initShopFilters() {
    console.log('Initializing Shop Filters...');
    let cardsContainer = document.getElementById('shop-items-container');

    if (!cardsContainer) {
        cardsContainer = document.querySelector('.products-grid');
        if (cardsContainer) cardsContainer.id = 'shop-items-container';
    }

    if (!cardsContainer) {
        console.error('Shop container not found.');
        return;
    }

    // Filters state
    const filters = {
        categories: [],
        maxPrice: Number.MAX_VALUE,
        style: null,
        sortBy: 'featured',
        searchTerm: ''
    };

    const drawer = document.getElementById('filter-drawer');
    const overlay = document.getElementById('filter-overlay');
    const toggleBtn = document.getElementById('filter-toggle');
    const closeBtn = document.getElementById('filter-close');
    const applyBtn = document.getElementById('apply-filters');
    const sortDropdown = document.getElementById('sort-dropdown');

    const toggleDrawer = () => {
        drawer?.classList.toggle('active');
        overlay?.classList.toggle('active');
        document.body.style.overflow = drawer?.classList.contains('active') ? 'hidden' : '';
    };

    toggleBtn?.addEventListener('click', toggleDrawer);
    closeBtn?.addEventListener('click', toggleDrawer);
    overlay?.addEventListener('click', toggleDrawer);
    applyBtn?.addEventListener('click', toggleDrawer);

    const categoryCheckboxes = document.querySelectorAll('input[name="category"]');
    const priceRadios = document.querySelectorAll('input[name="price"]');
    const styleTags = document.querySelectorAll('.style-tag');

    const viewBtns = document.querySelectorAll('.view-btn');

    viewBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            viewBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (cardsContainer) {
                cardsContainer.className = `products-grid ${view}`;
            }
        });
    });

    const renderProducts = (products) => {
        cardsContainer.innerHTML = '';
        if (products.length === 0) {
            cardsContainer.innerHTML = `
                <div class="no-results" style="grid-column: 1/-1; padding: 100px 0; text-align: center;">
                    <p>No products found matching your filters. Try adjusting them.</p>
                </div>`;
            return;
        }

        products.forEach((p, index) => {
            const card = document.createElement('div');
            card.className = 'product-card shop-card-animate';
            card.style.animationDelay = `${index * 0.05}s`;

            // Format price
            const price = typeof p.price === 'number' ? p.price : 0;

            card.innerHTML = `
                <div class="product-img-wrap">
                    <img src="${getImageUrl(p.image_url) || 'https://placehold.co/600x800/F5F0E8/8C7E72?text=Product'}" alt="${p.name}" loading="lazy" onerror="this.src='https://placehold.co/600x800/F5F0E8/8C7E72?text=Product'">
                    <div class="product-add"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></div>
                </div>
                <div class="product-brand">${p.category}</div>
                <h3 class="product-name">${p.name}</h3>
                <p class="product-price">₹${price.toLocaleString()}</p>
            `;
            card.onclick = () => window.location.href = `product.html?id=${p.id}`;
            cardsContainer.appendChild(card);
        });
    };

    const applyFiltersAndSort = async () => {
        try {
            const query = {};
            if (filters.categories.length > 0) query.category = filters.categories.join(',');
            if (filters.maxPrice < Number.MAX_VALUE) query.max_price = filters.maxPrice;
            if (filters.searchTerm) query.search = filters.searchTerm;
            if (filters.sortBy === 'price-low') query.sort = 'price_asc';
            if (filters.sortBy === 'price-high') query.sort = 'price_desc';
            if (filters.sortBy === 'best-selling') query.sort = 'best_selling';
            if (filters.sortBy === 'trending') query.sort = 'trending';
            if (filters.sortBy === 'top-rated') query.sort = 'top_rated';
            if (filters.sortBy === 'new-arrivals') query.sort = 'new_arrivals';

            cardsContainer.innerHTML = '<div class="loader" style="grid-column: 1/-1; text-align: center; padding: 50px;">Loading products...</div>';

            const response = await window.KalyraAPI.getProducts(query);
            let products = response.data || [];
            if (filters.sortBy === 'alphabet-az') products.sort((a, b) => a.name.localeCompare(b.name));
            if (filters.sortBy === 'alphabet-za') products.sort((a, b) => b.name.localeCompare(a.name));

            // Limit to 4 products on the home page
            const isShopPage = window.location.href.toLowerCase().includes('shop.html') || window.location.pathname.endsWith('/shop');
            if (!isShopPage) {
                products = products.slice(0, 4);
            }

            renderProducts(products);
        } catch (error) {
            console.error('Failed to fetch products:', error);
            cardsContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 50px;">Failed to load products.</div>';
        }
    };

    categoryCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            filters.categories = Array.from(categoryCheckboxes).filter(c => c.checked).map(c => c.value);
            applyFiltersAndSort();
        });
    });

    priceRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            const val = radio.value;
            filters.maxPrice = val === '2000+' ? 2000 : parseInt(val);
            applyFiltersAndSort();
        });
    });

    styleTags.forEach(tag => {
        tag.addEventListener('click', () => {
            styleTags.forEach(t => t.classList.remove('active'));
            if (filters.style === tag.textContent) {
                filters.style = null;
            } else {
                filters.style = tag.textContent;
                tag.classList.add('active');
            }
            applyFiltersAndSort();
        });
    });

    sortDropdown?.addEventListener('change', (e) => {
        filters.sortBy = e.target.value;
        applyFiltersAndSort();
    });

    // Initial category and search from URL
    const urlParams = new URLSearchParams(window.location.search);
    const initialCat = urlParams.get('category');
    const initialSearch = urlParams.get('q');

    if (initialCat) {
        const target = Array.from(categoryCheckboxes).find(c => c.value === initialCat);
        if (target) {
            target.checked = true;
            filters.categories = [initialCat];
        }
    }

    if (initialSearch) {
        filters.searchTerm = initialSearch;
        const desktopInput = document.getElementById('desktop-search-input');
        const mobileInput = document.getElementById('mobile-search-input');
        if (desktopInput) desktopInput.value = initialSearch;
        if (mobileInput) mobileInput.value = initialSearch;
    }

    // Always fetch and render products initially
    applyFiltersAndSort();
}

function initMobileSearch() {
    const trigger = document.getElementById('mobile-search-trigger');
    const dropdown = document.getElementById('mobile-search-dropdown');
    const input = document.getElementById('mobile-search-input');

    if (!trigger || !dropdown) return;

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.add('active');
        input?.focus();
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !trigger.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') dropdown.classList.remove('active');
    });
}

async function loadGalleryStrip() {
    const galleryImages = [
        'assets/floral-gem-art.jpg',
        'assets/anklet-embroidery-tote.jpg',
        'assets/mirror-butterfly-art.jpg',
        'assets/mandala-art-sketchbook.jpg',
        'assets/floral-resin-coasters.jpg',
        'assets/flower-shaped-resin-coasters.jpg',
        'assets/black-resin-name-plate.jpg',
        'assets/doctor-resin-name-plate.jpg',
        'assets/ceo-resin-name-plate.jpg',
        'assets/wedding-resin-plate.jpg'
    ];

    // Double the images for seamless loop
    const itemsHTML = [...galleryImages, ...galleryImages].map(src => `
        <div class="gallery-item">
            <img src="${src}" alt="Kalyra Art">
        </div>
    `).join('');

    const galleryHTML = `
        <div class="gallery-strip">
            <div class="section-header reveal" style="margin-bottom: 40px;">
                <div>
                    <div class="section-label">Indo-Western Art</div>
                    <h2 class="section-title">Collector <em>Reviews</em></h2>
                </div>
            </div>
            <div class="gallery-track">
                ${itemsHTML}
            </div>
        </div>
    `;
    document.getElementById('gallery-strip').innerHTML = galleryHTML;
}

function initNavbarScroll() {
    const navbar = document.getElementById('navbar');
    if (navbar) {
        window.addEventListener('scroll', () => {
            navbar.classList.toggle('scrolled', window.scrollY > 20);
        });
    }
}

function initScrollReveal() {
    const revealEls = document.querySelectorAll('.reveal');
    const io = new IntersectionObserver((entries) => {
        entries.forEach((e, i) => {
            if (e.isIntersecting) {
                e.target.style.transitionDelay = `${i * 0.05}s`;
                e.target.classList.add('in');
                io.unobserve(e.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(el => io.observe(el));
}

function initFaqAccordion() {
    document.querySelectorAll('.faq-q').forEach(btn => {
        btn.addEventListener('click', () => {
            const item = btn.parentElement;
            const isOpen = item.classList.contains('open');
            document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
            if (!isOpen) item.classList.add('open');
        });
    });
}

function initMobileMenu() {
    const toggle = document.getElementById('nav-toggle');
    const drawer = document.getElementById('nav-drawer');
    const overlay = document.getElementById('nav-overlay');
    const closeBtn = document.getElementById('drawer-close');
    const drawerLinks = document.querySelectorAll('.drawer-links a');

    if (!toggle || !drawer || !overlay) return;

    const toggleMenu = () => {
        drawer.classList.toggle('active');
        overlay.classList.toggle('active');
        document.body.style.overflow = drawer.classList.contains('active') ? 'hidden' : '';
    };

    toggle.addEventListener('click', toggleMenu);
    closeBtn.addEventListener('click', toggleMenu);
    overlay.addEventListener('click', toggleMenu);

    drawerLinks.forEach(link => {
        link.addEventListener('click', () => {
            drawer.classList.remove('active');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        });
    });

    // Mobile Drawer Dropdown Toggle
    const dropdownToggle = document.querySelector('.drawer-dropdown-toggle');
    const submenu = document.querySelector('.drawer-submenu');

    dropdownToggle?.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownToggle.classList.toggle('active');
        submenu.classList.toggle('active');
    });
}

function initModals() {
    const loginModal = document.getElementById('login-modal');
    const loginBackdrop = document.getElementById('login-backdrop');

    const steps = {
        phone: document.getElementById('login-step-phone'),
        otp: document.getElementById('login-step-otp'),
        email: document.getElementById('login-step-email')
    };

    const showStep = (stepName) => {
        Object.values(steps).forEach(s => s ? s.hidden = true : null);
        if (steps[stepName]) steps[stepName].hidden = false;
    };

    const openLogin = (e) => {
        if (e) e.preventDefault();
        showStep('phone');
        loginModal?.classList.add('active');
        loginBackdrop?.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    const closeAllModals = () => {
        loginModal?.classList.remove('active');
        loginBackdrop?.classList.remove('active');
        document.body.style.overflow = '';
    };

    // Interaction Listeners
    document.getElementById('btn-send-otp')?.addEventListener('click', () => {
        const phone = document.getElementById('login-phone')?.value;
        if (phone?.length === 10) {
            showStep('otp');
            document.querySelector('.otp-digit')?.focus();
        } else {
            alert('Please enter a valid 10-digit number');
        }
    });

    document.getElementById('btn-to-email')?.addEventListener('click', () => {
        // Trigger Google Login
        if (typeof google !== 'undefined') {
            google.accounts.id.prompt();
        }
        showStep('email'); // Still show the step which now has the Google button
    });

    document.getElementById('btn-google-login')?.addEventListener('click', () => {
        if (typeof google !== 'undefined') {
            google.accounts.id.prompt();
        } else {
            alert('Google Sign-In is currently unavailable. Please try again later.');
        }
    });

    document.getElementById('btn-back-to-phone')?.addEventListener('click', () => showStep('phone'));
    document.getElementById('btn-back-to-phone-from-email')?.addEventListener('click', () => showStep('phone'));

    document.getElementById('btn-verify-otp')?.addEventListener('click', () => {
        alert('Verification successful! Logging you in...');
        closeAllModals();
    });

    // document.getElementById('btn-email-login')?.addEventListener('click', () => {
    //     alert('Logging in with Email & Password...');
    //     closeAllModals();
    // });

    // OTP Input Logic
    const otpDigits = document.querySelectorAll('.otp-digit');
    otpDigits.forEach((digit, idx) => {
        digit.addEventListener('input', (e) => {
            if (e.target.value.length === 1 && idx < otpDigits.length - 1) {
                otpDigits[idx + 1].focus();
            }
        });
        digit.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && idx > 0) {
                otpDigits[idx - 1].focus();
            }
        });
    });

    // Global triggers
    document.querySelectorAll('a[href="#login"]').forEach(a => a.addEventListener('click', openLogin));
    document.querySelectorAll('a[href="#signup"]').forEach(a => a.addEventListener('click', openLogin)); // Signup also opens login

    // Close functionality
    document.getElementById('login-close')?.addEventListener('click', closeAllModals);
    loginBackdrop?.addEventListener('click', closeAllModals);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAllModals();
    });
}

// Google OAuth Response Handler
if (!window.handleGoogleResponse) {
    window.handleGoogleResponse = async (response) => {
        try {
            // Decode the JWT token (Base64) to get user info
            const base64Url = response.credential.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));

            const user = JSON.parse(jsonPayload);
            console.log('Google User Authenticated:', user);

            if (window.KalyraAuth?.loginWithGoogle) {
                await window.KalyraAuth.loginWithGoogle(user);
                if (window.closeAllModals) window.closeAllModals();
                if (window.showToast) {
                    window.showToast(`Welcome, ${user.name}! 🎉`, 'success');
                } else {
                    alert(`Welcome, ${user.name}! You have successfully logged in via Google.`);
                }
                if (window.updateNavbarUserState) window.updateNavbarUserState();
            } else {
                alert(`Welcome, ${user.name}! You have successfully logged in via Google.`);
                // Close modal and update UI
                const loginModal = document.getElementById('login-modal');
                const loginBackdrop = document.getElementById('login-backdrop');
                loginModal?.classList.remove('active');
                loginBackdrop?.classList.remove('active');
                document.body.style.overflow = '';
            }
        } catch (error) {
            console.error('Error handling Google response:', error);
            if (window.showToast) {
                window.showToast('Google sign-in failed. Please try again.', 'error');
            } else {
                alert('An error occurred during Google Sign-In.');
            }
        }
    };
}

function initGlobalSearch() {
    const desktopInput = document.getElementById('desktop-search-input');
    const desktopBtn = document.getElementById('desktop-search-btn');
    const mobileInput = document.getElementById('mobile-search-input');
    const mobileBtn = document.getElementById('mobile-search-btn');
    const mobileDropdown = document.getElementById('mobile-search-dropdown');

    // Create Autocomplete Containers if they don't exist
    let desktopAutocomplete = document.getElementById('desktop-autocomplete');
    if (!desktopAutocomplete && desktopInput) {
        desktopAutocomplete = document.createElement('div');
        desktopAutocomplete.id = 'desktop-autocomplete';
        desktopAutocomplete.className = 'search-autocomplete';
        desktopInput.parentElement?.appendChild(desktopAutocomplete);
    }

    let mobileAutocomplete = document.getElementById('mobile-autocomplete');
    if (!mobileAutocomplete && mobileInput) {
        mobileAutocomplete = document.createElement('div');
        mobileAutocomplete.id = 'mobile-autocomplete';
        mobileAutocomplete.className = 'search-autocomplete';
        mobileDropdown?.appendChild(mobileAutocomplete);
    }

    const handleSearch = (query) => {
        if (!query.trim()) return;
        window.location.href = `shop.html?q=${encodeURIComponent(query.trim())}`;
    };

    let searchTimeout = null;
    const renderAutocomplete = async (input, container) => {
        const query = input.value.trim();

        if (query.length < 2) {
            container.classList.remove('active');
            container.innerHTML = '';
            return;
        }

        if (searchTimeout) clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
            try {
                const response = await window.KalyraAPI.getProducts({ search: query, limit: 6 });
                const matches = response.data || [];

                if (matches.length === 0) {
                    container.innerHTML = `
                        <div class="autocomplete-empty">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 8px; opacity: 0.5;">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                            <p style="margin: 0; font-size: 13px;">No results found</p>
                        </div>`;
                } else {
                    container.innerHTML = matches.map(p => `
                        <div class="autocomplete-item" onclick="window.location.href='product.html?id=${p.id}'">
                            <img src="${getImageUrl(p.image_url) || 'https://placehold.co/48x48/F5F0E8/8C7E72?text=Item'}" alt="${p.name}" class="autocomplete-img" onerror="this.src='https://placehold.co/48x48/F5F0E8/8C7E72?text=Item'">
                            <div class="autocomplete-info">
                                <span class="autocomplete-name">${p.name}</span>
                                <span class="autocomplete-price">₹${(typeof p.price === 'number' ? p.price : 0).toLocaleString()}</span>
                            </div>
                        </div>
                    `).join('');
                }

                container.classList.add('active');
            } catch (err) {
                console.error('Search error:', err);
            }
        }, 300);
    };

    // Desktop Events
    desktopInput?.addEventListener('input', () => renderAutocomplete(desktopInput, desktopAutocomplete));
    desktopInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearch(desktopInput.value);
            desktopAutocomplete?.classList.remove('active');
        }
    });
    desktopBtn?.addEventListener('click', () => {
        handleSearch(desktopInput.value);
        desktopAutocomplete?.classList.remove('active');
    });

    // Mobile Events
    mobileInput?.addEventListener('input', () => renderAutocomplete(mobileInput, mobileAutocomplete));
    mobileInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearch(mobileInput.value);
            mobileDropdown?.classList.remove('active');
            mobileAutocomplete?.classList.remove('active');
        }
    });
    mobileBtn?.addEventListener('click', () => {
        handleSearch(mobileInput.value);
        mobileDropdown?.classList.remove('active');
        mobileAutocomplete?.classList.remove('active');
    });

    // Close on click outside or escape
    document.addEventListener('click', (e) => {
        if (!desktopInput?.contains(e.target) && !desktopAutocomplete?.contains(e.target)) {
            desktopAutocomplete?.classList.remove('active');
        }
        if (!mobileInput?.contains(e.target) && !mobileAutocomplete?.contains(e.target)) {
            mobileAutocomplete?.classList.remove('active');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            desktopAutocomplete?.classList.remove('active');
            mobileAutocomplete?.classList.remove('active');
            mobileDropdown?.classList.remove('active');
        }
    });
}

async function initProductPage() {
    console.log('initProductPage starting...');
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const productId = urlParams.get('id');
        const container = document.getElementById('product-page-content');
        if (!container) return;

        container.innerHTML = '<div class="loader" style="padding: 100px; text-align: center;">Loading product details...</div>';

        let product = null;
        if (productId) {
            try {
                const response = await window.KalyraAPI.getProduct(productId);
                product = response.data;
            } catch (err) {
                console.error('Failed to load product from API', err);
            }
        }

        // Fallback: If not in catalog, try to build from URL parameters
        if (!product && urlParams.get('name')) {
            console.log('Product not found in catalog, generating from URL parameters...');
            product = {
                id: productId || 'custom-item',
                name: urlParams.get('name'),
                price: parseInt(urlParams.get('price')) || 0,
                img: urlParams.get('img') || 'https://placehold.co/600x800/F5F0E8/8C7E72?text=Product',
                category: urlParams.get('cat') || 'Bespoke Creations',
                description: urlParams.get('desc') || 'A unique handcrafted piece from the Kalyra collection.'
            };
        }

        if (!product) {
            container.innerHTML = `
                <div class="product-not-found" style="text-align:center; padding: 100px 20px;">
                    <h2 style="font-family: var(--serif); font-size: 32px; margin-bottom: 20px;">Treasure Not Found</h2>
                    <p style="color: var(--mid); margin-bottom: 30px;">The piece you're looking for seems to have vanished into our archives.</p>
                    <a href="shop.html" class="btn-primary">Back to Collection</a>
                </div>
            `;
            return;
        }

        await renderPDP(container, product);
        initScrollReveal();

    } catch (error) {
        console.error('Error in initProductPage:', error);
    }
}

async function renderPDP(container, product) {
    // Set document title
    document.title = `${product.name} — Kalyra Boutique`;

    // Related products (prioritize same category)
    const isApparel = product.category === 'apparel';
    let related = [];

    try {
        const response = await window.KalyraAPI.getProducts({ category: product.category, limit: 5 });
        related = (response.data || []).filter(p => String(p.id) !== String(product.id)).slice(0, 4);

        if (related.length < 4) {
            const extraRes = await window.KalyraAPI.getProducts({ limit: 10 });
            const others = (extraRes.data || []).filter(p => String(p.id) !== String(product.id) && p.category !== product.category);
            const needed = 4 - related.length;
            related = [...related, ...others.slice(0, needed)];
        }
    } catch (err) {
        console.error('Failed to load related products', err);
    }

    const prodImg = getImageUrl(product.image_url) || product.img || 'https://placehold.co/600x800/F5F0E8/8C7E72?text=Product';

    container.innerHTML = `
        <div class="pdp-wrapper">
            <div class="pdp-container">
                <div class="pdp-gallery">
                    <div class="pdp-main-img">
                        <img src="${prodImg}" alt="${product.name}" id="main-product-image">
                        <div class="pdp-custom-cursor" id="pdp-custom-cursor">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                            </svg>
                        </div>
                        <button class="pdp-zoom-btn" id="pdp-zoom-trigger" aria-label="Zoom image">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
                            </svg>
                        </button>
                        <button class="pdp-nav-btn prev" id="pdp-nav-prev" aria-label="Previous image">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m15 18-6-6 6-6"/></svg>
                        </button>
                        <button class="pdp-nav-btn next" id="pdp-nav-next" aria-label="Next image">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m9 18 6-6-6-6"/></svg>
                        </button>
                    </div>
                    <div class="pdp-thumbnails">
                        <div class="thumb active" onclick="changePDPImage('${prodImg}', this)">
                            <img src="${prodImg}" alt="${product.name}">
                        </div>
                        <div class="thumb" onclick="changePDPImage('https://placehold.co/600x800/000000/000000', this)">
                            <img src="https://placehold.co/600x800/000000/000000" alt="Placeholder">
                        </div>
                        <div class="thumb" onclick="changePDPImage('https://placehold.co/600x800/000000/000000', this)">
                            <img src="https://placehold.co/600x800/000000/000000" alt="Placeholder">
                        </div>
                        <div class="thumb" onclick="changePDPImage('https://placehold.co/600x800/000000/000000', this)">
                            <img src="https://placehold.co/600x800/000000/000000" alt="Placeholder">
                        </div>
                    </div>
                </div>
                
                <div class="pdp-info">
                    <div class="pdp-category">${product.category ? product.category.charAt(0).toUpperCase() + product.category.slice(1) : ''} Collection</div>
                    <h1 class="pdp-title">${product.name}</h1>
                    
                    <p class="pdp-price">₹${(typeof product.price === 'number' ? product.price : 0).toLocaleString()}</p>
                    <p class="pdp-desc">${product.description || ''}</p>
                    
                    <div class="pdp-options">
                        <div class="option-row">
                            <span class="option-label">Size Option</span>
                            <div class="size-pills">
                                <button class="size-pill active">Standard</button>
                                <button class="size-pill">Premium Large</button>
                                <button class="size-pill">Custom Size</button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="pdp-actions">
                        <button class="btn-add-cart" id="pdp-add-cart">Add to Cart</button>
                        <button class="btn-buy-now" id="pdp-buy-now">Buy Now</button>
                        <button class="btn-share-icon" aria-label="Share">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>
                        </button>
                    </div>
                    
                    <div class="pdp-accordion">
                        <div class="accordion-item">
                            <button class="accordion-trigger">Piece Details <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></button>
                            <div class="accordion-content">
                                <p>${product.description || ''} Each piece is uniquely handcrafted using premium materials, ensuring that no two items are exactly alike. Designed to bring a touch of artisanal elegance to your personal space.</p>
                            </div>
                        </div>
                        <div class="accordion-item">
                            <button class="accordion-trigger">Shipping & Delivery <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></button>
                            <div class="accordion-content">
                                <p>Free shipping on orders above ₹2,499. Carefully packaged with eco-friendly materials to ensure your art arrives safely.</p>
                            </div>
                        </div>
                        <div class="accordion-item">
                            <button class="accordion-trigger">Return & Exchange <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></button>
                            <div class="accordion-content">
                                <p>We offer a 48-hour return policy for damaged items. As our pieces are handcrafted, we do not support general returns.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <hr class="gallery-divider">
            
            <!-- Customer Reviews Section -->
            <section class="reviews-section reveal">
                <div class="reviews-container" id="reviews-container-${product.id}">
                    <!-- Will be populated by renderReviews() -->
                </div>
            </section>
            
            <section class="related-section">
                <div class="section-header-centered">
                    <div class="section-label">${isApparel ? 'Complete the look' : 'You might also love'}</div>
                    <h2 class="section-title">${isApparel ? 'Style <em>Companions</em>' : 'Similar <em>Treasures</em>'}</h2>
                </div>
                <div class="products-grid grid-4" id="similar-products-grid">
                    ${related.map(r => `
                        <div class="product-card" onclick="window.location.href='product.html?id=${r.id}'">
                            <div class="product-img-wrap">
                                <img src="${getImageUrl(r.image_url) || 'https://placehold.co/600x800/F5F0E8/8C7E72?text=Product'}" alt="${r.name}" onerror="this.src='https://placehold.co/600x800/F5F0E8/8C7E72?text=Product'">
                            </div>
                            <div class="product-brand">${r.category ? r.category.charAt(0).toUpperCase() + r.category.slice(1) : ''}</div>
                            <h3 class="product-name">${r.name}</h3>
                            <p class="product-price">₹${(typeof r.price === 'number' ? r.price : 0).toLocaleString()}</p>
                        </div>
                    `).join('')}
                </div>
            </section>
        </div>

        <div class="pdp-lightbox" id="pdp-lightbox">
            <div class="lightbox-content">
                <img src="${prodImg}" alt="${product.name}" class="lightbox-img" id="lightbox-img">
            </div>
            <div class="lightbox-controls">
                <button class="lb-btn" id="lb-prev" aria-label="Previous">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <button class="lb-btn close-btn" id="lb-close" aria-label="Close">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
                <button class="lb-btn" id="lb-next" aria-label="Next">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </button>
            </div>
        </div>
    `;

    // Lightbox Logic
    const lb = document.getElementById('pdp-lightbox');
    const lbImg = document.getElementById('lightbox-img');
    const mainImg = document.getElementById('main-product-image');

    const openLB = () => {
        lbImg.src = mainImg.src;
        lb.classList.add('active');
        document.body.style.overflow = 'hidden';
    };

    const closeLB = () => {
        lb.classList.remove('active');
        document.body.style.overflow = '';
        lbImg.classList.remove('is-zoomed');
        lbImg.style.transform = '';
    };

    // Toggle Zoom in Lightbox (Desktop only)
    lbImg?.addEventListener('click', (e) => {
        if (window.innerWidth <= 1024) return;

        lbImg.classList.toggle('is-zoomed');
        if (!lbImg.classList.contains('is-zoomed')) {
            lbImg.style.transform = '';
            lbImg.style.transformOrigin = 'center center';
        } else {
            applyZoom(e);
        }
    });

    lbImg?.addEventListener('mousemove', (e) => {
        if (lbImg.classList.contains('is-zoomed') && window.innerWidth > 1024) {
            applyZoom(e);
        }
    });

    function applyZoom(e) {
        const rect = lbImg.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;

        lbImg.style.transformOrigin = `${x}% ${y}%`;
        lbImg.style.transform = 'scale(2.5)';
    }

    mainImg?.addEventListener('click', openLB);
    document.getElementById('pdp-zoom-trigger')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openLB();
    });
    document.getElementById('lb-close')?.addEventListener('click', closeLB);
    lb?.addEventListener('click', (e) => {
        if (e.target === lb || e.target.classList.contains('lightbox-content')) closeLB();
    });

    document.getElementById('lb-prev')?.addEventListener('click', (e) => {
        e.stopPropagation();
        navigatePDP(-1);
        setTimeout(() => lbImg.src = mainImg.src, 50);
    });

    document.getElementById('lb-next')?.addEventListener('click', (e) => {
        e.stopPropagation();
        navigatePDP(1);
        setTimeout(() => lbImg.src = mainImg.src, 50);
    });

    // Interactions
    document.querySelectorAll('.accordion-trigger').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.parentElement.classList.toggle('active');
        });
    });

    // Action Logic — dispatch pdp-ready so cart.js wires the button
    window.dispatchEvent(new CustomEvent('kalyra:pdp-ready', { detail: { product } }));

    document.getElementById('pdp-buy-now')?.addEventListener('click', async () => {
        const selectedSize = document.querySelector('.size-pill.active')?.textContent || null;
        const selectedColor = document.querySelector('.color-pill.active')?.textContent || null;
        if (product) {
            await (window.KalyraCart?.addItem(product.id, 1, selectedSize, selectedColor, {
                name: product.name, price: product.price, image_url: prodImg,
            }) ?? Promise.resolve());
        }
        window.location.href = 'cart.html';
    });

    // Custom Cursor Logic for Desktop
    const mainImgContainer = document.querySelector('.pdp-main-img');
    const customCursor = document.getElementById('pdp-custom-cursor');

    if (mainImgContainer && customCursor && window.innerWidth > 1024) {
        mainImgContainer.addEventListener('mouseenter', () => {
            customCursor.style.opacity = '1';
            customCursor.style.visibility = 'visible';
        });

        mainImgContainer.addEventListener('mouseleave', () => {
            customCursor.style.opacity = '0';
            customCursor.style.visibility = 'hidden';
        });

        mainImgContainer.addEventListener('mousemove', (e) => {
            const rect = mainImgContainer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            customCursor.style.transform = `translate(${x}px, ${y}px)`;
        });

        // Hide custom cursor when hovering over navigation buttons
        const navBtns = mainImgContainer.querySelectorAll('.pdp-nav-btn');
        navBtns.forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                customCursor.style.opacity = '0';
                customCursor.style.visibility = 'hidden';
            });
            btn.addEventListener('mouseleave', () => {
                customCursor.style.opacity = '1';
                customCursor.style.visibility = 'visible';
            });
        });
    }

    // Initial Reviews Render
    renderReviews(product);

    // Setup Gallery Arrows
    setupPDPInteractions();
}

function getReviews(productId) {
    const all = JSON.parse(localStorage.getItem('kalyra_reviews') || '{}');
    return all[productId] || [];
}

function saveReview(productId, review) {
    const all = JSON.parse(localStorage.getItem('kalyra_reviews') || '{}');
    if (!all[productId]) all[productId] = [];
    all[productId].unshift(review);
    localStorage.setItem('kalyra_reviews', JSON.stringify(all));
}

function renderReviews(product) {
    const container = document.getElementById(`reviews-container-${product.id}`);
    if (!container) return;

    const reviews = getReviews(product.id);
    const count = reviews.length;

    if (count === 0) {
        container.innerHTML = `
            <div class="reviews-header-centered">
                <h2 class="reviews-title">Customer Reviews</h2>
                <div class="overall-rating empty">
                    <div class="stars empty">☆☆☆☆☆</div>
                </div>
                <p class="based-on">Be the first to write a review</p>
            </div>
            <div class="reviews-action">
                <button class="btn-write-review" id="btn-write-review">Write a review</button>
            </div>
            <div id="review-form-container" class="form-collapse-container"></div>
        `;

        // Pre-render form for smooth transition
        showReviewForm(product, true);
    } else {
        const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / count;
        const breakdown = [0, 0, 0, 0, 0]; // 5, 4, 3, 2, 1
        reviews.forEach(r => { if (r.rating >= 1 && r.rating <= 5) breakdown[5 - r.rating]++; });

        container.innerHTML = `
            <div class="reviews-header-centered">
                <h2 class="reviews-title">Customer Reviews</h2>
                <div class="overall-rating">
                    <div class="stars">${'★'.repeat(Math.round(avg))}${'☆'.repeat(5 - Math.round(avg))}</div>
                    <span class="rating-text">${avg.toFixed(2)} out of 5</span>
                </div>
                <p class="based-on">Based on ${count} review${count > 1 ? 's' : ''} <span class="verified-check">✓</span></p>
            </div>

            <div class="reviews-grid">
                <div class="reviews-stats">
                    ${breakdown.map((c, i) => `
                        <div class="rating-bar-row">
                            <div class="stars-label">${'★'.repeat(5 - i)}${'☆'.repeat(i)}</div>
                            <div class="progress-bar"><div class="progress" style="width: ${(c / count * 100).toFixed(0)}%;"></div></div>
                            <div class="count-label">${c}</div>
                        </div>
                    `).join('')}
                </div>
                <div class="reviews-list">
                    ${reviews.slice(0, 3).map(r => `
                        <div class="review-item">
                            <div class="review-meta">
                                <span class="review-author">${r.name}</span>
                                <span class="review-date">${new Date(r.date).toLocaleDateString()}</span>
                            </div>
                            <div class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
                            <h4 class="review-title">${r.title || 'Review'}</h4>
                            <p class="review-text">${r.text}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="reviews-action">
                <button class="btn-write-review" id="btn-write-review">Write a review</button>
            </div>
            <div id="review-form-container" class="form-collapse-container"></div>
        `;

        // Pre-render form for smooth transition
        showReviewForm(product, true);
    }

    const writeBtn = document.getElementById('btn-write-review');
    const formWrap = document.getElementById('review-form-container');

    writeBtn?.addEventListener('click', () => {
        formWrap.classList.toggle('active');
        if (formWrap.classList.contains('active')) {
            writeBtn.textContent = 'Cancel review';
            setTimeout(() => {
                formWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        } else {
            writeBtn.textContent = 'Write a review';
        }
    });
}

function showReviewForm(product, silent = false) {
    const formWrap = document.getElementById('review-form-container');
    if (!formWrap) return;

    formWrap.innerHTML = `
        <div class="review-form-card">
            <h2 class="reviews-title" style="margin-bottom: 30px;">Write a Review</h2>
            <div class="rating-input">
                <label class="form-label">Overall Rating</label>
                <div class="star-rating-select">
                    <span data-val="5">★</span><span data-val="4">★</span><span data-val="3">★</span><span data-val="2">★</span><span data-val="1">★</span>
                </div>
            </div>
            <div class="form-grid">
                <div class="form-group">
                    <label class="form-label">Review Title</label>
                    <input type="text" id="rev-title" placeholder="Give your review a title">
                </div>
                <div class="form-group">
                    <label class="form-label">Review Content</label>
                    <textarea id="rev-text" rows="4" placeholder="Write your comments here"></textarea>
                </div>
                <div class="form-group text-center">
                    <label class="form-label">Picture/Video (Optional)</label>
                    <div class="media-upload-container">
                        <label for="rev-media" class="upload-square">
                            <svg class="upload-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                            </svg>
                        </label>
                        <input type="file" id="rev-media" accept="image/*,video/*" style="display: none;">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">Display Name</label>
                        <input type="text" id="rev-name" placeholder="Public name (e.g. John D.)">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Email Address</label>
                        <input type="email" id="rev-email" placeholder="For verification (private)">
                    </div>
                </div>
            </div>
            
            <p class="data-disclaimer">
                By submitting this review, you agree to our terms. We use your data to verify reviews and improve our service. Your email address will never be shared publicly.
            </p>

            <div class="form-actions">
                <button class="btn-submit-review" id="submit-review">Submit Review</button>
                <button class="btn-cancel-form" id="cancel-review-form">Cancel Review</button>
            </div>
        </div>
    `;

    // Removed automatic scroll here since we handle it in the toggle logic
    /* 
    setTimeout(() => {
        formWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100); 
    */

    // Handle Cancel button inside form
    formWrap.querySelector('#cancel-review-form')?.addEventListener('click', () => {
        const writeBtn = document.getElementById('btn-write-review');
        if (writeBtn) writeBtn.click(); // Reuse existing toggle logic
    });

    let selectedRating = 5;
    const stars = formWrap.querySelectorAll('.star-rating-select span');
    stars.forEach(s => {
        s.addEventListener('click', () => {
            selectedRating = parseInt(s.dataset.val);
            stars.forEach(st => {
                st.classList.toggle('active', parseInt(st.dataset.val) <= selectedRating);
            });
        });
    });

    document.getElementById('submit-review')?.addEventListener('click', () => {
        const title = document.getElementById('rev-title').value || 'Review';
        const name = document.getElementById('rev-name').value || 'Anonymous';
        const email = document.getElementById('rev-email').value;
        const text = document.getElementById('rev-text').value;

        if (!text) return alert('Please write a review text');
        if (!email) return alert('Please provide your email');

        saveReview(product.id, {
            title,
            name,
            email,
            text,
            rating: selectedRating,
            date: new Date().toISOString()
        });

        alert('Thank you for your review!');
        renderReviews(product);
    });
}

function changePDPImage(src, thumb) {
    const mainImg = document.getElementById('main-product-image');
    if (mainImg) {
        mainImg.style.opacity = '0';
        setTimeout(() => {
            mainImg.src = src;
            mainImg.style.opacity = '1';
        }, 200);
    }

    document.querySelectorAll('.pdp-thumbnails .thumb').forEach(t => t.classList.remove('active'));
    thumb.classList.add('active');
}

function navigatePDP(direction) {
    const thumbs = Array.from(document.querySelectorAll('.pdp-thumbnails .thumb'));
    const activeIndex = thumbs.findIndex(t => t.classList.contains('active'));
    let nextIndex = activeIndex + direction;

    if (nextIndex < 0) nextIndex = thumbs.length - 1;
    if (nextIndex >= thumbs.length) nextIndex = 0;

    thumbs[nextIndex].click();
}

// Update Interactions in renderPDP
function setupPDPInteractions() {
    document.getElementById('pdp-nav-prev')?.addEventListener('click', (e) => {
        e.stopPropagation();
        navigatePDP(-1);
    });

    document.getElementById('pdp-nav-next')?.addEventListener('click', (e) => {
        e.stopPropagation();
        navigatePDP(1);
    });
}

function initGoogleAuth() {
    const googleBtnContainer = document.getElementById('btn-google-login');
    if (typeof google !== 'undefined') {
        google.accounts.id.initialize({
            client_id: "349751177817-oo4elddbeu78b35j34bo3uj88n4f8did.apps.googleusercontent.com",
            callback: window.handleGoogleResponse,
            auto_select: false,
            cancel_on_tap_outside: true
        });

        if (googleBtnContainer) {
            googleBtnContainer.innerHTML = '';
            google.accounts.id.renderButton(googleBtnContainer, {
                theme: 'outline',
                size: 'large',
                width: '320',
                text: 'continue_with',
                shape: 'pill',
                logo_alignment: 'left'
            });
            // Also attempt to invoke One Tap non-intrusively
            google.accounts.id.prompt();
        }
    } else {
        console.warn('Google Identity Services script not loaded');
        if (googleBtnContainer) {
            googleBtnContainer.innerHTML = `
                <button type="button" class="login-submit" style="background:#dadce0; color:#666; cursor:not-allowed;" disabled>
                    Google Login Unavailable
                </button>
            `;
        }
    }
}

// ── APPAREL SECTION LOGIC ──
// Apparel page now shares the same filtering engine as the Shop page.
// The DOM element ID in apparel.html was changed to #shop-items-container
// so that initShopFilters() will automatically manage it.

// Start loading when page is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded, starting boot sequence...');
    loadAllComponents().then(() => {
        console.log('Boot sequence complete.');
        initGoogleAuth();

        // Final check for page types
        const path = window.location.pathname;
        const isProductPage = path.includes('product.html') || path.endsWith('/product');

        // initShopFilters() is already called in loadAllComponents via waitForGrid()
        // initApparelPage is no longer needed.
        if (isProductPage) initProductPage();
    });
});

