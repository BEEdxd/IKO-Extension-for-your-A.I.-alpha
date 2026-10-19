"use strict";

const IKOComposer = require("../composer-io.js");

(function () {
    let migrationPanel = null;

    function getPlatforms() {
        try {
            if (window.IKOMigrationCore?.PLATFORMS) return window.IKOMigrationCore.PLATFORMS;
        } catch { /* ignore */ }
        return null;
    }

    function getCurrentPlatform() {
        const host = location.hostname.toLowerCase();
        const plats = getPlatforms();
        if (plats) {
            for (const p of Object.values(plats)) {
                if ((p.hosts || []).some(h => host === h || host.endsWith("." + h))) return p.id;
            }
        }
        // fallback for first load before core ready
        if (host === "claude.ai" || host.endsWith(".claude.ai")) return "claude";
        if (host === "chatgpt.com" || host.endsWith(".chatgpt.com") || host === "chat.openai.com" || host.endsWith(".chat.openai.com")) return "chatgpt";
        if (host.includes("gemini")) return "gemini";
        if (host.includes("perplexity")) return "perplexity";
        if (host.includes("copilot")) return "copilot";
        if (host.includes("grok")) return "grok";
        return null;
    }

    function platformName(id) {
        const plats = getPlatforms();
        if (plats?.[id]?.name) return plats[id].name;
        return id === "claude" ? "Claude" : id === "chatgpt" ? "ChatGPT" : (id || "Unknown");
    }

    function getDirection() {
        const platform = getCurrentPlatform();
        if (!platform) return null;
        const plats = getPlatforms();
        const all = plats ? Object.values(plats).filter(p => p.id !== platform).map(p => ({ id: p.id, name: p.name })) : [];
        // sensible default: chatgpt<->claude, others -> chatgpt
        const def = platform === "chatgpt" ? "claude" : "chatgpt";
        return {
            source: platform,
            sourceName: `${platformName(platform)} — Current Session`,
            destination: def,
            destinationName: platformName(def),
            destinations: all.length ? all : [{ id: def, name: platformName(def) }]
        };
    }

    function createLauncher() {
        // Unified dock: single #iko-bot toggles HUD which contains Migrate.
        // Remove legacy floater so only bot + HUD remain.
        try { document.getElementById("iko-migration-launcher")?.remove(); } catch { /* ignore */ }
        return null;
    }

    // Reloading IKO (brave://extensions → reload) while a tab stays open kills
    // that content script's link to the extension: chrome.runtime.sendMessage
    // then throws "Extension context invalidated" and "Open destination" can't
    // reach the background. The only cure is a page refresh — so we remember
    // the prepared package for this (sessionStorage = per-tab), refresh, and
    // then open the destination with a live connection.
    function isExtensionContextAlive() {
        try {
            return Boolean(globalThis.chrome?.runtime?.id && chrome.runtime.sendMessage);
        } catch {
            return false;
        }
    }

    const HANDOFF_KEY = "iko:migration-handoff";

    function stashHandoff(destination, pkg) {
        try {
            sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ destination, package: pkg, at: Date.now() }));
        } catch { /* private mode / quota — a refresh still reconnects the link */ }
    }

    function takeHandoff() {
        try {
            const raw = sessionStorage.getItem(HANDOFF_KEY);
            if (!raw) return null;
            sessionStorage.removeItem(HANDOFF_KEY);
            const parsed = JSON.parse(raw);
            // Ignore stale leftovers from an earlier visit to this tab.
            if (!parsed || Date.now() - Number(parsed.at || 0) > 20000) return null;
            return parsed;
        } catch {
            return null;
        }
    }

    async function resumeHandoff() {
        if (!isExtensionContextAlive()) return;
        const handoff = takeHandoff();
        if (!handoff?.package?.session) return;
        const destination = handoff.destination || getDirection()?.destination || "claude";
        try {
            window.IKO?.logger?.info?.("Migration", "reconnected — opening destination", { destination });
            const adapter = createDestinationAdapter(destination);
            await adapter.openDestination(handoff.package);
        } catch (error) {
            window.IKO?.logger?.error?.("Migration", "reconnect open failed", { error: String(error?.message || error) });
        }
    }

    function createSourceAdapter(id) {
        const core = window.IKOMigrationCore;
        // precise parsers where we have them, universal fallback everywhere else
        if (id === "claude" && core.ClaudeSourceAdapter) {
            try { return new core.ClaudeSourceAdapter(); } catch { /* fall through */ }
        }
        if (id === "chatgpt" && core.ChatGPTSourceAdapter) {
            try { return new core.ChatGPTSourceAdapter(); } catch { /* fall through */ }
        }
        return new core.UniversalSourceAdapter(id);
    }

    function createDestinationAdapter(id) {
        const core = window.IKOMigrationCore;
        if (id === "chatgpt" && core.ChatGPTDestinationAdapter) return new core.ChatGPTDestinationAdapter();
        if (id === "claude" && core.ClaudeDestinationAdapter) return new core.ClaudeDestinationAdapter();
        return new core.UniversalDestinationAdapter(id);
    }

    function openMigrationPanel() {
        const existing = document.getElementById("iko-migration-panel");
        if (existing) existing.remove();
        migrationPanel = null;

        if (!window.IKOMigrationUI || !window.IKOMigrationCore) {
            console.error("[IKO Migration] Migration modules are not ready.");
            return;
        }

        const direction = getDirection();
        if (!direction) {
            console.warn("[IKO Migration] Unsupported page.");
            return;
        }

        const sourceAdapter = createSourceAdapter(direction.source);
        let destinationAdapter = createDestinationAdapter(direction.destination);
        let engine = new window.IKOMigrationCore.MigrationEngine({ sourceAdapter, destinationAdapter });
        let lastResult = null;
        let currentDestination = direction.destination;

        migrationPanel = window.IKOMigrationUI.createMigrationUI({
            sourceId: direction.source,
            sourceName: direction.sourceName,
            destinationId: direction.destination,
            destinationName: direction.destinationName,
            destinations: direction.destinations,
            directionLabel: `${direction.sourceName} → ${direction.destinationName}`,
            onListLibrary: listLibrary,
            onLoadLibrary: async (id) => {
                const loaded = await loadLibraryItem(id);
                // Saved entries created before packaging may have package:null.
                // Rebuild an openable package and remember it so "Open destination"
                // works after a Load (lastResult is otherwise only set by Prepare).
                const pkg = loaded?.package?.session
                    ? loaded.package
                    : { session: loaded?.session, source: loaded?.session?.source || null };
                lastResult = { migrationPackage: pkg };
                try { window.IKO?.logger?.info?.("Library", "loaded", { id, messages: pkg?.session?.messages?.length || 0 }); } catch { /* ignore */ }
                return { session: loaded?.session, package: pkg };
            },
            onDeleteLibrary: deleteLibraryItem,
            onSaveLibrary: saveLibraryItem,
            onDestinationChange: (newDest) => {
                currentDestination = newDest;
                lastResult = null;
                try {
                    destinationAdapter = createDestinationAdapter(newDest);
                    engine = new window.IKOMigrationCore.MigrationEngine({ sourceAdapter, destinationAdapter });
                    window.IKO?.logger?.info?.("Migration", "destination changed", { to: newDest });
                } catch (e) { window.IKO?.logger?.error?.("Migration", "bad destination", { error: String(e) }); }
            },
            onPrepareMigration: async () => {
                try { window.IKO?.logger?.info?.("Migration", "prepare clicked", { ...direction, destination: currentDestination }); } catch { /* ignore */ }
                const result = await engine.run();
                try {
                    window.IKO?.logger?.info?.("Migration", result.success ? "engine success" : "engine failed",
                        result.success
                            ? { messages: result.session?.messages?.length, state: result.state?.stage }
                            : { error: String(result.error?.message || result.error), history: result.state?.history });
                } catch { /* ignore */ }
                if (!result.success) throw result.error;
                lastResult = result;
                return { session: result.session, migrationPackage: result.migrationPackage };
            },
            onOpenDestination: async (destination, migrationPackage) => {
                // Use the package the UI hands us — freshly prepared OR loaded
                // from the saved library — falling back to the last prepared one.
                const pkg = migrationPackage?.session ? migrationPackage : lastResult?.migrationPackage;
                if (!pkg?.session) throw new Error("Migration package is not ready — click Prepare Migration or load a saved session first.");

                // Stale link (IKO was reloaded while this tab stayed open): a
                // refresh is the only way to reconnect. Remember the package,
                // then reload — resumeHandoff() opens the destination once the
                // link is live and the destination bar appears as normal.
                if (!isExtensionContextAlive()) {
                    stashHandoff(destination || currentDestination, pkg);
                    try { window.IKO?.logger?.warn?.("Migration", "extension context stale — refreshing to reconnect", { destination: destination || currentDestination }); } catch { /* ignore */ }
                    setTimeout(() => { try { location.reload(); } catch { /* ignore */ } }, 400);
                    return { status: "reconnecting" };
                }

                const result = await engine.prepareDestination(pkg);
                if (!result.success) throw result.error;
                lastResult = { migrationPackage: pkg };
                return result;
            },
            onClose: () => { migrationPanel = null; }
        });
    }

    function closeMigrationPanel() {
        const root = document.getElementById("iko-migration-panel");
        if (root) root.remove();
        migrationPanel = null;
    }

    function findComposer() {
        // Delegate to the shared, framework-aware writer (composer-io.js).
        return IKOComposer.findComposer();
    }

    function sessionToPrompt(session, excluded) {
        const source = session?.source || {};
        const messages = (Array.isArray(session?.messages) ? session.messages : [])
            .filter(m => !(excluded && excluded.has?.(m.id)));
        const lines = [
            "IKO SESSION MIGRATION",
            `Source: ${source.platform || "AI"}`,
            `Conversation: ${source.title || "Untitled Session"}`,
            "",
            "The following is the preserved conversation context. Continue from it without losing the previous decisions, requirements, or code context.",
            "",
            "--- CONVERSATION ---"
        ];
        for (const message of messages) {
            const content = Array.isArray(message.content)
                ? message.content.map(block => block?.text || block?.code || (block?.input ? JSON.stringify(block.input) : "") || (block?.output ? JSON.stringify(block.output) : "") || "").join("\n")
                : String(message.content || "");
            if (content.trim()) lines.push(`${String(message.role || "user").toUpperCase()}:\n${content}`);
        }
        lines.push("", "--- END CONVERSATION ---", "", "Continue from the conversation above.");
        return lines.join("\n");
    }

    // Multi-part format for very large sessions: the header appears once in
    // part 1 and the closing line once in the last part, so sequentially
    // inserted parts join into ONE coherent message in the destination box.
    function sessionToChunks(session, excluded, maxChars = 12000) {
        const full = sessionToPrompt(session, excluded);
        if (full.length <= maxChars) return [full];
        const source = session?.source || {};
        const header = [
            "IKO SESSION MIGRATION",
            `Source: ${source.platform || "AI"}`,
            `Conversation: ${source.title || "Untitled Session"}`,
            "",
            "The following is the preserved conversation context. Continue from it without losing the previous decisions, requirements, or code context.",
            "",
            "--- CONVERSATION ---"
        ].join("\n");
        const turns = [];
        for (const m of (session?.messages || []).filter(x => !(excluded && excluded.has?.(x.id)))) {
            const content = Array.isArray(m.content)
                ? m.content.map(b => b?.text || b?.code || (b?.input ? JSON.stringify(b.input) : "") || (b?.output ? JSON.stringify(b.output) : "") || "").join("\n")
                : String(m.content || "");
            if (content.trim()) turns.push(`${String(m.role || "user").toUpperCase()}:\n${content}`);
        }
        const chunks = [];
        let cur = [];
        let len = 0;
        for (const t of turns) {
            if (len + t.length > maxChars && cur.length) { chunks.push(cur); cur = []; len = 0; }
            cur.push(t); len += t.length + 2;
        }
        if (cur.length) chunks.push(cur);
        const total = chunks.length;
        return chunks.map((parts, i) => {
            const out = [];
            if (i === 0) out.push(header);
            out.push(...parts);
            if (i === total - 1) out.push("", "--- END CONVERSATION ---", "", "Continue from the conversation above.");
            return out.join("\n");
        });
    }

    // ---- Session library (local, max 20) ----
    function storageGet(keys) {
        return new Promise(resolve => {
            try { chrome.storage.local.get(keys, r => resolve(r || {})); }
            catch { resolve({}); }
        });
    }
    function storageSet(obj) {
        return new Promise((resolve, reject) => {
            try { chrome.storage.local.set(obj, () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()); }
            catch (e) { reject(e); }
        });
    }
    async function listLibrary() {
        const { ikoSessions } = await storageGet(["ikoSessions"]);
        return Array.isArray(ikoSessions) ? ikoSessions : [];
    }
    async function saveLibraryItem({ session, package: pkg }) {
        const items = await listLibrary();
        const id = `${session?.source?.conversationId || Date.now()}-${Date.now()}`;
        items.unshift({
            id,
            title: session?.source?.title || "Untitled",
            platform: session?.source?.platform || "?",
            messages: session?.messages?.length || 0,
            savedAt: new Date().toISOString(),
            session: JSON.parse(JSON.stringify(session)),
            package: pkg ? JSON.parse(JSON.stringify(pkg)) : null
        });
        await storageSet({ ikoSessions: items.slice(0, 20) });
        try { window.IKO?.logger?.info?.("Library", "saved", { id }); } catch { /* ignore */ }
    }
    async function loadLibraryItem(id) {
        const items = await listLibrary();
        const it = items.find(x => x.id === id);
        if (!it) throw new Error("Saved session not found.");
        return { session: it.session, package: it.package };
    }
    async function deleteLibraryItem(id) {
        const items = await listLibrary();
        await storageSet({ ikoSessions: items.filter(x => x.id !== id) });
    }

    function setComposerValue(element, value) {
        if (!element) return false;
        try { window.IKO?.logger?.info?.("Migration", "inserting into composer", { tag: element.tagName, cls: String(element.className || "").slice(0, 120) }); } catch { /* ignore */ }
        return IKOComposer.writeComposerText(element, value);
    }

    function showPendingMigration(packageData) {
        const current = getCurrentPlatform();
        if (!current || !packageData?.session) return;
        const pkgSource = packageData.source?.platform || packageData.session?.source?.platform || null;
        try { window.IKO?.logger?.info?.("Migration", "pending check", { current, pkgSource }); } catch { /* ignore */ }
        // Show ONLY on destination: current tab must differ from package origin.
        // Old code compared against direction.source (== current tab) with !== and
        // therefore showed on ChatGPT source and hid on Claude destination.
        if (pkgSource && pkgSource === current) return;
        if (document.getElementById("iko-pending-migration")) return;

        const bar = document.createElement("div");
        bar.id = "iko-pending-migration";
        bar.innerHTML = `
            <div>
                <strong>IKO migration ready</strong>
                <span data-role="progress">${packageData.session.source?.title || "Migrated session"}</span>
            </div>
            <button type="button">Insert session context</button>
            <button type="button" aria-label="Dismiss">×</button>
        `;
        document.body.appendChild(bar);

        bar.querySelector("button")?.addEventListener("click", async () => {
            const btn = bar.querySelector("button");
            const progress = bar.querySelector("span[data-role='progress']");
            const composer = findComposer();
            if (!composer) {
                alert("IKO could not find the destination composer. Click the chat box and try again.");
                return;
            }
            // Chunked insert: big sessions exceed composer limits. All parts are
            // APPENDED in one click so the whole conversation ends up in the
            // composer as a single message (state kept for retry on failure).
            const chunks = sessionToChunks(packageData.session, null);
            let idx = Number(bar.dataset.chunk || 0);
            let acc = bar.dataset.acc || "";

            btn.disabled = true;
            let failed = false;
            while (idx < chunks.length) {
                const next = acc ? `${acc}\n\n${chunks[idx]}` : chunks[idx];
                if (progress) progress.textContent = `Inserting part ${idx + 1}/${chunks.length}…`;
                const written = setComposerValue(composer, next);
                try { window.IKO?.logger?.info?.("Migration", "inserted chunk", { idx: idx + 1, of: chunks.length, written, chars: next.length }); } catch { /* ignore */ }
                if (!written) { failed = true; break; }
                acc = next;
                idx += 1;
                bar.dataset.chunk = String(idx);
                bar.dataset.acc = acc;
                if (idx < chunks.length) await new Promise(r => setTimeout(r, 250));
            }
            btn.disabled = false;

            if (failed) {
                btn.textContent = `Retry from part ${idx + 1}/${chunks.length}`;
                if (progress) progress.textContent = `Inserted ${idx}/${chunks.length} parts — click retry to continue.`;
                alert("IKO could not write into the destination chat box. Click the chat box and try again.");
                return;
            }

            if (progress) progress.textContent = `All ${chunks.length} part${chunks.length === 1 ? "" : "s"} inserted — review and send.`;
            try {
                chrome.runtime.sendMessage(
                    { type: "IKO_CLEAR_MIGRATION" },
                    () => { void chrome.runtime?.lastError; }
                );
            } catch (error) {
                console.debug("[IKO Migration] Could not clear migration state:", error?.message || error);
            }
            bar.remove();
        });

        bar.querySelectorAll("button")[1]?.addEventListener("click", () => {
            // Dismissing must clear the background state too, otherwise the
            // pending-migration poll re-fetches the package and the bar
            // reappears immediately.
            try {
                chrome.runtime.sendMessage(
                    { type: "IKO_CLEAR_MIGRATION" },
                    () => { void chrome.runtime?.lastError; }
                );
            } catch (error) {
                console.debug("[IKO Migration] Could not clear migration state:", error?.message || error);
            }
            bar.remove();
        });
    }

    function checkPendingMigration() {
        // A stale content script (IKO reloaded under an open tab) has no live
        // link — skip the poll instead of logging an error every 1.5s. The
        // page refresh that reconnects also restarts this interval.
        if (!isExtensionContextAlive()) return;

        try {
            chrome.runtime.sendMessage(
                { type: "IKO_GET_MIGRATION" },
                response => {
                    if (chrome.runtime?.lastError) {
                        console.debug("[IKO Migration] Context unavailable:", chrome.runtime.lastError.message);
                        return;
                    }
                    if (!response?.success || !response.package) return;
                    showPendingMigration(response.package);
                }
            );
        } catch (error) {
            // A stale content script can survive an extension reload. Never let it throw.
            console.debug("[IKO Migration] Extension context unavailable:", error?.message || error);
        }
    }

    function initialize() {
        // migration-entry.js also calls start() — guard against double init
        // (double init = double polling, double logs, double launchers).
        try {
            if (window.__IKO_MIGRATION_STARTED__) return;
            window.__IKO_MIGRATION_STARTED__ = true;
        } catch { /* ignore */ }
        createLauncher();
        console.log("[IKO Migration] Ready:", getDirection());
        // If a previous "Open destination" click refreshed the page to
        // reconnect, finish that hand-off now that messaging works again.
        setTimeout(resumeHandoff, 900);
        setTimeout(checkPendingMigration, 1200);
        setInterval(checkPendingMigration, 1500);
    }

    window.IKOMigrationMain = {
        start: initialize,
        open: openMigrationPanel,
        close: closeMigrationPanel,
        getDirection
    };

    window.IKO = window.IKO || {};
    window.IKO.migration = window.IKO.migration || {};
    Object.assign(window.IKO.migration, {
        start: initialize,
        open: openMigrationPanel,
        close: closeMigrationPanel,
        getDirection
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
