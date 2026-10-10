"""Developer check: compare real workers with identical random seeds and PCM.

Only the test subprocess fixes seeds. Production conversion stays stochastic and
never records microphone audio. Uses the supplied WAV and pinned catalog models.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import wave

import numpy as np
from scipy.signal import resample_poly

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("voice_protocol", ROOT / "voice-engine/engine.py")
protocol = importlib.util.module_from_spec(spec); spec.loader.exec_module(protocol)
WRAPPER = """
import importlib.util, sys
spec = importlib.util.spec_from_file_location('checked_worker', sys.argv[1])
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
original = module.RvcEngine.__init__
def deterministic(self):
    original(self)
    self.ort.set_seed(20261010)
    self.rng = self.np.random.default_rng(20261010)
module.RvcEngine.__init__ = deterministic
module.main()
"""


class Worker:
    def __init__(self, path):
        self.process = subprocess.Popen([sys.executable, "-I", "-u", "-c", WRAPPER, str(path)], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        self.sequence = 0

    def request(self, meta, pcm=b""):
        self.sequence += 1
        protocol.write_packet(self.process.stdin, {**meta, "id": self.sequence}, pcm)
        reply = protocol.read_packet(self.process.stdout)
        if reply is None or reply[0].get("error"):
            raise RuntimeError(reply[0] if reply else "Worker exited")
        return reply

    def close(self):
        self.process.stdin.close(); self.process.wait(timeout=10)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("wav", type=Path)
    parser.add_argument("--models", required=True, type=Path)
    parser.add_argument("--reference-engine", required=True, type=Path)
    parser.add_argument("--candidate-engine", type=Path, default=ROOT / "voice-engine/engine.py")
    parser.add_argument("--voice", action="append")
    parser.add_argument("--all-shapes", action="store_true", help="Exercise all nine supported context/block combinations")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    fingerprints = {"referenceEngineSha256": hashlib.sha256(args.reference_engine.read_bytes()).hexdigest(),
                    "candidateEngineSha256": hashlib.sha256(args.candidate_engine.read_bytes()).hexdigest()}
    with wave.open(str(args.wav)) as source:
        if source.getsampwidth() != 2 or source.getnchannels() != 1:
            parser.error("Supply a mono PCM16 test WAV")
        from math import gcd
        rate = source.getframerate(); factor = gcd(rate, 48000)
        audio = resample_poly(np.frombuffer(source.readframes(source.getnframes()), "<i2").astype(np.float32) / 32768, 48000 // factor, rate // factor).astype(np.float32)
    catalog = json.loads((ROOT / "lib/voice-catalog.json").read_text())
    voices = [v for v in catalog["voices"] if not args.voice or v["id"] in args.voice]
    if not voices or args.voice and set(args.voice) - {v["id"] for v in voices}: parser.error("Unknown voice ID")
    shapes = [(320, 80), (320, 160), (480, 120), (640, 160)]
    if args.all_shapes: shapes = [(c, b) for c in (320, 480, 640) for b in (80, 120, 160)]
    workers = [Worker(args.reference_engine), Worker(args.candidate_engine)]
    results = []
    try:
        for voice in voices:
            for context, block in shapes:
                load = {"op": "load", "backend": "cpu", "contextMs": context, "blockMs": block,
                        "encoder": str(args.models / catalog["components"][voice.get("encoder", "encoder")]["file"]),
                        "pitch": str(args.models / catalog["components"]["pitch"]["file"]), "voice": str(args.models / voice["file"]), "sampleRate": voice["sampleRate"]}
                generations = [worker.request(load)[0]["generation"] for worker in workers]
                size = block * 48
                error = 0.0
                # Three consecutive blocks exercise history and SOLA, followed by
                # a new mute/PTT epoch and its exact silence requirement.
                for index in range(3):
                    offset = index * size
                    pcm = np.pad(audio[offset:offset + size], (0, max(0, size - len(audio[offset:offset + size])))).astype("<f4").tobytes()
                    outputs = [np.frombuffer(worker.request({"op": "convert", "generation": gen, "stream": "proof", "epoch": 1}, pcm)[1], "<f4") for worker, gen in zip(workers, generations)]
                    if any(len(out) != size or not np.isfinite(out).all() for out in outputs): raise AssertionError("Invalid PCM")
                    error = max(error, float(np.max(np.abs(outputs[0] - outputs[1]))))
                    np.testing.assert_allclose(outputs[0], outputs[1], atol=2e-5, rtol=2e-5)
                for worker, gen in zip(workers, generations):
                    quiet = np.frombuffer(worker.request({"op": "convert", "generation": gen, "stream": "proof", "epoch": 2}, np.zeros(size, "<f4").tobytes())[1], "<f4")
                    if len(quiet) != size or quiet.any(): raise AssertionError("Mute epoch replayed speech")
                    worker.request({"op": "release", "stream": "proof"})
                result = {"voice": voice["id"], "contextMs": context, "blockMs": block, "blocks": 3, "maxAbsoluteError": error, "muteEpochSilent": True}
                results.append(result); print(json.dumps(result), flush=True)
    finally:
        for worker in workers: worker.close()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"passed": True, **fingerprints, "referenceEngine": str(args.reference_engine), "candidateEngine": str(args.candidate_engine), "seed": 20261010, "results": results}, indent=2) + "\n")


if __name__ == "__main__": main()
