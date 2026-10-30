// Onde vai o tempo de uma ação: trace do CDP (CPU 4×) somando a duração por tipo de evento durante N repetições.
// Uso: node probe-acao.js <seed.json> <acao: emoji|memes|servidor> [repeticoes]
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
  await page.evaluate(() => { window.__ev = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.interactionId) window.__ev.push(Math.round(e.duration)); }).observe({ type: 'event', buffered: false, durationThreshold: 16 }); });
  const events = [];
  cdp.on('Tracing.dataCollected', (d) => events.push(...d.value));
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
  for (let i = 0; i < N; i++) {
    if (ACAO === 'emoji') { await page.click('#btn-emoji'); await sleep(900); await page.keyboard.press('Escape'); await sleep(500); }
    if (ACAO === 'memes') { await page.locator('#channel-groups .channel', { hasText: 'memes' }).first().click(); await sleep(900); await page.locator('#channel-groups .channel', { hasText: 'geral' }).first().click(); await sleep(1500); }
    if (ACAO === 'servidor') { await page.locator('#server-list .rail-item').nth(1).click(); await sleep(1000); await page.locator('#server-list .rail-item').nth(0).click(); await sleep(1200); }
  }
  await cdp.send('Tracing.end'); await done;
  const tot = {};
  for (const e of events) if (e.ph === 'X' && e.dur && ['UpdateLayoutTree', 'Layout', 'Paint', 'PrePaint', 'Layerize', 'FunctionCall', 'EventDispatch', 'ParseHTML', 'HitTest', 'UpdateLayer', 'CompositeLayers', 'ScrollLayer', 'RasterTask', 'Decode Image', 'StyleRecalcInvalidationTracking', 'ScheduleStyleRecalculation', 'TimerFire', 'FireAnimationFrame', 'RunMicrotasks', 'v8.compile', 'MajorGC', 'MinorGC', 'V8.GC_SCAVENGER', 'BlinkGC.AtomicPhase'].includes(e.name)) tot[e.name] = (tot[e.name] || 0) + e.dur / 1000;
  const ev = await page.evaluate(() => window.__ev);
  console.log(ACAO, 'respostas', ev.join(' '));
  console.log(Object.entries(tot).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' | '));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
