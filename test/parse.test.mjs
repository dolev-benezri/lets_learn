import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseProgram, parseGroups, parseDay, parseDetails, parseExams, toIsoDate, isRejected, isThrottled } from '../scripts/parse.mjs';

const fx = (name) => readFileSync(new URL(`../scripts/fixtures/${name}`, import.meta.url), 'utf8');

test('parseProgram reads list name, min credits and courses', () => {
  const p = parseProgram(fx('prog-30001.html'));
  assert.equal(p.name, "קורסי חובה שנה א'");
  assert.equal(p.minCredits, 41);
  assert.equal(p.courses.length, 11);
  assert.deepEqual(p.courses.find((c) => c.id === '90903'), { id: '90903', name: 'פיזיקה-מכניקה', offered: true });
  assert.ok(p.courses.every((c) => /^\d{4,6}$/.test(c.id)));
});

test('parseDay handles words and letters', () => {
  assert.equal(parseDay('יום שני'), 2);
  assert.equal(parseDay('ה'), 5);
  assert.equal(parseDay('xyz'), null);
});

test('parseGroups reads primaries, linked tutorials and meetings for 90903', () => {
  const gs = parseGroups(fx('groups-90903.html'));
  const primaries = gs.filter((g) => g.primary);
  assert.deepEqual(primaries.map((g) => g.id), ['279090301', '279090303', '279090304', '279090305', '279090312', '279090302', '279090306', '279090307', '279090308', '279090309', '279090310', '279090311', '279090313']);
  assert.deepEqual(primaries.filter((g) => g.meetings.every((m) => m.semester === 'א')).map((g) => g.id), ['279090301', '279090303', '279090304', '279090305', '279090312']);
  const g303 = gs.find((g) => g.id === '279090303');
  assert.equal(g303.type, 'סופי-הרצאה+תרגול');
  assert.equal(g303.lecturer, 'ד"ר שמעון מאיר');
  assert.deepEqual(g303.linked, ['279090303/1', '279090303/2']);
  assert.deepEqual(g303.meetings[0], { semester: 'א', day: 2, start: '12:00', end: '13:50', room: '208 פיקוס' });
  assert.equal(g303.detailsArgs, '-N90903,-N1,-N1,-N279090303,-N');
  const t = gs.find((g) => g.id === '279090301/1');
  assert.equal(t.type, 'תרגול');
  assert.equal(t.primary, false);
  assert.deepEqual(t.meetings, [{ semester: 'א', day: 2, start: '10:00', end: '11:50', room: "ז'2 קריה - עגלת תחשבים" }]);
});

test('parseGroups fails loudly, naming the field, when the layout changes', () => {
  const chunk = (body) => `<div class="TextAlignRight">${body}</div>`;
  assert.throws(() => parseGroups(chunk('קורס מסוג')), /קורס מסוג.*קורס מסוג/);
  assert.throws(() => parseGroups(chunk('קורס מסוג סופי-הרצאה, אין מספר')), /קבוצה.*אין מספר/);
});

test('parseGroups reads the full flag and standalone labs', () => {
  const gs = parseGroups(fx('groups-10336.html'));
  const lab = gs.find((g) => g.id === '271033601');
  assert.equal(lab.type, 'סופי-מעבדה');
  assert.equal(lab.primary, true);
  assert.equal(lab.full, true);
  assert.deepEqual(lab.linked, []);
});

test('parseGroups drops meetings without a real time', () => {
  const html = `<div class="TextAlignRight">קורס מסוג סופי-הרצאה <span>קבוצה : 111 </span> מרצה הקורס : מר א פרטים נוספים</div>
    <div class="Table"><div class="row"><div class="col">&nbsp;א</div><div class="col">&nbsp;יום שני</div><div class="col">&nbsp;00:00</div><div class="col">&nbsp;00:00</div><div class="col">x</div><div class="col">y</div></div></div>`;
  assert.deepEqual(parseGroups(html)[0].meetings, []);
});

test('parseDetails reads credits and a named prerequisite', () => {
  const d = parseDetails(fx('details-90903.html'));
  assert.equal(d.credits, 5);
  assert.deepEqual(d.prereqs, [{ kind: 'קדם', population: '', names: ['קורס הכנה פיזיקה', 'פיזיקה - מכינה בדרך לאפקה'] }]);
});

test('parseDetails separates קדם and מקביל', () => {
  const d = parseDetails(fx('details-30120.html'));
  assert.deepEqual(d.prereqs.map((p) => [p.kind, p.names]), [
    ['קדם', ['תרמודינמיקה 1', 'תרמודינמיקה']],
    ['מקביל', ["משוואות דיפ' חלקיות"]],
  ]);
});

test('toIsoDate', () => {
  assert.equal(toIsoDate('04/02/2026'), '2026-02-04');
  assert.equal(toIsoDate(''), null);
});

test('parseExams reads exam rows with moeds', () => {
  const rows = parseExams(fx('exams-2026.html'));
  const phys = rows.filter((r) => r.courseId === '90903' && r.kind === 'בחינה');
  assert.ok(phys.length >= 1);
  const shimon = phys.find((r) => r.lecturer === 'ד"ר שמעון מאיר');
  assert.deepEqual(shimon.moeds[0], { moed: 1, date: '2026-07-30', time: '09:00' });
  const mid = rows.find((r) => r.kind === 'בוחן אמצע');
  assert.ok(mid.moeds.length >= 1);
});

test('parseExams returns [] on the no-data page', () => {
  const nodata = '<div class="alert">עימכם הסליחה אבל לא נמצאו נתונים</div>';
  assert.deepEqual(parseExams(nodata), []);
});

test('isRejected spots the WAF rejection page, not real pages', () => {
  assert.equal(isRejected(fx('rejected.html')), true);
  assert.equal(isRejected(fx('groups-90903.html')), false);
  assert.equal(isRejected(fx('exams-nodata.html')), false);
});

test('isThrottled spots the hourly rate-limit page, not real pages', () => {
  assert.equal(isThrottled(fx('throttled.html')), true);
  assert.equal(isThrottled(fx('groups-10336.html')), false);
  assert.equal(isThrottled(fx('groups-90903.html')), false);
  assert.equal(isThrottled(fx('rejected.html')), false);
});
