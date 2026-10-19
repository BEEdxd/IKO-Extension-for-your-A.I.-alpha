const test = require("node:test");
const assert = require("node:assert/strict");
const OCR = require("../sir/ocr.js");
const SIR = require("../sir/sir.js");

function fakeImageData(w, h, fn) {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
            const [r, g, b] = fn(x, y);
            const o = (y * w + x) * 4;
            data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
        }
    }
    return { width: w, height: h, data };
}

test("preprocess is deterministic + 2x + grayscale", () => {
    const src = fakeImageData(4, 2, (x) => [x * 60, 100, 200]);
    const a = OCR.preprocessImageData(src);
    const b = OCR.preprocessImageData(src);
    assert.equal(a.width, 8);
    assert.equal(a.height, 4);
    assert.deepEqual([...a.data], [...b.data]);
    // gray: r==g==b, alpha 255
    assert.equal(a.data[0], a.data[1]);
    assert.equal(a.data[1], a.data[2]);
    assert.equal(a.data[3], 255);
});

test("recognize without engine routes honestly (never garbage)", async () => {
    const src = fakeImageData(8, 8, () => [255, 255, 255]);
    const r = await OCR.recognize(src);
    assert.equal(r.text, "");
    assert.ok(["ocr-engine-missing", "ocr-empty", "ocr-failed"].includes(r.route));
    assert.equal(r.engine === "none" ? "none" : r.engine, r.engine);
});

test("peer engine plugs in universal interface", async () => {
    global.window = global.window || {};
    global.window.IKOOCR = global.window.IKOOCR || {};
    global.window.IKOOCR.peer = {
        recognize: async () => ({ text: "BUILDER robot headphones", confidence: 92 })
    };
    const src = fakeImageData(4, 4, () => [0, 0, 0]);
    const r = await OCR.recognize(src);
    assert.equal(r.route, "ocr-text");
    assert.ok(r.text.includes("BUILDER"));
    assert.ok(r.confidence > 0.9 && r.confidence <= 1);
    delete global.window.IKOOCR.peer;
});

test("scannedToSIR wraps OCR text in SIR with confidence", async () => {
    global.window = global.window || {};
    global.window.IKOOCR = global.window.IKOOCR || {};
    global.window.IKOOCR.peer = {
        recognize: async () => ({ text: "Invoice INV-1029 Total Rs.54000", confidence: 90 })
    };
    const src = fakeImageData(4, 4, () => [0, 0, 0]);
    const res = await OCR.scannedToSIR(src, { id: "scan1", title: "Scan" }, SIR);
    assert.equal(res.route, "sir");
    assert.ok(res.l3.includes("@DOC"));
    assert.ok(res.l3.includes("@CONF"));
    assert.ok(res.ocr.confidence > 0);
    delete global.window.IKOOCR.peer;
});

test("empty OCR normalizes to ocr-empty, not fake text", async () => {
    global.window = global.window || {};
    global.window.IKOOCR = global.window.IKOOCR || {};
    global.window.IKOOCR.peer = { recognize: async () => ({ text: "   ", confidence: 10 }) };
    const src = fakeImageData(2, 2, () => [255, 255, 255]);
    const r = await OCR.recognize(src);
    assert.equal(r.route, "ocr-empty");
    delete global.window.IKOOCR.peer;
});
