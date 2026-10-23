// For every default-weight year instance whose best plan misses a must M:
//  1. exact check: ב׳ alone with M + every must that only ב׳ offers (and is open there) as must. No plan = proof M cannot fit.
//  2. exact check on the year: א׳ = musts only in א׳ + flexible musts, B as above... (constructive witness):
//     try every way to send each flexible must (offered in both) to א׳ or ב׳ (2^n, n small) and test both halves exactly.
//     A witness = a full year plan with no must missing that the year search did not return.
import fs from 'node:fs';
const { searchYear, search, showWeights } = await import('../../web/solver-core.js');
const { classify, modeFor } = await import('../../web/rules.js');
const root = 'web/data/afeka/';
const base = { friends: 3, progress: 3, freeDays: 1, compact: 1, timeWindow: 1, examSpread: 1 };
const constraints = { dayOff: [6], notBefore: '', notAfter: '20:00', examsSameDay: 'forbid', blocks: [], lecturers: {} };
const W = showWeights(base, 'best', []);
const out = [];
for (const f of fs.readdirSync(root + '2027-1')) {
  const A = JSON.parse(fs.readFileSync(root + '2027-1/' + f)), B = JSON.parse(fs.readFileSync(root + '2027-2/' + f));
  const years = Math.max(...A.lists.map((l) => ' אבגדה'.indexOf(l.name.match(/שנה ([א-ה])'/)?.[1] ?? ' ')));
  for (let year = 1; year <= Math.min(years, 3); year++) {
    const before = 'אבגדה'.slice(0, year - 1);
    const passed = [...new Set(A.lists.filter((l) => [...before].some((y) => l.name.includes(`שנה ${y}'`))).flatMap((l) => l.courses))];
    const yearList = new Set(A.lists.find((l) => l.name.includes(`שנה ${' אבגדה'[year]}'`))?.courses ?? []);
    const choices = Object.fromEntries([...yearList].map((id) => [id, 'must']));
    const state = { passed, failed: {}, choices, semesterOf: {}, profile: { year, amirnet: 120 }, outsideDone: [], load: 'even', sortBy: 'best' };
    const r = searchYear({ dataA: A, dataB: B, state, yearList, constraints, weights: W, friends: [], timeLimitMs: 3000 });
    if (!r.results[0]?.missing.length) continue;
    const best = Math.min(...r.results.map((p) => p.missing.length));
    // witness search over semester assignments of the year's must courses
    const stA = classify(A, state).statuses;
    const musts = [...yearList].filter((id) => A.courses[id] || B.courses[id]);
    const flex = musts.filter((id) => A.courses[id]?.offered && B.courses[id]?.offered);
    if (flex.length > 12) { out.push({ f, year, best, witness: 'skipped (2^' + flex.length + ')' }); continue; }
    let witness = null, tried = 0;
    for (let mask = 0; mask < 1 << flex.length && !witness; mask++) {
      const inA = new Set(musts.filter((id) => A.courses[id]?.offered && (!B.courses[id]?.offered || (mask >> flex.indexOf(id)) & 1)));
      // א׳ half: every course sent to א׳ must be open there and fit together
      if ([...inA].some((id) => !['available', 'retake', 'conditional'].includes(stA[id]?.status))) continue;
      const aCourses = [...inA].map((id) => ({ id, mode: 'must' }));
      const ra = aCourses.length ? search({ data: A, courses: aCourses, statuses: stA, constraints, weights: W, topK: 1, timeLimitMs: 20000, why: false }) : { results: [{ courses: [] }] };
      tried++;
      if (!ra.results.length) continue;
      const inB = musts.filter((id) => !inA.has(id));
      const stB = classify(B, { ...state, passed: [...passed, ...inA] }).statuses;
      if (inB.some((id) => !B.courses[id]?.offered || !['available', 'retake', 'conditional'].includes(stB[id]?.status))) continue;
      const rb = search({ data: B, courses: inB.map((id) => ({ id, mode: 'must' })), statuses: stB, constraints, weights: W, topK: 1, timeLimitMs: 20000, why: false });
      if (rb.results.length) witness = { A: [...inA].length, B: inB.length };
    }
    out.push({ f, year, best, flex: flex.length, tried, witness });
  }
}
console.log('instances (top plan misses a must):', out.length);
console.log('complete year plan EXISTS (witness) but year search missed it:', out.filter((o) => o.witness && typeof o.witness === 'object').length);
console.log('proved impossible (no assignment works):', out.filter((o) => o.witness === null).length);
console.log('skipped:', out.filter((o) => typeof o.witness === 'string').length);
for (const o of out.filter((o) => o.witness && typeof o.witness === 'object')) console.log(o);
