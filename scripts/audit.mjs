#!/usr/bin/env node
// Read-only data review for programs nobody from the department has checked: no request to the site, only web/data/afeka.
//   node scripts/audit.mjs [> docs/DATA-AUDIT.md]
// Findings are hints for a human (a mandatory course can legitimately wait for the summer), not errors.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// One cohort: its datasets by semester ({ 'א': data, 'ב': data }) and its study year in the dataset's year. Returns finding strings.
// Only the lists of the current study year and later: the earlier years' courses are rightly no longer offered to this cohort.
export function auditCohort(sems, studyYear = 1) {
  const out = [], all = Object.values(sems);
  const offered = (id) => all.some((d) => d.courses[id]?.offered);
  const first = all[0], mandatory = first.lists.filter((l) => ' אבגדה'.indexOf(l.name.match(/חובה שנה (\S)'/)?.[1] ?? ' ') >= studyYear);
  for (const l of mandatory) {
    const missing = l.courses.filter((id) => !first.courses[id] || !offered(id));
    if (missing.length) out.push(`רשימה "${l.name}": ${missing.length} מתוך ${l.courses.length} קורסים לא נפתחים בא׳ או בב׳: ${missing.map((id) => `${id} ${first.courses[id]?.name ?? '?'}`).join(', ')}`);
    const sum = l.courses.reduce((s, id) => s + (Number(first.courses[id]?.credits) || 0), 0);
    if (l.minCredits && Math.abs(sum - l.minCredits) > 0.01) out.push(`רשימה "${l.name}": סכום נ״ז ${sum}, באתר ${l.minCredits}`);
  }
  const dangling = new Set();
  for (const [id, c] of Object.entries(first.courses)) for (const p of c.prereqs) for (const a of p.anyOf) if (a.id && !first.courses[a.id]) dangling.add(`${id}->${a.id}`);
  if (dangling.size) out.push(`דרישות קדם שמצביעות על קורס שאינו במאגר: ${[...dangling].slice(0, 8).join(', ')}${dangling.size > 8 ? ` ועוד ${dangling.size - 8}` : ''}`);
  const noGroups = Object.entries(first.courses).filter(([id, c]) => offered(id) && !all.some((d) => d.courses[id]?.groups.length));
  if (noGroups.length) out.push(`${noGroups.length} קורסים מסומנים כנפתחים ואין להם קבוצות: ${noGroups.slice(0, 6).map(([id, c]) => `${id} ${c.name}`).join(', ')}`);
  const unscheduled = Object.entries(first.courses).filter(([, c]) => c.groups.some((g) => g.primary && !g.meetings.length));
  if (unscheduled.length) out.push(`${unscheduled.length} קורסים עם קבוצה ראשית בלי מפגשים`);
  return out;
}

function main() {
  const dir = 'web/data/afeka', cat = JSON.parse(readFileSync(`${dir}/catalog.json`, 'utf8'));
  const read = (sem, p, y) => JSON.parse(readFileSync(`${dir}/2027-${sem}/${p}-${y}.json`, 'utf8'));
  console.log('# סקירת נתונים אוטומטית\n\nנוצר על ידי `node scripts/audit.mjs`. אלה רמזים לבדיקה ידנית מול המחלקה, לא שגיאות. סכום נ״ז שלא תואם יכול לנבוע מקורסים חלופיים ברשימה.\n');
  for (const p of cat.programs) {
    const rows = [];
    for (const y of p.startYears) { const f = auditCohort({ 'א': read(1, p.id, y), 'ב': read(2, p.id, y) }, 2027 - y + 1); if (f.length) rows.push(`- **מחזור ${y}**\n${f.map((x) => `  - ${x}`).join('\n')}`); }
    console.log(`## ${p.name} (${p.id})\n\n${rows.join('\n') || 'אין ממצאים.'}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
