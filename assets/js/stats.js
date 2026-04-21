/* ═════════════════════════════════════════════════
   AURES Competence Model — Stats view
   KPI cards + 11 visualisations reacting to country switch.
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
    // Stats ignores `hrStatus` filter — we want full picture including unrated.
    const recordsForStats = getFilteredResultsIgnoringHrStatus();

    host.innerHTML = renderStatsLayout();
    renderStatsKpis(recordsForStats);

    renderTopBottomTables(recordsForStats);
    renderAvgByDimension(recordsForStats);
    renderCompetenceDistribution(recordsForStats);
    renderTimeTrend(recordsForStats);
    if (State.globalCountry === "ALL") renderCountryCompare();
    renderManagerVsHr(recordsForStats);
    renderContestedTable(recordsForStats);

    if (window.lucide) lucide.createIcons();
}

function getFilteredResultsIgnoringHrStatus() {
    const needle = State.search;
    return getAllResultsArray()
        .filter(r => applyCountry(r))
        .filter(r => {
            const f = State.filters;
            if (f.form !== "ALL" && r.form_name !== f.form) return false;
            if (f.catalog !== "ALL" && r.catalog_position !== f.catalog) return false;
            if (f.branch !== "ALL" && r.system_company_branch_name !== f.branch) return false;
            if (f.manager !== "ALL" && r.manager_name !== f.manager) return false;
            if (State.globalCountry === "ALL" && f.country !== "ALL" && r.country !== f.country) return false;
            return true;
        })
        .filter(r => matchesSearch(r, needle));
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
                <div class="stats-card"><h4>TOP 10 kandidátů</h4><div class="stats-sub">Nejvyšší total_points od manažera</div><div id="topCandidatesTable"></div></div>
                <div class="stats-card"><h4>BOTTOM 10 kandidátů</h4><div class="stats-sub">Nejnižší total_points od manažera</div><div id="bottomCandidatesTable"></div></div>
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
                <div class="stats-card card-tall"><h4>Distribuce bodů per kompetence</h4><div class="stats-sub">Manažerovo hodnocení 1–10 u každého competence_id</div><canvas id="chartCompetenceDist" class="stats-chart-canvas"></canvas></div>
                <div class="stats-card"><h4>Trend průměrného total_points v čase</h4><div class="stats-sub">Měsíční agregace dle date_filled</div><canvas id="chartTrend" class="stats-chart-canvas"></canvas></div>
            </div>
        </div>

        ${countryCompareSection}

        <div class="stats-section">
            <div class="stats-section-title"><span>Manažer vs. HR</span></div>
            <div class="stats-grid-2">
                <div class="stats-card"><h4>Průměrná odchylka |M−HR| per kompetence</h4><div class="stats-sub">Jen kandidáti, kde HR vyplnil hodnocení</div><canvas id="chartDiffByCompetence" class="stats-chart-canvas"></canvas></div>
                <div class="stats-card"><h4>Sporní kandidáti (top 10 podle max |∆|)</h4><div class="stats-sub">Kde se HR nejvíc rozchází s manažerem</div><div id="contestedTable"></div></div>
            </div>
        </div>`;
}

// ── KPI cards ────────────────────────────────────
function renderStatsKpis(records) {
    const grid = document.getElementById("statsKpiGrid");
    if (!grid) return;

    const count = records.length;
    const avgTotal = count ? (records.reduce((s, r) => s + (r.total_points || 0), 0) / count) : 0;
    const hrFilled = records.filter(r => State.hrScores[r.result_id]).length;
    const hrPct = count ? Math.round((hrFilled / count) * 100) : 0;

    let deltaSum = 0, deltaCount = 0;
    records.forEach(r => {
        const hr = State.hrScores[r.result_id];
        if (!hr) return;
        (r.competences || []).forEach(c => {
            const hrPts = hr.perCompetence ? hr.perCompetence[c.competence_id] : undefined;
            if (typeof hrPts === "number" && typeof c.points === "number") {
                deltaSum += Math.abs(hrPts - c.points);
                deltaCount++;
            }
        });
    });
    const avgDelta = deltaCount ? (deltaSum / deltaCount) : 0;
    const agreement = deltaCount ? Math.max(0, 1 - (avgDelta / 9)) : 0; // scaled to 0..1 (max delta is 9)

    const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
    const thisWeek = records.filter(r => {
        if (!r.date_filled) return false;
        return new Date(r.date_filled).getTime() >= sevenDaysAgo;
    }).length;

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
            <div class="kpi-label">Průměr total (manager)</div>
            <div class="kpi-value">${avgTotal.toFixed(1)}</div>
            <div class="kpi-sub">z max. 70</div>
        </div>
        <div class="kpi-card accent-green">
            <div class="kpi-icon"><i data-lucide="check-circle-2" style="color:var(--accent-ok);width:18px;height:18px;"></i></div>
            <div class="kpi-label">% s HR hodnocením</div>
            <div class="kpi-value" style="color:var(--accent-ok);">${hrPct}%</div>
            <div class="kpi-sub">${hrFilled} z ${count}</div>
        </div>
        <div class="kpi-card accent-amber">
            <div class="kpi-icon"><i data-lucide="handshake" style="color:var(--accent-warn);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Shoda M ↔ HR</div>
            <div class="kpi-value" style="color:#b45309;">${Math.round(agreement * 100)}%</div>
            <div class="kpi-sub">průměrná odchylka ${avgDelta.toFixed(2)}</div>
        </div>
        <div class="kpi-card accent-blue">
            <div class="kpi-icon"><i data-lucide="calendar-clock" style="color:var(--brand-500);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Tento týden</div>
            <div class="kpi-value" style="color:var(--brand-600);">${thisWeek}</div>
            <div class="kpi-sub">nových hodnocení</div>
        </div>
        <div class="kpi-card accent-slate">
            <div class="kpi-icon"><i data-lucide="star" style="color:#a16207;width:18px;height:18px;"></i></div>
            <div class="kpi-label">Nejaktivnější manažer</div>
            <div class="kpi-value" style="font-size:18px;line-height:1.3;">${escapeHtml(topManager[0])}</div>
            <div class="kpi-sub">${topManager[1]} hodnocení</div>
        </div>`;
}

// ── 1+2: Top/Bottom candidate tables ─────────────
function renderTopBottomTables(records) {
    const sorted = records.slice().sort((a, b) => (b.total_points || 0) - (a.total_points || 0));
    const top = sorted.slice(0, 10);
    const bottom = sorted.slice(-10).reverse(); // lowest first becomes bottom list

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
    // 3. form_name — vertical bar
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
        options: chartOptions({ suggestedMax: 70, barCount: byForm.length, showCountTooltip: byForm }),
    });

    // 4. branch — horizontal TOP 10
    renderHorizontalBarTop10("chartByBranch", groupAvg(records, "system_company_branch_name", 3), "#10b981");

    // 5. manager — horizontal TOP 10 (min 3)
    renderHorizontalBarTop10("chartByManager", groupAvg(records, "manager_name", 3), "#f59e0b");

    // 6. client_branch — horizontal TOP 10 (min 3)
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

// ── 7: Competence distribution ───────────────────
function renderCompetenceDistribution(records) {
    // Collect per-competence distribution of points 1..10
    const byComp = {}; // { [competence_id]: { name, distribution: {1..10: count} } }
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
    const palette = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#0ea5e9", "#22c55e", "#eab308", "#f97316", "#64748b"];
    // Stacked: x-axis = competence, colors = points 1..10
    // Build one dataset per point value
    for (let p = 1; p <= 10; p++) {
        datasets.push({
            label: `${p} bod${p === 1 ? "" : (p < 5 ? "y" : "ů")}`,
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
                legend: { position: "bottom", labels: { color: "#475569", font: { size: 10 } } }
            },
            scales: {
                x: { stacked: true, grid: { display: false }, ticks: { color: "#334155", font: { size: 11 } } },
                y: { stacked: true, grid: { color: "rgba(148,163,184,0.12)" }, ticks: { color: "#64748b" } }
            }
        }
    });
}

function scoreColor(p) {
    // 1..3 red, 4..6 amber, 7..10 green gradient
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
    // Monthly aggregation
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
    // Use full dataset filtered ignoring country (we want all three visible)
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

// ── 10: Manager vs HR diff per competence ────────
function renderManagerVsHr(records) {
    // avg |manager - HR| per competence_id
    const comp = {}; // { id: { name, sum, n } }
    records.forEach(r => {
        const hr = State.hrScores[r.result_id];
        if (!hr || !hr.perCompetence) return;
        (r.competences || []).forEach(c => {
            const hrPts = hr.perCompetence[c.competence_id];
            if (typeof hrPts !== "number" || typeof c.points !== "number") return;
            if (!comp[c.competence_id]) comp[c.competence_id] = { name: c.competence_name, sum: 0, n: 0 };
            comp[c.competence_id].sum += Math.abs(hrPts - c.points);
            comp[c.competence_id].n += 1;
        });
    });
    const compIds = Object.keys(comp).map(Number).sort((a, b) => a - b);
    const labels = compIds.map(cid => truncate(comp[cid].name || `ID ${cid}`, 26));
    const values = compIds.map(cid => comp[cid].n ? comp[cid].sum / comp[cid].n : 0);
    const counts = compIds.map(cid => comp[cid].n);

    destroyChart("chartDiffByCompetence");
    ChartRegistry["chartDiffByCompetence"] = new Chart(document.getElementById("chartDiffByCompetence"), {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Ø |Manager − HR|",
                data: values.map(v => Number(v.toFixed(2))),
                backgroundColor: values.map(v => v >= 3 ? "rgba(239,68,68,0.7)" : v >= 2 ? "rgba(245,158,11,0.7)" : "rgba(16,185,129,0.7)"),
                borderRadius: 6
            }]
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => `${values[ctx.dataIndex].toFixed(2)} (n=${counts[ctx.dataIndex]})` } }
            },
            scales: {
                x: { beginAtZero: true, suggestedMax: 6, grid: { color: "rgba(148,163,184,0.12)" }, ticks: { color: "#64748b" } },
                y: { grid: { display: false }, ticks: { color: "#334155", font: { size: 11 } } }
            }
        }
    });
}

// ── 11: Contested candidates table ───────────────
function renderContestedTable(records) {
    const rows = [];
    records.forEach(r => {
        const hr = State.hrScores[r.result_id];
        if (!hr || !hr.perCompetence) return;
        let maxDelta = 0;
        let sumDelta = 0;
        let n = 0;
        (r.competences || []).forEach(c => {
            const hrPts = hr.perCompetence[c.competence_id];
            if (typeof hrPts !== "number" || typeof c.points !== "number") return;
            const d = Math.abs(hrPts - c.points);
            if (d > maxDelta) maxDelta = d;
            sumDelta += d;
            n++;
        });
        if (n > 0 && maxDelta >= 2) {
            rows.push({ r, maxDelta, avgDelta: sumDelta / n });
        }
    });
    rows.sort((a, b) => b.maxDelta - a.maxDelta || b.avgDelta - a.avgDelta);

    const host = document.getElementById("contestedTable");
    if (!host) return;
    if (!rows.length) {
        host.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:8px;">Žádní sporní kandidáti — buď ještě chybí HR hodnocení, nebo se všichni shodují.</p>`;
        return;
    }
    const top = rows.slice(0, 10);
    host.innerHTML = `
        <table class="stats-table">
            <thead><tr><th>#</th><th>Kandidát</th><th>Pozice</th><th class="num">Max ∆</th><th class="num">Ø ∆</th></tr></thead>
            <tbody>
                ${top.map((row, i) => `
                    <tr>
                        <td><span class="rank-badge">${i + 1}</span></td>
                        <td><strong>${escapeHtml(row.r.candidate_fullname || "—")}</strong><div style="font-size:11px;color:var(--text-muted);">${escapeHtml(row.r.manager_name || "")} → HR</div></td>
                        <td>${escapeHtml(row.r.catalog_position || "—")}</td>
                        <td class="num"><span class="diff-badge ${diffClass(row.maxDelta)}">${row.maxDelta}</span></td>
                        <td class="num">${row.avgDelta.toFixed(2)}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>`;
}
