// Tour de capturas do Resenhex (antes/depois). Uso:
//   node shots.js <seed.json> <pasta-saida> [cena1,cena2...]
// Cada cena roda isolada (try/catch): uma falha não para as outras. Saída: <cena>-desk.png e <cena>-cel.png.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const SEED = JSON.parse(fs.readFileSync(process.argv[2]));
const OUT = process.argv[3];
const ONLY = process.argv[4] ? process.argv[4].split(',') : null;
const BASE = SEED.base;
const APP = process.env.APP_DIR || '/home/user/Resenhex-The-Better-Discord/discord-clone';
fs.mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIZES = {
  desk: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  cel: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
let browser;
const failures = [];

async function ctxFor(account, size, opts = {}) {
  const ctx = await browser.newContext({ ...SIZES[size], locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', permissions: ['microphone', 'camera', 'notifications'], ...opts.ctx });
  const token = account ? SEED.accounts[account].token : null;
  await ctx.addInitScript(([t, seen, extra]) => {
    try {
      if (!sessionStorage.getItem('__init')) {
        if (t) localStorage.setItem('token', t);
        if (seen) localStorage.setItem('seenVersion', seen);
        localStorage.setItem('notifyDismissed', '1');
        for (const [k, v] of Object.entries(extra || {})) localStorage.setItem(k, v);
        sessionStorage.setItem('__init', '1');
      }
    } catch {}
  }, [token, opts.seen === undefined ? '2.2.0' : opts.seen, opts.storage || {}]);
  return ctx;
}
async function open(account, size, opts = {}) {
  const ctx = await ctxFor(account, size, opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('  pageerror', e.message.slice(0, 160)));
  await page.goto(BASE + (opts.path || '/'), { waitUntil: 'domcontentloaded' });
  if (account && !opts.noWait) await page.waitForSelector('#app:not(.hidden)', { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await sleep(opts.settle ?? 900);
  return { ctx, page };
}
async function shot(page, name, opts = {}) {
  await sleep(opts.wait ?? 500);
  const file = path.join(OUT, name + '.png');
  await page.screenshot({ path: file, fullPage: !!opts.full });
  log('  ✓', name);
}
async function clickText(page, selector, text) {
  const loc = page.locator(selector, { hasText: text }).first();
  await loc.click();
}
async function gotoChannel(page, name) {
  await page.locator('#channel-groups .channel', { hasText: new RegExp('^\\s*' + name + '\\s*$') }).first().click().catch(async () => {
    await page.locator('#channel-groups .channel', { hasText: name }).first().click();
  });
  await sleep(700);
}
async function openChannelsDrawer(page) {
  const btn = page.locator('#btn-channels');
  if (await btn.isVisible()) { await btn.click(); await sleep(500); }
}
async function goHome(page, size) {
  if (size === 'cel') await page.click('#nav-to-home');
  else await page.click('#rail-home');
  await sleep(500);
  if (size === 'cel' && !(await page.locator('#dm-list li').first().isVisible().catch(() => false))) await openChannelsDrawer(page);
}
async function closeDrawers(page) { await page.keyboard.press('Escape').catch(() => {}); await sleep(300); }

const scenes = {};
// ---------- Entrada ----------
scenes.landing = async (size) => {
  const { ctx, page } = await open(null, size, { seen: null });
  await shot(page, `landing-${size}`, { wait: 1500 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await ctx.close();
};
scenes['landing-recursos'] = async (size) => {
  const { ctx, page } = await open(null, size, { seen: null });
  await page.evaluate(() => { const l = document.querySelector('#landing'); const target = document.querySelector('#recursos'); (l && l.scrollHeight > l.clientHeight ? l : document.scrollingElement).scrollTop = target ? target.offsetTop : 900; });
  await shot(page, `landing-recursos-${size}`, { wait: 1200 });
  await ctx.close();
};
scenes.login = async (size) => {
  const { ctx, page } = await open(null, size, { seen: null, path: '/#entrar' });
  await shot(page, `login-${size}`, { wait: 800 });
  // Erro de senha
  await page.fill('#login-name', 'Ana').catch(() => {});
  await page.fill('#login-password', 'errada').catch(() => {});
  await page.click('#login-submit').catch(() => {});
  await sleep(1800);
  await shot(page, `login-erro-${size}`);
  await ctx.close();
};
scenes.register = async (size) => {
  const { ctx, page } = await open(null, size, { seen: null, path: '/#criar-conta' });
  await shot(page, `cadastro-${size}`, { wait: 800 });
  await ctx.close();
};
scenes.loading = async (size) => {
  // Logo depois de abrir, antes da resposta do servidor (rede lenta simulada).
  const ctx = await ctxFor('ana', size);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 1500, downloadThroughput: 200 * 1024, uploadThroughput: 100 * 1024 });
  await page.goto(BASE + '/', { waitUntil: 'commit' });
  await sleep(2500);
  await shot(page, `carregando-${size}`, { wait: 0 });
  await ctx.close();
};
// ---------- Chat ----------
scenes.chat = async (size) => {
  const { ctx, page } = await open('ana', size);
  await shot(page, `chat-geral-${size}`, { wait: 1200 });
  if (size === 'desk') {
    // Mensagem com o mouse em cima (barra de ações)
    const msgs = page.locator('#messages .msg');
    const n = await msgs.count();
    await msgs.nth(n - 4).hover();
    await shot(page, `chat-hover-${size}`, { wait: 500 });
    // rolar até o topo do histórico
    await page.evaluate(() => { document.querySelector('#messages').scrollTop = 0; });
    await shot(page, `chat-topo-${size}`, { wait: 800 });
  }
  await ctx.close();
};
scenes['chat-vazio'] = async (size) => {
  const { ctx, page } = await open('ana', size);
  if (size === 'cel') await openChannelsDrawer(page);
  await gotoChannel(page, 'jogos');
  await shot(page, `chat-vazio-${size}`, { wait: 800 });
  await ctx.close();
};
scenes.autocomplete = async (size) => {
  const { ctx, page } = await open('ana', size);
  await page.click('#chat-input');
  await page.keyboard.type('Oi @');
  await shot(page, `autocomplete-${size}`, { wait: 700 });
  await page.keyboard.type('Br');
  await page.keyboard.press('Enter').catch(() => {});
  await page.keyboard.type(' bora jogar? ');
  await shot(page, `composer-texto-${size}`, { wait: 400 });
  await ctx.close();
};
scenes.reply = async (size) => {
  const { ctx, page } = await open('ana', size);
  const msgs = page.locator('#messages .msg');
  const n = await msgs.count();
  const target = msgs.nth(n - 3);
  if (size === 'desk') { await target.hover(); await sleep(300); await target.locator('.msg-actions button').first().click().catch(() => {}); }
  else { await target.click({ button: 'right' }).catch(() => {}); await sleep(400); }
  await shot(page, `responder-${size}`, { wait: 600 });
  await ctx.close();
};
scenes['context-msg'] = async (size) => {
  const { ctx, page } = await open('ana', size);
  if (size === 'desk') {
    // No computador a mensagem usa a barra de ações; o menu de contexto é o do membro.
    await page.locator('#member-list .member', { hasText: 'Bruno' }).first().click({ button: 'right' });
    await shot(page, `menu-membro-${size}`, { wait: 600 });
  } else {
    // Toque longo na mensagem: folha de ações.
    const own = page.locator('#messages .msg', { hasText: 'Olha o print da vitória' }).first();
    await own.scrollIntoViewIfNeeded();
    const box = await own.boundingBox();
    await own.evaluate((node, [x, y]) => node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', button: 0, clientX: x, clientY: y })), [box.x + 150, box.y + 20]);
    await sleep(700);
    await shot(page, `folha-mensagem-${size}`, { wait: 600 });
  }
  await ctx.close();
};
scenes['context-channel'] = async (size) => {
  if (size === 'cel') return;
  const { ctx, page } = await open('ana', size);
  await page.locator('#channel-groups .channel', { hasText: 'memes' }).first().click({ button: 'right' });
  await shot(page, `menu-canal-${size}`, { wait: 600 });
  await ctx.close();
};
scenes['server-menu'] = async (size) => {
  const { ctx, page } = await open('ana', size);
  if (size === 'cel') await openChannelsDrawer(page);
  await page.click('#server-header');
  await shot(page, `menu-servidor-${size}`, { wait: 600 });
  await ctx.close();
};
scenes['status-menu'] = async (size) => {
  const { ctx, page } = await open('ana', size);
  if (size === 'cel') await openChannelsDrawer(page);
  await page.click('#me-card');
  await shot(page, `menu-status-${size}`, { wait: 600 });
  await ctx.close();
};
scenes.emoji = async (size) => {
  const { ctx, page } = await open('ana', size);
  await page.click('#btn-emoji');
  await shot(page, `emoji-${size}`, { wait: 900 });
  await ctx.close();
};
scenes.gif = async (size) => {
  const { ctx, page } = await open('ana', size);
  const gifBtn = page.locator('#btn-gif');
  if (await gifBtn.isVisible()) { await gifBtn.click(); await shot(page, `gif-${size}`, { wait: 1500 }); }
  else log('  (sem botão de GIF: KLIPY_KEY ausente)');
  await ctx.close();
};
scenes.lightbox = async (size) => {
  const { ctx, page } = await open('ana', size);
  await page.locator('#messages .msg', { hasText: 'Olha o print' }).locator('img').first().click();
  await shot(page, `lightbox-${size}`, { wait: 900 });
  await ctx.close();
};
scenes.members = async (size) => {
  const { ctx, page } = await open('ana', size);
  if (size === 'cel') { await page.click('#btn-members'); await sleep(600); }
  await shot(page, `membros-${size}`, { wait: 600 });
  await ctx.close();
};
scenes['profile-card'] = async (size) => {
  const { ctx, page } = await open('ana', size);
  if (size === 'cel') { await page.click('#btn-members'); await sleep(600); }
  await page.locator('#member-list .member', { hasText: 'Bruno' }).first().click();
  await shot(page, `perfil-cartao-${size}`, { wait: 800 });
  await ctx.close();
};
scenes['profile-card-self'] = async (size) => {
  const { ctx, page } = await open('ana', size);
  if (size === 'cel') { await page.click('#btn-members'); await sleep(600); }
  await page.locator('#member-list .member', { hasText: 'Ana' }).first().click();
  await shot(page, `perfil-cartao-proprio-${size}`, { wait: 800 });
  await ctx.close();
};
scenes['channels-drawer'] = async (size) => {
  if (size === 'desk') return;
  const { ctx, page } = await open('ana', size);
  await openChannelsDrawer(page);
  await shot(page, `gaveta-canais-${size}`, { wait: 600 });
  await ctx.close();
};
scenes.tooltip = async (size) => {
  if (size === 'cel') return;
  const { ctx, page } = await open('ana', size);
  await page.hover('#btn-deafen');
  await shot(page, `dica-${size}`, { wait: 900 });
  await page.hover('.rail-item.active');
  await shot(page, `dica-faixa-${size}`, { wait: 900 });
  await ctx.close();
};
// ---------- Amigos e DMs ----------
scenes.friends = async (size) => {
  const { ctx, page } = await open('ana', size);
  if (size === 'cel') await openChannelsDrawer(page);
  await goHome(page, size);
  await sleep(500);
  await page.click('#nav-friends').catch(() => {});
  await shot(page, `amigos-${size}`, { wait: 900 });
  // aba de pendentes
  const tabs = page.locator('#friends-tabs button');
  const count = await tabs.count();
  for (let i = 0; i < count; i++) { const t = (await tabs.nth(i).textContent()) || ''; if (/pendente/i.test(t)) { await tabs.nth(i).click(); break; } }
  await shot(page, `amigos-pendentes-${size}`, { wait: 700 });
  await ctx.close();
};
scenes['friends-empty'] = async (size) => {
  const { ctx, page } = await open('caio', size);
  if (size === 'cel') await openChannelsDrawer(page);
  await goHome(page, size);
  await sleep(500);
  await page.click('#nav-friends').catch(() => {});
  await shot(page, `amigos-vazio-${size}`, { wait: 900 });
  await ctx.close();
};
scenes.dm = async (size) => {
  const { ctx, page } = await open('ana', size);
  if (size === 'cel') await openChannelsDrawer(page);
  await goHome(page, size);
  await sleep(500);
  await page.locator('#dm-list li').first().click();
  await shot(page, `dm-${size}`, { wait: 900 });
  await ctx.close();
};
// ---------- Janelas ----------
scenes.settings = async (size) => {
  const { ctx, page } = await open('ana', size);
  if (size === 'cel') await openChannelsDrawer(page);
  await page.click('#btn-settings');
  await sleep(800);
  await shot(page, `config-perfil-${size}`, { wait: 400 });
  for (const [tab, name] of [['#tab-account', 'conta'], ['#tab-voice', 'voz'], ['#tab-appearance', 'aparencia'], ['#tab-accessibility', 'acessibilidade'], ['#tab-notifications', 'notificacoes'], ['#tab-overlay', 'overlay']]) {
    try { await page.click(tab); await shot(page, `config-${name}-${size}`, { wait: 700 }); } catch (e) { log('  aba', tab, e.message.slice(0, 80)); }
  }
  await ctx.close();
};
scenes['server-settings'] = async (size) => {
  const { ctx, page } = await open('ana', size);
  if (size === 'cel') await openChannelsDrawer(page);
  await page.click('#server-header');
  await sleep(400);
  await clickText(page, '#context-menu .menu-item, #context-menu button', 'Configurações');
  await sleep(900);
  await shot(page, `config-servidor-${size}`, { wait: 400 });
  const nav = page.locator('#admin-nav button');
  const n = await nav.count();
  for (let i = 1; i < Math.min(n, 4); i++) { try { await nav.nth(i).click(); await shot(page, `config-servidor-${i}-${size}`, { wait: 700 }); } catch {} }
  await ctx.close();
};
scenes.changelog = async (size) => {
  const { ctx, page } = await open('ana', size, { seen: '1.0.0' });
  await sleep(800);
  await shot(page, `novidades-${size}`, { wait: 600 });
  await ctx.close();
};
scenes['create-channel'] = async (size) => {
  const { ctx, page } = await open('ana', size);
  if (size === 'cel') await openChannelsDrawer(page);
  const cat = page.locator('#channel-groups .category').first();
  await cat.hover().catch(() => {});
  await cat.locator('.group-action').last().click({ force: true });
  await shot(page, `menu-grupo-${size}`, { wait: 700 });
  await page.keyboard.press('Escape'); await sleep(400);
  await cat.hover().catch(() => {});
  await cat.locator('.group-action').first().click({ force: true });
  await shot(page, `criar-canal-${size}`, { wait: 800 });
  await ctx.close();
};
scenes['server-dialog'] = async (size) => {
  const { ctx, page } = await open('ana', size);
  if (size === 'cel') { await openChannelsDrawer(page); await page.click('#btn-switch-server').catch(() => {}); await sleep(500); }
  const add = page.locator('#btn-add-server');
  if (await add.isVisible()) await add.click(); else { await clickText(page, 'button, .menu-item', 'Adicionar').catch(() => {}); }
  await shot(page, `adicionar-servidor-${size}`, { wait: 800 });
  await ctx.close();
};
scenes.confirm = async (size) => {
  const { ctx, page } = await open('ana', size);
  const own = page.locator('#messages .msg', { hasText: 'Olha o print da vitória' }).first();
  await own.dispatchEvent('contextmenu', { clientX: 600, clientY: 400 });
  await sleep(500);
  await clickText(page, '#context-menu .menu-item, #context-menu button', 'Apagar').catch(() => {});
  await shot(page, `confirmar-${size}`, { wait: 800 });
  await ctx.close();
};
scenes.feedback = async (size) => {
  const { ctx, page } = await open('ana', size);
  if (size === 'cel') { await page.click('#btn-members'); await sleep(600); }
  await page.click('#btn-feedback');
  await shot(page, `propor-melhorias-${size}`, { wait: 800 });
  await ctx.close();
};
scenes.toast = async (size) => {
  const { ctx, page } = await open('ana', size);
  await page.evaluate(() => {
    const node = document.querySelector('#toast');
    const span = document.createElement('span'); span.textContent = 'Você está enviando mensagens rápido demais. Espere um pouco.';
    node.replaceChildren(Icon('alert', 18), span); node.className = 'error';
  });
  await shot(page, `aviso-erro-${size}`, { wait: 700 });
  await page.evaluate(() => {
    const node = document.querySelector('#toast');
    const span = document.createElement('span'); span.textContent = 'Link do convite copiado.';
    node.replaceChildren(Icon('info', 18), span); node.className = 'info';
  });
  await shot(page, `aviso-info-${size}`, { wait: 700 });
  await ctx.close();
};
scenes.offline = async (size) => {
  // Conexão perdida: o servidor cai (o socket fecha na hora) e volta depois da captura.
  const { execSync } = require('child_process');
  const { ctx, page } = await open('ana', size);
  const name = process.env.SRV_NAME || 'main', port = process.env.SRV_PORT || '3000';
  execSync(`${__dirname}/srv.sh stop ${name} ${port}`);
  await sleep(2500);
  await shot(page, `desconectado-${size}`, { wait: 300 });
  execSync(`${__dirname}/srv.sh start ${name} ${port} ${process.env.APP_DIR || ''}`);
  await sleep(4000);
  await shot(page, `reconectado-${size}`, { wait: 300 });
  await ctx.close();
};
// ---------- Chamadas ----------
async function joinVoice(page, size, channel = 'Sala da resenha') {
  if (size === 'cel') await openChannelsDrawer(page);
  await page.locator('#channel-groups .channel', { hasText: channel }).first().click();
  await sleep(2500);
}
scenes.call = async (size) => {
  // Bruno e Caio entram primeiro (desktop), depois a pessoa observada.
  const others = [];
  for (const who of ['bruno', 'caio']) { const o = await open(who, 'desk'); await joinVoice(o.page, 'desk'); others.push(o); }
  const { ctx, page } = await open('ana', size);
  await joinVoice(page, size);
  await sleep(2500);
  await shot(page, `chamada-voz-${size}`, { wait: 600 });
  // câmera de alguém
  try { await others[0].page.click('#sc-cam'); await sleep(2500); await shot(page, `chamada-camera-${size}`, { wait: 1500 }); } catch (e) { log('  câmera', e.message.slice(0, 100)); }
  // chat da sala por cima (só desktop)
  if (size === 'desk') {
    try { await page.click('#sc-chat'); await shot(page, `chamada-chat-${size}`, { wait: 900 }); await page.click('#sc-chat'); } catch {}
    try { await page.click('#sc-sounds'); await shot(page, `soundboard-${size}`, { wait: 900 }); await page.keyboard.press('Escape'); await sleep(300); } catch (e) { log('  sons', e.message.slice(0, 100)); }
    try { await page.click('#sc-music'); await shot(page, `dj-${size}`, { wait: 1200 }); await page.keyboard.press('Escape'); await sleep(300); } catch (e) { log('  dj', e.message.slice(0, 100)); }
    try { await page.click('#sc-clip'); await shot(page, `clipes-${size}`, { wait: 1200 }); await page.keyboard.press('Escape'); await sleep(300); } catch (e) { log('  clipes', e.message.slice(0, 100)); }
    // voltar ao chat com a chamada ativa (pílula "Em chamada" e dock com voz)
    try { await gotoChannel(page, 'geral'); await shot(page, `chat-em-chamada-${size}`, { wait: 1200 }); } catch (e) { log('  chat-em-chamada', e.message.slice(0, 100)); }
  } else {
    try { await page.click('#sc-sounds'); await shot(page, `soundboard-${size}`, { wait: 900 }); await page.keyboard.press('Escape'); } catch (e) { log('  sons', e.message.slice(0, 100)); }
    try { await page.click('#sc-music'); await shot(page, `dj-${size}`, { wait: 1200 }); } catch (e) { log('  dj', e.message.slice(0, 100)); }
  }
  await ctx.close();
  for (const o of others) await o.ctx.close();
};
scenes.screenshare = async (size) => {
  const sharer = await open('bruno', 'desk');
  await joinVoice(sharer.page, 'desk');
  const { ctx, page } = await open('ana', size);
  await joinVoice(page, size);
  try {
    await sharer.page.click('#sc-screen');
    await sleep(700);
    await shot(sharer.page, `menu-transmitir-desk`, { wait: 300 });
    // primeira opção do menu de transmissão
    const item = sharer.page.locator('#context-menu .menu-item, #context-menu button').first();
    await item.click();
    await sleep(4000);
    await shot(page, `transmissao-${size}`, { wait: 1500 });
    // assistir
    const watch = page.locator('.watch-btn').first();
    if (await watch.isVisible().catch(() => false)) { await watch.click(); await sleep(3000); await shot(page, `transmissao-assistindo-${size}`, { wait: 1000 }); }
    if (size === 'desk') {
      // foco e zoom
      const tile = page.locator('#stage .tile.screen').first();
      await tile.dblclick().catch(() => {});
      await sleep(1200);
      await shot(page, `transmissao-foco-${size}`, { wait: 800 });
      await tile.hover().catch(() => {});
      await page.mouse.wheel(0, -400); await sleep(800);
      await shot(page, `transmissao-zoom-${size}`, { wait: 800 });
    }
  } catch (e) { log('  transmissão', e.message.slice(0, 160)); }
  await ctx.close(); await sharer.ctx.close();
};
scenes['dm-call'] = async (size) => {
  const bruno = await open('bruno', 'desk');
  const { ctx, page } = await open('ana', size);
  if (size === 'cel') await openChannelsDrawer(page);
  await goHome(page, size);
  await sleep(500);
  await page.locator('#dm-list li').first().click();
  await sleep(800);
  await page.click('#btn-dm-call');
  await sleep(2500);
  await shot(page, `chamada-privada-chamando-${size}`, { wait: 500 });
  await shot(bruno.page, `chamada-privada-recebendo-desk`, { wait: 200 });
  try {
    const accept = bruno.page.locator('.ic-btn.accept').first();
    await accept.click(); await sleep(3500);
    await shot(page, `chamada-privada-${size}`, { wait: 800 });
  } catch (e) { log('  aceitar', e.message.slice(0, 120)); }
  await ctx.close(); await bruno.ctx.close();
};
scenes.mudae = async (size) => {
  const { ctx, page } = await open('ana', size);
  if (size === 'cel') await openChannelsDrawer(page);
  await page.locator('#channel-groups .channel', { hasText: 'salão' }).first().click();
  await sleep(2500);
  await shot(page, `salao-${size}`, { wait: 800 });
  await ctx.close();
};
// ---------- Desktop e overlay ----------
scenes.titlebar = async (size) => {
  if (size === 'cel') return;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 30 } });
  const page = await ctx.newPage();
  await page.goto('file://' + path.join(APP, 'desktop/titlebar.html'));
  await sleep(500);
  await shot(page, `barra-titulo-desk`, { wait: 200 });
  await page.evaluate(() => document.getElementById('update').classList.add('show'));
  await shot(page, `barra-titulo-atualizar-desk`, { wait: 600 });
  await ctx.close();
};
scenes['desktop-offline'] = async (size) => {
  const ctx = await browser.newContext(SIZES[size]);
  const page = await ctx.newPage();
  await page.goto('file://' + path.join(APP, 'desktop/offline.html'));
  await shot(page, `app-sem-conexao-${size}`, { wait: 800 });
  await ctx.close();
};
scenes.overlay = async (size) => {
  if (size === 'cel') return;
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/overlay.html?demo');
  await page.evaluate(() => { document.documentElement.style.background = 'linear-gradient(135deg,#2d4a22,#7a8f3a 40%,#c9b37a 70%,#5b6e8a)'; });
  await shot(page, `overlay-jogo-desk`, { wait: 2500 });
  await ctx.close();
};
scenes.baixar = async (size) => {
  const ctx = await browser.newContext(SIZES[size]);
  const page = await ctx.newPage();
  await page.goto(BASE + '/baixar');
  await shot(page, `baixar-${size}`, { wait: 1200 });
  await ctx.close();
};

(async () => {
  browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--auto-select-desktop-capture-source=Entire screen', '--autoplay-policy=no-user-gesture-required'] });
  const names = ONLY || Object.keys(scenes);
  for (const name of names) {
    for (const size of ['desk', 'cel']) {
      log(name, size);
      try { await Promise.race([scenes[name](size), sleep(90000).then(() => { throw new Error('tempo esgotado'); })]); }
      catch (e) { failures.push(`${name}/${size}: ${e.message.split('\n')[0].slice(0, 200)}`); log('  ✗', e.message.split('\n')[0].slice(0, 200)); }
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, '_falhas.txt'), failures.join('\n') + '\n');
  log('fim; falhas:', failures.length);
})();
