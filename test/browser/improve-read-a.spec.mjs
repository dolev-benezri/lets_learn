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
        const tool = document.querySelector('.edit-tool');
        tool.scrollTop = tool.scrollHeight;
        const btn = document.querySelector(`#edit ${sel}`).getBoundingClientRect(), dock = document.querySelector('.dock').getBoundingClientRect();
        return { gap: dock.top - btn.bottom, padding: parseFloat(getComputedStyle(tool).paddingBottom) };
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
