#!/bin/bash
# A/B intercalado: mesmo cenário de perf.js, alternando o código servido (main × visual-polish) a cada rodada.
# Uso: ab.sh <cenario> <rodadas> <prefixo-saida> [--cpu=4]
SP=/tmp/claude-0/-home-user-Resenhex-The-Better-Discord/42cdefbc-e31e-54b4-9e95-db8465c8646a/scratchpad
scen=$1; n=$2; out=$3; cpu=${4:---cpu=4}
MAIN=$SP/main-wt/discord-clone
POLISH=/home/user/Resenhex-The-Better-Discord/discord-clone
cd $SP/tools
for i in $(seq 1 $n); do
  for v in main polish; do
    app=$MAIN; [ $v = polish ] && app=$POLISH
    $SP/tools/srv.sh start main 3000 $app > /dev/null
    sleep 1
    node perf.js $SP/seed-out.json $out-$v.json $scen --rodadas=1 $cpu | grep -v "^\s*{" | sed "s/^/[$v] /"
  done
done
$SP/tools/srv.sh start main 3000 $POLISH
