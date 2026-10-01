/* =========================================================
   SK INTERIOR DESIGN — PORTFOLIO NAV, LATEST PROJECT, VIDEO GALLERY
   =========================================================

   Three independent, self-contained features, each with its own
   data source, so a slow/failed request in one never blocks the
   others (same pattern as script.js's dynamic sections):

   1. Portfolio dropdown  — nav item, built from SKApi.getPortfolioCategories()
   2. Latest Project      — homepage section, built from SKApi.getLatestProjects()
   3. Video Gallery        — homepage section, built from SKApi.getVideos()
      (standalone videos only — never mixed with project data)

   Requires js/api.js to be loaded first (window.SKApi / window.SKUtils),
   and js/projects.js to be loaded first for the Portfolio dropdown's
   click-to-filter behavior (window.SKProjects.filterByPortfolioCategory).
========================================================= */

(function () {

    "use strict";

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function byOrder(a, b) {
        return (Number(a.order) || 0) - (Number(b.order) || 0);
    }

    /* =====================================================
       1. PORTFOLIO DROPDOWN
       Two-level flyout: top-level categories in the main nav
       dropdown, subcategories in a nested flyout. Click-to-open
       on touch/mobile, hover-or-click on desktop. Every entry
       filters the real Projects grid via SKProjects.
    ===================================================== */

    function renderPortfolioDropdown() {

        var trigger = document.getElementById("portfolioNavTrigger");
        var panel = document.getElementById("portfolioDropdownPanel");
        var navItem = document.getElementById("portfolioNavItem");

        if (!trigger || !panel || !navItem) return;

        window.SKApi.getPortfolioCategories()
            .then(function (categories) {

                var topLevel = (categories || []).filter(function (c) { return !c.parentId; }).sort(byOrder);

                if (!topLevel.length) {
                    // No categories added in admin yet — hide the whole
                    // "Portfolio" nav item rather than showing an empty,
                    // unclickable-looking dropdown.
                    navItem.style.display = "none";
                    return;
                }

                navItem.style.display = "";

                panel.innerHTML = topLevel.map(function (cat) {

                    var children = categories.filter(function (c) { return c.parentId === cat.id; }).sort(byOrder);

                    var childMarkup = children.length
                        ? '<ul class="portfolio-subnav">' +
                              children.map(function (child) {
                                  return '<li><button type="button" class="portfolio-sublink" data-id="' + child.id + '" data-name="' + escapeHtml(child.name) + '">' +
                                      escapeHtml(child.name) + '</button></li>';
                              }).join("") +
                          '</ul>'
                        : "";

                    return '<div class="portfolio-dropdown-item' + (children.length ? " has-children" : "") + '">' +
                        '<button type="button" class="portfolio-toplink" data-id="' + cat.id + '" data-name="' + escapeHtml(cat.name) + '">' +
                            escapeHtml(cat.name) +
                            (children.length ? '<span class="portfolio-caret" aria-hidden="true"></span>' : "") +
                        '</button>' +
                        childMarkup +
                    '</div>';

                }).join("");

                panel.querySelectorAll("[data-id]").forEach(function (btn) {
                    btn.addEventListener("click", function () {
                        closePortfolioDropdown();
                        closeMobileNavIfOpen();
                        window.SKProjects && window.SKProjects.filterByPortfolioCategory(btn.dataset.id, btn.dataset.name);
                    });
                });

            })
            .catch(function (err) {
                console.error("[SK Interior] Failed to load portfolio categories:", err);
                navItem.style.display = "none";
            });

    }

    function closeMobileNavIfOpen() {
        var menuToggle = document.querySelector(".menu-toggle");
        var navLinks = document.querySelector(".nav-links");
        if (!menuToggle || !navLinks || !navLinks.classList.contains("active")) return;

        menuToggle.classList.remove("active");
        navLinks.classList.remove("active");
        document.body.classList.remove("menu-open");
        menuToggle.setAttribute("aria-label", "Open Menu");
        menuToggle.setAttribute("aria-expanded", "false");
    }

    function openPortfolioDropdown() {
        var trigger = document.getElementById("portfolioNavTrigger");
        var panel = document.getElementById("portfolioDropdownPanel");
        if (!trigger || !panel) return;
        trigger.setAttribute("aria-expanded", "true");
        panel.classList.add("open");
    }

    function closePortfolioDropdown() {
        var trigger = document.getElementById("portfolioNavTrigger");
        var panel = document.getElementById("portfolioDropdownPanel");
        if (!trigger || !panel) return;
        trigger.setAttribute("aria-expanded", "false");
        panel.classList.remove("open");
        document.querySelectorAll(".portfolio-dropdown-item.open").forEach(function (el) {
            el.classList.remove("open");
        });
    }

    function initPortfolioNav() {

        var trigger = document.getElementById("portfolioNavTrigger");
        var wrapper = document.getElementById("portfolioNavItem");
        var panel = document.getElementById("portfolioDropdownPanel");

        if (!trigger || !wrapper || !panel) return;

        // Click/tap toggles — works identically on desktop and mobile,
        // so nothing here depends on :hover.
        trigger.addEventListener("click", function (e) {
            e.preventDefault();
            var isOpen = panel.classList.contains("open");
            isOpen ? closePortfolioDropdown() : openPortfolioDropdown();
        });

        document.addEventListener("click", function (e) {
            if (!wrapper.contains(e.target)) closePortfolioDropdown();
        });

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape") closePortfolioDropdown();
        });

    }


    /* =====================================================
       2. LATEST PROJECT
       Homepage section — always real project data, sorted by
       creation date, most recent first.
    ===================================================== */

    function renderLatestProject() {

        var section = document.getElementById("latestProject");
        var grid = document.getElementById("latestProjectGrid");

        if (!section || !grid) return;

        Promise.all([
            window.SKApi.getLatestProjects(6),
            window.SKApi.getPortfolioCategories()
        ])
            .then(function (results) {

                var projects = results[0];
                var categories = results[1] || [];

                var categoryNamesById = {};
                categories.forEach(function (c) { categoryNamesById[c.id] = c.name; });

                function categoryLabel(p) {
                    if (p.category === "Spaces" && p.portfolioCategoryId && categoryNamesById[p.portfolioCategoryId]) {
                        return categoryNamesById[p.portfolioCategoryId];
                    }
                    return p.category || "";
                }

                if (!projects || !projects.length) {
                    section.style.display = "none";
                    return;
                }

                grid.innerHTML = projects.map(function (p) {
                    var cover = window.SKUtils.normalizeImageUrl(p.coverImageUrl) || "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80";
                    return '<article class="latest-project-card" data-project-id="' + p.id + '">' +
                        '<div class="latest-project-image">' +
                            '<img src="' + escapeHtml(cover) + '" alt="' + escapeHtml(p.title) + '" loading="lazy">' +
                        '</div>' +
                        '<div class="latest-project-info">' +
                            '<span>' + escapeHtml(categoryLabel(p)) + '</span>' +
                            '<h3>' + escapeHtml(p.title) + '</h3>' +
                        '</div>' +
                    '</article>';
                }).join("");

                grid.querySelectorAll(".latest-project-card").forEach(function (card) {
                    card.addEventListener("click", function () {
                        if (window.SKProjects && window.SKProjects.openModal) {
                            window.SKProjects.openModal(card.dataset.projectId);
                        } else {
                            var projectsSection = document.getElementById("projects");
                            if (projectsSection) projectsSection.scrollIntoView({ behavior: "smooth" });
                        }
                    });
                });

                window.SKUtils.fadeInImages(grid);
                window.SKUtils.staggerChildren(grid);
                window.SKUtils.observeReveal(grid, ".latest-project-card");

            })
            .catch(function (err) {
                console.error("[SK Interior] Failed to load latest projects:", err);
                section.style.display = "none";
            });

    }


    /* =====================================================
       3. VIDEO GALLERY (standalone — never project videos)
    ===================================================== */

    function parseYouTubeId(url) {
        if (!url) return null;
        var match = String(url).match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
        return match ? match[1] : null;
    }

    function renderVideoGallery() {

        var section = document.getElementById("videoGallery");
        var grid = document.getElementById("videoGalleryGrid");

        if (!section || !grid) return;

        window.SKApi.getVideos()
            .then(function (videos) {

                var valid = (videos || [])
                    .map(function (v) { return { id: v.id, title: v.title, youtubeId: parseYouTubeId(v.youtubeUrl), order: v.order }; })
                    .filter(function (v) { return !!v.youtubeId; }) // invalid/empty URLs are skipped, never break the page
                    .sort(byOrder);

                if (!valid.length) {
                    section.style.display = "none";
                    return;
                }

                section.style.display = "";

                var showAll = grid.dataset.showAll === "true";
                var HOMEPAGE_VIDEO_GALLERY_LIMIT = 6;
                var visible = showAll ? valid : valid.slice(0, HOMEPAGE_VIDEO_GALLERY_LIMIT);

                // Reuses the same .video-card / .video-frame / .video-play
                // markup and styling as the project videos in
                // js/projects.js, so both video sections look identical —
                // this one is just fed by the standalone Videos sheet
                // instead of project data.
                grid.innerHTML = visible.map(function (v) {
                    var thumb = "https://img.youtube.com/vi/" + v.youtubeId + "/hqdefault.jpg";
                    return '<div class="video-card" data-embed="https://www.youtube.com/embed/' + v.youtubeId + '?autoplay=1&rel=0" data-title="' + escapeHtml(v.title || "Video") + '">' +
                        '<div class="video-frame">' +
                            '<img src="' + thumb + '" alt="' + escapeHtml(v.title || "Video") + '" loading="lazy">' +
                            '<div class="video-play"><span></span></div>' +
                        '</div>' +
                        (v.title ? '<div class="video-caption"><h3>' + escapeHtml(v.title) + '</h3></div>' : "") +
                    '</div>';
                }).join("") + (!showAll && valid.length > HOMEPAGE_VIDEO_GALLERY_LIMIT
                    ? window.SKUtils.viewAllRow("videos.html", "View All Videos")
                    : "");

                grid.querySelectorAll(".video-card").forEach(function (card) {
                    card.addEventListener("click", function () {
                        var frame = card.querySelector(".video-frame");
                        var src = card.dataset.embed;
                        if (!src) return;

                        var iframe = document.createElement("iframe");
                        iframe.src = src;
                        iframe.title = card.dataset.title;
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

                window.SKUtils.fadeInImages(grid);
                window.SKUtils.staggerChildren(grid);
                window.SKUtils.observeReveal(grid, ".video-card");

            })
            .catch(function (err) {
                console.error("[SK Interior] Failed to load video gallery:", err);
                section.style.display = "none";
            });

    }


    /* =====================================================
       INIT
    ===================================================== */

    if (window.SKApi && window.SKUtils) {
        initPortfolioNav();
        renderPortfolioDropdown();
        renderLatestProject();
        renderVideoGallery();
    } else {
        console.error("[SK Interior] js/api.js did not load correctly — portfolio nav, latest project and video gallery will stay empty.");
    }

})();
