// Stage 8: search() vs the exhaustive reference on SUMMER (2027-3) data only, every program file, several instances each.
// RUN: node solver-audit/plan-probes/summer-ref.mjs [perFile=12]
import { search } from '../../web/solver-core.js';
import { mulberry32, realFiles, loadReal, stripSelfLoops, withExams, realInstance, referenceSolve, compareTopK, tagResults } from '../repro/search-lib.mjs';

const per = Number(process.argv[2] ?? 12), files = realFiles('2027-3');
let n = 0, bad = 0, feasible = 0, skipped = 0, thin = 0, first = null;
for (const [fi, f] of files.entries()) {
  const base = stripSelfLoops(loadReal('2027-3', f));
  if (Object.values(base.courses).filter((c) => c.groups.length).length < 3) { thin++; continue; }
  for (let k = 0; k < per; k++) {
    const rng = mulberry32((fi + 1) * 7919 + k);
    const data = rng() < 0.5 ? withExams(base, rng) : base;
    const inst = realInstance(rng, data, { maxProduct: 150000 });
    if (inst.courses.length < 2) { skipped++; continue; }
    let ref;
    try { ref = referenceSolve(inst, { cap: 3_000_000 }); } catch { skipped++; continue; }
    const out = search({ ...inst, timeLimitMs: 1e9 });
    n++;
    if (ref.sols.length) feasible++;
    const problems = compareTopK(tagResults(out.results, data), ref, inst.topK);
    if (out.partial) problems.push('partial');
    if (problems.length) { bad++; first ??= { f, k, problems: problems.slice(0, 2) }; }
  }
}
console.log(`CHECK SUMMER-REF ${bad ? 'FAIL' : 'PASS'} ${files.length} summer files (${thin} too thin), ${n} instances (${feasible} feasible, ${skipped} skipped), mismatches=${bad}${first ? ' first=' + JSON.stringify(first).slice(0, 300) : ''}`);
process.exit(bad ? 1 : 0);
