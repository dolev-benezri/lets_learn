// Build the sandbox's data = committed data with ONLY the prereqs replaced by the fixed-parser rebuild (what the next nightly would write).
import fs from 'node:fs';
const here = new URL('./', import.meta.url);
let files = 0, courses = 0;
for (const s of ['2027-1', '2027-2', '2027-3']) for (const f of fs.readdirSync(new URL(`out-after/${s}/`, here))) {
  const target = new URL(`sandbox/web/data/afeka/${s}/${f}`, here);
  const d = JSON.parse(fs.readFileSync(target, 'utf8')), a = JSON.parse(fs.readFileSync(new URL(`out-after/${s}/${f}`, here), 'utf8'));
  for (const [id, c] of Object.entries(d.courses)) { c.prereqs = a.courses[id].prereqs; courses++; }
  fs.writeFileSync(target, JSON.stringify(d, null, 1)); files++;
}
console.log(`patched ${files} files, ${courses} course records (prereqs only) in sandbox/web/data/afeka`);
