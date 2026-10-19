import { encode } from "gpt-tokenizer";

/**
 * Counts tokens locally using an OpenAI-compatible tokenizer.
 * This counts only the text supplied to this function.
 */
export function countRealTokens(text) {
    if (!text || typeof text !== "string") {
        return 0;
    }

    try {
        return encode(text).length;
    } catch (error) {
        console.error("IKO tokenization error:", error);
        return 0;
    }
}