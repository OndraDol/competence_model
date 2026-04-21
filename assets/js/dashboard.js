/* ═════════════════════════════════════════════════
   AURES Competence Model — Dashboard view
   Candidate list, filters, sortable columns, expandable detail
   with inline HR scoring (debounced → Firebase).
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
    const hrFilled = records.filter(r => State.hrScores[r.result_id]).length;
    const hrPct = count ? Math.round((hrFilled / count) * 100) : 0;

    let deltaSum = 0, deltaCount = 0, contestedCount = 0;
    records.forEach(r => {
        const hr = State.hrScores[r.result_id];
        if (!hr) return;
        (r.competences || []).forEach(c => {
            const managerPts = c.points;
            const hrPts = hr.perCompetence ? hr.perCompetence[c.competence_id] : undefined;
            if (typeof managerPts === "number" && typeof hrPts === "number") {
                const d = Math.abs(managerPts - hrPts);
                deltaSum += d;
                deltaCount++;
                if (d >= 3) contestedCount++;
            }
        });
    });
    const avgDelta = deltaCount ? (deltaSum / deltaCount) : 0;

    grid.innerHTML = `
        <div class="kpi-card accent-blue">
            <div class="kpi-icon"><i data-lucide="users" style="color:var(--brand-500);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Kandidátů ve výběru</div>
            <div class="kpi-value" style="color:var(--brand-600);">${count}</div>
            <div class="kpi-sub">${countryLabel()} · ${getAllResultsArray().length} celkem</div>
        </div>
        <div class="kpi-card accent-slate">
            <div class="kpi-icon"><i data-lucide="gauge" style="color:var(--text-muted);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Průměr total (manager)</div>
            <div class="kpi-value">${avgTotal.toFixed(1)}</div>
            <div class="kpi-sub">z max. 70 bodů</div>
        </div>
        <div class="kpi-card accent-green">
            <div class="kpi-icon"><i data-lucide="check-circle-2" style="color:var(--accent-ok);width:18px;height:18px;"></i></div>
            <div class="kpi-label">HR ohodnoceno</div>
            <div class="kpi-value" style="color:var(--accent-ok);">${hrFilled}</div>
            <div class="kpi-sub">${hrPct}% z výběru</div>
        </div>
        <div class="kpi-card accent-amber">
            <div class="kpi-icon"><i data-lucide="git-compare" style="color:var(--accent-warn);width:18px;height:18px;"></i></div>
            <div class="kpi-label">Průměrná odchylka ∅|M−HR|</div>
            <div class="kpi-value" style="color:#b45309;">${avgDelta.toFixed(2)}</div>
            <div class="kpi-sub">${contestedCount} sporných (∆ ≥ 3)</div>
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
    // country col only in ALL mode
    if (State.globalCountry === "ALL") {
        return "minmax(200px,2fr) 100px 120px 150px 160px 130px 110px 100px 120px 90px 40px";
    }
    return "minmax(220px,2fr) 120px 150px 160px 160px 130px 110px 100px 120px 40px";
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
        { key: "total_points", label: "M total" },
        { key: "_hrTotal", label: "HR total" },
        { key: "_delta", label: "∆" },
        { key: "_hrStatus", label: "" }
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
            const isSortable = !c.key.startsWith("_") || c.key === "_hrTotal" || c.key === "_delta";
            if (!isSortable) return `<div>${escapeHtml(c.label)}</div>`;
            return `<div onclick="toggleSort('${c.key}')"${c.key.endsWith("total_points") || c.key === "_hrTotal" || c.key === "_delta" ? ' style="justify-content:flex-end;"' : ''}>
                ${escapeHtml(c.label)} <span class="sort-arrow">${sortArrow(c.key)}</span>
            </div>`;
        }).join("")}
    </div>`;

    const rows = records.map(r => renderCandidateRow(r, template)).join("");

    container.innerHTML = `<div class="candidates-table">${header}${rows}</div>`;
}

function renderCandidateRow(r, template) {
    const hr = State.hrScores[r.result_id];
    const hrTotal = hr ? (typeof hr.totalPoints === "number" ? hr.totalPoints : computeTotalPoints(hr.perCompetence)) : null;
    const delta = hrTotal != null ? (hrTotal - (r.total_points || 0)) : null;
    const isExpanded = State.expandedCandidateId === r.result_id;

    const countryPill = State.globalCountry === "ALL"
        ? `<div><span class="country-pill">${escapeHtml(COUNTRY_SHORT_BY_DATACRUIT[r.country] || "—")}</span></div>`
        : "";

    const rowHtml = `
        <div class="candidate-row ${isExpanded ? "expanded" : ""}" style="grid-template-columns:${template};"
             onclick="toggleCandidateExpand('${escapeHtml(r.result_id)}')">
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
            <div class="score-cell" style="text-align:right;">${r.total_points ?? "—"}</div>
            <div class="score-cell" style="text-align:right;color:${hrTotal != null ? 'var(--brand-600)' : 'var(--text-muted)'};">${hrTotal != null ? hrTotal : "—"}</div>
            <div style="text-align:right;">${delta != null ? renderDiffBadge(delta) : '<span style="color:var(--text-muted);">—</span>'}</div>
            <div style="text-align:center;"><span class="hr-status-dot ${hr ? 'filled' : 'empty'}" title="${hr ? 'HR vyplněno' : 'HR nevyplněno'}"></span></div>
        </div>
        ${isExpanded ? renderCandidateDetail(r) : ""}`;
    return rowHtml;
}

function renderDiffBadge(delta) {
    const sign = delta > 0 ? "+" : (delta < 0 ? "" : "±");
    return `<span class="diff-badge ${diffClass(delta)}">${sign}${delta}</span>`;
}

function toggleCandidateExpand(resultId) {
    State.expandedCandidateId = State.expandedCandidateId === resultId ? null : resultId;
    renderDashboard();
}

// ── Candidate detail ─────────────────────────────
function renderCandidateDetail(r) {
    const hr = State.hrScores[r.result_id] || null;
    const competences = (r.competences || []).slice().sort((a, b) => (a.competence_id || 0) - (b.competence_id || 0));

    const tableRows = competences.map(c => {
        const managerPts = c.points;
        const hrPts = hr && hr.perCompetence ? hr.perCompetence[c.competence_id] : undefined;
        const delta = typeof hrPts === "number" ? (hrPts - managerPts) : null;

        return `
            <tr>
                <td class="competence-name">${escapeHtml(c.competence_name || `ID ${c.competence_id}`)}</td>
                <td style="min-width:180px;">
                    <div class="score-bar">
                        <div class="score-bar-track">
                            <div class="score-bar-fill manager" style="width:${(managerPts || 0) * 10}%;"></div>
                        </div>
                        <span class="score-value">${managerPts ?? "—"}</span>
                    </div>
                </td>
                <td>
                    <input type="number" min="1" max="10" step="1"
                           class="hr-score-input ${hrPts == null ? 'empty' : ''}"
                           value="${hrPts != null ? hrPts : ''}"
                           data-result-id="${escapeHtml(r.result_id)}"
                           data-competence-id="${c.competence_id}"
                           onclick="event.stopPropagation();"
                           oninput="onHrInputChange(event)" />
                </td>
                <td style="text-align:right;min-width:60px;">
                    ${delta != null ? renderDiffBadge(delta) : '<span class="diff-badge diff-zero">—</span>'}
                </td>
            </tr>`;
    }).join("");

    const metaBy = hr && hr.updatedBy ? `<span>Poslední úprava: <strong>${escapeHtml(hr.updatedBy)}</strong></span>` : `<span>Bez HR hodnocení</span>`;
    const metaAt = hr && hr.updatedAt ? `<span>${new Date(hr.updatedAt).toLocaleString("cs-CZ")}</span>` : "";
    const statusSlot = `<span data-meta-status="${escapeHtml(r.result_id)}"></span>`;

    const managerCommentary = r.commentary
        ? `<div class="manager-commentary-panel"><strong>Komentář manažera:</strong> ${escapeHtml(r.commentary)}</div>`
        : "";

    return `
        <div class="candidate-detail" onclick="event.stopPropagation();">
            ${managerCommentary}
            <h3>Kompetenční hodnocení</h3>
            <table class="competence-table">
                <thead>
                    <tr>
                        <th style="width:26%;">Kompetence</th>
                        <th style="width:38%;">Manažer</th>
                        <th style="width:18%;">HR konzultant (1–10)</th>
                        <th style="width:18%;text-align:right;">∆ HR − M</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
            </table>

            <h3 style="margin-top:18px;">HR komentář</h3>
            <textarea class="hr-commentary"
                      placeholder="Zaznamenejte názor HR konzultanta…"
                      data-result-id="${escapeHtml(r.result_id)}"
                      onclick="event.stopPropagation();"
                      oninput="onHrCommentaryChange(event)">${escapeHtml(hr ? hr.commentary || "" : "")}</textarea>

            <div class="detail-meta">
                ${metaBy}
                ${metaAt}
                ${statusSlot}
            </div>
        </div>`;
}

// ── Input handlers (wired to core.saveHrScore) ───
function onHrInputChange(event) {
    const el = event.target;
    const resultId = el.dataset.resultId;
    const competenceId = el.dataset.competenceId;
    const raw = el.value;

    // Allow empty — treat as unset (skip save).
    if (raw === "" || raw == null) return;

    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1 || n > 10) {
        el.style.borderColor = "var(--accent-danger)";
        return;
    }
    el.style.borderColor = "";
    el.classList.remove("empty");

    const perCompetence = {};
    perCompetence[competenceId] = Math.round(n);
    saveHrScore(resultId, { perCompetence });
}

function onHrCommentaryChange(event) {
    const el = event.target;
    const resultId = el.dataset.resultId;
    saveHrScore(resultId, { commentary: el.value });
}
