// Probe 1: ui-grid.js:151 parses the exam gap out of explain()'s text. Does the singular 'יום אחד' match? What does the user see?
// Run: node solver-audit/plan-probes/probe1-exam-gap.mjs
import { search } from '../../web/solver-core.js';
import { summary } from '../../web/ui-grid.js';
import { count } from '../../web/ui-text.js';

const grp = (id, day, h, date) => ({ id, type: 'הרצאה', primary: true, lecturer: 'L' + id, full: false, semester: 'א', linked: [],
  meetings: [{ day, start: `${String(h).padStart(2, '0')}:00`, end: `${String(h).padStart(2, '0')}:50`, room: 'r' }], exams: [{ kind: 'בחינה', moed: 1, date, time: '09:00' }] });
const mk = (gap) => ({ semester: 'א', year: 2027, startYear: 2026, examsPublished: true, courses: {
  A: { name: 'A', credits: 3, offered: true, prereqs: [], groups: [grp('gA', 1, 9, '2027-02-01')] },
  B: { name: 'B', credits: 3, offered: true, prereqs: [], groups: [grp('gB', 2, 9, `2027-02-${String(1 + gap).padStart(2, '0')}`)] } } });
const W = { friends: 0, progress: 3, freeDays: 0, compact: 0, timeWindow: 0, examSpread: 1 };
// the exact UI composition of web/ui-view.js:108
const pill = (data, s) => (!data.examsPublished ? 'לוח הבחינות טרם פורסם' : s.examGap ? `לפחות ${count(s.examGap, 'יום אחד', 'ימים')} בין בחינות` : 'פער בין בחינות: לא ידוע');
let bad = 0;
for (const gap of [0, 1, 2, 5]) {
  const data = mk(gap);
  const r = search({ data, courses: [{ id: 'A', mode: 'must' }, { id: 'B', mode: 'must' }], constraints: { examsSameDay: 'allow' }, weights: W, friends: [], topK: 1, timeLimitMs: 2000 }).results[0];
  const s = summary(r, data, []);
  const shown = pill(data, s);
  console.log(`INFO gap=${gap} explain="${r.explanation.split(' · ').find((p) => p.includes('בחינות'))}" -> summary().examGap=${JSON.stringify(s.examGap)} -> pill="${shown}"`);
  if (gap === 1 && s.examGap === null && shown === 'פער בין בחינות: לא ידוע') bad++;
}
console.log(bad ? 'BUG probe1-exam-gap-singular REPRODUCED: a 1-day gap is shown as "unknown" (regex /לפחות (\S+) ימים בין בחינות/ cannot match "יום אחד")' : 'BUG probe1-exam-gap-singular NOT-REPRODUCED');
// the regex as written in ui-grid.js:151 (with and without the "בין בחינות" tail named in the task)
for (const re of [/לפחות (\S+) ימים בין בחינות/, /לפחות (\S+) ימים/]) console.log(`INFO ${re} on "לפחות יום אחד בין בחינות": ${JSON.stringify('לפחות יום אחד בין בחינות'.match(re)?.[1] ?? null)}; on "לפחות 0 ימים בין בחינות": ${JSON.stringify('לפחות 0 ימים בין בחינות'.match(re)?.[1] ?? null)}`);
// gap 0 with allow: examGap is the STRING "0" (truthy) -> count("0",...) prints "0 ימים"
