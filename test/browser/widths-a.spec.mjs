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
      if (w < 1280) {
        const cols = await page.evaluate(() => [document.getElementById('panel').getBoundingClientRect().width, document.getElementById('alts').getBoundingClientRect().width]);
        assert.deepEqual(cols.map(Math.round), [360, 64], 'the 1080-1279 columns: the tool 360, the alternatives folded to a 64px rail');
        await page.locator('#alts [data-k="alts-fold"]').click();
        await page.locator('#alts .alt-card').first().waitFor({ state: 'visible' });
        const open = await page.evaluate(() => [document.getElementById('panel').getBoundingClientRect().width, document.getElementById('alts').getBoundingClientRect().width]);
        assert.deepEqual(open.map(Math.round), [360, 240], 'opened: the 240px column of before');
      }
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

// ---- phase 1 task 2: the frame (docs/superpowers/plans/2026-11-22-design-a-system.md): the build content is at most 1680px and centred, improve 1200px ----
const frame = (page) =>
  page.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect();
    const panel = r('#panel'), alts = r('#alts'), brand = r('.a-brand'), top = r('.a-top'), strip = r('.a-strip');
    return {
      panelRight: panel.right, panelW: panel.width, altsLeft: alts.left, altsW: alts.width, brandRight: brand.right,
      topW: top.width, stripW: strip.width, fits: document.documentElement.scrollWidth <= innerWidth,
      cw: document.documentElement.clientWidth // the usable width: a classic vertical scrollbar takes its share of the window, percentages resolve against what is left
    };
  });
for (const w of [1440, 1679, 1680, 1700, 1920])
  test(`${w}px: the build frame is at most 1680px and centred, the columns keep their widths`, async (t) => {
    const page = await visit(t, { width: w, height: 900 }, DONE, '#courses');
    await page.locator('#panel #courses').waitFor({ state: 'visible' });
    await settle(page);
    const m = await frame(page);
    const side = Math.max(0, (m.cw - 1680) / 2);
    assert.ok(m.fits, 'no sideways scroll');
    assert.ok(Math.abs(m.altsLeft - side) <= 1, `alternatives on the frame's left edge: ${JSON.stringify(m)}`);
    assert.ok(Math.abs(m.cw - m.panelRight - side) <= 1, `tool column on the frame's right edge: ${JSON.stringify(m)}`);
    assert.equal(Math.round(m.panelW), 400, 'tool column 400px');
    assert.equal(Math.round(m.altsW), 64, 'the alternatives start as the 64px rail');
    await page.locator('#alts [data-k="alts-fold"]').click();
    await page.locator('#alts .alt-card').first().waitFor({ state: 'visible' });
    const wide = await frame(page);
    assert.equal(Math.round(wide.altsW), 280, 'opened: the 280px column');
    assert.ok(Math.abs(wide.altsLeft - side) <= 1 && Math.abs(m.cw - wide.panelRight - side) <= 1, `the frame's edges do not move when it opens: ${JSON.stringify(wide)}`);
    assert.ok(Math.abs(m.topW - m.cw) <= 1 && Math.abs(m.stripW - m.cw) <= 1, 'header and strip backgrounds span the window');
    const stripPad = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.a-strip')).paddingInlineStart));
    assert.ok(Math.abs(stripPad - Math.max(12, side)) <= 1, `the strip's content lines up with the frame: ${stripPad}`);
    assert.ok(m.brandRight <= m.panelRight + 1 && m.brandRight >= m.panelRight - 48, 'the title lines up with the tool column');
    // a little: the tool column sticks only while the board beside it is taller than the column (the declutter made the board shorter)
    await page.evaluate(() => scrollTo(0, 100));
    const after = await page.evaluate(() => [document.querySelector('.a-top').getBoundingClientRect().top,
      document.querySelector('#panel').getBoundingClientRect().top, document.querySelector('.dock').getBoundingClientRect().bottom]);
    assert.equal(Math.round(after[0]), 0, 'the header stays at the top');
    assert.ok(after[1] >= after[2] - 1, `the tool column never slides under the dock: ${after}`);
  });

// the record of edit-a.spec.mjs (its BASE lessons and state())
const L = (course, name, type, group, day, start, end) => ({ course, name, type, group, day, start, end });
const BASE = [
  L('30003', 'מבוא לכימיה', 'סופי-הרצאה+תרגול', '273000302', 4, '14:00', '15:50'), L('30003', 'מבוא לכימיה', 'תרגול', '273000302/1', 4, '16:00', '16:50'),
  L('30112', 'תרמודינמיקה 1', 'סופי-הרצאה+תרגול', '273011204', 3, '15:00', '16:50'), L('30112', 'תרמודינמיקה 1', 'תרגול', '273011204/1', 3, '17:00', '17:50')
];
const EDIT = {
  ...DONE,
  'afeka-sched-v1-edit': JSON.stringify({ v: 1, dataset: { year: 2027, sem: 'א', program: 30, startYear: 2026 }, registered: false, owned: [], original: BASE, baseline: BASE, movable: ['30003'], goal: { dayOff: 4 } })
};
for (const w of [1440, 1920])
  test(`${w}px improve mode: the content and the record sit in the 1200px frame, the record not over the week`, async (t) => {
    const page = await visit(t, { width: w, height: 900 }, EDIT, '#edit');
    await page.locator('#edit .edit-board').waitFor({ state: 'visible' });
    await page.locator('.dock [data-tool="me"]').click();
    await page.locator('#panel #me').waitFor({ state: 'visible' });
    const m = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      return { week: r('#edit .edit-board'), panel: r('#panel'), cw: document.documentElement.clientWidth };
    });
    const side = (m.cw - 1200) / 2;
    assert.ok(m.week.left >= side - 1, `the improve content starts at the frame's left edge or after: ${JSON.stringify(m)}`);
    assert.ok(Math.abs(m.panel.right - (m.cw - side - 20)) <= 1.5, `the record sits in the tool column's slot, the frame's right edge less the page's 20px: ${JSON.stringify(m)}`);
    assert.ok(m.panel.left >= m.week.right - 1, `the record covers no part of the week: ${JSON.stringify(m)}`);
  });

// owner-12: the page is no taller than the board and the dock. A tool's visually hidden inputs (position:absolute) once escaped its scroll and stretched the
// document far below the board, into empty grey, under the sticky column from 1080px; the strip's own height then left the page 31px longer than the window.
// Each tool in turn, at the three sizes the owner and the phones use: from 1080px the document is exactly the board or the window, whichever is taller (no
// slack); a phone adds the room its fixed dock takes.
for (const [w, h] of [[1920, 1080], [1280, 800], [375, 812]])
  test(`${w}px: the page is no taller than the board (or the window) and the dock room, whichever tool is open`, async (t) => {
    const page = await visit(t, { width: w, height: h }, DONE, '#courses');
    await page.locator('#panel #courses').waitFor({ state: 'visible' });
    await settle(page);
    for (const tool of ['courses', 'me', 'prefs', 'friends', 'out']) {
      await page.evaluate((id) => (location.hash = `#${id}`), tool);
      await page.locator(`#panel #${tool}`).waitFor({ state: 'visible' });
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => ({
        doc: document.documentElement.scrollHeight,
        // from 1080px the content is the board (the sticky column is sized to the window); on a phone the shell, whose sheet is fixed
        shell: Math.round(document.getElementById(innerWidth >= 1080 ? 'aBoard' : 'ashell').getBoundingClientRect().bottom + scrollY),
        room: Math.round(parseFloat(getComputedStyle(document.body).paddingBottom)), // what the page keeps for a fixed dock (a phone's), none beside the board
        inner: innerHeight
      }));
      assert.ok(m.doc <= Math.max(m.shell + m.room, m.inner), `${tool}: the document is ${m.doc}px, the board ends at ${m.shell}px (dock room ${m.room}px, window ${m.inner}px)`);
    }
  });

// phase 2, Task A: improve mode's tabs are a segmented control centred over the content, 44px segments, only the screen shown pressed (the record included);
// the tool column and the week are a surface each; everything inside the 1200px frame
for (const w of [1920, 1280])
  test(`${w}px improve mode: centred segmented tabs narrower than the frame, one pressed at a time, the tool and the week one surface each`, async (t) => {
    const page = await visit(t, { width: w, height: 900 }, EDIT, '#edit/changes');
    await page.locator('#edit .edit-board.has-week').waitFor({ state: 'visible' });
    const pressed = () => page.evaluate(() => [...document.querySelectorAll('.dock .dk[aria-pressed="true"]')].map((b) => b.dataset.tool));
    const m = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect(), cw = document.documentElement.clientWidth, bg = (s) => getComputedStyle(document.querySelector(s));
      return {
        cw, tabs: r('.dock'), tool: r('.edit-tool'), board: r('.edit-board'), seg: [...document.querySelectorAll('.dock .dk:not([hidden])')].map((b) => b.getBoundingClientRect().height),
        toolBg: bg('.edit-tool').backgroundColor, boardBg: bg('.edit-board').backgroundColor, toolR: bg('.edit-tool').borderTopLeftRadius, surface: bg('.a-top').backgroundColor
      };
    });
    const left = Math.max(0, (m.cw - 1200) / 2), right = m.cw - left;
    assert.ok(Math.abs((m.tabs.left + m.tabs.right) / 2 - m.cw / 2) <= 1.5, `the tabs are centred: ${JSON.stringify(m.tabs)}`);
    assert.ok(m.tabs.width <= 481 && m.tabs.width < right - left, `the tabs are narrower than the frame: ${m.tabs.width}`);
    assert.ok(m.tool.left >= left - 1 && m.board.right <= right + 1 && m.tool.right <= right + 1 && m.board.left >= left - 1, `content inside the frame: ${JSON.stringify({ left, right })}`);
    assert.equal(m.seg.length, 3);
    assert.ok(m.seg.every((h) => h >= 43.5), `44px segments: ${m.seg}`);
    assert.ok(m.toolBg !== 'rgba(0, 0, 0, 0)' && m.boardBg !== 'rgba(0, 0, 0, 0)' && parseFloat(m.toolR) >= 12, `a surface each: ${m.toolBg} ${m.boardBg} ${m.toolR}`);
    assert.deepEqual(await pressed(), ['changes'], 'one pressed: the screen shown');
    await page.locator('.dock [data-tool="me"]').click();
    await page.locator('#panel #me').waitFor({ state: 'visible' });
    assert.deepEqual(await pressed(), ['me'], 'with the record open only its tab is pressed');
    await page.locator('.dock [data-tool="me"]').click();
    await page.waitForFunction(() => document.getElementById('panel').hidden);
    assert.deepEqual(await pressed(), ['changes'], 'and the screen again when it closes');
  });

// phase 2, Task D: with the record open over a short improve board the document is exactly the window (the sticky record is sized for it), and the improve
// terms gate, which opens the same panel, sits in the slot too
for (const [w, h] of [[1920, 1080], [1280, 800]])
  test(`${w}px improve mode: with the record open the page is no taller than the board or the window`, async (t) => {
    const page = await visit(t, { width: w, height: h }, EDIT, '#edit');
    await page.locator('#edit .edit-board').waitFor({ state: 'visible' });
    await page.locator('.dock [data-tool="me"]').click();
    await page.locator('#panel #me').waitFor({ state: 'visible' });
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => ({
      doc: document.documentElement.scrollHeight, board: Math.round(document.getElementById('aBoard').getBoundingClientRect().bottom + scrollY), inner: innerHeight,
      record: document.querySelector('.a-stage').classList.contains('record-open')
    }));
    assert.equal(m.record, true);
    assert.ok(m.doc <= Math.max(m.board, m.inner), `the document is ${m.doc}px, the board ends at ${m.board}px, the window is ${m.inner}px`);
  });

// The page is never taller than the window when its content is: the tool column's room is what is left of the window where it rests (below the tabs
// and the board's padding), whatever the tool holds (the course search with a long list), and the heights the layout stands on are measured, so a font that
// makes the top bar, the strip or the tabs taller than their CSS minimums (CI's) does not make the page grow either.
for (const [w, h] of [[1920, 1080], [1280, 800]])
  test(`${w}px improve mode: with the course search open and a long list the page is no taller than the window`, async (t) => {
    const page = await visit(t, { width: w, height: h }, EDIT, '#edit/changes');
    await page.locator('[data-k="csOpen"]').click();
    await page.locator('#csText').fill('חשבון');
    await page.locator('#csResults .cs-course').nth(1).waitFor({ timeout: 30000 });
    await page.waitForTimeout(300);
    const m = await page.evaluate(() => ({
      doc: document.documentElement.scrollHeight, board: Math.round(document.getElementById('aBoard').getBoundingClientRect().bottom + scrollY), inner: innerHeight,
      list: document.querySelector('.edit-tool-in').scrollHeight, tool: document.querySelector('.edit-tool').clientHeight
    }));
    assert.ok(m.list > m.tool, `the list (${m.list}px) is longer than the column (${m.tool}px), so the column scrolls inside`);
    // the week is short, and the tool is inside the board: the document must be the window, not the board that grew with the tool
    assert.ok(m.doc <= m.inner, `the document is ${m.doc}px, the window is ${m.inner}px`);
  });

for (const [w, h] of [[1920, 1080], [1280, 800]])
  for (const [what, hash, open] of [['the record', '#edit', true], ['the course search', '#edit/changes', false]])
    test(`${w}px improve mode, bars taller than their CSS minimums: ${what} open, the page still is no taller than the window`, async (t) => {
      const page = await visit(t, { width: w, height: h }, EDIT, hash);
      await page.locator('#edit .edit-board').waitFor({ state: 'visible' });
      await page.addStyleTag({ content: '.a-top{min-height:63px !important} .a-stage > .dock{padding-block:4px !important} #aStrip{padding-block:2px !important}' });
      if (open) {
        await page.locator('.dock [data-tool="me"]').click();
        await page.locator('#panel #me').waitFor({ state: 'visible' });
      } else {
        await page.locator('[data-k="csOpen"]').click();
        await page.locator('#csText').fill('חשבון');
        await page.locator('#csResults .cs-course').nth(1).waitFor({ timeout: 30000 });
      }
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => ({
        doc: document.documentElement.scrollHeight, board: Math.round(document.getElementById('aBoard').getBoundingClientRect().bottom + scrollY), inner: innerHeight,
        bar: Math.round(document.querySelector('.a-top').getBoundingClientRect().height)
      }));
      assert.equal(m.bar, 63, 'the taller bar is in effect');
      assert.ok(m.doc <= m.inner, `the document is ${m.doc}px, the window is ${m.inner}px`);
    });

// an open proposal (a course added from the search, then "חפש הצעות"): the week may be taller than the window (its range grew to the new lesson's hour), and
// then the page is exactly as tall as the week (a phone: plus the room for the dock), never taller; the tool column and the sheet never add height of their own
for (const [w, h] of [[1920, 1080], [1280, 800], [375, 812]])
  test(`${w}px improve mode: with a proposal open the page is as tall as the week and no taller`, async (t) => {
    const page = await visit(t, { width: w, height: h }, EDIT, '#edit/changes');
    await page.locator('[data-k="csOpen"]').click();
    await page.locator('#csText').fill('אנליזה');
    await page.locator('.cs-opt', { has: page.locator('.tag', { hasText: 'נכנס' }) }).locator('[data-ed="csAdd"]').first().click();
    await page.locator('[data-ed="search"]').click();
    await page.locator('.prop-nav').waitFor({ timeout: 60000 });
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => ({
      doc: document.documentElement.scrollHeight, inner: innerHeight, board: Math.round(document.getElementById('aBoard').getBoundingClientRect().bottom + scrollY),
      dock: Math.round(document.querySelector('.dock').getBoundingClientRect().height), phone: matchMedia('(max-width: 1079px)').matches
    }));
    const room = m.phone ? m.dock + 12 : 0;
    assert.ok(m.doc <= Math.max(m.board + room, m.inner), `the document is ${m.doc}px, the week ends at ${m.board}px (+${room} for the dock), the window is ${m.inner}px`);
  });

test('1280px improve mode, a fresh visitor: the terms are one card over the whole screen (no panel, no board behind it) and the page is no taller than the window', async (t) => {
  const page = await visit(t, { width: 1280, height: 800 }, {}, '#edit');
  await page.locator('#firstRun [data-k="frTerms"]').waitFor({ state: 'visible', timeout: 30000 });
  const m = await page.evaluate(() => ({
    card: document.querySelector('.a-fr-card').getBoundingClientRect().toJSON(), panel: document.getElementById('panel').checkVisibility(), stage: document.querySelector('.a-stage').checkVisibility(),
    doc: document.documentElement.scrollHeight, inner: innerHeight
  }));
  assert.equal(m.panel, false, 'the record panel is not drawn');
  assert.equal(m.stage, false, 'nor is the board');
  assert.ok(m.card.top >= 0 && m.card.bottom <= m.inner, `the card is inside the window (${m.card.top}..${m.card.bottom} of ${m.inner})`);
  assert.ok(m.doc <= m.inner + 1, `no growth: ${m.doc} in a ${m.inner}px window`);
});
