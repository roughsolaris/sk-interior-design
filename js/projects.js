/* =========================================================
   SK INTERIOR DESIGN â€” PROJECTS DATA + UI
   =========================================================

   Renders the Selected Work grid, the All/Residential/Commercial
   filter, the full-screen project modal (with image gallery and
   project-to-project navigation), and the "Our Work in Motion"
   video section.

   A project has exactly these fields: title, category (Residential
   or Commercial), location, coverImageUrl, gallery (from the
   ProjectImages sheet), videoUrl (optional). Nothing else â€” no
   description, no before/after, no featured/published flags.

   Data comes from window.SKApi.getProjects() (js/api.js), which
   talks to the Apps Script backend and falls back to
   SK_FALLBACK_PROJECTS below if the backend isn't configured or
   unreachable.
========================================================= */

/* =====================================================
   FALLBACK / DEMO DATA
   â€” Real client project titles/locations, as already
     published on the current site.
   â€” Cover + gallery images are placeholder stock photography,
     not confirmed photos of these specific projects, kept only
     until real project photos are uploaded through the admin.
   â€” Used ONLY when the Apps Script backend isn't configured or
     can't be reached (see js/api.js). Once connected, the
     Google Sheet is the source of truth and this array is
     never read.
===================================================== */

window.SK_FALLBACK_PROJECTS = [
    {
        id: "modern-residence",
        title: "Modern Residence",
        category: "Residential",
        location: "Dhaka",
        coverImageUrl: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=90",
        gallery: [
            "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=90",
            "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1800&q=90",
            "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1400&q=90"
        ],
        videoUrl: "",
        order: 0
    },
    {
        id: "legal-tech-consultancy",
        title: "Legal Tech Consultancy",
        category: "Commercial",
        location: "Dhaka",
        coverImageUrl: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1400&q=90",
        gallery: [
            "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1400&q=90",
            "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1400&q=90"
        ],
        videoUrl: "",
        order: 1
    },
    {
        id: "contemporary-home",
        title: "Contemporary Home",
        category: "Residential",
        location: "Chittagong",
        coverImageUrl: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1400&q=90",
        gallery: [
            "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=1400&q=90",
            "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=90"
        ],
        videoUrl: "",
        order: 2
    },
    {
        id: "urban-luxury-apartment",
        title: "Urban Luxury Apartment",
        category: "Residential",
        location: "Dhaka",
        coverImageUrl: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1800&q=90",
        gallery: [
            "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1800&q=90",
            "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1400&q=90",
            "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1400&q=90"
        ],
        videoUrl: "",
        order: 3
    }
];

(function () {

    "use strict";

    var CATEGORIES = ["All", "Residential", "Commercial", "Spaces"];

    var state = {
        allProjects: [],
        filteredList: [], // the currently-visible, filtered project list — also what project-to-project nav moves through
        activeCategory: "All",
        portfolioFilter: null, // { id, name } — set only via the nav Portfolio dropdown (js/portfolio.js)
        portfolioCategoriesById: {}, // { id: name } — used to label each Spaces project card with its specific room type
        galleryIndex: 0,
        currentProject: null
    };

    var els = {};

    function qs(id) { return document.getElementById(id); }

    /* =====================================================
       FILTER BAR — plain All / Residential / Commercial /
       Spaces pills, all behaving identically (just a click,
       no dropdown). "Spaces" shows every project whose
       category is "Spaces", same as any other category.

       The specific room type (Bedroom, Living Room, etc.) is
       shown per-project instead — on each project card's label
       and in the project detail view — via displayCategoryLabel()
       below, which swaps in the Portfolio Category name.
    ===================================================== */

    function displayCategoryLabel(project) {
        if (project.category === "Spaces" && project.portfolioCategoryId) {
            var roomName = state.portfolioCategoriesById[project.portfolioCategoryId];
            if (roomName) return roomName;
        }
        return project.category || "";
    }

    function renderFilterBar() {
        if (!els.filterBar) return;

        var pills = CATEGORIES.map(function (cat) {
            var activeClass = (cat === state.activeCategory) ? " active" : "";
            return '<button class="filter-btn' + activeClass + '" type="button" data-category="' + cat + '">' + cat + '</button>';
        }).join("");

        // A chip still appears when a category was chosen from the nav
        // Portfolio dropdown (js/portfolio.js) rather than these pills.
        var chip = state.portfolioFilter
            ? '<button type="button" class="filter-chip" id="portfolioFilterChip">' +
                  escapeHtml(state.portfolioFilter.name) + '<span aria-hidden="true"> \u2715</span>' +
              '</button>'
            : "";

        els.filterBar.innerHTML = pills + chip;

        els.filterBar.querySelectorAll(".filter-btn[data-category]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                state.activeCategory = btn.dataset.category;
                state.portfolioFilter = null;
                renderFilterBar();
                renderProjectGrid();
            });
        });

        var chipBtn = document.getElementById("portfolioFilterChip");
        if (chipBtn) {
            chipBtn.addEventListener("click", function () {
                state.portfolioFilter = null;
                renderFilterBar();
                renderProjectGrid();
            });
        }
    }

    /* =====================================================
       PROJECT GRID
    ===================================================== */

    function spanClass(index) {
        if (index === 0) return "project-large";
        if (index === 3) return "project-wide";
        return "";
    }

    function currentFilteredList() {
        return state.allProjects.filter(function (p) {
            var matchesCategory = state.activeCategory === "All" || p.category === state.activeCategory;
            var matchesPortfolio = !state.portfolioFilter || p.portfolioCategoryId === state.portfolioFilter.id;
            return matchesCategory && matchesPortfolio;
        });
    }

    function renderProjectGrid() {
        if (!els.projectGrid) return;

        var list = currentFilteredList();
        state.filteredList = list;

        if (!list.length) {
            els.projectGrid.classList.add("is-empty");
            els.projectGrid.innerHTML = '<div class="project-empty">' +
                (state.portfolioFilter
                    ? "No projects tagged \u201c" + escapeHtml(state.portfolioFilter.name) + "\u201d yet."
                    : "No projects in this category yet.") +
                '</div>';
            return;
        }

        els.projectGrid.classList.remove("is-empty");

        els.projectGrid.innerHTML = list.map(function (p, i) {
            var cover = normalizeImageUrl(p.coverImageUrl || (p.gallery && p.gallery[0]) || "");
            var categoryLabel = displayCategoryLabel(p);
            return (
                '<article class="project-card ' + spanClass(i) + '" data-id="' + p.id + '">' +
                    '<div class="project-image">' +
                        '<img src="' + cover + '" alt="' + escapeHtml(p.title) + '" loading="lazy">' +
                        '<span class="project-tag">' + escapeHtml(categoryLabel) + '</span>' +
                        '<div class="project-overlay"><span>View Project →</span></div>' +
                    '</div>' +
                    '<div class="project-info">' +
                        '<div>' +
                            '<h3>' + escapeHtml(p.title) + '</h3>' +
                            '<p>' + escapeHtml(p.location || "") + (p.location && categoryLabel ? ' · ' : '') + escapeHtml(categoryLabel) + '</p>' +
                        '</div>' +
                        '<span>' + String(i + 1).padStart(2, "0") + '</span>' +
                    '</div>' +
                '</article>'
            );
        }).join("");

        SKUtils.fadeInImages(els.projectGrid);
        SKUtils.staggerChildren(els.projectGrid);
        SKUtils.observeReveal(els.projectGrid, ".project-card");

        els.projectGrid.querySelectorAll(".project-card").forEach(function (card) {
            card.addEventListener("click", function () {
                openProjectModal(card.dataset.id);
            });
        });
    }

    /* =====================================================
       VIDEO SECTION â€” OUR WORK IN MOTION
       Only projects with a videoUrl appear here. If none do,
       the section is hidden entirely (no empty video cards).
    ===================================================== */

    function renderVideoSection() {
        if (!els.videoGrid) return;

        var section = els.videoGrid.closest("section");
        var withVideo = state.allProjects.filter(function (p) { return !!(p.videoUrl && p.videoUrl.trim()); });

        if (!withVideo.length) {
            if (section) section.style.display = "none";
            return;
        }

        if (section) section.style.display = "";

        els.videoGrid.innerHTML = withVideo.map(function (p) {
            var cover = normalizeImageUrl(p.coverImageUrl || (p.gallery && p.gallery[0]) || "");
            var embed = embedUrl(p.videoUrl);
            if (!embed) return "";

            return (
                '<div class="video-card" data-video="' + escapeAttr(embed) + '" data-id="' + p.id + '">' +
                    '<div class="video-frame">' +
                        '<img src="' + cover + '" alt="' + escapeHtml(p.title) + '" loading="lazy">' +
                        '<div class="video-play"><span></span></div>' +
                    '</div>' +
                    '<div class="video-caption">' +
                        '<h3>' + escapeHtml(p.title) + '</h3>' +
                        '<span>' + escapeHtml([displayCategoryLabel(p), p.location].filter(Boolean).join(" · ")) + '</span>' +
                    '</div>' +
                '</div>'
            );
        }).join("");

        if (!els.videoGrid.innerHTML.trim()) {
            if (section) section.style.display = "none";
            return;
        }

        SKUtils.fadeInImages(els.videoGrid);
        SKUtils.staggerChildren(els.videoGrid);
        SKUtils.observeReveal(els.videoGrid, ".video-card");

        els.videoGrid.querySelectorAll(".video-card").forEach(function (card) {
            card.addEventListener("click", function () {
                var frame = card.querySelector(".video-frame");
                var src = card.dataset.video;
                if (!src) return;

                var iframe = document.createElement("iframe");
                iframe.src = src;
                iframe.title = card.querySelector("h3").textContent;
                iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture");
                iframe.setAttribute("allowfullscreen", "");
                iframe.loading = "lazy";

                var playBtn = frame.querySelector(".video-play");
                var img = frame.querySelector("img");
                if (playBtn) playBtn.remove();
                if (img) img.remove();
                frame.appendChild(iframe);

                card.style.cursor = "default";
            }, { once: true });
        });
    }

    // Normalizes a plain YouTube/Vimeo URL (or an already-embeddable
    // one) into a working iframe src. Returns "" for anything that
    // can't be resolved, so callers can skip broken video cards
    // instead of rendering a dead embed.
    function embedUrl(rawUrl) {
        if (!rawUrl) return "";
        var url = String(rawUrl).trim();
        if (!url) return "";

        // youtu.be/ID · youtube.com/watch?v=ID · m.youtube.com/watch?v=ID
        // youtube.com/embed/ID · youtube.com/shorts/ID
        var yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{6,})/);
        if (yt) return "https://www.youtube.com/embed/" + yt[1];

        // vimeo.com/ID · vimeo.com/video/ID · player.vimeo.com/video/ID
        var vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
        if (vimeo) return "https://player.vimeo.com/video/" + vimeo[1];

        // Already a YouTube/Vimeo embed URL â€” use as-is.
        if (/^https:\/\/(www\.youtube\.com\/embed\/|player\.vimeo\.com\/video\/)/.test(url)) {
            return url;
        }

        // Unrecognized host/format â€” don't guess; treat as invalid
        // rather than risk an empty or broken iframe.
        return "";
    }

    /* =====================================================
       PROJECT MODAL
    ===================================================== */

    function findProject(id) {
        for (var i = 0; i < state.allProjects.length; i++) {
            if (state.allProjects[i].id === id) return state.allProjects[i];
        }
        return null;
    }

    function projectGallery(project) {
        if (project.gallery && project.gallery.length) return project.gallery;
        if (project.coverImageUrl) return [project.coverImageUrl];
        return [];
    }

    function openProjectModal(id) {
        var project = findProject(id);
        if (!project) return;

        state.currentProject = project;
        state.galleryIndex = 0;

        var gallery = projectGallery(project);
        var categoryLabel = displayCategoryLabel(project);

        els.modalMeta.innerHTML =
            (categoryLabel ? '<span>' + escapeHtml(categoryLabel) + '</span>' : '') +
            (project.location ? '<span>' + escapeHtml(project.location) + '</span>' : '');

        els.modalTitle.textContent = project.title || "";

        var description = (project.description || "").trim();
        if (els.modalDescription) {
            els.modalDescription.textContent = description;
            els.modalDescription.style.display = description ? "" : "none";
        }

        var facts = "";
        if (categoryLabel) facts += '<div class="project-modal-fact"><span>Category</span><strong>' + escapeHtml(categoryLabel) + '</strong></div>';
        if (project.location) facts += '<div class="project-modal-fact"><span>Location</span><strong>' + escapeHtml(project.location) + '</strong></div>';
        els.modalFacts.innerHTML = facts;

        // optional video â€” hidden entirely if none / invalid
        var embed = embedUrl(project.videoUrl);
        if (embed) {
            els.modalVideo.innerHTML =
                '<div class="video-frame" style="height:280px;">' +
                    '<iframe src="' + escapeAttr(embed) + '" title="' + escapeAttr(project.title) + ' walkthrough" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>' +
                '</div>';
        } else {
            els.modalVideo.innerHTML = "";
        }

        renderGalleryThumbs(gallery);
        renderGalleryImage(gallery);
        renderGalleryDots(gallery);

        var multi = gallery.length > 1;
        els.galleryPrev.style.display = multi ? "flex" : "none";
        els.galleryNext.style.display = multi ? "flex" : "none";

        updateProjectNavButtons();

        els.projectModal.classList.add("active");
        els.projectModal.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-open");
        els.modalClose.focus();
    }

    function closeProjectModal() {
        els.projectModal.classList.remove("active");
        els.projectModal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");
        state.currentProject = null;
    }

    /* ---- thumbnail strip ---- */

    function renderGalleryThumbs(gallery) {
        gallery = gallery || projectGallery(state.currentProject || {});

        if (gallery.length < 2) {
            els.galleryThumbs.innerHTML = "";
            return;
        }

        els.galleryThumbs.innerHTML = gallery.map(function (url, i) {
            return (
                '<button type="button" class="gallery-thumb' + (i === state.galleryIndex ? " active" : "") + '" data-thumb-index="' + i + '" aria-label="View image ' + (i + 1) + '">' +
                    '<img src="' + escapeAttr(normalizeImageUrl(url)) + '" alt="" loading="lazy">' +
                '</button>'
            );
        }).join("");

        els.galleryThumbs.querySelectorAll(".gallery-thumb").forEach(function (thumb) {
            thumb.addEventListener("click", function () {
                var index = Number(thumb.dataset.thumbIndex);
                if (index === state.galleryIndex) return;
                state.galleryIndex = index;
                var g = projectGallery(state.currentProject);
                renderGalleryImage(g);
                renderGalleryDots(g);
            });
        });
    }

    function updateActiveThumb() {
        if (!els.galleryThumbs) return;

        var thumbs = els.galleryThumbs.querySelectorAll(".gallery-thumb");
        thumbs.forEach(function (thumb, i) {
            thumb.classList.toggle("active", i === state.galleryIndex);
        });

        var activeThumb = els.galleryThumbs.querySelector(".gallery-thumb.active");
        if (activeThumb) {
            activeThumb.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        }
    }

    /* ---- main image loading, with a loading state that only
       appears when a load genuinely takes noticeable time, and
       preloading of the adjacent images so arrow/swipe navigation
       feels instant once an image has already been seen ---- */

    var imageLoadToken = 0;

    function renderGalleryImage(gallery) {
        gallery = gallery || projectGallery(state.currentProject || {});
        if (!gallery.length) return;

        var url = normalizeImageUrl(gallery[state.galleryIndex]);
        var altText = (state.currentProject ? state.currentProject.title : "") + " — image " + (state.galleryIndex + 1);

        loadMainImage(url, altText);
        preloadAdjacentImages(gallery);
        updateActiveThumb();
    }

    function loadMainImage(url, altText) {
        if (!url) return;

        var thisLoad = ++imageLoadToken;
        var probe = new Image();
        var revealed = false;

        // Only show the loading state if the image genuinely hasn't
        // arrived within ~150ms — cached/instant images never flash it.
        var spinnerTimer = window.setTimeout(function () {
            if (!revealed && thisLoad === imageLoadToken) {
                els.galleryLoading.classList.add("active");
            }
        }, 150);

        function finish(showImage) {
            if (thisLoad !== imageLoadToken) return; // a newer navigation superseded this load
            revealed = true;
            window.clearTimeout(spinnerTimer);
            els.galleryLoading.classList.remove("active");
            if (showImage) {
                els.modalGalleryImg.src = url;
                els.modalGalleryImg.alt = altText;
            }
        }

        probe.onload = function () { finish(true); };
        probe.onerror = function () { finish(false); };
        probe.src = url;
    }

    function preloadAdjacentImages(gallery) {
        if (gallery.length < 2) return;
        var nextIdx = (state.galleryIndex + 1) % gallery.length;
        var prevIdx = (state.galleryIndex - 1 + gallery.length) % gallery.length;
        [nextIdx, prevIdx].forEach(function (idx) {
            var preload = new Image();
            preload.src = normalizeImageUrl(gallery[idx]);
        });
    }

    function renderGalleryDots(gallery) {
        gallery = gallery || projectGallery(state.currentProject || {});
        els.galleryDots.innerHTML = gallery.map(function (_, i) {
            return '<span class="gallery-dot' + (i === state.galleryIndex ? " active" : "") + '"></span>';
        }).join("");
    }

    function nextImage() {
        if (!state.currentProject) return;
        var gallery = projectGallery(state.currentProject);
        if (!gallery.length) return;
        state.galleryIndex = (state.galleryIndex + 1) % gallery.length;
        renderGalleryImage(gallery);
        renderGalleryDots(gallery);
    }

    function prevImage() {
        if (!state.currentProject) return;
        var gallery = projectGallery(state.currentProject);
        if (!gallery.length) return;
        state.galleryIndex = (state.galleryIndex - 1 + gallery.length) % gallery.length;
        renderGalleryImage(gallery);
        renderGalleryDots(gallery);
    }

    /* ---- project-to-project navigation (moves through state.filteredList) ---- */

    function currentProjectIndex() {
        if (!state.currentProject) return -1;
        for (var i = 0; i < state.filteredList.length; i++) {
            if (state.filteredList[i].id === state.currentProject.id) return i;
        }
        return -1;
    }

    function updateProjectNavButtons() {
        var hasMultiple = state.filteredList.length > 1;
        els.modalPrevProject.disabled = !hasMultiple;
        els.modalNextProject.disabled = !hasMultiple;
    }

    function goToAdjacentProject(offset) {
        if (state.filteredList.length < 2) return;
        var index = currentProjectIndex();
        if (index === -1) return;

        var nextIndex = (index + offset + state.filteredList.length) % state.filteredList.length;
        openProjectModal(state.filteredList[nextIndex].id);
    }

    function initModalEvents() {
        els.modalClose.addEventListener("click", closeProjectModal);

        els.projectModal.addEventListener("click", function (e) {
            if (e.target === els.projectModal) closeProjectModal();
        });

        document.addEventListener("keydown", function (e) {
            if (!els.projectModal.classList.contains("active")) return;
            if (e.key === "Escape") closeProjectModal();
            if (e.key === "ArrowRight") nextImage();
            if (e.key === "ArrowLeft") prevImage();
        });

        els.galleryNext.addEventListener("click", nextImage);
        els.galleryPrev.addEventListener("click", prevImage);

        els.modalPrevProject.addEventListener("click", function () { goToAdjacentProject(-1); });
        els.modalNextProject.addEventListener("click", function () { goToAdjacentProject(1); });

        var touchStartX = 0;
        var touchEndX = 0;

        els.modalGallery.addEventListener("touchstart", function (e) {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        els.modalGallery.addEventListener("touchend", function (e) {
            touchEndX = e.changedTouches[0].screenX;
            var delta = touchEndX - touchStartX;
            if (Math.abs(delta) < 40) return;
            if (delta < 0) nextImage(); else prevImage();
        }, { passive: true });
    }

    /* =====================================================
       SMALL UTILITIES
    ===================================================== */

    function normalizeImageUrl(url) {
        if (window.SKUtils && window.SKUtils.normalizeImageUrl) {
            return window.SKUtils.normalizeImageUrl(url);
        }
        // Fallback if js/api.js somehow didn't load — keeps this file
        // working standalone rather than throwing.
        if (!url) return "";
        var value = String(url).trim();
        var match = value.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (match) return "https://drive.google.com/thumbnail?id=" + match[1] + "&sz=w2000";
        return value;
    }

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function escapeAttr(str) {
        return escapeHtml(str);
    }

    /* =====================================================
       INIT
    ===================================================== */

    function cacheEls() {
        els.filterBar = qs("filterBar");
        els.projectGrid = qs("projectGrid");
        els.videoGrid = qs("videoGrid");
        els.projectModal = qs("projectModal");
        els.modalClose = qs("modalClose");
        els.modalGallery = qs("modalGallery");
        els.modalGalleryImg = qs("modalGalleryImg");
        els.galleryPrev = qs("galleryPrev");
        els.galleryNext = qs("galleryNext");
        els.galleryDots = qs("galleryDots");
        els.galleryThumbs = qs("galleryThumbs");
        els.galleryLoading = qs("galleryLoading");
        els.modalPrevProject = qs("modalPrevProject");
        els.modalNextProject = qs("modalNextProject");
        els.modalMeta = qs("modalMeta");
        els.modalTitle = qs("modalTitle");
        els.modalDescription = qs("modalDescription");
        els.modalFacts = qs("modalFacts");
        els.modalVideo = qs("modalVideo");
    }

    function showGridError() {
        if (els.projectGrid) {
            els.projectGrid.innerHTML = '<div class="project-empty">Projects couldn\u2019t be loaded right now. Please refresh the page.</div>';
        }
    }

    function init() {
        cacheEls();
        if (!els.projectGrid) return;

        initModalEvents();

        var projectsPromise = window.SKApi.getProjects();
        var categoriesPromise = window.SKApi.getPortfolioCategories
            ? window.SKApi.getPortfolioCategories()
            : Promise.resolve([]);

        Promise.all([projectsPromise, categoriesPromise])
            .then(function (results) {
                var projects = results[0];
                var categories = results[1];

                state.allProjects = (projects || [])
                    .slice()
                    .sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); });

                state.portfolioCategoriesById = {};
                (categories || []).forEach(function (c) {
                    state.portfolioCategoriesById[c.id] = c.name;
                });

                renderFilterBar();
                renderProjectGrid();
                renderVideoSection();

                if (state.pendingPortfolioFilter) {
                    var pending = state.pendingPortfolioFilter;
                    state.pendingPortfolioFilter = null;
                    pending();
                }
            })
            .catch(function (err) {
                console.error("[SK Interior] Failed to load projects:", err);
                showGridError();
            });
    }

    // Runs synchronously (this script tag comes after the relevant
    // markup), but the actual rendering above happens once the async
    // getProjects() call resolves â€” script.js does not depend on the
    // project grid existing synchronously, by design.
    init();

    window.SKProjects = {
        getAll: function () { return state.allProjects.slice(); },
        getById: findProject,
        openModal: openProjectModal,

        // Called by js/portfolio.js when a Portfolio dropdown category
        // is chosen. Scrolls to the grid and filters it to only the
        // projects tagged with that portfolio category — a real filter
        // over live project data, not just a jump link.
        filterByPortfolioCategory: function (categoryId, categoryName) {
            var filter = { id: categoryId, name: categoryName };

            var apply = function () {
                state.portfolioFilter = filter;
                renderFilterBar();
                renderProjectGrid();
            };

            if (state.allProjects.length) {
                apply();
            } else {
                // Projects haven't finished loading yet — apply the
                // filter as soon as they do, instead of filtering an
                // empty list.
                state.pendingPortfolioFilter = apply;
            }

            var target = document.getElementById("projects");
            if (target) {
                var offset = 90;
                var top = target.getBoundingClientRect().top + window.scrollY - offset;
                window.scrollTo({ top: top, behavior: "smooth" });
            }
        }
    };

})();



