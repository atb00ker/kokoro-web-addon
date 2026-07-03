"""Tests for kokoro-tts subprocess orchestration."""

from __future__ import annotations

import subprocess
import tempfile
import threading
import time
import unittest
from pathlib import Path
from typing import cast
from unittest import mock

from system.host import synthesis
from system.host.state import MAX_SYNTHESIS_WORKERS, state


class StreamFileTests(unittest.TestCase):
    def setUp(self) -> None:
        state.cancelled_requests.clear()

    def test_streams_from_offset_without_complete(self) -> None:
        messages: list[dict[str, object]] = []

        with (
            mock.patch(
                "system.host.synthesis.write_message",
                side_effect=lambda message: messages.append(message),
            ),
            _temp_file() as output_path,
        ):
            output_path.write_bytes(b"abcdef")
            index, offset = synthesis.stream_file(
                "req-1",
                output_path,
                mark_final_on_eof=False,
                send_complete=False,
            )

        self.assertEqual(index, 1)
        self.assertEqual(offset, 6)
        self.assertEqual(messages[0]["type"], "audio_chunk")
        self.assertFalse(messages[0]["final"])
        self.assertTrue(
            all(message.get("type") != "complete" for message in messages)
        )

    def test_sends_complete_on_final_read(self) -> None:
        messages: list[dict[str, object]] = []

        with (
            mock.patch(
                "system.host.synthesis.write_message",
                side_effect=lambda message: messages.append(message),
            ),
            _temp_file() as output_path,
        ):
            output_path.write_bytes(b"wav-data")
            synthesis.stream_file("req-2", output_path)

        self.assertEqual(
            messages[-1], {"type": "complete", "requestId": "req-2"}
        )


class StreamWhileProcessRunsTests(unittest.TestCase):
    def setUp(self) -> None:
        state.cancelled_requests.clear()

    def test_streams_audio_before_process_exits(self) -> None:
        messages: list[dict[str, object]] = []

        class FakeProcess:
            def __init__(self, output_path: Path) -> None:
                self._done = False
                self.stderr = None
                self._output_path = output_path

            def poll(self) -> int | None:
                return 0 if self._done else None

            def wait(self) -> int:
                self._done = True
                return 0

        with (
            mock.patch(
                "system.host.synthesis.write_message",
                side_effect=lambda message: messages.append(message),
            ),
            _temp_file() as output_path,
        ):
            process = FakeProcess(output_path)

            def grow_file() -> None:
                time.sleep(0.02)
                output_path.write_bytes(b"partial-audio")
                time.sleep(0.05)
                process._done = True

            thread = threading.Thread(target=grow_file)
            thread.start()
            synthesis.stream_while_process_runs(
                "req-3",
                output_path,
                cast(subprocess.Popen[bytes], process),
            )
            thread.join()

        audio_messages = [m for m in messages if m.get("type") == "audio_chunk"]
        self.assertGreaterEqual(len(audio_messages), 1)
        self.assertEqual(
            messages[-1], {"type": "complete", "requestId": "req-3"}
        )


class WorkerPoolTests(unittest.TestCase):
    def test_max_workers_matches_extension_default(self) -> None:
        self.assertEqual(MAX_SYNTHESIS_WORKERS, 3)

    def test_executor_uses_worker_cap(self) -> None:
        self.assertEqual(
            state.synthesis_executor._max_workers, MAX_SYNTHESIS_WORKERS
        )


class CancelTests(unittest.TestCase):
    def test_cancel_terminates_active_process(self) -> None:
        process = mock.Mock()
        process.poll.return_value = None
        process.wait.return_value = 0
        messages: list[dict[str, object]] = []

        with mock.patch(
            "system.host.synthesis.write_message",
            side_effect=lambda message: messages.append(message),
        ):
            with state.lock:
                state.active_processes["req-cancel"] = process
            synthesis.handle_cancel("req-cancel")

        process.terminate.assert_called_once()
        self.assertEqual(
            messages[-1], {"type": "cancelled", "requestId": "req-cancel"}
        )
        self.assertNotIn("req-cancel", state.active_processes)


class _temp_file:
    def __enter__(self) -> Path:
        handle = tempfile.NamedTemporaryFile(delete=False)
        handle.close()
        self.path = Path(handle.name)
        return self.path

    def __exit__(self, *_args: object) -> None:
        self.path.unlink(missing_ok=True)


if __name__ == "__main__":
    unittest.main()
