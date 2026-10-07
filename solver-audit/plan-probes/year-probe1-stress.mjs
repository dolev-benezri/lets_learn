// year-probe1-stress.mjs - probe 1: heavy requests. Same real requests, but the student marks EVERY course 'optional' (choices) so A and B have many candidates,
// plus 3 "must" sets. Compares original vs proposed (A distinct-50, B topK 5/10) at the UI year budget: time, partial flag, best score.
// RUN: node solver-audit/plan-probes/year-probe1-stress.mjs [budgetMs=3000] [reps=2] [filter]
import { searchYear } from '../../web/solver-core.js';
import { request, cases } from './year-real-lib.mjs';
import { loadProto, setKnobs } from './year-proto-lib.mjs';
const BUDGET = +(process.argv[2] ?? 3000), REPS = +(process.argv[3] ?? 2), FILTER = process.argv[4] ?? '';
const P = await loadProto();
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const cfgs = [['orig', null, {}], ['distinct50 K1', P.searchYear, { __A_DISTINCT: 1 }], ['distinct50 K5', P.searchYear, { __A_DISTINCT: 1, __B_K: 5 }], ['distinct50 K10', P.searchYear, { __A_DISTINCT: 1, __B_K: 10 }]];
for (const k of cases) {
  const name = `${k.p}-${k.start}-y${k.year}`;
  if (FILTER && !name.includes(FILTER)) continue;
  const base = request(k);
  const ids = Object.keys(base.dataA.courses).filter((id) => !base.state.passed.includes(id));
  for (const mode of ['all-optional', 'year-list-must']) {
    const choices = mode === 'all-optional' ? Object.fromEntries(ids.map((id) => [id, 'optional'])) : Object.fromEntries([...base.yearList].filter((id) => ids.includes(id)).slice(0, 6).map((id) => [id, 'must']));
    const req = { ...base, state: { ...base.state, choices } };
    const out = [];
    for (const [label, fn, knobs] of cfgs) {
      setKnobs(knobs);
      const times = []; let res;
      for (let r = 0; r < REPS; r++) { const t = performance.now(); res = (fn ?? searchYear)({ ...req, timeLimitMs: BUDGET }); times.push(performance.now() - t); }
      out.push(`${label}: ${Math.round(median(times))}ms partial=${res.partial} best=${res.results[0]?.score.toFixed(3)} n=${res.results.length}`);
    }
    console.log(`## ${name} ${mode}\n  ${out.join('\n  ')}`);
  }
}
