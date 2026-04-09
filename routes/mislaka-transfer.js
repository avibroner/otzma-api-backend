const express = require("express");
const path = require("path");
const router = express.Router();
const { postRequest, getRequest, putRequest } = require("../lib/fireberry");

// GET /api/mislaka/transfer?id=XXX — serve the transfer UI page
router.get("/transfer", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "mislaka", "transfer.html"));
});

// POST /api/mislaka/transfer/execute — run the transfer process (streaming response)
router.post("/transfer/execute", async (req, res) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const send = (update) => {
        res.write(JSON.stringify(update) + "\n");
    };

    try {
        const { productId } = req.body || {};

        if (!productId) {
            send({ step: "error", message: "חסר מזהה מוצר מסלקה" });
            return res.end();
        }

        // Step 1: Fetch the mislaka product record
        send({ step: "loading", message: "טוען נתוני מוצר מסלקה..." });
        const productData = await getRequest(`/record/1031/${productId}`);
        const product = productData?.data?.Record;

        if (!product) {
            send({ step: "error", message: "לא נמצא מוצר מסלקה עם המזהה שנשלח" });
            return res.end();
        }

        const productName = product.name || product.pcfsystemfield118 || "מוצר";
        send({ step: "loading", message: `נמצא: ${productName}` });

        // Step 2: Get the mislaka record to find the lead
        send({ step: "loading", message: "מחפש ליד מקושר..." });
        const mislakaId = product.pcfsystemfield100;
        if (!mislakaId) {
            send({ step: "error", message: "מוצר המסלקה לא מקושר לרשומת מסלקה" });
            return res.end();
        }

        const mislakaRecord = await getRequest(`/record/1009/${mislakaId}`);
        const mislaka = mislakaRecord?.data?.Record;
        if (!mislaka) {
            send({ step: "error", message: "לא נמצאה רשומת מסלקה מקושרת" });
            return res.end();
        }

        const leadId = mislaka.pcfLead || "";
        if (!leadId) {
            send({ step: "error", message: "רשומת המסלקה לא מקושרת לליד" });
            return res.end();
        }

        // Get lead details for accountid
        const leadData = await getRequest(`/record/1003/${leadId}`);
        const lead = leadData?.data?.Record;
        const accountId = lead?.accountid || "";
        const contactId = lead?.contactid || "";

        send({ step: "loading", message: `ליד נמצא: ${lead?.name || leadId}` });

        // Step 3: Find or create employer
        let employerId = "";
        const employerName = product.pcfsystemfield110 || "";

        if (employerName) {
            send({ step: "employer", message: `מחפש מעסיק: ${employerName}...` });

            // Search existing employer by name
            const employerSearch = await postRequest("/query", {
                objecttype: 1018,
                fields: "customobject1018id,name",
                query: `name = '${employerName.replace(/'/g, "\\'")}'`
            });

            const existingEmployers = employerSearch?.data?.Data || [];
            if (existingEmployers.length > 0) {
                employerId = existingEmployers[0].customobject1018id;
                send({ step: "employer", message: `מעסיק נמצא: ${employerName}` });
            } else {
                send({ step: "employer", message: `יוצר מעסיק חדש: ${employerName}...` });
                const newEmployer = await postRequest("/record/1018", {
                    name: employerName,
                });
                employerId = newEmployer?.data?.id || "";
                if (employerId) {
                    send({ step: "employer", message: `מעסיק נוצר בהצלחה` });
                } else {
                    send({ step: "warning", message: `שגיאה ביצירת מעסיק — ממשיך בלעדיו` });
                }
            }
        }

        // Step 4: Create financial record (opportunity)
        send({ step: "financial", message: "יוצר רשומת פיננסים..." });

        const today = new Date().toISOString().split("T")[0];
        const financialPayload = {
            accountid: accountId,
            contacttid: contactId,
            pcfCompany: product.pcfsystemfield115 || "",           // חברה
            pcfProduct: product.pcfsystemfield101 || "",           // מוצר
            pcfManagementFeeAccumulation: product.pcfsystemfield114 || 0, // דמ"נ מצבירה
            pcfManagementFeeDeposit: product.pcfsystemfield113 || 0,     // דמ"נ מהפקדה
            pcfOperationalStatus: "ניוד מסלקה",
            pcfsystemfield140: today,                              // תאריך מכירה
            pcfsystemfield137: leadId,                             // ליד מקושר
            pcfsystemfield148: mislaka.pcfsystemfield101 || "",    // ת.ז לקוח
            pcfKupaNumber: product.pcfsystemfield116 || "",        // מספר קופה
            pcfsystemfield115: product.pcfsystemfield105 || 0,     // הפקדה חודשית צפויה
            pcfsystemfield116: (parseFloat(product.pcfsystemfield105) || 0) * 12, // הפקדה שנתית צפויה
            pcfsystemfield107: product.pcfsystemfield111 || 0,     // ניוד צפוי (צבירה)
            name: `ניוד מסלקה — ${productName}`,
        };

        // Remove empty values
        for (const key of Object.keys(financialPayload)) {
            if (financialPayload[key] === "" || financialPayload[key] === null || financialPayload[key] === undefined) {
                delete financialPayload[key];
            }
        }

        if (employerId) {
            financialPayload.pcfEmployer1 = employerId;
        }

        const financialResult = await postRequest("/record/opportunity", financialPayload);
        const financialId = financialResult?.data?.id;

        if (!financialId) {
            send({ step: "error", message: `שגיאה ביצירת רשומת פיננסים: ${JSON.stringify(financialResult?.message || financialResult)}` });
            return res.end();
        }

        send({ step: "financial", message: "רשומת פיננסים נוצרה בהצלחה" });

        // Step 5: Create employer in fund (1019) — if employer exists
        if (employerId) {
            send({ step: "employer_fund", message: "יוצר מעסיק בקופה..." });
            const employerFundResult = await postRequest("/record/1019", {
                pcfFinancial: financialId,
                pcfEmployer: employerId,
            });

            if (employerFundResult?.success !== false) {
                send({ step: "employer_fund", message: "מעסיק בקופה נוצר בהצלחה" });
            } else {
                send({ step: "warning", message: `שגיאה ביצירת מעסיק בקופה: ${employerFundResult?.message || ""}` });
            }
        } else {
            send({ step: "employer_fund", message: "אין מעסיק — דילוג על מעסיק בקופה" });
        }

        // Step 6: Create transfer body (1017)
        send({ step: "transfer", message: "יוצר גוף מעביר..." });
        const transferPayload = {
            pcfFinancial: financialId,
            pcfTransferringBody: product.pcfsystemfield115 || "",  // חברה (גוף מעביר)
            pcfExpectedTransfer1: product.pcfsystemfield111 || 0,  // ניוד צפוי (צבירה)
            pcfsystemfield109: today,                              // תאריך מכירה
            pcfsystemfield106: product.pcfsystemfield101 || "",    // מוצר
            name: `ניוד — ${productName}`,
        };

        for (const key of Object.keys(transferPayload)) {
            if (transferPayload[key] === "" || transferPayload[key] === null || transferPayload[key] === undefined) {
                delete transferPayload[key];
            }
        }

        const transferResult = await postRequest("/record/1017", transferPayload);

        if (transferResult?.success !== false) {
            send({ step: "transfer", message: "גוף מעביר נוצר בהצלחה" });
        } else {
            send({ step: "warning", message: `שגיאה ביצירת גוף מעביר: ${transferResult?.message || ""}` });
        }

        // Step 7: Done
        send({
            step: "done",
            message: JSON.stringify({
                success: true,
                productName,
                financialId,
                employerId: employerId || null,
                transferId: transferResult?.data?.id || null,
            })
        });

    } catch (err) {
        console.error("Mislaka transfer error:", err);
        send({ step: "error", message: err.message || "שגיאה לא צפויה" });
    }

    res.end();
});

module.exports = router;
