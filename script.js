/* =========================================================
   SK INTERIOR DESIGN
   PAGE BEHAVIOR + DYNAMIC SECTION RENDERING
========================================================= */


/* =========================================================
   NAVBAR
========================================================= */

const navbar = document.querySelector(".navbar");

window.addEventListener("scroll", () => {

    if (!navbar) return;

    if (window.scrollY > 50) {
        navbar.classList.add("scrolled");
    } else {
        navbar.classList.remove("scrolled");
    }

}, { passive: true });


/* =========================================================
   MOBILE MENU
========================================================= */

const menuToggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelector(".nav-links");

if (menuToggle && navLinks) {

    menuToggle.addEventListener("click", () => {

        const isOpen = menuToggle.classList.toggle("active");

        navLinks.classList.toggle("active", isOpen);

        document.body.classList.toggle("menu-open", isOpen);

        menuToggle.setAttribute(
            "aria-label",
            isOpen ? "Close Menu" : "Open Menu"
        );

        menuToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");

    });


    document.querySelectorAll(".nav-links a").forEach(link => {

        link.addEventListener("click", () => {

            menuToggle.classList.remove("active");

            navLinks.classList.remove("active");

            document.body.classList.remove("menu-open");

            menuToggle.setAttribute("aria-label", "Open Menu");
            menuToggle.setAttribute("aria-expanded", "false");

        });

    });

}


/* =========================================================
   SMOOTH SCROLL
========================================================= */

document.querySelectorAll('a[href^="#"]').forEach(anchor => {

    anchor.addEventListener("click", function (e) {

        const targetId = this.getAttribute("href");

        if (!targetId || targetId === "#") return;

        const target = document.querySelector(targetId);

        if (!target) return;

        e.preventDefault();

        const offset = 75;

        const targetPosition =
            target.getBoundingClientRect().top +
            window.scrollY -
            offset;

        window.scrollTo({
            top: targetPosition,
            behavior: "smooth"
        });

    });

});


/* =========================================================
   SCROLL REVEAL — static sections only.
   Dynamically-rendered sections (Services, Projects, Process,
   Why SK) call SKUtils.observeReveal() themselves right after
   they render, since their content doesn't exist yet when this
   script runs.
========================================================= */

const revealElements = document.querySelectorAll(
    ".intro-grid, .about-grid, .founder-strip, .contact-grid"
);

if ("IntersectionObserver" in window) {

    const revealObserver = new IntersectionObserver(
        (entries, observer) => {

            entries.forEach(entry => {

                if (!entry.isIntersecting) return;

                entry.target.classList.add("visible");

                observer.unobserve(entry.target);

            });

        },
        {
            threshold: 0.12,
            rootMargin: "0px 0px -40px 0px"
        }
    );


    revealElements.forEach(element => {

        element.classList.add("reveal-hidden");

        revealObserver.observe(element);

    });

} else {

    revealElements.forEach(element => {
        element.classList.add("visible");
    });

}


/* =========================================================
   COUNTERS
   Static, verified values already present in the markup —
   not fetched from the backend (see project brief: don't
   invent or move statistics that are already confirmed).
========================================================= */

const counters = document.querySelectorAll("[data-count]");

if ("IntersectionObserver" in window) {

    const counterObserver = new IntersectionObserver(
        entries => {

            entries.forEach(entry => {

                if (!entry.isIntersecting) return;

                const counter = entry.target;

                const target = Number(counter.dataset.count);

                if (Number.isNaN(target)) return;

                let current = 0;

                const duration = 1800;

                const startTime = performance.now();


                function animateCounter(currentTime) {

                    const progress = Math.min((currentTime - startTime) / duration, 1);

                    const easedProgress = 1 - Math.pow(1 - progress, 3);

                    current = Math.floor(target * easedProgress);

                    counter.textContent = current;


                    if (progress < 1) {
                        requestAnimationFrame(animateCounter);
                    } else {
                        counter.textContent = target;
                    }

                }


                requestAnimationFrame(animateCounter);

                counterObserver.unobserve(counter);

            });

        },
        { threshold: 0.7 }
    );


    counters.forEach(counter => {
        counterObserver.observe(counter);
    });

}


/* =========================================================
   IMAGE LOAD EFFECT — static images present at page load
   (hero, about, founder, CTA). Dynamically-rendered images
   fade in via SKUtils.fadeInImages(), called by each renderer.
========================================================= */

document.querySelectorAll("img").forEach(image => {

    if (image.complete) {
        image.classList.add("loaded");
    } else {
        image.addEventListener("load", () => image.classList.add("loaded"));
        image.addEventListener("error", () => { image.style.display = "none"; });
    }

});


/* =========================================================
   CURRENT YEAR
========================================================= */

const footerYear = document.querySelector(".footer-bottom span");

if (footerYear) {
    footerYear.textContent = `© ${new Date().getFullYear()} SK Interior Design. All rights reserved.`;
}


/* =========================================================
   DYNAMIC SECTIONS — Services / Process / Why SK
   Each fetches its own data (with automatic fallback handled
   inside js/api.js) and renders independently, so a slow or
   failed request in one section never blocks the others.
========================================================= */

function escapeHtml(str) {
    return String(str == null ? "" : str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function renderServicesSection() {

    const grid = document.getElementById("servicesGrid");
    if (!grid) return;

    window.SKApi.getServices()
        .then(services => {

            const published = (services || [])
                .filter(s => s.published === true || s.published === "TRUE" || s.published === undefined)
                .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

            if (!published.length) {
                grid.innerHTML = '<div class="project-empty">Services are being updated — check back shortly.</div>';
                return;
            }

            grid.innerHTML = published.map((s, i) => `
                <article class="service-card">
                    <span class="service-number">${String(i + 1).padStart(2, "0")}</span>
                    <div class="service-icon">${escapeHtml(s.icon || "◆")}</div>
                    <h3>${escapeHtml(s.title)}</h3>
                    <p>${escapeHtml(s.description)}</p>
                </article>
            `).join("");

            SKUtils.staggerChildren(grid);
            SKUtils.observeReveal(grid, ".service-card");

        })
        .catch(err => {
            console.error("[SK Interior] Failed to load services:", err);
            grid.innerHTML = '<div class="project-empty">Services couldn\u2019t be loaded right now.</div>';
        });

}

function renderProcessSection() {

    const list = document.getElementById("processList");
    if (!list) return;

    window.SKApi.getProcess()
        .then(steps => {

            const published = (steps || [])
                .filter(s => s.published === true || s.published === "TRUE" || s.published === undefined)
                .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

            if (!published.length) {
                list.innerHTML = '<div class="project-empty">Our process is being updated — check back shortly.</div>';
                return;
            }

            list.innerHTML = published.map(s => `
                <div class="process-item">
                    <span>${escapeHtml(s.step || "")}</span>
                    <h3>${escapeHtml(s.title)}</h3>
                    <p>${escapeHtml(s.description)}</p>
                </div>
            `).join("");

            SKUtils.observeReveal(list, ".process-item");

        })
        .catch(err => {
            console.error("[SK Interior] Failed to load process steps:", err);
            list.innerHTML = '<div class="project-empty">This section couldn\u2019t be loaded right now.</div>';
        });

}

function renderWhySection() {

    const grid = document.getElementById("whyGrid");
    if (!grid) return;

    window.SKApi.getWhySK()
        .then(items => {

            const published = (items || [])
                .filter(w => w.published === true || w.published === "TRUE" || w.published === undefined)
                .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

            if (!published.length) {
                grid.closest("section").style.display = "none";
                return;
            }

            grid.innerHTML = published.map(w => `
                <div class="why-item">
                    <div class="why-mark"></div>
                    <h3>${escapeHtml(w.title)}</h3>
                    <p>${escapeHtml(w.description)}</p>
                </div>
            `).join("");

            SKUtils.observeReveal(grid, ".why-item");

        })
        .catch(err => {
            console.error("[SK Interior] Failed to load Why SK content:", err);
            grid.innerHTML = '<div class="project-empty">This section couldn\u2019t be loaded right now.</div>';
        });

}

/* =========================================================
   HOMEPAGE IMAGE — admin-controlled via Settings ("homepageImage").
   Falls back to the image already in the markup (index.html) if
   the setting is empty or the request fails, so the hero is never
   left blank.
========================================================= */

function applyHomepageSettings() {

    const heroImage = document.getElementById("heroImage");
    if (!heroImage) return;

    const photoBox = heroImage.closest(".hero-photo");
    const fallbackUrl = heroImage.dataset.default || "";
    const CACHE_KEY = "sk_hero_image_url_v2";

    // Only as many pixels as the screen needs.
    const width = window.innerWidth < 769 ? 1200 : 900;

    let ready = false;
    let currentUrl = "";

    function markReady() {
        ready = true;
        if (photoBox) photoBox.classList.add("is-ready");
    }

    // Tries each URL in order and calls done() with the first one that
    // actually loads (or "" if none do).
    function loadFirst(list, done) {
        if (!list.length) { done(""); return; }
        const probe = new Image();
        probe.onload = () => done(list[0]);
        probe.onerror = () => loadFirst(list.slice(1), done);
        probe.src = list[0];
    }

    function apply(list, remember) {
        loadFirst(list, url => {
            if (!url) { console.error("[SK Interior] Hero image could not be loaded."); return; }

            if (remember) { try { localStorage.setItem(CACHE_KEY, url); } catch (e) {} }

            // Same picture already on screen — nothing to swap.
            if (url === currentUrl) { markReady(); return; }

            const commit = () => {
                currentUrl = url;
                heroImage.src = url;

                // Wait until the browser has fully DECODED the picture
                // before revealing it. Revealing a still-decoding large
                // image is what caused a brief white flash on phones.
                const done = () => {
                    if (photoBox) photoBox.classList.remove("is-swapping");
                    markReady();
                };

                if (heroImage.decode) heroImage.decode().then(done, done);
                else done();
            };

            if (ready && photoBox) {
                // A different picture is replacing one that is already
                // visible: fade it out first, swap, fade back in.
                photoBox.classList.add("is-swapping");
                setTimeout(commit, 380);
            } else {
                commit();
            }
        });
    }

    // Google's image CDN address is one network hop shorter than the
    // Drive "thumbnail" address, so it is tried first; the thumbnail
    // address stays as a backup.
    function candidates(raw) {
        const thumb = window.SKUtils && window.SKUtils.normalizeImageUrl
            ? window.SKUtils.normalizeImageUrl(raw, width)
            : raw;
        const id = (String(thumb).match(/[?&]id=([\w-]+)/) || [])[1];
        const list = [];
        if (id) list.push("https://lh3.googleusercontent.com/d/" + id + "=w" + width);
        list.push(thumb);
        return list;
    }

    // Repeat visitors: last image is remembered on this device (and the
    // browser has the file cached), so it appears instantly.
    let cached = "";
    try { cached = localStorage.getItem(CACHE_KEY) || ""; } catch (e) {}
    if (cached) apply([cached], false);

    // Slow backend safety net (Apps Script cold start).
    setTimeout(() => { if (!ready && fallbackUrl) apply([fallbackUrl], false); }, 4000);

    if (!window.SKApi) { if (!cached) apply([fallbackUrl], false); return; }

    const settingsPromise = window.__skSettings || window.SKApi.getSettings();

    settingsPromise
        .then(settings => {
            const raw = settings && settings.homepageImage;
            if (!raw) { if (!ready && fallbackUrl) apply([fallbackUrl], false); return; }

            const list = candidates(raw);

            // The remembered picture is already the current one: don't
            // download or swap anything a second time.
            if (currentUrl && list.indexOf(currentUrl) !== -1) {
                try { localStorage.setItem(CACHE_KEY, currentUrl); } catch (e) {}
                return;
            }

            apply(list, true);
        })
        .catch(err => {
            console.error("[SK Interior] Failed to load homepage settings:", err);
            if (!ready && fallbackUrl) apply([fallbackUrl], false);
        });

}

// SKApi/SKUtils come from js/api.js, loaded before this file.
if (window.SKApi && window.SKUtils) {
    applyHomepageSettings();
    renderServicesSection();
    renderProcessSection();
    renderWhySection();
} else {
    console.error("[SK Interior] js/api.js did not load correctly — dynamic sections will stay empty.");
}


/* =========================================================
   PAGE LOADED
========================================================= */

// Start the hero entrance as soon as the page structure is painted —
// not on window "load", which also waits for every image and font
// on the page and made the animation start noticeably late.
requestAnimationFrame(() => {
    requestAnimationFrame(() => {
        document.body.classList.add("page-loaded");
    });
});
