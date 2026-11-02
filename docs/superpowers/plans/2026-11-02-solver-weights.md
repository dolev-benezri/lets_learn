# Solver weights: implementation plan

**Goal:** the set all five teams signed, with what a student needs to see to judge it. Status: waiting for the owner's approval.

**Why:** with exam dates on, the best plan loses courses silently, because a metric that only falls as courses are added outweighs the pull of one course. The friends ratio has the same defect and is live today.

## The set

| Item | Now | New |
|---|---|---|
| progress | 3 | 5 |
| friends | 3 | 1 |
| freeDays, compact, timeWindow | 1, 1, 1 | unchanged |
| examSpread | 1, smallest gap / 7 | 1, `1 - min(1, (same-day pairs + 0.5 * next-day pairs) / candidates)` |
| same-day rule | no two first sittings on one date | same date and start hour refused; others allowed and shown |
| friends metric | shared minutes / the plan's minutes | shared minutes / longest minutes of all candidates |
| courseValue | `credits + downstream + 2 * depth` | `max(1, credits + 0.5 * downstream + depth)` |
| LOAD_W, credits, unlocks | 3, 0, 0 | unchanged |

Not adopted: cap 3, a scale inside the score, freeDays 3, removing the 10-hour ceiling, a fixed pair price. Measurements are in the owner's report.

## Tasks

Each task: failing test first, in the file named.

1. **Solver** (`web/solver-core.js`, `test/solver.test.mjs`, `test/solver-props.test.mjs`)
   - Friends metric in `metrics()` and `friendsUp()`.
   - Pair metric in `metrics()` and `bound()`.
   - Same-start refusal at `dfs`. An exam with no start hour is never refused.
   - `courseValue`.
   - `bound()` stays an upper bound: extend "pruning keeps results" to published exams.
   - Rewrite pins: `examSpread` 3/7 and `breakdown.friends === 1`.
2. **Defaults and returning students** (`web/app.js`, `test/app.test.mjs`)
   - `DEFAULT.weights`.
   - `examsSameDay`: `hours` (default) or `forbid` (the student asks for the date rule). A saved `forbid` or `allow` becomes `hours` once, since `forbid` was only the default.
   - The exact old weight vector moves to the new one once, with a Hebrew notice and undo. Other vectors stay.
3. **What the student sees** (`web/ui-view.js`, `web/ui-side.js`, `web/ui-grid.js`, `web/ui-drawer.js`, `test/xss.test.mjs`)
   - Each plan: "לא נכנסו" with names and credits, measured against both semesters in the year view. Never states a cause it did not diagnose.
   - Each plan: a warning naming same-day and next-day exam pairs, with date and hours, noting that exam length is unknown.
   - Same-start block: both course names, date and hour, on an empty result and on a year plan with a missing course (`diagnose`, `whyNot`, `searchYear`). Today the message blames the week.
   - `explain()` no longer prints "לפחות 0 ימים".
   - Checkbox: "לאסור 2 בחינות באותו יום", off, with a line saying the same hour is always refused.
   - A plan with many hours outside the wished hours says so and points to the hard-hours control.
   - Year view: results are the best found, not proven best.
   - Checked at 320 and 375 px.
4. **Finish:** `npm test`, `npm run check:real` (add the same-start and same-day cases), `docs/ARCHITECTURE.md`, `docs/ISSUES.md`. Codex reviews the whole branch, one fix round, then merge and push.

## Deferred, reported to the owner

- Friends denominators differ between semester א alternatives in the year search.
- The `B_K` and `A_TOP` shortlist limits can miss a better year plan.
- Ties are ordered by traversal.
- The pair price moves when a course that cannot enter is marked.
- Exam coefficients and every weight here have no evidence from student outcomes.
