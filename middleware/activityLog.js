const logger = require("../lib/logger");

const SKIP_PREFIXES = [
    "/health",
    "/admin/",
    "/api/admin/",
    "/api/log/frontend",
    "/api/whatsapp-templates/random",
    "/styles.css",
    "/app.js",
    "/favicon.ico"
];

const SKIP_EXTENSIONS = [".css", ".js", ".png", ".jpg", ".svg", ".ico", ".html", ".woff", ".woff2"];

function shouldLog(req) {
    const url = req.originalUrl || req.url || "";
    const pathOnly = url.split("?")[0];

    if (SKIP_PREFIXES.some(p => pathOnly.startsWith(p))) return false;
    if (SKIP_EXTENSIONS.some(ext => pathOnly.endsWith(ext))) return false;
    return true;
}

const ORPHAN_RULES = {
    "/create/insurance": ["pcfclient"],
    "/create/policy-insured": ["pcfsystemfield101", "pcfsystemfield102"],
    "/create/financial": ["accountid"],
    "/create/transfer": ["pcfFinancial"],
    "/create/financial-employer": ["pcfFinancial", "PCFEMPLOYER"],
    "/add-family-member": ["accountid"]
};

function detectOrphan(pathOnly, body) {
    const required = ORPHAN_RULES[pathOnly];
    if (!required || !body) return false;
    return required.some(field => {
        const v = body[field];
        return v === undefined || v === null || v === "";
    });
}

function extractFireberryRecordId(responseBody) {
    if (!responseBody || typeof responseBody !== "object") return null;
    const record = responseBody?.data?.Record;
    if (!record) return null;
    return record.opportunityid
        || record.contactid
        || record.accountid
        || record.customobject1018id
        || record.customobject1019id
        || record.customobject1022id
        || record.customobject1021id
        || record.customobject1017id
        || record.customobject1031id
        || record.customobject1009id
        || null;
}

function activityLog(req, res, next) {
    if (!shouldLog(req)) return next();

    const start = Date.now();
    const pathOnly = (req.originalUrl || req.url || "").split("?")[0];

    const sessionId = req.headers["x-session-id"] || null;
    const accountId = req.headers["x-account-id"] || null;
    const userId = req.headers["x-user-id"] || null;
    const sourceUrl = req.headers["referer"] || req.headers["origin"] || null;
    const userAgent = req.headers["user-agent"] || null;
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || req.connection?.remoteAddress || null;

    const requestBody = req.method === "GET" ? null : req.body;

    let responseBody = null;
    const originalJson = res.json.bind(res);
    res.json = function (body) {
        responseBody = body;
        return originalJson(body);
    };

    res.on("finish", () => {
        const duration = Date.now() - start;
        const isOrphan = res.statusCode < 400 && detectOrphan(pathOnly, requestBody);

        logger.logApiCall({
            session_id: sessionId,
            account_id: accountId,
            user_id: userId,
            source_url: sourceUrl,
            user_agent: userAgent,
            ip,
            method: req.method,
            path: pathOnly,
            request_body: requestBody,
            response_status: res.statusCode,
            response_body: responseBody,
            fireberry_record_id: extractFireberryRecordId(responseBody),
            duration_ms: duration,
            is_orphan: isOrphan,
            is_validation_failure: res.statusCode === 400
        });
    });

    next();
}

module.exports = activityLog;
