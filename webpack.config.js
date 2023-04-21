const path = require("path");

module.exports = {
    mode: "development",
    entry: "./src/app.ts",
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "app.bundle.js"
    },
    watch: true
}