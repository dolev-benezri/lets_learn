# Edit an Existing Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A separate page (`#edit`) where a student loads the schedule they have, marks what may move, picks a goal, and gets proposals with the fewest changes among those found, shown before and after.

**Architecture:** Pure modules first (`web/edit-state.js` for the saved edit state, `web/edit-search.js` for the adapter that turns it into `search` calls, `web/edit-worker.js` to run them off the main thread), one solver option (`allowFull`), and per-row detail from the friend-import readers. Then the page shell (router branch, side menu, mode choice) and the screens (`web/ui-edit.js`). The build page's code paths are not entered on the edit page.

**Tech Stack:** Plain ES modules in the browser, no build step; `node --test` for unit tests; Playwright (`test/browser/*.spec.mjs`) for browser tests; `node-html-parser` for HTML assertions in unit tests.

**Spec:** `docs/superpowers/specs/2026-11-09-edit-existing-schedule-design.md` (owner-approved 2026-11-09). Read it before any task; this plan argues from it.

## Global Constraints

- Copy, verbatim (Hebrew UI): "לבנות מערכת חדשה", "לשפר מערכת שכבר יש לי", "עורכים מערכת קיימת · החלפה", "קובץ מהמתכנן (PDF או צילום)", "לבחור קורסים וקבוצות ידנית", "לבדיקה", "המערכת כבר רשומה במכללה", "הבא: שינויים", "נשאר במקום", "יכול לזוז", "קבוצות אחרות", "להוריד מהמערכת", "לפנות יום ▾", "פחות חלונות", "לסיים עד ▾", "+ קורס", "חפש הצעות", "המקורית", "היה כאן", "הראה את היום החדש", "שמור הצעה", "העתק שינויים", "חזרה למערכת המקורית", "להוסיף:", "להסיר:", "לא הספקנו לבדוק הכל".
- Never the words "החל" / "הרשם" / "apply" / "register" on an action. Every proposal and the copied text carry: "הצעה בלבד. ההרשמה נעשית במכללה."
- The build page must behave exactly as before: every existing unit and browser test passes unchanged, except where a task says otherwise.
- `web/` lines: at most 160 characters, 200 for string literals and HTML (`test/line-length.test.mjs`).
- No real student file in the repo; browser tests use synthetic PDFs only.
- localStorage access is always wrapped in try/catch (private mode); the page works for the visit without storage.
- Phone widths 375 and 320 px and desktop; light and dark; `prefers-reduced-motion` turns movement off.
- Codex reviews every commit before it is made (owner's rule). Unit tests run under Node 24 (`npx -y -p node@24 node --test "test/*.test.mjs"`) before any push. Nothing reaches `main` without the owner's word.
- Branches: stage 1 `claude/edit-core` (Tasks 1-7), stage 2 `claude/edit-shell` (Task 8, parallel with stage 1), stage 3 `claude/edit-screens` from both (Tasks 9-12), stage 4 on `claude/edit-screens` (Tasks 13-14).

## Review Focus

1. A planner file where a course's lecture row matches a group and its tutorial row matches none: the whole course becomes fixed (one synthetic lesson set), never half real and half fixed. Test in Task 4.
2. A registered student whose own group is full marks that course movable: keeping the own group stays possible, and no other full group is ever offered. Test in Task 4.
3. The "free a day" goal on a day that holds a fixed lesson: the tries report "no proposal" with the reason, not a timeout and not a crash. Test in Task 6.
4. The data file changed since the schedule was saved (new academic year): step 2 is blocked with the reload message, step 1 still shows the snapshot. Test in Task 3 (state) and Task 13 (browser).
5. Storage unavailable (private mode): the edit page loads, works, and says nothing breaks; nothing is thrown. Test in Task 3.

---

## Stage 1: core (branch `claude/edit-core`)

### Task 1: `allowFull` in the solver

**Files:**
- Modify: `web/solver-core.js` (`buildOptions` at :86, `search` at :413, `optionsOf` at :648, `searchAll` at :988)
- Test: `test/solver-allowfull.test.mjs` (create)

**Interfaces:**
- Produces: `buildOptions(course, { ..., allowFull })` and `search({ ..., allowFull })`. `allowFull: string[] | undefined`. When an array: a full group passes only if its id is in it (the pin exemption at :154 does not apply). When `undefined`: today's behavior exactly.

- [ ] **Step 1: Write the failing tests** in `test/solver-allowfull.test.mjs`, on a two-group synthetic course (groups `A` full, `B` not full, no links):
  - `buildOptions(c, { pins: ['A'] })` keeps the `A` option (today's pin exemption).
  - `buildOptions(c, { pins: ['A'], allowFull: [] })` has no option containing `A`.
  - `buildOptions(c, { allowFull: ['A'] })` has an option containing `A` and one containing `B`.
  - `search({ data, courses: [{ id, mode: 'must' }], allowFull: ['A'] })` can return `A`; with `allowFull: []` it never does.
  - A full linked tutorial of an allowed lecture is refused unless its own id is in `allowFull`.
- [ ] **Step 2: Run** `node --test test/solver-allowfull.test.mjs`. Expected: FAIL (option ignored).
- [ ] **Step 3: Implement.** In `buildOptions`, replace the full check with: `full && !(allowFull ? allowFull.includes(g.id) : pins.includes(g.id))`, still skipped when `includeFull` is true and `allowFull` is undefined. With `allowFull` set, `includeFull` is ignored for full groups. Add `allowFull` to the option signature `sig` input only if needed to keep de-duplication correct. Thread `allowFull` through `search`'s `buildOptions` call, its recursive `search` call (the "prefer" retry), `relaxed`, and `optionsOf`; `searchAll` passes it untouched.
- [ ] **Step 4: Run** the new file and `node --test test/solver*.test.mjs`. Expected: all PASS.
- [ ] **Step 5: Codex review, then commit** `feat(solver): allowFull, the full groups a search may keep`.

### Task 2: per-row detail from the import readers

**Files:**
- Modify: `web/friend-schedule.js` (`matchRows` at :211, `matchGrid` at :249, `mergeScans` at :265)
- Test: the existing friend-schedule unit test file (find it with `grep -l matchRows test/*.test.mjs`), add cases there

**Interfaces:**
- Produces: `matchRows(...)` and `matchGrid(...)` return a new field `rows: ReviewRow[]` beside the current ones (all current fields unchanged). `mergeScans(...)` returns `rows` too (see the last bullet of this block for which).
- `ReviewRow = { code: string|null, name: string|null, type: string|null, text: string, via: 'code'|'name'|'grid', meets: [{ day: number, start: 'HH:MM', end: 'HH:MM' }], candidates: string[] (group ids, best first), chosen: string|null, confidence: 'sure'|'weak'|'tie'|'none' }`.
- Provenance: the readers record how a row's course was identified. `rowsFromTable` sets `via: 'code'` only when the course code was read from the row's own text; `rowsFromWords` sets `via: 'code'` when its `cid` came from a code (the code column through `codeOf`, `web/friend-schedule.js:138-140`, or `cidInText`) and `via: 'name'` when it came from a name match (`:143` onward); `rowFromBlock` (grid) sets `via: 'grid'`. `text` is the row's source text.
- Confidence rule (spec, Step 1): `sure` = `via === 'code'`, exactly one top-ranked group, and every meet of the row has the group's day and exact start and end; `tie` = the top two ranked scores are equal; `none` = no ranked group; `weak` = every other single match.
- `mergeScans` keeps a review row for every group it accepts, including grid groups that fill gaps beside a table (`web/friend-schedule.js:285`), and for every unknown it reports.

- [ ] **Step 1: Write the failing tests:** a coded row with exact hours gives one `sure` row; the same row with its end 10 minutes off gives `weak`; a `rowsFromWords` row whose `cid` came from its name, with exact hours, gives `weak`, never `sure`; two groups with equal scores give `tie` with both in `candidates`; an unknown code gives `none` with its `meets` kept; a grid group accepted beside a table has its review row in `mergeScans().rows`; `found`, `unknown`, `ambiguous`, `weak`, `quality` equal what they were before for the existing fixtures. Authorized test change: the whole-object assertions in `test/friend-schedule.test.mjs:178-181` compare the result without its new `rows` field (e.g. `const { rows, ...rest } = r; assert.deepEqual(rest, ...)`); the file's existing assertions are otherwise unchanged (the new cases are added beside them).
- [ ] **Step 2: Run** the file. Expected: FAIL (`rows` undefined).
- [ ] **Step 3: Implement** by collecting a `ReviewRow` per input row inside the existing loop (no second ranking pass). `meets` days come from the row's `days` (`m.days`); a meet with several days becomes one meet per day.
- [ ] **Step 4: Run** the file and the whole friend import tests (`node --test test/friend*.test.mjs`). Expected: PASS.
- [ ] **Step 5: Codex review, then commit** `feat(import): each row's candidates and confidence, for review`.

### Task 3: the edit state

**Files:**
- Create: `web/edit-state.js`
- Test: `test/edit-state.test.mjs`

**Interfaces:**
- Produces:
  - `EDIT_KEY = 'afeka-sched-v1-edit'` (the mode key belongs to Task 8, which runs on another branch).
  - `Lesson = { course: string, name: string, type: string, group: string|null, day: 1-6, start: 'HH:MM', end: 'HH:MM' }`.
  - `EditState = { v: 1, dataset: { year, sem, program, startYear } | null, registered: boolean, owned: string[], original: Lesson[], baseline: Lesson[], movable: string[], swaps: { [courseId]: string[] }, added: string[], removed: string[], goal: { dayOff: number|null, notAfter: string|null, fewerGaps: boolean }, draft: Draft | null }`.
  - `Draft = { rows: ReviewRow[] (Task 2's shape, re-validated field by field on load), choices: { [rowIndex]: string|null } (a group id, or null for "no group, stays fixed"), registered: boolean, sem: 'א'|'ב'|'קיץ'|null }`: step 1's unfinished review, saved on every change and cleared by `loadSchedule`.
  - `emptyEdit(): EditState`
  - `normalizeEdit(raw: unknown): EditState` (drops unknown keys and bad values; `owned` filtered to group ids present in `original`; `movable`/`added`/`removed` filtered to strings; never throws)
  - `loadEdit(): EditState`, `saveEdit(st: EditState): void` (try/catch around storage)
  - `lessonsOf(groupIds: string[], data): Lesson[]` (one lesson per meeting of each group)
  - `loadSchedule(st, lessons: Lesson[], dataset, registered: boolean): EditState` (sets `original` and `baseline` to `lessons`, `owned` to their group ids when `registered`, clears the rest)
  - `restoreOriginal(st): EditState`, `saveProposal(st, lessons: Lesson[]): EditState` (baseline = lessons; clears `movable`, `swaps`, `added`, `removed`; never touches `owned` or `original`)
  - `sameDataset(st, data, state): boolean` (`dataset` matches the shown data file's year, semester, program and start year)

- [ ] **Step 1: Write the failing tests:** normalize drops `{ evil: 1 }` and a non-array `movable`; `owned` never contains an id missing from `original`; `saveProposal` leaves `owned` and `original` unchanged and clears `movable`; `restoreOriginal` copies `original` into `baseline`; `sameDataset` false after the year changes; a `draft` with two choices survives `saveEdit` then `loadEdit`, and a draft row with a non-string `code` is dropped; `loadSchedule` clears `draft`; with a `localStorage` stub that throws on every call, `loadEdit()` returns `emptyEdit()` and `saveEdit()` does not throw (Review Focus 5); the build save key `afeka-sched-v1` is never read or written by these functions.
- [ ] **Step 2: Run** `node --test test/edit-state.test.mjs`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** in `web/edit-state.js`, mirroring `app.js` `normalize` style (`strs`-like guards).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Codex review, then commit** `feat(edit): the saved edit state`.

### Task 4: the adapter, edit state to one search

**Files:**
- Create: `web/edit-search.js`
- Test: `test/edit-search.test.mjs` (on frozen data via `test/fixtures/real.mjs` and small synthetic data)

**Interfaces:**
- Consumes: `EditState`, `Lesson` (Task 3); `classify(data, state)` (`web/rules.js:143`); `search` args (Task 1).
- Produces:
  - `FIXED = 'fixed:'` id prefix; `FIXED_COURSE = 'fixed:all'`.
  - `kinds(edit, data): { real: string[], fixed: string[] }` (a course is fixed if any of its baseline lessons has `group === null` or a group id not in `data`, or the course is not in `data`; a fixed course that is in `movable` and exists in `data` counts as real)
  - `editQuery(edit, data, record): SearchArgs` where `record` is the shared "המצב שלי" state (passed, failed, grades, exempt, outsideDone, profile) and `SearchArgs = { data, courses, pins, constraints, weights, statuses, allowFull?, topK, timeLimitMs }`:
    - `data`: a shallow copy with `courses[FIXED_COURSE] = { name: 'קבוע', credits: 0, prereqs: [], groups: [{ id: 'fixed:g', type: 'הרצאה', primary: true, linked: [], full: false, lecturer: '', exams: [], meetings: <every fixed lesson not in removed> }] }` when there are fixed lessons.
    - `courses`: real baseline courses + `added` − `removed`, each `{ id, mode: 'must' }`, plus `{ id: FIXED_COURSE, mode: 'must' }` when present.
    - `pins`: every group of real baseline courses not in `movable`, plus every id in `swaps`, plus `'fixed:g'`.
    - `constraints`: build defaults (`app.js` DEFAULT `constraints`) with `blocks: []`, `split: false`; goal `dayOff` → `{ dayOff: [d], dayOffHard: true }`; goal `notAfter` → `{ notAfter, windowHard: true }`; registered → `includeFull: false`, `allowFull: edit.owned`; not registered → `includeFull: true`.
    - `weights`: build defaults; `fewerGaps` → `compact: 5`.
    - `statuses`: `classify(data, record).statuses` with each `missingParallel` filtered: drop a requirement any of whose ids is a fixed course still present (spec: `present`), and drop one listed in `acceptedParallel(edit, data, record)` (spec: `acceptParallel`).
  - `acceptedParallel(edit, data, record): string[]` keys `'<courseId>#<n>'`, n the index in `prereqs`, for parallel requirements already unmet among `edit.original`'s courses (a requirement the record satisfies, e.g. a passed partner, is not unmet). The filter maps each `missingParallel` entry back to its `prereqs` index by comparing its id list with that requirement's `anyOf` ids.
  - `displayData(lessons: Lesson[], data): { data, groups: string[] }`: what the week draws. Lessons whose group is in `data` keep it; every other lesson gets its own display group `fixed:<courseId>:<i>` inside a display course `fixed:<courseId>` that carries the lesson's real name and type. This model is for drawing and tapping only; the search keeps the single aggregate `fixed:all` course.
- Note: the spec names `present` and `acceptParallel` as inputs; the solver's parallel check reads `statuses[id].missingParallel` (`web/solver-core.js:482`), so filtering that list in the adapter gives the same behavior with no further solver change.

- [ ] **Step 1: Write the failing tests:**
  - A baseline of two real courses, one movable: pins hold every group of the other course and none of the movable one.
  - A course whose tutorial lesson has `group: null` is in `kinds().fixed`, its id is absent from `courses`, its lessons are in `fixed:g`'s meetings (Review Focus 1).
  - Two fixed lessons that overlap still give a search with a result (one option).
  - A fixed course whose real id exists, marked movable, is in `kinds().real` and in `courses` unpinned.
  - Registered, own group full, course movable: `allowFull` equals `owned`; the search can keep the own group and returns no other full group (Review Focus 2).
  - Goal `dayOff: 3`: `constraints.dayOff` is `[3]` and `dayOffHard` true; a fixed lesson on day 3 makes the search return no result.
  - A course with two parallel requirements, one unmet in `original`: only that one is dropped from `missingParallel`.
  - A fixed course that satisfies another course's parallel requirement: that requirement is dropped; after the fixed course is in `removed`, it is not.
  - `displayData` of two fixed courses gives two display courses with their own names, so each can be tapped and removed on its own.
  - Overlap warnings: `overlaps(lessons): [courseA, courseB][]` lists overlapping pairs, used by step 2 (pinned real pairs block the search) and proposal 0 (every pair is a warning).
- [ ] **Step 2: Run** `node --test test/edit-search.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** `kinds`, `acceptedParallel`, `editQuery` in `web/edit-search.js` (no DOM, no `app` import; the build defaults are imported from `web/app.js` only if that import has no side effects, otherwise copy the default `constraints` and `weights` objects into a `DEFAULTS` constant with a comment pointing at `app.js`).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Codex review, then commit** `feat(edit): the adapter from the edit state to a search`.

### Task 5: proposals, ranking and the summary line

**Files:**
- Modify: `web/edit-search.js`
- Test: `test/edit-search.test.mjs`

**Interfaces:**
- Produces:
  - `gapMinutes(lessons: Lesson[]): number` (per day: merge overlapping or touching intervals first, then sum the gaps between the merged intervals)
  - `proposalsFrom(results, edit, query): Proposal[]` where `Proposal = { lessons: Lesson[], changed: string[] (course ids whose group set differs), added: string[], removed: string[], score: number }`:
    - drops a result whose complete lesson set (real and fixed lessons, compared by course, group, day, start and end) equals the baseline's, so a proposal that only removes a fixed course stays;
    - with `goal.fewerGaps`, drops a result whose `gapMinutes` is not below the baseline's;
    - sorts by `changed.length + added.length + removed.length` ascending, then `score` descending;
    - proposal lessons include the fixed lessons (from the baseline, minus `removed`).
  - `summaryLine(baseline: Lesson[], p: Proposal, data): string`: parts joined by " · ": a freed day ("יום ג׳ התפנה"), fewer gap minutes ("פחות X דקות חלון"), an earlier end ("מסיימים ב-HH:MM"), the change count ("קורס אחד זז" / "N קורסים זזו"), and "אותו מרצה" when every changed course keeps its lecturer.

- [ ] **Step 1: Write the failing tests:** a result equal to the baseline is dropped; a result that only removes a fixed course is kept with `removed: [thatCourse]`; ranking puts a one-change proposal before a two-change one with a higher score; `fewerGaps` drops a proposal with equal gaps; `gapMinutes` of 08:00-10:00 and 12:00-14:00 on one day is 120, and of 08:00-12:00, 09:00-10:00, 11:00-13:00 is 0; `summaryLine` for a move that frees Tuesday reads "יום ג׳ התפנה · קורס אחד זז · אותו מרצה".
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Codex review, then commit** `feat(edit): proposals ranked by changes, with a summary line`.

### Task 6: single-course tries and the edit worker

**Files:**
- Modify: `web/edit-search.js`
- Create: `web/edit-worker.js`
- Test: `test/edit-search.test.mjs`

**Interfaces:**
- Produces:
  - `tryEach(edit, data, record, run = search, { perMs = 400, totalMs = 4000 } = {}): { found: { course: string, proposals: Proposal[] }[], timedOut: boolean }`: for each real baseline course not already movable, runs `editQuery` with that course added to `edit.movable`; keeps the courses whose try gave at least one proposal; stops when `totalMs` is spent (`timedOut: true`).
  - `runEdit(msg): { proposals: Proposal[], enabling: string[], timedOut: boolean, diagnosis: string[] }` where `msg = { kind: 'search'|'tries', edit, data, record }`:
    - `'tries'` (nothing movable, a goal set): `tryEach`; `proposals` = all `found` proposals ranked by `proposalsFrom`'s order; `enabling` = the `found` courses.
    - `'search'`: one `search(editQuery(...))` and `proposalsFrom`. When that gives no proposal, it runs `tryEach` as a fallback probe and returns `proposals: []`, `enabling` = the `found` courses (the page offers "תן לו לזוז" for each), the fallback's `timedOut`, and the first search's `diagnosis`.
  - `web/edit-worker.js`: `self.onmessage = (e) => self.postMessage(runEdit(e.data))`.

- [ ] **Step 1: Write the failing tests:** `runEdit({ kind: 'tries' })` with nothing movable and a "free a day" goal reachable by moving course X only returns proposals that change only X and `enabling: [X]`; `runEdit({ kind: 'search' })` with course Y movable, where only moving X too reaches the goal, returns `proposals: []` and `enabling: [X]`; with the goal day holding a fixed lesson, both kinds return `proposals: []`, `enabling: []`, `timedOut: false` (Review Focus 3); a stub `run` that sleeps past `totalMs` gives `timedOut: true`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Codex review, then commit** `feat(edit): single-course tries and the edit worker`.

### Task 7: copying the changes

**Files:**
- Modify: `web/edit-search.js`
- Test: `test/edit-search.test.mjs`

**Interfaces:**
- Produces: `changeText(from: Lesson[], to: Lesson[], data): string`. Lines: "להוסיף:" then one line per course gaining groups (`<name> (<course id>): <group ids, comma-separated>`), "להסיר:" then one line per course losing groups (removed courses included), then "הצעה בלבד. ההרשמה נעשית במכללה." Sections with no lines are left out. Fixed lessons (`group: null`) never appear.
- The caller passes `from` = lessons of `owned` plus fixed lessons when registered, otherwise the baseline (spec, "Copying the changes").

- [ ] **Step 1: Write the failing tests:** a moved course lists its new lecture and tutorial ids under "להוסיף:" and the old ones under "להסיר:"; a removed course appears only under "להסיר:"; the last line is the disclaimer; no "החל" or "הרשמה" verb other than in the disclaimer.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all PASS.
- [ ] **Step 5: Codex review, then commit** `feat(edit): copy only the changes`.

## Stage 2: page shell (branch `claude/edit-shell`, parallel with stage 1)

### Task 8: route, side menu, mode choice

**Files:**
- Modify: `web/app.js` (`routeOf` at :566), `web/ui-plan.js` (`onHash` at :59, `renderRoute` at :24, `renderAll` at :89), `web/ui-common.js` (`PAGE` at :222), `web/ui-text.js` (`PAGE_NAME` at :299), `web/ui-search.js` (the run timer at :26, the probe worker at :128), `web/ui-drawer.js` (`openPanel` at :312), `web/index.html` (header at :38, pages at :94), `web/style.css`, `test/browser/helpers.mjs`
- Create: `web/ui-mode.js`
- Test: `test/edit-shell.test.mjs` (pure parts), `test/browser/edit-shell.spec.mjs`

**Interfaces:**
- Produces:
  - `isEditHash(h: string): boolean` in `web/app.js` (`'#edit'` or starting with `'#edit/'`); `routeOf` returns `'edit'` for those (`PAGE` in `ui-common.js` and `PAGE_NAME` in `ui-text.js` gain an `edit` entry: container `edit`, title "עריכת מערכת קיימת").
  - `cancelRun(): void` in `web/ui-search.js`: clears the pending run timer, terminates `ui.worker` and `ui.probeWorker`, and bumps a run counter so a result posted before the termination is ignored.
  - `<main id="edit" class="step-page" aria-labelledby="editTitle" hidden></main>` in `index.html`; a `☰` button `data-act="menu"` with `aria-label="תפריט"` in the header, outside `.actions`.
  - `renderEdit()`: exported by `web/ui-edit.js`; in this task a stub that writes the title and the mode label (`data-act="menu"`, text "עורכים מערכת קיימת · החלפה").
  - `openPanel('menu')`: a panel with two links, "בניית מערכת" (`href="#"`) and "עריכת מערכת קיימת" (`href="#edit"`), the current one `aria-current="page"`; choosing one writes `MODE_KEY`.
  - `MODE_KEY = 'afeka-sched-v1-mode'` (values `'build'`, `'edit'`), exported from `web/ui-mode.js`; storage access in try/catch.
  - `needsModeChoice(): boolean` in `web/ui-mode.js`: terms accepted, no `MODE_KEY` stored, `!app.state.programSet`, and the hash is not an explicit link (`#edit…`, `#me`, `#courses`, `#prefs`, `#f=`, `#b=`). When true, the mode-choice screen (two cards, copy in Global Constraints) renders in the `#me` container before the identity questions.
- Behavior:
  - `renderAll` (run by every `refresh`, so also on first load and reload): first lines `if (isEditHash(location.hash)) { cancelRun(); renderRoute(); renderEdit(); return; }`. This covers a direct load of `#edit`.
  - `onHash`: after the `!app.cls` early return and before the `#f=`/`#b=` branch, the same three calls and `return` for an edit hash.
  - `renderRoute` on the edit view: the gate is the terms only (`!termsOk()`), shown in the `#me` container as today; the build identity gate (`gated()`: year and track) does not apply; the edit page asks for those itself (Task 10).
  - Authorized test change: `visit()` in `test/browser/helpers.mjs` seeds `'afeka-sched-v1-mode': 'build'` (like `TOUR_SEEN`) unless a new `withModeChoice` argument is true, so the existing fresh-visit specs that expect the track question right after the terms keep passing unchanged; only `edit-shell.spec.mjs` sets `withModeChoice`.
  - CSS: on `body[data-view="edit"]` hide `nav.steps`, `#switcher` and the header `.actions`; the ☰ button stays.
  - The tour and theme buttons do not move.

- [ ] **Step 1: Write the failing tests:** `routeOf('#edit')` and `routeOf('#edit/changes')` are `'edit'`, `routeOf('#f=abc')` is still `'plan'`; `needsModeChoice` false when `programSet` is true or the hash is `#me`. Browser (`edit-shell.spec.mjs`, phone 375 and desktop): a fresh visitor after terms sees both mode cards; choosing edit lands on `#edit` with the mode label; a direct load and a reload of `#edit` render the edit page (not the build page) and run no build search, also after waiting 1 s for the build's run timer; ☰ opens the menu with the two modes; back on `#` the build page works and no build search ran while on `#edit` (assert `window.__searches` stays 0 there, counted with an init script that wraps `Worker.prototype.postMessage`); a `#f=` link still opens the build page.
- [ ] **Step 2: Run** `node --test test/edit-shell.test.mjs` and `npm run test:browser -- edit-shell`. Expected: FAIL.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run** the two, then `npm test` and `npm run test:browser` (all specs, WebKit). Expected: all PASS, the build page's specs unchanged.
- [ ] **Step 5: Codex review, then commit** `feat(edit): the edit page's route, side menu and mode choice`.

## Stage 3: screens (branch `claude/edit-screens`, from `claude/edit-core` and `claude/edit-shell`)

### Task 9: the friend editor's edit variant

**Files:**
- Modify: `web/ui-friend-editor.js` (`openFriendEditor` at :38, save at :519, semester radios near :582)
- Test: `test/browser/edit-import.spec.mjs` (create; friend specs must stay green)

**Interfaces:**
- Consumes: `ReviewRow` (Task 2).
- Produces: `openFriendEditor({ friend, onSave, returnFocusId, mode = 'friend' })`. With `mode: 'edit'`: no name field, the heading "המערכת שלי", semesters א, ב and קיץ (קיץ only when `app.state.profile.summer`), and on save `onSave({ groups: string[], rows: ReviewRow[], sem })`. `rows` holds a review row for every group the imports placed (file scans through `scanCanvases`, PDF text through `rowsFromTable` + `matchRows` at :469, and pasted text) and for every unknown row; hand picks add a `sure` row each.
- Paste in edit mode: text with group ids keeps going through `groupsFromText` (`web/friend-import.js`); text without group ids goes through `rowsFromTable` + `matchRows`, like a PDF's text, so a pasted planner table works.
- Friend mode is the same behavior as today.

- [ ] **Step 1: Write the failing browser test:** opening the editor with `mode: 'edit'` (through the edit page's "לבחור קורסים וקבוצות ידנית" from Task 10, or by calling it from `page.evaluate` until Task 10 lands) shows no name field and a קיץ option when summer is planned; saving returns the picked groups; the existing friend specs pass unchanged.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** this spec and the friend specs. Expected: PASS.
- [ ] **Step 5: Codex review, then commit** `feat(edit): the friend editor loads my schedule`.

### Task 10: step 1, המערכת שלי

**Files:**
- Modify: `web/ui-edit.js` (replace the Task 8 stub), `web/style.css`
- Test: `test/ui-edit.test.mjs` (HTML from pure render helpers, `node-html-parser`), `test/browser/edit-import.spec.mjs`

**Interfaces:**
- Consumes: Tasks 3, 9; `identityPick` from `web/ui-me.js` for the one-line track and year question (export it if it is not exported yet, no other change); `seatsAt` (`web/app.js:412`).
- Produces: `stepOneHtml(edit, data, review: ReviewRow[]): string` (pure), and the `#edit` screen:
  - the two ways in (copy in Global Constraints), opening Task 9's editor;
  - a "לבדיקה" list of rows whose `confidence` is not `sure`, each with its candidates as radio buttons and "בלי קבוצה (נשאר קבוע)" for `none`; "הבא: שינויים" stays disabled-looking but enabled, and on press focuses the first unconfirmed row with a message, until every row is confirmed;
  - the "המערכת כבר רשומה במכללה" checkbox;
  - the semester (from the file, else asked);
  - when `!sameDataset(...)` (Task 3): the note "המערכת נשמרה מול נתונים אחרים. טענו אותה שוב כדי לערוך.", the saved schedule listed from its snapshots (course, type, day, hours) with "חזרה למערכת המקורית" still available, and step 2 unreachable (Review Focus 4);
  - every choice in the review list, the registered checkbox and the semester are written to `edit.draft` and saved at once (reload mid-review keeps them);
  - on "הבא: שינויים": `loadSchedule` (Task 3) with confirmed lessons (rows confirmed as `none` become lessons with `group: null` and the row's hours), `saveEdit`, then `location.hash = '#edit/changes'`.

- [ ] **Step 1: Write the failing tests:** `stepOneHtml` lists a `tie` row with both candidates and a `none` row with "בלי קבוצה (נשאר קבוע)"; no row with `sure` appears in the review list; with a different dataset the reload note is shown and no link to `#edit/changes`. Browser: paste a planner-style table (row format copied from the existing `rowsFromTable` unit tests, codes from frozen `30-2026`), confirm one tie, reload before confirming the second uncertain row and find the first choice kept, tick registered, go to step 2; reload keeps everything; with a seeded state from another academic year the snapshot list and the reload note show.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Codex review, then commit** `feat(edit): step 1, load and review my schedule`.

### Task 11: step 2, שינויים

**Files:**
- Modify: `web/ui-edit.js`, `web/ui-grid.js` (`renderWeek` at :293), the block click handler in `web/ui-actions.js`, `web/style.css`
- Test: `test/ui-edit.test.mjs`, `test/ui-map.test.mjs` or a new `test/ui-grid-week.test.mjs` for `renderWeek`

**Interfaces:**
- Consumes: Tasks 3-6.
- Produces:
  - `renderWeek(ctx)` accepts optional `ghosts: { day, start, end }[]` (drawn like `busyBlock` with class `ghost` and the visible label "היה כאן") and `changed: Set<string>` (group ids, class `changed` on their blocks). Without them, identical output to today (assert with a snapshot of a build call).
  - The edit week: `renderWeek` with `displayData(lessons, data)` (Task 4), `res = { groups }` of its groups, `pins: []`, `friends: []`; each block carries "נשאר במקום" or "יכול לזוז" in its screen-reader text and a class `movable` for the latter.
  - A `data-act="block"` click on the edit page opens the edit lesson menu (a non-modal `role="dialog"` with "יכול לזוז" toggle, "קבוצות אחרות", "להוריד מהמערכת"); Escape closes it and focus returns to the block, or to `#editTitle` when the block is gone.
  - "קבוצות אחרות": posts `{ kind: 'search' }` to `web/edit-worker.js` with only that course movable and lists each proposal's new groups for that course; picking one sets `edit.swaps[course]`.
  - Goal chips set `edit.goal`; "+ קורס" lists courses whose `classify` status is open this semester and not in the baseline; adding sets `edit.added`.
  - "להוריד מהמערכת" on a course another baseline course needs in parallel asks "X צריך את Y במקביל. להסיר גם את X?" (ui-dialog's confirm); yes removes both.
  - Before searching, two overlapping pinned real lessons (or a pinned real lesson over a fixed one) block the search with a message naming both and asking to mark the real one movable (`overlaps`, Task 4).
  - A baseline course that `classify` blocks shows a warning line under the week built from its requirement names (never an empty line when `reasons` is empty, `web/rules.js:183`).
  - "חפש הצעות": with something movable posts `{ kind: 'search' }`; with nothing movable and a goal posts `{ kind: 'tries' }`. An empty baseline shows "אין קורסים במערכת. חזרו לשלב 1." instead of searching.

- [ ] **Step 1: Write the failing tests:** `renderWeek` with no `ghosts`/`changed` equals the current output for a fixed context; with `ghosts` it contains "היה כאן"; the edit lesson menu HTML has the three actions and only "להוריד מהמערכת" for a course missing from the data; the overlap check names both courses; the parallel prompt text is exact; a blocked course with empty `reasons` gets a non-empty warning naming its requirement.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** these and `npm test`. Expected: PASS.
- [ ] **Step 5: Codex review, then commit** `feat(edit): step 2, choose what may move and a goal`.

### Task 12: proposals, before and after

**Files:**
- Modify: `web/ui-edit.js`, `web/style.css`
- Test: `test/ui-edit.test.mjs`

**Interfaces:**
- Consumes: Tasks 3, 5, 6, 7, 11.
- Produces, inside `#edit` (the header switcher stays hidden on this page):
  - "הצעה n מתוך N" with previous/next buttons (same keyboard shortcuts as the build switcher); proposal 0 labelled "המקורית".
  - `proposalHtml(edit, p: Proposal, data): string` (pure): `summaryLine` on top, then one card per changed, added and removed course (old day, hours and group struck through, new ones highlighted, lecturer when it changes; a full destination group, possible only when not registered, carries the build page's full-group tag and warning).
  - Proposal 0 lists every overlapping pair of its lessons as a warning (`overlaps`, Task 4).
  - The week shows the proposal with `ghosts` = the old lessons of changed courses on the shown day and `changed` = their new groups; "הראה את היום החדש" appears when a changed course's new day is not the shown day and switches to it with the existing day switch.
  - "שמור הצעה" → `saveProposal` + `saveEdit`; "העתק שינויים" → `changeText` through the existing copy helper the registration panel uses (with its text-dialog fallback); "חזרה למערכת המקורית" → `restoreOriginal` + `saveEdit`.
  - Registered: "מקומות פנויים נבדקו לפני X" from `seatsAt` next to the proposals.
  - `search` results with no proposal: the solver's `diagnosis` lines shown as text, as the build page does (never parsed for course ids).
  - Both kinds (`search` with its fallback probe, and `tries`): proposals as above; no proposal and `enabling` non-empty → "אם <name> יזוז, יש פתרון" with a button that adds it to `movable` and searches; `timedOut` → "לא הספקנו לבדוק הכל".
  - The disclaimer "הצעה בלבד. ההרשמה נעשית במכללה." under every proposal.
  - Transitions: switching proposals, days and steps uses a 200 ms opacity/translate transition; `@media (prefers-reduced-motion: reduce)` removes it.

- [ ] **Step 1: Write the failing tests:** `proposalHtml` for a one-course move has the summary line, one card with the old hours struck (`<s>`) and the new ones, and the disclaimer; a full destination (not registered) carries the full-group tag; proposal 0 with two overlapping fixed lessons lists the pair; "המקורית" for proposal 0; the "אם X יזוז" line only when `enabling` is non-empty; the timeout line only when `timedOut`; no button text contains "החל" or "הרשמה".
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: PASS.
- [ ] **Step 5: Codex review, then commit** `feat(edit): proposals before and after, save, copy, restore`.

## Stage 4: checks (branch `claude/edit-screens`)

### Task 13: browser specs for the edit page

**Files:**
- Create: `test/browser/edit.spec.mjs`
- Modify: `test/browser/helpers.mjs` only to add a seed for an edit state if needed

**Interfaces:**
- Consumes: everything above; `gradeSheetPdf(lines)` from `test/browser/helpers.mjs` to build a synthetic one-page text PDF of planner rows.

- [ ] **Step 1: Write the specs** (phone 375, phone 320, desktop):
  - load from a synthetic planner PDF, confirm the uncertain row, go to step 2;
  - load by hand;
  - mark one course movable, pick "לפנות יום ▾" Tuesday, search, see "הצעה 1 מתוך N" with its summary and change card, "הראה את היום החדש", save, restore the original;
  - "העתק שינויים" falls back to the text dialog (clipboard stubbed to reject, as the helpers do) and the text has "להוסיף:" and the disclaimer;
  - keyboard only: reach every control, Escape closes the lesson menu, focus returns;
  - reduced motion: no element has a running transition after a proposal switch;
  - axe: no violations on both steps;
  - the saved state from another academic year blocks step 2 with the reload note (Review Focus 4);
  - no horizontal scroll at 320 (`document.documentElement.scrollWidth <= 320`).
- [ ] **Step 2: Run** `npm run test:browser -- edit` (WebKit). Expected: PASS after fixes; fix code, not the specs, when a spec catches a real bug.
- [ ] **Step 3: Run** the whole browser suite (WebKit locally; CI runs all three engines) and `npm test` under Node 24. Expected: PASS.
- [ ] **Step 4: Codex review, then commit** `test(edit): the edit page in the browser`.

### Task 14: design review and the owner's phone test

**Files:**
- Modify: `web/style.css`, `web/ui-edit.js` as the review requires

- [ ] **Step 1:** Screenshots of both steps and a proposal at 375, 320 and desktop, light and dark (built-in browser, `resize_window`); WCAG contrast of every new text color (4.5:1 body, 3:1 large).
- [ ] **Step 2:** A UI/UX review of the screenshots (the `ui-ux-pro-max` skill or a Sonnet reviewer) against the spec's "Phone and motion" and the owner's standard: anyone can use it with no learning; smooth, no jumps.
- [ ] **Step 3:** Fix what the review finds; rerun Task 13's specs.
- [ ] **Step 4: Codex review, then commit** `style(edit): design review fixes`.
- [ ] **Step 5:** Hand the branch to the owner for a phone test; merge to `main` only on the owner's word.

## Execution notes

- Agents (spec, Delivery): at most two Sonnet agents at once. Stage 1 (Tasks 1-7) and stage 2 (Task 8) can run in parallel; stage 3 waits for both. Every agent writes running notes to `.superpowers/notes/edit-<stage>.md` (git-ignored) as it goes.
- After each agent: I read the full diff, run the tests, check the browser for visible changes, and run the Codex review before the commit, per [Global Constraints].
