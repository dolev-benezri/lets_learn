import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupNumber, groupLabel, meetingText, friendToast, strictnessHint, defaultNotes, popStale } from '../web/ui-text.js';
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
