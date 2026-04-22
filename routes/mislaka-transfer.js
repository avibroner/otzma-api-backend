const express = require("express");
const path = require("path");
const router = express.Router();
const { postRequest, getRequest, putRequest } = require("../lib/fireberry");
const { getProductName, PRODUCT_MAP } = require("../lib/product-map");

// GET /api/mislaka/transfer?id=XXX — serve the transfer UI page
router.get("/transfer", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "mislaka", "transfer.html"));
});

// GET /api/mislaka/transfer/init?id=XXX — load product + companies for the form
router.get("/transfer/init", async (req, res) => {
    try {
        const productId = req.query.id;
        if (!productId) {
            return res.status(400).json({ success: false, message: "חסר מזהה מוצר מסלקה" });
        }

        const [productData, companiesData] = await Promise.all([
            getRequest(`/record/1031/${productId}`),
            postRequest("/query", {
                objecttype: 1016,
                fields: "customobject1016id,name",
                query: "",
                pageSize: 500,
            }),
        ]);

        const product = productData?.data?.Record;
        if (!product) {
            return res.status(404).json({ success: false, message: "לא נמצא מוצר מסלקה" });
        }

        const companies = (companiesData?.data?.Data || [])
            .map((c) => ({ id: c.customobject1016id, name: c.name }))
            .filter((c) => c.id && c.name)
            .sort((a, b) => a.name.localeCompare(b.name, "he"));

        const productTypes = Object.entries(PRODUCT_MAP).map(([name, id]) => ({ id, name }));

        res.json({
            success: true,
            product: {
                name: product.name || product.pcfsystemfield118 || "מוצר",
                managementFeeDeposit: product.pcfsystemfield113 ?? 0,
                managementFeeAccumulation: product.pcfsystemfield114 ?? 0,
                companyId: product.pcfsystemfield115 || "",
                employerName: product.pcfsystemfield110 || "",
                productTypeId: product.pcfsystemfield101 || "",
                monthlyDeposit: product.pcfsystemfield105 ?? 0,
            },
            companies,
            productTypes,
        });
    } catch (err) {
        console.error("Mislaka transfer init error:", err);
        res.status(500).json({ success: false, message: err.message || "שגיאה בטעינת נתוני הטופס" });
    }
});

// POST /api/mislaka/transfer/execute — run the transfer process (streaming response)
router.post("/transfer/execute", async (req, res) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Cache-Control", "no-cache");

    const send = (update) => {
        res.write(JSON.stringify(update) + "\n");
    };

    try {
        const {
            productId,
            managementFeeDeposit,
            managementFeeAccumulation,
            companyId,
            sameEmployer = true,
            newEmployerName = "",
            newEmployerTaxId = "",
            sameProduct = true,
            newProductId = "",
            sameDeposit = true,
            newMonthlyDeposit,
        } = req.body || {};

        if (!productId) {
            send({ step: "error", message: "חסר מזהה מוצר מסלקה" });
            return res.end();
        }

        // Form validation
        if (sameEmployer === false && !newEmployerName.trim()) {
            send({ step: "error", message: "נבחר מעסיק חדש אך לא הוזן שם מעסיק" });
            return res.end();
        }
        if (sameProduct === false && !newProductId) {
            send({ step: "error", message: "נבחר מוצר חדש אך לא נבחר סוג מוצר" });
            return res.end();
        }
        if (sameDeposit === false && (newMonthlyDeposit === undefined || newMonthlyDeposit === null || newMonthlyDeposit === "")) {
            send({ step: "error", message: "נבחרה הפקדה חדשה אך לא הוזן סכום" });
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

        // Get lead details — mislaka flow starts from lead, not account
        const leadData = await getRequest(`/record/1003/${leadId}`);
        const lead = leadData?.data?.Record;
        const accountId = lead?.accountid || "";
        const contactId = lead?.contactid || "";                 // מבוטח ראשי (אם יש)
        const agentId = lead?.ownerid || "";                     // סוכן
        const financialPlannerId = lead?.pcfsystemfield271 || ""; // מתכנן פיננסי

        send({ step: "loading", message: `ליד נמצא: ${lead?.name || leadId}` });

        // Fetch business unit of the agent — BU is defined on CrmUser (object 9)
        let businessUnitId = null;
        if (agentId) {
            try {
                const userRes = await postRequest("/query", {
                    objecttype: 9,
                    fields: "crmuserid,businessunitid",
                    query: `crmuserid = '${agentId}'`,
                    page_size: 1,
                });
                businessUnitId = userRes?.data?.Data?.[0]?.businessunitid || null;
            } catch (e) {
                console.error("BU lookup failed in mislaka transfer:", e);
            }
        }

        // Step 3: Find or create employer
        let employerId = "";
        const employerName = sameEmployer
            ? (product.pcfsystemfield110 || "")
            : newEmployerName.trim();
        const employerTaxId = sameEmployer ? "" : (newEmployerTaxId || "").trim();

        if (employerName) {
            send({ step: "employer", message: `מחפש מעסיק: ${employerName}...` });

            // Search existing employer by name
            const employerSearch = await postRequest("/query", {
                objecttype: 1018,
                fields: "customobject1018id,name,pcfCompanyNumber",
                query: `name = '${employerName.replace(/'/g, "\\'")}'`
            });

            const existingEmployers = employerSearch?.data?.Data || [];
            if (existingEmployers.length > 0) {
                const existing = existingEmployers[0];
                employerId = existing.customobject1018id;
                send({ step: "employer", message: `מעסיק נמצא: ${employerName}` });

                // Backfill tax ID if the agent supplied one and existing record is missing it
                if (employerTaxId && !existing.pcfCompanyNumber) {
                    try {
                        await putRequest(`/record/1018/${employerId}`, {
                            pcfCompanyNumber: employerTaxId,
                        });
                        send({ step: "employer", message: `ח.פ עודכן על המעסיק הקיים` });
                    } catch (e) {
                        send({ step: "warning", message: `שגיאה בעדכון ח.פ על מעסיק קיים` });
                    }
                }
            } else {
                send({ step: "employer", message: `יוצר מעסיק חדש: ${employerName}...` });
                const employerPayload = { name: employerName };
                if (employerTaxId) employerPayload.pcfCompanyNumber = employerTaxId;

                const newEmployer = await postRequest("/record/1018", employerPayload);
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
        const effectiveProductTypeId = sameProduct
            ? (product.pcfsystemfield101 || "")
            : newProductId;
        const effectiveCompanyId = companyId || product.pcfsystemfield115 || "";
        const effectiveMonthlyDeposit = sameDeposit
            ? (parseFloat(product.pcfsystemfield105) || 0)
            : (parseFloat(newMonthlyDeposit) || 0);
        const effectiveMgmtFeeDeposit = managementFeeDeposit !== undefined && managementFeeDeposit !== ""
            ? parseFloat(managementFeeDeposit) || 0
            : (parseFloat(product.pcfsystemfield113) || 0);
        const effectiveMgmtFeeAccumulation = managementFeeAccumulation !== undefined && managementFeeAccumulation !== ""
            ? parseFloat(managementFeeAccumulation) || 0
            : (parseFloat(product.pcfsystemfield114) || 0);

        const productTypeName = getProductName(effectiveProductTypeId);
        const leadName = lead?.name || "";
        const financialName = [leadName, productTypeName].filter(Boolean).join(" - ");
        const financialPayload = {
            accountid: accountId,
            contacttid: contactId,                                 // לקוח בקופה (מבוטח)
            pcfCompany: effectiveCompanyId,                        // חברה (מהטופס)
            pcfProduct: effectiveProductTypeId,                    // מוצר (מהטופס)
            pcfManagementFeeAccumulation: effectiveMgmtFeeAccumulation, // דמ"נ מצבירה (מהטופס)
            pcfManagementFeeDeposit: effectiveMgmtFeeDeposit,      // דמ"נ מהפקדה (מהטופס)
            pcfOperationalStatus: 1,                               // סטטוס תפעולי (הוגש לעוצמה)
            pcfSaleOrAgent: 1,                                     // מכירה
            // ב-Opportunity: ownerid=מתכנן פיננסי, pcfsystemfield100=סוכן
            ownerid: financialPlannerId,
            pcfsystemfield100: agentId,
            pcfsystemfield143: businessUnitId,                     // יחידה עסקית
            pcfsystemfield140: today,                              // תאריך מכירה
            pcfsystemfield137: leadId,                             // ליד מקושר
            pcfsystemfield148: mislaka.pcfsystemfield101 || lead?.pcfsystemfield101 || "", // ת.ז לקוח (מסלקה יותר אמין)
            pcfKupaNumber: product.pcfsystemfield116 || "",        // מספר קופה
            pcfsystemfield107: product.pcfsystemfield111 || 0,     // ניוד צפוי (צבירה)
            name: `${financialName} (ניוד מסלקה)`,
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
        const financialId =
            financialResult?.data?.Record?.opportunityid ||
            financialResult?.data?.id;

        if (!financialResult?.success || !financialId) {
            send({ step: "error", message: `שגיאה ביצירת רשומת פיננסים: ${JSON.stringify(financialResult?.message || financialResult)}` });
            return res.end();
        }

        send({ step: "financial", message: "רשומת פיננסים נוצרה בהצלחה" });

        // Link the new opportunity back to the mislaka product
        await putRequest(`/record/1031/${productId}`, {
            pcfLinkedFinancial: financialId, // קישור לפיננסי שנוצר
        });

        // Step 5: Create employer in fund (1019) — if employer exists
        if (employerId) {
            send({ step: "employer_fund", message: "יוצר מעסיק בקופה..." });
            const employerFundPayload = {
                pcfFinancial: financialId,
                pcfEmployer: employerId,
                pcfMonthlyDeposit: effectiveMonthlyDeposit, // הפקדה חודשית (מהטופס)
                // ב-1019: ownerid=מתכנן פיננסי, pcfsystemfield102=סוכן
                ownerid: financialPlannerId,
                pcfsystemfield102: agentId,
            };

            const employerFundResult = await postRequest("/record/1019", employerFundPayload);

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
            pcfTransferringBody: effectiveCompanyId,               // חברה (גוף מעביר, מהטופס)
            pcfExpectedTransfer1: product.pcfsystemfield111 || 0,  // ניוד צפוי (צבירה)
            pcfsystemfield109: today,                              // תאריך מכירה
            pcfsystemfield106: effectiveProductTypeId,             // מוצר (מהטופס)
            // ב-1017: ownerid=מתכנן פיננסי, pcfsystemfield102=סוכן
            ownerid: financialPlannerId,
            pcfsystemfield102: agentId,
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
