// Design A's first run (web/ui-plan.js, web/ui-me.js, web/tour.js, web/ui-view.js): the terms card over an empty board, one question at a time, the
// links a first visit can arrive with, the tour (A's stops, the replay from ☰), the "what first" card, and copy that no longer names numbered steps.
// Every visit sets { design: 'a' }. No top-level await in a spec: node:test then hangs after the run.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STUDENT, PASSED, DONE, passFirstRun, gradeSheetPdf, launch, visit as visitIn } from './helpers.mjs';
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

test('first visit shows one card: the terms, the track and the year together, over an empty board, and "המשך" waits for all three', async (t) => {
  const page = await visit(t, 'phone', null);
  await page.locator('#firstRun .gate').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-k="frTerms"]').count(), 1, 'the terms');
  assert.equal(await page.locator('[data-k="frTrack"]').count(), 1, 'the track, when the catalog has more than one');
  assert.equal(await page.locator('input[name="fr-year"]').count() >= 4, true, 'the years');
  assert.equal(await page.locator('#week .blk').count(), 0, 'the board behind it is empty');
  assert.equal(await page.evaluate(() => document.getElementById('aBoard').inert), true, 'and cannot be used');
  assert.equal(await page.locator('[data-act="pickTrack"], [data-act="pickYear"], [data-act="pickMode"]').count(), 0, 'no tiles, no mode question');
  const go = page.locator('[data-k="frStart"]');
  assert.equal(await go.isDisabled(), true, 'nothing set');
  await page.locator('[data-k="frTerms"]').check();
  assert.equal(await go.isDisabled(), true, 'the box alone');
  await page.locator('[data-k="frTrack"]').selectOption('30');
  assert.equal(await go.isDisabled(), true, 'the box and the track');
  await page.locator('[data-k="fr-year-2"]').check();
  assert.equal(await go.isDisabled(), false, 'all three');
  await page.locator('[data-k="frTerms"]').uncheck();
  assert.equal(await go.isDisabled(), true, 'the box taken back');
  assert.equal(await page.evaluate(() => localStorage.getItem('afeka-sched-v1-terms')), null, 'nothing is accepted before "המשך"');
});

test('a friend link on a first visit shows no mode question and, after the terms, the friend banner above the board', async (t) => {
  const hash = await makeLink(t, 'friend');
  const page = await visit(t, 'phone', null, hash);
  await page.locator('#firstRun .gate').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-act="pickMode"]').count(), 0, 'no mode question');
  await passFirstRun(page); // the friend's link waits behind the pass (step 5 offers it, Task E)
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
  await page.locator('#firstRun .gate').waitFor({ state: 'visible' });
  await passFirstRun(page, { stopAfterStart: true }); // the track and the year are asked too; the restored record then ends the pass
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

test('the first visit ends the pass with the intro tour, and no tour shows over the card', async (t) => {
  const page = await visit(t, 'phone', null, '', true);
  await page.locator('#firstRun .gate').waitFor({ state: 'visible' });
  await page.waitForTimeout(800);
  assert.equal(await popover(page).count(), 0, 'no tour over step 1');
  await passFirstRun(page, { stopAfterStart: true });
  await page.locator('.a-fr-card[data-step="passed"]').waitFor();
  assert.equal(await popover(page).count(), 0, 'nor over the later steps');
  while (await page.locator('[data-k="frNext"]').count()) {
    await page.locator('[data-k="frNext"]').click();
    await page.waitForTimeout(200);
    if (await page.locator('#firstRun').isHidden()) break;
    assert.equal(await popover(page).count(), 0, 'nor over any step');
  }
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
  // the first-run card is the one place that counts its steps ("שלב N מתוך M", the owner's design): it keeps every other rule
  const cardRule = /צעד\s*(\d|ראשון)|הבא\s*:|ארבעה (שלבים|צעדים)|סרגל השלבים/;
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
  await fresh.locator('#firstRun .gate').waitFor({ state: 'visible' });
  const gate = await fresh.evaluate(() => document.body.innerText);
  if (cardRule.test(gate)) bad.push(`gate: ${cardRule.exec(gate)[0]}`);
  await passFirstRun(fresh, { stopAfterStart: true });
  for (let i = 0; i < 6 && !(await fresh.locator('#firstRun').isHidden()); i++) {
    await fresh.locator('.a-fr-card').waitFor();
    const text = await fresh.evaluate(() => document.body.innerText);
    if (cardRule.test(text)) bad.push(`step ${i + 2}: ${cardRule.exec(text)[0]}`);
    await fresh.locator('[data-k="frNext"]').click();
    await fresh.waitForTimeout(150);
  }
  await fresh.locator('#firstRun').waitFor({ state: 'hidden', timeout: 30000 });
  const board = await fresh.evaluate(() => document.body.innerText);
  if (rule.test(board)) bad.push(`the board: ${rule.exec(board)[0]}`);
  assert.deepEqual(bad, []);
});

test('a sentence that pointed at a numbered step names the tool under A, and classic keeps its number', async (t) => {
  const seed = { ...DONE, 'afeka-sched-v1-alts': 'open', 'afeka-sched-v1': JSON.stringify({ ...STUDENT, sortBy: 'friends' }) }; // sorting by friends with none: the hint under the sort
  const a = await visit(t, { width: 1440, height: 900 }, seed, '');
  const link = a.locator('#alts .a-sort .hint a'); // 1440px (the remembered open column): the sort is in the alternatives column
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
  await page.locator('#edit .edit-card').waitFor({ timeout: 30000 });
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

// a student who made the entry choice but never left step 1 (no "onboarded" flag) opens on the week, not on the record, at every load; one who made no choice
// is on a first visit and is sent to the record once
for (const [name, size] of [['a phone', 'phone'], ['1280', 'desktop']])
  test(`${name}: a student who already entered opens on the week, not on #me; one who did not is on a first visit`, async (t) => {
    const { 'afeka-sched-v1-onboarded': _o, ...enteredOnly } = DONE; // terms, the entry choice and a saved record; no onboarded flag
    const page = await visit(t, size, enteredOnly);
    await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
    assert.equal(await page.evaluate(() => location.hash), '', 'no redirect to #me');
    assert.equal(await page.evaluate(() => document.body.dataset.view), 'plan');
    if (size === 'phone') assert.equal(await page.locator('#panel').isVisible(), false, 'no sheet over the week');
    const { 'afeka-sched-v1-entry': _e, ...first } = enteredOnly; // no entry choice either: a first visit
    const fresh = await visit(t, size, first);
    await fresh.waitForFunction(() => location.hash === '#me', null, { timeout: 30000 });
  });

// ---------- the first-run mark and the gate (web/ui-common.js firstRun, passOpen, gated) ----------
const MARK = 'afeka-sched-v1-firstrun';
const markOf = (page) => page.evaluate((k) => localStorage.getItem(k), MARK);
const workerStarted = (page) => page.evaluate(async () => !!(await import('./ui-common.js')).ui.worker);

test('a new visitor gets the first-run mark at the first load, nothing is computed behind the gate, and a reload is still the first step', async (t) => {
  const page = await visit(t, 'phone', null);
  await page.locator('#firstRun .gate').waitFor({ state: 'visible' });
  assert.equal(await markOf(page), '1', 'written before anything is saved');
  await page.waitForTimeout(1500); // longer than the search's own start delay
  assert.equal(await workerStarted(page), false, 'no search worker was started');
  assert.equal(await page.locator('#week .blk').count(), 0);
  await page.reload();
  await page.locator('#firstRun [data-k="frTerms"]').waitFor({ state: 'visible' });
  assert.equal(await markOf(page), '1', 'a reload before "המשך" is still step 1');
  assert.equal(await workerStarted(page), false);
});

test('the pass ends with its last step: the mark turns done and only then the first search starts', async (t) => {
  // a first-year student: nothing earlier to pass (a later year's earlier courses are step 2's list, Task D), so the first search has a plan to show
  const page = await visit(t, 'phone', null);
  await passFirstRun(page, { year: 1, stopAfterStart: true });
  await page.locator('.a-fr-card[data-step="courses"]').waitFor();
  assert.equal(await markOf(page), '3');
  await page.waitForTimeout(1500);
  assert.equal(await workerStarted(page), false, 'no search between the steps');
  await page.locator('#week .blk').count();
  while (await page.locator('[data-k="frNext"]').count()) {
    await page.locator('[data-k="frNext"]').click();
    await page.waitForTimeout(150);
    if (await page.locator('#firstRun').isHidden()) break;
  }
  await page.locator('#week .blk').first().waitFor({ state: 'attached', timeout: 30000 }); // a phone shows one day: the first block may be on another
  assert.equal(await markOf(page), 'done');
  assert.equal(await page.evaluate(() => localStorage.getItem('afeka-sched-v1-firstrun-draft')), null, "step 1's draft goes with the pass");
  assert.equal(await workerStarted(page), true);
});

test('a mark in the middle of the pass keeps the board uncomputed even with a record and the terms on file; an old save opens on the board with no mark', async (t) => {
  const mid = await visit(t, 'phone', { 'afeka-sched-v1-terms': '2', [MARK]: '3', 'afeka-sched-v1': JSON.stringify(STUDENT) });
  await mid.locator('.a-fr-card').waitFor({ state: 'visible' });
  await mid.waitForTimeout(1500);
  assert.equal(await workerStarted(mid), false, 'no search before the pass is done');
  assert.equal(await mid.locator('#week .blk').count(), 0);
  assert.equal(await markOf(mid), '3', 'the saved mark wins');
  const old = await visit(t, 'phone', DONE);
  await old.locator('#week .blk').first().waitFor({ timeout: 30000 });
  assert.equal(await markOf(old), null, 'an old save is not marked: it never saw the pass');
  assert.equal(await old.locator('#firstRun .gate').count(), 0);
});

test('an old save that never chose a study year is asked the year at the gate and keeps what it passed (the pass is not for it)', async (t) => {
  const page = await visit(t, 'phone', { ...DONE, 'afeka-sched-v1': JSON.stringify({ ...STUDENT, profile: { ...STUDENT.profile, year: null } }) });
  await page.locator('[data-act="pickYear"]').first().waitFor({ state: 'visible' });
  await page.locator('[data-act="pickYear"][value="2"]').click();
  await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
  const passed = await page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1')).passed);
  assert.deepEqual(PASSED.filter((id) => !passed.includes(id)), [], 'every course it had passed is still passed');
  assert.equal(await markOf(page), null, 'and it was never put into the pass');
});

test('the improve mode is not held by the pass: its terms, then its own loader, with the mark left where it was', async (t) => {
  const page = await visit(t, 'desktop', null, '#edit');
  await page.locator('[data-k="frTerms"]').waitFor({ state: 'visible' });
  assert.equal(await markOf(page), '1');
  await page.locator('[data-k="frTerms"]').check();
  await page.locator('[data-act="frStart"]').click();
  await page.locator('#edit .edit-card, #edit .edit-stage').first().waitFor({ state: 'visible', timeout: 15000 });
  assert.equal(await markOf(page), '1', 'improve mode leaves the pass where it was');
  assert.equal(await page.evaluate(async () => (await import('./ui-common.js')).passOpen()), false, 'the pass is build mode only');
});

test('classic writes no first-run mark at all', async (t) => {
  const page = await visitIn(browser, t, 'phone', null, '', 'light', false, false, { design: 'classic' });
  await page.locator('#me .gate').waitFor({ state: 'visible' });
  assert.equal(await markOf(page), null);
});

// ---------- the card (phase 3, Task B) ----------
// a student part-way through the pass: the terms accepted, a record on file (year 2, or the given year), the mark at `step`
const mid = (step, year = 2) => ({
  'afeka-sched-v1-terms': '2',
  [MARK]: String(step),
  'afeka-sched-v1': JSON.stringify({ ...STUDENT, profile: { ...STUDENT.profile, year } })
});
const cardRect = (page) =>
  page.evaluate(() => {
    const r = document.querySelector('.a-fr-card').getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, width: innerWidth, height: innerHeight, scrollW: document.documentElement.scrollWidth };
  });

for (const size of [{ width: 1920, height: 1080 }, { width: 1280, height: 800 }, { width: 375, height: 812 }, { width: 320, height: 640 }])
  test(`${size.width}: the card is centred and inside the window (at most 640 wide, 16px gutters on a phone), and nothing scrolls sideways`, async (t) => {
    const page = await visit(t, size, mid(3));
    await page.locator('.a-fr-card').waitFor({ state: 'visible' });
    const r = await cardRect(page);
    assert.ok(r.left >= 0 && r.right <= r.width, `inside the window (${r.left}..${r.right} of ${r.width})`);
    assert.ok(r.right - r.left <= 640 + 0.5, `at most 640 wide (${r.right - r.left})`);
    assert.ok(Math.abs((r.left + r.right) / 2 - r.width / 2) <= 1, 'centred');
    if (size.width < 600) assert.ok(r.left >= 15.5 && r.width - r.right >= 15.5, `a 16px gutter each side (${r.left}, ${r.width - r.right})`);
    assert.ok(r.scrollW <= r.width, 'no sideways scroll');
  });

test('the card says the step: the line of names with the current one marked, "שלב N מתוך M", and a first-year student has four steps', async (t) => {
  const page = await visit(t, 'phone', mid(3, 2));
  await page.locator('.a-fr-card').waitFor({ state: 'visible' });
  assert.equal((await page.locator('.a-fr-n').textContent()).trim(), 'שלב 3 מתוך 5');
  assert.deepEqual(await page.locator('.a-fr-s').allTextContents(), ['תנאים', 'מה עברתי', 'קורסים', 'מה חשוב לי', 'חברים']);
  assert.equal(await page.locator('.a-fr-s[aria-current="step"]').textContent(), 'קורסים');
  assert.equal(await page.locator('.a-fr-s.done').count(), 2, 'the steps before it are marked done');
  const first = await visit(t, 'phone', mid(3, 1));
  await first.locator('.a-fr-card').waitFor({ state: 'visible' });
  assert.equal((await first.locator('.a-fr-n').textContent()).trim(), 'שלב 2 מתוך 4');
  assert.deepEqual(await first.locator('.a-fr-s').allTextContents(), ['תנאים', 'קורסים', 'מה חשוב לי', 'חברים']);
});

test('המשך and חזרה move one step, focus goes to the step heading, the foot says the legal line on steps 2-5, and a reload returns to the step reached', async (t) => {
  const page = await visit(t, 'phone', mid(2));
  await page.locator('#frTitle').waitFor({ state: 'visible' });
  assert.equal((await page.locator('#frTitle').textContent()).trim(), 'מה עברת עד עכשיו?');
  assert.equal(await page.locator('.a-fr-legal').textContent(), 'לא רשמי · אינו הרשמה ואינו המלצה');
  await page.locator('[data-k="frNext"]').click();
  assert.equal(await markOf(page), '3');
  assert.equal((await page.locator('#frTitle').textContent()).trim(), 'קורסים');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'frTitle', 'the step heading takes focus');
  await page.reload();
  await page.locator('#frTitle').waitFor({ state: 'visible' });
  assert.equal((await page.locator('#frTitle').textContent()).trim(), 'קורסים', 'a reload returns to the step reached');
  assert.equal(await page.evaluate(() => document.getElementById('week').querySelectorAll('.blk').length), 0, 'and still no schedule');
  await page.locator('[data-k="frBack"]').click();
  assert.equal(await markOf(page), '2');
  assert.equal((await page.locator('#frTitle').textContent()).trim(), 'מה עברת עד עכשיו?');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'frTitle');
  for (const [n, title] of [[3, 'קורסים'], [4, 'מה חשוב לי'], [5, 'חברים']]) {
    await page.evaluate((m) => localStorage.setItem('afeka-sched-v1-firstrun', m), String(n));
    await page.reload();
    await page.locator('#frTitle').waitFor({ state: 'visible' });
    assert.equal((await page.locator('#frTitle').textContent()).trim(), title);
    assert.equal(await page.locator('[data-k="frBack"]').count(), 1, `${title}: a way back`);
    assert.equal(await page.locator('.a-fr-legal').count(), 1, `${title}: the legal line`);
  }
});

test('step 1 has no way back and no legal line of its own; the terms alone (improve, or the terms asked again) show no step line', async (t) => {
  const one = await visit(t, 'phone', null);
  await one.locator('#firstRun .gate').waitFor({ state: 'visible' });
  assert.equal(await one.locator('[data-k="frBack"]').count(), 0);
  assert.equal(await one.locator('.a-fr-legal').count(), 0, 'the terms text is on the card itself');
  assert.equal((await one.locator('.a-fr-n').textContent()).trim(), 'שלב 1 מתוך 5');
  const edit = await visit(t, 'phone', null, '#edit');
  await edit.locator('#firstRun [data-k="frTerms"]').waitFor({ state: 'visible' });
  assert.equal(await edit.locator('.a-fr-steps, .a-fr-n').count(), 0, 'improve mode: the terms alone');
  const again = await visit(t, 'phone', { ...DONE, 'afeka-sched-v1-terms': '1' }); // an old save, asked again after a new terms version
  await again.locator('#firstRun [data-k="frTerms"]').waitFor({ state: 'visible' });
  assert.equal(await again.locator('.a-fr-steps, .a-fr-n').count(), 0, 'no pass for an old save');
  assert.equal(await markOf(again), null);
  await again.locator('[data-k="frTerms"]').check();
  await again.locator('[data-act="frStart"]').click();
  await again.locator('#week .blk').first().waitFor({ timeout: 30000 });
  assert.equal(await again.locator('#firstRun').isVisible(), false, 'the card is gone');
});

test('the card is a card: the board, the strip and the dock are not drawn behind it, and the board returns with the pass done', async (t) => {
  const page = await visit(t, 'desktop', mid(5));
  await page.locator('.a-fr-card').waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => document.body.classList.contains('first-run')), true);
  for (const sel of ['.a-stage', '#aStrip', '.dock', '#week'])
    assert.equal(await page.locator(sel).first().isVisible(), false, `${sel} is not drawn`);
  await page.locator('[data-k="frNext"]').click(); // the last step: the pass ends (its own button and end are Task E)
  await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
  assert.equal(await markOf(page), 'done');
  assert.equal(await page.evaluate(() => document.body.classList.contains('first-run')), false);
  assert.equal(await page.locator('#firstRun').isVisible(), false);
});

for (const size of ['phone', { width: 1920, height: 400 }])
  test(`${size.width ?? 'phone'}: a card taller than the window keeps its foot (the step's button, "חזרה", the legal line) at the window's bottom, and every control can be reached`, async (t) => {
    const page = await visit(t, size, mid(3));
    await page.locator('.a-fr-foot').waitFor({ state: 'visible' });
    await page.evaluate(() => {
      const tall = document.createElement('div');
      tall.style.height = '2400px';
      tall.innerHTML = '<button type="button" id="lastCtl">בקרה אחרונה</button>';
      document.querySelector('.a-fr-body').append(tall);
    });
    const at = () =>
      page.evaluate(() => {
        const f = document.querySelector('.a-fr-foot').getBoundingClientRect();
        return { bottom: f.bottom, top: f.top, height: innerHeight };
      });
    const top = await at();
    assert.ok(Math.abs(top.bottom - top.height) <= 1.5, `at the top of a tall card the foot is at the window's bottom (${top.bottom} of ${top.height})`);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    const end = await at();
    assert.ok(end.bottom <= end.height + 1.5, 'at the very end the foot is still inside the window');
    const reach = await page.evaluate(() => {
      const c = document.getElementById('lastCtl').getBoundingClientRect(), f = document.querySelector('.a-fr-foot').getBoundingClientRect();
      return { ctlBottom: c.bottom, footTop: f.top };
    });
    assert.ok(reach.ctlBottom <= reach.footTop + 1, `the last control (${reach.ctlBottom}) is not under the foot (${reach.footTop})`);
    await page.evaluate(() => document.getElementById('lastCtl').focus());
    const focused = await page.evaluate(() => {
      const c = document.getElementById('lastCtl').getBoundingClientRect(), f = document.querySelector('.a-fr-foot').getBoundingClientRect();
      return c.bottom <= f.top + 1;
    });
    assert.equal(focused, true, 'a focused control scrolls into view above the foot');
  });

test('a new terms version in the middle of the pass shows the terms first, and the step reached is kept for after them', async (t) => {
  const page = await visit(t, 'phone', { [MARK]: '3', 'afeka-sched-v1': JSON.stringify({ ...STUDENT, profile: { ...STUDENT.profile, year: 2 } }) }); // no terms on file
  await page.locator('#firstRun [data-k="frTerms"]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.a-fr-card').getAttribute('data-step'), 'start', 'the terms, not step 3 with its empty body');
  assert.equal(await markOf(page), '3', 'the mark is not touched');
  await page.locator('[data-k="frTerms"]').check();
  await page.locator('[data-act="frStart"]').click();
  await page.locator('.a-fr-card[data-step="courses"]').waitFor({ timeout: 15000 });
});

test('resizing across 1080px at a step keeps the card heading as the focus target (the skip link lands on it)', async (t) => {
  const page = await visit(t, { width: 1280, height: 800 }, mid(3));
  await page.locator('#frTitle').waitFor({ state: 'visible' });
  await page.setViewportSize({ width: 800, height: 800 });
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('.skip').click());
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'frTitle');
});

test('another tab finished the pass: this tab\'s card, pressed, shows the board and does not reopen the pass', async (t) => {
  const page = await visit(t, 'phone', mid(2));
  await page.locator('[data-k="frNext"]').waitFor({ state: 'visible' });
  await page.evaluate((k) => localStorage.setItem(k, 'done'), MARK); // the other tab's write
  await page.locator('[data-k="frNext"]').click();
  await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
  assert.equal(await markOf(page), 'done', 'not turned back into a step');
  assert.equal(await page.locator('#firstRun').isVisible(), false);
});

// ---------- step 1 (phase 3, Task C) ----------
const fillStart = async (page, { program = '30', year = 2 } = {}) => {
  await page.locator('[data-k="frTerms"]').check();
  if (program) await page.locator('[data-k="frTrack"]').selectOption(program);
  await page.locator(`[data-k="fr-year-${year}"]`).check();
};
const savedRecord = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1')));

test('the three choices survive a reload before "המשך", with the button ready', async (t) => {
  const page = await visit(t, 'phone', null);
  await page.locator('.a-fr-card').waitFor({ state: 'visible' });
  await fillStart(page);
  await page.reload();
  await page.locator('[data-k="frStart"]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-k="frTerms"]').isChecked(), true, 'the box');
  assert.equal(await page.locator('[data-k="frTrack"]').inputValue(), '30', 'the track');
  assert.equal(await page.locator('[data-k="fr-year-2"]').isChecked(), true, 'the year');
  assert.equal(await page.locator('[data-k="frStart"]').isDisabled(), false);
  assert.equal(await markOf(page), '1');
  assert.equal(await page.evaluate(() => localStorage.getItem('afeka-sched-v1-terms')), null, 'and still nothing accepted');
});

test('a five-year program offers year ה, a four-year one does not, and a year the other track lacks is dropped', async (t) => {
  const page = await visit(t, 'desktop', null);
  await page.locator('[data-k="frTrack"]').waitFor({ state: 'visible' });
  const years = () => page.locator('input[name="fr-year"]').count();
  await page.locator('[data-k="frTrack"]').selectOption('32'); // הנדסה מכנית (ערב)
  assert.equal(await years(), 5, 'an evening track: five years');
  await page.locator('[data-k="fr-year-5"]').check();
  await page.locator('[data-k="frTrack"]').selectOption('30');
  assert.equal(await years(), 4, 'a day track: four');
  assert.equal(await page.locator('input[name="fr-year"]:checked').count(), 0, 'year ה is dropped, not kept for a track without it');
  await page.locator('[data-k="frTerms"]').check();
  assert.equal(await page.locator('[data-k="frStart"]').isDisabled(), true, 'and the year is asked again');
});

for (const [year, step, mark] of [[2, 'passed', '2'], [1, 'courses', '3']])
  test(`"המשך" applies the terms, the track and the year at once: year ${year} goes on to ${step}, nothing is computed`, async (t) => {
    const page = await visit(t, 'phone', null);
    await page.locator('.a-fr-card').waitFor({ state: 'visible' });
    await fillStart(page, { program: '30', year });
    await page.locator('[data-k="frStart"]').click();
    await page.locator(`.a-fr-card[data-step="${step}"]`).waitFor({ timeout: 30000 });
    const rec = await savedRecord(page);
    assert.equal(await page.evaluate(() => localStorage.getItem('afeka-sched-v1-terms')), '2', 'the terms are accepted');
    assert.deepEqual([rec.program, rec.profile.year, rec.programSet], [30, year, true], 'the track and the year are the record');
    assert.equal(await markOf(page), mark);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'frTitle', 'the step heading has focus');
    assert.equal(await workerStarted(page), false);
  });

test('another track: the button is busy while its files arrive, then step 2 shows its courses', async (t) => {
  const page = await visit(t, 'phone', null);
  await page.route('**/data/afeka/2027-1/20-2026.json', async (r) => {
    await new Promise((ok) => setTimeout(ok, 1500));
    await r.continue();
  });
  await fillStart(page, { program: '20', year: 2 });
  await page.locator('[data-k="frStart"]').click();
  const busy = page.locator('[data-k="frStart"]');
  assert.equal((await busy.textContent()).trim(), 'טוען…');
  assert.equal(await busy.isDisabled(), true, 'no second press while it loads');
  assert.equal(await busy.getAttribute('aria-busy'), 'true');
  await page.locator('.a-fr-card[data-step="passed"]').waitFor({ timeout: 30000 });
  assert.equal((await savedRecord(page)).program, 20);
});

test('a track whose files do not load: the card says so, stays on step 1 with the choices, and the record is unchanged', async (t) => {
  const page = await visit(t, 'phone', null);
  await page.route('**/data/afeka/2027-1/20-2026.json', (r) => r.abort());
  await fillStart(page, { program: '20', year: 2 });
  await page.locator('[data-k="frStart"]').click();
  await page.locator('.a-fr-card [role="alert"]').filter({ hasText: 'לא הצלחנו לטעון' }).waitFor({ timeout: 30000 });
  assert.equal(await page.locator('.a-fr-card').getAttribute('data-step'), 'start');
  assert.equal(await markOf(page), '1');
  const rec = await savedRecord(page);
  assert.ok(!rec?.programSet && rec?.profile?.year == null, 'the track and the year were not applied');
  assert.equal(await page.locator('[data-k="frTrack"]').inputValue(), '20', 'the choices are still there');
  assert.equal(await page.locator('[data-k="frStart"]').isDisabled(), false, 'and it can be tried again');
  await page.unroute('**/data/afeka/2027-1/20-2026.json');
  await page.locator('[data-k="frStart"]').click();
  await page.locator('.a-fr-card[data-step="passed"]').waitFor({ timeout: 30000 });
});

test('"יש לך כבר מערכת?" leads to the edit page by its terms; back in build mode step 1 has its draft, the mark is still 1', async (t) => {
  const page = await visit(t, 'desktop', null);
  await page.locator('[data-k="frEdit"]').waitFor({ state: 'visible' });
  assert.equal((await page.locator('[data-k="frEdit"]').textContent()).trim(), 'יש לך כבר מערכת? שיפור מערכת קיימת');
  await page.locator('[data-k="frTrack"]').selectOption('30');
  await page.locator('[data-k="fr-year-2"]').check();
  await page.locator('[data-k="frEdit"]').click();
  await page.waitForFunction(() => location.hash === '#edit');
  await page.locator('[data-k="frStart"]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.a-fr-steps, .a-fr-n, [data-k="frEdit"], [data-k="frTrack"]').count(), 0, 'the terms alone: no steps, no track and year, no link');
  await page.locator('[data-k="frTerms"]').check();
  await page.locator('[data-k="frStart"]').click();
  await page.locator('#edit').waitFor({ state: 'visible' });
  await page.locator('.a-top .modes a[data-mode="build"]').click();
  await page.locator('.a-fr-card[data-step="start"]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('[data-k="frTrack"]').inputValue(), '30', 'the track is where it was left');
  assert.equal(await page.locator('[data-k="fr-year-2"]').isChecked(), true, 'and the year');
  assert.equal(await page.locator('[data-k="frTerms"]').isChecked(), true, 'the terms were accepted on the way');
  assert.equal(await markOf(page), '1');
  assert.equal(await page.locator('.a-top .modes').isVisible(), false, 'the mode tabs are still hidden by the pass');
});

test('a backup link that cannot be restored (a track the site lacks) lets the pass go on to step 2; a good one ends it', async (t) => {
  const page0 = await visit(t, 'phone', DONE);
  await page0.locator('#week .blk').first().waitFor({ timeout: 30000 });
  const bad = await page0.evaluate(async (st) => {
    const s = await import('./share.js');
    return s.backupLink(location.origin + location.pathname, st);
  }, { ...STUDENT, program: 9999 });
  const page = await visit(t, 'phone', null, bad.slice(bad.indexOf('#')));
  await passFirstRun(page, { stopAfterStart: true });
  await page.locator('.a-fr-card[data-step="passed"]').waitFor({ timeout: 30000 });
  assert.equal(await markOf(page), '2', 'the pass goes on');
  const good = await makeLink(t, 'backup');
  const page2 = await visit(t, 'phone', null, good);
  await passFirstRun(page2, { stopAfterStart: true });
  await page2.locator('#week .blk').first().waitFor({ timeout: 30000 });
  assert.equal(await markOf(page2), 'done', 'a restored record ends the pass');
  assert.equal(await page2.locator('#firstRun').isVisible(), false);
});

test('while the files load the choices are locked and the button is busy; a pass finished in another tab is not written over', async (t) => {
  const page = await visit(t, 'phone', null);
  await page.route('**/data/afeka/2027-1/20-2026.json', async (r) => {
    await new Promise((ok) => setTimeout(ok, 2000));
    await r.continue();
  });
  await fillStart(page, { program: '20', year: 2 });
  await page.locator('[data-k="frStart"]').click();
  assert.equal(await page.locator('[data-k="frStart"]').isDisabled(), true);
  for (const sel of ['[data-k="frTrack"]', '[data-k="frTerms"]', 'input[name="fr-year"]'])
    assert.equal(await page.locator(sel).first().isDisabled(), true, `${sel} is locked while it loads`);
  await page.evaluate((k) => localStorage.setItem(k, 'done'), MARK); // the other tab's write
  await page.locator('#firstRun').waitFor({ state: 'hidden', timeout: 30000 });
  assert.equal(await markOf(page), 'done', 'the late answer did not turn the mark back into a step');
});

test('the terms asked again in the middle of the pass: a track that does not load leaves step 1 on screen with its error', async (t) => {
  const page = await visit(t, 'phone', { [MARK]: '3', 'afeka-sched-v1': JSON.stringify({ ...STUDENT, profile: { ...STUDENT.profile, year: 2 } }) });
  await page.route('**/data/afeka/2027-1/20-2026.json', (r) => r.abort());
  await page.locator('[data-k="frTerms"]').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('[data-k="frTerms"]').check();
  await page.locator('[data-k="frTrack"]').selectOption('20');
  await page.locator('[data-k="frStart"]').click();
  await page.locator('.a-fr-card [role="alert"]').filter({ hasText: 'לא הצלחנו לטעון' }).waitFor({ timeout: 30000 });
  assert.equal(await page.locator('.a-fr-card').getAttribute('data-step'), 'start', 'step 1 stays although the terms are accepted by now');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset?.k), 'frStart', 'focus is on the button that can try again');
  await page.unroute('**/data/afeka/2027-1/20-2026.json');
  await page.locator('[data-k="frStart"]').click();
  await page.locator('.a-fr-card[data-step="courses"]').waitFor({ timeout: 30000 });
});

test('the terms asked again of someone who finished the pass: nothing of step 1 stays in the draft afterwards', async (t) => {
  const page = await visit(t, 'phone', { ...DONE, 'afeka-sched-v1-terms': '1' });
  await page.locator('[data-k="frTerms"]').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('[data-k="frTerms"]').check();
  await page.locator('[data-k="frStart"]').click();
  await page.locator('#firstRun').waitFor({ state: 'hidden', timeout: 30000 });
  assert.equal(await page.evaluate(() => localStorage.getItem('afeka-sched-v1-firstrun-draft')), null);
});

// ---------- step 2 and the year change (phase 3, Task D) ----------
const stepTwo = async (t, size = 'phone', year = 3) => {
  const page = await visit(t, size, null);
  await passFirstRun(page, { year, stopAfterStart: true });
  await page.locator('.a-fr-card[data-step="passed"]').waitFor({ timeout: 30000 });
  return page;
};
const passedIds = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1')).passed);

test('step 2 for a year-3 student: the courses of years א and ב by year, none ticked, with the grade sheet first', async (t) => {
  const page = await stepTwo(t);
  assert.deepEqual(await page.locator('.a-pass-year legend').allTextContents(), ['שנה א׳', 'שנה ב׳'], 'the earlier years, grouped');
  const boxes = await page.locator('.a-pass-row input').count();
  assert.ok(boxes >= 10, `their courses (${boxes})`);
  assert.equal(await page.locator('.a-pass-row input:checked').count(), 0, 'none is ticked: a ticked list is the assumption the owner refused');
  assert.equal((await page.locator('[data-k="gradeImport"]').textContent()).trim(), 'מעלים גליון ציונים (PDF)');
  assert.match(await page.locator('.a-fr-body').innerText(), /אין גליון\? מסמנים את מה שעברת:/);
  assert.deepEqual(await passedIds(page), [], 'and nothing was filled in for the student');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll');
});

test('"עברתי את כולם" ticks the whole list; an untick is not passed, the ticks survive a reload and a step back', async (t) => {
  const page = await stepTwo(t);
  const total = await page.locator('.a-pass-row input').count();
  await page.locator('[data-k="frPassAll"]').click();
  assert.equal(await page.locator('.a-pass-row input:checked').count(), total);
  const ids = await page.locator('.a-pass-row input').evaluateAll((els) => els.map((e) => e.dataset.id));
  assert.deepEqual([...(await passedIds(page))].sort(), [...ids].sort(), 'the record says the same');
  const [a, b] = ids;
  await page.locator(`[data-k="pass-${a}"]`).uncheck();
  await page.locator(`[data-k="pass-${b}"]`).uncheck();
  const rest = await passedIds(page);
  assert.ok(!rest.includes(a) && !rest.includes(b) && rest.length === total - 2, 'two courses are not passed');
  await page.reload();
  await page.locator('.a-fr-card[data-step="passed"]').waitFor({ timeout: 30000 });
  assert.equal(await page.locator('.a-pass-row input:checked').count(), total - 2, 'a reload returns to the step with its ticks');
  await page.locator('[data-k="frNext"]').click();
  await page.locator('.a-fr-card[data-step="courses"]').waitFor();
  await page.locator('[data-k="frBack"]').click();
  await page.locator('.a-fr-card[data-step="passed"]').waitFor();
  assert.equal(await page.locator('.a-pass-row input:checked').count(), total - 2, 'and Back finds them as they were');
});

test('the grade sheet fills the list: its passes are ticked for review, a pass outside the list survives "המשך", and the entry choice is not made by it', async (t) => {
  const page = await stepTwo(t);
  await page.locator('#gradeFile').setInputFiles({ name: 'sheet.pdf', mimeType: 'application/pdf', buffer: gradeSheetPdf(['30003 Physics 3.5 90', '90901 English 2.0 85']) });
  const dlg = page.locator('dialog.dlg-rows[open]');
  await dlg.waitFor({ timeout: 30000 });
  await dlg.getByRole('button', { name: 'החל' }).click();
  await dlg.waitFor({ state: 'detached' });
  await page.locator('[data-k="pass-30003"]').waitFor();
  assert.equal(await page.locator('[data-k="pass-30003"]').isChecked(), true, 'the sheet\'s pass is ticked in the list');
  assert.ok((await passedIds(page)).includes('90901'), 'a pass outside the list (the English course) is in the record');
  assert.equal(await page.evaluate(() => localStorage.getItem('afeka-sched-v1-entry')), null, 'the import did not make the record\'s entry choice');
  assert.equal(await page.evaluate(() => document.getElementById('firstRun').contains(document.activeElement)), true, 'focus is back on the step');
  await page.locator('[data-k="frNext"]').click();
  assert.ok((await passedIds(page)).includes('90901'), 'and "המשך" leaves it');
});

// a student in year 2 who changes the year: the card for what the change makes earlier
const yearTwo = (extra = {}) => ({
  ...DONE,
  'afeka-sched-v1': JSON.stringify({ ...STUDENT, profile: { ...STUDENT.profile, year: 2 }, failed: { 30112: 1 }, retakeSeen: ['30112'], passed: STUDENT.passed.filter((x) => x !== '30112'), ...extra })
});
const changeYear = async (page, year) => {
  await page.evaluate(() => (location.hash = '#me'));
  await page.locator(`[data-k="p-year-${year}"]`).waitFor({ state: 'attached', timeout: 30000 });
  await page.locator(`[data-k="p-year-${year}"]`).check({ force: true });
};

test('a year change that makes year ב earlier asks about year ב only; "ביטול" and Escape change nothing and the focus goes back to the year control', async (t) => {
  const page = await visit(t, 'desktop', yearTwo());
  await page.locator('#week .blk').first().waitFor({ state: 'attached', timeout: 30000 });
  const before = await page.evaluate(() => localStorage.getItem('afeka-sched-v1'));
  await changeYear(page, 3);
  const dlg = page.locator('dialog.a-fr-dlg[open]');
  await dlg.waitFor({ timeout: 15000 });
  assert.deepEqual(await dlg.locator('.a-pass-year legend').allTextContents(), ['שנה ב׳'], 'year ב alone (א was passed before)');
  assert.equal(await page.evaluate(() => document.querySelector('dialog.a-fr-dlg').contains(document.activeElement)), true, 'focus is inside the card');
  await dlg.getByRole('button', { name: 'ביטול' }).click();
  await dlg.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => localStorage.getItem('afeka-sched-v1')), before, 'nothing changed');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), 'p-year-2', 'focus is on the year control, which shows the year the record has');
  assert.equal(await page.locator('[data-k="p-year-2"]').isChecked(), true);
  await changeYear(page, 3);
  await dlg.waitFor();
  await page.keyboard.press('Escape');
  await dlg.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => localStorage.getItem('afeka-sched-v1')), before, 'Escape is "ביטול"');
});

test('"המשך" on that card changes the year and passes the ticked courses; what was confirmed before stays, and a failure left unticked stays a failure', async (t) => {
  const page = await visit(t, 'desktop', yearTwo());
  await page.locator('#week .blk').first().waitFor({ state: 'attached', timeout: 30000 });
  const was = await page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1')).passed);
  await changeYear(page, 3);
  const dlg = page.locator('dialog.a-fr-dlg[open]');
  await dlg.waitFor({ timeout: 15000 });
  assert.equal(await dlg.locator('[data-id="30112"]').isChecked(), false, 'a course failed before is not ticked');
  await dlg.getByRole('button', { name: 'עברתי את כולם' }).click();
  await dlg.locator('[data-id="30112"]').uncheck(); // still a failure
  await dlg.getByRole('button', { name: 'המשך' }).click();
  await dlg.waitFor({ state: 'detached' });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('afeka-sched-v1')).profile.year === 3, null, { timeout: 30000 });
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1')));
  assert.ok(was.every((id) => rec.passed.includes(id)), 'every course passed before still is');
  assert.ok(rec.passed.length > was.length, 'and the ticked ones of year ב are added');
  assert.ok(!rec.passed.includes('30112') && rec.failed['30112'] === 1, 'the failure on file is kept, not passed');
});

test('a year change that makes no year earlier (a move back) asks nothing', async (t) => {
  const page = await visit(t, 'desktop', yearTwo());
  await page.locator('#week .blk').first().waitFor({ state: 'attached', timeout: 30000 });
  await changeYear(page, 1);
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('afeka-sched-v1')).profile.year === 1, null, { timeout: 30000 });
  assert.equal(await page.locator('dialog.a-fr-dlg').count(), 0);
});

test('375: the year-change card fits the window, its list is one column, and the buttons are 44px', async (t) => {
  const page = await visit(t, 'phone', yearTwo());
  await page.locator('#week .blk').first().waitFor({ state: 'attached', timeout: 30000 });
  await changeYear(page, 3);
  const dlg = page.locator('dialog.a-fr-dlg[open]');
  await dlg.waitFor({ timeout: 15000 });
  const m = await page.evaluate(() => {
    const d = document.querySelector('dialog.a-fr-dlg'), r = d.getBoundingClientRect();
    return { left: r.left, right: r.right, w: innerWidth, small: [...d.querySelectorAll('button, label.check')].filter((e) => e.getBoundingClientRect().height < 43.5).length, cols: getComputedStyle(d.querySelector('.a-pass-list')).gridTemplateColumns.split(' ').length };
  });
  assert.ok(m.left >= 0 && m.right <= m.w, 'inside the window');
  assert.equal(m.small, 0, 'every control is 44px');
  assert.equal(m.cols, 1, 'one column on a phone');
});
