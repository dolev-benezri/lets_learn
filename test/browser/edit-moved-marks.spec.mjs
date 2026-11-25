// The edit board marks only what really moved (design A): a course whose tutorial changes and whose lecture stays keeps the lecture
// unmarked, with no "היה כאן" under it and no change dot on a day only the lecture is on. Real groups from the frozen data: Calculus 1,
// lecture 279090105 (Sun 11:00, Wed 14:00) with its linked tutorials 279090105/1 (Wed 09:00) and 279090105/2 (Thu 16:00); the hand
// change takes /2 for /1 and keeps the lecture.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DONE, visit as visitIn, launch } from './helpers.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const L = (course, name, type, group, day, start, end) => ({ course, name, type, group, day, start, end });
const BASE = [
  L('90901', 'חשבון דיפרנציאלי אינטגרלי1', 'סופי-הרצאה+תרגול', '279090105', 1, '11:00', '12:50'),
  L('90901', 'חשבון דיפרנציאלי אינטגרלי1', 'סופי-הרצאה+תרגול', '279090105', 4, '14:00', '15:50'),
  L('90901', 'חשבון דיפרנציאלי אינטגרלי1', 'תרגול', '279090105/1', 4, '09:00', '10:50')
];
const DS = { year: 2027, sem: 'א', program: 30, startYear: 2026 };
const state = {
  v: 1, dataset: DS, registered: false, owned: [], original: BASE, baseline: BASE, movable: [], goal: {},
  swaps: { 90901: ['279090105', '279090105/2'] }
};
const seed = { ...DONE, 'afeka-sched-v1-edit': JSON.stringify(state) };

test('desktop: a hand change of the tutorial only marks the new tutorial, not the lecture, and leaves one "היה כאן" (the old tutorial)', async (t) => {
  const page = await visitIn(browser, t, 'desktop', seed, '#edit/changes');
  const blk = (gid) => page.locator(`#editWeek .blk[data-gid="${gid}"]`);
  await blk('279090105/2').first().waitFor();
  assert.ok(await blk('279090105/2').first().evaluate((b) => b.classList.contains('changed')), 'the new tutorial');
  assert.deepEqual(await blk('279090105').evaluateAll((bs) => bs.map((b) => b.classList.contains('changed'))), [false, false], 'the lecture did not move');
  const ghosts = (day) => page.locator(`#editWeek .day[aria-label="יום ${day}"] .off.ghost`).count();
  assert.equal(await ghosts('ראשון'), 0, 'nothing was moved away on Sunday');
  assert.equal(await ghosts('רביעי'), 1, 'only the old tutorial was there');
  assert.equal(await page.locator('#editDays [data-day="1"] .chg').count(), 0, 'no change dot on Sunday, only the lecture is there');
});
