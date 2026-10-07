// year-probe1-distinct.mjs - probe 1: is the prototype `distinct` option of search() correct? search({distinct:true, topK}) must equal the exhaustive reference
// (search-lib.mjs referenceSolve, the one behind C-1/C-2) reduced to ONE plan per course set (the best group variant), top-K of those.
// Also: with distinct=false the prototype equals web/ search() exactly (same results, same order). Also: pruning stays admissible (prune:true == prune:false).
// RUN: node solver-audit/plan-probes/year-probe1-distinct.mjs
import { search } from '../../web/solver-core.js';
import { mulberry32, genInstance, referenceSolve, tagResults, realFiles, loadReal, stripSelfLoops, withExams, realInstance } from '../repro/search-lib.mjs';
import { loadProto } from './year-proto-lib.mjs';
const P = await loadProto();
const setOf = (key) => [...new Set(key.split('|').map((x) => x.split(':')[0]))].sort().join();
function check(inst, label) {
  let ref;
  try { ref = referenceSolve(inst, { cap: 3_000_000 }); } catch { return 'skip'; }
  const best = new Map();
  for (const s of ref.sols) { const k = setOf(s.key); if (!best.has(k) || s.score > best.get(k)) best.set(k, s.score); }
  const want = [...best.entries()].sort((a, b) => b[1] - a[1]);
  const topK = inst.topK, w = want.slice(0, topK);
  const out = P.search({ ...inst, timeLimitMs: 1e9, distinct: true });
  const noPrune = P.search({ ...inst, timeLimitMs: 1e9, distinct: true, prune: false });
  const bad = [];
  const sets = out.results.map((r) => r.courses.slice().sort().join());
  if (new Set(sets).size !== sets.length) bad.push('duplicate course set');
  if (out.results.length !== w.length) bad.push(`count ${out.results.length} != ${w.length}`);
  out.results.forEach((r, i) => { if (w[i] && Math.abs(r.score - w[i][1]) > 1e-9) bad.push(`rank ${i} ${r.score} != ${w[i][1]}`); if (best.get(sets[i]) === undefined || Math.abs(best.get(sets[i]) - r.score) > 1e-9) bad.push(`set ${sets[i]} score ${r.score} is not its best variant ${best.get(sets[i])}`); });
  if (w.length) { const kth = w[w.length - 1][1]; for (const [k, s] of want) if (s > kth + 1e-9 && !sets.includes(k)) bad.push(`missing set ${k} ${s} > kth ${kth}`); }
  if (JSON.stringify(out.results.map((r) => r.score)) !== JSON.stringify(noPrune.results.map((r) => r.score))) bad.push('prune:true != prune:false');
  const a = search({ ...inst, timeLimitMs: 1e9 }), b = P.search({ ...inst, timeLimitMs: 1e9 });
  if (JSON.stringify(a.results) !== JSON.stringify(b.results)) bad.push('distinct=false differs from web/ search()');
  return bad.length ? `${label}: ${bad.slice(0, 3).join('; ')}` : 'ok';
}
let n = 0, skip = 0, bad = 0, first = [], multi = 0;
for (let seed = 1; seed <= 700; seed++) {
  const rng = mulberry32(seed * 7919);
  const inst = genInstance(rng);
  inst.topK = [1, 3, 10, 50][seed % 4];
  const r = check(inst, `random seed ${seed}`);
  if (r === 'skip') { skip++; continue; }
  n++; if (r !== 'ok') { bad++; if (first.length < 3) first.push(r); }
}
console.log(`random: ${n} instances, ${skip} skipped, mismatches ${bad} ${first.join(' || ')}`);
const files = ['2027-1', '2027-2', '2027-3'].flatMap((sem) => realFiles(sem).map((f) => [sem, f]));
const cache = new Map();
let rn = 0, rbad = 0, rfirst = [], rskip = 0;
for (let seed = 1; seed <= 300; seed++) {
  const rng = mulberry32(seed * 6151);
  const [sem, f] = files[Math.floor(rng() * files.length)];
  const key = `${sem}/${f}`;
  if (!cache.has(key)) cache.set(key, stripSelfLoops(loadReal(sem, f)));
  let data = cache.get(key);
  if (rng() < 0.5) data = withExams(data, rng);
  const inst = realInstance(rng, data, { maxProduct: 150000 });
  if (inst.courses.length < 3) { rskip++; continue; }
  inst.topK = [1, 3, 10, 50][seed % 4];
  const r = check(inst, `real ${key} seed ${seed}`);
  if (r === 'skip') { rskip++; continue; }
  rn++; if (r !== 'ok') { rbad++; if (rfirst.length < 3) rfirst.push(r); }
}
console.log(`real data (incl. 2027-3): ${rn} instances, ${rskip} skipped, mismatches ${rbad} ${rfirst.join(' || ')}`);
