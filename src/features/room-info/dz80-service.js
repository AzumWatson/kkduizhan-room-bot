function stripWar3ColorCodes(value) {
    const text = String(value || "")
        .replace(/\|c[0-9a-f]{8}/gi, "")
        .replace(/\|r/gi, "")
        .replace(/\|n/gi, " ")
        .trim();
    return text || "-";
}

function parsePlayerCount(players) {
    const text = String(players || "");
    const current = Number(text.split("/")[0]);
    return Number.isFinite(current) ? current : 0;
}

function parseRoomCode(roomCode) {
    const n = Number(roomCode);
    return Number.isFinite(n) ? n : 0;
}

function toDz80TableModel(
    apiJson,
    {
        maxRows = 18,
        queryText = "",
        emptyText = "",
    } = {}
) {
    const code = apiJson && apiJson.code;
    const data = apiJson && apiJson.data ? apiJson.data : {};
    const teams = Array.isArray(data.teams) ? data.teams : [];
    const title = "80对战房间信息";
    const keyword = String(queryText || "").trim();

    if (code !== 0) {
        return {
            title,
            layout: "dz80",
            rows: [],
            error: `80dz 接口异常：code=${code}`,
        };
    }

    if (!teams.length) {
        return {
            title,
            layout: "dz80",
            rows: [],
            error: emptyText || (keyword ? `未匹配到房间：${keyword}` : "当前没有房间"),
        };
    }

    const sorted = [...teams].sort((a, b) => {
        const aRunning = Number(a.status) === 1 ? 1 : 0;
        const bRunning = Number(b.status) === 1 ? 1 : 0;
        if (aRunning !== bRunning) return aRunning - bRunning;

        const bp = parsePlayerCount(b.players);
        const ap = parsePlayerCount(a.players);
        if (bp !== ap) return bp - ap;

        return parseRoomCode(a.room_code) - parseRoomCode(b.room_code);
    });

    const rows = sorted.slice(0, maxRows).map((room) => {
        const status = Number(room.status);
        const password = String(room.room_password || "");

        return {
            roomNo: String(room.room_code || "-"),
            roomName: stripWar3ColorCodes(room.name || "-"),
            mode: stripWar3ColorCodes(room.map_name || "-"),
            level: password || "-",
            people: String(room.players || "-"),
            isRunning: status === 1,
            statusText: status === 0 ? "等待中" : status === 1 ? "已开始" : `状态${room.status}`,
            needPassword: Boolean(password),
        };
    });

    const noteParts = [];
    if (teams.length > maxRows) noteParts.push(`仅显示前 ${maxRows} 条`);

    return {
        title,
        layout: "dz80",
        rows,
        note: noteParts.join(" | "),
        error: "",
    };
}

async function fetchDz80RoomInfoTableModel({ queryText, dz80Client, maxRows }) {
    const keyword = String(queryText || "").trim();
    const apiJson = await dz80Client.fetchRooms(keyword);

    return toDz80TableModel(apiJson, {
        maxRows,
        queryText: keyword,
    });
}

module.exports = {
    fetchDz80RoomInfoTableModel,
    toDz80TableModel,
    stripWar3ColorCodes,
};
