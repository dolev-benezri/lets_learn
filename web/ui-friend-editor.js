// Full-screen editor for a friend's timetable: pick groups (course search, paste, PDF, image) and see them on a week grid.
// Draft state lives only here until Save. Events are handled on the <dialog> itself and stopped there, so ui-plan.js's
// document-level click / change / submit / keydown handlers (data-act, data-chg, Escape closes the drawer) never see them.
import { app, esc, yearView, semOfGroup } from './app.js';
import { DAYS, icon, typeLabel, groupIndex, hourRange, renderWeek, assignColors } from './ui-grid.js';
import { askConfirm } from './ui-dialog.js';
import { groupsFromText, placeGroup, findCourse, clashIds } from './friend-import.js';
import { groupNumber, courseCount } from './ui-text.js';
import { imageCanvas, withPdf, pageCanvas, bigPage, scanCanvases } from './friend-scan.js';
import { rowsFromTable, matchRows } from './friend-schedule.js';

const MAX = 40;
const LIMIT = `אפשר עד ${MAX} קבוצות לחבר`;
const NOTEXT = 'לא נמצא טקסט בקובץ, נסו להעתיק ולהדביק';
const SEM_NAME = { 'א': 'א׳', 'ב': 'ב׳' };

const dlg = document.getElementById('friendEd');
const phone = matchMedia('(max-width:599px)'); // phone: the editor is two full-screen tabs (CSS shows one, driven by #feRoot[data-tab]); wider: both side by side
let ed = null; // the open editor: { friend, onSave, returnFocusId, draft, sem, day, sel, cid, busy, colors }
const $ = (id) => dlg.querySelector(`#${id}`);
const semData = () => app.sem[ed.sem];
const offered = (sem) => Object.fromEntries(Object.entries(app.sem[sem]?.courses ?? {}).filter(([, c]) => c.groups.length));
const meetingsOf = (gid) => groupIndex(semData()).get(gid)?.g.meetings ?? [];
const firstDay = () => { const ds = ed.draft.flatMap(meetingsOf).map((m) => m.day).filter((d) => d >= 1 && d <= 6); return ds.length ? Math.min(...ds) : 1; };

// Opens the editor. friend: the manual friend being edited (omit for a new one). onSave({ name, groups, manual }, editingName)
// returns an error string (the editor stays open and shows it) or null; returnFocusId: element id to focus after close.
export function openFriendEditor({ friend = null, onSave, returnFocusId }) {
  if (dlg.open) return;
  const draft = friend ? friend.groups.slice() : [];
  ed = { friend, onSave, returnFocusId, draft, sem: draft.map(semOfGroup).find(Boolean) ?? 'א', day: 1, sel: null, cid: null, busy: false, colors: new Map(), start: draft.join() };
  dlg.innerHTML = shell();
  setTab(draft.length ? 'grid' : 'pick'); // nothing picked yet: start where groups are picked
  renderTabs();
  renderCourses();
  renderGroups();
  ed.day = firstDay();
  renderGrid();
  updateBar();
  dlg.showModal();
  if (!(phone.matches && friend)) $('feName').focus(); // editing on a phone: don't raise the keyboard over the page
}
phone.addEventListener('change', () => { if (ed) setTab($('feRoot').dataset.tab); });

const shell = () => `<div class="fe" id="feRoot">
  <header class="fe-head">
    <h2 id="feTitle">${ed.friend ? 'עריכת חבר' : 'הזנת מערכת של חבר'}</h2>
    <div class="fe-name"><label for="feName">שם החבר</label>
      <input id="feName" type="text" maxlength="60" autocomplete="off" aria-required="true" value="${esc(ed.friend?.name ?? '')}">
      <p class="err-text" id="feNameErr" role="alert"></p></div>
    <div class="fe-actions"><button type="button" class="btn" data-fe="cancel">${icon('x')}<span class="fe-lbl">ביטול</span></button>
      <button type="button" class="btn primary" data-fe="save">${icon('check')} שמור חבר</button></div>
  </header>
  <p class="err-text fe-err" id="feErr" role="alert"></p>
  <div class="fe-tabs" role="tablist" aria-label="חלקי העורך">
    <button type="button" role="tab" id="feTabPick" aria-controls="fePick" data-fe="tab" data-tab="pick">קבוצות</button>
    <button type="button" role="tab" id="feTabGrid" aria-controls="feGrid" data-fe="tab" data-tab="grid">מערכת</button></div>
  <div class="fe-body">
    <section class="fe-pick" id="fePick" aria-label="בחירת קבוצות">
      <div class="fe-pick-body" id="fePickBody">
        <div id="fePickSem"></div>
        <form id="feSearch" class="fe-sec"><label for="feCourse">הוספת קורס</label>
          <div class="row"><input id="feCourse" type="text" list="feCourses" autocomplete="off" placeholder="שם או מספר קורס"><button type="submit" class="btn">הצג קבוצות</button></div>
          <datalist id="feCourses"></datalist></form>
        <p class="err-text" id="fePickErr" role="alert"></p>
        <div id="feGroups" class="fe-sec"></div>
        <section class="fe-sec fe-imp" aria-labelledby="feImpH"><h3 id="feImpH">ייבוא</h3>
          <label for="feText">הדביקו טקסט עם מספרי קבוצות</label>
          <textarea id="feText" rows="3" dir="auto"></textarea>
          <button type="button" class="btn" id="feFind" data-fe="find">מצא קבוצות</button>
          <label for="feFile">או קובץ מערכת (PDF או תמונה)</label>
          <input type="file" id="feFile" accept="application/pdf,image/*">
          <div id="feImpStatus" class="hint" aria-live="polite" tabindex="-1"></div>
          <div id="feImpPages" class="fe-pages-box" hidden></div></section>
      </div>
    </section>
    <section class="fe-grid" id="feGrid" aria-label="מערכת השבוע של החבר">
      <div class="fe-bar"><div id="feTabs"></div><p id="feCount" class="hint"></p><p id="feSel" class="hint" aria-live="polite"></p>
        <button type="button" class="btn" id="feRemove" data-fe="removeSel">${icon('x')} הסר קבוצה</button></div>
      <p class="hint warn-text" id="feUnk"></p>
      <div id="feDays" class="daysel" role="group" aria-label="בחירת יום"></div>
      <div id="feWeek" class="fe-wk" role="group" tabindex="-1"></div>
    </section>
  </div></div>`;

// ---------- tabs (phone) ----------
function setTab(tab) {
  $('feRoot').dataset.tab = tab;
  for (const b of dlg.querySelectorAll('[role="tab"]')) { b.setAttribute('aria-selected', String(b.dataset.tab === tab)); b.tabIndex = b.dataset.tab === tab ? 0 : -1; }
  for (const id of ['fePick', 'feGrid']) { // tabpanel roles only while the tab strip is shown
    const p = $(id);
    if (phone.matches) { p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', id === 'fePick' ? 'feTabPick' : 'feTabGrid'); }
    else { p.removeAttribute('role'); p.removeAttribute('aria-labelledby'); }
  }
}

// ---------- rendering (each region on its own: inputs, the textarea and the focus are never re-rendered) ----------
function renderTabs() { // the semester switch shows in both panes (the picker's copy only on a phone); setSem keeps both checked
  const html = (name) => app.sem['ב'] ? `<fieldset class="seg"><legend class="sr">סמסטר</legend><div class="seg-opts">${['א', 'ב'].map((s) =>
    `<label><input type="radio" name="${name}" value="${s}"${s === ed.sem ? ' checked' : ''}><span data-s="${s}"></span></label>`).join('')}</div></fieldset>` : '';
  $('feTabs').innerHTML = html('feSem'); $('fePickSem').innerHTML = html('feSemP'); // two names: one radio group would leave only one copy checked
  refreshTabs();
}
function refreshTabs() {
  for (const el of dlg.querySelectorAll('[data-s]')) el.textContent = `סמסטר ${SEM_NAME[el.dataset.s]} · ${ed.draft.filter((g) => semOfGroup(g) === el.dataset.s).length}`;
}
function renderCourses() {
  const cs = offered(ed.sem);
  $('feCourses').innerHTML = Object.entries(cs).map(([cid, c]) => `<option value="${esc(c.name)} (${esc(cid)})">`).join('');
}
const meetingHtml = (m) => `יום ${DAYS[m.day] ?? '?'}׳ <bdi dir="ltr">${esc(m.start)}–${esc(m.end)}</bdi>`;
function row(g) {
  const on = ed.draft.includes(g.id);
  return `<li class="fe-row${on ? ' on' : ''}"><div class="fe-info"><span>${g.meetings.map(meetingHtml).join(' · ') || 'ללא מועד'}</span>
    <span>${esc(g.lecturer || '—')}${g.full ? ' <span class="tag bad">מלאה</span>' : ''} <bdi dir="ltr" class="gid">${esc(g.id)}</bdi></span></div>
    <button type="button" class="btn${on ? '' : ' primary'}" data-fe="toggle" data-gid="${esc(g.id)}"><span
      class="sr">${esc(typeLabel(g.type))} ${esc(groupNumber(g.id))}: </span>${on ? 'משובץ · הסר' : 'שבץ'}</button></li>`;
}
function renderGroups() {
  const c = ed.cid && semData().courses[ed.cid];
  $('feGroups').innerHTML = !c ? '<p class="hint">חפשו קורס כדי לראות את הקבוצות שלו.</p>'
    : `<h3 class="fe-course">${esc(c.name)} <bdi dir="ltr" class="gid">${esc(ed.cid)}</bdi></h3>${[...new Set(c.groups.map((g) => g.type))].map((t) =>
      `<h4 class="fe-type">${esc(typeLabel(t))}</h4><ul class="fe-rows">${c.groups.filter((g) => g.type === t).map(row).join('')}</ul>`).join('')}`;
}
function renderGrid() {
  const data = semData(), byId = groupIndex(data), ids = ed.draft.filter((g) => byId.has(g));
  const range = hourRange(ids.flatMap((g) => byId.get(g).g.meetings));
  ed.day = Math.min(ed.day, range.days);
  assignColors(ed.colors, [...new Set(ids.map((g) => byId.get(g).cid))]);
  const clash = clashIds(ids, data), week = $('feWeek');
  week.setAttribute('aria-label', `מערכת סמסטר ${SEM_NAME[ed.sem]}`);
  week.innerHTML = renderWeek({ data, res: { groups: ed.draft }, range, colors: ed.colors, dashed: new Set(), pins: [], friends: [], day: ed.day });
  $('feDays').innerHTML = Array.from({ length: range.days }, (_, i) => i + 1).map((d) => `<button type="button" data-fe="day" data-day="${d}"
    aria-pressed="${d === ed.day}">${DAYS[d]}׳</button>`).join('');
  for (const b of week.querySelectorAll('.blk')) {
    delete b.dataset.act; // renderWeek's board hook: not ours (ui-plan.js would open the board popover)
    b.removeAttribute('aria-haspopup');
    b.setAttribute('aria-pressed', String(b.dataset.gid === ed.sel));
    if (clash.has(b.dataset.gid)) { b.classList.add('clash'); b.insertAdjacentHTML('beforeend', '<span class="sr">, חופף לקבוצה אחרת</span>'); }
  }
  for (const col of week.querySelectorAll('.day')) lanes([...col.querySelectorAll('.blk')]);
}
// Overlapping blocks of one day sit side by side: --lane of --lanes (editor CSS), instead of hiding each other.
function lanes(blocks) {
  const xs = blocks.map((b) => ({ b, s: +b.style.getPropertyValue('--s'), e: +b.style.getPropertyValue('--s') + +b.style.getPropertyValue('--d') })).sort((a, b) => a.s - b.s);
  let group = [], end = 0;
  const flush = () => { for (const x of group) x.b.style.setProperty('--lanes', Math.max(...group.map((y) => y.lane)) + 1); group = []; };
  for (const x of xs) {
    if (group.length && x.s >= end) flush();
    const taken = new Set(group.filter((y) => y.e > x.s).map((y) => y.lane));
    x.lane = 0;
    while (taken.has(x.lane)) x.lane++;
    x.b.style.setProperty('--lane', x.lane);
    group.push(x);
    end = Math.max(end, x.e);
  }
  flush();
}
function updateBar() {
  const sel = ed.sel && groupIndex(semData()).get(ed.sel), unk = ed.draft.filter((g) => !semOfGroup(g)).length;
  $('feCount').textContent = `${ed.draft.length} מתוך ${MAX} קבוצות`;
  $('feSel').textContent = sel ? `נבחרה: ${sel.c.name} · ${typeLabel(sel.g.type)}` : 'בחרו קבוצה בלוח כדי להסיר אותה';
  $('feRemove').disabled = !sel;
  $('feTabGrid').textContent = ed.draft.length ? `מערכת · ${ed.draft.length}` : 'מערכת';
  $('feUnk').innerHTML = unk ? `${icon('alert')} ${unk === 1 ? 'עוד קבוצה אחת שלא נמצאה בנתונים תישמר כמו שהיא' : `עוד ${unk} קבוצות שלא נמצאו בנתונים יישמרו כמו שהן`}` : '';
}
function setErr(id, text, input) {
  $(id).textContent = text;
  if (!input) return;
  input.setAttribute('aria-invalid', String(!!text));
  if (text) input.setAttribute('aria-describedby', id); else input.removeAttribute('aria-describedby');
}
const setPickErr = (text, invalid = false) => setErr('fePickErr', text, invalid || !text ? $('feCourse') : null);

// ---------- draft ----------
// Places gid through its own semester's data (same course + type replaces, only inside one semester). false = refused.
function put(gid) {
  const data = app.sem[semOfGroup(gid)];
  if (!data) return false;
  const next = placeGroup(ed.draft, gid, data);
  if (!next.includes(gid) && !ed.draft.includes(gid)) return false;
  ed.draft = next;
  return true;
}
function changed() {
  if (ed.sel && !ed.draft.includes(ed.sel)) ed.sel = null;
  renderGrid();
  refreshTabs();
  updateBar();
}
const visibleBlocks = () => [...$('feWeek').querySelectorAll('.blk')].filter((b) => b.offsetParent);
function removeGroup(gid) {
  const i = visibleBlocks().findIndex((b) => b.dataset.gid === gid);
  ed.draft = ed.draft.filter((g) => g !== gid);
  changed();
  renderGroups();
  const rest = visibleBlocks();
  (rest[Math.min(Math.max(i, 0), rest.length - 1)] ?? $('feWeek')).focus({ preventScroll: true });
}
function selectBlock(gid) {
  ed.sel = ed.sel === gid ? null : gid;
  if (ed.sel) { ed.cid = groupIndex(semData()).get(gid).cid; renderGroups(); } // the picker follows: the course's other groups are one tap away
  for (const b of $('feWeek').querySelectorAll('.blk')) b.setAttribute('aria-pressed', String(b.dataset.gid === ed.sel));
  updateBar();
}
function setSem(sem) {
  ed.sem = sem;
  for (const r of dlg.querySelectorAll(`input[name^="feSem"][value="${sem}"]`)) r.checked = true;
  if (ed.cid && !offered(sem)[ed.cid]) ed.cid = null;
  ed.sel = null;
  ed.day = firstDay();
  setPickErr('');
  renderCourses();
  renderGroups();
  renderGrid();
  updateBar();
}
function search() {
  const input = $('feCourse'), cid = findCourse(input.value, offered(ed.sem));
  if (!cid) {
    const other = ed.sem === 'א' ? 'ב' : 'א';
    setPickErr(app.sem['ב'] && findCourse(input.value, offered(other)) ? `הקורס לא מוצע בסמסטר ${SEM_NAME[ed.sem]}. נסו את סמסטר ${SEM_NAME[other]}` : 'לא מצאתי קורס בשם הזה', true);
    return;
  }
  setPickErr('');
  ed.cid = cid;
  input.value = '';
  renderGroups();
  $('feGroups').querySelector('[data-fe="toggle"]')?.focus({ preventScroll: true });
}

// ---------- import ----------
const status = (html) => { $('feImpStatus').innerHTML = html; };
const allData = () => (app.sem['ב'] ? yearView(app.sem['א'], app.sem['ב']) : app.sem['א']);
const importText = (text) => applyFound(groupsFromText(text, allData()));
function applyFound({ found, unknown, ambiguous = 0, weak = 0 }) {
  const placed = [];
  let already = 0, refused = 0;
  for (const gid of found) { // placeGroup toggles: an id already in the draft must stay
    if (ed.draft.includes(gid)) already++;
    else if (put(gid)) placed.push(gid);
    else refused++;
  }
  const otherOf = (s) => (s === 'א' ? 'ב' : 'א');
  const switched = placed.length && !placed.some((g) => semOfGroup(g) === ed.sem) ? semOfGroup(placed[0]) : null; // nothing here: show where they landed
  if (switched) setSem(switched);
  setPickErr(refused ? LIMIT : '');
  changed();
  renderGroups();
  const other = placed.filter((g) => semOfGroup(g) !== ed.sem).length, o = SEM_NAME[otherOf(ed.sem)];
  const skipped = [already && `${already} כבר במערכת`, refused && `${refused} לא שובצו`].filter(Boolean).join(', ');
  status(`<p>${placed.length === found.length ? `נמצאו ${found.length} קבוצות` : `נמצאו ${found.length} קבוצות, שובצו ${placed.length} (${skipped})`}${other
    ? ` (${other === placed.length ? 'כולן' : `${other} מהן`} בסמסטר ${o})` : ''}${switched ? `. עברנו לסמסטר ${SEM_NAME[ed.sem]}` : ''}.</p>`
    + (ambiguous ? `<p>ב${ambiguous === 1 ? 'קורס אחד' : `-${courseCount(ambiguous)}`} יש כמה קבוצות באותן שעות, נבחרה הראשונה. כדאי לבדוק במערכת.</p>` : '')
    + (weak ? `<p>${weak} קבוצות זוהו לפי יום ושעות בלבד (השם בתמונה לא ברור). כדאי לבדוק אותן במערכת.</p>` : '')
    + (unknown.length ? `<p>לא נמצאו: ${unknown.slice(0, 8).map((id) => `<bdi dir="ltr">${esc(id)}</bdi>`).join(', ')}${unknown.length > 8 ? ` ועוד ${unknown.length - 8}` : ''}</p>` : '')
    + (found.length || unknown.length ? '' : '<p>לא זוהה אף מספר קבוצה (9 ספרות).</p>'));
}
async function pdfText(file) {
  return withPdf(file, async (doc) => {
    const pages = [];
    for (let i = 1; i <= Math.min(doc.numPages, 30); i++) pages.push((await (await doc.getPage(i)).getTextContent()).items.map((x) => x.str).join(' '));
    return pages.join(' ');
  });
}
// Group ids in the text win; otherwise whatever a table or grid gave.
function applyScan(text, result) {
  const ids = groupsFromText(text, allData());
  applyFound(ids.found.length || !(result.found.length || result.unknown.length) ? ids : result);
}
const progress = (me) => (i, n, f) => { if (ed === me) status(`<p>מזהה טקסט… ${n > 1 ? `שקף ${i + 1} מתוך ${n}, ` : ''}${Math.round(f * 100)}%</p>`); };
// A scanned PDF (pictures only): thumbnails to tick, e.g. a whole deck of options where a friend picked one.
async function showPages(file, me) {
  const box = $('feImpPages');
  box.replaceChildren();
  box.hidden = false;
  status('<p>הקובץ סרוק (תמונות). סמנו את השקפים לייבוא: לוח שבועי, טבלה, או שניהם של אפשרות אחת.</p>');
  const go = Object.assign(document.createElement('button'), { type: 'button', className: 'btn', textContent: 'ייבא את השקפים שסומנו' });
  go.dataset.fe = 'pages';
  const list = Object.assign(document.createElement('div'), { className: 'fe-pages' });
  box.append(go, list);
  me.pdf = file;
  await withPdf(file, async (doc) => {
    for (let n = 1; n <= Math.min(doc.numPages, 80) && ed === me; n++) {
      const label = Object.assign(document.createElement('label'), { className: 'fe-page' }), cb = Object.assign(document.createElement('input'), { type: 'checkbox', value: String(n) });
      label.append(await pageCanvas(doc, n, 240), cb, ` שקף ${n}`);
      list.append(label);
    }
  });
}
async function scanSelected() {
  const me = ed, n = [...$('feImpPages').querySelectorAll('input:checked')].map((i) => Number(i.value));
  if (!n.length) { status('<p>סמנו שקף אחד לפחות.</p>'); return; }
  if (n.length > 12) { status('<p>אפשר עד 12 שקפים בכל פעם.</p>'); return; }
  const input = $('feFile');
  me.busy = true; input.disabled = true; $('feFind').disabled = true;
  status('<p>מכין את השקפים…</p>');
  let out = null;
  try { out = await withPdf(me.pdf, async (doc) => scanCanvases(await Promise.all(n.map((i) => bigPage(doc, i))), allData().courses, progress(me))); } catch { /* reads as "no text" */ }
  if (me !== ed) return;
  me.busy = false; input.disabled = false; $('feFind').disabled = false;
  if (out) applyScan(out.text, out.result); else status(`<p>${NOTEXT}</p>`);
}
async function importFile(file) {
  const me = ed, input = $('feFile'), refocus = document.activeElement === input, isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const busy = (on) => { me.busy = on; input.disabled = on; $('feFind').disabled = on; };
  busy(true);
  $('feImpPages').hidden = true;
  if (refocus) $('feImpStatus').focus({ preventScroll: true }); // a disabled input would drop focus to <body>
  status(`<p>${isPdf ? 'קורא את הקובץ…' : 'מזהה טקסט…'}</p>`);
  let text = '', result = null, scanned = false;
  const courses = allData().courses;
  try {
    if (isPdf) {
      text = await pdfText(file);
      const rows = rowsFromTable(text, courses);
      if (rows.some((r) => r.cid)) result = matchRows(rows, courses);
      else { const ids = groupsFromText(text, allData()); scanned = !(ids.found.length || ids.unknown.length); }
    } else if (file.type.startsWith('image/')) ({ text, result } = await scanCanvases([await imageCanvas(file)], courses, progress(me)));
  } catch { /* any failure reads as "no text" */ }
  if (me !== ed) return; // closed (or reopened) while working
  busy(false);
  input.value = '';
  if (refocus) input.focus();
  if (scanned) { try { await showPages(file, me); } catch { status(`<p>${NOTEXT}</p>`); } } // pictures only: let the user pick slides
  else if (text.trim() || result) applyScan(text, result ?? { found: [], unknown: [] });
  else status(`<p>${NOTEXT}</p>`);
}

// ---------- save / close ----------
async function save() {
  const input = $('feName'), name = input.value.trim();
  setErr('feErr', '');
  setErr('feNameErr', '', input);
  if (!name) { setErr('feNameErr', 'יש להזין שם חבר', input); input.focus(); return; }
  if (!ed.draft.length) {
    setTab('pick');
    setPickErr('יש לשבץ קבוצה אחת לפחות', true);
    $('feCourse').focus();
    return;
  }
  if (name !== ed.friend?.name && app.state.friends.some((f) => f.name === name) && !await askConfirm(`החבר ${name} כבר קיים. להחליף?`, { ok: 'החלף', cancel: 'ביטול' })) return;
  if (!ed) return; // closed while the confirm was open
  const err = ed.onSave({ name, groups: ed.draft.slice(), manual: true }, ed.friend?.name ?? null);
  if (err) { setErr('feErr', err); return; }
  closeEditor();
}

const ACT = {
  async cancel() {
    const dirty = $('feName').value.trim() !== (ed.friend?.name ?? '') || ed.draft.join() !== ed.start;
    if (!dirty || await askConfirm('לסגור בלי לשמור?', { ok: 'סגור', cancel: 'המשך לערוך' })) closeEditor();
  },
  save,
  tab(b) { setTab(b.dataset.tab); },
  day(b) { ed.day = Number(b.dataset.day); renderGrid(); $('feDays').querySelector(`[data-day="${ed.day}"]`)?.focus({ preventScroll: true }); },
  find() { importText($('feText').value); },
  pages() { if (!ed.busy) scanSelected(); },
  removeSel() { if (ed.sel) removeGroup(ed.sel); },
  toggle(b) {
    const gid = b.dataset.gid;
    if (ed.draft.includes(gid)) ed.draft = ed.draft.filter((g) => g !== gid);
    else if (!put(gid)) { setPickErr(LIMIT); return; }
    else { const ds = meetingsOf(gid).map((m) => m.day).filter((d) => d >= 1 && d <= 6); if (ds.length) ed.day = Math.min(...ds); } // phone: show the day it landed on
    setPickErr('');
    changed();
    renderGroups();
    $('feGroups').querySelector(`[data-gid="${CSS.escape(gid)}"]`)?.focus({ preventScroll: true });
  },
};

dlg.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!ed) return;
  const blk = e.target.closest('.blk');
  if (blk) return selectBlock(blk.dataset.gid);
  const b = e.target.closest('[data-fe]');
  if (b && !b.disabled) ACT[b.dataset.fe]?.(b);
});
dlg.addEventListener('change', (e) => {
  e.stopPropagation();
  if (!ed) return;
  if (e.target.name?.startsWith('feSem')) setSem(e.target.value);
  else if (e.target.id === 'feFile' && e.target.files[0] && !ed.busy) importFile(e.target.files[0]);
});
dlg.addEventListener('submit', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (ed && e.target.id === 'feSearch') search();
});
dlg.addEventListener('keydown', (e) => {
  e.stopPropagation(); // the drawer's Escape and the board's arrow keys never see editor keys
  const tab = e.target.closest?.('[role="tab"]');
  if (ed && tab && /^(Arrow(Left|Right)|Home|End)$/.test(e.key)) { // two tabs: any arrow moves to the other one
    e.preventDefault();
    const to = e.key === 'Home' ? 'pick' : e.key === 'End' ? 'grid' : tab.dataset.tab === 'pick' ? 'grid' : 'pick';
    setTab(to);
    $(to === 'pick' ? 'feTabPick' : 'feTabGrid').focus();
  }
  const blk = e.target.closest?.('.blk');
  if (ed && blk && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); removeGroup(blk.dataset.gid); }
});
// Escape: ask first when something would be lost (a stray Escape while using the datalist is easy).
// A file chooser's own cancel bubbles here: ignore it. Chrome lets a page stop Escape once per user activation; past that, let it close.
dlg.addEventListener('cancel', (e) => { if (e.target !== dlg || !e.cancelable) return; e.preventDefault(); if (ed) ACT.cancel(); });
// Cleanup runs right after close() (the close event is queued, and an Escape the page could not stop closes natively).
function closeEditor() {
  if (dlg.open) dlg.close();
  const id = ed?.returnFocusId;
  ed = null;
  dlg.innerHTML = '';
  (document.getElementById(id) ?? document.getElementById('week'))?.focus({ preventScroll: true });
}
dlg.addEventListener('close', () => { if (ed) closeEditor(); });
