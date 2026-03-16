const WebSocket = require("ws");

function makeWsUrlWithToken(url, token) {
    if (!token) return url;

    const u = new URL(url);
    if (!u.searchParams.get("access_token")) {
        u.searchParams.set("access_token", token);
    }
    return u.toString();
}

function pickTextFromEvent(msg) {
    const raw = (msg.raw_message || "").trim();
    if (raw) return raw;

    if (!Array.isArray(msg.message)) return "";
    return msg.message
        .filter((seg) => seg && seg.type === "text" && seg.data && seg.data.text != null)
        .map((seg) => seg.data.text)
        .join("")
        .trim();
}

function parseTriggerCommand(content, triggerText) {
    const text = String(content || "").trim();
    const trigger = String(triggerText || "").trim();

    if (!trigger || !text.startsWith(trigger)) return null;

    if (text.length > trigger.length) {
        const nextChar = text.charAt(trigger.length);
        if (!/\s/.test(nextChar)) return null;
    }

    return {
        queryText: text.slice(trigger.length).trim(),
    };
}

function resolveCommand(content, commandConfig) {
    for (const [commandKey, command] of Object.entries(commandConfig || {})) {
        const parsed = parseTriggerCommand(content, command.triggerText);
        if (parsed) {
            return {
                commandKey,
                queryText: parsed.queryText,
            };
        }
    }
    return null;
}

class NapCatGroupBot {
    constructor(config, handlers, options = {}) {
        this.config = config;
        this.handlers = handlers || {};
        this.onError = typeof options.onError === "function" ? options.onError : null;

        this.ws = null;
        this.reconnectTimer = null;
        this.stopped = false;

        this.lastTriggerAtMap = new Map();
        this.busyMap = new Map();
    }

    start() {
        this.stopped = false;
        this.connect();
    }

    stop() {
        this.stopped = true;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    connect() {
        const finalWsUrl = makeWsUrlWithToken(this.config.ws.url, this.config.ws.token);
        const options = this.config.ws.token
            ? { headers: { Authorization: `Bearer ${this.config.ws.token}` } }
            : {};

        const ws = new WebSocket(finalWsUrl, options);
        this.ws = ws;

        ws.on("open", () => {
            console.log("[WS] connected:", finalWsUrl);
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
        });

        ws.on("error", (err) => {
            console.error("[WS] error:", err && err.message ? err.message : err);
        });

        ws.on("close", (code, reason) => {
            console.log("[WS] closed:", code, reason && reason.toString ? reason.toString() : "");

            if (this.ws === ws) {
                this.ws = null;
            }

            if (!this.stopped) {
                this.scheduleReconnect();
            }
        });

        ws.on("message", async (buf) => {
            await this.handleMessage(buf);
        });
    }

    scheduleReconnect() {
        if (this.reconnectTimer || this.stopped) return;

        const delay = this.config.ws.reconnectDelayMs;
        console.log(`[WS] reconnecting in ${delay}ms ...`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (!this.stopped) this.connect();
        }, delay);
    }

    isWsOpen() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    sendJson(payload) {
        if (!this.isWsOpen()) {
            console.warn("[WS] skip send: socket not open");
            return false;
        }

        this.ws.send(JSON.stringify(payload));
        return true;
    }

    sendGroupText(groupId, text) {
        return this.sendJson({
            action: "send_group_msg",
            params: { group_id: groupId, message: text },
            echo: `txt-${Date.now()}`,
        });
    }

    sendGroupImageBase64(groupId, base64Uri) {
        return this.sendJson({
            action: "send_group_msg",
            params: {
                group_id: groupId,
                message: [{ type: "image", data: { file: base64Uri } }],
            },
            echo: `img-${Date.now()}`,
        });
    }

    async handleMessage(buf) {
        let msg;
        try {
            msg = JSON.parse(buf.toString("utf8"));
        } catch {
            return;
        }

        if (msg.post_type !== "message") return;
        if (msg.message_type !== "group") return;

        const groupId = Number(msg.group_id);
        if (!this.config.bot.targetGroups.has(groupId)) return;

        const content = pickTextFromEvent(msg);
        const resolved = resolveCommand(content, this.config.bot.commands);
        if (!resolved) return;

        const { commandKey, queryText } = resolved;
        const handler = this.handlers[commandKey];
        if (typeof handler !== "function") return;

        const stateKey = `${commandKey}:${groupId}`;
        const now = Date.now();
        const last = this.lastTriggerAtMap.get(stateKey) || 0;
        const since = now - last;

        if (since < this.config.bot.cooldownMs) {
            const left = Math.ceil((this.config.bot.cooldownMs - since) / 1000);
            this.sendGroupText(groupId, `冷却中，请 ${left}s 后再试`);
            return;
        }
        this.lastTriggerAtMap.set(stateKey, now);

        if (this.busyMap.get(stateKey)) {
            this.sendGroupText(groupId, "正在生成中，稍等...");
            return;
        }

        this.busyMap.set(stateKey, true);
        console.log(
            `[TRIGGER] cmd=${commandKey} group=${groupId} user=${msg.user_id} query=${queryText || "-"}`
        );

        try {
            await handler({
                commandKey,
                groupId,
                msg,
                content,
                queryText,
                bot: this,
            });
        } catch (err) {
            const text = err && err.message ? err.message : String(err);
            console.error(`[ERR] cmd=${commandKey} group=${groupId} message=${text}`);

            try {
                if (this.onError) {
                    await this.onError({
                        commandKey,
                        groupId,
                        queryText,
                        msg,
                        error: err,
                        bot: this,
                    });
                } else {
                    this.sendGroupText(groupId, `生成失败：${text}`);
                }
            } catch (sendErr) {
                const sendErrText = sendErr && sendErr.message ? sendErr.message : String(sendErr);
                console.error(`[ERR] fail_to_send_error_message group=${groupId} message=${sendErrText}`);
            }
        } finally {
            this.busyMap.set(stateKey, false);
        }
    }
}

module.exports = {
    NapCatGroupBot,
};
