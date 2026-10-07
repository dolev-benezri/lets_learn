// Prototype check of the F-01 diagnose change: real 10013 data + a minimal synthetic copy of its shape.
// Run: node solver-audit/plan-probes/f01/run.mjs
import fs from 'node:fs';
import * as after from './solver-core.js';
import * as before from './solver-core-orig.js';
const W0 = { friends: 0, progress: 0, freeDays: 0, compact: 0, timeWindow: 0, examSpread: 0 };
const data = JSON.parse(fs.readFileSync(new URL('../../../web/data/afeka/2027-1/10-2024.json', import.meta.url), 'utf8'));
for (const [label, m] of [['BEFORE', before], ['AFTER', after]]) {
  const r = m.search({ data, courses: [{ id: '10013', mode: 'must' }], weights: W0, constraints: {}, topK: 5 });
  console.log(`${label} real 10013 (default includeFull false): results ${r.results.length}`); r.diagnosis.forEach((l) => console.log('   -', l));
  const r2 = m.search({ data, courses: [{ id: '10013', mode: 'must' }], weights: W0, constraints: { includeFull: true }, topK: 5 });
  console.log(`${label} includeFull true: results ${r2.results.length}, diagnosis ${r2.diagnosis.length}`);
  const r3 = m.search({ data, courses: [{ id: '10013', mode: 'must' }], weights: W0, constraints: { blocks: [{ day: 3, start: '09:00', end: '13:00', label: 'x' }, { day: 1, start: '09:00', end: '14:00', label: 'x' }] }, topK: 5 });
  console.log(`${label} blocks kill all lectures: results ${r3.results.length}, diagnosis lines ${r3.diagnosis.length} (lone-lab line must NOT appear: ${!r3.diagnosis.some((l) => l.includes('לא מקושרת'))})`);
}
// synthetic shape for the regression test
const g = (id, type, linked, full, day) => ({ id, type, primary: type.startsWith('סופי'), full, lecturer: 'L', linked, exams: [], meetings: [{ day, start: '10:00', end: '11:50', room: '' }] });
const course = { name: 'תקשורת', credits: 3, offered: true, prereqs: [], groups: [g('P', 'סופי-הרצאה', ['P/1'], false, 1), g('P/1', 'תרגול', ['L1'], false, 2), g('L1', 'מעבדה', [], true, 3), g('L2', 'מעבדה', [], false, 4)] };
const d = { examsPublished: false, semester: 'א', courses: { X: course } };
for (const [label, m] of [['BEFORE', before], ['AFTER', after]]) {
  const r = m.search({ data: d, courses: [{ id: 'X', mode: 'must' }], weights: W0, constraints: {}, topK: 5 });
  console.log(`${label} synthetic: results ${r.results.length} diagnosis: ${JSON.stringify(r.diagnosis)}`);
  console.log(`${label} assertion  some(l => l.includes('L2') && l.includes('לא מקושרת')) = ${r.diagnosis.some((l) => l.includes('L2') && l.includes('לא מקושרת'))}`);
}
