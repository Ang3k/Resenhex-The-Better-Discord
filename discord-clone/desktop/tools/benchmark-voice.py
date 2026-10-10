"""Measure the real binary RPC and RVC pipeline with an explicitly supplied test WAV.

Produces converted WAVs and JSON measurements; this is a developer validation tool, not recording in the app.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import wave

import numpy as np
from scipy.signal import resample_poly

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("engine_protocol", ROOT / "voice-engine/engine.py")
protocol = importlib.util.module_from_spec(spec); spec.loader.exec_module(protocol)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("wav", type=Path)
    parser.add_argument("--models", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--seconds", type=float, default=4)
    parser.add_argument("--backend", choices=["auto", "cpu", "gpu"], default="auto")
    parser.add_argument("--block-ms", choices=[80, 120, 160], type=int, default=160)
    parser.add_argument("--context-ms", choices=[320, 480, 640], type=int, default=320)
    parser.add_argument("--voice", action="append", help="Measure only these catalog IDs; may be repeated")
    parser.add_argument("--catalog", type=Path, default=ROOT / "lib/voice-catalog.json")
    parser.add_argument("--engine", type=Path, default=ROOT / "voice-engine/engine.py", help="Use a saved worker for before/after comparisons")
    parser.add_argument("--profile", action="store_true", help="Include per-stage timings (no microphone data or recordings in the app)")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with wave.open(str(args.wav)) as source:
        audio = np.frombuffer(source.readframes(source.getnframes()), dtype="<i2").astype(np.float32) / 32768
        if source.getnchannels() != 1:
            audio = audio.reshape(-1, source.getnchannels()).mean(axis=1)
        from math import gcd
        divisor = gcd(source.getframerate(), 48000)
        audio = resample_poly(audio, 48000 // divisor, source.getframerate() // divisor).astype(np.float32)
    audio = audio[:int(args.seconds * 48000)]
    catalog = json.loads(args.catalog.read_text())
    voices = [voice for voice in catalog["voices"] if not args.voice or voice["id"] in args.voice]
    if not voices or args.voice and set(args.voice) - {voice["id"] for voice in voices}:
        parser.error("Unknown voice ID")
    results = []
    worker = subprocess.Popen([sys.executable, "-I", "-u", str(args.engine)], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
    def worker_cpu_ms():
        # Linux developer metric: includes every worker thread, excludes graph
        # loading/warmup. Unsupported platforms keep the existing measurements.
        try:
            fields = Path(f"/proc/{worker.pid}/stat").read_text().rsplit(")", 1)[1].split()
            return (int(fields[11]) + int(fields[12])) * 1000 / os.sysconf("SC_CLK_TCK")
        except (OSError, ValueError, AttributeError):
            return None
    sequence = 0
    def request(meta, pcm=b""):
        nonlocal sequence
        sequence += 1
        protocol.write_packet(worker.stdin, {**meta, "id": sequence}, pcm)
        reply = protocol.read_packet(worker.stdout)
        if reply is None or reply[0].get("error"):
            raise RuntimeError(reply[0] if reply else "worker died")
        return reply
    try:
        for voice in voices:
            started = time.perf_counter()
            loaded, _ = request({"op": "load", "encoder": str(args.models / catalog["components"][voice.get("encoder", "encoder")]["file"]), "pitch": str(args.models / catalog["components"]["pitch"]["file"]),
                                 "voice": str(args.models / voice["file"]), "sampleRate": voice["sampleRate"], "contextMs": args.context_ms, "blockMs": args.block_ms, "backend": args.backend})
            load_ms = (time.perf_counter() - started) * 1000
            converted, timings, rtfs, rpc, stages = [], [], [], [], {}
            size = args.block_ms * 48
            cpu_started = worker_cpu_ms()
            for offset in range(0, len(audio), size):
                block = np.pad(audio[offset:offset + size], (0, max(0, size - len(audio[offset:offset + size]))))
                started = time.perf_counter()
                meta, pcm = request({"op": "convert", "generation": loaded["generation"], "stream": voice["id"], "epoch": 1, "profile": args.profile}, block.astype("<f4").tobytes())
                for name, elapsed in meta.get("stagesMs", {}).items(): stages.setdefault(name, []).append(elapsed)
                rpc.append((time.perf_counter() - started) * 1000)
                timings.append(meta["inferenceMs"]); rtfs.append(meta["rtf"])
                output = np.frombuffer(pcm, dtype="<f4")
                if len(output) != size or not np.isfinite(output).all(): raise ValueError("invalid PCM")
                converted.append(output)
            cpu_finished = worker_cpu_ms()
            signal = np.concatenate(converted)
            with wave.open(str(args.output / (voice["id"] + ".wav")), "wb") as destination:
                destination.setparams((1, 2, 48000, 0, "NONE", "not compressed")); destination.writeframes((signal * 32767).astype("<i2").tobytes())
            result = {"voice": voice["id"], "backend": loaded["backend"], "blockMs": args.block_ms, "contextMs": args.context_ms, "loadMs": load_ms, "blocks": len(timings),
                      "inferenceMedianMs": float(np.median(timings)), "inferenceP95Ms": float(np.percentile(timings, 95)), "rpcP95Ms": float(np.percentile(rpc, 95)),
                      "rtfMedian": float(np.median(rtfs)), "peak": float(np.max(np.abs(signal))), "rms": float(np.sqrt(np.mean(signal ** 2))), "finite": True}
            if cpu_started is not None and cpu_finished is not None:
                result["workerCpuMs"] = cpu_finished - cpu_started
                result["workerCpuMsPerBlock"] = (cpu_finished - cpu_started) / len(timings)
            if stages: result["stagesMedianMs"] = {name: float(np.median(values)) for name, values in stages.items()}
            results.append(result); print(json.dumps(result), flush=True)
            request({"op": "release", "stream": voice["id"]})
    finally:
        worker.stdin.close(); worker.wait(timeout=10)
    (args.output / "measurements.json").write_text(json.dumps({"python": sys.version, "input": str(args.wav), "results": results}, indent=2) + "\n")


if __name__ == "__main__": main()
