// One printable A4 page per department that has an open conflict between official sources (docs/ISSUES.md section 21).
// Usage: npm run report:conflicts  ->  out/conflicts/<dept>.html. Reads web/settings.json (programs[id].conflicts) and scripts/programs.json.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { cleanSettings } from '../web/settings.js';
import { esc } from '../web/ui-text.js';

export const COLUMNS = ['מה מצאנו', 'תוכנית הלימודים', 'הידיעון', 'מה הכלי עושה היום', 'ההחלטה שלכם'];
const UNKNOWN = 'לבדיקת המחלקה'; // a source the repo does not show is never guessed

const CSS = `@page { size: A4; margin: 12mm }
body { font: 11pt/1.4 Arial, sans-serif; margin: 0; color: #000 }
h1 { font-size: 16pt; margin: 0 0 4mm }
p { margin: 0 0 4mm }
table { width: 100%; border-collapse: collapse; table-layout: fixed }
th, td { border: 1px solid #000; padding: 2mm; vertical-align: top; text-align: right }
th { background: #eee }
tr { break-inside: avoid }
.decision { height: 28mm }
small { display: block; margin-top: 1mm }`;

const row = (id, program, c) => `<tr class="row"><td>${esc(c.text)}<small>${esc(program.name)} (${id}), מחזורים ${c.cohorts.join(' · ')}</small></td>
<td>${esc(c.plan || UNKNOWN)}</td><td>${esc(c.yedion || UNKNOWN)}</td><td>${esc(c.tool || UNKNOWN)}</td><td class="decision"></td></tr>`;

function html(deptName, rows) {
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><title>סתירות בין המקורות: ${esc(deptName)}</title><style>${CSS}</style></head><body>
<h1>סתירות בין המקורות הרשמיים: מחלקת ${esc(deptName)}</h1>
<p>האתר הולך לפי הידיעון. נבקש שתכתבו בעמודה האחרונה מה נכון, ואנחנו נעדכן את האתר.</p>
<table><thead><tr>${COLUMNS.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>
${rows.join('\n')}
</tbody></table></body></html>
`;
}

// settings: cleaned (cleanSettings); programs: scripts/programs.json. One sheet per department with a conflict, by department number.
export function sheets(settings, programs) {
  const byDept = new Map();
  for (const id of Object.keys(settings.programs ?? {}).sort((a, b) => a - b)) {
    const p = Object.hasOwn(programs, id) ? programs[id] : null;
    const list = settings.programs[id].conflicts ?? [];
    if (!p || !list.length) continue;
    if (!byDept.has(p.dept)) byDept.set(p.dept, { deptName: p.deptName, rows: [] });
    byDept.get(p.dept).rows.push(...list.map((c) => row(id, p, c)));
  }
  return [...byDept].sort(([a], [b]) => a - b).map(([dept, d]) => ({ dept, deptName: d.deptName, html: html(d.deptName, d.rows) }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const read = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
  const out = sheets(cleanSettings(read('../web/settings.json')), read('./programs.json'));
  mkdirSync('out/conflicts', { recursive: true });
  for (const s of out) { writeFileSync(`out/conflicts/${s.dept}.html`, s.html); console.log(`out/conflicts/${s.dept}.html  ${s.deptName}`); }
}
