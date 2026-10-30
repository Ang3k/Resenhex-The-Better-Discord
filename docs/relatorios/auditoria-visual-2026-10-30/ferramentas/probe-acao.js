// Onde vai o tempo de uma ação: trace do CDP (CPU 4×) somando a duração por tipo de evento durante N repetições.
// Uso: node probe-acao.js <seed.json> <acao: emoji|memes|servidor|menus|membro> [repeticoes]
const { chromium } = require('playwright');
const fs = require('fs');
const SEED = JSON.parse(fs.readFileSync(process.argv[2]));
const ACAO = process.argv[3];
const N = Number(process.argv[4] || 6);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' });
  await ctx.addInitScript(([t]) => { localStorage.setItem('token', t); localStorage.setItem('seenVersion', '2.2.0'); localStorage.setItem('notifyDismissed', '1'); }, [SEED.accounts.ana.token]);
  const page = await ctx.newPage();
  await page.goto(SEED.base + '/'); await page.waitForSelector('#app:not(.hidden)'); await sleep(2500);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // Cada interação fica com o rótulo da ação marcada antes dela (o maior evento da interação vale).
  await page.evaluate(() => { window.__ev = []; window.__label = ''; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.interactionId) window.__ev.push([window.__label, e.interactionId, Math.round(e.duration), e.name]); }).observe({ type: 'event', buffered: false, durationThreshold: 16 }); });
  const mark = (label) => page.evaluate((l) => { window.__label = l; }, label);
  const events = [];
  cdp.on('Tracing.dataCollected', (d) => events.push(...d.value));
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
  for (let i = 0; i < N; i++) {
    if (ACAO === 'emoji') { await mark('abrir emoji'); await page.click('#btn-emoji'); await sleep(900); await mark('fechar'); await page.keyboard.press('Escape'); await sleep(500); }
    if (ACAO === 'memes') { await mark('#memes'); await page.locator('#channel-groups .channel', { hasText: 'memes' }).first().click(); await sleep(900); await mark('#geral'); await page.locator('#channel-groups .channel', { hasText: 'geral' }).first().click(); await sleep(1500); }
    if (ACAO === 'membro') {
      await mark('menu do membro'); await page.locator('#member-list .member', { hasText: 'Bruno' }).first().click({ button: 'right' }); await sleep(600); await mark('fechar'); await page.keyboard.press('Escape'); await sleep(500);
    }
    if (ACAO === 'menus') {
      // 4 cliques por volta: menu do membro, menu do servidor, cartão de perfil, configurações (cada um fecha com Esc).
      await mark('menu do membro'); await page.locator('#member-list .member', { hasText: 'Bruno' }).first().click({ button: 'right' }); await sleep(600); await mark('fechar'); await page.keyboard.press('Escape'); await sleep(400);
      await mark('menu do servidor'); await page.click('#server-header'); await sleep(600); await mark('fechar'); await page.keyboard.press('Escape'); await sleep(400);
      await mark('cartão de perfil'); await page.locator('#member-list .member', { hasText: 'Bruno' }).first().click(); await sleep(700); await mark('fechar'); await page.keyboard.press('Escape'); await sleep(400);
      await mark('configurações'); await page.click('#btn-settings'); await sleep(1000); await mark('fechar'); await page.keyboard.press('Escape'); await sleep(600);
    }
    if (ACAO === 'servidor') { await mark('servidor (ida)'); await page.locator('#server-list .rail-item').nth(1).click(); await sleep(1000); await mark('servidor (volta)'); await page.locator('#server-list .rail-item').nth(0).click(); await sleep(1200); }
  }
  await cdp.send('Tracing.end'); await done;
  const tot = {};
  for (const e of events) if (e.ph === 'X' && e.dur && ['UpdateLayoutTree', 'Layout', 'Paint', 'PrePaint', 'Layerize', 'FunctionCall', 'EventDispatch', 'ParseHTML', 'HitTest', 'UpdateLayer', 'CompositeLayers', 'ScrollLayer', 'RasterTask', 'Decode Image', 'StyleRecalcInvalidationTracking', 'ScheduleStyleRecalculation', 'TimerFire', 'FireAnimationFrame', 'RunMicrotasks', 'v8.compile', 'MajorGC', 'MinorGC', 'V8.GC_SCAVENGER', 'BlinkGC.AtomicPhase'].includes(e.name)) tot[e.name] = (tot[e.name] || 0) + e.dur / 1000;
  const ev = await page.evaluate(() => window.__ev);
  const by = {};
  for (const [label, id, dur] of ev) { by[label] = by[label] || {}; by[label][id] = Math.max(by[label][id] || 0, dur); }
  console.log(JSON.stringify({ acao: ACAO, respostas: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Object.values(v)])) }));
  console.log(Object.entries(tot).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' | '));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
