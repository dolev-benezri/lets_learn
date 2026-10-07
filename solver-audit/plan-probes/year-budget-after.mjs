// Stage 8: wall time of the FIXED searchYear() on heavy real requests (every course optional), against the UI budget.
// RUN: node solver-audit/plan-probes/year-budget-after.mjs [budgetMs=3000]
import { searchYear } from '../../web/solver-core.js';
import { request, cases } from './year-real-lib.mjs';

const BUDGET = Number(process.argv[2] ?? 3000);
let worst = 0, over = 0, n = 0;
for (const k of cases) {
  const base = request(k);
  const ids = Object.keys(base.dataA.courses).filter((id) => !base.state.passed.includes(id));
  const req = { ...base, state: { ...base.state, choices: Object.fromEntries(ids.map((id) => [id, 'optional'])) } };
  const t = performance.now(); const res = searchYear({ ...req, timeLimitMs: BUDGET }); const ms = Math.round(performance.now() - t);
  n++; worst = Math.max(worst, ms); if (ms > BUDGET) over++;
  console.log(`${k.p}-${k.start}-y${k.year} all-optional: ${ms}ms partial=${res.partial} pairs=${res.results.length} best=${res.results[0]?.score.toFixed(3)}`);
}
console.log(`INFO YEAR-BUDGET ${n} requests, budget ${BUDGET} ms: worst ${worst} ms (${(worst / BUDGET).toFixed(2)}x), over budget ${over}`);
