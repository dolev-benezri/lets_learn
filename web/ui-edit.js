// The edit page (#edit, #edit/changes): a separate page from the build steps. Step 1 loads my schedule and reviews what was read;
// step 2 and the proposals follow. Pure HTML helpers are exported (test/ui-edit.test.mjs); the DOM part is at the bottom.
import { app, esc } from './app.js';
import { $, needsProgram } from './ui-common.js';
import { DAYS, groupIndex, typeLabel, icon, nameHtml, hourRange, renderWeek, assignColors, placePop } from './ui-grid.js';
import { askConfirm } from './ui-dialog.js';
import { classify } from './rules.js';
import { kinds, overlaps, displayData, FIXED } from './edit-search.js';
import { reqContext, reqMet } from './rules.js';
import { groupNumber } from './ui-text.js';
import { identityPick } from './ui-me.js';
import { loadEdit, saveEdit, lessonsOf, loadSchedule, restoreOriginal, datasetOf, sameDataset } from './edit-state.js';

// ---------- step 1: rows -> lessons ----------
// A row needs the student's word unless it is sure (a row with no group needs the tap too: it stays as a fixed lesson).
export const pendingRows = (rows, choices) =>
  rows.flatMap((r, i) => (r.confidence === 'sure' || i in choices ? [] : [i]));

// The lessons the confirmed rows stand for. choices[i]: a group id, or null = "no group" (stays fixed, with the row's hours).
export function lessonsFromRows(rows, choices, data) {
  const out = [], seen = new Set();
  rows.forEach((r, i) => {
    const v = i in choices ? choices[i] : r.confidence === 'sure' ? r.chosen : undefined;
    if (v === undefined) return;
    if (v) {
      if (!seen.has(v)) out.push(...lessonsOf([v], data));
      seen.add(v);
    } else
      out.push(...r.meets.map((m) => ({
        course: r.code ?? `x${i}`, name: r.name ?? r.code ?? 'קורס', type: r.type ?? 'הרצאה', group: null, day: m.day, start: m.start, end: m.end
      })));
  });
  return out;
}

const hours = (m) => `יום ${DAYS[m.day]}׳ <bdi dir="ltr">${esc(m.start)}–${esc(m.end)}</bdi>`;
function groupLine(id, data) {
  const x = data && groupIndex(data).get(id);
  if (!x) return `<bdi dir="ltr">${esc(id)}</bdi>`;
  const { g } = x;
  return `${esc(typeLabel(g.type))} ${esc(groupNumber(g.id))} · ${g.meetings.map(hours).join(', ')} · ${esc(g.lecturer || '—')}${g.full ? ' <span class="tag bad">מלאה</span>' : ''}`;
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
// opts.same: the saved schedule belongs to the data now shown.
export function stepOneHtml(edit, data, review, { same = true } = {}) {
  const d = edit.draft, choices = d?.choices ?? {}, rows = d ? review : [];
  const head = `<div class="me-head"><h2 id="editTitle" tabindex="-1">המערכת שלי</h2>
    <p class="me-step"><b>צעד 1 מתוך 2.</b> טוענים את המערכת שיש לכם.</p></div><div id="editIdentity"></div>`;
  const ways = `<section class="me-card edit-ways" aria-label="טעינת המערכת"><div class="me-choice-btns">
    <button type="button" class="btn primary" data-ed="loadFile">קובץ מהמתכנן (PDF או צילום)</button>
    <button type="button" class="btn" data-ed="loadHand">לבחור קורסים וקבוצות ידנית</button></div></section>`;
  if (!same)
    return `${head}<div class="edit-col"><p class="msg bad" role="status"><span>המערכת נשמרה מול נתונים אחרים. טענו אותה שוב כדי לערוך.</span></p>
      <section class="me-card"><h3>המערכת שנשמרה</h3>${snapshotHtml(edit.original)}
      <button type="button" class="btn" data-ed="restore">חזרה למערכת המקורית</button></section>${ways}</div>`;
  const review_ = rows.flatMap((r, i) => (r.confidence === 'sure' ? [] : [reviewRowHtml(r, i, choices, data)]));
  const loaded = rows.length || edit.baseline.length;
  return `${head}<div class="edit-col">${ways}
    ${review_.length ? `<section class="me-card" aria-labelledby="rvH"><h3 id="rvH">לבדיקה</h3>
      <p class="hint">לא בטוחים בשורות האלה. בחרו קבוצה בכל שורה.</p>${review_.join('')}</section>` : ''}
    ${loaded ? `<section class="me-card"><label class="check"><input type="checkbox" data-ed-reg${d?.registered ?? edit.registered ? ' checked' : ''}>
      המערכת כבר רשומה במכללה</label>
      ${d?.sem ? `<p class="hint">סמסטר ${esc(d.sem)}${d.sem.length === 1 ? '׳' : ''}</p>` : ''}</section>` : ''}
    <p class="err-text" id="edMsg" role="alert"></p></div>
    <div class="me-foot"><span class="hint">כל שינוי נשמר מיד.</span><button type="button" class="btn primary" data-ed="next">הבא: שינויים</button></div>`;
}

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
const swapButton = (course, ids, text) =>
  `<button type="button" class="btn" data-ed="pickSwap" data-course="${esc(course)}" data-groups="${esc(ids.join(','))}">${text}</button>`;
// Goal chips: two are drop-downs (the phone's own picker), one a toggle, then "+ קורס".
export function goalsHtml(edit, addable) {
  const g = edit.goal;
  return `<div class="goals" role="group" aria-label="מטרה">
    ${chipSelect('dayOff', g.dayOff, "לפנות יום", "לפנות יום ▾", DAY_OPTS.map((d) => [d, `לפנות יום ${DAYS[d]}׳`]))}
    <button type="button" class="chip${g.fewerGaps ? ' on' : ''}" data-ed="fewerGaps" aria-pressed="${g.fewerGaps}">פחות חלונות</button>
    ${chipSelect('notAfter', g.notAfter, "לסיים עד", "לסיים עד ▾", END_OPTS.map((t) => [t, `לסיים עד ${t}`]))}
    ${addable.length ? chipSelect("addCourse", null, "הוספת קורס", "+ קורס", addable.map((c) => [c.id, c.name])) : ""}
  </div>`;
}

// What the next search will use: movable courses, new groups, added and removed courses, each undone with one tap.
export function changesHtml(edit, data) {
  const gone = (c) => edit.removed.includes(c);
  const chip = (act, id, text, extra = '') =>
    `<button type="button" class="chip tag-chip" data-ed="${act}" data-course="${esc(id)}"><span>${esc(text)}</span>${icon('x')}<span class="sr"> (בטל)</span></button>${extra}`;
  const rows = [
    ['יכולים לזוז', edit.movable.filter((c) => !edit.removed.includes(c)).map((c) => chip('unmove', c, nameIn(edit, data, c)))],
    ['קבוצה חדשה', Object.keys(edit.swaps).filter((c) => edit.swaps[c].length && !gone(c)).map((c) => chip('unswap', c, nameIn(edit, data, c)))],
    ['נוספים', edit.added.map((c) => chip('unadd', c, nameIn(edit, data, c)))],
    ['יורדים מהמערכת', edit.removed.filter((c) => !edit.added.includes(c)).map((c) => chip('unremove', c, nameIn(edit, data, c)))]
  ].filter(([, l]) => l.length);
  return rows.length ? `<ul class="plain changes">${rows.map(([t, l]) => `<li><span class="hint">${t}:</span> ${l.join(' ')}</li>`).join('')}</ul>` : '';
}

// ---------- the page (DOM) ----------
let E = null; // the edit state, read once
let fresh = false; // a schedule was read in this visit: its review shows even while the saved one belongs to other data
// What step 2 shows and has under way (not saved): the shown day, the search in flight, its result.
const V = { day: null, running: false, result: null, seq: 0, edits: 0, worker: null };
const editColors = new Map();
const edit = () => (E ??= loadEdit());
const commit = (next) => {
  E = next;
  saveEdit(E);
};
const dataOf = (sem) => app.sem?.[sem] ?? null;
const sameNow = (st) => !st.baseline.length || (!!dataOf(st.dataset?.sem) && sameDataset(st, dataOf(st.dataset.sem), app.state));
const say = (text) => {
  if ($('edMsg')) $('edMsg').textContent = text;
};
const onChanges = () => location.hash === '#edit/changes';

// Any change to what the search uses clears the result it gave, saves, and draws the page again; focus goes to `sel` when given.
function touch(next, sel) {
  V.result = null;
  V.edits++;
  commit(next);
  renderEdit();
  if (sel) document.querySelector(sel)?.focus({ preventScroll: true });
}

export function renderEdit() {
  wire();
  const st = edit(), same = sameNow(st);
  if (onChanges() && (!st.baseline.length || !same)) history.replaceState(null, '', '#edit');
  const label = `<button type="button" class="mode-label" data-act="menu" data-k="editMode">עורכים מערכת קיימת · החלפה</button>`;
  $('edit').innerHTML = label + (onChanges() ? stepTwo(st) : stepOneHtml(st, dataOf(st.draft?.sem ?? 'א'), st.draft?.rows ?? [], { same: same || fresh }));
  if ($('editIdentity') && (!app.state.profile.year || needsProgram())) $('editIdentity').innerHTML = identityPick(app.state.profile.year, true);
}

// ---------- step 2 ----------
function stepTwo(st) {
  const data = dataOf(st.dataset.sem), lessons = effectiveLessons(st, data);
  const statuses = classify(data, app.state).statuses;
  const dd = displayData(lessons, data), swapped = Object.keys(st.swaps).filter((c) => st.swaps[c].length && !st.removed.includes(c));
  const ghosts = st.baseline.filter((l) => swapped.includes(l.course)).map(({ day, start, end }) => ({ day, start, end }));
  const byId = groupIndex(dd.data), meetings = [...dd.groups.flatMap((g) => byId.get(g)?.g.meetings ?? []), ...ghosts];
  const range = hourRange(meetings);
  assignColors(editColors, [...new Set(dd.groups.map((g) => byId.get(g)?.cid))]);
  V.day = Math.min(V.day ?? Math.min(...meetings.map((m) => m.day).filter((d) => d >= 1), 6), range.days);
  const week = renderWeek({
    data: dd.data, res: { groups: dd.groups }, range, colors: editColors, dashed: new Set(), pins: [], friends: [], day: V.day, ghosts,
    changed: new Set(swapped.flatMap((c) => st.swaps[c])), movable: new Set(st.movable.flatMap((c) => [c, FIXED + c])) // a fixed lesson is drawn as a group of "fixed:<course>"
  });
  const days = Array.from({ length: range.days }, (_, i) => i + 1)
    .map((d) => `<button type="button" data-ed="day" data-day="${d}" aria-pressed="${d === V.day}">${DAYS[d]}׳</button>`).join('');
  const warn = blockedLines(st, data, statuses).map((t) => `<p class="warn-text">${icon('alert')} <span>${esc(t)}</span></p>`).join('');
  return `<div class="me-head"><h2 id="editTitle" tabindex="-1">שינויים</h2>
    <p class="me-step"><b>צעד 2 מתוך 2.</b> לחצו על שיעור כדי לסמן שיכול לזוז, ובחרו מה חשוב לכם.</p></div>
    ${goalsHtml(st, addableCourses(data, statuses, st))}${changesHtml(st, data)}
    <div id="editResults">${resultsHtml(st, data)}</div>
    <h3 id="editWeekTitle" class="sr" tabindex="-1">השבוע שלי</h3>
    <div class="daysel" id="editDays" role="group" aria-label="בחירת יום">${days}</div>
    <div id="editWeek" class="edit-week">${week}</div>${warn ? `<div class="edit-warn">${warn}</div>` : ''}
    <p class="err-text" id="edMsg" role="alert"></p>
    <div class="me-foot"><a class="btn" href="#edit">חזרה לצעד 1</a>
      <button type="button" class="btn primary" data-ed="search"${V.running ? ' aria-disabled="true"' : ''}>${V.running ? 'מחפש…' : 'חפש הצעות'}</button></div>`;
}

// (the proposals come in the next task)
function resultsHtml() {
  const r = V.result;
  return r ? `<p class="hint" role="status">נמצאו ${r.proposals?.length ?? 0} הצעות.</p>` : '';
}

// The worker that searches. A newer run (or leaving) drops the older answer.
function runWorker(msg) {
  V.worker?.terminate();
  V.cancel?.(); // the older question is dropped: its caller hears 'cancelled' and leaves the state to the newer one
  const seq = ++V.seq, w = (V.worker = new Worker(new URL('./edit-worker.js', import.meta.url), { type: 'module' }));
  return new Promise((ok, no) => {
    V.cancel = () => no(new Error('cancelled'));
    w.onmessage = (e) => seq === V.seq && ok(e.data);
    w.onerror = (e) => seq === V.seq && no(new Error(e.message || 'worker'));
    w.postMessage(msg);
  });
}
const payload = (st, data) => ({ edit: { ...st, draft: null }, data, record: app.state });

async function search() {
  if (V.running) return;
  const st = edit(), data = dataOf(st.dataset.sem), lessons = effectiveLessons(st, data);
  if (!lessons.length && !st.added.length) return say('אין קורסים במערכת. חזרו לשלב 1.');
  const blocked = overlapMessage(st, lessons, data);
  if (blocked) return say(blocked);
  const g = st.goal, goal = !!(g.dayOff || g.notAfter || g.fewerGaps), swaps = Object.values(st.swaps).some((s) => s.length);
  const changed = st.movable.length || st.added.length || st.removed.length || swaps;
  if (!goal && !changed) return say('סמנו קורס שיכול לזוז או בחרו מטרה.');
  say('');
  const stamp = V.edits;
  V.running = true;
  V.result = null;
  renderEdit();
  try {
    V.result = await runWorker({ kind: st.movable.length || !goal ? 'search' : 'tries', ...payload(st, data) });
  } catch (e) {
    if (e.message === 'cancelled') return void (V.running = false);
    V.result = { proposals: [], enabling: [], timedOut: true, diagnosis: [] };
  }
  V.running = false;
  if (stamp !== V.edits) V.result = null; // something changed while it ran: the answer is for an older question
  if (onChanges()) {
    renderEdit();
    $('editResults')?.scrollIntoView?.({ block: 'nearest' });
  }
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
  const seen = new Set([now]);
  const options = r.proposals.map((p) => [...new Set(p.lessons.filter((l) => l.course === course && l.group).map((l) => l.group))])
    .filter((ids) => ids.length && !seen.has(ids.slice().sort().join()) && seen.add(ids.slice().sort().join()));
  const line = (ids) => ids.map((id) => groupLine(id, data)).join(' + ');
  out.innerHTML = options.length
    ? `<ul class="pop-alts">${options.map((ids) => `<li>${swapButton(course, ids, line(ids))}</li>`).join('')}</ul>`
    : '<p class="hint">אין קבוצות אחרות שמתאימות לשאר המערכת.</p>';
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

async function openLoader(file) {
  const { openFriendEditor } = await import('./ui-friend-editor.js');
  const d = edit().draft;
  openFriendEditor({
    mode: 'edit', groups: groupsOfDraft(d), rows: fixedRows(d), sem: d?.sem ?? null, returnFocusId: 'editTitle', focusFile: file,
    onSave({ rows, sem }) {
      // a choice made earlier stays with its row when the rows are read again
      const key = (r) => [r.code, r.type, r.text, JSON.stringify(r.meets)].join('|');
      const was = new Map((d?.rows ?? []).flatMap((r, i) => (d && i in d.choices ? [[key(r), d.choices[i]]] : [])));
      const choices = {};
      rows.forEach((r, i) => key(r) && was.has(key(r)) && (choices[i] = was.get(key(r))));
      fresh = true;
      commit({ ...edit(), draft: { rows, choices, registered: d?.registered ?? edit().registered, sem } });
      renderEdit();
      return null;
    }
  });
}

function next() {
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
  const data = dataOf(d.sem), lessons = lessonsFromRows(d.rows, d.choices, data);
  if (!lessons.length) return say('לא נמצאו שיעורים במערכת. טענו אותה שוב.');
  // the same schedule as the one already loaded: keep the work done in step 2
  if (!(st.baseline.length && sameNow(st) && st.registered === d.registered && JSON.stringify(lessons) === JSON.stringify(st.original)))
    commit({ ...loadSchedule(st, lessons, datasetOf(data, app.state), d.registered), draft: d });
  location.hash = '#edit/changes';
}

const STEP_ONE = {
  loadFile: () => openLoader(true),
  loadHand: () => openLoader(false),
  next,
  restore() {
    commit(restoreOriginal(edit()));
    renderEdit();
    $('editTitle').focus();
  }
};
const without = (list, c) => list.filter((x) => x !== c);
const ACT_ED = {
  ...STEP_ONE,
  search,
  day(b) {
    V.day = Number(b.dataset.day);
    renderEdit();
    document.querySelector(`#editDays [data-day="${V.day}"]`)?.focus({ preventScroll: true });
  },
  fewerGaps: () => touch({ ...edit(), goal: { ...edit().goal, fewerGaps: !edit().goal.fewerGaps } }, '[data-ed="fewerGaps"]'),
  toggleMove(b) {
    const st = edit(), c = b.dataset.course;
    $('pop').hidePopover?.();
    touch({ ...st, movable: st.movable.includes(c) ? without(st.movable, c) : [...st.movable, c] }, '#editWeekTitle');
  },
  others: (b) => others(b.dataset.course),
  pickSwap(b) {
    const st = edit();
    $('pop').hidePopover?.();
    touch({ ...st, swaps: { ...st.swaps, [b.dataset.course]: b.dataset.groups.split(',') } }, '#editWeekTitle');
  },
  drop: (b) => drop(b.dataset.course),
  unmove: (b) => touch({ ...edit(), movable: without(edit().movable, b.dataset.course) }, '#editTitle'),
  unadd: (b) => touch({ ...edit(), added: without(edit().added, b.dataset.course) }, '#editTitle'),
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
    if (b && !b.disabled) ACT_ED[b.dataset.ed]?.(b, e);
  });
  document.addEventListener('change', (e) => {
    const t = e.target, st = edit(), d = st.draft, goal = t.dataset?.edGoal;
    if (goal === 'dayOff') touch({ ...st, goal: { ...st.goal, dayOff: Number(t.value) || null } }, '[data-ed-goal="dayOff"]');
    else if (goal === 'notAfter') touch({ ...st, goal: { ...st.goal, notAfter: t.value || null } }, '[data-ed-goal="notAfter"]');
    else if (goal === 'addCourse' && t.value) touch({ ...st, added: [...st.added, t.value] }, '[data-ed-goal="addCourse"]');
    if (goal || !d) return;
    if (t.dataset?.edPick !== undefined) d.choices[t.dataset.edPick] = t.value || null;
    else if (t.hasAttribute?.('data-ed-reg')) d.registered = t.checked;
    else return;
    commit(st);
    say('');
  });
  // Escape (a light dismiss) with the block gone: focus must not fall to <body>
  $('pop').addEventListener('toggle', (e) => e.newState === 'closed' && onChanges() && setTimeout(refocus, 0));
}
