const { fetchRoomListByMapId, fetchRoomListByName } = require("../../integrations/kk-api");

function resolveDefaultMapIdForGroup(kkConfig, groupId) {
    const gid = Number(groupId);
    if (Number.isFinite(gid) && kkConfig.defaultMapIdByGroup) {
        const groupMapId = kkConfig.defaultMapIdByGroup.get(gid);
        if (Number.isFinite(groupMapId) && groupMapId > 0) return groupMapId;
    }
    return kkConfig.defaultMapId;
}

function resolveQueryTarget(queryText, kkConfig, groupId) {
    const keyword = String(queryText || "").trim();
    if (!keyword) {
        const defaultMapId = resolveDefaultMapIdForGroup(kkConfig, groupId);
        return {
            type: "mapId",
            mapId: defaultMapId,
            titleLabel: "",
            emptyText: "当前没有房间",
            extraNote: "",
        };
    }

    // 规则：只要“房间信息”后面有参数，一律按 roomName 搜索
    return {
        type: "roomName",
        roomName: keyword,
        titleLabel: "",
        emptyText: `未匹配到房间：${keyword}`,
        extraNote: "",
    };
}

function formatMapLevel(room) {
    const lvl = room && room.enter_limit_map_lvl ? room.enter_limit_map_lvl : {};
    const min = Number(lvl.min_map_lvl || 0);
    const max = Number(lvl.max_map_lvl || 0);

    if (!min && !max) return "-";
    if (min && !max) return `>=${min}`;
    if (!min && max) return `<=${max}`;
    return `${min}~${max}`;
}

function getStatus(room, nowSec) {
    const isRunning = Number(room.room_status) === 6;

    if (isRunning) {
        const loadedMs = Number(room.loaded_time);
        if (!loadedMs) return { isRunning: true, text: "开局?分钟" };

        const mins = (nowSec * 1000 - loadedMs) / 60000;
        const m = Math.floor(Math.max(0, mins));
        return { isRunning: true, text: `开局${m}分钟` };
    }

    const createSec = Number(room.create_time);
    if (!createSec) return { isRunning: false, text: "创建?分钟" };

    const mins = (nowSec - createSec) / 60;
    const m = Math.floor(Math.max(0, mins));
    return { isRunning: false, text: `创建${m}分钟` };
}

function toTableModel(
    apiJson,
    {
        maxRows = 18,
        titleLabel = "",
        emptyText = "当前没有房间",
        extraNote = "",
        preferMapNameAsRoomName = false,
    } = {}
) {
    const status = apiJson && apiJson.status;
    const data = apiJson && apiJson.data ? apiJson.data : {};
    const rooms = Array.isArray(data.preparing) ? data.preparing : [];
    const nowSec = Number(data.now || Math.floor(Date.now() / 1000));
    const titleBase = "房间信息";

    if (status !== 200) {
        return { title: titleBase, rows: [], error: `接口异常：status=${status}` };
    }

    if (!rooms.length) {
        return { title: titleBase, rows: [], error: emptyText };
    }

    const sorted = [...rooms].sort((a, b) => {
        const aRunning = Number(a.room_status) === 6 ? 1 : 0;
        const bRunning = Number(b.room_status) === 6 ? 1 : 0;
        if (aRunning !== bRunning) return aRunning - bRunning;

        const ap = Number(a.player_number || 0);
        const bp = Number(b.player_number || 0);
        if (bp !== ap) return bp - ap;

        return Number(a.show_id || 0) - Number(b.show_id || 0);
    });

    const picked = sorted.slice(0, maxRows);
    const rows = picked.map((room) => {
        const st = getStatus(room, nowSec);
        const rawRoomName = String(room.room_name || room.map_name || "-");
        const mapName = String(room.map_name || "");
        const roomName = preferMapNameAsRoomName && mapName ? mapName : rawRoomName;
        return {
            roomNo: String(room.show_id || "-"),
            roomName,
            mode: String(room.mode_name || "未知"),
            level: formatMapLevel(room),
            people: `${room.player_number || 0}/${room.total_slots || "-"}`,
            isRunning: Boolean(st.isRunning),
            statusText: st.text || (st.isRunning ? "开局?分钟" : "创建?分钟"),
            needPassword: Boolean(room.need_password),
        };
    });

    const title = titleBase;
    const noteParts = [];
    if (extraNote) noteParts.push(extraNote);
    if (rooms.length > maxRows) noteParts.push(`仅显示前 ${maxRows} 条`);

    return {
        title,
        rows,
        note: noteParts.join(" | "),
        error: "",
    };
}

async function fetchRoomInfoTableModel({ groupId, queryText, kkConfig, maxRows }) {
    const target = resolveQueryTarget(queryText, kkConfig, groupId);

    const req = {
        endpoint: kkConfig.roomsEndpoint,
        token: kkConfig.token,
        fetchTimeoutMs: kkConfig.fetchTimeoutMs,
    };

    const apiJson =
        target.type === "mapId"
            ? await fetchRoomListByMapId({
                  ...req,
                  mapId: target.mapId,
                  limit: kkConfig.mapListLimit,
              })
            : await fetchRoomListByName({
                  ...req,
                  roomName: target.roomName,
                  limit: kkConfig.roomNameListLimit,
              });

    return toTableModel(apiJson, {
        maxRows,
        titleLabel: target.titleLabel,
        emptyText: target.emptyText,
        extraNote: target.extraNote,
        preferMapNameAsRoomName: target.type === "roomName",
    });
}

module.exports = {
    fetchRoomInfoTableModel,
    resolveDefaultMapIdForGroup,
};
