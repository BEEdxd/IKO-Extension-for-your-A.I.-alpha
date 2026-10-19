"use strict";

import { countClaudeTokens } from "./claude-api.js";
import { convertClaudeConversationToMessages } from "./claude-message-converter.js";
import chatThread from "../migration/core/chat-thread.js";
import "./ui.js";

window.IKO = window.IKO || {};
// Shared thread reader (the same one main.js uses), so the DOM reading below
// counts Claude's messages with the platform registry's selectors.
window.IKO.chatThread = window.IKO.chatThread || chatThread;

let updateTimer = null;
let counting = false;
// Identity of the open conversation: host + path. Every change drops the
// per-chat state below, so switching chats re-counts without a reload.
let lastKey = "";
let lastSignature = "";
let lastDraftSignature = "";
let lastDraftText = "";
// The bridge caches the LAST conversation the page fetched and replays it on
// every refresh request, so a stale payload must never be counted.
let highWater = { key: "", tokens: 0 };

// Universal budgets/prices mirror platforms.js; model slug refines them.
const CLAUDE_DEFAULT = { budget: 200000, price: 3.0, label: "Claude" };

// One message can be huge. The tokenizer runs at ~35M chars/s, so this is a
// guard against pathological pages.
const MAX_MESSAGE_CHARS = 400000;

// Debounce for composer typing so we don't re-tokenise on every keystroke,
// but still reflect the draft within ~200 ms of the user stopping.
let draftTimer = null;
const DRAFT_DEBOUNCE_MS = 200;
function detectClaudeModel(conversation) {
    const raw = String(conversation?.model || "").toLowerCase();
    if (raw.includes("opus")) return { budget: 200000, price: 15.0, label: "Claude Opus" };
    if (raw.includes("sonnet")) return { budget: 200000, price: 3.0, label: "Claude Sonnet" };
    if (raw.includes("haiku")) return { budget: 200000, price: 0.8, label: "Claude Haiku" };
    return CLAUDE_DEFAULT;
}

function isClaudePage() {
    const host = window.location.hostname.toLowerCase();
    return host === "claude.ai" || host.endsWith(".claude.ai");
}

function removeLegacyHUD() {
    for (const id of [
        "iko-claude-hud",
        "iko-claude-token-hud",
        "iko-claude-legacy-hud"
    ]) {
        document.getElementById(id)?.remove();
    }
}

function updateUI(data) {
    if (window.IKO?.ui) {
        window.IKO.ui.update(data);
    }
}

function conversationKey() {
    return `${location.hostname}${location.pathname}`;
}

// Claude keeps the open chat in the path (`/chat/<uuid>`); a new chat is
// `/new` or `/`. That id is what the bridge payload must match.
function conversationId() {
    const match = location.pathname.match(/\/chat\/([0-9a-zA-Z-]{8,})/);
    return match ? match[1] : "";
}

// The bridge keeps the previous chat's conversation around and replays it on
// every REQUEST_REFRESH, which is how the HUD could show the old chat's tokens
// (or freeze on them) until the extension was reloaded. Accept a payload only
// when it names the conversation that is actually open.
function bridgeConversation() {
    try {
        const bridge = window.IKO?.claudeBridge;
        const payload = bridge?.latestConversation;
        if (!payload) return null;
        const id = conversationId();
        // No chat in the path (new/empty chat): any cached conversation is
        // from a previous chat and must not show up here.
        if (!id) return null;
        const fromData = String(payload.uuid || payload.id || "").slice(0, 64);
        const fromUrl = String(bridge.latestConversationUrl || "")
            .match(/chat_conversations\/([0-9a-zA-Z-]{8,})/)?.[1] || "";
        const known = fromData || fromUrl;
        if (known && known !== id) return null;
        return payload;
    } catch { /* ignore */ }
    return null;
}

// Live DOM reading: gives the HUD a number while an answer streams (the page
// appends text) and a fallback when the bridge never saw the conversation.
function domMessages() {
    if (typeof chatThread.extractChatThread !== "function") return [];
    try {
        const thread = chatThread.extractChatThread("claude");
        return thread.messages || [];
    } catch { return []; }
}

// --- composer / draft tracking (Claude) -------------------------------------

function composerElement() {
    if (window.IKOComposer?.findComposer) {
        try { return window.IKOComposer.findComposer(); } catch { return null; }
    }
    return null;
}

function readDraftText() {
    const el = composerElement();
    if (!el) return "";
    try {
        if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
            return el.value || "";
        }
        return el.innerText || el.textContent || "";
    } catch { return ""; }
}

function draftTokenCount(text) {
    if (!text) return 0;
    try {
        // Claude uses the same local chars/4 estimate as claude-api.js.
        return Math.max(0, Math.ceil(String(text).slice(0, MAX_MESSAGE_CHARS).length / 4));
    } catch { return 0; }
}

function draftOverlapsConversation(draft, messages) {
    if (!draft || !messages.length) return false;
    const last = messages[messages.length - 1];
    if (!last) return false;
    const normalized = (s) => String(s || "").replace(/\s+/g, " ").trim();
    return normalized(draft) === normalized(last.content);
}

function scheduleDraftUpdate() {
    if (draftTimer) return;
    draftTimer = setTimeout(() => {
        draftTimer = null;
        updateClaude();
    }, DRAFT_DEBOUNCE_MS);
}

function setupComposerWatcher() {
    if (composerObserver) {
        try { composerObserver.disconnect(); } catch { /* ignore */ }
        composerObserver = null;
    }

    const el = composerElement();
    if (!el) return;

    const onInput = () => scheduleDraftUpdate();
    el.addEventListener("input", onInput, { passive: true });
    el.addEventListener("change", onInput, { passive: true });
    el.addEventListener("keyup", onInput, { passive: true });
    el.addEventListener("paste", onInput, { passive: true });

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

// Re-tokenising an unchanged thread on every poll/tick burns CPU for nothing.
function signature(label, messages, bridgeCount, bridgeTokens, draftText, draftTok) {
    let hash = 2166136261;
    const mix = (text) => {
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
    };
    mix(`${label}|${messages.length}|${bridgeCount}|${bridgeTokens}|${draftTok}`);
    for (const message of messages) mix(message.content);
    mix(draftText || "");
    return (hash >>> 0).toString(16);
}

async function updateClaude() {
    if (!isClaudePage() || counting) return;

    removeLegacyHUD();

    const key = conversationKey();
    if (key !== lastKey) {
        lastKey = key;
        lastSignature = "";
        lastDraftSignature = "";
        lastDraftText = "";
        highWater = { key, tokens: 0 };
    }

    const conversation = bridgeConversation();
    const dom = domMessages();
    const bridgeMessages = conversation
        ? convertClaudeConversationToMessages(conversation)
        : [];

    // Ask the page for a payload once per chat when the bridge has none for
    // this conversation; the DOM reading below still counts while waiting.
    if (!conversation) window.IKO?.claudeBridge?.requestConversationRefresh?.();

    // --- draft reading: unsent text in the composer -----------------------
    const draftText = readDraftText();
    const draftOverlaps = draftOverlapsConversation(draftText, dom.length ? dom : bridgeMessages);
    const draftTok = draftOverlaps ? 0 : draftTokenCount(draftText);

    if (!bridgeMessages.length && !dom.length && !draftText) {
        lastSignature = "";
        lastDraftSignature = "";
        lastDraftText = "";
        window.IKO.latestData = {
            platform: "Claude",
            tokens: 0,
            messageCount: 0,
            usagePercentage: 0,
            tokenizer: "Local estimate",
            status: "Waiting for Claude messages",
            draftTokens: 0,
            projectedTokens: 0,
            projectedUsagePercentage: 0,
            draftOverlap: false
        };
        updateUI(window.IKO.latestData);
        return;
    }

    const model = detectClaudeModel(conversation);
    const bridgeTokens = bridgeMessages.length
        ? await countClaudeTokens({ messages: bridgeMessages })
        : 0;
    const sig = signature(model.label, dom.length ? dom : bridgeMessages, bridgeMessages.length, bridgeTokens, draftText, draftTok);
    if (sig === lastSignature && lastDraftSignature === draftText && window.IKO.latestData) {
        // Nothing new: keep the HUD in sync without re-tokenising.
        updateUI(window.IKO.latestData);
        return;
    }

    counting = true;
    try {
        // Live updates re-count every few hundred ms while an answer streams;
        // only show the loader while no count is on screen yet.
        const hasCount = Boolean(window.IKO.latestData &&
            (window.IKO.latestData.tokens > 0 || window.IKO.latestData.messageCount > 0));
        if (!hasCount) window.IKO.ui?.setLoading(true, "Counting Claude context…");

        const domTokens = dom.length
            ? await countClaudeTokens({ messages: dom })
            : 0;

        // Whole conversation when the bridge has it, live DOM otherwise, and
        // never less than the largest count already seen for this chat.
        const tokens = Math.max(domTokens, bridgeTokens, highWater.tokens);
        highWater.tokens = tokens;

        // Projected context = conversation + unsent draft (deduped against
        // last message to avoid double-counting).
        const projectedTokens = tokens + draftTok;
        const usedBridge = bridgeTokens > domTokens;
        const cost = tokens / 1000000 * model.price;
        const projectedCost = projectedTokens / 1000000 * model.price;
        const pct = Math.min(100, Math.round((tokens / model.budget) * 100));
        const projectedPct = Math.min(100, Math.round((projectedTokens / model.budget) * 100));
        const health = pct >= 95 ? "⚠ Context critical — migrate or summarize"
            : pct >= 80 ? "⚠ Context filling — consider migrate"
                : usedBridge ? "Full conversation"
                    : "Local token estimate (no IKO server required)";

        const draftLabel = draftTok > 0 ? ` + ${draftTok} draft` : "";
        const projectedLabel = draftTok > 0 ? ` (${projectedTokens} projected)` : "";

        window.IKO.latestData = {
            platform: model.label,
            tokens,
            messageCount: usedBridge ? bridgeMessages.length : dom.length,
            usagePercentage: pct,
            tokenizer: "Local estimate",
            cost,
            source: usedBridge ? "conversation" : "selectors",
            status: `${health}${draftLabel}${projectedLabel} · ~$${cost.toFixed(3)}`,
            draftTokens: draftTok,
            projectedTokens,
            projectedUsagePercentage: projectedPct,
            draftOverlap: draftOverlaps
        };

        lastSignature = sig;
        lastDraftSignature = draftText;
        lastDraftText = draftText;
        updateUI(window.IKO.latestData);
    } catch (error) {
        console.error("[IKO Claude] Token count failed:", error);
        updateUI({
            platform: "Claude",
            tokens: 0,
            messageCount: 0,
            usagePercentage: 0,
            tokenizer: "Local estimate",
            status: "Token count unavailable",
            draftTokens: draftTok,
            projectedTokens: draftTok,
            projectedUsagePercentage: 0,
            draftOverlap: false
        });
    } finally {
        window.IKO.ui?.setLoading(false);
        counting = false;
    }
}

// --- live updates -------------------------------------------------------------
// Same mechanism as main.js: the HUD moves when a prompt lands and while an
// answer streams, and a chat switch does not wait for the 2.5 s poll. Reads are
// throttled and signature-gated, so idle pages stay free.
let observer = null;
let composerObserver = null;
let domTimer = null;
let domLast = 0;
let urlTimer = null;
let lastHref = location.href;

const IKO_UI_SELECTOR = "#iko-context-hud, #iko-bot, #iko-optimizer-panel, #iko-optimizer-launcher";

function isOwnUi(target) {
    const el = target?.nodeType === 1 ? target : target?.parentElement;
    return typeof el?.closest === "function" && !!el.closest(IKO_UI_SELECTOR);
}

// Leading+trailing throttle: at most one read per 700 ms while the page keeps
// changing, and the last change always gets counted.
function scheduleUpdate(delay = 700) {
    if (domTimer) return;
    const wait = Math.max(0, delay - (Date.now() - domLast));
    domTimer = setTimeout(() => {
        domTimer = null;
        domLast = Date.now();
        updateClaude();
    }, wait);
}

function watchPage() {
    if (typeof MutationObserver !== "function") return;
    if (observer) observer.disconnect();
    observer = new MutationObserver((records) => {
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

// SPA chat switches change the URL before the new conversation renders.
function watchUrl() {
    clearInterval(urlTimer);
    urlTimer = setInterval(() => {
        if (location.href === lastHref) return;
        lastHref = location.href;
        updateClaude();
        // The composer element may have been replaced by the SPA navigation;
        // re-wire input listeners so typing keeps updating the HUD.
        setupComposerWatcher();
    }, 300);
}

// Intercept history.pushState / replaceState / popstate so SPA chat switches
// cause an immediate re-count.
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
    if (!isClaudePage()) return;

    console.log("[IKO Claude] Initializing Context HUD");
    removeLegacyHUD();
    window.IKO.ui?.create();
    updateClaude();

    window.addEventListener("iko-claude-conversation-updated", () => {
        updateClaude();
    });

    clearInterval(updateTimer);
    updateTimer = setInterval(() => {
        removeLegacyHUD();
        updateClaude();
    }, 2500);

    watchPage();
    watchUrl();
    interceptNavigation();
    setupComposerWatcher();
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) updateClaude();
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
} else {
    initialize();
}
