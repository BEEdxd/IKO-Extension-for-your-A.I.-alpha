(function () {
    "use strict";
    if (window.__IKO_CHATGPT_BRIDGE_INSTALLED__) return;
    window.__IKO_CHATGPT_BRIDGE_INSTALLED__ = true;
    const SRC = "IKO_CHATGPT_BRIDGE";
    function publish(type, payload) {
        try { window.postMessage({ source: SRC, type, payload }, "*"); } catch { /* ignore */ }
    }
    function urlOf(input) {
        try {
            if (typeof input === "string") return input;
            if (input instanceof URL) return input.href;
            if (input && typeof input.url === "string") return input.url;
            return String(input || "");
        } catch { return ""; }
    }
    function isConvUrl(u) {
        const s = String(u || "").toLowerCase();
        return s.includes("/backend-api/conversation") || s.includes("/backend-api/conversations");
    }
    function findActualUsage(data) {
        if (!data || typeof data !== "object") return null;
        if (data.usage && typeof data.usage === "object") {
            const u = data.usage;
            if (typeof u.total_tokens === "number" || typeof u.prompt_tokens === "number" || typeof u.completion_tokens === "number") {
                return u;
            }
        }
        if (typeof data.total_tokens === "number" || typeof data.prompt_tokens === "number") {
            return {
                prompt_tokens: data.prompt_tokens,
                completion_tokens: data.completion_tokens,
                total_tokens: data.total_tokens
            };
        }
        if (data.message?.metadata?.usage) {
            return data.message.metadata.usage;
        }
        if (data.mapping && typeof data.mapping === "object") {
            for (const id in data.mapping) {
                const u = data.mapping[id]?.message?.metadata?.usage;
                if (u && (typeof u.total_tokens === "number" || typeof u.prompt_tokens === "number")) {
                    return u;
                }
            }
        }
        return null;
    }

    function publishActualUsage(data, u) {
        try {
            const usage = findActualUsage(data);
            if (usage) {
                publish("ACTUAL_USAGE", { url: u, usage, data });
            }
        } catch { /* ignore */ }
    }

    const origFetch = window.fetch;

    window.fetch = async function (...args) {
        const resp = await origFetch.apply(this, args);
        const u = urlOf(args[0]);

        try {
            const clone = resp.clone();

            clone.json().then((data) => {
                if (isConvUrl(u)) {
                    publish("CONVERSATION_DATA", { url: u, data });
                }

                // Capture actual usage if the response exposes it.
                publishActualUsage(data, u);
            }).catch(() => {});
        } catch (error) {
            console.warn("[IKO] Response inspection failed:", error);
        }

        return resp;
    };

    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u, ...r) {
        this.__ikoUrl = String(u || "");
        return origOpen.call(this, m, u, ...r);
    };

    XMLHttpRequest.prototype.send = function (...a) {
        const xhr = this;
        const u = xhr.__ikoUrl || "";

        xhr.addEventListener("load", function () {
            try {
                const data = JSON.parse(xhr.responseText);

                if (isConvUrl(u)) {
                    publish("CONVERSATION_DATA", { url: u, data });
                }

                publishActualUsage(data, u);
            } catch {
                // Ignore non-JSON responses.
            }
        });

        return origSend.apply(this, a);
    };
    publish("BRIDGE_READY", { href: location.href });
})();
