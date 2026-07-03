"""Tests for dynamic model file discovery."""

from __future__ import annotations

import tempfile
import time
import unittest
from pathlib import Path

from system.host.paths import find_model_files, model_dir_is_valid


class FindModelFilesTests(unittest.TestCase):
    def test_empty_directory_raises(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            model_dir = Path(temp_dir)
            with self.assertRaises(RuntimeError) as context:
                find_model_files(model_dir)
            self.assertIn(".onnx", str(context.exception))

    def test_only_onnx_raises(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            model_dir = Path(temp_dir)
            (model_dir / "model.onnx").write_bytes(b"onnx")
            with self.assertRaises(RuntimeError) as context:
                find_model_files(model_dir)
            self.assertIn(".bin", str(context.exception))

    def test_only_bin_raises(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            model_dir = Path(temp_dir)
            (model_dir / "voices.bin").write_bytes(b"bin")
            with self.assertRaises(RuntimeError) as context:
                find_model_files(model_dir)
            self.assertIn(".onnx", str(context.exception))

    def test_single_pair_works_with_custom_names(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            model_dir = Path(temp_dir)
            onnx = model_dir / "my-model.onnx"
            voices = model_dir / "my-voices.bin"
            onnx.write_bytes(b"onnx")
            voices.write_bytes(b"bin")

            model_path, voices_path = find_model_files(model_dir)

            self.assertEqual(model_path, onnx)
            self.assertEqual(voices_path, voices)
            self.assertTrue(model_dir_is_valid(model_dir))

    def test_picks_newest_by_mtime(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            model_dir = Path(temp_dir)
            older_onnx = model_dir / "old.onnx"
            newer_onnx = model_dir / "new.onnx"
            older_bin = model_dir / "old.bin"
            newer_bin = model_dir / "new.bin"

            older_onnx.write_bytes(b"old-onnx")
            older_bin.write_bytes(b"old-bin")
            time.sleep(0.01)
            newer_onnx.write_bytes(b"new-onnx")
            newer_bin.write_bytes(b"new-bin")

            model_path, voices_path = find_model_files(model_dir)

            self.assertEqual(model_path, newer_onnx)
            self.assertEqual(voices_path, newer_bin)


if __name__ == "__main__":
    unittest.main()
