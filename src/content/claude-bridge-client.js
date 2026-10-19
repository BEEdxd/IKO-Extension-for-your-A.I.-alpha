window.IKO = window.IKO || {};

window.IKO.claudeBridge = {
    latestConversation: null,
    latestConversationUrl: "",
    latestUsage: null,
    ready: false,

    requestConversationRefresh() {
        window.postMessage(
            {
                source: "IKO_CLAUDE_CONTENT",
                type: "REQUEST_REFRESH"
            },
            "*"
        );
    }
};

window.addEventListener("message", event => {
    if (event.source !== window) {
        return;
    }

    const message = event.data;

    if (!message || message.source !== "IKO_CLAUDE_BRIDGE") {
        return;
    }

    if (message.type === "BRIDGE_READY") {
        window.IKO.claudeBridge.ready = true;
        console.log("[IKO Claude] Bridge ready");
    }

    if (message.type === "CONVERSATION_DATA") {
        window.IKO.claudeBridge.latestConversation =
            message.payload?.data || null;
        // Keep the fetched URL too: it names the conversation the payload
        // belongs to, which is how the HUD rejects another chat's payload.
        window.IKO.claudeBridge.latestConversationUrl =
            message.payload?.url || "";

        window.dispatchEvent(
            new CustomEvent("iko-claude-conversation-updated")
        );
    }

    if (message.type === "USAGE_DATA") {
        window.IKO.claudeBridge.latestUsage =
            message.payload?.data || null;

        window.dispatchEvent(
            new CustomEvent("iko-claude-usage-updated")
        );
    }
});