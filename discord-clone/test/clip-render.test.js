const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const window = {};
  const context = vm.createContext({ window, Math, Promise, Map, Set, Float32Array, Uint8Array });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'clip-render.js'), 'utf8'), context);
  return window.ClipRender;
}

// Contexto 2D falso que anota cada chamada com o estilo em vigor naquele momento.
function fakeCtx() {
  const calls = [];
  const ctx = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, shadowBlur: 0, shadowColor: 'transparent', font: '', textAlign: 'left', textBaseline: 'alphabetic', globalAlpha: 1,
    calls,
    createRadialGradient: () => ({ addColorStop() {} }),
    measureText: (text) => ({ width: text.length * 10 }),
  };
  for (const name of ['fillRect', 'beginPath', 'arc', 'fill', 'stroke', 'save', 'restore', 'clip', 'drawImage', 'fillText', 'translate', 'scale', 'closePath', 'moveTo', 'lineTo']) {
    ctx[name] = (...args) => { calls.push({ name, args, fillStyle: ctx.fillStyle, strokeStyle: ctx.strokeStyle, font: ctx.font }); };
  }
  return ctx;
}

const people = () => [
  { profile: { name: 'Ana', color: '#d6458b', avatarUrl: null }, image: null, circle: { x: 400, y: 300, r: 100 }, speaking: true },
  { profile: { name: 'Bruno', color: '#2f9e8f', avatarUrl: null }, image: null, circle: { x: 880, y: 300, r: 100 }, speaking: false },
];

test('desenha anel verde só em quem fala', () => {
  const ctx = fakeCtx();
  load().drawFrame(ctx, { width: 1280, height: 720, people: people(), label: 'Sala 1 · 17/10 22:14', progress: 0.5 });
  assert.equal(ctx.calls.filter((c) => c.name === 'stroke' && c.strokeStyle === '#23a55a').length, 1);
});

test('sem foto usa a inicial na cor do perfil', () => {
  const ctx = fakeCtx();
  load().drawFrame(ctx, { width: 1280, height: 720, people: people(), label: 'Sala 1', progress: 0 });
  assert.ok(ctx.calls.some((c) => c.name === 'fill' && c.fillStyle === '#d6458b'), 'círculo na cor da Ana');
  assert.ok(ctx.calls.some((c) => c.name === 'fillText' && c.args[0] === 'A'));
  assert.ok(ctx.calls.some((c) => c.name === 'fillText' && c.args[0] === 'Bruno'), 'nome embaixo');
});

test('com foto desenha a imagem recortada no círculo', () => {
  const ctx = fakeCtx();
  const list = people();
  list[0].image = { width: 400, height: 200 };
  list[0].profile.avatarCrop = { x: 0.5, y: 0.5, zoom: 1 };
  load().drawFrame(ctx, { width: 1280, height: 720, people: list, label: 'Sala 1', progress: 0 });
  const draw = ctx.calls.find((c) => c.name === 'drawImage');
  assert.ok(draw, 'desenhou a foto');
  assert.ok(ctx.calls.indexOf(draw) > ctx.calls.findIndex((c) => c.name === 'clip'), 'dentro do recorte circular');
  // Mesmo recorte do editor de foto: quadrado de 200 no centro da imagem 400×200, desenhado no círculo.
  assert.deepEqual(draw.args.slice(1).map(Math.round), [100, 0, 200, 200, 300, 200, 200, 200]);
});

test('a marca e o progresso aparecem', () => {
  const ctx = fakeCtx();
  load().drawFrame(ctx, { width: 1280, height: 720, people: people(), label: 'Sala 1 · 17/10 22:14', progress: 0.25 });
  assert.ok(ctx.calls.some((c) => c.name === 'fillText' && c.args[0] === 'Resenhex' && /bold|700/.test(c.font)));
  assert.ok(ctx.calls.some((c) => c.name === 'fillText' && String(c.args[0]).includes('Sala 1 · 17/10 22:14')));
  assert.ok(ctx.calls.some((c) => c.name === 'fillRect' && c.args[1] >= 717 && c.args[2] === 320 && c.fillStyle === '#8e2fd8'));
});
