// search-ref-real.mjs
// WHAT: search() vs the independent exhaustive reference on REAL committed data (web/data/afeka/2027-{1,2,3}/*.json): random subsets
//       of 4-7 courses small enough to brute-force, random constraints/weights/friends/pins, 50% of the instances on a clone of the
//       data with synthetic exam dates (all 144 committed files have examsPublished=false, so exam code needs injected dates).
//       Also validates every returned plan at MINUTE level (independent of the 30-minute slots): no two chosen meetings overlap,
//       the groups of an option are a lecture plus linked groups of the right course, credits/day caps hold.
// TARGETS: web/solver-core.js:248-373 (search), 54-102 (buildOptions supplies only the lecture+tutorial combinations; every filter is re-applied by the reference).
// RUN:   node solver-audit/repro/search-ref-real.mjs      (~20-50 s, wall-clock only bounds the instance count)
// PROVES: SRR-1 top-K identical to exhaustive on real data; SRR-2 returned plans are valid at minute level.
import { search } from '../../web/solver-core.js';
import { mulberry32, realFiles, loadReal, stripSelfLoops, withExams, realInstance, referenceSolve, compareTopK, tagResults, mm, Report } from './search-lib.mjs';

const R = new Report();
const files = ['2027-1', '2027-2', '2027-3'].flatMap((sem) => realFiles(sem).map((f) => [sem, f]));
const cache = new Map();
const N = 500, t0 = Date.now();
let bad = 0, first = null, n = 0, feasible = 0, minuteBad = 0, firstMinute = null, withEx = 0, skipped = 0;
for (let seed = 1; seed <= N && Date.now() - t0 < 50000; seed++) {
  const rng = mulberry32(seed * 6151);
  const [sem, f] = files[Math.floor(rng() * files.length)];
  const key = `${sem}/${f}`;
  if (!cache.has(key)) cache.set(key, stripSelfLoops(loadReal(sem, f))); // 5 courses list themselves as a prerequisite: removed here, see search-selfloop-prereq.mjs
  let data = cache.get(key);
  if (rng() < 0.5) { data = withExams(data, rng); withEx++; }
  const inst = realInstance(rng, data, { maxProduct: 150000 });
  if (inst.courses.length < 3) { skipped++; continue; }
  let ref;
  try { ref = referenceSolve(inst, { cap: 3_000_000 }); } catch { skipped++; continue; }
  const out = search({ ...inst, timeLimitMs: 1e9 });
  n++;
  const problems = compareTopK(tagResults(out.results, data), ref, inst.topK);
  if (out.partial) problems.push('partial with 1e9 ms');
  if (ref.sols.length) feasible++;
  if (problems.length) { bad++; first ??= { seed, key, problems: problems.slice(0, 3) }; }
  // minute-level plan validation
  for (const r of out.results) {
    const iv = [];
    const g2 = {};
    for (const [cid, c] of Object.entries(data.courses)) for (const g of c.groups) g2[g.id] = { cid, g };
    const errs = [];
    for (const gid of r.groups) for (const m of g2[gid].g.meetings) iv.push({ gid, day: m.day, s: mm(m.start), e: mm(m.end) });
    for (let i = 0; i < iv.length; i++) for (let j = i + 1; j < iv.length; j++) if (iv[i].day === iv[j].day && iv[i].s < iv[j].e && iv[j].s < iv[i].e) errs.push(`minute overlap ${iv[i].gid}/${iv[j].gid}`);
    const cr = r.courses.reduce((a, id) => a + data.courses[id].credits, 0);
    if (inst.constraints.maxCredits && cr > inst.constraints.maxCredits) errs.push(`credits ${cr} > ${inst.constraints.maxCredits}`);
    const days = new Set(iv.map((x) => x.day)).size;
    if (inst.constraints.maxDays && days > inst.constraints.maxDays) errs.push(`days ${days} > cap`);
    for (const id of r.courses) if (!inst.courses.some((c) => c.id === id)) errs.push(`unknown course ${id}`);
    for (const c of inst.courses.filter((c) => c.mode === 'must')) if (!r.courses.includes(c.id)) errs.push(`must ${c.id} missing`);
    if (errs.length) { minuteBad++; firstMinute ??= { seed, key, errs: errs.slice(0, 3) }; }
  }
}
R.info(`instances run=${n} skipped=${skipped} feasible=${feasible} on-real-data-with-injected-exams=${withEx} files-touched=${cache.size}`);
R.check('SRR-1 search() == exhaustive reference on real-data subsets', bad === 0 && n >= 60, bad ? `${bad}/${n} mismatches; first ${JSON.stringify(first)}` : `all ${n} identical`);
R.check('SRR-2 every returned plan is valid at minute level (no overlap, caps, musts present)', minuteBad === 0, minuteBad ? `${minuteBad} bad plans; first ${JSON.stringify(firstMinute)}` : 'ok');
R.done();
