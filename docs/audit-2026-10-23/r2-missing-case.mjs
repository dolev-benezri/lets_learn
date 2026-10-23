// Case 22-2026 year 1, UI weights freeDays/compact/timeWindow = 5: plan #1 misses a must, plan #2 misses none. Why?
import fs from 'node:fs';
const { searchYear, showWeights } = await import('../../web/solver-core.js');
const root = 'web/data/afeka/';
const f = '22-2026.json';
const A = JSON.parse(fs.readFileSync(root + '2027-1/' + f)), B = JSON.parse(fs.readFileSync(root + '2027-2/' + f));
const yearList = new Set(A.lists.find((l) => l.name.includes("שנה א'")).courses);
const choices = Object.fromEntries([...yearList].map((id) => [id, 'must']));
const state = { passed: [], failed: {}, choices, semesterOf: {}, profile: { year: 1, amirnet: 120 }, outsideDone: [], load: 'even', sortBy: 'best' };
const constraints = { dayOff: [6], notBefore: '', notAfter: '20:00', examsSameDay: 'forbid', blocks: [], lecturers: {} };
const base = { friends: 0, progress: 1, freeDays: 5, compact: 5, timeWindow: 5, examSpread: 1 };
const r = searchYear({ dataA: A, dataB: B, state, yearList, constraints, weights: showWeights(base, 'best', []), friends: [], timeLimitMs: 3000 });
const nm = (id) => (A.courses[id] ?? B.courses[id]).name;
console.log('20126 =', nm('20126'), '| offered A:', !!A.courses['20126']?.offered, 'B:', !!B.courses['20126']?.offered);
for (const [i, p] of r.results.slice(0, 2).entries()) {
  console.log(`#${i + 1} score ${p.score.toFixed(2)} | missing: ${p.missing.map(nm).join(', ') || '-'} | credits A ${p.credits.a} B ${p.credits.b}`);
  console.log('   A:', p.a.courses.length, 'courses,', p.a.explanation, '| breakdown', JSON.stringify(Object.fromEntries(Object.entries(p.a.breakdown).map(([k, v]) => [k, +v.toFixed(2)]))));
  console.log('   B:', p.b?.courses.length, 'courses,', p.b?.explanation, '| breakdown', JSON.stringify(Object.fromEntries(Object.entries(p.b?.breakdown ?? {}).map(([k, v]) => [k, +v.toFixed(2)]))));
  console.log('   warnings:', p.warnings);
}
