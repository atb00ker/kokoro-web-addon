"""Extension identity and native host configuration.

Default IDs match src/scripts/extension-identity.ts (canonical for Node/WXT).
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

_REPO_ROOT = Path(__file__).resolve().parents[2]
_ENV = _REPO_ROOT / ".env"
_EXAMPLE = _REPO_ROOT / ".env.example"

if _ENV.exists():
    load_dotenv(_ENV)
elif _EXAMPLE.exists():
    load_dotenv(_EXAMPLE)

HOST_NAME = os.environ.get("KOKORO_HOST_NAME", "com.kokoro.web")
FIREFOX_EXTENSION_ID = os.environ.get(
    "FIREFOX_EXTENSION_ID", "kokoro-web@atb00ker"
)
CHROME_EXTENSION_ID = os.environ.get(
    "CHROME_EXTENSION_ID", "pkfapjbdbhkoohckjmlbloocjnlfmklk"
)
