// precision-perf2.mjs - leaf-heavy case: full enumeration (prune:false), so every complete selection is scored. Same instances for every variant.
// RUN: node solver-audit/plan-probes/precision-perf2.mjs
import { search as S0 } from '../../web/solver-core.js';
import { buildProto } from './proto-lib.mjs';
import { mulberry32, realFiles, loadReal, stripSelfLoops, realInstance } from '../repro/search-lib.mjs';
const variants = { current: S0, 'proto slot-gap': (await buildProto({ gap: 'slot', tag: 'perf-slot' })).mod.search, 'proto g2-gap': (await buildProto({ gap: 'g2', tag: 'perf-g2' })).mod.search };
const files = ['2027-1', '2027-2', '2027-3'].flatMap((s) => realFiles(s).map((f) => [s, f]));
const insts = [];
for (let seed = 1; insts.length < 12 && seed < 3000; seed++) {
  const rng = mulberry32(seed * 31);
  const [s, f] = files[Math.floor(rng() * files.length)];
  const inst = realInstance(rng, stripSelfLoops(loadReal(s, f)), { k: 6, maxOpts: 10, maxProduct: 60000 });
  if (inst.product < 20000) continue;
  inst.constraints = { dayOff: [6], dayOffHard: false, notBefore: '', notAfter: '20:00', windowHard: false, maxCredits: null, maxDays: null, examsSameDay: 'allow', includeFull: true, blocks: [], lecturers: {} };
  inst.weights = { friends: 3, progress: 3, freeDays: 1, compact: 1, timeWindow: 1, examSpread: 0 }; inst.topK = 10; inst.courses = inst.courses.map((c) => ({ ...c, mode: 'optional' })); insts.push(inst);
}
const times = {};
for (const [name, fn] of Object.entries(variants)) {
  let best = Infinity;
  for (let round = 0; round < 3; round++) { const t = performance.now(); for (const i of insts) fn({ ...i, timeLimitMs: 1e9, prune: false }); best = Math.min(best, performance.now() - t); }
  times[name] = best;
}
console.log(`INFO ${insts.length} instances, ~${insts.reduce((a, i) => a + i.product, 0)} option products in total, prune:false: ${Object.entries(times).map(([k, v]) => `${k} ${v.toFixed(0)} ms`).join(' | ')}`);
