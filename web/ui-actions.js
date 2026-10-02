// Click (ACT) and change (CHG) handlers, wired to the document in ui-plan.js.
import { app, cleanBlocks, upsertFriend, save, refresh, keepFocus, switchTo, clearSaved, DEFAULT } from './app.js';
import { setStatus, cleanProfile, specRule } from './rules.js';
import { friendLink, backupLink } from './share.js';
import { groupIndex, openPop, paired, resGroups } from './ui-grid.js';
import { askConfirm } from './ui-dialog.js';
import { openFriendEditor } from './ui-friend-editor.js';
import { friendToast, gradeInput } from './ui-text.js';
import { colors, markOnboarded, gated, current, shown, shownData, status, toast, copy, focusWeek, $, ui } from './ui-common.js';
import { scheduleRun } from './ui-search.js';
import { renderBanner, renderView, go } from './ui-view.js';
import { avgLine, specSave, specView, importGrades } from './ui-me.js';
import { MAX_BLOCKS, registrationText, renderDrawer, openPanel } from './ui-drawer.js';

// ---------- actions ----------
export function addFriend(p) {
  const name = p.name || `חבר ${app.state.friends.length + 1}`;
  const r = upsertFriend(app.state.friends, { name, groups: p.groups });
  if (r.error) { ui.friendMsg = r.error; toast(ui.friendMsg); keepFocus(renderDrawer); return; }
  app.state.friends = r.friends;
  app.friendLanding = null;
  refresh();
  toast(friendToast(name, r.replaced));
}
// The editor's onSave: returns an error string (the editor stays open) or null.
function saveManualFriend(p, editing) {
  const r = upsertFriend(app.state.friends, p, editing);
  if (r.error) return r.error;
  app.state.friends = r.friends; // a pending friend-link banner stays: it is a different friend
  refresh();
  toast(friendToast(p.name, r.replaced));
  return null;
}
async function share() {
  const res = current();
  if (!res) return toast('אין עדיין מערכת לשתף');
  copy(await friendLink(location.origin + location.pathname, app.state, resGroups(res)), 'הקישור הועתק. אפשר לשלוח לחברים.');
}

export const ACT = {
  gradeImport() { $('gradeFile').click(); },
  yearPassed(el) { app.data.lists[el.dataset.li].courses.forEach((id) => setStatus(app.state, id, 'passed')); refresh(); },
  statusDone(el, e) { e.preventDefault(); markOnboarded(); location.hash = ''; },
  openStatus() { location.hash = '#me'; },
  skip(el, e) { e.preventDefault(); ($('me').hidden ? $('week') : $('meTitle'))?.focus(); }, // a real #fragment would switch the view
  panel: (el) => openPanel(el.dataset.panel, el),
  closeDrawer: () => $('drawer').close(),
  prev: () => go(-1),
  next: () => go(1),
  day(el) { ui.mobileDay = Number(el.dataset.day); ui.dayScroll = true; keepFocus(renderView); },
  block: (el) => openPop(el, { data: shownData(), res: shown(), includeFull: app.state.constraints.includeFull, pins: app.state.pins, friends: app.state.friends.filter((f) => f.active), colors }),
  more(el) { // the button says it is working until the result replaces it
    if (ui.running) return;
    ui.moreMul *= 2;
    el.textContent = 'מחפש…';
    el.setAttribute('aria-disabled', 'true');
    scheduleRun(true);
  },
  popClose: () => $('pop').hidePopover(),
  pin(el) {
    const gid = el.dataset.gid, was = app.state.pins.includes(gid);
    const { cid, g } = groupIndex(app.data).get(gid);
    const sameSlot = (p) => { const x = groupIndex(app.data).get(p); return x?.cid === cid && !paired(x.g, g); }; // a new pin replaces the course's pins it can't pair with
    app.state.pins = was ? app.state.pins.filter((x) => x !== gid) : [...app.state.pins.filter((p) => !sameSlot(p)), gid];
    if (!was) app.state.choices[cid] = 'must'; // the solver forces a pinned course in; show it
    const fromGid = $('pop').dataset.gid;
    $('pop').hidePopover();
    refresh();
    if (gid !== fromGid) focusWeek(); // the clicked block is about to be replaced; keep focus out of <body>
    toast(was ? 'הנעיצה בוטלה' : 'הקבוצה ננעצה ותופיע בכל החלופות');
  },
  share,
  copyReg: () => current() && copy(registrationText(current()), 'הרשימה הועתקה'),
  backup: async () => copy(await backupLink(location.origin + location.pathname, app.state), 'קישור הגיבוי הועתק'),
  landingAdd: () => addFriend(app.friendLanding),
  landingDrop() { app.friendLanding = null; renderBanner(); focusWeek(); },
  dismissError() { app.hashError = null; renderBanner(); focusWeek(); },
  dropPin(el) { app.state.pins = app.state.pins.filter((p) => p !== el.dataset.gid); refresh(); focusWeek(); },
  removeFriend(el) { app.state.friends.splice(Number(el.dataset.i), 1); refresh(); $('drawer').querySelector('[data-k="closeDrawer"]')?.focus(); },
  openFriendEditor: () => openFriendEditor({ onSave: saveManualFriend, returnFocusId: 'openFriendEditor' }),
  editFriend: (el) => openFriendEditor({ friend: app.state.friends[Number(el.dataset.i)], onSave: saveManualFriend, returnFocusId: `editFriend-${el.dataset.i}` }),
  dayOff(el) {
    const c = app.state.constraints, d = Number(el.dataset.day);
    c.dayOff = c.dayOff.includes(d) ? c.dayOff.filter((x) => x !== d) : [...c.dayOff, d];
    refresh();
  },
  blkAdd() {
    const bl = app.state.constraints.blocks;
    if (bl.length >= MAX_BLOCKS) return;
    bl.push({ day: 1, start: '18:00', end: '20:00', label: '' });
    refresh();
    $('drawer').querySelector(`[data-k="blk-${bl.length - 1}-day"]`)?.focus();
  },
  blkRemove(el) {
    const bl = app.state.constraints.blocks, i = Number(el.dataset.i);
    bl.splice(i, 1);
    refresh();
    ($('drawer').querySelector(`[data-k="blk-rm-${Math.min(i, bl.length - 1)}"]`) ?? $('drawer').querySelector('[data-k="blkAdd"]'))?.focus();
  },
  clearPins() { app.state.pins = []; refresh(); },
  async eraseAll() {
    if (!await askConfirm('למחוק מהדפדפן את כל הנתונים השמורים: ההתקדמות, החברים וההעדפות? אי אפשר לשחזר, אלא מגיבוי שיצרתם.', { ok: 'מחק הכול', cancel: 'ביטול' })) return;
    clearSaved();
    history.replaceState(null, '', location.pathname); // no hash: the reload is a first visit again
    location.reload();
  },
  async resetPrefs() {
    if (!await askConfirm('לאפס את ההעדפות לברירת המחדל?', { ok: 'אפס', cancel: 'ביטול' })) return;
    app.state.weights = structuredClone(DEFAULT.weights);
    app.state.constraints = { ...structuredClone(DEFAULT.constraints), blocks: app.state.constraints.blocks }; // busy time is a fact about the week, like pins and friends
    app.state.scope = DEFAULT.scope;
    app.state.load = DEFAULT.load;
    refresh();
    toast('ההעדפות אופסו');
  },
};

// Text-like inputs only save + re-run (re-rendering them mid-typing would reset the caret).
const time = (v) => (/^\d{2}:\d{2}$/.test(v) ? v : '');
// An invalid edit (end not after start, empty time) is not stored; the re-render puts the old value back.
const blockEdit = (el, k, v) => {
  const b = app.state.constraints.blocks[el.dataset.i];
  if (cleanBlocks([{ ...b, [k]: v }]).length) b[k] = v;
};
// A program or cohort change: the new data is already in; reset what belonged to the old one and redraw.
async function changeIdentity(program, startYear) {
  if (!await switchTo(program, startYear)) { refresh(); return; } // refused or failed: the selects go back to the real state
  ui.last = null; ui.cur = 0; ui.specPick = null; colors.clear();
  refresh();
  toast(`עברנו ל${app.catalog.programs.find((p) => p.id === program)?.name ?? ''} ${startYear}`);
}
const cohortOf = (y) => y && app.data.year - y + 1; // the cohort that is in study year y
const nearest = (list, want) => list.reduce((b, y) => (Math.abs(y - want) < Math.abs(b - want) ? y : b), list[0]); // same cohort if offered, else the closest
export const CHG = {
  program: (el) => {
    const p = app.catalog.programs.find((x) => x.id === Number(el.value));
    if (p) changeIdentity(p.id, nearest(p.startYears, cohortOf(app.state.profile.year) ?? app.state.startYear));
    return 'save';
  },
  gradeFile: (el) => { const f = el.files[0]; el.value = ''; if (f) importGrades(f); return 'save'; },
  mode: (el) => {
    const id = el.dataset.id;
    app.state.choices[id] = el.value;
    if (el.value !== 'must') { // a pin would force it back in
      const kept = app.state.pins.filter((p) => groupIndex(app.data).get(p)?.cid !== id);
      if (kept.length < app.state.pins.length) { app.state.pins = kept; toast('הנעיצות של הקורס בוטלו'); }
    }
  },
  sem: (el) => { ui.sem = el.value === 'ב' ? 'ב' : 'א'; return 'view'; }, // a view switch: no new search
  scope: (el) => { app.state.scope = el.value; },
  load: (el) => { app.state.load = el.value; },
  semOf: (el) => { if (el.value) app.state.semesterOf[el.dataset.id] = el.value; else delete app.state.semesterOf[el.dataset.id]; }, // a pin still wins in the solver
  pyear: (el) => {
    const was = gated(), y = cleanProfile({ year: Number(el.value) }).year;
    app.state.profile.year = y;
    const start = cohortOf(y); // the year picks the cohort that is in it when the catalog has one, else it only relabels
    if (start && start !== app.state.startYear && app.catalog.programs.find((p) => p.id === app.state.program)?.startYears.includes(start)) changeIdentity(app.state.program, start);
    if (was) queueMicrotask(focusWeek); // after the refresh: the question is gone, keep focus out of <body>
  },
  amirnet: (el) => { app.state.profile.amirnet = cleanProfile({ amirnet: el.value === '' ? null : Number(el.value) }).amirnet; },
  specMode: (el) => {
    const mode = el.value, picks = mode === 'pick' ? specView(app.data, app.state.profile.specs).picks : [];
    ui.specPick = { mode, picks };
    app.state.profile.specs = specSave(app.data, mode, picks);
    app.state.specDraft = mode === 'pick' && picks.length && picks.length < specRule(app.data).pick ? picks : null;
  },
  specPick: (el) => {
    const { pick } = specRule(app.data), { picks } = specView(app.data, app.state.profile.specs), next = el.checked ? [...picks, el.dataset.id] : picks.filter((x) => x !== el.dataset.id);
    ui.specPick = { mode: 'pick', picks: next.slice(0, pick) };
    app.state.profile.specs = specSave(app.data, 'pick', ui.specPick.picks);
    app.state.specDraft = ui.specPick.picks.length && ui.specPick.picks.length < pick ? ui.specPick.picks : null;
  },
  summer: (el) => { app.state.profile.summer = el.checked; if (!el.checked && app.state.scope === 'קיץ') app.state.scope = 'year'; },
  grade: (el) => {
    const g = gradeInput(el.validity?.badInput ? 'x' : el.value, app.state.grades[el.dataset.cid]); // an invalid entry keeps the previous grade
    if (g === undefined) delete app.state.grades[el.dataset.cid]; else app.state.grades[el.dataset.cid] = g;
    el.value = g ?? ''; // snap an invalid entry back
    const avg = $('gradeAvg');
    if (avg) avg.innerHTML = avgLine(); // just this line: re-rendering the page would drop the caret
    return 'save'; // grades do not touch the solver: no new search
  },
  status: (el) => setStatus(app.state, el.dataset.id, el.value),
  failCount: (el) => { app.state.failed[el.dataset.id] = Number(el.value); },
  w: (el) => { app.state.weights[el.dataset.w] = Number(el.value); },
  fw: (el) => { app.state.friends[el.dataset.i].weight = Number(el.value); },
  factive: (el) => { app.state.friends[el.dataset.i].active = el.checked; },
  dayHard: (el) => { app.state.constraints.dayOffHard = el.value === 'hard'; },
  winHard: (el) => { app.state.constraints.windowHard = el.value === 'hard'; },
  examsAllow: (el) => { app.state.constraints.examsSameDay = el.checked ? 'allow' : 'forbid'; },
  includeFull: (el) => { app.state.constraints.includeFull = el.checked; },
  notBefore: (el) => { app.state.constraints.notBefore = time(el.value); return 'quiet'; },
  notAfter: (el) => { app.state.constraints.notAfter = time(el.value); return 'quiet'; },
  maxCredits: (el) => { const n = parseFloat(el.value); app.state.constraints.maxCredits = Number.isFinite(n) && n >= 0 ? n : null; return 'quiet'; },
  blkDay: (el) => blockEdit(el, 'day', Number(el.value)),
  blkStart: (el) => blockEdit(el, 'start', el.value),
  blkEnd: (el) => blockEdit(el, 'end', el.value),
  blkLabel: (el) => { app.state.constraints.blocks[el.dataset.i].label = el.value.slice(0, 30); save(); return 'view'; }, // the label never changes the search
  myName: (el) => { app.state.name = el.value.trim().slice(0, 60); return 'quiet'; },
};
