// A visitor who saved a state with the classic design opens the same address in design A: the same record, the same plan, the same friends, nothing
// rewritten in storage, and ?design=classic brings the old layout back with the same state. Every key the site keeps is seeded (docs plan 2.3).
// No top-level await in a spec: node:test then hangs after the run.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SITE, STUDENT, DONE, launch, visit as visitIn } from './helpers.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const twoGroups = async () =>
  Object.values(JSON.parse(await readFile(new URL('../fixtures/real/2027-1/30-2026.json', import.meta.url), 'utf8')).courses)
    .flatMap((c) => c.groups.map((g) => g.id))
    .slice(0, 2);
const EDIT = {
  v: 1, dataset: { year: 2027, sem: 'א', program: 30, startYear: 2026 }, registered: false, owned: [], movable: ['30003'], goal: { dayOff: 4 },
  original: [
    { course: '30003', name: 'מבוא לכימיה', type: 'סופי-הרצאה+תרגול', group: '273000302', day: 4, start: '14:00', end: '15:50' },
    { course: '30112', name: 'תרמודינמיקה 1', type: 'סופי-הרצאה+תרגול', group: '273011204', day: 3, start: '15:00', end: '16:50' }
  ]
};
EDIT.baseline = EDIT.original;

// the state of an old visit: friends, a pinned group, choices, a name, and every other key the site writes
async function oldVisit() {
  const [G1, G2] = await twoGroups();
  const state = { ...STUDENT, name: 'דנה', friends: [{ name: 'נועה', groups: [G1], weight: 1, active: true }], pins: [G2], choices: { '30003': 'must', '30112': 'optional' } };
  return {
    ...DONE,
    'afeka-sched-v1': JSON.stringify(state),
    'afeka-sched-v1:30-2025': JSON.stringify({ ...STUDENT, startYear: 2025, passed: ['10016'] }), // another cohort's stash
    'afeka-sched-v1-edit': JSON.stringify(EDIT),
    'afeka-sched-v1-tour': 'intro,plans',
    'afeka-sched-v1-mode': 'build',
    'afeka-sched-v1-theme': 'light'
  };
}
const ready = async (page, hash) => {
  if (hash.startsWith('#edit')) await page.locator('#edit .me-foot').waitFor({ timeout: 30000 });
  else {
    await page.locator('#week .blk').first().waitFor({ state: 'attached', timeout: 30000 });
    await page.waitForFunction(() => document.getElementById('board')?.getAttribute('aria-busy') !== 'true', null, { timeout: 30000 });
  }
  await page.waitForTimeout(300);
};
// what the visit shows and keeps: storage (without the design key), the friends, the record, the shown plan
const snapshot = (page) =>
  page.evaluate(async () => {
    const { app } = await import('./app.js'), { current } = await import('./ui-common.js'), { registrationText } = await import('./ui-drawer.js');
    const stored = Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith('afeka-sched-v1') && k !== 'afeka-sched-v1-design').sort());
    const c = current();
    // the edit routes run no build search: there the shown lessons of the edit page stand for the plan
    const lessons = [...document.querySelectorAll('#editWeek .blk')].map((b) => b.textContent.replace(/\s+/g, ' ').trim());
    return { stored, friends: app.state.friends, passed: app.state.passed, pins: app.state.pins, plan: c ? registrationText(c) : null, first: c ? JSON.stringify(c.groups ?? c) : null, hash: location.hash, lessons };
  });

for (const hash of ['', '#me', '#courses', '#prefs', '#edit', '#edit/changes'])
  test(`${hash || 'the board'}: design A shows the same record, plan and friends as classic and rewrites nothing`, async (t) => {
    const seed = await oldVisit();
    const shot = {};
    for (const design of ['classic', 'a']) {
      const page = await visitIn(browser, t, 'desktop', seed, hash, 'light', false, false, { design });
      await ready(page, hash);
      shot[design] = await snapshot(page);
    }
    assert.deepEqual(shot.a.stored, shot.classic.stored, 'storage is the same after a visit in either design');
    assert.deepEqual(shot.a.friends, shot.classic.friends);
    assert.deepEqual(shot.a.passed, shot.classic.passed);
    assert.deepEqual(shot.a.pins, shot.classic.pins);
    assert.equal(shot.a.plan, shot.classic.plan, 'the same plan');
    assert.equal(shot.a.first, shot.classic.first, 'the same first alternative');
    assert.equal(shot.a.hash, hash, 'the address is kept, not rewritten');
    assert.equal(shot.classic.hash, hash);
    // the changes screen draws the week in both designs; the first screen of A also shows it as a preview on the board (classic has no week there)
    if (hash === '#edit/changes') {
      assert.deepEqual(shot.a.lessons, shot.classic.lessons, 'the same lessons on the edit page');
      assert.ok(shot.a.lessons.length > 0, 'the edit page shows the saved schedule, it did not fall back to the first screen');
    }
    if (hash === '#edit') assert.ok(shot.a.lessons.length > 0 && shot.classic.lessons.length === 0, 'A previews the saved schedule on its board');
    const before = await oldVisit();
    assert.equal(shot.a.stored['afeka-sched-v1-edit'], before['afeka-sched-v1-edit'], 'the edit state is untouched');
    assert.equal(shot.a.stored['afeka-sched-v1:30-2025'], before['afeka-sched-v1:30-2025'], "another cohort's stash is untouched");
    assert.equal(shot.a.friends.length, 1);
    if (!hash.startsWith('#edit')) assert.ok(shot.a.plan?.length > 20, 'there is a plan to compare');
  });

test('the stash of a cohort still restores after a cohort switch, in design A', async (t) => {
  const page = await visitIn(browser, t, 'desktop', await oldVisit(), '', 'light', false, false, { design: 'a' });
  await ready(page, '');
  const r = await page.evaluate(async () => {
    const { switchTo, app } = await import('./app.js');
    const was = JSON.stringify(app.state.passed), pinsWas = JSON.stringify(app.state.pins);
    await switchTo(30, 2027);
    const away = app.state.startYear, pinsAway = JSON.stringify(app.state.pins);
    const stashed = JSON.parse(localStorage.getItem('afeka-sched-v1:30-2026'));
    await switchTo(30, 2026);
    return { was, away, stashed: JSON.stringify(stashed?.passed), back: JSON.stringify(app.state.passed), friends: app.state.friends.length, year: app.state.startYear, pinsWas, pinsAway, pinsBack: JSON.stringify(app.state.pins) };
  });
  assert.equal(r.away, 2027);
  assert.equal(r.stashed, r.was, 'the cohort left behind was kept under its own key');
  assert.equal(r.back, r.was, 'and comes back with its progress');
  assert.equal(r.friends, 1);
  assert.equal(r.year, 2026);
  assert.notEqual(r.pinsAway, r.pinsWas, 'the other cohort starts without these pins, so the test can tell a restore from a carry-over');
  assert.equal(r.pinsBack, r.pinsWas, 'the pins only the stash held came back');
});

test('?design=classic brings the old layout back with the same state', async (t) => {
  const seed = await oldVisit();
  const page = await visitIn(browser, t, 'desktop', seed, '', 'light', false, false, { design: 'a' });
  await ready(page, '');
  const inA = await snapshot(page);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.design), 'a');
  await page.goto(SITE + '?design=classic');
  await page.locator('nav.steps').waitFor({ state: 'visible', timeout: 30000 });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.design ?? null), null, 'the old layout');
  assert.equal(await page.locator('.a-shell').count(), 0);
  await ready(page, '');
  const back = await snapshot(page);
  assert.deepEqual(back.stored, inA.stored, 'the same state');
  assert.equal(back.plan, inA.plan, 'the same plan');
  await page.goto(SITE + '?design=a');
  await page.locator('.a-shell').waitFor({ timeout: 30000 });
  await ready(page, '');
  assert.deepEqual((await snapshot(page)).stored, inA.stored, 'and forth again');
});
