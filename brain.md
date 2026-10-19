# IKO BRAIN — Complete Project Knowledge (v0.2.0-universal+attachments+dragbot+sir-p0+p1-pdf+p1b-ocr+p2-retrieval+hud-drag+copilot-fix+claude-fix+full-history+hud-loading-fix+reconnect)

> Read this first. It documents every feature, file, data flow, upgrade,
> and how to extend the project without breaking it.
>
> ## ⛔ MANDATORY MAINTENANCE RULE — ALL MODELS MUST FOLLOW
> Whenever ANY model (human-assisted or autonomous) makes ANY code change in
> this project — feature, fix, refactor, config, CSS, docs, or single-line edit —
> it MUST also upgrade this `brain.md` in the SAME change set:
> 1. Update the affected feature section (§3) with new behavior/files/limits.
> 2. Append a numbered entry to `§4 Upgrades changelog` explaining what + why.
> 3. Update `§1 Repo map` if files were added/removed/renamed.
> 4. Bump the version suffix in the title if user-facing behavior changed.
> 5. Never finish a change with “code updated, docs later” — docs ARE the change.
> A change without a matching `brain.md` upgrade is INCOMPLETE and must be rejected
> in review. Future models rely solely on this file for full project context.

## 0. One-paragraph summary

IKO is a Chrome MV3 extension that runs on 9 LLMs (ChatGPT, Claude, Gemini,
Perplexity, Copilot, Grok, DeepSeek, Mistral, Poe). It provides: (1) a Context
HUD with token/usage/cost estimates, (2) one-click session migration between
any two LLMs via a validated package relayed through the service worker,
(3) a local prompt optimizer, (4) session library, chunked insert, export,
message picker. No backend, API key, or localhost required (optional localhost
counter proxy supported). Built with esbuild IIFE bundles (`dist/`).

## 1. Repo map

```
manifest.json                 MV3, Chrome+Firefox: permissions(storage),
                              host_permissions(9 LLMs), content_scripts(ISOLATED
                              ×2 + MAIN bridges), background SW+scripts, gecko id/SMV128
background.js                 storage relay + tabs.create opener. No HUD logic.
build.js                      esbuild ×5 (content, claude-content, claude-bridge,
                              chatgpt-bridge, migration) + css copies → dist/
package.json                  scripts: build, test:migration. deps: gpt-tokenizer, esbuild.
src/content/main.js           Universal HUD controller (all non-Claude sites).
src/content/ui.js             HUD singleton + #iko-bot dock + Migrate/Optimize buttons.
src/content/style.css         HUD + bot + actions styles.
src/content/claude-entry.js   Bundles bridge-client + ui + attachments-saver + claude-main.
src/content/claude-main.js    Claude HUD controller (bridge data → per-model budget/price/cost → ui).
src/content/claude-bridge-client.js  ISOLATED listener → IKO.claudeBridge + CustomEvent.
src/content/chatgpt-bridge-client.js Same for ChatGPT backend-api.
src/content/claude-api.js     Local estimate ceil(chars/4). Labelled as estimate.
src/content/claude-message-converter.js  Claude API shape → [{role,content}].
src/content/claude-token.js / claude-tokens.js  LEGACY, currently dead — do not use.
src/content/token.js / token-engine.js / content-analyzer.js / constants.js  LEGACY/duplicates.
src/content/platform-detector.js  Table-driven hostname → display name + fallback prettify.
src/injected/claude-bridge.js    MAIN world: patches fetch/XHR for /chat_conversations|/conversations|/api/*chat*.
src/injected/chatgpt-bridge.js   MAIN world: captures /backend-api/conversation*.
src/content/migration/migration-entry.js  Bundles engine+adapters+platforms+optimizer+UI+main.
src/content/migration/iko-log.js          Ring-buffer logger (500), diagnostics, copyAll.
src/content/migration/migration-ui.js     Modal, dest card + themed dropdown,
                                          review+checklist, export/save, library, logs.
src/content/migration/migration-main.js   Launcher removed (unified dock),
                                          direction, composer find/set (shadow-aware),
                                          prompt build + chunking, library storage,
                                          pending bar (destination-only).
src/content/migration/migration.css       Modal + launcher + pending bar + logs + picker + optimizer.
src/migration/sir/sir.js             SIR v0.1 UMD (Node+browser): @DOC/@ENTITY/
                                     @METRIC/@REL/@TABLE/@TURN/@SRC/@CONF builders,
                                     markdown-table parse, kv extract, image semantics
                                     (standard+aggressive), sessionToSIR, token compare.
src/migration/tests/sir.test.js      7 tests: determinism, table compaction beats raw,
                                     kv extract, aggressive<verbose, kv<JSON measured.
src/migration/sir/pdf.js             P1 PDF layer UMD: detectPdfKind (text-native vs
                                     scanned vs mixed via Tj/TJ vs Image XObjects),
                                     extractTextNative (BT..ET literal/hex decode),
                                     pdfToSIR (text→SIR L3 or ocr-required route).
src/migration/tests/pdf.test.js      4 tests: kind detect, native extract + scanned flag,
                                     SIR routing, determinism (synthetic PDFs).
src/migration/sir/ocr.js             P1b OCR UMD: deterministic preprocess (grayscale+
                                     contrast+2x), peer/Tesseract probe, recognize()
                                     with honest routes, scannedToSIR (+@CONF).
src/migration/tests/ocr.test.js      5 tests: preprocess determinism, no-engine honesty,
                                     peer plug-in, SIR+confidence wrap, empty→ocr-empty.
src/content/attachments/attachment-saver.js  Attachment Token Saver: file watcher,
                                     image token estimate, canvas compress, panel.
                                     OCR buttons (peer/Tesseract → SIR).
src/migration/sir/retrieval.js       P2 QASC-lite UMD: intent→level classifier,
                                     per-turn+per-row units, overlap scoring,
                                     retrieve() + formatMinimal (@QUERY/@DOC/@HIT).
src/migration/tests/retrieval.test.js 6 tests: levels, id/metric hits, empty→full,
                                     determinism+format, savings.
src/content/prompt-optimizer/optimizer.js      Pure rule-based rewrite (intent→Role/Task/Req/Output).
src/content/prompt-optimizer/optimizer-ui.js   Modal with modes/score/tips/copy/apply.
src/content/prompt-optimizer/optimizer-main.js Composer read/write + event listener.
src/migration/platforms.js           SINGLE SOURCE OF TRUTH: id,name,hosts,newUrl,
                                     budget,pricePer1M,selectors,composers. Add LLM here.
src/migration/core/chat-thread.js     Shared thread reader for the Context HUD:
                                     platform selectors (from platforms.js) →
                                     innermost-match pruning → whole-thread
                                     estimate, `extractConversationMessages`
                                     for bridge/API payloads (whole chat, not
                                     just what the DOM mounts) and `debugReading`
                                     (paste-ready fingerprint for Copy logs).
                                     Exports readText/matchPlatform.
src/migration/tests/chat-thread.test.js  19 tests: double-count, per-platform
                                     selectors, dedupe, thread estimate, partial
                                     markup, welcome screen, chrome skip, hidden
                                     innerText, budget contract per host, the
                                     0-token traps (script blob, dominant last
                                     turn, single-paragraph thread, empty markdown
                                     wrapper), bridge conversation parsing,
                                     debugReading fingerprint.
src/migration/core/schema.js         Session shape v1.0.0, roles, content types, validator.
src/migration/core/normalizer.js     Raw → canonical, active-branch resolve, clone.
src/migration/core/integrity.js      Canonical JSON → SHA-256 attach/verify.
src/migration/core/validator.js      Schema + parent refs + integrity → {valid,errors}.
src/migration/core/migration-package.js  Session → transport envelope + serialize.
src/migration/core/migration-state.js     FSM: idle→extracting→…→ready→opening→review.
src/migration/core/migration-engine.js   run() 6 steps + prepareDestination(). Logs stages.
src/migration/adapters/adapter-interface.js  Abstract Source/Destination + AdapterError.
src/migration/adapters/chatgpt-source-adapter.js  Bridge-first (mapping/current_node),
                                     direct /backend-api fetch, DOM selectors, leaf fallback.
src/migration/adapters/claude-source-adapter.js   Bridge-first (multi-shape parser +
                                     detectRole/extractTextDeep pure helpers) +
                                     structured DOM + leaf fallback + fingerprint.
src/migration/tests/claude.test.js      5 tests: role variants, text unwrap, bridge
                                     normalize + chain links, unknown-shape skip.
src/migration/adapters/universal-source-adapter.js Generic: platform selectors + <main> fallback.
src/migration/adapters/chatgpt/claude-destination-adapter.js  Legacy (kept for compat).
src/migration/adapters/universal-destination-adapter.js  One class for all dests (save+open).
src/migration/adapters/mock-source-adapter.js + mock/mock-session.js + tests/migration.test.js
```

## 2. Runtime worlds (critical)

- ISOLATED (content scripts): see DOM, separate JS heap. `dist/content.js`,
  `dist/claude-content.js`, `dist/migration.js` run here at `document_idle`.
- MAIN (injected): shares heap with page, can patch `fetch/XHR`.
  `dist/claude-bridge.js`, `dist/chatgpt-bridge.js` run here at `document_start`.
- Only bridge between worlds: `window.postMessage({source, type, payload})`
  + `CustomEvent` inside ISOLATED. Never assume shared variables.
- Service worker (`background.js`): only `chrome.storage.local.ikoPendingMigration`
  + `chrome.tabs.create`. Validates sender hostname against `SOURCE_HOSTS`.

## 3. Features in detail

### 3.1 Context HUD + bot dock (`ui.js`, `main.js`, `claude-main.js`, `style.css`)

- HUD `#iko-context-hud` fixed bottom-right (24px/105px, z 2147483640),
  appended to `document.documentElement` to escape site containers.
  Re-pinned on resize + 2s interval (SPA reflows).
- Contents: brand+dot, `#iko-hud-platform`, stats Context/Usage,
  loading indeterminate bar, progress bar, status, actions row
  `[↗ Migrate][✨ Optimize][📎 Files]` (`#iko-hud-actions`).
- Bot `#iko-bot` (pill) toggles HUD `display`. Both bot and HUD card are draggable
  via generic `makeDraggable(el, {storageKey, dragClass, dragHandle, onDrop})`
  (Pointer + mouse + touch, window-level tracking, 5px click-vs-drag threshold,
  viewport clamp, left/top positioning, persisted to localStorage + chrome.storage).
  HUD drag uses its header (`.iko-hud-top`, move cursor) as handle; first drop sets
  `dataset.pinned=1` (key `ikoHudPos`) after which `position()` stops resetting it
  (keeps z-index only) so it never snaps back over the composer. Bot key is
  `ikoBotPos` (legacy `{right,bottom}` shape auto-migrated). Watchdog in the 2s
  interval resurrects bot/actions/drag wiring if site scripts nuke nodes.
  Single entry point;
  legacy `#iko-migration-launcher` / `#iko-optimizer-launcher` removed/hidden.
- `ensureBot/wireActions/ensureActionsIn` backfill older HUDs. Actions resolve
  globals at click-time (load-order safe): `IKOMigrationMain.open`,
  `iko-optimize-requested` event.
- `main.js` (all except Claude): token count comes from the SHARED reader
  `src/migration/core/chat-thread.js` (`extractChatThread(platformId)`), which is
  driven by the same per-platform selectors as migration
  (`platforms.js` → `selectorsFor`), keeps only the INNERMOST match per nesting
  (ChatGPT matches both the turn wrapper and the message body — counting both
  doubled the tokens), and falls back to one whole-thread estimate
  (`threadContainer()`: walk down from `<main>` while one child still holds
  ≥70% of the text, **measuring noise-free text** — script/style/nav must never
  win the walk, or an inline JSON state blob becomes "the thread" and the count
  collapses to 0; the walk also stops as soon as a level splits into ≥2
  message-sized blocks, so a chat dominated by its last answer is not walked
  into a single paragraph). If the selector reading covers <25% of the thread
  text and is under 1500 chars it is replaced by that estimate — a confident
  tiny number is the bug users reported. When nothing is readable,
  `extractChatThread` returns a `reason`
  (`no-container`, `thread-too-small(n)`, `welcome-screen(n blocks)`) which
  `main.js` writes to the console and to the log panel ("View logs → Copy logs"),
  so an unreadable site is diagnosable from a screenshot of the logs.
  `update()` every 2s with `counting` mutex: `budget/price` from
  `matchPlatform(location.hostname)` (platforms.js is the only copy; the old
  inline `BUDGETS/PRICES` tables are gone).
  TWO SOURCES, ONE NUMBER: the DOM reading (what the page mounts) and, on
  ChatGPT, the whole conversation from the page's own API. Two ways in, in
  order: (1) the page bridge payload — `IKO.chatgptBridge.latestValidConversation`
  first, because ChatGPT's SIDEBAR CHAT-LIST shares the
  `/backend-api/conversations` URL prefix and overwrites `latestConversation`
  with a list payload (the client keeps the last payload that really parses,
  largest wins, and records how many messages it held);
  (2) if there is none, one same-origin GET of the page's own endpoint
  (`/backend-api/conversations/<id>?num_turns=1000`, then the plain plural, then
  the classic singular; cookies carry the session; retried at most once a
  minute) — whichever answers is logged, and it never downgrades a payload that
  held more messages. Both feed
  `extractConversationMessages()`: API `mapping` walked along
  `current_node → parent`, so it is the whole conversation in order without dead
  branches. `tokens = max(domTokens, bridgeTokens, highWater)` — the bridge
  covers turns the DOM no longer mounts, and the per-conversation HIGH-WATER
  mark (`hostname+pathname` key, reset when a chat is opened or started) stops
  the count from rolling back when a site unmounts old turns while scrolling.
  `cost`, `pct`, health (`≥80% filling, ≥95% critical`), status
  `"<health> · ~$x.xxx"` with `"Full conversation"` when the whole chat supplied
  the number and `"Thread estimate — no message markup"` when the fallback did.
  An FNV-1a signature of (platform, source, message texts, bridge tokens) skips
  re-tokenising when the thread has not changed, so the HUD only moves when the
  conversation moves. `window.IKO.chatThread` exposes the reader for other
  modules and harnesses.
  WEAK-READ DIAGNOSTIC: when the DOM reading is not the selector path, the HUD
  logs ONCE per conversation (`console` + log panel, so "View logs → Copy logs"
  is enough to fix a site): the bridge state (`ready/silent`,
  `payload(keys)`, `valid(N msgs)`), every selector with its match count, the
  chosen container (tag#id.class + 60 chars), its chars/blocks and whether the
  walk descended. That is what a "we cannot read this site" report needs.
  LIMIT: on sites with no bridge payload (everything but ChatGPT) only what is
  in the DOM is counted — the high-water mark softens but cannot remove
  virtualised-history under-reporting.
- `claude-main.js`: reads `IKO.claudeBridge.latestConversation` — but only when
  the payload names the open chat (`/chat/<uuid>` id, or the fetched URL inside
  the bridge), because the bridge caches the previous chat and REPLAYS it on
  every refresh request (that stale replay is what froze the HUD on Claude).
  A fresh payload gives the whole conversation; otherwise the HUD falls back to
  the live DOM through the same shared reader (`extractChatThread("claude")`)
  and takes `max(dom, bridge, highWater)`. Live updates use the same
  observer/throttle/URL-watcher trio as `main.js`; per-chat state resets when
  `hostname+pathname` changes. Local chars/4 estimate (`claude-api.js`) keeps
  the "no server required" label; per-model detect (`opus $15 / sonnet $3 /
  haiku $0.8`, all 200k) refines usage/cost. Attachments saver bundled via
  `claude-entry.js` — Claude has 📎 Files parity with all other LLMs.
- `platform-detector.js`: table + pretty fallback; `main.js:detectPlatform()`
  mirrors it (bundle separation).

### 3.2 Bridges (Claude + ChatGPT)

- `claude-bridge.js`: guards `__IKO_*_INSTALLED__`, `publish()` helper,
  `isConversationUrl` broad (`chat_conversations|conversations|conversation|api+chat`),
  wraps `fetch` (clone→json→publish) + `XHR.open/send` (`__ikoUrl` + load→publish).
  Emits `BRIDGE_READY` on load.
- `chatgpt-bridge.js`: same shape, matches `/backend-api/conversation*`.
- Clients (`*-bridge-client.js`): `window.IKO.*Bridge={latestConversation,ready}`,
  `message` listener (`e.source===window`, source check), cache + dispatch
  `iko-*-conversation-updated`. Claude answers `REQUEST_REFRESH` by replaying
  cache (`BRIDGE_EMPTY` if none); ChatGPT side still relies on natural refetch +
  direct API fallback.
- ChatGPT mapping parse (`chatgpt-source-adapter.js:parseBridgeData`):
  `mapping/current_node` chain walk (parent links) else insertion order;
  `author.role→role`, `content.parts[]→text`; returns null if unparsable.
  Direct `fetch(/backend-api/conversation/<id>, credentials:include)` fallback
  if bridge missed initial load. Logs `bridge yielded N` / `direct API yielded N`.

### 3.3 Session migration core

- Schema (`schema.js` v1.0.0): `{schemaVersion, source{platform,conversationId,
  title,model,createdAt,updatedAt,extractedAt,extractorVersion}, messages[{id,
  role,sourceRole,content[{type,text,code,...}],parentId,siblingBranchIds,
  timestamp,model,raw}], branchInfo{hadAlternateBranches,prunedBranchCount,
  activeLeafId}, instructions[], integrity{}, migrationMeta{}}`.
- `normalizer.js:normalizeSession(raw)`: requires platform+conversationId,
  `resolveActiveBranch` via parent chain (cycle detect), keeps active branch,
  counts pruned, `structuredClone`, `assertValidSessionShape`.
- `integrity.js`: `stableSortObject` canonical → `SHA-256` (WebCrypto) →
  `attach/verify`. Note: canonicalizes subset; keep in sync with schema.
- `validator.js`: schema + ≥1 message + parent refs + integrity → metadata.
- `migration-package.js`: `{packageVersion 1.0.0, schemaVersion, createdAt,
  source:{...session.source}, session:clone, integrity{contentHash,messageCount},
  migration{status:prepared}}` + serialize/deserialize with version check.
- `migration-state.js`: FSM + history timestamps + fail().
- `migration-engine.js:run()`: EXTRACT→NORMALIZE→integrity→VALIDATE→PACKAGE→READY,
  logs `stage: extracting/ready`; `prepareDestination()`: OPENING→PREPARING→REVIEW.
  Returns `{success, session, migrationPackage, validation, state}` or `{success:false, error}`.

### 3.4 Adapters + platforms registry

- `platforms.js`: 9 entries with `budget, pricePer1M, selectors, composers`.
  `matchPlatform(host)`, `allHosts()`. **Add LLM = 1 entry here.**
- `chatgpt-source-adapter.js`: bridge (refused when it names another
  conversation — same guard as the HUD) → direct API (`?num_turns=1000` → plain
  plural → singular) → 6 DOM selectors → leaf fallback (leaf-only, skips thread
  root, toolbar role signal, else alternate) → shared `chat-thread.js` reader
  (renamed app-shell markup, innerText-empty trees; messages tagged
  `thread-reader:<source>`). Fingerprint
  (`hasMain,totalNodes,mainTextLen,bodyTextLen,dataAttrs,testids,topTags,htmlSample`)
  logged on empty; the thrown error adds `bodyLen=` and `reader: <source>/<reason>`.
  Extractor `iko-chatgpt-dom-4-fullhistory` → `api-1` when bridged.
- `claude-source-adapter.js`: `parseBridgeMessages` tries `chat_messages|messages|
  conversation_messages|turns|message_list|history|conversation.*|data.messages`
  (unknown shapes → `[]` → DOM path, never throw); `detectRole` covers
  sender/role/author/author_role/from + nested shells; `extractTextDeep`
  (trimmed, depth-guarded) covers text/completion/answer/output_text, block arrays
  (skips thinking/tool_use), nested message shells. Pipeline: bridge →
  structured DOM (`chat-message/message-id/article`, toolbar role signal) →
  leaf fallback (innermost containers, chrome filtered) → empty-chat-specific
  error on `/new` (`open a conversation first`) else fingerprint error with
  counts + dataAttrs. Helpers exported for Node tests. Version
  `iko-claude-3-shapes+dom`.
- `claude-bridge.js` (MAIN): caches last CONVERSATION/USAGE payloads and answers
  `IKO_CLAUDE_CONTENT/REQUEST_REFRESH` by replaying them (`BRIDGE_EMPTY` if none) —
  previously the adapter's 10s wait could never resolve on quiet pages.
- `universal-source-adapter.js`: platform selectors + generic `<main>` fallback,
  alternating roles. Used for Gemini/Perplexity/etc.
- Destinations: legacy ChatGPT/Claude kept; `UniversalDestinationAdapter(id)`
  does `IKO_SAVE_MIGRATION` then `IKO_OPEN_MIGRATION_DESTINATION` for any id.
  `createSourceAdapter` prefers precise then universal; `createDestinationAdapter`
  prefers legacy then universal.

### 3.5 Migration UI flow (`migration-ui.js`, `migration-main.js`)

- Entry (`migration-entry.js`) exposes `IKOMigrationCore{engine,adapters,PLATFORMS}`,
  `IKOOptimizerCore{optimizePrompt}`, loads log→UI→main→optimizer UI→main.
- Panel: direction bar, SOURCE card (auto), DESTINATION card with the themed
  `.iko-dd` listbox (all platforms except current; the native `<select>` is kept
  hidden as the value holder), status,
  review, `[Cancel][Prepare]`, `[Open X]`, `★ Saved sessions`, `View logs`.
- Changing dest invalidates package: clears review, disables Open, resets
  Prepare text, status prompts re-Prepare (`migrationPackage=null` + engine rebuild).
- Review (`renderReview`): rows (title/messages/source/convId), branch note,
  message checklist (≤60, `container._excluded` set), integrity line,
  `[↓ .md][↓ .json][↓ .sir][★ Save]`. Open applies `_excluded` filter to outgoing package.
- Export: `sessionToMarkdown` (`# Title ## ROLE`), JSON stringify, blob download.
- Library (`migration-main.js`): `chrome.storage.local.ikoSessions` max 20
  `{id,title,platform,messages,savedAt,session,package}`; list/load/delete/save
  wired to UI. Load restores preview + re-arms Open.
- Prompt build: `sessionToPrompt(session, excluded)` header + turns
  (`text||code||input/output`), footer. `sessionToChunks(max 7500)` greedy by
  turns with `Part i/N` headers for composer limits.
- Composer: `deepQueryAll` pierces shadow DOM (Gemini `rich-textarea`),
  selectors include aria/proseMirror/role, thresholds 180×18, `Ask Gemini`
  fallback, logs `composer scan`. `setComposerValue` handles textarea setter +
  ProseMirror/execCommand(`insertText`)+beforeinput/input/change.
- Pending bar (`showPendingMigration`): shows ONLY when `pkgSource !== current`
  (destination-only; old inverted check fixed). Chunked insert: button becomes
  `Insert part k/N` until done, then `IKO_CLEAR_MIGRATION` + remove. Dismiss ×.
  Polls `IKO_GET_MIGRATION` at 1.2s + 1.5s interval.
- `background.js`: `DESTINATIONS` 9 URLs, `SOURCE_HOSTS` 13, message handlers
  save/get/clear/open with `lastError` handling + stale-context guards.

### 3.6 Prompt optimizer (`prompt-optimizer/`)

- `optimizer.js` (pure, tested implicitly): `cleanText`, `detectIntent`
  (code/debug/explain/summarize/translate/compare/plan/general),
  `vaguenessScore`, `optimizePrompt(raw, mode)` → `{optimized, improvements,
  score 55–95, intent}`. Template: Role per intent + `Task:` + Requirements
  (preserve exact, state assumption) + Output format per intent + detail level.
  Modes: clarify (structured), concise (single line), detailed (+edge cases).
- `optimizer-ui.js`: modal with mode buttons, score line, editable textarea,
  tips list, Copy/Apply. `refresh()` re-runs optimizer per mode, logs lengths.
- `optimizer-main.js`: shadow-aware composer find/read/safeWrite, unified-dock
  mode (legacy launcher removed), listens `iko-optimize-requested` + `start()`.
  Triggered from HUD `✨ Optimize` button.
- Styles in `migration.css` (#iko-optimizer-*). Bundled via `migration-entry.js`
  so available on all 9 LLMs. Fully local.

### 3.7 Attachment Token Saver (`attachments/attachment-saver.js`)

- Local-only watcher: global `change` (input[type=file]) + `drop` listeners record
  images/PDFs into `seenFiles` (max 20, dedupe by name+size). Exposed as
  `window.IKO.attachments.{recordFile,compressImage,estimate*,list,openPanel}`.
- Token model: images `85 + 170×tiles` (tiles=ceil(w/512)×ceil(h/512), cap 12;
  low-detail=85) mirroring OpenAI vision pricing; PDFs `max(500, size/4)`.
- `compressImage(file, 1024px, q0.72)`: `createImageBitmap`/Image → canvas white
  flatten → `toBlob(jpeg)` → `{blob,w,h}`. New tokens recomputed from output dims;
  `saved%` shown. Downloads `-iko-1024.jpg` for re-attach + copies compact
  descriptor `[media:image name WxH size→size tokens:a→b]` to clipboard.
- PDFs: no local parse (no pdf.js dep) — shows `~tokens` + Copy descriptor with
  guidance to paste text instead of scans.
- HUD: third button `📎 Files·~N` (`#iko-hud-files`, badge updates via
  `renderBadge()`), opens `#iko-attachments-panel` (reuses optimizer modal CSS).
  Bundled via `main.js` import so present on all non-Claude sites; Claude HUD
  path (`claude-entry.js`) does NOT bundle it yet — add import there for parity.
- Logs under `[Attachments]` (detect/optimized). Limits: no OCR/vision
  description (dimensions-only), no in-place File replacement (browser blocks it —
  user re-attaches download), PDF text extraction deferred to pdf.js phase 2.

### 3.8 SIR v0.1 — canonical Machine Understanding Language (universal)

- File `src/migration/sir/sir.js` (UMD: `require` in Node, `window.IKOSIR` in
  browser; exposed to UI as `window.IKOSIRCore` via `migration-entry.js`).
  Zero deps except optional `gpt-tokenizer` for measurement (falls back to
  chars/4 in browser). No DOM, no platform ids — same output on all 9 LLMs.
- Spec: `@DOC id type pages title` / `@ENTITY k=v` / `@METRIC k=v` /
  `@REL a -> b -> c` / `@TABLE name` + `cols=a,b` + `a|b` rows /
  `@TURN id role` / `@SRC k->p` / `@CONF k=v` / `@IMAGE` + `REL:` lines.
  Aggressive image form `TXT:/OBJ:/SCN:/CLR:/CMP:/STY:/BG:/REL:`.
- Builders: `buildDoc/Entity/Metric/Rel/Table/Src/Conf` (esc: first-line,
  space-collapsed, 500ch cap; table cells `/`-escape pipes), `parseMarkdownTable`
  (header+delim detect), `textToSIR` (kv lines→entity, currency/keyword lines→
  metric), `imageToSIR(sem, aggressive)`, `sessionToSIR(session)` (doc header +
  per-turn `@TURN` with table→TABLE or kv-split + 300ch text tail; deterministic).
- Schema: `CONTENT_TYPES` gained `"sir"` (backwards compatible) for future
  `content:{type:"sir"}` blocks; current export serializes whole session to
  `.sir.txt` (review `↓ .sir` button) rather than inline blocks.
- Measurement: `countTokens` (gpt-tokenizer→token.count→chars/4),
  `compareReps({name:text})` sorted ascending. Proven in tests: compact TABLE <
  raw markdown, aggressive < verbose image, kv < pretty JSON — measured, never assumed.
- Tests `sir.test.js` (7): determinism, table round-trip, kv extract, image
  aggressive wins, JSON-vs-kv ranking, session convert shorter than JSON.
  Run: `npm test` (18 total: 11 migration + 7 sir).
- Limits: P0 only — no OCR/VLM (image semantics passed in by caller), no PDF
  parser yet, no query-adaptive retrieval (session converts whole, L4 next),
  no embeddings. Next: P1 PDF text-native + Tesseract, P2 classifier+retrieval.

### 3.9 P1 PDF text-native layer (universal, dependency-free)

- File `src/migration/sir/pdf.js` (UMD like SIR; exposed as `window.IKOPDFCore`
  via `migration-entry.js`). Never OCRs text-native PDFs; flags scanned for the
  OCR phase instead of returning garbage.
- `detectPdfKind(buf)`: scans raw source for `/Type /Page`, text-showing ops
  (`Tj`/`TJ`), `/Subtype /Image`, font refs → `text-native|scanned|mixed|unknown`
  + counts + page count. No rendering, no deps.
- `extractTextNative(buf, 200k cap)`: decodes `(literal)` (escapes, octal) and
  `<hex>` strings inside `BT..ET` (global-scan fallback for bare writers);
  returns `{text, pages, kind, needsOcr, truncated}`. Scanned → `{text:""}`.
- `pdfToSIR(buf, meta, SIR)`: L1 `{kind,pages,chars,needsOcr}`; text route →
  L2 `{chars,preview}` + L3 (`@DOC` + kv + TABLE-or-tail via SIR module);
  scanned route → `{route:"ocr-required", l3:null}` with guidance message.
  Deterministic; cap 200k chars.
- Attachment panel: PDFs gained `Parse → SIR` (reads `file.arrayBuffer()`,
  routes via `IKOPDFCore`+`IKOSIRCore`, copies SIR to clipboard, label shows
  `text-native Np · SIR copied (~a→b tokens)` or `scanned → needs OCR` +
  descriptor copy). Text path never touches DOM or platform code — universal.
- Tests `pdf.test.js` (4, synthetic latin1 PDFs): kind detect, native extract +
  scanned flag, SIR routing + token sanity, determinism. `npm test` = 22 total.
- Limits: WinAnsi literal/hex only (no CMap/ToUnicode — complex encodings route
  to OCR honestly); table detection reuses markdown parser (native PDF tables
  without pipes stay prose tail). Next: P1b Tesseract OCR for `ocr-required`,
  P2 query classifier + L4 minimal-IR retrieval.

### 3.10 P1b OCR adapter (universal, engine-optional)

- File `src/migration/sir/ocr.js` (UMD; exposed as `window.IKOOCRCore`).
  Heavy engines stay OPTIONAL peers — never bundled, dist stays lean.
- `preprocessImageData`: luminance grayscale + 1.25× contrast + 2× nearest upscale
  to RGBA; deterministic (same pixels → same output); helps any downstream OCR.
- `recognize(src, {lang, timeoutMs})`: peer (`window.IKOOCR.peer.recognize`) →
  `window.Tesseract.recognize` → else `{route:"ocr-engine-missing", guidance}`.
  Normalizes to `{route: ocr-text|ocr-empty|ocr-failed|ocr-engine-missing,
  text≤20k, confidence 0–1, engine}`; empty/whitespace → `ocr-empty`, never fake text.
- `scannedToSIR(src, meta, SIR)`: OCR text → `@DOC + kv + @CONF ocr engine` via SIR
  module; non-text routes pass through with `l3:null`.
- Attachments panel: images gained `OCR` (peer/Tesseract → SIR copy + conf label);
  PDFs gained `OCR` next to `Parse → SIR` (blob → peer/VLM; scanned raster needs
  screenshot or localhost until pdf.js render lands). Missing engine shows setup
  guidance; raw bytes never sent.
- Tests `ocr.test.js` (5, synthetic ImageData): preprocess determinism/gray/alpha,
  no-engine honesty, peer plug-in + confidence norm, SIR+CONF wrap, empty→ocr-empty.
  `npm test` = 27 total (11 migration + 7 sir + 4 pdf + 5 ocr).
- Limits: no deskew (stub 0), no bundled Tesseract/traineddata (CSP/size), no PDF
  page raster (needs pdf.js render). Feeds P2 (OCR text flows into same index).

### 3.11 P2 retrieval — QASC-lite minimal context (universal, no embeddings yet)

- File `src/migration/sir/retrieval.js` (UMD; exposed as `window.IKORETRIEVALCore`
  via `migration-entry.js`). Same interface the future vector phase will implement,
  so callers don't change. No DOM, no platform ids.
- `classifyQuery`: task verbs outrank topic keywords (test-pinned:
  "summarize financials"→summarize/section, "revenue grow"→metric/fact).
  Levels: fact topK 3–5 (lookup-id/entity/metric), section 6–10
  (summarize/compare/debug/plan/enumerate), none→full (safe fallback).
- Units: one per message + one per markdown table row (dense facts retrievable
  without the whole turn). `scoreUnit`: token overlap ×2 + exact-word +1 +
  number/code +3 + row +0.5; deterministic tie-break by document order.
- `retrieve(session, query, {topK, countTokens})`: positive hits up to k (fallback
  first 3 turns when all score 0), doc-order restore; returns `{intent, level,
  hits[{id,parentId,role,score,kind}], messageIds, tokensFull/Min, savedPct}`.
- `formatMinimal`: `@QUERY / @DOC intent saved% / @HIT id role + text≤1200`.
- Migration panel: `🎯 Minimal context` details (query input + Retrieve/Full +
  preview with intent + full→min tokens + %). Open applies retrieval filter
  BEFORE picker exclusions; destination-change clears it (forces re-Prepare).
  Pending-bar insert unaffected (no query there — full chunks as before).
- Tests `retrieval.test.js` (6): level routing, id/metric hits with savings cap,
  empty→full, determinism + `@HIT` contains fact, mock-session savings.
  `npm test` = 33 total (11+7+4+5+6).
- Limits: lexical only (paraphrase misses — "CEO" won't match "chief executive");
  table rows need pipes; static topK per intent (no token-budget solver yet).
  Next: P3 embeddings (local MiniLM) behind same `retrieve()` signature +
  token-budget packing.

### 3.12 Logging + diagnostics (`iko-log.js`)

- Ring buffer 500 `{time,level,tag,message,data(safe,8k)}`, console passthrough,
  `iko-log-updated` event. API: `info/warn/error`, `getLogs/formatAll`,
  `diagnostics()` (`url,title,UA,readyState,legacy/turn/article/msgId counts,
  logCount`), `copyAll()` (diagnostics+logs to clipboard).
- Engine logs stages; extractors log selector counts, fingerprints, fallback lens;
  composer scans logged; optimizer logs in/out lens. Panel has live `<pre>`
  (last 6k) + Copy button. Convention: `window.IKO.logger.info("Tag", msg, data)`.

## 4. Upgrades changelog (why each exists)

1. Multi-selector ChatGPT (legacy→turn-testid→message-id→article) — ChatGPT
   renamed DOM 2025–26; single selector returned 0.
2. Logger + View logs/Copy — invisible failures; now pasteable diagnostics.
3. Pending-bar destination-only fix (`!==`→`===` current) — bar showed on source.
4. Claude ProseMirror insert (execCommand+beforeinput) — textContent alone ignored.
5. Fallback alternating (ChatGPT) — zero-selectors still migratable.
6. Fingerprint logging — identify new markup from user logs.
7. Leaf-only fallback — outermost kept whole `<main>` as 1 block; leaves split turns.
8. Toolbar role signal — alternating mislabels; copy/citation→assistant.
9. Destination `<select>` + engine rebuild + forced re-Prepare — hardcoded pairs.
10. Dark select fix (`color-scheme:dark`, option bg) — white-on-white dropdown.
11. Universal registry (`platforms.js` 9 LLMs) + universal adapters — per-site ifs.
12. Manifest/background/detector expansion — new hosts blocked.
13. ChatGPT MAIN bridge + mapping parse + direct API fetch — DOM unparseable
    app-shell (`data-app-shell-*`, 0 articles); API immune.
14. Claude bridge broadening + deep text + DOM fallback — shell-but-empty bridge.
15. Gemini shadow-DOM composer (`deepQueryAll`, rich-textarea, Ask fallback).
16. HUD platform dynamic + budgets/prices — hardcoded ChatGPT/200k.
17. Unified bot dock (`#iko-bot` + in-HUD actions, legacy launchers removed).
18. Cost meter (`cost, health ≥80/95`) in HUD status.
19. Session library (save/load/delete, 20, persisted).
20. Message picker (checkbox `_excluded` applied on Open) + branch note.
21. Chunked insert (7500, Part i/N) for composer limits.
22. Export .md/.json via blob.
23. Prompt optimizer (local intent→structured + modal + HUD button).
24. Attachment Token Saver (file watcher, OpenAI tile estimate, canvas 1024px/q0.72
    compress + download + descriptor copy, HUD 📎 badge + panel; PDFs metadata-only).
25. Draggable IKO bot (Pointer drag anywhere, click-vs-drag threshold, viewport
    clamp, position persisted to localStorage + chrome.storage, restored on load).
    Fix: window-level pointermove/up (fast drags outside pill still track),
    corrected vertical axis (mouse-down shrinks bottom edge), mouse fallback.
    Fix 2 (root cause): `#iko-bot` CSS used `right/bottom !important`, which beats
    JS inline styles — bot could never move. Removed `!important` from right/bottom,
    switched drag to left/top positioning with legacy-shape migration, added
    mouse+touch fallback paths and `.iko-dragging` visual.
26. SIR P0 universal (sir.js UMD + sir.test.js 7 tests + schema "sir" type +
    review ↓ .sir export + npm test 18 total). Deterministic @DOC/@ENTITY/@METRIC/
    @REL/@TABLE/@TURN/@SRC/@CONF + aggressive TXT:/OBJ: image form; measured wins
    (TABLE<markdown, aggressive<verbose, kv<JSON) via gpt-tokenizer compareReps.
27. P1 PDF text-native layer (pdf.js UMD + pdf.test.js 4 tests, npm test 22 total;
    exposed IKOPDFCore; attachments Parse → SIR button with token delta label).
    Heuristic kind detect (text ops vs Image XObjects), BT..ET literal/hex decode,
    scanned→ocr-required route (never garbage), text→SIR L3 via SIR module.
28. P1b OCR adapter (ocr.js UMD + ocr.test.js 5 tests, npm test 27 total; exposed
    IKOOCRCore; attachments OCR buttons for images + scanned PDFs). Deterministic
    preprocess, peer/Tesseract probe, honest routes (never fake text), scanned→SIR
    with @CONF. Engines stay optional peers; dist lean.
29. P2 retrieval QASC-lite (retrieval.js UMD + retrieval.test.js 6 tests, npm test
    33 total; exposed IKORETRIEVALCore; 🎯 panel with Retrieve/Full + token-savings
    preview; Open filters to messageIds before picker exclusions). Lexical
    intent→level + overlap scoring, empty→full fallback; vectors plug in later
    behind the same signature.
30. Universal parity: Claude bundles attachments saver (📎 Files everywhere) +
    per-model Opus/Sonnet/Haiku budget/price/cost/health in HUD (was 0%/no cost).
31. Draggable HUD card (header handle, pinned spot survives re-pin interval) +
    bot/HUD watchdog resurrection + `#iko-bot`/`#iko-context-hud` CSS `!important`
    root-cause fixes (stylesheet !important beats JS inline — drag could never apply).
    Fix 2: same trap on `#iko-context-hud` (`right/bottom/left/top !important`) —
    cursor changed (handle wired) but card frozen. Removed `!important` from the
    five position props, added `.iko-dragging` no-transition style.
32. Copilot/subdomain injection fix: generic `content_scripts` entry lacked `*.`
    wildcards (gemini/copilot/grok/x/deepseek/mistral subdomains never injected —
    no HUD, no migrate). Added all wildcards + `m365.cloud.microsoft` to manifest
    (matches + host_permissions), `platforms.js` copilot hosts, `background.js`
    SOURCE_HOSTS. Rule: every host in host_permissions needs a matching match
    pattern, or scripts silently never run.
33. ChatGPT bridge shape-2 + endpoint fix + init-dedupe (from live-log diagnosis):
    `parseBridgeData` now accepts metadata+`messages[]/turns[]` lists (the live
    `/conversations/<id>` endpoint has no `mapping`), logs ALL payload keys,
    direct fetch tries plural `/conversations/` before legacy singular (was 404);
    `migration-main` init guarded against double-start (was double polling/logs).
34. Claude extractor failure fix (your screenshot): MAIN bridge replays cached
    payloads on `REQUEST_REFRESH` (the 10s wait could never resolve before);
    9-shape `parseBridgeMessages`, `detectRole`/`extractTextDeep` pure helpers
    (5 Node tests in `claude.test.js`), structured-DOM + leaf-DOM passes,
    `/new` empty-chat-specific error. `npm test` = 38 total (11+7+4+5+6+5).
35. Full-history migration (`core/full-history.js`): walks the message scroll
    container to the top, waits for lazy batches, nudges pinned-scrollTop
    sites, restores scroll position, 45s cap. Wired into the ChatGPT, Claude
    and universal source adapters; "fuller wins" when API/bridge vs DOM (tie →
    structured API). Destination insert now APPENDS all parts in ONE click
    (with retry-from-part-N state) so a multi-part session lands as a single
    coherent message; `maxChars` 7500→12000. `test:fullhistory` (7 tests);
    `npm test` = 50.
36. Minimal redesign + pending-bar/counting fixes: migration panel gets section
    cards, animated chevron `details`, dashed empty library state, mini-card
    library rows and SVG icon buttons; HUD drops neon/glyph style for SVG
    icons, a flat dark card, slate dot `#94a3b8` and a thin neutral bar. The
    pending bar's × now sends `IKO_CLEAR_MIGRATION` before `remove()` (the poll
    was re-adding it). `setLoading(true)` moved inside the `try` so
    `setLoading(false)` + `counting=false` always run in `finally`
    (`main.js` / `claude-main.js`).
37. Gemini HUD: `extractMessages()` returns `[]` on the `/app` homepage (0
    context instead of a bogus count); usage shows `<1%` when tokens > 0 but
    the rounded percentage is 0.
38. ROOT CAUSE of the persistent "Counting context…" row: the author rule
    `#iko-context-hud .iko-hud-loading { display: flex }` OUTRANKS the
    user-agent `[hidden] { display: none }` rule, so `loadingElement.hidden =
    true` never actually hid the row — the JS `finally` was correct all along.
    Fixed with `.iko-hud-loading[hidden] { display: none !important }`.
    Verified in headless Brave: `hidden`+`display:flex` → `flex`;
    `hidden`+`[hidden]!important` → `none`. Added an 8s safety timer in
    `ui.js:setLoading(true)` and `window.IKO.resetCounting()` as a backstop.
39. "Extension context invalidated" when clicking "Open destination": reloading
    the extension leaves already-open tabs with a dead content script
    (`chrome.runtime.id` undefined), so messaging throws. `migration-main` now
    checks `isExtensionContextAlive()` first; if dead it stashes the prepared
    package in `sessionStorage` (per-tab), refreshes the page, and
    `resumeHandoff()` opens the destination once the link is live — the normal
    "IKO migration ready — Insert session context" bar then appears. The
    pending poll skips when the link is dead; `showError` maps stale-link
    errors to a friendly "refresh to reconnect" message.
40. Retro-arcade redesign of all four surfaces (committed `f741e76`): one shared
    `--iko-*` token block duplicated in `style.css` + `migration.css` so each
    injected sheet stays self-contained; thick black outlines, hard offset
    shadows, square corners, heavy condensed display type, flat retro palette.
    Semantic button colours (Migrate=yellow, Optimize=lime, Files=white,
    destination=pink) and hierarchical shadows (modal 8px, cards 5px, buttons
    5px, HUD buttons 3px). Gate check: no soft/blurred shadows, no gradients.
41. Export-row overflow (your screenshot — `.md/.json/.sir/Save` labels spilling
    out of their buttons): `.iko-logs-copy { height: 30px }` plus inline
    `svg`+`span` content and NO flex on the button means the inline content
    WRAPS, so the second line overflows the fixed height. Fix:
    `.iko-migration-button` is now `display:inline-flex; align-items:center;
    justify-content:center; gap:8px; white-space:nowrap` and `.iko-logs-copy` is
    32px with `line-height:1`. The icons are also bolder now (15px,
    `stroke-width:3`, square caps, miter joins, chunky download-arrow +
    bookmark paths) so they match the arcade outlines.
42. Moon/sun dark mode (`src/content/theme.js`, new): singleton bundled into
    BOTH content bundles (guard = `window.IKOTheme`), owning the theme. It
    mirrors the effective theme onto `<html data-iko-theme="light|dark">`, which
    is what the stylesheets key off. Preference order: explicit choice (mirrored
    into `localStorage` for a flash-free synchronous boot, plus
    `chrome.storage.local` so it follows the user across sites) →
    `prefers-color-scheme`. Dark mode flips `--iko-ink` (borders + hard shadows
    + focus rings) and swaps the semantic text/surface/field tokens; the bright
    accents stay saturated and keep black text. The ink is a WARM "printed
    paper" cream (`#f0e2bd`) over warm-black surfaces, not pure white — white
    at 3px outlines + hard shadows measured 17.9:1 contrast and glared; the
    cream sits at ~14:1, still far above AA. Toggle buttons sit in all four
    headers — `.iko-header-actions` groups them with the close button, and the
    HUD uses the compact `.iko-theme-toggle-sm`. GOTCHA: `migration.css`
    declares its rules `!important` (host-page immunity) and BOTH sheets are
    injected together, so a non-`!important` override in `style.css` can NEVER
    win — the compact variant must be `!important` too (same reason the
    `--iko-*` tokens are duplicated rather than layered).
43. Invisible text on accent fills (your screenshot: HUD "Migrate"/"Optimize"
    unreadable in dark mode). Root cause: those rules only swapped in an accent
    BACKGROUND, so the label kept inheriting the theme text colour — and in dark
    mode that is cream, giving cream-on-yellow at contrast 1.2. The accents are
    the same value in both themes, but the text tokens are not, so **any rule
    that paints an accent background must PIN `color: var(--iko-black)`**.
    Fixed in 5 places: `#iko-hud-migrate`, `#iko-hud-optimize`,
    `.iko-optimizer-mode.active`,
    `.iko-migration-button.secondary:hover:not(:disabled)` (sky hover!) and
    `#iko-pending-migration button:last-child` (pink) — the last three were
    found by the new guards, not reported. Guards so it cannot come back:
    (a) a rendered WCAG-AA contrast gate over every IKO element with text, both
    themes; (b) a forced-`:hover` pass (`CSS.forcePseudoState` on every IKO
    button) re-running the same measurement, because the resting render never
    reaches hover fills. The verify suites now READ the palette out of
    `style.css` instead of hardcoding hexes, so colour changes are re-checked
    automatically rather than silently drifting.
44. Destination picker (your screenshot: the AI dropdown opening as a stock
    white list with an OS-blue highlight). That popup is drawn by the BROWSER,
    not by us — `<select>` options only accept a couple of colour properties and
    the highlight ignores CSS entirely, so it can never match the theme on every
    platform. Replaced with a real listbox (`createDropdown` in
    `migration-ui.js`): `.iko-dd-trigger` + portalled `.iko-dd-menu`, full
    keyboard support (arrows/Home/End/Enter/Escape, `aria-activedescendant`),
    click-outside close, and a check mark on the current option. The native
    `<select>` STAYS in the DOM as `.iko-dd-native`, visually hidden, so the
    existing `change` listener and any `.value` reads keep working untouched.
    GOTCHAS: (a) the dialog card is `overflow: hidden` AND is a containing block
    for fixed descendants (it animates `transform`), so the open menu is
    portalled to the overlay — `overflow: visible` — and is `position: fixed`
    so the placement maths is plain viewport coordinates; (b) `scrollHeight`
    measures the padding box while `max-height` clamps the border box, so the
    borders must be added back or a 2px outline eats 4px and forces a scrollbar;
    (c) the menu must be clamped INTO the viewport (roomier side + top/bottom
    clamp), otherwise a short window can flip it off-screen. Verified by suite 2
    opening it at 1200/800/600/460/360/300px tall. Escape in the open menu stops
    propagation so it closes the LIST, not the whole panel.
45. Context HUD counted the wrong thing (report: "stuck on Context 64, usage
    <1%, bar not filling"). Three separate faults, all reproduced in a headless
    harness that runs the REAL `dist/content.js` against synthetic conversation
    DOMs (`iko-hud-repro.html` + `iko-hud-probe.mjs`, one case per platform):
    (a) the HUD kept its own ChatGPT-only selector list, so every other platform
        (Gemini `message-content`/`.query-content`, Perplexity
        `[data-testid='answer']`, DeepSeek `.message-content`, …) fell into a
        text-block heuristic that ignored blocks under 120 chars — i.e. most
        user turns — and happily reported a tiny constant number;
    (b) on ChatGPT the list matched BOTH the turn wrapper and the message body,
        and only identical NEIGHBOURS were de-duplicated, so every message was
        counted twice: 2x tokens, 28 "messages" for a 14-message chat;
    (c) budgets/prices lived in a second inline table in `main.js`.
    Fix: new shared reader `src/migration/core/chat-thread.js` (platform
    selectors from platforms.js, innermost-match pruning, `readText` that falls
    back to a DOM walk when Chrome reports empty innerText for unlaid-out
    subtrees, whole-thread estimate with partial-read detection), budgets/prices
    from `matchPlatform()`, and an FNV-1a signature so an unchanged thread is
    not re-tokenised every 2s. Measured in the harness: ChatGPT 2002 → 1001
    tokens (28 → 14 messages, both exactly matching ground truth), Gemini
    472 → 1001, and a renamed-DOM case that used to read 13 tokens now reads the
    whole thread (1001). Locked in by 11 node tests
    (`npm run test:chatthread`) plus the harness suite; the button/popup suites
    are untouched by it.
46. Context HUD showed "0 / 0% / Waiting for messages" on a real ChatGPT chat
    (user screenshot) — the counting fix above had four traps that all end in a
    hard 0, because the fallback container was rejected after being mis-chosen:
    (a) the thread walk measured `textContent`, so a huge inline
        `<script type="application/json">` state blob out-texted the
        conversation; the walk (and `readText`/`textLength`) now skip
        SCRIPT/STYLE/NOSCRIPT/TEMPLATE, even as the walk's root;
    (b) the walk had no stop condition, so a thread whose LAST answer holds
        ≥70% of the text got walked into that one message, which then failed
        the "≥2 blocks" guard → 0. It now stops as soon as a level already
        splits into ≥2 message-sized blocks (`looksLikeList`);
    (c) the "≥2 blocks" guard itself rejected legitimate one-paragraph threads;
        it now only applies when `<main>`/`<body>` itself is the container
        (i.e. no descent happened — the welcome-screen case);
    (d) `textOf` read only the `.markdown` body, so a wrapper whose markdown is
        empty (streaming placeholder, lazily filled turn) yielded "" and the
        message was dropped; it now falls back to the wrapper.
    Also: the HUD now reads the WHOLE conversation where the page publishes it
    (`extractConversationMessages` on the ChatGPT bridge payload → `max(dom,
    bridge, highWater)`), which is what "how full is my context before I
    migrate?" actually needs — the bridge payload includes turns the DOM no
    longer mounts. Verified in the harness with new cases: `dominant` (last
    answer ≈86% of the text), `single` (one single-paragraph message),
    `partial-nomain-script` (no `<main>`, 40 KB JSON blob, renamed markup),
    `chatgpt-bridge` (60-message payload vs 14 mounted turns → "Full
    conversation", 3300 vs 3330 ground truth) and `chatgpt-shrink` (6 turns
    unmounted → count stays 1001). 18 node tests + 12 harness cases.
47. Same report, second round: the HUD recovered from 0 but sat at 845 /
    "Thread estimate — no message markup" on a real ChatGPT chat. Root cause
    found by reading the bridge, not the page: `latestConversation` is
    overwritten by EVERY matching payload, and ChatGPT's sidebar chat-list calls
    `/backend-api/conversations?offset=…` — a chat LIST, not the conversation.
    So the whole-chat source was silently replaced by junk and the HUD fell back
    to the (correct but partial) DOM estimate. Fixes:
    (a) the bridge CLIENT (content world) validates each payload with
        `extractConversationMessages` and keeps the last one that parses in
        `latestValidConversation` (migration's `latestConversation` contract is
        untouched); the HUD prefers it;
    (b) when neither payload exists the HUD asks the page's own endpoint once
        (`/backend-api/conversations/<id>?num_turns=1000` → plain plural →
        classic singular, `credentials: include`, 60 s retry, never downgrades a
        bigger payload) — same route the migration adapter uses, so a ChatGPT
        chat now counts WHOLE even when the bridge never saw it or the page
        fetched before the injected script runs;
    (c) `debugReading()` + a once-per-conversation "weak read" log (selectors +
        counts, container tag#id.class, chars/blocks, bridge state) so the next
        unreadable site can be fixed from Copy logs instead of screenshots.
    (d) a new or emptied chat never inherits the previous chat's bridge count:
        the bridge client validates each payload with `extractConversationMessages`
        and keeps only parses that belong to the current `/c/<id>` (its
        `conversation_id` must match the pathname), and the HUD treats a
        conversation-id mismatch as "no conversation yet". Stale sidebar /
        chat-list payloads can no longer freeze a number onto a fresh chat.
    (e) a brand-new / empty chat (no selectors matched, thread text under
        THREAD_MIN_CHARS ≈ 400 chars) is NOT counted as a conversation — a
        welcome/hero screen ("Where should we begin?" + feature tiles) now
        returns "none" → 0 tokens / "Waiting for messages" instead of a stale
        or welcome-screen number. Real conversations easily exceed 400 chars,
        so they're still counted via the thread estimate.
    Harness: new `chatgpt-directapi` case (stubbed endpoint, 60 msgs vs 14
    mounted → "Full conversation", 3270 vs 3300 truth, exactly 1 fetch) — 13
    cases / 54 assertions, 19 node tests.
48. "It should collect/display tokens while I enter a prompt and the AI answers,
    and update per chat without refreshing on ALL AI websites" (report after
    `5873267`). Two gaps, both in `main.js`:
    (a) per-chat invalidation was ChatGPT-only — `lastSignature` was reset only
        when `conversationId()` (the ChatGPT `/c/<id>` regex) changed, so on
        Claude/Gemini/DeepSeek/… the HUD could keep the previous chat's number
        (or its high-water mark) until a reload. `update()` now drops every piece
        of per-chat state (`lastSignature`, `highWater`, bridge cache, endpoint
        attempt, weak-read dedupe) whenever `conversationKey()`
        (hostname+pathname) changes — every platform in the registry uses
        path-based conversation URLs, so this covers them all.
    (b) the HUD only moved on the 2 s heartbeat, so a submitted prompt, a
        streaming answer or an SPA chat switch felt stale. `watchPage()` now
        observes the page (`childList + characterData`, mutations under the HUD
        itself ignored) and `scheduleUpdate()` throttle-reads at most once per
        700 ms while changes keep arriving (leading+trailing, so a stream that
        never pauses still updates); `watchUrl()` (300 ms) reacts to SPA
        navigation at once; visibilitychange refreshes on tab focus. The 2 s
        heartbeat stays as the always-there fallback.
    (c) Claude was not covered by either fix: claude.ai runs its own bundle
        (`claude-content.js`), which only read `claudeBridge.latestConversation`
        — and the injected bridge caches the previous chat's conversation and
        REPLAYS it on every REQUEST_REFRESH, so switching chats kept the old
        number until a reload. `claude-main.js` now (1) accepts a bridge payload
        only when it names the open chat (`/chat/<uuid>` vs the payload's
        `uuid`/fetched URL — the client now keeps the URL too), (2) counts the
        live DOM through the same shared reader as main.js
        (`extractChatThread("claude")` + the chars/4 local estimate) and takes
        `max(dom, bridge, highWater)`, and (3) shares the observer/throttle/
        URL-watcher live-update trio.
    Live re-counts also stopped strobing "Counting context…": the loader row is
    now shown only while no count is on screen yet.
    Harness: 8 new probe cases (22 total, 98 assertions): `chatgpt-stream`
    (the answer appends in chunks; HUD read 1094 mid-stream between 1001 →
    1435), `chatgpt-switch` + `gemini-switch` + `claude-switch` (SPA pushState
    to a smaller chat → re-count without a reload), `chatgpt-switchempty`
    (switch to a new chat → 0 / "Waiting for messages" without a reload),
    `claude`/`claude-stream` (Claude DOM + live mid-stream 1224 → 1344 → 1787)
    and `claude-stalecache` (a cached previous-chat payload on `/new` must read
    0 / "Waiting for Claude messages"). 74 node tests unchanged.

49. Same report, migration side: Prepare on a real ChatGPT chat threw "No
    visible ChatGPT messages were found" + a fingerprint whose `<main>` was
    pure app shell (`nodes=133 textLen=68`, only `data-app-shell-*`/
    `data-composer-*` attributes — every message attribute renamed). Three
    fixes in `chatgpt-source-adapter.js`, all sharing code the HUD already
    trusts:
    (a) the direct API fetch now mirrors the HUD: asks
        `/backend-api/conversations/<id>?num_turns=1000` first (the plain
        endpoint can paginate, which made Prepare fall through to a DOM it
        could not read), then the plain plural, then the legacy singular path;
    (b) the bridge payload is refused when it names a different conversation
        (the bridge can still hold the previous chat — same guard as the HUD),
        and a successful fetch updates `latestValidConversation`/`latestValidMessages`
        so the HUD and the next Prepare need no network;
    (c) when both the selector pass and the leaf-block pass find nothing the
        adapter calls the shared reader (`extractChatThread("chatgpt")`) — the
        exact code the HUD counts with — so renamed markup, shadow roots and
        innerText-empty trees still produce a migratable thread
        (`raw.strategy = thread-reader:<source>` + a "verify roles in preview"
        warn).
    When even the reader finds nothing, the thrown fingerprint now also reports
    `bodyLen=` and a `reader: <source>/<reason>` line (e.g.
    `reader: none/thread-too-small(68)`) so the next Copy logs paste names the
    reason. New suite `chatgpt-source-adapter.test.js` (4 tests: app shell +
    renamed markup migrates via the reader; empty shell reports the reader
    reason; valid bridge payload preferred; foreign payload refused).
    `npm test` now 78.

50. "Fix the manifest file so it can be unpacked on Firefox." Two changes, no
    code:
    (a) `background` declares BOTH `service_worker` (Chrome; Chrome ≥121 ignores
        `scripts`, earlier Chrome refuses it) and `scripts` (Firefox MV3 event
        page — Firefox still ignores `service_worker`, checked on 157);
    (b) `browser_specific_settings.gecko`: id
        (`iko-context-hud@manaspatekar.github.io`), `strict_min_version: 128.0`
        (`content_scripts.world: "MAIN"` landed in FF 128; the MAIN-world
        bridges touch no extension APIs, so they are safe there) and
        `data_collection_permissions {required: ["none"]}` (required for new AMO
        submissions since Nov 2025; ignored by older Firefox).
    Verified: `web-ext lint` → 0 errors (13 warnings: the expected
    cross-browser service-worker notice, `data_collection_permissions` vs
    min-version ×2, and 10 pre-existing innerHTML code notices); real Firefox
    157 (snap) installed it as a temporary add-on via `web-ext run`; a
    throwaway headless Brave loaded it with the extension service worker up and
    no load errors. README gained a Firefox install section.

51. "Fix IKO Context HUD — Stale Context, Incorrect Usage & Live Input Tracking."
    Root causes and fixes in `src/content/main.js` (ChatGPT) and
    `src/content/claude-main.js` (Claude):
    (a) Context stuck after switching chats — `watchUrl()` already polled
        `location.href` every 300 ms and `update()` reset per-chat state on
        host+path change, but SPA navigation via `history.pushState` /
        `replaceState` / `popstate` was invisible to the HUD. Added
        `interceptNavigation()` that wraps those APIs and fires `scheduleUpdate(100)`,
        plus `setupComposerWatcher()` re-wired from `watchUrl()` on every URL
        change so composer input listeners survive React replacing the composer.
        Conversation key = `hostname + pathname`; every change drops
        `lastSignature`, `highWater`, bridge cache, endpoint attempt AND draft
        state, so a previous chat's number can never leak into the new one.
    (b) No update while typing — the HUD previously only counted mounted DOM
        messages, never the unsent draft. Added composer reading via the shared
        `IKOComposer.findComposer()` (textarea, contenteditable, ProseMirror,
        rich-textarea, shadow DOM) with `readDraftText()`, `draftTokenCount()`
        (deduplicated against the last conversation message to avoid double
        counting), `draftOverlapsConversation()`, and a 200 ms debounced
        `scheduleDraftUpdate()` driven by `input`/`change`/`keyup`/`paste`
        listeners plus a composer MutationObserver.
    (c) Stale / incorrect calculation — the HUD now reports three distinct
        figures: conversation context, unsent draft tokens, and projected total
        (conversation + draft). Draft that duplicates the last message is not
        double-counted. Usage % and projected usage are always recalculated from
        the same token result — no stale percentage. Tokenizer is labeled
        `o200k_base` (OpenAI-compatible, local) for ChatGPT and `Local estimate`
        (chars/4) for Claude; no fabricated accuracy.
    (d) Resilient lifecycle — `initialize()` now calls `interceptNavigation()`
        and `setupComposerWatcher()`; both are re-invoked on URL change. The
        2 s / 2.5 s heartbeat remains as the fallback for unobserved mutations.
    (e) Cross-component stale state — draft state is invalidated on every
        conversation switch; bridge payloads are still validated against the open
        conversation id; newer calculation results always overwrite older ones
        via the signature cache (`sig === lastSignature` short-circuit).
    `npm test` still 78/78 (now 79 with the new regression suite). `dist/` rebuilt.

52. "No visible ChatGPT messages were found" on real app-shell DOMs
    (`chat-thread.js` shared reader). The reader returned `thread-too-small`
    immediately when `<main>` held little text (ChatGPT's 2026 app shell makes
    `<main>` pure chrome while the thread lives outside it), never reaching
    `deepScanContainer()`. Fix: when no selectors matched and the container is
    small but `<body>` holds substantially more text (>3× the container and ≥
    400 chars), skip the thread estimate and deep-scan the whole page without
    assuming any markup attributes. Welcome screens are still rejected: when no
    selectors matched and the container has < 400 chars, a single hero block
    (blockCount < 2) is not counted as a conversation. New regression suite
    `chatgpt-source-adapter.test.js` covers: app shell + renamed markup via the
    reader, empty shell reporting the reader reason, conversation outside `<main>`
    found by deep-scan, valid bridge payload preferred, foreign payload refused.

## 5. Build / test / run

```bash
npm install
node build.js        # or npm run build → dist/{content,claude-content,claude-bridge,chatgpt-bridge,migration}.js + css
npm test             # 78 tests: migration + chat-thread + chatgpt-adapter + fullhistory + sir/pdf/ocr/retrieval/claude/composer (run it, don't trust the count)
npm run test:chatthread   # the Context HUD counting rules only
```

UI verification harness (outside the repo, in `$HOME`) — computed-style checks in
headless Brave over CDP, because the four surfaces can't be eyeballed from a
screenshot in CI:
```bash
node iko-serve.cjs &                         # serves the real modules over http
node iko-verify2.mjs 9222 file://…/iko-ui-preview.html   # mock surfaces, light + dark
node iko-verify-real.mjs 9222 http://127.0.0.1:8731/preview.html  # real ui.js/migration-ui/optimizer-ui/attachment-saver
node iko-verify-os-theme.mjs 9222 http://127.0.0.1:8731/preview.html  # preference order
node iko-shot-zoom.mjs 9222 http://127.0.0.1:8731/preview.html        # zoomed clips, both themes
node iko-shot-dropdown.mjs 9222 http://127.0.0.1:8731/preview.html     # destination list, OPEN
node iko-shot-dropdown-full.mjs 9222 http://127.0.0.1:8731/preview.html  # rebuilt 9-platform list
node iko-eval.mjs 9222 <url> '<js expression>'                         # one-off probe
node iko-hud-probe.mjs 9222                                           # Context HUD count vs ground truth, per platform DOM
```
The HUD probe is the only way to test token counting without a logged-in site:
`iko-serve.cjs` also serves the built bundles (there is a `dist → repo/dist`
symlink in `$HOME`), `iko-hud-repro.html` builds a synthetic conversation for a
chosen DOM shape plus noise chrome and loads the REAL `dist/content.js`, and the
probe compares the HUD's number against `countTokens()` of the same text in
Node. Cases (22, 98 assertions): `chatgpt`, `gemini`, `perplexity`, `deepseek`,
`generic` (article markup), `partial` (renamed markup → thread estimate),
`chatgpt-grow` (must increase when 4 more turns arrive), `dominant` (the last
answer holds ~86% of the text), `single` (one single-paragraph message),
`chatgpt-bridge` (whole-conversation payload exceeds the mounted DOM →
"Full conversation"), `chatgpt-directapi` (no payload at all — the HUD asks the
conversation endpoint itself, exactly once), `chatgpt-shrink` (6 turns unmounted
→ count must not roll back), `partial-nomain-script` (no `<main>` + 40 KB inline
JSON blob — the shape that read 0 in the wild), `chatgpt-stream` (text appends
chunk by chunk: the HUD must move mid-stream, before the answer ends),
`chatgpt-switch`/`gemini-switch` (SPA `pushState` + swapped thread: re-count
without a reload, including DOWN to a smaller chat), `chatgpt-switchempty`
(switch to a brand-new chat → 0 / "Waiting for messages").
Claude has its own bundle: `claude`, `claude-stream` and `claude-switch` load
`dist/claude-content.js` (the test Brave is launched with
`--host-resolver-rules="MAP claude.ai 127.0.0.1"` so the page runs as
`http://claude.ai:8731/…`), and `claude-stalecache` proves a cached
previous-chat bridge payload on `/new` cannot show its tokens.
The dropdown shots exist because the native `<select>` popup never appears in a
CDP screenshot — the themed list is real DOM, so it CAN be reviewed as an image.
Never drive the user's real Brave (`--load-extension`); use a separate profile dir.
Load: `chrome://extensions` → Developer → Load unpacked → folder with
`manifest.json`. Open **fresh** LLM tab (old tabs → `Extension context invalidated`).
Firefox (128+): `about:debugging#/runtime/this-firefox` → Load Temporary Add-on →
`manifest.json`; MV3 host permissions are opt-in there (about:addons → Permissions).
Verified: web-ext lint 0 errors + real Firefox 157 temp install + headless Brave load.
Debug: page `F12 → filter [IKO]`, `View logs → Copy logs`,
`chrome://extensions → Service worker` console.
`dist/` is gitignored build output — never edit; edit `src/` + rebuild.
`sourcemap:false`; set true temporarily to map `dist`→`src` in DevTools.

## 6. How to extend (rules for new models)

- New LLM: add 6-line entry to `platforms.js` (hosts/newUrl/budget/price/
  selectors/composers). Universal adapters + manifest/background/detector read it.
  If selectors unknown, leave generic — leaf fallback works day one, then add exact
  from user `Copy logs` fingerprint.
- New bridge: copy `chatgpt-bridge.js` (30 lines), change URL matcher + source
  string, add client (copy `chatgpt-bridge-client.js`), build entry in `build.js`,
  MAIN entry in `manifest.json`, parse in source adapter (prefer API → DOM).
- New HUD metric: compute in `main.js/claude-main.js:update()`, pass in
  `latestData`, render in `ui.js:update()`. Keep the `counting` mutex and the
  change signature so an unchanged thread is not re-tokenised every tick.
- Reading a conversation from the DOM: call `extractChatThread()` from
  `src/migration/core/chat-thread.js`. Platform selectors live in
  `platforms.js` ONLY — when a feature needs a selector list, extend the
  registry (or `UNIVERSAL_SELECTORS` in `chat-thread.js`), never inline a copy:
  three copies of the same list is exactly why the HUD read only ChatGPT.
- New migration step: add to `migration-state.js` stages + `engine.run()`
  between validate/package; log via `IKO.logger`; cover in `migration.test.js`.
- New modal feature: extend `migration-ui.js` with `details` section +
  callbacks via `options.onX` wired in `migration-main.js` (load-order safe).
- New theme-aware surface: use the semantic tokens (`--iko-ink` for outlines and
  hard shadows, `--iko-text`/`--iko-text-muted` for text on a surface,
  `--iko-surface`/`--iko-surface-muted` for backgrounds, `--iko-field` for
  inputs and tracks). Keep literal `var(--iko-black)` ONLY for text sitting on a
  bright accent fill — those stay black in both themes. Add new dark values to
  BOTH `:root[data-iko-theme="dark"]` blocks.
- Never: hardcode host/selector outside `platforms.js`, use `window.open()`,
  `postMessage("*")` without source check relaxation, or edit `dist/`.

## 7. Known limitations / debt

- `claude-token.js/claude-tokens.js/token.js/content-analyzer.js/constants.js`
  are dead duplicates — delete after confirming no import.
- Token counts are local estimates (Claude chars/4, others o200k). Add localhost
  `count_tokens` proxy or per-model limit API for exact server-side counts.
- The HUD counts only what is IN the DOM (plus, on ChatGPT and Claude, the
  bridge payload when the page has fetched it and it belongs to the open chat):
  history a site has unmounted (virtualised) is invisible to a passive reader,
  so very long chats can under-report. The per-conversation high-water mark
  keeps the number from going backwards, but it cannot invent turns it never
  saw. Migration sidesteps this by scrolling with `loadAllHistory()`; doing that
  from the HUD would fight the user, so it stays passive. The other platforms
  have no bridge payload; their DOM reading is all the HUD can see.
- Bridge conversation parsing exists twice: `chatgpt-source-adapter.js`
  (`parseBridgeData`, rich migration shape with ids/timestamps/parents) and
  `chat-thread.js` (`extractConversationMessages`, minimal `{role, content}` for
  counting — also used by the bridge client to validate payloads). Unify when the
  adapter is next touched — the mapping walk and role filter are the same logic.
- The whole-conversation endpoint list (`/backend-api/conversations/<id>?num_turns=1000`
  → plain plural → `/…/conversation/<id>`) is inferred from observed traffic, not
  documented by ChatGPT; the HUD and the migration adapter now try the same list.
  The fetch logs say which path answered (or that all failed), so it can be
  corrected from a user's Copy logs.
- `m365.cloud.microsoft` (Copilot) and `x.com` (Grok) are in `manifest.json` but
  not in `platforms.js:hosts` — no registry selectors/budget there, so the HUD
  falls back to a hostname label and 200k/2.0 defaults.
- `universal-source-adapter.js` still carries its own copy of the selector list
  and a block fallback. It could read `chat-thread.js` instead; left untouched so
  migration behaviour stays frozen (its selector list is already platform-aware).
- ChatGPT `REQUEST_REFRESH` still no-op on bridge side; relies on natural fetch + direct API.
- `integrity.js` canonical subset vs schema drift — keep aligned.
- Fallback roles positional when toolbar signal absent — verify in preview.
- `checkPendingMigration` 1.5s poll — replace with `storage.onChanged` for
  battery. The HUDs no longer depend on their heartbeat alone (both `main.js`
  and `claude-main.js` read on a throttled MutationObserver + URL watcher), but
  the 2 s / 2.5 s heartbeat stays as the fallback for unobserved mutations.
- `postMessage("*")` + broad selectors — tighten origin + validate payload shape.
- No e2e on real DOM; only Node unit tests + the `$HOME` CDP style harness
  (real modules, but synthetic host page). Add Playwright fixtures per LLM.
- Accessibility/i18n minimal; settings page absent (budgets hardcoded + override
  via `IKO.config` only).

## 8. Roadmap (suggested order)

1. Per-model budget/price auto-detect from bridge `model_slug` (exact $).
2. History sparkline (`storage.session` 10s samples) + growth alert.
3. Reply-compare (same prompt → 2 tabs → diff view).
4. Auto-continuity templates per optimizer intent on migrated insert.
5. Settings page (budget, position, theme, debug) + shortcuts (`Ctrl+Shift+M/K`).
6. `MutationObserver` + event-driven refresh (done for both HUDs in entry 48;
   remaining: `checkPendingMigration` → `storage.onChanged`); Firefox
   `browser.*` shim.
7. Server-optional exact counters (Anthropic/Gemini) with local fallback label.
8. Onboarding coach marks; export PDF; onboarding → fewer support pastes.
