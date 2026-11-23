// Shared by the browser specs: the fictional student, the seeded storage, the synthetic grade-sheet PDF and visit().
import assert from 'node:assert/strict';
import * as playwright from 'playwright';
import { zipSync, strToU8 } from '../../web/vendor/fflate/fflate.js';

export const SITE = process.env.SITE_URL;
// BROWSER=chromium or firefox; WebKit, the engine of iPhone Safari, when not set.
// CHROMIUM_PATH: a local run where Playwright's own Chromium build is not the installed one (CI uses the default).
export const launch = () =>
  playwright[process.env.BROWSER || 'webkit'].launch(process.env.BROWSER === 'chromium' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : undefined);
export const SIZES = { phone: { width: 375, height: 812 }, desktop: { width: 1280, height: 800 } };
// The design under test: 'a' (the A frame) or 'classic'. visit() takes it as an explicit option; DESIGN in the environment is only the
// default for a local rerun, so a spec that needs A passes { design: 'a' } and tests what it says even where CI sets only BROWSER.
export const DESIGN = process.env.DESIGN || '';
export const DESIGN_KEY = 'afeka-sched-v1-design';
// the hash that shows the friends: the preferences page holds them in classic, A has a tool of its own
export const friendsHash = (design = DESIGN) => (design === 'a' ? '#friends' : '#prefs');
export const PASSED = [
  '10016',
  '30003',
  '30130',
  '30133',
  '30135',
  '30137',
  '90901',
  '90902',
  '90903',
  '90905',
  '90914'
];
export const STUDENT = {
  v: 1,
  year: 2027,
  semester: 'א',
  program: 30,
  startYear: 2026,
  programSet: true,
  passed: PASSED,
  profile: { year: 2, amirnet: 134, specs: [], summer: false }
};
export const DONE = {
  'afeka-sched-v1-terms': '2',
  'afeka-sched-v1-onboarded': '1',
  'afeka-sched-v1-entry': '1',
  'afeka-sched-v1': JSON.stringify(STUDENT)
};

// A one-page PDF with two rows in the grade sheet's shape (code, name, credits, grade); synthetic, never a real sheet.
export function gradeSheetPdf(lines) {
  const stream = `BT /F1 12 Tf 40 760 Td 16 TL ${lines.map((l) => `(${l}) Tj T*`).join(' ')} ET`;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n';
  const at = [];
  objs.forEach((o, i) => {
    at.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`;
  return Buffer.from(
    `${pdf}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
    'latin1'
  );
}

// A new browser context (empty storage) at this size; `seed` is written into localStorage once, before the site's first script. print() is counted, not shown.
// `size` is 'phone' or 'desktop', or a { width, height } of its own. `scheme` is the device's colour scheme (the site follows it). The outside-request and script-error checks run when the test ends.
// The first-visit tour is marked seen, so it never stands between a test and the page; `withTour` leaves it unseen (tour.spec.mjs, and the axe run with its popover open).
export const TOUR_SEEN = { 'afeka-sched-v1-tour': 'intro,plans,shell' }; // shell: design A's "what's new" (classic never reads it)
// The first-entry mode choice is answered ('build'), so the fresh-visit specs go from the terms straight to the track question; `withModeChoice` leaves it open (edit-shell.spec.mjs).
export const MODE_BUILD = { 'afeka-sched-v1-mode': 'build' };
// The last parameter, opts: { design: 'a' | 'classic' } (see DESIGN above).
export async function visit(browser, t, size, seed = null, hash = '', scheme = 'light', withTour = false, withModeChoice = false, opts = {}) {
  const viewport = typeof size === 'string' ? SIZES[size] : size,
    phone = viewport.width < 600,
    design = opts.design ?? DESIGN;
  const context = await browser.newContext({
    viewport,
    isMobile: phone,
    hasTouch: phone,
    locale: 'he-IL',
    acceptDownloads: true,
    reducedMotion: 'reduce',
    colorScheme: scheme
  });
  const page = await context.newPage();
  const outside = [],
    errors = [];
  page.on('request', (r) => {
    if (!/^(data|blob):/.test(r.url()) && new URL(r.url()).origin !== new URL(SITE).origin) outside.push(r.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    ({ items, tourSeen, mode, design }) => {
      navigator.clipboard.writeText = () => Promise.reject(new Error('no clipboard')); // the copy button then shows its text dialog
      window.__prints = 0;
      window.print = () => {
        window.__prints++;
      };
      if (!sessionStorage.getItem('__seeded')) {
        sessionStorage.setItem('__seeded', '1');
        for (const [k, v] of Object.entries({ ...tourSeen, ...mode, ...design, ...items })) localStorage.setItem(k, v);
      }
    },
    { items: seed, tourSeen: withTour ? null : TOUR_SEEN, mode: withModeChoice ? null : MODE_BUILD, design: design ? { [DESIGN_KEY]: design } : null }
  );
  t.after(async () => {
    await context.close();
    assert.deepEqual(outside, [], 'a request left the local server');
    assert.deepEqual(errors, [], 'a script error');
  });
  await page.goto(SITE + hash);
  return page;
}

export const onA = (page) => page.evaluate(() => document.documentElement.dataset.design === 'a');
// the dock buttons of the A frame (ui-shell.js): the wishes tool is the old "prefs" step
const DOCK = { me: 'me', courses: 'courses', prefs: 'wishes', friends: 'friends' };
// Goes to a step the way a student does. view: 'me' | 'courses' | 'prefs' | 'friends' | 'plan'.
// Classic clicks the step bar ('friends' lives on the prefs step there); A taps the dock button, and 'plan' closes the open tool.
export async function openStep(page, view) {
  if (await onA(page)) {
    if (view === 'plan') await page.evaluate(() => (location.hash = ''));
    else await page.locator(`.dock [data-tool="${DOCK[view]}"]`).click();
    return;
  }
  await page.locator(`nav.steps a[data-view="${view === 'friends' ? 'prefs' : view}"]`).click();
}
// The friends, by address (classic: the prefs page; A: the friends tool).
export async function openFriends(page) {
  await page.goto(SITE + friendsHash((await onA(page)) ? 'a' : ''));
}
// "סיכום ליועץ" and "רשימה להרשמה": classic opens a drawer from the header; A has one take-out tool (#out) that holds both, opened by its address.
export async function openAdvisor(page) {
  if (await onA(page)) {
    await page.evaluate(() => (location.hash = '#out'));
    await page.locator('#out .advisor-sum').waitFor();
  } else await page.locator('#advisorBtn').click();
}
export async function openRegistration(page) {
  if (await onA(page)) {
    await page.evaluate(() => (location.hash = '#out'));
    await page.locator('#out [data-act="copyReg"]').waitFor();
  } else await page.locator('[data-act="panel"][data-panel="reg"]').click();
}
// where the opened summary or list is
export const takeOutRoot = async (page) => ((await onA(page)) ? '#out' : '#drawer[open]');
// The progress map: classic has a button in the header; A has it in the ☰ menu (the map opens over the menu).
export async function openMap(page) {
  if (await onA(page)) {
    await page.locator('.menu-btn').click();
    await page.locator('#drawer [data-act="openMap"]').click();
  } else await page.locator('[data-act="openMap"]').click();
}

// Design A, a phone: the edit page's tool is a sheet over the week. These put the week in view, or the tool, whichever the next step needs; the lesson
// buttons cannot be pressed under the sheet, nor the controls over a closed one. Classic and a wide screen: nothing to do.
export async function editWeekView(page) {
  if (!(await onA(page))) return;
  const x = page.locator('.edit-sheet-x');
  if (await x.isVisible()) await x.click();
}
export async function editToolView(page) {
  if (!(await onA(page))) return;
  const stage = page.locator('.edit-stage[data-sheet="closed"]');
  if (await stage.count()) await page.locator('.dock [data-tool="changes"]').click();
}

// A made-up yedion export (the real one carries the student's ID number and is never committed): day headers in row 2, a lesson per cell.
export const yedionXlsx = (cells) => {
  const all = { B2: 'יום ראשון', C2: 'יום שני', D2: 'יום שלישי', E2: 'יום רביעי', F2: 'יום חמישי', G2: 'יום שישי', ...cells };
  const c = (ref, t) => `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></is></c>`;
  return Buffer.from(zipSync({
    'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="FileFromYedion" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData><row>${Object.entries(all).map(([r, t]) => c(r, t)).join('')}</row></sheetData></worksheet>`)
  }));
};
export const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
