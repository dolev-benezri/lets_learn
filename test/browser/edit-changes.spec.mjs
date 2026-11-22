// The edit page's step 2 (Task 11) in WebKit: the week with its marks, the lesson menu, goals, and what a search posts to the worker.
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

const L = (course, name, type, group, day, start, end) => ({ course, name, type, group, day, start, end });
const CHEM = [L('30003', 'מבוא לכימיה', 'סופי-הרצאה+תרגול', '273000302', 4, '14:00', '15:50'), L('30003', 'מבוא לכימיה', 'תרגול', '273000302/1', 4, '16:00', '16:50')];
const THERMO = [
  L('30112', 'תרמודינמיקה 1', 'סופי-הרצאה+תרגול', '273011204', 3, '15:00', '16:50'), L('30112', 'תרמודינמיקה 1', 'תרגול', '273011204/1', 3, '17:00', '17:50')
];
const DS = { year: 2027, sem: 'א', program: 30, startYear: 2026 };
const state = (baseline, over = {}) => ({ v: 1, dataset: DS, registered: false, owned: [], original: baseline, baseline, ...over });
const seed = (baseline, over) => ({ ...DONE, 'afeka-sched-v1-edit': JSON.stringify(state(baseline, over)) });
const visit = (t, size, s, hash = '#edit/changes') => visitIn(browser, t, size, s, hash);
// records the kind of every message posted to a Worker
const COUNT = () => {
  window.__posts = [];
  const post = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (m, ...a) {
    window.__posts.push(m?.kind ?? 'other');
    return post.call(this, m, ...a);
  };
};
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1-edit')));

for (const size of ['phone', 'desktop'])
  test(`${size}: the week says "נשאר במקום"; a lesson opens its menu; "יכול לזוז" marks it`, async (t) => {
    const page = await visit(t, size, seed([...CHEM, ...THERMO]));
    await page.locator('#editWeek .blk').first().waitFor();
    const blk = page.locator('#editWeek .day.on .blk').first();
    assert.match(await blk.textContent(), /נשאר במקום/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await blk.click();
    const menu = page.locator('#pop');
    await menu.locator('[data-ed]').first().waitFor();
    assert.deepEqual((await menu.locator('button[data-ed]').allInnerTexts()).map((s) => s.trim()), ['יכול לזוז', 'קבוצות אחרות', 'להוריד מהמערכת']);
    await menu.locator('[data-ed="toggleMove"]').click();
    assert.equal((await saved(page)).movable.length, 1);
    assert.match(await page.locator('#editWeek .blk.movable').first().textContent(), /יכול לזוז/);
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('movable')), true, 'focus back on the lesson');
    assert.match(await page.locator('.changes').innerText(), /יכולים לזוז/);
  });

test('desktop: Escape closes the menu and focus returns to the lesson', async (t) => {
  const page = await visit(t, 'desktop', seed(CHEM));
  await page.locator('#editWeek .blk').first().click();
  await page.locator('#pop [data-ed]').first().waitFor();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('pop').matches(':popover-open'));
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('blk')), true);
});

test('phone: nothing to move and no goal says what to do; a goal alone posts "tries", a movable course posts "search"', async (t) => {
  const page = await visit(t, 'phone', seed([...CHEM, ...THERMO]));
  await page.locator('#editWeek .blk').first().waitFor();
  await page.evaluate(COUNT);
  await page.locator('[data-ed="search"]').click();
  assert.match(await page.locator('#edMsg').textContent(), /סמנו קורס שיכול לזוז או בחרו מטרה/);
  await page.locator('[data-ed-goal="dayOff"]').selectOption('3');
  assert.equal((await saved(page)).goal.dayOff, 3);
  await page.locator('[data-ed="search"]').click();
  await page.waitForFunction(() => window.__posts.length >= 1);
  assert.deepEqual(await page.evaluate(() => window.__posts), ['tries']);
  await page.locator('.prop-panel').waitFor({ timeout: 30000 }); // the answer redraws the page: click after it
  if (await page.locator('[data-ed="propPrev"]').count()) await page.locator('[data-ed="propPrev"]').click(); // the original: its lessons are on the shown day
  await page.locator('#editWeek .day.on .blk').first().click();
  await page.locator('#pop [data-ed="toggleMove"]').click();
  await page.evaluate(() => (window.__posts = []));
  await page.locator('[data-ed="search"]').click();
  await page.waitForFunction(() => window.__posts.length >= 1);
  assert.deepEqual(await page.evaluate(() => window.__posts), ['search']);
});

test('phone: no courses left says so instead of searching', async (t) => {
  const page = await visit(t, 'phone', seed(CHEM, { removed: ['30003'] }));
  await page.locator('[data-ed="search"]').waitFor();
  await page.evaluate(COUNT);
  await page.locator('[data-ed="search"]').click();
  assert.match(await page.locator('#edMsg').textContent(), DESIGN === 'a' ? /אין קורסים במערכת. חזרו למערכת שלי./ : /אין קורסים במערכת. חזרו לשלב 1./);
  assert.deepEqual(await page.evaluate(() => window.__posts), []);
});

test('phone: two pinned lessons that overlap block the search and name both', async (t) => {
  const clash = [
    ...CHEM, L('30112', 'תרמודינמיקה 1', 'סופי-הרצאה+תרגול', '273011202', 4, '14:00', '15:50'), L('30112', 'תרמודינמיקה 1', 'תרגול', '273011202/1', 4, '16:00', '16:50')
  ]; // whole courses (lecture + tutorial): a course missing its tutorial row stays as loaded, and fixed lessons may overlap
  const page = await visit(t, 'phone', seed(clash));
  await page.locator('[data-ed="search"]').waitFor();
  await page.evaluate(COUNT);
  await page.locator('[data-ed="search"]').click();
  const msg = await page.locator('#edMsg').textContent();
  assert.ok(msg.includes('מבוא לכימיה') && msg.includes('תרמודינמיקה 1') && msg.includes('יכול לזוז'), msg);
  assert.deepEqual(await page.evaluate(() => window.__posts), []);
});

test('desktop: "קבוצות אחרות" lists groups that fit; picking one shows the old place and the new group', async (t) => {
  const page = await visit(t, 'desktop', seed([...CHEM, ...THERMO]));
  await page.locator('#editWeek .blk').first().click();
  await page.locator('#pop [data-ed="others"]').click();
  const pickBtn = page.locator('#popOthers [data-ed="pickSwap"]').first();
  await pickBtn.waitFor({ timeout: 20000 });
  await pickBtn.click();
  await page.locator('#editWeek .off.ghost').first().waitFor();
  assert.ok((await page.locator('#editWeek .off.ghost').first().textContent()).includes('היה כאן'));
  assert.equal((await page.locator('#editWeek .blk.changed').count()) > 0, true);
  assert.equal(Object.keys((await saved(page)).swaps).length, 1);
});

test('desktop: removing a course another one needs in parallel asks first; yes removes both, no keeps both', async (t) => {
  const par = [
    L('20816', 'מבוא להנדסת חשמל ואלקטרוניקה', 'סופי-הרצאה+תרגול', 'g1', 2, '10:00', '11:50'), L('90904', 'פיזיקה', 'סופי-הרצאה+תרגול', 'g2', 3, '10:00', '11:50')
  ];
  const page = await visit(t, 'desktop', seed(par));
  await page.locator('#editWeek .blk').first().waitFor();
  const dropOf = async (name) => {
    await page.locator('#editWeek .blk', { hasText: name }).first().click();
    await page.locator('#pop [data-ed="drop"]').click();
  };
  await dropOf('פיזיקה');
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  assert.match(await dlg.innerText(), /צריך את .+ במקביל. להסיר גם את/);
  await dlg.getByText('לא, להשאיר').click();
  assert.deepEqual((await saved(page)).removed ?? [], []);
  await dropOf('פיזיקה');
  await page.locator('dialog[open]').getByText('כן, להסיר').click();
  // the seeded save has no "removed" yet: until the page writes it, keep waiting (a throw here would end the wait)
  await page.waitForFunction(() => (JSON.parse(localStorage.getItem('afeka-sched-v1-edit')).removed ?? []).length === 2);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'editWeekTitle');
});

test('320 px: step 2 does not scroll sideways and its controls are 44 px tall', async (t) => {
  const page = await visit(t, { width: 320, height: 640 }, seed([...CHEM, ...THERMO]));
  await page.locator('#editWeek .blk').first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  for (const sel of ['.goals .chip', '[data-ed="search"]', '#editDays button']) {
    const box = await page.locator(sel).first().boundingBox();
    assert.ok(box.height >= 44, `${sel} ${box.height}`);
  }
});

for (const [size, w, h] of [['phone', 375, 812], ['desktop', 1280, 800]])
  test(`${size}: the ☰ menu opens as a full-height side sheet from the ☰ edge, about min(320px, 85vw) wide`, async (t) => {
    const page = await visit(t, size, seed(CHEM), '#edit');
    await page.locator('header [data-act="menu"]').click();
    const box = await page.locator('#drawer').boundingBox();
    assert.ok(Math.abs(box.height - h) <= 1, `height ${box.height}`);
    assert.ok(Math.abs(box.width - Math.min(320, w * 0.85)) <= 1, `width ${box.width}`);
    const burger = await page.locator('header [data-act="menu"]').boundingBox();
    assert.ok(Math.abs(box.x + box.width / 2 - (burger.x + burger.width / 2)) < box.width, 'on the ☰ button side');
    assert.equal(box.x === 0 || Math.abs(box.x + box.width - w) < 1, true, 'flush with an edge');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('drawer').open);
  });

test('desktop: ☰ pressed while the registration panel is docked reopens the drawer as the side menu', async (t) => {
  const page = await visit(t, 'desktop', DONE, '');
  if (DESIGN === 'a') return t.skip('A: the registration list is the take-out tool, and ☰ has no mode links (out-a.spec.mjs)');
  await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
  await page.locator('[data-panel="reg"]').click();
  await page.waitForFunction(() => document.getElementById('drawer').open);
  await page.locator('header [data-act="menu"]').click();
  await page.waitForFunction(() => document.getElementById('drawer').classList.contains('side') && document.getElementById('drawer').matches(':modal'));
  assert.deepEqual((await page.locator('#drawer a').allInnerTexts()).map((s) => s.trim()), ['בניית מערכת', 'עריכת מערכת קיימת']);
  await page.keyboard.press('Escape');
  await page.locator('[data-panel="reg"]').click();
  await page.waitForFunction(() => document.getElementById('drawer').open && !document.getElementById('drawer').classList.contains('side'));
});

test('phone: an edit while a search runs stops it, so the search button is free again at once', async (t) => {
  const page = await visit(t, 'phone', seed([...CHEM, ...THERMO], { movable: ['30003'] }));
  await page.locator('[data-ed="search"]').waitFor();
  await page.evaluate(() => {
    window.__posts = [];
    Worker.prototype.postMessage = function (m) {
      window.__posts.push(m?.kind ?? 'other'); // never answers: the search stays under way
    };
  });
  await page.locator('[data-ed="search"]').click();
  await page.locator('[data-ed="search"]', { hasText: 'מחפש…' }).waitFor();
  await page.locator('[data-ed-goal="dayOff"]').selectOption('4');
  assert.equal((await page.locator('[data-ed="search"]').textContent()).trim(), 'חפש הצעות');
  await page.locator('[data-ed="search"]').click();
  assert.deepEqual(await page.evaluate(() => window.__posts), ['search', 'search']);
  // leaving step 2 stops it too: back on step 2 the button is free
  await page.evaluate(() => (location.hash = '#edit'));
  await page.locator('[data-ed="next"]').waitFor();
  await page.evaluate(() => (location.hash = '#edit/changes'));
  assert.equal((await page.locator('[data-ed="search"]').textContent()).trim(), 'חפש הצעות');
});
