// precision-oldref-vs-proto.mjs: what happens to repro C-1 (search-ref-random.mjs, 700 seeds) when ONLY web/solver-core.js changes
// and search-lib.mjs referenceSolve (30-minute-slot semantics for blocks/windows/outside minutes) stays as is.
// RUN: node solver-audit/plan-probes/precision-oldref-vs-proto.mjs [g2|slot]
import { buildProto } from './proto-lib.mjs';
import { mulberry32, genInstance, referenceSolve, compareTopK, tagResults } from '../repro/search-lib.mjs';
const gap = process.argv[2] ?? 'g2';
const { mod: P } = await buildProto({ gap, tag: `proto-oldref-${gap}` });
let bad = 0, n = 0; const kinds = {};
for (let seed = 1; seed <= 700; seed++) {
  const inst = genInstance(mulberry32(seed * 7919));
  let ref; try { ref = referenceSolve(inst); } catch { continue; }
  n++;
  const out = P.search({ ...inst, timeLimitMs: 1e9, prune: true });
  const pr = compareTopK(tagResults(out.results, inst.data), ref, inst.topK);
  if (pr.length) { bad++; for (const p of pr) { const k = /metric (\w+)/.exec(p)?.[1] ?? p.split(' ')[0]; kinds[k] = (kinds[k] ?? 0) + 1; } }
}
console.log(`INFO proto(gap=${gap}) vs UNCHANGED slot reference on the C-1 generator: ${bad}/${n} instances differ; problem kinds ${JSON.stringify(kinds)}`);
