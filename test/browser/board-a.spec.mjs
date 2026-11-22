// Design A's board (web/ui-shell.js, web/ui-view.js renderAltColumn): the alternatives column on a wide screen, the board bar with the switcher and the
// share button, the swipe on a phone. Every visit sets { design: 'a' }. No top-level await in a spec: node:test then hangs after the run.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { STUDENT, DONE, launch, visit as visitIn } from './helpers.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const visit = (t, size, seed, hash = '') => visitIn(browser, t, size, seed, hash, 'light', false, false, { design: 'a' });
const OPEN = { 'afeka-sched-v1-alts': 'open' }; // the alternatives column starts folded to a rail: the tests that read its cards ask for it open
const weekReady = (page) => page.locator('#week .blk').first().waitFor({ timeout: 30000 });
const label = (page) => page.locator('#altLabel').textContent();

test('desktop: the column lists every alternative, marks the shown one, and a card shows that alternative', async (t) => {
  const page = await visit(t, 'desktop', { ...DONE, ...OPEN });
  await weekReady(page);
  const cards = page.locator('#alts .alt-card');
  await cards.first().waitFor();
  const n = await cards.count();
  const m = /מתוך (\d+)/.exec(await label(page));
  assert.equal(n, Number(m[1]), 'a card for each alternative');
  assert.equal(await page.locator('#alts .alt-card[aria-current="true"]').count(), 1);
  assert.equal(await cards.first().getAttribute('aria-current'), 'true');
  assert.ok(n >= 3, 'the student has several alternatives');
  await cards.nth(2).click();
  await page.waitForFunction(() => /חלופה 3 /.test(document.getElementById('altLabel').textContent));
  assert.equal(await page.locator('#alts .alt-card').nth(2).getAttribute('aria-current'), 'true');
  assert.equal(await page.locator('#alts .alt-card[aria-current="true"]').count(), 1);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), 'altcard-2', 'focus stays on the card that was clicked (WebKit does not focus a clicked button)');
  assert.equal(await page.locator('.a-stage.has-alts').count(), 1, 'a class, not :has(), tells the stage it has the column');
  for (const [i, text] of (await cards.allTextContents()).entries()) assert.match(text, /נ״ז/, `card ${i + 1} says its credits`);
});

test('a miniature week is not interactive: no id, key or action, hidden from assistive technology, and a tap on it does nothing else', async (t) => {
  const page = await visit(t, 'desktop', { ...DONE, ...OPEN });
  await weekReady(page);
  await page.locator('#alts .alt-card .mini').first().waitFor();
  const bad = await page.evaluate(() =>
    [...document.querySelectorAll('#alts .mini')].flatMap((m) => [
      m.getAttribute('aria-hidden') !== 'true' && 'not aria-hidden',
      ...[...m.querySelectorAll('*')].flatMap((e) => (e.id || e.dataset.k || e.dataset.act || e.matches('button, a, [tabindex]') ? [e.outerHTML.slice(0, 60)] : []))
    ]).filter(Boolean)
  );
  assert.deepEqual(bad, []);
  const before = await label(page);
  await page.locator('#alts .alt-card .mini').nth(1).click({ force: true }); // a tap on the drawing is a tap on its card: it selects that alternative, nothing else
  await page.waitForFunction((l) => document.getElementById('altLabel').textContent !== l, before);
  assert.equal(await page.locator('dialog[open], #pop:popover-open').count(), 0, 'no details open from a miniature');
});

test('desktop: a year plan puts the year totals on the cards, and a semester switch redraws them without an error', async (t) => {
  const page = await visit(t, 'desktop', { ...DONE, ...OPEN, 'afeka-sched-v1': JSON.stringify({ ...STUDENT, scope: 'year' }) });
  await weekReady(page);
  await page.waitForFunction(() => document.getElementById('board')?.getAttribute('aria-busy') === 'false', null, { timeout: 30000 });
  const cards = page.locator('#alts .alt-card');
  await cards.first().waitFor();
  const head = async () => (await cards.first().locator('b').textContent()) ?? '';
  const total = /בשנה: (\d+) נ״ז/.exec(await head());
  assert.ok(total && Number(total[1]) > 0, `the year total is a number: ${await head()}`);
  assert.match((await cards.first().locator('small').textContent()) ?? '', /בסמסטר א׳/, 'the shown semester is A');
  await page.locator('label:has(input[name="sem"][value="ב"])').first().click();
  await page.waitForFunction(() => /בסמסטר ב׳/.test(document.querySelector('#alts .alt-card small')?.textContent ?? ''));
  assert.equal(/בשנה: (\d+) נ״ז/.exec(await head())?.[1], total[1], 'the year total does not change with the semester shown');
  assert.ok((await cards.first().locator('.mini em').count()) > 0, 'semester B draws meetings');
});

test('the board bar holds the switcher and a share button that gives the same link as before (build mode only)', async (t) => {
  const page = await visit(t, 'phone', DONE);
  await weekReady(page);
  assert.equal(await page.locator('.a-bar #switcher').isVisible(), true);
  await page.locator('.a-bar [data-act="share"]').click();
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor(); // the clipboard is stubbed to refuse: the link comes up as text to copy by hand
  const link1 = await dlg.locator('textarea').first().inputValue();
  assert.match(link1, /#f=/);
  await dlg.getByRole('button', { name: 'סגור' }).click();
  await dlg.waitFor({ state: 'detached' });
  const was = await label(page);
  await page.keyboard.press('ArrowLeft'); // the next alternative (the arrows and the swipe agree)
  await page.waitForFunction((l) => document.getElementById('altLabel').textContent !== l, was);
  await page.locator('.a-bar [data-act="share"]').click();
  await dlg.waitFor();
  assert.notEqual(await dlg.locator('textarea').first().inputValue(), link1, 'the link carries the shown alternative');
  await dlg.getByRole('button', { name: 'סגור' }).click();
  await dlg.waitFor({ state: 'detached' });
  await page.locator('.a-top .modes a[data-mode="edit"]').click();
  await page.locator('#edit').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.a-bar').isVisible(), false, 'no build share button over the edit page');
});

test('phone: a swipe on the week moves to the next alternative, the other way back; a short drag does nothing', async (t) => {
  const page = await visit(t, 'phone', DONE);
  await weekReady(page);
  const first = await label(page);
  const swipe = (dx, dy = 0) =>
    page.evaluate(([x, y]) => {
      const el = document.getElementById('week');
      const fire = (type, cx, cy) => el.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', clientX: cx, clientY: cy, bubbles: true }));
      fire('pointerdown', 200, 400);
      fire('pointerup', 200 + x, 400 + y);
    }, [dx, dy]);
  await swipe(-20);
  assert.equal(await label(page), first, 'a short drag does nothing');
  await swipe(-150);
  await page.waitForFunction((l) => document.getElementById('altLabel').textContent !== l, first);
  const second = await label(page);
  await swipe(150);
  await page.waitForFunction((l) => document.getElementById('altLabel').textContent === l, first);
  assert.notEqual(second, first);
  await swipe(-150, 120); // mostly vertical: a scroll, not a swipe
  assert.equal(await label(page), first);
});

test('320 px: the board bar, the sort and the semester controls fit and stay targets', async (t) => {
  const page = await visit(t, { width: 320, height: 640 }, DONE);
  await weekReady(page);
  await page.locator('#pills .a-details > summary').click(); // below 1080px the sort is inside "פרטים"
  await page.locator('.a-sort-d select').waitFor({ state: 'visible' });
  const m = await page.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect();
    const bar = r('.a-bar'), sort = r('.a-sort-d select'), sw = r('#switcher');
    const ctl = [...document.querySelectorAll('.a-bar button, .a-bar select, .a-bar input, #semtabs label, #semtabs input')]
      .filter((e) => e.checkVisibility()).map((e) => ((b) => [e.id || e.className || e.tagName, b.left, b.right, b.height])(e.closest('label')?.getBoundingClientRect() ?? e.getBoundingClientRect()));
    return { fits: document.documentElement.scrollWidth <= innerWidth, bar: bar && [bar.left, bar.right], sort: sort && [sort.width, sort.height], sw: sw && [sw.left, sw.right, sw.height], ctl };
  });
  assert.equal(m.fits, true);
  assert.ok(m.sw && m.sw[0] >= -0.5 && m.sw[1] <= 320.5, `the switcher is on screen: ${m.sw}`);
  assert.ok(m.ctl.length >= 3, 'the bar has its controls');
  for (const [name, l, r, h] of m.ctl) assert.ok(l >= -0.5 && r <= 320.5 && h >= 43.5, `a control fits and is a target: ${name} ${l} ${r} ${h}`);
  assert.ok(m.bar[0] >= -0.5 && m.bar[1] <= 320.5, `the bar is on screen: ${m.bar}`);
  assert.ok(m.sort[1] >= 43.5, `the sort select is a target: ${m.sort}`);
});

// --- Codex review of Task 4 ---
const synth = (page, steps) =>
  page.evaluate((st) => {
    const el = document.getElementById('week');
    for (const [type, id, x, y] of st) el.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', pointerId: id, isPrimary: id === 1, clientX: x, clientY: y, bubbles: true }));
  }, steps);

test('phone: two fingers, a tool opened mid-gesture, an open details popover and a cancel never move the alternative; the week reserves vertical pan only', async (t) => {
  const page = await visit(t, 'phone', DONE);
  await weekReady(page);
  const first = await label(page);
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('week')).touchAction), 'pan-y pinch-zoom', 'the browser keeps the horizontal gesture for the page');
  await synth(page, [['pointerdown', 1, 200, 400], ['pointerdown', 2, 400, 400], ['pointerup', 1, 200, 400], ['pointerup', 2, 400, 400]]);
  assert.equal(await label(page), first, 'a second finger is a pinch, not a swipe');
  await synth(page, [['pointerdown', 1, 300, 400], ['pointercancel', 1, 300, 400], ['pointerup', 1, 100, 400]]);
  assert.equal(await label(page), first, 'a cancel ends the gesture');
  await synth(page, [['pointerdown', 1, 300, 400]]);
  await page.evaluate(() => (location.hash = '#courses'));
  await page.locator('#panel #courses').waitFor({ state: 'visible' });
  await synth(page, [['pointerup', 1, 100, 400]]);
  assert.equal(await label(page), first, 'a gesture that began before a tool opened is dropped');
  await page.evaluate(() => (location.hash = ''));
  await page.locator('#panel #courses').waitFor({ state: 'hidden' });
  await page.locator('#week .blk').first().click();
  await page.locator('#pop:popover-open').waitFor();
  await synth(page, [['pointerdown', 1, 300, 400], ['pointerup', 1, 100, 400]]);
  assert.equal(await label(page), first, 'the open details popover blocks the swipe, as it blocks the arrow keys');
});

test('desktop: the alternatives column is gone over the edit page, and comes back with the board', async (t) => {
  const page = await visit(t, 'desktop', { ...DONE, ...OPEN });
  await weekReady(page);
  await page.locator('#alts .alt-card').first().waitFor();
  assert.equal(await page.locator('#alts').isVisible(), true);
  await page.locator('.a-top .modes a[data-mode="edit"]').click();
  await page.locator('#edit').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#alts').isVisible(), false, 'no column of build alternatives over the edit page');
  await page.locator('.a-top .modes a[data-mode="build"]').click();
  await page.locator('#alts .alt-card').first().waitFor({ state: 'visible' });
});

test('desktop: the column sticks below the top bar, never under it', async (t) => {
  const page = await visit(t, { width: 1280, height: 600 }, { ...DONE, ...OPEN });
  await weekReady(page);
  await page.locator('#alts .alt-card').first().waitFor();
  const m = await page.evaluate(async () => {
    window.scrollTo(0, 400);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const bar = document.querySelector('.a-top').getBoundingClientRect(), alts = document.getElementById('alts').getBoundingClientRect();
    return { scrolled: scrollY, barBottom: bar.bottom, altsTop: alts.top };
  });
  assert.ok(m.scrolled > 100, 'the page scrolls');
  assert.ok(m.altsTop >= m.barBottom - 0.5, `the column starts at ${m.altsTop}, the top bar ends at ${m.barBottom}`);
});

// ---- phase 1 task 4: the switcher says it is computing ----
// holds the first request for the solver worker until released (edit-a.spec.mjs does the same for the edit worker)
const holdWorker = (page, pattern) => {
  let release, reached, first = true;
  const gate = new Promise((r) => (release = r)), arrived = new Promise((r) => (reached = r));
  page.route(pattern, async (route) => {
    if (first) {
      first = false;
      reached();
      await gate;
    }
    await route.continue();
  });
  return { release, reached: arrived };
};
test('while the first search runs the switcher says it is computing, then shows the first alternative', async (t) => {
  const page = await visit(t, { width: 1280, height: 800 }, DONE);
  await weekReady(page); // the first load settles, then the held run is a new page
  const held = holdWorker(page, '**/solver-worker.js');
  await page.reload(); // the route survives the reload, so the first search of the new page waits at the gate
  await held.reached;
  assert.equal(await page.locator('#altLabel').textContent(), 'מחשב חלופות…');
  held.release();
  await page.waitForFunction(() => /^חלופה 1 מתוך/.test(document.getElementById('altLabel').textContent));
});

test('behind the gate no search runs: the switcher does not stay on "מחשב חלופות…"', async (t) => {
  const page = await visit(t, { width: 1280, height: 800 }, { 'afeka-sched-v1-terms': '2' }); // a first visit: the terms gate is up, nothing is searched
  await page.locator('.gate').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  assert.notEqual(await page.locator('#altLabel').textContent(), 'מחשב חלופות…');
});

// ---- phase 1 task 5: the alternatives column folds to a rail, remembered ----
test('1440px: the alternatives start as a 64px rail, open on one tap, and the choice is remembered', async (t) => {
  const page = await visit(t, { width: 1440, height: 900 }, DONE);
  await page.locator('#alts .rail-n').first().waitFor({ state: 'visible' });
  const total = Number(/מתוך (\d+)/.exec(await page.locator('#altLabel').textContent())[1]);
  assert.ok(total >= 3, 'the test data gives at least three alternatives');
  assert.equal(await page.locator('#alts .rail-n').count(), total, 'one rail button per alternative');
  assert.equal(Math.round((await page.locator('#alts').boundingBox()).width), 64);
  assert.equal((await page.locator('#alts .rail-n[aria-current="true"]').textContent()).trim().replace(/\D+$/, '').slice(0, 1), '1');
  const fold = page.locator('#alts [data-k="alts-fold"]');
  assert.equal(await fold.getAttribute('aria-expanded'), 'false');
  await page.locator('#alts .rail-n').nth(2).click();
  await page.waitForFunction(() => /^חלופה 3 מתוך/.test(document.getElementById('altLabel').textContent));
  assert.equal(await page.locator('#alts .rail-n[aria-current="true"]').count(), 1);
  assert.equal(await page.locator('#alts .rail-n').nth(2).getAttribute('aria-current'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), 'altcard-2', 'focus stays on the picked rail button');
  await fold.click();
  await page.locator('#alts .alt-card').first().waitFor({ state: 'visible' });
  assert.equal(Math.round((await page.locator('#alts').boundingBox()).width), 280);
  assert.equal(await fold.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), 'alts-fold', 'focus stays on the fold button');
  await page.reload();
  await page.locator('#alts .alt-card').first().waitFor({ state: 'visible' }); // remembered open
  await page.locator('#alts [data-k="alts-fold"]').press('Enter');
  await page.locator('#alts .rail-n').first().waitFor({ state: 'visible' }); // folds again by keyboard
});
test('375px: no alternatives column, the switcher stays', async (t) => {
  const page = await visit(t, { width: 375, height: 812 }, DONE);
  await page.locator('#altLabel').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#alts').isVisible(), false);
});
test('1440px: a page whose storage refuses writes still folds and opens (reads and the object itself: test/alts-state.test.mjs)', async (t) => {
  const page = await visit(t, { width: 1440, height: 900 }, DONE);
  await weekReady(page);
  await page.waitForLoadState('networkidle'); // a reload while the first fetches run would abort them
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
  });
  await page.reload();
  await page.locator('#alts [data-k="alts-fold"]').click();
  await page.locator('#alts .alt-card').first().waitFor({ state: 'visible' });
});
test('1440px: a new search that leaves fewer alternatives moves the focus to the switcher, not to the page', async (t) => {
  const page = await visit(t, { width: 1440, height: 900 }, { ...DONE, 'afeka-sched-v1-alts': 'open' });
  const cards = page.locator('#alts .alt-card');
  await cards.first().waitFor({ state: 'visible' });
  const total = await cards.count();
  assert.ok(total >= 3);
  await cards.nth(total - 1).focus();
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), `altcard-${total - 1}`);
  // the search leaves one alternative: the arrows are disabled, so the focus goes to the switcher group itself
  await page.evaluate(async () => {
    const { ui } = await import('./ui-common.js');
    const { renderView } = await import('./ui-view.js');
    const { keepFocus } = await import('./app.js');
    ui.last = { ...ui.last, results: ui.last.results.slice(0, 1) };
    ui.cur = 0;
    keepFocus(renderView);
  });
  const where = await page.evaluate(() => ({ id: document.activeElement?.id, inSwitcher: !!document.activeElement?.closest('#switcher') }));
  assert.ok(where.inSwitcher || where.id === 'switcher', `the focus is on the switcher: ${JSON.stringify(where)}`);
});
test('1440px: a focused rail button that a resize below 1080px hides hands the focus to the switcher', async (t) => {
  const page = await visit(t, { width: 1440, height: 900 }, DONE);
  await page.locator('#alts .rail-n').first().waitFor({ state: 'visible' });
  await page.locator('#alts .rail-n').nth(1).focus();
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForFunction(() => !!document.activeElement?.closest('#switcher') || document.activeElement?.id === 'switcher');
});
