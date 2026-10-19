"use strict";
/*
 * IKO theme controller — one moon/sun toggle shared by every IKO surface.
 *
 * The effective theme is mirrored onto <html data-iko-theme="...">, which is
 * what the injected stylesheets key off to swap the --iko-* semantic tokens
 * (ink / text / surface / field). Preference order:
 *
 *   1. explicit user choice (localStorage + chrome.storage.local)
 *   2. the operating system's prefers-color-scheme
 *
 * It is bundled into both content bundles; the guard keeps it a singleton.
 */
(function () {
    if (window.IKOTheme) return;

    const KEY = "ikoTheme";
    const ATTR = "data-iko-theme";
    const VALID = { dark: 1, light: 1 };

    let stored = null;

    const readLocal = () => {
        try { return localStorage.getItem(KEY); } catch { return null; }
    };

    const writeLocal = (theme) => {
        try {
            if (theme) localStorage.setItem(KEY, theme);
            else localStorage.removeItem(KEY);
        } catch { /* ignore */ }
    };

    const systemDark = () => {
        try { return !!window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; }
    };

    const effective = () => (VALID[stored] ? stored : (systemDark() ? "dark" : "light"));

    const paint = () => {
        const theme = effective();
        try { document.documentElement.setAttribute(ATTR, theme); } catch { /* ignore */ }
        return theme;
    };

    function syncButtons() {
        const dark = paint() === "dark";
        try {
            document.querySelectorAll(".iko-theme-toggle").forEach((btn) => {
                const label = dark ? "Switch to light mode" : "Switch to dark mode";
                btn.setAttribute("aria-pressed", dark ? "true" : "false");
                btn.setAttribute("aria-label", label);
                btn.title = label;
            });
        } catch { /* ignore */ }
        return dark;
    }

    function persist(theme) {
        writeLocal(theme);
        try { globalThis.chrome?.storage?.local?.set?.({ [KEY]: theme }); } catch { /* ignore */ }
    }

    function set(theme) {
        stored = VALID[theme] ? theme : null;
        persist(stored);
        syncButtons();
        try {
            window.dispatchEvent(new CustomEvent("iko-theme-changed", { detail: { theme: effective() } }));
        } catch { /* ignore */ }
    }

    function toggle() {
        set(effective() === "dark" ? "light" : "dark");
        return effective();
    }

    /* Bold, square-capped icons so they match the arcade outlines. */
    const SUN = '<svg class="iko-theme-icon iko-theme-sun" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><circle cx="12" cy="12" r="4.1"/><path d="M12 1.7v3.4M12 18.9v3.4M1.7 12h3.4M18.9 12h3.4M4.7 4.7l2.4 2.4M16.9 16.9l2.4 2.4M19.3 4.7l-2.4 2.4M7.1 16.9l-2.4 2.4"/></svg>';
    const MOON = '<svg class="iko-theme-icon iko-theme-moon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="M20.4 15.1A8.8 8.8 0 0 1 8.9 3.6a8.8 8.8 0 1 0 11.5 11.5z"/></svg>';

    function button(extraClass) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "iko-theme-toggle" + (extraClass ? " " + extraClass : "");
        btn.innerHTML = SUN + MOON;
        btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            toggle();
        });
        syncButtons();
        return btn;
    }

    /* ---- boot ---- */
    stored = readLocal();
    paint();

    // Reconcile with the extension-wide preference (kept in sync across sites).
    try {
        globalThis.chrome?.storage?.local?.get?.([KEY], (res) => {
            const v = res && res[KEY];
            if (VALID[v] && v !== stored) {
                stored = v;
                writeLocal(v);
                syncButtons();
            }
        });
    } catch { /* ignore */ }

    // Follow the OS while the user has no explicit preference.
    try {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
            if (!stored) syncButtons();
        });
    } catch { /* ignore */ }

    window.IKOTheme = {
        set,
        toggle,
        button,
        syncButtons,
        isDark: () => effective() === "dark",
        KEY,
        ATTR,
    };
})();
