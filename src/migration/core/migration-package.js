const {
    SCHEMA_VERSION
} = require("./schema.js");

const {
    calculateIntegrityHash
} = require("./integrity.js");

const MIGRATION_PACKAGE_VERSION =
    "1.0.0";

async function createMigrationPackage(
    session
) {
    const contentHash =
        await calculateIntegrityHash(
            session
        );

    return {
        packageVersion:
            MIGRATION_PACKAGE_VERSION,

        schemaVersion:
            SCHEMA_VERSION,

        createdAt:
            new Date().toISOString(),

        source: {
            ...session.source
        },

        session:
            structuredClone(session),

        integrity: {
            contentHash,

            messageCount:
                session.messages.length,

            algorithm:
                "SHA-256"
        },

        migration: {
            status:
                "prepared",

            destination:
                null,

            migratedAt:
                null
        }
    };
}

function serializeMigrationPackage(
    migrationPackage
) {
    return JSON.stringify(
        migrationPackage,
        null,
        2
    );
}

function deserializeMigrationPackage(
    serialized
) {
    const parsed =
        JSON.parse(serialized);

    if (
        parsed.packageVersion !==
        MIGRATION_PACKAGE_VERSION
    ) {
        throw new Error(
            `Unsupported migration package version: ${parsed.packageVersion}`
        );
    }

    return parsed;
}

module.exports = {
    MIGRATION_PACKAGE_VERSION,
    createMigrationPackage,
    serializeMigrationPackage,
    deserializeMigrationPackage
};