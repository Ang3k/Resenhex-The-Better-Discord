const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

// CLIPAR: tela de corte, aviso de clipe novo e lista, com gravação, gerador e servidor falsos.
const publicDir = path.join(__dirname, '..', 'public');
const read = (file) => fs.readFileSync(path.join(publicDir, file), 'utf8');
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
const SR = 1000;
// Objetos criados dentro do JSDOM têm outro protótipo: compara pelo conteúdo.
const plain = (value) => JSON.parse(JSON.stringify(value));

function snapshotOf(ids, seconds = 30) {
  return {
    sampleRate: SR, takenAt: Date.UTC(2026, 9, 17, 22, 14), seconds, states: [],
    people: ids.map((accountId) => ({ accountId, profile: { name: accountId.toUpperCase(), color: '#5865f2', avatarUrl: null }, pcm: new Float32Array(seconds * SR), offset: 0, allowClips: true, left: false })),
  };
}

function harness({ recorded = 10, supported = true, context = {}, post } = {}) {
  const dom = new JSDOM('<body><div id="stage-toolbar"><button id="clip-list-btn" class="hidden"></button></div></body>', { url: 'https://resenhex.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.HTMLCanvasElement.prototype.getContext = () => new Proxy({ measureText: () => ({ width: 10 }), createRadialGradient: () => ({ addColorStop() {} }) }, {
    get: (target, key) => (key in target ? target[key] : () => {}), set: () => true,
  });
  w.requestAnimationFrame = () => 0;
  w.cancelAnimationFrame = () => {};
  w.eval(read('clip-model.js'));
  w.eval(read('clip-ui.js'));
  const el = (tag, props = {}, ...children) => {
    const node = w.document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (k.startsWith('aria')) node.setAttribute(k.replace(/^aria([A-Z])/, (_, c) => 'aria-' + c.toLowerCase()), v);
      else node[k] = v;
    }
    node.append(...children.flat().filter((c) => c != null && c !== false));
    return node;
  };
  const toasts = [], calls = [], renders = [], posts = [];
  const ctx = { selfId: 'a', selfAllow: true, localMuted: new Set(), allowNow: () => true, silencedNow: () => false, channelName: 'Sala 1', deafened: false, ...context };
  const ui = w.ClipUI({
    el, Icon: () => w.document.createElement('span'),
    toast: (text, kind) => toasts.push({ text, kind }),
    call: async (event, payload) => { calls.push({ event, payload }); return event === 'clip:link' ? { url: '/clips/' + payload.id + '?t=abc' } : null; },
    token: () => 'tok',
    buffer: { recorded: () => recorded },
    model: w.ClipModel,
    render: {
      supported: async () => supported,
      mix: async () => ({}),
      drawFrame: () => {},
      render: async (args) => { renders.push(args); return { mp4: new w.Blob([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])]), thumb: new w.Blob([new Uint8Array(80).fill(0xff)]), duration: args.end - args.start }; },
    },
    getContext: () => ctx,
    nameOf: (id) => ({ a: 'Ana', b: 'Bia' })[id] || 'Alguém',
    loadImage: async () => null,
    fetch: async (url, init) => { posts.push({ url, init }); return post ? post() : { ok: true, json: async () => ({ id: 'x' }) }; },
  });
  const d = w.document;
  const button = (text) => [...d.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
  return { w, d, ui, ctx, toasts, calls, renders, posts, button };
}

test('o atalho Clipar existe, é global e usa Alt+C', () => {
  const window = {};
  vm.runInContext(read('keybinds.js'), vm.createContext({ window, navigator: { platform: 'Win32' } }));
  const action = window.Keybinds.ACTIONS.find((a) => a.id === 'clip');
  assert.ok(action, 'ação clip');
  assert.equal(action.combo, 'Alt+KeyC');
  assert.equal(action.global, true);
  assert.equal(action.group, 'Voz');
});

test('sem áudio suficiente ou com fone desligado o botão explica e não abre', async () => {
  const early = harness({ recorded: 0.4 });
  early.ui.prepare(); await settle();
  assert.deepEqual(plain(early.ui.canClip()), { ok: false, reason: 'Espere um instante: ainda não há áudio para clipar.' });
  const deaf = harness({ context: { deafened: true } });
  deaf.ui.prepare(); await settle();
  assert.deepEqual(plain(deaf.ui.canClip()), { ok: false, reason: 'Ligue o fone para clipar.' });
  const old = harness({ supported: false });
  old.ui.prepare(); await settle();
  assert.deepEqual(plain(old.ui.canClip()), { ok: false, reason: 'Seu navegador ainda não gera o vídeo do clipe.' });
  const ready = harness();
  ready.ui.prepare(); await settle();
  assert.deepEqual(plain(ready.ui.canClip()), { ok: true });
});

test('quem desligou durante o corte não vai para o vídeo', async () => {
  const h = harness();
  h.ui.open(snapshotOf(['a', 'b'])); await settle();
  h.ctx.allowNow = (id) => id !== 'b';
  h.button('Soltar para a chamada').click(); await settle();
  assert.equal(h.renders.length, 1);
  assert.deepEqual(plain(h.renders[0].people.map((p) => p.accountId)), ['a']);
  assert.equal(h.renders[0].label.startsWith('Sala 1 · '), true);
  // Corpo enquadrado: tamanho da miniatura (u32), miniatura e MP4; quem entra vai no cabeçalho.
  assert.equal(h.posts.length, 1);
  assert.equal(h.posts[0].url, '/clips');
  assert.equal(h.posts[0].init.headers['x-token'], 'tok');
  assert.deepEqual(JSON.parse(decodeURIComponent(h.posts[0].init.headers['x-clip'])), { duration: 30, participants: ['a'] });
  const body = await new Promise((resolve) => {
    const reader = new h.w.FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.readAsArrayBuffer(h.posts[0].init.body);
  });
  assert.equal(new DataView(body.buffer).getUint32(0), 80);
  assert.equal(String.fromCharCode(...body.subarray(4 + 80 + 4, 4 + 80 + 8)), 'ftyp');
  assert.equal(h.d.querySelector('.clip-overlay'), null, 'o modal fecha depois de enviar');
});

test('erro ao enviar mantém o corte aberto e avisa', async () => {
  let answer;
  const h = harness({ post: () => new Promise((r) => { answer = r; }) });
  h.ui.open(snapshotOf(['a'])); await settle();
  const release = h.button('Soltar para a chamada');
  release.click(); await settle();
  assert.equal(release.disabled, true);
  assert.equal(release.textContent.trim(), 'Gerando o clipe…');
  answer({ ok: false, json: async () => ({ error: 'Alguém no clipe não quer ser clipado.' }) }); await settle();
  assert.ok(h.d.querySelector('.clip-overlay'), 'continua aberto');
  assert.deepEqual(plain(h.toasts.at(-1)), { text: 'Alguém no clipe não quer ser clipado.' });
  assert.equal(release.disabled, false);
  assert.equal(release.textContent.trim(), 'Soltar para a chamada');
});

test('texto da seleção usa vírgula e segundos relativos', async () => {
  const h = harness();
  h.ui.open(snapshotOf(['a', 'b'])); await settle();
  const [start, end] = h.d.querySelectorAll('.clip-handle');
  start.value = '11.4'; start.dispatchEvent(new h.w.Event('input'));
  end.value = '26.6'; end.dispatchEvent(new h.w.Event('input'));
  assert.equal(h.d.querySelector('.clip-selection').textContent, 'início −18,6 s · fim −3,4 s · 15,2 s');
  // Teclado: → anda 0,1 s na alça focada, Shift+→ anda 1 s.
  end.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(h.d.querySelector('.clip-selection').textContent, 'início −18,6 s · fim −3,3 s · 15,3 s');
  start.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
  assert.equal(h.d.querySelector('.clip-selection').textContent, 'início −19,6 s · fim −3,3 s · 16,3 s');
  // Esc descarta.
  h.d.querySelector('.clip-overlay').dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(h.d.querySelector('.clip-overlay'), null);
});

test('aviso mostra quem clipou e baixa por link de uso único', async () => {
  const h = harness();
  h.ui.showNotice({ id: 'x', creatorId: 'b', duration: 15.2, channelName: 'Sala 1', thumb: 'data:image/jpeg;base64,AA' });
  const notice = h.d.querySelector('.clip-notice');
  assert.ok(notice.textContent.includes('Bia clipou 15 s'));
  assert.ok(notice.textContent.includes('Sala 1 · só para quem está na chamada'));
  assert.equal(notice.querySelector('img').getAttribute('src'), 'data:image/jpeg;base64,AA');
  const clicked = [];
  h.w.HTMLAnchorElement.prototype.click = function () { clicked.push(this.getAttribute('href')); };
  notice.querySelector('button.clip-download').click(); await settle();
  assert.deepEqual(plain(h.calls), [{ event: 'clip:link', payload: { id: 'x' } }]);
  assert.deepEqual(clicked, ['/clips/x?t=abc']);
  h.w.close();
});

test('a lista "Clipes (n)" aparece só com clipes e baixa cada um', async () => {
  const h = harness();
  const btn = h.d.querySelector('#clip-list-btn');
  h.ui.setList([]);
  assert.equal(btn.classList.contains('hidden'), true);
  h.ui.setList([{ id: 'x', creatorId: 'a', duration: 9.6, channelName: 'Sala 1', createdAt: Date.UTC(2026, 9, 17, 22, 14), thumb: 'data:image/jpeg;base64,AA' },
    { id: 'y', creatorId: 'b', duration: 30, channelName: 'Sala 1', createdAt: Date.UTC(2026, 9, 17, 22, 16), thumb: 'data:image/jpeg;base64,AA' }]);
  assert.equal(btn.classList.contains('hidden'), false);
  assert.equal(btn.textContent.trim(), 'Clipes (2)');
  btn.click();
  const items = h.d.querySelectorAll('.clip-list-item');
  assert.equal(items.length, 2);
  assert.ok(items[0].textContent.includes('Bia'), 'o mais novo primeiro');
  assert.ok(items[1].textContent.includes('Ana'));
  h.w.HTMLAnchorElement.prototype.click = function () {};
  items[0].querySelector('button.clip-download').click(); await settle();
  assert.deepEqual(plain(h.calls), [{ event: 'clip:link', payload: { id: 'y' } }]);
});
