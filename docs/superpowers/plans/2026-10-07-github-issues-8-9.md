# Plan: open GitHub issues #8 and #9 (2026-10-07)

Open issues on GitHub: only #8 and #9. Both come from the solver audit (`docs/superpowers/plans/2026-10-06-solver-audit-fixes.md`, stages 7 and 8).
Rules as always: a branch per item, focused tests then `npm test`, `git pull --rebase` before push, no requests to the Afeka site.

## #8: regulation warnings count failures, not failed courses (F-19)

**Done 2026-10-07.** The owner asked to settle D2 from the regulations. The official PDF (doc 08-00-2-001, 5/2/2026) says:
- 11.4.1: a failing grade in three courses cumulatively.
- 11.4.2: a cumulative average below 65.
- 11.4.4: under 70% of the cumulative program by the end of semester ב' of years א'-ג'.
- 11.5.1: a failing grade in four or more courses.

The reading below is confirmed, and 11.4.4 applies at the end of each of years א'-ג' (study years 2-4 in the app).

One addition found on real data: program 20, cohort 2024 lists three year א' courses without credits, so even a full year א' reads 69%. 11.4.4 is skipped when a list's courses carry fewer known credits than its minimum (`progress().short`); 199 fresh-student cases over all files give no warning.

Code: `web/rules.js` (`classify`, `progress`).

What D2 approves:
1. **11.4.1 / 11.5.1:** count failed *courses*, `Object.keys(failed).length`, not the sum of attempts. `{a:2, b:1}` gives no warning, `{a:2, b:2}` gives no expulsion. A course stays counted after it is passed (current `setStatus` behaviour, matches "במצטבר").
2. **11.5.2:** unchanged, three failures in the same course.
3. **11.4.2, average below 65:** from `gradeAverage` (`web/rules.js:169-177`), only when at least one grade is entered. Known limit: failing grades are not stored, so the average is over passed courses only and can only be too high; the warning may be missed, never shown wrongly.
4. **11.4.4, under 70% of the program of the years behind:** from `progress`, in study years 2-4 (after years א'-ג'), when `required > 0` and the data is not `short`.
5. Order stays: expulsion outranks probation; one probation line even if several causes apply.

Steps (branch `fix/rules-f19`, size S):
- [x] Change the counting in `classify` and add the two warnings (about 6 lines).
- [x] Tests in `test/rules.test.mjs`: `{a:2,b:1}` none; `{a:1,b:1,c:1}` probation; `{a:1,b:1,c:1,d:1}` expulsion; `{a:3}` expulsion 11.5.2; average 60 with grades gives 11.4.2; no grades gives nothing; year ב' with 50% of year א' gives 11.4.4; year א' gives nothing; a course without credits gives nothing.
- [x] `node solver-audit/repro/rules-regulations.mjs`: `rules-1`, `rules-2` read NOT-REPRODUCED.
- [x] Mark F-19 closed in `solver-audit/findings.md` and the audit plan; close #8 with the commit.

## #9: open checks (stage 8)

Already done (comment on #9): summer matches the reference, a summer pass counts (test), the 1.5x time slack is kept as designed.

| Item | Who | When | Done when |
|---|---|---|---|
| A. First nightly after the prerequisite rebuild (d09dcdf) | me | after the next `data(afeka)` commit (tonight ~02:00) | no `prereqs` change in its diff, or each change explained |
| B. Exams | me | when a file has `"examsPublished": true` | `search-ref-real.mjs` and `opts-03-dedup-signature.mjs` pass on real dates; exam-gap pill checked in the browser |
| C. Firefox | owner (no Firefox here) | any time | checklist below passes |
| D. Safari / iOS | owner, on an iPhone | any time | checklist below passes |

A, command:
```bash
git pull --rebase && git diff d09dcdf..origin/main -- web/data | grep -c '"prereqs"'
```
0 means no churn. Otherwise, diff one file and compare with the parser offline (`solver-audit/plan-probes/data-p4-compare.mjs` on `.yedion-cache`).

B, check:
```bash
grep -rl '"examsPublished": true' web/data | head
```
Then `node solver-audit/repro/search-ref-real.mjs` and `node solver-audit/repro/opts-03-dedup-signature.mjs`, and open a plan with exams in the browser (pill "פער בין בחינות" shows a number of days).

C/D, browser checklist (live site, 375px and desktop):
1. Pick a program and year, the courses list loads.
2. Run a search; a plan appears; switch alternatives.
3. Progress map: opens, zooms (pinch on the phone), switch an alternative from the map header, the mini pane follows.
4. Import grades (PDF) and a friend picture; both finish without a console error.
5. Reload: the state is kept.

Close #9 when A-D are done. If B is still waiting at the start of the semester, close #9 with A, C, D and open a small issue for B alone.

## Not in this plan

The small map minors in `docs/ISSUES.md` section 23 are not GitHub issues and stay there.
