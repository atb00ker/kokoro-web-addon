# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-07-05

### Changed

- Updated Node and Python dev dependencies

### Fixed

- Firefox Add-ons validation warnings (manifest icons, HTML `lang`/`viewport`, sidebar shortcut keys)

## [0.1.0] - 2026-07-04

First public release. Kokoro Web is a browser extension and native messaging bridge for [kokoro-tts](https://github.com/nazdridoy/kokoro-tts). Synthesis runs locally on your machine; nothing is sent to the cloud.

### Added

#### Browser extension

- Firefox (Manifest V2) and Chrome (Manifest V3) builds from a shared [WXT](https://wxt.dev/) codebase
- Popup — paste text, choose voice and speed, play / pause / stop
- Context menu — select text → **Read with Kokoro**
- **Read page with Kokoro** — extract and read the active page from the context menu or popup
- Read-along UI — Firefox sidebar and Chrome side panel with search and highlight while text is spoken
- Keyboard shortcut to toggle the read-along panel (configurable in browser extension settings)
- Settings page with voice, language, speed, and optional synthesis prefix
- Advanced paths — configure `kokoro-tts` binary and model directory when not on the default PATH or in `~/.kokoro`
- Onboarding flow with **Test connection** and copyable setup commands
- Offscreen document on Chrome for reliable audio playback

#### Python bridge (`kokoro-web` on PyPI)

- `kokoro-web-setup` — register the native messaging host for detected browsers (Firefox, Chrome, Chromium, Edge, Brave); per-browser targets and `--all` supported
- `kokoro-web-host` — native messaging host that forwards synthesis requests to your local `kokoro-tts` and streams audio back
- Shared host manifest ID `com.kokoro.web` for Firefox and Chromium-family browsers
- Linux, macOS, and Windows registration paths

#### Release and distribution

- GitHub Publish workflow — lint, test, build, and attach extension zips, source zip, wheel, and sdist
- Optional automated publish to PyPI, Firefox Add-ons (AMO), and Chrome Web Store via gated GitHub Environments
- Pinned Chrome extension ID via manifest key for stable native messaging after store install

#### Documentation

- End-user [README](README.md) with install and troubleshooting
- [Developer guide](docs/DEV.md), [setup guide](docs/SETUP.md), and [privacy policy](docs/PRIVACY.md)

[0.1.1]: https://github.com/atb00ker/kokoro-web-addon/releases/tag/v0.1.1
[0.1.0]: https://github.com/atb00ker/kokoro-web-addon/releases/tag/v0.1.0
