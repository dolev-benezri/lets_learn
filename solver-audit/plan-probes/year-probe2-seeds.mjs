// year-probe2-seeds.mjs - probe 2: the F-12 seed fix. Instances: S1-S3 of solver-audit/repro/year-seeds.mjs (32 course sets: the DISTINCT top-50 already holds them all)
// and H1-H3, the hard version built like test/solver.test.mjs 'S5' (7 electives = 128 sets, the prerequisite P is an all-day course so {P} ranks ~121st): the seeds are needed.
//   H1 N needs P                       (control: seeds work today)
//   H2 N needs [outside-program, P]    (F-12a: all-outside group, seed skipped today)
//   H3 N needs P or P2, P has only full groups (F-12b: only the first candidate is forced today)
//   H4 N needs P (all groups full) or P2 or P3, P2 and P3 clash with each other? no: P2 is the only usable one, P3 does not exist as an A course (anyOf member outside A)
// Configs: orig = web/ searchYear; seedfix = patched seed loop only; distinct+K5 = F-11 design only; all = both. Reference = refYear (exhaustive).
// RUN: node solver-audit/plan-probes/year-probe2-seeds.mjs
import { searchYear } from '../../web/solver-core.js';
import { refYear, mt, grp, crs, pre, outside, semData } from '../repro/year-lib.mjs';
import { loadProto, setKnobs } from './year-proto-lib.mjs';
const P = await loadProto();
const W = { progress: 1, freeDays: 5, compact: 1, timeWindow: 0, friends: 0, examSpread: 0 };
const base = (A, B, choices) => ({ dataA: semData('א', A), dataB: semData('ב', B), state: { passed: [], failed: {}, choices, semesterOf: {}, load: 'even', profile: { year: 1 } }, yearList: new Set(Object.keys(choices)), pins: [], constraints: {}, weights: W });
function simple({ mPrereq, p1Full = false, p2 = false }) { // = year-seeds.mjs build()
  const slot = (h) => mt(1, `${String(h).padStart(2, '0')}:00`, `${String(h + 2).padStart(2, '0')}:00`);
  const fGroups = (id) => [10, 12, 14, 16, 18].map((h, k) => grp(`${id}A${k}`, [slot(h)]));
  const A = { G: crs('G', 3, [grp('GA0', [mt(1, '08:00', '09:50')])]), F1: crs('F1', 3, fGroups('F1')), F2: crs('F2', 3, fGroups('F2')), F3: crs('F3', 3, fGroups('F3')), F4: crs('F4', 3, fGroups('F4')),
    P: crs('P', 3, [grp('PA0', [mt(5, '08:00', '09:50')], { full: p1Full })]), ...(p2 ? { P2: crs('P2', 3, [grp('P2A0', [mt(5, '10:00', '11:50')])]) } : {}), M: crs('M', 3, [], mPrereq) };
  const B = { G: crs('G', 3, []), F1: crs('F1', 3, []), F2: crs('F2', 3, []), F3: crs('F3', 3, []), F4: crs('F4', 3, []), P: crs('P', 3, []), ...(p2 ? { P2: crs('P2', 3, []) } : {}), M: crs('M', 3, [grp('MB0', [mt(2, '08:00', '09:50')])], mPrereq) };
  return base(A, B, { G: 'must', M: 'must', P: 'optional', F1: 'optional', F2: 'optional', F3: 'optional', F4: 'optional', ...(p2 ? { P2: 'optional' } : {}) });
}
function hard({ nPrereq, pFull = false, p2 = false }) { // = test/solver.test.mjs S5
  const A = {}, B = {};
  for (let i = 0; i < 7; i++) {
    A[`E${i}`] = crs(`E${i}`, 3, [grp(`E${i}A`, [i < 6 ? mt((i % 6) + 1, '08:00', '10:00') : mt((i % 6) + 1, '12:00', '14:00')])]); B[`E${i}`] = crs(`E${i}`, 3, []);
  }
  const allDay = (id, full = false) => grp(id, [1, 2, 3, 4, 5, 6].map((d) => mt(d, '08:00', '20:00')), { full });
  A.P = crs('P', 1, [allDay('PA', pFull)]); B.P = crs('P', 1, []);
  if (p2) { A.P2 = crs('P2', 1, [allDay('P2A')]); B.P2 = crs('P2', 1, []); }
  A.N = crs('N', 4, [], nPrereq); B.N = crs('N', 4, [grp('NB', [mt(1, '08:00', '10:00')])], nPrereq);
  const choices = { ...Object.fromEntries(Object.keys(A).filter((id) => id !== 'N').map((id) => [id, 'optional'])), N: 'must' };
  return base(A, B, choices);
}
const instances = [
  ['S1  N needs P (control)', simple({ mPrereq: [pre('P')] })],
  ['S2  M needs [outside,P]', simple({ mPrereq: [outside(), pre('P')] })],
  ['S3  M needs P|P2, P full', simple({ mPrereq: [pre('P', 'קדם', 'P2')], p1Full: true, p2: true })],
  ['H1  N needs P (control)', hard({ nPrereq: [pre('P')] })],
  ['H2  N needs [outside,P]', hard({ nPrereq: [outside(), pre('P')] })],
  ['H3  N needs P|P2, P full', hard({ nPrereq: [pre('P', 'קדם', 'P2')], pFull: true, p2: true })],
  ['H5  N needs only [outside]', hard({ nPrereq: [outside()] })],
];
const cfgs = [['orig', null, {}], ['seedfix', P.searchYear, { __SEEDS: 'fix' }], ['distinct+K5', P.searchYear, { __A_DISTINCT: 1, __B_K: 5 }], ['all (distinct+K5+seedfix)', P.searchYear, { __A_DISTINCT: 1, __B_K: 5, __SEEDS: 'fix' }], ['no seeds, distinct+K5', P.searchYear, { __A_DISTINCT: 1, __B_K: 5, __SEEDS: 'off' }]];
for (const [name, inst] of instances) {
  const ref = refYear({ ...inst, opts: { emptyConvention: 'zero' } });
  console.log(`## ${name}: A selections ${ref.nA}, reference best ${ref.pairs[0]?.score.toFixed(3)} A=${ref.pairs[0]?.aIds} B=${ref.pairs[0]?.bIds} missing=[${ref.pairs[0]?.missing}]`);
  for (const [label, fn, knobs] of cfgs) {
    setKnobs(knobs);
    const t = performance.now(); const r = (fn ?? searchYear)({ ...inst, topK: 10, timeLimitMs: 20000 }); const ms = Math.round(performance.now() - t);
    const b = r.results[0];
    console.log(`   ${label.padEnd(26)} ${String(ms).padStart(5)}ms partial=${r.partial} best=${b?.score.toFixed(3)} missing=[${b?.missing}] A=${b?.a.courses} B=${b?.b?.courses}`);
  }
}
