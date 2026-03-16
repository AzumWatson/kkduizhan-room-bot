const { createCanvas } = require("canvas");

function ellipsis(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;

    const ell = "…";
    let lo = 0;
    let hi = text.length;

    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        const s = text.slice(0, mid) + ell;
        if (ctx.measureText(s).width <= maxWidth) lo = mid + 1;
        else hi = mid;
    }

    return text.slice(0, Math.max(0, lo - 1)) + ell;
}

function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

function renderRoomTableToBase64Png(model, { width = 974 } = {}) {
    const W = width;
    const PAD = 18;
    const CARD_R = 12;

    const titleH = 42;
    const headerH = 44;
    const rowH = 44;
    const footerH = model.note ? 26 : 0;

    const rowCount = Math.max(1, model.rows.length);
    const H = PAD * 2 + titleH + headerH + rowH * rowCount + footerH;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, W, H);

    const cardX = PAD;
    const cardY = PAD;
    const cardW = W - PAD * 2;
    const cardH = H - PAD * 2;

    ctx.fillStyle = "rgba(0,0,0,0.35)";
    roundRect(ctx, cardX, cardY + 6, cardW, cardH, CARD_R);
    ctx.fill();

    ctx.fillStyle = "#0f172a";
    roundRect(ctx, cardX, cardY, cardW, cardH, CARD_R);
    ctx.fill();

    ctx.fillStyle = "#111827";
    roundRect(ctx, cardX, cardY, cardW, titleH, CARD_R);
    ctx.fill();

    ctx.font = "18px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.textBaseline = "middle";
    ctx.fillText(model.title, cardX + 16, cardY + titleH / 2);

    const tableX = cardX;
    const tableY = cardY + titleH;
    const tableW = cardW;

    const col = {
        roomNo: { x: 16, w: 98 },
        roomName: { x: 126, w: 330 },
        mode: { x: 448, w: 124 },
        level: { x: 584, w: 90 },
        people: { x: 686, w: 86 },
        status: { x: 786, w: tableW - 786 - 16 },
    };

    ctx.font = "14px sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.textBaseline = "middle";
    const headerY = tableY + headerH / 2;

    ctx.fillText("房间号", tableX + col.roomNo.x, headerY);
    ctx.fillText("房间名称", tableX + col.roomName.x, headerY);
    ctx.fillText("模式", tableX + col.mode.x, headerY);
    ctx.fillText("地图等级", tableX + col.level.x, headerY);

    const peopleCenterX = tableX + col.people.x + col.people.w / 2;
    ctx.textAlign = "center";
    ctx.fillText("房间人数", peopleCenterX, headerY);
    ctx.textAlign = "left";

    ctx.fillText("状态", tableX + col.status.x, headerY);

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tableX, tableY + headerH);
    ctx.lineTo(tableX + tableW, tableY + headerH);
    ctx.stroke();

    const rowsY0 = tableY + headerH;

    const drawRow = (index, row) => {
        const y = rowsY0 + index * rowH;

        ctx.fillStyle = index % 2 === 0 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.00)";
        ctx.fillRect(tableX, y, tableW, rowH);

        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.beginPath();
        ctx.moveTo(tableX, y + rowH);
        ctx.lineTo(tableX + tableW, y + rowH);
        ctx.stroke();

        ctx.textBaseline = "middle";
        ctx.font = "15px sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.88)";

        ctx.fillText(ellipsis(ctx, row.roomNo, col.roomNo.w), tableX + col.roomNo.x, y + rowH / 2);

        const roomNameText = row.needPassword ? `${row.roomName} 🔒` : row.roomName;
        ctx.fillText(ellipsis(ctx, roomNameText, col.roomName.w), tableX + col.roomName.x, y + rowH / 2);

        ctx.fillText(ellipsis(ctx, row.mode, col.mode.w), tableX + col.mode.x, y + rowH / 2);

        ctx.fillStyle = "rgba(255,255,255,0.82)";
        ctx.fillText(ellipsis(ctx, row.level, col.level.w), tableX + col.level.x, y + rowH / 2);

        ctx.fillStyle = "rgba(255,255,255,0.88)";
        ctx.textAlign = "center";
        ctx.fillText(row.people, peopleCenterX, y + rowH / 2);
        ctx.textAlign = "left";

        const stX = tableX + col.status.x;
        const stY = y + rowH / 2;

        const statusColor = row.isRunning ? "#f5a24b" : "#34d399";
        const statusText = row.statusText || (row.isRunning ? "开局?分钟" : "创建?分钟");

        ctx.fillStyle = statusColor;
        ctx.beginPath();
        ctx.arc(stX + 8, stY, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = "15px sans-serif";
        ctx.fillStyle = statusColor;
        const textMaxW = Math.max(60, (col.status.w || 0) - 22);
        ctx.fillText(ellipsis(ctx, statusText, textMaxW), stX + 22, stY);
    };

    if (model.error) {
        drawRow(0, {
            roomNo: "-",
            roomName: "-",
            mode: "-",
            level: "-",
            people: "-",
            statusText: model.error,
            isRunning: false,
            needPassword: false,
        });
    } else {
        model.rows.forEach((row, index) => drawRow(index, row));
    }

    if (model.note) {
        ctx.font = "12px sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.50)";
        ctx.textBaseline = "middle";
        ctx.fillText(model.note, cardX + 16, cardY + cardH - 13);
    }

    const buf = canvas.toBuffer("image/png");
    return `base64://${buf.toString("base64")}`;
}

module.exports = {
    renderRoomTableToBase64Png,
};
