class AdapterError extends Error {
    constructor(message) {
        super(message);
        this.name = "AdapterError";
    }
}

class SourceAdapter {
    constructor(name) {
        this.name = name;
        this.type = "source";
    }

    async extractSession() {
        throw new AdapterError(
            `${this.name}: extractSession() is not implemented`
        );
    }
}

class DestinationAdapter {
    constructor(name) {
        this.name = name;
        this.type = "destination";
    }

    async openDestination() {
        throw new AdapterError(
            `${this.name}: openDestination() is not implemented`
        );
    }

    async prepareMigration() {
        throw new AdapterError(
            `${this.name}: prepareMigration() is not implemented`
        );
    }

    async injectContext() {
        throw new AdapterError(
            `${this.name}: injectContext() is not implemented`
        );
    }
}

module.exports = {
    AdapterError,
    SourceAdapter,
    DestinationAdapter
};