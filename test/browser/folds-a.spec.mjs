// Design A's folds keep an open or close through a redraw, including temporary search opens and separate tool keys.
// The toggle event is queued as its own task: a redraw before it lost the tap. Plan: .superpowers/plans/2026-11-27-fold-toggle-race.md, Task 1 (1, 5).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DONE, launch, openMap, visit as visitIn } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
const visit = (t, hash = '') => visitIn(browser, t, 'desktop', DONE, hash, 'light', false, false, { design: 'a' });
const idle = (page) => page.waitForFunction(() => document.getElementById('board')?.getAttribute('aria-busy') === 'false', null, { timeout: 60000 });
const weekReady = async (page) => {
  await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
  await idle(page);
};
const coursesReady = async (page) => {
  await page.locator('#side details[data-key]').first().waitFor({ timeout: 30000 });
  await weekReady(page);
};
const meReady = async (page) => {
  await page.locator('#me details[data-key]').first().waitFor({ timeout: 30000 });
  await idle(page);
};
const prefsReady = (page) => page.locator('#prefs details[data-key]').first().waitFor({ timeout: 30000 });
const friendsReady = async (page) => {
  await prefsReady(page);
  await page.evaluate(() => { location.hash = '#friends'; });
  await page.locator('#friends details[data-key]').first().waitFor({ timeout: 30000 });
};
const faqReady = async (page) => {
  await weekReady(page);
  await page.evaluate(async () => (await import('./ui-drawer.js')).openPanel('faq'));
  await page.locator('#drawer details[data-key^="faq-"]').first().waitFor({ timeout: 30000 });
};
const mapReady = async (page) => {
  await weekReady(page);
  await openMap(page);
  await page.locator('#pmap details.pm-mini').waitFor({ timeout: 30000 });
};

const probe = (page, scope, kind, redraw, mode) =>
  page.evaluate(async ([scope, kind, redraw, mode]) => {
    const { openDetails, ui } = await import('./ui-common.js');
    const run = {
      view: (await import('./ui-view.js')).renderView,
      me: (await import('./ui-me.js')).renderMe,
      prefs: (await import('./ui-drawer.js')).renderPrefs,
      drawer: (await import('./ui-drawer.js')).renderDrawer
    }[redraw];
    const wait = () => new Promise((r) => setTimeout(r, 200));
    const sel = kind === 'group' ? `${scope} details[data-key]` : kind === 'row' ? `${scope} .a-course-more` : `${scope} details.pm-mini`;
    const d0 = [...document.querySelectorAll(sel)].find((d) => d.getClientRects().length && d.dataset.key !== 'plan') ??
      [...document.querySelectorAll(sel)].find((d) => d.getClientRects().length);
    if (!d0) return { error: `no visible fold for ${sel}` };
    const id = d0.dataset.key ?? d0.dataset.course ?? 'pm-mini';
    const find = () =>
      kind === 'group' ? document.querySelector(`${scope} details[data-key="${id}"]`)
        : kind === 'row' ? document.querySelector(`${scope} .a-course-more[data-course="${id}"]`)
          : document.querySelector(sel);
    const stored = () => (kind === 'group' ? openDetails.has(id) : kind === 'row' ? ui.courseOpen[scope === '#me' ? 'me' : 'courses'].has(id) : null);
    const want = mode !== 'close';
    if (find().open === want) { find().querySelector('summary').click(); await wait(); }
    if (find().open === want) return { error: 'setup tap did not toggle' };
    find().querySelector('summary').click(); // queues the toggle event
    run(); // the same task as the tap
    const now = find()?.open;
    await wait();
    return { id, want, now, later: find()?.open, stored: stored() };
  }, [scope, kind, redraw, mode]);

for (const [name, scope, kind, redraw, hash, ready] of [
  ['#side groups keep an open and close through renderView', '#side', 'group', 'view', '#courses', coursesReady],
  ['#side rows keep an open and close through renderView', '#side', 'row', 'view', '#courses', coursesReady],
  ['#me groups keep an open and close through renderMe', '#me', 'group', 'me', '#me', meReady],
  ['#me rows keep an open and close through renderMe', '#me', 'row', 'me', '#me', meReady],
  ['#prefs groups keep an open and close through renderPrefs', '#prefs', 'group', 'prefs', '#prefs', prefsReady],
  ['#friends groups keep an open and close through renderPrefs', '#friends', 'group', 'prefs', '#prefs', friendsReady],
  ['#drawer FAQ keeps an open and close through renderDrawer', '#drawer', 'group', 'drawer', '', faqReady],
  ['#drawer FAQ keeps an open and close through renderView', '#drawer', 'group', 'view', '', faqReady],
  ['#pmap mini keeps an open and close through renderView', '#pmap', 'mini', 'view', '', mapReady]
])
  test(name, async (t) => {
    const page = await visit(t, hash);
    await ready(page);
    for (const mode of ['open', 'close']) {
      const result = await probe(page, scope, kind, redraw, mode);
      assert.equal(result.error, undefined, `${mode}: ${result.error ?? 'fold found'}`);
      assert.equal(result.now, result.want, `${mode}: drawn right after the redraw`);
      assert.equal(result.later, result.want, `${mode}: still so once the queued event has run`);
      if (kind !== 'mini') assert.equal(result.stored, result.want, `${mode}: stored fold state`);
    }
  });

test('#side query opens stay temporary through renderView and clearing', async (t) => {
  const page = await visit(t, '#courses');
  await coursesReady(page);
  const groups = () => page.locator('#side details[data-key]').evaluateAll((els) => els.map((e) => [e.dataset.key, e.open]));
  const before = await groups();
  const pick = await page.evaluate(async () => {
    const { app } = await import('./app.js');
    const { stripTitle } = await import('./course-search.js');
    const row = [...document.querySelectorAll('#side details[data-key]:not([open]) [data-course-id]')]
      .find((e) => app.data.courses[e.dataset.courseId]?.groups.some((g) => stripTitle(g.lecturer)));
    if (!row) throw new Error('fixture needs a course with a lecturer inside a closed group');
    return { id: row.dataset.courseId, group: row.closest('details[data-key]').dataset.key };
  });
  const input = page.locator('#courseQuery');
  await input.fill(pick.id);
  assert.equal(await page.locator(`#side details[data-key="${pick.group}"]`).evaluate((e) => e.open), true, 'the query opens a closed group');
  await page.evaluate(async () => (await import('./ui-view.js')).renderView());
  await input.fill('');
  assert.deepEqual(await groups(), before, 'clearing after a redraw restores the group choices');
});

test('#me Escape closes both course folds through an immediate renderMe', async (t) => {
  const page = await visit(t, '#me');
  await meReady(page);
  const result = await page.evaluate(async () => {
    const { ui } = await import('./ui-common.js');
    const { renderMe } = await import('./ui-me.js');
    const wait = () => new Promise((r) => setTimeout(r, 200));
    const folds = [...document.querySelectorAll('#me .a-course-more')];
    const first = folds.find((fold) => folds.filter((twin) => twin.dataset.course === fold.dataset.course).length === 2);
    if (!first) return { error: 'fixture needs a course with two #me .a-course-more folds' };
    const id = first.dataset.course;
    const twins = () => [...document.querySelectorAll('#me .a-course-more')].filter((fold) => fold.dataset.course === id);
    const openCount = () => twins().filter((fold) => fold.open).length;
    first.querySelector('summary').click();
    await wait();
    if (openCount() !== 2 || !ui.courseOpen.me.has(id)) return { error: 'setup tap did not open and store both course folds' };
    const summary = first.querySelector('summary');
    summary.focus();
    summary.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    renderMe(); // the same task as Escape, before its queued toggle event
    const now = openCount();
    await wait();
    return { now, later: openCount(), stored: ui.courseOpen.me.has(id) };
  });
  assert.equal(result.error, undefined, result.error);
  assert.equal(result.now, 0, 'both course folds close through the immediate redraw');
  assert.equal(result.later, 0, 'both course folds stay closed after the queued toggle event');
  assert.equal(result.stored, false, 'the course stays closed in the stored state');
});

test('#me folds stay open through renderView then renderMe and share no keys with #side', async (t) => {
  const page = await visit(t, '#me');
  await meReady(page);
  const keys = await page.locator('#me details[data-key]:visible').evaluateAll((els) => els.map((e) => e.dataset.key));
  assert.ok(keys.length, 'fixture has visible record folds');
  for (const key of keys) {
    const fold = page.locator(`#me details[data-key="${key}"]`);
    if (await fold.evaluate((e) => e.open)) {
      await fold.locator('summary').first().click();
      await page.waitForTimeout(200);
    }
    await fold.locator('summary').first().click();
    await page.waitForTimeout(200);
    assert.equal(await fold.evaluate((e) => e.open), true, `${key}: opened normally`);
    await page.evaluate(async () => {
      const { renderView } = await import('./ui-view.js');
      const { renderMe } = await import('./ui-me.js');
      renderView();
      renderMe();
    });
    assert.equal(await fold.evaluate((e) => e.open), true, `${key}: still open after both redraws`);
  }
  // The side tool is drawn even while the record is shown.
  const shared = await page.evaluate(() => {
    const keys = (scope) => [...document.querySelectorAll(`${scope} details[data-key]`)].map((e) => e.dataset.key);
    const side = new Set(keys('#side'));
    return keys('#me').filter((key) => side.has(key));
  });
  assert.deepEqual(shared, [], 'record and course folds use separate keys');
});
