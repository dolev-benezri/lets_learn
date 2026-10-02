import test from 'node:test';
import assert from 'node:assert/strict';
import { rowsFromItems, parseGradeSheet } from '../web/grade-import.js';
// Synthetic rows only (never a real sheet). Cells are listed in reading order (code first = rightmost), wrapped in bidi marks like the portal does.
const wrap = (s) => `‫${s}‬`;
const cells = (page, y, list, dy = 0) => list.map((str, i) => ({ str: wrap(str), x: 500 - i * 60, y: y + (i % 2) * dy, page }));
const data = { courses: Object.fromEntries(['10016', '30003', '30130', '30133', '30135', '90901', '90902'].map((id) => [id, { name: id, credits: 4 }])) };
const sheet = (...rows) => rowsFromItems(rows.flat().reverse()); // reversed input order: the text layer order must not matter
const by = (res) => Object.fromEntries(res.map((r) => [r.id, [r.result, r.grade]]));

test('rowsFromItems groups by page and y (tolerance), sorts right to left, strips bidi marks', () => {
  const rows = rowsFromItems([...cells(1, 700, ['a', 'b', 'c'], 2), ...cells(1, 650, ['d', 'e']), ...cells(2, 700, ['f', 'g'])].reverse());
  assert.deepEqual(rows, [['a', 'b', 'c'], ['d', 'e'], ['f', 'g']]);
  assert.deepEqual(rowsFromItems([{ str: '‫ ‬', x: 1, y: 1, page: 1 }, { str: 'x', x: 1, y: 100, page: 1 }]), [['x']]);
});

test('passed, failed (*), exempt (פ.פנימ), pending (חייב); טרם and unknown codes are skipped', () => {
  const rows = sheet(
    cells(1, 700, ['10016', 'תשפ"ו 1/', 'פיזיקה 1', 'ד"ר כהן', '85', '4.0', '4.50'], 1),
    cells(1, 680, ['30003', 'תשפ"ו 1/', 'מבוא', 'ד"ר לוי', '45', '3.0', '3.00', '*']),
    cells(1, 660, ['90901', 'תשפ"ו 1/', 'אנגלית', 'צוות', 'פ.פנימ', '0.0', '0.00']),
    cells(1, 640, ['30130', 'תשפ"ו 1/', 'סדנה', 'צוות', 'חייב', '2.0', '2.00']),
    cells(1, 620, ['30133', 'טרם', 'קורס', 'צוות', '3.0', '3.00']),
    cells(1, 600, ['77777', 'תשפ"ו 1/', 'לא קיים', 'צוות', '90', '3.0', '3.00']),
    cells(1, 580, ['ציון', 'שם הקורס', 'ש"ס']));
  assert.deepEqual(by(parseGradeSheet(rows, data)), { 10016: ['passed', 85], 30003: ['failed', 45], 90901: ['exempt', null], 30130: ['pending', null] });
});

test('a digit in the course name is not the grade; a 100 and a 0 are grades', () => {
  const r = parseGradeSheet(sheet(
    cells(1, 700, ['10016', 'תשפ"ו 1/', 'חדו"א 2', 'צוות', '100', '5.0', '5.00']),
    cells(1, 680, ['30003', 'תשפ"ו 2/', 'פיזיקה 1', 'צוות', '0', '4.0', '4.00'])), data);
  assert.deepEqual(by(r), { 10016: ['passed', 100], 30003: ['passed', 0] });
});

test('duplicates: failed then passed (two pages) is passed; highest passing grade wins', () => {
  const r = parseGradeSheet(sheet(
    cells(1, 700, ['30135', 'תשפ"ה 2/', 'ת', 'צוות', '40', '3.0', '3.00', '*']),
    cells(2, 700, ['30135', 'תשפ"ו 1/', 'ת', 'צוות', '72', '3.0', '3.00']),
    cells(2, 680, ['10016', 'תשפ"ה 1/', 'ת', 'צוות', '60', '3.0', '3.00']),
    cells(2, 660, ['10016', 'תשפ"ו 1/', 'ת', 'צוות', '75', '3.0', '3.00']),
    cells(2, 640, ['90902', 'תשפ"ו 1/', 'ת', 'צוות', 'חייב', '3.0', '3.00']),
    cells(2, 620, ['90902', 'תשפ"ה 1/', 'ת', 'צוות', '30', '3.0', '3.00', '*'])), data);
  assert.deepEqual(by(r), { 30135: ['passed', 72], 10016: ['passed', 75], 90902: ['failed', 30] });
});

test('rows read left to right, or fused into one item, parse the same', () => {
  const ltr = cells(1, 700, ['10016', 'תשפ"ו 1/', 'פיזיקה 1', 'צוות', '88', '4.0', '4.50']).map((c, i) => ({ ...c, x: 100 + i * 60 }));
  const fused = [{ str: wrap('30003 תשפ"ו 1/ מבוא צוות 51 3.0 3.00'), x: 300, y: 600, page: 1 }];
  assert.deepEqual(by(parseGradeSheet(rowsFromItems([...ltr, ...fused]), data)), { 10016: ['passed', 88], 30003: ['passed', 51] });
});

test('real layout: year/sem, code, name, lecturer, decimals, then the grade; the `*` sits rightmost, a few points lower', () => {
  const row = (y, list, star) => [...cells(1, y, list), ...(star ? [{ str: '*', x: 560, y: y - 3.4, page: 1 }] : [])];
  const r = parseGradeSheet(sheet(
    row(700, ['תשפ"ו 1/', '10016', 'פיזיקה 1', 'ד"ר כהן', '2.50', '3.0', '77']),
    row(685, ['תשפ"ו 1/', '30003', 'מבוא', 'צוות', '5.00', '6.0', '42'], true),
    row(670, ['תשפ"ו 1/', '30130', 'אנגלית', '6.0', 'פ.פנימ']),
    row(655, ['תשפ"ו 2/', '30133', 'סדנה', 'צוות', '4.50', '6.0', 'חייב']),
    row(640, ['טרם', '30135', 'קורס', '1.00', '2.0', 'חייב'])), data);
  assert.deepEqual(by(r), { 10016: ['passed', 77], 30003: ['failed', 42], 30130: ['exempt', null], 30133: ['pending', null] });
});

test('no rows, no courses: empty result', () => {
  assert.deepEqual(parseGradeSheet([], data), []);
  assert.deepEqual(parseGradeSheet([['hello', 'world'], ['10016']], data), []);
});

test('a summer row (semester 3) counts like any other', () => {
  const r = parseGradeSheet(sheet(
    cells(1, 700, ['10016', 'תשפ"ו 3/', 'פיזיקה 1', 'צוות', '77', '4.0', '4.00']),
    cells(1, 680, ['30003', 'תשפ"ו 3/', 'מבוא', 'צוות', '40', '3.0', '3.00', '*'])), data);
  assert.deepEqual(by(r), { 10016: ['passed', 77], 30003: ['failed', 40] });
});
