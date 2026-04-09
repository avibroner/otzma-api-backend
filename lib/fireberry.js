const CRM_TOKEN = "5322e743-f68c-449f-a8b4-d05db3dd77a6";

async function postRequest(path, body) {
    try {
        const response = await fetch(`https://api.fireberry.com/api${path}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "tokenid": CRM_TOKEN
            },
            body: JSON.stringify(body)
        });
        return await response.json();
    } catch (error) {
        console.error("Fireberry POST error:", error);
        return null;
    }
}

async function getRequest(path) {
    try {
        const isMetadata = path.startsWith("/metadata");
        const baseUrl = isMetadata
            ? "https://api.fireberry.com"
            : "https://api.fireberry.com/api";

        const url = `${baseUrl}${path}${path.includes("?") ? "&" : "?"}tokenid=${CRM_TOKEN}`;

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "accept": "application/json",
                "Content-Type": "application/json"
            }
        });

        return await response.json();
    } catch (error) {
        console.error("Fireberry GET error:", error);
        throw error;
    }
}

async function putRequest(path, body) {
    try {
        const response = await fetch(`https://api.fireberry.com/api${path}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "tokenid": CRM_TOKEN
            },
            body: JSON.stringify(body)
        });
        return await response.json();
    } catch (error) {
        console.error("Fireberry PUT error:", error);
        return null;
    }
}

async function deleteRequest(path) {
    try {
        const response = await fetch(`https://api.fireberry.com/api${path}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                "tokenid": CRM_TOKEN
            }
        });
        return await response.json();
    } catch (error) {
        console.error("Fireberry DELETE error:", error);
        return null;
    }
}

module.exports = { postRequest, getRequest, putRequest, deleteRequest, CRM_TOKEN };
