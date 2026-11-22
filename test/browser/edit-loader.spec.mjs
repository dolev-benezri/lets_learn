// The edit page's first screen: the green "קובץ מערכת" button opens the file chooser at once (inside the tap, with the editor's module held ahead), the
// manual button opens the editor without one. Both designs (DESIGN=a runs design A; classic otherwise). No top-level await in a spec: node:test then hangs
// after the run.
//   Playwright's WebKit reports a chooser even when Safari would refuse it for lack of a recent tap, so the proof that the chooser is asked for inside the
//   tap is the call itself: HTMLInputElement.prototype.click is wrapped, and the wrapper records the event being dispatched when it runs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SITE, DONE, launch, visit as visitIn } from './helpers.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const visit = (t, size, seed = DONE, hash = '#edit') => visitIn(browser, t, size, seed, hash);
const SIZES = { desktop: 'desktop', phone: 'phone' };
// every programmatic input.click(): which input, whether a trusted click event was being dispatched at that moment, whether the input was on screen, and the
// call stack (it must lead back to the tap handler in ui-edit.js, not to a promise continuation: the engine drops the tail-called functions, not that frame)
const spy = (page) =>
  page.evaluate(() => {
    window.__clicks = [];
    const was = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      window.__clicks.push({ id: this.id, event: window.event?.type ?? null, trusted: window.event?.isTrusted ?? null, shown: this.checkVisibility?.() ?? this.offsetParent !== null, stack: new Error().stack ?? '' });
      return was.call(this);
    };
  });
// the first screen drawn and the editor's module taken hold of (renderEdit does it a turn after drawing)
const ready = async (page, button) => {
  await page.locator(button).waitFor({ timeout: 30000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
};
const choosers = (page) => {
  const seen = [];
  page.on('filechooser', (c) => seen.push(c));
  return seen;
};

for (const [name, size] of Object.entries(SIZES)) {
  test(`${name}: the green button asks for the file chooser inside the tap, with the field on screen, and the editor is there on it`, async (t) => {
    const page = await visit(t, size);
    await ready(page, '[data-ed="loadFile"]');
    await spy(page);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10000 }), page.locator('[data-ed="loadFile"]').click()]);
    assert.ok(chooser, 'the chooser opened');
    const clicks = (await page.evaluate(() => window.__clicks)).filter((c) => c.id === 'feFile');
    assert.equal(clicks.length, 1, 'one call');
    const { stack, ...call } = clicks[0];
    assert.deepEqual(call, { id: 'feFile', event: 'click', trusted: true, shown: true }, 'in the dispatch of the trusted tap, on a visible field');
    // the tap's own handler is the document click listener of ui-edit.js that calls ACT_ED[...]: its line must be in the stack (the engine drops the functions
    // that were tail-called from it, not that frame), which a promise continuation never has
    const source = await (await page.request.get(SITE + 'ui-edit.js')).text();
    const line = source.split('\n').findIndex((l) => l.includes('ACT_ED[b.dataset.ed]')) + 1;
    assert.ok(line > 0 && new RegExp(`ui-edit\\.js:${line}:`).test(stack), `the call came down the tap handler (line ${line}): ${stack}`);
    await page.locator('#friendEd[open]').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'feFile', 'and the dialog behind it is on the file field');
  });

  test(`${name}: the manual button opens the editor without a chooser, on its heading as before`, async (t) => {
    const page = await visit(t, size);
    await ready(page, '[data-ed="loadHand"]');
    await spy(page);
    const seen = choosers(page);
    await page.locator('[data-ed="loadHand"]').click();
    await page.locator('#friendEd[open]').waitFor();
    await page.waitForTimeout(1000);
    assert.equal(seen.length, 0, 'no chooser');
    assert.deepEqual((await page.evaluate(() => window.__clicks)).filter((c) => c.id === 'feFile'), [], 'and no call for one');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'feTitle');
  });
}

test('a phone with a schedule already read: the green button still starts on the pane that holds the file field', async (t) => {
  // the editor starts on its grid when a draft exists; asked for a file it must start where the field is, or the focus and the chooser land on a hidden pane
  const L = (course, name, type, group, day, start, end) => ({ course, name, type, group, day, start, end });
  const base = [L('30003', 'מבוא לכימיה', 'סופי-הרצאה+תרגול', '273000302', 4, '14:00', '15:50')];
  const row = { code: '30003', name: 'מבוא לכימיה', type: 'סופי-הרצאה+תרגול', text: '', via: 'code', meets: [{ day: 4, start: '14:00', end: '15:50' }], candidates: ['273000302'], chosen: '273000302', confidence: 'sure' };
  const draft = { rows: [row], choices: {}, registered: false, sem: 'א' };
  const seed = { ...DONE, 'afeka-sched-v1-edit': JSON.stringify({ v: 1, dataset: { year: 2027, sem: 'א', program: 30, startYear: 2026 }, registered: false, owned: [], original: base, baseline: base, movable: [], draft }) };
  const page = await visit(t, 'phone', seed);
  await page.locator('.edit-ways > summary').waitFor({ timeout: 30000 }); // with a schedule read, the ways to load another sit in a closed list
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.locator('.edit-ways > summary').click();
  await page.locator('[data-ed="loadFile"]').click();
  await page.locator('#friendEd[open]').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'feFile', 'the field took the focus');
  assert.equal(await page.locator('#feRoot').getAttribute('data-tab'), 'pick');
  assert.equal(await page.locator('#feFile').isVisible(), true);
});

test('a student with no year yet is told so by the green button and gets neither a chooser nor an editor', async (t) => {
  const page = await visit(t, 'desktop', { ...DONE, 'afeka-sched-v1': JSON.stringify({ v: 1, program: 30, startYear: 2026, programSet: true }) });
  await ready(page, '[data-ed="loadFile"]');
  const seen = choosers(page);
  await page.locator('[data-ed="loadFile"]').click();
  await page.waitForTimeout(1000);
  assert.equal(seen.length, 0);
  assert.equal(await page.locator('#friendEd[open]').count(), 0);
  assert.match(await page.locator('#edWaysMsg').innerText(), /בחרו קודם שנת לימודים/);
});
