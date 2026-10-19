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
    const origFetch = window.fetch;
    window.fetch = async function (...args) {
        const resp = await origFetch.apply(this, args);
        const u = urlOf(args[0]);
        try {
            if (isConvUrl(u)) {
                resp.clone().json().then(data => publish("CONVERSATION_DATA", { url: u, data }))
                    .catch(() => {});
            }
        } catch { /* ignore */ }
        return resp;
    };
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u, ...r) {
        this.__ikoUrl = String(u || "");
        return origOpen.call(this, m, u, ...r);
    };
    XMLHttpRequest.prototype.send = function (...a) {
        const xhr = this, u = xhr.__ikoUrl || "";
        if (isConvUrl(u)) {
            xhr.addEventListener("load", function () {
                try { publish("CONVERSATION_DATA", { url: u, data: JSON.parse(xhr.responseText) }); }
                catch { /* ignore */ }
            });
        }
        return origSend.apply(this, a);
    };
    publish("BRIDGE_READY", { href: location.href });
})();
