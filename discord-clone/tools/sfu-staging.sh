#!/usr/bin/env bash
# Isolated, loopback-only SFU for SSH-tunnel validation. No production services.
set -euo pipefail
umask 077
version=1.13.8
directory="$HOME/.cache/resenhex-sfu-qa"
mkdir -p "$directory"
cd "$directory"
archive="livekit_${version}_linux_arm64.tar.gz"
if [ ! -x livekit-server ]; then
  curl -fsSL "https://github.com/livekit/livekit/releases/download/v${version}/$archive" -o "$archive"
  curl -fsSL "https://github.com/livekit/livekit/releases/download/v${version}/checksums.txt" -o checksums.txt
  grep " $archive$" checksums.txt | sha256sum -c -
  tar -xzf "$archive" livekit-server
fi
qa_ip="${QA_PUBLIC_IP:-127.0.0.1}"
qa_udp="${QA_UDP_PORT:-17882}"
[[ "$qa_ip" =~ ^[0-9.]+$ && "$qa_udp" =~ ^[0-9]+$ ]] || exit 1
turn_config=''
if [ "${QA_USE_TURN:-0}" = 1 ]; then
  turn_domain="$(sudo sed -n 's/^RESENHEX_DOMAIN=//p' /etc/resenhex.env | tail -n 1)"
  turn_user="$(sudo sed -n 's/^TURN_USERNAME=//p' /etc/resenhex.env | tail -n 1)"
  turn_secret="$(sudo sed -n 's/^TURN_CREDENTIAL=//p' /etc/resenhex.env | tail -n 1)"
  turn_config="  turn_servers:
    - host: $turn_domain
      port: 3478
      protocol: udp
      username: $turn_user
      credential: $turn_secret
    - host: $turn_domain
      port: 3478
      protocol: tcp
      username: $turn_user
      credential: $turn_secret"
fi
cat > livekit.yaml <<EOF
port: 17880
bind_addresses: [127.0.0.1]
rtc:
  tcp_port: 17881
  udp_port: $qa_udp
  node_ip: $qa_ip
  use_external_ip: false
  enable_loopback_candidate: true
$turn_config
keys:
  qa-only: qa-only-secret-not-for-production-1234567890
logging:
  level: warn
EOF
chmod 600 livekit.yaml
exec ./livekit-server --config livekit.yaml
