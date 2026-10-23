// Shared by the ui-*.js modules: the mutable UI state (one object, since an imported `let` cannot be assigned), constants and small view helpers.
import { app, esc, candidateMode, summerOn } from './app.js';
import { icon, groupIndex, summary, isPair, semResult, nameHtml } from './ui-grid.js';
import { showText } from './ui-dialog.js';
import { specCodes, reqContext, reqMet } from './rules.js';

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

// a first visit picks the track, none is assumed
export const needsProgram = () => !!app.state && !app.state.programSet && app.catalog.programs.length > 1;
// planning waits for the study year (credits goal and English depend on it)
export const gated = () => !!app.state && (!termsOk() || !app.state.profile.year || needsProgram());
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
export async function copy(text, ok) {
  try {
    await navigator.clipboard.writeText(text);
    toast(ok);
  } catch {
    showText('ההעתקה האוטומטית נכשלה. העתיקו מכאן:', text);
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
  plan: ['layout', 'weekTitle']
};
export const shownTitle = () => $(Object.values(PAGE).find(([p]) => !$(p).hidden)?.[1]);

// state shared by the modules (sem: the shown semester of a year result)
export const ui = {
  worker: null,
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
  onResult: null
}; // onShown: set by the progress map, called after every renderView (a switched alternative or a search result)
// onResult: set by ui-plan.js, called when step 4 shows at least one alternative (the plans part of the tour)
