const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

let db = null;

const DB_PATH = process.env.WHATSAPP_DB_PATH || path.join(__dirname, "..", "data", "whatsapp.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  body TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_templates_active ON whatsapp_templates(is_active) WHERE is_active = 1;
`;

const MAX_BODY_LEN = 4096;
const MAX_NAME_LEN = 100;

function init() {
    if (db) return db;

    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.exec(SCHEMA);

    console.log(`[whatsapp-templates] DB ready at ${DB_PATH}`);
    return db;
}

function getDb() {
    if (!db) init();
    return db;
}

function validateBody(body) {
    if (typeof body !== "string") return "תוכן ההודעה חייב להיות טקסט";
    const trimmed = body.trim();
    if (trimmed.length === 0) return "תוכן ההודעה לא יכול להיות ריק";
    if (trimmed.length > MAX_BODY_LEN) return `תוכן ההודעה חורג מ-${MAX_BODY_LEN} תווים`;
    return null;
}

function validateName(name) {
    if (name === null || name === undefined) return null;
    if (typeof name !== "string") return "שם התבנית חייב להיות טקסט";
    if (name.length > MAX_NAME_LEN) return `שם התבנית חורג מ-${MAX_NAME_LEN} תווים`;
    return null;
}

function listAll() {
    return getDb().prepare(`
        SELECT id, name, body, is_active, created_at
        FROM whatsapp_templates
        ORDER BY id DESC
    `).all();
}

function getRandom() {
    return getDb().prepare(`
        SELECT id, name, body
        FROM whatsapp_templates
        WHERE is_active = 1
        ORDER BY RANDOM()
        LIMIT 1
    `).get() || null;
}

function create({ name, body }) {
    const bodyError = validateBody(body);
    if (bodyError) return { error: bodyError };

    const nameError = validateName(name);
    if (nameError) return { error: nameError };

    const trimmedName = name ? name.trim() : null;
    const trimmedBody = body.trim();

    const result = getDb().prepare(`
        INSERT INTO whatsapp_templates (name, body, is_active)
        VALUES (?, ?, 1)
    `).run(trimmedName || null, trimmedBody);

    return {
        template: {
            id: result.lastInsertRowid,
            name: trimmedName,
            body: trimmedBody,
            is_active: 1
        }
    };
}

function deactivate(id) {
    const result = getDb().prepare(`
        UPDATE whatsapp_templates
        SET is_active = 0
        WHERE id = ? AND is_active = 1
    `).run(id);

    return { changed: result.changes > 0 };
}

function count() {
    return getDb().prepare(`
        SELECT
            COUNT(*) AS total,
            SUM(is_active) AS active
        FROM whatsapp_templates
    `).get();
}

module.exports = {
    init,
    listAll,
    getRandom,
    create,
    deactivate,
    count,
    DB_PATH,
    MAX_BODY_LEN,
    MAX_NAME_LEN
};
