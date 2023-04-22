const path = require("path");

module.exports = {
    mode: "production",
    entry: "./src/app.ts",
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
    },
    output: {
        filename: "app.bundle.js",
        path: path.resolve(__dirname, "dist"),
    },
    watch: true
}