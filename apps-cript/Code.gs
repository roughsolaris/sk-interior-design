/* =========================================================
   SK INTERIOR DESIGN — APPS SCRIPT BACKEND
   =========================================================

   This single file is the entire backend API. It reads/writes
   a Google Sheet (acting as the database) and Google Drive
   (for uploaded images), and is deployed as a Web App.

   HOW REQUESTS ARE ROUTED
   ------------------------
   - doGet(e):  public, read-only actions, called as
                ...?action=getProjects  (query string)
   - doPost(e): everything else (admin writes + submitInquiry).
                The frontend sends Content-Type: text/plain
                with a JSON string body — NOT application/json.
                This is intentional: Apps Script Web Apps do not
                handle CORS preflight (OPTIONS) requests, and a
                real application/json POST from another origin
                triggers a preflight. Sending it as text/plain
                keeps the request a CORS "simple request", which
                Apps Script answers directly. We still parse the
                body as JSON on this end (e.postData.contents).

   AUTH
   ----
   Admin actions require a `token` in the payload. Tokens are
   issued by `login` and stored in CacheService (max 6h expiry,
   enforced by Google — see SESSION_DURATION_SECONDS below).
   The actual admin password never leaves this script — it is
   read from Script Properties (Project Settings > Script
   Properties in the Apps Script editor), never from the sheet,
   never returned in any response.

   SHEETS EXPECTED (see setup instructions)
   ------------------------------------------
   Projects       | id,title,category,location,coverImageUrl,
                    videoUrl,order,createdDate,description,
                    portfolioCategoryId
                    (category is free text — Residential, Commercial
                    and Spaces are the values the admin UI offers,
                    but nothing here enforces a closed set)
   ProjectImages  | id,projectId,imageUrl,order
   Services       | id,title,description,icon,published,order
   Process        | id,step,title,description,published,order
   WhySK          | id,title,description,published,order
   Inquiries      | id,name,phone,email,projectType,location,space,
                    budget,message,submittedAt,status
   Settings       | key,value
   Videos         | id,title,youtubeUrl,order,createdDate
   PortfolioCategories | id,name,parentId,order
                    (parentId is "" for a top-level category, or the
                    id of its parent for a subcategory — one level
                    of nesting only, matching what the admin UI edits)

   SCHEMA CHANGES IN THIS VERSION
   -------------------------------
   This update adds new columns to the existing Projects sheet
   (description, portfolioCategoryId) and two new sheets (Videos,
   PortfolioCategories). Existing data is never touched — run
   `migrateSchema()` once from the Apps Script editor (same way you
   ran `setupSheets()` originally) and it adds only what's missing.
========================================================= */

var SESSION_DURATION_SECONDS = 6 * 60 * 60; // 6 hours — CacheService's hard max

var SHEETS = {
    PROJECTS: "Projects",
    PROJECT_IMAGES: "ProjectImages",
    SERVICES: "Services",
    PROCESS: "Process",
    WHY_SK: "WhySK",
    INQUIRIES: "Inquiries",
    SETTINGS: "Settings",
    VIDEOS: "Videos",
    PORTFOLIO_CATEGORIES: "PortfolioCategories"
};

var SHEET_HEADERS = {
    // category is free text (Residential / Commercial / Spaces from
    // the admin UI). portfolioCategoryId and description were added
    // in this update — see migrateSchema().
    Projects: ["id", "title", "category", "location", "coverImageUrl", "videoUrl", "order", "createdDate", "description", "portfolioCategoryId"],
    ProjectImages: ["id", "projectId", "imageUrl", "order"],
    Services: ["id", "title", "description", "icon", "published", "order"],
    Process: ["id", "step", "title", "description", "published", "order"],
    WhySK: ["id", "title", "description", "published", "order"],
    Inquiries: ["id", "name", "phone", "email", "projectType", "location", "space", "budget", "message", "submittedAt", "status"],
    Settings: ["key", "value"],
    Videos: ["id", "title", "youtubeUrl", "order", "createdDate"],
    PortfolioCategories: ["id", "name", "parentId", "order"]
};

/* =====================================================
   ENTRY POINTS
===================================================== */

function doGet(e) {
    try {
        var action = e.parameter.action;
        var result = routePublic(action, e.parameter);
        return jsonOutput(ok(result));
    } catch (err) {
        return jsonOutput(fail(err.message));
    }
}

function doPost(e) {
    try {
        var body = JSON.parse(e.postData.contents || "{}");
        var action = body.action;
        var payload = body.payload || {};

        var publicActions = ["submitInquiry"];
        var result;

        if (action === "login") {
            result = handleLogin(payload);
        } else if (publicActions.indexOf(action) > -1) {
            result = routePublic(action, payload);
        } else {
            // everything else requires a valid session token
            requireAuth(payload.token);
            result = routeAdmin(action, payload);
        }

        return jsonOutput(ok(result));
    } catch (err) {
        return jsonOutput(fail(err.message));
    }
}

/* =====================================================
   ROUTERS
===================================================== */

function routePublic(action, params) {
    switch (action) {
        case "getProjects":
            return getPublicProjects();
        case "getProject":
            return getPublicProject(params.id);
        case "getLatestProjects":
            return getLatestProjects(params.limit ? Number(params.limit) : 6);
        case "getServices":
            return getPublishedSorted(SHEETS.SERVICES);
        case "getProcess":
            return getPublishedSorted(SHEETS.PROCESS);
        case "getWhySK":
            return getPublishedSorted(SHEETS.WHY_SK);
        case "getVideos":
            return sheetToObjects(SHEETS.VIDEOS).sort(byOrder);
        case "getPortfolioCategories":
            return sheetToObjects(SHEETS.PORTFOLIO_CATEGORIES).sort(byOrder);
        case "getSettings":
            // Public, read-only, safe subset. Nothing secret is ever
            // stored in this sheet — the admin password lives in
            // Script Properties (see handleLogin) and is never here.
            return settingsAsMap();
        case "submitInquiry":
            return createInquiry(params);
        default:
            throw new Error("Unknown action: " + action);
    }
}

function routeAdmin(action, payload) {
    switch (action) {
        case "logout":
            return handleLogout(payload.token);
        case "validateSession":
            return { valid: true };

        // ---- Projects ----
        case "listProjectsAdmin":
            return sheetToObjects(SHEETS.PROJECTS).sort(byOrder);
        case "createProject":
            return createRow(SHEETS.PROJECTS, normalizeProject(payload.project));
        case "updateProject":
            return updateRowById(SHEETS.PROJECTS, payload.id, normalizeProject(payload.updates, true));
        case "deleteProject":
            return deleteProjectCascade(payload.id);

        // ---- Project Images ----
        case "createProjectImage":
            return createRow(SHEETS.PROJECT_IMAGES, {
                id: newId(),
                projectId: payload.projectId,
                imageUrl: payload.imageUrl,
                order: payload.order || 0
            });
        case "deleteProjectImage":
            return deleteProjectImage(payload.id);
        case "reorderProjectImages":
            return reorderItems(SHEETS.PROJECT_IMAGES, payload.orderedIds);
        case "listProjectImages":
            return sheetToObjects(SHEETS.PROJECT_IMAGES)
                .filter(function (img) { return img.projectId === payload.projectId; })
                .sort(byOrder);

        // ---- Image upload (Drive) ----
        case "uploadImage":
            return uploadImageToDrive(payload.filename, payload.mimeType, payload.base64);

        // ---- Services ----
        case "listServicesAdmin":
            return sheetToObjects(SHEETS.SERVICES).sort(byOrder);
        case "createService":
            return createRow(SHEETS.SERVICES, normalizeListItem(payload.service, ["title", "description", "icon"]));
        case "updateService":
            return updateRowById(SHEETS.SERVICES, payload.id, payload.updates);
        case "deleteService":
            return deleteRowById(SHEETS.SERVICES, payload.id);
        case "reorderServices":
            return reorderItems(SHEETS.SERVICES, payload.orderedIds);

        // ---- Process ----
        case "listProcessAdmin":
            return sheetToObjects(SHEETS.PROCESS).sort(byOrder);
        case "createProcess":
            return createRow(SHEETS.PROCESS, normalizeListItem(payload.item, ["step", "title", "description"]));
        case "updateProcess":
            return updateRowById(SHEETS.PROCESS, payload.id, payload.updates);
        case "deleteProcess":
            return deleteRowById(SHEETS.PROCESS, payload.id);
        case "reorderProcess":
            return reorderItems(SHEETS.PROCESS, payload.orderedIds);

        // ---- Why SK ----
        case "listWhySKAdmin":
            return sheetToObjects(SHEETS.WHY_SK).sort(byOrder);
        case "createWhySK":
            return createRow(SHEETS.WHY_SK, normalizeListItem(payload.item, ["title", "description"]));
        case "updateWhySK":
            return updateRowById(SHEETS.WHY_SK, payload.id, payload.updates);
        case "deleteWhySK":
            return deleteRowById(SHEETS.WHY_SK, payload.id);
        case "reorderWhySK":
            return reorderItems(SHEETS.WHY_SK, payload.orderedIds);

        // ---- Inquiries ----
        case "listInquiries":
            return sheetToObjects(SHEETS.INQUIRIES).sort(function (a, b) {
                return new Date(b.submittedAt) - new Date(a.submittedAt);
            });
        case "markInquiryStatus":
            return updateRowById(SHEETS.INQUIRIES, payload.id, { status: payload.status });

        // ---- Settings ----
        case "getSettingsAdmin":
            return sheetToObjects(SHEETS.SETTINGS);
        case "updateSettings":
            return updateSettings(payload.settings);

        // ---- Videos (Video Gallery — standalone, not project videos) ----
        case "listVideosAdmin":
            return sheetToObjects(SHEETS.VIDEOS).sort(byOrder);
        case "createVideo":
            return createRow(SHEETS.VIDEOS, {
                id: newId(),
                title: (payload.video && payload.video.title) || "",
                youtubeUrl: (payload.video && payload.video.youtubeUrl) || "",
                order: (payload.video && payload.video.order) || 0,
                createdDate: new Date().toISOString()
            });
        case "updateVideo":
            return updateRowById(SHEETS.VIDEOS, payload.id, payload.updates);
        case "deleteVideo":
            return deleteRowById(SHEETS.VIDEOS, payload.id);
        case "reorderVideos":
            return reorderItems(SHEETS.VIDEOS, payload.orderedIds);

        // ---- Portfolio Categories (Portfolio nav dropdown structure) ----
        case "listPortfolioCategoriesAdmin":
            return sheetToObjects(SHEETS.PORTFOLIO_CATEGORIES).sort(byOrder);
        case "createPortfolioCategory":
            return createRow(SHEETS.PORTFOLIO_CATEGORIES, {
                id: newId(),
                name: (payload.category && payload.category.name) || "",
                parentId: (payload.category && payload.category.parentId) || "",
                order: (payload.category && payload.category.order) || 0
            });
        case "updatePortfolioCategory":
            return updateRowById(SHEETS.PORTFOLIO_CATEGORIES, payload.id, payload.updates);
        case "deletePortfolioCategory":
            return deletePortfolioCategoryCascade(payload.id);
        case "reorderPortfolioCategories":
            return reorderItems(SHEETS.PORTFOLIO_CATEGORIES, payload.orderedIds);

        // ---- Dashboard ----
        case "getDashboardStats":
            return getDashboardStats();

        default:
            throw new Error("Unknown admin action: " + action);
    }
}

/* =====================================================
   AUTH
===================================================== */

function handleLogin(payload) {
    var stored = PropertiesService.getScriptProperties().getProperty("ADMIN_PASSWORD");

    if (!stored) {
        throw new Error("Admin password is not configured on the server yet.");
    }

    if (!payload.password || payload.password !== stored) {
        throw new Error("Incorrect password.");
    }

    var token = Utilities.getUuid();
    CacheService.getScriptCache().put(token, "valid", SESSION_DURATION_SECONDS);

    return { token: token, expiresIn: SESSION_DURATION_SECONDS };
}

function handleLogout(token) {
    if (token) CacheService.getScriptCache().remove(token);
    return { loggedOut: true };
}

function requireAuth(token) {
    if (!token || !CacheService.getScriptCache().get(token)) {
        throw new Error("SESSION_EXPIRED");
    }
    // sliding expiry: touch the session on every authenticated request
    CacheService.getScriptCache().put(token, "valid", SESSION_DURATION_SECONDS);
}

/* =====================================================
   PROJECTS (public read helpers — include gallery)
===================================================== */

function getPublicProjects() {
    // No "published" field anymore — every project row is public
    // as soon as it's created.
    var projects = sheetToObjects(SHEETS.PROJECTS).sort(byOrder);

    var images = sheetToObjects(SHEETS.PROJECT_IMAGES);

    return projects.map(function (p) {
        p.gallery = images
            .filter(function (img) { return img.projectId === p.id; })
            .sort(byOrder)
            .map(function (img) { return img.imageUrl; });

        if (!p.gallery.length && p.coverImageUrl) p.gallery = [p.coverImageUrl];

        return p;
    });
}

function getPublicProject(id) {
    var all = getPublicProjects();
    for (var i = 0; i < all.length; i++) {
        if (all[i].id === id) return all[i];
    }
    return null;
}

function getLatestProjects(limit) {
    var projects = getPublicProjects();
    projects.sort(function (a, b) {
        return new Date(b.createdDate) - new Date(a.createdDate);
    });
    return projects.slice(0, limit || 6);
}

function normalizeProject(project, isPartial) {
    var out = {};
    var fields = SHEET_HEADERS.Projects;

    fields.forEach(function (field) {
        if (project[field] === undefined) {
            if (!isPartial) out[field] = defaultForField(field);
            return;
        }
        out[field] = project[field];
    });

    if (!isPartial) {
        out.id = newId();
        out.createdDate = new Date().toISOString();
        if (out.order === undefined) out.order = 0;
    }

    return out;
}

function defaultForField(field) {
    if (field === "order") return 0;
    return "";
}

function deleteProjectCascade(id) {
    var images = sheetToObjects(SHEETS.PROJECT_IMAGES).filter(function (img) { return img.projectId === id; });
    images.forEach(function (img) {
        trashDriveFileIfOwned(img.imageUrl);
        deleteRowById(SHEETS.PROJECT_IMAGES, img.id);
    });

    var project = sheetToObjects(SHEETS.PROJECTS).filter(function (p) { return p.id === id; })[0];
    if (project) {
        trashDriveFileIfOwned(project.coverImageUrl);
    }

    return deleteRowById(SHEETS.PROJECTS, id);
}

function deleteProjectImage(id) {
    var row = sheetToObjects(SHEETS.PROJECT_IMAGES).filter(function (img) { return img.id === id; })[0];
    if (row) trashDriveFileIfOwned(row.imageUrl);
    return deleteRowById(SHEETS.PROJECT_IMAGES, id);
}

/* =====================================================
   PORTFOLIO CATEGORIES
   One level of nesting: a category with parentId === ""
   is top-level (shown directly in the nav dropdown); a
   category with parentId set is a subcategory of that
   top-level entry.
===================================================== */

function deletePortfolioCategoryCascade(id) {
    // Deleting a top-level category also deletes its subcategories.
    // Projects that referenced any of these categories are NOT
    // deleted — they just lose that categorization (portfolioCategoryId
    // is cleared), same as how deleting a Drive image never deletes
    // the project it belonged to.
    var all = sheetToObjects(SHEETS.PORTFOLIO_CATEGORIES);
    var children = all.filter(function (c) { return c.parentId === id; });

    children.forEach(function (child) {
        clearProjectPortfolioCategory(child.id);
        deleteRowById(SHEETS.PORTFOLIO_CATEGORIES, child.id);
    });

    clearProjectPortfolioCategory(id);
    return deleteRowById(SHEETS.PORTFOLIO_CATEGORIES, id);
}

function clearProjectPortfolioCategory(categoryId) {
    var sheet = getSheet(SHEETS.PROJECTS);
    var affected = sheetToObjects(SHEETS.PROJECTS).filter(function (p) { return p.portfolioCategoryId === categoryId; });
    affected.forEach(function (p) {
        updateRowByColumn(sheet, "id", p.id, { portfolioCategoryId: "" });
    });
}

/* =====================================================
   GENERIC LIST ITEMS (Services / Process / WhySK)
===================================================== */

function getPublishedSorted(sheetName) {
    return sheetToObjects(sheetName)
        .filter(function (row) { return row.published === true || row.published === "TRUE"; })
        .sort(byOrder);
}

function normalizeListItem(item, extraFields) {
    var out = {
        id: newId(),
        published: item.published === undefined ? false : item.published,
        order: item.order === undefined ? 0 : item.order
    };
    extraFields.forEach(function (f) { out[f] = item[f] || ""; });
    return out;
}

/* =====================================================
   INQUIRIES
===================================================== */

function createInquiry(payload) {
    return createRow(SHEETS.INQUIRIES, {
        id: newId(),
        name: payload.name || "",
        phone: payload.phone || "",
        email: payload.email || "",
        projectType: payload.projectType || "",
        location: payload.location || "",
        space: payload.space || "",
        budget: payload.budget || "",
        message: payload.message || "",
        submittedAt: new Date().toISOString(),
        status: "pending"
    });
}

/* =====================================================
   SETTINGS
===================================================== */

function updateSettings(settings) {
    var sheet = getSheet(SHEETS.SETTINGS);
    var existing = sheetToObjects(SHEETS.SETTINGS);

    Object.keys(settings || {}).forEach(function (key) {
        var row = existing.filter(function (r) { return r.key === key; })[0];
        if (row) {
            updateRowByColumn(sheet, "key", key, { value: settings[key] });
        } else {
            appendRowRaw(sheet, SHEET_HEADERS.Settings, { key: key, value: settings[key] });
        }
    });

    try { CacheService.getScriptCache().remove(SETTINGS_CACHE_KEY); } catch (e) {}

    return sheetToObjects(SHEETS.SETTINGS);
}

var SETTINGS_CACHE_KEY = "public_settings_v1";

function settingsAsMap() {
    // Every visitor requests this on page load. Reading the Sheet each
    // time is the slow part, so the result is cached for a few hours and
    // cleared the moment the admin saves any setting (see updateSettings).
    var cache = CacheService.getScriptCache();
    var hit = cache.get(SETTINGS_CACHE_KEY);
    if (hit) {
        try { return JSON.parse(hit); } catch (e) { /* fall through and rebuild */ }
    }

    var map = {};
    sheetToObjects(SHEETS.SETTINGS).forEach(function (row) {
        map[row.key] = row.value;
    });

    try { cache.put(SETTINGS_CACHE_KEY, JSON.stringify(map), 21600); } catch (e) {}
    return map;
}

/* =====================================================
   DASHBOARD
===================================================== */

function getDashboardStats() {
    var projects = sheetToObjects(SHEETS.PROJECTS);
    var services = sheetToObjects(SHEETS.SERVICES);
    var inquiries = sheetToObjects(SHEETS.INQUIRIES);

    return {
        totalProjects: projects.length,
        residentialProjects: projects.filter(function (p) { return p.category === "Residential"; }).length,
        commercialProjects: projects.filter(function (p) { return p.category === "Commercial"; }).length,
        totalServices: services.length,
        totalInquiries: inquiries.length,
        pendingInquiries: inquiries.filter(function (i) { return i.status === "pending"; }).length
    };
}

/* =====================================================
   DRIVE IMAGE UPLOAD
===================================================== */

function uploadImageToDrive(filename, mimeType, base64) {
    var folderId = PropertiesService.getScriptProperties().getProperty("DRIVE_FOLDER_ID");
    if (!folderId) throw new Error("DRIVE_FOLDER_ID is not configured on the server yet.");

    var folder = DriveApp.getFolderById(folderId);
    var bytes = Utilities.base64Decode(base64);
    var blob = Utilities.newBlob(bytes, mimeType, filename);

    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
        fileId: file.getId(),
        url: driveViewUrl(file.getId())
    };
}

function driveViewUrl(fileId) {
    return "https://drive.google.com/uc?export=view&id=" + fileId;
}

function extractDriveFileId(url) {
    if (!url) return null;
    var match = String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
}

function trashDriveFileIfOwned(url) {
    var fileId = extractDriveFileId(url);
    if (!fileId) return;
    try {
        var folderId = PropertiesService.getScriptProperties().getProperty("DRIVE_FOLDER_ID");
        var file = DriveApp.getFileById(fileId);
        // only trash files that actually live in our managed folder
        var parents = file.getParents();
        var inOurFolder = false;
        while (parents.hasNext()) {
            if (parents.next().getId() === folderId) inOurFolder = true;
        }
        if (inOurFolder) file.setTrashed(true);
    } catch (e) {
        // file already gone, or not a Drive file we can access — safe to ignore
    }
}

/* =====================================================
   SHEET HELPERS (generic get/create/update/delete)
===================================================== */

function getSpreadsheet() {
  return SpreadsheetApp.openById("1hOX7nxOzA0wdvxXio5mWANJjb5KCvhLb69RnqT-thvQ");
}

function getSheet(name) {
    var sheet = getSpreadsheet().getSheetByName(name);
    if (!sheet) throw new Error("Sheet not found: " + name + ". Run setupSheets() once from the Apps Script editor.");
    return sheet;
}

function sheetToObjects(name) {
    // Every visitor's page load reads several of these sheets, and the
    // Sheet read itself (not the JSON work) is the slow part. Cache the
    // parsed rows for a few minutes; any create/update/delete/reorder
    // clears this immediately (see invalidateSheetCache below), so
    // admin changes still show up right away.
    var cache = CacheService.getScriptCache();
    var cacheKey = "sheet_v1_" + name;
    var hit = cache.get(cacheKey);
    if (hit) {
        try { return JSON.parse(hit); } catch (e) { /* fall through and rebuild */ }
    }

    var sheet = getSheet(name);
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) return [];

    var headers = values[0];
    var rows = values.slice(1);

    var result = rows
        .filter(function (row) { return row.join("") !== ""; })
        .map(function (row) {
            var obj = {};
            headers.forEach(function (h, i) {
                obj[h] = coerceValue(row[i]);
            });
            return obj;
        });

    try { cache.put(cacheKey, JSON.stringify(result), 1500); } catch (e) {}

    return result;
}

function invalidateSheetCache(name) {
    try { CacheService.getScriptCache().remove("sheet_v1_" + name); } catch (e) {}
}

function coerceValue(value) {
    if (value === "TRUE") return true;
    if (value === "FALSE") return false;
    return value;
}

function createRow(sheetName, obj) {
    var sheet = getSheet(sheetName);
    var headers = SHEET_HEADERS[sheetName];
    appendRowRaw(sheet, headers, obj);
    invalidateSheetCache(sheetName);
    return obj;
}

function appendRowRaw(sheet, headers, obj) {
    var row = headers.map(function (h) { return obj[h] !== undefined ? obj[h] : ""; });
    sheet.appendRow(row);
}

function updateRowById(sheetName, id, updates) {
    var sheet = getSheet(sheetName);
    return updateRowByColumn(sheet, "id", id, updates, sheetName);
}

function updateRowByColumn(sheet, matchColumn, matchValue, updates, sheetNameForHeaders) {
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var colIndex = headers.indexOf(matchColumn);
    if (colIndex === -1) throw new Error("Column not found: " + matchColumn);

    for (var r = 1; r < data.length; r++) {
        if (String(data[r][colIndex]) === String(matchValue)) {
            headers.forEach(function (h, c) {
                if (updates[h] !== undefined) {
                    sheet.getRange(r + 1, c + 1).setValue(updates[h]);
                }
            });
            var updated = {};
            headers.forEach(function (h, c) {
                updated[h] = updates[h] !== undefined ? updates[h] : data[r][c];
            });
            invalidateSheetCache(sheet.getName());
            return updated;
        }
    }

    throw new Error("Row not found where " + matchColumn + " = " + matchValue);
}

function deleteRowById(sheetName, id) {
    var sheet = getSheet(sheetName);
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var colIndex = headers.indexOf("id");

    for (var r = 1; r < data.length; r++) {
        if (String(data[r][colIndex]) === String(id)) {
            sheet.deleteRow(r + 1);
            invalidateSheetCache(sheetName);
            return { deleted: true, id: id };
        }
    }

    return { deleted: false, id: id };
}

function reorderItems(sheetName, orderedIds) {
    var sheet = getSheet(sheetName);
    orderedIds.forEach(function (id, index) {
        try {
            updateRowByColumn(sheet, "id", id, { order: index });
        } catch (e) {
            // skip ids that no longer exist
        }
    });
    return { reordered: true };
}

function byOrder(a, b) {
    return (Number(a.order) || 0) - (Number(b.order) || 0);
}

function newId() {
    return Utilities.getUuid();
}

/* =====================================================
   RESPONSE HELPERS
===================================================== */

function ok(data) {
    return { success: true, data: data, message: "" };
}

function fail(message) {
    // SESSION_EXPIRED is a marker the frontend checks for explicitly
    // to redirect straight to login instead of showing a generic error.
    return { success: false, data: null, message: message };
}

function jsonOutput(obj) {
    return ContentService
        .createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}

/* =====================================================
   ONE-TIME SETUP HELPER
   Run this once from the Apps Script editor (select
   `setupSheets` in the function dropdown, click Run) to
   create every sheet + header row automatically.
===================================================== */

function setupSheets() {
    var ss = getSpreadsheet();

    Object.keys(SHEET_HEADERS).forEach(function (name) {
        var sheet = ss.getSheetByName(name);
        if (!sheet) sheet = ss.insertSheet(name);

        var headers = SHEET_HEADERS[name];
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.setFrozenRows(1);
    });

    // remove the default empty "Sheet1" if it's still there and unused
    var defaultSheet = ss.getSheetByName("Sheet1");
    if (defaultSheet && ss.getSheets().length > 1) {
        var hasData = defaultSheet.getDataRange().getValues().join("") !== "";
        if (!hasData) ss.deleteSheet(defaultSheet);
    }

    Logger.log("Sheets are set up. You can now add rows or use the admin panel.");
}

/* =====================================================
   MIGRATION HELPER — for the already-live site
   Run this once from the Apps Script editor (select
   `migrateSchema` in the function dropdown, click Run).

   It is safe to run more than once: it only adds columns/
   sheets that don't exist yet and never touches existing
   rows or values. This is what actually adds the new
   "description" and "portfolioCategoryId" columns to your
   live Projects sheet, and creates the Videos and
   PortfolioCategories sheets used by the new Video Gallery
   and Portfolio dropdown.
===================================================== */

function migrateSchema() {
    var ss = getSpreadsheet();
    var addedColumns = [];
    var addedSheets = [];

    // 1. New sheets (Videos, PortfolioCategories) — create if missing,
    //    same as setupSheets() does for a brand-new install.
    Object.keys(SHEET_HEADERS).forEach(function (name) {
        var sheet = ss.getSheetByName(name);
        if (!sheet) {
            sheet = ss.insertSheet(name);
            var headers = SHEET_HEADERS[name];
            sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
            sheet.setFrozenRows(1);
            addedSheets.push(name);
        }
    });

    // 2. New columns on existing sheets — appended at the end of the
    //    header row, so existing columns and their data never move.
    Object.keys(SHEET_HEADERS).forEach(function (name) {
        var sheet = ss.getSheetByName(name);
        if (!sheet) return; // just created above with full headers already

        var lastCol = Math.max(sheet.getLastColumn(), 1);
        var existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

        SHEET_HEADERS[name].forEach(function (expectedHeader) {
            if (existingHeaders.indexOf(expectedHeader) === -1) {
                var nextCol = sheet.getLastColumn() + 1;
                sheet.getRange(1, nextCol).setValue(expectedHeader);
                existingHeaders.push(expectedHeader);
                addedColumns.push(name + "." + expectedHeader);
            }
        });
    });

    if (!addedSheets.length && !addedColumns.length) {
        Logger.log("Already up to date — nothing to migrate.");
    } else {
        Logger.log(
            "Migration complete." +
            (addedSheets.length ? " New sheets: " + addedSheets.join(", ") + "." : "") +
            (addedColumns.length ? " New columns: " + addedColumns.join(", ") + "." : "")
        );
    }
}
