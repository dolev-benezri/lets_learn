// year-probe1-real.mjs - probe 1 (real data): time and quality of the F-11 variants on the real requests of solver-audit/repro/perf-ui-budget.mjs
// (12 programs year 1 + 3 year-3 students, UI settings: weights/constraints defaults, year budget 3000 ms).
// Variants run on an instrumented COPY (year-proto-lib.mjs). Each case x variant is run REPS times, the median wall time is reported.
// helper (not a script): the real requests of perf-ui-budget.mjs
import fs from 'node:fs';
import { searchYear } from '../../web/solver-core.js';
import { classify, modeFor } from '../../web/rules.js';

const root = new URL('../../web/data/afeka/', import.meta.url);
const read = (p) => (fs.existsSync(new URL(p, root)) ? JSON.parse(fs.readFileSync(new URL(p, root), 'utf8')) : null);
const catalog = read('catalog.json');
const weights = { friends: 3, progress: 3, freeDays: 1, compact: 1, timeWindow: 1, examSpread: 1 };
const constraints = { dayOff: [6], dayOffHard: false, notBefore: '', notAfter: '20:00', windowHard: false, maxCredits: null, maxDays: null, examsSameDay: 'forbid', includeFull: false, blocks: [], lecturers: {} };
const LET = ' אבגדה';
export const cases = catalog.programs.map((p) => ({ p: p.id, start: 2027, year: 1 })).concat([{ p: 30, start: 2025, year: 3 }, { p: 10, start: 2025, year: 3 }, { p: 20, start: 2025, year: 3 }]);
export const request = (k) => {
  const A = read(`2027-1/${k.p}-${k.start}.json`), B = read(`2027-2/${k.p}-${k.start}.json`);
  if (!A || !B) return null;
  const before = LET.slice(1, k.year);
  const passed = [...new Set(A.lists.filter((l) => [...before].some((y) => l.name.includes(`שנה ${y}'`))).flatMap((l) => l.courses))];
  const state = { passed, failed: {}, choices: {}, grades: {}, profile: { year: k.year, amirnet: 134, specs: [], summer: false }, load: 'even', semesterOf: {}, pins: [] };
  const yearList = new Set(A.lists.find((l) => l.name.includes(`שנה ${LET[k.year]}'`))?.courses ?? []);
  return { dataA: A, dataB: B, state, yearList, constraints, weights };
};
