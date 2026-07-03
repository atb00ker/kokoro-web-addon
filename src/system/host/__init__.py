"""Native messaging host bridging the Kokoro browser extension to kokoro-tts."""

from __future__ import annotations

from typing import Any

from system.host.paths import (
    detect_kokoro_candidates,
    detect_model_dir_candidates,
    resolve_kokoro_path,
    resolve_model_dir,
    validate_model_dir,
)
from system.host.protocol import read_message, send_error, write_message
from system.host.state import state
from system.host.synthesis import handle_cancel, start_synthesis_worker


def handle_ping() -> None:
    kokoro_path = detect_kokoro_candidates()
    kokoro_path = kokoro_path[0] if kokoro_path else None
    detected_models = detect_model_dir_candidates(kokoro_path)
    model_dir = detected_models[0] if detected_models else None

    kokoro_ready = False
    error = None

    try:
        if not kokoro_path:
            resolved_kokoro = resolve_kokoro_path()
            kokoro_path = resolved_kokoro
        if not model_dir:
            model_dir = resolve_model_dir(kokoro_path)
        validate_model_dir(model_dir)
        kokoro_ready = True
    except RuntimeError as exc:
        error = str(exc)

    write_message(
        {
            "type": "pong",
            "hostConnected": True,
            "kokoroReady": kokoro_ready,
            "kokoroPath": kokoro_path,
            "modelDir": model_dir,
            "message": error,
        }
    )


def handle_message(message: dict[str, Any]) -> None:
    try:
        action = message.get("action")

        if action == "ping":
            handle_ping()
            return

        if action == "set_config":
            state.set_config(message)
            write_message({"type": "config_saved"})
            return

        if action == "cancel":
            handle_cancel(message.get("requestId"))
            return

        if action != "synthesize":
            send_error(message.get("requestId"), f"Unknown action: {action}")
            return

        request_id = str(message.get("requestId") or "")
        if not request_id:
            send_error(None, "Missing requestId for synthesize action")
            return

        options = message.get("options") or {}
        start_synthesis_worker(
            request_id, str(message.get("content", "")), options
        )
    except Exception as error:
        error_request_id = message.get("requestId")
        send_error(
            str(error_request_id) if error_request_id else None, str(error)
        )


def main() -> None:
    while True:
        try:
            message = read_message()
            if message is None:
                break
            handle_message(message)
        except Exception as error:
            send_error(None, str(error))
            break
