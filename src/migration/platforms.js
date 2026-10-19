// Single source of truth for every LLM. Adding a new site = 1 entry here.
// No new adapter / manifest / background code needed beyond this table.
const PLATFORMS = Object.freeze({
    chatgpt: {
        id: "chatgpt", name: "ChatGPT",
        hosts: ["chatgpt.com", "chat.openai.com"],
        newUrl: "https://chatgpt.com/",
        budget: 200000, pricePer1M: 2.5,
        selectors: ["[data-message-author-role]", '[data-testid^="conversation-turn-"]', "[data-message-id]", "main article"],
        composers: ["#prompt-textarea", "form textarea", "textarea"]
    },
    claude: {
        id: "claude", name: "Claude",
        hosts: ["claude.ai"],
        newUrl: "https://claude.ai/new",
        budget: 200000, pricePer1M: 3.0,
        selectors: ["[data-testid='chat-message']", "main article"],
        composers: ["[data-testid='chat-input']", ".ProseMirror", "fieldset [contenteditable='true']"]
    },
    gemini: {
        id: "gemini", name: "Gemini",
        hosts: ["gemini.google.com"],
        newUrl: "https://gemini.google.com/",
        budget: 1000000, pricePer1M: 1.25,
        selectors: ["message-content", ".query-content", "main article"],
        composers: ["rich-textarea", "[aria-label='Enter a prompt here']", "textarea"]
    },
    perplexity: {
        id: "perplexity", name: "Perplexity",
        hosts: ["perplexity.ai"],
        newUrl: "https://www.perplexity.ai/",
        budget: 127000, pricePer1M: 1.0,
        selectors: ["[data-testid='answer']", "main article"],
        composers: ["textarea", "[contenteditable='true']"]
    },
    copilot: {
        id: "copilot", name: "Copilot",
        hosts: ["copilot.microsoft.com", "www.copilot.microsoft.com", "m365.cloud.microsoft"],
        newUrl: "https://copilot.microsoft.com/",
        budget: 128000, pricePer1M: 2.0,
        selectors: ["main article", "[data-content='ai-message']"],
        composers: ["textarea", "[contenteditable='true']"]
    },
    grok: {
        id: "grok", name: "Grok",
        hosts: ["grok.com", "x.com"],
        newUrl: "https://grok.com/",
        budget: 131000, pricePer1M: 2.0,
        selectors: ["main article", "[data-testid='message']"],
        composers: ["textarea", "[contenteditable='true']"]
    },
    deepseek: {
        id: "deepseek", name: "DeepSeek",
        hosts: ["chat.deepseek.com"],
        newUrl: "https://chat.deepseek.com/",
        budget: 64000, pricePer1M: 0.5,
        selectors: ["main article", ".message-content"],
        composers: ["textarea", "[contenteditable='true']"]
    },
    mistral: {
        id: "mistral", name: "Mistral",
        hosts: ["chat.mistral.ai"],
        newUrl: "https://chat.mistral.ai/chat",
        budget: 32000, pricePer1M: 1.0,
        selectors: ["main article", "[data-testid='message']"],
        composers: ["textarea", "[contenteditable='true']"]
    },
    poe: {
        id: "poe", name: "Poe",
        hosts: ["poe.com"],
        newUrl: "https://poe.com/",
        budget: 128000, pricePer1M: 2.0,
        selectors: ["main article", "[data-testid='message']"],
        composers: ["textarea", "[contenteditable='true']"]
    }
});

function matchPlatform(hostname) {
    const host = String(hostname || "").toLowerCase();
    for (const p of Object.values(PLATFORMS)) {
        if (p.hosts.some(h => host === h || host.endsWith("." + h))) return p;
    }
    return null;
}

function allHosts() {
    return Object.values(PLATFORMS).flatMap(p => p.hosts);
}

module.exports = { PLATFORMS, matchPlatform, allHosts };
