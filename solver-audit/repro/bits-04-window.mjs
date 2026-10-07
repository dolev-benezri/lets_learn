// bits-04-window.mjs
// What it checks: the time window preference/constraint (constraints.notBefore / notAfter, soft = prefMask -> timeWindow,
//   hard = windowHard -> forbiddenMask) for every value the UI can produce (<input type="time">: any HH:MM 00:00-23:59, see
//   web/ui-drawer.js:38-39, web/ui-actions.js:229-231 time(), web/app.js:36-37 HHMM) against every REAL lesson shape.
// Source lines targeted: web/solver-core.js:28-31 (lateMask), :33-44 (forbiddenMask windowHard), :265-273 (prefMask),
//   :197-200 + :310-313 (outside minutes = 30 * popcount(mask & prefMask)), :84 (hard filter in buildOptions).
// Run: node solver-audit/repro/bits-04-window.mjs      (any cwd; ~20-60 s; deterministic)
// Reference (minutes): a lesson [s,e) violates notBefore T iff s < T, and notAfter T iff e > T. Its minutes outside the window are
//   max(0, min(e,T)-s) (before T) and max(0, e-max(s,T)) (after T).
// How the soft path is measured WITHOUT touching solver internals: search() on a synthetic one-lesson course with weights
//   {timeWindow:1}: outsideMinutes = (1 - breakdown.timeWindow) * 600 (metrics(), solver-core.js:214-215, valid below 600).
// Output: CHECK = correct behaviour, BUG = defect (REPRODUCED = exists). Exit 0 iff all CHECK PASS and all BUG REPRODUCED.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { forbiddenBy, meetingsMask, overlaps, buildOptions, search, toMin } from '../../web/solver-core.js'; // 2026-10-07: forbiddenMask became forbiddenBy (stage 4)
import { normalize } from '../../web/app.js';

let allOk = true;
const CHECK = (id, ok, detail) => { console.log(`CHECK ${id} ${ok ? 'PASS' : 'FAIL'} ${detail}`); if (!ok) allOk = false; };
const BUG = (id, reproduced, detail) => { console.log(`BUG ${id} ${reproduced ? 'REPRODUCED' : 'NOT-REPRODUCED'} ${detail}`); if (!reproduced) allOk = false; };
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const root = fileURLToPath(new URL('../../web/data/afeka/', import.meta.url));

// ---- real lesson shapes ---------------------------------------------------------------------------------------------------
const shapeSet = new Map();
for (const s of ['2027-1', '2027-2', '2027-3']) for (const f of fs.readdirSync(path.join(root, s)).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync(path.join(root, s, f), 'utf8'));
  for (const c of Object.values(d.courses)) for (const g of c.groups) for (const m of g.meetings) shapeSet.set(m.start + '-' + m.end, [toMin(m.start), toMin(m.end)]);
}
const shapes = [...shapeSet.values()].map(([s, e]) => ({ s, e, key: hhmm(s) + '-' + hhmm(e) })).sort((a, b) => a.s - b.s || a.e - b.e);
// One synthetic dataset, one course per shape, one group, one lesson on day 1 (Sunday).
const data = { examsPublished: false, courses: {} };
for (const [i, sh] of shapes.entries()) data.courses['S' + i] = { name: 'S' + i, credits: 3, offered: true, prereqs: [], groups: [
  { id: 'g' + i, type: 'סופי-הרצאה', primary: true, full: false, lecturer: '', linked: [], exams: [], meetings: [{ day: 1, start: hhmm(sh.s), end: hhmm(sh.e), room: '' }] }] };
const soft = (i, c) => Math.round((1 - search({ data, courses: [{ id: 'S' + i, mode: 'must' }], constraints: c, weights: { timeWindow: 1 }, topK: 1, timeLimitMs: 1000 }).results[0].breakdown.timeWindow) * 600);
const hardHit = (sh, c) => forbiddenBy({ windowHard: true, ...c })({ day: 1, start: hhmm(sh.s), end: hhmm(sh.e) });
const lessonMask = (sh) => meetingsMask([{ day: 1, start: hhmm(sh.s), end: hhmm(sh.e) }]);
const cellIdx = (m) => Math.ceil((m - 420) / 30);

const t0 = Date.now();
const res = { nb: { fp: 0, fn: 0, softHardDiff: 0, pairs: 0, err: {} }, na: { fp: 0, fn: 0, softHardDiff: 0, pairs: 0, err: {}, fnNotSameCell: 0 } };
const fnRanges = {};            // shape key -> list of T (minutes) where a lesson ending after notAfter is NOT flagged
for (const [i, sh] of shapes.entries()) {
  const lm = lessonMask(sh);
  for (let T = 0; T < 1440; T++) {
    // ---- notBefore T
    {
      const r = res.nb; r.pairs++;
      const hard = hardHit(sh, { notBefore: hhmm(T) }), truthViol = sh.s < T;
      if (hard && !truthViol) r.fp++; if (!hard && truthViol) r.fn++;
      const outside = soft(i, { notBefore: hhmm(T) }), truthOut = Math.max(0, Math.min(sh.e, T) - sh.s);
      if ((outside > 0) !== hard) r.softHardDiff++;
      r.err[outside - truthOut] = (r.err[outside - truthOut] ?? 0) + 1;
    }
    // ---- notAfter T
    {
      const r = res.na; r.pairs++;
      const hard = hardHit(sh, { notAfter: hhmm(T) }), truthViol = sh.e > T;
      if (hard && !truthViol) r.fp++;
      if (!hard && truthViol) { r.fn++; (fnRanges[sh.key] ??= []).push(T); if (!(cellIdx(sh.e) === cellIdx(T))) r.fnNotSameCell++; }
      const outside = soft(i, { notAfter: hhmm(T) }), truthOut = Math.max(0, sh.e - Math.max(sh.s, T));
      if ((outside > 0) !== hard) r.softHardDiff++;
      r.err[outside - truthOut] = (r.err[outside - truthOut] ?? 0) + 1;
    }
  }
}
console.log(`${shapes.length} real lesson shapes x 1440 limit values x (notBefore, notAfter) x (hard via forbiddenMask, soft via search) in ${((Date.now() - t0) / 1000).toFixed(1)} s (wall clock, informational)`);
const ranges = (ts) => { const out = []; let a = null, p = null; for (const t of ts) { if (a === null) a = p = t; else if (t === p + 1) p = t; else { out.push(hhmm(a) + '-' + hhmm(p)); a = p = t; } } if (a !== null) out.push(hhmm(a) + '-' + hhmm(p)); return out.join(','); };
const show = (k, v) => `${k}: ${JSON.stringify(Object.fromEntries(Object.entries(v).sort((a, b) => a[0] - b[0])))}`;

// ---- notBefore -------------------------------------------------------------------------------------------------------------
CHECK('bits-04a', res.nb.fp === 0 && res.nb.fn === 0, `hard notBefore == (start < T) for every real shape and every T 00:00-23:59 (${res.nb.pairs} pairs; wrongly forbidden=${res.nb.fp}, wrongly allowed=${res.nb.fn}); a lesson starting exactly at T is allowed`);
CHECK('bits-04b', res.nb.softHardDiff === 0, `soft notBefore flags a lesson (outside>0) exactly when the hard one forbids it (differences=${res.nb.softHardDiff})`);
// ---- notAfter hard ---------------------------------------------------------------------------------------------------------
CHECK('bits-04c', res.na.fp === 0, `hard notAfter never forbids a lesson that ends at or before T (wrongly forbidden=${res.na.fp} of ${res.na.pairs})`);
CHECK('bits-04d', res.na.fnNotSameCell === 0, `every wrongly allowed lesson (end > T) has its end in the same half-hour cell as T: ceil((end-07:00)/30) == ceil((T-07:00)/30) (exceptions=${res.na.fnNotSameCell})`);
CHECK('bits-04e', res.na.softHardDiff === 0, `soft notAfter flags a lesson exactly when the hard one forbids it (differences=${res.na.softHardDiff})`);
const fnShapes = Object.keys(fnRanges);
const sample = ['08:00-08:50', '17:00-17:50', '20:00-20:50', '22:00-22:50'].filter((k) => fnRanges[k]).map((k) => `lesson ${k} ends after notAfter but is NOT flagged for notAfter in ${ranges(fnRanges[k])}`);
console.log(sample.join('\n'));
BUG('bits-04f', res.na.fn > 0, `notAfter: ${res.na.fn} (real shape, T) pairs where the lesson ends AFTER the limit but lateMask() does not flag it (${fnShapes.length} of ${shapes.length} shapes affected; for a :50 end the unflagged limits are HH:31-HH:49)`);
// ---- soft minutes ----------------------------------------------------------------------------------------------------------
console.log(show('notBefore soft error histogram (solver outside minutes - true outside minutes)', res.nb.err));
console.log(show('notAfter  soft error histogram (solver outside minutes - true outside minutes)', res.na.err));
const exactDefault = soft(shapes.findIndex((x) => x.key === '20:00-20:50'), { notAfter: '20:00' });
BUG('bits-04g', exactDefault === 60, `DEFAULT notAfter 20:00: a lesson 20:00-20:50 (50 real minutes outside) is counted as ${exactDefault} outside minutes (two whole 30-min slots)`);
const over = Object.entries(res.na.err).filter(([k]) => +k > 0).reduce((a, [, v]) => a + v, 0), under = Object.entries(res.na.err).filter(([k]) => +k < 0).reduce((a, [, v]) => a + v, 0);
BUG('bits-04h', over > 0 && under > 0, `soft outside minutes are wrong in BOTH directions for notAfter: overcounted in ${over} pairs, undercounted in ${under} pairs (of ${res.na.pairs})`);
const boundaryOK = [['19:00-19:50', '20:00'], ['20:00-20:50', '20:50'], ['21:00-21:50', '21:50']].every(([k, T]) => soft(shapes.findIndex((x) => x.key === k), { notAfter: T }) === 0);
CHECK('bits-04i', boundaryOK, 'a lesson that ends exactly at notAfter (19:00-19:50 vs 20:00, 20:00-20:50 vs 20:50, 21:00-21:50 vs 21:50) counts as 0 outside minutes');

// ---- UI-reachable values called out in the task ------------------------------------------------------------------------
const flagged = (lessonStart, lessonEnd, c) => forbiddenBy({ windowHard: true, ...c })({ day: 1, start: lessonStart, end: lessonEnd });
const rows = [
  ['notBefore 08:15, lesson 08:00-08:50', flagged('08:00', '08:50', { notBefore: '08:15' }), true],
  ['notBefore 08:20, lesson 09:00-09:50', flagged('09:00', '09:50', { notBefore: '08:20' }), false],
  ['notBefore 08:45, lesson 08:00-08:50', flagged('08:00', '08:50', { notBefore: '08:45' }), true],
  ['notBefore 08:45, lesson 09:00-09:50', flagged('09:00', '09:50', { notBefore: '08:45' }), false],
  ['notBefore 09:00, lesson 09:00-09:50 (starts exactly at T)', flagged('09:00', '09:50', { notBefore: '09:00' }), false],
  ['notAfter 20:15, lesson 20:00-20:50 (ends after T)', flagged('20:00', '20:50', { notAfter: '20:15' }), true],
  ['notAfter 20:50, lesson 20:00-20:50 (ends exactly at T)', flagged('20:00', '20:50', { notAfter: '20:50' }), false],
  ['notAfter 20:00, lesson 19:00-19:50', flagged('19:00', '19:50', { notAfter: '20:00' }), false],
  ['notAfter 20:45, lesson 20:00-20:50 (5 min after T)', flagged('20:00', '20:50', { notAfter: '20:45' }), true],
  ['notAfter 17:45, lesson 17:00-17:50 (5 min after T)', flagged('17:00', '17:50', { notAfter: '17:45' }), true],
];
for (const [ri, [what, got, want]] of rows.entries()) {
  const isBug = want && !got;
  console.log(`${isBug ? 'BUG ' : 'CHECK'} bits-04j${ri + 1} ${isBug ? 'REPRODUCED' : got === want ? 'PASS' : 'FAIL'} ${what}: solver says ${got ? 'forbidden/outside' : 'allowed/inside'}, truth ${want ? 'violates' : 'fine'}`);
  if (!isBug && got !== want) allOk = false;
}
// the two BUG rows above are *expected* to reproduce; they count as REPRODUCED only when got===false while want===true.
// (rows where got===want are CHECK PASS; there is no row where the solver forbids a fine lesson.)

// ---- end to end: a HARD notAfter that the solver silently breaks, on real data ----------------------------------------------
{
  const f = path.join(root, '2027-1', '30-2026.json'), d = JSON.parse(fs.readFileSync(f, 'utf8'));
  let pick = null;
  for (const [cid, c] of Object.entries(d.courses)) {
    for (const o of buildOptions(c)) {
      const ends = o.meetings.map((m) => toMin(m.end));
      if (Math.max(...ends) === toMin('17:50') && ends.some((x) => x > toMin('17:45'))) { pick = { cid, o }; break; }
    }
    if (pick) break;
  }
  const run = (na) => search({ data: d, courses: [{ id: pick.cid, mode: 'must' }], pins: pick.o.groups, constraints: { windowHard: true, notAfter: na }, weights: { timeWindow: 1 }, topK: 1, timeLimitMs: 2000 });
  const r45 = run('17:45'), r30 = run('17:30'), r50 = run('17:50');
  const lastEnd = (r) => r.results[0] ? Math.max(...r.results[0].groups.flatMap((g) => d.courses[pick.cid].groups.find((x) => x.id === g)?.meetings.map((m) => toMin(m.end)) ?? [])) : null;
  console.log(`end-to-end (2027-1/30-2026.json, course ${pick.cid} "${d.courses[pick.cid].name}", groups ${pick.o.groups.join('+')}, latest lesson ends ${hhmm(Math.max(...pick.o.meetings.map((m) => toMin(m.end))))}):`);
  console.log(`  windowHard + notAfter 17:30 -> results=${r30.results.length}; notAfter 17:45 -> results=${r45.results.length} (latest end ${r45.results[0] ? hhmm(lastEnd(r45)) : '-'}); notAfter 17:50 -> results=${r50.results.length}`);
  CHECK('bits-04k', r30.results.length === 0 && r50.results.length === 1, 'hard notAfter 17:30 forbids the 17:50 lesson, hard notAfter 17:50 allows it (aligned limits behave)');
  BUG('bits-04l', r45.results.length === 1 && lastEnd(r45) > toMin('17:45'), 'HARD notAfter 17:45 (UI text: "a system that violates this will not be shown") returns a schedule whose lesson ends 17:50');
  const n = normalize({ v: 1, constraints: { windowHard: true, notAfter: '17:45' } });
  CHECK('bits-04m', n.constraints.notAfter === '17:45' && n.constraints.windowHard === true, 'normalize() (app.js:36-37, the gate for saved state and share links) keeps notAfter 17:45 and windowHard true, so the value reaches search() unchanged');
}
process.exit(allOk ? 0 : 1);
