// Probe 4: how stale is the local cache (Oct 3) against the committed data? (a wholesale offline rebuild would roll these back)
// Run: node solver-audit/plan-probes/data-p4-stale.mjs
import fs from 'node:fs';
const here = new URL('./', import.meta.url), committed = new URL('../../web/data/afeka/', import.meta.url);
let files = 0, differ = 0, fullDiff = 0, groupCountDiff = 0, status = null;
const strip = (d) => { const c = structuredClone(d); delete c.fetchedAt; for (const x of Object.values(c.courses)) delete x.prereqs; return JSON.stringify(c); };
for (const s of ['2027-1', '2027-2', '2027-3']) for (const f of fs.readdirSync(new URL(`out-before/${s}/`, here))) {
  const a = JSON.parse(fs.readFileSync(new URL(`out-before/${s}/${f}`, here), 'utf8')), c = JSON.parse(fs.readFileSync(new URL(`${s}/${f}`, committed), 'utf8'));
  files++; if (strip(a) !== strip(c)) differ++;
  const fl = (d) => Object.values(d.courses).flatMap((x) => x.groups).filter((g) => g.full).length; if (fl(a) !== fl(c)) fullDiff++;
}
console.log(`INFO files ${files}; files whose NON-prereq content differs between the Oct-3 cache rebuild and committed data: ${differ}; files with a different number of full groups: ${fullDiff}`);
console.log('INFO cache mtime', fs.statSync(new URL('../../.yedion-cache/index.tsv', import.meta.url)).mtime.toISOString());
const st = JSON.parse(fs.readFileSync(new URL('status.json', committed), 'utf8')); console.log('INFO committed status.json checkedAt', st.checkedAt);
