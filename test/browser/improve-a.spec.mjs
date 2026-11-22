// Improve mode inside design A's frame (stage 1: the existing edit page is the whole stage): no numbered-step wording, no mode label (the tabs are the
// mode switch), no dock, and the tabs and the menu where they are on the build page. Every visit sets { design: 'a' }.
// No top-level await in a spec: node:test then hangs after the run.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DONE, launch, visit as visitIn } from './helpers.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const L = (course, name, type, group, day, start, end) => ({ course, name, type, group, day, start, end });
const BASE = [
  L('30003', 'מבוא לכימיה', 'סופי-הרצאה+תרגול', '273000302', 4, '14:00', '15:50'), L('30003', 'מבוא לכימיה', 'תרגול', '273000302/1', 4, '16:00', '16:50'),
  L('30112', 'תרמודינמיקה 1', 'סופי-הרצאה+תרגול', '273011204', 3, '15:00', '16:50'), L('30112', 'תרמודינמיקה 1', 'תרגול', '273011204/1', 3, '17:00', '17:50')
];
const state = { v: 1, dataset: { year: 2027, sem: 'א', program: 30, startYear: 2026 }, registered: false, owned: [], original: BASE, baseline: BASE, movable: ['30003'], goal: { dayOff: 4 } };
const SEED = { ...DONE, 'afeka-sched-v1-edit': JSON.stringify(state) };
const visit = (t, size, seed, hash) => visitIn(browser, t, size, seed, hash, 'light', false, false, { design: 'a' });
const RULE = /שלב\s*\d|צעד\s*\d|הבא\s*:|חזרה לצעד|סרגל השלבים/;

for (const size of ['phone', 'desktop'])
  test(`${size}: the edit page names no numbered step, in either of its two screens`, async (t) => {
    const page = await visit(t, size, SEED, '#edit');
    await page.locator('#edit .me-foot [data-ed="next"]').waitFor({ timeout: 30000 });
    const one = await page.evaluate(() => document.body.innerText);
    assert.doesNotMatch(one, RULE, `the first screen: ${RULE.exec(one)?.[0]}`);
    assert.match(await page.locator('[data-ed="next"]').innerText(), /לשינויים/, 'the way on says where it goes');
    await page.locator('[data-ed="next"]').click();
    await page.waitForFunction(() => location.hash === '#edit/changes');
    await page.locator('[data-ed="search"]').waitFor({ timeout: 30000 });
    const two = await page.evaluate(() => document.body.innerText);
    assert.doesNotMatch(two, RULE, `the second screen: ${RULE.exec(two)?.[0]}`);
    assert.match(await page.locator('#edit .me-foot a[href="#edit"]').innerText(), /חזרה למערכת שלי/, 'the way back says where it goes');
  });

test('the edit page has no mode label: the tabs are the mode switch, the dock and the tool panel are not there, the improve tab is selected', async (t) => {
  const page = await visit(t, 'phone', SEED, '#edit');
  await page.locator('#edit .me-foot').waitFor({ timeout: 30000 });
  assert.equal(await page.locator('.mode-label').count(), 0, 'no "עורכים מערכת קיימת · החלפה" button');
  assert.equal(await page.locator('.a-top .modes a[data-mode="edit"][aria-current="page"]').count(), 1);
  assert.equal(await page.locator('.a-top .modes a[data-mode="build"][aria-current]').count(), 0);
  assert.equal(await page.locator('.dock').isVisible(), false, 'no dock');
  assert.equal(await page.locator('#panel').isVisible(), false, 'no tool panel');
  assert.equal(await page.locator('.menu-btn').isVisible(), true, '☰ is where it is on the board');
});
