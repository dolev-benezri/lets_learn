# ISSUES batch 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the next group of items from `docs/ISSUES.md`: ranking by what a schedule unlocks, visible scores, status marking, alternative groups, a grouped course list, colours, and data safety before automation.

**Architecture:** Same static site: `web/*.js` ES modules, no build, `node --test`. Logic lives in `web/rules.js` and `web/solver-core.js`, state in `web/app.js`, UI in `web/ui-plan.js` and `web/ui-grid.js`, and the scraper in `scripts/`.

**Tech Stack:** Node ≥22 (v24 installed), plain JS, node:test.

**Spec:** `docs/superpowers/specs/2026-09-30-afeka-scheduler-design.md`. Requirements for this batch come from the sections of `docs/ISSUES.md` named in each task. UI rules: `design-system/afeka-scheduler/pages/app.md` (v2).

## Global Constraints

- Each task runs on its own branch cut from `main`, named in the task. Commit on that branch and push the branch (`git push -u origin <branch>`). Do NOT merge into `main`; the controller merges after review.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npm test` must pass. Every new pure function or logic change gets a test that fails without the change.
- Every string interpolated into innerHTML goes through `esc()`.
- State only enters through `normalize()` in `web/app.js`. A new state field needs a default in `DEFAULT`, validation in `normalize()`, and a normalize test.
- The solver's branch-and-bound `bound()` in `web/solver-core.js` must stay a valid upper bound. If you change a metric or the `value` formula, update `bound()`. The test "pruning keeps results identical" must pass.
- UI copy is Hebrew. Use no emoji; icons are the inline Lucide set in `ui-grid.js` `ICON`.
- For browser checks, a static server may already be running on http://localhost:8092/ serving `web/`. If it isn't, start one on a free port with `npx http-server web -p <port> -c-1`. Never stop a server you didn't start. When done, clear `localStorage` and reset the viewport.

## Review Focus

1. Old saved state (localStorage from before the change) must load without errors and keep its meaning.
2. The real-data search must still finish without `partial` in the default state (test exists).
3. Hebrew/RTL text with numbers and group ids stays readable (`<bdi dir="ltr">`).
4. Mobile width 375px: no horizontal scroll, and new controls have hit areas of at least 44px.
5. Friend and backup links created before the change still import.

---

### Task 1: Ranking by what a schedule unlocks (ISSUES §2)

**Branch:** `feat/unlock-ranking`
**Files:** `web/solver-core.js`, `web/ui-plan.js`, `test/solver.test.mjs`

- [ ] **2ג:** `unlockCounts` counts only `קדם` links, not `מקביל`. The prereq objects in the data carry a kind; check `web/data/afeka/2027-1/30-2026.json` and `scripts/build.mjs` for the exact field name. Test with a mini fixture where a course reached only through a `מקביל` link is not counted.
- [ ] **2א:** the per-course value becomes additive: `value = credits + BONUS × unlocks`. A 0-credit course that unlocks others then gets a positive value. Pick BONUS so that a 0-credit course unlocking 3 courses outranks a 2-credit elective that unlocks nothing (test this). Document the constant.
- [ ] **2ב:** add chain depth, the length of the longest downstream `קדם` chain, as a second additive term, `+ DEPTH_BONUS × depth`. Export `chainDepth(data)` and test it (e.g. 90914 depth 3 vs 30137 depth 1 on real data, or the mini fixture equivalent).
- [ ] **2ד:** each result carries `unlocks`, the number of distinct courses its chosen courses unlock (union of downstream sets). `explain()` adds `פותחת N קורסים להמשך` when N > 0. The sidebar card shows a tag `פותח N קורסים` when N > 0 (data from an exported per-course count).
- [ ] Keep `bound()` valid: progress still uses `(val + restValue[i]) / maxValue` with the new values. Run the equivalence test.

### Task 2: Show the progress score and a 1–10 rank per alternative (ISSUES §3)

**Branch:** `feat/progress-rank` (cut from `main` after Task 1 is merged)
**Files:** `web/ui-plan.js`, `web/ui-grid.js`, `test/ui-grid.test.mjs`

- [ ] Ruling on the open question: the overall order stays as it is (weighted score). Each alternative also shows a **progress rank** from 1 (most progress among the shown alternatives) to N, computed from `breakdown.progress`. Ties share a rank.
- [ ] Add a pill `התקדמות: דירוג k מתוך N` plus a short line with what the alternative contributes: credits, the courses it closes that block others (courses with unlocks > 0), and `פותחת N קורסים` from Task 1.
- [ ] Put the pure rank helper in `ui-grid.js` with a unit test (ties, a single result).

### Task 3: Direct status selection that keeps the failure count (ISSUES §7, §17א#7, §14ט)

**Branch:** `feat/status-select`
**Files:** `web/app.js`, `web/rules.js`, `web/ui-plan.js`, `web/index.html`, tests

- [ ] State: passing a course no longer deletes its failure history. `state.failed[id]` stays, and a passed course with earlier failures counts toward the regulation warnings (11.4.1, 11.5.1, 11.5.2) in `classify`. Test: passed after 2 failures still counts 2 toward the total. normalize: failed counts 1..3 (already allowed).
- [ ] Only one regulation severity shows at a time: expulsion wins over probation. Test.
- [ ] UI: replace click-to-cycle chips with a direct selector per course. States are `לא לקחתי`, `עברתי`, `נכשלתי`, plus a failures stepper (1–3) that shows when failed or when passed after failing. All options are visible, reachable by keyboard, and use `role="radiogroup"` or native radios. Add a year-level action `סמן את כל שנה X כ"עברתי"`.
- [ ] Keep the `data-k` focus keys working (focus survives re-render).

### Task 4: Alternative groups in the popover and backup groups in the registration list (ISSUES §14ג, §17א#6)

**Branch:** `feat/alt-groups`
**Files:** `web/ui-grid.js`, `web/ui-plan.js`, `web/solver-core.js` (export a helper only if needed), tests

- [ ] The block popover lists every group of the same type in the course: day/time, lecturer, full flag, and whether it clashes with the rest of the current alternative. Clicking one pins it (replacing a pin of the same course and type) and re-runs. Mark the current group.
- [ ] Registration list: for each chosen group, show up to 3 backup groups of the same course and type that do not clash with the rest of the alternative and are not full. Include them in "העתק הכל".
- [ ] Put the clash computation in a pure exported helper with a test (reuse `meetingsMask` / `overlaps`).

### Task 5: Grouped, compact course list (ISSUES §6, §14ה, §14ד)

**Branch:** `feat/course-list`
**Files:** `web/ui-plan.js`, `web/ui-grid.js`, `web/index.html`, tests

- [ ] The sidebar groups available courses by `data.lists`: mandatory by year, electives (חברה ורוח, יזמות, נושא חובה נוסף), and English. Keep "בתכנון" first, and keep "חסומים" and "לא נלמד".
- [ ] Compact row per course: colour dot, name, credits, and a small `חובה | אולי | לא` selector on the same line. Reasons and tags appear on expand or as a second line only when present. Target ≤ 64px per row on desktop.
- [ ] Colours (§14ד): assign distinct colours to the courses of the displayed alternative first, so no two courses in one shown alternative share a colour while there are ≤ 8. Beyond 8, add a pattern (e.g. a dashed border) to the repeats. Update `assignColors` or add a helper, with a test.

### Task 6: Data safety before automation (ISSUES §17א#9, §17ב)

**Branch:** `fix/scrape-safety`
**Files:** `scripts/build.mjs`, `scripts/scrape.mjs`, `test/build.test.mjs`

- [ ] `compareToPrevious(prev, next)` returns errors when the new dataset drops sharply against the existing file: course count down by more than 10%, offered-course count down by more than 20%, or total group count down by more than 25%. `scrape.mjs` reads the existing file, if any, and refuses to overwrite on errors unless `--force` is given. Test the thresholds.
- [ ] A failed fetch (network error, 5xx, 429) retries with backoff up to 3 times before failing the run. Test the retry logic with an injected fetch if it is practical; otherwise keep it small and state that in the report.
