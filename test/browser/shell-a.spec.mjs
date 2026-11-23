// Design A's frame (web/ui-shell.js): the week board always on screen, one tool open as a panel over it (a bottom sheet on a phone, a side column
// from 1080px), a dock of tools, build / improve as two tabs. Every visit passes { design: 'a' }, so CI tests A even though it runs the specs
// with only BROWSER set. No top-level await in a spec: node:test then hangs after the run.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SITE, SIZES, STUDENT, DONE, DESIGN_KEY, TOUR_SEEN, MODE_BUILD, passFirstRun, launch, visit as visitIn } from './helpers.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const visit = (t, size, seed, hash = '') => visitIn(browser, t, size, seed, hash, 'light', false, false, { design: 'a' });
const weekReady = (page) => page.locator('#week .blk').first().waitFor({ timeout: 30000 });
const hash = (page) => page.evaluate(() => location.hash);
const activeId = (page) => page.evaluate(() => document.activeElement?.id ?? '');
const visible = (page, sel) => page.locator(sel).first().isVisible();
const TOOL_PAGE = { me: 'me', courses: 'courses', wishes: 'prefs', friends: 'friends', out: 'out' };
const dock = (page, tool) => page.locator(`.dock [data-tool="${tool}"]`);
const twoGroups = async () =>
  Object.values(JSON.parse(await readFile(new URL('../fixtures/real/2027-1/30-2026.json', import.meta.url), 'utf8')).courses)
    .flatMap((c) => c.groups.map((g) => g.id))
    .slice(0, 2);

// Phase 4 B: the auto-saving tools do not grow a new submit action; the two action tools have exactly one primary.
for (const size of ['phone', { width: 1920, height: 900 }])
  test(`${typeof size === 'string' ? size : size.width}: tools use one surface, one key and at most one primary`, async (t) => {
    const page = await visit(t, size, DONE);
    await weekReady(page);
    const primary = { me: 0, courses: 0, wishes: 0, friends: 1, out: 1 };
    for (const [tool, id] of Object.entries(TOOL_PAGE)) {
      await dock(page, tool).click();
      await page.locator(`#panel #${id}`).waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.getElementById('board')?.getAttribute('aria-busy') !== 'true');
      const key = page.locator(`#${id} .a-tool-key`);
      assert.equal(await key.count(), 1, `${tool}: one key`);
      assert.equal(await key.isVisible(), true, `${tool}: the key is visible`);
      assert.deepEqual(await key.evaluate((e) => [getComputedStyle(e).fontSize, getComputedStyle(e).fontWeight]), ['21px', '600']);
      const counts = await page.locator(`#${id} .btn.primary`).evaluateAll((els) => els.filter((e) => e.checkVisibility()).length);
      assert.equal(counts, primary[tool], `${tool}: no competing primary actions`);
      const cards = await page.locator(`#${id} :is(.me-card, .me-main, .course, .crs, .frow, .fr-empty)`).evaluateAll((els) =>
        els.filter((e) => e.checkVisibility()).map((e) => {
          const s = getComputedStyle(e);
          return [s.backgroundColor, s.backgroundImage, s.boxShadow, s.borderRadius, s.borderTopWidth];
        }));
      assert.ok(cards.length > 0, `${tool}: sections were checked`);
      for (const card of cards) assert.deepEqual(card, ['rgba(0, 0, 0, 0)', 'none', 'none', '0px', '1px'], tool);
      if (tool === 'me') {
        assert.match(await key.textContent(), /^\d+ מתוך \d+ נ״ז$/);
        assert.match(await key.locator('..').locator('.hint').textContent(), /^הנדרשים עד סוף שנה א׳ · \d+%$/);
        assert.equal(await page.locator('#me [data-act="eraseAll"]').count(), 0);
        assert.equal(await page.locator('#me a[href="legal.html#privacy"]').isVisible(), true, 'privacy notice remains visible');
      } else if (tool === 'courses') assert.match(await key.textContent(), /^\d+ קורסים · [\d.]+ נ״ז בתכנון$/);
      else assert.equal(await key.textContent(), { wishes: 'מה חשוב לך?', friends: 'הוספת חבר', out: 'רשימה להרשמה' }[tool]);
      if (tool === 'wishes') assert.equal(await page.locator('#prefs [data-act="backup"]').count(), 0);
      if (tool === 'out') {
        assert.equal(await page.locator('#out [data-k="outBackup"]').isVisible(), true);
        assert.equal(await page.locator('#out [data-act="copyReg"]').getAttribute('class'), 'btn primary');
        assert.equal(await page.locator('#out [data-act="ics"]').getAttribute('class'), 'btn');
      }
    }
  });

test('delete-all remains in the menu with its confirmation; cancelling preserves the record and returns focus', async (t) => {
  const page = await visit(t, 'phone', DONE, '#me');
  await page.locator('#me [data-k="amirnet"]').waitFor();
  const before = await page.evaluate(() => localStorage.getItem('afeka-sched-v1'));
  await page.locator('.menu-btn').click();
  const erase = page.locator('#drawer [data-act="eraseAll"]');
  await erase.click();
  const confirm = page.locator('dialog[open]').last();
  assert.equal(await confirm.getByRole('button', { name: 'מחק הכול' }).isVisible(), true);
  await confirm.getByRole('button', { name: 'ביטול' }).click();
  assert.equal(await page.evaluate(() => localStorage.getItem('afeka-sched-v1')), before);
  assert.equal(await erase.evaluate((e) => e === document.activeElement), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.menu-btn').evaluate((e) => e === document.activeElement), true);
});

test('classic keeps its record delete-all, preferences backup, course cards and English advice', async (t) => {
  const page = await visitIn(browser, t, 'desktop', DONE, '#me', 'light', false, false, { design: 'classic' });
  await page.locator('#me [data-act="eraseAll"]').waitFor();
  assert.ok((await page.locator('#me .me-card').first().evaluate((e) => getComputedStyle(e).borderRadius)) !== '0px');
  assert.equal(await page.locator('#me .a-help').count(), 0);
  await page.evaluate(() => (location.hash = '#prefs'));
  await page.locator('#prefs [data-k="backup"]').waitFor();
  assert.equal(await page.locator('#prefs .a-tool-key').count(), 0);
  assert.equal(await page.locator('#prefs [data-k="copyMine"]').isVisible(), true, 'classic sharing stays unfolded');
});

for (const size of ['phone', { width: 1920, height: 900 }])
  test(`${typeof size === 'string' ? size : size.width}: friends link fold keeps state, focus and copy of the shown schedule`, async (t) => {
    const page = await visit(t, size, DONE, '#friends');
    await weekReady(page);
    const fold = page.locator('#friends details[data-key="friends-mine"]');
    // The native summary has the same label as first-run step 5.
    const control = fold.locator('summary');
    assert.equal(await fold.evaluate((e) => e.open), false);
    assert.equal(await control.textContent(), 'הקישור שלי');
    assert.equal(await page.locator('#friends [data-k="copyMine"]').isVisible(), false);
    await control.focus();
    await page.keyboard.press('Enter');
    assert.equal(await fold.evaluate((e) => e.open), true);
    assert.equal(await control.evaluate((e) => e === document.activeElement), true);
    await page.evaluate(async () => (await import('./app.js')).refresh());
    assert.equal(await fold.evaluate((e) => e.open), true, 'open after a redraw');
    assert.equal(await control.evaluate((e) => e === document.activeElement), true, 'summary focus survives a redraw');
    await page.locator('#friends [data-k="myName"]').fill('חבר בדיקה');
    await page.keyboard.press('Tab');
    await page.evaluate(() => {
      window.__friendCopies = [];
      navigator.clipboard.writeText = async (text) => { window.__friendCopies.push(text); };
    });
    const copy = page.locator('#friends [data-k="copyMine"]');
    await copy.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__friendCopies.length === 1);
    const shared = await page.evaluate(async () => {
      const { app } = await import('./app.js'), { readHash } = await import('./share.js');
      const { current } = await import('./ui-common.js'), { resGroups } = await import('./ui-grid.js');
      const parsed = await readHash(new URL(window.__friendCopies[0]).hash, app.state);
      return { parsed, groups: resGroups(current()) };
    });
    assert.equal(shared.parsed.type, 'friend');
    assert.equal(shared.parsed.payload.name, 'חבר בדיקה');
    assert.deepEqual(shared.parsed.payload.groups, shared.groups);
    assert.equal('grades' in shared.parsed.payload, false);
    await page.evaluate(async () => (await import('./app.js')).refresh());
    assert.equal(await copy.evaluate((e) => e === document.activeElement), true, 'copy focus survives a redraw');
    assert.equal(await fold.evaluate((e) => e.open), true);
    await control.focus();
    await page.keyboard.press('Space');
    assert.equal(await fold.evaluate((e) => e.open), false);
    await page.evaluate(async () => (await import('./app.js')).refresh());
    assert.equal(await fold.evaluate((e) => e.open), false, 'closed after a redraw');
    assert.equal(await control.evaluate((e) => e === document.activeElement), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  });

for (const width of [320, 1280])
  test(`${width}: menu rows, information header back, legal sentence and new-tab links`, async (t) => {
    const page = await visit(t, { width, height: 900 }, DONE);
    await weekReady(page);
    assert.ok(await page.locator('.a-top .theme-btn').isVisible());
    await page.locator('.menu-btn').click();
    const rows = page.locator('#drawer .a-menu > li button');
    assert.deepEqual(await rows.allTextContents().then((xs) => xs.map((s) => s.trim())),
      ['סיור באתר', 'מפת התקדמות', 'מידע ותנאים', 'מחק את כל הנתונים שלי']);
    for (const row of await rows.all()) {
      const r = await row.boundingBox();
      assert.ok(r && r.height >= 48 && r.width >= 44);
    }
    assert.equal(await page.locator('#drawer .theme-btn').count(), 0);
    await page.locator('#drawer [data-k="menu-info"]').click();
    const back = page.locator('#drawer .dr-head').getByRole('button', { name: 'חזרה לתפריט' });
    assert.ok(await back.isVisible());
    assert.equal(await page.locator('#drawer .dr-actions').count(), 0);
    const legal = await page.evaluate(async () => (await import('./ui-text.js')).LEGAL_LINE);
    assert.equal((await page.locator('#drawer').innerText()).split(legal).length - 1, 1);
    assert.equal((await page.locator('#drawer .info-sec').first().innerText()).split('אינו הרשמה').length - 1, 1);
    for (const link of await page.locator('#drawer .info-links a').all()) {
      assert.equal(await link.getAttribute('target'), '_blank');
      assert.equal(await link.getAttribute('rel'), 'noopener');
      assert.equal(await link.locator('.sr').textContent(), ' (נפתח בלשונית חדשה)');
    }
    const opened = page.waitForEvent('popup');
    await page.locator('#drawer .info-links a').first().click();
    const tab = await opened;
    await tab.waitForLoadState();
    assert.ok(tab.url().includes('legal.html#terms'));
    await tab.close();
    await back.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), 'menu-info');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement?.classList.contains('menu-btn'));
  });

for (const size of ['phone', 'desktop']) {
  test(`${size}: the board stays on screen with a tool open, and each tool opens its own page in the panel`, async (t) => {
    const page = await visit(t, size, DONE, '#me');
    await weekReady(page);
    assert.equal(await visible(page, '#layout'), true, 'the board');
    for (const [tool, id] of Object.entries(TOOL_PAGE)) {
      await page.evaluate((h) => (location.hash = h), { me: '#me', courses: '#courses', wishes: '#prefs', friends: '#friends', out: '#out' }[tool]);
      await page.locator(`#panel #${id}`).waitFor({ state: 'visible' });
      for (const other of Object.values(TOOL_PAGE).filter((p) => p !== id))
        assert.equal(await visible(page, `#${other}`), false, `${tool}: #${other} is hidden`);
      assert.equal(await visible(page, '#week .blk'), true, `${tool}: the week is still on screen`);
    }
  });
}

test('phone: no tool is open at the plain address, and the dock shows which one is', async (t) => {
  const page = await visit(t, 'phone', DONE);
  await weekReady(page);
  assert.equal(await visible(page, '#panel'), false);
  assert.equal(await page.locator('.dock [aria-pressed="true"]').count(), 0);
  await dock(page, 'courses').click();
  await page.locator('#panel #courses').waitFor({ state: 'visible' });
  assert.equal(await hash(page), '#courses');
  assert.equal(await dock(page, 'courses').getAttribute('aria-pressed'), 'true');
  assert.equal(await dock(page, 'me').getAttribute('aria-pressed'), 'false');
});

test('the old #prefs address opens the wishes, with a link to the friends it used to hold', async (t) => {
  const page = await visit(t, 'phone', DONE, '#prefs');
  await page.locator('#panel #prefs').waitFor({ state: 'visible' });
  assert.equal(await visible(page, '#friends'), false);
  await page.locator('#prefs a[href="#friends"]').click();
  await page.locator('#panel #friends').waitFor({ state: 'visible' });
});

test('phone: while the pass is open nothing of the frame is drawn, and a tool cannot be opened from outside it', async (t) => {
  const page = await visit(t, 'phone', null);
  await page.locator('#firstRun .gate').waitFor({ state: 'visible' });
  for (const sel of ['.dock', '#panel', '#aBoard', '#aStrip', '.a-top .modes', '.menu-btn'])
    assert.equal(await visible(page, sel), false, `${sel} is not drawn behind the card`);
  for (const tool of ['courses', 'wishes', 'friends', 'out']) {
    assert.equal(await dock(page, tool).getAttribute('aria-disabled'), 'true', tool);
    await page.evaluate((x) => document.querySelector(`.dock [data-tool="${x}"]`).click(), tool); // a script's click on the hidden button
    assert.equal(await visible(page, '#firstRun .gate'), true, `${tool}: still the gate`);
    assert.notEqual(await hash(page), { courses: '#courses', wishes: '#prefs', friends: '#friends', out: '#out' }[tool], `${tool}: the address did not move`);
  }
});

test('an edit visitor is gated on the terms only: no builder track or year question over the edit page', async (t) => {
  const page = await visit(t, 'phone', { 'afeka-sched-v1-terms': '2' }, '#edit');
  await page.locator('#edit').waitFor({ state: 'visible' });
  assert.equal(await visible(page, '#panel'), false);
  assert.equal(await visible(page, '#layout'), false, 'the build board is not behind it');
});

test('behind the gate the board is inert, and the skip link goes to the gate', async (t) => {
  const page = await visit(t, 'phone', null);
  await page.locator('#firstRun .gate').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.getElementById('aBoard').inert), true);
  await page.evaluate(() => document.querySelector('.skip').click());
  assert.equal(await activeId(page), 'frTitle');
});

test('opening a tool from the plain board closes a drawer that was open (#friends is the plans to the classic router)', async (t) => {
  const page = await visit(t, 'phone', DONE);
  await weekReady(page);
  await page.evaluate(() => document.querySelector('[data-act="panel"][data-panel="reg"]').click());
  await page.locator('#drawer[open]').waitFor();
  await page.evaluate(() => (location.hash = '#friends'));
  await page.locator('#drawer[open]').waitFor({ state: 'detached' });
  await page.locator('#panel #friends').waitFor({ state: 'visible' });
});

test('a tool opened after another one starts at its top', async (t) => {
  const page = await visit(t, 'phone', DONE, '#prefs');
  await page.locator('#panel #prefs').waitFor({ state: 'visible' });
  await page.evaluate(() => (document.getElementById('aPb').scrollTop = 400));
  assert.ok((await page.evaluate(() => document.getElementById('aPb').scrollTop)) > 100, 'the wishes scroll');
  await page.evaluate(() => (location.hash = '#courses'));
  await page.locator('#panel #courses').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.getElementById('aPb').scrollTop), 0);
});

test('the panels follow the board bar and the dock in the DOM order, which is the Tab order: top bar, board bar, dock, panel', async (t) => {
  const page = await visit(t, 'phone', DONE, '#courses');
  await page.locator('#panel #courses').waitFor({ state: 'visible' });
  const order = await page.evaluate(() => {
    const at = (sel) => document.querySelector(sel);
    const before = (a, b) => !!(at(a).compareDocumentPosition(at(b)) & Node.DOCUMENT_POSITION_FOLLOWING);
    return [before('.a-top .modes a', '#prev'), before('#prev', '.dock button'), before('.dock button', '#panel')];
  });
  assert.deepEqual(order, [true, true, true]);
});

test('phone: Escape closes the sheet and focus returns to the dock button that opened it', async (t) => {
  const page = await visit(t, 'phone', DONE);
  await weekReady(page);
  await dock(page, 'wishes').click();
  await page.locator('#panel #prefs').waitFor({ state: 'visible' });
  assert.equal(await activeId(page), 'prefsTitle', 'opening focuses the tool heading');
  await page.keyboard.press('Escape');
  await page.locator('#panel').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.tool), 'wishes', 'back on the dock button');
});

test('phone: the close button leaves no tool in the address and keeps the query', async (t) => {
  const page = await visit(t, 'phone', DONE, '?design=a#courses');
  await page.locator('#panel #courses').waitFor({ state: 'visible' });
  await page.locator('#panel [data-k="closeTool"]').click();
  await page.locator('#panel').waitFor({ state: 'hidden' });
  assert.equal(await hash(page), '');
  assert.match(page.url(), /[?]design=a$/, 'the query stays, the fragment is gone');
});

test('phone: Back closes an open tool', async (t) => {
  const page = await visit(t, 'phone', DONE);
  await weekReady(page);
  await dock(page, 'friends').click();
  await page.locator('#panel #friends').waitFor({ state: 'visible' });
  await page.goBack();
  await page.locator('#panel').waitFor({ state: 'hidden' });
});

test('a tool opened by an address focuses its heading (and Back does too)', async (t) => {
  const page = await visit(t, 'phone', DONE);
  await weekReady(page);
  await page.evaluate(() => (location.hash = '#courses'));
  await page.locator('#panel #courses').waitFor({ state: 'visible' });
  assert.equal(await activeId(page), 'coursesTitle');
});

test('opening and closing a tool keeps the board where it was scrolled', async (t) => {
  const page = await visit(t, 'phone', DONE);
  await weekReady(page);
  await page.evaluate(() => scrollTo(0, 180));
  const y0 = await page.evaluate(() => Math.round(scrollY));
  assert.ok(y0 > 100, 'the page can scroll');
  await dock(page, 'courses').click();
  await page.locator('#panel #courses').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => Math.round(scrollY)), y0, 'opening');
  await page.keyboard.press('Escape');
  await page.locator('#panel').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => Math.round(scrollY)), y0, 'closing');
});

test('deleting a friend by keyboard lands on the friends heading', async (t) => {
  const [G1] = await twoGroups();
  const NOA = { ...STUDENT, friends: [{ name: 'נועה', groups: [G1], weight: 1, active: true }] };
  const page = await visit(t, 'phone', { ...DONE, 'afeka-sched-v1': JSON.stringify(NOA) }, '#friends');
  const remove = page.locator('#friends [data-act="removeFriend"]').first();
  await remove.waitFor();
  await remove.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !document.querySelector('#friends [data-act="removeFriend"]'));
  assert.equal(await activeId(page), 'friendsPageTitle');
});

test('desktop: three columns, the default tool is the courses, no scrim, no close button, Escape leaves the panel alone', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await weekReady(page);
  await page.locator('#panel #courses').waitFor({ state: 'visible' });
  const box = async (sel) => page.locator(sel).first().boundingBox();
  const [panel, board, tabs] = [await box('#panel'), await box('#layout'), await box('.dock')];
  assert.ok(panel.x > board.x, 'the panel is on the right (RTL), the board beside it');
  assert.ok(tabs.y + tabs.height <= panel.y + 1 && Math.abs(tabs.x - panel.x) < 2, 'the dock is the row of tabs on top of the panel column');
  assert.equal(await visible(page, '.a-scrim'), false);
  assert.equal(await visible(page, '#panel [data-act="closeTool"]'), false);
  await page.keyboard.press('Escape');
  assert.equal(await visible(page, '#panel'), true);
});

test('320 px wide: nothing scrolls sideways, on the board and with a tool open', async (t) => {
  const page = await visit(t, { width: 320, height: 640 }, DONE);
  await weekReady(page);
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  assert.equal(await fits(), true, 'the board');
  for (const [tool, h] of [['me', '#me'], ['courses', '#courses'], ['wishes', '#prefs'], ['friends', '#friends'], ['out', '#out']]) {
    await page.evaluate((x) => (location.hash = x), h);
    await page.locator(`#panel #${TOOL_PAGE[tool]}`).waitFor({ state: 'visible' });
    assert.equal(await fits(), true, tool);
    assert.equal(await page.evaluate(() => document.getElementById('aPb').scrollWidth <= document.getElementById('aPb').clientWidth), true, `${tool}: the panel`);
  }
});

test('the alternatives switcher is visible on the board and on every build tool (classic hides it off the plans)', async (t) => {
  const page = await visit(t, 'phone', DONE);
  await weekReady(page);
  for (const h of ['', '#me', '#courses', '#prefs', '#friends', '#out']) {
    await page.evaluate((x) => (location.hash = x), h);
    await page.waitForFunction((x) => location.hash === x, h);
    assert.equal(await visible(page, '#switcher'), true, `${h || 'board'}`);
  }
});

test('the mode tabs: improve opens #edit with the board out of the way, build brings it back; the arrows move alternatives in build mode only', async (t) => {
  const page = await visit(t, 'phone', DONE);
  await weekReady(page);
  const label = () => page.locator('#altLabel').textContent();
  const first = await label();
  assert.equal(await page.locator('.a-top .modes a[data-mode="build"]').getAttribute('aria-current'), 'page');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction((l) => document.getElementById('altLabel').textContent !== l, first);
  await page.keyboard.press('ArrowRight');
  await page.locator('.a-top .modes a[data-mode="edit"]').click();
  await page.locator('#edit').waitFor({ state: 'visible' });
  assert.equal(await hash(page), '#edit');
  assert.equal(await visible(page, '#layout'), false);
  assert.equal(await page.locator('.a-top .modes a[data-mode="edit"]').getAttribute('aria-current'), 'page');
  const inEdit = await label();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await label(), inEdit, 'ArrowLeft: the build alternative does not move behind the edit page');
  await page.keyboard.press('ArrowRight');
  assert.equal(await label(), inEdit, 'ArrowRight');
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.dock .dk')].filter((b) => !b.hidden).map((b) => b.dataset.tool).sort()), ['changes', 'me', 'mine'], 'no build tool in the dock over the edit page');
  assert.equal(await visible(page, '#switcher'), false, 'no build switcher either');
  await page.locator('.a-top .modes a[data-mode="build"]').click();
  await weekReady(page);
  assert.equal(await visible(page, '#layout'), true);
});

test('improve mode fills the header too: the title and the old-data warning are there on a direct #edit visit', async (t) => {
  const page = await visit(t, 'phone', DONE, '#edit');
  await page.locator('#edit').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.getElementById('aStale').textContent.trim().length > 0);
  assert.ok((await page.locator('#title').textContent()).includes('המערכת שלי'));
});

test('the onboarded flag follows the route, not the panel: a bookmark to #courses sets it, #me and #edit do not', async (t) => {
  const SAVED = { 'afeka-sched-v1-terms': '2', 'afeka-sched-v1-entry': '1', 'afeka-sched-v1': JSON.stringify(STUDENT) };
  const flag = (page) => page.evaluate(() => localStorage.getItem('afeka-sched-v1-onboarded'));
  const me = await visit(t, 'phone', SAVED, '#me');
  await me.locator('#panel #me').waitFor({ state: 'visible' });
  assert.equal(await flag(me), null, '#me');
  const edit = await visit(t, 'phone', SAVED, '#edit');
  await edit.locator('#edit').waitFor({ state: 'visible' });
  assert.equal(await flag(edit), null, '#edit');
  const courses = await visit(t, 'phone', SAVED, '#courses');
  await courses.locator('#panel #courses').waitFor({ state: 'visible' });
  assert.equal(await flag(courses), '1', '#courses');
});

test('a drawer that closes because of a navigation does not take the focus back from the new tool', async (t) => {
  const page = await visit(t, 'phone', DONE, '');
  await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
  await page.locator('.menu-btn').click(); // the ☰ menu: the one drawer left under A
  await page.locator('#drawer[open]').waitFor();
  await page.evaluate(() => (location.hash = '#courses'));
  await page.locator('#drawer[open]').waitFor({ state: 'detached' });
  await page.locator('#panel #courses').waitFor({ state: 'visible' });
  await page.waitForTimeout(200); // the drawer's close event is queued: it must not move the focus afterwards
  assert.equal(await activeId(page), 'coursesTitle');
});

test('a failed data load locks the dock, and a tool shows the board\'s retry, never an empty sheet', async (t) => {
  const context = await browser.newContext({ viewport: SIZES.phone, locale: 'he-IL' });
  const page = await context.newPage();
  await context.addInitScript((items) => {
    for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v);
  }, { ...DONE, ...TOUR_SEEN, ...MODE_BUILD, [DESIGN_KEY]: 'a' });
  await page.route('**/data/afeka/2027-*/30-2026.json', (r) => r.abort());
  t.after(() => context.close());
  await page.goto(SITE + '#friends');
  await page.locator('#friends [data-retry]').waitFor({ state: 'visible', timeout: 30000 });
  for (const tool of ['me', 'courses', 'wishes', 'friends', 'out'])
    assert.equal(await dock(page, tool).getAttribute('aria-disabled'), 'true', `${tool} is locked`);
  assert.equal(await visible(page, '#panel #friends [data-retry]'), true);
});

test('a failed data load at 1280: every retry button on screen can be pressed (the board is not inert behind it)', async (t) => {
  const context = await browser.newContext({ viewport: SIZES.desktop, locale: 'he-IL' });
  const page = await context.newPage();
  await context.addInitScript((items) => {
    for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v);
  }, { ...DONE, ...TOUR_SEEN, ...MODE_BUILD, [DESIGN_KEY]: 'a' });
  await page.route('**/data/afeka/2027-*/30-2026.json', (r) => r.abort());
  t.after(() => context.close());
  await page.goto(SITE);
  await page.locator('[data-retry]:visible').first().waitFor({ timeout: 30000 });
  const hits = await page.evaluate(() =>
    [...document.querySelectorAll('[data-retry]')].filter((b) => b.checkVisibility()).map((b) => {
      const r = b.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { inBoard: !!b.closest('#aBoard'), ok: hit === b || b.contains(hit) };
    })
  );
  assert.ok(hits.length >= 2, 'the board and the open tool each say so');
  assert.deepEqual(hits.filter((h) => !h.ok), [], 'every retry button is the element under its own centre');
  assert.equal(await page.evaluate(() => document.getElementById('aBoard').inert), false);
});

// The first run (phase 3): the header keeps the site's name and dark mode only, until the pass ends; ☰, the mode tabs and the strip come back with the board.
for (const size of ['phone', { width: 320, height: 640 }, { width: 1280, height: 800 }])
  test(`${size.width ?? 'phone'}: the header at the first run is the site's name and dark mode; ☰, the mode tabs and the strip return with the board`, async (t) => {
    const page = await visitIn(browser, t, size, null, '', 'light', false, false, { design: 'a' });
    await page.locator('#firstRun .gate').waitFor({ state: 'visible' });
    const shown = (sel) => page.locator(sel).evaluateAll((els) => els.filter((e) => e.checkVisibility() && e.getBoundingClientRect().width > 0).length);
    assert.equal(await shown('#title'), 1, 'the site name');
    assert.equal(await shown('.theme-btn'), 1, 'dark mode');
    for (const sel of ['.menu-btn', '.a-top .modes', '.a-top .modes a', '#aStrip', '.a-unofficial', '.dock'])
      assert.equal(await shown(sel), 0, `${sel} is not drawn`);
    assert.equal(await page.locator('#aStrip').evaluate((e) => e.textContent.trim().length > 0), true, 'the strip keeps its text, only hidden');
    await passFirstRun(page, { year: 1 }); // nothing earlier to pass: the board has a plan to show (a later year's earlier courses are step 2's list)
    await page.locator('#week .blk').first().waitFor({ state: 'attached', timeout: 30000 }); // a phone shows one day at a time
    assert.equal(await shown('.menu-btn'), 1, '☰ is back');
    assert.equal(await shown('.a-top .modes a'), 2, 'the mode tabs are back');
    assert.equal(await shown('#aStrip'), 1, 'the strip is back');
    assert.equal(await shown('#firstRun'), 0, 'the card is gone');
  });

test('a first visitor who arrives at the edit page sees the terms on the whole screen, and after them the edit page with the tabs back, not the track question', async (t) => {
  const page = await visit(t, 'phone', null, '#edit');
  await page.locator('#firstRun [data-k="frTerms"]').waitFor({ state: 'visible' });
  assert.equal(await visible(page, '.a-top .modes a'), false, 'the mode tabs wait for the terms');
  assert.equal(await visible(page, '#edit'), false, 'and the edit page is not behind the card');
  await page.locator('[data-k="frTerms"]').check();
  await page.locator('[data-act="frStart"]').click();
  await page.locator('#edit').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.a-top .modes a[data-mode="edit"]').getAttribute('aria-current'), 'page');
  assert.equal(await page.locator('[data-act="pickTrack"]:visible').count(), 0, 'not the build gate');
});

test('landscape phone at the first run: the card is on screen, centred, with no tabs and no rail', async (t) => {
  const context = await browser.newContext({ viewport: { width: 568, height: 320 }, isMobile: true, hasTouch: true, locale: 'he-IL', colorScheme: 'light' });
  const page = await context.newPage();
  await context.addInitScript((items) => {
    for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v);
  }, { ...TOUR_SEEN, ...MODE_BUILD, [DESIGN_KEY]: 'a' });
  t.after(() => context.close());
  await page.goto(SITE);
  await page.locator('#firstRun .gate').waitFor({ state: 'visible' });
  const m = await page.evaluate(() => {
    const r = document.querySelector('.a-fr-card').getBoundingClientRect();
    const rail = getComputedStyle(document.body).paddingInlineStart;
    return { left: r.left, right: r.right, width: innerWidth, scrollW: document.documentElement.scrollWidth, tabs: !!document.querySelector('.a-top .modes')?.checkVisibility(), rail };
  });
  assert.ok(m.left >= 0 && m.right <= m.width, `the card (${m.left}..${m.right}) is inside the ${m.width}px window`);
  assert.ok(m.scrollW <= m.width, 'no sideways scroll');
  assert.equal(m.tabs, false, 'no tabs');
  assert.equal(m.rail, '0px', 'no rail space beside the card');
});

// ---- Q14: the legal page's top bar and the way back ----
for (const size of [{ width: 320, height: 640 }, { width: 1280, height: 800 }])
  test(`${size.width}px: legal.html has design A's top bar with the way back, nothing scrolls sideways; classic has neither`, async (t) => {
    const page = await visit(t, size, DONE);
    await page.locator('#week .blk').first().waitFor({ state: 'attached', timeout: 30000 });
    await page.waitForLoadState('networkidle'); // every fetch of the app is done: none is cut off by the page change
    await page.goto(SITE + 'legal.html#privacy');
    const bar = page.locator('.a-legal-top');
    await bar.waitFor({ state: 'visible' });
    assert.equal(await bar.locator('a[href="./"]').count(), 1, 'the way back');
    const box = await bar.locator('a[href="./"]').boundingBox();
    assert.ok(box.height >= 43.5 && box.width >= 43.5, `a target: ${Math.round(box.width)}x${Math.round(box.height)}`);
    assert.equal(await page.locator('.legal .back').isVisible(), false, 'its own link is the bar now');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll');
    // an anchor is not left under the sticky bar
    const measure = () =>
      page.evaluate(() => {
        const bar = document.querySelector('.a-legal-top'), sticky = getComputedStyle(bar).position === 'sticky';
        return { top: document.getElementById('privacy').getBoundingClientRect().top, under: sticky ? bar.getBoundingClientRect().bottom : 0 };
      });
    // the fonts arrive after the first scroll to the anchor and move the text (in classic too): go to the anchor again once they are there
    await page.evaluate(async () => {
      await document.fonts.ready;
      location.hash = '#terms';
      location.hash = '#privacy';
    });
    await page.waitForTimeout(400);
    const m = await measure();
    assert.ok(m.top >= m.under - 1 && m.top < 400, `the section starts below the bar (${m.top} / bar ends ${m.under})`);
    await bar.locator('a[href="./"]').click();
    await page.locator('.a-shell').waitFor({ timeout: 30000 });
    await page.locator('#week .blk').first().waitFor({ state: 'attached', timeout: 30000 }); // the app has loaded: nothing is cut off at the end
    await page.waitForLoadState('networkidle');
    // classic: the old page, no bar
    const old = await visitIn(browser, t, size, DONE, '', 'light', false, false, { design: 'classic' });
    await old.locator('#week .blk').first().waitFor({ state: 'attached', timeout: 30000 });
    await old.waitForLoadState('networkidle');
    await old.goto(SITE + 'legal.html');
    assert.equal(await old.locator('.a-legal-top').isVisible(), false);
    assert.equal(await old.locator('.legal .back').isVisible(), true);
  });

test('legal.html with blocked storage: the way back keeps ?design=a', async (t) => {
  const context = await browser.newContext({ viewport: SIZES.desktop, locale: 'he-IL' });
  t.after(() => context.close());
  await context.addInitScript(() => {
    const boom = () => {
      throw new Error('blocked');
    };
    Object.defineProperty(window, 'localStorage', { get: boom });
  });
  const page = await context.newPage();
  await page.goto(SITE + 'legal.html?design=a');
  await page.locator('.a-legal-top').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.a-legal-top a[data-keep-design]').getAttribute('href'), './?design=a');
  await page.locator('.a-legal-top a[data-keep-design]').click();
  await page.locator('.a-shell').waitFor({ timeout: 30000 });
  await page.waitForLoadState('networkidle');
});

// ---- phase 1 task 3: the dock, one-line tabs on a wide screen, centred on a tablet ----
const LABELS = ['המצב שלי', 'קורסים', 'מה חשוב לי', 'חברים', 'להוציא'];
for (const w of [1080, 1280, 1920])
  test(`${w}px: every tool tab shows its whole label on one line, under its icon, inside its tab`, async (t) => {
    const page = await visit(t, { width: w, height: 800 }, DONE, '#courses');
    await page.locator('#panel #courses').waitFor({ state: 'visible' });
    const tabs = await page.evaluate(() =>
      [...document.querySelectorAll('.dock .dk:not([hidden])')].map((b) => {
        const r = b.getBoundingClientRect(), s = b.querySelector('span'), sr = s.getBoundingClientRect(), ir = b.querySelector('svg').getBoundingClientRect();
        return {
          text: s.textContent,
          seen: s.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && sr.width > 0,
          oneLine: sr.height <= parseFloat(getComputedStyle(s).fontSize) * 1.6,
          inside: sr.left >= r.left - 1 && sr.right <= r.right + 1 && s.scrollWidth <= s.clientWidth + 1, // the text itself fits, not only its box
          under: ir.width > 0 && ir.height > 0 && ir.bottom <= sr.top + 1,
          h: r.height
        };
      })
    );
    assert.deepEqual(tabs.map((x) => x.text), LABELS);
    for (const x of tabs) assert.ok(x.seen && x.oneLine && x.inside && x.under && x.h >= 44, JSON.stringify(x));
    const total = await page.evaluate(() => [document.querySelector('.dock').getBoundingClientRect().height, parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--a-dock-h'))]);
    assert.equal(Math.round(total[0]), total[1], `the dock is exactly --a-dock-h tall, so the offsets under it are right: ${total}`);
  });
test('768px, a tool open: the sheet sits above the centred dock and does not overlap it', async (t) => {
  const page = await visit(t, { width: 768, height: 1024 }, DONE, '#courses');
  await page.locator('#panel #courses').waitFor({ state: 'visible' });
  const m = await page.evaluate(() => ({ dock: document.querySelector('.dock').getBoundingClientRect(), panel: document.getElementById('panel').getBoundingClientRect() }));
  assert.ok(m.panel.bottom <= m.dock.top + 0.5, JSON.stringify(m)); // no overlap, whichever engine rounds how
  assert.ok(Math.abs(m.dock.height - 64) <= 0.5, `the dock is exactly --a-dock tall: ${m.dock.height}`);
});
test('768px: the dock is centred and at most 560px wide', async (t) => {
  const page = await visit(t, { width: 768, height: 1024 }, DONE);
  await page.locator('.dock').waitFor({ state: 'visible' });
  const d = await page.evaluate(() => document.querySelector('.dock').getBoundingClientRect());
  assert.ok(d.width <= 560 + 1 && Math.abs(d.left - (768 - d.right)) <= 1, JSON.stringify(d));
});
