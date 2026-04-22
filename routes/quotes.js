const express = require("express");
const router = express.Router();
const { postRequest, getRequest } = require("../lib/fireberry");

// Add New Family Member
router.post("/add-family-member", async (req, res) => {
    try {
        const response = await postRequest("/record/contact", { ...req.body });
        res.json(response);
    } catch (err) {
        console.error("add-family-member error:", err);
        res.status(500).json({ error: "failed to create family member", details: err?.message || err });
    }
});

// Get Account
router.get("/get_account/:id", async (req, res) => {
    const { id } = req.params;
    const response = await getRequest(`/record/account/${id}`);
    res.json(response);
});

// Get Products (insurance / financial / pension)
router.get("/get_products", async (req, res) => {
    const ins_products = [];
    const fin_products = [];
    const pension_products = [];

    const product_response = await getRequest("/record/product");

    product_response["data"]["Records"].forEach((product) => {
        if (product.categoryname === "ביטוחי") {
            if (product.name != null) {
                ins_products.push({ name: product.name, id: product.productid });
            }
        } else if (product.categoryname === "פיננסי") {
            if (product.name != null) {
                fin_products.push({ name: product.name, id: product.productid });
            }
        } else if (product.categoryname === "פנסיוני") {
            if (product.name != null) {
                pension_products.push({ name: product.name, id: product.productid });
            }
        }
    });

    res.json({
        "ביטוח": { id: "insurance", type: "ins", products: ins_products },
        "פיננסים": { id: "finance", type: "fin", products: fin_products },
        "פנסיוני": { id: "pension", type: "fin", products: pension_products }
    });
});

// Get Companies
router.get("/get_companies", async (req, res) => {
    try {
        const companies_response = await getRequest("/record/1016");
        const companies = [];

        companies_response?.data?.Records?.forEach(company => {
            companies.push({
                company_id: company.customobject1016id,
                company_name: company.name,
                company_type: company.pcfsystemfield100 || null,
                transfer_only: company.pcfsystemfield101 || null
            });
        });

        res.json({ companies });
    } catch (err) {
        console.error("get_companies error:", err);
        res.status(500).json({ error: "failed to fetch companies" });
    }
});

// Get Policy Mortgage Picklist
router.get("/get_policy_mortgage_options", async (req, res) => {
    try {
        const fbResponse = await getRequest("/metadata/records/1022/fields/pcfsystemfield123/values");
        const values = fbResponse?.data?.values;

        if (!Array.isArray(values)) {
            return res.json({ options: [] });
        }

        return res.json({
            options: values.map(v => ({ value: v.value, label: v.name }))
        });
    } catch (err) {
        console.error("get_policy_mortgage_options error:", err);
        return res.status(500).json({ error: "failed to fetch mortgage options" });
    }
});

// Get Family Members
router.post("/get_familyMembers", async (req, res) => {
    const { account_id } = req.body;

    async function fetchFamilyMembers(retryCount = 0) {
        try {
            const familyMembers_response = await postRequest(`/query`, {
                objecttype: 2,
                fields: "fullname,contactid,pcfsystemfield127,pcfsystemfield125,pcfsystemfield131",
                query: `accountid = '${account_id}'`
            });

            const list = [];
            familyMembers_response.data.Data.forEach(member => {
                list.push({
                    member_name: member.fullname,
                    member_uid: member.contactid,
                    member_id: member.pcfsystemfield127,
                    member_relation: member.pcfsystemfield125,
                    member_birthDate: member.pcfsystemfield131 || null
                });
            });
            return list;
        } catch (err) {
            if (retryCount < 3) {
                await new Promise(r => setTimeout(r, 500));
                return fetchFamilyMembers(retryCount + 1);
            }
            throw err;
        }
    }

    try {
        const familyMembers = await fetchFamilyMembers();
        return res.json({ familyMembers });
    } catch (error) {
        return res.status(500).json({ error: "server error" });
    }
});

// Create Records
router.post("/create/insurance", async (req, res) => {
    const response = await postRequest("/record/1022", { ...req.body });
    res.json(response);
});

router.post("/create/policy-insured", async (req, res) => {
    const response = await postRequest("/record/1021", { ...req.body });
    res.json(response);
});

router.post("/create/financial", async (req, res) => {
    const response = await postRequest("/record/opportunity", { ...req.body });
    res.json(response);
});

router.post("/create/transfer", async (req, res) => {
    const response = await postRequest("/record/1017", { ...req.body });
    res.json(response);
});

router.post("/find/employer", async (req, res) => {
    const { companyNumber } = req.body;
    const response = await postRequest("/query", {
        objecttype: 1018,
        fields: "customobject1018id,pcfCompanyNumber,name",
        query: `pcfCompanyNumber = '${companyNumber}'`
    });
    res.json(response);
});

router.post("/create/employer", async (req, res) => {
    const response = await postRequest("/record/1018", { ...req.body });
    res.json(response);
});

router.post("/create/financial-employer", async (req, res) => {
    const response = await postRequest("/record/1019", { ...req.body });
    res.json(response);
});

// 🏢 שליפת יחידה עסקית של משתמש (לשיוך פוליסה/פיננסים ליחידה הנכונה)
router.post("/get/user-bu", async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.json({ businessUnitId: null });

    const response = await postRequest("/query", {
        objecttype: 9,
        fields: "crmuserid,businessunitid",
        query: `crmuserid = '${userId}'`,
        page_size: 1
    });

    const businessUnitId = response?.data?.Data?.[0]?.businessunitid || null;
    res.json({ businessUnitId });
});

module.exports = router;
