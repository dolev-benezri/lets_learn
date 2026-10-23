import test from 'node:test';
import assert from 'node:assert/strict';
import { rowsFromItems, parseGradeSheet, skippedRows, gradeChanges, applyGradeChanges } from '../web/grade-import.js';
import { normalize } from '../web/app.js';
// Synthetic rows only (never a real sheet). Cells are listed in reading order (code first = rightmost), wrapped in bidi marks like the portal does.
const wrap = (s) => `‫${s}‬`;
const cells = (page, y, list, dy = 0) =>
  list.map((str, i) => ({ str: wrap(str), x: 500 - i * 60, y: y + (i % 2) * dy, page }));
const data = {
  courses: Object.fromEntries(
    ['10016', '30003', '30130', '30133', '30135', '90901', '90902'].map((id) => [id, { name: id, credits: 4 }])
  )
};
const sheet = (...rows) => rowsFromItems(rows.flat().reverse()); // reversed input order: the text layer order must not matter
const by = (res) => Object.fromEntries(res.map((r) => [r.id, [r.result, r.grade]]));

test('rowsFromItems groups by page and y (tolerance), sorts right to left, strips bidi marks', () => {
  const rows = rowsFromItems(
    [...cells(1, 700, ['a', 'b', 'c'], 2), ...cells(1, 650, ['d', 'e']), ...cells(2, 700, ['f', 'g'])].reverse()
  );
  assert.deepEqual(rows, [
    ['a', 'b', 'c'],
    ['d', 'e'],
    ['f', 'g']
  ]);
  assert.deepEqual(
    rowsFromItems([
      { str: '‫ ‬', x: 1, y: 1, page: 1 },
      { str: 'x', x: 1, y: 100, page: 1 }
    ]),
    [['x']]
  );
});

test('passed, failed (*), exempt (פ.פנימ), pending (חייב); טרם and unknown codes are skipped', () => {
  const rows = sheet(
    cells(1, 700, ['10016', 'תשפ"ו 1/', 'פיזיקה 1', 'ד"ר כהן', '85', '4.0', '4.50'], 1),
    cells(1, 680, ['30003', 'תשפ"ו 1/', 'מבוא', 'ד"ר לוי', '45', '3.0', '3.00', '*']),
    cells(1, 660, ['90901', 'תשפ"ו 1/', 'אנגלית', 'צוות', 'פ.פנימ', '0.0', '0.00']),
    cells(1, 640, ['30130', 'תשפ"ו 1/', 'סדנה', 'צוות', 'חייב', '2.0', '2.00']),
    cells(1, 620, ['30133', 'טרם', 'קורס', 'צוות', '3.0', '3.00']),
    cells(1, 600, ['77777', 'תשפ"ו 1/', 'לא קיים', 'צוות', '90', '3.0', '3.00']),
    cells(1, 580, ['ציון', 'שם הקורס', 'ש"ס'])
  );
  assert.deepEqual(by(parseGradeSheet(rows, data)), {
    10016: ['passed', 85],
    30003: ['failed', 45],
    90901: ['exempt', null],
    30130: ['pending', null]
  });
});

test('a digit in the course name is not the grade; a 100 and a 0 are grades', () => {
  const r = parseGradeSheet(
    sheet(
      cells(1, 700, ['10016', 'תשפ"ו 1/', 'חדו"א 2', 'צוות', '100', '5.0', '5.00']),
      cells(1, 680, ['30003', 'תשפ"ו 2/', 'פיזיקה 1', 'צוות', '0', '4.0', '4.00'])
    ),
    data
  );
  assert.deepEqual(by(r), { 10016: ['passed', 100], 30003: ['passed', 0] });
});

test('duplicates: failed then passed (two pages) is passed; highest passing grade wins', () => {
  const r = parseGradeSheet(
    sheet(
      cells(1, 700, ['30135', 'תשפ"ה 2/', 'ת', 'צוות', '40', '3.0', '3.00', '*']),
      cells(2, 700, ['30135', 'תשפ"ו 1/', 'ת', 'צוות', '72', '3.0', '3.00']),
      cells(2, 680, ['10016', 'תשפ"ה 1/', 'ת', 'צוות', '60', '3.0', '3.00']),
      cells(2, 660, ['10016', 'תשפ"ו 1/', 'ת', 'צוות', '75', '3.0', '3.00']),
      cells(2, 640, ['90902', 'תשפ"ו 1/', 'ת', 'צוות', 'חייב', '3.0', '3.00']),
      cells(2, 620, ['90902', 'תשפ"ה 1/', 'ת', 'צוות', '30', '3.0', '3.00', '*'])
    ),
    data
  );
  assert.deepEqual(by(r), { 30135: ['passed', 72], 10016: ['passed', 75], 90902: ['failed', 30] });
});

test('rows read left to right, or fused into one item, parse the same', () => {
  const ltr = cells(1, 700, ['10016', 'תשפ"ו 1/', 'פיזיקה 1', 'צוות', '88', '4.0', '4.50']).map((c, i) => ({
    ...c,
    x: 100 + i * 60
  }));
  const fused = [{ str: wrap('30003 תשפ"ו 1/ מבוא צוות 51 3.0 3.00'), x: 300, y: 600, page: 1 }];
  assert.deepEqual(by(parseGradeSheet(rowsFromItems([...ltr, ...fused]), data)), {
    10016: ['passed', 88],
    30003: ['passed', 51]
  });
});

test('real layout: year/sem, code, name, lecturer, decimals, then the grade; the `*` sits rightmost, a few points lower', () => {
  const row = (y, list, star) => [...cells(1, y, list), ...(star ? [{ str: '*', x: 560, y: y - 3.4, page: 1 }] : [])];
  const r = parseGradeSheet(
    sheet(
      row(700, ['תשפ"ו 1/', '10016', 'פיזיקה 1', 'ד"ר כהן', '2.50', '3.0', '77']),
      row(685, ['תשפ"ו 1/', '30003', 'מבוא', 'צוות', '5.00', '6.0', '42'], true),
      row(670, ['תשפ"ו 1/', '30130', 'אנגלית', '6.0', 'פ.פנימ']),
      row(655, ['תשפ"ו 2/', '30133', 'סדנה', 'צוות', '4.50', '6.0', 'חייב']),
      row(640, ['טרם', '30135', 'קורס', '1.00', '2.0', 'חייב'])
    ),
    data
  );
  assert.deepEqual(by(r), {
    10016: ['passed', 77],
    30003: ['failed', 42],
    30130: ['exempt', null],
    30133: ['pending', null]
  });
});

test('no rows, no courses: empty result', () => {
  assert.deepEqual(parseGradeSheet([], data), []);
  assert.deepEqual(parseGradeSheet([['hello', 'world'], ['10016']], data), []);
});

test('a summer row (semester 3) counts like any other', () => {
  const r = parseGradeSheet(
    sheet(
      cells(1, 700, ['10016', 'תשפ"ו 3/', 'פיזיקה 1', 'צוות', '77', '4.0', '4.00']),
      cells(1, 680, ['30003', 'תשפ"ו 3/', 'מבוא', 'צוות', '40', '3.0', '3.00', '*'])
    ),
    data
  );
  assert.deepEqual(by(r), { 10016: ['passed', 77], 30003: ['failed', 40] });
});

test('real layout: a row with no grade cell never takes a digit from the course name as the grade (U4)', () => {
  const r = parseGradeSheet(sheet(cells(1, 700, ['תשפ"ו 1/', '10016', 'פיזיקה 2', '2.50', '3.0'])), data);
  assert.deepEqual(by(r), {});
});

test('gradeChanges: a failed row on a course marked passed is offered but not pre-checked (U4)', async () => {
  const { gradeChanges } = await import('../web/grade-import.js');
  const state = { passed: ['10016', '30003'], failed: { 30130: 1 }, grades: { 30003: 70 } };
  const todo = gradeChanges(
    [
      { id: '10016', grade: 40, result: 'failed' },
      { id: '30003', grade: 80, result: 'passed' },
      { id: '30130', grade: 20, result: 'failed' },
      { id: '30133', grade: 90, result: 'passed' },
      { id: '30135', grade: null, result: 'pending' }
    ],
    state
  );
  assert.deepEqual(
    todo.map((t) => [t.id, t.was, t.to, t.check]),
    [
      ['10016', 'passed', 'failed', false],
      ['30003', 'passed', 'passed', true],
      ['30130', 'failed', 'failed', true], // its failing grade is new on file: it counts in the 11.4.2 average (#34)
      ['30133', 'none', 'passed', true]
    ]
  );
});

test('gradeChanges: an exemption on a course already marked passed is offered once, until it is on file', async () => {
  const { gradeChanges } = await import('../web/grade-import.js');
  const row = [{ id: '90901', grade: null, result: 'exempt' }];
  assert.deepEqual(
    gradeChanges(row, { passed: ['90901'], failed: {}, grades: {} }).map((t) => [t.id, t.was, t.to]),
    [['90901', 'passed', 'passed']]
  );
  assert.deepEqual(gradeChanges(row, { passed: ['90901'], failed: {}, grades: {}, exempt: ['90901'] }), []);
});

// J2/J12: a failure before a pass is kept as "failed before"; a graded pass replaces an exemption
const row = (y, grade, fail) => cells(1, y, ['10016', 'תשפ"ה 1/', 'פיזיקה 1', 'ד"ר כהן', grade, '4.0', '4.50', ...(fail ? ['*'] : [])]);
const st = (s = {}) => normalize({ v: 1, passed: [], ...s });
test('a failed row and a passed row of one course: passed with failedBefore, in either order', () => {
  for (const rows of [[row(700, '45', true), row(680, '85')], [row(700, '85'), row(680, '45', true)]])
    assert.deepEqual(parseGradeSheet(sheet(...rows), data), [{ id: '10016', grade: 85, result: 'passed', failedBefore: true }]);
});
test('import: a failure before a pass is offered once, applied as one failure, never lowers a count', () => {
  const found = parseGradeSheet(sheet(row(700, '45', true), row(680, '80')), data);
  const s = st({ passed: ['10016'], grades: { 10016: 80 } });
  const todo = gradeChanges(found, s);
  assert.equal(todo.length, 1, 'same status and grade, but the failure is new');
  applyGradeChanges(s, todo);
  assert.deepEqual([s.passed, s.failed, s.grades], [['10016'], { 10016: 1 }, { 10016: 80 }]);
  assert.deepEqual(gradeChanges(found, s), [], 'a reimport changes nothing');
  for (const n of [2, 3]) {
    const t = st({ passed: [], failed: { 10016: n } });
    applyGradeChanges(t, gradeChanges(found, t));
    assert.equal(t.failed['10016'], n);
  }
});
test('import: a graded pass on an exempt course offers removing the exemption', () => {
  const s = st({ passed: ['10016'], exempt: ['10016'], grades: { 10016: 80 } });
  const todo = gradeChanges([{ id: '10016', grade: 80, result: 'passed' }], s);
  assert.equal(todo.length, 1);
  applyGradeChanges(s, todo);
  assert.deepEqual([s.passed, s.exempt, s.grades['10016']], [['10016'], [], 80]);
});

// Audit 2026-10-23 #40: a row with a known course code whose grade is not one the import knows (a grade in words) is
// counted, so the preview can say it was not imported, instead of dropping it silently.
test('skippedRows counts a row with a grade the import does not take (נפסל); parseGradeSheet leaves it out', () => {
  const rows = sheet(
    cells(1, 700, ['10016', 'תשפ"ו 1/', 'פיזיקה 1', 'ד"ר כהן', 'נפסל', '4.0', '4.50']),
    cells(1, 680, ['30003', 'תשפ"ו 1/', 'מבוא', 'ד"ר לוי', '85', '3.0', '3.00']),
    cells(1, 660, ['30133', 'טרם', 'קורס', 'צוות', '3.0', '3.00']),
    cells(1, 640, ['ציון', 'שם הקורס', 'ש"ס'])
  );
  assert.deepEqual(by(parseGradeSheet(rows, data)), { 30003: ['passed', 85] });
  assert.equal(skippedRows(rows, data), 1, 'the words row; not טרם, not the header');
});

// Audit 2026-10-23 #34, regulation 7.7: "הציון בקורס המאוחר יהיה הציון המחייב, גם אם הוא נמוך מהציון הקודם". The row of the
// latest year/semester wins, not the highest grade; a row still in progress (חייב) does not replace a grade.
const dated = (y, when, grade, fail) => cells(1, y, ['10016', when, 'פיזיקה 1', 'צוות', grade, '4.0', '4.50', ...(fail ? ['*'] : [])]);
test('the latest attempt binds, even when lower (7.7); a later failure binds too', () => {
  assert.deepEqual(by(parseGradeSheet(sheet(dated(700, 'תשפ"ה 1/', '90'), dated(680, 'תשפ"ו 1/', '70')), data)), { 10016: ['passed', 70] });
  assert.deepEqual(by(parseGradeSheet(sheet(dated(700, 'תשפ"ו 1/', '70'), dated(680, 'תשפ"ה 2/', '90')), data)), { 10016: ['passed', 70] });
  assert.deepEqual(by(parseGradeSheet(sheet(dated(700, 'תשפ"ה 1/', '80'), dated(680, 'תשפ"ו 1/', '45', true)), data)), { 10016: ['failed', 45] });
  assert.deepEqual(by(parseGradeSheet(sheet(dated(700, 'תשפ"ה 1/', '80'), dated(680, 'תשפ"ו 1/', 'חייב')), data)), { 10016: ['passed', 80] });
});
test('a failing grade is kept on file and offered when it changes (it counts in the 11.4.2 average)', () => {
  const s = st({ failed: { 10016: 1 } });
  const rows = gradeChanges([{ id: '10016', grade: 45, result: 'failed' }], s);
  assert.equal(rows.length, 1, 'the grade is new');
  applyGradeChanges(s, rows);
  assert.equal(s.grades['10016'], 45);
  assert.equal(gradeChanges([{ id: '10016', grade: 45, result: 'failed' }], s).length, 0, 'nothing new the second time');
});

// Audit 2026-10-23 #40, regulation 9.3 (grade types): "עבר" (60 and up) and "השתתף" (a course without a numeric grade) are a pass
// with no number, so they stay out of the average (13.7); "נכשל" is a failure. "לא נבחן" and "נפסל" are left for the student.
test('grades in words (9.3): עבר and השתתף pass without a number, נכשל fails', () => {
  const w = (y, code, word) => cells(1, y, [code, 'תשפ"ו 1/', 'קורס', 'צוות', word, '3.0', '3.00']);
  const rows = sheet(w(700, '10016', 'עבר'), w(680, '30003', 'השתתף'), w(660, '30130', 'נכשל'), w(640, '30133', 'נפסל'));
  assert.deepEqual(by(parseGradeSheet(rows, data)), {
    10016: ['passed', null],
    30003: ['passed', null],
    30130: ['failed', null]
  });
  assert.equal(skippedRows(rows, data), 1, 'נפסל is said, not imported');
  const s = st();
  applyGradeChanges(s, gradeChanges(parseGradeSheet(rows, data), s));
  assert.deepEqual(s.grades, {}, 'no number, no grade on file');
  assert.deepEqual([...s.passed].sort(), ['10016', '30003']);
});

// GPT review of #34/#40: only the year/semester field dates a row ('תשפ"ו' beside '1/'): a course name like 'תנ"ך 1' is no date.
test('a course name that looks like a year is not a date: undated rows keep the old ranking', () => {
  const named = (y, when, grade) => cells(1, y, ['10016', ...(when ? [when] : []), 'תנ"ך 1', 'צוות', grade, '4.0', '4.50']);
  assert.deepEqual(by(parseGradeSheet(sheet(named(700, null, '90'), named(680, 'תשפ"ו 1/', '70')), data)), { 10016: ['passed', 90] });
});
// A sheet row without a number replaces a number on file: the latest attempt binds (7.7), and a word carries no number (13.7).
test('a word-only row clears a number on file and an exemption', () => {
  const s = st({ passed: ['10016', '30003'], failed: { 30130: 1 }, exempt: ['30003'], grades: { 10016: 85, 30130: 45 } });
  const found = [
    { id: '10016', grade: null, result: 'passed' },
    { id: '30003', grade: null, result: 'passed' },
    { id: '30130', grade: null, result: 'failed' }
  ];
  const todo = gradeChanges(found, s);
  assert.deepEqual(todo.map((r) => r.id), ['10016', '30003', '30130']);
  applyGradeChanges(s, todo);
  assert.deepEqual([s.grades, s.exempt], [{}, []]);
});
