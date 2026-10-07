// search-negative-duration.mjs
// WHAT: root cause of the two disagreements seen while building the harness (prune:true lost a better plan). When a meeting has
//       end < start (negative minutes), the friends term of bound() stops being an upper bound, branch-and-bound cuts a subtree
//       that holds the optimum, and search() with prune:true returns a worse top-K than prune:false (== exhaustive reference).
// TARGETS: web/solver-core.js:85 (minutes = sum of end-start), 86-90 (sharedMin), 290-307 (friendsUp: proof assumes shared <= total minutes),
//          348 (the prune test). Data guard: scripts/parse.mjs:62 only requires c[2] !== c[3] (start != end), not start < end.
// RUN:   node solver-audit/repro/search-negative-duration.mjs
// OUTPUT: SN-1 committed data never has end <= start (so the defect is not reachable today); SN-2 prune:false equals the reference on the
//         malformed instance; BUG SN-3 minimal 3-course instance: prune:true scores 5.238 vs 5.5; BUG SN-4 same on the generator seed 408
//         (first-generation generator with malformed:true) with the reference as arbiter.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { search } from '../../web/solver-core.js';
import { mulberry32, genInstance, referenceSolve, compareTopK, tagResults, realFiles, loadReal, mm, Report } from './search-lib.mjs';

const R = new Report();
let bad = 0, total = 0;
for (const sem of ['2027-1', '2027-2', '2027-3']) for (const f of realFiles(sem)) for (const c of Object.values(loadReal(sem, f).courses)) for (const g of c.groups) for (const m of g.meetings) { total++; if (mm(m.end) <= mm(m.start)) bad++; }
R.check('SN-1 committed data has no meeting with end <= start', bad === 0, `${total} meetings scanned in 144 files, ${bad} malformed`);

const grp = (id, day, start, end) => ({ id, type: 'הרצאה', primary: true, lecturer: 'L' + id, full: false, semester: 'א', linked: [], meetings: [{ day, start, end, room: 'r' }], exams: [] });
const course = (id, groups) => ({ name: id, credits: 3, offered: true, prereqs: [], groups });
const data = { semester: 'א', year: 2027, startYear: 2026, examsPublished: false, courses: {
  C0: course('C0', [grp('G0', 2, '11:00', '12:50')]),
  C1: course('C1', [grp('G1', 1, '11:00', '10:50'), grp('G2', 2, '09:00', '10:50')]), // G1: end before start = -10 minutes
  C2: course('C2', [grp('G3', 1, '10:00', '11:50')]) } };
const base = { data, courses: [{ id: 'C0', mode: 'optional' }, { id: 'C1', mode: 'must' }, { id: 'C2', mode: 'must' }], friends: [{ name: 'F', groups: ['G0', 'G2', 'G3'], weight: 1, active: true }],
  weights: { friends: 5, progress: 0, freeDays: 0, compact: 0, timeWindow: 0, examSpread: 0 }, constraints: {}, topK: 1, timeLimitMs: 1e9 };
const a = search({ ...base, prune: true }), b = search({ ...base, prune: false });
const ref = referenceSolve(base);
R.check('SN-2 prune:false equals the exhaustive reference on the malformed instance', compareTopK(tagResults(b.results, data), ref, 1).length === 0, `prune:false score ${b.results[0].score}, reference ${ref.sols[0].score}`);
R.bug('SN-3 minimal malformed instance: prune:true loses the optimum', Math.abs(a.results[0].score - b.results[0].score) > 1e-9, `prune:true ${a.results[0].score} vs prune:false ${b.results[0].score} (plans ${a.results[0].groups} vs ${b.results[0].groups})`);

const inst = genInstance(mulberry32(408 * 7919), { malformed: true });
const out = search({ ...inst, timeLimitMs: 1e9 });
const problems = compareTopK(tagResults(out.results, inst.data), referenceSolve(inst), inst.topK);
const ok = compareTopK(tagResults(search({ ...inst, timeLimitMs: 1e9, prune: false }).results, inst.data), referenceSolve(inst), inst.topK);
R.bug('SN-4 generator seed 408 (malformed:true): search() with prune differs from the reference', problems.length > 0 && ok.length === 0, `prune:true -> ${problems.join('; ')} ; prune:false -> ${ok.length ? ok.join('; ') : 'identical to reference'}`);
const guard = fs.readFileSync(fileURLToPath(new URL('../../scripts/parse.mjs', import.meta.url)), 'utf8').split('\n')[61];
R.info(`scripts/parse.mjs:62 = ${guard.trim()}`);
R.done();
