// The edit page's proposals (Task 12) in WebKit: a real search over the frozen data, the before/after, save, copy, restore.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DONE, editWeekView, editToolView, visit as visitIn, launch } from './helpers.mjs';

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
// chemistry may move and Thursday (day 4) should be free: every proposal moves chemistry to another day
const state = (over = {}) => ({ v: 1, dataset: DS, registered: false, owned: [], original: BASE, baseline: BASE, movable: ['30003'], goal: { dayOff: 4 }, ...over });
const seed = (over) => ({ ...DONE, 'afeka-sched-v1-edit': JSON.stringify(state(over)) });
const visit = (t, size, s) => visitIn(browser, t, size, s, '#edit/changes');
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1-edit')));
const search = async (page) => {
  await page.locator('[data-ed="search"]').click();
  await page.locator('.prop-nav').waitFor({ timeout: 30000 });
};

for (const size of ['phone', 'desktop'])
  test(`${size}: a search shows "הצעה 1 מתוך N" with its summary, the old hours struck, the new ones, and the disclaimer`, async (t) => {
    const page = await visit(t, size, seed());
    await search(page);
    assert.match(await page.locator('.prop-nav .alt-label').textContent(), /^הצעה 1 מתוך \d+$/);
    assert.match(await page.locator('.prop-sum').textContent(), /יום ד׳ התפנה/);
    assert.equal(await page.locator('.pcard s').count(), 1);
    assert.match(await page.locator('.pcard .now').textContent(), /קבוצה/);
    assert.ok((await page.locator('.prop-panel').innerText()).includes('הצעה בלבד. ההרשמה נעשית במכללה.'), 'disclaimer');
    const buttons = await page.locator('#edit .edit-step button, #edit .edit-stage button').allInnerTexts(); // A: the stage
    assert.ok(buttons.length > 3, 'there are buttons to check');
    for (const b of buttons) assert.ok(!/החל|הרשמ/.test(b), b);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll');
  });

test('phone: "הראה את היום החדש" appears where the old lesson was and switches to the new day; the old place is "היה כאן"', async (t) => {
  const page = await visit(t, 'phone', seed());
  await search(page);
  await editWeekView(page); // A, a phone: the tool is a sheet over the week
  await page.locator('#editDays [data-day="4"]').click();
  assert.ok((await page.locator('#editWeek .off.ghost').first().textContent()).includes('היה כאן'));
  await editToolView(page);
  await page.locator('[data-ed="newDay"]').click();
  assert.notEqual(await page.locator('#editDays [aria-pressed="true"]').getAttribute('data-day'), '4');
  assert.equal((await page.locator('#editWeek .day.on .blk.changed').count()) > 0, true, 'the new lesson is highlighted');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'editWeekTitle');
  const to = await page.locator('#editDays [aria-pressed="true"]').getAttribute('data-day');
  await editWeekView(page);
  await page.locator('#editDays [data-day="3"]').click(); // a day the change does not touch: the button is still offered
  await editToolView(page);
  await page.locator('[data-ed="newDay"]').click();
  assert.equal(await page.locator('#editDays [aria-pressed="true"]').getAttribute('data-day'), to);
  assert.equal(await page.locator('[data-ed="newDay"]').count(), 0, 'on the new day there is nothing to show');
});

test('desktop: the arrows and the keys move between proposals and the original; keys follow the reading direction', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await search(page);
  const label = () => page.locator('.prop-nav .alt-label').textContent();
  await page.locator('[data-ed="propPrev"]').click();
  assert.equal(await label(), 'המקורית');
  assert.equal(await page.locator('.pcard').count(), 0);
  await page.keyboard.press('ArrowLeft');
  assert.match(await label(), /^הצעה 1 מתוך/);
  await page.keyboard.press('ArrowRight');
  assert.equal(await label(), 'המקורית');
});

test('desktop: save makes the proposal the baseline, keeps the original, and "חזרה למערכת המקורית" brings it back', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await search(page);
  const before = await saved(page);
  await page.locator('[data-ed="saveProposal"]').click();
  const after = await saved(page);
  assert.notDeepEqual(after.baseline, before.baseline);
  assert.deepEqual(after.original, before.original);
  assert.deepEqual([after.movable, after.owned], [[], []]);
  assert.equal(await page.locator('.prop-nav').count(), 0);
  await page.locator('[data-ed="restoreOriginal"]').click();
  assert.deepEqual((await saved(page)).baseline, before.baseline);
  assert.equal(await page.locator('[data-ed="restoreOriginal"]').count(), 0);
});

test('desktop: "העתק שינויים" gives only the changes, with the proposal-only line', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await search(page);
  await page.locator('[data-ed="copyChanges"]').click(); // the test page has no clipboard: the text dialog shows
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  const text = await dlg.locator('textarea').inputValue();
  assert.ok(text.startsWith('להוסיף:') && text.includes('להסיר:') && text.includes('273000302'), text);
  assert.ok(text.endsWith('הצעה בלבד. ההרשמה נעשית במכללה.'));
});

test('desktop: a registered schedule says when the seats were checked', async (t) => {
  const page = await visit(t, 'desktop', seed({ registered: true, owned: ['273000302', '273000302/1', '273011204', '273011204/1'] }));
  await search(page);
  assert.match(await page.locator('.prop-panel').innerText(), /מקומות פנויים נבדקו לפני/);
});

test('desktop: switching proposals slides in over 200 ms, and not at all under reduced motion', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await search(page);
  const anim = () => page.locator('.prop-panel').evaluate((el) => getComputedStyle(el).animationName);
  await page.locator('[data-ed="propNext"]').click();
  assert.equal(await anim(), 'none', 'reduced motion (the tests run with it)');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('[data-ed="propNext"]').click();
  assert.equal(await anim(), 'edit-in');
  assert.equal(await page.locator('.prop-panel').evaluate((el) => getComputedStyle(el).animationDuration), '0.2s');
});

test('phone: a goal alone, with nothing marked movable, finds the course whose move reaches it: every proposal frees the day', async (t) => {
  // Tuesday (ג׳, day 3: Sunday is 1) is thermodynamics' day. Chemistry cannot free it; thermodynamics can, so the tries find proposals that move only it.
  const page = await visit(t, 'phone', seed({ movable: [], goal: { dayOff: 3 } }));
  const before = await saved(page);
  await search(page); // waits for the proposal switcher: a "nothing found" answer would time out here, not pass
  const n = Number((await page.locator('.prop-nav .alt-label').textContent()).match(/מתוך (\d+)/)[1]);
  assert.ok(n >= 1);
  for (let i = 1; i <= n; i++) {
    assert.match(await page.locator('.prop-sum').textContent(), /יום ג׳ התפנה/, `proposal ${i} frees Tuesday`);
    assert.deepEqual(await page.locator('.pcard h4').allTextContents(), ['תרמודינמיקה 1'], `proposal ${i} moves only thermodynamics`);
    assert.equal(await page.locator('.pcard .now').count(), 1);
    if (i < n) await page.locator('[data-ed="propNext"]').click();
  }
  // the tries only look: nothing was saved
  assert.deepEqual(await saved(page), before);
});

test('desktop: registering again in step 1 drops the proposals; proposal 0 is the baseline without pending swaps; restore shows for pending edits', async (t) => {
  const row = (code, name, group, day, start, end) => ({
    code, name, type: 'סופי-הרצאה+תרגול', text: '', via: 'code', meets: [{ day, start, end }], candidates: [group], chosen: group, confidence: 'sure'
  });
  const draft = { rows: [row('30003', 'מבוא לכימיה', '273000302', 4, '14:00', '15:50'), row('30112', 'תרמודינמיקה 1', '273011204', 3, '15:00', '16:50')], choices: {}, registered: false, sem: 'א' };
  const page = await visit(t, 'desktop', seed({ draft }));
  await search(page);
  await page.locator('[data-ed="propPrev"]').click();
  assert.equal(await page.locator('#editWeek .off.ghost').count(), 0, 'proposal 0 draws no ghosts');
  assert.equal(await page.locator('[data-ed="restoreOriginal"]').count(), 1, 'a movable course is a pending edit: restore shows');
  await page.locator('#edit a[href="#edit"]').click(); // the foot's way back (A also has the improve tab with this address)
  await page.locator('[data-ed-reg]').check();
  await page.locator('[data-ed="next"]').click();
  await page.waitForFunction(() => location.hash === '#edit/changes');
  await page.locator('[data-ed="search"]').waitFor();
  assert.equal(await page.locator('.prop-nav').count(), 0, 'the old result is gone');
});
