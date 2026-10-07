// year-exhaustive.mjs  (PREFIX year)
// WHAT: compares searchYear() (web/solver-core.js:382-501) with an independent exhaustive year enumerator (year-lib.mjs: refYear)
//       over seeded random two-semester datasets (year-gen.mjs, <=7 courses, so A has < 50 selections: the top-50 cut and the
//       seeds cannot bite here; year-heuristics.mjs covers those). Every A selection x every B selection is scored with the
//       documented formula  a.score + b.score + progressFix + LOAD_W*loadScore - MISSING_W*missing  (web/solver-core.js:494).
// THREE REFERENCES, to attribute losses:
//   FULL   best over every (A selection, B selection)            -> includes B-subset variants searchYear never returns by design
//   PER-A  best pair for each A selection (one B per A, like searchYear returns) -> isolates the "best B chosen by b.score" heuristic
//   VALID  hard rules + formula recomputation, no optimality
// SEPARATES:
//   (a) defects   : returned pair violates a hard rule, or its score/missing != formula recomputed from first principles, or a pin is dropped
//   (b) heuristics: returned pair for an A selection is below the best B for that A under the year formula (load term and year-progress
//                   scale are invisible to the B search that picks the B plan: web/solver-core.js:452-453)
// RUN: node solver-audit/repro/year-exhaustive.mjs [nSeeds]      (default 300 seeds, < 5 s)
// OUTPUT: CHECK lines assert correct behaviour; BUG lines assert defects (REPRODUCED = defect present). Exit 0 iff all as expected.
import { searchYear } from '../../web/solver-core.js';
import { Reporter, refYear, refValidatePair } from './year-lib.mjs';
import { genInstance } from './year-gen.mjs';

const N = +(process.argv[2] ?? 300);
const R = new Reporter();
const keyOf = (aG, bG) => [...aG].sort().join() + '|' + [...bG].sort().join();
const keyA = (aG) => [...aG].sort().join();
let ran = 0, invalid = 0, pinBad = 0, scoreMismatch = 0, noRes = 0, partialN = 0, refEmpty = 0, solverEmptyRefNot = 0;
let aPlans = 0, aPlansSub = 0, maxGapA = 0, sumGapA = 0, seedsWithSub = 0, fullWorse = 0, perATopEq = 0, perATopN = 0;
const invalidEx = [], pinEx = [], mismatchEx = [], subEx = [], noResEx = [];
for (let seed = 1; seed <= N; seed++) {
  const inst = genInstance(seed);
  const { dataA, dataB, state, yearList, pins, constraints, weights } = inst;
  const res = searchYear({ dataA, dataB, state, yearList, pins, constraints, weights, topK: 100000, timeLimitMs: 6000 }); // all pairs it built
  ran++;
  if (res.partial) partialN++;
  // VALID: every returned pair
  let bad = null, pinned = null;
  for (const p of res.results) {
    const errs = refValidatePair(inst, p);
    const hard = errs.filter((e) => !e.includes('silently re-grouped')), pin = errs.filter((e) => e.includes('silently re-grouped'));
    if (hard.length && !bad) bad = `seed ${seed}: ${hard[0]}`;
    // 2026-10-07 (stage 5, issue #5): a re-grouped pin is a bug only when the pair does not say so
    if (pin.length && !pinned && !p.warnings.some((w) => w.includes('לא נשמרה'))) pinned = `seed ${seed}: ${pin[0]}`;
  }
  if (bad) { invalid++; if (invalidEx.length < 3) invalidEx.push(bad); }
  if (pinned) { pinBad++; if (pinEx.length < 3) pinEx.push(pinned); }
  // exhaustive reference ('zero' = convention searchYear uses for an empty semester, so the formula is compared like for like)
  const ref = refYear({ ...inst, opts: { emptyConvention: 'zero' } });
  const idx = new Map(ref.pairs.map((p) => [keyOf(p.aGroups, p.bGroups), p]));
  for (const p of res.results) {
    const q = idx.get(keyOf(p.a.groups, p.b?.groups ?? []));
    if (!q) continue; // not enumerable by the reference (e.g. pin lifted): reported by the pin check
    if (Math.abs(q.score - p.score) > 1e-6 || JSON.stringify([...q.missing].sort()) !== JSON.stringify([...p.missing].sort())) {
      scoreMismatch++; if (mismatchEx.length < 3) mismatchEx.push(`seed ${seed}: solver ${p.score.toFixed(4)} ref ${q.score.toFixed(4)} missing ${p.missing}/${q.missing}`); break;
    }
  }
  if (!ref.pairs.length) { refEmpty++; if (res.results.length) solverEmptyRefNot++; continue; }
  if (!res.results.length) { noRes++; if (noResEx.length < 4) noResEx.push(`seed ${seed}`); continue; }
  // PER-A reference: best pair per A selection
  const perA = new Map();
  for (const q of ref.pairs) { const k = keyA(q.aGroups); if (!perA.has(k) || q.score > perA.get(k).score) perA.set(k, q); }
  let sub = false;
  for (const p of res.results) {
    const q = perA.get(keyA(p.a.groups));
    if (!q) continue;
    aPlans++;
    const gap = q.score - p.score;
    if (gap > 1e-6) { aPlansSub++; sumGapA += gap; maxGapA = Math.max(maxGapA, gap); sub = true; if (subEx.length < 3) subEx.push(`seed ${seed}: A ${p.a.courses} solver B ${p.b?.courses} (${p.score.toFixed(3)}) vs best B ${q.bIds} (${q.score.toFixed(3)})`); }
  }
  if (sub) seedsWithSub++;
  if (res.results[0].score + 1e-6 < ref.pairs[0].score) fullWorse++;
  const top = [...perA.values()].sort((x, y) => y.score - x.score).slice(0, 10);
  perATopN++;
  const mine = res.results.slice(0, 10);
  if (mine.length === top.length && mine.every((p, i) => Math.abs(p.score - top[i].score) < 1e-6)) perATopEq++;
}
console.log(`INFO instances=${ran} partial=${partialN} no-result-but-reference-has-one=${noRes} reference-empty=${refEmpty}`);
console.log(`INFO PER-A: A-selections compared=${aPlans}; solver's B is worse than the best B for that A in ${aPlansSub} (max gap ${maxGapA.toFixed(3)}, mean ${(aPlansSub ? sumGapA / aPlansSub : 0).toFixed(3)}) in ${seedsWithSub}/${perATopN} instances; top-10 equals the PER-A top-10 in ${perATopEq}/${perATopN}; best below FULL best in ${fullWorse}`);
R.check('YEAR-VALID', invalid === 0, `returned pairs violating a hard rule (clash/prereq/availability/cap/full/credits): ${invalid}/${ran} ${invalidEx.join(' ; ')}`);
R.check('YEAR-SCORE-FORMULA', scoreMismatch === 0, `returned pairs whose score or missing list differ from the first-principles formula: ${scoreMismatch}/${ran} ${mismatchEx.join(' ; ')}`);
R.check('YEAR-NO-LOST-PLAN', noRes === 0, `solver returned nothing while the exhaustive reference found a plan: ${noRes}/${ran} ${noResEx.join(',')}`);
R.bug('YEAR-PIN-LIFTED', pinBad > 0, `pairs where a pinned course is placed in another group than the pinned one: ${pinBad}/${ran} ${pinEx.join(' ; ')}`);
R.bug('YEAR-B-CHOICE-SUBOPTIMAL', aPlansSub > 0, `for a fixed A selection the B plan (best by b.score) is not the best under the year formula: ${aPlansSub}/${aPlans} A-selections; ${subEx.join(' ; ')}`);
R.done();
