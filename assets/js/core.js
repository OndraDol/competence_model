/* ═════════════════════════════════════════════════
   AURES Competence Model — Core
   State, Firebase bootstrap, country switch, filters
   ═════════════════════════════════════════════════ */

// ⚠️  Paste Firebase config here after running `docs/firebase-setup.md` (Step 5).
//     apiKey, authDomain, databaseURL, projectId, storageBucket, messagingSenderId, appId.
const FIREBASE_CONFIG = {
    apiKey: "REPLACE_ME",
    authDomain: "REPLACE_ME",
    databaseURL: "REPLACE_ME",
    projectId: "REPLACE_ME",
    storageBucket: "REPLACE_ME",
    messagingSenderId: "REPLACE_ME",
    appId: "REPLACE_ME"
};

const FIREBASE_ENABLED = FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== "REPLACE_ME";

if (FIREBASE_ENABLED) {
    firebase.initializeApp(FIREBASE_CONFIG);
}

// ── Country map ──────────────────────────────────
// Datacruit stores "Czech Republic" / "Slovakia" / "Poland" in `country`.
const COUNTRY_DATACRUIT = { CZ: "Czech Republic", SK: "Slovakia", PL: "Poland" };
const COUNTRY_SHORT_BY_DATACRUIT = { "Czech Republic": "CZ", "Slovakia": "SK", "Poland": "PL" };

// ── State ────────────────────────────────────────
const State = {
    results: {},           // { [result_id]: Datacruit record }
    hrScores: {},          // { [result_id]: hrScore record }
    meta: null,            // /meta payload
    globalCountry: "ALL",  // CZ | SK | PL | ALL (persisted)
    filters: {
        form: "ALL",
        catalog: "ALL",
        branch: "ALL",
        manager: "ALL",
        country: "ALL",
        hrStatus: "ALL"     // ALL | WITH | WITHOUT
    },
    search: "",
    expandedCandidateId: null,
    currentView: "dashboard", // dashboard | stats
    currentUser: null
};

// ── Persistence helpers ──────────────────────────
const STORAGE_KEY_COUNTRY = "cm.globalCountry";
const STORAGE_KEY_THEME = "cm.theme";

function loadPersistedCountry() {
    try {
        const v = localStorage.getItem(STORAGE_KEY_COUNTRY);
        if (v && ["CZ", "SK", "PL", "ALL"].includes(v)) return v;
    } catch (e) { /* ignore */ }
    return "ALL";
}
function persistCountry(c) {
    try { localStorage.setItem(STORAGE_KEY_COUNTRY, c); } catch (e) { /* ignore */ }
}

// ── Country switcher ─────────────────────────────
function setGlobalCountry(code) {
    const next = ["CZ", "SK", "PL", "ALL"].includes(code) ? code : "ALL";
    State.globalCountry = next;
    persistCountry(next);

    ["CZ", "SK", "PL", "ALL"].forEach(c => {
        const btn = document.getElementById(`nav-btn-${c}`);
        if (btn) btn.classList.toggle("active", c === next);
    });

    // Show/hide country filter — only relevant in ALL mode.
    const cg = document.getElementById("filterCountryGroup");
    if (cg) cg.style.display = next === "ALL" ? "flex" : "none";
    if (next !== "ALL") State.filters.country = "ALL";

    // Reset expanded candidate when switching scope (less confusing).
    State.expandedCandidateId = null;

    rerenderAll();
}

// ── Filter helpers ───────────────────────────────
function handleFilterChange() {
    State.filters.form = document.getElementById("filterForm").value;
    State.filters.catalog = document.getElementById("filterCatalog").value;
    State.filters.branch = document.getElementById("filterBranch").value;
    State.filters.manager = document.getElementById("filterManager").value;
    const cEl = document.getElementById("filterCountry");
    State.filters.country = cEl ? cEl.value : "ALL";
    State.filters.hrStatus = document.getElementById("filterHrStatus").value;
    rerenderAll();
}

function resetFilters() {
    State.filters = { form: "ALL", catalog: "ALL", branch: "ALL", manager: "ALL", country: "ALL", hrStatus: "ALL" };
    State.search = "";
    const search = document.getElementById("globalSearch");
    if (search) search.value = "";
    ["filterForm", "filterCatalog", "filterBranch", "filterManager", "filterCountry", "filterHrStatus"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "ALL";
    });
    rerenderAll();
}

function handleSearch(value) {
    State.search = (value || "").trim().toLowerCase();
    rerenderAll();
}

// ── Data access ──────────────────────────────────
function getAllResultsArray() {
    return Object.values(State.results || {});
}

function matchesSearch(record, needle) {
    if (!needle) return true;
    const hay = [
        record.candidate_fullname,
        record.manager_name,
        record.catalog_position,
        record.form_name,
        record.branch_name,
        record.client_branch_name,
        record.system_company_branch_name,
        record.country
    ].filter(Boolean).map(s => String(s).toLowerCase()).join(" | ");
    return hay.includes(needle);
}

function applyCountry(record) {
    if (State.globalCountry === "ALL") return true;
    const targetName = COUNTRY_DATACRUIT[State.globalCountry];
    return record.country === targetName;
}

function applyFilters(record) {
    const f = State.filters;
    if (f.form !== "ALL" && record.form_name !== f.form) return false;
    if (f.catalog !== "ALL" && record.catalog_position !== f.catalog) return false;
    if (f.branch !== "ALL" && record.system_company_branch_name !== f.branch) return false;
    if (f.manager !== "ALL" && record.manager_name !== f.manager) return false;
    if (State.globalCountry === "ALL" && f.country !== "ALL" && record.country !== f.country) return false;
    if (f.hrStatus !== "ALL") {
        const hasHr = Boolean(State.hrScores[record.result_id]);
        if (f.hrStatus === "WITH" && !hasHr) return false;
        if (f.hrStatus === "WITHOUT" && hasHr) return false;
    }
    return true;
}

function getFilteredResults() {
    const needle = State.search;
    return getAllResultsArray()
        .filter(r => applyCountry(r))
        .filter(r => applyFilters(r))
        .filter(r => matchesSearch(r, needle));
}

// ── HR score helpers ─────────────────────────────
function getHrScore(resultId) {
    return State.hrScores[resultId] || null;
}

function computeTotalPoints(perCompetence) {
    return Object.values(perCompetence || {})
        .filter(v => typeof v === "number" && !isNaN(v))
        .reduce((a, b) => a + b, 0);
}

function diffClass(delta) {
    const d = Math.abs(delta || 0);
    if (d === 0) return "diff-zero";
    if (d <= 1) return "diff-low";
    if (d <= 3) return "diff-med";
    return "diff-high";
}

// ── Firebase listeners ───────────────────────────
let _resultsRef = null;
let _hrScoresRef = null;
let _metaRef = null;

function startFirebaseListeners() {
    if (!FIREBASE_ENABLED) return;
    const db = firebase.database();

    _resultsRef = db.ref("results");
    _resultsRef.on("value", snap => {
        State.results = snap.val() || {};
        hideLoadingOverlay();
        setFirebaseStatus("ok", "Firebase: online");
        populateFilterDropdowns();
        rerenderAll();
    }, err => {
        console.error("[Firebase] /results read failed:", err);
        setFirebaseStatus("error", "Firebase: chyba čtení");
        hideLoadingOverlay();
    });

    _hrScoresRef = db.ref("hrScores");
    _hrScoresRef.on("value", snap => {
        State.hrScores = snap.val() || {};
        rerenderAll();
    });

    _metaRef = db.ref("meta");
    _metaRef.on("value", snap => {
        State.meta = snap.val() || null;
        updateLastUpdatedBadge();
    });
}

function stopFirebaseListeners() {
    if (_resultsRef) _resultsRef.off();
    if (_hrScoresRef) _hrScoresRef.off();
    if (_metaRef) _metaRef.off();
    _resultsRef = _hrScoresRef = _metaRef = null;
}

function setFirebaseStatus(kind, text) {
    const el = document.getElementById("firebaseStatus");
    const lbl = document.getElementById("firebaseStatusLabel");
    if (!el || !lbl) return;
    el.className = `firebase-status ${kind}`;
    lbl.textContent = text;
}

function updateLastUpdatedBadge() {
    const el = document.getElementById("lastUpdatedText");
    if (!el) return;
    const iso = State.meta && State.meta.lastSync && State.meta.lastSync.uploadedAt;
    if (!iso) { el.textContent = "Poslední sync: —"; return; }
    const d = new Date(iso);
    el.textContent = `Poslední sync: ${d.toLocaleString("cs-CZ")} · ${State.meta.lastSync.recordCount ?? "?"} záznamů`;
}

function hideLoadingOverlay() {
    const o = document.getElementById("loadingOverlay");
    if (o) o.style.display = "none";
    ["dashboardBtn", "statsBtn", "logoutBtn"].forEach(id => {
        const b = document.getElementById(id);
        if (b) b.classList.remove("hidden");
    });
    showDashboardView();
}

// ── Filter dropdown population ───────────────────
function populateFilterDropdowns() {
    const records = getAllResultsArray().filter(r => applyCountry(r));
    const uniqueSorted = (arr) => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b, "cs"));
    const fill = (id, values, placeholder) => {
        const el = document.getElementById(id);
        if (!el) return;
        const current = el.value;
        el.innerHTML = `<option value="ALL">${placeholder}</option>` +
            values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
        if (values.includes(current)) el.value = current;
    };
    fill("filterForm", uniqueSorted(records.map(r => r.form_name)), "Vše");
    fill("filterCatalog", uniqueSorted(records.map(r => r.catalog_position)), "Vše");
    fill("filterBranch", uniqueSorted(records.map(r => r.system_company_branch_name)), "Vše");
    fill("filterManager", uniqueSorted(records.map(r => r.manager_name)), "Vše");
}

function escapeHtml(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// ── HR save (debounced) ──────────────────────────
const HR_SAVE_DEBOUNCE_MS = 350;
const _hrSaveTimers = {};

function saveHrScore(resultId, patch) {
    // patch can contain { perCompetence: {...}, commentary: "..." }
    clearTimeout(_hrSaveTimers[resultId]);
    _hrSaveTimers[resultId] = setTimeout(() => persistHrScore(resultId, patch), HR_SAVE_DEBOUNCE_MS);
    setDetailMetaSaving(resultId);
}

async function persistHrScore(resultId, patch) {
    if (!FIREBASE_ENABLED || !State.currentUser) {
        showToast("Nejste přihlášeni — změna se neuloží.", "error");
        return;
    }
    const email = State.currentUser.email || "";
    const db = firebase.database();
    const existing = State.hrScores[resultId] || {};
    const perCompetence = Object.assign({}, existing.perCompetence || {}, patch.perCompetence || {});
    const commentary = patch.commentary !== undefined ? patch.commentary : (existing.commentary || "");
    const totalPoints = computeTotalPoints(perCompetence);
    const nowIso = new Date().toISOString();

    const payload = {
        perCompetence,
        commentary,
        totalPoints,
        updatedBy: email,
        updatedAt: nowIso
    };

    try {
        // History: push previous state (if any) before overwriting.
        if (existing && existing.updatedAt) {
            await db.ref(`hrScoreHistory/${resultId}`).push(existing);
        }
        await db.ref(`hrScores/${resultId}`).set(payload);
        setDetailMetaSaved(resultId);
    } catch (err) {
        console.error("[Firebase] saveHrScore failed:", err);
        showToast("Uložení selhalo: " + (err.message || err), "error");
        setDetailMetaError(resultId);
    }
}

function setDetailMetaSaving(resultId) { setDetailMeta(resultId, "Ukládám…", "meta-saving"); }
function setDetailMetaSaved(resultId) { setDetailMeta(resultId, "Uloženo", "meta-saved"); }
function setDetailMetaError(resultId) { setDetailMeta(resultId, "Chyba ukládání", "meta-error"); }
function setDetailMeta(resultId, text, cls) {
    const el = document.querySelector(`[data-meta-status="${resultId}"]`);
    if (!el) return;
    el.className = cls;
    el.textContent = text;
}

// ── View switching ───────────────────────────────
function showDashboardView() {
    State.currentView = "dashboard";
    document.getElementById("dashboardView").classList.remove("hidden");
    document.getElementById("statsView").classList.add("hidden");
    document.getElementById("dashboardBtn").classList.add("active");
    document.getElementById("statsBtn").classList.remove("active");
    rerenderAll();
}

function showStatsView() {
    State.currentView = "stats";
    document.getElementById("dashboardView").classList.add("hidden");
    document.getElementById("statsView").classList.remove("hidden");
    document.getElementById("statsBtn").classList.add("active");
    document.getElementById("dashboardBtn").classList.remove("active");
    rerenderAll();
}

function goHome() {
    resetFilters();
    showDashboardView();
}

// ── Theme toggle ─────────────────────────────────
function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "" : "dark";
    if (next) document.documentElement.setAttribute("data-theme", next);
    else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem(STORAGE_KEY_THEME, next); } catch (e) { /* ignore */ }
}
function loadPersistedTheme() {
    try {
        const v = localStorage.getItem(STORAGE_KEY_THEME);
        if (v === "dark") document.documentElement.setAttribute("data-theme", "dark");
    } catch (e) { /* ignore */ }
}

// ── Toast ────────────────────────────────────────
let _toastTimer = null;
function showToast(text, kind) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.className = `toast ${kind || ""}`;
    el.textContent = text;
    el.style.display = "block";
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { el.style.display = "none"; }, 3200);
}

// ── Rerender hub ─────────────────────────────────
function rerenderAll() {
    populateFilterDropdowns();
    if (State.currentView === "dashboard" && typeof renderDashboard === "function") renderDashboard();
    if (State.currentView === "stats" && typeof renderStats === "function") renderStats();
    if (window.lucide) lucide.createIcons();
}

// ── Bootstrap ────────────────────────────────────
(function bootstrap() {
    loadPersistedTheme();
    State.globalCountry = loadPersistedCountry();
    // Sync button active class on initial load.
    ["CZ", "SK", "PL", "ALL"].forEach(c => {
        const btn = document.getElementById(`nav-btn-${c}`);
        if (btn) btn.classList.toggle("active", c === State.globalCountry);
    });
    const cg = document.getElementById("filterCountryGroup");
    if (cg) cg.style.display = State.globalCountry === "ALL" ? "flex" : "none";

    if (!FIREBASE_ENABLED) {
        // Dev / setup mode — show a friendly message.
        setTimeout(() => {
            const overlay = document.getElementById("loadingOverlay");
            if (overlay) {
                overlay.innerHTML = `
                    <div style="max-width:440px;text-align:center;padding:32px;">
                        <h2 style="font-size:18px;font-weight:800;color:var(--text-primary);margin-bottom:10px;">Firebase není nakonfigurován</h2>
                        <p style="font-size:13px;color:var(--text-muted);line-height:1.6;">
                            Nastavte Firebase projekt podle <code>docs/firebase-setup.md</code> a vložte
                            <code>FIREBASE_CONFIG</code> do <code>assets/js/core.js</code>.
                        </p>
                    </div>`;
            }
        }, 100);
        return;
    }
})();
