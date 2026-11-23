// Design A's first-run card (spec "Phase 3, first run"; the steps and the mark are web/first-run.js and ui-common.js firstRun): one card centred on the
// screen per step, on the page background, with nothing of the board behind it. Every function here returns at once when design A is off.
// The card also covers the whole screen for the terms alone (improve mode's first visit, or the terms asked again after a new TERMS_VERSION).
import { app, refresh } from './app.js';
import { icon } from './ui-grid.js';
import { $, ui, designOn, firstRun, setFirstRun, firstRunOn, passOpen, termsOk, markOnboarded, markEntered, shownTitle } from './ui-common.js';
import { stepOf, markOf, nextStep, prevStep, stepLine } from './first-run.js';
import { LEGAL_SHORT } from './ui-text.js';
import { gateHtml } from './ui-me.js';

const HEAD = { passed: 'מה עברת עד עכשיו?', courses: 'קורסים', prefs: 'מה חשוב לי', friends: 'חברים' };
// each step's body; a step with no entry here has an empty body for now
const BODY = { start: () => `<div class="gate">${gateHtml()}</div>`, passed: () => '', courses: () => '', prefs: () => '', friends: () => '' };

export const currentStep = () => stepOf(firstRun(), app.state?.profile.year ?? null);

function stepsHtml(step) {
  const l = stepLine(step, app.state.profile.year ?? null);
  const items = l.steps
    .map(
      (s) => `<li class="a-fr-s ${s.state}"${s.state === 'now' ? ' aria-current="step"' : ''}>${s.state === 'done' ? icon('check') : ''}<span>${s.name}</span></li>`
    )
    .join('');
  return `<ol class="a-fr-steps" aria-label="שלבי ההתחלה">${items}</ol><p class="a-fr-n">שלב ${l.n} מתוך ${l.of}</p>`;
}

// What the card shows now: the pass at its step, or the terms alone.
function cardHtml() {
  const pass = passOpen();
  // the terms come first, whatever step the mark says (a new TERMS_VERSION asks again in the middle of the pass): the mark is kept for the way on
  const step = pass && termsOk() ? currentStep() : 'start';
  const own = step !== 'start'; // step 1 is the gate's own question, with its own heading (until the card has its own: Task C)
  const foot =
    step === 'start'
      ? ''
      : `<div class="a-fr-foot"><div class="a-fr-btns"><button type="button" class="btn primary" data-act="frNext" data-k="frNext">המשך</button>
        <button type="button" class="btn ghost" data-act="frBack" data-k="frBack">${icon('chevron-right')}<span>חזרה</span></button></div>
        <p class="a-fr-legal">${LEGAL_SHORT}</p></div>`;
  ui.titleId = ui.frTitleId = own ? 'frTitle' : 'meTitle'; // frTitleId: ui-shell.js applyShell keeps it when it sets the title again (a resize)
  return `<section class="a-fr-card" aria-labelledby="${ui.titleId}" data-step="${step}">${pass ? stepsHtml(step) : ''}${
    own ? `<h2 id="frTitle" tabindex="-1">${HEAD[step]}</h2>` : ''
  }<div class="a-fr-body">${BODY[step]()}</div>${foot}</section>`;
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
function toStep(mark) {
  setFirstRun(mark);
  renderFirstRun();
  scrollTo(0, 0);
  shownTitle()?.focus({ preventScroll: true });
}
export function frNext() {
  if (!passOpen()) return refresh(); // another tab finished the pass: the card is stale, the board takes over
  const next = nextStep(currentStep(), app.state.profile.year ?? null);
  if (next !== 'done') return toStep(markOf(next));
  // the last step: the pass ends and the board takes over with its first search
  setFirstRun('done');
  markOnboarded();
  markEntered();
  refresh();
  shownTitle()?.focus();
}
export function frBack() {
  if (!passOpen()) return refresh();
  const prev = prevStep(currentStep(), app.state.profile.year ?? null);
  if (prev) toStep(markOf(prev));
}
