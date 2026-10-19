const MIGRATION_STAGES =
    Object.freeze({
        IDLE: "idle",
        EXTRACTING: "extracting",
        NORMALIZING: "normalizing",
        VALIDATING: "validating",
        PACKAGING: "packaging",
        READY: "ready",
        OPENING_DESTINATION:
            "opening_destination",
        PREPARING_DESTINATION:
            "preparing_destination",
        REVIEW: "review",
        COMPLETED: "completed",
        FAILED: "failed"
    });

class MigrationState {
    constructor() {
        this.stage =
            MIGRATION_STAGES.IDLE;

        this.error =
            null;

        this.history = [];
    }

    transition(
        stage,
        details = {}
    ) {
        this.stage = stage;

        this.history.push({
            stage,

            timestamp:
                new Date().toISOString(),

            details
        });
    }

    fail(error) {
        this.error = {
            message:
                error instanceof Error
                    ? error.message
                    : String(error),

            timestamp:
                new Date().toISOString()
        };

        this.transition(
            MIGRATION_STAGES.FAILED,
            this.error
        );
    }

    reset() {
        this.stage =
            MIGRATION_STAGES.IDLE;

        this.error =
            null;

        this.history = [];
    }
}

module.exports = {
    MIGRATION_STAGES,
    MigrationState
};