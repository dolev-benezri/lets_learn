// Design A declutter (docs/superpowers/specs/2026-11-22-design-a-declutter.md): what left the board and where it went. Every visit sets { design: 'a' }
// unless a test says classic. No top-level await in a spec: node:test then hangs after the run.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { STUDENT, DONE, launch, visit as visitIn } from './helpers.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const visit = (t, size, seed, hash = '', design = 'a') => visitIn(browser, t, size, seed, hash, 'light', false, false, { design });
const weekReady = (page) => page.locator('#week .blk').first().waitFor({ timeout: 30000 });
const label = (page) => page.locator('#altLabel').textContent();
const SIZES = { desktop: 'desktop', phone: 'phone', 320: { width: 320, height: 640 } };

// ---- step 1: the facts line and "פרטים" ----
for (const [name, size] of Object.entries(SIZES)) {
  test(`${name}: the summary is one plain facts line and a closed "פרטים" whose count is its lines`, async (t) => {
    const page = await visit(t, size, DONE);
    await weekReady(page);
    assert.equal(await page.locator('#pills .pill').count(), 0, 'no chips');
    assert.equal(await page.locator('#pills .pill-info').count(), 0, 'no loose sentences');
    const facts = await page.locator('#pills .a-facts > span').allTextContents();
    assert.match(facts[0], /^\d* ?קורסים?|קורס אחד/, 'the courses first');
    assert.ok(facts.some((f) => /נ״ז$/.test(f)), 'the credits');
    assert.ok(facts.some((f) => /פנוי/.test(f)), 'the free days');
    assert.ok(facts.some((f) => /חלונות|חלון|בלי חלונות/.test(f)), 'the gaps');
    assert.ok(/בחינות|בין בחינות/.test(facts.at(-1)), 'the exam fact is the last fact');
    const lines = await page.locator('#pills .a-det-body p').count();
    assert.match(await page.locator('#pills .a-details > summary').textContent(), new RegExp(`^\\s*פרטים \\(${lines}\\)\\s*$`), 'the summary counts the lines');
    assert.equal(await page.locator('#pills .a-details').evaluate((d) => d.open), false, 'closed by default');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(over <= 0, `no sideways scroll (${over})`);
    const box = await page.locator('#pills .a-details > summary').boundingBox();
    assert.ok(box.height >= 43.5 || size === 'desktop', `the summary is a 44px target (${box.height})`);
  });
}

test('"פרטים": the keyboard opens and closes it, and its state survives the board being drawn again', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await weekReady(page);
  const details = page.locator('#pills .a-details'),
    sum = page.locator('#pills .a-details > summary');
  const next = async () => {
    const was = await label(page);
    await page.locator('#next').click(); // the board is drawn again with another alternative
    await page.waitForFunction((l) => document.getElementById('altLabel').textContent !== l, was);
  };
  await sum.focus();
  await page.keyboard.press('Enter');
  assert.equal(await details.evaluate((d) => d.open), true);
  assert.ok((await page.locator('#pills .a-det-body p').count()) > 0, 'the lines are there');
  await next();
  assert.equal(await details.evaluate((d) => d.open), true, 'still open after another alternative');
  await sum.focus();
  await page.keyboard.press('Space');
  assert.equal(await details.evaluate((d) => d.open), false, 'closed by the keyboard');
  await next();
  assert.equal(await details.evaluate((d) => d.open), false, 'and a closed one stays closed');
});

test('the live region announces the exam fact, and the facts that stay on screen', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await weekReady(page);
  const live = await page.locator('#live').textContent();
  assert.match(live, /חלופה 1 מתוך/);
  assert.match(live, /בחינות: טרם פורסמו/, 'the exam fact left the chips, not the announcement');
  assert.match(live, /נ״ז/);
});

test('classic keeps its chips and its three sentences', async (t) => {
  const page = await visit(t, 'desktop', DONE, '', 'classic');
  await weekReady(page);
  assert.ok((await page.locator('#pills .pill').count()) >= 5, 'the chips');
  assert.equal(await page.locator('#pills .a-details, #pills .a-facts').count(), 0);
  assert.match(await page.locator('#pills').innerText(), /לוח הבחינות טרם פורסם/);
});

// the student whose year plan shows the year chip, the rank and the sentences that moved into "פרטים"
test('a year plan: the year total, the rank and the "best found" sentence are in "פרטים", not in the line', async (t) => {
  const page = await visit(t, 'desktop', { ...DONE, 'afeka-sched-v1': JSON.stringify({ ...STUDENT, scope: 'year' }) });
  await weekReady(page);
  await page.waitForFunction(() => document.getElementById('board')?.getAttribute('aria-busy') === 'false', null, { timeout: 30000 });
  const line = await page.locator('#pills .a-facts').innerText();
  assert.doesNotMatch(line, /בכל השנה/);
  const body = await page.locator('#pills .a-det-body').textContent();
  assert.match(body, /בכל השנה: .*נ״ז/);
  assert.match(body, /אלה החלופות הטובות ביותר שנמצאו, לא בהכרח כל האפשרויות/);
});

// ---- step 2 (phase 1 Task 6): the strip is one short legal line; above the week only what matters now, the rest is in "פרטים" ----
const flat = (s) => s.replace(/\s+/g, ' ').trim();
const LEGAL_SHORT = 'לא רשמי · אינו הרשמה ואינו המלצה';
const LEGAL_FULL = 'לא רשמי · אינו הרשמה ואינו המלצה (ההרשמה באפקה-נט)';
const DISCLAIMER = 'אינו הרשמה ואינו המלצה. לפני ההרשמה מומלץ להתייעץ עם יועץ לימודים.';
const STALE = 'נבדק לפני \\d+ ימים'; // the frozen test status is old

for (const [name, size] of [['1280', 'desktop'], ['a phone on its side', { width: 667, height: 375 }]]) {
  test(`${name}: the strip is the short legal line and, when the data is old, one warning; nothing else, and the board does not say it again`, async (t) => {
    const page = await visit(t, size, DONE);
    await weekReady(page);
    assert.match(flat(await page.locator('.a-unofficial').innerText()), new RegExp(`^${LEGAL_SHORT} · ${STALE} · פרטים$`));
    assert.equal(await page.locator('#aStale .warn-text svg').count(), 1, 'the alert icon, not colour alone');
    assert.equal(await page.locator('#boardNote .a-warn-p').isVisible(), false, 'the phone line is not shown from 600px');
    assert.equal(await page.locator('#disclaimer').innerText(), '', 'the full sentence left the board');
    assert.doesNotMatch(await page.locator('.a-unofficial').innerText(), /אפקה-נט|הכללים/, 'the registration pointer and the rules are in "פרטים"');
    assert.equal(await page.locator('#meta').isVisible(), false, 'the data line is not in the strip any more');
  });
}

for (const [name, size] of [['320', { width: 320, height: 640 }], ['375', 'phone']]) {
  test(`${name}: the strip keeps only the legal line; the old-data warning is one short line right above the week`, async (t) => {
    const page = await visit(t, size, DONE);
    await weekReady(page);
    assert.equal(flat(await page.locator('.a-unofficial').innerText()), `${LEGAL_SHORT} · פרטים`);
    const line = page.locator('#boardNote .a-warn-p');
    assert.ok(await line.isVisible());
    assert.match(flat(await line.innerText()), new RegExp(`^${STALE}$`), 'the short warning alone: no rules clause, no long sentence');
    assert.equal(await line.locator('svg').count(), 1, 'with the alert icon');
    assert.equal(await page.locator('#boardNote .a-warn-p').count(), 1, 'one line, not two');
  });
}

test('the "פרטים" link of the strip opens ☰ "מידע" with the full sentences, and Escape returns to it', async (t) => {
  const page = await visit(t, 'phone', DONE);
  await weekReady(page);
  const link = page.locator('.a-uno-more');
  const box = await link.boundingBox();
  assert.ok(box.height >= 43.5 && box.width >= 43.5, `a 44px target (${box.width}x${box.height})`);
  await link.click();
  const drawer = page.locator('#drawer[open]');
  await drawer.waitFor();
  const text = flat(await drawer.innerText());
  assert.ok(text.includes(DISCLAIMER), 'the full sentence is in "מידע"');
  assert.ok(text.includes(LEGAL_FULL), 'and the legal line in full, with the registration pointer');
  assert.ok(text.includes('בדקו מול היועץ לפני ההרשמה'), 'and the advisor line for unapproved rules');
  assert.match(text, /הנתונים נבדקו לפני \d+ ימים, ייתכן שהשתנו/, 'and the freshness sentence in full');
  await page.keyboard.press('Escape');
  await page.locator('#drawer[open]').waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.activeElement?.dataset.k === 'aUnoMore', null, { timeout: 5000 }); // the close handler returns the focus to the opener
});

test('a phone: the line follows the data state without a reload (fresh data leaves no line), and the full sentences are in "פרטים"', async (t) => {
  const page = await visit(t, 'phone', DONE);
  await weekReady(page);
  const line = page.locator('#boardNote .a-warn-p');
  const set = (status) =>
    page.evaluate(async (s) => {
      const { app } = await import('./app.js');
      const v = await import('./ui-view.js');
      app.status = s;
      v.renderTop();
      v.renderBanner();
    }, status);
  const now = new Date().toISOString();
  await set({ checkedAt: now, ok: true, semesters: { '2027-1/30-2026': { checkedAt: now }, '2027-2/30-2026': { checkedAt: now } } });
  assert.equal(await line.count(), 0, 'fresh: nothing to say');
  await set({ checkedAt: now, ok: false });
  assert.equal(flat(await line.innerText()), 'הבדיקה האחרונה נכשלה');
  await set(null);
  assert.equal(flat(await line.innerText()), 'לא ידוע מתי נבדק');
  await page.locator('#pills .a-details > summary').click();
  const body = page.locator('#pills .a-det-body');
  assert.ok(await body.isVisible(), 'the opened details are visible on a phone');
  assert.ok(flat(await body.innerText()).includes(DISCLAIMER));
  assert.ok(flat(await body.innerText()).includes('בדקו מול היועץ לפני ההרשמה'));
});

test('a phone behind the first-visit gate: the strip still says the data is old (the board that would say it is covered)', async (t) => {
  const page = await visit(t, 'phone', { 'afeka-sched-v1-terms': '2' });
  await page.locator('.gate').first().waitFor({ timeout: 30000 });
  await page.waitForFunction(() => document.getElementById('aStale')?.textContent.trim().length > 0);
  assert.equal(await page.locator('#aStale').isVisible(), true);
  assert.match(flat(await page.locator('.a-unofficial').innerText()), new RegExp(`^${LEGAL_SHORT} · ${STALE} · פרטים$`));
});

test('the improve page has no board note: a phone strip there keeps the old-data warning', async (t) => {
  const page = await visit(t, 'phone', DONE, '#edit');
  await page.locator('#edit .edit-stage').waitFor({ timeout: 30000 });
  assert.match(flat(await page.locator('.a-unofficial').innerText()), new RegExp(`^${LEGAL_SHORT} · ${STALE} · פרטים$`));
});

test('"פרטים" ends with the legal sentences, in full ("(ההרשמה באפקה-נט)", the disclaimer, the rules), and so does the take-out tool', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await weekReady(page);
  const lines = (await page.locator('#pills .a-det-body > p').allTextContents()).map(flat);
  const n = lines.length;
  assert.match(lines[n - 4], /^הנתונים נבדקו לפני \d+ ימים, ייתכן שהשתנו$/, 'the freshness sentence in full, before the legal ones');
  assert.equal(lines[n - 3], LEGAL_FULL, 'the legal line in full');
  assert.ok(lines[n - 2].includes(DISCLAIMER), 'the disclaimer');
  assert.equal(lines[n - 1], 'הכללים לא אושרו על ידי המחלקה. בדקו מול היועץ לפני ההרשמה.', 'and the rules, last');
  await page.evaluate(() => (location.hash = '#out'));
  await page.locator('#out [data-act="copyReg"]').waitFor();
  assert.ok(flat(await page.locator('#out').innerText()).includes(DISCLAIMER), 'the take-out tool, where a student goes to register');
});

// the warning has four states: the frozen status is old (it says so); a failed check and no check say their own words; a fresh one says nothing in the strip
test('the strip warns when the data is old, failed or never checked (alert icon + short words); fresh says nothing; ☰ "מידע" has the whole sentence', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await weekReady(page);
  assert.match(flat(await page.locator('#aStale .warn-text').innerText()), new RegExp(`^${STALE}$`));
  assert.equal(await page.locator('#aStale .warn-text svg').count(), 1, 'the alert icon, not colour alone');
  // the file counts as checked at the time of a later successful check that covers it (app.js boardStatus: freshAt), so the status names this file
  const keys = await page.evaluate(async () => {
    const { app } = await import('./app.js'); // a year plan reads the older of the two semester files
    return ['א', 'ב'].filter((s) => app.sem[s]).map((s) => `${app.sem[s].year}-${{ 'א': 1, 'ב': 2 }[s]}/${app.sem[s].program}-${app.sem[s].startYear}`);
  });
  const now = new Date().toISOString();
  const states = [
    [{ checkedAt: now, ok: true, semesters: Object.fromEntries(keys.map((k) => [k, { checkedAt: now }])) }, null, /נבדק (עכשיו|לפני \d+ (דקות|דקה|שעות|שעה))/],
    [{ checkedAt: now, ok: false }, 'הבדיקה האחרונה נכשלה', /הבדיקה האחרונה של הנתונים נכשלה\. הם השתנו לאחרונה ב-\d+\.\d+/],
    [null, 'לא ידוע מתי נבדק', /לא ידוע מתי הנתונים נבדקו\. הם השתנו לאחרונה ב-\d+\.\d+/] // no status file at all
  ];
  for (const [status, short, full] of states) {
    await page.route('**/data/afeka/status.json', (r) => (status ? r.fulfill({ contentType: 'application/json', body: JSON.stringify(status) }) : r.fulfill({ status: 404, body: '' })));
    await page.reload();
    await weekReady(page);
    if (short) assert.equal(flat(await page.locator('#aStale .warn-text').innerText()), short);
    else assert.equal(await page.locator('#aStale').isVisible(), false, 'fresh: the strip has nothing to add');
    await page.locator('.a-uno-more').click();
    await page.locator('#drawer[open]').waitFor();
    assert.match(flat(await page.locator('#drawer').innerText()), full);
    await page.keyboard.press('Escape');
    await page.locator('#drawer[open]').waitFor({ state: 'detached' });
    await page.unroute('**/data/afeka/status.json');
  }
});

// ---- step 3: what ב׳ counts on from א׳ is one short info line on ב׳ only, its sentence is in "פרטים" ----
const onB = async (page) => {
  await page.locator('label:has(input[name="sem"][value="ב"])').first().click();
  await page.waitForFunction(() => document.querySelector('input[name="sem"][value="ב"]')?.checked);
  await idle(page);
};

test('on א׳ the A-semester assumption has no line on the board: it is a sentence in "פרטים"', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await weekReady(page);
  await idle(page);
  assert.equal(await page.locator('#semnote .a-after').count(), 0, 'it speaks about ב׳: no line on א׳');
  assert.equal(await page.locator('#aAfterA').isVisible(), false, 'behind "פרטים"');
  await page.locator('#pills .a-details > summary').click();
  assert.match(flat(await page.locator('#aAfterA').innerText()), /^התכנון של ב׳ מניח שעוברים את .+ בא׳$/, 'today\'s words, with the groups');
});

test('on ב׳ the A-semester assumption is one short line with its count, no fill; "אילו?" opens "פרטים" at the full sentence', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await weekReady(page);
  await onB(page);
  const line = page.locator('#semnote .a-after');
  await line.waitFor();
  assert.match(flat(await line.innerText()), /^התכנון של ב׳ מניח שתעברו בא׳ (\d+ דרישות קדם|דרישת קדם אחת)\. אילו\?$/);
  assert.equal(await line.evaluate((e) => getComputedStyle(e).backgroundColor), 'rgba(0, 0, 0, 0)', 'no fill: information does not outrank the product');
  const closed = await page.locator('#pills .a-details').evaluate((d) => d.open);
  assert.equal(closed, false);
  assert.equal(await page.locator('#aAfterA').isVisible(), false, 'the full sentence is behind "פרטים"');
  await page.locator('#semnote .a-which').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#pills .a-details').evaluate((d) => d.open), true);
  assert.match(flat(await page.locator('#aAfterA').innerText()), /^התכנון של ב׳ מניח שעוברים את .+ בא׳$/, 'today\'s words, with the groups');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'aAfterA', 'the focus follows the answer');
  await page.evaluate(async () => (await import('./app.js')).refresh()); // the board is drawn again while the answer holds the focus
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'aAfterA', 'and keeps it over a redraw');
  const count = Number((/(\d+) דרישות/.exec(flat(await line.innerText())) ?? [0, 1])[1]);
  const groups = flat(await page.locator('#aAfterA').innerText()).replace(/^התכנון של ב׳ מניח שעוברים את /, '').replace(/ בא׳$/, '').split(', ');
  assert.equal(groups.length, count, 'the count is the number of groups in the sentence');
});

for (const [name, size] of [['320', { width: 320, height: 640 }], ['375', 'phone']]) {
  test(`${name}: the "אילו?" button of ב׳'s line is a 44px target and the line does not scroll the page sideways`, async (t) => {
    const page = await visit(t, size, DONE);
    await weekReady(page);
    await onB(page);
    const box = await page.locator('#semnote .a-which').boundingBox();
    assert.ok(box.height >= 43.5 && box.width >= 43.5, `${box.width}x${box.height}`);
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0);
  });
}

test('classic keeps its teal sentence', async (t) => {
  const page = await visit(t, 'desktop', DONE, '', 'classic');
  await weekReady(page);
  await page.locator('#semnote .notice', { hasText: 'התכנון של ב׳ מניח שעוברים את' }).first().waitFor({ timeout: 30000 });
  assert.equal(await page.locator('#semnote .a-after, #aAfterA').count(), 0);
});

// ---- step 4: the controls (scope off the board, semester tabs in the bar, the sort in the column or in "פרטים") ----
const idle = (page) => page.waitForFunction(() => document.getElementById('board')?.getAttribute('aria-busy') === 'false', null, { timeout: 30000 });
const order = (page, ids) =>
  page.evaluate((list) => {
    const els = list.map((s) => document.querySelector(s));
    return els.every((e, i) => i === 0 || els[i - 1].compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING);
  }, ids);

test('the plan scope is not on the board; it lives in "מה חשוב לי"', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await weekReady(page);
  assert.equal(await page.locator('input[name="bscope"]').count(), 0, 'no scope tabs on the board');
  await page.locator('.dock [data-tool="wishes"]').click();
  await page.locator('#prefs input[name="scope"]').first().waitFor({ state: 'attached', timeout: 30000 });
  assert.ok((await page.locator('#prefs input[name="scope"]').count()) >= 2, 'the one home of the scope');
});

test('1280: the semester tabs are in the bar before the switcher and the share button; the sort is in the column under "חלופות לשנה"', async (t) => {
  const page = await visit(t, 'desktop', { ...DONE, 'afeka-sched-v1-alts': 'open' });
  await weekReady(page);
  assert.equal(await page.locator('.a-bar #semtabs').count(), 1);
  assert.ok(await order(page, ['#semtabs', '#switcher', '.a-share']), 'tab order: semester tabs, alternatives, share');
  assert.equal(flat(await page.locator('#alts .col-t').innerText()), 'חלופות לשנה');
  const sort = page.locator('#alts .a-sort select');
  assert.ok(await sort.isVisible());
  assert.equal(flat(await page.locator('#alts .a-sort .ctl-l').innerText()), 'לפי');
  assert.equal(await page.locator('.a-sort-d').isVisible(), false, 'not twice on a wide screen');
  assert.equal(await page.locator('#showby').isVisible(), false, 'classic\'s slot stays empty');
  const m = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    return { tabs: r('#semtabs'), sw: r('#switcher'), share: r('.a-share') };
  });
  assert.ok(m.tabs.left > m.sw.right && m.sw.left > m.share.right, 'in RTL: tabs on the right, the switcher in the middle, share on the left');
});

test('a single-semester plan titles the column "חלופות" and has no semester tabs', async (t) => {
  const page = await visit(t, 'desktop', { ...DONE, 'afeka-sched-v1-alts': 'open', 'afeka-sched-v1': JSON.stringify({ ...STUDENT, scope: 'א' }) });
  await weekReady(page);
  await idle(page);
  assert.equal(flat(await page.locator('#alts .col-t').innerText()), 'חלופות');
  assert.equal(await page.locator('#semtabs input').count(), 0);
});

test('a phone: the semester tabs keep their own row in the board; the sort is in "פרטים", and changing it keeps the panel open and the focus', async (t) => {
  const page = await visit(t, 'phone', DONE);
  await weekReady(page);
  await idle(page);
  assert.equal(await page.locator('.a-bar #semtabs').count(), 0, 'not in the bar below 1080px');
  assert.equal(await page.locator('#board > #semtabs').count(), 1);
  assert.equal(await page.locator('#alts').isVisible(), false);
  const select = page.locator('.a-sort-d select');
  assert.equal(await select.isVisible(), false, 'closed: behind "פרטים"');
  await page.locator('#pills .a-details > summary').click();
  assert.ok(await select.isVisible());
  await select.focus();
  await select.selectOption('credits');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('afeka-sched-v1')).sortBy === 'credits');
  await idle(page);
  assert.equal(await page.locator('#pills .a-details').evaluate((d) => d.open), true, 'the panel stays open');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), 'sortByD', 'and the focus stays on the select');
  assert.equal(await page.locator('.a-sort-d select').inputValue(), 'credits');
});

test('crossing 1080px moves the semester tabs into the bar and back, and a focused tab keeps its focus', async (t) => {
  const page = await visit(t, { width: 900, height: 800 }, DONE);
  await weekReady(page);
  await idle(page);
  assert.equal(await page.locator('#board > #semtabs').count(), 1);
  const focused = () => page.evaluate(() => document.activeElement?.dataset.k);
  await page.locator('#semtabs input[name="sem"]').first().focus();
  const k = await focused();
  assert.match(k, /^sem-/);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForFunction(() => document.querySelector('.a-bar > #semtabs'));
  assert.equal(await focused(), k, 'focus kept on the way into the bar');
  await page.setViewportSize({ width: 900, height: 800 });
  await page.waitForFunction(() => document.querySelector('#board > #semtabs'));
  assert.equal(await focused(), k, 'and on the way back');
  assert.equal(await page.locator('#semtabs input[name="sem"]').count(), 2, 'the tabs survive the moves');
});

// the bar at its tightest: a 480px board (1080px: a 360px tool column and a 240px alternatives column), with the summer tab
const SUMMER = { ...DONE, 'afeka-sched-v1': JSON.stringify({ ...STUDENT, profile: { ...STUDENT.profile, summer: true } }) };
for (const [name, seed] of [['two tabs', DONE], ['with the summer tab', SUMMER]]) {
  test(`1080px ${name}: the bar's controls stay inside the bar, none on top of another`, async (t) => {
    const page = await visit(t, { width: 1080, height: 800 }, seed);
    await weekReady(page);
    await idle(page);
    const m = await page.evaluate(() => {
      const box = (e) => e.getBoundingClientRect();
      const bar = box(document.getElementById('aBar'));
      const parts = [...document.querySelectorAll('#semtabs label, #switcher, .a-share')].map((e) => ({ n: e.id || e.className || e.tagName, r: box(e) }));
      const outside = parts.filter(({ r }) => r.left < bar.left - 0.5 || r.right > bar.right + 0.5).map(({ n }) => n);
      const clash = [];
      for (const [i, a] of parts.entries())
        for (const b of parts.slice(i + 1))
          if (a.r.left < b.r.right - 0.5 && b.r.left < a.r.right - 0.5 && a.r.top < b.r.bottom - 0.5 && b.r.top < a.r.bottom - 0.5) clash.push(`${a.n}/${b.n}`);
      return { outside, clash, labels: parts.filter(({ n }) => n === 'LABEL' || /sem/.test(n)).length };
    });
    assert.deepEqual(m.outside, [], 'inside the bar');
    assert.deepEqual(m.clash, [], 'no overlap');
  });
}

test('a search that found nothing leaves the sort where it can be reached (the column and "פרטים" are gone then)', async (t) => {
  const none = { ...STUDENT, constraints: { ...(STUDENT.constraints ?? {}), dayOff: [1, 2, 3, 4, 5, 6], dayOffHard: true } };
  const page = await visit(t, 'desktop', { ...DONE, 'afeka-sched-v1': JSON.stringify(none) });
  await page.locator('#week .msg.bad').waitFor({ timeout: 30000 });
  assert.equal(await page.locator('#showby select').isVisible(), true);
  assert.equal(await page.locator('#alts').isVisible(), false);
});

test('1280 and a phone: the "אילו?" and the strip link and the sort are targets, with the semester tabs (44px on a phone)', async (t) => {
  for (const size of ['desktop', 'phone']) {
    const page = await visit(t, size, DONE);
    await weekReady(page);
    if (size === 'phone') await page.locator('#pills .a-details > summary').click();
    const small = await page.evaluate(() => {
      const bad = [];
      const min = innerWidth < 600 ? 43.5 : 35.5; // --tap is 44px for a finger and 36px for a mouse (style.css)
      for (const el of document.querySelectorAll('.a-strip button, .a-which, #semtabs label, #alts select, .a-sort-d select, #pills summary')) {
        if (!el.checkVisibility()) continue;
        const r = el.getBoundingClientRect();
        if (r.height < min || r.width < 43.5) bad.push(`${el.tagName} ${el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return bad;
    });
    assert.deepEqual(small, [], `${size}: targets`);
  }
});

// ---- step 5: shorter notices (several left-out courses, the hours outside the wished ones) ----
import { readFileSync } from 'node:fs';
const FIXTURE_IDS = Object.keys(JSON.parse(readFileSync(new URL('../fixtures/real/2027-1/30-2026.json', import.meta.url), 'utf8')).courses);
// many "אולי" courses: the plan cannot hold them all, and a soft "not before 12:00" leaves hours outside the wished ones
const MANY = {
  ...DONE,
  'afeka-sched-v1': JSON.stringify({ ...STUDENT, choices: Object.fromEntries(FIXTURE_IDS.slice(0, 60).map((i) => [i, 'optional'])), constraints: { notBefore: '12:00' } })
};

test('several left-out courses are one short line with the count and the credits; "אילו?" opens the names in "פרטים"', async (t) => {
  const page = await visit(t, 'desktop', MANY);
  const line = page.locator('#week .a-leftout');
  await line.waitFor({ timeout: 60000 });
  await idle(page);
  assert.match(flat(await line.innerText()), /^(\d+) קורסים לא נכנסו \(\d+(\.\d)? נ״ז\)\. אילו\?$/);
  assert.equal(await page.locator('#aLeftOut').isVisible(), false, 'the names are behind "פרטים"');
  const n = Number(/^(\d+)/.exec(flat(await line.innerText()))[1]);
  await page.locator('#week .a-leftout .a-which').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#pills .a-details').evaluate((d) => d.open), true);
  const full = flat(await page.locator('#aLeftOut').innerText());
  assert.match(full, new RegExp(`^לא נכנסו לחלופה הזו ${n} קורסים, [\\d.]+ נ״ז: `), 'today\'s words, with the same count');
  assert.equal((full.match(/\([\d.]+ נ״ז\)/g) ?? []).length, Math.min(n, 6), 'the names, six at most, each with its credits');
  if (n > 6) assert.match(full, new RegExp(`ועוד ${n - 6}\\.$`), 'and how many more');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'aLeftOut');
});

test('the hours outside the wished ones: a short "פרטים" line with a "להפוך לחובה" link, not a line above the week', async (t) => {
  const page = await visit(t, 'desktop', MANY);
  const line = page.locator('#pills .a-det-body p', { hasText: 'מחוץ לשעות שביקשת' });
  await line.waitFor({ state: 'attached', timeout: 60000 });
  await idle(page);
  assert.equal(await page.locator('#week .notice', { hasText: 'מחוץ לשעות שביקשת' }).count(), 0, 'nothing above the week');
  await page.locator('#pills .a-details > summary').click();
  assert.match(flat(await line.innerText()), /^(כ-\d+ שעות|10 שעות או יותר) מחוץ לשעות שביקשת\. להפוך לחובה$/);
  assert.equal(await line.locator('a').getAttribute('href'), '#prefs');
  assert.doesNotMatch(await line.innerText(), /אפשר להפוך את השעות לחובה/);
});

test('classic keeps its long left-out and outside-hours sentences', async (t) => {
  const page = await visit(t, 'desktop', MANY, '', 'classic');
  await page.locator('#week .notice', { hasText: 'לא נכנסו לחלופה הזו' }).first().waitFor({ timeout: 60000 });
  await idle(page);
  assert.match(await page.locator('#week').innerText(), /במערכת הזו (כ-\d+ שעות שבועיות|10 שעות שבועיות או יותר) מחוץ לשעות הרצויות\. אפשר להפוך את השעות לחובה בהעדפות\./);
  assert.match(flat(await page.locator('#week .notice', { hasText: 'לא נכנסו לחלופה הזו' }).first().innerText()), /^לא נכנסו לחלופה הזו \d+ קורסים, [\d.]+ נ״ז: .+\.$/, 'the whole sentence, as before');
  assert.equal(await page.locator('#week .a-leftout, #week .a-which, #aLeftOut').count(), 0, 'nothing of design A');
});

// ---- step 6: the course card's status line, the toggletip and the citation behind "למה?" ----
const card = (page, name) => page.locator('#side article.course', { has: page.locator('h3', { hasText: name }) }).first();
const COURSE = 'מבוא להנדסת חשמל';
// the plan is computed (the status line says "in the plan" only once it is) and the tool is on screen
const coursesReady = async (page) => {
  await page.locator('#side article.course').first().waitFor({ timeout: 30000 });
  await idle(page);
  await card(page, COURSE).locator('.a-ok').waitFor({ timeout: 30000 });
};
// A real change of the card's course ("must": it was "maybe"), which redraws the whole tool: the card's node is replaced, then the search ends
async function redraw(page) {
  await card(page, COURSE).evaluate((e) => (e.dataset.old = '1'));
  await card(page, COURSE).locator('input[name^="mode-"][value="must"]').first().evaluate((e) => e.click());
  await page.waitForFunction((n) => !document.querySelector(`#side article.course[data-old]`) && document.querySelector('#side article.course h3'), null, { timeout: 30000 });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('afeka-sched-v1')).choices['20816'] === 'must');
  await idle(page);
}

test('the courses tool: "מה ההבדל?" holds the sentence that explained must / maybe / no, and keeps it open over a redraw', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#courses');
  await coursesReady(page);
  const btn = page.locator('#side .a-tip-btn'),
    body = page.locator('#aTipBody');
  assert.equal(await btn.getAttribute('aria-expanded'), 'false');
  assert.equal(await body.isVisible(), false);
  await btn.focus();
  await page.keyboard.press('Enter');
  assert.equal(await btn.getAttribute('aria-expanded'), 'true');
  assert.equal(flat(await body.innerText()), 'חובה: בכל מערכת. אולי: רק אם משתלב טוב. לא: לא בתכנון.', 'the text, unchanged');
  await redraw(page);
  assert.equal(await page.locator('#side .a-tip-btn').getAttribute('aria-expanded'), 'true', 'still open');
  assert.equal(await page.locator('#aTipBody').isVisible(), true);
  await page.locator('#side .a-tip-btn').focus();
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#aTipBody').isVisible(), false, 'and closed again by the keyboard');
});

test('a course card: the importance row, one status line, the warning tag alone, a short reason with "למה?"', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#courses');
  await coursesReady(page);
  const c = card(page, COURSE);
  assert.equal(await c.locator('.sem-row, .sem-lbl').count(), 0, 'no row of three semester buttons');
  const status = c.locator('.a-status');
  const select = status.locator('select');
  assert.match((await select.getAttribute('aria-label')) ?? '', /^באיזה סמסטר ללמוד את /, 'labelled as before');
  assert.deepEqual(await select.locator('option').allTextContents(), ['אוטומטי', 'א׳', 'ב׳']);
  assert.match(flat(await status.innerText()), /במערכת, [אב]׳/, 'in the plan, and in which semester');
  assert.equal(await status.locator('.a-ok svg').count(), 1, 'the check icon, not colour alone');
  assert.match(flat(await status.innerText()), /פותח \d+ קורסים|פותח קורס אחד/, 'what it opens is plain text on the line');
  assert.equal(await status.locator('.tag.ok:has-text("במערכת")').count(), 0, 'no tag for "in the plan"');
  assert.equal(await c.locator('.tags .tag.warn').count(), 1, 'the warning tag stays a tag');
  assert.match(flat(await c.locator('.tags').innerText()), /זמין בתנאי/);
  assert.equal(await status.locator('.tag.warn').count(), 0, 'and is not on the status line');
});

test('"למה?" opens the regulation citation in place, stays open over a redraw with the focus on it; the reason says it short', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#courses');
  await coursesReady(page);
  const reason = () => card(page, COURSE).locator('p.reason', { hasText: 'רק יחד עם' });
  assert.equal(flat(await reason().innerText()), 'רק יחד עם פיזיקה חשמל ומגנטיות למה?', 'the short reason');
  const why = () => reason().locator('.a-which');
  assert.match((await why().getAttribute('aria-label')) ?? '', /^למה\? .+: רק יחד עם/, 'the name says which course and reason, and keeps the visible words');
  assert.equal(await why().getAttribute('aria-expanded'), 'false');
  assert.match((await why().getAttribute('aria-controls')) ?? '', /^cite-[\w-]+$/, 'an id token without spaces');
  await why().focus();
  await page.keyboard.press('Enter');
  assert.equal(await why().getAttribute('aria-expanded'), 'true');
  assert.match(flat(await reason().innerText()), /\(קורס מקביל, תקנון 6\.2\.3\)/, 'the citation, in the words of the regulation');
  const k = await page.evaluate(() => document.activeElement?.dataset.k);
  assert.match(k, /^why-/);
  await redraw(page);
  assert.match(flat(await reason().innerText()), /\(קורס מקביל, תקנון 6\.2\.3\)/, 'still open');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), k, 'and the focus is on the new button');
});

test('the semester select on the card sets the course\'s semester and comes back drawn the same, a 44px target on a phone', async (t) => {
  const page = await visit(t, 'phone', DONE, '#courses');
  await page.locator('#panel #side article.course').first().waitFor({ timeout: 30000 });
  await idle(page);
  const select = () => card(page, COURSE).locator('.a-status select');
  assert.ok((await select().boundingBox()).height >= 43.5);
  const id = await select().getAttribute('data-id');
  const stored = (i) => page.evaluate((x) => JSON.parse(localStorage.getItem('afeka-sched-v1')).semesterOf?.[x], i);
  await select().focus();
  await select().selectOption('א');
  await page.waitForFunction((i) => JSON.parse(localStorage.getItem('afeka-sched-v1')).semesterOf?.[i] === 'א', id);
  await idle(page);
  assert.equal(await select().inputValue(), 'א', 'the new select says what was chosen');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), `sem-${id}`, 'and holds the focus');
  await select().selectOption('');
  await page.waitForFunction((i) => !JSON.parse(localStorage.getItem('afeka-sched-v1')).semesterOf?.[i], id);
  assert.equal(await stored(id), undefined, 'automatic again: the choice is removed');
});

test('classic keeps the card as it was: three semester buttons, tags, the full reason, the sentence on the page', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#courses', 'classic');
  await page.locator('#side article.course').first().waitFor({ timeout: 30000 });
  await idle(page);
  const c = card(page, COURSE);
  await c.locator('.tags .tag.ok', { hasText: 'במערכת' }).waitFor({ timeout: 30000 });
  assert.equal(await c.locator('.sem-row').count(), 1);
  assert.match(await c.locator('p.reason').innerText(), /\(קורס מקביל, תקנון 6\.2\.3\)/);
  assert.equal(await page.locator('#side .a-tip-btn, #side .a-status, #side .a-which').count(), 0);
  assert.match(await page.locator('#side > .hint').first().innerText(), /חובה: בכל מערכת\. אולי: רק אם משתלב טוב\. לא: לא בתכנון\./);
});

// ---- step 7: the registration list says the seat time once ----
const STATE = /^\((פנוי|מלא|נשאר מקום אחד|נשארו \d+ מקומות)\)$/;
test('the registration list says "המקומות נכונים ל-…" once, and each group only its state', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#out');
  await page.locator('#out [data-act="copyReg"]').waitFor({ timeout: 30000 });
  await idle(page);
  await page.locator('#out .reglist').first().waitFor();
  const text = flat(await page.locator('#out').innerText());
  assert.equal([...text.matchAll(/המקומות נכונים ל-(\d+\.\d+, )?\d\d:\d\d/g)].length, 1, 'the time is said once');
  assert.equal([...text.matchAll(/נכון ל-/g)].length, 0, 'and not after any group');
  const states = await page.locator('#out .reglist li p .hint.nw').allTextContents();
  assert.ok(states.length >= 2, 'groups in every list (a year plan has two)');
  for (const s of states) assert.match(s.trim(), STATE, 'only the state');
});

test('one listed group with a time of its own: the shared line goes, and every group keeps exactly its own text', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#out');
  await page.locator('#out [data-act="copyReg"]').waitFor({ timeout: 30000 });
  await idle(page);
  const own = await page.evaluate(async () => {
    const { app } = await import('./app.js');
    const { groupFresh } = await import('./ui-text.js');
    const { seatsAt } = await import('./app.js');
    const rows = [...document.querySelectorAll('#out .reglist li')];
    // one group of the first listed course, found by the id the row prints
    const row = rows[0], cid = row.querySelector('.hint').textContent.split(' · ')[0].trim();
    const gid = row.querySelector('bdi').textContent.trim();
    const sem = ['א', 'ב', 'קיץ'].find((s) => app.sem[s]?.courses[cid]?.groups.some((g) => g.id === gid));
    const g = app.sem[sem].courses[cid].groups.find((x) => x.id === gid);
    g.fetchedAt = '2020-01-01T10:00:00Z';
    (await import('./ui-drawer.js')).renderOut();
    return { gid, text: groupFresh(g, seatsAt(cid, app.sem[sem])) };
  });
  const lists = page.locator('#out .reglist li p');
  const all = (await lists.allTextContents()).map((s) => flat(s));
  const text = flat(await page.locator('#out').innerText());
  assert.equal([...text.matchAll(/המקומות נכונים ל-/g)].length, 0, 'no shared time when one group differs');
  const mine = all.filter((s) => s.includes(own.gid));
  assert.equal(mine.length, 1);
  assert.ok(mine[0].includes(`(${own.text})`), `that group says its own text: ${mine[0]} / ${own.text}`);
  assert.match(own.text, /נכון ל-1\.1, 12:00|נכון ל-01\.01, 12:00/, 'the exceptional time itself');
  for (const s of all.filter((x) => x !== mine[0])) assert.ok(/נכון ל-/.test(s), `every other group keeps its time too: ${s}`);
});

test('classic keeps the time after every group', async (t) => {
  const page = await visit(t, 'desktop', DONE, '', 'classic');
  await weekReady(page);
  await page.locator('[data-act="panel"][data-panel="reg"]').click();
  await page.locator('#drawer .reglist').first().waitFor();
  const all = (await page.locator('#drawer .reglist li p').allTextContents()).map((s) => flat(s));
  assert.ok(all.length >= 2);
  for (const s of all) assert.match(s, /\((פנוי|מלא|נשאר מקום אחד|נשארו \d+ מקומות) · נכון ל-(\d+\.\d+, )?\d\d:\d\d\)/, `each group says its time: ${s}`);
  assert.equal([...flat(await page.locator('#drawer').innerText()).matchAll(/המקומות נכונים ל-/g)].length, 0);
});

// ---- step 8: the small ones ----
test('the line under the name does not start with a separator', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await weekReady(page);
  const small = flat(await page.locator('#title small').textContent());
  assert.match(small, /^(שנה מלאה|סמסטר .׳) /, small);
  assert.doesNotMatch(small, /^·/);
  const classic = await visit(t, 'desktop', DONE, '', 'classic');
  await weekReady(classic);
  assert.match(flat(await classic.locator('#title small').textContent()), /^· /, 'classic keeps its separator');
});

test('"מה חשוב לי": one label "לתכנן" over the scope, no "העדפות" and "תכנון" headings; classic keeps them', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#prefs');
  await page.locator('#prefs input[name="scope"]').first().waitFor({ state: 'attached', timeout: 30000 });
  const heads = (await page.locator('#prefs h2, #prefs h3').allTextContents()).map(flat);
  assert.deepEqual(heads.slice(0, 2), ['מה חשוב לי', 'מה חשוב לך?'], `the tool's heading, then the first section: ${heads}`);
  assert.ok(!heads.includes('העדפות') && !heads.includes('תכנון'), `headings: ${heads}`);
  assert.equal(flat(await page.locator('#prefs legend', { hasText: 'לתכנן' }).first().innerText()), 'לתכנן');
  assert.equal(await page.locator('#prefs [aria-label="העדפות"]').count(), 1, 'the card keeps a name for assistive technology');
  const classic = await visit(t, 'desktop', DONE, '#prefs', 'classic');
  await classic.locator('#prefs input[name="scope"]').first().waitFor({ state: 'attached', timeout: 30000 });
  const old = (await classic.locator('#prefs h2, #prefs h3').allTextContents()).map(flat);
  assert.deepEqual(old.slice(0, 4), ['מה חשוב לי', 'העדפות', 'תכנון', 'מה חשוב לך?'], `classic: ${old}`);
});

test('"המצב שלי": the grade scale is two short sentences with "עוד" for the rest, outside the input\'s label, and keeps its state and focus over a redraw', async (t) => {
  const page = await visit(t, 'desktop', DONE, '#me');
  const hint = page.locator('#amirnetHint');
  await hint.waitFor({ timeout: 30000 });
  assert.equal(flat(await hint.innerText()), '50–150. ריק אם לא ידוע. עוד');
  const input = page.getByRole('spinbutton', { name: /ציון אנגלית/ });
  assert.ok(!/עוד/.test((await input.evaluate((e) => e.labels[0].textContent)) ?? ''), 'the button is not in the label');
  assert.equal(await input.getAttribute('aria-describedby'), 'amirnetHint');
  const more = hint.locator('.a-which');
  assert.equal(await more.evaluate((b) => !!b.closest('label')), false, 'no control inside the label');
  assert.equal(await more.getAttribute('aria-expanded'), 'false');
  await more.focus();
  await page.keyboard.press('Enter');
  assert.equal(await more.getAttribute('aria-expanded'), 'true');
  assert.equal(flat(await hint.innerText()), '50–150. ריק אם לא ידוע. עוד יש לכם כמה ציונים? בדקו מול המזכירות איזה מהם נחשב.');
  await page.evaluate(async () => (await import('./app.js')).refresh()); // the record is drawn again through keepFocus
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), 'amirnetMore', 'the focus is on the new button');
  assert.match(flat(await page.locator('#amirnetHint').innerText()), /בדקו מול המזכירות/, 'still open');
  await page.keyboard.press('Space');
  assert.equal(flat(await page.locator('#amirnetHint').innerText()), '50–150. ריק אם לא ידוע. עוד', 'closed by the keyboard');
  await page.evaluate(async () => (await import('./app.js')).refresh());
  assert.equal(flat(await page.locator('#amirnetHint').innerText()), '50–150. ריק אם לא ידוע. עוד', 'and a closed one stays closed');
  const classic = await visit(t, 'desktop', DONE, '#me', 'classic');
  const old = classic.locator('#me label.field', { hasText: 'ציון אנגלית' }).locator('.hint');
  await old.waitFor({ timeout: 30000 });
  assert.equal(flat(await old.innerText()), 'סולם 50–150. ריק אם לא ידוע. יש לכם כמה ציונים? בדקו מול המזכירות איזה מהם נחשב.');
});

// improve mode: the seeded schedule of edit-a.spec.mjs
const L = (course, name, type, group, day, start, end) => ({ course, name, type, group, day, start, end });
const IBASE = [
  L('30003', 'מבוא לכימיה', 'סופי-הרצאה+תרגול', '273000302', 4, '14:00', '15:50'), L('30003', 'מבוא לכימיה', 'תרגול', '273000302/1', 4, '16:00', '16:50'),
  L('30112', 'תרמודינמיקה 1', 'סופי-הרצאה+תרגול', '273011204', 3, '15:00', '16:50'), L('30112', 'תרמודינמיקה 1', 'תרגול', '273011204/1', 3, '17:00', '17:50')
];
const IMPROVE = {
  ...DONE,
  'afeka-sched-v1-edit': JSON.stringify({ v: 1, dataset: { year: 2027, sem: 'א', program: 30, startYear: 2026 }, registered: false, owned: [], original: IBASE, baseline: IBASE, movable: ['30003'], goal: { dayOff: 4 } })
};

test('improve mode, wide: the goal chips wrap in the column, none is clipped and none breaks its own label', async (t) => {
  for (const width of [1280, 1080]) {
    const page = await visit(t, { width, height: 800 }, IMPROVE, '#edit/changes');
    await page.locator('#edit .edit-tool .goals').waitFor({ timeout: 30000 });
    const m = await page.evaluate(() => {
      const tool = document.querySelector('#edit .edit-tool').getBoundingClientRect();
      return [...document.querySelectorAll('#edit .edit-tool .goals > .chip')].map((c) => {
        const r = c.getBoundingClientRect(), label = c.querySelector('select, span:not(.sr)') ?? c;
        return { name: c.textContent.trim().slice(0, 14), inside: r.left >= tool.left - 0.5 && r.right <= tool.right + 0.5, h: Math.round(r.height), label: Math.round(label.getBoundingClientRect().height) };
      });
    });
    assert.ok(m.length >= 3, 'the chips are there');
    const low = Math.min(...m.map((c) => c.h));
    for (const c of m) assert.ok(c.inside && c.h <= low + 4 && c.label <= low, `${width}: a chip is cut or its label wraps: ${JSON.stringify(c)} (the lowest chip is ${low})`);
    assert.ok(m.some((c) => /קורס/.test(c.name)), `${width}: the "+ קורס" chip is reachable`);
  }
});

test('improve mode: the reset of the proposals says "לבטל את כל השינויים", classic keeps its words', async (t) => {
  const page = await visit(t, 'desktop', IMPROVE, '#edit/changes');
  const reset = page.locator('[data-ed="restoreOriginal"]');
  await reset.waitFor({ timeout: 30000 });
  assert.equal(flat(await reset.innerText()), 'לבטל את כל השינויים');
  const classic = await visit(t, 'desktop', IMPROVE, '#edit', 'classic');
  await classic.locator('[data-ed="next"]').click();
  const old = classic.locator('[data-ed="restoreOriginal"]');
  await old.waitFor({ timeout: 30000 });
  assert.equal(flat(await old.innerText()), 'חזרה למערכת המקורית');
});
