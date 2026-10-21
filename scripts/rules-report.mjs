// A printable page per program and cohort listing the rules the tool reads (lists, credits, prerequisites, specialization rule), for a department to sign.
// Usage: node scripts/rules-report.mjs  ->  out/rules/<program>-<startYear>.html and out/rules/index.html. Reads only web/data/afeka/ (no network).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { specCodes, specRule } from '../web/rules.js';
import { cleanSettings, approvedOn } from '../web/settings.js';
import { approvedText, conflictsFor, esc, heb } from '../web/ui-text.js';

const SIGNATURE = 'אישור המחלקה: שם ________ תפקיד ________ תאריך ________ חתימה ________';
const h = (s) => esc(heb(s));
// Fonts by relative path from out/rules/, so a page opens from disk with Rubik.
const CSS = `
@font-face { font-family:"Rubik"; font-weight:300 900; src:url(../../web/fonts/rubik-hebrew-wght-normal.woff2) format("woff2"); unicode-range:U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F; }
@font-face { font-family:"Rubik"; font-weight:300 900; src:url(../../web/fonts/rubik-latin-wght-normal.woff2) format("woff2"); unicode-range:U+0000-00FF,U+2000-206F,U+20AC; }
@page { size: A4; margin: 15mm; }
body { font:12px/1.5 "Rubik", sans-serif; color:#000; background:#fff; margin:0; padding:0 8px; }
h1 { font-size:20px; margin:0 0 4px; } h2 { font-size:15px; margin:14px 0 4px; } h3 { font-size:13px; margin:0 0 4px; }
.list { break-inside:avoid; margin:0 0 12px; } .list p { margin:0 0 4px; }
table { width:100%; border-collapse:collapse; } th, td { border:1px solid #000; padding:2px 6px; text-align:right; vertical-align:top; } th { background:#eee; } td:nth-child(1), td:nth-child(3) { white-space:nowrap; width:1%; } td:nth-child(2) { width:32%; }
.sign { break-inside:avoid; margin-top:24px; font-size:14px; } .ok { font-weight:700; }`;
const page = (title, body) => `<!doctype html>\n<html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}</style></head><body>\n${body}\n</body></html>\n`;

const prereqText = (c) => c.prereqs.map((p) => `${p.kind}: ${p.anyOf.map((a) => h(a.name)).join(' או ')}`).join('; ') || '—';

export function rulesHtml(data, entry, settings) {
  const day = approvedOn(settings, entry.id, data.startYear), conflicts = conflictsFor(settings, entry.id, data.startYear);
  const areas = data.specializations ?? [], rule = specRule(data);
  const areaOf = (code) => areas.find((s) => specCodes(s).some(([, c]) => c === code))?.name;
  const alone = areas.filter((s) => rule.alone.includes(s.id)).map((s) => h(s.name));
  const lists = data.lists.map((l) => {
    const area = areaOf(l.code);
    const rows = l.courses.map((id) => {
      const c = data.courses[id];
      return `<tr><td>${esc(id)}</td><td>${c ? h(c.name) : '—'}</td><td>${c ? c.credits : '—'}</td><td>${c ? prereqText(c) : '—'}</td></tr>`;
    }).join('');
    return `<section class="list"><h3>${h(l.name)}${area ? ` (התמחות ${h(area)})` : ''}</h3><p>לפחות ${l.minCredits} נ״ז</p>
<table><tr><th>מספר</th><th>קורס</th><th>נ״ז</th><th>דרישות קדם</th></tr>${rows}</table></section>`;
  }).join('\n');
  const specRuleText = areas.length
    ? `<h2>כלל בחירת ההתמחות</h2><p>בוחרים ${rule.pick} תחומי התמחות${alone.length ? `, או תחום אחד בלבד: ${alone.join(', ')}` : ''}. התחומים: ${areas.map((s) => h(s.name)).join(', ')}.</p>` : '';
  const conflictText = conflicts.length ? `<h2>סתירות פתוחות בין מקורות רשמיים</h2><ul>${conflicts.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '';
  return page(`${entry.name} מחזור ${data.startYear}`, `<h1>${h(entry.name)} · מחזור ${data.startYear}</h1>
<p>סך הכול ${data.degree?.total ?? '—'} נ״ז לתואר. הנתונים מ-${esc(String(data.fetchedAt ?? '').slice(0, 10))}${data.verified === false ? '. הנתונים של התוכנית הזו עוד לא נבדקו מול תוכנית הלימודים הרשמית' : ''}.</p>
${day ? `<p class="ok">${esc(approvedText(day))}</p>` : ''}${specRuleText}${conflictText}
<h2>רשימות הקורסים</h2>
${lists}
<p class="sign">${SIGNATURE}</p>`);
}

// programs: [{ entry, files: [{ startYear, found }] }]
export function indexHtml(programs, settings) {
  const rows = programs.map(({ entry, files }) => `<li>${h(entry.name)}: ${files.map((f) => {
    const day = approvedOn(settings, entry.id, f.startYear), ok = day ? ` (${esc(approvedText(day))})` : '';
    return f.found ? `<a href="${entry.id}-${f.startYear}.html">${f.startYear}</a>${ok}` : `${f.startYear} (לא נמצא קובץ נתונים)`;
  }).join(' · ')}</li>`).join('\n');
  return page('כללי התוכניות', `<h1>כללי התוכניות</h1>\n<ul>\n${rows}\n</ul>`);
}

export function main(root = 'web', out = 'out/rules') {
  const catalog = JSON.parse(readFileSync(`${root}/data/afeka/catalog.json`, 'utf8'));
  const settings = cleanSettings(existsSync(`${root}/settings.json`) ? JSON.parse(readFileSync(`${root}/settings.json`, 'utf8')) : null);
  mkdirSync(out, { recursive: true });
  const programs = catalog.programs.map((entry) => ({ entry, files: entry.startYears.map((startYear) => {
    const file = `${root}/data/afeka/${catalog.year}-1/${entry.id}-${startYear}.json`; // the first semester: the lists and prerequisites do not change between semesters
    if (!existsSync(file)) return { startYear, found: false };
    writeFileSync(`${out}/${entry.id}-${startYear}.html`, rulesHtml(JSON.parse(readFileSync(file, 'utf8')), entry, settings));
    return { startYear, found: true };
  }) }));
  writeFileSync(`${out}/index.html`, indexHtml(programs, settings));
  return programs;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const programs = main();
  const files = programs.flatMap((p) => p.files);
  console.log(`${files.filter((f) => f.found).length} pages in out/rules/, ${files.filter((f) => !f.found).length} without a data file`);
}
