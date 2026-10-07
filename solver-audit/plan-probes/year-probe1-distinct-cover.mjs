// coverage of year-probe1-distinct.mjs: on how many instances does `distinct` change the top-K (i.e. the check is not vacuous)?
import { mulberry32, genInstance, referenceSolve } from '../repro/search-lib.mjs';
import { search } from '../../web/solver-core.js';
const setOf = (key) => [...new Set(key.split('|').map((x) => x.split(':')[0]))].sort().join();
let feas = 0, differs = 0, dupsInFlat = 0;
for (let seed = 1; seed <= 700; seed++) {
  const rng = mulberry32(seed * 7919);
  const inst = genInstance(rng); inst.topK = [1, 3, 10, 50][seed % 4];
  const ref = referenceSolve(inst);
  if (!ref.sols.length) continue;
  feas++;
  const flat = search({ ...inst, timeLimitMs: 1e9 }).results.map((r) => r.courses.slice().sort().join());
  if (new Set(flat).size < flat.length) dupsInFlat++;
}
console.log(`feasible=${feas} instances where the flat top-K already repeats a course set=${dupsInFlat}`);
