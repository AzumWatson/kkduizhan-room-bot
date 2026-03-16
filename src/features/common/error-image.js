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

function buildLines(ctx, text, maxWidth, maxLines) {
    const cleaned = String(text || "").replace(/\s+/g, " ").trim();
    const base = cleaned || "未知错误";
    const wrapped = wrapLineByWidth(ctx, base, maxWidth);
    if (wrapped.length <= maxLines) return wrapped;

    const lines = wrapped.slice(0, maxLines);
    const lastIdx = maxLines - 1;
    let last = lines[lastIdx];
    while (ctx.measureText(`${last}...`).width > maxWidth && last.length > 0) {
        last = last.slice(0, -1);
    }
    lines[lastIdx] = `${last}...`;
    return lines;
}

function renderErrorToBase64Png(
    { title = "请求失败", message = "未知错误", hint = "请联系bot管理员" },
    { width = 860 } = {}
) {
    const W = width;
    const PAD = 16;
    const cardPadX = 18;
    const cardPadY = 16;

    const titleH = 34;
    const lineH = 24;
    const hintH = 22;

    const tmp = createCanvas(W, 200);
    const tmpCtx = tmp.getContext("2d");
    tmpCtx.font = "16px sans-serif";

    const textMaxW = W - PAD * 2 - cardPadX * 2;
    const lines = buildLines(tmpCtx, message, textMaxW, 4);

    const cardH = cardPadY * 2 + titleH + lines.length * lineH + hintH;
    const H = cardH + PAD * 2;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#1c1f2d");
    bg.addColorStop(1, "#111827");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const cardX = PAD;
    const cardY = PAD;
    const cardW = W - PAD * 2;

    ctx.fillStyle = "rgba(0,0,0,0.30)";
    roundRect(ctx, cardX, cardY + 4, cardW, cardH, 12);
    ctx.fill();

    ctx.fillStyle = "rgba(24,28,43,0.95)";
    roundRect(ctx, cardX, cardY, cardW, cardH, 12);
    ctx.fill();

    let y = cardY + cardPadY;

    ctx.font = "bold 24px sans-serif";
    ctx.fillStyle = "#f87171";
    ctx.textBaseline = "top";
    ctx.fillText(title, cardX + cardPadX, y);

    y += titleH;

    ctx.font = "16px sans-serif";
    ctx.fillStyle = "rgba(244,247,255,0.92)";
    for (const line of lines) {
        ctx.fillText(line, cardX + cardPadX, y);
        y += lineH;
    }

    ctx.font = "15px sans-serif";
    ctx.fillStyle = "#fbbf24";
    ctx.fillText(hint, cardX + cardPadX, y + 4);

    const buf = canvas.toBuffer("image/png");
    return `base64://${buf.toString("base64")}`;
}

module.exports = {
    renderErrorToBase64Png,
};
