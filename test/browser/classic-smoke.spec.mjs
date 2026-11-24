// Classic after the flip: the default is design A (Task 11), and ?design=classic keeps the old layout for the two weeks before Task 12 deletes it.
// This small subset is all that runs classic in CI meanwhile (with design-switch.spec.mjs): the step bar, its four steps and the week's alternatives.
// A local DESIGN=classic run still runs every classic-only assertion of the other specs. No top-level await in a spec: node:test then hangs after the run.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SIZES, DONE, launch, openStep, visit as visitIn } from './helpers.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const visit = (t, size, seed = DONE, hash = '') => visitIn(browser, t, size, seed, hash, 'light', false, false, { design: 'classic' });
const weekReady = (page) => page.locator('#week .blk').first().waitFor({ timeout: 30000 });

for (const size of Object.keys(SIZES)) {
  test(`${size}: classic keeps the step bar of four steps, at the plans step`, async (t) => {
    const page = await visit(t, size);
    await weekReady(page);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.design ?? null), null);
    assert.equal(await page.locator('#ashell').count(), 0, 'no A frame');
    assert.equal(await page.locator('nav.steps a').count(), 4);
    assert.equal(await page.locator('.steps a[data-view="plan"][aria-current="step"]').count(), 1);
  });

  test(`${size}: classic walks the four steps by the step bar and back to the week`, async (t) => {
    const page = await visit(t, size);
    await weekReady(page);
    for (const [view, id] of [['me', '#me'], ['courses', '#courses'], ['prefs', '#prefs']]) {
      await openStep(page, view);
      await page.locator(id).waitFor({ state: 'visible' });
      assert.equal(await page.locator('#layout').isVisible(), false, `${view}: one page at a time`);
      assert.equal(await page.locator(`.steps a[data-view="${view}"][aria-current="step"]`).count(), 1);
    }
    await openStep(page, 'plan');
    await page.locator('#layout').waitFor({ state: 'visible' });
    await weekReady(page);
  });
}

test('classic: the header arrows move between the alternatives', async (t) => {
  const page = await visit(t, 'desktop');
  await weekReady(page);
  const label = page.locator('#altLabel');
  await page.waitForFunction(() => /^חלופה 1 /.test(document.getElementById('altLabel').textContent), null, { timeout: 30000 });
  await page.locator('#next').click();
  await page.waitForFunction(() => /^חלופה 2 /.test(document.getElementById('altLabel').textContent));
  assert.match(await label.innerText(), /^חלופה 2 /);
});
