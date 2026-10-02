import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app, normalize, switchTo, ensurePassed, reconcileSpecs, inCatalog, clearSaved, DEFAULT } from '../web/app.js';

const CATALOG = { programs: [{ id: 30, name: 'מכונות', startYears: [2025, 2026, 2027] }, { id: 20, name: 'חשמל', startYears: [2026, 2027] }] };
const area = (id) => ({ id, name: id });
const EE = { specializations: ['comm', 'power'].map(area), specRule: { pick: 2, alone: ['power'] } };
const dataset = (program, startYear, extra = {}) => ({
  year: 2027, startYear, program, semester: 'א', fetchedAt: 'x', examsPublished: false, degree: null, courses: { a: { name: 'a', credits: 3, offered: true, prereqs: [], groups: [] } },
  lists: [{ code: 1, name: "קורסי חובה שנה א'", minCredits: 3, courses: ['a'] }], specializations: [], ...extra,
});
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
Object.defineProperty(globalThis.localStorage, 'keys', { value: () => [...store.keys()] });
// clearSaved lists keys with Object.keys(localStorage): mirror the stored keys as own properties of the stub
const sync = () => { for (const k of Object.keys(globalThis.localStorage)) if (!['getItem', 'setItem', 'removeItem'].includes(k)) delete globalThis.localStorage[k]; for (const k of store.keys()) globalThis.localStorage[k] = '1'; };
const serve = (fail = () => false, delay = () => 0) => {
  globalThis.fetch = async (url) => {
    const m = String(url).match(/(\d{4})-(\d)\/(\d+)-(\d{4})\.json/);
    await new Promise((r) => setTimeout(r, delay(m)));
    if (!m || fail(m)) return { ok: false, status: 404 };
    return { ok: true, json: async () => dataset(Number(m[3]), Number(m[4]), m[3] === '20' ? EE : {}) };
  };
};
const reset = (state) => { store.clear(); app.catalog = CATALOG; app.state = state; app.sem = { 'א': dataset(30, 2026), 'ב': null, 'קיץ': null }; app.data = app.sem['א']; };
const mine = () => ({ ...structuredClone(DEFAULT), name: 'דנה', friends: [{ name: 'רן', groups: ['g1'], weight: 1, active: true }], passed: ['a', 'b'], failed: { b: 1 }, grades: { a: 90 }, choices: { a: 'must' },
  pins: ['g'], yearIds: ['a'], semesterOf: { a: 'ב' }, specDraft: ['solid'], scope: 'ב', profile: { year: 3, amirnet: 120, specs: ['solid', 'flow'], summer: true } });

test('normalize: program and cohort are taken only when the catalog lists them', () => {
  assert.ok(inCatalog(CATALOG, 20, 2027) && !inCatalog(CATALOG, 20, 2025) && !inCatalog(CATALOG, 99, 2026) && !inCatalog(null, 30, 2026));
  const s = normalize({ v: 1, program: 20, startYear: 2027 }, CATALOG);
  assert.deepEqual([s.program, s.startYear], [20, 2027]);
  for (const bad of [{ program: 20, startYear: 2025 }, { program: '20', startYear: 2027 }, { program: 99, startYear: 2026 }, { program: 20 }]) {
    const t = normalize({ v: 1, ...bad }, CATALOG);
    assert.deepEqual([t.program, t.startYear], [DEFAULT.program, DEFAULT.startYear], JSON.stringify(bad));
  }
  assert.equal(normalize({ v: 1, program: 20, startYear: 2027 }).program, 30, 'without a catalog only the built-in program counts');
});

test('switchTo: personal state stays, program state resets, the cohort sets the study year', async () => {
  serve(); reset(mine());
  assert.equal(await switchTo(20, 2027), true);
  const s = app.state;
  assert.deepEqual([s.program, s.startYear, s.name, s.friends.length, s.profile.amirnet, s.profile.summer, s.scope], [20, 2027, 'דנה', 1, 120, true, 'year']);
  assert.deepEqual([s.failed, s.grades, s.choices, s.pins, s.yearIds, s.semesterOf, s.specDraft, s.profile.specs], [{}, {}, {}, [], [], {}, null, []]);
  assert.equal(s.profile.year, 1, 'cohort 2027 is year 1 in 2027');
  assert.deepEqual(s.passed, [], 'a first-year student has passed nothing: no year-1 list pre-marked');
  assert.equal(app.data.program, 20);
});

test('switchTo: a later cohort pre-marks year 1 as before; an unanswered year question stays open', async () => {
  serve(); reset({ ...mine(), profile: { year: null, amirnet: null, specs: [], summer: false } });
  await switchTo(30, 2025);
  assert.equal(app.state.profile.year, null);
  assert.deepEqual(app.state.passed, ['a'], 'derived year 3: the year-1 list is assumed passed');
});

test('switchTo: a failed or refused switch changes nothing', async () => {
  serve((m) => m[3] === '20'); reset(mine());
  const before = JSON.stringify(app.state), data = app.data;
  assert.equal(await switchTo(20, 2027), false);
  assert.equal(await switchTo(99, 2027), false, 'not in the catalog');
  assert.equal(await switchTo(30, 2026), false, 'already there');
  assert.equal(JSON.stringify(app.state), before);
  assert.equal(app.data, data);
});

test('switchTo: only a missing semester ב is tolerated; a missing א fails', async () => {
  serve((m) => m[2] === '2'); reset(mine());
  assert.equal(await switchTo(20, 2026), true);
  assert.equal(app.sem['ב'], null);
  serve((m) => m[2] === '1'); reset(mine());
  assert.equal(await switchTo(20, 2026), false);
});

test('switchTo: going back finds the old progress with the current personal settings; reset wipes the stashes', async () => {
  serve(); reset(mine());
  await switchTo(20, 2026);
  app.state.name = 'שם חדש';
  await switchTo(30, 2026);
  assert.deepEqual([app.state.passed, app.state.failed, app.state.profile.specs, app.state.profile.year], [['a', 'b'], { b: 1 }, ['solid', 'flow'], 3]);
  assert.equal(app.state.name, 'שם חדש');
  assert.ok(store.size > 0);
  sync();
  clearSaved();
  assert.equal(store.size, 0);
});

test('switchTo: a newer choice cancels an older one still loading', async () => {
  serve(() => false, (m) => (m && m[3] === '20' && m[4] === '2026' ? 30 : 0)); reset(mine());
  const slow = switchTo(20, 2026), fast = switchTo(20, 2027);
  assert.deepEqual([await slow, await fast], [false, true]);
  assert.deepEqual([app.state.program, app.state.startYear], [20, 2027]);
});

test('reconcileSpecs: a choice or draft from another program is dropped, a valid one kept', () => {
  reset({ ...mine(), specDraft: null, profile: { year: 3, amirnet: null, specs: ['solid', 'flow'], summer: false } });
  app.data = dataset(20, 2026, EE);
  reconcileSpecs();
  assert.deepEqual(app.state.profile.specs, []);
  app.state.profile.specs = ['power'];
  app.state.specDraft = ['comm'];
  reconcileSpecs();
  assert.deepEqual([app.state.profile.specs, app.state.specDraft], [['power'], ['comm']]);
  app.state.specDraft = ['solid'];
  reconcileSpecs();
  assert.equal(app.state.specDraft, null);
});

test('ensurePassed: nothing for year 1, the year-1 list from year 2, and a saved list is kept', () => {
  reset({ ...mine(), passed: null, profile: { year: null, amirnet: null, specs: [], summer: false } });
  app.data = dataset(30, 2027);
  ensurePassed();
  assert.deepEqual(app.state.passed, []);
  app.state.passed = null; app.data = dataset(30, 2026);
  ensurePassed();
  assert.deepEqual(app.state.passed, ['a']);
  app.state.passed = ['z'];
  ensurePassed();
  assert.deepEqual(app.state.passed, ['z']);
});
