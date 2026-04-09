const express = require("express");
const router = express.Router();
const { postRequest, getRequest } = require("../lib/fireberry");

// POST /api/mislaka/transfer
// Fireberry webhook: user clicked "ניידנו" on a mislaka product
// Receives: { productId } — the mislaka product record ID
// Creates: financial (opportunity) + employer in fund (1019) + transfer body (1017)
router.post("/transfer", async (req, res) => {
    try {
        const { productId } = req.body || {};
        console.log("Mislaka transfer received, productId:", productId);

        if (!productId) {
            return res.status(400).json({ error: "Missing productId" });
        }

        // Step 1: Fetch the mislaka product record from Fireberry
        // TODO: Replace XXXX with actual mislaka product object ID
        // const productData = await getRequest(`/record/XXXX/${productId}`);
        // const product = productData?.data?.Record;

        // Step 2: Create financial record (opportunity)
        // Same logic as quotes: POST /record/opportunity
        // const financial = await postRequest("/record/opportunity", {
        //     accountid: product.accountid,
        //     contacttid: product.pcfContactId,
        //     pcfCompany: product.pcfCompanyId,
        //     pcfProduct: product.pcfProductId,
        //     pcfManagementFeeAccumulation: product.pcfMgmtFeeAccum,
        //     pcfOperationalStatus: "ניוד מסלקה",
        //     pcfsystemfield140: new Date().toISOString().split("T")[0],
        // });
        // const financialId = financial?.data?.id;

        // Step 3: Create employer in fund (1019) — if employer exists
        // if (product.pcfEmployerId) {
        //     await postRequest("/record/1019", {
        //         pcfFinancial: financialId,
        //         pcfEmployer: product.pcfEmployerId,
        //     });
        // }

        // Step 4: Create transfer body (1017)
        // await postRequest("/record/1017", {
        //     pcfFinancial: financialId,
        //     pcfTransferringBody: product.pcfCompanyId,
        //     pcfExpectedTransfer1: product.pcfAccumulation,
        //     pcfsystemfield109: new Date().toISOString().split("T")[0],
        // });

        return res.status(200).json({
            success: true,
            message: "Transfer records created",
            productId
            // financialId
        });

    } catch (err) {
        console.error("Mislaka transfer error:", err);
        return res.status(500).json({ error: err.message || "Internal server error" });
    }
});

module.exports = router;
