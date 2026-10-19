export function convertClaudeConversationToMessages(conversation) {
    const rawMessages =
        conversation.chat_messages ||
        conversation.messages ||
        [];

    const messages = [];

    for (const message of rawMessages) {
        const role =
            message.sender === "human" ||
                message.role === "user"
                ? "user"
                : message.sender === "assistant" ||
                    message.role === "assistant"
                    ? "assistant"
                    : null;

        if (!role) {
            continue;
        }

        const content = extractTextContent(message);

        if (!content.trim()) {
            continue;
        }

        messages.push({
            role,
            content
        });
    }

    return normalizeAlternatingRoles(messages);
}

function extractTextContent(message) {
    if (typeof message.text === "string") {
        return message.text;
    }

    if (typeof message.content === "string") {
        return message.content;
    }

    if (Array.isArray(message.content)) {
        return message.content
            .filter((block) => block && block.type === "text")
            .map((block) => block.text || "")
            .join("\n");
    }

    return "";
}

function normalizeAlternatingRoles(messages) {
    const result = [];

    for (const message of messages) {
        const previous = result[result.length - 1];

        if (previous && previous.role === message.role) {
            previous.content += "\n\n" + message.content;
        } else {
            result.push({
                role: message.role,
                content: message.content
            });
        }
    }

    return result;
}