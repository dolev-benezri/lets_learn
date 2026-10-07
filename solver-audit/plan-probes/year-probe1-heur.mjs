// year-probe1-heur.mjs - probe 1: the "top-50 cut loses 1/13" instances of year-heuristics.mjs (same generator, same seeds): does the F-11 design close the gap?
// Configs on the instrumented copy: orig = web/ searchYear; Kx = B topK x; distinct50 = A top-50 DISTINCT course sets; nocut = A_TOP=1e9 (flat, no cut).
// Reference = refYear (exhaustive, B subsets included, 'zero' empty convention). Only non-partial runs are compared.
// RUN: node solver-audit/plan-probes/year-probe1-heur.mjs [nSeeds=60]
import { searchYear } from '../../web/solver-core.js';
import { refYear } from '../repro/year-lib.mjs';
import { genInstance } from '../repro/year-gen.mjs';
import { loadProto, setKnobs } from './year-proto-lib.mjs';
const N = +(process.argv[2] ?? 60);
const P = await loadProto();
const gen = (seed) => genInstance(seed, { n: 8, where: [['א'], ['א'], ['א', 'ב'], ['א', 'ב'], ['ב']], maxGroupsA: 5, maxGroupsB: 2, mustP: 0.12, passedP: 0, capP: 0.05, blockP: 0.05, pinP: 0, failedP: 0, preP: 0.1, fullP: 0.05 });
const cfgs = [['orig', null, {}], ['K5', P.searchYear, { __B_K: 5 }], ['distinct50 K1', P.searchYear, { __A_DISTINCT: 1 }], ['distinct50 K5', P.searchYear, { __A_DISTINCT: 1, __B_K: 5 }],
  ['distinct50 K10', P.searchYear, { __A_DISTINCT: 1, __B_K: 10 }], ['nocut K5', P.searchYear, { __B_K: 5, __A_TOP: 1e9 }], ['nocut K1', P.searchYear, { __A_TOP: 1e9 }]];
const stat = Object.fromEntries(cfgs.map(([n]) => [n, { lose: 0, max: 0, ms: 0 }]));
let big = 0, used = 0;
for (let seed = 1; seed <= N; seed++) {
  const inst = gen(seed);
  const ref = refYear({ ...inst, opts: { emptyConvention: 'zero' } });
  if (!ref.pairs.length) continue;
  used++;
  if (ref.nA <= 50) continue;
  big++;
  const line = [];
  for (const [n, fn, knobs] of cfgs) {
    setKnobs(knobs);
    const t = performance.now();
    const res = (fn ?? searchYear)({ ...inst, topK: 100000, timeLimitMs: 20000 });
    stat[n].ms += performance.now() - t;
    const gap = ref.pairs[0].score - (res.results[0]?.score ?? -Infinity);
    if (res.partial) { line.push(`${n}:partial`); continue; }
    if (gap > 1e-6) { stat[n].lose++; stat[n].max = Math.max(stat[n].max, gap); line.push(`${n}:-${gap.toFixed(3)}`); }
  }
  console.log(`seed ${seed} (A selections ${ref.nA}, ref best ${ref.pairs[0].score.toFixed(3)}): ${line.join(' ') || 'all equal ref'}`);
}
console.log(`instances with a reference plan=${used}; with >50 A selections=${big}`);
for (const [n] of cfgs) console.log(`  ${n.padEnd(16)} best below FULL in ${stat[n].lose}/${big} (max ${stat[n].max.toFixed(3)}) total ${Math.round(stat[n].ms)}ms`);
