// Design A's alternatives column state (web/ui-common.js altsOpen / setAltsOpen): folded by default, 'open' read from storage once, and a window whose
// storage throws (the getter itself, a read, a write) still folds and opens in memory. The module is evaluated again for each case (a query string).
import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../web/app.js'); // app.js starts init() only when it sees a document: import it before anything else

const load = (tag) => import(`../web/ui-common.js?alts-${tag}`);
const withStorage = async (storage, tag) => {
  const was = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', storage);
  try {
    return await load(tag);
  } finally {
    if (was) Object.defineProperty(globalThis, 'localStorage', was);
    else delete globalThis.localStorage;
  }
};

test('folded when nothing is stored, open when the key says "open"', async () => {
  const empty = await withStorage({ configurable: true, value: { getItem: () => null, setItem() {} } }, 'empty');
  assert.equal(empty.altsOpen(), false);
  const open = await withStorage({ configurable: true, value: { getItem: (k) => (k === 'afeka-sched-v1-alts' ? 'open' : null), setItem() {} } }, 'open');
  assert.equal(open.altsOpen(), true);
  const other = await withStorage({ configurable: true, value: { getItem: () => 'closed', setItem() {} } }, 'closed');
  assert.equal(other.altsOpen(), false, 'anything but "open" is folded');
});

test('a read that throws, and a storage object that throws, mean folded, and folding and opening still work in memory', async () => {
  const reads = await withStorage({ configurable: true, value: { getItem: () => { throw new Error('blocked'); }, setItem() {} } }, 'reads');
  assert.equal(reads.altsOpen(), false);
  const gone = await withStorage({ configurable: true, get() { throw new Error('blocked'); } }, 'gone');
  assert.equal(gone.altsOpen(), false);
  gone.setAltsOpen(true); // the write throws too: no exception, the variable still changes
  assert.equal(gone.altsOpen(), true);
  gone.setAltsOpen(false);
  assert.equal(gone.altsOpen(), false);
});

test('setAltsOpen writes "open" or "closed" under the key, best effort', async () => {
  const seen = [];
  const m = await withStorage({ configurable: true, value: { getItem: () => null, setItem: (k, v) => seen.push([k, v]) } }, 'writes');
  const keep = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: (k, v) => seen.push([k, v]) } });
  try {
    m.setAltsOpen(true);
    m.setAltsOpen(false);
  } finally {
    if (keep) Object.defineProperty(globalThis, 'localStorage', keep);
    else delete globalThis.localStorage;
  }
  assert.deepEqual(seen, [['afeka-sched-v1-alts', 'open'], ['afeka-sched-v1-alts', 'closed']]);
});
