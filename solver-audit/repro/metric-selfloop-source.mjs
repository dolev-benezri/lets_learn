// metric-selfloop-source.mjs - PREFIX metric. Root cause + user-visible effect of the self-referencing "kadam" prerequisites
// found by metric-graph.mjs (84/144 files).
//
// Targets: scripts/parse.mjs:70-80 (parseDetails maps every condition type that is not "מקביל" to kind 'קדם'),
//          scripts/build.mjs:27-30 (names -> ids, no self filter), web/rules.js:67,84-88 (classify blocks a course whose
//          kadam is unmet, a self-reference can never be met), web/solver-core.js:105-111 (dependents puts the course in its own rev).
// Evidence: solver-audit/repro/fixtures/yedion-details-10825.html = ONE live GET of Afeka's public page, saved verbatim:
//   curl "https://yedionpub.afeka.ac.il/yedion/fireflyweb.aspx?prgname=S_CourseDetails&arguments=-N10825,-N1,-N3,-N271082504,-N"
//   (the arguments are the ones scripts/scrape.mjs takes from S_LOOK_FOR_NOSE for course 10825, group 271082504). Offline from here on.
// Run:     node solver-audit/repro/metric-selfloop-source.mjs      (any cwd, <2 s, deterministic)
// Output:  CHECK/BUG lines; exit 0 iff all CHECK PASS and all BUG REPRODUCED.
import fs from 'node:fs';
import { parseDetails } from '../../scripts/parse.mjs';
import { classify, modeFor } from '../../web/rules.js';
import { downstream, unlockCounts } from '../../web/solver-core.js';

let bad = 0;
const check = (id, ok, d) => { console.log(`CHECK ${id} ${ok ? 'PASS' : 'FAIL'} ${d}`); if (!ok) bad++; };
const bug = (id, rep, d) => { console.log(`BUG ${id} ${rep ? 'REPRODUCED' : 'NOT-REPRODUCED'} ${d}`); if (!rep) bad++; };
const data = (s, f) => JSON.parse(fs.readFileSync(new URL(`../../web/data/afeka/${s}/${f}.json`, import.meta.url), 'utf8'));

// 1. what the source page says, and what the parser makes of it --------------------------------------------------------------
const html = fs.readFileSync(new URL('./fixtures/yedion-details-10825.html', import.meta.url), 'utf8');
const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const row = text.match(/תנאי אקסקלוסיבי[^א-ת]*[א-ת \-]+?(?= כדי לפתוח)/)?.[0] ?? '';
console.log(`  page row text: "${row.trim().slice(0, 150)}"`);
const parsed = parseDetails(html);
console.log(`  parseDetails -> ${JSON.stringify(parsed)}`);
check('selfloop-1a', /אקסקלוסיבי/.test(text) && !/תנאי קדם:|תנאי קדם -/.test(row), 'the live page lists the condition as "תנאי אקסקלוסיבי - לא ניתן להירשם לקורס המבוקש אם כבר נרשמת לקורס שמשמאל" (an exclusivity: cannot register if already registered to the course on the left), not as a prerequisite');
bug('metric-selfloop-parser', parsed.prereqs.length === 1 && parsed.prereqs[0].kind === 'קדם' && parsed.prereqs[0].names[0] === 'אתיקה בהנדסת תוכנה',
  'parseDetails turns that exclusive row into {kind:"קדם", names:["אתיקה בהנדסת תוכנה"]}; build.mjs then resolves the name to the course\'s own id 10825 => a self-referencing prerequisite');

// 2. the committed data really has it, and the regulations engine blocks the course forever --------------------------------
const yearListOf = (d, y) => new Set(d.lists.find((l) => l.name.includes(`שנה ${y}'`))?.courses ?? []);
const blockedMand = [];
const candidate = (d, st, id, inYear) => modeFor(st[id]?.status, undefined, inYear.has(id));
for (const [s, f, id, y] of [['2027-1', '10-2027', '10825', 'א'], ['2027-1', '12-2027', '10825', 'א'], ['2027-2', '30-2024', '30150', 'ג']]) {
  const d = data(s, f), c = d.courses[id];
  const selfRef = c.prereqs.some((p) => p.kind === 'קדם' && p.anyOf.some((a) => a.id === id));
  // a student who passed everything of earlier years (the app default) and nothing else: only the self-reference can block this course
  const before = 'אבגדה'.slice(0, 'אבגדה'.indexOf(y));
  const earlier = [...new Set(d.lists.filter((l) => [...before].some((e) => l.name.includes(`שנה ${e}'`))).flatMap((l) => l.courses))];
  const st = classify(d, { passed: earlier, failed: {}, profile: { amirnet: 134 } }).statuses;
  const mand = d.lists.filter((l) => /חובה/.test(l.name) && l.courses.includes(id)).map((l) => l.name);
  const fixed = structuredClone(d); fixed.courses[id].prereqs = fixed.courses[id].prereqs.map((p) => ({ ...p, anyOf: p.anyOf.filter((a) => a.id !== id) })).filter((p) => p.anyOf.length);
  const st2 = classify(fixed, { passed: earlier, failed: {}, profile: { amirnet: 134 } }).statuses;
  const inYear = yearListOf(d, y);
  if (selfRef && mand.length && st[id].status === 'blocked' && candidate(d, st, id, inYear) === null) blockedMand.push(`${f}:${id}`);
  check(`selfloop-2-${f}-${id}`, selfRef && c.offered && st[id].status === 'blocked' && candidate(d, st, id, inYear) === null && st2[id].status !== 'blocked',
    `${s}/${f}: "${c.name}" (${id}, offered, mandatory list ${JSON.stringify(mand)}) is status ${st[id].status} for a student who passed all earlier years (reason: ${st[id].reasons[0]}); candidate mode ${candidate(d, st, id, inYear)} so no search ever includes it; with the self-reference removed it is ${st2[id].status}`);
}
bug('metric-selfloop-blocks-mandatory', blockedMand.length === 3, `${blockedMand.join(', ')}: a mandatory course (קורסי חובה שנה א\' of software engineering 2027 day+evening: 10825; mechanical engineering 2024 year ג\': 30150) can never be planned: see the three selfloop-2 lines above (classify = blocked, candidate mode null)`);

// 3. how widespread -------------------------------------------------------------------------------------------------------------
let pairs = 0, mandatory = 0; const mandList = [];
for (const s of ['2027-1', '2027-2', '2027-3']) for (const f of fs.readdirSync(new URL(`../../web/data/afeka/${s}/`, import.meta.url)).filter((x) => x.endsWith('.json'))) {
  const d = data(s, f.replace('.json', ''));
  const st = classify(d, { passed: [], failed: {}, profile: { amirnet: 134 } }).statuses;
  for (const [id, c] of Object.entries(d.courses)) {
    if (!c.offered || !c.prereqs.some((p) => p.kind === 'קדם' && p.anyOf.some((a) => a.id === id))) continue;
    pairs++;
    if (st[id].status === 'blocked' && st[id].blockedBy.includes(id) && d.lists.some((l) => /חובה/.test(l.name) && !/התמחות/.test(l.name) && l.courses.includes(id))) { mandatory++; mandList.push(`${s}/${f.replace('.json', '')}:${id}`); }
  }
}
console.log(`  offered self-referencing course records: ${pairs}; of them in a non-specialization "חובה" list and blocked by themselves: ${mandatory} (${mandList.slice(0, 8).join(', ')}${mandList.length > 8 ? ', ...' : ''})`);
check('selfloop-3', mandatory > 0, 'the problem reaches non-specialization mandatory lists in the committed data (count above)');

// 4. the display consequence in the metric helpers (unlockCounts is what ui-side.js:59 / ui-view.js:115 / ui-map.js:27 show as "פותח N קורסים")
{
  const d = data('2027-1', '10-2024');
  const uc = unlockCounts(d, []), dn = downstream(d);
  console.log(`  unlockCounts(10-2024)['10825'] = ${uc['10825']} (course 10825 has no real dependents); its own id is in downstream: ${dn['10825'].has('10825')}`);
  const realDependents = Object.entries(d.courses).filter(([id, c]) => id !== '10825' && c.prereqs.some((p) => p.kind === 'קדם' && p.anyOf.some((a) => a.id === '10825'))).length;
  bug('metric-selfloop-unlocks', uc['10825'] === 1 && realDependents === 0, `the side list/map tag "פותח קורס אחד" is shown for a course that opens nothing (real dependents: ${realDependents})`);
}
process.exitCode = bad ? 1 : 0;
