const { createCanvas } = require("canvas");

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

function wrapLineByWidth(ctx, line, maxWidth) {
    if (!line) return [""];

    const out = [];
    let buf = "";

    for (const ch of line) {
        const next = buf + ch;
        if (ctx.measureText(next).width <= maxWidth || buf.length === 0) {
            buf = next;
        } else {
            out.push(buf);
            buf = ch;
        }
    }

    if (buf) out.push(buf);
    return out.length ? out : [""];
}

function buildRenderableLines(ctx, lines, maxWidth, maxLines) {
    const out = [];

    for (const line of lines) {
        if (line === "") {
            if (out.length && out[out.length - 1] !== "") out.push("");
            continue;
        }

        const wrapped = wrapLineByWidth(ctx, line, maxWidth);
        for (const item of wrapped) {
            out.push(item);
            if (out.length >= maxLines) break;
        }

        if (out.length >= maxLines) break;
    }

    if (out.length >= maxLines) {
        const last = out[maxLines - 1] || "";
        out[maxLines - 1] = last.length > 3 ? `${last.slice(0, Math.max(1, last.length - 3))}...` : "...";
        return out.slice(0, maxLines);
    }

    return out;
}

function renderChangelogToBase64Png(model, { width = 920, maxLines = 120 } = {}) {
    const W = width;
    const OUTER_PAD = 16;
    const CARD_PAD_X = 20;
    const CARD_PAD_TOP = 16;
    const CARD_PAD_BOTTOM = 18;

    const HEADER_H = 36;
    const CONTENT_GAP = 16;
    const NOTE_GAP = 12;

    const titleFont = "bold 24px sans-serif";
    const dateFont = "600 14px sans-serif";
    const bodyFont = "28px sans-serif";
    const noteFont = "14px sans-serif";
    const lineHeight = 38;

    const tempCanvas = createCanvas(W, 300);
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.font = bodyFont;

    const contentMaxW = W - OUTER_PAD * 2 - CARD_PAD_X * 2;

    let contentLines;
    if (model.error) {
        contentLines = [model.error];
    } else {
        contentLines = buildRenderableLines(tempCtx, model.lines || [], contentMaxW, maxLines);
    }

    const noteLines = model.note ? buildRenderableLines(tempCtx, [model.note], contentMaxW, 2) : [];

    const bodyHeight = Math.max(1, contentLines.length) * lineHeight;
    const noteHeight = noteLines.length ? NOTE_GAP + noteLines.length * 22 : 0;

    const cardH = CARD_PAD_TOP + HEADER_H + CONTENT_GAP + bodyHeight + noteHeight + CARD_PAD_BOTTOM;
    const H = cardH + OUTER_PAD * 2;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#121c2d");
    bg.addColorStop(1, "#0a1322");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const cardX = OUTER_PAD;
    const cardY = OUTER_PAD;
    const cardW = W - OUTER_PAD * 2;

    ctx.fillStyle = "rgba(0,0,0,0.28)";
    roundRect(ctx, cardX, cardY + 4, cardW, cardH, 12);
    ctx.fill();

    ctx.fillStyle = "rgba(20,31,50,0.94)";
    roundRect(ctx, cardX, cardY, cardW, cardH, 12);
    ctx.fill();

    const contentX = cardX + CARD_PAD_X;
    const contentTopY = cardY + CARD_PAD_TOP;

    ctx.font = titleFont;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(model.titleLeft || "更新信息", contentX, contentTopY);

    if (model.titleRight) {
        ctx.font = dateFont;
        ctx.fillStyle = "rgba(201,211,226,0.75)";
        ctx.textAlign = "right";
        ctx.fillText(model.titleRight, cardX + cardW - CARD_PAD_X, contentTopY + 6);
    }

    ctx.textAlign = "left";
    ctx.font = bodyFont;
    ctx.fillStyle = "rgba(245,249,255,0.94)";

    const contentStartY = contentTopY + HEADER_H + CONTENT_GAP;
    let y = contentStartY;

    for (const line of contentLines) {
        if (line === "") {
            y += lineHeight;
            continue;
        }
        ctx.fillText(line, contentX, y);
        y += lineHeight;
    }

    if (noteLines.length) {
        y += NOTE_GAP;
        ctx.font = noteFont;
        ctx.fillStyle = "rgba(187,204,226,0.78)";
        for (const line of noteLines) {
            ctx.fillText(line, contentX, y);
            y += 22;
        }
    }

    const buf = canvas.toBuffer("image/png");
    return `base64://${buf.toString("base64")}`;
}

module.exports = {
    renderChangelogToBase64Png,
};
