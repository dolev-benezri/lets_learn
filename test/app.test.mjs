import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc } from '../web/app.js';

test('esc neutralises HTML from untrusted friend links', () => {
  assert.equal(esc('<img src=x onerror=alert(1)>"\''), '&lt;img src=x onerror=alert(1)&gt;&quot;&#39;');
  assert.equal(esc(5), '5');
});

import { normalize } from '../web/app.js';
const D = normalize(null);

test('normalize: non-object or v!=1 gives DEFAULT', () => {
  for (const bad of [null, 5, 'x', [], { v: 2, name: 'a' }, {}]) assert.deepEqual(normalize(bad), D);
  assert.equal(D.program, 30);
});

test('normalize: foreign program/startYear/year/semester are ignored', () => {
  const s = normalize({ v: 1, program: 99, startYear: 1999, year: 2000, semester: 'ב', name: 'דנה' });
  assert.deepEqual(
    [s.program, s.startYear, s.year, s.semester, s.name],
    [D.program, D.startYear, D.year, D.semester, 'דנה']
  );
});

test('normalize: bad weights/constraints dropped, DEFAULT keys kept', () => {
  const s = normalize({
    v: 1,
    weights: { friends: 'x', progress: 99, bogus: 1, freeDays: 2 },
    constraints: {
      dayOff: [0, 3, 7, 'a'],
      dayOffHard: 'yes',
      notBefore: '9am',
      notAfter: '17:30',
      maxCredits: -1,
      examsSameDay: 'maybe',
      includeFull: true
    }
  });
  assert.equal(s.weights.friends, D.weights.friends);
  assert.equal(s.weights.progress, 5);
  assert.equal(s.weights.freeDays, 3); // 2 is between steps: snaps up like the UI's nearestStep
  assert.equal(normalize({ v: 1, weights: { compact: 0.4, timeWindow: 4 } }).weights.timeWindow, 5);
  assert.ok(!('bogus' in s.weights));
  assert.deepEqual(s.constraints, { ...D.constraints, notAfter: '17:30', includeFull: true });
});

test('normalize: bad friends, failed and choices dropped', () => {
  const s = normalize({
    v: 1,
    failed: { a: 7, b: 2, c: 1.5 },
    choices: { a: 'must', b: 'hack' },
    friends: [{ name: { x: 1 }, groups: [] }, { name: 'ok', groups: ['g1', 5], weight: 9 }, 'str']
  });
  assert.deepEqual(s.failed, { b: 2 });
  assert.deepEqual(s.choices, { a: 'must' });
  assert.deepEqual(s.friends, [{ name: 'ok', groups: ['g1'], weight: 3, active: true }]);
});

test('normalize: valid constraints and friends round-trip', () => {
  const s = normalize({
    v: 1,
    constraints: { dayOff: [2, 5], notBefore: '09:00', maxCredits: 20, examsSameDay: 'allow' },
    friends: [{ name: 'x', groups: ['a'], weight: 0.5, active: false }],
    passed: ['1', '2'],
    pins: ['p']
  });
  assert.deepEqual(
    [s.constraints.dayOff, s.constraints.notBefore, s.constraints.maxCredits, s.constraints.examsSameDay],
    [[2, 5], '09:00', 20, 'allow']
  );
  assert.deepEqual(s.friends, [{ name: 'x', groups: ['a'], weight: 0.5, active: false }]);
  assert.deepEqual([s.passed, s.pins], [['1', '2'], ['p']]);
});

test('normalize: manual: true is kept, manual: "yes" is dropped', () => {
  const s = normalize({
    v: 1,
    friends: [
      { name: 'a', groups: ['g1'], manual: true },
      { name: 'b', groups: ['g2'], manual: 'yes' },
      { name: 'c', groups: ['g3'], manual: false },
    ]
  });
  assert.equal(s.friends[0].manual, true);
  assert.ok(!('manual' in s.friends[1]));
  assert.ok(!('manual' in s.friends[2]));
});

test('DEFAULT weights sit on the 0/1/3/5 scale the preferences panel shows', async () => {
  const { DEFAULT } = await import('../web/app.js');
  for (const [k, v] of Object.entries(DEFAULT.weights)) assert.ok([0, 1, 3, 5].includes(v), `${k}=${v}`);
});

test('normalize: out-of-range profile dropped, valid kept', () => {
  const none = { specs: [], summer: false };
  assert.deepEqual(normalize({ v: 1, profile: { year: 9, amirnet: 49 } }).profile, {
    year: null,
    amirnet: null,
    ...none
  });
  assert.deepEqual(normalize({ v: 1, profile: { year: 2, amirnet: 110 } }).profile, { year: 2, amirnet: 110, ...none });
  assert.deepEqual(normalize({ v: 1, profile: 'x' }).profile, { year: null, amirnet: null, ...none });
});

test('normalize: profile.turn is kept only as a non-empty string', () => {
  assert.equal(normalize({ v: 1, profile: { turn: 'a' } }).profile.turn, 'a');
  for (const t of ['', 5, null, ['a'], {}, 'x'.repeat(41)])
    assert.ok(!('turn' in normalize({ v: 1, profile: { turn: t } }).profile), String(t));
  assert.ok(!('turn' in normalize({ v: 1 }).profile));
});

test('normalize: old saved state without specs/summer gets the defaults; valid ones are kept, bad ones dropped', () => {
  assert.deepEqual(normalize({ v: 1, profile: { year: 3, amirnet: 100 } }).profile, {
    year: 3,
    amirnet: 100,
    specs: [],
    summer: false
  });
  assert.deepEqual(normalize({ v: 1 }).profile, { year: null, amirnet: null, specs: [], summer: false });
  assert.deepEqual(normalize(null).profile, { year: null, amirnet: null, specs: [], summer: false });
  assert.deepEqual(normalize({ v: 1, profile: { specs: ['solid', 'flow'], summer: true } }).profile, {
    year: null,
    amirnet: null,
    specs: ['solid', 'flow'],
    summer: true
  });
  assert.deepEqual(normalize({ v: 1, profile: { specs: ['solid', 'flow', 'mech'], summer: 'true' } }).profile, {
    year: null,
    amirnet: null,
    specs: [],
    summer: false
  });
});

import { yearView } from '../web/app.js';
test('normalize: scope/load/semesterOf default, validate, and survive', () => {
  const d = normalize({});
  assert.equal(d.scope, 'year');
  assert.equal(d.load, 'even');
  assert.deepEqual(d.semesterOf, {});
  const old = normalize({ v: 1, name: 'x' }); // old saved state without the new fields
  assert.equal(old.scope, 'year');
  assert.equal(old.load, 'even');
  assert.deepEqual(old.semesterOf, {});
  const n = normalize({ v: 1, scope: 'ב', load: 'א', semesterOf: { 90901: 'ב', bad: 'x', 90902: 'א' } });
  assert.equal(n.scope, 'ב');
  assert.equal(n.load, 'א');
  assert.deepEqual(n.semesterOf, { 90901: 'ב', 90902: 'א' });
  const bad = normalize({ v: 1, scope: 'סתיו', load: 2 });
  assert.equal(bad.scope, 'year');
  assert.equal(bad.load, 'even');
  assert.equal(
    normalize({ v: 1, scope: 'קיץ' }).scope,
    'קיץ',
    'summer is a scope (it applies only when the profile plans a summer)'
  );
});
test('normalize: semesterOf caps entries and key length', () => {
  const big = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`c${i}`, 'א']));
  assert.equal(Object.keys(normalize({ v: 1, semesterOf: big }).semesterOf).length, 200);
  assert.deepEqual(normalize({ v: 1, semesterOf: { ['k'.repeat(21)]: 'א' } }).semesterOf, {});
});
test('yearView: offered in either semester, groups merged, semesters listed', () => {
  const A = {
    year: 2027,
    startYear: 2026,
    semester: 'א',
    lists: [],
    courses: {
      X: { name: 'X', credits: 1, offered: true, prereqs: [], groups: [{ id: 'xa' }] },
      Y: { name: 'Y', credits: 1, offered: false, prereqs: [], groups: [] }
    }
  };
  const B = {
    ...A,
    semester: 'ב',
    courses: {
      X: { ...A.courses.X, groups: [{ id: 'xb' }] },
      Y: { ...A.courses.Y, offered: true, groups: [{ id: 'yb' }] }
    }
  };
  const v = yearView(A, B);
  assert.deepEqual(
    v.courses.X.groups.map((g) => g.id),
    ['xa', 'xb']
  );
  assert.deepEqual(v.courses.X.semesters, ['א', 'ב']);
  assert.equal(v.courses.Y.offered, true);
  assert.deepEqual(v.courses.Y.semesters, ['ב']);
  assert.equal(v.semester, 'שנה');
});

import { app, pickData, semOfGroup } from '../web/app.js';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
const real = (n) => JSON.parse(readFileSync(new URL(`../web/data/afeka/2027-${n}/30-2026.json`, import.meta.url)));
test('pickData: year view, single-semester scopes, and fallback when ב is missing', () => {
  const A = real(1),
    B = real(2);
  app.state = normalize({});
  app.sem = { 'א': A, 'ב': B };
  pickData();
  assert.equal(app.data.semester, 'שנה');
  assert.equal(app.data.fetchedAt, A.fetchedAt);
  assert.equal(app.data.examsPublished, A.examsPublished);
  const gA = Object.values(A.courses).flatMap((c) => c.groups)[0].id,
    gB = Object.values(B.courses).flatMap((c) => c.groups)[0].id;
  assert.equal(semOfGroup(gA), 'א');
  assert.equal(semOfGroup(gB), 'ב');
  assert.equal(semOfGroup('nope'), null);
  app.state.scope = 'ב';
  pickData();
  assert.equal(app.data, B);
  app.state.scope = 'א';
  pickData();
  assert.equal(app.data, A);
  app.sem = { 'א': A, 'ב': null }; // ב failed to load
  for (const scope of ['year', 'ב']) {
    app.state.scope = scope;
    pickData();
    assert.equal(app.data, A);
  }
});

import { upsertFriend, friendName } from '../web/app.js';
const F = (name, groups = ['1'], extra = {}) => ({ name, groups, weight: 1, active: true, ...extra });
test('upsertFriend replaces by name instead of duplicating', () => {
  const r = upsertFriend([F('דנה', ['1', '2', '3'], { weight: 3 })], { name: 'דנה', groups: ['9'], manual: true });
  assert.equal(r.friends.length, 1);
  assert.deepEqual(r.friends[0].groups, ['9']);
  assert.equal(r.friends[0].weight, 3);
  assert.equal(r.friends[0].manual, true);
  assert.equal(r.replaced, true);
});
test('upsertFriend edits by name, so deleting another friend mid-edit cannot retarget the save', () => {
  const r = upsertFriend([F('א'), F('ג')], { name: 'א', groups: ['5'] }, 'א'); // 'ב' was deleted while editing 'א'
  assert.deepEqual(
    r.friends.map((f) => [f.name, f.groups[0]]),
    [
      ['א', '5'],
      ['ג', '1']
    ]
  );
});
test('upsertFriend rename onto an existing name leaves one friend', () => {
  const r = upsertFriend([F('א'), F('ב')], { name: 'ב', groups: ['7'] }, 'א');
  assert.deepEqual(
    r.friends.map((f) => [f.name, f.groups[0]]),
    [['ב', '7']]
  );
});
test('friendName: a nameless link takes the first free "חבר N", or the name of the friend with the same groups', () => {
  assert.equal(friendName([], { groups: ['1'] }), 'חבר 1');
  assert.equal(friendName([F('חבר 2', ['5'])], { groups: ['1'] }), 'חבר 1'); // חבר 1 was removed: no overwrite of חבר 2
  assert.equal(friendName([F('חבר 1', ['5']), F('דנה', ['6'])], { groups: ['1'] }), 'חבר 2');
  assert.equal(friendName([F('חבר 1', ['2', '1'])], { groups: ['1', '2'] }), 'חבר 1'); // the same link again replaces, not duplicates
  assert.equal(friendName([F('חבר 1', ['1'])], { name: 'דנה', groups: ['1'] }), 'דנה');
});
test('upsertFriend refuses a 21st friend', () => {
  const many = Array.from({ length: 20 }, (_, i) => F(`f${i}`));
  const r = upsertFriend(many, { name: 'new', groups: ['1'] });
  assert.equal(r.friends.length, 20);
  assert.match(r.error, /עד 20/);
});

test('index.html has a description and og/twitter tags with an absolute og:image that exists', () => {
  const html = readFileSync('web/index.html', 'utf8');
  const meta = (attr, key) => html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]+)"`))?.[1];
  assert.match(meta('name', 'description'), /כלי עזר לא רשמי/);
  for (const k of ['og:title', 'og:description', 'og:type', 'og:url', 'og:locale']) assert.ok(meta('property', k), k);
  assert.equal(meta('property', 'og:image'), 'https://dolev-benezri.github.io/lets_learn/og.png');
  assert.equal(meta('name', 'twitter:card'), 'summary_large_image');
  assert.ok(existsSync('web/og.png'));
});

test('both pages carry a CSP: self by default, no plugins or base override, no source from outside the site', () => {
  for (const page of ['web/index.html', 'web/legal.html']) {
    const csp =
      readFileSync(page, 'utf8').match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] ?? '';
    const dir = Object.fromEntries(
      csp
        .split(';')
        .map((d) => d.trim().split(/\s+/))
        .filter((d) => d[0])
        .map(([k, ...v]) => [k, v])
    );
    assert.deepEqual(dir['default-src'], ["'self'"], page);
    assert.deepEqual(dir['object-src'], ["'none'"], page);
    assert.deepEqual(dir['base-uri'], ["'none'"], page);
    assert.ok(dir['script-src'], page);
    for (const d of ['script-src', 'worker-src', 'connect-src'])
      assert.ok(
        (dir[d] ?? []).every((s) => ["'self'", "'wasm-unsafe-eval'", 'blob:'].includes(s)),
        `${page} ${d}: ${dir[d]}`
      );
    assert.doesNotMatch(csp, /https?:|jsdelivr/, `${page} allows no outside host`);
  }
  const legal = readFileSync('web/legal.html', 'utf8').match(
    /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/
  )[1];
  assert.doesNotMatch(legal, /wasm|blob:/, 'legal.html runs no OCR');
});

test('the unofficial-tool line lives once, inside the page footer', () => {
  const html = readFileSync('web/index.html', 'utf8');
  const foot = html.match(/<footer class="site-foot"[\s\S]*?<\/footer>/)?.[0] ?? '';
  assert.match(foot, /כלי עזר לא רשמי/);
  assert.match(foot, /legal\.html#terms/);
  assert.match(foot, /legal\.html#accessibility/);
  assert.equal(html.slice(html.indexOf('<body')).split('כלי עזר לא רשמי').length, 2); // the visible page; the meta description repeats it for link previews
});

import { routeOf, hashOf, STEPS } from '../web/app.js';
test('routeOf: four steps; friend, backup and unknown hashes land on the plans', () => {
  assert.deepEqual(['#me', '#courses', '#prefs'].map(routeOf), ['me', 'courses', 'prefs']);
  for (const h of ['', '#', '#f=abc', '#b=abc', '#mex', '#courses2']) assert.equal(routeOf(h), 'plan');
});

test('normalize keeps integer grades 0-100 and drops the rest', () => {
  const s = normalize({ v: 1, grades: { a: 90, b: 101, c: '80', d: -1, e: 55.5 } });
  assert.deepEqual(s.grades, { a: 90 });
});

test('normalize keeps the exempt list as short strings, empty by default', () => {
  assert.deepEqual(normalize({ v: 1, exempt: ['30130', 7, 'x'.repeat(21)] }).exempt, ['30130']);
  assert.deepEqual(normalize({ v: 1 }).exempt, []);
});

test('status page CSS is scoped to #me: the map lane div.ml.me must not inherit it', () => {
  const css = readFileSync(new URL('../web/style.css', import.meta.url), 'utf8');
  assert.deepEqual(css.match(/(^|[\s,}])\.me(?![\w-])/gm), null);
});

test('index.html: one step link per step, in order, with hashOf hrefs', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const links = [...html.matchAll(/<a href="([^"]*)" data-view="([a-z]+)"/g)].map((m) => [m[2], m[1]]);
  assert.deepEqual(
    links,
    STEPS.map((v) => [v, hashOf(v) || '#'])
  );
});

test('hashOf is routeOf inverse for every step', () => {
  for (const v of STEPS) assert.equal(routeOf(hashOf(v)), v);
  assert.equal(hashOf(undefined), '');
});
test('normalize: sortBy keeps the four values, anything else is best', () => {
  for (const v of ['best', 'credits', 'friends', 'unlocks']) assert.equal(normalize({ v: 1, sortBy: v }).sortBy, v);
  for (const v of [undefined, '__proto__', 5, 'credits ', null])
    assert.equal(normalize({ v: 1, sortBy: v }).sortBy, 'best');
});

test('normalize: blocks keep valid items, drop invalid ones individually, cap at 12', () => {
  const ok = { day: 2, start: '18:00', end: '20:00', label: 'עבודה' };
  const bad = [
    null,
    'x',
    { ...ok, day: 0 },
    { ...ok, day: 7 },
    { ...ok, day: 1.5 },
    { ...ok, start: '20:00' },
    { ...ok, start: '06:30' },
    { ...ok, end: '23:30' },
    { ...ok, end: '9am' },
    { ...ok, start: '25:00', end: '26:00' },
    { ...ok, label: 'x'.repeat(31) },
    { ...ok, label: 5 },
    { ...ok, label: undefined }
  ];
  assert.deepEqual(
    normalize({ v: 1, constraints: { blocks: [...bad, ok, { ...ok, day: 6, label: '', extra: 1 }] } }).constraints
      .blocks,
    [ok, { ...ok, day: 6, label: '' }]
  );
  assert.equal(normalize({ v: 1, constraints: { blocks: Array(15).fill(ok) } }).constraints.blocks.length, 12);
  assert.deepEqual(normalize({ v: 1, constraints: { blocks: 'x' } }).constraints.blocks, []);
  assert.deepEqual(normalize({ v: 1 }).constraints.blocks, []);
  assert.equal(
    normalize({ v: 1, constraints: { blocks: [{ ...ok, start: '07:00', end: '23:00' }] } }).constraints.blocks.length,
    1
  );
});

test('normalize: specDraft keeps one well-formed id (the data check is reconcileSpecs), yearIds keeps short strings; the rest is dropped', () => {
  assert.deepEqual(normalize({ v: 1, specDraft: ['solid'], yearIds: ['30112', 7, 'x'.repeat(30)] }).specDraft, [
    'solid'
  ]);
  assert.deepEqual(normalize({ v: 1, yearIds: ['30112', 7, 'x'.repeat(30)] }).yearIds, ['30112']);
  for (const bad of [['Nope!'], ['solid', 'flow'], [], 'solid', null])
    assert.equal(normalize({ v: 1, specDraft: bad }).specDraft, null);
  assert.deepEqual(normalize({ v: 1, yearIds: 'x' }).yearIds, []);
});

test('the summary pills row scrolls on phones, so it is a named region the keyboard can reach (U2)', () => {
  const tag = readFileSync('web/index.html', 'utf8').match(/<div id="pills"[^>]*>/)[0];
  assert.ok(tag.includes('tabindex="0"') && tag.includes('role="region"') && /aria-label="[^"]+"/.test(tag), tag);
});

test('both pages declare an icon, so the browser does not fetch a missing /favicon.ico (U5)', () => {
  for (const f of ['web/index.html', 'web/legal.html'])
    assert.match(readFileSync(f, 'utf8'), /<link rel="icon" href="icon.svg" type="image\/svg\+xml">/, f);
  assert.match(readFileSync('web/icon.svg', 'utf8'), /^<svg /);
});

test('pdf.js, panzoom and tesseract.js load from web/vendor with their licenses; the site loads nothing from a CDN (S1)', () => {
  // Links to other sites in text are fine; a URL to a script, style, data file or a CDN is a library loaded from outside.
  const loaded = readdirSync('web')
    .filter((f) => /\.(js|html)$/.test(f))
    .flatMap((f) =>
      [...readFileSync(`web/${f}`, 'utf8').matchAll(/https?:\/\/[^'"`\s)<>]+/g)]
        .map((m) => m[0])
        .filter((u) => /\.(m?js|css|wasm|gz|json|traineddata)(\?|$)|cdn|jsdelivr|unpkg|googleapis|gstatic/i.test(u))
        .map((u) => `${f}: ${u}`)
    );
  assert.deepEqual(loaded, []);
  for (const f of [
    'pdfjs/pdf.min.mjs',
    'pdfjs/pdf.worker.min.mjs',
    'pdfjs/LICENSE',
    'panzoom/panzoom.es.js',
    'panzoom/LICENSE',
    'tesseract/LICENSE',
    'tesseract/SOURCES.txt',
    'tesseract/tesseract.esm.min.js',
    'tesseract/worker.min.js',
    'tesseract/lang/heb.traineddata.gz',
    'tesseract/lang/eng.traineddata.gz'
  ])
    assert.ok(readFileSync(`web/vendor/${f}`).length > 500, f);
  // The worker picks one core file by browser features; all three LSTM builds must be there, or some phones would fail only at import time.
  for (const f of ['lstm', 'simd-lstm', 'relaxedsimd-lstm'])
    assert.ok(readFileSync(`web/vendor/tesseract/core/tesseract-core-${f}.wasm.js`).length > 1e6, f);
  assert.match(
    readFileSync('web/friend-scan.js', 'utf8'),
    /workerPath.*corePath.*langPath/,
    'the OCR paths are set explicitly: the library defaults point at jsdelivr'
  );
});

test('the deploy waits for a green test job (P9)', () => {
  const y = readFileSync('.github/workflows/deploy.yml', 'utf8').replace(/\r\n/g, '\n'); // a Windows checkout has CRLF
  assert.match(y, /\n  test:\n[\s\S]*npm ci --ignore-scripts[\s\S]*npm test/);
  assert.match(y, /\n  deploy:\n    needs: test\n/);
});

test('normalize takes the academic year from the catalog (one place to roll over)', () => {
  const cat = { year: 2028, programs: [{ id: 30, name: 'מכנית', startYears: [2026] }] };
  assert.equal(normalize({ v: 1 }, cat).year, 2028);
  assert.equal(
    normalize({ v: 1, year: 1999 }, { programs: cat.programs }).year,
    2027,
    'no year in the catalog: the default; never from input'
  );
});

test('normalize caps failed and choices like grades, and refuses impossible hours', () => {
  const many = Object.fromEntries([...Array(500)].map((_, i) => [`c${i}`, 1]));
  const s = normalize({
    v: 1,
    failed: many,
    choices: { ['x'.repeat(30)]: 'must', a: 'no' },
    constraints: { notBefore: '99:99', notAfter: '23:59' }
  });
  assert.equal(Object.keys(s.failed).length, 200);
  assert.deepEqual(s.choices, { a: 'no' });
  assert.equal(s.constraints.notBefore, '');
  assert.equal(s.constraints.notAfter, '23:59');
});

test('yearCourses: a fifth-year evening student gets the year ה list', async () => {
  const { app: a, yearCourses } = await import('../web/app.js');
  const d = JSON.parse(readFileSync('web/data/afeka/2027-1/32-2024.json', 'utf8')),
    was = [a.data, a.state];
  a.data = d;
  a.state = {
    ...normalize({ v: 1 }),
    program: 32,
    startYear: 2024,
    profile: { year: 5, amirnet: null, specs: [], summer: false }
  };
  try {
    const five = d.lists.find((l) => l.name.includes("שנה ה'")).courses;
    assert.ok(five.length && five.every((id) => yearCourses().includes(id)));
  } finally {
    [a.data, a.state] = was;
  }
});

test('normalize: maxDays is null or a whole number of days 1-6', () => {
  assert.equal(normalize({ v: 1, constraints: { maxDays: 3 } }).constraints.maxDays, 3);
  for (const bad of [0, 7, 2.5, '3'])
    assert.equal(normalize({ v: 1, constraints: { maxDays: bad } }).constraints.maxDays, null, String(bad));
});

test('normalize: lecturers is { name: prefer|avoid }, at most 30, names up to 60 characters', () => {
  assert.deepEqual(
    normalize({
      v: 1,
      constraints: { lecturers: { 'כהן': 'avoid', 'לוי': 'prefer', x: 'maybe', ['y'.repeat(61)]: 'avoid' } }
    }).constraints.lecturers,
    { 'כהן': 'avoid', 'לוי': 'prefer' }
  );
  const many = Object.fromEntries([...Array(40)].map((_, i) => [`m${i}`, 'avoid']));
  assert.equal(Object.keys(normalize({ v: 1, constraints: { lecturers: many } }).constraints.lecturers).length, 30);
  assert.deepEqual(normalize({ v: 1 }).constraints.lecturers, {});
});

test('normalize: programSet only from a real choice; a saved study year or another program counts as one (older saves)', () => {
  assert.equal(D.programSet, false);
  assert.equal(normalize({ v: 1, programSet: true }).programSet, true);
  assert.equal(normalize({ v: 1, programSet: 'yes' }).programSet, false);
  assert.equal(normalize({ v: 1, profile: { year: 2 } }).programSet, true);
  assert.equal(
    normalize(
      { v: 1, program: 10, startYear: 2026 },
      {
        programs: [
          { id: 10, name: 'x', startYears: [2026] },
          { id: 30, name: 'y', startYears: [2026] }
        ]
      }
    ).programSet,
    true
  );
  assert.equal(normalize({ v: 1, profile: { year: null } }).programSet, false);
});

test('normalize: constraints.split is off by default, kept when true, false for anything else', () => {
  assert.equal(D.constraints.split, false);
  assert.equal(normalize({ v: 1, constraints: { split: true } }).constraints.split, true);
  for (const bad of ['yes', 1, null, 'true', [true]])
    assert.equal(normalize({ v: 1, constraints: { split: bad } }).constraints.split, false, String(bad));
});

test('legal.html: dated for this change; the English line says the exemption is computed from the Amirnet or psychometric score; the list says it goes by the data shown', () => {
  const html = readFileSync('web/legal.html', 'utf8');
  assert.match(html, /עדכון אחרון: 23\.10\.2026/);
  assert.match(html, /רמת האנגלית[^<]*הכלי מחשב פטור רק לפי ציון האנגלית \(אמירנט או פסיכומטרי\) שהזנתם/);
  assert.match(html, /<h3>מה הכלי בודק<\/h3>\s*<ul>\s*<li>הכול לפי הנתונים שמוצגים בכלי, שנמשכו מהידיעון/);
});

test('a save without outsideDone loads with []; a bad entry is dropped', () => {
  assert.deepEqual(normalize({ v: 1, passed: ['A'] }).outsideDone, []);
  assert.deepEqual(normalize({ v: 1, passed: [], outsideDone: ['ok', 3, 'x'.repeat(200)] }).outsideDone, ['ok']);
});

test('normalize drops duplicate passed ids; a missing list stays null (ensurePassed fills it)', () => {
  assert.deepEqual(normalize({ v: 1, passed: ['A', 'A', 'B'] }).passed, ['A', 'B']);
  assert.equal(normalize({ v: 1 }).passed, null);
});

// J9: a save from last year moves on like a backup link does, in normalize (local load, stash, backup restore)
test('normalize moves an old-year save on: study year advanced, last year groups and plan dropped', async () => {
  const { backupLink, readHash } = await import('../web/share.js');
  const catalog = { year: 2027, programs: [{ id: 30, startYears: [2026] }] };
  const old = (year, n = 1) => ({
    v: 1, program: 30, startYear: 2026, year: 2027 - n, semester: 'א', passed: [], profile: { year },
    pins: ['g'], friends: [{ name: 'f', groups: ['g'] }], semesterOf: { 10016: 'ב' }, yearIds: ['A'], retakeSeen: ['A']
  });
  const local = normalize(old(2), catalog);
  assert.deepEqual([local.profile.year, local.pins, local.friends, local.semesterOf, local.yearIds, local.retakeSeen], [3, [], [], {}, [], []]);
  const b = await backupLink('https://x.test/', old(2));
  const viaLink = normalize((await readHash(b.slice(b.indexOf('#')), { year: 2027, semester: 'א' })).payload, catalog);
  assert.deepEqual(viaLink, local, 'the same result through a backup link (no double advance)');
  for (const [y, n, want] of [[null, 1, null], [1, 1, 2], [4, 1, 5], [5, 1, 5], [2, 2, 4]])
    assert.equal(normalize(old(y, n), catalog).profile.year, want, `study year ${y}, ${n} year(s) on`);
  assert.equal(normalize({ ...old(2), year: 2027 }, catalog).profile.year, 2, 'this year: unchanged');
});
