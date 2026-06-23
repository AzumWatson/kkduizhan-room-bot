const fs = require("fs/promises");
const path = require("path");
const { createHash, webcrypto } = require("crypto");

const SIGN_SECRET = "Wa9ci7PQEycKniPPlCyddc8HZWobjsGF";
const PASSWORD_AES_KEY = "asdh9asuhdaosdajasdh9asuhdaosdaj";

function sortJsonByKey(object) {
    return Object.keys(object)
        .sort()
        .reduce((sorted, key) => {
            sorted[key] = object[key];
            return sorted;
        }, {});
}

function signBody(body) {
    const payload = JSON.stringify(sortJsonByKey(body));
    return createHash("md5")
        .update(payload + SIGN_SECRET)
        .digest("hex");
}

async function encryptPassword(plainPassword, timestamp) {
    const iv = webcrypto.getRandomValues(new Uint8Array(16));
    const encoder = new TextEncoder();
    const data = encoder.encode(`${timestamp},${plainPassword}`);
    const key = await webcrypto.subtle.importKey(
        "raw",
        encoder.encode(PASSWORD_AES_KEY),
        { name: "AES-CBC" },
        false,
        ["encrypt"]
    );
    const encrypted = await webcrypto.subtle.encrypt({ name: "AES-CBC", iv }, key, data);
    const output = new Uint8Array(iv.length + encrypted.byteLength);
    output.set(iv);
    output.set(new Uint8Array(encrypted), iv.length);
    return Buffer.from(output).toString("base64");
}

function buildRoomQueryBody(config, session, roomName) {
    const body = {
        page: 1,
        size: config.roomListSize,
        map_id: 0,
        team_id: 0,
        only_map_id: 0,
        room_name: String(roomName || ""),
        map_source: -1,
        room_status: -1,
        no_password: false,
        c_version: config.clientVersion,
        c_channel: config.channel,
        stamp: Date.now().toString(),
        sid: session.sid,
    };

    if (session.uid !== undefined && session.uid !== null && session.uid !== "") {
        const uid = Number(session.uid);
        if (Number.isFinite(uid)) {
            body.uid = uid;
        }
    }

    body.sign = signBody(body);
    return body;
}

async function requestJson(url, requestOptions, fetchTimeoutMs) {
    if (typeof fetch !== "function") {
        throw new Error("当前 Node.js 版本不支持 fetch，请使用 Node.js 18 或更新版本。");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);

    let response;
    try {
        response = await fetch(url, {
            ...requestOptions,
            signal: controller.signal,
        });
    } catch (err) {
        if (err && err.name === "AbortError") {
            throw new Error(`80dz 接口请求超时（${fetchTimeoutMs}ms）`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }

    const text = await response.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch {
        throw new Error(`80dz 接口返回非 JSON，HTTP=${response.status}`);
    }

    if (!response.ok) {
        const msg = json && typeof json.message === "string" ? json.message : "HTTP 请求失败";
        throw new Error(`80dz 接口请求失败，HTTP=${response.status}，${msg}`);
    }

    return json;
}

function normalizeSession(raw) {
    if (!raw || typeof raw !== "object") return null;

    const sid = String(raw.sid || raw.hs_token || "").trim();
    if (!sid) return null;

    const userInfo = raw.user_info && typeof raw.user_info === "object" ? raw.user_info : {};
    const uid = raw.uid !== undefined && raw.uid !== "" ? raw.uid : userInfo.uid;

    return {
        sid,
        token: raw.token || raw.war3_token || "",
        uid,
        user_info: userInfo,
        savedAt: raw.savedAt || raw.saved_at || "",
    };
}

class Dz80ApiClient {
    constructor(config) {
        this.config = config;
        this.session = normalizeSession({
            sid: config.sid,
            token: config.token,
            uid: config.uid,
        });
        this.loginPromise = null;
    }

    async loadCachedSession() {
        if (this.session) return this.session;

        const cacheFile = this.config.sessionCacheFile;
        if (!cacheFile) return null;

        let text;
        try {
            text = await fs.readFile(cacheFile, "utf8");
        } catch (err) {
            if (err && err.code === "ENOENT") return null;
            throw err;
        }

        let cached;
        try {
            cached = JSON.parse(text);
        } catch {
            return null;
        }

        const session = normalizeSession(cached);
        if (session) {
            this.session = session;
        }
        return session;
    }

    async saveSession(session) {
        const normalized = normalizeSession(session);
        if (!normalized) return null;

        this.session = normalized;

        const cacheFile = this.config.sessionCacheFile;
        if (!cacheFile) return normalized;

        await fs.mkdir(path.dirname(cacheFile), { recursive: true });
        await fs.writeFile(
            cacheFile,
            `${JSON.stringify(
                {
                    sid: normalized.sid,
                    token: normalized.token || "",
                    uid: normalized.uid || "",
                    user_info: normalized.user_info || {},
                    savedAt: normalized.savedAt || new Date().toISOString(),
                },
                null,
                2
            )}\n`,
            "utf8"
        );

        return normalized;
    }

    async login() {
        if (this.loginPromise) return this.loginPromise;

        this.loginPromise = this.performLogin().finally(() => {
            this.loginPromise = null;
        });

        return this.loginPromise;
    }

    async performLogin() {
        const timestamp = Date.now();
        const body = {
            country_code: this.config.countryCode,
            userName: this.config.username,
            password: await encryptPassword(this.config.password, timestamp),
            timestamp,
            channel: this.config.channel,
            remoteip: "",
            exchange_password: "",
        };

        const url = new URL(this.config.loginEndpoint);
        if (!url.searchParams.has("_ts")) {
            url.searchParams.set("_ts", Date.now().toString());
        }

        const json = await requestJson(
            url.toString(),
            {
                method: "POST",
                headers: {
                    "User-Agent": "80Platform",
                    Accept: "application/json, text/javascript, */*; q=0.01",
                    "Content-Type": "application/json",
                    client_version: this.config.clientVersion,
                    origin: "https://online.80dzgame.com",
                    referer: "https://online.80dzgame.com/",
                },
                body: JSON.stringify(body),
            },
            this.config.fetchTimeoutMs
        );

        const data = json && json.data ? json.data : {};
        if (!data.hs_token) {
            const msg = json && (json.msg || json.message) ? json.msg || json.message : "登录响应缺少 hs_token";
            throw new Error(`80dz 登录失败：${msg}`);
        }

        return this.saveSession({
            sid: data.hs_token,
            token: data.token || "",
            uid: data.user_info ? data.user_info.uid : "",
            user_info: data.user_info || {},
            savedAt: new Date().toISOString(),
        });
    }

    async requestRooms(session, roomName) {
        const body = buildRoomQueryBody(this.config, session, roomName);

        return requestJson(
            this.config.roomsEndpoint,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    origin: "https://online.80dzgame.com",
                    referer: "https://online.80dzgame.com/lianjiNew/main/index.html",
                    "user-agent": "Mozilla/5.0",
                },
                body: JSON.stringify(body),
            },
            this.config.fetchTimeoutMs
        );
    }

    async fetchRooms(roomName) {
        let session = await this.loadCachedSession();
        if (!session) {
            session = await this.login();
        }

        let json = await this.requestRooms(session, roomName);
        if (json && json.code === 0) {
            this.session = session;
            return json;
        }

        if (json && json.code === 6) {
            session = await this.login();
            json = await this.requestRooms(session, roomName);
        }

        return json;
    }
}

function createDz80ApiClient(config) {
    return new Dz80ApiClient(config);
}

module.exports = {
    createDz80ApiClient,
    Dz80ApiClient,
    buildRoomQueryBody,
    signBody,
};
