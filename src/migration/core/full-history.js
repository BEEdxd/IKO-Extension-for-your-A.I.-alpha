"use strict";

/*
 * full-history.js — bring the ENTIRE chat history into the DOM before extraction.
 *
 * ChatGPT / Claude / Gemini only mount the last visible turns on load; older
 * messages appear as the scroll container moves toward the top. Extracting
 * right away therefore migrates just the visible tail. loadAllHistory() walks
 * the message scroll container up to the very top in viewport-sized steps,
 * waits for each lazy batch, then restores the original scroll position.
 *
 * The walk loop (`walkToTop`) is DOM-free so it can be unit tested with stubs.
 */

const DEFAULT_MARKER_SELECTORS = [
    "[data-message-author-role]",
    '[data-testid^="conversation-turn-"]',
    "[data-message-id]",
    '[data-testid="chat-message"]',
    "user-query, model-response",
    "main article",
    "main [data-turn]",
    "[data-testid^='message-']"
];

function log(level, message, data) {
    try {
        const l = globalThis.window?.IKO?.logger;
        if (l?.[level]) l[level]("FullHistory", message, data);
        else console.log(`[IKO:FullHistory] ${message}`, data ?? "");
    } catch { /* ignore */ }
}

function emitProgress(message) {
    try {
        if (typeof CustomEvent === "function" && globalThis.window?.dispatchEvent) {
            globalThis.window.dispatchEvent(new CustomEvent("iko-migration-progress", {
                detail: { message }
            }));
        }
    } catch { /* ignore */ }
}

// ---------- DOM-free walk core ----------

// Walk the container toward its top edge, waiting after every step so lazy
// loaders can append older turns. Stops when the top is reached and nothing
// grew for `stableRounds` consecutive waits (or when the budget runs out).
async function walkToTop(io, opts = {}) {
    const maxSteps = Number.isFinite(opts.maxSteps) ? opts.maxSteps : 140;
    const maxMs = Number.isFinite(opts.maxMs) ? opts.maxMs : 45000;
    const stableRounds = Number.isFinite(opts.stableRounds) ? opts.stableRounds : 3;
    const growEpsilon = Number.isFinite(opts.growEpsilon) ? opts.growEpsilon : 10;
    const stepFraction = Number.isFinite(opts.stepFraction) ? opts.stepFraction : 0.9;
    const now = typeof opts.now === "function" ? opts.now : () => Date.now();

    const stepPx = Math.max(220, Math.floor(io.getClientHeight() * stepFraction));
    const start = now();

    let prevHeight = io.getHeight();
    let prevCount = io.count();
    let stable = 0;
    let steps = 0;
    let grew = false;

    while (steps < maxSteps && now() - start <= maxMs) {
        steps += 1;
        const top = io.getTop();
        const minTop = io.minTop();
        if (top > minTop + 1) {
            io.setTop(Math.max(minTop, top - stepPx));
            await io.wait();
        } else {
            // Already at the top edge: a tiny round-trip scroll re-fires scroll
            // events so loaders that only listen for scrolling still fetch the
            // next (older) batch — some sites leave scrollTop pinned at 0 when
            // older content is prepended.
            io.setTop(minTop + 1);
            await io.wait();
            io.setTop(minTop);
        }

        const height = io.getHeight();
        const count = io.count();
        if (height > prevHeight + growEpsilon || count > prevCount) {
            grew = true;
            stable = 0;
            prevHeight = height;
            prevCount = count;
        } else if (io.getTop() <= io.minTop() + 1) {
            stable += 1;
            if (stable >= stableRounds) break;
        } else {
            stable = 0; // still travelling up
        }

        if (typeof opts.onStep === "function") {
            try { opts.onStep({ step: steps, height, count, top: io.getTop() }); } catch { /* ignore */ }
        }
    }

    return { steps, grew, height: io.getHeight(), count: io.count() };
}

// ---------- DOM helpers ----------

function isScrollable(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
        const cs = globalThis.getComputedStyle?.(el);
        const oy = cs?.overflowY || "";
        if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") return false;
        return el.scrollHeight > el.clientHeight + 40;
    } catch { return false; }
}

function parentEl(el) {
    if (!el) return null;
    if (el.parentElement) return el.parentElement;
    // cross shadow-DOM boundaries (custom elements like Gemini's)
    try {
        const root = el.getRootNode?.();
        if (root && root.host) return root.host;
    } catch { /* ignore */ }
    return null;
}

function scrollableAncestor(node) {
    let el = node?.nodeType === 1 ? node : node?.parentElement || null;
    while (el) {
        if (isScrollable(el)) return el;
        el = parentEl(el);
    }
    return null;
}

function firstMatch(doc, selectors) {
    for (const sel of selectors) {
        try {
            const found = doc.querySelector(sel);
            if (found) return found;
        } catch { /* bad selector */ }
    }
    return null;
}

function countMarkers(doc, selectors) {
    let best = 0;
    for (const sel of selectors) {
        try {
            const count = doc.querySelectorAll(sel).length;
            if (count > best) best = count;
        } catch { /* bad selector */ }
    }
    return best;
}

function bestScrollable(doc, selectors = DEFAULT_MARKER_SELECTORS) {
    let best = null;
    let bestScore = -1;
    const hasMarker = (el) => selectors.some(sel => {
        try { return !!el.querySelector(sel); } catch { return false; }
    });
    try {
        const root = doc.querySelector("main") || doc.body;
        if (root) {
            const all = root.querySelectorAll("div, main, section, article");
            const limit = Math.min(all.length, 3000);
            for (let i = 0; i < limit; i += 1) {
                const el = all[i];
                if (!isScrollable(el)) continue;
                // A scroller that contains message nodes beats bigger sidebars.
                const score = (hasMarker(el) ? 1e9 : 0) + (el.scrollHeight - el.clientHeight);
                if (score > bestScore) { best = el; bestScore = score; }
            }
        }
    } catch { /* ignore */ }
    if (best) return best;
    try {
        const se = doc.scrollingElement || doc.documentElement;
        if (se && se.scrollHeight > se.clientHeight + 40) return se;
    } catch { /* ignore */ }
    return null;
}

function isColumnReversed(el) {
    try {
        return globalThis.getComputedStyle?.(el)?.flexDirection === "column-reverse";
    } catch { return false; }
}

// Resolve once mutations under `target` have been quiet for `quietMs`, or at
// `maxMs` — which is exactly the "wait for a lazy batch" primitive we need.
function waitQuiet(target, opts = {}) {
    const quietMs = Number.isFinite(opts.quietMs) ? opts.quietMs : 240;
    const maxMs = Number.isFinite(opts.maxMs) ? opts.maxMs : 1100;
    return new Promise(resolve => {
        let finished = false;
        let observer = null;
        let interval = null;
        let lastMutation = Date.now();
        const start = Date.now();
        const finish = () => {
            if (finished) return;
            finished = true;
            if (interval) clearInterval(interval);
            try { observer?.disconnect(); } catch { /* ignore */ }
            resolve();
        };
        try {
            const MO = globalThis.MutationObserver;
            if (MO && target?.nodeType === 1) {
                observer = new MO(() => { lastMutation = Date.now(); });
                observer.observe(target, { childList: true, subtree: true, characterData: true });
            }
        } catch { observer = null; }
        if (!observer) { setTimeout(finish, maxMs); return; }
        interval = setInterval(() => {
            const nowMs = Date.now();
            if (nowMs - lastMutation >= quietMs || nowMs - start >= maxMs) finish();
        }, 50);
    });
}

// ---------- public API ----------

/**
 * Scroll the current page's message container to the top so the whole
 * conversation is present in the DOM. Restores the original scroll position.
 *
 * @param {object} [opts]
 * @param {string[]} [opts.markerSelectors] message-node selectors (defaults)
 * @param {Element} [opts.container] explicit scroll container
 * @param {number} [opts.maxMs] time budget (default 45s)
 * @param {number} [opts.maxSteps] step budget (default 140)
 * @param {Document} [opts.document] document (tests / iframes)
 * @returns {Promise<{ok:boolean, skipped?:boolean, reason?:string, steps?:number, grew?:boolean, count?:number, height?:number, container?:Element}>}
 */
async function loadAllHistory(opts = {}) {
    const doc = opts.document || globalThis.document;
    if (!doc || typeof doc.querySelector !== "function") {
        return { ok: false, reason: "no-document" };
    }

    const selectors = Array.isArray(opts.markerSelectors) && opts.markerSelectors.length
        ? opts.markerSelectors
        : DEFAULT_MARKER_SELECTORS;

    let container = opts.container || null;
    if (!container) {
        const anchor = firstMatch(doc, selectors);
        container = (anchor && scrollableAncestor(anchor)) || bestScrollable(doc, selectors);
    }
    if (!container) return { ok: false, reason: "no-container" };

    const isDoc = container === doc.scrollingElement ||
        container === doc.documentElement ||
        container === doc.body;
    const scrollRoot = isDoc ? (doc.scrollingElement || doc.documentElement) : container;
    const observeTarget = isDoc ? doc.documentElement : container;

    const getTop = () => { try { return scrollRoot.scrollTop || 0; } catch { return 0; } };
    const getHeight = () => { try { return scrollRoot.scrollHeight || 0; } catch { return 0; } };
    const getClientHeight = () => {
        try {
            if (isDoc) return globalThis.innerHeight || scrollRoot.clientHeight || 0;
            return container.clientHeight || 0;
        } catch { return 0; }
    };
    const reversed = !isDoc && isColumnReversed(container);
    const minTop = () => (reversed ? -Math.max(0, getHeight() - getClientHeight()) : 0);
    const setTop = (value) => {
        try {
            if (isDoc && typeof globalThis.scrollTo === "function") globalThis.scrollTo(0, value);
            else scrollRoot.scrollTop = value;
        } catch { /* ignore */ }
    };

    // Nothing hidden above the current view — no walking needed.
    if (getHeight() <= getClientHeight() + 50) {
        return {
            ok: true, skipped: true, reason: "no-hidden-history", container,
            steps: 0, grew: false, count: countMarkers(doc, selectors),
            height: getHeight()
        };
    }

    const savedTop = getTop();
    const count = () => countMarkers(doc, selectors);
    emitProgress("Loading the full chat history…");

    let lastReported = -1;
    const result = await walkToTop({
        getTop, setTop, getHeight, getClientHeight, minTop, count,
        wait: () => waitQuiet(observeTarget, {
            quietMs: Number.isFinite(opts.quietMs) ? opts.quietMs : 240,
            maxMs: Number.isFinite(opts.maxWaitMs) ? opts.maxWaitMs : 1100
        })
    }, {
        maxMs: Number.isFinite(opts.maxMs) ? opts.maxMs : 45000,
        maxSteps: Number.isFinite(opts.maxSteps) ? opts.maxSteps : 140,
        stableRounds: opts.stableRounds,
        onStep: (info) => {
            if (typeof opts.onStep === "function") {
                try { opts.onStep(info); } catch { /* ignore */ }
                return;
            }
            if (info.count !== lastReported && info.count > 0) {
                lastReported = info.count;
                log("info", `walked up ${info.step} steps — ${info.count} messages loaded`, {});
                emitProgress(`Loading the full chat history… ${info.count} messages found`);
            }
        }
    });

    // Let the last batch settle, then put the user back where they were.
    await waitQuiet(observeTarget, { quietMs: 180, maxMs: 600 });
    try {
        const hidden = Math.max(0, getHeight() - getClientHeight());
        const lo = reversed ? -hidden : 0;
        const hi = reversed ? 0 : hidden;
        setTop(Math.min(Math.max(savedTop, lo), hi));
    } catch { /* ignore */ }

    const finalCount = countMarkers(doc, selectors);
    emitProgress(`Full chat history loaded (${finalCount} messages).`);
    log("info", "full history loaded", {
        steps: result.steps, grew: result.grew, count: finalCount,
        height: result.height, skipped: false
    });
    return {
        ok: true, skipped: false, container,
        steps: result.steps, grew: result.grew,
        count: finalCount, height: result.height
    };
}

module.exports = {
    loadAllHistory,
    walkToTop,
    waitQuiet,
    isScrollable,
    scrollableAncestor,
    bestScrollable,
    countMarkers,
    DEFAULT_MARKER_SELECTORS
};
