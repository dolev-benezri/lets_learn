// How often does the #1 year plan miss MORE must courses than another plan in the same list,
// over random UI weights (each 0/1/3/5) and every "show by" option? Real data, all programs, years 1-3.
import fs from 'node:fs';
const { searchYear, showWeights } = await import('../../web/solver-core.js');
const root = 'web/data/afeka/';
let seed = 4242;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const files = fs.readdirSync(root + '2027-1');
const bySort = {}, examples = [];
let n = 0, bad = 0;
const t0 = Date.now();
while (Date.now() - t0 < 240000) {
  const f = pick(files);
  const A = JSON.parse(fs.readFileSync(root + '2027-1/' + f)), B = JSON.parse(fs.readFileSync(root + '2027-2/' + f));
  const years = Math.max(...A.lists.map((l) => ' אבגדה'.indexOf(l.name.match(/שנה ([א-ה])'/)?.[1] ?? ' ')));
  const year = 1 + Math.floor(rnd() * Math.min(years, 3));
  const before = 'אבגדה'.slice(0, year - 1);
  const passed = [...new Set(A.lists.filter((l) => [...before].some((y) => l.name.includes(`שנה ${y}'`))).flatMap((l) => l.courses))];
  const yearList = new Set(A.lists.find((l) => l.name.includes(`שנה ${' אבגדה'[year]}'`))?.courses ?? []);
  const choices = Object.fromEntries([...yearList].map((id) => [id, 'must']));
  const sortBy = pick(['best', 'credits', 'unlocks']); // friends needs friends
  const base = Object.fromEntries(['friends', 'progress', 'freeDays', 'compact', 'timeWindow', 'examSpread'].map((k) => [k, pick([0, 1, 3, 5])]));
  const state = { passed, failed: {}, choices, semesterOf: {}, profile: { year, amirnet: 120 }, outsideDone: [], load: pick(['even', 'א', 'ב']), sortBy };
  const constraints = { dayOff: [6], notBefore: '', notAfter: '20:00', examsSameDay: 'forbid', blocks: [], lecturers: {} };
  const r = searchYear({ dataA: A, dataB: B, state, yearList, constraints, weights: showWeights(base, sortBy, []), friends: [], timeLimitMs: 3000 });
  if (!r.results.length) continue;
  n++;
  const miss = r.results.map((p) => p.missing.length);
  const s = (bySort[sortBy] ??= { n: 0, topMissesMore: 0 });
  s.n++;
  if (miss[0] > Math.min(...miss)) {
    bad++; s.topMissesMore++;
    if (examples.length < 5) examples.push({ f, year, sortBy, load: state.load, base, miss: miss.slice(0, 5) });
  }
}
console.log({ instances: n, topMissesMoreThanAnotherShownPlan: bad, pct: +(100 * bad / n).toFixed(1), bySort });
for (const e of examples) console.log(JSON.stringify(e));
