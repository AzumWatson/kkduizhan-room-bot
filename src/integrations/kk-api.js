function buildRoomListByMapIdUrl({ endpoint, mapId, limit }) {
    const u = new URL(endpoint);
    u.searchParams.set("mapId", String(mapId));
    u.searchParams.set("limit", String(limit));
    u.searchParams.set("roomName", "");
    u.searchParams.set("start", "0");
    u.searchParams.set("gameType", "war3rpg");
    u.searchParams.set("modeIndex", "");
    return u.toString();
}

function buildRoomListByNameUrl({ endpoint, roomName, limit }) {
    const u = new URL(endpoint);
    u.searchParams.set("limit", String(limit));
    u.searchParams.set("mode", "");
    u.searchParams.set("gameType", "war3rpg");
    u.searchParams.set("start", "0");
    u.searchParams.set("roomName", roomName);
    u.searchParams.set("onlyWatchable", "0");
    return u.toString();
}

function buildChangelogUrl({ endpoint, mapId, start = 0, limit = 1 }) {
    const u = new URL(endpoint);
    u.searchParams.set("mapId", String(mapId));
    u.searchParams.set("start", String(start));
    u.searchParams.set("limit", String(limit));
    return u.toString();
}

async function requestJson(url, { token, fetchTimeoutMs }) {
    if (!token) throw new Error("KK_TOKEN 未配置");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);

    let res;
    try {
        res = await fetch(url, {
            method: "GET",
            headers: {
                accept: "application/json, text/plain, */*",
                "accept-language": "zh-CN,zh;q=0.9",
                token,
                "x-kk-ag": "4",
                "x-web-channel": "web",
                Referer: "https://kk.kkdzpt.com/",
            },
            signal: controller.signal,
        });
    } catch (err) {
        if (err && err.name === "AbortError") {
            throw new Error(`接口请求超时（${fetchTimeoutMs}ms）`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }

    const body = await res.text();
    let json = null;
    try {
        json = JSON.parse(body);
    } catch {
        throw new Error(`接口返回非 JSON，HTTP=${res.status}`);
    }

    if (!res.ok) {
        const msg = json && typeof json.message === "string" ? json.message : "HTTP 请求失败";
        throw new Error(`接口请求失败，HTTP=${res.status}，${msg}`);
    }

    return json;
}

async function fetchRoomListByMapId({ endpoint, mapId, limit, token, fetchTimeoutMs }) {
    return requestJson(buildRoomListByMapIdUrl({ endpoint, mapId, limit }), {
        token,
        fetchTimeoutMs,
    });
}

async function fetchRoomListByName({ endpoint, roomName, limit, token, fetchTimeoutMs }) {
    return requestJson(buildRoomListByNameUrl({ endpoint, roomName, limit }), {
        token,
        fetchTimeoutMs,
    });
}

async function fetchMapChangelog({ endpoint, mapId, start = 0, limit = 1, token, fetchTimeoutMs }) {
    return requestJson(buildChangelogUrl({ endpoint, mapId, start, limit }), {
        token,
        fetchTimeoutMs,
    });
}

module.exports = {
    fetchRoomListByMapId,
    fetchRoomListByName,
    fetchMapChangelog,
};
