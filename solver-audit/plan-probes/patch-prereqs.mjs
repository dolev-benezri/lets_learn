// Stage 2: copy ONLY `prereqs` from the offline rebuild (out-fixed/) into the committed web/data/afeka files, then validate them.
// RUN: node solver-audit/plan-probes/patch-prereqs.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const { validate } = await import(pathToFileURL(path.join(root, 'scripts/build.mjs')).href);
const dry = process.argv.includes('--dry');
const count = (d, ids) => ids.reduce((a, id) => a + d.courses[id].prereqs.length, 0);
let files = 0, changed = 0, missing = 0, worst = 0, selfRefs = 0, nulls = 0, errs = 0;
for (const s of ['2027-1', '2027-2', '2027-3']) for (const f of fs.readdirSync(path.join(here, 'out-fixed', s)).filter((x) => x.endsWith('.json'))) {
  const target = path.join(root, 'web/data/afeka', s, f);
  if (!fs.existsSync(target)) { console.log(`no committed file ${s}/${f}`); continue; }
  const before = fs.readFileSync(target, 'utf8');
  const d = JSON.parse(before), a = JSON.parse(fs.readFileSync(path.join(here, 'out-fixed', s, f), 'utf8'));
  const ids = Object.keys(d.courses), was = count(d, ids);
  for (const id of ids) { if (a.courses[id]) d.courses[id].prereqs = a.courses[id].prereqs; else missing++; }
  const now = count(d, ids);
  if (was) worst = Math.max(worst, Math.abs(now - was) / was);
  for (const [id, c] of Object.entries(d.courses)) for (const p of c.prereqs) { if (p.anyOf.some((x) => x.id === id)) selfRefs++; if (p.anyOf.every((x) => x.id === null)) nulls++; }
  const v = validate(d, JSON.parse(before));
  if (v.errors.length) { errs += v.errors.length; console.log(`${s}/${f}: ${v.errors.join('; ')}`); }
  const out = JSON.stringify(d, null, 1);
  files++;
  if (out !== before) { changed++; if (!dry) fs.writeFileSync(target, out); }
}
console.log(`files ${files}, changed ${changed}, courses missing in rebuild ${missing}, worst prereq-count change ${(worst * 100).toFixed(1)}%, self-refs ${selfRefs}, all-null groups ${nulls}, validate errors ${errs}${dry ? ' (dry)' : ''}`);
