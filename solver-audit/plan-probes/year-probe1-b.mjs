// year-probe1-b.mjs - probe 1 (generator part): how many of the 175/1752 lost B choices does "B topK=K, pair chosen by the full pair score" fix?
// Same generator and same PER-A reference as solver-audit/repro/year-exhaustive.mjs (seeds 1..300), on an instrumented COPY (year-proto-lib.mjs).
// RUN: node solver-audit/plan-probes/year-probe1-b.mjs [nSeeds]
import { searchYear } from '../../web/solver-core.js';
import { refYear, refValidatePair } from '../repro/year-lib.mjs';
import { genInstance } from '../repro/year-gen.mjs';
import { loadProto, setKnobs } from './year-proto-lib.mjs';

const N = +(process.argv[2] ?? 300);
const P = await loadProto();
const keyA = (g) => [...g].sort().join();
const insts = [], refs = [];
for (let seed = 1; seed <= N; seed++) { const inst = genInstance(seed); insts.push(inst); refs.push(refYear({ ...inst, opts: { emptyConvention: 'zero' } })); }

function measure(label, fn, knobs) {
  setKnobs(knobs);
  let aPlans = 0, sub = 0, maxGap = 0, invalid = 0, fullWorse = 0, noRes = 0, partial = 0, seedsSub = 0, ms = 0, scoreSum = 0, n = 0;
  for (let i = 0; i < N; i++) {
    const inst = insts[i], ref = refs[i];
    const t = performance.now();
    const res = fn({ ...inst, topK: 100000, timeLimitMs: 6000 });
    ms += performance.now() - t;
    if (res.partial) partial++;
    for (const p of res.results) if (refValidatePair(inst, p).filter((e) => !e.includes('silently re-grouped')).length) { invalid++; break; }
    if (!ref.pairs.length) continue;
    if (!res.results.length) { noRes++; continue; }
    const perA = new Map();
    for (const q of ref.pairs) { const k = keyA(q.aGroups); if (!perA.has(k) || q.score > perA.get(k).score) perA.set(k, q); }
    let s = false;
    for (const p of res.results) {
      const q = perA.get(keyA(p.a.groups));
      if (!q) continue;
      aPlans++;
      if (q.score - p.score > 1e-6) { sub++; s = true; maxGap = Math.max(maxGap, q.score - p.score); }
    }
    if (s) seedsSub++;
    if (res.results[0].score + 1e-6 < ref.pairs[0].score) fullWorse++;
    scoreSum += res.results[0].score; n++;
  }
  console.log(`${label.padEnd(22)} A-sel=${aPlans} lostB=${sub} (max gap ${maxGap.toFixed(3)}) instances-with-loss=${seedsSub} best<FULL=${fullWorse} noRes=${noRes} invalid=${invalid} partial=${partial} time=${Math.round(ms)}ms`);
  return { sub, aPlans, fullWorse };
}
measure('original (web/)', searchYear, {});
measure('proto K=1', P.searchYear, {});
for (const K of [2, 3, 5, 10, 20, 1000]) measure(`proto K=${K}`, P.searchYear, { __B_K: K });
measure('proto K=3 + dedup', P.searchYear, { __B_K: 3, __A_DEDUP: 1 });
measure('proto K=5 + dedup', P.searchYear, { __B_K: 5, __A_DEDUP: 1 });
measure('proto K=5 +relaxAll', P.searchYear, { __B_K: 5, __RELAX_ALL: 1 });
measure('proto K=10 +relaxAll', P.searchYear, { __B_K: 10, __RELAX_ALL: 1 });
measure('proto K=1 +relaxAll', P.searchYear, { __RELAX_ALL: 1 });
measure('proto distinct+K5+relaxAll', P.searchYear, { __B_K: 5, __RELAX_ALL: 1, __A_DISTINCT: 1 });
