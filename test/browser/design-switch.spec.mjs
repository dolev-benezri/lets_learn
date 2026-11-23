// The design switch (web/design.js): ?design=a puts design A on the page and remembers it; ?design=classic remembers the old one; the choice is a
// localStorage key, absence means the site's default (classic until the flip). Every visit here sets the design explicitly (`{ design: '' }` = none),
// so CI tests what the spec says even where DESIGN is set. No top-level await in a spec: node:test then hangs after the run.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SITE, SIZES, STUDENT, DONE, DESIGN_KEY, launch, visit as visitIn } from './helpers.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const visit = (t, seed, hash = '') => visitIn(browser, t, 'phone', seed, hash, 'light', false, false, { design: '' });
// the app has drawn its first result: its data fetches are done, so the next goto() does not abort them (WebKit reports that as a script error)
const settled = (page) => page.locator('#week .blk').first().waitFor({ timeout: 30000 });
const attr = (page) => page.evaluate(() => document.documentElement.dataset.design ?? null);
const stored = (page) => page.evaluate((k) => localStorage.getItem(k), DESIGN_KEY);
const token = (page, name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toLowerCase(), name);
const A_PRIMARY = '#0a6b66', CLASSIC_PRIMARY = '#2457e6';

test('?design=a sets the attribute, applies the A palette and stores a', async (t) => {
  const page = await visit(t, DONE, '?design=a');
  await settled(page);
  assert.equal(await attr(page), 'a');
  assert.equal(await token(page, '--primary'), A_PRIMARY);
  assert.equal(await stored(page), 'a');
});

test('a later visit with no parameter keeps A', async (t) => {
  const page = await visit(t, DONE, '?design=a');
  await settled(page);
  await page.goto(SITE);
  await settled(page);
  assert.equal(await attr(page), 'a');
  assert.equal(await token(page, '--primary'), A_PRIMARY);
});

test('?design=classic stores classic and the attribute stays off', async (t) => {
  const page = await visit(t, DONE, '?design=a');
  await settled(page);
  await page.goto(SITE + '?design=classic');
  await settled(page);
  assert.equal(await attr(page), null);
  assert.equal(await token(page, '--primary'), CLASSIC_PRIMARY);
  assert.equal(await stored(page), 'classic');
  await page.goto(SITE);
  await settled(page);
  assert.equal(await attr(page), null, 'a later visit keeps classic');
});

test('?design=default clears the key', async (t) => {
  const page = await visit(t, DONE, '?design=a');
  await settled(page);
  await page.goto(SITE + '?design=default');
  await settled(page);
  assert.equal(await stored(page), null);
  assert.equal(await attr(page), null, 'the default is classic until the flip');
});

test('an unknown value is ignored: it neither stores nor changes the choice', async (t) => {
  const page = await visit(t, DONE, '?design=zzz');
  await settled(page);
  assert.equal(await attr(page), null);
  assert.equal(await stored(page), null);
  await page.goto(SITE + '?design=a');
  await settled(page);
  await page.goto(SITE + '?design=zzz');
  await settled(page);
  assert.equal(await attr(page), 'a', 'a stored A survives an unknown value');
  assert.equal(await stored(page), 'a');
});

test('no key and no parameter leaves the attribute off and the classic palette', async (t) => {
  const page = await visit(t, DONE);
  await settled(page);
  assert.equal(await attr(page), null);
  assert.equal(await token(page, '--primary'), CLASSIC_PRIMARY);
  assert.equal(await stored(page), null);
});

test('erase-all removes the key: the visit is back to the default', async (t) => {
  const page = await visit(t, DONE, '?design=a#me');
  await page.locator('[data-act="eraseAll"]').waitFor(); // drawn after the data has loaded: the reload below aborts nothing
  assert.equal(await stored(page), 'a', 'A is remembered before the erase');
  await page.locator('[data-act="eraseAll"]').click();
  const dlg = page.locator('dialog[open]');
  await dlg.getByRole('button', { name: 'מחק הכול' }).click();
  await page.locator('.gate').first().waitFor(); // the reloaded page is a first visit again and has loaded
  assert.equal(await stored(page), null);
  assert.equal(await attr(page), null);
});

// ---- storage blocked, and a link read at load: the query is all that remembers the choice ----
const blockedPage = async (t, url) => {
  const context = await browser.newContext({ viewport: SIZES.phone, locale: 'he-IL' });
  const errors = [];
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      }
    });
  });
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], 'a script error');
  });
  await page.goto(url);
  await page.locator('.gate').first().waitFor({ timeout: 30000 }); // storage is blocked, so this is a first visit: the terms gate means the app has loaded
  return page;
};
const twoGroups = async () =>
  Object.values(JSON.parse(await readFile(new URL('../fixtures/real/2027-1/30-2026.json', import.meta.url), 'utf8')).courses)
    .flatMap((c) => c.groups.map((g) => g.id))
    .slice(0, 2);
// a link made in the page by the site's own share.js, as a friend's or the owner's browser would
const link = async (t, kind) => {
  const page = await visit(t, DONE);
  const [G1] = await twoGroups();
  return page.evaluate(
    async ([k, st, g]) => {
      const s = await import('./share.js');
      const base = location.origin + location.pathname;
      return k === 'friend' ? s.friendLink(base, st, g) : s.backupLink(base, st);
    },
    [kind, { ...STUDENT, name: 'נועה' }, [G1]]
  );
};

test('blocked storage: ?design=a works for the visit and nothing throws', async (t) => {
  const page = await blockedPage(t, SITE + '?design=a');
  assert.equal(await attr(page), 'a');
  assert.equal(await token(page, '--primary'), A_PRIMARY);
});

test('blocked storage: ?design=a#f=<friend link> stays A after the link is read and after a reload', async (t) => {
  const friend = await link(t, 'friend');
  const page = await blockedPage(t, SITE + '?design=a' + friend.slice(friend.indexOf('#')));
  await page.waitForFunction(() => !location.hash.startsWith('#f='), null, { timeout: 30000 }); // read and stripped
  assert.match(page.url(), /\?design=a/, 'the query is kept when the link is stripped');
  assert.equal(await attr(page), 'a');
  assert.equal(await page.evaluate(async () => (await import('./app.js')).app.friendLanding?.name), 'נועה', 'the link was read, not only stripped');
  await page.reload();
  assert.equal(await attr(page), 'a', 'still A after a reload');
});

test('a cancelled backup restore keeps ?design=a', async (t) => {
  const backup = await link(t, 'backup');
  const page = await visit(t, DONE, '?design=a' + backup.slice(backup.indexOf('#')));
  const dlg = page.locator('dialog[open]');
  await dlg.getByText('לשחזר גיבוי? המצב הנוכחי יוחלף.').waitFor();
  await dlg.getByRole('button', { name: 'השאר את המצב הנוכחי' }).click();
  await dlg.waitFor({ state: 'detached' });
  assert.match(page.url(), /\?design=a/, 'the query is kept when the backup link is dropped');
  assert.equal(await attr(page), 'a');
});

// the same path before the terms: the backup waits (app.pendingBackup), the terms are accepted, the saved state asks, the visitor declines
test('a backup link that waited for the terms, then declined, keeps ?design=a', async (t) => {
  const backup = await link(t, 'backup');
  const page = await visit(t, { 'afeka-sched-v1': JSON.stringify(STUDENT) }, '?design=a' + backup.slice(backup.indexOf('#')));
  await page.locator('[data-chg="termsTick"]').check();
  await page.locator('[data-act="acceptTerms"]').click();
  const dlg = page.locator('dialog[open]');
  await dlg.getByText('לשחזר גיבוי? המצב הנוכחי יוחלף.').waitFor();
  await dlg.getByRole('button', { name: 'השאר את המצב הנוכחי' }).click();
  await dlg.waitFor({ state: 'detached' });
  assert.match(page.url(), /[?]design=a/, 'the query is kept after the deferred backup is declined');
  assert.equal(await attr(page), 'a');
});

test('dark: the A dark palette applies, and light does not leak into it', async (t) => {
  const page = await visitIn(browser, t, 'phone', DONE, '?design=a', 'dark', false, false, { design: '' });
  await settled(page);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await token(page, '--primary'), '#3ccfc1');
  assert.equal(await token(page, '--bg'), '#0b0f14');
});

test('legal.html follows the choice too: A and its palette, with no parameter after it is stored', async (t) => {
  const page = await visit(t, DONE, '?design=a');
  await settled(page);
  await page.goto(SITE + 'legal.html');
  assert.equal(await attr(page), 'a');
  assert.equal(await token(page, '--primary'), A_PRIMARY);
});
