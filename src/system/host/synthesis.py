"""kokoro-tts subprocess orchestration."""

from __future__ import annotations

import base64
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

from system.host.paths import (
    find_model_files,
    resolve_kokoro_path,
    resolve_model_dir,
    validate_model_dir,
)
from system.host.protocol import send_error, write_message
from system.host.state import state

CHUNK_SIZE = 512 * 1024
POLL_INTERVAL_SECONDS = 0.05


def build_kokoro_command(
    input_path: str,
    options: dict[str, Any],
    *,
    output_path: str,
) -> list[str]:
    voice = str(options.get("voice", "am_adam"))
    speed = str(options.get("speed", 1.0))
    lang = str(options.get("lang", "en-us"))
    audio_format = str(options.get("format", "wav"))
    model_dir = Path(resolve_model_dir())
    model_path, voices_path = find_model_files(model_dir)

    command: list[str] = [resolve_kokoro_path(), input_path, output_path]

    command.extend(
        [
            "--model",
            str(model_path),
            "--voices",
            str(voices_path),
            "--voice",
            voice,
            "--speed",
            speed,
            "--lang",
            lang,
            "--format",
            audio_format,
        ]
    )
    return command


def format_kokoro_stderr(stderr: bytes) -> str:
    return stderr.decode("utf-8", errors="replace").strip()


def missing_output_error(stderr: bytes) -> RuntimeError:
    message = "kokoro-tts did not produce an output file"
    error_text = format_kokoro_stderr(stderr)
    if error_text:
        message = f"{message}: {error_text}"
    return RuntimeError(message)


def stream_file(
    request_id: str,
    output_path: Path,
    *,
    mark_final_on_eof: bool = True,
    start_index: int = 0,
    start_offset: int = 0,
    send_complete: bool = True,
) -> tuple[int, int]:
    if not output_path.exists():
        raise RuntimeError("kokoro-tts did not produce an output file")

    file_size = output_path.stat().st_size
    if file_size == 0:
        raise RuntimeError("kokoro-tts produced an empty audio file")

    index = start_index
    offset = start_offset
    with output_path.open("rb") as handle:
        handle.seek(offset)
        while offset < file_size:
            if request_id in state.cancelled_requests:
                return index, offset

            chunk = handle.read(min(CHUNK_SIZE, file_size - offset))
            if not chunk:
                break

            offset += len(chunk)
            final = mark_final_on_eof and offset >= file_size
            write_message(
                {
                    "type": "audio_chunk",
                    "requestId": request_id,
                    "index": index,
                    "data": base64.b64encode(chunk).decode("ascii"),
                    "final": final,
                }
            )
            index += 1

    if send_complete and mark_final_on_eof and offset >= file_size:
        write_message({"type": "complete", "requestId": request_id})

    return index, offset


def stream_while_process_runs(
    request_id: str,
    output_path: Path,
    process: subprocess.Popen[bytes],
) -> tuple[int, int]:
    index = 0
    offset = 0

    while process.poll() is None:
        if request_id in state.cancelled_requests:
            return index, offset

        if output_path.exists() and output_path.stat().st_size > offset:
            index, offset = stream_file(
                request_id,
                output_path,
                mark_final_on_eof=False,
                start_index=index,
                start_offset=offset,
                send_complete=False,
            )

        time.sleep(POLL_INTERVAL_SECONDS)

    if output_path.exists() and output_path.stat().st_size > offset:
        index, offset = stream_file(
            request_id,
            output_path,
            mark_final_on_eof=True,
            start_index=index,
            start_offset=offset,
            send_complete=True,
        )
    elif offset > 0:
        write_message({"type": "complete", "requestId": request_id})

    return index, offset


def run_kokoro(
    request_id: str, input_path: str, options: dict[str, Any]
) -> None:
    model_dir = resolve_model_dir()
    validate_model_dir(model_dir)

    with tempfile.TemporaryDirectory(prefix="kokoro-host-") as temp_dir:
        temp_path = Path(temp_dir)
        output_path = temp_path / "output.wav"
        command = build_kokoro_command(
            input_path,
            options,
            output_path=str(output_path),
        )

        write_message(
            {
                "type": "progress",
                "requestId": request_id,
                "message": "Running kokoro-tts...",
            }
        )

        process = subprocess.Popen(
            command,
            cwd=model_dir,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )

        with state.lock:
            state.active_processes[request_id] = process

        stderr = b""
        try:
            stream_while_process_runs(request_id, output_path, process)
            stderr = process.stderr.read() if process.stderr else b""
            return_code = process.wait()

            if request_id in state.cancelled_requests:
                state.cancelled_requests.discard(request_id)
                return

            if return_code != 0:
                error_text = format_kokoro_stderr(stderr)
                raise RuntimeError(
                    error_text or f"kokoro-tts exited with code {return_code}"
                )

            if not output_path.exists():
                raise missing_output_error(stderr)

            if output_path.stat().st_size == 0:
                raise RuntimeError("kokoro-tts produced an empty audio file")
        finally:
            with state.lock:
                state.active_processes.pop(request_id, None)


def synthesize_text(
    request_id: str, content: str, options: dict[str, Any]
) -> None:
    if not content.strip():
        raise RuntimeError("Text input is empty")

    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        suffix=".txt",
        delete=False,
    ) as handle:
        handle.write(content)
        input_path = handle.name

    try:
        run_kokoro(request_id, input_path, options)
    finally:
        Path(input_path).unlink(missing_ok=True)


def handle_cancel(request_id: str | None) -> None:
    if not request_id:
        send_error(None, "Missing requestId for cancel action")
        return

    state.cancelled_requests.add(request_id)

    with state.lock:
        process = state.active_processes.get(request_id)

    if process and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            process.kill()

    with state.lock:
        state.active_processes.pop(request_id, None)

    write_message({"type": "cancelled", "requestId": request_id})


def _run_synthesis_worker(
    request_id: str, content: str, options: dict[str, Any]
) -> None:
    try:
        synthesize_text(request_id, content, options)
    except RuntimeError as error:
        send_error(request_id, str(error))


def start_synthesis_worker(
    request_id: str, content: str, options: dict[str, Any]
) -> None:
    state.synthesis_executor.submit(
        _run_synthesis_worker, request_id, content, options
    )
