# Solver audit fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or superpowers:subagent-driven-development) to implement this plan stage by stage. Steps use checkbox (`- [ ]`) syntax. Every fix is test-first: write the regression test, run it, watch it FAIL (that is the proof the bug is still there), fix, watch it PASS.

**Goal:** Fix every problem found by the 2026-10-06 solver audit (F-01..F-20), close the questions the audit left open, and keep everything the audit proved correct (C-1..C-16) exactly as it is.

**Architecture:** Small, root-cause fixes in the existing vanilla ES modules (`web/`) and the scraper (`scripts/`). One branch per stage, cut from `main`. The data is rebuilt offline from the local page cache, so no stage sends a request to Afeka.

**Tech Stack:** vanilla JS modules, `node --test` (`npm test` = `node --test` at the repo root), GitHub Pages (`web/`), GitLab nightly scrape (`ci/gitlab-scrape.yml`).

**Status 2026-10-07:** executed. Stages 1-6, 7 (F-13 only) and 8 are merged to `main`, plus a final review pass (`fix/review-pass`). Issues #1-#7 are closed. F-19 closed 2026-10-07 (#8, D2 read from the regulations). Still open: #9 (exams after the first nightly that publishes them, a manual Firefox/Safari pass, and checking that the first nightly after stage 2 brings no prerequisite churn).

**Spec:** `solver-audit/findings.md` (local, not committed; every finding names the script that proves it). Proof scripts: `solver-audit/repro/` (`README.md` there). Design probes for this plan: `solver-audit/plan-probes/` (local). GitHub issues: see "Issues" at the end.

---

## Global Constraints

- **No network to Afeka or the yedion.** Data is rebuilt from `.yedion-cache/` (gitignored, 1,794 pages from 2026-10-03).
- **Protect what is proven correct.** After ANY change to `web/solver-core.js`, run:
  - `node solver-audit/repro/search-ref-random.mjs` (C-1, `search()` == exhaustive reference, 700 instances)
  - `node solver-audit/repro/search-ref-real.mjs` (C-2, 500 real instances)
  - `node solver-audit/repro/search-bound-admissible.mjs` (C-3, pruning never drops a result)
  - and the existing equivalence tests in `test/solver.test.mjs` / `test/solver-props.test.mjs`.
  All must stay PASS. A fix that breaks one of them is wrong, whatever else it fixes.
- **Ranking constants** (`A_SHARE`, `LOAD_W`, `MISSING_W`, `BONUS`, `DEPTH_BONUS`) are not changed unless a test shows why.
- **Expected flips:** after a fix, the matching `BUG <id> REPRODUCED` line in `solver-audit/repro/` becomes `NOT-REPRODUCED` and that script exits 1. That is the expected sign of success, not a regression. Every other line of `node solver-audit/repro/run-all.mjs` must stay as documented.
- **`node --test` discovers every `*.test.mjs` and every `test/` folder under the repo root**, including `solver-audit/`. Never leave a `*.test.mjs` file or a `test/` folder there (draft tests are named `*-draft.mjs`).
- **Line length:** at most 200 code points per line in `web/*.js`, CSS and HTML (`test/line-length.test.mjs`). Repo files use CRLF.
- **Tests:** focused test file per task while working; the full `npm test` (and `CI=1 npm test`) once before each merge. UI-visible changes are also checked in the browser preview.
- **Git:** branch per stage off `main`, push the branch, merge after review. Identity `dolev-benezri`. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Commit message references the issue (`Fixes #n`).
- **Cost:** tiny edits inline; at most one sonnet agent per stage for multi-file work; every agent diff is read and tested before merge (routing matrix in memory `agent-model-choice`).
- `solver-audit/` itself stays uncommitted. The durable proof of each fix is its regression test in `test/`.

## Review Focus

1. `search()` still equals the exhaustive reference (C-1, C-2) and pruning stays admissible (C-3) after stages 3, 4, 5 and 7.
2. A student with default settings and no busy blocks gets the same top plan as before stages 1-3. The ranking may change only where a finding says the old one was wrong.
3. A year-1 software-engineering 2027 student sees `10825` as available, not blocked.
4. An answer from a superseded worker is never drawn, and a program switch never throws.
5. No stage adds a dependency or a request to Afeka.

## Order

| Stage | Branch | Findings | Size | Needs |
|---|---|---|---|---|
| 0 | none (local) | issues, corrections to `findings.md` | S | none |
| 1 | `fix/search-lifecycle` | F-02, F-17 | S | none |
| 2 | `fix/prereq-parse` | F-03 (+ 480 false "outside the program" notes, 1 wrong edge), F-06 data side | S | none |
| 3 | `fix/search-preferences` | F-07, F-08, F-09, F-10 | S | none |
| 4 | `fix/minute-precision` | F-04, F-05, F-18, F-14 (outside minutes) | M | 3 merged |
| 5 | `fix/year-plan` | F-11, F-12 | M | 4 merged, decision D3 |
| 6 | `fix/messages` | F-01, F-16, exam-gap text | M | 3 merged |
| 7 | `fix/day-off-and-rules` | F-13, F-19 | S | decisions D1, D2 |
| 8 | `test/open-checks` | summer, time budget, exams, browsers | S | none |
| - | closed without code | F-15, F-20, F-06 code side | - | reasons at the end |

Stages 1 and 2 touch different files and can run in parallel. Stages 3-7 all edit `web/solver-core.js`, so run them one after another, each branch cut from `main` after the previous merge.

## Owner decisions

- **D1 (F-13), decided 2026-10-07:** a free day is Sunday-Thursday plus the days the student marked as wished days off. The default marks Friday, so Friday counts for most students, and a student who studies on Friday is not pushed there.
  - Rejected: always Sunday-Friday (it changes the scale of every score; prototype `solver-audit/plan-probes/up-apply-f13.mjs`).
  - Rejected: only fixing the "אין יום פנוי" pill.
- **D2 (F-19), settled 2026-10-07 from the regulations text (11.4.4 applies at the end of each of years א'-ג'):** count failed *courses* for 11.4.1 / 11.5.1 (what the text says), and add 11.4.2 (average below 65) and 11.4.4 (less than 70% of credits) as warnings only when grades are entered. The owner confirms this reading of the regulations in issue #8 before stage 7's F-19 task.
- **D3 (F-11), decided 2026-10-07:** accept distinct alternatives. Year-1 programs then show 3-8 alternatives instead of 10, because today's 10 are group variants of only 1-2 course sets. The best plan improves (12-2027 year 1: 11.92 to 12.72). Filling up to 10 with group variants can follow if students ask.

---

### Stage 0: housekeeping (local)

- [x] Design probes kept in `solver-audit/plan-probes/` (prototypes, measurements, draft tests named `*-draft.mjs`). Their sandboxes were deleted, and no `*.test.mjs` or `test/` folder is left under `solver-audit/`.
- [x] GitHub issues #1-#9 published (table "Issues" at the end).
- [x] `findings.md` corrections (section "Corrections after the fix design"): F-06/F-20 data gate already exists, F-14 gap, F-08 per-course fallback, and the open questions that are now answered.

### Stage 1: `fix/search-lifecycle` (F-02, F-17)

**Files:** Modify `web/ui-search.js:35-36` and `web/ui-actions.js:238`. Create `test/ui-search.test.mjs`. Port the drafts `solver-audit/plan-probes/up-f02-draft.mjs` and `up-f17-draft.mjs`: they load the real module with a fake Worker, fail on `main` and pass with the fix.

- [ ] Test `an answer from a superseded worker is ignored`: start a run, call `scheduleRun()` (the generation goes up), then deliver the first worker's message. `ui.last` must be unchanged and `done()` must not run. Today `ui.last` is replaced.
- [ ] Test `an error from a superseded worker is ignored`.
- [ ] Test `editing the display name does not search`: `CHG.myName(...)` must return `'save'` (today `'quiet'`).
- [ ] Fix: make `if (my !== ui.gen) return;` the first statement of both `onmessage` and `onerror`. `myName` returns `'save'`. Terminating the old worker earlier in `scheduleRun` is not needed: a browser drops queued messages on `terminate()`, and the guard covers both handlers.
- [ ] Check `node solver-audit/repro/caller-02-search-lifecycle.mjs`. These flip:
  - the four BUG lines `02-stale-reply-accepted`, `02-stale-reply-after-switch-throws`, `02-board-stays-broken-until-next-reply` and `02-name-edit-researches-and-resets-cur`;
  - `CHECK 02-program-switched`, which asserts the bug state.

  Once `ui.last` stays null, that script also needs `?.` at its line 88. This is local script maintenance.
- [ ] Browser check:
  - switch program twice quickly, then toggle a hard day off;
  - expect no console error, and the drawn plan matches the settings.
- [ ] Commit `fix(search): ignore answers from a superseded worker; a name edit does not re-search`.

### Stage 2: `fix/prereq-parse` (F-03)

**Measured** offline, on the 425 course-detail pages in `.yedion-cache` (`solver-audit/plan-probes/data-p1-rowtypes.mjs`, `data-p4-compare.mjs`):
- **Row kinds:** `קדם` 527, `מקביל` 82, `אקסקלוסיבי` 17. `scripts/parse.mjs` turns the 17 exclusion rows into `קדם`.
- **Effect over 144 files:**
  - 183 self-references (5 distinct courses, 171 course records);
  - 480 rows that resolve to no course (11 distinct), shown as a false "קדם מחוץ לתוכנית" note;
  - 3 wrong edges to another course (`10224` requires `30356`).
- **Current parser:** run offline, it reproduces the committed prerequisites in 144/144 files, so the cache is a faithful base.

**Files:** Modify `scripts/parse.mjs:75`, `scripts/build.mjs:81` (`validate`) and `:100` (`fieldHealth`), and `web/data/afeka/**`. Tests in `test/parse.test.mjs` and `test/build.test.mjs`.

- [ ] Test `parseDetails keeps only prerequisite and corequisite rows`: a details card with an `אקסקלוסיבי` row must give no prerequisite for it. Use the prerequisite card of `solver-audit/repro/fixtures/yedion-details-10825.html` as a trimmed fixture. Fail first.
- [ ] Test `validate rejects a course that requires itself`.
- [ ] Test `fieldHealth rejects a lesson that ends after 23:00 or starts off the half hour`. This guards the 30-minute grid assumption. In the real data every lesson starts on :00 and the latest end is 22:50.
- [ ] Fix:
  - `scripts/parse.mjs:75`: `.filter((c) => c.length === 4 && /^תנאי (קדם|מקביל)/.test(c[0]))`.
  - `validate`: add the error `${id}: a prerequisite names the course itself (check parseDetails)`.
  - `fieldHealth`: add `m.end <= '23:00' && /:[03]0$/.test(m.start)`.

  Exclusion rows are dropped, not stored: nothing reads them.
- [ ] Data: rebuild offline with the fixed scripts (`node solver-audit/plan-probes/data-rebuild-offline.mjs <fixed scripts dir> out-after`). Then copy **only `prereqs`** into the committed files with `patch-data.mjs`, after pointing it at `web/data/afeka` (it writes to the deleted sandbox today).

  A whole-file rebuild from the 2026-10-03 cache would roll back the "full" flags of 112/144 files. Write the files in the same format `build.mjs` writes. Expected:
  - 144/144 files change in `prereqs` only;
  - the largest prerequisite-count change is 7.2% (the scrape guard is 20%);
  - `validate` reports 0 errors;
  - `git diff --stat` lists only `web/data/afeka`.
- [ ] Check:
  - `data-assumptions.mjs` `D-10` drops to 0, and the `metric-selfloop*` lines flip;
  - the `node -e` line in `solver-audit/repro/README.md` shows no self-reference for `10825`;
  - in the UI (software engineering 2027, year 1), `10825` is available.
- [ ] After merge, the nightly GitLab scrape loads `scripts/` from `main`. Confirm that the first nightly diff has no prerequisite churn.
- [ ] Commits:
  - `fix(parse): only prerequisite and corequisite rows are prerequisites`;
  - `data(afeka): prerequisites rebuilt with the fixed parser`.

### Stage 3: `fix/search-preferences` (F-07, F-08, F-09, F-10)

**Files:** Modify `web/solver-core.js`. Tests go in `test/solver.test.mjs` (helpers `grp`, `W0` there). The drafts are in `solver-audit/plan-probes/up-solver-drafts.mjs`; each one fails on `main` and passes with its fix.

- [ ] **F-07:** `web/solver-core.js:352` becomes `constraints.maxCredits != null && credits + it.credits > constraints.maxCredits`.
  - Test: cap 0 plus a must 3-credit course gives no result, and the diagnosis names the credit cap.
  - Repro `SMC-5`, `SMC-5b`, `SMC-6` flip.
- [ ] **F-08:** the UI promises "when possible" (toast at `web/ui-actions.js:78`). `byLecturer` already falls back per course, so the failure is across courses. Fix after `dfs` (about `:362`): if there is no result, the search is not partial and some lecturer is `'prefer'`, return `search(...)` again with the `'prefer'` entries removed. This is the same pattern as the `maxDays` re-search.
  - Test: two must courses where the preferred lecturer's group clashes with the other must give 1 plan, not 0.
  - Repro `opts-2`, `opts-2b` flip.
- [ ] **F-09:** in `buildOptions` (`:99-100`) and `byLecturer` (`:49-53`), apply pins first, then lecturer choices. If a lecturer choice would empty a pinned course, keep the pinned options: a pin beats avoid and prefer. Do not use the one-token `pins.includes(o.groups[0])`: with it, a pinned tutorial loses to 'avoid'.
  - Tests: pin a tutorial under an avoided lecturer's lecture, and the option is kept. Pin a tutorial and prefer another lecturer, and the pinned option is kept.
  - Repro `opts-7` flips.
- [ ] **F-10:** add `g.exams` to `sig` (`:58`).
  - Test: two identical groups with different exam dates give two options.
  - Repro `opts-3`, `opts-3b` flip.
- [ ] Full suite, then C-1, C-2 and C-3 must PASS. Their references never set lecturers, so F-08 and F-09 cannot move them.
- [ ] Commit `fix(solver): credit cap 0 is a cap; 'prefer' retries without it; pins beat lecturer choices; exams in the group signature`.

### Stage 4: `fix/minute-precision` (F-04, F-05, F-18, F-14 outside minutes)

**Design.** Prototype in `solver-audit/plan-probes/proto-lib.mjs`, net -17 lines in `solver-core.js`. To see it, run `git diff --no-index web/solver-core.js solver-audit/plan-probes/proto-run-slot.generated.mjs` and ignore the probe hooks.
- The 30-minute bitmask stays only for lesson-against-lesson clashes (exact on real data, C-5) and for `freeDays` / `maxDays`.
- Replace `forbiddenMask`, `lateMask` and `prefMask` with minute tests on each meeting:
  - `forbiddenBy(c)(meeting)` covers a busy-block overlap (`s < b.end && b.start < e`), a hard day off and hard hours;
  - `outsideMin(meeting, c)` counts the minutes outside the wished hours.
- Each option carries `out`, its outside minutes, computed once. The `outside` metric is the sum of `o.out` over the chosen options.
- `bound()` uses the same sum over the options chosen so far. Outside minutes only grow as courses are added, so the bound stays admissible.
- F-18: `buildOptions` skips a combination whose own groups overlap, compared group by group (a lecture against its linked tutorial or lab). A per-meeting check breaks the `test/solver-props.test.mjs` fixtures.

**Measured:**
- **Off-grid synthetic, 700 instances:** the prototype equals the minute reference, 0 mismatches. Current code has 207-341 mismatches.
- **On-grid, 700 instances:** 0 mismatches.
- **Real data with off-grid blocks and windows, 400 instances:** 0 mismatches.
- **Bound:** 3 × 400 instances, 44,095 nodes each, 0 violations. A negative control fails on 141/400, so the harness can catch a bad bound.
- **Speed:** UI-like requests take 79 ms before and after.

**Keep the gap metric (`compact`) in slots.** On 13,839 real plans, the slot gap equals real minutes minus the 10-minute break in 99.91% of plans. The audit's "64% under-measured" counted the break as a gap. A real-minute gap costs 6× at leaves and gains nothing.

- [ ] Tests first, in `test/solver.test.mjs`; all fail on `main`:
  - a busy block 20:50-22:00 keeps a lesson that ends at 20:50;
  - a hard "not after 17:45" drops a lesson that ends at 17:50;
  - a soft "not after 20:00" counts a 20:00-20:50 lesson as 50 outside minutes, not 60;
  - a lecture that overlaps its own linked tutorial gives no option.
- [ ] Five existing tests build masks directly. Rewrite them to the predicate, keeping the same scenarios with minute semantics (this does not weaken them):
  - "forbidden mask removes options";
  - "hard time window edges";
  - "busy blocks…";
  - "soft time window … 120 outside minutes" (0.8167 instead of 0.8);
  - "lecturers never strand a course", which passes a mask as `forbidden`.
- [ ] Implement in `web/solver-core.js`. Grep `web/` and `test/` for imports of `forbiddenMask` / `lateMask`: there are none in `web/`, only in tests.
- [ ] The audit references (`solver-audit/repro/search-lib.mjs` `referenceSolve`) use slot semantics for blocks and windows, so after the fix C-1 differs on 118/700. Move them to minute semantics (`solver-audit/plan-probes/precision-ref.mjs`) in the same session. Then C-1, C-2 and C-3 must PASS.
  - These flip: `bits-03f/g/h`, `bits-04f/g/h/l`, `bits-02f`.
- [ ] Browser check: a busy block from 20:50, and a hard "not after 17:45".
- [ ] Commit `fix(solver): busy time and time limits in real minutes; reject an option that clashes with itself`.

### Stage 5: `fix/year-plan` (F-11, F-12), needs D3

**Prototype:** `solver-audit/plan-probes/year-proto-lib.mjs`. It holds the exact patches, switched by the knobs `__B_K`, `__A_DISTINCT`, `__SEEDS` and `__RELAX_PINS`.

- [ ] **B side:** ask for `topK: 5` per A alternative (`web/solver-core.js:452-453`) and keep the pair with the best **pair** score, not the best `b.score`.
  - Generator: lost B choices drop from 175 to 18 of 1,752 (K=10: 6).
  - Real requests: at most +55 ms (worst 154 to about 210 ms; the budget is 1500/3000 ms).
- [ ] **A side:** add a `distinct` option to `search()`. In `leaf`, a plan with the same course set as one already in `top` replaces it only if it scores better (3 lines in the prototype). The A search uses it, and `A_TOP` stays 50.
  - Heuristic instances: best below the full reference goes from 4/13 to 0/13 (with K=5).
  - Real data: 12-2027 year 1 goes from 11.92 to 12.72, and 5 of 15 programs improve.
- [ ] **F-12 seeds** (`:428-441`):
  - skip prerequisite groups that are entirely outside the program (`anyOf.every((x) => x.id === null)`, as `classify` does at `web/rules.js:67`);
  - seed one search per combination of one candidate from each open any-of group.

  Probe `year-probe2-seeds.mjs`: H2 goes from 1.18 to 7.75, and H3 from 1.18 to 7.685 (equal to the reference). Distinct alternatives with K=5 alone do not fix these.
- [ ] **F-12 pins:** a pair whose B plan holds a pinned course in another group gets the warning `הנעיצה של X (ב׳) לא נשמרה: הקורס בקבוצה אחרת`. Probe `year-probe2-pins.mjs`: 1 of 51 pinned instances (seed 195).
- [ ] Optional: in 4 of 1,752 cases the relax step keeps one try by `b.score`. Pooling every relax result (`__RELAX_ALL`) fixes them. Do it only if it is cheap after the above.
- [ ] Tests in `test/solver.test.mjs` or `test/solver-props.test.mjs`; all fail first:
  1. the B plan with the best `b.score` is not the best pair, and the best pair is returned;
  2. a seed where the first any-of candidate is full leaves no missing course;
  3. a prerequisite outside the program leaves no missing course;
  4. a pinned B course that was re-grouped gets the warning.
- [ ] Check these flip:
  - `year-exhaustive.mjs` `YEAR-B-CHOICE-SUBOPTIMAL`;
  - `year-heuristics.mjs` `YEAR-TOP50-CUT-LOSES`;
  - `year-seeds.mjs` S2 and S3;
  - `YEAR-PIN-LIFTED`.

  These must still PASS: `YEAR-VALID`, `YEAR-SCORE-FORMULA`, `YEAR-NO-LOST-PLAN` and `year-real.mjs` (C-11). `perf-ui-budget.mjs` must stay at 300 ms or less.
- [ ] The ranking constants `A_SHARE`, `LOAD_W` and `MISSING_W` are not touched; none of this needs them.
- [ ] Commit `fix(year): choose B by the pair score; distinct A course sets; seeds for every any-of candidate; warn when a pin was lifted`.

### Stage 6: `fix/messages` (F-01, F-16, exam gap)

- [ ] **F-01:** in `diagnose` (`web/solver-core.js:234-236`), add a message when all of these hold:
  - a must course has no option;
  - a sub-group that is not full is linked from nothing;
  - a full group of the same type exists;
  - `includeFull` would give options.

  The message: `X: כל הצירופים כוללים קבוצה מלאה, והקבוצה הפנויה 271001305 (מעבדה) לא מקושרת באתר אפקה לאף הרצאה או תרגול…`. The drafted patch keeps every line at 188 code points or less.
  - Test: `10013` from a real data file gives a message that names `271001305`.
  - The owner also reports the missing link to Afeka, by email.
- [ ] **F-16:** where the generic message would be shown, run short searches (topK 1, a small time slice) that relax one constraint at a time: full groups, hard day off or hours, busy blocks, credit cap, `maxDays`, exams on the same day. Name the first one that yields a plan. With no must courses and a `maxDays` cap, the message must not say "must courses".
  - Tests: the cases `SD-5`, `SD-9`, `SD-9b`, `SD-10`, `SD-16` from `search-diagnosis.mjs`.
  - Measure with `perf-ui-budget.mjs`. This runs only when there is no plan.
- [ ] **Exam gap text:**
  - `web/ui-grid.js:151` also reads the singular "לפחות יום אחד בין בחינות" as `'1'`;
  - `web/ui-view.js:108` uses `count(Number(s.examGap), ...)`. Today it compares a string to 1, so the singular branch never runs.
  - Test in `test/ui-grid.test.mjs`: an explanation with "לפחות יום אחד" gives `examGap` `'1'`. Keep the string type (the existing test at `:31` expects `'3'`). Proof: `solver-audit/plan-probes/up-probe1-exam-gap.mjs`.
- [ ] Commit `fix(messages): name the unlinked free group, the real reason for no plan, and a one-day exam gap`.

### Stage 7: `fix/day-off-and-rules` (F-13, F-19), needs D1 and D2

- [ ] **F-13, per D1.** With (a), define the set of free-day candidates once (Sunday-Thursday plus `constraints.dayOff`). Use it in:
  - `metrics` (`web/solver-core.js:185`, `:212`);
  - `bound` (`:311-314`);
  - `explain`;
  - `summary` (`web/ui-grid.js:145`);
  - the pill (`web/ui-view.js:106`).

  Tests:
  - a Friday-only plan with default settings counts Friday as free;
  - with default weights, the solver no longer moves a lesson to Friday (`bits-05r` and `metric-friday-*` flip).

  The prototype for (b) is `up-apply-f13.mjs`.
- [x] **F-19, per D2** (`web/rules.js:119-124`):
  - for 11.4.1 and 11.5.1, count `Object.keys(failed).length`, and keep the per-course count for 11.5.2;
  - 11.4.2 uses `gradeAverage` (`:169-177`), and 11.4.4 uses `progress` (`:154-166`), only when grades and credits are known.

  Tests: `{a:2, b:1}` gives no probation; `{a:2, b:2}` gives no expulsion. `rules-1` and `rules-2` flip.
- [ ] One commit per finding.

### Stage 8: `test/open-checks`

- [ ] **Summer (the owner relies on it; the audit did not prove it):**
  - a script that runs `search()` against the exhaustive reference (`solver-audit/repro/search-lib.mjs`) on real `2027-3` data for several programs;
  - a test that a course passed in summer counts for the next year (find where in `web/app.js` / `web/rules.js`).

  Any failure becomes a new issue.
- [ ] **Time budget:** when the student marks every course optional, the year search returns after about 4.5 s for a 3 s budget (`year-probe1-stress.mjs`). The cause is the slack in `if (Date.now() > deadline + timeLimitMs / 2)` (`web/solver-core.js:443`). Decide whether that is acceptable; if not, cap the slack.
- [ ] **Exams:**
  - The scraper already parses exam dates into `g.exams[].date`, the field the solver reads (`data-p2-exams.mjs`, fixture `exams-2026.html`). No committed file has `examsPublished` yet.
  - When the first nightly publishes exams, re-run `search-ref-real.mjs` and `opts-03-dedup-signature.mjs` on the real dates, and check the exam-gap pill in the browser.
- [ ] **Browsers:** the end-to-end run was only in Chromium. Do one manual pass in Firefox and in Safari/iOS.
- [ ] Out of scope: checking the whole dataset against the official site beyond the sampled courses. That belongs to a separate scraper audit.

### Closed without code

- **F-15:**
  - After F-03 there are 0 cycles between different courses. There are also 0 with the self-loops left in (144 files, 48 year views).
  - `chainDepth` is identical under 864 random key orders.
  - Nothing in `web/` mutates a loaded dataset, so the WeakMap cannot go stale.

  Proof: `solver-audit/plan-probes/p4-cycles.mjs`. Revisit only if `validate` ever meets a cycle.
- **F-20:** the data is already gated: `scripts/build.mjs:98-101` `fieldHealth` rejects `start >= end` (`test/build.test.mjs:257-284`). `cleanBlocks` rejects such user blocks (`web/app.js:31`). The audit's fix text was out of date here.
- **F-06 code side:** stage 2 gates the data (07:00-23:00, start on :00/:30), and stage 4 tests user times in minutes. After both, the empty mask cannot be reached, so no clamp is needed.

## Done when

- Every issue is closed by a merged commit.
- In `node solver-audit/repro/run-all.mjs`, every `BUG … REPRODUCED` of a fixed finding reads `NOT-REPRODUCED`, and every C-1..C-16 claim is still PASS.
- `npm test` and `CI=1 npm test` are green.
- `docs/ISSUES.md` "מה טופל" has one row per branch, as the convention is.
- `solver-audit/findings.md` has a status line per finding (local).

## Issues

Published 2026-10-07 on `dolev-benezri/lets_learn` from `solver-audit/issues/drafts.md`. Each stage's commit ends with `Fixes #n`.

| Issue | Stage | Findings | Labels |
|---|---|---|---|
| #1 | 1 | F-02, F-17 | bug |
| #2 | 2 | F-03 | bug |
| #3 | 3 | F-07, F-08, F-09, F-10 | bug |
| #4 | 4 | F-04, F-05, F-18, F-14 | bug |
| #5 | 5 | F-11, F-12 | enhancement |
| #6 | 6 | F-01, F-16, exam gap | bug |
| #7 | 7 | F-13 | bug, question |
| #8 | 7 | F-19 | question |
| #9 | 8 | open checks | enhancement |
