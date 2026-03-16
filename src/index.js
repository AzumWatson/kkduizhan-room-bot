const { start } = require("./app");

if (require.main === module) {
    start();
}

module.exports = {
    start,
};
