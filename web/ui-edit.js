// The edit page (#edit, #edit/changes): a separate page from the build steps. Step 1 loads my schedule and reviews what was read;
// step 2 and the proposals follow. Pure HTML helpers are exported (test/ui-edit.test.mjs); the DOM part is at the bottom.
import { app, esc, seatsAt, recordOf, saving, setEditSaveFailed } from './app.js';
import { $, needsProgram, copy, toast, designOn, ui } from './ui-common.js';
import { DAYS, groupIndex, typeLabel, icon, nameHtml, hourRange, renderWeek, assignColors, placePop } from './ui-grid.js';
import { askConfirm } from './ui-dialog.js';
import { classify } from './rules.js';
import { kinds, overlaps, displayData, summaryLine, changeText, splitOnlySwaps, PROPOSAL_ONLY, FIXED } from './edit-search.js';
import { reqContext, reqMet } from './rules.js';
import { groupNumber, lecturerText, ago, YEDION_HINT, SPLIT_NOTE, SPLIT_TAG, splitLine, courseCount, shareText, heb } from './ui-text.js';
import { shareImageFile, headerLabel, fontsReady, FONTS } from './share-image.js';
import { friendLink, friendPayload } from './share.js';
import { identityPick } from './ui-me.js';
import { sheetExpandHtml } from './phone-sheet.js';
import { searchCourses } from './course-search.js';
import { searchViewHtml, resultsHtml as csResultsHtml, countLine } from './ui-course-search.js';
import { getEdit, setEdit, saveEdit, restoredCount, lessonsOf, loadSchedule, restoreOriginal, saveProposal, datasetOf, sameDataset } from './edit-state.js';

// ---------- step 1: rows -> lessons ----------
// A row needs the student's word unless it is sure (a row with no group needs the tap too: it stays as a fixed lesson).
export const pendingRows = (rows, choices) =>
  rows.flatMap((r, i) => (r.confidence === 'sure' || i in choices ? [] : [i]));

// The first confirmed row that gives no lesson: its group left the data and the row has no hours to keep (-1: none).
export const lostRow = (rows, choices, data) =>
  rows.findIndex((r, i) => {
    const v = i in choices ? choices[i] : r.confidence === 'sure' ? r.chosen : undefined;
    return !!v && !r.meets.length && !lessonsOf([v], data).length;
  });

// The lessons the confirmed rows stand for. choices[i]: a group id, or null = "no group" (stays fixed, with the row's hours).
// A chosen group the data no longer has (a newer data file) stays fixed with the row's hours too.
export function lessonsFromRows(rows, choices, data) {
  const out = [], seen = new Set();
  rows.forEach((r, i) => {
    const v = i in choices ? choices[i] : r.confidence === 'sure' ? r.chosen : undefined;
    if (v === undefined || (v && seen.has(v))) return;
    const ls = v ? lessonsOf([v], data) : [];
    if (v) seen.add(v);
    out.push(...(ls.length ? ls : r.meets.map((m) => ({
      course: r.code ?? `x${i}`, name: r.name ?? r.code ?? 'קורס', type: r.type ?? 'הרצאה', group: null, day: m.day, start: m.start, end: m.end
    }))));
  });
  return out;
}

const hours = (m) => `יום ${DAYS[m.day]}׳ <bdi dir="ltr">${esc(m.start)}–${esc(m.end)}</bdi>`;
function groupLine(id, data) {
  const x = data && groupIndex(data).get(id);
  if (!x) return `<bdi dir="ltr">${esc(id)}</bdi>`;
  const { g } = x;
  const meets = g.meetings.map(hours).join(', '), full = g.full ? ' <span class="tag bad">מלאה</span>' : '';
  return `${esc(typeLabel(g.type))} ${esc(groupNumber(g.id))} · ${meets} · ${esc(lecturerText(g.lecturer) || '—')}${full}`;
}

function reviewRowHtml(r, i, choices, data) {
  const radio = (v, label) => {
    const on = i in choices && (choices[i] ?? '') === v;
    return `<label class="rv-opt"><input type="radio" name="rv${i}" value="${esc(v)}" data-ed-pick="${i}"${on ? ' checked' : ''}><span>${label}</span></label>`;
  };
  return `<fieldset class="rv-row" data-ed-row="${i}"><legend><b>${esc(r.name ?? r.code ?? 'שורה')}</b>${r.code && r.name ? ` <bdi dir="ltr" class="gid">${esc(r.code)}</bdi>` : ''}
    <span class="hint">${esc(r.type ? typeLabel(r.type) : '')} ${r.meets.map(hours).join(' · ')}</span></legend>
    ${r.candidates.map((id) => radio(id, groupLine(id, data))).join('')}${radio('', 'בלי קבוצה (נשאר קבוע)')}</fieldset>`;
}

// What the saved schedule held, from its snapshots (so it can be read even when the data changed).
const snapshotHtml = (ls) =>
  `<ul class="plain snap">${ls.map((l) => `<li><b>${esc(l.name)}</b> ${esc(typeLabel(l.type))} · ${hours(l)}</li>`).join('')}</ul>`;

// Step 1. edit: the saved state; data: the chosen semester's file; review: the rows read (the sure ones are not listed);
// opts.same: the saved schedule belongs to the data now shown; opts.saving: saving really works (app.js saving), else the promise is hidden.
// How many courses the file or the hand pick gave, so the student sees the load worked before step 2.
const coursesLine = (rows, data) => {
  const idx = data && groupIndex(data);
  const n = new Set(rows.map((r, i) => (r.chosen && idx?.get(r.chosen)?.cid) ?? r.code ?? r.name ?? i)).size;
  return n ? ` · ${n === 1 ? 'קורס אחד' : `${n} קורסים`}` : '';
};

// Design A (phase 2, Task E): what is loaded, in one line ("2 קורסים · ימים ג׳ ו-ד׳"), for the המערכת שלי screen's heading.
export function loadedLineA(lessons) {
  const courses = new Set(lessons.map((l) => l.course)).size;
  const days = [...new Set(lessons.map((l) => l.day))].sort((a, b) => a - b).map((d) => `${DAYS[d]}׳`);
  if (!courses) return '';
  const when = days.length === 1 ? `יום ${days[0]}` : `ימים ${days.slice(0, -1).join(', ')} ו-${days.at(-1)}`;
  return `${courseCount(courses)} · ${when}`;
}
export function stepOneHtml(edit, data, review, { same = true, saving = true, lessons = null } = {}) {
  const d = edit.draft, choices = d?.choices ?? {}, rows = d ? review : [];
  const head = `<div class="me-head"><h2 id="editTitle" tabindex="-1">המערכת שלי</h2>
    <p class="me-step">${
      designOn() ? esc(loadedLineA(lessons ?? edit.baseline) || 'טוענים את המערכת שיש לכם.') : '<b>צעד 1 מתוך 2.</b> טוענים את המערכת שיש לכם.'
    }</p></div><div id="editIdentity"></div>`;
  // edWaysMsg: why a load button did nothing (track or year missing), said beside the button that was pressed
  const waysBody = (primary) => `<p class="err-text" id="edWaysMsg" role="alert"></p><div class="me-choice-btns">
    <button type="button" class="btn${primary ? ' primary' : ''}" data-ed="loadFile">קובץ מערכת (אקסל מאפקה-נט, PDF או צילום)</button>
    <button type="button" class="btn" data-ed="loadHand">לבחור קורסים וקבוצות ידנית</button></div>
    <p class="hint edit-yedion">${YEDION_HINT}</p>`;
  const ways = (primary) => `<section class="me-card edit-ways" aria-label="טעינת המערכת">${waysBody(primary)}</section>`;
  // once a schedule is loaded, what was read comes first and the load buttons fold under one line (a phone sees the review at once)
  const reload = `<details class="${designOn() ? '' : 'me-card '}edit-ways"><summary>טעינה מחדש או שינוי ידני</summary>${waysBody(false)}</details>`;
  if (!same)
    return `${head}<div class="edit-col"><p class="msg bad" role="status"><span>המערכת נשמרה מול נתונים אחרים. טענו אותה שוב כדי לערוך.</span></p>
      <section class="me-card"><h3>המערכת שנשמרה</h3>${snapshotHtml(edit.original)}
      <button type="button" class="btn" data-ed="restore">חזרה למערכת המקורית</button></section>${ways(true)}</div>`;
  const review_ = rows.flatMap((r, i) => (r.confidence === 'sure' ? [] : [reviewRowHtml(r, i, choices, data)]));
  const loaded = rows.length || edit.baseline.length;
  return `${head}<div class="edit-col">${loaded ? '' : ways(true)}
    ${review_.length ? `<section class="me-card" aria-labelledby="rvH"><h3 id="rvH">לבדיקה</h3>
      <p class="hint">לא בטוחים בשורות האלה. בחרו קבוצה בכל שורה.</p>${review_.join('')}</section>` : ''}
    ${loaded ? `<section class="${designOn() ? 'edit-reg' : 'me-card'}"><label class="check"><input type="checkbox" data-ed-reg${d?.registered ?? edit.registered ? ' checked' : ''}>
      המערכת כבר רשומה במכללה</label>
      ${d?.sem && !designOn() ? `<p class="hint">נטענה מערכת של סמסטר ${esc(d.sem)}${d.sem.length === 1 ? '׳' : ''}${coursesLine(rows, data)}</p>` : ''}</section>${reload}` : ''}
    <p class="err-text" id="edMsg" role="alert"></p>
    ${designOn() && loaded ? '<div class="edit-next"><button type="button" class="btn primary" data-ed="next">לשינויים</button></div>' : ''}</div>
    ${designOn() ? '' : `<div class="me-foot"><span class="hint" data-saved${saving ? '' : ' hidden'}>כל שינוי נשמר מיד.</span>
      <button type="button" class="btn${loaded ? ' primary' : ''}" data-ed="next">הבא: שינויים</button></div>`}`;
}

// Design A, before anything is loaded: one centred card (phase 2, Task B). The same ids and data-ed actions as step one's ways to load, so the loader
// works as it does there; the instructions for downloading the file open in place behind the card's last line. open: that disclosure's state (the page
// is redrawn).
export const emptyCardHtml = (open = false) => `<section class="edit-card" aria-labelledby="editTitle">
  <h2 id="editTitle" tabindex="-1">טוענים את המערכת שלכם</h2>
  <p class="edit-card-line">מאפקה-נט, או בוחרים בעצמכם.</p>
  <div id="editIdentity"></div>
  <p class="err-text" id="edWaysMsg" role="alert"></p>
  <div class="edit-card-btns">
    <button type="button" class="btn primary" data-ed="loadFile">טוענים קובץ</button>
    <button type="button" class="btn" data-ed="loadHand">בוחרים קורסים ידנית</button></div>
  <details class="edit-how"${open ? ' open' : ''}><summary data-k="edHow">אקסל, PDF או צילום · <span>איך מורידים מאפקה-נט?</span></summary>
    <p class="hint edit-yedion">${YEDION_HINT}</p></details>
  <p class="err-text" id="edMsg" role="alert"></p></section>`;

// ---------- the course search (phase 2, Task F): the state is V.s, the HTML ui-course-search.js, the matching course-search.js ----------
const SEM_CODE = { 'א': 1, 'ב': 2, 'קיץ': 3 };
function searchCtx(st) {
  const sem = st.dataset.sem, data = dataOf(sem), { pr, zero } = stepTwoBase(st);
  const inSchedule = new Set([...uniq(st.baseline.map((l) => l.course)), ...st.added].filter((c) => !st.removed.includes(c)));
  return {
    // the week the board shows (a proposal, the original, or the schedule with its pending changes): the tags must agree with what is on screen
    data: app.sem, foreign: V.s.foreign, sem, week: pr ? pr.lessons : zero ? st.baseline : effectiveLessons(st, data), inSchedule,
    statuses: classify(data, app.state).statuses,
    registered: st.registered, owned: st.owned, split: !!app.state.constraints.split
  };
}
// the line the count says when the chosen program's files are loading or one of the semesters asked for failed to load
const searchFailed = () => (V.s.loading ? 'loading' : V.s.failedSems.has(V.s.sem || edit().dataset.sem));
const searchQuery = () => ({ text: V.s.text, day: Number(V.s.day) || null, hour: V.s.hour || null, sem: V.s.sem || undefined, program: V.s.program });
const searchAsked = () => !!(V.s.text.trim() || V.s.day || V.s.hour);
const programsOf = (st) => {
  const own = st.dataset.program, all = app.catalog?.programs ?? [];
  return [...all.filter((p) => p.id === own), ...all.filter((p) => p.id !== own)].map((p) => ({ id: p.id, name: p.name }));
};
function searchToolHtml(st) {
  const r = searchCourses(searchCtx(st), searchQuery());
  return searchViewHtml(V.s, programsOf(st), r, searchAsked(), searchFailed());
}
// typing and the chips redraw the results alone: the field keeps its focus and its caret
function updateResults() {
  const box = $('csResults');
  if (!box || !V.s.open) return;
  const r = searchCourses(searchCtx(edit()), searchQuery());
  // a result button that survives the redraw keeps focus
  const keep = document.activeElement?.closest?.('#csResults') ? document.activeElement.dataset.k : null;
  $('csCount').textContent = countLine(r, searchAsked(), searchFailed());
  box.innerHTML = csResultsHtml(r, searchAsked());
  if (keep) box.querySelector(`[data-k="${CSS.escape(keep)}"]`)?.focus({ preventScroll: true });
}
// Another program's courses: its files are fetched on demand; the last choice wins over an earlier answer (V.s.fetch)
async function chooseProgram(id) {
  const st = edit(), mine = String(id) === String(st.dataset.program) || !id;
  const my = ++V.s.fetch;
  V.s.program = mine ? 'mine' : Number(id);
  V.s.foreign = null;
  V.s.failedSems = new Set();
  V.s.loading = !mine;
  updateResults();
  if (mine) return;
  const prog = (app.catalog?.programs ?? []).find((p) => p.id === Number(id));
  const startYear = prog?.startYears?.includes(st.dataset.startYear) ? st.dataset.startYear : Math.max(...(prog?.startYears ?? [st.dataset.startYear]));
  // each semester on its own: a successful load is kept for the visit (the cache), a 404 means the program has no such semester, anything else is a failure of
  // that semester only (the count says so when it is the one asked for)
  const get = async (sem) => {
    const key = `${st.dataset.year}-${SEM_CODE[sem]}/${id}-${startYear}`;
    if (V.s.cache.has(key)) return V.s.cache.get(key);
    const res = await fetch(`data/afeka/${key}.json`, { cache: 'no-cache' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(res.status);
    const d = await res.json();
    if (!d?.courses || typeof d.courses !== 'object') throw new Error('a data file with no courses');
    V.s.cache.set(key, d);
    return d;
  };
  const sems = ['א', 'ב', 'קיץ'], answers = await Promise.allSettled(sems.map(get));
  if (my !== V.s.fetch) return; // an older answer arriving after a newer choice, success or failure
  V.s.foreign = Object.fromEntries(sems.map((sem, i) => [sem, answers[i].status === 'fulfilled' ? answers[i].value : null]));
  V.s.failedSems = new Set(sems.filter((_, i) => answers[i].status === 'rejected'));
  V.s.loading = false;
  updateResults();
}
const addCourseFixed = (b) => {
  const st = edit(), course = b.dataset.course, ids = b.dataset.ids.split(','), withIds = (b.dataset.with ?? '').split(',').filter(Boolean);
  const have = new Set([...st.baseline.map((l) => l.course), ...st.added]);
  const all = [course, ...withIds];
  const added = [...st.added, ...all.filter((c, i, a) => !have.has(c) && a.indexOf(c) === i)];
  V.s.open = false;
  touch({ ...st, added, removed: st.removed.filter((c) => !all.includes(c)), swaps: { ...st.swaps, [course]: ids } }, '[data-ed="openSearch"]');
  toast(withIds.length ? 'הקורס וקורס המקביל שלו נוספו לשינויים' : 'הקורס נוסף לשינויים');
};

// ---------- step 2: pure parts ----------
const OPEN = ['retake', 'available', 'afterA', 'conditional']; // classify statuses a course can be taken in this semester
const nameIn = (edit, data, id) => data.courses[id]?.name ?? edit.baseline.find((l) => l.course === id)?.name ?? id;
const courseOfGroup = (data, gid) => /^fixed:(.+):\d+$/.exec(gid)?.[1] ?? groupIndex(data).get(gid)?.cid;

// The schedule as the week shows it: the baseline without removed courses, a swapped course in its new groups.
export function effectiveLessons(edit, data) {
  const out = (id) => !edit.removed.includes(id);
  return [
    ...edit.baseline.filter((l) => out(l.course) && !edit.swaps[l.course]?.length),
    ...Object.entries(edit.swaps).filter(([id]) => out(id)).flatMap(([, ids]) => lessonsOf(ids, data))
  ];
}

// The menu of one lesson (opened from a block). data = displayData's data: fixed lessons are groups of "fixed:<course>" courses.
export function lessonMenuHtml(edit, data, gid) {
  const course = courseOfGroup(data, gid), x = groupIndex(data).get(gid), real = !!data.courses[course];
  const on = edit.movable.includes(course);
  return `<div class="pop-head"><span class="dot" aria-hidden="true"></span><div><h3 id="popTitle">${nameHtml(x?.c.name ?? course)}</h3>
    <p>${esc(typeLabel(x?.g.type ?? ''))} · ${x?.g.meetings.map(hours).join(', ') ?? ''}</p></div>
    <button type="button" class="btn icon-btn ghost" data-act="popClose" aria-label="סגור">${icon('x')}</button></div>
    <div class="pop-actions">${real ? `<button type="button" class="btn${on ? ' primary' : ''}" data-ed="toggleMove" data-course="${esc(course)}" aria-pressed="${on}">יכול לזוז</button>
    <button type="button" class="btn" data-ed="others" data-course="${esc(course)}" aria-controls="popOthers">קבוצות אחרות</button>` : ''}
    <button type="button" class="btn" data-ed="drop" data-course="${esc(course)}">להוריד מהמערכת</button></div>
    <div id="popOthers" class="pop-body" aria-live="polite"></div>`;
}

// Two lessons the search would not accept: a pinned real lesson over another pinned real one, or over a fixed one. The message names
// both and asks to mark the real one movable. Overlaps among fixed lessons never block (they are one option in the search).
export function overlapMessage(edit, lessons, data) {
  const real = kinds(edit, data).real, pinned = (c) => real.includes(c) && !edit.movable.includes(c);
  const name = (c) => lessons.find((l) => l.course === c)?.name ?? c;
  for (const [a, b] of overlaps(lessons)) {
    const pa = pinned(a), pb = pinned(b), fixed = (c) => !real.includes(c);
    if (!((pa && (pb || fixed(b))) || (pb && fixed(a)))) continue;
    const who = pa && pb ? 'אחד מהם' : name(pa ? a : b);
    return `${name(a)} ו${name(b)} חופפים. סמנו את ${who} כ"יכול לזוז" כדי לחפש.`;
  }
  return null;
}

// Removing `course` while another baseline course needs it in parallel: one question per such course (yes removes both).
export function parallelPrompts(edit, data, course, record = null) {
  const gone = new Set(edit.removed), ids = [...new Set(edit.baseline.map((l) => l.course))];
  const ctx = record && reqContext(record);
  // the requirement fails once `course` goes: no other alternative in the schedule, none passed already
  const needs = (p) =>
    p.kind === 'מקביל' && p.anyOf.some((a) => a.id === course) && !(ctx && reqMet(p, ctx)) &&
    !p.anyOf.some((a) => a.id && a.id !== course && ids.includes(a.id) && !gone.has(a.id));
  return ids
    .filter((id) => id !== course && !gone.has(id) && data.courses[id]?.prereqs.some(needs))
    .map((id) => ({ id, text: `${data.courses[id].name} צריך את ${nameIn(edit, data, course)} במקביל. להסיר גם את ${data.courses[id].name}?` }));
}

// A line for each baseline course the rules block, built from its requirement's names (reasons can be empty).
export function blockedLines(edit, data, statuses) {
  return [...new Set(edit.baseline.map((l) => l.course))].filter((id) => !edit.removed.includes(id) && statuses[id]?.status === 'blocked').map((id) => {
    const s = statuses[id], names = [...new Set((s.blockedBy ?? []).flat().map((c) => data.courses[c]?.name).filter(Boolean))];
    const why = s.reasons?.filter(Boolean).join('; ') || (names.length ? `דורש ${names.join(' או ')}` : 'לא מתקיימת דרישת קדם');
    return `${nameIn(edit, data, id)}: ${why}`;
  });
}

// Courses open to the student this semester that the schedule does not have.
export function addableCourses(data, statuses, edit) {
  const have = new Set([...edit.baseline.map((l) => l.course), ...edit.added]);
  return Object.entries(data.courses)
    .filter(([id, c]) => c.offered && c.groups.length && OPEN.includes(statuses[id]?.status) && !have.has(id))
    .map(([id, c]) => ({ id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

const DAY_OPTS = [1, 2, 3, 4, 5, 6], END_OPTS = ['13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
const opt = (v, label, on) => `<option value="${esc(v)}"${on ? ' selected' : ''}>${esc(label)}</option>`;
// A chip that is a drop-down (the phone's own picker): `shown` is its label until a value is chosen.
const chipSelect = (goal, value, sr, shown, options) =>
  `<label class="chip${value ? ' on' : ''}"><span class="sr">${sr}</span><select data-ed-goal="${goal}">${opt('', shown, !value)}` +
  `${options.map(([v, label]) => opt(v, label, v === value)).join('')}</select></label>`;
// text is HTML (a group line, and the split tag when the option needs a split)
const swapButton = (course, ids, text) =>
  `<button type="button" class="btn" data-ed="pickSwap" data-course="${esc(course)}" data-groups="${esc(ids.join(','))}">${text}</button>`;
// Goal chips: two are drop-downs (the phone's own picker), one a toggle, then "+ קורס".
// search (design A, phase 2 Task F): "חיפוש קורס" opens the course search in place of the "+ קורס" select
export function goalsHtml(edit, addable, search = false) {
  const g = edit.goal;
  return `<div class="goals" role="group" aria-label="מטרה">
    ${chipSelect('dayOff', g.dayOff, "לפנות יום", "לפנות יום ▾", DAY_OPTS.map((d) => [d, `לפנות יום ${DAYS[d]}׳`]))}
    <button type="button" class="chip${g.fewerGaps ? ' on' : ''}" data-ed="fewerGaps" aria-pressed="${g.fewerGaps}">פחות חלונות</button>
    ${chipSelect('notAfter', g.notAfter, "לסיים עד", "לסיים עד ▾", END_OPTS.map((t) => [t, `לסיים עד ${t}`]))}
    ${search
      ? '<button type="button" class="chip" data-ed="openSearch" data-k="csOpen">חיפוש קורס</button>'
      : addable.length ? chipSelect("addCourse", null, "הוספת קורס", "+ קורס", addable.map((c) => [c.id, c.name])) : ""}
  </div>`;
}

// The build page's option "להציג גם הרצאה ותרגול מופרדים" (state.constraints.split): the same checkbox, handled by CHG.split (ui-actions.js),
// which asks for the advisor's warning to be acknowledged before it turns on. The search follows it (edit-search.js editQuery).
export const splitOptionHtml = (on) =>
  `<label class="check edit-split"><input type="checkbox" data-chg="split" data-k="editSplit"${on ? ' checked' : ''}> להציג גם הרצאה ותרגול מופרדים</label>`;

// What the next search will use: movable courses, new groups, added and removed courses, each undone with one tap.
export function changesHtml(edit, data) {
  const gone = (c) => edit.removed.includes(c);
  const chip = (act, id, text, extra = '') =>
    `<button type="button" class="chip tag-chip" data-ed="${act}" data-course="${esc(id)}"><span>${esc(text)}</span>${icon('x')}<span class="sr"> (בטל)</span></button>${extra}`;
  const rows = [
    ['יכולים לזוז', edit.movable.filter((c) => !edit.removed.includes(c)).map((c) => chip('unmove', c, nameIn(edit, data, c)))],
    // design A: a course added from the search has its fixed group in the schedule it joins: it is one chip, under "נוספים"
    [
      'קבוצה חדשה',
      Object.keys(edit.swaps)
        .filter((c) => edit.swaps[c].length && !gone(c) && !(designOn() && edit.added.includes(c)))
        .map((c) => chip('unswap', c, nameIn(edit, data, c)))
    ],
    ['נוספים', edit.added.map((c) => chip('unadd', c, nameIn(edit, data, c)))],
    ['יורדים מהמערכת', edit.removed.filter((c) => !edit.added.includes(c)).map((c) => chip('unremove', c, nameIn(edit, data, c)))]
  ].filter(([, l]) => l.length);
  return rows.length ? `<ul class="plain changes">${rows.map(([t, l]) => `<li><span class="hint">${t}:</span> ${l.join(' ')}</li>`).join('')}</ul>` : '';
}

// ---------- proposals: pure parts ----------
const uniq = (a) => [...new Set(a)];
const whenOf = (ls) => uniq(ls.map((l) => `${DAYS[l.day]}׳ <bdi dir="ltr">${esc(l.start)}–${esc(l.end)}</bdi>`)).join(', ');
const numsOf = (ls) => uniq(ls.filter((l) => l.group).map((l) => groupNumber(l.group))).map((n) => `<bdi dir="ltr">${esc(n)}</bdi>`).join(' + ');
const groupOf = (data, course, id) => data.courses[course]?.groups.find((g) => g.id === id);
const lecturersOf = (ls, data, course) =>
  lecturerText(ls.filter((l) => l.group).map((l) => groupOf(data, course, l.group)?.lecturer).filter(Boolean).join(','));

// One course's card: the old place struck through, the new one highlighted, the lecturer when it changes, the full-group tag.
function cardHtml(edit, p, data, course, tag) {
  const split = p.split?.includes(course);
  const old = edit.baseline.filter((l) => l.course === course), now = p.lessons.filter((l) => l.course === course);
  const name = data.courses[course]?.name ?? old[0]?.name ?? now[0]?.name ?? course;
  const was = lecturersOf(old, data, course), is = lecturersOf(now, data, course);
  const full = !edit.registered && now.some((l) => l.group && groupOf(data, course, l.group)?.full);
  return `<li class="pcard"><h4>${nameHtml(name)}${tag ? ` <span class="tag">${tag}</span>` : ''}${split ? ` <span class="tag warn">${esc(SPLIT_TAG)}</span>` : ''}</h4>
    ${old.length ? `<p class="was"><s>${whenOf(old)} · <span class="nw">קבוצה ${numsOf(old)}</span></s></p>` : ''}
    ${now.length ? `<p class="now">${whenOf(now)} · <span class="nw">קבוצה ${numsOf(now)}</span>${full ? ' <span class="tag bad">מלאה</span>' : ''}</p>` : ''}
    ${was !== is && is ? `<p class="hint">מרצה: ${was ? `<s>${esc(was)}</s> ` : ''}${esc(is)}</p>` : ''}
    ${full ? `<p class="tag bad">${icon('alert')} הקבוצה מלאה</p>` : ''}</li>`;
}

// One proposal: the summary line, a card for each changed, added and removed course, the disclaimer. zero: the baseline as a
// reference ("המקורית"), with its overlapping pairs as warnings.
export function proposalHtml(edit, p, data, { zero = false } = {}) {
  const name = (c) => p.lessons.find((l) => l.course === c)?.name ?? data.courses[c]?.name ?? c;
  const head = zero ? '<p class="prop-sum"><b>המקורית</b> · המערכת שלכם כמו שהיא, להשוואה.</p>' : `<p class="prop-sum">${esc(summaryLine(edit.baseline, p, data))}</p>`;
  const cards = zero ? [] : [
    ...p.changed.map((c) => cardHtml(edit, p, data, c, '')), ...p.added.map((c) => cardHtml(edit, p, data, c, 'נוסף')),
    ...p.removed.map((c) => cardHtml(edit, p, data, c, 'הוסר'))
  ];
  const warn = zero
    ? overlaps(p.lessons).map(([a, b]) => `<p class="warn-text">${icon('alert')} <span>${esc(name(a))} ו${esc(name(b))} חופפים</span></p>`).join('')
    : '';
  // the build page's own note and line, for a proposal that splits a course (the student switched the option on there)
  const split = !zero && p.split?.length
    ? `<p class="warn-text">${icon('alert')} <span>${esc(SPLIT_NOTE)}</span></p><p class="split-line">${esc(splitLine(p.split.map(name)))}</p>`
    : '';
  return `${head}${split}${cards.length ? `<ul class="pcards">${cards.join('')}</ul>` : ''}${warn}${designOn() ? '' : `<p class="disclaimer">${PROPOSAL_ONLY}</p>`}`;
}

// The days a phone's day tabs mark: where a changed group meets and where a moved course used to be ("היה כאן").
export const changedDays = (byId, groups, ghosts) =>
  new Set([...[...groups].flatMap((g) => byId.get(g)?.g.meetings ?? []), ...ghosts].map((m) => m.day));

// "הצעה n מתוך N" with the previous and next buttons (the build page's arrows: ArrowLeft is next in RTL); 0 is the original.
export function navHtml(i, n) {
  return `<div class="prop-nav" role="group" aria-label="מעבר בין הצעות" tabindex="-1">
    <button type="button" class="btn icon-btn" data-ed="propPrev" aria-label="ההצעה הקודמת" aria-keyshortcuts="ArrowRight">${icon('chevron-right')}</button>
    <span class="alt-label" aria-live="polite">${i === 0 ? 'המקורית' : `הצעה ${i} מתוך ${n}`}</span>
    <button type="button" class="btn icon-btn" data-ed="propNext" aria-label="ההצעה הבאה" aria-keyshortcuts="ArrowLeft">${icon('chevron-left')}</button></div>`;
}

// What a search that found nothing, or not everything, says: the solver's own lines (text only), the one course whose moving
// would make a solution, and the timeout.
export function searchNotesHtml(result, edit, data) {
  const out = [];
  if (!result.proposals.length) {
    out.push(result.diagnosis.length ? `<ul class="plain">${result.diagnosis.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p>לא נמצאה הצעה.</p>');
    for (const c of result.enabling)
      out.push(`<p>אם ${esc(nameIn(edit, data, c))} יזוז, יש פתרון. <button type="button" class="btn" data-ed="letMove" data-course="${esc(c)}">תן לה לזוז</button></p>`);
  }
  // A: a course added from the search with its group fixed that no schedule holds: the group clashes with what stays, or with another fixed one,
  // unless the same question without the goal has an answer (search() asked): then the goal is what blocks it, and it is named
  if (designOn() && !result.proposals.length && edit.added.some((c) => edit.swaps[c]?.length))
    out.push(result.goalBlocks ? `<p>היעד "${esc(result.goalBlocks)}" לא מתאפשר עם הקבוצה הזו. בלי היעד יש הצעה.</p>` : '<p>לא נמצאה מערכת עם הקבוצה הזו.</p>');
  if (result.timedOut) out.push('<p class="hint">לא הספקנו לבדוק הכל</p>');
  return out.join('');
}

// ---------- the page (DOM) ----------
let fresh = false; // a schedule was read in this visit: its review shows even while the saved one belongs to other data
// What step 2 shows and has under way (not saved): the shown day, the search in flight, its result.
// stamp: what the result was worked out on (resultStamp); a result is shown and saved only while that still holds.
// s: the course search (open, the query, the chips, another program's files); fx: what animates next; how: the empty card's download instructions are
// open; more: the proposal's "עוד" is open
const SEARCH = {
  open: false, text: '', day: '', hour: '', sem: '', program: 'mine', foreign: null, loading: false, failedSems: new Set(), fetch: 0, cache: new Map()
};
const V = {
  s: SEARCH, more: false, how: false, day: null, i: 0, fx: null, step: 1, running: false, result: null, stamp: null, seq: 0, edits: 0, worker: null,
  link: null, linkWant: null, sharing: false // the share image: its friend link made ahead ({ key, url }), and a share under way
};
const editColors = new Map();
const edit = getEdit; // the edit state, read once (edit-state.js)
// Keeps the new state and saves it; false when nothing was written (storage blocked or full, or another tab holds a newer copy).
const commit = (next) => {
  setEdit(next);
  if (app.otherTab) return false; // this copy is old: over the other tab's it would erase what that tab did
  const ok = saveEdit(next);
  setEditSaveFailed(!ok);
  return ok;
};
// "כל שינוי נשמר מיד" follows the state of saving without drawing the page again (a redraw would take the focus and the typing).
export const syncSavedHint = () => document.querySelector('#edit [data-saved]')?.toggleAttribute('hidden', !saving());

// What a search's answer is worth only while this holds: the student's record (a prerequisite passed or not), the data file it ran on,
// and the edit state a restored backup may have replaced. Taken before the question goes to the worker, so a change made while it runs shows too.
const resultStamp = () => ({ record: recordOf(JSON.stringify(app.state)), data: dataOf(edit().dataset?.sem), restored: restoredCount() });
const staleResult = () => {
  const s = V.stamp, now = V.result && resultStamp();
  return !!now && (!s || s.record !== now.record || s.data !== now.data || s.restored !== now.restored);
};
const STALE = 'המצב שלי או הנתונים השתנו מאז החיפוש. חפשו הצעות מחדש.';
const dataOf = (sem) => app.sem?.[sem] ?? null;
const sameNow = (st) => !st.baseline.length || (!!dataOf(st.dataset?.sem) && sameDataset(st, dataOf(st.dataset.sem), app.state));
const say = (text, at = 'edMsg') => {
  if ($(at)) $(at).textContent = text;
};
const onChanges = () => location.hash === '#edit/changes';

// Any change to what the search uses clears the result it gave, saves, and draws the page again; focus goes to `sel` when given.
// the shown result (and any search under way) belongs to the schedule and the edits it was asked about
const invalidate = () => {
  V.result = null;
  V.i = 0;
  V.edits++;
  // a search under way answers an older question: stop it, so a new search can start at once
  V.worker?.terminate();
  V.cancel?.();
  V.running = false; // drawn right after (touch), before the cancelled search hears it
};
function touch(next, sel) {
  invalidate();
  commit(next);
  renderEdit();
  if (sel) document.querySelector(sel)?.focus({ preventScroll: true });
}

// Leaving step 2 (for step 1 or the build page) stops a search under way: its answer is for a page no longer shown.
export function stopSearch() {
  if (V.running) invalidate();
}

export function renderEdit() {
  if (!editorMod) preloadEditor();
  wire();
  if (!onChanges()) stopSearch();
  // proposals worked out on a record or a data file that is not the current one are dropped, and a new search is asked for
  const dropped = staleResult();
  if (dropped) (V.result = null), (V.i = 0);
  reconcileSplitSwaps();
  const st = edit(), same = sameNow(st);
  if (onChanges() && (!st.baseline.length || !same)) history.replaceState(null, '', '#edit');
  // A: the tabs of the top bar are the mode switch, there is no label to open the menu
  const label = designOn() ? '' : `<button type="button" class="mode-label" data-act="menu" data-k="editMode">עורכים מערכת קיימת · החלפה</button>`;
  const step = onChanges() ? 2 : 1;
  if (step !== 2) V.s.open = false; // the search belongs to the changes screen
  const dk = [st.dataset?.year, st.dataset?.program, st.dataset?.startYear, st.dataset?.sem].join();
  if (V.s.dk !== dk) {
    // another dataset (the schedule was loaded again for another program or semester): the search starts over, the loaded files stay in the cache
    Object.assign(V.s, { open: false, program: 'mine', sem: '', foreign: null, loading: false, failedSems: new Set(), dk });
    V.s.fetch++;
  }
  if (step !== V.step) V.fx = 'step';
  V.step = step;
  const fx = V.fx === 'step' ? ' fx' : '';
  const one = () =>
    stepOneHtml(st, dataOf(st.draft?.sem ?? 'א'), st.draft?.rows ?? [], {
      same: same || fresh, saving: saving(), lessons: designOn() ? loadedNow(st)?.lessons : null
    });
  // A, nothing loaded yet: the centred card alone (no stage, no week, no footer bar)
  const field = document.activeElement?.id === 'csText' ? document.activeElement : null; // the search field's caret survives the redraw
  const keep = field ? [field.selectionStart, field.selectionEnd] : null;
  const how = document.querySelector('#edit .edit-how'); // read now: its toggle event may still be queued when this replaces it
  if (how) V.how = how.open;
  const empty = designOn() && step === 1 && !(st.draft?.rows?.length || st.baseline.length) && (same || fresh);
  if (empty) ui.editSheet = true; // the card is not a sheet: what is loaded next opens its tool
  const parts = designOn() && !empty ? (step === 2 ? stepTwoA(st) : { tool: one(), board: boardOne(st) }) : null;
  const covered = !matchMedia('(min-width: 1080px)').matches && ui.editSheet !== false; // a phone's sheet is over the week: nothing under it is reachable
  const body = parts || empty ? '' : step === 2 ? stepTwo(st) : one();
  V.fx = null;
  const gx = document.querySelector('#edit .goals')?.scrollLeft; // a phone's goal row scrolls sideways: a redraw keeps its place
  // A: the stage holds the tool (a column, on a phone a sheet) and the board; the step animation runs on the tool's inner part,
  // never on an ancestor of the sheet
  $('edit').innerHTML = parts
    ? `<div class="edit-stage" data-tool="${step === 2 ? 'changes' : 'mine'}" data-sheet="${ui.editSheet === false ? 'closed' : 'open'}">
      <div class="edit-tool" role="region" aria-labelledby="editTitle" data-expanded="${!!ui.sheetExpanded.edit}">
        <div class="a-sheet-head">${sheetExpandHtml('edit', ui.sheetExpanded.edit)}
          <button type="button" class="btn icon-btn ghost edit-sheet-x" data-act="editSheet" data-k="editSheet" aria-label="סגירת הכלי">${icon('x')}</button></div>
        <div class="edit-tool-in${fx}">${parts.tool}</div></div>
      <div class="edit-board${parts.board.includes('id="editWeek"') ? ' has-week' : ''}"${covered ? ' inert' : ''}>${parts.board}</div></div>`
    : empty
      ? `<div class="edit-step${fx}">${emptyCardHtml(V.how)}</div>`
      : `${label}<div class="edit-step${fx}">${body}</div>`;
  if (gx) document.querySelector('#edit .goals')?.scrollTo({ left: gx });
  if (keep && $('csText')) {
    $('csText').focus({ preventScroll: true });
    $('csText').setSelectionRange(keep[0], keep[1]);
  }
  if (dropped && step === 2) say(STALE);
  if ($('editIdentity') && (!app.state.profile.year || needsProgram())) $('editIdentity').innerHTML = identityPick(app.state.profile.year, true);
}

// A swap picked while the split option was on (a lecture with a tutorial the college does not link) cannot be searched once the option is
// off, from this page or from the build page: it is taken back, and the student is told, instead of a search that finds nothing.
function reconcileSplitSwaps() {
  const st = edit(), data = dataOf(st.dataset?.sem);
  if (app.state.constraints.split || !data || !Object.keys(st.swaps).length) return;
  const gone = splitOnlySwaps(st.swaps, data);
  if (!gone.length) return;
  invalidate();
  commit({ ...st, swaps: Object.fromEntries(Object.entries(st.swaps).filter(([c]) => !gone.includes(c))) });
  toast(`ההחלפה של ${gone.map((c) => nameIn(st, data, c)).join(', ')} בוטלה: היא דרשה הפרדת הרצאה ותרגול, וההפרדה כבויה.`);
}

// ---------- step 2 ----------
// The week of the edit page: the lessons of a proposal (`pr`), of the baseline as it is (`zero`), or of the pending edits. Classic draws it inside the
// step; design A draws it on the board beside the tool (and, read only, in step 1). Returns the week, the day buttons and the blocked-lines note.
// What really moved in the courses touched: the groups that are new to them (outlined "מקום חדש"), and the lessons before whose group
// (a fixed lesson: whose hours) is gone (drawn "היה כאן"). A course whose tutorial changed keeps its lecture unmarked. Pure.
export function movedParts(baseline, lessons, courses) {
  const of = new Set(courses), slot = (l) => `${l.course}|${l.day}|${l.start}|${l.end}`;
  const was = new Set(baseline.filter((l) => of.has(l.course) && l.group).map((l) => l.group));
  const now = lessons.filter((l) => of.has(l.course)), nowIds = new Set(now.map((l) => l.group).filter(Boolean)), nowSlots = new Set(now.map(slot));
  return {
    groups: new Set(now.filter((l) => l.group && !was.has(l.group)).map((l) => l.group)),
    ghosts: baseline.filter((l) => of.has(l.course) && (l.group ? !nowIds.has(l.group) : !nowSlots.has(slot(l))))
  };
}

// The week the board draws, as values (the share image is made from the same ones): the lessons, the old places ("היה כאן", with their
// course), the new groups, the hour range; pending = no proposal and the board draws edits not saved yet.
function weekParts(st, data, pr, zero) {
  const lessons = pr ? pr.lessons : zero ? st.baseline : effectiveLessons(st, data);
  const dd = displayData(lessons, data), swapped = Object.keys(st.swaps).filter((c) => st.swaps[c].length && !st.removed.includes(c));
  // the courses a proposal (or a pending hand change) touches; of them, only what really moved is marked
  const touched = pr ? [...pr.changed, ...pr.added] : zero ? [] : swapped;
  const moved = movedParts(st.baseline, lessons, touched);
  const at = ({ course, day, start, end }) => ({ course, day, start, end });
  const ghosts = moved.ghosts.map(at); // drawn as "היה כאן"
  // a course the proposal (or a pending edit) takes out: its days are marked too, so they stay in the week's range
  const out = (pr ? pr.removed : zero ? [] : st.removed), gone = st.baseline.filter((l) => out.includes(l.course)).map(at);
  const byId = groupIndex(dd.data), meetings = [...dd.groups.flatMap((g) => byId.get(g)?.g.meetings ?? []), ...ghosts, ...gone];
  const range = hourRange(meetings);
  assignColors(editColors, [...new Set(dd.groups.map((g) => byId.get(g)?.cid))]);
  const changed = moved.groups;
  const pending = !pr && !zero && (swapped.length > 0 || st.added.length > 0 || st.removed.length > 0);
  return { lessons, dd, byId, ghosts, gone, meetings, range, changed, pending };
}

function weekOf(st, data, pr, zero, statuses) {
  const parts = weekParts(st, data, pr, zero), { dd, byId, ghosts, gone, meetings, range, changed } = parts;
  V.day = Math.min(V.day ?? Math.min(...meetings.map((m) => m.day).filter((d) => d >= 1), 6), range.days);
  const marked = changedDays(byId, changed, [...ghosts, ...gone]);
  const week = renderWeek({
    data: dd.data, res: { groups: dd.groups }, range, colors: editColors, dashed: new Set(), pins: [], friends: [], day: V.day, ghosts, changed,
    lanes: designOn(),
    movable: new Set(st.movable.flatMap((c) => [c, FIXED + c])) // a fixed lesson is drawn as a group of "fixed:<course>"
  });
  const days = Array.from({ length: range.days }, (_, i) => i + 1)
    .map((d) => `<button type="button" data-ed="day" data-day="${d}" aria-pressed="${d === V.day}">${DAYS[d]}׳${
      marked.has(d) ? '<span class="chg" aria-hidden="true"></span><span class="sr"> (יש שינוי)</span>' : ''}</button>`).join('');
  const warn = blockedLines(st, data, statuses).map((t) => `<p class="warn-text">${icon('alert')} <span>${esc(t)}</span></p>`).join('');
  return { week, days, warn, parts };
}

// what step 2 and its week both need: the data, the proposals, the one shown, the record's statuses
function stepTwoBase(st) {
  const data = dataOf(st.dataset.sem), props = V.result?.proposals ?? [];
  V.i = Math.min(V.i, props.length);
  const pr = V.i > 0 ? props[V.i - 1] : null, zero = !pr && props.length > 0; // 0: the baseline as it is, no pending edits drawn
  return { data, props, pr, zero, statuses: classify(data, app.state).statuses };
}

function stepTwo(st) {
  const { data, props, pr, zero, statuses } = stepTwoBase(st);
  const { week, days, warn } = weekOf(st, data, pr, zero, statuses);
  // a phone (one day at a time) shows the week right under the proposal switcher and the proposal's details under the week;
  // the order is chosen when drawn, so reading and Tab order follow what is seen
  const [top, panel] = resultsHtml(st, data, pr, props.length), below = props.length > 0 && !!globalThis.matchMedia?.('(max-width:759px)').matches;
  return `<div class="me-head"><h2 id="editTitle" tabindex="-1">שינויים</h2>
    <p class="me-step">${designOn() ? '' : '<b>צעד 2 מתוך 2.</b> '}לחצו על שיעור כדי לסמן שיכול לזוז, ובחרו מה חשוב לכם.</p></div>
    ${goalsHtml(st, addableCourses(data, statuses, st))}${changesHtml(st, data)}${splitOptionHtml(!!app.state.constraints.split)}
    <div id="editResults">${top}${below ? '' : panel}</div>
    <h3 id="editWeekTitle" class="sr" tabindex="-1">השבוע שלי</h3>
    <div class="daysel" id="editDays" role="group" aria-label="בחירת יום">${days}</div>
    <div id="editWeek" class="edit-week${V.fx ? ' fx' : ''}">${week}</div>${warn ? `<div class="edit-warn">${warn}</div>` : ''}${below ? panel : ''}
    <p class="err-text" id="edMsg" role="alert"></p>
    <div class="me-foot"><a class="btn" href="#edit">${designOn() ? 'חזרה למערכת שלי' : 'חזרה לצעד 1'}</a>
      <button type="button" class="btn${pr ? '' : ' primary'}" data-ed="search"${V.running ? ' aria-disabled="true"' : ''}>${V.running ? 'מחפש…' : 'חפש הצעות'}</button></div>`;
}

// Design A, step 2: the controls and the answer are the tool, the week is the board. The proposals stay with the controls (no "week first" order).
function stepTwoA(st) {
  const { data, props, pr, zero, statuses } = stepTwoBase(st);
  const { week, days, warn, parts } = weekOf(st, data, pr, zero, statuses);
  prepareShare(linkGroups(parts));
  const share = !pr && parts.dd.groups.length ? shareButtonHtml('week') : '';
  const [top, panel] = resultsHtml(st, data, pr, props.length);
  const tool = V.s.open ? searchToolHtml(st) : `<div class="me-head"><h2 id="editTitle" tabindex="-1">שינויים</h2>
    <p class="me-step">לחצו על שיעור כדי לסמן שיכול לזוז.</p></div>
    ${goalsHtml(st, addableCourses(data, statuses, st), true)}${changesHtml(st, data)}${splitOptionHtml(!!app.state.constraints.split)}
    <div class="edit-search"><button type="button" class="btn${pr ? '' : ' primary'}" data-ed="search"${V.running ? ' aria-disabled="true"' : ''}>${
      V.running ? 'מחפש…' : V.result ? 'חפש שוב' : 'חפש הצעות'
    }</button>${share}</div>
    <div id="editResults">${top}${panel}</div>
    <p class="err-text" id="edMsg" role="alert"></p>`;
  const board = `<h3 id="editWeekTitle" class="sr" tabindex="-1">השבוע שלי</h3>
    <div class="daysel" id="editDays" role="group" aria-label="בחירת יום">${days}</div>
    <div id="editWeek" class="edit-week${V.fx ? ' fx' : ''}">${week}</div>${warn ? `<div class="edit-warn">${warn}</div>` : ''}`;
  return { tool, board };
}

// Design A, step 1: the loaded schedule as a week on the board, to look at (its lessons are marked in step 2); before there is one, a line saying so.
// What is loaded now: the saved schedule (with its pending changes), or, before "לשינויים" saves it, the lessons the rows just read stand for.
function loadedNow(st) {
  const data = dataOf(st.dataset?.sem);
  if (data && st.baseline.length && sameNow(st)) return { data, st, zero: false, lessons: st.baseline };
  const d = st.draft, from = d?.rows?.length ? dataOf(d.sem) : null;
  const lessons = from ? lessonsFromRows(d.rows, d.choices, from) : [];
  return lessons.length ? { data: from, st: { ...st, baseline: lessons, original: lessons, removed: [], added: [], swaps: {} }, zero: true, lessons } : null;
}
// A row's choice in the review list changes the lessons read: the week and the heading line follow at once (the rest of the page, and the focus on the
// radio, stay as they are)
function refreshOneA() {
  if (!designOn() || V.step !== 1) return;
  const st = edit(), now = loadedNow(st), board = document.querySelector('#edit .edit-board'), line = document.querySelector('#edit .me-step');
  if (line) line.textContent = loadedLineA(now?.lessons ?? st.baseline) || 'טוענים את המערכת שיש לכם.';
  if (!board) return;
  board.innerHTML = boardOne(st);
  board.classList.toggle('has-week', board.innerHTML.includes('id="editWeek"'));
}
function boardOne(st) {
  const now = loadedNow(st);
  if (!now) return '<p class="hint edit-empty">המערכת שתטענו תופיע כאן, שבוע אחד על הלוח.</p>';
  const { week, days } = weekOf(now.st, now.data, null, now.zero, classify(now.data, app.state).statuses);
  return `<h3 id="editWeekTitle" class="sr" tabindex="-1">השבוע שלי</h3>
    <div class="daysel" id="editDays" role="group" aria-label="בחירת יום">${days}</div>
    <div id="editWeek" class="edit-week" inert>${week}</div>`;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// "מקומות פנויים נבדקו לפני X": when the seat counts of the destination courses were read (the oldest of them).
function seatsNote(p, data) {
  const at = [...p.changed, ...p.added].map((c) => seatsAt(c, data)).filter(Boolean).map((t) => new Date(t).getTime()).filter(Number.isFinite);
  return at.length ? `<p class="hint">מקומות פנויים נבדקו ${esc(ago(Date.now() - Math.min(...at)))}</p>` : '';
}
// A changed course that left the shown day for another: "הראה את היום החדש" goes there.
// The day a proposal moved a meeting to, when that is not the shown day (null: none). A meeting moved to another day is one
// with no removed meeting of its type on its new day: a time change within the day is no move, a lecture and tutorial that
// trade days both are.
export function movedDay(baseline, p, shown) {
  const key = (l) => [l.day, l.start, l.end, l.type].join('|');
  for (const c of p.changed) {
    const was = baseline.filter((l) => l.course === c), now = p.lessons.filter((l) => l.course === c);
    const old = new Set(was.map(key)), fresh = new Set(now.map(key)), gone = was.filter((l) => !fresh.has(key(l)));
    const to = now.find((l) => !old.has(key(l)) && l.day !== shown && !gone.some((g) => g.day === l.day && g.type === l.type));
    if (gone.length && to) return to.day;
  }
  return null;
}
function newDayButton(st, p) {
  const day = movedDay(st.baseline, p, V.day);
  return day ? `<button type="button" class="btn" data-ed="newDay" data-day="${day}">הראה את היום החדש</button>` : '';
}

// The way back to the original, then the proposals (or what the search found instead): [switcher, panel], each '' when none.
function resultsHtml(st, data, pr, n) {
  const pending = st.movable.length || st.added.length || st.removed.length || Object.values(st.swaps).some((x) => x.length);
  const reset = designOn() ? 'לבטל את כל השינויים' : 'חזרה למערכת המקורית'; // A: it does not read like "חזרה למערכת שלי"
  const resetNeeded = !(same(st.baseline, st.original) && !pending);
  const back = resetNeeded ? `<p><button type="button" class="btn" data-ed="restoreOriginal">${reset}</button></p>` : '';
  const r = V.result;
  if (!r) return ['', back];
  const notes = searchNotesHtml(r, st, data);
  // focused when a search found nothing: its text is its description, so a screen reader says what was found, not only that it is a group
  if (!n) {
    return ['', `<div class="prop-panel" id="editNotes" role="group" aria-label="תוצאת החיפוש" aria-describedby="editNotesText" tabindex="-1">
      <div id="editNotesText">${notes}</div>${back}</div>`];
  }
  const zero = { lessons: st.baseline, score: 0, changed: [], added: [], removed: [] };
  const A = designOn();
  // A: the primary "שמור הצעה", "העתק שינויים", and "עוד" holding the rest (the new day, cancelling every change); the way back is the tab
  const moreItems = [A && pr ? newDayButton(st, pr) : '', A && resetNeeded ? `<button type="button" class="btn" data-ed="restoreOriginal">${reset}</button>` : ''].filter(Boolean);
  const more = moreItems.length
    ? `<div class="edit-more"><button type="button" class="btn" data-ed="more" data-k="editMore" aria-expanded="${V.more}" aria-controls="editMoreList">עוד</button>
      <div class="edit-more-list" id="editMoreList" role="group" aria-label="עוד פעולות"${V.more ? '' : ' hidden'}>${moreItems.join('')}</div></div>`
    : '';
  const actions = pr
    ? A
      ? `<div class="prop-actions"><button type="button" class="btn primary" data-ed="saveProposal">שמור הצעה</button>${shareButtonHtml('prop')}
        <button type="button" class="btn" data-ed="copyChanges">העתק שינויים</button>${more}</div>${st.registered ? seatsNote(pr, data) : ''}`
      : `<div class="prop-actions">${newDayButton(st, pr)}<button type="button" class="btn primary" data-ed="saveProposal">שמור הצעה</button>
      <button type="button" class="btn" data-ed="copyChanges">העתק שינויים</button></div>${st.registered ? seatsNote(pr, data) : ''}`
    : '';
  // under A the reset lives in "עוד" while a proposal is shown; before one (or with none found) it stays a button of its own
  const resetHere = A && pr ? '' : back;
  return [navHtml(V.i, n), `<div class="prop-panel${V.fx === 'prop' ? ' fx' : ''}">${proposalHtml(st, pr ?? zero, data, { zero: !pr })}${actions}${notes}${resetHere}</div>`];
}

// The worker that searches. A newer run (or leaving) drops the older answer.
function runWorker(msg) {
  V.worker?.terminate();
  V.cancel?.(); // the older question is dropped: its caller hears 'cancelled' and leaves the state to the newer one
  const seq = ++V.seq, w = (V.worker = new Worker(new URL('./edit-worker.js', import.meta.url), { type: 'module' }));
  return new Promise((ok, no) => {
    V.cancel = () => no(new Error('cancelled'));
    w.onmessage = (e) => (w.terminate(), seq === V.seq && ok(e.data));
    w.onerror = (e) => (w.terminate(), seq === V.seq && no(new Error(e.message || 'worker')));
    w.postMessage(msg);
  });
}
const payload = (st, data) => ({ edit: { ...st, draft: null }, data, record: app.state });
// the goals that are on, in the chips' words
export const goalText = (g) => [g.dayOff && `לפנות יום ${DAYS[g.dayOff]}׳`, g.fewerGaps && 'פחות חלונות', g.notAfter && `לסיים עד ${g.notAfter}`].filter(Boolean).join(', ');

async function search() {
  if (V.running) return;
  const st = edit(), data = dataOf(st.dataset.sem), lessons = effectiveLessons(st, data);
  if (!lessons.length && !st.added.length) return say(`אין קורסים במערכת. חזרו ${designOn() ? 'למערכת שלי' : 'לשלב 1'}.`);
  const blocked = overlapMessage(st, lessons, data);
  if (blocked) return say(blocked);
  const g = st.goal, goal = !!(g.dayOff || g.notAfter || g.fewerGaps), swaps = Object.values(st.swaps).some((s) => s.length);
  const changed = st.movable.length || st.added.length || st.removed.length || swaps;
  if (!goal && !changed) return say('סמנו קורס שיכול לזוז או בחרו מטרה.');
  say('');
  const stamp = V.edits, at = resultStamp(); // before the question goes out: a change while it runs must show
  V.running = true;
  V.result = null;
  renderEdit();
  searchButton()?.focus({ preventScroll: true }); // drawn again in place as "מחפש…": it keeps the focus it had
  // the answer stays here until the whole question is done (a second search may follow): the page, drawn meanwhile, never sees half of it
  let found;
  try {
    found = await runWorker({ kind: st.movable.length || !goal ? 'search' : 'tries', ...payload(st, data) });
  } catch (e) {
    if (e.message === 'cancelled') return void (V.running = false);
    found = { proposals: [], enabling: [], timedOut: true, diagnosis: [] };
  }
  // A: nothing found with a group fixed under a goal. With nothing marked to move the first question tried no course at all, so it is asked again as a search;
  // and when that finds nothing either, is it the group or the goal? The same search without the goal says (searchNotesHtml words it)
  if (designOn() && goal && !found.proposals.length && !found.timedOut && st.added.some((c) => st.swaps[c]?.length)) {
    try {
      const withGoal = await runWorker({ kind: 'search', ...payload(st, data) });
      if (withGoal.proposals.length) found = withGoal;
      else if (!withGoal.timedOut) {
        const free = await runWorker({ kind: 'search', ...payload({ ...st, goal: {} }, data) });
        if (free.proposals.length) found = { ...found, goalBlocks: goalText(g) };
      }
    } catch (e) {
      if (e.message === 'cancelled') return void (V.running = false);
    }
  }
  V.result = found;
  V.running = false;
  V.stamp = at;
  if (stamp !== V.edits) V.result = null; // something changed while it ran: the answer is for an older question
  V.i = V.result?.proposals.length ? 1 : 0;
  V.fx = 'prop';
  const had = !!V.result;
  await dialogClosed();
  if (had && !V.result) return; // dropped while the dialog was open (the record changed): the page was drawn then, saying to search again
  if (onChanges()) {
    const active = document.activeElement, place = placeOf(active); // before the page is drawn again
    renderEdit();
    // focus that rests outside the page (the footer, the top bar) was not touched by the redraw: it stays, and the page is not scrolled
    // away from it. The answer is brought into view only when focus goes to it, and the focused part of it too (an answer taller than
    // the window shows its end by "nearest": the switcher at its top would stay above).
    const away = active && active !== document.body && active.isConnected && !$('edit').contains(active);
    const answer = away ? null : focusAnswer(place);
    if (answer) {
      $('editResults')?.scrollIntoView?.({ block: 'nearest' });
      answer.scrollIntoView?.({ block: 'nearest' });
    }
  }
}
// looked up in the edit page only: the build page stays in the document, hidden, with controls that look the same
const inEdit = (selector) => $('edit').querySelector(selector);
const searchButton = () => inEdit('[data-ed="search"]');
// An answer that comes while a modal dialog is open (the split warning, a question about a parallel course) waits until it is closed:
// drawing the page now would replace the control the dialog gives focus back to. A tick after "close", so the dialog's own handling
// (focus back, the answer to its question) is done first.
// One question can follow another (removing a course asks about each course that needs it in parallel): it waits for the last.
const dialogClosed = async () => {
  for (let d = document.querySelector('dialog:modal'); d; d = document.querySelector('dialog:modal'))
    await new Promise((done) => d.addEventListener('close', () => setTimeout(done, 0), { once: true }));
};
// A selector that finds a control of the page again after it is drawn again (null: it is not in the page, it is the search button
// itself, or nothing on it tells it apart).
const REFIND = ['data-ed', 'data-ed-goal', 'data-ed-pick', 'data-day', 'data-course', 'data-k', 'data-act', 'href'];
function placeOf(el) {
  if (!el || !$('edit').contains(el) || el.dataset?.ed === 'search') return null;
  if (el.id) return `#${CSS.escape(el.id)}`;
  const at = REFIND.filter((a) => el.hasAttribute(a)).map((a) => `[${a}="${CSS.escape(el.getAttribute(a))}"]`).join('');
  return at ? el.localName + at : null;
}
// The page is drawn again when the answer comes, which drops whatever had focus. A keyboard user who moved on while the search ran keeps
// their place (`place`); the one who waited on the button goes to the proposals' switcher, or to the message when nothing was found
// (they start reading there). Never <body>. Not while a dialog or the lesson menu is open. Returns the answer's element when focus went
// to it (the switcher or the message), else null: the control kept, or the button or the title, which the stale-result message is for.
function focusAnswer(place) {
  if (document.querySelector('dialog:modal') || $('pop').matches(':popover-open')) return null;
  // a control kept across the redraw that is hidden now (the reset inside a closed "עוד") cannot hold focus
  const found = place && inEdit(place), kept = found?.checkVisibility?.() === false ? null : found;
  const answer = V.result?.proposals.length ? inEdit('.prop-nav') : $('editNotes');
  (kept || answer || searchButton() || $('editTitle'))?.focus({ preventScroll: true });
  // the redraw can move the control kept (on a phone the proposals take the way back below the week): "nearest" does nothing when it is on screen
  kept?.scrollIntoView?.({ block: 'nearest' });
  return kept ? null : answer;
}

// ---------- the lesson menu (a block opens it in #pop) ----------
export function openLessonMenu(btn) {
  const st = edit(), data = dataOf(st.dataset.sem), dd = displayData(effectiveLessons(st, data), data), gid = btn.dataset.gid, pop = $('pop');
  pop.className = `pop c${editColors.get(groupIndex(dd.data).get(gid)?.cid) ?? 7}`;
  pop.innerHTML = lessonMenuHtml(st, dd.data, gid);
  pop.setAttribute('aria-labelledby', 'popTitle');
  pop.dataset.src = btn.dataset.k;
  pop.dataset.gid = gid;
  placePop(pop, btn);
  pop.querySelector('[data-ed]').focus({ preventScroll: true });
}
// The menu closed and the block it came from is gone: focus goes to the heading, not to <body>.
const refocus = () => {
  const a = document.activeElement;
  if (!a || a === document.body) $('editTitle')?.focus({ preventScroll: true });
};

// The groups `course` has in each proposal, as options for the swap menu: the groups it has now (`now`, sorted and joined) and repeats are
// left out. split: this option puts a lecture with a tutorial the college does not link (the build page's option, and its warning).
export function swapOptions(proposals, course, now) {
  const seen = new Set([now]), key = (ids) => ids.slice().sort().join();
  return proposals
    .map((p) => ({ ids: [...new Set(p.lessons.filter((l) => l.course === course && l.group).map((l) => l.group))], split: !!p.split?.includes(course) }))
    .filter(({ ids }) => ids.length && !seen.has(key(ids)) && seen.add(key(ids)));
}
export function swapListHtml(options, course, data) {
  const line = ({ ids, split }) => ids.map((id) => groupLine(id, data)).join(' + ') + (split ? ` <span class="tag warn">${esc(SPLIT_TAG)}</span>` : '');
  return options.length
    ? `<ul class="pop-alts">${options.map((o) => `<li>${swapButton(course, o.ids, line(o))}</li>`).join('')}</ul>`
    : '<p class="hint">אין קבוצות אחרות שמתאימות לשאר המערכת.</p>';
}

// "קבוצות אחרות": the same search as the proposals with only this course movable; each proposal's groups for it are one option.
async function others(course) {
  const st = edit(), data = dataOf(st.dataset.sem), out = $('popOthers');
  out.textContent = 'מחפש…';
  const swaps = { ...st.swaps };
  delete swaps[course];
  let r;
  try {
    r = await runWorker({ kind: 'search', ...payload({ ...st, movable: [course], swaps }, data) });
  } catch (e) {
    if (e.message === 'cancelled') return;
    r = { proposals: [] };
  }
  if (!out.isConnected) return;
  const now = [...new Set(effectiveLessons(st, data).filter((l) => l.course === course).map((l) => l.group))].sort().join();
  out.innerHTML = swapListHtml(swapOptions(r.proposals, course, now), course, data);
  (out.querySelector('button') ?? out).focus?.({ preventScroll: true });
}

async function drop(course) {
  const st = edit(), data = dataOf(st.dataset.sem), ids = [course];
  $('pop').hidePopover?.();
  // a course removed with it may be needed in parallel by another one: ask about those too
  for (let k = 0; k < ids.length; k++)
    for (const p of parallelPrompts({ ...st, removed: [...st.removed, ...ids] }, data, ids[k], app.state)) {
      if (!await askConfirm(p.text, { ok: 'כן, להסיר', cancel: 'לא, להשאיר' })) return;
      ids.push(p.id);
    }
  const added = st.added.filter((c) => !ids.includes(c)), swaps = Object.fromEntries(Object.entries(st.swaps).filter(([c]) => !ids.includes(c)));
  touch({
    ...st, added, swaps, movable: st.movable.filter((c) => !ids.includes(c)),
    removed: [...st.removed, ...ids.filter((c) => !st.added.includes(c) && !st.removed.includes(c))]
  }, '#editWeekTitle');
}

// The groups the editor starts with: every row's current choice.
const groupsOfDraft = (d) =>
  (d?.rows ?? []).flatMap((r, i) => {
    const v = i in d.choices ? d.choices[i] : r.chosen;
    return v ? [v] : [];
  });

// rows confirmed as "no group" go back to the loader without a group, so reopening it keeps them
const fixedRows = (d) => (d?.rows ?? []).map((r, i) => (i in d.choices && !d.choices[i] ? { ...r, chosen: null } : r));

// The loader lists the track's courses and the dataset is the track's: track and year come first.
// `at`: where the reason is said, beside the control that was pressed (on a phone the "הבא" row is far below the load buttons).
const noIdentity = (at = 'edMsg') => {
  if (app.state.profile.year && !needsProgram()) return false;
  const track = needsProgram();
  say(track ? 'בחרו קודם מסלול ושנת לימודים.' : 'בחרו קודם שנת לימודים.', at);
  $('editIdentity')?.querySelector(track ? 'select' : 'input')?.focus();
  return true;
};

// A browser lets a file chooser open only inside the tap that asked (Safari not after an awaited import). The editor's module is already loaded (ui-actions.js
// imports it), but a dynamic import still resolves a turn later, so renderEdit takes hold of it ahead and a tap opens the editor in its own turn. A tap that
// comes before that waits for the import and opens the dialog on the file field: the file-first view, with no chooser.
let editorMod = null;
const preloadEditor = () => import('./ui-friend-editor.js').then((m) => (editorMod = m), () => {});

function openLoader(file) {
  if (noIdentity('edWaysMsg')) return;
  if (editorMod) return openEditor(editorMod, file, file);
  return import('./ui-friend-editor.js').then((m) => openEditor((editorMod = m), file, false)); // too late for a chooser: the file-first view only
}
// A (phase 2, Task C): the load button asks for the file chooser itself, from a field that lives outside the page the redraws replace, inside the tap; the
// editor opens once a file is chosen, with the file handed over and read at once (a scanned PDF still asks which pages, an unreadable file says so at the
// editor's file control). The track and year are checked first, as before; cancelling the chooser changes nothing.
const FILE_TYPES = 'application/pdf,image/*,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
let filePick = null;
function pickFileA() {
  if (noIdentity('edWaysMsg')) return;
  if (!filePick) {
    filePick = Object.assign(document.createElement('input'), { type: 'file', accept: FILE_TYPES, id: 'edFilePick', className: 'sr', tabIndex: -1 });
    filePick.setAttribute('aria-hidden', 'true');
    filePick.addEventListener('change', () => {
      const file = filePick.files[0];
      filePick.value = ''; // the same file chosen again is a change again
      if (!file) return;
      const go = (m) => openEditor((editorMod = m), true, false, file);
      if (editorMod) go(editorMod);
      else import('./ui-friend-editor.js').then(go);
    });
    document.body.append(filePick);
  }
  filePick.value = '';
  filePick.click();
}
function openEditor({ openFriendEditor }, file, pick, handed = null) {
  const d = edit().draft;
  openFriendEditor({
    // a semester whose data did not load this time (summer) is not offered back
    mode: 'edit', groups: groupsOfDraft(d), rows: fixedRows(d), sem: dataOf(d?.sem) ? d.sem : null, returnFocusId: 'editTitle',
    focusFile: file, pickFile: pick, file: handed,
    onSave({ rows, sem }) {
      // a choice made earlier stays with its row when the rows are read again
      const key = (r) => [r.code, r.type, r.text, JSON.stringify(r.meets)].join('|');
      const was = new Map((d?.rows ?? []).flatMap((r, i) => (d && i in d.choices ? [[key(r), d.choices[i]]] : [])));
      const choices = {};
      rows.forEach((r, i) => key(r) && was.has(key(r)) && (choices[i] = was.get(key(r))));
      fresh = true;
      invalidate();
      commit({ ...edit(), draft: { rows, choices, registered: d?.registered ?? edit().registered, sem } });
      renderEdit();
      return null;
    }
  });
}

function next() {
  if (noIdentity()) return;
  const st = edit(), d = st.draft;
  if (!d?.rows.length) {
    if (st.baseline.length && sameNow(st)) location.hash = '#edit/changes';
    else say('טענו מערכת: קובץ מהמתכנן, או בחירה ידנית.');
    return;
  }
  const todo = pendingRows(d.rows, d.choices);
  if (todo.length) {
    say(todo.length === 1 ? 'עוד שורה אחת לבדיקה. בחרו בה קבוצה.' : `עוד ${todo.length} שורות לבדיקה. בחרו בהן קבוצה.`);
    document.querySelector(`[data-ed-row="${todo[0]}"] input`)?.focus();
    return;
  }
  const data = dataOf(d.sem), lessons = data ? lessonsFromRows(d.rows, d.choices, data) : [];
  if (!lessons.length || lostRow(d.rows, d.choices, data) >= 0) return say('לא נמצאו כל השיעורים במערכת. טענו אותה שוב.');
  // the same schedule as the one already loaded: keep the work done in step 2
  if (!(st.baseline.length && sameNow(st) && st.registered === d.registered && JSON.stringify(lessons) === JSON.stringify(st.original)))
    (invalidate(), commit({ ...loadSchedule(st, lessons, datasetOf(data, app.state), d.registered), draft: d }));
  location.hash = '#edit/changes';
}

// Design A, a phone: a step that sends the person to the week closes the sheet over it first (the shell updates the stage, the dock and the board)
function showBoard() {
  if (!designOn() || ui.editSheet === false || matchMedia('(min-width: 1080px)').matches) return;
  ui.editSheet = false;
  dispatchEvent(new Event('a-edit-sheet'));
}

// the dock's "changes" button (design A): what "next" does, with the same checks
export const goChanges = () => next();

const STEP_ONE = {
  loadFile: () => (designOn() ? pickFileA() : openLoader(true)),
  loadHand: () => openLoader(false),
  next,
  restore() {
    commit(restoreOriginal(edit()));
    renderEdit();
    $('editTitle').focus();
  }
};
const without = (list, c) => list.filter((x) => x !== c);
const shownProposal = () => V.result?.proposals[V.i - 1];
// previous / next proposal, 0 being the original; the shown day stays
function step(by) {
  const n = V.result?.proposals.length;
  if (!n) return;
  V.i = (V.i + by + n + 1) % (n + 1);
  V.fx = 'prop';
  renderEdit();
}
// ---------- "שלח כתמונה" (design A): the week on the screen as a PNG, with the friend link of the groups it draws ----------
export const shareButtonHtml = (where) =>
  `<button type="button" class="btn" data-ed="shareImage" data-k="share-${where}"${V.sharing ? ' aria-disabled="true"' : ''}>שלח כתמונה</button>`;
const linkGroups = (parts) => parts.dd.groups.filter((g) => !g.startsWith(FIXED)); // a fixed lesson has no group id to send
const linkBase = () => location.origin + location.pathname;
const linkKey = (groups) => JSON.stringify(friendPayload(app.state, groups)); // the name and the dataset are in it: a rename makes a new link
const SAMPLE = 'אב 09:00';
let fontsAsked = false;
// While step 2 is drawn: the link and the fonts are made ready, so a tap reaches navigator.share with no wait (an iPhone allows the share
// sheet only from the tap itself).
function prepareShare(groups) {
  if (!fontsAsked && globalThis.document?.fonts) {
    fontsAsked = true;
    for (const f of new Set(Object.values(FONTS))) document.fonts.load(f, SAMPLE).catch(() => {});
  }
  if (!groups.length) return;
  const key = linkKey(groups);
  if (V.link?.key === key || V.linkWant === key) return;
  V.linkWant = key;
  friendLink(linkBase(), app.state, groups).then(
    (url) => V.linkWant === key && (V.link = { key, url }),
    () => V.linkWant === key && (V.linkWant = null) // asked again at the tap
  );
}
// The image's input from the board's own values: the same lessons, colours, hours, old and new places.
function shareInput(st, data, parts, label, link) {
  const lessons = parts.dd.groups.flatMap((gid) => {
    const x = parts.byId.get(gid);
    if (!x) return [];
    const fixed = x.cid.startsWith(FIXED);
    return x.g.meetings.map((m) => ({
      course: fixed ? x.cid.slice(FIXED.length) : x.cid, // the course id its old places carry
      name: heb(x.c.name), type: x.g.type, group: fixed ? null : gid, day: m.day, start: m.start, end: m.end,
      color: editColors.get(x.cid) ?? 7, changed: parts.changed.has(gid)
    }));
  });
  const ghosts = parts.ghosts.map((g) => ({
    ...g, name: heb(data.courses[g.course]?.name ?? st.baseline.find((l) => l.course === g.course)?.name ?? g.course),
    color: editColors.get(g.course) ?? editColors.get(FIXED + g.course) ?? 7
  }));
  return { name: app.state.name, semester: st.dataset.sem, label, link, range: parts.range, lessons, ghosts };
}
const shareBusy = (on) =>
  document.querySelectorAll('[data-ed="shareImage"]').forEach((b) => (on ? b.setAttribute('aria-disabled', 'true') : b.removeAttribute('aria-disabled')));
function download(file) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function shareImage() {
  if (V.sharing) return; // a double tap shares once
  const st = edit(), { data, props, pr, zero } = stepTwoBase(st);
  if (!data) return;
  V.sharing = true;
  shareBusy(true);
  try {
    const parts = weekParts(st, data, pr, zero), groups = linkGroups(parts), key = groups.length ? linkKey(groups) : null;
    // made ahead by prepareShare; when not (yet), the wait may cost the iPhone's tap, and NotAllowedError below asks for another
    // a link that cannot be made (no compression in this browser): the image still goes, without it
    const url = !key ? null : V.link?.key === key ? V.link.url : await friendLink(linkBase(), app.state, groups).catch(() => null);
    if (url) V.link = { key, url };
    // a font that will not load: drawn in the fallback font rather than not at all
    if (!fontsReady()) await Promise.all([...new Set(Object.values(FONTS))].map((f) => document.fonts.load(f, SAMPLE).catch(() => {})));
    let file;
    try {
      file = shareImageFile(shareInput(st, data, parts, headerLabel({ index: pr ? V.i : 0, count: props.length, pending: parts.pending }), !!url));
    } catch {
      if (url) copy(url, 'לא הצלחנו ליצור תמונה. הקישור הועתק במקומה.');
      else toast('לא הצלחנו ליצור תמונה.');
      return;
    }
    const text = url ? `${shareText(app.state.name)} ${url}` : shareText(app.state.name); // the link in the text: some apps drop `url` next to a file
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text });
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return; // the sheet was closed
        if (e?.name === 'NotAllowedError') return toast('לחצו שוב על "שלח כתמונה" כדי לשלוח.');
      }
    }
    // no file sharing here (most desktops), or it failed: the image is made, so it is downloaded and the link copied
    download(file);
    if (url) copy(url, 'התמונה ירדה והקישור הועתק. אפשר לצרף אותם בוואטסאפ.');
    else toast('התמונה ירדה. אפשר לצרף אותה בוואטסאפ.');
  } finally {
    V.sharing = false;
    shareBusy(false);
  }
}

const ACT_ED = {
  openSearch() {
    V.s.open = true;
    renderEdit();
    $('csText')?.focus({ preventScroll: true });
  },
  closeSearch() {
    V.s.open = false;
    renderEdit();
    document.querySelector('[data-ed="openSearch"]')?.focus({ preventScroll: true });
  },
  csAdd: addCourseFixed,
  csSwap(b) {
    const st = edit();
    V.s.open = false;
    touch({ ...st, swaps: { ...st.swaps, [b.dataset.course]: b.dataset.ids.split(',') } }, '[data-ed="openSearch"]');
  },
  more() {
    V.more = !V.more;
    renderEdit();
    document.querySelector('[data-ed="more"]')?.focus({ preventScroll: true });
  },
  propPrev: () => (step(-1), document.querySelector('[data-ed="propPrev"]')?.focus({ preventScroll: true })),
  propNext: () => (step(1), document.querySelector('[data-ed="propNext"]')?.focus({ preventScroll: true })),
  newDay(b) {
    V.day = Number(b.dataset.day);
    V.fx = 'week';
    showBoard(); // A, a phone: the week is where focus goes next, so the sheet goes away
    renderEdit();
    $('editWeekTitle').focus({ preventScroll: true });
    ui.sheetReveal = null; // a picked day's scroll is the person's: closing the sheet must not undo it
    $('editDays').scrollIntoView?.({ block: 'start' }); // on a phone the button sits under the week: bring the new day into view
  },
  saveProposal() {
    const p = shownProposal(), st = edit();
    if (!p) return;
    if (staleResult()) {
      // the record or the data changed since the search: this proposal may no longer fit
      V.result = null;
      V.i = 0;
      renderEdit();
      say(STALE);
      document.querySelector('[data-ed="search"]')?.focus({ preventScroll: true });
      return;
    }
    V.result = null;
    V.i = 0;
    V.edits++;
    const ok = commit(saveProposal(st, p.lessons));
    renderEdit();
    $('editTitle').focus({ preventScroll: true });
    // never "saved" when nothing was written: the notice above says why, and the proposal stays in this page
    toast(ok ? 'ההצעה נשמרה כמערכת הנוכחית. ההרשמה נעשית במכללה.' : 'ההצעה נשמרה רק בדף הזה. היא לא נשמרה בדפדפן, ותאבד כשתסגרו את הדף.');
  },
  shareImage,
  copyChanges() {
    const p = shownProposal(), st = edit();
    if (p) copy(changeText(st.registered ? st.original : st.baseline, p.lessons, dataOf(st.dataset.sem), p.split), 'השינויים הועתקו');
  },
  restoreOriginal() {
    V.result = null;
    V.i = 0;
    V.edits++;
    commit(restoreOriginal(edit()));
    renderEdit();
    $('editTitle').focus({ preventScroll: true });
    toast('חזרנו למערכת המקורית');
  },
  letMove(b) {
    touch({ ...edit(), movable: [...edit().movable, b.dataset.course] }, '#editTitle');
    search();
  },
  ...STEP_ONE,
  search,
  day(b) {
    V.day = Number(b.dataset.day);
    V.fx = 'week';
    renderEdit();
    document.querySelector(`#editDays [data-day="${V.day}"]`)?.focus({ preventScroll: true });
  },
  fewerGaps: () => touch({ ...edit(), goal: { ...edit().goal, fewerGaps: !edit().goal.fewerGaps } }, '[data-ed="fewerGaps"]'),
  toggleMove(b) {
    const st = edit(), c = b.dataset.course, src = $('pop').dataset.src;
    $('pop').hidePopover?.();
    touch({ ...st, movable: st.movable.includes(c) ? without(st.movable, c) : [...st.movable, c] });
    // the lesson is still there: focus goes back to it (spec: "focus returns to the lesson")
    (src && document.querySelector(`#editWeek [data-k="${CSS.escape(src)}"]`) || $('editWeekTitle'))?.focus({ preventScroll: true });
  },
  others: (b) => others(b.dataset.course),
  pickSwap(b) {
    const st = edit();
    $('pop').hidePopover?.();
    touch({ ...st, swaps: { ...st.swaps, [b.dataset.course]: b.dataset.groups.split(',') } }, '#editWeekTitle');
  },
  drop: (b) => drop(b.dataset.course),
  unmove: (b) => touch({ ...edit(), movable: without(edit().movable, b.dataset.course) }, '#editTitle'),
  unadd(b) {
    const st = edit(), swaps = { ...st.swaps }; // cancelling an addition also drops the group fixed for it (the week would still draw it)
    delete swaps[b.dataset.course];
    touch({ ...st, added: without(st.added, b.dataset.course), swaps }, '#editTitle');
  },
  unremove: (b) => touch({ ...edit(), removed: without(edit().removed, b.dataset.course) }, '#editTitle'),
  unswap({ dataset: { course } }) {
    const swaps = { ...edit().swaps };
    delete swaps[course];
    touch({ ...edit(), swaps }, '#editTitle');
  }
};
let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-ed]');
    if (b && b.dataset.ed !== 'more' && V.more) {
      V.more = false; // "עוד" closes with whatever is pressed, redrawn or not (copying does not redraw)
      document.getElementById('editMoreList')?.setAttribute('hidden', '');
      document.querySelector('[data-ed="more"]')?.setAttribute('aria-expanded', 'false');
    }
    if (b && !b.disabled) ACT_ED[b.dataset.ed]?.(b, e);
  });
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'csText') return;
    V.s.text = e.target.value;
    updateResults();
  });
  document.addEventListener('change', (e) => {
    const key = e.target.dataset?.edS;
    if (key && key !== 'text') {
      if (key === 'program') chooseProgram(e.target.value);
      else {
        V.s[key] = e.target.value;
        updateResults();
      }
      return;
    }
    const t = e.target, st = edit(), d = st.draft, goal = t.dataset?.edGoal;
    if (goal === 'dayOff') touch({ ...st, goal: { ...st.goal, dayOff: Number(t.value) || null } }, '[data-ed-goal="dayOff"]');
    else if (goal === 'notAfter') touch({ ...st, goal: { ...st.goal, notAfter: t.value || null } }, '[data-ed-goal="notAfter"]');
    else if (goal === 'addCourse' && t.value) touch({ ...st, added: [...st.added, t.value] }, '[data-ed-goal="addCourse"]');
    if (goal) return;
    if (!d) {
      // an older save with a schedule and no draft: the checkbox sets the loaded schedule's registration
      if (!t.hasAttribute?.('data-ed-reg')) return;
      invalidate();
      commit({ ...st, registered: t.checked, owned: t.checked ? [...new Set(st.original.map((l) => l.group).filter(Boolean))] : [] });
      return say('');
    }
    if (t.dataset?.edPick !== undefined) d.choices[t.dataset.edPick] = t.value || null;
    else if (t.hasAttribute?.('data-ed-reg')) (d.registered = t.checked), invalidate();
    else return;
    commit(st);
    say('');
    if (t.dataset?.edPick !== undefined) refreshOneA();
  });
  // the build switcher's keys: ArrowLeft is next, ArrowRight previous (right to left); not while typing or while something is open
  document.addEventListener('keydown', (e) => {
    if (!onChanges() || V.s.open || !V.result?.proposals.length || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    if (designOn() && (ui.overlay || !document.querySelector('#edit .edit-tool')?.checkVisibility?.())) return; // the record over the page, or a closed sheet
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || $('pop').matches(':popover-open') || document.querySelector('dialog:modal')) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable], [tabindex="0"], .edit-more')) return; // keys inside "עוד" are its own
    e.preventDefault();
    step(e.key === 'ArrowLeft' ? 1 : -1);
    document.querySelector(e.key === 'ArrowLeft' ? '[data-ed="propNext"]' : '[data-ed="propPrev"]')?.focus({ preventScroll: true });
  });
  // Escape in the course search: in the field it clears the text first, then (or anywhere in the search) it closes the search and focus returns to "חיפוש קורס"
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || !V.s.open || !e.target.closest?.('.edit-tool') || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.target.id === 'csText' && V.s.text) {
        V.s.text = '';
        e.target.value = '';
        updateResults();
        return;
      }
      ACT_ED.closeSearch();
    },
    true
  );
  // Escape inside the open "עוד" closes it and returns focus to it (before anything else takes the key: the phone's sheet, the record)
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Escape' || !V.more || !e.target.closest?.('.edit-more')) return;
      e.preventDefault();
      e.stopPropagation();
      V.more = false;
      renderEdit();
      document.querySelector('[data-ed="more"]')?.focus({ preventScroll: true });
    },
    true
  );
  // the card's download instructions: open or shut, kept over a redraw
  document.addEventListener('toggle', (e) => e.target.classList?.contains('edit-how') && (V.how = e.target.open), true);
  // Escape (a light dismiss) with the block gone: focus must not fall to <body>
  $('pop').addEventListener('toggle', (e) => e.newState === 'closed' && onChanges() && setTimeout(refocus, 0));
}
