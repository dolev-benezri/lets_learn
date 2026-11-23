// Accessibility of design A's frame and tools (web/ui-shell.js, web/design-a.css) in WebKit: axe on every tool and on the way in, no sideways scroll at
// 320px (the page and the panel's own scroller), touch targets of at least 44px, a visible focus ring, and a landscape phone. Every visit sets
// { design: 'a' }, so CI tests A as written. No top-level await in a spec: node:test then hangs after the run.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
import { SITE, DONE, DESIGN_KEY, TOUR_SEEN, MODE_BUILD, gradeSheetPdf, launch, visit as visitIn } from './helpers.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const WIDTHS = { 320: { width: 320, height: 640 }, 375: { width: 375, height: 812 }, 1280: { width: 1280, height: 800 } };
// While a search runs the board is drawn faded on purpose (style.css .is-busy, opacity .45): axe would read that as low contrast, so the board is idle first
// (a loaded machine kept it busy long enough to flag it once)
const frame = async (page) => {
  await page.waitForFunction(() => document.getElementById('board')?.getAttribute('aria-busy') !== 'true', null, { timeout: 60000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
};
const visit = (t, size, seed, hash, scheme) => visitIn(browser, t, size, seed, hash, scheme, false, false, { design: 'a' });
const TOOLS = [['me', '#me', '#me', 'meTitle'], ['courses', '#courses', '#courses', 'coursesTitle'], ['wishes', '#prefs', '#prefs', 'prefsTitle'],
  ['friends', '#friends', '#friends', 'friendsPageTitle'], ['out', '#out', '#out', 'outTitle']];

// One checker per test: check(page, 'screen') runs axe and remembers the violations; done() fails with the whole list.
function checker(scheme) {
  const found = [];
  return {
    async check(page, screen) {
      await frame(page);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), scheme, 'the site follows the device colour scheme');
      const { violations: all } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      // the one rule left out, only for map nodes (a11y.spec.mjs says why): the label holds the full course name, the screen cuts a long one with "…"
      const violations = all
        .map((v) => (v.id === 'label-content-name-mismatch' ? { ...v, nodes: v.nodes.filter((n) => !n.html.startsWith('<g class="nd')) } : v))
        .filter((v) => v.nodes.length);
      for (const v of violations)
        found.push(`${screen}: ${v.id} (${v.impact}) x${v.nodes.length} ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    },
    note: (text) => found.push(text),
    done: () => assert.deepEqual(found, [], 'violations')
  };
}

// The targets of the frame and the open tool that are under 44px, on the effective clickable surface: a checkbox or radio is its label. A link inside a
// sentence is exempt (its height is the text's); a link that is the whole paragraph is a button in disguise and is not.
const smallTargets = (page) =>
  page.evaluate(() => {
    const sel = 'button, a[href], summary, select, input:not([type=hidden]), [role="button"]';
    const prose = (a) => {
      const c = a.matches('a:not(.btn, .modes a, [class*="tile"])') ? a.closest('p, li, .hint') : null;
      return !!c && c.textContent.replace(a.textContent, '').trim().length > 0;
    };
    const bad = [];
    for (const root of ['.a-top', '.a-bar', '.dock', '#panel', '#pills', '.a-strip', '#semtabs', '#alts', '.edit-card', '.edit-tool']) {
      for (const el of document.querySelector(root)?.querySelectorAll(sel) ?? []) {
        if (!el.checkVisibility() || el.closest('[hidden]') || prose(el)) continue;
        const box = el.matches('input[type=checkbox], input[type=radio]') ? (el.closest('label') ?? el) : el;
        const r = box.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.width < 43.5 || r.height < 43.5)
          bad.push(`${root} <${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + String(el.className).split(' ').slice(0, 2).join('.') : ''}> "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 18)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return bad;
  });
const sideways = (page) =>
  page.evaluate(() => {
    const p = document.getElementById('aPb');
    return { page: document.documentElement.scrollWidth <= innerWidth, panel: p.scrollWidth <= p.clientWidth };
  });
const layoutOk = async (page, label, touch, note) => {
  const s = await sideways(page);
  if (!s.page || !s.panel) note(`${label}: scrolls sideways (page ${s.page}, panel ${s.panel})`);
  if (touch) for (const b of await smallTargets(page)) note(`${label}: ${b}`);
};

for (const [w, size] of Object.entries(WIDTHS))
  for (const scheme of ['light', 'dark']) {
    test(`${w}/${scheme}: the way in (terms gate, track, year, the record's entry screen): axe, no sideways scroll, targets`, async (t) => {
      const { check, done, note } = checker(scheme);
      const touch = w !== '1280';
      const page = await visit(t, size, null, '', scheme);
      await page.locator('#panel #me .gate').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => (document.getElementById('meTitle').focus(), document.activeElement.id)), 'meTitle', 'the gate heading takes focus');
      await check(page, 'gate');
      await layoutOk(page, 'gate', touch, note);
      await page.locator('[data-k="termsTick"]').check();
      await page.locator('[data-act="acceptTerms"]').click();
      await page.locator('[data-act="pickTrack"]').first().waitFor();
      await check(page, 'track');
      await layoutOk(page, 'track', touch, note);
      await page.locator('[data-act="pickTrack"][value="30"]').click();
      await page.locator('[data-act="pickYear"]').first().waitFor();
      await check(page, 'year');
      await layoutOk(page, 'year', touch, note);
      await page.locator('[data-act="pickYear"][value="2"]').click();
      const manual = page.getByRole('button', { name: 'הזנה ידנית' });
      await manual.waitFor();
      await check(page, 'entry');
      await layoutOk(page, 'entry', touch, note);
      await manual.click();
      await page.locator('#panel .crs').first().waitFor();
      await check(page, 'record');
      await layoutOk(page, 'record', touch, note);
      done();
    });

    test(`${w}/${scheme}: the tools: axe, no sideways scroll, targets, a focusable heading, no step lines or "next" feet`, async (t) => {
      const { check, done, note } = checker(scheme);
      const page = await visit(t, size, DONE, '', scheme);
      await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
      await check(page, 'board');
      await layoutOk(page, 'board', w !== '1280', note);
      for (const [tool, h, id, title] of TOOLS) {
        await page.evaluate((x) => (location.hash = x), h);
        await page.locator(`#panel ${id}`).waitFor({ state: 'visible' });
        await check(page, tool);
        await layoutOk(page, tool, w !== '1280', note);
        if ((await page.evaluate((x) => (document.getElementById(x).focus(), document.activeElement.id), title)) !== title) note(`${tool}: the heading ${title} cannot take focus`);
        const steps = await page.evaluate(() => [...document.querySelectorAll('#panel .me-step, #panel .me-foot')].filter((e) => e.checkVisibility()).length);
        if (steps) note(`${tool}: ${steps} step line or "next" foot is shown in the panel`);
      }
      done();
    });
  }

for (const scheme of ['light', 'dark'])
  test(`${scheme}: the Tab walk through the frame and an open tool: every stop shows a focus ring`, async (t) => {
    const page = await visit(t, 'phone', DONE, '#courses', scheme);
    await page.locator('#panel #courses').waitFor({ state: 'visible' });
    // an address with a fragment starts Tab at that element: start at the first stop of the page instead
    await page.evaluate(() => document.querySelector('.skip').focus());
    const bad = [],
      seen = { stops: 0, dock: 0, panel: 0, frame: 0 };
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const s = await page.evaluate(() => {
        const el = document.activeElement;
        if (el === document.body) return null;
        const ring = (e) => e && getComputedStyle(e).outlineStyle !== 'none' && parseFloat(getComputedStyle(e).outlineWidth) >= 2;
        // a segmented radio is a hidden input: the painted ring is on its label or the span beside it
        return { id: `${el.tagName.toLowerCase()}#${el.id}.${String(el.className).split(' ')[0]}`, dock: !!el.closest('.dock'), panel: !!el.closest('#panel'),
          frame: !!el.closest('.a-top'), ring: ring(el) || ring(el.nextElementSibling) || ring(el.closest('label')) };
      });
      if (!s) break;
      seen.stops++;
      seen.dock += s.dock;
      seen.panel += s.panel;
      seen.frame += s.frame;
      if (!s.ring) bad.push(`${s.id}: no focus ring`);
    }
    assert.ok(seen.stops >= 12 && seen.dock >= 3 && seen.panel >= 3 && seen.frame >= 2, `the walk covers the frame, the dock and the tool: ${JSON.stringify(seen)}`);
    assert.deepEqual([...new Set(bad)], []);
  });

// a landscape phone is 375px tall: touch is on (the helper turns it on only below 600px wide), the dock is a rail on the inline-start (right, RTL) edge
for (const scheme of ['light', 'dark'])
  test(`landscape phone, ${scheme}: the rail holds five targets on the right, the tool beside it, nothing scrolls sideways, axe is clean`, async (t) => {
    const context = await browser.newContext({ viewport: { width: 667, height: 375 }, isMobile: true, hasTouch: true, locale: 'he-IL', colorScheme: scheme });
    const page = await context.newPage();
    await context.addInitScript((items) => {
      for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v);
    }, { ...DONE, ...TOUR_SEEN, ...MODE_BUILD, [DESIGN_KEY]: 'a' });
    t.after(() => context.close());
    await page.goto(SITE + '#courses');
    await page.locator('#panel #courses').waitFor({ state: 'visible' });
    const { check, done, note } = checker(scheme);
    const m = await page.evaluate(() => {
      const box = (el) => el.getBoundingClientRect();
      const dock = box(document.querySelector('.dock')), panel = box(document.getElementById('panel'));
      return { coarse: matchMedia('(pointer: coarse)').matches, dock: [dock.left, dock.right], panel: [panel.left, panel.right], iw: innerWidth,
        buttons: [...document.querySelectorAll('.dock .dk:not([hidden])')].map((b) => [Math.round(box(b).width), Math.round(box(b).height), Math.round(box(b).bottom)]) };
    });
    assert.equal(m.coarse, true, 'the touch emulation is on');
    assert.ok(m.dock[1] >= m.iw - 1, `the rail is on the right edge: ${m.dock}`);
    assert.ok(m.panel[1] <= m.dock[0] + 1, `the tool sits beside the rail, not over it: panel ${m.panel}, rail ${m.dock}`);
    assert.equal(m.buttons.length, 5);
    for (const [bw, bh, bottom] of m.buttons) assert.ok(bw >= 43.5 && bh >= 43.5 && bottom <= 376, `a rail button is a target on screen: ${bw}x${bh} bottom ${bottom}`);
    await layoutOk(page, 'landscape', true, note);
    await check(page, 'landscape');
    done();
  });

test('the edit page keeps its own feet: the panel rules do not hide "הבא: שינויים"', async (t) => {
  const page = await visit(t, 'phone', { ...DONE, 'afeka-sched-v1-edit': JSON.stringify(EDIT_STATE) }, '#edit', 'light');
  await page.locator('#edit').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#edit [data-ed="next"]').isVisible(), true, 'the way on is in the section');
  assert.equal(await page.locator('#edit .me-foot').count(), 0, 'no footer bar under A');
});

// Improve mode (stage 1): the edit page in the frame, both screens, at the three widths, in both colour schemes.
const EDIT_STATE = {
  v: 1, dataset: { year: 2027, sem: 'א', program: 30, startYear: 2026 }, registered: false, owned: [], movable: ['30003'], goal: { dayOff: 4 },
  original: [
    { course: '30003', name: 'מבוא לכימיה', type: 'סופי-הרצאה+תרגול', group: '273000302', day: 4, start: '14:00', end: '15:50' },
    { course: '30112', name: 'תרמודינמיקה 1', type: 'סופי-הרצאה+תרגול', group: '273011204', day: 3, start: '15:00', end: '16:50' }
  ]
};
EDIT_STATE.baseline = EDIT_STATE.original;
for (const scheme of ['light', 'dark'])
  test(`${scheme}: the edit page in the frame (both screens) at 320, 375 and 1280: axe, no sideways scroll, the tabs and the menu are targets`, async (t) => {
    const { check, done, note } = checker(scheme);
    const seed = { ...DONE, 'afeka-sched-v1-edit': JSON.stringify(EDIT_STATE) };
    for (const [w, size] of Object.entries(WIDTHS)) {
      const page = await visit(t, size, seed, '#edit', scheme);
      await page.locator('#edit [data-ed="next"]').waitFor({ timeout: 30000 });
      await check(page, `${w} edit step 1`);
      if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) note(`${w} edit step 1: scrolls sideways`);
      if (w !== '1280') for (const b of await smallTargets(page)) note(`${w} edit step 1: ${b}`);
      await page.locator('[data-ed="next"]').click();
      await page.locator('[data-ed="search"]').waitFor({ timeout: 30000 });
      await check(page, `${w} edit step 2`);
      if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) note(`${w} edit step 2: scrolls sideways`);
    }
    done();
  });

// The dialogs of design A and the legal page: the lesson popover, the ☰ menu, the information panel, the erase confirmation, the map, the text dialog,
// the friend editor, and legal.html: axe at three widths in both colour schemes, and nothing scrolls sideways.
for (const scheme of ['light', 'dark'])
  test(`${scheme}: the dialogs and the legal page at 320, 375 and 1280: axe, no sideways scroll`, async (t) => {
    const { check, done, note } = checker(scheme);
    // the page, and the open dialog or popover with the scrollers inside it (a cut-off label, overflow:hidden, is not a scroller)
    const fits = async (page, label) => {
      const bad = await page.evaluate(() => {
        const out = [];
        if (document.documentElement.scrollWidth > innerWidth) out.push('the page');
        const open = [...document.querySelectorAll('dialog[open], :popover-open')].at(-1);
        if (open) {
          const r = open.getBoundingClientRect();
          if (r.left < -0.5 || r.right > innerWidth + 0.5) out.push(`the dialog is off screen (${Math.round(r.left)}..${Math.round(r.right)})`);
          for (const e of [open, ...open.querySelectorAll('*')]) if (e.scrollWidth > e.clientWidth + 1 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowX) && e.clientWidth > 0 && !e.closest('svg')) out.push(`${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} scrolls sideways`);
        }
        return out;
      });
      for (const b of bad) note(`${label}: ${b}`);
    };
    for (const [w, size] of Object.entries(WIDTHS)) {
      const page = await visit(t, size, DONE, '', scheme);
      await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
      await page.locator('#week .blk').first().click();
      await page.locator('#pop:popover-open').waitFor();
      await check(page, `${w} lesson popover`);
      await fits(page, `${w} lesson popover`);
      await page.keyboard.press('Escape');
      await page.locator('#pop:popover-open').waitFor({ state: 'detached' });
      await page.locator('.menu-btn').click();
      await page.locator('#drawer[open]').waitFor();
      await check(page, `${w} menu`);
      await fits(page, `${w} menu`);
      await page.locator('#drawer [data-act="panel"][data-panel="info"]').click();
      await page.locator('#drawer .info-sec').first().waitFor();
      await check(page, `${w} information`);
      await fits(page, `${w} information`);
      await page.locator('#drawer [data-act="menu"]').click();
      await page.locator('#drawer .a-menu').waitFor();
      await page.locator('#drawer [data-act="eraseAll"]').click();
      const ask = page.locator('dialog[open]').last();
      await ask.getByRole('button', { name: 'ביטול' }).waitFor();
      await check(page, `${w} confirm`);
      await fits(page, `${w} confirm`);
      await ask.getByRole('button', { name: 'ביטול' }).click();
      await page.locator('#drawer [data-act="openMap"]').click();
      await page.locator('#pmap .pm-svg.ready').waitFor({ timeout: 30000 });
      await check(page, `${w} map`);
      await fits(page, `${w} map`);
      await page.keyboard.press('Escape');
      await page.locator('#pmap[open]').waitFor({ state: 'detached' });
      await page.keyboard.press('Escape');
      await page.locator('#drawer[open]').waitFor({ state: 'detached' });
      // the grade-sheet review: a table of rows to confirm, from a synthetic sheet
      await page.evaluate(() => (location.hash = '#me'));
      await page.locator('#gradeFile').waitFor({ state: 'attached' });
      await page.locator('#gradeFile').setInputFiles({ name: 'sheet.pdf', mimeType: 'application/pdf', buffer: gradeSheetPdf(['10016 Calculus 4.0 85', '30135 Statics 3.0 Pass']) });
      await page.locator('dialog.dlg-rows[open]').waitFor({ timeout: 30000 });
      await check(page, `${w} grade review`);
      await fits(page, `${w} grade review`);
      await page.keyboard.press('Escape');
      await page.locator('dialog.dlg-rows[open]').waitFor({ state: 'detached' });
      await page.evaluate(() => (location.hash = '#out'));
      await page.locator('#out [data-act="copyReg"]').waitFor();
      await page.locator('#out [data-act="copyReg"]').click(); // the clipboard is stubbed to refuse: the text comes up as a dialog
      await page.locator('dialog[open] textarea').waitFor();
      await check(page, `${w} text dialog`);
      await fits(page, `${w} text dialog`);
      await page.locator('dialog[open]').getByRole('button', { name: 'סגור' }).click();
      await page.evaluate(() => (location.hash = '#friends'));
      await page.locator('#openFriendEditor').click();
      await page.locator('#friendEd[open]').waitFor();
      await check(page, `${w} friend editor`);
      await fits(page, `${w} friend editor`);
      await page.keyboard.press('Escape');
      await page.locator('#friendEd[open]').waitFor({ state: 'detached' });
      await page.goto(SITE + 'legal.html#terms');
      await page.locator('h1').waitFor();
      await check(page, `${w} legal page`);
      await fits(page, `${w} legal page`);
    }
    done();
  });

// phase 1 task 5: the alternatives column folded (the rail) and open, at 1440 (1280 skips the target scan, the other widths hide the column)
const railTargets = async (page, label, note) => {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('#alts button')].filter((b) => b.checkVisibility()).map((b) => [b.dataset.k, b.getBoundingClientRect()]).filter(([, r]) => r.width < 43.5 || r.height < 43.5).map(([k, r]) => `${k} ${Math.round(r.width)}x${Math.round(r.height)}`)
  );
  for (const x of small) note(`${label}: a target under 44px: ${x}`);
};
for (const scheme of ['light', 'dark'])
  test(`1440/${scheme}: the alternatives rail and the open column: axe, targets`, async (t) => {
    const { check, done, note } = checker(scheme);
    const page = await visit(t, { width: 1440, height: 900 }, DONE, '', scheme);
    await page.locator('#alts .rail-n').first().waitFor({ state: 'visible', timeout: 30000 });
    await check(page, 'rail');
    await layoutOk(page, 'rail', false, note);
    await railTargets(page, 'rail', note);
    await page.locator('#alts [data-k="alts-fold"]').click();
    await page.locator('#alts .alt-card').first().waitFor({ state: 'visible' });
    await check(page, 'open column');
    await layoutOk(page, 'open column', false, note);
    await railTargets(page, 'open column', note);
    done();
  });

// below 1440px the open column is an overlay over the week (fixed, above the board): axe, and its 44px targets
for (const scheme of ['light', 'dark'])
  test(`1280/${scheme}: the alternatives column open over the week: axe, targets`, async (t) => {
    const { check, done, note } = checker(scheme);
    const page = await visit(t, { width: 1280, height: 800 }, DONE, '', scheme);
    await page.locator('#alts .rail-n').first().waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('#alts [data-k="alts-fold"]').click();
    await page.locator('#alts .alt-card').first().waitFor({ state: 'visible' });
    await check(page, 'overlay');
    await railTargets(page, 'overlay', note);
    done();
  });

// phase 2, Task B: the empty improve page is one centred card: axe, no sideways scroll, 44px targets, at the three widths in both colour schemes
for (const scheme of ['light', 'dark'])
  test(`${scheme}: the empty improve page (one card) at 320, 375 and 1280: axe, no sideways scroll, targets`, async (t) => {
    const { check, done, note } = checker(scheme);
    for (const [w, size] of Object.entries(WIDTHS)) {
      const page = await visit(t, size, DONE, '#edit', scheme);
      await page.locator('#edit .edit-card').waitFor({ state: 'visible', timeout: 30000 });
      await check(page, `${w} empty card`);
      if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) note(`${w} empty card: scrolls sideways`);
      if (w !== '1280') for (const b of await smallTargets(page)) note(`${w} empty card: ${b}`);
    }
    done();
  });

// phase 2, Task D: the record in the tool column's slot (with "חזרה") at 1280 and the sheet on a phone: axe, targets
for (const scheme of ['light', 'dark'])
  test(`${scheme}: the record over the improve page (a column at 1280, a sheet at 375): axe, targets`, async (t) => {
    const { check, done, note } = checker(scheme);
    const seed = { ...DONE, 'afeka-sched-v1-edit': JSON.stringify(EDIT_STATE) };
    for (const [w, size] of [['1280', WIDTHS['1280']], ['375', WIDTHS['375']]]) {
      const page = await visit(t, size, seed, '#edit', scheme);
      await page.locator('.dock [data-tool="me"]').waitFor({ timeout: 30000 });
      await page.locator('.dock [data-tool="me"]').click();
      await page.locator('#panel #me').waitFor({ state: 'visible' });
      await page.waitForTimeout(400);
      await check(page, `${w} record`);
      if (w !== '1280') for (const b of await smallTargets(page)) note(`${w} record: ${b}`);
    }
    done();
  });

// phase 2, Task E: a proposal with "עוד" open: axe and 44px targets in the tool, at 320, 375 and 1280, both colour schemes
for (const scheme of ['light', 'dark'])
  test(`${scheme}: the proposal and its open "עוד" (improve mode) at 320, 375 and 1280: axe, no sideways scroll, targets`, async (t) => {
    const { check, done, note } = checker(scheme);
    const seed = { ...DONE, 'afeka-sched-v1-edit': JSON.stringify(EDIT_STATE) };
    for (const [w, size] of Object.entries(WIDTHS)) {
      const page = await visit(t, size, seed, '#edit/changes', scheme);
      await page.locator('[data-ed="search"]').waitFor({ timeout: 30000 });
      await page.locator('[data-ed="search"]').click();
      await page.locator('.prop-nav').waitFor({ timeout: 30000 });
      await check(page, `${w} proposal`);
      await page.locator('[data-ed="more"]').click();
      await check(page, `${w} "עוד" open`);
      if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) note(`${w} proposal: scrolls sideways`);
      if (w !== '1280') for (const b of await smallTargets(page)) note(`${w} proposal: ${b}`);
    }
    done();
  });

// phase 2, Task F: the open course search with results (and another program's, read only) at 320, 375 and 1280, both colour schemes: axe, targets
for (const scheme of ['light', 'dark'])
  test(`${scheme}: the course search with results at 320, 375 and 1280: axe, no sideways scroll, targets`, async (t) => {
    const { check, done, note } = checker(scheme);
    const seed = { ...DONE, 'afeka-sched-v1-edit': JSON.stringify(EDIT_STATE) };
    for (const [w, size] of Object.entries(WIDTHS)) {
      const page = await visit(t, size, seed, '#edit/changes', scheme);
      await page.locator('[data-ed="openSearch"]').waitFor({ timeout: 30000 });
      await page.locator('[data-ed="openSearch"]').click();
      await check(page, `${w} search, nothing asked`);
      await page.locator('#csText').fill('מבוא');
      await page.locator('.cs-course').first().waitFor({ timeout: 30000 });
      await check(page, `${w} search results`);
      if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) note(`${w} search: scrolls sideways`);
      if (w !== '1280') for (const b of await smallTargets(page)) note(`${w} search: ${b}`);
      await page.locator('select[data-ed-s="program"]').selectOption('20');
      await page.locator('.cs-course .cs-meta', { hasText: 'לא בתוכנית שלך' }).first().waitFor({ timeout: 30000 });
      await check(page, `${w} search, another program`);
    }
    done();
  });
