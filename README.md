# IKO Extension for Your AI

IKO is a Chrome extension that estimates conversation context and helps move chats between supported AI platforms.

**Repository:** [Dhanraj2526/IKO-Extension-dhanu](https://github.com/Dhanraj2526/IKO-Extension-dhanu)

## Features

- Context HUD with token and estimated usage readings.
- Reading-source labels and explanations, so you can tell when a count comes from conversation data, visible messages, or a page-text estimate.
- Adjustable context warning threshold (50%, 60%, 70%, or 80%).
- Movable HUD and IKO launcher button; their positions are saved locally.
- Session migration between ChatGPT and Claude, with a prepared conversation preview before opening the destination.
- Local token estimates; no IKO server or personal API key is required for the HUD.

## Install in Chrome

1. Download or clone this repository and extract it if you downloaded a ZIP.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the project folder that contains `manifest.json` and `background.js`.
6. Open or refresh a supported AI chat tab.

To apply changes after rebuilding, return to `chrome://extensions`, click **Reload** on IKO, then refresh the AI chat tab.

## Supported platforms

The context HUD supports ChatGPT, Claude, Gemini, Perplexity, Copilot, Grok, DeepSeek, Mistral, and Poe. The completeness of a reading depends on what each site exposes; IKO labels estimates when it cannot read full conversation data.

Session migration currently supports:

- ChatGPT → Claude
- Claude → ChatGPT

## Build from source

Node.js and npm are only needed to rebuild the extension:

```bash
npm install
npm run build
```

The generated extension files are written to `dist/`. Load the project folder containing `manifest.json` in Chrome.

## Privacy and access

IKO reads the chat page and, where available, the site's own conversation response to estimate context or prepare a migration. It can only access conversations available to the account currently signed in to that platform. It does not bypass platform access controls.
