import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile

spec = importlib.util.spec_from_file_location("voice_model_build", Path(__file__).parents[1] / "tools/build-character-voices.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class ArchiveCheckpointTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.output = self.root / "models"
        self.output.mkdir()
        self.archive = self.root / "source.zip"
        self.pcm = b"checkpoint weights"
        self.voice = {"id": "braum", "checkpoint": {"archive": {"url": "https://models.test/source.zip"}, "member": "Braum/Braum.pth", "bytes": len(self.pcm), "sha256": hashlib.sha256(self.pcm).hexdigest()}}

    def archive_with(self, data, member="Braum/Braum.pth"):
        with zipfile.ZipFile(self.archive, "w") as source:
            source.writestr(member, data)
            source.writestr("../../irrelevant.pth", b"never extracted")

    def load(self):
        with patch.object(build, "verified_download", return_value=self.archive):
            return build.checkpoint_source(self.voice, self.output, self.root)

    def test_only_the_pinned_member_is_written_to_the_trusted_destination(self):
        self.archive_with(self.pcm)
        result = self.load()
        self.assertEqual(result, self.output / "braum.pth")
        self.assertEqual(result.read_bytes(), self.pcm)
        self.assertEqual(list(self.output.iterdir()), [result])
        self.assertFalse((self.root / "irrelevant.pth").exists())

    def test_corrupted_member_keeps_existing_checkpoint_and_removes_partial_file(self):
        destination = self.output / "braum.pth"
        destination.write_bytes(b"previous")
        self.archive_with(b"X" * len(self.pcm))
        with self.assertRaisesRegex(ValueError, "integrity"):
            self.load()
        self.assertEqual(destination.read_bytes(), b"previous")
        self.assertFalse(destination.with_suffix(".pth.partial").exists())

    def test_missing_or_wrong_size_member_cannot_become_a_checkpoint(self):
        self.archive_with(self.pcm, "another.pth")
        with self.assertRaises(KeyError):
            self.load()
        self.archive_with(self.pcm + b"extra")
        with self.assertRaisesRegex(ValueError, "size"):
            self.load()
        self.assertEqual(list(self.output.iterdir()), [])


if __name__ == "__main__": unittest.main()
