// year-probe1-residual.mjs - why does K=1000 still lose 4/1752? prints the pairs that beat the solver's best B for that A.
import { refYear } from '../repro/year-lib.mjs';
import { genInstance } from '../repro/year-gen.mjs';
import { loadProto, setKnobs } from './year-proto-lib.mjs';
const P = await loadProto();
const keyA = (g) => [...g].sort().join();
setKnobs({ __B_K: 1000 });
for (let seed = 1; seed <= 300; seed++) {
  const inst = genInstance(seed), ref = refYear({ ...inst, opts: { emptyConvention: 'zero' } });
  if (!ref.pairs.length) continue;
  const res = P.searchYear({ ...inst, topK: 100000, timeLimitMs: 6000 });
  const perA = new Map();
  for (const q of ref.pairs) { const k = keyA(q.aGroups); if (!perA.has(k) || q.score > perA.get(k).score) perA.set(k, q); }
  for (const p of res.results) {
    const q = perA.get(keyA(p.a.groups));
    if (q && q.score - p.score > 1e-6) {
      console.log(`seed ${seed}: A=${p.a.courses} solver B=[${p.b?.courses}] ${p.score.toFixed(3)} missing=[${p.missing}] | ref B=[${q.bIds}] ${q.score.toFixed(3)} missing=[${q.missing}] parts=${JSON.stringify(q.parts)}`);
      break;
    }
  }
}
