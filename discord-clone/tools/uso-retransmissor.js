// Uso do retransmissor (coturn) por dia, a partir do log dele (verbose, deploy/instalar-vps.sh). Fase 5 do
// docs/planos/PLANO-5000-ONLINE-2026-10-24.md: quantas ligações passam por ele e quantos GB por dia. No servidor:
//   sudo journalctl -u coturn --since "7 days ago" -o short-iso | node /opt/resenhex/tools/uso-retransmissor.js
// O coturn escreve, de tempos em tempos, quanto cada sessão recebeu e mandou desde a linha anterior: "usage" é o
// lado de quem está no Resenhex, "peer usage" o da outra ponta. O que sai do servidor (e conta nos 10 TB grátis
// da Oracle) é o "sb" das duas. O usuário de cada senha é "<vencimento>:<conta>" (server/turn.js).
const LINE = /^(\d{4}-\d{2}-\d{2})\S*\s.*session (\d+): (peer )?usage: realm=<[^>]*>, username=<([^>]*)>, rp=(\d+), rb=(\d+), sp=(\d+), sb=(\d+)/;

function summarize(text) {
  const days = new Map();
  const accounts = new Map();
  for (const line of text.split('\n')) {
    const match = LINE.exec(line);
    if (!match) continue;
    const [, date, session, , username, , received, , sent] = match;
    const account = username.includes(':') ? username.slice(username.indexOf(':') + 1) : username;
    let day = days.get(date);
    if (!day) days.set(date, day = { date, sentBytes: 0, receivedBytes: 0, sessions: new Set(), accounts: new Set() });
    day.sentBytes += Number(sent);
    day.receivedBytes += Number(received);
    day.sessions.add(session);
    day.accounts.add(account);
    accounts.set(account, (accounts.get(account) || 0) + Number(sent));
  }
  return {
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
      .map((day) => ({ date: day.date, sentGB: day.sentBytes / 1e9, receivedGB: day.receivedBytes / 1e9, sessions: day.sessions.size, accounts: day.accounts.size })),
    top: [...accounts].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([account, bytes]) => ({ account, sentGB: bytes / 1e9 })),
  };
}

function report({ days, top }) {
  if (!days.length) return 'Nenhuma linha de uso do coturn. O log precisa do "verbose" (deploy/instalar-vps.sh).';
  const gb = (value) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' GB';
  const lines = days.map((day) => `${day.date}  enviou ${gb(day.sentGB)} · recebeu ${gb(day.receivedGB)} · ${day.sessions} sessões · ${day.accounts} contas`);
  const sent = days.reduce((sum, day) => sum + day.sentGB, 0);
  lines.push('', `Média: ${gb(sent / days.length)} enviados por dia; num mês de 30 dias, ~${gb(sent / days.length * 30)}.`);
  lines.push('Contas que mais usaram:', ...top.map((item) => `  ${item.account}: ${gb(item.sentGB)}`));
  return lines.join('\n');
}

module.exports = { summarize, report };

if (require.main === module) {
  let text = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { text += chunk; });
  process.stdin.on('end', () => console.log(report(summarize(text))));
}
