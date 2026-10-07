// year-probe1-real.mjs - probe 1 (real data): time and quality of the F-11 variants on the real requests of solver-audit/repro/perf-ui-budget.mjs
// (12 programs year 1 + 3 year-3 students, UI settings: weights/constraints defaults, year budget 3000 ms).
// Variants run on an instrumented COPY (year-proto-lib.mjs). Each case x variant is run REPS times, the median wall time is reported.
// RUN: node solver-audit/plan-probes/year-probe1-real.mjs [budgetMs=3000] [reps=3] [filter]
import { searchYear } from '../../web/solver-core.js';
import { request, cases } from './year-real-lib.mjs';
import { loadProto, setKnobs } from './year-proto-lib.mjs';
const BUDGET = +(process.argv[2] ?? 3000), REPS = +(process.argv[3] ?? 3), FILTER = process.argv[4] ?? '';
const P = await loadProto();
const variants = [
  ['original', searchYear, {}],
  ['K=1 (proto)', P.searchYear, {}],
  ['K=3', P.searchYear, { __B_K: 3 }],
  ['K=5', P.searchYear, { __B_K: 5 }],
  ['K=10', P.searchYear, { __B_K: 10 }],
  ['K=1 dedup', P.searchYear, { __A_DEDUP: 1 }],
  ['K=5 dedup', P.searchYear, { __B_K: 5, __A_DEDUP: 1 }],
];
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const rows = [];
for (const k of cases) {
  const name = `${k.p}-${k.start}-y${k.year}`;
  if (FILTER && !name.includes(FILTER)) continue;
  const req = request(k);
  if (!req) continue;
  const line = [];
  for (const [label, fn, knobs] of variants) {
    setKnobs(knobs);
    const times = []; let res, cap = {};
    for (let r = 0; r < REPS; r++) {
      globalThis.__CAPTURE = cap;
      const t = performance.now();
      res = fn({ ...req, timeLimitMs: BUDGET });
      times.push(performance.now() - t);
    }
    const top = res.results;
    const sets = new Set(top.map((p) => [...p.a.courses].sort().join())).size;
    line.push({ label, ms: Math.round(median(times)), partial: res.partial, best: top[0]?.score, n: top.length, sets, aN: cap.aList?.length, distinctA: cap.aList ? new Set(cap.aList.map((a) => [...a.courses].sort().join())).size : null });
  }
  setKnobs({});
  rows.push({ name, line });
  console.log(`## ${name}`);
  for (const v of line) console.log(`  ${v.label.padEnd(12)} ${String(v.ms).padStart(5)}ms partial=${v.partial} best=${v.best?.toFixed(4)} pairs=${v.n} distinctASetsInTop10=${v.sets} A-alternatives=${v.aN ?? '-'} distinctSets=${v.distinctA ?? '-'}`);
}
