"use strict";

// Regression tests for the full-history walk.
// These guard the "only the last visible messages migrate" bug: chat sites
// lazy-load older turns while scrolling up, so extraction must walk the
// container to the top (and wait for lazy batches) before reading the DOM.

const test = require("node:test");
const assert = require("node:assert");
const { walkToTop, loadAllHistory, bestScrollable, scrollableAncestor } = require("../core/full-history.js");

// Stub scroll container: `loaded` newest turns exist, older batches appear
// while the viewport is near the top (anchored: scroll position shifts by the
// inserted height, like a real prepend).
function makeLazyIo({ totalTurns, visibleTurns, clientHeight, pxPerTurn = 100, batch = 5 }) {
    let loaded = visibleTurns;
    const height = () => loaded * pxPerTurn;
    let top = Math.max(0, height() - clientHeight);
    return {
        getTop: () => top,
        setTop: (v) => { top = Math.min(Math.max(v, 0), Math.max(0, height() - clientHeight)); },
        getHeight: height,
        getClientHeight: () => clientHeight,
        minTop: () => 0,
        count: () => loaded,
        wait: async () => {
            if (top <= 200 && loaded < totalTurns) {
                const inserted = Math.min(batch, totalTurns - loaded) * pxPerTurn;
                loaded = Math.min(totalTurns, loaded + batch);
                top = Math.min(top + inserted, Math.max(0, height() - clientHeight));
            }
        }
    };
}

// column-reverse variant: 0 is the bottom, negative values go toward the top.
function makeReversedLazyIo({ totalTurns, visibleTurns, clientHeight, pxPerTurn = 100, batch = 5 }) {
    let loaded = visibleTurns;
    const height = () => loaded * pxPerTurn;
    const minTop = () => -Math.max(0, height() - clientHeight);
    let top = 0;
    return {
        getTop: () => top,
        setTop: (v) => { top = Math.max(minTop(), Math.min(0, v)); },
        getHeight: height,
        getClientHeight: () => clientHeight,
        minTop,
        count: () => loaded,
        wait: async () => {
            if (top <= minTop() + 200 && loaded < totalTurns) {
                const inserted = Math.min(batch, totalTurns - loaded) * pxPerTurn;
                loaded = Math.min(totalTurns, loaded + batch);
                top = Math.max(minTop(), top - inserted);
            }
        }
    };
}

test("walkToTop loads the entire lazy history (not just the visible tail)", async () => {
    const io = makeLazyIo({ totalTurns: 60, visibleTurns: 8, clientHeight: 600 });
    const res = await walkToTop(io, {});
    assert.equal(res.count, 60, "all 60 turns should be loaded");
    assert.equal(res.grew, true, "lazy loading should have been observed");
    assert.equal(io.getTop(), 0, "walk should end at the top of the thread");
    assert.ok(res.steps < 40, `walk should finish in a bounded number of steps (got ${res.steps})`);
});

test("walkToTop stops quickly when nothing more is hidden", async () => {
    const io = makeLazyIo({ totalTurns: 8, visibleTurns: 8, clientHeight: 600 });
    const res = await walkToTop(io, {});
    assert.equal(res.count, 8);
    assert.equal(res.grew, false);
    assert.equal(res.steps, 3, "three stable rounds at the top then stop");
});

test("walkToTop respects the time budget", async () => {
    const io = makeLazyIo({ totalTurns: 60, visibleTurns: 8, clientHeight: 600 });
    let fake = 0;
    const res = await walkToTop(io, { maxMs: 5000, now: () => (fake += 2000) });
    assert.equal(res.steps, 2, "budget exhausted after two steps");
    assert.ok(res.count < 60, "walk stopped before loading everything");
});

test("walkToTop supports column-reverse containers (negative scroll range)", async () => {
    const io = makeReversedLazyIo({ totalTurns: 60, visibleTurns: 8, clientHeight: 600 });
    const res = await walkToTop(io, {});
    assert.equal(res.count, 60, "all turns loaded in reversed container");
    assert.equal(res.grew, true);
    assert.equal(io.getTop(), io.minTop(), "walk ends at the reversed top edge");
});

test("loadAllHistory is a no-op without a document", async () => {
    const res = await loadAllHistory();
    assert.equal(res.ok, false);
    assert.equal(res.reason, "no-document");
});

function makeEl({ scrollHeight = 0, clientHeight = 0, marker = null } = {}) {
    return {
        nodeType: 1,
        scrollHeight,
        clientHeight,
        parentElement: null,
        querySelector: () => marker,
        querySelectorAll: () => []
    };
}

test("bestScrollable prefers the scroller containing message nodes over a bigger sidebar", () => {
    const markerEl = { nodeType: 1 };
    const sidebar = makeEl({ scrollHeight: 2000, clientHeight: 400 });
    const chat = makeEl({ scrollHeight: 1000, clientHeight: 400, marker: markerEl });
    const root = {
        nodeType: 1,
        querySelector: () => null,
        querySelectorAll: () => [sidebar, chat]
    };
    const doc = {
        querySelector: (sel) => (sel === "main" ? root : null),
        body: root,
        scrollingElement: null,
        documentElement: null
    };

    const prevGCS = globalThis.getComputedStyle;
    globalThis.getComputedStyle = () => ({ overflowY: "auto" });
    try {
        assert.equal(bestScrollable(doc, ["[data-message-author-role]"]), chat);
        assert.equal(bestScrollable(doc, []), sidebar, "without markers the largest scroller wins");
    } finally {
        if (prevGCS === undefined) delete globalThis.getComputedStyle;
        else globalThis.getComputedStyle = prevGCS;
    }
});

test("scrollableAncestor crosses shadow-DOM boundaries", () => {
    const host = makeEl({ scrollHeight: 2000, clientHeight: 400 });
    host.getRootNode = () => ({ host: null });
    const inner = {
        nodeType: 1,
        parentElement: null,
        getRootNode: () => ({ host })
    };

    const prevGCS = globalThis.getComputedStyle;
    globalThis.getComputedStyle = () => ({ overflowY: "auto" });
    try {
        assert.equal(scrollableAncestor(inner), host);
    } finally {
        if (prevGCS === undefined) delete globalThis.getComputedStyle;
        else globalThis.getComputedStyle = prevGCS;
    }
});
