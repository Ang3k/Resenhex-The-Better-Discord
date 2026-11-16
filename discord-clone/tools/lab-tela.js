#!/usr/bin/env node
// Resume as amostras do laboratório da transmissão do celular (server/lab.js, public/lab-tela.js).
// Uso:
//   node tools/lab-tela.js tela-2026-11-08.jsonl [mais arquivos]   resumo de cada teste
//   node tools/lab-tela.js arquivo.jsonl --teste 3                   segundo a segundo do teste 3
// Para buscar o arquivo do servidor: scp -i ~/.ssh/resenhex-oracle-ed25519 ubuntu@146.235.41.73:/var/lib/resenhex/lab/tela-AAAA-MM-DD.jsonl .
// (a pasta é do usuário resenhex: copie antes com sudo para /tmp, se o scp não tiver permissão.)
const fs = require('node:fs');

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const runArg = args.indexOf('--teste');
const onlyRun = runArg >= 0 ? Number(args[runArg + 1]) : null;
if (!files.length) {
  console.log('Uso: node tools/lab-tela.js tela-AAAA-MM-DD.jsonl [--teste N]');
  process.exit(1);
}

const lines = files.flatMap((file) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)).map((line) => {
  try { return JSON.parse(line); } catch { return null; }
}).filter(Boolean);

const MODES = { tela: 'tela inteira', app: 'um app só', '': 'sem nome' };
const nums = (list) => list.filter((v) => Number.isFinite(v));
function pct(list, p) {
  const sorted = nums(list).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}
const sum = (list) => nums(list).reduce((a, b) => a + b, 0);
const fmt = (v, digits = 0) => (v === null || v === undefined || !Number.isFinite(v) ? '-' : v.toFixed(digits).replace('.', ','));
const spread = (list, digits = 0) => `${fmt(pct(list, 0.5), digits)} (10%: ${fmt(pct(list, 0.1), digits)}, 90%: ${fmt(pct(list, 0.9), digits)})`;
function count(list) {
  const map = new Map();
  for (const v of list) if (v !== null && v !== undefined) map.set(v, (map.get(v) || 0) + 1);
  return [...map].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ×${n}`).join(', ') || '-';
}
function device(ua = '') {
  const android = ua.match(/Android ([\d.]+)/)?.[1];
  const model = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/)?.[1];
  const chrome = ua.match(/Chrome\/(\d+)/)?.[1];
  if (android) return `${model || 'Android'} · Android ${android} · WebView ${chrome || '?'}`;
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'outro';
  return `${/Electron/.test(ua) ? 'app de Windows' : 'navegador'} · ${os} · Chrome ${chrome || '?'}`;
}

const runs = new Map();
for (const line of lines) {
  if (!runs.has(line.run)) runs.set(line.run, []);
  runs.get(line.run).push(line);
}

function summary(run, list) {
  const first = list[0], last = list[list.length - 1];
  const seconds = Math.round((Date.parse(last.at) - Date.parse(first.at)) / 1000);
  console.log(`\n=== Teste ${run}: ${MODES[first.mode] ?? first.mode} · ${first.content || 'conteúdo sem nome'} · ${seconds} s`);
  console.log(`    variações: regra de atraso ${first.lagRule ? 'ligada' : 'DESLIGADA'} · codec da call ${first.codec} · captura ${first.capture}`);
  const bySid = new Map();
  for (const line of list) {
    if (!bySid.has(line.sid)) bySid.set(line.sid, []);
    bySid.get(line.sid).push(line);
  }
  for (const [sid, rows] of bySid) {
    const samples = rows.map((r) => r.sample);
    const ua = samples.find((s) => s.ua)?.ua;
    const phones = samples.map((s) => s.phone).filter(Boolean);
    const hz = samples.find((s) => s.hz)?.hz;
    console.log(`\n  [${sid}] ${device(ua)}${hz ? ` · tela ~${hz} Hz` : ''}${rows[0].owner ? ' · conta do dono' : ''} · ${rows.length} amostras`);
    if (samples.some((s) => s.sfu)) console.log('    (call pelo servidor de mídia: os números do WebRTC não entram)');
    if (phones.length) {
      const p = phones;
      const pauses = sum(p.map((x) => x.pauses));
    console.log(`    CELULAR: ${count(p.map((x) => `${x.codec} ${x.w}×${x.h} pedido ${x.fps} fps`))}${pauses ? ` · o app transmitido saiu da tela ${pauses}× (${p.filter((x) => x.paused).length} s parado)` : ''}`);
      console.log(`      quadros do codificador/s: ${spread(p.map((x) => x.pk))} · ${spread(p.map((x) => x.kb * 8), 0)} kbps · quadros-chave ${sum(p.map((x) => x.key))}`);
      console.log(`      intervalo entre quadros (ms): mediana ${fmt(pct(p.map((x) => x.gaps?.p50), 0.5), 1)} · 90% ${fmt(pct(p.map((x) => x.gaps?.p90), 0.5), 1)} · maior ${fmt(Math.max(...nums(p.map((x) => x.gaps?.max)), -Infinity), 1)}`);
      console.log(`      decodificados/s na página: ${spread(p.map((x) => x.dec))} · fila máx ${fmt(Math.max(...nums(p.map((x) => x.q)), 0))}`);
      console.log(`      descartes: esperando quadro-chave ${sum(p.map((x) => x.waitDrop))} · trilha cheia ${sum(p.map((x) => x.sinkDrop))} · JPEG ocupado ${sum(p.map((x) => x.jpegDrop))}`);
      console.log(`      regra de atraso: ${sum(p.map((x) => x.behind))} atrasos · menor limite ${fmt(Math.min(...nums(p.map((x) => x.limit)), Infinity))} fps · codificador recriado ${sum(p.map((x) => x.gens))}× · erros ${sum(p.map((x) => x.errs))} · reconexões ${sum(p.map((x) => x.reads))}`);
      console.log(`      app em segundo plano em ${p.length ? Math.round(100 * samples.filter((s) => s.phone && s.app === false).length / p.length) : 0}% das amostras`);
    }
    const outs = samples.flatMap((s) => (s.out || []).map((o) => ({ ...o })));
    for (const to of [...new Set(outs.map((o) => o.to))]) {
      const o = outs.filter((x) => x.to === to);
      console.log(`    ENVIO para ${to}: ${count(o.map((x) => x.codec && `${x.codec} ${x.impl || '?'}${x.hw === true ? ' (hardware)' : x.hw === false ? ' (software)' : ''}`))}`);
      console.log(`      fps enviado: ${spread(o.map((x) => x.fps))} · fps da fonte ${spread(o.map((x) => x.src))} · tamanho ${count(o.map((x) => x.w && `${x.w}×${x.h}`))}`);
      console.log(`      taxa ${spread(o.map((x) => x.kbps))} kbps · alvo ${spread(o.map((x) => x.target))} · disponível ${spread(o.map((x) => x.avail))} · RTT ${spread(o.map((x) => x.rtt))} ms`);
      console.log(`      limitado por: ${count(o.map((x) => x.why))} · s limitado (processador ${fmt(sum(o.map((x) => x.cpuS)), 1)}, banda ${fmt(sum(o.map((x) => x.bwS)), 1)})`);
      console.log(`      codificar 1 quadro: ${spread(o.map((x) => x.encMs), 1)} ms · PLI ${sum(o.map((x) => x.pli))} · NACK ${sum(o.map((x) => x.nack))} · quadros-chave ${sum(o.map((x) => x.keys))}`);
      console.log(`      limites: fps ${count(o.map((x) => x.maxFps))} · escala ${count(o.map((x) => x.scale))} · ${count(o.map((x) => x.deg))} · degrau máx ${Math.max(0, ...o.map((x) => x.level || 0))}${o.some((x) => x.relayed) ? ' · pelo retransmissor' : ''}`);
    }
    const ins = samples.flatMap((s) => s.in || []);
    for (const from of [...new Set(ins.map((i) => i.from))]) {
      const i = ins.filter((x) => x.from === from);
      console.log(`    RECEBIDO de ${from}: ${count(i.map((x) => x.codec && `${x.codec} ${x.impl || '?'}${x.hw === true ? ' (hardware)' : x.hw === false ? ' (software)' : ''}`))} · tamanho ${count(i.map((x) => x.w && `${x.w}×${x.h}`))}`);
      console.log(`      fps: ${spread(i.map((x) => x.fps))} · decodificados/s ${spread(i.map((x) => x.dec))} · descartados ${sum(i.map((x) => x.drop))} · perdidos ${sum(i.map((x) => x.lost))} pacotes`);
      console.log(`      travadas ${sum(i.map((x) => x.freezes))} (${fmt(sum(i.map((x) => x.freezeMs)) / 1000, 1)} s) · espera no buffer ${spread(i.map((x) => x.jbMs))} ms · taxa ${spread(i.map((x) => x.kbps))} kbps`);
      console.log(`      pedido de quem assiste: ${count(i.map((x) => x.demand && `${x.demand.mode || '?'} ${x.demand.maxHeight || '?'}p${x.demand.fps ? ' ' + x.demand.fps + ' fps' : ''}${x.demand.background ? ' segundo plano' : ''}`))}`);
    }
  }
}

function timeline(run, list) {
  console.log(`\nTeste ${run}, segundo a segundo (celular: quadros do codificador / decodificados / fila / descartes, limite da regra de atraso · envio: fps, motivo, tamanho · recebido: fps, travadas)`);
  const start = Date.parse(list[0].at);
  for (const line of list) {
    const s = line.sample, t = ((Date.parse(line.at) - start) / 1000).toFixed(0).padStart(4);
    const parts = [];
    if (s.phone) parts.push(`cel ${s.phone.pk}/${s.phone.dec}/q${s.phone.q}/d${s.phone.waitDrop + s.phone.sinkDrop}${s.phone.limit < s.phone.want ? ` limite ${s.phone.limit}` : ''}${s.phone.gens ? ' NOVO' : ''}${s.phone.paused ? ' PAUSADO' : ''}${s.app === false ? '' : ' (app à vista)'}`);
    for (const o of s.out || []) parts.push(`env→${o.to} ${fmt(o.fps)} ${o.why || '-'} ${o.w}×${o.h} ${fmt(o.kbps)}k`);
    for (const i of s.in || []) parts.push(`rec←${i.from} ${fmt(i.fps)}${i.freezes ? ` TRAVOU ${i.freezes}` : ''}`);
    console.log(`${t}s [${line.sid}] ${parts.join(' | ')}`);
  }
}

for (const [run, list] of [...runs].sort((a, b) => a[0] - b[0])) {
  if (onlyRun !== null && run !== onlyRun) continue;
  if (onlyRun !== null) timeline(run, list);
  else summary(run, list);
}
