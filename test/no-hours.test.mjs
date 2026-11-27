import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'node-html-parser';
import { parseGroups, detailsSemester } from '../scripts/parse.mjs';
import { buildDataset } from '../scripts/build.mjs';
import { app, normalize, yearView, candidateMode } from '../web/app.js';
import { classify, modeFor, summerOnly, progress, gradeAverage } from '../web/rules.js';
import { layoutMap, geometry, progressInfo } from '../web/map-layout.js';
import { nodeAria, listHtml, cardHtml, mapSvg } from '../web/map-render.js';
import { searchCourses, matches } from '../web/course-search.js';
import { courseHtml, resultsHtml, searchViewHtml } from '../web/ui-course-search.js';
import { buildOptions, search, searchYear } from '../web/solver-core.js';
import { renderWeek, semResult } from '../web/ui-grid.js';
import { renderSide } from '../web/ui-side.js';
import { ui } from '../web/ui-common.js';

const TEXT = 'נלמד, בלי שעות במערכת';
const fixture = (id) => parseGroups(readFileSync(new URL(`../scripts/fixtures/groups-${id}-no-hours.html`, import.meta.url), 'utf8'));
const course = (extra = {}) => ({ name: 'פרויקט גמר', credits: 3, prereqs: [], offered: false, groups: [], ...extra });
const scheduled = (sem = 'א') => course({ name: 'קורס עם שעות', offered: true, groups: [{
  id: `scheduled-${sem}`, primary: true, type: 'סופי-הרצאה', linked: [], full: false, lecturer: '', exams: [],
  meetings: [{ day: 2, start: '10:00', end: '11:50', room: '' }]
}] });
const dataset = (courses = { '40422': course({ noHours: true }) }, semester = 'א') => ({
  year: 2027, startYear: 2026, program: 30, semester, courses, specializations: [],
  lists: [{ code: 1, name: "קורסי חובה שנה א'", minCredits: 3, courses: Object.keys(courses) }]
});
const record = (extra = {}) => normalize({ v: 1, passed: [], profile: { year: 2 }, ...extra });
const candidates = (data, state) => Object.entries(classify(data, state).statuses)
  .map(([id, s]) => ({ id, mode: modeFor(s.status, state.choices[id], true) }))
  .filter((c) => ['must', 'optional'].includes(c.mode));

test('parseGroups: no-meeting projects retain primary and semester arguments', () => {
  for (const [id, gid, sem] of [['40422', '274042201', 'א'], ['40423', '274042301', 'ב']]) {
    const gs = fixture(id);
    assert.equal(gs.length, 1);
    assert.equal(gs[0].id, gid);
    assert.equal(gs[0].primary, true);
    assert.deepEqual(gs[0].meetings, []);
    assert.equal(gs[0].detailsArgs, `-N${id},-N${sem === 'א' ? 1 : 2},-N6,-N${gid},-N`);
    assert.equal(detailsSemester(gs[0].detailsArgs), sem);
  }
});

test('buildDataset: no-hours status is semester-specific', () => {
  const primary = fixture('40422')[0];
  const build = (groups, semester) => buildDataset({
    ...dataset({}), department: 'מכנית', semester,
    lists: [{ code: 1, name: 'פרויקטים', courses: [{ id: '40422', name: 'פרויקט גמר' }] }],
    raw: { '40422': { groups, details: { credits: 3, prereqs: [] } } }, exams: []
  }).courses['40422'];
  for (const [groups, semester, expected] of [
    [[primary], 'א', true], [[primary], 'ב', false], [[fixture('40423')[0]], 'ב', true],
    [[{ ...primary, primary: false }], 'א', false],
    [[{ ...primary, detailsArgs: null }], 'א', false],
    [[{ ...primary, detailsArgs: undefined }], 'א', false],
    [[{ ...primary, detailsArgs: '-N40422' }], 'א', false],
    [[{ ...primary, detailsArgs: '-N40422,-N3' }], 'קיץ', true],
    [[{ ...primary, detailsArgs: '-N40422,-N9' }], 'א', false]
  ]) {
    const c = build(groups, semester);
    assert.equal(c.noHours === true, expected, `${semester}: ${groups[0].detailsArgs}, primary=${groups[0].primary}`);
    assert.equal(c.offered, false);
    assert.deepEqual(c.groups, []);
  }
  const sched = { ...primary, id: 'sched', meetings: [{ semester: 'א', day: 2, start: '10:00', end: '11:50' }] };
  const orphan = build([primary, { ...sched, primary: false }], 'א');
  assert.equal(orphan.noHours, true);
  assert.deepEqual(orphan.groups, [], 'no-hours courses keep no schedulable groups');
  const c = build([primary, sched], 'א');
  assert.equal(c.offered, true);
  assert.notEqual(c.noHours, true);
  assert.equal(c.groups.length, 1);
});

test('classify: no-hours is taught but not plannable', () => {
  const data = dataset({ '40422': course({ noHours: true }), '6000': course({ noHours: true }) });
  const s = classify(data, record({ failed: { '40422': 1 } })).statuses['40422'];
  assert.deepEqual(s, { status: 'noHours', reasons: [TEXT] });
  for (const choice of [undefined, 'must', 'optional', 'no']) assert.equal(modeFor(s.status, choice, true), null);
  assert.equal(classify(data, record({ passed: ['40422'] })).statuses['40422'].status, 'done');
  assert.equal(classify(data, record({ profile: { amirnet: 134 } })).statuses['6000'].status, 'exempt');
});

test('yearView: preserves B-only no-hours without overriding scheduled courses', () => {
  const none = course(), nh = course({ noHours: true });
  const A = dataset({ b: none, a: nh, scheduledA: scheduled(), scheduledB: nh });
  const B = dataset({ b: nh, a: none, onlyB: nh, scheduledA: nh, scheduledB: scheduled('ב') }, 'ב');
  const y = yearView(A, B), st = classify(y, record()).statuses;
  for (const id of ['a', 'b', 'onlyB']) {
    assert.equal(y.courses[id].noHours, true, id);
    assert.equal(y.courses[id].offered, false);
    assert.equal(st[id].status, 'noHours');
    assert.deepEqual(y.courses[id].semesters, [], 'semesters lists planning semesters');
  }
  for (const id of ['scheduledA', 'scheduledB']) {
    assert.equal(y.courses[id].offered, true);
    assert.notEqual(y.courses[id].noHours, true);
    assert.equal(st[id].status, 'available');
  }
  assert.deepEqual(y.courses.scheduledA.semesters, ['א']);
  assert.deepEqual(y.courses.scheduledB.semesters, ['ב']);
  assert.equal(classify(A, record()).statuses.scheduledB.status, 'noHours');
  assert.equal(classify(B, record()).statuses.scheduledB.status, 'available');
});

test('no-hours: passed credits and grades still count; planned credits do not', () => {
  const data = dataset(), state = record({ choices: { '40422': 'must' } });
  const st = classify(data, state).statuses;
  const plan = new Set(candidates(data, state).map((c) => c.id));
  const p = progressInfo(data, st, plan);
  assert.equal(p.total, 3);
  assert.equal(p.planned, 0);
  assert.equal(p.adds, 0);
  const passed = record({ passed: ['40422'], grades: { '40422': 90 } });
  assert.deepEqual(gradeAverage(data, passed), { avg: 90, credits: 3 });
  assert.equal(progress(data, passed).earned, 3);
  assert.equal(progressInfo(data, classify(data, passed).statuses).done, 3);
});

test('no-hours: map labels and accessible names never say not taught', () => {
  const data = dataset(), L = layoutMap(data), g = geometry(L, (id) => data.courses[id].credits);
  const ctx = { data, L, g, st: classify(data, record()).statuses, unlocks: {}, aside: [], plan: new Set() };
  const n = L.nodes.find((n) => n.id === '40422');
  for (const html of [nodeAria(ctx, n), listHtml(ctx), cardHtml(ctx, '40422'), mapSvg(ctx)]) {
    assert.ok(html.includes(TEXT), html);
    assert.doesNotMatch(html, /לא נלמד|undefined/);
  }
  assert.ok(parse(mapSvg(ctx)).querySelector('[data-key="40422"]').getAttribute('aria-label').includes(TEXT));
});

test('no-hours: search finds the course without a planning control', () => {
  const data = dataset();
  for (const text of ['40422', 'פרויקט']) {
    const row = searchCourses({ data: { 'א': data }, sem: 'א', week: [], statuses: classify(data, record()).statuses }, { text }).list[0];
    assert.ok(row, 'a no-hours course is included in text search');
    assert.equal(row.id, '40422');
    assert.equal(row.open, false);
    assert.equal(row.why, TEXT);
    assert.deepEqual(row.options, []);
    const html = courseHtml(row);
    assert.ok(html.includes(TEXT));
    assert.doesNotMatch(html, /לא נלמד|data-ed="cs(?:Add|Swap)"/);
    assert.equal(matches({ ...data.courses['40422'], code: '40422' }, text), true);
  }
  const row = searchCourses({ data: { 'ב': dataset(undefined, 'ב') }, sem: 'א', week: [] }, { text: '40422', sem: 'ב' }).list[0];
  assert.ok(row.why.includes(TEXT), 'another semester still explains the missing hours');
});

test('no-hours: rendered search rows retain the label across semesters and programs', async (t) => {
  const data = dataset(), second = dataset(undefined, 'ב');
  const ctx = { data: { 'א': data, 'ב': second }, foreign: { 'א': data, 'ב': second },
    sem: 'א', week: [], statuses: classify(data, record()).statuses };
  for (const program of ['mine', 10]) for (const sem of ['א', 'ב']) {
    await t.test(`${program}, semester ${sem}`, () => {
      const query = { text: '40422', program, sem }, result = searchCourses(ctx, query), row = result.list[0];
      assert.ok(row, 'the course is found');
      assert.equal(row.readOnly, program !== 'mine' || sem !== 'א');
      for (const html of [courseHtml(row), resultsHtml(result, true), searchViewHtml(query, [], result, true)]) {
        assert.ok(html.includes(TEXT), `rendered row must show ${TEXT}: ${html}`);
        assert.doesNotMatch(html, /אין קבוצה פתוחה|לא נלמד|data-ed="cs(?:Add|Swap)"/);
        if (row.readOnly) assert.ok(html.includes(row.readOnlyWhy), 'the read-only reason remains visible');
      }
    });
  }
});

test('no-hours: summer hints do not promise planning without hours', () => {
  for (const on of [false, true]) {
    const data = dataset(), summer = dataset({ '40422': scheduled('קיץ') }, 'קיץ');
    const own = summerOnly(classify(data, record()).statuses, summer, on)['40422'];
    assert.equal(own.status, 'noHours');
    assert.deepEqual(own.reasons, [TEXT], 'a taught current-semester course is not summer-only');
    const absent = dataset({ '40422': course() });
    const s = summerOnly(classify(absent, record()).statuses, dataset(undefined, 'קיץ'), on)['40422'];
    assert.ok(s.reasons[0].includes(TEXT));
    assert.doesNotMatch(s.reasons.join(), /לא נלמד|תכננו|כדי לתכנן/);
  }
});

test('no-hours: produces no solver option or board block', () => {
  const data = dataset({ '40422': course({ noHours: true }), scheduled: scheduled() });
  const state = record({ choices: { '40422': 'must', scheduled: 'must' } });
  assert.deepEqual(buildOptions(data.courses['40422']), []);
  const single = search({ data, courses: candidates(data, state), statuses: classify(data, state).statuses });
  const B = dataset({ '40422': course({ noHours: true }), scheduled: course() }, 'ב');
  const year = searchYear({ dataA: data, dataB: B, state, yearList: new Set(['40422', 'scheduled']) });
  assert.ok(single.results.length && year.results.length);
  for (const [results, pair] of [[single.results, false], [year.results, true]]) {
    for (const raw of results) for (const sem of pair ? ['א', 'ב'] : ['א']) {
      const res = pair ? semResult(raw, sem) : raw;
      assert.ok(!res.courses.includes('40422'));
      const html = renderWeek({ data: sem === 'א' ? data : B, res, range: { from: 8, to: 13, days: 5 }, colors: new Map(), pins: [], friends: [], day: 1 });
      assert.doesNotMatch(html, /פרויקט גמר|40422/);
      if (sem === 'א') assert.match(html, /data-act="block"/, 'the scheduled control course still has a block');
    }
  }
});

test('no-hours: side list separates taught courses and counts in both designs', () => {
  const elements = new Map();
  const element = () => ({ innerHTML: '', classList: { add() {}, remove() {} },
    querySelectorAll: () => [], querySelector: () => null, insertAdjacentHTML() {} });
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  };
  globalThis.document = { documentElement: { dataset: {} }, getElementById: get };
  get('coursesTitle').parentElement = element();
  try {
    for (const design of ['a', 'classic']) {
      document.documentElement.dataset.design = design;
      app.data = dataset({ '40422': course({ noHours: true }), absent: course({ name: 'חסר' }) });
      app.sem = { 'א': app.data };
      app.state = record({ scope: 'א', choices: { '40422': 'must' } });
      app.cls = classify(app.data, app.state);
      app.clsSummer = null;
      ui.last = null;
      assert.equal(candidateMode('40422'), null);
      renderSide(null);
      const root = parse(get('side').innerHTML), group = root.querySelector('details[data-key="noHours"]');
      assert.ok(group, design);
      assert.ok(group.text.includes(TEXT));
      assert.doesNotMatch(group.text, /לא נלמד/);
      assert.equal(group.querySelectorAll('[data-chg="mode"]').length, 0);
      assert.ok(root.querySelector('details[data-key="notOffered"] summary').text.includes('(1)'));
      if (design === 'a') assert.equal(group.querySelector('[data-course-id="40422"]') !== null, true, 'searchable row');
      assert.ok(root.querySelector('details[data-key="plan"] summary').text.includes('(0)'));
    }
  } finally {
    delete globalThis.document;
  }
});
