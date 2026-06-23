const { loadConfig, validateConfig } = require("./config");
const { setupLogger } = require("./core/logger");
const { NapCatGroupBot } = require("./bot/napcat-group-bot");
const { createDz80ApiClient } = require("./integrations/dz80-api");
const { fetchRoomInfoTableModel } = require("./features/room-info/service");
const { fetchDz80RoomInfoTableModel } = require("./features/room-info/dz80-service");
const { renderRoomTableToBase64Png } = require("./features/room-info/renderer");
const { fetchChangelogCardModel } = require("./features/changelog/service");
const { renderChangelogToBase64Png } = require("./features/changelog/renderer");
const { renderErrorToBase64Png } = require("./features/common/error-image");

function createHandlers(config) {
    const dz80Client = config.dz80 && config.dz80.enabled ? createDz80ApiClient(config.dz80) : null;
    const handlers = {
        roomInfo: async ({ groupId, queryText, bot }) => {
            const model = await fetchRoomInfoTableModel({
                groupId,
                queryText,
                kkConfig: config.kk,
                maxRows: config.render.maxRows,
            });

            const imageBase64 = renderRoomTableToBase64Png(model, {
                width: config.render.width,
            });

            bot.sendGroupImageBase64(groupId, imageBase64);
        },

        changelog: async ({ groupId, queryText, bot }) => {
            const model = await fetchChangelogCardModel({
                groupId,
                queryText,
                kkConfig: config.kk,
            });

            const imageBase64 = renderChangelogToBase64Png(model, {
                width: config.render.changelogWidth,
            });

            bot.sendGroupImageBase64(groupId, imageBase64);
        },
    };

    if (dz80Client) {
        handlers.roomInfo80 = async ({ groupId, queryText, bot }) => {
            const model = await fetchDz80RoomInfoTableModel({
                queryText,
                dz80Client,
                maxRows: config.render.maxRows,
            });

            const imageBase64 = renderRoomTableToBase64Png(model, {
                width: config.render.width,
            });

            bot.sendGroupImageBase64(groupId, imageBase64);
        };
    }

    return handlers;
}

function createErrorHandler(config) {
    return async ({ groupId, error, bot }) => {
        const message = error && error.message ? error.message : String(error);
        const imageBase64 = renderErrorToBase64Png(
            {
                title: "请求失败",
                message,
                hint: "请联系bot管理员",
            },
            { width: config.render.errorWidth || 860 }
        );
        bot.sendGroupImageBase64(groupId, imageBase64);
    };
}

function start() {
    const config = loadConfig();
    const logger = setupLogger(config.logging || {});
    console.log(`[BOOT] logger_file=${logger.filePath}`);
    validateConfig(config);

    console.log(`[BOOT] started_at=${new Date().toISOString()}`);
    console.log(`[BOOT] groups=${[...config.bot.targetGroups].join(",")}`);
    const commands = Object.entries(config.bot.commands)
        .map(([key, command]) => `${key}:${command.triggerText}`)
        .join(",");
    console.log(`[BOOT] commands=${commands}`);

    const bot = new NapCatGroupBot(config, createHandlers(config), {
        onError: createErrorHandler(config),
    });
    bot.start();
    return bot;
}

module.exports = {
    start,
};
