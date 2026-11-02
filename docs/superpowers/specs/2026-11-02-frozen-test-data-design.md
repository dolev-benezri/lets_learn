# Frozen test data: behavior tests stop reading the live scrape

Date: 2026-11-02. Status: design approved by the owner; revised after a Codex review (same day).

## Problem

The nightly scrape (GitLab pipeline #38, 2026-11-01) pushed fresh data as 66f5eb7. The deploy workflow runs `npm test` before it publishes `web/`, and one test failed:

`test/rules.test.mjs:590` reads the live `web/data/afeka/2027-1/30-2026.json` and expects course 10336 to be a `retake`. Afeka removed the meetings of 10336's semester א groups (checked live on 2026-11-02: groups 271033601-604 have only a header row), so the course is now `notOffered`. The scrape was right; the test depended on a fact about one course in live data.

The same night 10362 and 10400 also left semester א (3 courses in 8 files each, 68 group entries gone, none added). 14 test files read `web/data/afeka`. Each test that names a course, a group or a number will break a deploy the night Afeka changes it, and the site then stays on old data (here: 21.10) until someone edits a test.

## Rule

- A test that names a specific course, group, list, count or result from the real data reads a frozen copy in `test/fixtures/real/`.
- A test that states a property every committed data file must hold keeps reading `web/data/afeka`. These are the checks that should stop a deploy of bad data.

`test/programs-official.test.mjs` already follows this split: its comment moves yedion-dependent numbers to a nightly warning so a yedion change does not hold back the deploy.

## Moves to the frozen copy (behavior)

| Test file | What | Files |
|---|---|---|
| `rules.test.mjs` | `real()` cases (6001, 10243, 10128, 10336), evening fifth year | 2027-1/10-2024, 2027-1/30-2026, 2027-1/{12,22,30,32,42}-2027 |
| `rules-after-a.test.mjs` | withAfterA on mechanical 2026 | 2027-{1,2}/30-2026 |
| `app.test.mjs` | pickData, yearCourses fifth year | 2027-{1,2}/30-2026, 2027-1/32-2024 |
| `specs.test.mjs` | specLists 30343, asideIds, progress 160 / 27 | 2027-1/30-2026 |
| `build.test.mjs` | real exam page | 2027-1/30-2026 |
| `rules-report.test.mjs` | report on 30-2026 | 2027-1/30-2026 |
| `solver.test.mjs` | every `REAL` / `REAL2` case: chainDepth, year-2 solve, pruning vs exhaustive, default-state timing, searchYear cases, both "largest real file" time budgets | 2027-{1,2}/30-2026; the time budget tests scan the frozen dirs (30-2026 ties for the largest A file, 450 groups, and A+B pair, 868, checked at 40d90aa) |
| `ui-map.test.mjs` | map layout, progress, rendering; mandatory 30227, 30235, 30249, 30204, 30213, 30313 | 2027-{1,2}/30-2026, 2027-1/{32,11,30}-2027, 2027-1/10-2024, 2027-1/19-2026 |
| `xss.test.mjs` | hostile text through planning and rendering | 2027-{1,2,3}/30-2026 |
| `check-export.test.mjs` | `mini()` (copy and break one program) and its `against` baseline in the "course count dropped" case, both frozen together | 2027-{1,2,3}/30-2026 |
| `check-real.test.mjs` | checker logic only: "no plan" and "the CLI runs the state suites" | 2027-{1,2}/19-2026 |

## Stays on live data (invariants)

- `check-export.test.mjs`: "the data the site ships passes" (`checkExport` on the whole live export).
- `scrape.test.mjs`: the committed 30-2026 files carry the specializations, their lists and the degree (values come from `scripts/programs.json`, not from the yedion).
- `programs-official.test.mjs`: catalog and config against Afeka's curricula.
- `settings.test.mjs`: shipped settings against `catalog.json`.
- `check-real.test.mjs`: "the 3 sample programs have no data errors" and "sample: 19-2026, 20-2026, 30-2026 semester א pass the record, plan and metamorphic checks". A failure there is a real problem for users.

Accepted risks on the live side, left as they are: the `check-real` sample has a 20 s budget that ordinary data growth could reach; `scrape.test` expects at least two semester directories; `settings` and `programs-official` fail when a program or cohort leaves the catalog. Each of these is a config or catalog change a person makes on purpose, or a slow solver users would feel, not a nightly course change.

## Frozen copy

- 13 files under `test/fixtures/real/2027-N/<program>-<start>.json`, taken from commit 40d90aa (the 21.10 data, on which the whole suite passed):
  2027-1: 10-2024, 11-2027, 12-2027, 19-2026, 22-2027, 30-2026, 30-2027, 32-2024, 32-2027, 42-2027; 2027-2: 19-2026, 30-2026; 2027-3: 30-2026.
- Stored as `JSON.stringify(data) + '\n'`, UTF-8, about 1.5 MB. Outside `web/`, so never deployed.
- `test/fixtures/real/SOURCE` holds the commit the copy came from.
- One helper module, `test/fixtures/real.mjs`, with no side effects on import:
  - `FILES`: the list above.
  - `REAL_DIR`: a module-relative directory URL ending in `/`. Tests pass URLs to `fs`, and `fileURLToPath(REAL_DIR)` where a string path is needed (`checkExport` builds paths with string templates).
  - `real(path)`: parse one frozen file.
  - Run directly as `node test/fixtures/real.mjs <git-ref>`: reads each file in `FILES` with `git show <ref>:web/data/afeka/<path>`, parses all of them before writing any, then writes the files and `SOURCE`. Refreshing is a deliberate manual step; tests it breaks are fixed in the same commit.
- Tests on the frozen copy never skip when a file is missing. The `existsSync` skips and early returns in `solver.test.mjs` (lines 199, 575, 686, 733, 947, 1118, 1141, 1238, 1458, 2120-2121, 2138-2142) go away, so a missing fixture fails.

## Drift guard

One new test: every frozen file passes the same per-file schema check the export check uses (`checkFile` in `scripts/check-export.mjs`, exported for this) with no errors. It checks the fields the site reads without a guard, down to each meeting. It catches a build change only when that change also updates the checker's field list, which is how a new required field is added today; it is a shape check, not `validate()`. A second check confirms each file is the program, cohort and semester its name says. Neither compares with live files, so neither depends on the nightly.

## Verification

1. `npm test` passes on the nightly data (66f5eb7).
2. `npm test` passes with `web/data/afeka` temporarily restored to 40d90aa, then restored back.
3. `grep` finds no `web/data/afeka` path left in the tests listed under "Moves to the frozen copy" except the live cases named above.
4. `npm run check:real` passes.
5. Merge to `main` and push. The deploy only runs on pushes that touch `web/**`, and this change touches only `test/`, `scripts/` and `docs/`, so run it by hand: `gh workflow run deploy -R dolev-benezri/lets_learn`. The run is green and the site shows the 66f5eb7 data.

## Out of scope

- Running the suite in the nightly before it pushes.
- Changing what the scrape keeps for groups without meetings (it follows the yedion).
- The browser tests (`test/browser`, not part of `npm test` or the deploy); `flows.spec.mjs:307` also reads live data.
