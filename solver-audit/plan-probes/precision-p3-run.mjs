// precision-p3-run.mjs - probe 3: the prototype (minute-exact blocks/windows + per-option outside minutes + F-18) vs a minute-exact exhaustive reference.
// 1. synthetic off-grid instances: proto.search(prune:true) == referenceMinutes top-K (scores, 6 metrics, plans), N seeds
// 2. the same with the CURRENT search() (control): must fail often, shows the bug rate
// 3. bound admissibility at every DFS node of the prototype (instrumented copy, as repro/search-bound-admissible.mjs)
// 4. real data (committed files) with off-grid blocks/windows: proto vs minute reference
// RUN: node solver-audit/plan-probes/precision-p3-run.mjs [gap=g2|g1|slot]
import { search as searchOld } from '../../web/solver-core.js';
import { buildProto } from './proto-lib.mjs';
import { referenceMinutes, genOffGrid, mulberry32, hhmm } from './precision-ref.mjs';
import { compareTopK, tagResults, genInstance, realFiles, loadReal, stripSelfLoops, withExams, realInstance, pick, ri } from '../repro/search-lib.mjs';

const GAP = process.argv[2] ?? 'g2';
const N = Number(process.argv[3] ?? 700);
const { mod: P } = await buildProto({ gap: GAP, tag: `proto-run-${GAP}` });
const { mod: PH } = await buildProto({ gap: GAP, hooks: true, tag: `proto-hooks-${GAP}` });
const line = (s) => console.log(s);

function sweep(label, searchFn, mk, n, refOpts) {
  let bad = 0, skipped = 0, firstBad = null, feasible = 0, ran = 0;
  for (let seed = 1; seed <= n; seed++) {
    const inst = mk(mulberry32(seed * 7919));
    let ref;
    try { ref = referenceMinutes(inst, refOpts); } catch { skipped++; continue; }
    ran++;
    const out = searchFn({ ...inst, timeLimitMs: 1e9, prune: true });
    const problems = compareTopK(tagResults(out.results, inst.data), ref, inst.topK);
    if (out.partial) problems.push('partial');
    if (ref.sols.length) feasible++;
    else if (out.results.length) problems.push('results although reference has none');
    if (problems.length) { bad++; firstBad ??= { seed, problems: problems.slice(0, 2) }; }
  }
  line(`${label}: ran=${ran} skipped=${skipped} feasible=${feasible} mismatches=${bad}${firstBad ? ' first=' + JSON.stringify(firstBad).slice(0, 300) : ''}`);
  return { ran, bad };
}
const refOpts = { gap: GAP };
const a = sweep(`P3-1 proto(gap=${GAP}) vs minute reference, off-grid synthetic`, P.search, genOffGrid, N, refOpts);
const b = sweep('P3-2 CURRENT search() vs minute reference (control: should mismatch)', searchOld, genOffGrid, N, refOpts);
// the same with on-grid constraints (genInstance as the audit uses it): proto must still equal the minute reference
const c = sweep(`P3-3 proto(gap=${GAP}) vs minute reference, on-grid synthetic (audit generator)`, P.search, (r) => genInstance(r), N, refOpts);

// 3. admissibility hooks
const KEYS = ['friends', 'progress', 'freeDays', 'compact', 'timeWindow', 'examSpread'];
function runInstance(inst) {
  const stack = [], viol = [];
  let nodes = 0;
  globalThis.__searchHook = {
    enter(i, bound, terms, selDesc) { const f = { i, bound, terms: { ...terms }, sel: selDesc, best: -Infinity, bestM: {} }; stack.push(f); nodes++; return f; },
    leaf(score, m, weights) { const f = stack[stack.length - 1]; if (score > f.best) f.best = score; for (const k of KEYS) f.bestM[k] = Math.max(f.bestM[k] ?? -Infinity, (weights[k] ?? 0) * (m[k] ?? 0)); },
    exit(f) {
      stack.pop();
      if (f.best > -Infinity && f.bound < f.best) viol.push({ i: f.i, bound: f.bound, best: f.best, badTerms: KEYS.filter((k) => f.terms[k] + 1e-12 < f.bestM[k]) });
      const p = stack[stack.length - 1];
      if (p) { if (f.best > p.best) p.best = f.best; for (const k of KEYS) p.bestM[k] = Math.max(p.bestM[k] ?? -Infinity, f.bestM[k] ?? -Infinity); }
    },
  };
  try { PH.search({ ...inst, topK: 1e9, timeLimitMs: 1e9, prune: false }); } finally { globalThis.__searchHook = null; }
  return { nodes, viol };
}
function boundSweep(label, mk, n) {
  let nodes = 0, bad = 0, first = null;
  for (let seed = 1; seed <= n; seed++) {
    const inst = mk(mulberry32(seed * 104729));
    const r = runInstance(inst);
    nodes += r.nodes;
    if (r.viol.length) { bad++; first ??= { seed, v: r.viol[0] }; }
  }
  line(`${label}: instances=${n} nodes=${nodes} instances-with-violated-node=${bad}${first ? ' first=' + JSON.stringify(first) : ''}`);
  return bad;
}
const nf = (rng) => { const i = genOffGrid(rng, { parallelRate: 0, pinRate: 0 }); i.friends = []; i.bias = {}; return i; };
const wf = (rng) => { const i = genOffGrid(rng, { parallelRate: 0, pinRate: 0 }); i.bias = {}; if (!i.friends.length) i.friends = [{ name: 'F', groups: Object.values(i.data.courses).flatMap((x) => x.groups.map((g) => g.id)).filter((_, k) => k % 3 === 0), weight: 2, active: true }]; return i; };
const tw = (rng) => { const i = nf(rng); i.weights = { friends: 0, progress: 0, freeDays: 0, compact: 0, timeWindow: 5, examSpread: 0 }; return i; };
const bb = [boundSweep('P3-4 bound admissible, off-grid, no friends', nf, 400), boundSweep('P3-5 bound admissible, off-grid, with friends', wf, 400),
  boundSweep('P3-6 bound admissible, timeWindow weight only (the term that changed)', tw, 400)];

// 4. real data
const files = ['2027-1', '2027-2', '2027-3'].flatMap((sem) => realFiles(sem).map((f) => [sem, f]));
const cache = new Map();
let rbad = 0, rran = 0, rfeas = 0, rfirst = null, rskip = 0;
const t0 = Date.now();
for (let seed = 1; seed <= 400 && Date.now() - t0 < 120000; seed++) {
  const rng = mulberry32(seed * 6151);
  const [sem, f] = files[Math.floor(rng() * files.length)];
  const key = `${sem}/${f}`;
  if (!cache.has(key)) cache.set(key, stripSelfLoops(loadReal(sem, f)));
  let data = cache.get(key);
  if (rng() < 0.5) data = withExams(data, rng);
  const inst = realInstance(rng, data, { maxProduct: 150000 });
  if (inst.courses.length < 3) { rskip++; continue; }
  const c2 = inst.constraints, minute = () => pick(rng, [0, 30, 45, 50, 49, 51, 40, 20, 15, ri(rng, 0, 59)]);
  c2.notBefore = rng() < 0.4 ? hhmm(ri(rng, 8, 11) * 60 + minute()) : ''; c2.notAfter = rng() < 0.7 ? hhmm(ri(rng, 14, 20) * 60 + minute()) : '';
  c2.windowHard = rng() < 0.3;
  c2.blocks = rng() < 0.6 ? [{ day: ri(rng, 1, 5), start: hhmm(ri(rng, 8, 17) * 60 + 50), end: hhmm(ri(rng, 18, 22) * 60 + minute()), label: 'b' }] : [];
  let ref;
  try { ref = referenceMinutes(inst, { cap: 3_000_000, gap: GAP }); } catch { rskip++; continue; }
  const out = P.search({ ...inst, timeLimitMs: 1e9 });
  rran++;
  const problems = compareTopK(tagResults(out.results, data), ref, inst.topK);
  if (ref.sols.length) rfeas++;
  if (problems.length) { rbad++; rfirst ??= { seed, key, problems: problems.slice(0, 2) }; }
}
line(`P3-7 proto vs minute reference on real data with off-grid blocks/windows: ran=${rran} skipped=${rskip} feasible=${rfeas} mismatches=${rbad}${rfirst ? ' first=' + JSON.stringify(rfirst).slice(0, 300) : ''}`);
const ok = a.bad === 0 && c.bad === 0 && bb.every((x) => x === 0) && rbad === 0;
line(`${ok ? 'CHECK' : 'FAIL'} P3 prototype == minute reference everywhere, bound admissible (control mismatches for current code: ${b.bad}/${b.ran})`);
process.exitCode = ok ? 0 : 1;

// 8. negative control: if bound() kept measuring outside in whole 30-minute slots while the leaf measures real minutes, the harness must catch it
{
  const ctl = await buildProto({ gap: GAP, hooks: true, tag: `proto-control-${GAP}`,
    extra: [['\n    const outside = sel.reduce((a, o) => a + o.out, 0);', '\n    const outside = sel.reduce((a, o) => a + Math.ceil(o.out / 30) * 30, 0);']] });
  const keep = PH.search;
  let bad = 0, nodes = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const inst = tw(mulberry32(seed * 104729));
    const stack = [], viol = [];
    globalThis.__searchHook = {
      enter(i, bound) { const f = { bound, best: -Infinity }; stack.push(f); nodes++; return f; },
      leaf(score) { const f = stack[stack.length - 1]; if (score > f.best) f.best = score; },
      exit(f) { stack.pop(); if (f.best > -Infinity && f.bound < f.best - 1e-12) viol.push(f); const p = stack[stack.length - 1]; if (p && f.best > p.best) p.best = f.best; },
    };
    try { ctl.mod.search({ ...inst, topK: 1e9, timeLimitMs: 1e9, prune: false }); } finally { globalThis.__searchHook = null; }
    if (viol.length) bad++;
  }
  line(`P3-8 NEGATIVE CONTROL (bound rounds outside up to 30-min slots, leaf in minutes): instances with a violated node = ${bad}/400 (must be > 0 so the harness can fail)`);
  void keep;
}
