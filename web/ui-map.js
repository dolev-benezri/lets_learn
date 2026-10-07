// Interactive progress map ("הראה התקדמות"): every course and its prerequisites as a neural-network style graph (round nodes, curved edges),
// arranged by study year (one band per year, right to left, two semester columns each, electives last) and coloured by the student's real status
// (app.cls.statuses, from rules.js). Layout and geometry are pure functions so they can be unit-tested.
import { app, esc, keepFocus, summerScope } from './app.js';
import { icon, resCourses } from './ui-grid.js';
import { ui, current, colors } from './ui-common.js';
import { showAlt } from './ui-view.js';
import { courseCount } from './ui-text.js';
import { unlockCounts } from './solver-core.js';
import { studyYear } from './rules.js';
import { makeKeep, asideIds, layoutMap, chainOf, isDone, progressInfo, newlyUnlocked, G, geometry, wheelStep, fitScale } from './map-layout.js';
import { svg, ICONS, MODES, LEGEND, mapSvg, legendSw, legendEdge, listHtml, asideHtml, cardHtml, progressHtml, altBarHtml, miniHtml,
  miniTotals } from './map-render.js';

// ---------- dialog ----------
const M = { mode: 'all', view: 'map', sel: null, hover: null, focus: null, c: null, opener: null, pz: null, tok: 0, notice: '', els: null, down: null, fit: null, miniOpen: null, live: null };
let dlg = null;
// The search's alternatives, none when every one is empty (renderView's rule); the shown one is ui.cur.
const alts = () => { const r = ui.last?.results ?? []; return r.some((x) => resCourses(x).length) ? r : []; };
const q = (s) => dlg.querySelector(s);
const PZ_URL = new URL('./vendor/panzoom/panzoom.es.js', import.meta.url).href; // 4.6.0, a copy (no third-party request)
let pzLib = null;
// Lazy so node tests (which import this file) never touch the network; a failed or slow load falls back to the list view.
const loadPanzoom = () => (pzLib ??= Promise.race([import(PZ_URL).then((m) => m.default), new Promise((_, no) => setTimeout(no, 8000,
  new Error('timeout')))]).catch((e) => { pzLib = null; throw e; }));
function ctxOf(mode) {
  const { data, state, cls } = app, st = cls.statuses;
  const year = studyYear(data, state), base = makeKeep(mode, data, st, year);
  const plan = new Set([...(app.planIds ?? [])].filter((id) => data.courses[id] && !isDone(st, id))); // what the shown schedule alternative takes
  const aside = asideIds(data, st, state.choices, state.profile?.specs).filter((id) => base(id) && !plan.has(id)), off = new Set(aside); // a planned course is always drawn
  const L = layoutMap(data, (id) => base(id) && !off.has(id));
  const doneIds = Object.keys(st).filter((id) => st[id].status === 'done');
  return { data, st, L, g: geometry(L, (id) => data.courses[id]?.credits), year, unlocks: unlockCounts(data, doneIds), mode, aside, plan,
    prog: progressInfo(data, st, plan, state.profile?.specs), specs: state.profile?.specs ?? [], areas: data.specializations?.length ?? 0, opened: newlyUnlocked(data, state, plan) };
}

function light() {
  const root = dlg && q('.pm-svg'), key = M.hover ?? M.focus ?? M.sel;
  if (!root || !M.els) return;
  const ch = key ? chainOf(M.c.L.paths, key) : null; // a node with no edges: only itself lights
  root.classList.toggle('dim', !!ch);
  M.els.nodes.forEach((el, k) => el.classList.toggle('lit', !!ch && ch.nodes.has(k)));
  M.els.paths.forEach((el, id) => el.classList.toggle('lit', !!ch && ch.paths.has(id)));
}

function select(key) {
  M.sel = key;
  const card = q('.pm-card'), view = M.pz && q('.pm-svg'), w0 = view?.clientWidth;
  M.els?.nodes.forEach((el, k) => { if (el.matches('.nd')) { el.classList.toggle('sel', k === key); el.setAttribute('aria-pressed', String(k === key)); } });
  card.hidden = !key;
  card.innerHTML = key ? cardHtml(M.c, key) : '';
  // The side card narrows the svg from its left edge and the drawing hangs from that edge (origin 0 0), so it would jump right by the lost
  // width: pan by the change in width (negative when the card opens) and the node under the cursor stays put.
  const keep = view ? view.clientWidth - w0 : 0;
  if (key && M.els) ensureVisible(M.els.nodes.get(key), keep);
  else if (keep) M.pz.pan(keep / M.pz.getScale(), 0, { relative: true, animate: false });
  light();
}

function render() {
  const c = M.c = ctxOf(M.mode), map = M.view === 'map', empty = !c.L.nodes.length;
  const total = Object.keys(c.data.courses).length, done = Object.values(c.st).filter((s) => ['done', 'exempt'].includes(s.status)).length;
  if (M.sel && !c.L.nodes.some((n) => n.key === M.sel)) M.sel = null;
  const emptyMsg = M.mode === 'remaining' ? 'אין קורסים להצגה: עברתם או קיבלתם פטור מכל הקורסים.' : 'אין קורסים להצגה.';
  const zbtn = (act, label, ic) => `<button type="button" class="pm-ibtn" data-pm="${act}" data-k="pm-${act}" aria-label="${label}"${empty ? ' disabled' : ''}>${ic}</button>`;
  const mini = map && !empty && alts().length && current() ? miniHtml({ raw: current(), sem: app.sem, data: app.data, colors, k: ui.cur,
    open: M.miniOpen ?? matchMedia('(min-width: 900px) and (min-height: 700px)').matches }) : '';
  dlg.innerHTML = `<header class="pm-head"><h2 id="pmTitle" class="pm-title">המסע שלי בתואר</h2>
      ${altBarHtml({ k: ui.cur, n: alts().length, running: ui.running, summer: summerScope() })}
      <button type="button" class="pm-ibtn pm-close" data-pm="close" data-k="pm-close" aria-label="סגור את המפה">${icon('x')}</button></header>
    <p class="pm-band">עברתם או קיבלתם פטור ב-<b><bdi>${done}</bdi></b> מתוך <b><bdi>${total}</bdi></b> קורסים. לחצו על קורס כדי לראות מה צריך כדי להגיע אליו ומה הוא פותח.</p>
    ${progressHtml(c)}
    ${M.notice ? `<p class="pm-note" role="status">${esc(M.notice)}</p>` : ''}
    <div class="pm-bar"><div class="pm-seg" role="group" aria-label="סינון">${MODES.map(([k, t]) => `<button type="button" data-pm="mode" data-v="${k}"
      data-k="pm-mode-${k}" aria-pressed="${M.mode === k}">${t}</button>`).join('')}</div>
      <div class="pm-tools"><button type="button" class="pm-btn" data-pm="view" data-k="pm-view">${map ? ICONS.list : ICONS.map} ${map ? 'תצוגת רשימה' : 'תצוגת מפה'}</button>
      ${map ? `<div class="pm-zoom" role="group" aria-label="זום">${zbtn('zin', 'הגדל', icon('plus'))}${zbtn('zout', 'הקטן', ICONS.minus)}${zbtn('fit',
        'התאם את המפה למסך', ICONS.fit)}</div>` : ''}</div></div>
    ${map ? `<details class="pm-legend"${matchMedia('(max-width: 700px), (max-height: 1000px)').matches ? '' : ' open'}><summary>מקרא</summary><div
      class="lg">${LEGEND.map(([k, t]) => `<span class="lg-i">${legendSw(k)}${t}</span>`).join('')}
      <span class="lg-i"><svg class="lg-sw" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><g class="sw st-available"><circle class="mine-halo"
        cx="13" cy="13" r="12"/><circle class="ring" cx="13" cy="13" r="8"/></g></svg>השנה שלך</span><span class="lg-i">${legendEdge('k')}קדם</span><span
        class="lg-i">${legendEdge('p')}מקביל (יחד עם)</span>
      <span class="lg-i"><svg class="lg-sw" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><g class="or"><circle cx="13" cy="13" r="10"/><text
        x="13" y="13" text-anchor="middle" dominant-baseline="central">או</text></g></svg>אחד מהם מספיק</span>
      <span class="lg-i"><svg class="lg-sw" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><g class="sw st-available"><circle class="plan-ring"
        cx="13" cy="13" r="12"/><circle class="ring" cx="13" cy="13" r="8"/></g></svg>בתכנון (במערכת שנבחרה)</span><span
        class="lg-i">${legendEdge('plan')}קורס שהמערכת פותחת</span>
      <span class="lg-i"><svg width="44" height="22" viewBox="0 0 44 22" aria-hidden="true"><g class="ext"><rect x="1" y="2" width="42" height="18"
        rx="9"/></g></svg>לא בתוכנית שלך</span><span class="lg-i"><svg width="44" height="22" viewBox="0 0 44 22" aria-hidden="true"><g class="ext pre"><rect
        x="1" y="2" width="42" height="18" rx="9"/></g></svg>לפני התואר (מכינה), רק למי שנדרש/ה</span>
      <span class="lg-i"><svg width="52" height="20" viewBox="0 0 52 20" aria-hidden="true"><g class="opens"><rect x="2" y="2" width="48" height="16"
        rx="8"/><text x="26" y="10" text-anchor="middle" dominant-baseline="central">פותח 3</text></g></svg>כמה קורסים הוא פותח</span></div></details>` : ''}
    <div class="pm-body">${map
    ? `<div class="pm-view" role="region" aria-label="מפת הקורסים לפי שנות לימוד. אפשר לגרור, לגלגל או לצבוט כדי להתקרב, ולהשתמש בכפתורי הזום">${empty ? `<p
      class="pm-empty">${emptyMsg}</p>` : `${mapSvg(c)}<p class="pm-loading" role="status">טוען מפה…</p>`}${asideHtml(c)}${mini}</div>`
    : `<div class="pm-view pm-listview" tabindex="0" role="region" aria-label="רשימת הקורסים">${listHtml(c)}</div>`}
      <aside class="pm-card" aria-label="פרטי הקורס" aria-live="polite" hidden></aside></div>`;
  if (!M.live) { M.live = document.createElement('p'); M.live.className = 'sr'; M.live.setAttribute('role', 'status'); }
  dlg.appendChild(M.live); // one live region kept across redraws, so a switched alternative is announced
  M.hover = M.focus = null;
  M.els = null;
  if (map && !empty) {
    M.els = {
      nodes: new Map([...dlg.querySelectorAll('.pm-svg [data-key]')].map((el) => [el.dataset.key, el])),
      paths: new Map([...dlg.querySelectorAll('.pm-svg [data-p]')].map((el) => [Number(el.dataset.p), el])),
    };
    if (M.sel) select(M.sel);
  }
}

// Pan/zoom/pinch come from @panzoom/panzoom, applied to the <g class="pz"> inside the svg; the svg itself is the drag surface.
async function mount(keep = null) { // keep: { s, x, y } of the previous Panzoom (a switched alternative keeps the zoom), else fit
  const tok = ++M.tok;
  M.pz?.destroy(); M.pz = null; M.fit = null;
  if (M.view !== 'map' || !M.els) return;
  let Panzoom;
  try { Panzoom = await loadPanzoom(); } catch {
    if (tok === M.tok && dlg.open) { M.view = 'list'; M.notice = 'לא הצלחנו לטעון את המפה (אין חיבור?). מוצגת רשימת הקורסים במקומה.'; keepFocus(render); }
    return;
  }
  if (tok !== M.tok || !dlg.open) return;
  const root = q('.pm-svg'), g = q('.pz'), { W, H } = M.c.g;
  // no preventDefault on pointerdown (the default handler does it): node clicks and focus must still work
  const pz = M.pz = Panzoom(g, { canvas: true, origin: '0 0', cursor: 'grab', minScale: 0.2, maxScale: 3, handleStartEvent: () => {} });
  const ends = () => { const s = pz.getScale(), o = pz.getOptions(); q('[data-pm="zin"]').disabled = s >= o.maxScale - 0.01; q('[data-pm="zout"]').disabled = s <= o.minScale + 0.01; };
  g.addEventListener('panzoomchange', ends);
  root.addEventListener('wheel', (e) => pz.zoomWithWheel(e, { step: wheelStep(e) }), { passive: false }); // zooms toward the pointer; trackpad pinch arrives as ctrl+wheel
  root.addEventListener('pointerdown', (e) => { M.down = { x: e.clientX, y: e.clientY }; });
  M.fit = () => {
    const r = root.getBoundingClientRect(), s = fitScale(r.width, r.height, W, H), w = W * s, h = H * s;
    pz.zoom(s, { animate: false, force: true });
    pz.pan((w <= r.width ? (r.width - w) / 2 : r.width - w) / s, (h <= r.height ? (r.height - h) / 2 : 0) / s, { animate: false, force: true }); // too wide: year א׳ (right) in view
    ends();
  };
  setTimeout(() => {
    if (tok !== M.tok) return;
    if (keep) { pz.zoom(keep.s, { animate: false, force: true }); pz.pan(keep.x, keep.y, { animate: false, force: true }); ends(); } else M.fit();
    if (M.sel) requestAnimationFrame(() => tok === M.tok && ensureVisible(M.els.nodes.get(M.sel))); // after Panzoom applied the fit; a card left open across a filter change must not cover its node
    root.classList.add('ready');
  }); // after Panzoom's own start-position timeout
}

function ensureVisible(el, pre = 0) { // pre: a horizontal pan (screen px) already owed, panzoom applies pans a frame late
  if (!M.pz) return;
  const card = q('.pm-card'), cover = !card.hidden && getComputedStyle(card).position === 'absolute' ? card.offsetHeight : 0; // the phone sheet overlays the map
  const r = el.getBoundingClientRect(), a = { left: r.left + pre, right: r.right + pre, top: r.top, bottom: r.bottom },
    b = q('.pm-svg').getBoundingClientRect(), m = 24, s = M.pz.getScale(), bottom = b.bottom - cover;
  const dx = pre + (a.left < b.left + m ? b.left + m - a.left : a.right > b.right - m ? b.right - m - a.right : 0);
  const dy = a.top < b.top + m ? b.top + m - a.top : a.bottom + 18 > bottom - m ? bottom - m - a.bottom - 18 : 0; // 18 = the name under the circle
  if (dx || dy) M.pz.pan(dx / s, dy / s, { relative: true, animate: false });
}

function hoverTo(key, kind) {
  if (M[kind] === key) return;
  M[kind] = key;
  light();
}

function openMap(from) {
  if (!app.data || !app.cls) return;
  if (!dlg) {
    dlg = Object.assign(document.body.appendChild(document.createElement('dialog')), { id: 'pmap', className: 'pmap' });
    dlg.addEventListener('click', onClick);
    dlg.addEventListener('keydown', onKey);
    dlg.addEventListener('pointerover', (e) => hoverTo(e.target.closest?.('.nd')?.dataset.key ?? null, 'hover'));
    dlg.addEventListener('pointerout', () => hoverTo(null, 'hover'));
    dlg.addEventListener('focusin', (e) => { const n = e.target.closest?.('.nd'); hoverTo(n?.dataset.key ?? null,
      'focus'); if (n?.matches(':focus-visible')) ensureVisible(n); }); // keyboard focus only: a mouse press must not move the node under the cursor
    dlg.addEventListener('focusout', () => hoverTo(null, 'focus'));
    dlg.addEventListener('toggle', (e) => { if (e.target.classList?.contains('pm-mini')) M.miniOpen = e.target.open; }, true); // toggle does not bubble
    dlg.addEventListener('close', () => { M.tok++; M.pz?.destroy(); M.pz = null; });
  }
  dlg.setAttribute('aria-labelledby', 'pmTitle');
  dlg.setAttribute('dir', 'rtl');
  M.opener = from; M.sel = null; M.mode = 'all'; M.view = 'map'; M.notice = ''; M.miniOpen = null;
  render();
  dlg.showModal();
  mount();
  q('[data-pm="close"]').focus({ preventScroll: true });
}

const redraw = () => { keepFocus(render); mount(); };
function onKey(e) {
  const n = e.target.closest?.('.nd');
  if (n && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    select(M.sel === n.dataset.key ? null : n.dataset.key);
    if (M.sel) q('[data-pm="clear"]')?.focus({ preventScroll: true }); // the card's close button returns focus to the node
  }
}
function onClick(e) {
  const node = e.target.closest('.nd');
  const dragged = M.down && Math.hypot(e.clientX - M.down.x, e.clientY - M.down.y) > 4; // a click that ends a drag-pan opens nothing
  M.down = null;
  if (node) { if (!dragged) select(M.sel === node.dataset.key ? null : node.dataset.key); return; }
  if (e.target.closest('.pm-svg')) { if (!dragged && M.sel) select(null); return; }
  const b = e.target.closest('[data-pm]');
  if (!b) return;
  const act = b.dataset.pm;
  const zoomBy = (f) => { const r = q('.pm-svg').getBoundingClientRect(); M.pz?.zoomToPoint(M.pz.getScale() * f, { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }); };
  if (act === 'close') dlg.close();
  else if (act === 'spec') { e.preventDefault(); M.opener = document.querySelector('.spec-sec input:checked'); dlg.close(); }
  else if (act === 'clear') { const k = M.sel; select(null); M.els?.nodes.get(k)?.focus({ preventScroll: true }); }
  else if (act === 'zin') zoomBy(1.25);
  else if (act === 'zout') zoomBy(0.8);
  else if (act === 'fit') M.fit?.();
  else if (act === 'mode') { M.mode = b.dataset.v; M.notice = ''; redraw(); }
  else if (act === 'alt') { const n = alts().length; if (n > 1 && !ui.running) showAlt((ui.cur + Number(b.dataset.d) + n) % n); } // renderView calls ui.onShown
  else if (act === 'view') { M.view = M.view === 'map' ? 'list' : 'map'; M.notice = ''; redraw(); }
}

let rz = 0;
function setup() {
  const onResize = () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      if (dlg?.open && M.view === 'map') M.fit?.();
    }, 150);
  };
  // After every renderView (an alternative picked here or on the board, a search result landing while the map is open): redraw, keep the zoom.
  ui.onShown = () => {
    if (!dlg?.open) return;
    const keep = M.pz ? { s: M.pz.getScale(), ...M.pz.getPan() } : null;
    keepFocus(render);
    mount(keep);
    const n = alts().length, raw = current();
    if (n > 1 && raw) { const t = miniTotals(raw, app.data); M.live.textContent = `חלופה ${ui.cur + 1} מתוך ${n}, ${courseCount(t.courses)}, ${t.credits} נ״ז`; }
  };
  addEventListener('resize', onResize);
  addEventListener('orientationchange', onResize);
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act="openMap"]');
    if (b) openMap(b);
  });
  document.addEventListener('close', (e) => {
    if (e.target !== dlg) return;
    const k = M.opener;
    (k?.isConnected ? k : document.querySelector('[data-k="openMap"]'))?.focus({ preventScroll: true });
  }, true);
}
if (typeof document !== 'undefined') setup();
