// Improve mode, stage 2 (design A): the week is the board and the edit page's two screens are tools in a column (a sheet on a phone), with a dock of
// two steps and the record, which opens over the edit page as an overlay. Every visit sets { design: 'a' }. The seeded state and the held search worker
// are the ones of edit-focus.spec.mjs. No top-level await in a spec: node:test then hangs after the run.
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
const state = (over) => ({ v: 1, dataset: { year: 2027, sem: 'א', program: 30, startYear: 2026 }, registered: false, owned: [], original: BASE, baseline: BASE, movable: ['30003'], goal: { dayOff: 4 }, ...over });
const seed = (over) => ({ ...DONE, 'afeka-sched-v1-edit': JSON.stringify(state(over)) });
const visit = (t, size, s, hash = '#edit/changes') => visitIn(browser, t, size, s, hash, 'light', false, false, { design: 'a' });
const holdWorker = (page) => {
  let release, reached, first = true;
  const gate = new Promise((r) => (release = r)), arrived = new Promise((r) => (reached = r));
  page.route('**/edit-worker.js', async (route) => {
    if (first) {
      first = false;
      reached();
      await gate;
    }
    await route.continue();
  });
  return { release, reached: arrived };
};
const search = async (page) => {
  await page.locator('[data-ed="search"]').click();
  await page.locator('.prop-nav').waitFor({ timeout: 30000 });
};
const dock = (page, tool) => page.locator(`.dock [data-tool="${tool}"]`);

test('the dock of improve mode: the two screens and the record, the build tools are gone; the pressed one is the screen shown', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await page.locator('#editWeek .blk').first().waitFor({ timeout: 30000 });
  const shown = await page.evaluate(() => [...document.querySelectorAll('.dock .dk')].filter((b) => !b.hidden && b.checkVisibility()).map((b) => b.dataset.tool));
  assert.deepEqual(shown.sort(), ['changes', 'me', 'mine']);
  assert.equal(await dock(page, 'changes').getAttribute('aria-pressed'), 'true');
  assert.equal(await dock(page, 'mine').getAttribute('aria-pressed'), 'false');
  await dock(page, 'mine').click();
  await page.waitForFunction(() => location.hash === '#edit');
  await page.locator('#edit .edit-stage[data-tool="mine"]').waitFor();
  assert.equal(await dock(page, 'mine').getAttribute('aria-pressed'), 'true');
  await dock(page, 'changes').click();
  await page.waitForFunction(() => location.hash === '#edit/changes');
  await page.locator('#edit .edit-stage[data-tool="changes"]').waitFor();
});

test('the changes button with no schedule loaded says so, and stays on the first screen', async (t) => {
  const page = await visit(t, 'desktop', { ...DONE }, '#edit');
  await page.locator('#edit .edit-stage').waitFor({ timeout: 30000 });
  await dock(page, 'changes').click();
  await page.locator('#edMsg').filter({ hasText: 'טענו מערכת' }).waitFor();
  assert.equal(new URL(page.url()).hash, '#edit');
});

test('a moved lesson shows "היה כאן" on the board while the proposal tool is open', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await search(page);
  assert.ok((await page.locator('#editWeek .off.ghost').count()) > 0, 'the old place of a moved lesson is drawn');
  assert.equal(await page.locator('#edit .edit-tool .prop-nav').isVisible(), true, 'while the tool shows the proposals');
  assert.equal(await page.locator('#editWeek').isVisible(), true);
  assert.match(await page.locator('#editWeek').innerText(), /היה כאן/);
});

test('phone 320: the goal row keeps its horizontal scroll after a redraw', async (t) => {
  const page = await visit(t, { width: 320, height: 640 }, seed());
  await page.locator('.edit-tool .goals').waitFor({ timeout: 30000 });
  const before = await page.evaluate(() => {
    const g = document.querySelector('#edit .goals');
    g.scrollLeft = -60; // right to left: negative is further along
    return g.scrollLeft;
  });
  assert.notEqual(before, 0, 'the row scrolls at 320');
  await page.locator('[data-ed-goal="dayOff"]').selectOption('3'); // a change redraws the page
  await page.waitForFunction(() => document.querySelector('[data-ed-goal="dayOff"]')?.value === '3');
  const after = await page.evaluate(() => document.querySelector('#edit .goals').scrollLeft);
  assert.ok(Math.abs(after - before) < 3, `the row stayed where it was (${before} -> ${after})`);
});

test('saving a proposal updates the board and closes nothing', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await search(page);
  const hash = new URL(page.url()).hash;
  await page.locator('[data-ed="saveProposal"]').click();
  await page.locator('#toast.show').waitFor();
  assert.equal(await page.locator('dialog[open]').count(), 0, 'no dialog');
  assert.equal(new URL(page.url()).hash, hash, 'the same screen');
  assert.equal(await page.locator('#edit .edit-tool').isVisible(), true, 'the tool is still open');
  assert.equal(await page.locator('#editWeek .blk').first().isVisible(), true, 'the board still draws the week');
});

test('the proposal switcher moves with the arrow keys in improve mode and never changes the builder alternative', async (t) => {
  const page = await visit(t, 'desktop', seed());
  const was = await page.evaluate(async () => (await import('./ui-common.js')).ui.cur);
  await search(page);
  const label = () => page.locator('.prop-nav .alt-label').textContent();
  const first = await label();
  assert.match(first, /^הצעה 1 מתוך/);
  await page.keyboard.press('ArrowLeft'); // right to left: left is next
  await page.waitForFunction((f) => document.querySelector('.prop-nav .alt-label')?.textContent !== f, first, { timeout: 5000 });
  const second = await label();
  assert.notEqual(second, first, 'the key moved the proposal');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction((f) => document.querySelector('.prop-nav .alt-label')?.textContent === f, first, { timeout: 5000 });
  assert.equal(await page.evaluate(async () => (await import('./ui-common.js')).ui.cur), was, 'the builder alternative did not move');
  assert.equal(await page.locator('#layout').isVisible(), false, 'the builder is not on screen');
  // not under the record: an arrow at its heading changes nothing below
  await dock(page, 'me').click();
  await page.locator('#panel #meTitle').waitFor();
  await page.locator('#panel #meTitle').focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await label(), first, 'the keys are not taken while the record is open over the page');
});

test('a stale proposal is dropped after a record change and a new search is asked for', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await search(page);
  await dock(page, 'me').click();
  await page.locator('#panel #me').waitFor({ state: 'visible' });
  await page.locator('#panel [data-chg="amirnet"]').fill('120');
  await page.locator('#panel [data-chg="amirnet"]').dispatchEvent('change');
  await page.keyboard.press('Escape');
  await page.locator('#panel').waitFor({ state: 'hidden' });
  await page.locator('.prop-nav').waitFor({ state: 'detached', timeout: 10000 });
  assert.match(await page.locator('#edMsg').innerText(), /חפשו הצעות מחדש/, 'the page says to search again');
  await search(page);
  assert.equal(await page.locator('.prop-nav').count(), 1, 'and the new search finds proposals');
});

test('the record opens over improve mode without leaving it, writing mode build, changing the step or stopping a search', async (t) => {
  const page = await visit(t, 'desktop', seed());
  const held = holdWorker(page);
  await page.locator('[data-ed="search"]').click();
  await held.reached;
  const mode = await page.evaluate(() => localStorage.getItem('afeka-sched-v1-mode'));
  await dock(page, 'me').click();
  await page.locator('#panel #me').waitFor({ state: 'visible' });
  assert.equal(new URL(page.url()).hash, '#edit/changes', 'the address is the edit step');
  assert.equal(await page.evaluate(() => localStorage.getItem('afeka-sched-v1-mode')), mode, 'the mode is not written');
  assert.equal(await page.locator('[data-ed="search"]').getAttribute('aria-disabled'), 'true', 'the search is still running');
  assert.equal(await page.locator('#edit').isVisible(), true, 'the edit page stays under it');
  held.release(); // the answer comes while the record is open over the page
  await page.locator('.prop-nav').waitFor({ state: 'attached', timeout: 30000 });
  assert.equal(await page.locator('#panel #me').isVisible(), true, 'the record is still open');
  assert.equal(new URL(page.url()).hash, '#edit/changes');
  await page.keyboard.press('Escape'); // Escape closes it, at every width
  await page.locator('#panel').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.prop-nav').isVisible(), true, 'the answer is there when it closes');
});

test('phone: the step animation never leaves a transformed ancestor around the fixed sheet', async (t) => {
  const page = await visit(t, 'phone', seed(), '#edit');
  await page.emulateMedia({ reducedMotion: 'no-preference' }); // the visit asks for reduced motion: here the animation has to run
  await page.locator('[data-ed="next"]').waitFor({ timeout: 30000 });
  await page.locator('[data-ed="next"]').click();
  await page.waitForFunction(() => location.hash === '#edit/changes');
  const bad = await page.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 6; i++) {
      const tool = document.querySelector('.edit-tool');
      for (let e = tool; e && e !== document.documentElement; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (s.transform !== 'none' || s.filter !== 'none' || s.perspective !== 'none' || /transform|filter/.test(s.willChange)) out.push(`${e.className || e.id || e.tagName}: ${s.transform} ${s.filter}`);
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    return [...new Set(out)];
  });
  assert.deepEqual(bad, [], 'no transform or filter on the sheet or any ancestor, during and after the step animation');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.edit-tool')).position), 'fixed');
});

test('the day selector stays reachable at 320 and in a landscape phone', async (t) => {
  for (const size of [{ width: 320, height: 640 }, { width: 568, height: 320 }]) {
    const page = await visit(t, size, seed());
    await page.locator('#editWeek .blk').first().waitFor({ state: 'attached', timeout: 30000 });
    await dock(page, 'changes').click(); // a phone: the pressed button closes the sheet, and the week is in view
    await page.locator('#editDays [data-ed="day"]').first().waitFor({ state: 'visible' });
    const hit = await page.evaluate(() => {
      const bad = [];
      for (const b of document.querySelectorAll('#editDays [data-ed="day"]')) {
        const r = b.getBoundingClientRect(), at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!(at === b || b.contains(at))) bad.push(`${b.dataset.day}: covered by ${at?.className || at?.tagName}`);
        if (r.height < 43.5 || r.width < 43.5) bad.push(`${b.dataset.day}: ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return bad;
    });
    assert.deepEqual(hit, [], `${size.width}px: every day button can be pressed`);
  }
});

test('phone: the sheet closes with its X and with the pressed dock button, and opens again with the dock', async (t) => {
  const page = await visit(t, 'phone', seed());
  await page.locator('.edit-tool').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('.edit-sheet-x').click();
  await page.locator('.edit-tool').waitFor({ state: 'hidden' });
  assert.equal(await dock(page, 'changes').getAttribute('aria-pressed'), 'false');
  await page.locator('#editWeek .blk').first().click(); // the week can be pressed: the lesson menu opens
  await page.locator('#pop:popover-open').waitFor();
  await page.keyboard.press('Escape');
  await dock(page, 'changes').click();
  await page.locator('.edit-tool').waitFor({ state: 'visible' });
  assert.equal(await dock(page, 'changes').getAttribute('aria-pressed'), 'true');
  await dock(page, 'changes').click();
  await page.locator('.edit-tool').waitFor({ state: 'hidden' });
});

test('focus inside the edit tools is never treated as outside the page: the answer takes it', async (t) => {
  const page = await visit(t, 'desktop', seed());
  const held = holdWorker(page);
  await page.locator('[data-ed="search"]').focus();
  await page.keyboard.press('Enter');
  await held.reached;
  await page.locator('[data-ed-goal="dayOff"]').focus(); // moved to another control of the same tool while the search runs
  held.release();
  await page.locator('.prop-nav').waitFor({ timeout: 30000 });
  await page.waitForTimeout(150);
  const where = await page.evaluate(() => ({ inEdit: !!document.activeElement?.closest('#edit'), tag: document.activeElement?.tagName, goal: document.activeElement?.dataset?.edGoal }));
  assert.equal(where.inEdit, true, `focus is in the edit page (${where.tag})`);
  assert.equal(where.goal, 'dayOff', 'on the control it was moved to');
});

test('phone: Escape closes the sheet, the week is reachable only then, and the dock button takes the focus back', async (t) => {
  const page = await visit(t, 'phone', seed());
  await page.locator('.edit-tool').waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await page.evaluate(() => document.querySelector('.edit-board').inert), true, 'under the open sheet the week is not reachable');
  await page.locator('[data-ed-goal="dayOff"]').focus();
  await page.keyboard.press('Escape');
  await page.locator('.edit-tool').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.querySelector('.edit-board').inert), false, 'closed: the week can be used');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.tool), 'changes', 'focus is on the dock button of the screen');
  await dock(page, 'changes').click();
  await page.locator('.edit-tool').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.querySelector('.edit-board').inert), true);
});

test('phone: "הראה את היום החדש" closes the sheet over the week and puts focus on the week', async (t) => {
  const page = await visit(t, 'phone', seed());
  await search(page);
  await page.locator('[data-ed="newDay"]').click();
  await page.locator('.edit-tool').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'editWeekTitle', 'focus is on the week, which can be seen');
  assert.equal(await dock(page, 'changes').getAttribute('aria-pressed'), 'false');
});

test('the changes button leaves the record open when the changes screen cannot open', async (t) => {
  const page = await visit(t, 'desktop', { ...DONE }, '#edit');
  await page.locator('#edit .edit-stage').waitFor({ timeout: 30000 });
  await dock(page, 'me').click();
  await page.locator('#panel #me').waitFor({ state: 'visible' });
  await dock(page, 'changes').click(); // no schedule loaded: it stays here and says so
  await page.locator('#edMsg').filter({ hasText: 'טענו מערכת' }).waitFor();
  assert.equal(new URL(page.url()).hash, '#edit');
  assert.equal(await page.locator('#panel').isVisible(), false, 'the record closed with the press, as the shell and its state agree');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => location.hash), '#edit', 'Escape does not navigate');
});
