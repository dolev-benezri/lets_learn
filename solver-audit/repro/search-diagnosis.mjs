// search-diagnosis.mjs
// WHAT: are the diagnosis messages of search() true? The text is shown to the student when no plan exists (web/ui-view.js:94-98).
// TARGETS: web/solver-core.js:232-245 (diagnose), 364-368 (maxDays re-search), 369-372 (timed-out + diagnose call), 235-236 (must without options), 238-241 (clash pair).
// METHOD: (a) hand-built instances, one cause each; (b) relaxation oracle: for hundreds of random INFEASIBLE instances the independent
//         reference tells which single relaxations make the instance feasible, and each message is checked against that.
// RUN:   node solver-audit/repro/search-diagnosis.mjs
// OUTPUT: CHECK = message is true / names the real cause; BUG = message blames the wrong thing (details + counts on the line).
import { search } from '../../web/solver-core.js';
import { mulberry32, genInstance, referenceSolve, Report } from './search-lib.mjs';

const R = new Report();
const grp = (id, day, h, o = {}) => ({ id, type: 'הרצאה', primary: true, lecturer: 'L' + id, full: !!o.full, semester: 'א', linked: [], meetings: [{ day, start: `${String(h).padStart(2, '0')}:00`, end: `${String(h).padStart(2, '0')}:50`, room: 'r' }], exams: o.exam ? [{ kind: 'בחינה', moed: 1, date: o.exam, time: null }] : [] });
const course = (id, credits, groups) => ({ name: 'קורס-' + id, credits, offered: true, prereqs: [], groups });
const mk = (courses, examsPublished = false) => ({ semester: 'א', year: 2027, startYear: 2026, examsPublished, courses });
const W = { friends: 0, progress: 3, freeDays: 1, compact: 1, timeWindow: 1, examSpread: 0 };
const S = (data, courses, constraints = {}, extra = {}) => search({ data, courses, constraints, weights: W, friends: [], topK: 5, timeLimitMs: 1e9, ...extra });
const GENERIC = 'אין מערכת שעומדת בכל האילוצים יחד';
const must = (...ids) => ids.map((id) => ({ id, mode: 'must' }));
const opt = (...ids) => ids.map((id) => ({ id, mode: 'optional' }));

// D1 must without options (every group full)
let d = mk({ A: course('A', 3, [grp('a1', 1, 9, { full: true })]), B: course('B', 3, [grp('b1', 2, 9)]) });
let r = S(d, must('A', 'B'));
R.check('SD-1 must course with only full groups: message names it and lists full groups', r.results.length === 0 && r.diagnosis.length === 1 && r.diagnosis[0].includes('קורס-A') && r.diagnosis[0].includes('קבוצות מלאות'), JSON.stringify(r.diagnosis));
// D2 busy block is the cause -> "זמן תפוס" named; hard day-off is the cause -> not named
r = S(d, must('B'), { blocks: [{ day: 2, start: '09:00', end: '10:00', label: 'x' }] });
R.check('SD-2a busy block causes it: message contains "זמן תפוס"', r.results.length === 0 && r.diagnosis[0].includes('זמן תפוס'), JSON.stringify(r.diagnosis));
r = S(d, must('B'), { dayOff: [2], dayOffHard: true });
R.check('SD-2b hard day off causes it: message is the generic list (no "זמן תפוס"), mentions "חסימות אישיות"', r.results.length === 0 && !r.diagnosis[0].includes('זמן תפוס') && r.diagnosis[0].includes('חסימות אישיות'), JSON.stringify(r.diagnosis));
// D3 two musts that always clash
d = mk({ A: course('A', 3, [grp('a1', 1, 9), grp('a2', 1, 10)]), B: course('B', 3, [grp('b1', 1, 9), grp('b2', 1, 10)]) });
d.courses.A.groups[0].meetings.push({ day: 1, start: '10:00', end: '10:50', room: 'r' }); // a1 covers 9 and 10
d.courses.A.groups[1].meetings.push({ day: 1, start: '09:00', end: '09:50', room: 'r' }); // a2 covers 9 and 10 as well
d.courses.B.groups[0].meetings.push({ day: 1, start: '10:00', end: '10:50', room: 'r' });
d.courses.B.groups[1].meetings.push({ day: 1, start: '09:00', end: '09:50', room: 'r' });
r = S(d, must('A', 'B'));
R.check('SD-3 two musts clashing in every combination: message names both', r.results.length === 0 && r.diagnosis.length === 1 && r.diagnosis[0].includes('קורס-A') && r.diagnosis[0].includes('קורס-B') && r.diagnosis[0].includes('מתנגשים'), JSON.stringify(r.diagnosis));
// D4 maxDays cap
d = mk({ A: course('A', 3, [grp('a1', 1, 9)]), B: course('B', 3, [grp('b1', 2, 9)]) });
r = S(d, must('A', 'B'), { maxDays: 1 });
const noCap = S(d, must('A', 'B'), { maxDays: null });
R.check('SD-4 maxDays too small for the musts: the cap is named (re-search without cap really finds a plan)', r.results.length === 0 && r.diagnosis.length === 1 && r.diagnosis[0].includes('תקרת יום אחד') && noCap.results.length > 0, JSON.stringify(r.diagnosis));
// D5 all optional, maxDays too small: the message talks about "קורסי החובה" though no course is must
r = S(d, opt('A', 'B'), { maxDays: 1 });
const d5 = mk({ A: course('A', 3, [grp('a1', 1, 9)]), B: course('B', 3, [grp('b1', 2, 9)]) });
d5.courses.A.groups[0].meetings.push({ day: 3, start: '09:00', end: '09:50', room: 'r' }); // every option of A spans 2 days
d5.courses.B.groups[0].meetings.push({ day: 4, start: '09:00', end: '09:50', room: 'r' });
r = S(d5, opt('A', 'B'), { maxDays: 1 });
R.bug('SD-5 all-optional + maxDays too small: message says "must courses" although none is must', r.results.length === 0 && r.diagnosis[0]?.includes('לקורסי החובה'), JSON.stringify(r.diagnosis));
// D6 credit cap cause, D7 parallel cause, D8 exam cause: generic message must at least name that cause
d = mk({ A: course('A', 3, [grp('a1', 1, 9)]), B: course('B', 3, [grp('b1', 2, 9)]) });
r = S(d, must('A', 'B'), { maxCredits: 4 });
// 2026-10-07 (stage 6, issue #6): the cause is named on its own, no longer inside the generic list
R.check('SD-6 credit cap is the cause: the message names "תקרת נ"ז"', r.results.length === 0 && r.diagnosis[0].includes('תקרת נ"ז'), JSON.stringify(r.diagnosis));
r = S(d, must('A'), {}, { statuses: { A: { status: 'conditional', reasons: [], missingParallel: [['B']] } } });
R.check('SD-7 parallel course not offered as candidate is the cause: generic message names "קורס מקביל"', r.results.length === 0 && r.diagnosis[0].includes('קורס מקביל'), JSON.stringify(r.diagnosis));
d = mk({ A: course('A', 3, [grp('a1', 1, 9, { exam: '2027-02-01' })]), B: course('B', 3, [grp('b1', 2, 9, { exam: '2027-02-01' })]) }, true);
r = S(d, must('A', 'B'), { examsSameDay: 'forbid' });
R.check('SD-8 same-day exams are the cause: generic message names "בחינות באותו יום"', r.results.length === 0 && r.diagnosis[0].includes('בחינות באותו יום'), JSON.stringify(r.diagnosis));
// D9 all optional and every option filtered by something else (full groups / hard day off / busy time): generic message blames exams/credit cap/parallel
d = mk({ A: course('A', 3, [grp('a1', 1, 9, { full: true })]), B: course('B', 3, [grp('b1', 1, 11)]) });
r = S(d, opt('A', 'B'), { dayOff: [1], dayOffHard: true });
const fix = S(d, opt('A', 'B'), { dayOff: [], dayOffHard: false });
R.bug('SD-9 all-optional, every option removed by a hard day off: message blames exams / credit cap / parallel course', r.results.length === 0 && r.diagnosis[0].startsWith(GENERIC) && fix.results.length > 0, `${JSON.stringify(r.diagnosis)} ; without the hard day off a plan exists (${fix.results.length} results)`);
d = mk({ A: course('A', 3, [grp('a1', 1, 9, { full: true })]), B: course('B', 3, [grp('b1', 2, 9, { full: true })]) });
r = S(d, opt('A', 'B'), { includeFull: false });
R.bug('SD-9b all-optional, every group is full: message blames exams / credit cap / parallel course (full groups are never mentioned)', r.results.length === 0 && r.diagnosis[0].startsWith(GENERIC) && !r.diagnosis[0].includes('מלא'), JSON.stringify(r.diagnosis));
// D10 pigeonhole: three musts, each can be at 09:00 or 10:00 on the same day. Every pair fits, no triple does -> generic message
d = mk(Object.fromEntries(['A', 'B', 'C'].map((id) => [id, course(id, 3, [grp(id.toLowerCase() + '1', 1, 9), grp(id.toLowerCase() + '2', 1, 10)])])));
r = S(d, must('A', 'B', 'C'));
const pair = S(d, must('A', 'B'));
R.bug('SD-10 three musts, every pair compatible but no joint plan: message blames exams / credit cap / parallel course', r.results.length === 0 && pair.results.length > 0 && r.diagnosis[0].startsWith(GENERIC), `${JSON.stringify(r.diagnosis)} ; any two of them fit (${pair.results.length} plans)`);

// D11 timed out: nothing found before the clock ran out
const big = {};
for (let i = 0; i < 16; i++) big['K' + i] = course('K' + i, 3, [grp('k' + i, 1 + (i % 5), 8 + (i % 8))]);
const bigData = mk(big);
const st = Object.fromEntries(Object.keys(big).map((id) => [id, { status: 'conditional', reasons: [], missingParallel: [['NOPE']] }]));
r = search({ data: bigData, courses: opt(...Object.keys(big)), statuses: st, constraints: {}, weights: W, friends: [], topK: 3, timeLimitMs: 0 });
R.check('SD-11 nothing found before the time limit: partial=true and the "stopped by time limit" message', r.partial === true && r.results.length === 0 && r.diagnosis[0].startsWith('החיפוש נעצר'), JSON.stringify({ partial: r.partial, diag: r.diagnosis }));

// ---- relaxation oracle on random infeasible instances ----
const relax = {
  noCap: (i) => ({ ...i, constraints: { ...i.constraints, maxCredits: null } }),
  noDays: (i) => ({ ...i, constraints: { ...i.constraints, maxDays: null } }),
  allowExams: (i) => ({ ...i, constraints: { ...i.constraints, examsSameDay: 'allow' } }),
  noParallel: (i) => ({ ...i, statuses: {} }),
  noBlocks: (i) => ({ ...i, constraints: { ...i.constraints, blocks: [] } }),
  noHard: (i) => ({ ...i, constraints: { ...i.constraints, dayOffHard: false, windowHard: false } }),
  fullOk: (i) => ({ ...i, constraints: { ...i.constraints, includeFull: true } }),
  noPins: (i) => ({ ...i, pins: [] }),
  allOptional: (i) => ({ ...i, courses: i.courses.map((c) => ({ ...c, mode: 'optional' })), pins: [] }),
};
const feasible = (i) => referenceSolve(i).sols.length > 0;
// stage 6: one message per relaxation search() tries; each must be true (that relaxation alone gives a plan)
const NAMED = [['קבוצה מלאה. סמנו', 'fullOk'], ['יום החופש או השעות', 'noHard'], ['הזמן התפוס', 'noBlocks'], ['תקרת נ"ז נמוכה', 'noCap'], ['שתי בחינות באותו יום', 'allowExams'],
  ['קורס מקביל שלא נכנס', 'noParallel']];
let named = 0, namedWrong = 0, together = 0, togetherWrong = 0;
let infeasible = 0, generic = 0, genericWrong = 0, genericExamples = [], capMsg = 0, capMsgWrong = 0, noOptMsg = 0, noOptWrong = 0, clashMsg = 0, clashWrong = 0, timed = 0, emptyMsg = 0;
const causes = {};
for (let seed = 1; seed <= 1500; seed++) {
  const inst = genInstance(mulberry32(seed * 31337), { examsPublished: true });
  const ref = referenceSolve(inst);
  if (ref.sols.length) continue;
  infeasible++;
  const out = search({ ...inst, timeLimitMs: 1e9 });
  if (out.results.length) { R.check('SD-12 search found a plan the reference says does not exist', false, `seed ${seed}`); break; }
  if (!out.diagnosis.length) emptyMsg++;
  for (const m of out.diagnosis) {
    if (m.startsWith('החיפוש נעצר')) timed++;
    else if (m.includes('לא מקושרת')) continue; // F-01, comes with the must-no-options line
    else if (NAMED.some(([t]) => m.includes(t))) { named++; if (!feasible(relax[NAMED.find(([t]) => m.includes(t))[1]](inst))) namedWrong++; }
    else if (m.startsWith('קורסי החובה לא נכנסים') || m.startsWith('שום צירוף')) { together++; if (NAMED.some(([, k]) => feasible(relax[k](inst)))) togetherWrong++; }
    else if (m.startsWith('תקרת') && m.includes('בקמפוס')) { capMsg++; if (!feasible(relax.noDays(inst))) capMsgWrong++; }
    else if (m.includes('אין קבוצה שמתאימה')) { noOptMsg++; const name = m.split(':')[0]; const it = ref.items.find((x) => inst.data.courses[x.id].name === name); if (!(it && it.mode === 'must' && it.options.length === 0)) noOptWrong++; }
    else if (m.includes('מתנגשים')) { clashMsg++; }
    else if (m.startsWith(GENERIC)) {
      generic++;
      // the message claims the cause is among: same-day exams, credit cap, parallel course. Relax all three at once.
      const three = relax.noParallel(relax.allowExams(relax.noCap(inst)));
      if (!feasible(three)) {
        genericWrong++;
        const real = Object.entries(relax).filter(([, f]) => feasible(f(inst))).map(([k]) => k);
        const key = real.join('+') || 'none-single';
        causes[key] = (causes[key] ?? 0) + 1;
        if (genericExamples.length < 3) genericExamples.push({ seed, singleRelaxationsThatFix: real });
      }
    }
  }
}
R.info(`oracle: infeasible instances=${infeasible}; messages: generic=${generic}, cap=${capMsg}, must-no-options=${noOptMsg}, clash=${clashMsg}, timed-out=${timed}, empty-diagnosis=${emptyMsg}`);
R.info(`stage 6 messages: named cause=${named}, "do not fit together"=${together}`);
R.check('SD-17 a message that names one constraint is true: relaxing that constraint alone gives a plan', namedWrong === 0, `${named} messages, ${namedWrong} wrong`);
R.check('SD-18 "the courses do not fit together" only when no single relaxation gives a plan', togetherWrong === 0, `${together} messages, ${togetherWrong} wrong`);
R.check('SD-13 the "maxDays too small" message is true on every random infeasible instance (re-search without the cap is feasible)', capMsgWrong === 0, `${capMsg} messages, ${capMsgWrong} wrong`);
R.check('SD-14 "no group fits" messages always name a must course that really has no option left', noOptWrong === 0, `${noOptMsg} messages, ${noOptWrong} wrong`);
R.check('SD-15 infeasible results always carry a non-empty diagnosis', emptyMsg === 0, `${emptyMsg} empty`);
R.bug('SD-16 generic message ("exams same day, credit cap or parallel course") shown although relaxing all three still leaves no plan', genericWrong > 0, `${genericWrong}/${generic} generic messages are misleading; what a single relaxation would have fixed: ${JSON.stringify(causes)}; examples ${JSON.stringify(genericExamples)}`);
R.done();
