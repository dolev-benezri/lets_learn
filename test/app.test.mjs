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
  assert.deepEqual([s.program, s.startYear, s.year, s.semester, s.name], [D.program, D.startYear, D.year, D.semester, 'דנה']);
});

test('normalize: bad weights/constraints dropped, DEFAULT keys kept', () => {
  const s = normalize({ v: 1, weights: { friends: 'x', progress: 99, bogus: 1, freeDays: 2 },
    constraints: { dayOff: [0, 3, 7, 'a'], dayOffHard: 'yes', notBefore: '9am', notAfter: '17:30', maxCredits: -1, examsSameDay: 'maybe', includeFull: true } });
  assert.equal(s.weights.friends, D.weights.friends);
  assert.equal(s.weights.progress, 5);
  assert.equal(s.weights.freeDays, 3); // 2 is between steps: snaps up like the UI's nearestStep
  assert.equal(normalize({ v: 1, weights: { compact: 0.4, timeWindow: 4 } }).weights.timeWindow, 5);
  assert.ok(!('bogus' in s.weights));
  assert.deepEqual(s.constraints, { ...D.constraints, notAfter: '17:30', includeFull: true });
});

test('normalize: bad friends, failed and choices dropped', () => {
  const s = normalize({ v: 1, failed: { a: 7, b: 2, c: 1.5 }, choices: { a: 'must', b: 'hack' },
    friends: [{ name: { x: 1 }, groups: [] }, { name: 'ok', groups: ['g1', 5], weight: 9 }, 'str'] });
  assert.deepEqual(s.failed, { b: 2 });
  assert.deepEqual(s.choices, { a: 'must' });
  assert.deepEqual(s.friends, [{ name: 'ok', groups: ['g1'], weight: 3, active: true }]);
});

test('normalize: valid constraints and friends round-trip', () => {
  const s = normalize({ v: 1, constraints: { dayOff: [2, 5], notBefore: '09:00', maxCredits: 20, examsSameDay: 'allow' },
    friends: [{ name: 'x', groups: ['a'], weight: 0.5, active: false }], passed: ['1', '2'], pins: ['p'] });
  assert.deepEqual([s.constraints.dayOff, s.constraints.notBefore, s.constraints.maxCredits, s.constraints.examsSameDay], [[2, 5], '09:00', 20, 'allow']);
  assert.deepEqual(s.friends, [{ name: 'x', groups: ['a'], weight: 0.5, active: false }]);
  assert.deepEqual([s.passed, s.pins], [['1', '2'], ['p']]);
});

test('normalize: manual: true is kept, manual: "yes" is dropped', () => {
  const s = normalize({ v: 1, friends: [
    { name: 'a', groups: ['g1'], manual: true },
    { name: 'b', groups: ['g2'], manual: 'yes' },
    { name: 'c', groups: ['g3'], manual: false },
  ] });
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
  assert.deepEqual(normalize({ v: 1, profile: { year: 9, amirnet: 49 } }).profile, { year: null, amirnet: null, ...none });
  assert.deepEqual(normalize({ v: 1, profile: { year: 2, amirnet: 110 } }).profile, { year: 2, amirnet: 110, ...none });
  assert.deepEqual(normalize({ v: 1, profile: 'x' }).profile, { year: null, amirnet: null, ...none });
});

test('normalize: old saved state without specs/summer gets the defaults; valid ones are kept, bad ones dropped', () => {
  assert.deepEqual(normalize({ v: 1, profile: { year: 3, amirnet: 100 } }).profile, { year: 3, amirnet: 100, specs: [], summer: false });
  assert.deepEqual(normalize({ v: 1 }).profile, { year: null, amirnet: null, specs: [], summer: false });
  assert.deepEqual(normalize(null).profile, { year: null, amirnet: null, specs: [], summer: false });
  assert.deepEqual(normalize({ v: 1, profile: { specs: ['solid', 'flow'], summer: true } }).profile, { year: null, amirnet: null, specs: ['solid', 'flow'], summer: true });
  assert.deepEqual(normalize({ v: 1, profile: { specs: ['solid', 'flow', 'mech'], summer: 'true' } }).profile, { year: null, amirnet: null, specs: [], summer: false });
});

import { yearView } from '../web/app.js';
test('normalize: scope/load/semesterOf default, validate, and survive', () => {
  const d = normalize({});
  assert.equal(d.scope, 'year'); assert.equal(d.load, 'even'); assert.deepEqual(d.semesterOf, {});
  const old = normalize({ v: 1, name: 'x' }); // old saved state without the new fields
  assert.equal(old.scope, 'year'); assert.equal(old.load, 'even'); assert.deepEqual(old.semesterOf, {});
  const n = normalize({ v: 1, scope: 'ב', load: 'א', semesterOf: { 90901: 'ב', bad: 'x', 90902: 'א' } });
  assert.equal(n.scope, 'ב'); assert.equal(n.load, 'א'); assert.deepEqual(n.semesterOf, { 90901: 'ב', 90902: 'א' });
  const bad = normalize({ v: 1, scope: 'סתיו', load: 2 });
  assert.equal(bad.scope, 'year'); assert.equal(bad.load, 'even');
  assert.equal(normalize({ v: 1, scope: 'קיץ' }).scope, 'קיץ', 'summer is a scope (it applies only when the profile plans a summer)');
});
test('normalize: semesterOf caps entries and key length', () => {
  const big = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`c${i}`, 'א']));
  assert.equal(Object.keys(normalize({ v: 1, semesterOf: big }).semesterOf).length, 200);
  assert.deepEqual(normalize({ v: 1, semesterOf: { ['k'.repeat(21)]: 'א' } }).semesterOf, {});
});
test('yearView: offered in either semester, groups merged, semesters listed', () => {
  const A = { year: 2027, startYear: 2026, semester: 'א', lists: [], courses: { X: { name: 'X', credits: 1, offered: true, prereqs: [], groups: [{ id: 'xa' }] }, Y: { name: 'Y', credits: 1, offered: false, prereqs: [], groups: [] } } };
  const B = { ...A, semester: 'ב', courses: { X: { ...A.courses.X, groups: [{ id: 'xb' }] }, Y: { ...A.courses.Y, offered: true, groups: [{ id: 'yb' }] } } };
  const v = yearView(A, B);
  assert.deepEqual(v.courses.X.groups.map((g) => g.id), ['xa', 'xb']);
  assert.deepEqual(v.courses.X.semesters, ['א', 'ב']);
  assert.equal(v.courses.Y.offered, true); assert.deepEqual(v.courses.Y.semesters, ['ב']);
  assert.equal(v.semester, 'שנה');
});

import { app, pickData, semOfGroup } from '../web/app.js';
import { readFileSync } from 'node:fs';
const real = (n) => JSON.parse(readFileSync(new URL(`../web/data/afeka/2027-${n}/30-2026.json`, import.meta.url)));
test('pickData: year view, single-semester scopes, and fallback when ב is missing', () => {
  const A = real(1), B = real(2);
  app.state = normalize({});
  app.sem = { 'א': A, 'ב': B };
  pickData();
  assert.equal(app.data.semester, 'שנה'); assert.equal(app.data.fetchedAt, A.fetchedAt); assert.equal(app.data.examsPublished, A.examsPublished);
  const gA = Object.values(A.courses).flatMap((c) => c.groups)[0].id, gB = Object.values(B.courses).flatMap((c) => c.groups)[0].id;
  assert.equal(semOfGroup(gA), 'א'); assert.equal(semOfGroup(gB), 'ב'); assert.equal(semOfGroup('nope'), null);
  app.state.scope = 'ב'; pickData(); assert.equal(app.data, B);
  app.state.scope = 'א'; pickData(); assert.equal(app.data, A);
  app.sem = { 'א': A, 'ב': null }; // ב failed to load
  for (const scope of ['year', 'ב']) { app.state.scope = scope; pickData(); assert.equal(app.data, A); }
});

import { upsertFriend } from '../web/app.js';
const F = (name, groups = ['1'], extra = {}) => ({ name, groups, weight: 1, active: true, ...extra });
test('upsertFriend replaces by name instead of duplicating', () => {
  const r = upsertFriend([F('דנה', ['1', '2', '3'], { weight: 3 })], { name: 'דנה', groups: ['9'], manual: true });
  assert.equal(r.friends.length, 1); assert.deepEqual(r.friends[0].groups, ['9']);
  assert.equal(r.friends[0].weight, 3); assert.equal(r.friends[0].manual, true); assert.equal(r.replaced, true);
});
test('upsertFriend edits by name, so deleting another friend mid-edit cannot retarget the save', () => {
  const r = upsertFriend([F('א'), F('ג')], { name: 'א', groups: ['5'] }, 'א'); // 'ב' was deleted while editing 'א'
  assert.deepEqual(r.friends.map((f) => [f.name, f.groups[0]]), [['א', '5'], ['ג', '1']]);
});
test('upsertFriend rename onto an existing name leaves one friend', () => {
  const r = upsertFriend([F('א'), F('ב')], { name: 'ב', groups: ['7'] }, 'א');
  assert.deepEqual(r.friends.map((f) => [f.name, f.groups[0]]), [['ב', '7']]);
});
test('upsertFriend refuses a 21st friend', () => {
  const many = Array.from({ length: 20 }, (_, i) => F(`f${i}`));
  const r = upsertFriend(many, { name: 'new', groups: ['1'] });
  assert.equal(r.friends.length, 20); assert.match(r.error, /עד 20/);
});

test('the unofficial-tool line lives once, inside the page footer', () => {
  const html = readFileSync('web/index.html', 'utf8');
  const foot = html.match(/<footer class="site-foot"[\s\S]*?<\/footer>/)?.[0] ?? '';
  assert.match(foot, /כלי עזר לא רשמי/);
  assert.match(foot, /legal\.html#terms/);
  assert.match(foot, /legal\.html#accessibility/);
  assert.equal(html.split('כלי עזר לא רשמי').length, 2);
});

import { routeOf, hashOf } from '../web/app.js';
test('routeOf: #me is the status page, everything else is the builder', () => {
  assert.equal(routeOf('#me'), 'me');
  for (const h of ['', '#', '#f=abc', '#b=abc', '#mex']) assert.equal(routeOf(h), 'plan');
});

test('routeOf: a pasted friend link lands on the builder', () => {
  assert.equal(routeOf('#f=x'), 'plan');
});

test('normalize keeps integer grades 0-100 and drops the rest', () => {
  const s = normalize({ v: 1, grades: { a: 90, b: 101, c: '80', d: -1, e: 55.5 } });
  assert.deepEqual(s.grades, { a: 90 });
});

test('status page CSS is scoped to #me: the map lane div.ml.me must not inherit it', () => {
  const css = readFileSync(new URL('../web/style.css', import.meta.url), 'utf8');
  assert.deepEqual(css.match(/(^|[\s,}])\.me(?![\w-])/gm), null);
});

test('hashOf: the inverse of routeOf, so a cancelled backup keeps the current page', () => {
  for (const v of ['me', 'plan']) assert.equal(routeOf(hashOf(v)), v);
  assert.equal(hashOf(undefined), '');
});

test('normalize: blocks keep valid items, drop invalid ones individually, cap at 12', () => {
  const ok = { day: 2, start: '18:00', end: '20:00', label: 'עבודה' };
  const bad = [null, 'x', { ...ok, day: 0 }, { ...ok, day: 7 }, { ...ok, day: 1.5 }, { ...ok, start: '20:00' }, { ...ok, start: '06:30' }, { ...ok, end: '23:30' },
    { ...ok, end: '9am' }, { ...ok, start: '25:00', end: '26:00' }, { ...ok, label: 'x'.repeat(31) }, { ...ok, label: 5 }, { ...ok, label: undefined }];
  assert.deepEqual(normalize({ v: 1, constraints: { blocks: [...bad, ok, { ...ok, day: 6, label: '', extra: 1 }] } }).constraints.blocks, [ok, { ...ok, day: 6, label: '' }]);
  assert.equal(normalize({ v: 1, constraints: { blocks: Array(15).fill(ok) } }).constraints.blocks.length, 12);
  assert.deepEqual(normalize({ v: 1, constraints: { blocks: 'x' } }).constraints.blocks, []);
  assert.deepEqual(normalize({ v: 1 }).constraints.blocks, []);
  assert.equal(normalize({ v: 1, constraints: { blocks: [{ ...ok, start: '07:00', end: '23:00' }] } }).constraints.blocks.length, 1);
});

test('normalize: specDraft keeps one well-formed id (the data check is reconcileSpecs), yearIds keeps short strings; the rest is dropped', () => {
  assert.deepEqual(normalize({ v: 1, specDraft: ['solid'], yearIds: ['30112', 7, 'x'.repeat(30)] }).specDraft, ['solid']);
  assert.deepEqual(normalize({ v: 1, yearIds: ['30112', 7, 'x'.repeat(30)] }).yearIds, ['30112']);
  for (const bad of [['Nope!'], ['solid', 'flow'], [], 'solid', null]) assert.equal(normalize({ v: 1, specDraft: bad }).specDraft, null);
  assert.deepEqual(normalize({ v: 1, yearIds: 'x' }).yearIds, []);
});

test('the summary pills row scrolls on phones, so it is a named region the keyboard can reach (U2)', () => {
  const tag = readFileSync('web/index.html', 'utf8').match(/<div id="pills"[^>]*>/)[0];
  assert.ok(tag.includes('tabindex="0"') && tag.includes('role="region"') && /aria-label="[^"]+"/.test(tag), tag);
});

test('both pages declare an icon, so the browser does not fetch a missing /favicon.ico (U5)', () => {
  for (const f of ['web/index.html', 'web/legal.html']) assert.match(readFileSync(f, 'utf8'), /<link rel="icon" href="icon.svg" type="image\/svg\+xml">/, f);
  assert.match(readFileSync('web/icon.svg', 'utf8'), /^<svg /);
});

test('pdf.js and panzoom load from web/vendor with their licenses; only tesseract stays on a CDN (S1)', () => {
  const src = ['grade-import.js', 'ui-map.js', 'friend-scan.js'].map((f) => readFileSync(`web/${f}`, 'utf8')).join('\n');
  assert.deepEqual([...src.matchAll(/https:\/\/[^'"`\s]+/g)].map((m) => m[0]).filter((u) => !u.includes('tesseract.js@')), []);
  for (const f of ['pdfjs/pdf.min.mjs', 'pdfjs/pdf.worker.min.mjs', 'pdfjs/LICENSE', 'panzoom/panzoom.es.js', 'panzoom/LICENSE']) assert.ok(readFileSync(`web/vendor/${f}`).length > 500, f);
});

test('the deploy waits for a green test job (P9)', () => {
  const y = readFileSync('.github/workflows/deploy.yml', 'utf8');
  assert.match(y, /\n  test:\n[\s\S]*npm ci --ignore-scripts[\s\S]*npm test/);
  assert.match(y, /\n  deploy:\n    needs: test\n/);
});
