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

// ---- step 2: one legal line in the strip; the phone's warnings in one line above the week ----
const flat = (s) => s.replace(/\s+/g, ' ').trim();
const LEGAL_WIDE = 'לא רשמי · אינו הרשמה ואינו המלצה (ההרשמה באפקה-נט) · הכללים לא אושרו במחלקה · פרטים';
const LEGAL_PHONE = 'לא רשמי · אינו הרשמה ואינו המלצה (ההרשמה באפקה-נט) · פרטים';
const DISCLAIMER = 'אינו הרשמה ואינו המלצה. לפני ההרשמה מומלץ להתייעץ עם יועץ לימודים.';

for (const [name, size] of [['1280', 'desktop'], ['a phone on its side', { width: 667, height: 375 }]]) {
  test(`${name}: the strip has one legal line with the rules clause, and the board does not say it again`, async (t) => {
    const page = await visit(t, size, DONE);
    await weekReady(page);
    assert.equal(flat(await page.locator('.a-unofficial').innerText()), LEGAL_WIDE);
    assert.equal(await page.locator('#boardNote .a-warn-p').isVisible(), false, 'the phone line is not shown from 600px');
    assert.equal(await page.locator('#disclaimer').innerText(), '', 'the full sentence left the board');
    assert.ok(await page.locator('#meta').isVisible(), 'the freshness line is in the strip');
  });
}

for (const [name, size] of [['320', { width: 320, height: 640 }], ['375', 'phone']]) {
  test(`${name}: the strip keeps the legal line, the warnings are one line right above the week`, async (t) => {
    const page = await visit(t, size, DONE);
    await weekReady(page);
    assert.equal(flat(await page.locator('.a-unofficial').innerText()), LEGAL_PHONE);
    assert.equal(await page.locator('#meta').isVisible(), false, 'no freshness line in a phone strip');
    const line = page.locator('#boardNote .a-warn-p');
    assert.ok(await line.isVisible());
    const text = flat(await line.innerText());
    assert.match(text, /^הנתונים נבדקו לפני \d+ ימים, ייתכן שהשתנו · הכללים לא אושרו במחלקה$/, 'the old frozen status, then the rules');
    assert.ok(!/בדקו מול היועץ/.test(text), 'the long sentence is in "פרטים"');
    assert.equal(await page.locator('#boardNote .a-warn-p').count(), 1, 'one line, not two');
  });
}

test('the "פרטים" link of the strip opens ☰ "מידע" with the full sentence, and Escape returns to it', async (t) => {
  const page = await visit(t, 'phone', DONE);
  await weekReady(page);
  const link = page.locator('.a-uno-more');
  const box = await link.boundingBox();
  assert.ok(box.height >= 43.5 && box.width >= 43.5, `a 44px target (${box.width}x${box.height})`);
  await link.click();
  const drawer = page.locator('#drawer[open]');
  await drawer.waitFor();
  assert.ok(flat(await drawer.innerText()).includes(DISCLAIMER), 'the full sentence is in "מידע"');
  assert.ok(flat(await drawer.innerText()).includes('בדקו מול היועץ לפני ההרשמה'), 'and the advisor line for unapproved rules');
  await page.keyboard.press('Escape');
  await page.locator('#drawer[open]').waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.activeElement?.dataset.k === 'aUnoMore', null, { timeout: 5000 }); // the close handler returns the focus to the opener
});

test('a phone: the line follows the data state without a reload (fresh data leaves only the rules clause), and the full sentence opens in "פרטים"', async (t) => {
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
  assert.equal(flat(await line.innerText()), 'הכללים לא אושרו במחלקה', 'fresh: only the rules clause');
  await set({ checkedAt: now, ok: false });
  assert.match(flat(await line.innerText()), /^הבדיקה האחרונה של הנתונים נכשלה\. הם השתנו לאחרונה ב-\d+\.\d+ · הכללים לא אושרו במחלקה$/);
  await set(null);
  assert.match(flat(await line.innerText()), /^לא ידוע מתי הנתונים נבדקו/);
  await page.locator('#pills .a-details > summary').click();
  const body = page.locator('#pills .a-det-body');
  assert.ok(await body.isVisible(), 'the opened details are visible on a phone');
  assert.ok(flat(await body.innerText()).includes(DISCLAIMER));
  assert.ok(flat(await body.innerText()).includes('בדקו מול היועץ לפני ההרשמה'));
});

test('a phone behind the first-visit gate: the strip still says the rules clause (the board that would say it is covered)', async (t) => {
  const page = await visit(t, 'phone', { 'afeka-sched-v1-terms': '2' });
  await page.locator('.gate').first().waitFor({ timeout: 30000 });
  assert.equal(await page.locator('#aRules').evaluate((e) => getComputedStyle(e).display !== 'none'), true);
});

test('the improve page has no board note: a phone strip there keeps the rules clause and the freshness line', async (t) => {
  const page = await visit(t, 'phone', DONE, '#edit');
  await page.locator('#edit .edit-stage').waitFor({ timeout: 30000 });
  assert.match(flat(await page.locator('.a-unofficial').innerText()), /הכללים לא אושרו במחלקה/);
  assert.ok(await page.locator('#meta').isVisible());
});

test('the full sentence is in "פרטים" and in the take-out tool', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await weekReady(page);
  const body = flat(await page.locator('#pills .a-det-body').textContent());
  assert.ok(body.includes(DISCLAIMER), '"פרטים"');
  assert.ok(body.includes('הכללים לא אושרו על ידי המחלקה. בדקו מול היועץ לפני ההרשמה.'));
  await page.evaluate(() => (location.hash = '#out'));
  await page.locator('#out [data-act="copyReg"]').waitFor();
  assert.ok(flat(await page.locator('#out').innerText()).includes(DISCLAIMER), 'the take-out tool, where a student goes to register');
});

// the freshness line has four states: the frozen status is old (it says so); a failed check and no check say their own words
test('the freshness line: old, failed and never checked each say why (a warning with the alert icon), fresh is plain', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await weekReady(page);
  const old = page.locator('#meta .warn-text');
  assert.match(flat(await old.innerText()), /^הנתונים נבדקו לפני \d+ ימים, ייתכן שהשתנו$/);
  assert.equal(await page.locator('#meta .warn-text svg').count(), 1, 'the alert icon, not colour alone');
  // the file counts as checked at the time of a later successful check that covers it (app.js boardStatus: freshAt), so the status names this file
  const keys = await page.evaluate(async () => {
    const { app } = await import('./app.js'); // a year plan reads the older of the two semester files
    return ['א', 'ב'].filter((s) => app.sem[s]).map((s) => `${app.sem[s].year}-${{ 'א': 1, 'ב': 2 }[s]}/${app.sem[s].program}-${app.sem[s].startYear}`);
  });
  const now = new Date().toISOString();
  const states = [
    [{ checkedAt: now, ok: true, semesters: Object.fromEntries(keys.map((k) => [k, { checkedAt: now }])) }, /^נבדק (עכשיו|לפני \d+ (דקות|דקה|שעות|שעה))$/, 0],
    [{ checkedAt: now, ok: false }, /^הבדיקה האחרונה של הנתונים נכשלה\. הם השתנו לאחרונה ב-\d+\.\d+$/, 1],
    [null, /^לא ידוע מתי הנתונים נבדקו\. הם השתנו לאחרונה ב-\d+\.\d+$/, 1] // no status file at all
  ];
  for (const [status, text, warn] of states) {
    await page.route('**/data/afeka/status.json', (r) => (status ? r.fulfill({ contentType: 'application/json', body: JSON.stringify(status) }) : r.fulfill({ status: 404, body: '' })));
    await page.reload();
    await weekReady(page);
    assert.match(flat(await page.locator('#meta').innerText()), text);
    assert.equal(await page.locator('#meta .warn-text').count(), warn);
    await page.unroute('**/data/afeka/status.json');
  }
});

// ---- step 3: what ב׳ counts on from א׳ is one short info line ----
test('the A-semester assumption is one short line with its count, no fill; "אילו?" opens "פרטים" at the full sentence', async (t) => {
  const page = await visit(t, 'desktop', DONE);
  await weekReady(page);
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
  test(`${name}: the "אילו?" button is a 44px target and the line does not scroll the page sideways`, async (t) => {
    const page = await visit(t, size, DONE);
    await weekReady(page);
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
  const page = await visit(t, 'desktop', DONE);
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
  const page = await visit(t, 'desktop', { ...DONE, 'afeka-sched-v1': JSON.stringify({ ...STUDENT, scope: 'א' }) });
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
