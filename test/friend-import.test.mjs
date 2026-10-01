import test from 'node:test';
import assert from 'node:assert/strict';
import { groupsFromText, placeGroup } from '../web/friend-import.js';
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
