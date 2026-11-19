// The edit page end to end in WebKit (Task 13): one continuous flow per spec, no seeded edit state unless the spec starts from a loaded schedule.
// Axe, keyboard, 320 px. Synthetic data only (the frozen test data, a made-up PDF).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
import { DONE, visit as visitIn, launch } from './helpers.mjs';
import { zipSync, strToU8 } from '../../web/vendor/fflate/fflate.js';

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
const DS = { year: 2027, sem: 'א', program: 30, startYear: 2026 };
const LOADED = { ...DONE, 'afeka-sched-v1-edit': JSON.stringify({ v: 1, dataset: DS, registered: false, owned: [], original: BASE, baseline: BASE }) };
const SIZES = [['phone', 'phone'], ['phone 320', { width: 320, height: 640 }], ['desktop', 'desktop']];
const visit = (t, size, seed, hash = '#edit') => visitIn(browser, t, size, seed, hash);
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('afeka-sched-v1-edit')));
const noSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const TABLE = [
  '1 30112 תרמודינמיקה 1 סופי-הרצאה+תרגול 2.50 שני, 13:00-14:50',
  '1 30003 מבוא לכימיה סופי-הרצאה+תרגול 2.50 רביעי, 14:00-15:00',
  '1 10336 יישומי מחשב בהנדסה MATLAB סופי-מעבדה 0.50 חמישי, 12:00-15:50'
].join('\n');
// gradeSheetPdf's Helvetica has no Hebrew. This copy maps codes 128+ to the Hebrew letters (Adobe glyph names afii57664..afii57690) so pdf.js reads Hebrew text back.
const NAMES = Array.from({ length: 27 }, (_, i) => `/afii${57664 + i}`).join(' ');
const hebrewPdf = (lines) => {
  const enc = (l) => l.replace(/[א-ת]/g, (c) => String.fromCharCode(128 + c.charCodeAt(0) - 0x5d0));
  const stream = `BT /F1 12 Tf 40 760 Td 16 TL ${lines.map((l) => `(${enc(l)}) Tj T*`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [128 ${NAMES}] >> >>`
  ];
  let pdf = '%PDF-1.4\n';
  const at = [];
  objs.forEach((o, i) => (at.push(pdf.length), (pdf += `${i + 1} 0 obj\n${o}\nendobj\n`)));
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`;
  return Buffer.from(`${pdf}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`, 'latin1');
};
// A made-up yedion export (the real one carries the student's ID number and is never committed): day headers in row 2, a lesson per cell.
const yedionXlsx = (cells) => {
  const all = { B2: 'יום ראשון', C2: 'יום שני', D2: 'יום שלישי', E2: 'יום רביעי', F2: 'יום חמישי', G2: 'יום שישי', ...cells };
  const c = (ref, t) => `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></is></c>`;
  return Buffer.from(zipSync({
    'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="FileFromYedion" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData><row>${Object.entries(all).map(([r, t]) => c(r, t)).join('')}</row></sheetData></worksheet>`)
  }));
};
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// a lesson of the course on its day (the phone shows one day at a time)
const lesson = async (page, name, day) => {
  const d = page.locator(`#editDays [data-day="${day}"]`);
  if (await d.isVisible()) await d.click();
  return page.locator('#editWeek .blk', { hasText: name }).first();
};
const search = async (page) => {
  await page.locator('[data-ed="search"]').click();
  await page.locator('.prop-nav').waitFor({ timeout: 30000 });
};
const loadByHand = async (page) => {
  await page.locator('[data-ed="loadHand"]').click();
  await page.locator('#friendEd[open]').waitFor();
  await page.locator('#feText').fill(TABLE);
  await page.locator('[data-fe="find"]').click();
  await page.locator('[data-fe="save"]').click();
  await page.locator('#friendEd[open]').waitFor({ state: 'detached' });
  await page.locator('[data-ed-row]').first().waitFor();
};
const confirmRows = async (page) => {
  for (const r of await page.locator('[data-ed-row]').all()) await r.locator('input').first().check();
  await page.locator('[data-ed="next"]').click();
  await page.waitForFunction(() => location.hash === '#edit/changes');
  await page.locator('#editWeek .blk').first().waitFor();
};
// Tab through root, marking every element that takes focus inside root; stops once focus has left root again.
const tabThrough = async (page, root) => {
  // start on the first control of root (it must take focus) and Tab on from there: the focus point before it is the browser's business
  const first = await page.evaluate((r) => {
    scrollTo(0, 0);
    const el = document.querySelector(r).querySelector('button, input, select, textarea, a[href], [tabindex="0"]');
    el.focus();
    el.setAttribute('data-tab-seen', '1');
    return document.activeElement === el;
  }, root);
  assert.equal(first, true, 'the first control takes focus');
  const seen = [];
  for (let i = 0; i < 150; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate((r) => {
      const el = document.activeElement;
      if (!el || !el.closest(r)) return null;
      el.setAttribute('data-tab-seen', '1');
      return el.dataset.ed || el.id || el.tagName;
    }, root);
    if (id !== null) seen.push(id);
    else if (seen.length) break;
  }
  return seen;
};
// every visible, enabled control inside root that no Tab reached (a radio group has one tab stop: its checked or first button)
const skipped = (page, root) =>
  page.evaluate(([r, links]) => {
    // WebKit's Tab skips links unless the system setting is on (Safari's "press Tab to highlight each item"), so links are checked only in the other engines
    const sel = 'button, input, select, textarea, summary, [tabindex="0"]' + (links ? ', a[href]' : '');
    const reached = (e) =>
      e.hasAttribute('data-tab-seen') ||
      (e.type === 'radio' && [...document.getElementsByName(e.name)].some((x) => x.hasAttribute('data-tab-seen')));
    return [...document.querySelector(r).querySelectorAll(sel)]
      .filter((e) => !e.disabled && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
      // inside a closed <details> only its summary shows (the engines keep boxes for the rest, hidden by content-visibility)
      .filter((e) => !e.closest('details:not([open])') || e.matches('details > summary'))
      .filter((e) => !reached(e))
      .map((e) => e.outerHTML.slice(0, 90));
  }, [root, (process.env.BROWSER || 'webkit') !== 'webkit']);
const axe = async (page, screen) => {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  assert.deepEqual(violations.map((v) => `${screen}: ${v.id} ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), []);
};

for (const [name, size] of SIZES) {
  test(`${name}: a planner PDF, the uncertain row confirmed, then step 2 (one flow)`, async (t) => {
    const page = await visit(t, size, DONE);
    await page.locator('[data-ed="loadFile"]').click();
    await page.locator('#friendEd[open]').waitFor();
    // the planner's table: the MATLAB row fits two groups, so it waits for the student
    await page.locator('#feFile').setInputFiles({ name: 'planner.pdf', mimeType: 'application/pdf', buffer: hebrewPdf(TABLE.split('\n')) });
    await page.locator('#feImpStatus').filter({ hasText: /נמצא|לא זוהה/ }).waitFor({ timeout: 30000 });
    await page.locator('[data-fe="save"]').click();
    await page.locator('#friendEd[open]').waitFor({ state: 'detached' });
    assert.ok((await page.locator('[data-ed-row]').count()) >= 1, 'an uncertain row is listed');
    assert.equal(await noSideways(page), true, 'step 1');
    await page.locator('[data-ed="next"]').click();
    assert.match(await page.locator('#edMsg').textContent(), /שורה|שורות/, 'unconfirmed rows hold the way on');
    await confirmRows(page);
    assert.ok((await saved(page)).baseline.length >= 1);
    assert.equal(await noSideways(page), true, 'step 2');
  });

  test(`${name}: the yedion's Excel file, read without OCR, every lesson sure, goes to step 2`, async (t) => {
    const page = await visit(t, size, DONE);
    const link = page.locator('.edit-yedion a');
    assert.equal(await link.getAttribute('href'), 'https://yedionp.afeka.ac.il/yedion/fireflyweb.aspx');
    assert.equal(await link.getAttribute('target'), '_blank');
    await page.locator('[data-ed="loadFile"]').click();
    await page.locator('#friendEd[open]').waitFor();
    assert.equal(await page.locator('#feYedion a').getAttribute('target'), '_blank');
    await page.locator('#feFile').setInputFiles({
      name: 'schedule.xlsx',
      mimeType: XLSX,
      buffer: yedionXlsx({
        E9: '30003-מבוא לכימיה סופי-הרצאה+תרגול\tד"ר פלוני אלמוני 101 בניין 14:00-15:50',
        E10: 'המשך\tמבוא לכימיה',
        E11: '30003-מבוא לכימיה תרגול\tמר פלוני 101 בניין 16:00-16:50',
        D10: '30112-תרמודינמיקה 1 סופי-הרצאה+תרגול\tד"ר פלונית 054 בניין 15:00-16:50',
        D12: '30112-תרמודינמיקה 1 תרגול\tד"ר פלונית 054 בניין 17:00-17:50'
      })
    });
    await page.locator('#feImpStatus').filter({ hasText: /נמצא|לא זוהה/ }).waitFor({ timeout: 30000 });
    await page.locator('[data-fe="save"]').click();
    await page.locator('#friendEd[open]').waitFor({ state: 'detached' });
    assert.match(await page.getByText(/נטענה מערכת של סמסטר/).textContent(), /· 2 קורסים/);
    assert.equal(await page.locator('[data-ed-row]').count(), 0, 'every lesson was read exactly: nothing to confirm');
    assert.ok((await saved(page)).draft.rows.every((r) => r.via === 'xlsx' && r.confidence === 'sure'));
    assert.equal(await noSideways(page), true, 'step 1');
    await page.locator('[data-ed="next"]').click();
    await page.waitForFunction(() => location.hash === '#edit/changes');
    assert.deepEqual((await saved(page)).baseline.map((l) => l.group).sort(), ['273000302', '273000302/1', '273011204', '273011204/1']);
  });

  test(`${name}: loading by hand, picking a course and its group in the editor, goes to step 2`, async (t) => {
    const page = await visit(t, size, DONE);
    await page.locator('[data-ed="loadHand"]').click();
    await page.locator('#friendEd[open]').waitFor();
    if (await page.locator('#feTabPick').isVisible()) await page.locator('#feTabPick').click();
    await page.locator('#feCourse').fill('30003');
    await page.locator('#feSearch button[type="submit"]').click();
    await page.locator('[data-fe="toggle"][data-gid="273000302"]').click();
    await page.locator('[data-fe="save"]').click();
    await page.locator('#friendEd[open]').waitFor({ state: 'detached' });
    await page.locator('[data-ed="next"]').click(); // a group picked by hand is a sure row: nothing to confirm
    await page.waitForFunction(() => location.hash === '#edit/changes');
    await page.locator('#editWeek .blk').first().waitFor();
    assert.deepEqual((await saved(page)).baseline.map((l) => l.group).slice(0, 1), ['273000302']);
    assert.equal(await noSideways(page), true, 'step 2');
  });

  test(`${name}: loading by pasted planner text goes to step 2`, async (t) => {
    const page = await visit(t, size, DONE);
    await loadByHand(page);
    assert.equal(await noSideways(page), true, 'step 1');
    await confirmRows(page);
    assert.equal((await saved(page)).baseline.length, 3);
    assert.equal(await noSideways(page), true, 'step 2');
  });
}

// A student who chose the wrong track sees their own courses "not found": the message says to check the track.
test('phone 320: a course of another track in the Excel file is not found, and the message points at the chosen track', async (t) => {
  const page = await visit(t, SIZES[1][1], DONE);
  await page.locator('[data-ed="loadFile"]').click();
  await page.locator('#friendEd[open]').waitFor();
  await page.locator('#feFile').setInputFiles({
    name: 'schedule.xlsx',
    mimeType: XLSX,
    buffer: yedionXlsx({
      E9: '30003-מבוא לכימיה סופי-הרצאה+תרגול\tד"ר פלוני אלמוני 101 בניין 14:00-15:50',
      C3: '99999-קורס של מסלול אחר סופי-הרצאה+תרגול\tד"ר פלונית 202 בניין 08:00-09:50'
    })
  });
  const status = page.locator('#feImpStatus');
  await status.filter({ hasText: 'לא נמצאו' }).waitFor({ timeout: 30000 });
  const text = await status.innerText();
  assert.match(text, /נמצאה קבוצה אחת/);
  assert.match(text, /לא נמצאו: 99999/);
  assert.match(text, /הקורס 99999 לא קיים בנתוני המסלול שבחרתם\. בדקו שהמסלול ושנת הלימודים נכונים\./);
  assert.equal(await noSideways(page), true);
});

for (const [name, size] of [SIZES[0], SIZES[2]])
  test(`${name}: mark a course movable, free a day, a proposal with its summary and card, its new day, save, restore the original`, async (t) => {
    const page = await visit(t, size, LOADED, '#edit/changes');
    await page.locator('#editWeek .blk').first().waitFor();
    await (await lesson(page, 'תרמודינמיקה', 3)).click();
    await page.locator('#pop [data-ed="toggleMove"]').click();
    await page.locator('[data-ed-goal="dayOff"]').selectOption('3'); // Tuesday: where thermodynamics is
    assert.equal((await saved(page)).goal.dayOff, 3);
    await search(page);
    assert.match(await page.locator('.prop-nav .alt-label').textContent(), /^הצעה 1 מתוך \d+$/);
    assert.ok((await page.locator('.prop-sum').innerText()).trim().length > 0, 'summary');
    assert.ok((await page.locator('.pcard').count()) >= 1, 'change card');
    const before = await saved(page);
    await page.locator('[data-ed="newDay"]').first().click();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'editWeekTitle');
    if (name === 'phone') // the button sits under the week there: the new day is brought into view
      assert.equal(await page.locator('#editDays').evaluate((e) => e.getBoundingClientRect().top >= 0 && e.getBoundingClientRect().bottom <= innerHeight), true);
    await page.locator('[data-ed="saveProposal"]').click();
    assert.notDeepEqual((await saved(page)).baseline, before.baseline);
    await page.locator('[data-ed="restoreOriginal"]').click();
    assert.deepEqual((await saved(page)).baseline, before.baseline);
  });

// The owner's phone test: the week was below the fold. One row of goals; on a phone the week sits right under the proposal
// switcher and the details under the week (desktop keeps the details first); a day the proposal changes is marked.
for (const [name, size] of SIZES)
  test(`${name}: goals in one row, the week and the proposal in reading order, the changed day marked`, async (t) => {
    const page = await visit(t, size, LOADED, '#edit/changes');
    await page.locator('#editWeek .blk').first().waitFor();
    const [goals, chip] = [await page.locator('.goals').boundingBox(), await page.locator('.goals .chip').first().boundingBox()];
    assert.ok(goals.height < chip.height * 2, `one row of goals: ${goals.height} / ${chip.height}`);
    assert.equal(await noSideways(page), true, 'step 2');
    await (await lesson(page, 'תרמודינמיקה', 3)).click();
    await page.locator('#pop [data-ed="toggleMove"]').click();
    await page.locator('[data-ed-goal="dayOff"]').selectOption('3'); // thermodynamics leaves Tuesday
    await search(page);
    const order = await page.evaluate(() => [...document.querySelectorAll('.prop-nav, .prop-panel, #editWeek')].map((e) => e.className.split(' ')[0]));
    const phone = name !== 'desktop';
    assert.deepEqual(order, phone ? ['prop-nav', 'edit-week', 'prop-panel'] : ['prop-nav', 'prop-panel', 'edit-week']);
    if (phone) {
      assert.match(await page.locator('#editDays [data-day="3"]').textContent(), /\(יש שינוי\)/, 'the day it left is marked');
      assert.equal(await page.locator('#editDays [data-day="3"] .chg').isVisible(), true);
    }
    assert.equal(await noSideways(page), true, 'a proposal');
  });

test('phone 320: a goal chosen at the far end of the goal row stays in view after the page redraws', async (t) => {
  const page = await visit(t, SIZES[1][1], LOADED, '#edit/changes');
  await page.locator('#editWeek .blk').first().waitFor();
  const goals = page.locator('.goals');
  await goals.evaluate((g) => g.scrollTo({ left: -g.scrollWidth })); // right to left: the far end is the most negative
  const before = await goals.evaluate((g) => g.scrollLeft);
  assert.ok(before < 0, `the row scrolls: ${before}`);
  // "+ קורס", the last chip: whole at the far end in every engine (a middle chip there is cut by font widths that differ)
  const add = page.locator('[data-ed-goal="addCourse"]');
  const opt = await add.locator('option').evaluateAll((os) => os.map((o) => o.value).find(Boolean));
  await add.selectOption(opt);
  assert.deepEqual((await saved(page)).added, [opt]);
  // Chromium rounds a fractional scroll position (-248 read back as -247): a pixel either way is the same place
  const after = await page.locator('.goals').evaluate((g) => g.scrollLeft);
  assert.ok(Math.abs(after - before) <= 1, `the row keeps its place: ${before} then ${after}`);
  const [row, chip] = [await page.locator('.goals').boundingBox(), await page.locator('[data-ed-goal="addCourse"]').boundingBox()];
  assert.ok(chip.x >= row.x - 1 && chip.x + chip.width <= row.x + row.width + 1, `the chosen chip is inside the row: ${JSON.stringify([row, chip])}`);
});

test('phone: adding a course and searching; "העתק שינויים" falls back to the text dialog with "להוסיף:" and the disclaimer', async (t) => {
  const page = await visit(t, 'phone', LOADED, '#edit/changes');
  await page.locator('#editWeek .blk').first().waitFor();
  const opts = await page.locator('[data-ed-goal="addCourse"] option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
  assert.ok(opts.length > 0, 'courses that can be added');
  await page.locator('[data-ed-goal="addCourse"]').selectOption(opts[0]);
  assert.equal((await saved(page)).added.length, 1);
  await search(page);
  await page.locator('[data-ed="copyChanges"]').click();
  const dlg = page.locator('dialog[open]');
  await dlg.waitFor();
  const text = await dlg.locator('textarea').inputValue();
  assert.ok(text.includes('להוסיף:'), text);
  assert.ok(text.includes('הצעה בלבד. ההרשמה נעשית במכללה.'), text);
});

// ---------- keyboard, axe, 320 ----------
test('desktop: keyboard only reaches every control of step 1, step 2 and the proposal panel', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await loadByHand(page);
  const one = await tabThrough(page, '#edit');
  assert.ok(one.length >= 5, one.join());
  assert.deepEqual(await skipped(page, '#edit'), [], 'step 1');
  // the folded load buttons: Enter on the summary opens them and Tab reaches both
  await page.locator('#edit details.edit-ways summary').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#edit details.edit-ways').evaluate((d) => d.open), true);
  await page.evaluate(() => document.querySelectorAll('[data-tab-seen]').forEach((e) => e.removeAttribute('data-tab-seen')));
  const open = await tabThrough(page, '#edit');
  for (const c of ['loadFile', 'loadHand']) assert.ok(open.includes(c), `${c} in ${open.join()}`);
  assert.deepEqual(await skipped(page, '#edit'), [], 'step 1, load buttons open');
  await confirmRows(page);
  const two = await tabThrough(page, '#edit');
  assert.deepEqual(await skipped(page, '#edit'), [], 'step 2 ' + two.join());
  await (await lesson(page, 'כימיה', 4)).click();
  await page.locator('#pop [data-ed="toggleMove"]').click();
  await page.locator('[data-ed-goal="dayOff"]').selectOption('4');
  await search(page);
  await page.evaluate(() => document.querySelectorAll('[data-tab-seen]').forEach((e) => e.removeAttribute('data-tab-seen')));
  const prop = await tabThrough(page, '#edit');
  for (const c of ['propPrev', 'propNext', 'saveProposal', 'copyChanges']) assert.ok(prop.includes(c), `${c} in ${prop.join()}`);
  assert.deepEqual(await skipped(page, '#edit'), [], 'proposal');
});

for (const size of ['phone', 'desktop'])
  test(`${size}: axe finds nothing on step 1, step 2 and a proposal`, async (t) => {
    const page = await visit(t, size, DONE);
    await loadByHand(page);
    await axe(page, 'step 1');
    await page.locator('#edit details.edit-ways summary').click();
    await axe(page, 'step 1, load buttons open');
    await confirmRows(page);
    await axe(page, 'step 2');
    await (await lesson(page, 'כימיה', 4)).click();
    await page.locator('#pop [data-ed="toggleMove"]').click();
    await page.locator('[data-ed-goal="dayOff"]').selectOption('4');
    await search(page);
    await axe(page, 'proposal');
  });

test('320 px: step 1 and a proposal do not scroll sideways', async (t) => {
  const page = await visit(t, { width: 320, height: 640 }, DONE);
  await loadByHand(page);
  assert.equal(await noSideways(page), true, 'step 1');
  await confirmRows(page);
  await (await lesson(page, 'כימיה', 4)).click();
  await page.locator('#pop [data-ed="toggleMove"]').click();
  await page.locator('[data-ed-goal="dayOff"]').selectOption('4');
  await search(page);
  assert.equal(await noSideways(page), true, 'a proposal');
});
