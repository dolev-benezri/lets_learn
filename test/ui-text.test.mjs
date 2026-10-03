import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupNumber, groupLabel, meetingText, friendToast, strictnessHint, defaultNotes, popStale, freshness, stalePins, creditsGoal, notFitReason, partialNote } from '../web/ui-text.js';
import { askConfirm } from '../web/ui-dialog.js';
import { DEFAULT } from '../web/app.js';

test('groupNumber: the short number of a 9-digit group id, tutorial suffix kept', () => {
  assert.equal(groupNumber('270600301'), '01');
  assert.equal(groupNumber('271001601/1'), '01/1');
  assert.equal(groupNumber('L2'), 'L2');
});

test('groupLabel and meetingText: human handles, no raw id', () => {
  const g = { id: '270600302', type: 'סופי-הרצאה', meetings: [{ day: 3, start: '08:00', end: '11:50' }] };
  assert.equal(groupLabel(g), 'הרצאה · קבוצה 02');
  assert.equal(meetingText(g.meetings[0]), 'יום ג׳ 08:00–11:50');
});

test('friendToast says what happened and to whom', () => {
  assert.equal(friendToast('נועה', false), 'החבר נוסף: נועה');
  assert.equal(friendToast('נועה', true), 'החבר עודכן: נועה');
});

test('defaultNotes spells out the shipped defaults (Friday off, not after 20:00, both only a preference)', () => {
  const n = defaultNotes(DEFAULT.constraints);
  assert.equal(n.days, 'ברירת מחדל: יום ו׳ פנוי, רק העדפה.');
  assert.equal(n.hours, 'ברירת מחדל: לא אחרי 20:00, רק העדפה.');
  const m = defaultNotes({ dayOff: [1, 6], dayOffHard: true, notBefore: '09:00', notAfter: '', windowHard: true });
  assert.equal(m.days, 'ברירת מחדל: ימים א׳, ו׳ פנויים, חובה לגמרי.');
  assert.equal(m.hours, 'ברירת מחדל: לא לפני 09:00, חובה לגמרי.');
  assert.equal(defaultNotes({ dayOff: [], dayOffHard: false, notBefore: '', notAfter: '', windowHard: false }).hours, 'ברירת מחדל: ללא הגבלת שעות, רק העדפה.');
});

test('strictnessHint differs for hard and soft', () => {
  assert.notEqual(strictnessHint(true), strictnessHint(false));
});

test('popStale: small scrolls keep the popover, long ones or an off-screen block close it', () => {
  assert.equal(popStale(300, 260, 800), false);
  assert.equal(popStale(300, 100, 800), false); // 200px but under 25% of ... still within max(160, 200)
  assert.equal(popStale(300, 90, 800), true);
  assert.equal(popStale(300, 900, 800), true); // below the viewport
  assert.equal(popStale(300, -100, 800), true); // above it
  assert.equal(popStale(300, null, 800), true); // block gone
});

test('askConfirm: without <dialog> and confirm() it proceeds, like the old guard did', async () => {
  assert.equal(await askConfirm('x'), true);
});

test('freshness: relative check time, last-change date, stale after 36h or a failed check', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const ok = { checkedAt: '2026-10-01T09:00:00Z', ok: true };
  assert.deepEqual(freshness(ok, '2026-09-28T09:00:00Z', now), { text: 'נבדק לפני 3 שעות · השתנה לאחרונה 28.9', stale: false });
  assert.equal(freshness({ ...ok, checkedAt: '2026-10-01T11:00:00Z' }, ok.checkedAt, now).text.split(' · ')[0], 'נבדק לפני שעה');
  assert.equal(freshness({ ...ok, checkedAt: '2026-10-01T11:59:40Z' }, ok.checkedAt, now).text.split(' · ')[0], 'נבדק עכשיו');
  assert.equal(freshness({ ...ok, checkedAt: '2026-09-29T23:00:00Z' }, ok.checkedAt, now).stale, true, 'over 36h old');
  assert.equal(freshness({ ...ok, ok: false }, ok.checkedAt, now).stale, true, 'last check failed');
  assert.deepEqual(freshness(null, '2026-09-28T09:00:00Z', now), { text: 'השתנה לאחרונה 28.9 · לא ידוע מתי נבדק', stale: true });
});

test('stalePins: pins missing from every loaded semester, named by course when it still exists', () => {
  const A = { courses: { 6001: { name: 'אנגלית בסיסי', groups: [{ id: '270600101' }] } } };
  const B = { courses: { 30003: { name: 'סטטיקה', groups: [{ id: '273000301' }] } } };
  assert.deepEqual(stalePins(['270600101', '273000301'], [A, B]), [], 'a pin in either semester is fine');
  assert.deepEqual(stalePins(['270600102', '279999901', 'L2'], [A, null]), [
    { gid: '270600102', text: 'הקבוצה 02 בקורס אנגלית בסיסי כבר לא קיימת בנתונים' },
    { gid: '279999901', text: 'הקבוצה 01 בקורס 99999 כבר לא קיימת בנתונים' },
    { gid: 'L2', text: 'הקבוצה L2 כבר לא קיימת בנתונים' },
  ]);
});

import { gradeInput } from '../web/ui-text.js';
test('gradeInput: valid kept, empty clears, invalid keeps the previous grade', () => {
  assert.equal(gradeInput('85', 90), 85);
  assert.equal(gradeInput('0', 90), 0);
  assert.equal(gradeInput('', 90), undefined);
  for (const bad of ['900', '-1', '8.5', 'x']) assert.equal(gradeInput(bad, 90), 90);
  assert.equal(gradeInput('900', undefined), undefined);
});

import { rangeError } from '../web/ui-text.js';
test('rangeError: an out-of-range number field entry is named in text (WCAG 3.3.1), a valid or empty one is not', () => {
  for (const ok of ['', '0', '100']) assert.equal(rangeError(ok, 0, 100), null);
  for (const bad of ['150', '-1', '8.5', 'x']) assert.match(rangeError(bad, 0, 100), /בין 0 ל-100.*לא נשמר/);
  assert.match(rangeError('900', 50, 150), /בין 50 ל-150/);
});

test('creditsGoal: credits owed by the end of the previous year; year א׳ has no goal', () => {
  assert.equal(creditsGoal(41, 41, 2), '41 מתוך 41 נ״ז הנדרשים עד סוף שנה א׳');
  assert.equal(creditsGoal(30, 83, 3), '30 מתוך 83 נ״ז הנדרשים עד סוף שנה ב׳');
  assert.equal(creditsGoal(0, 0, 1), 'בשנה א׳ אין עדיין יעד נ״ז');
});

test('notFitReason: lines naming the course, else the general ones, else nothing', () => {
  const names = ['פיזיקה', 'לינארית'];
  assert.equal(notFitReason('פיזיקה', ['פיזיקה: אין קבוצה', 'לינארית: אין קבוצה'], names), 'פיזיקה: אין קבוצה');
  assert.equal(notFitReason('לינארית', ['אין מערכת שעומדת בכל האילוצים'], names), 'אין מערכת שעומדת בכל האילוצים');
  assert.equal(notFitReason('לינארית', ['פיזיקה: אין קבוצה'], names), '');
});

test('partialNote: offers "חפש עוד" below the cap, explains instead at the cap', () => {
  const a = partialNote(1500, 12000);
  assert.equal(a.more, true);
  assert.match(a.text, /1\.5 שניות/);
  const b = partialNote(12000, 12000);
  assert.equal(b.more, false);
  assert.match(b.text, /סמנו פחות קורסים/);
});

import { hebYear } from '../web/ui-text.js';
test('hebYear: the Hebrew academic year of a Gregorian end year, with the 15 and 16 exceptions', () => {
  assert.deepEqual([2027, 2026, 2025, 2024, 2023, 2015, 1955, 1956].map(hebYear), ['תשפ״ז', 'תשפ״ו', 'תשפ״ה', 'תשפ״ד', 'תשפ״ג', 'תשע״ה', 'תשט״ו', 'תשט״ז']);
});

test('courseCount: one course is "קורס אחד", not "1 קורסים"', async () => {
  const { courseCount } = await import('../web/ui-text.js');
  assert.deepEqual([courseCount(1), courseCount(0), courseCount(4)], ['קורס אחד', '0 קורסים', '4 קורסים']);
});

test('count: Hebrew singular for one (groups, lessons, days), the number otherwise', async () => {
  const { count, groupCount } = await import('../web/ui-text.js');
  assert.deepEqual([groupCount(1), groupCount(3)], ['קבוצה אחת', '3 קבוצות']);
  assert.equal(count(1, 'יום אחד', 'ימים'), 'יום אחד');
  assert.equal(count(2, 'יום אחד', 'ימים'), '2 ימים');
});
