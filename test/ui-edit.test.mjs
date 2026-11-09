// The edit page's pure HTML and row helpers (the screens themselves run in test/browser/edit-*.spec.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { stepOneHtml, lessonsFromRows, pendingRows } = await import('../web/ui-edit.js');
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
  for (const s of ['קובץ מהמתכנן (PDF או צילום)', 'לבחור קורסים וקבוצות ידנית', 'המערכת כבר רשומה במכללה', 'הבא: שינויים'])
    assert.ok(t.includes(s), s);
  assert.equal(root.querySelectorAll('[data-ed-row]').length, 0, 'nothing to review');
  assert.ok(!/החל|הרשם/.test(root.querySelectorAll('button').map((b) => b.text).join(' ')), 'no apply/register verb on an action');
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
});
