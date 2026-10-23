// scripts/check-real.mjs: the data rules (layer 2) on synthetic cases and on a 3-program sample of the real data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dataRules, crossProgram, oracle, checkPlan, checkYearPlan, checkFile, bestCredits, yearOrder } from '../scripts/check-real.mjs';
import { mini } from './fixtures/mini-data.mjs';
import { fixture } from './fixtures/solver-data.mjs';
import { search, showWeights } from '../web/solver-core.js';
import { classify, modeFor } from '../web/rules.js';

const req = (...ids) => ({ kind: 'קדם', anyOf: ids.map((id) => ({ id, name: id ?? 'outside' })) });
const c = (...prereqs) => ({ name: 'c', credits: 3, offered: true, prereqs, groups: [{ id: 'g' }] });
const ds = (courses, lists = []) => ({ courses, lists });
const bad = (d) => dataRules(d, 'f.json').errors.map((e) => e.match(/course (\S+)/)?.[1] ?? e).sort();

test('a requirement on a course the file does not have, and a course requiring itself, are errors', () => {
  assert.equal(dataRules(ds({ A: c(req('Z')) }), 'f.json').errors.length >= 1, true);
  assert.ok(dataRules(ds({ A: c(req('A')) }), 'f.json').errors.some((e) => /itself/.test(e)));
});
test('achievability is AND over requirements, OR inside one, a fixed point (not cycle reachability)', () => {
  assert.deepEqual(bad(ds({ A: c(req('B')), B: c(req('A')) })), ['A', 'B']);
  assert.deepEqual(bad(ds({ A: c(req('B')), B: c(req('A', 'C')), C: c() })), [], 'B can come through C');
  assert.deepEqual(bad(ds({ A: c(req('B')), B: c(req('C')), C: c(req('B')) })), ['A', 'B', 'C'], 'a cycle downstream');
  assert.deepEqual(bad(ds({ A: c(req('B')), B: c(req('C', 'D')), C: c(req('A')), D: c() })), [], 'a nested escape');
  assert.deepEqual(bad(ds({ A: c(req('B'), req('C')), B: c(), C: c(req('D')), D: c(req('C')) })), ['A', 'C', 'D'], 'one AND part fails');
  assert.deepEqual(bad(ds({ A: c(req('B', null)), B: c(req('A')) })), [], 'an outside alternative is a route');
});
test('a prerequisite only in a later year\'s mandatory list is unachievable, unless another alternative is earlier', () => {
  const lists = [{ code: 1, name: "חובה שנה א'", courses: ['A', 'E'] }, { code: 2, name: "חובה שנה ב'", courses: ['L'] }];
  assert.deepEqual(bad(ds({ A: c(req('L')), L: c(), E: c() }, lists)), ['A']);
  assert.deepEqual(bad(ds({ A: c(req('L', 'E')), L: c(), E: c() }, lists)), []);
  const onlyA = [{ code: 1, name: "חובה שנה א'", courses: ['A'] }];
  assert.deepEqual(bad(ds({ A: c(req('X')), X: c() }, onlyA)), [], 'a prerequisite in no year list: placement unknown, not an error');
});
test('the same id twice in one requirement is a warning, not an error', () => {
  const r = dataRules(ds({ A: c(req('B', 'B')), B: c() }), 'f.json');
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
});
test('crossProgram: a course whose prerequisites differ between programs is one warning', () => {
  const w = crossProgram([['1.json', ds({ A: c(req('B')), B: c() })], ['2.json', ds({ A: c(req('C')), C: c() })], ['3.json', ds({ A: c(req('B')), B: c() })]]);
  assert.equal(w.length, 1);
  assert.match(w[0], /A/);
});
test('the 3 sample programs have no data errors', () => {
  for (const f of ['2027-1/19-2026.json', '2027-1/20-2026.json', '2027-1/30-2026.json']) {
    const d = JSON.parse(readFileSync(new URL(`../web/data/afeka/${f}`, import.meta.url), 'utf8'));
    assert.deepEqual(dataRules(d, f).errors, [], f);
  }
});

// ---- layer 3: the solver and the record, against an oracle written from the spec ----
const rec = (s = {}) => ({ passed: [], failed: {}, exempt: [], outsideDone: [], profile: { year: 2, amirnet: null }, ...s });
test('oracle: mini() statuses from the fixture comment (A -> B -> C chain, P with Q, X outside, N not offered)', () => {
  assert.deepEqual(oracle(mini(), rec()), {
    A: 'available', Q0: 'available', B: 'blocked', C: 'blocked', P: 'conditional', Q: 'available', X: 'available', N: 'notOffered'
  });
  assert.equal(oracle(mini(), rec({ failed: { B: 1 } })).B, 'retake');
  assert.equal(oracle(mini(), rec({ passed: ['A'] })).B, 'available');
});
test('checkPlan: flags an overlap, a busy-time meeting and a missing corequisite; a retake may lack a prerequisite, not a corequisite', () => {
  const d = mini();
  assert.ok(checkPlan(d, rec(), { courses: ['A', 'Q'], groups: ['A1', 'A1/1', 'Q2'] }, {}).some((e) => /overlap/.test(e)));
  assert.ok(checkPlan(d, rec(), { courses: ['Q'], groups: ['Q1'] }, { blocks: [{ day: 1, start: '10:00', end: '11:00' }] }).some((e) => /busy/.test(e)));
  assert.ok(checkPlan(d, rec(), { courses: ['P'], groups: ['P1'] }, {}).some((e) => /corequisite/.test(e)));
  assert.deepEqual(checkPlan(d, rec(), { courses: ['P', 'Q'], groups: ['P1', 'Q1'] }, {}), []);
  assert.ok(checkPlan(d, rec(), { courses: ['B'], groups: ['B1'] }, {}).some((e) => /prerequisite/.test(e)), 'a first attempt needs A');
  assert.deepEqual(checkPlan(d, rec({ failed: { B: 1 } }), { courses: ['B'], groups: ['B1'] }, {}), [], 'a retake may (an exception)');
  assert.ok(checkPlan(d, rec({ failed: { P: 1 } }), { courses: ['P'], groups: ['P1'] }, {}).some((e) => /corequisite/.test(e)));
});
test('checkYearPlan: ב checks against the record plus א; a course twice is flagged', () => {
  const d = mini(),
    plan = (a, b) => ({ a: { courses: a, groups: [] }, b: { courses: b, groups: [] }, credits: { a: 0, b: 0 }, missing: [] });
  const sum = (ids) => ids.reduce((s, id) => s + d.courses[id].credits, 0);
  const p = (a, b) => ({ ...plan(a, b), credits: { a: sum(a), b: sum(b) } });
  assert.deepEqual(checkYearPlan({ dataA: d, dataB: d, state: rec(), plan: p(['A'], ['B']) }), []);
  assert.ok(checkYearPlan({ dataA: d, dataB: d, state: rec(), plan: p([], ['B']) }).some((e) => /prerequisite/.test(e)));
  assert.ok(checkYearPlan({ dataA: d, dataB: d, state: rec(), plan: p(['A'], ['A']) }).some((e) => /twice/.test(e)));
});
test('small cases: the solver\'s most-credits plan equals brute force over every feasible combination', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { dataA, state } = fixture(seed, { min: 3, max: 5 });
    const st = classify(dataA, state).statuses;
    const courses = Object.keys(dataA.courses)
      .map((id) => ({ id, mode: modeFor(st[id]?.status, 'optional', false) }))
      .filter((c) => c.mode === 'optional');
    const r = search({ data: dataA, courses, statuses: st, weights: showWeights({}, 'credits', []), topK: 1, timeLimitMs: 5000 });
    const got = (r.results[0]?.courses ?? []).reduce((s, id) => s + dataA.courses[id].credits, 0);
    assert.equal(got, bestCredits(dataA, courses, st), `seed ${seed}`);
  }
});
test('yearOrder: the order is recomputed from the data (not the plan\'s own totals or the solver\'s comparator)', () => {
  const cr = (n, ...prereqs) => ({ ...c(...prereqs), credits: n });
  const d = ds({ X: cr(5), Y: cr(3), K: cr(1, req('Y')), K2: cr(1, req('K')) });
  const p = (a, missing = [], claimed = { a: 0, b: 0 }) => ({ a: { courses: a }, b: { courses: [] }, credits: claimed, missing, unlocks: 0, score: 0 });
  const o = (rs, key) => yearOrder(d, d, { passed: [] }, rs, key).length;
  assert.equal(o([p(['X']), p(['Y'])], 'credits'), 0);
  assert.equal(o([p(['Y']), p(['X'])], 'credits'), 1, 'fewer credits first');
  assert.equal(o([p(['Y'], [], { a: 9, b: 0 }), p(['X'])], 'credits'), 1, 'a plan that claims 9 credits has 3');
  assert.equal(o([p(['X']), p(['Y'])], 'unlocks'), 1, 'Y opens K and K2, X opens nothing');
  assert.equal(o([p(['X'], ['M']), p(['Y'])], 'credits'), 1, 'a missing mandatory course ranks below');
  assert.equal(o([p(['Y']), p(['X'])], 'best'), 0, 'other keys are not checked');
});
test('sample: 19-2026, 20-2026, 30-2026 semester א pass the record, plan and metamorphic checks', () => {
  const t0 = Date.now();
  for (const f of ['2027-1/19-2026.json', '2027-1/20-2026.json', '2027-1/30-2026.json']) {
    const d = JSON.parse(readFileSync(new URL(`../web/data/afeka/${f}`, import.meta.url), 'utf8'));
    assert.deepEqual(checkFile(f, d, { scenarios: ['S1'] }), [], f);
  }
  assert.ok(Date.now() - t0 < 20000, `${Date.now() - t0} ms`);
});
