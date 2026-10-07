// precision-p2-gap.mjs - probe 2: what is the "right" gap on REAL data? Compares, on random real-data plans (disjoint option combos),
//   slot : current code, empty 30-min slots between the first and last occupied slot of a day
//   g1   : real minutes, every idle minute (the audit's metric-oracle: the 10-minute break between two back-to-back lessons counts as 10 gap minutes)
//   g2   : real minutes, a pause minus the 10-minute recess (never below 0)
// and the lessons whose end is not :50 (the only case where slot and g2 can differ on real data).
// RUN: node solver-audit/plan-probes/precision-p2-gap.mjs
import { buildOptions, overlaps, merge, toMin } from '../../web/solver-core.js';
import { mulberry32, realFiles, loadReal, pick, ri } from '../repro/search-lib.mjs';

const popcount = (x) => { x >>>= 0; let c = 0; while (x) { c += x & 1; x >>>= 1; } return c; };
const slotGap = (mask) => { let g = 0; for (let d = 1; d <= 6; d++) { const b = mask[d] >>> 0; if (!b) continue; const lo = 31 - Math.clz32(b & -b), hi = 31 - Math.clz32(b); g += (hi - lo + 1 - popcount(b)) * 30; } return g; };
const minGap = (meetings, recess) => {
  let g = 0;
  for (let d = 1; d <= 6; d++) {
    const iv = meetings.filter((m) => m.day === d).map((m) => [toMin(m.start), toMin(m.end)]).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < iv.length; i++) g += Math.max(0, iv[i][0] - iv[i - 1][1] - recess);
  }
  return g;
};
const rng = mulberry32(2026);
const files = ['2027-1', '2027-2', '2027-3'].flatMap((s) => realFiles(s).map((f) => [s, f]));
let plans = 0, slotEqG2 = 0, slotEqG1 = 0, g1gt = 0, g2diff = [], nonFiftyPlans = 0;
const t0 = Date.now();
while (Date.now() - t0 < 20000 && plans < 20000) {
  const [s, f] = pick(rng, files);
  const d = loadReal(s, f), ids = Object.keys(d.courses).filter((id) => d.courses[id].offered);
  const k = ri(rng, 2, 6), chosen = [];
  let mask = new Array(7).fill(0);
  for (let t = 0; t < 40 && chosen.length < k; t++) {
    const o = pick(rng, buildOptions(d.courses[pick(rng, ids)]).concat([null]));
    if (!o || overlaps(mask, o.mask)) continue;
    chosen.push(o); mask = merge(mask, o.mask);
  }
  if (chosen.length < 2) continue;
  plans++;
  const ms = chosen.flatMap((o) => o.meetings);
  const a = slotGap(mask), g1 = minGap(ms, 0), g2 = minGap(ms, 10);
  if (ms.some((m) => !m.end.endsWith(':50'))) nonFiftyPlans++;
  if (a === g2) slotEqG2++; else g2diff.push(a - g2);
  if (a === g1) slotEqG1++; else if (g1 > a) g1gt++;
}
const hist = {}; for (const x of g2diff) hist[x] = (hist[x] ?? 0) + 1;
console.log(`INFO real-data plans=${plans}; slot==g2 in ${slotEqG2} (${(100 * slotEqG2 / plans).toFixed(2)}%); slot==g1 in ${slotEqG1} (${(100 * slotEqG1 / plans).toFixed(1)}%); g1>slot in ${g1gt}`);
console.log(`INFO plans containing a lesson whose end is not :50: ${nonFiftyPlans}; slot-g2 differences (minutes: count) ${JSON.stringify(hist)}`);
