const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const root = path.resolve(__dirname, ".."),
  coefficients = JSON.parse(
    fs.readFileSync(
      path.join(root, "public/voice-fx-assets/coefficients.json"),
      "utf8",
    ),
  );
const core = () => import("../public/voice-fx-classic-core.mjs");

test("chosen catalog includes approved voices, keeps Radio and omits rejected duplicates", () => {
  const window = {},
    storage = {
      getItem() {
        return null;
      },
    };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "public/voice-fx.js"), "utf8"),
    { window, localStorage: storage },
  );
  for (const id of [
    "esquilo",
    "gigante",
    "telefone",
    "megafone",
    "banheiro",
    "caverna",
    "alien",
    "robo",
    "fantasma",
    "bebado",
    "autotune",
    "acordes",
    "coral",
    "radio",
  ])
    assert.ok(window.VoiceFx.valid(id), id);
  for (const id of ["monstro", "walkie-talkie", "robo-musical"])
    assert.equal(window.VoiceFx.valid(id), false, id);
  assert.equal(window.VoiceFx.PRESETS.esquilo.pitch, 8);
  assert.equal(window.VoiceFx.PRESETS.gigante.pitch, -7);
});

test("WSOLA stays causal and under 700 ms during sustained speech, then drains in silence", async () => {
  const { Drunk } = await core(),
    d = new Drunk(coefficients);
  let peak = 0;
  for (let i = 0; i < 48000 * 40; i++) {
    const x =
      i < 48000 * 37 ? 0.1 * Math.sin((2 * Math.PI * 173 * i) / 48000) : 0;
    const y = d.tick(x);
    assert.ok(Number.isFinite(y));
    peak = Math.max(peak, Math.abs(y));
  }
  assert.ok(peak > 0.03, "transformed speech remains audible");
  assert.ok(d.maximumActualDelay < 0.7, d.maximumActualDelay);
  assert.ok(d.minimumActualDelay >= 0, d.minimumActualDelay);
  assert.equal(d.delay, 0, "silence recovers the queued speech");
  d.reset();
  for (let i = 0; i < 48000; i++)
    assert.equal(d.tick(0), 0, "reset cannot replay captured speech");
});

test("Robot and spectral whisper kernels preserve finite speech and clear their histories", async () => {
  const { Robot, Whisper } = await core();
  for (const kernel of [new Robot(coefficients), new Whisper()]) {
    let energy = 0;
    for (let i = 0; i < 48000; i++) {
      const y = kernel.tick(
        0.1 * Math.sin((2 * Math.PI * 173 * i) / 48000) +
          0.03 * Math.sin((2 * Math.PI * 346 * i) / 48000),
      );
      assert.ok(Number.isFinite(y));
      energy += y * y;
    }
    assert.ok(energy > 1e-4);
    kernel.reset();
    for (let i = 0; i < 4096; i++) assert.equal(kernel.tick(0), 0);
  }
});

test("Autotalent supports ten independent layers and deterministic allocation-free reset", () => {
  const module = new WebAssembly.Module(
    fs.readFileSync(
      path.join(root, "public/vendor/autotalent/autotalent.wasm"),
    ),
  );
  assert.deepEqual(WebAssembly.Module.imports(module), []);
  const e = new WebAssembly.Instance(module, {}).exports;
  e._initialize();
  assert.equal(e.at_setup(48000), 1);
  const slots = [];
  for (let i = 0; i < 10; i++) {
    const id = e.at_new(2, 0, 0, 0.04, 4.6, 0.01, 48, 43, 45, 41);
    assert.equal(id, i);
    slots.push(id);
  }
  const initialBytes = e.memory.buffer.byteLength;
  for (const id of slots) {
    const input = new Float32Array(e.memory.buffer, e.at_input_ptr(id), 128),
      output = new Float32Array(e.memory.buffer, e.at_output_ptr(id), 128);
    for (let frame = 0; frame < 8192; frame += 128) {
      for (let i = 0; i < 128; i++)
        input[i] = 0.1 * Math.sin((2 * Math.PI * 193 * (frame + i)) / 48000);
      assert.equal(e.at_run(id, 128, frame), 1);
    }
    assert.equal(e.at_latency(id), 2047);
    e.at_reset(id);
    input.fill(0);
    for (let frame = 0; frame < 8192; frame += 128) {
      e.at_run(id, 128, frame);
      for (const sample of output) assert.equal(sample, 0);
    }
    e.at_release(id);
  }
  assert.equal(
    e.memory.buffer.byteLength,
    initialBytes,
    "rendering and reset never grow the heap",
  );
});
