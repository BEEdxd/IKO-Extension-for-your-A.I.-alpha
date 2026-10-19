const {
    SourceAdapter
} = require("./adapter-interface.js");

const {
    createMockSession
} = require("../mock/mock-session.js");

class MockSourceAdapter
    extends SourceAdapter {

    constructor() {
        super("Mock Source");
    }

    async extractSession() {
        return createMockSession();
    }
}

module.exports = {
    MockSourceAdapter
};