const SCHEMA_VERSION = "1.0.0";

const SESSION_ROLES = Object.freeze([
    "user",
    "assistant",
    "system",
    "tool"
]);

const CONTENT_TYPES = Object.freeze([
    "text",
    "code",
    "image",
    "file",
    "link",
    "table",
    "tool",
    "sir",
    "unsupported"
]);

function createEmptySession({
    platform,
    conversationId,
    extractorVersion = "unknown"
}) {
    return {
        schemaVersion: SCHEMA_VERSION,

        source: {
            platform,
            conversationId,
            title: null,
            model: null,
            createdAt: null,
            updatedAt: null,
            extractedAt: new Date().toISOString(),
            extractorVersion
        },

        messages: [],

        branchInfo: {
            hadAlternateBranches: false,
            prunedBranchCount: 0,
            activeLeafId: null
        },

        instructions: [],

        integrity: {
            messageCount: 0,
            contentHash: null,
            hashAlgorithm: "SHA-256"
        },

        migrationMeta: {}
    };
}

class SessionSchemaError extends Error {
    constructor(errors) {
        super(
            `Invalid session:\n- ${errors.join("\n- ")}`
        );

        this.name = "SessionSchemaError";
        this.errors = errors;
    }
}

function assertValidSessionShape(session) {
    const errors = [];

    if (!session || typeof session !== "object") {
        throw new SessionSchemaError([
            "Session must be an object"
        ]);
    }

    if (session.schemaVersion !== SCHEMA_VERSION) {
        errors.push(
            `Expected schema ${SCHEMA_VERSION}, got ${session.schemaVersion}`
        );
    }

    if (!session.source?.platform) {
        errors.push("source.platform is required");
    }

    if (!session.source?.conversationId) {
        errors.push("source.conversationId is required");
    }

    if (!Array.isArray(session.messages)) {
        errors.push("messages must be an array");
    }

    if (!Array.isArray(session.instructions)) {
        errors.push("instructions must be an array");
    }

    const ids = new Set();

    for (const [index, message] of session.messages.entries()) {
        if (!message.id) {
            errors.push(
                `messages[${index}].id is required`
            );
        }

        if (ids.has(message.id)) {
            errors.push(
                `Duplicate message id: ${message.id}`
            );
        }

        ids.add(message.id);

        if (!SESSION_ROLES.includes(message.role)) {
            errors.push(
                `messages[${index}] has invalid role: ${message.role}`
            );
        }

        if (!Array.isArray(message.content)) {
            errors.push(
                `messages[${index}].content must be an array`
            );

            continue;
        }

        if (message.content.length === 0) {
            errors.push(
                `messages[${index}].content cannot be empty`
            );
        }

        for (
            const [blockIndex, block]
            of message.content.entries()
        ) {
            if (!block || typeof block !== "object") {
                errors.push(
                    `messages[${index}].content[${blockIndex}] must be an object`
                );

                continue;
            }

            if (!CONTENT_TYPES.includes(block.type)) {
                errors.push(
                    `messages[${index}].content[${blockIndex}] has invalid type: ${block.type}`
                );
            }
        }
    }

    if (errors.length > 0) {
        throw new SessionSchemaError(errors);
    }

    return true;
}

module.exports = {
    SCHEMA_VERSION,
    SESSION_ROLES,
    CONTENT_TYPES,
    createEmptySession,
    SessionSchemaError,
    assertValidSessionShape
};