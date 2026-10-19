const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

async function build() {
    fs.mkdirSync("dist", {
        recursive: true
    });

    // Existing ChatGPT build — unchanged
    await esbuild.build({
        entryPoints: ["src/content/main.js"],
        bundle: true,
        format: "iife",
        outfile: "dist/content.js",
        target: ["chrome120"],
        sourcemap: false
    });

    // Claude content scripts combined through claude-entry.js
    await esbuild.build({
        entryPoints: ["src/content/claude-entry.js"],
        bundle: true,
        format: "iife",
        outfile: "dist/claude-content.js",
        target: ["chrome120"],
        sourcemap: false
    });

    // Claude MAIN-world bridge
    await esbuild.build({
        entryPoints: ["src/injected/claude-bridge.js"],
        bundle: true,
        format: "iife",
        outfile: "dist/claude-bridge.js",
        target: ["chrome120"],
        sourcemap: false
    });

    // ChatGPT MAIN-world bridge (backend-api capture)
    await esbuild.build({
        entryPoints: ["src/injected/chatgpt-bridge.js"],
        bundle: true,
        format: "iife",
        outfile: "dist/chatgpt-bridge.js",
        target: ["chrome120"],
        sourcemap: false
    });

    // One-click Session Migration
    await esbuild.build({
        entryPoints: ["src/content/migration/migration-entry.js"],
        bundle: true,
        format: "iife",
        outfile: "dist/migration.js",
        target: ["chrome120"],
        sourcemap: false
    });

    // Copy main stylesheet
    const cssSource = path.join(
        "src",
        "content",
        "style.css"
    );

    const cssDestination = path.join(
        "dist",
        "style.css"
    );

    if (fs.existsSync(cssSource)) {
        fs.copyFileSync(
            cssSource,
            cssDestination
        );
    }

    // Copy migration stylesheet
    const migrationCssSource = path.join(
        "src",
        "content",
        "migration",
        "migration.css"
    );

    const migrationCssDestination = path.join(
        "dist",
        "migration.css"
    );

    if (fs.existsSync(migrationCssSource)) {
        fs.copyFileSync(
            migrationCssSource,
            migrationCssDestination
        );
    }

    console.log(
        "IKO GPT, Claude, bridge, and migration builds completed."
    );
}

build().catch((error) => {
    console.error(error);
    process.exit(1);
});