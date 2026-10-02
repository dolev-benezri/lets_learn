// Progress map, pure part: which courses to draw, the band/column layout, the neural-style geometry and the viewport math. No DOM, unit-tested (test/ui-map.test.mjs).
import { classify, specLists } from './rules.js';

// ---------- layout (pure) ----------
export const YEAR_LETTERS = 'אבגד';
const yearOf = (l) => l.name.match(/חובה שנה (\S)'/)?.[1];
const bandName = (y) => (y ? `שנה ${YEAR_LETTERS[y - 1]}׳` : 'חובה כללית ובחירה'); // English, final project and chosen electives

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
// Electives the student has no stake in stay off the map: in no required list (a year, English, the final project…), not chosen "חובה"/"אולי", not passed or being retaken.
const REQUIRED = /חובה|פרויקט גמר/;
// Specialization lists never count by their name: only the chosen areas' mandatory courses are required, and their electives are the student's pool (not aside).
export const asideIds = (data, statuses, choices = {}, specs = []) => {
  const sp = specLists(data, specs);
  const req = new Set([...data.lists.filter((l) => REQUIRED.test(l.name) && !sp.all.has(l.code)).flatMap((l) => l.courses), ...sp.mandatory]);
  return Object.keys(data.courses).filter((id) => !req.has(id) && !sp.elective.has(id) && !['must', 'optional'].includes(choices[id]) && !['done', 'exempt', 'retake'].includes(statuses[id]?.status));
};

// Geometry helpers for the progress-map renderer
export const nodeRadius = (credits) => Math.max(14, Math.min(30, 12 + 3 * (Number(credits) || 0)));
export const edgePath = (a, b) => { const mx = (a.x + b.x) / 2; return `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`; };

// Structure only, no pixels: a band per study year (א׳ first = rightmost) and an electives band last (leftmost). A band has unlabelled columns by
// prerequisite depth inside the band (a depth with many courses wraps into more columns), so arrows mostly flow right to left, top to bottom.
// `קדם` weighs 1 in the depth, `מקביל` 0. An `anyOf` with more than one distinct option goes through an "או" diamond; options outside the program
// become `ext` pills in their target's column, except pre-academic ones (מכינה), which sit in their own band right of year א׳: they come before
// the degree, and only some students need them.
const PRE = /מכינה|קורס הכנה/, PRE_BAND = -1, ROWS = 9;
export const PRE_NAME = 'לפני התואר (מכינה)', PRE_NOTE = 'רק למי שנדרש/ה לפי תנאי הקבלה';
export function layoutMap(data, keep = () => true) {
  const C = data.courses, yr = courseYears(data);
  const bandOf = (id) => (yr.get(id) ?? 5) - 1; // electives: 4
  const order = Object.keys(C).filter((id) => keep(id));
  const K = new Set(order);

  // Requirements that survive the filter. ext options are keyed per band and name (pre-academic ones once, for the whole map).
  const entries = [];
  for (const id of order) C[id].prereqs.forEach((p, pi) => {
    const seen = new Set(), opts = [];
    for (const a of p.anyOf) {
      const isCourse = a.id && C[a.id], pre = !isCourse && PRE.test(a.name);
      const k = isCourse ? a.id : `x:${pre ? 'pre' : bandOf(id)}:${a.name}`;
      if (seen.has(k) || a.id === id || (isCourse && !K.has(a.id))) continue;
      seen.add(k);
      opts.push(isCourse ? { key: k, id: a.id } : { key: k, ext: true, pre, name: a.name });
    }
    if (opts.length) entries.push({ to: id, kind: p.kind, opts, pi });
  });

  // Longest path inside the band (a prerequisite from another year says nothing about the column). A cycle (bad data) just stops the recursion.
  const incoming = new Map();
  for (const e of entries) for (const o of e.opts) if (!o.ext && bandOf(o.id) === bandOf(e.to)) (incoming.get(e.to) ?? incoming.set(e.to, []).get(e.to)).push([o.id, e.kind === 'קדם' ? 1 : 0]);
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
  const nodes = new Map(order.map((id) => [id, { key: id, type: 'course', id, band: bandOf(id), depth: depthOf(id), sub: 0, year: yr.get(id) ?? null }]));
  // Sub-column inside the band: one per depth, a crowded depth split into ROWS-sized (balanced) columns.
  for (const b of new Set([...nodes.values()].map((n) => n.band))) {
    const ids = order.filter((id) => nodes.get(id).band === b), depths = [...new Set(ids.map((id) => nodes.get(id).depth))].sort((x, y) => x - y);
    let sub = 0;
    for (const d of depths) {
      const at = ids.filter((id) => nodes.get(id).depth === d), k = Math.ceil(at.length / ROWS), per = Math.ceil(at.length / k);
      at.forEach((id, i) => { nodes.get(id).sub = sub + Math.floor(i / per); });
      sub += k;
    }
  }
  for (const e of entries) for (const o of e.opts) if (o.ext) { // one pill per band and name, in the earliest column of its targets, just above the shallowest one
    const t = nodes.get(e.to);
    if (o.pre) { nodes.get(o.key) ?? nodes.set(o.key, { key: o.key, type: 'ext', pre: true, name: o.name, band: PRE_BAND, depth: 0, sub: 0, year: null }); continue; }
    const n = nodes.get(o.key) ?? nodes.set(o.key, { key: o.key, type: 'ext', name: o.name, band: t.band, depth: t.depth - 1, sub: t.sub, year: t.year }).get(o.key);
    n.sub = Math.min(n.sub, t.sub); n.depth = Math.min(n.depth, t.depth - 1);
  }

  // Columns in flow order (band, sub-column), an empty one skipped. Rows: depth, then list order (the sort is stable; ext pills come first).
  const list = [...nodes.values()], cols = [], bands = [];
  for (const b of [...new Set(list.map((n) => n.band))].sort((x, y) => x - y)) {
    const year = b >= 0 && b < 4 ? b + 1 : null;
    const band = { year, kind: b === PRE_BAND ? 'pre' : year ? 'year' : 'other', name: b === PRE_BAND ? PRE_NAME : bandName(year), note: b === PRE_BAND ? PRE_NOTE : null, first: cols.length, n: 0 };
    for (const s of [...new Set(list.filter((n) => n.band === b).map((n) => n.sub))].sort((x, y) => x - y)) {
      list.filter((n) => n.band === b && n.sub === s).sort((x, y) => x.depth - y.depth).forEach((n, row) => { n.col = cols.length; n.row = row; });
      cols.push({});
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

// Paths that carry a planned course's contribution: from a planned course, or from an "או" diamond one of the planned courses feeds.
export function planPaths(paths, plan) {
  const via = new Set(paths.filter((p) => plan.has(p.from)).map((p) => p.to));
  return new Set(paths.filter((p) => plan.has(p.from) || via.has(p.from)).map((p) => p.id));
}

// Degree progress in credits. Required = the lists' minCredits (an approximation: the regulations have more rules) with the specialization lists replaced by
// data.degree.specCredits. A course counts once, for the first list that holds it, and a list never counts past its minimum, so surplus electives don't inflate
// the bar. The specialization part is the chosen areas' courses (every specialization list while none is chosen), done first, capped. `adds` = the plan's own
// credits; `specLeft` = specialization credits still missing (null while no area is chosen).
export const isDone = (st, id) => ['done', 'exempt'].includes(st[id]?.status);
export function progressInfo(data, st, plan = new Set(), specs = []) {
  const seen = new Set(), sp = specLists(data, specs), cap = Number(data.degree?.specCredits) || 0, credits = (id) => Number(data.courses[id].credits) || 0;
  let total = 0, done = 0, planned = 0;
  for (const l of data.lists.filter((x) => !sp.all.has(x.code))) {
    const ids = l.courses.filter((id) => data.courses[id] && !seen.has(id)), min = Number(l.minCredits) || 0;
    ids.forEach((id) => seen.add(id));
    const sum = (f) => ids.filter(f).reduce((s, id) => s + credits(id), 0);
    const d = Math.min(min, sum((id) => isDone(st, id)));
    total += min; done += d; planned += Math.min(min - d, sum((id) => !isDone(st, id) && plan.has(id)));
  }
  const pool = new Set((specs.length ? [...sp.mandatory, ...sp.elective] : data.lists.filter((x) => sp.all.has(x.code)).flatMap((x) => x.courses)).filter((id) => data.courses[id] && !seen.has(id)));
  const pick = (f) => [...pool].filter(f).reduce((s, id) => s + credits(id), 0), sd = Math.min(cap, pick((id) => isDone(st, id)));
  done += sd; planned += Math.min(cap - sd, pick((id) => !isDone(st, id) && plan.has(id)));
  const adds = [...plan].filter((id) => data.courses[id] && !isDone(st, id)).reduce((s, id) => s + credits(id), 0);
  return { total: Number(data.degree?.total) || total + cap, done, planned, adds, specLeft: specs.length ? cap - sd : null };
}
// Courses the plan newly opens: blocked now, not blocked once the plan's courses count as passed (the plan's own courses excluded).
export function newlyUnlocked(data, state, plan) {
  if (!plan.size) return 0;
  const before = classify(data, state).statuses, after = classify(data, { ...state, passed: [...new Set([...(state.passed ?? []), ...plan])] }).statuses;
  return Object.keys(before).filter((id) => !plan.has(id) && before[id].status === 'blocked' && after[id].status !== 'blocked').length;
}


// ---------- neural-style geometry (pure) ----------
export const G = { pitch: 150, row: 72, padX: 28, padY: 20, head: 58, bandGap: 32, orR: 11, orDx: 76, extHW: 66, extR: 15, bulge: 56 };
export const truncate = (s, n = 18) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
// Edge leaves the near side of one circle and enters the near side of the next (flow runs right to left in RTL).
export const edgeEnds = (a, b) => { const d = b.x < a.x ? -1 : 1; return [{ x: a.x + d * a.hw, y: a.y }, { x: b.x - d * b.hw, y: b.y }]; };
// Two nodes in one column: edgePath would be a straight line through the column, so bow out to the right (further for a longer hop, clear of the names between).
export const sameColPath = (a, b) => { const x1 = a.x + a.hw, x2 = b.x + b.hw, k = G.bulge + Math.min(40, Math.abs(b.y - a.y) / 6); return `M${x1},${a.y} C${x1
  + k},${a.y} ${x2 + k},${b.y} ${x2},${b.y}`; };

export function geometry(L, creditsOf = () => 0) {
  const radius = (n) => (n.type === 'ext' ? G.extR : nodeRadius(creditsOf(n.id)));
  const W = G.padX * 2 + L.cols.length * G.pitch + Math.max(0, L.bands.length - 1) * G.bandGap, top = G.head + G.padY;
  // x of each column and each band's box, band by band from the right edge
  const colX = [], bands = [];
  let xr = W - G.padX;
  for (const b of L.bands) {
    for (let j = 0; j < b.n; j++) colX[b.first + j] = xr - (j + 0.5) * G.pitch;
    bands.push({ year: b.year, kind: b.kind, name: b.name, note: b.note, x: xr - b.n * G.pitch, w: b.n * G.pitch });
    xr -= b.n * G.pitch + G.bandGap;
  }
  // A column's step is at least a row, and enough for what sits between two circles that follow each other: the upper one's name (16px below it)
  // and the lower one's "פותח N" badge (riding 0.85r + 8 above its centre), plus a small gap.
  const byCol = Object.groupBy(L.nodes, (n) => n.col), step = {};
  for (const [c, col] of Object.entries(byCol)) step[c] = Math.max(G.row, ...col.slice(1).map((n, i) => radius(col[i]) + 22 + 0.85 * radius(n) + 12));
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



// panzoom's zoomWithWheel takes one fixed step per wheel event, so the step follows the event's size: a mouse notch zooms about 16%,
// a trackpad's stream of small events stays gentle (Firefox reports lines, not pixels).
export const wheelStep = (e) => Math.max(0.03, Math.min(0.6, (Math.abs(e.deltaY || e.deltaX) * (e.deltaMode ? 33 : 1) / 100) * 0.45));

// Opening scale: the whole graph on a desktop; on a phone fit by height (floor 0.3), pinned to year א׳ on the right, one finger pans.
export const fitScale = (vw, vh, W, H) => (vw >= 600 ? Math.max(0.2, Math.min(1, vw / W, vh / H)) : Math.max(0.3, Math.min(1, vh / H)));
