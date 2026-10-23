# Audit 2026-10-23 Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 10 audit issues that can be fixed from the repo (#32, #33, #35-#38, #41-#44), each proven by a test that failed first. Plan #34, #39 and #40 up to the point where outside information is needed.

**Architecture:** Small fixes where the root cause sits. Most are 1-10 lines in `web/`. Each area gets its own branch, cut from `claude/audit-2026-10-23`. The audit's repro scripts become the regression checks: the scripts themselves, or a `node --test` case built from one.

**Tech Stack:** Plain ES modules (`web/`), `node --test`, Playwright browser tests (`test/browser/*.spec.mjs`, phone and desktop), no new dependency.

**Spec:** [docs/AUDIT-2026-10-23.md](../../AUDIT-2026-10-23.md) (the findings), plus the owner's decisions below.

## Decisions (owner, 2026-10-23)

- #44: the credit cap stays **per semester**. Only the label changes.
- #42: "רק ב׳" assumes **every א׳ candidate** passes, the same assumption the year view makes (`withAfterA`).
- #34: the owner supplies the regulation text for 11.4.2 and 11.5.1.
- #40: no real sheet with grades in words for now. Ship only the "rows not recognized" notice.
- #39: not decided who checks the yedion. It is a read-only check on public pages, and Claude can do it on request.
- Out of scope: data freshness (the nightly scrape is stopped, a known gap).

## Reproduction (2026-10-23, at 3ca39d6)

| Issue | How | Holds |
|---|---|---|
| #32 | `r1-summer-pin.mjs`: 16 of 29 summer courses also run in א׳/ב׳; `stalePins` reports the summer gid as gone | yes |
| #33 | `r1-rollover.mjs`: visit 3 gives profile.year 4 and 0 friends | yes |
| #34 | `rules.js:231` and `:335-344` unchanged | yes (wording not checked) |
| #35 | 0 of 144 files have `examsPublished`, 0 groups have exams; `app.js:356` takes the flag from א׳ only | yes |
| #36 | `ui-actions.js:48-61` uses `upsertFriend` with no confirm | yes |
| #37 | `ui-common.js:147` reads `groupIndex(app.data)` | yes |
| #38 | `ui-actions.js:528-535` saves each field on its own | yes |
| #39 | 22-2024 has 4 year lists; 22-2025 through 22-2027 have 5 | yes |
| #40 | `grade-import.js:56-59` matches only numbers, `פ.פנימ`, `פטור`, `חייב` | yes (no sheet) |
| #41 | `r2-missing-case.mjs`: #1 scores 17.41 and misses מעבדת מערכות ספרתיות; #2 scores 16.28 and misses nothing | yes |
| #42 | `r2-scope-b.mjs`: 297 of 762 blocked, 290 of them plannable in the year view | yes |
| #43 | `ui-view.js:176-179` saves `yearIds` from any non-summer scope | yes |
| #44 | `r2-credit-cap.mjs`: cap 20 gives 18+19=37 | yes |

One correction to the audit (#35): the exam code paths do have fixture tests (`test/solver.test.mjs`, `ics`, `ui-grid`, `build`). Also, `scripts/fixtures/exams-2026.html` is a real exam page from the 2026 yedion. What has never run is a chain that starts from that real page and goes through the build into the site.

## Work order

Order: what students feel first, then quick wins, then the dormant issues, each before its own date.

| # | Branch | Issues | Why now | Gates |
|---|---|---|---|---|
| 1 | `claude/audit-summer-views` | #32, #43, #42 | Registration is open now. Summer pins misbehave live. Students in the middle of א׳ start planning ב׳ in "רק ב׳" | npm test, browser, check:real, r2-subgroups, r2-prune |
| 2 | `claude/audit-year-rank` | #41 | 1 line, and it breaks the "חובה: בכל מערכת" promise | npm test, check:real, r2-prune, r2-subgroups, r2-missing-proof, r2-missing-sweep |
| 3 | `claude/audit-input` | #38, #44 | Small UI fixes | npm test, browser |
| 4 | `claude/audit-friends` | #36, #37 | Small UI fixes | npm test, browser |
| 5 | `claude/audit-rollover` | #33 | Dormant until the 2028 rollover (summer 2027). Cheap, so do it now | npm test |
| 6 | `claude/audit-exams` | #35 | Must land before the first exam table is published | npm test, browser |
| 7 | `claude/audit-grade-notice` | #40 (notice only) | Low | npm test, browser |
| - | waiting | #34, #39, #40 (words) | Outside information | see "Waiting" |

Dependencies: none between the branches in logic. Branches 1, 5 and 6 all touch `web/app.js`, but in different functions (`refresh`, `load`, `pickData`), so merging in the order above stays clean. Branches 1 and 2 both need `check:real`.

## Global Constraints

- Each branch is cut from `claude/audit-2026-10-23` and merges into `main` only after the owner's OK. Nothing is pushed without the owner.
- Any change to the solver or the rules (`web/solver-core.js`, `web/rules.js`, or what `classify` sees): run `npm run check:real` before merging. The audit's proofs must still hold:
  - `node docs/audit-2026-10-23/r2-prune.mjs` gives 0 mismatches.
  - `node docs/audit-2026-10-23/r2-subgroups.mjs` gives 0 exceptions.
  - `node docs/audit-2026-10-23/r2-missing-proof.mjs` gives 26 of 26 with no working split.
- Every UI change gets a browser test in `test/browser/flows.spec.mjs`, inside the existing `for (const size of ...)` loop, so it runs at phone and desktop width. Check by eye at 375 px: no horizontal scroll.
- `web/` lines are at most 160 characters (`test/line-length.test.mjs`). Every new rendered text joins `test/xss.test.mjs` when it includes data.
- On-screen Hebrew is true and soft in tone. Copy is fixed where a task gives it.
- Focused tests while working. Full `npm test` once before each merge.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- A summer pin on a summer-only course (not taught in א׳/ב׳) is still forced into the summer plan, and the banner stays silent (Task 1).
- "רק ב׳" when the א׳ file failed to load: classification is unchanged from today, with no crash (Task 3).
- A year search where every plan misses the same must course: the order is by score, exactly as today (Task 4).
- A backup link with inverted hours, including equal times: `normalize` empties `notBefore` and keeps `notAfter` (Task 5).
- A friend link with the same name and the same groups in a different order: replaced silently, with no dialog (Task 8).

---

## Branch 1: `claude/audit-summer-views`

### Task 1: Summer pin stays in summer (#32)

**Files:**
- Modify: `web/ui-actions.js:214` (`ACT.pin`)
- Modify: `web/ui-view.js:113` (`gone`)
- Test: `test/browser/flows.spec.mjs` (`stalePins` itself is correct; the bug is in what the two callers pass and set, so the red test is in the browser)

**Interfaces:**
- Consumes: `summerScope()` from `web/app.js`. `stalePins(pins, datasets)` from `web/ui-text.js`, signature unchanged.

- [ ] **Step 1: Write the failing test**
  - `flows.spec.mjs`, test `${size}: a summer pin stays in summer`:
    - Seed: mechanical 2026, profile `{ year: 1, summer: true }`, `scope: 'קיץ'`.
    - Pin the first summer block through its popover.
    - Assert: `#banner` has no text "כבר לא קיימת".
    - Assert: `localStorage['afeka-sched-v1']`'s `choices` has no key for that course.
    - Switch to the year view and back to summer: the pinned block is still on the board.
- [ ] **Step 2: Run it and make sure it fails:** `npm run test:browser`. The new test fails on the banner assertion.
- [ ] **Step 3: Implement**
  - In `ACT.pin`, set `app.state.choices[cid] = 'must'` only when `!summerScope()`. The solver already forces a pinned course in (`solver-core.js:393`).
  - In `ui-view.js:113`, pass `[app.sem['א'], app.sem['ב'], app.sem['קיץ']]` to `stalePins` (it already filters falsy).
- [ ] **Step 4: Run it and make sure it passes:** `npm run test:browser`, then `node docs/audit-2026-10-23/r1-summer-pin.mjs` (its `stalePins([A,B])` line is today's call; it stays as the record of the bug).
- [ ] **Step 5: Commit:** `fix: a summer pin stays in summer and is not reported gone (#32)`

Known ceiling: choices that past summer pins already turned into "must" stay "must". They can't be told apart from a choice the student made.

### Task 2: Summer builds on the year plan, not on "רק א׳" (#43)

**Files:**
- Modify: `web/ui-view.js:176-179`, and `:198` (the summer note)
- Test: `test/browser/flows.spec.mjs`

**Interfaces:**
- Consumes: `yearSearch()` from `web/ui-common.js`.

- [ ] **Step 1: Write the failing test.** `flows.spec.mjs`, test `${size}: "רק א׳" does not replace the year plan summer builds on`:
  - Seed: mechanical 2026, year 1, summer on.
  - Wait for the year plan. Read `yearIds.length` from storage as `n`.
  - Switch to "רק א׳" and wait for its plan.
  - Assert: stored `yearIds.length === n`.
  - Switch to summer. Assert the note text contains `${n} הקורסים`.
- [ ] **Step 2: Run it and make sure it fails:** `npm run test:browser` (today it stores the א׳-only ids).
- [ ] **Step 3: Implement**
  - Save `state.yearIds` only when `!ui.running && (yearSearch() || !app.sem['ב'])`. When there is no ב׳ file, א׳ is the whole year.
  - Summer note copy: `הקיץ מניח שעוברים את ${n} הקורסים שבמערכת השנתית האחרונה שהוצגה.`
- [ ] **Step 4: Run it and make sure it passes:** `npm run test:browser`
- [ ] **Step 5: Commit:** `fix: summer builds on the last year plan, not on a single semester (#43)`

### Task 3: "רק ב׳" counts א׳ candidates as passed, as the year view does (#42)

**Files:**
- Modify: `web/rules.js:266-285` (`withAfterA`)
- Modify: `web/app.js:464` (`refresh`)
- Modify: `docs/audit-2026-10-23/r2-scope-b.mjs` so it runs the site's ב׳ path
- Test: `test/rules-after-a.test.mjs`, `test/browser/flows.spec.mjs`

**Interfaces:**
- Produces: `withAfterA(data, state, cls, dataA = null)`. It is unchanged for the year view (`data.semester === 'שנה'`).
  - When `data.semester === 'ב'` and `dataA` is given, the א׳ candidates are the ids whose status in `classify(dataA, state)` is `retake`, `available` or `conditional`, and that are `dataA.courses[id].offered`.
  - A course counts as offered in ב׳ when `c.semesters?.includes('ב')` in the year view, or when `c.offered` in a single ב׳ file.
  - Any other case returns `cls` unchanged.
  - Status text is the same as today: `אפשר בסמסטר ב׳ אחרי …`.

- [ ] **Step 1: Write the failing test.** `test/rules-after-a.test.mjs`, test `withAfterA on a single ב׳ file: mechanical 2026 year 1 opens the year-view courses`. Use the real `2027-1/30-2026.json` and `2027-2/30-2026.json`, and the state `normalize({ v: 1, program: 30, startYear: 2026, profile: { year: 1 } })`:
  - With `dataA`: the statuses of "סטטיקה של גוף קשיח", "חשבון דיפרנציאלי אינטגרלי2" and "משוואות דיפ' רגילות" are each `'afterA'`.
  - Without `dataA`: they stay `'blocked'`.
- [ ] **Step 2: Run it and make sure it fails:** `node --test test/rules-after-a.test.mjs`
- [ ] **Step 3: Implement**
  - Share one loop between both cases (no copy of the loop body).
  - In `refresh`, pass `app.state.scope === 'ב' ? app.sem['א'] : null`. If `app.sem['א']` is missing, nothing changes.
- [ ] **Step 4: Make the audit script the gate**
  - Change `r2-scope-b.mjs` to classify ב׳ through `withAfterA(B, state, classify(B, state), A)`.
  - Run `node docs/audit-2026-10-23/r2-scope-b.mjs`. Expected: `plannableInYearView: 0`, and `blockedInScopeB` at most 7, the courses that are blocked in the year view too.
- [ ] **Step 5: Browser test.** `flows.spec.mjs`, test `${size}: "רק ב׳" lists סטטיקה של גוף קשיח as plannable`:
  - Seed: mechanical 2026, year 1, `scope: 'ב'`.
  - The course row shows the "בב׳ אחרי…" state (map-render label), not blocked.
- [ ] **Step 6: Gates:** `node --test test/rules-after-a.test.mjs test/rules.test.mjs`, `npm run test:browser`, `npm run check:real`, `r2-subgroups.mjs`, `r2-prune.mjs`.
- [ ] **Step 7: Commit:** `fix: "רק ב׳" opens courses that follow א׳, as the year view does (#42)`

Then merge prep for branch 1: full `npm test`, a check by eye at 375 px (summer tab, "רק ב׳" list), and ask the owner for OK.

---

## Branch 2: `claude/audit-year-rank`

### Task 4: Fewer missing must courses always ranks first (#41)

**Files:**
- Modify: `web/solver-core.js:665-668` (`compareYearPlans`)
- Test: `test/solver.test.mjs`

**Interfaces:**
- Produces: `compareYearPlans(x, y, sortBy)`, signature unchanged. It now returns `x.missing.length - y.missing.length || lead || y.score - x.score` for every `sortBy`, where `lead` is 0 for `best` and `friends`.

- [ ] **Step 1: Write the failing test.** `test/solver.test.mjs`, test `compareYearPlans: a complete plan beats a higher score that misses a must, for every sort`:
  - `x = { score: 17.41, missing: ['20126'], credits: { a: 15, b: 18.5 }, unlocks: 0 }`
  - `y = { score: 16.28, missing: [], credits: { a: 18.5, b: 16 }, unlocks: 0 }`
  - For each sort in `['best', 'friends', 'credits', 'unlocks']`: assert `compareYearPlans(x, y, s) > 0`.
  - Same-missing case: `compareYearPlans({ ...x, missing: [] }, y, 'best') < 0`.
- [ ] **Step 2: Run it and make sure it fails:** `node --test test/solver.test.mjs` (fails for `best` and `friends`).
- [ ] **Step 3: Implement** in `compareYearPlans` and update the comment above it. `bestPair` uses the same comparator, so the ב׳ choice per א׳ follows on its own.
- [ ] **Step 4: Run it and make sure it passes:** `node --test test/solver.test.mjs`
- [ ] **Step 5: Audit gates**
  - `r2-missing-case.mjs`: plan #1 shows `missing: -`.
  - `r2-missing-sweep.mjs`: 0 cases where the first plan misses more than another.
  - `r2-prune.mjs`: 0 mismatches.
  - `r2-subgroups.mjs`: 0 exceptions.
  - `r2-missing-proof.mjs`: 26/26. It takes minutes, so run it in the background.
  - `npm run check:real`.
- [ ] **Step 6: Commit:** `fix: a year plan that misses a must never ranks above a complete one (#41)`

---

## Branch 3: `claude/audit-input`

### Task 5: Hours can't be saved inverted (#38)

**Files:**
- Modify: `web/ui-actions.js:528-535`
- Modify: `web/app.js` (`normalize`, after the constraints loop)
- Test: `test/app.test.mjs`, `test/browser/flows.spec.mjs`

**Interfaces:**
- Produces:
  - `normalize`: when both `notBefore` and `notAfter` are set and `notBefore >= notAfter` (HH:MM strings compare correctly), `notBefore` becomes `''`.
  - UI: on change, if the new value would make the pair inverted, the field goes back to the old value and a toast says `"לא לפני" צריך להיות מוקדם מ-"לא אחרי".`

- [ ] **Step 1: Write the failing tests**
  - `app.test.mjs`, test `normalize: inverted or equal hours drop notBefore`. Input `{ v: 1, constraints: { notBefore: '18:00', notAfter: '10:00' } }`:
    - Expect `notBefore === ''` and `notAfter === '10:00'`.
    - Same for `'10:00'`/`'10:00'`.
    - `'08:00'`/`'18:00'` is kept.
  - `flows.spec.mjs`, test `${size}: an inverted hour is refused`: set "לא אחרי" to 10:00, then "לא לפני" to 18:00. The "לא לפני" input reads its old value, and the toast text shows.
- [ ] **Step 2: Run them and make sure they fail:** `node --test test/app.test.mjs`, `npm run test:browser`
- [ ] **Step 3: Implement both.**
- [ ] **Step 4: Run them and make sure they pass.**
- [ ] **Step 5: Commit:** `fix: "לא לפני" can't be saved later than "לא אחרי" (#38)`

### Task 6: The credit cap says it is per semester (#44)

**Files:**
- Modify: `web/ui-drawer.js:94`
- Test: `test/browser/flows.spec.mjs` (inside the existing preferences flow, so no separate test)

- [ ] **Step 1: Write the failing assertion:** the preferences panel has a label with text `תקרת נ״ז לסמסטר`.
- [ ] **Step 2: Run it and make sure it fails:** `npm run test:browser`
- [ ] **Step 3: Implement:** the label text becomes `תקרת נ״ז לסמסטר`. At 375 px the label and input stay on one row, or wrap without horizontal scroll.
- [ ] **Step 4: Run it and make sure it passes.**
- [ ] **Step 5: Commit:** `fix: the credit cap label says it is per semester (#44)`

---

## Branch 4: `claude/audit-friends`

### Task 7: "N לא נמצאו" checks every loaded semester (#37)

**Files:**
- Modify: `web/ui-common.js:147` (`allGroupIds`)
- Test: `test/ui-search.test.mjs` (it already sets up `app` with a DOM stub)

**Interfaces:**
- Produces: `allGroupIds(): Set<string>`, the group ids of `app.sem['א']`, `app.sem['ב']` and `app.sem['קיץ']` (the ones that loaded). Both callers (`ui-view.js:106`, `ui-drawer.js:118`) only use `.has`.

- [ ] **Step 1: Write the failing test** `allGroupIds: a ב׳ group is known while "רק א׳" is shown`:
  - Set `app.sem = { א: A, ב: B }` and `app.data = A`, with `mini`-based A and B.
  - Assert `allGroupIds().has(<a ב׳-only gid>)`.
- [ ] **Step 2: Run it and make sure it fails:** `node --test test/ui-search.test.mjs`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it and make sure it passes.**
- [ ] **Step 5: Commit:** `fix: a friend's groups in the other semester are not counted missing (#37)`

### Task 8: A friend link with a taken name asks first (#36)

**Files:**
- Modify: `web/app.js` (new export next to `friendName`)
- Modify: `web/ui-actions.js:48-61` (`addFriend` becomes async)
- Test: `test/app.test.mjs`, `test/browser/flows.spec.mjs`

**Interfaces:**
- Produces: `freeName(friends, name): string` returns `name` if no friend has it, else the first of `${name} 2`, `${name} 3`, … that is free.
- `addFriend(p)` logic:
  - A friend with the same name and **different** groups exists (compared as sorted joins, as in `friendName`): call `askConfirm(\`כבר יש חבר בשם ${name}. להחליף אותו בקישור החדש?\`, { ok: 'להחליף', cancel: 'להוסיף כחבר נוסף' })`. On false, use `freeName(...)`.
  - Same groups: replace silently, as today.
  - The 20-friend limit still comes from `upsertFriend`.

- [ ] **Step 1: Write the failing tests**
  - `app.test.mjs`, test `freeName`:
    - `freeName([], 'נועה') === 'נועה'`
    - `freeName([{ name: 'נועה' }], 'נועה') === 'נועה 2'`
    - `freeName([{ name: 'נועה' }, { name: 'נועה 2' }], 'נועה') === 'נועה 3'`
  - `flows.spec.mjs`, test `${size}: a friend link with a taken name asks, and cancel adds a second friend`:
    - Seed one friend `נועה` with groups G1.
    - Open a friend link named `נועה` with different groups, and press the add button.
    - Assert the dialog text. Press `להוסיף כחבר נוסף`. Stored friends are `['נועה', 'נועה 2']`.
    - Run the same flow again and press `להחליף`: still one `נועה`, holding the new groups.
- [ ] **Step 2: Run them and make sure they fail.**
- [ ] **Step 3: Implement.** Escape counts as cancel, so it adds and nothing is lost.
- [ ] **Step 4: Run them and make sure they pass:** `node --test test/app.test.mjs`, `npm run test:browser`
- [ ] **Step 5: Commit:** `fix: a friend link never replaces another friend of the same name without asking (#36)`

---

## Branch 5: `claude/audit-rollover`

### Task 9: A failed catalog load never saves over a later year (#33)

**Files:**
- Modify: `web/app.js:232-246` (`load`)
- Modify: `docs/OPERATIONS.md` ("מעבר שנת לימודים": add a step to bump `DEFAULT.year` in `web/app.js`)
- Modify: `docs/audit-2026-10-23/r1-rollover.mjs`, so it goes through `load()`
- Test: `test/app.test.mjs`

**Interfaces:**
- Produces: `load()` sets `app.noSave = true` when `app.catalog === FALLBACK_CATALOG` and `saved.year > s.year`, using the same message as the existing fallback case.
  - `normalize` is unchanged: the year still never comes from input, and `test/app.test.mjs`'s "foreign ... year: 2000 ... ignored" still holds.

- [ ] **Step 1: Write the failing test.** `app.test.mjs`, test `load: a failed catalog load does not save a later-year state back a year`:
  - Stub `globalThis.localStorage` with a Map-backed object holding a save with `year: 2028`, `profile: { year: 3 }` and one friend.
  - Set `app.catalog = FALLBACK_CATALOG` and call `load()`. Assert `app.noSave === true`.
  - Then set `app.catalog` to a 2028 catalog and call `load()` again. Assert `profile.year === 3` and `friends.length === 1`.
- [ ] **Step 2: Run it and make sure it fails:** `node --test test/app.test.mjs`
- [ ] **Step 3: Implement** the one extra condition in `load`. Add the OPERATIONS step.
- [ ] **Step 4: Run it and make sure it passes.** `r1-rollover.mjs`, updated to call `load()` with a stubbed storage, prints `profile.year 3 friends 1` for visit 3.
- [ ] **Step 5: Commit:** `fix: a failed catalog load never moves a saved year back (#33)`

---

## Branch 6: `claude/audit-exams`

### Task 10: Exams from a real page through to the site (#35)

**Files:**
- Modify: `web/app.js:356` (`pickData`)
- Modify: `docs/OPERATIONS.md` (a "first night with exams" checklist)
- Test: `test/build.test.mjs` (new case), `test/browser/flows.spec.mjs`

**Interfaces:**
- Consumes: `parseExams(html)` (`scripts/parse.mjs:103`), the build in `scripts/build.mjs` that attaches exams to groups (`:61-89`), and `scripts/fixtures/exams-2026.html` (a real 2026 yedion page).
- Produces: the year view's `examsPublished` is `A.examsPublished || B.examsPublished`, so the weight option shows when either semester has exams. Per-tab text already reads `shownData()`.

- [ ] **Step 1: Write the failing tests**
  - `build.test.mjs`, test `real exam page: the build attaches exams, and the solver sees clashes and spread`:
    - Parse `exams-2026.html`, then build mechanical 2026 semester א׳ from the existing build fixtures plus those rows.
    - Assert `examsPublished === true` and that at least one primary group has a `moed: 1` exam.
    - Assert `search()` with `examsSameDay: 'forbid'` returns no plan holding two exams on the same date.
    - Assert `icsParts` includes the exam events.
  - `flows.spec.mjs`, test `${size}: the year view shows the exam weight when only ב׳ has exams`:
    - Route the ב׳ data file to a copy with `examsPublished: true` (Playwright `page.route`).
    - Assert the "פיזור בחינות" option is in the preferences panel.
- [ ] **Step 2: Run them and make sure they fail.** The browser test fails today; the build test may already pass. If so, keep it as the guard, and say so in the commit.
- [ ] **Step 3: Implement** the `||` and the OPERATIONS checklist:
  - On the first night `examsPublished` is true: run the build test.
  - Open the site at 375 px. Check the exam list in the registration panel, a clash refusal, and the calendar file.
- [ ] **Step 4: Run them and make sure they pass:** `node --test test/build.test.mjs`, `npm run test:browser`
- [ ] **Step 5: Commit:** `fix: exams: the year view flag reads both semesters, and a real exam page runs end to end (#35)`

---

## Branch 7: `claude/audit-grade-notice`

### Task 11: The grade import says how many rows it skipped (#40, part 1)

**Files:**
- Modify: `web/grade-import.js:100-114` (`parseGradeSheet`)
- Modify: the preview text in the grade-sheet dialog (find it from the `parseGradeSheet` caller)
- Test: `test/grade-import.test.mjs`, `test/browser/flows.spec.mjs`

**Interfaces:**
- Produces: `parseGradeSheet(rows, data)` returns the same array, plus a property `skipped: number` on it. `skipped` counts the rows whose leading token is a course id in `data.courses` but that `parseRow` returned null for (excluding `טרם`). Existing callers keep working.
- Preview line when `skipped > 0`: `${skipped} שורות לא זוהו ולא יובאו. אפשר לסמן אותן ידנית.`

- [ ] **Step 1: Write the failing test.** `grade-import.test.mjs`, test `parseGradeSheet counts a row with a grade in words as skipped`: one row with a known course id and `עבר` in the grade slot gives `skipped === 1` and no entry for that id.
- [ ] **Step 2: Run it and make sure it fails:** `node --test test/grade-import.test.mjs`
- [ ] **Step 3: Implement**, plus the preview line, and a browser assertion inside the existing grade-sheet flow.
- [ ] **Step 4: Run it and make sure it passes.**
- [ ] **Step 5: Commit:** `fix: the grade import says how many rows it could not read (#40)`

---

## Waiting on outside information

- **#34, regulation 11.4.2 and 11.5.1** (owner brings the text). When it arrives:
  1. Write down how the wording counts each rule:
     - 11.4.2 average: does it include failed grades?
     - 11.5.1 "4 courses": per year or cumulative?
  2. If the wording differs from the code, open branch `claude/audit-regulation`. Write a `test/rules.test.mjs` case that quotes the clause and fails first. Change `gradeAverage` (`rules.js:335`) or the count (`rules.js:231`). Then run `npm run check:real`.
  3. If it matches, close #34 with the quote.
- **#39, חשמל ערב 4 years vs 5**: a read-only check on the public yedion (`S_SHOW_PROGS` for 22-2024 and 22-2025, see `docs/research.md` §7). If 2024 really has 4 years, close as correct. If a list is missing, it is a scraper or `programs.json` fix in its own branch. Who checks is still open: Claude can do it on request.
- **#40, grades in words**: needs a real sheet with `עבר`/`נכשל`. When one arrives, add the words to the slot regex at `grade-import.js:57` with a test made from that sheet's row. Task 11's notice covers the gap until then.
