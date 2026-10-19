"use strict";
// Attachment Token Saver — local-only. Watches file uploads (images/PDFs),
// estimates their LLM token cost, and compresses images via canvas so the
// model consumes fewer tokens. No uploads leave the browser.
window.IKO = window.IKO || {};

const MAX_DIM = 1024;
const JPEG_Q = 0.72;
const seenFiles = []; // {id, name, kind, size, width, height, origTokens, file}
let seq = 0;

function estimateImageTokens(w, h, detail = "high") {
    if (!w || !h) return 1500;
    if (detail === "low") return 85;
    const tiles = Math.ceil(w / 512) * Math.ceil(h / 512);
    return 85 + 170 * Math.min(tiles, 12);
}

function estimatePdfTokens(sizeBytes) {
    return Math.max(500, Math.ceil(sizeBytes / 4));
}

function fmtKB(n) {
    return n > 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;
}
function fmtTok(n) {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

function loadImageDims(file) {
    return new Promise((resolve) => {
        try {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                const w = img.naturalWidth || 0, h = img.naturalHeight || 0;
                URL.revokeObjectURL(url);
                resolve({ w, h });
            };
            img.onerror = () => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } resolve({ w: 0, h: 0 }); };
            img.src = url;
        } catch { resolve({ w: 0, h: 0 }); }
    });
}

async function compressImage(file, maxDim = MAX_DIM, quality = JPEG_Q) {
    const dims = await loadImageDims(file);
    const scale = Math.min(1, maxDim / Math.max(dims.w || maxDim, dims.h || maxDim, 1));
    const w = Math.max(1, Math.round((dims.w || 800) * scale));
    const h = Math.max(1, Math.round((dims.h || 600) * scale));
    const bmp = await (async () => {
        try {
            if (window.createImageBitmap) return await createImageBitmap(file);
            throw new Error("no-bitmap");
        } catch {
            const url = URL.createObjectURL(file);
            try {
                await new Promise((res, rej) => {
                    const img = new Image();
                    img.onload = res; img.onerror = rej; img.src = url;
                });
                const img = new Image();
                img.src = url;
                await img.decode().catch(() => {});
                return img;
            } finally { setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }, 5000); }
        }
    })();
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    try { ctx.drawImage(bmp, 0, 0, w, h); } catch { /* ignore */ }
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (bmp?.close) { try { bmp.close(); } catch { /* ignore */ } }
    return { blob, w, h, origW: dims.w, origH: dims.h };
}

function compactDescriptor(rec, opt) {
    const dim = opt ? `${opt.w}x${opt.h}` : rec.width && rec.height ? `${rec.width}x${rec.height}` : "?";
    const size = opt ? `${fmtKB(rec.size)}→${fmtKB(opt.blob?.size || rec.size)}` : fmtKB(rec.size);
    const tok = opt ? `${fmtTok(rec.origTokens)}→${fmtTok(opt.newTokens)}` : `~${fmtTok(rec.origTokens)}`;
    return `[media:${rec.kind} ${rec.name} ${dim} ${size} tokens:${tok}]`;
}

function countTextTokens(t) {
    try {
        const sir = window.IKOSIRCore;
        if (sir?.countTokens) return Math.max(1, Math.round(sir.countTokens(t)));
    } catch { /* ignore */ }
    return Math.max(1, Math.ceil(String(t || "").length / 4));
}

async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; }
    catch {
        try {
            const ta = document.createElement("textarea");
            ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
            document.body.appendChild(ta); ta.select();
            const ok = document.execCommand("copy"); ta.remove();
            return !!ok;
        } catch { return false; }
    }
}

function downloadBlob(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { try { URL.revokeObjectURL(a.href); } catch { /* ignore */ } a.remove(); }, 5000);
}

// Fast dominant-color sample (24x24, 12-bit quantized) — gives the text block
// some visual signal even when no OCR engine is installed.
async function samplePalette(blob, max = 5) {
    try {
        let src = null, url = null;
        try { src = await createImageBitmap(blob); }
        catch {
            url = URL.createObjectURL(blob);
            const img = new Image();
            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
            src = img;
        }
        const S = 24;
        const c = document.createElement("canvas"); c.width = S; c.height = S;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(src, 0, 0, S, S);
        const d = ctx.getImageData(0, 0, S, S).data;
        const counts = new Map();
        for (let i = 0; i < S * S; i++) {
            const q = (((d[i * 4] >> 4) << 8) | ((d[i * 4 + 1] >> 4) << 4) | (d[i * 4 + 2] >> 4));
            counts.set(q, (counts.get(q) || 0) + 1);
        }
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([q]) => {
            const r = ((q >> 8) & 15) * 17, g = ((q >> 4) & 15) * 17, b = (q & 15) * 17;
            return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
        });
        if (src?.close) { try { src.close(); } catch { /* ignore */ } }
        if (url) setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }, 3000);
        return top;
    } catch { return []; }
}

// The photo→text block: descriptor + @IMAGE semantics + OCR text (when an
// engine is present) + dominant colors. Compact by design — this is what
// replaces the image to actually save tokens.
function buildImageText(rec, out, newTokens, savedPct, ocrText, palette) {
    const head = compactDescriptor(rec, { ...out, newTokens });
    const lines = [head, "@IMAGE"];
    try {
        const sir = window.IKOSIRCore;
        if (sir?.imageToSIR) {
            const block = sir.imageToSIR({
                text: ocrText ? [String(ocrText).slice(0, 1200)] : [],
                colors: palette || [],
                scene: `${rec.name} ${out.w}x${out.h}`
            }, false);
            if (block) {
                // imageToSIR already emits its own @IMAGE header — keep ours single.
                lines.push(String(block).replace(/^@IMAGE\n?/, ""));
            }
        } else {
            if (palette?.length) lines.push(`colors=${palette.join(",")}`);
        }
    } catch { /* keep manual fallback below */ }
    if (ocrText) lines.push(`text=${String(ocrText).slice(0, 1500)}`);
    else lines.push("text=(no OCR engine — install Tesseract vendor or register window.IKOOCR.peer for text extraction)");
    if (palette?.length && !lines.some(l => l.startsWith("colors="))) lines.push(`colors=${palette.join(",")}`);
    lines.push(`note=delete the attached image and paste this block instead to hold ~${fmtTok(newTokens)} image→~${fmtTok(countTextTokens(lines.join("\n")))} text (−${savedPct}% image tokens)`);
    return lines.join("\n");
}

// Append text to the site composer without replacing what the user typed.
function appendToComposer(text) {
    try {
        const C = window.IKOComposer;
        const comp = C?.findComposer?.();
        if (!comp) return { ok: false, reason: "composer-not-found" };
        const cur = (comp.tagName === "TEXTAREA" || comp.tagName === "INPUT")
            ? (comp.value || "")
            : ((comp.innerText || comp.textContent || "").trim());
        const next = cur ? `${cur}\n\n${text}` : text;
        if (C?.writeComposerText) {
            C.writeComposerText(comp, next);
            return { ok: true };
        }
        try { comp.focus(); } catch { /* ignore */ }
        if (document.execCommand("insertText", false, `\n\n${text}`)) return { ok: true };
        return { ok: false, reason: "write-failed" };
    } catch (e) { return { ok: false, reason: String(e?.message || e).slice(0, 120) }; }
}

function recordFile(file) {
    try {
        if (!file || seenFiles.some(f => f.name === file.name && f.size === file.size)) return null;
        const isImg = /^image\//.test(file.type || "") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name || "");
        const isPdf = /pdf/i.test(file.type || "") || /\.pdf$/i.test(file.name || "");
        if (!isImg && !isPdf) return null;
        const rec = {
            id: `att-${++seq}-${Date.now() % 100000}`,
            name: file.name || `upload-${seq}`,
            kind: isImg ? "image" : "pdf",
            size: file.size || 0,
            width: 0, height: 0,
            origTokens: isPdf ? estimatePdfTokens(file.size || 0) : 1500,
            file
        };
        seenFiles.unshift(rec);
        if (seenFiles.length > 20) seenFiles.pop();
        if (isImg) {
            loadImageDims(file).then(({ w, h }) => {
                rec.width = w; rec.height = h;
                rec.origTokens = estimateImageTokens(w || 1024, h || 1024);
                renderBadge();
            });
        }
        try { window.IKO?.logger?.info?.("Attachments", "file detected", { name: rec.name, kind: rec.kind, size: rec.size }); } catch { /* ignore */ }
        renderBadge();
        return rec;
    } catch { return null; }
}

function hookFileInputs() {
    try {
        document.addEventListener("change", (e) => {
            const t = e.target;
            if (t instanceof HTMLInputElement && t.type === "file" && t.files?.length) {
                for (const f of t.files) recordFile(f);
            }
        }, true);
        // drag-drop onto composer
        document.addEventListener("drop", (e) => {
            try {
                const files = e.dataTransfer?.files;
                if (files?.length) for (const f of files) recordFile(f);
            } catch { /* ignore */ }
        }, true);
    } catch { /* ignore */ }
}

function renderBadge() {
    try {
        const btn = document.getElementById("iko-hud-files");
        if (!btn) return;
        const total = seenFiles.reduce((t, f) => t + (f.origTokens || 0), 0);
        const label = btn.querySelector(".iko-btn-label");
        if (label) label.textContent = seenFiles.length ? `Files·~${fmtTok(total)}` : "Files";
        else btn.textContent = seenFiles.length ? `Files·~${fmtTok(total)}` : "Files";
        btn.title = seenFiles.length
            ? `${seenFiles.length} upload(s) detected · ~${fmtTok(total)} tokens. Click to optimize.`
            : "No uploads detected yet. Attach an image/PDF to optimize it.";
    } catch { /* ignore */ }
}

function openPanel() {
    try { document.getElementById("iko-attachments-panel")?.remove(); } catch { /* ignore */ }
    const mkBtn = (text, title, primary) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "iko-att-btn" + (primary ? " primary" : "");
        b.textContent = text;
        if (title) b.title = title;
        return b;
    };
    const root = document.createElement("div");
    root.id = "iko-attachments-panel";
    const n = seenFiles.length;
    root.innerHTML = `
        <div class="iko-att">
            <header class="iko-att-head">
                <div class="iko-att-headtxt">
                    <div class="iko-att-title">Attachments${n ? ` <span class="iko-att-count">${n}</span>` : ""}</div>
                    <div class="iko-att-sub">Shrink images to text before sending.</div>
                </div>
                <button type="button" class="iko-att-x" aria-label="Close">×</button>
            </header>
            <div class="iko-att-body">
                <div class="iko-att-list" id="iko-att-list"></div>
                <div class="iko-att-foot">Images cost ~170 tokens per 512px tile. Shrink to text replaces one with ~100 tokens of text — paste the block instead of the image, then remove the original.</div>
            </div>
        </div>`;
    root.querySelector(".iko-att-x")?.addEventListener("click", () => root.remove());
    // Group the theme switch with the close button
    try {
        const head = root.querySelector(".iko-att-head");
        const closeBtn = root.querySelector(".iko-att-x");
        if (head && closeBtn && window.IKOTheme) {
            const actions = document.createElement("div");
            actions.className = "iko-header-actions";
            const themeBtn = window.IKOTheme.button();
            if (themeBtn) actions.appendChild(themeBtn);
            actions.appendChild(closeBtn);
            head.appendChild(actions);
        }
    } catch { /* ignore */ }
    root.addEventListener("click", (e) => { if (e.target === root) root.remove(); });
    const list = root.querySelector("#iko-att-list");
    const render = () => {
        list.innerHTML = "";
        if (!seenFiles.length) {
            const empty = document.createElement("div");
            empty.className = "iko-att-empty";
            empty.textContent = "No uploads yet. Attach a file, then reopen.";
            list.appendChild(empty);
            return;
        }
        for (const rec of seenFiles) {
            const card = document.createElement("div");
            card.className = "iko-att-card";
            const top = document.createElement("div");
            top.className = "iko-att-top";
            const name = document.createElement("div");
            name.className = "iko-att-name";
            name.textContent = rec.name;
            name.title = rec.name;
            const pill = document.createElement("div");
            pill.className = "iko-att-tokens";
            pill.textContent = `~${fmtTok(rec.origTokens)}`;
            pill.title = "Estimated cost if sent as-is";
            top.append(name, pill);
            const meta = document.createElement("div");
            meta.className = "iko-att-meta";
            const dim = rec.width ? `${rec.width}×${rec.height} · ` : "";
            meta.textContent = `${rec.kind} · ${dim}${fmtKB(rec.size)}`;
            const status = document.createElement("div");
            status.className = "iko-att-status";
            status.hidden = true;
            const say = (text, ok = true) => {
                status.hidden = false;
                status.textContent = text;
                status.classList.toggle("bad", !ok);
            };
            const btns = document.createElement("div");
            btns.className = "iko-att-actions";
            if (rec.kind === "image") {
                // Primary: photo → text. Compress in memory, try local OCR,
                // build the compact text block and copy it. NO download.
                const shrink = document.createElement("button");
                shrink.type = "button"; shrink.className = "iko-att-btn primary";
                shrink.textContent = "Shrink to text";
                shrink.title = "Compress to a text block and copy it";
                shrink.addEventListener("click", async () => {
                    shrink.disabled = true;
                    shrink.textContent = "Working…";
                    try {
                        const out = await compressImage(rec.file);
                        const newTokens = estimateImageTokens(out.w, out.h);
                        const saved = Math.max(0, Math.round((1 - newTokens / Math.max(1, rec.origTokens)) * 100));
                        let ocrText = "";
                        try {
                            const ocr = window.IKOOCRCore, sir = window.IKOSIRCore;
                            if (ocr?.scannedToSIR) {
                                const res = await ocr.scannedToSIR(out.blob, { id: rec.name, title: rec.name, kind: "image" }, sir || null);
                                if (res?.route === "sir" && res.l3) ocrText = String(res.l3);
                            }
                        } catch { /* text block still useful without OCR */ }
                        const palette = await samplePalette(out.blob, 5);
                        const fullText = buildImageText(rec, out, newTokens, saved, ocrText, palette);
                        const copied = await copyText(fullText);
                        rec._lastCompressed = out;
                        rec._lastText = fullText;
                        rec._lastSaved = saved;
                        const txtTok = fmtTok(countTextTokens(fullText));
                        pill.textContent = `~${fmtTok(newTokens)} ▸ ~${txtTok} text`;
                        say(`${rec.width || "?"}×${rec.height || "?"} → ${out.w}×${out.h} · −${saved}%${ocrText ? " · OCR" : " · no OCR"} · ${copied ? "copied — remove the image" : "copy blocked — use Insert"}`);
                        try { window.IKO?.logger?.info?.("Attachments", "shrunk-to-text", { name: rec.name, savedPct: saved, ocr: !!ocrText }); } catch { /* ignore */ }
                        shrink.textContent = `−${saved}% ✓`;
                        ensureInsertBtn();
                    } catch (err) { shrink.textContent = "Failed"; }
                    finally {
                        shrink.disabled = false;
                        setTimeout(() => { shrink.textContent = "Shrink to text"; }, 2500);
                    }
                });
                btns.appendChild(shrink);
                // Insert the last built text block into the composer (append, no replace).
                const ensureInsertBtn = () => {
                    if (btns.querySelector("[data-iko-insert]")) return;
                    const ins = document.createElement("button");
                    ins.type = "button"; ins.className = "iko-att-btn";
                    ins.textContent = "Insert";
                    ins.setAttribute("data-iko-insert", "1");
                    ins.title = "Append the text block to the chat box";
                    ins.addEventListener("click", async () => {
                        try {
                            if (!rec._lastText) { ins.textContent = "Shrink first"; setTimeout(() => { ins.textContent = "Insert"; }, 1500); return; }
                            const r = appendToComposer(rec._lastText);
                            ins.textContent = r.ok ? "Inserted ✓" : "Composer? — copied";
                            if (!r.ok) await copyText(rec._lastText);
                        } catch { ins.textContent = "Failed"; }
                        setTimeout(() => { ins.textContent = "Insert"; }, 2000);
                    });
                    btns.appendChild(ins);
                };
                if (rec._lastText) ensureInsertBtn();
                // Opt-in only: the resized JPEG download (old behavior, no longer automatic).
                const jpeg = document.createElement("button");
                jpeg.type = "button"; jpeg.className = "iko-att-btn";
                jpeg.textContent = "JPEG";
                jpeg.title = "Download the resized file (optional)";
                jpeg.addEventListener("click", async () => {
                    jpeg.textContent = "…";
                    try {
                        const out = rec._lastCompressed || await compressImage(rec.file);
                        rec._lastCompressed = out;
                        downloadBlob(out.blob, rec.name.replace(/\.\w+$/, "") + "-iko-1024.jpg");
                        jpeg.textContent = "Saved";
                    } catch { jpeg.textContent = "Failed"; }
                    setTimeout(() => { jpeg.textContent = "JPEG"; }, 2000);
                });
                btns.appendChild(jpeg);
                const ocrBtn = document.createElement("button");
                ocrBtn.type = "button"; ocrBtn.className = "iko-att-btn";
                ocrBtn.textContent = "OCR";
                ocrBtn.title = "Run local OCR if installed";
                ocrBtn.addEventListener("click", async () => {
                    ocrBtn.textContent = "…";
                    try {
                        const ocr = window.IKOOCRCore;
                        const sir = window.IKOSIRCore;
                        if (!ocr) throw new Error("OCR engine loading — wait 2s and retry");
                        const res = await ocr.scannedToSIR(rec.file, { id: rec.name, title: rec.name, kind: rec.kind }, sir || null);
                        if (res.route === "sir") {
                            try { await navigator.clipboard.writeText(res.l3); } catch { /* ignore */ }
                            say(`OCR copied · conf ${Number(res.ocr.confidence || 0).toFixed(2)} · ${res.ocr.engine}`);
                            ocrBtn.textContent = "Copied";
                        } else {
                            say(`No OCR engine — add Tesseract or IKOOCR.peer`, false);
                            ocrBtn.textContent = "No engine";
                        }
                    } catch (err) { ocrBtn.textContent = "Failed"; }
                    setTimeout(() => { ocrBtn.textContent = "OCR"; }, 2000);
                });
                btns.appendChild(ocrBtn);
            } else {
                const parse = document.createElement("button");
                parse.type = "button"; parse.className = "iko-att-btn primary";
                parse.textContent = "Parse";
                parse.title = "Extract text to a compact block and copy it";
                parse.addEventListener("click", async () => {
                    parse.textContent = "…";
                    try {
                        const pdf = window.IKOPDFCore;
                        const sir = window.IKOSIRCore;
                        if (!pdf) throw new Error("PDF engine loading — wait 2s and retry");
                        const buf = await rec.file.arrayBuffer();
                        const res = pdf.pdfToSIR(buf, { id: rec.name, title: rec.name }, sir || null);
                        if (res.route === "ocr-required") {
                            say(`Scanned PDF · needs OCR · flagged`, false);
                            try { await navigator.clipboard.writeText(`[media:pdf ${rec.name} pages=${res.l1.pages || "?"} status=needs-ocr]`); } catch { /* ignore */ }
                            parse.textContent = "Flagged";
                        } else {
                            const before = sir ? sir.countTokens(res.l2.preview + "") : res.l1.chars / 4;
                            const after = sir ? sir.countTokens(res.l3) : res.l3.length / 4;
                            try { await navigator.clipboard.writeText(res.l3); } catch { /* ignore */ }
                            say(`${res.l1.pages}p · ~${Math.round(before)} → ~${Math.round(after)} · copied`);
                            try { window.IKO?.logger?.info?.("Attachments", "pdf parsed", { name: rec.name, pages: res.l1.pages }); } catch { /* ignore */ }
                            parse.textContent = "Copied";
                        }
                    } catch (err) { parse.textContent = "Failed"; say(`Parse failed: ${String(err?.message || err).slice(0, 100)}`, false); }
                    setTimeout(() => { parse.textContent = "Parse"; }, 2000);
                });
                const cp = document.createElement("button");
                cp.type = "button"; cp.className = "iko-att-btn";
                cp.textContent = "Copy";
                cp.title = "Copy a one-line descriptor";
                cp.addEventListener("click", async () => {
                    try { await navigator.clipboard.writeText(compactDescriptor(rec, null)); cp.textContent = "Copied"; }
                    catch { cp.textContent = "Blocked"; }
                    setTimeout(() => { cp.textContent = "Copy"; }, 1500);
                });
                btns.append(parse, cp);
                const ocrBtn = document.createElement("button");
                ocrBtn.type = "button"; ocrBtn.className = "iko-att-btn";
                ocrBtn.textContent = "OCR";
                ocrBtn.title = "Scanned pages need a local OCR engine";
                ocrBtn.addEventListener("click", async () => {
                    ocrBtn.textContent = "…";
                    try {
                        const ocr = window.IKOOCRCore;
                        const sir = window.IKOSIRCore;
                        if (!ocr) throw new Error("OCR engine loading — wait 2s and retry");
                        const buf = await rec.file.arrayBuffer();
                        // Scanned PDFs need page raster (pdf.js render) before pixels exist —
                        // try peer/VLM directly on the blob; honest route when absent.
                        const res = await ocr.scannedToSIR(rec.file, { id: rec.name, title: rec.name, kind: "pdf-scan" }, sir || null);
                        void buf;
                        if (res.route === "sir") {
                            try { await navigator.clipboard.writeText(res.l3); } catch { /* ignore */ }
                            say(`OCR copied · conf ${Number(res.ocr.confidence || 0).toFixed(2)}`);
                            ocrBtn.textContent = "Copied";
                        } else {
                            say(`No OCR engine — screenshot the page or add Tesseract`, false);
                            ocrBtn.textContent = "No engine";
                        }
                    } catch (err) { ocrBtn.textContent = "Failed"; }
                    setTimeout(() => { ocrBtn.textContent = "OCR"; }, 2000);
                });
                btns.appendChild(ocrBtn);
            }
            card.append(top, meta, status, btns);
            list.appendChild(card);
        }
    };
    render();
    document.body.appendChild(root);
}

window.IKO.attachments = {
    recordFile, compressImage, estimateImageTokens, estimatePdfTokens,
    list: () => [...seenFiles], openPanel, compactDescriptor
};
try { window.addEventListener("iko-attachments-requested", openPanel); } catch { /* ignore */ }
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hookFileInputs, { once: true });
else hookFileInputs();
export { compressImage, estimateImageTokens, estimatePdfTokens };
