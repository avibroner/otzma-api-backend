// Seed script for WhatsApp templates.
// Idempotent — only seeds if the table is empty.
// Called automatically from server.js on startup, or manually:
//   node scripts/seed-whatsapp-templates.js

const path = require("path");
const fs = require("fs");
const templatesDb = require("../lib/whatsapp-templates-db");

const SEED_FILE = path.join(__dirname, "templates-seed.json");

function run({ force = false } = {}) {
    templatesDb.init();

    const stats = templatesDb.count();
    if (stats.total > 0 && !force) {
        console.log(`[seed] skipping — table already has ${stats.total} templates (use --force to reseed)`);
        return { skipped: true, existing: stats.total };
    }

    if (!fs.existsSync(SEED_FILE)) {
        console.error(`[seed] seed file not found: ${SEED_FILE}`);
        return { error: "seed file missing" };
    }

    const raw = fs.readFileSync(SEED_FILE, "utf8");
    const templates = JSON.parse(raw);

    let inserted = 0;
    let skipped = 0;
    for (const t of templates) {
        const result = templatesDb.create({ name: t.name, body: t.body });
        if (result.error) {
            console.warn(`[seed] skipped template "${t.name}": ${result.error}`);
            skipped++;
        } else {
            inserted++;
        }
    }

    console.log(`[seed] inserted ${inserted} templates, skipped ${skipped}`);
    return { inserted, skipped };
}

// CLI entry
if (require.main === module) {
    const force = process.argv.includes("--force");
    const result = run({ force });
    if (result.error) process.exit(1);
}

module.exports = { run };
