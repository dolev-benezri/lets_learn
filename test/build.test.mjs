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

test('validate flags a too-small dataset and missing 90903', () => {
  const d = buildDataset(base());
  const { errors } = validate(d);
  assert.ok(errors.some((e) => e.includes('40')));
  delete d.courses['90903'];
  assert.ok(validate(d).errors.some((e) => e.includes('90903')));
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
  const sized = (n, offered = n) => ({ courses: Object.fromEntries(Array.from({ length: n }, (_, i) => [`c${i}`, { offered: i < offered, groups: [{}] }])) });
  const groups = (n) => ({ courses: { c: { offered: true, groups: Array.from({ length: n }, () => ({})) } } });
  const refused = (prev, next, what) => compareToPrevious(prev, next).errors.some((e) => e.includes(what));
  assert.equal(refused(sized(10), sized(9), 'course count'), false); // 10% exactly
  assert.equal(refused(sized(10), sized(8), 'course count'), true);
  assert.equal(refused(sized(10), sized(10, 8), 'offered-course'), false); // 20% exactly
  assert.equal(refused(sized(10), sized(10, 7), 'offered-course'), true);
  assert.equal(refused(groups(4), groups(3), 'group count'), false); // 25% exactly
  assert.equal(refused(groups(8), groups(5), 'group count'), true);
});
