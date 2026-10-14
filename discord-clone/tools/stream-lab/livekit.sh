#!/usr/bin/env bash
# Baixa o LiveKit da mesma versão do deploy/instalar-sfu.sh para o laboratório (só loopback), conferindo o checksum.
set -euo pipefail
version=1.13.8
directory="${1:?informe a pasta de destino}"
case "$(uname -m)" in aarch64|arm64) architecture=arm64 ;; x86_64) architecture=amd64 ;; *) echo 'Arquitetura não suportada'; exit 1 ;; esac
mkdir -p "$directory"
cd "$directory"
archive="livekit_${version}_linux_${architecture}.tar.gz"
curl -fsSL "https://github.com/livekit/livekit/releases/download/v${version}/$archive" -o "$archive"
curl -fsSL "https://github.com/livekit/livekit/releases/download/v${version}/checksums.txt" -o checksums.txt
grep " $archive$" checksums.txt | sha256sum -c -
tar -xzf "$archive" livekit-server
rm -f "$archive"
