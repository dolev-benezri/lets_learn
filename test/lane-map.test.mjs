// laneMap (web/ui-grid.js): lessons of one day that share time get lanes side by side; the rest get none.
import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../web/app.js'); // app.js starts init() only when it sees a document: import it before anything else
const { laneMap } = await import('../web/ui-grid.js');

const it = (key, start, end) => ({ key, start, end });

test('lessons that overlap nothing have no lane', () => {
  assert.equal(laneMap([it('a', 540, 590), it('b', 600, 650)]).size, 0, 'touching is not overlapping');
  assert.equal(laneMap([]).size, 0);
});

test('two lessons at the same time share the width', () => {
  const m = laneMap([it('chem', 840, 950), it('thermo', 840, 950)]);
  assert.deepEqual([...m.entries()].sort(), [['chem', { l: 0, n: 2 }], ['thermo', { l: 1, n: 2 }]]);
});

test('a partial overlap is a clash too, and a later free lesson is not part of it', () => {
  const m = laneMap([it('a', 540, 650), it('b', 600, 700), it('c', 700, 760)]);
  assert.deepEqual(m.get('a'), { l: 0, n: 2 });
  assert.deepEqual(m.get('b'), { l: 1, n: 2 });
  assert.equal(m.has('c'), false, 'it starts when b ends');
});

test('a chain of overlaps is one cluster, and a lane is reused once its lesson is over', () => {
  const m = laneMap([it('a', 540, 600), it('b', 570, 660), it('c', 600, 680), it('d', 700, 760)]);
  assert.deepEqual(m.get('a'), { l: 0, n: 2 });
  assert.deepEqual(m.get('b'), { l: 1, n: 2 });
  assert.deepEqual(m.get('c'), { l: 0, n: 2 }, 'a ended: its lane is free for c');
  assert.equal(m.has('d'), false);
});

test('three at once need three lanes, and the order of the input does not matter', () => {
  const a = laneMap([it('x', 600, 700), it('y', 600, 700), it('z', 600, 700)]);
  const b = laneMap([it('z', 600, 700), it('x', 600, 700), it('y', 600, 700)]);
  for (const m of [a, b]) assert.deepEqual([...m.values()].map((v) => v.n), [3, 3, 3]);
  assert.deepEqual([...a.values()].map((v) => v.l).sort(), [0, 1, 2]);
});
