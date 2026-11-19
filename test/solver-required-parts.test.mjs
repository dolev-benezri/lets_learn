// Deep scan 2026-11-19, finding 1: the solver never offers a lecture whose type promises a tutorial or a lab (the
// "+תרגול" in `סופי-הרצאה+תרגול`) without a group of that type. Synthetic data only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOptions, promisedParts, search } from '../web/solver-core.js';
import { buildDataset } from '../scripts/build.mjs';

const mtg = (day, semester = 'א') => ({ semester, day, start: '10:00', end: '11:50', room: 'r' });
// a group as the scraper hands it to buildDataset (semester on its meetings)
const raw = (id, type, linked = [], day = 1, meetings = [mtg(day)]) => ({
  id, type, primary: type.startsWith('סופי'), lecturer: 'L', full: false, linked, meetings, detailsArgs: null
});
const LT = 'סופי-הרצאה+תרגול', LL = 'סופי-הרצאה+מעבדה';
const ids = (course, over) => buildOptions(course, over).map((o) => o.groups);
// a course in the built shape (what buildDataset returns)
const course = (...groups) => ({
  groups: groups.map((g) => ({ semester: 'א', exams: [], ...g, meetings: g.meetings.map(({ semester: _s, ...m }) => m) }))
});

test('promisedParts: what the type adds after the lecture', () => {
  assert.deepEqual(promisedParts({ type: 'סופי-הרצאה+תרגול' }), ['תרגול']);
  assert.deepEqual(promisedParts({ type: 'סופי-הרצאה+תרגול+מעבדה' }), ['תרגול', 'מעבדה']);
  assert.deepEqual(promisedParts({ type: 'סופי-הרצאה' }), []);
  assert.deepEqual(promisedParts({ type: 'סופי-מעבדה' }), []);
  assert.deepEqual(promisedParts({ type: 'תרגול' }), []);
});

test('a lecture whose type promises a tutorial is not offered without one', () => {
  const c = course(raw('P1', LT, [], 1));
  assert.deepEqual(ids(c), []);
  assert.deepEqual(ids(c, { includeFull: true, pins: ['P1'] }), [], 'a pin does not bring it back');
  assert.deepEqual(ids(c, { split: true }), [], 'nor does split: there is no tutorial slot to fill');
});

test('plain lecture, and a lab or tutorial that is itself the primary, need nothing more', () => {
  const c = course(raw('L1', 'סופי-הרצאה', [], 1), raw('M1', 'סופי-מעבדה', [], 2), raw('T1', 'סופי-תרגול', [], 3));
  assert.deepEqual(ids(c), [['L1'], ['M1'], ['T1']]);
});

test('with a valid alternative tutorial the lecture stays; the lecture without any is the only one left out', () => {
  const c = course(
    raw('P1', LT, ['P1/1'], 1), raw('P1/1', 'תרגול', [], 2),
    raw('P2', LT, [], 3),
    raw('P3', LT, ['P3/1', 'P3/2'], 4), raw('P3/1', 'תרגול', [], 5), raw('P3/2', 'תרגול', [], 6)
  );
  assert.deepEqual(ids(c), [['P1', 'P1/1'], ['P3', 'P3/1'], ['P3', 'P3/2']]);
});

test('the promised part must be of that type: a lab is no tutorial', () => {
  const c = course(raw('P1', LT, ['P1/m'], 1), raw('P1/m', 'מעבדה', [], 2));
  assert.deepEqual(ids(c), []);
  const l = course(raw('P1', LL, ['P1/m'], 1), raw('P1/m', 'מעבדה', [], 2));
  assert.deepEqual(ids(l), [['P1', 'P1/m']]);
});

test('a lecture that promises both parts needs both, in one chain', () => {
  const t = 'סופי-הרצאה+תרגול+מעבדה';
  const both = course(raw('P1', t, ['P1/1'], 1), raw('P1/1', 'תרגול', ['L1'], 2), raw('L1', 'מעבדה', [], 3));
  assert.deepEqual(ids(both), [['P1', 'P1/1', 'L1']]);
  const noLab = course(raw('P1', t, ['P1/1'], 1), raw('P1/1', 'תרגול', [], 2));
  assert.deepEqual(ids(noLab), []);
});

test('a linked id that is not in the course counts as no tutorial', () => {
  assert.deepEqual(ids(course(raw('P1', LT, ['P1/9'], 1))), []);
});

test('buildDataset then buildOptions: the build drops the tutorial and its link, the lecture is not offered', () => {
  const dataset = (groups) => buildDataset({
    year: 2027, startYear: 2026, program: 30, semester: 'א', department: 'מכנית', fetchedAt: '2026-10-01T00:00:00Z',
    lists: [{ code: 1, name: 'חובה', minCredits: 1, courses: [{ id: 'X', name: 'קורס', offered: true }] }],
    raw: { X: { groups, details: { credits: 3, prereqs: [] } } },
    exams: [], warnings: []
  });
  // the only tutorial has no meetings: the build drops it and its link, the lecture's type still promises it
  const lone = dataset([raw('X1', LT, ['X1/1'], 1), raw('X1/1', 'תרגול', [], 2, [])]);
  assert.deepEqual(lone.courses.X.groups.map((g) => g.id), ['X1']);
  assert.deepEqual(lone.courses.X.groups[0].linked, []);
  assert.deepEqual(ids(lone.courses.X), []);
  // a second tutorial of the same lecture is a valid alternative: the lecture stays, with that one
  const alt = dataset([raw('X1', LT, ['X1/1', 'X1/2'], 1), raw('X1/1', 'תרגול', [], 2, []), raw('X1/2', 'תרגול', [], 3)]);
  assert.deepEqual(ids(alt.courses.X), [['X1', 'X1/2']]);
  // another lecture group keeps the course alive
  const other = dataset([
    raw('X1', LT, ['X1/1'], 1), raw('X1/1', 'תרגול', [], 2, []),
    raw('X2', LT, ['X2/1'], 4), raw('X2/1', 'תרגול', [], 5)
  ]);
  assert.deepEqual(ids(other.courses.X), [['X2', 'X2/1']]);
});

test('search: a must course whose every lecture lacks its tutorial says so, not "constraints"', () => {
  const data = {
    fetchedAt: 'x', year: 2027, startYear: 2026, program: 30, semester: 'א', examsPublished: false, lists: [],
    courses: { X: { name: 'חדו"א 2', credits: 5, offered: true, prereqs: [], groups: course(raw('X1', LT, [], 1)).groups } }
  };
  const r = search({ data, courses: [{ id: 'X', mode: 'must' }] });
  assert.equal(r.results.length, 0);
  assert.match(r.diagnosis[0], /חדו"א 2/);
  assert.match(r.diagnosis[0], /תרגול/);
  assert.doesNotMatch(r.diagnosis[0], /אילוצים/);
});

// Codex review: the "missing hours" reason is only for a course the rule alone empties. A pin, an avoided lecturer or
// a full group in the way of a healthy lecture is the student's own limit, and the generic reason names it.
test('diagnosis: a healthy lecture beside the incomplete one means the reason is the limits, not missing hours', () => {
  const data = {
    fetchedAt: 'x', year: 2027, startYear: 2026, semester: 'א', examsPublished: false, lists: [],
    courses: { X: { name: 'חדו"א 2', credits: 5, offered: true, prereqs: [], groups: course(
      raw('X1', LT, [], 1), raw('X2', LT, ['X2/1'], 4), raw('X2/1', 'תרגול', [], 5)
    ).groups } }
  };
  data.courses.X.groups.find((g) => g.id === 'X2').lecturer = 'M';
  const missing = /חסרות שעות/;
  const pinned = search({ data, courses: [{ id: 'X', mode: 'must' }], pins: ['X1'] });
  assert.equal(pinned.results.length, 0);
  assert.doesNotMatch(pinned.diagnosis[0], missing, 'pin on the incomplete lecture');
  const avoided = search({ data, courses: [{ id: 'X', mode: 'must' }], constraints: { lecturers: { M: 'avoid' } } });
  assert.equal(avoided.results.length, 0);
  assert.doesNotMatch(avoided.diagnosis[0], missing, 'the healthy lecture\'s lecturer avoided');
  const blocked = search({ data, courses: [{ id: 'X', mode: 'must' }], constraints: { blocks: [{ day: 4, start: '09:00', end: '12:00' }] } });
  assert.doesNotMatch(blocked.diagnosis[0], missing, 'busy time over the healthy lecture');
});

// Codex review: the edit page loads a student's own schedule as the baseline. A course whose loaded lecture has no group of
// a part its type promises is "fixed" (kept as loaded) like one with a missing linked group, not a real course the search
// cannot place, which would leave every proposal empty.
test('edit page: a baseline lecture lacking the part its type promises is a fixed course', async () => {
  const { kinds } = await import('../web/edit-search.js');
  const data = {
    courses: {
      X: { name: 'א', credits: 3, offered: true, prereqs: [], groups: course(raw('X1', LT, [], 1)).groups },
      Y: { name: 'ב', credits: 3, offered: true, prereqs: [], groups: course(raw('Y1', LT, ['Y1/1'], 2), raw('Y1/1', 'תרגול', [], 3)).groups },
      // lecture -> tutorial -> lab: the lab is reached through the tutorial, still a whole course
      Z: { name: 'ג', credits: 3, offered: true, prereqs: [], groups: course(
        raw('Z1', 'סופי-הרצאה+תרגול+מעבדה', ['Z1/1'], 4), raw('Z1/1', 'תרגול', ['Z1/m'], 5), raw('Z1/m', 'מעבדה', [], 6)
      ).groups },
      // two tutorials, only the second leads to the lab: a baseline with the first has no lab, though the lab is reachable
      W: { name: 'ד', credits: 3, offered: true, prereqs: [], groups: course(
        raw('W1', 'סופי-הרצאה+תרגול+מעבדה', ['W1/1', 'W1/2'], 1), raw('W1/1', 'תרגול', [], 2), raw('W1/2', 'תרגול', ['W1/m'], 3), raw('W1/m', 'מעבדה', [], 4)
      ).groups }
    }
  };
  const edit = {
    baseline: [{ course: 'X', group: 'X1' }, { course: 'Y', group: 'Y1' }, { course: 'Y', group: 'Y1/1' },
      { course: 'Z', group: 'Z1' }, { course: 'Z', group: 'Z1/1' }, { course: 'Z', group: 'Z1/m' },
      { course: 'W', group: 'W1' }, { course: 'W', group: 'W1/1' }],
    movable: [], swaps: {}
  };
  assert.deepEqual(kinds(edit, data), { real: ['Y', 'Z'], fixed: ['X', 'W'] });
});
