// Confere os momentos assinatura no app de verdade: outra pessoa reage, manda mensagem, digita, entra na call,
// fica online, e a conexão cai e volta. Tira uma foto no meio de cada animação. Uso: node moments.js <seed.json> <pasta>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { io } = require('/home/user/Resenhex-The-Better-Discord/discord-clone/node_modules/socket.io-client');
const SEED = JSON.parse(fs.readFileSync(process.argv[2]));
const OUT = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = {};
const sock = (who) => new Promise((res) => {
  const s = io(SEED.base, { transports: ['websocket'], forceNew: true });
  s.on('connect', () => s.emit('auth', { token: SEED.accounts[who].token, version: '2.2.0', patches: 1 }, () => res(s)));
});
const call = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));
async function waitFor(page, fn, ms = 3000) {
  const start = Date.now();
  while (Date.now() - start < ms) { if (await page.evaluate(fn).catch(() => false)) return Date.now() - start; await sleep(25); }
  return -1;
}
(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone', 'camera'] });
  await ctx.addInitScript(([t]) => { try { if (!sessionStorage.getItem('__i')) { localStorage.setItem('token', t); localStorage.setItem('seenVersion', '2.2.0'); localStorage.setItem('notifyDismissed', '1'); sessionStorage.setItem('__i', '1'); } } catch {} }, [SEED.accounts.ana.token]);
  const page = await ctx.newPage();
  await page.goto(SEED.base + '/'); await page.waitForSelector('#app:not(.hidden)'); await sleep(1500);
  const shot = (name) => page.screenshot({ path: path.join(OUT, name + '.png') });

  // Acendeu: Caio conecta
  const caio = await sock('caio');
  results.acendeu_ms = await waitFor(page, () => !!document.querySelector('.member.came-online'));
  await sleep(120); await shot('momento-acendeu');

  // Bruno conecta, digita, manda mensagem e reage
  const bruno = await sock('bruno');
  await sleep(600);
  bruno.emit('typing', { channel: SEED.channels.geral });
  results.digitando_ms = await waitFor(page, () => !!document.querySelector('#typing .typing-dots'));
  await sleep(300); await shot('momento-digitando');
  await call(bruno, 'chat:send', { channel: SEED.channels.geral, text: 'Cheguei! Bora? 🎮' });
  results.mensagem_ms = await waitFor(page, () => !!document.querySelector('.msg.msg-new'));
  await sleep(60); await shot('momento-mensagem-chega');
  // reação na última mensagem da Ana
  const last = await page.evaluate(() => { const own = [...document.querySelectorAll('#messages .msg')].filter((m) => /print da vitória/.test(m.textContent)).pop(); return own?.dataset.id; });
  await call(bruno, 'chat:react', { channel: SEED.channels.geral, id: last, emoji: '🔥' });
  results.pouso_ms = await waitFor(page, () => !!document.querySelector('.reaction.react-pop'));
  await sleep(90); await shot('momento-pouso');
  // Menção a Ana
  await call(bruno, 'chat:send', { channel: SEED.channels.geral, text: `<@${SEED.accounts.ana.id}> cola na call` });
  results.cutucao_ms = await waitFor(page, () => !!document.querySelector('.msg.msg-new.mentioned'));
  await sleep(150); await shot('momento-cutucao');
  // O voo: Ana manda mensagem
  await page.click('#chat-input'); await page.keyboard.type('Partiu!'); await page.keyboard.press('Enter');
  results.voo_ms = await waitFor(page, () => !!document.querySelector('.msg.msg-new.msg-mine'));
  await sleep(100); await shot('momento-voo');

  // Chamada: Ana entra, depois Bruno (outra aba) entra → chegada
  await page.locator('#channel-groups .channel', { hasText: 'Sala da resenha' }).first().click();
  results.conectou_ms = await waitFor(page, () => !!document.querySelector('#voice-panel:not(.hidden)'), 8000);
  await sleep(150); await shot('momento-conectou');
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['microphone'] });
  await ctx2.addInitScript(([t]) => { localStorage.setItem('token', t); localStorage.setItem('seenVersion', '2.2.0'); }, [SEED.accounts.bruno.token]);
  const p2 = await ctx2.newPage(); await p2.goto(SEED.base + '/'); await p2.waitForSelector('#app:not(.hidden)');
  await p2.locator('#channel-groups .channel', { hasText: 'Sala da resenha' }).first().click();
  results.chegada_ms = await waitFor(page, () => !!document.querySelector('.tile.tile-arrive'), 8000);
  await sleep(200); await shot('momento-chegada');
  await sleep(2500); await shot('momento-chamada-falando');

  // Conexão cai e volta
  execSync('/tmp/claude-0/-home-user-Resenhex-The-Better-Discord/42cdefbc-e31e-54b4-9e95-db8465c8646a/scratchpad/tools/srv.sh stop main 3000');
  results.caiu_ms = await waitFor(page, () => !document.querySelector('#conn-banner').classList.contains('hidden'), 5000);
  await sleep(400); await shot('momento-reconectando');
  execSync('/tmp/claude-0/-home-user-Resenhex-The-Better-Discord/42cdefbc-e31e-54b4-9e95-db8465c8646a/scratchpad/tools/srv.sh start main 3000 ' + (process.env.APP_DIR || ''));
  results.voltou_ms = await waitFor(page, () => document.querySelector('#conn-banner').classList.contains('ok'), 15000);
  await sleep(200); await shot('momento-reconectado');
  console.log(JSON.stringify(results));
  caio.close(); bruno.close();
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
