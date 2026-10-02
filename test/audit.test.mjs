import test from 'node:test';
import assert from 'node:assert/strict';
import { auditCohort } from '../scripts/audit.mjs';

const course = (credits, offered = true, extra = {}) => ({ name: 'c', credits, offered, prereqs: [], groups: offered ? [{ id: 'g', primary: true, meetings: [{ day: 1, start: '09:00', end: '10:00' }] }] : [], ...extra });
const sem = (courses, lists) => ({ courses, lists });

test('auditCohort: unoffered mandatory course, credit sum off the site total, dangling prerequisite, offered course without groups; earlier years are skipped', () => {
  const lists = [{ code: 1, name: "קורסי חובה שנה א'", minCredits: 3, courses: ['a'] }, { code: 2, name: "קורסי חובה שנה ב'", minCredits: 5, courses: ['b', 'c'] }];
  const courses = { a: course(3), b: course(2), c: course(2, false), d: course(1, true, { prereqs: [{ kind: 'קדם', anyOf: [{ id: 'zzz', name: 'x' }] }] }), e: course(1, true, { groups: [] }) };
  const found = auditCohort({ 'א': sem(courses, lists), 'ב': sem(courses, lists) }, 2);
  assert.equal(found.length, 4);
  assert.ok(found.some((f) => /1 מתוך 2 קורסים לא נפתחים.*c/.test(f)));
  assert.ok(found.some((f) => /סכום נ״ז 4, באתר 5/.test(f)));
  assert.ok(found.some((f) => /d->zzz/.test(f)));
  assert.ok(found.some((f) => /e c/.test(f)));
  assert.equal(auditCohort({ 'א': sem({ a: course(3) }, [lists[0]]), 'ב': sem({ a: course(3) }, [lists[0]]) }, 2).length, 0, 'year 1 list is ignored for a year-2 cohort');
});
