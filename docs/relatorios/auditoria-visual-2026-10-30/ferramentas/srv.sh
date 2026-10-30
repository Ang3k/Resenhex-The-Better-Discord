#!/bin/bash
# srv.sh start|stop|reset <nome> <porta> [pasta-do-app]
SP=/tmp/claude-0/-home-user-Resenhex-The-Better-Discord/42cdefbc-e31e-54b4-9e95-db8465c8646a/scratchpad
cmd=$1; name=$2; port=$3; app=${4:-/home/user/Resenhex-The-Better-Discord/discord-clone}
dir=$SP/srv-$name
portpid() { lsof -t -iTCP:$port -sTCP:LISTEN 2>/dev/null | head -1; }
stop() {
  for i in 1 2 3 4 5 6 7 8 9 10; do
    p=$(portpid); [ -z "$p" ] && break
    kill $p 2>/dev/null; sleep 0.5
  done
  p=$(portpid); [ -n "$p" ] && kill -9 $p 2>/dev/null
  rm -f $dir/pid
}
if [ "$cmd" = stop ]; then stop; echo "parado $port"; exit 0; fi
stop
if [ "$cmd" = reset ]; then rm -rf $dir; fi
mkdir -p $dir/uploads
( cd "$app" && DATA_FILE=$dir/data.json UPLOAD_DIR=$dir/uploads PORT=$port exec setsid node server.js ) > "$dir/server.log" 2>&1 < /dev/null &
for i in $(seq 1 40); do sleep 0.5; p=$(portpid); if [ -n "$p" ]; then echo $p > $dir/pid; echo "up $port pid $p ($app)"; exit 0; fi; done
echo "falhou"; tail -5 $dir/server.log
