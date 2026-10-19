"use strict";

import { extractConversationMessages } from "../migration/core/chat-thread.js";

// Runs in the page (MAIN world) and publishes the conversation payloads the
// page itself fetches. `latestConversation` is the migration contract; it is
// the LAST matching payload, and ChatGPT's sidebar chat-list shares the
// /backend-api/conversations prefix — so it can be a chat LIST rather than the
// open conversation. `latestValidConversation` keeps the last payload that
// really parses as a conversation, which is what the Context HUD counts from.
window.IKO = window.IKO || {};
window.IKO.chatgptBridge = { latestConversation: null, latestValidConversation: null, latestValidMessages: 0, ready: false,
    requestConversationRefresh() {
        try { window.postMessage({ source: "IKO_CHATGPT_CONTENT", type: "REQUEST_REFRESH" }, "*"); } catch { /* ignore */ }
    }
};
window.addEventListener("message", event => {
    if (event.source !== window) return;
    const m = event.data;
    if (!m || m.source !== "IKO_CHATGPT_BRIDGE") return;
    if (m.type === "BRIDGE_READY") { window.IKO.chatgptBridge.ready = true; console.log("[IKO ChatGPT] Bridge ready"); }
    if (m.type === "CONVERSATION_DATA") {
        const data = m.payload?.data || null;
        window.IKO.chatgptBridge.latestConversation = data;
        try {
            const parsed = extractConversationMessages(data);
            // Keep the largest conversation seen (the bridge is also fed by the
            // HUD's own endpoint read, which must not be downgraded).
            if (parsed?.length && parsed.length >= (window.IKO.chatgptBridge.latestValidMessages || 0)) {
                window.IKO.chatgptBridge.latestValidConversation = data;
                window.IKO.chatgptBridge.latestValidMessages = parsed.length;
            }
        } catch { /* ignore */ }
        try { window.IKO?.logger?.info?.("ChatGPT-bridge", "conversation captured", { url: String(m.payload?.url || "").slice(0, 120) }); } catch { /* ignore */ }
        window.dispatchEvent(new CustomEvent("iko-chatgpt-conversation-updated"));
    }
});
