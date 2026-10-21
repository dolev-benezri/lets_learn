# Adoption readiness, part B: the handover package — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything a new holder (Afeka IT, the owner, or a final-project team) needs to run the tool, and everything a department needs to
sign off on its rules: rules reports, data contract and checker, operations guide, security note, accessibility pass, zero outside requests,
WebKit checks, beta kit, conflict sheets (issues #22-#30).

**Architecture:** Two new scripts read the same data the site reads (`web/data/afeka/**`, `web/settings.json`) and write printable HTML
into the git-ignored `out/`. Docs live in `docs/` and cite the code they describe. Browser checks run in Playwright WebKit outside `npm test`.

**Tech Stack:** Node 22 scripts, `node --test`; dev-only: `playwright` (WebKit) and `@axe-core/playwright`.

**Spec:** `docs/superpowers/specs/2026-10-21-adoption-readiness-design.md` (items 11-19). Depends on part A Task 1 (`web/settings.json`,
`cleanSettings`) and Task 8 (`conflictsFor`). Run after part A is merged.

## Global Constraints

- Branch `feat/adoption-handover`; merge only with the owner's OK; `git pull --rebase` before push.
- Generated pages go to `out/` (add to .gitignore); nothing generated is committed. Print pages: A4, black on white, Rubik from `web/fonts/`.
- Docs are in Hebrew (like docs/ARCHITECTURE.md, `<div dir="rtl" lang="he">`), plain wording, no names of people, nothing from meetings.
- Every claim in OPERATIONS.md and SECURITY.md names the file (and line or test) that backs it.
- Dependencies stay one runtime dependency (`node-html-parser`); the two Playwright packages are devDependencies, pinned to exact versions.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Full `npm test` before merge.

## Review Focus

1. A program or cohort in the catalog whose data file is missing (2-year or dropped cohort): the rules report skips it with a line in the
   index, it does not crash.
2. An export with an extra unknown field, or a missing optional one (`seatsLeft`, `fetchedAt`): the checker passes; a missing required one fails
   with the field path in the message.
3. OCR with an empty browser cache and no network beyond the site: works from `web/vendor/tesseract/` only (CSP would block anything else).
4. WebKit at 375 wide: the terms gate, the dialogs and the print summary are reachable and usable by keyboard (Tab order, Escape closes dialogs).
5. A department with conflicts in several programs gets one sheet listing all of them; a department with none gets no sheet.

---

### Task 1: Rules report and department sign-off (#22)

**Files:**
- Create: `scripts/rules-report.mjs`, `test/rules-report.test.mjs`
- Modify: `web/ui-me.js` + `web/ui-view.js` (approved line), `.gitignore` (`out/`), `package.json` (`"report:rules": "node scripts/rules-report.mjs"`)

**Interfaces:**
- Consumes: `progress`, `specRule`, `specLists` (web/rules.js), `cleanSettings` (web/settings.js).
- Produces: `rulesHtml(data, catalogEntry, settings) -> string` (pure); CLI writes `out/rules/<program>-<startYear>.html` and `out/rules/index.html`.
  `approvedOn(settings, program, startYear) -> string | null` in web/settings.js.

- [ ] **Step 1: Write the failing tests:** `rulesHtml` for `web/data/afeka/2027-1/30-2026.json` contains the program name, the cohort, the
  total credits goal, every list title with its minimum credits and every course id in it, each course's prerequisites by name, the
  specialization rule, and the signature block `אישור המחלקה: שם ________ תפקיד ________ תאריך ________ חתימה ________`;
  `approvedOn` returns the date for a listed cohort and null otherwise.
- [ ] **Step 2: Run** `node --test test/rules-report.test.mjs` — FAIL.
- [ ] **Step 3: Implement.** The CLI loops the catalog; a missing file adds `לא נמצא קובץ נתונים` to the index (Review Focus 1). Site: when
  `approvedOn` returns a date, the header meta and step 1 show `אושר על ידי המחלקה, <date>` instead of the "not verified" text; otherwise the
  existing text gets class `warn-text`.
- [ ] **Step 4: Run** tests and `npm run report:rules`; open two generated pages; print preview fits whole lists per page.
- [ ] **Step 5: Commit** `feat(report): printable rules per program and cohort, department approval on the site`.

### Task 2: Data contract and export checker (#23)

**Files:**
- Create: `docs/DATA-CONTRACT.md`, `scripts/check-export.mjs`, `test/check-export.test.mjs`
- Modify: `package.json` (`"check:export": "node scripts/check-export.mjs"`)

**Interfaces:**
- Consumes: `validate(d, prev, anchor, minCourses)` and `compareToPrevious(prev, next)` (scripts/build.mjs:68, :134).
- Produces: `checkExport(dir: string) -> { errors: string[], warnings: string[] }`; CLI exits 1 when `errors` is non-empty.

- [ ] **Step 1: Write the failing tests:** `checkExport('web/data/afeka')` has no errors; a copy with one group's `meetings` removed reports its
  path; a copy with an unknown field and without `seatsLeft` has no errors; a missing `catalog.json` is an error; a `status.json` without
  `checkedAt` is an error.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** the checker (reuse build.mjs, add the catalog/status/file-per-cohort checks). Write DATA-CONTRACT.md: folder
  layout, catalog.json, status.json, one data file field by field (required/optional, type, example, what the site does without it), the new
  optional `seatsLeft` and per-group `fetchedAt`, and "how to check an export" (`npm run check:export -- <dir>`).
- [ ] **Step 4: Run** tests — PASS; run the CLI on `web/data/afeka` — exit 0.
- [ ] **Step 5: Commit** `docs(data): the data contract and a checker for an official export`.

### Task 3: Operations guide and security note (#24, #25)

**Files:**
- Create: `docs/OPERATIONS.md`, `docs/SECURITY.md`
- Modify: `docs/README.md` (index), `README.md` (developer links at the bottom)

- [ ] **Step 1:** OPERATIONS.md sections: hosting (copy `web/` to any static server, HTTPS, no server code; the CSP is in the HTML), updating
  data (scraper or official export + `check:export`), `web/settings.json` field by field (notice, turns, support address, counseling URL,
  approvals, conflicts) with a copy-paste example each, running the tests, generating rules reports and conflict sheets, who to contact
  (left as `<כתובת התמיכה>` for the holder to fill).
- [ ] **Step 2:** SECURITY.md: no server and no accounts; what is stored in the browser and how to clear it; outside requests (none after Task 5);
  the CSP, quoting the test that enforces it (test/app.test.mjs:163); every library with version and licence (web/vendor/*); friend and backup
  link validation (web/share.js, limits 4KB/64KB/256KB); how to report a vulnerability.
- [ ] **Step 3:** Follow each OPERATIONS step once on a scratch copy (notice on, a turn, an approval) and fix the text where it was wrong.
- [ ] **Step 4: Commit** `docs: operations guide and security note for whoever holds the tool`.

### Task 4: Accessibility pass (#26)

**Files:**
- Create: `docs/ACCESSIBILITY-WCAG21.md` (the self-audit table)
- Modify: whatever the audit finds (web/*), `web/legal.html#accessibility` (draft statement), `package.json` devDependencies
- Test: `test/browser/a11y.spec.mjs` (run by Task 6's runner)

- [ ] **Step 1:** Write the axe check: for each screen (gate, track, year, step 1 entry, step 1, step 2, step 3, step 4, map, friend editor,
  each dialog) at 375 and 1280, light and dark, `@axe-core/playwright` with tags `wcag2a, wcag2aa, wcag21a, wcag21aa` reports no violations.
- [ ] **Step 2: Run** it — expect violations; list them in ACCESSIBILITY-WCAG21.md with the manual criteria axe cannot check (keyboard
  order, focus visible, 200% zoom, 320 reflow, screen-reader names), one row per criterion: pass / fixed / open.
- [ ] **Step 3:** Fix every A/AA finding; one commit per kind of fix (`fix(a11y): …`).
- [ ] **Step 4:** Update the statement in legal.html: standard (ת"י 5568, WCAG 2.1 AA), what was checked and how, known limits, contact; the
  heading says `טיוטה, לבדיקת מורשה נגישות`. No claim of a certified audit.
- [ ] **Step 5: Run** the a11y spec — no violations. Commit `docs(a11y): WCAG 2.1 AA self-audit and draft statement`.

### Task 5: Self-hosted tesseract.js (#27)

**Files:**
- Create: `web/vendor/tesseract/` (tesseract.esm.min.js, worker.min.js, core files the worker loads, `heb.traineddata.gz`, `eng.traineddata.gz`, LICENSE)
- Modify: `web/friend-scan.js:7` (local paths: `workerPath`, `corePath`, `langPath`), `web/index.html` CSP (drop every jsdelivr source),
  `test/app.test.mjs:163-175,251-253`

- [ ] **Step 1: Change the tests first:** no `https://` URL anywhere in web/*.js and web/*.html except links in text (`<a href>`); index.html CSP
  has no jsdelivr; `web/vendor/tesseract/LICENSE` exists.
- [ ] **Step 2: Run** `node --test test/app.test.mjs` — FAIL.
- [ ] **Step 3:** Copy the files from the npm packages `tesseract.js@7.0.0` and `tesseract.js-core@7.0.0` (`npm pack`, files only, into a new empty
  folder, then copy) and the language data from `@tesseract.js-data/heb` and `@tesseract.js-data/eng` (same version line the CDN served).
  Record each file's source and SHA-256 in `web/vendor/tesseract/SOURCES.txt`. Point friend-scan.js at them; keep `'wasm-unsafe-eval'` and `blob:`.
- [ ] **Step 4: Run** tests — PASS. Browser: empty cache, picture import of a sample image; the network list shows no request outside the site.
- [ ] **Step 5: Commit** `feat(ocr): tesseract.js served from web/vendor, no outside requests`.

### Task 6: WebKit runner and iPhone checklist (#28)

**Files:**
- Create: `test/browser/flows.spec.mjs`, `test/browser/run.mjs` (starts a static server on a free port, runs the specs in WebKit), `docs/IPHONE-CHECKLIST.md`
- Modify: `package.json` (`"test:browser": "node test/browser/run.mjs"`, devDependencies `playwright` + `@axe-core/playwright`, exact versions)

- [ ] **Step 1:** Flows in WebKit at 375×812 and 1280×800: terms gate then track then year; grade-sheet entry screen "הזנה ידנית"; tick a
  course, reach step 4, an alternative shows; split option dialog, cancel and confirm; advisor summary opens print (stub `print`);
  `.ics` download has the disclaimer; theme button toggles. Keyboard only: Tab reaches every control of the gate, Escape closes each dialog.
- [ ] **Step 2: Run** `npm run test:browser` — fix what fails (commit each fix).
- [ ] **Step 3:** IPHONE-CHECKLIST.md: 10 checks the owner runs on a real iPhone (Safari), each with what "pass" looks like, plus a line for
  the date and iOS version. Exams: one line that the real check waits for the published exam board.
- [ ] **Step 4: Commit** `test(browser): WebKit flows and the iPhone checklist`.

### Task 7: Beta kit and conflict sheets (#29, #30)

**Files:**
- Create: `docs/BETA.md`, `scripts/conflict-sheets.mjs`, `test/conflict-sheets.test.mjs`
- Modify: `package.json` (`"report:conflicts": "node scripts/conflict-sheets.mjs"`), `web/settings.js` + `web/settings.json` (conflict columns)

**Interfaces:**
- Consumes: `cleanSettings`, `conflictsFor` (part A), `scripts/programs.json` (`dept`, `deptName`).
- Produces: `sheets(settings, programs) -> { dept: number, deptName: string, html: string }[]`; CLI writes `out/conflicts/<dept>.html`.

- [ ] **Step 1: Write the failing tests:** one sheet per department with at least one conflict, none for others; a department with conflicts
  in two programs lists both; each sheet has the columns `מה מצאנו`, `תוכנית הלימודים`, `הידיעון`, `מה הכלי עושה היום`, `ההחלטה שלכם`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** Settings conflicts gain optional `plan`, `yedion`, `tool` texts for the three columns
  (part A Task 1's `cleanSettings` keeps them, each ≤300 characters); fill them for every section-21 conflict.
- [ ] **Step 4:** BETA.md: 6-8 tasks with what success looks like (e.g. `בנו מערכת לסמסטר א׳ יחד עם חבר`, `ייבאו את גליון הציונים`,
  `מצאו חלופה בלי יום שישי`, `שלחו את המערכת ליומן`, `הדפיסו סיכום ליועץ`), how to pick the sample (each year, at least three departments,
  day and evening), a 5-question feedback form (text, ready to paste into Google Forms), and what to record.
- [ ] **Step 5: Run** tests and `npm run report:conflicts`; print preview: each sheet one A4 page. Commit
  `feat(report): a conflict sheet per department; docs: beta kit`. Then ask the owner to review; merge and push on OK; close #22-#30.

### Task 8: First-visit tour (owner's request 2026-10-21)

Owner chose a spotlight tour with Driver.js after the terms gate. Runs after Task 4 (a11y specs exist) and before Tasks 7 and 3.

**Files:**
- Create: `web/vendor/driver/` (driver.js ESM/IIFE build + driver.css + LICENSE + SOURCES.txt with source and SHA-256, like web/vendor/tesseract/),
  `web/tour.js`, `test/tour.test.mjs`, `test/browser/tour.spec.mjs`
- Modify: `web/index.html` (replay button, stylesheet link), `web/app.js` or the module that runs after `acceptTerms`, `web/style.css` (RTL + dark theme
  for the popover, site tokens), `test/browser/a11y.spec.mjs` (axe on the open tour popover, 375 and 1280, light and dark)

**Interfaces:**
- Produces: `TOUR_KEY = 'afeka-sched-v1-tour'`; `tourSeen(part) -> boolean`, `markTour(part)` (part `'intro'` | `'plans'`), in-memory fallback when
  localStorage throws (same pattern as termsOk/acceptTerms in web/ui-common.js); `TOUR_INTRO`, `TOUR_PLANS` step arrays (selector + Hebrew text);
  `startTour(part)` skips steps whose element is missing or hidden.

- [ ] **Step 1: Write the failing tests:** `tourSeen('intro')` false on a fresh store, true after `markTour('intro')`; parts are independent; works when
  localStorage throws; every step text is ≤140 characters, Hebrew, no emoji; every selector in TOUR_INTRO exists in web/index.html.
- [ ] **Step 2:** Vendor Driver.js: latest 1.x from npm (`npm pack` into a new empty folder, copy dist files only), exact version in SOURCES.txt.
  No CDN, no outside request; CSP in index.html must still pass test/app.test.mjs.
- [ ] **Step 3: Implement.** Part `intro` starts once, right after the terms gate is accepted on a first visit (not over a pending backup link
  confirm, not on the print page). Part `plans` starts once, the first time step 4 shows at least one alternative. Buttons `הבא`, `הקודם`, `דלג`
  (close = done, marks seen), progress `1 מתוך 7`; Escape closes; focus returns to where it was. A replay button `סיור באתר` (ghost, in nav.steps
  beside the theme button; icon-only with aria-label at phone width if needed) runs `intro` again. Popover text RTL, Rubik, site colours, both themes.
  Steps (copy, verbatim):
  intro:
  1. `nav.steps`: `ארבעה שלבים, מימין לשמאל. אפשר לחזור לכל שלב בכל רגע.`
  2. step 1 link: `המצב שלי: מסלול, שנה ומה כבר עברת. אפשר לייבא את גליון הציונים.`
  3. step 2 link: `קורסים: מה ללמוד בסמסטר. מוצגים רק קורסים שפתוחים לך.`
  4. step 3 link: `מה חשוב לי: יום פנוי, בלי חלונות, עם חברים, שעות התחלה וסיום.`
  5. step 4 link: `מערכות: עד 10 חלופות בלי התנגשויות. עוברים ביניהן בחיצים.`
  6. `.actions`: `מכאן: רשימה להרשמה, סיכום לפגישה עם היועץ, ושיתוף עם חברים.`
  7. replay button: `אפשר לראות את הסיור שוב מכאן. זה כלי עזר לתכנון, ההרשמה עצמה באפקה-נט.`
  plans:
  1. `#switcher`: `כל חלופה היא מערכת שלמה בלי התנגשויות. החיצים עוברים ביניהן.`
  2. first group block in the week: `לחיצה על קבוצה מראה מרצה, מקומות פנויים ומתי זה נבדק.`
  3. `#advisorBtn`: `דף מסודר להדפסה, להביא לפגישה עם היועץ.`
  4. registration list button: `רשימת הקבוצות להרשמה, וייצוא ליומן.`
- [ ] **Step 4: Browser spec** (WebKit, 375×812 and 1280×800): fresh visit, accept gate, tour shows step 1 of N; Next walks to the end; Escape closes;
  reload shows no tour; replay button opens it; `plans` part shows once on the first alternatives screen; no outside requests. a11y spec: no axe
  violations with the popover open.
- [ ] **Step 5: Run** `npm test`, `npm run test:browser`. Commit `feat(tour): first-visit tour of the site (Driver.js, hosted locally)`.
