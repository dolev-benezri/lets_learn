// Calendar-first UI (design-system/afeka-scheduler/pages/app.md v2): top bar, four step pages (#me, #courses, #prefs, the plans),
// the registration drawer, auto search in a worker. The week grid and popover live in ui-grid.js.
import { app, save, refresh, setRenderers, keepFocus, STEPS, routeOf, isEditHash, applyHash, watchOtherTabs } from './app.js';
import { readHash } from './share.js';
import { icon } from './ui-grid.js';
import { trapTab, askConfirm } from './ui-dialog.js';
import { retakeNotice } from './rules.js';
import './ui-map.js';
import { popStale, PAGE_NAME } from './ui-text.js';
import {
  PHONE, PAGE, shownTitle, openDetails, onboarded, entered, markOnboarded, gated, termsOk, heb, $, ui, designOn, altsOpen, altsOverlay, setAltsOpen
} from './ui-common.js';
import { scheduleRun, cancelRun } from './ui-search.js';
import { renderEdit, stopSearch, syncSavedHint } from './ui-edit.js';
import { needsModeChoice, modeOpen, renderModeChoice, getMode, setMode } from './ui-mode.js';
import { renderTop, renderReport, renderBanner, renderNotice, renderView, scrollToDay, go, showAlt, hasAlternatives, renderAltColumn } from './ui-view.js';
import { renderMe } from './ui-me.js';
import { renderFirstRun } from './ui-first-run.js';
import { renderPrefs } from './ui-drawer.js';
import { dropAdvisorPdf } from './ui-advisor-pdf.js';
import { addFriend, ACT, CHG } from './ui-actions.js';
import { tourCheck, tourOnce, introPending, shellPending, onTourEnd } from './tour.js';
import { shellInit, applyShell, openTool, closeTool, routeFocus, routeScroll, navReason, viewOf, boardClear, toggleEditSheet } from './ui-shell.js';

// Read at module load, before init() (awaiting the data) strips a friend or backup hash: a visit with a link is not a first visit.
// A: someone who already made the entry choice ("מאיפה מתחילים") is not on a first visit, even if they never left step 1: they open on the week
let firstVisit = !onboarded() && !(designOn() && entered()) && !location.hash;
// The remembered mode: a visit with no link opens the edit page (spec "The mode choice"); any link (#me, #edit, #f=, #b=) wins.
if (!location.hash && getMode() === 'edit') history.replaceState(null, '', '#edit');
// design A (web/design.js): the frame is built around the live containers before anything is drawn into them
if (designOn()) shellInit();

// The step follows the hash (app.js routeOf): one page shown at a time (index.html #me, #courses, #prefs, #layout).
// The top bar keeps only the title off the plans (style.css [data-view]): the alternatives and the plan actions belong to step 4.
function renderRoute() {
  const A = designOn(),
    view = A ? viewOf(location.hash) : routeOf(location.hash),
    // the gate question takes the status page's container; the edit page asks for the terms only (it asks track and year itself); A has no
    // mode-choice screen: its two tabs are the choice
    choice = !A && view !== 'edit' && needsModeChoice(),
    gate = view === 'edit' ? !termsOk() : gated() || choice;
  if (A) applyShell(); // the stage and the one tool panel, from the address (ui-shell.js)
  else {
    const page = PAGE[gate ? 'me' : view][0];
    for (const [p] of Object.values(PAGE)) $(p).hidden = p !== page;
  }
  document.body.dataset.view = view;
  document.title = `${gate ? 'התחלה' : PAGE_NAME[view]} · המערכת שלי · אפקה`; // a tab title per step (a11y)
  document.body.classList.toggle('gated', gate);
  // leaving step 1 any way (step bar, link, "הבא") ends the first-visit redirect
  if (view !== 'me' && view !== 'edit' && app.cls && !gate) {
    markOnboarded();
    retakeNote();
  }
  const at = STEPS.indexOf(gate ? 'me' : view); // the gate question is step 1: nothing is done yet
  for (const a of document.querySelectorAll('.steps a')) {
    const k = STEPS.indexOf(a.dataset.view);
    if (k === at) a.setAttribute('aria-current', 'step');
    else a.removeAttribute('aria-current');
  }
  if (app.cls) {
    if (choice) renderModeChoice();
    else renderMe();
    renderReport();
  }
  if (A) renderFirstRun(); // the first-run card: the terms and the pass cover the screen (after applyShell: it sets the focus target)
}
// Building the plan after marking a failure: one note per failed course, ever (until it is passed and failed again).
function retakeNote() {
  const { seen, text } = retakeNotice(app.data, app.cls, app.state, heb);
  if (seen.join() === app.state.retakeSeen.join()) return;
  app.state.retakeSeen = seen; // before the dialog: a second render while it is open shows nothing new
  save();
  if (text) askConfirm(text, { ok: 'הבנתי', cancel: null });
}
const focusView = () => shownTitle()?.focus({ preventScroll: true });
// Where the page goes after a route change. Classic resets the scroll and focuses the page's heading; A keeps the board where it was and has the
// shell focus the tool's heading, or the dock button that opened a tool that was just closed (one owner for focus and scroll, ui-shell.js).
const settle = (reason) => {
  if (designOn()) {
    routeScroll(reason);
    routeFocus(reason);
  } else {
    scrollTo(0, 0);
    focusView();
  }
};
// builder overlays do not follow a view switch
const closeOverlays = () => {
  if (designOn() && $('drawer').open) ui.noDrawerFocus = true; // A: the navigation focuses the new tool, so the drawer's close event must not
  $('drawer').open && $('drawer').close();
  $('pop').matches(':popover-open') && $('pop').hidePopover();
};
// Back/forward and the nav links switch views without a new search (a search would reset the shown alternative).
// A friend or backup link pasted into the open tab is applied like at load, then lands on the builder.
function onHash() {
  document.activeElement?.blur(); // commit a typed grade or Amirnet value (fires change) before #me is emptied
  const reason = designOn() ? navReason() : 'back'; // why the address changed (A only: the shell's own open and close)
  if (!app.cls) {
    // loading: init() reads the hash when the data arrives; failed: the step bar switches pages, each showing the error (app.js)
    if (app.loadFailed) {
      renderRoute();
      settle(reason);
    }
    return;
  }
  if (isEditHash(location.hash)) {
    closeOverlays();
    cancelRun();
    renderRoute();
    if (designOn()) renderTop(); // the title and the data line belong to both modes
    renderEdit();
    if (designOn()) applyShell();
    settle(reason);
    return;
  }
  stopSearch(); // any way off the edit page (a pasted friend or backup link too) stops its search
  if (/^#[fb]=/.test(location.hash)) {
    scrollTo(0, 0);
    applyHash().then(focusView);
    return;
  }
  if (document.body.dataset.view === 'edit') {
    // back from the edit page: the build page was never drawn there and its search was stopped
    setMode('build'); // the mode in use is the one remembered, so a reload here stays on the build page
    closeOverlays();
    renderAll();
    settle(reason);
    return;
  }
  if ((designOn() ? viewOf : routeOf)(location.hash) !== document.body.dataset.view) {
    closeOverlays(); // focusView below keeps focus out of <body>
  }
  renderRoute();
  if (designOn()) settle(reason);
  else {
    scrollTo(0, 0);
    ui.dayScroll = true; // back on the builder: show the day's first lesson again (no-op while #me is shown)
    scrollToDay();
    focusView();
  }
  // the results came while another step was open: arriving at step 4 is the first time it shows one
  whatsNew();
  if (hasAlternatives() && !$('layout').hidden) ui.onResult();
}

function renderAll() {
  if (isEditHash(location.hash)) {
    cancelRun();
    renderRoute();
    renderNotice(); // the site notice, a failed save and another tab's copy: every page, not only the build page's banner
    if (designOn()) renderTop(); // the title and the data line belong to both modes
    renderEdit();
    if (designOn()) applyShell(); // the page may have sent #edit/changes back to #edit: the dock and the sheet follow the step shown
    if (designOn() && ui.overlay === 'me') renderMe(); // the record over the edit page follows what is changed in it
    return;
  }
  if (firstVisit && (!modeOpen() || designOn())) {
    firstVisit = false;
    history.replaceState(null, '', '#me');
  } // replace, not a new entry: Back must not bounce
  renderRoute();
  renderTop();
  renderBanner();
  renderView();
  renderPrefs();
  scheduleRun();
  tourCheck(!gated(), shownTitle); // the intro of a first visit, once the gate is done (classic: and the step bar is on screen)
  whatsNew();
}
// renderView, and a route change that leaves results behind: the first alternative on screen. A: not before the intro is done, and not behind a tool
// that covers the board (the board is always there, so "step 4 shows" no longer means anything)
const plansOk = () => !(designOn() && (introPending() || shellPending() || !boardClear()));
ui.onResult = () => plansOk() && tourOnce('plans', shownTitle, plansOk);
// A: "what's new", once, for someone who knew the old design: when the gate is done and nothing covers the board
// (a loaded build route: not the edit page, which has no "out" tool to show, and not an error screen)
const shellOk = () => designOn() && shellPending() && !gated() && boardClear() && !app.loadFailed && !isEditHash(location.hash);
const whatsNew = () => shellOk() && tourOnce('shell', shownTitle, shellOk);
// A: any dialog closing may have been what a tour was waiting for (the retake note, a restore question, the menu)
document.addEventListener('close', () => designOn() && setTimeout(() => askToursAgain()), true);
// A: the plans part was refused (a dialog, the intro running) and nothing else will ask again: do it when the obstacle goes
const askToursAgain = () => designOn() && (whatsNew() || (hasAlternatives() && !$('layout').hidden && ui.onResult()));
onTourEnd(askToursAgain);

// ---------- wiring (static shell from index.html) ----------
watchOtherTabs();
app.onSaveChange = () => {
  if (!app.data) return;
  renderNotice();
  syncSavedHint();
};
document.querySelectorAll('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && !el.disabled && ACT[el.dataset.act]) ACT[el.dataset.act](el, e);
});
document.addEventListener('change', async (e) => {
  const f = CHG[e.target.dataset.chg];
  if (!f) return;
  // closed <details> use content-visibility
  const shown = (el) => (el.checkVisibility ? el.checkVisibility() : !!el.offsetParent);
  const visibleCards = () => [...$('side').querySelectorAll('.course')].filter(shown);
  const idx = visibleCards().indexOf(e.target.closest('.course'));
  let how = f(e.target);
  if (how?.then) how = await how; // CHG.split waits for its confirm dialog
  if (how === 'none') return; // nothing to redraw (the gate's tick only enables its button)
  if (how === 'view') keepFocus(renderView);
  else if (how === 'save') save();
  else if (how === 'quiet') {
    save();
    scheduleRun();
  } else refresh();
  // A card that moved into a collapsed section takes focus with it; land on the card now in its place instead.
  if (idx >= 0 && (document.activeElement === document.body || !shown(document.activeElement))) {
    const cards = visibleCards();
    (
      cards[Math.min(idx, cards.length - 1)]?.querySelector('input:checked') ?? $('side').querySelector('summary')
    )?.focus();
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'friendUrl') ui.friendUrl = e.target.value;
}); // a page redraw keeps the typed link
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'addFriendForm') return;
  e.preventDefault();
  ui.friendUrl = $('friendUrl').value.trim();
  const r = await readHash(ui.friendUrl.includes('#') ? ui.friendUrl.slice(ui.friendUrl.indexOf('#')) : '', app.state);
  if (!r || r.error || r.type !== 'friend') {
    ui.friendMsg = r?.error ?? 'זה לא קישור חבר';
    keepFocus(renderPrefs);
    return;
  }
  ui.friendMsg = ui.friendUrl = '';
  addFriend(r.payload);
});
document.addEventListener(
  'toggle',
  (e) => {
    const k = e.target.dataset?.key;
    if (k) e.target.open ? openDetails.add(k) : openDetails.delete(k);
  },
  true
);
document.addEventListener('keydown', (e) => {
  // a confirm or the friend editor is on top (focus may sit on <body>)
  if (document.querySelector('dialog:modal:not(#drawer)')) return;
  if (e.key === 'Escape' && $('drawer').open && !$('pop').matches(':popover-open')) {
    $('drawer').close();
    return;
  }
  if (
    (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') ||
    $('layout').hidden ||
    e.altKey ||
    e.ctrlKey ||
    e.metaKey ||
    e.shiftKey
  )
    return;
  if (
    // tabindex=0: a scrollable region the keyboard reaches (#pills), where the arrows scroll
    e.target.closest?.('input, textarea, select, [contenteditable], [tabindex="0"]') ||
    $('drawer').contains(e.target) ||
    $('pop').matches(':popover-open')
  )
    return;
  e.preventDefault();
  go(e.key === 'ArrowLeft' ? 1 : -1); // RTL: left = next
});
$('drawer').addEventListener('close', () => {
  ui.panel = null;
  if (!designOn()) dropAdvisorPdf(); // A: the take-out tool owns the file (ui-shell.js applyShell)
  document.body.classList.remove('drawer-open');
  setTimeout(askToursAgain);
  if (ui.noDrawerFocus) {
    ui.noDrawerFocus = false; // a navigation closed it (A): the new tool has the focus
    return;
  }
  (ui.opener?.isConnected ? ui.opener : $('week')).focus({ preventScroll: true });
});
$('pop').addEventListener('toggle', (e) => {
  document.body.classList.toggle('pop-open', e.newState === 'open' && matchMedia(PHONE).matches);
  if (e.newState !== 'closed') return;
  const a = document.activeElement;
  if (!a || a === document.body || $('pop').contains(a))
    document.querySelector(`[data-k="${CSS.escape($('pop').dataset.src ?? '')}"]`)?.focus({ preventScroll: true });
});
$('pop').addEventListener('keydown', (e) => {
  if (matchMedia(PHONE).matches) trapTab(e, $('pop'));
}); // the phone sheet is not a modal dialog
// A popover survives small scrolls (reading it, nudging the page); it closes when its block has moved far or left the screen.
addEventListener(
  'scroll',
  () => {
    const p = $('pop');
    if (!p.matches(':popover-open') || matchMedia(PHONE).matches) return;
    const b = document.querySelector(`[data-k="${CSS.escape(p.dataset.src ?? '')}"]`);
    if (popStale(Number(p.dataset.top), b ? b.getBoundingClientRect().top : null, innerHeight)) p.hidePopover();
  },
  { passive: true }
);
ACT.tool = (el) => openTool(el.dataset.tool, el); // design A's dock (ui-shell.js)
ACT.closeTool = () => closeTool();
ACT.editSheet = () => toggleEditSheet(); // the phone's sheet over the improve week
// a card of A's alternatives column (ui-view.js renderAltColumn). WebKit does not focus a clicked button: take focus so keepFocus finds the twin card
ACT.altPick = (el) => {
  el.focus({ preventScroll: true });
  showAlt(Number(el.dataset.i));
};
// the alternatives column folds to a rail and opens again (the choice is kept); the button keeps the focus (WebKit does not focus a clicked button)
ACT.altsFold = (el) => {
  el.focus({ preventScroll: true });
  if (altsOverlay()) ui.altsOver = !ui.altsOver; // over the week: for this visit only
  else setAltsOpen(!altsOpen());
  keepFocus(renderAltColumn);
};
// Escape or a tap outside closes the overlay; focus goes back to the rail's button (a tap outside only when the focus was inside the column)
addEventListener('a-alts-close', (e) => {
  if (!ui.altsOver) return;
  const was = $('alts')?.contains(document.activeElement);
  ui.altsOver = false;
  keepFocus(renderAltColumn);
  if (was || e.detail?.focus) $('alts')?.querySelector('[data-k="alts-fold"]')?.focus({ preventScroll: true });
});
// crossing 1080px or 1440px changes what "open" means: the overlay does not carry over
for (const q of ['(min-width: 1080px)', '(min-width: 1440px)'])
  globalThis.matchMedia?.(q).addEventListener('change', () => {
    ui.altsOver = false;
    if (designOn()) keepFocus(renderAltColumn);
  });
addEventListener('hashchange', onHash);
// static container, so the friend-landing banner inserted later is announced
$('banner').setAttribute('aria-live', 'polite');

setRenderers(renderAll);
if (app.data) refresh();
