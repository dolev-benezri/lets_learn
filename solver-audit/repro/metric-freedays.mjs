// metric-freedays.mjs - PREFIX metric. What "ימים פנויים" (free days) really measures, and how it relates to Friday and to the
// "ימים שאני רוצה פנויים" (day-off) picker.
//
// Targets: web/solver-core.js:185 (freeDays = [1,2,3,4,5] only: index 6 = Friday is never a free day), 24 (daysUsed counts 1..6),
//          265-273 + 199 (the day-off picker reaches the score only through prefMask -> timeWindow), 314 (bound uses the same d<=5),
//          web/ui-grid.js:143-148 (summary(): free days [1..5] again), web/ui-view.js:106 (pill text 'אין יום פנוי'),
//          web/app.js:14-17 (DEFAULT weights freeDays 1 / timeWindow 1, constraints.dayOff [6] = Friday soft),
//          web/ui-common.js:9 (labels), web/ui-drawer.js:29-36 (the two pickers), web/ui-actions.js:232 (maxDays 1..6).
// Run:     node solver-audit/repro/metric-freedays.mjs      (any cwd, ~3 s, deterministic, no network)
// Output:  CHECK/BUG lines, exit 0 iff all CHECK PASS and all BUG REPRODUCED.
import fs from 'node:fs';
import { search } from '../../web/solver-core.js';
import { DEFAULT } from '../../web/app.js';
import { summary } from '../../web/ui-grid.js';

let bad = 0;
const check = (id, ok, d) => { console.log(`CHECK ${id} ${ok ? 'PASS' : 'FAIL'} ${d}`); if (!ok) bad++; };
const bug = (id, rep, d) => { console.log(`BUG ${id} ${rep ? 'REPRODUCED' : 'NOT-REPRODUCED'} ${d}`); if (!rep) bad++; };

const grp = (id, day, start, end) => ({ id, type: 'סופי-הרצאה', primary: true, lecturer: 'L', full: false, semester: 'א', linked: [], meetings: [{ day, start, end, room: 'r' }], exams: [] });
const crs = (name, credits, groups) => ({ name, credits, offered: true, prereqs: [], groups });
const data = (courses) => ({ year: 2027, semester: 'א', examsPublished: false, lists: [], courses });
const W = (o) => ({ friends: 0, progress: 0, freeDays: 0, compact: 0, timeWindow: 0, examSpread: 0, ...o });
const run = (d, ids, weights, constraints = {}) => search({ data: d, courses: ids.map((id) => ({ id, mode: 'must' })), statuses: {}, constraints: { examsSameDay: 'allow', ...constraints }, weights, friends: [], topK: 10, timeLimitMs: 5000 });
const days = (r, d) => [...new Set(r.groups.flatMap((g) => Object.values(d.courses).flatMap((c) => c.groups.filter((x) => x.id === g).flatMap((x) => x.meetings.map((m) => m.day)))))].sort();

// 1. Friday is not a free day: a Friday-only plan has ALL five free days -----------------------------------------------------------
{
  const d = data({ Y: crs('Y', 3, [grp('YF', 6, '10:00', '12:50')]) });
  const r = run(d, ['Y'], W({ freeDays: 1 }));
  check('freedays-1', r.results[0].breakdown.freeDays === 1 && r.results[0].explanation.includes('יום א\', יום ב\', יום ג\', יום ד\', יום ה\' פנוי'),
    `a plan whose only lesson is on Friday (day 6): breakdown.freeDays = ${r.results[0].breakdown.freeDays} (5/5) and explanation "${r.results[0].explanation}" lists Sun..Thu as free; the campus day (Friday) is invisible to the metric`);
}

// 2. Consequence: with the stock Friday-off preference, a heavier free-days weight moves classes TO Friday -----------------------------------
{
  // one course, two groups: Friday 10:00-11:50 vs Sunday 10:00-11:50; user keeps the stock constraints (Friday off, soft; not after 20:00)
  const d = data({ Y: crs('Y', 3, [grp('YF', 6, '10:00', '11:50'), grp('YS', 1, '10:00', '11:50')]) });
  const stock = structuredClone(DEFAULT.constraints); // dayOff [6], notAfter 20:00, both soft - what every new user has
  const rows = [];
  for (const [label, w] of [['stock UI weights', { ...DEFAULT.weights }], ['freeDays=3 (חשוב)', { ...DEFAULT.weights, freeDays: 3 }], ['freeDays=5 (מאוד)', { ...DEFAULT.weights, freeDays: 5 }], ['freeDays=0', { ...DEFAULT.weights, freeDays: 0 }]]) {
    const r = run(d, ['Y'], w, stock), top = r.results[0], other = r.results[1];
    rows.push({ label, topDay: days(top, d).join(), topScore: +top.score.toFixed(3), otherScore: +other.score.toFixed(3) });
  }
  console.log('  Friday(6) vs Sunday(1), same hours, stock constraints dayOff=[6] soft:'); for (const r of rows) console.log(`    ${r.label}: top plan on day ${r.topDay} (score ${r.topScore}, runner-up ${r.otherScore})`);
  const hit = rows.filter((r) => r.topDay === '6').map((r) => r.label);
  bug('metric-friday-dump', hit.length > 0 && rows.find((r) => r.label === 'freeDays=0').topDay === '1',
    `with Friday marked as a day the student wants free, the solver picks the Friday group when: ${hit.join('; ')}. Cause: Friday never counts as a day used, so moving the lesson there frees a Sun-Thu day (+0.2 x weight) while the Friday-off preference only costs timeWindow (weight x 0.2 for a 2h lesson)`);
}

// 3. The day-off picker does not feed the free-days metric: it exists only inside timeWindow ----------------------------------------------------
{
  const mk = (order) => { const gs = order === 'SM' ? [grp('S', 1, '10:00', '12:50'), grp('M', 2, '10:00', '12:50')] : [grp('M', 2, '10:00', '12:50'), grp('S', 1, '10:00', '12:50')]; return data({ Y: crs('Y', 3, gs) }); };
  const c = { dayOff: [1], dayOffHard: false }; // "I want Sunday free" (soft)
  const a = run(mk('SM'), ['Y'], W({ freeDays: 5 }), c), b = run(mk('MS'), ['Y'], W({ freeDays: 5 }), c);
  const tie = a.results[0].score === a.results[1].score, flips = a.results[0].groups[0] !== b.results[0].groups[0];
  const withTw = run(mk('SM'), ['Y'], W({ freeDays: 5, timeWindow: 1 }), c);
  bug('metric-dayoff-not-freedays', tie && flips && withTw.results[0].groups[0] === 'M',
    `weights {freeDays:5} + "Sunday free (soft)": the Sunday plan and the Monday plan tie at ${a.results[0].score} and the winner is just option order (${a.results[0].groups[0]} when S is listed first, ${b.results[0].groups[0]} when M is first); only a timeWindow weight makes Sunday lose (${withTw.results[0].groups[0]} wins with timeWindow=1). The slider "ימים פנויים" ignores the days the user picked in "ימים שאני רוצה פנויים"`);
}

// 4. maxDays counts Friday, freeDays does not -------------------------------------------------------------------------------------------------
{
  const d = data({ A: crs('A', 3, [grp('AS', 1, '10:00', '11:50')]), B: crs('B', 3, [grp('BF', 6, '10:00', '11:50')]) });
  const r1 = run(d, ['A', 'B'], W({ freeDays: 1 }), { maxDays: 1 }), r2 = run(d, ['A', 'B'], W({ freeDays: 1 }), { maxDays: 2 });
  check('freedays-4a', r1.results.length === 0 && r2.results.length === 1, `maxDays counts Friday as a campus day (Sunday + Friday = 2 days: maxDays=1 -> ${r1.results.length} plans, maxDays=2 -> ${r2.results.length})`);
  bug('metric-friday-inconsistent', r2.results[0].breakdown.freeDays === 0.8, `...but the same Sunday+Friday plan has freeDays = ${r2.results[0].breakdown.freeDays} (= 4/5): two campus days, one "used" day; maxDays (web/solver-core.js:24 counts d>=1, 6 days) and freeDays (:185 counts 1..5) disagree about Friday`);
}

// 5. The pill the student reads says "no free day" when the only free day is the Friday they asked for -----------------------------------------
{
  const gs = [1, 2, 3, 4, 5].map((d) => grp(`G${d}`, d, '10:00', '11:50'));
  const d = data(Object.fromEntries(gs.map((g, i) => [`K${i}`, crs(`K${i}`, 2, [g])])));
  const r = run(d, Object.keys(d.courses), W({ freeDays: 1 }), { dayOff: [6] });
  const s = summary(r.results[0], d, []);
  bug('metric-friday-pill', s.freeDays.length === 0 && r.results[0].breakdown.freeDays === 0,
    `classes Sunday..Thursday, Friday untouched and requested free: summary().freeDays = ${JSON.stringify(s.freeDays)} -> web/ui-view.js:106 prints 'אין יום פנוי' ("no free day"); breakdown.freeDays = ${r.results[0].breakdown.freeDays}`);
}

// 6. Real data: how much Friday there is ----------------------------------------------------------------------------------------------------------
{
  const ROOT = new URL('../../web/data/afeka/', import.meta.url);
  let fri = 0, all = 0, coursesWithFri = 0, coursesAny = 0, onlyFri = 0;
  for (const s of ['2027-1', '2027-2', '2027-3']) for (const f of fs.readdirSync(new URL(`${s}/`, ROOT)).filter((x) => x.endsWith('.json'))) {
    const d = JSON.parse(fs.readFileSync(new URL(`${s}/${f}`, ROOT), 'utf8'));
    for (const c of Object.values(d.courses)) {
      const prim = c.groups.filter((g) => g.primary); if (!prim.length) continue; coursesAny++;
      const has = prim.map((g) => g.meetings.some((m) => m.day === 6));
      if (has.some(Boolean)) coursesWithFri++; if (has.every(Boolean)) onlyFri++;
      for (const g of c.groups) for (const m of g.meetings) { all++; if (m.day === 6) fri++; }
    }
  }
  check('freedays-6', fri > 0, `real data (144 files): ${fri} of ${all} meetings are on Friday; ${coursesWithFri}/${coursesAny} offered course records have at least one Friday group and ${onlyFri} have Friday as their only option, so the Friday handling is reachable with real data`);
}

// 7. Real data, one course at a time with the stock settings: how often is the top choice a Friday group when a non-Friday group exists? --------------
{
  const ROOT = new URL('../../web/data/afeka/2027-1/', import.meta.url);
  const tally = { stock: [0, 0], free3: [0, 0], free5: [0, 0] };
  for (const f of ['30-2026', '10-2026', '40-2026', '20-2026']) {
    const d = JSON.parse(fs.readFileSync(new URL(`${f}.json`, ROOT), 'utf8'));
    for (const [id, c] of Object.entries(d.courses)) {
      const prim = c.groups.filter((g) => g.primary && !g.full); if (!prim.length) continue;
      const friday = (g) => g.meetings.some((m) => m.day === 6) || g.linked.some((l) => c.groups.find((x) => x.id === l)?.meetings.some((m) => m.day === 6));
      if (!prim.some(friday) || prim.every(friday)) continue; // a real Friday-vs-other choice exists
      for (const [k, w] of [['stock', DEFAULT.weights], ['free3', { ...DEFAULT.weights, freeDays: 3 }], ['free5', { ...DEFAULT.weights, freeDays: 5 }]]) {
        const r = search({ data: d, courses: [{ id, mode: 'must' }], statuses: {}, constraints: { ...structuredClone(DEFAULT.constraints), examsSameDay: 'allow' }, weights: w, friends: [], topK: 1, timeLimitMs: 2000 });
        if (!r.results.length) continue; tally[k][1]++;
        const picked = r.results[0].groups.some((g) => c.groups.find((x) => x.id === g).meetings.some((m) => m.day === 6)); if (picked) tally[k][0]++;
      }
    }
  }
  console.log(`  real courses with a Friday-vs-other-day choice (4 programs, semester A): picks a Friday option under stock weights ${tally.stock[0]}/${tally.stock[1]}, freeDays=3 ${tally.free3[0]}/${tally.free3[1]}, freeDays=5 ${tally.free5[0]}/${tally.free5[1]}`);
  bug('metric-friday-dump-real', tally.free3[0] > tally.stock[0] || tally.free5[0] > tally.stock[0], 'on committed data, raising the free-days weight (UI scale 3 or 5) increases how many single courses are put on Friday although Friday is the stock day-off');
}
process.exitCode = bad ? 1 : 0;
