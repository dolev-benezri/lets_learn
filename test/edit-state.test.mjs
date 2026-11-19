import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EDIT_KEY, emptyEdit, normalizeEdit, loadEdit, saveEdit, lessonsOf, loadSchedule, restoreOriginal, saveProposal, sameDataset, datasetOf
} from '../web/edit-state.js';
import { mini } from './fixtures/mini-data.mjs';

const L = (course, group, day, start, end) => ({ course, name: `n${course}`, type: 'הרצאה', group, day, start, end });
const DS = { year: 2027, sem: 'א', program: 30, startYear: 2026 };
const loaded = () =>
  loadSchedule(emptyEdit(), [L('A', 'A1', 2, '08:00', '09:50'), L('B', 'B1', 3, '10:00', '11:50'), L('X', null, 1, '12:00', '13:50')], DS, true);

const stubStorage = (store) => {
  globalThis.localStorage = store;
};
test.afterEach(() => delete globalThis.localStorage);

test('normalize: unknown keys and bad values are dropped, nothing throws', () => {
  for (const bad of [null, undefined, 5, 'x', [], { v: 2 }]) assert.deepEqual(normalizeEdit(bad), emptyEdit());
  const n = normalizeEdit({
    ...loaded(), evil: 1, movable: 'x', added: ['A', 5, null], goal: { dayOff: 9, notAfter: '25:00', fewerGaps: 'yes' }, registered: 'yes'
  });
  assert.equal('evil' in n, false);
  assert.deepEqual(n.movable, []);
  assert.deepEqual(n.added, ['A']);
  assert.deepEqual(n.goal, { dayOff: null, notAfter: null, fewerGaps: false });
  assert.equal(n.registered, false);
  assert.equal(n.original.length, 3);
});

test('normalize: bad lessons are dropped', () => {
  const n = normalizeEdit({
    v: 1, original: [L('A', 'A1', 2, '08:00', '09:50'), L('A', 'A1', 9, '08:00', '09:50'), 7, L('A', 'A1', 2, '8:00', '09:50')]
  });
  assert.equal(n.original.length, 1);
});

test('owned never contains an id missing from original', () => {
  const st = loaded();
  assert.deepEqual(normalizeEdit({ ...st, owned: ['A1', 'B1', 'ZZ'] }).owned, ['A1', 'B1']);
  assert.deepEqual(normalizeEdit({ ...st, original: [], owned: ['A1'] }).owned, []);
});

test('loadSchedule: owned only when registered (fixed rows own nothing); the rest cleared, draft too', () => {
  const st = loaded();
  assert.deepEqual(st.owned, ['A1', 'B1']);
  assert.deepEqual(st.original, st.baseline);
  assert.equal(st.registered, true);
  const dirty = { ...st, movable: ['A'], draft: { rows: [], choices: {}, registered: true, sem: 'א' } };
  const again = loadSchedule(dirty, st.original, DS, false);
  assert.deepEqual(again.owned, []);
  assert.deepEqual([again.movable, again.draft, again.registered], [[], null, false]);
});

test('saveProposal keeps owned and original and clears the changes; restoreOriginal copies original back', () => {
  const st = { ...loaded(), movable: ['A'], swaps: { A: ['A2'] }, added: ['C'], removed: ['B'] };
  const p = saveProposal(st, [L('A', 'A2', 1, '12:00', '13:50')]);
  assert.deepEqual(p.owned, st.owned);
  assert.deepEqual(p.original, st.original);
  assert.deepEqual([p.movable, p.swaps, p.added, p.removed], [[], {}, [], []]);
  assert.equal(p.baseline[0].group, 'A2');
  const r = restoreOriginal(p);
  assert.deepEqual(r.baseline, st.original);
  assert.notEqual(r.baseline, r.original);
  assert.deepEqual(r.owned, st.owned);
});

test('sameDataset: false once the year, semester, program or cohort changes', () => {
  const st = loaded(), data = mini();
  assert.equal(sameDataset(st, data), true);
  assert.equal(sameDataset(st, { ...data, year: 2028 }), false);
  assert.equal(sameDataset(st, { ...data, semester: 'ב' }), false);
  assert.equal(sameDataset(st, { ...data, program: 10 }), false);
  assert.equal(sameDataset(st, { ...data, startYear: 2025 }), false);
  assert.equal(sameDataset(emptyEdit(), data), false);
  const bare = { ...data, program: undefined, startYear: undefined };
  assert.equal(sameDataset(st, bare, { program: 30, startYear: 2026 }), true);
  assert.deepEqual(datasetOf(data), DS);
});

test('lessonsOf: one lesson per meeting, with the course name and group type', () => {
  const data = mini();
  data.courses.A.groups[0].meetings.push({ day: 4, start: '12:00', end: '12:50', room: 'r' });
  const ls = lessonsOf(['A1', 'A1/1', 'nope'], data);
  assert.deepEqual(ls.map((l) => [l.course, l.group, l.day, l.start]), [['A', 'A1', 2, '08:00'], ['A', 'A1', 4, '12:00'], ['A', 'A1/1', 3, '10:00']]);
  assert.equal(ls[0].name, 'פיזיקה-מכניקה');
  assert.equal(ls[2].type, 'תרגול');
});

const row = (over = {}) => ({
  code: '30112', name: 'x', type: 'הרצאה', text: 't', via: 'code', confidence: 'weak', chosen: 'A1',
  meets: [{ day: 2, start: '13:00', end: '14:50' }], candidates: ['A1', 'A2'], ...over
});

test('draft: choices survive save then load; a bad row is dropped and the choices re-keyed', () => {
  const store = {};
  stubStorage({ getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = v) });
  const draft = {
    rows: [row(), row({ code: 5 }), row({ chosen: null, confidence: 'none' })], choices: { 0: 'A2', 1: 'zz', 2: null }, registered: true, sem: 'ב'
  };
  saveEdit({ ...emptyEdit(), draft });
  const d = loadEdit().draft;
  assert.equal(d.rows.length, 2);
  assert.deepEqual(d.choices, { 0: 'A2', 1: null });
  assert.deepEqual([d.registered, d.sem], [true, 'ב']);
  assert.deepEqual(Object.keys(store), [EDIT_KEY]);
  const two = normalizeEdit({ v: 1, draft: { rows: [row(), row({ via: 'magic' })], choices: { 0: 'A1', 1: 'A2', 7: 'A1' } } }).draft;
  assert.deepEqual([two.rows.length, two.choices, two.sem], [1, { 0: 'A1' }, null]);
});

test('draft: a long source text is cut, the row stays', () => {
  const d = normalizeEdit({ v: 1, draft: { rows: [row({ text: 'x'.repeat(900) })], choices: { 0: 'A2' } } }).draft;
  assert.deepEqual([d.rows.length, d.rows[0].text.length, d.choices], [1, 400, { 0: 'A2' }]);
});

test('storage that throws on every call: loadEdit gives the empty state, saveEdit does not throw', () => {
  const boom = () => {
    throw new Error('blocked');
  };
  stubStorage({ getItem: boom, setItem: boom, removeItem: boom });
  assert.deepEqual(loadEdit(), emptyEdit());
  assert.doesNotThrow(() => saveEdit(loaded()));
  delete globalThis.localStorage; // no localStorage at all
  assert.deepEqual(loadEdit(), emptyEdit());
  assert.doesNotThrow(() => saveEdit(loaded()));
});

test('the build save key is never read or written', () => {
  const seen = [];
  stubStorage({ getItem: (k) => (seen.push(k), null), setItem: (k) => seen.push(k), removeItem: (k) => seen.push(k) });
  loadEdit();
  saveEdit(loaded());
  assert.ok(seen.length > 0 && seen.every((k) => k === EDIT_KEY));
  assert.equal(seen.includes('afeka-sched-v1'), false);
});
