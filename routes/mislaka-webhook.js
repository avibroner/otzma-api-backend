const express = require("express");
const router = express.Router();
const { postRequest, putRequest } = require("../lib/fireberry");

const MISLAKA_TOKEN = process.env.MISLAKA_TOKEN || "";

// POST /api/mislaka/webhook
// Fireberry sends: { ID, Transaction, SourceWebhook }
// 1. Pull JSON from mislaka API
// 2. Store JSON in Fireberry (object 1009)
// 3. Update linked lead
// 4. Create mislaka product records
router.post("/webhook", async (req, res) => {
    try {
        const { ID, Transaction, SourceWebhook } = req.body || {};
        console.log("Mislaka webhook received:", { ID, Transaction, SourceWebhook });

        if (!ID || !Transaction) {
            return res.status(400).json({ error: "Missing ID or Transaction" });
        }

        // Step 1: Pull full JSON from mislaka API
        const mislakaUrl = `https://mislaka-api.co.il/api/transaction/${Transaction}/polisot/data`;
        const mislakaRes = await fetch(mislakaUrl, {
            method: "GET",
            headers: { "Accept": "application/json", "token": MISLAKA_TOKEN }
        });

        if (!mislakaRes.ok) {
            const errText = await mislakaRes.text().catch(() => "");
            console.error("Mislaka API error:", mislakaRes.status, errText);
            return res.status(502).json({ error: `Mislaka API returned ${mislakaRes.status}` });
        }

        const mislakaJson = await mislakaRes.json();
        console.log("Mislaka data received, polisot count:", mislakaJson.polisot?.length || 0);

        // Step 2: Store JSON in Fireberry (pcfJsonMislaka field on object 1009)
        const updateResult = await putRequest(`/record/1009/${ID}`, {
            pcfJsonMislaka: JSON.stringify(mislakaJson)
        });
        console.log("Fireberry JSON stored:", updateResult?.success);

        // Step 3: Update linked lead with personal details + summaries
        // TODO: Need lead ID field name from object 1009 (e.g., pcfLeadId or accountid)
        // await updateLinkedLead(mislakaJson, ID);

        // Step 4: Create mislaka product records for each polisa
        // TODO: Need object ID for "מוצר מסלקה" from Fireberry
        // const products = await createMislakaProducts(mislakaJson.polisot, ID);

        return res.status(200).json({
            success: true,
            recordId: ID,
            transactionId: Transaction,
            polisotCount: mislakaJson.polisot?.length || 0
        });

    } catch (err) {
        console.error("Mislaka webhook error:", err);
        return res.status(500).json({ error: err.message || "Internal server error" });
    }
});

// Helper: Map mislaka product type to Fireberry product category
function getMislakaProductType(polisa) {
    const type = polisa["סוג מוצר"] || "";
    if (type.includes("פנסיה")) return "קרן פנסיה מסלקה";
    if (type.includes("השתלמות")) return "קרן השתלמות מסלקה";
    if (type.includes("גמל")) return "קופת גמל מסלקה";
    if (type.includes("ביטוח חיים")) return "ביטוח חיים מסלקה";
    if (type.includes("סיכון")) return "סיכון טהור מסלקה";
    return type + " מסלקה";
}

// Helper: Extract fields from a polisa for creating a mislaka product record
function extractProductFields(polisa, mislakaRecordId) {
    const monthlyDeposit = polisa["הפקדה אחרונה סה״כ"] || 0;

    return {
        // pcfMislakaId: mislakaRecordId,              // קישור לרשומת מסלקה
        // pcfProductType: getMislakaProductType(polisa), // סוג מוצר
        // pcfStatus: polisa["סטטוס"] || "",            // סטטוס
        // pcfInvestmentTrack: (polisa["פירוט מסלולי השקעה"]?.[0]?.["שם מסלול"]) || "", // מסלול השקעה
        // pcfMonthlyDeposit: monthlyDeposit,            // הפקדה חודשית
        // pcfYearlyDeposit: monthlyDeposit * 12,        // הפקדה שנתית
        // pcfDepositDate: polisa["ת. נכונות"] || "",    // תאריך הפקדה
        // pcfJoinDate: polisa["ת. הצטרפות"] || "",     // תאריך הצטרפות לקופה
        // pcfAccountType: polisa["סוג חשבון"] || polisa["פרטי עובד"]?.["סוג תוכנית"] || "", // סוג חשבון
        // pcfEmployer: polisa["מעסיקים"]?.["שם מעסיק"] || "", // מעסיק
        // pcfAccumulation: polisa["סך חיסכון"] || 0,   // צבירה
        // pcfFutureBalance: polisa["סה״כ יתרה עתידית"] || 0, // יתרה עתידית
        // pcfMgmtFeeDeposit: polisa["דמנה״ל הפקדה"] || 0,  // דמ"נ מהפקדה
        // pcfMgmtFeeAccum: polisa["דמנה״ל צבירה"] || 0,    // דמ"נ מצבירה
        // pcfCompanyName: "", // TODO: map company from polisa to Fireberry company ID
        // pcfPolicyNumber: polisa["מספר פוליסה"] || "", // מספר קופה/פוליסה
        // pcfSalary: polisa["שכר מדווח להפקדה עפ\"י נתוני יצרן"] || "",  // שכר
        // pcfContributionPercent: polisa["פירוט הפרשות לפוליסה"]?.[0]?.["אחוז הפרשה"] || "", // אחוז הפרשה
    };
}

module.exports = router;
