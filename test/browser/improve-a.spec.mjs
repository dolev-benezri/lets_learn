// Improve mode inside design A's frame (stage 1: the existing edit page is the whole stage): no numbered-step wording, no mode label (the tabs are the
// mode switch), the dock of improve mode, and the tabs and the menu where they are on the build page. Every visit sets { design: 'a' }.
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
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.dock .dk')].filter((b) => !b.hidden).map((b) => b.dataset.tool).sort()), ['changes', 'me', 'mine'], 'the dock holds the edit steps and the record, not the build tools');
  assert.equal(await page.locator('#panel').isVisible(), false, 'no tool panel');
  assert.equal(await page.locator('.menu-btn').isVisible(), true, '☰ is where it is on the board');
});

// Stage 2: from 1080px the tool is a column (sticky, its own scroller) and the week is the board beside it; below, the tool is a sheet over the week.
for (const [w, h] of [[1280, 800], [1440, 900], [1080, 800]])
  test(`${w}px: the tool is a column on the right, the week the board beside it, and the foot stays in view`, async (t) => {
    const page = await visit(t, { width: w, height: h }, SEED, '#edit/changes');
    await page.locator('#editWeek .blk').first().waitFor({ timeout: 30000 });
    const m = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const tool = r('.edit-tool'), board = r('.edit-board'), foot = r('.edit-tool .me-foot');
      return { toolLeft: tool.left, toolTop: tool.top, boardRight: board.right, boardTop: board.top, boardW: board.width, footBottom: foot.bottom, h: innerHeight,
        pos: getComputedStyle(document.querySelector('.edit-tool')).position, dir: getComputedStyle(document.getElementById('edit')).direction,
        fits: document.documentElement.scrollWidth <= innerWidth };
    });
    assert.equal(m.fits, true, 'no sideways scroll');
    assert.equal(m.dir, 'rtl');
    assert.ok(m.boardRight <= m.toolLeft + 1, `RTL: the tool is on the right (${m.toolLeft}), the board to its left (ends at ${m.boardRight})`);
    assert.ok(Math.abs(m.boardTop - m.toolTop) < 150, 'they start at the same height');
    assert.ok(m.boardW > 400, `the week has room: ${Math.round(m.boardW)}px`);
    assert.equal(m.pos, 'sticky', 'the tool column stays in view');
    assert.ok(m.footBottom <= m.h + 1, `the foot (search, back) is in view (${m.footBottom} of ${m.h})`);
  });

test('1280px, a short window: the tool column is pinned below the top bar and its foot comes into view', async (t) => {
  const page = await visit(t, { width: 1280, height: 420 }, SEED, '#edit/changes');
  await page.locator('#editWeek .blk').first().waitFor({ timeout: 30000 });
  const m = await page.evaluate(async () => {
    window.scrollTo(0, 400); // the column sticks below the top bar: once the page is scrolled, the whole tool and its foot are in view
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const tool = document.querySelector('.edit-tool'), foot = tool.querySelector('.me-foot').getBoundingClientRect(), box = tool.getBoundingClientRect();
    return { footBottom: foot.bottom, h: innerHeight, top: box.top, bottom: box.bottom, overflowY: getComputedStyle(tool).overflowY };
  });
  assert.ok(m.footBottom <= m.h + 1, `the foot is in view (${m.footBottom} of ${m.h})`);
  assert.ok(m.bottom <= m.h + 1 && m.top >= 0, `the column is pinned inside the window (${m.top}..${m.bottom})`);
  assert.equal(m.overflowY, 'auto');
  await page.locator('[data-ed="search"]').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('[data-ed="search"]').isVisible(), true);
});

test('1279px and a phone: the tool is a sheet over the week with the dock under it', async (t) => {
  for (const [w, h] of [[1079, 800], [375, 812]]) {
    const page = await visit(t, { width: w, height: h }, SEED, '#edit/changes');
    await page.locator('#editWeek .blk').first().waitFor({ state: 'attached', timeout: 30000 });
    const m = await page.evaluate(() => {
      const tool = document.querySelector('.edit-tool').getBoundingClientRect(), dock = document.querySelector('.dock').getBoundingClientRect(), board = document.querySelector('.edit-board').getBoundingClientRect();
      return { pos: getComputedStyle(document.querySelector('.edit-tool')).position, toolBottom: tool.bottom, dockTop: dock.top, boardW: board.width, iw: innerWidth, fits: document.documentElement.scrollWidth <= innerWidth };
    });
    assert.equal(m.pos, 'fixed', `${w}: a sheet`);
    assert.ok(Math.abs(m.toolBottom - m.dockTop) <= 2, `${w}: it sits on the dock (${m.toolBottom} / ${m.dockTop})`);
    assert.ok(m.boardW >= m.iw - 40, `${w}: the board is the full width`);
    assert.equal(m.fits, true, `${w}: no sideways scroll`);
  }
});

test('1280px: the goal chips stay in one row, a scroller in the column', async (t) => {
  const page = await visit(t, { width: 1280, height: 800 }, SEED, '#edit/changes');
  await page.locator('#editWeek .blk').first().waitFor({ timeout: 30000 });
  const rows = await page.evaluate(() => new Set([...document.querySelector('.edit-tool .goals').children].filter((c) => c.getClientRects().length).map((c) => Math.round(c.getBoundingClientRect().top))).size);
  assert.equal(rows, 1, 'one row of chips');
});
