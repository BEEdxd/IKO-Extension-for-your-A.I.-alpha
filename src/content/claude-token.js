import { encode } from "gpt-tokenizer";

window.IKO = window.IKO || {};

function getMessageList(conversation) {
    if (Array.isArray(conversation?.chat_messages)) {
        return conversation.chat_messages;
    }

    if (Array.isArray(conversation?.messages)) {
        return conversation.messages;
    }

    if (Array.isArray(conversation?.conversation?.chat_messages)) {
        return conversation.conversation.chat_messages;
    }

    return [];
}

function getMessageId(message) {
    return (
        message?.uuid ||
        message?.id ||
        message?.message_uuid ||
        null
    );
}

function getParentId(message) {
    return (
        message?.parent_message_uuid ||
        message?.parent_uuid ||
        message?.parent_id ||
        null
    );
}

function getLeafId(conversation) {
    return (
        conversation?.current_leaf_message_uuid ||
        conversation?.current_leaf_uuid ||
        conversation?.leaf_message_uuid ||
        conversation?.conversation?.current_leaf_message_uuid ||
        null
    );
}

function extractContent(value) {
    if (typeof value === "string") {
        return value;
    }

    if (Array.isArray(value)) {
        return value
            .map(block => extractContent(block))
            .filter(Boolean)
            .join("\n");
    }

    if (!value || typeof value !== "object") {
        return "";
    }

    if (typeof value.text === "string") {
        return value.text;
    }

    if (typeof value.content === "string") {
        return value.content;
    }

    if (value.content) {
        return extractContent(value.content);
    }

    if (value.input) {
        return JSON.stringify(value.input);
    }

    if (value.output) {
        return JSON.stringify(value.output);
    }

    return "";
}

function extractMessageText(message) {
    const possibleContent =
        message?.content ??
        message?.message?.content ??
        message?.text ??
        message?.message?.text ??
        "";

    return extractContent(possibleContent).trim();
}

function getActiveBranch(conversation) {
    const messages = getMessageList(conversation);

    if (!messages.length) {
        return [];
    }

    const byId = new Map();

    for (const message of messages) {
        const id = getMessageId(message);

        if (id) {
            byId.set(id, message);
        }
    }

    let currentId = getLeafId(conversation);

    // If Claude does not provide a leaf ID, use the last available message.
    if (!currentId) {
        const last = messages[messages.length - 1];
        currentId = getMessageId(last);
    }

    const branch = [];
    const visited = new Set();

    while (currentId && !visited.has(currentId)) {
        visited.add(currentId);

        const message = byId.get(currentId);

        if (!message) {
            break;
        }

        branch.push(message);
        currentId = getParentId(message);
    }

    return branch.reverse();
}

function countText(text) {
    if (!text) {
        return 0;
    }

    try {
        return encode(text).length;
    } catch (error) {
        console.error("[IKO Claude] Tokenizer failed:", error);
        return 0;
    }
}

function countConversation(conversation) {
    const branch = getActiveBranch(conversation);

    if (!branch.length) {
        return {
            totalTokens: 0,
            messageCount: 0,
            approximate: true,
            status: "No active Claude branch found"
        };
    }

    let totalTokens = 0;
    let countedMessages = 0;

    for (const message of branch) {
        const role =
            message?.sender ||
            message?.role ||
            message?.message?.role ||
            "unknown";

        const text = extractMessageText(message);

        if (!text) {
            continue;
        }

        // Add a small role separator so user/assistant boundaries are not merged.
        const serializedMessage = `${role}:\n${text}\n`;

        totalTokens += countText(serializedMessage);
        countedMessages++;
    }

    return {
        totalTokens,
        messageCount: countedMessages,
        approximate: true,
        status: "Conversation tree counted locally",
        source: "Claude conversation tree + local tokenizer"
    };
}

window.IKO.claudeTokens = {
    getActiveBranch,
    extractMessageText,
    countConversation
};