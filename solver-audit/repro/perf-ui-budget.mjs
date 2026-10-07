// WHAT: runs search() and searchYear() on real data the way web/ui-search.js:17-41 does (time budget 1500 ms per semester,
// 3000 ms per year) for every program's first-year student and a few third-year students; reports time, partial flag,
// and, when the UI budget ran out, how much better a longer run (12000 ms = MAX_MS, web/ui-search.js:7) does.
// Request shape follows web/app.js:9-17 (DEFAULT weights/constraints), web/app.js:174-180 (yearCourses/candidateMode),
// web/app.js:162-166 (ensurePassed: earlier years' mandatory lists count as passed).
// RUN: node solver-audit/repro/perf-ui-budget.mjs        (about 2-3 minutes; wall-clock timings, so numbers vary by machine)
// OUTPUT: one INFO line per case; CHECK P-1 asserts no case crashes and every returned plan has no time clash.
import fs from 'node:fs';
import { search, searchYear, meetingsMask, overlaps } from '../../web/solver-core.js';
import { classify, modeFor } from '../../web/rules.js';

const root = new URL('../../web/data/afeka/', import.meta.url);
const read = (p) => (fs.existsSync(new URL(p, root)) ? JSON.parse(fs.readFileSync(new URL(p, root), 'utf8')) : null);
const catalog = read('catalog.json');
const weights = { friends: 3, progress: 3, freeDays: 1, compact: 1, timeWindow: 1, examSpread: 1 };
const constraints = { dayOff: [6], dayOffHard: false, notBefore: '', notAfter: '20:00', windowHard: false, maxCredits: null, maxDays: null, examsSameDay: 'forbid', includeFull: false, blocks: [], lecturers: {} };
const LET = ' אבגדה';
let ok = true;
const clash = (plan, data) => {
  const masks = plan.groups.map((gid) => { for (const c of Object.values(data.courses)) { const g = c.groups.find((x) => x.id === gid); if (g) return meetingsMask(g.meetings); } return null; });
  for (let i = 0; i < masks.length; i++) for (let j = i + 1; j < masks.length; j++) if (masks[i] && masks[j] && overlaps(masks[i], masks[j])) return true;
  return false;
};
const cases = catalog.programs.map((p) => ({ p: p.id, start: 2027, year: 1 }))
  .concat([{ p: 30, start: 2025, year: 3 }, { p: 10, start: 2025, year: 3 }, { p: 20, start: 2025, year: 3 }]);
for (const k of cases) {
  const A = read(`2027-1/${k.p}-${k.start}.json`), B = read(`2027-2/${k.p}-${k.start}.json`);
  if (!A || !B) { console.log(`INFO ${k.p}-${k.start} missing data`); continue; }
  const before = LET.slice(1, k.year);
  const passed = [...new Set(A.lists.filter((l) => [...before].some((y) => l.name.includes(`שנה ${y}'`))).flatMap((l) => l.courses))];
  const state = { passed, failed: {}, choices: {}, grades: {}, profile: { year: k.year, amirnet: 134, specs: [], summer: false }, load: 'even', semesterOf: {}, pins: [] };
  const yearList = new Set(A.lists.find((l) => l.name.includes(`שנה ${LET[k.year]}'`))?.courses ?? []);
  const st = classify(A, state).statuses;
  const courses = Object.keys(A.courses).map((id) => ({ id, mode: modeFor(st[id]?.status, undefined, yearList.has(id)) })).filter((c) => c.mode === 'must' || c.mode === 'optional');
  try {
    let t = performance.now();
    const s = search({ data: A, courses, statuses: st, constraints, weights, timeLimitMs: 1500 });
    const ms1 = Math.round(performance.now() - t);
    let gap = '';
    if (s.partial) {
      const L = search({ data: A, courses, statuses: st, constraints, weights, timeLimitMs: 12000 });
      gap = ` | 12000ms: partial=${L.partial} best=${L.results[0]?.score.toFixed(3)} vs 1500ms best=${s.results[0]?.score.toFixed(3)}`;
    }
    t = performance.now();
    const y = searchYear({ dataA: A, dataB: B, state, yearList, constraints, weights, timeLimitMs: 3000 });
    const ms2 = Math.round(performance.now() - t);
    const bad = s.results.some((r) => clash(r, A)) || y.results.some((p) => clash(p.a, A) || (p.b && clash(p.b, B)));
    ok &&= !bad;
    console.log(`INFO ${k.p}-${k.start} y${k.year}: candidates=${courses.length} | semA ${ms1}ms partial=${s.partial} results=${s.results.length}${gap} | year ${ms2}ms partial=${y.partial} pairs=${y.results.length} clash=${bad}`);
  } catch (e) { ok = false; console.log(`INFO ${k.p}-${k.start} CRASH ${e.message}`); }
}
console.log(`CHECK P-1 ${ok ? 'PASS' : 'FAIL'} no crash and no time clash in any returned plan`);
process.exit(ok ? 0 : 1);
