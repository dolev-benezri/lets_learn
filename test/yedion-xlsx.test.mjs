// The yedion's timetable .xlsx: read into rows, matched to groups. Synthetic files only (made-up codes, names and lecturers):
// a real export carries the student's ID number in its properties and is never committed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from '../web/vendor/fflate/fflate.js';
import { rowsFromXlsx } from '../web/yedion-xlsx.js';
import { matchRows } from '../web/friend-schedule.js';
import { normalizeEdit, emptyEdit } from '../web/edit-state.js';

const M = (day, start, end) => ({ day, start, end, room: '' });
const G = (id, type, lecturer, meetings) => ({ id, type, lecturer, primary: !id.includes('/'), linked: [], meetings });
const COURSES = {
  11111: {
    name: 'אנליזה מדומה',
    groups: [
      G('211111101', 'סופי-הרצאה+תרגול', 'פרופ\' אלפא בטא', [M(1, '08:00', '09:50')]),
      G('211111102', 'סופי-הרצאה+תרגול', 'ד"ר גמא דלתא', [M(1, '08:00', '09:50')]),
      G('211111101/1', 'תרגול', 'מר הא וו', [M(5, '11:00', '11:50')])
    ]
  },
  22222: {
    name: 'חוזק דמיוני 1',
    groups: [
      G('222222201', 'סופי-הרצאה+תרגול', 'ד"ר זין חית', [M(3, '13:00', '14:50'), M(4, '14:00', '14:50')]),
      G('222222201/1', 'תרגול', 'ד"ר זין חית', [M(4, '15:00', '15:50')])
    ]
  }
};
const DAYS = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי'];
const COLS = 'BCDEFG';
const LECTURE = '11111-אנליזה מדומה סופי-הרצאה+תרגול\tפרופ\' אלפא בטא 202 בניין א 08:00-09:50';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

// cells: { 'B3': text }; strings go to the shared table unless `inline`; `rich` splits each shared string into two <r> runs
function xlsx(cells, { inline = false, rich = false, sheetName = 'FileFromYedion', extraSheetFirst = false, props = true } = {}) {
  const all = { A1: 'טבלה - לוח מערכת שעות', ...Object.fromEntries(DAYS.map((d, i) => [`${COLS[i]}2`, d])), ...cells };
  const sst = [];
  const cell = (ref, text) => {
    if (inline) return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
    sst.push(text);
    return `<c r="${ref}" s="4" t="s"><v>${sst.length - 1}</v></c>`;
  };
  const byRow = {};
  for (const [ref, text] of Object.entries(all)) (byRow[ref.match(/\d+/)[0]] ??= []).push(cell(ref, text));
  const sheet = `<?xml version="1.0"?><worksheet><cols><col min="1" max="1"/></cols><sheetData>${Object.entries(byRow)
    .map(([r, cs]) => `<row r="${r}"><c r="A${r}" s="3"><v>0.375</v></c>${cs.join('')}<c r="H${r}" s="7"/></row>`)
    .join('')}</sheetData></worksheet>`;
  const si = (t) => (rich ? `<si><r><t>${esc(t.slice(0, 3))}</t></r><r><rPr><b/></rPr><t xml:space="preserve">${esc(t.slice(3))}</t></r><rPh><t>x</t></rPh></si>` : `<si><t xml:space="preserve">${esc(t)}</t></si>`);
  const sheets = extraSheetFirst
    ? `<sheet name="Other" sheetId="1" r:id="rId1"/><sheet name="${sheetName}" sheetId="2" r:id="rId2"/>`
    : `<sheet name="${sheetName}" sheetId="1" r:id="rId2"/>`;
  const files = {
    '[Content_Types].xml': strToU8('<Types/>'),
    'xl/workbook.xml': strToU8(`<workbook xmlns:r="r"><sheets>${sheets}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="ws" Target="worksheets/sheet2.xml"/></Relationships>'
    ),
    'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>נוסף</t></is></c></row></sheetData></worksheet>'),
    'xl/worksheets/sheet2.xml': strToU8(sheet)
  };
  if (!inline) files['xl/sharedStrings.xml'] = strToU8(`<sst>${sst.map(si).join('')}</sst>`);
  if (props) files['docProps/core.xml'] = strToU8('<cp:coreProperties><dc:creator>ידיעון בע"מ123456782</dc:creator></cp:coreProperties>');
  return zipSync(files);
}
const WEEK = {
  B3: LECTURE,
  B4: 'המשך\tאנליזה מדומה',
  F6: '11111-אנליזה מדומה תרגול מר הא וו\t201 בניין א 11:00-11:50',
  D8: '22222-חוזק דמיוני 1 סופי-הרצאה+תרגול\tד"ר זין חית 302 בניין א 13:00-14:50',
  D9: 'המשך\tחוזק דמיוני 1',
  E9: '22222-חוזק דמיוני 1 סופי-הרצאה+תרגול\tד"ר זין חית 101 בניין א 14:00-14:50',
  E10: '22222-חוזק דמיוני 1 תרגול\tד"ר זין חית 101 בניין א 15:00-15:50'
};

test('a yedion timetable: one row per course and type, days from the header, continuations skipped, the properties never read', () => {
  const rows = rowsFromXlsx(xlsx(WEEK), COURSES);
  assert.deepEqual(
    rows.map((r) => [r.code, r.kinds.join('+'), r.meets.map((m) => `${m.days[0]} ${m.start}-${m.end}`).join(', '), r.via]),
    [
      ['11111', 'הרצאה+תרגול', '1 08:00-09:50', 'xlsx'],
      ['11111', 'תרגול', '5 11:00-11:50', 'xlsx'],
      ['22222', 'הרצאה+תרגול', '3 13:00-14:50, 4 14:00-14:50', 'xlsx'],
      ['22222', 'תרגול', '4 15:00-15:50', 'xlsx']
    ]
  );
  assert.ok(rows.every((r) => r.cid === r.code && !/123456782/.test(r.text)));
});

test('rich-text strings, inline strings and a sheet found through the workbook (not the first in the zip) read the same', () => {
  const plain = rowsFromXlsx(xlsx(WEEK), COURSES).map((r) => [r.code, r.kinds, r.meets]);
  for (const opts of [{ rich: true }, { inline: true }, { extraSheetFirst: true }, { rich: true, extraSheetFirst: true, props: false }])
    assert.deepEqual(rowsFromXlsx(xlsx(WEEK, opts), COURSES).map((r) => [r.code, r.kinds, r.meets]), plain, JSON.stringify(opts));
});

test('a course the data lacks keeps its code with no course; a name word that looks like a type is not taken for the type', () => {
  const rows = rowsFromXlsx(
    xlsx({ B3: '99999-מעבדה בכימיה דמה מעבדה\tמר טט 08:00-09:50', C3: '22222-חוזק דמיוני 1 תרגול\tד"ר זין חית 08:00-08:50' }),
    COURSES
  );
  assert.deepEqual(rows.map((r) => [r.cid, r.code, r.kinds]), [[null, '99999', ['מעבדה']], ['22222', '22222', ['תרגול']]]);
});

test('not a yedion timetable: null (no day headers, not a zip); a zip that claims huge parts is refused by name', () => {
  assert.equal(rowsFromXlsx(zipSync({ 'xl/workbook.xml': strToU8('<workbook/>') }), COURSES), null);
  assert.equal(rowsFromXlsx(strToU8('just text, not a zip'), COURSES), null);
  const noDays = zipSync({
    'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="FileFromYedion" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData><row r="3"><c r="B3" t="inlineStr"><is><t>${esc(LECTURE)}</t></is></c></row></sheetData></worksheet>`)
  });
  assert.equal(rowsFromXlsx(noDays, COURSES), null);
  const bomb = zipSync({ 'xl/sharedStrings.xml': new Uint8Array(9 << 20) }, { level: 9 });
  assert.ok(bomb.length < 1 << 20);
  assert.throws(() => rowsFromXlsx(bomb, COURSES), (e) => e.user === true);
});

test('matching: exact codes are sure; two lecture groups at the same hour are told apart by the lecturer the file names', () => {
  const m = matchRows(rowsFromXlsx(xlsx(WEEK), COURSES), COURSES);
  assert.deepEqual(m.found, ['211111101', '211111101/1', '222222201', '222222201/1']);
  assert.equal(m.ambiguous, 0);
  assert.deepEqual(m.rows.map((r) => r.confidence), ['sure', 'sure', 'sure', 'sure']);
  // no lecturer in the cell: a real tie, left to the student
  const bare = matchRows(rowsFromXlsx(xlsx({ B3: '11111-אנליזה מדומה סופי-הרצאה+תרגול\t202 בניין א 08:00-09:50' }), COURSES), COURSES);
  assert.equal(bare.rows[0].confidence, 'tie');
});

test('a lesson the file hid (another starts in the same hour) leaves its group weak, not sure', () => {
  const { E9, ...hidden } = WEEK;
  const m = matchRows(rowsFromXlsx(xlsx(hidden), COURSES), COURSES);
  const row = m.rows.find((r) => r.code === '22222' && r.type.startsWith('סופי'));
  assert.equal(row.chosen, '222222201');
  assert.equal(row.confidence, 'weak');
});

test('a hidden lesson that lets another group fit better is not sure when the cell names the first group\'s lecturer', () => {
  const { E9, ...hidden } = WEEK;
  const courses = structuredClone(COURSES);
  courses[22222].groups.push(G('222222202', 'סופי-הרצאה+תרגול', 'ד"ר טית יוד', [M(3, '13:00', '14:50')]));
  const row = matchRows(rowsFromXlsx(xlsx(hidden), courses), courses).rows.find((r) => r.code === '22222' && r.type.startsWith('סופי'));
  assert.equal(row.chosen, '222222202'); // one meeting fits one meeting best
  assert.equal(row.confidence, 'weak'); // but the cell names ד"ר זין חית, who teaches 222222201: the student decides
  // the full week names both meetings: the right group, sure
  const full = matchRows(rowsFromXlsx(xlsx(WEEK), courses), courses).rows.find((r) => r.code === '22222' && r.type.startsWith('סופי'));
  assert.deepEqual([full.chosen, full.confidence], ['222222201', 'sure']);
});

test('a review row read from the file survives the edit page saving and reading it back', () => {
  const rows = matchRows(rowsFromXlsx(xlsx(WEEK), COURSES), COURSES).rows;
  const n = normalizeEdit({ ...emptyEdit(), draft: { rows, choices: {}, registered: false, sem: 'א' } });
  assert.equal(n.draft.rows.length, rows.length);
  assert.ok(n.draft.rows.every((r) => r.via === 'xlsx'));
});
