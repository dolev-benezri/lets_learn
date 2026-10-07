// precision-perf.mjs - wall-clock of search() on the same real-data instances: current code vs prototype (gap=slot / g2).
// Fully solved instances only (timeLimit 1e9), same instance list for every variant, best of 3 rounds.
// RUN: node solver-audit/plan-probes/precision-perf.mjs
import { search as S0 } from '../../web/solver-core.js';
import { buildProto } from './proto-lib.mjs';
import { mulberry32, realFiles, loadReal, stripSelfLoops, realInstance } from '../repro/search-lib.mjs';
const variants = { current: S0, 'proto slot-gap': (await buildProto({ gap: 'slot', tag: 'perf-slot' })).mod.search, 'proto g2-gap': (await buildProto({ gap: 'g2', tag: 'perf-g2' })).mod.search };
const files = ['2027-1', '2027-2', '2027-3'].flatMap((s) => realFiles(s).map((f) => [s, f]));
const insts = [];
for (let seed = 1; insts.length < 120 && seed < 2000; seed++) {
  const rng = mulberry32(seed * 977);
  const [s, f] = files[Math.floor(rng() * files.length)];
  const data = stripSelfLoops(loadReal(s, f));
  const inst = realInstance(rng, data, { k: 7, maxOpts: 12, maxProduct: 4_000_000 });
  if (inst.courses.length >= 5) { inst.constraints = { dayOff: [6], dayOffHard: false, notBefore: '', notAfter: '20:00', windowHard: false, maxCredits: null, maxDays: null, examsSameDay: 'forbid', includeFull: false, blocks: [], lecturers: {} };
    inst.weights = process.argv[2] === 'compact' ? { friends: 0, progress: 0, freeDays: 0, compact: 5, timeWindow: 0, examSpread: 0 } : { friends: 3, progress: 3, freeDays: 1, compact: 1, timeWindow: 1, examSpread: 1 }; inst.topK = 10; insts.push(inst); }
}
const times = {};
for (const [name, fn] of Object.entries(variants)) {
  let best = Infinity;
  for (let round = 0; round < 3; round++) { const t = performance.now(); for (const i of insts) fn({ ...i, timeLimitMs: 1e9 }); best = Math.min(best, performance.now() - t); }
  times[name] = best;
}
console.log(`INFO ${insts.length} real instances (UI default weights/constraints, k=5..7 courses): ${Object.entries(times).map(([k, v]) => `${k} ${v.toFixed(0)} ms`).join(' | ')}`);
