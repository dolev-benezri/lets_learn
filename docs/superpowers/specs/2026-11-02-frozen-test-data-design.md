# Frozen test data: behavior tests stop reading the live scrape

Date: 2026-11-02. Status: design approved by the owner.

## Problem

The nightly scrape (GitLab pipeline #38, 2026-11-01) pushed fresh data as 66f5eb7. The deploy workflow runs `npm test` before it publishes `web/`, and one test failed:

`test/rules.test.mjs:590` reads the live `web/data/afeka/2027-1/30-2026.json` and expects course 10336 to be a `retake`. Afeka removed the meetings of 10336's semester א groups (checked live on 2026-11-02: groups 271033601-604 have only a header row), so the course is now `notOffered`. The scrape was right; the test depended on a fact about one course in live data.

The same night 10362 and 10400 also left semester א (3 courses in 8 files each, 68 group entries gone, none added). About 40 tests read `web/data/afeka`. Each one that names a course, a group or a number will break a deploy the night Afeka changes it, and the site then stays on old data (here: 21.10) until someone edits a test.

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
| `specs.test.mjs` | specLists 30343 | 2027-1/30-2026 |
| `build.test.mjs` | real exam page | 2027-1/30-2026 |
| `rules-report.test.mjs` | report on 30-2026 | 2027-1/30-2026 |
| `solver.test.mjs` | chainDepth, year-2 solve, searchYear cases, both "largest real file" time budgets | 2027-{1,2}/30-2026; the time budget tests scan the frozen dirs (30-2026 is the largest file in both, checked at 40d90aa) |
| `check-export.test.mjs` | copies and breaks one program | 2027-{1,2,3}/30-2026 |
| `check-real.test.mjs` | checker logic only: "no plan" and "the CLI runs the state suites" | 2027-{1,2}/19-2026 |

## Stays on live data (invariants)

- `scrape.test.mjs`: every committed data file carries the specializations, their lists and the degree.
- `programs-official.test.mjs`: catalog and config against Afeka's curricula.
- `settings.test.mjs`: shipped settings against `catalog.json`.
- `check-real.test.mjs`: "the 3 sample programs have no data errors" and "sample: 19-2026, 20-2026, 30-2026 semester א pass the record, plan and metamorphic checks". A failure there is a real problem for users.

## Frozen copy

- 12 files under `test/fixtures/real/2027-N/<program>-<start>.json`, taken from commit 40d90aa (the 21.10 data, on which the whole suite passed). Stored as minified JSON, about 2 MB. Outside `web/`, so never deployed.
- One helper, `test/fixtures/real.mjs`:
  - `FILES`: the list of frozen paths.
  - `real(path)`: parse one frozen file.
  - `REAL_DIR`: URL of the frozen root, for the tests that scan a directory.
  - Run directly (`node test/fixtures/real.mjs`), it rewrites `FILES` from `web/data/afeka`. Refreshing is a manual step; after it, failing tests are fixed in the same commit.

## Drift guard

One new test: for each frozen file, its top-level keys equal those of the live file at the same path. A change to the build's output shape (a code change, never the nightly) fails it and says to refresh the frozen copy. Only top-level keys: course-level fields come and go with the data and would make the guard itself fragile.

## Verification

1. `npm test` passes on the nightly data (66f5eb7).
2. `npm test` passes with `web/data/afeka` temporarily restored to 40d90aa (the old data), then restored back.
3. `grep` finds no `web/data/afeka` path left in the behavior tests listed above.
4. `npm run check:real` passes.
5. Merge to `main`, push; the deploy run for that push is green and the site shows the 66f5eb7 data.

## Out of scope

- Running the suite in the nightly before it pushes.
- Changing what the scrape keeps for groups without meetings (it follows the yedion).
