// year-probe2-combos.mjs - probe 2: how many seed searches would "one per combination of candidates" mean on real data?
// For every program file (2027-2 = B, 2027-1 = A) and every course that has קדם groups: product over groups (not all-outside) of the number of members offered in A.
// RUN: node solver-audit/plan-probes/year-probe2-combos.mjs
import fs from 'node:fs';
const root = new URL('../../web/data/afeka/', import.meta.url);
const files = fs.readdirSync(new URL('2027-2/', root)).filter((f) => /^\d+-\d{4}\.json$/.test(f));
const hist = {}; let courses = 0, outsideOnly = 0, mixed = 0, groupsMulti = 0, worst = null;
for (const f of files) {
  const A = JSON.parse(fs.readFileSync(new URL(`2027-1/${f}`, root), 'utf8')), B = JSON.parse(fs.readFileSync(new URL(`2027-2/${f}`, root), 'utf8'));
  for (const [id, c] of Object.entries(B.courses)) {
    const groups = c.prereqs.filter((p) => p.kind === 'קדם');
    if (!groups.length) continue;
    courses++;
    if (groups.some((p) => p.anyOf.every((x) => x.id === null))) outsideOnly++;
    if (groups.some((p) => p.anyOf.some((x) => x.id === null) && p.anyOf.some((x) => x.id !== null))) mixed++;
    const open = groups.filter((p) => !p.anyOf.every((x) => x.id === null)).map((p) => new Set(p.anyOf.filter((x) => x.id && A.courses[x.id]?.offered).map((x) => x.id)).size);
    if (open.some((n) => n > 1)) groupsMulti++;
    const prod = open.reduce((a, n) => a * Math.max(n, 1), 1);
    hist[prod] = (hist[prod] ?? 0) + 1;
    if (!worst || prod > worst.prod) worst = { f, id, prod, open };
  }
}
console.log(`course instances with a קדם group: ${courses}; with an all-outside group: ${outsideOnly} (211 courses carry such a prerequisite per audit, counted per file here); mixed groups (outside + real): ${mixed}; with a group of >1 A-offered alternatives: ${groupsMulti}`);
console.log('histogram of seed combinations per course (product of A-offered alternatives per open group):', JSON.stringify(hist));
console.log('worst:', JSON.stringify(worst));
