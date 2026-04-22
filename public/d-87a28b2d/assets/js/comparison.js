/* ═════════════════════════════════════════════════
   AURES Competence Model — Comparison view
   Side-by-side analysis of two groups split by a chosen
   dimension (Oddělení / Pozice / Pobočka / Země / Manažer).
   Reuses helpers from stats.js: ChartRegistry, destroyChart,
   median, quantile, stddev, groupAvg, aggregateCompetences,
   FORM_PALETTE, truncate.
   ═════════════════════════════════════════════════ */

// ── Constants ────────────────────────────────────
const CMP_COLORS = {
    A: { stroke: "#3b82f6", fill: "rgba(59,130,246,0.22)", solid: "#3b82f6", soft: "rgba(59,130,246,0.08)" },
    B: { stroke: "#f59e0b", fill: "rgba(245,158,11,0.22)", solid: "#f59e0b", soft: "rgba(245,158,11,0.08)" }
};
const CMP_DIMENSIONS = [
    { key: "form",    label: "Oddělení" },
    { key: "catalog", label: "Pozice" },
    { key: "city",    label: "Pobočka" },
    { key: "country", label: "Země" },
    { key: "manager", label: "Manažer" }
];

// ── Group splitter ───────────────────────────────
function getComparisonGroups() {
    const cmp = State.comparison || {};
    const field = getDimensionField(cmp.dimension);
    if (!field || !cmp.valueA || !cmp.valueB) return { groupA: [], groupB: [] };
    const records = getFilteredResults();
    return {
        groupA: records.filter(r => r[field] === cmp.valueA),
        groupB: records.filter(r => r[field] === cmp.valueB)
    };
}

// ── Event handlers ───────────────────────────────
function handleComparisonDimensionChange(dim) {
    State.comparison = { dimension: dim || null, valueA: null, valueB: null };
    renderComparison();
}

function handleComparisonValueChange(side, value) {
    if (!State.comparison) return;
    const v = value || null;
    if (side === "A") State.comparison.valueA = v;
    if (side === "B") State.comparison.valueB = v;
    renderComparison();
}

function swapComparisonValues() {
    const c = State.comparison;
    if (!c || !c.valueA || !c.valueB) return;
    [c.valueA, c.valueB] = [c.valueB, c.valueA];
    renderComparison();
}

function resetComparison() {
    State.comparison = { dimension: null, valueA: null, valueB: null };
    renderComparison();
}

// ── Top-level dispatcher ─────────────────────────
function renderComparison() {
    renderComparisonControls();
    const host = document.getElementById("comparisonContent");
    if (!host) return;

    const cmp = State.comparison || {};
    if (!cmp.dimension) {
        host.innerHTML = cmpEmptyState("git-compare",
            "Vyberte dimenzi pro srovnání",
            "Vlevo nahoře zvolte podle čeho chcete porovnávat (oddělení, pobočka, země, manažer nebo pozice). Potom vyberte dvě konkrétní hodnoty.");
        if (window.lucide) lucide.createIcons();
        return;
    }
    if (!cmp.valueA || !cmp.valueB) {
        host.innerHTML = cmpEmptyState("users",
            "Vyberte dvě skupiny",
            `Zvolili jste dimenzi „${escapeHtml(DIMENSION_LABEL[cmp.dimension])}". Vyberte ještě skupinu A a skupinu B, abyste viděli srovnání.`);
        if (window.lucide) lucide.createIcons();
        return;
    }
    if (cmp.valueA === cmp.valueB) {
        host.innerHTML = cmpEmptyState("shuffle",
            "Skupiny musí být různé",
            "Aby mělo srovnání smysl, musí být skupina A a skupina B dvě různé hodnoty.");
        if (window.lucide) lucide.createIcons();
        return;
    }

    const { groupA, groupB } = getComparisonGroups();
    host.innerHTML = renderComparisonLayout(cmp, groupA, groupB);
    renderComparisonKpiBlocks(groupA, groupB);
    renderGroupedHistogram(groupA, groupB);
    renderComparisonRadar(groupA, groupB);
    renderCompetenceDiffBar(groupA, groupB);
    renderComparisonTimeTrend(groupA, groupB);
    renderComparisonActivity(groupA, groupB);
    renderComparisonTopBottom(groupA, groupB);
    renderComparisonBreakdown(groupA, groupB, cmp.dimension);
    if (cmp.dimension !== "manager") renderComparisonManagers(groupA, groupB);
    if (window.lucide) lucide.createIcons();
}

function cmpEmptyState(icon, title, desc) {
    return `
        <div class="cmp-empty">
            <div class="cmp-empty-icon"><i data-lucide="${icon}"></i></div>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(desc)}</p>
        </div>`;
}

// ── Controls (dimension + A/B selects + swap/reset) ──
function renderComparisonControls() {
    const host = document.getElementById("comparisonControls");
    if (!host) return;
    const cmp = State.comparison || {};

    const dimOptions = CMP_DIMENSIONS.map(d =>
        `<option value="${d.key}" ${cmp.dimension === d.key ? "selected" : ""}>${escapeHtml(d.label)}</option>`
    ).join("");

    let aOptions = `<option value="">—</option>`;
    let bOptions = `<option value="">—</option>`;
    const field = getDimensionField(cmp.dimension);
    if (field) {
        const values = Array.from(new Set(
            getFilteredResults().map(r => r[field]).filter(Boolean)
        )).sort((a, b) => String(a).localeCompare(String(b), "cs"));
        aOptions += values.map(v => `<option value="${escapeHtml(v)}" ${cmp.valueA === v ? "selected" : ""}>${escapeHtml(v)}</option>`).join("");
        bOptions += values.map(v => `<option value="${escapeHtml(v)}" ${cmp.valueB === v ? "selected" : ""}>${escapeHtml(v)}</option>`).join("");
    }

    const disabledSel = field ? "" : "disabled";
    const disabledSwap = (cmp.valueA && cmp.valueB) ? "" : "disabled";

    host.innerHTML = `
        <div class="cmp-controls">
            <div class="cmp-controls-row cmp-controls-row-top">
                <div class="cmp-control-group">
                    <label class="cmp-control-label">Dimenze srovnání</label>
                    <select class="cmp-select cmp-select-dim" onchange="handleComparisonDimensionChange(this.value)">
                        <option value="">—</option>
                        ${dimOptions}
                    </select>
                </div>
                <div class="cmp-controls-actions">
                    <button class="cmp-btn cmp-btn-swap" ${disabledSwap} onclick="swapComparisonValues()" title="Prohodit A ↔ B">
                        <i data-lucide="arrow-left-right" class="w-4 h-4"></i> Prohodit
                    </button>
                    <button class="cmp-btn cmp-btn-reset" onclick="resetComparison()" title="Resetovat srovnání">
                        <i data-lucide="rotate-ccw" class="w-4 h-4"></i> Reset
                    </button>
                </div>
            </div>
            <div class="cmp-controls-row cmp-controls-row-values">
                <div class="cmp-control-group cmp-control-a">
                    <label class="cmp-control-label"><span class="cmp-dot cmp-dot-a"></span> Skupina A</label>
                    <select class="cmp-select cmp-select-a" ${disabledSel} onchange="handleComparisonValueChange('A', this.value)">
                        ${aOptions}
                    </select>
                </div>
                <div class="cmp-vs">vs</div>
                <div class="cmp-control-group cmp-control-b">
                    <label class="cmp-control-label"><span class="cmp-dot cmp-dot-b"></span> Skupina B</label>
                    <select class="cmp-select cmp-select-b" ${disabledSel} onchange="handleComparisonValueChange('B', this.value)">
                        ${bOptions}
                    </select>
                </div>
            </div>
        </div>`;
}

// ── Layout skeleton ──────────────────────────────
function renderComparisonLayout(cmp, groupA, groupB) {
    const dimLabel = escapeHtml(DIMENSION_LABEL[cmp.dimension] || "—");
    const warn = [];
    if (groupA.length < 3) warn.push(`Skupina A (${escapeHtml(cmp.valueA)}) má jen ${groupA.length} hodnocen${groupA.length === 1 ? "í" : "í"} — výsledky mohou být zavádějící.`);
    if (groupB.length < 3) warn.push(`Skupina B (${escapeHtml(cmp.valueB)}) má jen ${groupB.length} hodnocen${groupB.length === 1 ? "í" : "í"} — výsledky mohou být zavádějící.`);
    const warningBlock = warn.length
        ? `<div class="cmp-warning"><i data-lucide="alert-triangle"></i><div>${warn.join("<br>")}</div></div>`
        : "";

    const breakdownTitle = cmpBreakdownTitle(cmp.dimension);
    const managersBlock = cmp.dimension !== "manager" ? `
        <section class="stats-section">
            <div class="stats-section-header">
                <h2><span class="stats-section-num">09</span> Manažeři uvnitř skupin</h2>
                <p class="stats-section-sub">Kdo nejvíc hodnotí v každé skupině — odhaluje, zda rozdíl tlačí konkrétní manažer.</p>
            </div>
            <div class="cmp-two-col">
                <div class="stats-card">
                    <div class="cmp-card-title cmp-card-title-a">${escapeHtml(cmp.valueA)}</div>
                    <div id="cmpManagersA"></div>
                </div>
                <div class="stats-card">
                    <div class="cmp-card-title cmp-card-title-b">${escapeHtml(cmp.valueB)}</div>
                    <div id="cmpManagersB"></div>
                </div>
            </div>
        </section>` : "";

    return `
        <div class="cmp-header">
            <div class="cmp-header-title">
                <span class="cmp-header-badge">${dimLabel}</span>
                <span class="cmp-header-a">${escapeHtml(cmp.valueA)}</span>
                <span class="cmp-header-vs">vs</span>
                <span class="cmp-header-b">${escapeHtml(cmp.valueB)}</span>
            </div>
            <div class="cmp-header-counts">
                <span><span class="cmp-dot cmp-dot-a"></span> n=${groupA.length}</span>
                <span><span class="cmp-dot cmp-dot-b"></span> n=${groupB.length}</span>
            </div>
        </div>
        ${warningBlock}

        <section class="stats-section">
            <div class="stats-section-header">
                <h2><span class="stats-section-num">01</span> Přehled skupin</h2>
                <p class="stats-section-sub">Základní metriky — počet, průměr, medián, rozpětí, konzistence hodnocení a podíl výborných/slabých kandidátů.</p>
            </div>
            <div class="cmp-kpi-blocks" id="cmpKpiBlocks"></div>
        </section>

        <section class="stats-section">
            <div class="stats-section-header">
                <h2><span class="stats-section-num">02</span> Rozložení skóre</h2>
                <p class="stats-section-sub">Kolik kandidátů spadá do kterého bodového pásma — porovnání tvaru distribuce obou skupin.</p>
            </div>
            <div class="stats-card card-tall"><canvas class="stats-chart-canvas" id="cmpHistogram"></canvas></div>
        </section>

        <section class="stats-section">
            <div class="stats-section-header">
                <h2><span class="stats-section-num">03</span> Kompetenční radar</h2>
                <p class="stats-section-sub">Silné a slabé stránky každé skupiny napříč kompetencemi v jednom grafu.</p>
            </div>
            <div class="stats-card card-xtall"><canvas class="stats-chart-canvas" id="cmpRadar"></canvas></div>
        </section>

        <section class="stats-section">
            <div class="stats-section-header">
                <h2><span class="stats-section-num">04</span> Rozdíl v kompetencích (A − B)</h2>
                <p class="stats-section-sub">Modrá = A je silnější, oranžová = B je silnější. Seřazeno podle velikosti rozdílu.</p>
            </div>
            <div class="stats-card card-tall"><canvas class="stats-chart-canvas" id="cmpDiffBar"></canvas></div>
        </section>

        <section class="stats-section">
            <div class="stats-section-header">
                <h2><span class="stats-section-num">05</span> Vývoj průměrného skóre v čase</h2>
                <p class="stats-section-sub">Měsíční průměr obou skupin vedle sebe.</p>
            </div>
            <div class="stats-card card-tall"><canvas class="stats-chart-canvas" id="cmpTrend"></canvas></div>
        </section>

        <section class="stats-section">
            <div class="stats-section-header">
                <h2><span class="stats-section-num">06</span> Aktivita v čase</h2>
                <p class="stats-section-sub">Počet hodnocení měsíčně — odhaluje sezónní trendy a rozdíly v objemu.</p>
            </div>
            <div class="stats-card card-tall"><canvas class="stats-chart-canvas" id="cmpActivity"></canvas></div>
        </section>

        <section class="stats-section">
            <div class="stats-section-header">
                <h2><span class="stats-section-num">07</span> Nejlepší a nejhorší kandidáti</h2>
                <p class="stats-section-sub">Konkrétní jména na vrcholu a na dně obou skupin.</p>
            </div>
            <div class="cmp-two-col">
                <div class="stats-card">
                    <div class="cmp-card-title cmp-card-title-a">TOP 5 · ${escapeHtml(cmp.valueA)}</div>
                    <div id="cmpTopA"></div>
                </div>
                <div class="stats-card">
                    <div class="cmp-card-title cmp-card-title-b">TOP 5 · ${escapeHtml(cmp.valueB)}</div>
                    <div id="cmpTopB"></div>
                </div>
                <div class="stats-card">
                    <div class="cmp-card-title cmp-card-title-a">BOTTOM 5 · ${escapeHtml(cmp.valueA)}</div>
                    <div id="cmpBottomA"></div>
                </div>
                <div class="stats-card">
                    <div class="cmp-card-title cmp-card-title-b">BOTTOM 5 · ${escapeHtml(cmp.valueB)}</div>
                    <div id="cmpBottomB"></div>
                </div>
            </div>
        </section>

        <section class="stats-section">
            <div class="stats-section-header">
                <h2><span class="stats-section-num">08</span> ${escapeHtml(breakdownTitle)}</h2>
                <p class="stats-section-sub">Pomáhá ověřit, jestli je srovnání férové — zda mají obě skupiny podobný mix uvnitř.</p>
            </div>
            <div class="cmp-two-col">
                <div class="stats-card card-tall">
                    <div class="cmp-card-title cmp-card-title-a">${escapeHtml(cmp.valueA)}</div>
                    <canvas class="stats-chart-canvas" id="cmpBreakdownA"></canvas>
                </div>
                <div class="stats-card card-tall">
                    <div class="cmp-card-title cmp-card-title-b">${escapeHtml(cmp.valueB)}</div>
                    <canvas class="stats-chart-canvas" id="cmpBreakdownB"></canvas>
                </div>
            </div>
        </section>

        ${managersBlock}
    `;
}

function cmpBreakdownTitle(dim) {
    switch (dim) {
        case "form":    return "Které pozice tvoří tato oddělení";
        case "catalog": return "Ve kterých pobočkách se tyto pozice vyskytují";
        case "city":    return "Jaká oddělení jsou v těchto pobočkách";
        case "country": return "Jaká oddělení jsou v těchto zemích";
        case "manager": return "S jakými odděleními manažer pracuje";
        default:        return "Složení skupin";
    }
}

// ── Stats helpers (simple) ───────────────────────
function cmpStats(records) {
    const totals = records.map(r => r.total_points).filter(v => typeof v === "number").sort((a, b) => a - b);
    const n = totals.length;
    const sum = totals.reduce((a, b) => a + b, 0);
    const avg = n ? sum / n : 0;
    const managers = new Set(records.map(r => r.manager_name).filter(Boolean)).size;
    const cities = new Set(records.map(r => r.client_branch_name).filter(Boolean)).size;
    const excellent = totals.filter(v => v >= 50).length;
    const poor = totals.filter(v => v < 30).length;
    return {
        n,
        avg,
        median: n ? median(totals) : 0,
        max: n ? totals[n - 1] : 0,
        min: n ? totals[0] : 0,
        sd: n ? stddev(totals) : 0,
        excellentPct: n ? (excellent / n) * 100 : 0,
        poorPct: n ? (poor / n) * 100 : 0,
        managers,
        cities
    };
}

// ── Section 0: KPI blocks (side-by-side, 2×4) ────
function renderComparisonKpiBlocks(groupA, groupB) {
    const host = document.getElementById("cmpKpiBlocks");
    if (!host) return;
    const a = cmpStats(groupA);
    const b = cmpStats(groupB);
    const cmp = State.comparison;

    const buildBlock = (side, stats, title) => {
        const klass = side === "A" ? "cmp-block cmp-block-a" : "cmp-block cmp-block-b";
        if (stats.n === 0) {
            return `
                <div class="${klass}">
                    <div class="cmp-block-header">${escapeHtml(title)}</div>
                    <div class="cmp-block-empty">Žádné záznamy v této skupině.</div>
                </div>`;
        }
        return `
            <div class="${klass}">
                <div class="cmp-block-header">${escapeHtml(title)}</div>
                <div class="cmp-kpi-grid">
                    ${cmpKpiCard("users", "Počet hodnocených", stats.n, "", "record")}
                    ${cmpKpiCard("gauge", "Průměrné skóre", stats.avg.toFixed(1), "z 70", "avg")}
                    ${cmpKpiCard("align-center", "Medián skóre", stats.median.toFixed(1), "z 70", "med")}
                    ${cmpKpiCard("award", "Nejlepší", stats.max, "z 70", "max")}
                    ${cmpKpiCard("trending-down", "Nejnižší", stats.min, "z 70", "min")}
                    ${cmpKpiCard("activity", "Konzistence (SD)", stats.sd.toFixed(1), "nižší = konzistentnější", "sd")}
                    ${cmpKpiCard("star", "% výborných (≥50)", stats.excellentPct.toFixed(0) + " %", "podíl", "pctHigh")}
                    ${cmpKpiCard("alert-triangle", "% slabých (<30)", stats.poorPct.toFixed(0) + " %", "podíl", "pctLow")}
                </div>
                <div class="cmp-block-meta">
                    <span><i data-lucide="user-cog"></i> ${stats.managers} manažer${stats.managers === 1 ? "" : "ů"}</span>
                    <span><i data-lucide="map-pin"></i> ${stats.cities} měst${stats.cities === 1 ? "o" : stats.cities < 5 ? "a" : ""}</span>
                </div>
            </div>`;
    };

    const diffBar = cmpDiffBar(a, b);

    host.innerHTML = `
        ${buildBlock("A", a, cmp.valueA)}
        ${buildBlock("B", b, cmp.valueB)}
        <div class="cmp-diff-strip" style="grid-column: 1 / -1;">${diffBar}</div>`;
}

function cmpKpiCard(icon, label, value, sub, kind) {
    const iconHtml = `<i data-lucide="${icon}"></i>`;
    return `
        <div class="cmp-kpi-card">
            <div class="cmp-kpi-icon">${iconHtml}</div>
            <div class="cmp-kpi-label">${escapeHtml(label)}</div>
            <div class="cmp-kpi-value">${value}</div>
            <div class="cmp-kpi-sub">${escapeHtml(sub)}</div>
        </div>`;
}

function cmpDiffBar(a, b) {
    if (a.n === 0 || b.n === 0) return "";
    const rows = [
        { label: "Průměrné skóre", diff: a.avg - b.avg, unit: "b", precision: 1 },
        { label: "Medián skóre",   diff: a.median - b.median, unit: "b", precision: 1 },
        { label: "Nejlepší",       diff: a.max - b.max, unit: "b", precision: 0 },
        { label: "Nejnižší",       diff: a.min - b.min, unit: "b", precision: 0 },
        { label: "Konzistence (SD, nižší = lepší)", diff: b.sd - a.sd, unit: "b", precision: 1, higherIsBetter: "A" },
        { label: "% výborných",    diff: a.excellentPct - b.excellentPct, unit: "pp", precision: 0 },
        { label: "% slabých (nižší = lepší)", diff: b.poorPct - a.poorPct, unit: "pp", precision: 0, higherIsBetter: "A" }
    ];

    const items = rows.map(r => {
        const winner = r.diff > 0 ? "A" : r.diff < 0 ? "B" : null;
        const cls = winner === "A" ? "cmp-diff-a" : winner === "B" ? "cmp-diff-b" : "cmp-diff-tie";
        const arrow = winner === "A" ? "↑ A" : winner === "B" ? "↑ B" : "=";
        const num = r.precision === 0 ? Math.round(r.diff) : Number(r.diff.toFixed(r.precision));
        const sign = num > 0 ? "+" : "";
        return `
            <div class="cmp-diff-item ${cls}">
                <div class="cmp-diff-label">${escapeHtml(r.label)}</div>
                <div class="cmp-diff-value">${sign}${num} ${r.unit}</div>
                <div class="cmp-diff-arrow">${arrow}</div>
            </div>`;
    }).join("");
    return `<div class="cmp-diff-grid">${items}</div>`;
}

// ── Section 1: Grouped histogram ─────────────────
function renderGroupedHistogram(groupA, groupB) {
    const labels = ["1–10", "11–20", "21–30", "31–40", "41–50", "51–60", "61–70"];
    const bins = (records) => {
        const b = [0, 0, 0, 0, 0, 0, 0];
        records.forEach(r => {
            const p = r.total_points;
            if (typeof p !== "number") return;
            const idx = Math.min(6, Math.max(0, Math.floor((p - 1) / 10)));
            b[idx] += 1;
        });
        return b;
    };
    const cmp = State.comparison;
    destroyChart("cmpHistogram");
    const canvas = document.getElementById("cmpHistogram");
    if (!canvas) return;
    ChartRegistry["cmpHistogram"] = new Chart(canvas, {
        type: "bar",
        data: {
            labels,
            datasets: [
                { label: cmp.valueA, data: bins(groupA), backgroundColor: CMP_COLORS.A.fill, borderColor: CMP_COLORS.A.stroke, borderWidth: 1, borderRadius: 6 },
                { label: cmp.valueB, data: bins(groupB), backgroundColor: CMP_COLORS.B.fill, borderColor: CMP_COLORS.B.stroke, borderWidth: 1, borderRadius: 6 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom", labels: { color: "#475569", font: { size: 11 }, boxWidth: 12 } } },
            scales: {
                x: { grid: { display: false }, ticks: { color: "#334155" } },
                y: { beginAtZero: true, grid: { color: "rgba(148,163,184,0.12)" }, ticks: { color: "#64748b", precision: 0 } }
            }
        }
    });
}

// ── Section 2: Competence radar A vs B ───────────
function cmpCompetenceAvgMap(records) {
    const byComp = aggregateCompetences(records);
    const map = {}; // id -> { name, avg, n }
    Object.values(byComp).forEach(c => {
        map[c.id] = {
            name: c.name,
            avg: c.points.length ? c.points.reduce((a, b) => a + b, 0) / c.points.length : null,
            n: c.points.length
        };
    });
    return map;
}

function renderComparisonRadar(groupA, groupB) {
    const mapA = cmpCompetenceAvgMap(groupA);
    const mapB = cmpCompetenceAvgMap(groupB);
    const allIds = Array.from(new Set([...Object.keys(mapA), ...Object.keys(mapB)].map(Number))).sort((a, b) => a - b);
    if (!allIds.length) return;

    const labelFor = (cid) => mapA[cid]?.name || mapB[cid]?.name || `ID ${cid}`;
    const cmp = State.comparison;

    destroyChart("cmpRadar");
    const canvas = document.getElementById("cmpRadar");
    if (!canvas) return;

    ChartRegistry["cmpRadar"] = new Chart(canvas, {
        type: "radar",
        data: {
            labels: allIds.map(cid => truncate(labelFor(cid), 28)),
            datasets: [
                {
                    label: cmp.valueA,
                    data: allIds.map(cid => mapA[cid]?.avg != null ? Number(mapA[cid].avg.toFixed(2)) : 0),
                    backgroundColor: CMP_COLORS.A.fill,
                    borderColor: CMP_COLORS.A.stroke,
                    pointBackgroundColor: CMP_COLORS.A.stroke,
                    pointBorderColor: "#fff",
                    pointRadius: 3,
                    borderWidth: 2
                },
                {
                    label: cmp.valueB,
                    data: allIds.map(cid => mapB[cid]?.avg != null ? Number(mapB[cid].avg.toFixed(2)) : 0),
                    backgroundColor: CMP_COLORS.B.fill,
                    borderColor: CMP_COLORS.B.stroke,
                    pointBackgroundColor: CMP_COLORS.B.stroke,
                    pointBorderColor: "#fff",
                    pointRadius: 3,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "bottom", labels: { color: "#475569", font: { size: 11 }, boxWidth: 12, padding: 10 } },
                tooltip: {
                    callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.r.toFixed(2)} bodů` }
                }
            },
            scales: {
                r: {
                    beginAtZero: true, min: 0, max: 10,
                    ticks: { stepSize: 2, color: "#94a3b8", backdropColor: "transparent", font: { size: 10 } },
                    grid: { color: "rgba(148,163,184,0.2)" },
                    angleLines: { color: "rgba(148,163,184,0.25)" },
                    pointLabels: { color: "#334155", font: { size: 11, weight: "600" } }
                }
            }
        }
    });
}

// ── Section 3: Competence diff bar ───────────────
function renderCompetenceDiffBar(groupA, groupB) {
    const mapA = cmpCompetenceAvgMap(groupA);
    const mapB = cmpCompetenceAvgMap(groupB);
    const allIds = Array.from(new Set([...Object.keys(mapA), ...Object.keys(mapB)].map(Number)));
    const diffs = allIds.map(cid => {
        const a = mapA[cid]?.avg;
        const b = mapB[cid]?.avg;
        if (a == null || b == null) return null;
        return { id: cid, name: mapA[cid]?.name || mapB[cid]?.name || `ID ${cid}`, diff: a - b, avgA: a, avgB: b };
    }).filter(Boolean).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    destroyChart("cmpDiffBar");
    const canvas = document.getElementById("cmpDiffBar");
    if (!canvas || !diffs.length) return;

    const labels = diffs.map(d => truncate(d.name, 32));
    const data = diffs.map(d => Number(d.diff.toFixed(2)));
    const colors = diffs.map(d => d.diff >= 0 ? CMP_COLORS.A.stroke : CMP_COLORS.B.stroke);

    ChartRegistry["cmpDiffBar"] = new Chart(canvas, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Rozdíl A − B",
                data,
                backgroundColor: colors.map(c => c + "cc"),
                borderColor: colors,
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const d = diffs[ctx.dataIndex];
                            const winner = d.diff > 0 ? State.comparison.valueA : d.diff < 0 ? State.comparison.valueB : "=";
                            return `Rozdíl ${d.diff.toFixed(2)} b (A=${d.avgA.toFixed(2)} / B=${d.avgB.toFixed(2)}) · silnější: ${winner}`;
                        }
                    }
                }
            },
            scales: {
                x: { grid: { color: "rgba(148,163,184,0.12)" }, ticks: { color: "#64748b" }, title: { display: true, text: "Rozdíl v bodech (A − B)", color: "#94a3b8", font: { size: 11 } } },
                y: { grid: { display: false }, ticks: { color: "#334155", font: { size: 11 } } }
            }
        }
    });
}

// ── Section 4: Time trend (dual line) ────────────
function _monthlyAvg(records) {
    const buckets = {};
    records.forEach(r => {
        if (!r.date_filled) return;
        const m = r.date_filled.slice(0, 7);
        if (!buckets[m]) buckets[m] = { sum: 0, n: 0 };
        buckets[m].sum += r.total_points || 0;
        buckets[m].n += 1;
    });
    return buckets;
}
function _monthlyCount(records) {
    const buckets = {};
    records.forEach(r => {
        if (!r.date_filled) return;
        const m = r.date_filled.slice(0, 7);
        buckets[m] = (buckets[m] || 0) + 1;
    });
    return buckets;
}

function renderComparisonTimeTrend(groupA, groupB) {
    const bA = _monthlyAvg(groupA);
    const bB = _monthlyAvg(groupB);
    const months = Array.from(new Set([...Object.keys(bA), ...Object.keys(bB)])).sort();
    const cmp = State.comparison;

    const dataA = months.map(m => bA[m]?.n ? Number((bA[m].sum / bA[m].n).toFixed(2)) : null);
    const dataB = months.map(m => bB[m]?.n ? Number((bB[m].sum / bB[m].n).toFixed(2)) : null);

    destroyChart("cmpTrend");
    const canvas = document.getElementById("cmpTrend");
    if (!canvas || !months.length) return;
    ChartRegistry["cmpTrend"] = new Chart(canvas, {
        type: "line",
        data: {
            labels: months,
            datasets: [
                { label: cmp.valueA, data: dataA, borderColor: CMP_COLORS.A.stroke, backgroundColor: CMP_COLORS.A.fill, tension: 0.25, fill: false, spanGaps: false, pointRadius: 3 },
                { label: cmp.valueB, data: dataB, borderColor: CMP_COLORS.B.stroke, backgroundColor: CMP_COLORS.B.fill, tension: 0.25, fill: false, spanGaps: false, pointRadius: 3 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: { legend: { position: "bottom", labels: { color: "#475569", font: { size: 11 }, boxWidth: 12 } } },
            scales: {
                x: { grid: { display: false }, ticks: { color: "#334155" } },
                y: { beginAtZero: true, suggestedMax: 70, grid: { color: "rgba(148,163,184,0.12)" }, ticks: { color: "#64748b" }, title: { display: true, text: "Průměrné skóre", color: "#94a3b8", font: { size: 11 } } }
            }
        }
    });
}

// ── Section 5: Activity grouped bar ──────────────
function renderComparisonActivity(groupA, groupB) {
    const bA = _monthlyCount(groupA);
    const bB = _monthlyCount(groupB);
    const months = Array.from(new Set([...Object.keys(bA), ...Object.keys(bB)])).sort();
    const cmp = State.comparison;

    destroyChart("cmpActivity");
    const canvas = document.getElementById("cmpActivity");
    if (!canvas || !months.length) return;
    ChartRegistry["cmpActivity"] = new Chart(canvas, {
        type: "bar",
        data: {
            labels: months,
            datasets: [
                { label: cmp.valueA, data: months.map(m => bA[m] || 0), backgroundColor: CMP_COLORS.A.fill, borderColor: CMP_COLORS.A.stroke, borderWidth: 1, borderRadius: 4 },
                { label: cmp.valueB, data: months.map(m => bB[m] || 0), backgroundColor: CMP_COLORS.B.fill, borderColor: CMP_COLORS.B.stroke, borderWidth: 1, borderRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom", labels: { color: "#475569", font: { size: 11 }, boxWidth: 12 } } },
            scales: {
                x: { grid: { display: false }, ticks: { color: "#334155" } },
                y: { beginAtZero: true, grid: { color: "rgba(148,163,184,0.12)" }, ticks: { color: "#64748b", precision: 0 }, title: { display: true, text: "Počet hodnocení", color: "#94a3b8", font: { size: 11 } } }
            }
        }
    });
}

// ── Section 6: TOP / BOTTOM 5 tables ─────────────
function renderComparisonTopBottom(groupA, groupB) {
    const topA = groupA.slice().sort((a, b) => (b.total_points || 0) - (a.total_points || 0)).slice(0, 5);
    const botA = groupA.slice().sort((a, b) => (a.total_points || 0) - (b.total_points || 0)).slice(0, 5);
    const topB = groupB.slice().sort((a, b) => (b.total_points || 0) - (a.total_points || 0)).slice(0, 5);
    const botB = groupB.slice().sort((a, b) => (a.total_points || 0) - (b.total_points || 0)).slice(0, 5);

    const renderTbl = (rows) => {
        if (!rows.length) return `<p style="color:var(--text-muted);font-size:13px;padding:8px;">Žádná data.</p>`;
        return `
            <table class="stats-table">
                <thead><tr><th>Kandidát</th><th>Pozice</th><th>Město</th><th class="num">Skóre</th></tr></thead>
                <tbody>
                    ${rows.map(r => `
                        <tr>
                            <td><strong>${escapeHtml(r.candidate_fullname || "—")}</strong></td>
                            <td>${escapeHtml(r.catalog_position || "—")}</td>
                            <td>${escapeHtml(r.client_branch_name || "—")}</td>
                            <td class="num"><strong>${r.total_points ?? "—"}</strong></td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>`;
    };

    const elTopA = document.getElementById("cmpTopA");
    const elTopB = document.getElementById("cmpTopB");
    const elBotA = document.getElementById("cmpBottomA");
    const elBotB = document.getElementById("cmpBottomB");
    if (elTopA) elTopA.innerHTML = renderTbl(topA);
    if (elTopB) elTopB.innerHTML = renderTbl(topB);
    if (elBotA) elBotA.innerHTML = renderTbl(botA);
    if (elBotB) elBotB.innerHTML = renderTbl(botB);
}

// ── Section 7: Breakdown donuts ──────────────────
function cmpBreakdownField(dim) {
    switch (dim) {
        case "form":    return "catalog_position";
        case "catalog": return "client_branch_name";
        case "city":    return "form_name";
        case "country": return "form_name";
        case "manager": return "form_name";
        default:        return "form_name";
    }
}

const DONUT_PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#94a3b8", "#f97316"];

function renderBreakdownDonut(canvasId, records, field, accent) {
    const counts = {};
    records.forEach(r => {
        const k = r[field];
        if (!k) return;
        counts[k] = (counts[k] || 0) + 1;
    });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const topN = 8;
    const top = entries.slice(0, topN);
    const rest = entries.slice(topN);
    if (rest.length) {
        top.push(["Ostatní", rest.reduce((s, [, v]) => s + v, 0)]);
    }

    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (!top.length) {
        canvas.parentElement.innerHTML = canvas.parentElement.innerHTML +
            `<p style="color:var(--text-muted);font-size:12px;margin-top:12px;">Žádná data pro breakdown.</p>`;
        return;
    }

    ChartRegistry[canvasId] = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels: top.map(([k]) => truncate(k, 28)),
            datasets: [{
                data: top.map(([, v]) => v),
                backgroundColor: top.map((_, i) => DONUT_PALETTE[i % DONUT_PALETTE.length]),
                borderColor: "var(--surface, #fff)",
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "55%",
            plugins: {
                legend: { position: "bottom", labels: { color: "#475569", font: { size: 11 }, boxWidth: 12, padding: 8 } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.label}: ${ctx.parsed} hodn.`
                    }
                }
            }
        }
    });
}

function renderComparisonBreakdown(groupA, groupB, dim) {
    const field = cmpBreakdownField(dim);
    renderBreakdownDonut("cmpBreakdownA", groupA, field, "A");
    renderBreakdownDonut("cmpBreakdownB", groupB, field, "B");
}

// ── Section 8: Managers inside (skipped if dim=manager) ──
function renderComparisonManagers(groupA, groupB) {
    const build = (records) => {
        const m = {};
        records.forEach(r => {
            const name = r.manager_name;
            if (!name) return;
            if (!m[name]) m[name] = { sum: 0, n: 0 };
            m[name].sum += r.total_points || 0;
            m[name].n += 1;
        });
        return Object.entries(m)
            .map(([name, v]) => ({ name, n: v.n, avg: v.n ? v.sum / v.n : 0 }))
            .sort((a, b) => b.n - a.n)
            .slice(0, 5);
    };

    const renderTbl = (rows) => {
        if (!rows.length) return `<p style="color:var(--text-muted);font-size:13px;padding:8px;">Žádný manažer nehodnotil tuto skupinu.</p>`;
        return `
            <table class="stats-table">
                <thead><tr><th>Manažer</th><th class="num">N</th><th class="num">Ø skóre</th></tr></thead>
                <tbody>
                    ${rows.map(r => `
                        <tr>
                            <td><strong>${escapeHtml(r.name)}</strong></td>
                            <td class="num">${r.n}</td>
                            <td class="num"><strong>${r.avg.toFixed(1)}</strong></td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>`;
    };

    const elA = document.getElementById("cmpManagersA");
    const elB = document.getElementById("cmpManagersB");
    if (elA) elA.innerHTML = renderTbl(build(groupA));
    if (elB) elB.innerHTML = renderTbl(build(groupB));
}
