import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset, validate, normLecturer, compareToPrevious } from '../scripts/build.mjs';

const g = (id, extra = {}) => ({ id, type: 'סופי-הרצאה+תרגול', primary: true, lecturer: 'ד"ר שמעון מאיר', full: false,
  linked: [], meetings: [{ semester: 'א', day: 2, start: '12:00', end: '13:50', room: 'r' }], detailsArgs: null, ...extra });

const base = () => ({
  year: 2027, startYear: 2026, program: 30, semester: 'א', department: 'מכנית', fetchedAt: '2026-10-01T00:00:00Z',
  lists: [
    { code: 30001, name: "קורסי חובה שנה א'", minCredits: 10, courses: [{ id: '90903', name: 'פיזיקה-מכניקה', offered: true }] },
    { code: 30002, name: "קורסי חובה שנה ב'", minCredits: 10, courses: [
      { id: '20816', name: 'מעבדה בפיזיקה', offered: true },
      { id: '90903', name: 'פיזיקה-מכניקה', offered: true } ] },
  ],
  raw: {
    '90903': { groups: [
      g('279090303', { linked: ['279090303/1', '279090303/9'] }),
      g('279090303/1', { type: 'תרגול', primary: false, lecturer: 'מר א' }),
      g('279090399', { meetings: [{ semester: 'ב', day: 1, start: '08:00', end: '09:50', room: 'r' }] }),
    ], details: { credits: 5, prereqs: [{ kind: 'קדם', population: '', names: ['קורס הכנה פיזיקה'] }] } },
    '20816': { groups: [g('272081601', { lecturer: 'ד"ר אחר' })], details: { credits: 1, prereqs: [
      { kind: 'קדם', population: '', names: ['פיזיקה-מכניקה'] },
      { kind: 'קדם', population: 'מחלקה : הנדסת חשמל', names: ['משהו'] },
    ] } },
  },
  exams: [
    { semester: 'א', courseId: '90903', lecturer: 'ד"ר שמעון מאיר', kind: 'בחינה', moeds: [{ moed: 1, date: '2027-02-04', time: '09:00' }] },
    { semester: 'א', courseId: '20816', lecturer: 'ד"ר לא קיים', kind: 'בחינה', moeds: [{ moed: 1, date: '2027-02-10', time: '09:00' }] },
    { semester: 'ב', courseId: '90903', lecturer: 'ד"ר שמעון מאיר', kind: 'בחינה', moeds: [{ moed: 1, date: '2027-07-01', time: '09:00' }] },
  ],
});

test('normLecturer strips titles and quotes', () => {
  assert.equal(normLecturer('ד"ר שמעון מאיר'), 'שמעון מאיר');
  assert.equal(normLecturer('ד&quot;ר  שמעון מאיר'.replace('&quot;', '"')), 'שמעון מאיר');
  assert.equal(normLecturer('מר שפירא יובל'), 'שפירא יובל');
});

test('buildDataset dedupes courses, keeps only the target semester, drops dangling links', () => {
  const d = buildDataset(base());
  assert.deepEqual(Object.keys(d.courses).sort(), ['20816', '90903']);
  assert.deepEqual(d.lists[1].courses, ['20816', '90903']);
  const phys = d.courses['90903'];
  assert.deepEqual(phys.groups.map((x) => x.id), ['279090303', '279090303/1']);
  assert.deepEqual(phys.groups[0].linked, ['279090303/1']);
  assert.equal(phys.groups[0].semester, 'א');
  assert.equal(phys.credits, 5);
  assert.equal(phys.offered, true);
  assert.deepEqual(phys.groups[0].meetings[0], { day: 2, start: '12:00', end: '13:50', room: 'r' });
});

test('buildDataset resolves prereq names to ids, keeps unknown names as id:null, filters other departments', () => {
  const d = buildDataset(base());
  assert.deepEqual(d.courses['90903'].prereqs, [{ kind: 'קדם', anyOf: [{ id: null, name: 'קורס הכנה פיזיקה' }] }]);
  assert.deepEqual(d.courses['20816'].prereqs, [{ kind: 'קדם', anyOf: [{ id: '90903', name: 'פיזיקה-מכניקה' }] }]);
});

test('buildDataset attaches exams by lecturer, falls back to course level, ignores other semesters', () => {
  const d = buildDataset(base());
  assert.equal(d.examsPublished, true);
  assert.deepEqual(d.courses['90903'].groups[0].exams, [{ kind: 'בחינה', moed: 1, date: '2027-02-04', time: '09:00' }]);
  assert.deepEqual(d.courses['90903'].groups[1].exams, []); // tutorials carry no exams
  assert.deepEqual(d.courses['20816'].groups[0].exams, [{ kind: 'בחינה', moed: 1, date: '2027-02-10', time: '09:00' }]);
});

const ANCHOR = { course: '90903', name: 'פיזיקה-מכניקה', minPrimaryGroups: 3 };
test('validate flags a too-small dataset and a missing anchor course', () => {
  const d = buildDataset(base());
  const { errors } = validate(d, null, ANCHOR);
  assert.ok(errors.some((e) => e.includes('40')));
  delete d.courses['90903'];
  assert.ok(validate(d, null, ANCHOR).errors.some((e) => e.includes('90903')));
});

test('validate: the anchor course comes from the program config, none means no anchor check', () => {
  const d = healthy();
  assert.deepEqual(validate(d, null, ANCHOR).errors, []);
  assert.ok(validate(d, null, { ...ANCHOR, minPrimaryGroups: 4 }).errors.some((e) => e.includes('fewer than 4')));
  assert.ok(validate(d, null, { course: '20000', name: 'other', minPrimaryGroups: 1 }).errors.length === 0, 'another program picks its own course');
  delete d.courses['90903'];
  assert.deepEqual(validate(d).errors, [], 'no anchor given: nothing to demand');
});

test('validate warns for courses with 0 credits', () => {
  const d = buildDataset(base());
  d.courses['20816'].credits = 0;
  const { warnings } = validate(d);
  assert.ok(warnings.some((w) => w.includes('20816') && w.includes('0 credits')));
});

test('buildDataset exam fallback applies per kind: matched midterm + unmatched final both attach', () => {
  const input = base();
  input.exams = [
    { semester: 'א', courseId: '90903', lecturer: 'ד"ר שמעון מאיר', kind: 'בוחן אמצע', moeds: [{ moed: 1, date: '2027-01-20', time: '10:00' }] },
    { semester: 'א', courseId: '90903', lecturer: 'ד"ר אחר לגמרי', kind: 'בחינה', moeds: [{ moed: 1, date: '2027-02-04', time: '09:00' }] },
  ];
  const d = buildDataset(input);
  const exams = d.courses['90903'].groups[0].exams;
  assert.ok(exams.some((e) => e.kind === 'בוחן אמצע'));
  assert.ok(exams.some((e) => e.kind === 'בחינה'));
});

test('buildDataset drops prerequisites with empty names', () => {
  const input = base();
  input.raw['90903'].details.prereqs.push({ kind: 'קדם', population: '', names: [] });
  const d = buildDataset(input);
  assert.deepEqual(d.courses['90903'].prereqs.length, 1);
  assert.ok(d.courses['90903'].prereqs[0].anyOf.some((p) => p.name === 'קורס הכנה פיזיקה'));
});

test('buildDataset warns about primary groups dropped for having no meetings', () => {
  const b = base();
  b.raw['20816'].groups.push(g('272081699', { meetings: [] }));
  const warnings = [];
  const d = buildDataset({ ...b, warnings });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /20816.*272081699/);
  assert.deepEqual(d.courses['20816'].groups.map((x) => x.id), ['272081601']);
});

test('compareToPrevious accepts no previous data', () => {
  const d = buildDataset(base());
  const { errors } = compareToPrevious(null, d);
  assert.equal(errors.length, 0);
});

test('compareToPrevious detects course count drop > 10%', () => {
  const prev = buildDataset(base());
  const next = buildDataset(base());
  // Remove one course from 2 (50% drop) > 10% threshold
  delete next.courses['20816'];
  const { errors } = compareToPrevious(prev, next);
  assert.ok(errors.some((e) => e.includes('course count dropped')));
  assert.ok(errors.some((e) => e.includes('50.0%')));
});

test('compareToPrevious allows course count drop <= 10%', () => {
  const prev = buildDataset(base());
  const next = buildDataset(base());
  // For a 2-course dataset, 10% drop would require 0.2 courses, so we can't drop exactly 10%
  // but we can verify that a small drop is allowed (e.g., 0%)
  const { errors } = compareToPrevious(prev, next);
  assert.equal(errors.length, 0);
});

test('compareToPrevious detects offered-course count drop > 20%', () => {
  const prev = buildDataset(base());
  // Mark both courses as offered
  prev.courses['90903'].offered = true;
  prev.courses['20816'].offered = true;
  const next = buildDataset(base());
  // Mark one as not offered (50% drop of offered) > 20% threshold
  next.courses['20816'].offered = false;
  const { errors } = compareToPrevious(prev, next);
  assert.ok(errors.some((e) => e.includes('offered-course count dropped')));
  assert.ok(errors.some((e) => e.includes('50.0%')));
});

test('compareToPrevious allows offered-course count drop <= 20%', () => {
  const prev = buildDataset(base());
  // Mark both as offered
  prev.courses['90903'].offered = true;
  prev.courses['20816'].offered = true;
  const next = buildDataset(base());
  // Keep both offered, no drop
  next.courses['90903'].offered = true;
  next.courses['20816'].offered = true;
  const { errors } = compareToPrevious(prev, next);
  assert.equal(errors.length, 0);
});

test('compareToPrevious detects group count drop > 25%', () => {
  const prev = buildDataset(base());
  // prev has 4 groups total (2 for 90903, 1 for 20816, minus semester filter)
  const next = buildDataset(base());
  // Remove a group from one course (drop multiple groups)
  next.courses['90903'].groups = next.courses['90903'].groups.slice(0, 1);
  const { errors } = compareToPrevious(prev, next);
  assert.ok(errors.some((e) => e.includes('group count dropped')));
});

test('compareToPrevious allows group count drop <= 25%', () => {
  const prev = buildDataset(base());
  const next = buildDataset(base());
  // No groups removed, no drop
  const { errors } = compareToPrevious(prev, next);
  assert.equal(errors.length, 0);
});

test('compareToPrevious thresholds: a drop at the limit passes, one step past it is refused', () => {
  const bare = { linked: [], meetings: [], exams: [] };
  const sized = (n, offered = n) => ({ courses: Object.fromEntries(Array.from({ length: n }, (_, i) => [`c${i}`, { offered: i < offered, groups: [{ ...bare }] }])) });
  const groups = (n) => ({ courses: { c: { offered: true, groups: Array.from({ length: n }, () => ({ ...bare })) } } });
  const refused = (prev, next, what) => compareToPrevious(prev, next).errors.some((e) => e.includes(what));
  assert.equal(refused(sized(10), sized(9), 'course count'), false); // 10% exactly
  assert.equal(refused(sized(10), sized(8), 'course count'), true);
  assert.equal(refused(sized(10), sized(10, 8), 'offered-course'), false); // 20% exactly
  assert.equal(refused(sized(10), sized(10, 7), 'offered-course'), true);
  assert.equal(refused(groups(4), groups(3), 'group count'), false); // 25% exactly
  assert.equal(refused(groups(8), groups(5), 'group count'), true);
});

// ---- field health ----
const healthy = () => {
  const mk = (id) => ({ name: id, credits: 3, offered: true, prereqs: [{ kind: 'קדם', anyOf: [{ id: null, name: 'x' }] }],
    groups: [{ id: `${id}01`, primary: true, full: false, linked: [], meetings: [{ day: 2, start: '08:00', end: '09:50', room: 'r' }],
      exams: [{ kind: 'בחינה', moed: 1, date: '2027-02-04', time: '09:00' }] }] });
  const courses = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [String(20000 + i), mk(String(20000 + i))]));
  courses['90903'] = mk('90903');
  courses['90903'].groups = [1, 2, 3].map((n) => ({ ...courses['20000'].groups[0], id: `9090${n}` }));
  return { year: 2027, startYear: 2026, examsPublished: true, lists: [], courses };
};

test('validate: a healthy synthetic dataset has no errors', () => assert.deepEqual(validate(healthy()).errors, []));

test('validate: meetings with day === null are an error', () => {
  const d = healthy();
  d.courses['20001'].groups[0].meetings[0].day = null;
  assert.ok(validate(d).errors.some((e) => e.includes('day')));
});

test('validate: at most 90% of offered courses having credits is an error', () => {
  const d = healthy();
  const ids = Object.keys(d.courses);
  for (const id of ids.slice(0, 6)) d.courses[id].credits = 0; // 6 of 51 = 11.8% without credits
  assert.ok(validate(d).errors.some((e) => e.includes('credits')));
  d.courses[ids[0]].credits = d.courses[ids[1]].credits = d.courses[ids[2]].credits = 3; // 3 of 51 = 5.9%
  assert.ok(!validate(d).errors.some((e) => e.includes('credits')));
});

test('validate: prerequisite count must stay within ±20% of the previous file', () => {
  const prev = healthy(), d = healthy();
  assert.deepEqual(validate(d, prev).errors, []);
  for (const id of Object.keys(d.courses).slice(0, 11)) d.courses[id].prereqs = []; // 51 -> 40 is -21.6%
  assert.ok(validate(d, prev).errors.some((e) => e.includes('prerequisite')));
  assert.ok(!validate(d).errors.some((e) => e.includes('prerequisite')), 'without a previous file there is nothing to compare');
});

test('validate: the prerequisite check compares only courses in both files, so new courses do not trip it', () => {
  const prev = healthy(), d = healthy();
  for (let i = 0; i < 60; i++) d.courses[`3${i}000`] = { ...d.courses['20000'], prereqs: [{ kind: 'קדם', anyOf: [{ id: null, name: 'x' }] }, { kind: 'קדם', anyOf: [{ id: null, name: 'y' }] }] };
  assert.deepEqual(validate(d, prev).errors, []); // 51 -> 171 prerequisite groups, but none changed in the shared courses
  for (const id of Object.keys(prev.courses).slice(0, 11)) d.courses[id].prereqs = [];
  assert.ok(validate(d, prev).errors.some((e) => e.includes('prerequisite')), 'a real regression in shared courses is still caught');
});

test('validate: summer is checked lightly (no size or 90903) but needs a scheduled course and healthy fields', () => {
  const summer = (n) => ({ year: 2027, semester: 'קיץ', examsPublished: false, lists: [], courses: Object.fromEntries(Array.from({ length: n }, (_, i) => [`3${i}`, { name: 'x', credits: 3, offered: true, prereqs: [], groups: [{ id: `g${i}`, primary: true, linked: [], meetings: [{ day: 2, start: '08:00', end: '09:50', room: 'r' }], exams: [] }] }])) });
  assert.deepEqual(validate(summer(3)).errors, []);
  const thin = summer(10);
  ['30', '31', '32'].forEach((id) => { thin.courses[id].credits = 0; });
  assert.deepEqual(validate(thin).errors, [], 'no credits-ratio check on a thin semester');
  const none = summer(2);
  Object.values(none.courses).forEach((c) => { c.groups = []; c.offered = false; });
  assert.ok(validate(none).errors.some((e) => e.includes('summer')));
  const noDay = summer(2);
  noDay.courses['30'].groups[0].meetings[0].day = null;
  assert.ok(validate(noDay).errors.some((e) => e.includes('day')));
});

test('buildDataset writes the specializations and degree it is given; validate wants their lists scraped', () => {
  const specializations = [{ id: 's', name: 'ס', mandatory: 30001, elective: 30002, aloneExtra: 99999 }], degree = { total: 160, specCredits: 27 };
  const d = buildDataset({ ...base(), specializations, degree });
  assert.deepEqual([d.specializations, d.degree], [specializations, degree]);
  d.lists.forEach((l, i) => { l.code = 30001 + i; });
  assert.ok(validate(d).errors.some((e) => e.includes('specialization s: list 99999')));
  assert.ok(!validate(d).errors.some((e) => e.includes('30001') || e.includes('30002')));
});

test('validate: exam dates outside the academic year are an error', () => {
  const d = healthy();
  d.courses['20002'].groups[0].exams[0].date = '2025-02-04';
  assert.ok(validate(d).errors.some((e) => e.includes('exam')));
  d.courses['20002'].groups[0].exams[0].date = '2027-09-20'; // moed gimel in September is fine
  assert.deepEqual(validate(d).errors, []);
});

// ---- anomaly guards: a changed page layout that still parses must not overwrite good data ----
test('validate: a course that requires itself is an error', () => {
  const d = healthy();
  d.courses['20001'].prereqs = [{ kind: 'קדם', anyOf: [{ id: '20001', name: '20001' }] }];
  assert.ok(validate(d).errors.some((e) => e.startsWith('20001: a prerequisite names the course itself')));
});

test('validate: a meeting that ends after 23:00 or starts off the half hour is an error (the solver grid is 30 minutes)', () => {
  for (const [start, end, bad] of [['21:00', '23:10', true], ['08:15', '09:50', true], ['08:30', '09:50', false], ['21:00', '23:00', false]]) {
    const d = healthy();
    Object.assign(d.courses['20001'].groups[0].meetings[0], { start, end });
    assert.equal(validate(d).errors.some((e) => e.includes('implausible hours')), bad, `${start}-${end}`);
  }
});

test('validate: a meeting that ends before it starts, or sits outside 07:00-23:00, is an error', () => {
  for (const [start, end] of [['10:00', '09:00'], ['05:00', '06:50'], ['21:00', '23:50']]) {
    const d = healthy();
    Object.assign(d.courses['20001'].groups[0].meetings[0], { start, end });
    assert.ok(validate(d).errors.some((e) => e.includes('implausible hours')), `${start}-${end}`);
  }
});

const full = (n = 20) => ({ courses: Object.fromEntries(Array.from({ length: n }, (_, i) => [`c${i}`, { offered: true, groups: [{ lecturer: 'x', linked: ['y'], meetings: [{ room: 'r' }, { room: 'r' }], exams: [{}] }] }])) });
const refusedFor = (prev, next, what) => compareToPrevious(prev, next).errors.some((e) => e.includes(what));
const edit = (d, f) => { const c = structuredClone(d); Object.values(c.courses).forEach((x) => x.groups.forEach(f)); return c; };

test('compareToPrevious: meetings or exams collapsing while groups stay is refused', () => {
  assert.equal(refusedFor(full(), edit(full(), (g) => { g.meetings = g.meetings.slice(0, 1); }), 'meeting count'), true); // 50% gone
  assert.equal(refusedFor(full(), edit(full(), (g) => { g.exams = []; }), 'exam count'), true);
  assert.equal(refusedFor(edit(full(), (g) => { g.exams = []; }), full(), 'exam count'), false); // exams published later: no guard on growth
});

test('compareToPrevious: a field the parser stops filling is refused, a field that fills up is not', () => {
  assert.equal(refusedFor(full(), edit(full(), (g) => { g.lecturer = ''; }), 'lecturer'), true);
  assert.equal(refusedFor(full(), edit(full(), (g) => { g.meetings[0].room = ''; }), 'room'), true);
  assert.equal(refusedFor(full(), edit(full(), (g) => { g.linked = []; }), 'linked'), true);
  assert.equal(refusedFor(edit(full(), (g) => { g.lecturer = ''; }), full(), 'lecturer'), false);
  const some = full(); Object.values(some.courses).slice(0, 3).forEach((c) => { c.groups[0].lecturer = ''; }); // 15% fewer: within tolerance
  assert.equal(refusedFor(full(), some, 'lecturer'), false);
});

test('validate: a small program sets its own minimum course count', () => {
  const d = buildDataset(base());
  assert.ok(validate(d, null, null).errors.some((e) => e.includes('at least 40')));
  assert.deepEqual(validate(d, null, null, 1).errors, []);
});
