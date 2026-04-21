/* ═════════════════════════════════════════════════
   AURES Competence Model — Stats view
   6 KPI cards + 11 visualisations reacting to country switch.
   Read-only — works only with manager data from Datacruit.
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

    renderTopBottomTables(records);
    renderAvgByDimension(records);
    renderCompetenceDistribution(records);
    renderTimeTrend(records);
    if (State.globalCountry === "ALL") renderCountryCompare();
    renderTotalPointsHistogram(records);
    renderFormStatsTable(records);

    if (window.lucide) lucide.createIcons();
}

// ── Layout template ──────────────────────────────
function renderStatsLayout() {
    const countryCompareSection = State.globalCountry === "ALL" ? `
        <div class="stats-section-title"><span>Srovnání zemí</span></div>
        <div class="stats-grid-2">
            <div class="stats-card card-tall">
                <h4>Srovnání zemí — průměrné total_points + počet hodnocení</h4>
                <div class="stats-sub">CZ / SK / PL ve vybraném řezu</div>
                <canvas id="chartCountry" class="stats-chart-canvas"></canvas>
            </div>
        </div>` : "";

    return `
        <div class="kpi-grid" id="statsKpiGrid"></div>

        <div class="stats-section">
            <div class="stats-section-title"><span>Top &amp; Bottom kandidáti</span></div>
            <div class="stats-grid-2">
                <div class="stats-card"><h4>TOP 10 kandidátů</h4><div class="stats-sub">Nejvyšší total_points</div><div id="topCandidatesTable"></div></div>
                <div class="stats-card"><h4>BOTTOM 10 kandidátů</h4><div class="stats-sub">Nejnižší total_points</div><div id="bottomCandidatesTable"></div></div>
            </div>
        </div>

        <div class="stats-section">
            <div class="stats-section-title"><span>Průměry po dimenzích</span></div>
            <div class="stats-grid-2">
                <div class="stats-card"><h4>Průměr total_points per pozice (form_name)</h4><div class="stats-sub">Agregace přes všechny kandidáty</div><canvas id="chartByForm" class="stats-chart-canvas"></canvas></div>
                <div class="stats-card card-tall"><h4>TOP 10 poboček (system_company_branch_name)</h4><div class="stats-sub">Seřazeno podle průměrného skóre</div><canvas id="chartByBranch" class="stats-chart-canvas"></canvas></div>
                <div class="stats-card card-tall"><h4>TOP 10 manažerů</h4><div class="stats-sub">Průměrné skóre (min. 3 hodnocení)</div><canvas id="chartByManager" class="stats-chart-canvas"></canvas></div>
                <div class="stats-card card-tall"><h4>TOP 10 klientských poboček (client_branch_name)</h4><div class="stats-sub">Průměrné skóre (min. 3 hodnocení)</div><canvas id="chartByClientBranch" class="stats-chart-canvas"></canvas></div>
            </div>
        </div>

        <div class="stats-section">
            <div class="stats-section-title"><span>Distribuce &amp; trendy</span></div>
            <div class="stats-grid-2">
                <div class="stats-card card-tall"><h4>Distribuce bodů per kompetence</h4><div class="stats-sub">Stacked bar: jakou část bodů (1–10) dává manažer u každého competence_id</div><canvas id="chartCompetenceDist" class="stats-chart-canvas"></canvas></div>
                <div class="stats-card"><h4>Trend průměrného total_points v čase</h4><div class="stats-sub">Měsíční agregace dle date_filled</div><canvas id="chartTrend" class="stats-chart-canvas"></canvas></div>
                <div class="stats-card"><h4>Histogram total_points</h4><div class="stats-sub">Rozložení kandidátů do pásem po 10 bodech</div><canvas id="chartHistogram" class="stats-chart-canvas"></canvas></div>
                <div class="stats-card"><h4>Statistiky per pozice</h4><div class="stats-sub">Min / Q1 / Medián / Q3 / Max / Ø</div><div id="formStatsTable"></div></div>
            </div>
        </div>

        ${countryCompareSection}`;
}

// ── KPI cards ────────────────────────────────────
function renderStatsKpis(records) {
    const grid = document.getElementById("statsKpiGrid");
    if (!grid) return;

    const count = records.length;
    const avgTotal = count ? (records.reduce((s, r) => s + (r.total_points || 0), 0) / count) : 0;
    const totals = records.map(r => r.total_points || 0).sort((a, b) => a - b);
    const maxTotal = totals.length ? totals[totals.length - 1] : 0;
    const medianTotal = totals.length ? median(totals) : 0;

    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const thisWeek = records.filter(r => r.date_filled && new Date(r.date_filled).getTime() >= sevenDaysAgo).length;

    const managerCounts = {};
    records.forEach(r => {
        if (!r.manager_name) return;
        managerCounts[r.manager_name] = (managerCounts[r.manager_name] || 0) + 1;
    });
    const topManager = Object.entries(managerCounts).sort((a, b) => b[1] - a[1])[0] || ["—", 0];

    grid.innerHTML = `
        <div class="kpi-card accent-blue">
            <div class="kpi-icon"><i data-lucide="users" style="color:var(--brand-500);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Celkem hodnocení</div>
            <div class="kpi-value" style="color:var(--brand-600);">${count}</div>
            <div class="kpi-sub">${countryLabel()}</div>
        </div>
        <div class="kpi-card accent-slate">
            <div class="kpi-icon"><i data-lucide="gauge" style="color:var(--text-muted);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Průměr total</div>
            <div class="kpi-value">${avgTotal.toFixed(1)}</div>
            <div class="kpi-sub">z max. 70</div>
        </div>
        <div class="kpi-card accent-slate">
            <div class="kpi-icon"><i data-lucide="align-center" style="color:var(--text-muted);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Medián total</div>
            <div class="kpi-value">${medianTotal.toFixed(1)}</div>
            <div class="kpi-sub">středový kandidát</div>
        </div>
        <div class="kpi-card accent-green">
            <div class="kpi-icon"><i data-lucide="award" style="color:var(--accent-ok);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Nejvyšší skóre</div>
            <div class="kpi-value" style="color:var(--accent-ok);">${maxTotal}</div>
            <div class="kpi-sub">top kandidát</div>
        </div>
        <div class="kpi-card accent-amber">
            <div class="kpi-icon"><i data-lucide="calendar-clock" style="color:var(--accent-warn);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Tento týden</div>
            <div class="kpi-value" style="color:#b45309;">${thisWeek}</div>
            <div class="kpi-sub">nových hodnocení</div>
        </div>
        <div class="kpi-card accent-slate">
            <div class="kpi-icon"><i data-lucide="star" style="color:#a16207;width:18px;height:18px;"></i></div>
            <div class="kpi-label">Nejaktivnější manažer</div>
            <div class="kpi-value" style="font-size:18px;line-height:1.3;">${escapeHtml(topManager[0])}</div>
            <div class="kpi-sub">${topManager[1]} hodnocení</div>
        </div>`;
}

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

// ── 1+2: Top/Bottom candidate tables ─────────────
function renderTopBottomTables(records) {
    const sorted = records.slice().sort((a, b) => (b.total_points || 0) - (a.total_points || 0));
    const top = sorted.slice(0, 10);
    const bottom = sorted.slice(-10).reverse();

    const renderTable = (rows) => {
        if (!rows.length) return `<p style="color:var(--text-muted);font-size:13px;padding:8px;">Žádná data.</p>`;
        return `
            <table class="stats-table">
                <thead><tr><th>#</th><th>Kandidát</th><th>Pozice</th><th>Pobočka</th><th class="num">Body</th></tr></thead>
                <tbody>
                    ${rows.map((r, i) => `
                        <tr>
                            <td><span class="rank-badge">${i + 1}</span></td>
                            <td><strong>${escapeHtml(r.candidate_fullname || "—")}</strong><div style="font-size:11px;color:var(--text-muted);">${escapeHtml(r.manager_name || "")}</div></td>
                            <td>${escapeHtml(r.catalog_position || "—")}</td>
                            <td>${escapeHtml(r.system_company_branch_name || "—")}</td>
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

// ── 3–6: Averages by dimension ───────────────────
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

function renderAvgByDimension(records) {
    const byForm = groupAvg(records, "form_name").sort((a, b) => b.avg - a.avg);
    destroyChart("chartByForm");
    ChartRegistry["chartByForm"] = new Chart(document.getElementById("chartByForm"), {
        type: "bar",
        data: {
            labels: byForm.map(b => b.key),
            datasets: [{
                label: "Průměrné total_points",
                data: byForm.map(b => Number(b.avg.toFixed(2))),
                backgroundColor: "rgba(59,130,246,0.6)",
                borderColor: "rgba(37,99,235,1)",
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: chartOptions({ suggestedMax: 70, showCountTooltip: byForm }),
    });

    renderHorizontalBarTop10("chartByBranch", groupAvg(records, "system_company_branch_name", 3), "#10b981");
    renderHorizontalBarTop10("chartByManager", groupAvg(records, "manager_name", 3), "#f59e0b");
    renderHorizontalBarTop10("chartByClientBranch", groupAvg(records, "client_branch_name", 3), "#8b5cf6");
}

function renderHorizontalBarTop10(canvasId, buckets, color) {
    const top = buckets.slice().sort((a, b) => b.avg - a.avg).slice(0, 10);
    destroyChart(canvasId);
    ChartRegistry[canvasId] = new Chart(document.getElementById(canvasId), {
        type: "bar",
        data: {
            labels: top.map(b => b.key),
            datasets: [{
                label: "Průměrné total_points",
                data: top.map(b => Number(b.avg.toFixed(2))),
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
                            const b = top[ctx.dataIndex];
                            return `${b.avg.toFixed(2)} bodů (n=${b.count})`;
                        }
                    }
                }
            },
            scales: {
                x: { beginAtZero: true, suggestedMax: 70, grid: { color: "rgba(148,163,184,0.12)" }, ticks: { color: "#64748b" } },
                y: { grid: { display: false }, ticks: { color: "#334155", font: { size: 11 } } }
            }
        }
    });
}

function chartOptions({ suggestedMax = 70, showCountTooltip = null } = {}) {
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

// ── 7: Competence distribution (stacked bar) ─────
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
            backgroundColor: scoreColor(p),
            borderWidth: 0,
            stack: "points"
        });
    }

    destroyChart("chartCompetenceDist");
    ChartRegistry["chartCompetenceDist"] = new Chart(document.getElementById("chartCompetenceDist"), {
        type: "bar",
        data: {
            labels: compIds.map(cid => truncate(byComp[cid].name || `ID ${cid}`, 28)),
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "bottom", labels: { color: "#475569", font: { size: 10 }, boxWidth: 12 } },
                tooltip: {
                    callbacks: {
                        title: (items) => items[0] ? items[0].label : "",
                        label: (ctx) => `${ctx.dataset.label} bodů: ${ctx.parsed.y}`
                    }
                }
            },
            scales: {
                x: { stacked: true, grid: { display: false }, ticks: { color: "#334155", font: { size: 11 } } },
                y: { stacked: true, grid: { color: "rgba(148,163,184,0.12)" }, ticks: { color: "#64748b" } }
            }
        }
    });
}

function scoreColor(p) {
    if (p <= 2) return "#dc2626";
    if (p <= 4) return "#f97316";
    if (p <= 6) return "#eab308";
    if (p <= 8) return "#22c55e";
    return "#16a34a";
}

function truncate(s, n) {
    if (!s) return "";
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// ── 8: Time trend ────────────────────────────────
function renderTimeTrend(records) {
    const buckets = {};
    records.forEach(r => {
        if (!r.date_filled) return;
        const m = r.date_filled.slice(0, 7); // YYYY-MM
        if (!buckets[m]) buckets[m] = { sum: 0, n: 0 };
        buckets[m].sum += r.total_points || 0;
        buckets[m].n += 1;
    });
    const months = Object.keys(buckets).sort();
    const avgs = months.map(m => buckets[m].n ? buckets[m].sum / buckets[m].n : 0);
    const counts = months.map(m => buckets[m].n);

    destroyChart("chartTrend");
    ChartRegistry["chartTrend"] = new Chart(document.getElementById("chartTrend"), {
        type: "line",
        data: {
            labels: months,
            datasets: [
                {
                    label: "Průměr total_points",
                    data: avgs.map(v => Number(v.toFixed(2))),
                    borderColor: "#3b82f6",
                    backgroundColor: "rgba(59,130,246,0.12)",
                    tension: 0.25,
                    fill: true,
                    yAxisID: "y"
                },
                {
                    label: "Počet hodnocení",
                    data: counts,
                    borderColor: "#94a3b8",
                    backgroundColor: "rgba(148,163,184,0.1)",
                    tension: 0.25,
                    borderDash: [4, 4],
                    yAxisID: "y1",
                    fill: false
                }
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

// ── 9: Country compare (ALL mode only) ───────────
function renderCountryCompare() {
    const allRecords = getAllResultsArray().filter(r => {
        const f = State.filters;
        if (f.form !== "ALL" && r.form_name !== f.form) return false;
        if (f.catalog !== "ALL" && r.catalog_position !== f.catalog) return false;
        if (f.branch !== "ALL" && r.system_company_branch_name !== f.branch) return false;
        if (f.manager !== "ALL" && r.manager_name !== f.manager) return false;
        return matchesSearch(r, State.search);
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
    ChartRegistry["chartCountry"] = new Chart(document.getElementById("chartCountry"), {
        type: "bar",
        data: {
            labels,
            datasets: [
                { label: "Průměr total_points", data: avgs.map(v => Number(v.toFixed(2))), backgroundColor: "rgba(59,130,246,0.7)", yAxisID: "y", borderRadius: 6 },
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

// ── 10: Histogram total_points (7 pásem po 10) ───
function renderTotalPointsHistogram(records) {
    const buckets = [0, 0, 0, 0, 0, 0, 0]; // 0-10, 11-20, 21-30, 31-40, 41-50, 51-60, 61-70
    const labels = ["1–10", "11–20", "21–30", "31–40", "41–50", "51–60", "61–70"];
    records.forEach(r => {
        const p = r.total_points;
        if (typeof p !== "number") return;
        const idx = Math.min(6, Math.max(0, Math.floor((p - 1) / 10)));
        buckets[idx] += 1;
    });

    destroyChart("chartHistogram");
    ChartRegistry["chartHistogram"] = new Chart(document.getElementById("chartHistogram"), {
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

// ── 11: Form stats table (quartiles + mean) ──────
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
                    <th>Pozice</th>
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
