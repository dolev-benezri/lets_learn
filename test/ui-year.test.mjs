import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { app, normalize } from '../web/app.js'; // before the DOM stub, so app.js does not start init()

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
const element = () => ({
  dataset: {}, setAttribute() {}, addEventListener() {}, focus() {}, matches: () => false,
  classList: { add() {}, remove() {} }
});
const cards = [];
globalThis.document = {
  documentElement: { dataset: { design: 'a' } },
  activeElement: null,
  addEventListener() {},
  getElementById: element,
  querySelector: () => null,
  body: { append: (d) => cards.push(d) },
  createElement: () => {
    const events = {};
    return {
      ...element(),
      addEventListener: (name, fn) => { events[name] = fn; },
      querySelector: element,
      querySelectorAll: () => [],
      showModal() {}, close() {}, remove() {},
      confirm(ids) {
        this.querySelectorAll = () => ids.map((id) => ({ dataset: { id } }));
        events.click({ target: { closest: () => ({ dataset: { yr: 'ok' } }) } });
      }
    };
  }
};
globalThis.location = { hash: '#me' };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.addEventListener = () => {};
const { CHG } = await import('../web/ui-actions.js');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const data = (program, startYear) => {
  const ids = [`${program}-first`, `${program}-second`, `${program}-third`];
  const extra = program === 20 && startYear === 2026 ? ['20138'] : [];
  return {
    year: 2027, program, startYear, semester: 'א', specializations: [],
    courses: Object.fromEntries([...ids, ...extra].map((id) =>
      [id, { name: id, credits: 3, prereqs: [], offered: false, groups: [] }])),
    lists: ids.map((id, i) => ({ name: `קורסי חובה שנה ${'אבג'[i]}'`, courses: [id, ...(i === 1 ? extra : [])] }))
  };
};
function reset(program = 30) {
  app.state = normalize({ v: 1, program, startYear: 2026, programSet: true, passed: [], assumed: [], profile: { year: 2 } }, app.catalog);
  app.sem = { 'א': data(program, 2026), 'ב': null, 'קיץ': null };
  app.data = app.sem['א'];
}
beforeEach(() => {
  store.clear();
  store.set('afeka-sched-v1-terms', '2');
  store.set('afeka-sched-v1-firstrun', 'done');
  cards.length = 0;
  document.documentElement.dataset.design = 'a';
  app.catalog = { programs: [30, 20].map((id) => ({ id, name: String(id), startYears: [2025, 2026] })) };
  globalThis.fetch = async (url) => {
    const [, program, cohort] = String(url).match(/\/(\d+)-(\d{4})\.json$/);
    return { ok: true, json: async () => data(Number(program), Number(cohort)) };
  };
  reset();
});
function holdSwitch(fail = false) {
  const serve = globalThis.fetch;
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  globalThis.fetch = async (url) => {
    await held;
    return fail ? { ok: false } : serve(url);
  };
  CHG.program({ value: '20' });
  return release;
}

test('a year picked during a program switch asks about the loaded program, without assuming passes', async () => {
  const release = holdSwitch();
  const year = CHG.pyear({ value: '3' });
  assert.equal(cards.length, 0);
  assert.deepEqual(app.state.passed, []);
  release();
  await tick();
  assert.equal(app.state.program, 20);
  assert.deepEqual(app.state.passed, [], 'the program switch must not fill earlier years');
  assert.equal(cards.length, 1);
  assert.match(cards[0].innerHTML, /20-second/);
  assert.doesNotMatch(cards[0].innerHTML, /30-second/);
  cards[0].confirm(['20138']);
  await year;
  assert.equal(app.state.startYear, 2025);
  assert.equal(app.data.courses['20138'], undefined);
  assert.deepEqual(app.state.passed, ['20138'], 'confirmed picks survive a cohort that omits them');
  assert.equal(app.holdFill, 0);
});

test('a failed program switch or a year taken back while it loads marks nothing', async () => {
  const failed = holdSwitch(true);
  const year = CHG.pyear({ value: '3' });
  failed();
  await year;
  assert.equal(cards.length, 0);
  assert.deepEqual([app.state.program, app.state.profile.year, app.state.passed], [30, 2, []]);

  // The next switch succeeds, but the later-year request is superseded before it arrives.
  globalThis.fetch = async () => ({ ok: true, json: async () => data(20, 2026) });
  const release = holdSwitch();
  const later = CHG.pyear({ value: '3' });
  const back = CHG.pyear({ value: '2' });
  release();
  await Promise.all([later, back]);
  assert.equal(cards.length, 0);
  assert.deepEqual([app.state.program, app.state.profile.year, app.state.passed], [20, 2, []]);
  assert.equal(app.holdFill, 0);
});

test('confirmed picks survive a same-program cohort change and are dropped after a program change', async () => {
  reset(20);
  const year = CHG.pyear({ value: '3' });
  cards[0].confirm(['20138']);
  await year;
  assert.deepEqual(app.state.passed, ['20138']);

  reset(30);
  const stale = CHG.pyear({ value: '3' });
  CHG.program({ value: '20' });
  await tick();
  cards[1].confirm(['30-second']);
  await stale;
  assert.deepEqual(app.state.passed, []);
  assert.equal(app.state.profile.year, 2);
});

test('confirmed picks are dropped when a superseded cohort and the newer program both fail', async () => {
  const held = new Map();
  globalThis.fetch = (url) => new Promise((resolve) => {
    held.set(String(url), () => resolve({ ok: false }));
  });
  const fail = (program) => {
    const requests = [...held].filter(([url]) => url.includes(`/${program}-`));
    assert.ok(requests.length, `program ${program} is loading`);
    for (const [, release] of requests) release();
  };

  const year = CHG.pyear({ value: '3' });
  cards[0].confirm(['30-second']);
  await tick(); // the confirmed year is waiting for its cohort
  CHG.program({ value: '20' });
  fail(30);
  await year;
  fail(20);
  await tick();
  assert.deepEqual([app.state.program, app.state.profile.year, app.state.startYear, app.state.passed], [30, 2, 2026, []]);
  assert.deepEqual(JSON.parse(store.get('afeka-sched-v1')).passed, []);
  assert.equal(app.holdFill, 0);
});

test('design A does not fill earlier courses when no card lists exist; classic still fills them', async () => {
  app.sem['א'].lists = [];
  await CHG.pyear({ value: '3' });
  assert.equal(cards.length, 0);
  assert.deepEqual(app.state.passed, []);

  reset();
  document.documentElement.dataset.design = '';
  CHG.pyear({ value: '3' });
  await tick();
  assert.deepEqual(app.state.passed, ['30-first', '30-second']);
});

test('a program with no cohorts: the year lands at once and the confirmed picks are kept', async () => {
  app.catalog.programs[0].startYears = [];
  const year = CHG.pyear({ value: '3' });
  await tick();
  cards[0].confirm(['30-second']);
  await year;
  assert.deepEqual([app.state.profile.year, app.state.passed], [3, ['30-second']]);
  assert.equal(app.holdFill, 0);
});
