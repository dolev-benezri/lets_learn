// Draft of the F-02 regression test (proposed home: test/ui-search.test.mjs). Run: SEARCH=real|patched node --test f02-regression-draft.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mini } from '../../test/fixtures/mini-data.mjs';

const appMod = await import('../../web/app.js'); // before the DOM stub: app.js starts init() when it sees a document
const el = () => ({ dataset: {}, classList: { toggle() {} }, setAttribute() {}, hidden: false, querySelector: () => null, querySelectorAll: () => [] });
globalThis.document = { getElementById: () => el(), querySelector: () => null, querySelectorAll: () => [], activeElement: null, body: { dataset: { view: 'plan' } } };
const made = [];
globalThis.Worker = class { constructor() { made.push(this); this.terminated = false; } postMessage() {} terminate() { this.terminated = true; } };
Object.assign(globalThis, { matchMedia: () => ({ matches: false }), CSS: { escape: (s) => s }, innerHeight: 800, scrollBy() {}, scrollTo() {} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { app, normalize, refresh } = appMod;
const { ui } = await import('../../web/ui-common.js');
const { scheduleRun } = await import(process.env.SEARCH === 'patched' ? './up-ui-search.patched.generated.mjs' : '../../web/ui-search.js');

test('ui-search: a reply from a superseded search is ignored', async () => {
  app.sem = { 'א': mini(), 'ב': null, 'קיץ': null };
  app.state = normalize({ v: 1 });
  Object.assign(app.state.profile, { year: 1 });
  app.state.scope = 'א';
  refresh();
  scheduleRun();
  await new Promise((r) => setTimeout(r, 350));          // run() of search #1 has started its worker
  assert.equal(made.length, 1);
  scheduleRun();                                         // the user changed a setting: search #2 waits 300 ms, worker #1 is still alive
  const stale = { results: [{ score: 1, courses: ['A'], groups: ['A1', 'A1/1'], explanation: '' }], partial: false, diagnosis: [] };
  try { made[0].onmessage({ data: stale }); } catch { /* the stub DOM may stop renderView */ }
  assert.equal(ui.last, null, 'the old answer must not replace the results');
  assert.equal(ui.running, true, 'the busy indicator stays on until the newest search answers');
});
