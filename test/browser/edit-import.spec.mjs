// The edit page's way in (Tasks 9-10) in WebKit: the friend editor's edit variant, then step 1 (load and review my schedule).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DONE, STUDENT, visit as visitIn, launch } from './helpers.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});
const visit = (t, size, seed, hash = '') => visitIn(browser, t, size, seed, hash);
const SUMMER = { ...DONE, 'afeka-sched-v1': JSON.stringify({ ...STUDENT, profile: { ...STUDENT.profile, summer: true } }) };

// Opens the editor in its edit variant from the page itself (the edit page's own buttons come with Task 10).
const openEdit = (page, extra = '') =>
  page.evaluate(async (x) => {
    const m = await import('./ui-friend-editor.js');
    window.__saved = null;
    m.openFriendEditor({ mode: 'edit', onSave: (r) => ((window.__saved = r), null), returnFocusId: 'edit', ...JSON.parse(x) });
  }, JSON.stringify(extra || {}));
const pick = async (page, text, gid) => {
  await page.locator('#feCourse').fill(text);
  await page.locator('#feSearch button[type="submit"]').click();
  await page.locator(`[data-fe="toggle"][data-gid="${gid}"]`).click();
};

for (const size of ['phone', 'desktop'])
  test(`${size}: the edit editor has no name field, offers קיץ when planned, and saves the picked groups with rows`, async (t) => {
    const page = await visit(t, size, SUMMER);
    await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
    await openEdit(page);
    await page.locator('#friendEd[open]').waitFor();
    assert.equal(await page.locator('#feName').count(), 0, 'no name field');
    assert.equal(await page.locator('#feTitle').textContent(), 'המערכת שלי');
    const sems = await page.locator('#feTabs input[name="feSem"]').evaluateAll((els) => els.map((e) => e.value));
    assert.deepEqual(sems, ['א', 'ב', 'קיץ']);
    if (size === 'phone') await page.locator('#feTabPick').click();
    await pick(page, '30003', '273000302');
    await page.locator('[data-fe="save"]').click();
    await page.locator('#friendEd[open]').waitFor({ state: 'detached' });
    const saved = await page.evaluate(() => window.__saved);
    assert.deepEqual(saved.groups, ['273000302']);
    assert.equal(saved.sem, 'א');
    assert.equal(saved.rows.length, 1);
    assert.deepEqual([saved.rows[0].chosen, saved.rows[0].confidence, saved.rows[0].via], ['273000302', 'sure', 'code']);
    assert.deepEqual(saved.rows[0].meets, [{ day: 4, start: '14:00', end: '15:50' }]);
  });

test('phone: without a planned summer the edit editor offers only א and ב; an empty save is refused', async (t) => {
  const page = await visit(t, 'phone', DONE);
  await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
  await openEdit(page);
  const sems = await page.locator('#feTabs input[name="feSem"]').evaluateAll((els) => els.map((e) => e.value));
  assert.deepEqual(sems, ['א', 'ב']);
  await page.locator('[data-fe="save"]').click();
  assert.match(await page.locator('#fePickErr').textContent(), /שבץ קבוצה/);
  assert.equal(await page.evaluate(() => window.__saved), null);
});

test('desktop: pasted text without group ids is read as a planner table into rows to review', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
  await openEdit(page);
  await page.locator('#feText').fill(
    [
      '1 30003 מבוא לכימיה סופי-הרצאה+תרגול 2.50 רביעי, 14:00-15:50',
      '1 10336 יישומי מחשב בהנדסה MATLAB סופי-מעבדה 0.50 חמישי, 12:00-15:50',
      '1 99999 קורס שאין לנו סופי-הרצאה 2.00 ראשון, 08:00-09:50'
    ].join('\n')
  );
  await page.locator('[data-fe="find"]').click();
  await page.locator('[data-fe="save"]').click();
  const saved = await page.evaluate(() => window.__saved);
  assert.equal(saved.groups.length, 2);
  assert.deepEqual(saved.rows.map((r) => r.confidence).sort(), ['none', 'sure', 'tie']);
  const none = saved.rows.find((r) => r.confidence === 'none');
  assert.deepEqual([none.code, none.meets], ['99999', [{ day: 1, start: '08:00', end: '09:50' }]]);
});

test('desktop: reopening with rows keeps the groups and their rows; a group picked by hand gets a sure row', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
  await openEdit(page);
  await page.locator('#feText').fill('1 10336 יישומי מחשב בהנדסה MATLAB סופי-מעבדה 0.50 חמישי, 12:00-15:50');
  await page.locator('[data-fe="find"]').click();
  await page.locator('[data-fe="save"]').click();
  const first = await page.evaluate(() => window.__saved);
  assert.equal(first.rows[0].confidence, 'tie');
  await openEdit(page, { groups: first.groups, rows: first.rows, sem: first.sem });
  await pick(page, '30003', '273000302');
  await page.locator('[data-fe="save"]').click();
  const next = await page.evaluate(() => window.__saved);
  assert.deepEqual(next.rows.map((r) => [r.chosen, r.confidence]), [[first.groups[0], 'tie'], ['273000302', 'sure']]);
});
