// Design A's take-out tool (#out, "להוציא"), the ☰ menu and the information panel (web/ui-drawer.js renderOut, web/ui-mode.js menuPanel): what the tool
// holds, that it follows the shown alternative, who owns the advisor PDF, and printing the summary. Every visit sets { design: 'a' }.
// No top-level await in a spec: node:test then hangs after the run.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as playwright from 'playwright';
import { STUDENT, DONE, launch, visit as visitIn } from './helpers.mjs';

let browser, chrome;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
  await chrome?.close();
});

const visit = (t, size, seed, hash = '') => visitIn(browser, t, size, seed, hash, 'light', false, false, { design: 'a' });
const outReady = (page) => page.locator('#out .advisor-sum').waitFor({ timeout: 30000 });
const pdfReady = (page) => page.locator('#out [data-act="advisorPdf"]:not([aria-disabled])').waitFor({ timeout: 30000 });
const held = (page) => page.evaluate(async () => Boolean((await import('./ui-advisor-pdf.js')).advisorPdfFile()));
const label = (page) => page.locator('#altLabel').textContent();
const dialogText = async (page) => {
  const d = page.locator('dialog[open] textarea').first();
  await d.waitFor();
  return d.inputValue();
};
const closeDialog = async (page) => {
  await page.locator('dialog[open]').getByRole('button', { name: 'סגור' }).click();
  await page.locator('dialog[open]').waitFor({ state: 'detached' });
};

for (const size of ['phone', { width: 1920, height: 900 }])
  test(`${typeof size === 'string' ? size : size.width}: copy all is the sole primary while the PDF prepares and after it is ready`, async (t) => {
    const page = await visit(t, size, DONE, '#out');
    await outReady(page);
    const primary = page.locator('#out .btn.primary');
    const check = async () => {
      assert.equal(await primary.count(), 1);
      assert.equal((await primary.textContent()).trim(), 'העתק הכל');
      assert.equal(await primary.getAttribute('data-act'), 'copyReg');
      assert.equal(await page.locator('#out [data-act="ics"]').getAttribute('class'), 'btn');
      assert.equal(await page.locator('#out [data-act="advisorPdf"]').getAttribute('class'), 'btn');
    };
    await check();
    await pdfReady(page);
    await check();
    await page.evaluate(() => {
      window.__registrationCopies = [];
      navigator.clipboard.writeText = async (text) => { window.__registrationCopies.push(text); };
    });
    await primary.focus();
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__registrationCopies.length === 1);
    assert.equal(await page.evaluate(async () => window.__registrationCopies[0] ===
      (await import('./ui-drawer.js')).registrationText((await import('./ui-common.js')).current())), true);
    const was = await label(page);
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction((l) => document.getElementById('altLabel').textContent !== l, was);
    await outReady(page);
    await pdfReady(page);
    await check();
  });

test('friends: a link inside the open fold still offers the text dialog when copying is refused', async (t) => {
  const page = await visit(t, 'phone', DONE, '#friends');
  await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
  await page.locator('#friends details[data-key="friends-mine"] > summary').click();
  await page.locator('#friends [data-k="copyMine"]').click();
  assert.match(await dialogText(page), /#f=/);
  await closeDialog(page);
  await page.waitForFunction(() => document.activeElement?.dataset?.k === 'copyMine', null, { timeout: 5000 }); // a closed dialog gives the focus back in its close event, a task later
  assert.equal(await page.locator('#friends details[data-key="friends-mine"]').evaluate((e) => e.open), true);
  assert.equal(await page.locator('#friends [data-k="copyMine"]').evaluate((e) => e === document.activeElement), true);
});

test('out tool shows the registration list, backup groups, ics, advisor summary, share and the backup link', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#out');
  await outReady(page);
  assert.equal(await page.locator('#drawer[open]').count(), 0, 'a tool, not a drawer');
  assert.ok((await page.locator('#out .reglist li').count()) > 0, 'the registration list');
  const reg = await page.locator('#out section[aria-labelledby="outReg"]').innerText();
  assert.match(reg, /קבוצה|הרצאה|תרגול|מעבדה/, 'with its groups');
  for (const act of ['copyReg', 'ics', 'advisor', 'advisorCopy', 'share', 'shareOut', 'backup'])
    assert.equal(await page.locator(`#out [data-act="${act}"]`).count(), 1, `${act} is in the tool`);
  assert.ok((await page.locator('#out .advisor-sum').innerText()).trim().length > 100, 'the advisor summary is on screen');
  assert.equal(await page.locator('#out [data-act="ics"]').isEnabled(), true, 'the calendar file is on offer');
  for (const h of ['רשימה להרשמה', 'סיכום ליועץ', 'שיתוף וגיבוי']) assert.equal(await page.locator('#out h2', { hasText: h }).count(), 1, h);
  assert.equal(await page.locator('#out .a-out').count(), 0, 'the Task 2 placeholder is gone');
  const link = await page.evaluate(() => document.getElementById('panel').getAttribute('aria-labelledby'));
  assert.equal(link, 'outTitle');
});

test('copy failure shows the text dialog, for the list, the share link and the backup link', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#out');
  await outReady(page);
  await page.locator('#out [data-act="copyReg"]').click();
  assert.match(await dialogText(page), /\d{5} .+: \d+/, 'the registration list as text');
  await closeDialog(page);
  await page.locator('#out [data-act="share"]').click();
  assert.match(await dialogText(page), /#f=/, 'the link for friends');
  await closeDialog(page);
  await page.locator('#out [data-act="backup"]').click();
  assert.match(await dialogText(page), /#b=/, 'the backup link');
  await closeDialog(page);
});

test('an open out panel follows a new alternative and a new semester tab; a year plan still exports both semesters', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#out');
  await outReady(page);
  const sumOf = () => page.locator('#out section[aria-labelledby="outReg"]').innerText();
  const one = await sumOf();
  const advisorOne = await page.locator('#out .advisor-sum').textContent();
  const was = await label(page);
  await page.keyboard.press('ArrowLeft'); // the next alternative
  await page.waitForFunction((l) => document.getElementById('altLabel').textContent !== l, was);
  await page.waitForFunction((r) => document.querySelector('#out section[aria-labelledby="outReg"]')?.innerText !== r, one);
  const two = await sumOf();
  assert.notEqual(two, one, 'the list follows the shown alternative');
  await page.waitForFunction((a) => document.querySelector('#out .advisor-sum').textContent !== a, advisorOne);
  const ids = await page.evaluate(async () => (await import('./ui-drawer.js')).registrationText((await import('./ui-common.js')).current()).match(/^\d{5}/gm));
  assert.ok(ids.length > 3, 'the shown alternative has courses');
  for (const id of ids) assert.ok(two.includes(id), `course ${id} of the shown alternative is in the list`);
  await page.locator('#out [data-act="copyReg"]').click();
  const text = await dialogText(page);
  const expected = await page.evaluate(async () => (await import('./ui-drawer.js')).registrationText((await import('./ui-common.js')).current()));
  assert.equal(text, expected, 'the copy is the shown alternative');
  await closeDialog(page);
  assert.equal(await page.locator('#out .reg-sem').count(), 2, 'a year plan lists each semester under its own heading');
  const sem = await visit(t, 'desktop', { ...DONE, 'afeka-sched-v1': JSON.stringify({ ...STUDENT, scope: 'א' }) }, '#out');
  await outReady(sem);
  assert.equal(await sem.locator('#out .reg-sem').count(), 0, 'a semester plan has one untitled part');

  const year = await visit(t, 'desktop', { ...DONE, 'afeka-sched-v1': JSON.stringify({ ...STUDENT, scope: 'year' }) }, '#out');
  await outReady(year);
  await year.waitForFunction(() => document.getElementById('board')?.getAttribute('aria-busy') === 'false', null, { timeout: 30000 });
  await year.locator('#out [data-act="copyReg"]').click();
  const both = await dialogText(year);
  assert.match(both, /סמסטר א/);
  assert.match(both, /סמסטר ב/);
  await closeDialog(year);
  await year.locator('label:has(input[name="sem"][value="ב"])').first().click({ force: true });
  await year.waitForFunction(() => document.querySelector('input[name="sem"][value="ב"]')?.checked);
  await year.locator('#out [data-act="copyReg"]').click();
  const after = await dialogText(year);
  assert.match(after, /סמסטר א/, 'the semester tab does not narrow the export');
  assert.match(after, /סמסטר ב/);
  await closeDialog(year);
});

test('merely opening #out by hash, dock tap or Back renders it and starts the advisor PDF', async (t) => {
  const byHash = await visit(t, 'desktop', DONE, '#out');
  await pdfReady(byHash);
  assert.equal(await held(byHash), true, 'by hash');
  const byDock = await visit(t, 'desktop', DONE, '');
  await byDock.locator('#week .blk').first().waitFor({ timeout: 30000 });
  await byDock.locator('.dock [data-tool="out"]').click();
  await pdfReady(byDock);
  assert.equal(await held(byDock), true, 'by the dock');
  await byDock.locator('.dock [data-tool="courses"]').click();
  await byDock.locator('#panel #courses').waitFor({ state: 'visible' });
  assert.equal(await held(byDock), false, 'leaving the tool drops the file');
  await byDock.goBack(); // Back: to #out
  await byDock.locator('#out .advisor-sum').waitFor();
  await pdfReady(byDock);
  assert.equal(await held(byDock), true, 'by Back');
});

test('opening ☰ over "להוציא" keeps the advisor PDF button valid', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#out');
  await pdfReady(page);
  await page.evaluate(() => (window.__btn = document.querySelector('#out [data-act="advisorPdf"]')));
  await page.locator('.menu-btn').click();
  await page.locator('#drawer[open]').waitFor();
  assert.equal(await held(page), true, 'the file survives the menu');
  await page.keyboard.press('Escape');
  await page.locator('#drawer[open]').waitFor({ state: 'detached' });
  assert.equal(await held(page), true, 'and its closing');
  const same = await page.evaluate(() => window.__btn === document.querySelector('#out [data-act="advisorPdf"]') && !window.__btn.hasAttribute('aria-disabled'));
  assert.equal(same, true, 'the same button, still enabled');
});

test('the advisor PDF file is created and dropped on every exit from the tool: switching tool, closing, Back, switching mode', async (t) => {
  const wide = await visit(t, 'desktop', DONE, '#out');
  await pdfReady(wide);
  assert.equal(await held(wide), true);
  await wide.locator('.dock [data-tool="friends"]').click();
  await wide.locator('#panel #friends').waitFor({ state: 'visible' });
  assert.equal(await held(wide), false, 'switching tool');
  await wide.locator('.dock [data-tool="out"]').click();
  await pdfReady(wide);
  await wide.locator('.a-top .modes a[data-mode="edit"]').click();
  await wide.locator('#edit').waitFor({ state: 'visible' });
  assert.equal(await held(wide), false, 'switching mode');

  const phone = await visit(t, 'phone', DONE, '#out');
  await pdfReady(phone);
  await phone.locator('#panel [data-act="closeTool"]').first().click();
  await phone.locator('#panel').waitFor({ state: 'hidden' });
  assert.equal(await held(phone), false, 'closing the sheet');
  await phone.locator('.dock [data-tool="out"]').click();
  await pdfReady(phone);
  await phone.goBack();
  await phone.locator('#panel').waitFor({ state: 'hidden' });
  assert.equal(await held(phone), false, 'Back');
});

test('advisor print: window.print is called once and #print holds the whole summary', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#out');
  await outReady(page);
  await page.evaluate(() => {
    window.__prints = [];
    window.print = () => window.__prints.push({ html: document.getElementById('print').textContent, hidden: document.getElementById('print').hidden, on: document.documentElement.classList.contains('print-summary') });
  });
  await page.locator('#out [data-act="advisor"]').click();
  const r = await page.evaluate(() => ({ prints: window.__prints, shown: document.querySelector('#out .advisor-sum').textContent }));
  assert.equal(r.prints.length, 1, 'print() once');
  assert.equal(r.prints[0].on, true, 'the page is in summary mode while it prints');
  assert.equal(r.prints[0].hidden, false);
  const norm = (s) => s.replace(/\s+/g, '');
  assert.equal(norm(r.prints[0].html), norm(r.shown), '#print holds the whole summary the panel shows');
  await page.evaluate(() => dispatchEvent(new Event('afterprint')));
  assert.equal(await page.evaluate(() => document.getElementById('print').hidden), true, 'put back when printing ends');
});

test('printing in print media shows only the summary and has no fixed-height ancestor (WebKit emulated print)', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#out');
  await outReady(page);
  await page.evaluate(() => {
    // what happened between the click and the check (CI fails here now and then)
    window.__log = [];
    window.print = () => __log.push('print');
    addEventListener('afterprint', () => __log.push('afterprint'));
    matchMedia('print').addEventListener('change', (e) => __log.push(`print media ${e.matches}`));
  });
  const btn = page.locator('#out [data-act="advisor"]');
  await btn.click();
  // the click reached the action: summary mode is on before the print media is (else: what was under the pointer)
  const on = await page.waitForFunction(() => document.documentElement.classList.contains('print-summary'), null, { timeout: 5000 }).then(() => true, () => false);
  if (!on) {
    const at = await btn.evaluate((b) => {
      const r = b.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { under: e && (e.id || e.className || e.tagName), log: window.__log };
    });
    assert.fail(`summary mode was not observed within 5 s of the click (now under the button, and events so far): ${JSON.stringify(at)}`);
  }
  await page.emulateMedia({ media: 'print' });
  const m = await page.evaluate(() => {
    const show = (e) => getComputedStyle(e).display !== 'none';
    const shown = [...document.body.children].filter(show).map((e) => e.id || e.tagName.toLowerCase());
    const chain = [];
    for (let e = document.getElementById('print'); e; e = e.parentElement) {
      const s = getComputedStyle(e);
      chain.push({ el: e.id || e.tagName.toLowerCase(), pos: s.position, oy: s.overflowY, maxH: s.maxHeight, clipped: e.scrollHeight > e.clientHeight + 1 && s.overflowY !== 'visible' });
    }
    // the state behind a failure: is the summary class on, is the print media on, is the summary filled
    const why = { cls: document.documentElement.className, media: matchMedia('print').matches, hidden: document.getElementById('print').hidden, log: window.__log };
    return { shown, chain, why };
  });
  assert.deepEqual(m.shown.filter((s) => !['print', 'SCRIPT', 'script'].includes(s)), [], `only the summary shows ${JSON.stringify(m.why)}`);
  for (const c of m.chain) {
    assert.ok(['static', 'relative'].includes(c.pos), `${c.el}: position ${c.pos}`);
    assert.equal(c.clipped, false, `${c.el} clips its content`);
    assert.ok(c.maxH === 'none', `${c.el}: max-height ${c.maxH}`);
  }
});

test('printing in Chromium paginates a long summary: more than one page, the last line is on a page', async (t) => {
  // CHROMIUM_PATH: a local rerun where Playwright's own Chromium build is not installed; CI uses the default one
  chrome ??= await playwright.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined }).catch((e) => {
    if (/Executable doesn't exist/.test(String(e))) return null; // not installed: a local run; any other failure is a failure
    throw e;
  });
  if (!chrome) return t.skip('Chromium is not installed for this Playwright');
  const page = await visitIn(chrome, t, 'desktop', DONE, '#out', 'light', false, false, { design: 'a' });
  await outReady(page);
  await page.evaluate(() => {
    window.print = () => {};
  });
  await page.locator('#out [data-act="advisor"]').click();
  await page.evaluate(() => {
    const p = document.getElementById('print');
    const rows = Array.from({ length: 90 }, (_, i) => `<p>שורת בדיקה ${i + 1} ${'ארוכה '.repeat(8)}</p>`).join('');
    p.insertAdjacentHTML('beforeend', `${rows}<p>סוף-הסיכום-MARKER</p>`);
  });
  const pdf = await page.pdf({ format: 'A4', printBackground: true });
  const r = await page.evaluate(async (b64) => {
    const pdfjs = await import('./vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', location.href).href;
    const doc = await pdfjs.getDocument({ data: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) }).promise;
    const texts = [];
    for (let n = 1; n <= doc.numPages; n++) texts.push((await (await doc.getPage(n)).getTextContent()).items.map((i) => i.str).join(' '));
    return { pages: doc.numPages, texts };
  }, pdf.toString('base64'));
  assert.ok(r.pages > 1, `${r.pages} pages`);
  assert.ok(r.texts.at(-1).includes('MARKER') || r.texts.join(' ').includes('MARKER'), 'the last line is in the file');
  assert.ok(!r.texts[0].includes('MARKER'), 'and not on the first page');
});

test('the info panel lists every footer link and the unofficial notice', async (t) => {
  const page = await visit(t, 'phone', DONE, '');
  await page.locator('#week .blk').first().waitFor({ state: 'attached', timeout: 30000 }); // let the first load finish: a reload would abort its fetches
  await page.context().route('**/settings.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ supportEmail: 'help@planner-tools.org', counselingUrl: 'https://example.test/counsel' }) }));
  await page.reload();
  await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
  await page.locator('.menu-btn').click();
  await page.locator('#drawer[open]').waitFor();
  await page.locator('#drawer [data-act="panel"][data-panel="info"]').click();
  await page.locator('#drawer .info-sec').first().waitFor();
  const r = await page.evaluate(() => ({
    foot: [...document.querySelectorAll('.site-foot a')].filter((a) => !a.closest('[hidden]')).map((a) => a.getAttribute('href')),
    info: [...document.querySelectorAll('#drawer a')].map((a) => a.getAttribute('href')),
    text: document.querySelector('#drawer').innerText
  }));
  assert.ok(r.foot.length >= 6, `the footer has its links: ${r.foot}`);
  for (const h of r.foot) assert.ok(r.info.includes(h), `the info panel has ${h}`);
  assert.match(r.text, /אינו קשור למכללת אפקה/);
  assert.match(r.text, /נבדק|השתנה לאחרונה/, 'the freshness line');
});

test('the unofficial line is visible on every screen at 320', async (t) => {
  const page = await visit(t, { width: 320, height: 640 }, DONE, '');
  await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
  const bad = [];
  for (const h of ['', '#me', '#courses', '#prefs', '#friends', '#out', '#edit']) {
    await page.evaluate((x) => (location.hash = x), h);
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => {
      const e = document.querySelector('.a-unofficial');
      const b = e?.getBoundingClientRect();
      return e && b && { vis: e.checkVisibility(), left: b.left, right: b.right, top: b.top, h: b.height, text: e.textContent };
    });
    if (!r || !r.vis || r.left < -0.5 || r.right > 320.5 || r.h < 8 || !/לא רשמי/.test(r.text)) bad.push(`${h || 'board'}: ${JSON.stringify(r)}`);
  }
  assert.deepEqual(bad, []);
});

test('☰ has ordered tour, map, info and erase rows, no mode or theme row, and erase confirms', async (t) => {
  const page = await visit(t, 'phone', DONE, '');
  await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
  await page.locator('.menu-btn').click();
  await page.locator('#drawer[open]').waitFor();
  assert.equal(await page.locator('#drawer .mode-link').count(), 0, 'the tabs are the mode switch');
  assert.equal(await page.locator('#drawer .theme-btn').count(), 0);
  assert.deepEqual(await page.locator('#drawer .a-menu > li button').allTextContents().then((xs) => xs.map((s) => s.trim())),
    ['סיור באתר', 'מפת התקדמות', 'מידע ותנאים', 'מחק את כל הנתונים שלי']);
  for (const sel of ['[data-act="tour"]', '[data-act="openMap"]', '[data-act="panel"][data-panel="info"]', '[data-act="eraseAll"]'])
    assert.equal(await page.locator(`#drawer ${sel}`).count(), 1, sel);
  // erase asks first, and ביטול leaves everything
  await page.locator('#drawer [data-act="eraseAll"]').click();
  const ask = page.locator('dialog[open]').last();
  await ask.getByRole('button', { name: 'ביטול' }).click();
  assert.equal(await page.evaluate(() => Boolean(localStorage.getItem('afeka-sched-v1'))), true, 'nothing erased');
  // the map opens over the menu
  await page.locator('#drawer [data-act="openMap"]').click();
  await page.locator('#pmap[open]').waitFor();
});

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

// --- Codex review of Task 5 ---
test('a build that ends after the tool was left leaves no file: another tool, the other mode', async (t) => {
  for (const exit of ['tool', 'mode']) {
    const page = await visit(t, 'desktop', DONE, '');
    await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
    const hold = holdFirstFont(page);
    await page.locator('.dock [data-tool="out"]').click();
    await hold.reached;
    if (exit === 'tool') await page.locator('.dock [data-tool="courses"]').click();
    else await page.locator('.a-top .modes a[data-mode="edit"]').click();
    hold.release();
    await page.waitForTimeout(800);
    assert.equal(await held(page), false, `a late build after leaving by ${exit}`);
  }
});

test('a failed load while #out is open drops the file; a resize across 1080px keeps it', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#out');
  await pdfReady(page);
  await page.setViewportSize({ width: 700, height: 800 }); // the column becomes a sheet: the same tool
  await page.waitForTimeout(300);
  assert.equal(await held(page), true, 'a resize keeps the file');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(300);
  assert.equal(await held(page), true);
  await page.evaluate(async () => {
    (await import('./app.js')).app.loadFailed = true;
    dispatchEvent(new Event('hashchange'));
  });
  await page.waitForTimeout(200);
  assert.equal(await held(page), false, 'a failure drops it');
});

test('focus on the take-out heading or a button survives the tool being drawn again', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#out');
  await outReady(page);
  await page.evaluate(() => document.getElementById('outTitle').focus());
  await page.evaluate(async () => (await import('./ui-drawer.js')).renderOut());
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'outTitle', 'the heading');
  await page.locator('#out [data-act="copyReg"]').focus();
  await page.evaluate(async () => (await import('./ui-drawer.js')).renderOut());
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), 'copyReg', 'a button');
});

test('☰ -> information -> back is one sheet: back focuses its info row, and closing returns to ☰', async (t) => {
  const page = await visit(t, 'phone', DONE, '');
  await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
  await page.locator('.menu-btn').click();
  await page.locator('#drawer[open]').waitFor();
  await page.locator('#drawer [data-act="panel"][data-panel="info"]').click();
  await page.locator('#drawer .info-sec').first().waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'drawerTitle', 'the information heading');
  await page.locator('#drawer [data-act="menu"]').click();
  await page.locator('#drawer .a-menu').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), 'menu-info', 'the information row');
  assert.equal(await page.locator('#drawer h2').first().textContent(), 'תפריט');
  await page.keyboard.press('Escape');
  await page.locator('#drawer[open]').waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.activeElement?.classList.contains('menu-btn'));
});

test('the header keeps an accessible 44px theme button at 320px and it flips the theme', async (t) => {
  const page = await visit(t, { width: 320, height: 640 }, DONE, '');
  await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
  const theme = page.locator('.a-top .theme-btn');
  const box = await theme.boundingBox();
  assert.ok(box && box.width >= 44 && box.height >= 44 && box.x >= 0 && box.x + box.width <= 320);
  assert.match(await theme.innerText(), /מצב כהה|מצב בהיר/);
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await theme.click();
  assert.notEqual(await page.evaluate(() => document.documentElement.dataset.theme), before);
});
