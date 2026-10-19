# IKO Context HUD — Global Build 0.2.0

IKO is a Chrome & Firefox MV3 extension for the IKO Context HUD and ChatGPT ↔ Claude session migration. The same folder (with `manifest.json`, `background.js` and `dist/`) loads in both browsers.

## Global installation

1. Extract the ZIP.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the extracted `claude-counter-main` folder — the folder containing `manifest.json` and `background.js`.
6. Open a **new** ChatGPT or Claude tab after installation.

No Node.js, npm, localhost server, API key, or backend is required for migration.

## Firefox installation

Requires Firefox 128 or newer. No store needed for testing:

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and select `manifest.json`.
3. Firefox treats MV3 host permissions as opt-in: if the HUD does not appear on a
   site, open `about:addons` → **IKO Context HUD** → **Permissions** and grant
   access to that site.

Temporary add-ons disappear when Firefox closes. For a permanent install, package
the folder (e.g. `npx web-ext build`) and install the generated `.xpi`.

## Migration

- ChatGPT → Claude
- Claude → ChatGPT
- The migration package is stored by the MV3 service worker before the destination tab is opened.
- Destination pages retrieve the package through the service worker.
- The implementation avoids `window.open()` so browser pop-up blocking does not break migration.
- Stale extension contexts are caught instead of producing an uncaught `Extension context invalidated` exception.

## Account access

IKO only reads conversations that the currently logged-in ChatGPT or Claude account can access. It cannot bypass platform permissions.

## Token HUD

ChatGPT token counting remains local. Claude's public/global build uses a local estimate so the extension does not require a personal Anthropic API key or a localhost backend.

The estimate is intentionally labeled as an estimate rather than claiming to be Anthropic's exact server-side count.

## Development build

If you want to rebuild the extension from source:

```bash
npm install
npm run build
```

The ready-to-load `dist/` files are already included in the release ZIP, so normal users do not need to run these commands.
