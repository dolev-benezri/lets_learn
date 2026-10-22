# Trust checks: student input, data, solver (design)

Date: 2026-10-23. Owner's choices from a brainstorm, one question at a time, then an external review by Codex (GPT-6.1-Sol at reasoning
"none", then GPT-6-Astra at "high", read-only, same brief) checked finding by finding by Claude with its own scripts. Goal: less new
features, more trust in what exists. A student who enters a true record is warned about an impossible one, the data is checked by rules every
time it changes, the solver is checked on every real program, and the 19 bugs found by the reviews are fixed, each with a test.

## Constraints

- No change to the scraper or the CI (`scripts/scrape.mjs`, `ci/gitlab-scrape.yml`); no request to Afeka's sites. Everything reads `web/data/afeka`.
- No human sign-off in this stage: only automatic checks and structure rules. A finding the code cannot decide is a warning, not a failure.
- Every text on screen is true today and soft in tone ("שים לב ... אם ..."). New rendered text joins `test/xss.test.mjs`; UI checked at 375 px and desktop.
- `npm test` stays fast: the full run is a separate command.

## Facts found while designing

- `setStatus` (web/rules.js) and "עברתי את כל השנה" (`yearPassed`, web/ui-actions.js) mark a course passed with no prerequisite check:
  חדו"א 1 failed + חדו"א 2 passed is accepted silently.
- All 144 data files: 16,086 courses, 15,681 prerequisite links, 2,268 corequisite links. 0 links to a missing course, 0 self links, 0 cycles,
  0 prerequisites in a later year's list than their course.
- 2,853 requirements list the same course id twice among their alternatives (e.g. 2027-1/10-2024.json course 10010 repeats 10016).
- 3,624 requirements (96 files) mix an in-program alternative with an outside-program one (`id: null`), e.g. 6001: 6000 or
  "אנגלית - מכינה בדרך לאפקה". Course 6001 has two such requirements whose outside names differ by one character.
- 57 of the 415 course ids have different prerequisites in different programs of the same semester (e.g. 10117: 10128 in 16 files, 10016 in 4).
- No exam in any of the 144 files: exam logic can only be tested on synthetic data.
- Real-data solver tests today: program 30-2026 only (test/solver.test.mjs). `test/solver-props.test.mjs` checks `searchYear` invariants on 300
  random fixtures.
- The tests of the grade-sheet import use synthetic rows only (test/grade-import.test.mjs: "never a real sheet"): how the real sheet shows a
  repeated failure is unknown.

## Review findings (all reproduced)

Who found it: S = Codex Sol, A = Codex Astra, C = Claude. Severity after both reviewers and Claude agreed.

| # | Finding | Where | Sev. | By |
|---|---|---|---|---|
| J1 | A course marked failed skips its prerequisites and is planned as a retake (failing 10336 MATLAB in 30-2026 plans it without linear algebra 90905) | rules.js:133 | high | S A C |
| J2 | Grade import keeps one row per course: failed attempts are lost, a failure followed by a pass becomes only a pass | grade-import.js:85, ui-me.js:347 | high | S A |
| J3 | A requirement with an outside-program alternative has no way to be met by that alternative: the course stays blocked | rules.js:111 | high | C (S agreed) |
| J4 | The degree checklist marks a specialization done with all its mandatory courses missing (30-2026, solid+flow: "התמחות 27/27") | map-layout.js:290 | medium | A |
| J5 | Year view, "most credits": a 13-credit plan ranks above a 15-credit one (A and B scores are normalized separately) | solver-core.js:425, :845 | medium | A |
| J6 | With summer planning on, the courses of the year plan count as completed credits in the degree checklist | app.js:451, map-layout.js:285 | medium | A |
| J7 | Editing a grade leaves the regulation warnings stale (average 60 shows no 11.4.2 warning until another action) | ui-actions.js:470 | medium | S A |
| J8 | A blocked course with alternative prerequisites names only the first one ("דורש מבוא לראייה ממוחשבת" for 10224 or 10240) | rules.js:147 | medium | A |
| J9 | New academic year: a local save keeps the old study year and stale pins/yearIds; a backup link advances it | app.js:127, :216 | medium | A |
| J10 | A backup link drops valid fields: sortBy, yearIds, specDraft, retakeSeen, programSet | share.js:124 | low | S A |
| J11 | The advisor summary omits a mandatory course the year solver reports as missing (`res.missing`) | advisor.js:75 | medium | A |
| J12 | Importing a graded pass keeps an old exemption on the course | grade-import.js:75 | medium | S |
| J13 | "לא נלקח" keeps the course's grade; it comes back when the course is marked passed again | rules.js:247 | low | S A |
| J14 | Duplicate passed ids from a hand-edited link are counted twice in the average (the UI cannot create them) | app.js:143, rules.js:290 | low | S |

| J15 | Registration backups ignore `altGroups`' `ok` and follow direct links only: a lecture whose lab (lecture→tutorial→lab) is full is offered | ui-grid.js:156 | medium | A2 |
| J16 | Switching program A→B and back to A before B loads ends on B (the early return skips `++switchGen`) | app.js:519 | medium | A2 |
| J17 | ICS export writes floating times (no TZID): a calendar in another time zone shifts every lesson and exam | ics.js:80 | medium | A2 |
| J18 | check-export rejects an exam with no time (`parseExams` gives `time: null` on purpose) | scripts/check-export.mjs:59 | low | A2 |
| J19 | scripts/readme-shots.mjs never passes the terms gate (no `afeka-sched-v1-terms` flag), so it waits forever | scripts/readme-shots.mjs:149 | low | A2 |

A2 = a second Astra review the owner ran in another conversation (pasted 2026-10-23); its other findings duplicate J2, J5, J6, J7, J10. J15-J19
were checked by Claude against the code (reading; J18 against `parseExams` in scripts/parse.mjs:119).

Confirmed by Astra with a fixture (plan step): when no year plan exists because semester ב fails and semester א is empty, `searchYear`
returns semester א's generic diagnosis instead of ב's reason.

Outside this change (the scraping pipeline, owner's constraint): A2 also found that a partial scrape marks files it did not check as fresh
(scripts/scrape.mjs:151, web/ui-text.js:208 `freshAt`), and that scripts/build.mjs:37 drops a tutorial with no parsable meeting together
with its link, so the lecture looks complete without it. Both need the owner's OK to touch the pipeline; they go to the final report.

## Fixes

- **J1, J3 + layer 1** below.
- **J2:** do not assume the real sheet lists every attempt. Minimal fix: a course with both a failed and a passed row in the sheet is imported
  as passed with "נכשלתי בעבר" ticked (failed count at least 1, never lowered by an import; a repeat import changes nothing). Counting attempts
  waits for a real sheet: the owner saves one under `docs/meeting/` (git-excluded) and its format is checked there.
- **J4:** `progressInfo` tracks each chosen specialization's mandatory courses apart from the elective credit pool; the row is done only when
  both are met, and names what is missing.
- **J5:** year ranking by credits uses the year's total (one denominator for A+B, or compare totals first).
- **J6:** two classifications: the real record (degree checklist, warnings, #me) and the assumed one (summer eligibility only).
- **J7:** the grade handler recomputes classification and redraws the warnings, without a new search.
- **J8:** `blockedBy` keeps whole requirement groups; the reason reads "דורש A או B" and callers (`waitingOnEarlier` and others) take groups.
- **J9:** one year-migration step inside `normalize`, used by local load, stashes and backup links alike.
- **J10:** one persisted-state schema shared by `normalize` and `readHash`; round-trip test for every field.
- **J11:** the advisor summary lists `res.missing` apart from the earlier-years list.
- **J12:** `gradeChanges` also compares exemption state both ways; a graded pass offers removing the exemption.
- **J13:** leaving "passed" for "none" deletes the grade.
- **J14:** `normalize` drops duplicate ids in `passed`; `gradeAverage` iterates a set.
- **J15:** backups come from `buildOptions(c, { pins: [g.id] })` (whole chains), skip `ok: false`, and check every group of the option
  against the rest of the plan.
- **J16:** `switchTo` increments `switchGen` before the early return, so a return to the current program cancels a pending switch.
- **J17:** `TZID=Asia/Jerusalem` on DTSTART/DTEND/EXDATE with a VTIMEZONE block; UNTIL in UTC as RFC 5545 requires with TZID.
- **J18:** `exam.time` may be `null`; a string must be `HH:mm`.
- **J19:** the shots' `DONE` flags include the terms acceptance (`afeka-sched-v1-terms` = `TERMS_VERSION`).

## Layer 1: the student's record (site)

**Outside-program alternatives (J3).** On a blocked course, each unmet requirement that has an outside alternative shows a checkbox
"עשיתי את <name of the alternative>". Ticking it stores the name in `state.outsideDone` (array of strings, normalized like `passed`, kept in
backup links, part of the per-program record like `passed`: stashed on a program switch, not carried over). A requirement is met
when any alternative is met: an in-program course passed or exempt, or an outside alternative whose name is in `outsideDone`. `classify`, the
warnings and the solver all use this one test. Requirements whose alternatives are all outside stay assumed met, as today. Where one course has
two requirements with near-identical outside names (6001), each requirement shows its own checkbox: the tool does not guess that two names are
the same course.

**Inconsistent record warning (J1).** A soft warning under the course, no block, nothing changed automatically (a faculty exception, a course
recognized from another institution or an earlier program are legitimate). New `recordWarnings(data, state)` in web/rules.js: `{ id: [text] }`
for every course marked passed (not exempt: neither in `state.exempt` nor exempt by the English score) or failed:
- prerequisite not met, and failed: `שים לב: <names> הוא קדם, וסומן שנכשלת בו. אם קיבלת אישור חריג, אפשר להשאיר.`
- prerequisite not met, not failed: `שים לב: <names> הוא קדם, ולא סומן שעברת אותו. אם קיבלת אישור חריג, אפשר להשאיר.`
- corequisite only when neither passed nor failed (taken together and failed is legitimate):
  `שים לב: <names> הוא קורס מקביל, ולא סומן שלקחת אותו. אם קיבלת אישור חריג, אפשר להשאיר.`
- `<names>`: the requirement's alternatives joined by "או".
- A failed course with an unmet prerequisite stays a retake in the plan (the student may have an exception), with the warning in its reasons.

`web/ui-me.js` `chip()` renders them under the row (`<p class="hint warn">`). Computed from state on every render: the year button, the grade
import and backup links are covered with no extra code.

## Layer 2: data rules (`npm run check:real`, data part)

New `scripts/check-real.mjs`, read-only over all of `web/data/afeka`. Exit code 1 on any error; warnings printed, never failing.

Errors (structure that must hold):
- a prerequisite or corequisite id with no course in the same file; a course requiring itself;
- a list course id missing from `courses`; credits not a number; an offered course without groups (reused from scripts/audit.mjs);
- alternative-aware: a course none of whose requirement alternatives can ever be met: every route goes through a cycle or through a later
  year only. A cycle or a later-year alternative that another alternative avoids is fine.

Warnings (cannot be decided by code):
- the same id twice in one requirement's alternatives (2,853 today);
- prerequisites that differ between programs in the same semester (one line per course: which variant, how many files);
- prerequisites that changed since the last committed data (`git show HEAD:<file>`): added / removed requirement per course.

## Layer 3: solver and state on real data (`npm run check:real`, solver part)

For every data file of semesters א and ב (and summer when present) and a fixed set of student scenarios:
- S1: nothing passed. S2: all mandatory courses of the years before the study year passed. S3: S2 plus one failure in a mandatory course of the
  study year, three courses per program chosen by a fixed seed (printed with any failure).

Independent oracle: a small requirement checker in the check script itself (passed, exempt, outsideDone, semester placement), not `classify`,
so a mistake shared by `classify` and the solver is caught.

`classify` checks, every scenario: statuses agree with the oracle (done > exempt > notOffered > retake > blocked/conditional/available,
in that precedence); adding a passed course never turns an available, conditional or retake course into blocked.

Solver checks, every scenario with a plan:
- invariants: no two chosen meetings overlap; every chosen course's requirements are met by the oracle (record, or semester א of the same year
  plan for ב); every unmet corequisite is in the same semester's plan; no meeting in a busy time; credits are the sum of the chosen courses.
- metamorphic: busy time over a meeting of the best plan gives a plan that avoids it, or no plan; shuffled course and group order give the same
  set of plans for the single-semester search (the year search is not exhaustive even when not cut off: A top 50, B top 5, so only feasibility
  is checked there); relaxing a constraint never removes the last plan (feasibility, not score: relaxing changes the scoring inputs).
- ranking: "most credits" orders year plans by the year's total credits (J5); the same for the other sort keys once defined per year.
- no plan: the diagnosis names constraints that, relaxed together, give a plan; or says it could not tell. A failure in semester ב alone is
  reported as such (the unverified claim above).

State checks: backup link round trip for every persisted field (J10), year migration local = stash = link (J9), summer on/off leaves the
degree checklist's completed credits unchanged (J6), grade edit refreshes warnings through the real handler (J7), grade-sheet import of a
failed+passed course (J2, J12), advisor summary lists `res.missing` (J11).

Small cases: the `solver-props` generator at its smallest sizes, best score compared with brute force over every combination. Exams: synthetic
only (no real exam data).

## Running

- `npm run check:real`: everything above, all programs. Run before every merge that touches web/solver-core.js, web/rules.js, web/app.js,
  web/share.js, web/grade-import.js or web/map-layout.js, and after every data update. Prints time per part; target under 10 minutes.
- `npm test`: a sample in `test/check-real.test.mjs`: programs 19-2026 (data science, smallest), 20-2026 (electrical, most corequisites),
  30-2026 (mechanical, largest), semester א, scenario S1, data rules + invariants. Target under 20 seconds. Each J fix brings its own unit test.
- A failure prints the file, scenario, seed and course ids, enough to rerun one case.

## Order

1. Fixes by severity: J1+J3+layer 1, J2, then J4-J12, then J13-J14. Each fix starts with its own test, run red before the fix.
2. Layer 2 and 3 checks after the fixes, so `npm test` stays green at every commit; whatever they find beyond J1-J19 becomes its own task.
3. Full `npm run check:real`, `npm test`, browser tests, phone and desktop pass on #me, then merge after the owner's OK.

## Not in this change

- Human sign-off of prerequisites by the departments (owner: not at this stage). The cross-program warnings are ready for it later.
- Counting failed attempts from the grade sheet (waits for a real sheet).
- Mutation testing of the tests themselves.
