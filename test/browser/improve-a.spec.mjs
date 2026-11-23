// Improve mode inside design A's frame (stage 1: the existing edit page is the whole stage): no numbered-step wording, no mode label (the tabs are the
// mode switch), the dock of improve mode, and the tabs and the menu where they are on the build page. Every visit sets { design: 'a' }.
// No top-level await in a spec: node:test then hangs after the run.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DONE, launch, visit as visitIn } from './helpers.mjs';

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
const state = { v: 1, dataset: { year: 2027, sem: 'א', program: 30, startYear: 2026 }, registered: false, owned: [], original: BASE, baseline: BASE, movable: ['30003'], goal: { dayOff: 4 } };
const SEED = { ...DONE, 'afeka-sched-v1-edit': JSON.stringify(state) };
const visit = (t, size, seed, hash) => visitIn(browser, t, size, seed, hash, 'light', false, false, { design: 'a' });
const RULE = /שלב\s*\d|צעד\s*\d|הבא\s*:|חזרה לצעד|סרגל השלבים/;

for (const size of ['phone', 'desktop'])
  test(`${size}: the edit page names no numbered step, in either of its two screens`, async (t) => {
    const page = await visit(t, size, SEED, '#edit');
    await page.locator('#edit [data-ed="next"]').waitFor({ timeout: 30000 });
    const one = await page.evaluate(() => document.body.innerText);
    assert.doesNotMatch(one, RULE, `the first screen: ${RULE.exec(one)?.[0]}`);
    assert.match(await page.locator('[data-ed="next"]').innerText(), /לשינויים/, 'the way on says where it goes');
    await page.locator('[data-ed="next"]').click();
    await page.waitForFunction(() => location.hash === '#edit/changes');
    await page.locator('[data-ed="search"]').waitFor({ timeout: 30000 });
    const two = await page.evaluate(() => document.body.innerText);
    assert.doesNotMatch(two, RULE, `the second screen: ${RULE.exec(two)?.[0]}`);
    assert.equal(await page.locator('#edit .me-foot').count(), 0, 'no footer bar: the tab is the way back');
    assert.match(await page.locator('.dock [data-tool="mine"]').innerText(), /המערכת שלי/, 'and it says where it goes');
  });

test('the edit page has no mode label: the tabs are the mode switch, the dock and the tool panel are not there, the improve tab is selected', async (t) => {
  const page = await visit(t, 'phone', SEED, '#edit');
  await page.locator('#edit [data-ed="next"]').waitFor({ timeout: 30000 });
  assert.equal(await page.locator('.mode-label').count(), 0, 'no "עורכים מערכת קיימת · החלפה" button');
  assert.equal(await page.locator('.a-top .modes a[data-mode="edit"][aria-current="page"]').count(), 1);
  assert.equal(await page.locator('.a-top .modes a[data-mode="build"][aria-current]').count(), 0);
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.dock .dk')].filter((b) => !b.hidden).map((b) => b.dataset.tool).sort()), ['changes', 'me', 'mine'], 'the dock holds the edit steps and the record, not the build tools');
  assert.equal(await page.locator('#panel').isVisible(), false, 'no tool panel');
  assert.equal(await page.locator('.menu-btn').isVisible(), true, '☰ is where it is on the board');
});

// Stage 2: from 1080px the tool is a column (sticky, its own scroller) and the week is the board beside it; below, the tool is a sheet over the week.
for (const [w, h] of [[1280, 800], [1440, 900], [1080, 800]])
  test(`${w}px: the tool is a column on the right, the week the board beside it, and its search button stays in view`, async (t) => {
    const page = await visit(t, { width: w, height: h }, SEED, '#edit/changes');
    await page.locator('#editWeek .blk').first().waitFor({ timeout: 30000 });
    const m = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const tool = r('.edit-tool'), board = r('.edit-board'), foot = r('.edit-tool [data-ed="search"]');
      return { toolLeft: tool.left, toolTop: tool.top, boardRight: board.right, boardTop: board.top, boardW: board.width, footBottom: foot.bottom, h: innerHeight,
        pos: getComputedStyle(document.querySelector('.edit-tool')).position, dir: getComputedStyle(document.getElementById('edit')).direction,
        fits: document.documentElement.scrollWidth <= innerWidth };
    });
    assert.equal(m.fits, true, 'no sideways scroll');
    assert.equal(m.dir, 'rtl');
    assert.ok(m.boardRight <= m.toolLeft + 1, `RTL: the tool is on the right (${m.toolLeft}), the board to its left (ends at ${m.boardRight})`);
    assert.ok(Math.abs(m.boardTop - m.toolTop) < 150, 'they start at the same height');
    assert.ok(m.boardW > 400, `the week has room: ${Math.round(m.boardW)}px`);
    assert.equal(m.pos, 'sticky', 'the tool column stays in view');
    assert.ok(m.footBottom <= m.h + 1, `the search button is in view (${m.footBottom} of ${m.h})`);
  });

test('1280px, a short window: the tool column is pinned below the top bar, scrolls inside, and its search button is reachable', async (t) => {
  const page = await visit(t, { width: 1280, height: 420 }, SEED, '#edit/changes');
  await page.locator('#editWeek .blk').first().waitFor({ timeout: 30000 });
  const m = await page.evaluate(async () => {
    window.scrollTo(0, 400); // the column sticks below the top bar: once the page is scrolled, the whole tool and its foot are in view
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const tool = document.querySelector('.edit-tool'), foot = tool.querySelector('[data-ed="search"]').getBoundingClientRect(), box = tool.getBoundingClientRect();
    return { footBottom: foot.bottom, h: innerHeight, top: box.top, bottom: box.bottom, overflowY: getComputedStyle(tool).overflowY };
  });
  assert.ok(m.bottom <= m.h + 1 && m.top >= 0, `the column is pinned inside the window (${m.top}..${m.bottom})`);
  assert.equal(m.overflowY, 'auto');
  await page.locator('[data-ed="search"]').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('[data-ed="search"]').isVisible(), true);
});

test('1279px and a phone: the tool is a sheet over the week with the dock under it', async (t) => {
  for (const [w, h] of [[1079, 800], [375, 812]]) {
    const page = await visit(t, { width: w, height: h }, SEED, '#edit/changes');
    await page.locator('#editWeek .blk').first().waitFor({ state: 'attached', timeout: 30000 });
    const m = await page.evaluate(() => {
      const tool = document.querySelector('.edit-tool').getBoundingClientRect(), dock = document.querySelector('.dock').getBoundingClientRect(), board = document.querySelector('.edit-board').getBoundingClientRect();
      return { pos: getComputedStyle(document.querySelector('.edit-tool')).position, toolBottom: tool.bottom, dockTop: dock.top, boardW: board.width, iw: innerWidth, fits: document.documentElement.scrollWidth <= innerWidth };
    });
    assert.equal(m.pos, 'fixed', `${w}: a sheet`);
    assert.ok(Math.abs(m.toolBottom - m.dockTop) <= 2, `${w}: it sits on the dock (${m.toolBottom} / ${m.dockTop})`);
    assert.ok(m.boardW >= m.iw - 40, `${w}: the board is the full width`);
    assert.equal(m.fits, true, `${w}: no sideways scroll`);
  }
});

test('1280px: the goal chips wrap in the column (declutter step 8): every chip is whole inside it, and the row is not a scroller', async (t) => {
  const page = await visit(t, { width: 1280, height: 800 }, SEED, '#edit/changes');
  await page.locator('#editWeek .blk').first().waitFor({ timeout: 30000 });
  const m = await page.evaluate(() => {
    const tool = document.querySelector('.edit-tool').getBoundingClientRect(), goals = document.querySelector('.edit-tool .goals');
    const chips = [...goals.children].filter((c) => c.getClientRects().length);
    return {
      inside: chips.every((c) => c.getBoundingClientRect().left >= tool.left - 0.5 && c.getBoundingClientRect().right <= tool.right + 0.5),
      noScroll: goals.scrollWidth <= goals.clientWidth + 1 && getComputedStyle(goals).overflowX === 'visible',
      n: chips.length
    };
  });
  assert.ok(m.n >= 3);
  assert.equal(m.inside, true, 'no chip is cut by the column');
  assert.equal(m.noScroll, true, 'nothing to scroll sideways');
});

// phase 2, Task B: before a schedule is loaded, one centred card (max 640): the key-size title, one line, "טוענים קובץ" the primary over "בוחרים קורסים ידנית",
// both min(320px, 100%) wide, the download instructions in place behind the last line; no week, no hint sentence, no footer bar
for (const [name, size] of [['1920', { width: 1920, height: 900 }], ['1280', { width: 1280, height: 800 }], ['375', 'phone'], ['320', { width: 320, height: 640 }]])
  test(`${name}: nothing loaded yet is one centred card with the copy, the primary file button over the manual one, and no stage, hint or footer`, async (t) => {
    const page = await visit(t, size, DONE, '#edit');
    const card = page.locator('#edit .edit-card');
    await card.waitFor({ state: 'visible', timeout: 30000 });
    const flat = (s) => s.replace(/\s+/g, ' ').trim();
    assert.equal(flat(await card.locator('h2').innerText()), 'טוענים את המערכת שלכם');
    assert.equal(flat(await card.locator('.edit-card-line').innerText()), 'מאפקה-נט, או בוחרים בעצמכם.');
    const btns = await card.locator('.edit-card-btns .btn').allInnerTexts();
    assert.deepEqual(btns.map(flat), ['טוענים קובץ', 'בוחרים קורסים ידנית'], 'the file button over the manual one');
    assert.equal(await card.locator('[data-ed="loadFile"]').evaluate((b) => b.classList.contains('primary')), true);
    assert.equal(await card.locator('[data-ed="loadHand"]').evaluate((b) => b.classList.contains('primary')), false);
    const m = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect(), cw = document.documentElement.clientWidth, c = r('#edit .edit-card');
      return {
        cw, card: c, inner: c.width - parseFloat(getComputedStyle(document.querySelector('#edit .edit-card')).paddingInlineStart) * 2 - 2, file: r('[data-ed="loadFile"]').width, hand: r('[data-ed="loadHand"]').width, fileH: r('[data-ed="loadFile"]').height, over: document.documentElement.scrollWidth - innerWidth,
        key: getComputedStyle(document.querySelector('#edit .edit-card h2')).fontSize, stage: !!document.querySelector('#edit .edit-stage, #edit .edit-board, #edit .edit-empty, #edit .me-foot')
      };
    });
    assert.ok(m.card.width <= 640.5, `max 640: ${m.card.width}`);
    assert.ok(Math.abs((m.card.left + m.card.right) / 2 - m.cw / 2) <= 1.5, 'centred');
    for (const [which, w] of [['file', m.file], ['manual', m.hand]]) assert.ok(Math.abs(w - Math.min(320, m.inner)) <= 1.5, `the ${which} button is min(320px, 100%) wide: ${w} of ${m.inner}`);
    assert.ok(m.fileH >= 43.5, `a 44px target: ${m.fileH}`);
    assert.equal(m.key, '21px', 'the key size');
    assert.equal(m.stage, false, 'no stage, no week, no hint sentence, no footer bar');
    assert.ok(m.over <= 0, `no sideways scroll (${m.over})`);
  });

test('"איך מורידים מאפקה-נט?" opens the instructions in place and keeps them open over a redraw', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#edit');
  await page.locator('#edit .edit-card').waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await page.locator('#edit .edit-yedion').isVisible(), false, 'closed by default');
  await page.locator('#edit .edit-how > summary').click();
  assert.equal(await page.locator('#edit .edit-yedion').isVisible(), true);
  assert.match(await page.locator('#edit .edit-yedion').innerText(), /אפשר להוריד את מערכת השעות כקובץ אקסל/);
  assert.equal(await page.locator('#edit .edit-yedion a').getAttribute('target'), '_blank');
  await page.evaluate(async () => (await import('./ui-edit.js')).renderEdit()); // drawn again: the state is kept, not the DOM
  assert.equal(await page.locator('#edit .edit-yedion').isVisible(), true, 'still open');
});

test('a phone: the dock\'s "המערכת שלי" over the empty card changes nothing, and what is loaded next opens its tool', async (t) => {
  const page = await visit(t, 'phone', DONE, '#edit');
  await page.locator('#edit .edit-card').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('.dock [data-tool="mine"]').click();
  assert.equal(await page.locator('#edit .edit-card').isVisible(), true, 'the card stays');
  assert.equal(await page.locator('.dock [data-tool="mine"]').getAttribute('aria-pressed'), 'true', 'and its tab stays pressed');
  assert.equal(await page.evaluate(async () => (await import('./ui-common.js')).ui.editSheet !== false), true, 'no sheet was folded');
});

// phase 2, Task E: the first screen says what is loaded in one line and ends with "לשינויים" inside its section; the changes screen has one primary at a time,
// its search button in the section, no footer bar, no disclaimer card, and "עוד" holding the rest of the proposal's actions
const flatText = (x) => x.replace(/\s+/g, ' ').trim();
test('the first screen: one line of what is loaded, "לשינויים" primary inside the section, no footer bar and no "saved at once" line', async (t) => {
  const page = await visit(t, 'desktop', SEED, '#edit');
  await page.locator('#edit [data-ed="next"]').waitFor({ timeout: 30000 });
  assert.equal(flatText(await page.locator('#edit .edit-tool .me-step').innerText()), '2 קורסים · ימים ג׳ ו-ד׳');
  assert.equal(await page.locator('#edit .me-foot').count(), 0);
  assert.equal(await page.locator('#edit .edit-tool [data-ed="next"]').evaluate((b) => b.classList.contains('primary') && !!b.closest('.edit-col')), true, 'inside the section, primary');
  assert.doesNotMatch(await page.locator('#edit .edit-tool').innerText(), /כל שינוי נשמר מיד/);
});

test('the changes screen: the step line, one primary at a time, the search in the section, no footer, no disclaimer card, "עוד" holds the rest', async (t) => {
  const page = await visit(t, 'desktop', SEED, '#edit/changes');
  const tool = page.locator('#edit .edit-tool');
  await tool.locator('[data-ed="search"]').waitFor({ timeout: 30000 });
  assert.equal(flatText(await tool.locator('.me-step').innerText()), 'לחצו על שיעור כדי לסמן שיכול לזוז.');
  assert.equal(await page.locator('#edit .me-foot').count(), 0, 'no footer bar');
  assert.equal(await tool.locator('a[href="#edit"]').count(), 0, 'no way back in the tool: the tab is it');
  assert.equal(flatText(await tool.locator('[data-ed="search"]').innerText()), 'חפש הצעות');
  assert.equal(await tool.locator('.btn.primary').count(), 1, 'one primary before a proposal: the search');
  assert.equal(await tool.locator('[data-ed="search"]').evaluate((b) => b.classList.contains('primary')), true);
  await tool.locator('[data-ed="search"]').click();
  await page.locator('.prop-nav').waitFor({ timeout: 30000 });
  assert.equal(flatText(await tool.locator('[data-ed="search"]').innerText()), 'חפש שוב', 'and "search again" once there is a result');
  assert.equal(await tool.locator('[data-ed="search"]').evaluate((b) => b.classList.contains('primary')), false);
  assert.equal(await tool.locator('.btn.primary').count(), 1, 'one primary with a proposal: "שמור הצעה"');
  assert.equal(await tool.locator('[data-ed="saveProposal"]').evaluate((b) => b.classList.contains('primary')), true);
  assert.equal(flatText(await tool.locator('[data-ed="copyChanges"]').innerText()), 'העתק שינויים');
  assert.doesNotMatch(await tool.innerText(), /הצעה בלבד/, 'the strip says "אינו הרשמה": the card does not say it again');
  const more = tool.locator('[data-ed="more"]');
  assert.equal(await more.getAttribute('aria-expanded'), 'false');
  assert.equal(await more.getAttribute('aria-controls'), 'editMoreList');
  assert.equal(await page.locator('#editMoreList').isVisible(), false, 'closed');
  assert.equal(await tool.locator('[data-ed="restoreOriginal"]').isVisible(), false, 'the reset is not on the screen until "עוד" opens');
});

test('"עוד": a disclosure of plain buttons, Escape closes it and returns focus to it, the proposal arrows ignore keys inside it, and any action closes it', async (t) => {
  const page = await visit(t, 'desktop', SEED, '#edit/changes');
  await page.locator('[data-ed="search"]').click();
  await page.locator('.prop-nav').waitFor({ timeout: 30000 });
  const more = page.locator('#edit [data-ed="more"]');
  const label = () => page.locator('.prop-nav').innerText().then(flatText);
  const nav = await label();
  await more.focus();
  await page.keyboard.press('Enter');
  assert.equal(await more.getAttribute('aria-expanded'), 'true');
  const items = page.locator('#editMoreList button');
  assert.ok((await items.count()) >= 1, 'plain buttons');
  assert.match(await page.locator('#editMoreList').innerText(), /לבטל את כל השינויים/);
  await page.keyboard.press('Tab'); // the list is next in Tab order
  assert.equal(await page.evaluate(() => !!document.activeElement?.closest('#editMoreList')), true, 'Tab goes into the list');
  await page.keyboard.press('ArrowLeft'); // the proposals' key: not inside the list
  assert.equal(await label(), nav, 'the proposal did not change');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#editMoreList').isVisible(), false, 'Escape closes it');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), 'editMore', 'and focus returns to "עוד"');
  assert.equal(await page.locator('dialog[open]').count(), 0, 'Escape did nothing else');
  await more.click();
  await page.locator('#editMoreList [data-ed="restoreOriginal"]').click(); // an action: it runs and the list is closed
  await page.locator('#toast.show').waitFor();
  assert.equal(await page.locator('#editMoreList').count(), 0, 'the proposals went with the reset');
});

test('a phone: Escape inside "עוד" closes it, and only it: the sheet stays open and focus is on "עוד"', async (t) => {
  const page = await visit(t, 'phone', SEED, '#edit/changes');
  await page.locator('[data-ed="search"]').waitFor({ timeout: 30000 });
  await page.locator('[data-ed="search"]').click();
  await page.locator('.prop-nav').waitFor({ timeout: 30000 });
  await page.locator('#edit [data-ed="more"]').click();
  await page.locator('#editMoreList button').first().focus();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#editMoreList').isVisible(), false, 'the list closed');
  assert.equal(await page.locator('.edit-tool').isVisible(), true, 'the sheet is still open');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), 'editMore', 'focus is on "עוד"');
});

test('"עוד" closes with any other action, in the page and in the markup (copying redraws nothing)', async (t) => {
  const page = await visit(t, 'desktop', SEED, '#edit/changes');
  await page.locator('[data-ed="search"]').click();
  await page.locator('.prop-nav').waitFor({ timeout: 30000 });
  await page.locator('#edit [data-ed="more"]').click();
  assert.equal(await page.locator('#editMoreList').isVisible(), true);
  await page.locator('[data-ed="copyChanges"]').click(); // the test page has no clipboard: the text dialog shows
  await page.locator('dialog[open]').waitFor();
  assert.equal(await page.locator('#edit [data-ed="more"]').getAttribute('aria-expanded'), 'false', 'aria-expanded says so');
  assert.equal(await page.locator('#editMoreList').isVisible(), false, 'and the list is shut');
});
