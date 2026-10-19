const { SourceAdapter, AdapterError } = require("./adapter-interface.js");
const { loadAllHistory } = require("../core/full-history.js");
// Same reader the Context HUD uses: selector pass, thread estimate, deep scan.
// It is the safety net for app-shell DOMs whose markup we do not know.
const chatThread = require("../core/chat-thread.js");

function log(level, message, data) {
    try {
        const logger = globalThis.window?.IKO?.logger;
        if (logger && logger[level]) logger[level]("ChatGPT-extract", message, data);
        else console.log(`[IKO:ChatGPT-extract] ${message}`, data ?? "");
    } catch { /* ignore */ }
}

function fingerprintMain() {
    try {
        const main = document.querySelector("main");
        const bodyLen = (document.body?.innerText || "").length;
        if (!main) return { hasMain: false, bodyLen };
        const all = Array.from(main.querySelectorAll("*")).slice(0, 4000);
        const dataAttrs = new Set();
        const testids = new Set();
        const tagCounts = {};
        for (const el of all) {
            const tag = el.tagName.toLowerCase();
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            for (const a of el.attributes || []) {
                if (a.name.startsWith("data-")) {
                    dataAttrs.add(a.name);
                    if (a.name === "data-testid" && testids.size < 40) testids.add(a.value.slice(0, 80));
                }
            }
            if (testids.size >= 40) break;
        }
        return {
            hasMain: true,
            totalNodes: all.length,
            mainTextLen: (main.innerText || "").length,
            bodyTextLen: bodyLen,
            dataAttrs: [...dataAttrs].slice(0, 30),
            testids: [...testids].slice(0, 30),
            topTags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 12),
            mainHtmlSample: main.innerHTML.slice(0, 3000)
        };
    } catch (e) {
        return { error: String(e) };
    }
}

function partsToText(content) {
    try {
        if (!content) return "";
        if (typeof content === "string") return content;
        if (Array.isArray(content.parts)) {
            return content.parts.map(p => {
                if (typeof p === "string") return p;
                if (p?.text) return p.text;
                try { return JSON.stringify(p); } catch { return ""; }
            }).join("\n").trim();
        }
        if (typeof content.text === "string") return content.text;
        return "";
    } catch { return ""; }
}

function parseListMessages(list) {
    const out = [];
    for (const raw of (list || [])) {
        const msg = raw?.message || raw;
        const role = msg?.author?.role || msg?.role || msg?.sender;
        if (role !== "user" && role !== "assistant" && role !== "system") continue;
        const text = partsToText(msg?.content).trim();
        if (!text || text.length < 2) continue;
        out.push({
            id: String(msg?.id || raw?.id || `chatgpt-api-${out.length + 1}`),
            role, sourceRole: String(role),
            content: text.slice(0, 20000),
            parentId: out.length ? out[out.length - 1].id : null,
            timestamp: msg?.create_time || raw?.create_time || null,
            model: msg?.metadata?.model_slug || null,
            raw: { api: true }
        });
    }
    return out.length ? out : null;
}

function parseBridgeData(data) {
    try {
        // Shape 1: full conversation with mapping (classic /backend-api/conversation/<id>)
        const root = data?.mapping ? data : data?.conversation || data?.data || null;
        const mapping = root?.mapping;
        if (mapping && typeof mapping === "object") {
            // walk current_node -> parent chain to preserve order
            let nodeId = root.current_node || root.currentNode || null;
            const chain = [];
            const seen = new Set();
            if (nodeId && mapping[nodeId]) {
                while (nodeId && !seen.has(nodeId)) {
                    seen.add(nodeId);
                    const node = mapping[nodeId];
                    if (!node) break;
                    chain.unshift(node);
                    nodeId = node.parent || node.parentId || null;
                }
            } else {
                // no current_node: take all message nodes in insertion order
                for (const n of Object.values(mapping)) chain.push(n);
            }
            const out = [];
            for (const n of chain) {
                const msg = n?.message || n;
                const role = msg?.author?.role || msg?.role;
                if (role !== "user" && role !== "assistant" && role !== "system") continue;
                const text = partsToText(msg?.content).trim();
                if (!text || text.length < 2) continue;
                out.push({
                    id: String(msg?.id || n?.id || `chatgpt-api-${out.length + 1}`),
                    role, sourceRole: String(role),
                    content: text.slice(0, 20000),
                    parentId: out.length ? out[out.length - 1].id : null,
                    timestamp: msg?.create_time || null, model: msg?.metadata?.model_slug || null,
                    raw: { api: true }
                });
            }
            if (out.length) return out;
        }
        // Shape 2: metadata + messages[] list (/backend-api/conversations/<id>?num_turns=)
        for (const key of ["messages", "turns", "conversation_messages", "items"]) {
            const list = data?.[key] || root?.[key];
            if (Array.isArray(list) && list.length) {
                const parsed = parseListMessages(list);
                if (parsed?.length) return parsed;
            }
        }
        return null;
    } catch { return null; }
}

function allKeys(data) {
    try { return Object.keys(data || {}); } catch { return []; }
}

// Same rule the HUD uses: the last path segment is a real conversation id.
function conversationId() {
    try {
        const last = location.pathname.split("/").filter(Boolean).pop() || "";
        return /^[0-9a-zA-Z-]{10,}$/.test(last) ? last : "";
    } catch { return ""; }
}

async function tryBridge() {
    const b = globalThis.window?.IKO?.chatgptBridge;
    const id = conversationId();
    // Prefer the last payload that really parsed: the sidebar's chat-list
    // shares the conversation URL prefix and overwrites latestConversation.
    const cached = b?.latestValidConversation || b?.latestConversation;
    if (cached) {
        // Never migrate another conversation's payload: the bridge can still
        // hold the previous chat while this tab shows a new one.
        const payloadId = String(cached?.conversation_id || "").slice(0, 64);
        if (!payloadId || !id || payloadId === id) {
            const parsed = parseBridgeData(cached);
            if (parsed?.length) {
                log("info", `bridge yielded ${parsed.length} messages`, {});
                return parsed;
            }
            log("warn", "bridge data present but unparsable", { keys: allKeys(cached) });
        } else {
            log("warn", "bridge holds another conversation — ignoring", { payloadId, id });
        }
    }
    // Direct fetch fallback: same-origin backend-api carries auth cookies.
    // NOTE: plural /conversations/<id> is the live endpoint (singular 404s)
    // and ?num_turns=1000 asks for the whole thread — the plain endpoint can
    // paginate, which is what made Prepare see "no messages" on real chats.
    try {
        if (id) {
            for (const path of [
                `/backend-api/conversations/${id}?num_turns=1000`,
                `/backend-api/conversations/${id}`,
                `/backend-api/conversation/${id}`
            ]) {
                try {
                    const r = await fetch(path, { credentials: "include" });
                    if (!r.ok) {
                        log("warn", `direct API ${path} status ${r.status}`, {});
                        continue;
                    }
                    const data = await r.json();
                    const parsed = parseBridgeData(data);
                    if (parsed?.length) {
                        // Keep the bridge's "best payload so far" pointers in
                        // sync so the HUD and the next Prepare need no network.
                        try {
                            const bridge = globalThis.window.IKO.chatgptBridge;
                            bridge.latestConversation = data;
                            if (parsed.length > (bridge.latestValidMessages || 0)) {
                                bridge.latestValidConversation = data;
                                bridge.latestValidMessages = parsed.length;
                            }
                        } catch { /* ignore */ }
                        log("info", `direct API (${path}) yielded ${parsed.length} messages`, {});
                        return parsed;
                    }
                    log("warn", `direct API (${path}) unparsable`, { keys: allKeys(data) });
                } catch (e) {
                    log("warn", `direct API (${path}) failed`, { error: String(e?.message || e).slice(0, 200) });
                }
            }
        }
    } catch (e) {
        log("warn", "direct API failed", { error: String(e?.message || e).slice(0, 300) });
    }
    return null;
}
function getRole(node) {
    const d = node.getAttribute?.("data-message-author-role");
    if (d === "assistant" || d === "user" || d === "system") return d;
    const tid = node.getAttribute?.("data-testid") || "";
    if (/assistant/i.test(tid)) return "assistant";
    if (/user|human/i.test(tid)) return "user";
    if (node.querySelector?.("button[aria-label*='Copy'], button[aria-label*='Read aloud']")) return "assistant";
    return null;
}

function textOf(node) {
    const md = node.querySelector?.(".markdown, [data-testid='markdown']");
    return ((md || node).innerText || node.textContent || "").trim();
}

// App-shell fallback: keep LEAF blocks (no qualifying child), not outermost.
// Old code kept the whole <main> as 1 block. Role via toolbar markers.
function fallbackBlocks() {
    const main = document.querySelector("main") || document.body;
    const cands = [];
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_ELEMENT, {
        acceptNode(el) {
            if (!(el instanceof HTMLElement)) return NodeFilter.FILTER_SKIP;
            if (/^(SCRIPT|STYLE|NAV|HEADER|FOOTER|BUTTON|TEXTAREA)$/.test(el.tagName)) return NodeFilter.FILTER_SKIP;
            return NodeFilter.FILTER_ACCEPT;
        }
    });
    while (walker.nextNode()) {
        const el = walker.currentNode;
        const t = (el.innerText || "").trim();
        if (t.length < 120 || t.length > 50000) continue;
        // skip thread root / shell containers — we want turns
        if (el === main || el.hasAttribute?.("data-app-shell-thread-content-overlap")) continue;
        cands.push({ el, len: t.length, text: t });
        if (cands.length > 1200) break;
    }
    // keep only leaves: drop any candidate that CONTAINS another candidate
    const leaves = cands.filter(a =>
        !cands.some(b => b !== a && a.el.contains(b.el) && b.text.length > 80)
    );
    // dedupe identical text, document order
    const seen = new Set();
    const ordered = [];
    // document order sort
    leaves.sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
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

function roleOfFallback(el) {
    try {
        const html = (el.innerHTML || "").slice(0, 4000);
        if (/chatgpt-citation|data-testid=|Copy|Read aloud|Good response|Bad response/i.test(html)
            && el.querySelector?.("button")) return "assistant";
    } catch { /* ignore */ }
    return null; // caller alternates
}

class ChatGPTSourceAdapter extends SourceAdapter {
    constructor() { super("ChatGPT"); }

    async extractSession() {
        log("info", "extract start", { url: location.href, title: document.title });

        // 1) Prefer API (bridge / direct fetch) — immune to app-shell DOM changes.
        //    Some endpoints paginate, so the DOM pass below may still be fuller.
        let apiMessages = null;
        try {
            apiMessages = await tryBridge();
            if (apiMessages?.length) log("info", `API/bridge yielded ${apiMessages.length} messages`, {});
        } catch (e) {
            log("warn", "bridge path failed, falling back to DOM", { error: String(e?.message || e).slice(0, 300) });
        }

        // 2) Lazy history: walk the thread to the top so ALL turns render in the
        //    DOM (ChatGPT mounts only the last visible messages on load).
        try {
            const fh = await loadAllHistory();
            log("info", "full-history walk", {
                ok: fh.ok, skipped: !!fh.skipped, reason: fh.reason,
                steps: fh.steps, count: fh.count
            });
        } catch (e) {
            log("warn", "full-history walk failed", { error: String(e?.message || e).slice(0, 200) });
        }

        await new Promise(r => setTimeout(r, 400));

        const selectors = [
            "[data-message-author-role]",
            '[data-testid^="conversation-turn-"]',
            "[data-message-id]",
            "main article",
            "main [data-turn]",
            'main div[id^="message-"]'
        ];
        const seen = new Set();
        const messages = [];
        for (const sel of selectors) {
            let nodes = [];
            try { nodes = Array.from(document.querySelectorAll(sel)); }
            catch (e) { log("warn", `bad selector ${sel}`, {}); continue; }
            log("info", `selector ${sel}: ${nodes.length}`, {});
            for (const node of nodes) {
                if (seen.has(node)) continue;
                seen.add(node);
                const t = textOf(node);
                if (!t || t.length < 2) continue;
                if (messages.length && messages[messages.length - 1].raw?.text === t) continue;
                const r = getRole(node) || "user";
                messages.push({
                    id: `chatgpt-${messages.length + 1}`,
                    role: r === "assistant" ? "assistant" : r === "system" ? "system" : "user",
                    sourceRole: String(r),
                    content: t,
                    parentId: messages.length ? messages[messages.length - 1].id : null,
                    timestamp: null, model: null,
                    raw: { text: t }
                });
            }
            if (messages.length >= 2) break;
        }

        // Fallback path
        let usedFallback = false;
        if (messages.length < 1) {
            const fp = fingerprintMain();
            log("warn", "structured selectors empty, fingerprint:", fp);
            const blocks = fallbackBlocks();
            log("info", `fallback blocks: ${blocks.length}`, {
                lens: blocks.map(b => b.len).slice(0, 12)
            });
            // filter obvious UI chrome (keep el for role signal)
            const cleaned = blocks.filter(b =>
                b.text.length > 120 &&
                !/^Ask ChatGPT/i.test(b.text) &&
                !/^Share$/i.test(b.text)
            );
            // alternate user/assistant starting with user (ChatGPT always starts with user),
            // but prefer toolbar signal when available
            cleaned.forEach((b, i) => {
                const t = typeof b === "string" ? b : b.text;
                const el = typeof b === "string" ? null : b.el;
                const signaled = el ? roleOfFallback(el) : null;
                const role = signaled || (i % 2 === 0 ? "user" : "assistant");
                messages.push({
                    id: `chatgpt-fb-${messages.length + 1}`,
                    role,
                    sourceRole: signaled ? `fallback-toolbar:${signaled}` : "fallback-alternating",
                    content: t.slice(0, 20000),
                    parentId: messages.length ? messages[messages.length - 1].id : null,
                    timestamp: null, model: null,
                    raw: { text: t.slice(0, 20000), strategy: "fallback-leaf" }
                });
            });
            usedFallback = cleaned.length > 0;
            if (usedFallback) log("info", `fallback produced ${messages.length} messages`, {});
        }

        // Shared reader fallback: the app-shell DOM can rename every message
        // attribute and hide text from innerText, leaving the selector and
        // leaf-block passes with nothing. The reader the HUD uses measures text
        // with a DOM walk, walks to the real thread container even when <main>
        // is just the shell, and deep-scans the page as a last resort.
        let readerReason = "";
        if (!messages.length) {
            try {
                const thread = chatThread.extractChatThread("chatgpt");
                readerReason = `${thread.source}/${thread.reason}`;
                if (thread.messages?.length) {
                    log("info", `shared reader yielded ${thread.messages.length} messages`, {
                        source: thread.source, reason: thread.reason
                    });
                    for (const m of thread.messages) {
                        const t = String(m.content || "").trim();
                        if (!t) continue;
                        const role = m.role === "assistant" || m.role === "system" ? m.role : "user";
                        messages.push({
                            id: `chatgpt-thread-${messages.length + 1}`,
                            role,
                            sourceRole: `thread-reader:${thread.source}`,
                            content: t.slice(0, 20000),
                            parentId: messages.length ? messages[messages.length - 1].id : null,
                            timestamp: null, model: null,
                            raw: { text: t.slice(0, 20000), strategy: `thread-reader:${thread.source}`, threadReason: thread.reason }
                        });
                    }
                    try {
                        window.IKO?.logger?.warn?.("ChatGPT-extract", "Extracted via shared thread reader — verify roles in preview", {
                            source: thread.source, reason: thread.reason
                        });
                    } catch { /* ignore */ }
                }
            } catch (e) {
                log("warn", "shared reader failed", { error: String(e?.message || e).slice(0, 200) });
            }
        }

        if (!messages.length) {
            let diag = {};
            try { diag = globalThis.window?.IKO?.logger?.diagnostics?.() || {}; } catch { /* ignore */ }
            const fp = fingerprintMain();
            log("error", "extract failed", { diag, fp: { ...fp, mainHtmlSample: String(fp.mainHtmlSample || "").slice(0, 800) } });
            throw new AdapterError(
                "No visible ChatGPT messages were found. I logged a DOM fingerprint — open 'View logs' → 'Copy logs' and paste it so I can add your exact markup.\n\n" +
                `finger: main=${fp.hasMain} nodes=${fp.totalNodes ?? "?"} textLen=${fp.mainTextLen ?? "?"} bodyLen=${fp.bodyTextLen ?? "?"} data=[${(fp.dataAttrs || []).join(",")}]` +
                (readerReason ? `\nreader: ${readerReason}` : "")
            );
        }

        if (usedFallback) {
            try { window.IKO?.logger?.warn?.("ChatGPT-extract", "Used fallback alternating roles — verify user/assistant order in preview", {}); } catch { /* ignore */ }
        }

        // API data carries real ids/roles but can be paginated/partial; the DOM
        // after the full-history walk holds everything that rendered. Use
        // whichever captured more messages, preferring the API on a tie.
        const preferApi = !!apiMessages?.length && apiMessages.length >= messages.length;
        if (preferApi) {
            log("info", `using API data (${apiMessages.length} messages)`, {});
            return {
                platform: "chatgpt",
                conversationId: conversationId() || `chatgpt-${Date.now()}`,
                title: document.title || "ChatGPT Conversation",
                model: null, createdAt: null, updatedAt: null,
                extractorVersion: "iko-chatgpt-api-1",
                messages: apiMessages.map((m, i) => ({ ...m, parentId: i ? apiMessages[i - 1].id : null })),
                activeLeafId: apiMessages[apiMessages.length - 1].id,
                instructions: []
            };
        }
        if (apiMessages?.length) {
            log("info", `DOM has more messages than API (${messages.length} > ${apiMessages.length}) — using DOM`, {});
        }

        return {
            platform: "chatgpt",
            conversationId: conversationId() || `chatgpt-${Date.now()}`,
            title: document.title || "ChatGPT Conversation",
            model: null, createdAt: null, updatedAt: null,
            extractorVersion: "iko-chatgpt-dom-4-fullhistory",
            messages,
            activeLeafId: messages[messages.length - 1].id,
            instructions: []
        };
    }
}

module.exports = { ChatGPTSourceAdapter };
