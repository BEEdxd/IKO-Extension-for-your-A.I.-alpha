window.IKO = window.IKO || {};

window.IKO.platform = {
    detect() {
        const host = window.location.hostname.toLowerCase();
        const table = [
            ["chatgpt", "ChatGPT"], ["openai", "ChatGPT"],
            ["claude", "Claude"],
            ["gemini", "Gemini"],
            ["perplexity", "Perplexity"],
            ["copilot", "Copilot"],
            ["grok", "Grok"],
            ["deepseek", "DeepSeek"],
            ["mistral", "Mistral"],
            ["poe", "Poe"]
        ];
        for (const [key, name] of table) {
            if (host.includes(key)) return name;
        }
        // Generic fallback: pretty-print first host segment
        try {
            const seg = host.split(".").slice(-2, -1)[0] || host;
            return seg.charAt(0).toUpperCase() + seg.slice(1);
        } catch { return "Unknown"; }
    }
};
