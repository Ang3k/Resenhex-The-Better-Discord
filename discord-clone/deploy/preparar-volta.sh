#!/usr/bin/env bash
# Prepara o servidor para voltar a uma versão anterior e desfaz tudo se a volta falhar no meio (chamado por
# deploy/voltar-versao.ps1, como root, no servidor).
#   sudo bash preparar-volta.sh --guardar <pasta> [--json] [--turn-antigo]
#   sudo bash preparar-volta.sh --restaurar <pasta>
# --guardar: antes de mexer em qualquer coisa, copia para <pasta> o site instalado, a configuração que os
#   instaladores reescrevem (resenhex.env, coturn, Caddy, unidades do systemd), as permissões da pasta de dados e se
#   a trava do teto de rede está ligada. A cópia só vale com o arquivo "pronta", gravado por último.
# --json: a versão de destino não tem o banco SQLite (até a 1.9.0). Desliga o site e grava o data.db como data.json,
#   com a ferramenta da versão que está no ar. O data.db fica onde está; se esta versão voltar, ela importa o
#   data.json de novo.
# --turn-antigo: o instalador da versão de destino usa uma senha fixa no retransmissor, só com letras e números, e
#   recusaria a do instalador novo. Troca por uma senha fixa nova e desliga a trava do teto de rede, que a versão
#   antiga não conhece (a publicação seguinte de uma versão nova liga de novo).
# --restaurar: a volta falhou. Põe de volta o que foi guardado e religa tudo, sem depender da internet. O data.json
#   do --json fica: a versão restaurada o vê ao lado do banco e importa de novo, com o que a antiga tiver mudado.
#   Sem a cópia pronta, a falha veio antes de qualquer mudança: só religa o site.
set -euo pipefail
# RESENHEX_RAIZ: só no ensaio fora do servidor (todas as pastas ficam embaixo dela).
R="${RESENHEX_RAIZ:-}"
DATA_DIR=$R/var/lib/resenhex
APP_DIR=$R/opt/resenhex
ENV_FILE=$R/etc/resenhex.env
# O que os instaladores reescrevem a cada publicação, a partir da raiz.
CONFIG=(etc/resenhex.env etc/turnserver.conf etc/caddy/Caddyfile etc/systemd/system/resenhex.service
  etc/systemd/system/resenhex-retransmissor.service etc/systemd/system/resenhex-retransmissor.path usr/local/sbin/resenhex-retransmissor)

save_install() {
  local dir=$1 file
  [ ! -e "$dir" ] || { echo "$dir já existe: nada foi feito."; exit 1; }
  install -d -m 700 "$dir"
  cp -a "$APP_DIR" "$dir/app"
  local present=()
  for file in "${CONFIG[@]}"; do [ -e "$R/$file" ] && present+=("$file"); done
  tar -cpf "$dir/config.tar" -C "$R/" "${present[@]}"
  stat -c '%a %n' "$DATA_DIR" "$DATA_DIR/uploads" "$DATA_DIR/downloads" > "$dir/permissoes"
  { systemctl is-enabled resenhex-retransmissor.path 2>/dev/null || true; } > "$dir/trava"
  touch "$dir/pronta"
  echo "Instalação atual guardada em $dir"
}

restore_install() {
  local dir=$1 mode file
  if [ ! -f "$dir/pronta" ]; then
    echo "Sem cópia pronta em $dir: nada foi mexido. Religando o site."
    systemctl start resenhex
    return
  fi
  systemctl stop resenhex || true
  rsync -a --delete "$dir/app/" "$APP_DIR/"
  tar -xpf "$dir/config.tar" -C "$R/"
  while read -r mode file; do chmod "$mode" "$file"; done < "$dir/permissoes"
  systemctl daemon-reload
  if [ "$(cat "$dir/trava")" = enabled ]; then systemctl enable --now resenhex-retransmissor.path; fi
  systemctl restart coturn
  systemctl restart resenhex
  systemctl restart caddy
  echo "Servidor restaurado como estava antes da volta ($dir)."
}

save_dir=''
restore_dir=''
json=0
turn=0
while [ $# -gt 0 ]; do
  case "$1" in
    --guardar) save_dir="${2:?informe a pasta da cópia}"; shift ;;
    --restaurar) restore_dir="${2:?informe a pasta da cópia}"; shift ;;
    --json) json=1 ;;
    --turn-antigo) turn=1 ;;
    *) echo "Opção desconhecida: $1"; exit 2 ;;
  esac
  shift
done

if [ -n "$restore_dir" ]; then
  restore_install "$restore_dir"
  exit 0
fi
[ -n "$save_dir" ] || { echo "Informe --guardar <pasta>."; exit 2; }
save_install "$save_dir"

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
