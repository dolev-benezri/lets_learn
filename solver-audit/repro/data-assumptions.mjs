// WHAT: checks all 144 committed data files against the assumptions the solver code makes.
// TARGETS: web/solver-core.js:11-20 (meetingsMask: day 1..6, HH:MM), :54-102 (buildOptions: linked ids, primary),
//          web/app.js:134-141 (yearView: merges A+B groups, keeps A's course record), web/app.js:144-150 (semOfGroup: group id -> one semester),
//          web/rules.js:64-102 (classify: prereq ids in data.courses or null, kinds קדם/מקביל).
// RUN: node solver-audit/repro/data-assumptions.mjs
// OUTPUT: CHECK lines for assumptions that hold, BUG lines for ones that break (exit 0 = all as documented in findings.md).
import fs from 'node:fs';
import { buildOptions } from '../../web/solver-core.js';

const root = new URL('../../web/data/afeka/', import.meta.url);
const read = (p) => JSON.parse(fs.readFileSync(new URL(p, root), 'utf8'));
const files = ['2027-1', '2027-2', '2027-3'].flatMap((s) => fs.readdirSync(new URL(s + '/', root)).map((f) => `${s}/${f}`));
let ok = true;
const check = (id, pass, detail) => { ok &&= pass; console.log(`CHECK ${id} ${pass ? 'PASS' : 'FAIL'} ${detail}`); };
const bug = (id, rep, detail) => { ok &&= rep; console.log(`BUG ${id} ${rep ? 'REPRODUCED' : 'NOT-REPRODUCED'} ${detail}`); };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
let badMeet = 0, badLinked = 0, badPrereqId = 0, badKind = 0, dupGroup = 0, examCount = 0, published = 0, zeroOpt = [], primNoMeet = 0;
for (const f of files) {
  const d = read(f);
  if (d.examsPublished) published++;
  for (const [id, c] of Object.entries(d.courses)) {
    const ids = new Set(c.groups.map((g) => g.id));
    if (ids.size !== c.groups.length) dupGroup++;
    for (const g of c.groups) {
      examCount += g.exams.length;
      badLinked += g.linked.filter((l) => !ids.has(l)).length;
      if (g.primary && !g.meetings.length) primNoMeet++;
      for (const m of g.meetings) if (!(Number.isInteger(m.day) && m.day >= 1 && m.day <= 6 && HHMM.test(m.start) && HHMM.test(m.end) && m.start < m.end && m.start >= '07:00' && m.end <= '23:00')) badMeet++;
    }
    for (const p of c.prereqs) {
      if (!['קדם', 'מקביל'].includes(p.kind)) badKind++;
      for (const a of p.anyOf) if (a.id !== null && !d.courses[a.id]) badPrereqId++;
    }
    if (c.offered && !buildOptions(c, { includeFull: true }).length) zeroOpt.push(`${f}:${id}`);
  }
}
check('D-1', badMeet === 0, `meetings outside day 1..6 / HH:MM / start<end / 07:00-23:00: ${badMeet}`);
check('D-2', badLinked === 0, `linked ids that are not groups of the same course: ${badLinked}`);
check('D-3', dupGroup === 0, `courses with duplicate group ids: ${dupGroup}`);
check('D-4', badKind === 0 && badPrereqId === 0, `prereq kinds other than קדם/מקביל: ${badKind}; prereq ids missing from data.courses: ${badPrereqId}`);
check('D-5', primNoMeet === 0, `primary groups without meetings: ${primNoMeet}`);
check('D-6', zeroOpt.length === 0, `offered courses with zero options even with includeFull=true: ${zeroOpt.length} ${zeroOpt.slice(0, 5).join(' ')}`);
check('D-7', examCount === 0 && published === 0, `exam entries in all files: ${examCount}; files with examsPublished=true: ${published} (exam code paths are not exercised by real data)`);

// A/B group ids disjoint (yearView merges groups, semOfGroup maps each id to one semester)
let collide = 0, diffRecord = [];
for (const f of fs.readdirSync(new URL('2027-1/', root))) {
  if (!fs.existsSync(new URL(`2027-2/${f}`, root))) continue;
  const A = read(`2027-1/${f}`), B = read(`2027-2/${f}`);
  const ga = new Set(Object.values(A.courses).flatMap((c) => c.groups.map((g) => g.id)));
  collide += Object.values(B.courses).flatMap((c) => c.groups.map((g) => g.id)).filter((id) => ga.has(id)).length;
  for (const [id, a] of Object.entries(A.courses)) {
    const b = B.courses[id];
    if (b && (a.credits !== b.credits || JSON.stringify(a.prereqs) !== JSON.stringify(b.prereqs))) diffRecord.push(`${f}:${id}`);
  }
}
check('D-8', collide === 0, `group ids shared between 2027-1 and 2027-2 of the same program: ${collide}`);
check('D-9', diffRecord.length === 0, `course ids whose credits/prereqs differ between A and B (yearView would show A's record): ${diffRecord.length} ${diffRecord.slice(0, 3).join(' ')}`);

// prerequisites that name the course itself (permanently blocked)
const self = files.flatMap((f) => Object.entries(read(f).courses).filter(([id, c]) => c.prereqs.some((p) => p.kind === 'קדם' && p.anyOf.length === 1 && p.anyOf[0].id === id)).map(([id]) => `${f}:${id}`));
bug('D-10', self.length > 0, `course records whose only option of a קדם requirement is the course itself: ${self.length} (e.g. ${self.slice(0, 3).join(' ')})`);
process.exit(ok ? 0 : 1);
