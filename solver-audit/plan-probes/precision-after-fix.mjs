// Stage 4 check: the FIXED web/solver-core.js search() vs the minute-exact reference (gap in slots, F-18 per group) on off-grid instances.
// RUN: node solver-audit/plan-probes/precision-after-fix.mjs [N=700]
import { search } from '../../web/solver-core.js';
import { referenceMinutes, genOffGrid, mulberry32, hhmm } from './precision-ref.mjs';
import { compareTopK, tagResults, realFiles, loadReal, stripSelfLoops, realInstance, ri, pick } from '../repro/search-lib.mjs';

const N = Number(process.argv[2] ?? 700), refOpts = { gap: 'slot', f18: 'group' };
function sweep(label, mk, n) {
  let bad = 0, skipped = 0, feasible = 0, ran = 0, firstBad = null;
  for (let seed = 1; seed <= n; seed++) {
    const inst = mk(mulberry32(seed * 7919));
    let ref;
    try { ref = referenceMinutes(inst, refOpts); } catch { skipped++; continue; }
    ran++;
    const out = search({ ...inst, timeLimitMs: 1e9, prune: true });
    const problems = compareTopK(tagResults(out.results, inst.data), ref, inst.topK);
    if (out.partial) problems.push('partial');
    if (ref.sols.length) feasible++;
    else if (out.results.length) problems.push('results although reference has none');
    if (problems.length) { bad++; firstBad ??= { seed, problems: problems.slice(0, 2) }; }
  }
  console.log(`CHECK ${label} ${bad ? 'FAIL' : 'PASS'} ran=${ran} skipped=${skipped} feasible=${feasible} mismatches=${bad}${firstBad ? ' first=' + JSON.stringify(firstBad).slice(0, 300) : ''}`);
  return bad;
}
let bad = sweep('PF-1 off-grid synthetic', genOffGrid, N);
const files = realFiles('2027-1'), minute = (rng) => pick(rng, [0, 10, 15, 20, 45, 50]);
bad += sweep('PF-2 real data, off-grid blocks and windows', (rng) => {
  const data = stripSelfLoops(loadReal('2027-1', pick(rng, files)));
  const inst = realInstance(rng, data, { maxProduct: 150000 }), c = inst.constraints;
  c.notBefore = rng() < 0.4 ? hhmm(ri(rng, 8, 11) * 60 + minute(rng)) : ''; c.notAfter = rng() < 0.7 ? hhmm(ri(rng, 14, 20) * 60 + minute(rng)) : '';
  c.blocks = rng() < 0.6 ? [{ day: ri(rng, 1, 5), start: hhmm(ri(rng, 8, 17) * 60 + 50), end: hhmm(ri(rng, 18, 22) * 60 + minute(rng)), label: 'b' }] : [];
  c.windowHard = rng() < 0.3;
  return inst;
}, Math.min(N, 400));
process.exit(bad ? 1 : 0);
