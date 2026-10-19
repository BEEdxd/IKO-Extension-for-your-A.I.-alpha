"use strict";

// Regression tests for the ChatGPT source adapter (migration "Prepare") on the
// 2026 app-shell DOM:
//   - <main> holds the shell (titlebar, composer, chrome) while the thread
//     text is hidden from innerText (content-visibility), and every message
//     attribute has been renamed (no data-message-author-role, no
//     conversation-turn testids).
//   - The reported failure: the selector pass found nothing, the leaf-block
//     pass read only innerText (empty), and Prepare threw
//     "No visible ChatGPT messages were found".
// The adapter now falls back to the shared chat-thread reader the HUD uses,
// and its direct API fetch asks for the whole thread (?num_turns=1000).
// The bridge payload is also refused when it belongs to another conversation.

const test = require("node:test");
const assert = require("node:assert/strict");
const { ChatGPTSourceAdapter } = require("../adapters/chatgpt-source-adapter.js");

// --- tiny DOM double (this project does not use jsdom) ------------------------

let order = 0;

class FakeHTMLElement {}

function makeEl(tag, { text = "", attrs = {}, innerText, children = [] } = {}) {
    const el = new FakeHTMLElement();
    el.nodeType = 1;
    el.tagName = tag.toUpperCase();
    el.parentElement = null;
    el.childNodes = [];
    el._attrs = { ...attrs };
    el._innerText = innerText !== undefined ? innerText : (text || "");
    el._order = order++;
    if (text) el.childNodes.push({ nodeType: 3, nodeValue: text, parentElement: el });
    for (const child of children) append(el, child);
    return el;
}

function append(parent, child) {
    child.parentElement = parent;
    parent.childNodes.push(child);
    return child;
}

Object.defineProperties(FakeHTMLElement.prototype, {
    children: {
        get() { return this.childNodes.filter(node => node.nodeType === 1); }
    },
    innerText: {
        get() { return this._innerText; },
        set(value) { this._innerText = value; }
    },
    textContent: {
        get() {
            let out = "";
            const walk = (node) => {
                for (const child of node.childNodes || []) {
                    if (child.nodeType === 3) out += String(child.nodeValue || "");
                    else walk(child);
                }
            };
            walk(this);
            return out;
        }
    },
    innerHTML: { get() { return ""; } },
    attributes: {
        get() {
            return Object.entries(this._attrs).map(([name, value]) => ({ name, value: String(value) }));
        }
    }
});

FakeHTMLElement.prototype.getAttribute = function (name) {
    const value = this._attrs[name];
    return value === undefined ? null : String(value);
};
FakeHTMLElement.prototype.hasAttribute = function (name) {
    return name in this._attrs;
};
FakeHTMLElement.prototype.contains = function (other) {
    for (let node = other; node; node = node.parentElement) if (node === this) return true;
    return false;
};
FakeHTMLElement.prototype.compareDocumentPosition = function (other) {
    return this._order <= other._order ? 4 : 2; // FOLLOWING : PRECEDING
};
FakeHTMLElement.prototype.querySelector = function (selector) {
    return this.querySelectorAll(selector)[0] || null;
};
FakeHTMLElement.prototype.querySelectorAll = function (selector) {
    const out = [];
    const walk = (node) => {
        for (const child of node.childNodes || []) {
            if (child.nodeType !== 1) continue;
            if (matchesSelector(child, selector)) out.push(child);
            walk(child);
        }
    };
    walk(this);
    return out;
};

// Selectors used by the adapter, the shared reader and full-history: tags, *,
// #id, .class, [attr], [attr='v'], [attr^='v'], comma lists, descendants.
function matchesSimple(el, part) {
    const tokens = part.match(/\[[^\]]*\]|[.#]?[\w-]+|\*/g) || [];
    for (const token of tokens) {
        if (token === "*") continue;
        if (token.startsWith("#")) {
            if (el.getAttribute("id") !== token.slice(1)) return false;
            continue;
        }
        if (token.startsWith(".")) {
            const classes = (el.getAttribute("class") || "").split(/\s+/);
            if (!classes.includes(token.slice(1))) return false;
            continue;
        }
        if (token.startsWith("[")) {
            const parsed = token.slice(1, -1).match(/^([\w-]+)(?:([\^$*]?=)\s*(.*?))?$/);
            if (!parsed) return false;
            const value = (parsed[3] || "").replace(/^['"]|['"]$/g, "");
            const attr = el.getAttribute(parsed[1]);
            if (attr === null) return false;
            if (parsed[2] === undefined) continue;
            if (parsed[2] === "=" && attr !== value) return false;
            if (parsed[2] === "^=" && !attr.startsWith(value)) return false;
            if (parsed[2] === "$=" && !attr.endsWith(value)) return false;
            if (parsed[2] === "*=" && !attr.includes(value)) return false;
            continue;
        }
        if (el.tagName !== token.toUpperCase()) return false;
    }
    return true;
}

function matchesSelector(el, selector) {
    for (const alternative of String(selector || "").split(",")) {
        const parts = alternative.trim().split(/\s+/).filter(Boolean);
        if (!parts.length) continue;
        if (!matchesSimple(el, parts[parts.length - 1])) continue;
        let ancestor = el.parentElement;
        let index = parts.length - 2;
        while (index >= 0) {
            if (!ancestor) break;
            if (matchesSimple(ancestor, parts[index])) index -= 1;
            ancestor = ancestor.parentElement;
        }
        if (index < 0) return true;
    }
    return false;
}

function makeDocument(roots, body) {
    return {
        _roots: roots,
        body,
        title: "ChatGPT",
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
        querySelectorAll(selector) {
            const out = [];
            const walk = (node) => {
                for (const child of node.childNodes || []) {
                    if (child.nodeType !== 1) continue;
                    if (matchesSelector(child, selector)) out.push(child);
                    walk(child);
                }
            };
            for (const root of this._roots) {
                if (matchesSelector(root, selector)) out.push(root);
                walk(root);
            }
            return out;
        },
        createTreeWalker(root, _what, filter) {
            const list = [];
            const walk = (node) => {
                for (const child of node.childNodes || []) {
                    if (child.nodeType !== 1) continue;
                    const verdict = filter?.acceptNode ? filter.acceptNode(child) : 1;
                    if (verdict === 1) list.push(child);
                    walk(child);
                }
            };
            walk(root);
            let index = -1;
            return {
                get currentNode() { return list[index]; },
                nextNode() { index += 1; return index < list.length ? list[index] : null; }
            };
        }
    };
}

// --- fixtures -----------------------------------------------------------------

const LONG_USER = "How do I reverse a linked list without extra memory? ".repeat(6);
const LONG_ANSWER = "Walk the list with three pointers and flip each next pointer. ".repeat(7);

// The reported DOM: <main> is the app shell, the conversation sits in a nested
// container whose text never reaches innerText, and message markup is renamed.
function appShellDom() {
    const turn = (text, marker) => {
        const el = makeEl("div", { attrs: { "data-foo-turn": marker }, innerText: "" });
        // content-visibility: the text is in the DOM but innerText never sees it.
        append(el, makeEl("div", { text, innerText: "" }));
        return el;
    };
    const thread = makeEl("div", {
        attrs: { "data-app-shell-main-content-layout": "" },
        innerText: "",
        children: [turn(LONG_USER, "1"), turn(LONG_ANSWER, "2"), turn(LONG_USER + "And iteratively?", "3")]
    });
    const titlebar = makeEl("div", { attrs: { "data-app-shell-main-titlebar": "" }, text: "ChatGPT", innerText: "ChatGPT" });
    const composer = makeEl("div", { attrs: { "data-composer-placement": "" }, text: "Ask anything", innerText: "Ask anything" });
    return makeEl("main", { innerText: "", children: [titlebar, thread, composer] });
}

// A brand-new chat: only the composer text exists, well below every threshold.
function emptyShellDom() {
    const composer = makeEl("div", {
        attrs: { "data-composer-placement": "" },
        text: "Ask anything about your data",
        innerText: "Ask anything about your data"
    });
    return makeEl("main", { innerText: "Ask anything about your data", children: [composer] });
}

function buildBridgePayload() {
    return {
        conversation_id: "newappshell1234",
        current_node: "assistant-1",
        mapping: {
            "user-1": {
                id: "user-1", parent: null,
                message: { id: "user-1", author: { role: "user" }, content: { content_type: "text", parts: ["From the API: the original question"] } }
            },
            "assistant-1": {
                id: "assistant-1", parent: "user-1",
                message: { id: "assistant-1", author: { role: "assistant" }, content: { content_type: "text", parts: ["From the API: the full answer"] } }
            }
        }
    };
}

// --- environment install/restore ----------------------------------------------

const silentLogger = { info() {}, warn() {}, error() {}, debug() {}, diagnostics() { return {}; } };

function install(main, bridge) {
    const body = makeEl("body", { innerText: "" });
    append(body, main);
    const saved = {
        document: globalThis.document,
        window: globalThis.window,
        location: globalThis.location,
        fetch: globalThis.fetch,
        HTMLElement: globalThis.HTMLElement,
        NodeFilter: globalThis.NodeFilter,
        Node: globalThis.Node
    };
    globalThis.document = makeDocument([body], body);
    globalThis.window = {
        IKO: {
            logger: silentLogger,
            chatgptBridge: bridge || { latestConversation: null, latestValidConversation: null, latestValidMessages: 0 }
        }
    };
    globalThis.location = { href: "http://app.local/c/newappshell1234", pathname: "/c/newappshell1234" };
    globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
    globalThis.HTMLElement = FakeHTMLElement;
    globalThis.NodeFilter = { SHOW_ELEMENT: 1, FILTER_SKIP: 2, FILTER_ACCEPT: 1 };
    globalThis.Node = { DOCUMENT_POSITION_FOLLOWING: 4 };
    return saved;
}

function restore(saved) {
    for (const key of Object.keys(saved)) {
        if (saved[key] === undefined) delete globalThis[key];
        else globalThis[key] = saved[key];
    }
}

async function withDom(main, bridge, fn) {
    const saved = install(main, bridge);
    try { return await fn(); } finally { restore(saved); }
}

// --- tests --------------------------------------------------------------------

test("app-shell DOM with renamed markup prepares via the shared reader", async () => {
    await withDom(appShellDom(), null, async () => {
        const session = await new ChatGPTSourceAdapter().extractSession();
        assert.equal(session.platform, "chatgpt");
        assert.equal(session.conversationId, "newappshell1234");
        assert.ok(session.messages.length >= 1, "the reader should yield at least one message");
        assert.ok(
            session.messages.some(message => message.content.includes("reverse a linked list")),
            "the conversation text should be present"
        );
        assert.ok(
            session.messages[0].raw.strategy.startsWith("thread-reader:"),
            "the message should carry the shared-reader strategy"
        );
    });
});

test("empty app-shell names the reader reason in the fingerprint error", async () => {
    await withDom(emptyShellDom(), null, async () => {
        await assert.rejects(
            () => new ChatGPTSourceAdapter().extractSession(),
            (error) => {
                assert.match(String(error.message), /No visible ChatGPT messages were found/);
                assert.match(String(error.message), /finger: main=true/);
                assert.match(String(error.message), /reader: none\/thread-too-small\(\d+\)/);
                return true;
            }
        );
    });
});

test("a valid bridge payload for this conversation is preferred over the DOM estimate", async () => {
    const bridge = {
        latestConversation: null,
        latestValidConversation: buildBridgePayload(),
        latestValidMessages: 2
    };
    await withDom(appShellDom(), bridge, async () => {
        const session = await new ChatGPTSourceAdapter().extractSession();
        assert.equal(session.extractorVersion, "iko-chatgpt-api-1");
        assert.equal(session.messages.length, 2);
        assert.match(session.messages[1].content, /From the API/);
    });
});

test("a bridge payload for a different conversation is not migrated", async () => {
    const payload = buildBridgePayload();
    payload.conversation_id = "someotherchat9999";
    const bridge = {
        latestConversation: null,
        latestValidConversation: payload,
        latestValidMessages: 2
    };
    await withDom(appShellDom(), bridge, async () => {
        const session = await new ChatGPTSourceAdapter().extractSession();
        assert.notEqual(session.extractorVersion, "iko-chatgpt-api-1");
        assert.ok(
            !session.messages.some(message => /From the API/.test(message.content)),
            "another conversation's payload must not be migrated"
        );
    });
});
