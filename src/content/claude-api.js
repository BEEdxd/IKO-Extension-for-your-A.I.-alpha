"use strict";

function estimateTokens(messages) {
    const text = Array.isArray(messages)
        ? messages.map(message => String(message?.content || "")).join("\n")
        : String(messages || "");

    // Browser-only fallback. Anthropic's exact server-side tokenizer requires
    // an Anthropic API call, so the public IKO build intentionally stays local.
    return Math.max(0, Math.ceil(text.length / 4));
}

export async function countClaudeTokens({ messages }) {
    window.IKO = window.IKO || {};
    window.IKO.claudeTokenCountSource = "local-estimate";
    return estimateTokens(messages);
}
