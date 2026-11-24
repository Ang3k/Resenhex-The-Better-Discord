#!/usr/bin/env node
// Roda TODAS as coletas de personagens até o fim e se recupera sozinho de queda de internet, travamento ou erro.
// Depois de uma queda de luz ou de reiniciar o PC, é só rodar o mesmo comando: ele pula o que já terminou e continua o resto.
//   node tools/mudae-coletar-tudo.js            (ou clique em tools/coletar-mudae.bat)
//   node tools/mudae-coletar-tudo.js --status   só mostra o que falta
//
// Duas pistas ao mesmo tempo (hosts diferentes, limites independentes):
//   A) AniList completo           (varre os ids; ~5 h)
//   B) Fandom: desenhos, jogos, séries, quadrinhos (um grupo por vez)
// Quando as duas terminam, monta o catálogo candidato (tools/mudae-montar-expandido.js). NUNCA publica nada.
// Cada etapa tem o seu próprio checkpoint (ver anilist-completo.js e fandom-expandido.js); aqui só se decide quando tentar de novo.
// Log em tools/mudae-cache/coletar.log. Um arquivo coletar.lock impede duas cópias ao mesmo tempo.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const CACHE = process.env.MUDAE_CACHE || path.join(__dirname, 'mudae-cache');
const PROTO = path.join(CACHE, 'prototipos');
const LOG = path.join(CACHE, 'coletar.log');
const LOCK = path.join(CACHE, 'coletar.lock');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const existe = (...p) => fs.existsSync(path.join(...p));

const PISTA_ANILIST = [{ nome: 'anilist', feito: () => existe(CACHE, 'anilist-completo', 'relatorio.json'), args: ['tools/mudae-fontes/anilist-completo.js'] }];
const PISTA_FANDOM = ['desenhos', 'jogos', 'series', 'quadrinhos'].map((g) => ({
  nome: 'fandom-' + g, feito: () => existe(PROTO, 'fandom-' + g + '.json'), args: ['tools/mudae-fontes/fandom-expandido.js', g] }));
const JUNCAO = { nome: 'juncao', unica: true, feito: () => false, args: ['tools/mudae-montar-expandido.js'] };

function log(msg) {
  const linha = `[${new Date().toLocaleString('pt-BR')}] ${msg}`;
  console.log(linha);
  try { fs.appendFileSync(LOG, linha + '\n'); } catch { /* sem log não impede a coleta */ }
}

// Há internet? Qualquer resposta HTTP (mesmo erro) vale; só falha de conexão conta como sem internet.
async function temInternet() {
  for (const url of ['https://graphql.anilist.co', 'https://www.cloudflare.com/cdn-cgi/trace']) {
    try { await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) }); return true; } catch { /* tenta o próximo */ }
  }
  return false;
}
async function esperarInternet() {
  let avisou = false;
  while (!(await temInternet())) {
    if (!avisou) { log('Sem internet. Esperando voltar...'); avisou = true; }
    await wait(15_000);
  }
  if (avisou) log('Internet voltou.');
}

const filhos = new Set();
function rodar(etapa) {
  return new Promise((resolve) => {
    const filho = spawn(process.execPath, ['--max-old-space-size=6144', ...etapa.args], { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
    filhos.add(filho);
    const saida = (buf) => { for (const l of String(buf).split('\n')) if (l.trim()) log(`(${etapa.nome}) ${l.trimEnd()}`); };
    filho.stdout.on('data', saida);
    filho.stderr.on('data', saida);
    filho.on('close', (code) => { filhos.delete(filho); resolve(code); });
    filho.on('error', () => { filhos.delete(filho); resolve(1); });
  });
}

async function pista(etapas, maxTentativas = 500) {
  for (const etapa of etapas) {
    for (let tentativa = 1; !etapa.feito(); tentativa++) {
      if (tentativa > maxTentativas) { log(`${etapa.nome}: desisti depois de ${maxTentativas} tentativas.`); return false; }
      await esperarInternet();
      log(`${etapa.nome}: iniciando${tentativa > 1 ? ' (tentativa ' + tentativa + ')' : ''}`);
      const code = await rodar(etapa);
      if (etapa.feito() || (etapa.unica && code === 0)) break;
      // Terminou sem concluir: queda de rede, wiki que falhou ou o processo morreu. Espera um pouco e retoma do checkpoint.
      const espera = Math.min(300, 10 * 2 ** Math.min(tentativa - 1, 5));
      log(`${etapa.nome}: saiu com código ${code} sem concluir. Retomando em ${espera}s do ponto onde parou.`);
      await wait(espera * 1000);
    }
    log(`${etapa.nome}: concluído.`);
  }
  return true;
}

function vivo(pid) { try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; } }
function pegarTrava() {
  fs.mkdirSync(CACHE, { recursive: true });
  if (fs.existsSync(LOCK)) {
    const pid = Number(fs.readFileSync(LOCK, 'utf8'));
    if (pid && pid !== process.pid && vivo(pid)) throw new Error('Já existe uma coleta rodando (pid ' + pid + '). Veja: node tools/mudae-progresso.js');
  }
  fs.writeFileSync(LOCK, String(process.pid));
}

async function main(args = process.argv.slice(2)) {
  if (args.includes('--status')) {
    for (const e of [...PISTA_ANILIST, ...PISTA_FANDOM]) console.log((e.feito() ? 'FEITO     ' : 'FALTA     ') + e.nome);
    return;
  }
  pegarTrava();
  const soltar = () => { try { if (Number(fs.readFileSync(LOCK, 'utf8')) === process.pid) fs.rmSync(LOCK); } catch { /* já foi */ } };
  process.on('exit', soltar);
  for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { log('Parada pedida: encerrando as etapas...'); for (const f of filhos) f.kill(); soltar(); process.exit(130); });
  log('Coleta iniciada. Pode fechar e rodar de novo a qualquer hora: o que já foi feito não se repete.');
  const [a, b] = await Promise.all([pista(PISTA_ANILIST), pista(PISTA_FANDOM)]);
  if (!(a && b)) { log('Alguma pista desistiu. Rode de novo para tentar outra vez.'); process.exitCode = 1; return; }
  log('Coletas concluídas. Montando o catálogo candidato...');
  await pista([JUNCAO], 3);
  log('Tudo pronto. Confira com: node tools/mudae-ver-novos.js');
}

if (require.main === module) main().catch((err) => { console.error(err.message); process.exitCode = 1; });
module.exports = { PISTA_ANILIST, PISTA_FANDOM };
