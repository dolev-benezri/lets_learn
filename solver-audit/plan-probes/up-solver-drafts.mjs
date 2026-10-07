// Draft regression tests F-07, F-08, F-09, F-10 (proposed home: test/solver.test.mjs, helpers grp/W0 as there).
// Run: node --test up-solver-drafts.mjs   (before the fix)   |   WEB=./up-sb/web/ node --test up-solver-drafts.mjs   (patched copy)
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { search, buildOptions } = await import(process.env.WEB ? `${process.env.WEB}solver-core.js` : '../../web/solver-core.js');
const W0 = { friends: 0, progress: 0, freeDays: 0, compact: 0, timeWindow: 0, examSpread: 0 };
const grp = (id, day, start = '08:00', end = '10:00') => ({ id, type: 'הרצאה', primary: true, full: false, linked: [], meetings: [{ day, start, end }], exams: [] });
const course = (groups) => ({ name: 'c', credits: 3, offered: true, prereqs: [], groups });
const data = (courses) => ({ year: 2027, startYear: 2026, semester: 'א', examsPublished: false, courses });
const must = (...ids) => ids.map((id) => ({ id, mode: 'must' }));

test('F-07 maxCredits 0 is a cap of 0, not "no cap"', () => {
  const d = data({ A: course([grp('A1', 1)]) });
  assert.equal(search({ data: d, courses: must('A'), weights: W0, constraints: { maxCredits: 0 } }).results.length, 0);
  assert.equal(search({ data: d, courses: must('A'), weights: W0, constraints: { maxCredits: 3 } }).results.length, 1, 'control: a cap equal to the credits is fine');
});

test('F-08 "prefer" is a wish: when the preferred lecturer clashes with another must course, the plan is found without it', () => {
  const d = data({ X: course([{ ...grp('X1', 1), lecturer: 'P' }, { ...grp('X2', 2), lecturer: 'Q' }]), Y: course([{ ...grp('Y1', 1), lecturer: 'R' }]) });
  const r = search({ data: d, courses: must('X', 'Y'), weights: W0, constraints: { lecturers: { P: 'prefer' } }, topK: 5 });
  assert.deepEqual(r.results.map((p) => [...p.groups].sort()), [['X2', 'Y1']]);
  const free = data({ X: d.courses.X, Y: course([{ ...grp('Y1', 3), lecturer: 'R' }]) }); // control: when it fits, prefer still narrows
  assert.deepEqual(search({ data: free, courses: must('X', 'Y'), weights: W0, constraints: { lecturers: { P: 'prefer' } }, topK: 5 }).results.map((p) => [...p.groups].sort()), [['X1', 'Y1']]);
});

test('F-09 a pinned shared tutorial does not cancel avoid/prefer of the lectures that reach it; a pin still beats avoid', () => {
  const sub = { ...grp('S', 3), type: 'תרגול', primary: false, lecturer: 'Z' };
  const c = { groups: [{ ...grp('A', 1), lecturer: 'X', linked: ['S'] }, { ...grp('B', 2), lecturer: 'Y', linked: ['S'] }, sub] };
  const names = (opt) => buildOptions(c, opt).map((o) => o.groups.join('+'));
  assert.deepEqual(names({ pins: ['S'], lecturers: { X: 'avoid' } }), ['B+S']);
  assert.deepEqual(names({ pins: ['S'], lecturers: { X: 'prefer' } }), ['A+S']);
  const only = { groups: [{ ...grp('A', 1), lecturer: 'X', linked: ['S'] }, sub] };
  assert.deepEqual(buildOptions(only, { pins: ['S'], lecturers: { X: 'avoid' } }).map((o) => o.groups.join('+')), ['A+S'], 'pin beats avoid');
});

test('F-10 identical groups with different exam dates are two options, not an alternative registration', () => {
  const ex = (date) => [{ kind: 'בחינה', moed: 1, date, time: null }];
  const o = buildOptions({ groups: [{ ...grp('A', 1), exams: ex('2027-02-01') }, { ...grp('B', 1), exams: ex('2027-02-20') }] });
  assert.deepEqual(o.map((x) => [x.groups, x.exams]), [[['A'], ['2027-02-01']], [['B'], ['2027-02-20']]]);
});
