const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'compat.js'), 'utf8');

// Canvas falso: entende hex, rgb()/rgba(), transparent e alguns nomes, como o fillStyle de verdade.
function fakeCanvas() {
  const names = { white: '#ffffff', black: '#000000', red: '#ff0000', blue: '#0000ff' };
  const hex2 = (n) => n.toString(16).padStart(2, '0');
  let value = '#000000';
  return {
    get fillStyle() { return value; },
    set fillStyle(text) {
      text = String(text).trim().toLowerCase();
      if (names[text]) { value = names[text]; return; }
      if (text === 'transparent') { value = 'rgba(0, 0, 0, 0)'; return; }
      let m = /^#([0-9a-f]{3})$/.exec(text);
      if (m) { value = '#' + [...m[1]].map((c) => c + c).join(''); return; }
      if (/^#[0-9a-f]{6}$/.test(text)) { value = text; return; }
      m = /^rgba?\(([^)]+)\)$/.exec(text);
      if (m) {
        const [r, g, b, a = 1] = m[1].split(',').map(Number);
        value = a >= 1 ? '#' + hex2(r) + hex2(g) + hex2(b) : `rgba(${r}, ${g}, ${b}, ${a})`;
      }
    },
  };
}

// Roda o compat.js num "navegador antigo" e devolve o CSS reescrito de cada folha.
async function runOld(sheets, rootVars = {}, unsupported = ['color-mix', 'container', ':has']) {
  const styles = [];
  const head = {
    insertBefore(style) { styles.push(style); },
  };
  const links = Object.keys(sheets).map((href) => ({ href: 'http://site.test/' + href, media: '', parentNode: head, getAttribute: () => href, remove() {} }));
  const document = {
    readyState: 'complete',
    documentElement: {},
    querySelectorAll: () => links,
    createElement: (tag) => (tag === 'canvas' ? { getContext: () => fakeCanvas() } : { dataset: {}, textContent: '' }),
  };
  const window = {
    document,
    location: { origin: 'http://site.test' },
    CSS: { supports: (a, b) => !unsupported.some((u) => String(a).includes(u) || String(b).includes(u)) },
    fetch: async (url) => ({ ok: true, text: async () => sheets[url.replace('http://site.test/', '')] }),
    getComputedStyle: () => ({ getPropertyValue: (name) => rootVars[name] ?? '' }),
    MutationObserver: class { observe() {} },
    setTimeout, clearTimeout,
  };
  window.window = window;
  const context = vm.createContext({ ...window, window, URL, Int8Array, ArrayBuffer, DataView, Map, Set, Date, RegExp, Object, Array, String, Math, Promise });
  vm.runInContext(source, context);
  await new Promise((resolve) => setTimeout(resolve, 20));
  return styles.map((s) => s.textContent);
}

test('compat: color-mix vira a cor calculada com as variáveis da raiz', async () => {
  const [css] = await runOld({ 'a.css': '.x { background: color-mix(in srgb, var(--brand) 50%, #000); color: color-mix(in srgb, white 25%, transparent); }' }, { '--brand': '#ff0000' });
  assert.match(css, /background: rgb\(128, 0, 0\)/);
  assert.match(css, /color: rgba\(255, 255, 255, 0\.25\)/);
  assert.doesNotMatch(css, /color-mix/);
});

test('compat: variável só do elemento fica com a cor que pesa mais', async () => {
  const [css] = await runOld({ 'a.css': '.tile { background: color-mix(in srgb, var(--tile) 30%, #101010); border-color: color-mix(in srgb, var(--tile) 70%, transparent); }' });
  assert.match(css, /background: rgb\(16, 16, 16\)/);
  assert.match(css, /border-color: var\(--tile\)/);
});

test('compat: color-mix dentro de color-mix e dentro de variável da raiz', async () => {
  const [css] = await runOld({ 'a.css': '.y { color: color-mix(in srgb, var(--soft) 50%, #fff); }' }, { '--soft': 'color-mix(in srgb, #000 50%, #000)' });
  assert.match(css, /color: rgb\(128, 128, 128\)/);
});

test('compat: @container vira @media e cqw vira vw', async () => {
  const [css] = await runOld({ 'a.css': '@container (max-width: 440px) { .b { width: 9cqw; height: 50cqh; } } @container salon-top (max-width: 900px) { .c { color: red; } }' });
  assert.match(css, /@media \(max-width: 440px\)/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /width: 9vw/);
  assert.match(css, /height: 50cqh/);
});

test('compat: tira só os seletores com :has de uma lista', async () => {
  const [css] = await runOld({ 'a.css': '#stage .tile.immersive, #stage:has(.tile.focus) .tile.immersive { position: fixed; } body:has(.x) .y { display: none; } @media (max-width: 640px) { .a, .b:has(.c) { color: red; } }' });
  assert.match(css, /#stage \.tile\.immersive *\{ position: fixed; \}/);
  assert.doesNotMatch(css, /#stage:has/);
  assert.match(css, /body:has\(\.x\) \.y \{ display: none; \}/);
  assert.match(css, /\{ \.a *\{ color: red; \}/);
});

test('compat: @supports fica como está', async () => {
  const [css] = await runOld({ 'a.css': '@supports not (color: color-mix(in srgb, red, blue)) { .z { color: red; } }' });
  assert.match(css, /@supports not \(color: color-mix\(in srgb, red, blue\)\)/);
});

test('compat: navegador novo não mexe em nada', async () => {
  const styles = await runOld({ 'a.css': '.x { color: color-mix(in srgb, red, blue); }' }, {}, []);
  assert.deepEqual(styles, []);
});

test('compat: funções novas de JavaScript', () => {
  const context = vm.createContext({});
  vm.runInContext('delete Object.hasOwn; delete Array.prototype.at; delete Array.prototype.findLast; delete Array.prototype.findLastIndex;', context);
  vm.runInContext(source, context);
  const result = vm.runInContext(`({
    own: Object.hasOwn({ a: 1 }, 'a') && !Object.hasOwn({}, 'toString'),
    at: [1, 2, 3].at(-1) + 'ab'.at(0) + new Uint8Array([7, 8]).at(-1),
    last: [1, 2, 3, 4].findLast((n) => n % 2) + ':' + [1, 2, 3].findLastIndex((n) => n > 5),
    clone: (() => { const a = { d: new Date(5), m: new Map([[1, { x: 1 }]]), list: [1, { y: 2 }] }; const b = structuredClone(a); return b !== a && b.list[1] !== a.list[1] && b.list[1].y === 2 && b.d.getTime() === 5 && b.m.get(1).x === 1; })(),
  })`, context);
  assert.deepEqual({ ...result }, { own: true, at: '3a8', last: '3:-1', clone: true });
});
