# year-notes (probe agent "year": F-11, F-12, summer)

Running notes. Probe scripts live next to this file. Run from repo root: `node solver-audit/plan-probes/<script>.mjs`.

## Baseline (2026-10-06, before any change)
- `node solver-audit/repro/year-exhaustive.mjs` -> PER-A: 175/1752 A-selections have a worse B than the best for that A (max gap 2.100, mean 0.478), 57/271 instances; FULL best below ref best in 32; YEAR-PIN-LIFTED 1/300 (seed 195).
- `node solver-audit/repro/year-seeds.mjs` -> S1 11.857 (ref 12.0), S2 1.250 vs 12.0, S3 1.000 vs 11.8, A50: 51 alternatives / 6 distinct sets.

## Probe 1 results so far
Scripts: year-proto-lib.mjs (instrumented copy generator, knobs __B_K, __A_DEDUP, __A_TOP, __SEEDS), year-probe1-b.mjs (generator, 300 seeds), year-probe1-real.mjs (real requests of perf-ui-budget), year-probe1-residual.mjs.
- Generator (year-exhaustive seeds 1..300), lost B choices out of 1752 A-selections: K=1 175; K=2 84; K=3 40 (max gap 0.794); K=5 18; K=10 6; K=20 4; K=1000 4. best<FULL: 32/17/7/3/1/0/0.
  Residual 4 = relax path (round() keeps ONE relaxed try by b.score, seeds 105, 252): fixed only if all relax tries' results enter the pair choice.
- Real requests (15 cases, UI budget 3000ms, median of 3): original 25-154 ms, none partial. K=10 worst +~90 ms (19-2027-y1 68->158). K=5 <= +55 ms. Best pair improves in 5/15 (K=3: 10-2027 +.05, 19-2027 +.023, 40-2027 +.184, 20-2025 +.027; K=5 adds 10-2025-y3 +.136).
- A diversity on real data: the 51 A alternatives hold only 3-7 distinct course sets for year-1 programs (18 for 40, 22 for 30-y3). The displayed top-10 pairs contain 1-2 distinct A course sets in 9/12 year-1 programs. dedup alone -> only 3-7 pairs (not 10) and ~5x faster; so dedup must come with more distinct A sets (distinct-by-set top-K in search or bigger A_TOP).
- A-side options (year-probe1-atop.mjs, real requests, K=5): flat top-50 + dedup = 258 ms total over 15 cases but only 3-7 pairs; flat top-200 + dedup 476 ms, shortfall .046; flat top-1000 + dedup 1361 ms (max 300) shortfall 0;
  DISTINCT top-50 inside search() (new option, 3-line change in leaf, A_TOP stays 50): 556 ms total (original shape 1208), max 146 ms, shortfall 0, always 10 pairs with distinct A course sets in year-3 cases.
  Quality jumps are real: 12-2027-y1 best 11.92 -> 12.72 (the 4th distinct A set), 40-2027-y1 12.3899 -> 12.436 (only seen with >50 distinct sets; distinct50 gets 12.436), 10-2027 +.05, 19-2027 +.023, 20-2025 +.027, 10-2025 +.136 (K5), 40-2027 +.184 (K3).
- year-probe1-heur.mjs (year-heuristics generator, 13 instances with >50 A selections): best below FULL ref: orig 4/13 (max .429), K5 alone 1/13, distinct50+K1 3/13, distinct50+K5 0/13, distinct50+K10 0/13, nocut(1e9)+K5 0/13 (211 ms vs 29 ms).
- Stress (year-probe1-stress.mjs, student marks every course optional): orig AND all variants hit the budget (partial=true, ~4.5 s wall for the 3 s budget: the deadline + timeLimitMs/2 slack is pre-existing). Quality is budget-bound noise (+-0.3), not a regression of K or distinct. Year-list-must requests: all <= 212 ms.
- PRODUCT: distinct-by-course-set shrinks the shown alternatives from "10 group variants of 1-2 course sets" to 3-8 alternatives for year-1 programs (there are only 3-8 distinct A sets in total). Decision needed (see items).
