# Privacy Policy — Kokoro Web

**Last updated:** July 4, 2026

Kokoro Web is an open-source browser extension maintained by [Ajay Tripathi](https://github.com/atb00ker/kokoro-web-addon). This policy explains what data the extension and its companion native host handle, and what we do **not** do.

**Summary:** We do not operate servers, accounts, analytics, or advertising. We do not collect, sell, or share your data with the developer or third parties. Text-to-speech runs entirely on your computer.

---

## What Kokoro Web does

Kokoro Web reads text aloud using [kokoro-tts](https://github.com/nazdridoy/kokoro-tts) installed on your machine. The browser extension cannot run local programs directly, so it uses **native messaging** to talk to a small local program (`kokoro-web-host`, installed via the `kokoro-web` Python package).

When you choose to read text (for example by clicking **Play**, using **Read with Kokoro** on a selection, or **Read page with Kokoro**):

1. The extension sends that text to the native host on **your computer only**.
2. The native host writes the text to a temporary file, runs your local `kokoro-tts` binary, and streams audio back to the extension.
3. Temporary files are deleted when synthesis finishes.

**Nothing in this flow is uploaded to the internet by Kokoro Web.** No cloud API, no developer backend, no telemetry.

---

## What we do not collect

Kokoro Web does **not**:

- Require an account or login
- Send data to the developer or any third-party service
- Run analytics, crash reporting, or advertising trackers
- Read page content unless you explicitly trigger read-aloud
- Store the text you read for later retrieval
- Access bookmarks, browsing history, passwords, or cookies

---

## What is stored locally

The extension saves **preferences only** using the browser’s `storage.sync` API:

- Voice, language, and speed settings
- Optional paths to your `kokoro-tts` binary and model directory
- An optional synthesis prefix string

If you use browser sync, these preferences may sync across your devices through **Firefox Sync** or **Chrome Sync** — that is handled by your browser vendor, not by us. Page text and audio are **not** synced.

Read-along text during a session is kept in extension memory so you can follow along; it is cleared when you stop or start new content.

The native host may persist your configured binary and model paths in a local config file on your machine (via `python-dotenv`). That file stays on your computer.

---

## Private browsing

Kokoro Web does not intentionally persist page content from private browsing windows. Text you choose to read may pass through extension memory and the native host’s temporary files during synthesis, then is discarded. Your voice/speed preferences may still be stored if browser sync is enabled — those are settings, not page content.

---

## Permissions and why they exist

Firefox and Chrome builds share most permissions. Chrome adds two extra permissions for audio playback and the read-along side panel. Firefox uses the built-in **sidebar** for read-along (declared in the manifest as `sidebar_action`, not a separate permission string).

### Shared (Firefox and Chrome)

| Permission | Purpose |
| ---------- | ------- |
| `nativeMessaging` | Communicate with the local `kokoro-web-host` on your machine |
| `activeTab` | Read visible page text when you ask to read the current page |
| `scripting` | Inject a one-shot script to extract readable page text on your command |
| `tabs` | Find the active tab; track windows for the read-along UI |
| `contextMenus` | Add “Read with Kokoro” / “Read page with Kokoro” to the right-click menu |
| `storage` | Save your voice, speed, and path preferences |
| `clipboardWrite` | Copy setup commands in the onboarding UI when you click Copy |

### Chrome only

| Permission | Purpose |
| ---------- | ------- |
| `offscreen` | Play audio in a background document (required by Chrome for reliable playback) |
| `sidePanel` | Show the read-along side panel |

### Firefox only (manifest, not permission strings)

| Manifest entry | Purpose |
| -------------- | ------- |
| `sidebar_action` | Read-along sidebar UI (WXT maps the side panel entrypoint to Firefox’s sidebar) |
| `data_collection_permissions` (Firefox 140+) | Declares that website content is handled when you initiate read-aloud — sent to your local native host only |

We do **not** request broad host permissions (`<all_urls>`), `cookies`, `webRequest`, `history`, or similar access on either browser.

---

## Third-party software you install separately

Kokoro Web is **not** the TTS engine. You must separately install:

- **[kokoro-tts](https://github.com/nazdridoy/kokoro-tts)** — runs inference locally using model files you download
- **`kokoro-web`** (Python package) — registers the native messaging host

Those projects have their own licenses and behavior. Kokoro Web does not send your text to the kokoro-tts authors or any remote service; synthesis runs as a local subprocess on your machine.

---

## Dependencies audit

We reviewed runtime dependencies to confirm nothing phones home:

**Browser extension (shipped build):** No npm runtime dependencies. The built extension is self-contained JavaScript bundled at build time.

**Native messaging host (`kokoro-web` Python package):** Depends on [`python-dotenv`](https://pypi.org/project/python-dotenv/) for reading local environment/config files only. No network calls.

**Build-time tools (not shipped to users):** WXT, TypeScript, ESLint, Prettier, and similar dev tools are used only when building the extension from source.

**No analytics SDKs** are included in any shipped artifact.

---

## Open source

Source code is available at [github.com/atb00ker/kokoro-web-addon](https://github.com/atb00ker/kokoro-web-addon) under the MIT License. You can inspect exactly what the extension and native host do.

---

## Chrome Web Store — Limited Use disclosure

Kokoro Web’s use of information received from Google APIs (including Chrome extension APIs that expose page or user content) adheres to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/), including the **Limited Use** requirements:

- We use user content (text you choose to read) **only** to provide text-to-speech on your local machine.
- We do **not** transfer user content to third parties except as necessary to provide that single purpose (local native messaging to your own `kokoro-tts` install — not to our servers or external services).
- We do **not** use user content for advertising, creditworthiness, or data brokerage.
- Humans working on this open-source project do not read your text; there is no remote access to it.

---

## Firefox Add-ons — data transmission

On Firefox 140 and later, the extension manifest declares that it handles **website content** when you initiate read-aloud — this is accurate. That content is transmitted only to your local native host for synthesis, not to the developer or the internet.

---

## Children

Kokoro Web is a general-purpose tool and is not directed at children under 13. We do not knowingly collect personal information from anyone.

---

## Changes

We may update this policy when the extension changes. The “Last updated” date at the top will change accordingly. Significant changes will be noted in release notes on GitHub.

---

## Contact

Questions or privacy concerns:

- Open an issue: [github.com/atb00ker/kokoro-web-addon/issues](https://github.com/atb00ker/kokoro-web-addon/issues)
- Repository: [github.com/atb00ker/kokoro-web-addon](https://github.com/atb00ker/kokoro-web-addon)
