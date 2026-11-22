// The edit page's shell in WebKit: the first-entry mode choice, the route, the side menu, and that the build search stays off on #edit.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DONE, DESIGN, visit as visitIn, launch } from './helpers.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

// counts every message posted to a Worker: the build search posts one per run
const COUNT = () => {
  window.__searches = 0;
  const post = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (...a) {
    window.__searches++;
    return post.apply(this, a);
  };
};
const visit = (t, size, seed, hash = '', withModeChoice = false) =>
  visitIn(browser, t, size, seed, hash, 'light', false, withModeChoice);
const searches = (page) => page.evaluate(() => window.__searches);
const acceptTerms = async (page) => {
  await page.locator('[data-chg="termsTick"]').check();
  await page.locator('[data-act="acceptTerms"]').click();
};
const menuLabel = '#edit [data-act="menu"]';

for (const size of ['phone', 'desktop'])
  test(`${size}: a fresh visitor sees both mode cards after the terms; edit lands on #edit with the label`, async (t) => {
    const page = await visit(t, size, null, '', true);
    await acceptTerms(page);
    if (DESIGN === 'a') {
      // A has no mode cards: the two tabs are the choice, and the edit one needs only the terms
      assert.equal(await page.locator('[data-act="pickMode"]').count(), 0, 'no mode cards');
      await page.locator('.a-top .modes a[data-mode="edit"]').click();
      await page.waitForFunction(() => location.hash === '#edit');
      await page.locator('#edit').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.a-top .modes a[data-mode="edit"]').getAttribute('aria-current'), 'page', 'the improve tab is selected');
      assert.equal(await page.locator('.dock').isVisible(), false, 'no dock');
      assert.equal(await page.locator('.mode-label').count(), 0, 'no mode label');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll');
      return;
    }
    const cards = page.locator('[data-act="pickMode"]');
    await cards.first().waitFor();
    assert.deepEqual(await cards.locator('b').allTextContents(), ['לבנות מערכת חדשה', 'לשפר מערכת שכבר יש לי']);
    await cards.nth(1).click();
    await page.waitForFunction(() => location.hash === '#edit');
    await page.locator('#edit').waitFor({ state: 'visible' });
    assert.equal(await page.locator(menuLabel).textContent(), 'עורכים מערכת קיימת · החלפה');
    if (DESIGN !== 'a') assert.equal(await page.locator('nav.steps a').first().isVisible(), false, 'no step bar on the edit page'); // classic only
    assert.equal(await page.locator('.actions').isVisible(), false);
    assert.equal(await page.locator('header [data-act="menu"]').isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll');
  });

test('phone: choosing build goes on to the track question', async (t) => {
  const page = await visit(t, 'phone', null, '', true);
  await acceptTerms(page);
  if (DESIGN !== 'a') await page.locator('[data-act="pickMode"]').first().click(); // A: no mode question, the track comes next
  await page.locator('[data-act="pickTrack"]').first().waitFor();
});

for (const size of ['phone', 'desktop'])
  test(`${size}: a direct load and a reload of #edit show the edit page and run no build search`, async (t) => {
    const page = await visit(t, size, DONE, '#edit');
    await page.locator('#edit').waitFor({ state: 'visible' }); // the first load's fetches are done
    await page.addInitScript(COUNT);
    await page.reload();
    await page.locator('#edit').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#layout').isVisible(), false, 'not the build page');
    await page.waitForTimeout(1000); // the build page's run timer is 300 ms
    assert.equal(await searches(page), 0);
    assert.equal(await page.title(), 'עריכת מערכת קיימת · המערכת שלי · אפקה');
  });

test('desktop: the menu lists the two modes; back on the build page the search works', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#edit');
  await page.locator('#edit').waitFor({ state: 'visible' });
  await page.addInitScript(COUNT);
  await page.reload();
  await page.locator('#edit').waitFor({ state: 'visible' });
  if (DESIGN === 'a') {
    // A: the tabs switch the mode (the ☰ menu has no mode links)
    assert.equal(await page.locator('.mode-label').count(), 0);
    await page.locator('.a-top .modes a[data-mode="build"]').click();
    await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
    assert.equal(await page.evaluate(() => localStorage.getItem('afeka-sched-v1-mode')), 'build');
    assert.equal(await page.locator('#edit').isVisible(), false);
    assert.ok((await searches(page)) >= 1, 'the build search ran once back on the build page');
    await page.locator('.a-top .modes a[data-mode="edit"]').click();
    await page.locator('#edit').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => localStorage.getItem('afeka-sched-v1-mode')), 'edit');
    return;
  }
  await page.locator(menuLabel).click(); // the label opens the same menu as the ☰ button
  const links = page.locator('#drawer a');
  assert.deepEqual(await links.allTextContents(), ['בניית מערכת', 'עריכת מערכת קיימת']);
  assert.equal(await page.locator('#drawer a[aria-current="page"]').textContent(), 'עריכת מערכת קיימת');
  assert.equal(await searches(page), 0);
  await links.first().click();
  await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
  assert.equal(await page.evaluate(() => localStorage.getItem('afeka-sched-v1-mode')), 'build');
  assert.equal(await page.locator('#edit').isVisible(), false);
  assert.ok((await searches(page)) >= 1, 'the build search ran once back on the build page');
  await page.locator('header [data-act="menu"]').click();
  await page.locator('#drawer a[href="#edit"]').click();
  await page.locator('#edit').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => localStorage.getItem('afeka-sched-v1-mode')), 'edit');
});

test('phone: going from the build page to #edit runs no search', async (t) => {
  const page = await visit(t, 'phone', DONE);
  await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
  await page.evaluate(COUNT);
  await page.evaluate(() => (location.hash = '#edit'));
  await page.locator('#edit').waitFor({ state: 'visible' });
  await page.waitForTimeout(1000);
  assert.equal(await searches(page), 0);
});

test('phone: a #f= link still opens the build page', async (t) => {
  const page = await visit(t, 'phone', DONE, '#f=zzz');
  await page.locator('#layout').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#edit').isVisible(), false);
});

test('320 px wide: the mode choice and the edit page do not scroll sideways; the ☰ button is a 44 px target in the same place', async (t) => {
  const page = await visit(t, { width: 320, height: 640 }, null, '', true);
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  await acceptTerms(page);
  const A = DESIGN === 'a'; // A: the tracks come next, and the tab takes the place of the second card
  await page.locator(A ? '[data-act="pickTrack"]' : '[data-act="pickMode"]').first().waitFor();
  assert.equal(await fits(), true, 'the mode choice');
  const menu = page.locator(A ? '.menu-btn' : 'header [data-act="menu"]');
  const box = await menu.boundingBox();
  assert.ok(box.width >= 44 && box.height >= 44, 'tap target');
  if (A) await page.locator('.a-top .modes a[data-mode="edit"]').click();
  else await page.locator('[data-act="pickMode"]').nth(1).click();
  await page.locator('#edit').waitFor({ state: 'visible' });
  assert.equal(await fits(), true, 'the edit page');
  assert.deepEqual(await menu.boundingBox(), box, 'the button does not move between pages');
});

test('phone: a visit with no link opens the remembered mode; a link wins; Back to the build page remembers build', async (t) => {
  const page = await visit(t, 'phone', { ...DONE, 'afeka-sched-v1-mode': 'edit' });
  await page.locator('#edit').waitFor({ state: 'visible' });
  assert.equal(new URL(page.url()).hash, '#edit');
  await page.goto(page.url().replace(/#.*$/, '#me'));
  await page.locator('#me').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#edit').isVisible(), false, 'an explicit link wins over the remembered mode');
  await page.evaluate(() => localStorage.setItem('afeka-sched-v1-mode', 'edit'));
  await page.goto(page.url().replace(/#.*$/, '#edit'));
  await page.locator('#edit').waitFor({ state: 'visible' });
  await page.goBack();
  await page.locator('#edit').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => localStorage.getItem('afeka-sched-v1-mode')), 'build');
});

// A short phone (about what a phone browser leaves between its bars): the reason must show where the finger is.
test('short phone: a load button pressed before the year is chosen says why beside the buttons, in view, and opens nothing', async (t) => {
  const noYear = { ...DONE, 'afeka-sched-v1': JSON.stringify({ ...JSON.parse(DONE['afeka-sched-v1']), profile: { year: null, amirnet: null, specs: [], summer: false } }) };
  const page = await visit(t, { width: 390, height: 640 }, noYear, '#edit');
  for (const way of ['loadFile', 'loadHand']) {
    const btn = page.locator(`[data-ed="${way}"]`);
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
    const msg = page.locator('#edWaysMsg');
    assert.equal(await msg.textContent(), 'בחרו קודם שנת לימודים.', way);
    assert.equal(await page.locator('#friendEd[open]').count(), 0, way);
    // in view, and right above the buttons: no farther than one button's height from the pressed card
    const [m, b] = [await msg.boundingBox(), await page.locator('[data-ed="loadFile"]').boundingBox()];
    assert.ok(m.y >= 0 && m.y + m.height <= 640, `${way}: the message is on screen`);
    assert.ok(b.y - (m.y + m.height) < 24 && b.y > m.y, `${way}: the message sits just above the buttons`);
    assert.equal(await page.evaluate(() => document.activeElement?.name), 'p-year', `${way}: focus goes to the missing answer`);
  }
  // the year answered: the same button opens the loader, and the message is gone
  await page.locator('#editIdentity .seg-opts label').nth(1).click(); // the page is drawn again: a click, not check()
  await page.locator('[data-ed="loadFile"]').click();
  await page.locator('#friendEd[open]').waitFor();
});
