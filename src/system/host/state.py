"""Persistent host configuration and runtime state."""

from __future__ import annotations

import json
import os
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

CONFIG_DIR = Path.home() / ".config" / "kokoro-web"
CONFIG_FILE = CONFIG_DIR / "config.json"

DEFAULT_CONFIG = {
    "kokoroPath": "kokoro-tts",
    "modelDir": str(Path.home() / ".kokoro"),
}

KOKORO_CANDIDATE_NAMES = ("kokoro-tts", "kokoro-tts.exe")
# Extension scheduler caps parallel chunk synthesis; this pool is a backstop.
MAX_SYNTHESIS_WORKERS = 3


class HostState:
    def __init__(self) -> None:
        self.config = self.load_config()
        self.lock = threading.Lock()
        self.active_processes: dict[str, subprocess.Popen[bytes]] = {}
        self.cancelled_requests: set[str] = set()
        self.synthesis_executor = ThreadPoolExecutor(
            max_workers=MAX_SYNTHESIS_WORKERS,
            thread_name_prefix="kokoro-synthesis",
        )

    def load_config(self) -> dict[str, str]:
        if CONFIG_FILE.exists():
            try:
                with CONFIG_FILE.open(encoding="utf-8") as handle:
                    data = json.load(handle)
                if isinstance(data, dict):
                    merged = DEFAULT_CONFIG.copy()
                    merged.update(
                        {
                            k: str(v)
                            for k, v in data.items()
                            if k in DEFAULT_CONFIG
                        }
                    )
                    return merged
            except (OSError, json.JSONDecodeError):
                pass
        return DEFAULT_CONFIG.copy()

    def save_config(self) -> None:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        with CONFIG_FILE.open("w", encoding="utf-8") as handle:
            json.dump(self.config, handle, indent=2)

    def set_config(self, message: dict[str, Any]) -> None:
        if "kokoroPath" in message and message["kokoroPath"]:
            self.config["kokoroPath"] = str(message["kokoroPath"])
        if "modelDir" in message and message["modelDir"]:
            self.config["modelDir"] = os.path.expanduser(
                str(message["modelDir"])
            )
        self.save_config()


state = HostState()
