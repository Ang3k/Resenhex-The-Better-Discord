#!/usr/bin/env bash
# Instala (ou atualiza) o Resenhex num servidor Linux na nuvem (VPS), para ficar online 24h.
# Testado para Ubuntu 22.04/24.04 e Debian 12.
#
# Uso, dentro da pasta do Resenhex no servidor:
#   sudo bash deploy/instalar-vps.sh
#
# O que ele faz:
#   - instala Node.js, Caddy (HTTPS automático) e coturn (servidor TURN para a voz)
#   - copia o app para /opt/resenhex e guarda os dados em /var/lib/resenhex
#   - cria o serviço "resenhex", que liga sozinho e volta se cair
#   - libera no firewall só o necessário
# Rodar de novo atualiza o app e mantém contas, mensagens e a senha do servidor.
set -euo pipefail

APP_SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR=/opt/resenhex
DATA_DIR=/var/lib/resenhex
ENV_FILE=/etc/resenhex.env
TURN_MIN_PORT=49160
TURN_MAX_PORT=49200

say() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Rode com sudo: sudo bash deploy/instalar-vps.sh"; exit 1; }
[ -f "$APP_SRC/server.js" ] || { echo "Não achei server.js em $APP_SRC. Rode o script de dentro da pasta do Resenhex."; exit 1; }
command -v apt-get >/dev/null || { echo "Este script é para Ubuntu/Debian."; exit 1; }
export DEBIAN_FRONTEND=noninteractive

# ---------- configuração (só pergunta na primeira vez) ----------
if [ -f "$ENV_FILE" ]; then
  say "Instalação existente encontrada: atualizando e mantendo as configurações"
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  DOMAIN="${RESENHEX_DOMAIN:?}"
else
  apt-get update -q
  apt-get install -y -q curl ca-certificates >/dev/null
  # IP público: pergunta a serviços externos; se falharem, usa o IP da placa de rede; por último, pergunta.
  PUBLIC_IP="$(curl -fsS4 --max-time 10 https://api.ipify.org 2>/dev/null || curl -fsS4 --max-time 10 https://icanhazip.com 2>/dev/null || true)"
  PUBLIC_IP="$(echo "$PUBLIC_IP" | tr -d '[:space:]')"
  if ! [[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    PUBLIC_IP="$( (ip -4 route get 1.1.1.1 2>/dev/null || true) | sed -n 's/.* src \([0-9.]*\).*/\1/p')"
    read -rp "IP público deste servidor [$PUBLIC_IP]: " typed
    PUBLIC_IP="${typed:-$PUBLIC_IP}"
  fi
  [[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "IP inválido: $PUBLIC_IP"; exit 1; }
  echo
  read -rp "Senha do servidor (seus amigos usam para criar conta): " ACCESS_PASSWORD
  [ -n "$ACCESS_PASSWORD" ] || { echo "A senha não pode ser vazia."; exit 1; }
  echo "Se você tem um domínio (ex.: resenha.seudominio.com), aponte ele para $PUBLIC_IP e digite abaixo."
  read -rp "Domínio (Enter para usar um endereço gratuito automático): " DOMAIN
  DOMAIN="${DOMAIN:-$(echo "$PUBLIC_IP" | tr . -).sslip.io}"
  TURN_USERNAME=resenhex
  TURN_CREDENTIAL="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)"
  umask 077
  cat > "$ENV_FILE" <<EOF
# Configuração do Resenhex (gerada por deploy/instalar-vps.sh)
RESENHEX_DOMAIN=$DOMAIN
PUBLIC_IP=$PUBLIC_IP
PORT=3000
ACCESS_PASSWORD=$ACCESS_PASSWORD
DATA_FILE=$DATA_DIR/data.json
UPLOAD_DIR=$DATA_DIR/uploads
TRUST_PROXY=1
TURN_URL=turn:$DOMAIN:3478?transport=udp,turn:$DOMAIN:3478?transport=tcp
TURN_USERNAME=$TURN_USERNAME
TURN_CREDENTIAL=$TURN_CREDENTIAL
EOF
  umask 022
  # shellcheck disable=SC1090
  . "$ENV_FILE"
fi

# ---------- pacotes ----------
say "Instalando pacotes (Node.js, Caddy, coturn)"
apt-get update -q
apt-get install -y -q curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https ufw coturn rsync >/dev/null

NODE_MAJOR="$(node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/' || echo 0)"
if [ "${NODE_MAJOR:-0}" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -q nodejs >/dev/null
fi

if ! command -v caddy >/dev/null; then
  curl -1sSLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sSLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy >/dev/null
fi

# ---------- app ----------
say "Copiando o Resenhex para $APP_DIR"
id resenhex >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin resenhex
install -d -o resenhex -g resenhex -m 750 "$DATA_DIR" "$DATA_DIR/uploads"
install -d "$APP_DIR"
if [ "$APP_SRC" != "$APP_DIR" ]; then
  rsync -a --delete --exclude node_modules --exclude 'data.json*' --exclude uploads --exclude '*.log' "$APP_SRC/" "$APP_DIR/"
fi
cd "$APP_DIR"
npm ci --omit=dev --no-audit --no-fund --loglevel=error

cat > /etc/systemd/system/resenhex.service <<EOF
[Unit]
Description=Resenhex
After=network-online.target
Wants=network-online.target

[Service]
User=resenhex
Group=resenhex
EnvironmentFile=$ENV_FILE
WorkingDirectory=$APP_DIR
ExecStart=$(command -v node) $APP_DIR/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF

# ---------- HTTPS ----------
say "Configurando HTTPS para $DOMAIN"
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
EOF

# ---------- TURN (voz para quem está em rede restrita, 4G etc.) ----------
say "Configurando o servidor TURN"
cat > /etc/turnserver.conf <<EOF
listening-port=3478
fingerprint
lt-cred-mech
user=$TURN_USERNAME:$TURN_CREDENTIAL
realm=$DOMAIN
external-ip=$PUBLIC_IP
min-port=$TURN_MIN_PORT
max-port=$TURN_MAX_PORT
no-cli
no-tls
no-dtls
no-multicast-peers
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
EOF
sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn 2>/dev/null || echo 'TURNSERVER_ENABLED=1' > /etc/default/coturn

# ---------- firewall ----------
say "Liberando portas no firewall"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw allow 3478 >/dev/null
ufw allow "$TURN_MIN_PORT:$TURN_MAX_PORT/udp" >/dev/null
ufw --force enable >/dev/null

# ---------- liga tudo ----------
say "Iniciando os serviços"
systemctl daemon-reload
systemctl enable --now coturn >/dev/null 2>&1 || true
systemctl restart coturn
systemctl enable resenhex >/dev/null
systemctl restart resenhex
systemctl restart caddy

for _ in $(seq 1 20); do
  curl -fsS -o /dev/null http://127.0.0.1:3000/config && break
  sleep 1
done
if ! curl -fsS -o /dev/null http://127.0.0.1:3000/config; then
  echo "O Resenhex não respondeu. Veja o erro com: journalctl -u resenhex -n 50"
  exit 1
fi

cat <<EOF

============================================================
 Resenhex online!

   Link para mandar aos amigos:  https://$DOMAIN
   Senha do servidor:            $ACCESS_PASSWORD

 Entre primeiro e crie SUA conta (se o servidor for novo,
 a primeira conta vira a dona).

 O certificado HTTPS pode levar 1 minuto na primeira vez.

 Comandos úteis:
   ver o que está acontecendo:  journalctl -u resenhex -f
   reiniciar:                   sudo systemctl restart resenhex
   atualizar: copie a pasta nova e rode este script de novo
   dados (faça backup):         $DATA_DIR
============================================================
EOF
