/* ═════════════════════════════════════════════════
   AURES Competence Model — Stats view
   HR analytika: 8 KPI + 18 vizualizací, 7 sekcí.
   Popisky v běžné češtině (bez technických field names).
   ═════════════════════════════════════════════════ */

const ChartRegistry = {};

function destroyChart(id) {
    if (ChartRegistry[id]) {
        try { ChartRegistry[id].destroy(); } catch (e) { /* ignore */ }
        delete ChartRegistry[id];
    }
}

function renderStats() {
    const host = document.getElementById("statsContent");
    if (!host) return;

    const records = getFilteredResults();

    host.innerHTML = renderStatsLayout();
    renderStatsKpis(records);
    renderQualityBars(records);
    renderCompetenceCharts(records);
    renderDistributionAndTrend(records);
    renderTopBottomTables(records);
    if (State.globalCountry === "ALL") renderCountryCompare();
    renderSupplementary(records);

    if (window.lucide) lucide.createIcons();
}

// ── Layout template ──────────────────────────────
function renderStatsLayout() {
    const countryCompareSection = State.globalCountry === "ALL" ? `
        <div class="stats-section-title"><span>Srovnání zemí</span></div>
        <div class="stats-grid-2">
            <div class="stats-card card-tall">
                <h4>Srovnání kvality kandidátů mezi zeměmi</h4>
                <div class="stats-sub">Průměrné skóre a počet hodnocení v CZ / SK / PL</div>
                <canvas id="chartCountry" class="stats-chart-canvas"></canvas>
            </div>
        </div>` : "";

    return `
        <div class="kpi-grid" id="statsKpiGrid"></div>

        <div class="stats-section">
            <div class="stats-section-title"><span>Kvalita kandidátů podle kategorie</span></div>
            <div class="stats-grid-2">
                <div class="stats-card">
                    <h4>Které oddělení má nejkvalitnější kandidáty?</h4>
                    <div class="stats-sub">Průměrné skóre podle oddělení (Salesman, FnI, Call Centre, Test Driver, General)</div>
                    <canvas id="chartByForm" class="stats-chart-canvas"></canvas>
                </div>
                <div class="stats-card card-tall">
                    <h4>Ve kterém městě máme nejlepší kandidáty?</h4>
                    <div class="stats-sub">TOP 10 měst podle průměrného skóre (min. 3 hodnocení)</div>
                    <canvas id="chartByCity" class="stats-chart-canvas"></canvas>
                </div>
                <div class="stats-card card-tall">
                    <h4>Manažeři, kteří hodnotí nejpřísněji</h4>
                    <div class="stats-sub">Nejnižší průměrné skóre u jejich kandidátů (min. 5 hodnocení)</div>
                    <canvas id="chartStrictManagers" class="stats-chart-canvas"></canvas>
                </div>
                <div class="stats-card card-tall">
                    <h4>Manažeři, kteří hodnotí nejshovívavěji</h4>
                    <div class="stats-sub">Nejvyšší průměrné skóre u jejich kandidátů (min. 5 hodnocení)</div>
                    <canvas id="chartLenientManagers" class="stats-chart-canvas"></canvas>
                </div>
                <div class="stats-card card-tall">
                    <h4>Které pozice mají nejvyšší průměrné skóre?</h4>
                    <div class="stats-sub">TOP 10 pozic (min. 3 hodnocení)</div>
                    <canvas id="chartByCatalog" class="stats-chart-canvas"></canvas>
                </div>
            </div>
        </div>

        <div class="stats-section">
            <div class="stats-section-title"><span>Kvalita kompetencí</span></div>
            <div class="stats-grid-2">
                <div class="stats-card card-tall">
                    <h4>Nejsilnější a nejslabší kompetence u našich kandidátů</h4>
                    <div class="stats-sub">Průměrné body u každé kompetence (napříč odděleními)</div>
                    <canvas id="chartCompetenceAvg" class="stats-chart-canvas"></canvas>
                </div>
                <div class="stats-card card-tall">
                    <h4>Rozložení bodů u jednotlivých kompetencí</h4>
                    <div class="stats-sub">Kolikrát kompetence dostala jakou známku (1–10)</div>
                    <canvas id="chartCompetenceDist" class="stats-chart-canvas"></canvas>
                </div>
                <div class="stats-card card-tall" style="grid-column: 1 / -1;">
                    <h4>Síla kompetencí podle oddělení</h4>
                    <div class="stats-sub">Heatmapa: průměrné body u každé kompetence v každém oddělení (zelená = vysoké, červená = nízké)</div>
                    <div id="competenceHeatmap" class="competence-heatmap"></div>
                </div>
            </div>
        </div>

        <div class="stats-section">
            <div class="stats-section-title"><span>Rozložení skóre a vývoj v čase</span></div>
            <div class="stats-grid-2">
                <div class="stats-card">
                    <h4>Kolik kandidátů je v jakém bodovém pásmu</h4>
                    <div class="stats-sub">Histogram celkových skóre (po 10 bodech)</div>
                    <canvas id="chartHistogram" class="stats-chart-canvas"></canvas>
                </div>
                <div class="stats-card">
                    <h4>Rozpětí skóre podle oddělení</h4>
                    <div class="stats-sub">Minimum / 25. percentil / medián / 75. percentil / maximum / průměr</div>
                    <div id="formStatsTable"></div>
                </div>
                <div class="stats-card">
                    <h4>Jak se vyvíjí průměrné skóre v čase</h4>
                    <div class="stats-sub">Měsíční agregace (průměr + počet hodnocení)</div>
                    <canvas id="chartTrend" class="stats-chart-canvas"></canvas>
                </div>
                <div class="stats-card card-tall">
                    <h4>Aktivita manažerů v čase</h4>
                    <div class="stats-sub">Počet hodnocení po měsících — top 5 nejaktivnějších + zbytek</div>
                    <canvas id="chartActivityOverTime" class="stats-chart-canvas"></canvas>
                </div>
            </div>
        </div>

        <div class="stats-section">
            <div class="stats-section-title"><span>Nejlepší a nejhorší kandidáti</span></div>
            <div class="stats-grid-2">
                <div class="stats-card"><h4>Nejlepší kandidáti v aktuálním výběru</h4><div class="stats-sub">TOP 10 podle celkového skóre</div><div id="topCandidatesTable"></div></div>
                <div class="stats-card"><h4>Kandidáti s nejnižším skóre</h4><div class="stats-sub">BOTTOM 10 podle celkového skóre</div><div id="bottomCandidatesTable"></div></div>
            </div>
        </div>

        ${countryCompareSection}

        <div class="stats-section">
            <div class="stats-section-title"><span>Doplňující metriky</span></div>
            <div class="kpi-grid" id="supplementaryKpiStrip"></div>
            <div class="stats-grid-2" style="margin-top:14px;">
                <div class="stats-card card-tall">
                    <h4>Nejaktivnější manažeři (počet hodnocení)</h4>
                    <div class="stats-sub">Kdo udělal nejvíc hodnocení v aktuálním výběru</div>
                    <canvas id="chartMostActiveManagers" class="stats-chart-canvas"></canvas>
                </div>
                <div class="stats-card card-tall">
                    <h4>Nejvíce hodnocené pozice (počet kandidátů)</h4>
                    <div class="stats-sub">Na které pozice přichází nejvíc kandidátů</div>
                    <canvas id="chartMostActivePositions" class="stats-chart-canvas"></canvas>
                </div>
                <div class="stats-card" style="grid-column: 1 / -1;">
                    <h4>Variabilita hodnocení podle manažerů</h4>
                    <div class="stats-sub">Nízká odchylka = konzistentní hodnotitel; vysoká = body rozprostírá v širokém pásmu (min. 5 hodnocení)</div>
                    <div id="managerVarianceTable"></div>
                </div>
            </div>
        </div>`;
}

// ── KPI cards ────────────────────────────────────
function renderStatsKpis(records) {
    const grid = document.getElementById("statsKpiGrid");
    if (!grid) return;

    const count = records.length;
    const totals = records.map(r => r.total_points || 0).sort((a, b) => a - b);
    const avgTotal = count ? (totals.reduce((s, n) => s + n, 0) / count) : 0;
    const maxTotal = totals.length ? totals[totals.length - 1] : 0;
    const minTotal = totals.length ? totals[0] : 0;
    const medianTotal = totals.length ? median(totals) : 0;

    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const thisWeek = records.filter(r => r.date_filled && new Date(r.date_filled).getTime() >= sevenDaysAgo).length;

    const activeManagers = new Set(records.map(r => r.manager_name).filter(Boolean)).size;
    const coveredCities = new Set(records.map(r => r.client_branch_name).filter(Boolean)).size;

    grid.innerHTML = `
        <div class="kpi-card accent-blue">
            <div class="kpi-icon"><i data-lucide="users" style="color:var(--brand-500);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Celkem hodnocených kandidátů</div>
            <div class="kpi-value" style="color:var(--brand-600);">${count}</div>
            <div class="kpi-sub">${countryLabel()} · ${periodLabel()}</div>
        </div>
        <div class="kpi-card accent-slate">
            <div class="kpi-icon"><i data-lucide="gauge" style="color:var(--text-muted);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Průměrné skóre</div>
            <div class="kpi-value">${avgTotal.toFixed(1)}</div>
            <div class="kpi-sub">z max. 70 bodů</div>
        </div>
        <div class="kpi-card accent-slate">
            <div class="kpi-icon"><i data-lucide="align-center" style="color:var(--text-muted);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Středový kandidát (medián)</div>
            <div class="kpi-value">${medianTotal.toFixed(1)}</div>
            <div class="kpi-sub">polovina má víc, polovina míň</div>
        </div>
        <div class="kpi-card accent-green">
            <div class="kpi-icon"><i data-lucide="award" style="color:var(--accent-ok);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Nejlepší kandidát</div>
            <div class="kpi-value" style="color:var(--accent-ok);">${maxTotal}</div>
            <div class="kpi-sub">maximální skóre ve výběru</div>
        </div>
        <div class="kpi-card accent-red">
            <div class="kpi-icon"><i data-lucide="trending-down" style="color:var(--accent-danger);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Nejnižší zaznamenané skóre</div>
            <div class="kpi-value" style="color:var(--accent-danger);">${minTotal}</div>
            <div class="kpi-sub">minimum ve výběru</div>
        </div>
        <div class="kpi-card accent-amber">
            <div class="kpi-icon"><i data-lucide="calendar-clock" style="color:var(--accent-warn);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Hodnoceno tento týden</div>
            <div class="kpi-value" style="color:#b45309;">${thisWeek}</div>
            <div class="kpi-sub">za posledních 7 dní</div>
        </div>
        <div class="kpi-card accent-blue">
            <div class="kpi-icon"><i data-lucide="user-check" style="color:var(--brand-500);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Aktivních manažerů</div>
            <div class="kpi-value" style="color:var(--brand-600);">${activeManagers}</div>
            <div class="kpi-sub">různých hodnotitelů</div>
        </div>
        <div class="kpi-card accent-slate">
            <div class="kpi-icon"><i data-lucide="map-pin" style="color:var(--text-muted);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Pokrytých měst</div>
            <div class="kpi-value">${coveredCities}</div>
            <div class="kpi-sub">v aktuálním výběru</div>
        </div>`;
}

function periodLabel() {
    const p = State.filters.timePeriod;
    const map = { ALL: "celé období", "7D": "posledních 7 dní", "30D": "posledních 30 dní", "90D": "posledních 90 dní", YEAR: "tento rok" };
    return map[p] || "celé období";
}

// ── Utility helpers ──────────────────────────────
function median(sortedArr) {
    if (!sortedArr.length) return 0;
    const mid = Math.floor(sortedArr.length / 2);
    return sortedArr.length % 2 === 0
        ? (sortedArr[mid - 1] + sortedArr[mid]) / 2
        : sortedArr[mid];
}

function quantile(sortedArr, q) {
    if (!sortedArr.length) return 0;
    const pos = (sortedArr.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sortedArr[base + 1] !== undefined) {
        return sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base]);
    }
    return sortedArr[base];
}

function stddev(arr) {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((s, v) => s + (v - mean) * (v - mean), 0) / arr.length;
    return Math.sqrt(variance);
}

function truncate(s, n) {
    if (!s) return "";
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// ── Section 1: Quality by category ───────────────
function groupAvg(records, key, minCount = 1) {
    const buckets = {};
    records.forEach(r => {
        const k = r[key];
        if (!k) return;
        if (!buckets[k]) buckets[k] = { sum: 0, n: 0 };
        buckets[k].sum += r.total_points || 0;
        buckets[k].n += 1;
    });
    return Object.entries(buckets)
        .filter(([, v]) => v.n >= minCount)
        .map(([k, v]) => ({ key: k, avg: v.sum / v.n, count: v.n }));
}

function renderQualityBars(records) {
    // Přehled per oddělení (vertical bar)
    const byForm = groupAvg(records, "form_name").sort((a, b) => b.avg - a.avg);
    destroyChart("chartByForm");
    if (byForm.length) {
        ChartRegistry["chartByForm"] = new Chart(document.getElementById("chartByForm"), {
            type: "bar",
            data: {
                labels: byForm.map(b => b.key),
                datasets: [{
                    label: "Průměrné skóre",
                    data: byForm.map(b => Number(b.avg.toFixed(2))),
                    backgroundColor: "rgba(59,130,246,0.6)",
                    borderColor: "rgba(37,99,235,1)",
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: chartOptionsVBar({ suggestedMax: 70, showCountTooltip: byForm })
        });
    }

    renderHorizontalBarTop10("chartByCity",
        groupAvg(records, "client_branch_name", 3).sort((a, b) => b.avg - a.avg),
        "#10b981", { suggestedMax: 70 });

    // Strict managers = lowest averages (ascending sort, slice first 10)
    const managerAvgs = groupAvg(records, "manager_name", 5);
    const strict = managerAvgs.slice().sort((a, b) => a.avg - b.avg).slice(0, 10);
    renderHorizontalBarTop10("chartStrictManagers", strict, "#ef4444", { suggestedMax: 70, order: "asc" });

    const lenient = managerAvgs.slice().sort((a, b) => b.avg - a.avg).slice(0, 10);
    renderHorizontalBarTop10("chartLenientManagers", lenient, "#f59e0b", { suggestedMax: 70 });

    renderHorizontalBarTop10("chartByCatalog",
        groupAvg(records, "catalog_position", 3).sort((a, b) => b.avg - a.avg).slice(0, 10),
        "#8b5cf6", { suggestedMax: 70 });
}

function renderHorizontalBarTop10(canvasId, buckets, color, opts = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    destroyChart(canvasId);
    if (!buckets.length) {
        canvas.parentElement.innerHTML = canvas.parentElement.innerHTML +
            `<p style="color:var(--text-muted);font-size:12px;margin-top:12px;">Málo dat pro tento graf (žádná položka nesplňuje minimum hodnocení).</p>`;
        return;
    }
    ChartRegistry[canvasId] = new Chart(canvas, {
        type: "bar",
        data: {
            labels: buckets.map(b => b.key),
            datasets: [{
                label: "Průměrné skóre",
                data: buckets.map(b => Number(b.avg.toFixed(2))),
                backgroundColor: color + "99",
                borderColor: color,
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
                            const b = buckets[ctx.dataIndex];
                            return `${b.avg.toFixed(2)} bodů (n=${b.count})`;
                        }
                    }
                }
            },
            scales: {
                x: { beginAtZero: true, suggestedMax: opts.suggestedMax || 70, grid: { color: "rgba(148,163,184,0.12)" }, ticks: { color: "#64748b" } },
                y: { grid: { display: false }, ticks: { color: "#334155", font: { size: 11 } } }
            }
        }
    });
}

function chartOptionsVBar({ suggestedMax = 70, showCountTooltip = null } = {}) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: (ctx) => {
                        if (!showCountTooltip) return `${ctx.parsed.y}`;
                        const b = showCountTooltip[ctx.dataIndex];
                        return `${b.avg.toFixed(2)} bodů (n=${b.count})`;
                    }
                }
            }
        },
        scales: {
            x: { grid: { display: false }, ticks: { color: "#334155", font: { size: 11 } } },
            y: { beginAtZero: true, suggestedMax, grid: { color: "rgba(148,163,184,0.12)" }, ticks: { color: "#64748b" } }
        }
    };
}

// ── Section 2: Competence charts + heatmap ───────
function aggregateCompetences(records) {
    const byComp = {}; // id -> { name, points: [] }
    records.forEach(r => {
        (r.competences || []).forEach(c => {
            const cid = c.competence_id;
            if (!byComp[cid]) byComp[cid] = { id: cid, name: c.competence_name, points: [] };
            if (typeof c.points === "number") byComp[cid].points.push(c.points);
        });
    });
    return byComp;
}

function renderCompetenceCharts(records) {
    const byComp = aggregateCompetences(records);
    const comps = Object.values(byComp)
        .map(c => ({ id: c.id, name: c.name, avg: c.points.length ? c.points.reduce((a, b) => a + b, 0) / c.points.length : 0, n: c.points.length }))
        .sort((a, b) => b.avg - a.avg);

    // 1) Competence average (horizontal bar, colored by strength)
    destroyChart("chartCompetenceAvg");
    const canvas = document.getElementById("chartCompetenceAvg");
    if (canvas && comps.length) {
        ChartRegistry["chartCompetenceAvg"] = new Chart(canvas, {
            type: "bar",
            data: {
                labels: comps.map(c => truncate(c.name || `ID ${c.id}`, 32)),
                datasets: [{
                    label: "Průměrné body",
                    data: comps.map(c => Number(c.avg.toFixed(2))),
                    backgroundColor: comps.map(c => strengthColor(c.avg)),
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: "y",
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => `${comps[ctx.dataIndex].avg.toFixed(2)} bodů (n=${comps[ctx.dataIndex].n})` } }
                },
                scales: {
                    x: { beginAtZero: true, max: 10, grid: { color: "rgba(148,163,184,0.12)" }, ticks: { color: "#64748b" } },
                    y: { grid: { display: false }, ticks: { color: "#334155", font: { size: 11 } } }
                }
            }
        });
    }

    // 2) Competence distribution (stacked bar)
    renderCompetenceDistribution(records);

    // 3) Heatmap competence × form
    renderCompetenceByFormHeatmap(records);
}

function renderCompetenceDistribution(records) {
    const byComp = {};
    records.forEach(r => {
        (r.competences || []).forEach(c => {
            const cid = c.competence_id;
            if (!byComp[cid]) byComp[cid] = { name: c.competence_name, distribution: {} };
            const p = c.points;
            if (typeof p === "number") byComp[cid].distribution[p] = (byComp[cid].distribution[p] || 0) + 1;
        });
    });
    const compIds = Object.keys(byComp).map(Number).sort((a, b) => a - b);

    const datasets = [];
    for (let p = 1; p <= 10; p++) {
        datasets.push({
            label: `${p}`,
            data: compIds.map(cid => byComp[cid].distribution[p] || 0),
            backgroundColor: strengthColor(p),
            borderWidth: 0,
            stack: "points"
        });
    }

    destroyChart("chartCompetenceDist");
    const canvas = document.getElementById("chartCompetenceDist");
    if (!canvas || !compIds.length) return;
    ChartRegistry["chartCompetenceDist"] = new Chart(canvas, {
        type: "bar",
        data: {
            labels: compIds.map(cid => truncate(byComp[cid].name || `ID ${cid}`, 26)),
            datasets
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "bottom", labels: { color: "#475569", font: { size: 10 }, boxWidth: 12 } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label} bodů: ${ctx.parsed.x} kandidátů` } }
            },
            scales: {
                x: { stacked: true, grid: { color: "rgba(148,163,184,0.12)" }, ticks: { color: "#64748b" } },
                y: { stacked: true, grid: { display: false }, ticks: { color: "#334155", font: { size: 11 } } }
            }
        }
    });
}

function renderCompetenceByFormHeatmap(records) {
    const host = document.getElementById("competenceHeatmap");
    if (!host) return;

    // matrix[compId][formName] = avg
    const matrix = {};
    records.forEach(r => {
        const form = r.form_name;
        if (!form) return;
        (r.competences || []).forEach(c => {
            const cid = c.competence_id;
            if (typeof c.points !== "number") return;
            if (!matrix[cid]) matrix[cid] = { name: c.competence_name, byForm: {} };
            if (!matrix[cid].byForm[form]) matrix[cid].byForm[form] = [];
            matrix[cid].byForm[form].push(c.points);
        });
    });

    const compIds = Object.keys(matrix).map(Number).sort((a, b) => a - b);
    const forms = Array.from(new Set(records.map(r => r.form_name).filter(Boolean))).sort();

    if (!compIds.length || !forms.length) {
        host.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:8px;">Málo dat pro heatmapu.</p>`;
        return;
    }

    let html = `<div class="heatmap-grid" style="grid-template-columns: 240px repeat(${forms.length}, minmax(110px, 1fr));">`;
    html += `<div class="heatmap-corner"></div>`;
    forms.forEach(f => { html += `<div class="heatmap-col-head">${escapeHtml(f)}</div>`; });
    compIds.forEach(cid => {
        const compName = matrix[cid].name || `ID ${cid}`;
        html += `<div class="heatmap-row-head" title="${escapeHtml(compName)}">${escapeHtml(truncate(compName, 40))}</div>`;
        forms.forEach(f => {
            const points = matrix[cid].byForm[f];
            if (!points || !points.length) {
                html += `<div class="heatmap-cell heatmap-empty">—</div>`;
            } else {
                const avg = points.reduce((a, b) => a + b, 0) / points.length;
                html += `<div class="heatmap-cell" style="background:${heatmapColor(avg)};" title="${compName} · ${escapeHtml(f)}: ${avg.toFixed(2)} bodů (n=${points.length})">
                    <span class="heatmap-value">${avg.toFixed(1)}</span>
                    <span class="heatmap-count">n=${points.length}</span>
                </div>`;
            }
        });
    });
    html += `</div>`;
    host.innerHTML = html;
}

function strengthColor(p) {
    // p in 0..10 → red → green
    if (p <= 2) return "#dc2626";
    if (p <= 4) return "#f97316";
    if (p <= 6) return "#eab308";
    if (p <= 8) return "#22c55e";
    return "#16a34a";
}

function heatmapColor(avg) {
    // avg in 1..10: use alpha blend of red→yellow→green
    if (avg <= 3) return `rgba(220, 38, 38, ${0.2 + (avg / 10) * 0.5})`;
    if (avg <= 6) return `rgba(234, 179, 8, ${0.2 + (avg / 10) * 0.5})`;
    return `rgba(22, 163, 74, ${0.2 + (avg / 10) * 0.5})`;
}

// ── Section 3: Distribution + trend + activity ──
function renderDistributionAndTrend(records) {
    renderHistogram(records);
    renderFormStatsTable(records);
    renderTimeTrend(records);
    renderActivityOverTime(records);
}

function renderHistogram(records) {
    const buckets = [0, 0, 0, 0, 0, 0, 0];
    const labels = ["1–10", "11–20", "21–30", "31–40", "41–50", "51–60", "61–70"];
    records.forEach(r => {
        const p = r.total_points;
        if (typeof p !== "number") return;
        const idx = Math.min(6, Math.max(0, Math.floor((p - 1) / 10)));
        buckets[idx] += 1;
    });

    destroyChart("chartHistogram");
    const canvas = document.getElementById("chartHistogram");
    if (!canvas) return;
    ChartRegistry["chartHistogram"] = new Chart(canvas, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Kandidátů",
                data: buckets,
                backgroundColor: labels.map((_, i) => i < 2 ? "#ef4444" : i < 4 ? "#f59e0b" : i < 5 ? "#eab308" : "#22c55e"),
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: "#334155" } },
                y: { beginAtZero: true, grid: { color: "rgba(148,163,184,0.12)" }, ticks: { color: "#64748b" } }
            }
        }
    });
}

function renderFormStatsTable(records) {
    const host = document.getElementById("formStatsTable");
    if (!host) return;

    const byForm = {};
    records.forEach(r => {
        const f = r.form_name;
        if (!f) return;
        if (!byForm[f]) byForm[f] = [];
        if (typeof r.total_points === "number") byForm[f].push(r.total_points);
    });

    const rows = Object.entries(byForm)
        .map(([name, totals]) => {
            const sorted = totals.slice().sort((a, b) => a - b);
            return {
                name,
                n: sorted.length,
                min: sorted[0] ?? 0,
                q1: quantile(sorted, 0.25),
                median: median(sorted),
                q3: quantile(sorted, 0.75),
                max: sorted[sorted.length - 1] ?? 0,
                avg: sorted.reduce((a, b) => a + b, 0) / (sorted.length || 1)
            };
        })
        .sort((a, b) => b.avg - a.avg);

    if (!rows.length) {
        host.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:8px;">Žádná data.</p>`;
        return;
    }

    host.innerHTML = `
        <table class="stats-table">
            <thead>
                <tr>
                    <th>Oddělení</th>
                    <th class="num">N</th>
                    <th class="num">Min</th>
                    <th class="num">Q1</th>
                    <th class="num">Med</th>
                    <th class="num">Q3</th>
                    <th class="num">Max</th>
                    <th class="num">Ø</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(r => `
                    <tr>
                        <td><strong>${escapeHtml(r.name)}</strong></td>
                        <td class="num">${r.n}</td>
                        <td class="num">${r.min}</td>
                        <td class="num">${r.q1.toFixed(1)}</td>
                        <td class="num">${r.median.toFixed(1)}</td>
                        <td class="num">${r.q3.toFixed(1)}</td>
                        <td class="num">${r.max}</td>
                        <td class="num"><strong>${r.avg.toFixed(1)}</strong></td>
                    </tr>
                `).join("")}
            </tbody>
        </table>`;
}

function renderTimeTrend(records) {
    const buckets = {};
    records.forEach(r => {
        if (!r.date_filled) return;
        const m = r.date_filled.slice(0, 7);
        if (!buckets[m]) buckets[m] = { sum: 0, n: 0 };
        buckets[m].sum += r.total_points || 0;
        buckets[m].n += 1;
    });
    const months = Object.keys(buckets).sort();
    const avgs = months.map(m => buckets[m].n ? buckets[m].sum / buckets[m].n : 0);
    const counts = months.map(m => buckets[m].n);

    destroyChart("chartTrend");
    const canvas = document.getElementById("chartTrend");
    if (!canvas) return;
    ChartRegistry["chartTrend"] = new Chart(canvas, {
        type: "line",
        data: {
            labels: months,
            datasets: [
                { label: "Průměrné skóre", data: avgs.map(v => Number(v.toFixed(2))), borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.12)", tension: 0.25, fill: true, yAxisID: "y" },
                { label: "Počet hodnocení", data: counts, borderColor: "#94a3b8", backgroundColor: "rgba(148,163,184,0.1)", tension: 0.25, borderDash: [4, 4], yAxisID: "y1", fill: false }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: { legend: { position: "bottom", labels: { color: "#475569", font: { size: 10 } } } },
            scales: {
                x: { grid: { display: false }, ticks: { color: "#334155" } },
                y: { position: "left", beginAtZero: true, suggestedMax: 70, grid: { color: "rgba(148,163,184,0.12)" }, ticks: { color: "#64748b" } },
                y1: { position: "right", beginAtZero: true, grid: { display: false }, ticks: { color: "#94a3b8" } }
            }
        }
    });
}

function renderActivityOverTime(records) {
    // Top 5 managers + "Ostatní" as stacked bar per month
    const managerCounts = {};
    records.forEach(r => {
        if (r.manager_name) managerCounts[r.manager_name] = (managerCounts[r.manager_name] || 0) + 1;
    });
    const topManagers = Object.entries(managerCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(e => e[0]);
    const topSet = new Set(topManagers);

    const byMonth = {}; // month -> { mgr: count }
    records.forEach(r => {
        if (!r.date_filled) return;
        const m = r.date_filled.slice(0, 7);
        if (!byMonth[m]) byMonth[m] = {};
        const bucket = topSet.has(r.manager_name) ? r.manager_name : "Ostatní";
        byMonth[m][bucket] = (byMonth[m][bucket] || 0) + 1;
    });
    const months = Object.keys(byMonth).sort();

    const stackedLabels = [...topManagers, "Ostatní"];
    const palette = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#94a3b8"];
    const datasets = stackedLabels.map((name, i) => ({
        label: name,
        data: months.map(m => (byMonth[m] || {})[name] || 0),
        backgroundColor: palette[i % palette.length],
        borderRadius: 4,
        stack: "activity"
    }));

    destroyChart("chartActivityOverTime");
    const canvas = document.getElementById("chartActivityOverTime");
    if (!canvas || !months.length) return;
    ChartRegistry["chartActivityOverTime"] = new Chart(canvas, {
        type: "bar",
        data: { labels: months, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom", labels: { color: "#475569", font: { size: 10 }, boxWidth: 12 } } },
            scales: {
                x: { stacked: true, grid: { display: false }, ticks: { color: "#334155" } },
                y: { stacked: true, beginAtZero: true, grid: { color: "rgba(148,163,184,0.12)" }, ticks: { color: "#64748b" } }
            }
        }
    });
}

// ── Section 4: Top/Bottom tables ─────────────────
function renderTopBottomTables(records) {
    const sorted = records.slice().sort((a, b) => (b.total_points || 0) - (a.total_points || 0));
    const top = sorted.slice(0, 10);
    const bottom = sorted.slice(-10).reverse();

    const renderTable = (rows) => {
        if (!rows.length) return `<p style="color:var(--text-muted);font-size:13px;padding:8px;">Žádná data.</p>`;
        return `
            <table class="stats-table">
                <thead><tr><th>#</th><th>Kandidát</th><th>Pozice</th><th>Město</th><th class="num">Skóre</th></tr></thead>
                <tbody>
                    ${rows.map((r, i) => `
                        <tr>
                            <td><span class="rank-badge">${i + 1}</span></td>
                            <td><strong>${escapeHtml(r.candidate_fullname || "—")}</strong><div style="font-size:11px;color:var(--text-muted);">${escapeHtml(r.manager_name || "")}</div></td>
                            <td>${escapeHtml(r.catalog_position || "—")}</td>
                            <td>${escapeHtml(r.client_branch_name || "—")}</td>
                            <td class="num"><strong>${r.total_points ?? "—"}</strong></td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>`;
    };

    const topEl = document.getElementById("topCandidatesTable");
    const bottomEl = document.getElementById("bottomCandidatesTable");
    if (topEl) topEl.innerHTML = renderTable(top);
    if (bottomEl) bottomEl.innerHTML = renderTable(bottom.sort((a, b) => (a.total_points || 0) - (b.total_points || 0)));
}

// ── Section 5: Country compare (ALL mode) ─────────
function renderCountryCompare() {
    const allRecords = getAllResultsArray().filter(r => {
        const f = State.filters;
        if (f.form !== "ALL" && r.form_name !== f.form) return false;
        if (f.catalog !== "ALL" && r.catalog_position !== f.catalog) return false;
        if (f.city !== "ALL" && r.client_branch_name !== f.city) return false;
        if (f.manager !== "ALL" && r.manager_name !== f.manager) return false;
        return matchesSearch(r, State.search) && applyTimePeriod(r);
    });

    const labels = ["CZ", "SK", "PL"];
    const nameByLabel = { CZ: "Czech Republic", SK: "Slovakia", PL: "Poland" };
    const avgs = labels.map(l => {
        const slice = allRecords.filter(r => r.country === nameByLabel[l]);
        if (!slice.length) return 0;
        return slice.reduce((s, r) => s + (r.total_points || 0), 0) / slice.length;
    });
    const counts = labels.map(l => allRecords.filter(r => r.country === nameByLabel[l]).length);

    destroyChart("chartCountry");
    const canvas = document.getElementById("chartCountry");
    if (!canvas) return;
    ChartRegistry["chartCountry"] = new Chart(canvas, {
        type: "bar",
        data: {
            labels,
            datasets: [
                { label: "Průměrné skóre", data: avgs.map(v => Number(v.toFixed(2))), backgroundColor: "rgba(59,130,246,0.7)", yAxisID: "y", borderRadius: 6 },
                { label: "Počet hodnocení", data: counts, backgroundColor: "rgba(148,163,184,0.7)", yAxisID: "y1", borderRadius: 6 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom" } },
            scales: {
                x: { grid: { display: false }, ticks: { color: "#334155" } },
                y: { position: "left", beginAtZero: true, suggestedMax: 70, grid: { color: "rgba(148,163,184,0.12)" }, ticks: { color: "#64748b" }, title: { display: true, text: "Průměr", color: "#94a3b8", font: { size: 10 } } },
                y1: { position: "right", beginAtZero: true, grid: { display: false }, ticks: { color: "#94a3b8" }, title: { display: true, text: "Počet", color: "#94a3b8", font: { size: 10 } } }
            }
        }
    });
}

// ── Section 6: Supplementary (KPIs + count charts + variance) ─────
function renderSupplementary(records) {
    renderPercentileKpis(records);
    renderMostActiveManagers(records);
    renderMostActivePositions(records);
    renderManagerVarianceTable(records);
}

function renderPercentileKpis(records) {
    const host = document.getElementById("supplementaryKpiStrip");
    if (!host) return;

    const total = records.length;
    const excellent = records.filter(r => (r.total_points || 0) >= 50).length;
    const poor = records.filter(r => (r.total_points || 0) < 30).length;
    const pctExcellent = total ? Math.round((excellent / total) * 100) : 0;
    const pctPoor = total ? Math.round((poor / total) * 100) : 0;

    host.innerHTML = `
        <div class="kpi-card accent-green">
            <div class="kpi-icon"><i data-lucide="sparkles" style="color:var(--accent-ok);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Kandidátů s výborným skóre (≥ 50/70)</div>
            <div class="kpi-value" style="color:var(--accent-ok);">${pctExcellent}%</div>
            <div class="kpi-sub">${excellent} z ${total}</div>
        </div>
        <div class="kpi-card accent-red">
            <div class="kpi-icon"><i data-lucide="alert-triangle" style="color:var(--accent-danger);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Kandidátů s nízkým skóre (&lt; 30/70)</div>
            <div class="kpi-value" style="color:var(--accent-danger);">${pctPoor}%</div>
            <div class="kpi-sub">${poor} z ${total}</div>
        </div>`;
}

function groupCount(records, key, topN = 10) {
    const counts = {};
    records.forEach(r => {
        const k = r[key];
        if (!k) return;
        counts[k] = (counts[k] || 0) + 1;
    });
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([k, n]) => ({ key: k, count: n }));
}

function renderCountBarChart(canvasId, buckets, color) {
    destroyChart(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || !buckets.length) return;
    ChartRegistry[canvasId] = new Chart(canvas, {
        type: "bar",
        data: {
            labels: buckets.map(b => b.key),
            datasets: [{
                label: "Počet",
                data: buckets.map(b => b.count),
                backgroundColor: color + "99",
                borderColor: color,
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.x} hodnocení` } } },
            scales: {
                x: { beginAtZero: true, grid: { color: "rgba(148,163,184,0.12)" }, ticks: { color: "#64748b" } },
                y: { grid: { display: false }, ticks: { color: "#334155", font: { size: 11 } } }
            }
        }
    });
}

function renderMostActiveManagers(records) {
    renderCountBarChart("chartMostActiveManagers", groupCount(records, "manager_name", 10), "#3b82f6");
}

function renderMostActivePositions(records) {
    renderCountBarChart("chartMostActivePositions", groupCount(records, "catalog_position", 10), "#8b5cf6");
}

function renderManagerVarianceTable(records) {
    const host = document.getElementById("managerVarianceTable");
    if (!host) return;

    const byManager = {};
    records.forEach(r => {
        if (!r.manager_name || typeof r.total_points !== "number") return;
        if (!byManager[r.manager_name]) byManager[r.manager_name] = [];
        byManager[r.manager_name].push(r.total_points);
    });

    const rows = Object.entries(byManager)
        .filter(([, arr]) => arr.length >= 5)
        .map(([name, arr]) => {
            const sorted = arr.slice().sort((a, b) => a - b);
            const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
            return {
                name,
                n: arr.length,
                avg,
                sd: stddev(arr),
                min: sorted[0],
                max: sorted[sorted.length - 1],
                range: sorted[sorted.length - 1] - sorted[0]
            };
        })
        .sort((a, b) => b.sd - a.sd);

    if (!rows.length) {
        host.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:8px;">Málo dat (potřeba alespoň 5 hodnocení na manažera).</p>`;
        return;
    }

    host.innerHTML = `
        <table class="stats-table">
            <thead>
                <tr>
                    <th>Manažer</th>
                    <th class="num">Hodnocení</th>
                    <th class="num">Ø skóre</th>
                    <th class="num">Min</th>
                    <th class="num">Max</th>
                    <th class="num">Rozpětí</th>
                    <th class="num">Odchylka</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(r => `
                    <tr>
                        <td><strong>${escapeHtml(r.name)}</strong></td>
                        <td class="num">${r.n}</td>
                        <td class="num">${r.avg.toFixed(1)}</td>
                        <td class="num">${r.min}</td>
                        <td class="num">${r.max}</td>
                        <td class="num">${r.range}</td>
                        <td class="num"><strong>${r.sd.toFixed(2)}</strong></td>
                    </tr>
                `).join("")}
            </tbody>
        </table>`;
}
