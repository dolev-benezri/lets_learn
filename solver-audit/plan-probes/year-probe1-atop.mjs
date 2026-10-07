// year-probe1-atop.mjs - probe 1: A-side diversity. Flat top-N A plans + dedup by course set vs a distinct-by-course-set top-N inside search().
// Real requests of perf-ui-budget.mjs, B topK=5. Prints per case: ms, partial, distinct A sets tried, best pair score, pairs returned.
// RUN: node solver-audit/plan-probes/year-probe1-atop.mjs [budgetMs=3000] [reps=3] [filter]
import { request, cases } from './year-real-lib.mjs';
import { loadProto, setKnobs } from './year-proto-lib.mjs';
const BUDGET = +(process.argv[2] ?? 3000), REPS = +(process.argv[3] ?? 3), FILTER = process.argv[4] ?? '';
const P = await loadProto();
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const cfgs = [
  ['orig-shape K5 flat50', { __B_K: 5 }],
  ['flat50+dedup', { __B_K: 5, __A_DEDUP: 1 }],
  ['flat200+dedup', { __B_K: 5, __A_DEDUP: 1, __A_TOP: 200 }],
  ['flat1000+dedup', { __B_K: 5, __A_DEDUP: 1, __A_TOP: 1000 }],
  ['distinct20', { __B_K: 5, __A_DISTINCT: 1, __A_TOP: 20 }],
  ['distinct50', { __B_K: 5, __A_DISTINCT: 1, __A_TOP: 50 }],
  ['distinct100', { __B_K: 5, __A_DISTINCT: 1, __A_TOP: 100 }],
  ['distinct200', { __B_K: 5, __A_DISTINCT: 1, __A_TOP: 200 }],
];
const tot = Object.fromEntries(cfgs.map(([n]) => [n, 0])), gain = Object.fromEntries(cfgs.map(([n]) => [n, 0])), part = Object.fromEntries(cfgs.map(([n]) => [n, 0]));
const maxMs = Object.fromEntries(cfgs.map(([n]) => [n, 0]));
for (const k of cases) {
  const name = `${k.p}-${k.start}-y${k.year}`;
  if (FILTER && !name.includes(FILTER)) continue;
  const req = request(k);
  if (!req) continue;
  const rows = [];
  for (const [label, knobs] of cfgs) {
    setKnobs(knobs);
    const times = []; let res; const cap = {};
    for (let r = 0; r < REPS; r++) { globalThis.__CAPTURE = cap; const t = performance.now(); res = P.searchYear({ ...req, timeLimitMs: BUDGET }); times.push(performance.now() - t); }
    const ms = median(times); tot[label] += ms; maxMs[label] = Math.max(maxMs[label], ms); if (res.partial) part[label]++;
    rows.push({ label, ms, partial: res.partial, sets: new Set(cap.aList.map((a) => [...a.courses].sort().join())).size, aN: cap.aList.length, best: res.results[0]?.score, n: res.results.length });
  }
  const top = Math.max(...rows.map((r) => r.best));
  console.log(`## ${name}`);
  for (const r of rows) { gain[r.label] += top - r.best; console.log(`  ${r.label.padEnd(22)} ${String(Math.round(r.ms)).padStart(5)}ms partial=${r.partial} A-alts=${r.aN} sets=${r.sets} best=${r.best?.toFixed(4)}${top - r.best > 1e-9 ? ` (-${(top - r.best).toFixed(3)} vs best config)` : ''} pairs=${r.n}`); }
}
console.log('SUMMARY (total ms over cases | max ms | partial cases | sum of score shortfall vs best config)');
for (const [n] of cfgs) console.log(`  ${n.padEnd(22)} ${Math.round(tot[n])} | ${Math.round(maxMs[n])} | ${part[n]} | ${gain[n].toFixed(3)}`);
