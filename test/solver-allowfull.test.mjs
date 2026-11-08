import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOptions, search } from '../web/solver-core.js';

const g = (id, day, extra = {}) => ({
  id, type: 'הרצאה', primary: true, lecturer: 'L', full: false, linked: [],
  meetings: [{ day, start: '08:00', end: '09:50', room: 'r' }], exams: [], ...extra
});
// A (full) on day 1, B on day 2; lecture L1 (full: no) links a full tutorial T1.
const course = { name: 'c', credits: 3, offered: true, prereqs: [], groups: [g('A', 1, { full: true }), g('B', 2)] };
const linked = {
  name: 'l', credits: 3, offered: true, prereqs: [],
  groups: [g('L1', 3, { linked: ['T1'] }), g('T1', 4, { type: 'תרגול', primary: false, full: true })]
};
const has = (opts, id) => opts.some((o) => o.groups.includes(id));

test('buildOptions: the pin exemption stays without allowFull', () => {
  assert.ok(has(buildOptions(course, { pins: ['A'] }), 'A'));
});

test('buildOptions: allowFull replaces the pin exemption', () => {
  assert.ok(!has(buildOptions(course, { pins: ['A'], allowFull: [] }), 'A'));
  const o = buildOptions(course, { allowFull: ['A'] });
  assert.ok(has(o, 'A') && has(o, 'B'));
});

test('buildOptions: allowFull beats includeFull for full groups', () => {
  assert.ok(!has(buildOptions(course, { includeFull: true, allowFull: [] }), 'A'));
});

test('buildOptions: a full linked tutorial needs its own id', () => {
  assert.equal(buildOptions(linked, { allowFull: ['L1'] }).length, 0);
  assert.equal(buildOptions(linked, { allowFull: ['T1'] }).length, 1);
});

test('search: allowFull is honoured, and by the diagnosis rebuild too', () => {
  const data = { courses: { c: course }, lists: [], examsPublished: false };
  const run = (allowFull, pins = []) => search({ data, courses: [{ id: 'c', mode: 'must' }], allowFull, pins });
  assert.ok(run(['A']).results.some((r) => r.groups.includes('A')));
  assert.ok(!run([]).results.some((r) => r.groups.includes('A')));
  assert.ok(run([], ['A']).results.length === 0, 'a pinned full group outside the list is refused');
  assert.ok(run([], ['A']).diagnosis.length > 0);
  assert.ok(run(undefined, ['A']).results.some((r) => r.groups.includes('A')), 'no allowFull: pin exemption');
});

test('buildOptions: allowFull does not split identical non-full groups', () => {
  const c = { name: 'd', credits: 3, offered: true, prereqs: [], groups: [g('A', 1), g('B', 1), g('C', 2)] };
  const o = buildOptions(c, { allowFull: ['A'] });
  assert.deepEqual(o.map((x) => x.groups).sort(), [['A'], ['C']]);
  assert.deepEqual(o.find((x) => x.groups[0] === 'A').alts, { A: ['B'] });
});
