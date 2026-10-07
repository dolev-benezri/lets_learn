#!/usr/bin/env node
// Read-only data review for programs nobody from the department has checked: no request to the site, only web/data/afeka.
//   node scripts/audit.mjs [> docs/DATA-AUDIT.md]
// Findings are hints for a human (a mandatory course can legitimately wait for the summer), not errors.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { progressInfo } from '../../../web/map-layout.js';

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

// Values from Afeka's current curricula (תכנית לימודים תשפ״ז, page 2) and the yedion, as compared on 3.10.2026 (docs/superpowers/plans/2026-10-04-program-config-vs-afeka.md).
// They depend on the scraped lists, so a yedion change is a warning in the nightly scrape, not a failing test that blocks the deploy.
// spec: specialization credits per cohort (OFFICIAL.years), 160 minus the minCredits of the lists outside the specializations, every area at once.
// full: cohorts whose electives list has minCredits 0, which still reach their degree total with every course passed.
export const OFFICIAL = {
  year: 2027, // the academic year these curricula are for: another year's scrape skips the check
  years: [2024, 2025, 2026, 2027],
  spec: { 30: [21.5, 27, 27, 27], 32: [23, 29.5, 27, 27], 20: [22.5, 23, 24, 24], 22: [21, 24, 19, 19], 10: [23, 20, 23, 23], 12: [15, 20, 22, 23],
    40: [23, 21.5, 23, 23], 42: [28, 21.5, 23, 23], 50: [17, 14.5, 17, 17] },
  full: [[11, 2027, 120], [112, 2026, 120], [112, 2027, 120], [19, 2027, 120]],
};
// read(program, startYear) -> dataset. Returns one line per cohort whose number moved (or whose file could not be read).
export function officialDrift(read, { spec, years, full } = OFFICIAL) {
  const out = [], each = (label, fn) => { try { const m = fn(); if (m) out.push(`${label}: ${m}`); } catch (e) { out.push(`${label}: ${e.message}`); } };
  for (const [id, want] of Object.entries(spec)) years.forEach((y, i) => each(`${id}-${y}`, () => {
    const d = read(Number(id), y), got = progressInfo(d, {}, new Set(), d.specializations.map((s) => s.id)).specLeft;
    return got === want[i] ? null : `נ״ז התמחות ${want[i]} בתוכנית הלימודים, ${got} מהידיעון`;
  }));
  for (const [id, y, total] of full) each(`${id}-${y}`, () => {
    const d = read(id, y), got = progressInfo(d, Object.fromEntries(Object.keys(d.courses).map((c) => [c, { status: 'done' }]))).done;
    return got === total ? null : `עם כל הקורסים ${got} נ״ז, לא ${total}`;
  });
  return out;
}

function main() {
  const dir = 'web/data/afeka', cat = JSON.parse(readFileSync(`${dir}/catalog.json`, 'utf8'));
  const year = cat.year ?? 2027, read = (sem, p, y) => JSON.parse(readFileSync(`${dir}/${year}-${sem}/${p}-${y}.json`, 'utf8'));
  console.log('# סקירת נתונים אוטומטית\n\nנוצר על ידי `node scripts/audit.mjs`. אלה רמזים לבדיקה ידנית מול המחלקה, לא שגיאות. סכום נ״ז שלא תואם יכול לנבוע מקורסים חלופיים ברשימה.\n');
  for (const p of cat.programs) {
    const rows = [];
    for (const y of p.startYears) { const f = auditCohort({ 'א': read(1, p.id, y), 'ב': read(2, p.id, y) }, year - y + 1); if (f.length) rows.push(`- **מחזור ${y}**\n${f.map((x) => `  - ${x}`).join('\n')}`); }
    console.log(`## ${p.name} (${p.id})\n\n${rows.join('\n') || 'אין ממצאים.'}\n`);
  }
  const drift = year === OFFICIAL.year ? officialDrift((p, y) => read(1, p, y)) : [`הטבלה היא של ${OFFICIAL.year}, הנתונים של ${year}: לא נבדק.`];
  console.log(`## מול תוכניות הלימודים הרשמיות\n\n${drift.map((x) => `- ${x}`).join('\n') || 'הכל תואם.'}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
