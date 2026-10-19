"use strict";

// Central IKO logger — visible in DevTools + in-panel UI.
// Keeps last 500 entries so users can copy/paste when something breaks.
(function () {
    const MAX = 500;
    const buffer = [];

    function timestamp() {
        try {
            return new Date().toISOString();
        } catch {
            return String(Date.now());
        }
    }

    function push(level, tag, message, data) {
        const entry = {
            time: timestamp(),
            level,
            tag,
            message: String(message ?? ""),
            data: data !== undefined ? safeData(data) : undefined
        };
        buffer.push(entry);
        if (buffer.length > MAX) buffer.splice(0, buffer.length - MAX);

        const line = `[IKO:${tag}] ${entry.message}`;
        try {
            if (level === "error") console.error(line, data ?? "");
            else if (level === "warn") console.warn(line, data ?? "");
            else console.log(line, data ?? "");
        } catch { /* console unavailable */ }

        try {
            window.dispatchEvent(new CustomEvent("iko-log-updated", { detail: entry }));
        } catch { /* ignore */ }
        return entry;
    }

    function safeData(data) {
        try {
            if (data instanceof Error) {
                return { name: data.name, message: data.message, stack: data.stack };
            }
            if (typeof data === "object") {
                return JSON.parse(JSON.stringify(data, (_k, v) =>
                    typeof v === "bigint" ? String(v) : v
                ).slice(0, 8000));
            }
            return data;
        } catch {
            try { return String(data).slice(0, 2000); } catch { return "[unserializable]"; }
        }
    }

    function formatAll() {
        return buffer.map(e => {
            const extra = e.data !== undefined ? ` | ${JSON.stringify(e.data).slice(0, 1000)}` : "";
            return `${e.time} [${e.level.toUpperCase()}] [${e.tag}] ${e.message}${extra}`;
        }).join("\n");
    }

    function diagnostics() {
        return {
            url: location.href,
            title: document.title,
            userAgent: navigator.userAgent,
            readyState: document.readyState,
            chatgptLegacyCount: document.querySelectorAll("[data-message-author-role]").length,
            chatgptTurnCount: document.querySelectorAll('[data-testid^="conversation-turn-"]').length,
            articleCount: document.querySelectorAll("main article").length,
            messageIdCount: document.querySelectorAll("[data-message-id]").length,
            logCount: buffer.length
        };
    }

    window.IKO = window.IKO || {};
    window.IKO.logger = {
        info: (tag, msg, data) => push("info", tag, msg, data),
        warn: (tag, msg, data) => push("warn", tag, msg, data),
        error: (tag, msg, data) => push("error", tag, msg, data),
        getLogs: () => [...buffer],
        formatAll,
        diagnostics,
        copyAll: async () => {
            const text = `=== IKO DIAGNOSTICS ===\n${JSON.stringify(diagnostics(), null, 2)}\n\n=== IKO LOGS ===\n${formatAll()}`;
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch {
                return false;
            }
        }
    };
})();
