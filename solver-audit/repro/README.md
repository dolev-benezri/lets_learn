# Reproduction scripts

Every claim in `../findings.md` is printed by one of these scripts. They need Node 22+, no network and no `npm install`. The only exception is `rules-regulations.mjs`, which can also read the official PDF; see its header. They import the real code from `../../web/` and the committed data from `../../web/data/afeka/`, and they never write outside `solver-audit/`.

```bash
node solver-audit/repro/run-all.mjs
```

That runs all 32 scripts in about 1-2 minutes and exits 0 when every claim still holds. To run one script:

```bash
node solver-audit/repro/search-ref-random.mjs
```

## Output convention

- `CHECK <id> PASS <detail>`: a property verified correct (`FAIL` = it no longer holds).
- `BUG <id> REPRODUCED <detail>`: a defect shown (`NOT-REPRODUCED` = it no longer happens, for example after a fix).
- `INFO ...`: measurements, not claims.
- A script exits 0 only if every line is as reported in `findings.md`, so after a fix its BUG lines flip and it exits 1.
- Randomness is seeded (deterministic). `perf-ui-budget.mjs` reports wall-clock times, which vary by machine.

## Scripts

| Script | What it shows | Findings |
|---|---|---|
| `bits-00-survey.mjs` | lesson start/end minutes and days in the real data | C-5 |
| `bits-01-overlap-exhaustive.mjs` | 30-minute slot clash test vs real minute overlap, every interval pair on a 10-minute and 1-minute grid | F-04 |
| `bits-02-real-data-overlap.mjs` | slot clash == minute clash on all 5.7M real group pairs; an option whose own lessons overlap is accepted | C-5, F-18 |
| `bits-03-blocks.mjs` | personal busy blocks off the half hour: false clashes, real-data option loss, search finds nothing | F-04 |
| `bits-04-window.mjs` | 'not before/after' soft and hard limits off the half hour | F-05 |
| `bits-05-edges.mjs` | lessons outside 07:00-23:00, day 7, popcount, Friday vs soft day off | F-06, F-13 |
| `caller-01-worker-protocol.mjs` | real `ui-search.js` payload per scope through a real worker thread hosting `web/solver-worker.js`; clone safety; render | C-12 |
| `caller-02-search-lifecycle.mjs` | debounce, generation counter, 'search more' budget, stale answer drawn / crash after program switch, name edit re-search | C-13, F-02, F-17 |
| `data-assumptions.mjs` | the 144 data files vs the code's assumptions; self-referencing prerequisites | C-14, F-03 |
| `metric-freedays.mjs` | Friday never counts as a free day; the solver moves lessons to Friday; 'no free day' text | F-13 |
| `metric-graph.mjs` | downstream/unlocks/value vs reference; self-loops; cycle order; WeakMap cache | C-7, F-03, F-15 |
| `metric-oracle.mjs` | each metric vs a first-principles oracle; slot error of gaps and outside minutes | C-6, F-14 |
| `metric-selfloop-source.mjs` | how a self-referencing prerequisite is produced by `scripts/parse.mjs` (saved source page `fixtures/yedion-details-10825.html`) | F-03 |
| `opts-01-oracle-all-data.mjs` | `buildOptions` vs an independent oracle on all 16,074 course instances | C-4 |
| `opts-02-unlinked-groups.mjs` | the 240 unlinked sub-groups; course 10013 has no option with default settings | F-01 |
| `opts-03-dedup-signature.mjs` | identical-group merge ignores exam dates | F-10 |
| `opts-04-pins-lecturers.mjs` | pins, full groups, lecturer prefer/avoid; 'prefer' removes every plan | F-08, F-09 |
| `perf-ui-budget.mjs` | real UI-like requests for 12 programs: time, partial flag, validity | C-15 |
| `rules-classify-ref.mjs` | `classify` vs an independent reference (random graphs + real data) | C-8 |
| `rules-regulations.mjs` | Amirnet table and citations vs the official regulations; failure counting; missing rules | C-9, F-19 |
| `search-bound-admissible.mjs` | pruning bound >= best completion at every node (instrumented copy) | C-3, F-20 |
| `search-diagnosis.mjs` | 'why no schedule' messages vs the real cause | F-16 |
| `search-maxcredits.mjs` | credit cap 0 = no cap | F-07 |
| `search-negative-duration.mjs` | malformed `end < start` breaks pruning | F-20 |
| `search-ref-random.mjs` | `search()` == exhaustive reference, 700 random instances | C-1 |
| `search-ref-real.mjs` | `search()` == exhaustive reference, 500 real-data instances | C-2 |
| `year-exhaustive.mjs` | `searchYear()` vs exhaustive year enumeration: validity, formula, B choice, pins | C-10, F-11, F-12 |
| `year-heuristics.mjs` | what the top-50 A cut loses | F-11 |
| `year-real.mjs` | `searchYear()` on real data: validity, score, missing, warnings | C-11 |
| `year-seeds.mjs` | the 'open a must course' seed step: what it rescues and what it misses | F-11, F-12 |
| `meta-deps.mjs` | generates `../dependencies.md` from the source and checks the solver's purity | C-16 |
| `meta-flow.mjs` | validates `../flow-agent.json` (ids, edges, reachability, refs) and generates `../flow-agent.md` | - |
| `meta-check-refs.mjs` | every `path:line` in the documents is inside its file; every script/claim id cited in findings.md exists | - |
| `run-all.mjs` | runs everything above except `meta-check-refs.mjs` | - |

Helpers (imported by the scripts, not run on their own): `bits-lib.mjs`, `caller-lib.mjs` (minimal DOM + fake Worker that drive the real UI modules), `caller-worker-host.mjs`, `opts-lib.mjs`, `rules-lib.mjs`, `search-lib.mjs`, `year-lib.mjs`, `year-gen.mjs`, `year-instrument.mjs`. Generated instrumented copies of `web/solver-core.js`, rebuilt on each run and safe to delete: `*.generated.mjs`, `*.gen.mjs`. `bits-out/` keeps sample outputs.

## Two manual checks

Self-referencing prerequisite (F-03), straight from the data:

```bash
node -e "const c=require('./web/data/afeka/2027-1/10-2027.json').courses['10825'];console.log('10825',JSON.stringify(c.prereqs))"
```

The real-browser Worker run (E2E-1) needs a static server on `web/`, for example `python -m http.server 8140 -d web`. Then run this in the page console:

```js
const A = await fetch('/data/afeka/2027-1/30-2026.json').then(r => r.json());
const B = await fetch('/data/afeka/2027-2/30-2026.json').then(r => r.json());
const yearList = new Set(A.lists.find(l => l.name.includes("שנה א'")).courses);
const state = { passed: [], failed: {}, choices: {}, profile: { year: 1, amirnet: 120, specs: [], summer: false }, load: 'even', semesterOf: {}, pins: [] };
const constraints = { dayOff: [6], dayOffHard: false, notBefore: '', notAfter: '20:00', windowHard: false, maxCredits: null, maxDays: null, examsSameDay: 'forbid', includeFull: false, blocks: [], lecturers: {} };
const weights = { friends: 3, progress: 3, freeDays: 1, compact: 1, timeWindow: 1, examSpread: 1 };
const w = new Worker('/solver-worker.js', { type: 'module' });
const res = await new Promise(ok => { w.onmessage = e => ok(e.data); w.postMessage({ year: { dataA: A, dataB: B, state, yearList, pins: [], constraints, weights, friends: [], timeLimitMs: 3000 } }); });
console.log(res.partial, res.results.length, res.results[0].score); // 2026-10-06: false 10 13.2
```

## Notes on how these were made

Most scripts were written by audit sub-agents and then re-run and checked by me.

- **Changes I made:**
  - `caller-lib.mjs`: the click/change helpers now fire every document listener, not just the first. Before that, the 'search more' and next/previous checks failed because of the harness, not the app.
  - `bits-05s` became a CHECK: the original hypothesis was refuted.
  - `YEAR-SEEDS-EFFECT` became an INFO line: it is an observation, not a claim.
- **Removed:** two scripts that were broken or partly invented.
- **Added by me:** `data-assumptions.mjs`, `perf-ui-budget.mjs` and the `meta-*` / `run-all` scripts.
