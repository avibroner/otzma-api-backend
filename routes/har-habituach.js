const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const router = express.Router();
const { postRequest, getRequest } = require("../lib/fireberry");
const { parseExcel } = require("../lib/excel-parser");
const {
    searchPerson,
    fetchFieldOptions,
    deleteInsuranceMountain,
    createInsuranceRecord,
    updatePremiumSummary,
    buildUnmappedRecord,
    notifyUnmappedBranches,
} = require("../lib/har-habituach-helpers");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Otzma2026!";
const MAPPING_FILE = path.join(__dirname, "..", "data", "buffer-mapping.json");
const LOG_FILE = path.join(__dirname, "..", "data", "upload-log.json");
const SESSIONS = new Map(); // token → expiry

// Load buffer mapping from file
function loadMapping() {
    try {
        if (fs.existsSync(MAPPING_FILE)) {
            return JSON.parse(fs.readFileSync(MAPPING_FILE, "utf8"));
        }
    } catch {}
    return {};
}

// Save buffer mapping to file
function saveMapping(mapping) {
    const dir = path.dirname(MAPPING_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(MAPPING_FILE, JSON.stringify(mapping, null, 2), "utf8");
}

let bufferMapping = loadMapping();

// Upload log helpers
function loadLogs() {
    try {
        if (fs.existsSync(LOG_FILE)) return JSON.parse(fs.readFileSync(LOG_FILE, "utf8"));
    } catch {}
    return [];
}

function appendLog(entry) {
    const logs = loadLogs();
    logs.unshift(entry); // newest first
    if (logs.length > 200) logs.length = 200;
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2), "utf8");
}

// Middleware: check Fireberry referer for upload pages
function requireFireberry(req, res, next) {
    const referer = req.headers.referer || req.headers.origin || "";
    if (referer.includes("fireberry.com") || referer.includes("powerlink.co.il") || referer.includes("otzma-ins.co.il") || referer.includes("localhost")) {
        return next();
    }
    return res.status(403).json({ error: "גישה מותרת רק מתוך פיירברי" });
}

// Admin auth helpers
function generateToken() {
    return crypto.randomBytes(32).toString("hex");
}

function isValidSession(token) {
    const expiry = SESSIONS.get(token);
    if (!expiry) return false;
    if (Date.now() > expiry) { SESSIONS.delete(token); return false; }
    return true;
}

// Apply Fireberry check to upload page and process-excel
router.use("/", (req, res, next) => {
    // Allow admin routes, API mapping, and static files without referer check
    if (req.path.startsWith("/admin") || req.path.startsWith("/api/admin") || req.path.startsWith("/api/field-options")) {
        return next();
    }
    return requireFireberry(req, res, next);
});

// GET /har-habituach/api/users — fetch active users from Fireberry
router.get("/api/users", async (req, res) => {
    try {
        const result = await postRequest("/query", {
            objecttype: "15",
            fields: "fullname,email,systemuserid",
            page_size: 100,
            query: "(statuscode = 1)",
        });
        const records = result?.data?.Data || [];

        const users = records
            .filter(r => r.fullname && r.email)
            .map(r => ({ name: r.fullname, email: r.email, id: r.systemuserid }))
            .sort((a, b) => a.name.localeCompare(b.name, "he"));

        res.json({ users });
    } catch (err) {
        res.status(500).json({ error: err.message || "שגיאה בשליפת משתמשים" });
    }
});

// POST /har-habituach/api/process-excel — upload and process Excel file (streaming response)
router.post("/api/process-excel", upload.single("file"), async (req, res) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Cache-Control", "no-cache");

    const send = (update) => {
        res.write(JSON.stringify(update) + "\n");
    };

    try {
        const file = req.file;
        const ownerId = req.body.ownerId || "";
        const leadId = req.body.leadId || "";

        if (!file) {
            send({ step: "error", message: "לא נבחר קובץ" });
            return res.end();
        }

        // 1. Parse Excel
        send({ step: "parsing", message: "מפרסר את קובץ ה-Excel..." });
        const { idNumber, rows } = parseExcel(file.buffer, file.originalname);

        if (rows.length === 0) {
            send({ step: "error", message: `ת.ז. ${idNumber} — אין שורות ביטוח בקובץ` });
            return res.end();
        }

        send({ step: "parsing", message: `נמצאו ${rows.length} שורות ביטוח, ת.ז. ${idNumber}` });

        // 2. Resolve person — use leadId if available, otherwise search by ID
        let person;
        if (leadId) {
            send({ step: "searching", message: "משתמש בליד מקושר..." });
            person = {
                insuredId: "",
                clientId: "",
                leadId: leadId,
                personType: "lead",
            };
            send({ step: "searching", message: "ליד מקושר נמצא" });
        } else {
            send({ step: "searching", message: `מחפש ת.ז. ${idNumber} בפיירברי...` });
            person = await searchPerson(idNumber);

            if (!person) {
                send({ step: "error", message: `לא נמצא מבוטח או ליד בפיירברי עם ת.ז. ${idNumber}` });
                return res.end();
            }

            const typeHeb = person.personType === "insured" ? "מבוטח" : "ליד";
            send({ step: "searching", message: `נמצא ${typeHeb} בפיירברי` });
        }

        // 3. Load field options
        send({ step: "loading_options", message: "טוען ערכי שדות מפיירברי..." });
        const fieldOptions = await fetchFieldOptions();
        const branchCount = Object.keys(fieldOptions.branchMap).length;
        send({ step: "loading_options", message: `נטענו ${branchCount} ענפים משניים` });

        // 4. Delete existing records
        send({ step: "creating", message: "מוחק רשומות הר ביטוח קיימות..." });
        const deletedCount = await deleteInsuranceMountain(person);
        if (deletedCount > 0) {
            send({ step: "creating", message: `נמחקו ${deletedCount} רשומות קיימות` });
        }

        // 5. Create new records
        const errors = [];
        const warnings = [];
        const unmappedRecords = [];
        let createdCount = 0;

        for (let i = 0; i < rows.length; i++) {
            send({
                step: "creating",
                message: `יוצר רשומה ${i + 1} מתוך ${rows.length}...`,
                current: i + 1,
                total: rows.length,
            });

            try {
                const result = await createInsuranceRecord(rows[i], person, fieldOptions, bufferMapping, ownerId);
                createdCount++;
                if (result.warning) {
                    warnings.push(`שורה ${i + 1}: ${result.warning}`);
                    unmappedRecords.push(buildUnmappedRecord(rows[i], i + 1));
                }
            } catch (err) {
                errors.push(`שגיאה בשורה ${i + 1} (פוליסה ${rows[i].policyNumber}): ${err.message || "unknown"}`);
            }

            if (i < rows.length - 1) {
                await new Promise(r => setTimeout(r, 100));
            }
        }

        // 6. Notify unmapped branches
        if (unmappedRecords.length > 0) {
            notifyUnmappedBranches(unmappedRecords, idNumber, person.personType, rows.length, createdCount);
        }

        // 7. Update premium summary
        send({ step: "webhook", message: "מעדכן סיכומי פרמיות..." });
        try {
            await updatePremiumSummary(person);
        } catch (err) {
            errors.push(`שגיאה בעדכון סיכומי פרמיות: ${err.message || "unknown"}`);
        }

        // 8. Log upload
        try {
            appendLog({
                timestamp: new Date().toISOString(),
                ownerId,
                fileName: file.originalname,
                idNumber,
                personType: person.personType,
                totalRows: rows.length,
                createdCount,
                errorsCount: errors.length,
                warningsCount: warnings.length,
            });
        } catch {}

        // 9. Done
        send({
            step: "done",
            message: JSON.stringify({
                success: true,
                idNumber,
                personType: person.personType,
                totalRows: rows.length,
                createdCount,
                errors,
                warnings,
            }),
        });

    } catch (err) {
        send({ step: "error", message: err.message || "שגיאה לא צפויה" });
    }

    res.end();
});

// --- Admin routes ---

// POST /har-habituach/api/admin-auth — login
router.post("/api/admin-auth", (req, res) => {
    const { password } = req.body || {};
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: "סיסמה שגויה" });
    }
    const token = generateToken();
    SESSIONS.set(token, Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    res.cookie("admin_session", token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, path: "/" });
    res.json({ authenticated: true });
});

// GET /har-habituach/api/admin-auth — check auth
router.get("/api/admin-auth", (req, res) => {
    const token = req.cookies?.admin_session || "";
    res.json({ authenticated: isValidSession(token) });
});

// DELETE /har-habituach/api/admin-auth — logout
router.delete("/api/admin-auth", (req, res) => {
    const token = req.cookies?.admin_session;
    if (token) SESSIONS.delete(token);
    res.clearCookie("admin_session", { path: "/" });
    res.json({ success: true });
});

// GET /har-habituach/api/field-options — get branches + buffers + mapping
router.get("/api/field-options", async (req, res) => {
    try {
        const fieldOptions = await fetchFieldOptions();
        const branches = Object.entries(fieldOptions.branchMap).map(([name, value]) => ({ name, value }));
        const buffers = Object.entries(fieldOptions.bufferMap).map(([name, value]) => ({ name, value }));
        res.json({ branches, buffers, mapping: bufferMapping });
    } catch (err) {
        res.status(500).json({ error: err.message || "שגיאה בטעינת שדות" });
    }
});

// POST /har-habituach/api/field-options — save mapping
router.post("/api/field-options", (req, res) => {
    const token = req.cookies?.admin_session || "";
    if (!isValidSession(token)) {
        return res.status(401).json({ error: "לא מורשה" });
    }
    const { mapping } = req.body || {};
    if (mapping) {
        bufferMapping = mapping;
        saveMapping(bufferMapping);
    }
    res.json({ success: true });
});

// GET /har-habituach/api/upload-log — get upload history
router.get("/api/upload-log", (req, res) => {
    const token = req.cookies?.admin_session || "";
    if (!isValidSession(token)) {
        return res.status(401).json({ error: "לא מורשה" });
    }
    res.json({ logs: loadLogs() });
});

// GET /har-habituach/admin — serve admin page
router.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "har-habituach", "admin.html"));
});

module.exports = router;
