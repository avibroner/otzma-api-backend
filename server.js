console.log("SERVER STARTED - CONTEXT VERSION");



const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(express.json());
app.use(cors({ origin: "*" }));

// 👈 רק אחרי ש-path מוגדר

app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

const crm_token = "5322e743-f68c-449f-a8b4-d05db3dd77a6";



// query
// Api Functions
async function postRequest(path, body) {
    try {
        const response = await fetch(`https://api.fireberry.com/api${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                'Access-Control-Allow-Origin': '*',
                "tokenid": crm_token
            },
            body: JSON.stringify(body)
        });
        return await response.json();
    } catch (error) {
        console.error("Request error:" + error);
        return null;
    }
}

async function getRequest(path) {
    try {
        const response = await fetch(`https://api.fireberry.com/api${path}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                'Access-Control-Allow-Origin': '*',
                "tokenid": crm_token
            }
        });
        console.log(response)
        return await response.json()
    } catch (error) {
        console.log(error)
        console.error("Error: " + error)
    }
}

// Routes 
app.get("/health-check", async (req, res) => {
    res.json({
        "status": 200
    });
});

//? Add New Family Member
app.post("/add-family-member", async (req, res) => {
    try {
        console.log("📥 /add-family-member body from client:", req.body);

        const response = await postRequest("/record/contact", {
            ...req.body
        });

        console.log("📤 Fireberry response:", response);
        res.json(response);

    } catch (err) {
        console.error("❌ add-family-member error:", err);
        res.status(500).json({
            error: "failed to create family member",
            details: err?.message || err
        });
    }
});

// -------------------------------------------------- //
app.get("/get_account/:id", async (req, res) => {
    const { id } = req.params;

    const response = await getRequest(`/record/account/${id}`);
    res.json(response);
});

app.get("/get_products", async (req, res) => {
    const ins_products = [];
    const fin_products = [];
    const pension_products = [];


    const product_response = await getRequest("/record/product");

    product_response["data"]["Records"].forEach((product) => {
        if (product.categoryname === "ביטוחי") {
            if (product.name != null) {
                ins_products.push({
                    name: product.name,
                    id: product.productid
                });
            }
        }
        else if (product.categoryname === "פיננסי") {
            if (product.name != null) {
                fin_products.push({
                    name: product.name,
                    id: product.productid
                });
            }
        }
        else if (product.categoryname === "פנסיוני") {
            if (product.name != null) {
                pension_products.push({
                    name: product.name,
                    id: product.productid
                });
            }
        }
    });


    res.json({
        "ביטוח": {
            id: "insurance",
            type: "ins",
            products: ins_products
        },
        "פיננסים": {
            id: "finance",
            type: "fin",
            products: fin_products
        },
        "פנסיוני": {
            id: "pension",
            type: "fin", // 👈 חשוב!
            products: pension_products
        }
    });

});

app.get("/get_companies", async (req, res) => {
    try {
        const companies_response = await getRequest("/record/1016");

        const companies = [];

        companies_response?.data?.Records?.forEach(company => {
            companies.push({
                company_id: company.customobject1016id,
                company_name: company.name,
                company_type: company.pcfsystemfield100 || null,
                transfer_only: company.pcfsystemfield101 || null // "כן" / "לא"
            });

        });

        res.json({ companies });

    } catch (err) {
        console.error("❌ get_companies error:", err);
        res.status(500).json({ error: "failed to fetch companies" });
    }
});

app.post("/get_familyMembers", async (req, res) => {
    const { account_id } = req.body;

    async function fetchFamilyMembers(retryCount = 0) {
        try {
            const familyMembers_response = await postRequest(`/query`, {
                objecttype: 2,
                fields: "fullname,contactid,pcfsystemfield127,pcfsystemfield125,pcfsystemfield131",
                query: `accountid = '${account_id}'`
            });

            console.log("RAW RESPONSE:", familyMembers_response);

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
            console.log(`❌ Error attempt ${retryCount + 1}`, err);

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
        console.log("❌ FINAL ERROR:", error);
        return res.status(500).json({ error: "server error" });
    }
});
// -------------------------------------------------- //
//? Add New Offers
app.post("/create/insurance", async (req, res) => {
    const response = await postRequest("/record/1022", {
        ...req.body
    });

    res.json(response);
});

app.post("/create/policy-insured", async (req, res) => {
    const response = await postRequest(`/record/1021`, {
        ...req.body
    });
    res.json(response);
});

app.post("/create/financial", async (req, res) => {
    const response = await postRequest(`/record/opportunity`, {
        ...req.body
    });
    res.json(response);
});

app.post("/create/transfer", async (req, res) => {
    const response = await postRequest(`/record/1017`, {
        ...req.body
    });
    res.json(response);
});

// חיפוש מעסיק לפי ח.פ
app.post("/find/employer", async (req, res) => {
    const { companyNumber } = req.body;

    const response = await postRequest("/query", {
        objecttype: 1018,
        fields: "customobject1018id,pcfCompanyNumber,name",
        query: `pcfCompanyNumber = '${companyNumber}'`
    });

    res.json(response);
});

// יצירת מעסיק
app.post("/create/employer", async (req, res) => {
    const response = await postRequest("/record/1018", {
        ...req.body
    });
    res.json(response);
});

// יצירת מעסיק בקופה
app.post("/create/financial-employer", async (req, res) => {
    const response = await postRequest("/record/1019", {
        ...req.body
    });
    res.json(response);
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});


app.use(express.static(path.join(__dirname, "public")));

// ---------------------


const PORT = 3000;
app.listen(PORT, () => {
    console.log("Listening on port", PORT);
});
