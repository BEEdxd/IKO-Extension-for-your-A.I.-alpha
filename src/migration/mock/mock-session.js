function createMockSession() {
    return {
        platform: "mock",

        conversationId:
            "mock-conversation-001",

        title:
            "Building IKO One-Click Session Migration",

        model:
            "mock-model",

        createdAt:
            "2026-09-22T10:00:00.000Z",

        updatedAt:
            "2026-09-22T11:00:00.000Z",

        extractorVersion:
            "mock-1.0.0",

        activeLeafId:
            "m8",

        instructions: [
            {
                id: "instruction-1",

                text:
                    "Preserve technical decisions exactly during migration."
            }
        ],

        messages: [
            {
                id: "m1",

                role: "user",

                parentId: null,

                content: [
                    {
                        type: "text",

                        text:
                            `I am building IKO.

The migration system must preserve the meaning of my conversation exactly.

Constraint: do not rewrite code or URLs.`
                    },

                    {
                        type: "file",

                        filename:
                            "architecture.pdf",

                        mimeType:
                            "application/pdf",

                        availability:
                            "requires_user_action"
                    }
                ]
            },

            {
                id: "m2",

                role: "assistant",

                parentId: "m1",

                content: [
                    {
                        type: "text",

                        text:
                            `Understood.

The migration layer should preserve the original conversation rather than summarize it.

The architecture will use a canonical session format.`
                    }
                ]
            },

            {
                id: "m3",

                role: "user",

                parentId: "m2",

                content: [
                    {
                        type: "text",

                        text:
                            `Use JavaScript for the migration engine.

The project must run with Node.js tests.

Reference:
https://example.com/iko`
                    }
                ]
            },

            {
                id: "m4",

                role: "assistant",

                parentId: "m3",

                content: [
                    {
                        type: "code",

                        language: "javascript",

                        code:
                            `export function migrate(session) {
  return session;
}`
                    },

                    {
                        type: "text",

                        text:
                            `The code above must remain byte-for-byte unchanged.`
                    }
                ]
            },

            {
                id: "m5",

                role: "tool",

                parentId: "m4",

                content: [
                    {
                        type: "tool",

                        name: "test_runner",

                        input: {
                            command:
                                "npm test"
                        },

                        output: {
                            status:
                                "passed"
                        }
                    }
                ]
            },

            {
                id: "m6",

                role: "user",

                parentId: "m5",

                content: [
                    {
                        type: "text",

                        text:
                            `Decision:

The migration engine must validate the session before creating the migration package.

Do not remove this constraint later.`
                    }
                ]
            },

            {
                id: "m7a",

                role: "assistant",

                parentId: "m6",

                content: [
                    {
                        type: "text",

                        text:
                            `Decision recorded.

The migration engine will validate before packaging.`
                    }
                ]
            },

            {
                id: "m7b",

                role: "assistant",

                parentId: "m6",

                content: [
                    {
                        type: "text",

                        text:
                            `Alternate branch:

The validation stage could theoretically happen after packaging.`
                    }
                ]
            },

            {
                id: "m8",

                role: "user",

                parentId: "m7a",

                content: [
                    {
                        type: "text",

                        text:
                            `Continue from the original decision.

The migration must preserve:

1. The validation-before-packaging constraint.
2. The JavaScript implementation.
3. The URL.
4. The exact code.
5. The attachment placeholder.

Table:

| Requirement | Status |
|---|---|
| Validation | Required |
| Code preservation | Required |
| URL preservation | Required |`
                    }
                ]
            }
        ]
    };
}

module.exports = {
    createMockSession
};