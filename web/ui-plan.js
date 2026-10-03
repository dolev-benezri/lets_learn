// Calendar-first UI (design-system/afeka-scheduler/pages/app.md v2): top bar, status page (#me), courses sidebar,
// preferences / friends / registration drawer, auto search in a worker. The week grid and popover live in ui-grid.js.
import { app, save, refresh, setRenderers, keepFocus, routeOf, applyHash } from './app.js';
import { readHash } from './share.js';
import { icon } from './ui-grid.js';
import { trapTab } from './ui-dialog.js';
import './ui-map.js';
import { popStale } from './ui-text.js';
import { PHONE, openDetails, onboarded, markOnboarded, gated, $, ui } from './ui-common.js';
import { scheduleRun } from './ui-search.js';
import { renderTop, renderBanner, renderView, scrollToDay, go } from './ui-view.js';
import { renderMe } from './ui-me.js';
import { renderDrawer } from './ui-drawer.js';
import { addFriend, ACT, CHG } from './ui-actions.js';

// Read at module load, before init() (awaiting the data) strips a friend or backup hash: a visit with a link is not a first visit.
let firstVisit = !onboarded() && !location.hash;

// The view follows the hash: #me shows the status page, anything else the builder (index.html #me / #layout).
// The top bar keeps only the title on #me (index.html [data-view="me"]): the alternatives and the plan actions belong to the builder.
function renderRoute() {
  const view = routeOf(location.hash), me = view === 'me', gate = !me && gated(); // the gate question takes the status page's container
  $('me').hidden = !me && !gate;
  $('layout').hidden = me || gate;
  document.body.dataset.view = view;
  document.title = `${me ? 'המצב שלי' : gate ? 'התחלה' : 'בניית מערכת'} · המערכת שלי · אפקה`; // a tab title per view (a11y)
  document.body.classList.toggle('gated', gate);
  if (!me && app.cls) markOnboarded(); // reaching the builder any way (tab, link, "סיימתי") ends the first-visit redirect
  for (const a of document.querySelectorAll('.views a')) if (a.dataset.view === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  if (app.cls) renderMe();
}
const focusView = () => $($('me').hidden ? 'weekTitle' : 'meTitle')?.focus({ preventScroll: true });
// Back/forward and the nav links switch views without a new search (a search would reset the shown alternative).
// A friend or backup link pasted into the open tab is applied like at load, then lands on the builder.
function onHash() {
  document.activeElement?.blur(); // commit a typed grade or Amirnet value (fires change) before #me is emptied
  if (!app.cls) { // loading: init() reads the hash when the data arrives; failed: the tabs switch views, both showing the error (app.js)
    if (app.loadFailed) { renderRoute(); scrollTo(0, 0); focusView(); }
    return;
  }
  if (/^#[fb]=/.test(location.hash)) { scrollTo(0, 0); applyHash().then(focusView); return; }
  if (routeOf(location.hash) !== document.body.dataset.view) { // builder overlays do not follow a view switch (focusView below keeps focus out of <body>)
    $('drawer').open && $('drawer').close();
    $('pop').matches(':popover-open') && $('pop').hidePopover();
  }
  renderRoute();
  scrollTo(0, 0);
  ui.dayScroll = true; // back on the builder: show the day's first lesson again (no-op while #me is shown)
  scrollToDay();
  focusView();
}

function renderAll() {
  if (firstVisit) { firstVisit = false; history.replaceState(null, '', '#me'); } // replace, not a new entry: Back must not bounce
  renderRoute();
  renderTop();
  renderBanner();
  renderView();
  if (ui.panel !== 'reg') renderDrawer();
  scheduleRun();
}

// ---------- wiring (static shell from index.html) ----------
document.querySelectorAll('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && !el.disabled && ACT[el.dataset.act]) ACT[el.dataset.act](el, e);
});
document.addEventListener('change', (e) => {
  const f = CHG[e.target.dataset.chg];
  if (!f) return;
  const shown = (el) => (el.checkVisibility ? el.checkVisibility() : !!el.offsetParent); // closed <details> use content-visibility
  const visibleCards = () => [...$('side').querySelectorAll('.course')].filter(shown);
  const idx = visibleCards().indexOf(e.target.closest('.course'));
  const how = f(e.target);
  if (how === 'view') keepFocus(renderView);
  else if (how === 'save') save();
  else if (how === 'quiet') { save(); scheduleRun(); } else refresh();
  // A card that moved into a collapsed section takes focus with it; land on the card now in its place instead.
  if (idx >= 0 && (document.activeElement === document.body || !shown(document.activeElement))) {
    const cards = visibleCards();
    (cards[Math.min(idx, cards.length - 1)]?.querySelector('input:checked') ?? $('side').querySelector('summary'))?.focus();
  }
});
document.addEventListener('input', (e) => { if (e.target.id === 'friendUrl') ui.friendUrl = e.target.value; }); // a drawer redraw keeps the typed link
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'addFriendForm') return;
  e.preventDefault();
  ui.friendUrl = $('friendUrl').value.trim();
  const r = await readHash(ui.friendUrl.includes('#') ? ui.friendUrl.slice(ui.friendUrl.indexOf('#')) : '', app.state);
  if (!r || r.error || r.type !== 'friend') { ui.friendMsg = r?.error ?? 'זה לא קישור חבר'; keepFocus(renderDrawer); return; }
  ui.friendMsg = ui.friendUrl = '';
  addFriend(r.payload);
});
document.addEventListener('toggle', (e) => {
  const k = e.target.dataset?.key;
  if (k) e.target.open ? openDetails.add(k) : openDetails.delete(k);
}, true);
document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog:modal:not(#drawer)')) return; // a confirm or the friend editor is on top (focus may sit on <body>)
  if (e.key === 'Escape' && $('drawer').open && !$('pop').matches(':popover-open')) { $('drawer').close(); return; }
  if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || !$('me').hidden || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable]') || $('drawer').contains(e.target) || $('pop').matches(':popover-open')) return;
  e.preventDefault();
  go(e.key === 'ArrowLeft' ? 1 : -1); // RTL: left = next
});
$('drawer').addEventListener('close', () => { ui.panel = null; document.body.classList.remove('drawer-open'); (ui.opener?.isConnected ? ui.opener : $('week')).focus({ preventScroll: true }); });
$('pop').addEventListener('toggle', (e) => {
  document.body.classList.toggle('pop-open', e.newState === 'open' && matchMedia(PHONE).matches);
  if (e.newState !== 'closed') return;
  const a = document.activeElement;
  if (!a || a === document.body || $('pop').contains(a)) document.querySelector(`[data-k="${CSS.escape($('pop').dataset.src ?? '')}"]`)?.focus({ preventScroll: true });
});
$('pop').addEventListener('keydown', (e) => { if (matchMedia(PHONE).matches) trapTab(e, $('pop')); }); // the phone sheet is not a modal dialog
// A popover survives small scrolls (reading it, nudging the page); it closes when its block has moved far or left the screen.
addEventListener('scroll', () => {
  const p = $('pop');
  if (!p.matches(':popover-open') || matchMedia(PHONE).matches) return;
  const b = document.querySelector(`[data-k="${CSS.escape(p.dataset.src ?? '')}"]`);
  if (popStale(Number(p.dataset.top), b ? b.getBoundingClientRect().top : null, innerHeight)) p.hidePopover();
}, { passive: true });
addEventListener('hashchange', onHash);
$('banner').setAttribute('aria-live', 'polite'); // static container, so the friend-landing banner inserted later is announced

setRenderers(renderAll);
if (app.data) refresh();
