function basicAuth(req, res, next) {
    const expectedUser = process.env.ADMIN_USER;
    const expectedPass = process.env.ADMIN_PASS;

    if (!expectedUser || !expectedPass) {
        return res.status(503).json({
            error: "Admin auth not configured. Set ADMIN_USER and ADMIN_PASS env vars."
        });
    }

    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Basic ")) {
        res.set("WWW-Authenticate", 'Basic realm="otzma-admin"');
        return res.status(401).send("Authentication required");
    }

    const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
    const [user, pass] = decoded.split(":");

    if (user !== expectedUser || pass !== expectedPass) {
        res.set("WWW-Authenticate", 'Basic realm="otzma-admin"');
        return res.status(401).send("Invalid credentials");
    }

    next();
}

module.exports = basicAuth;
