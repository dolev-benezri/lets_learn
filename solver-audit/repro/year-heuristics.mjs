// year-heuristics.mjs  (PREFIX year)
// WHAT: quantifies the A-side heuristics of searchYear (web/solver-core.js:419-441): the top-50 cut of A alternatives (A_TOP, :376/:420)
//       and the per-must seeds (:426-438), against an exhaustive reference where A has far more than 50 selections.
// METHOD: instrumented COPY of solver-core.js (year-instrument.mjs) with knobs: A_TOP=1e9 (no cut), seeds off. Reference = year-lib.mjs refYear.
//   loss(cut)   = best(A_TOP=inf)  - best(original)       <- what the top-50 cut loses
//   loss(B)     = best(FULL ref)   - best(A_TOP=inf)       <- what remains (best-single-B per A, relax rounds)
//   gain(seeds) = best(original)   - best(original, seeds off)
// RUN: node solver-audit/repro/year-heuristics.mjs [nSeeds]    (default 60 seeds; ~10-40 s; wall clock only bounds the solver, results
//      are compared only when solver output is not partial)
// OUTPUT: CHECK = property that holds; BUG = defect (REPRODUCED = present).
import { searchYear } from '../../web/solver-core.js';
import { Reporter, refYear } from './year-lib.mjs';
import { genInstance } from './year-gen.mjs';
import { loadInstrumented } from './year-instrument.mjs';

const N = +(process.argv[2] ?? 60);
const R = new Reporter();
const I = await loadInstrumented();
const gen = (seed) => genInstance(seed, { n: 8, where: [['א'], ['א'], ['א', 'ב'], ['א', 'ב'], ['ב']], maxGroupsA: 5, maxGroupsB: 2, mustP: 0.12, passedP: 0, capP: 0.05, blockP: 0.05, pinP: 0, failedP: 0, preP: 0.1, fullP: 0.05 });
const run = (fn, inst, knobs = {}) => {
  Object.assign(globalThis, knobs);
  try { return fn({ ...inst, topK: 100000, timeLimitMs: 20000 }); } finally { for (const k of Object.keys(knobs)) delete globalThis[k]; }
};
// (0) the instrumented copy with default knobs must equal the original (guards the harness itself)
let same = 0, cmp = 0;
for (let seed = 1; seed <= 15; seed++) {
  const inst = gen(seed);
  const a = searchYear({ ...inst, topK: 5, timeLimitMs: 20000 }), b = I.searchYear({ ...inst, topK: 5, timeLimitMs: 20000 });
  if (a.partial || b.partial) continue;
  cmp++;
  if (JSON.stringify(a.results.map((p) => p.score)) === JSON.stringify(b.results.map((p) => p.score))) same++;
}
R.check('YEAR-HARNESS-COPY-EQUALS-ORIGINAL', cmp > 0 && same === cmp, `instrumented copy (default knobs) gives the same scores as web/solver-core.js on ${same}/${cmp} instances`);

let used = 0, big = 0, cutLossN = 0, cutLossMax = 0, cutLossSum = 0, bLossN = 0, bLossMax = 0, seedGainN = 0, seedGainMax = 0, skipPartial = 0, distinctSets = [];
const cutEx = [], seedEx = [];
for (let seed = 1; seed <= N; seed++) {
  const inst = gen(seed);
  const ref = refYear({ ...inst, opts: { emptyConvention: 'zero' } });
  if (!ref.pairs.length) continue;
  used++;
  if (ref.nA <= 50) continue;
  big++;
  const orig = run(searchYear, inst), nocut = run(I.searchYear, inst, { __YEAR_A_TOP: 1e9 });
  const origNoSeeds = run(I.searchYear, inst, { __YEAR_NO_SEEDS: 1 });
  if (orig.partial || nocut.partial || origNoSeeds.partial) { skipPartial++; continue; }
  if (!orig.results.length) continue;
  const bo = orig.results[0].score, bn = nocut.results[0]?.score ?? -Infinity, rb = ref.pairs[0].score;
  const cap = {}; Object.assign(globalThis, { __YEAR_CAPTURE: cap }); I.searchYear({ ...inst, topK: 1, timeLimitMs: 20000 }); delete globalThis.__YEAR_CAPTURE;
  distinctSets.push(new Set(cap.aList.map((a) => [...a.courses].sort().join())).size + '/' + cap.aList.length);
  if (bn - bo > 1e-6) { cutLossN++; cutLossSum += bn - bo; cutLossMax = Math.max(cutLossMax, bn - bo); if (cutEx.length < 3) cutEx.push(`seed ${seed}: A selections ${ref.nA}, best with cut ${bo.toFixed(3)}, without ${bn.toFixed(3)}`); }
  if (rb - bn > 1e-6) { bLossN++; bLossMax = Math.max(bLossMax, rb - bn); }
  const noSeedBest = origNoSeeds.results[0]?.score ?? -Infinity;
  if (bo - noSeedBest > 1e-6) { seedGainN++; seedGainMax = Math.max(seedGainMax, bo - noSeedBest); if (seedEx.length < 2) seedEx.push(`seed ${seed}: with seeds ${bo.toFixed(3)} without ${noSeedBest.toFixed(3)}`); }
}
console.log(`INFO instances with a reference plan=${used}; with >50 A selections=${big}; skipped (partial)=${skipPartial}`);
console.log(`INFO top-50 cut loses in ${cutLossN}/${big} instances (max ${cutLossMax.toFixed(3)}, mean ${(cutLossN ? cutLossSum / cutLossN : 0).toFixed(3)}); remaining B-side loss vs FULL in ${bLossN}/${big} (max ${bLossMax.toFixed(3)}); seeds help in ${seedGainN}/${big} (max ${seedGainMax.toFixed(3)})`);
console.log(`INFO distinct A COURSE SETS / A alternatives tried (first 12 instances): ${distinctSets.slice(0, 12).join(' ')}`);
R.check('YEAR-HEUR-SOME-INSTANCES', big >= 10, `${big} instances have more than 50 A selections (needed so the cut can bite)`);
R.bug('YEAR-TOP50-CUT-LOSES', cutLossN > 0, `top-50 cut of A alternatives hides a better year pair in ${cutLossN}/${big}; ${cutEx.join(' ; ')}`);
console.log('INFO YEAR-SEEDS-EFFECT ' + `seed searches improve the best pair in ${seedGainN}/${big} instances; ${seedEx.join(' ; ')} (observation, not a claim: on these random instances the seeds never changed the best pair; year-seeds.mjs shows targeted cases)`);
R.done();
