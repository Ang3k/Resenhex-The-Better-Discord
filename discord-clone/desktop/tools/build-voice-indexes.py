"""Offline build-time export of each voice's retrieval index (RVC "index") as a compact NumPy file.

The community .index files are Faiss IVF indexes holding every ContentVec frame of the training
set (tens of thousands of 768-d vectors, 12-140 MB). The app only needs representative frames for
nearest-neighbour blending, so large sets are reduced with k-means to INDEX_SIZE centroids (the
same reduction RVC applies to big datasets) and stored as fp16: ~15 MB per voice, no Faiss at runtime.

Requires faiss-cpu and numpy on the build computer only. Writes <id>.index.npy next to the models
and prints the size and SHA-256 to pin in lib/voice-catalog.json.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import zipfile

INDEX_SIZE = 10000
SEED = 20261010


def main():
    import faiss
    import numpy as np
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path)
    parser.add_argument("--voice", action="append")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    catalog = json.loads((root / "lib/voice-catalog.json").read_text(encoding="utf-8"))
    cache = root / "voice-engine/.build-cache/voices"
    output = args.output or root / "voice-engine/models"
    output.mkdir(parents=True, exist_ok=True)
    for voice in catalog["voices"]:
        spec = voice.get("index")
        if not spec or args.voice and voice["id"] not in args.voice:
            continue
        archive = cache / (voice["id"] + ".zip")
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        if digest != voice["checkpoint"]["archive"]["sha256"]:
            raise ValueError(f"{voice['id']}: archive differs from the catalog")
        with zipfile.ZipFile(archive) as source:
            raw = source.read(spec["member"])
        if hashlib.sha256(raw).hexdigest() != spec["memberSha256"]:
            raise ValueError(f"{voice['id']}: index member differs from the catalog")
        index = faiss.deserialize_index(np.frombuffer(raw, dtype=np.uint8))
        if index.d != 768:
            raise ValueError(f"{voice['id']}: index has {index.d} dimensions, expected 768")
        ivf = faiss.extract_index_ivf(index)
        ivf.make_direct_map()
        vectors = ivf.reconstruct_n(0, index.ntotal).astype(np.float32)
        if len(vectors) > INDEX_SIZE:
            kmeans = faiss.Kmeans(768, INDEX_SIZE, niter=20, seed=SEED, verbose=False)
            kmeans.train(vectors)
            vectors = kmeans.centroids
        destination = output / spec["file"]
        buffer = io.BytesIO()
        np.save(buffer, vectors.astype(np.float16))
        destination.write_bytes(buffer.getvalue())
        print(json.dumps({"id": voice["id"], "frames": int(index.ntotal), "kept": len(vectors), "bytes": destination.stat().st_size,
                          "sha256": hashlib.sha256(buffer.getvalue()).hexdigest()}), flush=True)


if __name__ == "__main__":
    main()
