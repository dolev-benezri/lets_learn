// Shared by the ui-*.js modules: the mutable UI state (one object, since an imported `let` cannot be assigned), constants and small view helpers.
import { app, esc, candidateMode, summerOn } from './app.js';
import { icon, groupIndex, summary, isPair, semResult } from './ui-grid.js';
import { showText } from './ui-dialog.js';
import { specCodes } from './rules.js';

export const $ = (id) => document.getElementById(id);
export const CAND = ['retake', 'available', 'afterA', 'conditional'];
export const WEIGHTS = [['friends', 'להיות עם החברים'], ['progress', 'להתקדם בתואר'], ['freeDays', 'ימים פנויים'], ['compact', 'בלי חלונות'], ['timeWindow',
  'שעות נוחות'], ['examSpread', 'פיזור בחינות']];
export const SCALE = [[0, 'לא חשוב'], [1, 'קצת'], [3, 'חשוב'], [5, 'מאוד']];
export const STATUS = [['none', 'לא לקחתי'], ['passed', 'עברתי'], ['failed', 'נכשלתי']];
export const FAILS = [[1, 'פעם'], [2, 'פעמיים'], [3, '3 פעמים']];
export const FSCALE = [[0, 'לא חשוב'], [1, 'קצת'], [2, 'חשוב'], [3, 'מאוד']];
export const SEMS = [['א', 'סמסטר א׳'], ['ב', 'סמסטר ב׳']];
const SCOPE = [['year', 'שנה'], ['א', 'רק א׳'], ['ב', 'רק ב׳']];
export const scopes = () => (summerOn() ? [...SCOPE, ['קיץ', 'קיץ']] : SCOPE); // summer only when the profile plans one
export const LOAD = [['א', 'יותר בא׳'], ['even', 'מאוזן'], ['ב', 'יותר בב׳']];
export const YEARS = [[1, 'א׳'], [2, 'ב׳'], [3, 'ג׳'], [4, 'ד׳']];
export const SEM_PICK = [['', 'אוטומטי'], ['א', 'א׳'], ['ב', 'ב׳']];
export const HARD = [['hard', 'חובה לגמרי'], ['soft', 'רק העדפה']]; // the constraint toggles; the course mode keeps "חובה/אולי/לא"
export const SHEET = '(max-width: 1079px)'; // below: the drawer is a modal sheet; from here up it is docked and the page reserves its width (index.html)
export const PHONE = '(max-width: 599px)'; // the popover is a bottom sheet

export const openDetails = new Set(['plan']);
export const colors = new Map(); // sticky: a course keeps its colour unless it clashes inside the shown alternative

const ONBOARDED = 'afeka-sched-v1-onboarded';
export const onboarded = () => { try { return localStorage.getItem(ONBOARDED) === '1'; } catch { return false; } };
export const markOnboarded = () => { try { localStorage.setItem(ONBOARDED, '1'); } catch { /* storage unavailable */ } };

export const gated = () => !!app.state && !app.state.profile.year; // planning waits for the study year (credits goal and English depend on it)
export const current = () => ui.last?.results[ui.cur] ?? null; // a search result, or a pair in year scope
export const shown = () => semResult(current(), ui.sem); // what the grid, pills and popover render
export const shownData = () => (isPair(current()) ? app.sem[ui.sem] : app.data);
export const yearSearch = () => app.state.scope === 'year' && !!app.sem['ב'];
export const listIds = () => [...new Set(app.data.lists.flatMap((l) => l.courses))];
export const status = (id) => app.cls.statuses[id]?.status;
export const doneIds = () => Object.keys(app.cls.statuses).filter((id) => status(id) === 'done');
export const planned = (id) => ['must', 'optional'].includes(candidateMode(id));
export const allGroupIds = () => groupIndex(app.data);
export const pill = (ic, text, cls = '') => `<span class="pill ${cls}">${icon(ic)}<span>${text}</span></span>`;
export const seg = (name, legend, opts, cur, attrs, visible = false) => `<fieldset class="seg"><legend${visible ? '' : ' class="sr"'}>${esc(legend)}</legend><div class="seg-opts">${
  opts.map(([v, t]) => `<label><input type="radio" name="${esc(name)}" value="${v}"${String(v) === String(cur) ? ' checked' : ''} data-k="${esc(name)}-${v}"
    ${attrs}><span>${t}</span></label>`).join('')}</div></fieldset>`;
export const details = (key, summaryHtml, body, n) => n ? `<details data-key="${key}"${openDetails.has(key) ? ' open' : ''}><summary
  data-k="sum-${key}">${summaryHtml}</summary>${body}</details>` : '';

let toastTimer, toastHide;
export function toast(text) {
  const t = $('toast');
  t.setAttribute('popover', 'manual'); // top layer: stays visible above a modal drawer or dialog
  clearTimeout(toastTimer);
  clearTimeout(toastHide);
  if (t.showPopover && !t.matches(':popover-open')) { t.textContent = ''; t.showPopover(); } // the live region is shown empty first...
  setTimeout(() => { t.textContent = text; }, 50); // ...then filled, so screen readers announce the change (rAF never fires in a hidden tab)
  t.classList.add('show');
  toastTimer = setTimeout(() => { t.classList.remove('show'); toastHide = setTimeout(() => t.matches(':popover-open') && t.hidePopover(), 250); }, 2500);
}
export async function copy(text, ok) {
  try { await navigator.clipboard.writeText(text); toast(ok); } catch { showText('ההעתקה האוטומטית נכשלה. העתיקו מכאן:', text); }
}

// Hebrew punctuation for names from the data (ASCII ' and " between letters become geresh and gershayim).
export const heb = (t) => String(t).replace(/(?<=[א-ת])'/g, '׳').replace(/(?<=[א-ת])"(?=[א-ת])/g, '״');
// A specialization list is titled by its area; the other lists keep their name.
export const listTitle = (l) => {
  const s = app.data.specializations?.find((x) => specCodes(x).some(([, c]) => c === l.code));
  const kind = s && specCodes(s).find(([, c]) => c === l.code)[0];
  return s ? `התמחות ${s.name}: ${kind === 'mandatory' ? 'חובה' : kind === 'elective' ? 'בחירה' : 'חובה כשהיא נבחרת לבד'}` : l.name;
};

export const focusWeek = () => $('week').focus({ preventScroll: false });

// state shared by the modules (sem: the shown semester of a year result)
export const ui = { worker: null, timer: null, last: null, cur: 0, running: false, runError: null, gen: 0, moreMul: 1, sem: 'א', gradeMsg: '', panel: null,
  opener: null, mobileDay: 1, friendMsg: '', friendUrl: '', liveText: '', dashed: new Set(), dayScroll: true, specPick: null };
