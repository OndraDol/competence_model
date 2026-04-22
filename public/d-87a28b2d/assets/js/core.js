/* ═════════════════════════════════════════════════
   AURES Competence Model — Core
   State, password gate, country switch, filters, search.
   Data source: local encrypted data.enc.json (AES-GCM).
   ═════════════════════════════════════════════════ */

// ── Country map ──────────────────────────────────
// Datacruit stores "Czech Republic" / "Slovakia" / "Poland" in `country`.
const COUNTRY_DATACRUIT = { CZ: "Czech Republic", SK: "Slovakia", PL: "Poland" };
const COUNTRY_SHORT_BY_DATACRUIT = { "Czech Republic": "CZ", "Slovakia": "SK", "Poland": "PL" };

// ── State ────────────────────────────────────────
const State = {
    results: {},           // { [result_id]: Datacruit record }
    meta: null,            // { syncedAt, datacruitFetchedAt, recordCount, jsonRepairApplied }
    globalCountry: "ALL",  // CZ | SK | PL | ALL (persisted)
    filters: {
        timePeriod: "ALL", // ALL | 7D | 30D | 90D | YEAR
        form: "ALL",       // form_name = oddělení
        catalog: "ALL",    // catalog_position
        city: "ALL",       // client_branch_name
        manager: "ALL",
        country: "ALL"
    },
    search: "",
    expandedCandidateId: null,
    currentView: "dashboard",
    unlocked: false,
    comparison: {
        dimension: null,  // form | catalog | city | country | manager
        valueA: null,
        valueB: null
    }
};

// Mapping of comparison dimension keys to Datacruit record fields.
const DIMENSION_FIELD = {
    form:    "form_name",
    catalog: "catalog_position",
    city:    "client_branch_name",
    country: "country",
    manager: "manager_name"
};
const DIMENSION_LABEL = {
    form:    "Oddělení",
    catalog: "Pozice",
    city:    "Pobočka",
    country: "Země",
    manager: "Manažer"
};
function getDimensionField(dim) { return DIMENSION_FIELD[dim] || null; }

const TIME_PERIOD_OPTIONS = [
    { value: "ALL",  label: "Vše" },
    { value: "7D",   label: "7 dní" },
    { value: "30D",  label: "30 dní" },
    { value: "90D",  label: "90 dní" },
    { value: "YEAR", label: "Tento rok" }
];

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

    const cg = document.getElementById("filterCountryGroup");
    if (cg) cg.style.display = next === "ALL" ? "flex" : "none";
    if (next !== "ALL") State.filters.country = "ALL";

    State.expandedCandidateId = null;
    rerenderAll();
}

// ── Filter helpers ───────────────────────────────
function handleFilterChange() {
    State.filters.form = document.getElementById("filterForm").value;
    State.filters.catalog = document.getElementById("filterCatalog").value;
    State.filters.city = document.getElementById("filterCity").value;
    State.filters.manager = document.getElementById("filterManager").value;
    const cEl = document.getElementById("filterCountry");
    State.filters.country = cEl ? cEl.value : "ALL";
    rerenderAll();
}

function handleTimePeriodChange(period) {
    State.filters.timePeriod = period;
    TIME_PERIOD_OPTIONS.forEach(opt => {
        const btn = document.getElementById(`time-btn-${opt.value}`);
        if (btn) btn.classList.toggle("active", opt.value === period);
    });
    rerenderAll();
}

function resetFilters() {
    State.filters = { timePeriod: "ALL", form: "ALL", catalog: "ALL", city: "ALL", manager: "ALL", country: "ALL" };
    State.search = "";
    const search = document.getElementById("globalSearch");
    if (search) search.value = "";
    ["filterForm", "filterCatalog", "filterCity", "filterManager", "filterCountry"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "ALL";
    });
    TIME_PERIOD_OPTIONS.forEach(opt => {
        const btn = document.getElementById(`time-btn-${opt.value}`);
        if (btn) btn.classList.toggle("active", opt.value === "ALL");
    });
    rerenderAll();
}

function handleSearch(value) {
    State.search = (value || "").trim().toLowerCase();
    rerenderAll();
}

// ── Data access ──────────────────────────────────
// Model "General" je z reportu vyloučen napříč všemi pohledy (KPI, grafy, dropdowny, srovnání).
function getAllResultsArray() {
    return Object.values(State.results || {}).filter(r => r.form_name !== "General");
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
    if (f.city !== "ALL" && record.client_branch_name !== f.city) return false;
    if (f.manager !== "ALL" && record.manager_name !== f.manager) return false;
    if (State.globalCountry === "ALL" && f.country !== "ALL" && record.country !== f.country) return false;
    return true;
}

function applyTimePeriod(record) {
    const period = State.filters.timePeriod;
    if (period === "ALL" || !record.date_filled) return period === "ALL";
    const now = Date.now();
    const filledAt = new Date(record.date_filled).getTime();
    if (!Number.isFinite(filledAt)) return false;
    const DAY = 24 * 3600 * 1000;
    if (period === "7D")   return (now - filledAt) <= 7 * DAY;
    if (period === "30D")  return (now - filledAt) <= 30 * DAY;
    if (period === "90D")  return (now - filledAt) <= 90 * DAY;
    if (period === "YEAR") return new Date(record.date_filled).getFullYear() === new Date().getFullYear();
    return true;
}

function getFilteredResults() {
    const needle = State.search;
    return getAllResultsArray()
        .filter(r => applyCountry(r))
        .filter(r => applyTimePeriod(r))
        .filter(r => applyFilters(r))
        .filter(r => matchesSearch(r, needle));
}

// ── Data loading (encrypted blob) ────────────────
async function loadData(password) {
    const blob = await CompetenceCrypto.fetchEncryptedBlob();
    const payload = await CompetenceCrypto.decryptBlob(password, blob);

    const indexed = {};
    (payload.records || []).forEach(r => {
        const key = String(r.result_id);
        indexed[key] = r;
    });
    State.results = indexed;
    State.meta = {
        syncedAt: payload.blobMeta.syncedAt || payload.meta.syncedAt,
        datacruitFetchedAt: payload.blobMeta.datacruitFetchedAt || payload.meta.datacruitFetchedAt,
        recordCount: payload.blobMeta.recordCount ?? payload.meta.recordCount ?? (payload.records || []).length
    };
    State.unlocked = true;

    populateFilterDropdowns();
    updateLastUpdatedBadge();
    revealShell();
    rerenderAll();
}

function updateLastUpdatedBadge() {
    const el = document.getElementById("lastUpdatedText");
    if (!el) return;
    const iso = State.meta && State.meta.syncedAt;
    if (!iso) { el.textContent = "Poslední sync: —"; return; }
    const d = new Date(iso);
    el.textContent = `Poslední sync: ${d.toLocaleString("cs-CZ")} · ${State.meta.recordCount ?? "?"} záznamů`;
}

function revealShell() {
    ["dashboardBtn", "statsBtn", "comparisonBtn", "lockBtn", "globalFilterBar"].forEach(id => {
        const b = document.getElementById(id);
        if (b) b.classList.remove("hidden");
    });
    showDashboardView();
}

function lockDashboard() {
    State.results = {};
    State.meta = null;
    State.unlocked = false;
    State.comparison = { dimension: null, valueA: null, valueB: null };
    showPasswordGate();
    ["dashboardBtn", "statsBtn", "comparisonBtn", "lockBtn", "globalFilterBar"].forEach(id => {
        const b = document.getElementById(id);
        if (b) b.classList.add("hidden");
    });
}

// ── Filter dropdown population ───────────────────
function populateFilterDropdowns() {
    const records = getAllResultsArray().filter(r => applyCountry(r));
    const uniqueSorted = (arr) => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b, "cs"));
    const fill = (id, values) => {
        const el = document.getElementById(id);
        if (!el) return;
        const current = el.value;
        el.innerHTML = `<option value="ALL">Vše</option>` +
            values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
        if (values.includes(current)) el.value = current;
    };
    fill("filterForm", uniqueSorted(records.map(r => r.form_name)));
    fill("filterCatalog", uniqueSorted(records.map(r => r.catalog_position)));
    fill("filterCity", uniqueSorted(records.map(r => r.client_branch_name)));
    fill("filterManager", uniqueSorted(records.map(r => r.manager_name)));
}

function escapeHtml(s) {
    return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// ── View switching ───────────────────────────────
function _setActiveNav(activeId) {
    ["dashboardBtn", "statsBtn", "comparisonBtn"].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.toggle("active", id === activeId);
    });
}

function _toggleViewVisibility(visibleId) {
    ["dashboardView", "statsView", "comparisonView"].forEach(id => {
        const v = document.getElementById(id);
        if (v) v.classList.toggle("hidden", id !== visibleId);
    });
}

function showDashboardView() {
    State.currentView = "dashboard";
    _toggleViewVisibility("dashboardView");
    _setActiveNav("dashboardBtn");
    rerenderAll();
}

function showStatsView() {
    State.currentView = "stats";
    _toggleViewVisibility("statsView");
    _setActiveNav("statsBtn");
    rerenderAll();
}

function showComparisonView() {
    State.currentView = "comparison";
    _toggleViewVisibility("comparisonView");
    _setActiveNav("comparisonBtn");
    rerenderAll();
}

function goHome() {
    if (!State.unlocked) return;
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

// ── Password gate ────────────────────────────────
function showPasswordGate(message) {
    const o = document.getElementById("loginOverlay");
    if (!o) return;
    o.style.display = "flex";
    const err = document.getElementById("loginError");
    if (err) {
        err.style.display = message ? "block" : "none";
        err.textContent = message || "";
    }
    const btn = document.getElementById("loginBtn");
    if (btn) { btn.disabled = false; btn.textContent = "Odemknout"; }
    setTimeout(() => {
        const inp = document.getElementById("loginPassword");
        if (inp) inp.focus();
    }, 50);
}

function hidePasswordGate() {
    const o = document.getElementById("loginOverlay");
    if (o) o.style.display = "none";
}

async function handleUnlock() {
    const inp = document.getElementById("loginPassword");
    const password = inp ? inp.value : "";
    if (!password) {
        showPasswordGate("Zadejte heslo.");
        return;
    }
    const btn = document.getElementById("loginBtn");
    if (btn) { btn.disabled = true; btn.textContent = "Dešifruji…"; }
    try {
        await loadData(password);
        hidePasswordGate();
        if (inp) inp.value = "";
    } catch (err) {
        console.warn("[gate] unlock failed:", err);
        showPasswordGate(err.message || "Nesprávné heslo.");
    }
}

// ── Rerender hub ─────────────────────────────────
function rerenderAll() {
    if (!State.unlocked) return;
    populateFilterDropdowns();
    if (State.currentView === "dashboard" && typeof renderDashboard === "function") renderDashboard();
    if (State.currentView === "stats" && typeof renderStats === "function") renderStats();
    if (State.currentView === "comparison" && typeof renderComparison === "function") renderComparison();
    if (window.lucide) lucide.createIcons();
}

// ── Bootstrap ────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
    loadPersistedTheme();
    State.globalCountry = loadPersistedCountry();
    ["CZ", "SK", "PL", "ALL"].forEach(c => {
        const btn = document.getElementById(`nav-btn-${c}`);
        if (btn) btn.classList.toggle("active", c === State.globalCountry);
    });
    const cg = document.getElementById("filterCountryGroup");
    if (cg) cg.style.display = State.globalCountry === "ALL" ? "flex" : "none";

    // Hide loading overlay and show password gate.
    const loading = document.getElementById("loadingOverlay");
    if (loading) loading.style.display = "none";
    showPasswordGate();
});
