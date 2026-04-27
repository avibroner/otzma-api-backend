require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");
const logger = require("./lib/logger");
const activityLog = require("./middleware/activityLog");

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(cors({ origin: "*", exposedHeaders: ["x-session-id", "x-account-id", "x-user-id"] }));

// Activity logging — must run before routes so it can wrap res.json
logger.init();
app.use(activityLog);

// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Fireberry referer check middleware
function requireFireberry(req, res, next) {
    const referer = req.headers.referer || req.headers.origin || "";
    if (referer.includes("fireberry.com") || referer.includes("powerlink.co.il") || referer.includes("otzma-ins.co.il") || referer.includes("localhost")) {
        return next();
    }
    return res.status(403).json({ error: "גישה מותרת רק מתוך פיירברי" });
}

// --- Routes ---

// Quotes (טעינת הצעות)
const quotesRouter = require("./routes/quotes");
app.use("/", quotesRouter);

// Mislaka data (for dashboard)
const mislakaDataRouter = require("./routes/mislaka-data");
app.use("/api/mislaka", mislakaDataRouter);

// Mislaka webhook (קליטת מסלקה)
const mislakaWebhookRouter = require("./routes/mislaka-webhook");
app.use("/api/mislaka", mislakaWebhookRouter);

// Mislaka transfer (כפתור ניידנו)
const mislakaTransferRouter = require("./routes/mislaka-transfer");
app.use("/api/mislaka", mislakaTransferRouter);

// Har Habituach (הר הביטוח)
const harHabituachRouter = require("./routes/har-habituach");
app.use("/har-habituach", harHabituachRouter);

// Admin dashboard (basic auth)
const dashboardRouter = require("./routes/dashboard");
app.use("/", dashboardRouter);

// --- Static files ---

// Quotes: /?objectid=... serves public/quotes/index.html
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "quotes", "index.html"));
});
app.use(express.static(path.join(__dirname, "public", "quotes"), { maxAge: 0, etag: false }));

// Mislaka: /mislaka/dashboard.html, /mislaka/analysis.html (Fireberry only, except transfer)
app.use("/mislaka", (req, res, next) => {
    if (req.path.includes("transfer")) return next(); // transfer has its own check
    return requireFireberry(req, res, next);
}, express.static(path.join(__dirname, "public", "mislaka")));

// Har Habituach: /har-habituach/
app.use("/har-habituach", express.static(path.join(__dirname, "public", "har-habituach")));

// --- Daily log rotation (90 days retention) ---
const ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = Number(process.env.LOG_RETENTION_DAYS) || 90;
setInterval(() => {
    try {
        logger.cleanup(RETENTION_DAYS);
    } catch (err) {
        console.error("[logger] rotation failed:", err);
    }
}, ROTATION_INTERVAL_MS);

// --- Start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Otzma server listening on port ${PORT}`);
});
