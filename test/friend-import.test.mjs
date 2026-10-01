import test from 'node:test';
import assert from 'node:assert/strict';
import { groupsFromText, placeGroup, findCourse, clashIds } from '../web/friend-import.js';
const data = { courses: { c1: { groups: [{ id: '270600101' }, { id: '270600102' }] }, c2: { groups: [{ id: '270611201' }] } } };
test('groupsFromText finds known 9-digit ids once, reports unknown ones, ignores other numbers', () => {
  const t = 'קבוצה 270600101 ב׳ 10:00\n270611201, 270600101\nטלפון 0521234567 שנה 2027 קוד 999999999';
  assert.deepEqual(groupsFromText(t, data), { found: ['270600101', '270611201'], unknown: ['999999999'] });
});
test('groupsFromText on empty text', () => assert.deepEqual(groupsFromText('', data), { found: [], unknown: [] }));

const d2 = { courses: { c: { groups: [
  { id: 'L1', type: 'הרצאה' }, { id: 'L2', type: 'הרצאה' }, { id: 'T1', type: 'תרגיל' } ] } } };
test('placeGroup replaces a same-course same-type group, keeps other types, toggles off', () => {
  assert.deepEqual(placeGroup(['L1', 'T1'], 'L2', d2), ['T1', 'L2']);
  assert.deepEqual(placeGroup(['L1'], 'L1', d2), []);
});

test('groupsFromText classifies whole /N tokens (a tutorial id is not its base id)', () => {
  const d = { courses: { c: { groups: [{ id: '271001601' }, { id: '271001601/1' }] } } };
  assert.deepEqual(groupsFromText('271001601/1 וגם 271001601/2 ו-271001601', d), { found: ['271001601/1', '271001601'], unknown: ['271001601/2'] });
});
test('placeGroup: unknown gid leaves the draft unchanged, a 41st group is refused (not dropped silently)', () => {
  const draft = ['L1'];
  const same = placeGroup(draft, 'nope', d2);
  assert.deepEqual(same, ['L1']);
  assert.notEqual(same, draft);
  const many = { courses: { c: { groups: Array.from({ length: 41 }, (_, i) => ({ id: `g${i}`, type: `t${i}` })) } } };
  const full = Array.from({ length: 40 }, (_, i) => `g${i}`);
  assert.deepEqual(placeGroup(full, 'g40', many), full);
});

const hd = { courses: {
  A: { name: 'אלגברה', groups: [{ id: 'A1' }, { id: 'A2' }] }, B: { name: 'פיזיקה', groups: [{ id: 'B1' }] }, C: { name: 'אלגוריתמים', groups: [{ id: 'C1' }] } } };
test('findCourse: datalist text, bare cid, unique name substring; ambiguous or missing -> null', () => {
  assert.equal(findCourse('אלגברה (A)', hd.courses), 'A');
  assert.equal(findCourse(' B ', hd.courses), 'B');
  assert.equal(findCourse('פיזי', hd.courses), 'B');
  assert.equal(findCourse('אלג', hd.courses), null);
  assert.equal(findCourse('', hd.courses), null);
  assert.equal(findCourse('zzz', hd.courses), null);
});
const m = (day, start, end) => ({ day, start, end });
const cd = { courses: { c: { groups: [
  { id: 'x', meetings: [m(1, '10:00', '12:00')] }, { id: 'y', meetings: [m(1, '11:00', '13:00')] },
  { id: 'z', meetings: [m(1, '12:00', '14:00')] }, { id: 'w', meetings: [m(2, '10:00', '12:00')] } ] } } };
test('clashIds: overlapping meetings on one day clash, touching ends and other days do not, unknown ids are ignored', () => {
  assert.deepEqual([...clashIds(['x', 'y', 'z', 'w', 'nope'], cd)].sort(), ['x', 'y', 'z']);
  assert.deepEqual([...clashIds(['x', 'z', 'w'], cd)], []);
});
