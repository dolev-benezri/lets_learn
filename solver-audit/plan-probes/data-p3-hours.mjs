// Probe 3 support: real lesson start/end minutes, day range, in the committed data (web/data/afeka, 144 files).
// Run: node solver-audit/plan-probes/data-p3-hours.mjs
import fs from 'node:fs';
const root = new URL('../../web/data/afeka/', import.meta.url);
const files = ['2027-1', '2027-2', '2027-3'].flatMap((s) => fs.readdirSync(new URL(s + '/', root)).map((f) => `${s}/${f}`));
const startMin = new Map(), endMin = new Map(), days = new Map();
let n = 0, minStart = '99', maxEnd = '00', badStartGrid = [], zeroLen = 0;
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(new URL(f, root), 'utf8'));
  for (const [id, c] of Object.entries(d.courses)) for (const g of c.groups) for (const m of g.meetings) {
    n++;
    const sm = m.start.slice(3), em = m.end.slice(3);
    startMin.set(sm, (startMin.get(sm) ?? 0) + 1); endMin.set(em, (endMin.get(em) ?? 0) + 1); days.set(m.day, (days.get(m.day) ?? 0) + 1);
    if (m.start < minStart) minStart = m.start; if (m.end > maxEnd) maxEnd = m.end;
    if (sm !== '00' && sm !== '30') badStartGrid.push(`${f}:${id}:${g.id}:${m.start}`);
    if (m.start >= m.end) zeroLen++;
  }
}
console.log(`INFO files ${files.length} meetings ${n} earliest start ${minStart} latest end ${maxEnd} start>=end ${zeroLen}`);
console.log('INFO start minutes', JSON.stringify([...startMin]));
console.log('INFO end minutes', JSON.stringify([...endMin]));
console.log('INFO days', JSON.stringify([...days].sort()));
console.log(`INFO starts off :00/:30: ${badStartGrid.length} ${badStartGrid.slice(0, 5).join(' ')}`);
