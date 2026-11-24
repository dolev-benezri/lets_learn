// Design A's frame (docs/superpowers/plans/2026-11-21-design-a-adoption.md, Task 2): the week board always on screen, one tool open as a panel over it
// (a bottom sheet on a phone, a side column from 1080px), a dock of tools, build / improve as two tabs. Built once around the live containers: they are
// MOVED into the frame, never copied, so the renderers keep writing to their ids (#title, #meta, #switcher, #layout, #me, #courses, #prefs, #edit...).
// The route model is pure (shell-routes.js); this module is the DOM half. Everything here returns at once when design A is off.
import { app } from './app.js';
import { icon } from './ui-grid.js';
import { go } from './ui-view.js';
import { renderOut } from './ui-drawer.js';
import { goChanges } from './ui-edit.js';
import { renderMe } from './ui-me.js';
import { dropAdvisorPdf } from './ui-advisor-pdf.js';
import { $, ui, gated, termsOk, needsProgram, designOn, firstRunOn } from './ui-common.js';
import { viewOf, routeA, stageOf, panelOf, TOOLS, hashOfTool } from './shell-routes.js';
import { LEGAL_SHORT } from './ui-text.js';
import { sheetExpandHtml, sheetScrollY } from './phone-sheet.js';

export { designOn, viewOf, routeA, stageOf, panelOf, TOOLS };

const TOOL_PAGE = { me: 'me', courses: 'courses', wishes: 'prefs', friends: 'friends', out: 'out' };
const TITLE_ID = { me: 'meTitle', courses: 'coursesTitle', wishes: 'prefsTitle', friends: 'friendsPageTitle', out: 'outTitle' };
const LABEL = { me: 'המצב שלי', courses: 'קורסים', wishes: 'מה חשוב לי', friends: 'חברים', out: 'להוציא', mine: 'המערכת שלי', changes: 'שינויים' };
const DOCK_ICON = { me: 'user', courses: 'list', wishes: 'sliders', friends: 'users', out: 'upload', mine: 'calendar', changes: 'pencil' };
// from 1080px the tool is a column beside the board (the live SHEET query's inverse: the drawer keeps its semantics)
const wide = () => matchMedia('(min-width: 1080px)').matches;

// the tools of both modes, one button each (the record is in both); applyShell shows the ones of the mode
const dockHtml = () =>
  [...new Set([...TOOLS.build, ...TOOLS.improve])]
    .map(
      (t) => `<button type="button" class="dk" data-act="tool" data-tool="${t}" data-k="dock-${t}" aria-pressed="false">${icon(DOCK_ICON[t])}<span>${LABEL[t]}</span></button>`
    )
    .join('');

// From 1080px the semester tabs share the bar with the switcher, first in tab order; below it they keep a row of their own at the top of the board
// (sticky on a phone: style.css). The one node moves, so the renderer keeps writing to #semtabs.
function placeSemtabs() {
  const tabs = $('semtabs'), bar = $('aBar');
  if (!tabs || !bar) return;
  const had = document.activeElement; // a moved node loses the focus: the same control gets it back
  if (wide()) {
    if (tabs.parentElement !== bar) bar.prepend(tabs);
  } else if (tabs.parentElement === bar) $('weekTitle').after(tabs);
  if (had && tabs.contains(had) && document.activeElement !== had) had.focus({ preventScroll: true });
}

// The heights the sticky layout is made of, as they are on this machine (fractions kept): a font with other metrics makes the bar, the strip or the tabs
// taller than the CSS minimums, and a calc() built on constants then misses by those pixels (the page grew two pixels past the window on CI).
//   --a-chrome: the bottom of the strip (a locked sheet starts under it), --a-top-h and --a-strip-h: what sticks under the bar from 1080px (--a-head),
//   --a-rec-off: where the board's cell starts in the stage, which is where improve mode's record panel starts (design-a.css .record-open)
function measureChrome() {
  const bar = document.querySelector('.a-top'), strip = $('aStrip'), stage = document.querySelector('.a-stage'), board = $('aBoard');
  if (!bar || !strip || !stage || !board) return;
  const root = document.documentElement.style;
  root.setProperty('--a-chrome', `${Math.ceil(strip.getBoundingClientRect().bottom + scrollY) + 6}px`);
  root.setProperty('--a-top-h', `${bar.getBoundingClientRect().height}px`);
  root.setProperty('--a-strip-h', `${strip.getBoundingClientRect().height}px`);
  root.setProperty('--a-rec-off', `${board.getBoundingClientRect().top - stage.getBoundingClientRect().top}px`);
}

let built = false;
export function shellInit() {
  if (built || !designOn()) return;
  built = true;
  const shell = document.createElement('div');
  shell.id = 'ashell';
  shell.className = 'a-shell';
  shell.innerHTML = `<header class="a-top">
      <div class="a-brand"><span class="a-mark" aria-hidden="true"></span></div>
      <nav class="modes" aria-label="מה עושים">
        <a href="#" data-act="mode" data-mode="build" data-k="tab-build">${icon('calendar')}<span>מערכת חדשה</span></a>
        <a href="#edit" data-act="mode" data-mode="edit" data-k="tab-edit">${icon('pencil')}<span>שיפור מערכת קיימת</span></a>
      </nav>
      <div class="a-top-act" id="aTopAct"></div>
    </header>
    <div class="a-strip" id="aStrip"><p class="a-unofficial">${icon('info')}<span class="a-uno-t">${LEGAL_SHORT}<span id="aStale" hidden></span> · <button
      type="button" class="a-uno-more" data-act="panel" data-panel="info" data-k="aUnoMore" aria-haspopup="dialog">פרטים</button></span></p></div>
    <div class="a-fr" id="firstRun" hidden></div>
    <div class="a-stage">
      <div class="a-board" id="aBoard">
        <div class="a-bar" id="aBar"><button type="button" class="btn a-share" data-act="share" data-k="aShare">${icon('share')}<span>שתף</span></button></div>
      </div>
      <aside class="a-alts" id="alts" aria-label="חלופות" hidden></aside>
      <nav class="dock" aria-label="כלים">${dockHtml()}</nav>
      <button type="button" class="a-scrim" data-act="closeTool" tabindex="-1" aria-hidden="true"></button>
      <section class="a-panel" id="panel" hidden>
        <div class="a-ph"><button type="button" class="btn icon-btn ghost" data-act="closeTool" data-k="closeTool" aria-label="סגירה">${icon('x')}</button>
          ${sheetExpandHtml('panel')}
          <button type="button" class="btn ghost a-back" data-act="closeTool" data-k="closeBack">${icon('chevron-right')}<span>חזרה</span></button></div>
        <div class="a-pb" id="aPb"></div>
      </section>
    </div>`;
  document.querySelector('.skip').after(shell);
  // the live nodes move in: the title, the notices, the alternatives switcher, the board and the edit page, the two header buttons (the data line #meta
  // stays in the classic header: the strip's #aStale says the one thing about it that matters)
  shell.querySelector('.a-brand').append($('title'));
  $('aStrip').append($('notice'));
  $('aBar').prepend($('switcher'));
  $('aBoard').append($('layout'), $('edit'));
  placeSemtabs();
  $('aTopAct').append(document.querySelector('.theme-btn'), document.querySelector('.menu-btn'));
  for (const id of Object.values(TOOL_PAGE)) $('aPb').append($(id));
  document.addEventListener('keydown', onKey);
  // A direct link may open the sheet before the worker draws the first week. Retry only when that week changes.
  new MutationObserver(() => { if (pendingPhoneScroll) queuePhoneScroll(); }).observe($('aBoard'), { childList: true, subtree: true });
  // a tap outside the alternatives column laid over the week closes it (the tap itself still does what it does)
  document.addEventListener('pointerdown', (e) => ui.altsOver && !e.target.closest?.('#alts') && dispatchEvent(new CustomEvent('a-alts-close')), true);
  addEventListener('a-edit-sheet', () => applyShell()); // ui-edit.js closed the sheet itself
  // a swipe on the week moves between alternatives, as the arrows do (a touch or a pen; the same direction as the arrow keys in a right-to-left page)
  // One finger only (a second one is a pinch), dropped when the address changes (a tool opened mid-gesture), and never over the details popover or a
  // dialog, as the arrow keys are not (ui-plan.js).
  let from = null;
  const drop = () => (from = null);
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    from = !from && e.target.closest?.('#week') ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
  });
  document.addEventListener('pointercancel', drop);
  addEventListener('hashchange', drop);
  document.addEventListener('pointerup', (e) => {
    const g = from;
    if (!g || e.pointerId !== g.id) return;
    from = null;
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50 && !$('layout').hidden && !overlayOpen()) go(dx < 0 ? 1 : -1);
  });
  // a locked sheet (the gate) must leave the title, the mode tabs and the unofficial line above it: its top follows the bottom of the notice strip
  const watch = new ResizeObserver(measureChrome);
  watch.observe(document.querySelector('.a-top'));
  watch.observe($('aStrip'));
  watch.observe(document.querySelector('.a-stage > .dock'));
  measureChrome();
  matchMedia('(max-width: 599px)').addEventListener('change', () => {
    const had = document.activeElement;
    applyShell();
    if (had?.matches('.a-sheet-expand') && !had.checkVisibility()) {
      const h = $(ui.titleId);
      h?.focus({ preventScroll: true });
      h?.scrollIntoView({ block: 'nearest' }); // the panel may be scrolled past its heading
    }
  });
  matchMedia('(min-width: 1080px)').addEventListener('change', () => {
    // crossing 1080px shows or hides the panel: focus that was inside what is now hidden goes to the heading of what is shown
    const had = document.activeElement;
    placeSemtabs();
    applyShell();
    if (had?.closest?.('#alts') && !had.checkVisibility?.()) {
      // the alternatives column is gone below 1080px: the switcher's arrow is where the alternatives are now
      ([$('next'), $('prev')].find((b) => b && !b.disabled && b.checkVisibility?.()) ?? $('switcher'))?.focus({ preventScroll: true });
    } else if (had && had !== document.body && !had.checkVisibility?.()) {
      // the heading of what is shown, or (a closed sheet) the dock button of the screen
      const h = $(ui.titleId);
      (h?.checkVisibility?.() ? h : document.querySelector('.dock .dk[aria-pressed="true"]:not([hidden])') ?? document.querySelector('.dock .dk:not([hidden])'))
        ?.focus({ preventScroll: true });
    }
  });
}

let phoneSheetKey = null, pendingPhoneScroll = false, phoneScrollFrame = null;
function queuePhoneScroll() {
  if (phoneScrollFrame !== null) return;
  phoneScrollFrame = requestAnimationFrame(() => {
    phoneScrollFrame = null;
    if (!pendingPhoneScroll || !phoneSheetKey || !matchMedia('(max-width: 599px)').matches) return;
    const improve = routeA(location.hash).mode === 'improve';
    const sheet = phoneSheetKey.startsWith('panel:') ? $('panel') : document.querySelector('.edit-tool');
    const rows = [...document.querySelectorAll(improve ? '#editWeek .blk' : '#week .blk')]
      .map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    if (!sheet || !rows.length) return;
    const first = Math.min(...rows.map((r) => r.top));
    let chrome = Math.max(0, document.querySelector('.a-top').getBoundingClientRect().bottom);
    // Build's sticky semester/day rows can cover a lesson even after the top bar has scrolled away.
    for (const el of document.querySelectorAll(improve ? '#editDays' : '#semtabs, #daysel')) {
      const style = getComputedStyle(el);
      if (style.position === 'sticky' && el.getClientRects().length)
        chrome = Math.max(chrome, (parseFloat(style.top) || 0) + el.getBoundingClientRect().height);
    }
    // on the root, not on the sheet: the improve page redraws .edit-tool on every change, and the value must outlive it
    document.documentElement.style.setProperty('--a-preview-top', `${chrome}px`);
    scrollTo({ top: sheetScrollY(scrollY, first, chrome, sheet.getBoundingClientRect().top), behavior: 'instant' });
    pendingPhoneScroll = false;
  });
}

function syncPhoneSheet(improve, panel, lock) {
  const key = matchMedia('(max-width: 599px)').matches && !lock
    ? panel ? `panel:${improve}:${panel}` : improve && ui.editSheet !== false && document.querySelector('.edit-stage')
      ? `edit:${routeA(location.hash).tool}` : null
    : null;
  if (key !== phoneSheetKey) {
    phoneSheetKey = key;
    ui.sheetExpanded.panel = ui.sheetExpanded.edit = false;
    pendingPhoneScroll = !!key;
  }
  for (const kind of ['panel', 'edit']) {
    const sheet = kind === 'panel' ? $('panel') : document.querySelector('.edit-tool');
    sheet?.setAttribute('data-expanded', String(ui.sheetExpanded[kind]));
    const button = sheet?.querySelector('.a-sheet-expand');
    if (button) {
      const label = ui.sheetExpanded[kind] ? 'הקטנה' : 'הגדלה';
      button.setAttribute('aria-expanded', String(ui.sheetExpanded[kind]));
      button.setAttribute('aria-label', label);
      button.lastElementChild.textContent = label;
      button.hidden = !!lock;
    }
  }
  if (pendingPhoneScroll) queuePhoneScroll();
}

export function expandPhoneSheet(button) {
  if (!designOn() || !matchMedia('(max-width: 599px)').matches || !phoneSheetKey) return;
  const kind = button.dataset.sheet === 'edit' ? 'edit' : 'panel';
  ui.sheetExpanded[kind] = !ui.sheetExpanded[kind];
  applyShell();
  // WebKit does not focus a tapped button. Keep the live control focused for the way back.
  button.focus({ preventScroll: true });
  if (!ui.sheetExpanded[kind]) {
    pendingPhoneScroll = true;
    queuePhoneScroll();
  }
}

// Locked: the data did not load, or (build mode) the gate (terms, track, year) is not passed; then only the record is open.
export const locked = () => !!app.loadFailed || (!!app.state && gated());

// Shows what the address says: the stage (the board or the edit page) and the one tool panel. Called by renderRoute under A, and on a resize across
// 1080px. Returns the open tool or null.
export function applyShell() {
  const route = routeA(location.hash);
  const w = wide();
  const improve = route.mode === 'improve';
  if (!improve) ui.overlay = null; // the record over the edit page does not outlive it
  if (improve) {
    ui.altsOver = false; // the alternatives column over the week belongs to the board: not left open behind the edit page
    $('alts')?.classList.remove('alts-over');
  }
  if (improve && ui.lastStep !== route.tool) ui.editSheet = true; // a step shows its tool
  ui.lastStep = improve ? route.tool : null;
  const panel = panelOf(route, { wide: w, program: !needsProgram(), gated: !!app.state && gated(), termsOk: termsOk(), overlay: ui.overlay });
  const stage = stageOf(route);
  $('layout').hidden = stage !== 'board';
  $('edit').hidden = stage !== 'edit';
  for (const [tool, id] of Object.entries(TOOL_PAGE)) $(id).hidden = tool !== panel;
  const box = $('panel');
  box.hidden = !panel;
  box.setAttribute('role', w ? 'region' : 'dialog'); // a column on a wide screen, a (non-modal) sheet on a phone
  w ? box.removeAttribute('aria-modal') : box.setAttribute('aria-modal', 'false'); // aria-modal is only allowed on a dialog
  panel ? box.setAttribute('aria-labelledby', TITLE_ID[panel]) : box.removeAttribute('aria-labelledby');
  ui.titleId = panel ? TITLE_ID[panel] : stage === 'edit' ? 'editTitle' : 'weekTitle';
  if (firstRunOn()) ui.titleId = ui.frTitleId ?? 'frTitle'; // the first-run card covers the screen: its heading is the one to focus
  const broken = !!app.loadFailed, // the data did not load: not even the record can open
    lock = improve ? !termsOk() || broken : locked(); // improve asks for the terms only, and the track and year inside its own page
  const shownTools = TOOLS[improve ? 'improve' : 'build'];
  for (const b of document.querySelectorAll('.dock .dk')) {
    const tool = b.dataset.tool;
    b.hidden = !shownTools.includes(tool);
    const step = route.tool === 'changes' ? 'changes' : 'mine'; // improve: the screen shown (pressed only while its tool is open on a phone)
    // only the screen shown is pressed: with the record open it is the record's button, not the step's under it
    const pressed = improve && (tool === 'mine' || tool === 'changes') ? tool === step && !ui.overlay && (w || ui.editSheet !== false) : tool === panel;
    b.setAttribute('aria-pressed', String(pressed));
    const off = broken || (lock && tool !== 'me') || (improve && tool === 'me' && (!app.state || locked()));
    off ? b.setAttribute('aria-disabled', 'true') : b.removeAttribute('aria-disabled');
  }
  document.querySelector('.edit-stage')?.setAttribute('data-sheet', ui.editSheet === false ? 'closed' : 'open');
  const board = document.querySelector('.edit-board');
  if (board) board.inert = !w && ui.editSheet !== false; // a phone's open sheet covers the week: not reachable under it
  for (const a of document.querySelectorAll('.a-top .modes a'))
    (a.dataset.mode === 'edit') === (route.mode === 'improve') ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
  for (const b of document.querySelectorAll('#panel [data-act="closeTool"], .a-scrim')) b.hidden = lock && !!panel;
  document.body.classList.toggle('a-panel-open', !!panel);
  // improve mode: the record takes the tool column's place (state, not DOM removal: a redraw of the tool does not bring the tool back over it)
  document.querySelector('.a-stage')?.classList.toggle('record-open', improve && panel === 'me'); // the record, opened or the improve page's own terms gate
  measureChrome(); // the board's cell moved down (or up) in the stage
  // while the gate (terms, track, year) is open nothing behind it can be used: the board is inert (and the skip link goes to the gate).
  // A failed load is not a gate: the board holds a retry button of its own, which has to stay pressable.
  $('aBoard').inert = !!panel && (improve ? !termsOk() : lock && !broken);
  // a tool opened after another one starts at its top (the document keeps the board's scroll)
  const before = ui.shownTool;
  if (panel !== before) $('aPb').scrollTop = 0;
  ui.shownTool = panel;
  // every exit from the take-out tool: another tool, Back, closing the sheet, the other mode; and a failed load, which replaces the tool's content
  if ((before === 'out' && panel !== 'out') || broken) dropAdvisorPdf();
  if (panel === 'out' && before !== 'out' && !app.loadFailed) renderOut(); // later changes reach it through renderView
  syncPhoneSheet(improve, panel, lock);
  return panel;
}

const panelOpen = () => !$('panel').hidden;
// Nothing covers the board: no tool is open on a phone; a wide screen always has one beside the board, which only the record (an unfinished first run) is not
export const boardClear = () => !panelOpen() || (wide() && ui.shownTool !== 'me');

// Why the address changed: the shell says so when it did it ('open', 'close'); anything else is a Back or a link, and is read once.
export const navReason = () => {
  const r = ui.nav ?? 'back';
  ui.nav = null;
  return r;
};

// Focus after a route change has one owner. Opening, Back and a link focus the heading of what is shown; closing returns to the dock button.
export function routeFocus(reason) {
  const opener = ui.toolOpener;
  if (reason === 'close' && opener?.isConnected && !opener.hasAttribute('aria-disabled')) {
    opener.focus({ preventScroll: true });
    return;
  }
  $(ui.titleId)?.focus({ preventScroll: true });
}
// Scroll after a route change: phone sheets reveal the first lesson after layout (syncPhoneSheet).
export function routeScroll(reason) {
  if (reason === 'link') scrollTo(0, 0);
}

// A dock tap: a build tool sets the address (a history entry, so Back closes it). On a phone the open tool's own button closes it.
// Improve mode's dock: a step button goes to its screen, or opens and closes the sheet when it is the screen shown (a phone); the record is an overlay.
export function openImprove(name, opener) {
  if (!termsOk() || app.loadFailed || !app.state) return;
  ui.toolOpener = opener ?? null;
  if (name === 'me') {
    if (locked()) return;
    ui.overlay = ui.overlay === 'me' ? null : 'me';
    applyShell();
    if (ui.overlay) renderMe(); // improve mode draws no record of its own, and the page draws only what is not hidden
    routeFocus(ui.overlay ? 'open' : 'close');
    return;
  }
  const here = routeA(location.hash).tool === 'changes' ? 'changes' : 'mine';
  if (name === here) {
    if (wide() || !document.querySelector('#edit .edit-stage')) routeFocus('open'); // no stage, no sheet to fold: the empty card is inline
    else toggleEditSheet();
    return;
  }
  ui.overlay = null;
  ui.editSheet = true;
  if (name === 'changes') {
    goChanges(); // the screen, or its reason for staying on this one (in the open tool)
    applyShell();
  } else {
    ui.nav = 'open';
    location.hash = '#edit';
  }
}

// the phone's sheet over the week: open, or closed to see and press the week (no address: it is in-memory, like every overlay of improve mode)
export function toggleEditSheet() {
  ui.editSheet = ui.editSheet === false;
  applyShell();
  if (ui.editSheet) $('editTitle')?.focus({ preventScroll: true });
  else document.querySelector(`.dock [data-tool="${routeA(location.hash).tool === 'changes' ? 'changes' : 'mine'}"]`)?.focus({ preventScroll: true });
}

export function openTool(name, opener) {
  if (routeA(location.hash).mode === 'improve') return openImprove(name, opener);
  if (!TOOLS.build.includes(name) || app.loadFailed || (locked() && name !== 'me')) return;
  ui.toolOpener = opener ?? null;
  const h = hashOfTool(name);
  if (location.hash === h) {
    if (wide()) routeFocus('open');
    else closeTool();
    return;
  }
  ui.nav = 'open';
  location.hash = h;
}

// Closes a phone sheet: the address goes back to the board's (the query stays), and the same renderers run as for any address change.
export function closeTool() {
  if (ui.overlay && routeA(location.hash).mode === 'improve' && panelOpen()) {
    ui.overlay = null; // the record over the edit page
    applyShell();
    routeFocus('close');
    return;
  }
  if (!panelOpen() || wide() || locked()) return;
  ui.nav = 'close';
  history.replaceState(null, '', location.pathname + location.search);
  dispatchEvent(new Event('hashchange'));
}

const overlayOpen = () => !!document.querySelector('dialog[open]') || !!$('pop')?.matches(':popover-open');

function onKey(e) {
  if (e.key !== 'Escape' || e.defaultPrevented || overlayOpen()) return;
  if (ui.altsOver && !$('alts').hidden) {
    e.preventDefault(); // the alternatives column over the week (below 1440px) closes first
    dispatchEvent(new CustomEvent('a-alts-close', { detail: { focus: true } }));
    return;
  }
  const improve = routeA(location.hash).mode === 'improve';
  if (improve && ui.overlay && panelOpen()) {
    e.preventDefault(); // the record over the edit page closes by Escape at every width
    closeTool();
    return;
  }
  if (improve && !wide() && !panelOpen() && ui.editSheet !== false && document.querySelector('.edit-stage')) {
    e.preventDefault(); // so does a phone's edit sheet over the week
    toggleEditSheet();
    return;
  }
  if (wide() || !panelOpen()) return;
  e.preventDefault();
  closeTool();
}
