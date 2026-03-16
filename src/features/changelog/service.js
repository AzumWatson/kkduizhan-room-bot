const { fetchMapChangelog } = require("../../integrations/kk-api");
const { resolveDefaultMapIdForGroup } = require("../room-info/service");

function normalizeAliasKey(text) {
    return String(text || "")
        .trim()
        .toLowerCase();
}

function resolveMapIdForChangelog(queryText, kkConfig, groupId) {
    const keyword = String(queryText || "").trim();
    if (!keyword) {
        return {
            mapId: resolveDefaultMapIdForGroup(kkConfig, groupId),
            mapLabel: "",
            note: "",
        };
    }

    if (/^[1-9]\d*$/.test(keyword)) {
        const mapId = Number(keyword);
        return {
            mapId,
            mapLabel: `mapId:${mapId}`,
            note: "",
        };
    }

    const aliasHit = kkConfig.aliases.get(normalizeAliasKey(keyword));
    if (aliasHit) {
        return {
            mapId: aliasHit.mapId,
            mapLabel: aliasHit.alias,
            note: "",
        };
    }

    const fallbackMapId = resolveDefaultMapIdForGroup(kkConfig, groupId);
    return {
        mapId: fallbackMapId,
        mapLabel: `mapId:${fallbackMapId}`,
        note: `参数未命中别名，已使用默认 mapId（${fallbackMapId}）`,
    };
}

function decodeHtmlEntities(text) {
    return String(text || "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");
}

function htmlToLines(html) {
    const raw = String(html || "");
    if (!raw.trim()) return [];

    const withBreaks = raw
        .replace(/<\s*br\s*\/?>/gi, "\n")
        .replace(/<\s*\/p\s*>/gi, "\n")
        .replace(/<\s*\/div\s*>/gi, "\n")
        .replace(/<\s*li[^>]*>/gi, "- ")
        .replace(/<\s*\/li\s*>/gi, "\n");

    const noTags = withBreaks.replace(/<[^>]+>/g, "");
    const decoded = decodeHtmlEntities(noTags).replace(/\r/g, "");

    const lines = decoded.split("\n").map((line) => line.trim());

    const normalized = [];
    let lastBlank = false;
    for (const line of lines) {
        const isBlank = line.length === 0;
        if (isBlank) {
            if (!lastBlank) normalized.push("");
            lastBlank = true;
        } else {
            normalized.push(line);
            lastBlank = false;
        }
    }

    while (normalized.length && normalized[0] === "") normalized.shift();
    while (normalized.length && normalized[normalized.length - 1] === "") normalized.pop();

    return normalized;
}

async function fetchChangelogCardModel({ groupId, queryText, kkConfig }) {
    const target = resolveMapIdForChangelog(queryText, kkConfig, groupId);

    const apiJson = await fetchMapChangelog({
        endpoint: kkConfig.changelogEndpoint,
        mapId: target.mapId,
        start: 0,
        limit: kkConfig.changelogLimit,
        token: kkConfig.token,
        fetchTimeoutMs: kkConfig.fetchTimeoutMs,
    });

    if (!apiJson || apiJson.status !== 200) {
        return {
            titleLeft: "更新信息",
            titleRight: "",
            lines: [],
            note: target.note,
            error: `接口异常：status=${apiJson ? apiJson.status : "unknown"}`,
        };
    }

    const rows = apiJson.data && Array.isArray(apiJson.data.rows) ? apiJson.data.rows : [];
    const first = rows[0];

    if (!first) {
        return {
            titleLeft: target.mapLabel || `mapId:${target.mapId}`,
            titleRight: "",
            lines: [],
            note: target.note,
            error: `暂无更新信息（mapId=${target.mapId}）`,
        };
    }

    const lines = htmlToLines(first.content);

    return {
        titleLeft: first.mapVersion || target.mapLabel || `mapId:${target.mapId}`,
        titleRight: first.createTime || "",
        lines,
        note: target.note,
        error: "",
    };
}

module.exports = {
    fetchChangelogCardModel,
};
