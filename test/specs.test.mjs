import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { specLists } from '../web/rules.js';
import { asideIds, progressInfo, progressHtml } from '../web/ui-map.js';
import { app, candidateMode, yearCourses } from '../web/app.js';

// Areas a and b plus vehicle with its alone-only extra. `shared` is an elective of both a and b; `am2` is mandatory and also sits in an elective list; `ghost` is in no course table.
const L = (code, name, courses, minCredits = 0) => ({ code, name, courses, minCredits });
const IDS = ['y', 'am1', 'am2', 'ae1', 'shared', 'bm', 'be1', 'vm', 've', 'vx', 'z'];
const mk = (extra = {}) => ({
  specializations: [{ id: 'a', mandatory: 2, elective: 3 }, { id: 'b', mandatory: 4, elective: 5 }, { id: 'vehicle', mandatory: 6, elective: 7, aloneExtra: 8 }],
  lists: [L(1, "קורסי חובה שנה ג'", ['y'], 14), L(2, 'התמחות א-חובה', ['am1', 'am2'], 6), L(3, 'התמחות א-בחירה', ['ae1', 'shared', 'am2']), L(4, 'התמחות ב-חובה', ['bm'], 3), L(5, 'התמחות ב-בחירה', ['be1', 'shared', 'ghost']),
    L(6, 'התמחות רכב-חובה', ['vm'], 3), L(7, 'התמחות רכב-בחירה', ['ve']), L(8, 'חובה רכב לבוחרי ללא התמחות נוספת', ['vx'], 3)],
  courses: Object.fromEntries(IDS.map((k) => [k, { name: k, credits: 3, offered: true, prereqs: [], groups: [] }])),
  degree: { total: 23, specCredits: 9 }, startYear: 2026, year: 2027, ...extra });
const done = (...ids) => Object.fromEntries(ids.map((id) => [id, { status: 'done' }]));
const sorted = (s) => [...s].sort();

test('specLists: two areas give their mandatory and elective courses, a course in several lists once, mandatory wins over elective', () => {
  const sp = specLists(mk(), ['a', 'b']);
  assert.deepEqual(sorted(sp.mandatory), ['am1', 'am2', 'bm']);
  assert.deepEqual(sorted(sp.elective), ['ae1', 'be1', 'shared'], 'am2 is mandatory only; ghost is not in data.courses');
  assert.deepEqual(sorted(sp.chosen), [2, 3, 4, 5]);
  assert.deepEqual(sorted(sp.all), [2, 3, 4, 5, 6, 7, 8]);
});

test('specLists: vehicle alone adds its extra mandatory list, vehicle with another area does not, nothing chosen gives empty sets', () => {
  const d = mk(), alone = specLists(d, ['vehicle']);
  assert.deepEqual(sorted(alone.mandatory), ['vm', 'vx']);
  assert.deepEqual(sorted(alone.elective), ['ve']);
  assert.deepEqual(sorted(alone.chosen), [6, 7, 8]);
  const pair = specLists(d, ['a', 'vehicle']);
  assert.deepEqual(sorted(pair.mandatory), ['am1', 'am2', 'vm'], 'no vx: it is mandatory for vehicle alone only');
  assert.deepEqual(sorted(pair.elective), ['ae1', 'shared', 've']);
  assert.ok(!pair.chosen.has(8) && pair.all.has(8));
  for (const none of [specLists(d, []), specLists(d), specLists({ lists: [], courses: {} }, ['a'])]) assert.ok(!none.mandatory.size && !none.elective.size && !none.chosen.size);
  assert.equal(specLists(d, []).all.size, 7);
});

test('specLists on the real data: vehicle alone requires 30343, a pair does not, no mandatory course is also an elective', () => {
  const d = JSON.parse(readFileSync(new URL('../web/data/afeka/2027-1/30-2026.json', import.meta.url), 'utf8'));
  assert.ok(specLists(d, ['vehicle']).mandatory.has('30343'));
  assert.ok(!specLists(d, ['solid', 'vehicle']).mandatory.has('30343'));
  for (const pick of [['vehicle'], ['solid', 'flow'], ['mech', 'aero']]) { const sp = specLists(d, pick); for (const id of sp.mandatory) assert.ok(!sp.elective.has(id), id); }
  assert.equal(specLists(d, ['solid', 'flow']).chosen.size, 4);
});

test('asideIds: with no area chosen every specialization course is aside, with areas chosen only the others are (mandatory is required, electives are the pool)', () => {
  const d = mk();
  assert.deepEqual(sorted(asideIds(d, {})), sorted(IDS.filter((id) => id !== 'y')), 'none: all of them (and the unlisted z)');
  assert.deepEqual(sorted(asideIds(d, {}, {}, ['a', 'b'])), ['ve', 'vm', 'vx', 'z']);
  assert.deepEqual(sorted(asideIds(d, {}, {}, ['vehicle'])), ['ae1', 'am1', 'am2', 'be1', 'bm', 'shared', 'z']);
  assert.deepEqual(sorted(asideIds(d, done('vm'), { ve: 'optional' }, ['a', 'b'])), ['vx', 'z'], 'passed or chosen courses of another area stay');
});

test('asideIds on the real data: 30343 is aside until vehicle alone is chosen; the chosen areas leave no aside course among their lists', () => {
  const d = JSON.parse(readFileSync(new URL('../web/data/afeka/2027-1/30-2026.json', import.meta.url), 'utf8'));
  assert.ok(asideIds(d, {}).includes('30343') && asideIds(d, {}, {}, ['solid', 'vehicle']).includes('30343') && !asideIds(d, {}, {}, ['vehicle']).includes('30343'));
  const sp = specLists(d, ['solid', 'flow']), aside = new Set(asideIds(d, {}, {}, ['solid', 'flow']));
  for (const id of [...sp.mandatory, ...sp.elective]) assert.ok(!aside.has(id), id);
});

test('progressInfo: no area chosen still reserves the specialization credits; a passed specialization course counts once, up to the cap', () => {
  const d = mk();
  assert.deepEqual(progressInfo(d, {}), { total: 23, done: 0, planned: 0, adds: 0, specLeft: null });
  assert.equal(progressInfo(d, done('shared')).done, 3, 'shared is in two lists but counts once');
  assert.equal(progressInfo(d, done('shared', 'am1')).done, 6);
  assert.equal(progressInfo(d, done('shared', 'am1', 'vm', 'bm', 'vx')).done, 9, 'capped at specCredits');
  assert.equal(progressInfo(d, done('y'), new Set(['am1'])).done, 3, 'the year list counts 3 of its 14');
  assert.deepEqual(progressInfo(d, done('am1'), new Set(['ae1', 'z'])), { total: 23, done: 3, planned: 3, adds: 6, specLeft: null });
});

test('progressInfo: two areas count only their own mandatory and elective courses, planned credits fill what the done ones leave', () => {
  const d = mk(), two = ['a', 'b'];
  assert.deepEqual(progressInfo(d, done('am1', 'shared', 'vm'), new Set(['bm', 'vm', 've']), two), { total: 23, done: 6, planned: 3, adds: 6, specLeft: 3 }, 'vm and ve belong to another area: not counted, bm is');
  assert.deepEqual(progressInfo(d, done('am1', 'am2', 'ae1', 'bm'), new Set(['be1']), two), { total: 23, done: 9, planned: 0, adds: 3, specLeft: 0 }, 'done 12 capped at 9, nothing left for the plan');
  assert.equal(progressInfo(d, done('am2'), new Set(), two).specLeft, 6, 'am2 is in two lists of area a: once');
});

test('progressInfo: vehicle alone counts 30121, the extra and its electives, not another area', () => {
  const d = mk(), v = ['vehicle'];
  assert.deepEqual(progressInfo(d, done('vx', 've', 'am1'), new Set(['vm']), v), { total: 23, done: 6, planned: 3, adds: 3, specLeft: 3 });
  assert.equal(progressInfo(d, done('vx'), new Set(), ['a', 'vehicle']).done, 0, 'vx is not part of a pair with vehicle');
});

test('progressInfo on the real data: 160 in total, 133 of it outside the specializations', () => {
  const d = JSON.parse(readFileSync(new URL('../web/data/afeka/2027-1/30-2026.json', import.meta.url), 'utf8'));
  const p = progressInfo(d, {}, new Set(), ['solid', 'flow']);
  assert.deepEqual([p.total, p.done, p.specLeft], [160, 0, 27]);
  const sp = specLists(d, ['solid', 'flow']), all = Object.fromEntries([...sp.mandatory, ...sp.elective].map((id) => [id, { status: 'done' }]));
  const q = progressInfo(d, all, new Set(), ['solid', 'flow']);
  assert.ok(q.done >= 27 && q.specLeft === 0, 'every course of both areas is done: the part is capped at 27');
});

test('progressHtml: the remaining specialization credits when areas are chosen, a call to choose one from year 2 on when none is', () => {
  const prog = { total: 160, done: 40, planned: 0, adds: 0, specLeft: 12.5 };
  const withSpec = progressHtml({ prog, opened: 0, year: 3, specs: ['solid', 'flow'] });
  assert.ok(withSpec.includes('נותרו <b><bdi>12.5</bdi></b> נ״ז מקורסי ההתמחות') && !withSpec.includes('href="#me"'));
  const none = { prog: { ...prog, specLeft: null }, opened: 0, specs: [] };
  assert.ok(progressHtml({ ...none, year: 2 }).includes('href="#me"') && progressHtml({ ...none, year: 2 }).includes('בחרו התמחות ב״המצב שלי״ כדי לראות את קורסי החובה שלה'));
  assert.ok(!progressHtml({ ...none, year: 1 }).includes('href="#me"') && !progressHtml({ ...none, year: 1 }).includes('נותרו'));
});

test('yearCourses / candidateMode: from year 3 the chosen areas courses are optional candidates, earlier years and other areas are not', () => {
  const d = mk({ lists: [...mk().lists, L(9, "קורסי חובה שנה ב'", ['z'])] });
  const setup = (year, specs, choices = {}) => {
    app.data = d; app.state = { profile: { year, specs }, choices };
    app.cls = { statuses: Object.fromEntries(IDS.map((id) => [id, { status: 'available' }])) };
  };
  setup(3, ['a', 'b']);
  assert.deepEqual(sorted(yearCourses()), sorted(['y', 'am1', 'am2', 'ae1', 'shared', 'bm', 'be1']));
  for (const id of ['y', 'am1', 'ae1', 'shared', 'be1', 'bm']) assert.equal(candidateMode(id), 'optional', id);
  for (const id of ['vm', 've', 'vx', 'z']) assert.equal(candidateMode(id), 'no', id);
  setup(4, ['vehicle']);
  for (const id of ['vm', 'vx', 've']) assert.equal(candidateMode(id), 'optional', id);
  assert.equal(candidateMode('am1'), 'no');
  setup(3, []);
  assert.equal(candidateMode('am1'), 'no', 'no area chosen: nothing extra');
  setup(2, ['a', 'b']);
  assert.deepEqual(yearCourses(), ['z']);
  assert.equal(candidateMode('am1'), 'no', 'year 2 is unchanged');
  setup(3, ['a', 'b'], { am1: 'must', ae1: 'no' });
  assert.deepEqual([candidateMode('am1'), candidateMode('ae1')], ['must', 'no'], 'the student\'s own choice still wins');
});
