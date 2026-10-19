"use strict";

// Regression tests for the shared chat-thread reader behind the Context HUD.
// These guard the bugs found in the wild:
//   - nested selectors (turn wrapper + message body) counted every message
//     twice, so the HUD showed 2x the real tokens
//   - only ChatGPT-shaped markup was read; other platforms fell into a text
//     heuristic that dropped short user messages, so the count sat at a tiny
//     number that never moved
//   - a selector list that knows the answers but not the questions produced a
//     confident, far-too-small number instead of an honest estimate

const test = require("node:test");
const assert = require("node:assert");
const { extractChatThread, extractConversationMessages, debugReading, selectorsFor, readText, textLength, textOf, matchPlatform } = require("../core/chat-thread.js");

let order = 0;

const collapse = (value) => String(value).replace(/\s+/g, " ").trim();

// Faithful-enough element double: text always lives in text nodes, innerText
// collapses whitespace like Chrome does, textContent does not.
function node(tag, { text = "", attrs = {}, innerText } = {}) {
    const el = {
        nodeType: 1,
        tagName: String(tag).toUpperCase(),
        _order: order++,
        _attrs: Object.assign({}, attrs),
        _hidden: innerText === "",
        childNodes: [],
        children: [],
        parent: null,
        get innerText() { return el._hidden ? "" : collapse(el.textContent); },
        get id() { return el._attrs.id || ""; },
        get textContent() {
            let out = "";
            for (const child of el.childNodes) out += child.textContent;
            return out;
        },
        getAttribute(name) { return name in el._attrs ? el._attrs[name] : null; },
        setAttribute(name, value) { el._attrs[name] = value; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        contains(other) {
            for (let p = other; p; p = p.parent) if (p === el) return true;
            return false;
        },
        compareDocumentPosition(other) { return el._order < other._order ? 4 : 2; },
        appendChild(child) { child.parent = el; el.childNodes.push(child); el.children.push(child); return child; }
    };
    if (text) el.appendChild(textNode(text));
    return el;
}

function textNode(value) {
    return { nodeType: 3, nodeValue: value, textContent: String(value), parent: null };
}

function installDom({ main, body, selectors = {} } = {}) {
    globalThis.document = {
        querySelector: (selector) => {
            if (selector === "main") return main || null;
            if (selector === "body") return body || main || null;
            return null;
        },
        querySelectorAll: (selector) => selectors[selector] || []
    };
}

const big = (label) => collapse(`${label}: ` + "The migration flow reads the current session, normalises every message and streams it to the destination. ".repeat(2));

// ---------------------------------------------------------------------------
// selector list
// ---------------------------------------------------------------------------

test("selectorsFor puts the platform selectors first and de-duplicates", () => {
    const list = selectorsFor("gemini");
    assert.equal(list[0], "message-content");
    assert.ok(list.includes(".query-content"));
    assert.ok(list.includes("[data-message-author-role]"));
    assert.equal(new Set(list).size, list.length);
    // unknown platform still gets the universal conventions
    assert.deepEqual(selectorsFor("nope").includes("main article"), true);
});

test("every supported host resolves to the context budget the HUD divides by", () => {
    // The usage percentage is tokens / budget. These are the numbers the HUD
    // used to keep in a private table; platforms.js is now the only copy.
    const expected = [
        ["chatgpt", "chatgpt.com", 200000, 2.5],
        ["claude", "claude.ai", 200000, 3.0],
        ["gemini", "gemini.google.com", 1000000, 1.25],
        ["perplexity", "www.perplexity.ai", 127000, 1.0],
        ["copilot", "copilot.microsoft.com", 128000, 2.0],
        ["grok", "grok.com", 131000, 2.0],
        ["deepseek", "chat.deepseek.com", 64000, 0.5],
        ["mistral", "chat.mistral.ai", 32000, 1.0],
        ["poe", "poe.com", 128000, 2.0]
    ];
    for (const [id, host, budget, price] of expected) {
        const match = matchPlatform(host);
        assert.equal(match?.id, id, `${host} should be ${id}`);
        assert.equal(match?.budget, budget, `${id} budget`);
        assert.equal(match?.pricePer1M, price, `${id} price`);
    }
    assert.equal(matchPlatform("example.com"), null);
});

// ---------------------------------------------------------------------------
// selector path
// ---------------------------------------------------------------------------

test("nested turn wrapper + message body counts each message once", () => {
    const users = ["How do I move a chat?", "And the attachments?"];
    const answers = [big("Answer one"), big("Answer two")];

    const body = (i, role, content) => {
        const div = node("div", { attrs: { "data-message-author-role": role, "data-message-id": `msg-${i}` } });
        div.appendChild(textNode(content));
        return div;
    };
    const turn = (i, child) => {
        const section = node("section", { attrs: { "data-testid": `conversation-turn-${i}` } });
        section.appendChild(child);
        return section;
    };

    const bodies = [body(1, "user", users[0]), body(2, "assistant", answers[0]), body(3, "user", users[1]), body(4, "assistant", answers[1])];
    const sections = bodies.map((b, i) => turn(i + 1, b));
    const main = node("main");
    for (const section of sections) main.appendChild(section);

    installDom({
        main,
        selectors: {
            "[data-message-author-role]": bodies,
            '[data-testid^="conversation-turn-"]': sections,
            "[data-message-id]": bodies,
            "main article": []
        }
    });

    const result = extractChatThread("chatgpt");
    assert.equal(result.source, "selectors");
    assert.deepEqual(result.messages.map((m) => m.content), [users[0], answers[0], users[1], answers[1]]);
    assert.deepEqual(result.messages.map((m) => m.role), ["user", "assistant", "user", "assistant"]);
});

test("per-platform selectors read a non-ChatGPT DOM (answers and questions)", () => {
    const question = (raw) => {
        const el = node("div", { attrs: { class: "query-content" } });
        el.appendChild(textNode(raw));
        return el;
    };
    const answer = (raw) => {
        const el = node("message-content", {});
        el.appendChild(textNode(raw));
        return el;
    };
    const q1 = question("Question one, short.");
    const a1 = answer(big("Answer one"));
    const q2 = question("Question two, also short.");
    const a2 = answer(big("Answer two"));

    const main = node("main");
    for (const el of [q1, a1, q2, a2]) main.appendChild(el);

    installDom({
        main,
        selectors: {
            "message-content": [a1, a2],
            ".query-content": [q1, q2],
            "main article": []
        }
    });

    const result = extractChatThread("gemini");
    assert.equal(result.source, "selectors");
    assert.equal(result.messages.length, 4);
    assert.equal(result.messages[0].content, "Question one, short.");
    assert.deepEqual(result.messages.map((m) => m.role), ["user", "assistant", "user", "assistant"]);
});

test("the same long text matched twice is counted once", () => {
    const copy = (attrs) => {
        const el = node("div", { attrs });
        el.appendChild(textNode(big("Repeated")));
        return el;
    };
    const first = copy({ "data-testid": "message" });
    const second = copy({ class: "message-wrapper" });
    const main = node("main");
    main.appendChild(first);
    main.appendChild(second);

    installDom({ main, selectors: { "[data-testid='message']": [first], "main article": [second] } });

    const result = extractChatThread("grok");
    assert.equal(result.messages.length, 1);
});

// ---------------------------------------------------------------------------
// fallbacks
// ---------------------------------------------------------------------------

test("unknown markup falls back to one thread estimate, not to tiny blocks", () => {
    const parts = [big("First"), "short question?", big("Second"), big("Third")];
    const main = node("main");
    for (const part of parts) main.appendChild(node("msg-body", { text: part }));

    installDom({ main, selectors: {} });

    const result = extractChatThread("unknown-site");
    assert.equal(result.source, "thread");
    assert.equal(result.messages.length, 1);
    for (const part of parts) assert.ok(result.messages[0].content.includes(collapse(part)), `missing "${part}"`);
    assert.equal(result.messages[0].fallback, true);
});

test("known markup covering only part of the thread is treated as a thread estimate", () => {
    // gemini-style question markup on the first turn, everything else renamed
    const known = node("div", { attrs: { class: "query-content" } });
    known.appendChild(textNode("Question one, short."));
    const main = node("main");
    main.appendChild(known);
    for (const label of ["Answer one", "Question two", "Answer two"]) {
        main.appendChild(node("msg-body", { text: big(label) }));
    }

    installDom({ main, selectors: { ".query-content": [known] } });

    const result = extractChatThread("gemini");
    assert.equal(result.source, "thread");
    assert.ok(result.messages[0].content.length > 300, `thread text too small: ${result.messages[0].content.length}`);
});

test("a welcome screen is not a conversation", () => {
    const main = node("main");
    main.appendChild(node("div", { text: "What can I help with today? Start a new conversation to see token usage here." }));

    installDom({ main, selectors: {} });

    const result = extractChatThread("chatgpt");
    assert.equal(result.source, "none");
    assert.equal(result.messages.length, 0);
    // the reason is what the HUD logs when it can read nothing
    assert.match(result.reason, /welcome-screen|thread-too-small/);
});

test("no main and no body at all reports no-container", () => {
    installDom({ selectors: {} });

    const result = extractChatThread("chatgpt");
    assert.equal(result.source, "none");
    assert.equal(result.messages.length, 0);
    assert.equal(result.reason, "no-container");
});

test("an inline JSON script blob is never mistaken for the conversation", () => {
    // The page renders without <main> and keeps a large inline state blob in
    // the body — the shape that made the HUD read 0 tokens in the wild.
    const blob = JSON.stringify({ data: "x".repeat(5000) });
    const thread = node("div", { attrs: { id: "thread" } });
    thread.appendChild(node("msg-body", { text: big("First answer") }));
    thread.appendChild(node("msg-body", { text: big("Second answer") }));
    const root = node("div", { attrs: { id: "app-root" } });
    root.appendChild(thread);
    const body = node("body");
    body.appendChild(node("script", { attrs: { type: "application/json" }, text: blob }));
    body.appendChild(root);

    installDom({ body, selectors: {} });

    const result = extractChatThread("chatgpt");
    assert.equal(result.source, "thread");
    assert.equal(result.messages.length, 1);
    assert.ok(!/xxxx/.test(result.messages[0].content), "script text leaked into the count");
    assert.ok(result.messages[0].content.includes(big("Second answer")), "thread text missing");
});

test("a thread dominated by its last answer is still counted whole", () => {
    // The last answer holds ~90% of the thread text. Walking into it would
    // count one message and (with the old block guard) collapse to 0.
    const main = node("main");
    const thread = node("div", { attrs: { id: "thread" } });
    const question = node("msg-body", { text: "And what about attachments?" });
    const answer = node("msg-body", { text: big("First answer") });
    const huge = node("msg-body", { text: collapse("The long answer: " + "Every step of the migration checklist, spelled out in detail. ".repeat(40)) });
    for (const el of [question, answer, huge]) thread.appendChild(el);
    main.appendChild(thread);

    installDom({ main, selectors: {} });

    const result = extractChatThread("unknown-site");
    assert.equal(result.source, "thread");
    assert.ok(result.messages[0].content.includes(big("First answer")), "earlier answer was dropped");
    assert.ok(result.messages[0].content.includes("And what about attachments?"), "the question was dropped");
});

test("a one-message thread with a single paragraph still counts", () => {
    // No block split anywhere: the old blockCount guard rejected this too.
    const main = node("main");
    const thread = node("div");
    const body = node("msg-body", { text: collapse("Answer: " + "One long paragraph without any block split inside it. ".repeat(12)) });
    thread.appendChild(body);
    main.appendChild(thread);

    installDom({ main, selectors: {} });

    const result = extractChatThread("unknown-site");
    assert.equal(result.source, "thread");
    assert.equal(result.messages.length, 1);
    assert.ok(result.messages[0].content.length > 400, `too small: ${result.messages[0].content.length}`);
});

test("chat chrome around the thread is skipped by the estimate", () => {
    const nav = node("nav", { text: big("Sidebar title number one about something else entirely") });
    const thread = node("div");
    thread.appendChild(node("msg-body", { text: big("First") }));
    thread.appendChild(node("msg-body", { text: big("Second") }));
    const main = node("main");
    main.appendChild(nav);
    main.appendChild(thread);

    installDom({ main, selectors: {} });

    const result = extractChatThread("unknown-site");
    assert.equal(result.source, "thread");
    assert.ok(!/Sidebar title/.test(result.messages[0].content), "sidebar leaked into the count");
    assert.ok(result.messages[0].content.includes(big("Second")), "thread text missing");
});

// ---------------------------------------------------------------------------
// text reading
// ---------------------------------------------------------------------------

test("readText falls back to the DOM walk when Chrome reports no innerText", () => {
    const hidden = node("div", { innerText: "" });
    hidden.appendChild(textNode("virtualised turn"));
    hidden.appendChild(node("script", { text: "var leaked = true;" }));

    assert.equal(readText(hidden), "virtualised turn");
});

test("textOf prefers the markdown body over wrapper buttons", () => {
    const wrapper = node("div", { text: "Copy Regenerate" });
    const markdown = node("div", { attrs: { class: "markdown" }, text: "Real answer text." });
    wrapper.querySelector = (selector) => (selector.includes(".markdown") ? markdown : null);

    assert.equal(textOf(wrapper), "Real answer text.");
});

test("a wrapper whose markdown body is still empty keeps its message", () => {
    // Streaming placeholders and lazily filled turns have an empty .markdown;
    // reading only that subtree used to drop the whole message (→ 0 tokens).
    const wrapper = node("div", { attrs: { "data-message-author-role": "user" } });
    const markdown = node("div", { attrs: { class: "markdown" } });
    wrapper.appendChild(textNode("Question typed by the user."));
    wrapper.appendChild(markdown);
    wrapper.querySelector = (selector) => (selector.includes(".markdown") ? markdown : null);

    installDom({ main: node("main"), selectors: { "[data-message-author-role]": [wrapper] } });

    const result = extractChatThread("chatgpt");
    assert.equal(result.source, "selectors");
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].content, "Question typed by the user.");
});

test("debugReading fingerprints an unreadable page for Copy logs", () => {
    const thread = node("div", { attrs: { id: "thread", class: "scroller" } });
    thread.appendChild(node("msg-body", { text: big("First") }));
    thread.appendChild(node("msg-body", { text: big("Second") }));
    const main = node("main");
    main.appendChild(thread);

    installDom({ main, selectors: {} });

    const info = debugReading("chatgpt");
    assert.equal(info.selectors["[data-message-author-role]"], 0);
    assert.equal(info.matched, 0);
    assert.match(info.container, /<div#thread\.scroller>/);
    assert.ok(info.containerChars > 200, `chars=${info.containerChars}`);
    assert.equal(info.containerBlocks, 2);
    assert.equal(info.descended, true);
});

test("readText pierces shadow DOM", () => {
    const host = node("div", { attrs: { id: "shadow-host" } });
    host.childNodes = [];
    const shadowRoot = {
        nodeType: 1,
        tagName: "DIV",
        childNodes: [textNode("shadow message text")],
        children: [],
        shadowRoot: null,
        textContent: "shadow message text",
        getAttribute() { return null; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        contains() { return false; },
        compareDocumentPosition() { return 2; },
        appendChild() { return null; }
    };
    host.shadowRoot = shadowRoot;

    assert.equal(readText(host), "shadow message text");
    assert.ok(textLength(host) > 0, "textLength should pierce shadow DOM");
});

// Backtracking: short messages (<120 chars each) mean looksLikeList never
// fires at the message-list level, so the old walk would descend into a
// single short message and end at a sub-120-char element → 0 tokens.
// The walk must backtrack to the message list and count the whole thread.
test("short messages are backtracked to the message list, not walked into", () => {
    const main = node("main");
    const list = node("div", { attrs: { id: "message-list" } });
    // Each message is short (<120 chars), so no single block triggers
    // looksLikeList, but the whole thread is substantial (>400 chars).
    for (let i = 1; i <= 20; i++) {
        list.appendChild(node("msg-body", { text: `Message ${i}: short turn text here.` }));
    }
    main.appendChild(list);

    installDom({ main, selectors: {} });

    const result = extractChatThread("unknown-site");
    assert.equal(result.source, "thread");
    assert.equal(result.messages.length, 1);
    for (let i = 1; i <= 20; i++) {
        assert.ok(result.messages[0].content.includes(`Message ${i}:`), `missing message ${i}`);
    }
});

// Deep scan: when selectors match nothing and threadContainer finds nothing,
// the deep scan should find the largest text block under body.
test("deep scan finds the conversation when nothing else works", () => {
    // No <main>, no [role=main], just a raw div with conversation text under body.
    const convo = node("div", { attrs: { id: "convo", class: "chat-area" } });
    convo.appendChild(node("msg-body", { text: big("First message") }));
    convo.appendChild(node("msg-body", { text: big("Second message") }));
    const body = node("body");
    body.appendChild(convo);
    // Some page chrome that must not be confused with the conversation.
    body.appendChild(node("nav", { text: big("Sidebar chrome") }));

    installDom({ body, selectors: {} });

    const result = extractChatThread("chatgpt");
    assert.equal(result.source, "thread");
    assert.ok(result.messages[0].content.includes(big("First message")), "conversation text found");
    assert.ok(!/Sidebar chrome/.test(result.messages[0].content), "sidebar not counted");
});

test("a page with no conversation at all still returns none", () => {
    const body = node("body");
    body.appendChild(node("nav", { text: big("Just page chrome") }));
    body.appendChild(node("header", { text: big("More chrome") }));

    installDom({ body, selectors: {} });

    const result = extractChatThread("chatgpt");
    assert.equal(result.source, "none");
    assert.equal(result.messages.length, 0);
});

test("a new-chat welcome screen is not counted as a conversation", () => {
    // ChatGPT's empty chat shows a hero + short feature tiles (~270 chars
    // total — the 67 tokens seen on a blank chat) and no messages at all.
    // That must read as "waiting", not as usage.
    const hero = node("div", { text: "Where should we begin?" });
    const tiles = node("div");
    tiles.appendChild(node("div", { text: "Create an image or sticker Generate images, stickers, and other visuals with DALL·E." }));
    tiles.appendChild(node("div", { text: "Write or edit Draft emails, essays, code, and more — then refine as you go." }));
    tiles.appendChild(node("div", { text: "Search the web Get up-to-date information from across the internet." }));
    const main = node("main");
    main.appendChild(hero);
    main.appendChild(tiles);

    installDom({ main, selectors: {} });

    const result = extractChatThread("chatgpt");
    assert.equal(result.source, "none");
    assert.equal(result.messages.length, 0);
    assert.match(result.reason, /thread-too-small/);
});

test("a ChatGPT new-chat app shell is not counted as conversation context", () => {
    // 2026 app shell: <main> holds the hero while the sidebar/history lives
    // outside it. On "/" there is no conversation, so the estimate/deep-scan
    // must not turn the app shell into phantom tokens (75–1,063 on a blank
    // chat — the bug this guards).
    const hero = node("div", { text: "Hey, omen. Ready to dive in? Create an image or sticker Write or edit Search the web" });
    const main = node("main");
    main.appendChild(hero);
    const shell = node("div");
    for (let i = 0; i < 60; i++) {
        shell.appendChild(node("div", { text: `Conversation ${i}: ${"planning the migration and testing every adapter ".repeat(3)}` }));
    }
    const body = node("body");
    body.appendChild(main);
    body.appendChild(shell);
    installDom({ main, body, selectors: {} });

    const prev = globalThis.location;
    globalThis.location = { pathname: "/" };
    try {
        const result = extractChatThread("chatgpt");
        assert.equal(result.source, "none");
        assert.equal(result.messages.length, 0);
        assert.equal(result.reason, "new-chat");
    } finally {
        if (prev === undefined) delete globalThis.location;
        else globalThis.location = prev;
    }
});

test("an existing ChatGPT conversation still falls back to the thread estimate", () => {
    // The new-chat guard only fires without a /c/<id> URL and without message
    // markup; renamed app-shell conversations must keep working.
    const answer = node("div", { text: `Answer one: ${"The migration flow reads the current session, normalises every message and streams it to the destination. ".repeat(8)}` });
    const main = node("main");
    main.appendChild(answer);
    installDom({ main, selectors: {} });

    const prev = globalThis.location;
    globalThis.location = { pathname: "/c/12345678-1234-1234-1234-123456789abc" };
    try {
        const result = extractChatThread("chatgpt");
        assert.equal(result.source, "thread");
        assert.ok(result.messages[0].content.length > 400);
    } finally {
        if (prev === undefined) delete globalThis.location;
        else globalThis.location = prev;
    }
});

test("ChatGPT 2026 unit-key markup reads user + assistant exactly once", () => {
    // Live 2026 app shell: no data-message-author-role / data-turn at all.
    // Each message is [data-chatgpt-search-unit-key="…:user|assistant"], and
    // the assistant wrapper carries an sr-only "ChatGPT said:" label.
    const user = node("div", {
        attrs: { "data-chatgpt-search-unit-key": "fallback-turn-0:0:user" },
        text: "hello"
    });
    const assistant = node("div", {
        attrs: { "data-chatgpt-search-unit-key": "fallback-turn-0:1:assistant" }
    });
    assistant.appendChild(node("h4", {
        attrs: { class: "sr-only", "data-conversation-role": "assistant" },
        text: "ChatGPT said:"
    }));
    assistant.appendChild(node("div", {
        attrs: { class: "MarkdownRoot" },
        text: "Hey! 👋 What's up? What are we working on today?"
    }));
    const turn = node("div", { attrs: { "data-turn-key": "turn-1" } });
    turn.appendChild(user);
    turn.appendChild(assistant);
    const thread = node("div");
    thread.appendChild(turn);
    const main = node("main");
    main.appendChild(thread);
    const body = node("body");
    body.appendChild(main);
    installDom({ main, body, selectors: { "[data-chatgpt-search-unit-key]": [user, assistant] } });

    const prev = globalThis.location;
    globalThis.location = { pathname: "/c/12345678-1234-1234-1234-123456789abc" };
    try {
        const result = extractChatThread("chatgpt");
        assert.equal(result.source, "selectors");
        assert.equal(result.messages.length, 2);
        assert.deepEqual(result.messages.map((message) => message.role), ["user", "assistant"]);
        assert.equal(result.messages[0].content, "hello");
        assert.ok(!/said:/i.test(result.messages[1].content), result.messages[1].content);
        assert.ok(result.messages[1].content.startsWith("Hey!"), result.messages[1].content);
        const chars = result.messages.reduce((total, message) => total + message.content.length, 0);
        assert.ok(chars < 100, `read as ${chars} chars`);
    } finally {
        if (prev === undefined) delete globalThis.location;
        else globalThis.location = prev;
    }
});

test("hidden messages from the previous chat are not counted after SPA navigation", () => {
    // ChatGPT's 2026 shell leaves the old workspace mounted in a hidden div
    // while the next chat renders. querySelectorAll still sees its wrappers,
    // which made the HUD jump from 16 to the previous chat's 265 tokens after
    // switching away and back. Only rendered units belong to this chat.
    const user = node("div", {
        attrs: { "data-chatgpt-search-unit-key": "fallback-turn-0:0:user" },
        text: "hello"
    });
    const assistant = node("div", {
        attrs: { "data-chatgpt-search-unit-key": "fallback-turn-0:1:assistant" }
    });
    assistant.appendChild(node("h4", {
        attrs: { class: "sr-only", "data-conversation-role": "assistant" },
        text: "ChatGPT said:"
    }));
    assistant.appendChild(node("div", {
        attrs: { class: "MarkdownRoot" },
        text: "Hey! 👋 What's up? What are we working on today?"
    }));
    const visibleTurn = node("div", { attrs: { "data-turn-key": "turn-visible" } });
    visibleTurn.appendChild(user);
    visibleTurn.appendChild(assistant);
    const visibleThread = node("div");
    visibleThread.appendChild(visibleTurn);

    const staleWorkspace = node("div", { attrs: { hidden: "", "aria-hidden": "true" } });
    const staleUser = node("div", {
        attrs: { "data-chatgpt-search-unit-key": "fallback-turn-0:0:user" },
        text: "fix the context of gpt it gets stuck on 2368 despite refreshing"
    });
    const staleAssistant = node("div", {
        attrs: { "data-chatgpt-search-unit-key": "fallback-turn-0:1:assistant" },
        text: "ChatGPT said: The HUD is reading the app shell instead of the thread."
    });
    const staleTurn = node("div", { attrs: { "data-turn-key": "turn-stale" } });
    staleTurn.appendChild(staleUser);
    staleTurn.appendChild(staleAssistant);
    staleWorkspace.appendChild(staleTurn);

    const body = node("body");
    body.appendChild(visibleThread);
    body.appendChild(staleWorkspace);
    installDom({
        body,
        selectors: { "[data-chatgpt-search-unit-key]": [user, assistant, staleUser, staleAssistant] }
    });

    const prev = globalThis.location;
    globalThis.location = { pathname: "/c/12345678-1234-1234-1234-123456789abc" };
    try {
        const result = extractChatThread("chatgpt");
        assert.equal(result.source, "selectors");
        assert.equal(result.messages.length, 2);
        assert.deepEqual(result.messages.map((message) => message.role), ["user", "assistant"]);
        assert.equal(result.messages[0].content, "hello");
        assert.ok(!/fix the context/i.test(result.messages[1].content), result.messages[1].content);
        const chars = result.messages.reduce((total, message) => total + message.content.length, 0);
        assert.ok(chars < 100, `stale hidden chat read as ${chars} chars`);
    } finally {
        if (prev === undefined) delete globalThis.location;
        else globalThis.location = prev;
    }
});

test("a short ChatGPT conversation is not replaced by the sidebar estimate", () => {
    // The 2026 app shell keeps the chat history outside the thread. A
    // two-message "hello" chat must stay ~10-20 tokens; threadContainer() used
    // to pick the sidebar and replace it with ~1,174 tokens / 1% on screen.
    const user = node("div", { attrs: { "data-message-author-role": "user" }, text: "hello" });
    const assistant = node("div", { attrs: { "data-message-author-role": "assistant" }, text: "Hey! 👋 What's up? What are we working on today?" });
    const thread = node("div");
    thread.appendChild(user);
    thread.appendChild(assistant);
    const sidebar = node("div");
    for (let i = 0; i < 60; i++) {
        sidebar.appendChild(node("div", { text: `Conversation ${i}: ${"planning the migration and testing every adapter ".repeat(3)}` }));
    }
    const body = node("body");
    body.appendChild(sidebar);
    body.appendChild(thread);
    installDom({ body, selectors: { "[data-message-author-role]": [user, assistant] } });

    const prev = globalThis.location;
    globalThis.location = { pathname: "/c/12345678-1234-1234-1234-123456789abc" };
    try {
        const result = extractChatThread("chatgpt");
        assert.equal(result.source, "selectors");
        assert.equal(result.messages.length, 2);
        const chars = result.messages.reduce((total, message) => total + message.content.length, 0);
        assert.ok(chars < 100, `short chat read as ${chars} chars`);
    } finally {
        if (prev === undefined) delete globalThis.location;
        else globalThis.location = prev;
    }
});

// ---------------------------------------------------------------------------
// bridge conversation (whole chat, not just what the DOM mounts)
// ---------------------------------------------------------------------------

test("the bridge conversation is read whole, in order, and without dead branches", () => {
    const data = {
        mapping: {
            root: { id: "root", parent: null, message: null },
            a: { id: "a", parent: "root", message: { author: { role: "user" }, content: { parts: ["How do I migrate?"] } } },
            b: { id: "b", parent: "a", message: { author: { role: "assistant" }, content: { parts: [big("Answer one")] } } },
            c: { id: "c", parent: "b", message: { author: { role: "user" }, content: { parts: ["And the attachments?"] } } },
            x: { id: "x", parent: "b", message: { author: { role: "assistant" }, content: { parts: ["A regenerated answer that is no longer in the thread"] } } }
        },
        current_node: "c"
    };

    const messages = extractConversationMessages(data);
    assert.deepEqual(messages.map((m) => m.role), ["user", "assistant", "user"]);
    assert.equal(messages[0].content, "How do I migrate?");
    assert.ok(messages[1].content.includes(big("Answer one")));
    assert.ok(!messages.some((m) => /regenerated/.test(m.content)), "dead branch leaked into the count");
});

test("a plain messages[] payload parses too, and anything else yields null", () => {
    const payload = {
        data: {
            messages: [
                { author: { role: "user" }, content: { parts: ["Question one, long enough"] } },
                { author: { role: "assistant" }, content: { parts: ["Answer", "with a second part"] } },
                { author: { role: "tool" }, content: { parts: ["tool noise is not conversation"] } }
            ]
        }
    };

    const messages = extractConversationMessages(payload);
    assert.deepEqual(messages.map((m) => m.role), ["user", "assistant"]);
    assert.equal(messages[1].content, "Answer\nwith a second part");

    assert.equal(extractConversationMessages({}), null);
    assert.equal(extractConversationMessages(null), null);
    assert.equal(extractConversationMessages({ mapping: {} }), null);
});
