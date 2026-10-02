import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, progress, setStatus, amirnetExempt, cleanProfile, studyYear, modeFor, gradeAverage, englishOptions, specRule, validSpecs } from '../web/rules.js';
import { mini } from './fixtures/mini-data.mjs';

const me = { passed: ['Q0'], failed: { A: 1 } }; // example: failed physics

test('failed offered course is retake', () => {
  assert.equal(classify(mini(), me).statuses.A.status, 'retake');
});

test('direct and transitive dependents are blocked with a chain', () => {
  const { statuses } = classify(mini(), me);
  assert.equal(statuses.B.status, 'blocked');
  assert.deepEqual(statuses.B.blockedBy, ['A']);
  assert.match(statuses.B.reasons.join(' '), /פיזיקה-מכניקה \(נכשלת\)/);
  assert.equal(statuses.C.status, 'blocked');
  assert.match(statuses.C.reasons.join(' '), /דינמיקה ← פיזיקה-מכניקה \(נכשלת\)/);
});

test('parallel prerequisite gives conditional with the missing ids', () => {
  const s = classify(mini(), me).statuses.P;
  assert.equal(s.status, 'conditional');
  assert.deepEqual(s.missingParallel, [['Q']]);
});

test('unknown (outside program) prerequisite counts as satisfied', () => {
  const s = classify(mini(), me).statuses.X;
  assert.equal(s.status, 'available');
  assert.match(s.reasons.join(' '), /קורס הכנה פיזיקה/);
});

test('done and notOffered', () => {
  const { statuses } = classify(mini(), me);
  assert.equal(statuses.Q0.status, 'done');
  assert.equal(statuses.N.status, 'notOffered');
});

test('failure warnings follow the regulations', () => {
  assert.deepEqual(classify(mini(), me).warnings, []);
  assert.match(classify(mini(), { passed: [], failed: { A: 1, B: 1, C: 1 } }).warnings.join(), /על תנאי/);
  assert.match(classify(mini(), { passed: [], failed: { A: 2, B: 2 } }).warnings.join(), /הרחקה/);
  assert.match(classify(mini(), { passed: [], failed: { A: 3 } }).warnings.join(), /11\.5\.2/);
});

test('mixed prerequisite alternatives: resolved blocks, unresolved-only satisfies', () => {
  const data = mini();
  // Modify C's prereq to have both B (resolvable) and an old course name (unresolvable)
  data.courses.C.prereqs[0].anyOf = [
    { id: 'B', name: 'דינמיקה' },
    { id: null, name: 'דינמיקה ישנה' },
  ];
  // Without B passed, C should be blocked (not satisfied by the null alternative)
  assert.equal(classify(data, me).statuses.C.status, 'blocked');
  // With B passed, C should be available (satisfied by B)
  const withB = { passed: ['B'], failed: {} };
  assert.equal(classify(data, withB).statuses.C.status, 'available');
});

test('progress counts passed credits of earlier-year mandatory lists', () => {
  // studyYear = 2027 - 2026 + 1 = 2, so only the year-1 list counts: required 10, earned Q0 = 5
  assert.deepEqual(progress(mini(), me), { earned: 5, required: 10, ratio: 0.5 });
});

test('blocked reasons are deduped when two prereqs share their first alternative', () => {
  const data = mini();
  data.courses.B.prereqs.push({ kind: 'קדם', anyOf: [{ id: 'A', name: 'פיזיקה-מכניקה' }] });
  const s = classify(data, me).statuses.B;
  assert.equal(s.blockedBy.length, 2);
  assert.equal(s.reasons.length, 1);
});

test('blocked chain lists every blocker of an intermediate course, not just the first', () => {
  const data = mini();
  data.courses.B.prereqs.push({ kind: 'קדם', anyOf: [{ id: 'Q', name: 'משוואות' }] });
  assert.match(classify(data, me).statuses.C.reasons.join(' '), /דינמיקה ← פיזיקה-מכניקה \(נכשלת\) \+ משוואות/);
});

test('retake keeps its corequisite: tagged with the parallel course, like a first attempt', () => {
  const failedP = { passed: ['Q0'], failed: { P: 1 } };
  const s = classify(mini(), failedP).statuses.P;
  assert.equal(s.status, 'retake');
  assert.deepEqual(s.missingParallel, [['Q']]);
  assert.match(s.reasons.join(' '), /רק יחד עם משוואות/);
  const met = classify(mini(), { ...failedP, passed: ['Q0', 'Q'] }).statuses.P;
  assert.equal(met.status, 'retake');
  assert.equal(met.missingParallel, undefined);
});

test('passing a course keeps its failures and they still count toward the regulations', () => {
  const s = { passed: [], failed: { A: 2 } };
  setStatus(s, 'A', 'passed');
  assert.deepEqual([s.passed, s.failed], [['A'], { A: 2 }]);
  assert.equal(classify(mini(), s).statuses.A.status, 'done');
  assert.match(classify(mini(), { ...s, failed: { A: 2, B: 1 } }).warnings.join(), /על תנאי/);
  setStatus(s, 'A', 'failed');
  assert.deepEqual([s.passed, s.failed], [[], { A: 2 }]);
  setStatus(s, 'A', 'none');
  assert.deepEqual(s.failed, {});
  setStatus(s, 'B', 'failed');
  assert.deepEqual(s.failed, { B: 1 });
});

test('expulsion replaces probation instead of showing both', () => {
  assert.equal(classify(mini(), { passed: [], failed: { A: 3 } }).warnings.length, 1);
  const w = classify(mini(), { passed: [], failed: { A: 2, B: 2 } }).warnings;
  assert.equal(w.length, 1);
  assert.match(w[0], /11\.5\.1/);
});

test('amirnetExempt boundaries', () => {
  const ids = (n) => ['6000', '6001', '6002', '6003'].slice(0, n);
  for (const [score, n] of [[84, 0], [85, 1], [99, 1], [100, 2], [119, 2], [120, 3], [133, 3], [134, 4]]) assert.deepEqual(amirnetExempt(score), ids(n), String(score));
  assert.deepEqual(amirnetExempt(110), ['6000', '6001']);
  assert.deepEqual(amirnetExempt(null), []);
});

const english = () => {
  const c = (id, prev) => ({ name: id, credits: 0, offered: true, prereqs: prev ? [{ kind: 'קדם', anyOf: [{ id: prev, name: prev }] }] : [], groups: [] });
  return { year: 2027, startYear: 2026, semester: 'א', lists: [{ name: 'קורסי חובה לימודי אנגלית', minCredits: 0, courses: ['6000', '6001', '6002', '6003'] }],
    courses: { 6000: c('6000'), 6001: c('6001', '6000'), 6002: c('6002', '6001'), 6003: c('6003', '6002') } };
};

test('amirnet 110: 6000/6001 exempt, 6002 unblocked; done wins over exempt', () => {
  const { statuses } = classify(english(), { passed: [], failed: {}, profile: { year: null, amirnet: 110 } });
  assert.deepEqual([statuses[6000].status, statuses[6001].status], ['exempt', 'exempt']);
  assert.equal(statuses[6000].reasons[0], 'פטור (ציון אמירנט)');
  assert.equal(statuses[6002].status, 'available');
  assert.equal(statuses[6003].status, 'blocked');
  assert.equal(classify(english(), { passed: ['6000'], failed: {}, profile: { amirnet: 110 } }).statuses[6000].status, 'done');
  assert.equal(classify(english(), { passed: [], failed: {} }).statuses[6002].status, 'blocked');
});

test('profile year overrides the cohort-derived study year; cleanProfile drops bad values', () => {
  const d = english();
  assert.equal(studyYear(d, {}), 2);
  assert.equal(studyYear(d, { profile: { year: 3 } }), 3);
  assert.deepEqual(cleanProfile({ year: 5, amirnet: 49 }), { year: null, amirnet: null, specs: [], summer: false });
  assert.deepEqual(cleanProfile({ year: 4, amirnet: 150.5 }), { year: 4, amirnet: null, specs: [], summer: false });
});

test('cleanProfile specs: shape only (1-2 distinct short ids); which areas and how many is validSpecs against the data', () => {
  const sp = (specs) => cleanProfile({ specs }).specs;
  assert.deepEqual(sp(['solid', 'flow']), ['solid', 'flow']);
  assert.deepEqual(sp(['vehicle']), ['vehicle']);
  assert.deepEqual(sp(['solid', 'solid']), []);
  assert.deepEqual(sp(['solid', 'flow', 'mech']), []);
  assert.deepEqual(sp([]), []);
  assert.deepEqual(sp(['Bad id!']), []);
  assert.deepEqual(sp(['x'.repeat(21)]), []);
  for (const bad of [undefined, null, 'solid', 'solid,flow', { 0: 'solid', 1: 'flow', length: 2 }, 7, [{}, 'flow']]) assert.deepEqual(sp(bad), []);
  assert.deepEqual(cleanProfile().specs, [], 'no argument');
  assert.deepEqual(cleanProfile({ amirnet: 100 }), { year: null, amirnet: 100, specs: [], summer: false }, 'partial callers keep working');
});

test('validSpecs: pick count and standalone areas come from the data; no rule in the data is the mechanical rule', () => {
  const area = (id) => ({ id, name: id });
  const mech = { specializations: ['solid', 'flow', 'mech', 'vehicle', 'materials', 'aero'].map(area) };
  assert.deepEqual(specRule(mech), { pick: 2, alone: ['vehicle'] });
  assert.deepEqual(validSpecs(mech, ['solid', 'flow']), ['solid', 'flow']);
  assert.deepEqual(validSpecs(mech, ['aero', 'solid']), ['solid', 'aero'], 'dataset order');
  assert.deepEqual(validSpecs(mech, ['vehicle']), ['vehicle']);
  assert.deepEqual(validSpecs(mech, ['vehicle', 'materials']), ['vehicle', 'materials']);
  for (const bad of [['solid'], ['solid', 'solid'], ['solid', 'flow', 'mech'], ['solid', 'nope'], ['nope'], [], null, 'solid']) assert.deepEqual(validSpecs(mech, bad), [], String(bad));
  const ee = { specializations: ['comm', 'signals', 'computers', 'power'].map(area), specRule: { pick: 2, alone: ['power'] } };
  assert.deepEqual(validSpecs(ee, ['power']), ['power']);
  assert.deepEqual(validSpecs(ee, ['vehicle']), [], 'vehicle is not an electrical area');
  assert.deepEqual(validSpecs(ee, ['comm']), [], 'one ordinary area is not a complete choice');
  const sw = { specializations: ['tech', 'mobile', 'cyber', 'ml'].map(area), specRule: { pick: 1 } };
  assert.deepEqual(validSpecs(sw, ['cyber']), ['cyber']);
  assert.deepEqual(validSpecs(sw, ['cyber', 'ml']), [], 'software picks one');
  assert.deepEqual(validSpecs(mech, ['cyber']), [], 'an id from another program does not survive');
  assert.deepEqual(validSpecs({ specializations: [] , specRule: { pick: 0 } }, []), [], 'no areas: nothing to choose');
});

test('cleanProfile summer: only exactly true', () => {
  assert.equal(cleanProfile({ summer: true }).summer, true);
  for (const v of [1, 'true', 'yes', [], {}, null, undefined, false, 0]) assert.equal(cleanProfile({ summer: v }).summer, false);
});

test('modeFor: choice wins, retake is must, year list optional, others no, non-candidates null', () => {
  assert.equal(modeFor('available', 'no', true), 'no');
  assert.equal(modeFor('retake', undefined, false), 'must');
  assert.equal(modeFor('available', undefined, true), 'optional');
  assert.equal(modeFor('conditional', undefined, false), 'no');
  assert.equal(modeFor('blocked', 'must', true), null);
  assert.equal(modeFor('done', undefined, true), null);
});

// Year view: C1 (retake or available in א׳), C2 needs C1 (ב׳ only), C3 needs C2, C4 needs C1 but is א׳-only.
import { withAfterA } from '../web/rules.js';
const yearData = () => {
  const c = (name, semesters, prev) => ({ name, credits: 3, offered: semesters.length > 0, semesters, groups: [], prereqs: prev ? [{ kind: 'קדם', anyOf: [{ id: prev, name: prev }] }] : [] });
  return { year: 2027, startYear: 2026, semester: 'שנה', lists: [], courses: { C1: c('C1', ['א', 'ב']), C2: c('C2', ['ב'], 'C1'), C3: c('C3', ['ב'], 'C2'), C4: c('C4', ['א'], 'C1') } };
};
const st = (extra = {}) => ({ passed: [], failed: {}, ...extra });
const run = (state, data = yearData()) => withAfterA(data, state, classify(data, state)).statuses;

test('withAfterA: a course whose prerequisite is available or a retake in א׳ is afterA, with its names', () => {
  for (const s of [st(), st({ failed: { C1: 1 } })]) {
    const r = run(s);
    assert.equal(r.C2.status, 'afterA');
    assert.deepEqual(r.C2.reasons, ['אפשר בסמסטר ב׳ אחרי C1']);
    assert.equal(r.C3.status, 'blocked'); // two steps away
    assert.equal(r.C4.status, 'blocked'); // not offered in ב׳
  }
});

test('withAfterA: passed prerequisite is plain available; prerequisite not offered in א׳ stays blocked; single semester untouched', () => {
  assert.equal(run(st({ passed: ['C1'] })).C2.status, 'available');
  const d = yearData();
  d.courses.C1.semesters = ['ב'];
  assert.equal(run(st(), d).C2.status, 'blocked');
  const single = { ...yearData(), semester: 'א' };
  const cls = classify(single, st());
  assert.equal(withAfterA(single, st(), cls), cls);
});

test('withAfterA is pure, and modeFor treats afterA like available', () => {
  const data = yearData(), state = st(), cls = classify(data, state);
  withAfterA(data, state, cls);
  assert.equal(cls.statuses.C2.status, 'blocked'); assert.deepEqual(state.passed, []);
  assert.equal(modeFor('afterA', undefined, true), 'optional');
  assert.equal(modeFor('afterA', undefined, false), 'no');
  assert.equal(modeFor('afterA', 'must', false), 'must');
});

test('gradeAverage weights by credits and ignores ungraded or not-passed courses', () => {
  const data = { courses: { a: { credits: 4 }, b: { credits: 2 }, c: { credits: 3 } } };
  const r = gradeAverage(data, { passed: ['a', 'b'], grades: { a: 90, b: 60, c: 100 } });
  assert.equal(r.avg, 80); assert.equal(r.credits, 6);
  assert.equal(gradeAverage(data, { passed: [], grades: {} }).avg, null);
});

test('englishOptions: levels in the data with their exempting score, exempt flag from the Amirnet score', () => {
  const data = { courses: { 6000: { name: 'א' }, 6001: { name: 'ב' }, 6003: { name: 'ד' } } }; // levels missing from the data are skipped
  assert.deepEqual(englishOptions(data, 100), [{ id: '6000', name: 'א', min: 85, exempt: true }, { id: '6001', name: 'ב', min: 100, exempt: true }, { id: '6003', name: 'ד', min: 134, exempt: false }]);
  assert.deepEqual(englishOptions(data, null).map((e) => e.exempt), [false, false, false]);
});

test('English without an Amirnet score: blocked levels say to enter it, and a doubled requirement is named once', () => {
  const eng = (id, name, pre) => ({ name, credits: 0, offered: true, groups: [], prereqs: pre.map((p) => ({ kind: 'קדם', anyOf: [{ id: p, name: 'טרום' }] })) });
  const d = { semester: 'א', courses: { 6000: { ...eng('6000', 'טרום', []), offered: false }, 6001: eng('6001', 'בסיסי', ['6000', '6000']), 6002: eng('6002', 'מתקדמים א', ['6001']) } };
  const st = classify(d, { passed: [], profile: { amirnet: null } }).statuses;
  assert.match(st[6001].reasons.at(-1), /הזינו ציון אמירנט/);
  assert.equal(st[6002].reasons[0], 'חסום: דורש בסיסי ← טרום (תקנון 7.4)');
  assert.equal(classify(d, { passed: [], profile: { amirnet: 90 } }).statuses[6001].status, 'available');
});

import { summerOnly } from '../web/rules.js';
test('summerOnly: a course not taught in א/ב but taught in summer points at the summer tab or the profile switch', () => {
  const st = () => ({ a: { status: 'notOffered', reasons: ['x'] }, b: { status: 'notOffered', reasons: ['x'] }, c: { status: 'available', reasons: [] } });
  const summer = { courses: { a: { offered: true }, b: { offered: false }, c: { offered: true } } };
  const on = summerOnly(st(), summer, true);
  assert.match(on.a.reasons[0], /נלמד רק בקיץ: תכננו/);
  assert.deepEqual(on.b.reasons, ['x']); assert.equal(on.c.status, 'available');
  assert.match(summerOnly(st(), summer, false).a.reasons[0], /סמנו "אני מתכנן\/ת סמסטר קיץ השנה"/);
  assert.deepEqual(summerOnly(st(), null, true).a.reasons, ['x'], 'no summer file: unchanged');
});

import { specLists, specCodes } from '../web/rules.js';
test('specLists: an area may have several mandatory and elective lists (core + seminar, extra electives)', () => {
  const data = { specRule: { pick: 1 }, courses: { a: {}, b: {}, c: {}, d: {} },
    lists: [{ code: 1, courses: ['a'] }, { code: 2, courses: ['b', 'c'] }, { code: 3, courses: ['c', 'd'] }],
    specializations: [{ id: 'x', name: 'X', mandatory: [1, 2], elective: [3] }] };
  assert.deepEqual(specCodes(data.specializations[0]).map((p) => p.join(':')), ['mandatory:1', 'mandatory:2', 'elective:3']);
  const sp = specLists(data, ['x']);
  assert.deepEqual([[...sp.mandatory], [...sp.elective], [...sp.all]], [['a', 'b', 'c'], ['d'], [1, 2, 3]]);
  assert.deepEqual([...specLists(data, []).mandatory], [], 'an area that is not chosen adds nothing');
});
