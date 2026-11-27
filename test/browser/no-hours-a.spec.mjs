import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DONE, STUDENT, launch, visit } from './helpers.mjs';

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });

test('design A: no-hours course is searchable with no planning control or board block', async (t) => {
  const seed = { ...DONE, 'afeka-sched-v1': JSON.stringify({ ...STUDENT, scope: 'א' }) };
  const page = await visit(browser, t, 'desktop', seed, '#courses', 'light', false, false, { design: 'a' });
  await page.locator('#courseQuery').waitFor();
  await page.waitForFunction(async () => !(await import('./ui-common.js')).ui.running, null, { timeout: 60000 });
  // Synthetic build output: independent of the next pull's changing project catalogue.
  await page.evaluate(async () => {
    const { app, refresh } = await import('./app.js');
    const { scheduleRun } = await import('./ui-search.js');
    const { ui } = await import('./ui-common.js');
    const data = app.sem['א'];
    data.courses['40422'] = { name: 'פרויקט בדיקה ללא שעות', credits: 3, prereqs: [], offered: false, noHours: true, groups: [] };
    if (!data.lists[0].courses.includes('40422')) data.lists[0].courses.push('40422');
    app.state.passed = app.state.passed.filter((id) => id !== '40422');
    app.state.choices['40422'] = 'must'; // a stale saved choice cannot make it plannable
    refresh();
    window.__noHoursRun = ui.last;
    scheduleRun();
  });
  await page.evaluate(async () => {
    const { ui } = await import('./ui-common.js'), end = Date.now() + 60000;
    while (!ui.last || ui.last === window.__noHoursRun) {
      if (Date.now() > end) throw new Error('no-hours data did not finish a new search');
      await new Promise((r) => setTimeout(r, 20));
    }
  });
  await page.waitForFunction(() => document.getElementById('board')?.getAttribute('aria-busy') === 'false', null, { timeout: 60000 });
  const input = page.getByRole('searchbox', { name: 'חיפוש קורס: קוד, שם או מרצה', exact: true });
  const row = page.locator('#side [data-course-id="40422"]');
  for (const text of ['40422', 'פרויקט בדיקה']) {
    await input.fill(text);
    assert.equal(await row.isVisible(), true);
    assert.ok((await row.textContent()).includes('נלמד, בלי שעות במערכת'));
    assert.ok(!(await row.textContent()).includes('לא נלמד'));
    assert.equal(await row.locator('[data-chg="mode"], [data-chg="semOf"]').count(), 0);
  }
  assert.equal(await page.locator('#week .blk').filter({ hasText: 'פרויקט בדיקה ללא שעות' }).count(), 0);
  const results = await page.evaluate(async () => {
    const { ui } = await import('./ui-common.js');
    const { resCourses } = await import('./ui-grid.js');
    return ui.last.results.map((r) => resCourses(r));
  });
  assert.ok(results.length > 0, 'the new search has results to check');
  assert.equal(results.some((courses) => courses.includes('40422')), false);
});

test('design A: another semester keeps the no-hours label in a read-only search row', async (t) => {
  const baseline = [
    { course: '30003', name: 'מבוא לכימיה', type: 'סופי-הרצאה+תרגול', group: '273000302', day: 4, start: '14:00', end: '15:50' },
    { course: '30003', name: 'מבוא לכימיה', type: 'תרגול', group: '273000302/1', day: 4, start: '16:00', end: '16:50' }
  ];
  const seed = { ...DONE, 'afeka-sched-v1-edit': JSON.stringify({
    v: 1, dataset: { year: 2027, sem: 'א', program: 30, startYear: 2026 },
    registered: false, owned: [], original: baseline, baseline
  }) };
  const page = await visit(browser, t, 'desktop', seed, '#edit/changes', 'light', false, false, { design: 'a' });
  await page.locator('[data-ed="openSearch"]').waitFor();
  await page.evaluate(async () => {
    const { app } = await import('./app.js');
    app.sem['ב'] = { ...app.sem['א'], semester: 'ב', courses: {
      '40422': { name: 'פרויקט בדיקה ללא שעות', credits: 3, prereqs: [], offered: false, noHours: true, groups: [] }
    } };
  });
  await page.locator('[data-ed="openSearch"]').click();
  await page.locator('[data-ed-s="sem"]').selectOption('ב');
  await page.locator('#csText').fill('40422');
  const row = page.locator('#csResults .cs-course').filter({ hasText: '40422' });
  await row.waitFor();
  const text = await row.innerText();
  assert.ok(text.includes('נלמד, בלי שעות במערכת'), text);
  assert.ok(text.includes('בסמסטר ב׳'), text);
  assert.doesNotMatch(text, /אין קבוצה פתוחה|לא נלמד/);
  assert.equal(await row.locator('[data-ed="csAdd"], [data-ed="csSwap"]').count(), 0);
});
