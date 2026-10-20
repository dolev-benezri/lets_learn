import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mini } from './fixtures/mini-data.mjs';

const appMod = await import('../web/app.js'); // before the DOM stub: app.js starts init() when it sees a document
const el = () => ({ dataset: {}, matches: () => false, classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, addEventListener() {}, hidden: false, querySelector: () => null, querySelectorAll: () => [] });
globalThis.document = { getElementById: () => el(), querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, activeElement: null, body: { dataset: { view: 'plan' } } };
const made = [];
globalThis.Worker = class { constructor() { made.push(this); } postMessage(m) { this.sent = m; } terminate() {} };
Object.assign(globalThis, { matchMedia: () => ({ matches: false, addEventListener() {} }), CSS: { escape: (s) => s }, innerHeight: 800, scrollBy() {}, scrollTo() {}, addEventListener() {} });
globalThis.localStorage = { getItem: (k) => (k === 'afeka-sched-v1-terms' ? '1' : null), setItem() {}, removeItem() {} };
const { app, normalize, refresh } = appMod;
const { ui } = await import('../web/ui-common.js');
const { scheduleRun } = await import('../web/ui-search.js');
const { CHG } = await import('../web/ui-actions.js');
const started = () => new Promise((r) => setTimeout(r, 350)); // the 300 ms debounce is over: run() made its worker

test('ui-search: an answer or an error from a superseded worker is ignored', async () => {
  app.sem = { 'א': mini(), 'ב': null, 'קיץ': null };
  app.state = normalize({ v: 1 });
  Object.assign(app.state.profile, { year: 1 });
  app.state.scope = 'א';
  refresh();
  scheduleRun();
  await started();
  assert.equal(made.length, 1);
  scheduleRun(); // the user changed a setting: the next search waits 300 ms, the first worker is still alive
  made[0].onmessage({ data: { results: [{ score: 1, courses: ['A'], groups: ['A1', 'A1/1'], explanation: '' }], partial: false, diagnosis: [] } });
  assert.equal(ui.last, null, 'the old answer must not replace the results');
  assert.equal(ui.running, true, 'the busy indicator stays on until the newest search answers');
  await started();
  assert.equal(made.length, 2);
  scheduleRun();
  made[1].onerror({ message: 'old' });
  assert.equal(ui.runError, null, 'the old error must not be shown');
  assert.equal(ui.running, true);
  clearTimeout(ui.timer);
});

test('CHG.myName stores the trimmed name and does not ask for a new search', () => {
  app.state = normalize({ v: 1 });
  assert.equal(CHG.myName({ value: '  Dana ' }), 'save');
  assert.equal(app.state.name, 'Dana');
});

test('CHG.sortBy: the next search posts the chosen criterion as the leading weight (showWeights)', async () => {
  const { PRIMARY } = await import('../web/solver-core.js');
  app.state = normalize({ v: 1 });
  Object.assign(app.state.profile, { year: 1 });
  app.state.scope = 'א';
  assert.equal(CHG.sortBy({ value: 'credits' }), undefined, 'the default path: refresh, then a new search');
  refresh();
  scheduleRun();
  await started();
  assert.equal(made.at(-1).sent.weights.credits, (app.state.weights.credits ?? 0) + PRIMARY);
});

test('summer is a third tab of the year (issue 10): קיץ plans the summer, א׳/ב׳ go back to the year plan', async () => {
  const { semTabs, scopeOf } = await import('../web/ui-common.js');
  app.sem = { 'א': mini(), 'ב': mini(), 'קיץ': mini() };
  app.state = normalize({ v: 1, programSet: true, profile: { year: 2, summer: true } });
  assert.deepEqual(semTabs().map(([v]) => v), ['א', 'ב', 'קיץ']);
  assert.equal(CHG.sem({ value: 'קיץ' }), undefined, 'a new search: the summer is planned on top of the shown year');
  assert.equal(app.state.scope, 'קיץ');
  assert.equal(scopeOf(app.state.scope), 'year', 'the "לתכנן" choice still reads "שנה"');
  assert.equal(CHG.sem({ value: 'ב' }), undefined, 'back to the year plan: a new search');
  assert.deepEqual([app.state.scope, ui.sem], ['year', 'ב']);
  assert.equal(CHG.sem({ value: 'א' }), 'view', 'between א׳ and ב׳ only the view changes');
  app.state.profile.summer = false;
  assert.deepEqual(semTabs().map(([v]) => v), ['א', 'ב']);
});

test('CHG.split: ticking asks first and a cancel unticks the box; unticking asks nothing; the search carries constraints.split', async () => {
  app.state = normalize({ v: 1 });
  Object.assign(app.state.profile, { year: 1 });
  app.state.scope = 'א';
  const asked = [];
  globalThis.confirm = (t) => { asked.push(t); return false; };
  const box = { checked: true };
  assert.equal(await CHG.split(box), 'none', 'cancelled: nothing to redraw');
  assert.deepEqual([box.checked, app.state.constraints.split, asked.length], [false, false, 1]);
  assert.match(asked[0], /הפרדה בין הרצאה לתרגול עלולה ליצור פער/);
  assert.match(asked[0], /רק באישור ההכוון האקדמי\.$/);
  globalThis.confirm = () => true;
  box.checked = true;
  assert.notEqual(await CHG.split(box), 'none');
  assert.deepEqual([box.checked, app.state.constraints.split], [true, true]);
  refresh();
  scheduleRun();
  await started();
  assert.equal(made.at(-1).sent.constraints.split, true);
  globalThis.confirm = () => { throw new Error('unticking must not ask'); };
  box.checked = false;
  await CHG.split(box);
  assert.equal(app.state.constraints.split, false);
  delete globalThis.confirm;
  clearTimeout(ui.timer);
});

test('split goes off (untick, reset prefs): the unlinked tutorial pin is dropped, the lecture pin stays; split off pins are unchanged', async () => {
  const { ACT } = await import('../web/ui-actions.js');
  const mk = (id, type, day, linked = []) => ({ id, type, meetings: [{ day, start: '08:00', end: '10:00' }], linked, primary: !id.includes('/'), full: false, exams: [], lecturer: '' });
  const d = mini();
  d.courses.S = { name: 'S', credits: 3, offered: true, prereqs: [], groups: [mk('S1', 'L', 1, ['S1/1']), mk('S1/1', 'T', 2), mk('S9/1', 'T', 3)] };
  app.sem = { 'א': d, 'ב': null, 'קיץ': null };
  const fresh = (split, pins) => { app.state = normalize({ v: 1 }); app.state.constraints.split = split; app.state.pins = pins; };
  fresh(true, ['S1', 'S9/1', 'zz']);
  globalThis.confirm = () => true;
  await CHG.split({ checked: false });
  assert.deepEqual(app.state.pins, ['S1', 'zz'], 'untick');
  fresh(true, ['S1', 'S9/1']);
  await ACT.resetPrefs();
  assert.deepEqual([app.state.pins, app.state.constraints.split], [['S1'], false], 'reset prefs');
  fresh(false, ['S1', 'S1/1']);
  await CHG.split({ checked: false });
  assert.deepEqual(app.state.pins, ['S1', 'S1/1'], 'a linked pair is not touched');
  delete globalThis.confirm;
  clearTimeout(ui.timer);
});
