# Developer guide

This document covers building and hacking on Kokoro Web from source. End-user install instructions are in [README.md](../README.md).

## Prerequisites

- **Python 3.11+** — native messaging host and setup CLI
- **uv** (recommended) or pip — Python dependency management
- **A JS package manager** — one of bun, deno, pnpm, or npm (bun is preferred if available)
- **kokoro-tts** — install and download model files as described in [README.md](../README.md#step-1--install-kokoro-tts-and-model-files)

## Project layout

```
src/
  extension/          # WXT browser extension (TypeScript)
  system/             # Python native messaging host and setup CLI
Makefile              # install, setup, build, dev, lint, format
wxt.config.ts         # Extension manifest and build config
pyproject.toml        # Python package metadata and tooling
```

The extension talks to the native host over browser native messaging. The host forwards synthesis requests to your local `kokoro-tts` binary.

## Getting started

Clone the repo, then run the one-shot setup target:

```bash
make setup
```

See [SETUP.md](SETUP.md) for `.env` and GitHub secrets configuration.

This installs JavaScript and Python dependencies and registers the native messaging host for detected browsers (`kokoro-web-setup`). Use `kokoro-web-setup edge` to force a browser, or `kokoro-web-setup --all` for every supported browser.

## Build and run locally

```bash
make build    # production build for Firefox and Chrome → .output/
make dev      # watch mode with hot reload (Firefox)
make zip      # store-ready zips for both browsers
```

| Command      | Firefox output                     | Chrome output                     |
| ------------ | ---------------------------------- | --------------------------------- |
| `make build` | `.output/firefox-mv2/`             | `.output/chrome-mv3/`             |
| `make zip`   | `.output/kokoro-web-*-firefox.zip` | `.output/kokoro-web-*-chrome.zip` |

### Firefox

1. Run `make setup` once if you have not already (registers the native host for Firefox and Chrome).
2. Open `about:debugging`
3. **This Firefox** → **Load Temporary Add-on…**
4. Select any file inside `.output/firefox-mv2/` (for example `manifest.json`)

### Chrome

1. Run `make setup` once if you have not already (registers the native host for Firefox and Chrome).
2. Open `chrome://extensions` and enable **Developer mode**
3. Click **Load unpacked** and select `.output/chrome-mv3/`

Restart the browser after setup. For Chrome dev with hot reload, use `bun run dev -- -b chrome` instead of `make dev`.

Open the extension popup and click **Test connection** to confirm the bridge is working.

## Makefile targets

| Target   | Description                                               |
| -------- | --------------------------------------------------------- |
| `setup`  | Install deps and register native messaging host           |
| `build`  | Production build for Firefox and Chrome                   |
| `dev`    | Development server with reload (Firefox)                  |
| `zip`    | Pack extension zips for both browsers                     |
| `lint`   | Format and lint JS + Python (incl. `tsc --noEmit`)        |
| `format` | Prettier (JS) and ruff format (Python), then JS typecheck |
| `clean`  | Remove build artifacts and generated host JSON            |

## Linting and formatting

```bash
make lint     # format + eslint + prettier check + tsc + ruff + basedpyright
make format   # auto-format + tsc (JS); ruff format (Python)
```

Python tooling targets `src/system/`. JavaScript tooling targets `src/` (Prettier, ESLint, and TypeScript via `tsc --noEmit` with `noUnusedLocals` / `noUnusedParameters` from [`tsconfig.json`](../tsconfig.json)).

## Publishing the Python bridge

The `kokoro-web` package (native host + setup CLI) is defined in `pyproject.toml`. Entry points:

- `kokoro-web-setup` — register native messaging manifests (auto-detect by default; pass browser names or `--all` to override)
- `kokoro-web-host` — host process invoked by the browser

## Releasing

Releases are **manual only**: you create a GitHub Release first, then run the [Publish workflow](../.github/workflows/publish.yml) with the tag. Publishing to PyPI and Firefox Add-ons is optional and controlled by repository variables plus per-target GitHub Environments. Chrome Web Store publish is deferred — leave `ENABLE_CHROME_PUBLISH` unset.

### One-time setup

See [SETUP.md](SETUP.md) for GitHub environments, secrets, `.env` configuration, and publish enable flags.

First-time store setup (AMO listing, PyPI trusted publisher) is documented in [`.local/FIRST-RELEASE.md`](../.local/FIRST-RELEASE.md).

### When do I need the store playbooks?

| Situation                                | Doc                                                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Routine `vX.Y.Z` tag + Publish workflow  | This section only — CI uploads to AMO                                                                             |
| First AMO listing                        | [`.local/FIRST-RELEASE.md`](../.local/FIRST-RELEASE.md) + [`.local/FIREFOX-ADDON.md`](../.local/FIREFOX-ADDON.md) |
| Refresh store description or screenshots | [`.local/FIREFOX-ADDON.md`](../.local/FIREFOX-ADDON.md) → listing metadata                                        |
| Add or change manifest permissions       | Store playbooks + update [PRIVACY.md](PRIVACY.md)                                                                 |

### Per-release steps

1. Bump `package.json` and `pyproject.toml` to the same version; commit and push `main`.
2. Create and push the git tag:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

3. Create the GitHub Release **without assets** — the workflow uploads them:

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes-file RELEASE_NOTES.md
```

4. Run the Publish workflow (only `atb00ker` can trigger it):

   - **GitHub UI:** **Actions** → **Publish** → **Run workflow** → branch `main` → enter tag `vX.Y.Z`
   - **CLI:**

```bash
gh workflow run publish.yml -f tag=vX.Y.Z
```

5. Approve environment deployments if your protection rules require it.
6. Verify seven assets on the release page (firefox zip, sources zip, chrome zip, stable firefox zip, stable chrome zip, wheel, sdist) and check the `publish-summary` job in Actions.

The workflow checks out the tag, lints, tests, builds, uploads GitHub Release assets, then runs enabled publish jobs. Each publish job reads credentials only from its environment.

## License

MIT — see [README.md](../README.md).
