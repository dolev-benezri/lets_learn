// Interactive progress map ("הראה התקדמות"): every course and its prerequisites as a neural-network style graph (round nodes, curved edges),
// arranged by study year (one band per year, right to left, two semester columns each, electives last) and coloured by the student's real status
// (app.cls.statuses, from rules.js). Layout and geometry are pure functions so they can be unit-tested.
import { app, esc, keepFocus } from './app.js';
import { icon, yedion } from './ui-grid.js';
import { unlockCounts } from './solver-core.js';
import { studyYear } from './rules.js';

// ---------- layout (pure) ----------
const YEAR_LETTERS = 'אבגד';
const yearOf = (l) => l.name.match(/חובה שנה (\S)'/)?.[1];
const bandName = (y) => (y ? `שנה ${YEAR_LETTERS[y - 1]}׳` : 'קורסי בחירה');

// Which courses to draw: "remaining" hides done + exempt; "year" keeps only the student's study-year list.
export function makeKeep(mode, data, statuses, year) {
  if (mode === 'remaining') return (id) => !['done', 'exempt'].includes(statuses[id]?.status);
  if (mode === 'year') {
    const l = data.lists.find((x) => yearOf(x) === YEAR_LETTERS[year - 1]);
    if (l) { const ids = new Set(l.courses); return (id) => ids.has(id); }
  }
  return () => true;
}

// Study year (1-4) of every course in a "חובה שנה X'" list (the first one that holds it); anything else is an elective.
export function courseYears(data) {
  const m = new Map();
  for (const l of data.lists) { const y = YEAR_LETTERS.indexOf(yearOf(l) ?? '?'); if (y >= 0) l.courses.forEach((id) => { if (data.courses[id] && !m.has(id)) m.set(id, y + 1); }); }
  return m;
}
// Electives the student has no stake in stay off the map: not chosen "חובה"/"אולי" and not passed or being retaken.
export const asideIds = (data, statuses, choices = {}) => {
  const yr = courseYears(data);
  return Object.keys(data.courses).filter((id) => !yr.has(id) && !['must', 'optional'].includes(choices[id]) && !['done', 'exempt', 'retake'].includes(statuses[id]?.status));
};

// Geometry helpers for the progress-map renderer
export const nodeRadius = (credits) => Math.max(14, Math.min(30, 12 + 3 * (Number(credits) || 0)));
export const edgePath = (a, b) => { const mx = (a.x + b.x) / 2; return `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`; };

// Structure only, no pixels: a band per study year (א׳ first = rightmost) and an electives band last (leftmost); a band has one column per semester
// (א first) and a column lists its courses by prerequisite depth, so arrows mostly flow right to left, top to bottom. `קדם` weighs 1 in the depth, `מקביל` 0.
// An `anyOf` with more than one distinct option goes through an "או" diamond; options outside the program become `ext` pills in their target's column.
export function layoutMap(data, keep = () => true) {
  const C = data.courses, yr = courseYears(data);
  const bandOf = (id) => (yr.get(id) ?? 5) - 1; // electives: 4
  const order = Object.keys(C).filter((id) => keep(id));
  const K = new Set(order);

  // Requirements that survive the filter. ext options are keyed per band and name.
  const entries = [];
  for (const id of order) C[id].prereqs.forEach((p, pi) => {
    const seen = new Set(), opts = [];
    for (const a of p.anyOf) {
      const isCourse = a.id && C[a.id];
      const k = isCourse ? a.id : `x:${bandOf(id)}:${a.name}`;
      if (seen.has(k) || a.id === id || (isCourse && !K.has(a.id))) continue;
      seen.add(k);
      opts.push(isCourse ? { key: k, id: a.id } : { key: k, ext: true, name: a.name });
    }
    if (opts.length) entries.push({ to: id, kind: p.kind, opts, pi });
  });

  // Longest path. A cycle (bad data) just stops the recursion.
  const incoming = new Map();
  for (const e of entries) for (const o of e.opts) if (!o.ext) (incoming.get(e.to) ?? incoming.set(e.to, []).get(e.to)).push([o.id, e.kind === 'קדם' ? 1 : 0]);
  const memo = new Map(), stack = new Set();
  const depthOf = (id) => {
    if (memo.has(id)) return memo.get(id);
    if (stack.has(id)) return 0;
    stack.add(id);
    const v = Math.max(0, ...(incoming.get(id) ?? []).map(([s, w]) => depthOf(s) + w));
    stack.delete(id);
    memo.set(id, v);
    return v;
  };
  const nodes = new Map(order.map((id) => [id, { key: id, type: 'course', id, band: bandOf(id), sem: null, depth: depthOf(id), year: yr.get(id) ?? null }]));
  // Semester column. A course offered in one semester only sits there. One offered in both (or neither) has no fixed place in the data, so it
  // goes after its in-band prerequisites, then the surplus of the first column moves to the second: a suggestion, not the curriculum.
  const band = (id) => nodes.get(id).band, preds = (id) => (incoming.get(id) ?? []).filter(([q, w]) => w && nodes.get(q)?.band === band(id)).map(([q]) => q);
  for (const b of new Set([...nodes.values()].map((n) => n.band))) {
    const ids = order.filter((id) => band(id) === b).sort((x, y) => nodes.get(x).depth - nodes.get(y).depth), free = [], after = new Set(ids.flatMap(preds));
    for (const id of ids) {
      const ss = C[id].semesters ?? [data.semester], n = nodes.get(id);
      if (ss.length === 1) n.sem = ss[0] === 'ב' ? 1 : 0;
      else { n.sem = preds(id).some((q) => nodes.get(q).sem === 0) ? 1 : 0; free.push(id); }
    }
    const cnt = (v) => ids.filter((id) => nodes.get(id).sem === v).length;
    for (const id of free.reverse()) if (cnt(0) - cnt(1) > 1 && nodes.get(id).sem === 0 && !after.has(id)) nodes.get(id).sem = 1;
  }
  for (const e of entries) for (const o of e.opts) if (o.ext) { // one pill per band and name, in the earliest column of its targets, just above the shallowest one
    const t = nodes.get(e.to), n = nodes.get(o.key) ?? nodes.set(o.key, { key: o.key, type: 'ext', name: o.name, band: t.band, sem: t.sem, depth: t.depth - 1, year: t.year }).get(o.key);
    n.sem = Math.min(n.sem, t.sem); n.depth = Math.min(n.depth, t.depth - 1);
  }

  // Columns in flow order (band, semester), an empty one skipped. Rows: depth, then list order (the sort is stable; ext pills come last).
  const list = [...nodes.values()], cols = [], bands = [];
  for (const b of [...new Set(list.map((n) => n.band))].sort((x, y) => x - y)) {
    const band = { year: b < 4 ? b + 1 : null, name: bandName(b < 4 ? b + 1 : null), first: cols.length, n: 0 };
    for (const s of [0, 1]) {
      const col = list.filter((n) => n.band === b && n.sem === s).sort((x, y) => x.depth - y.depth);
      if (!col.length) continue;
      col.forEach((n, row) => { n.col = cols.length; n.row = row; });
      cols.push({ sem: s });
      band.n++;
    }
    bands.push(band);
  }
  list.sort((x, y) => x.col - y.col || x.row - y.row);

  // "או" diamonds, and the routes: a path per hop (option -> diamond -> target, or option -> target).
  const diamonds = [], paths = [];
  const hop = (from, to, kind) => paths.push({ id: paths.length, from, to, kind });
  for (const e of entries) {
    if (e.opts.length > 1) {
      const via = `or:${e.to}:${e.pi}`;
      diamonds.push({ key: via, type: 'or', target: e.to });
      for (const o of e.opts) hop(o.key, via, e.kind);
      hop(via, e.to, e.kind);
    } else hop(e.opts[0].key, e.to, e.kind);
  }
  return { nodes: list, diamonds, paths, bands, cols };
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


// ---------- neural-style geometry (pure) ----------
export const G = { pitch: 164, row: 72, padX: 28, padY: 20, head: 58, bandGap: 32, orR: 11, orDx: 76, extHW: 66, extR: 11, bulge: 56 };
export const truncate = (s, n = 18) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
// Edge leaves the near side of one circle and enters the near side of the next (flow runs right to left in RTL).
export const edgeEnds = (a, b) => { const d = b.x < a.x ? -1 : 1; return [{ x: a.x + d * a.hw, y: a.y }, { x: b.x - d * b.hw, y: b.y }]; };
// Two nodes in one column: edgePath would be a straight line through the column, so bow out to the right (further for a longer hop, clear of the names between).
export const sameColPath = (a, b) => { const x1 = a.x + a.hw, x2 = b.x + b.hw, k = G.bulge + Math.min(40, Math.abs(b.y - a.y) / 6); return `M${x1},${a.y} C${x1 + k},${a.y} ${x2 + k},${b.y} ${x2},${b.y}`; };

export function geometry(L, creditsOf = () => 0) {
  const radius = (n) => (n.type === 'ext' ? G.extR : nodeRadius(creditsOf(n.id)));
  const W = G.padX * 2 + L.cols.length * G.pitch + Math.max(0, L.bands.length - 1) * G.bandGap, top = G.head + G.padY;
  // x of each column and each band's box, band by band from the right edge
  const colX = [], bands = [];
  let xr = W - G.padX;
  for (const b of L.bands) {
    const cols = [];
    for (let j = 0; j < b.n; j++) { colX[b.first + j] = xr - (j + 0.5) * G.pitch; cols.push({ x: colX[b.first + j], label: L.cols[b.first + j].sem ? 'סמסטר ב׳ (מוצע)' : 'סמסטר א׳ (מוצע)' }); }
    bands.push({ year: b.year, name: b.name, x: xr - b.n * G.pitch, w: b.n * G.pitch, cols });
    xr -= b.n * G.pitch + G.bandGap;
  }
  // A column's step is at least a row, and enough for the two circles and the name between any pair that follow each other.
  const byCol = Object.groupBy(L.nodes, (n) => n.col), step = {};
  for (const [c, col] of Object.entries(byCol)) step[c] = Math.max(G.row, ...col.slice(1).map((n, i) => radius(n) + radius(col[i]) + 22));
  const H = top + G.padY + Math.max(0, ...Object.entries(byCol).map(([c, col]) => col.length * step[c])), pos = new Map();
  for (const n of L.nodes) { const r = radius(n); pos.set(n.key, { ...n, x: colX[n.col], y: top + (n.row + 0.5) * step[n.col], r, hw: n.type === 'ext' ? G.extHW : r }); }
  const seen = new Map(), ors = L.diamonds.map((d) => {
    const t = pos.get(d.target), n = L.diamonds.filter((x) => x.target === d.target).length, j = seen.get(d.target) ?? 0;
    seen.set(d.target, j + 1);
    return { key: d.key, type: 'or', x: t.x + G.orDx, y: t.y + (j - (n - 1) / 2) * (2 * G.orR + 4), r: G.orR, hw: G.orR };
  });
  ors.forEach((o) => pos.set(o.key, o));
  const edges = L.paths.map((p) => {
    const a = pos.get(p.from), b = pos.get(p.to), [s, e] = edgeEnds(a, b);
    return { id: p.id, from: p.from, to: p.to, kind: p.kind, d: a.col !== undefined && a.col === b.col ? sameColPath(a, b) : edgePath(s, e) };
  });
  const nodes = [...pos.values()].filter((n) => n.type !== 'or'); // L.nodes' order is the Tab order: columns right to left, then top to bottom
  return { W, H, head: G.head, bands, nodes, ors, edges };
}

// ---------- text helpers ----------
const LABEL = { done: 'עברתי', exempt: 'פטור', retake: 'חזרה', available: 'זמין', conditional: 'זמין בתנאי', afterA: 'בב׳ אחרי…', blocked: 'חסום', notOffered: 'לא נלמד' };
const uniq = (a) => [...new Set(a)];
const requires = (data, id) => data.courses[id].prereqs.map((p) => `${p.kind === 'מקביל' ? 'במקביל: ' : ''}${uniq(p.anyOf.map((a) => a.name)).join(' או ')}`);
const opensDirect = (data, id) => Object.entries(data.courses).filter(([, c]) => c.prereqs.some((p) => p.kind === 'קדם' && p.anyOf.some((a) => a.id === id))).map(([k]) => k);
const plural = (n, one, many) => (n === 1 ? one : `${n} ${many}`);

const statusOf = (c, id) => c.st[id]?.status ?? 'available';
const yearTag = (y) => (y ? `שנה ${YEAR_LETTERS[y - 1]}׳` : '');
const nodeLabel = (c, id, yr) => {
  const co = c.data.courses[id], s = statusOf(c, id), n = c.unlocks[id] ?? 0;
  const why = ['blocked', 'notOffered', 'afterA', 'conditional'].includes(s) ? c.st[id].reasons : [];
  return [co.name, LABEL[s], `${co.credits} נ״ז`, yearTag(yr), requires(c.data, id).length && `דורש: ${requires(c.data, id).join('; ')}`, n && `פותח: ${plural(n, 'קורס אחד', 'קורסים')}`, ...why].filter(Boolean).join(', ');
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
// Inner glyph per status (24-unit paths): the status never rests on colour alone. `available` needs none; notOffered has the dashed ring.
const GLYPH = {
  done: '<path d="M20 6 9 17l-5-5"/>',
  exempt: '<path d="M21.4 10.9a1 1 0 0 0 0-1.8L12.8 5.2a2 2 0 0 0-1.6 0L2.6 9.1a1 1 0 0 0 0 1.8l8.6 3.9a2 2 0 0 0 1.6 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  retake: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  blocked: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  afterA: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  conditional: '<path d="M12 7v6"/><path d="M12 17h.01"/>',
};
const glyph = (s, x, y, r) => { const z = Math.min(18, r * 1.1); return GLYPH[s] ? `<g class="gl" transform="translate(${x - z / 2} ${y - z / 2}) scale(${z / 24})" aria-hidden="true">${GLYPH[s]}</g>` : ''; };
const LEGEND = [['done', 'עברתי'], ['exempt', 'פטור'], ['available', 'זמין עכשיו'], ['conditional', 'זמין בתנאי'], ['retake', 'חזרה (נכשלתי)'], ['afterA', 'בב׳ אחרי…'], ['blocked', 'חסום, חסר קדם'], ['notOffered', 'לא נלמד בסמסטר']];
const num = (n) => Math.round(n * 10) / 10;

function nodeSvg(c, n) {
  const x = num(n.x), y = num(n.y);
  if (n.type === 'ext') {
    const t = `מחוץ לתוכנית: ${n.name}`;
    return `<g class="ext" data-key="${esc(n.key)}" aria-hidden="true"><title>${esc(t)}</title><rect x="${x - n.hw}" y="${y - n.r}" width="${2 * n.hw}" height="${2 * n.r}" rx="${n.r}"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central">${esc(truncate(n.name, 20))}</text></g>`;
  }
  const yr = n.year, mine = c.year && yr === c.year; // the student's study year: dotted halo, also named in the label and the card
  const co = c.data.courses[n.id], s = statusOf(c, n.id), o = c.unlocks[n.id] ?? 0, lbl = nodeLabel(c, n.id, yr), bw = o > 9 ? 52 : 46;
  return `<g class="nd st-${s}${mine ? ' mine' : ''}" role="button" tabindex="0" data-key="${esc(n.key)}" data-k="mn-${esc(n.id)}" aria-pressed="false" aria-label="${esc(lbl)}"><title>${esc(lbl)}</title>
    ${mine ? `<circle class="mine-halo" cx="${x}" cy="${y}" r="${n.r + 8}"/>` : ''}<circle class="halo" cx="${x}" cy="${y}" r="${n.r + 5}"/><circle class="hit" cx="${x}" cy="${y}" r="${Math.max(n.r, 22)}"/><circle class="ring" cx="${x}" cy="${y}" r="${n.r}"/>${glyph(s, x, y, n.r)}
    <text class="nm" x="${x}" y="${num(y + n.r + 16)}" text-anchor="middle">${esc(truncate(co.name))}</text>${o ? `<g class="opens" aria-hidden="true"><rect x="${num(x - n.r * 0.8 - bw / 2)}" y="${num(y - n.r * 0.85 - 8)}" width="${bw}" height="16" rx="8"/><text x="${num(x - n.r * 0.8)}" y="${num(y - n.r * 0.85)}" text-anchor="middle" dominant-baseline="central">פותח ${o}</text></g>` : ''}</g>`;
}

export function mapSvg(c) {
  const g = c.g;
  const bands = g.bands.map((b) => `<g class="band${c.year && b.year === c.year ? ' mine' : ''}" aria-hidden="true"><rect x="${num(b.x)}" y="8" width="${b.w}" height="${num(g.H - 16)}" rx="12"/><text class="bt" x="${num(b.x + b.w / 2)}" y="30" text-anchor="middle">${esc(b.name)}</text>${b.cols.map((k) => `<text class="bs" x="${num(k.x)}" y="${g.head - 8}" text-anchor="middle">${k.label}</text>`).join('')}</g>`).join('');
  const edges = g.edges.map((p) => `<path class="e ${p.kind === 'מקביל' ? 'p' : 'k'}" data-p="${p.id}" d="${p.d}"/>`).join('');
  const ors = g.ors.map((o) => `<g class="or" data-key="${esc(o.key)}" aria-hidden="true"><circle cx="${num(o.x)}" cy="${num(o.y)}" r="${o.r}"/><text x="${num(o.x)}" y="${num(o.y)}" text-anchor="middle" dominant-baseline="central">או</text></g>`).join('');
  return `<svg class="pm-svg" width="100%" height="100%" role="group" aria-label="מפת הקורסים"><defs>
    <marker id="pmArr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 1 10 5 0 9z" class="ar"/></marker>
    <marker id="pmArrL" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 1 10 5 0 9z" class="ar lit"/></marker></defs>
    <g class="pz"><g class="bands">${bands}</g><g class="edges" aria-hidden="true">${edges}</g><g class="ors">${ors}</g><g class="nodes">${g.nodes.map((n) => nodeSvg(c, n)).join('')}</g></g></svg>`;
}

const legendSw = (s) => `<svg class="lg-sw" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><g class="sw st-${s}"><circle class="ring" cx="13" cy="13" r="10"/>${glyph(s, 13, 13, 10)}</g></svg>`;
const legendEdge = (cls) => `<svg width="34" height="10" aria-hidden="true"><path class="lg-e ${cls}" d="M2 5H32"/></svg>`;

function listHtml(c) {
  const byBand = c.L.bands.map((b) => c.L.nodes.filter((n) => n.type === 'course' && n.col >= b.first && n.col < b.first + b.n).map((n) => n.id));
  return `<div class="pm-list">${c.L.bands.map((b, i) => `<section><h3>${esc(b.name)}</h3><ul>${byBand[i].map((id) => {
    const co = c.data.courses[id], s = statusOf(c, id), req = requires(c.data, id), o = c.unlocks[id] ?? 0;
    return `<li class="st-${s}"><div class="li-top"><b>${esc(co.name)}</b><span class="li-st">${LABEL[s]}</span><span class="li-cr"><bdi>${esc(co.credits)}</bdi> נ״ז</span>
      <a class="li-link" href="${yedion(id)}" target="_blank" rel="noopener" aria-label="${esc(co.name)} בידיעון (חלון חדש)">${icon('external-link')}</a></div>
      ${req.length ? `<p>דורש: ${req.map(esc).join('; ')}</p>` : ''}${o ? `<p>פותח: ${plural(o, 'קורס אחד', 'קורסים')}</p>` : ''}${c.st[id]?.reasons.length ? `<p class="li-why">${c.st[id].reasons.map(esc).join('<br>')}</p>` : ''}</li>`;
  }).join('')}</ul></section>`).join('') || '<p>אין קורסים להצגה.</p>'}${asideHtml(c)}</div>`;
}

// Electives the student did not choose: listed, not drawn.
const asideHtml = (c) => (c.aside.length ? `<details class="pm-aside"><summary>לא רלוונטי (<bdi>${c.aside.length}</bdi>)</summary><p>קורסי בחירה שלא סימנתם ״חובה״ או ״אולי״.</p><ul>${c.aside.map((id) => `<li>${esc(c.data.courses[id].name)} <bdi>${esc(id)}</bdi></li>`).join('')}</ul></details>` : '');

function cardHtml(c, id) {
  const co = c.data.courses[id], s = statusOf(c, id), req = requires(c.data, id), opens = opensDirect(c.data, id), r = c.st[id]?.reasons ?? [];
  const yr = c.L.nodes.find((n) => n.key === id)?.year;
  return `<div class="card-top"><span class="chip st-${s}">${LABEL[s]}</span><button type="button" class="pm-ibtn" data-pm="clear" data-k="pm-clear" aria-label="סגור את כרטיס הקורס">${icon('x')}</button></div>
    <h3>${esc(co.name)}</h3><p class="card-meta"><bdi>${esc(id)}</bdi> · <bdi>${esc(co.credits)}</bdi> נ״ז${yr ? ` · ${yearTag(yr)}` : ''}</p>
    ${r.length ? `<p class="card-why">${r.map(esc).join('<br>')}</p>` : ''}
    ${req.length ? `<h4>דורש</h4><ul>${req.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="card-meta">אין קדם.</p>'}
    ${opens.length ? `<h4>פותח${c.unlocks[id] > opens.length ? ` (בסך הכל ${c.unlocks[id]})` : ''}</h4><ul>${opens.slice(0, 8).map((k) => `<li>${esc(c.data.courses[k].name)}</li>`).join('')}${opens.length > 8 ? `<li>ועוד ${opens.length - 8}</li>` : ''}</ul>` : ''}
    <p class="card-note">הדגשנו על המפה את כל מה שדרוש כדי להגיע אליו ואת כל מה שהוא פותח.</p>
    <a class="pm-btn" href="${yedion(id)}" target="_blank" rel="noopener">${icon('external-link')} ראה בידיעון (חלון חדש)</a>`;
}

// ---------- dialog ----------
const M = { mode: 'all', view: 'map', sel: null, hover: null, focus: null, c: null, opener: null, pz: null, tok: 0, notice: '', els: null, down: null, fit: null };
let dlg = null;
const q = (s) => dlg.querySelector(s);
const PZ_URL = 'https://cdn.jsdelivr.net/npm/@panzoom/panzoom@4.6.0/dist/panzoom.es.js';
let pzLib = null;
// Lazy so node tests (which import this file) never touch the network; a failed or slow load falls back to the list view.
const loadPanzoom = () => (pzLib ??= Promise.race([import(PZ_URL).then((m) => m.default), new Promise((_, no) => setTimeout(no, 8000, new Error('timeout')))]).catch((e) => { pzLib = null; throw e; }));

// Opening scale: the whole graph on a desktop; on a phone fit by height (floor 0.3), pinned to year א׳ on the right, one finger pans.
export const fitScale = (vw, vh, W, H) => (vw >= 600 ? Math.max(0.2, Math.min(1, vw / W, vh / H)) : Math.max(0.3, Math.min(1, vh / H)));

function ctxOf(mode) {
  const { data, state, cls } = app, st = cls.statuses;
  const year = studyYear(data, state), base = makeKeep(mode, data, st, year);
  const aside = asideIds(data, st, state.choices).filter((id) => base(id)), off = new Set(aside);
  const L = layoutMap(data, (id) => base(id) && !off.has(id));
  const doneIds = Object.keys(st).filter((id) => st[id].status === 'done');
  return { data, st, L, g: geometry(L, (id) => data.courses[id]?.credits), year, unlocks: unlockCounts(data, doneIds), mode, aside };
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
  dlg.innerHTML = `<header class="pm-head"><h2 id="pmTitle" class="pm-title">המסע שלי בתואר</h2>
      <button type="button" class="pm-ibtn pm-close" data-pm="close" data-k="pm-close" aria-label="סגור את המפה">${icon('x')}</button></header>
    <p class="pm-band">עברתם או קיבלתם פטור ב-<b><bdi>${done}</bdi></b> מתוך <b><bdi>${total}</bdi></b> קורסים. לחצו על קורס כדי לראות מה צריך כדי להגיע אליו ומה הוא פותח.</p>
    ${M.notice ? `<p class="pm-note" role="status">${esc(M.notice)}</p>` : ''}
    <div class="pm-bar"><div class="pm-seg" role="group" aria-label="סינון">${MODES.map(([k, t]) => `<button type="button" data-pm="mode" data-v="${k}" data-k="pm-mode-${k}" aria-pressed="${M.mode === k}">${t}</button>`).join('')}</div>
      <div class="pm-tools"><button type="button" class="pm-btn" data-pm="view" data-k="pm-view">${map ? ICONS.list : ICONS.map} ${map ? 'תצוגת רשימה' : 'תצוגת מפה'}</button>
      ${map ? `<div class="pm-zoom" role="group" aria-label="זום">${zbtn('zin', 'הגדל', icon('plus'))}${zbtn('zout', 'הקטן', ICONS.minus)}${zbtn('fit', 'התאם את המפה למסך', ICONS.fit)}</div>` : ''}</div></div>
    ${map ? `<details class="pm-legend"${matchMedia('(max-width: 700px), (max-height: 1000px)').matches ? '' : ' open'}><summary>מקרא</summary><div class="lg">${LEGEND.map(([k, t]) => `<span class="lg-i">${legendSw(k)}${t}</span>`).join('')}
      <span class="lg-i"><svg class="lg-sw" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><g class="sw st-available"><circle class="mine-halo" cx="13" cy="13" r="12"/><circle class="ring" cx="13" cy="13" r="8"/></g></svg>השנה שלך</span><span class="lg-i">${legendEdge('k')}קדם</span><span class="lg-i">${legendEdge('p')}מקביל (יחד עם)</span>
      <span class="lg-i"><svg class="lg-sw" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><g class="or"><circle cx="13" cy="13" r="10"/><text x="13" y="13" text-anchor="middle" dominant-baseline="central">או</text></g></svg>אחד מהם מספיק</span>
      <span class="lg-i"><svg width="44" height="22" viewBox="0 0 44 22" aria-hidden="true"><g class="ext"><rect x="1" y="2" width="42" height="18" rx="9"/></g></svg>מחוץ לתוכנית</span>
      <span class="lg-i"><svg width="52" height="20" viewBox="0 0 52 20" aria-hidden="true"><g class="opens"><rect x="2" y="2" width="48" height="16" rx="8"/><text x="26" y="10" text-anchor="middle" dominant-baseline="central">פותח 3</text></g></svg>כמה קורסים הוא פותח</span></div></details>` : ''}
    <div class="pm-body">${map
    ? `<div class="pm-view" role="region" aria-label="מפת הקורסים לפי שנות לימוד. אפשר לגרור, לגלגל או לצבוט כדי להתקרב, ולהשתמש בכפתורי הזום">${empty ? `<p class="pm-empty">${emptyMsg}</p>` : `${mapSvg(c)}<p class="pm-loading" role="status">טוען מפה…</p>`}${asideHtml(c)}</div>`
    : `<div class="pm-view pm-listview" tabindex="0" role="region" aria-label="רשימת הקורסים">${listHtml(c)}</div>`}
      <aside class="pm-card" aria-label="פרטי הקורס" aria-live="polite" hidden></aside></div>`;
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
async function mount() {
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
  // The wheel zooms toward the pointer (panzoom's zoomWithWheel; trackpad pinch arrives as ctrl+wheel). The lib takes one fixed step per event,
  // so the step follows the event's size: a mouse notch is about 16%, a trackpad's many small events stay gentle.
  root.addEventListener('wheel', (e) => pz.zoomWithWheel(e, { step: Math.max(0.03, Math.min(0.9, (Math.abs(e.deltaY || e.deltaX) * (e.deltaMode ? 33 : 1) / 100) * 0.45)) }), { passive: false });
  root.addEventListener('pointerdown', (e) => { M.down = { x: e.clientX, y: e.clientY }; });
  M.fit = () => {
    const r = root.getBoundingClientRect(), s = fitScale(r.width, r.height, W, H), w = W * s, h = H * s;
    pz.zoom(s, { animate: false, force: true });
    pz.pan((w <= r.width ? (r.width - w) / 2 : r.width - w) / s, (h <= r.height ? (r.height - h) / 2 : 0) / s, { animate: false, force: true }); // too wide: year א׳ (right) in view
    ends();
  };
  setTimeout(() => {
    if (tok !== M.tok) return;
    M.fit();
    if (M.sel) requestAnimationFrame(() => tok === M.tok && ensureVisible(M.els.nodes.get(M.sel))); // after Panzoom applied the fit; a card left open across a filter change must not cover its node
    root.classList.add('ready');
  }); // after Panzoom's own start-position timeout
}

function ensureVisible(el, pre = 0) { // pre: a horizontal pan (screen px) already owed, panzoom applies pans a frame late
  if (!M.pz) return;
  const card = q('.pm-card'), cover = !card.hidden && getComputedStyle(card).position === 'absolute' ? card.offsetHeight : 0; // the phone sheet overlays the map
  const r = el.getBoundingClientRect(), a = { left: r.left + pre, right: r.right + pre, top: r.top, bottom: r.bottom }, b = q('.pm-svg').getBoundingClientRect(), m = 24, s = M.pz.getScale(), bottom = b.bottom - cover;
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
    dlg.addEventListener('focusin', (e) => { const n = e.target.closest?.('.nd'); hoverTo(n?.dataset.key ?? null, 'focus'); if (n?.matches(':focus-visible')) ensureVisible(n); }); // keyboard focus only: a mouse press must not move the node under the cursor
    dlg.addEventListener('focusout', () => hoverTo(null, 'focus'));
    dlg.addEventListener('close', () => { M.tok++; M.pz?.destroy(); M.pz = null; });
  }
  dlg.setAttribute('aria-labelledby', 'pmTitle');
  dlg.setAttribute('dir', 'rtl');
  M.opener = from; M.sel = null; M.mode = 'all'; M.view = 'map'; M.notice = '';
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
  else if (act === 'clear') { const k = M.sel; select(null); M.els?.nodes.get(k)?.focus({ preventScroll: true }); }
  else if (act === 'zin') zoomBy(1.25);
  else if (act === 'zout') zoomBy(0.8);
  else if (act === 'fit') M.fit?.();
  else if (act === 'mode') { M.mode = b.dataset.v; M.notice = ''; redraw(); }
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
