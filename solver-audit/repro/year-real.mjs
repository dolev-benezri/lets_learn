// year-real.mjs  (PREFIX year)
// WHAT: runs searchYear() (web/solver-core.js:382-501) on REAL committed data (web/data/afeka/2027-1 + 2027-2) for 13 program/cohort/year
//       combinations, with the UI's defaults (web/app.js:9-17 DEFAULT weights/constraints; evening tracks start at 16:00 as web/app.js:257),
//       passed = earlier years' mandatory lists (web/app.js:162-166 ensurePassed), yearList = the study year's list (web/app.js:174-179),
//       and the UI's 3000 ms budget (web/ui-search.js:21). Every returned pair is validated FROM FIRST PRINCIPLES (year-lib.mjs):
//         * no meeting clash inside a semester, groups form a legal registration (primary + linked closure), no full group (includeFull off)
//         * A courses are available in A, B courses are available given passed + the A courses (prerequisites)
//         * credits.a / credits.b, missing[], warnings[] are truthful; score = formula recomputed independently; yearProgress in [0,1]
//         * no duplicate pairs, descending order, no course in both semesters
// RUN: node solver-audit/repro/year-real.mjs        (about 45 s; wall-clock bounded by the solver's own time limit; `partial` is recorded and
//      optimality is never asserted on real data)
// OUTPUT: CHECK lines (all expected PASS) and INFO lines with the numbers.
import { searchYear } from '../../web/solver-core.js';
import { Reporter, realSetup, refValidatePair, refScorePair, refNeeds, catalog } from './year-lib.mjs';

const R = new Reporter();
const COMBOS = [[30, 2026, 1], [30, 2025, 2], [30, 2024, 3], [10, 2026, 1], [10, 2025, 2], [12, 2025, 2], [22, 2025, 2], [11, 2024, 3], [19, 2025, 2], [40, 2025, 2], [50, 2025, 2], [112, 2026, 1], [20, 2024, 3]];
const cat = catalog();
const evening = (p) => /\(ערב\)$/.test(cat.programs.find((x) => x.id === p)?.name ?? '');
let nPairs = 0, nResults = 0, partials = 0;
const bad = { valid: [], score: [], missing: [], warn: [], dup: [], order: [], range: [], empty: [] };
for (const [prog, sy, year] of COMBOS) {
  const inst = realSetup(prog, sy, year);
  if (evening(prog)) { inst.constraints.notBefore = '16:00'; inst.constraints.notAfter = ''; }
  const t0 = Date.now();
  const res = searchYear({ dataA: inst.dataA, dataB: inst.dataB, state: inst.state, yearList: inst.yearList, pins: [], constraints: inst.constraints, weights: inst.weights, friends: [], timeLimitMs: 3000 });
  const ms = Date.now() - t0;
  if (res.partial) partials++;
  const tag = `${prog}-${sy}/y${year}`;
  if (!res.results.length) bad.empty.push(tag);
  nResults += res.results.length;
  const seen = new Set();
  let prev = Infinity, minYp = 1, maxYp = 0, nm = 0, withWarn = 0;
  const nameA = (id) => inst.dataA.courses[id]?.name ?? id;
  for (const p of res.results) {
    nPairs++;
    const errs = refValidatePair({ ...inst, pins: [] }, p);
    if (errs.length) bad.valid.push(`${tag}: ${errs[0]}`);
    const q = refScorePair({ ...inst }, p, 'zero');
    if (Math.abs(q.score - p.score) > 1e-6) bad.score.push(`${tag}: solver ${p.score.toFixed(4)} ref ${q.score.toFixed(4)}`);
    if (JSON.stringify([...q.missing].sort()) !== JSON.stringify([...p.missing].sort())) bad.missing.push(`${tag}: solver [${p.missing}] ref [${q.missing}]`);
    nm += p.missing.length;
    minYp = Math.min(minYp, q.yp); maxYp = Math.max(maxYp, q.yp);
    if (q.yp > 1 + 1e-9 || q.yp < -1e-9) bad.range.push(`${tag}: yearProgress ${q.yp}`);
    const need = [...refNeeds(inst, p)].map(nameA).sort();
    const warnNames = p.warnings.flatMap((w) => (w.match(/מניח שעוברים את (.*) בא׳/)?.[1] ?? '').split(', ').filter(Boolean)).sort();
    if (JSON.stringify(need) !== JSON.stringify(warnNames)) bad.warn.push(`${tag}: expected [${need}] got [${warnNames}]`);
    if (p.warnings.length) withWarn++;
    const k = [...p.a.groups].sort().join() + '|' + [...(p.b?.groups ?? [])].sort().join();
    if (seen.has(k)) bad.dup.push(tag); seen.add(k);
    if (p.score > prev + 1e-12) bad.order.push(tag); prev = p.score;
  }
  console.log(`INFO ${tag}: ${res.results.length} pairs, ${ms} ms, partial=${res.partial}, best ${res.results[0]?.score.toFixed(3)} A=${res.results[0]?.a.courses.length} courses ${res.results[0]?.credits.a} cr, B=${res.results[0]?.b?.courses.length ?? 0} courses ${res.results[0]?.credits.b} cr, missing in best [${res.results[0]?.missing}], yearProgress range ${minYp.toFixed(2)}-${maxYp.toFixed(2)}, pairs with warnings ${withWarn}`);
}
console.log(`INFO total: ${nResults} pairs validated, ${partials}/${COMBOS.length} runs partial`);
const ex = (a) => a.slice(0, 3).join(' ; ');
R.check('YEAR-REAL-RESULTS', bad.empty.length === 0, `every combination returned at least one pair ${ex(bad.empty)}`);
R.check('YEAR-REAL-VALID', bad.valid.length === 0, `pairs breaking a hard rule (clash, linked groups, full group, prerequisites, availability, caps, credits): ${bad.valid.length}/${nPairs} ${ex(bad.valid)}`);
R.check('YEAR-REAL-SCORE', bad.score.length === 0, `score differs from the first-principles formula: ${bad.score.length}/${nPairs} ${ex(bad.score)}`);
R.check('YEAR-REAL-MISSING', bad.missing.length === 0, `missing[] differs from the first-principles list: ${bad.missing.length}/${nPairs} ${ex(bad.missing)}`);
R.check('YEAR-REAL-WARNINGS', bad.warn.length === 0, `"assumes you pass X in א" lists exactly the A courses the B plan needs: ${bad.warn.length} mismatches ${ex(bad.warn)}`);
R.check('YEAR-REAL-PROGRESS-RANGE', bad.range.length === 0, `yearProgress stays within [0,1]: ${bad.range.length} violations ${ex(bad.range)}`);
R.check('YEAR-REAL-NO-DUPLICATES', bad.dup.length === 0, `no pair is returned twice: ${bad.dup.length}`);
R.check('YEAR-REAL-SORTED', bad.order.length === 0, `scores are non-increasing: ${bad.order.length} inversions`);
R.done();
