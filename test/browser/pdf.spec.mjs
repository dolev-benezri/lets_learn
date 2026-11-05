// PDF import in a real browser: on a browser without the newer JavaScript features, when pdf.js stops answering, and through the OCR path with a stand-in for tesseract.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { STUDENT, gradeSheetPdf, visit as visitIn, launch } from './helpers.mjs';

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
  const page = await visitIn(browser, t, 'phone', SEED, '#prefs');
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
