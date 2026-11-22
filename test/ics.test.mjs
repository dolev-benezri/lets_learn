import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toIcs, firstOn, SEMESTER_DATES } from '../web/ics.js';
import { DISCLAIMER } from '../web/ui-text.js';

const course = (day, extra = {}) => ({
  name: 'פיזיקה, א; "ב"',
  groups: [
    {
      id: 'g1',
      lecturer: 'כהן',
      primary: true,
      meetings: [{ day, start: '09:00', end: '10:50', room: 'A1' }],
      exams: [{ kind: 'בחינה', moed: 'א', date: '2027-02-01' }],
      ...extra
    }
  ]
});
const part = (data, dates) => ({
  title: null,
  res: { courses: Object.keys(data.courses), groups: ['g1', 'g'] },
  data,
  dates
});
const NOW = new Date('2026-10-01T00:00:00Z');

test('toIcs: one weekly event per meeting from the first matching day, escaped text, stable UID, CRLF', () => {
  const dates = SEMESTER_DATES[2027]['א'],
    out = toIcs([part({ courses: { 101: course(3) } }, dates)], NOW);
  assert.match(out, /^BEGIN:VCALENDAR\r\n/);
  assert.match(out, /END:VCALENDAR\r\n$/);
  assert.match(out, /DTSTART;TZID=Asia\/Jerusalem:20261027T090000\r\n/); // 25.10.2026 is a Sunday: the first Tuesday (day 3) is 27.10
  assert.match(out, /DTEND;TZID=Asia\/Jerusalem:20261027T105000\r\n/);
  assert.match(out, /RRULE:FREQ=WEEKLY;UNTIL=20270122T235959Z/);
  assert.match(out, /SUMMARY:פיזיקה\\, א\\; "ב"/);
  assert.match(out, /UID:g1-3-0900@afeka-scheduler/);
  assert.match(out, /DTSTART;VALUE=DATE:20270201/);
  assert.ok(
    out.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75),
    'lines folded at 75 octets'
  );
  assert.doesNotMatch(out, /EXDATE/, 'a Tuesday meeting never falls on Chanukah (Sunday 06.12.26)');
  assert.match(toIcs([part({ courses: { 101: course(1) } }, dates)], NOW), /EXDATE;TZID=Asia\/Jerusalem:20261206T090000/);
});

test('toIcs: a holiday range skips every meeting inside it (Passover 21-29.04.27, a Wednesday meeting: 21.04 and 28.04)', () => {
  const data = {
    courses: {
      9: {
        name: 'x',
        groups: [
          {
            id: 'g',
            lecturer: '',
            primary: true,
            meetings: [{ day: 4, start: '12:00', end: '13:00', room: '' }],
            exams: []
          }
        ]
      }
    }
  };
  const out = toIcs([part(data, SEMESTER_DATES[2027]['ב'])], NOW);
  for (const d of ['20270421', '20270428', '20270512']) assert.match(out, new RegExp(`EXDATE;TZID=Asia/Jerusalem:${d}T120000`)); // and Independence Day
  assert.match(out, /DTSTART;TZID=Asia\/Jerusalem:20270317T120000/);
});

test('toIcs: an exam with a time is a three-hour event; long names fold and unfold back', () => {
  const data = {
    courses: { 7: course(2, { exams: [{ kind: 'בחינה', moed: 'ב', date: '2027-02-20', time: '09:00' }] }) }
  };
  data.courses[7].name = 'א'.repeat(60);
  const out = toIcs([part(data, SEMESTER_DATES[2027]['א'])], NOW);
  assert.match(out, /DTSTART;TZID=Asia\/Jerusalem:20270220T090000\r\nDTEND;TZID=Asia\/Jerusalem:20270220T120000/);
  assert.ok(out.replace(/\r\n /g, '').includes(`SUMMARY:${'א'.repeat(60)}`));
});

test('firstOn: the start date itself when it is that day', () => {
  assert.equal(firstOn('2026-10-25', 1), '2026-10-25');
  assert.equal(firstOn('2026-10-25', 6), '2026-10-30');
});

test('toIcs: two exam kinds on one date get two UIDs; a bare CR is escaped; a late exam ends by 23:59', () => {
  const data = {
    courses: {
      5: course(2, {
        exams: [
          { kind: 'בחינה', moed: 1, date: '2027-02-01' },
          { kind: 'בוחן', moed: 1, date: '2027-02-01' },
          { kind: 'בחינה', moed: 2, date: '2027-02-20', time: '22:00' }
        ],
        meetings: [{ day: 2, start: '09:00', end: '10:00', room: 'a\rb' }]
      })
    }
  };
  const out = toIcs([part(data, SEMESTER_DATES[2027]['א'])], NOW),
    uids = out.match(/UID:exam[^\r]*/g);
  assert.equal(new Set(uids).size, uids.length);
  assert.ok(!/\r(?!\n)/.test(out), 'no bare CR');
  assert.match(out, /DTEND;TZID=Asia\/Jerusalem:20270220T235900/);
});

test('toIcs: every event (lessons and exams, dated or timed) has a DESCRIPTION that ends with the disclaimer', () => {
  const data = {
    courses: {
      7: course(2, {
        exams: [
          { kind: 'בחינה', moed: 'א', date: '2027-02-01' },
          { kind: 'בחינה', moed: 'ב', date: '2027-02-20', time: '09:00' }
        ]
      })
    }
  };
  const out = toIcs([part(data, SEMESTER_DATES[2027]['א'])], NOW).replace(/\r\n /g, '');
  const events = out.split('BEGIN:VEVENT').slice(1);
  assert.equal(events.length, 3, 'one lesson and two exams');
  for (const ev of events) {
    const d = ev.split('\r\n').filter((l) => l.startsWith('DESCRIPTION:'));
    assert.equal(d.length, 1);
    assert.ok(d[0].endsWith(DISCLAIMER), d[0]);
  }
  assert.ok(
    events[0].includes(`DESCRIPTION:קבוצה g1 · כהן\\n${DISCLAIMER}\r\n`),
    'the lesson keeps its group line, then the escaped newline'
  );
});

test('toIcs: a timed exam says its end time is an estimate (before the disclaimer); a date-only exam and a lesson do not', () => {
  const NOTE = 'שעת הסיום משוערת\\, משך הבחינה לא פורסם'; // the comma is escaped in iCalendar text
  const data = {
    courses: {
      7: course(2, {
        exams: [
          { kind: 'בחינה', moed: 'א', date: '2027-02-01' },
          { kind: 'בחינה', moed: 'ב', date: '2027-02-20', time: '09:00' },
          { kind: 'בחינה', moed: 'ג', date: '2027-03-02', time: '22:00' }
        ]
      })
    }
  };
  const events = toIcs([part(data, SEMESTER_DATES[2027]['א'])], NOW)
    .replace(/\r\n /g, '')
    .split('BEGIN:VEVENT')
    .slice(1);
  const description = (ev) => ev.split('\r\n').find((l) => l.startsWith('DESCRIPTION:'));
  assert.equal(events.length, 4, 'one lesson and three exams');
  const [lesson, dated, timed, late] = events;
  assert.equal(description(lesson), `DESCRIPTION:קבוצה g1 · כהן\\n${DISCLAIMER}`, 'a lesson has a real end time: no note');
  assert.equal(description(dated), `DESCRIPTION:${DISCLAIMER}`, 'a date-only exam has no end time: no note');
  assert.equal(description(timed), `DESCRIPTION:${NOTE}\\n${DISCLAIMER}`, 'the note, an escaped newline, then the disclaimer');
  assert.equal(description(late), `DESCRIPTION:${NOTE}\\n${DISCLAIMER}`, 'an exam cut at 23:59 is still an estimate');
});

test('times are Israel time (TZID with a VTIMEZONE), not floating; UNTIL is UTC (J17)', () => {
  const out = toIcs([part({ courses: { 101: course(3) } }, SEMESTER_DATES[2027]['א'])], NOW);
  assert.match(out, /BEGIN:VTIMEZONE\r\nTZID:Asia\/Jerusalem\r\n/);
  assert.match(out, /TZOFFSETTO:\+0300/);
  assert.doesNotMatch(out.split('END:VTIMEZONE')[1], /\r\nDT(START|END):\d{8}T/, 'no floating lesson or exam time');
  assert.match(out, /UNTIL=\d{8}T\d{6}Z/);
});

test('toIcs: co-lecturers in a description are read with one comma (escaped, as every comma in an .ics text)', () => {
  const dates = SEMESTER_DATES[2027]['א'];
  const out = toIcs([part({ courses: { 101: course(3, { lecturer: 'מר X,, מר Y' }) } }, dates)], NOW);
  const line = out.split('\r\n').find((l) => l.startsWith('DESCRIPTION:'));
  assert.ok(line.startsWith('DESCRIPTION:קבוצה g1 · מר X\\, מר Y'), line);
});
