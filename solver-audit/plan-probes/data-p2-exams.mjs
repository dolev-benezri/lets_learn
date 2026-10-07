// Probe 2: exam parsing end to end: parse.mjs parseExams -> build.mjs attaches g.exams -> solver-core.js reads o.exams (e.date, kind 'בחינה', moed 1).
// Run: node solver-audit/plan-probes/data-p2-exams.mjs
import fs from 'node:fs';
import { parseExams } from '../../scripts/parse.mjs';
import { buildDataset } from '../../scripts/build.mjs';
import { buildOptions } from '../../web/solver-core.js';
const fx = (f) => fs.readFileSync(new URL(`../../scripts/fixtures/${f}`, import.meta.url), 'utf8');
const rows = parseExams(fx('exams-2026.html'));
console.log(`INFO fixture exams-2026.html: ${rows.length} rows; first: ${JSON.stringify(rows[0])}`);
// field names produced by the scraper, then read by the solver
const c = rows[0];
const lists = [{ code: 1, name: 'חובה', minCredits: 0, courses: [{ id: c.courseId, name: 'x' }] }];
const raw = { [c.courseId]: { groups: [{ id: '1', type: 'סופי-הרצאה', primary: true, lecturer: c.lecturer, full: false, linked: [], detailsArgs: null, meetings: [{ semester: c.semester, day: 1, start: '08:00', end: '09:50', room: '' }] }], details: { credits: 3, prereqs: [] } } };
const d = buildDataset({ year: 2026, startYear: 2025, program: 1, semester: c.semester, department: 'x', lists, raw, exams: rows, fetchedAt: 'now', specializations: [], degree: {} });
const g = d.courses[c.courseId].groups[0];
console.log('INFO built group exams:', JSON.stringify(g.exams.slice(0, 3)), 'examsPublished', d.examsPublished);
const opt = buildOptions(d.courses[c.courseId])[0];
console.log('INFO solver option.exams (moed-1 "בחינה" dates):', JSON.stringify(opt.exams), 'allExams.length', opt.allExams.length);
console.log(`CHECK P2-fields ${opt.exams.length > 0 && opt.exams.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)) ? 'PASS' : 'FAIL'} scraper field g.exams[].date (ISO) is the field solver-core.js:93 reads`);
const committed = ['2027-1', '2027-2', '2027-3'].flatMap((s) => fs.readdirSync(new URL(`../../web/data/afeka/${s}/`, import.meta.url)).map((f) => `${s}/${f}`));
let n = 0, pub = 0; for (const f of committed) { const x = JSON.parse(fs.readFileSync(new URL(`../../web/data/afeka/${f}`, import.meta.url), 'utf8')); if (x.examsPublished) pub++; for (const k of Object.values(x.courses)) for (const gg of k.groups) n += gg.exams.length; }
console.log(`INFO committed data: exam entries ${n}, files with examsPublished ${pub}`);
