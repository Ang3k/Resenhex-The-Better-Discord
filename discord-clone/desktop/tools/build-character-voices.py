"""Offline build-time export. Runtime never unpickles community checkpoints.

Requires torch==2.6.0, onnx==1.19.1 and numpy==2.2.6 on the build computer only.
Pinned source checkpoints are downloaded and verified before torch weights_only loading.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import zipfile

spec = importlib.util.spec_from_file_location("prepare_voice_runtime", Path(__file__).with_name("prepare-voice-runtime.py"))
download_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(download_module)
verified_download = download_module.verified_download


def checkpoint_source(voice, output, cache):
    checkpoint = voice["checkpoint"]
    if "archive" not in checkpoint:
        return verified_download({**checkpoint, "name": voice["id"] + ".pth"}, output)
    archive = verified_download({**checkpoint["archive"], "name": voice["id"] + ".zip"}, cache)
    destination = output / (voice["id"] + ".pth")
    temporary = destination.with_suffix(".pth.partial")
    try:
        with zipfile.ZipFile(archive) as source:
            info = source.getinfo(checkpoint["member"])
            if info.file_size != checkpoint["bytes"] or not 0 < info.file_size <= 300000000:
                raise ValueError("Checkpoint size differs from the catalog")
            digest, size = hashlib.sha256(), 0
            # Read a single pinned member into a trusted destination; never extract archive paths.
            with source.open(info) as stream, temporary.open("wb") as target:
                while chunk := stream.read(1048576):
                    size += len(chunk)
                    if size > checkpoint["bytes"]:
                        raise ValueError("Checkpoint exceeds the expected size")
                    digest.update(chunk); target.write(chunk)
            if size != checkpoint["bytes"] or digest.hexdigest() != checkpoint["sha256"]:
                raise ValueError("Checkpoint integrity check failed")
        temporary.replace(destination)
        return destination
    finally:
        temporary.unlink(missing_ok=True)

def main():
    import argparse
    import torch
    import onnx
    parser = argparse.ArgumentParser()
    parser.add_argument("--review-output", type=Path, help="Export changed graphs to a separate directory for review before updating catalog hashes")
    parser.add_argument("--voice", action="append")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    spec = importlib.util.spec_from_file_location("rvc_export", root / "tools/rvc-export/__init__.py", submodule_search_locations=[str(root / "tools/rvc-export")])
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    from rvc_export.export_model_v1 import SynthesizerTrnMs256NSFsid_ONNX
    from rvc_export.export_model import SynthesizerTrnMs768NSFsid_ONNX
    catalog = json.loads((root / "lib/voice-catalog.json").read_text())
    output = args.review_output or root / "voice-engine/models"
    if args.review_output and output.resolve() == (root / "voice-engine/models").resolve():
        parser.error("Review exports must use a separate directory")
    output.mkdir(parents=True, exist_ok=True)
    cache = Path(os.environ.get("RESENHEX_VOICE_BUILD_CACHE", str(root / "voice-engine/.build-cache"))) / "voices"
    cache.mkdir(parents=True, exist_ok=True)
    for voice in catalog["voices"]:
        if "checkpoint" not in voice or args.voice and voice["id"] not in args.voice:
            continue
        source = checkpoint_source(voice, output, cache)
        checkpoint = torch.load(source, map_location="cpu", weights_only=True)
        channels = checkpoint["weight"]["enc_p.emb_phone.weight"].shape[1]
        cls = SynthesizerTrnMs256NSFsid_ONNX if channels == 256 else SynthesizerTrnMs768NSFsid_ONNX
        torch.manual_seed(20261010)
        model = cls(*checkpoint["config"], is_half=False).eval()
        keys = model.load_state_dict(checkpoint["weight"], strict=False)
        if any(not key.startswith("enc_q.") for key in keys.missing_keys) or keys.unexpected_keys:
            raise ValueError("Checkpoint does not match the inference architecture")
        frames = 64
        destination = output / voice["file"]
        temporary = destination.with_suffix(".onnx.partial")
        inputs = (torch.randn(1, frames, channels), torch.tensor([frames]), torch.ones(1, frames, dtype=torch.int64), torch.full((1, frames), 180.0), torch.tensor([0]), torch.tensor([16]))
        torch.onnx.export(model, inputs, str(temporary), input_names=["feats", "p_len", "pitch", "pitchf", "sid", "decoder_start"], output_names=["audio"], opset_version=17,
                          dynamic_axes={"feats": {1: "frames"}, "pitch": {1: "frames"}, "pitchf": {1: "frames"}}, do_constant_folding=False, dynamo=False)
        graph = onnx.load(str(temporary))
        onnx.helper.set_model_props(graph, {"metadata": json.dumps({"samplingRate": checkpoint["config"][-1], "f0": True, "embChannels": channels, "version": "2.3", "decoderMode": "bounded-v1"})})
        onnx.checker.check_model(graph)
        onnx.save(graph, str(temporary))
        with temporary.open("rb") as exported:
            digest = hashlib.file_digest(exported, "sha256").hexdigest()
        print(json.dumps({"id": voice["id"], "bytes": temporary.stat().st_size, "sha256": digest}), flush=True)
        if not args.review_output and (voice["sha256"] != digest or voice["bytes"] != temporary.stat().st_size):
            temporary.unlink()
            raise ValueError("Export changed: review the build environment and catalog hash")
        temporary.replace(destination)
        source.unlink()


if __name__ == "__main__":
    main()
