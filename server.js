const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(express.json());
app.use(cors({ origin: "*" }));

// Health check
app.get("/health", (req, res) => res.json({ status: "ok" }));

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
app.use(express.static(path.join(__dirname, "public", "quotes")));

// Mislaka: /mislaka/dashboard.html, /mislaka/analysis.html
app.use("/mislaka", express.static(path.join(__dirname, "public", "mislaka")));

// Har Habituach: /har-habituach/
app.use("/har-habituach", express.static(path.join(__dirname, "public", "har-habituach")));

// --- Start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Otzma server listening on port ${PORT}`);
});
