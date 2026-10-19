import { encode } from "gpt-tokenizer";

window.IKO = window.IKO || {};

window.IKO.token = {
    count(text) {
        if (!text || typeof text !== "string") {
            return 0;
        }

        try {
            return encode(text).length;
        } catch (error) {
            console.error("[IKO] Tokenizer error:", error);
            return 0;
        }
    }
};