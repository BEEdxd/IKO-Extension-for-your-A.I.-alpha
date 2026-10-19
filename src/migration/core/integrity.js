"use strict";

function stableSortObject(value) {
    if (Array.isArray(value)) {
        return value.map(stableSortObject);
    }

    if (
        value !== null &&
        typeof value === "object"
    ) {
        const sorted = {};

        Object.keys(value)
            .sort()
            .forEach((key) => {
                sorted[key] =
                    stableSortObject(value[key]);
            });

        return sorted;
    }

    return value;
}

function canonicalizeSession(session) {
    return stableSortObject({
        schemaVersion: session.schemaVersion,
        source: session.source,
        metadata: session.metadata,
        messages: session.messages,
        branchInfo: session.branchInfo,
        instructions: session.instructions
    });
}

function canonicalizeForHash(session) {
    return JSON.stringify(
        canonicalizeSession(session)
    );
}

function bytesToHex(buffer) {
    const bytes = new Uint8Array(buffer);

    return Array.from(bytes)
        .map((byte) =>
            byte.toString(16).padStart(2, "0")
        )
        .join("");
}

async function calculateIntegrityHash(session) {
    if (
        typeof globalThis === "undefined" ||
        !globalThis.crypto ||
        !globalThis.crypto.subtle
    ) {
        throw new Error(
            "Web Crypto API is not available."
        );
    }

    const canonical =
        canonicalizeForHash(session);

    const encoder = new TextEncoder();

    const data =
        encoder.encode(canonical);

    const digest =
        await globalThis.crypto.subtle.digest(
            "SHA-256",
            data
        );

    return bytesToHex(digest);
}

async function attachIntegrityHash(session) {
    const hash =
        await calculateIntegrityHash(session);

    session.integrity = {
        algorithm: "SHA-256",
        hash
    };

    return session;
}

async function verifyIntegrity(session) {
    if (
        !session.integrity ||
        !session.integrity.hash
    ) {
        return {
            valid: false,
            reason: "Integrity hash is missing."
        };
    }

    const expectedHash =
        await calculateIntegrityHash(session);

    const actualHash =
        session.integrity.hash;

    return {
        valid:
            expectedHash === actualHash,

        expectedHash,
        actualHash
    };
}

module.exports = {
    stableSortObject,
    canonicalizeSession,
    canonicalizeForHash,
    calculateIntegrityHash,
    attachIntegrityHash,
    verifyIntegrity
};