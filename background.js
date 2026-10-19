"use strict";

const DESTINATIONS = Object.freeze({
    claude: "https://claude.ai/new",
    chatgpt: "https://chatgpt.com/",
    gemini: "https://gemini.google.com/",
    perplexity: "https://www.perplexity.ai/",
    copilot: "https://copilot.microsoft.com/",
    grok: "https://grok.com/",
    deepseek: "https://chat.deepseek.com/",
    mistral: "https://chat.mistral.ai/chat",
    poe: "https://poe.com/"
});

const SOURCE_HOSTS = [
    "claude.ai",
    "chatgpt.com",
    "chat.openai.com",
    "gemini.google.com",
    "perplexity.ai",
    "copilot.microsoft.com",
    "m365.cloud.microsoft",
    "grok.com",
    "x.com",
    "chat.deepseek.com",
    "deepseek.com",
    "chat.mistral.ai",
    "mistral.ai",
    "poe.com"
];

function isAllowedSender(sender) {
    const raw = sender?.url || "";
    try {
        const url = new URL(raw);
        return url.protocol === "https:" && SOURCE_HOSTS.some(host =>
            url.hostname === host || url.hostname.endsWith(`.${host}`)
        );
    } catch {
        return false;
    }
}

function reply(sendResponse, payload) {
    try {
        sendResponse(payload);
    } catch {
        // Sender disappeared while the service worker was responding.
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return false;

    if (!isAllowedSender(sender)) {
        reply(sendResponse, { success: false, error: "Unsupported or unauthorized sender page." });
        return false;
    }

    if (message.type === "IKO_SAVE_MIGRATION") {
        if (!message.package || typeof message.package !== "object") {
            reply(sendResponse, { success: false, error: "Migration package is missing." });
            return false;
        }

        const record = {
            package: message.package,
            savedAt: Date.now(),
            sourceTabId: sender.tab?.id ?? null
        };

        chrome.storage.local.set({ ikoPendingMigration: record }, () => {
            const error = chrome.runtime.lastError;
            reply(sendResponse, error
                ? { success: false, error: error.message }
                : { success: true });
        });
        return true;
    }

    if (message.type === "IKO_GET_MIGRATION") {
        chrome.storage.local.get(["ikoPendingMigration"], result => {
            const error = chrome.runtime.lastError;
            if (error) {
                reply(sendResponse, { success: false, error: error.message });
                return;
            }

            const record = result?.ikoPendingMigration || null;
            reply(sendResponse, {
                success: true,
                package: record?.package || null,
                savedAt: record?.savedAt || null
            });
        });
        return true;
    }

    if (message.type === "IKO_CLEAR_MIGRATION") {
        chrome.storage.local.remove(["ikoPendingMigration"], () => {
            const error = chrome.runtime.lastError;
            reply(sendResponse, error
                ? { success: false, error: error.message }
                : { success: true });
        });
        return true;
    }

    if (message.type === "IKO_OPEN_MIGRATION_DESTINATION") {
        const destination = message.destination;
        const url = DESTINATIONS[destination];
        if (!url) {
            reply(sendResponse, { success: false, error: `Unsupported destination: ${destination}` });
            return false;
        }

        chrome.tabs.create({ url, active: true }, tab => {
            const error = chrome.runtime.lastError;
            if (error) {
                console.error("[IKO Background] tabs.create failed:", error.message);
                reply(sendResponse, { success: false, error: error.message });
                return;
            }

            reply(sendResponse, {
                success: true,
                destination,
                url,
                tabId: tab?.id ?? null
            });
        });
        return true;
    }

    return false;
});
