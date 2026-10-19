// SIR v0.1 — Semantic Intermediate Representation. Universal: no DOM,
// no platform ids, no network. Works in Node (require) and browser
// (window.IKOSIR). Deterministic: same input → same output, always.
(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.IKOSIR = factory();
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const SIR_VERSION = "0.1.0";

    // Escape a scalar value: single-line, pipes preserved for tables only.
    function esc(v) {
        return String(v ?? "")
            .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
            .split("\n")[0]
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 500);
    }

    function kvLine(key, value) {
        const v = esc(value);
        if (!v) return null;
        return `${key}=${v}`;
    }

    function buildDoc({ id, type, pages, title } = {}) {
        const parts = ["@DOC"];
        if (id) parts.push(`id=${esc(id)}`);
        if (type) parts.push(`type=${esc(type)}`);
        if (pages != null) parts.push(`pages=${esc(pages)}`);
        if (title) parts.push(`title=${esc(title)}`);
        return parts.join(" ");
    }

    function buildEntity(obj = {}) {
        const lines = ["@ENTITY"];
        for (const [k, v] of Object.entries(obj)) {
            const line = kvLine(k, v);
            if (line) lines.push(line);
        }
        return lines.join("\n");
    }

    function buildMetric(obj = {}) {
        const lines = ["@METRIC"];
        for (const [k, v] of Object.entries(obj)) {
            const line = kvLine(k, v);
            if (line) lines.push(line);
        }
        return lines.join("\n");
    }

    function buildRel(subj, pred, obj) {
        if (!subj || !pred || !obj) return null;
        return `@REL ${esc(subj)} -> ${esc(pred)} -> ${esc(obj)}`;
    }

    // Compact table: schema once, pipe rows. Deterministic column order.
    function buildTable(name, cols, rows) {
        const safeCols = (cols || []).map(c => esc(c)).filter(Boolean);
        const safeRows = (rows || [])
            .map(r => r.map(c => esc(c).replace(/\|/g, "/")).join("|"))
            .filter(r => r.replace(/\|/g, "").trim().length > 0);
        if (!safeCols.length || !safeRows.length) return null;
        return [`@TABLE ${esc(name || "table")}`, `cols=${safeCols.join(",")}`, ...safeRows].join("\n");
    }

    function buildSrc(map = {}) {
        const lines = ["@SRC"];
        for (const [k, v] of Object.entries(map)) {
            const line = kvLine(k, v);
            if (line) lines.push(line);
        }
        return lines.length > 1 ? lines.join("\n") : null;
    }

    function buildConf(map = {}) {
        const lines = ["@CONF"];
        for (const [k, v] of Object.entries(map)) {
            const line = kvLine(k, v);
            if (line) lines.push(line);
        }
        return lines.length > 1 ? lines.join("\n") : null;
    }

    // Parse a markdown pipe table into {cols, rows}. Returns null if not a table.
    function parseMarkdownTable(text) {
        try {
            const lines = String(text || "").split("\n").map(l => l.trim()).filter(l => l.includes("|"));
            if (lines.length < 2) return null;
            const cells = (l) => l.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
            const header = cells(lines[0]);
            const delimOk = /^\|?[\s:|-]+\|?[\s:|.-]*$/.test(lines[1]);
            if (!delimOk || !header.some(Boolean)) return null;
            const start = delimOk ? 2 : 1;
            const rows = lines.slice(start).map(cells).filter(r => r.some(Boolean));
            if (!rows.length) return null;
            return { cols: header, rows };
        } catch { return null; }
    }

    // key: value / key = value lines → @ENTITY; currency/percent lines → @METRIC.
    function textToSIR(text) {
        const entities = {};
        const metrics = {};
        for (const raw of String(text || "").split("\n")) {
            const line = raw.trim();
            if (!line) continue;
            const kv = line.match(/^([A-Za-z_][\w .-]{0,40})\s*[:=]\s*(.+)$/);
            if (kv) {
                const k = kv[1].trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
                const v = kv[2].trim();
                if (/[₹$€£%]|\b\d+(\.\d+)?\b/.test(v) && /total|revenue|profit|growth|price|amount|gst|tax|invoice|date/i.test(kv[1])) metrics[k] = v;
                else entities[k] = v;
            } else if (/^(total|revenue|profit|growth|gst)\b/i.test(line)) {
                metrics[line.split(/\s/)[0].toLowerCase()] = line;
            }
        }
        const parts = [];
        if (Object.keys(entities).length) parts.push(buildEntity(entities));
        if (Object.keys(metrics).length) parts.push(buildMetric(metrics));
        return parts.length ? parts.join("\n") : null;
    }

    // Image semantics → SIR. Standard (@-blocks) or aggressive (TXT:/OBJ:/…).
    function imageToSIR({ text = [], objects = [], scene, colors = [], composition, style, background, relations = [] } = {}, aggressive = false) {
        if (aggressive) {
            const out = [];
            if (text.length) out.push(`TXT:${text.map(esc).join(",")}`);
            if (objects.length) out.push(`OBJ:${objects.map(esc).join(",")}`);
            if (scene) out.push(`SCN:${esc(scene)}`);
            if (colors.length) out.push(`CLR:${colors.map(esc).join(",")}`);
            if (composition) out.push(`CMP:${esc(composition)}`);
            if (style) out.push(`STY:${esc(style)}`);
            if (background) out.push(`BG:${esc(background)}`);
            for (const r of relations) {
                const line = buildRel(r.subj || r[0], r.pred || r[1], r.obj || r[2]);
                if (line) out.push(line.replace("@REL ", "REL:"));
            }
            return out.join("\n") || null;
        }
        const parts = ["@IMAGE"];
        if (text.length) parts.push(`text=${text.map(esc).join(",")}`);
        if (objects.length) parts.push(`objects=${objects.map(esc).join(",")}`);
        if (scene) parts.push(`scene=${esc(scene)}`);
        if (colors.length) parts.push(`colors=${colors.map(esc).join(",")}`);
        if (composition) parts.push(`composition=${esc(composition)}`);
        if (style) parts.push(`style=${esc(style)}`);
        if (background) parts.push(`background=${esc(background)}`);
        for (const r of relations) {
            const line = buildRel(r.subj || r[0], r.pred || r[1], r.obj || r[2]);
            if (line) parts.push(line);
        }
        return parts.length > 1 ? parts.join("\n") : null;
    }

    function blockText(block) {
        if (!block || typeof block !== "object") return String(block ?? "");
        return block.text || block.code || "";
    }

    function messageText(message) {
        const c = message?.content;
        if (typeof c === "string") return c;
        if (Array.isArray(c)) return c.map(blockText).join("\n");
        return "";
    }

    // Whole migration session → deterministic SIR document (universal).
    function sessionToSIR(session, { aggressive = false } = {}) {
        const s = session?.source || {};
        const parts = [
            buildDoc({
                id: s.conversationId || "unknown",
                type: `chat-${s.platform || "unknown"}`,
                title: s.title || undefined
            })
        ];
        const messages = Array.isArray(session?.messages) ? session.messages : [];
        messages.forEach((m, i) => {
            const text = messageText(m);
            if (!text.trim()) return;
            // Table inside a turn → compact TABLE block instead of prose.
            const table = parseMarkdownTable(text);
            const head = aggressive ? `@TURN${i + 1} ${String(m.role || "user").slice(0, 1).toUpperCase()}` : `@TURN id=${esc(m.id || `t${i + 1}`)} role=${esc(m.role || "user")}`;
            if (table) {
                const t = buildTable(`turn${i + 1}`, table.cols, table.rows);
                parts.push(head + (t ? `\n${t}` : `\n${esc(text).slice(0, 300)}`));
            } else {
                // Split kv-ish lines out, keep the rest as one compact line.
                const sir = textToSIR(text);
                const rest = text.split("\n").filter(l => !/^\s*[A-Za-z_][\w .-]{0,40}\s*[:=]/.test(l)).join(" ");
                parts.push(head + (sir ? `\n${sir}` : "") + (rest.trim() ? `\ntext=${esc(rest).slice(0, 300)}` : ""));
            }
        });
        return parts.filter(Boolean).join("\n");
    }

    // Token counting: gpt-tokenizer when available, else chars/4 fallback.
    function countTokens(text) {
        try {
            const gpt = require("gpt-tokenizer");
            if (gpt?.encode) return gpt.encode(String(text || "")).length;
        } catch { /* not in browser bundle or missing */ }
        try {
            if (typeof window !== "undefined" && window.IKO?.token?.count) return window.IKO.token.count(String(text || ""));
        } catch { /* ignore */ }
        return Math.ceil(String(text || "").length / 4);
    }

    // Compare named representations by tokens. Pure + deterministic.
    function compareReps(reps) {
        return Object.entries(reps || {})
            .map(([name, text]) => ({
                name,
                tokens: countTokens(text),
                chars: String(text || "").length
            }))
            .sort((a, b) => a.tokens - b.tokens);
    }

    return {
        SIR_VERSION, esc, buildDoc, buildEntity, buildMetric, buildRel,
        buildTable, buildSrc, buildConf, parseMarkdownTable, textToSIR,
        imageToSIR, sessionToSIR, messageText, countTokens, compareReps
    };
}));
