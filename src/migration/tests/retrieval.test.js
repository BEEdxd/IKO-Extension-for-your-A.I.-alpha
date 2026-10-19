const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../sir/retrieval.js");
const { createMockSession } = require("../mock/mock-session.js");

function invoiceSession() {
    return {
        source: { platform: "test", conversationId: "inv-1", title: "Invoice" },
        messages: [
            { id: "m1", role: "user", content: [{ type: "text", text: "Company: XYZ Pvt Ltd\nInvoice: INV-1029\nDate: 2026-10-04" }] },
            { id: "m2", role: "assistant", content: [{ type: "text", text: "Noted invoice INV-1029 for XYZ." }] },
            { id: "m3", role: "user", content: [{ type: "text", text: "| Product | Qty | Price |\n|---|---|---|\n| Laptop | 2 | 50000 |\n| Mouse | 5 | 500 |" }] },
            { id: "m4", role: "assistant", content: [{ type: "text", text: "Revenue was Rs.12.4 Cr with 18% growth." }] }
        ]
    };
}

test("classify routes id/metric/summary to right levels", () => {
    assert.equal(R.classifyQuery("What is the invoice number?").intent, "lookup-id");
    assert.equal(R.classifyQuery("What is the invoice number?").level, "fact");
    assert.equal(R.classifyQuery("How much did revenue grow?").intent, "metric");
    assert.equal(R.classifyQuery("Summarize financial performance").intent, "summarize");
    assert.equal(R.classifyQuery("").intent, "none");
});

test("invoice-number query retrieves ID facts, not everything", () => {
    const r = R.retrieve(invoiceSession(), "What is the invoice number?");
    assert.ok(r.messageIds.includes("m1"));
    assert.ok(r.tokensMin < r.tokensFull);
    assert.ok(r.savedPct > 0);
    assert.ok(r.hits.length <= 3);
});

test("revenue query hits metrics message", () => {
    const r = R.retrieve(invoiceSession(), "How much did revenue grow?");
    assert.ok(r.messageIds.includes("m4"));
});

test("empty query returns full context (safe fallback)", () => {
    const r = R.retrieve(invoiceSession(), "");
    assert.equal(r.level, "full");
    assert.equal(r.savedPct, 0);
    assert.equal(r.messageIds.length, 4);
});

test("deterministic + formats minimal IR with sources", () => {
    const a = R.retrieve(invoiceSession(), "What is the invoice number?");
    const b = R.retrieve(invoiceSession(), "What is the invoice number?");
    assert.deepEqual(a.messageIds, b.messageIds);
    const sir = R.formatMinimal(invoiceSession(), a);
    assert.ok(sir.includes("@QUERY"));
    assert.ok(sir.includes("@HIT"));
    assert.ok(sir.includes("INV-1029"));
});

test("mock session retrieval saves tokens on targeted question", () => {
    const r = R.retrieve(createMockSession(), "What was the validation constraint?");
    assert.ok(r.tokensMin <= r.tokensFull);
    assert.ok(r.messageIds.length >= 1 && r.messageIds.length <= 8);
});
