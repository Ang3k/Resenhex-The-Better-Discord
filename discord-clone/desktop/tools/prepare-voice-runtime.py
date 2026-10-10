"""Assemble the Windows x64 embedded runtime from immutable, SHA-256-pinned archives.

Runs on Linux or Windows using only Python's standard library. End users need no Python/pip.
"""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import struct
import subprocess
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def verified_download(spec, cache):
    file = cache / spec["name"]
    if file.exists() and file.stat().st_size == spec["bytes"] and hashlib.file_digest(file.open("rb"), "sha256").hexdigest() == spec["sha256"]:
        return file
    temporary = file.with_suffix(file.suffix + ".partial")
    digest, size = hashlib.sha256(), 0
    try:
        with urllib.request.urlopen(spec["url"], timeout=120) as source, temporary.open("wb") as destination:
            while chunk := source.read(1048576):
                digest.update(chunk); size += len(chunk)
                if size > spec["bytes"]:
                    raise ValueError("Archive larger than the lockfile")
                destination.write(chunk)
        if size != spec["bytes"] or digest.hexdigest() != spec["sha256"]:
            raise ValueError("Archive integrity check failed: " + spec["name"])
        temporary.replace(file)
    finally:
        temporary.unlink(missing_ok=True)
    return file


def extract(archive, destination):
    with zipfile.ZipFile(archive) as source:
        for item in source.infolist():
            path = PurePosixPath(item.filename)
            if path.is_absolute() or ".." in path.parts or "\\" in item.filename:
                raise ValueError("Unsafe archive path")
        source.extractall(destination)


def main():
    lock = json.loads((ROOT / "voice-engine/windows-runtime.lock.json").read_text())
    cache = Path(os.environ.get("RESENHEX_VOICE_BUILD_CACHE", str(ROOT / "voice-engine/.build-cache")))
    cache.mkdir(parents=True, exist_ok=True)
    output = ROOT / "voice-engine/runtime"
    temporary = Path(tempfile.mkdtemp(prefix="voice-runtime-", dir=cache))
    try:
        extract(verified_download(lock["python"], cache), temporary)
        packages = temporary / "Lib/site-packages"
        packages.mkdir(parents=True)
        for wheel in lock["wheels"]:
            print("Preparing", wheel["name"], flush=True)
            extract(verified_download(wheel, cache), packages)
        # App-local Microsoft C++ libraries: neither administrator rights nor a separate installer.
        redist = verified_download(lock["vcredist"], cache)
        sevenzip = os.environ["RESENHEX_BUILD_7ZIP"]
        redist_dir = temporary / "vcredist-extract"
        redist_dir.mkdir()
        subprocess.run([sevenzip, "x", "-y", "-o" + str(redist_dir), str(redist)], check=True, stdout=subprocess.DEVNULL)
        data = redist.read_bytes()
        offset = lock["vcredist"]["payloadCabOffset"]
        size = struct.unpack_from("<I", data, offset + 8)[0]
        if data[offset:offset + 4] != b"MSCF" or offset + size > len(data):
            raise ValueError("Unexpected redistributable container")
        payload = redist_dir / "payload.cab"
        payload.write_bytes(data[offset:offset + size])
        subprocess.run([sevenzip, "x", "-y", "-o" + str(redist_dir / "payload"), str(payload)], check=True, stdout=subprocess.DEVNULL)
        subprocess.run([sevenzip, "x", "-y", "-o" + str(redist_dir / "dlls"), str(redist_dir / "payload" / lock["vcredist"]["minimumCab"])], check=True, stdout=subprocess.DEVNULL)
        for dll in (redist_dir / "dlls").glob("*.dll_amd64"):
            shutil.copyfile(dll, temporary / dll.name.removesuffix("_amd64"))
        shutil.copyfile(redist_dir / "u4", temporary / "MICROSOFT-VC-RUNTIME-LICENSE.rtf")
        shutil.rmtree(redist_dir)
        if not (temporary / "msvcp140.dll").exists() or not (temporary / "msvcp140_1.dll").exists():
            raise ValueError("C++ runtime libraries missing")
        (temporary / "python312._pth").write_text("python312.zip\n.\nLib/site-packages\nimport site\n")
        (temporary / "resenhex-runtime-manifest.json").write_text(json.dumps(lock, indent=2) + "\n")
        # Embedded CPython includes its license; wheels retain their .dist-info/licenses notices.
        shutil.rmtree(output, ignore_errors=True)
        shutil.move(str(temporary), str(output))
        print("Windows runtime prepared:", output, flush=True)
    finally:
        shutil.rmtree(temporary, ignore_errors=True)


if __name__ == "__main__":
    main()
