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
const STORAGE_KEY_STANDARD_THEME = "cm.standardTheme";
const EASTER_EGG_THEMES = new Set(["cat"]);

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

// ── Theme toggle + easter egg infrastructure ─────
function normalizeTheme(theme) {
    if (theme === "dark" || theme === "cat") return theme;
    return "";
}
function getCurrentTheme() {
    return normalizeTheme(document.documentElement.getAttribute("data-theme"));
}
function applyTheme(theme) {
    const safe = normalizeTheme(theme);
    if (safe) document.documentElement.setAttribute("data-theme", safe);
    else document.documentElement.removeAttribute("data-theme");
    updateThemeControls(safe);
    syncCatModeEffects(safe);
}
function setTheme(theme) {
    const safe = normalizeTheme(theme);
    try { localStorage.setItem(STORAGE_KEY_THEME, safe); } catch (e) { /* ignore */ }
    if (!EASTER_EGG_THEMES.has(safe)) {
        try { localStorage.setItem(STORAGE_KEY_STANDARD_THEME, safe); } catch (e) { /* ignore */ }
    }
    applyTheme(safe);
}
function toggleTheme() {
    const current = getCurrentTheme();
    setTheme(current === "dark" ? "" : "dark");
}
function loadPersistedTheme() {
    try {
        const v = normalizeTheme(localStorage.getItem(STORAGE_KEY_THEME));
        applyTheme(v);
    } catch (e) { /* ignore */ }
}
function updateThemeControls(theme) {
    document.querySelectorAll(".mode-trigger-btn[data-mode]").forEach(btn => {
        btn.setAttribute("aria-pressed", btn.getAttribute("data-mode") === theme ? "true" : "false");
    });
}
function prefersReducedMotion() {
    return typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function toggleEasterEggMode(mode, event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    if (!EASTER_EGG_THEMES.has(mode)) return;
    const current = getCurrentTheme();
    const fallback = normalizeTheme(localStorage.getItem(STORAGE_KEY_STANDARD_THEME));
    const turningOn = current !== mode;
    if (turningOn && mode === "cat") playMeowSound();
    setTheme(turningOn ? mode : fallback);
    if (typeof showToast === "function") {
        const msg = turningOn ? "Mňau! Cat Mode aktivní 🐱" : "Kočka šla ven *ignoruje tě*";
        showToast(msg, "info");
    }
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
    if (getCurrentTheme() === "cat") {
        injectCatCornerTails();
        injectSearchWhiskers();
    }
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

// ── CAT MODE ──────────────────────────────────────

const CAT_PAW_GLYPHS = ['🐾', '🐾', '🐾', '🐟', '🐾', '🪺'];

const CAT_PHRASES = [
    'Mňau!', 'Prrr...', 'Krmení?', 'Drbni mě', 'Mrau', 'Hsss!',
    'Blink. Blink.', '*tep tep tep*', '*ignoruje tě*', 'Meow.',
    'Where food?', 'Where mouse?', 'Pet me, human', '*slow blink*',
    'Knead knead', 'Zoomies time', 'Where laser?', 'Brrrp!'
];

const CAT_BREEDS = [
    { name: 'tabby', body: '#E89A4F', belly: '#FFE6CC', muzzle: '#FFE6CC',
      earOuter: '#A85B1F', earInner: '#F2B679', nose: '#3A1F0F', eye: '#7CC25C',
      whiskers: '#FFFFFF', stripes: '#A85B1F',
      shape: { earShape: 'prick', tailShape: 'long', pattern: 'stripes' } },
    { name: 'black', body: '#1F1B1A', belly: '#2A2422', muzzle: '#2A2422',
      earOuter: '#0E0C0B', earInner: '#5A2C2C', nose: '#0A0808', eye: '#F5C44C',
      whiskers: '#FFFFFF', stripes: '#0E0C0B',
      shape: { earShape: 'prick', tailShape: 'long', pattern: 'plain' } },
    { name: 'persian', body: '#F2E5D2', belly: '#FFF7EA', muzzle: '#FFF7EA',
      earOuter: '#C9A77E', earInner: '#E8CCA9', nose: '#9C5A5A', eye: '#67A0CC',
      whiskers: '#FFFFFF', stripes: '#C9A77E',
      shape: { earShape: 'small', tailShape: 'plumed', pattern: 'fluff' } },
    { name: 'siamese', body: '#EDE3CE', belly: '#FFF8E4', muzzle: '#5F3A2A',
      earOuter: '#5F3A2A', earInner: '#8F5C42', nose: '#3A1F0F', eye: '#3CA0E0',
      whiskers: '#FFFFFF', stripes: '#5F3A2A',
      shape: { earShape: 'prick', tailShape: 'long', pattern: 'points' } },
    { name: 'british', body: '#8A98A4', belly: '#B8C2CC', muzzle: '#B8C2CC',
      earOuter: '#5A6770', earInner: '#A1ACB6', nose: '#3A3A3A', eye: '#E5A53A',
      whiskers: '#FFFFFF', stripes: '#5A6770',
      shape: { earShape: 'small', tailShape: 'thick', pattern: 'plain' } },
    { name: 'mainecoon', body: '#7A4F30', belly: '#D9B98E', muzzle: '#D9B98E',
      earOuter: '#3F2410', earInner: '#A06B40', nose: '#1F1109', eye: '#6BAA3F',
      whiskers: '#FFFFFF', stripes: '#3F2410',
      shape: { earShape: 'tufted', tailShape: 'bushy', pattern: 'stripes' } },
    { name: 'sphynx', body: '#E0BFAD', belly: '#F4D5C2', muzzle: '#F4D5C2',
      earOuter: '#B89180', earInner: '#E8B6A0', nose: '#9C5A4F', eye: '#A0E060',
      whiskers: '#E8B6A0', stripes: '#B89180',
      shape: { earShape: 'huge', tailShape: 'thin', pattern: 'wrinkles' } },
    { name: 'calico', body: '#F2E5D2', belly: '#FFFFFF', muzzle: '#FFFFFF',
      earOuter: '#3A2210', earInner: '#D9A86A', nose: '#3A1F0F', eye: '#4F8E3A',
      whiskers: '#FFFFFF', stripes: '#3A2210',
      shape: { earShape: 'prick', tailShape: 'long', pattern: 'patches' } }
];

const CAT_SCENARIOS = ['sleep', 'grooming', 'knockOff', 'mouseHunt'];

let _catPawInterval = null;
let _catActivityTimeout = null;
let _catActivityTimers = [];
let _catSidewalkInterval = null;
let _lastCatScenario = null;

function pickCatBreed() { return CAT_BREEDS[Math.floor(Math.random() * CAT_BREEDS.length)]; }
function pickCatPhrase() { return CAT_PHRASES[Math.floor(Math.random() * CAT_PHRASES.length)]; }

function catPatternOverlay(breed) {
    const cx = 34;
    switch (breed.shape.pattern) {
        case 'stripes':
            return [
                '<path d="M22 36 Q26 32 30 36" stroke="' + breed.stripes + '" stroke-width="1.6" fill="none" opacity="0.7"/>',
                '<path d="M30 35 Q34 31 38 35" stroke="' + breed.stripes + '" stroke-width="1.6" fill="none" opacity="0.7"/>',
                '<path d="M38 36 Q42 32 46 36" stroke="' + breed.stripes + '" stroke-width="1.6" fill="none" opacity="0.7"/>',
                '<path d="M48 41 Q52 38 56 41" stroke="' + breed.stripes + '" stroke-width="1.4" fill="none" opacity="0.55"/>'
            ].join('');
        case 'points':
            return [
                '<ellipse cx="' + (cx - 14) + '" cy="48" rx="6" ry="3" fill="' + breed.stripes + '" opacity="0.55"/>',
                '<ellipse cx="' + (cx + 14) + '" cy="48" rx="6" ry="3" fill="' + breed.stripes + '" opacity="0.55"/>'
            ].join('');
        case 'patches':
            return [
                '<ellipse cx="26" cy="40" rx="8" ry="5" fill="' + breed.stripes + '" opacity="0.85"/>',
                '<ellipse cx="46" cy="42" rx="6" ry="4" fill="#E89A4F" opacity="0.85"/>',
                '<ellipse cx="38" cy="44" rx="3" ry="2" fill="#3A2210" opacity="0.6"/>'
            ].join('');
        case 'fluff':
            return '<path d="M14 42 Q12 40 14 38 M12 44 Q10 42 12 40 M58 42 Q60 40 58 38" stroke="' + breed.stripes + '" stroke-width="1.2" fill="none" opacity="0.4"/>';
        case 'wrinkles':
            return [
                '<path d="M24 40 Q34 42 44 40" stroke="' + breed.stripes + '" stroke-width="0.6" fill="none" opacity="0.5"/>',
                '<path d="M24 44 Q34 46 44 44" stroke="' + breed.stripes + '" stroke-width="0.6" fill="none" opacity="0.5"/>'
            ].join('');
        default: return '';
    }
}

function catEarsSVG(breed) {
    const o = breed.earOuter, i = breed.earInner;
    switch (breed.shape.earShape) {
        case 'tufted':
            return '<path d="M58 6 L54 18 L62 17 Z" fill="' + o + '"/>' +
                '<path d="M58 9 L56 17 L60 16 Z" fill="' + i + '" opacity="0.7"/>' +
                '<path d="M70 6 L66 17 L74 18 Z" fill="' + o + '"/>' +
                '<path d="M70 9 L68 16 L72 17 Z" fill="' + i + '" opacity="0.7"/>' +
                '<path d="M58 4 L57 8 M70 4 L71 8" stroke="' + o + '" stroke-width="1" fill="none"/>';
        case 'huge':
            return '<path d="M56 0 L52 19 L62 18 Z" fill="' + o + '"/>' +
                '<path d="M56 4 L54 18 L60 17 Z" fill="' + i + '" opacity="0.7"/>' +
                '<path d="M72 0 L66 18 L76 19 Z" fill="' + o + '"/>' +
                '<path d="M72 4 L68 17 L74 18 Z" fill="' + i + '" opacity="0.7"/>';
        case 'small':
            return '<path d="M59 12 L57 19 L62 18 Z" fill="' + o + '"/>' +
                '<path d="M59 14 L58 18 L61 17 Z" fill="' + i + '" opacity="0.7"/>' +
                '<path d="M69 12 L66 18 L71 19 Z" fill="' + o + '"/>' +
                '<path d="M69 14 L67 17 L70 18 Z" fill="' + i + '" opacity="0.7"/>';
        default:
            return '<path d="M58 4 L54 18 L62 17 Z" fill="' + o + '"/>' +
                '<path d="M58 8 L56 17 L60 16 Z" fill="' + i + '" opacity="0.7"/>' +
                '<path d="M70 4 L66 17 L74 18 Z" fill="' + o + '"/>' +
                '<path d="M70 8 L68 16 L72 17 Z" fill="' + i + '" opacity="0.7"/>';
    }
}

function catTailSVG(breed) {
    const c = breed.body, lighter = breed.belly;
    switch (breed.shape.tailShape) {
        case 'plumed':
            return '<path d="M14 40 Q4 32 8 18 Q10 12 4 8" stroke="' + c + '" stroke-width="6" fill="none" stroke-linecap="round" class="cat-tail"/>' +
                '<circle cx="4" cy="8" r="5" fill="' + c + '"/>' +
                '<circle cx="8" cy="20" r="4" fill="' + c + '" opacity="0.8"/>';
        case 'bushy':
            return '<path d="M14 40 Q4 30 8 18 Q12 10 6 6" stroke="' + c + '" stroke-width="9" fill="none" stroke-linecap="round" class="cat-tail"/>' +
                '<path d="M14 40 Q4 30 8 18 Q12 10 6 6" stroke="' + lighter + '" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.5"/>';
        case 'thick':
            return '<path d="M14 40 Q6 34 10 22" stroke="' + c + '" stroke-width="7" fill="none" stroke-linecap="round" class="cat-tail"/>';
        case 'thin':
            return '<path d="M14 40 Q4 28 12 14" stroke="' + c + '" stroke-width="3" fill="none" stroke-linecap="round" class="cat-tail"/>';
        default:
            return '<path d="M14 40 Q4 30 8 18 Q10 12 6 6" stroke="' + c + '" stroke-width="5" fill="none" stroke-linecap="round" class="cat-tail"/>';
    }
}

function createCatSVG(breed, opts) {
    opts = opts || {};
    const facing = opts.facing === 'left' ? -1 : 1;
    const tongue = opts.tongue ? '<ellipse cx="78" cy="30" rx="2" ry="1.2" fill="#FF7A9C"/>' : '';
    const eyesClosed = opts.sleep || opts.blink;
    const eye1 = eyesClosed
        ? '<path d="M62.4 24.4 Q64 23.6 65.4 24.4" stroke="#1A1A1A" stroke-width="1" fill="none" stroke-linecap="round"/>'
        : '<ellipse cx="64" cy="24" rx="2.4" ry="2.2" fill="white"/>' +
          '<ellipse cx="64" cy="24" rx="1.9" ry="1.9" fill="' + breed.eye + '"/>' +
          '<rect x="63.7" y="22.4" width="0.6" height="3.2" fill="#1A1A1A"/>';
    const eye2 = eyesClosed
        ? '<path d="M67.6 24.4 Q69 23.6 70.6 24.4" stroke="#1A1A1A" stroke-width="1" fill="none" stroke-linecap="round"/>'
        : '<ellipse cx="69" cy="24" rx="2.4" ry="2.2" fill="white"/>' +
          '<ellipse cx="69" cy="24" rx="1.9" ry="1.9" fill="' + breed.eye + '"/>' +
          '<rect x="68.7" y="22.4" width="0.6" height="3.2" fill="#1A1A1A"/>';
    const legY = 48, legBottom = 60;
    const legs = [
        '<rect x="18" y="' + legY + '" width="3.5" height="' + (legBottom - legY) + '" rx="1.4" fill="' + breed.body + '" class="cat-leg cat-leg-bl"/>',
        '<rect x="44" y="' + legY + '" width="3.5" height="' + (legBottom - legY) + '" rx="1.4" fill="' + breed.body + '" class="cat-leg cat-leg-fl"/>',
        '<rect x="22" y="' + legY + '" width="3.5" height="' + (legBottom - legY) + '" rx="1.4" fill="' + breed.body + '" opacity="0.85" class="cat-leg cat-leg-br"/>',
        '<rect x="48" y="' + legY + '" width="3.5" height="' + (legBottom - legY) + '" rx="1.4" fill="' + breed.body + '" opacity="0.85" class="cat-leg cat-leg-fr"/>'
    ].join('');
    const body = '<ellipse cx="34" cy="42" rx="22" ry="10" fill="' + breed.body + '"/>' +
        '<path d="M14 38 Q22 33 30 38" stroke="' + breed.body + '" stroke-width="3" fill="' + breed.body + '"/>' +
        '<ellipse cx="34" cy="46" rx="18" ry="6" fill="' + breed.belly + '" opacity="0.85"/>';
    const head = '<circle cx="64" cy="28" r="11" fill="' + breed.body + '"/>' +
        '<ellipse cx="66" cy="32" rx="6" ry="4" fill="' + breed.muzzle + '" opacity="0.92"/>';
    const whiskers = '<line x1="73" y1="30" x2="80" y2="28" stroke="' + breed.whiskers + '" stroke-width="0.5" opacity="0.85"/>' +
        '<line x1="73" y1="32" x2="80" y2="32" stroke="' + breed.whiskers + '" stroke-width="0.5" opacity="0.85"/>' +
        '<line x1="73" y1="34" x2="80" y2="36" stroke="' + breed.whiskers + '" stroke-width="0.5" opacity="0.85"/>' +
        '<line x1="59" y1="30" x2="52" y2="28" stroke="' + breed.whiskers + '" stroke-width="0.5" opacity="0.7"/>' +
        '<line x1="59" y1="32" x2="52" y2="32" stroke="' + breed.whiskers + '" stroke-width="0.5" opacity="0.7"/>' +
        '<line x1="59" y1="34" x2="52" y2="36" stroke="' + breed.whiskers + '" stroke-width="0.5" opacity="0.7"/>';
    const noseAndMouth = '<path d="M70 30.4 L72 30.4 L71 31.6 Z" fill="' + breed.nose + '"/>' +
        '<path d="M71 31.6 Q69.6 33 68 32 M71 31.6 Q72.4 33 74 32" stroke="#3A1F0F" stroke-width="0.6" fill="none"/>' + tongue;
    const inner = body + legs + catTailSVG(breed) + catPatternOverlay(breed) + head + catEarsSVG(breed) + whiskers + eye1 + eye2 + noseAndMouth;
    const transform = facing === -1 ? ' transform="scale(-1,1) translate(-80,0)"' : '';
    return '<svg width="80" height="64" viewBox="0 0 80 64" xmlns="http://www.w3.org/2000/svg"' + transform + '>' + inner + '</svg>';
}

function createCatFrontSVG(breed, opts) {
    opts = opts || {};
    const blink = opts.blink || opts.sleep;
    const eye = function(cx) {
        if (blink) return '<path d="M' + (cx - 1.6) + ' 26 Q' + cx + ' 25 ' + (cx + 1.6) + ' 26" stroke="#1A1A1A" stroke-width="0.9" fill="none" stroke-linecap="round"/>';
        return '<ellipse cx="' + cx + '" cy="26" rx="2.6" ry="2.4" fill="white"/>' +
            '<ellipse cx="' + cx + '" cy="26" rx="2.0" ry="2.0" fill="' + breed.eye + '"/>' +
            '<rect x="' + (cx - 0.3) + '" y="24.4" width="0.6" height="3.2" fill="#1A1A1A"/>';
    };
    const pawL = '<rect x="26" y="48" width="6" height="10" rx="2" fill="' + breed.body + '"/>';
    const pawR = '<rect x="48" y="48" width="6" height="10" rx="2" fill="' + breed.body + '"/>';
    const extPaw = opts.extendedPaw
        ? '<rect x="58" y="38" width="14" height="5" rx="2" fill="' + breed.body + '" transform="rotate(-12 65 40)"/>' +
          '<circle cx="72" cy="38" r="2.5" fill="' + breed.body + '"/>'
        : '';
    return '<svg width="80" height="64" viewBox="0 0 80 64" xmlns="http://www.w3.org/2000/svg">' +
        '<ellipse cx="40" cy="46" rx="18" ry="14" fill="' + breed.body + '"/>' +
        '<ellipse cx="40" cy="50" rx="13" ry="8" fill="' + breed.belly + '" opacity="0.8"/>' +
        pawL + pawR + extPaw +
        '<circle cx="40" cy="26" r="14" fill="' + breed.body + '"/>' +
        '<g transform="translate(-24 0)">' + catEarsSVG(breed) + '</g>' +
        '<ellipse cx="40" cy="32" rx="7" ry="5" fill="' + breed.muzzle + '" opacity="0.9"/>' +
        eye(35) + eye(45) +
        '<path d="M39 31 L41 31 L40 32.4 Z" fill="' + breed.nose + '"/>' +
        '<path d="M40 32.4 Q38.6 34 37 33 M40 32.4 Q41.4 34 43 33" stroke="#3A1F0F" stroke-width="0.6" fill="none"/>' +
        '<line x1="33" y1="32" x2="26" y2="30" stroke="' + breed.whiskers + '" stroke-width="0.5" opacity="0.85"/>' +
        '<line x1="33" y1="34" x2="26" y2="34" stroke="' + breed.whiskers + '" stroke-width="0.5" opacity="0.85"/>' +
        '<line x1="33" y1="36" x2="26" y2="38" stroke="' + breed.whiskers + '" stroke-width="0.5" opacity="0.85"/>' +
        '<line x1="47" y1="32" x2="54" y2="30" stroke="' + breed.whiskers + '" stroke-width="0.5" opacity="0.85"/>' +
        '<line x1="47" y1="34" x2="54" y2="34" stroke="' + breed.whiskers + '" stroke-width="0.5" opacity="0.85"/>' +
        '<line x1="47" y1="36" x2="54" y2="38" stroke="' + breed.whiskers + '" stroke-width="0.5" opacity="0.85"/>' +
        '</svg>';
}

function createCatCurledSVG(breed) {
    return '<svg width="96" height="64" viewBox="0 0 96 64" xmlns="http://www.w3.org/2000/svg">' +
        '<g class="cat-breath">' +
        '<ellipse cx="50" cy="44" rx="32" ry="16" fill="' + breed.body + '"/>' +
        '<ellipse cx="50" cy="48" rx="26" ry="10" fill="' + breed.belly + '" opacity="0.7"/>' +
        '<path d="M82 46 Q92 40 86 28 Q78 22 68 28" stroke="' + breed.body + '" stroke-width="6" fill="none" stroke-linecap="round"/>' +
        '<circle cx="22" cy="38" r="11" fill="' + breed.body + '"/>' +
        '<path d="M16 30 L14 36 L20 36 Z" fill="' + breed.earOuter + '"/>' +
        '<path d="M28 30 L26 36 L32 36 Z" fill="' + breed.earOuter + '"/>' +
        '<path d="M19 38 Q21 37 23 38" stroke="#1A1A1A" stroke-width="0.9" fill="none" stroke-linecap="round"/>' +
        '<path d="M25 38 Q27 37 29 38" stroke="#1A1A1A" stroke-width="0.9" fill="none" stroke-linecap="round"/>' +
        '<path d="M22 41 L23 41" stroke="' + breed.nose + '" stroke-width="0.9" fill="none" stroke-linecap="round"/>' +
        '</g></svg>';
}

function createCatStretchSVG(breed) {
    return '<svg width="96" height="64" viewBox="0 0 96 64" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M16 50 Q20 36 40 32 Q60 28 76 36 Q86 40 88 50" fill="' + breed.body + '" stroke="' + breed.body + '" stroke-width="2"/>' +
        '<rect x="20" y="48" width="4" height="12" rx="1.4" fill="' + breed.body + '"/>' +
        '<rect x="74" y="48" width="4" height="12" rx="1.4" fill="' + breed.body + '"/>' +
        '<circle cx="84" cy="34" r="9" fill="' + breed.body + '"/>' +
        '<path d="M80 28 L78 33 L82 33 Z" fill="' + breed.earOuter + '"/>' +
        '<path d="M88 28 L86 33 L90 33 Z" fill="' + breed.earOuter + '"/>' +
        '<ellipse cx="83" cy="34" rx="2" ry="1.6" fill="white"/>' +
        '<ellipse cx="83" cy="34" rx="1.4" ry="1.4" fill="' + breed.eye + '"/>' +
        '<rect x="82.7" y="33" width="0.6" height="2.4" fill="#1A1A1A"/>' +
        '<path d="M14 50 Q4 44 8 32" stroke="' + breed.body + '" stroke-width="5" fill="none" stroke-linecap="round"/>' +
        '</svg>';
}

function createCatSittingSVG(breed, opts) {
    opts = opts || {};
    const pose = opts.pose || 'idle';
    let pawArt = '<rect x="36" y="42" width="6" height="14" rx="2" fill="' + breed.body + '"/>' +
        '<rect x="46" y="42" width="6" height="14" rx="2" fill="' + breed.body + '"/>';
    let mouth = '<path d="M44 31 Q42.6 33 41 32 M44 31 Q45.4 33 47 32" stroke="#3A1F0F" stroke-width="0.6" fill="none"/>';
    let extras = '';
    if (pose === 'lickPaw') {
        pawArt = '<rect x="46" y="42" width="6" height="14" rx="2" fill="' + breed.body + '"/>' +
            '<rect x="34" y="22" width="5" height="12" rx="2" fill="' + breed.body + '" transform="rotate(-30 36 28)"/>';
        extras = '<ellipse cx="38" cy="30" rx="2" ry="1.2" fill="#FF7A9C"/>';
    } else if (pose === 'scratchEar') {
        pawArt = '<rect x="36" y="42" width="6" height="14" rx="2" fill="' + breed.body + '"/>' +
            '<rect x="48" y="14" width="5" height="14" rx="2" fill="' + breed.body + '" transform="rotate(20 50 22)"/>';
    } else if (pose === 'yawn') {
        mouth = '<ellipse cx="44" cy="33" rx="3" ry="3.4" fill="#3A1F0F"/>' +
            '<ellipse cx="44" cy="34" rx="2" ry="1.6" fill="#FF7A9C"/>';
    }
    return '<svg width="80" height="80" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">' +
        '<ellipse cx="44" cy="58" rx="22" ry="16" fill="' + breed.body + '"/>' +
        '<ellipse cx="44" cy="62" rx="14" ry="10" fill="' + breed.belly + '" opacity="0.7"/>' +
        pawArt +
        '<path d="M22 60 Q14 50 18 38 Q20 32 14 28" stroke="' + breed.body + '" stroke-width="5" fill="none" stroke-linecap="round"/>' +
        '<circle cx="44" cy="26" r="13" fill="' + breed.body + '"/>' +
        '<g transform="translate(-20 -2)">' + catEarsSVG(breed) + '</g>' +
        '<ellipse cx="44" cy="32" rx="6" ry="4" fill="' + breed.muzzle + '" opacity="0.9"/>' +
        '<ellipse cx="40" cy="26" rx="2.4" ry="2.2" fill="white"/>' +
        '<ellipse cx="40" cy="26" rx="1.9" ry="1.9" fill="' + breed.eye + '"/>' +
        '<rect x="39.7" y="24.4" width="0.6" height="3.2" fill="#1A1A1A"/>' +
        '<ellipse cx="48" cy="26" rx="2.4" ry="2.2" fill="white"/>' +
        '<ellipse cx="48" cy="26" rx="1.9" ry="1.9" fill="' + breed.eye + '"/>' +
        '<rect x="47.7" y="24.4" width="0.6" height="3.2" fill="#1A1A1A"/>' +
        '<path d="M43 31 L45 31 L44 32 Z" fill="' + breed.nose + '"/>' + mouth +
        '<line x1="36" y1="32" x2="29" y2="30" stroke="' + breed.whiskers + '" stroke-width="0.5"/>' +
        '<line x1="36" y1="34" x2="29" y2="34" stroke="' + breed.whiskers + '" stroke-width="0.5"/>' +
        '<line x1="52" y1="32" x2="59" y2="30" stroke="' + breed.whiskers + '" stroke-width="0.5"/>' +
        '<line x1="52" y1="34" x2="59" y2="34" stroke="' + breed.whiskers + '" stroke-width="0.5"/>' +
        extras +
        '</svg>';
}

function spawnCatPaw() {
    const field = document.getElementById('catModeField');
    if (!field || getCurrentTheme() !== 'cat') return;
    const paw = document.createElement('span');
    paw.className = 'cat-paw';
    paw.textContent = CAT_PAW_GLYPHS[Math.floor(Math.random() * CAT_PAW_GLYPHS.length)];
    paw.style.left = (Math.random() * 100) + '%';
    paw.style.fontSize = (16 + Math.random() * 18) + 'px';
    paw.style.setProperty('--paw-opacity', (0.40 + Math.random() * 0.40).toFixed(2));
    paw.style.setProperty('--cat-drift', (Math.random() * 80 - 40) + 'px');
    paw.style.setProperty('--cat-spin', (Math.random() * 360 - 180) + 'deg');
    paw.style.animationDuration = (10 + Math.random() * 5) + 's';
    field.appendChild(paw);
    window.setTimeout(() => paw.remove(), 16000);
}

function buildCornerTailNode(breed, delay) {
    const wrap = document.createElement('span');
    wrap.className = 'cat-corner-tail';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.setProperty('--tail-delay', delay + 's');
    wrap.innerHTML = '<svg viewBox="0 0 22 40" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M11 38 Q4 28 10 16 Q14 8 8 2" stroke="' + breed.body + '" stroke-width="5" fill="none" stroke-linecap="round"/>' +
        '<path d="M11 38 Q4 28 10 16 Q14 8 8 2" stroke="' + breed.belly + '" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.55"/>' +
        '</svg>';
    return wrap;
}

function injectCatCornerTails() {
    document.querySelectorAll('.kpi-card').forEach((card, idx) => {
        if (card.querySelector('.cat-corner-tail')) return;
        const breed = pickCatBreed();
        const cs = window.getComputedStyle(card);
        if (cs.position === 'static') card.style.position = 'relative';
        card.appendChild(buildCornerTailNode(breed, (idx * 0.18).toFixed(2)));
    });
}

function removeCatCornerTails() {
    document.querySelectorAll('.cat-corner-tail').forEach(el => el.remove());
}

function buildWhiskerNode(side) {
    const wrap = document.createElement('span');
    wrap.className = 'cat-search-whiskers cat-search-whiskers--' + side;
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = '<svg width="32" height="22" viewBox="0 0 32 22" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M0 6 Q16 8 30 5" stroke="#9C5A8A" stroke-width="1" fill="none" stroke-linecap="round"/>' +
        '<path d="M0 11 Q16 12 30 11" stroke="#9C5A8A" stroke-width="1" fill="none" stroke-linecap="round"/>' +
        '<path d="M0 16 Q16 14 30 17" stroke="#9C5A8A" stroke-width="1" fill="none" stroke-linecap="round"/>' +
        '</svg>';
    return wrap;
}

function injectSearchWhiskers() {
    const host = document.querySelector('.search-wrap')
        || (document.getElementById('globalSearch') && document.getElementById('globalSearch').parentElement);
    if (!host || host.querySelector('.cat-search-whiskers')) return;
    const cs = window.getComputedStyle(host);
    if (cs.position === 'static') host.style.position = 'relative';
    host.appendChild(buildWhiskerNode('l'));
    host.appendChild(buildWhiskerNode('r'));
}

function removeSearchWhiskers() {
    document.querySelectorAll('.cat-search-whiskers').forEach(el => el.remove());
}

function ensureCatSidewalk() {
    if (window.innerWidth < 1280) return;
    ['left', 'right'].forEach((side, idx) => {
        const id = 'catSidewalk-' + side;
        let el = document.getElementById(id);
        const breed = pickCatBreed();
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.className = 'cat-sidewalk cat-sidewalk--' + side;
            el.setAttribute('aria-hidden', 'true');
            el.style.setProperty('--pace-duration', (16 + idx * 4) + 's');
            el.style.setProperty('--pace-delay', (idx * 3) + 's');
            document.body.appendChild(el);
        }
        el.innerHTML = createCatSVG(breed, { facing: side === 'left' ? 'right' : 'left' });
    });
}

function rotateCatSidewalkBreed() {
    ['left', 'right'].forEach(side => {
        const el = document.getElementById('catSidewalk-' + side);
        if (!el) return;
        const breed = pickCatBreed();
        el.innerHTML = createCatSVG(breed, { facing: side === 'left' ? 'right' : 'left' });
    });
}

function removeCatSidewalk() {
    ['left', 'right'].forEach(side => {
        const el = document.getElementById('catSidewalk-' + side);
        if (el) el.remove();
    });
}

function spawnCatBubble(parentEl, text, side) {
    if (!parentEl) return;
    const bubble = document.createElement('span');
    bubble.className = 'cat-bubble' + (side === 'left' ? ' cat-bubble-left' : '');
    bubble.textContent = text;
    parentEl.appendChild(bubble);
    window.setTimeout(() => bubble.remove(), 1700);
}

function pickCatScenario() {
    let scenario;
    let attempts = 0;
    do {
        scenario = CAT_SCENARIOS[Math.floor(Math.random() * CAT_SCENARIOS.length)];
        attempts++;
    } while (scenario === _lastCatScenario && attempts < 4);
    if (prefersReducedMotion() && scenario === 'mouseHunt') scenario = 'grooming';
    _lastCatScenario = scenario;
    return scenario;
}

function scheduleNextCatActivity(initial) {
    if (_catActivityTimeout) { clearTimeout(_catActivityTimeout); _catActivityTimeout = null; }
    const delay = initial ? (8000 + Math.random() * 6000) : (12000 + Math.random() * 10000);
    _catActivityTimeout = window.setTimeout(() => {
        if (getCurrentTheme() !== 'cat') return;
        const scenario = pickCatScenario();
        try {
            if (scenario === 'sleep') runCatSleep();
            else if (scenario === 'grooming') runCatGrooming();
            else if (scenario === 'knockOff') runCatKnockOff();
            else if (scenario === 'mouseHunt') runCatMouseHunt();
        } catch (e) { /* swallow */ }
        scheduleNextCatActivity(false);
    }, delay);
}

function catTimer(fn, delay) {
    const id = window.setTimeout(() => {
        _catActivityTimers = _catActivityTimers.filter(t => t !== id);
        if (getCurrentTheme() !== 'cat') return;
        try { fn(); } catch (e) { /* swallow */ }
    }, delay);
    _catActivityTimers.push(id);
    return id;
}

function runCatSleep() {
    const breed = pickCatBreed();
    const wrap = document.createElement('div');
    wrap.className = 'cat-sleeper';
    wrap.setAttribute('aria-hidden', 'true');
    const fromLeft = Math.random() < 0.5;
    const corner = Math.random() < 0.7;
    const top = corner ? (window.innerHeight - 130) : (window.innerHeight * 0.4);
    wrap.style.top = top + 'px';
    wrap.style.left = (fromLeft ? -120 : window.innerWidth + 120) + 'px';
    wrap.style.transition = 'left 1.1s ease-out';
    wrap.innerHTML = createCatSVG(breed, { facing: fromLeft ? 'right' : 'left' });
    document.body.appendChild(wrap);
    const restX = corner
        ? (fromLeft ? Math.max(60, window.innerWidth * 0.12) : window.innerWidth - 220)
        : (window.innerWidth * (0.3 + Math.random() * 0.4));
    requestAnimationFrame(() => { wrap.style.left = restX + 'px'; });
    catTimer(() => { wrap.innerHTML = createCatCurledSVG(breed); }, 1200);
    catTimer(() => { spawnCatBubble(wrap, Math.random() < 0.5 ? 'Prrr...' : 'Blink. Blink.'); }, 4500);
    catTimer(() => { spawnCatBubble(wrap, '*purr*'); }, 8000);
    catTimer(() => { wrap.innerHTML = createCatStretchSVG(breed); }, 9500);
    catTimer(() => {
        wrap.innerHTML = createCatSVG(breed, { facing: fromLeft ? 'left' : 'right' });
        wrap.style.transition = 'left 1.4s ease-in';
        wrap.style.left = (fromLeft ? -200 : window.innerWidth + 200) + 'px';
    }, 10800);
    catTimer(() => { if (wrap.parentNode) wrap.remove(); }, 12500);
}

function runCatGrooming() {
    const breed = pickCatBreed();
    const wrap = document.createElement('div');
    wrap.className = 'cat-groomer';
    wrap.setAttribute('aria-hidden', 'true');
    const fromLeft = Math.random() < 0.5;
    wrap.style.bottom = (40 + Math.random() * 60) + 'px';
    wrap.style.left = (fromLeft ? -120 : window.innerWidth + 120) + 'px';
    wrap.style.transition = 'left 1s ease-out';
    wrap.innerHTML = createCatSVG(breed, { facing: fromLeft ? 'right' : 'left' });
    document.body.appendChild(wrap);
    const restX = fromLeft
        ? (window.innerWidth * 0.12 + Math.random() * 80)
        : (window.innerWidth * 0.78 + Math.random() * 80);
    requestAnimationFrame(() => { wrap.style.left = restX + 'px'; });
    catTimer(() => { wrap.innerHTML = createCatSittingSVG(breed, { pose: 'idle' }); }, 1000);
    for (let i = 0; i < 4; i++) {
        catTimer(() => { wrap.innerHTML = createCatSittingSVG(breed, { pose: 'lickPaw' }); }, 1400 + i * 700);
        catTimer(() => { wrap.innerHTML = createCatSittingSVG(breed, { pose: 'idle' }); }, 1700 + i * 700);
    }
    catTimer(() => { wrap.innerHTML = createCatSittingSVG(breed, { pose: 'scratchEar' }); }, 4500);
    catTimer(() => { wrap.innerHTML = createCatSittingSVG(breed, { pose: 'idle' }); }, 5300);
    catTimer(() => {
        wrap.innerHTML = createCatSittingSVG(breed, { pose: 'yawn' });
        if (Math.random() < 0.6) spawnCatBubble(wrap, 'Mrau');
    }, 6000);
    catTimer(() => { wrap.innerHTML = createCatStretchSVG(breed); }, 7000);
    catTimer(() => { spawnCatBubble(wrap, '*stretch*'); }, 7400);
    catTimer(() => {
        wrap.innerHTML = createCatSVG(breed, { facing: fromLeft ? 'left' : 'right' });
        wrap.style.transition = 'left 1.2s ease-in';
        wrap.style.left = (fromLeft ? -200 : window.innerWidth + 200) + 'px';
    }, 8500);
    catTimer(() => { if (wrap.parentNode) wrap.remove(); }, 10000);
}

function runCatKnockOff() {
    const candidates = Array.from(document.querySelectorAll('.kpi-card, .btn-upload'))
        .filter(el => !el.classList.contains('mode-trigger-btn'))
        .filter(el => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.top > 60 && r.bottom < window.innerHeight - 60;
        });
    if (!candidates.length) return runCatGrooming();
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    const rect = target.getBoundingClientRect();
    const breed = pickCatBreed();
    const wrap = document.createElement('div');
    wrap.className = 'cat-knocker';
    wrap.setAttribute('aria-hidden', 'true');
    const top = rect.top + rect.height / 2 - 30;
    wrap.style.top = top + 'px';
    wrap.style.left = (rect.left - 200) + 'px';
    wrap.style.transition = 'left 1.1s ease-out';
    wrap.innerHTML = createCatSVG(breed, { facing: 'right' });
    document.body.appendChild(wrap);
    requestAnimationFrame(() => { wrap.style.left = (rect.left - 70) + 'px'; });
    catTimer(() => {
        wrap.innerHTML = createCatFrontSVG(breed, { extendedPaw: true });
        target.classList.add('cat-shake');
        if (Math.random() < 0.5) spawnCatBubble(wrap, Math.random() < 0.5 ? 'Hsss!' : '*tep*');
    }, 1200);
    catTimer(() => { target.classList.remove('cat-shake'); }, 2000);
    catTimer(() => { wrap.innerHTML = createCatFrontSVG(breed, { extendedPaw: false, blink: false }); }, 2200);
    catTimer(() => {
        wrap.innerHTML = createCatSVG(breed, { facing: 'left' });
        wrap.style.transition = 'left 1.3s ease-in';
        wrap.style.left = (rect.left - 320) + 'px';
    }, 3300);
    catTimer(() => { if (wrap.parentNode) wrap.remove(); }, 4800);
}

function runCatMouseHunt() {
    if (prefersReducedMotion()) return runCatGrooming();
    const breed = pickCatBreed();
    const top = Math.max(120, window.innerHeight * (0.55 + Math.random() * 0.25));
    const mouse = document.createElement('div');
    mouse.className = 'cat-mouse';
    mouse.setAttribute('aria-hidden', 'true');
    mouse.style.top = top + 'px';
    mouse.style.left = '-60px';
    mouse.style.setProperty('--mouse-duration', '5s');
    mouse.innerHTML = '<svg width="36" height="22" viewBox="0 0 36 22" xmlns="http://www.w3.org/2000/svg">' +
        '<ellipse cx="18" cy="14" rx="11" ry="6" fill="#A0A4A8"/>' +
        '<circle cx="27" cy="11" r="4" fill="#A0A4A8"/>' +
        '<circle cx="24" cy="9" r="2" fill="#FFC2D1"/>' +
        '<circle cx="29" cy="10" r="0.9" fill="#1A1A1A"/>' +
        '<path d="M5 15 Q-2 19 -8 14" stroke="#A0A4A8" stroke-width="1.4" fill="none"/>' +
        '</svg>';
    document.body.appendChild(mouse);
    catTimer(() => { if (mouse.parentNode) mouse.remove(); }, 5400);
    const cat = document.createElement('div');
    cat.className = 'cat-runner cat-runner--hunt';
    cat.setAttribute('aria-hidden', 'true');
    cat.style.top = (top - 14) + 'px';
    cat.style.left = '-160px';
    cat.style.setProperty('--run-duration', '4.5s');
    cat.innerHTML = '<div class="cat-runner-inner" style="--slink-speed:0.30s">' + createCatSVG(breed, { facing: 'right' }) + '</div>';
    catTimer(() => { document.body.appendChild(cat); }, 700);
    if (Math.random() < 0.5) catTimer(() => spawnCatBubble(cat, 'Where mouse?'), 1800);
    const pounce = Math.random() < 0.5;
    catTimer(() => {
        if (pounce && mouse.parentNode) {
            mouse.remove();
            if (cat.parentNode) {
                const inner = cat.querySelector('.cat-runner-inner');
                if (inner) inner.innerHTML = createCatFrontSVG(breed, { extendedPaw: true });
                spawnCatBubble(cat, '*pounce!*');
            }
        }
    }, 3700);
    catTimer(() => { if (cat.parentNode) cat.remove(); }, 5400);
}

function startCatModeEffects() {
    const field = document.getElementById('catModeField');
    if (!field || _catPawInterval !== null) return;
    injectCatCornerTails();
    injectSearchWhiskers();
    if (prefersReducedMotion()) return;
    ensureCatSidewalk();
    _catSidewalkInterval = window.setInterval(rotateCatSidewalkBreed, 28000);
    for (let i = 0; i < 5; i++) {
        window.setTimeout(() => { if (getCurrentTheme() === 'cat') spawnCatPaw(); }, i * 220);
    }
    _catPawInterval = window.setInterval(spawnCatPaw, 1100);
    scheduleNextCatActivity(true);
}

function stopCatModeEffects() {
    if (_catPawInterval) { clearInterval(_catPawInterval); _catPawInterval = null; }
    if (_catSidewalkInterval) { clearInterval(_catSidewalkInterval); _catSidewalkInterval = null; }
    if (_catActivityTimeout) { clearTimeout(_catActivityTimeout); _catActivityTimeout = null; }
    _catActivityTimers.forEach(id => clearTimeout(id));
    _catActivityTimers = [];
    removeCatSidewalk();
    removeCatCornerTails();
    removeSearchWhiskers();
    document.querySelectorAll('.cat-runner, .cat-sleeper, .cat-groomer, .cat-knocker, .cat-mouse, .cat-bubble').forEach(el => el.remove());
    document.querySelectorAll('.cat-shake').forEach(el => el.classList.remove('cat-shake'));
    const field = document.getElementById('catModeField');
    if (field) field.replaceChildren();
}

function syncCatModeEffects(theme) {
    if (theme === 'cat') startCatModeEffects();
    else stopCatModeEffects();
}

function playMeowSound() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        osc.type = 'sine';
        const t0 = ctx.currentTime;
        osc.frequency.setValueAtTime(600, t0);
        osc.frequency.exponentialRampToValueAtTime(480, t0 + 0.10);
        osc.frequency.exponentialRampToValueAtTime(720, t0 + 0.22);
        osc.frequency.exponentialRampToValueAtTime(540, t0 + 0.45);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
        filter.type = 'bandpass';
        filter.frequency.value = 800;
        filter.Q.value = 6;
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 14;
        lfoGain.gain.value = 22;
        lfo.connect(lfoGain).connect(osc.frequency);
        osc.connect(filter).connect(gain).connect(ctx.destination);
        osc.start(t0); lfo.start(t0);
        osc.stop(t0 + 0.6); lfo.stop(t0 + 0.6);
        window.setTimeout(() => { ctx.close && ctx.close(); }, 900);
    } catch (e) { /* silent */ }
}
