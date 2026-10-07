// metric-graph.mjs - PREFIX metric. Checks downstream(), chainDepth(), courseValue(), unlockCounts() against an
// independent reference on all 144 real data files (web/data/afeka/<2027-1|2|3>/*.json), then the self-loop,
// cycle-order and WeakMap-cache behaviour.
//
// Targets: web/solver-core.js:105-111 (dependents), 113-131 (downstream + DOWN WeakMap), 133-137 (unlockCounts),
//          139-151 (chainDepth), 153-161 (courseValue); callers web/app.js:134-142 (yearView), 152-155 (pickData).
// Run:     node solver-audit/repro/metric-graph.mjs      (any cwd, ~1 s, deterministic, no network)
// Output:  CHECK <id> PASS|FAIL ...  /  BUG <id> REPRODUCED|NOT-REPRODUCED ...   exit 0 iff all CHECK PASS and all BUG REPRODUCED.
// Reference: own Tarjan SCC + Kahn longest-path + BFS reachability written from the meaning of the numbers
//            (courses reachable below X through "kadam" links; semesters of the longest chain), not from solver code.
import fs from 'node:fs';
import { downstream, chainDepth, courseValue, unlockCounts } from '../../web/solver-core.js';
import { yearView } from '../../web/app.js';

let bad = 0;
const check = (id, ok, d) => { console.log(`CHECK ${id} ${ok ? 'PASS' : 'FAIL'} ${d}`); if (!ok) bad++; };
const bug = (id, rep, d) => { console.log(`BUG ${id} ${rep ? 'REPRODUCED' : 'NOT-REPRODUCED'} ${d}`); if (!rep) bad++; };
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const ROOT = new URL('../../web/data/afeka/', import.meta.url);
const FILES = ['2027-1', '2027-2', '2027-3'].flatMap((s) => fs.readdirSync(new URL(`${s}/`, ROOT)).filter((f) => f.endsWith('.json'))
  .map((f) => ({ key: `${s}/${f}`, data: JSON.parse(fs.readFileSync(new URL(`${s}/${f}`, ROOT), 'utf8')) })));
check('graph-0', FILES.length === 144, `loaded ${FILES.length} real data files`);

// ---- independent reference ------------------------------------------------------------------------------------------
// edges: prerequisite id -> dependent id, only for kind 'קדם' (a corequisite 'מקביל' can be taken in the same semester).
function edges(data, dropSelf) {
  const adj = new Map(Object.keys(data.courses).map((id) => [id, new Set()]));
  for (const [id, c] of Object.entries(data.courses)) for (const p of c.prereqs) {
    if (p.kind !== 'קדם') continue;
    for (const a of p.anyOf) if (a.id && adj.has(a.id) && !(dropSelf && a.id === id)) adj.get(a.id).add(id);
  }
  return adj;
}
function scc(adj) { // Tarjan; returns list of components
  let idx = 0; const index = new Map(), low = new Map(), on = new Set(), st = [], out = [];
  const go = (v) => {
    index.set(v, idx); low.set(v, idx); idx++; st.push(v); on.add(v);
    for (const w of adj.get(v)) {
      if (!index.has(w)) { go(w); low.set(v, Math.min(low.get(v), low.get(w))); } else if (on.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) === index.get(v)) { const comp = []; let w; do { w = st.pop(); on.delete(w); comp.push(w); } while (w !== v); out.push(comp); }
  };
  for (const v of adj.keys()) if (!index.has(v)) go(v);
  return out;
}
function reference(data, dropSelf = true) {
  const adj = edges(data, dropSelf);
  const reach = new Map();
  for (const s of adj.keys()) { // BFS: everything strictly below s (s itself only if a real cycle returns to it)
    const seen = new Set(), q = [...adj.get(s)];
    while (q.length) { const x = q.pop(); if (seen.has(x)) continue; seen.add(x); q.push(...adj.get(x)); }
    reach.set(s, seen);
  }
  // longest path (edges) below each node: Kahn on the DAG, children before parents
  const indeg = new Map([...adj.keys()].map((k) => [k, 0]));
  for (const ds of adj.values()) for (const d of ds) indeg.set(d, indeg.get(d) + 1);
  const order = [], q = [...adj.keys()].filter((k) => indeg.get(k) === 0);
  while (q.length) { const v = q.shift(); order.push(v); for (const d of adj.get(v)) { indeg.set(d, indeg.get(d) - 1); if (indeg.get(d) === 0) q.push(d); } }
  const acyclic = order.length === adj.size, depth = new Map();
  if (acyclic) for (const v of order.reverse()) depth.set(v, Math.max(-1, ...[...adj.get(v)].map((d) => depth.get(d))) + 1);
  return { adj, reach, depth, acyclic };
}
const clean = (data) => { // same dataset with every self-reference removed from the prerequisite lists
  const d = structuredClone(data);
  for (const [id, c] of Object.entries(d.courses)) c.prereqs = c.prereqs.map((p) => ({ ...p, anyOf: p.anyOf.filter((a) => a.id !== id) })).filter((p) => p.anyOf.length);
  return d;
};
const selfLoops = (data) => Object.entries(data.courses).filter(([id, c]) => c.prereqs.some((p) => p.kind === 'קדם' && p.anyOf.some((a) => a.id === id))).map(([id]) => id);

// ---- 1. what the real graphs look like --------------------------------------------------------------------------------
let multiCycle = 0, selfFiles = 0, selfCourses = 0;
for (const { data } of FILES) {
  const comps = scc(edges(data, true)).filter((c) => c.length > 1);
  multiCycle += comps.length;
  const sl = selfLoops(data); if (sl.length) selfFiles++; selfCourses += sl.length;
}
check('graph-1', multiCycle === 0, `no multi-course prerequisite cycle in any of 144 files (Tarjan SCCs of size>1: ${multiCycle})`);
bug('metric-selfloop', selfFiles > 0, `${selfFiles}/144 files contain a course listing ITSELF as a kadam prerequisite (${selfCourses} course-file pairs)`);

// ---- 2. solver == reference on self-loop-free data (all 144 files) ---------------------------------------------------------
{
  let courses = 0, badDown = 0, badDepth = 0, badValue = 0, badUnlock = 0, firstBad = '';
  const rnd = mulberry32(7);
  for (const { key, data } of FILES) {
    const d = clean(data), ref = reference(d), down = downstream(d), depth = chainDepth(d), val = courseValue(d);
    if (!ref.acyclic) { check('graph-2', false, `${key} is not acyclic after removing self-loops`); continue; }
    const ids = Object.keys(d.courses);
    const passed = ids.filter(() => rnd() < 0.3), uc = unlockCounts(d, passed), done = new Set(passed);
    for (const id of ids) {
      courses++;
      const r = ref.reach.get(id);
      if (down[id].size !== r.size || [...r].some((x) => !down[id].has(x))) { badDown++; firstBad ||= `${key}:${id} downstream`; }
      if (depth[id] !== ref.depth.get(id)) { badDepth++; firstBad ||= `${key}:${id} depth ${depth[id]} vs ${ref.depth.get(id)}`; }
      if (val[id] !== d.courses[id].credits + r.size + 2 * ref.depth.get(id)) { badValue++; firstBad ||= `${key}:${id} value`; }
      if (uc[id] !== [...r].filter((x) => !done.has(x)).length) { badUnlock++; firstBad ||= `${key}:${id} unlockCounts`; }
    }
  }
  check('graph-2', !badDown && !badDepth && !badValue && !badUnlock,
    `on ${courses} course records (self-references removed): downstream wrong ${badDown}, chainDepth wrong ${badDepth}, courseValue wrong ${badValue}, unlockCounts wrong ${badUnlock} ${firstBad}`);
}

// ---- 3. real data with the self-references left in (what the app actually loads) ---------------------------------------
{
  const rows = [];
  for (const { key, data } of FILES) {
    const sl = selfLoops(data); if (!sl.length) continue;
    const ref = reference(data, true), down = downstream(data), depth = chainDepth(data), val = courseValue(data), uc = unlockCounts(data, []);
    for (const id of Object.keys(data.courses)) {
      const wantVal = data.courses[id].credits + ref.reach.get(id).size + 2 * ref.depth.get(id);
      if (down[id].size !== ref.reach.get(id).size || depth[id] !== ref.depth.get(id) || val[id] !== wantVal || uc[id] !== ref.reach.get(id).size) {
        rows.push({ key, id, self: sl.includes(id), dDown: down[id].size - ref.reach.get(id).size, dDepth: depth[id] - ref.depth.get(id), dVal: val[id] - wantVal, ucSelf: down[id].has(id) });
      }
    }
  }
  const selfRows = rows.filter((r) => r.self), anc = rows.filter((r) => !r.self);
  bug('metric-selfloop-values', rows.length > 0, `${rows.length} course records get a wrong value/unlock count in the real data: ${selfRows.length} are the self-referencing courses themselves, ${anc.length} are their ancestors`);
  const ex = selfRows.find((r) => r.key === '2027-1/10-2024.json' && r.id === '10253'), exA = anc.find((r) => r.key === '2027-1/10-2024.json');
  console.log(`  e.g. ${ex ? `${ex.key}:${ex.id} downstream +${ex.dDown}, depth +${ex.dDepth}, courseValue +${ex.dVal}, id in its own downstream set: ${ex.ucSelf}` : 'n/a'}`);
  console.log(`  e.g. ancestor ${exA ? `${exA.key}:${exA.id} depth +${exA.dDepth}, courseValue +${exA.dVal}` : 'none'}`);
  const dist = {}; for (const r of rows) { const k = `down+${r.dDown}/depth+${r.dDepth}/value+${r.dVal}`; dist[k] = (dist[k] ?? 0) + 1; }
  console.log(`  deviation histogram over the ${rows.length} affected records: ${JSON.stringify(dist)}`);
  const maxVal = Math.max(...rows.map((r) => r.dVal));
  console.log(`  largest courseValue error in real data: +${maxVal}; ancestors with an inflated value: ${anc.filter((r) => r.dVal > 0).length}; unlockCounts of a self-referencing course counts itself: ${selfRows.every((r) => r.ucSelf)}`);
  // The only deviation is +1 downstream (itself) and, for a leaf self-loop, +1 depth that propagates to ancestors.
  check('graph-3', selfRows.every((r) => r.dDown === 1) && rows.every((r) => r.dDepth >= 0 && r.dVal >= 0), 'every deviation is an inflation (never an under-count); each self-referencing course counts itself exactly once in downstream');
}

// ---- 4. chainDepth under a real multi-course cycle: order dependent (synthetic: real data has none, see graph-1) -----------
{
  const mk = (order) => { const c = { A: ['B'], B: ['A'], T: ['B'] }; // A needs B, B needs A, T needs B  => cycle A<->B with a tail T
    return { courses: Object.fromEntries(order.map((id) => [id, { name: id, credits: 1, offered: true, groups: [], prereqs: c[id].map((p) => ({ kind: 'קדם', anyOf: [{ id: p, name: p }] })) }])) }; };
  const perms = [['A', 'B', 'T'], ['B', 'A', 'T'], ['T', 'B', 'A'], ['T', 'A', 'B'], ['A', 'T', 'B'], ['B', 'T', 'A']];
  const canon = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  const distinct = new Set(perms.map((p) => canon(chainDepth(mk(p)))));
  const downs = new Set(perms.map((p) => canon(Object.fromEntries(Object.entries(downstream(mk(p))).map(([k, v]) => [k, [...v].sort()])))));
  bug('metric-cycle-order', distinct.size > 1, `chainDepth of a 2-cycle + tail gives ${distinct.size} different answers over 6 key orders (e.g. ${[...distinct].slice(0, 2).join(' | ')}); downstream gives ${downs.size} (order independent)`);
}

// ---- 5. DOWN WeakMap cache --------------------------------------------------------------------------------------------
{
  const d = clean(FILES[0].data);
  check('graph-5a', downstream(d) === downstream(d), 'downstream(data) returns the same cached object for the same dataset object');
  const v1 = yearView(FILES.find((f) => f.key === '2027-1/30-2026.json').data, FILES.find((f) => f.key === '2027-2/30-2026.json').data);
  const v2 = yearView(FILES.find((f) => f.key === '2027-1/30-2026.json').data, FILES.find((f) => f.key === '2027-2/30-2026.json').data);
  check('graph-5b', downstream(v1) !== downstream(v2), 'every yearView()/pickData() builds a new object, so the year-scope view recomputes downstream once per refresh (a cache miss, never a stale hit)');
  const big = FILES.reduce((a, f) => (Object.keys(f.data.courses).length > Object.keys(a.data.courses).length ? f : a));
  const t0 = performance.now(); for (let i = 0; i < 200; i++) { chainDepth(structuredClone(big.data)); } const tCd = (performance.now() - t0) / 200;
  const t1 = performance.now(); for (let i = 0; i < 200; i++) { downstream(structuredClone(big.data)); } const tDs = (performance.now() - t1) / 200;
  console.log(`  timing (wall clock, includes structuredClone of ${Object.keys(big.data.courses).length} courses): chainDepth ${tCd.toFixed(2)} ms, downstream ${tDs.toFixed(2)} ms per call`);
  check('graph-5c', tCd < 50 && tDs < 50, 'recomputing chainDepth/downstream on the largest real file is far below a frame budget, so the missing cache for year view / worker clones is only a minor cost');
  // staleness exists only if somebody mutates a dataset after first use
  const m = structuredClone(clean(FILES[0].data)); const ids = Object.keys(m.courses);
  const a = ids.find((id) => m.courses[id].prereqs.length === 0), b = ids.find((id) => id !== a && !downstream(m)[a].has(id));
  const before = unlockCounts(m)[a]; m.courses[b].prereqs.push({ kind: 'קדם', anyOf: [{ id: a, name: a }] });
  const after = unlockCounts(m)[a], fresh = downstream(structuredClone(m))[a].size, depthNow = chainDepth(m)[a];
  bug('metric-weakmap-stale', after === before && fresh > before, `after adding a prerequisite edge to an already-used dataset unlockCounts(${a}) stays ${after} (a fresh copy of the same data: ${fresh}); chainDepth is recomputed (${depthNow}) so courseValue mixes stale downstream with fresh depth`);
  // does any shipped code mutate course data? static scan of web/*.js
  const src = fs.readdirSync(new URL('../../web/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => [f, fs.readFileSync(new URL(`../../web/${f}`, import.meta.url), 'utf8')]);
  const pat = /\.prereqs\s*(=[^=]|\.(push|splice|pop|shift|unshift))|\bcourses\s*\[[^\]]+\]\s*=[^=]|\.courses\s*=[^=]|delete\s+[\w.]*\.courses/;
  const hits = src.flatMap(([f, t]) => t.split('\n').map((l, i) => [f, i + 1, l]).filter(([, , l]) => pat.test(l)).map(([ff, n, l]) => `${ff}:${n}: ${l.trim().slice(0, 90)}`));
  console.log(`  static scan of web/*.js for code that edits a loaded dataset's courses/prereqs: ${hits.length ? '\n    ' + hits.join('\n    ') : 'no match'}`);
  check('graph-5d', hits.every((h) => /^app\.js:(138|140):/.test(h)) && hits.length === 2,'the only writes to a `courses` map in web/*.js are app.js:138 and :140, which fill the NEW yearView object; nothing edits a dataset that downstream() may already have cached');
}

// ---- 6. duplicate prerequisite ids ---------------------------------------------------------------------------------------
{
  const dup = FILES.flatMap(({ key, data }) => Object.entries(data.courses).filter(([, c]) => c.prereqs.some((p) => new Set(p.anyOf.map((a) => a.id)).size < p.anyOf.length && p.anyOf.some((a) => a.id)))
    .map(([id]) => `${key}:${id}`));
  const d0 = FILES.find((f) => f.key === '2027-1/30-2026.json').data;
  const withDup = structuredClone(clean(d0)), without = structuredClone(withDup);
  const id = Object.keys(withDup.courses).find((x) => withDup.courses[x].prereqs.length);
  withDup.courses[id].prereqs[0].anyOf.push({ ...withDup.courses[id].prereqs[0].anyOf[0] });
  const same = JSON.stringify(Object.values(courseValue(withDup))) === JSON.stringify(Object.values(courseValue(without)));
  check('graph-6', same, `${dup.length} real course records list the same prerequisite id twice in one anyOf (e.g. ${dup[0]}); duplicating an alternative changes no value (sets and max are idempotent)`);
}
process.exitCode = bad ? 1 : 0;
