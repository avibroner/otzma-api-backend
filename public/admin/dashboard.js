let lastEvents = [];

function fmtTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function shortId(id, len = 8) {
    if (!id) return "";
    return id.length > len ? id.slice(0, len) + "…" : id;
}

function statusBadge(status, eventType) {
    if (!status) {
        if (eventType === "iframe_loaded") return '<span class="badge badge-evt">loaded</span>';
        if (eventType === "frontend_error") return '<span class="badge badge-5xx">JS error</span>';
        if (eventType === "save_error") return '<span class="badge badge-5xx">save error</span>';
        return '<span class="badge badge-evt">—</span>';
    }
    const cls = status >= 500 ? "badge-5xx" : status >= 400 ? "badge-4xx" : "badge-2xx";
    return `<span class="badge ${cls}">${status}</span>`;
}

function rowClass(e) {
    if (e.event_type === "frontend_error") return "row-frontend-error";
    if (e.event_type === "save_error") return "row-save-error";
    if (e.is_orphan) return "row-orphan";
    if (e.is_validation_failure) return "row-validation";
    if (e.event_type === "iframe_loaded") return "row-iframe-loaded";
    if (e.response_status >= 500) return "row-5xx";
    if (e.response_status >= 400) return "row-4xx";
    if (e.response_status >= 200) return "row-2xx";
    return "";
}

function flagsForRow(e) {
    const out = [];
    if (e.is_orphan) out.push('<span class="badge badge-orphan">ORPHAN</span>');
    if (e.is_validation_failure) out.push('<span class="badge badge-vfail">VALIDATION</span>');
    return out.join(" ");
}

function pathOrEvent(e) {
    if (e.event_type === "api_call") return e.path || "";
    return `<em>${e.event_type}</em>`;
}

async function loadEvents() {
    const params = new URLSearchParams();
    const acc = document.getElementById("f-account").value.trim();
    const sess = document.getElementById("f-session").value.trim();
    const evt = document.getElementById("f-event").value;
    const path = document.getElementById("f-path").value.trim();
    if (acc) params.set("account_id", acc);
    if (sess) params.set("session_id", sess);
    if (evt) params.set("event_type", evt);
    if (path) params.set("path", path);
    if (document.getElementById("f-orphan").checked) params.set("orphan", "1");
    if (document.getElementById("f-vfail").checked) params.set("validation_failure", "1");
    if (document.getElementById("f-error").checked) params.set("error", "1");
    params.set("limit", "200");

    const tbody = document.getElementById("tbody");
    tbody.innerHTML = '<tr><td colspan="10" class="empty">טוען...</td></tr>';

    try {
        const res = await fetch("/api/admin/events?" + params.toString());
        if (!res.ok) throw new Error("HTTP " + res.status);
        const { events } = await res.json();
        lastEvents = events;

        if (events.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="empty">אין events לפי הפילטרים האלה</td></tr>';
            return;
        }

        tbody.innerHTML = events.map((e, i) => `
            <tr class="${rowClass(e)}" onclick="openDrawer(${i})">
                <td class="mono" style="white-space:nowrap;">${fmtTime(e.ts)}</td>
                <td>${e.event_type}</td>
                <td class="mono truncate" title="${e.account_id || ''}">${shortId(e.account_id, 12)}</td>
                <td class="mono truncate" title="${e.session_id || ''}">${shortId(e.session_id, 8)}</td>
                <td class="mono">${e.method || ''}</td>
                <td class="mono truncate" title="${e.path || e.event_type}">${pathOrEvent(e)}</td>
                <td>${statusBadge(e.response_status, e.event_type)}</td>
                <td>${flagsForRow(e)}</td>
                <td class="mono truncate" title="${e.fireberry_record_id || ''}">${shortId(e.fireberry_record_id, 12)}</td>
                <td class="mono">${e.duration_ms ?? ''}</td>
            </tr>
        `).join("");
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="10" class="empty">שגיאה בטעינה: ${err.message}</td></tr>`;
    }
}

async function loadStats() {
    try {
        const res = await fetch("/api/admin/stats");
        if (!res.ok) return;
        const { stats } = await res.json();
        const el = document.getElementById("stats");
        el.innerHTML = `
            <span><span class="num">${stats.total || 0}</span>events / 7 days</span>
            <span><span class="num">${stats.api_calls || 0}</span>api</span>
            <span><span class="num">${stats.iframe_loads || 0}</span>iframe loads</span>
            <span class="err"><span class="num">${stats.server_errors || 0}</span>5xx</span>
            <span class="err"><span class="num">${stats.client_errors || 0}</span>4xx</span>
            <span class="err"><span class="num">${stats.frontend_errors || 0}</span>JS errors</span>
            <span class="orphan"><span class="num">${stats.orphans || 0}</span>orphans</span>
        `;
    } catch (err) { /* ignore */ }
}

function openDrawer(idx) {
    const e = lastEvents[idx];
    if (!e) return;

    const fields = [
        ["timestamp", e.ts],
        ["event_type", e.event_type],
        ["session_id", e.session_id, e.session_id ? `<span class="session-link" onclick="filterBySession('${e.session_id}')">צפה בכל הסשן ›</span>` : null],
        ["account_id", e.account_id, e.account_id ? `<span class="session-link" onclick="filterByAccount('${e.account_id}')">צפה בכל הלקוח ›</span>` : null],
        ["user_id", e.user_id],
        ["source_url", e.source_url],
        ["user_agent", e.user_agent],
        ["ip", e.ip],
        ["method", e.method],
        ["path", e.path],
        ["response_status", e.response_status],
        ["fireberry_record_id", e.fireberry_record_id],
        ["duration_ms", e.duration_ms],
        ["is_orphan", e.is_orphan ? "✅ YES" : "no"],
        ["is_validation_failure", e.is_validation_failure ? "✅ YES" : "no"],
        ["error_message", e.error_message]
    ];

    let html = fields.filter(([k, v]) => v !== null && v !== undefined && v !== "").map(([k, v, extra]) => `
        <div class="field">
            <div class="field-label">${k}</div>
            <div class="field-value">${escapeHtml(String(v))} ${extra || ''}</div>
        </div>
    `).join("");

    if (e.request_body) {
        html += `<div class="field"><div class="field-label">request_body</div><div class="json-block">${formatJson(e.request_body)}</div></div>`;
    }
    if (e.response_body) {
        html += `<div class="field"><div class="field-label">response_body</div><div class="json-block">${formatJson(e.response_body)}</div></div>`;
    }
    if (e.error_stack) {
        html += `<div class="field"><div class="field-label">error_stack</div><div class="json-block">${escapeHtml(e.error_stack)}</div></div>`;
    }

    document.getElementById("drawer-title").textContent = `Event #${e.id} — ${e.event_type}`;
    document.getElementById("drawer-content").innerHTML = html;
    document.getElementById("drawer").classList.add("open");
}

function closeDrawer() {
    document.getElementById("drawer").classList.remove("open");
}

function filterBySession(sessionId) {
    document.getElementById("f-session").value = sessionId;
    document.getElementById("f-account").value = "";
    closeDrawer();
    loadEvents();
}

function filterByAccount(accountId) {
    document.getElementById("f-account").value = accountId;
    document.getElementById("f-session").value = "";
    closeDrawer();
    loadEvents();
}

function clearFilters() {
    document.getElementById("f-account").value = "";
    document.getElementById("f-session").value = "";
    document.getElementById("f-event").value = "";
    document.getElementById("f-path").value = "";
    document.getElementById("f-orphan").checked = false;
    document.getElementById("f-vfail").checked = false;
    document.getElementById("f-error").checked = false;
    loadEvents();
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function formatJson(raw) {
    if (!raw) return "";
    try {
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
        return escapeHtml(JSON.stringify(obj, null, 2));
    } catch (err) {
        return escapeHtml(String(raw));
    }
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrawer();
});

loadEvents();
loadStats();
setInterval(loadStats, 30000);
