// search-maxcredits.mjs
// WHAT: the credit cap (constraints.maxCredits). Lead: the solver tests it for truthiness, so a cap of 0 means "no cap".
//       The UI lets a student type 0 (input min=0, handler keeps n >= 0, normalize keeps v >= 0) and shows it back as "0".
// TARGETS: web/solver-core.js:352 (`constraints.maxCredits && credits + it.credits > constraints.maxCredits`),
//          web/ui-actions.js:232 (handler), web/app.js:38 (CONSTRAINT_OK.maxCredits), web/ui-drawer.js:49 (<input min="0" ... value="${c.maxCredits ?? ''}">).
//          searchYear: web/solver-core.js:419,452 pass `constraints` unchanged to both halves.
// RUN:   node solver-audit/repro/search-maxcredits.mjs
// OUTPUT: CHECK SMC-1..4 = the cap works for any positive value (boundary, fractional, multi-course) and the UI chain accepts 0;
//         BUG SMC-5 = a cap of 0 is silently ignored (plan with 3 credits returned); SMC-6 same on real data; CHECK SMC-7/8 year plan semantics.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { search, searchYear } from '../../web/solver-core.js';
import { realFiles, loadReal, Report } from './search-lib.mjs';

const R = new Report();
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const grp = (id, day, h) => ({ id, type: 'הרצאה', primary: true, lecturer: 'L' + id, full: false, semester: 'א', linked: [], meetings: [{ day, start: `${String(h).padStart(2, '0')}:00`, end: `${String(h).padStart(2, '0')}:50`, room: 'r' }], exams: [] });
const course = (id, credits, day, h) => ({ name: id, credits, offered: true, prereqs: [], groups: [grp('g' + id, day, h)] });
const mkData = (spec) => ({ semester: 'א', year: 2027, startYear: 2026, examsPublished: false, courses: Object.fromEntries(spec.map(([id, cr, d, h]) => [id, course(id, cr, d, h)])) });
const W = { friends: 0, progress: 3, freeDays: 0, compact: 0, timeWindow: 0, examSpread: 0 };
const run = (data, courses, constraints, extra = {}) => search({ data, courses, constraints, weights: W, friends: [], topK: 20, timeLimitMs: 1e9, ...extra });
const credits = (data, r) => r.courses.reduce((a, id) => a + data.courses[id].credits, 0);

// SMC-1: the UI chain really accepts 0 and keeps it (executes the handler / validator text taken from the source files)
const actions = fs.readFileSync(here('../../web/ui-actions.js'), 'utf8'), appSrc = fs.readFileSync(here('../../web/app.js'), 'utf8'), drawer = fs.readFileSync(here('../../web/ui-drawer.js'), 'utf8');
const handlerSrc = actions.match(/^\s*maxCredits: (\(el\) => \{.*\}),\s*$/m)?.[1];
const validSrc = appSrc.match(/^\s*maxCredits: (\(v\) => .*),\s*$/m)?.[1];
globalThis.app = { state: { constraints: {} } };
const handler = eval(handlerSrc);
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const valid = eval(validSrc);
handler({ value: '0' });
const typed = globalThis.app.state.constraints.maxCredits;
R.check('SMC-1 UI handler keeps a typed 0 as maxCredits=0 and normalize() accepts it', typed === 0 && valid(0) === true, `handler source: ${handlerSrc.slice(0, 110)}...; typed "0" -> ${JSON.stringify(typed)}; validator accepts 0: ${valid(0)}; input has min="0": ${/min="0"/.test(drawer.split('\n').find((l) => l.includes('data-chg="maxCredits"')))}; value="\${c.maxCredits ?? ''}" renders "0" for 0: ${(0 ?? '') === 0}`);

// SMC-2..4: cap works for positive values (boundary, fractional, several courses)
const d1 = mkData([['A', 3, 1, 9], ['B', 2, 2, 9], ['C', 0.5, 3, 9]]);
const all = (cap) => run(d1, [{ id: 'A', mode: 'optional' }, { id: 'B', mode: 'optional' }, { id: 'C', mode: 'optional' }], { maxCredits: cap });
const maxOf = (rs) => Math.max(...rs.results.map((r) => credits(d1, r)));
R.check('SMC-2 cap exactly equal to the sum is allowed (5.5 -> plan with 5.5 credits exists)', all(5.5).results.some((r) => credits(d1, r) === 5.5), `max credits under cap 5.5 = ${maxOf(all(5.5))}`);
R.check('SMC-3 fractional cap 5.4 excludes the 5.5-credit plan and never exceeds the cap', maxOf(all(5.4)) <= 5.4 && !all(5.4).results.some((r) => credits(d1, r) === 5.5), `max under 5.4 = ${maxOf(all(5.4))}`);
R.check('SMC-4 cap 0.5 allows only the 0.5-credit course (cap smaller than every other course)', all(0.5).results.length === 1 && all(0.5).results[0].courses.join() === 'C', `results=${JSON.stringify(all(0.5).results.map((r) => r.courses))}`);

// SMC-5: the lead
const d2 = mkData([['A', 3, 1, 9], ['Z', 0, 2, 9]]); // one 3-credit course, one 0-credit course (like the English prep levels)
const r0 = run(d2, [{ id: 'A', mode: 'optional' }, { id: 'Z', mode: 'optional' }], { maxCredits: 0 });
const got = r0.results.map((r) => ({ courses: r.courses, credits: credits(d2, r) }));
R.bug('SMC-5 maxCredits=0 is treated as "no cap" (expected: only 0-credit plans)', got.some((g) => g.credits > 0), `plans returned with cap 0: ${JSON.stringify(got)}; with cap null the same: ${JSON.stringify(run(d2, [{ id: 'A', mode: 'optional' }, { id: 'Z', mode: 'optional' }], { maxCredits: null }).results.length)} plans`);
const mustA = run(d2, [{ id: 'A', mode: 'must' }], { maxCredits: 0 });
R.bug('SMC-5b a must 3-credit course under cap 0 is still scheduled (expected: no plan + a diagnosis)', mustA.results.length > 0, `results=${mustA.results.length}, credits of plan=${mustA.results[0] ? credits(d2, mustA.results[0]) : '-'}`);

// SMC-6: same on real data (a 0-credit English level exists in the data)
let real = null;
for (const f of realFiles('2027-1')) { const d = loadReal('2027-1', f); const id = Object.keys(d.courses).find((x) => d.courses[x].credits > 0 && d.courses[x].offered && d.courses[x].prereqs.length === 0); if (id) { real = [f, d, id]; break; } }
const [rf, rd, rid] = real;
const rr = search({ data: rd, courses: [{ id: rid, mode: 'must' }], constraints: { maxCredits: 0 }, weights: W, topK: 3, timeLimitMs: 1e9 });
R.bug('SMC-6 real data: 2027-1/' + rf + ' must course ' + rid + ' (' + rd.courses[rid].credits + ' credits) planned under maxCredits=0', rr.results.length > 0, `results=${rr.results.length}, groups=${rr.results[0]?.groups}`);

// SMC-7: every credit value in the committed data is a multiple of 0.5, so float sums are exact (a float cap issue cannot occur with real data)
const seen = new Set();
for (const sem of ['2027-1', '2027-2', '2027-3']) for (const f of realFiles(sem)) for (const c of Object.values(loadReal(sem, f).courses)) seen.add(c.credits);
R.check('SMC-7 all real credit values are multiples of 0.5 (float sums exact)', [...seen].every((c) => Number.isInteger(c * 2)), `distinct credit values: ${[...seen].sort((a, b) => a - b).join(',')}`);

// SMC-8: in a year plan the same cap applies to each semester separately (constraints go to both search() calls)
const dA = { ...mkData([['A', 3, 1, 9], ['B', 3, 2, 9]]), semester: 'א' }, dB = { ...mkData([['A', 3, 1, 9], ['B', 3, 2, 9]]), semester: 'ב' };
for (const d of [dA, dB]) for (const c of Object.values(d.courses)) c.semesters = [d.semester];
const stateY = { passed: [], failed: {}, profile: {}, choices: { A: 'must', B: 'must' }, semesterOf: { A: 'א', B: 'ב' } };
const yr = searchYear({ dataA: dA, dataB: dB, state: stateY, yearList: new Set(['A', 'B']), constraints: { maxCredits: 3 }, weights: W, friends: [], topK: 3, timeLimitMs: 2000 });
const y0 = yr.results[0];
R.check('SMC-8 year plan: cap 3 is applied per semester (3 credits in each half, 6 for the year)', !!y0 && y0.credits.a === 3 && y0.credits.b === 3 && y0.missing.length === 0, `credits ${JSON.stringify(y0?.credits)} missing ${JSON.stringify(y0?.missing)} (UI label: "תקרת נ״ז", no "per semester" wording in web/ui-drawer.js:49)`);
R.done();
