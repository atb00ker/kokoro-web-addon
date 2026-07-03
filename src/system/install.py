"""Install native messaging host manifests for browsers."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from system.config import (
    CHROME_EXTENSION_ID,
    FIREFOX_EXTENSION_ID,
    HOST_NAME,
)

BrowserKind = Literal["firefox", "chromium"]

SUPPORTED_BROWSER_IDS: tuple[str, ...] = (
    "firefox",
    "chrome",
    "chromium",
    "edge",
    "brave",
)


@dataclass(frozen=True)
class BrowserTarget:
    label: str
    manifest_dir: Path | None
    windows_registry_base: str | None


@dataclass(frozen=True)
class BrowserSpec:
    id: str
    label: str
    kind: BrowserKind
    linux_manifest_parts: tuple[str, ...]
    darwin_manifest_parts: tuple[str, ...]
    windows_registry_base: str
    linux_detect_home: tuple[tuple[str, ...], ...] = ()
    linux_detect_config: tuple[tuple[str, ...], ...] = ()
    darwin_detect_home: tuple[tuple[str, ...], ...] = ()
    darwin_detect_apps: tuple[str, ...] = ()
    windows_detect_local: tuple[tuple[str, ...], ...] = ()
    windows_detect_roaming: tuple[tuple[str, ...], ...] = ()


_BROWSER_SPECS: tuple[BrowserSpec, ...] = (
    BrowserSpec(
        id="firefox",
        label="Firefox",
        kind="firefox",
        linux_manifest_parts=(".mozilla", "native-messaging-hosts"),
        darwin_manifest_parts=(
            "Library",
            "Application Support",
            "Mozilla",
            "NativeMessagingHosts",
        ),
        windows_registry_base=r"Software\Mozilla\NativeMessagingHosts",
        linux_detect_home=((".mozilla", "firefox"),),
        darwin_detect_home=(("Library", "Application Support", "Firefox"),),
        darwin_detect_apps=("/Applications/Firefox.app",),
        windows_detect_roaming=(("Mozilla", "Firefox"),),
    ),
    BrowserSpec(
        id="chrome",
        label="Chrome",
        kind="chromium",
        linux_manifest_parts=("google-chrome", "NativeMessagingHosts"),
        darwin_manifest_parts=(
            "Library",
            "Application Support",
            "Google",
            "Chrome",
            "NativeMessagingHosts",
        ),
        windows_registry_base=r"Software\Google\Chrome\NativeMessagingHosts",
        linux_detect_config=(("google-chrome",),),
        darwin_detect_home=(
            ("Library", "Application Support", "Google", "Chrome"),
        ),
        darwin_detect_apps=("/Applications/Google Chrome.app",),
        windows_detect_local=(("Google", "Chrome", "User Data"),),
    ),
    BrowserSpec(
        id="chromium",
        label="Chromium",
        kind="chromium",
        linux_manifest_parts=("chromium", "NativeMessagingHosts"),
        darwin_manifest_parts=(
            "Library",
            "Application Support",
            "Chromium",
            "NativeMessagingHosts",
        ),
        windows_registry_base=r"Software\Chromium\NativeMessagingHosts",
        linux_detect_config=(("chromium",),),
        darwin_detect_home=(("Library", "Application Support", "Chromium"),),
        darwin_detect_apps=("/Applications/Chromium.app",),
        windows_detect_local=(("Chromium", "User Data"),),
    ),
    BrowserSpec(
        id="edge",
        label="Edge",
        kind="chromium",
        linux_manifest_parts=("microsoft-edge", "NativeMessagingHosts"),
        darwin_manifest_parts=(
            "Library",
            "Application Support",
            "Microsoft Edge",
            "NativeMessagingHosts",
        ),
        windows_registry_base=r"Software\Microsoft\Edge\NativeMessagingHosts",
        linux_detect_config=(("microsoft-edge",),),
        darwin_detect_home=(
            ("Library", "Application Support", "Microsoft Edge"),
        ),
        darwin_detect_apps=("/Applications/Microsoft Edge.app",),
        windows_detect_local=(("Microsoft", "Edge", "User Data"),),
    ),
    BrowserSpec(
        id="brave",
        label="Brave",
        kind="chromium",
        linux_manifest_parts=(
            "BraveSoftware",
            "Brave-Browser",
            "NativeMessagingHosts",
        ),
        darwin_manifest_parts=(
            "Library",
            "Application Support",
            "BraveSoftware",
            "Brave-Browser",
            "NativeMessagingHosts",
        ),
        windows_registry_base=(
            r"Software\BraveSoftware\Brave-Browser\NativeMessagingHosts"
        ),
        linux_detect_config=(("BraveSoftware", "Brave-Browser"),),
        darwin_detect_home=(
            (
                "Library",
                "Application Support",
                "BraveSoftware",
                "Brave-Browser",
            ),
        ),
        darwin_detect_apps=("/Applications/Brave Browser.app",),
        windows_detect_local=(("BraveSoftware", "Brave-Browser", "User Data"),),
    ),
)

_BROWSER_SPECS_BY_ID = {spec.id: spec for spec in _BROWSER_SPECS}

FIREFOX_WINDOWS_REGISTRY_BASE = r"Software\Mozilla\NativeMessagingHosts"


def all_browser_specs() -> list[BrowserSpec]:
    return list(_BROWSER_SPECS)


def host_script_path() -> str:
    if os.name == "nt":
        return str(Path(sys.executable).with_name("kokoro-web-host.exe"))
    path = shutil.which("kokoro-web-host")
    if not path:
        raise SystemExit(
            "kokoro-web-host not found on PATH. "
            + "Install with: pip install kokoro-web"
        )
    return path


def browser_manifest_dir(spec: BrowserSpec) -> Path | None:
    if os.name == "nt":
        return None

    home = Path.home()
    if sys.platform == "darwin":
        return home.joinpath(*spec.darwin_manifest_parts)

    if spec.linux_detect_home and not spec.linux_detect_config:
        return home.joinpath(*spec.linux_manifest_parts)

    config_home = Path(os.environ.get("XDG_CONFIG_HOME", home / ".config"))
    return config_home.joinpath(*spec.linux_manifest_parts)


def browser_target(spec: BrowserSpec) -> BrowserTarget:
    return BrowserTarget(
        label=spec.label,
        manifest_dir=browser_manifest_dir(spec),
        windows_registry_base=spec.windows_registry_base,
    )


def browser_detect_paths(spec: BrowserSpec) -> list[Path]:
    home = Path.home()
    paths: list[Path] = []

    if os.name == "nt":
        localappdata = Path(
            os.environ.get("LOCALAPPDATA", home / "AppData" / "Local")
        )
        appdata = Path(os.environ.get("APPDATA", home / "AppData" / "Roaming"))
        for parts in spec.windows_detect_local:
            paths.append(localappdata.joinpath(*parts))
        for parts in spec.windows_detect_roaming:
            paths.append(appdata.joinpath(*parts))
        return paths

    if sys.platform == "darwin":
        for parts in spec.darwin_detect_home:
            paths.append(home.joinpath(*parts))
        paths.extend(Path(app_path) for app_path in spec.darwin_detect_apps)
        return paths

    config_home = Path(os.environ.get("XDG_CONFIG_HOME", home / ".config"))
    for parts in spec.linux_detect_home:
        paths.append(home.joinpath(*parts))
    for parts in spec.linux_detect_config:
        paths.append(config_home.joinpath(*parts))
    return paths


def browser_is_installed(spec: BrowserSpec) -> bool:
    return any(path.exists() for path in browser_detect_paths(spec))


@dataclass(frozen=True)
class SetupOptions:
    browsers: tuple[str, ...] = ()
    install_all: bool = False


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="kokoro-web-setup",
        description="Register Kokoro Web native messaging hosts for browsers.",
    )
    parser.add_argument(
        "browsers",
        nargs="*",
        metavar="browser",
        help=(
            "Browser to register (firefox, chrome, chromium, edge, brave). "
            "If omitted, only installed browsers are registered."
        ),
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Register all supported browsers.",
    )
    return parser


def normalize_setup_argv(argv: list[str]) -> list[str]:
    if len(argv) == 1 and argv[0] == "[]":
        return []
    return [token for token in argv if token != "[]"]


def parse_setup_args(argv: list[str]) -> SetupOptions:
    argv = normalize_setup_argv(argv)
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    for browser_id in args.browsers:
        if browser_id not in _BROWSER_SPECS_BY_ID:
            supported = ", ".join(SUPPORTED_BROWSER_IDS)
            parser.error(
                f"invalid browser: {browser_id!r} (choose from {supported})"
            )
    if args.all and args.browsers:
        parser.error("--all cannot be combined with explicit browser names.")
    return SetupOptions(
        browsers=tuple(args.browsers),
        install_all=args.all,
    )


def resolve_browsers(options: SetupOptions) -> list[BrowserSpec]:
    if options.install_all:
        return all_browser_specs()

    if options.browsers:
        seen: set[str] = set()
        selected: list[BrowserSpec] = []
        for browser_id in options.browsers:
            if browser_id in seen:
                continue
            seen.add(browser_id)
            selected.append(_BROWSER_SPECS_BY_ID[browser_id])
        return selected

    installed = [
        spec for spec in all_browser_specs() if browser_is_installed(spec)
    ]
    if not installed:
        raise SystemExit(
            (
                "No supported browsers detected.\n"
                "Install a browser or run: kokoro-web-setup firefox\n"
                "Or force a browser: kokoro-web-setup edge"
            )
        )
    return installed


def skipped_browser_labels(
    options: SetupOptions, selected: list[BrowserSpec]
) -> list[str]:
    if options.install_all or options.browsers:
        return []

    selected_ids = {spec.id for spec in selected}
    return [
        spec.label
        for spec in all_browser_specs()
        if spec.id not in selected_ids
    ]


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")


def firefox_manifest(host_path: str) -> dict:
    return {
        "name": HOST_NAME,
        "description": "Native messaging host for Kokoro Web browser extension",
        "path": host_path,
        "type": "stdio",
        "allowed_extensions": [FIREFOX_EXTENSION_ID],
    }


def chrome_manifest(host_path: str) -> dict:
    return {
        "name": HOST_NAME,
        "description": "Native messaging host for Kokoro Web browser extension",
        "path": host_path,
        "type": "stdio",
        "allowed_origins": [f"chrome-extension://{CHROME_EXTENSION_ID}/"],
    }


def install_windows_registry(manifest_path: Path, registry_base: str) -> None:
    import winreg

    key_path = f"{registry_base}\\{HOST_NAME}"
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, str(manifest_path))


def install_windows(host_path: str, selected: list[BrowserSpec]) -> list[str]:
    package_dir = Path(__file__).resolve().parent
    installed: list[str] = []

    needs_firefox = any(spec.kind == "firefox" for spec in selected)
    needs_chromium = any(spec.kind == "chromium" for spec in selected)

    if needs_firefox:
        firefox_manifest_path = package_dir / "firefox_host.json"
        write_json(firefox_manifest_path, firefox_manifest(host_path))

    if needs_chromium:
        chrome_manifest_path = package_dir / "chrome_host.json"
        write_json(chrome_manifest_path, chrome_manifest(host_path))

    for spec in selected:
        if spec.kind == "firefox":
            manifest_path = package_dir / "firefox_host.json"
            install_windows_registry(manifest_path, spec.windows_registry_base)
            installed.append(
                f"{spec.label}: HKCU\\{spec.windows_registry_base}\\{HOST_NAME}"
            )
            continue

        manifest_path = package_dir / "chrome_host.json"
        install_windows_registry(manifest_path, spec.windows_registry_base)
        installed.append(
            f"{spec.label}: HKCU\\{spec.windows_registry_base}\\{HOST_NAME}"
        )

    return installed


def install_file_based(
    host_path: str, selected: list[BrowserSpec]
) -> list[str]:
    installed: list[str] = []

    for spec in selected:
        target = browser_target(spec)
        assert target.manifest_dir is not None
        manifest_path = target.manifest_dir / f"{HOST_NAME}.json"
        payload = (
            firefox_manifest(host_path)
            if spec.kind == "firefox"
            else chrome_manifest(host_path)
        )
        write_json(manifest_path, payload)
        installed.append(f"{spec.label}: {manifest_path}")

    return installed


def main() -> None:
    options = parse_setup_args(sys.argv[1:])
    selected = resolve_browsers(options)
    host_path = host_script_path()

    print("Kokoro Web bridge setup")
    print(f"  Host: {host_path}")

    if os.name == "nt":
        locations = install_windows(host_path, selected)
    else:
        locations = install_file_based(host_path, selected)

    for line in locations:
        print(f"  {line}")

    skipped = skipped_browser_labels(options, selected)
    if skipped:
        print(f"  Skipped (not detected): {', '.join(skipped)}")

    print("\nRestart your browser, then open Kokoro Web.")


if __name__ == "__main__":
    main()
