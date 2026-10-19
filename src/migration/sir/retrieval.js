// P2 retrieval — universal, dependency-free, deterministic.
// Query-Adaptive Semantic Compression (QASC-lite): question complexity →
// minimum representation. No embeddings yet (lexical scoring); same interface
// the vector phase will later implement, so callers don't change.
(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else {
        root.IKORETRIEVAL = root.IKORETRIEVAL || {};
        Object.assign(root.IKORETRIEVAL, factory());
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const RETRIEVAL_VERSION = "0.1.0";

    const STOP = new Set(("a,an,the,and,or,but,is,are,was,were,be,been,to,of,in,on,for,with,what,how,why,when,where,which,who,whom,do,does,did,can,could,should,would,please,tell,me,give,show,find,get,from,by,at,as,it,its,this,that,these,those,you,your,our,their,his,her,my,i,we,they,he,she,s,ve,re,ll,don,not,no,yes,if,then,than,so,such,only,just,about,into,over,after,before,between,much,many,more,most,some,any,all,each,other,having,has,have,had,having".split(",")));

    function tokenize(text) {
        return String(text || "").toLowerCase()
            .replace(/[^a-z0-9₹$€£%\s]/g, " ")
            .split(/\s+/).map(t => t.trim()).filter(t => t.length > 1 && !STOP.has(t));
    }

    // Intent → retrieval level. fact: 1-3 units; section: 4-8; full: everything.
    function classifyQuery(query) {
        const q = String(query || "").toLowerCase();
        if (!q.trim()) return { intent: "none", level: "full", topK: 1e9 };
        if (/(invoice\s*(number|no|id)|receipt\s*(number|no)|order\s*(number|id)|tracking)/.test(q)) return { intent: "lookup-id", level: "fact", topK: 3 };
        if (/(ceo|founder|author|name of|who is|contact|email|phone|address)/.test(q)) return { intent: "lookup-entity", level: "fact", topK: 3 };
        // task verbs outrank topic keywords: "summarize financials" is a summary, not a metric lookup
        if (/(summar|tldr|overview|recap|brief)/.test(q)) return { intent: "summarize", level: "section", topK: 8 };
        if (/(compar|vs\.?|versus|pros|cons|better|difference)/.test(q)) return { intent: "compare", level: "section", topK: 8 };
        if (/(debug|fix|error|traceback|exception|bug|why.*(fail|crash|broken))/.test(q)) return { intent: "debug", level: "section", topK: 6 };
        if (/(plan|roadmap|steps|strategy|how to|guide)/.test(q)) return { intent: "plan", level: "section", topK: 6 };
        if (/(table|list all|every|all items|all products)/.test(q)) return { intent: "enumerate", level: "section", topK: 10 };
        if (/(revenue|profit|growth|total|gst|tax|amount|price|cost|metric|kpi|financial)/.test(q)) return { intent: "metric", level: "fact", topK: 5 };
        return { intent: "general", level: "section", topK: 6 };
    }

    function messageText(m) {
        const c = m?.content;
        if (typeof c === "string") return c;
        if (Array.isArray(c)) return c.map(b => (b && typeof b === "object" ? (b.text || b.code || "") : String(b ?? ""))).join("\n");
        return "";
    }

    // Build scoring units: one per message + one per markdown table row.
    function buildUnits(session) {
        const units = [];
        const messages = Array.isArray(session?.messages) ? session.messages : [];
        messages.forEach((m, i) => {
            const text = messageText(m);
            if (!text.trim()) return;
            units.push({ id: m.id || `m${i + 1}`, parentId: m.id || `m${i + 1}`, role: m.role || "user", text: text.slice(0, 4000), kind: "turn", index: i });
            // table rows as separate retrievable units
            const lines = text.split("\n").filter(l => l.includes("|"));
            if (lines.length >= 2) {
                lines.slice(0, 30).forEach((row, r) => {
                    const cells = row.replace(/^\||\|$/g, "").trim();
                    if (cells.replace(/\|/g, "").trim().length < 3) return;
                    units.push({ id: `${m.id || `m${i + 1}`}#row${r + 1}`, parentId: m.id || `m${i + 1}`, role: m.role || "user", text: cells.slice(0, 500), kind: "row", index: i });
                });
            }
        });
        return units;
    }

    function scoreUnit(queryTokens, queryRaw, unit) {
        const ut = new Set(tokenize(unit.text));
        let score = 0;
        for (const t of queryTokens) if (ut.has(t)) score += 2;
        // exact-phrase bonus (invoice numbers, names, codes survive tokenization)
        const ql = String(queryRaw || "").toLowerCase();
        if (ql.length > 4) {
            const words = ql.split(/\s+/).filter(w => w.length > 3);
            for (const w of words.slice(0, 8)) {
                if (unit.text.toLowerCase().includes(w)) score += 1;
            }
        }
        // numbers/codes in query are high-signal: boost units containing them
        const nums = String(queryRaw || "").match(/[A-Za-z]*\d[\w-]*/g) || [];
        for (const n of nums.slice(0, 6)) {
            if (n.length > 2 && unit.text.includes(n)) score += 3;
        }
        // table rows slightly preferred for metric/enumerate intents (dense facts)
        if (unit.kind === "row") score += 0.5;
        return score;
    }

    // session + natural-language query → minimal scored subset. Deterministic.
    function retrieve(session, query, { topK, countTokens } = {}) {
        const cls = classifyQuery(query);
        const k = Math.min(topK || cls.topK || 6, 200);
        const units = buildUnits(session);
        const fullText = units.filter(u => u.kind === "turn").map(u => u.text).join("\n");
        const count = typeof countTokens === "function" ? countTokens : (t) => Math.ceil(String(t || "").length / 4);
        const tokensFull = count(fullText);
        if (cls.intent === "none" || !units.length) {
            return { intent: cls.intent, level: "full", hits: units.filter(u => u.kind === "turn"), messageIds: units.filter(u => u.kind === "turn").map(u => u.parentId), tokensFull, tokensMin: tokensFull, savedPct: 0, query: String(query || "") };
        }
        const qt = tokenize(query);
        const scored = units.map(u => ({ u, s: scoreUnit(qt, query, u) })).sort((a, b) => b.s - a.s || a.u.index - b.u.index);
        // keep all positive hits up to k; if everything scores 0, fall back to first k turns (recency-agnostic safety)
        let picked = scored.filter(x => x.s > 0).slice(0, k);
        if (!picked.length) picked = scored.filter(x => x.u.kind === "turn").slice(0, Math.min(3, k));
        // restore document order for coherent context
        picked.sort((a, b) => a.u.index - b.u.index);
        const minText = picked.map(x => x.u.text).join("\n");
        const tokensMin = count(minText);
        const msgIds = [...new Set(picked.map(x => x.u.parentId))];
        return {
            intent: cls.intent, level: cls.level, query: String(query || ""),
            hits: picked.map(x => ({ id: x.u.id, parentId: x.u.parentId, role: x.u.role, score: x.s, kind: x.u.kind })),
            messageIds: msgIds,
            tokensFull, tokensMin,
            savedPct: tokensFull ? Math.max(0, Math.round((1 - tokensMin / Math.max(1, tokensFull)) * 100)) : 0
        };
    }

    // Format minimal subset as SIR-ish block (works without SIR module).
    function formatMinimal(session, result) {
        const s = session?.source || {};
        const lines = [
            `@QUERY ${String(result.query || "").slice(0, 300)}`,
            `@DOC id=${s.conversationId || "unknown"} type=chat-${s.platform || "unknown"} intent=${result.intent} saved=${result.savedPct}%`,
        ];
        const byId = new Map((session?.messages || []).map(m => [m.id, m]));
        for (const id of result.messageIds) {
            const m = byId.get(id);
            if (!m) continue;
            const text = messageText(m).replace(/\s+/g, " ").trim().slice(0, 1200);
            lines.push(`@HIT id=${id} role=${m.role || "user"}`);
            lines.push(text);
        }
        return lines.join("\n");
    }

    return { RETRIEVAL_VERSION, tokenize, classifyQuery, buildUnits, retrieve, formatMinimal };
}));
