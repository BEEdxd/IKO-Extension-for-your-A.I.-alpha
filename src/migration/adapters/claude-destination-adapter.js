"use strict";

const { DestinationAdapter, AdapterError } = require("./adapter-interface.js");

class ClaudeDestinationAdapter extends DestinationAdapter {
    constructor() { super("Claude"); }

    async openDestination(migrationPackage) {
        if (!migrationPackage) throw new AdapterError("Migration package is required.");
        if (!globalThis.chrome?.runtime?.sendMessage) {
            throw new AdapterError("IKO extension messaging is unavailable. Reload the page after installing IKO.");
        }

        const saveResponse = await new Promise((resolve, reject) => {
            try {
                chrome.runtime.sendMessage(
                    { type: "IKO_SAVE_MIGRATION", package: migrationPackage },
                    response => {
                        const error = chrome.runtime.lastError;
                        if (error) reject(new AdapterError(error.message));
                        else resolve(response);
                    }
                );
            } catch (error) {
                reject(new AdapterError(error?.message || String(error)));
            }
        });

        if (!saveResponse?.success) {
            throw new AdapterError(saveResponse?.error || "Could not save the migration package.");
        }

        const response = await new Promise((resolve, reject) => {
            try {
                chrome.runtime.sendMessage(
                    { type: "IKO_OPEN_MIGRATION_DESTINATION", destination: "claude" },
                    result => {
                        const error = chrome.runtime.lastError;
                        if (error) reject(new AdapterError(error.message));
                        else resolve(result);
                    }
                );
            } catch (error) {
                reject(new AdapterError(error?.message || String(error)));
            }
        });

        if (!response?.success) {
            throw new AdapterError(response?.error || "Could not open Claude.");
        }

        return { status: "opened", destination: "Claude", url: response.url, tabId: response.tabId };
    }

    async prepareMigration(migrationPackage) {
        if (!migrationPackage) throw new AdapterError("Migration package is required.");
        return { status: "prepared", destination: "Claude", package: migrationPackage };
    }

    async injectContext() {
        return { status: "waiting_for_destination" };
    }
}

module.exports = { ClaudeDestinationAdapter };
