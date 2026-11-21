// PDF import in a real browser: on a browser without the newer JavaScript features, when pdf.js stops answering, and through the OCR path with a stand-in for tesseract.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { STUDENT, friendsHash, gradeSheetPdf, visit as visitIn, launch } from './helpers.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const GROUP = '270600101', // a real group of 2027-1/30-2026 in the frozen data
  OTHER_GROUP = '270600201';
const SEED = { 'afeka-sched-v1-terms': '2', 'afeka-sched-v1': JSON.stringify({ ...STUDENT, passed: [] }) };
const SLOW = /נמשכה יותר מדי/,
  NO_TEXT = /לא נמצא טקסט/;

// What Safari on iOS 17 does not have and the current pdf.js would call. A worker runs no init script, so its file gets the same lines.
const GONE = `delete globalThis.Iterator;
  for (const [o, names] of [
    [Promise, ['try']],
    [Map.prototype, ['getOrInsert', 'getOrInsertComputed']],
    [WeakMap.prototype, ['getOrInsert', 'getOrInsertComputed']],
    [Math, ['sumPrecise']],
    [URL, ['parse']],
    [Uint8Array, ['fromBase64', 'fromHex']],
    [Uint8Array.prototype, ['toBase64', 'toHex']],
    [RegExp, ['escape']],
    [Response.prototype, ['bytes']],
    [ReadableStream, ['from']],
    [ReadableStream.prototype, ['values', Symbol.asyncIterator]]
  ]) for (const n of names) delete o[n];\n`;

async function oldBrowser(page) {
  await page.addInitScript(GONE);
  await page.route('**/vendor/pdfjs/pdf.worker.min.mjs', async (route) => {
    const r = await route.fetch();
    await route.fulfill({ response: r, body: GONE + (await r.text()) });
  });
  await page.waitForLoadState('networkidle'); // a reload that cuts the first load's requests short reads as script errors
  await page.reload();
}
// A worker that loads and never answers: pdf.js waits on it for ever. The clock runs on by hand, so the test does not sit out the limit.
async function stalledPdf(page) {
  await page.route('**/vendor/pdfjs/pdf.worker.min.mjs', (r) => r.fulfill({ contentType: 'text/javascript', body: '' }));
  await page.clock.install();
}
async function waitForLimit(page, locator, re) {
  for (let i = 0; i < 40 && !re.test(await locator.innerText()); i++) {
    await page.clock.fastForward(5000);
    await page.waitForTimeout(50);
  }
  assert.match(await locator.innerText(), re);
}
const uploadSheet = (page) =>
  page.locator('#gradeFile').setInputFiles({
    name: 'sheet.pdf',
    mimeType: 'application/pdf',
    buffer: gradeSheetPdf(['10016 Calculus 4.0 85', '30003 Physics 3.5 90'])
  });
const uploadFriend = (page, lines) =>
  page.locator('#feFile').setInputFiles({ name: 'friend.pdf', mimeType: 'application/pdf', buffer: gradeSheetPdf(lines) });
async function friendEditor(t, prepare = async () => {}) {
  const page = await visitIn(browser, t, 'phone', SEED, friendsHash());
  await prepare(page);
  await page.locator('#openFriendEditor').click();
  await page.locator('#friendEd[open]').waitFor();
  return page;
}
const feStatus = (page) => page.locator('#feImpStatus');
const controlsBack = async (page) => {
  assert.equal(await page.locator('#feFile').isDisabled(), false, 'the file field works again');
  assert.equal(await page.locator('#feFind').isDisabled(), false, 'the find button works again');
};

test('a browser without the newer features reads a grade sheet', async (t) => {
  const page = await visitIn(browser, t, 'phone', SEED, '#me');
  await oldBrowser(page);
  await page.locator('#gradeFile').waitFor({ state: 'attached' });
  await uploadSheet(page);
  const preview = page.locator('dialog.dlg-rows[open]');
  await preview.waitFor({ timeout: 30000 });
  assert.equal(await preview.locator('tbody tr').count(), 2);
});

test('a browser without the newer features reads a friend PDF', async (t) => {
  const page = await friendEditor(t, oldBrowser);
  await uploadFriend(page, [GROUP, OTHER_GROUP]);
  await feStatus(page).filter({ hasText: /נמצאו 2 קבוצות/ }).waitFor({ timeout: 30000 });
  await controlsBack(page);
});

test('a grade sheet that pdf.js never answers on ends with a message, and nothing is applied', async (t) => {
  const page = await visitIn(browser, t, 'phone', SEED, '#me');
  await stalledPdf(page);
  await page.locator('#gradeFile').waitFor({ state: 'attached' });
  await uploadSheet(page);
  await waitForLimit(page, page.locator('#gradeMsg'), SLOW);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1')).passed), []);
});

test('a friend PDF that pdf.js never answers on ends with a message, and the controls work again', async (t) => {
  const page = await friendEditor(t);
  await stalledPdf(page);
  await uploadFriend(page, [GROUP]);
  await waitForLimit(page, feStatus(page), SLOW);
  await controlsBack(page);
});

// A grade sheet whose track or cohort changes while it is read (or while the preview is open) must not be applied: audit 2026-11-19 finding 9.
const STALE = /השתנו בזמן הייבוא.*ייבאו את הגליון שוב/;
// Holds the pdf.js worker's file back until the returned function is called: the sheet is "being read" for as long as the test wants.
async function holdPdf(page) {
  let release;
  const gate = new Promise((r) => (release = r));
  await page.route('**/vendor/pdfjs/pdf.worker.min.mjs', async (route) => {
    await gate;
    await route.continue();
  });
  return release;
}
// The same program, the next cohort: the state and the data files are replaced, the way a track switch does it.
const switchCohort = (page) => page.evaluate(async () => (await import('./app.js')).switchTo(30, 2027));
const gradeOf = (page, id) => page.evaluate(async (i) => (await import('./app.js')).app.state.grades[i] ?? null, id);
const ALL_DONE = { ...SEED, 'afeka-sched-v1': JSON.stringify({ ...STUDENT, passed: ['10016', '30003'], grades: { 10016: 85, 30003: 90 } }) };

test('a track switch while the grade sheet is read: nothing is applied, no preview opens, and the student is told to import again', async (t) => {
  const page = await visitIn(browser, t, 'phone', SEED, '#me');
  await page.locator('#gradeFile').waitFor({ state: 'attached' });
  const release = await holdPdf(page);
  await uploadSheet(page);
  await page.locator('#gradeMsg').filter({ hasText: /קוראים/ }).waitFor();
  assert.equal(await switchCohort(page), true, 'the switch went through');
  release();
  await page.locator('#gradeMsg').filter({ hasText: STALE }).waitFor({ timeout: 15000 });
  assert.equal(await page.locator('dialog.dlg-rows[open]').count(), 0, 'no preview for a sheet read against the old track');
  assert.equal(await gradeOf(page, '10016'), null);
});

test('a track switch while the sheet is read, when the sheet changes nothing: still told to import again, not "all up to date"', async (t) => {
  const page = await visitIn(browser, t, 'phone', ALL_DONE, '#me');
  await page.locator('#gradeFile').waitFor({ state: 'attached' });
  const release = await holdPdf(page);
  await uploadSheet(page);
  await page.locator('#gradeMsg').filter({ hasText: /קוראים/ }).waitFor();
  assert.equal(await switchCohort(page), true);
  release();
  await page.locator('#gradeMsg').filter({ hasText: STALE }).waitFor({ timeout: 15000 });
});

test('a sheet that changes nothing, with no switch: "all up to date", as before', async (t) => {
  const page = await visitIn(browser, t, 'phone', ALL_DONE, '#me');
  await page.locator('#gradeFile').waitFor({ state: 'attached' });
  await uploadSheet(page);
  await page.locator('#gradeMsg').filter({ hasText: /והכול כבר מעודכן/ }).waitFor({ timeout: 30000 });
  assert.equal(await page.locator('dialog.dlg-rows[open]').count(), 0);
});

test('a track switch while the preview is open: applying it changes nothing, and the student is told to import again', async (t) => {
  const page = await visitIn(browser, t, 'phone', SEED, '#me');
  await page.locator('#gradeFile').waitFor({ state: 'attached' });
  await uploadSheet(page);
  const preview = page.locator('dialog.dlg-rows[open]');
  await preview.waitFor({ timeout: 30000 });
  assert.equal(await switchCohort(page), true);
  await preview.locator('button[value="ok"]').click();
  await page.locator('#gradeMsg').filter({ hasText: STALE }).waitFor({ timeout: 15000 });
  assert.equal(await gradeOf(page, '10016'), null, 'the new track has no grade from the old sheet');
  await page.waitForTimeout(300); // the toast is filled 50 ms after it is shown
  assert.equal(await page.locator('#toast').filter({ hasText: /עודכנ/ }).count(), 0, 'and no "updated" message');
});

test('a track switch while the preview is open leaves the state alone, also what the sheet would have confirmed (an assumed pass)', async (t) => {
  const assumed = { ...SEED, 'afeka-sched-v1': JSON.stringify({ ...STUDENT, passed: ['10016'], assumed: ['10016'] }) };
  const page = await visitIn(browser, t, 'phone', assumed, '#me');
  await page.locator('#gradeFile').waitFor({ state: 'attached' });
  await uploadSheet(page);
  const preview = page.locator('dialog.dlg-rows[open]');
  await preview.waitFor({ timeout: 30000 });
  assert.equal(await switchCohort(page), true);
  await preview.locator('button[value="ok"]').click();
  await page.locator('#gradeMsg').filter({ hasText: STALE }).waitFor({ timeout: 15000 });
  assert.equal(await page.evaluate(async () => (await import('./app.js')).app.state.assumed.includes('10016')), true, 'the pass is still only assumed');
});

test('a refresh of the page while the sheet is read, and while the preview is open, is no track switch: the import goes through and is saved', async (t) => {
  const page = await visitIn(browser, t, 'phone', SEED, '#me');
  await page.locator('#gradeFile').waitFor({ state: 'attached' });
  // in the year view every refresh makes a new data object: comparing that one would call this import stale
  const refresh = () =>
    page.evaluate(async () => {
      const m = await import('./app.js'),
        before = m.app.data;
      m.refresh();
      return before !== m.app.data;
    });
  const release = await holdPdf(page);
  await uploadSheet(page);
  await page.locator('#gradeMsg').filter({ hasText: /קוראים/ }).waitFor();
  assert.equal(await refresh(), true, 'a refresh replaces the data object');
  release();
  const preview = page.locator('dialog.dlg-rows[open]');
  await preview.waitFor({ timeout: 30000 });
  assert.equal(await refresh(), true);
  await preview.locator('button[value="ok"]').click();
  await page.locator('#toast').filter({ hasText: /עודכנו 2 קורסים/ }).waitFor();
  assert.equal(await gradeOf(page, '10016'), 85);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1')).grades);
  assert.deepEqual([saved['10016'], saved['30003']], [85, 90], 'and it is in the saved record, not only in memory');
  assert.equal(await page.locator('#gradeMsg').filter({ hasText: STALE }).count(), 0);
});

// A stand-in for tesseract: the path through thumbnails, the tick boxes, scanCanvases and the merge runs for real, and only the recognition is canned.
const ocr = (recognize) => `let done = 0;
  globalThis.__ocrDone = () => done;
  export default { createWorker: async () => ({ recognize: ${recognize}, terminate: async () => { done++; } }) };`;
async function scannedPdf(t, recognize) {
  const page = await friendEditor(t);
  await page.route('**/vendor/tesseract/tesseract.esm.min.js', (r) => r.fulfill({ contentType: 'text/javascript', body: ocr(recognize) }));
  await uploadFriend(page, ['no group number here']);
  await page.locator('#feImpPages input[type="checkbox"]').first().check({ timeout: 30000 });
  await page.locator('[data-fe="pages"]').click();
  return page;
}

test('a scanned friend PDF: the ticked slide goes through OCR, its group is found, and the worker ends', async (t) => {
  const page = await scannedPdf(t, `async () => ({ data: { text: '${GROUP}', blocks: [] } })`);
  await feStatus(page).filter({ hasText: /נמצאה קבוצה אחת/ }).waitFor({ timeout: 30000 });
  await controlsBack(page);
  assert.equal(await page.evaluate(() => globalThis.__ocrDone()), 1);
});

test('a scan that fails says so, the worker ends, and the controls work again', async (t) => {
  const page = await scannedPdf(t, `async () => { throw new Error('ocr failed'); }`);
  await feStatus(page).filter({ hasText: NO_TEXT }).waitFor({ timeout: 30000 });
  await controlsBack(page);
  assert.equal(await page.evaluate(() => globalThis.__ocrDone()), 1);
});

test('thumbnails that fail after the editor was closed say nothing to it, and no error escapes', async (t) => {
  const page = await friendEditor(t);
  // The first thumbnail closes the editor and then fails, the way a slow file fails after the student gave up on it. visit() fails the test on a script error.
  await page.evaluate(() => {
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (...a) {
      if (this.width > 0 && this.width <= 240) {
        HTMLCanvasElement.prototype.getContext = real;
        window.__thumbFailed = true;
        document.querySelector('[data-fe="cancel"]').click();
        throw new Error('thumbnail failed');
      }
      return real.apply(this, a);
    };
  });
  await uploadFriend(page, ['no group number here']);
  for (let i = 0; i < 200 && !(await page.evaluate(() => window.__thumbFailed)); i++) await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.__thumbFailed), true, 'the thumbnail was reached');
  await page.locator('#friendEd[open]').waitFor({ state: 'detached' });
  await page.waitForTimeout(200);
});

// A PDF of the pages given, built here (synthetic): { w, h } in points, `draw` is the content stream, `image` is { w, h } of a gray picture (flat, so it packs small)
// drawn over the whole page. Every page takes three object numbers (page, content, picture), so the numbers are known before anything is written.
function deckPdf(pages) {
  let out = Buffer.from('%PDF-1.4\n', 'latin1');
  const at = [],
    add = (n, body) => {
      at[n] = out.length;
      out = Buffer.concat([out, Buffer.from(`${n} 0 obj\n`, 'latin1'), Buffer.from(body, 'latin1'), Buffer.from('\nendobj\n', 'latin1')]);
    };
  const stream = (dict, data) => `<< ${dict} /Length ${data.length} >>\nstream\n${data.toString('latin1')}\nendstream`;
  add(1, '<< /Type /Catalog /Pages 2 0 R >>');
  add(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 3} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  add(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  pages.forEach((p, i) => {
    const [pg, content, img] = [4 + i * 3, 5 + i * 3, 6 + i * 3],
      draw = (p.image ? `q ${p.w} 0 0 ${p.h} 0 0 cm /Im0 Do Q ` : '') + (p.draw ?? '');
    add(pg, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.w} ${p.h}] /Contents ${content} 0 R /Resources << /Font << /F1 3 0 R >> ${p.image ? `/XObject << /Im0 ${img} 0 R >>` : ''} >> >>`);
    add(content, stream('', Buffer.from(draw, 'latin1')));
    add(
      img,
      p.image
        ? stream(`/Type /XObject /Subtype /Image /Width ${p.image.w} /Height ${p.image.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, deflateSync(Buffer.alloc(p.image.w * p.image.h, 200)))
        : 'null'
    );
  });
  const n = 3 + pages.length * 3 + 1,
    xref = out.length;
  out = Buffer.concat([
    out,
    Buffer.from(`xref\n0 ${n}\n0000000000 65535 f \n${at.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`, 'latin1')
  ]);
  return out;
}
const NOTE = 'BT /F1 8 Tf 20 10 Td (no group number here) Tj ET '; // text with no group id in it: the file counts as a scan
// the rows of a weekly grid, drawn: 4 day headers (rightmost = ראשון) and one block in the rightmost column, 17:00-19:50 when the first row is 8:00
const GRID = `${NOTE}0.8 0.55 0.75 rg ${[40, 280, 520, 760].map((x) => `${x} 456 200 24 re f`).join(' ')} 0 0.35 0.9 rg 764 171 192 68 re f`;
const TABLE_SLIDE = '1 6001 אנגלית בסיסי (מתחילים) סופי-הרצאה ד"ר אלמוני 3.00 3.00 יום שני, 08:00-10:50 יום רביעי, 08:00-10:50';
const BLOCK_NAME = 'אנגלית בסיסי (מתחילים)';

// Notes every big canvas (not the 240-wide thumbnails) the page draws on: the canvas itself and its size when it was drawn on.
const watchCanvases = (page) =>
  page.evaluate(() => {
    const real = HTMLCanvasElement.prototype.getContext;
    window.__big = [];
    window.__sizes = [];
    HTMLCanvasElement.prototype.getContext = function (...a) {
      if (this.width > 240 && !window.__big.includes(this)) {
        window.__big.push(this);
        window.__sizes.push([this.width, this.height]);
      }
      return real.apply(this, a);
    };
  });
// Counts the times pdf.js is told to let go of a page (page.cleanup): every PDFPageProxy shares the prototype that is patched.
async function watchCleanups(page) {
  const b64 = deckPdf([{ w: 100, h: 100 }]).toString('base64');
  await page.evaluate(async (data) => {
    const { withPdf } = await import('./grade-import.js');
    window.__cleaned = 0;
    await withPdf(new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], 'x.pdf'), async (doc) => {
      const proto = Object.getPrototypeOf(await doc.getPage(1)),
        real = proto.cleanup;
      proto.cleanup = function (...a) {
        window.__cleaned++;
        return real.apply(this, a);
      };
    });
  }, b64);
}
async function scannedDeck(t, pages, recognize) {
  const page = await friendEditor(t);
  await page.route('**/vendor/tesseract/tesseract.esm.min.js', (r) => r.fulfill({ contentType: 'text/javascript', body: ocr(recognize) }));
  await watchCanvases(page);
  await watchCleanups(page);
  await page.locator('#feFile').setInputFiles({ name: 'deck.pdf', mimeType: 'application/pdf', buffer: deckPdf(pages) });
  const boxes = page.locator('#feImpPages input[type="checkbox"]');
  for (let i = 0; i < pages.length; i++) await boxes.nth(i).check({ timeout: 30000 });
  await page.locator('[data-fe="pages"]').click();
  return page;
}

test('a scanned deck is read one slide at a time: each is freed before the next is drawn, and a table still wins over a grid', async (t) => {
  // reads how many big canvases are alive each time it is asked to read; the first slide is a grid (its blocks are read from crops), the second a table
  const page = await scannedDeck(
    t,
    [
      { w: 960, h: 540, draw: GRID },
      { w: 960, h: 540, draw: NOTE },
      { w: 595, h: 842, draw: NOTE }
    ],
    `async (c, opts) => {
      (globalThis.__alive ??= []).push(window.__big.filter((x) => x.width > 0).length);
      (globalThis.__cleanedAt ??= []).push(window.__cleaned);
      if (opts.rectangle) return { data: { text: '${BLOCK_NAME}' } };
      return { data: { text: ['', '${TABLE_SLIDE}', ''][(globalThis.__slide = (globalThis.__slide ?? -1) + 1)], blocks: [] } };
    }`
  );
  await feStatus(page).filter({ hasText: /נמצאה קבוצה אחת/ }).waitFor({ timeout: 30000 });
  await controlsBack(page);
  const alive = await page.evaluate(() => globalThis.__alive);
  assert.equal(alive.length, 4, 'three slides and the one block of the grid were read');
  assert.deepEqual(alive, alive.map(() => 1), 'only the slide being read was alive each time');
  assert.equal(await page.evaluate(() => window.__big.length), 3);
  assert.equal(await page.evaluate(() => window.__big.every((c) => c.width === 0)), true, 'and the last one is freed too');
  assert.equal(await page.evaluate(() => globalThis.__ocrDone()), 1);
  assert.deepEqual(await page.evaluate(() => globalThis.__slide), 2);
  // pdf.js's own copy of a slide is let go as soon as the slide is drawn: when each read starts, the slides drawn so far are all cleaned
  assert.deepEqual(await page.evaluate(() => globalThis.__cleanedAt), [1, 1, 2, 3]);
  // the group is the table's (the grid says 270600101): the weekly view of the friend's schedule holds that one only
  const placed = await page.evaluate(() => [...new Set([...document.querySelectorAll('#feWeek [data-gid]')].map((b) => b.dataset.gid))]);
  assert.deepEqual(placed, ['270600102']);
});

test('a scanned page that is very tall is drawn within the pixel cap, and a normal page is drawn as before', async (t) => {
  // the stand-in reads the size of each canvas it is given
  const page = await scannedDeck(
    t,
    [
      { w: 595, h: 3000, draw: NOTE },
      { w: 595, h: 842, draw: NOTE }
    ],
    `async (c) => {
      (globalThis.__read ??= []).push([c.width, c.height]);
      return { data: { text: '', blocks: [] } };
    }`
  );
  await feStatus(page).filter({ hasText: /לא זוהה אף מספר קבוצה/ }).waitFor({ timeout: 60000 });
  await controlsBack(page);
  const [tall, a4] = await page.evaluate(() => globalThis.__read);
  assert.ok(tall[0] * tall[1] <= 16e6, `${tall} is over 16 million pixels`);
  assert.ok(tall[0] > 1000 && Math.abs(tall[1] / tall[0] - 3000 / 595) < 0.01, "in the page's own shape");
  assert.deepEqual(a4, [2880, 4076], 'a normal A4 page is 2,880 wide, as it was');
});
