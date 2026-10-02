import test from 'node:test';
import assert from 'node:assert/strict';
import { rowsFromTable, rowsFromWords, rowFromBlock, matchRows, matchGrid } from '../web/friend-schedule.js';

const g = (id, type, ...meetings) => ({ id, type, meetings: meetings.map(([day, start, end]) => ({ day, start, end })) });
const courses = {
  30112: { name: 'תרמודינמיקה 1', groups: [g('A1', 'סופי-הרצאה+תרגול', [2, '13:00', '14:50']), g('A2', 'סופי-הרצאה+תרגול', [4, '14:00', '15:50']), g('A1/1', 'תרגול', [2, '15:00', '15:50'])] },
  30127: { name: 'חוזק חומרים 1', groups: [g('B1', 'סופי-הרצאה+תרגול', [1, '08:00', '09:50'], [4, '08:00', '08:50']), g('B4', 'סופי-הרצאה+תרגול', [1, '10:00', '11:50'], [3, '08:00', '08:50']), g('B1/1', 'תרגול', [4, '09:00', '09:50'])] },
  90904: { name: 'פיזיקה חשמל ומגנטיות', groups: [g('C1', 'סופי-הרצאה+תרגול', [1, '14:00', '15:50'], [3, '09:00', '10:50'])] },
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
  assert.deepEqual(rows.map((r) => r.cid), ['30112', '30112', '30127', '30127', '90904', null]);
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
  assert.deepEqual(matchRows([rowFromBlock('אנליזה הרמונית (תרגול) 10:00 - 10:50', 4, courses)], courses).unknown, ['אנליזההרמונית']);
});

test('matchRows: a garbled grid-block name still lands on the right course through its day and times', () => {
  const row = rowFromBlock('Enחומרים 1 (סופי-הרציאה+תרגול)', 4, courses, { start: '09:00', end: '09:50' });
  assert.deepEqual(matchRows([row], courses).found, ['B1/1']);
});

test('matchGrid: tries the first-row hour and keeps the one that places most groups', () => {
  const blocks = [ // geometry only: offsets/lengths in hours from the first row; the true first row is 08:00
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
    W('1', 960, 100), W('30127', 880, 100), W('חוזק', 800, 100), W('חומרים', 740, 100), W('1', 700, 100), W('ראשון,', 300, 100), W('08:00-09:50,', 220, 100),
    W('רביעי,', 300, 120), W('08:00-08:50,', 220, 120),
    W('1', 960, 200), W('₪2', 880, 200), W('תרמודינמיקה', 780, 200), W('1', 700, 200), W('שני,', 300, 200), W('13:00-14:50,', 220, 200), W('90904', 60, 200), // 90904 sits in the room column
    W('1', 960, 300), W('90904', 880, 300), W('פיזיקה', 800, 300), W('חשמל', 740, 300), W('ומגנטיות', 660, 300), W('ראשון,', 300, 300), W('14:00-15:50,', 220, 300),
  ];
  const rows = rowsFromWords(words, courses);
  assert.deepEqual(rows.map((r) => r.cid), ['30127', '30112', '90904']);
  assert.deepEqual(rows[0].meets.map((m) => m.start), ['08:00', '08:00']);
  assert.deepEqual(matchRows(rows, courses).found, ['B1', 'A1', 'C1']);
  assert.equal(rowsFromWords([W('1', 960, 100), W('hello', 10, 10)], courses), null);
});

test('rowsFromWords: a code cut short keeps every near course as a candidate, and the meeting times choose', () => {
  const cs = { 90911: { name: 'אלגברה', groups: [g('X1', 'הרצאה', [2, '13:00', '15:50'])] }, 90915: { name: 'חדוא', groups: [g('Y1', 'הרצאה', [3, '13:00', '14:50'])] } };
  const words = [W('1', 960, 100), W('9091', 880, 100), W('ראשון,', 300, 100), W('שני,', 300, 100), W('13:00-15:50,', 220, 100), W('1', 960, 200), W('9091', 880, 200), W('שלישי,', 300, 200), W('13:00-14:50,', 220, 200)];
  const rows = rowsFromWords(words, cs);
  assert.deepEqual(rows.map((r) => r.cids?.slice().sort()), [['90911', '90915'], ['90911', '90915']]);
  assert.deepEqual(matchRows(rows, cs).found, ['X1', 'Y1']);
});
