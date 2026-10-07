// p4-cycles.mjs - F-15: are there prerequisite cycles in the real data once self-references are ignored?
// Looks at: every single file (144), every year view (yearView(A,B) as app.js builds it for scope 'year'), and what
// chainDepth() returns when the keys of a file are fed in 6 random orders (order dependence on real data).
// RUN: node solver-audit/plan-probes/p4-cycles.mjs
import fs from 'node:fs';
import { chainDepth, downstream } from '../../web/solver-core.js';
import { yearView } from '../../web/app.js';

const ROOT = new URL('../../web/data/afeka/', import.meta.url);
const load = (sem, f) => JSON.parse(fs.readFileSync(new URL(`${sem}/${f}`, ROOT), 'utf8'));
const files = (sem) => fs.readdirSync(new URL(`${sem}/`, ROOT)).filter((f) => /^\d+-\d{4}\.json$/.test(f)).sort();
// edges: only 'קדם' (what dependents() in solver-core.js uses), prerequisite -> dependent
const edges = (d, dropSelf) => {
  const adj = new Map(Object.keys(d.courses).map((id) => [id, new Set()]));
  for (const [id, c] of Object.entries(d.courses)) for (const p of c.prereqs) if (p.kind === 'קדם') for (const a of p.anyOf) if (a.id && (!dropSelf || a.id !== id)) {
    if (!adj.has(a.id)) adj.set(a.id, new Set()); // prerequisite not offered in this file: still a node, no outgoing edges from the file's own courses
    adj.get(a.id).add(id);
  }
  return adj;
};
function sccs(adj) { // iterative Tarjan
  let idx = 0; const index = new Map(), low = new Map(), on = new Set(), st = [], out = [];
  for (const root of adj.keys()) {
    if (index.has(root)) continue;
    const work = [[root, [...(adj.get(root) ?? [])], 0]];
    index.set(root, idx); low.set(root, idx); idx++; st.push(root); on.add(root);
    while (work.length) {
      const fr = work[work.length - 1], [v, ns] = fr;
      if (fr[2] < ns.length) {
        const w = ns[fr[2]++];
        if (!index.has(w)) { index.set(w, idx); low.set(w, idx); idx++; st.push(w); on.add(w); work.push([w, [...(adj.get(w) ?? [])], 0]); }
        else if (on.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
      } else {
        if (low.get(v) === index.get(v)) { const comp = []; let w; do { w = st.pop(); on.delete(w); comp.push(w); } while (w !== v); out.push(comp); }
        work.pop();
        if (work.length) { const p = work[work.length - 1][0]; low.set(p, Math.min(low.get(p), low.get(v))); }
      }
    }
  }
  return out;
}
const stats = { files: 0, selfFiles: 0, selfCourses: 0, multi: 0, multiWithSelf: 0, yv: 0, yvMulti: 0, yvSelf: 0, selfInProgramsNonEmpty: 0 };
const all = [];
for (const sem of ['2027-1', '2027-2', '2027-3']) for (const f of files(sem)) {
  const d = load(sem, f); all.push([sem, f, d]); stats.files++;
  const self = Object.entries(d.courses).filter(([id, c]) => c.prereqs.some((p) => p.kind === 'קדם' && p.anyOf.some((a) => a.id === id))).map(([id]) => id);
  if (self.length) { stats.selfFiles++; stats.selfCourses += self.length; }
  const comps = sccs(edges(d, true)).filter((c) => c.length > 1);
  stats.multi += comps.length;
  // with the self-loops left in: an SCC of size 1 with a self edge is the self-loop; size>1 would be a real cycle
  stats.multiWithSelf += sccs(edges(d, false)).filter((c) => c.length > 1).length;
}
// year views
const byKey = new Map(all.map(([s, f, d]) => [`${s}/${f}`, d]));
for (const [s, f] of [...byKey.keys()].filter((k) => k.startsWith('2027-1/')).map((k) => k.split('/'))) {
  const b = byKey.get(`2027-2/${f}`); if (!b) continue;
  const v = yearView(byKey.get(`${s}/${f}`), b); stats.yv++;
  stats.yvMulti += sccs(edges(v, true)).filter((c) => c.length > 1).length;
  stats.yvSelf += Object.entries(v.courses).filter(([id, c]) => c.prereqs.some((p) => p.kind === 'קדם' && p.anyOf.some((a) => a.id === id))).length;
}
console.log(`INFO files=${stats.files}; files with a self-referencing קדם prerequisite=${stats.selfFiles} (${stats.selfCourses} course records)`);
console.log(`INFO multi-course cycles (SCC size>1) after dropping self-loops: ${stats.multi}; with self-loops left in: ${stats.multiWithSelf}`);
console.log(`INFO year views built=${stats.yv}; multi-course cycles in them=${stats.yvMulti}; self-referencing records in them=${stats.yvSelf}`);
// order dependence of chainDepth on real data (self-loops removed = what the data looks like after F-03)
const strip = (d) => { const x = structuredClone(d); for (const [id, c] of Object.entries(x.courses)) c.prereqs = c.prereqs.map((p) => ({ ...p, anyOf: p.anyOf.filter((a) => a.id !== id) })).filter((p) => p.anyOf.length); return x; };
let diff = 0, diffRaw = 0, checked = 0;
let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const shuffle = (d) => { const ids = Object.keys(d.courses).sort(() => rnd() - 0.5); return { ...d, courses: Object.fromEntries(ids.map((id) => [id, d.courses[id]])) }; };
for (const [, , d] of all) {
  const s = strip(d), base = JSON.stringify(Object.entries(chainDepth(s)).sort()), baseRaw = JSON.stringify(Object.entries(chainDepth(d)).sort());
  for (let k = 0; k < 6; k++) {
    if (JSON.stringify(Object.entries(chainDepth(shuffle(s))).sort()) !== base) diff++;
    if (JSON.stringify(Object.entries(chainDepth(shuffle(d))).sort()) !== baseRaw) diffRaw++;
    checked++;
  }
}
console.log(`INFO chainDepth under random key order, ${checked} shuffles: differing results self-loops stripped=${diff}, raw data (self-loops in)=${diffRaw}`);
const bad = stats.multi !== 0 || stats.yvMulti !== 0 || diff !== 0;
console.log(`${bad ? 'BUG' : 'CHECK'} p4-no-real-cycles ${bad ? 'REPRODUCED' : 'PASS'} real data has no prerequisite cycle other than the self-loops; chainDepth order dependence is unreachable on it`);
