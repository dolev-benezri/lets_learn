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

// Holds the first request for a PDF font until release(), so a test can act while the file is being built.
const holdFirstFont = (page) => {
  let release,
    reached,
    first = true;
  const gate = new Promise((r) => (release = r)),
    arrived = new Promise((r) => (reached = r));
  page.route('**/vendor/pdf/rubik-hebrew-400-normal.woff', async (route) => {
    if (first) {
      first = false;
      reached();
      await gate;
    }
    await route.continue();
  });
  return { release, reached: arrived };
};
const pdfReady = (page) => page.locator('[data-act="advisorPdf"]:not([aria-disabled])').waitFor({ timeout: 30000 });
const stubShare = (page) =>
  page.evaluate(() => {
    navigator.canShare = ({ files }) => files?.[0]?.type === 'application/pdf';
    navigator.share = async (d) => {
      window.__shared = d;
      window.__active = navigator.userActivation?.isActive;
    };
  });
// The text of a PDF and the dark pixels of its first page, through pdf.js. The pixels catch a file whose text exists but draws nothing.
const readPdf = (page, expr) =>
  page.evaluate(async (expr) => {
    const file = await eval(expr);
    const pdfjs = await import('./vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', location.href).href;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
    const pg = await doc.getPage(1);
    const items = [];
    for (let n = 1; n <= doc.numPages; n++) items.push(...(await (await doc.getPage(n)).getTextContent()).items);
    const vp = pg.getViewport({ scale: 1 }),
      c = document.createElement('canvas');
    c.width = vp.width;
    c.height = vp.height;
    const g = c.getContext('2d');
    await pg.render({ canvasContext: g, viewport: vp, canvas: c }).promise;
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 128 && px[i] < 100) dark++;
    return { pages: doc.numPages, head: String.fromCharCode(...bytes.slice(0, 5)), text: items.map((i) => i.str).join(' '), dark, name: file.name, type: file.type };
  }, expr);

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
    assert.ok((await page.locator('#drawer[open] .advisor-sum').innerText()).trim().length > 100, 'the summary shows on screen');
    assert.equal(await page.evaluate(() => window.__prints), 0, 'opening it prints nothing: a phone app may have no print at all');
    await page.locator('[data-act="advisor"]').click();
    await page.waitForFunction(() => window.__prints === 1);
    assert.equal(await page.locator('#print').getAttribute('hidden'), null); // style.css shows it only in print media
    assert.ok((await page.locator('#print').textContent()).trim().length > 100, 'the summary has text');
    await page.locator('#drawer [data-act="closeDrawer"]').click();

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
  test(`${size}: the advisor summary is copied as text, and the PDF button waits for its file`, async (t) => {
    const page = await visit(t, size, DONE);
    await weekReady(page);
    const hold = holdFirstFont(page);
    await page.evaluate(() => {
      window.__copied = null;
      navigator.clipboard.writeText = async (t) => {
        window.__copied = t;
      };
      navigator.canShare = () => true;
      navigator.share = async () => {
        window.__shares = (window.__shares ?? 0) + 1;
      };
    });
    await page.locator('#advisorBtn').click();
    const pdf = page.locator('[data-act="advisorPdf"]');
    await hold.reached;
    assert.equal(await pdf.getAttribute('aria-disabled'), 'true');
    assert.match(await pdf.innerText(), /מכין PDF/);
    await pdf.click({ force: true }); // Playwright waits out aria-disabled; a person can still tap
    assert.equal(await page.evaluate(() => window.__shares ?? 0), 0, 'nothing to share yet');
    hold.release();
    await pdfReady(page);
    assert.match(await pdf.innerText(), size === 'phone' ? /שתף PDF/ : /הורד PDF/);
    await page.locator('[data-act="advisorCopy"]').click();
    await page.waitForFunction(() => window.__copied);
    assert.match(await page.evaluate(() => window.__copied), /סיכום לפגישה עם יועץ לימודים/);
  });

  test(`${size}: focus stays on the PDF button when the file gets ready`, async (t) => {
    const page = await visit(t, size, DONE);
    await weekReady(page);
    const hold = holdFirstFont(page);
    await page.locator('#advisorBtn').click();
    await hold.reached;
    await page.evaluate(() => {
      window.__button = document.querySelector('[data-act="advisorPdf"]');
      window.__button.focus();
    });
    hold.release();
    await pdfReady(page);
    assert.ok(await page.evaluate(() => document.activeElement === window.__button), 'the same element, still focused');
  });

  test(`${size}: blocked library files leave print and copy, and say so`, async (t) => {
    const page = await visit(t, size, DONE);
    await weekReady(page);
    await page.route('**/vendor/pdf/**', (r) => r.abort());
    await page.locator('#advisorBtn').click();
    await page.locator('.advisor-pdf-note:not([hidden])').waitFor();
    assert.equal(await page.locator('[data-act="advisorPdf"]').count(), 0);
    assert.equal(await page.locator('[data-act="advisor"]').count(), 1);
    assert.equal(await page.locator('[data-act="advisorCopy"]').count(), 1);
  });

  test(`${size}: by keyboard, the advisor summary and a text dialog open and Escape closes the dialog`, async (t) => {
    const page = await visit(t, size, DONE);
    await weekReady(page);
    await page.locator('#advisorBtn').focus();
    await page.keyboard.press('Enter');
    await page.locator('[data-act="advisor"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__prints === 1);
    assert.equal(await page.locator('#print').getAttribute('hidden'), null);
    await page.locator('#drawer [data-act="closeDrawer"]').click();
    await page.waitForFunction(() => document.activeElement?.id === 'advisorBtn'); // the close event is queued: it returns the focus, so wait it out

    await page.locator('[data-act="panel"][data-panel="reg"]').focus();
    await page.keyboard.press('Space');
    await page.locator('#drawer[open]').waitFor();
    // Failed at random under load, never alone (36 runs): if it comes back, this says which panel it reached.
    await page.locator('[data-act="copyReg"]').waitFor({ timeout: 10000 }).catch(async () => {
      assert.fail(`no copy button in: ${(await page.locator('#drawer').innerText()).slice(0, 120)}`);
    });
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

// Audit 2026-10-23 #32: a pin made in summer belongs to summer. It must not turn the course into a year "must", and the
// banner must not call the summer group gone (it is in the summer file).
const SUMMER_Y1 = {
  ...DONE,
  'afeka-sched-v1': JSON.stringify({
    ...STUDENT,
    passed: [],
    profile: { ...STUDENT.profile, year: 1, summer: true },
    scope: 'קיץ'
  })
};
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1')));
const semTab = (page, v) => page.locator(`#semtabs label:has(input[name="sem"][value="${v}"])`).click();
for (const size of Object.keys(SIZES)) {
  test(`${size}: a summer pin stays in summer`, async (t) => {
    const page = await visit(t, size, SUMMER_Y1);
    await weekReady(page);
    await page.locator('#week .blk').first().click();
    const pin = page.locator('#pop .pop-actions [data-act="pin"]');
    const gid = await pin.getAttribute('data-gid');
    await pin.click();
    const placed = (o) => page.locator('#week .blk-pin').first().waitFor({ state: 'attached', ...o }); // a phone shows one day
    await placed();
    assert.doesNotMatch((await page.locator('#banner').textContent()) ?? '', /כבר לא קיימת/);
    const cid = String(Number(gid.slice(2, 7)));
    assert.equal((await stored(page)).choices[cid], undefined, 'the summer pin does not set a year choice');
    // the year plan is searched again, then summer on top of it: the pinned group is still placed
    await semTab(page, 'א');
    await page.locator('#week .blk').first().waitFor({ state: 'attached', timeout: 30000 });
    await page.getByText('נעוץ בקיץ').first().waitFor({ state: 'attached' }); // the year list says why it is not in the year plan
    await semTab(page, 'קיץ');
    await placed({ timeout: 30000 });
    assert.ok((await stored(page)).pins.includes(gid));
  });
}

// Audit 2026-10-23 #43: summer builds on the last year plan, not on a "רק א׳" plan shown after it.
const idle = (page) =>
  page.waitForFunction(() => document.getElementById('board')?.getAttribute('aria-busy') === 'false', null, { timeout: 30000 });
// the "לתכנן" choice in the preferences step (on a phone the board's copy of it is hidden)
const setScope = async (page, v) => {
  await page.locator('nav.steps a[data-view="prefs"]').click();
  await page.locator(`label:has(input[name="scope"][value="${v}"])`).click();
  await page.locator('nav.steps a[data-view="plan"]').click();
};
for (const size of Object.keys(SIZES)) {
  test(`${size}: "רק א׳" does not replace the year plan summer builds on`, async (t) => {
    const seed = JSON.parse(SUMMER_Y1['afeka-sched-v1']);
    const page = await visit(t, size, { ...SUMMER_Y1, 'afeka-sched-v1': JSON.stringify({ ...seed, scope: 'year' }) });
    await page.locator('#week .blk').first().waitFor({ state: 'attached', timeout: 30000 });
    await idle(page);
    const n = (await stored(page)).yearIds.length;
    assert.ok(n > 0, 'the year plan has courses');
    await setScope(page, 'א');
    await idle(page);
    assert.equal((await stored(page)).yearIds.length, n, 'a single-semester plan is not the year plan');
    await setScope(page, 'year');
    await idle(page);
    await semTab(page, 'קיץ');
    await idle(page);
    assert.match(await page.locator('#semnote').textContent(), new RegExp(`${n} הקורסים`));
  });
}

// Audit 2026-10-23 #42: "רק ב׳" counts the א׳ candidates as passed, as the year view does, so a ב׳ course that waits only
// for one of them can be planned.
for (const size of Object.keys(SIZES)) {
  test(`${size}: "רק ב׳" lists סטטיקה של גוף קשיח as plannable`, async (t) => {
    const seed = JSON.parse(SUMMER_Y1['afeka-sched-v1']);
    const page = await visit(t, size, {
      ...SUMMER_Y1,
      'afeka-sched-v1': JSON.stringify({ ...seed, profile: { ...seed.profile, summer: false }, scope: 'ב' })
    });
    await idle(page);
    await page.locator('article.course h3', { hasText: 'סטטיקה של גוף קשיח' }).first().waitFor({ state: 'attached', timeout: 30000 });
  });
}

// Audit 2026-10-23 #38: "לא לפני" at or after "לא אחרי" is refused at the field, and the old value comes back.
for (const size of Object.keys(SIZES)) {
  test(`${size}: an inverted hour is refused`, async (t) => {
    const page = await visit(t, size, DONE, '#prefs');
    const nb = page.locator('input[data-chg="notBefore"]'),
      na = page.locator('input[data-chg="notAfter"]');
    await na.fill('10:00');
    await na.dispatchEvent('change');
    await nb.fill('18:00');
    await nb.dispatchEvent('change');
    await page.locator('#toast', { hasText: '"לא לפני" צריך להיות מוקדם מ-"לא אחרי".' }).waitFor();
    assert.equal(await nb.inputValue(), '');
    const c = (await page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1')))).constraints;
    assert.deepEqual([c.notBefore, c.notAfter], ['', '10:00']);
  });
}

// Audit 2026-10-23 #44: the credit cap applies to each semester's plan (also in the year view), and the label says so.
for (const size of Object.keys(SIZES)) {
  test(`${size}: the credit cap is labelled per semester`, async (t) => {
    const page = await visit(t, size, DONE, '#prefs');
    await page.locator('label', { hasText: 'תקרת נ״ז לסמסטר' }).locator('input[data-chg="maxCredits"]').waitFor();
  });
}

// Audit 2026-10-23 #36: a friend link with the name of another friend (other groups) asks before replacing; "add as
// another friend" keeps both, "replace" swaps the groups.
// (no top-level await in a spec: node:test then hangs after the run)
const twoGroups = async () =>
  Object.values(JSON.parse(await readFile(new URL('../fixtures/real/2027-1/30-2026.json', import.meta.url), 'utf8')).courses)
    .flatMap((c) => c.groups.map((g) => g.id))
    .slice(0, 2);
// opens the friend editor step, pastes a link from "נועה" with other groups, and answers the dialog
async function noaLink(t, size, button) {
  const [G1, G2] = await twoGroups();
  const NOA = { ...STUDENT, friends: [{ name: 'נועה', groups: [G1], weight: 1, active: true }] };
  const page = await visit(t, size, { ...DONE, 'afeka-sched-v1': JSON.stringify(NOA) }, '#prefs');
  const link = await page.evaluate(
    async ([st, g]) => (await import('./share.js')).friendLink(location.origin + location.pathname, st, g),
    [{ ...NOA, name: 'נועה' }, [G2]]
  ); // made in the page by the site's own share.js, as a friend's browser would
  await page.locator('#friendUrl').fill(link);
  await page.locator('[data-k="addFriend"]').click();
  const dlg = page.locator('dialog[open]');
  await dlg.getByText('כבר יש חבר בשם נועה. להחליף אותו בקישור החדש?').waitFor();
  await dlg.getByRole('button', { name: button }).click();
  await dlg.waitFor({ state: 'detached' });
  await page.waitForFunction((g) => localStorage.getItem('afeka-sched-v1').includes(g), G2);
  const { friends } = await page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1')));
  return friends.map((f) => [f.name, { [G1]: 'G1', [G2]: 'G2' }[f.groups.join()] ?? f.groups.join()]);
}
for (const size of Object.keys(SIZES)) {
  test(`${size}: a friend link with a taken name asks; cancel adds a second friend, replace swaps the groups`, async (t) => {
    assert.deepEqual(await noaLink(t, size, 'להוסיף כחבר נוסף'), [['נועה', 'G1'], ['נועה 2', 'G2']]);
    assert.deepEqual(await noaLink(t, size, 'להחליף'), [['נועה', 'G2']]);
  });
}

// Audit 2026-10-23 #35: in the year view the exams flag must not come from א׳ alone: when only ב׳ has published its
// exams, the "פיזור בחינות" weight still shows.
for (const size of Object.keys(SIZES)) {
  test(`${size}: the year view shows the exam weight when only ב׳ has exams`, async (t) => {
    const page = await visit(t, size, DONE, '#prefs');
    await page.waitForLoadState('networkidle'); // a reload over the first fetches makes WebKit report them as errors
    await page.context().route('**/data/afeka/*-2/*.json', async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, json: { ...(await res.json()), examsPublished: true } });
    });
    await page.reload();
    await page.locator('fieldset', { hasText: 'פיזור בחינות' }).first().waitFor({ state: 'attached', timeout: 30000 });
  });
}

// The outside review's first finding: nothing marked, and the summary and the map claimed courses as passed.
const UNMARKED = { ...STUDENT, passed: undefined };
const FIRST = { ...DONE, 'afeka-sched-v1': JSON.stringify(UNMARKED) };
for (const size of Object.keys(SIZES)) {
  test(`${size}: with nothing marked the site says what it assumed, and one tap confirms it`, async (t) => {
    const page = await visit(t, size, FIRST);
    await weekReady(page);
    assert.match(await page.locator('#boardNote').innerText(), /קורסים בהנחה, לא אושרו: \d+/);
    await page.locator('.steps a[data-view="me"]').click();
    const yes = page.locator('[data-act="confirmAssumed"]');
    await yes.waitFor();
    assert.match(await page.locator('.crs .tag.warn', { hasText: 'בהנחה' }).first().innerText(), /בהנחה/);
    await yes.click();
    await page.locator('[data-act="confirmAssumed"]').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.crs .tag.warn', { hasText: 'בהנחה' }).count(), 0);
    assert.equal(await focused(page), 'H2');
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('afeka-sched-v1'))).assumed, []);
    await page.locator('.steps a[data-view="plan"]').click();
    await weekReady(page);
    assert.doesNotMatch(await page.locator('#boardNote').innerText(), /בהנחה/);
  });

  test(`${size}: the steps show where you are, with no tick for a step nobody finished`, async (t) => {
    const page = await visit(t, size, FIRST);
    await weekReady(page);
    assert.equal(await page.locator('.steps a.done').count(), 0);
    assert.equal(await page.locator('.steps a[data-view="plan"][aria-current="step"]').count(), 1);
  });
}

test('a question still open does not end the first-visit welcome', async (t) => {
  const page = await visit(t, 'phone', { 'afeka-sched-v1-terms': '2' }, '#prefs');
  await page.locator('.gate').first().waitFor({ timeout: 30000 });
  assert.equal(await page.evaluate(() => localStorage.getItem('afeka-sched-v1-onboarded')), null);
});

for (const [name, size] of [['320', { width: 320, height: 640 }], ['375', SIZES.phone], ['a phone on its side', { width: 667, height: 375 }]]) {
  test(`${name}: the board's warnings are seen, nothing overflows, and the week still starts on the first screens`, async (t) => {
    const page = await visit(t, size, FIRST);
    await weekReady(page);
    const note = page.locator('#boardNote');
    assert.ok(await note.isVisible());
    assert.match(await note.innerText(), /הכללים לא אושרו על ידי המחלקה/);
    const m = await page.evaluate(() => ({
      over: document.documentElement.scrollWidth - innerWidth,
      note: document.getElementById('boardNote').getBoundingClientRect().height,
      vh: innerHeight
    }));
    assert.ok(m.over <= 0, `overflow ${m.over}`);
    assert.ok(m.note <= m.vh * 0.45, `the note takes ${m.note} of ${m.vh}`);
  });
}

// The phone opens on the day's first lesson, so a line above the controls would be scrolled away before anyone reads it.
for (const [name, size] of [['320', { width: 320, height: 640 }], ['375', SIZES.phone]]) {
  test(`${name}: on arrival the warnings and the day's first lesson are both on the screen`, async (t) => {
    const page = await visit(t, size, FIRST);
    await weekReady(page);
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const box = (e) => e.getBoundingClientRect();
      const note = box(document.getElementById('boardNote')),
        sel = box(document.getElementById('daysel')),
        first = [...document.querySelectorAll('.day.on .blk')].map(box).sort((a, b) => a.top - b.top)[0];
      return { noteTop: note.top, noteBottom: note.bottom, selBottom: sel.bottom, firstTop: first?.top, vh: innerHeight };
    });
    assert.ok(r.noteTop >= r.selBottom - 1, `under the day selector: ${JSON.stringify(r)}`);
    assert.ok(r.noteBottom <= r.vh, `on the screen: ${JSON.stringify(r)}`);
    assert.ok(r.firstTop >= r.noteBottom - 1 && r.firstTop <= r.vh - 60, `the lesson too: ${JSON.stringify(r)}`);
  });
}

// The owner's call: when the two do not fit (a late first lesson, or a short screen with its toolbars), arriving shows the warnings, and choosing a day shows its lesson.
// The height is measured, so this holds on any night's data: one pixel short of fitting both.
test('a short phone: arriving shows the warnings first, and choosing a day shows its lesson', async (t) => {
  const page = await visit(t, { width: 320, height: 640 }, FIRST);
  await weekReady(page);
  await page.waitForTimeout(300);
  const spots = () =>
    page.evaluate(() => {
      const box = (e) => e.getBoundingClientRect(),
        sel = document.getElementById('daysel');
      return {
        noteTop: box(document.getElementById('boardNote')).top,
        noteBottom: box(document.getElementById('boardNote')).bottom,
        selBottom: box(sel).bottom,
        head: parseFloat(getComputedStyle(sel).top) + sel.offsetHeight + 8,
        firstTop: [...document.querySelectorAll('.day.on .blk')].map((b) => box(b).top).sort((a, b) => a - b)[0],
        vh: innerHeight
      };
    });
  const tall = await spots();
  await page.setViewportSize({ width: 320, height: Math.floor(tall.firstTop - tall.noteTop + tall.head + 99) });
  await page.reload();
  await weekReady(page);
  await page.waitForTimeout(300);
  const arrived = await spots();
  assert.ok(arrived.noteTop >= arrived.selBottom - 1 && arrived.noteBottom <= arrived.vh, `the warnings: ${JSON.stringify(arrived)}`);
  let days = 0;
  for (const day of await page.locator('#daysel [data-act="day"]').all()) {
    await day.click();
    await page.waitForTimeout(100);
    const s = await spots();
    if (s.firstTop === undefined) continue;
    days++;
    assert.ok(s.firstTop >= s.selBottom - 1 && s.firstTop <= s.vh - 60, `the lesson: ${JSON.stringify(s)}`);
  }
  assert.ok(days, 'a day with a lesson');
});

const savedState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1')));

test('two tabs: a change in one stops the other from saving over it, until it reloads', async (t) => {
  const a = await visit(t, 'desktop', DONE);
  await weekReady(a);
  const b = await a.context().newPage();
  await b.goto(a.url());
  await weekReady(b);
  await b.waitForTimeout(500);
  const note = b.locator('#notice [role="alert"]');
  const change = (edit) =>
    a.evaluate((e) => {
      const s = JSON.parse(localStorage.getItem('afeka-sched-v1'));
      localStorage.setItem('afeka-sched-v1', JSON.stringify({ ...s, ...e }));
    }, edit);
  await change({ yearIds: ['1'] }); // what a tab's shown alternative holds, not the student's record
  await b.waitForTimeout(300);
  assert.equal(await note.count(), 0);
  await a.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('afeka-sched-v1'));
    localStorage.setItem('afeka-sched-v1', JSON.stringify(Object.fromEntries(Object.entries(s).reverse())));
  });
  await b.waitForTimeout(300);
  assert.equal(await note.count(), 0, 'the same record in another order');
  await change({ name: 'מהלשונית השנייה' });
  await note.waitFor({ timeout: 5000 });
  assert.match(await note.innerText(), /בלשונית אחרת/);
  await b.evaluate(async () => (await import('./app.js')).save());
  assert.equal((await savedState(b)).name, 'מהלשונית השנייה');
  await Promise.all([b.waitForEvent('load'), note.locator('[data-act="reloadPage"]').click()]);
  await weekReady(b);
  assert.equal(await note.count(), 0);
  assert.equal(await b.evaluate(async () => (await import('./app.js')).app.state.name), 'מהלשונית השנייה');
});

test('two study years picked fast and neither loads: the year before both comes back', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#me');
  await page.locator('input[data-chg="pyear"]').first().waitFor({ state: 'attached', timeout: 30000 });
  await page.context().route(/\/30-202[45]\.json$/, (r) => setTimeout(() => r.abort(), 400));
  await page.locator('input[data-chg="pyear"][value="3"]').evaluate((e) => e.click());
  await page.locator('input[data-chg="pyear"][value="4"]').evaluate((e) => e.click());
  await page.locator('#toast', { hasText: 'לא הצלחנו לטעון' }).waitFor({ timeout: 10000 });
  const s = await savedState(page);
  assert.deepEqual([s.profile.year, s.startYear], [2, 2026]);
  assert.equal(await page.locator('input[data-chg="pyear"]:checked').getAttribute('value'), '2');
});

const later = (r) => setTimeout(() => r.continue(), 400);

test('a study year picked and taken back while it loads: the last choice wins', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#me');
  await page.locator('input[data-chg="pyear"]').first().waitFor({ state: 'attached', timeout: 30000 });
  await page.context().route(/\/30-2025\.json$/, later);
  await page.locator('input[data-chg="pyear"][value="3"]').evaluate((e) => e.click());
  await page.locator('input[data-chg="pyear"][value="2"]').evaluate((e) => e.click());
  await page.waitForTimeout(1200);
  const s = await savedState(page);
  assert.deepEqual([s.profile.year, s.startYear], [2, 2026]);
});

test('a study year picked while a new program loads: it applies to the new program', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#me');
  const pick = page.locator('select[data-chg="program"]');
  await pick.waitFor({ timeout: 30000 });
  await page.context().route(/\/20-20\d\d\.json$/, later);
  await pick.selectOption('20');
  await page.locator('input[data-chg="pyear"][value="3"]').evaluate((e) => e.click());
  await page.waitForTimeout(1500);
  const s = await savedState(page);
  assert.deepEqual([s.program, s.profile.year, s.startYear], [20, 3, 2025]);
});

test('the failed-load screen: another tab clearing the record throws nothing', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await page.waitForLoadState('networkidle');
  await page.context().route('**/data/afeka/*-1/*.json', (r) => r.abort());
  await page.reload();
  await page.locator('[data-retry]:visible').first().waitFor({ timeout: 30000 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const other = await page.context().newPage();
  await other.goto(page.url());
  await other.evaluate(() => localStorage.removeItem('afeka-sched-v1'));
  await page.waitForTimeout(300);
  assert.deepEqual(errors, []);
});

test('a status file it cannot read: every step keeps the retry', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await page.waitForLoadState('networkidle');
  await page.context().route('**/data/afeka/status.json', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{"checkedAt":"not-a-date","ok":true,"semesters":{"2027-1/30-2026":{"checkedAt":"not-a-date"}}}' })
  );
  await page.reload();
  await page.locator('[data-retry]:visible').first().waitFor({ timeout: 30000 });
  await page.evaluate(() => {
    location.hash = '#me';
  });
  await page.locator('#me [data-retry]').waitFor({ timeout: 5000 });
});

test('a program file that does not load: the student is told, and the study year goes back', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#me');
  const year = page.locator('input[data-chg="pyear"]');
  await year.first().waitFor({ state: 'attached', timeout: 30000 });
  await page.context().route('**/data/afeka/*/30-2025.json', (r) => r.abort());
  await page.locator('input[data-chg="pyear"][value="3"]').evaluate((e) => e.click());
  await page.locator('#toast', { hasText: 'לא הצלחנו לטעון' }).waitFor({ timeout: 10000 });
  assert.equal((await savedState(page)).profile.year, 2);
  assert.equal(await page.locator('input[data-chg="pyear"]:checked').getAttribute('value'), '2');
});

test('desktop: the arrows on the scrollable course row leave the alternative alone', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await weekReady(page);
  const cur = () => page.evaluate(async () => (await import('./ui-common.js')).ui.cur);
  await page.locator('#pills').focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await cur(), 0);
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('ArrowLeft');
  assert.equal(await cur(), 1);
});

test('a save that fails says so, with the way out, until a save succeeds', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await weekReady(page);
  await page.evaluate(async () => {
    const { save } = await import('./app.js');
    window.realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('full');
    };
    save();
  });
  const notice = page.locator('#notice [role="alert"]');
  await notice.waitFor({ timeout: 5000 });
  assert.match(await notice.innerText(), /לא נשמרים/);
  assert.equal(await notice.locator('[data-act="backup"]').count(), 1);
  await page.evaluate(async () => {
    const { save } = await import('./app.js');
    Storage.prototype.setItem = window.realSetItem;
    save();
  });
  await notice.waitFor({ state: 'detached', timeout: 5000 });
});

test('moving to a new study year says what it took off', async (t) => {
  const friend = (id, name) => ({ id, name, groups: ['1'], active: true });
  const old = { ...STUDENT, year: 2026, pins: ['111'], friends: [friend('f1', 'א'), friend('f2', 'ב')] };
  const page = await visit(t, 'desktop', { ...DONE, 'afeka-sched-v1': JSON.stringify(old) });
  await weekReady(page);
  const text = await page.locator('#banner').innerText();
  assert.match(text, /2 חברים/);
  assert.match(text, /קורס נעוץ|קורסים נעוצים/);
  const again = await page.evaluate(() => localStorage.getItem('afeka-sched-v1'));
  assert.equal(JSON.parse(again).friends.length, 0);
});

test('a phone on its side keeps the semester notes', async (t) => {
  const page = await visit(t, { width: 667, height: 375 }, DONE);
  await weekReady(page);
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('semnote')).display), 'block');
});

// A failed load says nothing against the saved record: the screen offers a retry, and nothing there can erase it.
for (const size of Object.keys(SIZES)) {
  for (const [how, fail] of [
    ['a missing file', (r) => r.fulfill({ status: 404 })],
    ['no network', (r) => r.abort()],
    ['a file with no courses', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })],
    ['a file it cannot read', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"courses":{"1":null}}' })]
  ]) {
    test(`${size}: ${how} offers a retry only, and the retry loads with the record kept`, async (t) => {
      const page = await visit(t, size, DONE);
      await page.waitForLoadState('networkidle');
      await page.context().route('**/data/afeka/*-1/*.json', fail);
      await page.reload();
      const retry = page.locator('[data-retry]:visible').first();
      await retry.waitFor({ timeout: 30000 });
      assert.equal(await page.locator('[data-reset]').count(), 0);
      assert.doesNotMatch(await page.locator('.msg.bad:visible').first().innerText(), /איפוס|אפס/);
      await page.context().unroute('**/data/afeka/*-1/*.json', fail);
      await retry.click();
      await weekReady(page);
      assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('afeka-sched-v1'))).passed, STUDENT.passed);
    });
  }
}

// Audit 2026-10-23 #40: a course row whose grade the import does not know (a word, not a number) is not dropped silently.
for (const size of Object.keys(SIZES)) {
  test(`${size}: the grade-sheet preview says how many rows it could not read`, async (t) => {
    const page = await visit(
      t,
      size,
      { 'afeka-sched-v1-terms': '2', 'afeka-sched-v1': JSON.stringify({ ...STUDENT, passed: [] }) },
      '#me'
    );
    await page.locator('#gradeFile').waitFor({ state: 'attached' });
    const pdf = gradeSheetPdf(['10016 Calculus 4.0 85', '30135 Statics 3.0 Pass']);
    await page.locator('#gradeFile').setInputFiles({ name: 'sheet.pdf', mimeType: 'application/pdf', buffer: pdf });
    const preview = page.locator('dialog.dlg-rows[open]');
    await preview.waitFor({ timeout: 30000 });
    assert.equal(await preview.locator('tbody tr').count(), 1, 'the numeric row only');
    await preview.getByText('שורה אחת לא זוהתה ולא תיובא. אפשר לסמן אותה ידנית.').waitFor();
    await page.keyboard.press('Escape');
  });
}

// Audit 2026-10-23 #34: a failing grade counts in the cumulative average (regulation 9.4.2, 11.4.2), so a failed course takes a
// grade in #me too, and the average line follows it.
for (const size of Object.keys(SIZES)) {
  test(`${size}: a failed course takes a grade, and the average counts it`, async (t) => {
    const student = { ...STUDENT, passed: ['90903'], failed: { 90901: 1 }, grades: { 90903: 80 } };
    const page = await visit(t, size, { ...DONE, 'afeka-sched-v1': JSON.stringify(student) }, '#me');
    const field = page.locator('input[data-chg="grade"][data-cid="90901"]');
    await field.waitFor({ state: 'attached', timeout: 30000 });
    await field.fill('40');
    await field.dispatchEvent('change');
    await page.locator('#gradeAvg', { hasText: 'ממוצע' }).waitFor({ state: 'attached' });
    assert.doesNotMatch(await page.locator('#gradeAvg').textContent(), /ממוצע: 80\b/, 'the failing grade is in the average');
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1')));
    assert.equal(s.grades['90901'], 40);
  });
}

test('phone: the file is shared alone, inside the tap, with the summary readable in it', async (t) => {
  const page = await visit(t, 'phone', DONE);
  await weekReady(page);
  await stubShare(page);
  await page.locator('#advisorBtn').click();
  await pdfReady(page);
  await page.locator('[data-act="advisorPdf"]').click();
  await page.waitForFunction(() => window.__shared);
  assert.deepEqual(await page.evaluate(() => Object.keys(window.__shared)), ['files'], 'files only: some targets drop a file that comes with text');
  assert.notEqual(await page.evaluate(() => window.__active), false, 'no wait between the tap and the share');
  const pdf = await readPdf(page, 'window.__shared.files[0]');
  assert.equal(pdf.head, '%PDF-');
  assert.equal(pdf.pages, 1, 'a full year of 16 courses, with its notes, on one sheet');
  assert.equal(pdf.name, 'advisor-summary.pdf');
  assert.equal(pdf.type, 'application/pdf');
  assert.ok(pdf.text.includes('סיכום') && pdf.text.includes('המצב'), pdf.text.slice(0, 80));
  assert.ok(pdf.dark > 500, `${pdf.dark} dark pixels`);
  // a closed sheet is not an error
  await page.evaluate(() => {
    navigator.share = () => Promise.reject(new DOMException('cancelled', 'AbortError'));
  });
  await page.locator('[data-act="advisorPdf"]').click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#toast.show').count(), 0);
  assert.equal(await page.locator('[data-act="advisorCopy"]').count(), 1, 'no target found also reads AbortError: another route stays on screen');
  // a real refusal says so, and the next route takes a fresh tap
  await page.evaluate(() => {
    navigator.share = () => Promise.reject(new DOMException('no', 'NotAllowedError'));
  });
  await page.locator('[data-act="advisorPdf"]').click();
  await page.waitForFunction(() => /להעתיק/.test(document.getElementById('toast').textContent));
});

test('desktop: the file downloads, with no system sheet even where one exists', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await weekReady(page);
  await stubShare(page);
  await page.locator('#advisorBtn').click();
  await pdfReady(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-act="advisorPdf"]').click()]);
  assert.equal(download.suggestedFilename(), 'advisor-summary.pdf');
  assert.equal((await readFile(await download.path())).subarray(0, 5).toString(), '%PDF-');
  assert.equal(await page.evaluate(() => window.__shared ?? null), null);
});

test('phone: an old browser with no file sharing downloads the file', async (t) => {
  const page = await visit(t, 'phone', DONE);
  await weekReady(page);
  await page.evaluate(() => {
    navigator.canShare = undefined;
  });
  await page.locator('#advisorBtn').click();
  await pdfReady(page);
  assert.match(await page.locator('[data-act="advisorPdf"]').innerText(), /הורד PDF/);
});

test('the same content builds once; another alternative builds again and an older build loses', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await weekReady(page);
  const fonts = [];
  page.on('request', (r) => {
    if (r.url().includes('rubik-hebrew-400')) fonts.push(r.url());
  });
  const hold = holdFirstFont(page);
  await page.locator('#advisorBtn').click();
  await hold.reached;
  const before = await page.locator('.advisor-sum').innerText();
  // whole Hebrew words and numbers: the file holds a time's parts and a word with a quote mark as separate runs
  const words = (s) => new Set(s.split(/[\s,;:()–-]+/).filter((w) => w.length > 1 && /^([א-ת]+|\d+)$/.test(w)));
  // two ahead: on the frozen data the next alternative brings no word of its own
  await page.evaluate(async () => (await import('./ui-view.js')).go(2));
  await page.waitForFunction((b) => document.querySelector('.advisor-sum').innerText !== b, before);
  await pdfReady(page);
  const after = await page.locator('.advisor-sum').innerText();
  const onlyNew = [...words(after)].filter((x) => !words(before).has(x));
  const onlyOld = [...words(before)].filter((x) => !words(after).has(x));
  assert.ok(onlyNew.length, 'the alternatives differ');
  hold.release();
  await page.waitForTimeout(300);
  const pdf = await readPdf(page, 'import("./ui-advisor-pdf.js").then((m) => m.advisorPdfFile())');
  const inFile = words(pdf.text);
  for (const w of onlyNew) assert.ok(inFile.has(w), `${w} of the shown alternative is in the file`);
  for (const w of onlyOld) assert.ok(!inFile.has(w), `${w} of the older build is not`);
  assert.ok(pdf.text.includes('סיכום'));
  const count = fonts.length;
  await page.evaluate(async () => (await import('./ui-drawer.js')).renderDrawer());
  await pdfReady(page);
  assert.equal(fonts.length, count, 'a repaint with the same content builds nothing');
});

test('closing the panel drops the file, even from a build that ends after it', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await weekReady(page);
  const hold = holdFirstFont(page);
  await page.locator('#advisorBtn').click();
  await hold.reached;
  await page.locator('#drawer [data-act="closeDrawer"]').click();
  hold.release();
  await page.waitForTimeout(800);
  const held = () => page.evaluate(async () => Boolean((await import('./ui-advisor-pdf.js')).advisorPdfFile()));
  assert.equal(await held(), false);
  await page.locator('#advisorBtn').click();
  await pdfReady(page);
  assert.equal(await held(), true);
  await page.locator('#drawer [data-act="closeDrawer"]').click();
  await page.waitForTimeout(200); // the close event is queued
  assert.equal(await held(), false);
});

test('on a desktop, another panel replacing this one drops the file, even from a build that ends after it', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await weekReady(page);
  await page.locator('#advisorBtn').click();
  await pdfReady(page);
  await page.locator('[data-act="panel"][data-panel="reg"]').click();
  const held = () => page.evaluate(async () => Boolean((await import('./ui-advisor-pdf.js')).advisorPdfFile()));
  assert.equal(await held(), false, 'a finished file is dropped');
  await page.locator('#advisorBtn').click();
  await pdfReady(page);
  await page.locator('#drawer [data-act="closeDrawer"]').click();
  await page.waitForTimeout(200);
  const hold = holdFirstFont(page);
  await page.locator('#advisorBtn').click();
  await hold.reached;
  await page.locator('[data-act="panel"][data-panel="reg"]').click();
  hold.release();
  await page.waitForTimeout(800);
  assert.equal(await held(), false, 'and so is a late one');
});

test('a character no font holds is named in the panel and left out of the file', async (t) => {
  const student = { ...JSON.parse(DONE['afeka-sched-v1']), name: 'דנה 😀' };
  const page = await visit(t, 'phone', { ...DONE, 'afeka-sched-v1': JSON.stringify(student) });
  await weekReady(page);
  await page.locator('#advisorBtn').click();
  await pdfReady(page);
  assert.match(await page.locator('.advisor-pdf-note').innerText(), /😀/);
});

test('in the Google app, where print does nothing, there is no print button', async (t) => {
  const page = await visit(t, 'phone', DONE);
  await weekReady(page);
  await page.evaluate(() => Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone) GSA/444.2 Mobile Safari/604.1' }));
  await page.locator('#advisorBtn').click();
  assert.equal(await page.locator('[data-act="advisor"]').count(), 0);
  assert.equal(await page.locator('[data-act="advisorPdf"]').count(), 1);
});

test('320 px: the panel buttons stay inside the screen', async (t) => {
  const page = await visit(t, { width: 320, height: 640 }, DONE);
  await weekReady(page);
  await page.locator('#advisorBtn').click();
  await pdfReady(page);
  for (const a of ['advisorPdf', 'advisor', 'advisorCopy']) {
    const box = await page.locator(`[data-act="${a}"]`).boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 320, `${a}: ${JSON.stringify(box)}`);
  }
});
