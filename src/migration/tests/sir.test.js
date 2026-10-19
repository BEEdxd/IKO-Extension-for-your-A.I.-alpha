const test = require("node:test");
const assert = require("node:assert/strict");
const SIR = require("../sir/sir.js");
const { createMockSession } = require("../mock/mock-session.js");

const INVOICE_TEXT = `Company: XYZ Pvt Ltd
Invoice: INV-1029
Date: 2026-10-04
Currency: INR
Total: Rs.54,000
GST: Rs.9,720`;

const MD_TABLE = `| Product | Qty | Price |
|---|---|---|
| Laptop | 2 | 50000 |
| Mouse | 5 | 500 |
| Keyboard | 2 | 1000 |`;

test("SIR spec builders are deterministic", () => {
    const a = SIR.buildEntity({ company: "XYZ", ceo: "John Smith" });
    const b = SIR.buildEntity({ company: "XYZ", ceo: "John Smith" });
    assert.equal(a, b);
    assert.ok(a.startsWith("@ENTITY"));
    assert.ok(SIR.buildDoc({ id: "abc", type: "invoice" }).startsWith("@DOC"));
    const t = SIR.buildTable("products", ["product", "qty", "price"], [["Laptop", "2", "50000"]]);
    assert.ok(t.includes("cols=product,qty,price"));
    assert.ok(t.includes("Laptop|2|50000"));
});

test("markdown table parses to compact TABLE", () => {
    const parsed = SIR.parseMarkdownTable(MD_TABLE);
    assert.deepEqual(parsed.cols, ["Product", "Qty", "Price"]);
    assert.equal(parsed.rows.length, 3);
    const t = SIR.buildTable("products", parsed.cols, parsed.rows);
    assert.ok(SIR.countTokens(t) < SIR.countTokens(MD_TABLE));
});

test("kv text extracts entities + metrics", () => {
    const sir = SIR.textToSIR(INVOICE_TEXT);
    assert.ok(sir.includes("@ENTITY"));
    assert.ok(sir.includes("@METRIC"));
    assert.ok(sir.includes("company=XYZ Pvt Ltd") || sir.includes("company=XYZ"));
});

test("image semantics: aggressive beats verbose on tokens", () => {
    const sem = { text: ["BUILDER"], objects: ["robot", "headphones"], scene: "futuristic", colors: ["purple", "orange"], composition: "robot foreground, text background" };
    const verbose = SIR.imageToSIR(sem, false);
    const aggro = SIR.imageToSIR(sem, true);
    assert.ok(aggro.includes("TXT:BUILDER"));
    assert.ok(SIR.countTokens(aggro) < SIR.countTokens(verbose));
    assert.ok(aggro.includes("OBJ:"));
});

test("SIR beats JSON on tokens for flat facts (measured, not assumed)", () => {
    const json = JSON.stringify({ name: "John", age: 25, occupation: "Developer" }, null, 2);
    const kv = SIR.buildEntity({ name: "John", age: 25, job: "Developer" });
    const ranked = SIR.compareReps({ json, kv });
    assert.equal(ranked[0].name, "kv");
    assert.ok(ranked[0].tokens < ranked[1].tokens);
});

test("session converts to deterministic SIR with turns", () => {
    const session = createMockSession();
    const a = SIR.sessionToSIR(session);
    const b = SIR.sessionToSIR(session);
    assert.equal(a, b);
    assert.ok(a.includes("@DOC"));
    assert.ok(a.includes("@TURN"));
    assert.ok(a.length < JSON.stringify(session).length);
});

test("compareReps ranks by tokens ascending", () => {
    const ranked = SIR.compareReps({ long: "word ".repeat(100), short: "hi" });
    assert.equal(ranked[0].name, "short");
});
