// Design A's first run (web/ui-plan.js, web/ui-me.js, web/tour.js, web/ui-view.js): the terms card over an empty board, one question at a time, the
// links a first visit can arrive with, the tour (A's stops, the replay from ☰), the "what first" card, and copy that no longer names numbered steps.
// Every visit sets { design: 'a' }. No top-level await in a spec: node:test then hangs after the run.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STUDENT, DONE, launch, visit as visitIn } from './helpers.mjs';
import { TOUR_INTRO_A, TOUR_PLANS_A, TOUR_NEW_A } from '../../web/tour.js';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const visit = (t, size, seed, hash = '', withTour = false) => visitIn(browser, t, size, seed, hash, 'light', withTour, false, { design: 'a' });
const settled = (page) => page.waitForFunction(() => document.getElementById('board')?.getAttribute('aria-busy') !== 'true', null, { timeout: 30000 });
const popover = (page) => page.locator('.driver-popover');
const courseIds = async () => Object.keys(JSON.parse(await readFile(new URL('../fixtures/real/2027-1/30-2026.json', import.meta.url), 'utf8')).courses);
const twoGroups = async () =>
  Object.values(JSON.parse(await readFile(new URL('../fixtures/real/2027-1/30-2026.json', import.meta.url), 'utf8')).courses)
    .flatMap((c) => c.groups.map((g) => g.id))
    .slice(0, 2);
// a link made in the page by the site's own share.js, as a friend's or the owner's browser would
const makeLink = async (t, kind) => {
  const page = await visit(t, 'phone', DONE);
  await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
  const [G1] = await twoGroups();
  const url = await page.evaluate(
    async ([k, st, g]) => {
      const s = await import('./share.js');
      const base = location.origin + location.pathname;
      return k === 'friend' ? s.friendLink(base, st, g) : s.backupLink(base, st);
    },
    [kind, { ...STUDENT, name: 'נועה' }, [G1]]
  );
  return url.slice(url.indexOf('#'));
};

test('first visit shows the terms card over an empty board, then the track question, then the year question, one per screen', async (t) => {
  const page = await visit(t, 'phone', null);
  await page.locator('#panel #me .gate').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-k="termsTick"]').count(), 1, 'the terms card');
  assert.equal(await page.locator('#week .blk').count(), 0, 'the board behind it is empty');
  assert.equal(await page.evaluate(() => document.getElementById('aBoard').inert), true, 'and cannot be used');
  assert.equal(await page.locator('[data-act="pickTrack"]:visible, [data-act="pickYear"]:visible').count(), 0, 'no later question yet');
  await page.locator('[data-k="termsTick"]').check();
  await page.locator('[data-act="acceptTerms"]').click();
  await page.locator('[data-act="pickTrack"]').first().waitFor();
  assert.equal(await page.locator('[data-act="pickYear"]:visible').count(), 0, 'the track alone');
  assert.equal(await page.locator('[data-k="termsTick"]').count(), 0, 'the terms are done');
  assert.equal(await page.locator('[data-act="pickMode"]').count(), 0, 'no mode question: the tabs are the choice');
  await page.locator('[data-act="pickTrack"][value="30"]').click();
  await page.locator('[data-act="pickYear"]').first().waitFor();
  assert.equal(await page.locator('[data-act="pickTrack"]:visible').count(), 0, 'the year alone');
});

test('a friend link on a first visit shows no mode question and, after the terms, the friend banner above the board', async (t) => {
  const hash = await makeLink(t, 'friend');
  const page = await visit(t, 'phone', null, hash);
  await page.locator('#panel #me .gate').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-act="pickMode"]').count(), 0, 'no mode question');
  await page.locator('[data-k="termsTick"]').check();
  await page.locator('[data-act="acceptTerms"]').click();
  const banner = page.locator('#banner');
  await banner.getByText('נועה').first().waitFor({ timeout: 30000 });
  const m = await page.evaluate(() => {
    const b = document.getElementById('banner').getBoundingClientRect(), w = document.getElementById('board').getBoundingClientRect();
    return { banner: b.bottom, board: w.top, link: location.hash };
  });
  assert.ok(m.banner <= m.board + 1, `the banner (${m.banner}) is above the board (${m.board})`);
  assert.equal(m.link, '', 'the link was read and stripped');
});

test('a backup link runs after the terms and lands on the board', async (t) => {
  const hash = await makeLink(t, 'backup');
  const page = await visit(t, 'phone', null, hash);
  await page.locator('#panel #me .gate').waitFor({ state: 'visible' });
  await page.locator('[data-k="termsTick"]').check();
  await page.locator('[data-act="acceptTerms"]').click();
  const ask = page.locator('dialog[open]');
  if (await ask.count().then((n) => n || ask.waitFor({ timeout: 3000 }).then(() => 1, () => 0))) await ask.getByRole('button').first().click();
  await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
  assert.equal(await page.locator('#panel').isVisible(), false, 'no tool is open over the restored board');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1')).programSet), true, 'the backup is the state now');
});

test('an empty #f= and an empty #b= do nothing and break nothing', async (t) => {
  for (const hash of ['#f=', '#b=']) {
    const page = await visit(t, 'phone', DONE, hash);
    await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
    assert.equal(await page.locator('dialog[open]').count(), 0, `${hash}: no dialog`);
    assert.equal(await page.locator('#banner [data-act="landingAdd"]').count(), 0, `${hash}: no friend banner`);
    await settled(page);
  }
});

test('the intro tour has no stop on a hidden element, at every width', async (t) => {
  for (const size of ['phone', 'desktop', { width: 320, height: 640 }]) {
    const page = await visit(t, size, DONE, '', false); // the tour is seen: the replay is the only way in
    await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
    await page.locator('.menu-btn').click();
    await page.locator('#drawer [data-act="tour"]').click();
    await popover(page).waitFor({ timeout: 10000 });
    const seen = [];
    for (let i = 0; i < 12; i++) {
      const info = await page.evaluate(() => {
        const el = document.querySelector('.driver-active-element');
        const r = el?.getBoundingClientRect();
        return { visible: !!el && el.checkVisibility() && r.width > 0 && r.height > 0, on: !!r && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight, progress: document.querySelector('.driver-popover-progress-text')?.textContent ?? '', text: document.querySelector('.driver-popover-description')?.textContent ?? '' };
      });
      seen.push(info);
      const next = page.locator('.driver-popover-next-btn');
      if ((await next.textContent()) === 'סיום') break;
      await next.click();
    }
    assert.equal(seen.length, TOUR_INTRO_A.length, `${size}: every stop of the intro is shown, none dropped`);
    assert.deepEqual(seen.map((x) => x.text), TOUR_INTRO_A.map((x) => x.text), `${size}: in order, with its text`);
    for (const s of seen) {
      assert.equal(s.visible, true, `${size}: the stop "${s.text.slice(0, 20)}" is on a visible element`);
      assert.equal(s.on, true, `${size}: and on screen`);
      assert.doesNotMatch(s.text, /שלב|צעד|סרגל/, `${size}: no numbered-step wording`);
    }
    assert.match(seen[0].progress, new RegExp(`1 מתוך ${seen.length}`), `${size}: the counter counts the stops that are shown`);
  }
});

test('the first visit ends the gate with the intro tour, and no tour shows over the track or year question', async (t) => {
  const page = await visit(t, 'phone', null, '', true);
  await page.locator('#panel #me .gate').waitFor({ state: 'visible' });
  await page.locator('[data-k="termsTick"]').check();
  await page.locator('[data-act="acceptTerms"]').click();
  assert.equal(await popover(page).count(), 0, 'no tour over the track question');
  await page.locator('[data-act="pickTrack"][value="30"]').click();
  await page.locator('[data-act="pickYear"]').first().waitFor();
  assert.equal(await popover(page).count(), 0, 'nor over the year question');
  await page.locator('[data-act="pickYear"][value="2"]').click();
  await popover(page).waitFor({ timeout: 15000 });
  assert.match((await page.locator('.driver-popover-description').textContent()) ?? '', /מצבים|לבנות|לשפר/, 'the intro of design A comes first');
  while ((await page.locator('.driver-popover-next-btn').textContent()) !== 'סיום') await page.locator('.driver-popover-next-btn').click();
  await page.locator('.driver-popover-next-btn').click();
  await popover(page).waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => localStorage.getItem('afeka-sched-v1-tour')), 'intro,shell', 'the intro is marked (and "what\'s new", which it covers), the plans part is not');
});

for (const size of ['phone', 'desktop']) {
  test(`${size}: a returning visitor who saw neither tour gets the intro first; the plans part follows it, never at the same time`, async (t) => {
    const page = await visit(t, size, DONE, '', true);
    await popover(page).waitFor({ timeout: 30000 });
    assert.match((await page.locator('.driver-popover-description').textContent()) ?? '', /מצבים|לבנות|לשפר/, 'the intro, not the plans part');
    await page.locator('#week .blk').first().waitFor({ state: 'attached', timeout: 30000 }); // the results are there while the intro runs
    assert.equal(await popover(page).count(), 1, 'one tour at a time');
    while ((await page.locator('.driver-popover-next-btn').textContent()) !== 'סיום') await page.locator('.driver-popover-next-btn').click();
    await page.locator('.driver-popover-next-btn').click();
    await page.waitForFunction(() => /חלופה|קבוצה|רשימה|סיכום/.test(document.querySelector('.driver-popover-description')?.textContent ?? ''), null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => localStorage.getItem('afeka-sched-v1-tour')), 'intro,shell,plans', 'then the plans part, once the intro is done');
    assert.equal((await page.locator('.driver-popover-progress-text').textContent()), `1 מתוך ${TOUR_PLANS_A.length}`);
  });
}

test('the plans part waits behind an open tool and behind the ☰ menu, and starts when the board is clear', async (t) => {
  const seen = await visit(t, 'phone', { ...DONE, 'afeka-sched-v1-tour': 'intro,shell' }, '#courses', true);
  await seen.locator('#panel #courses').waitFor({ state: 'visible' });
  await seen.locator('#week .blk').first().waitFor({ state: 'attached', timeout: 30000 });
  await settled(seen);
  await seen.waitForTimeout(800);
  assert.equal(await popover(seen).count(), 0, 'no plans tour behind the open tool');
  await seen.locator('#panel [data-act="closeTool"]').first().click();
  await popover(seen).waitFor({ timeout: 10000 });
  assert.match((await seen.locator('.driver-popover-description').textContent()) ?? '', /חלופה|קבוצה|סיכום|רשימה/, 'the plans tour starts once the board is clear');

  // results that arrive while the menu is open: the tour waits for it to close and then starts by itself
  const menu = await visit(t, 'phone', { ...DONE, 'afeka-sched-v1-tour': 'intro,shell' }, '', true);
  await menu.locator('#week .blk').first().waitFor({ state: 'attached', timeout: 30000 }); // let the first load finish: a reload would abort its fetches
  await menu.evaluate(() => localStorage.setItem('afeka-sched-v1-tour', 'intro,shell')); // the first load already showed the plans part: ask again
  await menu.route('**/data/afeka/2027-*/*.json', async (r) => {
    await new Promise((ok) => setTimeout(ok, 2500));
    await r.continue();
  });
  await menu.reload();
  await menu.locator('.menu-btn').click();
  await menu.locator('#drawer[open]').waitFor();
  await menu.locator('#week .blk').first().waitFor({ state: 'attached', timeout: 30000 });
  await menu.waitForTimeout(600);
  assert.equal(await popover(menu).count(), 0, 'nothing over the open menu');
  await menu.keyboard.press('Escape');
  await popover(menu).waitFor({ timeout: 10000 });
}
);

for (const size of ['phone', 'desktop'])
  test(`${size}: the tour replays from ☰ after the menu has closed, and focus returns to a visible element`, async (t) => {
  const page = await visit(t, size, DONE, '');
  await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
  await page.locator('.menu-btn').click();
  await page.locator('#drawer[open]').waitFor();
  await page.locator('#drawer [data-act="tour"]').click();
  await popover(page).waitFor({ timeout: 10000 });
  assert.equal(await page.locator('#drawer[open]').count(), 0, 'the menu is closed while the tour runs');
  await page.keyboard.press('Escape');
  await popover(page).waitFor({ state: 'detached' });
  const where = await page.evaluate(() => ({ visible: document.activeElement?.checkVisibility?.() ?? false, cls: document.activeElement?.className ?? '' }));
  assert.equal(where.visible, true, 'focus is on something you can see');
  assert.match(where.cls, /menu-btn/, 'the ☰ button, where the replay began');
});

test('the "what first" card shows while no course is planned, offers the tools, and goes away with the first result', async (t) => {
  const none = { ...STUDENT, choices: Object.fromEntries((await courseIds()).map((id) => [id, 'no'])) };
  const page = await visit(t, 'phone', { ...DONE, 'afeka-sched-v1': JSON.stringify(none) }, '');
  const card = page.locator('#banner .a-first, #week .a-first, .a-first').first();
  await card.waitFor({ state: 'visible', timeout: 30000 });
  for (const tool of ['me', 'courses', 'wishes'])
    assert.equal(await card.locator(`[data-act="tool"][data-tool="${tool}"]`).count(), 1, `${tool} is one tap away`);
  assert.doesNotMatch(await card.innerText(), /שלב|צעד|הבא:/, 'no numbered steps');
  await card.locator('[data-act="tool"][data-tool="courses"]').click();
  await page.locator('#panel #courses').waitFor({ state: 'visible' });
  const openLists = () => page.evaluate(() => document.querySelectorAll('#courses details').forEach((d) => (d.open = true))); // the lists start closed
  await openLists();
  const id = await page.evaluate(async () => {
    const { app } = await import('./app.js');
    return [...document.querySelectorAll('#courses input[data-chg="mode"][value="must"]')].map((e) => e.dataset.id).find((i) => app.data.courses[i]?.groups.some((g) => g.meetings.length));
  });
  assert.ok(id, 'a course with lessons is on offer');
  // the lists are drawn again while the first search settles, and start closed: open them and press, until a press lands
  for (let i = 0; ; i++) {
    await openLists();
    try {
      await page.locator(`#courses label:has(input[data-chg="mode"][data-id="${id}"][value="must"])`).click({ timeout: 3000 });
      break;
    } catch (e) {
      if (i >= 5) throw e;
    }
  }
  await page.locator('.a-first').first().waitFor({ state: 'hidden', timeout: 30000 });
  await page.locator('#panel [data-act="closeTool"]').first().click();
  await page.locator('#week .blk').first().waitFor({ state: 'attached', timeout: 30000 });
  assert.equal(await page.locator('.a-first:visible').count(), 0, 'gone once there is a plan, and the plan is on the board');
});

test('no visible string under A says "שלב N", "צעד N" or "הבא:", on every screen of the build mode', async (t) => {
  const bad = [];
  const rule = /שלב\s*\d|צעד\s*(\d|ראשון)|הבא\s*:|ארבעה (שלבים|צעדים)|סרגל השלבים/;
  for (const size of ['phone', 'desktop']) {
    const page = await visit(t, size, DONE, '', false);
    await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
    for (const hash of ['', '#me', '#courses', '#prefs', '#friends', '#out']) {
      await page.evaluate((h) => (location.hash = h), hash);
      await page.waitForTimeout(250);
      const text = await page.evaluate(() => document.body.innerText);
      const m = rule.exec(text);
      if (m) bad.push(`${size} ${hash || 'board'}: …${text.slice(Math.max(0, m.index - 20), m.index + 30).replace(/\s+/g, ' ')}…`);
    }
  }
  // the gate and the entry screen of a first visit
  const fresh = await visit(t, 'phone', null, '');
  await fresh.locator('#panel #me .gate').waitFor({ state: 'visible' });
  const gate = await fresh.evaluate(() => document.body.innerText);
  if (rule.test(gate)) bad.push(`gate: ${rule.exec(gate)[0]}`);
  await fresh.locator('[data-k="termsTick"]').check();
  await fresh.locator('[data-act="acceptTerms"]').click();
  await fresh.locator('[data-act="pickTrack"][value="30"]').click();
  await fresh.locator('[data-act="pickYear"][value="2"]').click();
  await fresh.getByRole('button', { name: 'הזנה ידנית' }).waitFor();
  const entry = await fresh.evaluate(() => document.body.innerText);
  if (rule.test(entry)) bad.push(`entry: ${rule.exec(entry)[0]}`);
  assert.deepEqual(bad, []);
});

test('a sentence that pointed at a numbered step names the tool under A, and classic keeps its number', async (t) => {
  const seed = { ...DONE, 'afeka-sched-v1-alts': 'open', 'afeka-sched-v1': JSON.stringify({ ...STUDENT, sortBy: 'friends' }) }; // sorting by friends with none: the hint under the sort
  const a = await visit(t, 'desktop', seed, '');
  const link = a.locator('#alts .a-sort .hint a'); // 1280px: the sort is in the alternatives column
  await link.waitFor({ timeout: 30000 });
  assert.equal(await link.getAttribute('href'), '#friends', 'A: the friends tool');
  assert.equal(await link.textContent(), 'ב״חברים״');
  const classic = await visitIn(browser, t, 'desktop', seed, '', 'light', false, false, { design: 'classic' });
  const old = classic.locator('#showby .hint a');
  await old.waitFor({ timeout: 30000 });
  assert.equal(await old.getAttribute('href'), '#prefs');
  assert.equal(await old.textContent(), 'בשלב 3');
});

// ---- Q7: "what's new", once, for someone who knew the old design ----
for (const size of ['phone', 'desktop'])
  test(`${size}: a visitor who finished the classic tour gets the three-stop "what's new" once, not the old intro`, async (t) => {
    const page = await visit(t, size, { ...DONE, 'afeka-sched-v1-tour': 'intro,plans' }, '', true);
    await popover(page).waitFor({ timeout: 30000 });
    assert.equal(await page.locator('.driver-popover-progress-text').textContent(), `1 מתוך ${TOUR_NEW_A.length}`);
    assert.equal(TOUR_NEW_A.length, 3);
    const texts = [];
    for (let i = 0; i < 3; i++) {
      texts.push(await page.locator('.driver-popover-description').textContent());
      assert.equal(await page.evaluate(() => !!document.querySelector('.driver-active-element')?.checkVisibility()), true, `stop ${i + 1} is on a visible element`);
      await page.locator('.driver-popover-next-btn').click();
    }
    assert.deepEqual(texts, TOUR_NEW_A.map((x) => x.text), 'the three stops, in order');
    await popover(page).waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => localStorage.getItem('afeka-sched-v1-tour')), 'intro,plans,shell');
    await page.reload();
    await page.locator('#week .blk').first().waitFor({ state: 'attached', timeout: 30000 });
    await settled(page);
    await page.waitForTimeout(800);
    assert.equal(await popover(page).count(), 0, 'once: not again');
  });

test('"what\'s new" waits behind an open tool on a phone, and is skipped by "דלג" for good', async (t) => {
  const page = await visit(t, 'phone', { ...DONE, 'afeka-sched-v1-tour': 'intro,plans' }, '#courses', true);
  await page.locator('#panel #courses').waitFor({ state: 'visible' });
  await settled(page);
  await page.waitForTimeout(800);
  assert.equal(await popover(page).count(), 0, 'not behind the open tool');
  await page.locator('#panel [data-act="closeTool"]').first().click();
  await popover(page).waitFor({ timeout: 10000 });
  await page.locator('.driver-popover-close-btn').click();
  await popover(page).waitFor({ state: 'detached' });
  assert.match(await page.evaluate(() => localStorage.getItem('afeka-sched-v1-tour')), /shell/);
});

test('a new visitor does not get "what\'s new" after the intro: the intro covers it', async (t) => {
  const page = await visit(t, 'phone', DONE, '', true); // nothing seen: the intro, then the plans part, never the short tour
  await popover(page).waitFor({ timeout: 30000 });
  assert.equal(await page.locator('.driver-popover-progress-text').textContent(), `1 מתוך ${TOUR_INTRO_A.length}`);
  assert.match(await page.evaluate(() => localStorage.getItem('afeka-sched-v1-tour')), /shell/);
});

// ---- Q6: the map from "המצב שלי" as well as from ☰ ----
for (const size of ['phone', 'desktop'])
  test(`${size}: the progress map opens from "המצב שלי", and Escape returns focus to its button`, async (t) => {
    const page = await visit(t, size, DONE, '#me');
    await page.locator('#panel #me [data-act="openMap"]').waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('#panel #me [data-act="openMap"]').focus();
    await page.keyboard.press('Enter');
    await page.locator('#pmap[open]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('#pmap[open]').waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.activeElement?.dataset.k === 'meMap', null, { timeout: 3000 });
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), 'meMap');
  });

// ---- the "what's new" checks are made again right before the tour is drawn, and again when a dialog closes ----
// holds the tour module's request until release(): the test acts while the module is loading, however slow the machine is
const holdDriver = (page) => {
  let release, reached;
  const gate = new Promise((r) => (release = r)), arrived = new Promise((r) => (reached = r));
  page.route('**/vendor/driver/driver.js.mjs', async (route) => {
    reached();
    await gate;
    await route.continue();
  });
  return { release, reached: arrived };
};

test('"what\'s new": a dialog opened while its module loads holds it back until the dialog closes', async (t) => {
  const page = await visit(t, 'desktop', { ...DONE, 'afeka-sched-v1-tour': 'intro,plans' }, '', true);
  await popover(page).waitFor({ timeout: 30000 }); // first load: shown once
  await page.evaluate(() => localStorage.setItem('afeka-sched-v1-tour', 'intro,plans'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const held = holdDriver(page);
  await page.reload();
  await held.reached; // the tour is on its way: its module is loading
  await page.evaluate(async () => {
    window.__ask = (await import('./ui-dialog.js')).askConfirm('לבדיקה', { ok: 'אישור', cancel: null }); // while the module loads
  });
  await page.locator('dialog[open]').waitFor();
  held.release();
  await page.waitForTimeout(1200);
  assert.equal(await popover(page).count(), 0, 'not over the dialog');
  await page.locator('dialog[open]').getByRole('button', { name: 'אישור' }).click();
  await popover(page).waitFor({ timeout: 10000 }); // the close asked again
});

test('"what\'s new": a tool opened on a phone while its module loads holds it back, and it comes when the tool closes', async (t) => {
  const page = await visit(t, 'phone', { ...DONE, 'afeka-sched-v1-tour': 'intro,plans' }, '', true);
  await popover(page).waitFor({ timeout: 30000 });
  await page.keyboard.press('Escape');
  await page.evaluate(() => localStorage.setItem('afeka-sched-v1-tour', 'intro,plans'));
  const held = holdDriver(page);
  await page.reload();
  await held.reached;
  await page.evaluate(() => (location.hash = '#courses')); // while the module loads
  await page.locator('#panel #courses').waitFor({ state: 'visible' });
  held.release();
  await page.waitForTimeout(1200);
  assert.equal(await popover(page).count(), 0, 'not over the tool');
  assert.equal(await page.evaluate(() => localStorage.getItem('afeka-sched-v1-tour')), 'intro,plans', 'and not marked as seen');
  await page.locator('#panel [data-act="closeTool"]').first().click();
  await popover(page).waitFor({ timeout: 10000 });
});

test('"what\'s new" is not used up by the edit page: it waits for the build board', async (t) => {
  const page = await visit(t, 'desktop', { ...DONE, 'afeka-sched-v1-tour': 'intro,plans' }, '#edit', true);
  await page.locator('#edit .edit-stage').waitFor({ timeout: 30000 });
  await page.locator('.menu-btn').click();
  await page.locator('#drawer[open]').waitFor();
  await page.keyboard.press('Escape'); // a dialog closing in improve mode asks the tours again
  await page.waitForTimeout(800);
  assert.equal(await popover(page).count(), 0, 'nothing on the edit page');
  assert.equal(await page.evaluate(() => localStorage.getItem('afeka-sched-v1-tour')), 'intro,plans', 'still to be shown');
  await page.locator('.a-top .modes a[data-mode="build"]').click();
  await popover(page).waitFor({ timeout: 15000 });
  assert.equal(await page.locator('.driver-popover-progress-text').textContent(), '1 מתוך 3', 'all three stops are on the build board');
});

test('the map opened from "המצב שלי" returns focus to the button even when the record was drawn again meanwhile', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#me');
  await page.locator('#panel #me [data-act="openMap"]').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#panel #me [data-act="openMap"]').click();
  await page.locator('#pmap[open]').waitFor();
  await page.evaluate(async () => (await import('./ui-me.js')).renderMe()); // the record is drawn again under the map
  await page.keyboard.press('Escape');
  await page.locator('#pmap[open]').waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.activeElement?.dataset.k === 'meMap', null, { timeout: 3000 }); // the close event is queued: it returns the focus
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), 'meMap');
});
