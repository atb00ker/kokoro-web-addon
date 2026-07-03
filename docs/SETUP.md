# Repository setup

One-time configuration for maintainers who build releases or publish to stores. Day-to-day development is covered in [DEV.md](DEV.md).

## Which doc do I need?

| Goal | Read |
| ---- | ---- |
| Local `.env`, GitHub secrets, CI environments | This file ([SETUP.md](SETUP.md)) |
| Day-to-day dev, build, lint, per-release workflow | [DEV.md](DEV.md) |
| **First ever** release (v0.1.0): AMO, PyPI, CI | [`.local/FIRST-RELEASE.md`](../.local/FIRST-RELEASE.md) |
| **First AMO listing** — copy, screenshots, reviewer notes | [`.local/FIREFOX-ADDON.md`](../.local/FIREFOX-ADDON.md) |
| Update store description or screenshots | [`.local/FIREFOX-ADDON.md`](../.local/FIREFOX-ADDON.md) → listing metadata |
| Add manifest permission | Store playbooks (permissions + compliance) + update [PRIVACY.md](PRIVACY.md) |
| Privacy policy (users / stores) | [PRIVACY.md](PRIVACY.md) |
| Routine `vX.Y.Z` tag + workflow | [DEV.md#releasing](DEV.md#releasing) only |

Store playbooks live in `.local/` (gitignored). Routine version bumps do **not** need them — CI handles store uploads after the first listing.

---

## Local environment

1. Copy the environment template:

```bash
cp .env.example .env
```

2. Extension identity values in `.env.example` are pre-filled with public dev defaults — day-to-day development works without editing them. Override only if you use different extension IDs.

3. Fill in store publish credentials in `.env` only when running local `wxt submit` dry-runs. The file is gitignored — never commit it.

`make setup` copies `.env.example` → `.env` when `.env` is missing, then registers the native messaging host.

Python reads `.env` automatically via `src/system/config.py` (with the same public defaults for `pip install` users). Node/WXT loads `.env` via `dotenv` in `wxt.config.ts`, falling back to `src/scripts/extension-identity.ts` when vars are unset.

### Environment variables

| Variable               | Used by                         | Description                                                                                                           |
| ---------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `KOKORO_HOST_NAME`     | `wxt` build, `kokoro-web-setup` | Native messaging host name (e.g. `com.kokoro.web`). Must match `NATIVE_HOST_NAME` in `src/extension/lib/defaults.ts`. |
| `FIREFOX_EXTENSION_ID` | `wxt` build, AMO publish        | Firefox add-on ID (e.g. `name@author`).                                                                               |
| `CHROME_EXTENSION_ID`  | `kokoro-web-setup`, CWS publish | Chrome extension ID derived from `CHROME_MANIFEST_KEY`.                                                               |
| `CHROME_MANIFEST_KEY`  | `wxt` Chrome build              | Base64 public key that pins the Chrome extension ID.                                                                  |
| `FIREFOX_JWT_ISSUER`   | Local `wxt submit` dry-runs     | AMO API JWT issuer.                                                                                                   |
| `FIREFOX_JWT_SECRET`   | Local `wxt submit` dry-runs     | AMO API JWT secret.                                                                                                   |
| `CHROME_CLIENT_ID`     | Local `wxt submit` dry-runs     | Google OAuth client ID for Chrome Web Store API.                                                                      |
| `CHROME_CLIENT_SECRET` | Local `wxt submit` dry-runs     | Google OAuth client secret.                                                                                           |
| `CHROME_REFRESH_TOKEN` | Local `wxt submit` dry-runs     | OAuth refresh token for Chrome Web Store API.                                                                         |

Extension IDs and the Chrome manifest public key are public (they appear in manifests). Committed defaults live in `.env.example` and `src/scripts/extension-identity.ts`. Release CI overrides them from GitHub repository secrets.

---

## GitHub repository secrets

Under **Settings → Secrets and variables → Actions → Secrets**, add these **repository secrets**. The Publish workflow `build` job writes them to `.env` before linting, testing, and building.

| Secret                 | Description                |
| ---------------------- | -------------------------- |
| `KOKORO_HOST_NAME`     | Native messaging host name |
| `FIREFOX_EXTENSION_ID` | Firefox add-on ID          |
| `CHROME_EXTENSION_ID`  | Chrome extension ID        |
| `CHROME_MANIFEST_KEY`  | Chrome manifest public key |

---

## GitHub Environments

Create environments under **Settings → Environments** for each publish target you need: `PyPI`, `Firefox`. Chrome Web Store publish is deferred — skip the `Chromium` environment unless you enable CWS later.

### `PyPI`

| Secret           | Required | Description                                      |
| ---------------- | -------- | ------------------------------------------------ |
| `PYPI_API_TOKEN` | Optional | Only if not using PyPI trusted publishing (OIDC) |

Trusted publishing is recommended — see [`.local/FIRST-RELEASE.md`](../.local/FIRST-RELEASE.md#phase-3--pypi).

### `Firefox`

| Secret                 | Description                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `FIREFOX_JWT_ISSUER`   | JWT issuer from [AMO API keys](https://addons.mozilla.org/developers/addon/api/key/) |
| `FIREFOX_JWT_SECRET`   | JWT secret from the same page                                                        |
| `FIREFOX_EXTENSION_ID` | Same value as the repository secret                                                  |

Generate values locally with `npx wxt submit init` — copy from `.env.submit` into `.env` and GitHub. Do not commit `.env.submit`.

### `Chromium`

| Secret                 | Description                         |
| ---------------------- | ----------------------------------- |
| `CHROME_CLIENT_ID`     | OAuth client ID                     |
| `CHROME_CLIENT_SECRET` | OAuth client secret                 |
| `CHROME_REFRESH_TOKEN` | OAuth refresh token                 |
| `CHROME_EXTENSION_ID`  | Same value as the repository secret |

Set up credentials with [chrome-webstore-upload-keys](https://github.com/fregante/chrome-webstore-upload-keys) or `npx wxt submit init`. Only needed when you decide to publish on CWS — see [`.local/CHROME-ADDON.md`](../.local/CHROME-ADDON.md).

---

## Repository variables

Under **Settings → Secrets and variables → Actions → Variables**, set each publish job flag to `true` when you are ready to enable that target:

| Variable                 | Purpose                       |
| ------------------------ | ----------------------------- |
| `ENABLE_PYPI_PUBLISH`    | Run the `publish-pypi` job    |
| `ENABLE_FIREFOX_PUBLISH` | Run the `publish-firefox` job |
| `ENABLE_CHROME_PUBLISH`  | Run the `publish-chrome` job  |

Publish jobs do not run unless the matching variable is explicitly `true`.

---

## Optional protection rules

On each environment you can add:

- **Required reviewers** — deployments need approval before secrets are used
- **Deployment branches / tags** — restrict to tags matching `v*`

---

## First release

After completing the steps above, follow [`.local/FIRST-RELEASE.md`](../.local/FIRST-RELEASE.md) for the full v0.1.0 walkthrough (manual AMO upload, optional PyPI, Firefox CI dry-runs).

Per-release workflow (tag, GitHub Release, run Actions) is in [DEV.md#releasing](DEV.md#releasing).
