"use strict";
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // src/content/claude-bridge-client.js
  var require_claude_bridge_client = __commonJS({
    "src/content/claude-bridge-client.js"() {
      window.IKO = window.IKO || {};
      window.IKO.claudeBridge = {
        latestConversation: null,
        latestConversationUrl: "",
        latestUsage: null,
        ready: false,
        requestConversationRefresh() {
          window.postMessage(
            {
              source: "IKO_CLAUDE_CONTENT",
              type: "REQUEST_REFRESH"
            },
            "*"
          );
        }
      };
      window.addEventListener("message", (event) => {
        if (event.source !== window) {
          return;
        }
        const message = event.data;
        if (!message || message.source !== "IKO_CLAUDE_BRIDGE") {
          return;
        }
        if (message.type === "BRIDGE_READY") {
          window.IKO.claudeBridge.ready = true;
          console.log("[IKO Claude] Bridge ready");
        }
        if (message.type === "CONVERSATION_DATA") {
          window.IKO.claudeBridge.latestConversation = message.payload?.data || null;
          window.IKO.claudeBridge.latestConversationUrl = message.payload?.url || "";
          window.dispatchEvent(
            new CustomEvent("iko-claude-conversation-updated")
          );
        }
        if (message.type === "USAGE_DATA") {
          window.IKO.claudeBridge.latestUsage = message.payload?.data || null;
          window.dispatchEvent(
            new CustomEvent("iko-claude-usage-updated")
          );
        }
      });
    }
  });

  // src/content/composer-io.js
  var require_composer_io = __commonJS({
    "src/content/composer-io.js"(exports, module) {
      "use strict";
      function isEditable(el) {
        if (!el || el.nodeType !== 1) return false;
        const tag = el.tagName;
        if (tag === "TEXTAREA" || tag === "INPUT") return true;
        if (el.isContentEditable === true) return true;
        try {
          return el.getAttribute?.("contenteditable") === "true" || el.getAttribute?.("contenteditable") === "";
        } catch {
          return false;
        }
      }
      function resolveEditable(el) {
        if (!el || el.nodeType !== 1) return el;
        if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return el;
        if (isEditable(el) && el.tagName !== "RICH-TEXTAREA") return el;
        const findInner = (root) => {
          try {
            return root.querySelector?.(
              "[contenteditable='true'], div[role='textbox'], [role='textbox'], textarea"
            ) || null;
          } catch {
            return null;
          }
        };
        if (el.shadowRoot) {
          const inner = findInner(el.shadowRoot);
          if (inner && isEditable(inner)) return inner;
        }
        const lightInner = findInner(el);
        if (lightInner && isEditable(lightInner)) return lightInner;
        return isEditable(el) ? el : el;
      }
      function deepQueryAll(selector) {
        const out = [];
        const seen = /* @__PURE__ */ new Set();
        const pushAll = (root) => {
          try {
            for (const n of root.querySelectorAll(selector)) {
              if (!seen.has(n)) {
                seen.add(n);
                out.push(n);
              }
            }
          } catch {
          }
          try {
            for (const n of root.querySelectorAll("*")) {
              if (n.shadowRoot) pushAll(n.shadowRoot);
              if (out.length > 200) break;
            }
          } catch {
          }
        };
        pushAll(document);
        return out;
      }
      function findComposer() {
        const selectors = [
          "#prompt-textarea",
          "[data-testid='chat-input']",
          ".ProseMirror",
          "div.ProseMirror[contenteditable='true']",
          "rich-textarea",
          "rich-textarea [contenteditable='true']",
          "[aria-label*='prompt' i]",
          "[aria-label*='Ask' i]",
          "[placeholder*='Ask' i]",
          ".ql-editor[contenteditable='true']",
          "div[role='textbox']",
          "fieldset [contenteditable='true']",
          "form textarea",
          "form [contenteditable='true']",
          "form [role='textbox']",
          "textarea",
          "[contenteditable='true']",
          "[role='textbox']"
        ];
        const candidates = [];
        const add = (element, editable, bottom, area, selector) => {
          if (!element) return;
          candidates.push({ element, editable: !!editable, bottom, area, selector });
        };
        for (const selector of selectors) {
          try {
            deepQueryAll(selector).forEach((element) => {
              const resolved = resolveEditable(element) || element;
              let rect;
              try {
                rect = resolved.getBoundingClientRect();
              } catch {
                rect = null;
              }
              rect = rect || { width: 0, height: 0, bottom: -1, top: 9999 };
              const editable = isEditable(resolved);
              const visible = rect.width > 180 && rect.height > 18 && rect.bottom > 0 && rect.top < innerHeight;
              if (visible && editable) {
                add(resolved, true, rect.bottom, rect.width * rect.height, selector);
              } else if (element.tagName === "RICH-TEXTAREA") {
                const inner = element.shadowRoot?.querySelector?.("[contenteditable='true']") || element.querySelector?.("[contenteditable='true']");
                if (inner && isEditable(inner)) {
                  let r2;
                  try {
                    r2 = inner.getBoundingClientRect();
                  } catch {
                    r2 = null;
                  }
                  r2 = r2 || { width: 300, height: 50, bottom: innerHeight - 100 };
                  add(inner, true, r2.bottom || innerHeight - 100, r2.width * r2.height || 5e4, selector + "::shadow");
                }
              }
            });
          } catch {
          }
        }
        if (!candidates.length) {
          try {
            const labelled = document.querySelector("[aria-label*='Ask Gemini' i], [placeholder*='Ask Gemini' i]");
            if (labelled) {
              const inner = resolveEditable(labelled) || labelled.shadowRoot?.querySelector?.("[contenteditable]") || labelled;
              if (isEditable(inner)) add(inner, true, innerHeight - 100, 5e4, "ask-gemini-fallback");
            }
          } catch {
          }
        }
        try {
          window.IKO?.logger?.info?.("Composer", "scan", { found: candidates.length, sels: candidates.slice(0, 4).map((c) => c.selector) });
        } catch {
        }
        if (!candidates.length) return null;
        candidates.sort((a, b) => b.editable - a.editable || b.bottom - a.bottom || b.area - a.area);
        return candidates[0].element;
      }
      function selectContents(el) {
        try {
          const selection = window.getSelection?.();
          if (!selection) return false;
          const range = document.createRange();
          range.selectNodeContents(el);
          selection.removeAllRanges();
          selection.addRange(range);
          return true;
        } catch {
          return false;
        }
      }
      function caretToEnd(el) {
        try {
          const selection = window.getSelection?.();
          if (!selection) return false;
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
          return true;
        } catch {
          return false;
        }
      }
      function fireInput(el, value) {
        try {
          el.dispatchEvent(new InputEvent("input", {
            bubbles: true,
            composed: true,
            inputType: "insertText",
            data: value
          }));
        } catch {
          try {
            el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
          } catch {
          }
        }
      }
      function writeComposerText(element, value) {
        if (!element) return false;
        const el = resolveEditable(element) || element;
        const text = String(value ?? "");
        try {
          el.focus();
        } catch {
        }
        if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
          const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          let setter;
          try {
            setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
          } catch {
            setter = null;
          }
          try {
            setter ? setter.call(el, text) : el.value = text;
          } catch {
            el.value = text;
          }
          fireInput(el, text);
          try {
            el.dispatchEvent(new Event("change", { bubbles: true }));
          } catch {
          }
          return true;
        }
        if (!isEditable(el)) return false;
        selectContents(el);
        let applied = false;
        try {
          applied = document.execCommand("insertText", false, text);
        } catch {
          applied = false;
        }
        const read = () => {
          const raw = el.innerText ?? el.textContent ?? "";
          return String(raw).replace(/\s+/g, " ").trim();
        };
        const want = text.replace(/\s+/g, " ").trim();
        const ok = applied && want.length > 0 && read() === want;
        if (!ok) {
          try {
            el.textContent = text;
          } catch {
          }
          caretToEnd(el);
          fireInput(el, text);
        }
        return true;
      }
      var api = { isEditable, resolveEditable, deepQueryAll, findComposer, writeComposerText };
      try {
        window.IKOComposer = api;
      } catch {
      }
      module.exports = api;
    }
  });

  // src/content/theme.js
  var require_theme = __commonJS({
    "src/content/theme.js"() {
      "use strict";
      (function() {
        if (window.IKOTheme) return;
        const KEY = "ikoTheme";
        const ATTR = "data-iko-theme";
        const VALID = { dark: 1, light: 1 };
        let stored = null;
        const readLocal = () => {
          try {
            return localStorage.getItem(KEY);
          } catch {
            return null;
          }
        };
        const writeLocal = (theme) => {
          try {
            if (theme) localStorage.setItem(KEY, theme);
            else localStorage.removeItem(KEY);
          } catch {
          }
        };
        const systemDark = () => {
          try {
            return !!window.matchMedia("(prefers-color-scheme: dark)").matches;
          } catch {
            return false;
          }
        };
        const effective = () => VALID[stored] ? stored : systemDark() ? "dark" : "light";
        const paint = () => {
          const theme = effective();
          try {
            document.documentElement.setAttribute(ATTR, theme);
          } catch {
          }
          return theme;
        };
        function syncButtons() {
          const dark = paint() === "dark";
          try {
            document.querySelectorAll(".iko-theme-toggle").forEach((btn) => {
              const label = dark ? "Switch to light mode" : "Switch to dark mode";
              btn.setAttribute("aria-pressed", dark ? "true" : "false");
              btn.setAttribute("aria-label", label);
              btn.title = label;
            });
          } catch {
          }
          return dark;
        }
        function persist(theme) {
          writeLocal(theme);
          try {
            globalThis.chrome?.storage?.local?.set?.({ [KEY]: theme });
          } catch {
          }
        }
        function set(theme) {
          stored = VALID[theme] ? theme : null;
          persist(stored);
          syncButtons();
          try {
            window.dispatchEvent(new CustomEvent("iko-theme-changed", { detail: { theme: effective() } }));
          } catch {
          }
        }
        function toggle() {
          set(effective() === "dark" ? "light" : "dark");
          return effective();
        }
        const SUN = '<svg class="iko-theme-icon iko-theme-sun" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><circle cx="12" cy="12" r="4.1"/><path d="M12 1.7v3.4M12 18.9v3.4M1.7 12h3.4M18.9 12h3.4M4.7 4.7l2.4 2.4M16.9 16.9l2.4 2.4M19.3 4.7l-2.4 2.4M7.1 16.9l-2.4 2.4"/></svg>';
        const MOON = '<svg class="iko-theme-icon iko-theme-moon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="M20.4 15.1A8.8 8.8 0 0 1 8.9 3.6a8.8 8.8 0 1 0 11.5 11.5z"/></svg>';
        function button(extraClass) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "iko-theme-toggle" + (extraClass ? " " + extraClass : "");
          btn.innerHTML = SUN + MOON;
          btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            toggle();
          });
          syncButtons();
          return btn;
        }
        stored = readLocal();
        paint();
        try {
          globalThis.chrome?.storage?.local?.get?.([KEY], (res) => {
            const v = res && res[KEY];
            if (VALID[v] && v !== stored) {
              stored = v;
              writeLocal(v);
              syncButtons();
            }
          });
        } catch {
        }
        try {
          window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
            if (!stored) syncButtons();
          });
        } catch {
        }
        window.IKOTheme = {
          set,
          toggle,
          button,
          syncButtons,
          isDark: () => effective() === "dark",
          KEY,
          ATTR
        };
      })();
    }
  });

  // src/content/ui.js
  var require_ui = __commonJS({
    "src/content/ui.js"() {
      "use strict";
      var import_composer_io = __toESM(require_composer_io());
      var import_theme = __toESM(require_theme());
      try {
        window.IKOComposer = window.IKOComposer || import_composer_io.default;
      } catch {
      }
      window.IKO = window.IKO || {};
      window.IKO.ui = {
        hud: null,
        repositionTimer: null,
        /*
         * ==========================================
         * COMPOSER-DOCKED HUD POSITION
         * ==========================================
         *
         * The HUD sits fixed on the AI text box,
         * Tally-style: just above the composer,
         * right-aligned to it. Same card UI —
         * only the anchor changed.
         *
         * A user drag still wins (pinned spot).
         */
        // Locate the site's chat composer box.
        composerBox() {
          try {
            const el = window.IKOComposer?.findComposer?.();
            if (!el || !el.getBoundingClientRect) {
              return null;
            }
            const r = el.getBoundingClientRect();
            if (!r || r.width < 120 || r.height < 10) {
              return null;
            }
            if (r.bottom <= 0 || r.top >= window.innerHeight) {
              return null;
            }
            return r;
          } catch {
            return null;
          }
        },
        position() {
          const hud = this.hud || document.getElementById(
            "iko-context-hud"
          );
          if (!hud) {
            return;
          }
          if (hud.dataset.pinned === "1") {
            hud.style.setProperty("position", "fixed", "important");
            hud.style.setProperty("z-index", "2147483640", "important");
            const margin = 12;
            const rect = hud.getBoundingClientRect();
            const width = rect.width || hud.offsetWidth || 270;
            const height = rect.height || hud.offsetHeight || 200;
            const left = Math.max(
              margin,
              Math.min(
                rect.left,
                window.innerWidth - width - margin
              )
            );
            const top = Math.max(
              margin,
              Math.min(
                rect.top,
                window.innerHeight - height - margin
              )
            );
            hud.style.setProperty("left", `${left}px`, "important");
            hud.style.setProperty("top", `${top}px`, "important");
            hud.style.setProperty("right", "auto", "important");
            hud.style.setProperty("bottom", "auto", "important");
            return;
          }
          hud.style.right = "24px";
          hud.style.bottom = "105px";
          hud.style.left = "auto";
          hud.style.top = "auto";
        },
        /*
         * ==========================================
         * POSITION TRACKING
         * ==========================================
         */
        startPositionTracking() {
          this.position();
          window.addEventListener(
            "resize",
            () => this.position()
          );
          if (this.repositionTimer) {
            clearInterval(
              this.repositionTimer
            );
          }
          this.repositionTimer = setInterval(
            () => {
              this.position();
              try {
                if (!document.getElementById("iko-bot")) this.ensureBot();
                const hud = document.getElementById("iko-context-hud");
                if (hud && !hud.querySelector("#iko-hud-actions")) {
                  this.ensureActionsIn(hud);
                  this.wireActions();
                }
                if (hud) {
                  this.ensureThemeToggle(hud);
                  this.wireHudDrag();
                }
              } catch {
              }
            },
            2e3
          );
        },
        /*
         * ==========================================
         * CREATE HUD
         * ==========================================
         */
        create() {
          const existing = document.getElementById(
            "iko-context-hud"
          );
          if (existing) {
            this.hud = existing;
            this.ensureBot();
            this.ensureActionsIn(existing);
            this.ensureThemeToggle(existing);
            this.wireActions();
            this.wireHudDrag();
            this.position();
            return;
          }
          const hud = document.createElement("div");
          hud.id = "iko-context-hud";
          hud.style.width = "300px";
          hud.style.minWidth = "270px";
          hud.style.height = "auto";
          hud.style.boxSizing = "border-box";
          hud.innerHTML = `
            <div class="iko-hud-main">

                <!-- HEADER -->
                <div class="iko-hud-top">

                    <div class="iko-hud-brand">
                        <span
                            class="iko-hud-dot"
                        ></span>

                        <span>IKO</span>
                    </div>

                    <span
                        id="iko-hud-platform"
                        class="iko-hud-platform"
                    >
                        AI
                    </span>

                </div>


                <!-- STATS -->
                <div class="iko-hud-stats">

                    <div
                        class="iko-hud-stat"
                    >
                        <span>
                            Context
                        </span>

                        <strong
                            id="iko-hud-tokens"
                        >
                            0
                        </strong>
                    </div>


                    <div
                        class="iko-hud-stat"
                    >
                        <span>
                            Usage
                        </span>

                        <strong
                            id="iko-hud-usage"
                        >
                            0%
                        </strong>
                    </div>

                </div>

                <label class="iko-hud-alert-control" for="iko-hud-alert-threshold">
                    Alert at
                    <select id="iko-hud-alert-threshold" aria-label="Context warning threshold">
                        <option value="50">50%</option>
                        <option value="60">60%</option>
                        <option value="70">70%</option>
                        <option value="80" selected>80%</option>
                    </select>
                </label>


                <!-- LOADING -->
                <div
                    class="iko-hud-loading"
                    id="iko-hud-loading"
                    hidden
                >
                    <span
                        id="iko-hud-loading-text"
                    >
                        Counting context\u2026
                    </span>
                </div>


                <!-- MAIN PROGRESS -->
                <div
                    class="iko-hud-progress"
                >
                    <div
                        id="iko-hud-progress-bar"
                    ></div>
                </div>


                <!-- STATUS -->
                <div
                    id="iko-hud-status"
                    class="iko-hud-status"
                >
                    Ready
                </div>


                <!-- ACTIONS: Migrate + Optimize + Files in same HUD -->
                <div class="iko-hud-actions" id="iko-hud-actions">
                    <button type="button" id="iko-hud-migrate" title="Migrate this session to another LLM">
                        <svg class="iko-hud-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="M3.5 12h14"/><path d="m11.5 5 7 7-7 7"/></svg>
                        <span class="iko-btn-label">Migrate</span>
                    </button>
                    <button type="button" id="iko-hud-optimize" title="Optimize your current prompt">
                        <span class="iko-btn-label">Optimize</span>
                    </button>
                    <button type="button" id="iko-hud-files" title="Optimize image/PDF uploads to save tokens">
                        <span class="iko-btn-label">Files</span>
                    </button>
                </div>

            </div>
        `;
          document.documentElement.appendChild(
            hud
          );
          this.hud = hud;
          this.ensureBot();
          this.ensureThemeToggle(hud);
          this.wireAlertThreshold();
          this.wireActions();
          this.wireHudDrag();
          const platform = window.IKO?.platform?.detect?.();
          const platformElement = document.getElementById(
            "iko-hud-platform"
          );
          if (platformElement) {
            platformElement.textContent = platform || "AI";
          }
          requestAnimationFrame(
            () => this.position()
          );
          this.startPositionTracking();
        },
        wireAlertThreshold() {
          const select = document.getElementById("iko-hud-alert-threshold");
          if (!select || select.dataset.wired) return;
          select.dataset.wired = "1";
          window.IKO = window.IKO || {};
          window.IKO.config = window.IKO.config || {};
          const key = "ikoContextAlertThreshold";
          const allowed = [50, 60, 70, 80];
          const apply = (raw) => {
            const value = allowed.includes(Number(raw)) ? Number(raw) : 80;
            select.value = String(value);
            window.IKO.config.contextAlertThreshold = value;
          };
          apply(80);
          try {
            if (globalThis.chrome?.storage?.local) {
              chrome.storage.local.get([key], (result) => apply(result?.[key]));
            } else {
              apply(localStorage.getItem(key));
            }
          } catch {
          }
          select.addEventListener("change", () => {
            const value = Number(select.value);
            apply(value);
            try {
              if (globalThis.chrome?.storage?.local) chrome.storage.local.set({ [key]: value });
              else localStorage.setItem(key, String(value));
            } catch {
            }
            window.dispatchEvent(new CustomEvent("iko-context-threshold-changed"));
          });
        },
        // Moon/sun theme switch in the HUD header strip
        ensureThemeToggle(hudRoot) {
          try {
            const top = hudRoot.querySelector(".iko-hud-top");
            if (!top || top.querySelector(".iko-theme-toggle")) return;
            const theme = window.IKOTheme;
            if (!theme) return;
            top.appendChild(
              theme.button("iko-theme-toggle-sm")
            );
          } catch {
          }
        },
        // Backfill actions row into HUDs created by older builds
        ensureActionsIn(hudRoot) {
          try {
            if (hudRoot.querySelector("#iko-hud-actions")) return;
            const main = hudRoot.querySelector(".iko-hud-main");
            if (!main) return;
            const wrap = document.createElement("div");
            wrap.className = "iko-hud-actions";
            wrap.id = "iko-hud-actions";
            wrap.innerHTML = '<button type="button" id="iko-hud-migrate" title="Migrate this session to another LLM"><svg class="iko-hud-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="M3.5 12h14"/><path d="m11.5 5 7 7-7 7"/></svg><span class="iko-btn-label">Migrate</span></button><button type="button" id="iko-hud-optimize" title="Optimize your current prompt"><span class="iko-btn-label">Optimize</span></button><button type="button" id="iko-hud-files" title="Optimize image/PDF uploads"><span class="iko-btn-label">Files</span></button>';
            main.appendChild(wrap);
          } catch {
          }
        },
        ensureBot() {
          let bot = document.getElementById("iko-bot");
          if (!bot) {
            bot = document.createElement("button");
            bot.id = "iko-bot";
            bot.type = "button";
            bot.title = "IKO \u2014 click to show/hide";
            bot.innerHTML = '<span class="iko-bot-dot"></span><span>IKO</span>';
            document.documentElement.appendChild(bot);
          }
          try {
            bot.style.position = "fixed";
            bot.style.zIndex = "2147483645";
            bot.title = "Drag to move \xB7 click to show or hide IKO";
          } catch {
          }
          if (!bot.dataset.positionRestored) {
            bot.dataset.positionRestored = "1";
            this.positionBot(true);
          }
          this.makeDraggable(bot, { storageKey: "ikoBotPos" });
          if (!bot.dataset.wired) {
            bot.dataset.wired = "1";
            bot.addEventListener("click", () => {
              if (bot.dataset.dragged === "1") return;
              let hud = document.getElementById("iko-context-hud");
              if (!hud) {
                this.create();
                return;
              }
              const style = getComputedStyle(hud);
              const isHidden = style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0;
              if (!isHidden) {
                hud.style.setProperty("display", "none", "important");
                return;
              }
              [
                "inset",
                "top",
                "left",
                "right",
                "bottom",
                "width",
                "height"
              ].forEach((property) => {
                hud.style.removeProperty(property);
              });
              hud.style.setProperty("display", "block", "important");
              hud.style.setProperty("visibility", "visible", "important");
              hud.style.setProperty("opacity", "1", "important");
              this.position();
              hud.style.setProperty("display", "block", "important");
              hud.style.setProperty("visibility", "visible", "important");
              hud.style.setProperty("opacity", "1", "important");
            });
          }
        },
        // HUD card drag via its header bar (so it never has to cover the composer).
        wireHudDrag() {
          const hud = document.getElementById("iko-context-hud");
          const handle = hud?.querySelector?.(".iko-hud-top");
          if (!hud || !handle || handle.dataset.dragWired) return;
          handle.dataset.dragWired = "1";
          handle.title = "Drag to move the HUD";
          this.restoreSpot(hud, "ikoHudPos", null, null, true);
          if (hud.dataset.pinned === "1") this.position();
          this.makeDraggable(hud, {
            storageKey: "ikoHudPos",
            dragHandle: handle,
            onDrop: () => {
              hud.dataset.pinned = "1";
              this.position();
            }
          });
        },
        // Restore saved spot (or default), clamped to viewport.
        // Storage shape is {left, top}; legacy {right, bottom} is migrated.
        // When keepPinned is set and no saved spot exists, the element keeps its
        // current CSS position instead of jumping to the default corner.
        positionBot(restore) {
          const bot = document.getElementById("iko-bot");
          if (!bot) return;
          bot.style.position = "fixed";
          bot.style.zIndex = "2147483645";
          this.restoreSpot(bot, "ikoBotPos", 24, 22, !restore);
          void restore;
        },
        restoreSpot(el, key, defRight, defBottom, keepPinned) {
          if (!el) return false;
          el.style.position = "fixed";
          const w = el.offsetWidth || 100, h = el.offsetHeight || 40;
          const place = (left, top) => {
            if (left == null || top == null) {
              if (keepPinned) return false;
              left = Math.max(8, window.innerWidth - w - (defRight ?? 24));
              top = Math.max(8, window.innerHeight - h - (defBottom ?? 22));
            }
            left = Math.min(Math.max(8, left), Math.max(8, window.innerWidth - w - 8));
            top = Math.min(Math.max(8, top), Math.max(8, window.innerHeight - h - 8));
            el.style.setProperty("left", `${left}px`, "important");
            el.style.setProperty("top", `${top}px`, "important");
            el.style.setProperty("right", "auto", "important");
            el.style.setProperty("bottom", "auto", "important");
            el.dataset.pinned = "1";
            return true;
          };
          const fromShape = (p) => {
            if (!p) return null;
            if (typeof p.left === "number" && typeof p.top === "number") return p;
            if (typeof p.right === "number" && typeof p.bottom === "number") {
              return { left: window.innerWidth - w - p.right, top: window.innerHeight - h - p.bottom };
            }
            return null;
          };
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const p = fromShape(JSON.parse(raw));
              if (p) {
                place(p.left, p.top);
                return true;
              }
            }
          } catch {
          }
          try {
            if (globalThis.chrome?.storage?.local) {
              chrome.storage.local.get([key], (r) => {
                try {
                  const p = fromShape(r?.[key]);
                  if (p) place(p.left, p.top);
                  else place(null, null);
                } catch {
                  place(null, null);
                }
              });
              return true;
            }
          } catch {
          }
          place(null, null);
          return true;
        },
        // Generic drag: any element, optional handle (HUD header), window-level
        // tracking, click-vs-drag threshold, viewport clamp, persisted spot.
        makeDraggable(el, opts = {}) {
          if (!el || el.dataset.dragWired) return;
          el.dataset.dragWired = "1";
          el.setAttribute("draggable", "false");
          const handle = opts.dragHandle || el;
          const key = opts.storageKey || null;
          const onDrop = opts.onDrop || null;
          const dragClass = opts.dragClass || "iko-dragging";
          let dragging = false;
          let moved = false;
          let sx = 0, sy = 0, sl = 0, st = 0;
          const save = (left, top) => {
            if (!key) return;
            try {
              localStorage.setItem(key, JSON.stringify({ left, top }));
            } catch {
            }
            try {
              globalThis.chrome?.storage?.local?.set?.({ [key]: { left, top } });
            } catch {
            }
          };
          const clampPlace = (left, top) => {
            const w = el.offsetWidth || 100, h = el.offsetHeight || 40;
            left = Math.min(Math.max(8, left), Math.max(8, window.innerWidth - w - 8));
            top = Math.min(Math.max(8, top), Math.max(8, window.innerHeight - h - 8));
            el.style.setProperty("left", `${left}px`, "important");
            el.style.setProperty("top", `${top}px`, "important");
            el.style.setProperty("right", "auto", "important");
            el.style.setProperty("bottom", "auto", "important");
            return { left, top };
          };
          const begin = (cx, cy) => {
            dragging = true;
            moved = false;
            el.dataset.dragged = "0";
            sx = cx;
            sy = cy;
            const r = el.getBoundingClientRect();
            sl = r.left;
            st = r.top;
            el.style.setProperty("left", `${sl}px`, "important");
            el.style.setProperty("top", `${st}px`, "important");
            el.style.setProperty("right", "auto", "important");
            el.style.setProperty("bottom", "auto", "important");
            if (dragClass) el.classList.add(dragClass);
          };
          const move = (cx, cy) => {
            if (!dragging) return;
            if (!moved && Math.abs(cx - sx) + Math.abs(cy - sy) < 5) return;
            moved = true;
            el.dataset.dragged = "1";
            clampPlace(sl + (cx - sx), st + (cy - sy));
          };
          const end = () => {
            if (!dragging) return;
            dragging = false;
            if (dragClass) el.classList.remove(dragClass);
            if (moved) {
              const r = el.getBoundingClientRect();
              try {
                save(r.left, r.top);
              } catch {
              }
              try {
                window.IKO?.logger?.info?.("Drag", "dropped", { key: key || "none", left: Math.round(r.left), top: Math.round(r.top) });
              } catch {
              }
              if (onDrop) {
                try {
                  onDrop(r);
                } catch {
                }
              }
              setTimeout(() => {
                el.dataset.dragged = "0";
              }, 150);
            }
            moved = false;
          };
          handle.addEventListener("pointerdown", (e) => {
            if (e.button !== void 0 && e.button !== 0) return;
            begin(e.clientX, e.clientY);
          });
          window.addEventListener("pointermove", (e) => {
            if (e.pointerId === void 0) return;
            move(e.clientX ?? sx, e.clientY ?? sy);
          });
          window.addEventListener("pointerup", end);
          window.addEventListener("pointercancel", end);
          handle.addEventListener("mousedown", (e) => {
            if (e.detail === 0) return;
            begin(e.clientX, e.clientY);
          });
          window.addEventListener("mousemove", (e) => {
            if (!dragging || e.pointerId !== void 0) return;
            if (e.clientX === void 0) return;
            move(e.clientX, e.clientY);
          });
          window.addEventListener("mouseup", end);
          handle.addEventListener("touchstart", (e) => {
            const t = e.touches?.[0];
            if (!t) return;
            begin(t.clientX, t.clientY);
          }, { passive: true });
          window.addEventListener("touchmove", (e) => {
            const t = e.touches?.[0];
            if (!t || !dragging) return;
            move(t.clientX, t.clientY);
            if (moved && e.cancelable) e.preventDefault();
          }, { passive: false });
          window.addEventListener("touchend", end);
          window.addEventListener("touchcancel", end);
          window.addEventListener("resize", () => {
            const r = el.getBoundingClientRect();
            if (r.width) clampPlace(r.left, r.top);
          });
        },
        // Migrate + Optimize live inside the HUD — resolved at click-time
        // so content.js (HUD) and migration.js (actions) can load in any order
        wireActions() {
          const migrate = document.getElementById("iko-hud-migrate");
          if (migrate && !migrate.dataset.wired) {
            migrate.dataset.wired = "1";
            migrate.addEventListener("click", () => {
              try {
                if (window.IKOMigrationMain?.open) window.IKOMigrationMain.open();
                else if (window.IKO?.migration?.open) window.IKO.migration.open();
                else alert("IKO migration is still loading \u2014 wait 2s and retry.");
              } catch (e) {
                console.error("[IKO] Migrate open failed:", e);
              }
            });
          }
          const optimize = document.getElementById("iko-hud-optimize");
          if (optimize && !optimize.dataset.wired) {
            optimize.dataset.wired = "1";
            optimize.addEventListener("click", () => {
              try {
                const launcher = document.getElementById("iko-optimizer-launcher");
                if (launcher) {
                  launcher.click();
                  return;
                }
                window.dispatchEvent(new CustomEvent("iko-optimize-requested"));
                setTimeout(() => {
                  if (!document.getElementById("iko-optimizer-panel")) {
                    alert("IKO optimizer is still loading \u2014 wait 2s and retry.");
                  }
                }, 300);
              } catch (e) {
                console.error("[IKO] Optimize open failed:", e);
              }
            });
          }
          const files = document.getElementById("iko-hud-files");
          if (files && !files.dataset.wired) {
            files.dataset.wired = "1";
            files.addEventListener("click", () => {
              try {
                if (window.IKO?.attachments?.openPanel) window.IKO.attachments.openPanel();
                else window.dispatchEvent(new CustomEvent("iko-attachments-requested"));
              } catch (e) {
                console.error("[IKO] Files panel failed:", e);
              }
            });
          }
        },
        /*
         * ==========================================
         * LOADING STATE
         * ==========================================
         */
        setLoading(loading, message = "Counting context\u2026") {
          const loadingElement = document.getElementById(
            "iko-hud-loading"
          );
          const statusElement = document.getElementById(
            "iko-hud-status"
          );
          const loadingBar = document.getElementById(
            "iko-hud-loading-bar"
          );
          const loadingText = document.getElementById(
            "iko-hud-loading-text"
          );
          if (!loadingElement) {
            return;
          }
          if (loading) {
            loadingElement.hidden = false;
            if (loadingText) {
              loadingText.textContent = message;
            }
            if (statusElement) {
              statusElement.textContent = message;
            }
            if (loadingBar) {
              loadingBar.style.width = "35%";
              loadingBar.classList.add(
                "iko-indeterminate"
              );
            }
            this.position();
            clearTimeout(this._loadingSafetyTimer);
            this._loadingSafetyTimer = setTimeout(() => {
              try {
                this.setLoading(false);
              } catch {
              }
              try {
                window.IKO?.resetCounting?.();
              } catch {
              }
            }, 8e3);
            return;
          }
          clearTimeout(this._loadingSafetyTimer);
          loadingElement.hidden = true;
          if (loadingBar) {
            loadingBar.style.width = "0%";
            loadingBar.classList.remove(
              "iko-indeterminate"
            );
          }
        },
        /*
         * ==========================================
         * UPDATE DATA
         * ==========================================
         */
        update(data) {
          const tokens = Number(
            data?.tokens || 0
          );
          const percentage = Math.max(
            0,
            Math.min(
              100,
              Number(
                data?.usagePercentage ?? 0
              )
            )
          );
          const tokenElement = document.getElementById(
            "iko-hud-tokens"
          );
          const usageElement = document.getElementById(
            "iko-hud-usage"
          );
          const progress = document.getElementById(
            "iko-hud-progress-bar"
          );
          const status = document.getElementById(
            "iko-hud-status"
          );
          const platformElement = document.getElementById(
            "iko-hud-platform"
          );
          if (tokenElement) {
            tokenElement.textContent = tokens.toLocaleString();
          }
          if (usageElement) {
            if (data?.usagePercentage == null) {
              usageElement.textContent = "\u2014";
            } else {
              usageElement.textContent = percentage === 0 && tokens > 0 ? "<1%" : `${percentage}%`;
            }
          }
          if (platformElement && data?.platform) {
            platformElement.textContent = data.platform;
          }
          if (progress) {
            progress.style.width = `${percentage}%`;
          }
          if (status) {
            const sourceLabels = {
              conversation: "Full conversation",
              selectors: "Visible messages",
              thread: "Page text estimate",
              none: "Waiting for messages"
            };
            const sourceLabel = sourceLabels[data?.source] || "Context estimate";
            const sourceDetails = {
              conversation: "IKO read the site's conversation data. This is the most complete reading available for this chat.",
              selectors: "IKO counted message elements visible in the page. Earlier turns that the site has unmounted may not be included.",
              thread: "IKO estimated from readable page text. The estimate may include non-message text or miss content the page has not rendered.",
              none: "IKO has not detected conversation messages on this page yet."
            };
            const statusText = data?.status || data?.measurement || "Context measured";
            const statusAlreadyNamesSource = data?.source === "conversation" && /full conversation/i.test(statusText);
            status.textContent = data?.source && data.source !== "none" && !statusAlreadyNamesSource ? `${statusText} \xB7 ${sourceLabel}` : statusText;
            status.title = [
              `Platform: ${data?.platform || "Unknown"}`,
              `Reading: ${sourceLabel}`,
              sourceDetails[data?.source] || "IKO is using its available context estimate for this platform.",
              data?.reason ? `Details: ${data.reason}` : "",
              data?.messageCount != null ? `Messages counted: ${data.messageCount}` : ""
            ].filter(Boolean).join("\n");
            status.setAttribute("aria-label", `${data?.platform || "AI platform"}: ${sourceLabel}. ${sourceDetails[data?.source] || "Context estimate."}`);
          }
          this.setLoading(false);
          requestAnimationFrame(
            () => this.position()
          );
        }
      };
    }
  });

  // src/content/attachments/attachment-saver.js
  function estimateImageTokens(w, h, detail = "high") {
    if (!w || !h) return 1500;
    if (detail === "low") return 85;
    const tiles = Math.ceil(w / 512) * Math.ceil(h / 512);
    return 85 + 170 * Math.min(tiles, 12);
  }
  function estimatePdfTokens(sizeBytes) {
    return Math.max(500, Math.ceil(sizeBytes / 4));
  }
  function fmtKB(n) {
    return n > 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;
  }
  function fmtTok(n) {
    return n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${n}`;
  }
  function loadImageDims(file) {
    return new Promise((resolve) => {
      try {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          const w = img.naturalWidth || 0, h = img.naturalHeight || 0;
          URL.revokeObjectURL(url);
          resolve({ w, h });
        };
        img.onerror = () => {
          try {
            URL.revokeObjectURL(url);
          } catch {
          }
          resolve({ w: 0, h: 0 });
        };
        img.src = url;
      } catch {
        resolve({ w: 0, h: 0 });
      }
    });
  }
  async function compressImage(file, maxDim = MAX_DIM, quality = JPEG_Q) {
    const dims = await loadImageDims(file);
    const scale = Math.min(1, maxDim / Math.max(dims.w || maxDim, dims.h || maxDim, 1));
    const w = Math.max(1, Math.round((dims.w || 800) * scale));
    const h = Math.max(1, Math.round((dims.h || 600) * scale));
    const bmp = await (async () => {
      try {
        if (window.createImageBitmap) return await createImageBitmap(file);
        throw new Error("no-bitmap");
      } catch {
        const url = URL.createObjectURL(file);
        try {
          await new Promise((res, rej) => {
            const img2 = new Image();
            img2.onload = res;
            img2.onerror = rej;
            img2.src = url;
          });
          const img = new Image();
          img.src = url;
          await img.decode().catch(() => {
          });
          return img;
        } finally {
          setTimeout(() => {
            try {
              URL.revokeObjectURL(url);
            } catch {
            }
          }, 5e3);
        }
      }
    })();
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    try {
      ctx.drawImage(bmp, 0, 0, w, h);
    } catch {
    }
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (bmp?.close) {
      try {
        bmp.close();
      } catch {
      }
    }
    return { blob, w, h, origW: dims.w, origH: dims.h };
  }
  function compactDescriptor(rec, opt) {
    const dim = opt ? `${opt.w}x${opt.h}` : rec.width && rec.height ? `${rec.width}x${rec.height}` : "?";
    const size = opt ? `${fmtKB(rec.size)}\u2192${fmtKB(opt.blob?.size || rec.size)}` : fmtKB(rec.size);
    const tok = opt ? `${fmtTok(rec.origTokens)}\u2192${fmtTok(opt.newTokens)}` : `~${fmtTok(rec.origTokens)}`;
    return `[media:${rec.kind} ${rec.name} ${dim} ${size} tokens:${tok}]`;
  }
  function countTextTokens(t) {
    try {
      const sir = window.IKOSIRCore;
      if (sir?.countTokens) return Math.max(1, Math.round(sir.countTokens(t)));
    } catch {
    }
    return Math.max(1, Math.ceil(String(t || "").length / 4));
  }
  async function copyText(t) {
    try {
      await navigator.clipboard.writeText(t);
      return true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = t;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return !!ok;
      } catch {
        return false;
      }
    }
  }
  function downloadBlob(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        URL.revokeObjectURL(a.href);
      } catch {
      }
      a.remove();
    }, 5e3);
  }
  async function samplePalette(blob, max = 5) {
    try {
      let src = null, url = null;
      try {
        src = await createImageBitmap(blob);
      } catch {
        url = URL.createObjectURL(blob);
        const img = new Image();
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
          img.src = url;
        });
        src = img;
      }
      const S = 24;
      const c = document.createElement("canvas");
      c.width = S;
      c.height = S;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(src, 0, 0, S, S);
      const d = ctx.getImageData(0, 0, S, S).data;
      const counts = /* @__PURE__ */ new Map();
      for (let i = 0; i < S * S; i++) {
        const q = d[i * 4] >> 4 << 8 | d[i * 4 + 1] >> 4 << 4 | d[i * 4 + 2] >> 4;
        counts.set(q, (counts.get(q) || 0) + 1);
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([q]) => {
        const r = (q >> 8 & 15) * 17, g = (q >> 4 & 15) * 17, b = (q & 15) * 17;
        return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
      });
      if (src?.close) {
        try {
          src.close();
        } catch {
        }
      }
      if (url) setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch {
        }
      }, 3e3);
      return top;
    } catch {
      return [];
    }
  }
  function buildImageText(rec, out, newTokens, savedPct, ocrText, palette) {
    const head = compactDescriptor(rec, { ...out, newTokens });
    const lines = [head, "@IMAGE"];
    try {
      const sir = window.IKOSIRCore;
      if (sir?.imageToSIR) {
        const block = sir.imageToSIR({
          text: ocrText ? [String(ocrText).slice(0, 1200)] : [],
          colors: palette || [],
          scene: `${rec.name} ${out.w}x${out.h}`
        }, false);
        if (block) {
          lines.push(String(block).replace(/^@IMAGE\n?/, ""));
        }
      } else {
        if (palette?.length) lines.push(`colors=${palette.join(",")}`);
      }
    } catch {
    }
    if (ocrText) lines.push(`text=${String(ocrText).slice(0, 1500)}`);
    else lines.push("text=(no OCR engine \u2014 install Tesseract vendor or register window.IKOOCR.peer for text extraction)");
    if (palette?.length && !lines.some((l) => l.startsWith("colors="))) lines.push(`colors=${palette.join(",")}`);
    lines.push(`note=delete the attached image and paste this block instead to hold ~${fmtTok(newTokens)} image\u2192~${fmtTok(countTextTokens(lines.join("\n")))} text (\u2212${savedPct}% image tokens)`);
    return lines.join("\n");
  }
  function appendToComposer(text) {
    try {
      const C = window.IKOComposer;
      const comp = C?.findComposer?.();
      if (!comp) return { ok: false, reason: "composer-not-found" };
      const cur = comp.tagName === "TEXTAREA" || comp.tagName === "INPUT" ? comp.value || "" : (comp.innerText || comp.textContent || "").trim();
      const next = cur ? `${cur}

${text}` : text;
      if (C?.writeComposerText) {
        C.writeComposerText(comp, next);
        return { ok: true };
      }
      try {
        comp.focus();
      } catch {
      }
      if (document.execCommand("insertText", false, `

${text}`)) return { ok: true };
      return { ok: false, reason: "write-failed" };
    } catch (e) {
      return { ok: false, reason: String(e?.message || e).slice(0, 120) };
    }
  }
  function recordFile(file) {
    try {
      if (!file || seenFiles.some((f) => f.name === file.name && f.size === file.size)) return null;
      const isImg = /^image\//.test(file.type || "") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name || "");
      const isPdf = /pdf/i.test(file.type || "") || /\.pdf$/i.test(file.name || "");
      if (!isImg && !isPdf) return null;
      const rec = {
        id: `att-${++seq}-${Date.now() % 1e5}`,
        name: file.name || `upload-${seq}`,
        kind: isImg ? "image" : "pdf",
        size: file.size || 0,
        width: 0,
        height: 0,
        origTokens: isPdf ? estimatePdfTokens(file.size || 0) : 1500,
        file
      };
      seenFiles.unshift(rec);
      if (seenFiles.length > 20) seenFiles.pop();
      if (isImg) {
        loadImageDims(file).then(({ w, h }) => {
          rec.width = w;
          rec.height = h;
          rec.origTokens = estimateImageTokens(w || 1024, h || 1024);
          renderBadge();
        });
      }
      try {
        window.IKO?.logger?.info?.("Attachments", "file detected", { name: rec.name, kind: rec.kind, size: rec.size });
      } catch {
      }
      renderBadge();
      return rec;
    } catch {
      return null;
    }
  }
  function hookFileInputs() {
    try {
      document.addEventListener("change", (e) => {
        const t = e.target;
        if (t instanceof HTMLInputElement && t.type === "file" && t.files?.length) {
          for (const f of t.files) recordFile(f);
        }
      }, true);
      document.addEventListener("drop", (e) => {
        try {
          const files = e.dataTransfer?.files;
          if (files?.length) for (const f of files) recordFile(f);
        } catch {
        }
      }, true);
    } catch {
    }
  }
  function renderBadge() {
    try {
      const btn = document.getElementById("iko-hud-files");
      if (!btn) return;
      const total = seenFiles.reduce((t, f) => t + (f.origTokens || 0), 0);
      const label = btn.querySelector(".iko-btn-label");
      if (label) label.textContent = seenFiles.length ? `Files\xB7~${fmtTok(total)}` : "Files";
      else btn.textContent = seenFiles.length ? `Files\xB7~${fmtTok(total)}` : "Files";
      btn.title = seenFiles.length ? `${seenFiles.length} upload(s) detected \xB7 ~${fmtTok(total)} tokens. Click to optimize.` : "No uploads detected yet. Attach an image/PDF to optimize it.";
    } catch {
    }
  }
  function openPanel() {
    try {
      document.getElementById("iko-attachments-panel")?.remove();
    } catch {
    }
    const mkBtn = (text, title, primary) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "iko-att-btn" + (primary ? " primary" : "");
      b.textContent = text;
      if (title) b.title = title;
      return b;
    };
    const root = document.createElement("div");
    root.id = "iko-attachments-panel";
    const n = seenFiles.length;
    root.innerHTML = `
        <div class="iko-att">
            <header class="iko-att-head">
                <div class="iko-att-headtxt">
                    <div class="iko-att-title">Attachments${n ? ` <span class="iko-att-count">${n}</span>` : ""}</div>
                    <div class="iko-att-sub">Shrink images to text before sending.</div>
                </div>
                <button type="button" class="iko-att-x" aria-label="Close">\xD7</button>
            </header>
            <div class="iko-att-body">
                <div class="iko-att-list" id="iko-att-list"></div>
                <div class="iko-att-foot">Images cost ~170 tokens per 512px tile. Shrink to text replaces one with ~100 tokens of text \u2014 paste the block instead of the image, then remove the original.</div>
            </div>
        </div>`;
    root.querySelector(".iko-att-x")?.addEventListener("click", () => root.remove());
    try {
      const head = root.querySelector(".iko-att-head");
      const closeBtn = root.querySelector(".iko-att-x");
      if (head && closeBtn && window.IKOTheme) {
        const actions = document.createElement("div");
        actions.className = "iko-header-actions";
        const themeBtn = window.IKOTheme.button();
        if (themeBtn) actions.appendChild(themeBtn);
        actions.appendChild(closeBtn);
        head.appendChild(actions);
      }
    } catch {
    }
    root.addEventListener("click", (e) => {
      if (e.target === root) root.remove();
    });
    const list = root.querySelector("#iko-att-list");
    const render = () => {
      list.innerHTML = "";
      if (!seenFiles.length) {
        const empty = document.createElement("div");
        empty.className = "iko-att-empty";
        empty.textContent = "No uploads yet. Attach a file, then reopen.";
        list.appendChild(empty);
        return;
      }
      for (const rec of seenFiles) {
        const card = document.createElement("div");
        card.className = "iko-att-card";
        const top = document.createElement("div");
        top.className = "iko-att-top";
        const name = document.createElement("div");
        name.className = "iko-att-name";
        name.textContent = rec.name;
        name.title = rec.name;
        const pill = document.createElement("div");
        pill.className = "iko-att-tokens";
        pill.textContent = `~${fmtTok(rec.origTokens)}`;
        pill.title = "Estimated cost if sent as-is";
        top.append(name, pill);
        const meta = document.createElement("div");
        meta.className = "iko-att-meta";
        const dim = rec.width ? `${rec.width}\xD7${rec.height} \xB7 ` : "";
        meta.textContent = `${rec.kind} \xB7 ${dim}${fmtKB(rec.size)}`;
        const status = document.createElement("div");
        status.className = "iko-att-status";
        status.hidden = true;
        const say = (text, ok = true) => {
          status.hidden = false;
          status.textContent = text;
          status.classList.toggle("bad", !ok);
        };
        const btns = document.createElement("div");
        btns.className = "iko-att-actions";
        if (rec.kind === "image") {
          const shrink = document.createElement("button");
          shrink.type = "button";
          shrink.className = "iko-att-btn primary";
          shrink.textContent = "Shrink to text";
          shrink.title = "Compress to a text block and copy it";
          shrink.addEventListener("click", async () => {
            shrink.disabled = true;
            shrink.textContent = "Working\u2026";
            try {
              const out = await compressImage(rec.file);
              const newTokens = estimateImageTokens(out.w, out.h);
              const saved = Math.max(0, Math.round((1 - newTokens / Math.max(1, rec.origTokens)) * 100));
              let ocrText = "";
              try {
                const ocr = window.IKOOCRCore, sir = window.IKOSIRCore;
                if (ocr?.scannedToSIR) {
                  const res = await ocr.scannedToSIR(out.blob, { id: rec.name, title: rec.name, kind: "image" }, sir || null);
                  if (res?.route === "sir" && res.l3) ocrText = String(res.l3);
                }
              } catch {
              }
              const palette = await samplePalette(out.blob, 5);
              const fullText = buildImageText(rec, out, newTokens, saved, ocrText, palette);
              const copied = await copyText(fullText);
              rec._lastCompressed = out;
              rec._lastText = fullText;
              rec._lastSaved = saved;
              const txtTok = fmtTok(countTextTokens(fullText));
              pill.textContent = `~${fmtTok(newTokens)} \u25B8 ~${txtTok} text`;
              say(`${rec.width || "?"}\xD7${rec.height || "?"} \u2192 ${out.w}\xD7${out.h} \xB7 \u2212${saved}%${ocrText ? " \xB7 OCR" : " \xB7 no OCR"} \xB7 ${copied ? "copied \u2014 remove the image" : "copy blocked \u2014 use Insert"}`);
              try {
                window.IKO?.logger?.info?.("Attachments", "shrunk-to-text", { name: rec.name, savedPct: saved, ocr: !!ocrText });
              } catch {
              }
              shrink.textContent = `\u2212${saved}% \u2713`;
              ensureInsertBtn();
            } catch (err) {
              shrink.textContent = "Failed";
            } finally {
              shrink.disabled = false;
              setTimeout(() => {
                shrink.textContent = "Shrink to text";
              }, 2500);
            }
          });
          btns.appendChild(shrink);
          const ensureInsertBtn = () => {
            if (btns.querySelector("[data-iko-insert]")) return;
            const ins = document.createElement("button");
            ins.type = "button";
            ins.className = "iko-att-btn";
            ins.textContent = "Insert";
            ins.setAttribute("data-iko-insert", "1");
            ins.title = "Append the text block to the chat box";
            ins.addEventListener("click", async () => {
              try {
                if (!rec._lastText) {
                  ins.textContent = "Shrink first";
                  setTimeout(() => {
                    ins.textContent = "Insert";
                  }, 1500);
                  return;
                }
                const r = appendToComposer(rec._lastText);
                ins.textContent = r.ok ? "Inserted \u2713" : "Composer? \u2014 copied";
                if (!r.ok) await copyText(rec._lastText);
              } catch {
                ins.textContent = "Failed";
              }
              setTimeout(() => {
                ins.textContent = "Insert";
              }, 2e3);
            });
            btns.appendChild(ins);
          };
          if (rec._lastText) ensureInsertBtn();
          const jpeg = document.createElement("button");
          jpeg.type = "button";
          jpeg.className = "iko-att-btn";
          jpeg.textContent = "JPEG";
          jpeg.title = "Download the resized file (optional)";
          jpeg.addEventListener("click", async () => {
            jpeg.textContent = "\u2026";
            try {
              const out = rec._lastCompressed || await compressImage(rec.file);
              rec._lastCompressed = out;
              downloadBlob(out.blob, rec.name.replace(/\.\w+$/, "") + "-iko-1024.jpg");
              jpeg.textContent = "Saved";
            } catch {
              jpeg.textContent = "Failed";
            }
            setTimeout(() => {
              jpeg.textContent = "JPEG";
            }, 2e3);
          });
          btns.appendChild(jpeg);
          const ocrBtn = document.createElement("button");
          ocrBtn.type = "button";
          ocrBtn.className = "iko-att-btn";
          ocrBtn.textContent = "OCR";
          ocrBtn.title = "Run local OCR if installed";
          ocrBtn.addEventListener("click", async () => {
            ocrBtn.textContent = "\u2026";
            try {
              const ocr = window.IKOOCRCore;
              const sir = window.IKOSIRCore;
              if (!ocr) throw new Error("OCR engine loading \u2014 wait 2s and retry");
              const res = await ocr.scannedToSIR(rec.file, { id: rec.name, title: rec.name, kind: rec.kind }, sir || null);
              if (res.route === "sir") {
                try {
                  await navigator.clipboard.writeText(res.l3);
                } catch {
                }
                say(`OCR copied \xB7 conf ${Number(res.ocr.confidence || 0).toFixed(2)} \xB7 ${res.ocr.engine}`);
                ocrBtn.textContent = "Copied";
              } else {
                say(`No OCR engine \u2014 add Tesseract or IKOOCR.peer`, false);
                ocrBtn.textContent = "No engine";
              }
            } catch (err) {
              ocrBtn.textContent = "Failed";
            }
            setTimeout(() => {
              ocrBtn.textContent = "OCR";
            }, 2e3);
          });
          btns.appendChild(ocrBtn);
        } else {
          const parse = document.createElement("button");
          parse.type = "button";
          parse.className = "iko-att-btn primary";
          parse.textContent = "Parse";
          parse.title = "Extract text to a compact block and copy it";
          parse.addEventListener("click", async () => {
            parse.textContent = "\u2026";
            try {
              const pdf = window.IKOPDFCore;
              const sir = window.IKOSIRCore;
              if (!pdf) throw new Error("PDF engine loading \u2014 wait 2s and retry");
              const buf = await rec.file.arrayBuffer();
              const res = pdf.pdfToSIR(buf, { id: rec.name, title: rec.name }, sir || null);
              if (res.route === "ocr-required") {
                say(`Scanned PDF \xB7 needs OCR \xB7 flagged`, false);
                try {
                  await navigator.clipboard.writeText(`[media:pdf ${rec.name} pages=${res.l1.pages || "?"} status=needs-ocr]`);
                } catch {
                }
                parse.textContent = "Flagged";
              } else {
                const before = sir ? sir.countTokens(res.l2.preview + "") : res.l1.chars / 4;
                const after = sir ? sir.countTokens(res.l3) : res.l3.length / 4;
                try {
                  await navigator.clipboard.writeText(res.l3);
                } catch {
                }
                say(`${res.l1.pages}p \xB7 ~${Math.round(before)} \u2192 ~${Math.round(after)} \xB7 copied`);
                try {
                  window.IKO?.logger?.info?.("Attachments", "pdf parsed", { name: rec.name, pages: res.l1.pages });
                } catch {
                }
                parse.textContent = "Copied";
              }
            } catch (err) {
              parse.textContent = "Failed";
              say(`Parse failed: ${String(err?.message || err).slice(0, 100)}`, false);
            }
            setTimeout(() => {
              parse.textContent = "Parse";
            }, 2e3);
          });
          const cp = document.createElement("button");
          cp.type = "button";
          cp.className = "iko-att-btn";
          cp.textContent = "Copy";
          cp.title = "Copy a one-line descriptor";
          cp.addEventListener("click", async () => {
            try {
              await navigator.clipboard.writeText(compactDescriptor(rec, null));
              cp.textContent = "Copied";
            } catch {
              cp.textContent = "Blocked";
            }
            setTimeout(() => {
              cp.textContent = "Copy";
            }, 1500);
          });
          btns.append(parse, cp);
          const ocrBtn = document.createElement("button");
          ocrBtn.type = "button";
          ocrBtn.className = "iko-att-btn";
          ocrBtn.textContent = "OCR";
          ocrBtn.title = "Scanned pages need a local OCR engine";
          ocrBtn.addEventListener("click", async () => {
            ocrBtn.textContent = "\u2026";
            try {
              const ocr = window.IKOOCRCore;
              const sir = window.IKOSIRCore;
              if (!ocr) throw new Error("OCR engine loading \u2014 wait 2s and retry");
              const buf = await rec.file.arrayBuffer();
              const res = await ocr.scannedToSIR(rec.file, { id: rec.name, title: rec.name, kind: "pdf-scan" }, sir || null);
              void buf;
              if (res.route === "sir") {
                try {
                  await navigator.clipboard.writeText(res.l3);
                } catch {
                }
                say(`OCR copied \xB7 conf ${Number(res.ocr.confidence || 0).toFixed(2)}`);
                ocrBtn.textContent = "Copied";
              } else {
                say(`No OCR engine \u2014 screenshot the page or add Tesseract`, false);
                ocrBtn.textContent = "No engine";
              }
            } catch (err) {
              ocrBtn.textContent = "Failed";
            }
            setTimeout(() => {
              ocrBtn.textContent = "OCR";
            }, 2e3);
          });
          btns.appendChild(ocrBtn);
        }
        card.append(top, meta, status, btns);
        list.appendChild(card);
      }
    };
    render();
    document.body.appendChild(root);
  }
  var MAX_DIM, JPEG_Q, seenFiles, seq;
  var init_attachment_saver = __esm({
    "src/content/attachments/attachment-saver.js"() {
      "use strict";
      window.IKO = window.IKO || {};
      MAX_DIM = 1024;
      JPEG_Q = 0.72;
      seenFiles = [];
      seq = 0;
      window.IKO.attachments = {
        recordFile,
        compressImage,
        estimateImageTokens,
        estimatePdfTokens,
        list: () => [...seenFiles],
        openPanel,
        compactDescriptor
      };
      try {
        window.addEventListener("iko-attachments-requested", openPanel);
      } catch {
      }
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hookFileInputs, { once: true });
      else hookFileInputs();
    }
  });

  // src/content/claude-api.js
  function estimateTokens(messages) {
    const text = Array.isArray(messages) ? messages.map((message) => String(message?.content || "")).join("\n") : String(messages || "");
    return Math.max(0, Math.ceil(text.length / 4));
  }
  async function countClaudeTokens({ messages }) {
    window.IKO = window.IKO || {};
    window.IKO.claudeTokenCountSource = "local-estimate";
    return estimateTokens(messages);
  }
  var init_claude_api = __esm({
    "src/content/claude-api.js"() {
      "use strict";
    }
  });

  // src/content/claude-message-converter.js
  function convertClaudeConversationToMessages(conversation) {
    const rawMessages = conversation.chat_messages || conversation.messages || [];
    const messages = [];
    for (const message of rawMessages) {
      const role = message.sender === "human" || message.role === "user" ? "user" : message.sender === "assistant" || message.role === "assistant" ? "assistant" : null;
      if (!role) {
        continue;
      }
      const content = extractTextContent(message);
      if (!content.trim()) {
        continue;
      }
      messages.push({
        role,
        content
      });
    }
    return normalizeAlternatingRoles(messages);
  }
  function extractTextContent(message) {
    if (typeof message.text === "string") {
      return message.text;
    }
    if (typeof message.content === "string") {
      return message.content;
    }
    if (Array.isArray(message.content)) {
      return message.content.filter((block) => block && block.type === "text").map((block) => block.text || "").join("\n");
    }
    return "";
  }
  function normalizeAlternatingRoles(messages) {
    const result = [];
    for (const message of messages) {
      const previous = result[result.length - 1];
      if (previous && previous.role === message.role) {
        previous.content += "\n\n" + message.content;
      } else {
        result.push({
          role: message.role,
          content: message.content
        });
      }
    }
    return result;
  }
  var init_claude_message_converter = __esm({
    "src/content/claude-message-converter.js"() {
    }
  });

  // src/migration/platforms.js
  var require_platforms = __commonJS({
    "src/migration/platforms.js"(exports, module) {
      var PLATFORMS = Object.freeze({
        chatgpt: {
          id: "chatgpt",
          name: "ChatGPT",
          hosts: ["chatgpt.com", "chat.openai.com"],
          newUrl: "https://chatgpt.com/",
          budget: 2e5,
          pricePer1M: 2.5,
          selectors: ["[data-message-author-role]", '[data-testid^="conversation-turn-"]', "[data-message-id]", "main article"],
          composers: ["#prompt-textarea", "form textarea", "textarea"]
        },
        claude: {
          id: "claude",
          name: "Claude",
          hosts: ["claude.ai"],
          newUrl: "https://claude.ai/new",
          budget: 2e5,
          pricePer1M: 3,
          selectors: ["[data-testid='chat-message']", "main article"],
          composers: ["[data-testid='chat-input']", ".ProseMirror", "fieldset [contenteditable='true']"]
        },
        gemini: {
          id: "gemini",
          name: "Gemini",
          hosts: ["gemini.google.com"],
          newUrl: "https://gemini.google.com/",
          budget: 1e6,
          pricePer1M: 1.25,
          selectors: ["message-content", ".query-content", "main article"],
          composers: ["rich-textarea", "[aria-label='Enter a prompt here']", "textarea"]
        },
        perplexity: {
          id: "perplexity",
          name: "Perplexity",
          hosts: ["perplexity.ai"],
          newUrl: "https://www.perplexity.ai/",
          budget: 127e3,
          pricePer1M: 1,
          selectors: ["[data-testid='answer']", "main article"],
          composers: ["textarea", "[contenteditable='true']"]
        },
        copilot: {
          id: "copilot",
          name: "Copilot",
          hosts: ["copilot.microsoft.com", "www.copilot.microsoft.com", "m365.cloud.microsoft"],
          newUrl: "https://copilot.microsoft.com/",
          budget: 128e3,
          pricePer1M: 2,
          selectors: ["main article", "[data-content='ai-message']"],
          composers: ["textarea", "[contenteditable='true']"]
        },
        grok: {
          id: "grok",
          name: "Grok",
          hosts: ["grok.com", "x.com"],
          newUrl: "https://grok.com/",
          budget: 131e3,
          pricePer1M: 2,
          selectors: ["main article", "[data-testid='message']"],
          composers: ["textarea", "[contenteditable='true']"]
        },
        deepseek: {
          id: "deepseek",
          name: "DeepSeek",
          hosts: ["chat.deepseek.com"],
          newUrl: "https://chat.deepseek.com/",
          budget: 64e3,
          pricePer1M: 0.5,
          selectors: ["main article", ".message-content"],
          composers: ["textarea", "[contenteditable='true']"]
        },
        mistral: {
          id: "mistral",
          name: "Mistral",
          hosts: ["chat.mistral.ai"],
          newUrl: "https://chat.mistral.ai/chat",
          budget: 32e3,
          pricePer1M: 1,
          selectors: ["main article", "[data-testid='message']"],
          composers: ["textarea", "[contenteditable='true']"]
        },
        poe: {
          id: "poe",
          name: "Poe",
          hosts: ["poe.com"],
          newUrl: "https://poe.com/",
          budget: 128e3,
          pricePer1M: 2,
          selectors: ["main article", "[data-testid='message']"],
          composers: ["textarea", "[contenteditable='true']"]
        }
      });
      function matchPlatform(hostname) {
        const host = String(hostname || "").toLowerCase();
        for (const p of Object.values(PLATFORMS)) {
          if (p.hosts.some((h) => host === h || host.endsWith("." + h))) return p;
        }
        return null;
      }
      function allHosts() {
        return Object.values(PLATFORMS).flatMap((p) => p.hosts);
      }
      module.exports = { PLATFORMS, matchPlatform, allHosts };
    }
  });

  // src/migration/core/chat-thread.js
  var require_chat_thread = __commonJS({
    "src/migration/core/chat-thread.js"(exports, module) {
      "use strict";
      var { PLATFORMS, matchPlatform } = require_platforms();
      var UNIVERSAL_SELECTORS = [
        "[data-message-author-role]",
        '[data-testid^="conversation-turn-"]',
        "[data-message-id]",
        "main article",
        "main [data-turn]",
        'main div[id^="message-"]'
      ];
      var NOISE_TAGS = /* @__PURE__ */ new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);
      var CHROME_TAGS = /* @__PURE__ */ new Set(["NAV", "ASIDE", "HEADER", "FOOTER"]);
      var MIN_MESSAGE_CHARS = 2;
      var LONG_TEXT_DUP_CHARS = 40;
      var BLOCK_MIN_CHARS = 120;
      var MAX_CHILDREN = 200;
      var MAX_DESCENT = 15;
      var MAX_WALK_NODES = 4e4;
      var DOCUMENT_POSITION_FOLLOWING = 4;
      var DOMINANT_CHILD_RATIO = 0.7;
      var PARTIAL_PRECHECK_CHARS = 1500;
      var PARTIAL_READ_RATIO = 0.25;
      var THREAD_MIN_CHARS = 120;
      function selectorsFor(platformId) {
        const out = [];
        const push = (selector) => {
          if (selector && !out.includes(selector)) out.push(selector);
        };
        const platform = PLATFORMS?.[platformId];
        for (const selector of platform?.selectors || []) push(selector);
        for (const selector of UNIVERSAL_SELECTORS) push(selector);
        return out;
      }
      function readText(el, { skipChrome = false } = {}) {
        if (!el || NOISE_TAGS.has(el.tagName)) return "";
        if (!skipChrome) {
          const rendered = (el.innerText || "").trim();
          if (rendered) return rendered;
        }
        let out = "";
        const walk = (node) => {
          if (node.shadowRoot) walk(node.shadowRoot);
          for (const child of node.childNodes || []) {
            if (child.nodeType === 3) {
              out += String(child.nodeValue || "") + " ";
              continue;
            }
            if (child.nodeType !== 1 || NOISE_TAGS.has(child.tagName)) continue;
            if (skipChrome && CHROME_TAGS.has(child.tagName)) continue;
            walk(child);
          }
        };
        walk(el);
        return out.replace(/\s+/g, " ").trim();
      }
      function textOf(el) {
        let body = el;
        try {
          body = el.querySelector(".markdown, [data-testid='markdown']") || el;
        } catch {
        }
        const content = readText(body);
        if (content || body === el) return content;
        return readText(el);
      }
      function roleOf(el) {
        let attr = "";
        try {
          attr = el.getAttribute("data-message-author-role") || "";
          if (!attr) {
            attr = el.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role") || "";
          }
        } catch {
        }
        if (attr === "assistant" || attr === "system" || attr === "user") return attr;
        const tag = [
          el.getAttribute?.("data-testid") || "",
          el.getAttribute?.("class") || "",
          el.tagName || ""
        ].join(" ");
        if (/assistant|model-response|bot[-_]?message|ai-message/i.test(tag)) return "assistant";
        if (/user-query|user-message|human|query-content/i.test(tag)) return "user";
        return "";
      }
      function collect(selectors) {
        const seen = /* @__PURE__ */ new Set();
        const nodes = [];
        for (const selector of selectors) {
          let found = [];
          try {
            found = Array.from(document.querySelectorAll(selector));
          } catch {
            continue;
          }
          for (const node of found) {
            if (seen.has(node)) continue;
            seen.add(node);
            nodes.push(node);
          }
        }
        return nodes;
      }
      function innermost(nodes) {
        return nodes.filter((node) => !nodes.some((other) => other !== node && node.contains(other)));
      }
      function byDocumentOrder(a, b) {
        if (a === b) return 0;
        if (typeof a.compareDocumentPosition !== "function") return 0;
        return a.compareDocumentPosition(b) & DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      }
      function fromSelectors(platformId) {
        const nodes = innermost(collect(selectorsFor(platformId))).sort(byDocumentOrder);
        const messages = [];
        const seenText = /* @__PURE__ */ new Set();
        for (const node of nodes) {
          const content = textOf(node);
          if (!content || content.length < MIN_MESSAGE_CHARS) continue;
          if (content.length >= LONG_TEXT_DUP_CHARS && seenText.has(content)) continue;
          seenText.add(content);
          if (messages.length && messages[messages.length - 1].content === content) continue;
          messages.push({
            role: roleOf(node) || (messages.length % 2 === 0 ? "user" : "assistant"),
            content
          });
        }
        return messages;
      }
      function threadContainer() {
        let el = document.querySelector("main") || document.querySelector("[role='main']") || document.querySelector("body");
        if (!el) return { el: null, descended: false, chars: 0 };
        let descended = false;
        let bestEl = el;
        let bestChars = textLength(el);
        for (let step = 0; step < MAX_DESCENT; step++) {
          if (looksLikeList(el)) {
            const chars = textLength(el);
            if (chars >= BLOCK_MIN_CHARS) {
              bestEl = el;
              bestChars = chars;
              descended = true;
            }
            return { el: bestEl, descended, chars: bestChars };
          }
          const total = textLength(el);
          if (!total) break;
          let bestChild = null;
          let bestLen = 0;
          let examined = 0;
          for (const child of el.children || []) {
            if (examined++ > MAX_CHILDREN) break;
            if (!child.tagName || NOISE_TAGS.has(child.tagName) || CHROME_TAGS.has(child.tagName)) continue;
            const len = textLength(child);
            if (len > bestLen) {
              bestLen = len;
              bestChild = child;
            }
          }
          if (!bestChild || bestLen < total * DOMINANT_CHILD_RATIO) break;
          if (total >= BLOCK_MIN_CHARS) {
            bestEl = el;
            bestChars = total;
          }
          el = bestChild;
          descended = true;
        }
        return bestChars >= BLOCK_MIN_CHARS ? { el: bestEl, descended, chars: bestChars } : { el, descended: false, chars: textLength(el) };
      }
      function looksLikeList(el) {
        let count = 0;
        const elementChildren = (node) => {
          const out = [];
          for (const child of node.children || []) out.push(child);
          if (node.shadowRoot) for (const child of node.shadowRoot.children || []) out.push(child);
          return out;
        };
        for (const child of elementChildren(el)) {
          if (!child.tagName || NOISE_TAGS.has(child.tagName) || CHROME_TAGS.has(child.tagName)) continue;
          if (textLength(child) >= BLOCK_MIN_CHARS) {
            count++;
            if (count >= 2) return true;
          }
        }
        return false;
      }
      function blockCount(el) {
        let count = 0;
        const elementChildren = (node) => {
          const out = [];
          for (const child of node.children || []) out.push(child);
          if (node.shadowRoot) for (const child of node.shadowRoot.children || []) out.push(child);
          return out;
        };
        const walk = (node, depth) => {
          if (count >= 2 || depth > 3) return;
          for (const child of elementChildren(node)) {
            if (!child.tagName || NOISE_TAGS.has(child.tagName) || CHROME_TAGS.has(child.tagName)) continue;
            if (textLength(child) >= BLOCK_MIN_CHARS) {
              count++;
              if (count >= 2) return;
              continue;
            }
            walk(child, depth + 1);
          }
        };
        walk(el, 0);
        return count;
      }
      function textLength(el) {
        if (!el || NOISE_TAGS.has(el.tagName)) return 0;
        let length = 0;
        let nodes = 0;
        const walk = (node) => {
          if (node.shadowRoot) walk(node.shadowRoot);
          for (const child of node.childNodes || []) {
            if (nodes++ > MAX_WALK_NODES) return;
            if (child.nodeType === 3) {
              length += String(child.nodeValue || "").length + 1;
              continue;
            }
            if (child.nodeType !== 1 || NOISE_TAGS.has(child.tagName) || CHROME_TAGS.has(child.tagName)) continue;
            walk(child);
          }
        };
        walk(el);
        return length;
      }
      function fromThread(container) {
        const found = container || threadContainer();
        const el = found?.el;
        if (!el) return { messages: [], reason: "no-container" };
        let content = readText(el, { skipChrome: true });
        if (!content) content = readText(el);
        if (content.length < BLOCK_MIN_CHARS) return { messages: [], reason: `thread-too-small(${content.length})` };
        if (!found.descended && blockCount(el) < 2) return { messages: [], reason: `welcome-screen(${blockCount(el)} blocks)` };
        return { messages: [{ role: "user", content, fallback: true, thread: true }], reason: "thread-estimate" };
      }
      function extractChatThread(platformId) {
        let messages = [];
        try {
          messages = fromSelectors(platformId);
        } catch {
        }
        const matchedChars = messages.reduce((total, message) => total + message.content.length, 0);
        let container = null;
        if (!messages.length || matchedChars < PARTIAL_PRECHECK_CHARS) {
          try {
            container = threadContainer();
          } catch {
            container = null;
          }
        }
        if (messages.length && container?.el) {
          const threadChars = textLength(container.el);
          if (threadChars > THREAD_MIN_CHARS && matchedChars < threadChars * PARTIAL_READ_RATIO) {
            const estimate2 = fromThread(container);
            if (estimate2.messages.length) return { messages: estimate2.messages, source: "thread", reason: `partial-markup \u2192 ${estimate2.reason}` };
          }
        }
        if (messages.length) return { messages, source: "selectors", reason: "selector-match" };
        if (messages.length === 0 && container?.el) {
          const threadChars = container.chars || textLength(container.el);
          if (threadChars < THREAD_MIN_CHARS) {
            return { messages: [], source: "none", reason: `thread-too-small(${threadChars})` };
          }
        }
        const estimate = fromThread(container);
        if (estimate.messages.length) return { messages: estimate.messages, source: "thread", reason: estimate.reason };
        const deep = deepScanContainer();
        if (deep) {
          const content = readText(deep.el, { skipChrome: true }) || readText(deep.el);
          if (content.length >= BLOCK_MIN_CHARS) {
            return { messages: [{ role: "user", content, fallback: true, thread: true }], source: "thread", reason: `deep-scan(${deep.reason})` };
          }
        }
        return { messages: [], source: "none", reason: estimate.reason || "no-container" };
      }
      function deepScanContainer() {
        const root = document.body || document.documentElement;
        if (!root) return null;
        let best = null;
        let bestScore = 0;
        const elementChildren = (node) => {
          const out = [];
          for (const child of node.children || []) out.push(child);
          if (node.shadowRoot) for (const child of node.shadowRoot.children || []) out.push(child);
          return out;
        };
        const walk = (node, depth) => {
          if (depth > 10) return;
          for (const child of elementChildren(node)) {
            if (!child.tagName || NOISE_TAGS.has(child.tagName) || CHROME_TAGS.has(child.tagName)) continue;
            const len = textLength(child);
            if (len >= 50) {
              const score = len;
              if (score > bestScore) {
                bestScore = score;
                best = { el: child, reason: `chars=${len}` };
              }
              walk(child, depth + 1);
            } else {
              walk(child, depth + 1);
            }
          }
        };
        walk(root, 0);
        return best;
      }
      function partsToText(content) {
        try {
          if (!content) return "";
          if (typeof content === "string") return content;
          if (Array.isArray(content.parts)) {
            return content.parts.map((part) => {
              if (typeof part === "string") return part;
              if (part?.text) return part.text;
              try {
                return JSON.stringify(part);
              } catch {
                return "";
              }
            }).join("\n").trim();
          }
          if (typeof content.text === "string") return content.text;
          return "";
        } catch {
          return "";
        }
      }
      function messageFrom(raw) {
        const message = raw?.message || raw;
        const role = message?.author?.role || message?.role || message?.sender || "";
        if (role !== "user" && role !== "assistant" && role !== "system") return null;
        const content = partsToText(message?.content).trim();
        if (content.length < MIN_MESSAGE_CHARS) return null;
        return { role, content };
      }
      function extractConversationMessages(data) {
        try {
          if (!data || typeof data !== "object") return null;
          const root = data.mapping ? data : data.conversation || data.data || null;
          const mapping = root?.mapping;
          if (mapping && typeof mapping === "object") {
            let nodeId = root.current_node || root.currentNode || null;
            const chain = [];
            const seen = /* @__PURE__ */ new Set();
            if (nodeId && mapping[nodeId]) {
              while (nodeId && !seen.has(nodeId)) {
                seen.add(nodeId);
                const node = mapping[nodeId];
                if (!node) break;
                chain.unshift(node);
                nodeId = node.parent || node.parentId || null;
              }
            } else {
              for (const node of Object.values(mapping)) chain.push(node);
            }
            const messages = [];
            for (const node of chain) {
              const message = messageFrom(node);
              if (message) messages.push(message);
            }
            if (messages.length) return messages;
          }
          for (const key of ["messages", "turns", "conversation_messages", "items"]) {
            const list = data[key] || root?.[key];
            if (!Array.isArray(list) || !list.length) continue;
            const messages = [];
            for (const raw of list) {
              const message = messageFrom(raw);
              if (message) messages.push(message);
            }
            if (messages.length) return messages;
          }
          return null;
        } catch {
          return null;
        }
      }
      function describe(node) {
        if (!node) return "none";
        const id = node.id ? `#${String(node.id).slice(0, 24)}` : "";
        const cls = String(node.getAttribute?.("class") || "").split(/\s+/).filter(Boolean).slice(0, 3).join(".");
        const text = String(node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
        return `<${String(node.tagName || "?").toLowerCase()}${id}${cls ? `.${cls}` : ""}> "${text}"`;
      }
      function debugReading(platformId) {
        const selectors = {};
        const matched = [];
        for (const selector of selectorsFor(platformId)) {
          let nodes = null;
          try {
            nodes = Array.from(document.querySelectorAll(selector));
          } catch {
            nodes = null;
          }
          selectors[selector] = nodes === null ? "invalid" : nodes.length;
          if (nodes) for (const node of nodes) matched.push(node);
        }
        const filtered = innermost(Array.from(new Set(matched)));
        const found = threadContainer();
        return {
          selectors,
          matched: matched.length,
          innermost: filtered.length,
          samples: filtered.slice(0, 3).map(describe),
          container: describe(found.el),
          containerChars: textLength(found.el),
          containerBlocks: blockCount(found.el),
          descended: found.descended
        };
      }
      module.exports = { extractChatThread, extractConversationMessages, debugReading, selectorsFor, readText, textLength, textOf, matchPlatform };
    }
  });

  // src/content/claude-main.js
  var require_claude_main = __commonJS({
    "src/content/claude-main.js"() {
      "use strict";
      init_claude_api();
      init_claude_message_converter();
      var import_chat_thread = __toESM(require_chat_thread());
      var import_ui = __toESM(require_ui());
      window.IKO = window.IKO || {};
      window.IKO.chatThread = window.IKO.chatThread || import_chat_thread.default;
      var updateTimer = null;
      var counting = false;
      var lastKey = "";
      var lastSignature = "";
      var highWater = { key: "", tokens: 0 };
      var CLAUDE_DEFAULT = { budget: 2e5, price: 3, label: "Claude" };
      function detectClaudeModel(conversation) {
        const raw = String(conversation?.model || "").toLowerCase();
        if (raw.includes("opus")) return { budget: 2e5, price: 15, label: "Claude Opus" };
        if (raw.includes("sonnet")) return { budget: 2e5, price: 3, label: "Claude Sonnet" };
        if (raw.includes("haiku")) return { budget: 2e5, price: 0.8, label: "Claude Haiku" };
        return CLAUDE_DEFAULT;
      }
      function isClaudePage() {
        const host = window.location.hostname.toLowerCase();
        return host === "claude.ai" || host.endsWith(".claude.ai");
      }
      function removeLegacyHUD() {
        for (const id of [
          "iko-claude-hud",
          "iko-claude-token-hud",
          "iko-claude-legacy-hud"
        ]) {
          document.getElementById(id)?.remove();
        }
      }
      function updateUI(data) {
        if (window.IKO?.ui) {
          window.IKO.ui.update(data);
        }
      }
      function conversationKey() {
        return `${location.hostname}${location.pathname}`;
      }
      function conversationId() {
        const match = location.pathname.match(/\/chat\/([0-9a-zA-Z-]{8,})/);
        return match ? match[1] : "";
      }
      function bridgeConversation() {
        try {
          const bridge = window.IKO?.claudeBridge;
          const payload = bridge?.latestConversation;
          if (!payload) return null;
          const id = conversationId();
          if (!id) return null;
          const fromData = String(payload.uuid || payload.id || "").slice(0, 64);
          const fromUrl = String(bridge.latestConversationUrl || "").match(/chat_conversations\/([0-9a-zA-Z-]{8,})/)?.[1] || "";
          const known = fromData || fromUrl;
          if (known && known !== id) return null;
          return payload;
        } catch {
        }
        return null;
      }
      function domMessages() {
        if (typeof import_chat_thread.default.extractChatThread !== "function") return [];
        try {
          const thread = import_chat_thread.default.extractChatThread("claude");
          return thread.messages || [];
        } catch {
          return [];
        }
      }
      function signature(label, messages, bridgeCount, bridgeTokens) {
        let hash = 2166136261;
        const mix = (text) => {
          for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
          }
        };
        mix(`${label}|${messages.length}|${bridgeCount}|${bridgeTokens}`);
        for (const message of messages) mix(message.content);
        return (hash >>> 0).toString(16);
      }
      async function updateClaude() {
        if (!isClaudePage() || counting) return;
        removeLegacyHUD();
        const key = conversationKey();
        if (key !== lastKey) {
          lastKey = key;
          lastSignature = "";
          highWater = { key, tokens: 0 };
        }
        const conversation = bridgeConversation();
        const dom = domMessages();
        const bridgeMessages = conversation ? convertClaudeConversationToMessages(conversation) : [];
        if (!conversation) window.IKO?.claudeBridge?.requestConversationRefresh?.();
        if (!bridgeMessages.length && !dom.length) {
          lastSignature = "";
          window.IKO.latestData = {
            platform: "Claude",
            tokens: 0,
            messageCount: 0,
            usagePercentage: 0,
            tokenizer: "Local estimate",
            status: "Waiting for Claude messages"
          };
          updateUI(window.IKO.latestData);
          return;
        }
        const model = detectClaudeModel(conversation);
        const bridgeTokens = bridgeMessages.length ? await countClaudeTokens({ messages: bridgeMessages }) : 0;
        const sig = signature(model.label, dom.length ? dom : bridgeMessages, bridgeMessages.length, bridgeTokens);
        if (sig === lastSignature && window.IKO.latestData) {
          updateUI(window.IKO.latestData);
          return;
        }
        counting = true;
        try {
          const hasCount = Boolean(window.IKO.latestData && (window.IKO.latestData.tokens > 0 || window.IKO.latestData.messageCount > 0));
          if (!hasCount) window.IKO.ui?.setLoading(true, "Counting Claude context\u2026");
          const domTokens = dom.length ? await countClaudeTokens({ messages: dom }) : 0;
          const tokens = Math.max(domTokens, bridgeTokens, highWater.tokens);
          highWater.tokens = tokens;
          const usedBridge = bridgeTokens > domTokens;
          const cost = tokens / 1e6 * model.price;
          const pct = Math.min(100, Math.round(tokens / model.budget * 100));
          const health = pct >= 95 ? "\u26A0 Context critical \u2014 migrate or summarize" : pct >= 80 ? "\u26A0 Context filling \u2014 consider migrate" : usedBridge ? "Full conversation" : "Local token estimate (no IKO server required)";
          window.IKO.latestData = {
            platform: model.label,
            tokens,
            messageCount: usedBridge ? bridgeMessages.length : dom.length,
            usagePercentage: pct,
            tokenizer: "Local estimate",
            cost,
            source: usedBridge ? "conversation" : "selectors",
            status: `${health} \xB7 ~$${cost.toFixed(3)}`
          };
          lastSignature = sig;
          updateUI(window.IKO.latestData);
        } catch (error) {
          console.error("[IKO Claude] Token count failed:", error);
          updateUI({
            platform: "Claude",
            tokens: 0,
            messageCount: 0,
            usagePercentage: 0,
            tokenizer: "Local estimate",
            status: "Token count unavailable"
          });
        } finally {
          window.IKO.ui?.setLoading(false);
          counting = false;
        }
      }
      var observer = null;
      var domTimer = null;
      var domLast = 0;
      var urlTimer = null;
      var lastHref = location.href;
      var IKO_UI_SELECTOR = "#iko-context-hud, #iko-bot, #iko-optimizer-panel, #iko-optimizer-launcher";
      function isOwnUi(target) {
        const el = target?.nodeType === 1 ? target : target?.parentElement;
        return typeof el?.closest === "function" && !!el.closest(IKO_UI_SELECTOR);
      }
      function scheduleUpdate(delay = 700) {
        if (domTimer) return;
        const wait = Math.max(0, delay - (Date.now() - domLast));
        domTimer = setTimeout(() => {
          domTimer = null;
          domLast = Date.now();
          updateClaude();
        }, wait);
      }
      function watchPage() {
        if (typeof MutationObserver !== "function") return;
        if (observer) observer.disconnect();
        observer = new MutationObserver((records) => {
          if (document.hidden) return;
          for (const record of records) {
            if (isOwnUi(record.target)) continue;
            scheduleUpdate();
            return;
          }
        });
        observer.observe(document.body || document.documentElement, {
          childList: true,
          subtree: true,
          characterData: true
        });
      }
      function watchUrl() {
        clearInterval(urlTimer);
        urlTimer = setInterval(() => {
          if (location.href === lastHref) return;
          lastHref = location.href;
          updateClaude();
        }, 300);
      }
      function initialize() {
        if (!isClaudePage()) return;
        console.log("[IKO Claude] Initializing Context HUD");
        removeLegacyHUD();
        window.IKO.ui?.create();
        updateClaude();
        window.addEventListener("iko-claude-conversation-updated", () => {
          updateClaude();
        });
        clearInterval(updateTimer);
        updateTimer = setInterval(() => {
          removeLegacyHUD();
          updateClaude();
        }, 2500);
        watchPage();
        watchUrl();
        document.addEventListener("visibilitychange", () => {
          if (!document.hidden) updateClaude();
        });
      }
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
      } else {
        initialize();
      }
    }
  });

  // src/content/claude-entry.js
  var require_claude_entry = __commonJS({
    "src/content/claude-entry.js"() {
      var import_claude_bridge_client = __toESM(require_claude_bridge_client());
      var import_ui = __toESM(require_ui());
      init_attachment_saver();
      var import_claude_main = __toESM(require_claude_main());
    }
  });
  require_claude_entry();
})();
