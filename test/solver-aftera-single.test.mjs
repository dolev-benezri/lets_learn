import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';
import { search, searchYear } from '../web/solver-core.js';
import { afterAText, afterANotes, classify, withAfterA } from '../web/rules.js';
import { advisorBlocks, advisorHtml } from '../web/advisor.js';
import { mini } from './fixtures/mini-data.mjs';

// Deep scan 2026-11-19, finding 6: "רק ב׳" plans a ב׳ course that only opens after an א׳ course (status afterA, the same
// assumption the year view makes), but only the year view warned about it. Synthetic data: the ב׳ file is the mini
// dataset (B dynamics needs A physics), the א׳ file offers A.
const catalog = { programs: [{ id: 30, name: 'הנדסת מכונות' }] };
const W0 = { friends: 0, progress: 0, freeDays: 0, compact: 0, timeWindow: 0, examSpread: 0 };
const text = (html) => parse(html).text.replace(/\s+/g, ' ');
const world = (over = {}) => {
  const dataB = { ...mini(), semester: 'ב' }, dataA = { ...mini(), semester: 'א' };
  const state = { passed: [], failed: {}, profile: { year: 1 }, ...over };
  // as app.js does for the single ב׳ scope
  const cls = withAfterA(dataB, state, classify(dataB, state), dataA);
  const res = search({
    data: dataB, courses: [{ id: 'B', mode: 'must' }], statuses: cls.statuses, weights: W0, friends: [], constraints: {}, topK: 5
  }).results[0];
  return { dataA, dataB, state, cls, res };
};

test('the premise: a ב׳ course that waits for an א׳ course is planned in "רק ב׳"', () => {
  const { cls, res } = world();
  assert.equal(cls.statuses.B.status, 'afterA');
  assert.deepEqual(res.courses, ['B']);
  assert.ok(!('a' in res)); // a single-semester result: no pair, so no year warnings
});

const NOW = new Date('2026-10-21T21:30:00Z');
const LINE = 'התכנון של ב׳ מניח שעוברים את פיזיקה-מכניקה בא׳';
// the groups a status holds ({ id, name } alternatives, one array per open prerequisite) as names; ids are the names here
// (only the alternatives א׳ would have to give, inA)
const nm = (groups) => groups.map((g) => g.filter((a) => a.inA).map((a) => a.name));
const alt = (...names) => names.map((n) => ({ id: n, name: n, inA: true }));

test('the advisor summary of a "רק ב׳" plan says it assumes the א׳ course was passed', () => {
  const { dataB, state, cls, res } = world();
  const t = text(advisorHtml({ state, data: dataB, res, cls, catalog, now: NOW }));
  assert.match(t, new RegExp(LINE));
  // in the "שימו לב" list, once
  const notes = advisorBlocks({ state, data: dataB, res, cls, catalog, now: NOW }).filter((b) => b.k === 'li' && b.t === LINE);
  assert.equal(notes.length, 1);
});

test('the statuses carry what an afterA course waits for', () => {
  const { cls } = world();
  assert.deepEqual(nm(cls.statuses.B.after), [['פיזיקה-מכניקה']]); // a group per open prerequisite
  assert.equal(cls.statuses.A.after, undefined);
});

test('afterANotes: one line for the planned afterA courses, none for a course outside the plan or a plain one', () => {
  const { cls } = world();
  assert.deepEqual(afterANotes(cls, ['B']), [LINE]);
  assert.deepEqual(afterANotes(cls, ['A']), []); // plain: nothing to assume
  assert.deepEqual(afterANotes(cls, []), []);
  assert.deepEqual(afterANotes(cls, ['nope']), []);
  assert.deepEqual(afterANotes(undefined, ['B']), []);
  assert.deepEqual(afterANotes(classify({ ...mini(), semester: 'ב' }, { passed: [], failed: {} }), ['B']), []); // not afterA
});

test('afterANotes: courses that wait for the same א׳ course name it once, for different ones both', () => {
  const statuses = {
    Z1: { status: 'afterA', reasons: [], after: [alt('X'), alt('Y')] },
    Z2: { status: 'afterA', reasons: [], after: [alt('X')] },
    Z3: { status: 'afterA', reasons: [] } // an older status without the names
  };
  assert.deepEqual(afterANotes({ statuses }, ['Z1', 'Z2', 'Z3']), ['התכנון של ב׳ מניח שעוברים את X, Y בא׳']);
  assert.deepEqual(afterANotes({ statuses }, ['Z3']), []);
});

// Codex review: a prerequisite with alternatives (X or Y) is met by either one, so the line must not say both.
test('alternative prerequisites read "X או Y", not both required', () => {
  const c = (name, prereqs = []) => ({ name, credits: 3, offered: true, groups: [], prereqs });
  const A = { year: 2027, startYear: 2026, semester: 'א', lists: [], courses: { X: c('X'), Y: c('Y'), W: c('W') } };
  const B = {
    year: 2027, startYear: 2026, semester: 'ב', lists: [], courses: {
      Z: c('Z', [{ kind: 'קדם', anyOf: [{ id: 'X', name: 'X' }, { id: 'Y', name: 'Y' }] }]),
      V: c('V', [{ kind: 'קדם', anyOf: [{ id: 'W', name: 'W' }] }, { kind: 'קדם', anyOf: [{ id: 'X', name: 'X' }, { id: 'Y', name: 'Y' }] }]),
    },
  };
  const state = { passed: [], failed: {} };
  const { statuses } = withAfterA(B, state, classify(B, state), A);
  assert.deepEqual(nm(statuses.Z.after), [['X', 'Y']]);
  assert.deepEqual(afterANotes({ statuses }, ['Z']), ['התכנון של ב׳ מניח שעוברים את X או Y בא׳']);
  // two open prerequisites: one group each; the same alternatives of another course are named once
  assert.deepEqual(nm(statuses.V.after), [['W'], ['X', 'Y']]);
  assert.deepEqual(afterANotes({ statuses }, ['Z', 'V']), ['התכנון של ב׳ מניח שעוברים את X או Y, W בא׳']);
  // the year pair keeps its words: each course the plan took in א׳ is a name of its own
  assert.equal(afterAText([['X'], ['Y']]), 'התכנון של ב׳ מניח שעוברים את X, Y בא׳');
});

test('the year pair says it in the same words as "רק ב׳"', () => {
  const dataA = { ...mini(), semester: 'א' }, dataB = { ...mini(), semester: 'ב' };
  const state = { passed: [], failed: {}, choices: { A: 'must', B: 'must' }, semesterOf: { A: 'א', B: 'ב' }, load: 'even' };
  const pair = searchYear({ dataA, dataB, state, yearList: new Set(), weights: W0 }).results[0];
  assert.deepEqual([pair.a.courses, pair.b.courses], [['A'], ['B']]);
  assert.ok(pair.warnings.includes(LINE), pair.warnings.join(' | '));
});

// Codex review, rounds 2 and 3: a corequisite that an א׳ candidate meets is counted passed too, so the line names it,
// unless the ב׳ plan holds that corequisite itself. One only ב׳ offers is owed in ב׳ (missingParallel): nothing to assume.
test('a corequisite is named when the plan leaves it to א׳, not when the plan holds it in ב׳, not when only ב׳ offers it', () => {
  const c = (name, prereqs = [], offered = true) => ({ name, credits: 3, offered, groups: [], prereqs });
  const A = { year: 2027, startYear: 2026, semester: 'א', lists: [], courses: { X: c('X'), Y: c('Y') } };
  const B = {
    year: 2027, startYear: 2026, semester: 'ב', lists: [], courses: {
      X: c('X', [], false), Y: c('Y'), W: c('W'),
      Z: c('Z', [{ kind: 'קדם', anyOf: [{ id: 'X', name: 'X' }] }, { kind: 'מקביל', anyOf: [{ id: 'Y', name: 'Y' }] }]),
      V: c('V', [{ kind: 'קדם', anyOf: [{ id: 'X', name: 'X' }] }, { kind: 'מקביל', anyOf: [{ id: 'W', name: 'W' }] }]),
    },
  };
  const state = { passed: [], failed: {} };
  const { statuses } = withAfterA(B, state, classify(B, state), A);
  assert.equal(statuses.Z.status, 'afterA');
  assert.deepEqual([nm(statuses.Z.after), nm(statuses.Z.afterCo)], [[['X']], [['Y']]]);
  assert.equal(statuses.Z.reasons[0], 'אפשר בסמסטר ב׳ אחרי X'); // the map keeps its words
  // the plan leaves Y to א׳ (it is not in ב׳'s plan): both are assumed
  assert.deepEqual(afterANotes({ statuses }, ['Z']), ['התכנון של ב׳ מניח שעוברים את X, Y בא׳']);
  // the plan holds Y in ב׳ itself: only X is assumed
  assert.deepEqual(afterANotes({ statuses }, ['Z', 'Y']), ['התכנון של ב׳ מניח שעוברים את X בא׳']);
  // W is offered only in ב׳: still owed there (missingParallel), never assumed
  assert.equal(statuses.V.status, 'afterA');
  assert.deepEqual([nm(statuses.V.after), statuses.V.afterCo, statuses.V.missingParallel], [[['X']], [], [['W']]]);
  assert.deepEqual(afterANotes({ statuses }, ['V']), ['התכנון של ב׳ מניח שעוברים את X בא׳']);
});

// Codex review, round 4: the corequisite may have alternatives (Y or W); W, offered only in ב׳, in the plan meets it.
test('a corequisite met by an alternative that only ב׳ offers needs nothing from א׳ when the plan holds it', () => {
  const c = (name, prereqs = []) => ({ name, credits: 3, offered: true, groups: [], prereqs });
  const A = { year: 2027, startYear: 2026, semester: 'א', lists: [], courses: { X: c('X'), Y: c('Y') } };
  const B = {
    year: 2027, startYear: 2026, semester: 'ב', lists: [], courses: {
      W: c('W'),
      Z: c('Z', [{ kind: 'קדם', anyOf: [{ id: 'X', name: 'X' }] }, { kind: 'מקביל', anyOf: [{ id: 'Y', name: 'Y' }, { id: 'W', name: 'W' }] }]),
    },
  };
  const state = { passed: [], failed: {} };
  const { statuses } = withAfterA(B, state, classify(B, state), A);
  assert.equal(statuses.Z.status, 'afterA');
  assert.deepEqual(statuses.Z.afterCo[0].map((a) => a.id), ['Y', 'W']); // W kept for the plan check
  assert.deepEqual(afterANotes({ statuses }, ['Z']), ['התכנון של ב׳ מניח שעוברים את X, Y בא׳']);
  assert.deepEqual(afterANotes({ statuses }, ['Z', 'W']), ['התכנון של ב׳ מניח שעוברים את X בא׳']);
});

test('a "רק ב׳" plan with no afterA course has no such line', () => {
  const dataB = { ...mini(), semester: 'ב' };
  const state = { passed: ['A'], failed: {}, profile: { year: 1 } }; // A passed: B is plain available
  const cls = withAfterA(dataB, state, classify(dataB, state), { ...mini(), semester: 'א' });
  const res = search({ data: dataB, courses: [{ id: 'B', mode: 'must' }], statuses: cls.statuses, weights: W0, friends: [], constraints: {}, topK: 5 }).results[0];
  assert.deepEqual(res.courses, ['B']);
  const t = text(advisorHtml({ state, data: dataB, res, cls, catalog, now: NOW }));
  assert.ok(!t.includes('מניח שעוברים'));
});
