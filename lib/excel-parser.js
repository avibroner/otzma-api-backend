const XLSX = require("xlsx");

const SECTOR_MAP = {
    "תחום - כללי": 1,
    "תחום - בריאות ותאונות אישיות": 2,
    "תחום - חיים ואבדן כושר עבודה": 3,
};

function parsePeriod(periodText) {
    if (!periodText || !periodText.includes("-")) {
        return { start: null, end: null };
    }

    const parts = periodText.split(" - ");
    if (parts.length !== 2) return { start: null, end: null };

    try {
        const startParts = parts[0].trim().split("/");
        const endParts = parts[1].trim().split("/");

        if (startParts.length !== 3 || endParts.length !== 3) {
            return { start: null, end: null };
        }

        const startDate = new Date(parseInt(startParts[2]), parseInt(startParts[1]) - 1, parseInt(startParts[0]));
        const endDate = new Date(parseInt(endParts[2]), parseInt(endParts[1]) - 1, parseInt(endParts[0]));

        const formatDate = (d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, "0");
            const day = String(d.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}T12:00:00.000Z`;
        };

        return { start: formatDate(startDate), end: formatDate(endDate) };
    } catch {
        return { start: null, end: null };
    }
}

function fixSheetRange(sheet) {
    let maxRow = 0;
    let maxCol = 0;
    for (const key of Object.keys(sheet)) {
        if (key.startsWith("!")) continue;
        const cell = XLSX.utils.decode_cell(key);
        if (cell.r > maxRow) maxRow = cell.r;
        if (cell.c > maxCol) maxCol = cell.c;
    }
    sheet["!ref"] = XLSX.utils.encode_range({ r: 0, c: 0 }, { r: maxRow, c: maxCol });
}

function parseExcel(buffer, filename) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    fixSheetRange(sheet);

    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    let idNumber = null;
    let currentSector = 1;
    const rows = [];

    let dataStartIndex = 4;
    for (let i = 0; i < Math.min(data.length, 10); i++) {
        const firstCell = String(data[i]?.[0] || "").trim();
        if (firstCell === "תעודת זהות") {
            dataStartIndex = i + 1;
            break;
        }
    }

    for (let i = dataStartIndex; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        const colA = String(row[0] || "").trim();
        const colB = String(row[1] || "").trim();
        const colJ = String(row[9] || "").trim();

        if (!idNumber && colA && /^\d+$/.test(colA)) {
            idNumber = colA;
        }

        if (colB.startsWith("תחום -") && !colJ) {
            const sectorValue = SECTOR_MAP[colB];
            if (sectorValue) currentSector = sectorValue;
            continue;
        }

        if (colJ) {
            const periodText = String(row[5] || "");
            const { start, end } = parsePeriod(periodText);
            rows.push({
                mainBranch: colB,
                secondaryBranch: String(row[2] || "").trim(),
                productType: String(row[3] || "").trim(),
                insuranceCompany: String(row[4] || "").trim(),
                periodText,
                periodStart: start,
                periodEnd: end,
                premium: String(row[7] || "").trim(),
                premiumType: String(row[8] || "").trim(),
                policyNumber: colJ,
                planClassification: String(row[10] || "").trim(),
                sector: currentSector,
                idNumber: colA || "",
            });
        }
    }

    if (!idNumber) {
        throw new Error("לא נמצאה תעודת זהות בקובץ. וודא שעמודה A מכילה מספר ת.ז.");
    }

    return { idNumber, rows };
}

module.exports = { parseExcel };
