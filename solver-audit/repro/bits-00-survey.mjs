// bits-00-survey.mjs - Survey of every meeting in web/data/afeka/*/*.json (inputs to the "real data" claims of the bits-* audit).
// Targets: web/solver-core.js:4-22 (grid constants, meetingsMask) - tells which (day,start,end) values the 30-min grid really sees.
// Run: node solver-audit/repro/bits-00-survey.mjs   (any cwd).  Output: histograms; CHECK lines assert the facts the other scripts rely on.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../web/data/afeka/', import.meta.url));
const SEMS = ['2027-1', '2027-2', '2027-3'];
const files = [];
for (const s of SEMS) for (const f of fs.readdirSync(path.join(root, s)).filter((x) => x.endsWith('.json')).sort()) files.push([s, f]);
const hist = { start: {}, end: {}, day: {}, len: {} };
let meetings = 0, groups = 0, courses = 0, bad = 0;
const hh = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
for (const [s, f] of files) {
  const d = JSON.parse(fs.readFileSync(path.join(root, s, f), 'utf8'));
  for (const c of Object.values(d.courses)) { courses++; for (const g of c.groups) { groups++; for (const m of g.meetings) {
    meetings++;
    const mm = (t) => t.slice(3);
    hist.start[mm(m.start)] = (hist.start[mm(m.start)] ?? 0) + 1;
    hist.end[mm(m.end)] = (hist.end[mm(m.end)] ?? 0) + 1;
    hist.day[m.day] = (hist.day[m.day] ?? 0) + 1;
    hist.len[hh(m.end) - hh(m.start)] = (hist.len[hh(m.end) - hh(m.start)] ?? 0) + 1;
    if (!(Number.isInteger(m.day) && m.day >= 1 && m.day <= 6 && m.start >= '07:00' && m.end <= '23:00' && m.start < m.end)) bad++;
  } } }
}
console.log(`files=${files.length} courses=${courses} groups=${groups} meetings=${meetings}`);
for (const k of Object.keys(hist)) console.log(`${k} histogram:`, JSON.stringify(hist[k]));
let ok = true;
const chk = (id, cond, detail) => { console.log(`CHECK ${id} ${cond ? 'PASS' : 'FAIL'} ${detail}`); if (!cond) ok = false; };
chk('S1', files.length === 144, `144 data files, found ${files.length}`);
chk('S2', Object.keys(hist.start).join() === '00', `every meeting starts at minute :00 (start minutes: ${Object.keys(hist.start)})`);
chk('S3', Object.keys(hist.end).sort().join() === '00,30,50', `meeting ends are only :00, :30, :50 (found ${Object.keys(hist.end).sort()})`);
chk('S4', bad === 0, `every meeting has day 1..6 and lies inside 07:00-23:00 (violations: ${bad})`);
process.exit(ok ? 0 : 1);
