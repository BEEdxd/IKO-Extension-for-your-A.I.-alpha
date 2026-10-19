const test =
    require("node:test");

const assert =
    require("node:assert/strict");

const {
    createMockSession
} =
    require("../mock/mock-session.js");

const {
    normalizeSession
} =
    require("../core/normalizer.js");

const {
    calculateIntegrityHash,
    attachIntegrityHash,
    verifyIntegrity
} =
    require("../core/integrity.js");

const {
    validateSession
} =
    require("../core/validator.js");

const {
    MigrationEngine
} =
    require("../core/migration-engine.js");

const {
    MockSourceAdapter
} =
    require("../adapters/mock-source-adapter.js");

const {
    ChatGPTDestinationAdapter
} =
    require("../adapters/chatgpt-destination-adapter.js");

const {
    ClaudeSourceAdapter
} =
    require("../adapters/claude-source-adapter.js");


test(
    "mock session contains branch data",
    () => {
        const raw =
            createMockSession();

        assert.equal(
            raw.activeLeafId,
            "m8"
        );

        assert.ok(
            raw.messages.some(
                message =>
                    message.id === "m7a"
            )
        );

        assert.ok(
            raw.messages.some(
                message =>
                    message.id === "m7b"
            )
        );
    }
);


test(
    "normalizer reconstructs active branch",
    () => {
        const session =
            normalizeSession(
                createMockSession()
            );

        const ids =
            session.messages.map(
                message =>
                    message.id
            );

        assert.deepEqual(
            ids,
            [
                "m1",
                "m2",
                "m3",
                "m4",
                "m5",
                "m6",
                "m7a",
                "m8"
            ]
        );

        assert.equal(
            ids.includes("m7b"),
            false
        );
    }
);


test(
    "normalizer records pruned branch",
    () => {
        const session =
            normalizeSession(
                createMockSession()
            );

        assert.equal(
            session.branchInfo
                .hadAlternateBranches,
            true
        );

        assert.equal(
            session.branchInfo
                .prunedBranchCount,
            1
        );

        assert.equal(
            session.branchInfo
                .activeLeafId,
            "m8"
        );
    }
);


test(
    "original URL remains unchanged",
    () => {
        const session =
            normalizeSession(
                createMockSession()
            );

        const message =
            session.messages.find(
                message =>
                    message.id === "m3"
            );

        assert.equal(
            message.content[0].text.includes(
                "https://example.com/iko"
            ),
            true
        );
    }
);


test(
    "code remains unchanged",
    () => {
        const session =
            normalizeSession(
                createMockSession()
            );

        const message =
            session.messages.find(
                message =>
                    message.id === "m4"
            );

        const code =
            message.content.find(
                block =>
                    block.type === "code"
            );

        assert.equal(
            code.code,
            `export function migrate(session) {
  return session;
}`
        );
    }
);


test(
    "attachment metadata survives",
    () => {
        const session =
            normalizeSession(
                createMockSession()
            );

        const attachment =
            session.messages[0]
                .content
                .find(
                    block =>
                        block.type === "file"
                );

        assert.equal(
            attachment.filename,
            "architecture.pdf"
        );

        assert.equal(
            attachment.mimeType,
            "application/pdf"
        );

        assert.equal(
            attachment.availability,
            "requires_user_action"
        );
    }
);


test(
    "integrity hash is deterministic",
    async () => {
        const session =
            normalizeSession(
                createMockSession()
            );

        const hash1 =
            await calculateIntegrityHash(
                session
            );

        const hash2 =
            await calculateIntegrityHash(
                session
            );

        assert.equal(
            hash1,
            hash2
        );

        assert.equal(
            hash1.length,
            64
        );
    }
);


test(
    "integrity detects modification",
    async () => {
        const session =
            normalizeSession(
                createMockSession()
            );

        await attachIntegrityHash(
            session
        );

        const original =
            await verifyIntegrity(
                session
            );

        assert.equal(
            original.valid,
            true
        );

        session.messages[0]
            .content[0]
            .text +=
            " MODIFIED";

        const modified =
            await verifyIntegrity(
                session
            );

        assert.equal(
            modified.valid,
            false
        );
    }
);


test(
    "session validation succeeds",
    async () => {
        const session =
            normalizeSession(
                createMockSession()
            );

        await attachIntegrityHash(
            session
        );

        const result =
            await validateSession(
                session
            );

        assert.equal(
            result.valid,
            true
        );

        assert.equal(
            result.messageCount,
            8
        );
    }
);


test(
    "complete migration engine succeeds",
    async () => {
        const engine =
            new MigrationEngine({
                sourceAdapter:
                    new MockSourceAdapter(),

                destinationAdapter:
                    new ChatGPTDestinationAdapter()
            });

        const result =
            await engine.run();

        assert.equal(
            result.success,
            true
        );

        assert.ok(
            result.session
        );

        assert.ok(
            result.migrationPackage
        );

        assert.equal(
            result.validation.valid,
            true
        );
    }
);


test(
    "Claude adapter is intentionally unavailable",
    async () => {
        const adapter =
            new ClaudeSourceAdapter();

        await assert.rejects(
            () =>
                adapter.extractSession(),

            /Claude bridge is not available/
        );
    }
);