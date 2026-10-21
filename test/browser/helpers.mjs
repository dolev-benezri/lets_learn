// Shared by the browser specs: the fictional student, the seeded storage, the synthetic grade-sheet PDF and visit().
import assert from 'node:assert/strict';

export const SITE = process.env.SITE_URL;
export const SIZES = { phone: { width: 375, height: 812 }, desktop: { width: 1280, height: 800 } };
export const PASSED = ['10016', '30003', '30130', '30133', '30135', '30137', '90901', '90902', '90903', '90905', '90914'];
export const STUDENT = { v: 1, year: 2027, semester: 'א', program: 30, startYear: 2026, programSet: true, passed: PASSED,
  profile: { year: 2, amirnet: 134, specs: [], summer: false } };
export const DONE = { 'afeka-sched-v1-terms': '2', 'afeka-sched-v1-onboarded': '1', 'afeka-sched-v1-entry': '1', 'afeka-sched-v1': JSON.stringify(STUDENT) };

// A one-page PDF with two rows in the grade sheet's shape (code, name, credits, grade); synthetic, never a real sheet.
export function gradeSheetPdf(lines) {
  const stream = `BT /F1 12 Tf 40 760 Td 16 TL ${lines.map((l) => `(${l}) Tj T*`).join(' ')} ET`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let pdf = '%PDF-1.4\n'; const at = [];
  objs.forEach((o, i) => { at.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`;
  return Buffer.from(`${pdf}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`, 'latin1');
}


// A new browser context (empty storage) at this size; `seed` is written into localStorage once, before the site's first script. print() is counted, not shown.
// `size` is 'phone' or 'desktop', or a { width, height } of its own. `scheme` is the device's colour scheme (the site follows it). The outside-request and script-error checks run when the test ends.
// The first-visit tour is marked seen, so it never stands between a test and the page; `withTour` leaves it unseen (tour.spec.mjs, and the axe run with its popover open).
export const TOUR_SEEN = { 'afeka-sched-v1-tour': 'intro,plans' };
export async function visit(browser, t, size, seed = null, hash = '', scheme = 'light', withTour = false) {
  const viewport = typeof size === 'string' ? SIZES[size] : size, phone = viewport.width < 600;
  const context = await browser.newContext({ viewport, isMobile: phone, hasTouch: phone, locale: 'he-IL', acceptDownloads: true, reducedMotion: 'reduce', colorScheme: scheme });
  const page = await context.newPage();
  const outside = [], errors = [];
  page.on('request', (r) => { if (!/^(data|blob):/.test(r.url()) && new URL(r.url()).origin !== new URL(SITE).origin) outside.push(r.url()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(({ items, tourSeen }) => {
    navigator.clipboard.writeText = () => Promise.reject(new Error('no clipboard')); // the copy button then shows its text dialog
    window.__prints = 0; window.print = () => { window.__prints++; };
    if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1'); for (const [k, v] of Object.entries({ ...tourSeen, ...items })) localStorage.setItem(k, v); }
  }, { items: seed, tourSeen: withTour ? null : TOUR_SEEN });
  t.after(async () => { await context.close(); assert.deepEqual(outside, [], 'a request left the local server'); assert.deepEqual(errors, [], 'a script error'); });
  await page.goto(SITE + hash);
  return page;
}
