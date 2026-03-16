const fs = require("fs");
const path = require("path");

const DEFAULT_GROUP_IDS = [1111111, 2222222, 3333333];
const DEFAULT_WS_URL = "ws://127.0.0.1:3001/";
const DEFAULT_KK_ROOMS_ENDPOINT =
    "https://kk-web-gateway.kkdzpt.com/platform-map-api/api/v3/map/w3_roomList";
const DEFAULT_KK_CHANGELOG_ENDPOINT =
    "https://kk-web-gateway.kkdzpt.com/platform-map-api/api/v3/map/changelogs";

function parseDotEnvValue(rawValue) {
    const value = String(rawValue == null ? "" : rawValue).trim();
    if (!value) return "";

    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        const unquoted = value.slice(1, -1);
        if (value.startsWith("\"")) {
            return unquoted
                .replace(/\\n/g, "\n")
                .replace(/\\r/g, "\r")
                .replace(/\\t/g, "\t");
        }
        return unquoted;
    }

    return value;
}

function loadDotEnvFromCwd(cwd = process.cwd()) {
    const envPath = path.join(cwd, ".env");
    if (!fs.existsSync(envPath)) return {};

    const content = fs.readFileSync(envPath, "utf8");
    const out = {};

    for (const rawLine of content.split(/\r?\n/)) {
        let line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;

        if (line.startsWith("export ")) {
            line = line.slice(7).trim();
        }

        const idx = line.indexOf("=");
        if (idx <= 0) continue;

        const key = line.slice(0, idx).trim();
        if (!key) continue;

        out[key] = parseDotEnvValue(line.slice(idx + 1));
    }

    return out;
}

function parsePositiveInt(raw, fallback) {
    if (raw == null || raw === "") return fallback;

    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.floor(n);
}

function normalizeEndpoint(raw, fallback) {
    const candidate = (raw || "").trim();
    if (!candidate) return fallback;

    try {
        const u = new URL(candidate);
        u.search = "";
        u.hash = "";
        return u.toString();
    } catch {
        return fallback;
    }
}

function parseGroupIds(raw) {
    const text = (raw || "").trim();
    if (!text) return null;

    const ids = text
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((n) => Math.floor(n));

    return ids.length ? new Set(ids) : null;
}

function normalizeAliasKey(text) {
    return String(text || "")
        .trim()
        .toLowerCase();
}

function parseMapAliases(raw) {
    const aliasMap = new Map();
    const text = (raw || "").trim();
    if (!text) return aliasMap;

    const items = text
        .split(";")
        .map((x) => x.trim())
        .filter(Boolean);

    for (const item of items) {
        const idx = item.indexOf(",");
        if (idx <= 0 || idx >= item.length - 1) continue;

        const mapId = Number(item.slice(0, idx).trim());
        const alias = item.slice(idx + 1).trim();
        if (!Number.isFinite(mapId) || mapId <= 0 || !alias) continue;

        aliasMap.set(normalizeAliasKey(alias), {
            mapId: Math.floor(mapId),
            alias,
        });
    }

    return aliasMap;
}

function parseGroupDefaultMapIds(raw) {
    const out = new Map();
    const text = (raw || "").trim();
    if (!text) return out;

    const items = text
        .split(";")
        .map((x) => x.trim())
        .filter(Boolean);

    for (const item of items) {
        const sep = item.includes(":") ? ":" : "=";
        const idx = item.indexOf(sep);
        if (idx <= 0 || idx >= item.length - 1) continue;

        const groupId = Number(item.slice(0, idx).trim());
        const mapId = Number(item.slice(idx + 1).trim());
        if (!Number.isFinite(groupId) || groupId <= 0) continue;
        if (!Number.isFinite(mapId) || mapId <= 0) continue;

        out.set(Math.floor(groupId), Math.floor(mapId));
    }

    return out;
}

function loadConfig(env = process.env) {
    const runtimeEnv = {
        ...loadDotEnvFromCwd(),
        ...env,
    };

    const roomInfoTriggerText = (runtimeEnv.ROOM_INFO_TRIGGER_TEXT || runtimeEnv.TRIGGER_TEXT || "房间信息").trim();
    const changelogTriggerText = (runtimeEnv.CHANGELOG_TRIGGER_TEXT || "更新信息").trim();

    return {
        ws: {
            url: runtimeEnv.NAPCAT_WS_URL || DEFAULT_WS_URL,
            token: (runtimeEnv.NAPCAT_TOKEN || "").trim(),
            reconnectDelayMs: parsePositiveInt(runtimeEnv.WS_RECONNECT_DELAY_MS, 3000),
        },
        bot: {
            cooldownMs: parsePositiveInt(runtimeEnv.COOLDOWN_MS, 5000),
            targetGroups: parseGroupIds(runtimeEnv.GROUP_IDS) || new Set(DEFAULT_GROUP_IDS),
            commands: {
                roomInfo: {
                    triggerText: roomInfoTriggerText,
                },
                changelog: {
                    triggerText: changelogTriggerText,
                },
            },
        },
        kk: {
            roomsEndpoint: normalizeEndpoint(
                runtimeEnv.KK_ROOMS_ENDPOINT || runtimeEnv.ROOMS_URL || DEFAULT_KK_ROOMS_ENDPOINT,
                DEFAULT_KK_ROOMS_ENDPOINT
            ),
            changelogEndpoint: normalizeEndpoint(
                runtimeEnv.KK_CHANGELOGS_ENDPOINT || DEFAULT_KK_CHANGELOG_ENDPOINT,
                DEFAULT_KK_CHANGELOG_ENDPOINT
            ),
            token: (runtimeEnv.KK_TOKEN || "").trim(),
            fetchTimeoutMs: parsePositiveInt(runtimeEnv.FETCH_TIMEOUT_MS, 10000),
            defaultMapId: parsePositiveInt(runtimeEnv.KK_DEFAULT_MAP_ID, 12860),
            defaultMapIdByGroup: parseGroupDefaultMapIds(runtimeEnv.GROUP_DEFAULT_MAP_IDS || ""),
            mapListLimit: parsePositiveInt(runtimeEnv.KK_MAP_LIST_LIMIT, 32),
            roomNameListLimit: parsePositiveInt(runtimeEnv.KK_ROOM_NAME_LIST_LIMIT, 12),
            changelogLimit: parsePositiveInt(runtimeEnv.KK_CHANGELOG_LIMIT, 1),
            aliases: parseMapAliases(runtimeEnv.MAP_ALIASES || ""),
        },
        render: {
            width: parsePositiveInt(runtimeEnv.CANVAS_WIDTH, 974),
            maxRows: parsePositiveInt(runtimeEnv.MAX_ROWS, 18),
            changelogWidth: parsePositiveInt(runtimeEnv.CHANGELOG_CANVAS_WIDTH, 920),
            errorWidth: parsePositiveInt(runtimeEnv.ERROR_CANVAS_WIDTH, 860),
        },
        logging: {
            logDir: (runtimeEnv.LOG_DIR || path.join(process.cwd(), "logs")).trim(),
            fileName: (runtimeEnv.LOG_FILE || "kkbot.log").trim(),
        },
    };
}

function validateConfig(config) {
    if (!config.kk.token) {
        throw new Error("缺少 KK_TOKEN，请在环境变量中配置后再启动。");
    }

    if (!config.bot.targetGroups || config.bot.targetGroups.size === 0) {
        throw new Error("GROUP_IDS 为空，至少需要一个目标群号。");
    }

    const roomTrigger = config.bot.commands && config.bot.commands.roomInfo
        ? String(config.bot.commands.roomInfo.triggerText || "").trim()
        : "";
    const changelogTrigger = config.bot.commands && config.bot.commands.changelog
        ? String(config.bot.commands.changelog.triggerText || "").trim()
        : "";

    if (!roomTrigger) {
        throw new Error("ROOM_INFO_TRIGGER_TEXT 不能为空。");
    }

    if (!changelogTrigger) {
        throw new Error("CHANGELOG_TRIGGER_TEXT 不能为空。");
    }

    if (!config.kk.roomsEndpoint) {
        throw new Error("KK_ROOMS_ENDPOINT 不能为空。");
    }

    if (!config.kk.changelogEndpoint) {
        throw new Error("KK_CHANGELOGS_ENDPOINT 不能为空。");
    }

    if (!config.kk.defaultMapId) {
        throw new Error("KK_DEFAULT_MAP_ID 不能为空。");
    }
}

module.exports = {
    loadConfig,
    validateConfig,
};
