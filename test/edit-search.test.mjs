import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyEdit, loadSchedule, lessonsOf } from '../web/edit-state.js';
import {
  kinds, editQuery, acceptedParallel, displayData, overlaps, gapMinutes, proposalsFrom, summaryLine, tryEach, runEdit, changeText, PROPOSAL_ONLY, FIXED_COURSE
} from '../web/edit-search.js';
import { search } from '../web/solver-core.js';
import { DEFAULT } from '../web/app.js';
import { real } from './fixtures/real.mjs';

// Small synthetic data: every group is a lecture with one meeting [day, start, end].
const grp = (id, day, start, end, extra = {}) => ({
  id, type: 'הרצאה', primary: true, lecturer: 'L', full: false, linked: [], meetings: [{ day, start, end, room: 'r' }], exams: [], ...extra
});
const course = (name, groups, prereqs = []) => ({ name, credits: 3, offered: true, prereqs, groups });
const par = (id, name) => ({ kind: 'מקביל', anyOf: [{ id, name }] });
const dataOf = (courses) => ({
  year: 2027, startYear: 2026, program: 30, semester: 'א', examsPublished: false, lists: [{ code: 1, name: 'x', minCredits: 0, courses: Object.keys(courses) }], courses
});
const record = { ...DEFAULT, passed: [] };
const DS = { year: 2027, sem: 'א', program: 30, startYear: 2026 };
const L = (course, group, day, start, end, name = `n${course}`) => ({ course, name, type: 'הרצאה', group, day, start, end });
const edit = (lessons, over = {}, registered = false) => ({ ...loadSchedule(emptyEdit(), lessons, DS, registered), ...over });
const ids = (r) => r.groups.slice().sort();

const base = () => dataOf({
  A: course('אלף', [grp('A1', 1, '08:00', '09:50'), grp('A2', 2, '08:00', '09:50')]),
  B: course('בית', [grp('B1', 3, '08:00', '09:50'), grp('B2', 4, '08:00', '09:50')])
});
const twoReal = () => [L('A', 'A1', 1, '08:00', '09:50'), L('B', 'B1', 3, '08:00', '09:50')];

test('pins: every group of the real courses that stay, none of a movable one', () => {
  const q = editQuery(edit(twoReal(), { movable: ['A'] }), base(), record);
  assert.deepEqual(q.pins, ['B1']);
  assert.deepEqual(q.courses, [{ id: 'A', mode: 'must' }, { id: 'B', mode: 'must' }]);
  assert.deepEqual(editQuery(edit(twoReal()), base(), record).pins, ['A1', 'B1']);
});

test('swaps are pinned instead of the baseline groups of that course', () => {
  const q = editQuery(edit(twoReal(), { swaps: { A: ['A2'] } }), base(), record);
  assert.deepEqual(q.pins, ['B1', 'A2']);
  assert.deepEqual(search(q).results.map(ids), [['A2', 'B1']]);
});

test('a course with a missing group is fixed: sent only inside the synthetic option, never by its real id', () => {
  const data = dataOf({ ...base().courses, C: course('גימל', [grp('C1', 5, '08:00', '09:50')]) });
  const lessons = [...twoReal(), L('C', 'C1', 5, '08:00', '09:50'), L('C', null, 5, '10:00', '11:50')];
  const e = edit(lessons);
  assert.deepEqual(kinds(e, data), { real: ['A', 'B'], fixed: ['C'] });
  const q = editQuery(e, data, record);
  assert.deepEqual(q.courses.map((c) => c.id), ['A', 'B', FIXED_COURSE]);
  assert.equal(q.pins.some((p) => p === 'C1'), false);
  const meetings = q.data.courses[FIXED_COURSE].groups[0].meetings;
  assert.deepEqual(meetings.map((m) => [m.day, m.start, m.end]), [[5, '08:00', '09:50'], [5, '10:00', '11:50']]);
  assert.ok(q.pins.includes('fixed:g'));
  assert.equal(data.courses[FIXED_COURSE], undefined, 'the data given is not changed');
  assert.equal(search(q).results.length > 0, true);
});

test('a course missing from the data is fixed too, and cannot move', () => {
  const e = edit([...twoReal(), L('Z', 'Z1', 5, '08:00', '09:50')], { movable: ['Z'] });
  assert.deepEqual(kinds(e, base()).fixed, ['Z']);
});

test('fixed lessons that overlap still give a result (they are one option)', () => {
  const e = edit([...twoReal(), L('X', null, 6, '08:00', '10:00'), L('Y', null, 6, '09:00', '11:00')]);
  const r = search(editQuery(e, base(), record));
  assert.equal(r.results.length, 1);
});

test('a fixed course with a real id, marked movable, is real and unpinned', () => {
  const data = dataOf({ ...base().courses, C: course('גימל', [grp('C1', 5, '08:00', '09:50'), grp('C2', 6, '08:00', '09:50')]) });
  const e = edit([...twoReal(), L('C', null, 5, '08:00', '09:50')], { movable: ['C'] });
  assert.deepEqual(kinds(e, data), { real: ['A', 'B', 'C'], fixed: [] });
  const q = editQuery(e, data, record);
  assert.deepEqual(q.courses.map((c) => c.id), ['A', 'B', 'C']);
  assert.deepEqual(q.pins, ['A1', 'B1']);
  assert.equal(q.data.courses[FIXED_COURSE], undefined);
});

test('added and removed courses', () => {
  const data = dataOf({ ...base().courses, C: course('גימל', [grp('C1', 5, '08:00', '09:50')]) });
  const q = editQuery(edit(twoReal(), { added: ['C', 'nope'], removed: ['B'] }), data, record);
  assert.deepEqual(q.courses.map((c) => c.id), ['A', 'C']);
  assert.deepEqual(q.pins, ['A1']);
  const fixed = editQuery(edit([...twoReal(), L('X', null, 6, '08:00', '10:00')], { removed: ['X'] }), base(), record);
  assert.equal(fixed.courses.some((c) => c.id === FIXED_COURSE), false, 'a removed fixed course leaves the synthetic option');
});

test('registered: no full destination, an owned full group allowed', () => {
  const data = dataOf({
    A: course('אלף', [grp('A1', 1, '08:00', '09:50', { full: true }), grp('A2', 2, '08:00', '09:50', { full: true }), grp('A3', 3, '08:00', '09:50')])
  });
  const e = edit([L('A', 'A1', 1, '08:00', '09:50')], { movable: ['A'] }, true);
  const q = editQuery(e, data, record);
  assert.deepEqual(q.allowFull, ['A1']);
  assert.equal(q.constraints.includeFull, false);
  const got = search(q).results.map(ids).flat();
  assert.ok(got.includes('A1') && got.includes('A3'));
  assert.equal(got.includes('A2'), false);
  const open = editQuery(edit([L('A', 'A1', 1, '08:00', '09:50')], { movable: ['A'] }), data, record);
  assert.equal(open.allowFull, undefined);
  assert.equal(open.constraints.includeFull, true);
  assert.ok(search(open).results.map(ids).flat().includes('A2'));
});

test('a saved proposal group that is full is not allowed when registered', () => {
  const data = dataOf({ A: course('אלף', [grp('A1', 1, '08:00', '09:50'), grp('A2', 2, '08:00', '09:50', { full: true })]) });
  const reg = edit([L('A', 'A1', 1, '08:00', '09:50')], {}, true);
  const saved = { ...reg, baseline: [L('A', 'A2', 2, '08:00', '09:50')] }; // owned stays ['A1']
  const q = editQuery(saved, data, record);
  assert.deepEqual(q.allowFull, ['A1']);
  assert.equal(search(q).results.length, 0);
});

test('goals: free day is hard, a fixed lesson on that day leaves nothing; finish-by and fewer gaps map to settings', () => {
  const free = edit(twoReal(), { movable: ['B'], goal: { dayOff: 3, notAfter: null, fewerGaps: false } });
  const q = editQuery(free, base(), record);
  assert.deepEqual([q.constraints.dayOff, q.constraints.dayOffHard], [[3], true]);
  assert.deepEqual(search(q).results.map(ids), [['A1', 'B2']]);
  const blocked = edit([...twoReal(), L('X', null, 3, '12:00', '13:50')], { goal: { dayOff: 3, notAfter: null, fewerGaps: false } });
  assert.equal(search(editQuery(blocked, base(), record)).results.length, 0);
  const g = editQuery(edit(twoReal(), { goal: { dayOff: null, notAfter: '12:00', fewerGaps: true } }), base(), record);
  assert.deepEqual([g.constraints.notAfter, g.constraints.windowHard, g.weights.compact], ['12:00', true, 5]);
  assert.equal(editQuery(edit(twoReal()), base(), record).weights.compact, DEFAULT.weights.compact);
  assert.deepEqual(editQuery(edit(twoReal()), base(), record).constraints.blocks, []);
});

const parData = () => dataOf({
  P: course('פ', [grp('P1', 1, '08:00', '09:50')], [par('Q', 'קיו'), par('R', 'אר')]),
  Q: course('קיו', [grp('Q1', 2, '08:00', '09:50')]),
  R: course('אר', [grp('R1', 3, '08:00', '09:50')])
});

test('acceptParallel: only the requirement unmet in original is dropped, by its #n key', () => {
  const e = edit([L('P', 'P1', 1, '08:00', '09:50'), L('R', 'R1', 3, '08:00', '09:50')]);
  assert.deepEqual(acceptedParallel(e, parData(), record), ['P#0']);
  const q = editQuery(e, parData(), record);
  assert.deepEqual(q.statuses.P.missingParallel, [['R']], 'the second requirement is still checked');
  const both = edit([L('P', 'P1', 1, '08:00', '09:50'), L('R', 'R1', 3, '08:00', '09:50'), L('Q', 'Q1', 2, '08:00', '09:50')]);
  assert.deepEqual(acceptedParallel(both, parData(), record), []);
  const passed = { ...record, passed: ['Q'] };
  assert.deepEqual(acceptedParallel(e, parData(), passed), [], 'a requirement the record satisfies is not unmet');
});

test('a fixed course counts as present for the parallel requirement, until it is removed', () => {
  const rec = { ...record, passed: ['R'] }; // R is met by the record, so Q is the only open requirement
  const e = edit([L('P', 'P1', 1, '08:00', '09:50'), L('Q', null, 2, '08:00', '09:50')]);
  assert.equal(editQuery(e, parData(), rec).statuses.P.missingParallel, undefined);
  const rm = editQuery({ ...e, removed: ['Q'] }, parData(), rec);
  assert.deepEqual(rm.statuses.P.missingParallel, [['Q']]);
});

test('displayData: two fixed courses are two display courses with their own names, real groups kept', () => {
  const data = base();
  const ls = [L('A', 'A1', 1, '08:00', '09:50'), L('X', null, 6, '08:00', '10:00', 'איקס'), L('Y', null, 6, '09:00', '11:00', 'וואי'), L('X', null, 5, '08:00', '10:00', 'איקס')];
  const d = displayData(ls, data);
  assert.deepEqual(d.groups, ['A1', 'fixed:X:0', 'fixed:Y:0', 'fixed:X:1']);
  assert.deepEqual([d.data.courses['fixed:X'].name, d.data.courses['fixed:Y'].name], ['איקס', 'וואי']);
  assert.equal(d.data.courses['fixed:X'].groups.length, 2);
  assert.equal(d.data.courses['fixed:X'].groups[1].meetings[0].day, 5);
  assert.equal(data.courses['fixed:X'], undefined);
});

test('overlaps: each overlapping pair of courses once; touching hours do not overlap', () => {
  const ls = [L('A', 'A1', 1, '08:00', '10:00'), L('B', 'B1', 1, '09:00', '11:00'), L('B', 'B1', 2, '08:00', '10:00'), L('C', 'C1', 1, '10:00', '12:00')];
  assert.deepEqual(overlaps(ls), [['A', 'B'], ['B', 'C']]);
  assert.deepEqual(overlaps([L('A', 'A1', 1, '08:00', '10:00'), L('A', 'A2', 1, '09:00', '10:00')]), []);
});

test('frozen real data: a lecture and its linked tutorial both stay pinned; the movable course is free', () => {
  const data = real('2027-1/30-2026.json');
  const lessons = lessonsOf(['273011202', '273011202/1', '273000303', '273000303/1'], data);
  assert.deepEqual([...new Set(lessons.map((l) => l.group))], ['273011202', '273011202/1', '273000303', '273000303/1']);
  const rec = { ...DEFAULT, passed: [] };
  const e = edit(lessons);
  const q = editQuery(e, data, rec);
  assert.deepEqual([...new Set(q.pins)].sort(), ['273000303', '273000303/1', '273011202', '273011202/1']);
  assert.deepEqual(q.courses.map((c) => c.id).sort(), ['30003', '30112']);
  assert.deepEqual(search(q).results.map(ids), [['273000303', '273000303/1', '273011202', '273011202/1']]);
  const moving = editQuery({ ...e, movable: ['30003'] }, data, rec);
  assert.deepEqual(moving.pins, ['273011202', '273011202/1']);
  const found = search(moving).results;
  assert.ok(found.length > 1 && found.every((r) => r.groups.includes('273011202') && r.groups.includes('273011202/1')));
  assert.ok(found.every((r) => r.groups.some((g) => g.endsWith('/1') && g.startsWith('273000'))));
});

test('frozen real data: a registered schedule never takes another full group, and statuses come from the real rules', () => {
  const data = real('2027-1/30-2026.json');
  const full = data.courses['30112'].groups.filter((g) => g.full).map((g) => g.id);
  assert.ok(full.length > 0, 'the fixture has a full group to refuse');
  const lessons = lessonsOf(['273011202', '273011202/1'], data);
  const q = editQuery(edit(lessons, { movable: ['30112'] }, true), data, { ...DEFAULT, passed: [] });
  assert.deepEqual(q.allowFull, ['273011202', '273011202/1']);
  const got = search(q).results.map(ids).flat();
  assert.ok(got.length > 0);
  assert.equal(full.some((id) => got.includes(id)), false);
  assert.equal(typeof q.statuses['30112'].status, 'string');
  const open = search(editQuery(edit(lessons, { movable: ['30112'] }), data, { ...DEFAULT, passed: [] })).results.map(ids).flat();
  assert.equal(full.some((id) => open.includes(id)), true, 'unregistered, full groups show (with their warning)');
});

// Proposals
const R = (groups, score = 1) => ({ groups, score });
const gapData = () => dataOf({
  A: course('אלף', [grp('A1', 1, '08:00', '10:00'), grp('A2', 2, '08:00', '10:00')]),
  B: course('בית', [grp('B1', 1, '12:00', '14:00'), grp('B2', 1, '10:00', '12:00'), grp('B3', 1, '12:00', '14:00', { lecturer: 'M' })])
});
const gapBase = () => [L('A', 'A1', 1, '08:00', '10:00'), L('B', 'B1', 1, '12:00', '14:00')];

test('gapMinutes: gaps between lessons of a day, overlapping and touching lessons merged first', () => {
  const t = (d, a, b) => L('A', 'x', d, a, b);
  assert.equal(gapMinutes([t(1, '08:00', '10:00'), t(1, '12:00', '14:00')]), 120);
  assert.equal(gapMinutes([t(1, '08:00', '12:00'), t(1, '09:00', '10:00'), t(1, '11:00', '13:00')]), 0);
  assert.equal(gapMinutes([t(1, '08:00', '10:00'), t(1, '10:00', '12:00'), t(2, '08:00', '09:00'), t(2, '11:00', '12:00')]), 120);
  assert.equal(gapMinutes([]), 0);
});

test('proposals: a result equal to the baseline is dropped; a result that only removes a fixed course stays', () => {
  const e = edit(twoReal());
  const q = editQuery(e, base(), record);
  assert.deepEqual(proposalsFrom([R(['A1', 'B1'])], e, q), []);
  const withFixed = edit([...twoReal(), L('X', null, 6, '08:00', '10:00')], { removed: ['X'] });
  const out = proposalsFrom([R(['A1', 'B1'])], withFixed, editQuery(withFixed, base(), record));
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].removed, out[0].changed, out[0].added], [['X'], [], []]);
  assert.equal(out[0].lessons.some((l) => l.course === 'X'), false);
  const kept = edit([...twoReal(), L('X', null, 6, '08:00', '10:00')], { movable: ['A'] });
  const qk = editQuery(kept, base(), record);
  assert.ok(proposalsFrom([R(['A2', 'B1', 'fixed:g'])], kept, qk)[0].lessons.some((l) => l.course === 'X'), 'fixed lessons ride along');
});

test('proposals: fewest changed courses first, then the better score', () => {
  const e = edit(twoReal());
  const q = editQuery(e, base(), record);
  const out = proposalsFrom([R(['A2', 'B2'], 9), R(['A2', 'B1'], 1), R(['A1', 'B2'], 3)], e, q);
  assert.deepEqual(out.map((p) => p.changed.length), [1, 1, 2]);
  assert.deepEqual(out.map((p) => p.score), [3, 1, 9]);
  assert.deepEqual(out[2].changed, ['A', 'B']);
});

test('proposals: an added course is listed as added', () => {
  const data = dataOf({ ...base().courses, C: course('גימל', [grp('C1', 5, '08:00', '09:50')]) });
  const e = edit(twoReal(), { added: ['C'] });
  const out = proposalsFrom(search(editQuery(e, data, record)).results, e, editQuery(e, data, record));
  assert.deepEqual([out[0].added, out[0].changed, out[0].removed], [['C'], [], []]);
});

test('proposals: fewerGaps drops a result whose gaps are not smaller', () => {
  const goal = { dayOff: null, notAfter: null, fewerGaps: true };
  const e = edit(gapBase(), { goal });
  const q = editQuery(e, gapData(), record);
  assert.deepEqual(proposalsFrom([R(['A1', 'B3'])], e, q), [], 'same 120 minutes of gap');
  assert.equal(proposalsFrom([R(['A1', 'B2'])], e, q).length, 1);
  assert.equal(proposalsFrom([R(['A1', 'B3'])], { ...e, goal: { ...goal, fewerGaps: false } }, q).length, 1);
});

test('proposals from a real search: one movable course, a free-day goal', () => {
  const e = edit(twoReal(), { movable: ['B'], goal: { dayOff: 3, notAfter: null, fewerGaps: false } });
  const q = editQuery(e, base(), record);
  const out = proposalsFrom(search(q).results, e, q);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].changed, ['B']);
  assert.equal(out[0].lessons.some((l) => l.day === 3), false);
});

test('summaryLine: a freed day, gaps, an earlier end, the change count and the lecturer', () => {
  const data = base();
  const move = { lessons: [L('A', 'A1', 1, '08:00', '09:50'), L('B', 'B2', 4, '08:00', '09:50')], changed: ['B'], added: [], removed: [], score: 1 };
  assert.equal(summaryLine(twoReal(), move, data), 'יום ג׳ התפנה · קורס אחד זז · אותו מרצה');
  const gd = gapData();
  const gp = { lessons: [L('A', 'A1', 1, '08:00', '10:00'), L('B', 'B2', 1, '10:00', '12:00')], changed: ['B'], added: [], removed: [], score: 1 };
  assert.equal(summaryLine(gapBase(), gp, gd), 'פחות 120 דקות חלון · מסיימים ב-12:00 · קורס אחד זז · אותו מרצה');
  const other = { lessons: [L('A', 'A1', 1, '08:00', '10:00'), L('B', 'B3', 1, '12:00', '14:00')], changed: ['B'], added: [], removed: [], score: 1 };
  assert.equal(summaryLine(gapBase(), other, gd), 'קורס אחד זז');
  const two = { lessons: [], changed: ['A', 'B'], added: ['C'], removed: ['D', 'E'], score: 1 };
  assert.equal(summaryLine([], two, gd), '2 קורסים זזו · קורס אחד נוסף · 2 קורסים הוסרו');
});

// Single-course tries and the edit worker
const free3 = { dayOff: 3, notAfter: null, fewerGaps: false };
const tryData = () => dataOf({
  A: course('אלף', [grp('A1', 1, '08:00', '09:50'), grp('A2', 2, '08:00', '09:50')]),
  B: course('בית', [grp('B1', 3, '08:00', '09:50'), grp('B2', 4, '08:00', '09:50')])
});

test('runEdit tries: nothing movable, a free-day goal only B can reach: proposals change only B, enabling [B]', () => {
  const e = edit(twoReal(), { goal: free3 });
  const out = runEdit({ kind: 'tries', edit: e, data: tryData(), record });
  assert.deepEqual(out.enabling, ['B']);
  assert.ok(out.proposals.length > 0 && out.proposals.every((p) => p.changed.join() === 'B' && !p.lessons.some((l) => l.day === 3)));
  assert.equal(out.timedOut, false);
});

test('runEdit search: with A movable and only B able to free the day, no proposal but enabling [B] and a diagnosis', () => {
  const e = edit(twoReal(), { goal: free3, movable: ['A'] });
  const out = runEdit({ kind: 'search', edit: e, data: tryData(), record });
  assert.deepEqual([out.proposals, out.enabling, out.timedOut], [[], ['B'], false]);
  assert.ok(out.diagnosis.length > 0);
  const ok = runEdit({ kind: 'search', edit: { ...e, movable: ['A', 'B'] }, data: tryData(), record });
  assert.ok(ok.proposals.length > 0 && ok.enabling.length === 0);
});

test('runEdit: a fixed lesson on the goal day leaves no proposal, no enabling course, and no timeout', () => {
  const e = edit([...twoReal(), L('X', null, 3, '12:00', '13:50')], { goal: free3 });
  for (const kind of ['tries', 'search']) {
    const out = runEdit({ kind, edit: e, data: tryData(), record });
    assert.deepEqual([out.proposals, out.enabling, out.timedOut], [[], [], false], kind);
  }
});

test('tryEach: skips courses already movable and removed ones; the overall cap reports a timeout', () => {
  const seen = [];
  const spy = (q) => (seen.push(q.courses.map((c) => c.id).join()), { results: [], partial: false, diagnosis: [] });
  const e = edit(twoReal(), { movable: ['A'], goal: free3 });
  assert.deepEqual(tryEach(e, tryData(), record, spy), { found: [], timedOut: false });
  assert.equal(seen.length, 1);
  const four = dataOf(Object.fromEntries('ABCD'.split('').map((c, i) => [c, course(c, [grp(`${c}1`, i + 1, '08:00', '09:50')])])));
  const lessons = 'ABCD'.split('').map((c, i) => L(c, `${c}1`, i + 1, '08:00', '09:50'));
  const slow = () => {
    const t = Date.now();
    while (Date.now() - t < 30); // a synchronous busy-wait
    return { results: [], partial: false, diagnosis: [] };
  };
  const r = tryEach(edit(lessons), four, record, slow, { perMs: 10, totalMs: 50 });
  assert.deepEqual([r.found, r.timedOut], [[], true]);
  assert.equal(tryEach(edit(lessons), four, record, slow, { perMs: 10, totalMs: 5000 }).timedOut, false);
});

test('tryEach: a try that stops on its own time limit with nothing found is a timeout, not "no solution"', () => {
  const partial = () => ({ results: [], partial: true, diagnosis: [] });
  assert.equal(tryEach(edit(twoReal(), { goal: free3 }), tryData(), record, partial).timedOut, true);
});

test('tryEach: each try gets at most the time left of the overall cap', () => {
  const limits = [];
  const slow = (q) => {
    limits.push(q.timeLimitMs);
    const t = Date.now();
    while (Date.now() - t < 30); // a synchronous busy-wait
    return { results: [], partial: false, diagnosis: [] };
  };
  tryEach(edit(twoReal(), { goal: free3 }), tryData(), record, slow, { perMs: 400, totalMs: 100 });
  assert.equal(limits.length, 2);
  assert.ok(limits[0] <= 100 && limits[1] < 100 && limits[1] <= 100 - 25, `${limits}`);
});

// Copying the changes
const T = (course, group, day, start, type = 'הרצאה') => ({ ...L(course, group, day, start, '09:50', `n${course}`), type });
const copyData = () => dataOf({ A: course('אלף', []), B: course('בית', []), C: course('גימל', []) });

test('changeText: a moved course lists its new lecture and tutorial under להוסיף and the old ones under להסיר', () => {
  const from = [T('A', 'A1', 1, '08:00'), T('A', 'A1/1', 1, '10:00', 'תרגול'), T('B', 'B1', 2, '08:00')];
  const to = [T('A', 'A2', 3, '08:00'), T('A', 'A2/1', 3, '10:00', 'תרגול'), T('B', 'B1', 2, '08:00')];
  assert.equal(changeText(from, to, copyData()), ['להוסיף:', 'אלף (A): A2, A2/1', 'להסיר:', 'אלף (A): A1, A1/1', PROPOSAL_ONLY].join('\n'));
});

test('changeText: a removed course is only under להסיר, an added one only under להוסיף, a kept lecture is not listed', () => {
  const from = [T('A', 'A1', 1, '08:00'), T('A', 'A1/1', 1, '10:00', 'תרגול'), T('B', 'B1', 2, '08:00')];
  assert.equal(changeText(from, [T('A', 'A1', 1, '08:00'), T('A', 'A1/1', 1, '10:00', 'תרגול')], copyData()), ['להסיר:', 'בית (B): B1', PROPOSAL_ONLY].join('\n'));
  assert.equal(changeText(from.slice(2), [...from.slice(2), T('C', 'C1', 4, '08:00')], copyData()), ['להוסיף:', 'גימל (C): C1', PROPOSAL_ONLY].join('\n'));
  const tutorialOnly = [T('A', 'A1', 1, '08:00'), T('A', 'A1/2', 2, '10:00', 'תרגול')];
  assert.equal(changeText(from.slice(0, 2), tutorialOnly, copyData()), ['להוסיף:', 'אלף (A): A1/2', 'להסיר:', 'אלף (A): A1/1', PROPOSAL_ONLY].join('\n'));
});

test('changeText: fixed lessons never appear; nothing changed is just the disclaimer; the disclaimer ends it', () => {
  const fixed = T('X', null, 6, '08:00');
  assert.equal(changeText([fixed], [], copyData()), PROPOSAL_ONLY);
  assert.equal(changeText([T('A', 'A1', 1, '08:00'), fixed], [T('A', 'A1', 1, '08:00')], copyData()), PROPOSAL_ONLY);
  assert.equal(changeText([], [fixed, T('A', 'A1', 1, '08:00')], copyData()).includes('X'), false);
});

test('changeText: no apply or register wording except the closing disclaimer', () => {
  const text = changeText([T('A', 'A1', 1, '08:00')], [T('A', 'A2', 3, '08:00'), T('B', 'B1', 2, '08:00')], copyData());
  const lines = text.split('\n');
  assert.equal(lines.at(-1), PROPOSAL_ONLY);
  assert.equal(lines.slice(0, -1).join('\n').match(/החל|הרשמ|apply|register/i), null);
  assert.equal(PROPOSAL_ONLY.match(/החל|apply|register/i), null);
});

test('changeText: a course missing from the data keeps its snapshot name', () => {
  assert.equal(changeText([], [T('Z', 'Z1', 1, '08:00')], copyData()), ['להוסיף:', 'nZ (Z): Z1', PROPOSAL_ONLY].join('\n'));
});
