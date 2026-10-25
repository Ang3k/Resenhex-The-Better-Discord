#!/usr/bin/env bash
# Backup dos dados antes de cada publicação (chamado por deploy/atualizar-oracle.ps1, como root, no servidor).
#   sudo bash backup-banco.sh <carimbo>
# - data.db (SQLite): cópia consistente com o site ligado (VACUUM INTO, pelo node), comprimida.
# - data.json: só existe até a primeira publicação com o SQLite, que importa e renomeia o arquivo.
# - uploads: cópia incremental (rsync). Os uploads têm o hash no nome e nunca mudam: só os novos viajam, e os
#   que o site apagou ficam na cópia.
# Só o root lê os backups.
set -euo pipefail
STAMP="${1:?informe o carimbo do backup}"
DATA_DIR=/var/lib/resenhex
DEST=/var/backups/resenhex
umask 077
install -d -m 700 "$DEST"

if [ -f "$DATA_DIR/data.db" ]; then
  # Uma conexão a mais no banco, só para ler: o site continua gravando no -wal enquanto a cópia é feita.
  node --no-warnings -e '
    const { DatabaseSync } = require("node:sqlite");
    const [file, dest] = process.argv.slice(1);
    const db = new DatabaseSync(file);
    db.exec("PRAGMA busy_timeout = 10000");
    db.prepare("VACUUM INTO ?").run(dest);
    db.close();
  ' "$DATA_DIR/data.db" "$DEST/data-before-$STAMP.db"
  gzip "$DEST/data-before-$STAMP.db"
  echo "Banco: $DEST/data-before-$STAMP.db.gz"
fi
if [ -f "$DATA_DIR/data.json" ]; then
  tar -czf "$DEST/data-before-$STAMP.tar.gz" -C "$DATA_DIR" data.json
  echo "Banco antigo: $DEST/data-before-$STAMP.tar.gz"
fi
rsync -a "$DATA_DIR/uploads/" "$DEST/uploads/"
