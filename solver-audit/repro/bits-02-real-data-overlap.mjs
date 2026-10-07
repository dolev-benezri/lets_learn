// bits-02-real-data-overlap.mjs
// What it checks, on ALL 144 real data files (web/data/afeka/{2027-1,2027-2,2027-3}/*.json):
//   (a) for every pair of groups of two DIFFERENT courses of the same file (= every pair the solver can put in one schedule),
//       overlaps(meetingsMask(g1.meetings), meetingsMask(g2.meetings)) equals the true minute overlap;
//   (b) the same on the reduced set "all pairs of distinct (start,end) lesson shapes" (why (a) can only differ on shapes);
//   (c) every course OPTION (primary + linked groups, buildOptions) against every option of every other course (sampled files);
//   (d) INSIDE one option: buildOptions ORs the masks of the primary and its linked groups (solver-core.js:79-84) and never
//       calls overlaps() between them. Count real options whose own lessons overlap in real minutes.
// Source lines targeted: web/solver-core.js:11-22 (meetingsMask/overlaps), :54-102 (buildOptions mask = OR of group meetings).
// Run: node solver-audit/repro/bits-02-real-data-overlap.mjs   (any cwd; ~20-60 s; deterministic; wall-clock only printed)
// Reference is independent of the solver: per day a BigInt with bit m set for every busy minute m in [start,end).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { meetingsMask, overlaps, buildOptions, toMin } from '../../web/solver-core.js';

let allOk = true;
const CHECK = (id, ok, detail) => { console.log(`CHECK ${id} ${ok ? 'PASS' : 'FAIL'} ${detail}`); if (!ok) allOk = false; };
const BUG = (id, reproduced, detail) => { console.log(`BUG ${id} ${reproduced ? 'REPRODUCED' : 'NOT-REPRODUCED'} ${detail}`); if (!reproduced) allOk = false; };
const t0 = Date.now();
const root = fileURLToPath(new URL('../../web/data/afeka/', import.meta.url));
const files = [];
for (const s of ['2027-1', '2027-2', '2027-3']) for (const f of fs.readdirSync(path.join(root, s)).filter((x) => x.endsWith('.json')).sort()) files.push([s, f]);

const minuteSets = (meetings) => {                     // day -> BigInt of busy minutes
  const out = new Array(7).fill(0n);
  for (const m of meetings) { const s = toMin(m.start), e = toMin(m.end); out[m.day] |= ((1n << BigInt(e - s)) - 1n) << BigInt(s); }
  return out;
};
const minutesOverlap = (a, b) => a.some((v, d) => (v & b[d]) !== 0n);
const popBig = (v) => { let c = 0; for (; v; v >>= 1n) c += Number(v & 1n); return c; };

let filesDone = 0, groupPairs = 0, groupFalse = 0, groupMissed = 0;
let optPairs = 0, optFalse = 0, optMissed = 0, optFiles = 0;
let optionsTotal = 0, optionsInternalOverlap = 0, groupsInternalOverlap = 0;
const internalExamples = [];
const shapes = new Map();     // "start-end" -> {start, end}
for (const [sem, f] of files) {
  const d = JSON.parse(fs.readFileSync(path.join(root, sem, f), 'utf8'));
  const cids = Object.keys(d.courses);
  const G = [];                                  // every group: {cid, mask, mins}
  for (const cid of cids) for (const g of d.courses[cid].groups) {
    for (const m of g.meetings) { const k = m.start + '-' + m.end; if (!shapes.has(k)) shapes.set(k, { start: m.start, end: m.end }); }
    const mins = minuteSets(g.meetings);
    // a single group whose own meetings overlap each other (summed duration != union of busy minutes)
    const sum = g.meetings.reduce((a, m) => a + toMin(m.end) - toMin(m.start), 0);
    if (sum !== mins.reduce((a, v) => a + popBig(v), 0)) { groupsInternalOverlap++; if (internalExamples.length < 5) internalExamples.push(`${sem}/${f} group ${g.id}`); }
    G.push({ cid, mask: meetingsMask(g.meetings), mins });
  }
  for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++) {
    if (G[i].cid === G[j].cid) continue;
    groupPairs++;
    const slot = overlaps(G[i].mask, G[j].mask), truth = minutesOverlap(G[i].mins, G[j].mins);
    if (slot && !truth) groupFalse++; else if (!slot && truth) groupMissed++;
  }
  // (d) options inside one course: ORed masks, real overlaps between the option's own groups
  const opts = [];
  for (const cid of cids) {
    const byId = new Map(d.courses[cid].groups.map((g) => [g.id, g]));
    for (const o of buildOptions(d.courses[cid], { includeFull: true })) {
      optionsTotal++;
      const own = o.groups.map((id) => minuteSets(byId.get(id).meetings));
      let internal = false;
      for (let a = 0; a < own.length; a++) for (let b = a + 1; b < own.length; b++) if (minutesOverlap(own[a], own[b])) internal = true;
      if (internal) { optionsInternalOverlap++; if (internalExamples.length < 10) internalExamples.push(`${sem}/${f} course ${cid} option ${o.groups.join('+')}`); }
      opts.push({ cid, mask: o.mask, mins: minuteSets(o.groups.flatMap((id) => byId.get(id).meetings)) });
    }
  }
  if (filesDone % 6 === 0) {   // option-vs-option on every 6th file (deterministic sample; all three semester folders are hit)
    optFiles++;
    for (let i = 0; i < opts.length; i++) for (let j = i + 1; j < opts.length; j++) {
      if (opts[i].cid === opts[j].cid) continue;
      optPairs++;
      const slot = overlaps(opts[i].mask, opts[j].mask), truth = minutesOverlap(opts[i].mins, opts[j].mins);
      if (slot && !truth) optFalse++; else if (!slot && truth) optMissed++;
    }
  }
  filesDone++;
}
console.log(`files=${filesDone}; group pairs of different courses=${groupPairs}; distinct lesson shapes (start,end)=${shapes.size}; option-pair files=${optFiles}, option pairs=${optPairs}; options built=${optionsTotal} (wall ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
CHECK('bits-02a', groupPairs > 1e6 && groupFalse === 0 && groupMissed === 0, `all ${groupPairs} cross-course group pairs: slot overlap == minute overlap (false conflicts=${groupFalse}, missed=${groupMissed})`);

// (b) shapes: all pairs of distinct (start,end) on one day
const S = [...shapes.values()]; let shapePairs = 0, shapeBad = 0;
for (let i = 0; i < S.length; i++) for (let j = i; j < S.length; j++) {
  shapePairs++;
  const a = [{ day: 1, start: S[i].start, end: S[i].end }], b = [{ day: 1, start: S[j].start, end: S[j].end }];
  if (overlaps(meetingsMask(a), meetingsMask(b)) !== minutesOverlap(minuteSets(a), minuteSets(b))) shapeBad++;
}
CHECK('bits-02b', shapeBad === 0, `${S.length} distinct real lesson shapes: all ${shapePairs} pairs (incl. self) agree with minute overlap (disagreements=${shapeBad}); every start is :00 and a :50 end never shares a slot with a :00 start`);
CHECK('bits-02c', optPairs > 1e5 && optFalse === 0 && optMissed === 0, `${optPairs} option-vs-option pairs of different courses in ${optFiles} sampled files: slot overlap == minute overlap (false=${optFalse}, missed=${optMissed})`);

// (d) internal overlap
console.log(`options with two of their own groups overlapping in real minutes: ${optionsInternalOverlap} of ${optionsTotal}; single groups whose own meetings overlap: ${groupsInternalOverlap}; examples: ${internalExamples.join(' | ') || 'none'}`);
CHECK("bits-02e", optionsInternalOverlap === 0 && groupsInternalOverlap === 0, `no real option has two of its own lessons overlapping and no group has self-overlapping meetings (options=${optionsInternalOverlap}/${optionsTotal}, groups=${groupsInternalOverlap})`);

// Synthetic: nothing in the solver or the scraper rejects a lecture and its linked tutorial that run at the same time.
const syn = { examsPublished: false, courses: { X: { name: 'X', credits: 3, offered: true, prereqs: [], groups: [
  { id: 'X1', type: 'סופי-הרצאה+תרגול', primary: true, full: false, lecturer: 'L', linked: ['X1/1'], exams: [], meetings: [{ day: 1, start: '10:00', end: '11:50', room: 'r' }] },
  { id: 'X1/1', type: 'תרגול', primary: false, full: false, lecturer: 'L', linked: [], exams: [], meetings: [{ day: 1, start: '11:00', end: '12:50', room: 'r' }] } ] } } };
const synOpts = buildOptions(syn.courses.X);
const own = synOpts[0] ? synOpts[0].meetings.map((m) => minuteSets([m])) : [];
BUG("bits-02f", synOpts.length === 1 && own.length === 2 && minutesOverlap(own[0], own[1]), `synthetic lecture 10:00-11:50 + linked tutorial 11:00-12:50 same day -> buildOptions returns ${synOpts.length} option, its two lessons really overlap, nothing flags it`);
process.exit(allOk ? 0 : 1);
