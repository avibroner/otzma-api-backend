require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: "*" }));

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

// --- Start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Otzma server listening on port ${PORT}`);
});
