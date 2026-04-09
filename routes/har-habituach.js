const express = require("express");
const multer = require("multer");
const router = express.Router();
const { postRequest } = require("../lib/fireberry");
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

// Buffer mapping (in-memory, simple replacement for Redis)
let bufferMapping = {};

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

        // 8. Done
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

// GET /har-habituach/api/mapping — get buffer mapping
router.get("/api/mapping", (req, res) => {
    res.json(bufferMapping);
});

// POST /har-habituach/api/mapping — update buffer mapping
router.post("/api/mapping", (req, res) => {
    bufferMapping = req.body || {};
    res.json({ success: true });
});

module.exports = router;
