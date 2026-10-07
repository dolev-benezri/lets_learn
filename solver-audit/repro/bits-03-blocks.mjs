// bits-03-blocks.mjs
// What it checks: personal busy blocks (constraints.blocks, always hard) against real lessons.
//   forbiddenMask({blocks}) (web/solver-core.js:33-44) turns a block into slots with meetingsMask (floor start / ceil end, :11-20);
//   buildOptions drops every option whose mask hits it (:84). The block editor (web/ui-drawer.js:15-16, ui-actions.js:152-155 +
//   app.js:30-32 cleanBlocks) accepts ANY HH:MM start/end with 07:00 <= start < end <= 23:00, so minute-level blocks are reachable.
// Source lines targeted: web/solver-core.js:11-20, :33-44, :84, :364-372 (diagnose); web/app.js:30-32.
// Run: node solver-audit/repro/bits-03-blocks.mjs      (any cwd, ~15-30 s, deterministic)
// Reference: minute semantics. Block [bs,be) and lesson [ls,le) on the same day conflict iff bs < le && ls < be.
// Output: CHECK = behaviour that is correct; BUG = defect (REPRODUCED = the defect exists). Exit 0 iff all CHECK PASS and all BUG REPRODUCED.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { meetingsMask, forbiddenBy, overlaps, buildOptions, search, toMin } from '../../web/solver-core.js'; // 2026-10-07: forbiddenMask became forbiddenBy (stage 4)
import { cleanBlocks } from '../../web/app.js';

let allOk = true;
const CHECK = (id, ok, detail) => { console.log(`CHECK ${id} ${ok ? 'PASS' : 'FAIL'} ${detail}`); if (!ok) allOk = false; };
const BUG = (id, reproduced, detail) => { console.log(`BUG ${id} ${reproduced ? 'REPRODUCED' : 'NOT-REPRODUCED'} ${detail}`); if (!reproduced) allOk = false; };
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const root = fileURLToPath(new URL('../../web/data/afeka/', import.meta.url));
const SEMS = ['2027-1', '2027-2', '2027-3'];
const loadAll = () => SEMS.flatMap((s) => fs.readdirSync(path.join(root, s)).filter((x) => x.endsWith('.json')).sort()
  .map((f) => ({ s, f, d: JSON.parse(fs.readFileSync(path.join(root, s, f), 'utf8')) })));
const ceil30 = (m) => 420 + 30 * Math.ceil((m - 420) / 30);
const lessonMask = (ls, le) => meetingsMask([{ day: 1, start: hhmm(ls), end: hhmm(le) }]);

const files = loadAll();
const shapeSet = new Map();
for (const { d } of files) for (const c of Object.values(d.courses)) for (const g of c.groups) for (const m of g.meetings) shapeSet.set(m.start + '-' + m.end, [toMin(m.start), toMin(m.end)]);
const shapes = [...shapeSet.values()].map(([s, e]) => ({ s, e, mask: lessonMask(s, e) }));

// ---- (A) every block the UI can store x every real lesson shape -------------------------------------------------------
let blocks = 0, uiOK = 0, pairs = 0, falseC = 0, missed = 0, falseNotStartSide = 0, falseEndSide = 0;
const falseStartMinutes = new Set();
for (let bs = 420; bs <= 1379; bs++) for (let be = bs + 1; be <= 1380; be++) {
  blocks++;
  const blk = { day: 1, start: hhmm(bs), end: hhmm(be), label: '' };
  if (cleanBlocks([blk]).length === 1) uiOK++;
  const forb = forbiddenBy({ blocks: [blk] });                 // the real solver path for blocks
  for (const sh of shapes) {
    pairs++;
    const solver = forb({ day: 1, start: hhmm(sh.s), end: hhmm(sh.e) }), truth = bs < sh.e && sh.s < be;
    if (solver === truth) continue;
    if (truth) { missed++; continue; }
    falseC++;
    if (!(sh.e <= bs && bs < ceil30(sh.e))) falseNotStartSide++;       // predicate: block starts inside the half-hour cell where the lesson ends
    if (be <= sh.s) falseEndSide++;
    falseStartMinutes.add(hhmm(bs).slice(3));
  }
}
CHECK('bits-03a', uiOK === blocks, `all ${blocks} minute-level blocks (07:00<=start<end<=23:00) pass cleanBlocks, i.e. the UI/share link can produce every one (${uiOK}/${blocks})`);
CHECK('bits-03b', missed === 0, `no missed conflict: a block that really overlaps a real lesson is always forbidden (${pairs} block x lesson-shape pairs, missed=${missed})`);
CHECK('bits-03c', falseEndSide === 0, `the end side is exact: a block ending at or before a lesson start never conflicts (false conflicts on the end side=${falseEndSide}), because every real lesson starts on a slot boundary`);
CHECK('bits-03d', falseNotStartSide === 0, `every false conflict has the form "block starts in [lesson end, next :00/:30 boundary)" (violations of that form=${falseNotStartSide})`);
CHECK('bits-03e', [...falseStartMinutes].every((m) => m >= '50'), `false conflicts only occur for block start minutes ${[...falseStartMinutes].sort().join(',')} (all in :50-:59, the 10 minutes after a :50 lesson end)`);
BUG('bits-03f', falseC > 0, `block vs real lesson: ${falseC} false conflicts of ${pairs} pairs (a block that starts when a lesson ends, or up to 9 min later, is treated as overlapping it)`);

// ---- (B) real data: what a block starting at a lesson end does to real courses -----------------------------------------
// Aggregate: block "day d, HH:50-(HH+1):50" for every day Sun-Thu and HH 8..21, against every course of every file.
let optKilledSolver = 0, optKilledTruth = 0, coursesLost = 0, coursesWouldFit = 0, courseInstances = 0;
let example = null;
for (const { s, f, d } of files) {
  for (const [cid, c] of Object.entries(d.courses)) {
    const all = buildOptions(c);   // default: full groups excluded, exactly what search() uses
    if (!all.length) continue;
    courseInstances++;
    for (let day = 1; day <= 5; day++) for (let h = 8; h <= 21; h++) {
      const bs = h * 60 + 50, be = bs + 60, blk = { day, start: hhmm(bs), end: hhmm(be), label: '' };
      const forb = forbiddenBy({ blocks: [blk] });
      const bySolver = all.filter((o) => o.meetings.some(forb));                                                   // same test as buildOptions
      const byTruth = all.filter((o) => o.meetings.some((m) => m.day === day && bs < toMin(m.end) && toMin(m.start) < be));
      optKilledSolver += bySolver.length; optKilledTruth += byTruth.length;
      if (bySolver.length === all.length && byTruth.length < all.length) {
        coursesLost++;
        if (!example) example = { s, f, d, cid, blk, all: all.length, fits: all.length - byTruth.length };
      }
      if (byTruth.length < all.length) coursesWouldFit++;
    }
  }
}
console.log(`aggregate: ${courseInstances} course instances x 70 blocks (Sun-Thu x 14 start times HH:50, 1 h long); options killed by solver=${optKilledSolver}, by true minute overlap=${optKilledTruth}; (course,block) cases where the solver leaves the course NO option although a real option fits=${coursesLost}`);
BUG('bits-03g', optKilledSolver > optKilledTruth && coursesLost > 0, `real data: solver kills ${optKilledSolver - optKilledTruth} more options than minute truth (${optKilledSolver} vs ${optKilledTruth}); ${coursesLost} course/block cases lose every option although a fitting option exists`);

// ---- (C) end to end through search(): a "must" course disappears because of a block that starts when its lesson ends -----
if (example) {
  const { s, f, d, cid, blk } = example;
  const data = d;
  const run = (b) => search({ data, courses: [{ id: cid, mode: 'must' }], constraints: { blocks: [b] }, weights: { progress: 1 }, topK: 3, timeLimitMs: 2000 });
  const bad = run(blk);
  const shifted = run({ ...blk, start: hhmm(toMin(blk.start) + 10) });   // same block starting 10 minutes later (at the next :00)
  const lessonEnds = data.courses[cid].groups.flatMap((g) => g.meetings.filter((m) => m.day === blk.day).map((m) => m.end));
  console.log(`example: ${s}/${f} course ${cid} "${data.courses[cid].name}"; block day ${blk.day} ${blk.start}-${blk.end}; the course's lessons that day end at ${[...new Set(lessonEnds)].join(', ')}`);
  console.log(`  block ${blk.start}: results=${bad.results.length} diagnosis=${JSON.stringify(bad.diagnosis)}`);
  console.log(`  block ${hhmm(toMin(blk.start) + 10)} (10 min later): results=${shifted.results.length}`);
  BUG('bits-03h', bad.results.length === 0 && shifted.results.length > 0, `search() finds no schedule for a single must-course when the block starts at ${blk.start}, but finds ${shifted.results.length} when the same block starts at ${hhmm(toMin(blk.start) + 10)}; the lesson ends ${[...new Set(lessonEnds)].join('/')}, so the first block never overlaps it`);
} else BUG('bits-03h', false, 'no example course found in current data');

// ---- (D) sanity: blocks only act on their own day; busy blocks are hard even when windows are soft --------------------
const a = lessonMask(8 * 60, 9 * 60 + 50);
const fb = forbiddenBy({ blocks: [{ day: 2, start: '08:00', end: '09:00', label: '' }] });
CHECK('bits-03i', fb({ day: 2, start: '08:00', end: '09:50' }) && !fb({ day: 3, start: '08:00', end: '09:50' }) && a[1] !== 0,
  'a Monday 08:00-09:00 block forbids a Monday 08:00-09:50 lesson and not the same hours on Tuesday');
process.exit(allOk ? 0 : 1);
