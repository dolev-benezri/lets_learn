// Improve mode, stage 2 (design A): the week is the board and the edit page's two screens are tools in a column (a sheet on a phone), with a dock of
// two steps and the record, which opens over the edit page as an overlay. Every visit sets { design: 'a' }. The seeded state and the held search worker
// are the ones of edit-focus.spec.mjs. No top-level await in a spec: node:test then hangs after the run.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildOptions } from '../../web/solver-core.js';
import { classify } from '../../web/rules.js';
import { groupNumber } from '../../web/ui-text.js';
import { DONE, STUDENT, launch, visit as visitIn } from './helpers.mjs';

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
  await page.locator('#edit .edit-card').waitFor({ timeout: 30000 });
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

// phase 2, Task E: the goal chips wrap (the row is no scroller), every label whole, at 320 and 1280, and a redraw does not change that
for (const [name, size] of [['320', { width: 320, height: 640 }], ['1280', { width: 1280, height: 800 }]])
  test(`${name}: the goal chips wrap with every label whole and nothing scrolls sideways, also after a redraw`, async (t) => {
    const page = await visit(t, size, seed());
    await page.locator('.edit-tool .goals').waitFor({ timeout: 30000 });
    const measure = () =>
      page.evaluate(() => {
        const g = document.querySelector('#edit .goals'), box = g.getBoundingClientRect();
        const chips = [...g.children].filter((c) => c.getClientRects().length);
        return {
          n: chips.length, wrap: getComputedStyle(g).flexWrap, overflowX: getComputedStyle(g).overflowX, rowScroll: g.scrollWidth - g.clientWidth,
          whole: chips.every((c) => c.scrollWidth <= c.clientWidth + 1 && c.getBoundingClientRect().left >= box.left - 0.5 && c.getBoundingClientRect().right <= box.right + 0.5),
          page: document.documentElement.scrollWidth - innerWidth
        };
      });
    for (const when of ['first draw', 'after a change']) {
      const m = await measure();
      assert.ok(m.n >= 3, `${when}: the chips are there`);
      assert.equal(m.wrap, 'wrap', `${when}: the row wraps`);
      assert.equal(m.overflowX, 'visible', `${when}: the row is not a scroller`);
      assert.ok(m.rowScroll <= 1, `${when}: nothing to scroll in the row (${m.rowScroll})`);
      assert.equal(m.whole, true, `${when}: every chip is whole inside the row`);
      assert.ok(m.page <= 0, `${when}: the page does not scroll sideways (${m.page})`);
      await page.locator('[data-ed-goal="dayOff"]').selectOption('3'); // a change redraws the page
      await page.waitForFunction(() => document.querySelector('[data-ed-goal="dayOff"]')?.value === '3');
    }
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
  await page.locator('#panel [data-chg="amirnet"]').blur(); // one change event, in every engine
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
  await page.locator('[data-ed="more"]').click();
  await page.locator('[data-ed="newDay"]').click();
  await page.locator('.edit-tool').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'editWeekTitle', 'focus is on the week, which can be seen');
  assert.equal(await dock(page, 'changes').getAttribute('aria-pressed'), 'false');
});

test('the changes button leaves the record open when the changes screen cannot open', async (t) => {
  const page = await visit(t, 'desktop', { ...DONE }, '#edit');
  await page.locator('#edit .edit-card').waitFor({ timeout: 30000 });
  await dock(page, 'me').click();
  await page.locator('#panel #me').waitFor({ state: 'visible' });
  await dock(page, 'changes').click(); // no schedule loaded: it stays here and says so
  await page.locator('#edMsg').filter({ hasText: 'טענו מערכת' }).waitFor();
  assert.equal(new URL(page.url()).hash, '#edit');
  assert.equal(await page.locator('#panel').isVisible(), false, 'the record closed with the press, as the shell and its state agree');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => location.hash), '#edit', 'Escape does not navigate');
});

// phase 2, Task D: the record takes the tool column's slot (state, not DOM removal), with a back control; the week never moves; a redraw of the tool does not
// bring the tool back over it; Escape and "חזרה" close it and focus returns to the dock's "המצב שלי"
for (const w of [1920, 1280, 1100])
  test(`${w}px: the record sits in the hidden tool column's slot, never over the week, and the week does not move`, async (t) => {
    const page = await visit(t, { width: w, height: 900 }, seed());
    await page.locator('#editWeek .blk').first().waitFor({ timeout: 30000 });
    await page.waitForLoadState('networkidle');
    const rect = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width }; }, sel);
    const tool = await rect('.edit-tool'), week = await rect('.edit-board');
    await dock(page, 'me').click();
    await page.locator('#panel #me').waitFor({ state: 'visible' });
    const panel = await rect('#panel'), weekAfter = await rect('.edit-board');
    assert.equal(await page.locator('.edit-tool').isVisible(), false, 'the tool is hidden while the record is open');
    assert.equal(await page.evaluate(() => document.querySelector('.a-stage').classList.contains('record-open')), true, 'by a class on the stage');
    assert.deepEqual(weekAfter, week, 'the week stays where it was');
    assert.ok(panel.l >= week.r - 1 || panel.r <= week.l + 1, `the record is beside the week, not over it: ${JSON.stringify({ panel, week })}`);
    assert.ok(Math.abs(panel.l - tool.l) <= 1.5 && Math.abs(panel.r - tool.r) <= 1.5, `in the tool column's slot: ${JSON.stringify({ panel, tool })}`);
    assert.ok(panel.t >= tool.t - 1.5, `under the tabs: ${panel.t} vs ${tool.t}`);
    assert.ok(panel.b <= 900 + 0.5, `inside the window: ${panel.b}`);
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.dock .dk[aria-pressed="true"]')].map((b) => b.dataset.tool)), ['me'], 'only the record is pressed');
  });

test('the record has a back control: "חזרה" closes it, so does Escape, and focus returns to the dock\'s "המצב שלי"', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await page.locator('#editWeek .blk').first().waitFor({ timeout: 30000 });
  for (const close of ['back', 'escape']) {
    await dock(page, 'me').click();
    await page.locator('#panel #me').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'meTitle', `${close}: opening moves focus into the record, to its heading`);
    const back = page.locator('#panel .a-back');
    assert.equal(await back.isVisible(), true, 'the way back is in the header');
    assert.match(await back.innerText(), /חזרה/);
    assert.ok((await back.boundingBox()).height >= 43.5, 'a 44px target');
    if (close === 'back') await back.click();
    else await page.keyboard.press('Escape');
    await page.locator('#panel').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.edit-tool').isVisible(), true, `${close}: the tool is back`);
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), 'dock-me', `${close}: focus returns to "המצב שלי"`);
  }
});

test('a search finishing while the record is open keeps it open, the tool hidden and focus where it was', async (t) => {
  const page = await visit(t, 'desktop', seed());
  const held = holdWorker(page);
  await page.locator('[data-ed="search"]').click();
  await held.reached;
  await dock(page, 'me').click();
  await page.locator('#panel #me').waitFor({ state: 'visible' });
  await page.locator('#panel [data-chg="amirnet"]').focus();
  held.release();
  await page.locator('.prop-nav').waitFor({ state: 'attached', timeout: 30000 }); // the answer redraws the tool underneath
  assert.equal(await page.locator('#panel #me').isVisible(), true, 'the record is still open');
  assert.equal(await page.locator('.edit-tool').isVisible(), false, 'and the redraw did not bring the tool back over it');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.chg), 'amirnet', 'focus stays on the field it was on');
});

test('a phone: the record is a sheet with "חזרה", the tool sheet is hidden under it, and closing brings the tool back', async (t) => {
  const page = await visit(t, 'phone', seed());
  await page.locator('[data-ed="search"]').waitFor({ timeout: 30000 });
  for (const close of ['back', 'escape']) {
    await dock(page, 'me').click();
    await page.locator('#panel #me').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.edit-tool').isVisible(), false, `${close}: no second sheet under the record`);
    const m = await page.evaluate(() => {
      const p = document.getElementById('panel'), r = p.getBoundingClientRect(), d = document.querySelector('.dock').getBoundingClientRect();
      return { role: p.getAttribute('role'), name: p.getAttribute('aria-labelledby'), bottom: r.bottom, dockTop: d.top, top: r.top };
    });
    assert.equal(m.role, 'dialog', `${close}: a sheet is a dialog`);
    assert.equal(m.name, 'meTitle', `${close}: named by its heading`);
    assert.ok(m.bottom <= m.dockTop + 1 && m.top >= 0, `${close}: the sheet sits above the dock: ${JSON.stringify(m)}`);
    if (close === 'back') await page.locator('#panel .a-back').click();
    else await page.keyboard.press('Escape');
    await page.locator('#panel').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.edit-tool').isVisible(), true, `${close}: the tool is back`);
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), 'dock-me', `${close}: focus returns to the dock's "המצב שלי"`);
  }
});

test('1280 x 420: with the page scrolled the record sticks under the strip with its "חזרה" in view, as the tool column did', async (t) => {
  const page = await visit(t, { width: 1280, height: 420 }, seed());
  await page.locator('#editWeek .blk').first().waitFor({ timeout: 30000 });
  await dock(page, 'me').click();
  await page.locator('#panel #me').waitFor({ state: 'visible' });
  const m = await page.evaluate(async () => {
    window.scrollTo(0, 300);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const strip = document.querySelector('.a-strip').getBoundingClientRect(), back = document.querySelector('#panel .a-back').getBoundingClientRect(), p = document.getElementById('panel').getBoundingClientRect();
    return { scrolled: scrollY, stripBottom: strip.bottom, backTop: back.top, backBottom: back.bottom, panelTop: p.top, h: innerHeight };
  });
  assert.ok(m.scrolled > 50, 'the page scrolls');
  assert.ok(m.backTop >= m.stripBottom - 0.5 && m.backBottom <= m.h, `"חזרה" is in view, under the strip: ${JSON.stringify(m)}`);
});

// ---- phase 2, Task F: the course search ----
const FIX = JSON.parse(readFileSync(new URL('../fixtures/real/2027-1/30-2026.json', import.meta.url), 'utf8'));
const savedEdit = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1-edit')));
const openSearch = async (page) => {
  await page.locator('[data-ed="openSearch"]').click();
  await page.locator('#csText').waitFor({ state: 'visible' });
};
const typed = async (page, text) => {
  await page.locator('#csText').fill(text);
  await page.locator('#csCount').filter({ hasNotText: 'מקלידים' }).waitFor();
};
const flat = (x) => x.replace(/\s+/g, ' ').trim();
// a course that is not in the schedule, with one option that clashes with it and one that fits
const meetingsOf = (c, g) => c.groups.find((x) => x.id === g).meetings;
const baselineHours = BASE.map((l) => ({ day: l.day, start: l.start, end: l.end }));
const clashesBase = (m) => baselineHours.some((b) => b.day === m.day && b.start < m.end && m.start < b.end);
const notInBase = (id) => !BASE.some((l) => l.course === id);
// a course the student can take (open for their record), the site can register (it has options), not in the schedule, whose options satisfy `pred`
const OPEN_NOW = classify(FIX, STUDENT).statuses;
const candidate = (pred) =>
  Object.entries(FIX.courses).find(([id, c]) => {
    if (!c.offered || !c.credits || !notInBase(id) || !c.groups.some((g) => g.primary) || !['retake', 'available', 'afterA', 'conditional'].includes(OPEN_NOW[id]?.status)) return false;
    const opts = buildOptions(c, { includeFull: true });
    return opts.length > 0 && pred(opts, c);
  });
const fits = (o) => !o.meetings.some(clashesBase);
// a full group has no "הוספה" (manager's ruling): the tests that add a fixed option need one that is not full
const groupFull = (gid) => Object.values(FIX.courses).some((c) => c.groups.some((g) => g.id === gid && g.full));
const free = (o) => !o.groups.some(groupFull);

test('the course search: "חיפוש קורס" opens it in the tool in place of the goals, with the field focused and "חזרה"', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await page.locator('[data-ed="openSearch"]').waitFor({ timeout: 30000 });
  assert.equal(await page.locator('[data-ed-goal="addCourse"]').count(), 0, 'the "+ קורס" select is gone');
  await openSearch(page);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'csText');
  assert.equal(await page.locator('.edit-tool .goals [data-ed-goal]').count(), 0, 'the goals are not under it');
  assert.equal(flat(await page.locator('#csCount').innerText()), 'מקלידים קוד, שם או מרצה, או בוחרים יום ושעה.');
  assert.equal(await page.locator('.cs-course').count(), 0, 'no list before a question');
  assert.equal(await page.locator('#csCount').getAttribute('aria-live'), 'polite');
  assert.equal(flat(await page.locator('.edit-tool [data-ed="closeSearch"]').innerText()), 'חזרה');
});

test('by code, by a part of the name, and by a lecturer (titles aside): each finds its course, with a count', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await openSearch(page);
  await typed(page, '3000');
  assert.ok((await page.locator('.cs-course h3').allInnerTexts()).includes('מבוא לכימיה'), 'a code prefix');
  const within = page.locator('.cs-course', { has: page.locator('h3', { hasText: 'מבוא לכימיה' }) });
  assert.match(await within.locator('.cs-meta').innerText(), /במערכת שלך/, 'it is in the schedule');
  assert.ok((await within.locator('[data-ed="csSwap"]').count()) >= 1 || (await within.locator('.cs-opt').count()) >= 1);
  await typed(page, 'תרמוד');
  assert.ok((await page.locator('.cs-course h3').allInnerTexts()).some((n) => n.includes('תרמודינמיקה')), 'a part of the name');
  assert.match(await page.locator('#csCount').innerText(), /^(קורס אחד|\d+ קורסים|יש עוד, מצמצמים\?)$/);
  const g = FIX.courses['30003'].groups.find((x) => x.lecturer);
  const surname = g.lecturer.replace(/^(ד"ר|גב'|מר|פרופ'?)\s+/, '').split(' ')[0];
  await typed(page, surname);
  assert.ok((await page.locator('.cs-course').count()) >= 1, 'a lecturer, without the title');
  await typed(page, 'zzzzzz');
  assert.equal(flat(await page.locator('#csCount').innerText()), 'אין קורס כזה');
});

test('a day and an hour narrow the courses to groups that meet then', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await openSearch(page);
  const [id, c] = candidate((opts) => opts.some((o) => o.meetings.length));
  const m = buildOptions(c, { includeFull: true }).find((o) => o.meetings.length).meetings[0];
  await page.locator('select[data-ed-s="day"]').selectOption(String(m.day));
  await page.locator('select[data-ed-s="hour"]').selectOption(m.start.slice(0, 2) + ':00');
  await page.locator('#csCount').filter({ hasNotText: 'מקלידים' }).waitFor();
  assert.ok((await page.locator('.cs-course h3').allInnerTexts()).includes(c.name), `${c.name} meets then`);
});

test('each option says "נכנס" or "מתנגש עם <course>"; a course not in the week offers "הוספה", one in it "מעבר לקבוצה"', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await openSearch(page);
  const [cid, cc] = candidate((opts) => opts.some((o) => o.meetings.some(clashesBase)));
  await typed(page, cid);
  const card = page.locator('.cs-course', { has: page.locator('h3', { hasText: cc.name }) }).first();
  assert.ok((await card.locator('.tag.warn').count()) >= 1, 'an option that meets in the schedule\'s hours clashes');
  assert.match(await card.locator('.tag.warn').first().innerText(), /^מתנגש עם /);
  assert.ok((await card.locator('[data-ed="csAdd"]').count()) >= 1, 'a course not in the schedule: "הוספה"');
  assert.equal(flat(await card.locator('[data-ed="csAdd"]').first().innerText()), 'הוספה');
  await typed(page, '30003');
  const mine = page.locator('.cs-course', { has: page.locator('h3', { hasText: 'מבוא לכימיה' }) }).first();
  assert.ok((await mine.locator('[data-ed="csSwap"]').count()) >= 1, 'a course in it: "מעבר לקבוצה"');
  assert.equal(await mine.locator('[data-ed="csAdd"]').count(), 0);
  assert.equal((await mine.locator('.tag.warn').count()), 0, 'the course itself is left out of its own clashes');
});

test('"הוספה" adds the course with that option fixed, and the next search puts it in the week in that option', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await openSearch(page);
  const [cid, cc] = candidate((opts) => opts.some((o) => o.meetings.length && fits(o) && o.groups.every((g) => !FIX.courses[Object.keys(FIX.courses).find((k) => FIX.courses[k].groups.some((x) => x.id === g))].groups.find((x) => x.id === g).full)));
  await typed(page, cid);
  const card = page.locator('.cs-course', { has: page.locator('h3', { hasText: cc.name }) }).first();
  const add = card.locator('[data-ed="csAdd"]').first();
  const ids = (await add.getAttribute('data-ids')).split(',');
  await add.click();
  assert.equal(await page.locator('#csText').count(), 0, 'the search closed');
  const st = await savedEdit(page);
  assert.ok(st.added.includes(cid), 'the course is added');
  assert.deepEqual(st.swaps[cid], ids, 'with that option fixed');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.ed), 'openSearch', 'focus returns to "חיפוש קורס"');
  await search(page);
  const text = await page.locator('.prop-panel').innerText();
  assert.ok(text.includes(cc.name), 'the proposal has it');
  const pcard = page.locator('.prop-panel .pcard', { has: page.locator('h4', { hasText: cc.name }) });
  const now = flat(await pcard.locator('.now').innerText());
  for (const id of ids.filter((g) => !g.includes('/'))) assert.ok(now.includes(groupNumber(id)), `in the option's group ${groupNumber(id)}: ${now}`);
});

test('a fixed option that clashes with what stays is told by the page; one that fits but leaves no schedule is told "no schedule with that group"', async (t) => {
  // (a) every option of the course meets in the schedule's hours: the search says which lessons overlap, before it runs
  const clashing = await visit(t, 'desktop', seed({ movable: [] }));
  await openSearch(clashing);
  const [cid, cc] = candidate((opts) => opts.every((o) => o.meetings.some(clashesBase)) && opts.some(free));
  await typed(clashing, cid);
  await clashing.locator('.cs-course', { has: clashing.locator('h3', { hasText: cc.name }) }).first().locator('[data-ed="csAdd"]').first().click();
  await clashing.locator('[data-ed="search"]').click();
  await clashing.locator('#edMsg').filter({ hasText: /\S/ }).waitFor({ timeout: 30000 });
  assert.equal(await clashing.locator('.prop-nav').count(), 0, 'no proposal');
  // (b) an option that fits the lessons but a goal (finish by 13:00) that cannot be met with them staying: no schedule with that group
  const fixedGoal = await visit(t, 'desktop', seed({ movable: [], goal: { notAfter: '13:00' } }));
  await openSearch(fixedGoal);
  const [id2, c2] = candidate((opts) => opts.some((o) => o.meetings.length && fits(o)));
  await typed(fixedGoal, id2);
  const fitting = fixedGoal.locator('.cs-course', { has: fixedGoal.locator('h3', { hasText: c2.name }) }).first().locator('.cs-opt', { has: fixedGoal.locator('.tag', { hasText: 'נכנס' }) });
  await fitting.first().locator('[data-ed="csAdd"]').click();
  await fixedGoal.locator('[data-ed="search"]').click();
  await fixedGoal.locator('#editNotes').waitFor({ timeout: 30000 });
  assert.match(await fixedGoal.locator('#editNotes').innerText(), /לא נמצאה מערכת עם הקבוצה הזו/);
});

test('Escape clears the field, a second Escape closes the search and focus returns to "חיפוש קורס": on a desktop and on a phone', async (t) => {
  for (const size of ['desktop', 'phone']) {
    const page = await visit(t, size, seed());
    await page.locator('[data-ed="openSearch"]').waitFor({ timeout: 30000 });
    await openSearch(page);
    await typed(page, 'כימי');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#csText').inputValue(), '', `${size}: cleared`);
    assert.equal(await page.locator('#csText').count(), 1, `${size}: still open`);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#csText').count(), 0, `${size}: closed`);
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.ed), 'openSearch', `${size}: focus on "חיפוש קורס"`);
    assert.equal(await page.locator('.edit-tool').isVisible(), true, `${size}: the sheet is still open (Escape did not take it)`);
  }
});

test('the proposal\'s arrow keys do nothing while the search is open; the proposal is where it was after', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await search(page);
  const label = () => page.locator('.prop-nav').innerText().then(flat);
  const nav = await label();
  await openSearch(page);
  await typed(page, '3000');
  await page.locator('.cs-course button').first().focus();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await page.locator('[data-ed="closeSearch"]').click();
  assert.equal(await label(), nav, 'the same proposal');
});

test('typing while a search finishes keeps the text, the caret and the focus', async (t) => {
  const page = await visit(t, 'desktop', seed());
  const held = holdWorker(page);
  await page.locator('[data-ed="search"]').click();
  await held.reached;
  await openSearch(page);
  await page.locator('#csText').fill('כימיה');
  await page.evaluate(() => document.getElementById('csText').setSelectionRange(2, 2));
  held.release();
  await page.waitForTimeout(1500); // the answer redraws the page under the open search
  const r = await page.evaluate(() => ({ id: document.activeElement?.id, v: document.getElementById('csText')?.value, s: document.getElementById('csText')?.selectionStart }));
  assert.deepEqual(r, { id: 'csText', v: 'כימיה', s: 2 });
  await page.locator('[data-ed="closeSearch"]').click();
  await page.locator('.prop-nav').waitFor({ timeout: 10000 }); // the search had finished: its answer is there under the search
});

test('another program: its courses are read only with their reason; the last choice wins, a failed load says so', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await openSearch(page);
  await typed(page, 'מבוא');
  await page.locator('select[data-ed-s="program"]').selectOption('20');
  await page.locator('.cs-course .cs-meta', { hasText: 'לא בתוכנית שלך' }).first().waitFor({ timeout: 30000 });
  assert.equal(await page.locator('.cs-course [data-ed="csAdd"], .cs-course [data-ed="csSwap"]').count(), 0, 'no button on another program\'s course');
  // back to mine: its own courses return with their buttons
  await page.locator('select[data-ed-s="program"]').selectOption('30');
  await page.locator('.cs-course [data-ed="csAdd"], .cs-course [data-ed="csSwap"]').first().waitFor({ timeout: 30000 });
  // a failed load (a program not loaded yet: the loaded ones are kept for the visit)
  await page.route('**/data/afeka/2027-1/19-2026.json', (r) => r.abort());
  // the summer file of that program does not exist (the frozen copy has none): the "no such semester" answer, not a request the guard would flag
  await page.route('**/data/afeka/2027-3/19-2026.json', (r) => r.fulfill({ status: 404 }));
  await page.locator('select[data-ed-s="program"]').selectOption('19');
  await page.locator('#csCount').filter({ hasText: 'לא הצלחנו לטעון' }).waitFor({ timeout: 30000 });
});

test('the last program chosen wins over an earlier answer that arrives late', async (t) => {
  const page = await visit(t, 'desktop', seed());
  let release;
  const gate = new Promise((r) => (release = r));
  await page.route('**/data/afeka/2027-1/20-2026.json', async (r) => {
    await gate; // the first choice answers last
    await r.continue();
  });
  await openSearch(page);
  await typed(page, 'מבוא');
  await page.locator('select[data-ed-s="program"]').selectOption('20');
  await page.locator('select[data-ed-s="program"]').selectOption('30'); // the second, quick choice: mine
  await page.locator('.cs-course [data-ed="csAdd"], .cs-course [data-ed="csSwap"]').first().waitFor({ timeout: 30000 });
  release();
  await page.waitForTimeout(800);
  assert.equal(await page.locator('.cs-course .cs-meta', { hasText: 'לא בתוכנית שלך' }).count(), 0, 'the late answer did not replace the later choice');
});

test('320px: the search, its chips and a list of results never scroll the page sideways, and every button is 44px', async (t) => {
  const page = await visit(t, { width: 320, height: 640 }, seed());
  await page.locator('[data-ed="openSearch"]').waitFor({ timeout: 30000 });
  await openSearch(page);
  await typed(page, 'מבוא');
  const m = await page.evaluate(() => ({
    over: document.documentElement.scrollWidth - innerWidth,
    small: [...document.querySelectorAll('.edit-tool button, .edit-tool select, .edit-tool input')].filter((e) => e.checkVisibility()).map((e) => [e.tagName + '.' + e.className + ':' + (e.dataset.ed ?? e.dataset.edS ?? e.id), Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)]).filter(([, w, h]) => w < 43.5 || h < 43.5)
  }));
  assert.ok(m.over <= 0, `no sideways scroll (${m.over})`);
  assert.deepEqual(m.small, [], 'every target is 44px');
});

test('an older program\'s load that fails after a newer choice says nothing', async (t) => {
  const page = await visit(t, 'desktop', seed());
  let release;
  const gate = new Promise((r) => (release = r));
  await page.route('**/data/afeka/2027-1/20-2026.json', async (r) => {
    await gate;
    await r.abort(); // the first choice fails, late
  });
  await openSearch(page);
  await typed(page, 'מבוא');
  await page.locator('select[data-ed-s="program"]').selectOption('20');
  await page.locator('select[data-ed-s="program"]').selectOption('30');
  await page.locator('.cs-course [data-ed="csAdd"], .cs-course [data-ed="csSwap"]').first().waitFor({ timeout: 30000 });
  release();
  await page.waitForTimeout(800);
  assert.doesNotMatch(await page.locator('#csCount').innerText(), /לא הצלחנו/, 'the stale failure did not reach the later choice');
});

test('a count that changes is the same live region (updated, not replaced); a focused result button keeps focus when the list is redrawn', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await openSearch(page);
  await typed(page, '3000');
  await page.locator('#csCount').evaluate((e) => (window.__count = e));
  await typed(page, 'כימי');
  assert.equal(await page.evaluate(() => document.getElementById('csCount') === window.__count), true, 'the same element');
  const btn = page.locator('.cs-course button').first();
  await btn.focus();
  const k = await btn.getAttribute('data-k');
  assert.ok(k && k.startsWith('cs-'), 'a stable key');
  await page.evaluate(async () => {
    const e = new Event('input', { bubbles: true });
    document.getElementById('csText').dispatchEvent(e); // the list is drawn again with the same results
  });
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), k, 'focus stayed on that button');
});
