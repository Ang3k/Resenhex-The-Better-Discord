// Optional real Electron + RVC + P2P test. Uses isolated accounts and synthetic test speech.
// Requires Playwright, Chromium, Electron, a configured Python runtime and downloaded catalog models.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');
const { _electron, chromium } = require('playwright');
const catalog = require('../desktop/lib/voice-catalog.json');

const root = path.resolve(__dirname, '..');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  const python = process.env.RESENHEX_VOICE_PYTHON, models = process.env.RESENHEX_VOICE_DATA_DIR, wav = process.env.RESENHEX_VOICE_TEST_WAV;
  assert.ok(python && models && wav, 'Set RESENHEX_VOICE_PYTHON, RESENHEX_VOICE_DATA_DIR and RESENHEX_VOICE_TEST_WAV');
  const expected = process.env.RESENHEX_VOICE_TEST_EXPECT || 'realtime';
  const backend = process.env.RESENHEX_VOICE_TEST_BACKEND || 'auto';
  const voice = process.env.RESENHEX_VOICE_TEST_MODEL || 'braum';
  assert.ok(catalog.voices.some((v) => v.id === voice), 'Test model must be in the catalog');
  assert.ok(['realtime', 'fallback'].includes(expected), 'Expected mode must be realtime or fallback');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resenhex-voice-e2e-'));
  const port = 39000 + Math.floor(Math.random() * 10000), base = 'http://127.0.0.1:' + port;
  const server = spawn(process.execPath, [path.join(root, 'server.js')], { env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DATA_FILE: path.join(dir, 'data.json'), UPLOAD_DIR: path.join(dir, 'uploads'), DOWNLOAD_DIR: path.join(dir, 'downloads'), ACCESS_PASSWORD: '', ACCESS_PASSWORD_B64: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let electron, browser;
  const clients = [], errors = [];
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + '/config')).ok) break; } catch {} await pause(100); }
    async function account(name) {
      const socket = io(base, { transports: ['websocket'] }); clients.push(socket);
      socket.on('state', (state) => { socket.last = state; });
      socket.call = (event, payload) => new Promise((resolve, reject) => socket.timeout(10000).emit(event, payload, (error, result) => error || result?.error ? reject(error || new Error(result.error)) : resolve(result)));
      const auth = await socket.call('auth', { mode: 'register', name, password: 'voice-test-only', confirmPassword: 'voice-test-only' });
      return { socket, auth };
    }
    const speaker = await account('Teste voz IA'), listener = await account('Ouvinte navegador');
    const created = await speaker.socket.call('server:create', { name: 'Teste local IA' });
    const invite = await speaker.socket.call('server:invite', {});
    await listener.socket.call('server:join', { code: invite.code });
    await pause(100);
    const room = speaker.socket.last.channels.find((c) => c.type === 'voice').id;
    const mediaFlags = ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--force-webrtc-ip-handling-policy=default', '--allow-loopback-in-peer-connection', '--disable-features=WebRtcHideLocalIpsWithMdns,LocalNetworkAccessWebRTC,LocalNetworkAccessChecksWebRTC,LocalNetworkAccessChecksWebRTCLoopbackOnly', '--use-file-for-fake-audio-capture=' + wav];
    electron = await _electron.launch({ executablePath: path.join(root, 'desktop/node_modules/electron/dist/electron'), cwd: path.join(root, 'desktop'), args: ['.', ...mediaFlags],
      env: { ...process.env, RESENHEX_URL: base, RESENHEX_USER_DATA_DIR: path.join(dir, 'desktop'), RESENHEX_VOICE_PYTHON: python, RESENHEX_VOICE_DATA_DIR: models } });
    let page;
    for (let i = 0; i < 100; i++) { page = electron.context().pages().find((p) => p.url().startsWith(base)); if (page) break; await pause(100); }
    assert.ok(page, 'Electron opened the site');
    page.on('pageerror', (error) => errors.push(error.message));
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: mediaFlags });
    const receiver = await browser.newPage(); receiver.on('pageerror', (error) => errors.push(error.message));
    await receiver.context().grantPermissions(['microphone', 'camera'], { origin: base });
    function instrument() {
      window.voiceTestPeers = [];
      const Original = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends Original { constructor(...args) { super(...args); window.voiceTestPeers.push(this); this.voiceCandidates = []; this.addEventListener('icecandidate', (event) => { if (event.candidate) this.voiceCandidates.push(event.candidate.candidate); }); } };
    }
    await page.addInitScript(instrument); await receiver.addInitScript(instrument);
    await page.evaluate(({ token, id }) => {
      localStorage.setItem('token', token); localStorage.setItem('serverId', id);
      localStorage.setItem('noiseMode', 'off'); localStorage.setItem('voiceFx', 'ai'); localStorage.setItem('echoCancellation', 'false');
      localStorage.setItem('sensAuto', 'false'); localStorage.setItem('sensThreshold', '-80');
    }, { token: speaker.auth.token, id: created.id });
    await receiver.addInitScript(({ token, id }) => { localStorage.setItem('token', token); localStorage.setItem('serverId', id); localStorage.setItem('noiseMode', 'off'); }, { token: listener.auth.token, id: created.id });
    await page.reload(); await receiver.goto(base);
    for (const view of [page, receiver]) {
      await view.waitForFunction(() => typeof window.APP_VERSION === 'string');
      await view.evaluate(() => localStorage.setItem('seenVersion', window.APP_VERSION));
      await view.evaluate(() => document.querySelector('#changelog .cl-close')?.click());
    }
    await page.waitForFunction(() => !!window.resenhexDesktop?.voiceAi && !document.querySelector('#btn-settings').disabled);
    // Exercise real preload/main-process RPC and ONNX separately from the continuous audio deadline.
    // Slow hardware must still produce valid PCM and then safely recover the live call.
    const probe = await page.evaluate(async ({ backend, voice }) => {
      const api = window.resenhexDesktop.voiceAi;
      const installed = await api.install(voice);
      if (!installed.voices.find((v) => v.id === voice)?.installed) throw new Error('Test model was not installed');
      await api.configure({ model: voice, backend, performance: 'fast' });
      const session = await api.open();
      try {
        const pcm = Float32Array.from({ length: session.blockMs * 48 }, (_, i) => .08 * Math.sin(i * 2 * Math.PI * 220 / 48000));
        const reply = await api.convert({ stream: session.stream, epoch: 1, pcm });
        const output = new Float32Array(reply.pcm);
        return { installed: true, samples: output.length, finite: output.every(Number.isFinite), inferenceMs: reply.inferenceMs, rtf: reply.rtf, backend: reply.backend };
      } finally { await api.close(session.stream); }
    }, { backend, voice });
    assert.equal(probe.samples, 3840); assert.equal(probe.finite, true);
    assert.ok(probe.inferenceMs > 0 && Number.isFinite(probe.rtf), 'The packaged bridge runs real inference');
    await page.evaluate(() => { window.voiceTestMetrics = []; window.VoiceAI.subscribe((_state, metrics) => { if (metrics) window.voiceTestMetrics.push({ ...metrics }); }); });
    await page.locator('#btn-settings').click();
    await page.waitForFunction((count) => document.querySelectorAll('.voice-ai-card').length === count, catalog.voices.length);
    assert.ok((await page.locator('#voice-ai-catalog').textContent()).includes(catalog.voices.find((v) => v.id === voice).name));
    for (const character of catalog.voices.filter((v) => v.icon)) {
      const portrait = page.locator(`.vfx-card[data-fx="ai:${character.id}"] img`);
      await portrait.waitFor({ state: 'attached' });
      assert.equal(await portrait.getAttribute('src'), character.icon);
      await page.waitForFunction((id) => document.querySelector(`.vfx-card[data-fx="ai:${id}"] img`)?.naturalWidth > 0, character.id);
    }
    // Close settings without altering the chosen effect in localStorage.
    await page.keyboard.press('Escape');
    await receiver.locator(`[data-channel-id="${room}"] .channel-entry`).click();
    await page.locator(`[data-channel-id="${room}"] .channel-entry`).click();
    try { await receiver.waitForFunction(() => window.voiceTestPeers.some((pc) => pc.connectionState === 'connected'), null, { timeout: 15000 }); }
    catch (error) {
      for (const view of [page, receiver]) console.error('ICE details', await view.evaluate(() => window.voiceTestPeers.map((pc) => ({ configuration: pc.getConfiguration(), candidates: pc.voiceCandidates, gathering: pc.iceGatheringState, localSdp: pc.localDescription?.sdp, remoteSdp: pc.remoteDescription?.sdp }))));
      throw error;
    }
    if (expected === 'fallback') await page.waitForFunction(() => window.voiceTestMetrics.some((m) => m.error), null, { timeout: 15000 });
    else await page.waitForFunction(() => window.voiceTestMetrics.some((m) => m.convertedBlocks >= 30 && m.latencyP95 > 0), null, { timeout: 15000 });
    const metrics = await page.evaluate(() => window.voiceTestMetrics);
    assert.ok(metrics.some((m) => m.active), 'The real RVC engine was started');
    if (expected === 'fallback') assert.ok(metrics.some((m) => m.error), 'Slow CPU conversion recovers normal voice');
    else {
      assert.ok(metrics.some((m) => m.latencyP95 > 0 && m.latencyP95 <= 650), 'Converted audio reached the actual AudioWorklet output within its deadline');
      assert.ok(!metrics.some((m) => m.error), 'Continuous real-time conversion remains active');
    }
    async function senderEnabled() { return page.evaluate(() => window.voiceTestPeers.flatMap((pc) => pc.getSenders()).find((sender) => sender.track?.kind === 'audio')?.track.enabled); }
    assert.equal(await senderEnabled(), true);
    await page.locator('#sc-mic').click(); assert.equal(await senderEnabled(), false);
    await page.locator('#sc-mic').click(); assert.equal(await senderEnabled(), true);
    const received = await receiver.evaluate(async () => {
      const stats = await Promise.all(window.voiceTestPeers.map((pc) => pc.getStats()));
      return stats.flatMap((report) => [...report.values()]).filter((s) => s.type === 'inbound-rtp' && s.kind === 'audio').reduce((n, s) => n + (s.bytesReceived || 0), 0);
    });
    assert.ok(received > 500, 'The browser receives ordinary Opus audio');
    await page.locator('#sc-mic-devices').click();
    await page.locator('#voice-fx-toggle').click();
    assert.ok(await page.locator('.vfx-chip[data-fx="robo"]').count());
    for (const character of catalog.voices.filter((v) => v.icon)) {
      assert.equal(await page.locator(`.vfx-chip[data-fx="ai:${character.id}"] img`).getAttribute('src'), character.icon);
    }
    if (process.env.RESENHEX_VOICE_MENU_SCREENSHOT) {
      await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 1100));
      await page.screenshot({ path: process.env.RESENHEX_VOICE_MENU_SCREENSHOT, fullPage: true });
    }
    await page.keyboard.press('Escape');
    await page.locator('#btn-settings').click();
    await page.locator('#tab-voice').click();
    if (expected === 'fallback') assert.match(await page.locator('#voice-ai-status').textContent(), /voz voltou ao normal|não acompanha|Conversão lenta/);
    await page.locator('#voice-ai-panel').scrollIntoViewIfNeeded();
    const screenshot = process.env.RESENHEX_VOICE_SCREENSHOT;
    if (screenshot) {
      await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 1100));
      await page.locator('#voice-fx-grid').evaluate((node) => node.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: screenshot, fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, expected, voice, catalogVoices: catalog.voices.length, probe, receivedBytes: received, realInferenceBlocks: Math.max(...metrics.map((m) => m.convertedBlocks || 0)), localLatencyP95Ms: metrics.findLast((m) => m.latencyP95)?.latencyP95 || null, recovery: metrics.findLast((m) => m.error)?.error || null }, null, 2));
  } catch (error) {
    if (electron) for (const view of electron.context().pages().filter((p) => p.url().startsWith(base))) console.error('Electron diagnostics', await view.evaluate(() => ({ errors: window.voiceTestMetrics, peers: window.voiceTestPeers?.map((pc) => ({ connection: pc.connectionState, ice: pc.iceConnectionState, signaling: pc.signalingState, local: pc.localDescription?.type, remote: pc.remoteDescription?.type })), notices: [...document.querySelectorAll('.toast')].map((n) => n.textContent) } )).catch(() => null));
    if (browser) for (const view of browser.contexts().flatMap((c) => c.pages())) console.error('Browser diagnostics', await view.evaluate(() => ({ peers: window.voiceTestPeers?.map((pc) => ({ connection: pc.connectionState, ice: pc.iceConnectionState, signaling: pc.signalingState, local: pc.localDescription?.type, remote: pc.remoteDescription?.type })), notices: [...document.querySelectorAll('.toast')].map((n) => n.textContent) })).catch(() => null));
    console.error('Page errors', errors); throw error;
  } finally {
    if (electron) await electron.close(); if (browser) await browser.close(); clients.forEach((s) => s.disconnect());
    const stopped = new Promise((resolve) => server.once('exit', resolve)); server.kill(); await stopped;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
