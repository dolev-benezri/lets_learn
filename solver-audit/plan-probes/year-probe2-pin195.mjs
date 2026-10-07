// year-probe2-pin195.mjs - probe 2: the YEAR-PIN-LIFTED case of year-exhaustive.mjs (seed 195): what happens and where.
import { searchYear } from '../../web/solver-core.js';
import { genInstance } from '../repro/year-gen.mjs';
import { refYear, refValidatePair } from '../repro/year-lib.mjs';
const inst = genInstance(195);
const { dataA, dataB, state, yearList, pins, constraints, weights } = inst;
console.log('pins', pins, 'constraints', JSON.stringify(constraints), 'weights', JSON.stringify(weights), 'load', state.load);
console.log('choices', JSON.stringify(state.choices), 'passed', state.passed, 'failed', JSON.stringify(state.failed), 'semesterOf', JSON.stringify(state.semesterOf));
const res = searchYear({ ...inst, topK: 100000, timeLimitMs: 6000 });
for (const p of res.results) {
  const errs = refValidatePair(inst, p);
  console.log(`A=${p.a.courses} B=${p.b?.courses} Bgroups=${p.b?.groups} missing=${p.missing} score=${p.score.toFixed(3)} warnings=${JSON.stringify(p.warnings)} ${errs.length ? 'ERR ' + errs.join(' ; ') : ''}`);
}
const ref = refYear({ ...inst, opts: { emptyConvention: 'zero' } });
console.log('ref best', ref.pairs[0] && `${ref.pairs[0].score.toFixed(3)} A=${ref.pairs[0].aIds} B=${ref.pairs[0].bIds} missing=${ref.pairs[0].missing}`);
console.log('must', [...ref.must]);
const C0b = dataB.courses.C0; console.log('C0 in B groups', C0b.groups.map((g) => g.id + JSON.stringify(g.meetings.map((m) => [m.day, m.start, m.end]))), 'prereqs', JSON.stringify(C0b.prereqs), 'offered A', dataA.courses.C0.offered);
