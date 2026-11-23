// Keyboard focus around the edit page's proposal search (package D.1 of the 2026-11-19 scan, finding 11): the button keeps focus while
// the search runs, and the answer takes it: the proposals' switcher, or the message when nothing was found. The tests start from the
// keyboard (Tab to the button, Enter) and never put focus anywhere themselves, so a focus that falls to <body> shows.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
import { DONE, DESIGN, visit as visitIn, launch } from './helpers.mjs';

// An element outside the edit page that holds focus. Classic: the footer's terms link (WebKit's Tab skips links, so focus goes there directly). A: no footer
// (its links are in ☰ and the information panel), so the ☰ button of the top bar.
const OUTSIDE = DESIGN === 'a' ? '.menu-btn' : '.site-foot a[href="legal.html#terms"]';

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
const DS = { year: 2027, sem: 'א', program: 30, startYear: 2026 };
// found: chemistry may move and Wednesday (ד׳, day 4; Sunday is 1) should be free. nothing: Tuesday (ג׳, day 3) cannot be freed while thermodynamics stays on it.
const state = (over) => ({ v: 1, dataset: DS, registered: false, owned: [], original: BASE, baseline: BASE, movable: ['30003'], goal: { dayOff: 4 }, ...over });
const seed = (over) => ({ ...DONE, 'afeka-sched-v1-edit': JSON.stringify(state(over)) });
const visit = (t, size, s) => visitIn(browser, t, size, s, '#edit/changes');

// Holds the page's first request for the search worker until release(), so a test can look at the page while the search runs.
const holdWorker = (page) => {
  let release, reached, first = true, requests = 0;
  const gate = new Promise((r) => (release = r)), arrived = new Promise((r) => (reached = r));
  page.route('**/edit-worker.js', async (route) => {
    requests++;
    if (first) {
      first = false;
      reached();
      await gate;
    }
    await route.continue();
  });
  return { release, reached: arrived, requests: () => requests };
};
// Tab from the top of the page to the search button, as a keyboard user does.
const tabToSearch = async (page) => {
  for (let i = 0; i < 120; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.dataset?.ed === 'search')) return;
  }
  assert.fail('Tab never reached the search button');
};
// A sampler that writes down where focus is every few milliseconds, so a moment on <body> between two renders shows.
const watchFocus = (page) =>
  page.evaluate(() => {
    window.__focus = [];
    window.__watch = setInterval(() => {
      const a = document.activeElement;
      window.__focus.push(!a || a === document.body ? 'BODY' : a.id || a.dataset.ed || a.className || a.tagName);
    }, 3);
  });
const focusLog = (page) => page.evaluate(() => (clearInterval(window.__watch), window.__focus));

for (const key of ['Enter', 'Space'])
  test(`desktop: keyboard (${key}): the search button keeps focus while it runs, then focus goes to the proposals`, async (t) => {
    const page = await visit(t, 'desktop', seed());
    await page.locator('[data-ed="search"]').waitFor({ timeout: 30000 });
    const held = holdWorker(page);
    await tabToSearch(page);
    await watchFocus(page);
    await page.keyboard.press(key);
    await held.reached;
    const btn = page.locator('[data-ed="search"]');
    assert.equal(await btn.textContent(), 'מחפש…');
    assert.equal(await btn.getAttribute('aria-disabled'), 'true');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.ed), 'search', 'the button still has focus while it runs');
    await page.keyboard.press(key); // pressed again while it runs: nothing new starts
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.ed), 'search');
    held.release();
    await page.locator('.prop-nav').waitFor({ timeout: 30000 });
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('prop-nav')), true, 'the answer has focus');
    await page.waitForTimeout(100);
    assert.equal(held.requests(), 1, 'one search');
    assert.equal((await focusLog(page)).includes('BODY'), false, 'focus never fell to the page');
  });

test('desktop: keyboard: nothing found, focus goes to the message, not to the page', async (t) => {
  const page = await visit(t, 'desktop', seed({ goal: { dayOff: 3 } }));
  await page.locator('[data-ed="search"]').waitFor({ timeout: 30000 });
  await tabToSearch(page);
  await watchFocus(page);
  await page.keyboard.press('Enter');
  await page.locator('#editResults .prop-panel').waitFor({ timeout: 30000 });
  assert.equal(await page.locator('.prop-nav').count(), 0, 'no proposal');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'editNotes', 'the message has focus');
  assert.match(await page.locator('#editNotes').innerText(), /לא נמצאה הצעה|יזוז/);
  await page.waitForTimeout(100);
  assert.equal((await focusLog(page)).includes('BODY'), false, 'focus never fell to the page');
  // and from there the keyboard goes on: Tab leaves the message for the next control
  await page.keyboard.press('Tab');
  assert.notEqual(await page.evaluate(() => document.activeElement === document.body), true);
});

test('desktop: a keyboard user who moved on while the search ran keeps their place when the answer comes', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await page.locator('[data-ed="search"]').waitFor({ timeout: 30000 });
  const held = holdWorker(page);
  await tabToSearch(page);
  await page.keyboard.press('Enter');
  await held.reached;
  const here = () => page.evaluate(() => document.activeElement?.dataset?.ed ?? null);
  // back from the button to the "פחות חלונות" chip (a control the answer's redraw keeps; a lesson block of the old place would be gone)
  for (let i = 0; i < 80 && (await here()) !== 'fewerGaps'; i++) await page.keyboard.press('Shift+Tab');
  const moved = await here();
  assert.equal(moved, 'fewerGaps');
  await watchFocus(page);
  held.release();
  await page.locator('.prop-nav').waitFor({ timeout: 30000 });
  assert.equal(await here(), moved, 'the answer did not take their focus');
  await page.waitForTimeout(100);
  assert.equal((await focusLog(page)).includes('BODY'), false);
});

test('desktop: focus that moved out of the edit page (to the footer) while the search ran stays there', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await page.locator('[data-ed="search"]').waitFor({ timeout: 30000 });
  const held = holdWorker(page);
  await tabToSearch(page);
  await page.keyboard.press('Enter');
  await held.reached;
  // WebKit's Tab skips links, so the move to the footer link is made directly
  await page.evaluate((sel) => document.querySelector(sel).focus(), OUTSIDE);
  held.release();
  await page.locator('.prop-nav').waitFor({ timeout: 30000 });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate((sel) => document.activeElement?.matches(sel), OUTSIDE), true, 'focus stayed outside the edit page');
});

// Counts the page's own scrolls to the answer (scrollIntoView on #editResults): a user who moved on is not taken back up to it.
const countAnswerScrolls = (page) =>
  page.evaluate(() => {
    window.__scrolls = 0;
    const real = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (...a) {
      if (this.id === 'editResults') window.__scrolls++;
      return real.apply(this, a);
    };
  });
for (const [name, moveOn] of [['focus moved out of the edit page (to the footer)', true], ['focus left on the search button', false]])
  test(`phone: ${name}: the page is scrolled to the answer only when focus goes there`, async (t) => {
    const page = await visit(t, 'phone', seed());
    await page.locator('[data-ed="search"]').waitFor({ timeout: 30000 });
    await countAnswerScrolls(page);
    const held = holdWorker(page);
    await page.locator('[data-ed="search"]').click();
    await held.reached;
    if (moveOn) await page.evaluate((sel) => document.querySelector(sel).focus(), OUTSIDE);
    held.release();
    await page.locator('.prop-nav').waitFor({ timeout: 30000 });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__scrolls), moveOn ? 0 : 1);
  });

test('phone: a control that moves in the redraw (the way back to the original goes below the week) is on screen when focus returns to it', async (t) => {
  const page = await visit(t, 'phone', seed());
  await page.locator('[data-ed="search"]').waitFor({ timeout: 30000 });
  const held = holdWorker(page);
  await page.locator('[data-ed="search"]').click();
  await held.reached;
  await page.locator('[data-ed="restoreOriginal"]').focus();
  held.release();
  await page.locator('.prop-nav').waitFor({ timeout: 30000 });
  await page.waitForTimeout(150);
  const r = await page.evaluate(() => {
    const e = document.activeElement.getBoundingClientRect();
    return { focus: document.activeElement.dataset.ed, inEdit: !!document.activeElement.closest('#edit'), top: e.top, bottom: e.bottom, height: innerHeight };
  });
  // classic keeps the way back where it was; design A moved the reset into "עוד" (closed): focus goes to the answer, in the page and on screen
  if (DESIGN === 'a') assert.ok(r.inEdit, `focus stays in the edit page: ${JSON.stringify(r)}`);
  else assert.equal(r.focus, 'restoreOriginal');
  assert.ok(r.top >= 0 && r.bottom <= r.height, `on screen: ${JSON.stringify(r)}`);
});

test('a short window: the focused switcher is on screen when the answer is taller than the window', async (t) => {
  const page = await visit(t, { width: 1280, height: 200 }, seed());
  await page.locator('[data-ed="search"]').waitFor({ timeout: 30000 });
  await page.locator('[data-ed="search"]').scrollIntoViewIfNeeded();
  await page.locator('[data-ed="search"]').click();
  await page.locator('.prop-nav').waitFor({ timeout: 30000 });
  await page.waitForTimeout(100);
  const r = await page.evaluate(() => {
    const e = document.activeElement.getBoundingClientRect();
    return { focus: document.activeElement.className, top: e.top, bottom: e.bottom, height: innerHeight };
  });
  assert.equal(r.focus, 'prop-nav');
  assert.ok(r.top >= 0 && r.bottom <= r.height, `the focused switcher is in the window: ${JSON.stringify(r)}`);
});

test('desktop: a search whose answer is dropped as stale leaves focus on the button and scrolls nowhere', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await page.locator('[data-ed="search"]').waitFor({ timeout: 30000 });
  await countAnswerScrolls(page);
  const held = holdWorker(page);
  await page.locator('[data-ed="search"]').click();
  await held.reached;
  await page.evaluate(async () => {
    (await import('./app.js')).app.state.name = 'שם אחר'; // the record changes while the search runs
  });
  held.release();
  await page.locator('#edMsg').filter({ hasText: 'חפשו הצעות מחדש' }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.prop-nav').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset?.ed), 'search');
  assert.equal(await page.evaluate(() => window.__scrolls), 0);
});

test('desktop: a control of the page is found again in the page, not in the hidden build page that has one like it', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await page.locator('[data-ed="search"]').waitFor({ timeout: 30000 });
  // the build page stays in the document, hidden: give it a control that looks like the thermodynamics tutorial's lesson block
  await page.evaluate(() => {
    const twin = document.createElement('button');
    Object.assign(twin.dataset, { act: 'block', gid: '273011204/1', k: document.querySelector('#editWeek [data-gid="273011204/1"]').dataset.k });
    document.getElementById('week').append(twin);
  });
  const held = holdWorker(page);
  await page.locator('[data-ed="search"]').click();
  await held.reached;
  await page.locator('#editWeek [data-gid="273011204/1"]').focus(); // a lesson that stays where it is in every proposal
  held.release();
  await page.locator('.prop-nav').waitFor({ timeout: 30000 });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => document.activeElement?.closest('#edit') !== null && document.activeElement?.dataset?.gid), '273011204/1');
});

test('desktop: the focused "nothing found" message is announced with its text, not only a generic label', async (t) => {
  const page = await visit(t, 'desktop', seed({ goal: { dayOff: 3 } }));
  await page.locator('[data-ed="search"]').click();
  await page.locator('#editNotes').waitFor({ timeout: 30000 });
  const said = await page.evaluate(() => {
    const el = document.getElementById('editNotes'), d = document.getElementById(el.getAttribute('aria-describedby') ?? '');
    return { name: el.getAttribute('aria-label'), description: d?.textContent ?? null, inside: !!d && el.contains(d) };
  });
  assert.ok(said.name, 'a name');
  assert.match(said.description ?? '', /לא נמצאה הצעה|יזוז/);
  assert.equal(said.inside, true);
});

test('desktop: axe finds nothing on the page with the "nothing found" message focused', async (t) => {
  const page = await visit(t, 'desktop', seed({ goal: { dayOff: 3 } }));
  await page.locator('[data-ed="search"]').click();
  await page.locator('#editResults .prop-panel').waitFor({ timeout: 30000 });
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  assert.deepEqual(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`), []);
});

test('phone: a tap on the search button leaves focus on it while it runs and on the answer after', async (t) => {
  const page = await visit(t, 'phone', seed());
  await page.locator('[data-ed="search"]').waitFor({ timeout: 30000 });
  const held = holdWorker(page);
  await page.locator('[data-ed="search"]').click();
  await held.reached;
  assert.equal(await page.evaluate(() => document.activeElement?.dataset?.ed), 'search');
  held.release();
  await page.locator('.prop-nav').waitFor({ timeout: 30000 });
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('prop-nav')), true);
});
