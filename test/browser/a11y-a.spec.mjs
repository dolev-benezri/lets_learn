// Accessibility of design A's frame and tools (web/ui-shell.js, web/design-a.css) in WebKit: axe on every tool and on the way in, no sideways scroll at
// 320px (the page and the panel's own scroller), touch targets of at least 44px, a visible focus ring, and a landscape phone. Every visit sets
// { design: 'a' }, so CI tests A as written. No top-level await in a spec: node:test then hangs after the run.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
import { SITE, DONE, STUDENT, DESIGN_KEY, TOUR_SEEN, MODE_BUILD, gradeSheetPdf, openMap, launch, visit as visitIn } from './helpers.mjs';

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

// Phase 4 A: help must consume Escape before the phone sheet's handler, even after focus moves into its section.
for (const scheme of ['light', 'dark'])
  test(`${scheme}: section help supports Enter, Space and Escape, returns focus and keeps the phone sheet open`, async (t) => {
    const page = await visit(t, 'phone', DONE, '', scheme);
    await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
    await page.locator('.dock [data-tool="me"]').click();
    const button = page.getByRole('button', { name: 'הסבר: פרופיל', exact: true });
    await button.waitFor();
    assert.equal(await button.getAttribute('aria-controls'), 'meProfileHelp');
    for (const key of ['Enter', 'Space']) {
      await button.focus();
      await page.keyboard.press(key);
      assert.equal(await button.getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('#meProfileHelp').isVisible(), true);
      await page.locator('#me [data-k="amirnet"]').focus();
      await page.keyboard.press('Escape');
      assert.equal(await button.getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('#meProfileHelp').isVisible(), false);
      assert.equal(await button.evaluate((e) => e === document.activeElement), true);
      assert.equal(await page.locator('#panel').isVisible(), true);
      assert.equal(new URL(page.url()).hash, '#me');
    }
    // an edited field is committed when Escape moves the focus, and the redraw replaces the button: the live one gets the focus
    await button.focus();
    await page.keyboard.press('Enter');
    await page.locator('#me [data-k="amirnet"]').fill('120');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-controls')), 'meProfileHelp', 'focus is on the live help button');
    assert.equal(await button.getAttribute('aria-expanded'), 'false');
    await page.keyboard.press('Escape');
    await page.locator('#panel').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.dock [data-tool="me"]').evaluate((e) => e === document.activeElement), true);
  });

// Closed details are skipped by the older target scan: explicitly open every tool fold (including phase 4 E's friends link), then every help paragraph.
for (const scheme of ['light', 'dark'])
  test(`${scheme}: each tool at 320px, with help and folds open, also at 200% text: axe, reflow and 44px targets`, async (t) => {
    const page = await visit(t, WIDTHS[320], DONE, '', scheme);
    const { check, done, note } = checker(scheme);
    for (const [tool, hash, id] of TOOLS) {
      await page.evaluate((h) => (location.hash = h), hash);
      await page.locator(`#panel ${id}`).waitFor({ state: 'visible' });
      await frame(page);
      await check(page, `${tool} closed help/folds`);
      await page.locator(`${id} details`).evaluateAll((els) => els.forEach((e) => { e.open = true; }));
      // Native click updates the same help state that a redraw will read.
      for (const button of await page.locator(`${id} .a-help[aria-expanded="false"]`).all()) {
        if (await button.isVisible()) await button.click();
      }
      await check(page, `${tool} open help/folds`);
      await layoutOk(page, `${tool} open help/folds`, true, note);
      await page.locator(`${id} .a-crs-name`).first().evaluateAll((els) => els.forEach((e) => {
        e.textContent = 'יישומי מחשב בהנדסת MATLAB ושיטות מתקדמות לחישוב ולתכנון מערכות ארוכות מאוד';
      }));
      await page.locator(id).evaluate((root) => {
        const els = [root, ...root.querySelectorAll('*')];
        const sizes = els.map((el) => getComputedStyle(el).fontSize);
        // important: style.css's touch guard (16px, important) would otherwise keep the fields at 16
        els.forEach((el, i) => { el.dataset.a11ySize = el.style.fontSize; el.style.setProperty('font-size', `${parseFloat(sizes[i]) * 2}px`, 'important'); });
      });
      await check(page, `${tool} 200% text`);
      await layoutOk(page, `${tool} 200% text`, true, note);
      await page.locator(id).evaluate((root) => {
        for (const el of [root, ...root.querySelectorAll('*')]) {
          el.style.fontSize = el.dataset.a11ySize ?? '';
          delete el.dataset.a11ySize;
        }
      });
    }
    done();
  });

for (const scheme of ['light', 'dark'])
  test(`${scheme}: friends link fold has a labelled 44px summary, native keyboard and a visible focus ring`, async (t) => {
    const page = await visit(t, WIDTHS[320], DONE, '#friends', scheme);
    const fold = page.locator('#friends details[data-key="friends-mine"]'), control = fold.locator('summary');
    await control.waitFor();
    assert.equal((await control.textContent()).trim(), 'הקישור שלי');
    await control.focus();
    await page.keyboard.press('Enter');
    assert.equal(await fold.evaluate((e) => e.open), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#friends [data-k="myName"]').evaluate((e) => e === document.activeElement), true);
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Space');
    assert.equal(await fold.evaluate((e) => e.open), false);
    assert.equal(await control.evaluate((e) => {
      const r = e.getBoundingClientRect(), s = getComputedStyle(e);
      return e === document.activeElement && r.width >= 43.5 && r.height >= 43.5 &&
        r.top >= 0 && r.bottom <= innerHeight && s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2;
    }), true);
  });

for (const width of [320, 1920])
  test(`${width}: preferences keep planning and importance visible; more settings retain keyboard, focus and search`, async (t) => {
    const page = await visit(t, { width, height: 900 }, DONE);
    await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
    await page.locator('.dock [data-tool="wishes"]').click();
    await page.locator('#panel #prefs').waitFor({ state: 'visible' });
    await frame(page);
    const fold = page.locator('#prefs details[data-key="prefs-more"]'), control = fold.locator('summary');
    assert.equal((await control.textContent()).trim(), 'עוד הגדרות');
    assert.equal(await fold.evaluate((e) => e.open), false);
    for (const name of ['scope', 'load', 'w-freeDays', 'w-compact'])
      assert.equal(await page.locator(`#prefs input[name="${name}"]`).first().isVisible(), true, name);
    for (const name of ['notBefore', 'notAfter', 'maxCredits', 'maxDays', 'examsForbid', 'includeFull', 'split']) {
      assert.equal(await fold.locator(`[data-chg="${name}"]`).count(), 1, name);
      assert.equal(await fold.locator(`[data-chg="${name}"]`).isVisible(), false, name);
    }
    assert.equal(await fold.locator('[data-act="blkAdd"]').isVisible(), false);
    const settled = (open) => page.evaluate(async (open) => {
      const { openDetails } = await import('./ui-common.js'), end = Date.now() + 5000;
      while (openDetails.has('prefs-more') !== open) {
        if (Date.now() > end) throw new Error('preferences toggle did not settle');
        await new Promise((r) => setTimeout(r, 20));
      }
    }, open);
    await control.focus();
    await page.keyboard.press('Enter');
    await settled(true);
    await page.evaluate(async () => (await import('./app.js')).refresh());
    assert.equal(await fold.evaluate((e) => e.open), true);
    assert.equal(await control.evaluate((e) => e === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await fold.evaluate((e) => e.contains(document.activeElement)), true);
    await page.evaluate(async () => {
      const { ui } = await import('./ui-common.js');
      window.__prefsRun = ui.last;
    });
    const cap = fold.locator('[data-k="maxCredits"]');
    await cap.fill('20');
    await cap.dispatchEvent('change');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('afeka-sched-v1')).constraints.maxCredits === 20, null, { timeout: 10000 });
    await page.evaluate(async () => {
      const { ui } = await import('./ui-common.js'), end = Date.now() + 60000;
      while (ui.last === window.__prefsRun) {
        if (Date.now() > end) throw new Error('preference did not rerun the search');
        await new Promise((r) => setTimeout(r, 20));
      }
    });
    await frame(page);
    assert.equal(await fold.evaluate((e) => e.open), true);
    assert.equal(await cap.evaluate((e) => e === document.activeElement), true);
    await control.focus();
    await page.keyboard.press('Space');
    await settled(false);
    await page.evaluate(async () => (await import('./app.js')).refresh());
    assert.equal(await fold.evaluate((e) => e.open), false);
    assert.equal(await control.evaluate((e) => e === document.activeElement), true);
    assert.equal(await control.evaluate((e) => {
      const r = e.getBoundingClientRect(), s = getComputedStyle(e);
      return r.width >= 44 && r.height >= 44 && s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2;
    }), true);
    if (width < 600) {
      await page.keyboard.press('Escape');
      await page.locator('#panel').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('.dock [data-tool="wishes"]').evaluate((e) => e === document.activeElement), true);
    }
  });

for (const scheme of ['light', 'dark']) for (const mode of ['build', 'improve'])
  test(`${scheme}/${mode}: collapsed and expanded phone sheets pass axe, targets and reflow`, async (t) => {
    const lesson = { course: '30003', name: 'מבוא לכימיה', type: 'סופי-הרצאה+תרגול', group: '273000302', day: 4, start: '14:00', end: '15:50' };
    const seed = mode === 'build' ? DONE : { ...DONE, 'afeka-sched-v1-edit': JSON.stringify({
      v: 1, dataset: { year: 2027, sem: 'א', program: 30, startYear: 2026 }, registered: false, owned: [],
      original: [lesson], baseline: [lesson], movable: [], goal: {}
    }) };
    const page = await visit(t, WIDTHS[320], seed, mode === 'build' ? '#prefs' : '#edit', scheme);
    const button = page.locator(mode === 'build' ? '#panel .a-sheet-expand' : '.edit-tool .a-sheet-expand');
    await button.waitFor();
    const { check, done, note } = checker(scheme);
    await check(page, '60% sheet');
    await layoutOk(page, '60% sheet', true, note);
    await button.focus();
    await page.keyboard.press('Enter');
    assert.equal(await button.getAttribute('aria-expanded'), 'true');
    await check(page, 'expanded sheet');
    await layoutOk(page, 'expanded sheet', true, note);
    await page.keyboard.press('Space');
    assert.equal(await button.getAttribute('aria-expanded'), 'false');
    assert.equal(await button.evaluate((e) => e === document.activeElement), true);
    await page.setViewportSize({ width: 600, height: 900 });
    // the focus leaves the hidden button for the screen's title: wait for the title, not only for the button to lose it (a loaded machine
    // shows the moment between, with the focus on the body)
    const title = mode === 'build' ? 'prefsTitle' : 'editTitle';
    await page.waitForFunction((id) => document.activeElement?.id === id, title, { timeout: 5000 }).catch(() => {});
    assert.equal(await button.isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement?.id), title);
    done();
  });

// Phase 4 C: both kinds of row, including their hidden controls, retain their native keyboard and focus across a redraw.
for (const width of [375, 1920]) for (const tool of ['courses', 'me'])
  test(`${width}/${tool}: course row names, Enter/Space/Escape, open state and focus after search/redraw, long names reflow`, async (t) => {
    const page = await visit(t, { width, height: 900 }, DONE, `#${tool}`);
    await page.locator(`#panel #${tool}`).waitFor({ state: 'visible' });
    await frame(page);
    const fold = page.locator(`#${tool} .a-course-more:visible`).first(), sum = fold.locator('summary');
    const name = await fold.locator('..').locator('.a-crs-name').innerText();
    assert.equal(await sum.getAttribute('aria-label'), `עוד על ${name}`);
    assert.equal((await sum.innerText()).trim(), 'עוד');
    assert.equal(await fold.evaluate((e) => e.open), false);
    const layout = await fold.evaluate((e) => {
      const row = e.closest('.a-crs'), seg = row.querySelector(':scope > .seg');
      const s = getComputedStyle(row), dot = row.querySelector('.dot').getBoundingClientRect();
      return { cols: s.gridTemplateColumns.split(' ').length, dot: [dot.width, dot.height],
        background: s.backgroundImage, shadow: s.boxShadow, radius: s.borderRadius,
        seg: !seg || seg.getBoundingClientRect().height >= 44 };
    });
    assert.deepEqual(layout, { cols: width < 600 ? 1 : 2, dot: [10, 10], background: 'none', shadow: 'none', radius: '0px', seg: true });
    await sum.focus();
    await page.keyboard.press('Enter');
    assert.equal(await fold.evaluate((e) => e.open), true);
    assert.deepEqual(await fold.evaluate((e) => [...e.querySelectorAll('input, select, button')].flatMap((control) => {
      const target = control.matches('input[type=radio], input[type=checkbox]') ? control.closest('label') : control;
      const r = target.getBoundingClientRect();
      return r.width >= 43.5 && r.height >= 43.5 ? [] : [`${control.dataset.k}: ${r.width}x${r.height}`];
    })), [], 'every extra control is a 44px target, including with a mouse');
    const key = await sum.getAttribute('data-k');
    await fold.evaluate((e) => { e.dataset.oldRow = '1'; });
    await page.evaluate(async (which) => {
      if (which === 'courses') (await import('./ui-search.js')).scheduleRun();
      else (await import('./app.js')).refresh();
    }, tool);
    await page.waitForFunction(() => !document.querySelector('.a-course-more[data-old-row]'), null, { timeout: 60000 });
    await frame(page);
    const restored = page.locator(`[data-k="${key}"]`), rowFold = restored.locator('..');
    assert.equal(await rowFold.evaluate((e) => e.open), true);
    assert.equal(await restored.evaluate((e) => e === document.activeElement), true);
    if (await rowFold.locator('input, select, button').count()) {
      await page.keyboard.press('Tab');
      assert.equal(await rowFold.evaluate((e) => e.contains(document.activeElement)), true, 'fold content reachable');
    }
    await page.keyboard.press('Escape');
    assert.equal(await rowFold.evaluate((e) => e.open), false);
    assert.equal(await restored.evaluate((e) => e === document.activeElement), true);
    assert.equal(await page.locator('#panel').isVisible(), true, 'row Escape leaves the phone sheet open');
    await page.keyboard.press('Space');
    assert.equal(await rowFold.evaluate((e) => e.open), true);
    await restored.evaluate((e) => {
      e.closest('.a-crs').querySelector('.a-crs-name').textContent =
        'יישומי מחשב בהנדסת MATLAB ושיטות מתקדמות לחישוב ולתכנון מערכות ארוכות מאוד';
    });
    assert.deepEqual(await sideways(page), { page: true, panel: true });
    assert.equal(await restored.evaluate((e) => {
      const r = e.getBoundingClientRect(), s = getComputedStyle(e);
      return r.width >= 44 && r.height >= 44 && s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2;
    }), true, '44px summary with visible focus');
  });

test('course warnings stay outside a closed row fold, including a dropped must course and its qualifier', async (t) => {
  const seed = { ...DONE, 'afeka-sched-v1': JSON.stringify({ ...STUDENT, constraints: { maxCredits: 1 }, choices: { 20816: 'must' } }) };
  const page = await visit(t, 'phone', seed, '#courses');
  await page.locator('#panel #courses').waitFor({ state: 'visible' });
  await frame(page);
  const row = page.locator('#side article.course').filter({ has: page.locator('[data-id="20816"]') }).first();
  assert.equal(await row.locator('.a-course-more').evaluate((e) => e.open), false);
  const warning = row.locator(':scope > .warn-text');
  await warning.filter({ hasText: 'לא נכנס למערכת' }).waitFor();
  assert.match(await warning.allTextContents().then((a) => a.join(' ')), /לא נכנס למערכת כי /);
});

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
    // An open modal makes the page behind it inert: those are not targets.
    const modal = document.querySelector('dialog:modal');
    for (const root of ['.a-top', '.a-bar', '.dock', '#panel', '#pills', '.a-strip', '#semtabs', '#alts', '.edit-card', '.edit-tool', '.a-fr-card',
      '#drawer', '#friendEd', '#pmap']) {
      for (const el of document.querySelector(root)?.querySelectorAll(sel) ?? []) {
        if (!el.checkVisibility() || el.closest('[hidden]') || el.matches('.nd') || prose(el) || (modal && !modal.contains(el))) continue;
        if (el.closest('details:not([open])') && !el.matches('details > summary')) continue;
        const box = el.matches('input[type=checkbox], input[type=radio]') ? (el.closest('label') ?? el) : el;
        const r = box.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // Map arrows paint at 36px on phones; their pseudo-element extends the clickable surface into the gaps.
        const wide = r.width >= 43.5 || (el.matches('#pmap .pm-alt .pm-ibtn') &&
          [r.left - 3, r.right + 3].every((x) => document.elementFromPoint(x, r.top + r.height / 2) === el));
        if (!wide || r.height < 43.5)
          bad.push(`${root} <${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + String(el.className).split(' ').slice(0, 2).join('.') : ''}> "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 18)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return bad;
  });

// Phase 5 D: both uses of the schedule editor, with its native fold closed and open, including desktop targets.
for (const [w, size] of Object.entries(WIDTHS)) for (const scheme of ['light', 'dark']) for (const mode of ['friend', 'edit'])
  test(`${w}/${scheme}/${mode}: file first, more ways closed/open, nearby actions, targets and keyboard focus through redraws`, async (t) => {
    const { check, done, note } = checker(scheme);
    const page = await visit(t, size, DONE, mode === 'friend' ? '#friends' : '#edit', scheme);
    await page.locator(mode === 'friend' ? '#openFriendEditor' : '[data-ed="loadHand"]').click();
    await page.locator('#friendEd[open]').waitFor();
    const fold = page.locator('#feMore'), summary = fold.locator('summary');
    assert.equal(await fold.evaluate((e) => e.open), false);
    assert.equal(await summary.textContent(), 'דרכים נוספות');
    assert.equal(await page.locator('#feFile').isVisible(), true);
    assert.equal(await page.locator('#feCourse').isVisible(), false);
    assert.equal(await page.locator('#feText').isVisible(), false);
    assert.deepEqual((await page.locator('.fe-actions button').allTextContents()).map((s) => s.trim()), ['שמור', 'ביטול']);
    assert.equal(await page.locator('.fe-actions').evaluate((e) => {
      const content = e.previousElementSibling.getBoundingClientRect(), actions = e.getBoundingClientRect();
      return Math.abs(content.bottom - actions.top) <= 1 && actions.bottom <= innerHeight + 1;
    }), true, 'actions sit directly below the content, on screen');
    await check(page, 'editor closed fold');
    await layoutOk(page, 'editor closed fold', true, note);
    await summary.focus();
    await page.keyboard.press('Enter');
    assert.equal(await summary.evaluate((e) => e.parentElement.open && e === document.activeElement), true);
    await check(page, 'editor open fold');
    await layoutOk(page, 'editor open fold', true, note);
    assert.deepEqual(await fold.locator('h3').allTextContents(), ['בחירה ידנית', 'הדבקה']);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'feCourse', 'manual selection is keyboard reachable');
    await page.locator('#feCourse').fill('30003');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    const group = page.locator('#feGroups [data-gid="273000302"]');
    await group.press('Enter');
    assert.equal(await group.evaluate((e) => e === document.activeElement), true, 'the redrawn group keeps focus');
    assert.equal(await fold.evaluate((e) => e.open), true, 'redrawing the week leaves the fold open');
    await page.locator('#feText').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'feFind', 'paste is keyboard reachable');
    await summary.focus();
    await page.keyboard.press('Space');
    assert.equal(await summary.evaluate((e) => !e.parentElement.open && e === document.activeElement), true);
    assert.equal(await summary.evaluate((e) => {
      const s = getComputedStyle(e), r = e.getBoundingClientRect();
      return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2 && r.top >= 0 && r.bottom <= innerHeight;
    }), true, 'the focused summary has a visible ring on screen');
    await page.setViewportSize({ width: w === '1280' ? 375 : 1280, height: 812 });
    assert.equal(await summary.evaluate((e) => e === document.activeElement), true, 'resize keeps focus');
    await page.keyboard.press('Enter');
    assert.match(await group.textContent(), /משובץ/, 'the draft survives folding and resize');
    done();
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

// Phase 5 A-C: the menu/info sheet and the map legend, including the fold and the remembered switch.
for (const [w, size] of Object.entries(WIDTHS)) for (const scheme of ['light', 'dark'])
  test(`${w}/${scheme}: menu, info, map legend closed/open and focus switch: axe, targets, keyboard focus`, async (t) => {
    const { check, done, note } = checker(scheme);
    const page = await visit(t, size, DONE, '', scheme);
    await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
    await page.locator('.menu-btn').click();
    await check(page, 'menu');
    if (w !== '1280') for (const b of await smallTargets(page)) note(`menu: ${b}`);
    await page.locator('#drawer [data-k="menu-info"]').click();
    await check(page, 'info');
    if (w !== '1280') for (const b of await smallTargets(page)) note(`info: ${b}`);
    await page.locator('#drawer [data-k="infoBack"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), 'menu-info');
    await page.locator('#drawer [data-k="menu-faq"]').click(); // the questions page, one answer open
    await page.locator('#drawer .faq summary').first().click();
    await check(page, 'faq');
    if (w !== '1280') for (const b of await smallTargets(page)) note(`faq: ${b}`);
    await page.locator('#drawer [data-k="infoBack"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), 'menu-faq');
    await page.keyboard.press('Escape');
    await openMap(page);
    await page.locator('#pmap .pm-svg.ready').waitFor({ timeout: 30000 });
    await check(page, 'map legend closed');
    const more = page.locator('#pmap .pm-legend-more > summary');
    await more.focus();
    await page.keyboard.press('Enter');
    assert.equal(await more.evaluate((el) => el.parentElement.open && el === document.activeElement), true);
    await check(page, 'map legend open');
    const sw = page.getByRole('switch', { name: 'הדגשת המערכת' });
    // reach it by keyboard: Firefox shows no :focus-visible ring after a script focus() that follows a mouse click
    await sw.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    assert.equal(await sw.evaluate((el) => el === document.activeElement), true, 'Tab returns to the switch');
    await page.keyboard.press('Space');
    assert.equal(await sw.getAttribute('aria-checked'), 'false');
    const ring = await sw.evaluate((el) => ({
      focused: el === document.activeElement, outline: getComputedStyle(el).outlineStyle, fv: el.matches(':focus-visible'), active: document.activeElement?.dataset.k
    }));
    assert.ok(ring.focused && ring.outline !== 'none', `the switch keeps a visible focus ring ${JSON.stringify(ring)}`);
    await check(page, 'map focus off');
    const r = await sw.boundingBox();
    assert.ok(r && r.height >= 44 && r.width >= 44);
    if (w !== '1280') for (const b of await smallTargets(page)) note(`map: ${b}`);
    done();
  });

for (const [w, size] of Object.entries(WIDTHS))
  for (const scheme of ['light', 'dark']) {
    test(`${w}/${scheme}: the way in (the first-run card: step 1 empty and filled, step 2, then the record): axe, no sideways scroll, targets`, async (t) => {
      const { check, done, note } = checker(scheme);
      const touch = w !== '1280';
      const page = await visit(t, size, null, '', scheme);
      await page.locator('.a-fr-card .gate').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => (document.getElementById('frTitle').focus(), document.activeElement.id)), 'frTitle', 'the card heading takes focus');
      await check(page, 'step 1');
      await layoutOk(page, 'step 1', touch, note);
      await page.locator('[data-k="frTerms"]').check();
      await page.locator('[data-k="frTrack"]').selectOption('30');
      await page.locator('[data-k="fr-year-2"]').check();
      await check(page, 'step 1 filled');
      await layoutOk(page, 'step 1 filled', touch, note);
      await page.locator('[data-k="frStart"]').click();
      await page.locator('.a-fr-card[data-step="passed"]').waitFor({ timeout: 30000 });
      await check(page, 'step 2');
      await layoutOk(page, 'step 2', touch, note);
      for (let i = 0; i < 6 && !(await page.locator('#firstRun').isHidden()); i++) {
        await page.locator('[data-k="frNext"]').click();
        await page.waitForTimeout(150);
      }
      // a first visit ends on #me (the route's own end is Task E): the record may be open already, and the dock button would close it on a phone
      if (!(await page.locator('#panel #me').isVisible())) await page.locator('.dock [data-tool="me"]').click();
      await page.locator('#panel .crs').first().waitFor({ timeout: 30000 });
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

// the first-run card (phase 3): each step, axe and the targets; a step's controls come with its task
const midPass = (step) => ({
  'afeka-sched-v1-terms': '2',
  'afeka-sched-v1-firstrun': String(step),
  'afeka-sched-v1': JSON.stringify({ ...STUDENT, profile: { ...STUDENT.profile, year: 2 } })
});
for (const [w, size] of Object.entries(WIDTHS))
  for (const scheme of ['light', 'dark'])
    test(`${w}/${scheme}: the first-run card on each step: axe, no sideways scroll, targets, the step heading takes focus`, async (t) => {
      const { check, done, note } = checker(scheme);
      for (const step of [2, 3, 4, 5]) {
        const page = await visit(t, size, midPass(step), '', scheme);
        await page.locator('.a-fr-card').waitFor({ state: 'visible' });
        await check(page, `step ${step}`);
        await layoutOk(page, `step ${step}`, w !== '1280', note);
        const heading = await page.evaluate(() => (document.getElementById('frTitle').focus(), document.activeElement.id));
        if (heading !== 'frTitle') note(`step ${step}: the heading cannot take focus`);
        if (!(await page.locator('.a-fr-foot').isVisible())) note(`step ${step}: no foot`);
      }
      done();
    });

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

// The luminance/ratio calculation from design-contrast.test.mjs, applied to computed colours.
const contrast = (a, b) => {
  const lum = (rgb) => {
    const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map((c) => c / 255)
      .map((c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test("the course search field's border meets 3:1 in both themes", async (t) => {
  for (const scheme of ['light', 'dark']) await t.test(scheme, async (t) => {
    const seed = { ...DONE, 'afeka-sched-v1-edit': JSON.stringify(EDIT_STATE) };
    const page = await visit(t, 'desktop', seed, '#edit/changes', scheme);
    await page.locator('[data-ed="openSearch"]').click({ timeout: 30000 });
    const input = page.locator('.cs-field input');
    await input.waitFor({ state: 'visible' });
    // Move focus away so a focus ring cannot stand in for the resting border.
    await page.locator('[data-ed="closeSearch"]').focus();
    const colours = await input.evaluate((el) => {
      const s = getComputedStyle(el);
      let behind = el.parentElement;
      while (behind && ['transparent', 'rgba(0, 0, 0, 0)'].includes(getComputedStyle(behind).backgroundColor)) behind = behind.parentElement;
      return { border: s.borderTopColor, width: parseFloat(s.borderTopWidth), style: s.borderTopStyle,
        inside: s.backgroundColor, outside: behind ? getComputedStyle(behind).backgroundColor : 'rgb(255, 255, 255)' };
    });
    assert.ok(colours.width > 0 && colours.style !== 'none', `${scheme}: a visible border`);
    for (const [side, bg] of [['inside', colours.inside], ['outside', colours.outside]]) {
      const ratio = contrast(colours.border, bg);
      assert.ok(ratio >= 3, `${scheme}: border against ${side} is ${ratio.toFixed(2)}:1 (${colours.border} on ${bg}), needs 3:1`);
    }
  });
});

test('a focused clashing lesson shows the focus ring and keeps its clash mark', async (t) => {
  for (const scheme of ['light', 'dark']) await t.test(scheme, async (t) => {
    const lessons = [EDIT_STATE.original[0], { ...EDIT_STATE.original[1], group: '273011202', day: 4, start: '14:00', end: '15:50' }];
    const seed = { ...DONE, 'afeka-sched-v1-edit': JSON.stringify({ ...EDIT_STATE, original: lessons, baseline: lessons, movable: [], goal: {} }) };
    const page = await visit(t, 'desktop', seed, '#edit/changes', scheme);
    const lesson = page.locator('#editWeek .blk.clash').first();
    await lesson.waitFor({ timeout: 30000 });
    assert.ok(await page.locator('#editWeek .blk.clash').count() >= 2, 'two lessons really overlap');
    await lesson.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const ring = await lesson.evaluate((el) => {
      const colour = (token) => {
        const probe = document.createElement('span');
        probe.style.color = `var(${token})`;
        el.append(probe);
        const value = getComputedStyle(probe).color;
        probe.remove();
        return value;
      };
      const s = getComputedStyle(el);
      return { focused: el === document.activeElement && el.matches(':focus-visible'), outline: s.outlineColor,
        offset: s.outlineOffset, width: s.outlineWidth, style: s.outlineStyle, shadow: s.boxShadow,
        primary: colour('--primary'), danger: colour('--danger'), clash: el.classList.contains('clash') };
    });
    assert.equal(ring.focused, true, `${scheme}: Tab reached the clashing lesson`);
    assert.equal(ring.outline, ring.primary, `${scheme}: focus uses --primary`);
    assert.equal(ring.offset, '2px', `${scheme}: the focus ring sits outside`);
    assert.equal(ring.width, '2px');
    assert.equal(ring.style, 'solid');
    assert.ok(ring.shadow.includes(ring.danger) && ring.shadow.includes('inset'), `${scheme}: the inset clash mark keeps --danger (${ring.shadow})`);
    assert.equal(ring.clash, true, 'focus keeps the clash class');
  });
});

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
