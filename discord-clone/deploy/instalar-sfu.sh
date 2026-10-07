#!/usr/bin/env bash
# Called by instalar-vps.sh when RESENHEX_ENABLE_SFU=1, or to keep an existing SFU.
set -euo pipefail
version=1.13.8
case "$(uname -m)" in aarch64|arm64) architecture=arm64 ;; x86_64) architecture=amd64 ;; *) echo 'Arquitetura SFU não suportada'; exit 1 ;; esac
umask 077
configuration=/etc/resenhex-livekit.env
if [ ! -f "$configuration" ]; then
  api_key="$(openssl rand -hex 12)"
  api_secret="$(openssl rand -hex 32)"
  cat > "$configuration" <<EOF
LIVEKIT_URL=wss://$DOMAIN
LIVEKIT_INTERNAL_URL=http://127.0.0.1:7880
LIVEKIT_API_KEY=$api_key
LIVEKIT_API_SECRET=$api_secret
EOF
fi
api_key="$(sed -n 's/^LIVEKIT_API_KEY=//p' "$configuration")"
api_secret="$(sed -n 's/^LIVEKIT_API_SECRET=//p' "$configuration")"
[[ "$api_key" =~ ^[a-zA-Z0-9]+$ && "$api_secret" =~ ^[a-zA-Z0-9]+$ ]] || { echo 'Credenciais SFU inválidas'; exit 1; }
sed -i "s|^LIVEKIT_URL=.*|LIVEKIT_URL=wss://$DOMAIN|" "$configuration"
directory="$(mktemp -d)"
trap 'rm -rf "$directory"' EXIT
archive="livekit_${version}_linux_${architecture}.tar.gz"
curl -fsSL "https://github.com/livekit/livekit/releases/download/v${version}/$archive" -o "$directory/$archive"
curl -fsSL "https://github.com/livekit/livekit/releases/download/v${version}/checksums.txt" -o "$directory/checksums.txt"
(cd "$directory"; grep " $archive$" checksums.txt | sha256sum -c -; tar -xzf "$archive" livekit-server)
install -m 755 "$directory/livekit-server" /usr/local/bin/resenhex-livekit
printf 'net.core.rmem_max=5000000\nnet.core.wmem_max=5000000\n' > /etc/sysctl.d/60-resenhex-media.conf
sysctl -p /etc/sysctl.d/60-resenhex-media.conf >/dev/null
id resenhex-media >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin resenhex-media
install -d -m 750 -o root -g resenhex-media /etc/resenhex-media
cat > /etc/resenhex-media/livekit.yaml <<EOF
port: 7880
bind_addresses: [127.0.0.1]
rtc:
  tcp_port: 7881
  udp_port: 7882
  node_ip: $PUBLIC_IP
  use_external_ip: false
  turn_servers:
    - host: $DOMAIN
      port: 3478
      protocol: udp
      username: $TURN_USERNAME
      credential: $TURN_CREDENTIAL
    - host: $DOMAIN
      port: 3478
      protocol: tcp
      username: $TURN_USERNAME
      credential: $TURN_CREDENTIAL
keys:
  $api_key: $api_secret
webhook:
  api_key: $api_key
  urls: [http://127.0.0.1:3000/api/media/webhook]
logging:
  level: warn
EOF
chown root:resenhex-media /etc/resenhex-media/livekit.yaml
chmod 640 /etc/resenhex-media/livekit.yaml
cat > /etc/systemd/system/resenhex-livekit.service <<'EOF'
[Unit]
Description=Resenhex media SFU (LiveKit)
After=network-online.target
Wants=network-online.target
[Service]
User=resenhex-media
Group=resenhex-media
ExecStart=/usr/local/bin/resenhex-livekit --config /etc/resenhex-media/livekit.yaml
Restart=on-failure
RestartSec=3
LimitNOFILE=65536
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now resenhex-livekit
systemctl restart resenhex-livekit
