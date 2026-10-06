import { parse } from 'node-html-parser';

export const clean = (s) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

// The site's WAF sometimes answers 200 with this page instead of the real one.
export const isRejected = (html) => html.includes('<title>Request Rejected</title>');

// After too many queries per hour the site answers 200 with a one-line notice instead of any page.
export const isThrottled = (html) => html.includes('יותר מידי שאילתות');

// Michlol pages render tables as <div class="row"><div class="col">…</div></div>.
// Returns the text of each row's direct .col children. Wrapper rows show up too;
// callers filter by column count and content.
export function tableRows(el) {
  return el.querySelectorAll('.row').map((row) =>
    row.childNodes.filter((n) => n.classList?.contains('col')).map((n) => clean(n.text)));
}

export function parseProgram(html) {
  const root = parse(html);
  const text = clean(root.text);
  const min = text.match(/לפחות\s*([\d.]+)/);
  const title = clean(root.querySelectorAll('h2').map((h) => h.text).find((t) => t.includes('רשימת קורסים')) ?? '');
  const name = title.split(':')[1]?.split(',')[0].trim() ?? '';
  const courses = tableRows(root)
    .filter((c) => c.length >= 3 && /^\d{4,6}$/.test(c[0]))
    .map(([id, courseName, offered]) => ({ id, name: courseName, offered: offered === 'נלמד' }));
  return { name, minCredits: min ? Number(min[1]) : 0, courses };
}

const DAY_WORDS = { 'ראשון': 1, 'שני': 2, 'שלישי': 3, 'רביעי': 4, 'חמישי': 5, 'שישי': 6 };
const DAY_LETTERS = { 'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6 };
const TIME = /^\d{2}:\d{2}$/;

export function parseDay(text) {
  const t = clean(text).replace(/^יום\s*/, '');
  return DAY_WORDS[t] ?? DAY_LETTERS[t] ?? null;
}

// Each group starts with <div class="TextAlignRight"> "קורס מסוג …" and is followed by its meetings table.
export function parseGroups(html) {
  return html.split('<div class="TextAlignRight">').slice(1)
    .filter((chunk) => chunk.includes('קורס מסוג'))
    .map((chunk) => {
      const root = parse(chunk);
      const text = clean(root.text);
      const need = (m, field) => {
        if (!m) throw new Error(`parseGroups: field "${field}" not found, yedion layout changed? Near: "${text.slice(0, 120)}"`);
        return m;
      };
      const type = need(text.match(/קורס מסוג\s*(\S+)/), 'קורס מסוג')[1];
      const g = need(text.match(/קבוצה\s*:\s*(\d+)(?:\s*\/\s*(\d+))?/), 'קבוצה');
      const linkedText = text.match(/קבוצות הקשורות לקורס זה\s*:\s*([^)]*)\)/)?.[1] ?? '';
      return {
        id: g[2] ? `${g[1]}/${g[2]}` : g[1],
        type,
        primary: type.startsWith('סופי'),
        lecturer: text.match(/מרצה הקורס\s*:\s*(.*?)\s*פרטים נוספים/)?.[1] ?? '',
        full: text.includes('הקורס מלא'),
        linked: [...linkedText.matchAll(/(\d+)(?:\s*\/\s*(\d+))?/g)].map((m) => (m[2] ? `${m[1]}/${m[2]}` : m[1])), // a tutorial can name a lab group: "271001309 , 271001310"
        meetings: tableRows(root)
          .filter((c) => c.length === 6 && TIME.test(c[2]) && TIME.test(c[3]) && c[2] !== c[3])
          .map(([semester, day, start, end, , room]) => ({ semester, day: parseDay(day), start, end, room })),
        detailsArgs: chunk.match(/data-progname="S_CourseDetails" data-arguments="([^"]+)"/)?.[1] ?? null,
      };
    });
}

export function parseDetails(html) {
  const root = parse(html);
  const credits = Number(clean(root.text).match(/נקודות זכות\s*:\s*([\d.]+)/)?.[1] ?? 0);
  const card = root.querySelectorAll('.card').find((c) => c.querySelector('h2')?.text.includes('תנאי קדם לנושא'));
  const prereqs = card
    ? tableRows(card)
        .filter((c) => c.length === 4 && /^תנאי (קדם|מקביל)/.test(c[0])) // not "תנאי אקסקלוסיבי": a course you may not also take
        .map(([kindText, population, name, alt]) => ({
          kind: kindText.includes('מקביל') ? 'מקביל' : 'קדם',
          population,
          names: [name, alt].filter(Boolean),
        }))
    : [];
  return { credits, prereqs };
}

export function toIsoDate(d) {
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

const EMPTY_TIME = /^00:00(:00)?$/;

export function parseExams(html) {
  return tableRows(parse(html))
    .filter((c) => c.length === 11 && /^\d{4,6}$/.test(c[1]))
    .map(([semester, courseId, , kindText, lecturer, d1, t1, d2, t2, d3, t3]) => ({
      semester,
      courseId,
      lecturer,
      kind: kindText.startsWith('בוחן') ? 'בוחן אמצע' : 'בחינה',
      moeds: [[d1, t1], [d2, t2], [d3, t3]]
        .map(([d, t], i) => ({ moed: i + 1, date: toIsoDate(d), time: !t || EMPTY_TIME.test(t) ? null : t.slice(0, 5) }))
        .filter((m) => m.date),
    }));
}

// JSON Action=700: the tracks of one department in one cohort year.
export const parseTracks = (text) => (JSON.parse(text).Answer ?? []).map((t) => ({ code: Number(t.Code), name: clean(t.Name) }));

// S_PROG: the lists (code and name) that a track page links to, in page order.
export const parseTrackLists = (html) => [...html.matchAll(/<div class="col">([^<]*)<\/div>\s*<div class="col"><A href="[^"]*-N\d+,-N(\d+)"/g)].map((m) => ({ code: Number(m[2]), name: clean(m[1]) }));
