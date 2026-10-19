const test = require("node:test");
const assert = require("node:assert/strict");
const PDF = require("../sir/pdf.js");
const SIR = require("../sir/sir.js");

// Minimal text-native PDF: two BT/ET blocks with literal strings.
function textPdfBytes() {
    const s = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >> endobj
4 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >> endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
6 0 obj << /Length 90 >> stream
BT /F1 12 Tf 72 720 Td (Company: XYZ Pvt Ltd) Tj (Invoice: INV-1029) Tj ET
endstream endobj
7 0 obj << /Length 60 >> stream
BT /F1 12 Tf 72 700 Td (Total: Rs.54000) Tj ET
endstream endobj
trailer << /Root 1 0 R >>
%%EOF`;
    return Buffer.from(s, "latin1");
}

// Image-only PDF: XObject image, zero text ops.
function scannedPdfBytes() {
    const s = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /XObject /Subtype /Image /Width 800 /Height 600 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 10 >> stream
0123456789
endstream endobj
5 0 obj << /Length 20 >> stream
q 100 0 0 100 0 0 cm /Im1 Do Q
endstream endobj
trailer << /Root 1 0 R >>
%%EOF`;
    return Buffer.from(s, "latin1");
}

test("detects text-native vs scanned without OCR", () => {
    const t = PDF.detectPdfKind(textPdfBytes());
    assert.equal(t.kind, "text-native");
    assert.ok(t.textOps >= 3);
    const s = PDF.detectPdfKind(scannedPdfBytes());
    assert.equal(s.kind, "scanned");
    assert.equal(s.textOps, 0);
    assert.ok(s.imageOps >= 1);
});

test("extracts text natively, flags scanned for OCR", () => {
    const good = PDF.extractTextNative(textPdfBytes());
    assert.equal(good.needsOcr, false);
    assert.ok(good.text.includes("Company: XYZ Pvt Ltd"));
    assert.ok(good.text.includes("INV-1029"));
    assert.equal(good.pages, 2);
    const bad = PDF.extractTextNative(scannedPdfBytes());
    assert.equal(bad.needsOcr, true);
    assert.equal(bad.text, "");
});

test("pdfToSIR routes text PDFs to SIR, scanned to OCR", () => {
    const ok = PDF.pdfToSIR(textPdfBytes(), { id: "inv", title: "Invoice" }, SIR);
    assert.equal(ok.route, "sir");
    assert.ok(ok.l3.includes("@DOC"));
    assert.ok(ok.l3.includes("INV-1029") || ok.l3.includes("XYZ"));
    const tokensRaw = SIR.countTokens("Company: XYZ Pvt Ltd Invoice: INV-1029 Total: Rs.54000");
    assert.ok(tokensRaw > 0);
    const routed = PDF.pdfToSIR(scannedPdfBytes(), {}, SIR);
    assert.equal(routed.route, "ocr-required");
    assert.equal(routed.l3, null);
});

test("deterministic: same bytes → same SIR", () => {
    const a = PDF.pdfToSIR(textPdfBytes(), { id: "x" }, SIR).l3;
    const b = PDF.pdfToSIR(textPdfBytes(), { id: "x" }, SIR).l3;
    assert.equal(a, b);
});
