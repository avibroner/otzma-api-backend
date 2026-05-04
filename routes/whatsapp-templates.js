const express = require("express");
const path = require("path");
const router = express.Router();
const basicAuth = require("../middleware/basicAuth");
const templatesDb = require("../lib/whatsapp-templates-db");

// GET /api/whatsapp-templates/random — used by n8n
router.get("/api/whatsapp-templates/random", basicAuth, (req, res) => {
    try {
        const template = templatesDb.getRandom();
        if (!template) {
            return res.status(404).json({ error: "אין תבניות פעילות" });
        }
        res.json(template);
    } catch (err) {
        console.error("[whatsapp-templates] random failed:", err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/whatsapp-templates — used by admin page
router.get("/api/whatsapp-templates", basicAuth, (req, res) => {
    try {
        const templates = templatesDb.listAll();
        res.json({ templates, stats: templatesDb.count() });
    } catch (err) {
        console.error("[whatsapp-templates] list failed:", err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/whatsapp-templates — create
router.post("/api/whatsapp-templates", basicAuth, (req, res) => {
    try {
        const { name, body } = req.body || {};
        const result = templatesDb.create({ name, body });
        if (result.error) {
            return res.status(400).json({ error: result.error });
        }
        res.status(201).json(result.template);
    } catch (err) {
        console.error("[whatsapp-templates] create failed:", err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/whatsapp-templates/:id — soft delete
router.delete("/api/whatsapp-templates/:id", basicAuth, (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: "מזהה לא תקין" });
        }
        const result = templatesDb.deactivate(id);
        if (!result.changed) {
            return res.status(404).json({ error: "תבנית לא נמצאה או כבר לא פעילה" });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error("[whatsapp-templates] delete failed:", err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/whatsapp-templates/:id/restore — re-activate a soft-deleted template
router.post("/api/whatsapp-templates/:id/restore", basicAuth, (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: "מזהה לא תקין" });
        }
        const result = templatesDb.activate(id);
        if (!result.changed) {
            return res.status(404).json({ error: "תבנית לא נמצאה או כבר פעילה" });
        }
        res.json({ ok: true });
    } catch (err) {
        console.error("[whatsapp-templates] restore failed:", err);
        res.status(500).json({ error: err.message });
    }
});

// Admin page
router.get("/admin/whatsapp-templates", basicAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "admin", "whatsapp-templates.html"));
});

module.exports = router;
