// year-probe2-pins.mjs - probe 2: the pin warning prototype (knob __RELAX_PINS) on the whole year-exhaustive generator (300 seeds).
// Counts pairs whose ב׳ plan holds a pinned course in another group (the repro's "silently re-grouped") and how many of them carry the new warning.
// RUN: node solver-audit/plan-probes/year-probe2-pins.mjs
import { searchYear } from '../../web/solver-core.js';
import { refValidatePair } from '../repro/year-lib.mjs';
import { genInstance } from '../repro/year-gen.mjs';
import { loadProto, setKnobs } from './year-proto-lib.mjs';
const P = await loadProto();
for (const [label, fn, knobs] of [['orig', searchYear, {}], ['warn', P.searchYear, { __RELAX_PINS: 1 }], ['warn+distinct+K5', P.searchYear, { __RELAX_PINS: 1, __A_DISTINCT: 1, __B_K: 5 }]]) {
  setKnobs(knobs);
  let regrouped = 0, warned = 0, ex = [], pinned = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const inst = genInstance(seed);
    if (inst.pins.length) pinned++;
    const res = fn({ ...inst, topK: 100000, timeLimitMs: 6000 });
    for (const p of res.results) {
      const errs = refValidatePair(inst, p).filter((e) => e.includes('silently re-grouped'));
      if (!errs.length) continue;
      regrouped++;
      if (p.warnings.some((w) => w.includes('הנעיצה'))) warned++;
      if (ex.length < 3) ex.push(`seed ${seed}: ${errs[0]} | warnings=${JSON.stringify(p.warnings)}`);
    }
  }
  console.log(`${label.padEnd(18)} instances with a pin=${pinned}; re-grouped pairs=${regrouped}; of them with the warning=${warned}; ${ex.join(' ;; ')}`);
}
