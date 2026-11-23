// The improve page's course search (web/course-search.js): pure, on the frozen real data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchCourses, stripTitle, optionLine, MAX_RESULTS, matches } from '../web/course-search.js';
import { classify } from '../web/rules.js';
import { real } from './fixtures/real.mjs';

const A = real('2027-1/30-2026.json');
const B = real('2027-2/30-2026.json');
const OTHER = real('2027-1/10-2024.json');
const record = (passed = []) => ({ passed, failed: {}, exempt: [], profile: { year: 2, amirnet: null } });
const ctx = (over = {}) => ({
  data: { 'א': A, 'ב': B }, foreign: null, sem: 'א', week: [], inSchedule: new Set(), statuses: classify(A, record()).statuses, registered: false, owned: [], split: false, ...over
});
const find = (r, id) => r.list.find((x) => x.id === id);
const course = (id) => A.courses[id];
const lesson = (cid, g) => course(cid).groups.find((x) => x.id === g).meetings.map((m) => ({ course: cid, name: course(cid).name, ...m }));

test('nothing asked is no list: the caller says how to ask', () => {
  assert.deepEqual(searchCourses(ctx(), { text: '  ' }), { list: [], more: false, empty: true });
  assert.equal(searchCourses(ctx(), { text: 'כימיה' }).empty, false);
});

test('a code prefix finds the course by its key, a group id prefix by one of its groups (and narrows its options to it)', () => {
  const byCode = searchCourses(ctx(), { text: '3000' });
  assert.ok(find(byCode, '30003'), 'the key starts with it');
  const gid = course('30003').groups[0].id;
  const byGroup = searchCourses(ctx(), { text: gid });
  const row = find(byGroup, '30003');
  assert.ok(row, 'a group id');
  assert.ok(row.options.length >= 1 && row.options.every((o) => o.ids.includes(gid) || course('30003').groups.some((g) => o.ids.includes(g.id) && g.id.startsWith(gid))), 'only the options with that group');
});

test('a name part (a first letter works) and a lecturer part, titles aside', () => {
  const name = searchCourses(ctx(), { text: 'כימי' });
  assert.ok(find(name, '30003'), 'a name part');
  assert.ok(searchCourses(ctx(), { text: 'מ' }).list.length > 3, 'a first letter');
  const g = course('30003').groups[0], who = stripTitle(g.lecturer);
  assert.ok(who && who !== g.lecturer, 'the fixture lecturer has a title');
  const first = who.split(' ')[0];
  const byLecturer = searchCourses(ctx(), { text: first });
  assert.ok(byLecturer.list.some((r) => r.options.some((o) => o.lecturer.includes(first))), 'a lecturer part');
  assert.equal(stripTitle('ד"ר לפיד הדס'), 'לפיד הדס');
  assert.equal(stripTitle('גב\' נסים רונלי'), 'נסים רונלי');
  assert.equal(stripTitle('מר קרני ירדן'), 'קרני ירדן');
  assert.doesNotThrow(() => searchCourses(ctx(), { text: 'ד"ר' }), 'a title alone is just text');
});

const tiny = (meetings) => ({
  courses: {
    77001: {
      name: 'קורס בדיקה', credits: 3, offered: true, prereqs: [],
      groups: [{ id: '277700101', type: 'הרצאה', primary: true, lecturer: 'ד"ר בדיקה אבי', full: false, semester: 'א', linked: [], meetings, exams: [] }]
    }
  }
});
test('a day, and an hour inside a meeting (its start counts, its end does not), on the day or on any', () => {
  const c = (meetings, q) => searchCourses({ data: { 'א': tiny(meetings) }, sem: 'א', statuses: {}, week: [] }, q);
  const one = [{ day: 2, start: '10:00', end: '11:50', room: '' }];
  assert.equal(c(one, { day: 2 }).list.length, 1, 'a day');
  assert.equal(c(one, { day: 3 }).list.length, 0, 'another day');
  assert.equal(c(one, { day: 2, hour: '10:00' }).list.length, 1, 'the hour of its start');
  assert.equal(c(one, { day: 2, hour: '11:00' }).list.length, 1, 'an hour inside');
  assert.equal(c(one, { day: 2, hour: '11:50' }).list.length, 0, 'its end is not inside');
  assert.equal(c(one, { day: 2, hour: '09:00' }).list.length, 0, 'before it starts');
  assert.equal(c(one, { hour: '11:00' }).list.length, 1, 'an hour on any day');
  assert.equal(c(one, { day: 3, hour: '11:00' }).list.length, 0, 'the hour on the wrong day');
  assert.equal(c(one, { text: 'בדיקה', day: 2, hour: '10:30' }).list.length, 1, 'text and time together');
  assert.equal(c(one, { text: 'אבי', day: 2 }).list.length, 1, 'a lecturer and a day');
  assert.equal(c(one, { text: 'אחר', day: 2 }).list.length, 0, 'text that names nothing');
});

test('each option says whether it fits the week: "fits", "clash" with the names (the course itself left out), "full"', () => {
  const g = course('30003').groups.find((x) => x.primary);
  const week = lesson('30003', g.id); // the course itself in the week: never a clash with itself
  const self = searchCourses(ctx({ week, inSchedule: new Set(['30003']) }), { text: '30003' });
  const row = find(self, '30003');
  assert.equal(row.inSchedule, true);
  assert.ok(row.options.every((o) => o.clash.length === 0), 'the course itself is left out');
  // another course sitting in the same hours clashes with the option that meets then
  const other = Object.entries(A.courses).find(([id, c]) => id !== '30003' && c.groups.some((x) => x.primary && x.meetings.length));
  const blocker = other[1].groups.find((x) => x.primary && x.meetings.length);
  const clashWeek = g.meetings.map((m) => ({ course: other[0], name: other[1].name, day: m.day, start: m.start, end: m.end }));
  const r = find(searchCourses(ctx({ week: clashWeek }), { text: '30003' }), '30003');
  const hit = r.options.find((o) => o.fit === 'clash');
  assert.ok(hit, 'an option that meets in the same hours clashes');
  assert.deepEqual(hit.clash, [other[1].name]);
  assert.ok(blocker);
  // a full part: any option with a full group says "full" unless the student owns it
  const fullId = Object.entries(A.courses).flatMap(([id, c]) => c.groups.filter((x) => x.full).map((x) => [id, x.id]))[0];
  if (fullId) {
    const rr = find(searchCourses(ctx(), { text: fullId[0] }), fullId[0]);
    assert.ok(rr.options.some((o) => o.fit === 'full'), 'a full part');
    const owned = find(searchCourses(ctx({ owned: [fullId[1]], registered: true }), { text: fullId[0] }), fullId[0]);
    assert.ok(owned.options.filter((o) => o.ids.includes(fullId[1])).every((o) => o.fit !== 'full'), 'a group the student already owns is not full to them');
  }
});

test('a course with no buildable option has no options and no button to give it (a lecture whose type promises a tutorial no group of the course has)', () => {
  const lonely = { courses: { 77002: { name: 'קורס בלי תרגול', credits: 3, offered: true, prereqs: [], groups: [{ id: '277700201', type: 'סופי-הרצאה+תרגול', primary: true, lecturer: 'מר בדיקה', full: false, semester: 'א', linked: [], meetings: [{ day: 2, start: '10:00', end: '11:50', room: '' }], exams: [] }] } } };
  const row = find(searchCourses({ data: { 'א': lonely }, sem: 'א', statuses: { 77002: { status: 'available', reasons: [] } }, week: [] }, { text: 'בלי תרגול' }), '77002');
  assert.ok(row, 'the course is listed');
  assert.deepEqual(row.options, []);
});

test('a conditional course says what it needs in parallel, a closed course says why', () => {
  const cond = Object.entries(ctx().statuses).find(([, s]) => s.status === 'conditional');
  if (cond) {
    const row = find(searchCourses(ctx(), { text: cond[0] }), cond[0]);
    assert.equal(row.open, true);
    assert.match(row.needs, /^דורש במקביל: .+/);
  }
  const passed = '30003';
  const closed = find(searchCourses(ctx({ statuses: classify(A, record([passed])).statuses }), { text: passed }), passed);
  assert.equal(closed.open, false);
  assert.equal(closed.why, 'עברת את הקורס');
  const blocked = Object.entries(ctx().statuses).find(([, s]) => s.status === 'blocked');
  const b = find(searchCourses(ctx(), { text: blocked[0] }), blocked[0]);
  assert.match(b.why, /^חסרה דרישת קדם/);
});

test('another program\'s and another semester\'s courses are read only, with their reason', () => {
  const word = (d) => Object.values(d.courses).find((c) => c.groups.length).name.split(' ')[0];
  const foreign = searchCourses(ctx({ foreign: { 'א': OTHER } }), { text: word(OTHER), program: 10 });
  assert.ok(foreign.list.length > 0);
  assert.ok(foreign.list.every((r) => r.readOnly && r.readOnlyWhy === 'לא בתוכנית שלך' && !r.open && !r.inSchedule));
  const second = searchCourses(ctx(), { text: word(B), sem: 'ב' });
  assert.ok(second.list.length > 0);
  assert.ok(second.list.every((r) => r.readOnly && r.readOnlyWhy === 'בסמסטר ב׳'));
  const none = searchCourses(ctx({ foreign: null }), { text: word(OTHER), program: 10 });
  assert.deepEqual(none.list, [], 'a program that is not loaded has nothing to show');
});

test('open courses first, then by name; at most 30, and "more" says there were others', () => {
  const r = searchCourses(ctx(), { text: 'ה' });
  assert.ok(r.list.length <= MAX_RESULTS);
  const opens = r.list.map((x) => x.open);
  assert.deepEqual(opens, [...opens].sort((a, b) => Number(b) - Number(a)), 'open first');
  const names = r.list.filter((x) => x.open).map((x) => x.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'he')), 'then by name');
  const many = searchCourses(ctx(), { text: '' , day: 1 });
  assert.equal(many.more, Object.values(A.courses).filter((c) => c.groups.some((g) => g.meetings.some((m) => m.day === 1))).length > MAX_RESULTS);
});

test('optionLine merges a lecture and its tutorial that follow each other, per day', () => {
  assert.equal(optionLine([{ day: 4, start: '14:00', end: '15:50' }, { day: 4, start: '15:50', end: '16:40' }, { day: 2, start: '09:00', end: '10:50' }]), 'יום ב׳ 09:00–10:50, יום ד׳ 14:00–16:40');
});

// ---- the view's HTML (web/ui-course-search.js) ----
import { searchViewHtml, countLine, NO_QUERY } from '../web/ui-course-search.js';
import { parse } from 'node-html-parser';
const view = (s, r, asked = true, failed = false, programs = [{ id: 30, name: 'הנדסת מכונות' }, { id: 10, name: 'הנדסת תוכנה' }]) =>
  parse(searchViewHtml({ text: '', day: '', hour: '', sem: '', program: 'mine', ...s }, programs, r, asked, failed));
const row = (over) => ({ id: '30003', name: 'מבוא לכימיה', code: '30003', credits: 4, open: true, why: '', needs: '', withIds: [], readOnly: false, readOnlyWhy: '', inSchedule: false,
  options: [{ ids: ['273000302', '273000302/1'], line: 'יום ד׳ 14:00–16:50', lecturer: 'כהן יונתן', fit: 'fits', clash: [] }], ...over });

test('the search view: a labelled search field, the chips, a polite count and nothing else when nothing was asked', () => {
  const root = view({}, { list: [], more: false, empty: true }, false);
  const input = root.querySelector('input#csText');
  assert.equal(input.getAttribute('type'), 'search');
  assert.equal(input.getAttribute('placeholder'), 'קוד, שם או מרצה');
  assert.equal(root.querySelector('label[for="csText"]').text, 'חיפוש קורס');
  assert.deepEqual(root.querySelectorAll('.cs-chips select').map((s) => s.getAttribute('data-ed-s')), ['day', 'hour', 'sem', 'program']);
  const count = root.querySelector('#csCount');
  assert.equal(count.getAttribute('aria-live'), 'polite');
  assert.equal(count.text, NO_QUERY);
  assert.equal(root.querySelectorAll('.cs-course').length, 0);
  assert.equal(root.querySelector('[data-ed="closeSearch"]').text.trim(), 'חזרה');
});

test('the count line: one, several, none, "more", and a failed or loading program', () => {
  const l = (n, more = false) => ({ list: Array.from({ length: n }, () => row({})), more });
  assert.equal(countLine(l(1), true), 'קורס אחד');
  assert.equal(countLine(l(12), true), '12 קורסים');
  assert.equal(countLine(l(0), true), 'אין קורס כזה');
  assert.equal(countLine(l(30, true), true), 'יש עוד, מצמצמים?');
  assert.match(countLine(l(0), true, true), /לא הצלחנו לטעון/);
  assert.match(countLine(l(0), true, 'loading'), /טוענים/);
});

test('each course: a heading, its code and credits, options with their tag and the right button', () => {
  const add = view({}, { list: [row({})], more: false }).querySelector('.cs-course');
  assert.equal(add.querySelector('h3').text, 'מבוא לכימיה');
  assert.match(add.querySelector('.cs-meta').text, /30003 · 4 נ״ז/);
  assert.equal(add.querySelectorAll('[data-ed="csAdd"]').length, 1);
  assert.equal(add.querySelector('[data-ed="csAdd"]').getAttribute('data-ids'), '273000302,273000302/1');
  assert.match(add.querySelector('.tag').text, /נכנס/);
  const swap = view({}, { list: [row({ inSchedule: true })], more: false }).querySelector('.cs-course');
  assert.equal(swap.querySelectorAll('[data-ed="csSwap"]').length, 1);
  assert.equal(swap.querySelectorAll('[data-ed="csAdd"]').length, 0);
  const clash = view({}, { list: [row({ options: [{ ids: ['x'], line: 'יום ב׳ 09:00–10:50', lecturer: '', fit: 'clash', clash: ['פיזיקה 1', 'כימיה 2'] }] })], more: false });
  assert.match(clash.querySelector('.tag.warn').text, /^מתנגש עם פיזיקה 1, כימיה 2$/);
  const full = view({}, { list: [row({ options: [{ ids: ['x'], line: 'l', lecturer: 'מר א', fit: 'full', clash: [] }] })], more: false });
  assert.match(full.querySelector('.tag.bad').text, /^מלא$/);
  const none = view({}, { list: [row({ options: [] })], more: false });
  assert.match(none.querySelector('.cs-course').text, /אין קבוצה פתוחה/);
  assert.equal(none.querySelectorAll('button').length, 1 /* only the back button of the view */);
});

test('a conditional course says what it needs and its "הוספה" carries both; a closed or read-only row has no button, only its reason', () => {
  const cond = view({}, { list: [row({ needs: 'דורש במקביל: פיזיקה 1', withIds: ['30112'] })], more: false });
  assert.match(cond.querySelector('.cs-course').text, /דורש במקביל: פיזיקה 1/);
  assert.equal(cond.querySelector('[data-ed="csAdd"]').getAttribute('data-with'), '30112');
  const closed = view({}, { list: [row({ open: false, why: 'עברת את הקורס' })], more: false });
  assert.equal(closed.querySelectorAll('[data-ed="csAdd"], [data-ed="csSwap"]').length, 0);
  assert.match(closed.querySelector('.cs-meta').text, /עברת את הקורס/);
  const ro = view({}, { list: [row({ readOnly: true, readOnlyWhy: 'לא בתוכנית שלך', open: false })], more: false });
  assert.equal(ro.querySelectorAll('[data-ed="csAdd"], [data-ed="csSwap"]').length, 0);
  assert.match(ro.querySelector('.cs-meta').text, /לא בתוכנית שלך/);
});

test('names and lecturers are escaped, the field keeps its text', () => {
  const root = view({ text: '"><img src=x>' }, { list: [row({ name: '<b>x</b>', options: [{ ids: ['a'], line: '<i>', lecturer: '<script>', fit: 'fits', clash: [] }] })], more: false });
  assert.equal(root.querySelectorAll('b, i, script, img').length, 0, 'no element from data');
  assert.equal(root.querySelector('#csText').getAttribute('value'), '"><img src=x>');
});

test('a conditional course adds the first parallel alternative the student can take; none usable keeps it closed, with the reason', () => {
  const g = (id, course) => ({ id, type: 'הרצאה', primary: true, lecturer: 'מר ב', full: false, semester: 'א', linked: [], meetings: [{ day: 1, start: '08:00', end: '09:50', room: '' }], exams: [] });
  const data = {
    courses: {
      X: { name: 'קורס מותנה', credits: 3, offered: true, prereqs: [], groups: [g('27X01')] },
      Y1: { name: 'מקביל חסום', credits: 3, offered: true, prereqs: [], groups: [g('27Y101')] },
      Y2: { name: 'מקביל פתוח', credits: 3, offered: true, prereqs: [], groups: [g('27Y201')] }
    }
  };
  const statuses = (y1, y2) => ({
    X: { status: 'conditional', reasons: [], missingParallel: [['Y1', 'Y2']] },
    Y1: { status: y1, reasons: [] },
    Y2: { status: y2, reasons: [] }
  });
  const run = (st) => find(searchCourses({ data: { 'א': data }, sem: 'א', statuses: st, week: [] }, { text: 'מותנה' }), 'X');
  const ok = run(statuses('blocked', 'available'));
  assert.equal(ok.open, true);
  assert.deepEqual(ok.withIds, ['Y2'], 'the blocked alternative is skipped');
  assert.equal(ok.needs, 'דורש במקביל: מקביל פתוח');
  const stuck = run(statuses('blocked', 'blocked'));
  assert.equal(stuck.open, false, 'no usable alternative: closed');
  assert.deepEqual(stuck.withIds, []);
  assert.match(stuck.why, /^דורש במקביל קורס שאי אפשר להירשם אליו עכשיו: מקביל חסום או מקביל פתוח$/);
});

test('a group id that buildOptions folded into another (identical lectures) still finds its course, and the option offered carries that group', () => {
  const lecture = (id) => ({ id, type: 'סופי-הרצאה', primary: true, lecturer: 'מר ב', full: false, semester: 'א', linked: [], meetings: [{ day: 2, start: '10:00', end: '11:50', room: '1' }], exams: [] });
  const data = { courses: { 77003: { name: 'שני מופעים זהים', credits: 3, offered: true, prereqs: [], groups: [lecture('277700301'), lecture('277700302')] } } };
  const c = { data: { 'א': data }, sem: 'א', statuses: { 77003: { status: 'available', reasons: [] } }, week: [] };
  const first = find(searchCourses(c, { text: '277700301' }), '77003');
  assert.equal(first.options.length, 1, 'identical lectures are one option');
  const second = find(searchCourses(c, { text: '277700302' }), '77003');
  assert.ok(second, 'the folded group is found');
  assert.deepEqual(second.options[0].ids, ['277700302'], 'and offered as itself');
});

test('a course already in the schedule shows no "passed" label (it is there); a passed course that is not shows it and no button', () => {
  const inSchedule = find(searchCourses(ctx({ statuses: classify(A, record(['30003'])).statuses, inSchedule: new Set(['30003']) }), { text: '30003' }), '30003');
  assert.equal(inSchedule.why, '');
  assert.equal(inSchedule.inSchedule, true);
  const passed = find(searchCourses(ctx({ statuses: classify(A, record(['30003'])).statuses }), { text: '30003' }), '30003');
  assert.equal(passed.why, 'עברת את הקורס');
  assert.equal(passed.open, false);
});

test('companions: a retake needs its parallel course too, a chain X -> Y -> Z is added whole, a requirement the schedule meets adds nothing, a registered full group is not taken', () => {
  const g = (id, full = false) => ({ id, type: 'הרצאה', primary: true, lecturer: 'מר ב', full, semester: 'א', linked: [], meetings: [{ day: 1, start: '08:00', end: '09:50', room: '' }], exams: [] });
  const c = (name, groups) => ({ name, credits: 3, offered: true, prereqs: [], groups });
  const data = { courses: { 77010: c('שרשרת א', [g('277701001')]), 77011: c('שרשרת ב', [g('277701101')]), 77012: c('שרשרת ג', [g('277701201')]), 77013: c('מלא בלבד', [g('277701301', true)]), 77014: c('חופשי', [g('277701401')]) } };
  const st = (over) => ({
    77010: { status: 'conditional', reasons: [], missingParallel: [['77011']] },
    77011: { status: 'conditional', reasons: [], missingParallel: [['77012']] },
    77012: { status: 'available', reasons: [] },
    77013: { status: 'available', reasons: [] }, 77014: { status: 'available', reasons: [] }, ...over
  });
  const run = (statuses, extra = {}, text = 'שרשרת א') => find(searchCourses({ data: { 'א': data }, sem: 'א', statuses, week: [], ...extra }, { text }), '77010');
  assert.deepEqual(run(st()).withIds, ['77011', '77012'], 'the chain is added whole');
  const retake = run(st({ 77010: { status: 'retake', reasons: [], missingParallel: [['77011']] } }));
  assert.equal(retake.open, true);
  assert.deepEqual(retake.withIds, ['77011', '77012'], 'a retake with a parallel requirement');
  const met = run(st(), { inSchedule: new Set(['77011']) });
  assert.deepEqual(met.withIds, [], 'the schedule already has what it needs');
  assert.equal(met.needs, '');
  const cyc = run(st({ 77012: { status: 'conditional', reasons: [], missingParallel: [['77010']] } }));
  assert.equal(cyc.open, false, 'a cycle cannot be met');
  const reqFull = st({ 77010: { status: 'conditional', reasons: [], missingParallel: [['77013', '77014']] } });
  assert.deepEqual(run(reqFull).withIds, ['77013'], 'a full group is fine before registering');
  assert.deepEqual(run(reqFull, { registered: true, owned: [] }).withIds, ['77014'], 'registered: a full group that is not theirs is skipped');
  assert.deepEqual(run(reqFull, { registered: true, owned: ['277701301'] }).withIds, ['77013'], 'unless it is theirs');
});


test('matches shares improve search code, name and lecturer matching, including normalization, without a result cap', () => {
  const c = { ...course('30003'), code: '30003' };
  for (const query of ['3000', c.groups[0].id, 'כימי', stripTitle(c.groups[0].lecturer).split(' ')[0], '  '])
    assert.equal(matches(c, query), true, query);
  assert.equal(matches(c, 'קורס שלא קיים'), false);
  assert.equal(matches({ code: '8', name: 'MATLAB ושיטות', groups: [] }, 'matlab'), true);
  assert.equal(matches({ code: '8', name: 'שיטות ד״ר', groups: [] }, 'שיטות ד"ר'), true);
  const many = Array.from({ length: MAX_RESULTS + 15 }, (_, i) => ({ code: String(i), name: 'בדיקה', groups: [] }));
  assert.equal(many.filter((x) => matches(x, 'בדיקה')).length, MAX_RESULTS + 15);
  assert.equal(matches({ code: '123', name: 'בלי קבוצות', groups: [] }, '123'), true, 'also courses with no teaching groups');
});
