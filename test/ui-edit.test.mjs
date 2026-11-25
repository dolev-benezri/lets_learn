// The edit page's pure HTML and row helpers (the screens themselves run in test/browser/edit-*.spec.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { stepOneHtml, loadedLineA, lessonsFromRows, pendingRows, lostRow, movedDay, changedDays } = await import('../web/ui-edit.js');
const { groupIndex } = await import('../web/ui-grid.js');
const { emptyEdit } = await import('../web/edit-state.js');
const { real } = await import('./fixtures/real.mjs');

const data = real('2027-1/30-2026.json');
const row = (over) => ({
  code: '10336', name: 'MATLAB', type: 'סופי-מעבדה', text: '', via: 'code', meets: [{ day: 5, start: '12:00', end: '15:50' }],
  candidates: ['271033601', '271033602'], chosen: '271033601', confidence: 'tie', ...over
});
const SURE = row({ code: '30003', confidence: 'sure', candidates: ['273000302'], chosen: '273000302', meets: [{ day: 4, start: '14:00', end: '15:50' }] });
const NONE = row({ code: '99999', name: null, confidence: 'none', candidates: [], chosen: null, meets: [{ day: 1, start: '08:00', end: '09:50' }] });
const withDraft = (rows, choices = {}) => ({ ...emptyEdit(), draft: { rows, choices, registered: false, sem: 'א' } });
const html = (rows, choices, opts) => parse(stepOneHtml(withDraft(rows, choices), data, rows, opts));

test('stepOneHtml: a tie row lists both candidates, a none row offers no group, a sure row is not listed', () => {
  const root = html([SURE, row({}), NONE]);
  assert.match(root.text, /לבדיקה/);
  assert.equal(root.querySelectorAll('[data-ed-row]').length, 2, 'the sure row is not in the review list');
  const tie = root.querySelector('[data-ed-row="1"]');
  assert.deepEqual(tie.querySelectorAll('input[type=radio]').map((i) => i.getAttribute('value')), ['271033601', '271033602', '']);
  const none = root.querySelector('[data-ed-row="2"]');
  assert.match(none.text, /בלי קבוצה \(נשאר קבוע\)/);
  assert.equal(none.querySelectorAll('input[type=radio]').length, 1);
});

test('stepOneHtml: the way in, the registered box, the next button; copy is exact', () => {
  const root = html([SURE]);
  const t = root.text;
  for (const s of ['קובץ מערכת (אקסל מאפקה-נט, PDF או צילום)', 'לבחור קורסים וקבוצות ידנית', 'המערכת כבר רשומה במכללה', 'הבא: שינויים'])
    assert.ok(t.includes(s), s);
  // the yedion's sign-in opens beside the site: the student downloads the Excel file there and loads it here
  const a = root.querySelector('.edit-yedion a');
  assert.equal(a.getAttribute('href'), 'https://yedionp.afeka.ac.il/yedion/fireflyweb.aspx');
  assert.equal(a.getAttribute('target'), '_blank');
  assert.equal(a.getAttribute('rel'), 'noopener noreferrer');
  assert.match(root.querySelector('.edit-yedion').text, /באפקה-נט \(נפתח בלשונית חדשה\) אפשר להוריד את מערכת השעות כקובץ אקסל/);
  // where the file is in the portal, in the portal's own words
  for (const s of ['בחינות / ציונים / מערכת שעות', 'לוח מערכת שעות', 'ביצוע', 'להפקת דו"ח אקסל'])
    assert.ok(root.querySelector('.edit-yedion').text.includes(s), s);
  assert.equal(root.querySelectorAll('[data-ed-row]').length, 0, 'nothing to review');
  // why a load button did nothing is said inside the buttons' card, above them (on a phone the "הבא" row is far below)
  const ways = root.querySelector('.edit-ways');
  assert.equal(ways.querySelector('#edWaysMsg').getAttribute('role'), 'alert');
  assert.ok(ways.innerHTML.indexOf('edWaysMsg') < ways.innerHTML.indexOf('data-ed="loadFile"'));
  assert.ok(!/החל|הרשם/.test(root.querySelectorAll('button').map((b) => b.text).join(' ')), 'no apply/register verb on an action');
});

test('stepOneHtml: before a load the load card leads; once loaded it folds under one line after what was read', () => {
  const empty = parse(stepOneHtml(emptyEdit(), data, []));
  assert.equal(empty.querySelector('details'), null, 'nothing loaded: the buttons are open');
  assert.equal(empty.querySelector('section.edit-ways [data-ed="loadFile"]').classList.contains('primary'), true);
  const root = html([SURE, row({})]), col = root.querySelector('.edit-col').innerHTML;
  const fold = root.querySelector('details.edit-ways');
  assert.equal(fold.hasAttribute('open'), false);
  assert.equal(fold.firstChild.tagName, 'SUMMARY');
  assert.equal(fold.querySelector('summary').text, 'טעינה מחדש או שינוי ידני');
  for (const b of ['loadFile', 'loadHand']) assert.ok(fold.querySelector(`[data-ed="${b}"]`), b);
  assert.ok(fold.querySelector('#edWaysMsg') && fold.querySelector('.edit-yedion a'));
  assert.ok(col.indexOf('rvH') < col.indexOf('<details'), 'the review comes first');
  assert.ok(col.indexOf('data-ed-reg') < col.indexOf('<details'), 'then the registered box');
  assert.equal(root.querySelectorAll('[data-ed="loadFile"]').length, 1);
});

test('stepOneHtml: a made choice is checked', () => {
  const root = html([row({})], { 0: '271033602' });
  assert.equal(root.querySelector('input[value="271033602"]').hasAttribute('checked'), true);
  assert.equal(root.querySelector('input[value="271033601"]').hasAttribute('checked'), false);
});

test('stepOneHtml: another dataset shows the reload note and snapshots, no way on to step 2', () => {
  const st = {
    ...emptyEdit(), dataset: { year: 2026, sem: 'א', program: 30, startYear: 2025 },
    original: [{ course: '30003', name: 'מבוא לכימיה', type: 'הרצאה', group: 'x1', day: 4, start: '14:00', end: '15:50' }]
  };
  st.baseline = st.original;
  const root = parse(stepOneHtml(st, data, [], { same: false }));
  assert.ok(root.text.includes('המערכת נשמרה מול נתונים אחרים. טענו אותה שוב כדי לערוך.'));
  assert.match(root.text, /מבוא לכימיה/);
  assert.ok(root.text.includes('חזרה למערכת המקורית'));
  assert.equal(root.querySelector('[data-ed="next"]'), null);
  assert.equal(root.querySelector('a[href="#edit/changes"]'), null);
  assert.equal(root.querySelector('details'), null, 'loading again is the way on here: the buttons stay open');
  assert.ok(root.querySelector('section.edit-ways [data-ed="loadFile"]'));
});

test('changedDays: the days of the changed groups and of the old places; none when nothing changed', () => {
  const byId = groupIndex(data), [a, b] = Object.values(data.courses).flatMap((c) => c.groups).filter((g) => g.meetings.length);
  assert.deepEqual([...changedDays(byId, new Set([a.id]), [])].sort(), [...new Set(a.meetings.map((m) => m.day))].sort());
  const both = changedDays(byId, new Set([a.id, b.id, 'not-a-group']), [{ day: 6, start: '08:00', end: '09:00' }]);
  for (const m of [...a.meetings, ...b.meetings]) assert.ok(both.has(m.day), m.day);
  assert.ok(both.has(6), 'a ghost day');
  assert.equal(changedDays(byId, new Set(), []).size, 0);
});

test('pendingRows: only a sure row needs nothing; a tie, weak or none row waits for a choice (none: the tap that keeps it fixed)', () => {
  const rows = [SURE, row({}), NONE, row({ confidence: 'weak', candidates: ['271033601'] })];
  assert.deepEqual(pendingRows(rows, {}), [1, 2, 3]);
  assert.deepEqual(pendingRows(rows, { 1: '271033601', 2: null, 3: null }), []);
});

test('lessonsFromRows: chosen groups give their lessons; none gives fixed lessons from the row hours', () => {
  const ls = lessonsFromRows([SURE, row({}), NONE], { 1: '271033602', 2: null }, data);
  assert.deepEqual(ls.filter((l) => l.group).map((l) => l.group), ['273000302', '271033602']);
  const fixed = ls.find((l) => !l.group);
  assert.deepEqual([fixed.course, fixed.day, fixed.start, fixed.end], ['99999', 1, '08:00', '09:50']);
  const kept = lessonsFromRows([row({})], { 0: null }, data);
  assert.deepEqual(kept.map((l) => [l.group, l.day, l.start]), [[null, 5, '12:00']], 'a row confirmed as no group stays fixed');
  const gone = lessonsFromRows([row({})], { 0: '271039999' }, data);
  assert.deepEqual(gone.map((l) => [l.group, l.day, l.start]), [[null, 5, '12:00']], 'a group missing from the data stays fixed with the row hours');
  assert.deepEqual(lessonsFromRows([NONE], { 0: null }, null).map((l) => l.day), [1], 'no data: fixed rows still read');
});

test('stepOneHtml: the loaded line says the semester and how many courses were read', () => {
  assert.match(html([SURE, row({}), NONE]).text, /נטענה מערכת של סמסטר א׳ · 3 קורסים/);
  assert.match(html([SURE, { ...SURE, type: 'תרגול' }]).text, /נטענה מערכת של סמסטר א׳ · קורס אחד/);
});

test('stepOneHtml: a course read by name and its tutorial picked by code count once', () => {
  const byName = row({ code: null, via: 'name', name: 'MATLAB', chosen: '271033601', confidence: 'weak' });
  assert.match(html([byName, row({ chosen: '271033601', confidence: 'sure' })]).text, /· קורס אחד/);
});

test('movedDay: the new day of a moved meeting unless it is shown; a move within the day is none; a lecture and tutorial trading days is a move', () => {
  const M = (day, start, type, group) => ({ course: 'C', name: 'c', type, group, day, start, end: '09:50' });
  const base = [M(2, '08:00', 'הרצאה', 'g1'), M(4, '08:00', 'תרגול', 'g1/1')];
  const p = (lessons) => ({ changed: ['C'], lessons });
  assert.equal(movedDay(base, p([M(3, '08:00', 'הרצאה', 'g2'), M(4, '08:00', 'תרגול', 'g1/1')]), 1), 3);
  assert.equal(movedDay(base, p([M(3, '08:00', 'הרצאה', 'g2'), M(4, '08:00', 'תרגול', 'g1/1')]), 3), null, 'already shown');
  assert.equal(movedDay(base, p([M(2, '12:00', 'הרצאה', 'g2'), M(4, '08:00', 'תרגול', 'g1/1')]), 1), null, 'same day, new hours');
  assert.equal(movedDay(base, p([M(4, '12:00', 'הרצאה', 'g2'), M(2, '12:00', 'תרגול', 'g2/1')]), 1), 4, 'they trade days');
});

test('lostRow: a chosen group gone from the data, on a row with no hours, is found; rows that give lessons are not', () => {
  assert.equal(lostRow([SURE, row({ meets: [] })], { 1: '271039999' }, data), 1);
  assert.equal(lostRow([SURE, row({})], { 1: '271039999' }, data), -1, 'its hours keep it as a fixed lesson');
  assert.equal(lostRow([SURE, NONE], { 1: null }, data), -1);
});

// ---------- step 2 (Task 11) ----------
const { lessonMenuHtml, overlapMessage, parallelPrompts, blockedLines, addableCourses } = await import('../web/ui-edit.js');
const { displayData, FIXED } = await import('../web/edit-search.js');
const grp = (id, day, start, end) => ({ id, type: 'הרצאה', primary: true, linked: [], full: false, lecturer: 'L', exams: [], meetings: [{ day, start, end, room: 'r' }] });
const crs = (name, groups, prereqs = []) => ({ name, credits: 3, offered: true, prereqs, groups });
const par = (id, name) => ({ kind: 'מקביל', anyOf: [{ id, name }] });
const small = () => ({
  year: 2027, startYear: 2026, program: 30, semester: 'א',
  courses: {
    A: crs('אלף', [grp('A1', 1, '08:00', '09:50')]),
    B: crs('בית', [grp('B1', 1, '09:00', '10:50')], [par('A', 'אלף')]),
    C: crs('גימל', [grp('C1', 2, '08:00', '09:50')]),
    D: crs('דלת', [grp('D1', 3, '08:00', '09:50')])
  }
});
const L = (course, group, day, start, end, name = course) => ({ course, name, type: 'הרצאה', group, day, start, end });
const st = (lessons, over = {}) => ({ ...emptyEdit(), baseline: lessons, original: lessons, ...over });

test('lessonMenuHtml: the three actions for a real course, only "להוריד מהמערכת" for a course missing from the data', () => {
  const d = small();
  const ls = [L('A', 'A1', 1, '08:00', '09:50', 'אלף'), L('X', null, 4, '10:00', '11:50', 'קורס חיצוני')];
  const dd = displayData(ls, d);
  const root = parse(lessonMenuHtml(st(ls), dd.data, 'A1'));
  assert.deepEqual(root.querySelectorAll('button[data-ed]').map((b) => b.text.trim()), ['יכול לזוז', 'קבוצות אחרות', 'להוריד מהמערכת']);
  const gone = parse(lessonMenuHtml(st(ls), dd.data, dd.groups.find((g) => g.startsWith(FIXED))));
  assert.deepEqual(gone.querySelectorAll('button[data-ed]').map((b) => b.text.trim()), ['להוריד מהמערכת']);
  const on = parse(lessonMenuHtml(st(ls, { movable: ['A'] }), dd.data, 'A1'));
  assert.equal(on.querySelector('[data-ed="toggleMove"]').getAttribute('aria-pressed'), 'true');
});

test('overlapMessage: two pinned real lessons that overlap block the search and name both; a movable one does not', () => {
  const d = small();
  const ls = [L('A', 'A1', 1, '08:00', '09:50', 'אלף'), L('B', 'B1', 1, '09:00', '10:50', 'בית')];
  const msg = overlapMessage(st(ls), ls, d);
  assert.ok(msg.includes('אלף') && msg.includes('בית') && msg.includes('יכול לזוז'));
  assert.equal(overlapMessage(st(ls, { movable: ['B'] }), ls, d), null);
  const fixed = [L('A', 'A1', 1, '08:00', '09:50', 'אלף'), L('X', null, 1, '09:00', '10:50', 'חיצוני')];
  assert.ok(overlapMessage(st(fixed), fixed, d).includes('אלף'), 'a real lesson over a fixed one names the real one');
  const two = [L('X', null, 1, '08:00', '09:50', 'חיצוני'), L('Y', null, 1, '09:00', '10:50', 'עוד')];
  assert.equal(overlapMessage(st(two), two, d), null, 'two fixed lessons never block');
});

test('parallelPrompts: removing a course another baseline course needs in parallel asks with the exact words', () => {
  const d = small();
  const ls = [L('A', 'A1', 1, '08:00', '09:50', 'אלף'), L('B', 'B1', 2, '09:00', '10:50', 'בית')];
  assert.deepEqual(parallelPrompts(st(ls), d, 'A'), [{ id: 'B', text: 'בית צריך את אלף במקביל. להסיר גם את בית?' }]);
  assert.deepEqual(parallelPrompts(st(ls), d, 'B'), []);
  assert.deepEqual(parallelPrompts(st(ls, { removed: ['B'] }), d, 'A'), []);
});

test('blockedLines: a blocked course always gets a line naming its requirement, even with empty reasons', () => {
  const d = small();
  d.courses.C.prereqs = [{ kind: 'קדם', anyOf: [{ id: 'D', name: 'דלת' }] }];
  const ls = [L('C', 'C1', 2, '08:00', '09:50', 'גימל')];
  const lines = blockedLines(st(ls), d, { C: { status: 'blocked', reasons: [], blockedBy: [['D']] } });
  assert.equal(lines.length, 1);
  assert.ok(lines[0].includes('גימל') && lines[0].includes('דלת'));
  assert.deepEqual(blockedLines(st(ls), d, { C: { status: 'available', reasons: [] } }), []);
  assert.ok(blockedLines(st(ls), d, { C: { status: 'blocked', reasons: [], blockedBy: [] } })[0].length > 'גימל'.length, 'never an empty line');
});

test('addableCourses: open this semester, not already in the schedule', () => {
  const d = small();
  const ls = [L('A', 'A1', 1, '08:00', '09:50', 'אלף')];
  const statuses = { A: { status: 'available' }, B: { status: 'available' }, C: { status: 'done' }, D: { status: 'blocked' } };
  assert.deepEqual(addableCourses(d, statuses, st(ls)).map((c) => c.id), ['B']);
});

test('parallelPrompts: no question when another alternative stays or the record already has it; chains are asked one by one', () => {
  const d = small();
  d.courses.B.prereqs = [{ kind: 'מקביל', anyOf: [{ id: 'A', name: 'אלף' }, { id: 'D', name: 'דלת' }] }];
  const ls = [L('A', 'A1', 1, '08:00', '09:50', 'אלף'), L('B', 'B1', 2, '09:00', '10:50', 'בית'), L('D', 'D1', 3, '08:00', '09:50', 'דלת')];
  assert.deepEqual(parallelPrompts(st(ls), d, 'A'), [], 'D still stands for the requirement');
  assert.equal(parallelPrompts(st(ls.slice(0, 2)), d, 'A').length, 1);
  assert.deepEqual(parallelPrompts(st(ls.slice(0, 2)), d, 'A', { passed: ['D'], profile: {} }), [], 'passed in an earlier semester');
});

// ---------- proposals (Task 12) ----------
const { proposalHtml, navHtml, searchNotesHtml } = await import('../web/ui-edit.js');
const { PROPOSAL_ONLY } = await import('../web/edit-search.js');
const mv = () => {
  const d = small();
  d.courses.A.groups.push(grp('A2', 4, '10:00', '11:50'));
  d.courses.A.groups[1].lecturer = 'M';
  return d;
};
const oneMove = (data, over = {}) => {
  const base = [L('A', 'A1', 1, '08:00', '09:50', 'אלף'), L('C', 'C1', 2, '08:00', '09:50', 'גימל')];
  const now = [L('A', 'A2', 4, '10:00', '11:50', 'אלף'), L('C', 'C1', 2, '08:00', '09:50', 'גימל')];
  return { edit: st(base, over), p: { lessons: now, score: 1, changed: ['A'], added: [], removed: [] }, data };
};

test('proposalHtml: the summary line, one card with the old hours struck and the new ones, the disclaimer', () => {
  const { edit, p, data } = oneMove(mv());
  const root = parse(proposalHtml(edit, p, data));
  assert.ok(root.querySelector('.prop-sum').text.includes('יום א׳ התפנה'));
  const cards = root.querySelectorAll('.pcard');
  assert.equal(cards.length, 1);
  assert.match(cards[0].querySelector('s').text, /08:00/);
  assert.match(cards[0].querySelector('.now').text, /10:00/);
  assert.ok(cards[0].text.includes('מרצה'), 'the lecturer changes: shown');
  assert.ok(root.text.includes(PROPOSAL_ONLY));
  assert.equal(PROPOSAL_ONLY, 'הצעה בלבד. ההרשמה נעשית במכללה.');
});

test('proposalHtml: a full destination carries the full-group tag when not registered', () => {
  const data = mv();
  data.courses.A.groups[1].full = true;
  const { edit, p } = oneMove(data);
  assert.ok(parse(proposalHtml(edit, p, data)).querySelector('.tag.bad'));
  const reg = parse(proposalHtml({ ...edit, registered: true }, p, data));
  assert.equal(reg.querySelector('.tag.bad'), null);
});

test('proposalHtml: added and removed courses get their own cards', () => {
  const data = mv();
  const edit = st([L('A', 'A1', 1, '08:00', '09:50', 'אלף')]);
  const root = parse(proposalHtml(edit, { lessons: [L('D', 'D1', 3, '08:00', '09:50', 'דלת')], score: 1, changed: [], added: ['D'], removed: ['A'] }, data));
  assert.equal(root.querySelectorAll('.pcard').length, 2);
  assert.ok(root.text.includes('נוסף') && root.text.includes('הוסר'));
});

test('proposalHtml: proposal 0 is "המקורית" and lists every overlapping pair as a warning', () => {
  const data = mv();
  const ls = [L('X', null, 1, '08:00', '09:50', 'חיצוני'), L('Y', null, 1, '09:00', '10:50', 'עוד')];
  const root = parse(proposalHtml(st(ls), { lessons: ls, score: 0, changed: [], added: [], removed: [] }, data, { zero: true }));
  assert.ok(root.text.includes('המקורית'));
  assert.ok(root.text.includes('חיצוני') && root.text.includes('עוד'));
  assert.equal(root.querySelectorAll('.pcard').length, 0);
  const none = parse(proposalHtml(st([L('A', 'A1', 1, '08:00', '09:50')]), { lessons: [L('A', 'A1', 1, '08:00', '09:50')], score: 0, changed: [], added: [], removed: [] }, data, { zero: true }));
  assert.equal(none.querySelector('.warn-text'), null);
});

test('navHtml: "הצעה n מתוך N", the original is "המקורית"', () => {
  assert.ok(parse(navHtml(2, 5)).text.includes('הצעה 2 מתוך 5'));
  assert.ok(parse(navHtml(0, 5)).text.includes('המקורית'));
});

test('searchNotesHtml: "אם X יזוז" only when enabling is not empty, the timeout line only when timed out, diagnosis as text', () => {
  const d = small(), e = st([L('A', 'A1', 1, '08:00', '09:50', 'אלף')]);
  const none = parse(searchNotesHtml({ proposals: [], enabling: [], timedOut: false, diagnosis: ['אין קבוצה <b>x</b>'] }, e, d));
  assert.ok(!none.text.includes('יזוז') && !none.text.includes('לא הספקנו'));
  assert.ok(none.text.includes('אין קבוצה <b>x</b>'), 'text, never HTML');
  const en = parse(searchNotesHtml({ proposals: [], enabling: ['A'], timedOut: false, diagnosis: [] }, e, d));
  assert.ok(en.text.includes('אם אלף יזוז, יש פתרון'));
  assert.equal(en.querySelector('[data-ed="letMove"]').getAttribute('data-course'), 'A');
  assert.ok(parse(searchNotesHtml({ proposals: [], enabling: [], timedOut: true, diagnosis: [] }, e, d)).text.includes('לא הספקנו לבדוק הכל'));
});

test('no action of the proposal screens says החל or הרשמה', () => {
  const { edit, p, data } = oneMove(mv());
  const html = proposalHtml(edit, p, data) + navHtml(1, 2) + searchNotesHtml({ proposals: [], enabling: ['A'], timedOut: true, diagnosis: [] }, edit, data);
  for (const b of parse(html).querySelectorAll('button')) assert.ok(!/החל|הרשמ/.test(b.text), b.text);
});

test('stepOneHtml: "כל שינוי נשמר מיד" is shown only while saving really works, and by default', () => {
  const hint = (opts) => html([SURE], {}, opts).querySelector('[data-saved]');
  assert.match(hint(undefined).text, /כל שינוי נשמר מיד/);
  assert.equal(hint(undefined).hasAttribute('hidden'), false);
  assert.equal(hint({ saving: true }).hasAttribute('hidden'), false);
  assert.equal(hint({ saving: false }).hasAttribute('hidden'), true, 'a failed save, or another tab, hides the promise');
});

// ---------- split lecture and tutorial (F.2): the build page's warning, in the proposal and beside a swap option ----------
const { swapOptions, swapListHtml } = await import('../web/ui-edit.js');
const { SPLIT_NOTE, SPLIT_TAG, splitLine } = await import('../web/ui-text.js');

test('proposalHtml: a proposal that splits a course says so with the build page\'s lines and tags the course; one that does not, says nothing', () => {
  const { edit, p, data } = oneMove(mv());
  const root = parse(proposalHtml(edit, { ...p, split: ['A'] }, data));
  assert.ok(root.text.includes(SPLIT_NOTE), 'the note');
  assert.ok(root.querySelector('.split-line').text.includes(splitLine([data.courses.A.name])), 'the line with the course name');
  assert.ok(root.querySelector('.pcard .tag.warn').text.includes(SPLIT_TAG), 'the tag on the course card');
  const plain = parse(proposalHtml(edit, { ...p, split: [] }, data));
  assert.equal(plain.querySelector('.split-line'), null);
  assert.equal(plain.text.includes(SPLIT_NOTE), false);
  assert.equal(parse(proposalHtml(edit, p, data)).querySelector('.split-line'), null, 'a proposal from before the field existed');
});

test('swapOptions: the groups of the course in each proposal, the shown ones and repeats left out, each marked split or not', () => {
  const props = [
    { lessons: [L('A', 'A1', 1, '08:00', '09:50'), L('A', 'A1/1', 2, '08:00', '08:50')], split: [] },
    { lessons: [L('A', 'A2', 3, '08:00', '09:50'), L('A', 'A1/1', 2, '08:00', '08:50')], split: ['A'] },
    { lessons: [L('A', 'A2', 3, '08:00', '09:50'), L('A', 'A1/1', 2, '08:00', '08:50'), L('C', 'C1', 2, '08:00', '09:50')], split: ['A'] },
    { lessons: [L('C', 'C1', 2, '08:00', '09:50')], split: [] }
  ];
  assert.deepEqual(swapOptions(props, 'A', 'A1,A1/1'), [{ ids: ['A2', 'A1/1'], split: true }]);
  assert.deepEqual(swapOptions(props, 'A', ''), [{ ids: ['A1', 'A1/1'], split: false }, { ids: ['A2', 'A1/1'], split: true }]);
});

test('swapListHtml: a swap that only a split option allows is offered with the split warning inside its button; a regular one has none', () => {
  const data = small();
  data.courses.A.groups.push(grp('A2', 4, '10:00', '11:50'));
  const root = parse(swapListHtml([{ ids: ['A1'], split: false }, { ids: ['A2'], split: true }], 'A', data));
  const buttons = root.querySelectorAll('button[data-ed="pickSwap"]');
  assert.deepEqual(buttons.map((b) => b.getAttribute('data-groups')), ['A1', 'A2']);
  assert.equal(buttons[0].querySelector('.tag.warn'), null);
  assert.ok(buttons[1].querySelector('.tag.warn').text.includes(SPLIT_TAG), 'inside the button, so it is in its name');
  assert.equal(swapListHtml([], 'A', data).includes('אין קבוצות אחרות'), true);
});

test('proposalHtml: co-lecturers are read with one comma, from one group or from several (the data holds ",," between them)', () => {
  const data = mv();
  data.courses.A.groups[0].lecturer = 'מר X,, מר Y';
  data.courses.A.groups[1].lecturer = 'מר Y,, מר Z';
  const { edit, p } = oneMove(data);
  const hint = parse(proposalHtml(edit, p, data)).querySelector('.pcard .hint');
  assert.equal(hint.text, 'מרצה: מר X, מר Y מר Y, מר Z');
  assert.ok(!hint.text.includes(',,'));
});

test('stepOneHtml: a group line never shows ",,"', () => {
  const g = Object.values(data.courses).flatMap((c) => c.groups).find((x) => x.primary);
  const copy = structuredClone(data);
  Object.values(copy.courses).flatMap((c) => c.groups).find((x) => x.id === g.id).lecturer = 'מר X,, מר Y';
  const r = row({ candidates: [g.id], chosen: g.id });
  const root = parse(stepOneHtml(withDraft([r], {}), copy, [r], {}));
  assert.ok(root.text.includes('מר X, מר Y'), root.text.slice(0, 300));
  assert.ok(!root.text.includes(',,'));
});

test('loadedLineA: the courses and the days of what is loaded, in one line (design A)', () => {
  const l = (course, day) => ({ course, day });
  assert.equal(loadedLineA([l('a', 4)]), 'קורס אחד · יום ד׳');
  assert.equal(loadedLineA([l('a', 4), l('a', 4), l('b', 3)]), '2 קורסים · ימים ג׳ ו-ד׳', 'a course counted once, the days in order');
  assert.equal(loadedLineA([l('a', 2), l('b', 3), l('c', 4)]), '3 קורסים · ימים ב׳, ג׳ ו-ד׳');
  assert.equal(loadedLineA([]), '');
});

test('searchNotesHtml under design A: a fixed group with no schedule blames the goal when the goal is the cause, the group otherwise; classic says neither', () => {
  const d = small(), e = { ...st([L('A', 'A1', 1, '08:00', '09:50', 'אלף')]), added: ['B'], swaps: { B: ['x'] } };
  const none = { proposals: [], enabling: [], timedOut: false, diagnosis: [] };
  const was = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const onA = (fn) => {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: { dataset: { design: 'a' } } } });
    try {
      return fn();
    } finally {
      if (was) Object.defineProperty(globalThis, 'document', was);
      else delete globalThis.document;
    }
  };
  const group = onA(() => parse(searchNotesHtml(none, e, d)).text);
  assert.ok(group.includes('לא נמצאה מערכת עם הקבוצה הזו'), 'the group, when nothing says it is the goal');
  const goal = onA(() => parse(searchNotesHtml({ ...none, goalBlocks: 'פחות חלונות, לסיים עד 15:00' }, e, d)).text);
  assert.ok(goal.includes('היעד "פחות חלונות, לסיים עד 15:00" לא מתאפשר עם הקבוצה הזו. בלי היעד יש הצעה.'), 'the goal, named');
  assert.ok(!goal.includes('לא נמצאה מערכת עם הקבוצה הזו'), 'and the group is not blamed then');
  const classic = parse(searchNotesHtml({ ...none, goalBlocks: 'פחות חלונות' }, e, d)).text;
  assert.ok(!classic.includes('הקבוצה הזו'), 'classic has neither sentence');
});

test('goalText: the goals that are on, in the chips\' words', async () => {
  const { goalText } = await import('../web/ui-edit.js');
  assert.equal(goalText({}), '');
  assert.equal(goalText({ fewerGaps: true }), 'פחות חלונות');
  assert.equal(goalText({ dayOff: 4, fewerGaps: true, notAfter: '15:00' }), 'לפנות יום ד׳, פחות חלונות, לסיים עד 15:00');
});

test('shareButtonHtml: "שלח כתמונה", a plain button with data-ed="shareImage"', async () => {
  const { shareButtonHtml } = await import('../web/ui-edit.js');
  const h = shareButtonHtml('prop');
  assert.match(h, /^<button type="button" class="btn" data-ed="shareImage"/);
  assert.match(h, />שלח כתמונה<\/button>$/);
});

test('movedParts: a course whose tutorial changes and whose lecture stays: only the tutorial is new, only the old tutorial was there', async () => {
  const { movedParts } = await import('../web/ui-edit.js');
  const L = (group, day, start, end, course = 'c') => ({ course, name: 'x', type: 't', group, day, start, end });
  const before = [L('L1', 1, '10:00', '11:50'), L('T1', 3, '12:00', '12:50'), L('K1', 5, '08:00', '09:50', 'k')];
  const tutorialOnly = [L('L1', 1, '10:00', '11:50'), L('T2', 4, '12:00', '12:50'), L('K1', 5, '08:00', '09:50', 'k')];
  let m = movedParts(before, tutorialOnly, ['c']);
  assert.deepEqual([...m.groups], ['T2']);
  assert.deepEqual(m.ghosts.map((l) => l.group), ['T1']);
  m = movedParts(before, [L('L2', 2, '10:00', '11:50'), L('T2', 4, '12:00', '12:50'), L('K1', 5, '08:00', '09:50', 'k')], ['c']);
  assert.deepEqual([...m.groups].sort(), ['L2', 'T2'], 'both changed: both new');
  assert.deepEqual(m.ghosts.map((l) => l.group).sort(), ['L1', 'T1']);
  m = movedParts(before, [...tutorialOnly, L('N1', 2, '14:00', '15:50', 'n')], ['n']);
  assert.deepEqual([[...m.groups], m.ghosts], [['N1'], []], 'an added course: all new, nothing was there');
});
