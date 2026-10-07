// rules-regulations.mjs
// WHAT: checks the regulation claims that web/rules.js makes against the OFFICIAL regulation text (Afeka "תקנון לימודים תואר ראשון",
//   header date 5/2/2026, doc no. 08-00-2-001), and shows where the code and the text differ.
// SOURCE (public, plain GET): https://external.afeka.ac.il/media/mfnpt5or/תקנון-לימודים-תואר-ראשון-1.pdf   (found by web search, 2026-10-06;
//   the README links the same file under www.afeka.ac.il/media/mfnpt5or/...). 16 pages, Hebrew glyphs are stored in visual order.
// TARGETS: web/rules.js:4-7 (Amirnet table), 61-126 (classify: citations 6.2.3, 7.4, 11.4.1, 11.5.1, 11.5.2, 11.6.1), 79-83 (retake).
// RUN:   node solver-audit/repro/rules-regulations.mjs               Part A only (offline): code vs the facts below
//        node solver-audit/repro/rules-regulations.mjs --source      Part B too: downloads the PDF once (or uses $AFEKA_PDF=<path>), runs
//                                                                    `pdftotext -raw`, reverses the visual-order Hebrew and asserts the quoted
//                                                                    facts appear under the section numbers. Needs `pdftotext` (poppler / Git for Windows
//                                                                    ships it) and network. If either is missing Part B prints INFO "inconclusive" and is skipped.
//        Temp files go to $RULES_TMP (default os.tmpdir()).
// FACTS (each is re-asserted in Part B, short phrases only):
//   6.2.3   "קורס מקביל" = the prerequisite course is taught at the latest in the semester of the dependent course.
//   6.2.7.8 table: Amirnet/psychometric English 85-99 = basic (בסיסי), 100-119 = advanced A, 120-133 = advanced B, 134+ = exempt (6.2.7.4).
//   7.4     no registration to a continuation course (קורס המשך) without passing the prerequisite.  7.5: an exception for >=80% of the program.
//   11.4.1  probation ("על תנאי"): "ציון נכשל בשלושה קורסים במצטבר" = a failing grade in three COURSES cumulatively.
//   11.5.1  expulsion: failing grade in four or more courses cumulatively.   11.5.2: failed 3 times in the SAME course (registering 3 times without a pass counts).
//   11.6/11.6.1  these bind a student ALREADY on probation ("סטודנט במעמד על תנאי חייב ... להירשם בשנה העוקבת לקורסים בהם נכשל").
//   7.6/7.7 define repeating a course (registration, full duties; the later grade binds).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { amirnetExempt, englishOptions, cleanProfile, classify } from '../../web/rules.js';
import { load, check, bug, info, finish } from './rules-lib.mjs';

// ---------- Part A: code vs the regulation's Amirnet table (6.2.7.8, 6.2.7.4) ----------
const d = load('2027-1', 30, 2026);
const first = (s) => ['6000', '6001', '6002', '6003'].find((id) => !amirnetExempt(s).includes(id)) ?? 'none';
const want = [[84, 0, '6000'], [85, 0, '6001'], [99, 0, '6001'], [100, 0, '6002'], [119, 0, '6002'], [120, 0, '6003'], [133, 0, '6003'], [134, 0, 'none'], [150, 0, 'none']];
const rows = want.map(([s, , level]) => [s, first(s), level, amirnetExempt(s).length]);
// score 84 is below the table: nothing exempt, first level is 6000 (pre-basic, "not offered" in the data, see rules-english-gate.mjs)
check('rules-reg-1', rows.every(([, got, lvl]) => got === lvl) && amirnetExempt(84).length === 0 && amirnetExempt(134).length === 4,
  `first non-exempt English level per score: ${rows.map(([s, g]) => `${s}->${g}`).join(' ')}`);
const names = ['6001', '6002', '6003'].map((id) => d.courses[id].name);
check('rules-reg-2', /בסיסי/.test(names[0]) && /מתקדמים א/.test(names[1]) && /מתקדמים ב/.test(names[2]),
  `data names match the table's levels: 6001="${names[0]}" 6002="${names[1]}" 6003="${names[2]}"`);
check('rules-reg-3', ['x', NaN, null, undefined, Infinity, '90', -1].every((v) => amirnetExempt(v).length === 0), 'non-numeric / non-finite scores exempt nothing');
check('rules-reg-4', [49, 151, 90.5, '90', NaN].every((v) => cleanProfile({ amirnet: v }).amirnet === null) && cleanProfile({ amirnet: 50 }).amirnet === 50 && cleanProfile({ amirnet: 150 }).amirnet === 150,
  'cleanProfile keeps only integer scores 50..150 (the Amirnet/psychometric English scale)');
check('rules-reg-5', englishOptions(d, 100).map((e) => `${e.id}:${e.min}:${e.exempt}`).join() === '6000:85:true,6001:100:true,6002:120:false,6003:134:false',
  'englishOptions(…,100) = ' + englishOptions(d, 100).map((e) => `${e.id}:${e.min}:${e.exempt}`).join());

// ---------- Part A: parallel and prerequisite semantics (6.2.3, 7.4) ----------
{
  const mk = (kind) => ({ semester: 'א', courses: { P: { name: 'P', credits: 3, offered: true, prereqs: [], groups: [] }, X: { name: 'X', credits: 3, offered: true, groups: [], prereqs: [{ kind, anyOf: [{ id: 'P', name: 'P' }] }] } } });
  const s = (kind, passed) => classify(mk(kind), { passed, failed: {}, profile: {} }).statuses.X;
  const a = s('קדם', []), b = s('מקביל', []), c = s('מקביל', ['P']), e = s('קדם', ['P']);
  check('rules-reg-6', a.status === 'blocked' && b.status === 'conditional' && JSON.stringify(b.missingParallel) === '[["P"]]' && c.status === 'available' && e.status === 'available',
    `קדם unmet=${a.status} (7.4), מקביל unmet=${b.status} needs ${JSON.stringify(b.missingParallel)} (6.2.3: same semester allowed), either passed=${c.status}/${e.status}`);
  check('rules-reg-7', /6\.2\.3/.test(b.reasons[0]) && /7\.4/.test(a.reasons[0] ?? '') , `citations in reason strings: parallel -> "${b.reasons[0]}" ; blocked -> "${a.reasons[0]}"`);
}

// ---------- Part A: failure counting, code reading vs the literal text of 11.4.1 / 11.5.1 / 11.5.2 ----------
const w = (failed) => classify({ semester: 'א', courses: {} }, { passed: [], failed, profile: {} }).warnings.map((x) => (x.includes('11.5.2') ? 'E52' : x.includes('11.5.1') ? 'E51' : x.includes('11.4.1') ? 'P41' : '?')).join('+') || '-';
// literal reading: 11.4.1 / 11.5.1 count COURSES with a failing grade; 11.5.2 counts failures in one course.
const literal = (f) => { const courses = Object.values(f).filter((n) => n >= 1).length, out = []; if (Object.values(f).some((n) => n >= 3)) out.push('E52'); if (courses >= 4) out.push('E51'); else if (courses >= 3 && !out.length) out.push('P41'); return out.join('+') || '-'; };
check('rules-reg-8', w({ a: 3 }) === 'E52' && w({ a: 1, b: 1, c: 1 }) === 'P41' && w({ a: 1, b: 1, c: 1, d: 1 }) === 'E51' && w({ a: 1, b: 1 }) === '-',
  '11.5.2 (3 failures in one course), 11.4.1 (3 courses), 11.5.1 (4 courses) fire at the right counts when each failed course failed once');
const diverge = [{ a: 2, b: 1 }, { a: 2, b: 2 }, { a: 2, b: 2, c: 1 }, { a: 2, b: 1, c: 1 }].map((f) => [JSON.stringify(f), w(f), literal(f)]).filter(([, g, l]) => g !== l);
bug('rules-1', diverge.length >= 2, `code counts failure EVENTS (rules.js:119-124: sum of counts) but 11.4.1/11.5.1 say "failing grade in N courses"; differences code vs literal-courses reading: ${diverge.map(([f, g, l]) => `${f} code=${g} literal=${l}`).join(' ; ')}`);

// ---------- Part A: what the warnings do NOT cover (limitations) ----------
{
  const data = load('2027-1', 30, 2026), ids = Object.keys(data.courses);
  const grades = Object.fromEntries(ids.slice(0, 20).map((i) => [i, 56])); // all 56: average far below 65 (11.4.2 probation)
  const r = classify(data, { passed: ids.slice(0, 20), failed: {}, grades, profile: { amirnet: null, year: 3 } });
  bug('rules-2', r.warnings.length === 0, `grade average 56 (<65, 11.4.2) and no 70% credits (11.4.4) give no warning: classify().warnings = ${JSON.stringify(r.warnings)}; only 11.4.1/11.5.1/11.5.2 are coded`);
}

// ---------- Part B: assert the facts against the PDF text (optional) ----------
if (process.argv.includes('--source')) {
  const URL_ = 'https://external.afeka.ac.il/media/mfnpt5or/תקנון-לימודים-תואר-ראשון-1.pdf';
  const tmp = fs.mkdtempSync(path.join(process.env.RULES_TMP ?? os.tmpdir(), 'rules-reg-'));
  let pdf = process.env.AFEKA_PDF, why = '';
  if (!pdf) {
    try { const res = await fetch(URL_, { signal: AbortSignal.timeout(30000) }); if (!res.ok) throw new Error('HTTP ' + res.status); pdf = path.join(tmp, 'takanon.pdf'); fs.writeFileSync(pdf, Buffer.from(await res.arrayBuffer())); } catch (e) { why = 'download failed: ' + e.message; }
  }
  let text = '';
  if (!why) {
    const out = path.join(tmp, 'raw.txt'), r = spawnSync('pdftotext', ['-raw', '-enc', 'UTF-8', pdf, out], { encoding: 'utf8' });
    if (r.error || r.status !== 0) why = 'pdftotext unavailable: ' + (r.error?.message ?? r.stderr);
    else text = fs.readFileSync(out, 'utf8');
  }
  if (why) info('Part B INCONCLUSIVE:', why);
  else {
    // pdftotext -raw returns each Hebrew word letter-reversed: reverse every Hebrew line, then restore digit/latin runs
    const lines = text.split(/\r?\n/).map((l) => (/[א-ת]/.test(l) ? [...l].reverse().join('').replace(/[0-9A-Za-z.\/()-]+/g, (m) => [...m].reverse().join('')) : l));
    const sec = (n, len = 14) => { const i = lines.findIndex((l) => l.trim() === n); return i < 0 ? '' : lines.slice(i, i + len).join(' ').replace(/\s+/g, ' '); };
    const has = (s, ...ps) => ps.every((p) => s.includes(p));
    check('rules-reg-9', lines.slice(0, 12).join(' ').includes('5/2/2026'), 'document header carries the update date 5/2/2026');
    check('rules-reg-10', has(sec('6.2.3'), 'קורס מקביל', 'לכל המאוחר'), '6.2.3 = "קורס מקביל ... לכל המאוחר" (the prerequisite is taught in the same semester at the latest)');
    check('rules-reg-11', has(sec('7.4'), 'קורס המשך', 'קורס הקדם'), '7.4 = no registration to a continuation course without passing the prerequisite');
    check('rules-reg-12', has(sec('11.4.1', 4), 'שלושה קורסים במצטבר'), '11.4.1 = "בשלושה קורסים במצטבר" (three COURSES, cumulative)');
    check('rules-reg-13', has(sec('11.5.1', 4), 'ארבעה קורסים'), '11.5.1 = "בארבעה קורסים ויותר במצטבר" (four or more COURSES)');
    check('rules-reg-14', has(sec('11.5.2', 16), 'פעמים בקורס', 'שלוש פעמים'), '11.5.2 = failed 3 times in a course; registering 3 times without a pass counts');
    check('rules-reg-15', has(sec('11.6', 4), 'על תנאי') && has(sec('11.6.1', 4), 'בהם נכשל'), '11.6 binds a student "במעמד על תנאי"; 11.6.1 = register next year to the failed courses (probation rule, NOT the general retake rule at rules.js:81)');
    check('rules-reg-16', has(sec('7.6', 3), 'חזרה על קורס'), '7.6 = definition of repeating a course (the general retake rule)');
    const t = lines.join(' ').replace(/\s+/g, ' ');
    const i = t.indexOf('חלוקה לרמות');
    const tbl = i < 0 ? '' : t.slice(i, i + 400);
    check('rules-reg-17', ['85', '99', '100', '119', '120', '133', '134'].every((n) => tbl.includes(n)) && has(tbl, 'בסיסי', 'פטור'), '6.2.7.8 table carries 85-99 / 100-119 / 120-133 / 134+ with בסיסי ... פטור');
  }
  fs.rmSync(tmp, { recursive: true, force: true });
} else info('Part B (source text) skipped: run with --source');
finish();
