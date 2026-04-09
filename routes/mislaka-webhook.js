const express = require("express");
const router = express.Router();
const { postRequest, putRequest, getRequest } = require("../lib/fireberry");

const MISLAKA_TOKEN = process.env.MISLAKA_TOKEN || "";

// --- Product mapping: mislaka "סוג מוצר" → Fireberry product ID ---
const PRODUCT_MAP = {
    "קרן פנסיה": "a57cb043-6372-4cc3-b64c-3d8f7fe29525",
    "פנסיה מקיפה": "0a274461-86ae-44a3-83de-5dbb5d5200e8",
    "פנסיה משלימה": "039d3285-016f-4596-916a-8d334ffca351",
    "קרן השתלמות": "eb326311-1e7b-4968-86ff-ba397db62291",
    "קופת גמל": "0e4e450c-5ec9-45c9-95af-f8f5fd1d93e4",
    "גמל להשקעה": "89cb9b71-7566-4939-993c-0a9a1997eeb1",
    "ביטוח מנהלים": "abe0b9ae-ce7a-4952-93d2-4fc4697266de",
    "ביטוח חיים": "1043402e-0f6e-4654-86c4-c61cd4d565b1",
    "סיכון טהור": "e643840a-592f-481f-bcf5-6885b3610ee8",
    "חיסכון פיננסי": "bfaca8aa-81cb-45d9-a01f-87868531315f",
    "תיקון 190": "8f9e3be8-17a7-4cbb-ac30-4d27263b9b7e",
};

// --- Company mapping: Fireberry company name → ID ---
const COMPANY_MAP = {
    "אלטשולר": "5755a23a-ed38-4683-8ecf-00733392668f",
    "אנליסט": "66b4b4cf-cb27-4a30-8f8c-6e9b47975bd4",
    "איילון": "301360fb-bedf-41a2-a9ed-bee963802154",
    "אינפיניטי": "149a3d4b-d9fd-49fd-9d78-cc90ce8df9e8",
    "הכשרה": "819331a5-6d53-4cff-9a23-ec2bebadbdc7",
    "הפניקס": "d4e1eb29-07cb-4878-9f74-c541f479c51d",
    "הראל": "d4e05a2d-5059-44fe-98a6-a478ee4bf706",
    "ילין": "9ead238b-92ba-4a7a-add1-07d77e2494e0",
    "כלל": "9027efdb-4fbc-4108-8f35-28aa51f803d8",
    "מגדל": "923efc5a-1d38-417c-b273-23964c9f2263",
    "מדיהו": "cb121bd1-da1f-4fc5-9a3f-28bf95b42a51",
    "מור": "1342e3a7-819e-4540-aca7-25843b7d0d50",
    "מיטב": "3e9e7ecf-3293-4ae4-990c-9f2c04b3ebfb",
    "מנורה": "00cf8778-2d19-48d9-aa8e-a1850cc221f2",
    "עו\"ש": "18959813-66c6-4fe1-8d6b-14ecf053ad36",
    "רעות": "7761e893-fff7-4f7d-a27a-5e0e5c7dad6b",
    "רום": "ef83657c-f853-48f3-9e98-bdb34b73eaac",
};

// --- Picklist mappings ---
const STATUS_MAP = { "פעיל": "1", "לא פעיל": "2", "לא רלוונטי": "3" };
const ACCOUNT_TYPE_MAP = { "שכיר": "1", "עצמאי": "2", "פרט": "3" };

// Match יצרן name from mislaka to Fireberry company ID (fuzzy contains)
function matchCompany(yatzranName) {
    if (!yatzranName) return "";
    const lower = yatzranName.toLowerCase();
    for (const [name, id] of Object.entries(COMPANY_MAP)) {
        if (lower.includes(name) || name.includes(yatzranName.split(" ")[0])) {
            return id;
        }
    }
    console.warn("Company not matched:", yatzranName);
    return "";
}

// Match סוג מוצר from mislaka to Fireberry product ID
function matchProduct(polisa) {
    const type = polisa["סוג מוצר"] || "";
    const pensionType = polisa["סוג קרן פנסיה"] || "";

    // Specific pension types first
    if (type.includes("פנסיה") && pensionType === "מקיפה") return PRODUCT_MAP["פנסיה מקיפה"];
    if (type.includes("פנסיה") && pensionType === "משלימה") return PRODUCT_MAP["פנסיה משלימה"];
    if (type.includes("פנסיה")) return PRODUCT_MAP["קרן פנסיה"];

    // Try exact match first, then contains
    for (const [name, id] of Object.entries(PRODUCT_MAP)) {
        if (type.includes(name) || name.includes(type)) return id;
    }

    // Fallback patterns
    if (type.includes("השתלמות")) return PRODUCT_MAP["קרן השתלמות"];
    if (type.includes("גמל") && type.includes("השקעה")) return PRODUCT_MAP["גמל להשקעה"];
    if (type.includes("גמל")) return PRODUCT_MAP["קופת גמל"];
    if (type.includes("ביטוח חיים") || type.includes("חיסכון")) return PRODUCT_MAP["ביטוח חיים"];
    if (type.includes("סיכון")) return PRODUCT_MAP["סיכון טהור"];
    if (type.includes("מנהלים")) return PRODUCT_MAP["ביטוח מנהלים"];
    if (type.includes("190")) return PRODUCT_MAP["תיקון 190"];

    console.warn("Product not matched:", type);
    return "";
}

// Map status text to picklist value
function mapStatus(statusText) {
    return STATUS_MAP[statusText] || STATUS_MAP["לא רלוונטי"];
}

// Map account type text to picklist value
function mapAccountType(polisa) {
    const accountType = polisa["סוג חשבון"] || polisa["פרטי עובד"]?.["סוג תוכנית"] || "";
    return ACCOUNT_TYPE_MAP[accountType] || "";
}

// Get investment track name from polisa
function getInvestmentTrack(polisa) {
    const tracks = polisa["פירוט מסלולי השקעה"];
    if (!tracks) return "";
    if (Array.isArray(tracks)) return tracks[0]?.["שם מסלול"] || "";
    return tracks["שם מסלול"] || "";
}

// Get contribution percentage (sum of all הפרשות)
function getContributionPercent(polisa) {
    const contributions = polisa["פירוט הפרשות לפוליסה"];
    if (!contributions) return 0;

    const items = Array.isArray(contributions)
        ? contributions
        : Object.values(contributions);

    let total = 0;
    for (const item of items) {
        total += parseFloat(item["אחוז הפרשה"]) || 0;
    }
    return total;
}

// Get employer name (handles array or object)
function getEmployerName(polisa) {
    const employers = polisa["מעסיקים"];
    if (!employers) return "";
    if (Array.isArray(employers)) return employers[0]?.["שם מעסיק"] || "";
    return employers["שם מעסיק"] || "";
}

// Parse mislaka date (DD-MM-YYYY) to ISO format
function parseMislakaDate(dateStr) {
    if (!dateStr || dateStr === "לא נמצא") return "";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return "";
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

// POST /api/mislaka/webhook
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
        const polisot = mislakaJson.polisot || [];
        console.log("Mislaka data received, polisot count:", polisot.length);

        // Step 2: Store JSON in Fireberry (pcfJsonMislaka field on object 1009)
        const updateResult = await putRequest(`/record/1009/${ID}`, {
            pcfJsonMislaka: JSON.stringify(mislakaJson)
        });
        console.log("Fireberry JSON stored:", updateResult?.success);

        // Step 3: Get lead ID from mislaka record
        const mislakaRecord = await getRequest(`/record/1009/${ID}`);
        const leadId = mislakaRecord?.data?.Record?.pcfLead || "";
        console.log("Lead ID:", leadId);

        // Step 4: Update lead with personal details + summaries
        if (leadId && polisot.length > 0) {
            const client = polisot[0]["לקוח"] || {};
            const totalMonthly = polisot.reduce((s, p) => s + (parseFloat(p["הפקדה אחרונה סה״כ"]) || 0), 0);
            const totalAccumulation = polisot.reduce((s, p) => s + (parseFloat(p["סך חיסכון"]) || 0), 0);

            // Build מיופי כוח text — each representative on a new line
            const powerOfAttorneyLines = [];
            for (const pol of polisot) {
                const poa = pol["פירוט מיופי כח"];
                if (poa && poa["האם קיים מיופה כח"] === "כן" && poa["שם מיופה כח"]) {
                    const line = `${poa["שם מיופה כח"]} (${poa["סוג מיופה כח"] || ""}) — ${pol["שם תוכנית"] || pol["סוג מוצר"] || ""}`;
                    if (!powerOfAttorneyLines.includes(line)) {
                        powerOfAttorneyLines.push(line);
                    }
                }
            }

            const leadUpdate = {
                name: `${client["שם פרטי"] || ""} ${client["שם משפחה"] || ""}`.trim(),
                pcfsystemfield101: client["מספר זיהוי לקוח"] || "",        // ת.ז
                pcfsystemfield560: client["דואר אלקטרוני"] || "",           // מייל
                pcfsystemfield331: client["שם יישוב"] || "",               // עיר
                pcfsystemfield531: client["רחוב"] ? `${client["רחוב"]} ${client["מספר בית"] || ""}`.trim() : "", // רחוב
                pcfsystemfield562: totalMonthly,                            // סך הפקדות
                pcfsystemfield563: totalAccumulation,                       // סך צבירות
            };

            if (powerOfAttorneyLines.length > 0) {
                leadUpdate.pcfsystemfield564 = powerOfAttorneyLines.join("\n"); // מיופי כוח
            }

            // Remove empty values
            for (const key of Object.keys(leadUpdate)) {
                if (leadUpdate[key] === "" || leadUpdate[key] === null || leadUpdate[key] === undefined) {
                    delete leadUpdate[key];
                }
            }

            const leadUpdateResult = await putRequest(`/record/1003/${leadId}`, leadUpdate);
            console.log("Lead updated:", leadUpdateResult?.success, "— name:", leadUpdate.name, "monthly:", totalMonthly, "accumulation:", totalAccumulation);
        }

        // Step 5: Delete existing mislaka products for this mislaka record
        const existingProducts = await postRequest("/query", {
            objecttype: "1031",
            fields: "customobject1031id",
            page_size: 500,
            query: `(pcfsystemfield100 = ${ID})`
        });
        const existingIds = existingProducts?.data?.Data?.map(r => r.customobject1031id) || [];
        for (const existingId of existingIds) {
            await putRequest(`/record/1031/${existingId}`, { statuscode: 2 }); // soft delete or:
            // await deleteRequest(`/record/1031/${existingId}`);
        }
        if (existingIds.length > 0) {
            console.log(`Deleted ${existingIds.length} existing mislaka products`);
        }

        // Step 6: Create mislaka product records
        const results = [];
        for (let i = 0; i < polisot.length; i++) {
            const pol = polisot[i];
            const monthlyDeposit = parseFloat(pol["הפקדה אחרונה סה״כ"]) || 0;

            const payload = {
                pcfsystemfield100: ID,                                      // קישור למסלקה
                pcfsystemfield101: matchProduct(pol),                       // סוג מוצר (lookup)
                pcfsystemfield102: mapStatus(pol["סטטוס"]),                 // סטטוס (picklist)
                pcfsystemfield103: getInvestmentTrack(pol),                 // מסלול השקעה
                pcfsystemfield104: getContributionPercent(pol),             // אחוז הפרשה
                pcfsystemfield105: monthlyDeposit,                          // הפקדה חודשית
                pcfsystemfield106: monthlyDeposit * 12,                     // הפקדה שנתית
                pcfsystemfield107: parseMislakaDate(pol["ת. נכונות"]),      // תאריך הפקדה
                pcfsystemfield108: parseMislakaDate(pol["ת. הצטרפות"]),     // תאריך הצטרפות לקופה
                pcfsystemfield109: mapAccountType(pol),                     // סוג חשבון (picklist)
                pcfsystemfield110: getEmployerName(pol),                    // מעסיק
                pcfsystemfield111: parseFloat(pol["סך חיסכון"]) || 0,      // צבירה
                pcfsystemfield112: parseFloat(pol["סה״כ יתרה עתידית"]) || 0, // יתרה עתידית
                pcfsystemfield113: parseFloat(pol["דמנה״ל הפקדה"]) || 0,   // דמ"נ מהפקדה
                pcfsystemfield114: parseFloat(pol["דמנה״ל צבירה"]) || 0,   // דמ"נ מצבירה
                pcfsystemfield115: matchCompany(pol["יצרן"]),               // חברה (lookup)
                pcfsystemfield116: pol["מספר פוליסה"] || "",               // מספר קופה/פוליסה
                pcfsystemfield117: parseFloat(pol["שכר מדווח להפקדה עפ\"י נתוני יצרן"]) || 0, // שכר
                pcfsystemfield118: pol["שם תוכנית"] || "",                 // שם תוכנית
                name: `${pol["שם תוכנית"] || pol["סוג מוצר"]} - ${pol["מספר פוליסה"] || ""}`, // שם רשומה
            };

            // Remove empty string values to avoid API errors
            for (const key of Object.keys(payload)) {
                if (payload[key] === "" || payload[key] === null || payload[key] === undefined) {
                    delete payload[key];
                }
            }

            const result = await postRequest("/record/1031", payload);
            results.push({
                index: i,
                policyNumber: pol["מספר פוליסה"],
                productType: pol["סוג מוצר"],
                success: result?.success || false,
                id: result?.data?.id || null,
            });

            console.log(`Product ${i + 1}/${polisot.length}: ${pol["שם תוכנית"]} → ${result?.success ? "OK" : "FAIL"}`);
        }

        return res.status(200).json({
            success: true,
            recordId: ID,
            transactionId: Transaction,
            polisotCount: polisot.length,
            productsCreated: results.filter(r => r.success).length,
            results
        });

    } catch (err) {
        console.error("Mislaka webhook error:", err);
        return res.status(500).json({ error: err.message || "Internal server error" });
    }
});

module.exports = router;
