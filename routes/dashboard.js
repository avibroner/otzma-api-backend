const express = require("express");
const path = require("path");
const router = express.Router();
const logger = require("../lib/logger");
const basicAuth = require("../middleware/basicAuth");

router.get("/admin/dashboard", basicAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "admin", "dashboard.html"));
});

router.get("/admin/dashboard.js", basicAuth, (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "admin", "dashboard.js"));
});

router.get("/api/admin/events", basicAuth, (req, res) => {
    try {
        const events = logger.query({
            filters: {
                account_id: req.query.account_id || null,
                session_id: req.query.session_id || null,
                event_type: req.query.event_type || null,
                path: req.query.path || null,
                from: req.query.from || null,
                to: req.query.to || null,
                orphan: req.query.orphan === "1",
                validation_failure: req.query.validation_failure === "1",
                error: req.query.error === "1"
            },
            limit: req.query.limit,
            offset: req.query.offset
        });
        res.json({ events });
    } catch (err) {
        console.error("admin events query failed:", err);
        res.status(500).json({ error: err.message });
    }
});

router.get("/api/admin/sessions", basicAuth, (req, res) => {
    try {
        const sessions = logger.getSessions({ limit: req.query.limit });
        res.json({ sessions });
    } catch (err) {
        console.error("admin sessions query failed:", err);
        res.status(500).json({ error: err.message });
    }
});

router.get("/api/admin/stats", basicAuth, (req, res) => {
    try {
        res.json({ stats: logger.stats() });
    } catch (err) {
        console.error("admin stats query failed:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
