// The first-visit tour (web/tour.js): which parts were seen, with and without a working localStorage, and the copy of every stop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'node-html-parser';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
const fresh = (n) => import(`../web/tour.js?${n}`); // a new module instance: its in-memory fallback starts empty
const { TOUR_KEY, TOUR_INTRO, TOUR_PLANS } = await fresh('steps');

test('a fresh store has seen no part; marking one does not mark the other', async () => {
  store.clear();
  const { tourSeen, markTour } = await fresh('fresh');
  assert.equal(TOUR_KEY, 'afeka-sched-v1-tour');
  assert.equal(tourSeen('intro'), false);
  assert.equal(tourSeen('plans'), false);
  markTour('intro');
  assert.equal(tourSeen('intro'), true);
  assert.equal(tourSeen('plans'), false);
  markTour('plans');
  assert.equal(tourSeen('plans'), true);
});

test('a part marked in an earlier visit is seen in a new page load', async () => {
  store.clear();
  (await fresh('visit1')).markTour('intro');
  const next = await fresh('visit2');
  assert.equal(next.tourSeen('intro'), true);
  assert.equal(next.tourSeen('plans'), false);
});

test('when localStorage throws, a part is seen for the rest of the page load only', async () => {
  const real = globalThis.localStorage,
    boom = () => {
      throw new Error('blocked');
    };
  globalThis.localStorage = { getItem: boom, setItem: boom, removeItem: boom };
  try {
    const { tourSeen, markTour } = await fresh('blocked');
    assert.equal(tourSeen('intro'), false);
    markTour('intro');
    assert.equal(tourSeen('intro'), true);
    assert.equal(tourSeen('plans'), false);
    assert.equal((await fresh('blocked2')).tourSeen('intro'), false, 'a new page load asks again');
  } finally {
    globalThis.localStorage = real;
  }
});

const copy = [...TOUR_INTRO, ...TOUR_PLANS].map((s) => s.text);
test('every stop text is Hebrew, at most 140 characters, with no emoji', () => {
  assert.equal(TOUR_INTRO.length, 7);
  assert.equal(TOUR_PLANS.length, 4);
  for (const t of copy) {
    assert.ok(t.length <= 140, `too long (${t.length}): ${t}`);
    assert.match(t, /[֐-׿]/, `no Hebrew: ${t}`);
    assert.doesNotMatch(t, /\p{Extended_Pictographic}/u, `emoji: ${t}`);
    assert.doesNotMatch(t, /[<>&]/, `the popover writes this as HTML: ${t}`);
  }
});

test('every selector of the intro exists in index.html', () => {
  const html = parse(readFileSync(new URL('../web/index.html', import.meta.url), 'utf8'));
  for (const { sel } of TOUR_INTRO) assert.ok(html.querySelector(sel), `no element for ${sel}`);
});
