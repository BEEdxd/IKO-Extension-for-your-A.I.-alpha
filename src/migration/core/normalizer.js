const {
    createEmptySession,
    assertValidSessionShape
} = require("./schema.js");

function clone(value) {
    return structuredClone(value);
}

function normalizeContent(content) {
    if (!Array.isArray(content)) {
        return [
            {
                type: "text",
                text: String(content ?? "")
            }
        ];
    }

    return content.map(block => clone(block));
}

function resolveActiveBranch(
    messages,
    activeLeafId
) {
    const byId = new Map();

    for (const message of messages) {
        byId.set(message.id, message);
    }

    const branch = [];
    const visited = new Set();

    let currentId = activeLeafId;

    while (
        currentId !== null &&
        currentId !== undefined
    ) {
        if (visited.has(currentId)) {
            throw new Error(
                `Conversation cycle detected at message ${currentId}`
            );
        }

        visited.add(currentId);

        const message = byId.get(currentId);

        if (!message) {
            throw new Error(
                `Message ${currentId} was not found while reconstructing active branch`
            );
        }

        branch.push(message);

        currentId =
            message.parentId ?? null;
    }

    branch.reverse();

    return branch;
}

function normalizeSession(raw) {
    if (!raw || typeof raw !== "object") {
        throw new Error(
            "A source session is required"
        );
    }

    if (!raw.platform) {
        throw new Error(
            "Source session is missing platform"
        );
    }

    if (!raw.conversationId) {
        throw new Error(
            "Source session is missing conversationId"
        );
    }

    const session =
        createEmptySession({
            platform: raw.platform,

            conversationId:
                raw.conversationId,

            extractorVersion:
                raw.extractorVersion ?? "unknown"
        });

    session.source.title =
        raw.title ?? null;

    session.source.model =
        raw.model ?? null;

    session.source.createdAt =
        raw.createdAt ?? null;

    session.source.updatedAt =
        raw.updatedAt ?? null;

    const rawMessages =
        Array.isArray(raw.messages)
            ? raw.messages
            : [];

    let activeMessages =
        rawMessages;

    if (raw.activeLeafId) {
        activeMessages =
            resolveActiveBranch(
                rawMessages,
                raw.activeLeafId
            );
    }

    const activeIds =
        new Set(
            activeMessages.map(
                message => message.id
            )
        );

    const alternateMessages =
        rawMessages.filter(
            message =>
                !activeIds.has(message.id)
        );

    session.messages =
        activeMessages.map(
            message => ({
                id: message.id,

                role: message.role,

                sourceRole:
                    message.sourceRole ??
                    message.role,

                content:
                    normalizeContent(
                        message.content
                    ),

                parentId:
                    message.parentId ?? null,

                siblingBranchIds:
                    Array.isArray(
                        message.siblingBranchIds
                    )
                        ? [
                            ...message.siblingBranchIds
                        ]
                        : undefined,

                timestamp:
                    message.timestamp ?? null,

                model:
                    message.model ?? null,

                raw:
                    message.raw
                        ? clone(message.raw)
                        : undefined
            })
        );

    session.instructions =
        Array.isArray(raw.instructions)
            ? clone(raw.instructions)
            : [];

    session.branchInfo = {
        hadAlternateBranches:
            alternateMessages.length > 0,

        prunedBranchCount:
            alternateMessages.length,

        activeLeafId:
            raw.activeLeafId ?? null
    };

    assertValidSessionShape(
        session
    );

    return session;
}

module.exports = {
    normalizeSession,
    resolveActiveBranch
};