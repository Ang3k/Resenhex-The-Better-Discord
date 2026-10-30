// Acessibilidade visual: contraste (axe-core, WCAG 2.2 AA), alvos de toque (axe target-size e medida própria no celular)
// e foco visível (Tab pelos controles e conferência do estilo de foco). Uso: node a11y.js <seed.json> <saida.json>
const { chromium } = require('playwright');
const fs = require('fs');
const SEED = JSON.parse(fs.readFileSync(process.argv[2]));
const OUT = process.argv[3];
const AXE = fs.readFileSync('/tmp/claude-0/-home-user-Resenhex-The-Better-Discord/42cdefbc-e31e-54b4-9e95-db8465c8646a/scratchpad/devtools/node_modules/axe-core/axe.min.js', 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIZES = { desk: { viewport: { width: 1440, height: 900 } }, cel: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };

async function open(browser, size, account = 'ana', seen = '2.2.0') {
  const ctx = await browser.newContext({ ...SIZES[size], locale: 'pt-BR' });
  await ctx.addInitScript(([t, s]) => { try { if (!sessionStorage.getItem('__i')) { if (t) localStorage.setItem('token', t); localStorage.setItem('seenVersion', s); localStorage.setItem('notifyDismissed', '1'); sessionStorage.setItem('__i', '1'); } } catch {} }, [account ? SEED.accounts[account].token : null, seen]);
  const page = await ctx.newPage();
  await page.goto(SEED.base + '/');
  if (account) await page.waitForSelector('#app:not(.hidden)');
  await sleep(1200);
  return { ctx, page };
}
async function axe(page, label) {
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(async () => {
    const res = await window.axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast', 'target-size'] }, resultTypes: ['violations'] });
    return res.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 140), summary: (n.any[0]?.message || n.failureSummary || '').slice(0, 220), data: n.any[0]?.data || null })) }));
  });
  return { tela: label, violacoes: r };
}
// Alvos pequenos no toque: elementos clicáveis visíveis com menos de 24×24 (AA) e menos de 44×44 (recomendação de plataforma).
async function targets(page, label) {
  return page.evaluate((label) => {
    const els = [...document.querySelectorAll('button, a[href], [role=button], input:not([type=hidden]), select, .channel, .member, .rail-item, [tabindex]:not([tabindex="-1"])')];
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
    const out = [];
    for (const el of els) {
      if (!vis(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) out.push({ el: (el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + [...el.classList].slice(0, 2).join('.')), w: Math.round(r.width), h: Math.round(r.height), aa: r.width >= 24 && r.height >= 24, label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30) });
    }
    return { tela: label, abaixo44: out.length, abaixo24: out.filter((o) => !o.aa).length, itens: out };
  }, label);
}
// Foco: aperta Tab N vezes e confere se o elemento focado ganhou contorno ou sombra visível.
async function focus(page, label, n = 45) {
  const res = [];
  await page.mouse.click(5, 5).catch(() => {});
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement; if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
      const shadow = s.boxShadow && s.boxShadow !== 'none';
      const r = el.getBoundingClientRect();
      return { el: (el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + [...el.classList].slice(0, 2).join('.')), label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30), outline, outlineColor: s.outlineColor, outlineWidth: s.outlineWidth, shadow: shadow ? s.boxShadow.slice(0, 80) : '', visivel: r.width > 0 && r.height > 0 };
    });
    if (info) res.push(info);
  }
  const sem = res.filter((r) => r.visivel && !r.outline && !r.shadow);
  return { tela: label, focados: res.length, sem_indicador: sem.length, itens: sem, todos: res.map((r) => r.el + (r.outline ? ' [contorno ' + r.outlineWidth + ' ' + r.outlineColor + ']' : r.shadow ? ' [sombra]' : ' [NADA]')) };
}

(async () => {
  const browser = await chromium.launch();
  const out = { contraste: [], alvos: [], foco: [] };
  const screens = [
    ['chat', async (p) => {}],
    ['membros-perfil', async (p) => { await p.locator('#member-list .member', { hasText: 'Bruno' }).first().click(); await sleep(700); }],
    ['config-perfil', async (p) => { await p.click('#btn-settings'); await sleep(900); }],
    ['config-voz', async (p) => { await p.click('#btn-settings'); await sleep(700); await p.click('#tab-voice'); await sleep(700); }],
    ['amigos', async (p) => { await p.click('#rail-home'); await sleep(500); await p.click('#nav-friends'); await sleep(700); }],
    ['menu-servidor', async (p) => { await p.click('#server-header'); await sleep(600); }],
    ['chamada', async (p) => { await p.locator('#channel-groups .channel', { hasText: 'Sala da resenha' }).first().click(); await sleep(3500); }],
  ];
  for (const [name, setup] of screens) {
    for (const size of ['desk', 'cel']) {
      try {
        const { ctx, page } = await open(browser, size);
        if (size === 'cel' && /config|amigos|menu-servidor|chamada/.test(name)) { await page.click('#btn-channels').catch(() => {}); await sleep(500); }
        if (size === 'cel' && name === 'membros-perfil') { await page.click('#btn-members').catch(() => {}); await sleep(600); }
        await setup(page);
        out.contraste.push(await axe(page, name + '-' + size));
        if (size === 'cel') out.alvos.push(await targets(page, name + '-' + size));
        if (size === 'desk' && ['chat', 'config-perfil'].includes(name)) out.foco.push(await focus(page, name + '-' + size));
        await ctx.close();
        console.log('ok', name, size);
      } catch (e) { console.log('falhou', name, size, e.message.split('\n')[0]); }
    }
  }
  // Entrada (sem conta)
  for (const size of ['desk', 'cel']) {
    const ctx = await browser.newContext({ ...SIZES[size] });
    const page = await ctx.newPage(); await page.goto(SEED.base + '/#entrar'); await sleep(1000);
    out.contraste.push(await axe(page, 'entrar-' + size));
    if (size === 'desk') out.foco.push(await focus(page, 'entrar-' + size, 10));
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  // Resumo
  for (const c of out.contraste) { const cc = c.violacoes.find((v) => v.id === 'color-contrast'); const ts = c.violacoes.find((v) => v.id === 'target-size'); console.log(c.tela, 'contraste:', cc ? cc.nodes.length : 0, 'alvo:', ts ? ts.nodes.length : 0); }
  for (const a of out.alvos) console.log(a.tela, '<44:', a.abaixo44, '<24:', a.abaixo24);
  for (const f of out.foco) console.log(f.tela, 'focados', f.focados, 'sem indicador', f.sem_indicador);
})();
