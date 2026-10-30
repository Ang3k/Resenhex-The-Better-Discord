// Alarmes por e-mail (Fase 7 do docs/planos/PLANO-5000-ONLINE-2026-10-24.md). A cada amostra do medidor de saúde (server/health.js),
// confere as medidas abaixo. Quando uma fica acima do limite por um tempo, o dono do site recebe um e-mail; quando ela
// volta ao normal, outro. Cada alarme manda no máximo um e-mail a cada 6 h: um problema que vai e volta não lota a
// caixa de entrada.
const COOLDOWN_MS = 6 * 3600_000;

// window: quantas amostras (de 10 s) olhar. O alarme liga quando 80% delas passam do limite e desliga quando 80%
// voltam ao normal; no meio, fica como está (uma amostra solta não liga nem desliga nada).
const RULES = [
  { key: 'loop', name: 'servidor lento', window: 30, bad: (p) => p.loopP99 > 100,
    detail: (p) => `O atraso do servidor (p99) passou de 100 ms nos últimos 5 minutos; agora está em ${p.loopP99} ms. Todo mundo sente o site lento.` },
  { key: 'memory', name: 'memória alta', window: 6, bad: (p, t) => p.heapPct > t.heapPct || p.rssMb > t.rssMb,
    detail: (p, t) => `O JavaScript usa ${p.heapPct}% do limite (o alarme é acima de ${t.heapPct}%), e o servidor ${p.rssMb} MB. Perto de 100%, ele cai sem memória.` },
  { key: 'disk', name: 'disco quase cheio', window: 6, bad: (p, t) => p.diskPct > t.diskPct,
    detail: (p) => `O disco está ${p.diskPct}% cheio (${p.diskFreeGB} GB livres). A Oracle deixa aumentar até 200 GB de graça (docs/ESTADO-ATUAL.md).` },
  { key: 'network', name: 'rede do mês acima do ritmo', window: 6, bad: (p) => p.relay === 'paused' || p.relay === 'stopped',
    detail: (p) => `O servidor já mandou ${p.monthGB} GB neste mês, acima do ritmo de hoje (${p.monthPaceGB} GB). ${p.relay === 'stopped' ? 'O retransmissor de chamadas foi parado' : 'O retransmissor de chamadas não recebe gente nova'} até a rede voltar ao ritmo.` },
  // O corte final (server/health.js) tira o site do ar até o mês virar: o aviso vem antes, com 500 GB de folga, e na hora.
  { key: 'nearCut', name: 'rede do mês perto do corte final', window: 6, bad: (p, t) => p.monthGB >= t.monthCutGB - 500 && !p.cut,
    detail: (p, t) => `O servidor já mandou ${p.monthGB} GB neste mês. Com ${t.monthCutGB} GB, o site inteiro sai do ar até o mês virar, para não passar dos 10 TB grátis da Oracle. Se for abuso (alguém baixando sem parar), dá para achar no journal do Caddy.` },
  { key: 'cut', name: 'site fora do ar pelo teto de rede', window: 1, bad: (p) => p.cut,
    detail: (p, t) => `O servidor mandou ${p.monthGB} GB neste mês e chegou ao corte final (${t.monthCutGB} GB): o Caddy e o coturn foram parados, e o site fica fora do ar até o mês virar (dia 1, 0 h UTC). Para religar antes, é preciso aceitar pagar a rede além dos 10 TB (docs/ESTADO-ATUAL.md).` },
  { key: 'ports', name: 'portas do retransmissor', window: 6, bad: (p, t) => p.turnPorts > t.turnPorts,
    detail: (p, t) => `O retransmissor usa ${p.turnPorts} portas (o alarme é acima de ${t.turnPorts}). Quando elas acabam, quem está em rede restrita não entra em chamadas.` },
];

// to(): o endereço de quem recebe (ou null). send({ to, subject, text }): devolve uma promessa (server/mailer.js).
function createAlarms({ to, send, log = console.log, now = Date.now, rules = RULES }) {
  const states = new Map(); // regra -> { on, mailed: o e-mail deste episódio saiu, lastMail }

  function mail(subject, text) {
    const address = to();
    if (!address) return log('[alarme] sem e-mail para avisar: confirme o e-mail da conta dona do site ou defina ALERT_EMAIL');
    Promise.resolve()
      .then(() => send({ to: address, subject: '[Resenhex] ' + subject, text: text + '\n\nAcompanhe na aba "Saúde do servidor", nas Configurações do Resenhex.' }))
      .catch((error) => log(`[alarme] o e-mail não saiu: ${error.message}`));
  }

  function check({ history, targets }) {
    for (const rule of rules) {
      const points = history.slice(-rule.window);
      if (points.length < rule.window) continue;
      const share = points.filter((p) => rule.bad(p, targets)).length / points.length;
      const state = states.get(rule.key) || { on: false, mailed: false, lastMail: -Infinity };
      states.set(rule.key, state);
      if (!state.on && share >= 0.8) {
        state.on = true;
        const text = rule.detail(points.at(-1), targets);
        log(`[alarme] ${rule.name}: ${text}`);
        state.mailed = now() - state.lastMail >= COOLDOWN_MS;
        if (state.mailed) { state.lastMail = now(); mail(`Alarme: ${rule.name}`, text); }
      } else if (state.on && share <= 0.2) {
        state.on = false;
        log(`[alarme] ${rule.name}: voltou ao normal`);
        // Só avisa que resolveu quem recebeu o aviso do problema.
        if (state.mailed) mail(`Resolvido: ${rule.name}`, `O alarme "${rule.name}" voltou ao normal.`);
        state.mailed = false;
      }
    }
  }

  return { check, active: () => rules.filter((rule) => states.get(rule.key)?.on).map((rule) => rule.key) };
}

module.exports = { createAlarms, RULES, COOLDOWN_MS };
