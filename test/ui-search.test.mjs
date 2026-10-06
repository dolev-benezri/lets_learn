import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mini } from './fixtures/mini-data.mjs';

const appMod = await import('../web/app.js'); // before the DOM stub: app.js starts init() when it sees a document
const el = () => ({ dataset: {}, classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, addEventListener() {}, hidden: false, querySelector: () => null, querySelectorAll: () => [] });
globalThis.document = { getElementById: () => el(), querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, activeElement: null, body: { dataset: { view: 'plan' } } };
const made = [];
globalThis.Worker = class { constructor() { made.push(this); } postMessage() {} terminate() {} };
Object.assign(globalThis, { matchMedia: () => ({ matches: false, addEventListener() {} }), CSS: { escape: (s) => s }, innerHeight: 800, scrollBy() {}, scrollTo() {}, addEventListener() {} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
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
