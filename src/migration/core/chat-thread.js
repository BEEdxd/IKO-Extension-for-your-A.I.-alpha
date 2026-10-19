"use strict";

// Reads the visible chat thread so the Context HUD can count the tokens that
// are really in the current conversation.
//
// Why it lives here: the per-platform DOM knowledge is already maintained in
// platforms.js for migration, while the HUD kept a second, ChatGPT-only copy of
// it. Sites that migration learned to read (Gemini, Perplexity, DeepSeek, …)
// were therefore never counted by the HUD — it fell through to a text-block
// heuristic that dropped every short user message. One list, one reader.
const { PLATFORMS, matchPlatform } = require("../platforms.js");

// The conventions the migration adapters rely on, in their historical order:
// platform-specific selectors first, then the universal ones.
const UNIVERSAL_SELECTORS = [
    // ChatGPT's 2026 app shell: one wrapper per message, role in the suffix
    // ("…:user" / "…:assistant"). The old data-message-author-role /
    // conversation-turn attributes are gone on these pages.
    "[data-chatgpt-search-unit-key]",
    "[data-message-author-role]",
    '[data-testid^="conversation-turn-"]',
    "[data-message-id]",
    "[data-turn]",
    "main article",
    "main [data-turn]",
    'main div[id^="message-"]'
];

const NOISE_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
const CHROME_TAGS = new Set(["NAV", "ASIDE", "HEADER", "FOOTER"]);
const MIN_MESSAGE_CHARS = 2;
// Repeated short lines ("continue", "thanks") are real messages; identical long
// texts are the same node matched by two selectors.
const LONG_TEXT_DUP_CHARS = 40;
const BLOCK_MIN_CHARS = 120;
const MAX_CHILDREN = 200;
const MAX_DESCENT = 15;
const MAX_WALK_NODES = 40000;
const DOCUMENT_POSITION_FOLLOWING = 4;
const DOMINANT_CHILD_RATIO = 0.7;
// A selector list can be right for one role and wrong for the other: some
// sites render only the answers with markup we know. Below this many matched
// characters the reading is small enough that being wrong is likely, so it is
// worth measuring the whole thread to compare.
const PARTIAL_PRECHECK_CHARS = 1500;
const PARTIAL_READ_RATIO = 0.25;
const THREAD_MIN_CHARS = 400;


function selectorsFor(platformId) {
    const out = [];
    const push = (selector) => {
        if (selector && !out.includes(selector)) out.push(selector);
    };
    const platform = PLATFORMS?.[platformId];
    for (const selector of platform?.selectors || []) push(selector);
    for (const selector of UNIVERSAL_SELECTORS) push(selector);
    return out;
}

// Sidebars and hidden panels are chrome, not conversation: ChatGPT's app shell
// can keep the whole chat history mounted outside <main> (and off-screen), and
// the text walk would otherwise count it as context.
function isChrome(el) {
    if (!el || !el.tagName) return false;
    if (CHROME_TAGS.has(el.tagName)) return true;
    try {
        if (el.hidden) return true;
        if (el.getAttribute?.("hidden") !== null) return true;
        if (/(^|\s)sr-only(\s|$)/.test(el.getAttribute?.("class") || "")) return true;
        if (el.getAttribute?.("aria-hidden") === "true") return true;
        const role = el.getAttribute?.("role") || "";
        if (role === "navigation" || role === "complementary" || role === "banner" || role === "contentinfo") return true;
        const label = el.getAttribute?.("aria-label") || "";
        if (/chat history|sidebar|conversation history/i.test(label)) return true;
    } catch { /* ignore */ }
    return false;
}

// innerText reflects what is actually rendered, but Chrome returns "" for
// subtrees it has not laid out yet — content-visibility skips, turns that are
// still streaming in, virtualised history, hidden ancestors. That silently
// drops messages, so fall back to a DOM walk that skips script/style noise.
// skipChrome is for whole-page estimates, where the sidebar is not context.
function readText(el, { skipChrome = false } = {}) {
    // Reading a <script>/<style> element is never conversation text, even when
    // a caller hands one in directly.
    if (!el || NOISE_TAGS.has(el.tagName)) return "";
    if (skipChrome && isChrome(el)) return "";
    if (!skipChrome) {
        const rendered = (el.innerText || "").trim();
        if (rendered) return rendered;
    }
    let out = "";
    const walk = (node) => {
        // Pierce shadow DOM at this level: message text can live in a shadow root.
        if (node.shadowRoot) walk(node.shadowRoot);
        for (const child of node.childNodes || []) {
            if (child.nodeType === 3) {
                out += String(child.nodeValue || "") + " ";
                continue;
            }
            if (child.nodeType !== 1 || NOISE_TAGS.has(child.tagName)) continue;
            if (isChrome(child)) continue;
            walk(child);
        }
    };
    walk(el);
    return out.replace(/\s+/g, " ").trim();
}

// Prefer the markdown body: message wrappers usually also hold buttons and
// labels ("Copy", "Edit", the model name) that are not conversation context.
function textOf(el) {
    let body = el;
    try {
        body = el.querySelector(".markdown, [data-testid='markdown']") || el;
    } catch { /* ignore */ }
    const content = readText(body);
    // Some wrappers carry an empty markdown body (user turns, streaming
    // placeholders, lazily filled turns). Reading only that subtree would drop
    // the message — the wrapper's own text is still better than nothing.
    if (content || body === el) return content;
    return readText(el);
}

function stripRoleLabel(content) {
    // The 2026 ChatGPT assistant wrapper keeps the sr-only "ChatGPT said:"
    // label inside the same node as the answer. It is a label, not context.
    return String(content || "").replace(/^\s*(?:you|user|chatgpt|assistant|model)\s+said:\s*/i, "").trim();
}

// An SPA can keep the previous chat mounted while the next one renders
// (ChatGPT's 2026 shell leaves the old workspace in a display:none div).
// querySelectorAll still sees those hidden messages; counting them is what
// made the HUD jump to the previous chat's number after switching tabs.
function isVisibleNode(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
        for (let node = el; node && node.nodeType === 1; node = node.parentElement || node.parent) {
            if (node.hidden) return false;
            if (node.getAttribute?.("hidden") !== null) return false;
            if (node.getAttribute?.("inert") !== null) return false;
            if (node.getAttribute?.("aria-hidden") === "true") return false;
            if (typeof getComputedStyle === "function") {
                const style = getComputedStyle(node);
                if (style.display === "none" || style.visibility === "hidden" ||
                    style.visibility === "collapse" || style.contentVisibility === "hidden") return false;
            }
        }
        if (typeof el.getBoundingClientRect === "function") {
            const rect = el.getBoundingClientRect();
            if (!rect || (rect.width === 0 && rect.height === 0)) return false;
        }
        return true;
    } catch { return true; }
}

function roleOf(el) {
    let attr = "";
    try {
        attr = el.getAttribute("data-message-author-role") || "";
        if (!attr) {
            attr = el.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role") || "";
        }
    } catch { /* ignore */ }
    if (attr === "assistant" || attr === "system" || attr === "user") return attr;

    let turn = "";
    try {
        turn = el.getAttribute?.("data-turn") || el.querySelector?.("[data-turn]")?.getAttribute("data-turn") || "";
    } catch { /* ignore */ }
    if (turn === "assistant" || turn === "system" || turn === "user") return turn;

    // ChatGPT 2026: each message wrapper carries its role in the unit key
    // ("fallback-turn-0:1:assistant"), and the visible role label is an
    // sr-only <h4 data-conversation-role="assistant">ChatGPT said:</h4>.
    let unit = "";
    try {
        unit = el.getAttribute?.("data-chatgpt-search-unit-key") ||
            el.getAttribute?.("data-content-search-unit-key") ||
            el.querySelector?.("[data-chatgpt-search-unit-key]")?.getAttribute("data-chatgpt-search-unit-key") || "";
    } catch { /* ignore */ }
    if (/:assistant$/.test(unit)) return "assistant";
    if (/:user$/.test(unit)) return "user";

    let conversationRole = "";
    try {
        conversationRole = el.getAttribute?.("data-conversation-role") ||
            el.querySelector?.("[data-conversation-role]")?.getAttribute("data-conversation-role") || "";
    } catch { /* ignore */ }
    if (conversationRole === "assistant" || conversationRole === "system" || conversationRole === "user") return conversationRole;

    const label = (el.querySelector?.(".sr-only")?.textContent || "").trim().toLowerCase();
    if (/^(chatgpt|assistant|model) said:/.test(label)) return "assistant";
    if (/^(you|user) said:/.test(label)) return "user";

    const tag = [
        el.getAttribute?.("data-testid") || "",
        el.getAttribute?.("class") || "",
        el.tagName || ""
    ].join(" ");
    if (/assistant|model-response|bot[-_]?message|ai-message/i.test(tag)) return "assistant";
    if (/user-query|user-message|human|query-content/i.test(tag)) return "user";
    return "";
}

function collect(selectors) {
    const seen = new Set();
    const nodes = [];
    for (const selector of selectors) {
        let found = [];
        try {
            found = Array.from(document.querySelectorAll(selector));
        } catch { /* unknown selector on this Chrome */ continue; }
        for (const node of found) {
            if (seen.has(node)) continue;
            seen.add(node);
            nodes.push(node);
        }
    }
    return nodes;
}

// Keep the innermost match of each nesting. The 2025-26 ChatGPT DOM matches the
// turn wrapper *and* the message body inside it, which counted every message
// twice (double tokens, double message count) before this filter existed.
function innermost(nodes) {
    return nodes.filter((node) => !nodes.some((other) => other !== node && node.contains(other)));
}

function byDocumentOrder(a, b) {
    if (a === b) return 0;
    if (typeof a.compareDocumentPosition !== "function") return 0;
    return a.compareDocumentPosition(b) & DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

function fromSelectors(platformId) {
    const nodes = innermost(collect(selectorsFor(platformId)).filter(isVisibleNode)).sort(byDocumentOrder);
    const messages = [];
    const matchedNodes = [];
    const seenText = new Set();
    for (const node of nodes) {
        const content = stripRoleLabel(textOf(node));
        if (!content || content.length < MIN_MESSAGE_CHARS) continue;
        if (content.length >= LONG_TEXT_DUP_CHARS && seenText.has(content)) continue;
        seenText.add(content);
        if (messages.length && messages[messages.length - 1].content === content) continue;
        messages.push({
            role: roleOf(node) || (messages.length % 2 === 0 ? "user" : "assistant"),
            content
        });
        matchedNodes.push(node);
    }
    return { messages, nodes: matchedNodes };
}

function parentOf(node) {
    return node?.parentElement || node?.parent || null;
}

// Lowest common ancestor of the matched message nodes: the conversation
// region, not the page shell. Used for the partial-markup comparison so the
// sidebar/history can never stand in for a short chat.
function commonAncestor(nodes) {
    if (!nodes.length) return null;
    let holder = parentOf(nodes[0]);
    for (let i = 1; i < nodes.length && holder; i++) {
        while (holder && !(holder.contains && holder.contains(nodes[i]))) holder = parentOf(holder);
    }
    return holder;
}

function matchHolder(nodes, fallback) {
    if (!nodes.length) return fallback;
    const holder = commonAncestor(nodes);
    if (!holder) return fallback;
    try {
        // Never compare against the whole page: a body-level holder includes
        // the sidebar/history and would replace the conversation with it.
        if (fallback === document.body || fallback === document.documentElement) return holder;
    } catch { /* ignore */ }
    const holdsMatches = nodes.every((node) => {
        try { return Boolean(fallback?.contains?.(node)); } catch { return false; }
    });
    // A thread container that holds the matched messages is authoritative even
    // when only some turns matched (partial markup). If it does not hold them,
    // it is the sidebar/app shell — use the messages' common ancestor instead.
    return holdsMatches ? fallback : holder;
}

// Fallback for sites whose message markup we do not know: walk down from <main>
// while one child still holds (almost) all of the text — the level where the
// text splits between children is the thread container. Counting that whole
// container once keeps the total honest, where the old block-picking heuristic
// dropped every message under 120 characters (i.e. most user turns).
//
// Two traps this avoids:
//   - the walk must measure text the same way the count does (no <script> JSON
//     blobs, no <style>, no <nav>), otherwise an inline state blob looks like
//     "the big one" and the container becomes a script element → 0 tokens;
//   - it stops as soon as a level already splits into message-sized blocks, so
//     a chat whose last answer dominates the text does not get walked into a
//     single paragraph and then rejected as "too small".
//
// The walk also remembers the best (deepest, most-text) container seen along
// the way. If descent ends in a short element (short messages, UI chrome), we
// backtrack to that best container instead of returning 0.
function threadContainer() {
    let el = document.querySelector("main") || document.querySelector("[role='main']") || document.querySelector("body");
    if (!el) return { el: null, descended: false, chars: 0 };
    let descended = false;
    let bestEl = el;
    let bestChars = textLength(el);
    for (let step = 0; step < MAX_DESCENT; step++) {
        if (looksLikeList(el)) {
            const chars = textLength(el);
            if (chars >= BLOCK_MIN_CHARS) { bestEl = el; bestChars = chars; descended = true; }
            return { el: bestEl, descended, chars: bestChars };
        }
        const total = textLength(el);
        if (!total) break;
        let bestChild = null;
        let bestLen = 0;
        let examined = 0;
        for (const child of el.children || []) {
            if (examined++ > MAX_CHILDREN) break;
            if (!child.tagName || NOISE_TAGS.has(child.tagName) || isChrome(child)) continue;
            const len = textLength(child);
            if (len > bestLen) { bestLen = len; bestChild = child; }
        }
        if (!bestChild || bestLen < total * DOMINANT_CHILD_RATIO) break;
        if (total >= BLOCK_MIN_CHARS) { bestEl = el; bestChars = total; }
        el = bestChild;
        descended = true;
    }
    // If we ended up in a short element, backtrack to the best container seen.
    return bestChars >= BLOCK_MIN_CHARS ? { el: bestEl, descended, chars: bestChars } : { el, descended: false, chars: textLength(el) };
}

// True when this element already splits into two message-sized blocks.
function looksLikeList(el) {
    let count = 0;
    const elementChildren = (node) => {
        const out = [];
        for (const child of node.children || []) out.push(child);
        if (node.shadowRoot) for (const child of node.shadowRoot.children || []) out.push(child);
        return out;
    };
    for (const child of elementChildren(el)) {
        if (!child.tagName || NOISE_TAGS.has(child.tagName) || isChrome(child)) continue;
        if (textLength(child) >= BLOCK_MIN_CHARS) {
            count++;
            if (count >= 2) return true;
        }
    }
    return false;
}

// "Is this a conversation or a welcome screen?" — count the substantial text
// blocks the container splits into, whatever tags the site happens to use
// (a markup whitelist made this return 0 on renamed DOMs).
function blockCount(el) {
    let count = 0;
    const elementChildren = (node) => {
        const out = [];
        for (const child of node.children || []) out.push(child);
        if (node.shadowRoot) for (const child of node.shadowRoot.children || []) out.push(child);
        return out;
    };
    const walk = (node, depth) => {
        if (count >= 2 || depth > 3) return;
        for (const child of elementChildren(node)) {
            if (!child.tagName || NOISE_TAGS.has(child.tagName) || isChrome(child)) continue;
            if (textLength(child) >= BLOCK_MIN_CHARS) {
                count++;
                if (count >= 2) return;
                continue;
            }
            walk(child, depth + 1);
        }
    };
    walk(el, 0);
    return count;
}

// Cheap length of the same text readText would return (no big string built).
function textLength(el) {
    if (!el || NOISE_TAGS.has(el.tagName) || isChrome(el)) return 0;
    let length = 0;
    let nodes = 0;
    const walk = (node) => {
        if (node.shadowRoot) walk(node.shadowRoot);
        for (const child of node.childNodes || []) {
            if (nodes++ > MAX_WALK_NODES) return;
            if (child.nodeType === 3) {
                length += String(child.nodeValue || "").length + 1;
                continue;
            }
            if (child.nodeType !== 1 || NOISE_TAGS.has(child.tagName) || isChrome(child)) continue;
            walk(child);
        }
    };
    walk(el);
    return length;
}

// -> { messages, reason } — reason is surfaced in the logs so a site we cannot
// read yet can be diagnosed from "View logs → Copy logs".
function fromThread(container) {
    const found = container || threadContainer();
    const el = found?.el;
    if (!el) return { messages: [], reason: "no-container" };

    // Read with chrome skipped first (sidebar etc. is not context). If that
    // yields nothing — e.g. content-visibility hid innerText — try the raw DOM
    // walk which includes everything except script/style noise.
    let content = readText(el, { skipChrome: true });
    if (!content) content = readText(el);
    if (content.length < BLOCK_MIN_CHARS) return { messages: [], reason: `thread-too-small(${content.length})` };

    // Reaching here without descending means <main> itself is the container:
    // trust it only when it splits into message-sized blocks, so a welcome
    // screen (one hero block) still reads as "waiting", not as usage.
    if (!found.descended && blockCount(el) < 2) return { messages: [], reason: `welcome-screen(${blockCount(el)} blocks)` };

    return { messages: [{ role: "user", content, fallback: true, thread: true }], reason: "thread-estimate" };
}

// ChatGPT's new-chat screen ("Hey, omen. Ready to dive in?") is not a
// conversation: the URL has no conversation id and the DOM has no message
// markup. The app shell around it can still hold text (sidebar history, hidden
// panels), so the estimate/deep-scan reports phantom tokens on an empty chat.
// Only a real conversation URL may be estimated when no markup matched.
function isChatGPTNewChat(platformId) {
    if (platformId !== "chatgpt") return false;
    try {
        if (typeof location === "undefined" || !location.pathname) return false;
        // Real conversations live under /c/<uuid> (legacy /c/<id> included).
        return !/\/c\/[0-9A-Za-z_-]{8,}/.test(location.pathname);
    } catch { return false; }
}

function hasMessageMarkup() {
    try {
        const nodes = document.querySelectorAll(
            '[data-message-author-role], [data-testid^="conversation-turn-"], [data-turn], [data-chatgpt-search-unit-key]'
        );
        for (const node of nodes) {
            if (isVisibleNode(node) && textLength(node) > MIN_MESSAGE_CHARS) return true;
        }
        return false;
    } catch { return false; }
}

// -> { messages: [{ role, content }], source: "selectors" | "thread" | "none", reason }
function extractChatThread(platformId) {
    let messages = [];
    let matchedNodes = [];
    try {
        const found = fromSelectors(platformId);
        messages = found.messages;
        matchedNodes = found.nodes || [];
    } catch { /* fall through to the thread estimate */ }

    const matchedChars = messages.reduce((total, message) => total + message.content.length, 0);
    let container = null;
    if (!messages.length || matchedChars < PARTIAL_PRECHECK_CHARS) {
        try {
            container = threadContainer();
        } catch { container = null; }
    }

    // Known markup can cover only half the conversation (answers but not
    // questions, or a renamed turn). A confident tiny number is worse than an
    // honest thread-wide estimate, so compare against the whole thread — but
    // only against a container that actually holds the matched messages. On
    // ChatGPT's 2026 app shell the thread and the sidebar are siblings, so
    // threadContainer() can be the sidebar; using it here replaced a
    // two-message "hello" chat with ~1,000 sidebar tokens.
    if (messages.length && container?.el) {
        const holder = matchHolder(matchedNodes, container.el);
        const holdsMatches = matchedNodes.length > 0 &&
            matchedNodes.every((node) => {
                try { return Boolean(holder?.contains?.(node)); } catch { return false; }
            });
        const threadChars = textLength(holder);
        if (holdsMatches && threadChars > THREAD_MIN_CHARS && matchedChars < threadChars * PARTIAL_READ_RATIO) {
            const estimate = fromThread({ el: holder, descended: true });
            if (estimate.messages.length) return { messages: estimate.messages, source: "thread", reason: `partial-markup → ${estimate.reason}` };
        }
    }
    if (messages.length) return { messages, source: "selectors", reason: "selector-match" };

    // A new ChatGPT chat has no conversation to count. This must come before
    // the estimate/deep-scan: those fallbacks can read the welcome screen or
    // the app shell and report 75–1,000 phantom tokens on an empty chat. If
    // message markup exists (e.g. a temporary chat at "/"), the guard stays off
    // and the estimate still works.
    if (isChatGPTNewChat(platformId) && !hasMessageMarkup()) {
        return { messages: [], source: "none", reason: "new-chat" };
    }

    // No selector matched anything — this is either a brand-new/empty chat or a
    // site whose markup we don't know. The thread container may be a small app
    // shell whose real conversation lives outside <main> (e.g. ChatGPT's 2026
    // app shell moves the thread to a sibling or a portal). When the container
    // is too small but the page holds far more text elsewhere, deep-scan the
    // whole page instead of giving up. A welcome screen (short hero text, all
    // inside <main>) is rejected: it has no ≥2 message-sized blocks.
    let estimate = null;
    if (container?.el) {
        const threadChars = container.chars || textLength(container.el);
        const bodyText = textLength(document.body || document.documentElement);

        // App shell: small <main>, conversation lives outside it (body has far
        // more text). Skip the thread estimate and deep-scan the page.
        if (threadChars < THREAD_MIN_CHARS && bodyText > threadChars * 3 && bodyText >= THREAD_MIN_CHARS) {
            // fall through to deepScan below
        } else {
            estimate = fromThread(container);
            if (estimate.messages.length) {
                // When no selectors matched at all and the container is small,
                // require ≥2 message-sized blocks so a single hero block doesn't
                // pass as a conversation. Large containers (≥ THREAD_MIN_CHARS)
                // are trusted as-is (a real single-message thread).
                if (threadChars >= THREAD_MIN_CHARS || blockCount(container.el) >= 2) {
                    return { messages: estimate.messages, source: "thread", reason: estimate.reason };
                }
                return { messages: [], source: "none", reason: `thread-too-small(${threadChars})` };
            }
            return { messages: [], source: "none", reason: estimate?.reason || `thread-too-small(${threadChars})` };
        }
    }

    // Last resort: deep-scan the page for the largest text block that looks
    // like a conversation container (covers sites whose DOM we know nothing
    // about and whose <main> doesn't line up with the conversation).
    const deep = deepScanContainer();
    if (deep) {
        const content = readText(deep.el, { skipChrome: true }) || readText(deep.el);
        if (content.length >= BLOCK_MIN_CHARS) {
            return { messages: [{ role: "user", content, fallback: true, thread: true }], source: "thread", reason: `deep-scan(${deep.reason})` };
        }
    }

    return { messages: [], source: "none", reason: estimate?.reason || "no-container" };
}

// --- deep scan fallback -------------------------------------------------------
// When nothing else works, scan the page for the element with the most text
// that is not chrome (nav/aside/header/footer/script/style). This is slow, so
// it only runs when both the selector path and the thread estimate have failed.
// Depth and thresholds are generous: real ChatGPT DOMs can nest the conversation
// deep, and individual message bubbles can be small even when the thread is long.
function deepScanContainer() {
    const root = document.body || document.documentElement;
    if (!root) return null;
    let best = null;
    let bestScore = 0;
    const elementChildren = (node) => {
        const out = [];
        for (const child of node.children || []) out.push(child);
        if (node.shadowRoot) for (const child of node.shadowRoot.children || []) out.push(child);
        return out;
    };
    const walk = (node, depth) => {
        if (depth > 10) return;
        for (const child of elementChildren(node)) {
            if (!child.tagName || NOISE_TAGS.has(child.tagName) || isChrome(child)) continue;
            const len = textLength(child);
            if (len >= 50) {
                const score = len;
                if (score > bestScore) {
                    bestScore = score;
                    best = { el: child, reason: `chars=${len}` };
                }
                walk(child, depth + 1);
            } else {
                walk(child, depth + 1);
            }
        }
    };
    walk(root, 0);
    return best;
}

// --- whole-conversation reader (bridge payloads) -----------------------------
// A chat page keeps the *mounted* history in the DOM, but the API payload the
// page itself fetched holds the whole conversation. The ChatGPT bridge captures
// that payload, and its mapping includes turns the DOM no longer mounts — the
// difference between "what happens to be on screen" and "what is really in my
// context", which is what the HUD has to warn about.
//
// Mirrors the parsing the migration adapter relies on. Output is the minimal
// { role, content } shape the HUD counts; the adapter keeps its richer shape
// (ids, timestamps, parents) because migration needs to re-create the thread.
function partsToText(content) {
    try {
        if (!content) return "";
        if (typeof content === "string") return content;
        if (Array.isArray(content.parts)) {
            return content.parts.map((part) => {
                if (typeof part === "string") return part;
                if (part?.text) return part.text;
                try { return JSON.stringify(part); } catch { return ""; }
            }).join("\n").trim();
        }
        if (typeof content.text === "string") return content.text;
        return "";
    } catch { return ""; }
}

function messageFrom(raw) {
    const message = raw?.message || raw;
    const role = message?.author?.role || message?.role || message?.sender || "";
    if (role !== "user" && role !== "assistant" && role !== "system") return null;
    const content = partsToText(message?.content).trim();
    if (content.length < MIN_MESSAGE_CHARS) return null;
    return { role, content };
}

// -> [{ role, content }] | null (null = this payload holds no conversation)
function extractConversationMessages(data) {
    try {
        if (!data || typeof data !== "object") return null;
        const root = data.mapping ? data : data.conversation || data.data || null;

        // Shape 1: full conversation with mapping — follow current_node -> parent
        // so the result is the thread as it is now, not every branch ever made.
        const mapping = root?.mapping;
        if (mapping && typeof mapping === "object") {
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
                for (const node of Object.values(mapping)) chain.push(node);
            }
            const messages = [];
            for (const node of chain) {
                const message = messageFrom(node);
                if (message) messages.push(message);
            }
            if (messages.length) return messages;
        }

        // Shape 2: a plain list of messages/turns.
        for (const key of ["messages", "turns", "conversation_messages", "items"]) {
            const list = data[key] || root?.[key];
            if (!Array.isArray(list) || !list.length) continue;
            const messages = [];
            for (const raw of list) {
                const message = messageFrom(raw);
                if (message) messages.push(message);
            }
            if (messages.length) return messages;
        }
        return null;
    } catch { return null; }
}

// --- diagnostics -------------------------------------------------------------
// Compact, paste-ready fingerprint of what a page offers when the reader cannot
// read it. Logged once per conversation (not every poll) and kept small enough
// for "View logs → Copy logs".
function describe(node) {
    if (!node) return "none";
    const id = node.id ? `#${String(node.id).slice(0, 24)}` : "";
    const cls = String(node.getAttribute?.("class") || "").split(/\s+/).filter(Boolean).slice(0, 3).join(".");
    const text = String(node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
    return `<${String(node.tagName || "?").toLowerCase()}${id}${cls ? `.${cls}` : ""}> "${text}"`;
}

function debugReading(platformId) {
    const selectors = {};
    const matched = [];
    for (const selector of selectorsFor(platformId)) {
        let nodes = null;
        try { nodes = Array.from(document.querySelectorAll(selector)); } catch { nodes = null; }
        selectors[selector] = nodes === null ? "invalid" : nodes.length;
        if (nodes) for (const node of nodes) matched.push(node);
    }
    const filtered = innermost(Array.from(new Set(matched)));
    const found = threadContainer();
    return {
        selectors,
        matched: matched.length,
        innermost: filtered.length,
        samples: filtered.slice(0, 3).map(describe),
        container: describe(found.el),
        containerChars: textLength(found.el),
        containerBlocks: blockCount(found.el),
        descended: found.descended
    };
}

module.exports = { extractChatThread, extractConversationMessages, debugReading, selectorsFor, readText, textLength, textOf, matchPlatform };
