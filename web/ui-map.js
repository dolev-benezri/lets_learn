// Interactive progress map ("הראה התקדמות"): every course and its prerequisites as a layered flowchart, coloured by the
// student's real status (app.cls.statuses, from rules.js). The layout is a pure function (layoutMap) so it can be unit-tested.
import { app, esc, keepFocus } from './app.js';
import { icon, yedion } from './ui-grid.js';
import { unlockCounts } from './solver-core.js';
import { studyYear } from './rules.js';

// ---------- layout (pure) ----------
export const SIZE = { nodeW: 188, nodeH: 60, extH: 44, gap: 88, pitch: 78, laneHead: 40, lanePad: 12, pad: 24, dia: 32 };
const YEAR_LETTERS = 'אבגד';
const yearOf = (l) => l.name.match(/חובה שנה (\S)'/)?.[1];
const laneTitle = (l) => (yearOf(l) ? `שנה ${yearOf(l)}׳` : l.name);

// Which courses to draw: "remaining" hides done + exempt; "year" keeps only the student's study-year list.
export function makeKeep(mode, data, statuses, year) {
  if (mode === 'remaining') return (id) => !['done', 'exempt'].includes(statuses[id]?.status);
  if (mode === 'year') {
    const l = data.lists.find((x) => yearOf(x) === YEAR_LETTERS[year - 1]);
    if (l) { const ids = new Set(l.courses); return (id) => ids.has(id); }
  }
  return () => true;
}

// Layers run left to right by prerequisite depth: a `קדם` edge always goes to a strictly higher layer, a `מקביל` edge to the
// same or a higher one. The drawing is mirrored for RTL (layer 0 on the right). Lanes are the course lists (study years first).
// An `anyOf` with more than one distinct option goes through an "או" diamond; options outside the program become `ext` pills.
export function layoutMap(data, keep = () => true) {
  const S = SIZE, C = data.courses;
  const laneOf = new Map();
  data.lists.forEach((l, i) => l.courses.forEach((id) => { if (C[id] && !laneOf.has(id)) laneOf.set(id, i); }));
  const rest = Object.keys(C).filter((id) => !laneOf.has(id));
  const laneDefs = data.lists.map((l, i) => ({ i, name: laneTitle(l), year: yearOf(l) ? YEAR_LETTERS.indexOf(yearOf(l)) + 1 : null }));
  if (rest.length) { rest.forEach((id) => laneOf.set(id, laneDefs.length)); laneDefs.push({ i: laneDefs.length, name: 'אחר', year: null }); }
  const order = [...laneOf.keys()].filter((id) => keep(id)); // list order, lane by lane
  order.sort((a, b) => laneOf.get(a) - laneOf.get(b));
  const K = new Set(order);

  // Requirements that survive the filter. ext options are keyed per lane and name.
  const entries = [];
  for (const id of order) C[id].prereqs.forEach((p, pi) => {
    const seen = new Set(), opts = [];
    for (const a of p.anyOf) {
      const isCourse = a.id && C[a.id];
      const k = isCourse ? a.id : `x:${laneOf.get(id)}:${a.name}`;
      if (seen.has(k) || a.id === id || (isCourse && !K.has(a.id))) continue;
      seen.add(k);
      opts.push(isCourse ? { key: k, id: a.id } : { key: k, ext: true, name: a.name });
    }
    if (opts.length) entries.push({ to: id, kind: p.kind, opts, pi });
  });

  // Longest path; `מקביל` weighs 0. A cycle (bad data) just stops the recursion.
  const incoming = new Map();
  for (const e of entries) for (const o of e.opts) if (!o.ext) (incoming.get(e.to) ?? incoming.set(e.to, []).get(e.to)).push([o.id, e.kind === 'קדם' ? 1 : 0]);
  const memo = new Map(), stack = new Set();
  const layerOf = (id) => {
    if (memo.has(id)) return memo.get(id);
    if (stack.has(id)) return 0;
    stack.add(id);
    const v = Math.max(0, ...(incoming.get(id) ?? []).map(([s, w]) => layerOf(s) + w));
    stack.delete(id);
    memo.set(id, v);
    return v;
  };
  const nodes = new Map();
  for (const id of order) nodes.set(id, { key: id, type: 'course', id, lane: laneOf.get(id), layer: layerOf(id), w: S.nodeW, h: S.nodeH });
  const ext = new Map();
  for (const e of entries) for (const o of e.opts) if (o.ext) {
    const lane = laneOf.get(e.to), l = nodes.get(e.to).layer - 1;
    const n = ext.get(o.key) ?? ext.set(o.key, { key: o.key, type: 'ext', name: o.name, lane, layer: l, w: S.nodeW, h: S.extH }).get(o.key);
    n.layer = Math.min(n.layer, l);
  }
  const shift = Math.max(0, -Math.min(0, ...[...ext.values()].map((n) => n.layer)));
  for (const n of [...nodes.values(), ...ext.values()]) n.layer += shift;
  ext.forEach((n, k) => nodes.set(k, n));

  // Courses with no edge at all: one column, or spread over several when a lane has many (the elective list).
  const touched = new Set(entries.flatMap((e) => [e.to, ...e.opts.map((o) => o.key)]));
  const maxLayer = Math.max(shift, ...[...nodes.values()].map((n) => n.layer));
  for (const lane of laneDefs) {
    const iso = order.filter((id) => laneOf.get(id) === lane.i && !touched.has(id));
    const cols = iso.length > 4 ? Math.min(maxLayer + 1 - shift, Math.ceil(iso.length / 4)) : 1;
    iso.forEach((id, i) => { nodes.get(id).layer = shift + (i % cols); });
  }
  const cols = Math.max(1, ...[...nodes.values()].map((n) => n.layer + 1));
  const width = S.pad * 2 + cols * S.nodeW + (cols - 1) * S.gap;

  // Rows: each (lane, layer) cell stacks its nodes; the lane is as tall as its fullest cell.
  const list = [...nodes.values()];
  const cell = (n) => `${n.lane}|${n.layer}`;
  const cells = new Map();
  for (const n of list) (cells.get(cell(n)) ?? cells.set(cell(n), []).get(cell(n))).push(n);
  const lanes = [];
  let y = S.pad;
  for (const d of laneDefs) {
    const rows = Math.max(0, ...[...cells].filter(([k]) => k.startsWith(`${d.i}|`)).map(([, v]) => v.length));
    if (!rows) continue;
    const h = S.laneHead + rows * S.pitch + S.lanePad;
    lanes.push({ ...d, y, h, rows, top: y + S.laneHead });
    y += h + 8;
  }
  const height = y + S.pad - 8;
  const laneTop = new Map(lanes.map((l) => [l.i, l.top]));
  const place = () => { for (const arr of cells.values()) arr.forEach((n, r) => { n.row = r; n.cy = laneTop.get(n.lane) + r * S.pitch + S.pitch / 2; }); };
  place();
  const nb = new Map(list.map((n) => [n.key, { pred: [], succ: [] }]));
  for (const e of entries) for (const o of e.opts) { nb.get(e.to).pred.push(nodes.get(o.key)); nb.get(o.key)?.succ.push(nodes.get(e.to)); }
  const sweep = (dir, layers) => {
    for (const L of layers) for (const [k, arr] of cells) {
      if (!k.endsWith(`|${L}`)) continue;
      const bary = (n) => { const m = nb.get(n.key)[dir]; return m.length ? m.reduce((a, x) => a + x.cy, 0) / m.length : n.cy; };
      const keyed = arr.map((n) => [bary(n), n.row, n]);
      keyed.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      keyed.forEach(([, , n], i) => { arr[i] = n; });
    }
    place();
  };
  const up = Array.from({ length: cols }, (_, i) => i);
  for (let i = 0; i < 3; i++) { sweep('pred', up.slice(1)); sweep('succ', [...up].reverse().slice(1)); }
  for (const n of list) { n.x = width - S.pad - (n.layer + 1) * S.nodeW - n.layer * S.gap; n.y = n.cy - n.h / 2; }

  // "או" diamonds sit in the gutter before their target, stacked when a course has several.
  const diamonds = [], count = new Map(), seenCount = new Map();
  for (const e of entries) if (e.opts.length > 1) count.set(e.to, (count.get(e.to) ?? 0) + 1);
  for (const e of entries) if (e.opts.length > 1) {
    const t = nodes.get(e.to), j = seenCount.get(e.to) ?? 0, n = count.get(e.to);
    seenCount.set(e.to, j + 1);
    e.via = { key: `or:${e.to}:${e.pi}`, type: 'or', target: e.to, w: S.dia, h: S.dia, cx: t.x + S.nodeW + S.gap / 2, cy: t.cy + (j - (n - 1) / 2) * (S.dia + 2) };
    e.via.x = e.via.cx - S.dia / 2; e.via.y = e.via.cy - S.dia / 2;
    diamonds.push(e.via);
  }

  // Orthogonal routes, right to left. Sources share the target's channel, so converging edges read as one bus.
  const paths = [], edges = [];
  const route = (a, b, kind, from, to) => {
    const x1 = a.type === 'or' ? a.cx - S.dia / 2 : a.x, y1 = a.type === 'or' ? a.cy : a.cy;
    const x2 = b.type === 'or' ? b.cx + S.dia / 2 : b.x + b.w, y2 = b.cy;
    let d, label = null;
    if (a.type !== 'or' && b.type !== 'or' && a.layer === b.layer) {
      const mx = a.x + a.w + 14;
      d = `M${a.x + a.w} ${y1}H${mx}V${y2}H${x2}`;
      label = { x: mx + 20, y: (y1 + y2) / 2 };
    } else {
      const mx = b.type === 'or' ? x2 + 12 : x2 + 18;
      d = y1 === y2 ? `M${x1} ${y1}H${x2}` : `M${x1} ${y1}H${mx}V${y2}H${x2}`;
      label = y1 === y2 ? { x: (x1 + x2) / 2, y: y1 - 6 } : { x: mx, y: (y1 + y2) / 2 + 4 };
    }
    paths.push({ id: paths.length, from, to, kind, d, label: kind === 'מקביל' ? label : null });
  };
  for (const e of entries) {
    const tgt = nodes.get(e.to);
    if (e.via) {
      for (const o of e.opts) route(nodes.get(o.key), e.via, e.kind, o.key, e.via.key);
      route(e.via, tgt, e.kind, e.via.key, e.to);
    } else route(nodes.get(e.opts[0].key), tgt, e.kind, e.opts[0].key, e.to);
    for (const o of e.opts) edges.push({ from: o.key, to: e.to, kind: e.kind, via: e.via?.key ?? null });
  }
  return { nodes: list, diamonds, paths, edges, lanes, width, height, cols };
}

// Everything upstream (what it needs) and downstream (what it opens) of one node, as keys and path ids.
export function chainOf(paths, key) {
  const nodes = new Set([key]), used = new Set();
  for (const [a, b] of [['to', 'from'], ['from', 'to']]) {
    const seen = new Set([key]), todo = [key];
    while (todo.length) {
      const k = todo.pop();
      for (const p of paths) if (p[a] === k) { used.add(p.id); nodes.add(p[b]); if (!seen.has(p[b])) { seen.add(p[b]); todo.push(p[b]); } }
    }
  }
  return { nodes, paths: used };
}

// ---------- text helpers ----------
const LABEL = { done: 'עברתי', exempt: 'פטור', retake: 'חזרה', available: 'זמין', conditional: 'זמין בתנאי', afterA: 'בב׳ אחרי…', blocked: 'חסום', notOffered: 'לא נלמד' };
const BADGE = { done: 'check', exempt: 'cap', retake: 'alert', afterA: 'clock', blocked: 'lock', notOffered: 'x' };
const uniq = (a) => [...new Set(a)];
const requires = (data, id) => data.courses[id].prereqs.map((p) => `${p.kind === 'מקביל' ? 'במקביל: ' : ''}${uniq(p.anyOf.map((a) => a.name)).join(' או ')}`);
const opensDirect = (data, id) => Object.entries(data.courses).filter(([, c]) => c.prereqs.some((p) => p.kind === 'קדם' && p.anyOf.some((a) => a.id === id))).map(([k]) => k);
const plural = (n, one, many) => (n === 1 ? one : `${n} ${many}`);

function ctxOf(mode) {
  const { data, state, cls } = app, st = cls.statuses;
  const year = studyYear(data, state);
  const L = layoutMap(data, makeKeep(mode, data, st, year));
  const doneIds = Object.keys(st).filter((id) => st[id].status === 'done');
  return { data, st, L, year, unlocks: unlockCounts(data, doneIds), mode };
}
const statusOf = (c, id) => c.st[id]?.status ?? 'available';
const nodeLabel = (c, id) => {
  const co = c.data.courses[id], s = statusOf(c, id), n = c.unlocks[id] ?? 0;
  const why = ['blocked', 'notOffered', 'afterA', 'conditional'].includes(s) ? c.st[id].reasons : [];
  return [co.name, LABEL[s], `${co.credits} נ״ז`, requires(c.data, id).length && `דורש: ${requires(c.data, id).join('; ')}`, n && `פותח: ${plural(n, 'קורס אחד', 'קורסים')}`, ...why].filter(Boolean).join(', ');
};

// ---------- rendering ----------
const svg = (body) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const ICONS = {
  minus: svg('<path d="M5 12h14"/>'),
  fit: svg('<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>'),
  list: svg('<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'),
  map: svg('<circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 6h6a3 3 0 0 1 3 3v6"/>'),
};
const MODES = [['all', 'הכל'], ['remaining', 'מה שנשאר לי'], ['year', 'רק השנה שלי']];
const LEGEND = [['st-done', 'עברתי'], ['st-exempt', 'פטור'], ['st-available', 'זמין עכשיו'], ['st-retake', 'חזרה (נכשלתי)'], ['st-afterA', 'בב׳ אחרי…'], ['st-blocked', 'חסום, חסר קדם'], ['st-notOffered', 'לא נלמד בסמסטר']];

function nodeHtml(c, n) {
  if (n.type === 'ext') return `<div class="mx" data-key="${esc(n.key)}" style="left:${n.x}px;top:${n.y}px;width:${n.w}px;height:${n.h}px"><span>מחוץ לתוכנית: ${esc(n.name)}</span></div>`;
  const co = c.data.courses[n.id], s = statusOf(c, n.id), o = c.unlocks[n.id] ?? 0;
  const tip = ['blocked', 'notOffered'].includes(s) ? ` data-tip="${esc(c.st[n.id].reasons.join(' · '))}"` : '';
  return `<button type="button" class="mn st-${s}" data-key="${esc(n.key)}" data-id="${esc(n.id)}" data-k="mn-${esc(n.id)}" aria-pressed="false" aria-label="${esc(nodeLabel(c, n.id))}"${tip} style="left:${n.x}px;top:${n.y}px;width:${n.w}px;height:${n.h}px">
    <span class="mn-badge" aria-hidden="true">${BADGE[s] ? icon(BADGE[s]) : ''}</span><span class="mn-name">${esc(co.name)}</span>
    <span class="mn-meta" aria-hidden="true"><bdi>${co.credits}</bdi> נ״ז · ${LABEL[s]}</span>${o ? `<span class="mn-opens" aria-hidden="true">פותח ${o}</span>` : ''}</button>`;
}

function canvasHtml(c) {
  const { L } = c;
  const lanes = L.lanes.map((l) => `<div class="ml${l.year === c.year ? ' me' : ''}" style="top:${l.y}px;height:${l.h}px"><span class="ml-tag">${esc(l.name)}${l.year === c.year ? ' · השנה שלך' : ''}</span></div>`).join('');
  const paths = L.paths.map((p) => `<path class="${p.kind === 'מקביל' ? 'pp' : 'pe'}" data-p="${p.id}" d="${p.d}" marker-end="url(#${p.kind === 'מקביל' ? 'arrP' : 'arrE'})"/>`
    + (p.label ? `<text class="pl" data-p="${p.id}" x="${p.label.x}" y="${p.label.y}" text-anchor="middle">מקביל</text>` : '')).join('');
  const dia = L.diamonds.map((d) => `<span class="mo" data-key="${esc(d.key)}" aria-hidden="true" style="left:${d.x}px;top:${d.y}px;width:${d.w}px;height:${d.h}px"><b>או</b></span>`).join('');
  return `${lanes}<svg class="pm-edges" width="${L.width}" height="${L.height}" viewBox="0 0 ${L.width} ${L.height}" aria-hidden="true"><defs>
    <marker id="arrE" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 10 5 0 10z" class="ar-e"/></marker>
    <marker id="arrP" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0 10 5 0 10z" class="ar-p"/></marker></defs>${paths}</svg>${dia}${L.nodes.map((n) => nodeHtml(c, n)).join('')}`;
}

function listHtml(c) {
  const byLane = new Map(c.L.lanes.map((l) => [l.i, []]));
  c.L.nodes.filter((n) => n.type === 'course').forEach((n) => byLane.get(n.lane).push(n.id));
  return `<div class="pm-list">${c.L.lanes.map((l) => `<section><h3>${esc(l.name)}</h3><ul>${byLane.get(l.i).map((id) => {
    const co = c.data.courses[id], s = statusOf(c, id), req = requires(c.data, id), o = c.unlocks[id] ?? 0;
    return `<li class="st-${s}"><div class="li-top"><b>${esc(co.name)}</b><span class="li-st">${LABEL[s]}</span><span class="li-cr"><bdi>${co.credits}</bdi> נ״ז</span>
      <a class="li-link" href="${yedion(id)}" target="_blank" rel="noopener" aria-label="${esc(co.name)} בידיעון (חלון חדש)">${icon('external-link')}</a></div>
      ${req.length ? `<p>דורש: ${req.map(esc).join('; ')}</p>` : ''}${o ? `<p>פותח: ${plural(o, 'קורס אחד', 'קורסים')}</p>` : ''}${c.st[id]?.reasons.length ? `<p class="li-why">${c.st[id].reasons.map(esc).join('<br>')}</p>` : ''}</li>`;
  }).join('')}</ul></section>`).join('') || '<p>אין קורסים להצגה.</p>'}</div>`;
}

function cardHtml(c, id) {
  const co = c.data.courses[id], s = statusOf(c, id), req = requires(c.data, id), opens = opensDirect(c.data, id), r = c.st[id]?.reasons ?? [];
  return `<div class="card-top"><span class="chip st-${s}">${LABEL[s]}</span><button type="button" class="pm-ibtn" data-pm="clear" data-k="pm-clear" aria-label="סגור את כרטיס הקורס">${icon('x')}</button></div>
    <h3>${esc(co.name)}</h3><p class="card-meta"><bdi>${esc(id)}</bdi> · <bdi>${co.credits}</bdi> נ״ז</p>
    ${r.length ? `<p class="card-why">${r.map(esc).join('<br>')}</p>` : ''}
    ${req.length ? `<h4>דורש</h4><ul>${req.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="card-meta">אין קדם.</p>'}
    ${opens.length ? `<h4>פותח${c.unlocks[id] > opens.length ? ` (בסך הכל ${c.unlocks[id]})` : ''}</h4><ul>${opens.slice(0, 8).map((k) => `<li>${esc(c.data.courses[k].name)}</li>`).join('')}${opens.length > 8 ? `<li>ועוד ${opens.length - 8}</li>` : ''}</ul>` : ''}
    <p class="card-note">הדגשנו על המפה את כל מה שדרוש כדי להגיע אליו ואת כל מה שהוא פותח.</p>
    <a class="pm-btn" href="${yedion(id)}" target="_blank" rel="noopener">${icon('external-link')} ראה בידיעון (חלון חדש)</a>`;
}

// ---------- dialog ----------
const M = { mode: 'all', view: 'map', z: 1, sel: null, c: null, opener: null };
let dlg = null;
const q = (s) => dlg.querySelector(s);
const ZMIN = 0.2, ZMAX = 1.6;

function applyZoom() {
  const L = M.c.L;
  q('.pm-sizer').style.cssText = `width:${L.width * M.z}px;height:${L.height * M.z}px`;
  q('.pm-inner').style.transform = `scale(${M.z})`;
  q('[data-pm="zout"]').disabled = M.z <= ZMIN + 0.001;
  q('[data-pm="zin"]').disabled = M.z >= ZMAX - 0.001;
}
function setZoom(z) {
  const v = q('.pm-view'), s = q('.pm-sizer'), old = M.z;
  const vr = v.getBoundingClientRect(), sr = s.getBoundingClientRect();
  const cx = (vr.left + v.clientWidth / 2 - sr.left) / old, cy = (vr.top + v.clientHeight / 2 - sr.top) / old;
  M.z = Math.min(ZMAX, Math.max(ZMIN, z));
  applyZoom();
  const nr = s.getBoundingClientRect();
  v.scrollLeft += nr.left - (vr.left + v.clientWidth / 2 - cx * M.z);
  v.scrollTop += nr.top - (vr.top + v.clientHeight / 2 - cy * M.z);
}
const fitZoom = () => Math.min(1, q('.pm-view').clientWidth / M.c.L.width); // the map is tall: fit its width, scroll down

function select(key) {
  M.sel = key;
  const c = M.c, view = q('.pm-view'), card = q('.pm-card');
  const chain = key ? chainOf(c.L.paths, key) : null;
  view.classList.toggle('has-sel', !!chain);
  view.querySelectorAll('[data-key]').forEach((el) => {
    el.classList.toggle('dim', !!chain && !chain.nodes.has(el.dataset.key));
    el.classList.toggle('sel', el.dataset.key === key);
    if (el.matches('.mn')) el.setAttribute('aria-pressed', String(el.dataset.key === key));
  });
  view.querySelectorAll('[data-p]').forEach((el) => el.classList.toggle('dim', !!chain && !chain.paths.has(Number(el.dataset.p))));
  card.hidden = !key;
  card.innerHTML = key ? cardHtml(c, key) : '';
}

function render() {
  const c = M.c = ctxOf(M.mode), map = M.view === 'map';
  const total = Object.keys(c.data.courses).length, done = Object.values(c.st).filter((s) => ['done', 'exempt'].includes(s.status)).length;
  if (M.sel && !c.L.nodes.some((n) => n.key === M.sel)) M.sel = null;
  dlg.innerHTML = `<header class="pm-head"><div class="pm-titles"><span class="pm-ribbon">מפת הקורסים והקדמים</span><h2 id="pmTitle" class="pm-title">המסע שלי בתואר</h2></div>
      <button type="button" class="pm-ibtn pm-close" data-pm="close" data-k="pm-close" aria-label="סגור את המפה">${icon('x')}</button></header>
    <p class="pm-band">עברתם או קיבלתם פטור ב-<b><bdi>${done}</bdi></b> מתוך <b><bdi>${total}</bdi></b> קורסים. לחצו על קורס כדי לראות מה צריך כדי להגיע אליו ומה הוא פותח.</p>
    <div class="pm-bar"><div class="pm-seg" role="group" aria-label="סינון">${MODES.map(([k, t]) => `<button type="button" data-pm="mode" data-v="${k}" data-k="pm-mode-${k}" aria-pressed="${M.mode === k}">${t}</button>`).join('')}</div>
      <div class="pm-tools"><button type="button" class="pm-btn" data-pm="view" data-k="pm-view">${map ? ICONS.list : ICONS.map} ${map ? 'תצוגת רשימה' : 'תצוגת מפה'}</button>
      ${map ? `<div class="pm-zoom" role="group" aria-label="זום"><button type="button" class="pm-ibtn" data-pm="zin" data-k="pm-zin" aria-label="הגדל">${icon('plus')}</button><button type="button" class="pm-ibtn" data-pm="zout" data-k="pm-zout" aria-label="הקטן">${ICONS.minus}</button><button type="button" class="pm-ibtn" data-pm="fit" data-k="pm-fit" aria-label="התאם את המפה לרוחב המסך">${ICONS.fit}</button></div>` : ''}</div></div>
    <details class="pm-legend"${matchMedia('(max-width: 700px), (max-height: 1000px)').matches ? '' : ' open'}><summary>מקרא</summary><div class="lg">${LEGEND.map(([k, t]) => `<span class="lg-i"><span class="mn-sw ${k}"></span>${t}</span>`).join('')}
      <span class="lg-i"><svg width="34" height="10" aria-hidden="true"><path class="pe" d="M2 5H26" /><path d="M24 1 33 5 24 9z" class="ar-e"/></svg>קדם</span>
      <span class="lg-i"><svg width="34" height="10" aria-hidden="true"><path class="pp" d="M2 5H26" /><path d="M24 1 33 5 24 9z" class="ar-p"/></svg>מקביל (יחד עם)</span>
      <span class="lg-i"><span class="mo mo-sw" aria-hidden="true"><b>או</b></span>אחד מהם מספיק</span>
      <span class="lg-i"><span class="mx-sw"></span>מחוץ לתוכנית</span><span class="lg-i"><span class="mn-opens mn-opens-sw">פותח 3</span>כמה קורסים הוא פותח</span></div></details>
    <div class="pm-body">${map
    ? `<div class="pm-view" tabindex="0" role="region" aria-label="מפת הקורסים. אפשר לגלול ולגרור"><div class="pm-sizer"><div class="pm-inner" style="width:${c.L.width}px;height:${c.L.height}px">${canvasHtml(c)}</div></div></div>`
    : `<div class="pm-view pm-listview" tabindex="0" role="region" aria-label="רשימת הקורסים">${listHtml(c)}</div>`}
      <aside class="pm-card" aria-label="פרטי הקורס" aria-live="polite" hidden></aside></div>`;
  if (map) {
    M.z = M.z || 1;
    applyZoom();
    if (M.sel) select(M.sel);
  }
}

function openMap(from) {
  if (!app.data || !app.cls) return;
  dlg ??= Object.assign(document.body.appendChild(document.createElement('dialog')), { id: 'pmap', className: 'pmap' });
  dlg.setAttribute('aria-labelledby', 'pmTitle');
  dlg.setAttribute('dir', 'rtl');
  M.opener = from; M.sel = null; M.mode = 'all'; M.view = 'map';
  render();
  dlg.showModal();
  M.z = Math.max(0.7, fitZoom()); // desktop: the whole width; phones: readable, pan to explore
  applyZoom();
  q('.pm-view').scrollTop = 0;
  q('[data-pm="close"]').focus({ preventScroll: true });
}

function onClick(e) {
  const node = e.target.closest('.mn');
  if (node) { select(M.sel === node.dataset.key ? null : node.dataset.key); return; }
  const b = e.target.closest('[data-pm]');
  if (!b) return;
  const act = b.dataset.pm;
  if (act === 'close') dlg.close();
  else if (act === 'clear') { const k = M.sel; select(null); q(`.mn[data-key="${CSS.escape(k)}"]`)?.focus({ preventScroll: true }); }
  else if (act === 'zin') setZoom(M.z * 1.25);
  else if (act === 'zout') setZoom(M.z / 1.25);
  else if (act === 'fit') setZoom(Math.max(ZMIN, fitZoom()));
  else if (act === 'mode') { M.mode = b.dataset.v; keepFocus(() => { render(); if (M.view === 'map') { M.z = Math.max(0.7, fitZoom()); applyZoom(); } }); }
  else if (act === 'view') { M.view = M.view === 'map' ? 'list' : 'map'; keepFocus(render); }
}

let drag = null;
function setup() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act="openMap"]');
    if (b) openMap(b);
  });
  document.addEventListener('click', (e) => { if (dlg?.open && dlg.contains(e.target)) onClick(e); });
  document.addEventListener('pointerdown', (e) => {
    const v = dlg?.open && e.target.closest?.('.pm-view');
    if (!v || e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('.mn, a, button')) return;
    drag = { x: e.clientX, y: e.clientY, l: v.scrollLeft, t: v.scrollTop, v };
    v.setPointerCapture(e.pointerId);
    v.classList.add('drag');
  });
  document.addEventListener('pointermove', (e) => { if (drag) { drag.v.scrollLeft = drag.l - (e.clientX - drag.x); drag.v.scrollTop = drag.t - (e.clientY - drag.y); } });
  const end = () => { drag?.v.classList.remove('drag'); drag = null; };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  document.addEventListener('close', (e) => {
    if (e.target !== dlg) return;
    const k = M.opener;
    (k?.isConnected ? k : document.querySelector('[data-k="openMap"]'))?.focus({ preventScroll: true });
  }, true);
}
if (typeof document !== 'undefined') setup();
