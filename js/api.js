/* =========================================================
   SK INTERIOR DESIGN — DATA / API LAYER
   =========================================================

   Talks to the Google Apps Script backend (see apps-script/Code.gs).

   API_BASE_URL is defined once, in js/config.js, which must be
   loaded BEFORE this file (see index.html's script order). The
   admin panel reads the same variable from the same file, so
   the URL only ever needs to be set in one place.

   Until it's set, the public site automatically falls back to
   the small demo dataset below / in js/projects.js, so the
   site is never blank — it just shows placeholder content
   until the backend is connected.
========================================================= */

(function () {

    "use strict";

    var BACKEND_CONFIGURED = !!API_BASE_URL;
    var warnedFallback = false;

    function warnFallbackOnce() {
        if (warnedFallback) return;
        warnedFallback = true;
        console.info(
            BACKEND_CONFIGURED
                ? "[SK Interior] Could not reach the backend — showing fallback demo content instead."
                : "[SK Interior] API_BASE_URL is not configured yet (js/api.js) — showing fallback demo content."
        );
    }

    /* =====================================================
       LOW-LEVEL REQUESTS
    ===================================================== */

    function apiGet(action, params) {
        if (!BACKEND_CONFIGURED) return Promise.reject(new Error("NOT_CONFIGURED"));

        var url = new URL(API_BASE_URL);
        url.searchParams.set("action", action);
        Object.keys(params || {}).forEach(function (key) {
            if (params[key] !== undefined && params[key] !== null) {
                url.searchParams.set(key, params[key]);
            }
        });

        return fetch(url.toString())
            .then(function (res) { return res.json(); })
            .then(unwrap);
    }

    function apiPost(action, payload) {
        if (!BACKEND_CONFIGURED) return Promise.reject(new Error("NOT_CONFIGURED"));

        // text/plain avoids a CORS preflight (OPTIONS) request, which
        // Apps Script Web Apps do not handle. See Code.gs header comment.
        return fetch(API_BASE_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: action, payload: payload || {} })
        })
            .then(function (res) { return res.json(); })
            .then(unwrap);
    }

    function unwrap(response) {
        if (!response || response.success !== true) {
            var message = (response && response.message) || "Request failed.";
            var err = new Error(message);
            if (message === "SESSION_EXPIRED") err.code = "SESSION_EXPIRED";
            throw err;
        }
        return response.data;
    }

    /* =====================================================
       PUBLIC READS — with graceful fallback
    ===================================================== */

    function withFallback(promiseFn, fallbackValue) {
        return promiseFn().catch(function () {
            warnFallbackOnce();
            return typeof fallbackValue === "function" ? fallbackValue() : fallbackValue;
        });
    }

    function getProjects() {
        return withFallback(
            function () { return apiGet("getProjects"); },
            function () { return window.SK_FALLBACK_PROJECTS || []; }
        );
    }

    function getProject(id) {
        return getProjects().then(function (list) {
            for (var i = 0; i < list.length; i++) {
                if (list[i].id === id) return list[i];
            }
            return null;
        });
    }

    function getLatestProjects(limit) {
        return withFallback(
            function () { return apiGet("getLatestProjects", { limit: limit || 6 }); },
            function () {
                var list = (window.SK_FALLBACK_PROJECTS || []).slice().sort(function (a, b) {
                    return new Date(b.createdDate || 0) - new Date(a.createdDate || 0);
                });
                return list.slice(0, limit || 6);
            }
        );
    }

    function getServices() {
        return withFallback(
            function () { return apiGet("getServices"); },
            function () { return FALLBACK_SERVICES; }
        );
    }

    function getProcess() {
        return withFallback(
            function () { return apiGet("getProcess"); },
            function () { return FALLBACK_PROCESS; }
        );
    }

    function getWhySK() {
        return withFallback(
            function () { return apiGet("getWhySK"); },
            function () { return FALLBACK_WHY_SK; }
        );
    }

    function getVideos() {
        return withFallback(
            function () { return apiGet("getVideos"); },
            function () { return FALLBACK_VIDEOS; }
        );
    }

    function getPortfolioCategories() {
        return withFallback(
            function () { return apiGet("getPortfolioCategories"); },
            function () { return FALLBACK_PORTFOLIO_CATEGORIES; }
        );
    }

    function getSettings() {
        return withFallback(
            function () { return apiGet("getSettings"); },
            function () { return {}; }
        );
    }

    // Kept available even though the public inquiry form has been
    // removed from the homepage — the backend/admin still supports
    // inquiries if another form or method sends one here later.
    function submitInquiry(payload) {
        if (!BACKEND_CONFIGURED) {
            return Promise.reject(new Error("The inquiry backend isn't configured yet."));
        }
        return apiPost("submitInquiry", payload);
    }

    /* =====================================================
       FALLBACK DEMO DATA — Services / Process / Why SK
       Clearly marked as temporary. Real content becomes the
       source of truth once the Google Sheets backend is
       connected (see API_BASE_URL above). These mirror the
       content already published on the current live site.
    ===================================================== */

    var FALLBACK_SERVICES = [
        { id: "svc-1", title: "Residential Design", description: "Personalized homes designed around your lifestyle, comfort and personality.", icon: "✦", published: true, order: 0 },
        { id: "svc-2", title: "Commercial Interiors", description: "Sophisticated workplaces and commercial environments designed to make an impact.", icon: "◇", published: true, order: 1 },
        { id: "svc-3", title: "Space Planning", description: "Intelligent layouts that maximize functionality without compromising style.", icon: "⌂", published: true, order: 2 },
        { id: "svc-4", title: "Turnkey Solutions", description: "Complete execution from concept and materials to finishing and handover.", icon: "✧", published: true, order: 3 }
    ];

    var FALLBACK_PROCESS = [
        { id: "proc-1", step: "01", title: "Discovery", description: "We listen, understand your needs, lifestyle, goals and budget.", published: true, order: 0 },
        { id: "proc-2", step: "02", title: "Concept", description: "Ideas become visual concepts, moodboards and detailed plans.", published: true, order: 1 },
        { id: "proc-3", step: "03", title: "Design", description: "Every material, color, furniture and detail is carefully refined.", published: true, order: 2 },
        { id: "proc-4", step: "04", title: "Execution", description: "Our team brings the design to life with precision and care.", published: true, order: 3 },
        { id: "proc-5", step: "05", title: "Handover", description: "Your finished space, ready for you to experience.", published: true, order: 4 }
    ];

    var FALLBACK_WHY_SK = [
        { id: "why-1", title: "Experienced Team", description: "A team that has worked across residential and commercial spaces, bringing practical experience to every project.", published: true, order: 0 },
        { id: "why-2", title: "Custom Design", description: "Every space is designed around the people using it — no recycled templates or one-size-fits-all layouts.", published: true, order: 1 },
        { id: "why-3", title: "Quality Materials", description: "We select finishes and materials for durability as well as appearance, so spaces hold up over time.", published: true, order: 2 },
        { id: "why-4", title: "Professional Execution", description: "From planning to handover, projects are managed closely so the finished space matches the design.", published: true, order: 3 },
        { id: "why-5", title: "Nationwide Service", description: "Based in Dhaka and available to take on projects across Bangladesh.", published: true, order: 4 },
        { id: "why-6", title: "Transparent Process", description: "Clear communication at every stage, so you always know where your project stands.", published: true, order: 5 }
    ];

    // Empty until the admin adds real videos through the Video Gallery
    // panel — an empty gallery hides itself on the frontend rather
    // than showing placeholder video cards.
    var FALLBACK_VIDEOS = [];

    // Mirrors the structure the admin's Portfolio panel manages:
    // top-level categories (parentId "") and, for a couple of them,
    // one level of subcategories underneath.
    var FALLBACK_PORTFOLIO_CATEGORIES = [
        { id: "pf-photography", name: "Project Photography", parentId: "", order: 0 },
        { id: "pf-duplex", name: "Duplex House", parentId: "", order: 1 },
        { id: "pf-residence", name: "Residence", parentId: "", order: 2 },
        { id: "pf-residence-bedroom", name: "Bedroom", parentId: "pf-residence", order: 0 },
        { id: "pf-residence-dining", name: "Dining Room", parentId: "pf-residence", order: 1 },
        { id: "pf-residence-living", name: "Living Room", parentId: "pf-residence", order: 2 },
        { id: "pf-residence-kitchen", name: "Kitchen", parentId: "pf-residence", order: 3 },
        { id: "pf-office", name: "Office", parentId: "", order: 3 },
        { id: "pf-office-reception", name: "Reception", parentId: "pf-office", order: 0 },
        { id: "pf-office-conference", name: "Conference Room", parentId: "pf-office", order: 1 },
        { id: "pf-restaurant", name: "Restaurant", parentId: "", order: 4 },
        { id: "pf-showroom", name: "Showroom", parentId: "", order: 5 },
        { id: "pf-hotel", name: "Hotel & Resort", parentId: "", order: 6 },
        { id: "pf-landscaping", name: "Exterior & Landscaping", parentId: "", order: 7 }
    ];

    /* =====================================================
       SHARED UI HELPERS
       Used by every dynamic renderer (services, projects,
       process, why-sk, video) right after it injects HTML.
    ===================================================== */

    function fadeInImages(root) {
        (root || document).querySelectorAll("img").forEach(function (img) {
            if (img.classList.contains("loaded")) return;
            if (img.complete) {
                img.classList.add("loaded");
            } else {
                img.addEventListener("load", function () { img.classList.add("loaded"); });
                img.addEventListener("error", function () {
                    // broken image URL — hide it cleanly rather than
                    // leaving a broken-image icon on the page
                    img.style.display = "none";
                });
            }
        });
    }

    function observeReveal(root, selector) {
        var targets = (root || document).querySelectorAll(selector);
        if (!targets.length) return;

        targets.forEach(function (el) { el.classList.add("reveal-hidden"); });

        if (!("IntersectionObserver" in window)) {
            targets.forEach(function (el) { el.classList.add("visible"); });
            return;
        }

        var obs = new IntersectionObserver(function (entries, observer) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("visible");
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

        targets.forEach(function (el) { obs.observe(el); });

        // safety net: content must never be permanently stuck hidden
        // if IntersectionObserver never fires for some edge-case layout
        window.setTimeout(function () {
            targets.forEach(function (el) { el.classList.add("visible"); });
        }, 2500);
    }

    function staggerChildren(container) {
        if (!container) return;
        Array.from(container.children).forEach(function (child, index) {
            child.style.transitionDelay = Math.min(index * 100, 600) + "ms";
        });
    }

    /* =====================================================
       EXPORTS
    ===================================================== */

    window.SKApi = {
        getProjects: getProjects,
        getProject: getProject,
        getLatestProjects: getLatestProjects,
        getServices: getServices,
        getProcess: getProcess,
        getWhySK: getWhySK,
        getVideos: getVideos,
        getPortfolioCategories: getPortfolioCategories,
        getSettings: getSettings,
        submitInquiry: submitInquiry,
        isBackendConfigured: function () { return BACKEND_CONFIGURED; }
    };

    function normalizeImageUrl(url, width) {
        if (!url) return "";
        var value = String(url).trim();
        // Admin-uploaded images are stored as Google Drive links; only
        // Drive's /thumbnail?id=...&sz=... endpoint reliably renders as
        // an <img> src (the raw "uc?export=view&id=..." share-link
        // format is blocked or rate-limited when hotlinked, which is
        // why an image can silently fail to show even though the URL
        // "looks right"). Drive links come in a few different shapes
        // depending on how they were copied/generated, so every shape
        // is checked here rather than just one:
        //   - https://drive.google.com/uc?export=view&id=FILE_ID
        //   - https://drive.google.com/open?id=FILE_ID
        //   - https://drive.google.com/file/d/FILE_ID/view?usp=sharing
        //   - https://drive.google.com/thumbnail?id=FILE_ID&sz=...  (already correct)
        if (!/drive\.google\.com/.test(value)) return value;

        var fileId =
            (value.match(/[?&]id=([a-zA-Z0-9_-]+)/) || [])[1] ||
            (value.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || [])[1] ||
            (value.match(/\/d\/([a-zA-Z0-9_-]+)/) || [])[1];

        if (fileId) return "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w" + (width || 2000);
        return value;
    }

    window.SKUtils = {
        fadeInImages: fadeInImages,
        observeReveal: observeReveal,
        staggerChildren: staggerChildren,
        normalizeImageUrl: normalizeImageUrl
    };

})();
