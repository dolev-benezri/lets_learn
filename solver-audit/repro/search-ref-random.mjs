// search-ref-random.mjs
// WHAT: compares web/solver-core.js search() against an independent exhaustive reference (search-lib.mjs referenceSolve)
//       on seeded random synthetic instances (3-8 courses, 1-5 options, weights {0,1,3,5}, friends, bias, pins, full groups,
//       busy blocks, hard/soft day-off and time windows, maxCredits, maxDays, exams forbid/allow, parallel requirements,
//       decoy exams that must be ignored). Compares the whole ranked top-K: score (1e-9), the six metric values of every
//       result, the plan itself (course:group sets), no duplicates, nothing above the K-th score missing.
// TARGETS: web/solver-core.js:248-373 (search), 171-220 (metrics), 327-342 (leaf), 344-360 (dfs), 54-102 (buildOptions, used as is).
// RUN:   node solver-audit/repro/search-ref-random.mjs        (~10-30 s)
// PROVES: every CHECK PASS = search() returned exactly the reference top-K on that class of instances.
//         Prints one summary line per feature class and an example of the first mismatch when something differs.
import { search } from '../../web/solver-core.js';
import { mulberry32, genInstance, referenceSolve, compareTopK, tagResults, Report } from './search-lib.mjs';

const R = new Report();
const N = 700;
let bad = 0, firstBad = null, feasibleCount = 0, emptyCount = 0, skipped = 0;
const feat = { maxCredits: 0, maxDays: 0, exams: 0, parallel: 0, pins: 0, friends: 0, blocks: 0, hardWin: 0, hardDay: 0, bias: 0, evening: 0 };
const featBad = Object.fromEntries(Object.keys(feat).map((k) => [k, 0]));
for (let seed = 1; seed <= N; seed++) {
  const rng = mulberry32(seed * 7919);
  const inst = genInstance(rng);
  let ref;
  try { ref = referenceSolve(inst); } catch { skipped++; continue; }
  const out = search({ ...inst, timeLimitMs: 1e9, prune: true });
  const res = tagResults(out.results, inst.data);
  const problems = compareTopK(res, ref, inst.topK);
  if (out.partial) problems.push('partial=true with 1e9 ms limit');
  if (ref.sols.length) feasibleCount++; else { emptyCount++; if (out.results.length) problems.push('results although reference has none'); if (!out.diagnosis.length) problems.push('empty results but empty diagnosis'); }
  const c = inst.constraints;
  const tags = [c.maxCredits != null && 'maxCredits', c.maxDays != null && 'maxDays', inst.data.examsPublished && 'exams', Object.keys(inst.statuses).length && 'parallel', inst.pins.length && 'pins',
    inst.friends.length && 'friends', c.blocks.length && 'blocks', c.windowHard && 'hardWin', c.dayOffHard && c.dayOff.length && 'hardDay', Object.keys(inst.bias).length && 'bias'].filter(Boolean);
  for (const t of tags) feat[t]++;
  if (problems.length) { bad++; for (const t of tags) featBad[t]++; firstBad ??= { seed, problems: problems.slice(0, 4) }; }
}
R.info(`instances=${N} skipped(too big for reference)=${skipped} feasible=${feasibleCount} infeasible=${emptyCount}`);
R.info('instances per feature: ' + JSON.stringify(feat));
R.check('SR-1 search() == exhaustive reference top-K on random instances (scores, metrics, plans)', bad === 0,
  bad ? `${bad} mismatching instances; first: ${JSON.stringify(firstBad)}; per feature: ${JSON.stringify(featBad)}` : `all ${N - skipped} instances identical`);
R.done();
