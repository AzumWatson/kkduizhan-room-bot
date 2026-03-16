const fs = require("fs");
const path = require("path");
const util = require("util");

function setupLogger({ logDir, fileName }) {
    const dir = logDir && logDir.trim() ? logDir.trim() : path.join(process.cwd(), "logs");
    const name = fileName && fileName.trim() ? fileName.trim() : "kkbot.log";

    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, name);
    const stream = fs.createWriteStream(filePath, { flags: "a" });

    const original = {
        log: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
    };

    function write(level, args, printer) {
        const ts = new Date().toISOString();
        const message = util.format(...args);
        const line = `${ts} [${level}] ${message}`;
        stream.write(`${line}\n`);
        printer(line);
    }

    console.log = (...args) => write("INFO", args, original.log);
    console.warn = (...args) => write("WARN", args, original.warn);
    console.error = (...args) => write("ERROR", args, original.error);

    process.on("exit", () => {
        stream.end();
    });

    return {
        filePath,
    };
}

module.exports = {
    setupLogger,
};
