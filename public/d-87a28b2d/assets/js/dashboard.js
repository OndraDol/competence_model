/* ═════════════════════════════════════════════════
   AURES Competence Model — Dashboard view
   Candidate list, filters, sortable columns, expandable detail
   with read-only competence scores from Datacruit.
   ═════════════════════════════════════════════════ */

// Sort state (local to dashboard)
const SortState = { key: "date_filled", dir: "desc" };

function toggleSort(key) {
    if (SortState.key === key) {
        SortState.dir = SortState.dir === "asc" ? "desc" : "asc";
    } else {
        SortState.key = key;
        SortState.dir = key === "date_filled" ? "desc" : "asc";
    }
    renderDashboard();
}

function sortArrow(key) {
    if (SortState.key !== key) return "";
    return SortState.dir === "asc" ? "↑" : "↓";
}

function compareBy(key) {
    const dir = SortState.dir === "asc" ? 1 : -1;
    return (a, b) => {
        const va = a[key], vb = b[key];
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
        return String(va).localeCompare(String(vb), "cs") * dir;
    };
}

// ── KPI cards for dashboard ──────────────────────
function renderDashboardKpis(records) {
    const grid = document.getElementById("kpiGrid");
    if (!grid) return;

    const count = records.length;
    const avgTotal = count ? (records.reduce((sum, r) => sum + (r.total_points || 0), 0) / count) : 0;
    const maxTotal = count ? records.reduce((m, r) => Math.max(m, r.total_points || 0), 0) : 0;

    // Most recent date_filled in current selection
    let latestDate = null;
    records.forEach(r => {
        if (!r.date_filled) return;
        if (!latestDate || r.date_filled > latestDate) latestDate = r.date_filled;
    });
    const latestDateText = latestDate ? new Date(latestDate).toLocaleDateString("cs-CZ") : "—";

    grid.innerHTML = `
        <div class="kpi-card accent-blue">
            <div class="kpi-icon"><i data-lucide="users" style="color:var(--brand-500);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Kandidátů ve výběru</div>
            <div class="kpi-value" style="color:var(--brand-600);">${count}</div>
            <div class="kpi-sub">${countryLabel()} · ${getAllResultsArray().length} celkem</div>
        </div>
        <div class="kpi-card accent-slate">
            <div class="kpi-icon"><i data-lucide="gauge" style="color:var(--text-muted);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Průměr total</div>
            <div class="kpi-value">${avgTotal.toFixed(1)}</div>
            <div class="kpi-sub">z max. 70 bodů</div>
        </div>
        <div class="kpi-card accent-green">
            <div class="kpi-icon"><i data-lucide="award" style="color:var(--accent-ok);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Nejvyšší total</div>
            <div class="kpi-value" style="color:var(--accent-ok);">${maxTotal}</div>
            <div class="kpi-sub">v aktuálním výběru</div>
        </div>
        <div class="kpi-card accent-amber">
            <div class="kpi-icon"><i data-lucide="calendar-clock" style="color:var(--accent-warn);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Nejnovější hodnocení</div>
            <div class="kpi-value" style="font-size:22px;">${latestDateText}</div>
            <div class="kpi-sub">date_filled</div>
        </div>`;
}

function countryLabel() {
    if (State.globalCountry === "ALL") return "CZ + SK + PL";
    return State.globalCountry;
}

// ── Candidate table ──────────────────────────────
function renderDashboard() {
    const records = getFilteredResults().slice().sort(compareBy(SortState.key));
    renderDashboardKpis(records);
    renderCandidateTable(records);
    if (window.lucide) lucide.createIcons();
}

function getGridColumnsTemplate() {
    if (State.globalCountry === "ALL") {
        return "minmax(220px,2fr) 90px 120px 160px 170px 140px 110px 100px";
    }
    return "minmax(240px,2fr) 130px 160px 180px 150px 120px 110px";
}

function getHeaderCells() {
    const cols = [
        { key: "candidate_fullname", label: "Kandidát" },
        ...(State.globalCountry === "ALL" ? [{ key: "country", label: "Země" }] : []),
        { key: "form_name", label: "Form" },
        { key: "catalog_position", label: "Pozice" },
        { key: "system_company_branch_name", label: "Pobočka" },
        { key: "manager_name", label: "Manažer" },
        { key: "date_filled", label: "Datum" },
        { key: "total_points", label: "Total" }
    ];
    return cols;
}

function renderCandidateTable(records) {
    const container = document.getElementById("candidatesContainer");
    if (!container) return;

    if (records.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i data-lucide="search-x"></i>
                <h4>Žádné výsledky</h4>
                <p>Nic nesplňuje aktuální kombinaci filtrů a vyhledávání.</p>
            </div>`;
        return;
    }

    const cols = getHeaderCells();
    const template = getGridColumnsTemplate();
    const header = `<div class="candidates-header" style="grid-template-columns:${template};">
        ${cols.map(c => {
            const rightAlign = c.key === "total_points";
            return `<div onclick="toggleSort('${c.key}')"${rightAlign ? ' style="justify-content:flex-end;"' : ''}>
                ${escapeHtml(c.label)} <span class="sort-arrow">${sortArrow(c.key)}</span>
            </div>`;
        }).join("")}
    </div>`;

    const rows = records.map(r => renderCandidateRow(r, template)).join("");
    container.innerHTML = `<div class="candidates-table">${header}${rows}</div>`;
}

function renderCandidateRow(r, template) {
    const isExpanded = State.expandedCandidateId === String(r.result_id);

    const countryPill = State.globalCountry === "ALL"
        ? `<div><span class="country-pill">${escapeHtml(COUNTRY_SHORT_BY_DATACRUIT[r.country] || "—")}</span></div>`
        : "";

    return `
        <div class="candidate-row ${isExpanded ? "expanded" : ""}" style="grid-template-columns:${template};"
             onclick="toggleCandidateExpand('${escapeHtml(String(r.result_id))}')">
            <div>
                <div class="candidate-name">${escapeHtml(r.candidate_fullname || "—")}</div>
                <div class="candidate-sub">${escapeHtml(r.client_branch_name || "")}</div>
            </div>
            ${countryPill}
            <div>${escapeHtml(r.form_name || "—")}</div>
            <div>${escapeHtml(r.catalog_position || "—")}</div>
            <div>${escapeHtml(r.system_company_branch_name || "—")}</div>
            <div>${escapeHtml(r.manager_name || "—")}</div>
            <div>${escapeHtml(r.date_filled || "—")}</div>
            <div class="score-cell" style="text-align:right;color:var(--brand-600);">${r.total_points ?? "—"}</div>
        </div>
        ${isExpanded ? renderCandidateDetail(r) : ""}`;
}

function toggleCandidateExpand(resultId) {
    State.expandedCandidateId = State.expandedCandidateId === resultId ? null : resultId;
    renderDashboard();
}

// ── Candidate detail (read-only) ─────────────────
function renderCandidateDetail(r) {
    const competences = (r.competences || []).slice().sort((a, b) => (a.competence_id || 0) - (b.competence_id || 0));

    const tableRows = competences.map(c => `
        <tr>
            <td class="competence-name">${escapeHtml(c.competence_name || `ID ${c.competence_id}`)}</td>
            <td style="min-width:220px;">
                <div class="score-bar">
                    <div class="score-bar-track">
                        <div class="score-bar-fill manager" style="width:${(c.points || 0) * 10}%;"></div>
                    </div>
                    <span class="score-value">${c.points ?? "—"}</span>
                </div>
            </td>
            <td style="text-align:right;color:var(--text-muted);font-size:11px;">z 10</td>
        </tr>`).join("");

    const managerCommentary = r.commentary
        ? `<div class="manager-commentary-panel"><strong>Komentář manažera:</strong> ${escapeHtml(r.commentary)}</div>`
        : "";

    const headerRow = `
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;gap:16px;flex-wrap:wrap;">
            <div>
                <h3 style="margin:0;">${escapeHtml(r.candidate_fullname || "—")}</h3>
                <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">
                    ${escapeHtml(r.catalog_position || "")} · ${escapeHtml(r.form_name || "")} · ${escapeHtml(r.date_filled || "")}
                </div>
            </div>
            <div style="font-size:13px;color:var(--text-secondary);">
                Total: <strong style="font-size:20px;color:var(--brand-600);">${r.total_points ?? "—"}</strong> / 70
            </div>
        </div>`;

    return `
        <div class="candidate-detail" onclick="event.stopPropagation();">
            ${headerRow}
            ${managerCommentary}
            <table class="competence-table">
                <thead>
                    <tr>
                        <th style="width:40%;">Kompetence</th>
                        <th style="width:50%;">Skóre manažera</th>
                        <th style="width:10%;text-align:right;"></th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>
        </div>`;
}
