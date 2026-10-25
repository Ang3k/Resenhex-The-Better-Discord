#!/usr/bin/env bash
# Prepara o servidor para voltar a uma versão anterior (chamado por deploy/voltar-versao.ps1, como root, no servidor).
#   sudo bash preparar-volta.sh [--json] [--turn-antigo]
# --json: a versão de destino não tem o banco SQLite (até a 1.9.0). Desliga o site e grava o data.db como data.json,
#   com a ferramenta da versão que está no ar. O data.db fica onde está; se esta versão voltar, ela importa o
#   data.json de novo.
# --turn-antigo: o instalador da versão de destino usa uma senha fixa no retransmissor, só com letras e números, e
#   recusaria a do instalador novo. Troca por uma senha fixa nova e desliga a trava do teto de rede, que a versão
#   antiga não conhece (a publicação seguinte de uma versão nova liga de novo).
set -euo pipefail
DATA_DIR=/var/lib/resenhex
APP_DIR=/opt/resenhex
ENV_FILE=/etc/resenhex.env
json=0
turn=0
for arg in "$@"; do
  case "$arg" in
    --json) json=1 ;;
    --turn-antigo) turn=1 ;;
    *) echo "Opção desconhecida: $arg"; exit 2 ;;
  esac
done

if [ "$json" = 1 ]; then
  systemctl stop resenhex
  if [ -f "$DATA_DIR/data.json" ]; then
    echo "O data.json já existe (o banco novo não chegou a importar): fica como está."
  else
    runuser -u resenhex -- node --no-warnings "$APP_DIR/tools/banco-para-json.js" "$DATA_DIR/data.db" "$DATA_DIR/data.json"
  fi
fi
if [ "$turn" = 1 ]; then
  credential="$(od -An -N24 -tx1 /dev/urandom | tr -d '[:space:]')"
  sed -i -e '/^TURN_USERNAME=/d' -e '/^TURN_CREDENTIAL=/d' "$ENV_FILE"
  printf 'TURN_USERNAME=resenhex\nTURN_CREDENTIAL=%s\n' "$credential" >> "$ENV_FILE"
  systemctl disable --now resenhex-retransmissor.path >/dev/null 2>&1 || true
fi
