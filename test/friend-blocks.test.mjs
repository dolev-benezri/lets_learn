import test from 'node:test';
import assert from 'node:assert/strict';
import { findBlocks, columnOf, gridHours } from '../web/friend-blocks.js';

function canvas(w, h) {
  const d = new Uint8ClampedArray(w * h * 4).fill(255);
  const rect = (x, y, rw, rh, [r, g, b]) => { for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) { const p = (j * w + i) * 4; d[p] = r; d[p + 1] = g; d[p + 2] = b; } };
  return { d, rect };
}
const PURPLE = [205, 140, 190];

test('findBlocks: headers repeat in one row, blocks below them, title band and grid lines ignored', () => {
  const { d, rect } = canvas(400, 200);
  rect(0, 0, 400, 20, [160, 220, 240]); // title band
  for (const x of [20, 120, 220, 320]) rect(x, 30, 80, 24, PURPLE); // 4 day headers
  rect(20, 60, 1, 120, [220, 220, 220]); // a gray grid line
  rect(220, 70, 80, 40, [0, 90, 230]); // block in column 3 from the left = 2nd from the right
  rect(222, 80, 30, 4, [255, 255, 255]); // "text" hole
  rect(320, 120, 80, 30, [255, 190, 70]); // block in the rightmost column (ראשון)
  const { headers, blocks } = findBlocks(d, 400, 200);
  assert.equal(headers.length, 4);
  assert.deepEqual(headers.map((r) => r.x), [320, 220, 120, 20]); // right to left
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks.map((b) => columnOf(b, headers)), [1, 0]);
  assert.deepEqual([blocks[0].x, blocks[0].y, blocks[0].w, blocks[0].h], [222, 70, 76, 40]);
});

test('findBlocks: no repeating header row -> nothing', () => {
  const { d, rect } = canvas(200, 100);
  rect(10, 10, 60, 30, [255, 190, 70]);
  assert.deepEqual(findBlocks(d, 200, 100), { headers: [], blocks: [] });
});

test('columnOf: -1 outside every header', () => {
  assert.equal(columnOf({ x: 500, y: 0, w: 10, h: 10 }, [{ x: 0, y: 0, w: 100, h: 20 }]), -1);
});

test('gridHours: fits the hour height and gives each block its hour offset and length', () => {
  const H = 90, top = 50, headers = [{ x: 0, y: -64, w: 100, h: 114 }];
  const mk = (off, hours) => ({ x: 0, y: top + off * H + 1, w: 100, h: hours * H - H / 6 });
  const g = gridHours([mk(0, 2), mk(1, 1), mk(3, 4), mk(2, 2)], headers);
  assert.ok(Math.abs(g.H - H) <= 1, `H=${g.H}`);
  assert.deepEqual(g.slots, [{ off: 0, hours: 2 }, { off: 1, hours: 1 }, { off: 3, hours: 4 }, { off: 2, hours: 2 }]);
  assert.equal(gridHours([], headers), null);
});
