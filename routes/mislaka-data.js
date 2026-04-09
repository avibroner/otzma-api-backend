const express = require("express");
const router = express.Router();
const { getRequest } = require("../lib/fireberry");

// GET /api/mislaka/data?id={customobject1009id}
// Fetches mislaka JSON from Fireberry and returns it to the dashboard
router.get("/data", async (req, res) => {
    const { id } = req.query;
    if (!id) {
        return res.status(400).json({ error: "חסר מזהה רשומה" });
    }

    try {
        const fbData = await getRequest(`/record/1009/${id}`);

        if (!fbData?.success || !fbData?.data?.Record) {
            return res.status(404).json({ error: "רשומה לא נמצאה בפיירברי" });
        }

        const record = fbData.data.Record;
        const jsonRaw = record.pcfJsonMislaka;

        if (!jsonRaw) {
            return res.status(404).json({ error: "לא נמצא JSON מסלקה ברשומה זו" });
        }

        const data = typeof jsonRaw === "string" ? JSON.parse(jsonRaw) : jsonRaw;

        // Check if mislaka returned empty polisot
        const item = Array.isArray(data) ? data[0] : data;
        if (item && (!item.polisot || item.polisot.length === 0)) {
            return res.status(200).json({
                data: [],
                expired: true,
                status: item.status || "unknown",
                message: "נתוני המסלקה אינם זמינים, יש להזמין מסלקה חדשה"
            });
        }

        const dataArray = Array.isArray(data) ? data : [data];
        return res.status(200).json({ data: dataArray });

    } catch (err) {
        console.error("Error fetching mislaka data:", err);
        return res.status(500).json({ error: "שגיאה בטעינת הנתונים" });
    }
});

module.exports = router;
