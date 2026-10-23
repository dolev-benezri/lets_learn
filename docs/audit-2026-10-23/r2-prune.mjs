// Branch-and-bound exactness on REAL data: prune on vs off must return the same top-K scores,
// across random UI weights (0/1/3/5), every "show by" criterion, real friends and constraints.
import fs from 'node:fs';
const { search, showWeights } = await import('../../web/solver-core.js');
const { classify, modeFor, studyYear } = await import('../../web/rules.js');
const root = 'web/data/afeka/';
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const files = [];
for (const sem of ['2027-1', '2027-2']) for (const f of fs.readdirSync(root + sem)) files.push(sem + '/' + f);
let runs = 0, skipped = 0, mismatches = [], withPlans = 0, plans = 0;
const t0 = Date.now();
while (runs < 3000 && Date.now() - t0 < 90000) {
  const file = pick(files), data = JSON.parse(fs.readFileSync(root + file));
  const year = 1 + Math.floor(rnd() * 3);
  const before = 'אבגדה'.slice(0, year - 1);
  const passed = [...new Set(data.lists.filter((l) => [...before].some((y) => l.name.includes(`שנה ${y}'`))).flatMap((l) => l.courses))];
  const state = { passed, failed: {}, profile: { year, amirnet: 120 }, outsideDone: [] };
  const cls = classify(data, state);
  const yl = new Set(data.lists.find((l) => l.name.includes(`שנה ${' אבגדה'[year]}'`))?.courses ?? []);
  let courses = Object.keys(data.courses).map((id) => ({ id, mode: modeFor(cls.statuses[id]?.status, undefined, yl.has(id)) }))
    .filter((c) => c.mode === 'optional');
  // keep the exhaustive run tractable: at most 7 optional, 0-2 of them must
  courses = courses.sort(() => rnd() - 0.5).slice(0, 11).map((c, i) => (i < Math.floor(rnd() * 3) ? { ...c, mode: 'must' } : c));
  if (!courses.length) { skipped++; continue; }
  const allGroups = courses.flatMap((c) => data.courses[c.id].groups.map((g) => g.id));
  const friends = Array.from({ length: Math.floor(rnd() * 3) }, (_, i) => ({ name: 'f' + i, weight: pick([1, 2, 3]), active: true,
    groups: allGroups.filter(() => rnd() < 0.3) }));
  const W = () => pick([0, 1, 3, 5]);
  const base = { friends: W(), progress: W(), freeDays: W(), compact: W(), timeWindow: W(), examSpread: W() };
  const sortBy = pick(['best', 'credits', 'friends', 'unlocks']);
  const weights = showWeights(base, sortBy, friends);
  const constraints = { dayOff: [6], notBefore: pick(['', '09:00']), notAfter: pick(['', '20:00']), examsSameDay: 'forbid',
    maxDays: pick([null, null, 3, 4]), maxCredits: pick([null, null, 15]), blocks: [], lecturers: {} };
  const args = { data, courses, statuses: cls.statuses, constraints, weights, friends, topK: 10, timeLimitMs: 60000, why: false };
  const a = search({ ...args, prune: true }), b = search({ ...args, prune: false });
  runs++;
  if (a.partial || b.partial) { skipped++; continue; }
  const sa = a.results.map((r) => r.score.toFixed(6)).join(), sb = b.results.map((r) => r.score.toFixed(6)).join();
  if (a.results.length) { withPlans++; plans += a.results.length; }
  if (sa !== sb) mismatches.push({ file, sortBy, weights: base, sa, sb });
}
console.log({ withPlans, avgPlans: plans / withPlans, runs, skippedOrPartial: skipped, mismatches: mismatches.length, seconds: (Date.now() - t0) / 1000 });
for (const m of mismatches.slice(0, 3)) console.log(m);
