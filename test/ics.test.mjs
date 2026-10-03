import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toIcs, firstOn, SEMESTER_DATES } from '../web/ics.js';

const course = (day, extra = {}) => ({ name: 'פיזיקה, א; "ב"', groups: [{ id: 'g1', lecturer: 'כהן', primary: true,
  meetings: [{ day, start: '09:00', end: '10:50', room: 'A1' }], exams: [{ kind: 'בחינה', moed: 'א', date: '2027-02-01' }], ...extra }] });
const part = (data, dates) => ({ title: null, res: { courses: Object.keys(data.courses), groups: ['g1', 'g'] }, data, dates });
const NOW = new Date('2026-10-01T00:00:00Z');

test('toIcs: one weekly event per meeting from the first matching day, escaped text, stable UID, CRLF', () => {
  const dates = SEMESTER_DATES[2027]['א'], out = toIcs([part({ courses: { 101: course(3) } }, dates)], NOW);
  assert.match(out, /^BEGIN:VCALENDAR\r\n/);
  assert.match(out, /END:VCALENDAR\r\n$/);
  assert.match(out, /DTSTART:20261027T090000\r\n/); // 25.10.2026 is a Sunday: the first Tuesday (day 3) is 27.10
  assert.match(out, /DTEND:20261027T105000\r\n/);
  assert.match(out, /RRULE:FREQ=WEEKLY;UNTIL=20270122T235959/);
  assert.match(out, /SUMMARY:פיזיקה\\, א\\; "ב"/);
  assert.match(out, /UID:g1-3-0900@afeka-scheduler/);
  assert.match(out, /DTSTART;VALUE=DATE:20270201/);
  assert.ok(out.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75), 'lines folded at 75 octets');
  assert.doesNotMatch(out, /EXDATE/, 'a Tuesday meeting never falls on Chanukah (Sunday 06.12.26)');
  assert.match(toIcs([part({ courses: { 101: course(1) } }, dates)], NOW), /EXDATE:20261206T090000/);
});

test('toIcs: a holiday range skips every meeting inside it (Passover 21-29.04.27, a Wednesday meeting: 21.04 and 28.04)', () => {
  const data = { courses: { 9: { name: 'x', groups: [{ id: 'g', lecturer: '', primary: true, meetings: [{ day: 4, start: '12:00', end: '13:00', room: '' }], exams: [] }] } } };
  const out = toIcs([part(data, SEMESTER_DATES[2027]['ב'])], NOW);
  for (const d of ['20270421', '20270428', '20270512']) assert.match(out, new RegExp(`EXDATE:${d}T120000`)); // and Independence Day
  assert.match(out, /DTSTART:20270317T120000/);
});

test('toIcs: an exam with a time is a three-hour event; long names fold and unfold back', () => {
  const data = { courses: { 7: course(2, { exams: [{ kind: 'בחינה', moed: 'ב', date: '2027-02-20', time: '09:00' }] }) } };
  data.courses[7].name = 'א'.repeat(60);
  const out = toIcs([part(data, SEMESTER_DATES[2027]['א'])], NOW);
  assert.match(out, /DTSTART:20270220T090000\r\nDTEND:20270220T120000/);
  assert.ok(out.replace(/\r\n /g, '').includes(`SUMMARY:${'א'.repeat(60)}`));
});

test('firstOn: the start date itself when it is that day', () => {
  assert.equal(firstOn('2026-10-25', 1), '2026-10-25');
  assert.equal(firstOn('2026-10-25', 6), '2026-10-30');
});

test('toIcs: two exam kinds on one date get two UIDs; a bare CR is escaped; a late exam ends by 23:59', () => {
  const data = { courses: { 5: course(2, { exams: [{ kind: 'בחינה', moed: 1, date: '2027-02-01' }, { kind: 'בוחן', moed: 1, date: '2027-02-01' },
    { kind: 'בחינה', moed: 2, date: '2027-02-20', time: '22:00' }], meetings: [{ day: 2, start: '09:00', end: '10:00', room: 'a\rb' }] }) } };
  const out = toIcs([part(data, SEMESTER_DATES[2027]['א'])], NOW), uids = out.match(/UID:exam[^\r]*/g);
  assert.equal(new Set(uids).size, uids.length);
  assert.ok(!/\r(?!\n)/.test(out), 'no bare CR');
  assert.match(out, /DTEND:20270220T235900/);
});
