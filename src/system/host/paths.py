"""Kokoro binary and model directory discovery."""

from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

from system.host.state import DEFAULT_CONFIG, KOKORO_CANDIDATE_NAMES, state


def common_kokoro_bin_paths() -> list[Path]:
    """Well-known install locations per OS (not user-specific project paths)."""
    home = Path.home()
    if os.name == "nt":
        localappdata = os.environ.get(
            "LOCALAPPDATA", str(home / "AppData" / "Local")
        )
        appdata = os.environ.get("APPDATA", str(home / "AppData" / "Roaming"))
        return [
            Path(localappdata)
            / "Programs"
            / "Python"
            / "Python312"
            / "Scripts"
            / "kokoro-tts.exe",
            Path(localappdata)
            / "Programs"
            / "Python"
            / "Python311"
            / "Scripts"
            / "kokoro-tts.exe",
            Path(appdata)
            / "Python"
            / "Python312"
            / "Scripts"
            / "kokoro-tts.exe",
            Path(appdata)
            / "Python"
            / "Python311"
            / "Scripts"
            / "kokoro-tts.exe",
        ]
    if sys.platform == "darwin":
        return [
            home / ".local" / "bin" / "kokoro-tts",
            Path("/opt/homebrew/bin/kokoro-tts"),
            Path("/usr/local/bin/kokoro-tts"),
        ]
    return [
        home / ".local" / "bin" / "kokoro-tts",
        Path("/usr/local/bin/kokoro-tts"),
    ]


def common_model_dir_paths() -> list[Path]:
    """Default model directory documented for kokoro-tts installs."""
    return [Path.home() / ".kokoro"]


def find_model_files(model_dir: Path) -> tuple[Path, Path]:
    """Return (onnx_path, bin_path) — newest by mtime in each extension."""
    if not model_dir.is_dir():
        raise RuntimeError(f"Model directory does not exist: {model_dir}")

    onnx_files = sorted(
        model_dir.glob("*.onnx"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    bin_files = sorted(
        model_dir.glob("*.bin"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )

    if not onnx_files:
        raise RuntimeError(f"No .onnx model file found in {model_dir}")
    if not bin_files:
        raise RuntimeError(f"No .bin voices file found in {model_dir}")

    return onnx_files[0], bin_files[0]


def model_dir_is_valid(model_dir: Path) -> bool:
    try:
        find_model_files(model_dir)
    except RuntimeError:
        return False
    return True


def detect_kokoro_candidates() -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()

    def add(path: str | None) -> None:
        if not path:
            return
        resolved = os.path.realpath(os.path.expanduser(path))
        if resolved in seen:
            return
        if os.path.isfile(resolved) and os.access(resolved, os.X_OK):
            seen.add(resolved)
            candidates.append(resolved)

    configured = state.config.get("kokoroPath", "kokoro-tts")
    expanded = os.path.expanduser(configured)
    if os.path.sep in expanded or expanded.startswith("."):
        add(expanded)
    else:
        add(shutil.which(configured))

    for name in KOKORO_CANDIDATE_NAMES:
        add(shutil.which(name))

    for path in common_kokoro_bin_paths():
        add(str(path))

    return candidates


def detect_model_dir_candidates(kokoro_path: str | None = None) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()

    def add(path: Path) -> None:
        expanded = path.expanduser()
        try:
            resolved = str(expanded.resolve())
        except OSError:
            resolved = str(expanded)
        if resolved in seen:
            return
        if model_dir_is_valid(expanded):
            seen.add(resolved)
            candidates.append(resolved)

    configured = Path(
        os.path.expanduser(
            state.config.get("modelDir", DEFAULT_CONFIG["modelDir"])
        )
    )
    add(configured)

    for path in common_model_dir_paths():
        add(path)

    if kokoro_path:
        binary = Path(kokoro_path)
        add(binary.parent)
        add(binary.parent.parent)

    return candidates


def validate_model_dir(model_dir: str) -> None:
    find_model_files(Path(model_dir))


def resolve_kokoro_path() -> str:
    candidates = detect_kokoro_candidates()
    if candidates:
        return candidates[0]

    configured = state.config.get("kokoroPath", "kokoro-tts")
    raise RuntimeError(
        f"kokoro-tts not found (configured as '{configured}'). "
        + "Install kokoro-tts or set the binary path in extension settings."
    )


def resolve_model_dir(kokoro_path: str | None = None) -> str:
    candidates = detect_model_dir_candidates(kokoro_path)
    if candidates:
        return candidates[0]

    configured = state.config.get("modelDir", DEFAULT_CONFIG["modelDir"])
    validate_model_dir(os.path.expanduser(configured))
    return os.path.expanduser(configured)
