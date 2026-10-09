#!/usr/bin/env bash
# Instala (ou atualiza) o Resenhex num servidor Linux na nuvem (VPS), para ficar online 24h.
# Testado para Ubuntu 22.04/24.04 e Debian 12.
#
# Uso, dentro da pasta do Resenhex no servidor:
#   sudo bash deploy/instalar-vps.sh
# Em uma instância Ubuntu da Oracle Cloud:
#   sudo bash deploy/instalar-vps.sh --oracle
#
# O que ele faz:
#   - instala Node.js, Caddy (HTTPS automático) e coturn (servidor TURN para a voz)
#   - copia o app para /opt/resenhex e guarda os dados em /var/lib/resenhex
#   - cria o serviço "resenhex", que liga sozinho e volta se cair
#   - libera no firewall só o necessário
# Rodar de novo atualiza o app e mantém contas, servidores, mensagens e configurações de voz.
set -euo pipefail
case "${1:-}" in
  ''|--oracle) ;;
  *) echo "Opção desconhecida: $1"; exit 1 ;;
esac

APP_SRC="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR=/opt/resenhex
DATA_DIR=/var/lib/resenhex
ENV_FILE=/etc/resenhex.env
TURN_MIN_PORT=49160
TURN_MAX_PORT=49200

say() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
read_env() { sed -n "s/^${1}=//p" "$ENV_FILE" | tail -n 1; }
[ "$(id -u)" = 0 ] || { echo "Rode com sudo: sudo bash deploy/instalar-vps.sh"; exit 1; }
[ -f "$APP_SRC/server.js" ] || { echo "Não achei server.js em $APP_SRC. Rode o script de dentro da pasta do Resenhex."; exit 1; }
command -v apt-get >/dev/null || { echo "Este script é para Ubuntu/Debian."; exit 1; }
export DEBIAN_FRONTEND=noninteractive

# ---------- configuração (só pergunta na primeira vez) ----------
if [ -f "$ENV_FILE" ]; then
  say "Instalação existente encontrada: atualizando e mantendo as configurações"
  DOMAIN="$(read_env RESENHEX_DOMAIN)"
  PUBLIC_IP="$(read_env PUBLIC_IP)"
  TURN_USERNAME="$(read_env TURN_USERNAME)"
  TURN_CREDENTIAL="$(read_env TURN_CREDENTIAL)"
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
  echo "Se você tem um domínio (ex.: resenha.seudominio.com), aponte ele para $PUBLIC_IP e digite abaixo."
  read -rp "Domínio (Enter para usar um endereço gratuito automático): " DOMAIN
  DOMAIN="${DOMAIN:-$(echo "$PUBLIC_IP" | tr . -).sslip.io}"
  TURN_USERNAME=resenhex
  TURN_CREDENTIAL="$(od -An -N24 -tx1 /dev/urandom | tr -d '[:space:]')"
fi

# Troca de domínio (ex.: RESENHEX_SET_DOMAIN=resenhex.dev). O domínio precisa já apontar
# para este servidor; senão o HTTPS falharia e o site sairia do ar.
FREE_DOMAIN="$(echo "$PUBLIC_IP" | tr . -).sslip.io"
if [ -n "${RESENHEX_SET_DOMAIN:-}" ]; then
  NEW_DOMAIN="$(echo "$RESENHEX_SET_DOMAIN" | tr 'A-Z' 'a-z')"
  if [ "$NEW_DOMAIN" != "$FREE_DOMAIN" ]; then
    RESOLVED="$(getent ahostsv4 "$NEW_DOMAIN" 2>/dev/null | awk '{ print $1 }' | sort -u | tr '\n' ' ')"
    if [[ " $RESOLVED" != *" $PUBLIC_IP "* ]]; then
      echo "O domínio $NEW_DOMAIN ainda não aponta para $PUBLIC_IP (aponta para: ${RESOLVED:-nada})."
      echo "Crie o registro A no painel do domínio, espere alguns minutos e rode de novo. Nada foi alterado."
      exit 1
    fi
  fi
  DOMAIN="$NEW_DOMAIN"
fi

# Apenas valores validados entram nos arquivos de Caddy, coturn e systemd.
[[ "$PUBLIC_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "IP inválido: $PUBLIC_IP"; exit 1; }
IFS='.' read -ra IP_OCTETS <<< "$PUBLIC_IP"
for octet in "${IP_OCTETS[@]}"; do
  [ "$octet" -le 255 ] || { echo "IP inválido: $PUBLIC_IP"; exit 1; }
done
[ "${#DOMAIN}" -le 253 ] && [[ "$DOMAIN" == *.* && "$DOMAIN" != .* && "$DOMAIN" != *. && "$DOMAIN" != *..* ]] || { echo "Domínio inválido."; exit 1; }
IFS='.' read -ra DOMAIN_LABELS <<< "$DOMAIN"
for label in "${DOMAIN_LABELS[@]}"; do
  [[ "$label" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$ ]] || { echo "Domínio inválido."; exit 1; }
done
[[ "$TURN_USERNAME" =~ ^[A-Za-z0-9_-]+$ && "$TURN_CREDENTIAL" =~ ^[A-Za-z0-9]+$ ]] || { echo "Credenciais TURN inválidas."; exit 1; }

umask 077
cat > "$ENV_FILE" <<EOF
# Configuração do Resenhex (gerada por deploy/instalar-vps.sh)
RESENHEX_DOMAIN=$DOMAIN
PUBLIC_IP=$PUBLIC_IP
PORT=3000
HOST=127.0.0.1
DATA_FILE=$DATA_DIR/data.json
UPLOAD_DIR=$DATA_DIR/uploads
DOWNLOAD_DIR=$DATA_DIR/downloads
TRUST_PROXY=1
TURN_URL=turn:$DOMAIN:3478?transport=udp,turn:$DOMAIN:3478?transport=tcp
TURN_USERNAME=$TURN_USERNAME
TURN_CREDENTIAL=$TURN_CREDENTIAL
EOF
chmod 600 "$ENV_FILE"
umask 022

# ---------- pacotes ----------
say "Instalando pacotes (Node.js, Caddy, coturn)"
# O repositório do Caddy no Cloudsmith passou a responder 402 (outubro de 2026) e derrubava o
# apt-get update. O Caddy agora vem do próprio Ubuntu (universe); a fonte antiga sai do apt.
rm -f /etc/apt/sources.list.d/caddy-stable.list
apt-get update -q
apt-get install -y -q curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https coturn rsync >/dev/null

NODE_MAJOR="$(node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/' || echo 0)"
if [ "${NODE_MAJOR:-0}" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -q nodejs >/dev/null
fi

if ! command -v caddy >/dev/null; then
  apt-get install -y -q caddy >/dev/null
fi

# ---------- app ----------
say "Copiando o Resenhex para $APP_DIR"
id resenhex >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin resenhex
install -d -o resenhex -g resenhex -m 750 "$DATA_DIR" "$DATA_DIR/uploads"
# Instalador e atualizações do app de Windows (enviados por deploy/publicar-app.ps1).
install -d -o resenhex -g resenhex -m 755 "$DATA_DIR/downloads"
install -d "$APP_DIR"
if [ "$APP_SRC" != "$APP_DIR" ]; then
  rsync -a --delete --exclude node_modules --exclude 'data.json*' --exclude uploads --exclude downloads --exclude desktop --exclude 'public/games/minecraft/assets' --exclude '*.log' "$APP_SRC/" "$APP_DIR/"
fi
cd "$APP_DIR"
npm ci --omit=dev --no-audit --no-fund --loglevel=error
# O cliente do Minecraft é baixado à parte; se o download falhar, o resto do site continua sendo atualizado.
node tools/prepare-minecraft.js || say "Minecraft: não foi possível preparar o cliente agora; o restante do Resenhex segue normal."

cat > /etc/systemd/system/resenhex.service <<EOF
[Unit]
Description=Resenhex
After=network-online.target
Wants=network-online.target

[Service]
User=resenhex
Group=resenhex
EnvironmentFile=$ENV_FILE
EnvironmentFile=-/etc/resenhex-livekit.env
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
if [ "${RESENHEX_ENABLE_SFU:-0}" = 1 ] || [ -f /etc/resenhex-livekit.env ]; then
  export DOMAIN PUBLIC_IP TURN_USERNAME TURN_CREDENTIAL
  bash "$APP_SRC/deploy/instalar-sfu.sh"
fi
say "Configurando HTTPS para $DOMAIN"
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
EOF
# Com domínio próprio, o endereço gratuito antigo continua funcionando e redireciona para o novo.
if [ -f /etc/resenhex-livekit.env ]; then
  sed -i '/encode gzip/a\	handle /rtc* {\n\t\treverse_proxy 127.0.0.1:7880\n\t}' /etc/caddy/Caddyfile
  sed -i 's/^\treverse_proxy 127.0.0.1:3000/\thandle {\n\t\treverse_proxy 127.0.0.1:3000\n\t}/' /etc/caddy/Caddyfile
fi
if [ "$DOMAIN" != "$FREE_DOMAIN" ]; then
  cat >> /etc/caddy/Caddyfile <<EOF

$FREE_DOMAIN {
	redir https://$DOMAIN{uri} permanent
}
EOF
fi

# ---------- Minecraft: origem separada, sem autenticação ou Socket.IO ----------
GAME_DOMAIN="minecraft.$DOMAIN"
if getent ahostsv4 "$GAME_DOMAIN" | awk '{ print $1 }' | grep -Fxq "$PUBLIC_IP"; then
  cat >> /etc/caddy/Caddyfile <<EOF

$GAME_DOMAIN {
  encode gzip
  handle /games/minecraft/* {
    reverse_proxy 127.0.0.1:3000
  }
  handle {
    respond "Not found" 404
  }
}
EOF
else
  say "Para habilitar Minecraft online, aponte $GAME_DOMAIN para $PUBLIC_IP e execute novamente o instalador."
fi

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
# Preserva o acesso SSH mesmo quando o VPS usa outra porta.
ssh_ports=(22)
if [ -n "${SSH_CONNECTION:-}" ]; then
  read -r _ _ _ ssh_port <<< "$SSH_CONNECTION"
  if [[ "$ssh_port" =~ ^[0-9]+$ ]] && [ "$ssh_port" -ge 1 ] && [ "$ssh_port" -le 65535 ]; then
    ssh_ports+=("$ssh_port")
  fi
fi
if command -v sshd >/dev/null; then
  while read -r ssh_port; do
    if [[ "$ssh_port" =~ ^[0-9]+$ ]] && [ "$ssh_port" -ge 1 ] && [ "$ssh_port" -le 65535 ]; then
      ssh_ports+=("$ssh_port")
    fi
  done < <(sshd -T 2>/dev/null | awk '$1 == "port" { print $2 }')
fi
if [ "${1:-}" = '--oracle' ] || [ "${RESENHEX_CLOUD:-}" = 'oracle' ] || \
   { [ -f /etc/iptables/rules.v4 ] && grep -q '169\.254\.0\.2' /etc/iptables/rules.v4; } || \
   curl -fsS --noproxy '*' --max-time 2 -H 'Authorization: Bearer Oracle' \
     http://169.254.169.254/opc/v2/instance/ -o /dev/null 2>/dev/null; then
  # Oracle Ubuntu precisa manter as regras iSCSI da imagem. Ativar UFW pode impedir o boot.
  command -v iptables >/dev/null && command -v iptables-save >/dev/null && \
    command -v netfilter-persistent >/dev/null && \
    [ -f /etc/iptables/rules.v4 ] || { echo 'Regras iptables da Oracle não encontradas; firewall não alterado.'; exit 1; }
  if [ ! -e /etc/iptables/rules.v4.resenhex-backup ]; then
    cp -a /etc/iptables/rules.v4 /etc/iptables/rules.v4.resenhex-backup
  fi
  allow_oci_port() {
    if ! iptables -C INPUT -p "$1" --dport "$2" -j ACCEPT 2>/dev/null; then
      iptables -I INPUT 1 -p "$1" --dport "$2" -j ACCEPT
    fi
  }
  for ssh_port in "${ssh_ports[@]}"; do allow_oci_port tcp "$ssh_port"; done
  allow_oci_port tcp 80
  allow_oci_port tcp 443
  allow_oci_port udp 443
  allow_oci_port tcp 3478
  allow_oci_port udp 3478
  allow_oci_port udp "$TURN_MIN_PORT:$TURN_MAX_PORT"
  if [ -f /etc/resenhex-livekit.env ]; then allow_oci_port tcp 7881; allow_oci_port udp 7882; fi
  netfilter-persistent save >/dev/null
  systemctl enable netfilter-persistent >/dev/null
else
  apt-get install -y -q ufw >/dev/null
  for ssh_port in "${ssh_ports[@]}"; do ufw allow "$ssh_port/tcp" >/dev/null; done
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow 443/udp >/dev/null
  ufw allow 3478 >/dev/null
  ufw allow "$TURN_MIN_PORT:$TURN_MAX_PORT/udp" >/dev/null
  if [ -f /etc/resenhex-livekit.env ]; then ufw allow 7881/tcp >/dev/null; ufw allow 7882/udp >/dev/null; fi
  ufw --force enable >/dev/null
fi

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

   Endereço do site:  https://$DOMAIN

 Entre primeiro e crie SUA conta (se o servidor for novo,
 a primeira conta vira a dona).
 Para chamar os amigos, abra o menu do seu servidor,
 escolha "Convidar amigos" e copie o link de convite.

 O certificado HTTPS pode levar 1 minuto na primeira vez.

 Comandos úteis:
   ver o que está acontecendo:  journalctl -u resenhex -f
   reiniciar:                   sudo systemctl restart resenhex
   atualizar: copie a pasta nova e rode este script de novo
   dados (faça backup):         $DATA_DIR
   app de Windows:              https://$DOMAIN/baixar
============================================================
EOF
