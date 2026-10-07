# Solver audit: findings

Date: 2026-10-06. Code at commit `0ab077e` (main). Node v24.14.0. Nothing in the repository was changed; all evidence is in `solver-audit/repro/`.
Every claim below names the script that proves it. Run one with `node solver-audit/repro/<script>.mjs`, or all of them with `node solver-audit/repro/run-all.mjs`.
Script output convention: `CHECK <id> PASS` = verified correct; `BUG <id> REPRODUCED` = defect shown. A script exits 0 only when every line is as reported here, so after a fix its BUG lines flip and it exits 1.
Not in git: `plan-probes/out-*/` (about 60 MB of rebuilt data). Rebuild with `node solver-audit/plan-probes/data-rebuild-offline.mjs ../../scripts out-before` (needs the local `.yedion-cache`, no network).

## Verdict

The search itself is correct. For the same input, `search()` returns exactly the schedules an exhaustive enumeration returns (1,200 instances, 500 of them on real data), its pruning never drops a result, and every year plan `searchYear()` returns is valid and scored exactly by its own formula.
The problems are in what goes into the search and around it:
- **Data:** 171 course records require themselves, which blocks mandatory courses forever.
- **Rounding:** times are rounded to 30-minute slots, so off-grid busy blocks and time limits give wrong clashes.
- **UI timing:** a stale worker answer can be drawn, or crash the page.
- **Soft preferences:** some act as hard filters.
- **Year planning:** heuristics miss better plans.
- **Messages:** several are misleading.

## Method

1. I read the executable code line by line. Comments, docs and the existing tests (437/437 pass, `npm test`) were not trusted.
2. Independent reference implementations, written from the meaning of the problem in minutes, sets and plain enumeration, were compared with the solver on seeded random and real inputs.
3. An instrumented copy of the solver was used to test internals such as the pruning bound and the seed step of `searchYear`.
4. The real UI modules (`web/app.js`, `web/ui-plan.js`, `web/ui-search.js`, the renderers) were driven in Node with a minimal DOM stub and a fake Worker that hosts the real `web/solver-worker.js`.
5. A real-browser run used the built-in browser on `http://localhost:8140`, loading the real module Worker (E2E-1 below).
6. All 144 committed data files were checked against the code's assumptions. A few courses were compared with the live public yedion pages, and the regulations PDF was read (`https://external.afeka.ac.il/media/mfnpt5or/תקנון-לימודים-תואר-ראשון-1.pdf`).

Some of the probe scripts were written by sub-agents. Every one was re-run by me. Where a script's harness was wrong I fixed the script, not the conclusion: in `caller-lib.mjs`, the click helper fired only the first listener. Two claims that did not hold were turned into CHECK or INFO lines (`bits-05s`, `YEAR-SEEDS-EFFECT`).

## What is correct (with proof)

| # | Property | Proof (script: lines) |
|---|---|---|
| C-1 | `search()` top-10 equals exhaustive enumeration (scores, metrics, plans) on 700 random instances with credit caps, day caps, exams, corequisites, pins, friends, busy blocks, hard windows and bias | `search-ref-random.mjs`: `SR-1` |
| C-2 | Same on 500 real-data subsets (140 files, injected exams); every plan is valid at minute level | `search-ref-real.mjs`: `SRR-1`, `SRR-2` |
| C-3 | The pruning bound is admissible (never below a reachable score) on well-formed data, also with friends and with searchYear's negative bias | `search-bound-admissible.mjs`: `SB-1..3` |
| C-4 | `buildOptions` equals an independent oracle on all 16,074 course instances of the 144 files (with and without full groups); no duplicate or clashing option; alternative groups (`alts`) are lossless | `opts-01-oracle-all-data.mjs`: `opts-C01..C13` |
| C-5 | On real data the 30-minute grid never disagrees with minute-level overlap: 5,672,404 group pairs, 0 false clashes, 0 missed | `bits-02-real-data-overlap.mjs`: `bits-02a..e` |
| C-6 | Every metric (friends, progress, freeDays, compact, timeWindow, examSpread) equals a first-principles oracle when times are on the grid | `metric-oracle.mjs`: `oracle-*-aligned` |
| C-7 | `downstream`, `unlockCounts` and `courseValue` equal a reference on all files except self-referencing courses (F-03) | `metric-graph.mjs` |
| C-8 | `classify()` equals an independent reference on 4,000 random prerequisite graphs and 576 real states; it is monotone (passing more never blocks a course) | `rules-classify-ref.mjs`: `-1..-10` |
| C-9 | Amirnet thresholds 85/100/120/134 and the citations 6.2.3, 7.4, 11.5.2 match the official regulations | `rules-regulations.mjs`: `rules-reg-1..8` |
| C-10 | `searchYear()`: 0 of 300 synthetic pairs break a hard rule; score and missing list equal the formula; it never returns nothing when a plan exists | `year-exhaustive.mjs`: `YEAR-VALID`, `YEAR-SCORE-FORMULA`, `YEAR-NO-LOST-PLAN` |
| C-11 | `searchYear()` on real data (130 pairs): valid, score/missing/warnings exact, year progress in [0,1], no duplicates, sorted | `year-real.mjs` |
| C-12 | Worker protocol: payload per scope (A, B, year, summer) survives `structuredClone`; the worker answer equals a direct call; stale pins are dropped in semester scope | `caller-01-worker-protocol.mjs` (45 checks) |
| C-13 | Search life cycle: debounce, generation counter, old worker terminated, "search more" doubles 1500/3000 ms up to 12000 ms, button hidden at the cap, next/previous wraps | `caller-02-search-lifecycle.mjs` (CHECK lines) |
| C-14 | Data: meetings on day 1-6 between 07:00-23:00, linked ids exist, no duplicate group ids, A/B group ids disjoint, prerequisite ids resolvable, no course record differs between A and B | `data-assumptions.mjs`: `D-1..D-9` |
| C-15 | Real UI-like requests (12 programs year 1, three programs year 3): every search finishes in at most 161 ms, never partial, no clash | `perf-ui-budget.mjs`: `P-1` |
| C-16 | The solver modules are pure (no DOM, network, storage, timers) and depend on nothing outside `solver-core.js` + `rules.js` | `meta-deps.mjs`: `DEP-1..3` |
| E2E-1 | In a real browser, the module Worker loaded from `web/solver-worker.js` returned 10 distinct valid year pairs for program 30 / 2026 in 279 ms (not partial) | built-in browser, `http://localhost:8140` (manual run, the code is in `repro/README.md`) |

Not exercised by the real data: exams. Every `exams` array is empty and `examsPublished` is false in all 144 files (`D-7`), so exam logic was tested with synthetic dates only (C-1, C-2).

## Problems

Severity: **high** = wrong or impossible schedule, or a crash, reachable with real data and the real UI; **medium** = wrong ranking or misleading result in realistic use; **low** = needs unusual input, or affects data that does not exist today.

### F-01 (high, data + solver): course 10013 can never be scheduled with default settings
- **What:** both tutorials of 10013 (software engineering, 16 files) link only lab `271001304`, which is full. The other lab `271001305` is free but linked from nothing. With the default `includeFull: false` (`web/app.js:15`), `buildOptions` returns 0 options. A must 10013 then gives no schedule, with the message "no group fits".
- **Proof:** `opts-02-unlinked-groups.mjs`: `opts-1` (0 options in 16/16 files), `opts-1b` (search: 0 results). `opts-C24-271001305`: the live source page has no link to 305 either, so this is faithful to the source. The other 5 unlinked groups are tutorials whose lecture is missing at the source; they cause no wrong option (`opts-C27`).
- **Source:** `web/solver-core.js:69-81` (only linked sub-groups are combined; a full one discards the option), `scripts/parse.mjs:53-60`.
- **Fix:** when every option of a course dies only because a linked sub-group is full, and an unlinked sub-group of the same type is not full, say so in `diagnose` (`web/solver-core.js:232-245`) and name the free group. Report the missing link to Afeka. Do not invent links in `build.mjs`.

### F-02 (high, UI): a stale search answer is drawn, and after a program switch the page breaks
- **What:** a new search waits 300 ms (`web/ui-search.js:15`) before it terminates the old worker (`:29`). The old worker's `onmessage` (`:35`) does not check the generation, so an answer that lands in that window is stored and drawn.
  - After adding a hard day off, the old plan is shown with 6 lessons on that day.
  - After switching program, `renderView` throws `Cannot read properties of undefined (reading 'credits')`, and keeps throwing on every redraw until the new answer arrives.
- **Proof:** `caller-02-search-lifecycle.mjs`: `02-stale-reply-accepted`, `02-stale-reply-after-switch-throws`, `02-board-stays-broken-until-next-reply`.
- **Fix:** in `run()` capture the generation and ignore stale answers: `ui.worker.onmessage = (e) => { if (my !== ui.gen) return; ... }`, and the same in `onerror` (`web/ui-search.js:35-36`). Better still, also terminate the old worker inside `scheduleRun` (`:10-15`), not 300 ms later.

### F-03 (high, data): 171 course records list themselves as a prerequisite, so mandatory courses are blocked forever
- **What:** 84 of 144 files contain a course whose only option for a `קדם` requirement is itself. Examples:
  - `10825` "אתיקה בהנדסת תוכנה", in the year-1 mandatory list of software engineering 2027 (day and evening);
  - `30150`, mechanical engineering 2024, year 3.

  Such a course is `blocked` forever and the solver never plans it. Its value also gets a false "+1 unlock", and the side list shows "פותח קורס אחד" for a course that opens nothing.
- **Root cause:** `scripts/parse.mjs:77` maps every prerequisite row that is not `מקביל` to `קדם`. That includes an exclusion row ("cannot be taken with"), whose course name `build.mjs` then resolves to the course's own id (`scripts/build.mjs:27-30`).
- **Proof:** `data-assumptions.mjs`: `D-10`; `metric-graph.mjs`: `metric-selfloop`, `metric-selfloop-values`; `metric-selfloop-source.mjs`: `metric-selfloop-parser`, `metric-selfloop-blocks-mandatory`, `metric-selfloop-unlocks` (uses the saved source page `repro/fixtures/yedion-details-10825.html`). Spot check: `node -e` in `repro/README.md` prints `10825 prereqs [{"kind":"קדם","anyOf":[{"id":"10825",...}]}]`.
- **Fix:** in `parseDetails` keep only rows whose kind text is a prerequisite or corequisite. Drop exclusion rows, or store them as a separate `excludes` list. In `build.mjs`, drop any prerequisite that resolves to the course itself, and add a `validate()` error for self-references (`scripts/build.mjs:68-90`). Then re-scrape.

### F-04 (medium, solver): busy blocks and times not on :00/:30 create false clashes
- **What:** every interval is widened to whole 30-minute slots (`web/solver-core.js:15-16`). A personal busy block (`<input type="time">`, any minute; `cleanBlocks` `web/app.js:30-32`) that starts when a lesson ends, or up to 9 minutes later, counts as a clash.
  - Real example: a block from 20:50 kills a lesson that ends at 20:50. The same block from 21:00 does not.
  - On real data, 5,015 course/block cases lose every option although one fits.
- **Proof:** `bits-03-blocks.mjs`: `bits-03f`, `bits-03g`, `bits-03h`; `bits-01-overlap-exhaustive.mjs`: `bits-01e`, `bits-01m`, `bits-01n` (1.35% of all interval pairs on a 10-minute grid are false clashes). Real lessons alone are safe (C-5).
- **Fix (smallest):** snap user times to the grid: `step="1800"` on the time inputs (`web/ui-drawer.js:38-39` and the block editor), and round in `cleanBlocks`/`normalize`. **Fix (exact):** compare blocks and windows in minutes, for example a 5-minute grid of 192 bits per day held in an array of ints, or an interval list for blocks only.

### F-05 (medium, solver): 'not after' / 'not before' times off the half hour are wrong, including the hard limit
- **What:** `lateMask(t)` marks only the slots that start after `t` rounded up (`web/solver-core.js:28-31`).
  - With a hard 'not after 17:45', a lesson ending 17:50 is shown even though the UI promises it won't be (`bits-04l`). This happens for every limit HH:31-HH:49 with real :50 lesson ends (`bits-04f`).
  - Soft 'outside minutes' are over- or under-counted (`bits-04h`). The default 20:00 counts a 20:00-20:50 lesson as 60 minutes (`bits-04g`).
- **Proof:** `bits-04-window.mjs`.
- **Fix:** the same as F-04 (snap the inputs, or minutes). For `lateMask` alone, use the floor of `t` for the hard check, or compare each meeting's end in minutes with `t` in `forbiddenMask` and `metrics`.

### F-06 (low, robustness): lessons outside 07:00-23:00 or on day 7 are invisible to clash checks
- **What:** the comment at `web/solver-core.js:10` says such lessons are "clamped". In fact `meetingsMask` gives them an empty mask (`a >= b` at `:15-17`), and day 7 falls outside `DAYS = 7` (`:6`, `:362`). Two overlapping 23:00-23:30 lessons are both scheduled. `scripts/build.mjs` `validate()` accepts such hours.
- **Proof:** `bits-05-edges.mjs`: `bits-05h`, `-05i`, `-05j`, `-05k`, `-05n`, `-05o`. Real data has none (`D-1`).
- **Fix:** reject out-of-window times and day not in 1-6 in `validate()`; clamp in `meetingsMask` as the comment says (`a = min(a, 31)`, `b = max(b, a+1)`).

### F-07 (low, solver): a credit cap of 0 means 'no cap'
- **What:** `constraints.maxCredits && ...` (`web/solver-core.js:352`) treats 0 as unset. The UI accepts 0 (`web/ui-drawer.js:49` `min="0"`, `web/ui-actions.js:233` `n >= 0`), and so does `normalize` (`web/app.js:38`). A must 4.5-credit course is planned under 'cap 0'.
- **Proof:** `search-maxcredits.mjs`: `SMC-5`, `SMC-5b`, `SMC-6` (real 10-2024 course 10016).
- **Fix:** `constraints.maxCredits != null && credits + it.credits > constraints.maxCredits`. Alternatively treat 0 as invalid in the UI (`n > 0`).

### F-08 (medium, solver): 'prefer this lecturer' is a hard filter and can remove every schedule
- **What:** `byLecturer` keeps only the preferred lecturer's options whenever there are any (`web/solver-core.js:49-53`), before courses are combined. If those options clash with another must course, no schedule exists.
- **Proof:** `opts-04-pins-lecturers.mjs`: `opts-2` (synthetic) and `opts-2b`. Real 10-2024: 10016 + 10128 give 3 plans; after 'prefer' on one lecturer, 0 plans with a clash diagnosis.
- **Fix:** make 'prefer' a score term, or fall back to all options when the preferred-only search finds nothing (the same retry pattern as the `maxDays` re-search at `:364-368`). Keep 'avoid' as a filter.

### F-09 (low, solver): a pinned sub-group overrides the lecturer choice
- **What:** `pinned(o)` exempts an option from 'avoid' and joins it to 'prefer' (`web/solver-core.js:50-52`) when ANY of its groups is pinned. Pinning a tutorial therefore keeps an avoided lecturer's lecture and ignores 'prefer'.
- **Proof:** `opts-04-pins-lecturers.mjs`: `opts-7`.
- **Fix:** test `pins.includes(o.groups[0])` (the pinned primary) instead of any group.

### F-10 (low today, solver): alternative groups can hide a different exam date
- **What:** identical primaries are merged by a signature without `exams` (`web/solver-core.js:59-60`). Only the first one's exams are checked (`:93-94`), so a listed alternative can put the exam on another course's exam day.
- **Proof:** `opts-03-dedup-signature.mjs`: `opts-3`, `opts-3b`. No real exams exist yet (`D-7`).
- **Fix:** add `g.exams` (kind, moed, date) to `sig`.

### F-11 (medium, year planning): the year plan can miss a better plan
- **What:** for each semester-A plan, only the single best B plan by its own B score is kept (`topK: 1`, `web/solver-core.js:452-453`). The pair score is then rewritten with year progress, credit balance and missing musts (`:484-494`).
  - So a B plan that is better for the year is lost: 175 of 1,752 fixed A selections.
  - The top-50 cut of A plans (`:376`, `:420`) loses the best pair in 1 of 13 large instances.
  - 51 A alternatives contained only 6 distinct course sets (the rest differ only in groups).
- **Proof:** `year-exhaustive.mjs`: `YEAR-B-CHOICE-SUBOPTIMAL`; `year-heuristics.mjs`: `YEAR-TOP50-CUT-LOSES`; `year-seeds.mjs`: `YEAR-A50-LOW-DIVERSITY`.
- **Fix:** ask B for several plans (for example `topK: 5`) and choose by the pair formula. Make the A list diverse by course set (keep the best group variant per course set).

### F-12 (medium, year planning): the 'open a must course' step and the relax step have holes
- **What:**
  - The seed step skips a must course when one of its prerequisite groups lies outside the program (`need.includes(undefined)` at `web/solver-core.js:431-432`). It also forces only the first A candidate of an any-of group. In both cases a plan with no missing course is lost: scores 1.25 vs 12.0, and 1.0 vs 11.8.
  - Relaxing a B must can move a pinned course to another group without saying so (`:461-465`).
- **Proof:** `year-seeds.mjs`: `YEAR-SEED-S2-NULL-PREREQ`, `YEAR-SEED-S3-FIRST-ANYOF-ONLY`; `year-exhaustive.mjs`: `YEAR-PIN-LIFTED`.
- **Fix:** skip prerequisite groups that are all outside the program (`anyOf.every(a => a.id === null)`, as `classify` does at `web/rules.js:67`). Seed one search per candidate of each any-of group. Add a pair warning when a pin was lifted.

### F-13 (medium, scoring): Friday is never a 'free day', so the solver moves lessons to Friday
- **What:** `freeDays` counts Sunday-Thursday only (`web/solver-core.js:185`), while `maxDays` counts Friday (`:24`) and the default soft day off is Friday (`web/app.js:15`). A lesson moved to Friday frees a 'day' and costs only a little `timeWindow`. With the default weights the Friday group wins, and raising 'free days' to 3 or 5 puts more courses on Friday.
- **Also:** a week busy Sunday-Thursday with Friday free shows 'אין יום פנוי' ("no free day", `web/ui-view.js:106`).
- **Proof:** `metric-freedays.mjs`: `metric-friday-dump`, `metric-friday-dump-real`, `metric-friday-inconsistent`, `metric-friday-pill`, `metric-dayoff-not-freedays`; `bits-05-edges.mjs`: `bits-05r`.
- **Fix:** count every day 1-6 that is a wished day off (`constraints.dayOff`) or a weekday (1-5) as a candidate free day, and use the same day set in `metrics`, `bound` (`:311`), `explain` and `summary` (`web/ui-grid.js:140-155`).

### F-14 (low, scoring): gaps and 'outside hours' are measured in 30-minute slots
- **What:** `compact` under-measures gaps by 10-50 minutes, and `timeWindow` over-measures outside minutes by 10-60, in about 64% of real-shaped plans (`web/solver-core.js:187-200`). Off-grid times reach errors of 146-198 minutes. This changes rankings only near ties.
- **Proof:** `metric-oracle.mjs`: `metric-compact-slot`, `metric-timewindow-slot`, `metric-slot-offgrid`.
- **Fix:** compute both from the selected meetings in minutes (`sel[].meetings` is already at hand in `metrics`). Keep the bitmask only for clash tests.

### F-15 (low, scoring): prerequisite cycles and cache staleness
- **What:** `chainDepth` memoises the 0 returned when it cuts a cycle (`web/solver-core.js:140-151`), so a 2-cycle gets different depths depending on key order. `downstream` is cached per dataset object (`:114-131`) and is not refreshed if the object is mutated. Real data has only the self-loops of F-03.
- **Proof:** `metric-graph.mjs`: `metric-cycle-order`, `metric-weakmap-stale`.
- **Fix:** compute strongly connected components first (or do not memoise a value reached through a cut); treat dataset objects as immutable.

### F-16 (medium, messages): the 'why no schedule' text can blame the wrong thing
- **What:**
  - With no must course and a day cap too small, the message says "too small for the must courses".
  - When every group is full, or a hard day off removes everything, the generic message blames "exams on one day, credit cap or a corequisite".
  - With three pairwise-compatible musts that cannot fit together, the same generic message appears.
  - 41 of 236 generic messages were misleading.
- **Source:** `web/solver-core.js:232-245`, `:363-368`.
- **Proof:** `search-diagnosis.mjs`: `SD-5`, `SD-9`, `SD-9b`, `SD-10`, `SD-16`.
- **Fix:** diagnose by relaxing one constraint at a time with short re-searches (as already done for `maxDays`). Report the first relaxation that yields a plan, and say 'full groups' and 'hard day off/hours' when those are the cause.

### F-17 (low, UI): editing your display name re-runs the search and jumps back to schedule 1
- **What:** `myName` returns `'quiet'` (`web/ui-actions.js:238`), which saves and calls `scheduleRun()` (`web/ui-plan.js:78`). The name is not a solver input.
- **Proof:** `caller-02-search-lifecycle.mjs`: `02-name-edit-researches-and-resets-cur`.
- **Fix:** return `'save'` from `myName`.

### F-18 (low, robustness): a registration whose own lessons overlap is not rejected
- **What:** `buildOptions` never checks a lecture against its linked tutorial (`web/solver-core.js:79-84`). Real data has no such case (`opts-C08`, `bits-02e`).
- **Proof:** `bits-02-real-data-overlap.mjs`: `bits-02f`.
- **Fix:** skip a combination whose groups overlap among themselves (`overlaps` on the per-group masks).

### F-19 (low-medium, regulations engine): failure warnings count failures, not failed courses; two rules missing
- **What:** `classify` sums failure counts (`web/rules.js:119-124`). Regulations 11.4.1 and 11.5.1 count courses with a failing grade, so `{a:2, b:1}` warns 'probation' where the text gives none, and `{a:2, b:2}` warns 'expulsion'. Probation for an average below 65 (11.4.2) and for less than 70% of credits (11.4.4) is not implemented. This affects warnings only, not schedules.
- **Proof:** `rules-regulations.mjs`: `rules-1`, `rules-2` (the script reads the official PDF if `pdftotext` and the network are available; the quoted rule is in its header).
- **Fix:** count `Object.keys(failed).length` for 11.4.1/11.5.1 and keep the per-course count for 11.5.2. Add 11.4.2/11.4.4 using `gradeAverage` (`web/rules.js:169-177`) and `progress` (`:154-166`).

### F-20 (low, robustness): pruning can drop the best plan if a lesson ends before it starts
- **What:** with `end < start`, minutes go negative, the friends bound (`web/solver-core.js:290-307`) is no longer an upper bound, and `prune: true` returns a worse top plan (5.24 vs 5.5).
- **Proof:** `search-bound-admissible.mjs`: `SB-4`; `search-negative-duration.mjs`: `SN-3`, `SN-4`. Real data has none (`D-1`); `cleanBlocks` rejects such blocks (`web/app.js:31`).
- **Fix:** reject `start >= end` in `scripts/build.mjs` `validate()`.

## Corrections after the fix design (2026-10-06, later)

The fix design for `docs/superpowers/plans/2026-10-06-solver-audit-fixes.md` re-read the code and measured more. The proofs are in `solver-audit/plan-probes/`. Each line below names its script and replaces the text above where they differ.

- **F-06 / F-20, data side:** `scripts/build.mjs:98-101` (`fieldHealth`) already rejects a meeting with no day, `start >= end`, a start before 07:00 or an end after 23:30 (`test/build.test.mjs:257-284`). The fix texts that say "add it to `validate()`" were stale. Two gaps are left: an end between 23:00 and 23:30, and a start off :00/:30 (`data-p3-hours.mjs`).
- **F-03 is wider:** the 17 `אקסקלוסיבי` rows in 425 cached detail pages also produce 480 rows that resolve to no course (a false "outside the program" note) and 3 wrong edges to another course, `10224` requiring `30356` (`data-p1-rowtypes.mjs`, `data-p1-wrongedges.mjs`). The current parser, run offline on `.yedion-cache`, reproduces the committed prerequisites in 144/144 files (`data-p4-compare.mjs`).
- **F-08 nuance:** `byLecturer` already falls back per course. The failure is a clash with *another* course, so the fix is a search-level retry (`up-solver-drafts.mjs`).
- **F-14:** on 13,839 real plans the slot gap equals the real gap minus the 10-minute break in 99.91% (`precision-p2-gap.mjs`). The "64% under-measured" counted the break as a gap. Only the outside-minutes half of F-14 is a real error.
- **F-15:** there are 0 cycles between different courses in all 144 files and 48 year views. `chainDepth` is the same under 864 key orders, and nothing in `web/` mutates a loaded dataset (`p4-cycles.mjs`). No fix needed.
- **Exam-gap text (was unproven below):** reproduced. A one-day gap shows "פער בין בחינות: לא ידוע", and `web/ui-view.js:108` compares a string to 1 (`up-probe1-exam-gap.mjs`).
- **Exams in the scraper:** exam dates are parsed into `g.exams[].date`, the field the solver reads (`data-p2-exams.mjs`).
- **Time budget (new, low):** with every course optional, a 3 s year search returns after about 4.5 s, because of the `deadline + timeLimitMs / 2` slack at `web/solver-core.js:443` (`year-probe1-stress.mjs`).

## Not verified / limits of this audit

- Exam logic ran on synthetic dates only; the real data has no exams yet (`D-7`).
- `ui-grid.js:151` parses the exam gap out of the explanation text with `/לפחות (\S+) ימים/`, which cannot match the singular 'יום אחד' produced by `explain` (`web/solver-core.js:226`). I saw this in the code but wrote no script for it, so it is unproven.
- Summer scope was covered by the worker-protocol checks (C-12), not by a separate optimality run.
- Performance was measured for default UI requests only (C-15). An unusually large 'maybe' list was not stress-tested.

## Status after the fixes (2026-10-07)

Each fix has a regression test in `test/` that failed before it. Commits are on `main`; the issue closes with the stage.

- F-01 fixed, stage 6 (#6): the diagnosis names the unlinked free group (real 10013: 271001305). The owner still has to report the missing link to Afeka.
- F-02 fixed, stage 1 (#1): an answer or error from a superseded worker is ignored.
- F-03 fixed, stage 2 (#2): only קדם/מקביל rows are prerequisites; data rebuilt offline (prereqs only); validate refuses a self-prerequisite.
- F-04, F-05 fixed, stage 4 (#4): busy time and hard/soft hours in real minutes.
- F-06 closed: data gate (stage 2: ends by 23:00, starts on :00/:30) + minute tests of user times (stage 4).
- F-07, F-08, F-09, F-10 fixed, stage 3 (#3).
- F-11 fixed, stage 5 (#5): B by pair score (K=5; about 1% of A alternatives still get a slightly worse B), distinct A course sets.
- F-12 fixed, stage 5 (#5) and the review pass: seeds for every any-of candidate and for all-outside prerequisites; a warning for every lifted ב׳ pin.
- F-13 fixed, stage 7 (#7), per D1.
- F-14 outside minutes fixed (stage 4); the compact gap stays in slots by decision (equals real gap minus the 10-minute break in 99.91% of plans).
- F-15 closed without code (no cycles).
- F-16 fixed, stage 6 (#6): one constraint relaxed at a time; 177 named causes and 59 "do not fit together" messages checked true on 516 infeasible instances.
- F-17 fixed, stage 1 (#1).
- F-18 fixed, stage 4 (#4).
- F-19 closed (2026-10-07, issue #8): D2 settled from the official text (11.4.1/11.5.1 count failed courses; 11.4.2 cumulative average below 65; 11.4.4 under 70% of the cumulative program at the end of each of years א'-ג'). 11.4.4 is skipped when a list's courses carry fewer known credits than its minimum (program 20, cohort 2024).
- F-20 closed: the data gate already existed.
- Stage 8 (#9): summer matches the reference (48 files, 576 instances); a summer pass counts (test); the year time slack (1.5x) is kept as designed. Still open: exams after the first nightly that publishes them, a manual pass in Firefox and Safari/iOS, and a look at the first nightly diff after stage 2.
