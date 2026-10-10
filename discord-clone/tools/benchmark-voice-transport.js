// Developer microbenchmark; uses synthetic PCM and never accesses a microphone.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const args = process.argv.slice(2);
function argument(name) { const at = args.indexOf(name); return at < 0 ? null : args[at + 1]; }
const reference = argument('--reference'), output = argument('--output');
if (!reference || !output) throw new Error('Use --reference previous-voice-protocol.js --output measurements.json');
const modules = { before: require(path.resolve(reference)), after: require('../desktop/lib/voice-protocol') };
const pcm = Buffer.from(new Float32Array(7680).fill(.25).buffer);
const meta = { id: 1, generation: 1, backend: 'cpu', inferenceMs: 100, rtf: .625 };
assert.deepEqual(modules.before.encode(meta, pcm), modules.after.encode(meta, pcm));
const wire = modules.after.encode(meta, pcm);
const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2; };
const results = [];
for (const fragment of [wire.length, 256]) {
  const packets = fragment === wire.length ? 5000 : 500;
  const fragments = [];
  for (let offset = 0; offset < wire.length; offset += fragment) fragments.push(wire.subarray(offset, offset + fragment));
  const timings = { before: [], after: [] };
  for (let trial = 0; trial < 7; trial++) {
    // Alternate order to avoid consistently favoring one warm runtime.
    for (const name of trial % 2 ? ['after', 'before'] : ['before', 'after']) {
      let received = 0, last;
      const decoder = new modules[name].Decoder((reply, audio) => {
        assert.equal(reply.id, 1); assert.equal(audio.length, pcm.length);
        received++; last = audio;
      });
      const started = performance.now();
      for (let i = 0; i < packets; i++) for (const chunk of fragments) decoder.push(chunk);
      const elapsed = performance.now() - started;
      assert.equal(received, packets); assert.deepEqual(last, pcm);
      if (trial) timings[name].push(elapsed); // discard warmup
    }
  }
  results.push({ fragmentBytes: fragment, packetsPerTrial: packets, pcmBytes: pcm.length,
    beforeMedianMs: median(timings.before), afterMedianMs: median(timings.after), trials: timings, packetsEqual: true });
}
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ node: process.version, synthetic: true, results }, null, 2) + '\n');
process.stdout.write(JSON.stringify(results.map(({ trials, ...result }) => result), null, 2) + '\n');
