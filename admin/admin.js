/* =========================================================
   SK INTERIOR DESIGN — ADMIN PANEL LOGIC
   =========================================================
   Runs on both login.html and dashboard.html (this file is
   shared — it detects which page it's on via which elements
   exist). Talks directly to the Apps Script backend defined
   in apps-script/Code.gs; no fallback data here — admin
   always needs the real thing, and shows a clear error if
   the backend isn't reachable.
========================================================= */

(function () {

    "use strict";

    var TOKEN_KEY = "sk_admin_token";
    var TOKEN_EXPIRES_KEY = "sk_admin_token_expires";

    // Deliberately sessionStorage, not localStorage: sessionStorage is
    // cleared automatically when the browser (or tab) is fully closed,
    // so a returning admin always has to log in again — while still
    // persisting normally across page reloads/navigation within the
    // same open session, so there's no login loop while working in
    // the dashboard. This is a frontend-only storage choice; nothing
    // about the backend session/token itself changes.

    /* =====================================================
       LOW-LEVEL REQUEST HELPER
    ===================================================== */

    function apiPost(action, payload, opts) {
        opts = opts || {};

        if (!API_BASE_URL) {
            return Promise.reject(new Error("API_BASE_URL isn't configured yet in js/config.js."));
        }

        var body = { action: action, payload: payload || {} };

        if (!opts.skipAuth) {
            var token = sessionStorage.getItem(TOKEN_KEY);
            if (!token) {
                redirectToLogin();
                return Promise.reject(new Error("Not signed in."));
            }
            body.payload.token = token;
        }

        return fetch(API_BASE_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(body)
        })
            .then(function (res) { return res.json(); })
            .then(function (response) {
                if (!response || response.success !== true) {
                    var message = (response && response.message) || "Request failed.";

                    if (message === "SESSION_EXPIRED") {
                        clearSession();
                        redirectToLogin(true);
                    }

                    throw new Error(message);
                }
                return response.data;
            })
            .catch(function (err) {
                if (err.message === "Failed to fetch") {
                    throw new Error("Couldn't reach the backend. Check your connection and that API_BASE_URL is correct.");
                }
                throw err;
            });
    }

    function clearSession() {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_EXPIRES_KEY);
    }

    function redirectToLogin(expired) {
        var onLoginPage = !!document.getElementById("loginForm");
        if (onLoginPage) return;
        window.location.href = "login.html" + (expired ? "?expired=1" : "");
    }

    function isSessionValidLocally() {
        var token = sessionStorage.getItem(TOKEN_KEY);
        var expires = Number(sessionStorage.getItem(TOKEN_EXPIRES_KEY) || 0);
        return !!token && Date.now() < expires;
    }

    /* =====================================================
       TOAST / ALERT HELPERS
    ===================================================== */

    function showToast(type, message) {
        var stack = document.getElementById("toastStack");
        if (!stack) return;

        var el = document.createElement("div");
        el.className = "toast " + type;
        el.textContent = message;
        stack.appendChild(el);

        setTimeout(function () {
            el.style.transition = "opacity .3s ease";
            el.style.opacity = "0";
            setTimeout(function () { el.remove(); }, 300);
        }, 4000);
    }

    function showFormAlert(id, message) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = message;
        el.classList.toggle("active", !!message);
    }

    function escapeHtml(str) {
        return String(str == null ? "" : str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

function normalizeImageUrl(url) {
    if (!url) return "";

    var value = String(url).trim();
    if (!/drive\.google\.com/.test(value)) return value;

    var fileId =
        (value.match(/[?&]id=([a-zA-Z0-9_-]+)/) || [])[1] ||
        (value.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || [])[1] ||
        (value.match(/\/d\/([a-zA-Z0-9_-]+)/) || [])[1];

    if (fileId) return "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w1000";

    return value;
}

    function truncate(str, n) {
        str = String(str || "");
        return str.length > n ? str.slice(0, n) + "…" : str;
    }

    function formatDate(iso) {
        if (!iso) return "—";
        var d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) +
            " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    }

    function isTrue(v) { return v === true || v === "TRUE"; }

    /* =====================================================
       LOGIN PAGE
    ===================================================== */

    function initLoginPage() {
        var form = document.getElementById("loginForm");
        if (!form) return;

        if (new URLSearchParams(window.location.search).get("expired") === "1") {
            showFormAlert("loginAlert", "Your session expired. Please sign in again.");
        }

        if (isSessionValidLocally()) {
            window.location.href = "dashboard.html";
            return;
        }

        form.addEventListener("submit", function (e) {
            e.preventDefault();

            showFormAlert("loginAlert", "");
            var btn = document.getElementById("loginBtn");
            var password = document.getElementById("password").value;

            if (!password) {
                showFormAlert("loginAlert", "Please enter the password.");
                return;
            }

            btn.disabled = true;
            btn.textContent = "Signing in…";

            apiPost("login", { password: password }, { skipAuth: true })
                .then(function (data) {
                    sessionStorage.setItem(TOKEN_KEY, data.token);
                    sessionStorage.setItem(TOKEN_EXPIRES_KEY, String(Date.now() + (data.expiresIn * 1000)));
                    window.location.href = "dashboard.html";
                })
                .catch(function (err) {
                    showFormAlert("loginAlert", err.message || "Sign in failed.");
                })
                .finally(function () {
                    btn.disabled = false;
                    btn.textContent = "Sign In";
                });
        });
    }

    /* =====================================================
       DASHBOARD SHELL (nav, logout, mobile menu)
    ===================================================== */

    var dashState = {
        projects: [],
        services: [],
        process: [],
        whySK: [],
        inquiries: [],
        portfolioCategories: [],
        videos: [],
        coverUrl: "",
        homepageUrl: "",
        galleryImages: [], // [{id, imageUrl, order}]
        editingProjectId: null
    };

    function initDashboard() {
        var shell = document.getElementById("navList");
        if (!shell) return;

        if (!isSessionValidLocally()) {
            redirectToLogin();
            return;
        }

        initNav();
        initLogout();
        initMobileMenu();
        initSessionExpiryWarning();

        initProjectsView();
        initHomeView();
        initPortfolioView();
        initVideosView();
        initServicesView();
        initProcessView();
        initWhySKView();
        initInquiriesView();
        initSettingsView();

        loadDashboardStats();
    }

    function initNav() {
        var items = document.querySelectorAll(".nav-item[data-view]");

        items.forEach(function (btn) {
            btn.addEventListener("click", function () {
                items.forEach(function (b) { b.classList.remove("active"); });
                btn.classList.add("active");

                document.querySelectorAll(".view").forEach(function (v) { v.classList.remove("active"); });
                var view = document.getElementById("view-" + btn.dataset.view);
                if (view) view.classList.add("active");

                document.getElementById("viewTitle").textContent = btn.textContent;

                document.getElementById("sidebar").classList.remove("open");

                loadViewData(btn.dataset.view);
            });
        });
    }

    function loadViewData(view) {
        if (view === "dashboard") loadDashboardStats();
        if (view === "projects") loadProjects();
        if (view === "services") loadServices();
        if (view === "process") loadProcess();
        if (view === "whysk") loadWhySK();
        if (view === "inquiries") loadInquiries();
        if (view === "settings") loadSettings();
        if (view === "home") loadHomeSettings();
        if (view === "portfolio") loadPortfolioCategories();
        if (view === "videos") loadVideos();
    }

    function initLogout() {
        ["logoutBtn", "settingsLogoutBtn"].forEach(function (id) {
            var btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener("click", function () {
                var token = sessionStorage.getItem(TOKEN_KEY);
                clearSession();
                apiPost("logout", { token: token }, { skipAuth: true }).catch(function () {});
                window.location.href = "login.html";
            });
        });
    }

    function initMobileMenu() {
        var menuBtn = document.getElementById("menuBtn");
        var sidebar = document.getElementById("sidebar");
        if (!menuBtn || !sidebar) return;
        menuBtn.addEventListener("click", function () { sidebar.classList.toggle("open"); });
    }

    function initSessionExpiryWarning() {
        setInterval(function () {
            var expires = Number(sessionStorage.getItem(TOKEN_EXPIRES_KEY) || 0);
            var msLeft = expires - Date.now();
            var banner = document.getElementById("sessionBanner");
            if (!banner) return;

            if (msLeft <= 0) {
                redirectToLogin(true);
            } else if (msLeft < 5 * 60 * 1000) {
                banner.classList.add("active");
            }
        }, 30000);
    }

    function loadDashboardStats() {
        apiPost("getDashboardStats", {})
            .then(function (stats) {
                document.getElementById("statTotalProjects").textContent = stats.totalProjects;
                document.getElementById("statResidentialProjects").textContent = stats.residentialProjects;
                document.getElementById("statCommercialProjects").textContent = stats.commercialProjects;
                document.getElementById("statTotalServices").textContent = stats.totalServices;
                document.getElementById("statTotalInquiries").textContent = stats.totalInquiries;
                document.getElementById("statPendingInquiries").textContent = stats.pendingInquiries;
            })
            .catch(function (err) { showToast("error", err.message); });
    }

    /* =====================================================
       MODAL HELPERS (generic)
    ===================================================== */

    function openModal(id) { document.getElementById(id).classList.add("active"); }
    function closeModal(id) { document.getElementById(id).classList.remove("active"); }

    document.addEventListener("click", function (e) {
        if (e.target.matches("[data-close-modal]")) {
            closeModal(e.target.dataset.closeModal);
        }
        if (e.target.classList.contains("modal-overlay")) {
            e.target.classList.remove("active");
        }
    });

    /* =====================================================
       PROJECTS
    ===================================================== */

    function initProjectsView() {
        document.getElementById("addProjectBtn").addEventListener("click", function () { openProjectEditor(null); });
        document.getElementById("projectForm").addEventListener("submit", saveProject);
        document.getElementById("deleteProjectBtn").addEventListener("click", deleteCurrentProject);

        ["projectSearch", "projectCategoryFilter"]
            .forEach(function (id) { document.getElementById(id).addEventListener("input", renderProjectsTable); });

        setupImageUploader("cover", false);
        setupImageUploader("gallery", true);
    }

    function loadProjects() {
        var tbody = document.getElementById("projectsTableBody");
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6"><span class="spinner"></span> Loading…</td></tr>';

        apiPost("listProjectsAdmin", {})
            .then(function (projects) {
                dashState.projects = projects || [];
                renderProjectsTable();
            })
            .catch(function (err) {
                tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Couldn\u2019t load projects: ' + escapeHtml(err.message) + '</td></tr>';
            });
    }

    function renderProjectsTable() {
        var tbody = document.getElementById("projectsTableBody");
        var search = document.getElementById("projectSearch").value.trim().toLowerCase();
        var category = document.getElementById("projectCategoryFilter").value;

        var list = dashState.projects.filter(function (p) {
            if (search && !((p.title || "").toLowerCase().includes(search) || (p.location || "").toLowerCase().includes(search))) return false;
            if (category && p.category !== category) return false;
            return true;
        });

        if (!list.length) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No projects match. Try adjusting filters, or add a new project.</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(function (p) {
            return (
                '<tr data-id="' + p.id + '">' +
                    '<td>' + (p.coverImageUrl ? '<img class="thumb" src="' + normalizeImageUrl(p.coverImageUrl) + '" alt="">' : '<div class="thumb"></div>') + '</td>' +
                    '<td>' + escapeHtml(p.title) + '</td>' +
                    '<td>' + escapeHtml(p.category || "—") + '</td>' +
                    '<td>' + escapeHtml(p.location || "—") + '</td>' +
                    '<td>' + escapeHtml(p.order != null ? p.order : 0) + '</td>' +
                    '<td class="row-actions"><button class="btn btn-sm edit-project-btn">Edit</button></td>' +
                '</tr>'
            );
        }).join("");

        tbody.querySelectorAll(".edit-project-btn").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
        e.stopPropagation();

        var id = btn.closest("tr").dataset.id;
        var project = dashState.projects.filter(function (p) {
            return p.id === id;
        })[0];

        openProjectEditor(project);
    });
});


/* Mobile: tap anywhere on the project card to edit */
tbody.querySelectorAll("tr[data-id]").forEach(function (row) {
    row.addEventListener("click", function (e) {

        /* Don't trigger twice when the Edit button itself is tapped */
        if (e.target.closest("button")) return;

        if (window.matchMedia("(max-width: 600px)").matches) {

            var id = row.dataset.id;

            var project = dashState.projects.filter(function (p) {
                return p.id === id;
            })[0];

            if (project) {
                openProjectEditor(project);
            }
        }
    });
});
    }

    function openProjectEditor(project) {
        var form = document.getElementById("projectForm");
        form.reset();
        showFormAlert("projectFormAlert", "");

        dashState.editingProjectId = project ? project.id : null;
        dashState.coverUrl = (project && project.coverImageUrl) || "";
        dashState.galleryImages = [];

        document.getElementById("projectModalTitle").textContent = project ? "Edit Project" : "Add Project";
        document.getElementById("projectId").value = project ? project.id : "";
        document.getElementById("projectTitle").value = project ? project.title || "" : "";
        document.getElementById("projectCategory").value = project ? project.category || "Residential" : "Residential";
        document.getElementById("projectLocation").value = project ? project.location || "" : "";
        document.getElementById("projectDescription").value = project ? project.description || "" : "";
        document.getElementById("projectOrder").value = project ? (project.order || 0) : dashState.projects.length;
        document.getElementById("projectVideoUrl").value = project ? project.videoUrl || "" : "";

        populateProjectPortfolioCategorySelect(project ? project.portfolioCategoryId || "" : "");

        document.getElementById("deleteProjectBtn").style.display = project ? "" : "none";

        renderSingleImagePreview("cover", dashState.coverUrl);

        var galleryUploader = document.getElementById("galleryUploader");
        if (project && project.id) {
            galleryUploader.style.display = "";
            loadProjectGallery(project.id);
        } else {
            galleryUploader.style.display = "none";
            document.getElementById("galleryImagePreview").innerHTML = "";
        }

        openModal("projectModalOverlay");
    }

    function populateProjectPortfolioCategorySelect(selectedId) {
        var select = document.getElementById("projectPortfolioCategory");
        if (!select) return;

        select.innerHTML = '<option value="">\u2014 None \u2014</option>';

        apiPost("listPortfolioCategoriesAdmin", {})
            .then(function (categories) {
                (categories || [])
                    .slice()
                    .sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); })
                    .forEach(function (cat) {
                        var opt = document.createElement("option");
                        opt.value = cat.id;
                        opt.textContent = cat.parentId ? ("\u2014 " + cat.name) : cat.name;
                        select.appendChild(opt);
                    });

                select.value = selectedId || "";
            })
            .catch(function () { /* leave just the "None" option if this fails */ });
    }

    function loadProjectGallery(projectId) {
        var grid = document.getElementById("galleryImagePreview");
        grid.innerHTML = '<span class="muted">Loading gallery…</span>';

        apiPost("listProjectImages", { projectId: projectId })
            .then(function (images) {
                dashState.galleryImages = (images || []).sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); });
                renderGalleryPreview();
            })
            .catch(function (err) {
                grid.innerHTML = '<span class="muted">Couldn\u2019t load gallery images.</span>';
                showToast("error", err.message);
            });
    }

    function renderGalleryPreview() {
        var grid = document.getElementById("galleryImagePreview");

        if (!dashState.galleryImages.length) {
            grid.innerHTML = '<span class="muted">No gallery images yet.</span>';
            return;
        }

        grid.innerHTML = dashState.galleryImages.map(function (img, i) {
            return (
                '<div class="image-tile" data-index="' + i + '">' +
                    '<img src="' + normalizeImageUrl(img.imageUrl) + '" alt="">' +
                    '<button type="button" class="tile-remove" data-remove-gallery="' + i + '">✕</button>' +
                    '<div class="tile-reorder">' +
                        '<button type="button" data-move-gallery="' + i + ':-1" ' + (i === 0 ? "disabled" : "") + ' aria-label="Move image earlier">◀</button>' +
                        '<button type="button" data-move-gallery="' + i + ':1" ' + (i === dashState.galleryImages.length - 1 ? "disabled" : "") + ' aria-label="Move image later">▶</button>' +
                    '</div>' +
                '</div>'
            );
        }).join("");

        grid.querySelectorAll("[data-remove-gallery]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var index = Number(btn.dataset.removeGallery);
                var img = dashState.galleryImages[index];

                var removeLocally = function () {
                    dashState.galleryImages.splice(index, 1);
                    renderGalleryPreview();
                };

                if (img.id) {
                    apiPost("deleteProjectImage", { id: img.id }).then(removeLocally).catch(function (err) { showToast("error", err.message); });
                } else {
                    // fallback-matched image with no known row id — remove from view only
                    removeLocally();
                }
            });
        });

        grid.querySelectorAll("[data-move-gallery]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var parts = btn.dataset.moveGallery.split(":");
                var index = Number(parts[0]);
                var dir = Number(parts[1]);
                var targetIndex = index + dir;

                if (targetIndex < 0 || targetIndex >= dashState.galleryImages.length) return;

                var images = dashState.galleryImages;
                var moved = images.splice(index, 1)[0];
                images.splice(targetIndex, 0, moved);
                renderGalleryPreview();

                var orderedIds = images.filter(function (im) { return !!im.id; }).map(function (im) { return im.id; });
                if (orderedIds.length) {
                    apiPost("reorderProjectImages", { orderedIds: orderedIds }).catch(function (err) { showToast("error", err.message); });
                }
            });
        });
    }

    function renderSingleImagePreview(field, url) {
        var grid = document.getElementById(field + "ImagePreview");
        if (!url) { grid.innerHTML = ""; return; }
        grid.innerHTML =
            '<div class="image-tile"><img src="' + normalizeImageUrl(url) + '" alt=""><button type="button" class="tile-remove" data-clear-field="' + field + '">✕</button></div>';

        var btn = grid.querySelector("[data-clear-field]");
        btn.addEventListener("click", function () {
            dashState[field + "Url"] = "";
            renderSingleImagePreview(field, "");
        });
    }

    function setupImageUploader(field, isGallery) {
        var uploader = document.getElementById(field + "Uploader");
        var input = document.getElementById(field + "FileInput");
        var progress = document.getElementById(field + "UploadProgress");

        uploader.addEventListener("click", function () { input.click(); });

        ["dragover", "dragleave", "drop"].forEach(function (evt) {
            uploader.addEventListener(evt, function (e) {
                e.preventDefault();
                uploader.classList.toggle("dragover", evt === "dragover");
            });
        });

        uploader.addEventListener("drop", function (e) {
            handleFiles(field, isGallery, e.dataTransfer.files, progress);
        });

        input.addEventListener("change", function () {
            handleFiles(field, isGallery, input.files, progress);
            input.value = "";
        });
    }

    function handleFiles(field, isGallery, files, progressEl) {
        var fileArray = Array.from(files || []).filter(function (f) { return f.type.indexOf("image/") === 0; });
        if (!fileArray.length) return;

        if (isGallery && !dashState.editingProjectId) {
            showToast("error", "Save the project first, then add gallery images.");
            return;
        }

        var uploadOne = function (file, index) {
            progressEl.textContent = "Uploading " + (index + 1) + " of " + fileArray.length + "…";

            return fileToBase64(file).then(function (base64) {
                return apiPost("uploadImage", { filename: file.name, mimeType: file.type, base64: base64 });
            }).then(function (result) {
                if (isGallery) {
                    return apiPost("createProjectImage", {
                        projectId: dashState.editingProjectId,
                        imageUrl: result.url,
                        order: dashState.galleryImages.length
                    }).then(function (row) {
                        dashState.galleryImages.push({ id: row.id, imageUrl: row.imageUrl });
                        renderGalleryPreview();
                    });
                } else {
                    dashState[field + "Url"] = result.url;
                    renderSingleImagePreview(field, result.url);
                }
            });
        };

        var chain = Promise.resolve();
        fileArray.forEach(function (file, index) {
            chain = chain.then(function () { return uploadOne(file, index); });
        });

        chain.then(function () {
            progressEl.textContent = "";
        }).catch(function (err) {
            progressEl.textContent = "";
            showToast("error", "Upload failed: " + err.message);
        });
    }

    function fileToBase64(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () {
                // strip the "data:image/...;base64," prefix
                var result = reader.result;
                resolve(result.substring(result.indexOf(",") + 1));
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function saveProject(e) {
        e.preventDefault();
        showFormAlert("projectFormAlert", "");

        var title = document.getElementById("projectTitle").value.trim();
        if (!title) {
            showFormAlert("projectFormAlert", "Title is required.");
            return;
        }

        var payload = {
            title: title,
            category: document.getElementById("projectCategory").value,
            location: document.getElementById("projectLocation").value.trim(),
            description: document.getElementById("projectDescription").value.trim(),
            portfolioCategoryId: document.getElementById("projectPortfolioCategory").value,
            coverImageUrl: dashState.coverUrl,
            videoUrl: document.getElementById("projectVideoUrl").value.trim(),
            order: Number(document.getElementById("projectOrder").value) || 0
        };

        var btn = document.getElementById("saveProjectBtn");
        btn.disabled = true;
        btn.textContent = "Saving…";

        var isEdit = !!dashState.editingProjectId;
        var request = isEdit
            ? apiPost("updateProject", { id: dashState.editingProjectId, updates: payload })
            : apiPost("createProject", { project: payload });

        request.then(function (result) {
            showToast("success", isEdit ? "Project updated." : "Project created.");
            loadProjects();
            loadDashboardStats();

            if (!isEdit && result && result.id) {
                // reopen in edit mode so gallery images can be added right away
                openProjectEditor(result);
            } else {
                closeModal("projectModalOverlay");
            }
        }).catch(function (err) {
            showFormAlert("projectFormAlert", err.message);
        }).finally(function () {
            btn.disabled = false;
            btn.textContent = "Save Project";
        });
    }

    function deleteCurrentProject() {
        if (!dashState.editingProjectId) return;
        if (!confirm("Delete this project? This also removes its gallery images. This can't be undone.")) return;

        apiPost("deleteProject", { id: dashState.editingProjectId })
            .then(function () {
                showToast("success", "Project deleted.");
                closeModal("projectModalOverlay");
                loadProjects();
                loadDashboardStats();
            })
            .catch(function (err) { showToast("error", err.message); });
    }

    /* =====================================================
       HOME — homepage image (Settings key: homepageImage)
    ===================================================== */

    function initHomeView() {
        setupImageUploader("homepage", false);
        document.getElementById("saveHomeImageBtn").addEventListener("click", saveHomeImage);
    }

    function loadHomeSettings() {
        showFormAlert("homeFormAlert", "");

        apiPost("getSettingsAdmin", {})
            .then(function (rows) {
                var row = (rows || []).filter(function (r) { return r.key === "homepageImage"; })[0];
                dashState.homepageUrl = row ? row.value : "";
                renderSingleImagePreview("homepage", dashState.homepageUrl || "");
            })
            .catch(function (err) {
                showFormAlert("homeFormAlert", "Couldn\u2019t load the current homepage image: " + err.message);
            });
    }

    function saveHomeImage() {
        showFormAlert("homeFormAlert", "");

        if (!dashState.homepageUrl) {
            showFormAlert("homeFormAlert", "Upload an image first.");
            return;
        }

        var btn = document.getElementById("saveHomeImageBtn");
        btn.disabled = true;
        btn.textContent = "Saving…";

        apiPost("updateSettings", { settings: { homepageImage: dashState.homepageUrl } })
            .then(function () {
                showToast("success", "Homepage image updated — live on the site now.");
            })
            .catch(function (err) {
                showFormAlert("homeFormAlert", err.message);
            })
            .finally(function () {
                btn.disabled = false;
                btn.textContent = "Save Homepage Image";
            });
    }

    /* =====================================================
       PORTFOLIO CATEGORIES
    ===================================================== */

    var editingPortfolioCategoryId = null;

    function initPortfolioView() {
        document.getElementById("addPortfolioCategoryBtn").addEventListener("click", function () { openPortfolioEditor(null); });
        document.getElementById("portfolioForm").addEventListener("submit", savePortfolioCategory);
        document.getElementById("deletePortfolioCategoryBtn").addEventListener("click", deleteCurrentPortfolioCategory);
    }

    function loadPortfolioCategories() {
        var tbody = document.getElementById("portfolioTableBody");
        tbody.innerHTML = '<tr class="empty-row"><td colspan="4"><span class="spinner"></span> Loading…</td></tr>';

        apiPost("listPortfolioCategoriesAdmin", {})
            .then(function (categories) {
                dashState.portfolioCategories = (categories || []).sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); });
                renderPortfolioTable();
            })
            .catch(function (err) {
                tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Couldn\u2019t load categories: ' + escapeHtml(err.message) + '</td></tr>';
            });
    }

    function portfolioCategoryName(id) {
        var match = dashState.portfolioCategories.filter(function (c) { return c.id === id; })[0];
        return match ? match.name : "";
    }

    function renderPortfolioTable() {
        var tbody = document.getElementById("portfolioTableBody");

        if (!dashState.portfolioCategories.length) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="4">No categories yet. Add your first one.</td></tr>';
            return;
        }

        // Top-level categories first, each immediately followed by its
        // own subcategories, so the hierarchy reads naturally as a table.
        var topLevel = dashState.portfolioCategories.filter(function (c) { return !c.parentId; });
        var ordered = [];
        topLevel.forEach(function (top) {
            ordered.push(top);
            dashState.portfolioCategories
                .filter(function (c) { return c.parentId === top.id; })
                .forEach(function (child) { ordered.push(child); });
        });

        tbody.innerHTML = ordered.map(function (c) {
            return (
                '<tr data-id="' + c.id + '">' +
                    '<td>' + (c.parentId ? '<span class="muted">\u2014 </span>' : '') + escapeHtml(c.name) + '</td>' +
                    '<td>' + escapeHtml(c.parentId ? portfolioCategoryName(c.parentId) : "\u2014") + '</td>' +
                    '<td>' + escapeHtml(c.order != null ? c.order : 0) + '</td>' +
                    '<td class="row-actions"><button class="btn btn-sm edit-portfolio-btn">Edit</button></td>' +
                '</tr>'
            );
        }).join("");

        tbody.querySelectorAll(".edit-portfolio-btn").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var id = btn.closest("tr").dataset.id;
                openPortfolioEditor(dashState.portfolioCategories.filter(function (c) { return c.id === id; })[0]);
            });
        });
    }

    function openPortfolioEditor(category) {
        document.getElementById("portfolioForm").reset();
        showFormAlert("portfolioFormAlert", "");
        editingPortfolioCategoryId = category ? category.id : null;

        document.getElementById("portfolioModalTitle").textContent = category ? "Edit Category" : "Add Category";
        document.getElementById("portfolioCategoryId").value = category ? category.id : "";
        document.getElementById("portfolioCategoryName").value = category ? category.name || "" : "";
        document.getElementById("portfolioCategoryOrder").value = category ? (category.order || 0) : dashState.portfolioCategories.length;

        var parentSelect = document.getElementById("portfolioCategoryParent");
        parentSelect.innerHTML = '<option value="">\u2014 Top level \u2014</option>' +
            dashState.portfolioCategories
                // A category can't be its own parent, and top-level
                // categories only (one level of nesting, by design).
                .filter(function (c) { return !c.parentId && (!category || c.id !== category.id); })
                .map(function (c) { return '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>'; })
                .join("");
        parentSelect.value = category ? category.parentId || "" : "";

        document.getElementById("deletePortfolioCategoryBtn").style.display = category ? "" : "none";

        openModal("portfolioModalOverlay");
    }

    function savePortfolioCategory(e) {
        e.preventDefault();
        showFormAlert("portfolioFormAlert", "");

        var name = document.getElementById("portfolioCategoryName").value.trim();
        if (!name) { showFormAlert("portfolioFormAlert", "Name is required."); return; }

        var payload = {
            name: name,
            parentId: document.getElementById("portfolioCategoryParent").value,
            order: Number(document.getElementById("portfolioCategoryOrder").value) || 0
        };

        var btn = document.getElementById("savePortfolioCategoryBtn");
        btn.disabled = true;

        var request = editingPortfolioCategoryId
            ? apiPost("updatePortfolioCategory", { id: editingPortfolioCategoryId, updates: payload })
            : apiPost("createPortfolioCategory", { category: payload });

        request.then(function () {
            showToast("success", editingPortfolioCategoryId ? "Category updated." : "Category created.");
            closeModal("portfolioModalOverlay");
            loadPortfolioCategories();
        }).catch(function (err) {
            showFormAlert("portfolioFormAlert", err.message);
        }).finally(function () { btn.disabled = false; });
    }

    function deleteCurrentPortfolioCategory() {
        if (!editingPortfolioCategoryId) return;
        if (!confirm("Delete this category? Subcategories under it are deleted too, and any projects tagged with it just lose that tag \u2014 they are not deleted.")) return;

        apiPost("deletePortfolioCategory", { id: editingPortfolioCategoryId })
            .then(function () {
                showToast("success", "Category deleted.");
                closeModal("portfolioModalOverlay");
                loadPortfolioCategories();
            })
            .catch(function (err) { showToast("error", err.message); });
    }

    /* =====================================================
       VIDEO GALLERY (standalone videos)
    ===================================================== */

    var editingVideoId = null;

    function initVideosView() {
        document.getElementById("addVideoBtn").addEventListener("click", function () { openVideoEditor(null); });
        document.getElementById("videoForm").addEventListener("submit", saveVideo);
        document.getElementById("deleteVideoBtn").addEventListener("click", deleteCurrentVideo);
    }

    function loadVideos() {
        var tbody = document.getElementById("videosTableBody");
        tbody.innerHTML = '<tr class="empty-row"><td colspan="5"><span class="spinner"></span> Loading…</td></tr>';

        apiPost("listVideosAdmin", {})
            .then(function (videos) {
                dashState.videos = (videos || []).sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); });
                renderVideosTable();
            })
            .catch(function (err) {
                tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Couldn\u2019t load videos: ' + escapeHtml(err.message) + '</td></tr>';
            });
    }

    function extractYouTubeId(url) {
        if (!url) return null;
        var match = String(url).match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
        return match ? match[1] : null;
    }

    function renderVideosTable() {
        var tbody = document.getElementById("videosTableBody");

        if (!dashState.videos.length) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No videos yet. Add your first one.</td></tr>';
            return;
        }

        tbody.innerHTML = dashState.videos.map(function (v) {
            var ytId = extractYouTubeId(v.youtubeUrl);
            var thumb = ytId
                ? '<img src="https://img.youtube.com/vi/' + ytId + '/default.jpg" alt="" style="width:64px;height:36px;object-fit:cover;border-radius:3px;">'
                : '<span class="badge off">Invalid URL</span>';

            return (
                '<tr data-id="' + v.id + '">' +
                    '<td>' + thumb + '</td>' +
                    '<td>' + escapeHtml(v.title || "\u2014") + '</td>' +
                    '<td class="wrap">' + escapeHtml(truncate(v.youtubeUrl, 50)) + '</td>' +
                    '<td>' + escapeHtml(v.order != null ? v.order : 0) + '</td>' +
                    '<td class="row-actions"><button class="btn btn-sm edit-video-btn">Edit</button></td>' +
                '</tr>'
            );
        }).join("");

        tbody.querySelectorAll(".edit-video-btn").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var id = btn.closest("tr").dataset.id;
                openVideoEditor(dashState.videos.filter(function (v) { return v.id === id; })[0]);
            });
        });
    }

    function openVideoEditor(video) {
        document.getElementById("videoForm").reset();
        showFormAlert("videoFormAlert", "");
        editingVideoId = video ? video.id : null;

        document.getElementById("videoModalTitle").textContent = video ? "Edit Video" : "Add Video";
        document.getElementById("videoId").value = video ? video.id : "";
        document.getElementById("videoTitle").value = video ? video.title || "" : "";
        document.getElementById("videoYoutubeUrl").value = video ? video.youtubeUrl || "" : "";
        document.getElementById("videoOrder").value = video ? (video.order || 0) : dashState.videos.length;
        document.getElementById("deleteVideoBtn").style.display = video ? "" : "none";

        openModal("videoModalOverlay");
    }

    function saveVideo(e) {
        e.preventDefault();
        showFormAlert("videoFormAlert", "");

        var url = document.getElementById("videoYoutubeUrl").value.trim();
        if (!url) { showFormAlert("videoFormAlert", "A YouTube URL is required."); return; }

        if (!extractYouTubeId(url)) {
            showFormAlert("videoFormAlert", "That doesn't look like a valid YouTube URL. Paste a link like https://www.youtube.com/watch?v=XXXXXXXXXXX");
            return;
        }

        var payload = {
            title: document.getElementById("videoTitle").value.trim(),
            youtubeUrl: url,
            order: Number(document.getElementById("videoOrder").value) || 0
        };

        var btn = document.getElementById("saveVideoBtn");
        btn.disabled = true;

        var request = editingVideoId
            ? apiPost("updateVideo", { id: editingVideoId, updates: payload })
            : apiPost("createVideo", { video: payload });

        request.then(function () {
            showToast("success", editingVideoId ? "Video updated." : "Video added.");
            closeModal("videoModalOverlay");
            loadVideos();
        }).catch(function (err) {
            showFormAlert("videoFormAlert", err.message);
        }).finally(function () { btn.disabled = false; });
    }

    function deleteCurrentVideo() {
        if (!editingVideoId) return;
        if (!confirm("Delete this video? This can't be undone.")) return;

        apiPost("deleteVideo", { id: editingVideoId })
            .then(function () {
                showToast("success", "Video deleted.");
                closeModal("videoModalOverlay");
                loadVideos();
            })
            .catch(function (err) { showToast("error", err.message); });
    }

    /* =====================================================
       SERVICES
    ===================================================== */

    function initServicesView() {
        document.getElementById("addServiceBtn").addEventListener("click", function () { openServiceEditor(null); });
        document.getElementById("serviceForm").addEventListener("submit", saveService);
        document.getElementById("deleteServiceBtn").addEventListener("click", deleteCurrentService);
    }

    var editingServiceId = null;

    function loadServices() {
        var tbody = document.getElementById("servicesTableBody");
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6"><span class="spinner"></span> Loading…</td></tr>';

        apiPost("listServicesAdmin", {})
            .then(function (services) {
                dashState.services = (services || []).sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); });
                renderServicesTable();
            })
            .catch(function (err) {
                tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Couldn\u2019t load services: ' + escapeHtml(err.message) + '</td></tr>';
            });
    }

    function renderServicesTable() {
        var tbody = document.getElementById("servicesTableBody");

        if (!dashState.services.length) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No services yet. Add your first one.</td></tr>';
            return;
        }

        tbody.innerHTML = dashState.services.map(function (s) {
            return (
                '<tr data-id="' + s.id + '">' +
                    '<td>' + escapeHtml(s.icon || "—") + '</td>' +
                    '<td>' + escapeHtml(s.title) + '</td>' +
                    '<td class="wrap">' + escapeHtml(truncate(s.description, 80)) + '</td>' +
                    '<td>' + escapeHtml(s.order != null ? s.order : 0) + '</td>' +
                    '<td><span class="badge ' + (isTrue(s.published) ? "on" : "off") + '">' + (isTrue(s.published) ? "Published" : "Draft") + '</span></td>' +
                    '<td class="row-actions"><button class="btn btn-sm edit-service-btn">Edit</button></td>' +
                '</tr>'
            );
        }).join("");

        tbody.querySelectorAll(".edit-service-btn").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var id = btn.closest("tr").dataset.id;
                openServiceEditor(dashState.services.filter(function (s) { return s.id === id; })[0]);
            });
        });
    }

    function openServiceEditor(service) {
        document.getElementById("serviceForm").reset();
        showFormAlert("serviceFormAlert", "");
        editingServiceId = service ? service.id : null;

        document.getElementById("serviceModalTitle").textContent = service ? "Edit Service" : "Add Service";
        document.getElementById("serviceId").value = service ? service.id : "";
        document.getElementById("serviceTitle").value = service ? service.title || "" : "";
        document.getElementById("serviceIcon").value = service ? service.icon || "" : "✦";
        document.getElementById("serviceDescription").value = service ? service.description || "" : "";
        document.getElementById("serviceOrder").value = service ? (service.order || 0) : dashState.services.length;
        document.getElementById("servicePublished").checked = service ? isTrue(service.published) : true;
        document.getElementById("deleteServiceBtn").style.display = service ? "" : "none";

        openModal("serviceModalOverlay");
    }

    function saveService(e) {
        e.preventDefault();
        showFormAlert("serviceFormAlert", "");

        var title = document.getElementById("serviceTitle").value.trim();
        if (!title) { showFormAlert("serviceFormAlert", "Title is required."); return; }

        var payload = {
            title: title,
            icon: document.getElementById("serviceIcon").value.trim() || "✦",
            description: document.getElementById("serviceDescription").value.trim(),
            order: Number(document.getElementById("serviceOrder").value) || 0,
            published: document.getElementById("servicePublished").checked
        };

        var btn = document.getElementById("saveServiceBtn");
        btn.disabled = true;

        var request = editingServiceId
            ? apiPost("updateService", { id: editingServiceId, updates: payload })
            : apiPost("createService", { service: payload });

        request.then(function () {
            showToast("success", editingServiceId ? "Service updated." : "Service created.");
            closeModal("serviceModalOverlay");
            loadServices();
            loadDashboardStats();
        }).catch(function (err) {
            showFormAlert("serviceFormAlert", err.message);
        }).finally(function () { btn.disabled = false; });
    }

    function deleteCurrentService() {
        if (!editingServiceId) return;
        if (!confirm("Delete this service? This can't be undone.")) return;

        apiPost("deleteService", { id: editingServiceId })
            .then(function () {
                showToast("success", "Service deleted.");
                closeModal("serviceModalOverlay");
                loadServices();
                loadDashboardStats();
            })
            .catch(function (err) { showToast("error", err.message); });
    }

    /* =====================================================
       PROCESS
    ===================================================== */

    function initProcessView() {
        document.getElementById("addProcessBtn").addEventListener("click", function () { openProcessEditor(null); });
        document.getElementById("processForm").addEventListener("submit", saveProcessStep);
        document.getElementById("deleteProcessBtn").addEventListener("click", deleteCurrentProcess);
    }

    var editingProcessId = null;

    function loadProcess() {
        var tbody = document.getElementById("processTableBody");
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6"><span class="spinner"></span> Loading…</td></tr>';

        apiPost("listProcessAdmin", {})
            .then(function (steps) {
                dashState.process = (steps || []).sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); });
                renderProcessTable();
            })
            .catch(function (err) {
                tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Couldn\u2019t load process steps: ' + escapeHtml(err.message) + '</td></tr>';
            });
    }

    function renderProcessTable() {
        var tbody = document.getElementById("processTableBody");

        if (!dashState.process.length) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No process steps yet.</td></tr>';
            return;
        }

        tbody.innerHTML = dashState.process.map(function (s) {
            return (
                '<tr data-id="' + s.id + '">' +
                    '<td>' + escapeHtml(s.step || "—") + '</td>' +
                    '<td>' + escapeHtml(s.title) + '</td>' +
                    '<td class="wrap">' + escapeHtml(truncate(s.description, 80)) + '</td>' +
                    '<td>' + escapeHtml(s.order != null ? s.order : 0) + '</td>' +
                    '<td><span class="badge ' + (isTrue(s.published) ? "on" : "off") + '">' + (isTrue(s.published) ? "Published" : "Draft") + '</span></td>' +
                    '<td class="row-actions"><button class="btn btn-sm edit-process-btn">Edit</button></td>' +
                '</tr>'
            );
        }).join("");

        tbody.querySelectorAll(".edit-process-btn").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var id = btn.closest("tr").dataset.id;
                openProcessEditor(dashState.process.filter(function (s) { return s.id === id; })[0]);
            });
        });
    }

    function openProcessEditor(step) {
        document.getElementById("processForm").reset();
        showFormAlert("processFormAlert", "");
        editingProcessId = step ? step.id : null;

        document.getElementById("processModalTitle").textContent = step ? "Edit Step" : "Add Step";
        document.getElementById("processId").value = step ? step.id : "";
        document.getElementById("processStep").value = step ? step.step || "" : String(dashState.process.length + 1).padStart(2, "0");
        document.getElementById("processTitle").value = step ? step.title || "" : "";
        document.getElementById("processDescription").value = step ? step.description || "" : "";
        document.getElementById("processOrder").value = step ? (step.order || 0) : dashState.process.length;
        document.getElementById("processPublished").checked = step ? isTrue(step.published) : true;
        document.getElementById("deleteProcessBtn").style.display = step ? "" : "none";

        openModal("processModalOverlay");
    }

    function saveProcessStep(e) {
        e.preventDefault();
        showFormAlert("processFormAlert", "");

        var title = document.getElementById("processTitle").value.trim();
        if (!title) { showFormAlert("processFormAlert", "Title is required."); return; }

        var payload = {
            step: document.getElementById("processStep").value.trim(),
            title: title,
            description: document.getElementById("processDescription").value.trim(),
            order: Number(document.getElementById("processOrder").value) || 0,
            published: document.getElementById("processPublished").checked
        };

        var btn = document.getElementById("saveProcessBtn");
        btn.disabled = true;

        var request = editingProcessId
            ? apiPost("updateProcess", { id: editingProcessId, updates: payload })
            : apiPost("createProcess", { item: payload });

        request.then(function () {
            showToast("success", editingProcessId ? "Step updated." : "Step created.");
            closeModal("processModalOverlay");
            loadProcess();
        }).catch(function (err) {
            showFormAlert("processFormAlert", err.message);
        }).finally(function () { btn.disabled = false; });
    }

    function deleteCurrentProcess() {
        if (!editingProcessId) return;
        if (!confirm("Delete this process step?")) return;

        apiPost("deleteProcess", { id: editingProcessId })
            .then(function () {
                showToast("success", "Step deleted.");
                closeModal("processModalOverlay");
                loadProcess();
            })
            .catch(function (err) { showToast("error", err.message); });
    }

    /* =====================================================
       WHY SK
    ===================================================== */

    function initWhySKView() {
        document.getElementById("addWhySKBtn").addEventListener("click", function () { openWhySKEditor(null); });
        document.getElementById("whySKForm").addEventListener("submit", saveWhySK);
        document.getElementById("deleteWhySKBtn").addEventListener("click", deleteCurrentWhySK);
    }

    var editingWhySKId = null;

    function loadWhySK() {
        var tbody = document.getElementById("whySKTableBody");
        tbody.innerHTML = '<tr class="empty-row"><td colspan="5"><span class="spinner"></span> Loading…</td></tr>';

        apiPost("listWhySKAdmin", {})
            .then(function (items) {
                dashState.whySK = (items || []).sort(function (a, b) { return (Number(a.order) || 0) - (Number(b.order) || 0); });
                renderWhySKTable();
            })
            .catch(function (err) {
                tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Couldn\u2019t load: ' + escapeHtml(err.message) + '</td></tr>';
            });
    }

    function renderWhySKTable() {
        var tbody = document.getElementById("whySKTableBody");

        if (!dashState.whySK.length) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No items yet.</td></tr>';
            return;
        }

        tbody.innerHTML = dashState.whySK.map(function (w) {
            return (
                '<tr data-id="' + w.id + '">' +
                    '<td>' + escapeHtml(w.title) + '</td>' +
                    '<td class="wrap">' + escapeHtml(truncate(w.description, 90)) + '</td>' +
                    '<td>' + escapeHtml(w.order != null ? w.order : 0) + '</td>' +
                    '<td><span class="badge ' + (isTrue(w.published) ? "on" : "off") + '">' + (isTrue(w.published) ? "Published" : "Draft") + '</span></td>' +
                    '<td class="row-actions"><button class="btn btn-sm edit-whysk-btn">Edit</button></td>' +
                '</tr>'
            );
        }).join("");

        tbody.querySelectorAll(".edit-whysk-btn").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var id = btn.closest("tr").dataset.id;
                openWhySKEditor(dashState.whySK.filter(function (w) { return w.id === id; })[0]);
            });
        });
    }

    function openWhySKEditor(item) {
        document.getElementById("whySKForm").reset();
        showFormAlert("whySKFormAlert", "");
        editingWhySKId = item ? item.id : null;

        document.getElementById("whySKModalTitle").textContent = item ? "Edit Item" : "Add Item";
        document.getElementById("whySKId").value = item ? item.id : "";
        document.getElementById("whySKTitle").value = item ? item.title || "" : "";
        document.getElementById("whySKDescription").value = item ? item.description || "" : "";
        document.getElementById("whySKOrder").value = item ? (item.order || 0) : dashState.whySK.length;
        document.getElementById("whySKPublished").checked = item ? isTrue(item.published) : true;
        document.getElementById("deleteWhySKBtn").style.display = item ? "" : "none";

        openModal("whySKModalOverlay");
    }

    function saveWhySK(e) {
        e.preventDefault();
        showFormAlert("whySKFormAlert", "");

        var title = document.getElementById("whySKTitle").value.trim();
        if (!title) { showFormAlert("whySKFormAlert", "Title is required."); return; }

        var payload = {
            title: title,
            description: document.getElementById("whySKDescription").value.trim(),
            order: Number(document.getElementById("whySKOrder").value) || 0,
            published: document.getElementById("whySKPublished").checked
        };

        var btn = document.getElementById("saveWhySKBtn");
        btn.disabled = true;

        var request = editingWhySKId
            ? apiPost("updateWhySK", { id: editingWhySKId, updates: payload })
            : apiPost("createWhySK", { item: payload });

        request.then(function () {
            showToast("success", editingWhySKId ? "Item updated." : "Item created.");
            closeModal("whySKModalOverlay");
            loadWhySK();
        }).catch(function (err) {
            showFormAlert("whySKFormAlert", err.message);
        }).finally(function () { btn.disabled = false; });
    }

    function deleteCurrentWhySK() {
        if (!editingWhySKId) return;
        if (!confirm("Delete this item?")) return;

        apiPost("deleteWhySK", { id: editingWhySKId })
            .then(function () {
                showToast("success", "Item deleted.");
                closeModal("whySKModalOverlay");
                loadWhySK();
            })
            .catch(function (err) { showToast("error", err.message); });
    }
    /* =====================================================
       INQUIRIES
    ===================================================== */

    function initInquiriesView() {
        document.getElementById("inquiryStatusFilter").addEventListener("change", renderInquiriesTable);
    }

    function loadInquiries() {
        var tbody = document.getElementById("inquiriesTableBody");
        tbody.innerHTML = '<tr class="empty-row"><td colspan="10"><span class="spinner"></span> Loading…</td></tr>';

        apiPost("listInquiries", {})
            .then(function (inquiries) {
                dashState.inquiries = inquiries || [];
                renderInquiriesTable();
            })
            .catch(function (err) {
                tbody.innerHTML = '<tr class="empty-row"><td colspan="10">Couldn\u2019t load inquiries: ' + escapeHtml(err.message) + '</td></tr>';
            });
    }

    function renderInquiriesTable() {
        var tbody = document.getElementById("inquiriesTableBody");
        var statusFilter = document.getElementById("inquiryStatusFilter").value;

        var list = dashState.inquiries.filter(function (i) {
            return !statusFilter || (i.status || "pending") === statusFilter;
        });

        if (!list.length) {
            tbody.innerHTML = '<tr class="empty-row"><td colspan="10">No inquiries yet.</td></tr>';
            return;
        }

        tbody.innerHTML = list.map(function (i) {
            var status = i.status || "pending";
            return (
                '<tr data-id="' + i.id + '">' +
                    '<td>' + escapeHtml(formatDate(i.submittedAt)) + '</td>' +
                    '<td>' + escapeHtml(i.name) + '</td>' +
                    '<td>' + escapeHtml(i.phone) + '</td>' +
                    '<td>' + escapeHtml(i.email) + '</td>' +
                    '<td>' + escapeHtml(i.projectType) + '</td>' +
                    '<td>' + escapeHtml(i.location) + '</td>' +
                    '<td>' + escapeHtml(i.budget || "—") + '</td>' +
                    '<td class="wrap">' + escapeHtml(truncate(i.message, 70)) + '</td>' +
                    '<td><span class="badge ' + (status === "handled" ? "handled" : "pending") + '">' + escapeHtml(status) + '</span></td>' +
                    '<td class="row-actions"><button class="btn btn-sm toggle-inquiry-btn">' + (status === "handled" ? "Mark Pending" : "Mark Handled") + '</button></td>' +
                '</tr>'
            );
        }).join("");

        tbody.querySelectorAll(".toggle-inquiry-btn").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var row = btn.closest("tr");
                var id = row.dataset.id;
                var inquiry = dashState.inquiries.filter(function (i) { return i.id === id; })[0];
                var nextStatus = (inquiry.status || "pending") === "handled" ? "pending" : "handled";

                btn.disabled = true;
                apiPost("markInquiryStatus", { id: id, status: nextStatus })
                    .then(function () {
                        inquiry.status = nextStatus;
                        renderInquiriesTable();
                        loadDashboardStats();
                    })
                    .catch(function (err) { showToast("error", err.message); btn.disabled = false; });
            });
        });
    }

    /* =====================================================
       SETTINGS
    ===================================================== */

    function initSettingsView() {
        document.getElementById("addSettingBtn").addEventListener("click", function () {
            var key = document.getElementById("newSettingKey").value.trim();
            var value = document.getElementById("newSettingValue").value.trim();

            if (!key) { showToast("error", "Enter a key first."); return; }

            var settings = {};
            settings[key] = value;

            apiPost("updateSettings", { settings: settings })
                .then(function () {
                    showToast("success", "Setting saved.");
                    document.getElementById("newSettingKey").value = "";
                    document.getElementById("newSettingValue").value = "";
                    loadSettings();
                })
                .catch(function (err) { showToast("error", err.message); });
        });
    }

    function loadSettings() {
        var tbody = document.getElementById("settingsTableBody");
        tbody.innerHTML = '<tr class="empty-row"><td colspan="2"><span class="spinner"></span> Loading…</td></tr>';

        apiPost("getSettingsAdmin", {})
            .then(function (settings) {
                if (!settings || !settings.length) {
                    tbody.innerHTML = '<tr class="empty-row"><td colspan="2">No settings yet.</td></tr>';
                    return;
                }
                tbody.innerHTML = settings.map(function (s) {
                    return '<tr><td>' + escapeHtml(s.key) + '</td><td>' + escapeHtml(s.value) + '</td></tr>';
                }).join("");
            })
            .catch(function (err) {
                tbody.innerHTML = '<tr class="empty-row"><td colspan="2">Couldn\u2019t load settings: ' + escapeHtml(err.message) + '</td></tr>';
            });
    }

    /* =====================================================
       INIT
    ===================================================== */

    initLoginPage();
    initDashboard();

})();
