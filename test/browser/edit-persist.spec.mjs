// Saving on the edit page in WebKit (package B of the 2026-11-19 scan): two tabs, the notice on a direct visit, a save that fails,
// the backup link, and a proposal that stops being valid. Synthetic data only (the frozen test data, a made-up schedule).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DONE, visit as visitIn, launch } from './helpers.mjs';

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
const DRAFT = {
  rows: [{ code: '30003', name: 'מבוא לכימיה', type: 'סופי-הרצאה+תרגול', text: 'x', via: 'code', confidence: 'sure', chosen: '273000302', candidates: ['273000302'], meets: [{ day: 4, start: '14:00', end: '15:50' }] }],
  choices: {}, registered: false, sem: 'א'
};
// chemistry may move and Wednesday (ד׳, day 4; Sunday is 1) should be free: every proposal moves chemistry to another day (the same state as edit-proposals.spec)
const state = (over = {}) => ({ v: 1, dataset: DS, registered: false, owned: [], original: BASE, baseline: BASE, movable: ['30003'], goal: { dayOff: 4 }, ...over });
const seed = (over) => ({ ...DONE, 'afeka-sched-v1-edit': JSON.stringify(state(over)) });
const visit = (t, size, s, hash = '#edit/changes') => visitIn(browser, t, size, s, hash);
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1-edit')));
const search = async (page) => {
  await page.locator('[data-ed="search"]').click();
  await page.locator('.prop-nav').waitFor({ timeout: 30000 });
};
const FULL = 'afeka-sched-v1-edit';
// the edit key refuses writes (full or blocked storage); the other keys still save
const blockEditKey = (page) =>
  page.evaluate((key) => {
    window.__realSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === key) throw new DOMException('full', 'QuotaExceededError');
      return window.__realSet.call(this, k, v);
    };
  }, FULL);
const unblockEditKey = (page) => page.evaluate(() => (Storage.prototype.setItem = window.__realSet));

test('desktop: another tab saved the edit state: this tab says so at once, saves nothing, and reload brings the new state', async (t) => {
  const a = await visit(t, 'desktop', seed());
  const b = await a.context().newPage();
  await b.goto(a.url());
  for (const p of [a, b]) await p.locator('[data-ed="fewerGaps"]').waitFor({ timeout: 30000 });
  const note = b.locator('#notice [role="alert"]');
  assert.equal(await note.count(), 0);
  await a.locator('[data-ed="fewerGaps"]').click();
  assert.equal((await saved(a)).goal.fewerGaps, true);
  await note.waitFor({ timeout: 5000 });
  assert.match(await note.innerText(), /בלשונית אחרת/);
  // this tab's copy is old: its edit must not write over the other tab's
  await b.locator('[data-ed-goal="dayOff"]').selectOption('3');
  const s = await saved(b);
  assert.deepEqual([s.goal.fewerGaps, s.goal.dayOff], [true, 4], 'the other tab\'s state is what is stored');
  // and the page does not promise
  await b.evaluate(() => (location.hash = '#edit'));
  await b.locator('[data-saved]').waitFor({ state: 'attached' });
  assert.equal(await b.locator('[data-saved]').isVisible(), false);
  await Promise.all([b.waitForEvent('load'), note.locator('[data-act="reloadPage"]').click()]);
  await b.locator('[data-ed="next"]').waitFor({ timeout: 30000 });
  assert.equal(await note.count(), 0);
  assert.equal(await b.locator('[data-saved]').isVisible(), true);
  await b.evaluate(() => (location.hash = '#edit/changes'));
  assert.equal(await b.locator('[data-ed="fewerGaps"]').getAttribute('aria-pressed'), 'true');
});

test('desktop: a tab that never opened the edit page is not told about another tab\'s edit', async (t) => {
  const a = await visit(t, 'desktop', seed(), '#me');
  const b = await a.context().newPage();
  await b.goto(a.url().split('#')[0] + '#edit/changes');
  await b.locator('[data-ed="fewerGaps"]').waitFor({ timeout: 30000 });
  await a.locator('input[data-chg="pyear"]').first().waitFor({ state: 'attached', timeout: 30000 });
  await b.locator('[data-ed="fewerGaps"]').click();
  await a.waitForTimeout(400);
  assert.equal(await a.locator('#notice [role="alert"]').count(), 0);
});

for (const hash of ['#edit', '#edit/changes'])
  test(`phone: the site notice is drawn on a direct visit to ${hash}`, async (t) => {
    const page = await visit(t, 'phone', seed(), hash);
    await page.locator('#edit .edit-step').waitFor({ timeout: 30000 }); // loaded, so the reload below cuts nothing off
    await page.waitForLoadState('networkidle');
    await page.context().route('**/settings.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ notice: 'הודעת בדיקה מהמפעיל' }) }));
    await page.reload();
    const note = page.locator('#notice [role="alert"]');
    await note.waitFor({ timeout: 30000 });
    assert.match(await note.innerText(), /הודעת בדיקה מהמפעיל/);
    assert.equal(await page.locator('#edit').isVisible(), true);
    assert.equal(await note.isVisible(), true);
    assert.ok((await note.boundingBox()).y < 300, 'at the top of the page');
  });

test('desktop: a failed edit save is told on the edit page and stays told after a good main save; the promise and the saved toast go with it', async (t) => {
  const page = await visit(t, 'desktop', seed({ draft: DRAFT }));
  await search(page);
  const before = await saved(page);
  await blockEditKey(page);
  await page.locator('[data-ed="saveProposal"]').click();
  const note = page.locator('#notice [role="alert"]');
  await note.waitFor({ timeout: 5000 });
  assert.match(await note.innerText(), /לא נשמרים/);
  const toast = page.locator('#toast');
  await page.waitForFunction(() => /\S/.test(document.querySelector('#toast')?.textContent ?? ''));
  assert.doesNotMatch(await toast.textContent(), /נשמרה כמערכת הנוכחית/, 'no success after a failed save');
  assert.match(await toast.textContent(), /רק בדף הזה/);
  assert.deepEqual((await saved(page)).baseline, before.baseline, 'nothing reached the storage');
  await page.evaluate(async () => (await import('./app.js')).save()); // the main key saves fine
  assert.equal(await note.count(), 1, 'a good save of the other key does not hide it');
  await page.evaluate(() => (location.hash = '#edit'));
  await page.locator('[data-saved]').waitFor({ state: 'attached' });
  assert.equal(await page.locator('[data-saved]').isVisible(), false, 'no "כל שינוי נשמר מיד"');
  // the way out: the backup link carries the schedule as the page has it now, without the import draft
  await note.locator('[data-act="backup"]').click();
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  const link = await dlg.locator('textarea').inputValue();
  const r = await page.evaluate(async (l) => (await import('./share.js')).readHash(l.slice(l.indexOf('#')), { year: 2027, semester: 'א' }), link);
  assert.equal(r.type, 'backup');
  assert.equal(r.payload.edit.original.length, 4);
  assert.notDeepEqual(r.payload.edit.baseline, before.baseline, 'the unsaved proposal is in it');
  assert.equal(r.payload.edit.draft, null);
  await page.keyboard.press('Escape');
  // storage works again: the next change saves, and the notice and the promise come back right
  await unblockEditKey(page);
  await page.evaluate(() => (location.hash = '#edit/changes'));
  await page.locator('[data-ed="fewerGaps"]').click();
  await note.waitFor({ state: 'detached', timeout: 5000 });
  assert.equal((await saved(page)).goal.fewerGaps, true);
  await page.evaluate(() => (location.hash = '#edit'));
  await page.locator('[data-saved]').waitFor({ state: 'attached' });
  assert.equal(await page.locator('[data-saved]').isVisible(), true);
});

test('desktop: restoring a backup link brings back the edit state, and an older link leaves the saved one', async (t) => {
  const a = await visit(t, 'desktop', seed({ draft: DRAFT }), '#me');
  await a.locator('input[data-chg="pyear"]').first().waitFor({ state: 'attached', timeout: 30000 });
  const link = await a.evaluate(async () => {
    const { backupLink } = await import('./share.js'), { app } = await import('./app.js'), { backupEdit } = await import('./edit-state.js');
    return backupLink(location.origin + location.pathname, app.state, backupEdit());
  });
  const old = await a.evaluate(async () => {
    const { backupLink } = await import('./share.js'), { app } = await import('./app.js');
    return backupLink(location.origin + location.pathname, app.state);
  });
  // a new device: the same main save, no edit state
  const b = await visitIn(browser, t, 'desktop', { ...DONE }, link.slice(link.indexOf('#')));
  await b.locator('dialog[open] button', { hasText: 'שחזר גיבוי' }).click({ timeout: 30000 }); // the saved state is replaced only on a yes
  await b.waitForFunction(() => localStorage.getItem('afeka-sched-v1-edit') !== null, null, { timeout: 30000 });
  const restored = await saved(b);
  assert.equal(restored.original.length, 4);
  assert.equal(restored.draft, null, 'the import draft is not in a backup');
  await b.evaluate(() => (location.hash = '#edit/changes'));
  await b.locator('[data-ed="fewerGaps"]').waitFor({ timeout: 30000 });
  assert.equal(await b.locator('#editWeek .blk').count() > 0, true, 'the schedule is drawn');
  // an older link (no edit part) restored over a saved schedule leaves it as it was
  const c = await visitIn(browser, t, 'desktop', seed({ draft: DRAFT }), old.slice(old.indexOf('#')));
  await c.locator('dialog[open] button', { hasText: 'שחזר גיבוי' }).click({ timeout: 30000 });
  await c.locator('dialog[open]').waitFor({ state: 'detached', timeout: 5000 });
  assert.equal((await saved(c)).original.length, 4);
  assert.notEqual((await saved(c)).draft, null, 'and so is its draft: nothing of it was touched');
});

test('desktop: a proposal is dropped, with a request to search again, when the record changes before it is saved', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await search(page);
  const before = await saved(page);
  // the student's record changes (here directly: the build page and #me do it through the same state) and nothing redraws the edit page
  await page.evaluate(async () => {
    const { app } = await import('./app.js');
    app.state.name = 'שם אחר';
  });
  await page.locator('[data-ed="saveProposal"]').click();
  assert.match(await page.locator('#edMsg').textContent(), /חפשו הצעות מחדש/);
  assert.equal(await page.locator('.prop-nav').count(), 0, 'the proposals are gone');
  assert.deepEqual(await saved(page), before, 'nothing was saved');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset?.ed), 'search', 'focus did not fall to the page');
  // a new search is for the new record, and shows
  await search(page);
  assert.equal(await page.locator('#edMsg').textContent(), '');
});

test('desktop: a proposal is dropped when the page is drawn again after the record changed', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await search(page);
  await page.evaluate(async () => {
    const { app, refresh } = await import('./app.js');
    app.state.passed = [...app.state.passed, '99999'];
    refresh(); // what #me does when a course is ticked
  });
  await page.locator('[data-ed="search"]').waitFor();
  assert.equal(await page.locator('.prop-nav').count(), 0);
  assert.match(await page.locator('#edMsg').textContent(), /חפשו הצעות מחדש/);
});

test('desktop: a proposal is kept while nothing it was worked out on has changed', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await search(page);
  await page.evaluate(async () => (await import('./app.js')).refresh());
  assert.equal(await page.locator('.prop-nav').count(), 1);
  await page.locator('[data-ed="saveProposal"]').click();
  assert.equal(await page.locator('.prop-nav').count(), 0);
  assert.equal(await page.locator('#edMsg').textContent(), '');
});
