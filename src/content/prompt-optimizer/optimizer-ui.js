"use strict";
(function () {
    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    }

    function createOptimizerUI({ original, onApply }) {
        document.getElementById("iko-optimizer-panel")?.remove();
        const root = el("div", "iko-optimizer-root");
        root.id = "iko-optimizer-panel";
        const panel = el("section", "iko-optimizer-panel");
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-modal", "true");

        const header = el("header", "iko-optimizer-header");
        header.appendChild(el("div", "iko-optimizer-title", "IKO Prompt Optimizer"));
        const close = el("button", "iko-optimizer-close", "×");
        close.type = "button";
        close.addEventListener("click", () => root.remove());
        const headerActions = el("div", "iko-header-actions");
        const themeBtn = window.IKOTheme?.button?.();
        if (themeBtn) headerActions.appendChild(themeBtn);
        headerActions.appendChild(close);
        header.appendChild(headerActions);

        const body = el("div", "iko-optimizer-body");
        const modeRow = el("div", "iko-optimizer-modes");
        const modes = [["clarify", "Clarify"], ["concise", "Concise"], ["detailed", "Detailed"]];
        let mode = "clarify";
        const modeBtns = [];
        for (const [id, label] of modes) {
            const b = el("button", "iko-optimizer-mode" + (id === mode ? " active" : ""), label);
            b.type = "button";
            b.addEventListener("click", () => {
                mode = id;
                modeBtns.forEach(x => x.classList.remove("active"));
                b.classList.add("active");
                refresh();
            });
            modeBtns.push(b);
            modeRow.appendChild(b);
        }
        body.appendChild(modeRow);

        const score = el("div", "iko-optimizer-score", "");
        body.appendChild(score);

        const labelO = el("div", "iko-optimizer-label", "Optimized prompt (editable)");
        body.appendChild(labelO);
        const out = document.createElement("textarea");
        out.className = "iko-optimizer-text";
        out.rows = 10;
        body.appendChild(out);

        const tips = el("ul", "iko-optimizer-tips");
        body.appendChild(tips);

        const actions = el("div", "iko-optimizer-actions");
        const copy = el("button", "iko-migration-button secondary", "Copy");
        copy.type = "button";
        copy.addEventListener("click", async () => {
            try { await navigator.clipboard.writeText(out.value); copy.textContent = "Copied ✓"; }
            catch { out.select(); copy.textContent = "Select + Ctrl+C"; }
            setTimeout(() => { copy.textContent = "Copy"; }, 1500);
        });
        const apply = el("button", "iko-migration-button primary", "Apply to composer");
        apply.type = "button";
        apply.addEventListener("click", () => { onApply?.(out.value); root.remove(); });
        actions.append(copy, apply);
        body.appendChild(actions);

        panel.append(header, body);
        root.appendChild(panel);
        document.body.appendChild(root);
        requestAnimationFrame(() => root.classList.add("iko-optimizer-visible"));
        root.addEventListener("click", e => { if (e.target === root) root.remove(); });

        function refresh() {
            try {
                const core = window.IKOOptimizerCore;
                const r = core.optimizePrompt(original, mode);
                out.value = r.optimized;
                score.textContent = `Intent: ${r.intent} · Quality score: ${r.score}/100`;
                tips.innerHTML = "";
                for (const t of r.improvements) {
                    const li = document.createElement("li");
                    li.textContent = t;
                    tips.appendChild(li);
                }
                try { window.IKO?.logger?.info?.("Optimizer", "optimized", { mode, score: r.score, inLen: original.length, outLen: r.optimized.length }); } catch { /* ignore */ }
            } catch (e) {
                out.value = original;
                score.textContent = "Optimizer failed — showing original.";
            }
        }
        refresh();
        return { root, refresh };
    }

    window.IKOOptimizerUI = { createOptimizerUI };
})();
