"use strict";

const { MigrationEngine } = require("../../migration/core/migration-engine.js");
const { ClaudeSourceAdapter } = require("../../migration/adapters/claude-source-adapter.js");
const { ChatGPTSourceAdapter } = require("../../migration/adapters/chatgpt-source-adapter.js");
const { ChatGPTDestinationAdapter } = require("../../migration/adapters/chatgpt-destination-adapter.js");
const { ClaudeDestinationAdapter } = require("../../migration/adapters/claude-destination-adapter.js");
const { UniversalSourceAdapter } = require("../../migration/adapters/universal-source-adapter.js");
const { UniversalDestinationAdapter } = require("../../migration/adapters/universal-destination-adapter.js");
const { PLATFORMS } = require("../../migration/platforms.js");
const { optimizePrompt } = require("../prompt-optimizer/optimizer.js");
const IKOSIR = require("../../migration/sir/sir.js");
const IKOPDF = require("../../migration/sir/pdf.js");
const IKOOCR = require("../../migration/sir/ocr.js");
const IKORETRIEVAL = require("../../migration/sir/retrieval.js");

require("./iko-log.js");
require("../theme.js");
require("./migration-ui.js");
require("./migration-main.js");
require("../prompt-optimizer/optimizer-ui.js");
require("../prompt-optimizer/optimizer-main.js");

window.IKOOptimizerCore = { optimizePrompt };
window.IKOSIRCore = IKOSIR;
window.IKOPDFCore = IKOPDF;
window.IKOOCRCore = IKOOCR;
window.IKORETRIEVALCore = IKORETRIEVAL;

window.IKOMigrationCore = {
    MigrationEngine,
    ClaudeSourceAdapter,
    ChatGPTSourceAdapter,
    ChatGPTDestinationAdapter,
    ClaudeDestinationAdapter,
    UniversalSourceAdapter,
    UniversalDestinationAdapter,
    PLATFORMS
};

function start() {
    window.IKOMigrationMain?.start?.();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
    start();
}
