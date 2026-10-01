import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meetingsMask, overlaps, buildOptions, forbiddenMask, unlockCounts, chainDepth, search, searchYear } from '../web/solver-core.js';
import { classify } from '../web/rules.js';
import { readFileSync, existsSync } from 'node:fs';
import { mini } from './fixtures/mini-data.mjs';

test('masks: 08:00-09:50 and 10:00-11:50 do not overlap; 09:30 start does', () => {
  const a = meetingsMask([{ day: 2, start: '08:00', end: '09:50' }]);
  assert.equal(overlaps(a, meetingsMask([{ day: 2, start: '10:00', end: '11:50' }])), false);
  assert.equal(overlaps(a, meetingsMask([{ day: 2, start: '09:30', end: '10:20' }])), true);
  assert.equal(overlaps(a, meetingsMask([{ day: 3, start: '08:00', end: '09:50' }])), false);
});

test('masks clamp meetings outside 07:00-23:00 and ignore missing days', () => {
  const m = meetingsMask([{ day: 1, start: '06:00', end: '23:30' }, { day: null, start: '08:00', end: '09:00' }]);
  assert.equal(m[1] >>> 0, 0xffffffff);
  assert.deepEqual(m.slice(2), [0, 0, 0, 0, 0]);
});

test('buildOptions pairs each primary with one linked tutorial', () => {
  const opts = buildOptions(mini().courses.A);
  assert.deepEqual(opts.map((o) => o.groups), [['A1', 'A1/1'], ['A1', 'A1/2'], ['A2']]);
  assert.deepEqual(opts[0].exams, ['2027-02-04']);
  assert.equal(opts[0].meetings.find((m) => m.group === 'A1/1').day, 3);
});

test('primary with no linked sub-groups still yields an option', () => {
  assert.deepEqual(buildOptions(mini().courses.B).map((o) => o.groups), [['B1']]);
});

test('full groups are skipped unless pinned or includeFull', () => {
  const Q = mini().courses.Q;
  assert.deepEqual(buildOptions(Q).map((o) => o.groups), [['Q1']]);
  assert.deepEqual(buildOptions(Q, { includeFull: true }).map((o) => o.groups), [['Q1'], ['Q2']]);
  assert.deepEqual(buildOptions(Q, { pins: ['Q2'] }).map((o) => o.groups), [['Q2']]);
});

test('full-group exemption only for the pinned group itself', () => {
  const data = mini();
  const A = data.courses.A;
  A.groups[1].full = true; // A1/1 is now full
  assert.deepEqual(buildOptions(A, { pins: ['A1'] }).map((o) => o.groups), [['A1', 'A1/2']]);
});

test('forbidden mask removes options (hard day off / window)', () => {
  const A = mini().courses.A;
  const f = forbiddenMask({ dayOff: [1], dayOffHard: true });
  assert.deepEqual(buildOptions(A, { forbidden: f }).map((o) => o.groups), [['A1', 'A1/1'], ['A1', 'A1/2']]);
  const w = forbiddenMask({ notBefore: '10:00', windowHard: true });
  assert.deepEqual(buildOptions(A, { forbidden: w }).map((o) => o.groups), [['A2']]);
});

test('unlockCounts is transitive', () => {
  const u = unlockCounts(mini());
  assert.equal(u.A, 2); // B, C
  assert.equal(u.B, 1);
  assert.equal(u.C, 0);
  assert.equal(u.Q, 0); // P only has a מקביל link to Q: it can be taken together, so Q blocks nothing
});

test('chainDepth is the longest קדם chain below a course', () => {
  const d = chainDepth(mini());
  assert.deepEqual([d.A, d.B, d.C, d.Q], [2, 1, 0, 0]);
  const real = new URL('../web/data/afeka/2027-1/30-2026.json', import.meta.url);
  if (existsSync(real)) {
    const r = chainDepth(JSON.parse(readFileSync(real, 'utf8')));
    assert.equal(r['90914'], 3);
    assert.equal(r['30137'], 1);
  }
});

const W0 = { friends: 0, progress: 0, freeDays: 0, compact: 0, timeWindow: 0, examSpread: 0 };
const me = { passed: ['Q0'], failed: { A: 1 } };
const run = (over = {}) => {
  const data = over.data ?? mini();
  return search({ data, statuses: classify(data, me).statuses, weights: W0, friends: [], constraints: {}, topK: 1000, ...over });
};

// Independent brute force: enumerate option products, reject overlaps by interval comparison.
function brute(data, courses) {
  const toM = (t) => +t.slice(0, 2) * 60 + +t.slice(3);
  const clash = (a, b) => a.meetings.some((x) => b.meetings.some((y) => x.day === y.day && toM(x.start) < toM(y.end) && toM(y.start) < toM(x.end)));
  let sets = [[]];
  for (const { id, mode } of courses) {
    const opts = buildOptions(data.courses[id]);
    const next = [];
    for (const s of sets) {
      if (mode === 'optional') next.push(s);
      for (const o of opts) if (!s.some((x) => clash(x, o))) next.push([...s, o]);
    }
    sets = next;
  }
  return sets.filter((s) => s.length).map((s) => s.flatMap((o) => o.groups).sort().join(',')).sort();
}

test('search finds exactly the valid combinations (vs brute force)', () => {
  const courses = [{ id: 'A', mode: 'must' }, { id: 'Q', mode: 'optional' }, { id: 'X', mode: 'must' }];
  const got = run({ courses, constraints: { examsSameDay: 'allow' } }).results.map((r) => [...r.groups].sort().join(',')).sort();
  assert.deepEqual(got, brute(mini(), courses));
});

test('exam same-day rule removes clashing exams when published', () => {
  const data = mini();
  data.courses.Q.groups[0].exams = [{ kind: 'בחינה', moed: 1, date: '2027-02-04', time: '09:00' }];
  const r = run({ data, courses: [{ id: 'A', mode: 'must' }, { id: 'Q', mode: 'must' }] });
  assert.equal(r.results.length, 0);
  assert.ok(r.diagnosis.length > 0);
});

test('conditional course only appears with its parallel course', () => {
  const r = run({ courses: [{ id: 'P', mode: 'optional' }, { id: 'Q', mode: 'optional' }], constraints: { examsSameDay: 'allow' } });
  for (const res of r.results) if (res.courses.includes('P')) assert.ok(res.courses.includes('Q'));
  assert.ok(r.results.some((res) => res.courses.includes('P')));
});

test('friends metric rewards shared groups and ignores unknown ids', () => {
  const friends = [{ name: 'דני', groups: ['A2', 'NOPE-123'], weight: 1, active: true }];
  const r = run({ courses: [{ id: 'A', mode: 'must' }], friends, weights: { ...W0, friends: 1 }, topK: 3 });
  assert.deepEqual(r.results[0].groups, ['A2']);
  assert.equal(r.results[0].breakdown.friends, 1);
  assert.match(r.results[0].explanation, /1 קורסים עם דני/);
});

test('freeDays and pins', () => {
  const r = run({ courses: [{ id: 'A', mode: 'must' }], weights: { ...W0, freeDays: 1 }, topK: 1 });
  assert.deepEqual(r.results[0].groups, ['A2']); // 1 busy day beats 2
  const p = run({ courses: [{ id: 'A', mode: 'must' }], pins: ['A1/2'] });
  assert.deepEqual(p.results.map((x) => x.groups), [['A1', 'A1/2']]);
});

test('diagnosis names a course with no option left', () => {
  const r = run({ courses: [{ id: 'B', mode: 'must' }], constraints: { dayOff: [2], dayOffHard: true } });
  assert.equal(r.results.length, 0);
  assert.match(r.diagnosis[0], /דינמיקה/);
});

test('gaps: 08:00–09:50 and 11:00–12:50 on same day = 60 gap minutes', () => {
  const data = mini();
  data.courses.Y = { name: 'Test', credits: 1, offered: true, prereqs: [], groups: [
    { id: 'Y1', type: 'סופי-הרצאה', primary: true, lecturer: 'L', full: false, semester: 'א', linked: [],
      meetings: [{ day: 2, start: '08:00', end: '09:50', room: 'r' }, { day: 2, start: '11:00', end: '12:50', room: 'r' }],
      exams: [] },
  ] };
  const r = run({ data, courses: [{ id: 'Y', mode: 'must' }], weights: { ...W0, compact: 1 } });
  assert.equal(r.results[0].breakdown.compact, 1 - 60 / 600);
});

test('late slot 21:00–22:50 (bit 31): 660 gap minutes, capped at 600', () => {
  const data = mini();
  data.courses.Y = { name: 'Test', credits: 1, offered: true, prereqs: [], groups: [
    { id: 'Y1', type: 'סופי-הרצאה', primary: true, lecturer: 'L', full: false, semester: 'א', linked: [],
      meetings: [{ day: 2, start: '08:00', end: '09:50', room: 'r' }, { day: 2, start: '21:00', end: '22:50', room: 'r' }],
      exams: [] },
  ] };
  const r = run({ data, courses: [{ id: 'Y', mode: 'must' }], weights: { ...W0, compact: 1 } });
  assert.equal(r.results[0].breakdown.compact, 0);
});

test('consecutive late slots 21:00–21:50 and 22:00–22:50: no gap', () => {
  const data = mini();
  data.courses.Y = { name: 'Test', credits: 1, offered: true, prereqs: [], groups: [
    { id: 'Y1', type: 'סופי-הרצאה', primary: true, lecturer: 'L', full: false, semester: 'א', linked: [],
      meetings: [{ day: 2, start: '21:00', end: '21:50', room: 'r' }, { day: 2, start: '22:00', end: '22:50', room: 'r' }],
      exams: [] },
  ] };
  const r = run({ data, courses: [{ id: 'Y', mode: 'must' }], weights: { ...W0, compact: 1 } });
  assert.ok(Math.abs(r.results[0].breakdown.compact - 1) < 0.01);
});

test('soft time window (notBefore not hard): 08:00–09:50 before 10:00 = 120 outside minutes', () => {
  const data = mini();
  data.courses.Y = { name: 'Test', credits: 1, offered: true, prereqs: [], groups: [
    { id: 'Y1', type: 'סופי-הרצאה', primary: true, lecturer: 'L', full: false, semester: 'א', linked: [],
      meetings: [{ day: 2, start: '08:00', end: '09:50', room: 'r' }],
      exams: [] },
  ] };
  const r = run({ data, courses: [{ id: 'Y', mode: 'must' }], constraints: { notBefore: '10:00' }, weights: { ...W0, timeWindow: 1 } });
  assert.equal(r.results[0].breakdown.timeWindow, 1 - 120 / 600);
});

test('examSpread: two moed-1 exams 3 days apart = 3/7', () => {
  const data = mini();
  data.courses.Y = { name: 'Test', credits: 1, offered: true, prereqs: [], groups: [
    { id: 'Y1', type: 'סופי-הרצאה', primary: true, lecturer: 'L', full: false, semester: 'א', linked: [],
      meetings: [{ day: 2, start: '08:00', end: '09:50', room: 'r' }],
      exams: [{ kind: 'בחינה', moed: 1, date: '2027-02-04', time: '09:00' }] },
  ] };
  data.courses.Z = { name: 'Test 2', credits: 1, offered: true, prereqs: [], groups: [
    { id: 'Z1', type: 'סופי-הרצאה', primary: true, lecturer: 'L', full: false, semester: 'א', linked: [],
      meetings: [{ day: 3, start: '08:00', end: '09:50', room: 'r' }],
      exams: [{ kind: 'בחינה', moed: 1, date: '2027-02-07', time: '09:00' }] },
  ] };
  const r = run({ data, courses: [{ id: 'Y', mode: 'must' }, { id: 'Z', mode: 'must' }], constraints: { examsSameDay: 'allow' }, weights: { ...W0, examSpread: 1 } });
  assert.ok(Math.abs(r.results[0].breakdown.examSpread - 3 / 7) < 0.01);
});

test('timeLimitMs: 0 → partial true on large search space', () => {
  const data = mini();
  // Add many optional courses to create a large search space
  for (let i = 0; i < 10; i++) {
    data.courses[`O${i}`] = { name: `Opt${i}`, credits: 1, offered: true, prereqs: [], groups: [
      { id: `O${i}1`, type: 'סופי-הרצאה', primary: true, lecturer: 'L', full: false, semester: 'א', linked: [],
        meetings: [{ day: ((i % 5) + 1), start: '08:00', end: '09:50', room: 'r' }], exams: [] },
    ] };
  }
  const courses = [{ id: 'A', mode: 'must' }, ...Array.from({ length: 10 }, (_, i) => ({ id: `O${i}`, mode: 'optional' }))];
  const r = search({ data, courses, statuses: classify(data, me).statuses, weights: W0, friends: [], constraints: {}, timeLimitMs: 0 });
  assert.equal(r.partial, true);
  if (!r.results.length) assert.match(r.diagnosis[0], /מגבלת הזמן/); // a timeout is not reported as "no solution"
});

const REAL = new URL('../web/data/afeka/2027-1/30-2026.json', import.meta.url);
test('real data: all year-2 available courses solve in < 1s with no overlaps', { skip: !existsSync(REAL) }, () => {
  const data = JSON.parse(readFileSync(REAL, 'utf8'));
  const y1 = data.lists.find((l) => l.name.includes("שנה א'")).courses;
  const state = { passed: y1.filter((id) => id !== '90903'), failed: { 90903: 1 } };
  const { statuses } = classify(data, state);
  const y2 = data.lists.find((l) => l.name.includes("שנה ב'")).courses;
  const courses = [{ id: '90903', mode: 'must' }, ...y2.filter((id) => ['available', 'conditional'].includes(statuses[id]?.status)).map((id) => ({ id, mode: 'optional' }))];
  const t = Date.now();
  const r = search({ data, courses, statuses, weights: { ...W0, progress: 1, compact: 1 }, friends: [], constraints: {} });
  assert.ok(Date.now() - t < 1000, `took ${Date.now() - t}ms`);
  assert.ok(r.results.length > 0);
  assert.equal(r.partial, false);
  for (const res of r.results) {
    const ms = res.groups.flatMap((gid) => Object.values(data.courses).flatMap((c) => c.groups).find((g) => g.id === gid).meetings);
    const toM = (t) => +t.slice(0, 2) * 60 + +t.slice(3);
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
      const [a, b] = [ms[i], ms[j]];
      assert.ok(!(a.day === b.day && toM(a.start) < toM(b.end) && toM(b.start) < toM(a.end)), 'overlap in result');
    }
    assert.ok(res.courses.includes('90903'));
  }
});

test('a pin forces its optional course into every result', () => {
  const r = run({ courses: [{ id: 'A', mode: 'optional' }, { id: 'Q0', mode: 'optional' }], pins: ['A2'], topK: 10 });
  assert.ok(r.results.length > 0);
  for (const res of r.results) assert.ok(res.groups.includes('A2'));
});

test('a 0-credit course that unlocks 3 courses outranks a 2-credit elective that unlocks nothing', () => {
  const data = mini();
  const g = (id) => ({ ...data.courses.A.groups[3], id, exams: [], meetings: [{ day: 1, start: '14:00', end: '15:50', room: 'r' }] }); // same slot: only one of Z0 / E fits
  data.courses.Z0 = { name: 'אנגלית', credits: 0, offered: true, prereqs: [], groups: [g('Z01')] };
  data.courses.E = { name: 'בחירה', credits: 2, offered: true, prereqs: [], groups: [g('E1')] };
  for (const k of ['K1', 'K2', 'K3']) data.courses[k] = { name: k, credits: 1, offered: true, prereqs: [{ kind: 'קדם', anyOf: [{ id: 'Z0', name: 'אנגלית' }] }], groups: [] };
  const r = run({ data, courses: [{ id: 'Z0', mode: 'optional' }, { id: 'E', mode: 'optional' }], weights: { ...W0, progress: 1 }, topK: 1 });
  assert.deepEqual(r.results[0].courses, ['Z0']);
});

test('results report how many distinct courses they unlock, and say so in the explanation', () => {
  const r = run({ courses: [{ id: 'A', mode: 'must' }, { id: 'B', mode: 'must' }] }); // A unlocks B, C; B unlocks C
  assert.ok(r.results.length > 0);
  for (const x of r.results) { assert.equal(x.unlocks, 1); assert.match(x.explanation, /פותחת קורס אחד להמשך/); } // B is chosen, so only C is ahead
  const none = run({ courses: [{ id: 'Q0', mode: 'must' }] }).results[0];
  assert.equal(none.unlocks, 0);
  assert.doesNotMatch(none.explanation, /פותחת/);
});

test('unlocks and unlockCounts leave out downstream courses that are already passed', () => {
  const statuses = { C: { status: 'done' }, A: { status: 'retake' } };
  const r = run({ courses: [{ id: 'A', mode: 'must' }], statuses }); // A unlocks B and C; C is already passed
  assert.ok(r.results.length > 0);
  for (const x of r.results) assert.equal(x.unlocks, 1);
  assert.equal(run({ courses: [{ id: 'A', mode: 'must' }] }).results[0].unlocks, 2);
  assert.equal(unlockCounts(mini()).A, 2);
  assert.equal(unlockCounts(mini(), ['C']).A, 1);
});

test('real data: pruning keeps results identical to the exhaustive search', { skip: !existsSync(REAL) }, () => {
  const data = JSON.parse(readFileSync(REAL, 'utf8'));
  const y1 = data.lists.find((l) => l.name.includes("שנה א'")).courses;
  const y2 = data.lists.find((l) => l.name.includes("שנה ב'")).courses;
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const scales = [0, 1, 3, 5];
  for (let t = 0; t < 12; t++) {
    const failed = rnd() < 0.5 ? { 90903: 1 } : {};
    const { statuses } = classify(data, { passed: y1.filter((id) => !failed[id]), failed });
    const cand = y2.filter((id) => ['available', 'conditional'].includes(statuses[id]?.status)).filter(() => rnd() < 0.6);
    const courses = [...Object.keys(failed).map((id) => ({ id, mode: 'must' })), ...cand.map((id) => ({ id, mode: rnd() < 0.2 ? 'must' : 'optional' }))];
    const weights = Object.fromEntries(['friends', 'progress', 'freeDays', 'compact', 'timeWindow', 'examSpread'].map((k) => [k, scales[Math.floor(rnd() * 4)]]));
    const constraints = { dayOff: rnd() < 0.5 ? [6] : [], notAfter: rnd() < 0.5 ? '18:00' : '' };
    const friends = rnd() < 0.5 ? [{ name: 'f', weight: 2, groups: Object.values(data.courses).flatMap((c) => c.groups.filter(() => rnd() < 0.1).map((g) => g.id)) }] : [];
    const args = { data, courses, statuses, weights, friends, constraints, timeLimitMs: 60000 };
    const a = search({ ...args, prune: false }), b = search(args);
    assert.deepEqual(b.results.map((r) => [r.groups.join(), r.score.toFixed(9)]), a.results.map((r) => [r.groups.join(), r.score.toFixed(9)]), `case ${t}`);
  }
});

test('real data: default state (12 optional year-2 courses) finishes without hitting the time limit', { skip: !existsSync(REAL) }, () => {
  const data = JSON.parse(readFileSync(REAL, 'utf8'));
  const y1 = data.lists.find((l) => l.name.includes("שנה א'")).courses;
  const { statuses } = classify(data, { passed: y1, failed: {} });
  const y2 = data.lists.find((l) => l.name.includes("שנה ב'")).courses;
  const courses = y2.filter((id) => ['available', 'conditional'].includes(statuses[id]?.status)).map((id) => ({ id, mode: 'optional' }));
  const t = Date.now();
  const r = search({ data, courses, statuses, weights: { friends: 3, progress: 3, freeDays: 1, compact: 1, timeWindow: 1, examSpread: 1 }, friends: [], constraints: { dayOff: [6], notAfter: '20:00' }, timeLimitMs: 1500 });
  assert.equal(r.partial, false, `partial after ${Date.now() - t}ms`);
});

test('identical primary groups collapse into one option that lists the others as alternates', () => {
  const g = (id) => ({ id, type: 'סופי-הרצאה', primary: true, lecturer: 'L', full: false, semester: 'א', linked: [],
    meetings: [{ day: 2, start: '10:00', end: '11:50', room: 'r' }], exams: [] });
  const course = { name: 'M', credits: 1, offered: true, prereqs: [], groups: [g('M1'), g('M2'), g('M3')] };
  const opts = buildOptions(course);
  assert.equal(opts.length, 1);
  assert.deepEqual(opts[0].alts, { M1: ['M2', 'M3'] });
  // a friend in M3 makes it distinct, so shared time is still rewarded
  assert.equal(buildOptions(course, { friendGroups: [['M3']] }).length, 2);
});

// Synthetic data with published exams, so the examSpread bound (and every other term of bound()) is exercised.
function synth(rnd) {
  const pick = (n) => Math.floor(rnd() * n);
  const data = mini();
  data.courses = {};
  const ids = Array.from({ length: 9 }, (_, i) => `S${i}`);
  for (const id of ids) {
    data.courses[id] = { name: id, credits: 1 + pick(4), offered: true, prereqs: [], groups: Array.from({ length: 1 + pick(3) }, (_, j) => {
      const h = 8 + pick(10);
      const t = (x) => `${String(x).padStart(2, '0')}:00`;
      return { id: `${id}-${j}`, type: 'סופי-הרצאה', primary: true, lecturer: 'L', full: rnd() < 0.15, semester: 'א', linked: [],
        meetings: [{ day: 1 + pick(6), start: t(h), end: t(h + 1 + pick(2)), room: 'r' }],
        exams: [{ kind: 'בחינה', moed: 1, date: `2027-02-${String(1 + pick(20)).padStart(2, '0')}`, time: '09:00' }] };
    }) };
  }
  return { data, ids };
}

test('synthetic (published exams): pruning keeps results identical across weights, constraints, pins and topK', () => {
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  for (let t = 0; t < 60; t++) {
    const { data, ids } = synth(rnd);
    const groups = ids.flatMap((id) => data.courses[id].groups.map((g) => g.id));
    const courses = ids.filter(() => rnd() < 0.8).map((id) => ({ id, mode: rnd() < 0.15 ? 'must' : 'optional' }));
    const statuses = {};
    for (const c of courses.slice(0, 2)) if (rnd() < 0.5) statuses[c.id] = { status: 'conditional', missingParallel: [[pick(ids)]] };
    const weights = Object.fromEntries(['friends', 'progress', 'freeDays', 'compact', 'timeWindow', 'examSpread'].map((k) => [k, pick([0, 1, 3, 5])]));
    weights.examSpread ||= 3;
    const constraints = {
      dayOff: rnd() < 0.5 ? [pick([1, 2, 3])] : [], dayOffHard: rnd() < 0.5, notAfter: rnd() < 0.4 ? '17:00' : '', windowHard: rnd() < 0.5,
      maxCredits: rnd() < 0.4 ? 8 + Math.floor(rnd() * 8) : null, examsSameDay: pick(['allow', 'forbid']), includeFull: rnd() < 0.5,
    };
    const pins = rnd() < 0.3 ? [pick(groups)] : [];
    const friends = rnd() < 0.5 ? [{ name: 'f', weight: pick([0, 1, 3]), active: rnd() < 0.8, groups: groups.filter(() => rnd() < 0.3) }] : [];
    const args = { data, courses, statuses, pins, weights, friends, constraints, topK: pick([1, 3, 10]), timeLimitMs: 60000 };
    const a = search({ ...args, prune: false }), b = search(args);
    assert.deepEqual(b.results.map((r) => [r.groups.join(), r.score.toFixed(9)]), a.results.map((r) => [r.groups.join(), r.score.toFixed(9)]), `case ${t}`);
  }
});

test('a timeout before any leaf says so instead of "no solution"', () => {
  const data = mini();
  const courses = [{ id: 'P', mode: 'must' }]; // conditional on Q, never chosen: every leaf is rejected
  for (let i = 0; i < 12; i++) {
    data.courses[`O${i}`] = { name: `Opt${i}`, credits: 1, offered: true, prereqs: [], groups: [
      { id: `O${i}1`, type: 'סופי-הרצאה', primary: true, lecturer: 'L', full: false, semester: 'א', linked: [],
        meetings: [{ day: (i % 5) + 1, start: `${8 + Math.floor(i / 5) * 2}:00`.padStart(5, '0'), end: `${9 + Math.floor(i / 5) * 2}:00`.padStart(5, '0'), room: 'r' }], exams: [] }] };
    courses.push({ id: `O${i}`, mode: 'optional' });
  }
  const statuses = { P: { status: 'conditional', missingParallel: [['Q']] } };
  const r = search({ data, courses, statuses, weights: W0, friends: [], constraints: { examsSameDay: 'allow' }, timeLimitMs: -1 });
  assert.equal(r.results.length, 0);
  assert.equal(r.partial, true);
  assert.match(r.diagnosis[0], /מגבלת הזמן/);
});

// Two semesters. P (prereq) and M (must, both semesters); N needs P; OB only in ב׳.
const grp = (id, day, start = '08:00', end = '10:00') => ({ id, type: 'הרצאה', primary: true, full: false, linked: [], meetings: [{ day, start, end }], exams: [] });
const yc = (name, credits, groups, prereqs = []) => ({ name, credits, offered: groups.length > 0, prereqs, groups, exams: [] });
const pre = (id) => [{ kind: 'קדם', anyOf: [{ id, name: id }] }];
const semData = (semester, courses) => ({ year: 2027, startYear: 2026, semester, examsPublished: false, lists: [{ code: 1, name: "חובה שנה א'", minCredits: 0, courses: Object.keys(courses) }], courses });
const yearFixture = () => ({
  dataA: semData('א', { P: yc('P', 3, [grp('PA', 1)]), M: yc('M', 4, [grp('MA', 2)]), N: yc('N', 3, [], pre('P')), OB: yc('OB', 2, []) }),
  dataB: semData('ב', { P: yc('P', 3, [grp('PB', 1)]), M: yc('M', 4, [grp('MB', 2)]), N: yc('N', 3, [grp('NB', 3)], pre('P')), OB: yc('OB', 2, [grp('OBB', 4)]) }),
});
const W = { progress: 3, freeDays: 0, compact: 0, timeWindow: 0, friends: 0, examSpread: 0 };
const yState = (extra = {}) => ({ passed: [], failed: {}, choices: { M: 'must', P: 'must', N: 'optional', OB: 'optional' }, semesterOf: {}, load: 'even', ...extra });
const best = (r) => r.results[0];
const inA = (p, id) => p.a.courses.includes(id), inB = (p, id) => !!p.b?.courses.includes(id);

test('searchYear: a must course lands in exactly one semester', () => {
  const { dataA, dataB } = yearFixture();
  const r = searchYear({ dataA, dataB, state: yState(), yearList: new Set(), weights: W });
  for (const p of r.results) assert.equal(inA(p, 'M') + inB(p, 'M'), 1);
});

test('searchYear: a course unlocked by its prerequisite in א׳ is planned in ב׳; ב׳-only course never in א׳', () => {
  const { dataA, dataB } = yearFixture();
  const r = searchYear({ dataA, dataB, state: yState({ semesterOf: { P: 'א' } }), yearList: new Set(), weights: W });
  const p = best(r);
  assert.ok(inA(p, 'P') && inB(p, 'N'));
  assert.ok(r.results.every((x) => !inA(x, 'OB')));
  assert.ok(p.warnings.some((w) => w.includes('P')));
});

test('searchYear: semesterOf forces a course; a pin overrides semesterOf', () => {
  const { dataA, dataB } = yearFixture();
  let p = best(searchYear({ dataA, dataB, state: yState({ semesterOf: { M: 'ב' } }), yearList: new Set(), weights: W }));
  assert.ok(inB(p, 'M') && !inA(p, 'M'));
  p = best(searchYear({ dataA, dataB, state: yState({ semesterOf: { M: 'ב' } }), pins: ['MA'], yearList: new Set(), weights: W }));
  assert.ok(inA(p, 'M') && !inB(p, 'M'));
});

test('searchYear: load preference moves credits toward the chosen semester', () => {
  const { dataA, dataB } = yearFixture();
  const run = (load) => best(searchYear({ dataA, dataB, state: yState({ load }), yearList: new Set(), weights: W })).credits;
  assert.ok(run('א').a > run('ב').a);
});

test('searchYear: default state on real data finishes within 3 s', { skip: !existsSync('web/data/afeka/2027-2/30-2026.json') }, () => {
  const dataA = JSON.parse(readFileSync('web/data/afeka/2027-1/30-2026.json', 'utf8'));
  const dataB = JSON.parse(readFileSync('web/data/afeka/2027-2/30-2026.json', 'utf8'));
  const y1 = dataA.lists.find((l) => l.name.includes("שנה א'")).courses;
  const y2 = new Set(dataA.lists.find((l) => l.name.includes("שנה ב'")).courses);
  const t = Date.now();
  const r = searchYear({ dataA, dataB, state: { passed: y1, failed: {}, choices: {}, semesterOf: {}, load: 'even' }, yearList: y2,
    weights: { friends: 3, progress: 3, freeDays: 1, compact: 1, timeWindow: 1, examSpread: 1 }, constraints: { dayOff: [6], notAfter: '20:00', examsSameDay: 'forbid' } });
  assert.ok(Date.now() - t < 3500);
  assert.ok(r.results.length > 0);
});

test('searchYear: a must course with an afterA status lands in ב׳ when its prerequisite is in א׳', () => {
  const { dataA, dataB } = yearFixture();
  const state = yState({ choices: { P: 'must', N: 'must' }, semesterOf: { P: 'א' } });
  const p = best(searchYear({ dataA, dataB, state, yearList: new Set(), weights: W }));
  assert.ok(inA(p, 'P') && inB(p, 'N') && !inA(p, 'N'));
  assert.deepEqual(p.missing, []);
});

test('searchYear: a must course that needs an optional א׳ prerequisite the plan skips is reported missing', () => {
  const { dataA, dataB } = yearFixture();
  dataA.courses.P.groups[0].meetings[0].day = 2; // P in א׳ clashes with M, which is forced to א׳
  const p = best(searchYear({ dataA, dataB, state: yState({ choices: { M: 'must', P: 'optional', N: 'must', OB: 'optional' }, semesterOf: { M: 'א', P: 'א' } }), yearList: new Set(), weights: W }));
  assert.ok(!inA(p, 'P'));
  assert.deepEqual(p.missing, ['N']);
});

test('synthetic: pruning with active friends sharing groups keeps results identical', () => {
  let seed = 23;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  for (let t = 0; t < 60; t++) {
    const { data, ids } = synth(rnd);
    const groups = ids.flatMap((id) => data.courses[id].groups.map((g) => g.id));
    const courses = ids.map((id) => ({ id, mode: rnd() < 0.15 ? 'must' : 'optional' }));
    const weights = { friends: pick([3, 5]), progress: pick([0, 1, 3]), freeDays: pick([0, 1]), compact: pick([0, 1]), timeWindow: 0, examSpread: 0 };
    const friends = Array.from({ length: 1 + Math.floor(rnd() * 3) }, (_, i) => ({ name: `f${i}`, weight: pick([1, 2, 3]), active: true, groups: groups.filter(() => rnd() < 0.45) }));
    const args = { data, courses, statuses: {}, weights, friends, constraints: { examsSameDay: 'allow' }, topK: pick([1, 3, 10]), timeLimitMs: 60000 };
    const a = search({ ...args, prune: false }), b = search(args);
    assert.deepEqual(b.results.map((r) => [r.groups.join(), r.score.toFixed(9)]), a.results.map((r) => [r.groups.join(), r.score.toFixed(9)]), `case ${t}`);
  }
});

const REAL2 = 'web/data/afeka/2027-2/30-2026.json';
test('searchYear: real data with one friend on an actual alternative finishes within 3 s, not partial', { skip: !existsSync(REAL2) }, () => {
  const dataA = JSON.parse(readFileSync('web/data/afeka/2027-1/30-2026.json', 'utf8'));
  const dataB = JSON.parse(readFileSync(REAL2, 'utf8'));
  const y1 = dataA.lists.find((l) => l.name.includes("שנה א'")).courses;
  const y2 = new Set(dataA.lists.find((l) => l.name.includes("שנה ב'")).courses);
  const take = (d) => Object.values(d.courses).flatMap((c) => { const p = c.groups.find((g) => g.primary && !g.full); return p ? [p.id, ...p.linked] : []; });
  const friends = [{ name: 'f', weight: 2, active: true, groups: [...take(dataA), ...take(dataB)] }];
  const t = Date.now();
  const r = searchYear({ dataA, dataB, state: { passed: y1, failed: {}, choices: {}, semesterOf: {}, load: 'even' }, yearList: y2, friends,
    weights: { friends: 3, progress: 3, freeDays: 1, compact: 1, timeWindow: 1, examSpread: 1 }, constraints: { dayOff: [6], notAfter: '20:00', examsSameDay: 'forbid' } });
  assert.ok(Date.now() - t < 3000, `took ${Date.now() - t}ms`);
  assert.equal(r.partial, false);
  assert.ok(r.results.length > 0);
});

test('searchYear: a hard constraint that excludes everything gives no results (no empty plan)', () => {
  const { dataA, dataB } = yearFixture();
  const choices = { M: 'optional', P: 'optional', N: 'optional', OB: 'optional' };
  const r = searchYear({ dataA, dataB, state: yState({ choices }), yearList: new Set(), weights: W, constraints: { dayOff: [1, 2, 3, 4, 5, 6], dayOffHard: true } });
  assert.equal(r.results.length, 0);
  assert.ok(r.diagnosis.length > 0);
});
