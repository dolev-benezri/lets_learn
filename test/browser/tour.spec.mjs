// The first-visit tour in WebKit, phone and desktop: it starts after the gate on a first visit, walks the step bar, closes with Escape or "דלג", is not shown again,
// the replay button restarts it, and the plans part starts once on the first alternatives screen. The other specs mark the tour seen (helpers.mjs TOUR_SEEN).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { webkit } from 'playwright';
import { SIZES, DONE, TOUR_SEEN, visit as visitIn } from './helpers.mjs';
import { TOUR_INTRO, TOUR_PLANS, TOUR_KEY } from '../../web/tour.js';

let browser;
before(async () => { browser = await webkit.launch(); });
after(async () => { await browser?.close(); });

const weekReady = (page) => page.locator('#week .blk').first().waitFor({ timeout: 30000 });
const POP = '.driver-popover';
const progress = (page) => page.locator('.driver-popover-progress-text').innerText();
const stored = (page) => page.evaluate((k) => localStorage.getItem(k), TOUR_KEY);
const opened = (page) => page.locator(POP).waitFor({ timeout: 15000 });
const closed = (page) => page.locator(POP).waitFor({ state: 'detached' });
const nothingFor = async (page, ms = 700) => { await page.waitForTimeout(ms); assert.equal(await page.locator(POP).count(), 0, 'no tour'); };
// Next through every stop: returns the text of each, checks the counter and the last button.
async function walk(page) {
  const texts = [];
  for (let i = 1; ; i++) {
    await page.waitForFunction((n) => document.querySelector('.driver-popover-progress-text')?.textContent.startsWith(`${n} מתוך`), i);
    texts.push(await page.locator('.driver-popover-description').innerText());
    const total = Number((await progress(page)).split(' ').pop());
    if (i === total) break;
    await page.locator('.driver-popover-next-btn').click();
  }
  assert.equal(await page.locator('.driver-popover-next-btn').innerText(), 'סיום', 'the last stop ends the tour');
  await page.locator('.driver-popover-next-btn').click();
  await closed(page);
  return texts;
}

for (const size of Object.keys(SIZES)) {
  const visit = (t, seed, hash) => visitIn(browser, t, size, seed, hash, 'light', true);

  test(`${size}: after the gate the tour walks the step bar, never shows twice, and the replay button starts it again`, async (t) => {
    const page = await visit(t);
    await page.locator('.gate').waitFor();
    await page.locator('[data-k="termsTick"]').check();
    await page.locator('[data-act="acceptTerms"]').click();
    await page.locator('[data-act="pickTrack"]').first().waitFor();
    await nothingFor(page, 400); // the step bar is hidden until the track and the year are chosen: the tour waits for it
    await page.locator('[data-act="pickTrack"][value="30"]').click();
    await page.locator('[data-act="pickYear"]').first().waitFor();
    await nothingFor(page, 400);
    await page.locator('[data-act="pickYear"][value="2"]').click();
    await opened(page);
    assert.equal(await page.locator(POP).getAttribute('role'), 'dialog');
    assert.equal(await page.locator(POP).getAttribute('aria-label'), 'סיור באתר');
    assert.equal(await progress(page), `1 מתוך ${TOUR_INTRO.length}`);
    assert.equal(await page.locator('.driver-popover-next-btn').innerText(), 'הבא');
    assert.equal(await page.locator('.driver-popover-prev-btn').innerText(), 'הקודם');
    assert.equal(await page.locator('.driver-popover-close-btn').innerText(), 'דלג');
    await page.waitForFunction(() => document.activeElement.className.includes('driver-popover-next-btn'), null, { timeout: 5000 }); // focus is on "הבא": set a frame after the popover is drawn
    const box = await page.locator(POP).boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= SIZES[size].width && box.y >= 0 && box.y + box.height <= SIZES[size].height, `the popover is on screen: ${JSON.stringify(box)}`);
    assert.deepEqual(await walk(page), TOUR_INTRO.map((s) => s.text), 'every stop, in order, with its text');
    assert.equal(await page.evaluate(() => document.body.classList.contains('touring')), false);
    assert.equal(await stored(page), 'intro');
    assert.notEqual(await page.evaluate(() => document.activeElement.tagName), 'BODY', 'focus is not lost to the page when the tour ends');
    await page.reload();
    await page.locator('#meTitle').waitFor();
    await nothingFor(page);
    await page.locator('#tourBtn').click(); // the replay
    await opened(page);
    assert.equal(await progress(page), `1 מתוך ${TOUR_INTRO.length}`);
    assert.equal(await page.locator('.driver-popover-prev-btn').isDisabled(), true, 'no stop before the first');
  });

  test(`${size}: Escape and "דלג" close the tour, the focus goes back, the arrows follow the reading direction`, async (t) => {
    const page = await visit(t, { ...DONE, ...TOUR_SEEN });
    await weekReady(page);
    const replay = page.locator('#tourBtn');
    await replay.focus();
    await page.keyboard.press('Enter');
    await opened(page);
    await page.waitForFunction(() => document.activeElement.className.includes('driver-popover-next-btn'), null, { timeout: 5000 }); // Enter on the replay button, then focus is in the popover: set a frame after the popover is drawn
    const ring = await page.evaluate(() => { const st = getComputedStyle(document.activeElement); return st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) >= 2; });
    assert.ok(ring, 'the focused button shows a focus ring');
    await page.keyboard.press('Tab'); // Tab stays in the popover: next -> the highlighted button -> "דלג"... never out to the page behind the dimmed layer
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('.driver-popover, #tourBtn')), true, 'Tab keeps focus in the tour');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('ArrowLeft'); // RTL: left is forward
    await page.waitForFunction(() => document.querySelector('.driver-popover-progress-text')?.textContent.startsWith('2 מתוך'));
    assert.match(await page.locator('.driver-popover-description').innerText(), /^המצב שלי/);
    assert.equal(await page.evaluate(() => document.querySelector('#altLabel').textContent.startsWith('חלופה 1 ')), true, 'the arrow did not switch the alternative');
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('.driver-popover-progress-text')?.textContent.startsWith('1 מתוך'));
    await page.keyboard.press('Escape');
    await closed(page);
    assert.equal(await replay.evaluate((b) => b === document.activeElement), true, 'focus is back on the replay button');
    await replay.click();
    await opened(page);
    await page.locator('.driver-popover-close-btn').click();
    await closed(page);
    assert.equal(await page.locator('.driver-popover').count(), 0);
    // A mouse or touch replay: WebKit does not focus a clicked button, so the tour must put the focus back itself.
    await page.click('#tourBtn');
    await opened(page);
    await page.keyboard.press('Escape');
    await closed(page);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'tourBtn', 'focus is on the replay button after a click, then Escape');
  });

  test(`${size}: the plans part waits for step 4 when the results came while another step was open`, async (t) => {
    const page = await visit(t, { ...DONE, [TOUR_KEY]: 'intro' }, '#me');
    await page.locator('#meTitle').waitFor();
    await page.locator('#week .blk').first().waitFor({ state: 'attached', timeout: 30000 }); // the search finished behind step 1
    await nothingFor(page, 500);
    await page.locator('.steps a[data-view="plan"]').click();
    await opened(page);
    assert.equal(await progress(page), `1 מתוך ${TOUR_PLANS.length}`);
  });

  test(`${size}: the plans part starts once, on the first screen with an alternative`, async (t) => {
    const page = await visit(t, { ...DONE, [TOUR_KEY]: 'intro' });
    await weekReady(page);
    await opened(page);
    assert.equal(await progress(page), `1 מתוך ${TOUR_PLANS.length}`);
    assert.deepEqual(await walk(page), TOUR_PLANS.map((s) => s.text));
    assert.equal(await stored(page), 'intro,plans');
    await page.reload();
    await weekReady(page);
    await nothingFor(page);
  });
}
