"use strict";

const IKOComposer = require("../composer-io.js");

(function () {
    function findComposer() {
        return IKOComposer.findComposer();
    }

    function readComposer(elm) {
        if (!elm) return "";
        if (elm.tagName === "TEXTAREA" || elm.tagName === "INPUT") return elm.value || "";
        const pm = elm.classList?.contains("ProseMirror") ? elm : elm.querySelector?.(".ProseMirror");
        const t = pm || elm;
        return (t.innerText || t.textContent || "").trim();
    }

    function writeComposer(elm, value) {
        return IKOComposer.writeComposerText(elm, value);
    }

    // Fix stray paren above at build time guard
    function safeWrite(elm, value) {
        try { return writeComposer(elm, value); }
        catch (e) {
            try {
                elm.focus();
                elm.textContent = value;
                elm.dispatchEvent(new InputEvent("input", { bubbles: true }));
                return true;
            } catch { return false; }
        }
    }

    function createLauncher() {
        // Unified dock: Migrate + Optimize now live inside the HUD (#iko-hud-actions)
        // and behind the single #iko-bot button. Remove legacy floaters to avoid 3 buttons.
        try {
            document.getElementById("iko-optimizer-launcher")?.remove();
            document.getElementById("iko-migration-launcher")?.remove();
        } catch { /* ignore */ }
        return null;
    }

    function start() { createLauncher(); wireEvent(); }

    function wireEvent() {
        try {
            window.addEventListener("iko-optimize-requested", () => {
                const composer = findComposer();
                if (!composer) { alert("IKO could not find the chat box. Click inside it once and retry."); return; }
                const original = readComposer(composer);
                if (!original || original.length < 3) { alert("Type your prompt in the chat box first, then click Optimize."); return; }
                window.IKOOptimizerUI.createOptimizerUI({ original, onApply: (optimized) => { safeWrite(composer, optimized); } });
            });
        } catch { /* ignore */ }
    }

    window.IKOOptimizerMain = { start };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
})();
