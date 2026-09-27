#!/usr/bin/env bash
# Sobe o servidor com senha e cria um link HTTPS público via Cloudflare Tunnel.
set -e
cd "$(dirname "$0")"

command -v node >/dev/null || { echo "Instale o Node.js LTS em https://nodejs.org"; exit 1; }
command -v cloudflared >/dev/null || {
  echo "Instale o cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  echo "(Mac: brew install cloudflared)"
  exit 1
}
npm install --no-audit --no-fund --loglevel=error

read -rp "Escolha a senha do servidor (seus amigos usam para criar conta): " ACCESS_PASSWORD
[ -n "$ACCESS_PASSWORD" ] || { echo "A senha não pode ser vazia."; exit 1; }
export ACCESS_PASSWORD

npm start &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT
sleep 2

echo
echo "Procure abaixo o link terminado em .trycloudflare.com e mande para os amigos."
echo "Senha do servidor: $ACCESS_PASSWORD  |  Você entra por http://localhost:3000"
echo "Crie SUA conta primeiro: a primeira conta vira dona do servidor."
echo "Ctrl+C para desligar."
echo
cloudflared tunnel --url http://localhost:3000
