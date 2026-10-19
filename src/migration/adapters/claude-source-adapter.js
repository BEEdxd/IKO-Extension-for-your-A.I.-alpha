const { SourceAdapter, AdapterError } = require("./adapter-interface.js");
const { loadAllHistory } = require("../core/full-history.js");

function log(level, message, data) {
    try {
        const l = globalThis.window?.IKO?.logger;
        if (l?.[level]) l[level]("Claude-extract", message, data);
        else console.log(`[IKO:Claude-extract] ${message}`, data ?? "");
    } catch { /* ignore */ }
}

// ---------- pure helpers (no DOM — covered by node tests) ----------

function asText(v) {
    return typeof v === "string" ? v : "";
}

function detectRole(raw) {
    if (!raw || typeof raw !== "object") return null;
    const sender = asText(raw.sender).toLowerCase();
    if (sender === "human" || sender === "user") return "user";
    if (sender === "assistant") return "assistant";
    const role = asText(raw.role).toLowerCase();
    if (role === "user" || role === "human") return "user";
    if (role === "assistant") return "assistant";
    const author = typeof raw.author === "string" ? raw.author.toLowerCase()
        : asText(raw.author?.role).toLowerCase();
    if (author === "human" || author === "user") return "user";
    if (author === "assistant") return "assistant";
    const authorRole = asText(raw.author_role).toLowerCase();
    if (authorRole === "human" || authorRole === "user") return "user";
    if (authorRole === "assistant") return "assistant";
    const from = asText(raw.from).toLowerCase();
    if (from === "human" || from === "user") return "user";
    if (from === "assistant" || from === "ai") return "assistant";
    // nested message wrappers (some API shapes nest one level)
    if (raw.message && raw.message !== raw) return detectRole(raw.message);
    return null;
}

// Anthropic keeps changing block shapes — accept everything text-ish.
// Depth-guarded recursion for nested {message:{message:{...}}} shells.
function extractTextDeep(message, depth = 0) {
    if (!message || depth > 3) return "";
    if (typeof message === "string") return message.trim();
    if (typeof message !== "object") return "";
    for (const key of ["text", "completion", "answer", "output_text"]) {
        const v = message[key];
        if (typeof v === "string" && v.trim()) return v.trim();
    }
    if (typeof message.content === "string" && message.content.trim()) return message.content.trim();
    const arr = Array.isArray(message.content) ? message.content
        : Array.isArray(message.message?.content) ? message.message.content
        : Array.isArray(message.blocks) ? message.blocks
        : Array.isArray(message.parts) ? message.parts
        : null;
    if (arr) {
        const parts = [];
        for (const b of arr) {
            if (!b) continue;
            if (typeof b === "string") { parts.push(b); continue; }
            if (typeof b !== "object") continue;
            if (b.type === "thinking" || b.type === "tool_use") continue; // noise first pass
            if (typeof b.text === "string" && b.text.trim()) { parts.push(b.text); continue; }
            if (typeof b.content === "string" && b.content.trim()) { parts.push(b.content); continue; }
            if (typeof b.input?.text === "string" && b.input.text.trim()) { parts.push(b.input.text); continue; }
        }
        const joined = parts.join("\n").trim();
        if (joined) return joined;
    }
    // nested shells: {message:{...}}
    if (message.message && message.message !== message) {
        const nested = extractTextDeep(message.message, depth + 1);
        if (nested && nested.trim()) return nested;
    }
    return "";
}

function messageId(raw, fallback) {
    const id = raw?.uuid || raw?.id || raw?.message_id || raw?.message?.uuid || raw?.message?.id;
    return String(id || fallback);
}

// Normalize any bridge payload shape into linked user/assistant messages.
// Returns [] when nothing usable is present (caller decides fallback/error).
function parseBridgeMessages(conversation) {
    if (!conversation || typeof conversation !== "object") return [];
    const candidates = [
        conversation.chat_messages,
        conversation.messages,
        conversation.conversation_messages,
        conversation.turns,
        conversation.message_list,
        conversation.history,
        conversation.conversation?.chat_messages,
        conversation.conversation?.messages,
        conversation.data?.messages
    ];
    let rawMessages = null;
    for (const c of candidates) {
        if (Array.isArray(c) && c.length) { rawMessages = c; break; }
    }
    if (!rawMessages) return [];
    const messages = [];
    for (const raw of rawMessages) {
        const role = detectRole(raw);
        if (!role) {
            log("warn", "skipped Claude message with unknown role", {
                keys: raw && typeof raw === "object" ? Object.keys(raw).slice(0, 15) : typeof raw
            });
            continue;
        }
        const content = extractTextDeep(raw).trim();
        if (!content) {
            log("warn", "skipped empty Claude message", {
                keys: raw && typeof raw === "object" ? Object.keys(raw).slice(0, 15) : typeof raw
            });
            continue;
        }
        const id = messageId(raw, `claude-${messages.length + 1}`);
        messages.push({
            id,
            role,
            sourceRole: String(raw.sender || raw.role || (raw.author && raw.author.role) || role),
            content: content.slice(0, 20000),
            parentId: messages.length ? messages[messages.length - 1].id : null,
            timestamp: raw.created_at || raw.timestamp || raw.message?.created_at || null,
            model: raw.model || null,
            raw
        });
    }
    return messages;
}

// ---------- DOM helpers (browser only) ----------

function fingerprintClaude() {
    try {
        const doc = globalThis.document;
        if (!doc) return { noDocument: true };
        const main = doc.querySelector("main") || doc.body;
        if (!main) return { hasMain: false };
        const all = Array.from(main.querySelectorAll("*")).slice(0, 4000);
        const dataAttrs = new Set();
        const testids = new Set();
        const tagCounts = {};
        for (const el of all) {
            const tag = (el.tagName || "?").toLowerCase();
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            const attrs = el.attributes || [];
            for (const a of attrs) {
                if (a.name && a.name.startsWith("data-")) {
                    dataAttrs.add(a.name);
                    if (a.name === "data-testid" && testids.size < 40) testids.add(String(a.value).slice(0, 80));
                }
            }
            if (testids.size >= 40) break;
        }
        return {
            hasMain: true,
            totalNodes: all.length,
            mainTextLen: (main.innerText || "").length,
            chatMessageCount: doc.querySelectorAll('[data-testid="chat-message"]').length,
            messageIdCount: doc.querySelectorAll("[data-message-id]").length,
            articleCount: doc.querySelectorAll("main article").length,
            dataAttrs: [...dataAttrs].slice(0, 30),
            testids: [...testids].slice(0, 30),
            topTags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 12)
        };
    } catch (e) {
        return { error: String(e) };
    }
}

function claudeTextOf(node) {
    try {
        const md = node.querySelector?.(".markdown, [data-testid='markdown'], .font-claude-message");
        return ((md || node).innerText || node.textContent || "").trim();
    } catch { return ""; }
}

function claudeRoleOf(node) {
    try {
        const d = node.getAttribute?.("data-role") || node.getAttribute?.("data-sender");
        if (d === "assistant" || d === "user" || d === "human" || d === "system") {
            return d === "human" ? "user" : d;
        }
        const tid = node.getAttribute?.("data-testid") || "";
        if (/assistant/i.test(tid)) return "assistant";
        if (/user|human/i.test(tid)) return "user";
        if (node.querySelector?.("button[aria-label*='Copy'], button[aria-label*='Read aloud'], button[aria-label*='Retry']")) return "assistant";
    } catch { /* ignore */ }
    return null;
}

const CHROME_RE = /^(Claude can make mistakes|Help|Settings|Start a new chat|Write, edit|Ask Claude|Send|Attach|New chat|Recents|Chats)\b/i;

function collectStructuredClaude(doc) {
    const selectors = [
        '[data-testid="chat-message"]',
        "[data-message-id]",
        "main article",
        "main [data-turn]",
        '[data-testid^="message-"]'
    ];
    const seen = new Set();
    const out = [];
    for (const sel of selectors) {
        let nodes = [];
        try { nodes = Array.from(doc.querySelectorAll(sel)); } catch { continue; }
        log("info", `Claude selector ${sel}: ${nodes.length}`, {});
        for (const node of nodes) {
            if (seen.has(node)) continue;
            seen.add(node);
            const t = claudeTextOf(node);
            if (!t || t.length < 2 || CHROME_RE.test(t.slice(0, 80))) continue;
            if (out.length && out[out.length - 1].raw?.text === t) continue;
            out.push({
                node,
                role: claudeRoleOf(node),
                text: t
            });
        }
        if (out.length >= 2) break;
    }
    return out;
}

// Structured DOM nodes -> normalized messages (alternating roles when the
// markup carries no role signal).
function domMessagesFromClaude(found) {
    const out = [];
    let autoRole = "user"; // Claude chats start with the user
    for (const f of found) {
        const role = f.role || autoRole;
        autoRole = role === "user" ? "assistant" : "user";
        out.push({
            id: `claude-dom-${out.length + 1}`,
            role,
            sourceRole: f.role ? `dom:${f.role}` : "dom-alternating",
            content: f.text.slice(0, 20000),
            parentId: out.length ? out[out.length - 1].id : null,
            timestamp: null, model: null,
            raw: { text: f.text.slice(0, 20000), strategy: "structured-dom" }
        });
    }
    return out;
}

// Leaf-only fallback: keep innermost text containers, drop shell wrappers.
// (The old version kept the outermost node — the whole <main> as 1 block.)
function leafBlocksClaude(doc) {
    const main = doc.querySelector("main") || doc.body;
    const cands = [];
    const walker = doc.createTreeWalker(main, 1 /* SHOW_ELEMENT */, {
        acceptNode(el) {
            if (!(el instanceof (globalThis.HTMLElement || Object))) return 2; // SKIP
            if (/^(SCRIPT|STYLE|NAV|HEADER|FOOTER|BUTTON|TEXTAREA|INPUT)$/.test(el.tagName)) return 2;
            return 1; // ACCEPT
        }
    });
    while (walker.nextNode()) {
        const el = walker.currentNode;
        let t = "";
        try { t = (el.innerText || "").trim(); } catch { continue; }
        if (t.length < 120 || t.length > 50000) continue;
        if (el === main) continue;
        if (CHROME_RE.test(t.slice(0, 120))) continue;
        cands.push({ el, len: t.length, text: t });
        if (cands.length > 1200) break;
    }
    const leaves = cands.filter(a =>
        !cands.some(b => b !== a && a.el.contains(b.el) && b.text.length > 80)
    );
    leaves.sort((a, b) => {
        try {
            return (a.el.compareDocumentPosition(b.el) & 4) ? -1 : 1; // FOLLOWING
        } catch { return 0; }
    });
    const seen = new Set();
    const ordered = [];
    for (const c of leaves) {
        const key = c.text.slice(0, 120);
        if (seen.has(key)) continue;
        seen.add(key);
        if (ordered.length && ordered[ordered.length - 1].text === c.text) continue;
        ordered.push(c);
        if (ordered.length >= 80) break;
    }
    return ordered;
}

function isNewClaudeChat() {
    try {
        const p = String(globalThis.location?.pathname || "");
        return p === "/" || /\/new\/?$/.test(p);
    } catch { return false; }
}

class ClaudeSourceAdapter extends SourceAdapter {
    constructor() {
        super("Claude");
    }

    async extractSession() {
        const win = globalThis.window;
        const bridge = win?.IKO?.claudeBridge;
        if (!bridge) {
            throw new AdapterError("Claude bridge is not available. Reload Claude and try again.");
        }

        if (!bridge.latestConversation) {
            bridge.requestConversationRefresh?.();
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    cleanup();
                    if (isNewClaudeChat()) {
                        reject(new AdapterError("This looks like a new/empty Claude chat — open a conversation with messages first, then migrate."));
                    } else {
                        reject(new AdapterError("Claude conversation data was not received. Make sure a Claude conversation is open."));
                    }
                }, 10000);
                const handler = () => {
                    if (globalThis.window?.IKO?.claudeBridge?.latestConversation) {
                        cleanup();
                        resolve();
                    }
                };
                const cleanup = () => {
                    clearTimeout(timeout);
                    try { win.removeEventListener("iko-claude-conversation-updated", handler); } catch { /* ignore */ }
                };
                try { win.addEventListener("iko-claude-conversation-updated", handler); } catch { /* ignore */ }
                handler();
            });
        }

        const conversation = bridge.latestConversation;
        try {
            log("info", "bridge payload keys", {
                keys: conversation && typeof conversation === "object" ? Object.keys(conversation) : typeof conversation,
                url: (() => { try { return location.href; } catch { return "?"; } })()
            });
        } catch { /* ignore */ }

        let messages = parseBridgeMessages(conversation);
        log("info", `bridge parsed: ${messages.length} messages`, {});

        const doc = globalThis.document;

        // Lazy history: Claude mounts only the last visible turns on load and
        // back-fills older ones while scrolling toward the top.
        if (doc) {
            try {
                const fh = await loadAllHistory();
                log("info", "full-history walk", {
                    ok: fh.ok, skipped: !!fh.skipped, reason: fh.reason,
                    steps: fh.steps, count: fh.count
                });
            } catch (e) {
                log("warn", "full-history walk failed", { error: String(e?.message || e).slice(0, 200) });
            }
        }

        // Structured DOM pass (Claude's current markup) — used when the bridge
        // has nothing, or when the DOM captured more turns than the bridge did.
        if (doc) {
            const found = collectStructuredClaude(doc);
            log("info", `Claude structured DOM: ${found.length} nodes`, {});
            const domMessages = domMessagesFromClaude(found);
            if (domMessages.length > messages.length) {
                if (messages.length) log("info", `DOM has more turns than bridge (${domMessages.length} > ${messages.length}) — using DOM`, {});
                messages = domMessages;
            }
        }

        // Leaf DOM fallback (last resort)
        let usedFallback = false;
        if (!messages.length && doc) {
            log("warn", "bridge + structured DOM yielded 0 messages, trying leaf fallback", {});
            const blocks = leafBlocksClaude(doc);
            log("info", `Claude leaf fallback blocks: ${blocks.length}`, { lens: blocks.map(b => b.len).slice(0, 10) });
            blocks.forEach((b, i) => messages.push({
                id: `claude-fb-${i + 1}`,
                role: i % 2 === 0 ? "user" : "assistant",
                sourceRole: "dom-fallback",
                content: b.text.slice(0, 20000),
                parentId: i ? `claude-fb-${i}` : null,
                timestamp: null, model: null,
                raw: { text: b.text.slice(0, 20000), strategy: "fallback-leaf" }
            }));
            usedFallback = messages.length > 0;
        }

        if (!messages.length) {
            if (isNewClaudeChat()) {
                throw new AdapterError("This looks like a new/empty Claude chat — open a conversation with messages first, then migrate.");
            }
            let fp = {};
            try { fp = fingerprintClaude(); } catch { /* ignore */ }
            log("error", "Claude extract failed", fp);
            const fpLine = `finger: main=${fp.hasMain} nodes=${fp.totalNodes ?? "?"} textLen=${fp.mainTextLen ?? "?"} chatMsg=${fp.chatMessageCount ?? "?"} data=[${(fp.dataAttrs || []).join(",")}]`;
            throw new AdapterError(
                "Claude conversation contains no usable user/assistant messages.\n\n" +
                "I logged a DOM fingerprint — open 'View logs' → 'Copy logs' and paste it so the exact markup can be added.\n\n" +
                fpLine
            );
        }

        if (usedFallback) {
            try { win?.IKO?.logger?.warn?.("Claude-extract", "Used fallback alternating roles — verify user/assistant order in preview", {}); } catch { /* ignore */ }
        }

        // Repair parent references so the normalized active branch is always valid.
        const ids = new Set(messages.map(message => message.id));
        for (let i = 0; i < messages.length; i += 1) {
            if (i === 0) {
                messages[i].parentId = null;
            } else if (!ids.has(messages[i].parentId)) {
                messages[i].parentId = messages[i - 1].id;
            }
        }

        log("info", `Claude extracted ${messages.length} messages`, {});
        let convId = `claude-${Date.now()}`;
        let title = "Claude Conversation";
        try {
            convId = String(conversation?.uuid || conversation?.id || globalThis.location?.pathname || convId);
            title = conversation?.name || conversation?.title
                || String(globalThis.document?.title || "").replace(/\s*[—|-]\s*Claude.*$/i, "")
                || title;
        } catch { /* ignore */ }

        return {
            platform: "claude",
            conversationId: convId,
            title,
            model: conversation?.model || null,
            createdAt: conversation?.created_at || null,
            updatedAt: conversation?.updated_at || null,
            extractorVersion: "iko-claude-4-fullhistory",
            messages,
            activeLeafId: messages[messages.length - 1].id,
            instructions: []
        };
    }

    extractText(message) { return extractTextDeep(message); }
}

module.exports = { ClaudeSourceAdapter, detectRole, extractTextDeep, parseBridgeMessages, domMessagesFromClaude };
