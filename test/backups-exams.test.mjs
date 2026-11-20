import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backups } from '../web/ui-grid.js';
import { search } from '../web/solver-core.js';

// Deep scan 2026-11-19, finding 8: a backup group was checked against the rest of the plan's hours, days and limits, but
// not against its exams, so a "backup" could put two first sittings at the same time. Synthetic data only. No real course
// has groups with different exam dates today; this is the case that would make it show.
const m = (day, start, end) => ({ day, start, end, room: 'r' });
const ex = (date, time, extra = {}) => ({ kind: 'בחינה', moed: 1, date, time, ...extra });
const g = (id, meetings, exams = [], extra = {}) => ({
  id, type: 'סופי-הרצאה', primary: true, lecturer: 'L', full: false, semester: 'א', linked: [], meetings, exams, ...extra
});
const W0 = { friends: 0, progress: 0, freeDays: 0, compact: 0, timeWindow: 0, examSpread: 0 };
const AT = ex('2027-02-04', '09:00'); // B's first sitting
const data = (examsPublished = true) => ({
  examsPublished,
  courses: {
    A: { name: 'A', credits: 3, offered: true, prereqs: [], groups: [
      g('a1', [m(1, '08:00', '10:00')], [ex('2027-02-01', '09:00')]), // the plan's group
      g('a2', [m(2, '08:00', '10:00')], [AT]), // the same date and hour as B
      g('a3', [m(3, '08:00', '10:00')], [ex('2027-02-04', '14:00')]), // the same date, another hour
      g('a4', [m(4, '08:00', '10:00')], [ex('2027-02-09', '09:00')]), // another date
      g('a5', [m(5, '08:00', '10:00')], [ex('2027-02-04', '09:00', { moed: 2 })]), // only the second sitting is then
    ] },
    B: { name: 'B', credits: 3, offered: true, prereqs: [], groups: [g('b1', [m(1, '12:00', '14:00')], [AT])] },
  },
});
// the plan: a1 + b1, with the exams the search result carries
const plan = () => ({
  groups: ['a1', 'b1'],
  alts: {},
  exams: [{ course: 'A', ...ex('2027-02-01', '09:00') }, { course: 'B', ...AT }],
});

test('backups: a lecture whose first sitting is at the hour of another course\'s is no backup (the default rule)', () => {
  assert.deepEqual(backups(data(), plan(), 'a1'), ['a3', 'a4', 'a5']);
  assert.deepEqual(backups(data(), plan(), 'a1', { examsSameDay: 'hours' }), ['a3', 'a4', 'a5']);
});

test('backups: with "no two exams on a day" a lecture with an exam that date is no backup either', () => {
  assert.deepEqual(backups(data(), plan(), 'a1', { examsSameDay: 'forbid' }), ['a4', 'a5']);
});

test('backups: the exam rule can be turned off, and holds only while the exam dates are published', () => {
  assert.deepEqual(backups(data(), plan(), 'a1', { examsSameDay: 'allow' }), ['a2', 'a3', 'a4']);
  assert.deepEqual(backups(data(false), plan(), 'a1'), ['a2', 'a3', 'a4']);
});

test('backups: a result without exams (an older one) checks only the hours', () => {
  const { exams, ...old } = plan();
  assert.deepEqual(backups(data(), old, 'a1'), ['a2', 'a3', 'a4']);
});

// "the same rule the solver uses": a group the solver cannot place beside the plan is never offered as a backup
test('backups agree with the solver: a backup is listed exactly when pinning it still gives a plan', () => {
  for (const examsSameDay of ['hours', 'forbid', 'allow', undefined]) {
    const constraints = examsSameDay ? { examsSameDay } : {};
    const listed = new Set(backups(data(), plan(), 'a1', constraints));
    for (const id of ['a2', 'a3', 'a4', 'a5']) {
      const found = search({
        data: data(), courses: [{ id: 'A', mode: 'must' }, { id: 'B', mode: 'must' }], pins: [id], weights: W0, friends: [], constraints
      }).results.length > 0;
      // only three are listed at most; a listed one is always placeable
      if (listed.has(id)) assert.ok(found, `${id} listed but the solver refuses it (${examsSameDay})`);
      else if (listed.size < 3) assert.ok(!found, `${id} placeable by the solver but not listed (${examsSameDay})`);
    }
  }
});
