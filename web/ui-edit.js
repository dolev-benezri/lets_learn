// The edit page (#edit, #edit/changes): a separate page from the build steps. Step 1 loads my schedule and reviews what was read;
// step 2 and the proposals follow. Pure HTML helpers are exported (test/ui-edit.test.mjs); the DOM part is at the bottom.
import { app, esc } from './app.js';
import { $, needsProgram } from './ui-common.js';
import { DAYS, groupIndex, typeLabel } from './ui-grid.js';
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

// ---------- the page (DOM) ----------
let E = null; // the edit state, read once
let fresh = false; // a schedule was read in this visit: its review shows even while the saved one belongs to other data
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

export function renderEdit() {
  wire();
  const st = edit(), same = sameNow(st);
  if (location.hash === '#edit/changes' && (!st.baseline.length || !same)) history.replaceState(null, '', '#edit');
  const label = `<button type="button" class="mode-label" data-act="menu" data-k="editMode">עורכים מערכת קיימת · החלפה</button>`;
  const body = location.hash === '#edit/changes'
    ? '<div class="me-head"><h2 id="editTitle" tabindex="-1">שינויים</h2></div>'
    : stepOneHtml(st, dataOf(st.draft?.sem ?? 'א'), st.draft?.rows ?? [], { same: same || fresh });
  $('edit').innerHTML = label + body;
  if ($('editIdentity') && (!app.state.profile.year || needsProgram())) $('editIdentity').innerHTML = identityPick(app.state.profile.year, true);
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

const ACT_ED = {
  loadFile: () => openLoader(true),
  loadHand: () => openLoader(false),
  next,
  restore() {
    commit(restoreOriginal(edit()));
    renderEdit();
    $('editTitle').focus();
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
    const t = e.target, d = edit().draft;
    if (!d) return;
    if (t.dataset?.edPick !== undefined) d.choices[t.dataset.edPick] = t.value || null;
    else if (t.hasAttribute?.('data-ed-reg')) d.registered = t.checked;
    else return;
    commit(edit());
    say('');
  });
}
