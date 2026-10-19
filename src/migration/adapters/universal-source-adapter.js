const { SourceAdapter } = require("./adapter-interface.js");
const { matchPlatform } = require("../platforms.js");
const { loadAllHistory } = require("../core/full-history.js");

function log(level, message, data) {
    try {
        const l = globalThis.window?.IKO?.logger;
        if (l?.[level]) l[level]("Universal-extract", message, data);
        else console.log(`[IKO:Universal-extract] ${message}`, data ?? "");
    } catch { /* ignore */ }
}

// Generic extractor: platform selectors first, then <main> text-block fallback.
// Works on any LLM without site-specific code.
class UniversalSourceAdapter extends SourceAdapter {
    constructor(platformId) {
        super(platformId || "universal");
        this.platformId = platformId || matchPlatform(location.hostname)?.id || "unknown";
    }

    async extractSession() {
        const plat = matchPlatform(location.hostname);
        const pid = this.platformId !== "universal" ? this.platformId : (plat?.id || "unknown");
        log("info", "extract start", { url: location.href, platform: pid });
        await new Promise(r => setTimeout(r, 400));

        // Lazy history: bring the whole thread into the DOM before reading it.
        try {
            const fh = await loadAllHistory();
            log("info", "full-history walk", {
                ok: fh.ok, skipped: !!fh.skipped, reason: fh.reason,
                steps: fh.steps, count: fh.count
            });
        } catch (e) {
            log("warn", "full-history walk failed", { error: String(e?.message || e).slice(0, 200) });
        }

        const selectors = [...(plat?.selectors || []),
            "[data-message-author-role]", '[data-testid^="conversation-turn-"]',
            "[data-message-id]", "main article", "main [data-turn]"];
        const seen = new Set();
        const messages = [];
        for (const sel of selectors) {
            let nodes = [];
            try { nodes = Array.from(document.querySelectorAll(sel)); } catch { continue; }
            if (nodes.length) log("info", `selector ${sel}: ${nodes.length}`, {});
            for (const node of nodes) {
                if (seen.has(node)) continue;
                seen.add(node);
                const t = ((node.querySelector?.(".markdown") || node).innerText || node.textContent || "").trim();
                if (!t || t.length < 2) continue;
                if (messages.length && messages[messages.length - 1].raw?.text === t) continue;
                const roleAttr = node.getAttribute?.("data-message-author-role");
                const role = roleAttr === "assistant" ? "assistant" : "user";
                messages.push({
                    id: `${pid}-${messages.length + 1}`, role, sourceRole: String(roleAttr || sel),
                    content: t, parentId: messages.length ? messages[messages.length - 1].id : null,
                    timestamp: null, model: null, raw: { text: t }
                });
            }
            if (messages.length >= 2) break;
        }

        if (!messages.length) {
            // Fallback: largest text blocks under <main> in order, alternate roles
            const main = document.querySelector("main") || document.body;
            const scored = [];
            for (const el of Array.from(main.querySelectorAll("div, article, section")).slice(0, 2000)) {
                if (!(el instanceof HTMLElement)) continue;
                const t = (el.innerText || "").trim();
                if (t.length < 120 || t.length > 50000) continue;
                scored.push({ el, len: t.length, text: t });
                if (scored.length > 600) break;
            }
            scored.sort((a, b) => b.len - a.len);
            const kept = [];
            for (const c of scored) {
                if (kept.some(k => k.text.includes(c.text.slice(0, 80)) && k.text.length >= c.text.length)) continue;
                if (kept.length >= 60) break;
                kept.push(c);
            }
            kept.sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
            kept.map(k => k.text)
                .filter(t => t.length > 120 && !/^Ask ChatGPT/i.test(t))
                .forEach((t, i) => messages.push({
                    id: `${pid}-fb-${i + 1}`, role: i % 2 === 0 ? "user" : "assistant",
                    sourceRole: "fallback-alternating", content: t.slice(0, 20000),
                    parentId: i ? `${pid}-fb-${i}` : null,
                    timestamp: null, model: null, raw: { text: t.slice(0, 20000) }
                }));
            if (messages.length) log("info", `fallback produced ${messages.length}`, {});
        }

        if (!messages.length) throw new Error(`No visible messages on ${pid}. Scroll so turns render, then retry. Open View logs → Copy logs.`);
        return {
            platform: pid,
            conversationId: location.pathname.split("/").filter(Boolean).pop() || `${pid}-${Date.now()}`,
            title: document.title || `${pid} Conversation`,
            model: null, createdAt: null, updatedAt: null,
            extractorVersion: "iko-universal-1",
            messages, activeLeafId: messages[messages.length - 1].id, instructions: []
        };
    }
}

module.exports = { UniversalSourceAdapter };
