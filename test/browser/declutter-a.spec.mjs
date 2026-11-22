// Design A declutter (docs/superpowers/specs/2026-11-22-design-a-declutter.md): what left the board and where it went. Every visit sets { design: 'a' }
// unless a test says classic. No top-level await in a spec: node:test then hangs after the run.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { STUDENT, DONE, launch, visit as visitIn } from './helpers.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const visit = (t, size, seed, hash = '', design = 'a') => visitIn(browser, t, size, seed, hash, 'light', false, false, { design });
const weekReady = (page) => page.locator('#week .blk').first().waitFor({ timeout: 30000 });
const label = (page) => page.locator('#altLabel').textContent();
const SIZES = { desktop: 'desktop', phone: 'phone', 320: { width: 320, height: 640 } };

// ---- step 1: the facts line and "פרטים" ----
for (const [name, size] of Object.entries(SIZES)) {
  test(`${name}: the summary is one plain facts line and a closed "פרטים" whose count is its lines`, async (t) => {
    const page = await visit(t, size, DONE);
    await weekReady(page);
    assert.equal(await page.locator('#pills .pill').count(), 0, 'no chips');
    assert.equal(await page.locator('#pills .pill-info').count(), 0, 'no loose sentences');
    const facts = await page.locator('#pills .a-facts > span').allTextContents();
    assert.match(facts[0], /^\d* ?קורסים?|קורס אחד/, 'the courses first');
    assert.ok(facts.some((f) => /נ״ז$/.test(f)), 'the credits');
    assert.ok(facts.some((f) => /פנוי/.test(f)), 'the free days');
    assert.ok(facts.some((f) => /חלונות|חלון|בלי חלונות/.test(f)), 'the gaps');
    assert.ok(/בחינות|בין בחינות/.test(facts.at(-1)), 'the exam fact is the last fact');
    const lines = await page.locator('#pills .a-det-body p').count();
    assert.match(await page.locator('#pills .a-details > summary').textContent(), new RegExp(`^\\s*פרטים \\(${lines}\\)\\s*$`), 'the summary counts the lines');
    assert.equal(await page.locator('#pills .a-details').evaluate((d) => d.open), false, 'closed by default');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(over <= 0, `no sideways scroll (${over})`);
    const box = await page.locator('#pills .a-details > summary').boundingBox();
    assert.ok(box.height >= 43.5 || size === 'desktop', `the summary is a 44px target (${box.height})`);
  });
}

test('"פרטים": the keyboard opens and closes it, and its state survives the board being drawn again', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await weekReady(page);
  const details = page.locator('#pills .a-details'),
    sum = page.locator('#pills .a-details > summary');
  const next = async () => {
    const was = await label(page);
    await page.locator('#next').click(); // the board is drawn again with another alternative
    await page.waitForFunction((l) => document.getElementById('altLabel').textContent !== l, was);
  };
  await sum.focus();
  await page.keyboard.press('Enter');
  assert.equal(await details.evaluate((d) => d.open), true);
  assert.ok((await page.locator('#pills .a-det-body p').count()) > 0, 'the lines are there');
  await next();
  assert.equal(await details.evaluate((d) => d.open), true, 'still open after another alternative');
  await sum.focus();
  await page.keyboard.press('Space');
  assert.equal(await details.evaluate((d) => d.open), false, 'closed by the keyboard');
  await next();
  assert.equal(await details.evaluate((d) => d.open), false, 'and a closed one stays closed');
});

test('the live region announces the exam fact, and the facts that stay on screen', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await weekReady(page);
  const live = await page.locator('#live').textContent();
  assert.match(live, /חלופה 1 מתוך/);
  assert.match(live, /בחינות: טרם פורסמו/, 'the exam fact left the chips, not the announcement');
  assert.match(live, /נ״ז/);
});

test('classic keeps its chips and its three sentences', async (t) => {
  const page = await visit(t, 'desktop', DONE, '', 'classic');
  await weekReady(page);
  assert.ok((await page.locator('#pills .pill').count()) >= 5, 'the chips');
  assert.equal(await page.locator('#pills .a-details, #pills .a-facts').count(), 0);
  assert.match(await page.locator('#pills').innerText(), /לוח הבחינות טרם פורסם/);
});

// the student whose year plan shows the year chip, the rank and the sentences that moved into "פרטים"
test('a year plan: the year total, the rank and the "best found" sentence are in "פרטים", not in the line', async (t) => {
  const page = await visit(t, 'desktop', { ...DONE, 'afeka-sched-v1': JSON.stringify({ ...STUDENT, scope: 'year' }) });
  await weekReady(page);
  await page.waitForFunction(() => document.getElementById('board')?.getAttribute('aria-busy') === 'false', null, { timeout: 30000 });
  const line = await page.locator('#pills .a-facts').innerText();
  assert.doesNotMatch(line, /בכל השנה/);
  const body = await page.locator('#pills .a-det-body').textContent();
  assert.match(body, /בכל השנה: .*נ״ז/);
  assert.match(body, /אלה החלופות הטובות ביותר שנמצאו, לא בהכרח כל האפשרויות/);
});
