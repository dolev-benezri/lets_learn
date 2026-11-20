// Split lecture and tutorial in the edit page (F.2 of the 2026-11-19 scan, the owner's decision): through the build page's own option
// (state.constraints.split) and with its warning, in the proposal and beside a swap option. Frozen real data, a made-up schedule.
// Course 30236 has two lectures, each linked to its own lab: lecture 01 (Sunday 18:00) with lab 01/1 (Sunday 20:00), lecture 02 (Thursday
// 13:00) with lab 02/1 (Thursday 15:00). The student has 02 + 02/1. Two fixed lessons sit on lab 01/1's hour and on lecture 02's hour,
// so no regular option fits; the only way to move the course is lecture 01 with lab 02/1, a split.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DONE, STUDENT, PASSED, visit as visitIn, launch } from './helpers.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const NAME = 'מערכות משובצות מחשב בקרת תהליכים';
const L = (course, name, type, group, day, start, end) => ({ course, name, type, group, day, start, end });
const BASE = [
  L('30236', NAME, 'סופי-הרצאה+מעבדה', '273023602', 5, '13:00', '14:50'), L('30236', NAME, 'מעבדה', '273023602/1', 5, '15:00', '16:50'),
  L('x1', 'חסימה א', 'הרצאה', null, 1, '20:00', '21:50'), L('x2', 'חסימה ב', 'הרצאה', null, 5, '13:00', '14:50')
];
const DS = { year: 2027, sem: 'א', program: 30, startYear: 2026 };
const edit = { v: 1, dataset: DS, registered: false, owned: [], original: BASE, baseline: BASE, movable: ['30236'], goal: {} };
// the prerequisite of 30236 is marked passed; `split` is the build page's option
const seed = (split) => ({
  ...DONE,
  'afeka-sched-v1': JSON.stringify({ ...STUDENT, passed: [...PASSED, '30321'], constraints: { split } }),
  'afeka-sched-v1-edit': JSON.stringify(edit)
});
const visit = (t, size, split) => visitIn(browser, t, size, seed(split), '#edit/changes');
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1-edit')));
const search = async (page) => {
  await page.locator('[data-ed="search"]').click();
  await page.locator('#editResults .prop-nav, #editResults .prop-panel').first().waitFor({ timeout: 30000 });
};
const SPLIT_NOTE = 'חלופה עם הפרדת הרצאה ותרגול (דורש אישור ההכוון האקדמי)';
const SPLIT_TAG = 'מופרד · דורש אישור ההכוון';

for (const size of ['phone', 'desktop'])
  test(`${size}: with the split option on, the one proposal that fits splits the course and carries the build page's warning`, async (t) => {
    const page = await visit(t, size, true);
    await search(page);
    assert.match(await page.locator('.prop-nav .alt-label').textContent(), /^הצעה 1 מתוך 1$/);
    const panel = page.locator('.prop-panel');
    assert.ok((await panel.innerText()).includes(SPLIT_NOTE), 'the note');
    assert.ok((await panel.locator('.split-line').innerText()).includes(`מופרדים: ${NAME}`), 'the line');
    assert.ok((await panel.locator('.pcard .tag.warn').innerText()).includes(SPLIT_TAG), 'the tag on the card');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll');
    // the copied changes name it for the advisor
    await page.locator('[data-ed="copyChanges"]').click(); // the test page has no clipboard: the text dialog shows
    const text = await page.locator('dialog[open] textarea').inputValue();
    assert.ok(text.includes(`מופרדים: ${NAME}`), text);
    assert.ok(text.includes('273023601'), 'the lecture of the other group');
  });

test('desktop: with the option off (the default), the same search finds nothing, as before', async (t) => {
  const page = await visit(t, 'desktop', false);
  await search(page);
  assert.equal(await page.locator('.prop-nav').count(), 0);
  assert.ok((await page.locator('#editNotes').innerText()).length > 0);
});

test('desktop: "קבוצות אחרות" offers the split option with the warning inside its button; picking it stores both groups', async (t) => {
  const page = await visit(t, 'desktop', true);
  await page.locator('#editWeek [data-gid="273023602/1"]').first().click(); // the lab: the lecture's hour is covered by a fixed lesson
  await page.locator('#pop [data-ed="others"]').click();
  const pick = page.locator('#popOthers button[data-ed="pickSwap"]');
  await pick.first().waitFor({ timeout: 30000 });
  assert.equal(await pick.count(), 1);
  assert.ok((await pick.first().innerText()).includes(SPLIT_TAG), 'the warning is in the button');
  await pick.first().click();
  assert.deepEqual((await saved(page)).swaps['30236'].slice().sort(), ['273023601', '273023602/1']);
});

test('desktop: the option can be switched on from the edit page, with the same confirmation; a refusal changes nothing', async (t) => {
  const page = await visit(t, 'desktop', false);
  const box = page.locator('input[data-chg="split"]');
  await box.waitFor({ timeout: 30000 });
  assert.equal(await box.isChecked(), false);
  await box.click(); // the build page's warning comes first
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  assert.ok((await dlg.innerText()).includes('הפרדה בין הרצאה לתרגול עלולה ליצור פער'), 'the long warning');
  await dlg.locator('button', { hasText: 'ביטול' }).click();
  await page.waitForFunction(() => !document.querySelector('input[data-chg="split"]').checked); // the refusal unticks it, a moment after the dialog closes
  assert.equal(await box.isChecked(), false);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1')).constraints.split), false);
  await box.click();
  await dlg.locator('button', { hasText: 'הבנתי, להציג' }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('afeka-sched-v1')).constraints.split === true);
  assert.equal(await page.locator('input[data-chg="split"]').isChecked(), true, 'still ticked after the page is drawn again');
  await search(page);
  assert.match(await page.locator('.prop-nav .alt-label').textContent(), /^הצעה 1 מתוך 1$/);
});

test('desktop: switching the option while a proposal is shown drops it and asks for a new search', async (t) => {
  const page = await visit(t, 'desktop', true);
  await search(page);
  await page.locator('input[data-chg="split"]').click(); // turning it off needs no confirmation
  await page.locator('[data-ed="search"]').waitFor();
  assert.equal(await page.locator('.prop-nav').count(), 0);
  assert.match(await page.locator('#edMsg').textContent(), /חפשו הצעות מחדש/);
});

test('desktop: switching the option off takes back a swap that only the split option allowed, and says so', async (t) => {
  const page = await visit(t, 'desktop', true);
  await page.locator('#editWeek [data-gid="273023602/1"]').first().click();
  await page.locator('#pop [data-ed="others"]').click();
  await page.locator('#popOthers button[data-ed="pickSwap"]').first().click();
  assert.deepEqual((await saved(page)).swaps['30236'].slice().sort(), ['273023601', '273023602/1']);
  await page.locator('input[data-chg="split"]').click(); // off: no confirmation
  await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem('afeka-sched-v1-edit')).swaps).length === 0);
  await page.waitForFunction(() => /\S/.test(document.querySelector('#toast')?.textContent ?? ''));
  const said = await page.locator('#toast').textContent();
  assert.ok(said.includes(NAME), said);
  assert.match(said, /הפרדה/);
  // the week is back to the schedule the student has, and a search is possible again (nothing found, but it works)
  assert.equal(await page.locator('#editWeek [data-gid="273023602"]').count() > 0, true);
});

test('desktop: the checkbox keeps focus after the page is drawn again, also after a visit to the build page that has one like it', async (t) => {
  const page = await visitIn(browser, t, 'desktop', seed(true), '#prefs');
  await page.locator('input[data-chg="split"]').first().waitFor({ state: 'attached', timeout: 30000 });
  await page.evaluate(() => (location.hash = '#edit/changes'));
  const box = page.locator('#edit input[data-chg="split"]');
  await box.waitFor({ timeout: 30000 });
  await box.focus();
  await page.keyboard.press('Space'); // off, no confirmation: the page is drawn again
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('afeka-sched-v1')).constraints.split === false);
  await page.waitForTimeout(100);
  const at = await page.evaluate(() => ({ inEdit: !!document.activeElement?.closest('#edit'), k: document.activeElement?.dataset?.k }));
  assert.deepEqual(at, { inEdit: true, k: 'editSplit' });
});

// Holds the page's first request for the search worker until release(): the answer can then arrive while a dialog is open.
const holdWorker = (page) => {
  let release, reached, first = true;
  const gate = new Promise((r) => (release = r)), arrived = new Promise((r) => (reached = r));
  page.route('**/edit-worker.js', async (route) => {
    if (first) {
      first = false;
      reached();
      await gate;
    }
    await route.continue();
  });
  return { release, reached: arrived };
};
for (const [outcome, button] of [['accepted', 'הבנתי, להציג'], ['cancelled', 'ביטול']])
  test(`desktop: a search that finishes while the split warning is open: ${outcome}, focus is on the checkbox afterwards`, async (t) => {
    const page = await visit(t, 'desktop', false);
    await page.locator('[data-ed="search"]').waitFor({ timeout: 30000 });
    const held = holdWorker(page);
    await page.locator('[data-ed="search"]').click();
    await held.reached;
    await page.locator('input[data-chg="split"]').focus(); // a keyboard user: WebKit does not focus a checkbox on click
    await page.keyboard.press('Space'); // the warning opens
    const dlg = page.locator('dialog[open]');
    await dlg.waitFor();
    held.release();
    await page.waitForTimeout(700); // the answer arrives behind the dialog
    await dlg.locator('button', { hasText: button }).click();
    await page.waitForTimeout(400);
    const at = await page.evaluate(() => ({ k: document.activeElement?.dataset?.k, inEdit: !!document.activeElement?.closest('#edit') }));
    assert.deepEqual(at, { k: 'editSplit', inEdit: true });
    // and the page shows where the search stands: accepted, the record changed so it asks again; cancelled, the answer is there
    if (outcome === 'cancelled') assert.equal(await page.locator('#editResults .prop-panel, #editResults .prop-nav').count() > 0, true);
    else {
      assert.equal(await page.locator('.prop-nav').count(), 0);
      assert.match(await page.locator('#edMsg').textContent(), /חפשו הצעות מחדש/, 'and it says to search again');
    }
  });

test('desktop: a search that finishes while one dialog follows another (as removing a course with two parallel dependents asks): the page waits for both', async (t) => {
  const page = await visit(t, 'desktop', true);
  await page.locator('[data-ed="search"]').waitFor({ timeout: 30000 });
  const held = holdWorker(page);
  await page.locator('[data-ed="search"]').click();
  await held.reached;
  const box = page.locator('input[data-chg="split"]');
  await box.focus();
  await page.evaluate(async () => {
    const { askConfirm } = await import('./ui-dialog.js');
    window.__answers = [];
    askConfirm('שאלה ראשונה', { ok: 'כן', cancel: 'לא' }).then(async (a) => {
      window.__answers.push(a);
      window.__answers.push(await askConfirm('שאלה שנייה', { ok: 'כן', cancel: 'לא' }));
    });
  });
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  held.release();
  await page.waitForTimeout(500);
  await dlg.locator('button', { hasText: 'כן' }).click(); // the second question opens at once
  await page.locator('dialog[open]').filter({ hasText: 'שאלה שנייה' }).waitFor();
  await page.waitForTimeout(500); // the answer must not be drawn under it
  await page.locator('dialog[open] button', { hasText: 'לא' }).click();
  await page.waitForFunction(() => window.__answers?.length === 2);
  await page.waitForTimeout(400);
  const at = await page.evaluate(() => ({ k: document.activeElement?.dataset?.k, inEdit: !!document.activeElement?.closest('#edit') }));
  assert.deepEqual(at, { k: 'editSplit', inEdit: true });
  assert.equal(await page.locator('.prop-nav').count(), 1, 'and the answer is shown once the dialogs are done');
});
