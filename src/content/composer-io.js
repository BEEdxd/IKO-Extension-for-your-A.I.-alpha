"use strict";

/*
 * composer-io.js — one safe, framework-aware composer writer used by both
 * the migrator and the prompt optimizer.
 *
 * Why this module exists:
 *   Rich editors (Gemini <rich-textarea>, Claude ProseMirror, ChatGPT
 *   #prompt-textarea) keep their own internal model. Writing the DOM directly
 *   (innerHTML/textContent) desyncs that model, and dispatching a *synthetic*
 *   `beforeinput` makes the editor re-apply the text (or throw inside its own
 *   handler), which leaves the chat box stuck / unresponsive.
 *
 *   The safe sequence is:
 *     1. resolve the real editable node (unwrap custom hosts like rich-textarea)
 *     2. focus it and select the existing content
 *     3. replace via the browser's native editing pipeline (execCommand
 *        `insertText`), which fires the correct beforeinput/input events itself
 *     4. only if that did not take, set the text directly and emit ONE
 *        composed `input` event — never a manual `beforeinput`
 */

function isEditable(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") return true;
    if (el.isContentEditable === true) return true;
    try {
        return el.getAttribute?.("contenteditable") === "true" ||
            el.getAttribute?.("contenteditable") === "";
    } catch { return false; }
}

// Resolve a possibly-custom element (e.g. Gemini <rich-textarea>) to the real
// editable node that lives in its shadow root / descendants.
function resolveEditable(el) {
    if (!el || el.nodeType !== 1) return el;
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return el;
    if (isEditable(el) && el.tagName !== "RICH-TEXTAREA") return el;

    const findInner = (root) => {
        try {
            return root.querySelector?.(
                "[contenteditable='true'], div[role='textbox'], [role='textbox'], textarea"
            ) || null;
        } catch { return null; }
    };

    // Gemini puts the editable inside the rich-textarea shadow root.
    if (el.shadowRoot) {
        const inner = findInner(el.shadowRoot);
        if (inner && isEditable(inner)) return inner;
    }
    const lightInner = findInner(el);
    if (lightInner && isEditable(lightInner)) return lightInner;

    return isEditable(el) ? el : el;
}

function deepQueryAll(selector) {
    const out = [];
    const seen = new Set();
    const pushAll = (root) => {
        try {
            for (const n of root.querySelectorAll(selector)) {
                if (!seen.has(n)) { seen.add(n); out.push(n); }
            }
        } catch { /* bad selector for this root */ }
        try {
            for (const n of root.querySelectorAll("*")) {
                if (n.shadowRoot) pushAll(n.shadowRoot);
                if (out.length > 200) break;
            }
        } catch { /* ignore */ }
    };
    pushAll(document);
    return out;
}

function findComposer() {
    const selectors = [
        "#prompt-textarea",
        "[data-testid='chat-input']",
        ".ProseMirror",
        "div.ProseMirror[contenteditable='true']",
        "rich-textarea",
        "rich-textarea [contenteditable='true']",
        "[aria-label*='prompt' i]",
        "[aria-label*='Ask' i]",
        "[placeholder*='Ask' i]",
        ".ql-editor[contenteditable='true']",
        "div[role='textbox']",
        "fieldset [contenteditable='true']",
        "form textarea",
        "form [contenteditable='true']",
        "form [role='textbox']",
        "textarea",
        "[contenteditable='true']",
        "[role='textbox']"
    ];
    const candidates = [];
    const add = (element, editable, bottom, area, selector) => {
        if (!element) return;
        candidates.push({ element, editable: !!editable, bottom, area, selector });
    };

    for (const selector of selectors) {
        try {
            deepQueryAll(selector).forEach(element => {
                const resolved = resolveEditable(element) || element;
                let rect;
                try { rect = resolved.getBoundingClientRect(); } catch { rect = null; }
                rect = rect || { width: 0, height: 0, bottom: -1, top: 9999 };
                const editable = isEditable(resolved);
                const visible = rect.width > 180 && rect.height > 18 && rect.bottom > 0 && rect.top < innerHeight;

                if (visible && editable) {
                    add(resolved, true, rect.bottom, rect.width * rect.height, selector);
                } else if (element.tagName === "RICH-TEXTAREA") {
                    // Shadow host may report a zero rect in some builds — keep the inner editable.
                    const inner = element.shadowRoot?.querySelector?.("[contenteditable='true']") ||
                        element.querySelector?.("[contenteditable='true']");
                    if (inner && isEditable(inner)) {
                        let r2;
                        try { r2 = inner.getBoundingClientRect(); } catch { r2 = null; }
                        r2 = r2 || { width: 300, height: 50, bottom: innerHeight - 100 };
                        add(inner, true, r2.bottom || (innerHeight - 100), r2.width * r2.height || 50000, selector + "::shadow");
                    }
                }
            });
        } catch { /* bad selector */ }
    }

    // Last resort on Gemini: the box labelled "Ask Gemini".
    if (!candidates.length) {
        try {
            const labelled = document.querySelector("[aria-label*='Ask Gemini' i], [placeholder*='Ask Gemini' i]");
            if (labelled) {
                const inner = resolveEditable(labelled) || labelled.shadowRoot?.querySelector?.("[contenteditable]") || labelled;
                if (isEditable(inner)) add(inner, true, innerHeight - 100, 50000, "ask-gemini-fallback");
            }
        } catch { /* ignore */ }
    }

    try {
        window.IKO?.logger?.info?.("Composer", "scan", { found: candidates.length, sels: candidates.slice(0, 4).map(c => c.selector) });
    } catch { /* ignore */ }

    if (!candidates.length) return null;
    // Real editables first, then lowest on screen, then largest.
    candidates.sort((a, b) => (b.editable - a.editable) || (b.bottom - a.bottom) || (b.area - a.area));
    return candidates[0].element;
}

function selectContents(el) {
    try {
        const selection = window.getSelection?.();
        if (!selection) return false;
        const range = document.createRange();
        range.selectNodeContents(el);
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
    } catch { return false; }
}

function caretToEnd(el) {
    try {
        const selection = window.getSelection?.();
        if (!selection) return false;
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
    } catch { return false; }
}

function fireInput(el, value) {
    // composed:true so listeners living outside a shadow root still see it.
    try {
        el.dispatchEvent(new InputEvent("input", {
            bubbles: true, composed: true, inputType: "insertText", data: value
        }));
    } catch {
        try { el.dispatchEvent(new Event("input", { bubbles: true, composed: true })); } catch { /* ignore */ }
    }
}

function writeComposerText(element, value) {
    if (!element) return false;
    const el = resolveEditable(element) || element;
    const text = String(value ?? "");

    try { el.focus(); } catch { /* ignore */ }

    // Native form controls (React-controlled textareas etc. need the prototype setter).
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        let setter;
        try { setter = Object.getOwnPropertyDescriptor(proto, "value")?.set; } catch { setter = null; }
        try { setter ? setter.call(el, text) : (el.value = text); } catch { el.value = text; }
        fireInput(el, text);
        try { el.dispatchEvent(new Event("change", { bubbles: true })); } catch { /* ignore */ }
        return true;
    }

    // Rich / contenteditable editors.
    if (!isEditable(el)) return false;

    selectContents(el);
    let applied = false;
    try { applied = document.execCommand("insertText", false, text); } catch { applied = false; }

    const read = () => {
        const raw = (el.innerText ?? el.textContent ?? "") ;
        return String(raw).replace(/\s+/g, " ").trim();
    };
    const want = text.replace(/\s+/g, " ").trim();
    const ok = applied && want.length > 0 && read() === want;

    if (!ok) {
        // Fallback: set the text directly, put the caret at the end, and emit a
        // single composed input event. Never emit a synthetic beforeinput.
        try { el.textContent = text; } catch { /* ignore */ }
        caretToEnd(el);
        fireInput(el, text);
    }
    return true;
}

const api = { isEditable, resolveEditable, deepQueryAll, findComposer, writeComposerText };

try { window.IKOComposer = api; } catch { /* non-browser */ }

module.exports = api;
