// Phase 4 F: build-tool filtering shares the improve text matcher; no solver changes or result cap.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DONE, launch, visit as visitIn } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
const visit = (t, size) => visitIn(browser, t, size, DONE, '#courses', 'light', false, false, { design: 'a' });
const idle = (page) => page.waitForFunction(() => document.getElementById('board')?.getAttribute('aria-busy') !== 'true', null, { timeout: 60000 });
const groups = (page) => page.locator('#side details[data-key]').evaluateAll((els) => els.map((e) => [e.dataset.key, e.open]));
const ids = (page) => page.locator('#side [data-course-id]:visible').evaluateAll((els) => els.map((e) => e.dataset.courseId));
const ready = async (page) => {
  await page.locator('#courseQuery').waitFor();
  await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
  await idle(page);
  return page.evaluate(async () => {
    const { app } = await import('./app.js');
    const { stripTitle } = await import('./course-search.js');
    const row = [...document.querySelectorAll('#side details[data-key]:not([open]) [data-course-id]')]
      .find((e) => app.data.courses[e.dataset.courseId]?.groups.some((g) => stripTitle(g.lecturer)));
    if (!row) throw new Error('fixture needs a course with a lecturer inside a closed group');
    const id = row.dataset.courseId, c = app.data.courses[id];
    window.__courseRow = row;
    return { id, name: c.name, lecturer: stripTitle(c.groups.find((g) => stripTitle(g.lecturer)).lecturer).split(' ')[0],
      group: row.closest('details[data-key]').dataset.key };
  });
};

for (const size of ['phone', 'desktop'])
  test(`${size}: code, name and lecturer find a row in a closed group, filter in place, announce matches and restore groups`, async (t) => {
    const page = await visit(t, size), pick = await ready(page);
    const input = page.getByRole('searchbox', { name: 'חיפוש קורס: קוד, שם או מרצה', exact: true });
    const before = await groups(page);
    for (const q of [pick.id, pick.name.slice(0, 4), pick.lecturer]) {
      await input.fill(q);
      assert.ok((await ids(page)).includes(pick.id), q);
      assert.equal(await page.locator(`#side details[data-key="${pick.group}"]`).evaluate((e) => e.open), true);
      assert.equal(await page.evaluate(() => window.__courseRow === document.querySelector(`[data-course-id="${window.__courseRow.dataset.courseId}"]`)), true,
        'typing keeps the same row node');
      assert.equal(await page.locator('#courseQueryStatus').textContent(), `${(await ids(page)).length} קורסים`);
      assert.equal(await page.locator('#courseQueryStatus').getAttribute('aria-live'), 'polite');
    }
    await input.fill('קורס_שאינו_קיים_12345');
    assert.deepEqual(await ids(page), []);
    assert.equal(await page.locator('#courseQueryStatus').textContent(), 'אין קורס כזה');
    await input.fill('');
    assert.deepEqual(await groups(page), before, 'clearing restores the initial group choices');
    assert.equal(await input.evaluate((e) => e === document.activeElement), true);
    await page.evaluate(async () => (await import('./app.js')).refresh());
    await idle(page);
    assert.deepEqual(await groups(page), before, 'temporary search expansion never becomes the saved group choice');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  });

test('phone: query, caret and matching groups survive a completed search; Escape clears before the shell', async (t) => {
  const page = await visit(t, 'phone'), pick = await ready(page);
  const before = await groups(page), input = page.locator('#courseQuery');
  await input.fill(pick.id);
  await input.evaluate((e) => { e.focus(); e.setSelectionRange(1, 3, 'backward'); window.__searchField = e; });
  await page.evaluate(async () => {
    (await import('./ui-search.js')).scheduleRun();
  });
  // The stable container stays; a row's node is replaced by the worker's result.
  await page.waitForFunction(() => !window.__courseRow.isConnected, null, { timeout: 60000 });
  await idle(page);
  assert.equal(await input.inputValue(), pick.id);
  assert.deepEqual(await input.evaluate((e) => [e === window.__searchField, e === document.activeElement, e.selectionStart, e.selectionEnd, e.selectionDirection]),
    [true, true, 1, 3, 'backward']);
  assert.ok((await ids(page)).includes(pick.id));
  await page.keyboard.press('Escape');
  assert.equal(await input.inputValue(), '');
  assert.deepEqual(await groups(page), before);
  assert.equal(await page.locator('#panel').isVisible(), true);
  assert.equal(new URL(page.url()).hash, '#courses');
  assert.equal(await input.evaluate((e) => e === document.activeElement), true);
});

test('classic keeps its course tool without a search field or row folds', async (t) => {
  const page = await visitIn(browser, t, 'desktop', DONE, '#courses', 'light', false, false, { design: 'classic' });
  await page.locator('#side article.course').first().waitFor();
  assert.equal(await page.locator('#courseQuery, #side .a-course-more, #side .a-crs').count(), 0);
});
