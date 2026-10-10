import importlib.util
import io
import json
from pathlib import Path
import struct
import unittest
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("engine", Path(__file__).with_name("engine.py"))
engine = importlib.util.module_from_spec(spec); spec.loader.exec_module(engine)


class ProtocolTests(unittest.TestCase):
    def test_round_trip_and_eof(self):
        stream = io.BytesIO()
        engine.write_packet(stream, {"id": 4, "op": "convert"}, struct.pack("<f", .25))
        stream.seek(0)
        self.assertEqual(engine.read_packet(stream), ({"id": 4, "op": "convert"}, struct.pack("<f", .25)))
        self.assertIsNone(engine.read_packet(stream))

    def test_rejects_unbounded_or_truncated_packets(self):
        for data in [struct.pack("<I", engine.MAX_PACKET + 1), struct.pack("<I", 2), struct.pack("<II", 10, 2) + b"{}", struct.pack("<II", 9, 2) + b"{}abc"]:
            with self.assertRaises(ValueError): engine.read_packet(io.BytesIO(data))


class EngineTests(unittest.TestCase):
    def setUp(self): self.worker = engine.RvcEngine()

    def test_invalid_configuration_does_not_load_or_replace_a_model(self):
        self.worker.voice = "previous"
        for meta in [{"backend": "unknown"}, {"contextMs": 10}]:
            with self.assertRaises(ValueError): self.worker.load(meta)
            self.assertEqual(self.worker.voice, "previous")

    def test_pcm_length_finite_and_generation_are_checked_before_inference(self):
        self.worker.voice = "loaded"
        self.worker.generation = 4
        for meta, pcm in [({"generation": 3}, b""), ({"generation": 4}, b""), ({"generation": 4}, struct.pack("<f", float("nan")) * 3840)]:
            with self.assertRaises(ValueError): self.worker.convert(meta, pcm)

    def test_window_resampling_matches_full_resampling_at_all_supported_rates(self):
        np = self.worker.np
        for rate in (16000, 32000, 40000, 48000):
            self.worker.model_rate = rate
            audio = np.random.default_rng(4).standard_normal(rate).astype(np.float32)
            full = self.worker.resample(audio, rate, 48000)
            for offset in (0, 7680, 15360, 30720):
                actual = self.worker.resample_window(audio, offset, 8640)
                np.testing.assert_allclose(actual, full[offset:offset + 8640], atol=2e-6)

    def test_cached_fir_is_identical_to_scipy_default_and_preserves_coefficients(self):
        from math import gcd
        np = self.worker.np
        for dtype in (np.float32, np.float64):
            for source, target in ((48000, 16000), (16000, 48000), (32000, 48000), (40000, 48000)):
                audio = np.random.default_rng(7).normal(size=7680).astype(dtype)
                factor = gcd(source, target)
                expected = self.worker.resample_poly(audio, target // factor, source // factor).astype(np.float32)
                with patch.object(self.worker, "firwin", wraps=self.worker.firwin) as design:
                    np.testing.assert_array_equal(self.worker.resample(audio, source, target), expected)
                    np.testing.assert_array_equal(self.worker.resample(audio, source, target), expected)
                    self.assertEqual(design.call_count, 1)

    def test_parallel_inference_drains_pitch_on_encoder_failure_before_next_rpc(self):
        import threading
        np = self.worker.np
        self.worker.voice = "loaded"
        self.worker.parallel_inference = True
        self.worker.context_ms = 320
        self.worker.block_ms = 80
        self.worker.encoder_inputs = [SimpleNamespace(name="source", shape=[1, 1, None], type="tensor(float)")]
        entered, release, finished = threading.Event(), threading.Event(), threading.Event()
        def pitch(*_):
            entered.set()
            release.wait(2)
            finished.set()
            raise RuntimeError("pitch failure")
        def encoder(*_):
            self.assertTrue(entered.wait(2))
            release.set()
            raise RuntimeError("encoder failure")
        self.worker.pitch = SimpleNamespace(run=pitch)
        self.worker.encoder = SimpleNamespace(run=encoder)
        with self.assertRaisesRegex(RuntimeError, "encoder failure"):
            self.worker.convert({"generation": 0, "stream": "mic", "epoch": 1}, np.ones(3840, np.float32).tobytes())
        self.assertTrue(finished.is_set())
        self.assertFalse(self.worker.histories)
        self.worker.pitch_pool.shutdown()

    def test_silence_advances_context_without_running_graphs_or_replaying_tail(self):
        np = self.worker.np
        self.worker.voice = "must never be called"
        self.worker.context_ms = 320
        self.worker.histories["mic"] = {"epoch": 1, "input": np.zeros(5120, np.float32), "tail": np.ones(960, np.float32)}
        meta, pcm = self.worker.convert({"generation": 0, "stream": "mic", "epoch": 1}, np.zeros(3840, np.float32).tobytes())
        self.assertTrue(meta["silent"])
        self.assertFalse(np.frombuffer(pcm, "<f4").any())
        self.assertIsNone(self.worker.histories["mic"]["tail"])
        self.assertEqual(len(self.worker.histories["mic"]["input"]), 5120)

    def test_silence_bypass_waits_for_speech_context_and_resets_on_mute_epoch(self):
        np = self.worker.np
        self.worker.voice = "loaded"
        self.worker.context_ms = 320
        self.worker.histories["mic"] = {"epoch": 1, "input": np.ones(5120, np.float32), "tail": None}
        # Active history must reach inference even if the new block is silent.
        with self.assertRaises(AttributeError):
            self.worker.convert({"generation": 0, "stream": "mic", "epoch": 1}, np.zeros(3840, np.float32).tobytes())
        # A new mute/PTT epoch discards every sample from the previous history.
        meta, _ = self.worker.convert({"generation": 0, "stream": "mic", "epoch": 2}, np.zeros(3840, np.float32).tobytes())
        self.assertTrue(meta["silent"])
        self.assertFalse(self.worker.histories["mic"]["input"].any())

    def test_profile_and_pitch_updates_reuse_graphs_and_only_warm_new_shapes(self):
        class Session:
            def get_inputs(self):
                return [SimpleNamespace(name=name, shape=[1, None, 768], type="tensor(float)") for name in ("feats", "p_len", "pitch", "pitchf", "sid", "decoder_start")]
            def get_modelmeta(self): return SimpleNamespace(custom_metadata_map={"metadata": json.dumps({"samplingRate": 40000, "decoderGuardFrames": 16})})
            def get_providers(self): return ["CPUExecutionProvider"]
        meta = {"encoder": "contentvec", "pitch": "rmvpe", "voice": "braum", "contextMs": 320, "blockMs": 80}
        with patch.object(self.worker, "session", side_effect=lambda *_: Session()) as sessions, patch.object(self.worker, "convert", return_value=({}, b"")) as warmup:
            first = self.worker.load(meta)
            self.assertEqual(sessions.call_count, 3)
            self.assertEqual(warmup.call_count, 2)
            second = self.worker.load({**meta, "pitchShift": 4})
            self.assertEqual(sessions.call_count, 3)
            self.assertEqual(warmup.call_count, 2)
            self.assertEqual(second["generation"], first["generation"] + 1)
            self.worker.load({**meta, "contextMs": 480, "blockMs": 120})
            self.assertEqual(sessions.call_count, 3)
            self.assertEqual(warmup.call_count, 4)
            self.worker.load({**meta, "voice": "ahri"})
            self.assertEqual(sessions.call_count, 4)
            with patch.object(engine.os, "cpu_count", return_value=2):
                self.worker.load(meta)
                self.assertFalse(self.worker.parallel_inference)

    def test_directml_uses_independent_parallel_sessions_even_with_few_cpu_cores(self):
        class Session:
            def get_inputs(self):
                return [SimpleNamespace(name=name, shape=[1, None, 768], type="tensor(float)") for name in ("feats", "p_len", "pitch", "pitchf", "sid", "decoder_start")]
            def get_modelmeta(self): return SimpleNamespace(custom_metadata_map={"metadata": json.dumps({"samplingRate": 40000})})
            def get_providers(self): return ["DmlExecutionProvider", "CPUExecutionProvider"]
        meta = {"encoder": "contentvec", "pitch": "rmvpe", "voice": "braum", "contextMs": 320, "blockMs": 80}
        with patch.object(engine.os, "cpu_count", return_value=2), patch.object(self.worker.ort, "get_available_providers", return_value=["DmlExecutionProvider", "CPUExecutionProvider"]), patch.object(self.worker, "session", side_effect=lambda *_: Session()) as sessions, patch.object(self.worker, "convert", return_value=({}, b"")):
            self.assertEqual(self.worker.load(meta)["backend"], "directml")
            self.assertTrue(self.worker.parallel_inference)
            self.worker.load({**meta, "pitchShift": 3})
            self.assertEqual(sessions.call_count, 3)
            self.worker.load({**meta, "blockMs": 160})
            self.assertEqual(sessions.call_count, 3)

    def test_worker_rejects_other_block_shapes_before_running_loaded_graphs(self):
        self.worker.voice = "loaded"
        self.worker.block_ms = 80
        with self.assertRaisesRegex(ValueError, "perfil carregado"):
            self.worker.convert({"generation": 0}, self.worker.np.zeros(7680, "<f4").tobytes())


if __name__ == "__main__": unittest.main()
