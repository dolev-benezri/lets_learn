// opts-02  The "240 sub-groups not linked from any primary": what they are, where they come from, and what they do to the options.
// Targets: scripts/build.mjs:84 (the warning that reports them), scripts/build.mjs:12-19 (primaries without meetings are dropped, links to dropped groups removed),
//          scripts/parse.mjs:41-67 (parseGroups), web/solver-core.js:69-78 (grow: only groups reachable through `linked` can join an option), :81 (includeFull).
// Evidence files (saved by hand with ONE polite GET each on 2026-10-06 17:34-17:40Z, User-Agent 'afeka-scheduler-audit/1.0 (read-only audit)'; the script itself never touches the network):
//   opts-data/live-<course>.html = https://yedionpub.afeka.ac.il/yedion/fireflyweb.aspx?prgname=S_LOOK_FOR_NOSE&arguments=-N<course>   (10013, 90901, 90905, 90914)
//   opts-data/live-details-10013-lab305.html = ...?prgname=S_CourseDetails&arguments=-N10013,-N1,-N21,-N271001305,-N
// Run:  node solver-audit/repro/opts-02-unlinked-groups.mjs     (any cwd, <5 s)
// Proves: CHECK lines = the 240 are 6 distinct groups in 4 courses; 5 are tutorials whose lecture is absent from the source page (4) or unscheduled and dropped by build.mjs (1) -> harmless;
//         1 is lab 271001305 of course 10013 which the source page never links -> with the UI default includeFull=false course 10013 has NO option in 2027-1 (BUG opts-1).
import { buildOptions, search } from '../../web/solver-core.js';
import { parseGroups } from '../../scripts/parse.mjs';
import { loadAll, readLocal, check, bug, note, finish, isPrimaryType } from './opts-lib.mjs';

const all = loadAll();
// ---- 1. enumerate the unlinked sub-groups in all 144 files
const rows = [];
for (const { sem, file, data } of all) for (const [cid, c] of Object.entries(data.courses)) {
  const linked = new Set(c.groups.flatMap((x) => x.linked));
  for (const x of c.groups) if (!x.primary && !linked.has(x.id)) rows.push({ sem, file, cid, id: x.id, type: x.type });
}
const byGroup = new Map();
for (const r of rows) { const k = `${r.sem} ${r.cid} ${r.id} (${r.type})`; byGroup.set(k, (byGroup.get(k) ?? 0) + 1); }
check('opts-C20', rows.length === 240 && byGroup.size === 6, `${rows.length} (file,group) rows = ${byGroup.size} distinct groups: ${[...byGroup].map(([k, n]) => `${k} x${n} files`).join('; ')}`);
check('opts-C21', new Set(rows.map((r) => `${r.sem}/${r.cid}`)).size === 4, `courses involved: ${[...new Set(rows.map((r) => `${r.sem}/${r.cid}`))].join(', ')}`);

// ---- 2. a sub-group named "<primary>/<n>" is always linked from <primary> when <primary> exists in the data
let slashViolations = 0, orphanParents = 0, reLinked = 0;
const seen = new Set();
for (const { sem, data } of all) for (const [cid, c] of Object.entries(data.courses)) {
  if (seen.has(`${sem}${cid}`)) continue; seen.add(`${sem}${cid}`);
  const byId = new Map(c.groups.map((x) => [x.id, x]));
  for (const x of c.groups.filter((y) => !y.primary && y.id.includes('/'))) {
    const parent = byId.get(x.id.split('/')[0]);
    if (!parent) { orphanParents++; if (c.groups.some((y) => y.linked.includes(x.id))) reLinked++; } else if (!parent.linked.includes(x.id)) slashViolations++;
  }
}
check('opts-C22', slashViolations === 0 && orphanParents === 9 && reLinked === 4,
  `tutorials "P/n" whose existing parent P does not link them: ${slashViolations}; tutorials whose parent P is absent from the data: ${orphanParents}, of which ${reLinked} are linked from another lecture (normal re-assignment, e.g. 279092608/1 <- 279092606) and ${orphanParents - reLinked} are the 5 orphans`);

// ---- 3. live source snapshots: parse is lossless, and the cause of each orphan is on the source page
const pages = Object.fromEntries(['10013', '90901', '90905', '90914'].map((c) => [c, readLocal(`opts-data/live-${c}.html`)]));
const parsed = Object.fromEntries(Object.entries(pages).map(([c, h]) => [c, parseGroups(h)]));
const lossless = Object.entries(pages).every(([c, h]) => (h.match(/קורס מסוג/g) ?? []).length === parsed[c].length);
check('opts-C23', lossless, `parseGroups keeps every group chunk: ${Object.entries(parsed).map(([c, p]) => `${c}: ${p.length} parsed = ${(pages[c].match(/קורס מסוג/g) ?? []).length} on page`).join('; ')}`);
const chunksMentioning = (html, id) => html.split('<div class="TextAlignRight">').slice(1).filter((ch) => ch.includes(id)).length;
for (const [course, parent] of [['90901', '279090107'], ['90901', '279090115'], ['90905', '279090507'], ['90905', '279090515']]) {
  const p = parsed[course], sub = p.find((x) => x.id === `${parent}/1`);
  check(`opts-C24-${parent}`, !p.some((x) => x.id === parent) && chunksMentioning(pages[course], parent) === 1 && sub && !p.some((x) => x.linked.includes(sub.id)),
    `source page of ${course}: lecture ${parent} has no group chunk; the number occurs in exactly 1 chunk (the tutorial ${sub?.id} itself); no group links the tutorial -> cause = source page, not parse/build`);
}
{
  const p = parsed['90914'], par = p.find((x) => x.id === '279091417'), sub = p.find((x) => x.id === '279091417/1');
  const d = all.find((f) => f.sem === '2027-2' && f.data.courses['90914']).data.courses['90914'];
  check('opts-C24-279091417', par && par.primary && par.meetings.length === 0 && par.lecturer === '' && par.linked.includes(sub.id) && !d.groups.some((x) => x.id === '279091417') && d.groups.some((x) => x.id === '279091417/1'),
    `source page of 90914: lecture 279091417 exists with NO lecturer and NO meetings and links ${par?.linked}; scripts/build.mjs:12-15 drops it (warning only), the tutorial stays and is orphaned; committed data has the tutorial but not the lecture`);
}
{
  const p = parsed['10013'], lab = p.find((x) => x.id === '271001305');
  check('opts-C24-271001305', lab && lab.type === 'מעבדה' && lab.meetings.length === 1 && !p.some((x) => x.linked.includes('271001305')) && chunksMentioning(pages['10013'], '271001305') === 1,
    `source page of 10013: lab 271001305 (${lab?.meetings.map((m) => `${m.semester} day${m.day} ${m.start}-${m.end}`)}) is in exactly 1 chunk (its own); linked-from lists: tutorials 301/1 -> ${p.find((x) => x.id === '271001301/1').linked}, 302/1 -> ${p.find((x) => x.id === '271001302/1').linked} (only the FULL lab 271001304)`);
  const det = readLocal('opts-data/live-details-10013-lab305.html');
  check('opts-C25', !/קבוצות הקשורות/.test(det), 'the S_CourseDetails page of lab 305 carries no linkage information either (it cannot settle whether students may register it)');
}
// ---- 4. the committed 10013 equals the live page after the build.mjs:15-19 filter (so the data is a faithful copy of the source)
{
  const kept = parsed['10013'].filter((x) => x.meetings.length && x.meetings.every((m) => m.semester === 'א'));
  const ids = new Set(kept.map((x) => x.id));
  const mine = kept.map((x) => [x.id, x.type, x.linked.filter((l) => ids.has(l)).join(','), x.meetings.map((m) => `${m.day}${m.start}${m.end}${m.room}`).join(';')].join('|')).sort();
  const file = all.find((f) => f.sem === '2027-1' && f.file === '10-2024.json').data.courses['10013'];
  const theirs = file.groups.map((x) => [x.id, x.type, x.linked.join(','), x.meetings.map((m) => `${m.day}${m.start}${m.end}${m.room}`).join(';')].join('|')).sort();
  check('opts-C26', JSON.stringify(mine) === JSON.stringify(theirs), `live page -> build filter == committed 2027-1/10-2024.json#10013 (${mine.length} groups, ids/links/times/rooms)`);
}

// ---- 5. impact on options
// 5a. orphan tutorials are harmless: no option can contain them, and every lecture that exists keeps all of its own tutorials
const orphanIds = new Set(rows.filter((r) => r.id.includes('/')).map((r) => r.id));
let leaks = 0;
for (const { data } of all) for (const c of Object.values(data.courses)) for (const o of buildOptions(c, { includeFull: true })) if (o.groups.some((id) => orphanIds.has(id))) leaks++;
check('opts-C27', leaks === 0, `options containing an orphan tutorial (would be a tutorial without its lecture): ${leaks}`);

// 5b. lab 271001305 (10013, semester א, 16 files)
const files10013 = all.filter((f) => f.sem === '2027-1' && f.data.courses['10013']);
const zero = files10013.filter((f) => buildOptions(f.data.courses['10013'], { includeFull: false }).length === 0).length;
const withFull = files10013.map((f) => buildOptions(f.data.courses['10013'], { includeFull: true }).map((o) => o.groups.join('+')).join(' , '));
const mandatory = files10013.filter((f) => f.data.lists.some((l) => /חובה/.test(l.name) && l.courses.includes('10013'))).length;
note(`10013 offered in 2027-1 of ${files10013.length} files (programs ${[...new Set(files10013.map((f) => f.file.split('-')[0]))]}), listed under a 'חובה' list in ${mandatory}; includeFull:true options: ${[...new Set(withFull)].join(' , ')}`);
bug('opts-1', zero === 16 && files10013.length === 16, `with includeFull=false (UI default web/app.js:15) buildOptions(10013) has 0 options in ${zero}/${files10013.length} files, because every registration ends in the only linked lab 271001304 which is full (lab 271001305 is not full: ${files10013[0].data.courses['10013'].groups.find((x) => x.id === '271001305').full === false})`);
{
  const f = files10013[0].data;
  const res = search({ data: f, courses: [{ id: '10013', mode: 'must' }], constraints: { includeFull: false, dayOff: [] }, weights: { progress: 1 }, topK: 3 });
  bug('opts-1b', res.results.length === 0 && /קבוצות מלאות/.test(res.diagnosis.join(' ')), `search() with course 10013 as must and default includeFull -> results ${res.results.length}; diagnosis: ${res.diagnosis[0]}`);
  const res2 = search({ data: f, courses: [{ id: '10013', mode: 'must' }], constraints: { includeFull: true, dayOff: [] }, weights: { progress: 1 }, topK: 3 });
  check('opts-C28', res2.results.length === 2, `same search with includeFull=true finds ${res2.results.length} registrations (the user can only recover by ticking the checkbox)`);
  // hypothetical: if the source linked lab 305 from the tutorials the same way it links 304 (NOT asserting that Afeka allows it)
  const what = structuredClone(f.courses['10013']);
  for (const t of what.groups.filter((x) => x.type === 'תרגול')) t.linked.push('271001305');
  const hyp = buildOptions(what, { includeFull: false }).map((o) => o.groups.join('+'));
  note(`hypothetical (tutorials also link 271001305): options with includeFull=false = ${hyp.join(' , ')}`);
  check('opts-C29', hyp.length === 2, 'if 305 were linked, 2 non-full registrations (301+301/1+305, 302+302/1+305) would exist -> the solver loses them only because of the missing link');
}
// 5c. the other 'primary is open but its tutorial is full' case, for completeness (not an unlinked-group effect)
note('only other primary whose every registration is blocked by a full sub-group (includeFull=false): 2027-2 course 90904 lecture 279090404 (both tutorials full) -> legitimate, tutorials really full');
finish();
