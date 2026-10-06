import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app, normalize, switchTo, restoreBackup, ensurePassed, waitingOnEarlier, reconcileSpecs, inCatalog, clearSaved, DEFAULT } from '../web/app.js';

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
  for (const bad of [{ program: '20', startYear: 2027 }, { program: 99, startYear: 2026 }, { program: 20 }]) {
    const t = normalize({ v: 1, ...bad }, CATALOG);
    assert.deepEqual([t.program, t.startYear], [DEFAULT.program, DEFAULT.startYear], JSON.stringify(bad));
  }
  assert.equal(normalize({ v: 1, program: 20, startYear: 2027 }).program, 30, 'without a catalog only the built-in program counts');
  const moved = normalize({ v: 1, program: 20, startYear: 2025, passed: ['x'] }, CATALOG);
  assert.deepEqual([moved.program, moved.startYear, moved.passed], [20, 2026, ['x']], 'a cohort the catalog dropped: the nearest cohort of the same program');
  assert.equal(normalize({ v: 1, program: 30, startYear: 2030 }, CATALOG).startYear, 2027);
});

test('load: a saved program missing from the catalog is not overwritten', async () => {
  const { load, save, FALLBACK_CATALOG } = await import('../web/app.js');
  const saved = { ...mine(), program: 40, startYear: 2026, v: 1 };
  reset(null); store.set('afeka-sched-v1', JSON.stringify(saved)); app.catalog = FALLBACK_CATALOG; app.hashError = null;
  app.state = load();
  assert.deepEqual([app.state.program, app.state.name, app.state.passed], [30, 'דנה', null], 'shown: the built-in program with the personal part only');
  assert.match(app.hashError, /רשימת התוכניות לא נטענה/);
  save();
  assert.equal(JSON.parse(store.get('afeka-sched-v1')).program, 40, 'the catalog did not load: nothing is saved over the real state');
  reset(null); store.set('afeka-sched-v1', JSON.stringify(saved)); app.hashError = null;
  app.state = load();
  assert.equal(app.state.program, 30);
  assert.match(app.hashError, /כבר לא באתר/);
  assert.deepEqual(JSON.parse(store.get('afeka-sched-v1:40-2026')).passed, ['a', 'b'], 'a program the catalog dropped: its progress is kept aside');
  save();
  assert.equal(JSON.parse(store.get('afeka-sched-v1')).program, 30, 'with a real catalog saving works as usual');
  reset(null); store.set('afeka-sched-v1', JSON.stringify({ ...saved, program: 20, startYear: 2025 })); app.hashError = null;
  app.state = load();
  assert.deepEqual([app.state.program, app.state.startYear, app.state.passed], [20, 2026, ['a', 'b']]);
  assert.match(app.hashError, /מחזור 2026/);
  reset(null); store.set('afeka-sched-v1', JSON.stringify({ ...saved, program: 30, startYear: 2027 })); app.catalog = FALLBACK_CATALOG; app.hashError = null;
  app.state = load();
  assert.match(app.hashError, /רשימת התוכניות לא נטענה/, 'the cohort is missing only because the catalog did not load');
  save();
  assert.equal(JSON.parse(store.get('afeka-sched-v1')).startYear, 2027, 'the catalog did not load: the saved cohort is not overwritten');
  app.hashError = null;
});

test('switchTo: personal state stays, program state resets, the cohort sets the study year', async () => {
  serve(); reset({ ...mine(), profile: { ...mine().profile, year: 2 } }); // year 2 = cohort 2026, which program 20 has: the cohort switched to decides
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
  serve(); reset({ ...mine(), profile: { ...mine().profile, year: 2 } });
  await switchTo(20, 2026);
  app.state.name = 'שם חדש';
  await switchTo(30, 2026);
  assert.deepEqual([app.state.passed, app.state.failed, app.state.profile.specs], [['a', 'b'], { b: 1 }, ['solid', 'flow']]);
  assert.equal(app.state.profile.year, 2, 'the study year is the current one (cohort 2026 in 2027)');
  assert.equal(app.state.name, 'שם חדש');
  assert.ok(store.size > 0);
  store.set('afeka-sched-v1-onboarded', '1'); // erasing everything also starts a first visit again
  sync();
  clearSaved();
  assert.equal(store.size, 0);
});

test('switchTo: the study year picked (set before the switch, as CHG.pyear does) wins over the one in the stash', async () => {
  serve(); reset({ ...mine(), startYear: 2027, profile: { year: 1, amirnet: null, specs: [], summer: false } });
  app.state.program = 30;
  for (const [y, cohort] of [[2, 2026], [1, 2027], [2, 2026]]) {
    app.state.profile.year = y;
    await switchTo(30, cohort);
    assert.deepEqual([app.state.startYear, app.state.profile.year], [cohort, y], `picked year ${y}`);
  }
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

test('reconcileSpecs: a saved choice that lost an area keeps the areas still offered (industrial engineering pair, mechanical evening)', () => {
  const IE = { specializations: ['mis', 'dss', 'bi'].map(area), specRule: { pick: 1 } }, ME = { specializations: ['solid', 'flow', 'vehicle'].map(area), specRule: { pick: 2, alone: ['vehicle'] } };
  reset({ ...mine(), specDraft: null, profile: { year: 3, amirnet: null, specs: ['mis', 'sdss'], summer: false } });
  app.data = dataset(40, 2026, IE);
  reconcileSpecs();
  assert.deepEqual(app.state.profile.specs, ['mis'], 'the old main area is a whole choice now');
  app.state.profile.specs = []; app.state.specDraft = ['bi'];
  reconcileSpecs();
  assert.deepEqual([app.state.profile.specs, app.state.specDraft], [['bi'], null], 'a half-picked old pair is a whole choice too');
  for (const [saved, draft] of [[['solid', 'mech'], ['solid']], [['vehicle', 'aero'], ['vehicle']]]) {
    app.data = dataset(32, 2026, ME); app.state.profile.specs = saved; app.state.specDraft = null;
    reconcileSpecs();
    assert.deepEqual([app.state.profile.specs, app.state.specDraft], [[], draft], `${saved}: half a pair waits as a draft (never promoted to vehicle alone)`);
  }
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

test('ensurePassed: every earlier year\'s mandatory list is passed (year 3 = years א and ב)', () => {
  const lists = [["קורסי חובה שנה א'", 'a'], ["קורסי חובה שנה ב'", 'b'], ["קורסי חובה שנה ג'", 'c']].map(([name, id], i) => ({ code: i + 1, name, minCredits: 3, courses: [id] }));
  for (const [start, want] of [[2025, ['a', 'b']], [2026, ['a']], [2027, []]]) {
    reset({ ...mine(), passed: null, profile: { year: null, amirnet: null, specs: [], summer: false } });
    app.data = dataset(30, start, { lists });
    ensurePassed();
    assert.deepEqual(app.state.passed, want, `cohort ${start}`);
  }
});

test('waitingOnEarlier: only this year\'s courses blocked by an earlier year\'s course, not by one of this year', () => {
  const lists = [["קורסי חובה שנה א'", ['a']], ["קורסי חובה שנה ב'", ['b', 'c', 'd']]].map(([name, courses], i) => ({ code: i + 1, name, minCredits: 3, courses }));
  reset({ ...mine(), passed: [], profile: { year: null, amirnet: null, specs: [], summer: false } });
  app.data = dataset(30, 2026, { lists }); // year 2
  app.cls = { statuses: { b: { status: 'blocked', blockedBy: ['a'] }, c: { status: 'blocked', blockedBy: ['b'] }, d: { status: 'available' } } };
  assert.deepEqual(waitingOnEarlier(), ['b']);
  app.cls.statuses.b = { status: 'available' };
  assert.deepEqual(waitingOnEarlier(), [], 'a chain inside this year is normal, not a missed mark');
});

test('restoreBackup: another program loads its data before the state is replaced; a failed load changes nothing', async () => {
  serve(); reset(mine());
  assert.equal(await restoreBackup({ v: 1, program: 20, startYear: 2026, name: 'מגובה', passed: ['x1'] }), true);
  assert.deepEqual([app.state.program, app.state.name, app.state.passed, app.data.program], [20, 'מגובה', ['x1'], 20]);
  serve((m) => m[3] === '30'); reset(mine());
  const before = JSON.stringify(app.state), data = app.data;
  assert.equal(await restoreBackup({ v: 1, program: 30, startYear: 2027, name: 'מגובה' }), false);
  assert.equal(JSON.stringify(app.state), before);
  assert.equal(app.data, data);
  app.hashError = null;
  assert.equal(await restoreBackup({ v: 1, program: 99, startYear: 2027, name: 'זר' }), false, 'a program the site does not have: refused, not merged into the default one');
  assert.equal(JSON.stringify(app.state), before);
  assert.match(app.hashError, /התוכנית של הגיבוי/);
  app.hashError = null;
});

test('restoreBackup: a restored backup resets the UI state of the old one (L5)', async () => {
  const { setUiReset } = await import('../web/app.js');
  let resets = 0;
  setUiReset(() => { resets++; });
  serve(); reset(mine());
  assert.equal(await restoreBackup({ v: 1, program: 30, startYear: 2026, name: 'אותה תוכנית' }), true);
  assert.equal(await restoreBackup({ v: 1, program: 20, startYear: 2026, name: 'אחרת' }), true);
  assert.equal(resets, 2, 'every restore drops the old results, colors and specialization pick');
  await restoreBackup({ v: 1, program: 99, startYear: 2026 });
  assert.equal(resets, 2, 'a refused restore changes nothing');
  await switchTo(30, 2027);
  assert.equal(resets, 3, 'a program or cohort switch resets too (the same state replacement)');
  serve((m) => m[3] === '30'); await switchTo(30, 2025);
  assert.equal(resets, 3, 'a failed switch does not');
  setUiReset(() => {});
  app.hashError = null;
});

test('switchTo: default hours follow the track (evening: not before 16:00) until the student changes them', async () => {
  const catalog = { programs: [...CATALOG.programs, { id: 22, name: 'חשמל (ערב)', startYears: [2026, 2027] }] };
  serve(); reset(mine()); app.catalog = catalog;
  Object.assign(app.state.constraints, { notBefore: '', notAfter: '20:00' });
  await switchTo(22, 2026);
  assert.deepEqual([app.state.constraints.notBefore, app.state.constraints.notAfter], ['16:00', ''], 'day defaults become the evening defaults');
  await switchTo(30, 2026);
  assert.deepEqual([app.state.constraints.notBefore, app.state.constraints.notAfter], ['', '20:00'], 'and back');
  app.state.constraints.notAfter = '18:00';
  await switchTo(22, 2026);
  assert.deepEqual([app.state.constraints.notBefore, app.state.constraints.notAfter], ['', '18:00'], 'hours the student set are kept');
});

test('reconcileSpecs: a study year past the program\'s last year is brought back to it (L6)', () => {
  reset({ ...mine(), profile: { year: 4, amirnet: null, specs: [], summer: false } });
  app.data = dataset(61, 2026, { lists: [{ code: 1, name: "קורסי חובה שנה א'", minCredits: 3, courses: ['a'] }, { code: 2, name: "קורסי חובה שנה ב'", minCredits: 0, courses: [] }] });
  reconcileSpecs();
  assert.equal(app.state.profile.year, 2);
});

test('refresh: the summer tab is not kept once the profile plans no summer (U3)', async () => {
  const { refresh } = await import('../web/app.js');
  globalThis.document ??= { activeElement: null }; // keepFocus reads the focused element
  reset({ ...mine(), scope: 'קיץ', profile: { year: 2, amirnet: null, specs: [], summer: false } });
  refresh();
  assert.equal(app.state.scope, 'year');
  reset({ ...mine(), scope: 'קיץ', profile: { year: 2, amirnet: null, specs: [], summer: true } });
  refresh();
  assert.equal(app.state.scope, 'קיץ', 'summer planned but its file did not load: the choice waits, it is not lost');
});

test('load keeps a dropped cohort aside; a backup is refused while the catalog is missing, and says why', async () => {
  const { load, save, FALLBACK_CATALOG } = await import('../web/app.js');
  serve();
  reset(null); store.set('afeka-sched-v1', JSON.stringify({ ...mine(), v: 1, program: 20, startYear: 2025 })); app.hashError = null;
  app.state = load();
  assert.deepEqual(JSON.parse(store.get('afeka-sched-v1:20-2025')).passed, ['a', 'b'], 'the dropped cohort is kept aside, not only moved');
  reset(null); store.set('afeka-sched-v1', JSON.stringify({ ...mine(), v: 1, program: 40, startYear: 2026 })); app.catalog = FALLBACK_CATALOG; app.hashError = null;
  app.state = load();
  for (const b of [{ v: 1, program: 20, startYear: 2026 }, { v: 1, program: 30, startYear: 2026, name: 'מגובה' }]) {
    app.hashError = null;
    assert.equal(await restoreBackup(b), false, `${b.program}: no restore while the catalog is missing`);
    assert.match(app.hashError, /רשימת התוכניות לא נטענה/, 'not "the program is not on the site"');
  }
  save();
  assert.equal(JSON.parse(store.get('afeka-sched-v1')).program, 40, 'the real saved program is never overwritten');
  app.hashError = null;
});

test('applyHash: a friend link keeps the load notice; a good link clears a bad link’s error', async () => {
  const { applyHash } = await import('../web/app.js');
  const { friendLink } = await import('../web/share.js');
  const g = { location: globalThis.location, history: globalThis.history, document: globalThis.document };
  globalThis.history = { replaceState() {} };
  globalThis.document ??= { activeElement: null, body: { dataset: {} }, querySelector: () => null };
  try {
    reset({ ...mine(), program: 30, startYear: 2026 });
    const link = await friendLink('https://x.test/', { ...app.state, year: app.state.year, semester: app.state.semester }, ['g1']);
    app.hashError = 'התוכנית השמורה כבר לא באתר.';
    globalThis.location = { hash: link.slice(link.indexOf('#')), pathname: '/' };
    await applyHash();
    assert.equal(app.hashError, 'התוכנית השמורה כבר לא באתר.');
    globalThis.location = { hash: '#f=@@@', pathname: '/' };
    await applyHash();
    assert.match(app.hashError, /פגום/);
    globalThis.location = { hash: link.slice(link.indexOf('#')), pathname: '/' };
    await applyHash();
    assert.equal(app.hashError, null);
  } finally { Object.assign(globalThis, g); app.friendLanding = null; }
});

test('switchTo: a year with no cohort of its own (year ה, nearest cohort 2024) stays the picked year', async () => {
  serve(); reset({ ...mine(), program: 30, startYear: 2026, profile: { year: 5, amirnet: null, specs: [], summer: false } });
  assert.equal(await switchTo(30, 2025), true); // the nearest cohort the catalog has (2023 is not in it)
  assert.equal(app.state.profile.year, 5);
});

test('switchTo and a dropped program take the academic year from the catalog, not the built-in default', async () => {
  const { load } = await import('../web/app.js');
  serve(); reset({ ...mine(), year: 2028 }); app.catalog = { ...CATALOG, year: 2028 };
  assert.equal(await switchTo(20, 2027), true);
  assert.equal(app.state.year, 2028);
  reset(null); app.catalog = { ...CATALOG, year: 2028 }; store.set('afeka-sched-v1', JSON.stringify({ ...mine(), v: 1, program: 40, startYear: 2026 }));
  assert.equal(load().year, 2028);
  app.hashError = null;
});

test('applyHash: a backup whose data fails to load says so even when a load notice is up', async () => {
  const { applyHash } = await import('../web/app.js');
  const { backupLink } = await import('../web/share.js');
  const g = { location: globalThis.location, history: globalThis.history, document: globalThis.document };
  globalThis.history = { replaceState() {} };
  globalThis.document ??= { activeElement: null, body: { dataset: {} }, querySelector: () => null };
  try {
    serve((m) => m[3] === '20'); reset({ ...mine(), program: 30, startYear: 2026 });
    const link = await backupLink('https://x.test/', { ...app.state, program: 20, startYear: 2026 });
    app.hashError = 'המחזור השמור כבר לא באתר.';
    globalThis.location = { hash: link.slice(link.indexOf('#')), pathname: '/' };
    await applyHash();
    assert.match(app.hashError ?? '', /לא הצלחנו לטעון/);
  } finally { Object.assign(globalThis, g); app.hashError = null; }
});
