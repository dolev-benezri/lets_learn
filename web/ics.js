// Calendar export (RFC 5545), pure: the shown plan as weekly lessons and its exams, for Google Calendar, iPhone and Outlook. No DOM, unit-tested (test/ics.test.mjs).

// Afeka academic calendar (https://www.afeka.ac.il/about-afeka/general-information/academic-calendar/), checked 2026-10-03.
// end = the last day of classes; off = days without classes inside the semester (a date or an inclusive [from, to]). Add a year at the rollover (README).
export const SEMESTER_DATES = {
  2027: {
    'א': { start: '2026-10-25', end: '2027-01-22', off: ['2026-12-06'] },
    'ב': { start: '2027-03-14', end: '2027-06-25', off: ['2027-03-23', ['2027-04-21', '2027-04-29'], '2027-05-11', '2027-05-12', ['2027-06-10', '2027-06-11']] },
    'קיץ': { start: '2027-08-08', end: '2027-09-17', off: [] },
  },
};

const DAY_MS = 864e5;
const utc = (ymd) => Date.parse(`${ymd}T00:00:00Z`);
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);
const compact = (date, time = '') => date.replaceAll('-', '') + (time ? `T${time.replace(':', '')}00` : '');
// The first date on or after `start` that falls on `day` (1 = Sunday ... 6 = Friday, as in the data).
export const firstOn = (start, day) => ymd(utc(start) + ((day - 1 - new Date(utc(start)).getUTCDay() + 7) % 7) * DAY_MS);
const offDates = (off) => off.flatMap((x) => {
  const [a, b] = Array.isArray(x) ? x : [x, x], out = [];
  for (let t = utc(a); t <= utc(b); t += DAY_MS) out.push(ymd(t));
  return out;
});
const text = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
// Lines longer than 75 octets continue on the next line after a space, never splitting a character.
function fold(line) {
  const enc = new TextEncoder(), out = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length, max = out.length ? 74 : 75;
    if (bytes + n > max) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += n;
  }
  return [...out, cur].join('\r\n ');
}
const addHours = (time, h) => (Number(time.slice(0, 2)) + h > 23 ? '23:59' : `${String(Number(time.slice(0, 2)) + h).padStart(2, '0')}${time.slice(2)}`); // same day

// parts: [{ title, res, data, dates }] — one per semester of the shown plan (regParts), dates = SEMESTER_DATES[year][semester].
export function toIcs(parts, now = new Date()) {
  const stamp = `${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, lines = [];
  const event = (uid, fields) => lines.push('BEGIN:VEVENT', `UID:${uid}@afeka-scheduler`, `DTSTAMP:${stamp}`, ...fields, 'END:VEVENT');
  for (const { res, data, dates } of parts) {
    const off = offDates(dates.off ?? []), seenExam = new Set();
    for (const cid of res.courses) {
      const c = data.courses[cid];
      for (const g of c.groups.filter((x) => res.groups.includes(x.id))) {
        for (const m of g.meetings) {
          const first = firstOn(dates.start, m.day), skip = off.filter((d) => d >= first && d <= dates.end && new Date(utc(d)).getUTCDay() + 1 === m.day);
          event(`${g.id}-${m.day}-${m.start.replace(':', '')}`, [`DTSTART:${compact(first, m.start)}`, `DTEND:${compact(first, m.end)}`,
            `RRULE:FREQ=WEEKLY;UNTIL=${compact(dates.end)}T235959`, ...skip.map((d) => `EXDATE:${compact(d, m.start)}`),
            `SUMMARY:${text(c.name)}`, `LOCATION:${text(m.room)}`, `DESCRIPTION:${text(`קבוצה ${g.id}${g.lecturer ? ` · ${g.lecturer}` : ''}`)}`]);
        }
        for (const e of g.exams.filter((x) => x.date)) {
          const key = `${cid}-${e.kind}-${e.moed}`;
          if (seenExam.has(key)) continue;
          seenExam.add(key);
          const when = e.time ? [`DTSTART:${compact(e.date, e.time)}`, `DTEND:${compact(e.date, addHours(e.time, 3))}`] : [`DTSTART;VALUE=DATE:${compact(e.date)}`];
          event(`exam-${cid}-${seenExam.size}-${e.moed}-${compact(e.date)}`, [...when, `SUMMARY:${text(`${e.kind}: ${c.name} (מועד ${e.moed})`)}`]);
        }
      }
    }
  }
  return [...['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//afeka-scheduler//HE', 'CALSCALE:GREGORIAN'], ...lines, 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
}
