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

// Stage 1b: on a wide screen the changes screen puts the week beside the controls (a CSS grid on the existing wrapper: the DOM and its order stay)
const WIDE = [[1280, 800], [1440, 900], [1080, 800]];
for (const [w, h] of WIDE)
  test(`${w}px: the changes screen shows the week beside the controls, and keeps the order a keyboard reads`, async (t) => {
    const page = await visit(t, { width: w, height: h }, SEED, '#edit/changes');
    await page.locator('#editWeek .blk').first().waitFor({ timeout: 30000 });
    const m = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const goals = r('.edit-step .goals'), week = r('#editWeek'), foot = r('.edit-step .me-foot');
      const order = [...document.querySelectorAll('.edit-step .goals, #editWeek')].map((e) => e.id || e.className);
      return { goalsLeft: goals.left, goalsRight: goals.right, goalsTop: goals.top, weekLeft: week.left, weekRight: week.right, weekTop: week.top, footTop: foot.top, weekBottom: week.bottom, order, fits: document.documentElement.scrollWidth <= innerWidth };
    });
    assert.equal(m.fits, true, 'no sideways scroll');
    assert.ok(m.weekRight <= m.goalsLeft + 1, `RTL: the controls are on the right (${m.goalsLeft}), the week is to their left (it ends at ${m.weekRight})`);
    assert.ok(Math.abs(m.weekTop - m.goalsTop) < 120, `they start at the same height (${m.weekTop} / ${m.goalsTop})`);
    assert.ok(m.weekBottom <= m.footTop + 1, 'the foot is below both');
    assert.ok(m.weekRight - m.weekLeft > 400, `the week has room: ${Math.round(m.weekRight - m.weekLeft)}px`);
    assert.deepEqual(m.order, ['goals', 'editWeek'], 'the controls come before the week in the page, as they are read');
  });

test('1079px and a phone: the changes screen stays one column, the week under the controls', async (t) => {
  for (const [w, h] of [[1079, 800], [375, 812]]) {
    const page = await visit(t, { width: w, height: h }, SEED, '#edit/changes');
    await page.locator('#editWeek .blk').first().waitFor({ state: 'attached', timeout: 30000 });
    const m = await page.evaluate(() => {
      const goals = document.querySelector('.edit-step .goals').getBoundingClientRect(), week = document.getElementById('editWeek').getBoundingClientRect();
      return { below: week.top >= goals.bottom - 1, same: week.left < goals.right && week.right > goals.left && week.width > 100 && goals.width > 100, fits: document.documentElement.scrollWidth <= innerWidth };
    });
    assert.equal(m.same, true, `${w}: the same column, both with a size`);
    assert.equal(m.below, true, `${w}: the week is under the controls`);
    assert.equal(m.fits, true, `${w}: no sideways scroll`);
  }
});

// Codex review of stage 1b: the foot is sticky, so it must stay in the viewport while the week and the controls are taller than the window
test('1280px, a short window: the foot (search, back) stays in view over a changes screen taller than the window', async (t) => {
  const page = await visit(t, { width: 1280, height: 420 }, SEED, '#edit/changes');
  await page.locator('#editWeek .blk').first().waitFor({ timeout: 30000 });
  const m = await page.evaluate(() => {
    const foot = document.querySelector('.edit-step .me-foot').getBoundingClientRect();
    return { tall: document.documentElement.scrollHeight > innerHeight + 50, footBottom: foot.bottom, height: innerHeight, direction: getComputedStyle(document.getElementById('edit')).direction };
  });
  assert.equal(m.direction, 'rtl');
  assert.equal(m.tall, true, 'the page is taller than the window');
  assert.ok(m.footBottom <= m.height + 1, `the foot is in view at the top of the page (bottom ${m.footBottom} of ${m.height})`);
  await page.locator('[data-ed="search"]').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('[data-ed="search"]').isVisible(), true, 'the search button can be pressed without scrolling to the end');
});

test('1280px: the goal chips stay in one row (a scroller when the column is narrow), as on a phone', async (t) => {
  const page = await visit(t, { width: 1280, height: 800 }, SEED, '#edit/changes');
  await page.locator('#editWeek .blk').first().waitFor({ timeout: 30000 });
  const m = await page.evaluate(() => {
    const g = document.querySelector('.edit-step .goals'), chips = [...g.children].filter((c) => c.getClientRects().length);
    return { rows: new Set(chips.map((c) => Math.round(c.getBoundingClientRect().top))).size, overflowX: getComputedStyle(g).overflowX };
  });
  assert.equal(m.rows, 1, 'one row of chips');
});
