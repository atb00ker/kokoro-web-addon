"""Native messaging framing."""

from __future__ import annotations

import json
import struct
import sys
from typing import Any


def read_message() -> dict[str, Any] | None:
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None

    message_length = struct.unpack("<I", raw_length)[0]
    if message_length <= 0:
        return None

    payload = sys.stdin.buffer.read(message_length)
    if not payload:
        return None

    return json.loads(payload.decode("utf-8"))


def write_message(message: dict[str, Any]) -> None:
    encoded = json.dumps(message).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def send_error(request_id: str | None, message: str) -> None:
    payload: dict[str, Any] = {"type": "error", "message": message}
    if request_id:
        payload["requestId"] = request_id
    write_message(payload)
