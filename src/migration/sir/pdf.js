// P1 PDF layer — universal, dependency-free, text-native-first.
// Never OCRs a PDF that already carries machine-readable text.
// Scanned/image-only pages are flagged for OCR (P1-Tesseract phase) instead
// of silently returning garbage.
(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else {
        root.IKOPDF = root.IKOPDF || {};
        Object.assign(root.IKOPDF, factory());
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    function bytesToLatin1(buf) {
        try {
            const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
            let s = "";
            const CH = 8192;
            for (let i = 0; i < bytes.length; i += CH) {
                s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
            }
            return s;
        } catch { return ""; }
    }

    function countMatches(raw, re) {
        try {
            const m = raw.match(re);
            return m ? m.length : 0;
        } catch { return 0; }
    }

    // Heuristic kind detection on raw PDF source (latin1).
    // text-native: BT..ET blocks with Tj/TJ/'/" ops; scanned: Image XObjects, no text ops.
    function detectPdfKind(bufOrRaw) {
        const raw = typeof bufOrRaw === "string" ? bufOrRaw : bytesToLatin1(bufOrRaw);
        if (!/%PDF-/.test(raw.slice(0, 1024))) return { kind: "not-pdf", textOps: 0, imageOps: 0, pages: 0 };
        const pages = countMatches(raw, /\/Type\s*\/Page[^s]/g);
        // text-showing ops inside BT/ET: Tj TJ ' "
        const textOps = countMatches(raw, /\bTj\b|\bTJ\b/g);
        const imageOps = countMatches(raw, /\/Subtype\s*\/Image/g);
        const fontRefs = countMatches(raw, /\/BaseFont|\/FontName/g);
        let kind = "unknown";
        if (textOps >= 3 && textOps >= imageOps) kind = "text-native";
        else if (textOps === 0 && imageOps > 0) kind = "scanned";
        else if (textOps > 0) kind = "mixed";
        else kind = fontRefs > 0 ? "text-native" : "unknown";
        return { kind, textOps, imageOps, fontRefs, pages: pages || 1 };
    }

    function decodeHex(hex) {
        try {
            const clean = String(hex).replace(/\s+/g, "");
            let out = "";
            for (let i = 0; i + 1 < clean.length; i += 2) {
                out += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
            }
            return out;
        } catch { return ""; }
    }

    function decodeLiteral(lit) {
        // handles \( \) \\ and \n \r \t octal \ddd
        try {
            return String(lit).replace(/\\([nrtbf\\()])/g, (m, c) => {
                if (c === "n") return "\n";
                if (c === "r") return "\n";
                if (c === "t") return " ";
                if (c === "b" || c === "f") return " ";
                return c;
            }).replace(/\\(\d{1,3})/g, (m, o) => String.fromCharCode(parseInt(o, 8)));
        } catch { return String(lit); }
    }

    // Minimal text extraction: strings in (literal) and <hex> within BT..ET.
    // Handles simple WinAnsi PDFs (invoices, reports). Not a full CMap parser —
    // returns {text, pages, truncated, needsOcr} honestly.
    function extractTextNative(bufOrRaw, maxChars = 200000) {
        const raw = typeof bufOrRaw === "string" ? bufOrRaw : bytesToLatin1(bufOrRaw);
        const info = detectPdfKind(raw);
        if (info.kind === "not-pdf") return { text: "", pages: 0, kind: info.kind, needsOcr: false };
        if (info.kind === "scanned") {
            return { text: "", pages: info.pages, kind: info.kind, needsOcr: true, reason: "image-only pages, no text ops" };
        }
        const chunks = [];
        let total = 0;
        let truncated = false;
        const blockRe = /BT([\s\S]*?)ET/g;
        let block;
        // If no BT/ET (some writers emit bare Tj), fall back to global scan.
        const blocks = [];
        while ((block = blockRe.exec(raw))) blocks.push(block[1]);
        const sources = blocks.length ? blocks : [raw];
        const strRe = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>/g;
        for (const src of sources) {
            let m;
            strRe.lastIndex = 0;
            while ((m = strRe.exec(src))) {
                const tok = m[0];
                const decoded = tok[0] === "(" ? decodeLiteral(tok.slice(1, -1)) : decodeHex(tok.slice(1, -1));
                if (!decoded) continue;
                // skip lone glyph noise
                if (/^[\s\u0000-\u0008]*$/.test(decoded)) continue;
                if (total + decoded.length + 1 > maxChars) { truncated = true; break; }
                chunks.push(decoded);
                total += decoded.length + 1;
            }
            if (truncated) break;
        }
        // Rejoin: Tj fragments are words/syllables — join with space, keep newlines sparse.
        const text = chunks.join(" ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim().slice(0, maxChars);
        const needsOcr = !text || text.replace(/[^A-Za-z0-9]/g, "").length < 40;
        return {
            text: needsOcr ? "" : text,
            pages: info.pages,
            kind: needsOcr ? "scanned" : info.kind,
            needsOcr,
            reason: needsOcr ? "no usable text layer found" : undefined,
            truncated
        };
    }

    // buf -> L1/L2/L3 using the SIR module passed in (avoids hard dep).
    function pdfToSIR(bufOrRaw, meta = {}, SIR = null) {
        const raw = typeof bufOrRaw === "string" ? bufOrRaw : bufOrRaw;
        const extracted = extractTextNative(raw);
        const l1 = { kind: extracted.kind, pages: extracted.pages, chars: extracted.text.length, needsOcr: extracted.needsOcr };
        if (extracted.needsOcr || !extracted.text) {
            return {
                l1, l2: null,
                l3: null,
                route: "ocr-required",
                message: "Scanned/image-only PDF — route to OCR (Tesseract phase), do not send raw bytes to the LLM."
            };
        }
        const text = extracted.text;
        let l3 = null;
        try {
            if (SIR) {
                const kv = SIR.textToSIR ? SIR.textToSIR(text) : null;
                const table = SIR.parseMarkdownTable ? SIR.parseMarkdownTable(text) : null;
                const lines = [];
                lines.push(SIR.buildDoc ? SIR.buildDoc({ id: meta.id || "pdf", type: "pdf", pages: extracted.pages, title: meta.title }) : "@DOC type=pdf");
                if (kv) lines.push(kv);
                if (table && SIR.buildTable) {
                    const t = SIR.buildTable(meta.tableName || "data", table.cols, table.rows);
                    if (t) lines.push(t);
                } else {
                    // keep a compact content tail so nothing is silently dropped
                    lines.push(`text=${text.replace(/\s+/g, " ").trim().slice(0, 1500)}`);
                }
                l3 = lines.filter(Boolean).join("\n");
            } else {
                l3 = text.slice(0, 4000);
            }
        } catch { l3 = text.slice(0, 4000); }
        return {
            l1,
            l2: { chars: text.length, preview: text.slice(0, 500) },
            l3, route: "sir",
            tokens: { rawChars: text.length }
        };
    }

    return { detectPdfKind, extractTextNative, pdfToSIR };
}));
