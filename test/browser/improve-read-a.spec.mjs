// Improve mode in design A, the design lead's read-through of phase 2 (what it found, one test each): the loaded first screen shows the week and the one-line
// heading, flat; a phone's sheet leaves room under its last control; the course search is rows with dividers, its field apart from the chips, "חזרה" at
// the start; the empty card's download line is centred. Every visit sets { design: 'a' }. No top-level await in a spec: node:test then hangs after the run.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DONE, XLSX, yedionXlsx, launch, visit as visitIn } from './helpers.mjs';

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
const EDIT = {
  ...DONE,
  'afeka-sched-v1-edit': JSON.stringify({ v: 1, dataset: { year: 2027, sem: 'א', program: 30, startYear: 2026 }, registered: false, owned: [], original: BASE, baseline: BASE, movable: ['30003'], goal: { dayOff: 4 } })
};
const visit = (t, size, seed, hash, scheme = 'light') => visitIn(browser, t, size, seed, hash, scheme, false, false, { design: 'a' });
const SIZES = [['1920', { width: 1920, height: 1080 }], ['1280', { width: 1280, height: 800 }], ['375', 'phone']];

// the made-up yedion export of edit.spec: two courses (Tuesday and Wednesday)
const FILE = {
  name: 'schedule.xlsx',
  mimeType: XLSX,
  buffer: yedionXlsx({
    E9: '30003-מבוא לכימיה סופי-הרצאה+תרגול\tד"ר פלוני אלמוני 101 בניין 14:00-15:50',
    E10: 'המשך\tמבוא לכימיה',
    E11: '30003-מבוא לכימיה תרגול\tמר פלוני 101 בניין 16:00-16:50',
    D10: '30112-תרמודינמיקה 1 סופי-הרצאה+תרגול\tד"ר פלונית 054 בניין 15:00-16:50',
    D12: '30112-תרמודינמיקה 1 תרגול\tד"ר פלונית 054 בניין 17:00-17:50'
  })
};
// a file read and saved in the editor: the schedule is loaded as a draft, not yet the baseline ("לשינויים" saves that)
async function loadFile(page) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10000 }), page.locator('[data-ed="loadFile"]').click()]);
  await chooser.setFiles(FILE);
  await page.locator('#friendEd[open]').waitFor();
  await page.locator('#feImpStatus').filter({ hasText: /נמצא|לא זוהה/ }).waitFor({ timeout: 30000 });
  await page.locator('[data-fe="save"]').click();
  await page.locator('#friendEd[open]').waitFor({ state: 'detached' });
  await page.locator('#edit .edit-stage').waitFor({ timeout: 30000 });
}

for (const [name, size] of SIZES)
  for (const scheme of ['light', 'dark'])
    test(`${name}/${scheme}: a file read and saved shows its week on the board and "2 קורסים · ימים ג׳ ו-ד׳", and the tool is flat`, async (t) => {
      const page = await visit(t, size, DONE, '#edit', scheme);
      await page.locator('[data-ed="loadFile"]').waitFor({ timeout: 30000 });
      await loadFile(page);
      assert.equal((await page.locator('#edit .me-step').textContent()).trim(), '2 קורסים · ימים ג׳ ו-ד׳', 'the heading line says what was loaded');
      assert.equal(await page.locator('#edit .edit-empty').count(), 0, 'the board does not say a schedule will appear');
      assert.ok((await page.locator('#editWeek .blk').count()) >= 1, 'the week is drawn');
      assert.doesNotMatch(await page.locator('#edit').innerText(), /נטענה מערכת של סמסטר/, 'the old sentence is gone');
      assert.equal(await page.locator('#edit .edit-tool .me-card').count(), 0, 'no card inside the tool');
      const flat = await page.evaluate(() =>
        ['.edit-reg', 'details.edit-ways'].map((sel) => {
          const cs = getComputedStyle(document.querySelector(`#edit .edit-tool ${sel}`));
          // a divider line above the fold, and nothing else around either part
          return { sel, shadow: cs.boxShadow, sides: [cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth], top: cs.borderTopWidth, bg: cs.backgroundColor, radius: cs.borderTopLeftRadius };
        })
      );
      for (const f of flat) {
        assert.deepEqual([f.shadow, f.sides, f.bg, f.radius], ['none', ['0px', '0px', '0px'], 'rgba(0, 0, 0, 0)', '0px'], `${f.sel} is not a box`);
        assert.equal(f.top, f.sel === '.edit-reg' ? '0px' : '1px', `${f.sel}: the divider is a line above the fold only`);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no sideways scroll');
    });

// a phone: the sheet's last control keeps the sheet's bottom padding (the dock's marker sits on the sheet's edge), on both screens of the page
for (const scheme of ['light', 'dark'])
  for (const [screen, hash, last] of [['the first screen', '#edit', '[data-ed="next"]'], ['the changes screen', '#edit/changes', '[data-ed="search"]']])
    test(`375/${scheme}: ${screen}: the sheet's last button is not on the dock`, async (t) => {
      const page = await visit(t, 'phone', EDIT, hash, scheme);
      await page.locator(`#edit ${last}`).waitFor({ timeout: 30000 });
      const m = await page.evaluate((sel) => {
        const inner = document.querySelector('.edit-tool-in'); // the scrolling part of the sheet (the close button has a row above it)
        inner.scrollTop = inner.scrollHeight;
        const btn = document.querySelector(`#edit ${sel}`).getBoundingClientRect(), dock = document.querySelector('.dock').getBoundingClientRect();
        return { gap: dock.top - btn.bottom, padding: parseFloat(getComputedStyle(inner).paddingBottom) };
      }, last);
      assert.ok(m.padding >= 16, `the sheet has its bottom padding (${m.padding}px)`);
      assert.ok(m.gap >= 12, `the button ends ${m.gap}px above the dock`);
    });

for (const [name, size] of SIZES)
  test(`${name}: the course search: the field is apart from the chips, "חזרה" is at the start edge, the courses are rows with dividers`, async (t) => {
    const page = await visit(t, size, EDIT, '#edit/changes');
    await page.locator('[data-k="csOpen"]').click();
    await page.locator('#csText').fill('חשבון');
    await page.locator('#csResults .cs-course').first().waitFor({ timeout: 30000 });
    const m = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const rows = [...document.querySelectorAll('#csResults .cs-course')].map((e) => {
        const cs = getComputedStyle(e);
        return { box: [cs.borderTopWidth, cs.borderLeftWidth, cs.borderRightWidth], bottom: cs.borderBottomWidth, bg: cs.backgroundColor, radius: cs.borderTopLeftRadius };
      });
      return { field: r('.cs-field').bottom, chips: r('.cs-chips').top, back: r('.cs-head .a-back').right, title: r('.cs-head h2').right, rows };
    });
    assert.ok(m.chips - m.field >= 8, `the chips start ${m.chips - m.field}px under the field`);
    assert.ok(Math.abs(m.back - m.title) <= 2, `"חזרה" (${m.back}) starts where the title does (${m.title})`);
    assert.ok(m.rows.length >= 2, 'a list');
    for (const [i, row] of m.rows.entries()) {
      assert.deepEqual(row.box, ['0px', '0px', '0px'], `row ${i} has no box around it`);
      assert.equal(row.bg, 'rgba(0, 0, 0, 0)', `row ${i} has no surface of its own`);
      assert.equal(row.radius, '0px');
      assert.equal(row.bottom, i === m.rows.length - 1 ? '0px' : '1px', `row ${i}: a divider between rows, none after the last`);
    }
  });

for (const [name, size] of SIZES)
  test(`${name}: the empty card's "איך מורידים מאפקה-נט?" line is centred like the rest of the card`, async (t) => {
    const page = await visit(t, size, DONE, '#edit');
    await page.locator('#edit .edit-how > summary').waitFor({ timeout: 30000 });
    const m = await page.evaluate(() => {
      const s = document.querySelector('#edit .edit-how > summary'), range = document.createRange();
      range.selectNodeContents(s);
      const text = range.getBoundingClientRect(), box = s.getBoundingClientRect();
      return { text: (text.left + text.right) / 2, box: (box.left + box.right) / 2, wide: box.width };
    });
    assert.ok(Math.abs(m.text - m.box) <= 14, `the line's centre (${m.text}) is the card's (${m.box}) within the chevron's width`);
  });

// ---------- the second read-through: clashes, the goal's reason, one chip, the proposal's room, the sheet ----------
const stateWith = (over) => ({ ...EDIT, 'afeka-sched-v1-edit': JSON.stringify({ ...JSON.parse(EDIT['afeka-sched-v1-edit']), ...over }) });
const searchFor = async (page, text) => {
  await page.locator('[data-k="csOpen"]').click();
  await page.locator('#csText').fill(text);
  await page.locator('#csResults .cs-course').first().waitFor({ timeout: 30000 });
};
const addFitting = (page) => page.locator('.cs-opt', { has: page.locator('.tag', { hasText: 'נכנס' }) }).locator('[data-ed="csAdd"]').first().click();
const proposal = async (page) => {
  await page.locator('[data-ed="search"]').click();
  await page.locator('.prop-nav').waitFor({ timeout: 60000 });
  await page.waitForTimeout(300);
};

for (const [name, size] of [['1280', { width: 1280, height: 800 }], ['375', 'phone']])
  test(`${name}: מעבר to a group that clashes puts both lessons in the week side by side, marked as a clash`, async (t) => {
    const page = await visit(t, size, EDIT, '#edit/changes');
    await searchFor(page, 'תרמודינמיקה');
    const swap = page.locator('.cs-course', { has: page.locator('h3', { hasText: 'תרמודינמיקה 1' }) }).locator('.cs-opt', { has: page.locator('.tag.warn') }).locator('[data-ed="csSwap"]').first();
    await swap.click();
    await page.locator('#editWeek .blk.clash').nth(1).waitFor({ state: 'attached', timeout: 30000 });
    if (size === 'phone') {
      await page.locator('.dock [data-tool="changes"]').click(); // the sheet closes: the week is what is looked at
      await page.locator('#editDays [data-day="4"]').click(); // the clash is on Wednesday
    }
    const m = await page.evaluate(() =>
      [...document.querySelectorAll('#editWeek .blk.clash')].filter((b) => b.checkVisibility()).map((b) => ({
        r: b.getBoundingClientRect().toJSON(), lane: [b.style.getPropertyValue('--l'), b.style.getPropertyValue('--n')], text: b.querySelector('.blk-name').textContent, sr: b.textContent
      }))
    );
    const chem = m.filter((x) => x.text === 'מבוא לכימיה'), thermo = m.filter((x) => x.text === 'תרמודינמיקה 1');
    assert.ok(chem.length >= 1 && thermo.length >= 1, `both courses of the clash are drawn and visible (${m.map((x) => x.text)})`);
    // the lecture of one and the lecture of the other share the same hours: lanes 0 and 1 of 2, side by side with room each
    const a = chem.find((x) => thermo.some((y) => Math.abs(x.r.top - y.r.top) < 1)), b = thermo.find((y) => Math.abs(a.r.top - y.r.top) < 1);
    assert.deepEqual([a.lane, b.lane].sort(), [['0', '2'], ['1', '2']], 'one lane each');
    assert.ok(a.r.width > 20 && b.r.width > 20 && a.r.height > 20, 'both have room to be seen');
    assert.ok(a.r.right <= b.r.left + 1 || b.r.right <= a.r.left + 1, `side by side, not on top of each other: ${JSON.stringify([a.r.left, a.r.right, b.r.left, b.r.right])}`);
    assert.match(a.sr + b.sr, /מתנגש/, 'a screen reader is told');
  });

test('a course added from the search is one chip under "נוספים", and removing it removes the course and its group', async (t) => {
  const page = await visit(t, 'desktop', EDIT, '#edit/changes');
  await searchFor(page, 'אנליזה');
  await addFitting(page);
  const added = await page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1-edit')).added[0]);
  const names = (await page.locator('#edit .tag-chip').allInnerTexts()).map((x) => x.replace(/\s*\(בטל\)\s*/, '').trim());
  assert.equal(names.filter((n, i) => names.indexOf(n) !== i).length, 0, `no chip twice: ${names}`);
  assert.equal(await page.locator('#edit .changes li', { hasText: 'קבוצה חדשה' }).count(), 0, 'no "קבוצה חדשה" row for it');
  const row = page.locator('#edit .changes li', { hasText: 'נוספים' });
  assert.equal(await row.locator('.tag-chip').count(), 1);
  await row.locator('.tag-chip').click();
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1-edit')));
  assert.ok(!st.added.includes(added), 'the course is gone');
  assert.ok(!(added in st.swaps) || !st.swaps[added].length, 'and so is its fixed group');
  assert.equal(await page.locator('#edit .changes .tag-chip', { hasText: 'אנליזה' }).count(), 0);
});

test('a fixed group that would fit, under a goal that cannot be met with it: the page names the goal, not the group', async (t) => {
  const page = await visit(t, 'desktop', stateWith({ movable: [], goal: { fewerGaps: true } }), '#edit/changes');
  await searchFor(page, 'אנליזה');
  await addFitting(page);
  await page.locator('[data-ed="search"]').click();
  await page.locator('#editNotes').waitFor({ timeout: 60000 });
  const text = await page.locator('#editNotes').innerText();
  assert.match(text, /היעד "פחות חלונות" לא מתאפשר עם הקבוצה הזו/, 'the goal is named');
  assert.doesNotMatch(text, /לא נמצאה מערכת עם הקבוצה הזו/, 'and the group is not blamed');
});

test('a fixed group under a goal the schedule already meets: nothing to move, and still a proposal (the first question tried no course)', async (t) => {
  const page = await visit(t, 'desktop', stateWith({ movable: [], goal: { dayOff: 6 } }), '#edit/changes');
  await searchFor(page, 'אנליזה');
  await addFitting(page);
  await page.locator('[data-ed="search"]').click();
  await page.locator('.prop-nav').waitFor({ timeout: 60000 });
  assert.equal(await page.locator('#editNotes').count() ? await page.locator('#editNotes').innerText() : '', '', 'no note blames the goal or the group');
});

for (const [name, size] of [['1280', { width: 1280, height: 800 }], ['375', 'phone']])
  test(`${name}: with a proposal open the page ends where the week ends (no empty grey), and a 50-minute lesson shows its whole range`, async (t) => {
    const page = await visit(t, size, EDIT, '#edit/changes');
    await searchFor(page, 'אנליזה');
    await addFitting(page);
    await proposal(page);
    const m = await page.evaluate(() => ({
      doc: document.documentElement.scrollHeight, inner: innerHeight, board: Math.round(document.getElementById('aBoard').getBoundingClientRect().bottom + scrollY),
      dock: Math.round(document.querySelector('.dock').getBoundingClientRect().height), metas: [...document.querySelectorAll('#editWeek .blk.short .blk-meta')].map((e) => e.innerText.trim())
    }));
    const room = size === 'phone' ? m.dock + 12 : 0; // a phone's page leaves room for the dock
    assert.ok(m.doc <= Math.max(m.board + room, m.inner), `the document is ${m.doc}px, the week ends at ${m.board}px, the window is ${m.inner}px`);
    assert.ok(m.metas.length >= 1 && m.metas.every((x) => /\d\d:\d\d.\d\d:\d\d/.test(x)), `every 50-minute lesson has start and end: ${m.metas}`);
  });

test('375: the sheet has the close button in a row of its own above the content, and the last control is not on the dock', async (t) => {
  const page = await visit(t, 'phone', EDIT, '#edit/changes');
  await searchFor(page, 'אנליזה');
  await addFitting(page);
  await proposal(page);
  const m = await page.evaluate(() => {
    const x = document.querySelector('.edit-sheet-x').getBoundingClientRect(), tool = document.querySelector('.edit-tool'), inner = document.querySelector('.edit-tool-in');
    const innerTop = inner.getBoundingClientRect().top;
    inner.scrollTop = inner.scrollHeight;
    const last = [...inner.querySelectorAll('button')].filter((b) => b.checkVisibility()).at(-1).getBoundingClientRect(), dock = document.querySelector('.dock').getBoundingClientRect();
    return { xBottom: x.bottom, innerTop, scroller: getComputedStyle(inner).overflowY, toolOverflow: getComputedStyle(tool).overflowY, gap: dock.top - last.bottom };
  });
  assert.ok(m.xBottom <= m.innerTop + 0.5, `the close button (${m.xBottom}) ends above where the content starts (${m.innerTop})`);
  assert.equal(m.scroller, 'auto', 'the content scrolls');
  assert.equal(m.toolOverflow, 'hidden', 'the sheet itself does not');
  assert.ok(m.gap >= 12, `the last button ends ${m.gap}px above the dock`);
});

test('the proposal is one surface in the tool: no card around it, the courses divided by lines', async (t) => {
  const page = await visit(t, 'desktop', EDIT, '#edit/changes');
  await proposal(page);
  const m = await page.evaluate(() => {
    const p = getComputedStyle(document.querySelector('.edit-tool .prop-panel')), cards = [...document.querySelectorAll('.edit-tool .pcard')].map((c) => getComputedStyle(c));
    return { panel: [p.boxShadow, p.borderTopWidth, p.backgroundColor], cards: cards.map((c) => [c.backgroundColor, c.borderTopWidth, c.borderTopLeftRadius]) };
  });
  assert.deepEqual(m.panel, ['none', '0px', 'rgba(0, 0, 0, 0)'], 'the panel is not a card');
  assert.ok(m.cards.length >= 1);
  for (const c of m.cards) assert.deepEqual(c, ['rgba(0, 0, 0, 0)', '1px', '0px'], 'a course is a row with a divider');
});
