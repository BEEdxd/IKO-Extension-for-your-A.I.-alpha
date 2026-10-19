"use strict";

const {
    assertValidSessionShape
} = require("./schema");

const {
    verifyIntegrity
} = require("./integrity");

async function validateSession(session) {
    const errors = [];
    const warnings = [];

    // Basic schema validation
    try {
        assertValidSessionShape(session);
    } catch (error) {
        errors.push(error.message);
    }

    // Messages
    if (
        !Array.isArray(session.messages) ||
        session.messages.length === 0
    ) {
        errors.push(
            "Session must contain at least one message."
        );
    }

    // Message IDs and parent references
    if (Array.isArray(session.messages)) {
        const messageIds =
            new Set(
                session.messages.map(
                    (message) => message.id
                )
            );

        session.messages.forEach(
            (message) => {
                if (
                    message.parentId &&
                    !messageIds.has(
                        message.parentId
                    )
                ) {
                    errors.push(
                        `Message ${message.id} references missing parent ${message.parentId}.`
                    );
                }

                if (
                    !Array.isArray(message.content)
                ) {
                    errors.push(
                        `Message ${message.id} has invalid content.`
                    );
                }
            }
        );
    }

    // Integrity verification
    if (session.integrity) {
        const integrityResult =
            await verifyIntegrity(session);

        if (!integrityResult.valid) {
            errors.push(
                "Integrity verification failed."
            );
        }
    } else {
        warnings.push(
            "Session does not contain an integrity hash."
        );
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,

        // Validation metadata
        messageCount:
            Array.isArray(session.messages)
                ? session.messages.length
                : 0
    };
}

module.exports = {
    validateSession
};