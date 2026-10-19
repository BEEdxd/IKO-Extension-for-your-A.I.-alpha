"use strict";

import IKOComposer from "./composer-io.js";
import "./theme.js";
try { window.IKOComposer = window.IKOComposer || IKOComposer; } catch { /* ignore */ }

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
      const el =
        window.IKOComposer?.findComposer?.();
      if (!el || !el.getBoundingClientRect) {
        return null;
      }
      const r = el.getBoundingClientRect();
      if (!r || r.width < 120 || r.height < 10) {
        return null;
      }
      if (
        r.bottom <= 0 ||
        r.top >= window.innerHeight
      ) {
        return null;
      }
      return r;
    } catch {
      return null;
    }
  },

  position() {
    const hud =
      this.hud ||
      document.getElementById(
        "iko-context-hud"
      );

    if (!hud) {
      return;
    }

    // User-dragged HUD stays where dropped (only keep it on top).


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


    /*
     * Fallback dock when no composer is
     * found (unknown page layout).
     */
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

    /*
     * Re-apply position occasionally because
     * ChatGPT/Claude can dynamically modify
     * their page layout.
     */
    if (this.repositionTimer) {
      clearInterval(
        this.repositionTimer
      );
    }

    this.repositionTimer =
      setInterval(
        () => {
          this.position();
          // Watchdog: some site scripts nuke our nodes — resurrect the bot.
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
          } catch { /* ignore */ }
        },
        2000
      );
  },

  /*
   * ==========================================
   * CREATE HUD
   * ==========================================
   */

  create() {
    /*
     * Prevent duplicate HUDs.
     */
    const existing =
      document.getElementById(
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

    const hud =
      document.createElement("div");

    hud.id =
      "iko-context-hud";
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
                        Counting context…
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

    /*
     * Put it directly on documentElement
     * so ChatGPT/Claude containers don't
     * affect its position.
     */
    document.documentElement.appendChild(
      hud
    );

    this.hud = hud;

    this.ensureBot();
    this.ensureThemeToggle(hud);
    this.wireAlertThreshold();
    this.wireActions();
    this.wireHudDrag();

    /*
     * Detect current platform.
     */
    const platform =
      window.IKO?.platform
        ?.detect?.();

    const platformElement =
      document.getElementById(
        "iko-hud-platform"
      );

    if (platformElement) {
      platformElement.textContent =
        platform || "AI";
    }

    /*
     * Position after DOM paint.
     */
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
    } catch { /* retain the default */ }
    select.addEventListener("change", () => {
      const value = Number(select.value);
      apply(value);
      try {
        if (globalThis.chrome?.storage?.local) chrome.storage.local.set({ [key]: value });
        else localStorage.setItem(key, String(value));
      } catch { /* in-memory setting still applies */ }
      window.dispatchEvent(new CustomEvent("iko-context-threshold-changed"));
    });
  },

  // Moon/sun theme switch in the HUD header strip
  ensureThemeToggle(hudRoot) {
    try {
      const top =
        hudRoot.querySelector(".iko-hud-top");
      if (!top || top.querySelector(".iko-theme-toggle")) return;
      const theme = window.IKOTheme;
      if (!theme) return;
      top.appendChild(
        theme.button("iko-theme-toggle-sm")
      );
    } catch { /* ignore */ }
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
    } catch { /* ignore */ }
  },
  ensureBot() {
    let bot = document.getElementById("iko-bot");
    if (!bot) {
      bot = document.createElement("button");
      bot.id = "iko-bot";
      bot.type = "button";
      bot.title = "IKO — click to show/hide";
      bot.innerHTML = '<span class="iko-bot-dot"></span><span>IKO</span>';
      document.documentElement.appendChild(bot);
    }
    try {
      bot.style.position = "fixed";
      bot.style.zIndex = "2147483645";
      bot.title = "Drag to move · click to show or hide IKO";
    } catch { /* ignore */ }
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

        const isHidden =
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0;

        if (!isHidden) {
          hud.style.setProperty("display", "none", "important");
          return;
        }

        // Remove stale inline positioning overrides.
        [
          "inset",
          "top",
          "left",
          "right",
          "bottom",
          "width",
          "height"
        ].forEach(property => {
          hud.style.removeProperty(property);
        });

        // Make the HUD measurable before positioning it.
        hud.style.setProperty("display", "block", "important");
        hud.style.setProperty("visibility", "visible", "important");
        hud.style.setProperty("opacity", "1", "important");

        this.position();

        // Ensure it remains visible after positioning.
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
        if (p) { place(p.left, p.top); return true; }
      }
    } catch { /* ignore corrupt pos */ }
    try {
      if (globalThis.chrome?.storage?.local) {
        chrome.storage.local.get([key], (r) => {
          try {
            const p = fromShape(r?.[key]);
            if (p) place(p.left, p.top);
            else place(null, null);
          } catch { place(null, null); }
        });
        return true;
      }
    } catch { /* ignore */ }
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
      try { localStorage.setItem(key, JSON.stringify({ left, top })); } catch { /* ignore */ }
      try { globalThis.chrome?.storage?.local?.set?.({ [key]: { left, top } }); } catch { /* ignore */ }
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
      sx = cx; sy = cy;
      const r = el.getBoundingClientRect();
      sl = r.left; st = r.top;
      // switch from right/bottom anchoring to left/top before moving
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
        try { save(r.left, r.top); } catch { /* ignore */ }
        try { window.IKO?.logger?.info?.("Drag", "dropped", { key: key || "none", left: Math.round(r.left), top: Math.round(r.top) }); } catch { /* ignore */ }
        if (onDrop) { try { onDrop(r); } catch { /* ignore */ } }
        // swallow the click that follows a drag
        setTimeout(() => { el.dataset.dragged = "0"; }, 150);
      }
      moved = false;
    };
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      begin(e.clientX, e.clientY);
    });
    window.addEventListener("pointermove", (e) => {
      if (e.pointerId === undefined) return;
      move(e.clientX ?? sx, e.clientY ?? sy);
    });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    handle.addEventListener("mousedown", (e) => {
      if (e.detail === 0) return;
      begin(e.clientX, e.clientY);
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging || e.pointerId !== undefined) return;
      if (e.clientX === undefined) return;
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
          else alert("IKO migration is still loading — wait 2s and retry.");
        } catch (e) { console.error("[IKO] Migrate open failed:", e); }
      });
    }
    const optimize = document.getElementById("iko-hud-optimize");
    if (optimize && !optimize.dataset.wired) {
      optimize.dataset.wired = "1";
      optimize.addEventListener("click", () => {
        try {
          // Reuse optimizer launcher logic via synthetic click if present
          const launcher = document.getElementById("iko-optimizer-launcher");
          if (launcher) { launcher.click(); return; }
          // Fallback: dispatch event the optimizer listens for
          window.dispatchEvent(new CustomEvent("iko-optimize-requested"));
          setTimeout(() => {
            if (!document.getElementById("iko-optimizer-panel")) {
              alert("IKO optimizer is still loading — wait 2s and retry.");
            }
          }, 300);
        } catch (e) { console.error("[IKO] Optimize open failed:", e); }
      });
    }
    const files = document.getElementById("iko-hud-files");
    if (files && !files.dataset.wired) {
      files.dataset.wired = "1";
      files.addEventListener("click", () => {
        try {
          if (window.IKO?.attachments?.openPanel) window.IKO.attachments.openPanel();
          else window.dispatchEvent(new CustomEvent("iko-attachments-requested"));
        } catch (e) { console.error("[IKO] Files panel failed:", e); }
      });
    }
  },

  /*
   * ==========================================
   * LOADING STATE
   * ==========================================
   */

  setLoading(
    loading,
    message = "Counting context…"
  ) {
    const loadingElement =
      document.getElementById(
        "iko-hud-loading"
      );

    const statusElement =
      document.getElementById(
        "iko-hud-status"
      );

    const loadingBar =
      document.getElementById(
        "iko-hud-loading-bar"
      );

    const loadingText =
      document.getElementById(
        "iko-hud-loading-text"
      );

    if (!loadingElement) {
      return;
    }

    if (loading) {
      /*
       * Show loading row.
       */
      loadingElement.hidden =
        false;

      if (loadingText) {
        loadingText.textContent =
          message;
      }

      if (statusElement) {
        statusElement.textContent =
          message;
      }

      if (loadingBar) {

        loadingBar.style.width =
          "35%";

        loadingBar.classList.add(
          "iko-indeterminate"
        );
      }

      this.position();

      /*
       * Safety net: never leave the HUD stuck
       * counting, even if something downstream
       * throws before the finally block runs.
       */
      clearTimeout(this._loadingSafetyTimer);
      this._loadingSafetyTimer = setTimeout(() => {
        try { this.setLoading(false); } catch { /* ignore */ }
        try { window.IKO?.resetCounting?.(); } catch { /* ignore */ }
      }, 8000);

      return;
    }

    /*
     * Stop loading.
     */
    clearTimeout(this._loadingSafetyTimer);

    loadingElement.hidden =
      true;

    if (loadingBar) {

      loadingBar.style.width =
        "0%";

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

    const tokens =
      Number(
        data?.tokens || 0
      );

    const percentage =
      Math.max(
        0,
        Math.min(
          100,
          Number(
            data?.usagePercentage ??
            0
          )
        )
      );


    const tokenElement =
      document.getElementById(
        "iko-hud-tokens"
      );

    const usageElement =
      document.getElementById(
        "iko-hud-usage"
      );

    const progress =
      document.getElementById(
        "iko-hud-progress-bar"
      );

    const status =
      document.getElementById(
        "iko-hud-status"
      );

    const platformElement =
      document.getElementById(
        "iko-hud-platform"
      );


    /*
     * Token count
     */
    if (tokenElement) {
      tokenElement.textContent =
        tokens.toLocaleString();
    }


    /*
     * Usage percentage
     */
    if (usageElement) {

      if (
        data?.usagePercentage ==
        null
      ) {
        usageElement.textContent =
          "—";
      } else {
        // Round to 0% when tokens exist but usage is below 1% — show <1%
        // instead of a misleading 0%.
        usageElement.textContent =
          percentage === 0 && tokens > 0 ? "<1%" : `${percentage}%`;
      }
    }


    /*
     * Platform
     */
    if (
      platformElement &&
      data?.platform
    ) {
      platformElement.textContent =
        data.platform;
    }


    /*
     * Progress bar
     */
    if (progress) {
      progress.style.width =
        `${percentage}%`;
    }


    /*
     * Status
     */
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
      status.textContent = data?.source && data.source !== "none" && !statusAlreadyNamesSource
        ? `${statusText} · ${sourceLabel}`
        : statusText;
      status.title = [
        `Platform: ${data?.platform || "Unknown"}`,
        `Reading: ${sourceLabel}`,
        sourceDetails[data?.source] || "IKO is using its available context estimate for this platform.",
        data?.reason ? `Details: ${data.reason}` : "",
        data?.messageCount != null ? `Messages counted: ${data.messageCount}` : ""
      ].filter(Boolean).join("\n");
      status.setAttribute("aria-label", `${data?.platform || "AI platform"}: ${sourceLabel}. ${sourceDetails[data?.source] || "Context estimate."}`);
    }


    /*
     * Stop loading animation.
     */
    this.setLoading(false);


    /*
     * Make sure it stays in the
     * bottom-right position.
     */
    requestAnimationFrame(
      () => this.position()
    );
  }
};
