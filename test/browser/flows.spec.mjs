// The main flows in WebKit (iPhone Safari's engine), on a phone and a desktop screen. Run through `npm run test:browser` (run.mjs serves web/ and sets SITE_URL).
// The student is the fictional one of scripts/readme-shots.mjs (mechanical engineering, cohort 2026, year ב׳). The site must never reach outside its own server.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { webkit } from 'playwright';
import { readFile } from 'node:fs/promises';
import { SITE, SIZES, STUDENT, DONE, gradeSheetPdf, visit as visitIn } from './helpers.mjs';

let browser;
before(async () => {
  browser = await webkit.launch();
});
after(async () => {
  await browser?.close();
});

const visit = (t, size, seed, hash) => visitIn(browser, t, size, seed, hash);
const weekReady = (page) => page.locator('#week .blk').first().waitFor({ timeout: 30000 });
const focused = (page) =>
  page.evaluate(() => {
    const e = document.activeElement;
    return e.dataset?.k ?? e.dataset?.act ?? e.getAttribute('href') ?? e.tagName;
  });

for (const size of Object.keys(SIZES)) {
  test(`${size}: terms gate by keyboard, track, year, manual entry, tick a course, an alternative shows`, async (t) => {
    const page = await visit(t, size);
    await page.locator('.gate').waitFor();
    // Tab from the top reaches the checkbox, and once it is ticked (Space) the button; Enter on the button leaves the gate.
    // Playwright's WebKit never puts links in the Tab order (Safari's default), so the two links are only checked to be real links that take focus.
    const seen = new Set();
    for (let i = 0; i < 30 && !seen.has('termsTick'); i++) {
      await page.keyboard.press('Tab');
      seen.add(await focused(page));
    }
    assert.ok(seen.has('termsTick'), `focus order saw ${[...seen]}`);
    assert.ok(await page.locator('[data-act="acceptTerms"]').isDisabled(), 'the button waits for the tick');
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    assert.equal(await focused(page), 'acceptTerms');
    for (const href of ['legal.html#terms', 'legal.html#scope']) {
      const link = page.locator(`.gate-links a[href="${href}"]`);
      await link.focus();
      assert.equal(await focused(page), href);
    }
    await page.locator('[data-act="acceptTerms"]').focus();
    await page.keyboard.press('Enter');
    // Track, then year: focus the tile and press Enter.
    const tile = page.locator('[data-act="pickTrack"]').first();
    await tile.waitFor();
    assert.ok(await page.locator('[data-act="pickTrack"]').count() > 1, 'more than one track');
    await page.locator('[data-act="pickTrack"][value="30"]').focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-act="pickYear"]').first().waitFor();
    await page.locator('[data-act="pickYear"][value="2"]').focus();
    await page.keyboard.press('Enter');
    // The grade-sheet entry screen offers the manual entry.
    const manual = page.getByRole('button', { name: 'הזנה ידנית' });
    await manual.waitFor();
    assert.ok(
      await page
        .getByRole('button', { name: /ייבוא מגליון ציונים/ })
        .first()
        .isVisible()
    );
    await manual.click();
    // Tick a course as passed (a segmented radio label), then step 4.
    const before = await page.locator('.crs[data-st="passed"]').count(); // year ב׳ starts with year א׳ marked
    await page.locator('.crs[data-st="none"] label:has(input[value="passed"])').first().click();
    assert.equal(await page.locator('.crs[data-st="passed"]').count(), before + 1, 'one more course is marked passed');
    await page.locator('nav.steps a[data-view="plan"]').click();
    await weekReady(page);
    assert.match(await page.locator('#altLabel').textContent(), /חלופה 1 מתוך/);
  });
}

for (const size of Object.keys(SIZES)) {
  test(`${size}: split option dialog, cancel and confirm, Escape cancels`, async (t) => {
    const page = await visit(t, size, DONE, '#prefs');
    const split = page.locator('input[data-chg="split"]');
    await split.waitFor({ state: 'attached' });
    const dialog = page.locator('dialog[open]');
    for (const [how, close] of [
      ['Cancel button', () => page.getByRole('button', { name: 'ביטול' }).click()],
      ['Escape', () => page.keyboard.press('Escape')]
    ]) {
      await split.check();
      await dialog.waitFor();
      assert.equal(await dialog.getAttribute('role'), 'alertdialog');
      await close();
      await dialog.waitFor({ state: 'detached' });
      await page
        .waitForFunction(() => !document.querySelector('input[data-chg="split"]').checked, null, { timeout: 3000 })
        .catch(() => assert.fail(`${how} leaves the option on`));
    }
    await split.check();
    await page.getByRole('button', { name: 'הבנתי, להציג' }).click();
    await dialog.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.querySelector('input[data-chg="split"]').checked, null, {
      timeout: 3000
    });
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem('afeka-sched-v1')).constraints.split === true,
      null,
      { timeout: 3000 }
    ); // saved
  });

  test(`${size}: Escape closes the registration panel, the map and the friend editor`, async (t) => {
    const page = await visit(t, size, DONE);
    await weekReady(page);
    await page.locator('[data-act="panel"][data-panel="reg"]').click();
    const drawer = page.locator('#drawer[open]');
    await drawer.waitFor();
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'detached' });
    await page.locator('[data-act="openMap"]').click();
    await page.locator('#pmap[open]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('#pmap[open]').waitFor({ state: 'detached' });
    await page.goto(SITE + '#prefs');
    await page.locator('#openFriendEditor').click();
    await page.locator('#friendEd[open]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('#friendEd[open]').waitFor({ state: 'detached' });
  });

  test(`${size}: advisor summary prints, the calendar file has the disclaimer, the theme button toggles`, async (t) => {
    const page = await visit(t, size, DONE);
    await weekReady(page);
    await page.locator('#advisorBtn').click();
    await page.waitForFunction(() => window.__prints === 1);
    assert.equal(await page.locator('#print').getAttribute('hidden'), null); // style.css shows it only in print media
    assert.ok((await page.locator('#print').textContent()).trim().length > 100, 'the summary has text');

    await page.locator('[data-act="panel"][data-panel="reg"]').click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-act="ics"]').click()]);
    assert.match(download.suggestedFilename(), /^afeka-\d{4}\.ics$/);
    const ics = (await readFile(await download.path(), 'utf8')).replace(/\r?\n[ \t]/g, ''); // unfold the 75-character lines
    const disclaimer = await page.evaluate(async () => (await import('./ui-text.js')).DISCLAIMER);
    assert.ok(ics.startsWith('BEGIN:VCALENDAR') && ics.includes('BEGIN:VEVENT'), 'a calendar with events');
    assert.ok(ics.includes(disclaimer), 'the disclaimer is in the events');
    await page.keyboard.press('Escape');

    const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
    const first = await theme();
    await page.locator('.theme-btn').click();
    const second = await theme();
    assert.notEqual(second, first);
    await page.locator('.theme-btn').click();
    assert.equal(await theme(), first);
  });
}

for (const size of Object.keys(SIZES)) {
  test(`${size}: by keyboard, the advisor summary and a text dialog open and Escape closes the dialog`, async (t) => {
    const page = await visit(t, size, DONE);
    await weekReady(page);
    await page.locator('#advisorBtn').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__prints === 1);
    assert.equal(await page.locator('#print').getAttribute('hidden'), null);

    await page.locator('[data-act="panel"][data-panel="reg"]').focus();
    await page.keyboard.press('Space');
    await page.locator('#drawer[open]').waitFor();
    await page.locator('[data-act="copyReg"]').focus();
    await page.keyboard.press('Enter');
    const text = page.locator('dialog[open]:has(textarea)'); // showText: the copy failed, so the text is offered to copy by hand
    await text.waitFor();
    assert.ok((await text.locator('textarea').inputValue()).length > 10, 'the list is in the text box');
    await page.keyboard.press('Escape');
    await text.waitFor({ state: 'detached' });
  });

  test(`${size}: Escape closes the grade-sheet preview and nothing is applied`, async (t) => {
    const student = { ...STUDENT, passed: [] };
    const page = await visit(
      t,
      size,
      { 'afeka-sched-v1-terms': '2', 'afeka-sched-v1': JSON.stringify(student) },
      '#me'
    );
    await page.locator('#gradeFile').waitFor({ state: 'attached' });
    const pdf = gradeSheetPdf(['10016 Calculus 4.0 85', '30003 Physics 3.5 90']);
    await page.locator('#gradeFile').setInputFiles({ name: 'sheet.pdf', mimeType: 'application/pdf', buffer: pdf });
    const preview = page.locator('dialog.dlg-rows[open]');
    await preview.waitFor({ timeout: 30000 });
    assert.equal(await preview.locator('tbody tr').count(), 2, 'both rows are offered');
    await page.keyboard.press('Escape');
    await preview.waitFor({ state: 'detached' });
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1')).passed),
      [],
      'a cancelled import changes nothing'
    );
  });
}
