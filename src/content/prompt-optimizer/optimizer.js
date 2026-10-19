// Local-only prompt optimizer — no API key, no server.
// Rule-based: cleans vagueness, infers intent, restructures into
// Role / Task / Context / Requirements / Output so any LLM performs better.
function cleanText(input) {
    return String(input || "")
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
}

function detectIntent(text) {
    const t = text.toLowerCase();
    if (/(debug|fix|error|traceback|exception|bug)/.test(t)) return "debug";
    if (/(write|generate|create|build|implement|code|function|script|component)/.test(t)) return "code";
    if (/(explain|what is|why|how does|eli5)/.test(t)) return "explain";
    if (/(summar|tldr|condense|shorten)/.test(t)) return "summarize";
    if (/(translate|french|spanish|hindi|german)/.test(t)) return "translate";
    if (/(compare|vs|pros|cons|which is better)/.test(t)) return "compare";
    if (/(plan|roadmap|steps|strategy)/.test(t)) return "plan";
    return "general";
}

function vaguenessScore(text) {
    const vague = ["thing", "stuff", "something", "somehow", "maybe", "just", "etc", "whatever", "kind of", "sort of"];
    const t = text.toLowerCase();
    let hits = 0;
    for (const w of vague) if (t.includes(w)) hits += 1;
    return hits;
}

function optimizePrompt(raw, mode = "clarify") {
    const cleaned = cleanText(raw);
    if (!cleaned) return { optimized: "", improvements: [], score: 0 };
    if (cleaned.length < 12) {
        return {
            optimized: cleaned,
            improvements: ["Prompt too short — add what you want and what good output looks like."],
            score: 20
        };
    }
    const intent = detectIntent(cleaned);
    const improvements = [];
    if (vaguenessScore(cleaned) > 0) improvements.push("Removed vague filler words.");
    if (!/[?!.]$/.test(cleaned)) improvements.push("Added clear directive ending.");

    const roles = {
        debug: "You are a senior debugging assistant.",
        code: "You are a senior software engineer.",
        explain: "You are a patient expert teacher.",
        summarize: "You are a precise summarizer.",
        translate: "You are a professional translator.",
        compare: "You are an objective analyst.",
        plan: "You are a pragmatic planner.",
        general: "You are a helpful AI assistant."
    };
    const outputs = {
        debug: "1) Root cause 2) Minimal fix (code) 3) How to verify. Keep code exact unless broken.",
        code: "Working code first, then 3-5 bullet explanation. State language + edge cases handled.",
        explain: "Explain simply first, then technical depth. End with a 1-line takeaway.",
        summarize: "Bullet summary + 1-line TL;DR. Preserve names, numbers, decisions exactly.",
        translate: "Translation only, preserve tone and formatting.",
        compare: "Table of options vs criteria, then a recommendation with reason.",
        plan: "Numbered steps with owners/effort where possible.",
        general: "Direct answer first, then supporting detail. Ask one clarifying question only if truly ambiguous."
    };

    let body = cleaned;
    if (mode === "concise") {
        body = cleaned.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
        improvements.push("Compressed to single focused request.");
    }

    const optimized = [
        roles[intent],
        "",
        `Task: ${body}`,
        "",
        "Requirements:",
        "- Be specific, no filler. Preserve code, URLs, names exactly.",
        "- If ambiguous, state your assumption in one line and continue.",
        "",
        `Output format: ${outputs[intent]}`,
        mode === "detailed" ? "Detail level: thorough — cover edge cases and alternatives briefly." : "Detail level: balanced — complete but not verbose."
    ].join("\n");

    const score = Math.max(55, Math.min(95,
        70 + Math.min(15, Math.floor(cleaned.length / 60)) - vaguenessScore(cleaned) * 4 + (intent !== "general" ? 6 : 0)
    ));
    improvements.unshift(`Detected intent: ${intent}. Restructured into Role/Task/Requirements/Output.`);
    return { optimized, improvements, score, intent };
}

module.exports = { optimizePrompt, detectIntent, cleanText };
