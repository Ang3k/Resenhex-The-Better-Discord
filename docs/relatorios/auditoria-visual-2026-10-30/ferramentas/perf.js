// Medição de desempenho do Resenhex (antes/depois), com CPU 4× mais lenta via CDP.
// Uso: node perf.js <seed.json> <saida.json> [cenario1,cenario2] [--rodadas=N]
// Navegador medido (A) só tem a página da Ana; os outros participantes da chamada ficam no navegador B.
const { chromium } = require('playwright');
const fs = require('fs');
const SEED = JSON.parse(fs.readFileSync(process.argv[2]));
const OUT = process.argv[3];
const ONLY = process.argv[4] && !process.argv[4].startsWith('--') ? process.argv[4].split(',') : null;
const ROUNDS = Number((process.argv.find((a) => a.startsWith('--rodadas=')) || '--rodadas=1').split('=')[1]);
const THROTTLE = Number((process.argv.find((a) => a.startsWith('--cpu=')) || '--cpu=4').split('=')[1]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const ARGS = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'benchmark', 'cc', 'viz'];

async function measuredPage(account, opts = {}) {
  const browser = await chromium.launch({ args: ARGS });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone', 'camera'], locale: 'pt-BR' });
  await ctx.addInitScript(([t, extra]) => {
    try {
      if (!sessionStorage.getItem('__init')) { localStorage.setItem('token', t); localStorage.setItem('seenVersion', '2.2.0'); localStorage.setItem('notifyDismissed', '1'); for (const [k, v] of Object.entries(extra || {})) localStorage.setItem(k, v); sessionStorage.setItem('__init', '1'); }
    } catch {}
    // Coletores no início da página: tarefas longas, quadros longos (LoAF) e tempo de resposta a eventos.
    window.__perf = { longtasks: [], loaf: [], events: [] };
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.longtasks.push({ start: e.startTime, dur: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch {}
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.loaf.push({ start: e.startTime, dur: e.duration, block: e.blockingDuration, render: e.renderStart ? e.duration - (e.renderStart - e.startTime) : 0 }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch {}
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.events.push({ name: e.name, start: e.startTime, dur: e.duration, proc: e.processingEnd - e.processingStart, id: e.interactionId || 0 }); }).observe({ type: 'event', durationThreshold: 16, buffered: true }); } catch {}
  }, [SEED.accounts[account].token, opts.storage || {}]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log('  pageerror', e.message.slice(0, 120)));
  await page.goto(SEED.base + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#app:not(.hidden)', { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  const cdp = await ctx.newCDPSession(page);
  const bcdp = await browser.newBrowserCDPSession();
  await cdp.send('Performance.enable');
  return { browser, ctx, page, cdp, bcdp };
}
async function others(names) {
  const browser = await chromium.launch({ args: ARGS });
  const pages = [];
  for (const who of names) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['microphone', 'camera'] });
    await ctx.addInitScript(([t]) => { try { if (!sessionStorage.getItem('__init')) { localStorage.setItem('token', t); localStorage.setItem('seenVersion', '2.2.0'); localStorage.setItem('notifyDismissed', '1'); sessionStorage.setItem('__init', '1'); } } catch {} }, [SEED.accounts[who].token]);
    const page = await ctx.newPage();
    await page.goto(SEED.base + '/'); await page.waitForSelector('#app:not(.hidden)');
    await joinVoice(page);
    pages.push(page);
  }
  return { browser, pages };
}
async function joinVoice(page, name = 'Sala da resenha') {
  await page.locator('#channel-groups .channel', { hasText: name }).first().click();
  await page.waitForSelector('#voice-view:not(.hidden)', { timeout: 15000 }).catch(() => {});
  await sleep(2500);
}
const procCpu = async (bcdp) => {
  const { processInfo } = await bcdp.send('SystemInfo.getProcessInfo');
  const by = {}; for (const p of processInfo) { const t = p.type === 'renderer' ? 'renderer' : p.type === 'GPU' ? 'gpu' : p.type === 'browser' ? 'browser' : 'outros'; by[t] = (by[t] || 0) + p.cpuTime; }
  return by;
};
const metrics = async (cdp) => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));

// Mede uma janela de tempo: CPU por processo, tempo de thread principal, contagem de pinturas/quadros no trace.
async function window_(M, seconds, action) {
  const { browser, page, cdp, bcdp } = M;
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await page.evaluate(() => { window.__perf.longtasks = []; window.__perf.loaf = []; window.__perf.events = []; });
  const m0 = await metrics(cdp); const c0 = await procCpu(bcdp); const t0 = Date.now();
  await browser.startTracing(page, { categories: CATS });
  let extra = null;
  if (action) extra = await action(); else await sleep(seconds * 1000);
  const buf = await browser.stopTracing();
  const wall = (Date.now() - t0) / 1000;
  const m1 = await metrics(cdp); const c1 = await procCpu(bcdp);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const perf = await page.evaluate(() => window.__perf);
  const evs = JSON.parse(buf.toString()).traceEvents;
  const count = (name) => evs.filter((e) => e.name === name && (e.ph === 'X' || e.ph === 'B' || e.ph === 'I' || e.ph === 'i' || e.ph === 'n' || e.ph === 'b')).length;
  // Quadros: eventos PipelineReporter (um por quadro), separados em apresentados e descartados.
  const reporters = evs.filter((e) => e.name === 'PipelineReporter' && e.ph === 'b');
  const states = {}; for (const e of reporters) { const s = e.args?.chrome_frame_reporter?.state || 'desconhecido'; states[s] = (states[s] || 0) + 1; }
  const out = {
    segundos: +wall.toFixed(2),
    cpu_ms_por_s: Object.fromEntries(Object.keys(c1).map((k) => [k, +(((c1[k] - (c0[k] || 0)) * 1000) / wall).toFixed(1)])),
    thread_principal_ms_por_s: +(((m1.TaskDuration - m0.TaskDuration) * 1000) / wall).toFixed(1),
    script_ms_por_s: +(((m1.ScriptDuration - m0.ScriptDuration) * 1000) / wall).toFixed(1),
    estilo_ms_por_s: +(((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000) / wall).toFixed(1),
    layout_ms_por_s: +(((m1.LayoutDuration - m0.LayoutDuration) * 1000) / wall).toFixed(1),
    recalc_estilo: m1.RecalcStyleCount - m0.RecalcStyleCount,
    layouts: m1.LayoutCount - m0.LayoutCount,
    pinturas: count('Paint'),
    pinturas_por_s: +(count('Paint') / wall).toFixed(1),
    quadros: reporters.length,
    quadros_por_s: +(reporters.length / wall).toFixed(1),
    estados_quadro: states,
    commits: count('Commit'),
    timers_por_s: +(count('TimerFire') / wall).toFixed(1),
    tarefas_longas: perf.longtasks.length,
    maior_tarefa_ms: Math.round(Math.max(0, ...perf.longtasks.map((t) => t.dur))),
    loaf: perf.loaf.length,
    maior_loaf_ms: Math.round(Math.max(0, ...perf.loaf.map((t) => t.dur))),
    eventos: perf.events.filter((e) => e.id).length,
    maior_resposta_ms: Math.round(Math.max(0, ...perf.events.filter((e) => e.id).map((e) => e.dur))),
    respostas_acima_100ms: perf.events.filter((e) => e.id && e.dur > 100).length,
  };
  if (extra) Object.assign(out, extra);
  return out;
}
// Intervalos entre quadros com rAF durante uma ação (só nos cenários interativos).
async function withFrames(page, fn) {
  await page.evaluate(() => { window.__frames = []; window.__rafOn = true; let last = performance.now(); const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__rafOn) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await fn();
  const frames = await page.evaluate(() => { window.__rafOn = false; return window.__frames.slice(1); });
  const dropped = frames.filter((d) => d > 1.5 * 16.7).length;
  const sorted = [...frames].sort((a, b) => a - b);
  return { quadros_raf: frames.length, quadros_atrasados: dropped, pct_atrasados: +((100 * dropped) / Math.max(1, frames.length)).toFixed(1), fps_medio: +(1000 / (frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length))).toFixed(1), p95_quadro_ms: +(sorted[Math.floor(sorted.length * 0.95)] || 0).toFixed(1) };
}

const scenarios = {
  async ocioso() {
    const M = await measuredPage('ana');
    await sleep(3000);
    const r = await window_(M, 10);
    await M.browser.close();
    return r;
  },
  async chamada_palco() {
    const O = await others(['bruno', 'caio']);
    const M = await measuredPage('ana');
    await joinVoice(M.page); await sleep(3000);
    const r = await window_(M, 10);
    await M.browser.close(); await O.browser.close();
    return r;
  },
  async chamada_no_chat() {
    const O = await others(['bruno', 'caio']);
    const M = await measuredPage('ana');
    await joinVoice(M.page);
    await M.page.locator('#channel-groups .channel', { hasText: 'geral' }).first().click();
    await sleep(3000);
    const r = await window_(M, 10);
    await M.browser.close(); await O.browser.close();
    return r;
  },
  async chamada_sem_foco() {
    // App de desktop minimizado ou jogo em tela cheia: com backgroundThrottling: false a página continua "visível";
    // o site só perde o foco da janela.
    const O = await others(['bruno', 'caio']);
    const M = await measuredPage('ana');
    await joinVoice(M.page); await sleep(1500);
    await M.cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false }).catch(() => {});
    await M.page.evaluate(() => { window.dispatchEvent(new Event('blur')); document.dispatchEvent(new Event('blur')); });
    await sleep(2000);
    const r = await window_(M, 10);
    await M.browser.close(); await O.browser.close();
    return r;
  },
  async chamada_escondida() {
    // Aba escondida no navegador (ou o app avisando que a janela sumiu): visibilityState = hidden.
    const O = await others(['bruno', 'caio']);
    const M = await measuredPage('ana');
    await joinVoice(M.page); await sleep(1500);
    await M.page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('blur'));
    });
    await sleep(2000);
    const r = await window_(M, 10);
    await M.browser.close(); await O.browser.close();
    return r;
  },
  async rolagem() {
    const M = await measuredPage('ana');
    await sleep(2000);
    await M.page.hover('#messages');
    const r = await window_(M, 0, async () => withFrames(M.page, async () => {
      for (let i = 0; i < 60; i++) { await M.page.mouse.wheel(0, -400); await sleep(50); }
      for (let i = 0; i < 30; i++) { await M.page.mouse.wheel(0, 800); await sleep(50); }
    }));
    r.mensagens = await M.page.locator('#messages .msg').count();
    await M.browser.close();
    return r;
  },
  async menus_modais() {
    const M = await measuredPage('ana');
    await sleep(2000);
    const p = M.page;
    const mark = (name) => p.evaluate((n) => performance.mark('acao:' + n), name);
    const r = await window_(M, 0, async () => withFrames(p, async () => {
      const own = p.locator('#messages .msg', { hasText: 'Olha o print' }).first();
      for (let i = 0; i < 2; i++) {
        await mark('menu-membro'); await p.locator('#member-list .member', { hasText: 'Bruno' }).first().click({ button: 'right' }); await sleep(450); await p.keyboard.press('Escape'); await sleep(350);
        await mark('emoji'); await p.click('#btn-emoji'); await sleep(600); await p.keyboard.press('Escape'); await sleep(350);
        await mark('menu-servidor'); await p.click('#server-header'); await sleep(450); await p.keyboard.press('Escape'); await sleep(350);
        await mark('perfil'); await p.locator('#member-list .member', { hasText: 'Bruno' }).first().click(); await sleep(600); await p.keyboard.press('Escape'); await sleep(350);
        await mark('configuracoes'); await p.click('#btn-settings'); await sleep(900); await p.keyboard.press('Escape'); await sleep(500);
        await mark('canal-memes'); await p.locator('#channel-groups .channel', { hasText: 'memes' }).first().click(); await sleep(700);
        await mark('canal-geral'); await p.locator('#channel-groups .channel', { hasText: 'geral' }).first().click(); await sleep(900);
        await mark('servidor-2'); await p.locator('#server-list .rail-item').nth(1).click(); await sleep(1000);
        await mark('servidor-1'); await p.locator('#server-list .rail-item').nth(0).click(); await sleep(1000);
      }
    }));
    // Resposta por ação: a maior interação depois de cada marca.
    r.por_acao = await p.evaluate(() => {
      const marks = performance.getEntriesByType('mark').filter((m) => m.name.startsWith('acao:'));
      const out = {};
      for (const e of window.__perf.events.filter((x) => x.id)) {
        const m = marks.filter((mk) => mk.startTime <= e.start).pop();
        if (!m) continue;
        const k = m.name.slice(5);
        out[k] = Math.max(out[k] || 0, Math.round(e.dur));
      }
      return out;
    });
    await M.browser.close();
    return r;
  },
};

(async () => {
  const results = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT)) : {};
  for (const name of ONLY || Object.keys(scenarios)) {
    results[name] = results[name] || [];
    for (let i = 0; i < ROUNDS; i++) {
      log(name, 'rodada', i + 1);
      try { const r = await scenarios[name](); results[name].push(r); log('  ', JSON.stringify(r)); }
      catch (e) { log('  ✗', e.message.split('\n')[0]); results[name].push({ erro: e.message.split('\n')[0] }); }
      fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
    }
  }
})();
