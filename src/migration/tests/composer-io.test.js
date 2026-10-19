"use strict";

// Regression tests for the shared composer writer.
// These guard the Gemini <rich-textarea> freeze bug:
//   - never dispatch a synthetic `beforeinput` (breaks Angular editors)
//   - never double-apply by dispatching `input` after execCommand succeeded
//   - unwrap a custom host (rich-textarea) to its inner contenteditable

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

class FakeElement {
    constructor(tag, opts = {}) {
        this.nodeType = 1;
        this.tagName = String(tag).toUpperCase();
        this._attrs = Object.assign({}, opts.attributes);
        this._contentEditable = !!opts.contentEditable;
        this._text = opts.text || "";
        this.className = opts.className || "";
        this.rect = opts.rect || { width: 0, height: 0, bottom: -1, top: 9999 };
        this.shadowRoot = opts.shadowRoot || null;
        this.events = [];
        this.classList = { contains: (c) => String(this.className).split(/\s+/).includes(c) };
    }
    get isContentEditable() { return this._contentEditable; }
    getAttribute(name) { return name in this._attrs ? this._attrs[name] : null; }
    setAttribute(name, value) { this._attrs[name] = value; }
    getBoundingClientRect() { return this.rect; }
    focus() { globalThis.__focused = this; }
    dispatchEvent(event) { this.events.push(event); return true; }
    get innerText() { return this._text; }
    set innerText(v) { this._text = String(v); }
    get textContent() { return this._text; }
    set textContent(v) { this._text = String(v); }
    querySelector() { return null; }
    querySelectorAll() { return []; }
}

function installDom({ querySelector, querySelectorAll } = {}) {
    globalThis.innerHeight = 800;
    globalThis.window = {
        getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
        IKO: undefined
    };
    globalThis.document = {
        createRange: () => ({ selectNodeContents() {}, collapse() {} }),
        execCommand: () => false,
        querySelector: querySelector || (() => null),
        querySelectorAll: querySelectorAll || (() => [])
    };
    globalThis.InputEvent = class InputEvent {
        constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
    };
    globalThis.Event = class Event {
        constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
    };
    globalThis.HTMLTextAreaElement = { prototype: {} };
    globalThis.HTMLInputElement = { prototype: {} };
}

installDom();
const composer = require(path.join(__dirname, "..", "..", "content", "composer-io.js"));

test("resolveEditable unwraps a rich-textarea shadow host to the inner editable", () => {
    const inner = new FakeElement("div", { contentEditable: true });
    const host = new FakeElement("rich-textarea", {
        shadowRoot: { querySelector: (s) => (s.includes("contenteditable") ? inner : null) }
    });
    assert.strictEqual(composer.resolveEditable(host), inner);
});

test("resolveEditable keeps a plain contenteditable (ProseMirror)", () => {
    const pm = new FakeElement("div", { contentEditable: true, className: "ProseMirror" });
    assert.strictEqual(composer.resolveEditable(pm), pm);
});

test("writeComposerText replaces via execCommand without synthetic beforeinput or double input", () => {
    const el = new FakeElement("div", { contentEditable: true });
    globalThis.__focused = null;
    globalThis.document.execCommand = (cmd, _ui, text) => {
        if (cmd === "insertText" && globalThis.__focused) { globalThis.__focused._text = text; return true; }
        return false;
    };
    const ok = composer.writeComposerText(el, "hello world");
    assert.strictEqual(ok, true);
    assert.strictEqual(el.textContent, "hello world");
    const types = el.events.map(e => e.type);
    assert.ok(!types.includes("beforeinput"), "must never dispatch synthetic beforeinput");
    assert.strictEqual(types.filter(t => t === "input").length, 0, "execCommand already fired native input");
});

test("writeComposerText falls back to textContent + one composed input when execCommand fails", () => {
    const el = new FakeElement("div", { contentEditable: true });
    globalThis.document.execCommand = () => false;
    const ok = composer.writeComposerText(el, "fallback text");
    assert.strictEqual(ok, true);
    assert.strictEqual(el.textContent, "fallback text");
    const inputs = el.events.filter(e => e.type === "input");
    assert.strictEqual(inputs.length, 1);
    assert.strictEqual(inputs[0].composed, true);
    assert.strictEqual(inputs[0].bubbles, true);
    assert.ok(!el.events.some(e => e.type === "beforeinput"));
});

test("findComposer resolves rich-textarea to its inner contenteditable, not the host", () => {
    const inner = new FakeElement("div", {
        contentEditable: true,
        rect: { width: 500, height: 60, bottom: 700, top: 640 }
    });
    const host = new FakeElement("rich-textarea", {
        rect: { width: 600, height: 80, bottom: 720, top: 640 },
        shadowRoot: { querySelector: (s) => (s.includes("contenteditable") ? inner : null) }
    });
    installDom({
        querySelectorAll: (sel) => {
            if (sel === "rich-textarea") return [host];
            if (sel === "[contenteditable='true']" || sel === "rich-textarea [contenteditable='true']") return [inner];
            return [];
        },
        querySelector: () => null
    });
    const found = composer.findComposer();
    assert.strictEqual(found, inner);
});
