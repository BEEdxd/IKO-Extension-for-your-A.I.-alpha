(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // src/injected/claude-bridge.js
  var require_claude_bridge = __commonJS({
    "src/injected/claude-bridge.js"() {
      (function() {
        "use strict";
        if (window.__IKO_CLAUDE_BRIDGE_INSTALLED__) {
          return;
        }
        window.__IKO_CLAUDE_BRIDGE_INSTALLED__ = true;
        const BRIDGE_SOURCE = "IKO_CLAUDE_BRIDGE";
        function publish(type, payload) {
          window.postMessage(
            {
              source: BRIDGE_SOURCE,
              type,
              payload
            },
            "*"
          );
        }
        function inspectUrl(input) {
          try {
            if (typeof input === "string") {
              return input;
            }
            if (input instanceof URL) {
              return input.href;
            }
            if (input && typeof input.url === "string") {
              return input.url;
            }
            return String(input || "");
          } catch {
            return "";
          }
        }
        function isConversationUrl(url) {
          const u = String(url || "").toLowerCase();
          return u.includes("/chat_conversations/") || u.includes("/conversations/") || u.includes("/conversation/") || u.includes("/api/") && (u.includes("chat") || u.includes("conversation") || u.includes("message"));
        }
        function isUsageUrl(url) {
          return url.includes("/usage");
        }
        const originalFetch = window.fetch;
        window.fetch = async function(...args) {
          const response = await originalFetch.apply(this, args);
          const url = inspectUrl(args[0]);
          try {
            if (isConversationUrl(url)) {
              const clone = response.clone();
              clone.json().then((data) => {
                publish("CONVERSATION_DATA", {
                  url,
                  data
                });
              }).catch(() => {
              });
            }
            if (isUsageUrl(url)) {
              const clone = response.clone();
              clone.json().then((data) => {
                publish("USAGE_DATA", {
                  url,
                  data
                });
              }).catch(() => {
              });
            }
          } catch (error) {
            console.debug("[IKO Claude] Fetch inspection failed:", error);
          }
          return response;
        };
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;
        let lastConversation = null;
        let lastUsage = null;
        function remember(type, payload) {
          if (type === "CONVERSATION_DATA") lastConversation = payload || null;
          if (type === "USAGE_DATA") lastUsage = payload || null;
        }
        const origPublish = publish;
        publish = function(type, payload) {
          remember(type, payload);
          origPublish(type, payload);
        };
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
          this.__ikoUrl = String(url || "");
          return originalOpen.call(this, method, url, ...rest);
        };
        XMLHttpRequest.prototype.send = function(...args) {
          const xhr = this;
          const url = xhr.__ikoUrl || "";
          if (isConversationUrl(url) || isUsageUrl(url)) {
            xhr.addEventListener("load", function() {
              try {
                const data = JSON.parse(xhr.responseText);
                publish(
                  isUsageUrl(url) ? "USAGE_DATA" : "CONVERSATION_DATA",
                  {
                    url,
                    data
                  }
                );
              } catch {
              }
            });
          }
          return originalSend.apply(this, args);
        };
        window.addEventListener("message", function(event) {
          try {
            if (event.source !== window) return;
            const msg = event.data;
            if (!msg || msg.source !== "IKO_CLAUDE_CONTENT" || msg.type !== "REQUEST_REFRESH") return;
            if (lastConversation) origPublish("CONVERSATION_DATA", lastConversation);
            if (lastUsage) origPublish("USAGE_DATA", lastUsage);
            if (!lastConversation && !lastUsage) origPublish("BRIDGE_EMPTY", { href: location.href });
          } catch {
          }
        });
        publish("BRIDGE_READY", {
          href: location.href
        });
      })();
    }
  });
  require_claude_bridge();
})();
