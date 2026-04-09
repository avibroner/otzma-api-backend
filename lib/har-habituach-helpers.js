const { postRequest, getRequest, putRequest, deleteRequest } = require("./fireberry");

// Search person by ID number in Fireberry (contacts then leads)
async function searchPerson(idNumber) {
    const idVariants = [idNumber];
    const stripped = idNumber.replace(/^0+/, "");
    if (stripped !== idNumber) idVariants.push(stripped);
    const padded = idNumber.padStart(9, "0");
    if (padded !== idNumber) idVariants.push(padded);

    // Search as insured (contacts)
    for (const id of idVariants) {
        const result = await postRequest("/query", {
            objecttype: "2",
            fields: "*",
            page_size: 500,
            query: `(pcfsystemfield127 = ${id})`,
        });
        const data = result?.data?.Data || [];
        if (data.length > 0) {
            return {
                insuredId: data[0].contactid,
                clientId: data[0].accountid,
                leadId: data[0].pcfsystemfield219 || "",
                personType: "insured",
            };
        }
    }

    // Search as lead
    for (const id of idVariants) {
        const result = await postRequest("/query", {
            objecttype: "1003",
            fields: "*",
            page_size: 500,
            query: `(pcfsystemfield101 = ${id})`,
        });
        const data = result?.data?.Data || [];
        if (data.length > 0) {
            return {
                insuredId: data[0].contactid || "",
                clientId: data[0].accountid || "",
                leadId: data[0].customobject1003id,
                personType: "lead",
            };
        }
    }

    return null;
}

// Fetch secondary branch + buffer options from Fireberry metadata
async function fetchFieldOptions() {
    const [branchRes, bufferRes] = await Promise.all([
        getRequest("/metadata/records/1005/fields/pcfsystemfield228/values"),
        getRequest("/metadata/records/1005/fields/pcfsystemfield229/values"),
    ]);

    const branchValues = branchRes?.data?.values || [];
    const bufferValues = bufferRes?.data?.values || [];

    const branchMap = {};
    for (const item of branchValues) branchMap[item.name] = item.value;

    const bufferMap = {};
    for (const item of bufferValues) bufferMap[item.name] = item.value;

    return { branchMap, bufferMap };
}

// Delete existing insurance mountain records for a person
async function deleteInsuranceMountain(person) {
    const queryStr = person.personType === "insured"
        ? `(pcfsystemfield139 = ${person.insuredId})`
        : `(pcfsystemfield223 = ${person.leadId})`;

    const result = await postRequest("/query", {
        objecttype: "1005",
        fields: "*",
        page_size: 500,
        query: queryStr,
    });
    const records = result?.data?.Data || [];
    const ids = records.map(r => r.customobject1005id);

    for (const id of ids) {
        await deleteRequest(`/record/1005/${id}`);
    }

    return ids.length;
}

// Create a single insurance mountain record
async function createInsuranceRecord(row, person, fieldOptions, bufferMapping, ownerId) {
    const branchId = fieldOptions.branchMap[row.secondaryBranch] || "";
    const bufferId = bufferMapping[row.secondaryBranch] || "";

    let warning;
    if (row.secondaryBranch && !branchId) {
        warning = `ענף משני "${row.secondaryBranch}" לא נמצא בפיירברי`;
    } else if (row.secondaryBranch && !bufferId) {
        warning = `ענף משני "${row.secondaryBranch}" לא ממופה לחוצץ`;
    }

    const payload = {
        pcfsystemfield139: person.insuredId,
        pcfsystemfield164: person.clientId,
        pcfsystemfield223: person.leadId,
        pcfsystemfield142: row.mainBranch,
        pcfsystemfield229: bufferId,
        pcfsystemfield228: branchId,
        pcfsystemfield148: row.productType,
        pcfsystemfield146: row.insuranceCompany,
        pcfsystemfield156: row.premium,
        pcfsystemfield154: row.premiumType,
        pcfsystemfield160: row.policyNumber,
        pcfsystemfield158: row.planClassification,
        pcfsystemfield162: "",
        pcfsystemfield227: row.sector,
        pcfsystemfield281: row.periodText,
        pcfsystemfield380: row.idNumber,
    };

    if (row.periodStart) payload.pcfsystemfield267 = row.periodStart;
    if (row.periodEnd) payload.pcfsystemfield269 = row.periodEnd;
    if (ownerId) payload.ownerid = ownerId;

    const res = await postRequest("/record/1005", payload);
    if (!res || res.success === false) {
        throw new Error(`Failed to create record: ${JSON.stringify(res)}`);
    }

    return { warning };
}

// Aggregate premiums and update insured/lead record
async function updatePremiumSummary(person) {
    const queryStr = person.personType === "insured"
        ? `(pcfsystemfield139 = ${person.insuredId})`
        : `(pcfsystemfield223 = ${person.leadId})`;

    const result = await postRequest("/query", {
        objecttype: "1005",
        fields: "*",
        page_size: 500,
        query: queryStr,
    });
    const records = result?.data?.Data || [];
    if (records.length === 0) return;

    const sums = {};
    for (const rec of records) {
        const bufferName = rec.pcfsystemfield229name || "";
        const classification = rec.pcfsystemfield158 || "";
        const premium = parseFloat(rec.pcfsystemfield156) || 0;
        const key = `${bufferName}-${classification}`;
        sums[key] = (sums[key] || 0) + premium;
    }

    const get = (key) => sums[key] || 0;

    let objecttype, objectid, fields;

    if (person.personType === "insured") {
        objecttype = "2";
        objectid = person.insuredId;
        fields = {
            pcfsystemfield237: get("חיים בריאות-אישי"),
            pcfsystemfield239: get("אלמנטרי-אישי"),
            pcfsystemfield241: get("תאונות וסיעוד-אישי"),
            pcfsystemfield243: get("א.כ.ע-אישי"),
            pcfsystemfield259: get("חיים בריאות-קבוצתי") + get("חיים בריאות-קבוצתי קופת חולים"),
            pcfsystemfield255: get("אלמנטרי-קבוצתי") + get("אלמנטרי-קבוצתי קופת חולים"),
            pcfsystemfield257: get("תאונות וסיעוד-קבוצתי") + get("תאונות וסיעוד-קבוצתי קופת חולים"),
            pcfsystemfield253: get("א.כ.ע-קבוצתי") + get("א.כ.ע-קבוצתי קופת חולים"),
        };
    } else {
        objecttype = "1003";
        objectid = person.leadId;
        fields = {
            pcfsystemfield230: get("חיים בריאות-אישי"),
            pcfsystemfield231: get("אלמנטרי-אישי"),
            pcfsystemfield233: get("תאונות וסיעוד-אישי"),
            pcfsystemfield235: get("א.כ.ע-אישי"),
            pcfsystemfield251: get("חיים בריאות-קבוצתי") + get("חיים בריאות-קבוצתי קופת חולים"),
            pcfsystemfield247: get("אלמנטרי-קבוצתי") + get("אלמנטרי-קבוצתי קופת חולים"),
            pcfsystemfield249: get("תאונות וסיעוד-קבוצתי") + get("תאונות וסיעוד-קבוצתי קופת חולים"),
            pcfsystemfield245: get("א.כ.ע-קבוצתי") + get("א.כ.ע-קבוצתי קופת חולים"),
        };
    }

    await putRequest(`/record/${objecttype}/${objectid}`, fields);
}

// Build unmapped record for notification
function buildUnmappedRecord(row, rowNumber) {
    return {
        rowNumber,
        secondaryBranch: row.secondaryBranch,
        mainBranch: row.mainBranch,
        productType: row.productType,
        insuranceCompany: row.insuranceCompany,
        policyNumber: row.policyNumber,
        premium: row.premium,
        premiumType: row.premiumType,
        periodText: row.periodText,
        planClassification: row.planClassification,
    };
}

// Send email alert for unmapped branches via Make webhook
async function notifyUnmappedBranches(unmappedRecords, idNumber, personType, totalRows, createdCount) {
    const webhookUrl = process.env.MAKE_ALERT_WEBHOOK_URL;
    if (!webhookUrl || unmappedRecords.length === 0) return;

    const branchNames = [...new Set(unmappedRecords.map(r => r.secondaryBranch))];

    try {
        await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                to: "Bnayaz@otzma-ins.co.il",
                subject: `התראה: ${unmappedRecords.length} רשומות ללא מיפוי חוצץ — ת.ז. ${idNumber}`,
                idNumber,
                personType,
                unmappedBranches: branchNames,
                unmappedCount: unmappedRecords.length,
                records: unmappedRecords,
                totalRows,
                createdCount,
            }),
        });
    } catch {
        // Alert is best-effort
    }
}

module.exports = {
    searchPerson,
    fetchFieldOptions,
    deleteInsuranceMountain,
    createInsuranceRecord,
    updatePremiumSummary,
    buildUnmappedRecord,
    notifyUnmappedBranches,
};
