import test from 'node:test';
import assert from 'node:assert/strict';
import { rowsFromTable, rowsFromWords, rowFromBlock, matchRows, matchGrid, mergeScans } from '../web/friend-schedule.js';

const g = (id, type, ...meetings) => ({
  id,
  type,
  meetings: meetings.map(([day, start, end]) => ({ day, start, end }))
});
const courses = {
  30112: {
    name: 'תרמודינמיקה 1',
    groups: [
      g('A1', 'סופי-הרצאה+תרגול', [2, '13:00', '14:50']),
      g('A2', 'סופי-הרצאה+תרגול', [4, '14:00', '15:50']),
      g('A1/1', 'תרגול', [2, '15:00', '15:50'])
    ]
  },
  30127: {
    name: 'חוזק חומרים 1',
    groups: [
      g('B1', 'סופי-הרצאה+תרגול', [1, '08:00', '09:50'], [4, '08:00', '08:50']),
      g('B4', 'סופי-הרצאה+תרגול', [1, '10:00', '11:50'], [3, '08:00', '08:50']),
      g('B1/1', 'תרגול', [4, '09:00', '09:50'])
    ]
  },
  90904: {
    name: 'פיזיקה חשמל ומגנטיות',
    groups: [g('C1', 'סופי-הרצאה+תרגול', [1, '14:00', '15:50'], [3, '09:00', '10:50'])]
  },
};

// OCR noise seen on a real table slide: lost colon, "m" for "11", mangled day names, bidi marks, stray words.
const TABLE = `‎nd‏ דו"ח אקסל
‏סמסטר קוד קורס שם הקורס סוג מקצוע שם המרצה נקודות זכות
‏30m2 1‏ תרמודינמיקה 1 סופי-הרצאה+תרגול ד"ר פלוני 2.00 2.00 יום שני. 13:00-14:50, כיתה:303 פיקוס
‏30m2 1‏ תרמודינמיקה 1 תרגול ד"ר פלוני 1.00 יום שני, 15:00-15-50, כיתה:303
‏1 30127 חוזק חומרים 1 סופי-הרצאה+תרגול ד"ר אלמוני 3.50 3.00 ראשון, 08:00-09:50, כיתה201
‎DF‏ רבישי, 08:00-08:50, כיתה:114
‏1 30127 חוזק חומרים 1 תרגול ד"ר אלמוני 1.00 ‎DF‏ רבישי, 09:00-09:50, כיתה:114
‏1 90904 פיזיקה חשמל ומגנטיות סופי-הרצאה+תרגול 5.00 4.00 ראשון, 14:00-15:50, כיתה:204
‏שכישי, 09:00-10:50, כיתה:205
‏1 99999 קורס שאין לנו סופי-הרצאה 2.00 ראשון, 08:00-09:50`;

test('rowsFromTable: one row per code, OCR-damaged code fixed, times and day candidates read', () => {
  const rows = rowsFromTable(TABLE, courses);
  assert.deepEqual(
    rows.map((r) => r.cid),
    ['30112', '30112', '30127', '30127', '90904', null]
  );
  assert.deepEqual(rows[1].meets, [{ days: [2], start: '15:00', end: '15:50' }]); // "15:00-15-50"
  assert.equal(rows[2].meets.length, 2);
  assert.deepEqual(rows[2].meets[1].days, [4]); // "רבישי" -> רביעי
  assert.deepEqual(rows[4].meets[1].days.sort(), [3, 6]); // "שכישי" is as close to שלישי as to שישי
  assert.deepEqual(rows[1].kinds, ['תרגול']);
});

test('matchRows picks the group whose meetings fit, lecture vs tutorial by time, reports unknown codes', () => {
  const r = matchRows(rowsFromTable(TABLE, courses), courses);
  assert.deepEqual(r.found, ['A1', 'A1/1', 'B1', 'B1/1', 'C1']);
  assert.deepEqual(r.unknown, ['99999']);
  assert.equal(r.ambiguous, 0);
});

test('matchRows: a slightly wrong end time still matches on start; no time match at all is unknown', () => {
  const row = (meets) => ({ cid: '30112', code: '30112', kinds: [], meets });
  assert.deepEqual(matchRows([row([{ days: [4], start: '14:00', end: '15:00' }])], courses).found, ['A2']);
  assert.deepEqual(matchRows([row([{ days: [4], start: '07:00', end: '08:00' }])], courses).unknown, ['30112']);
});

test('rowFromBlock: reversed RTL time range + column day; matchRows finds the course by name', () => {
  const row = rowFromBlock('חוזק חומרים 1 (סופי-הרצאה+תרגול)\n09:50 - 08:00', 1, courses);
  assert.deepEqual(row.meets, [{ days: [1], start: '08:00', end: '09:50' }]);
  assert.deepEqual(matchRows([row], courses).found, ['B1']);
  assert.deepEqual(matchRows([rowFromBlock('אנליזה הרמונית (תרגול) 10:00 - 10:50', 4, courses)], courses).unknown, [
    'אנליזההרמונית'
  ]);
});

test('matchRows: a garbled grid-block name still lands on the right course through its day and times', () => {
  const row = rowFromBlock('Enחומרים 1 (סופי-הרציאה+תרגול)', 4, courses, { start: '09:00', end: '09:50' });
  assert.deepEqual(matchRows([row], courses).found, ['B1/1']);
});

test('matchGrid: tries the first-row hour and keeps the one that places most groups', () => {
  const blocks = [
    // geometry only: offsets/lengths in hours from the first row; the true first row is 08:00
    { text: 'חוזק חומרים 1 (סופי-הרצאה+תרגול)', day: 1, off: 0, hours: 2 },
    { text: 'חוזק חומרים 1 (סופי-הרצאה+תרגול)', day: 4, off: 0, hours: 1 },
    { text: 'חוזק חומרים 1 (תרגול)', day: 4, off: 1, hours: 1 },
    { text: 'תרמודינמיקה 1 (סופי-הרצאה+תרגול)', day: 2, off: 5, hours: 2 },
  ];
  assert.deepEqual(matchGrid(blocks, courses).found, ['B1', 'B1/1', 'A1']);
  const shifted = blocks.map((b) => ({ ...b, off: b.off + 1 })); // first row is 07:00
  assert.deepEqual(matchGrid(shifted, courses).found, ['B1', 'B1/1', 'A1']);
});

test('rowFromBlock tolerates OCR slips in the name', () => {
  const row = rowFromBlock('פיזיקה חשמל ומגנסיות (תרגול) 14:00 - 15:50', 1, courses);
  assert.deepEqual(matchRows([row], courses).found, ['C1']);
});

const W = (t, x0, y0) => ({ t, x0, x1: x0 + t.length * 8, y0, y1: y0 + 14 });
test('rowsFromWords: rows anchored on the semester digit; a lost code falls back to the name; a stray number elsewhere starts nothing', () => {
  const words = [
    W('1', 960, 100),
    W('30127', 880, 100),
    W('חוזק', 800, 100),
    W('חומרים', 740, 100),
    W('1', 700, 100),
    W('ראשון,', 300, 100),
    W('08:00-09:50,', 220, 100),
    W('רביעי,', 300, 120),
    W('08:00-08:50,', 220, 120),
    W('1', 960, 200),
    W('₪2', 880, 200),
    W('תרמודינמיקה', 780, 200),
    W('1', 700, 200),
    W('שני,', 300, 200),
    W('13:00-14:50,', 220, 200),
    W('90904', 60, 200), // 90904 sits in the room column
    W('1', 960, 300),
    W('90904', 880, 300),
    W('פיזיקה', 800, 300),
    W('חשמל', 740, 300),
    W('ומגנטיות', 660, 300),
    W('ראשון,', 300, 300),
    W('14:00-15:50,', 220, 300),
  ];
  const rows = rowsFromWords(words, courses);
  assert.deepEqual(
    rows.map((r) => r.cid),
    ['30127', '30112', '90904']
  );
  assert.deepEqual(
    rows[0].meets.map((m) => m.start),
    ['08:00', '08:00']
  );
  assert.deepEqual(matchRows(rows, courses).found, ['B1', 'A1', 'C1']);
  assert.equal(rowsFromWords([W('1', 960, 100), W('hello', 10, 10)], courses), null);
});

test('rowsFromWords: a code cut short keeps every near course as a candidate, and the meeting times choose', () => {
  const cs = {
    90911: { name: 'אלגברה', groups: [g('X1', 'הרצאה', [2, '13:00', '15:50'])] },
    90915: { name: 'חדוא', groups: [g('Y1', 'הרצאה', [3, '13:00', '14:50'])] }
  };
  const words = [
    W('1', 960, 100),
    W('9091', 880, 100),
    W('ראשון,', 300, 100),
    W('שני,', 300, 100),
    W('13:00-15:50,', 220, 100),
    W('1', 960, 200),
    W('9091', 880, 200),
    W('שלישי,', 300, 200),
    W('13:00-14:50,', 220, 200)
  ];
  const rows = rowsFromWords(words, cs);
  assert.deepEqual(
    rows.map((r) => r.cids?.slice().sort()),
    [
      ['90911', '90915'],
      ['90911', '90915']
    ]
  );
  assert.deepEqual(matchRows(rows, cs).found, ['X1', 'Y1']);
});

test('mergeScans: one group per course and type, a table first; beside a table a grid only fills gaps, without its guesses or notes', () => {
  const courses = {
    A: { groups: [{ id: 'a1', type: 'הרצאה' }, { id: 'a2', type: 'הרצאה' }, { id: 'a3', type: 'תרגיל' }] },
    B: { groups: [{ id: 'b1', type: 'הרצאה' }] },
    C: { groups: [{ id: 'c1', type: 'הרצאה' }] }
  };
  const table = { found: ['a1'], unknown: ['x'], ambiguous: 1, weak: 2 };
  const grid = { found: ['a2', 'a3', 'b1', 'c1'], weakIds: ['c1'], unknown: ['y', 'x'], ambiguous: 4, weak: 8 };
  const noRows = (r) => ({ ...r, rows: undefined });
  assert.deepEqual(noRows(mergeScans([table], [grid], courses)), { found: ['a1', 'a3', 'b1'], unknown: ['x'], ambiguous: 1, weak: 2, rows: undefined });
  assert.deepEqual(
    noRows(mergeScans([], [grid], courses)),
    { found: ['a2', 'a3', 'b1', 'c1'], unknown: ['y', 'x'], ambiguous: 4, weak: 8, rows: undefined },
    'no table: the grid is the whole answer, its guesses and notes too'
  );
  assert.deepEqual(mergeScans([{ found: ['a1'], unknown: ['x'], ambiguous: 0, weak: 0 }, { found: ['a1'], unknown: ['x'], ambiguous: 0, weak: 0 }], [], courses).found, ['a1']);
});

// Review rows (the edit page): per row source, hours, candidates, chosen group and confidence.
const coded = (cid, meets, extra = {}) => ({ cid, code: cid, kinds: [], meets, via: 'code', text: `row ${cid}`, ...extra });
const oneRow = (row, cs = courses) => matchRows([row], cs).rows[0];

test("a code row that read one of a group's two meetings is not sure", () => {
  const row = coded('30127', [{ days: [1], start: '08:00', end: '09:50' }]);
  const group = g('B1', 'סופי-הרצאה+תרגול', [1, '08:00', '09:50'], [4, '08:00', '08:50']);
  const only = (candidate) => ({ 30127: { name: 'חוזק חומרים 1', groups: [candidate] } });
  const control = oneRow(row, only({ ...group, meetings: group.meetings.slice(0, 1) }));
  assert.equal(control.chosen, 'B1');
  assert.equal(control.confidence, 'sure', 'one meeting read from a one-meeting group remains sure');
  const partial = oneRow(row, only(group));
  assert.equal(partial.chosen, 'B1', 'the only candidate still matches');
  assert.deepEqual(partial.candidates, ['B1']);
  assert.equal(partial.confidence, 'weak', 'a meeting nobody read requires review');
});

test('review rows: a coded row with the exact day and hours is sure', () => {
  const r = oneRow(coded('30112', [{ days: [2], start: '13:00', end: '14:50' }]));
  assert.equal(r.confidence, 'sure');
  assert.equal(r.chosen, 'A1');
  assert.deepEqual(r.candidates, ['A1']);
  assert.deepEqual(r.meets, [{ day: 2, start: '13:00', end: '14:50' }]);
  assert.deepEqual([r.code, r.via, r.text, r.type], ['30112', 'code', 'row 30112', 'סופי-הרצאה+תרגול']);
});

test('review rows: a code corrected by one digit is not sure even with exact hours; an OCR look-alike letter is', () => {
  const meets = [{ days: [2], start: '13:00', end: '14:50' }];
  assert.equal(oneRow(coded('30112', meets, { code: '30113' })).confidence, 'weak');
  assert.equal(oneRow(coded('30112', meets, { code: '3O112' })).confidence, 'sure');
});

test('review rows: hours only close, or a day that is not certain, is weak', () => {
  assert.equal(oneRow(coded('30112', [{ days: [2], start: '13:00', end: '15:00' }])).confidence, 'weak');
  assert.equal(oneRow(coded('30112', [{ days: [2, 3], start: '13:00', end: '14:50' }])).confidence, 'weak');
  assert.equal(oneRow(coded('30112', [{ days: null, start: '13:00', end: '14:50' }])).confidence, 'weak');
});

test('review rows: a course found by name is weak even with exact hours', () => {
  const words = [
    W('1', 960, 200), W('₪2', 880, 200), W('תרמודינמיקה', 780, 200), W('1', 700, 200), W('שני,', 300, 200), W('13:00-14:50,', 220, 200),
    W('1', 960, 300), W('90904', 880, 300), W('ראשון,', 300, 300), W('14:00-15:50,', 220, 300),
  ];
  const rows = rowsFromWords(words, courses);
  assert.deepEqual(rows.map((r) => r.via), ['name', 'code']);
  const r = matchRows(rows, courses).rows;
  assert.deepEqual(r.map((x) => x.chosen), ['A1', 'C1']);
  assert.equal(r[0].confidence, 'weak');
});

test('review rows: two groups with equal scores are a tie, both listed', () => {
  const cs = { 1: { name: 'א', groups: [g('T1', 'הרצאה', [2, '10:00', '11:50']), g('T2', 'הרצאה', [2, '10:00', '11:50'])] } };
  const r = oneRow(coded('1', [{ days: [2], start: '10:00', end: '11:50' }]), cs);
  assert.equal(r.confidence, 'tie');
  assert.deepEqual(r.candidates.slice().sort(), ['T1', 'T2']);
});

test('review rows: an unknown code is none and keeps its hours', () => {
  const m = matchRows(rowsFromTable(TABLE, courses), courses);
  const none = m.rows.find((r) => r.code === '99999');
  assert.equal(none.confidence, 'none');
  assert.equal(none.chosen, null);
  assert.deepEqual(none.meets, [{ day: 1, start: '08:00', end: '09:50' }]);
  assert.deepEqual(m.rows.map((r) => r.confidence), ['sure', 'sure', 'sure', 'sure', 'weak', 'none']); // the 5th row's day ("שכישי") is not certain
});

test('review rows: a grid row has no code, its name is the OCR name', () => {
  const row = rowFromBlock('אנליזה הרמונית (תרגול) 10:00 - 10:50', 4, courses);
  const r = oneRow(row);
  assert.deepEqual([r.code, r.via, r.confidence, r.name, r.type], [null, 'grid', 'none', 'אנליזההרמונית', 'תרגול']);
});

test('review rows: results keep every earlier field and value', () => {
  const { rows, ...rest } = matchRows(rowsFromTable(TABLE, courses), courses);
  assert.equal(rows.length, 6);
  // values the same fixture gave before the rows existed
  assert.deepEqual(rest, { found: ['A1', 'A1/1', 'B1', 'B1/1', 'C1'], unknown: ['99999'], ambiguous: 0, quality: 149, weak: 0, weakIds: [] });
});

test('mergeScans: rows for every group taken (grid gap-fillers too) and for each unknown', () => {
  // the table lacks the physics course; the grid has it, and a group the table already has
  const table = matchRows(rowsFromTable(TABLE, courses).filter((r) => r.cid !== '90904'), courses);
  const grid = matchGrid([
    { text: 'חוזק חומרים 1 (תרגול)', day: 4, off: 1, hours: 1 }, // B1/1, already in the table
    { text: 'פיזיקה חשמל ומגנטיות (סופי-הרצאה+תרגול)', day: 1, off: 6, hours: 2 }, // C1: new
  ], courses);
  const merged = mergeScans([table], [grid], courses);
  assert.deepEqual(merged.found, ['A1', 'A1/1', 'B1', 'B1/1', 'C1']);
  assert.deepEqual(merged.rows.map((r) => r.chosen).filter(Boolean), merged.found);
  assert.equal(merged.rows.find((r) => r.chosen === 'C1').via, 'grid');
  assert.equal(merged.rows.find((r) => r.chosen === 'B1/1').via, 'code', 'the table row stays, not the grid duplicate');
  assert.deepEqual(merged.rows.filter((r) => !r.chosen).map((r) => r.code), merged.unknown);
  const alone = mergeScans([], [matchGrid([{ text: 'חוזק חומרים 1 (סופי-הרצאה+תרגול)', day: 1, off: 0, hours: 2 }], courses)], courses);
  assert.deepEqual(alone.rows.map((r) => r.chosen), alone.found);
});
