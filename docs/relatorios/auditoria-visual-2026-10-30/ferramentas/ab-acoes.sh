#!/bin/bash
# A/B por ação: probe-acao.js em main e visual-polish, alternando duas vezes. Saída: uma linha JSON por rodada.
SP=/tmp/claude-0/-home-user-Resenhex-The-Better-Discord/42cdefbc-e31e-54b4-9e95-db8465c8646a/scratchpad
out=$1; reps=${2:-8}
cd $SP/tools
for rep in 1 2; do
  for v in main polish; do
    app=/home/user/Resenhex-The-Better-Discord/discord-clone; [ $v = main ] && app=$SP/main-wt/discord-clone
    ./srv.sh start main 3000 $app > /dev/null; sleep 1
    for a in emoji memes servidor menus; do
      line=$(timeout 300 node probe-acao.js $SP/seed-out.json $a $reps | head -1)
      echo "{\"versao\":\"$v\",\"dados\":$line}" >> $out
    done
  done
done
./srv.sh start main 3000 > /dev/null
