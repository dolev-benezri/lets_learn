// Stage 8: does a course taught only in summer keep its credits in the א/ב files (progress() and gradeAverage() read credits from there)?
// RUN: node solver-audit/plan-probes/summer-credits.mjs
import fs from 'node:fs';
const dir = new URL('../../web/data/afeka/', import.meta.url);
const load = (s, f) => { try { return JSON.parse(fs.readFileSync(new URL(`${s}/${f}`, dir), 'utf8')); } catch { return null; } };
let summerOnly = 0, zeroInA = 0, missingInA = 0, inLists = 0, zeroInListed = 0;
const ex = [];
for (const f of fs.readdirSync(new URL('2027-3/', dir)).filter((x) => x.endsWith('.json'))) {
  const S = load('2027-3', f), A = load('2027-1', f), B = load('2027-2', f);
  if (!A) continue;
  for (const [id, c] of Object.entries(S.courses)) {
    if (!c.offered || A.courses[id]?.offered || B?.courses[id]?.offered) continue;
    summerOnly++;
    const listed = A.lists.some((l) => l.courses.includes(id));
    if (listed) inLists++;
    if (!A.courses[id]) { missingInA++; if (listed && ex.length < 5) ex.push(`${f} ${id} missing in א, listed`); continue; }
    if (!(A.courses[id].credits > 0)) { zeroInA++; if (listed) { zeroInListed++; if (ex.length < 5) ex.push(`${f} ${id} "${c.name}" credits א=${A.courses[id].credits} קיץ=${c.credits}`); } }
  }
}
console.log(`summer-only course records: ${summerOnly} (in an א list: ${inLists}); missing in the א file: ${missingInA}; 0 credits in the א file: ${zeroInA} (listed: ${zeroInListed})`);
console.log(`${zeroInListed + ex.filter((e) => e.includes('missing')).length ? 'BUG' : 'CHECK'} SUMMER-CREDITS ${ex.join(' ; ')}`);
