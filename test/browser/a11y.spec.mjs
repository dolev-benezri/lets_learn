// Accessibility in WebKit: axe-core (WCAG 2.0/2.1 A and AA) on every screen and dialog, phone and desktop, light and dark, plus the checks axe cannot make
// (reflow at 320px, a visible focus ring, accessible names). Run through `npm run test:browser`. Student and seeding: helpers.mjs.
// The first-visit tour is marked seen for these specs (helpers.mjs); the tour test below shows it on purpose.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { webkit } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { SITE, SIZES, STUDENT, DONE, gradeSheetPdf, visit as visitIn } from './helpers.mjs';
import { TOUR_INTRO, TOUR_PLANS } from '../../web/tour.js';

let browser;
before(async () => { browser = await webkit.launch(); });
after(async () => { await browser?.close(); });

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const weekReady = (page) => page.locator('#week .blk').first().waitFor({ timeout: 30000 });
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

// One checker per test: check(page, 'screen name') runs axe and remembers the violations; done() fails with the whole list.
function checker(scheme) {
  const found = [];
  return {
    async check(page, screen) {
      await frame(page);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), scheme, 'the site follows the device colour scheme');
      const { violations: all } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      // The one rule left out, and only for map nodes (g.nd): label-content-name-mismatch (WCAG 2.5.3). A node's aria-label holds the full course name, which contains
      // every visible word; the only difference is the "…" that cuts a long name on screen, and the tool reads that glyph as a missing word. The node text is
      // checked below ('map: every node shows its name') instead of being hidden from the tool.
      const violations = all.map((v) => (v.id === 'label-content-name-mismatch' ? { ...v, nodes: v.nodes.filter((n) => !n.html.startsWith('<g class="nd')) } : v)).filter((v) => v.nodes.length);
      for (const v of violations) found.push(`${screen}: ${v.id} (${v.impact}) x${v.nodes.length} ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    },
    done: () => assert.deepEqual(found, [], 'axe violations'),
  };
}

const TERMS = { 'afeka-sched-v1-terms': '2' };
const COMBOS = Object.keys(SIZES).flatMap((size) => ['light', 'dark'].map((scheme) => [size, scheme]));

for (const [size, scheme] of COMBOS) {
  const visit = (t, seed, hash) => visitIn(browser, t, size, seed, hash, scheme);

  test(`${size}/${scheme}: axe, the way in: terms gate, track, year, grade-sheet entry, manual entry`, async (t) => {
    const { check, done } = checker(scheme);
    const page = await visit(t);
    await page.locator('.gate').waitFor();
    await check(page, 'gate');
    await page.locator('[data-k="termsTick"]').check();
    await page.locator('[data-act="acceptTerms"]').click();
    await page.locator('[data-act="pickTrack"]').first().waitFor();
    await check(page, 'track');
    await page.locator('[data-act="pickTrack"][value="30"]').click();
    await page.locator('[data-act="pickYear"]').first().waitFor();
    await check(page, 'year');
    await page.locator('[data-act="pickYear"][value="2"]').click();
    const manual = page.getByRole('button', { name: 'הזנה ידנית' });
    await manual.waitFor();
    await check(page, 'step 1 entry');
    await manual.click();
    await page.locator('.crs').first().waitFor();
    await check(page, 'step 1');
    done();
  });

  // The tour popover and its dimmed page (Driver.js, restyled in style.css): every stop of the intro from the replay button, then the plans part on its own.
  test(`${size}/${scheme}: axe, the first-visit tour: every stop of the intro and of the plans part`, async (t) => {
    const { check, done } = checker(scheme);
    const page = await visitIn(browser, t, size, DONE, '#me', scheme, true); // the tour unseen: the plans part waits for step 4, the intro for the replay button
    await page.locator('#meTitle').waitFor();
    await page.locator('#tourBtn').click();
    for (const [part, steps] of [['intro', TOUR_INTRO], ['plans', TOUR_PLANS]]) {
      if (part === 'plans') await page.goto(SITE);
      for (let i = 1; i <= steps.length; i++) {
        await page.waitForFunction((n) => document.querySelector('.driver-popover-progress-text')?.textContent.startsWith(`${n} מתוך`), i, { timeout: 30000 });
        await check(page, `tour ${part}, stop ${i}`);
        if (i < steps.length) await page.locator('.driver-popover-next-btn').click();
      }
      await page.locator('.driver-popover-next-btn').click();
      await page.locator('.driver-popover').waitFor({ state: 'detached' });
    }
    done();
  });

  test(`${size}/${scheme}: axe, steps 2 and 3, the legal page`, async (t) => {
    const { check, done } = checker(scheme);
    const page = await visit(t, DONE, '#courses');
    await page.locator('#side *').first().waitFor();
    await check(page, 'step 2');
    await page.goto(SITE + '#prefs');
    await page.locator('input[data-chg="split"]').waitFor({ state: 'attached' });
    await check(page, 'step 3');
    await page.locator('input[data-chg="split"]').check();
    await page.locator('dialog[open]').waitFor();
    await check(page, 'split warning dialog');
    await page.keyboard.press('Escape');
    await page.locator('dialog[open]').waitFor({ state: 'detached' });
    await page.locator('[data-act="resetPrefs"]').first().click();
    await page.locator('dialog[open]').waitFor();
    await check(page, 'confirm dialog');
    await page.keyboard.press('Escape');
    await page.locator('#openFriendEditor').click();
    await page.locator('#friendEd[open]').waitFor();
    await check(page, 'friend editor, groups tab');
    const tab = (name) => (size === 'phone' ? page.locator(`#friendEd [data-fe="tab"][data-tab="${name}"]`).click() : null); // desktop shows both halves
    await tab('grid');
    await check(page, 'friend editor, empty schedule');
    await tab('pick');
    await page.locator('#feCourse').fill(await page.locator('#feCourses option').first().getAttribute('value'));
    await page.locator('#feSearch button[type="submit"]').click();
    await page.locator('#feGroups [data-fe="toggle"]').first().waitFor();
    await page.locator('#feGroups [data-fe="toggle"]').first().click(); // a group chosen: the schedule has blocks on some days only
    await check(page, 'friend editor, a group chosen');
    await tab('grid');
    for (const day of await page.locator('#feDays [data-fe="day"]').all()) { // one day at a time on a phone; the desktop editor shows the whole week
      if (await day.isVisible()) { await day.click(); await check(page, `friend editor, schedule, day ${await day.getAttribute('data-day')}`); }
    }
    await page.keyboard.press('Escape');
    await page.goto(SITE.replace(/\/?$/, '/') + 'legal.html');
    await check(page, 'legal page');
    done();
  });

  test(`${size}/${scheme}: axe, step 4, the course popover, the map, the registration list, the text dialog`, async (t) => {
    const { check, done } = checker(scheme);
    const page = await visit(t, DONE);
    await weekReady(page);
    await check(page, 'step 4');
    // The popover of a block that has other groups in its course, one of them full or closed (the greyed row, once a contrast failure).
    let withAlt = false;
    for (const blk of (await page.locator('#week .blk').all()).slice(0, 25)) {
      if (!await blk.isVisible()) continue;
      await blk.click();
      await page.locator('#pop:popover-open').waitFor();
      if (await page.locator('#pop li.na').count()) { withAlt = true; await check(page, 'course popover with a greyed alternative'); }
      await page.keyboard.press('Escape');
      if (withAlt) break;
    }
    assert.ok(withAlt, 'some block of the seeded plan has a full or closed alternative group');
    await page.locator('#week .blk').first().click();
    await page.locator('#pop:popover-open').waitFor();
    await check(page, 'course popover');
    await page.keyboard.press('Escape');
    for (const day of await page.locator('#daysel [data-act="day"]').all()) { if (await day.isVisible()) { await day.click(); await check(page, `step 4, day ${await day.getAttribute('data-day')}`); } }
    await page.locator('[data-act="openMap"]').click();
    await page.locator('#pmap[open]').waitFor();
    await check(page, 'map');
    const bare = await page.evaluate(() => [...document.querySelectorAll('#pmap .nd')].filter((n) => { const t = n.querySelector('.nm'); return !t?.textContent.trim() || t.getBoundingClientRect().width <= 0; }).length);
    assert.equal(bare, 0, 'map: every node shows its name as text (a real <text>, so find-in-page and selection work)');
    await page.keyboard.press('Escape');
    await page.locator('[data-act="panel"][data-panel="reg"]').click();
    await page.locator('#drawer[open]').waitFor();
    await check(page, 'registration list');
    await page.locator('[data-act="copyReg"]').click();
    await page.locator('dialog[open]:has(textarea)').waitFor();
    await check(page, 'text dialog');
    done();
  });

  test(`${size}/${scheme}: axe, the grade-sheet preview`, async (t) => {
    const { check, done } = checker(scheme);
    const page = await visit(t, { ...TERMS, 'afeka-sched-v1': JSON.stringify({ ...STUDENT, passed: [] }) }, '#me');
    await page.locator('#gradeFile').waitFor({ state: 'attached' });
    await page.locator('#gradeFile').setInputFiles({ name: 'sheet.pdf', mimeType: 'application/pdf', buffer: gradeSheetPdf(['10016 Calculus 4.0 85', '30003 Physics 3.5 90']) });
    await page.locator('dialog.dlg-rows[open]').waitFor({ timeout: 30000 });
    await check(page, 'grade-sheet preview');
    done();
  });
}

// ---- what axe cannot judge ----
// Reflow (WCAG 1.4.10): at 320px wide, and at 640px (what 200% browser zoom leaves of a 1280px screen), no screen and no open dialog scrolls sideways.
const NARROW = [{ width: 320, height: 640 }, { width: 640, height: 400 }];
const sideways = (page) => page.evaluate(() => {
  const over = [document.documentElement, ...document.querySelectorAll('dialog[open]')].filter((e) => e.scrollWidth > e.clientWidth + 1);
  return over.map((e) => `${e.tagName}#${e.id} ${e.scrollWidth}>${e.clientWidth}`);
});
for (const size of NARROW) {
  test(`${size.width}px wide: no sideways scrolling on the screens and dialogs`, async (t) => {
    const page = await visitIn(browser, t, size, { ...DONE });
    await weekReady(page);
    const bad = [];
    const look = async (what) => { await frame(page); for (const o of await sideways(page)) bad.push(`${what}: ${o}`); };
    await look('step 4');
    await page.locator('#week .blk').first().click();
    await page.locator('#pop:popover-open').waitFor();
    await look('course popover');
    await page.keyboard.press('Escape');
    for (const [name, open, shown] of [['map', '[data-act="openMap"]', '#pmap[open]'], ['registration list', '[data-act="panel"][data-panel="reg"]', '#drawer[open]']]) {
      await page.locator(open).click();
      await page.locator(shown).waitFor();
      await look(name);
      await page.keyboard.press('Escape');
    }
    for (const hash of ['#me', '#courses', '#prefs']) { await page.goto(SITE + hash); await page.locator(`${hash}Title`).waitFor(); await look(hash); }
    await page.locator('#openFriendEditor').click();
    await page.locator('#friendEd[open]').waitFor();
    await look('friend editor');
    await page.keyboard.press('Escape');
    await page.goto(SITE + 'legal.html');
    await look('legal page');
    assert.deepEqual(bad, [], 'sideways scrolling');
  });
}

// Focus visible (2.4.7) and the Tab order (2.4.3): on step 4 every Tab stop shows a ring, and no stop jumps backwards in the document.
test('keyboard: the first 60 Tab stops of each step show a focus ring, in document order', async (t) => {
  const page = await visitIn(browser, t, 'desktop', DONE);
  await weekReady(page);
  const bad = [];
  for (const hash of ['', '#me', '#courses', '#prefs']) {
    await page.goto(SITE + hash);
    await page.locator(hash ? `${hash}Title` : '#week .blk').first().waitFor({ timeout: 30000 });
    await frame(page);
    await page.evaluate(() => { document.activeElement?.blur(); window.__prev = null; });
    const stops = [];
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      const s = await page.evaluate(() => {
        const e = document.activeElement, mark = e.matches('input[type="radio"], input[type="checkbox"]') ? e.closest('label')?.querySelector('span') ?? e : e;
        const st = getComputedStyle(mark);
        const backwards = window.__prev && !(window.__prev.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING);
        window.__prev = e;
        return { id: e.dataset.k ?? e.id ?? e.tagName, ring: st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) >= 2, tabindex: e.tabIndex, backwards: !!backwards, body: e === document.body };
      });
      if (s.body) break; // Tab left the page
      stops.push(s.id);
      if (!s.ring) bad.push(`${hash || 'plan'}: ${s.id}: no focus ring`);
      if (s.tabindex > 0) bad.push(`${hash || 'plan'}: ${s.id}: positive tabindex`);
      if (s.backwards && stops.length > 1) bad.push(`${hash || 'plan'}: ${s.id}: before the previous stop in the document`);
    }
    assert.ok(stops.length > 8, `${hash || 'plan'}: only ${stops.length} Tab stops`);
  }
  assert.deepEqual(bad, [], 'keyboard problems');
});

// Names (4.1.2): axe checks that buttons, links and fields have one; here the step bar and the dialogs are read the way a screen reader gets them.
test('names: step bar links, dialogs and the theme button have a name', async (t) => {
  const page = await visitIn(browser, t, 'desktop', DONE);
  await weekReady(page);
  const steps = await page.getByRole('navigation', { name: 'שלבים' }).getByRole('link').allInnerTexts();
  assert.equal(steps.length, 4);
  assert.match(await page.getByRole('navigation', { name: 'שלבים' }).locator('[aria-current="step"]').getAttribute('aria-label'), /^שלב 4/);
  assert.ok(await page.locator('.theme-btn').first().getAttribute('aria-label') ?? await page.locator('.theme-btn').first().innerText(), 'the theme button has a name');
  for (const [open, dialog] of [['[data-act="openMap"]', '#pmap'], ['[data-act="panel"][data-panel="reg"]', '#drawer']]) {
    await page.locator(open).click();
    await page.locator(`${dialog}[open]`).waitFor();
    assert.ok(await page.getByRole('dialog', { name: /.+/ }).count() >= 1, `${dialog} has a name`);
    await page.keyboard.press('Escape');
  }
});

// Focus goes back to what opened a dialog (2.4.3), and a focused map node shows its ring (2.4.7: the node is drawn in SVG, so no outline).
test('keyboard: Escape returns the focus to the opener, a focused map node shows its halo', async (t) => {
  const page = await visitIn(browser, t, 'desktop', DONE);
  await weekReady(page);
  for (const [open, shown] of [['[data-act="openMap"]', '#pmap[open]'], ['[data-act="panel"][data-panel="reg"]', '#drawer[open]']]) {
    await page.locator(open).focus();
    await page.keyboard.press('Enter');
    await page.locator(shown).waitFor();
    if (shown === '#pmap[open]') {
      let onNode = false;
      for (let i = 0; i < 60 && !onNode; i++) { await page.keyboard.press('Tab'); onNode = await page.evaluate(() => document.activeElement.matches('.nd')); }
      assert.ok(onNode, 'Tab reaches a map node');
      assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement.querySelector('.halo')).opacity), '1', 'the focused node has a halo');
    }
    await page.keyboard.press('Escape');
    await page.locator(shown).waitFor({ state: 'detached' });
    assert.ok(await page.locator(open).evaluate((b) => b === document.activeElement), `focus is back on ${open}`);
  }
});

// Text spacing (1.4.12): with the line, letter, word and paragraph spacing a user style sheet may set, no visible text is cut off.
test('text spacing: nothing is clipped on the four steps and the legal page', async (t) => {
  const page = await visitIn(browser, t, 'phone', DONE);
  await weekReady(page);
  const bad = [];
  for (const hash of ['', '#me', '#courses', '#prefs', 'legal']) {
    await page.goto(hash === 'legal' ? `${SITE}legal.html` : SITE + hash);
    await frame(page);
    await page.addStyleTag({ content: 'html *{line-height:1.5 !important;letter-spacing:.12em !important;word-spacing:.16em !important} p{margin-bottom:2em !important}' });
    await frame(page);
    bad.push(...await page.evaluate((h) => [...document.querySelectorAll('body *')].filter((e) => e.offsetParent && !e.children.length && e.textContent.trim() && !e.closest('.sr') && e.clientWidth > 1 // (a 1px box is a screen-reader-only label)
      && ['hidden', 'clip'].includes(getComputedStyle(e).overflow) && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1))
      .map((e) => `${h || 'plan'}: ${e.className} "${e.textContent.trim().slice(0, 20)}"`), hash));
  }
  assert.deepEqual(bad, [], 'clipped text');
});

// Contrast of what is not text (1.4.11): the outline of a field is 3:1 against the page and against the card, the focus ring against both, in both colour schemes.
for (const scheme of ['light', 'dark']) {
  test(`${scheme}: field outlines and the focus ring are 3:1 against the page and the cards`, async (t) => {
    const page = await visitIn(browser, t, 'desktop', DONE, '', scheme);
    await weekReady(page);
    const low = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement), tok = (n) => css.getPropertyValue(n).trim();
      const lum = (hex) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
      return [['--border-input', '--bg'], ['--border-input', '--surface'], ['--primary', '--bg'], ['--primary', '--surface']].map(([a, b]) => [a, b, ratio(tok(a), tok(b))])
        .filter(([, , r]) => r < 3).map(([a, b, r]) => `${a} on ${b}: ${r.toFixed(2)}`);
    });
    assert.deepEqual(low, [], 'below 3:1');
  });
}

// What the docs call "measured": one <h1> and a title of its own on each step.
test('structure: one h1 and a distinct document title on each of the four steps', async (t) => {
  const page = await visitIn(browser, t, 'desktop', DONE);
  await weekReady(page);
  const titles = [];
  for (const hash of ['', '#me', '#courses', '#prefs']) {
    await page.goto(SITE + hash);
    await page.locator(hash ? `${hash}Title` : '#week .blk').first().waitFor({ timeout: 30000 });
    const h1 = await page.evaluate(() => [...document.querySelectorAll('h1')].filter((h) => h.offsetParent).length);
    assert.equal(h1, 1, `${hash || 'plan'}: visible h1 count`);
    titles.push(await page.title());
  }
  assert.equal(new Set(titles).size, 4, `titles differ per step: ${titles}`);
});
