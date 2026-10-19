const test = require("node:test");
const assert = require("node:assert/strict");
const { detectRole, extractTextDeep, parseBridgeMessages } = require("../adapters/claude-source-adapter.js");

test("detectRole handles sender/role/author variants", () => {
    assert.equal(detectRole({ sender: "human" }), "user");
    assert.equal(detectRole({ sender: "assistant" }), "assistant");
    assert.equal(detectRole({ role: "user" }), "user");
    assert.equal(detectRole({ role: "assistant" }), "assistant");
    assert.equal(detectRole({ author: { role: "assistant" } }), "assistant");
    assert.equal(detectRole({ author_role: "human" }), "user");
    assert.equal(detectRole({ from: "ai" }), "assistant");
    assert.equal(detectRole({ message: { sender: "human" } }), "user");
    assert.equal(detectRole({ sender: "system-notif" }), null);
    assert.equal(detectRole(null), null);
});

test("extractTextDeep unwraps strings, blocks and nested shells", () => {
    assert.equal(extractTextDeep("hello"), "hello");
    assert.equal(extractTextDeep({ text: "  hi  " }), "hi");
    assert.equal(extractTextDeep({ content: "c" }), "c");
    assert.equal(extractTextDeep({ completion: "done" }), "done");
    assert.equal(
        extractTextDeep({ content: [{ type: "text", text: "a" }, { type: "thinking", thinking: "hmm" }] }),
        "a"
    );
    assert.equal(extractTextDeep({ message: { message: { text: "deep" } } }), "deep");
    assert.equal(extractTextDeep({ content: [{ type: "tool_use", input: {} }] }), "");
    assert.equal(extractTextDeep(null), "");
});

test("parseBridgeMessages normalizes chat_messages with chain links", () => {
    const conv = {
        uuid: "conv-1",
        chat_messages: [
            { uuid: "1", sender: "human", text: "Hello Claude" },
            { uuid: "2", sender: "assistant", content: [{ type: "text", text: "Hi there" }] }
        ]
    };
    const out = parseBridgeMessages(conv);
    assert.equal(out.length, 2);
    assert.equal(out[0].role, "user");
    assert.equal(out[1].role, "assistant");
    assert.equal(out[0].parentId, null);
    assert.equal(out[1].parentId, "1");
    assert.ok(out[1].content.includes("Hi there"));
});

test("parseBridgeMessages accepts messages[] + author shapes, skips unknowns", () => {
    const conv = {
        messages: [
            { id: "a", author: { role: "user" }, content: "Q?" },
            { id: "b", role: "assistant", message: { content: "A." } },
            { id: "c", sender: "system-notif", text: "joined" },
            { id: "d", sender: "assistant", text: "   " }
        ]
    };
    const out = parseBridgeMessages(conv);
    assert.equal(out.map(m => m.id).join(","), "a,b");
});

test("parseBridgeMessages returns [] on unknown shapes (caller falls back)", () => {
    assert.deepEqual(parseBridgeMessages(null), []);
    assert.deepEqual(parseBridgeMessages({}), []);
    assert.deepEqual(parseBridgeMessages({ name: "Empty", uuid: "x" }), []);
});
