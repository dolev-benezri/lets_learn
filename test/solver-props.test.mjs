// Property test: searchYear invariants over random year fixtures. Failures print the seed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchYear } from '../web/solver-core.js';
import { classify, modeFor } from '../web/rules.js';
import { fixture, toM } from './fixtures/solver-data.mjs';

const SEEDS = 300;
const W = { progress: 3, freeDays: 1, compact: 1, timeWindow: 0, friends: 0, examSpread: 0 };

const clash = (x, y) =>
  x.some((a) => y.some((b) => a.day === b.day && toM(a.start) < toM(b.end) && toM(b.start) < toM(a.end)));

function check(seed) {
  const { dataA, dataB, state, constraints, pins, ids } = fixture(seed);
  const { results } = searchYear({
    dataA,
    dataB,
    state,
    yearList: new Set(),
    pins,
    constraints,
    weights: W,
    timeLimitMs: 2000
  });
  const passed = new Set(state.passed);
  const groupMeetings = (data) =>
    Object.fromEntries(Object.values(data.courses).flatMap((c) => c.groups.map((g) => [g.id, g.meetings])));
  const gmA = groupMeetings(dataA),
    gmB = groupMeetings(dataB);
  const courseOfGroup = (data, gid) =>
    Object.keys(data.courses).find((id) => data.courses[id].groups.some((g) => g.id === gid));
  const semOfPin = (p) => (p in gmA ? 'א' : 'ב');

  // A pin wins over semesterOf, which only applies to a course the student chose to move.
  const pinSem = {};
  for (const g of pins) pinSem[courseOfGroup(semOfPin(g) === 'א' ? dataA : dataB, g)] = semOfPin(g);
  const wantSem = (id) => pinSem[id] ?? state.semesterOf[id];

  // What counts as a must course for the year: classify/modeFor as the app uses them, where only א׳ candidates
  // (not forced into ב׳) can unlock a ב׳ course. A course blocked all year is not must; the course list shows it as blocked.
  const stA = classify(dataA, state).statuses;
  const cand = ids.filter((id) => wantSem(id) !== 'ב' && modeFor(stA[id]?.status, state.choices[id], false));
  const stY = classify(dataB, { ...state, passed: [...state.passed, ...cand] }).statuses;
  // A ב׳ pin makes its course must for the year (ruling, final review I1).
  const mustIds = ids.filter(
    (id) =>
      modeFor(stA[id]?.status, state.choices[id], false) === 'must' ||
      modeFor(stY[id]?.status, state.choices[id], false) === 'must' ||
      (pinSem[id] === 'ב' && modeFor(stY[id]?.status, state.choices[id], false))
  );

  for (const p of results) {
    const A = p.a.courses,
      B = p.b?.courses ?? [];
    const gA = p.a.groups,
      gB = p.b?.groups ?? [];
    // 1. no time overlap inside a semester (interval comparison)
    for (const [gs, gm] of [
      [gA, gmA],
      [gB, gmB]
    ]) {
      const byCourse = {};
      for (const g of gs) byCourse[g] = gm[g];
      const list = Object.values(byCourse);
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++) assert.ok(!clash(list[i], list[j]), `overlap ${gs}`);
    }
    // 2. disjoint, and no duplicates inside a semester
    assert.equal(new Set(A).size, A.length, 'duplicate course in א');
    assert.equal(new Set(B).size, B.length, 'duplicate course in ב');
    assert.deepEqual(
      A.filter((id) => B.includes(id)),
      [],
      'course in both semesters'
    );
    // 3. קדם: א׳ needs passed; ב׳ needs passed + א׳
    const hard = (data, id) => data.courses[id].prereqs.filter((q) => q.kind === 'קדם');
    for (const id of A)
      for (const q of hard(dataA, id))
        assert.ok(
          q.anyOf.some((x) => passed.has(x.id)),
          `${id} in א without prerequisite`
        );
    for (const id of B)
      for (const q of hard(dataB, id))
        assert.ok(
          q.anyOf.some((x) => passed.has(x.id) || A.includes(x.id)),
          `${id} in ב without prerequisite`
        );
    // 4. מקביל: passed, or an earlier semester, or the same semester
    for (const id of A)
      for (const q of dataA.courses[id].prereqs.filter((x) => x.kind === 'מקביל'))
        assert.ok(
          q.anyOf.some((x) => passed.has(x.id) || A.includes(x.id)),
          `${id} in א without parallel`
        );
    for (const id of B)
      for (const q of dataB.courses[id].prereqs.filter((x) => x.kind === 'מקביל'))
        assert.ok(
          q.anyOf.some((x) => passed.has(x.id) || A.includes(x.id) || B.includes(x.id)),
          `${id} in ב without parallel`
        );
    // 5. group ids exist in their semester and belong to a chosen course
    for (const g of gA) assert.ok(g in gmA, `א group ${g} unknown`);
    for (const g of gB) assert.ok(g in gmB, `ב group ${g} unknown`);
    for (const g of gA) assert.ok(A.includes(courseOfGroup(dataA, g)), `group ${g} not of a chosen א course`);
    for (const g of gB) assert.ok(B.includes(courseOfGroup(dataB, g)), `group ${g} not of a chosen ב course`);
    // 10. a full group only with includeFull, or when it is the pinned group itself
    for (const [gs, data] of [
      [gA, dataA],
      [gB, dataB]
    ]) {
      for (const g of gs) {
        const full = Object.values(data.courses).some((c) => c.groups.some((x) => x.id === g && x.full));
        assert.ok(!full || constraints.includeFull || pins.includes(g), `full group ${g} placed`);
      }
    }
    // 6. pins land in their semester; semesterOf is respected (a pin wins over it). An א׳ pin is in every plan; a ב׳ pin
    // the ב׳ search cannot honour is reported: its course is in missing (ruling, final review I1).
    for (const g of pins) {
      const ok =
        (semOfPin(g) === 'א' ? gA : gB).includes(g) ||
        (semOfPin(g) === 'ב' && p.missing.includes(courseOfGroup(dataB, g)));
      assert.ok(ok, `pin ${g} missing from ${semOfPin(g)}`);
    }
    for (const id of ids) {
      const want = wantSem(id);
      if (want === 'א') assert.ok(!B.includes(id), `${id} forced to א but in ב`);
      if (want === 'ב') assert.ok(!A.includes(id), `${id} forced to ב but in א`);
    }
    // 7. every must course is placed or reported missing; missing is not placed
    for (const id of mustIds)
      assert.ok(A.includes(id) || B.includes(id) || p.missing.includes(id), `must ${id} neither placed nor missing`);
    for (const id of p.missing) assert.ok(!A.includes(id) && !B.includes(id), `missing ${id} is placed`);
    for (const id of p.missing) assert.ok(mustIds.includes(id), `missing ${id} is not a must course`);
    // 8, 9. credits add up and respect the cap
    const sum = (data, cs) => cs.reduce((s, id) => s + data.courses[id].credits, 0);
    assert.equal(p.credits.a, sum(dataA, A), 'credits.a');
    assert.equal(p.credits.b, sum(dataB, B), 'credits.b');
    if (constraints.maxCredits) {
      assert.ok(p.credits.a <= constraints.maxCredits, `credits.a ${p.credits.a} > cap`);
      assert.ok(p.credits.b <= constraints.maxCredits, `credits.b ${p.credits.b} > cap`);
    }
  }
  return results.length;
}

test(`searchYear invariants hold on ${SEEDS} random fixtures`, () => {
  let withResults = 0;
  for (let seed = 1; seed <= SEEDS; seed++) {
    try {
      if (check(seed)) withResults++;
    } catch (e) {
      throw new Error(`seed ${seed}: ${e.message}`, { cause: e });
    }
  }
  assert.ok(
    withResults > SEEDS / 2,
    `only ${withResults}/${SEEDS} fixtures produced a plan: the generator is too tight to test anything`
  );
});
