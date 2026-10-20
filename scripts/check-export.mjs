// Checks a folder of timetable data against docs/DATA-CONTRACT.md: the catalog, the status file and one data file per program, cohort and semester.
// Usage: node scripts/check-export.mjs <dir> [--against <dir of the data now on the site>]. Exit 1 when there are errors.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validate, compareToPrevious } from './build.mjs';

const SEMESTERS = [[1, 'א', true], [2, 'ב', false], [3, 'קיץ', false]]; // [folder suffix, name in the file, required]: the site runs on א alone (app.js fetchSemesters)
const TYPES = {
  int: (x) => Number.isInteger(x), num: (x) => typeof x === 'number' && Number.isFinite(x), str: (x) => typeof x === 'string', bool: (x) => typeof x === 'boolean',
  arr: Array.isArray, obj: (x) => x !== null && typeof x === 'object' && !Array.isArray(x), strOrNull: (x) => x === null || typeof x === 'string',
  hhmm: (x) => typeof x === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(x), date: (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x) && !Number.isNaN(Date.parse(x)),
  day: (x) => Number.isInteger(x) && x >= 1 && x <= 6, seats: (x) => Number.isInteger(x) && x >= 0,
};
// field: [type, required]. Unknown fields are never an error.
const FIELDS = {
  file: { year: ['int', 1], startYear: ['int', 1], program: ['int', 1], semester: ['str', 1], examsPublished: ['bool', 1], lists: ['arr', 1], courses: ['obj', 1],
    fetchedAt: ['date'], specializations: ['arr'], degree: ['obj'], specRule: ['obj'], verified: ['bool'] },
  list: { code: ['int', 1], name: ['str', 1], minCredits: ['num', 1], courses: ['arr', 1] },
  course: { name: ['str', 1], credits: ['num', 1], offered: ['bool', 1], prereqs: ['arr', 1], groups: ['arr', 1] },
  prereq: { kind: ['str', 1], anyOf: ['arr', 1] },
  option: { id: ['strOrNull', 1], name: ['str', 1] },
  group: { id: ['str', 1], type: ['str', 1], primary: ['bool', 1], lecturer: ['str', 1], full: ['bool', 1], semester: ['str', 1], linked: ['arr', 1], meetings: ['arr', 1], exams: ['arr', 1],
    seatsLeft: ['seats'], fetchedAt: ['date'] },
  meeting: { day: ['day', 1], start: ['hhmm', 1], end: ['hhmm', 1], room: ['str'] },
  exam: { kind: ['str', 1], moed: ['int', 1], date: ['date', 1], time: ['str', 1] },
  catalog: { year: ['int', 1], programs: ['arr', 1] },
  program: { id: ['int', 1], name: ['str', 1], startYears: ['arr', 1] },
};

function shape(kind, x, at, errors) {
  if (!TYPES.obj(x)) { errors.push(`${at}: should be an object`); return false; }
  let ok = true;
  for (const [key, [type, required]] of Object.entries(FIELDS[kind])) {
    if (x[key] === undefined) { if (required) { errors.push(`${at}.${key}: missing`); ok = false; } continue; }
    if (!TYPES[type](x[key])) { errors.push(`${at}.${key}: should be ${type}, is ${JSON.stringify(x[key])?.slice(0, 40)}`); ok = false; }
  }
  return ok;
}

// Every field the site reads without a guard, down to each meeting. Returns false when the file is too broken for validate() to run.
// Paths start at "$" and come out as "<file>: courses.6001.groups[0].meetings: missing".
function checkFile(d, label, out) {
  if (!TYPES.obj(d)) { out.push(`${label}: should be a JSON object`); return false; }
  const errors = [];
  const done = (good) => { out.push(...errors.map((e) => `${label}: ${e.replace(/^\$\.?/, '')}`)); return good; };
  if (!shape('file', d, '$', errors)) return done(false);
  let ok = true;
  const sub = (kind, x, at) => { const good = shape(kind, x, at, errors); ok &&= good; return good; };
  d.lists.forEach((l, i) => {
    if (!sub('list', l, `$.lists[${i}]`)) return;
    for (const id of l.courses) if (!d.courses[id]) { errors.push(`$.lists[${i}]: course ${id} is not in courses`); ok = false; }
  });
  for (const [id, c] of Object.entries(d.courses)) {
    const at = `$.courses.${id}`;
    if (!sub('course', c, at)) continue;
    c.prereqs.forEach((p, i) => { if (sub('prereq', p, `${at}.prereqs[${i}]`)) p.anyOf.forEach((o, j) => sub('option', o, `${at}.prereqs[${i}].anyOf[${j}]`)); });
    c.groups.forEach((g, i) => {
      if (!sub('group', g, `${at}.groups[${i}]`)) return;
      g.meetings.forEach((m, j) => sub('meeting', m, `${at}.groups[${i}].meetings[${j}]`));
      g.exams.forEach((e, j) => sub('exam', e, `${at}.groups[${i}].exams[${j}]`));
    });
  }
  return done(ok);
}

const readJson = (file, errors, label) => {
  if (!existsSync(file)) { errors.push(`${label}: missing`); return null; }
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { errors.push(`${label}: not valid JSON (${e.message})`); return null; }
};

export function checkExport(dir, { against } = {}) {
  const errors = [], warnings = [];
  const catalog = readJson(`${dir}/catalog.json`, errors, 'catalog.json');
  const status = readJson(`${dir}/status.json`, errors, 'status.json');
  if (status) {
    if (!TYPES.obj(status) || !TYPES.date(status.checkedAt)) errors.push('status.json.checkedAt: missing or not a date (the site shows it as "checked N hours ago")');
    else if (!TYPES.bool(status.ok)) warnings.push('status.json.ok: should be true or false (missing counts as false, the site shows the data as stale)');
  }
  if (!catalog) return { errors, warnings };
  if (!shape('catalog', catalog, 'catalog.json', errors)) return { errors, warnings };
  const expected = new Set();
  catalog.programs.forEach((p, i) => {
    if (!shape('program', p, `catalog.json.programs[${i}]`, errors)) return;
    if (!p.startYears.length || !p.startYears.every(Number.isInteger)) { errors.push(`catalog.json.programs[${i}].startYears: should be a list of years`); return; }
    for (const startYear of p.startYears) for (const [n, semester, required] of SEMESTERS) {
      const rel = `${catalog.year}-${n}/${p.id}-${startYear}.json`;
      expected.add(rel);
      if (!existsSync(`${dir}/${rel}`)) { (required ? errors : warnings).push(`${rel}: missing (program ${p.id}, cohort ${startYear}, semester ${semester})`); continue; }
      const d = readJson(`${dir}/${rel}`, errors, rel);
      if (!d) continue;
      const before = errors.length;
      if (!checkFile(d, rel, errors)) continue;
      for (const [key, want] of [['year', catalog.year], ['startYear', startYear], ['program', p.id], ['semester', semester]]) {
        if (d[key] !== want) errors.push(`${rel}: ${key} is ${JSON.stringify(d[key])}, the path and catalog say ${JSON.stringify(want)}`);
      }
      if (errors.length > before) continue;
      const own = validate(d, null, null, 1); // no anchor course and no minimum size: those belong to our scraper's config, not to a contract
      errors.push(...own.errors.map((e) => `${rel}: ${e}`));
      warnings.push(...own.warnings.map((w) => `${rel}: ${w}`));
      const prevFile = against && `${against}/${rel}`;
      if (prevFile && existsSync(prevFile)) {
        warnings.push(...compareToPrevious(JSON.parse(readFileSync(prevFile, 'utf8')), d).errors.map((e) => `${rel}: ${e} (against ${against})`));
      }
    }
  });
  for (const [n] of SEMESTERS) {
    const folder = `${catalog.year}-${n}`;
    if (!existsSync(`${dir}/${folder}`)) continue;
    for (const f of readdirSync(`${dir}/${folder}`)) if (!expected.has(`${folder}/${f}`)) warnings.push(`${folder}/${f}: not in catalog.json, the site never loads it`);
  }
  return { errors, warnings };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), at = args.indexOf('--against');
  const against = at >= 0 ? args.splice(at, 2)[1] : undefined;
  const dir = args[0];
  if (!dir) { console.error('usage: node scripts/check-export.mjs <dir> [--against <dir>]'); process.exit(2); }
  const { errors, warnings } = checkExport(dir, { against });
  for (const w of warnings.slice(0, 20)) console.log(`warning: ${w}`);
  if (warnings.length > 20) console.log(`warning: ... and ${warnings.length - 20} more`);
  for (const e of errors) console.log(`ERROR: ${e}`);
  console.log(errors.length ? `${errors.length} error(s), ${warnings.length} warning(s)` : `ok, ${warnings.length} warning(s)`);
  process.exit(errors.length ? 1 : 0);
}
