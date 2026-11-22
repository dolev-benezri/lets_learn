// Design A at the widths where the layout changes (600, 759/760, 1079/1080) and when the window is resized with a tool open: no sideways scroll, the dock at
// the bottom below 1080px and on top from there, the tool a sheet below and a column from there, the alternatives column only from 1080px.
// Every visit sets { design: 'a' }. No top-level await in a spec: node:test then hangs after the run.
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

const visit = (t, size, seed, hash = '') => visitIn(browser, t, size, seed, hash, 'light', false, false, { design: 'a' });
const settle = async (page) => {
  await page.locator('#week .blk').first().waitFor({ state: 'attached', timeout: 30000 });
  await page.waitForFunction(() => document.getElementById('board')?.getAttribute('aria-busy') !== 'true', null, { timeout: 30000 });
  await page.waitForTimeout(200);
};
const layout = (page) =>
  page.evaluate(() => {
    const box = (s) => document.querySelector(s)?.getBoundingClientRect();
    const dock = box('.dock'), panel = document.getElementById('panel');
    return {
      width: innerWidth, height: innerHeight, fits: document.documentElement.scrollWidth <= innerWidth,
      dockAtBottom: Math.abs(dock.bottom - innerHeight) < 2, dockOnTop: dock.top < 200 && dock.bottom < innerHeight / 2,
      panelPos: getComputedStyle(panel).position, panelVisible: panel.checkVisibility(), toolVisible: document.getElementById('courses').checkVisibility(),
      alts: !!document.getElementById('alts')?.checkVisibility()
    };
  });

for (const w of [320, 599, 600, 759, 760, 1079, 1080, 1279, 1280])
  test(`${w}px: the layout of the tool, the dock and the alternatives column`, async (t) => {
    const page = await visit(t, { width: w, height: 800 }, DONE, '#courses');
    await page.locator('#panel #courses').waitFor({ state: 'visible' });
    await settle(page);
    const m = await layout(page);
    assert.equal(m.fits, true, 'no sideways scroll');
    assert.equal(m.toolVisible, true, 'the tool is open');
    if (w < 1080) {
      assert.equal(m.dockAtBottom, true, `the dock is at the bottom: ${JSON.stringify(m)}`);
      assert.equal(m.panelPos, 'fixed', 'the tool is a sheet');
      assert.equal(m.alts, false, 'no alternatives column');
    } else {
      assert.equal(m.dockOnTop, true, `the dock is on top: ${JSON.stringify(m)}`);
      assert.equal(m.panelPos, 'sticky', 'the tool is a column');
      assert.equal(m.alts, true, 'the alternatives column is there');
    }
  });

test('a resize across 1080px with a tool open keeps the tool, and with the menu open keeps the menu', async (t) => {
  const page = await visit(t, { width: 1280, height: 800 }, DONE, '#courses');
  await page.locator('#panel #courses').waitFor({ state: 'visible' });
  await settle(page);
  assert.equal((await layout(page)).panelPos, 'sticky');
  for (const w of [1079, 700, 1080, 1280, 320, 1100]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.waitForTimeout(250);
    const m = await layout(page);
    assert.equal(m.toolVisible, true, `${w}: the tool is still open`);
    assert.equal(m.fits, true, `${w}: no sideways scroll`);
    assert.equal(m.panelPos, w < 1080 ? 'fixed' : 'sticky', `${w}: the tool follows the width`);
    assert.equal(new URL(page.url()).hash, '#courses', `${w}: the address did not change`);
  }
  // the menu: modal at every width, so it keeps its place across a resize
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('.menu-btn').click();
  await page.locator('#drawer[open]').waitFor();
  for (const w of [700, 1280]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#drawer[open]').count(), 1, `${w}: the menu is still open`);
    assert.equal(await page.evaluate(() => document.getElementById('drawer').matches(':modal')), true, `${w}: and modal`);
  }
  await page.keyboard.press('Escape');
  await page.locator('#drawer[open]').waitFor({ state: 'detached' });
  assert.equal((await layout(page)).toolVisible, true, 'the tool is still there after the menu closes');
});
