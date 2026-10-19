const {
    normalizeSession
} = require("./normalizer.js");

const {
    attachIntegrityHash
} = require("./integrity.js");

const {
    validateSession
} = require("./validator.js");

const {
    createMigrationPackage
} = require("./migration-package.js");

const {
    MigrationState,
    MIGRATION_STAGES
} = require("./migration-state.js");

class MigrationEngine {
    constructor({
        sourceAdapter,
        destinationAdapter
    }) {
        if (!sourceAdapter) {
            throw new Error(
                "sourceAdapter is required"
            );
        }

        if (!destinationAdapter) {
            throw new Error(
                "destinationAdapter is required"
            );
        }

        this.source =
            sourceAdapter;

        this.destination =
            destinationAdapter;

        this.state =
            new MigrationState();
    }

    async run() {
        const elog = (msg, data) => {
            try {
                if (globalThis.window?.IKO?.logger) globalThis.window.IKO.logger.info("Engine", msg, data);
                else console.log(`[IKO:Engine] ${msg}`, data ?? "");
            } catch { /* ignore */ }
        };
        try {
            // STEP 1 — EXTRACT

            elog("stage: extracting");

            this.state.transition(
                MIGRATION_STAGES.EXTRACTING
            );

            const rawSession =
                await this.source.extractSession();

            // STEP 2 — NORMALIZE

            this.state.transition(
                MIGRATION_STAGES.NORMALIZING
            );

            const session =
                normalizeSession(
                    rawSession
                );

            // STEP 3 — INTEGRITY

            await attachIntegrityHash(
                session
            );

            // STEP 4 — VALIDATE

            this.state.transition(
                MIGRATION_STAGES.VALIDATING
            );

            const validation =
                await validateSession(
                    session
                );

            if (!validation.valid) {
                throw new Error(
                    [
                        "Migration validation failed:",
                        ...validation.errors
                    ].join("\n")
                );
            }

            // STEP 5 — PACKAGE

            this.state.transition(
                MIGRATION_STAGES.PACKAGING
            );

            const migrationPackage =
                await createMigrationPackage(
                    session
                );

            elog("stage: ready", { messages: session.messages.length });

            // STEP 6 — READY

            this.state.transition(
                MIGRATION_STAGES.READY
            );

            return {
                success: true,

                session,

                migrationPackage,

                validation,

                state: this.state
            };
        } catch (error) {
            this.state.fail(error);

            return {
                success: false,

                error,

                state: this.state
            };
        }
    }

    async prepareDestination(
        migrationPackage
    ) {
        try {
            this.state.transition(
                MIGRATION_STAGES.OPENING_DESTINATION
            );

            const opened =
                await this.destination
                    .openDestination(
                        migrationPackage
                    );

            if (
                opened?.status ===
                "not_connected"
            ) {
                throw new Error(
                    opened.message
                );
            }

            this.state.transition(
                MIGRATION_STAGES.PREPARING_DESTINATION
            );

            const prepared =
                await this.destination
                    .prepareMigration(
                        migrationPackage
                    );

            this.state.transition(
                MIGRATION_STAGES.REVIEW
            );

            return {
                success: true,

                prepared,

                state: this.state
            };
        } catch (error) {
            this.state.fail(error);

            return {
                success: false,

                error,

                state: this.state
            };
        }
    }
}

module.exports = {
    MigrationEngine
};