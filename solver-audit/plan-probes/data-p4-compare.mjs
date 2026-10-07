// Probe 1/4: compare committed data, offline rebuild with the CURRENT parser (out-before) and with the FIXED parser (out-after).
// Run: node solver-audit/plan-probes/data-p4-compare.mjs   (after data-rebuild-offline.mjs for both out dirs)
import fs from 'node:fs';
import { validate, compareToPrevious } from './scripts-fixed/build.mjs';
const here = new URL('./', import.meta.url), committed = new URL('../../web/data/afeka/', import.meta.url);
const rd = (base, f) => JSON.parse(fs.readFileSync(new URL(f, base), 'utf8'));
const files = ['2027-1', '2027-2', '2027-3'].flatMap((s) => fs.readdirSync(new URL(`out-before/${s}/`, here)).map((f) => `${s}/${f}`));
const pc = (d) => Object.values(d.courses).reduce((a, c) => a + c.prereqs.length, 0);
const selfCount = (d) => Object.entries(d.courses).filter(([id, c]) => c.prereqs.some((p) => p.anyOf.some((a) => a.id === id))).length;
const stripPre = (d) => JSON.stringify(Object.entries(d.courses).map(([id, c]) => [id, c.prereqs]));
let sameCommittedPre = 0, diffCommittedPre = [], selfC = 0, selfB = 0, selfA = 0, changedFiles = 0, rowsDropped = 0, nonSelfDropped = 0;
let over20 = [], valErrs = [], softSummer = 0, dropsSelf = 0;
const nonSelfExamples = [];
for (const f of files) {
  const c = rd(committed, f), b = rd(here, `out-before/${f}`), a = rd(here, `out-after/${f}`);
  selfC += selfCount(c); selfB += selfCount(b); selfA += selfCount(a);
  if (stripPre(c) === stripPre(b)) sameCommittedPre++; else diffCommittedPre.push(f);
  if (stripPre(b) !== stripPre(a)) changedFiles++;
  for (const [id, cb] of Object.entries(b.courses)) {
    const ca = a.courses[id];
    const dropped = cb.prereqs.length - ca.prereqs.length;
    rowsDropped += dropped;
    for (const p of cb.prereqs) if (!ca.prereqs.some((q) => JSON.stringify(q) === JSON.stringify(p))) {
      if (p.anyOf.some((x) => x.id === id)) dropsSelf++;
      else { nonSelfDropped++; if (nonSelfExamples.length < 12) nonSelfExamples.push(`${f}:${id}->${JSON.stringify(p.anyOf)}`); }
    }
  }
  // the nightly guard: validate(next, prev=committed) incl. the 20% prerequisite-count rule
  const { errors } = validate(a, c, null, 1);
  const pe = errors.filter((e) => /prerequisite count/.test(e));
  if (pe.length) over20.push(`${f}: ${pe[0]}`);
}
console.log(`INFO files ${files.length}; committed prereqs == rebuild-from-cache prereqs (current parser): ${sameCommittedPre}/${files.length}${diffCommittedPre.length ? ' differ: ' + diffCommittedPre.slice(0, 5).join(',') : ''}`);
console.log(`INFO course records with a self-referencing prereq: committed ${selfC}, rebuild-before ${selfB}, rebuild-after ${selfA}`);
console.log(`INFO files whose prereqs change with the fix: ${changedFiles}; prereq rows dropped ${rowsDropped} (self ${dropsSelf}, non-self ${nonSelfDropped})`);
console.log(`INFO non-self rows dropped (exclusion stored as requirement): ${nonSelfExamples.join(' | ') || 'none'}`);
console.log(`INFO files where the 20% prerequisite-count guard would REFUSE the fixed data against the committed file: ${over20.length} ${over20.slice(0, 6).join(' | ')}`);
