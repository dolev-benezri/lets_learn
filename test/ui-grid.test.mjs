import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hourRange, nearestStep, summary, initials, firstName, rankText, assignColors, repeatIds, progressRanks, altGroups, backups, isPair, semResult, resCourses, resGroups, placedIn, yearTotals, groupOptions, typeLabel, renderWeek } from '../web/ui-grid.js';

const m = (day, start, end) => ({ day, start, end });

test('hourRange: pads an hour, clamps padding to 08-21, never cuts a block', () => {
  assert.deepEqual(hourRange([]), { from: 8, to: 18, days: 5 });
  assert.deepEqual(hourRange([m(1, '10:00', '11:50'), m(3, '14:00', '15:30')]), { from: 9, to: 17, days: 5 });
  assert.deepEqual(hourRange([m(2, '08:00', '09:50'), m(5, '19:00', '20:30')]), { from: 8, to: 21, days: 5 });
  assert.deepEqual(hourRange([m(2, '07:30', '09:00'), m(5, '21:00', '22:15')]), { from: 7, to: 23, days: 5 });
  assert.equal(hourRange([m(6, '09:00', '10:00')]).days, 6);
  assert.deepEqual(hourRange([m(0, '09:00', '10:00')]), { from: 8, to: 18, days: 5 }); // no real day
});

test('nearestStep: reads a stored weight back to the nearest scale step, ties go up', () => {
  assert.equal(nearestStep(0, [0, 1, 3, 5]), 0);
  assert.equal(nearestStep(2, [0, 1, 3, 5]), 3);
  assert.equal(nearestStep(4.5, [0, 1, 3, 5]), 5);
  assert.equal(nearestStep(1.4, [0, 1, 2, 3]), 1);
  assert.equal(nearestStep(0.5, [0, 1, 2, 3]), 1);
});

test('summary: credits, free days, gaps, friends and exam gap of one alternative', () => {
  const data = { courses: {
    A: { credits: 5, groups: [{ id: 'a1', meetings: [m(1, '08:00', '10:00')] }, { id: 'a1/1', meetings: [m(3, '10:00', '11:00')] }] },
    B: { credits: 2.5, groups: [{ id: 'b1', meetings: [m(2, '12:00', '14:00')] }, { id: 'b2', meetings: [m(5, '12:00', '14:00')] }] },
  } };
  const res = { courses: ['A', 'B'], groups: ['a1', 'a1/1', 'b1'], breakdown: { compact: 0.85 }, explanation: 'x · לפחות 3 ימים בין בחינות' };
  const friends = [{ name: 'נועה', groups: ['b1'], active: true }, { name: 'דן', groups: ['b2'], active: true }, { name: 'off', groups: ['a1'], active: false }];
  assert.deepEqual(summary(res, data, friends), { credits: 7.5, freeDays: [4, 5], gapH: 1.5, withFriends: [{ name: 'נועה', n: 1 }], examGap: '3' });
  assert.equal(summary({ ...res, explanation: 'בלי חלונות' }, data, []).examGap, null);
});

test('initials: two first letters, safe on empty names', () => {
  assert.equal(initials('נועה כהן'), 'נכ');
  assert.equal(initials('  '), '?');
});

test('firstName: first word, long names cut with an ellipsis, safe on empty', () => {
  assert.equal(firstName('נועה כהן'), 'נועה');
  assert.equal(firstName('  דן   לוי '), 'דן');
  assert.equal(firstName('אלכסנדרה לוי'), 'אלכסנד…');
  assert.equal(firstName('  '), '?');
});

test('rankText: plain Hebrew instead of "דירוג N מתוך M"', () => {
  assert.equal(rankText(1, 10), 'מקדמת הכי הרבה בתואר');
  assert.equal(rankText(3, 10), 'מקום 3 מתוך 10 בהתקדמות בתואר');
});

test('assignColors: a course keeps its colour when others leave the plan or new ones appear', () => {
  const m = assignColors(new Map(), ['a', 'b', 'c']);
  assert.deepEqual([...m], [['a', 0], ['b', 1], ['c', 2]]);
  assignColors(m, ['c', 'd']); // 'a' and 'b' dropped out of the plan, 'd' is new
  assert.deepEqual([m.get('c'), m.get('d'), m.get('a')], [2, 3, 0]);
  assignColors(m, ['e', 'f', 'g', 'h', 'i']);
  assert.equal(m.get('i'), 0); // wraps after 8
});

test('assignColors: no two courses of the shown alternative share a colour, even when sticky colours clash; repeats only beyond 8', () => {
  const m = new Map([['a', 0], ['b', 0], ['c', 0], ['x', 3]]); // stale clashes from earlier alternatives
  assignColors(m, ['a', 'b', 'c', 'x']);
  assert.equal(new Set(['a', 'b', 'c', 'x'].map((id) => m.get(id))).size, 4);
  assert.equal(m.get('a'), 0); // first keeps its sticky colour
  assert.equal(repeatIds(m, ['a', 'b', 'c', 'x']).size, 0);
  const ten = Array.from({ length: 10 }, (_, i) => `k${i}`);
  assignColors(m, ten);
  assert.equal(new Set(ten.map((id) => m.get(id))).size, 8);
  assert.deepEqual([...repeatIds(m, ten)], ['k8', 'k9']);
});

test('progressRanks: ranks by breakdown.progress, ties share rank (1,1,3 style)', () => {
  const res = (p) => ({ breakdown: { progress: p } });
  assert.deepEqual(progressRanks([res(0.9), res(0.9), res(0.8), res(0.5)]), [1, 1, 3, 4]);
  assert.deepEqual(progressRanks([res(0.5), res(0.9)]), [2, 1]);
  assert.deepEqual(progressRanks([res(0.5)]), [1]);
  assert.deepEqual(progressRanks([]), []);
});

test('altGroups: same course+type groups, flagged when they clash with the rest of the alternative', () => {
  const g = (id, type, meetings, linked = []) => ({ id, type, meetings, linked, primary: !id.includes('/'), full: false, exams: [], lecturer: '' });
  const data = { courses: {
    A: { groups: [g('a1', 'L', [m(1, '08:00', '10:00')], ['a1/1']), g('a2', 'L', [m(2, '08:00', '10:00')], ['a2/1']), g('a3', 'L', [m(3, '08:00', '10:00')], ['a3/1']),
      g('a1/1', 'T', [m(4, '08:00', '10:00')]), g('a2/1', 'T', [m(5, '08:00', '10:00')]), g('a3/1', 'T', [m(2, '09:00', '11:00')])] },
    B: { groups: [g('b1', 'L', [m(2, '09:00', '10:00')])] },
  } };
  const alt = ['a1', 'a1/1', 'b1'];
  const clash = (gid) => Object.fromEntries(altGroups(data, alt, gid).map((x) => [x.g.id, x.clash]));
  // a2 hits B itself; a3 only through its own tutorial (and a2/1 through its lecture); other types and the current groups are ignored
  assert.deepEqual(clash('a1'), { a1: false, a2: true, a3: true });
  assert.deepEqual(clash('a1/1'), { 'a1/1': false, 'a2/1': true, 'a3/1': true });
  assert.deepEqual(clash('b1'), { b1: false });
});

const mk = (id, type, meetings, linked = [], extra = {}) => ({ id, type, meetings, linked, primary: !id.includes('/'), full: false, exams: [], lecturer: '', ...extra });
const course = (groups) => ({ A: { groups }, B: { groups: [mk('b1', 'L', [m(2, '09:00', '10:00')])] } });

test('altGroups: ok=false for a tutorial whose lecture is full or that no lecture links to', () => {
  const data = { courses: course([
    mk('a1', 'L', [m(1, '08:00', '10:00')], ['a1/1']), mk('a2', 'L', [m(3, '08:00', '10:00')], ['a2/1'], { full: true }),
    mk('a1/1', 'T', [m(4, '08:00', '10:00')]), mk('a2/1', 'T', [m(5, '08:00', '10:00')]), mk('a9/1', 'T', [m(5, '12:00', '13:00')]),
  ]) };
  const ok = (includeFull) => Object.fromEntries(altGroups(data, ['a1', 'a1/1'], 'a1/1', includeFull).map((x) => [x.g.id, x.ok]));
  assert.deepEqual(ok(false), { 'a1/1': true, 'a2/1': false, 'a9/1': false });
  assert.equal(ok(true)['a2/1'], true);
  assert.equal(altGroups(data, ['a1', 'a1/1'], 'a1')[1].ok, true); // a full lecture can still be pinned
});

test('backups: a lecture backup is listed with its own tutorial, not matched against the chosen tutorial', () => {
  const data = { courses: course([
    mk('a1', 'L', [m(1, '08:00', '10:00')], ['a1/1']), mk('a2', 'L', [m(3, '08:00', '10:00')], ['a2/1']), mk('a3', 'L', [m(2, '09:00', '10:00')], ['a3/1']),
    mk('a4', 'L', [m(5, '08:00', '10:00')], ['a4/1']), mk('a5', 'L', [m(5, '12:00', '14:00')], ['a5/1']),
    mk('a1/1', 'T', [m(4, '08:00', '10:00')]), mk('a2/1', 'T', [m(4, '12:00', '13:00')]), mk('a3/1', 'T', [m(4, '14:00', '15:00')]),
    mk('a4/1', 'T', [m(4, '16:00', '17:00')], [], { full: true }), mk('a5/1', 'T', [m(6, '08:00', '09:00')]),
  ]) };
  const res = { groups: ['a1', 'a1/1', 'b1'], alts: {} };
  // a3 clashes with b1, a4's tutorial is full
  assert.deepEqual(backups(data, res, 'a1'), ['a2 + a2/1', 'a5 + a5/1']);
  assert.deepEqual(backups(data, { ...res, alts: { a1: ['a2'] } }, 'a1'), ['a5 + a5/1']);
  assert.deepEqual(backups(data, res, 'b1'), []);
});

test('backups: a tutorial backup must belong to the chosen lecture', () => {
  const data = { courses: course([
    mk('a1', 'L', [m(1, '08:00', '10:00')], ['a1/1', 'a1/2']), mk('a2', 'L', [m(3, '08:00', '10:00')], ['a2/1']),
    mk('a1/1', 'T', [m(4, '08:00', '10:00')]), mk('a1/2', 'T', [m(5, '08:00', '10:00')]), mk('a2/1', 'T', [m(5, '12:00', '13:00')]),
  ]) };
  assert.deepEqual(backups(data, { groups: ['a1', 'a1/1', 'b1'] }, 'a1/1'), ['a1/2']);
});

test('year pairs: shown-semester result, empty halves, totals and placement', () => {
  const single = { courses: ['A'], groups: ['a1'], breakdown: { compact: 0.9 } };
  const pair = { a: { courses: ['A'], groups: ['a1'], breakdown: { compact: 0.8, progress: 2 } }, b: null, credits: { a: 5, b: 0 }, missing: [], warnings: [] };
  assert.equal(isPair(single), false); assert.equal(isPair(pair), true); assert.equal(isPair(null), false);
  assert.equal(semResult(single, 'ב'), single);
  assert.equal(semResult(pair, 'א').breakdown.compact, 0.8);
  assert.deepEqual(semResult(pair, 'ב').courses, []); // a null half still renders and summarises
  assert.equal(semResult({ ...pair, a: { courses: [], groups: [], breakdown: {} } }, 'א').breakdown.compact, 1); // the empty א׳ plan has no breakdown
  const full = { ...pair, b: { courses: ['B'], groups: ['b1'], breakdown: {} }, credits: { a: 5, b: 2.5 } };
  assert.deepEqual(resCourses(full), ['A', 'B']); assert.deepEqual(resGroups(full), ['a1', 'b1']);
  assert.deepEqual(yearTotals(full), { courses: 2, credits: 7.5 });
  assert.deepEqual([placedIn(full, 'A'), placedIn(full, 'B'), placedIn(full, 'C')], ['א', 'ב', null]);
  assert.deepEqual(resCourses(single), ['A']);
});

test('groupOptions: groups by type with label per option (day time lecturer id)', () => {
  const g = (id, type, day, start, end, lecturer = 'ד״ר כהן', linked = []) =>
    ({ id, type, lecturer, linked, primary: !id.includes('/'), full: false, exams: [], meetings: [{ day, start, end }] });
  const course = { groups: [
    g('L1', 'סופי-הרצאה', 2, '09:00', '10:50'),
    g('L1/T1', 'תרגול', 3, '11:00', '12:00'),
    g('L1/T2', 'תרגול', 4, '13:00', '14:00'),
  ] };
  const opts = groupOptions(course);
  assert.equal(opts.length, 2);
  assert.equal(opts[0].type, 'סופי-הרצאה');
  assert.equal(opts[0].options.length, 1);
  assert.equal(opts[0].options[0].id, 'L1');
  assert.equal(opts[0].options[0].label, 'הרצאה · ב׳ 09:00–10:50 · ד״ר כהן (L1)');
  assert.equal(opts[1].type, 'תרגול');
  assert.equal(opts[1].options.length, 2);
  assert.equal(opts[1].options[0].label, 'תרגול · ג׳ 11:00–12:00 · ד״ר כהן (L1/T1)');
  assert.equal(opts[1].options[1].label, 'תרגול · ד׳ 13:00–14:00 · ד״ר כהן (L1/T2)');
});

test('a block wraps the end time in .blk-end so narrow blocks can drop it', () => {
  const data = {
    courses: {
      A: {
        name: 'Test Course',
        groups: [{
          id: 'a1',
          type: 'הרצאה',
          meetings: [{ day: 2, start: '08:00', end: '10:00' }],
          linked: [],
          primary: true,
          full: false,
          exams: [],
          lecturer: '',
        }],
      },
    },
  };
  const res = { courses: ['A'], groups: ['a1'] };
  const range = { from: 8, to: 18, days: 5 };
  const colors = new Map([['A', 0]]);
  const ctx = {
    data,
    res,
    range,
    colors,
    dashed: new Set(),
    pins: [],
    friends: [],
    day: null,
  };
  const html = renderWeek(ctx);
  assert.match(html, /<bdi dir="ltr">08:00<span class="blk-end">–10:00<\/span><\/bdi>/);
});
