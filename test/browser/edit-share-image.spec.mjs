// "שלח כתמונה" on the edit page (design A) in WebKit: the week on the screen goes as a PNG with the friend link, through the share sheet
// (recorded here: the test browser has none) or, where there is no file sharing, as a download with the link copied.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DONE, visit as visitIn, launch } from './helpers.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const L = (course, name, type, group, day, start, end) => ({ course, name, type, group, day, start, end });
const BASE = [
  L('30003', 'מבוא לכימיה', 'סופי-הרצאה+תרגול', '273000302', 4, '14:00', '15:50'), L('30003', 'מבוא לכימיה', 'תרגול', '273000302/1', 4, '16:00', '16:50'),
  L('30112', 'תרמודינמיקה 1', 'סופי-הרצאה+תרגול', '273011204', 3, '15:00', '16:50'), L('30112', 'תרמודינמיקה 1', 'תרגול', '273011204/1', 3, '17:00', '17:50')
];
const FIXED_ONLY = [L('x1', 'קורס שהוזן ידנית', 'הרצאה', null, 2, '10:00', '12:00'), L('x2', 'עוד קורס ידני', 'תרגול', null, 4, '12:00', '13:30')];
const DS = { year: 2027, sem: 'א', program: 30, startYear: 2026 };
const state = (over = {}) => ({ v: 1, dataset: DS, registered: false, owned: [], original: BASE, baseline: BASE, movable: ['30003'], goal: { dayOff: 4 }, ...over });
const seed = (over) => ({ ...DONE, 'afeka-sched-v1-edit': JSON.stringify(state(over)) });
const visit = (t, size, s, hash = '#edit/changes', opts = {}) => visitIn(browser, t, size, s, hash, 'light', false, false, opts);
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1-edit')));
const search = async (page) => {
  await page.locator('[data-ed="search"]').click();
  await page.locator('.prop-nav').waitFor({ timeout: 30000 });
};
// the test browser has no share sheet: one that records what it is given (deny: the first call fails as a lost tap would)
const recordShares = (page, deny = null) =>
  page.evaluate((deny) => {
    window.__shares = [];
    let denied = false;
    // still inside the tap: set by the click, cleared once its task is over. It catches a wait through a task (a fetch, a stream like the
    // link's compression, a timer, toBlob), not an await of an already settled promise, which iPhone allows anyway
    window.__inTap = false;
    document.addEventListener('click', () => ((window.__inTap = true), setTimeout(() => (window.__inTap = false), 0)), true);
    navigator.canShare = (d) => !!d?.files?.length;
    navigator.share = async (d) => {
      if (deny && !denied) {
        denied = true;
        throw new DOMException('', deny);
      }
      const f = d.files?.[0];
      window.__shares.push({ name: f?.name, type: f?.type, size: f?.size, text: d.text, url: d.url ?? null, inTap: window.__inTap });
    };
  }, deny);
const shares = (page) => page.evaluate(() => window.__shares);
const linkGroups = (page, text) =>
  page.evaluate(async (text) => {
    const { decode } = await import('./share.js');
    return (await decode(text.slice(text.indexOf('#f=') + 3).split(/\s/)[0])).groups;
  }, text);
const realGroups = (lessons) => [...new Set(lessons.map((l) => l.group).filter(Boolean))].sort();
const toast = (page) => page.locator('#toast').textContent();

test('phone: with a proposal, the button follows "שמור הצעה" and sends one PNG and a text with the proposal\'s link', async (t) => {
  const page = await visit(t, 'phone', seed());
  await search(page);
  const order = await page.locator('.prop-actions > button').evaluateAll((bs) => bs.map((b) => b.dataset.ed));
  assert.equal(order[order.indexOf('saveProposal') + 1], 'shareImage');
  assert.equal(await page.locator('[data-ed="shareImage"]').innerText(), 'שלח כתמונה');
  await recordShares(page);
  await page.waitForTimeout(300); // the link is made while the page is drawn
  await page.locator('[data-ed="shareImage"]').click();
  await page.waitForFunction(() => window.__shares.length === 1);
  const [s] = await shares(page);
  assert.equal(s.inTap, true, 'navigator.share is called inside the tap: nothing awaited on the way (an iPhone would refuse)');
  assert.equal(s.name, 'afeka-schedule.png');
  assert.equal(s.type, 'image/png');
  assert.ok(s.size > 20000, `size ${s.size}`);
  assert.equal(s.url, null, 'the link goes inside the text');
  assert.match(s.text, /שיתף\/ה איתך מערכת שעות: http.*#f=/);
  const groups = await linkGroups(page, s.text);
  assert.ok(groups.every((g) => !g.startsWith('fixed:')));
  // the link is the proposal shown: saving it makes those groups the schedule
  await page.locator('[data-ed="saveProposal"]').click();
  assert.deepEqual([...groups].sort(), realGroups((await saved(page)).baseline));
});

test('phone: after saving, the button sits by the search and sends the current week', async (t) => {
  const page = await visit(t, 'phone', seed());
  await search(page);
  await page.locator('[data-ed="saveProposal"]').click();
  assert.equal(await page.locator('.edit-search [data-ed="shareImage"]').count(), 1);
  await recordShares(page);
  await page.locator('.edit-search [data-ed="shareImage"]').click();
  await page.waitForFunction(() => window.__shares.length === 1);
  const [s] = await shares(page);
  assert.deepEqual((await linkGroups(page, s.text)).sort(), realGroups((await saved(page)).baseline));
});

test('no button on step 1, and none in the classic design', async (t) => {
  const one = await visit(t, 'phone', seed(), '#edit');
  assert.equal(await one.locator('[data-ed="shareImage"]').count(), 0);
  const classic = await visit(t, 'desktop', seed(), '#edit/changes', { design: 'classic' });
  await search(classic);
  assert.equal(await classic.locator('[data-ed="shareImage"]').count(), 0);
});

test('phone: a lost tap (NotAllowedError) asks for a second tap, and the second one shares', async (t) => {
  const page = await visit(t, 'phone', seed());
  await search(page);
  await recordShares(page, 'NotAllowedError');
  await page.locator('[data-ed="shareImage"]').click();
  await page.waitForFunction(() => document.getElementById('toast')?.textContent.includes('לחצו שוב'));
  assert.equal(await toast(page), 'לחצו שוב על "שלח כתמונה" כדי לשלוח.');
  await page.locator('[data-ed="shareImage"]').click();
  await page.waitForFunction(() => window.__shares.length === 1);
});

test('phone: a closed share sheet (AbortError) says nothing', async (t) => {
  const page = await visit(t, 'phone', seed());
  await search(page);
  await recordShares(page, 'AbortError');
  await page.locator('[data-ed="shareImage"]').click();
  await page.waitForTimeout(400);
  assert.equal((await toast(page)) ?? '', '');
  assert.equal(await page.locator('dialog[open]').count(), 0);
});

test('phone: a double tap shares once', async (t) => {
  const page = await visit(t, 'phone', seed());
  await search(page);
  await recordShares(page);
  await page.locator('[data-ed="shareImage"]').evaluate((b) => (b.click(), b.click()));
  await page.waitForFunction(() => window.__shares.length >= 1);
  await page.waitForTimeout(400);
  assert.equal((await shares(page)).length, 1);
});

test('phone: a week of fixed lessons only goes with no link', async (t) => {
  const page = await visit(t, 'phone', seed({ original: FIXED_ONLY, baseline: FIXED_ONLY, movable: [], goal: {} }));
  await recordShares(page);
  await page.locator('.edit-search [data-ed="shareImage"]').click();
  await page.waitForFunction(() => window.__shares.length === 1);
  const [s] = await shares(page);
  assert.equal(s.type, 'image/png');
  assert.ok(!s.text.includes('#f='), s.text);
  assert.match(s.text, /שיתף\/ה איתך מערכת שעות:$/);
});

test('desktop without file sharing: the PNG downloads and the link is copied (the dialog, as the test page has no clipboard)', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await search(page);
  await page.evaluate(() => {
    navigator.canShare = undefined;
  });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('[data-ed="shareImage"]').click()]);
  assert.equal(dl.suggestedFilename(), 'afeka-schedule.png');
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  assert.match(await dlg.locator('textarea').inputValue(), /#f=/);
});

test('desktop: when the image cannot be made, the link is copied instead and nothing is shared', async (t) => {
  const page = await visit(t, 'desktop', seed());
  await search(page);
  await recordShares(page);
  await page.evaluate(() => {
    HTMLCanvasElement.prototype.toDataURL = () => {
      throw new Error('no canvas');
    };
  });
  await page.locator('[data-ed="shareImage"]').click();
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  assert.match(await dlg.locator('textarea').inputValue(), /#f=/);
  assert.deepEqual(await shares(page), []);
});

test('phone: while the share sheet is open the button says aria-disabled="true", and after it the attribute is gone', async (t) => {
  const page = await visit(t, 'phone', seed());
  await search(page);
  await page.evaluate(() => {
    navigator.canShare = () => true;
    navigator.share = () => new Promise((ok) => (window.__close = ok));
  });
  await page.locator('[data-ed="shareImage"]').click();
  await page.waitForFunction(() => window.__close);
  assert.equal(await page.locator('[data-ed="shareImage"]').getAttribute('aria-disabled'), 'true');
  await page.evaluate(() => window.__close());
  await page.waitForFunction(() => !document.querySelector('[data-ed="shareImage"]').hasAttribute('aria-disabled'));
});

test('phone: when the link cannot be made, the image still goes, with no link', async (t) => {
  const page = await visit(t, 'phone', seed());
  await page.evaluate(() => {
    window.CompressionStream = class {
      constructor() {
        throw new Error('no compression here');
      }
    };
  });
  await search(page); // the proposal's link is prepared now, and fails
  await recordShares(page);
  await page.locator('[data-ed="shareImage"]').click();
  await page.waitForFunction(() => window.__shares.length === 1);
  const [s] = await shares(page);
  assert.equal(s.type, 'image/png');
  assert.ok(!s.text.includes('#f='), s.text);
});

for (const size of ['phone', 'desktop'])
  test(`${size}: by the search, "שלח כתמונה" sits under "חפש הצעות" with a gap, not touching`, async (t) => {
    const page = await visit(t, size, seed({ movable: [], goal: {} }));
    await page.locator('.edit-search [data-ed="shareImage"]').waitFor();
    const [a, b] = await page.locator('.edit-search button').evaluateAll((bs) => bs.map((x) => x.getBoundingClientRect().toJSON()));
    assert.ok(b.top - a.bottom >= 8, `gap ${b.top - a.bottom}px`);
  });
