const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

let db = null;

const DB_PATH = process.env.LOG_DB_PATH || path.join(__dirname, "..", "logs", "activity.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  event_type TEXT NOT NULL,
  session_id TEXT,
  account_id TEXT,
  user_id TEXT,
  source_url TEXT,
  user_agent TEXT,
  ip TEXT,
  method TEXT,
  path TEXT,
  request_body TEXT,
  response_status INTEGER,
  response_body TEXT,
  fireberry_record_id TEXT,
  duration_ms INTEGER,
  error_message TEXT,
  error_stack TEXT,
  is_orphan INTEGER DEFAULT 0,
  is_validation_failure INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_account_id ON events(account_id);
CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_path ON events(path);
CREATE INDEX IF NOT EXISTS idx_events_orphan ON events(is_orphan) WHERE is_orphan = 1;
CREATE INDEX IF NOT EXISTS idx_events_validation_failure ON events(is_validation_failure) WHERE is_validation_failure = 1;
`;

const MAX_BODY_LEN = 4096;

function truncate(value) {
    if (value === null || value === undefined) return null;
    const str = typeof value === "string" ? value : safeStringify(value);
    if (str.length <= MAX_BODY_LEN) return str;
    return str.slice(0, MAX_BODY_LEN) + "...[truncated]";
}

function safeStringify(value) {
    try {
        return JSON.stringify(value);
    } catch (err) {
        return String(value);
    }
}

function init() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.exec(SCHEMA);

    console.log(`[logger] activity DB ready at ${DB_PATH}`);
    return db;
}

function getDb() {
    if (!db) init();
    return db;
}

const insertStmt = () => getDb().prepare(`
    INSERT INTO events (
        ts, event_type, session_id, account_id, user_id,
        source_url, user_agent, ip, method, path,
        request_body, response_status, response_body, fireberry_record_id, duration_ms,
        error_message, error_stack, is_orphan, is_validation_failure
    ) VALUES (
        @ts, @event_type, @session_id, @account_id, @user_id,
        @source_url, @user_agent, @ip, @method, @path,
        @request_body, @response_status, @response_body, @fireberry_record_id, @duration_ms,
        @error_message, @error_stack, @is_orphan, @is_validation_failure
    )
`);

function logApiCall(entry) {
    try {
        insertStmt().run({
            ts: new Date().toISOString(),
            event_type: "api_call",
            session_id: entry.session_id || null,
            account_id: entry.account_id || null,
            user_id: entry.user_id || null,
            source_url: entry.source_url || null,
            user_agent: entry.user_agent || null,
            ip: entry.ip || null,
            method: entry.method || null,
            path: entry.path || null,
            request_body: truncate(entry.request_body),
            response_status: entry.response_status ?? null,
            response_body: truncate(entry.response_body),
            fireberry_record_id: entry.fireberry_record_id || null,
            duration_ms: entry.duration_ms ?? null,
            error_message: null,
            error_stack: null,
            is_orphan: entry.is_orphan ? 1 : 0,
            is_validation_failure: entry.is_validation_failure ? 1 : 0
        });
    } catch (err) {
        console.error("[logger] failed to write api_call:", err.message);
    }
}

function logFrontendEvent(entry) {
    try {
        insertStmt().run({
            ts: new Date().toISOString(),
            event_type: entry.event_type || "frontend_event",
            session_id: entry.session_id || null,
            account_id: entry.account_id || null,
            user_id: entry.user_id || null,
            source_url: entry.source_url || null,
            user_agent: entry.user_agent || null,
            ip: entry.ip || null,
            method: null,
            path: null,
            request_body: truncate(entry.payload),
            response_status: null,
            response_body: null,
            fireberry_record_id: null,
            duration_ms: null,
            error_message: entry.error_message || null,
            error_stack: truncate(entry.error_stack),
            is_orphan: 0,
            is_validation_failure: 0
        });
    } catch (err) {
        console.error("[logger] failed to write frontend event:", err.message);
    }
}

function query({ filters = {}, limit = 100, offset = 0 } = {}) {
    const where = [];
    const params = {};

    if (filters.account_id) { where.push("account_id = @account_id"); params.account_id = filters.account_id; }
    if (filters.session_id) { where.push("session_id = @session_id"); params.session_id = filters.session_id; }
    if (filters.event_type) { where.push("event_type = @event_type"); params.event_type = filters.event_type; }
    if (filters.path) { where.push("path = @path"); params.path = filters.path; }
    if (filters.from) { where.push("ts >= @from"); params.from = filters.from; }
    if (filters.to) { where.push("ts <= @to"); params.to = filters.to; }
    if (filters.orphan) { where.push("is_orphan = 1"); }
    if (filters.validation_failure) { where.push("is_validation_failure = 1"); }
    if (filters.error) { where.push("(response_status >= 400 OR error_message IS NOT NULL OR is_orphan = 1 OR is_validation_failure = 1)"); }

    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    params.limit = Math.min(Number(limit) || 100, 500);
    params.offset = Number(offset) || 0;

    const sql = `
        SELECT * FROM events
        ${whereClause}
        ORDER BY id DESC
        LIMIT @limit OFFSET @offset
    `;

    return getDb().prepare(sql).all(params);
}

function getSessions({ limit = 50 } = {}) {
    const sql = `
        SELECT
            session_id,
            account_id,
            MIN(ts) AS first_ts,
            MAX(ts) AS last_ts,
            COUNT(*) AS event_count,
            SUM(CASE WHEN response_status >= 400 THEN 1 ELSE 0 END) AS error_count,
            SUM(is_orphan) AS orphan_count,
            SUM(is_validation_failure) AS validation_failures
        FROM events
        WHERE session_id IS NOT NULL
        GROUP BY session_id
        ORDER BY last_ts DESC
        LIMIT @limit
    `;
    return getDb().prepare(sql).all({ limit: Math.min(Number(limit) || 50, 200) });
}

function stats() {
    return getDb().prepare(`
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN event_type = 'api_call' THEN 1 ELSE 0 END) AS api_calls,
            SUM(CASE WHEN event_type = 'iframe_loaded' THEN 1 ELSE 0 END) AS iframe_loads,
            SUM(CASE WHEN event_type = 'frontend_error' THEN 1 ELSE 0 END) AS frontend_errors,
            SUM(CASE WHEN response_status >= 500 THEN 1 ELSE 0 END) AS server_errors,
            SUM(CASE WHEN response_status >= 400 AND response_status < 500 THEN 1 ELSE 0 END) AS client_errors,
            SUM(is_orphan) AS orphans,
            SUM(is_validation_failure) AS validation_failures
        FROM events
        WHERE ts >= datetime('now', '-7 days')
    `).get();
}

function cleanup(daysToKeep = 90) {
    const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000).toISOString();
    const result = getDb().prepare(`DELETE FROM events WHERE ts < ?`).run(cutoff);
    console.log(`[logger] cleanup removed ${result.changes} events older than ${daysToKeep} days`);
    return result.changes;
}

module.exports = {
    init,
    logApiCall,
    logFrontendEvent,
    query,
    getSessions,
    stats,
    cleanup,
    DB_PATH
};
