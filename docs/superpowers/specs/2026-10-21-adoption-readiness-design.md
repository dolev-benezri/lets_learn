# Adoption readiness (design)

Date: 2026-10-21. Owner's choices from a brainstorm, one question at a time. Each numbered item below becomes one GitHub issue (label `adoption`,
milestone "לפני הפגישה הבאה"); the tracking issue "מוכנות לאימוץ" links them all, and docs/ISSUES.md section 24 points to it.
Issues: items 1-14 are #12-#25, 15a #26, 15b #27, 17-19 #28-#30; item 16 has no issue (docs only); tracking #31.

## Goal

The college adopts the tool officially. Main scenario: Afeka IT hosts and maintains it; fallbacks: the owner keeps maintaining it, or a
final-project team does. The handover must leave no opening for a student to say "I built my timetable with the tool and was harmed":
the tool says what it is and is not, sends students to a human advisor, shows how fresh every fact is, and the departments sign off on the rules.

Not promised: a legally airtight result. The binding wording is for the college's legal counsel; this work gives them a ready draft and a risk map.

## Constraints

- The repo is public. Issues and committed docs hold technical and product content only: no names of people, nothing said in a meeting,
  no negotiation strategy. Questions for IT and for academic counseling, the handover scenarios, ownership and licence stay in
  `docs/meeting-prep.md` (git-excluded).
- Everything works in all three handover scenarios: one config value (support address), one status file (notice, registration turns), no code edits.
- Items that depend on others are finished on our side and say so: "מוכן מצדנו, ממתין ל-X".
- Every item that renders text joins `test/xss.test.mjs`; UI items are checked in the browser at 375, 320 and desktop, light and dark.

## Site

1. **Terms gate.** Before the track question (`renderMe` gated branch, web/ui-me.js). Three sentences: a helper tool only; not registration;
   not a recommendation, talk to an academic advisor before registering. Links to web/legal.html and to "מה הכלי בודק" (item 7).
   Checkbox "קראתי והבנתי"; "המשך" disabled until ticked. Stored as `afeka-sched-v1-terms` = version number; a newer version shows the gate again.
   "מחק את כל הנתונים שלי" clears it like every `afeka-sched-v1*` key.
2. **Disclaimer line** "אינו הרשמה ואינו המלצה. לפני ההרשמה מומלץ להתייעץ עם יועץ לימודים." under every alternative in step 4, in the
   DESCRIPTION of every event in the `.ics` export (web/ics.js), and on the advisor summary (item 5).
3. **Rename "מומלץ"** in "הצג לפי" (web/ui-view.js `SORT_BY`) to "מאוזן". The key `best` stays, so saved state keeps working.
4. **Split lecture and tutorial (opt-in).** Today the solver builds a course only from linked groups (web/solver-core.js `grow`), which matches
   the college's rule. New checkbox in step 3 beside "לכלול קבוצות מלאות": "להציג גם הרצאה ותרגול מופרדים", off by default. Turning it on opens a
   dialog (web/ui-dialog.js): splitting can open a gap between what the lecture and the tutorial teach, and needs academic counseling approval;
   "אישור" / "ביטול". When on, a course may also take any sub-group of the needed type, linked or not. Split alternatives are listed in their own
   group after all regular ones, under "חלופות עם הפרדת הרצאה ותרגול (דורש אישור ההכוון האקדמי)"; a split alternative never ranks above a regular one.
   Each split course shows "מופרד · דורש אישור ההכוון". The search keeps its time budget; a test measures the search on the largest real program
   with the option on.
5. **Academic counseling.** A fixed link to the counseling page (header and step 4; the URL is one config value). A "סיכום לפגישה עם יועץ" button
   in step 4 opens a print page (browser print, no library; "save as PDF" from the print dialog): profile, credits, passed, missing, the chosen
   alternative, regulation warnings, split courses, the disclaimer line.
6. **Freshness per group.** Each group shows "מלא" or "פנוי" and "נכון ל-HH:MM" (from the data file's fetch time; per group when the data
   carries it). With an official feed, `seatsLeft` shows "נשארו N מקומות". Registration goes by turns (by year or average; exact hours to be
   given by academic counseling): the student picks their turn in step 1; turns live in `status.json` (`turns`: id, label, opensAt). If the data
   was fetched before the student's turn opened, a banner: "שימו לב: הנתונים נמשכו לפני פתיחת התור שלך. ייתכנו שינויים במקומות הפנויים."
   No turns in the status file: no picker, no banner.
7. **"מה הכלי בודק ומה לא"**, a section in web/legal.html. Checks: overlaps, prerequisites as the yedion lists them, the regulation sections
   implemented (list from docs/ARCHITECTURE.md). Does not check: live seats (except as item 6 says), personal approvals, exemptions missing from
   the grade sheet, English level, anything the yedion does not publish.
8. **Conflict warning.** Programs with an open conflict between official sources (docs/ISSUES.md section 21) show in step 1: "יש סתירה בין
   המקורות הרשמיים לגבי X. בדקו מול המחלקה." The conflicts live in `scripts/programs.json` per program and cohort, so the tool and the sheets
   (item 19) read one list.
9. **Report a mistake.** A button that opens a `mailto:` with subject and a body the tool fills (program, cohort, semester, group, page).
   The address is one config value. A form into IT's ticket system comes later, only if IT asks.
10. **Remote notice.** `status.json` gains `notice` (text, optional). When set, a red banner at the top of every page: the holder of the tool
    warns everyone without a deploy.
11. **Rules report and department sign-off.** A script writes one printable HTML page per program and cohort: required credits, required and
    elective lists, prerequisites, specializations, as the tool reads them. `programs.json` gains `approved` (date, optional) per program and
    cohort; the tool shows "אושר על ידי המחלקה, <date>" or keeps the existing "not verified" warning, more visible.

## Handover package

12. **Data contract** (`docs/DATA-CONTRACT.md`): the format the site reads, field by field, with an example; required vs optional; what the
    tool does when a field is missing. New optional fields: `seatsLeft`, per-group `fetchedAt`, `turns` in the status file. A check script IT runs
    on its export before upload (reuses the build checks in scripts/build.mjs).
13. **Operations guide** (`docs/OPERATIONS.md`), for someone who has not read the code: hosting (copy `web/` to any static server), updating
    data, setting the notice, setting turns, marking a program approved, running the tests, who to contact.
14. **Security and privacy note for IT**: no server, no accounts, everything in the browser, zero outside requests (after item 15b), CSP,
    libraries with versions and licences, how links are validated.
15. **(a) Accessibility**: self-audit against WCAG 2.1 AA, fix what it finds, automated checks in the test suite, a draft accessibility
    statement marked "טיוטה, לבדיקת מורשה נגישות". The certified audit is the college's on adoption; we never claim one.
    **(b) Self-host tesseract.js** (script, worker, core, he+en data) in `web/vendor/`, drop jsDelivr from the CSP and its test.
16. **Pipeline**: P2 (partial runs), P7 (atomic cache write) and P8 (token in the environment) are handled in code today
    (ci/gitlab-scrape.yml partial-run counter, `rename` in scripts/scrape.mjs, `npm ci --ignore-scripts`). Mark them closed in docs/ISSUES.md
    section 19 after reading each once more.
17. **Browser checks**: WebKit through Playwright on the main flows (gate, step 1 import, search, step 4, export), and a short checklist the
    owner runs on an iPhone. Exams: the code is tested on sample data; the real check waits for the published exam board.
18. **Beta kit**: 6-8 tasks ("בנו מערכת לסמסטר א׳ יחד עם חבר"), a short feedback form, how to pick the sample (years and departments).
    Running it is the owner's.
19. **Conflict sheets**: one A4 page per department with a conflict: what we found, what each source says, what the tool does today, a blank
    line for their decision.
20. **Outside git** (`docs/meeting-prep.md`): questions for IT (which system feeds the yedion and Afeka-net, who can export, how often, who
    approves), questions for academic counseling (turns, exact hours, who updates them each semester), the three handover scenarios, ownership
    and licence (decided after the next meeting, not in the presentation).

## After the next meeting

Ownership and licence; a report form into IT's ticket system. Not in the presentation.

## Later, separate specs

A short video and a presentation for the meeting, built after the items above. Rule for both: human-made look, no generic AI style
(no purple gradients, no emoji, no hype words); real screenshots, plain first-person wording.

## Testing

Unit tests for every new pure function (terms version, split combos, turn banner rule, notice, mailto body, rules report). The XSS test covers
the gate, the notice, the advisor summary and the conflict line. Browser checks per the constraints above. Full `npm test` before each merge.
