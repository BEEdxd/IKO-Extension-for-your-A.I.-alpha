(() => {
  "use strict";

  window.IKO = window.IKO || {};

  function estimateTokens(text) {
    const tokenizer = window.GPTTokenizer_o200k_base;

    if (tokenizer && typeof tokenizer.encode === "function") {
      try {
        return tokenizer.encode(text).length;
      } catch (error) {
        console.warn("[IKO Claude] Tokenizer failed:", error);
      }
    }

    return Math.ceil(text.length / 4);
  }

  function compute(conversation) {
    const messages = conversation?.chat_messages || [];

    let totalTokens = 0;

    for (const message of messages) {
      const textParts = [];

      if (typeof message.text === "string") {
        textParts.push(message.text);
      }

      if (Array.isArray(message.content)) {
        for (const item of message.content) {
          if (typeof item?.text === "string") {
            textParts.push(item.text);
          }
        }
      }

      totalTokens += estimateTokens(textParts.join("\n"));
    }

    return {
      totalTokens,
      messageCount: messages.length,
      cachedUntil: null,
      approximate: true
    };
  }

  window.IKO.claudeTokens = {
    compute
  };
})();