// The one-page summary to bring to an academic advisor (printed from #print). Pure: no DOM; every string reaches HTML through esc().
import { progress, gradeAverage, studyYear, missingRequired } from './rules.js';
import { esc, DISCLAIMER, SPLIT_NOTE, splitLine, creditsGoal, groupLabel, meetingText, hebYear, courseCount } from './ui-text.js';

const YEAR = ' אבגדה'; // study year number -> letter
const dateText = (now) => now.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: 'numeric' });
const semName = (s) => (s === 'קיץ' ? 'סמסטר קיץ' : `סמסטר ${s}׳`);
const list = (items) => (items.length ? `<ul>${items.map((t) => `<li>${t}</li>`).join('')}</ul>` : '');

// data: the loaded program (lists, year); sem: { א, ב, קיץ } datasets when a year pair is shown; res: the shown alternative (one semester or a pair).
export function advisorHtml({ state, data, res, cls, catalog, now = new Date(), sem = {} }) {
  const year = studyYear(data, state), prog = progress(data, state), avg = gradeAverage(data, state).avg;
  const program = catalog?.programs?.find((p) => p.id === data.program)?.name;
  const name = (id) => data.courses[id]?.name ?? Object.values(sem).find((d) => d?.courses?.[id])?.courses[id].name ?? id;
  const missing = missingRequired(data, state);
  const passed = state.passed.filter((id) => data.courses[id]);

  const me = list([
    state.name && `שם: ${esc(state.name)}`,
    program && `תוכנית: ${esc(program)}`,
    `שנה ${esc(YEAR[year])}׳ בלימודים`,
    `${esc(creditsGoal(prog.earned, prog.required, year))}`,
    avg !== null && `ממוצע: ${avg.toFixed(1)}`,
    `קורסים שעברתי: ${passed.length ? passed.map((id) => esc(name(id))).join(', ') : 'אין'}`,
    `קורסי חובה משנים קודמות שחסרים: ${missing.length ? missing.map((id) => esc(name(id))).join(', ') : 'אין'}`,
  ].filter(Boolean));

  const parts = !res ? [] : 'a' in res ? [['א', res.a], ['ב', res.b]].filter(([, r]) => r) : [[data.semester, res]];
  const block = ([label, r]) => {
    const d = sem[label] ?? data, rows = [];
    const byGroup = new Map(Object.entries(d.courses).flatMap(([cid, c]) => c.groups.map((g) => [g.id, { cid, g }])));
    for (const cid of r.courses) {
      const c = d.courses[cid];
      if (!c) continue;
      const gs = (r.groups ?? []).map((id) => byGroup.get(id)).filter((x) => x?.cid === cid).map(({ g }) =>
        `${esc(groupLabel(g))}: ${g.meetings.length ? g.meetings.map((m) => esc(meetingText(m))).join(', ') : 'ללא מפגשים'}`);
      rows.push(`<b>${esc(c.name)}</b> (${c.credits} נ״ז)${gs.length ? `<div>${gs.join('; ')}</div>` : ''}`); // one line of groups: a year pair must fit one A4 page
    }
    const credits = r.courses.reduce((a, cid) => a + (d.courses[cid]?.credits ?? 0), 0);
    return `${'a' in res || label !== 'שנה' ? `<h4>${esc(semName(label))}</h4>` : ''}<p>${esc(courseCount(r.courses.length))}, ${credits} נ״ז</p>${list(rows)}`;
  };
  const chosen = parts.length ? parts.map(block).join('') : '<p>לא נבחרה חלופה.</p>';

  const split = res ? [...new Set([...(res.split ?? []), ...parts.flatMap(([, r]) => r.split ?? [])])] : [];
  const notes = [
    ...(cls?.warnings ?? []),
    ...(res && 'a' in res ? res.warnings ?? [] : []),
    ...(split.length ? [SPLIT_NOTE, splitLine(split.map(name))] : []),
  ].map(esc);

  return `<h2>סיכום לפגישה עם יועץ לימודים</h2>
<p>${esc(dateText(now))} · שנת הלימודים ${esc(hebYear(data.year))}</p>
<h3>המצב שלי</h3>${me}
<h3>החלופה שבחרתי</h3>${chosen}
<h3>שימו לב</h3>${list([...notes, esc(DISCLAIMER)])}`;
}
