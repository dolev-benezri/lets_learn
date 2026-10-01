// Property test: searchYear invariants over random year fixtures. Failures print the seed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchYear } from '../web/solver-core.js';
import { classify, modeFor } from '../web/rules.js';

const SEEDS = 300;
// Same LCG as the brief, but exact: s * 1103515245 overflows 2^53 in plain JS floats and distinct seeds then collapse
// onto one sequence. The seed is hashed first so consecutive seeds do not start correlated.
const rnd = (seed) => {
  let s = Math.imul(seed + 1, 2654435761) >>> 1;
  const next = () => ((s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 2 ** 31);
  next(); next();
  return next;
};

// Fixture helpers (same shapes as solver.test.mjs).
const toM = (t) => +t.slice(0, 2) * 60 + +t.slice(3);
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const grp = (id, meetings) => ({ id, type: 'הרצאה', primary: true, full: false, linked: [], meetings, exams: [] });
const yc = (name, credits, groups, prereqs) => ({ name, credits, offered: groups.length > 0, prereqs, groups, exams: [] });
const semData = (semester, courses) => ({ year: 2027, startYear: 2026, semester, examsPublished: false, lists: [{ code: 1, name: "חובה שנה א'", minCredits: 0, courses: Object.keys(courses) }], courses });
const W = { progress: 3, freeDays: 1, compact: 1, timeWindow: 0, friends: 0, examSpread: 0 };

export function fixture(seed) {
  const r = rnd(seed);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = (a) => a[int(0, a.length - 1)];
  const n = int(5, 8);
  const ids = Array.from({ length: n }, (_, i) => `C${i}`);
  const credits = {}, offeredIn = {}, prereqs = {};
  ids.forEach((id, j) => {
    credits[id] = int(1, 4);
    offeredIn[id] = pick([['א'], ['ב'], ['א', 'ב']]);
    const list = [];
    for (let i = 0; i < j; i++) {
      if (r() < 0.25) {
        const anyOf = [{ id: ids[i], name: ids[i] }];
        if (i > 0 && r() < 0.3) anyOf.push({ id: ids[int(0, i - 1)], name: 'alt' }); // "either of two" prerequisite
        list.push({ kind: 'קדם', anyOf });
      } else if (r() < 0.06) {
        list.push({ kind: 'מקביל', anyOf: [{ id: ids[i], name: ids[i] }] });
      }
    }
    prereqs[id] = list;
  });
  const courses = { א: {}, ב: {} };
  for (const sem of ['א', 'ב']) {
    for (const id of ids) {
      const groups = [];
      if (offeredIn[id].includes(sem)) {
        for (let k = 0, gs = int(1, 3); k < gs; k++) {
          const meetings = [];
          for (let m = 0, ms = int(1, 2); m < ms; m++) {
            const start = 8 * 60 + 30 * int(0, 17); // 08:00..16:30
            const end = Math.min(18 * 60, start + 30 * int(2, 6));
            meetings.push({ day: int(1, 5), start: hhmm(start), end: hhmm(end), room: 'r' });
          }
          groups.push(grp(`${id}${sem}${k}`, meetings));
        }
      }
      courses[sem][id] = yc(id, credits[id], groups, prereqs[id]);
    }
  }
  const dataA = semData('א', courses.א), dataB = semData('ב', courses.ב);

  const choices = {};
  for (const id of ids) choices[id] = r() < 0.3 ? 'must' : 'optional';
  const passed = ids.filter(() => r() < 0.15);
  const semesterOf = {};
  for (const id of ids) if (r() < 0.12) semesterOf[id] = pick(['א', 'ב']);
  const state = { passed, failed: {}, choices, semesterOf, load: pick(['even', 'א', 'ב']) };
  const constraints = r() < 0.5 ? { maxCredits: int(3, 12) } : {};

  // A pin goes on a group the student can actually take there: course not passed, offered that semester, all of its
  // prerequisites (קדם and מקביל) already passed.
  const pins = [], pinned = []; // one pin per semester, never the same course twice
  if (r() < 0.25) {
    const free = (id) => prereqs[id].every((p) => p.anyOf.some((a) => passed.includes(a.id)));
    for (const [sem, data] of [['א', dataA], ['ב', dataB]]) {
      const ok = ids.filter((id) => !passed.includes(id) && offeredIn[id].includes(sem) && free(id) && !pinned.includes(id));
      if (ok.length && r() < 0.6) { const id = pick(ok); pinned.push(id); pins.push(pick(data.courses[id].groups).id); }
    }
  }
  return { dataA, dataB, state, constraints, pins, ids, credits };
}

const clash = (x, y) => x.some((a) => y.some((b) => a.day === b.day && toM(a.start) < toM(b.end) && toM(b.start) < toM(a.end)));

function check(seed) {
  const { dataA, dataB, state, constraints, pins, ids } = fixture(seed);
  const { results } = searchYear({ dataA, dataB, state, yearList: new Set(), pins, constraints, weights: W, timeLimitMs: 2000 });
  const passed = new Set(state.passed);
  const groupMeetings = (data) => Object.fromEntries(Object.values(data.courses).flatMap((c) => c.groups.map((g) => [g.id, g.meetings])));
  const gmA = groupMeetings(dataA), gmB = groupMeetings(dataB);
  const courseOfGroup = (data, gid) => Object.keys(data.courses).find((id) => data.courses[id].groups.some((g) => g.id === gid));
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
  const mustIds = ids.filter((id) => modeFor(stA[id]?.status, state.choices[id], false) === 'must' || modeFor(stY[id]?.status, state.choices[id], false) === 'must');

  for (const p of results) {
    const A = p.a.courses, B = p.b?.courses ?? [];
    const gA = p.a.groups, gB = p.b?.groups ?? [];
    // 1. no time overlap inside a semester (interval comparison)
    for (const [gs, gm] of [[gA, gmA], [gB, gmB]]) {
      const byCourse = {};
      for (const g of gs) byCourse[g] = gm[g];
      const list = Object.values(byCourse);
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) assert.ok(!clash(list[i], list[j]), `overlap ${gs}`);
    }
    // 2. disjoint, and no duplicates inside a semester
    assert.equal(new Set(A).size, A.length, 'duplicate course in א');
    assert.equal(new Set(B).size, B.length, 'duplicate course in ב');
    assert.deepEqual(A.filter((id) => B.includes(id)), [], 'course in both semesters');
    // 3. קדם: א׳ needs passed; ב׳ needs passed + א׳
    const hard = (data, id) => data.courses[id].prereqs.filter((q) => q.kind === 'קדם');
    for (const id of A) for (const q of hard(dataA, id)) assert.ok(q.anyOf.some((x) => passed.has(x.id)), `${id} in א without prerequisite`);
    for (const id of B) for (const q of hard(dataB, id)) assert.ok(q.anyOf.some((x) => passed.has(x.id) || A.includes(x.id)), `${id} in ב without prerequisite`);
    // 4. מקביל: passed, or an earlier semester, or the same semester
    for (const id of A) for (const q of dataA.courses[id].prereqs.filter((x) => x.kind === 'מקביל')) assert.ok(q.anyOf.some((x) => passed.has(x.id) || A.includes(x.id)), `${id} in א without parallel`);
    for (const id of B) for (const q of dataB.courses[id].prereqs.filter((x) => x.kind === 'מקביל')) assert.ok(q.anyOf.some((x) => passed.has(x.id) || A.includes(x.id) || B.includes(x.id)), `${id} in ב without parallel`);
    // 5. group ids exist in their semester and belong to a chosen course
    for (const g of gA) assert.ok(g in gmA, `א group ${g} unknown`);
    for (const g of gB) assert.ok(g in gmB, `ב group ${g} unknown`);
    for (const g of gA) assert.ok(A.includes(courseOfGroup(dataA, g)), `group ${g} not of a chosen א course`);
    for (const g of gB) assert.ok(B.includes(courseOfGroup(dataB, g)), `group ${g} not of a chosen ב course`);
    // 6. pins land in their semester; semesterOf is respected (a pin wins over it)
    for (const g of pins) assert.ok((semOfPin(g) === 'א' ? gA : gB).includes(g), `pin ${g} missing from ${semOfPin(g)}`);
    for (const id of ids) {
      const want = wantSem(id);
      if (want === 'א') assert.ok(!B.includes(id), `${id} forced to א but in ב`);
      if (want === 'ב') assert.ok(!A.includes(id), `${id} forced to ב but in א`);
    }
    // 7. every must course is placed or reported missing; missing is not placed
    for (const id of mustIds) assert.ok(A.includes(id) || B.includes(id) || p.missing.includes(id), `must ${id} neither placed nor missing`);
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
  assert.ok(withResults > SEEDS / 2, `only ${withResults}/${SEEDS} fixtures produced a plan: the generator is too tight to test anything`);
});
