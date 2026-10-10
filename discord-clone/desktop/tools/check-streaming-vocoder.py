"""Build-time check: removing heard vocoder frames preserves the audible convolution.

Uses a verified catalog checkpoint (torch weights_only); never part of the runtime.
The same oscillator phase, noise and latent input are used on both paths.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys


def main():
    import torch
    parser = argparse.ArgumentParser()
    parser.add_argument("checkpoint", type=Path)
    parser.add_argument("--voice", default="braum")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    voice = next(v for v in json.loads((root / "lib/voice-catalog.json").read_text())["voices"] if v["id"] == args.voice)
    with args.checkpoint.open("rb") as source:
        if hashlib.file_digest(source, "sha256").hexdigest() != voice["checkpoint"]["sha256"]:
            raise ValueError("Checkpoint does not match the reviewed catalog")
    spec = importlib.util.spec_from_file_location("rvc_export", root / "tools/rvc-export/__init__.py", submodule_search_locations=[str(root / "tools/rvc-export")])
    module = importlib.util.module_from_spec(spec); sys.modules[spec.name] = module; spec.loader.exec_module(module)
    from rvc_export.export_model import SynthesizerTrnMs768NSFsid_ONNX
    from rvc_export.export_model_v1 import SynthesizerTrnMs256NSFsid_ONNX
    torch.set_num_threads(4)
    checkpoint = torch.load(args.checkpoint, map_location="cpu", weights_only=True)
    cls = SynthesizerTrnMs256NSFsid_ONNX if checkpoint["weight"]["enc_p.emb_phone.weight"].shape[1] == 256 else SynthesizerTrnMs768NSFsid_ONNX
    model = cls(*checkpoint["config"], is_half=False).eval()
    model.load_state_dict(checkpoint["weight"], strict=False)
    results = []
    with torch.inference_mode():
        g = model.emb_g(torch.tensor([0])).unsqueeze(-1)
        for context_ms in (320, 480, 640):
            for block_ms in (80, 120, 160):
                frames = (context_ms + block_ms + 40) // 10
                torch.manual_seed(20261010)
                latent = torch.randn(1, model.inter_channels, frames)
                pitch = torch.linspace(120, 240, frames)[None]
                pitch[:, ::7] = 0  # exercise voiced/unvoiced oscillator transitions
                start = context_ms // 10
                torch.manual_seed(42)
                full = model.dec(latent, pitch, g=g)
                torch.manual_seed(42)
                bounded = model.dec(latent, pitch, g=g, skip_head=torch.tensor([start]))
                sr = checkpoint["config"][-1]
                audible_start = 0
                reference = full[:, :, start * sr // 100 + audible_start:]
                actual = bounded[:, :, audible_start:]
                error = float((reference - actual).abs().max())
                if error > 2e-5:
                    raise AssertionError(f"Audible window changed: {context_ms}/{block_ms}: {error}")
                results.append({"contextMs": context_ms, "blockMs": block_ms, "maxAbsoluteError": error, "samples": actual.numel()})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"voice": args.voice, "guardsPerStage": model.dec.streaming_guards, "results": results}, indent=2) + "\n")
    print(json.dumps({"voice": args.voice, "cases": len(results), "maxAbsoluteError": max(r["maxAbsoluteError"] for r in results)}))


if __name__ == "__main__": main()
