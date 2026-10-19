"use strict";
const { DestinationAdapter, AdapterError } = require("./adapter-interface.js");
const { PLATFORMS } = require("../platforms.js");

// One class for every destination — driven by PLATFORMS table.
class UniversalDestinationAdapter extends DestinationAdapter {
    constructor(destinationId) {
        super(PLATFORMS[destinationId]?.name || destinationId);
        this.destinationId = destinationId;
    }
    async openDestination(migrationPackage) {
        if (!migrationPackage) throw new AdapterError("Migration package is required.");
        if (!globalThis.chrome?.runtime?.sendMessage) throw new AdapterError("Reload the page after installing IKO.");
        const save = await new Promise((resolve, reject) => {
            try {
                chrome.runtime.sendMessage({ type: "IKO_SAVE_MIGRATION", package: migrationPackage },
                    r => chrome.runtime.lastError ? reject(new AdapterError(chrome.runtime.lastError.message)) : resolve(r));
            } catch (e) { reject(new AdapterError(e?.message || String(e))); }
        });
        if (!save?.success) throw new AdapterError(save?.error || "Could not save package.");
        const opened = await new Promise((resolve, reject) => {
            try {
                chrome.runtime.sendMessage({ type: "IKO_OPEN_MIGRATION_DESTINATION", destination: this.destinationId },
                    r => chrome.runtime.lastError ? reject(new AdapterError(chrome.runtime.lastError.message)) : resolve(r));
            } catch (e) { reject(new AdapterError(e?.message || String(e))); }
        });
        if (!opened?.success) throw new AdapterError(opened?.error || `Could not open ${this.destinationId}.`);
        return { status: "opened", destination: this.destinationId, url: opened.url, tabId: opened.tabId };
    }
    async prepareMigration(p) {
        if (!p) throw new AdapterError("Migration package is required.");
        return { status: "prepared", destination: this.destinationId, package: p };
    }
    async injectContext() { return { status: "waiting_for_destination" }; }
}

module.exports = { UniversalDestinationAdapter };
