// Design A's first-run card (spec "Phase 3, first run"; the steps and the mark are web/first-run.js and ui-common.js firstRun): one card centred on the
// screen per step, on the page background, with nothing of the board behind it. Every function here returns at once when design A is off.
// The card also covers the whole screen for the terms alone (improve mode's first visit, or the terms asked again after a new TERMS_VERSION).
import { app, esc, refresh } from './app.js';
import { yearsOf } from './rules.js';
import { icon } from './ui-grid.js';
import {
  $, ui, seg, YEARS, designOn, firstRun, setFirstRun, firstRunOn, passOpen, termsOk, firstDraft, clearFirstDraft, markOnboarded, markEntered, shownTitle
} from './ui-common.js';
import { stepOf, markOf, nextStep, prevStep, stepLine, yearsFor, startReady } from './first-run.js';
import { LEGAL_SHORT } from './ui-text.js';
import { TERMS_BLOCK } from './ui-me.js';

const HEAD = { start: 'לפני שמתחילים', passed: 'מה עברת עד עכשיו?', courses: 'קורסים', prefs: 'מה חשוב לי', friends: 'חברים' };
// the steps after the first have their bodies in their own tasks: until then an empty one
const BODY = { passed: () => '', courses: () => '', prefs: () => '', friends: () => '' };

export const currentStep = () => stepOf(firstRun(), app.state?.profile.year ?? null);
const yearNow = () => app.state?.profile.year ?? null;

// Step 1's three choices as they stand: the draft kept with the mark, else what the record already says (a student who came back from improve mode).
// The terms count as read once they are accepted (they can be accepted on improve's card, and the pass then finds them done).
export function draftOf() {
  const d = firstDraft(),
    { programs } = app.catalog,
    loaded = app.state.programSet ? app.state.program : null;
  const p = d.p ?? (programs.length < 2 ? programs[0].id : loaded);
  const n = yearsFor(programs.find((x) => x.id === p)?.name, p === app.state.program ? yearsOf(app.data) : null);
  const y = d.y ?? app.state.profile.year;
  return { t: !!d.t || termsOk(), p, y: y > n ? null : (y ?? null), n };
}
// what the card must ask in this state: the track and the year belong to the pass; the terms alone ask only the box
export const askOf = () => ({ track: passOpen() && app.catalog.programs.length > 1, year: passOpen() });

function stepsHtml(step) {
  const l = stepLine(step, yearNow());
  const items = l.steps
    .map(
      (s) => `<li class="a-fr-s ${s.state}"${s.state === 'now' ? ' aria-current="step"' : ''}>${s.state === 'done' ? icon('check') : ''}<span>${s.name}</span></li>`
    )
    .join('');
  return `<ol class="a-fr-steps" aria-label="שלבי ההתחלה">${items}</ol><p class="a-fr-n">שלב ${l.n} מתוך ${l.of}</p>`;
}

// Step 1: the terms and the choices on one card. The select and the years follow the draft; "המשך" waits for all of them.
function startBody() {
  const d = draftOf(),
    ask = askOf(),
    dis = ui.frBusy ? ' disabled' : '', // the choices are being applied: they stay as they are
    { programs } = app.catalog;
  const track = !ask.track
    ? ''
    : `<label class="field a-fr-field">מסלול<select data-chg="frTrack" data-k="frTrack"${dis}>${
        d.p == null ? '<option value="" selected disabled>בחרו מסלול</option>' : ''
      }${programs.map((p) => `<option value="${esc(p.id)}"${p.id === d.p ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>`;
  const year = !ask.year ? '' : seg('fr-year', 'שנת לימודים', YEARS.slice(0, d.n), d.y, `data-chg="frYear"${dis}`, true);
  const tick = `<label class="check a-fr-check"><input type="checkbox" data-chg="frTerms" data-k="frTerms"${d.t ? ' checked' : ''}${dis}> קראתי והבנתי</label>`;
  const error = ui.frError ? `<p class="msg bad" role="alert">${esc(ui.frError)}</p>` : '';
  return `<div class="gate">${TERMS_BLOCK}</div>${track}${year}${tick}${error}`;
}

// The foot: the step's button, "חזרה" (not on step 1) and the legal line (steps 2-5: step 1 is the terms themselves). Step 1's button is "המשך" once the
// terms, the track and the year are set, and says it is loading while the program's files arrive.
function footHtml(step) {
  const first = step === 'start';
  const ready = !first || startReady(draftOf(), askOf());
  const busy = first && ui.frBusy;
  const go = `<button type="button" class="btn primary" data-act="${first ? 'frStart' : 'frNext'}" data-k="${first ? 'frStart' : 'frNext'}"${
    ready && !busy ? '' : ' disabled'
  }${busy ? ' aria-busy="true"' : ''}>${busy ? 'טוען…' : 'המשך'}</button>`;
  const back = first
    ? ''
    : `<button type="button" class="btn ghost" data-act="frBack" data-k="frBack">${icon('chevron-right')}<span>חזרה</span></button>`;
  const alt =
    first && passOpen()
      ? '<p class="a-fr-alt"><a href="#edit" data-k="frEdit">יש לך כבר מערכת? שיפור מערכת קיימת</a></p>'
      : '';
  return `<div class="a-fr-foot"><div class="a-fr-btns">${go}${back}</div>${alt}${first ? '' : `<p class="a-fr-legal">${LEGAL_SHORT}</p>`}</div>`;
}

// What the card shows now: the pass at its step, or the terms alone.
function cardHtml() {
  const pass = passOpen();
  // the terms come first, whatever step the mark says (a new TERMS_VERSION asks again in the middle of the pass): the mark is kept for the way on
  const step = pass && termsOk() && !ui.frHold ? currentStep() : 'start'; // frHold: step 1 until its "המשך" has landed
  ui.titleId = ui.frTitleId = 'frTitle'; // frTitleId: ui-shell.js applyShell keeps it when it sets the title again (a resize)
  const body = step === 'start' ? startBody() : BODY[step]();
  return `<section class="a-fr-card" aria-labelledby="frTitle" data-step="${step}">${pass ? stepsHtml(step) : ''}<h2 id="frTitle" tabindex="-1">${
    HEAD[step]
  }</h2><div class="a-fr-body">${body}</div>${footHtml(step)}</section>`;
}

// The card follows the state: shown while the terms or the pass are open, empty and hidden otherwise. A redraw that would draw the same card leaves the
// DOM alone, so a focused control, a caret and the scroll stay where they are.
let drawn = '';
export function renderFirstRun() {
  const host = $('firstRun');
  if (!host || !designOn()) return;
  const on = firstRunOn();
  document.body.classList.toggle('first-run', on);
  host.hidden = !on;
  if (!on) {
    if (drawn) host.innerHTML = '';
    drawn = '';
    return;
  }
  const html = cardHtml();
  if (html !== drawn) {
    host.innerHTML = html;
    drawn = html;
  }
  measureFoot();
}
// the sticky foot's height: a focused control scrolls into view above it (design-a.css scroll-padding)
function measureFoot() {
  const foot = document.querySelector('.a-fr-foot');
  document.documentElement.style.setProperty('--fr-foot-h', `${foot ? foot.offsetHeight : 0}px`);
}
addEventListener('resize', () => document.body.classList.contains('first-run') && measureFoot());

// A step change: the card is drawn for the new step, at its top, with focus on its heading.
export function toStep(mark) {
  setFirstRun(mark);
  renderFirstRun();
  scrollTo(0, 0);
  shownTitle()?.focus({ preventScroll: true });
}
export function frNext() {
  if (!passOpen()) return refresh(); // another tab finished the pass: the card is stale, the board takes over
  const next = nextStep(currentStep(), yearNow());
  if (next !== 'done') return toStep(markOf(next));
  // the last step: the pass ends and the board takes over with its first search
  setFirstRun('done');
  clearFirstDraft(); // step 1's draft goes with the pass
  markOnboarded();
  markEntered();
  refresh();
  shownTitle()?.focus();
}
export function frBack() {
  if (!passOpen()) return refresh();
  const prev = prevStep(currentStep(), yearNow());
  if (prev) toStep(markOf(prev));
}
