"use strict";

import { countTokens } from "gpt-tokenizer";
import chatThread from "../migration/core/chat-thread.js";
import "./ui.js";
import "./chatgpt-bridge-client.js";
import "./attachments/attachment-saver.js";

window.IKO = window.IKO || {};
// Shared thread reader (also reusable by migration code and test harnesses).
window.IKO.chatThread = chatThread;

let timer = null;
let counting = false;
let lastSignature = "";
let lastDraftSignature = "";
let lastDraftText = "";

// One message can be huge (a pasted document). The tokenizer runs at ~35M
// chars/s, so this is only a guard against pathological pages.
const MAX_MESSAGE_CHARS = 400000;

// Debounce for composer typing so we don't re-tokenise on every keystroke,
// but still reflect the draft within ~200 ms of the user stopping.
let draftTimer = null;
const DRAFT_DEBOUNCE_MS = 200;

function resetCounting() {
    counting = false;
}
window.IKO.resetCounting = resetCounting;

// Label fallback for hosts the platform registry does not know. Budgets and
// prices always come from platforms.js — never from a second table here.
function detectPlatform() {
    try {
        const d = window.IKO?.platform?.detect?.();
        if (d && d !== "Unknown" && d !== "AI") return d;
    } catch { /* ignore */ }
    const h = location.hostname.toLowerCase();
    if (h.includes("gemini")) return "Gemini";
    if (h.includes("perplexity")) return "Perplexity";
    if (h.includes("copilot")) return "Copilot";
    if (h.includes("grok")) return "Grok";
    if (h.includes("deepseek")) return "DeepSeek";
    if (h.includes("mistral")) return "Mistral";
    if (h.includes("poe")) return "Poe";
    if (h.includes("claude")) return "Claude";
    if (h.includes("chatgpt") || h.includes("openai")) return "ChatGPT";
    return "AI";
}

function platformInfo() {
    let match = null;
    try {
        match = typeof chatThread.matchPlatform === "function" ? chatThread.matchPlatform(location.hostname) : null;
    } catch { match = null; }
    return {
        id: match?.id || "",
        name: match?.name || detectPlatform(),
        budget: Number(window.IKO.config?.contextBudget || match?.budget || 200000),
        price: Number(match?.pricePer1M ?? 2.0)
    };
}

// Gemini /app is the empty "new chat" screen: no conversation to count, and the
// welcome text must not show up as context.
function hasActiveConversation() {
    const h = location.hostname.toLowerCase();
    const p = location.pathname;
    return !(h.includes("gemini") && (p === "/app" || p === "/app/"));
}

function readThread(platformId) {
    if (!hasActiveConversation()) return { messages: [], source: "none" };
    if (typeof chatThread.extractChatThread !== "function") return { messages: [], source: "none" };
    return chatThread.extractChatThread(platformId);
}

// --- composer / draft tracking ----------------------------------------------

// Locate the active message composer using the shared composer resolver
// (supports textarea, contenteditable, ProseMirror, rich-textarea, …).
function composerElement() {
    if (window.IKOComposer?.findComposer) {
        try { return window.IKOComposer.findComposer(); } catch { return null; }
    }
    return null;
}

// Read the unsent draft text from the composer.
function readDraftText() {
    const el = composerElement();
    if (!el) return "";
    try {
        if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
            return el.value || "";
        }
        // contenteditable / rich-textarea / ProseMirror / etc.
        return el.innerText || el.textContent || "";
    } catch { return ""; }
}

function draftTokenCount(text) {
    if (!text) return 0;
    try { return countTokens(String(text).slice(0, MAX_MESSAGE_CHARS)); } catch { return 0; }
}

// Returns true if the draft text is already represented in the conversation
// (e.g. the last user message hasn't been cleared from the composer yet), so
// we don't double-count it against the context budget.
function draftOverlapsConversation(draft, messages) {
    if (!draft || !messages.length) return false;
    const last = messages[messages.length - 1];
    if (!last) return false;
    const normalized = (s) => String(s || "").replace(/\s+/g, " ").trim();
    return normalized(draft) === normalized(last.content);
}

// Schedule a faster update when the user is typing (draft changed).
function scheduleDraftUpdate() {
    if (draftTimer) return;
    draftTimer = setTimeout(() => {
        draftTimer = null;
        update();
    }, DRAFT_DEBOUNCE_MS);
}

// Attach input listeners and a MutationObserver to the composer so typing,
// pasting, and DOM replacement of the composer all trigger re-counts.
function setupComposerWatcher() {
    if (composerObserver) {
        try { composerObserver.disconnect(); } catch { /* ignore */ }
        composerObserver = null;
    }

    const el = composerElement();
    if (!el) return;

    // Direct input events on the composer.
    const onInput = () => scheduleDraftUpdate();
    el.addEventListener("input", onInput, { passive: true });
    el.addEventListener("change", onInput, { passive: true });
    el.addEventListener("keyup", onInput, { passive: true });
    el.addEventListener("paste", onInput, { passive: true });

    // MutationObserver for structural changes (React re-rendering the composer).
    composerObserver = new MutationObserver((records) => {
        for (const record of records) {
            if (isOwnUi(record.target)) continue;
            scheduleDraftUpdate();
            return;
        }
    });
    try {
        composerObserver.observe(el, {
            childList: true,
            subtree: true,
            characterData: true
        });
    } catch { /* ignore */ }
}

// --- whole-conversation counting ---------------------------------------------
// The DOM only holds the turns the site happens to have mounted (long chats
// unmount / virtualise history). The page bridge captures the API payload the
// site itself fetched, whose mapping holds the whole conversation — the number
// that matters when deciding to migrate. It is only as fresh as the last fetch,
// so it is combined with the live DOM reading, never replacing it.
let bridgeCache = { payload: null, messages: [], tokens: -1, initialized: false };
// Rolling back the count when a site unmounts old turns would state the
// opposite of the truth ("less context in use"). Keep the largest count seen
// for this conversation; starting or switching chats resets it.
let highWater = { key: "", tokens: 0 };
// Identity of the open conversation on *any* site, not just ChatGPT: host +
// path. Every change means a different chat, so the signature cache, the
// bridge payload and the endpoint attempt must all be dropped — otherwise the
// HUD can keep showing the previous chat's number until the extension reloads.
let lastKey = "";

// A same-origin fetch of the conversation endpoint never downgrades a payload
// that already holds more messages (bridge payload included).
function conversationKey() {
    return `${location.hostname}${location.pathname}`;
}

function bridgeMessages() {
    try {
        const bridge = window.IKO?.chatgptBridge;
        const id = conversationId();
        // Prefer the last payload that really parsed: the sidebar's chat-list
        // shares the conversation URL prefix and overwrites latestConversation.
        const payload = bridge?.latestValidConversation || bridge?.latestConversation;
        if (!payload) return [];
        // Never count another conversation's payload: the bridge can hold the
        // previous chat (or its sidebar list) while this tab shows a new one.
        const payloadId = String(payload?.conversation_id || "").slice(0, 64);
        if (payloadId && payloadId !== id) return [];
        if (bridgeCache.initialized && bridgeCache.convoId !== id) {
            bridgeCache = { payload: null, convoId: id, messages: [], tokens: -1, initialized: true };
            return [];
        }
        if (!bridgeCache.initialized) {
            bridgeCache.initialized = true;
            bridgeCache.convoId = id;
        }
        if (payload !== bridgeCache.payload) {
            const messages = typeof chatThread.extractConversationMessages === "function"
                ? chatThread.extractConversationMessages(payload)
                : null;
            bridgeCache = { payload, convoId: id, messages: Array.isArray(messages) ? messages : [], tokens: -1, initialized: true };
        }
        return bridgeCache.messages;
    } catch { return []; }
}

function bridgeTokens() {
    const messages = bridgeMessages();
    if (!messages.length) return -1;
    if (bridgeCache.tokens < 0) {
        bridgeCache.tokens = messages.reduce(
            (total, message) => total + countTokens(String(message.content || "").slice(0, MAX_MESSAGE_CHARS)),
            0
        );
    }
    return bridgeCache.tokens;
}

// --- whole conversation on demand (ChatGPT) ----------------------------------
// The bridge only exists when the page itself fetched the conversation, and its
// payload can be overwritten by the sidebar's chat-list request. So when no
// conversation is in hand, ask the same same-origin endpoint the migration
// adapter uses — the cookies the page already has are enough. Once per
// conversation (retried after a minute so a hiccup is not permanent).
let remoteAttempt = { id: "", at: 0, pending: false };

function conversationId() {
    const last = location.pathname.split("/").filter(Boolean).pop() || "";
    return /^[0-9a-zA-Z-]{10,}$/.test(last) ? last : "";
}

function fetchConversation() {
    if (remoteAttempt.pending) return;
    const id = conversationId();
    if (!id) return;
    if (id === remoteAttempt.id && Date.now() - remoteAttempt.at < 60000) return;
    remoteAttempt = { id, at: Date.now(), pending: true };
    const log = (level, message, data) => {
        try { window.IKO.logger?.[level]?.("ChatGPT-HUD", message, data); } catch { /* ignore */ }
        const method = level === "warn" ? "warn" : "log";
        console[method](`[IKO:ChatGPT-HUD] ${message}`, data || "");
    };
    (async () => {
        // Whole-thread first (some builds paginate the plain endpoint), then the
        // plain live endpoint, then the classic singular one.
        for (const path of [
            `/backend-api/conversations/${id}?num_turns=1000`,
            `/backend-api/conversations/${id}`,
            `/backend-api/conversation/${id}`
        ]) {
            try {
                const response = await fetch(path, { credentials: "include" });
                if (!response.ok) { log("warn", `conversation endpoint ${path} → ${response.status}`, {}); continue; }
                const data = await response.json();
                const messages = chatThread.extractConversationMessages(data);
                if (messages?.length) {
                    // Never downgrade: keep whichever payload holds more messages.
                    try {
                        const bridge = window.IKO.chatgptBridge;
                        if (bridge && messages.length > (bridge.latestValidMessages || 0)) {
                            bridge.latestValidConversation = data;
                            bridge.latestValidMessages = messages.length;
                        }
                    } catch { /* ignore */ }
                    log("info", `whole conversation read (${path})`, { messages: messages.length });
                    return;
                }
                log("warn", `conversation payload unparsable (${path})`, { keys: Object.keys(data || {}).slice(0, 8).join(",") });
            } catch (error) {
                log("warn", `conversation fetch failed (${path})`, { error: String(error?.message || error).slice(0, 160) });
            }
        }
    })().finally(() => { remoteAttempt.pending = false; });
}

// A page the reader cannot fully read must be diagnosable from "Copy logs":
// selector counts, the container that was chosen and the bridge state, once per
// conversation instead of every poll.
let lastDiagnostic = "";

function describeBridge() {
    try {
        const bridge = window.IKO?.chatgptBridge;
        if (!bridge) return "client-missing";
        const parts = [bridge.ready ? "ready" : "silent"];
        if (!bridge.latestConversation) parts.push("no-payload");
        else parts.push(`payload(${Object.keys(bridge.latestConversation).slice(0, 5).join(",")})`);
        const valid = bridge.latestValidConversation ? chatThread.extractConversationMessages(bridge.latestValidConversation) : null;
        parts.push(valid?.length ? `valid(${valid.length} msgs)` : "no-valid");
        return parts.join(" ");
    } catch { return "client-error"; }
}

function logWeakRead(info, source, reason) {
    const key = `${info.name}|${source}|${reason}|${location.pathname}`;
    if (key === lastDiagnostic) return;
    lastDiagnostic = key;
    const bridge = describeBridge();
    const line = `[IKO:ChatGPT-HUD] weak read — source=${source} reason=${reason || "-"} bridge=${bridge}`;
    let detail = {};
    try { detail = typeof chatThread.debugReading === "function" ? chatThread.debugReading(info.id) : {}; } catch { /* ignore */ }
    console.log(line, detail);
    try {
        window.IKO.logger?.warn?.("ChatGPT-HUD", line, Object.assign({
            host: location.hostname,
            url: location.href.slice(0, 160),
            bridge,
            selectors: JSON.stringify(detail.selectors || {}),
            samples: (detail.samples || []).join(" | ")
        }, {
            matched: detail.matched,
            innermost: detail.innermost,
            container: detail.container,
            containerChars: detail.containerChars,
            containerBlocks: detail.containerBlocks,
            descended: detail.descended
        }));
    } catch { /* ignore */ }
}

// Re-tokenising an unchanged thread every 2s burns CPU for nothing. The
// signature also lets the HUD skip idle renders without going stale.
function signature(info, messages, source, fullTokens, draftText, draftTok) {
    let hash = 2166136261;
    const mix = (text) => {
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
    };
    mix(`${info.name}|${source}|${messages.length}|${fullTokens}|${draftTok}`);
    for (const message of messages) mix(message.content);
    mix(draftText || "");
    return (hash >>> 0).toString(16);
}

function update() {
    if (!window.IKO.ui) return;
    if (counting) return;

    const info = platformInfo();

    // Every site: a different host+path is a different conversation. Drop all
    // per-chat state (signature cache, high-water mark, bridge payload,
    // endpoint attempt, draft state) so the HUD re-counts the new chat
    // immediately instead of showing the previous one until reload.
    const key = conversationKey();
    if (key !== lastKey) {
        lastKey = key;
        lastSignature = "";
        lastDraftSignature = "";
        lastDraftText = "";
        lastDiagnostic = "";
        bridgeCache = { payload: null, messages: [], tokens: -1, initialized: false };
        remoteAttempt = { id: "", at: 0, pending: false };
        highWater = { key, tokens: 0 };
    }

    let messages = [];
    let source = "none";
    let reason = "";
    try {
        const thread = readThread(info.id);
        messages = thread.messages || [];
        source = thread.source || "none";
        reason = thread.reason || "";
    } catch (error) {
        console.warn("[IKO ChatGPT] Thread read failed:", error);
        messages = [];
    }

    // The bridge payload is the whole conversation on sites that publish one,
    // even when the DOM currently shows none of it.
    const full = bridgeMessages();
    // ChatGPT without a conversation in hand: ask the page's own endpoint.
    if (!full.length && info.id === "chatgpt") fetchConversation();

    // --- draft reading: unsent text in the composer -----------------------
    const draftText = readDraftText();
    const draftOverlaps = draftOverlapsConversation(draftText, messages);
    const draftTok = draftOverlaps ? 0 : draftTokenCount(draftText);

    const fullTokens = full.length ? bridgeTokens() : -1;
    const domTokens = messages.reduce(
        (total, message) => total + countTokens(message.content.slice(0, MAX_MESSAGE_CHARS)),
        0
    );

    if (!messages.length && !full.length && !draftText) {
        lastSignature = "";
        lastDraftSignature = "";
        lastDraftText = "";
        // Make a site we cannot read diagnosable from the console / View logs.
        logWeakRead(info, source, reason);
        window.IKO.latestData = {
            platform: info.name,
            tokens: 0,
            messageCount: 0,
            usagePercentage: 0,
            tokenizer: "o200k_base",
            source,
            reason,
            status: "Waiting for messages",
            draftTokens: 0,
            projectedTokens: 0,
            projectedUsagePercentage: 0,
            draftOverlap: false
        };
        window.IKO.ui.update(window.IKO.latestData);
        return;
    }

    const sig = signature(info, messages, source, fullTokens, draftText, draftTok);
    if (sig === lastSignature && lastDraftSignature === draftText && window.IKO.latestData) {
        // Nothing new to count: keep the HUD in sync without re-tokenising.
        window.IKO.ui.update(window.IKO.latestData);
        return;
    }

    counting = true;
    try {
        // Live updates re-count every few hundred ms while a prompt is sent and
        // an answer streams; flashing "Counting context…" each time would make
        // the HUD strobe. Only show the loader while no count is on screen yet.
        const hasCount = Boolean(window.IKO.latestData &&
            (window.IKO.latestData.tokens > 0 || window.IKO.latestData.messageCount > 0));
        if (!hasCount) window.IKO.ui.setLoading(true, "Counting context…");
        try {
            // Whole conversation when the page exposes it, live DOM otherwise,
            // and never less than the largest count already seen here: a site
            // that unmounts old turns must not look like it freed context.
            const tokens = Math.max(domTokens, fullTokens, highWater.tokens);
            highWater.tokens = tokens;

            // Projected context = conversation + unsent draft. Draft that
            // duplicates the last conversation message is not double-counted.
            const projectedTokens = tokens + draftTok;
            const whole = fullTokens > domTokens;
            const usedSource = whole ? "conversation" : source;
            // Without the whole conversation, a fallback reading is worth a one-off
            // diagnostic — that is the case where a real site can still be fixed.
            if (!whole && source !== "selectors") logWeakRead(info, source, reason);

            const cost = tokens / 1000000 * info.price;
            const projectedCost = projectedTokens / 1000000 * info.price;
            const pct = Math.min(100, Math.round((tokens / info.budget) * 100));
            const projectedPct = Math.min(100, Math.round((projectedTokens / info.budget) * 100));
            const health = pct >= 95 ? "⚠ Context critical — migrate or summarize"
                : pct >= 80 ? "⚠ Context filling — consider migrate"
                : usedSource === "conversation" ? "Full conversation"
                : usedSource === "thread" ? "Thread estimate — no message markup"
                : "Local tokenizer estimate";

            const draftLabel = draftTok > 0 ? ` + ${draftTok} draft` : "";
            const projectedLabel = draftTok > 0 ? ` (${projectedTokens} projected)` : "";

            window.IKO.latestData = {
                platform: info.name,
                tokens,
                messageCount: whole ? full.length : messages.length,
                usagePercentage: pct,
                tokenizer: "o200k_base",
                cost,
                source: usedSource,
                reason: whole ? `whole-conversation(${full.length} msgs)` : reason,
                status: `${health}${draftLabel}${projectedLabel} · ~$${cost.toFixed(3)}`,
                draftTokens: draftTok,
                projectedTokens,
                projectedUsagePercentage: projectedPct,
                draftOverlap: draftOverlaps
            };

            lastSignature = sig;
            lastDraftSignature = draftText;
            lastDraftText = draftText;
            window.IKO.ui.update(window.IKO.latestData);
        } catch (error) {
            console.error("[IKO ChatGPT] Tokenizer failed:", error);
            window.IKO.ui.update({
                platform: info.name,
                tokens: 0,
                messageCount: messages.length,
                usagePercentage: 0,
                tokenizer: "o200k_base",
                status: "Tokenizer error",
                draftTokens: draftTok,
                projectedTokens: draftTok,
                projectedUsagePercentage: 0,
                draftOverlap: false
            });
        }
    } finally {
        try { window.IKO.ui.setLoading(false); } catch { /* never leave the HUD stuck counting */ }
        counting = false;
    }
}

// --- live updates -------------------------------------------------------------
// Chat pages mutate constantly: the submitted prompt lands, the answer streams
// token by token, the sidebar re-renders. A 2 s heartbeat feels stale in those
// moments (and a chat switch can wait a whole tick), so the page itself drives
// extra reads — throttled while a stream is running. Every read still goes
// through the signature cache, so idle ticks stay cheap.
let observer = null;
let composerObserver = null;
let domTimer = null;
let domLast = 0;
let urlTimer = null;
let lastHref = location.href;

const IKO_UI_SELECTOR = "#iko-context-hud, #iko-bot, #iko-optimizer-panel, #iko-optimizer-launcher";

// The HUD writes to the page too; its own mutations must not drive a re-read
// (and the HUD lives outside <body>, so observing <body> already excludes it —
// this is belt and braces for panels that mount inside it).
function isOwnUi(target) {
    const el = target?.nodeType === 1 ? target : target?.parentElement;
    return typeof el?.closest === "function" && !!el.closest(IKO_UI_SELECTOR);
}

// Leading+trailing throttle: at most one automatic read per 700 ms while the
// page keeps changing, and the last change always gets counted. Without the
// trailing part a long stream that never pauses would starve the HUD.
function scheduleUpdate(delay = 700) {
    if (domTimer) return;
    const wait = Math.max(0, delay - (Date.now() - domLast));
    domTimer = setTimeout(() => {
        domTimer = null;
        domLast = Date.now();
        update();
    }, wait);
}

function watchPage() {
    if (typeof MutationObserver !== "function") return;
    if (observer) observer.disconnect();
    observer = new MutationObserver((records) => {
        // Hidden tabs still stream; there is nobody to show it to.
        if (document.hidden) return;
        for (const record of records) {
            if (isOwnUi(record.target)) continue;
            scheduleUpdate();
            return;
        }
    });
    observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
    });
}

// SPA chat switches change the URL before the new conversation renders; react
// at once instead of waiting for the heartbeat or a DOM mutation.
function watchUrl() {
    clearInterval(urlTimer);
    urlTimer = setInterval(() => {
        if (location.href === lastHref) return;
        lastHref = location.href;
        update();
        // The composer element may have been replaced by the SPA navigation;
        // re-wire input listeners so typing keeps updating the HUD.
        setupComposerWatcher();
    }, 300);
}

// Intercept history.pushState / replaceState / popstate so SPA chat switches
// (which may not mutate the DOM enough to trigger the MutationObserver) cause
// an immediate re-count.
function interceptNavigation() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    function onNavigation() {
        scheduleUpdate(100);
    }

    history.pushState = function (...args) {
        originalPushState.apply(this, args);
        onNavigation();
    };

    history.replaceState = function (...args) {
        originalReplaceState.apply(this, args);
        onNavigation();
    };

    window.addEventListener("popstate", onNavigation);
}

function initialize() {
    console.log("[IKO ChatGPT] Context HUD initializing");
    window.IKO.ui.create();
    update();
    clearInterval(timer);
    timer = setInterval(update, 2000);
    watchPage();
    watchUrl();
    interceptNavigation();
    setupComposerWatcher();
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) update();
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
} else {
    initialize();
}
