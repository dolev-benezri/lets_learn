// year-seeds.mjs  (PREFIX year)
// WHAT: the "seeds" that rescue plans the top-50 cut of A alternatives would drop (web/solver-core.js:426-438), on crafted instances.
//   Lines targeted: :430-432 (need = first A candidate of each open קדם anyOf; skipped when none), :433-437 (seed search), :420 (A_TOP cut).
//   S1  seeds WORK in the plain case (control)                                   -> CHECK
//   S2  a must course with an outside-program prerequisite (anyOf [{id:null}]) gets NO seed, though rules.js:67 treats that
//       prerequisite as satisfied -> the year plan that opens the course is lost   -> BUG  (real data: 211 courses carry such a prerequisite)
//   S3  an open prerequisite 'either P1 or P2' is seeded with P1 only (:431 .find) even when P1 cannot be taken (all groups full) -> BUG
//   S4  the 50 A alternatives hold few distinct course sets, B is chosen per course set                                      -> INFO
// Instrumented COPY (year-instrument.mjs) only for the knob that switches seeds off / fixes S2. Reference: year-lib.mjs refYear.
// RUN: node solver-audit/repro/year-seeds.mjs        OUTPUT: CHECK/BUG lines; exit 0 iff all as expected.
import { searchYear } from '../../web/solver-core.js';
import { Reporter, refYear, mt, grp, crs, pre, outside, semData } from './year-lib.mjs';
import { loadInstrumented } from './year-instrument.mjs';

const R = new Reporter();
const I = await loadInstrumented();
const W = { progress: 1, freeDays: 5, compact: 1, timeWindow: 0, friends: 0, examSpread: 0 };

// Instance: G must (A only, day 1 08:00); F1..F4 optional (A only, five day-1 slots each) -> >50 plans that use only day 1;
// P (A only, Friday) is the prerequisite of M; M must (B only). Any plan with P uses a second campus day, so the A-only ranking
// (freeDays weight 5) puts every P plan below >50 day-1-only plans.
function build({ mPrereq, p1Full = false, p2 = false }) {
  const slot = (h) => mt(1, `${String(h).padStart(2, '0')}:00`, `${String(h + 2).padStart(2, '0')}:00`);
  const fGroups = (id) => [10, 12, 14, 16, 18].map((h, k) => grp(`${id}A${k}`, [slot(h)]));
  const A = {
    G: crs('G', 3, [grp('GA0', [mt(1, '08:00', '09:50')])]),
    F1: crs('F1', 3, fGroups('F1')), F2: crs('F2', 3, fGroups('F2')), F3: crs('F3', 3, fGroups('F3')), F4: crs('F4', 3, fGroups('F4')),
    P: crs('P', 3, [grp('PA0', [mt(5, '08:00', '09:50')], { full: p1Full })]),
    ...(p2 ? { P2: crs('P2', 3, [grp('P2A0', [mt(5, '10:00', '11:50')])]) } : {}),
    M: crs('M', 3, [], mPrereq),
  };
  const B = {
    G: crs('G', 3, []), F1: crs('F1', 3, []), F2: crs('F2', 3, []), F3: crs('F3', 3, []), F4: crs('F4', 3, []),
    P: crs('P', 3, []), ...(p2 ? { P2: crs('P2', 3, []) } : {}),
    M: crs('M', 3, [grp('MB0', [mt(2, '08:00', '09:50')])], mPrereq),
  };
  const choices = { G: 'must', M: 'must', P: 'optional', F1: 'optional', F2: 'optional', F3: 'optional', F4: 'optional', ...(p2 ? { P2: 'optional' } : {}) };
  return { dataA: semData('א', A), dataB: semData('ב', B), state: { passed: [], failed: {}, choices, semesterOf: {}, load: 'even', profile: { year: 1 } }, yearList: new Set(Object.keys(choices)), pins: [], constraints: {}, weights: W };
}
const best = (r) => r.results[0];
const run = (fn, inst, knobs = {}) => { Object.assign(globalThis, knobs); try { return fn({ ...inst, topK: 10, timeLimitMs: 20000 }); } finally { for (const k of Object.keys(knobs)) delete globalThis[k]; } };
const show = (p) => `A=${p.a.courses} B=${p.b?.courses} missing=[${p.missing}] score=${p.score.toFixed(3)}`;

// ---- S1 control: seeds rescue the P plan
{
  const inst = build({ mPrereq: [pre('P')] });
  const ref = refYear({ ...inst, opts: { emptyConvention: 'zero' } });
  const withSeeds = run(searchYear, inst), noSeeds = run(I.searchYear, inst, { __YEAR_NO_SEEDS: 1 });
  console.log(`INFO S1 reference best: A=${ref.pairs[0].aIds} B=${ref.pairs[0].bIds} missing=[${ref.pairs[0].missing}] score=${ref.pairs[0].score.toFixed(3)}; A selections=${ref.nA}`);
  console.log(`INFO S1 seeds on : ${show(best(withSeeds))}`);
  console.log(`INFO S1 seeds off: ${show(best(noSeeds))}`);
  R.check('YEAR-SEED-S1-RESCUES', best(withSeeds).missing.length === 0 && best(withSeeds).score > best(noSeeds).score + 4, `with seeds the best pair misses nothing (${best(withSeeds).score.toFixed(3)}; exhaustive best ${ref.pairs[0].score.toFixed(3)}, the seed takes the best A plan BY A SCORE that contains P, not the best for the year)`);
  R.check('YEAR-SEED-S1-NEEDED', best(noSeeds).missing.includes('M') && best(noSeeds).score < ref.pairs[0].score - 4, 'without seeds the top-50 cut loses the P plan: M is missing (-5) in every pair');
  const cap = {}; globalThis.__YEAR_CAPTURE = cap; I.searchYear({ ...inst, topK: 1, timeLimitMs: 20000 }); delete globalThis.__YEAR_CAPTURE;
  const sets = new Set(cap.aList.map((a) => [...a.courses].sort().join()));
  console.log(`INFO S4 the ${cap.aList.length} A alternatives tried hold ${sets.size} distinct course sets (B is searched once per course set content)`);
  R.bug('YEAR-A50-LOW-DIVERSITY', sets.size < cap.aList.length / 2, `${cap.aList.length} A alternatives, only ${sets.size} distinct course sets (the others differ only in groups)`);
}
// ---- S2 outside-program prerequisite on the must course disables its seed
{
  const inst = build({ mPrereq: [outside(), pre('P')] });
  const ref = refYear({ ...inst, opts: { emptyConvention: 'zero' } });
  const orig = run(searchYear, inst), fixed = run(I.searchYear, inst, { __YEAR_FIX_SEEDS: 1 });
  console.log(`INFO S2 reference best: A=${ref.pairs[0].aIds} B=${ref.pairs[0].bIds} missing=[${ref.pairs[0].missing}] score=${ref.pairs[0].score.toFixed(3)}`);
  console.log(`INFO S2 solver       : ${show(best(orig))}`);
  console.log(`INFO S2 seed loop skipping id:null prerequisites (patched copy): ${show(best(fixed))}`);
  R.bug('YEAR-SEED-S2-NULL-PREREQ', best(orig).missing.includes('M') && ref.pairs[0].missing.length === 0 && best(fixed).missing.length === 0 && best(fixed).score > best(orig).score + 4,
    `must M (prereqs: outside-program + P) is reported missing in the best pair although a plan with P+M exists (score ${best(orig).score.toFixed(3)} vs ${ref.pairs[0].score.toFixed(3)}); the patched seed loop finds a plan without missing (${best(fixed).score.toFixed(3)})`);
}
// ---- S3 either-or prerequisite: only the first A candidate is seeded
{
  const inst = build({ mPrereq: [pre('P', 'קדם', 'P2')], p1Full: true, p2: true });
  const ref = refYear({ ...inst, opts: { emptyConvention: 'zero' } });
  const orig = run(searchYear, inst);
  console.log(`INFO S3 reference best: A=${ref.pairs[0].aIds} B=${ref.pairs[0].bIds} missing=[${ref.pairs[0].missing}] score=${ref.pairs[0].score.toFixed(3)}`);
  console.log(`INFO S3 solver       : ${show(best(orig))}`);
  R.bug('YEAR-SEED-S3-FIRST-ANYOF-ONLY', best(orig).missing.includes('M') && ref.pairs[0].missing.length === 0,
    `M needs P (all groups full, cannot be taken) or P2 (free); the seed forces P only, so the plan A=..P2.. + B=M is lost (score ${best(orig).score.toFixed(3)} vs ${ref.pairs[0].score.toFixed(3)})`);
}
R.done();
