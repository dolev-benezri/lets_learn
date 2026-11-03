// The one-page summary to bring to an academic advisor. advisorBlocks is its content, in plain strings: advisorHtml draws it on screen and for print
// (#print), and advisor-pdf.js into a file. Pure: no DOM; in HTML every string goes through esc().
import { progress, gradeAverage, studyYear, missingRequired } from './rules.js';
import {
  esc,
  DISCLAIMER,
  SPLIT_NOTE,
  splitLine,
  creditsGoal,
  groupLabel,
  meetingText,
  hebYear,
  courseCount,
  closeExamLines
} from './ui-text.js';

const YEAR = ' אבגדה'; // study year number -> letter
const dateText = (now) =>
  now.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: 'numeric' });
const semName = (s) => (s === 'קיץ' ? 'סמסטר קיץ' : `סמסטר ${s}׳`);
// data: the loaded program (lists, year); sem: { א, ב, קיץ } datasets when a year pair is shown; res: the shown alternative (one semester or a pair).
// Blocks: { k: 'h2'|'h3'|'h4'|'p'|'li', t } and { k: 'course', name, credits, groups: string[] }.
export function advisorBlocks({ state, data, res, cls, catalog, now = new Date(), sem = {} }) {
  const year = studyYear(data, state),
    prog = progress(data, state),
    avg = gradeAverage(data, state).avg;
  const program = catalog?.programs?.find((p) => p.id === data.program)?.name;
  const name = (id) =>
    data.courses[id]?.name ?? Object.values(sem).find((d) => d?.courses?.[id])?.courses[id].name ?? id;
  const missing = missingRequired(data, state);
  const passed = state.passed.filter((id) => data.courses[id]);
  // failed and not passed again: what the advisor most needs to see (bot report #6)
  const failed = Object.keys(state.failed ?? {}).filter((id) => !state.passed.includes(id) && data.courses[id]);
  const li = (t) => ({ k: 'li', t });

  const me = [
    state.name && `שם: ${state.name}`,
    program && `תוכנית: ${program}`,
    `שנה ${YEAR[year]}׳ בלימודים`,
    creditsGoal(prog.earned, prog.required, year),
    avg !== null && `ממוצע: ${avg.toFixed(1)}`,
    `קורסים שעברתי: ${passed.length ? passed.map(name).join(', ') : 'אין'}`,
    failed.length && `קורסים שנכשלתי בהם ועוד לא עברתי: ${failed.map(name).join(', ')}`,
    `קורסי חובה משנים קודמות שחסרים: ${missing.length ? missing.map(name).join(', ') : 'אין'}`,
  ]
    .filter(Boolean)
    .map(li);

  const parts = !res
    ? []
    : 'a' in res
      ? [
          ['א', res.a],
          ['ב', res.b]
        ].filter(([, r]) => r)
      : [[data.semester, res]];
  const block = ([label, r]) => {
    const d = sem[label] ?? data,
      rows = [];
    const byGroup = new Map(Object.entries(d.courses).flatMap(([cid, c]) => c.groups.map((g) => [g.id, { cid, g }])));
    for (const cid of r.courses) {
      const c = d.courses[cid];
      if (!c) continue;
      const groups = (r.groups ?? [])
        .map((id) => byGroup.get(id))
        .filter((x) => x?.cid === cid)
        .map(({ g }) => `${groupLabel(g)}: ${g.meetings.length ? g.meetings.map(meetingText).join(', ') : 'ללא מפגשים'}`);
      rows.push({ k: 'course', name: c.name, credits: c.credits, groups });
    }
    const credits = r.courses.reduce((a, cid) => a + (d.courses[cid]?.credits ?? 0), 0);
    return [
      ...('a' in res || label !== 'שנה' ? [{ k: 'h4', t: semName(label) }] : []),
      { k: 'p', t: `${courseCount(r.courses.length)}, ${credits} נ״ז` },
      ...rows
    ];
  };

  const split = res ? [...new Set([...(res.split ?? []), ...parts.flatMap(([, r]) => r.split ?? [])])] : [];
  const notes = [
    ...(cls?.warnings ?? []),
    ...(res && 'a' in res ? res.warnings ?? [] : []),
    // the year view says so on screen (ui-view.js): mandatory courses this year plan could not place in either semester
    ...(res && 'a' in res && res.missing?.length ? [`קורסי חובה שביקשת ולא נכנסו לאף סמסטר: ${res.missing.map(name).join(', ')}`] : []),
    ...(split.length ? [SPLIT_NOTE, splitLine(split.map(name))] : []),
    ...parts.flatMap(([, r]) => closeExamLines(r.closeExams ?? [], name)),
    DISCLAIMER
  ];

  return [
    { k: 'h2', t: 'סיכום לפגישה עם יועץ לימודים' },
    { k: 'p', t: `${dateText(now)} · שנת הלימודים ${hebYear(data.year)}` },
    { k: 'h3', t: 'המצב שלי' },
    ...me,
    { k: 'h3', t: 'החלופה שבחרתי' },
    ...(parts.length ? parts.flatMap(block) : [{ k: 'p', t: 'לא נבחרה חלופה.' }]),
    { k: 'h3', t: 'שימו לב' },
    ...notes.map(li)
  ];
}

// one line of groups: a year pair must fit one A4 page
const courseHtml = (b) => `<b>${esc(b.name)}</b> (${b.credits} נ״ז)${b.groups.length ? `<div>${esc(b.groups.join('; '))}</div>` : ''}`;

export function advisorHtml(args) {
  let html = '',
    inList = false;
  for (const b of advisorBlocks(args)) {
    const item = b.k === 'li' || b.k === 'course';
    if (item !== inList) html += item ? '<ul>' : '</ul>';
    inList = item;
    if (item) html += `<li>${b.k === 'li' ? esc(b.t) : courseHtml(b)}</li>`;
    else html += `${b.k === 'h3' ? '\n' : ''}<${b.k}>${esc(b.t)}</${b.k}>${b.k === 'h2' ? '\n' : ''}`;
  }
  return inList ? `${html}</ul>` : html;
}
