import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, progress, setStatus, amirnetExempt, cleanProfile, studyYear, modeFor, gradeAverage } from '../web/rules.js';
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
  assert.deepEqual(cleanProfile({ year: 5, amirnet: 49 }), { year: null, amirnet: null });
  assert.deepEqual(cleanProfile({ year: 4, amirnet: 150.5 }), { year: 4, amirnet: null });
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
