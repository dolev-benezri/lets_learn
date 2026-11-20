# Edit an existing schedule: a separate page to move, add or remove courses

Date: 2026-11-09. Status: design approved by the owner section by section (brainstorm, same day); revised the same day over three Codex reviews of every code claim (all findings taken; see "Changes after the Codex review"). Waiting for the owner's review of this document.

## Goal

Today the site builds a semester schedule from nothing (steps 1-4). Students who already have a working schedule want to change only part of it: "my schedule works, I only want to move one course to free a day or finish earlier". The new page loads the schedule they have, keeps what they did not ask to change, and proposes small changes that reach their goal.

Success: a student with a schedule on their phone gets a useful proposal in under two minutes, sees exactly what moved and what it gained, and never loses the original.

## Decisions taken with the owner

| Question | Answer |
|---|---|
| Where does the existing schedule come from | The portal's own Excel export (the yedion, "אפקה-נט", `.xlsx`: read as printed, so a known course code is exact; `web/yedion-xlsx.js`, added 2026-11-09 once a sample existed), a file from the Afeka planner (the same PDF/screenshot format friends send), and picking by hand. |
| Before or after registration | Both. The student says at the start whether the schedule is already registered, and the full-group rule follows (see Search). |
| What a student can do in version 1 | Move a course, add or remove a course, one-tap goals, and Codex's extras: say which course stands in the way, copy only the changed group numbers, restore the original in one tap. |
| Where the mode switch lives | A choice on first entry, a small mode label at the top of the edit page, and the lasting switch in a side menu (☰). |
| Same page or separate | A separate page with its own address and steps. Only "המצב שלי" (track, year, passed courses) is shared with the build page; everything else is separate. |
| A group from the file that is no longer in the data | Kept as it is, with the file's hours, as a fixed part of the schedule. No red mark: the student is registered to it. |
| Approach | A: edit = build around a fixed baseline, reusing pins, the friend-import readers and the solver. |

## Scope

In version 1:
- The edit page (`#edit`), its two steps, the side menu, the first-entry choice and the mode label.
- Loading the baseline from a planner file or by hand, with a review of every row the reader was not sure of.
- Marking courses "יכול לזוז", moving a course to another group, adding or removing a course.
- Goals: free a day, fewer gaps, finish by an hour.
- Proposals with the fewest changes among those found, a before/after view, save, copy the changes, restore the original.
- One semester at a time (א, ב, or קיץ when the student plans a summer).
- Smooth transitions: switching proposals, switching days, highlighting what changed.

Out of version 1, with the reason:
- Two semesters at once: registration changes happen per semester.
- A change budget inside the solver (approach B): needs changes deep in `search` and its pruning.
- The lesson gliding to its new place: phones show one day at a time (`web/style.css:1256`), so a move to another day is out of sight, and the grid is re-rendered as HTML (`web/ui-view.js:425`), not moved element by element. Version 1 marks the old place and offers "הראה את היום החדש"; the glide is version 2.
- Trying pairs of courses automatically: single courses only in version 1 (see Search).
- Dragging lessons on the grid, seat monitoring, version history.
- Friends on the edit page: the build page keeps them.

## The page

### Address, entry and routing
- The edit page lives at `#edit` (step 1) and `#edit/changes` (step 2). Today any unknown hash is the plans view (`web/app.js:566` `routeOf`); the router gets an edit branch that is checked first: `onHash` (`web/ui-plan.js:59`) dispatches an `#edit` hash to the edit renderer and returns before the build page renders or searches (`renderAll`, `web/ui-plan.js:89`, which can write `yearIds`). `renderAll` is also registered as a renderer (`web/ui-plan.js:217`) and run by every `refresh` (`web/app.js:560`), so it gets the same guard: on the edit page it returns at once. Entering the edit page terminates any running build search worker (`ui.worker`). The build page's code paths are not entered on the edit page.
- `#f=` friend links and `#b=` backup links keep going to the build page exactly as today (`web/ui-plan.js:70`).
- First visit order: the terms gate, then the mode choice, then the identity questions (track and year) on the chosen page. The build page keeps its own gate (`gated`, `web/ui-common.js:137`); the edit page asks for track and year in its step 1.
- The mode choice: two cards, "לבנות מערכת חדשה" (four steps) and "לשפר מערכת שכבר יש לי" (load a file, move a course). The choice is remembered in its own key; an explicit link (`#edit`, `#me`, a friend or backup link) always wins over the remembered choice. Back and reload keep the current page.
- The side menu: a ☰ button in the header opens the existing drawer pattern (`<dialog id="drawer">`, `web/ui-drawer.js:312` `openPanel`), which is docked on desktop and a bottom sheet on small phones (`web/style.css:2046`); version 1 keeps that behavior. It holds the two modes. The tour and theme buttons stay where they are (browser tests rely on them).
- On the edit page, a small label at the top: "עורכים מערכת קיימת · החלפה". Tapping it opens the side menu.

### Step 1: המערכת שלי
- Two ways in: "קובץ מהמתכנן (PDF או צילום)" and "לבחור קורסים וקבוצות ידנית". Both open the friend editor (`openFriendEditor`, `web/ui-friend-editor.js:38`) in an edit variant: no friend name, the semesters א, ב and קיץ, and an edit callback. The friend flow stays as it is.
- The import result becomes reviewable rows. Today `applyFound` (`web/ui-friend-editor.js:337`) only shows counts, `matchRows` takes the first of tied candidates (`web/friend-schedule.js:232`) and returns unknown codes without their hours (`web/friend-schedule.js:244`), and `mergeScans` drops where a row came from (`web/friend-schedule.js:265`). The edit variant needs, per row: the source text, the course code and type, day and hours, the candidate groups, the chosen one, a confidence, and whether the student confirmed it. Confidence is one of: sure (the course identified by its exact code, one candidate group, same day and exact hours), weak (one candidate but anything short of "sure": the course identified by name rather than exact code, a weak name similarity counted at `web/friend-schedule.js:238`, or hours only close, accepted at `:193`), tie (several candidates), none (no group in the data). Only "sure" needs no confirmation. The readers return this richer row alongside today's result, so the friend editor is unchanged.
- Every row that is not sure is listed as "לבדיקה"; "הבא" waits until each is confirmed or fixed.
- A row with no group in the data is kept with the file's day and hours, shown like any other lesson, fixed, with no red mark.
- A checkbox "המערכת כבר רשומה במכללה". When ticked, the loaded groups are the registered set (see Data).
- Track and year: asked in one line when unknown, saved in the shared "המצב שלי".
- Semester: from the file when it says, otherwise asked; קיץ is offered when the profile plans a summer.
- Button: "הבא: שינויים". The draft is saved on every change.

### Step 2: שינויים
- The week shows the baseline. Each lesson says "נשאר במקום" or "יכול לזוז".
- Tapping a lesson opens its popover: "יכול לזוז" (toggle), "קבוצות אחרות", "להוריד מהמערכת".
- "קבוצות אחרות" does not use `altGroups` (`web/ui-grid.js:131`: same-type groups with approximate clash flags, and its check pins the candidate, which lets full groups through). It runs the same search as proposals with only this course movable and lists the complete options found (lecture, tutorial and lab together), already checked against the other lessons, the fixed rows, the full rule and exams. Picking one is a swap, stored in the edit state.
- Above the week: goal chips "לפנות יום ▾", "פחות חלונות", "לסיים עד ▾", and "+ קורס" (the courses open to the student this semester).
- Button: "חפש הצעות".
- Removing the lesson that had focus moves focus to the week's heading.

### Proposals
- "הצעה n מתוך N" with the existing previous/next controls. Proposal 0 is the current baseline, as a reference.
- A summary line on top of each proposal: what it gains and what it costs, e.g. "יום ג׳ התפנה · קורס אחד זז · אותו מרצה".
- Under it, one card per changed course: the old day, hours and group struck through, the new ones highlighted, and the lecturer when it changes. Added and removed courses get their own cards.
- In the week: a dashed outline "היה כאן" where a moved lesson was on the shown day, the new lesson highlighted, and a "הראה את היום החדש" button when it moved to another day (the existing day switch, with its transition).
- Actions: "שמור הצעה" (it becomes the new baseline), "העתק שינויים", "חזרה למערכת המקורית".
- Every proposal and the copied text say it is a proposal only and registration happens with the college. Never "apply" or "register".

### Phone and motion
- Measured at 375 and 320 px wide and on desktop, light and dark: no horizontal scroll, every action reachable by thumb, no two grids side by side.
- Switching proposals, days and steps animates (short slide or fade, about 200 ms); `prefers-reduced-motion` turns movement off and keeps the highlight.
- Keyboard: every control reachable, the popover closes with Escape, focus returns to the lesson (or the week's heading when the lesson is gone).

## Data

- The edit page saves under its own localStorage key, `afeka-sched-v1-edit`, separate from the build page's save. The build page's loading ignores it, and the existing "erase everything" already removes it by its prefix (`web/app.js:256`, `web/app.js:299`).
- Shape:
  `{ v: 1, dataset: { year, sem, program, startYear }, registered: bool, owned: [group ids], original: [lesson], baseline: [lesson], movable: [course ids], swaps: { course id: [group ids] }, added: [course ids], removed: [course ids], goal: { dayOff, notAfter, fewerGaps }, draft: null | { rows, choices, registered, sem } }`
  where a lesson is `{ course, name, type, group | null, day, start, end }`: a snapshot of what was loaded, so the schedule can be drawn and restored even when the data changes.
- `draft`: the rows read from a file or picked by hand in step 1, with the student's choices, until "הבא" turns them into `original` and `baseline`. It is saved so a reload keeps the review, and it is left out of a backup link (rows of text read from a file would make the link long for nothing).
- Saving and tabs (added 2026-11-20): `saveEdit` reports whether it wrote. The edit key has its own failure flag, so a good save of the build page's key does not hide a failed edit save; while either fails the page shows the same notice as the build page ("השינויים לא נשמרים…", with the backup-link button) on `#edit` too, and "כל שינוי נשמר מיד" is hidden. Another tab's write to the key (the build key or this one) turns on the "טען מחדש" notice and the older tab stops saving. A backup link carries the edit state (`edit`, without `draft`) and a restore reads it; an older link without it leaves the saved edit state as it is. A link that would be too long for a restore to read (over the reader's length or decoded-size limit; far from a real schedule) is copied without the edit part, and the copy says so. A proposal result is stamped with the student's record, the data file and the restore count; a changed stamp drops it, on entering the page and before "שמור הצעה", and asks for a new search.
- `original`: the schedule as loaded, never changed until a new schedule is loaded. "חזרה למערכת המקורית" copies it into `baseline` and clears `movable`, `swaps`, `added` and `removed`.
- `baseline`: the current schedule. "שמור הצעה" writes the proposal into it and clears `movable`, `swaps`, `added` and `removed`.
- `owned`: the group ids confirmed as registered in step 1. Only these may stay while full. A saved proposal is not registered, so its new groups never join `owned`.
- `dataset`: which data file the ids belong to. When the shown data is a different one (a new academic year, another program or cohort in "המצב שלי"), step 1 says so: the saved schedule can still be viewed and restored from its snapshots, but step 2 waits for the schedule to be loaded again against the current data. Version 1 does not reconcile two datasets.
- It is read through its own normalize, like `app.js` `normalize`: unknown or bad fields are dropped, never trusted.
- The shared part is read from the existing save, not copied: program, start year, year, passed, failed, grades, exempt, `outsideDone` (it counts for prerequisites, `web/rules.js:110`) and the profile.
- The build page's pins, friends, preferences and plans are never written by the edit page.

## Search (approach A)

An adapter turns the edit state into `search` calls (`web/solver-core.js:413`):
- Each baseline course is either real or fixed, never both. Real: every one of its lessons has its group in the data. Fixed: any lesson without a group in the data, or a course missing from the data altogether. A fixed course's real id is not passed to `search` at all (an id missing from the data would crash at `web/solver-core.js:438`, and a known lecture with a missing tutorial could pick up a second tutorial through linked-group expansion, `:129`).
- All fixed lessons together enter as ONE synthetic course with one option whose meetings are their hours, added to a copy of the data, `must` and pinned, with a `fixed:` id prefix. Unlike busy blocks (which never enter the schedule mask, `web/solver-core.js:306`), they count for free days and gaps, take part in clash checks, and render as lessons; and as one option they are never checked against each other, so an overlap the student already has among them does not stop the search. The parallel-requirement check looks for real ids among the chosen courses (`web/solver-core.js:553`), so the adapter also passes the fixed courses' real ids as present (a `present: [course ids]` input that check counts as chosen); a fixed course still satisfies another course's parallel requirement.
- A fixed course whose course exists in the data may still be marked "יכול לזוז": it then leaves the synthetic course and enters as a real, unpinned course with all its options (its old lessons are dropped from the proposal). A course missing from the data cannot move.
- Courses: the real baseline courses, plus `added`, minus `removed`, all `must`. `removed` applies to fixed courses too: a removed fixed course leaves the synthetic option and `present`.
- Pins: every group of every real baseline course not in `movable`, and the groups chosen in `swaps`.
- Goals map to existing settings: free a day: `dayOff: [d]`, `dayOffHard: true`; finish by: `notAfter`, `windowHard: true`; fewer gaps: a high `compact` weight plus a rule that a proposal must have fewer gap minutes than the baseline.
- A proposal must reach the goal: a free-day or finish-by goal is hard; a fewer-gaps proposal must improve on the baseline. A result identical to the baseline is dropped (it is proposal 0 already).
- Registered: `includeFull: false` for every destination. One small solver option, `allowFull: [group ids]`, REPLACES the pin exemption when it is given: today a pinned full group passes whatever `includeFull` says (`web/solver-core.js:154`), and swaps and saved baselines are pinned, so with `allowFull` set a full group passes only if it is in that list, pinned or not. Only `owned` ids go in it. It applies both where options are built and where diagnoses rebuild them (`web/solver-core.js:101`, `web/solver-core.js:648`), with option de-duplication kept. Without `allowFull` (the build page) nothing changes.
- Not registered: full groups show with their warning, as today.
- Lecture and tutorial move together as today. Split (a lecture with a tutorial the college does not link) is the build page's own option, `state.constraints.split`, with its own confirmation and warning (built 2026-11-20): step 2 shows the same checkbox (handled by `CHG.split`), and the search follows it (`editQuery`; `searchAll`, so proposals that split come after the regular ones). A proposal or a swap option that splits a course carries the build page's note, line and tag (`SPLIT_NOTE`, `splitLine`, `SPLIT_TAG`), and the copied changes name the course for the advisor. A split the student already has and keeps is not flagged. A swap picked while the option was on that only it allows is taken back, with a message, once the option is off (`splitOnlySwaps`), so a search is never asked for groups it cannot build. Changing the option changes the record, so the shown proposals are dropped (the stamp, "Saving and tabs").
- Ranking: proposals are sorted by the number of courses whose groups differ from the baseline, then by the solver's score. The search keeps its top results by score and prunes by score (`web/solver-core.js:556`, `:581`, `:592`), so this is the fewest changes among the proposals found, not a proven minimum; the page never claims more. When the student marked one course movable, every proposal changes at most that course.
- A goal with nothing marked movable: the adapter tries each baseline course as the only movable one, one short search each with an overall time cap, and shows the proposals with one change. If none reaches the goal, it says so and asks the student to mark what may move. Pairs are version 2.
- No proposal: the same single-course tries name the courses that would make it possible ("אם תורת החומרים יזוז, יש פתרון", with a button "תן לה לזוז"). The page offers that only when such a try found a result; a timeout is reported as "לא הספקנו לבדוק הכל", not as "אין פתרון". The solver's text diagnosis (`web/solver-core.js:363`, `:626`, `:687`) is shown as today, without parsing course ids out of it.

## Exceptions already in the baseline

- Overlapping lessons in the baseline: proposal 0 shows them with a warning. Overlaps among fixed lessons never stop the search (they are one option, see Search). The search does not allow other overlaps (`web/solver-core.js:595`): when a pinned real course overlaps another lesson, the page names both and asks the student to mark the real one movable before searching.
- A baseline course whose parallel requirement is already unmet in `original`: the student is registered to it, so it is accepted. The adapter passes such requirements as met through a minimal `acceptParallel` option beside `allowFull`, keyed per requirement, not per course: `"<course id>#<n>"`, n the requirement's index in the course's `prereqs`. It lists only requirements unmet in `original`, so a course with two parallel requirements keeps the second one checked when the edit breaks it.
- Removing a course that another baseline course needs in parallel: the search would reject every proposal (`web/solver-core.js:552-553`), so the page asks at the moment of removal: "X צריך את Y במקביל. להסיר גם את X?" Yes removes both; no keeps Y.
- A course `classify` blocks (`web/rules.js:183`; `blockedBy` can come with empty `reasons`): a warning built from the requirement's names, never an empty line; the course stays in the baseline.

## Copying the changes

A pure formatter, `changeText(from, to, data)`, given the edit data (not the build page's global data or constraints, which `registrationText` uses, `web/ui-drawer.js:179`):
- "להוסיף:" each course with its new group numbers (all linked groups: lecture, tutorial, lab).
- "להסיר:" each course with the group numbers it leaves, including removed courses.
- `from` is the registered set (`owned` plus fixed rows) when the schedule is registered, otherwise the current baseline.
- A last line: proposal only, registration happens with the college.

## Edge cases

- A group in the file that is not in the data: kept, fixed, no red mark (owner's decision).
- Registered: next to proposals, "מקומות פנויים נבדקו לפני X" from `seatsAt` (`web/app.js:412`), because seats change during the day.
- Leaving the page mid-edit: the state is saved on every change; nothing is lost.
- The data changed since the schedule was loaded: see `dataset` in Data.

## Tests

Unit (node `--test`):
- Edit state normalize: bad fields dropped, `original` kept, `owned` never grows from a saved proposal, the shared profile not copied.
- The adapter: pins for real non-movable courses only, movable courses unpinned, swaps pinned; a course with a missing group sent only as part of the one synthetic fixed option (never also by its real id); that option counts for a free day and does not stop the search when its lessons overlap; a fixed course marked movable enters as a real course; added and removed courses; goals mapped.
- `allowFull`: with it, a pinned full group outside the list is refused; without it, today's behavior. `acceptParallel` covers a single requirement unmet in `original` only, by its `#n` key; a fixed course counts as present for another course's parallel requirement.
- A proposal must reach its goal; a result equal to the baseline is dropped; ranking by changes then score.
- Registered: no full destination; an `owned` full group allowed; a saved proposal's full group not allowed.
- The single-course tries under their time cap; "יש פתרון אם X יזוז" only from a try that found one; a timeout reported as a timeout.
- The import rows: a tie and an unknown code come back as rows to review with their hours; the friend editor's result is unchanged.
- `changeText`: added, removed and linked groups, against the registered set or the baseline.

Browser (Playwright; CI runs WebKit, Chromium and Firefox, `.github/workflows/browser.yml:24`):
- Phone 375, 320 and desktop: first-entry choice, side menu switch, mode label, an explicit link over the remembered mode, Back and reload on both edit steps.
- Load from a synthetic planner PDF (never a real student's file) and by hand; an uncertain row must be confirmed.
- Move a course, see a proposal with its summary and change card, "הראה את היום החדש", save, restore the original.
- Keyboard path, Escape, focus return; reduced motion; axe accessibility.
- The build page is untouched: its existing specs pass unchanged, and a friend or backup link still opens the build page.

Design review: screenshots at 375, 320 and desktop in light and dark, WCAG contrast check, a separate UI/UX review, then the owner's phone test.

## Delivery

Four stages, one branch each. Codex reviews every commit before it is made. Nothing reaches `main` without the owner's word.

1. Edit state, the adapter (with the solver inputs `allowFull`, `present` and `acceptParallel`, the synthetic fixed option, goals, ranking, the single-course tries) and `changeText`. No screen; unit tests. Me or one Sonnet agent.
2. The page shell: the router branch, side menu, first-entry choice, mode label. One Sonnet agent, in parallel with stage 1.
3. The edit screens: the import rows and step 1, step 2, proposals and before/after, transitions. One Sonnet agent, after stages 1 and 2.
4. Browser tests, design review, fixes. Me and Codex; then the owner's phone test.

Agents: three Sonnet agents over the whole job, at most two at once (the owner's session budget). Each writes running notes to a file so nothing is lost if it stops. Codex (outside Claude's budget) reviews each commit and was the second voice in the brainstorm. I check every agent's diff, run the tests and look in the browser before anything is merged.

## Changes after the Codex review

Codex checked every code claim against the repo (2026-11-09). What changed:
1. Routing: an explicit edit branch in the router before the build page renders; link precedence; tour and theme buttons stay put.
2. Import: reviewable rows with source, hours, candidates and confidence, in an edit variant of the friend editor; the friend flow unchanged.
3. Data: lesson snapshots, the dataset identity, `owned` separate from saved proposals, `outsideDone` in the shared record.
4. Direct swap: from the search, not `altGroups`, so full groups and linked groups are handled.
5. Ranking: "fewest changes among those found", goal must be reached, baseline duplicates dropped.
6. Fixed rows: one-option courses instead of busy blocks, so they count for goals and render as lessons.
7. "What stands in the way": from single-course tries, not from parsing the diagnosis; pairs moved to version 2.
8. Baseline exceptions: overlaps, parallel requirements and blocked courses defined.
9. Copying: a pure `changeText` with additions and removals.
10. Motion: the glide moved to version 2; version 1 marks the old place and offers "הראה את היום החדש"; the drawer keeps its desktop and phone layouts.

Second round, same day: the `renderAll`/`refresh` guard and worker stop; "weak" import matches need confirmation; `allowFull` replaces the pin exemption instead of adding to it; a course is real or fixed, never both, and all fixed lessons form one synthetic option; removing a parallel partner asks first, and `acceptParallel` covers only what `original` already had; a different dataset needs the schedule loaded again (no reconciliation in version 1).

Third round, same day: "sure" needs the exact code, one group, the same day and exact hours ("weak" also covers a weak name match); fixed courses count as present for parallel requirements (`present`); `acceptParallel` is keyed per requirement (`<course>#<n>`), not per course.

## Open after version 1

- (Done after this design: the portal's Excel file is read, see "Where does the existing schedule come from".)
- The lesson glide.
- Pairs in the automatic tries.
- Approach B (a change budget inside the solver) if students ask for "change at most two courses".
- Friends on the edit page.
