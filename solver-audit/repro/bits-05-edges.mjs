// bits-05-edges.mjs
// What it checks (edges of the 30-minute bitmask model, web/solver-core.js):
//   popcount (private, :165-169) vs a naive bit loop; the gap formula in metrics() (:187-195, lowest/highest set bit incl. bit 31);
//   daysUsed (:24); lateMask table (:28-31); meetingsMask on meetings outside 07:00-23:00, on day 0/null/7 (:11-20);
//   the scraper's accepted hour range (scripts/build.mjs:100) vs the solver grid; Friday (day 6) in freeDays (:185) vs daysUsed (:24)
//   vs dayOff/prefMask (:265-273); soft day-off scored only through the timeWindow weight.
// Run: node solver-audit/repro/bits-05-edges.mjs      (any cwd; ~10 s; deterministic, seeded PRNG)
// Uses a generated COPY of web/solver-core.js (bits-lib.mjs) only to reach the private popcount/metrics/daysUsed; the copy only adds an export line.
// Output: CHECK = correct, BUG = defect (REPRODUCED = exists), exit 0 iff all CHECK PASS and all BUG REPRODUCED.
import { meetingsMask, overlaps, merge, search, toMin } from '../../web/solver-core.js';
import { validate } from '../../scripts/build.mjs';
import { loadInstrumented, mulberry32, hhmm } from './bits-lib.mjs';

let allOk = true;
const CHECK = (id, ok, detail) => { console.log(`CHECK ${id} ${ok ? 'PASS' : 'FAIL'} ${detail}`); if (!ok) allOk = false; };
const BUG = (id, reproduced, detail) => { console.log(`BUG ${id} ${reproduced ? 'REPRODUCED' : 'NOT-REPRODUCED'} ${detail}`); if (!reproduced) allOk = false; };
const { mod, changedLines } = await loadInstrumented('05');
console.log(`instrumented copy: ${changedLines} line(s) differ from web/solver-core.js (import path + appended export)`);
const { popcount, metrics, daysUsed } = mod;
const rnd = mulberry32(20261006);
const hex = (x) => '0x' + (x >>> 0).toString(16).padStart(8, '0');

// ---- popcount ----------------------------------------------------------------------------------------------------------------
const naivePop = (x) => { let c = 0; for (let i = 0; i < 32; i++) if (((x >>> i) & 1) === 1) c++; return c; };
const vals = [0, 1, -1, ~0, 0x7fffffff, 0x80000000, -2147483648, 2147483648, 0xffffffff, 0x55555555, 0xaaaaaaaa, 0x0f0f0f0f, 0xf0f0f0f0, 0x80000001, 0xc0000000];
for (let i = 0; i < 32; i++) { vals.push(1 << i); for (let j = i + 1; j < 32; j++) vals.push((1 << i) | (1 << j)); }
for (let k = 0; k < 1000000; k++) vals.push(Math.floor(rnd() * 4294967296) | 0);       // signed int32, as produced by &, | and <<
let popBad = 0, first = null;
for (const v of vals) if (popcount(v) !== naivePop(v)) { popBad++; first ??= v; }
CHECK('bits-05a', popBad === 0, `popcount == naive bit loop for ${vals.length} values (every 1-bit and 2-bit pattern, 0, ~0, bit 31 alone, 0x7fffffff, 0xaaaaaaaa, 1e6 seeded random int32); mismatches=${popBad}${first === null ? '' : ' first ' + hex(first)}`);

// ---- gap / freeDays in metrics() on random + edge masks, incl. bit 31 ------------------------------------------------------------
const ctx0 = { friends: [], value: { c: 1 }, maxValue: 1, examsPublished: false, prefMask: new Array(7).fill(0), freeCand: [1, 2, 3, 4, 5] }; // freeCand: D1, issue #7 (no wished day off)
const sel0 = [{ minutes: 60, sharedMin: [], sharesWith: [], exams: [], course: 'c' }];
const naiveGap = (mask) => { let g = 0; for (let d = 1; d <= 6; d++) { const bits = []; for (let i = 0; i < 32; i++) bits.push((mask[d] >>> i) & 1); const one = bits.reduce((a, b, i) => (b ? [...a, i] : a), []); if (!one.length) continue; for (let i = one[0]; i <= one[one.length - 1]; i++) if (!bits[i]) g += 30; } return g; };
const edge = [0, 1, 0x80000000 | 0, 0x80000001 | 0, ~0, 0xc0000000 | 0, 0x00ff00ff, 0x80000100 | 0, 0x40000000, 0xf000000f | 0];
let gapBad = 0, freeBad = 0, daysBad = 0, tests = 0;
const randMask = () => { const m = new Array(7).fill(0); for (let d = 1; d <= 6; d++) { const r = rnd(); m[d] = r < 0.25 ? 0 : r < 0.45 ? edge[Math.floor(rnd() * edge.length)] : (Math.floor(rnd() * 4294967296) & Math.floor(rnd() * 4294967296)) | 0; } return m; };
for (let k = 0; k < 20000; k++) {
  const mask = randMask(); tests++;
  const { info } = metrics(sel0, mask, ctx0);
  if (info.gapMin !== naiveGap(mask)) gapBad++;
  if (JSON.stringify(info.freeDays) !== JSON.stringify([1, 2, 3, 4, 5].filter((d) => mask[d] === 0))) freeBad++;
  if (daysUsed(mask) !== [1, 2, 3, 4, 5, 6].filter((d) => mask[d] !== 0).length) daysBad++;
}
CHECK('bits-05b', gapBad === 0, `metrics().gapMin == 30 * (empty slots between the lowest and highest occupied slot), summed over days 1-6, on ${tests} random/edge week masks incl. bit 31 and ~0 (mismatches=${gapBad})`);
CHECK('bits-05c', freeBad === 0 && daysBad === 0, `info.freeDays == days 1..5 with empty mask, daysUsed == days 1..6 with non-empty mask (mismatches ${freeBad}/${daysBad})`);

// ---- lateMask table -----------------------------------------------------------------------------------------------------------
const slotsOf = (m) => { const s = []; for (let k = 0; k < 32; k++) if ((m >>> k) & 1) s.push(k); return s; };
let lateBad = 0;
console.log('INFO bits-05d/e retired 2026-10-07: lateMask was removed in stage 4 (issue #4), hard limits are tested in real minutes');

// ---- meetingsMask outside the grid ----------------------------------------------------------------------------------------------
const m1 = (day, s, e) => meetingsMask([{ day, start: s, end: e }]);
const slotsDay = (mask, d) => slotsOf(mask[d]);
let clipBad = 0, nClip = 0;
for (let k = 0; k < 300000; k++) {   // random intervals anywhere in 05:00-24:00, compared with "slots of the grid that the interval touches"
  const s = 300 + Math.floor(rnd() * 1140), e = s + 1 + Math.floor(rnd() * 300); nClip++;
  const want = new Set(); for (let t = s; t < Math.min(e, 1440); t++) { const k2 = Math.floor((t - 420) / 30); if (k2 >= 0 && k2 < 32) want.add(k2); }
  if (slotsDay(m1(2, hhmm(s), hhmm(Math.min(e, 1439))), 2).join() !== [...want].sort((a, b) => a - b).join() && e <= 1439) clipBad++;
}
CHECK('bits-05f', clipBad === 0, `meetingsMask == "the grid slots the meeting touches" for ${nClip} random meetings 05:00-24:00 (so it CLIPS to 07:00-23:00); mismatches=${clipBad}`);
CHECK('bits-05g', slotsDay(m1(1, '06:00', '07:30'), 1).join() === '0' && slotsDay(m1(1, '22:30', '23:30'), 1).join() === '31' && (m1(1, '22:00', '22:50')[1] | 0) === (0xc0000000 | 0),
  'meetings that CROSS the edge are cut to the edge slot (06:00-07:30 -> slot 0, 22:30-23:30 -> slot 31); a real 22:00-22:50 lesson sets bits 30 and 31 (negative int32 0xc0000000)');
const vanish = [['06:00', '06:50'], ['23:00', '23:30'], ['23:10', '23:50'], ['00:30', '06:59']].map(([s, e]) => m1(1, s, e)[1] === 0);
BUG('bits-05h', vanish.every(Boolean), `meetings ENTIRELY outside 07:00-23:00 (06:00-06:50, 23:00-23:30, 23:10-23:50, 00:30-06:59) produce an EMPTY mask: dropped, not "clamped to the edge slots" as the comment at solver-core.js:10 and test name say`);

// synthetic end to end: two lessons that really overlap, both after 23:00
const mk = (specs) => { const data = { examsPublished: false, courses: {} };
  for (const [id, day, s, e, credits = 3] of specs) data.courses[id] = { name: id, credits, offered: true, prereqs: [], groups: [{ id: id + '1', type: 'סופי-הרצאה', primary: true, full: false, lecturer: '', linked: [], exams: [], meetings: [{ day, start: s, end: e, room: '' }] }] };
  return data; };
const run = (data, ids, extra = {}) => search({ data, courses: ids.map((id) => ({ id, mode: 'must' })), weights: { progress: 1, freeDays: 1 }, topK: 3, timeLimitMs: 2000, ...extra });
{
  const data = mk([['A', 2, '23:00', '23:30'], ['B', 2, '23:10', '23:50']]);
  const r = run(data, ['A', 'B']);
  BUG('bits-05i', r.results.length === 1 && r.results[0].courses.length === 2, `two must-courses both on Monday-ish day 2 at 23:00-23:30 and 23:10-23:50 (real overlap 20 min) -> search() returns ${r.results.length} schedule with ${r.results[0]?.courses.length} courses; day 2 is also reported free (freeDays=${JSON.stringify(r.results[0]?.breakdown.freeDays)} of 5 = all)`);
  const early = mk([['A', 2, '06:00', '06:50'], ['B', 2, '06:30', '06:55']]);
  const re = run(early, ['A', 'B']);
  BUG('bits-05j', re.results.length === 1 && re.results[0].courses.length === 2, `same before 07:00 (06:00-06:50 vs 06:30-06:55) -> ${re.results.length} schedule with both courses`);
}
// the scraper guard accepts that range
{
  const d = { semester: 'קיץ', year: 2027, lists: [], specializations: [], examsPublished: false, courses: { X: { name: 'X', credits: 3, offered: true, prereqs: [], groups: [
    { id: 'X1', type: 'סופי-הרצאה', primary: true, full: false, lecturer: 'L', linked: [], exams: [], meetings: [{ day: 2, start: '23:00', end: '23:30', room: 'r' }] }] } } };
  const v = validate(d);
  const hours = v.errors.filter((e) => /implausible hours/.test(e));
  BUG('bits-05k', hours.length === 0, `scripts/build.mjs:100 validate() accepts a meeting 23:00-23:30 (no "implausible hours" error; errors=${JSON.stringify(v.errors)}), yet the solver grid ends at 23:00 so such a lesson is invisible to every conflict check`);
  const d2 = structuredClone(d); d2.courses.X.groups[0].meetings[0] = { day: 2, start: '23:00', end: '23:50', room: 'r' };
  CHECK('bits-05l', validate(d2).errors.some((e) => /implausible hours/.test(e)), 'validate() does reject an end after 23:30 (23:00-23:50), so the guard window is 07:00-23:30, 30 minutes wider than the solver grid');
}

// ---- day edges --------------------------------------------------------------------------------------------------------------------
{
  const a7 = m1(7, '10:00', '10:50'), b7 = m1(7, '10:00', '10:50');
  CHECK('bits-05m', m1(0, '10:00', '10:50').every((v) => v === 0) && meetingsMask([{ day: null, start: '10:00', end: '10:50' }]).every((v) => v === 0) && meetingsMask([{ start: '10:00', end: '10:50' }]).every((v) => v === 0),
    'meetings with day 0 / null / undefined are skipped silently (empty mask); scripts/build.mjs:98-99 rejects a null day at scrape time, so published data cannot contain them');
  const fresh = new Array(7).fill(0);
  BUG('bits-05n', a7.length === 8 && overlaps(a7, b7) === true && overlaps(fresh, a7) === false && merge(fresh, a7).length === 7,
    `day 7: meetingsMask grows the array to length ${a7.length}; two day-7 masks conflict (${overlaps(a7, b7)}) but against the length-7 accumulator that search() starts from (solver-core.js:362) overlaps()=${overlaps(fresh, a7)} and merge() drops day 7 (length ${merge(fresh, a7).length}), so search() lets two day-7 lessons coexist`);
  const data = mk([['A', 7, '10:00', '10:50'], ['B', 7, '10:00', '10:50']]);
  const r = run(data, ['A', 'B']);
  BUG('bits-05o', r.results.length === 1 && r.results[0].courses.length === 2, `search() with two must-courses at the same hour on day 7 returns ${r.results.length} schedule containing both (UI altGroups uses length-8 masks and would call it a clash)`);
}

// ---- Friday (day 6) --------------------------------------------------------------------------------------------------------------
{
  const data = mk([['F', 6, '09:00', '09:50']]);
  const r = run(data, ['F']);
  CHECK('bits-05p', r.results[0].breakdown.freeDays === 1 && !/יום ו/.test(r.results[0].explanation), `a schedule whose only lesson is on Friday has breakdown.freeDays=${r.results[0].breakdown.freeDays} (5 of 5 "free" days): freeDays ranges over days 1..5 (solver-core.js:185, :311) and Friday is never listed`);
  const two = mk([['S', 1, '09:00', '09:50'], ['F', 6, '09:00', '09:50']]);
  const cap1 = run(two, ['S', 'F'], { constraints: { maxDays: 1 } }), cap2 = run(two, ['S', 'F'], { constraints: { maxDays: 2 } });
  CHECK('bits-05q', cap1.results.length === 0 && cap2.results.length === 1, `maxDays counts Friday as a campus day (solver-core.js:24 uses d>=1): Sunday+Friday lessons -> maxDays 1: ${cap1.results.length} results, maxDays 2: ${cap2.results.length}`);
  // default preferences: Friday is the preferred day off (app.js:15), weights freeDays 1 / timeWindow 1 (app.js:14)
  const alt = { examsPublished: false, courses: { C: { name: 'C', credits: 3, offered: true, prereqs: [], groups: [
    { id: 'C-sun', type: 'סופי-הרצאה', primary: true, full: false, lecturer: '', linked: [], exams: [], meetings: [{ day: 1, start: '08:00', end: '08:50', room: '' }] },
    { id: 'C-fri', type: 'סופי-הרצאה', primary: true, full: false, lecturer: '', linked: [], exams: [], meetings: [{ day: 6, start: '08:00', end: '08:50', room: '' }] }] } } };
  const dflt = search({ data: alt, courses: [{ id: 'C', mode: 'must' }], constraints: { dayOff: [6], dayOffHard: false, notBefore: '', notAfter: '20:00', windowHard: false }, weights: { friends: 3, progress: 3, freeDays: 1, compact: 1, timeWindow: 1, examSpread: 1 }, topK: 2, timeLimitMs: 1000 });
  console.log('Friday-vs-Sunday single lesson, DEFAULT weights and DEFAULT dayOff [6]: ' + dflt.results.map((x) => `${x.groups[0]} score=${x.score.toFixed(3)} freeDays=${x.breakdown.freeDays} timeWindow=${x.breakdown.timeWindow}`).join(' | '));
  BUG('bits-05r', dflt.results[0].groups[0] === 'C-fri', `with the default preferences (Friday = preferred day off, soft; weights freeDays 1, timeWindow 1) the solver ranks the FRIDAY group first (${dflt.results[0].groups[0]}): freeDays gains 0.2 for sparing Sunday, timeWindow loses only 0.1 for the 60 busy Friday minutes`);
  // soft day-off is only scored through timeWindow
  const swap = (order) => { const c = structuredClone(alt); c.courses.C.groups = order.map((id) => alt.courses.C.groups.find((g) => g.id === id)); return c; };
  const w0 = { friends: 0, progress: 1, freeDays: 1, compact: 1, timeWindow: 0 };
  const ra = search({ data: swap(['C-sun', 'C-fri']), courses: [{ id: 'C', mode: 'must' }], constraints: { dayOff: [1], dayOffHard: false }, weights: w0, topK: 2, timeLimitMs: 1000 });
  const rb = search({ data: swap(['C-fri', 'C-sun']), courses: [{ id: 'C', mode: 'must' }], constraints: { dayOff: [1], dayOffHard: false }, weights: w0, topK: 2, timeLimitMs: 1000 });
  console.log(`soft day-off Sunday (dayOff [1]) with timeWindow weight 0: order [sun,fri] -> ${ra.results.map((x) => x.groups[0] + '=' + x.score.toFixed(3)).join(', ')} ; order [fri,sun] -> ${rb.results.map((x) => x.groups[0] + '=' + x.score.toFixed(3)).join(', ')}`);
  CHECK('bits-05s', ra.results[0].groups[0] === 'C-fri' && rb.results[0].groups[0] === 'C-fri' && ra.results[0].score > ra.results[1].score, 'soft day-off Sunday with timeWindow weight 0: the result does not depend on group order; Friday wins through freeDays (Sunday counts as a used day, Friday never does), the soft day-off itself adds nothing (prefMask is read only through timeWindow, solver-core.js:199, :314). Earlier hypothesis "tie decided by order" refuted.');
  const hard = search({ data: alt, courses: [{ id: 'C', mode: 'must' }], constraints: { dayOff: [6], dayOffHard: true }, weights: w0, topK: 2, timeLimitMs: 1000 });
  CHECK('bits-05t', hard.results.length === 1 && hard.results[0].groups[0] === 'C-sun', 'HARD day-off Friday (dayOffHard true) removes the Friday group (forbiddenMask day 6 = ~0)');
}
process.exit(allOk ? 0 : 1);
