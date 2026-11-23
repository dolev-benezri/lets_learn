// Shared by the ui-*.js modules: the mutable UI state (one object, since an imported `let` cannot be assigned), constants and small view helpers.
import { app, esc, candidateMode, summerOn, savedExists, isEditHash } from './app.js';
import { icon, groupIndex, summary, isPair, semResult, nameHtml } from './ui-grid.js';
import { showText } from './ui-dialog.js';
import { specCodes, reqContext, reqMet } from './rules.js';
import { helpHtml, courseMoreHtml, heb } from './ui-text.js';

// Keep help open while a search or a field change redraws a tool. The renderer calls this only in design A.
export const toolHelp = (id, topic, text) => helpHtml(id, topic, text, ui.helpOpen.has(id));

export const $ = (id) => document.getElementById(id);
export const CAND = ['retake', 'available', 'afterA', 'conditional'];
export const WEIGHTS = [
  ['friends', 'להיות עם החברים'],
  ['progress', 'להתקדם בתואר'],
  ['freeDays', 'ימים פנויים'],
  ['compact', 'בלי חלונות'],
  ['timeWindow', 'שעות נוחות'],
  ['examSpread', 'פיזור בחינות']
];
export const SCALE = [
  [0, 'לא חשוב'],
  [1, 'קצת'],
  [3, 'חשוב'],
  [5, 'מאוד']
];
export const STATUS = [
  ['none', 'לא לקחתי'],
  ['passed', 'עברתי'],
  ['failed', 'נכשלתי']
];
export const FAILS = [
  [1, 'פעם'],
  [2, 'פעמיים'],
  [3, '3 פעמים']
];
export const FSCALE = [
  [0, 'לא חשוב'],
  [1, 'קצת'],
  [2, 'חשוב'],
  [3, 'מאוד']
];
export const SEMS = [
  ['א', 'סמסטר א׳'],
  ['ב', 'סמסטר ב׳']
];
export const SCOPE = [
  ['year', 'שנה'],
  ['א', 'רק א׳'],
  ['ב', 'רק ב׳']
];
// Summer belongs to the year: a third tab next to א׳ and ב׳ when the profile plans one (issue 10). Its scope ('קיץ') still reads "שנה" in the "לתכנן" choice.
export const semTabs = () => (summerOn() ? [...SEMS, ['קיץ', 'קיץ']] : SEMS);
export const scopeOf = (s) => (s === 'קיץ' ? 'year' : s);
export const LOAD = [
  ['א', 'יותר בא׳'],
  ['even', 'מאוזן'],
  ['ב', 'יותר בב׳']
];
export const YEARS = [
  [1, 'א׳'],
  [2, 'ב׳'],
  [3, 'ג׳'],
  [4, 'ד׳'],
  [5, 'ה׳']
]; // ה׳: evening programs (yearsOf cuts the list per program)
export const SEM_PICK = [
  ['', 'אוטומטי'],
  ['א', 'א׳'],
  ['ב', 'ב׳']
];
export const HARD = [
  ['hard', 'חובה לגמרי'],
  ['soft', 'רק העדפה']
]; // the constraint toggles; the course mode keeps "חובה/אולי/לא"
// below: the drawer is a modal sheet; from here up it is docked and the page reserves its width (index.html)
export const SHEET = '(max-width: 1079px)';
export const PHONE = '(max-width: 599px)'; // the popover is a bottom sheet

export const openDetails = new Set(['plan']);
export const colors = new Map(); // sticky: a course keeps its colour unless it clashes inside the shown alternative

const ONBOARDED = 'afeka-sched-v1-onboarded';
export const onboarded = () => {
  try {
    return localStorage.getItem(ONBOARDED) === '1';
  } catch {
    return false;
  }
};
export const markOnboarded = () => {
  try {
    localStorage.setItem(ONBOARDED, '1');
  } catch {
    /* storage unavailable */
  }
};
// Step 1's entry choice (grade sheet or "הזנה ידנית") was made; until then a first visit sees the entry screen (ui-me.js entryScreen).
const ENTRY = 'afeka-sched-v1-entry';
export const entered = () => {
  try {
    return localStorage.getItem(ENTRY) === '1';
  } catch {
    return false;
  }
};
export const markEntered = () => {
  try {
    localStorage.setItem(ENTRY, '1');
  } catch {
    /* storage unavailable */
  }
};

// The terms gate (ui-me.js gateHtml): shown before the first question until accepted; a new TERMS_VERSION asks everyone again.
// A blocked storage still lets this visit through (the flag), and asks again next visit.
export const TERMS_VERSION = '2';
const TERMS = 'afeka-sched-v1-terms';
let accepted = false;
export const termsOk = () => {
  try {
    if (localStorage.getItem(TERMS) === TERMS_VERSION) return true;
  } catch {
    /* storage unavailable */
  }
  return accepted;
};
app.termsOk = termsOk; // app.js asks before it restores a backup link
export const acceptTerms = () => {
  accepted = true;
  try {
    localStorage.setItem(TERMS, TERMS_VERSION);
  } catch {
    /* storage unavailable: kept for this visit only */
  }
};

// Design A's first run (spec "Phase 3"): the step a new visitor has reached (1..5, web/first-run.js STEPS) or 'done'. A missing mark reads as 'done' for
// anyone who is not new (onboarded, or a record saved before this mark): old saves never see the pass. null: a new visitor with no mark yet; app.js init
// writes 1 for them before anything is saved. The stored mark wins; one a blocked storage could not take lives in `runMark` for the visit.
const FIRSTRUN = 'afeka-sched-v1-firstrun';
let runMark = null;
export const firstRun = () => {
  if (runMark !== null) return runMark;
  try {
    const v = localStorage.getItem(FIRSTRUN);
    if (v === 'done') return v;
    if (/^[1-5]$/.test(v ?? '')) return Number(v);
  } catch {
    /* storage unavailable: no mark of its own */
  }
  return onboarded() || savedExists() ? 'done' : null;
};
export const setFirstRun = (v) => {
  runMark = v;
  if (v === 'done') keepLanding(null); // the kept friend link goes with the pass, whichever way it ended
  try {
    localStorage.setItem(FIRSTRUN, String(v));
    runMark = null; // stored: the storage is the mark again (another tab may finish the pass)
  } catch {
    /* storage unavailable: kept for this visit only */
  }
};
// Step 1's choices are a draft until "המשך" applies them: { t: the terms box, p: the track, y: the study year }. Kept beside the mark, so a reload (or a visit
// to improve mode and back) finds them; gone with the pass. A blocked storage keeps it in memory for the visit.
const DRAFT = 'afeka-sched-v1-firstrun-draft';
let draft = null;
export const firstDraft = () => {
  if (draft) return draft;
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT));
    if (d && typeof d === 'object') return { t: d.t === true, p: Number.isInteger(d.p) ? d.p : null, y: Number.isInteger(d.y) ? d.y : null };
  } catch {
    /* storage unavailable, or not JSON: no draft */
  }
  return { t: false, p: null, y: null };
};
export const setFirstDraft = (patch) => {
  draft = { ...firstDraft(), ...patch };
  try {
    localStorage.setItem(DRAFT, JSON.stringify(draft));
    draft = null; // stored: the storage is the draft again
  } catch {
    /* storage unavailable: kept for this visit only */
  }
};
export const clearFirstDraft = () => {
  draft = null;
  try {
    localStorage.removeItem(DRAFT);
  } catch {
    /* storage unavailable */
  }
};
// A friend's link that arrives on a first visit waits for step 5 (app.friendLanding lives in memory, and the link is stripped from the address once read):
// kept beside the mark while the pass is open, so a reload does not lose it. Gone with the pass, or once the friend is added.
const KEPT = 'afeka-sched-v1-firstrun-friend';
let keptText = '';
export function keepLanding(p) {
  const text = p ? JSON.stringify(p) : '';
  if (text && text === keptText) return;
  keptText = text;
  try {
    if (text) localStorage.setItem(KEPT, text);
    else localStorage.removeItem(KEPT);
  } catch {
    /* storage unavailable: the link waits in memory for this visit */
  }
}
export function keptLanding() {
  try {
    const p = JSON.parse(localStorage.getItem(KEPT)),
      one = (v) => (typeof v === 'string' || typeof v === 'number' ? v : undefined);
    // what share.js readHash accepts of a friend's link: this record's year and semester, a short name, a few short group ids
    if (
      p && typeof p === 'object' && p.v === 1 && p.year === app.state?.year && p.semester === app.state?.semester &&
      typeof p.name === 'string' && p.name.length <= 60 &&
      Array.isArray(p.groups) && p.groups.length <= 40 && p.groups.every((g) => typeof g === 'string' && g.length <= 20)
    ) {
      keptText = JSON.stringify(p);
      return { v: 1, year: p.year, semester: p.semester, program: one(p.program), startYear: one(p.startYear), name: p.name, groups: p.groups };
    }
  } catch {
    /* storage unavailable, or not JSON: nothing kept */
  }
  return null;
}
// The pass is open: design A, build mode, a student who has not finished it. The edit page (#edit) is never gated by it.
export const passOpen = () => designOn() && !isEditHash(location.hash) && firstRun() !== 'done';
app.passOpen = passOpen; // app.js asks before it fills in the earlier years (ensurePassed, switchTo)
app.firstLoad = () => {
  if (!designOn()) return;
  if (firstRun() === null) setFirstRun(1);
  if (firstRun() === 'done') keepLanding(null); // none after the pass (another tab may have ended it)
  else app.friendLanding ??= keptLanding(); // a friend's link kept for step 5 (a reload finds it)
};

// a first visit picks the track, none is assumed
export const needsProgram = () => !!app.state && !app.state.programSet && app.catalog.programs.length > 1;
// the record's own gate: the terms, the track and the study year (improve mode's record asks no more than this)
export const gatedRecord = () => !!app.state && (!termsOk() || !app.state.profile.year || needsProgram());
// planning waits for the study year (credits goal and English depend on it), and in design A for the end of the first-run pass
export const gated = () => gatedRecord() || (!!app.state && passOpen());
// The first-run card covers the screen: the pass is open, or the terms are not accepted (improve mode's first visit, or a new TERMS_VERSION). A failed load
// shows its own message on the board instead.
export const firstRunOn = () => designOn() && !!app.state && !app.loadFailed && (!termsOk() || passOpen());
export const current = () => ui.last?.results[ui.cur] ?? null; // a search result, or a pair in year scope
export const shown = () => semResult(current(), ui.sem); // what the grid, pills and popover render
export const shownData = () => (isPair(current()) ? app.sem[ui.sem] : app.data);
export const yearSearch = () => app.state.scope === 'year' && !!app.sem['ב'];
export const listIds = () => [...new Set(app.data.lists.flatMap((l) => l.courses))];
// The record by default; planning views pass planningCls() (app.js: summer assumes the year plan).
export const status = (id, cls = app.cls) => cls.statuses[id]?.status;
export const doneIds = (cls = app.cls) => Object.keys(cls.statuses).filter((id) => status(id, cls) === 'done');
export const planned = (id) => ['must', 'optional'].includes(candidateMode(id));
// Every loaded semester's group ids: a friend's groups in the semester not on screen are not "לא נמצאו" (audit #37)
export const allGroupIds = () =>
  new Set(['א', 'ב', 'קיץ'].flatMap((s) => (app.sem?.[s] ? [...groupIndex(app.sem[s]).keys()] : [])));
export const pill = (ic, text, cls = '') => `<span class="pill ${cls}">${icon(ic)}<span>${text}</span></span>`;
export const seg = (name, legend, opts, cur, attrs, visible = false) =>
  `<fieldset class="seg"><legend${visible ? '' : ' class="sr"'}>${esc(legend)}</legend><div class="seg-opts">${opts
    .map(
      ([
        v,
        t
      ]) => `<label><input type="radio" name="${esc(name)}" value="${v}"${String(v) === String(cur) ? ' checked' : ''} data-k="${esc(name)}-${v}"
    ${attrs}><span>${t}</span></label>`
    )
    .join('')}</div></fieldset>`;
export const details = (key, summaryHtml, body, n) =>
  n
    ? `<details data-key="${key}"${openDetails.has(key) ? ' open' : ''}><summary
  data-k="sum-${key}">${summaryHtml}</summary>${body}</details>`
    : '';

// Shared first-run/tool row. The caller supplies the existing segmented control, extra controls and visible warnings.
export function courseRowA(key, id, c, choice, body, warnings = '', tool = 'courses') {
  const fold = tool === 'firstRun'
    ? details(key, `עוד<span class="sr"> על ${esc(c.name)}</span>`, body, body)
    : courseMoreHtml(id, heb(c.name), key, body, ui.courseOpen[tool].has(id));
  return `<div class="a-crs-main"><span class="dot" aria-hidden="true"></span><span class="a-crs-name">${nameHtml(c.name)}</span>
    <span class="a-crs-cr">${c.credits} נ״ז</span>${fold}</div>${choice}${warnings}`;
}

let toastTimer, toastHide;
export function toast(text) {
  const t = $('toast');
  t.setAttribute('popover', 'manual'); // top layer: stays visible above a modal drawer or dialog
  clearTimeout(toastTimer);
  clearTimeout(toastHide);
  if (t.showPopover && !t.matches(':popover-open')) {
    t.textContent = '';
    t.showPopover();
  } // the live region is shown empty first...
  setTimeout(() => {
    t.textContent = text;
  }, 50); // ...then filled, so screen readers announce the change (rAF never fires in a hidden tab)
  t.classList.add('show');
  const ms = Math.max(4000, 60 * text.length); // long enough to read (a11y: was 2.5s)
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    toastHide = setTimeout(() => t.matches(':popover-open') && t.hidePopover(), 250);
  }, ms);
}
export async function copy(text, ok, failed = 'ההעתקה האוטומטית נכשלה. העתיקו מכאן:') {
  try {
    await navigator.clipboard.writeText(text);
    toast(ok);
  } catch {
    showText(failed, text);
  }
}

// Hebrew punctuation for names from the data (ASCII ' and " between letters become geresh and gershayim).
export { heb } from './ui-text.js';
export { nameHtml } from './ui-grid.js';

// "עשיתי את <name>": an outside-program alternative of a requirement (e.g. "מכינה בדרך לאפקה"), stored by name in state.outsideDone.
export const outsideBox = (n, k) => `<label class="check"><input type="checkbox" data-chg="outsideDone" data-name="${esc(n)}"
    data-k="od-${esc(k)}"${app.state.outsideDone.includes(n) ? ' checked' : ''}> עשיתי את ${nameHtml(n)}</label>`;
// One box per outside alternative of the course's requirements that its in-program alternatives leave unmet; a ticked box stays to untick.
export function outsideBoxes(id, k) {
  const inProgram = { ...reqContext(app.state), outside: new Set() };
  const names = [...new Set(app.data.courses[id].prereqs
    .filter((p) => p.kind === 'קדם' && p.anyOf.some((a) => a.id) && !reqMet(p, inProgram))
    .flatMap((p) => p.anyOf.filter((a) => !a.id).map((a) => a.name)))];
  return names.map((n, i) => outsideBox(n, `${k}-${i}`)).join('');
}
// A specialization list is titled by its area; the other lists keep their name.
export const listTitle = (l) => {
  const s = app.data.specializations?.find((x) => specCodes(x).some(([, c]) => c === l.code));
  const kind = s && specCodes(s).find(([, c]) => c === l.code)[0];
  return s
    ? `התמחות ${s.name}: ${kind === 'mandatory' ? 'חובה' : kind === 'elective' ? 'בחירה' : 'חובה כשהיא נבחרת לבד'}`
    : l.name;
};

export const focusWeek = () => $('week').focus({ preventScroll: false });
// Each step's page (index.html) and its h2, the focus target when the step is shown.
export const PAGE = {
  me: ['me', 'meTitle'],
  courses: ['courses', 'coursesTitle'],
  prefs: ['prefs', 'prefsTitle'],
  plan: ['layout', 'weekTitle'],
  edit: ['edit', 'editTitle']
};
// Design A (web/design.js sets the attribute): the frame of ui-shell.js. Asked here, in a leaf module, so any renderer can ask without importing the shell.
export const designOn = () => globalThis.document?.documentElement?.dataset?.design === 'a';
// Design A's alternatives column starts folded to a rail (a wide screen). The choice is kept: read once, then held in this variable, so folding works in a
// window whose storage throws; the write is best effort.
const ALTS_KEY = 'afeka-sched-v1-alts';
let altsIsOpen = false;
try {
  altsIsOpen = globalThis.localStorage?.getItem(ALTS_KEY) === 'open';
} catch {
  /* storage blocked: folded */
}
export const altsOpen = () => altsIsOpen;
// From 1080 to 1439px the open column would take the week's width (585px at 1280: lesson names cut), so there it opens OVER the week, for a visit only:
// the remembered choice above applies from 1440px, where the column has the room.
export const altsOverlay = () => !!globalThis.matchMedia?.('(min-width: 1080px) and (max-width: 1439px)').matches;
export const altsShown = () => (altsOverlay() ? !!ui.altsOver : altsIsOpen);
export function setAltsOpen(open) {
  altsIsOpen = !!open;
  try {
    globalThis.localStorage?.setItem(ALTS_KEY, altsIsOpen ? 'open' : 'closed');
  } catch {
    /* not kept; the page still folds and opens */
  }
}
// the heading to focus: the first shown page's in classic; under A the shell says (ui.titleId: the open tool's, the edit page's or the board's)
export const shownTitle = () => $(designOn() && ui.titleId ? ui.titleId : Object.values(PAGE).find(([p]) => !$(p).hidden)?.[1]);

// state shared by the modules (sem: the shown semester of a year result)
export const ui = {
  sheetExpanded: { panel: false, edit: false }, // design A phone sheets; a new tool opens at 60%
  worker: null,
  capProbe: null, // { gen, cap, ms, res }: the search one credit above the cap, while it holds for these settings
  probeWorker: null,
  timer: null,
  last: null,
  cur: 0,
  running: false,
  runError: null,
  gen: 0,
  moreMul: 1,
  sem: 'א',
  gradeMsg: '',
  panel: null,
  opener: null,
  mobileDay: 1,
  friendMsg: '',
  friendUrl: '',
  liveText: '',
  dashed: new Set(),
  dayScroll: true,
  specPick: null,
  onShown: null,
  onResult: null,
  altsOver: false, // A, 1080-1439px: the alternatives column is open over the week (not remembered)
  detailsOpen: false, // A: the board's "פרטים" disclosure, kept over the re-renders (ui-view.js factsHtml)
  tipOpen: false, // A: the courses tool's "מה ההבדל?" toggletip
  courseOpen: { courses: new Set(), me: new Set() }, // A: native row folds, by tool and course id
  courseQuery: '', // A: the build-tool search field lives outside the part redrawn by solver results
  courseGroups: null, // A: group choices before filtering, restored when the query is cleared
  helpOpen: new Set(), // A: section explanations, keyed by their controlled paragraph id
  whyOpen: new Set(), // A: the course cards' "למה?" that are open (ui-side.js), by course id and reason index
  titleId: null, // A: the id of the heading of what is shown (ui-shell.js applyShell)
  toolOpener: null, // A: the dock button that opened the tool, where the focus returns when it closes
  nav: null // A: why the address changed: 'open' or 'close' when the shell did it, nothing for a Back or a link
}; // onShown: set by the progress map, called after every renderView (a switched alternative or a search result)
// onResult: set by ui-plan.js, called when step 4 shows at least one alternative (the plans part of the tour)
