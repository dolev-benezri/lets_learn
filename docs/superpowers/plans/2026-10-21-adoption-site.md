# Adoption readiness, part A: the site — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The site says what it is and is not, sends students to a human advisor, offers split lecture/tutorial only as a warned exception,
shows how fresh each group is, and lets whoever holds the tool warn and support users without touching code (issues #12-#21).

**Architecture:** One new holder-edited file, `web/settings.json`, read once at start into `app.settings` (support address, counseling URL,
notice, registration turns, per-program approval and conflicts). Pure helpers (text, rules, mailto, print page) live in small modules with
unit tests; renderers call them. The solver gains one option (`constraints.split`) and one wrapper (`searchAll`) the worker calls.

**Tech Stack:** Plain ES modules, no build; `node --test`; node-html-parser in tests only.

**Spec:** `docs/superpowers/specs/2026-10-21-adoption-readiness-design.md` (items 1-10). Part B (handover package, items 11-19) is
`docs/superpowers/plans/2026-10-21-adoption-handover.md`.

## Global Constraints

- Branch `feat/adoption-site`; merge to main only with the owner's OK; `git pull --rebase` before push (nightly data commits).
- No line in `web/` over 200 characters (`test/line-length.test.mjs`). No new dependency.
- Every data or settings string reaches HTML through `esc()`; every new renderer joins `test/xss.test.mjs`.
- localStorage keys start with `afeka-sched-v1` (so "מחק את כל הנתונים שלי" clears them); every access in try/catch, the site works without storage.
- Copy is exactly as written in this plan (Hebrew, owner-approved wording). Disclaimer line, verbatim:
  `אינו הרשמה ואינו המלצה. לפני ההרשמה מומלץ להתייעץ עם יועץ לימודים.`
- Browser check of every UI task at 375, 320 and desktop, light and dark (launch.json "debug", port 8144). Design rules:
  `design-system/afeka-scheduler/MASTER.md` + `pages/app.md`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Focused tests per task, full `npm test` before merge.

**Spec deviation (decided here, Task 1 updates the spec):** `notice` and `turns` go in `web/settings.json`, not `status.json`, because the
scraper rewrites `status.json` from scratch (`writeResults`, scripts/scrape.mjs:124) and would erase them. Approval dates and conflicts go in
the same file, not `scripts/programs.json`, because the site never reads programs.json and a change there needs a full re-scrape.

## Review Focus

1. Storage throws (private mode, blocked site data): the terms gate still lets the visitor through for this visit, and asks again next visit.
2. `settings.json` missing, 404, invalid JSON or wrong types: the site works as today; no notice, no turn picker, no report button, no conflict line.
3. Split on, for a course with no sub-groups, or whose sub-groups are all linked, or with a pinned group: no extra options, no crash, the pin holds.
4. Times: `opensAt` and `fetchedAt` are compared as instants (`new Date(iso)`), shown in Israel time; an ISO string with `+03:00` and one with `Z`
   for the same instant give the same answer.
5. A friend or backup link opened before the terms are accepted: the gate shows first, and the link's banner or restore still happens after "המשך".

---

### Task 1: Holder settings file

**Files:**
- Create: `web/settings.js`, `web/settings.json`, `test/settings.test.mjs`
- Modify: `web/app.js` (init, `app` object), `docs/superpowers/specs/2026-10-21-adoption-readiness-design.md` (items 6, 8, 10, 11: say settings.json)

**Interfaces:**
- Produces: `cleanSettings(raw: unknown) -> Settings` and `SETTINGS_DEFAULT` in web/settings.js;
  `Settings = { supportEmail: string, counselingUrl: string, notice: string, turns: {id, label, opensAt}[], programs: { [id]: { approved?: { [startYear]: 'YYYY-MM-DD' }, conflicts?: { cohorts: number[], text: string }[] } } }`;
  `app.settings: Settings` (always set, defaults when the file fails).

- [ ] **Step 1: Write the failing tests** in test/settings.test.mjs:
  `cleanSettings(null)` deep-equals `SETTINGS_DEFAULT`; garbage (`{ notice: 5, turns: 'x', supportEmail: 'not an email', counselingUrl: 'javascript:alert(1)' }`)
  gives the defaults for each bad field; a valid file round-trips; a turn without a parsable `opensAt` is dropped; `counselingUrl` accepts only
  `https:`; `supportEmail` must match `/^[^\s@<>"]+@[^\s@<>"]+$/`; conflict `text` over 300 characters is dropped.
- [ ] **Step 2: Run** `node --test test/settings.test.mjs` — FAIL (module missing).
- [ ] **Step 3: Implement** web/settings.js (field-by-field rebuild, like `normalize()` in app.js). web/settings.json starts as
  `{ "supportEmail": "", "counselingUrl": "", "notice": "", "turns": [], "programs": {} }`. In `init()` (web/app.js:293) fetch `settings.json`
  with `{ cache: 'no-cache' }` in parallel with status.json; `app.settings = cleanSettings(json)`; set `app.settings = SETTINGS_DEFAULT` in the
  `app` object literal so tests and early renders have it.
- [ ] **Step 4: Run** `node --test test/settings.test.mjs test/app.test.mjs` — PASS.
- [ ] **Step 5: Update the spec** (deviation above), commit `feat(settings): one holder-edited file for notice, turns, contacts, approvals`.

### Task 2: Terms gate (#12)

**Files:**
- Modify: `web/ui-common.js` (keys, `gated`), `web/ui-me.js` (`gateHtml`), `web/ui-actions.js` (ACT/CHG), `web/style.css`
- Test: `test/xss.test.mjs` (the opening-screen tests live here; set `ls['afeka-sched-v1-terms'] = TERMS_VERSION` in its storage stub)

**Interfaces:**
- Produces: `TERMS_VERSION = '1'`, `termsOk() -> boolean`, `acceptTerms() -> void` in ui-common.js; `gated()` is also true while `!termsOk()`.

- [ ] **Step 1: Write the failing tests:** with no terms key, `renderMe()` writes a screen containing the three sentences below, a checkbox
  `data-chg="termsTick"`, a button `data-act="acceptTerms"` with `disabled`, and links to `legal.html#terms` and `legal.html#scope`;
  with key `'0'` (older version) the same; with `TERMS_VERSION` the track question shows (existing test). With storage throwing:
  `acceptTerms()` then `termsOk()` is true (in-memory fallback for this visit).
- [ ] **Step 2: Run** `node --test test/xss.test.mjs` — FAIL.
- [ ] **Step 3: Implement.** Key `afeka-sched-v1-terms`; `termsOk` = stored value === TERMS_VERSION or the in-memory flag. The gate's first screen
  (before "מה המסלול שלך?"), heading `לפני שמתחילים`, then exactly:
  `זה כלי עזר לתכנון בלבד. הוא לא רושם אתכם לקורסים: ההרשמה נעשית רק באפקה-נט.`
  `החלופות שהכלי מציג הן אפשרויות, לא המלצה.`
  `לפני ההרשמה מומלץ להתייעץ עם יועץ לימודים, במיוחד בכל חריגה מהמערכת המומלצת של המחלקה.`
  Links: `תנאי השימוש` (legal.html#terms), `מה הכלי בודק ומה לא` (legal.html#scope). Checkbox label `קראתי והבנתי`; button `המשך`, disabled
  until ticked (CHG `termsTick` toggles the button's `disabled` without a re-render). ACT `acceptTerms`: `acceptTerms()`, refresh, focus `#meTitle`.
- [ ] **Step 4: Run** `node --test test/xss.test.mjs` — PASS. Browser: fresh private window shows the gate; after "המשך" the track question;
  reload skips the gate; open the site with a friend link (`#f=…`) in a fresh window: gate, then the friend banner.
- [ ] **Step 5: Commit** `feat(gate): accept the terms before the first question`.

### Task 3: Disclaimer line and "מאוזן" (#13, #14)

**Files:**
- Modify: `web/ui-text.js`, `web/ui-view.js` (`SORT_BY`, `renderView`), `web/ics.js`, `web/style.css`
- Test: `test/ics.test.mjs`, `test/ui-text.test.mjs`

**Interfaces:**
- Produces: `DISCLAIMER` (the verbatim line) in ui-text.js; `disclaimerHtml(counselingUrl: string) -> string` (the line; when the URL is set,
  `יועץ לימודים` is a link to it with `target="_blank" rel="noopener"`).

- [ ] **Step 1: Write the failing tests:** every VEVENT in `toIcs(...)` output has a DESCRIPTION ending with `DISCLAIMER` (exams too);
  `disclaimerHtml('')` contains no `<a`; `disclaimerHtml('https://x/y')` has one link to it.
- [ ] **Step 2: Run** `node --test test/ics.test.mjs test/ui-text.test.mjs` — FAIL.
- [ ] **Step 3: Implement.** ics: append `\n` + DISCLAIMER to the lesson DESCRIPTION, add a DESCRIPTION with DISCLAIMER to exam events.
  renderView: `<p class="disclaimer">` with `disclaimerHtml(app.settings.counselingUrl)` after the pills whenever a result shows.
  `SORT_BY` first label `מאוזן` (key `best` unchanged).
- [ ] **Step 4: Run** the two test files plus `test/xss.test.mjs` — PASS. Browser: the line under the pills at 320 wraps cleanly.
- [ ] **Step 5: Commit** `feat(ui): disclaimer on every alternative and calendar event; "מומלץ" is now "מאוזן"`.

### Task 4: Split lecture and tutorial in the solver (#15, core)

**Files:**
- Modify: `web/solver-core.js` (`buildOptions`, `search` leaf, new `searchAll`), `web/solver-worker.js`
- Test: `test/solver.test.mjs`

**Interfaces:**
- Consumes: `constraints.split: boolean` (default false).
- Produces: option field `split: boolean`; result field `split: string[]` (course ids built from at least one unlinked group; `[]` when none);
  for a pair, `split` = union of `a.split` and `b.split`. `searchAll(msg) -> { results, partial, diagnosis }` where `msg` is what the worker
  receives today (`{ year: {...} }` or search args); the worker becomes `self.postMessage(searchAll(e.data))`.

- [ ] **Step 1: Write the failing tests** (small inline course: primary lecture `L` linked to tutorial `T1`; tutorial `T2` of the same type not
  linked to anything; a second course with a lecture only):
  - split off: options of the course are exactly `[L,T1]`; every result has `split: []`.
  - split on: options include `[L,T2]` with `split: true` and `[L,T1]` with `split: false`; the lecture-only course has the same options as off.
  - `searchAll` with split on: every result with `split.length > 0` comes after every result with `split.length === 0`; at most `topK` of each.
  - split on with `T2` pinned: every option of the course contains `T2`.
  - time: on the largest real file (`web/data/afeka/2027-1/` file with the most groups, picked in the test) with every candidate course
    optional and split on, `searchAll` with `timeLimitMs: 1500` returns in under 2500 ms and `partial` may be true.
- [ ] **Step 2: Run** `node --test test/solver.test.mjs` — FAIL.
- [ ] **Step 3: Implement.** buildOptions gains `split = false`. When true, for each primary, the sub-groups to combine are, per type that any of
  its linked groups has, every non-primary group of that type in the course (not only the linked ones); `split: true` when a chosen sub-group is
  not reachable through `linked` from the primary (the existing `grow` chain decides "reachable"). `search` passes `constraints.split`, copies
  `split` into each result (`sel.filter(o => o.split).map(o => o.course)`). `searchAll`: split off → today's call unchanged. Split on → run the
  regular search with 60% of `timeLimitMs`, then the split search with 40%, keep the second run's results whose `split` is non-empty and whose
  group set differs from every regular result, append them; `partial` = either run partial; `diagnosis` from the regular run.
- [ ] **Step 4: Run** `node --test test/solver.test.mjs test/solver-props.test.mjs` — PASS.
- [ ] **Step 5: Commit** `feat(solver): opt-in split lecture and tutorial, listed after every regular alternative`.

### Task 5: Split lecture and tutorial in the UI (#15, UI)

**Files:**
- Modify: `web/app.js` (DEFAULT + normalize: `constraints.split`), `web/ui-drawer.js:53`, `web/ui-actions.js` (CHG `split`), `web/ui-view.js`
- Test: `test/app.test.mjs` (normalize), `test/xss.test.mjs`

**Interfaces:**
- Consumes: result `split: string[]` (Task 4), `askConfirm(text, { ok, cancel })` (web/ui-dialog.js:28).

- [ ] **Step 1: Write the failing tests:** normalize keeps `split: true`, turns `'yes'` into false; a backup link cannot set it (restore drops it,
  like other risky fields: check `restoreBackup`); rendering a result with `split: ['10013']` writes the group note and the course list below.
- [ ] **Step 2: Run** `node --test test/app.test.mjs test/xss.test.mjs` — FAIL.
- [ ] **Step 3: Implement.** Checkbox after "לכלול קבוצות מלאות": `להציג גם הרצאה ותרגול מופרדים`. Ticking calls askConfirm with:
  `הפרדה בין הרצאה לתרגול עלולה ליצור פער בין החומר שנלמד בהרצאה לחומר שבתרגול, כי הקצב שלהם מתואם. הפרדה כזו מותרת רק באישור ההכוון האקדמי.`
  ok `הבנתי, להציג`, cancel `ביטול`; on cancel the box unticks. Unticking needs no dialog. In renderView, when the shown result has `split.length`:
  a `note('alert', …)` at the top of the week: `חלופה עם הפרדת הרצאה ותרגול (דורש אישור ההכוון האקדמי)`, and a pill-info line
  `מופרדים: <names> · דורש אישור ההכוון`. The alternative label adds ` · מופרדת`.
- [ ] **Step 4: Run** the tests — PASS. Browser: tick, cancel (stays off); tick, confirm; step through alternatives: regular first, then
  marked ones; untick: marked ones gone. 375 and 320: the note and the line wrap, nothing overlaps the day selector.
- [ ] **Step 5: Commit** `feat(ui): split option with a warning, marked alternatives`.

### Task 6: Counseling link and advisor summary (#16)

**Files:**
- Create: `web/advisor.js`, `test/advisor.test.mjs`
- Modify: `web/index.html` (footer link, `<section id="print" hidden>`), `web/ui-view.js` (button), `web/ui-actions.js` (ACT `advisor`),
  `web/style.css` (`@media print`)

**Interfaces:**
- Consumes: `progress`, `gradeAverage` (web/rules.js), `summary` (web/ui-grid.js), `DISCLAIMER`.
- Produces: `advisorHtml({ state, data, res, cls, catalog, now }) -> string` (pure).

- [ ] **Step 1: Write the failing tests:** for the mini fixture (test/fixtures/mini-data.mjs) with one passed course and a result:
  output has headings `סיכום לפגישה עם יועץ לימודים`, `המצב שלי`, `החלופה שבחרתי`, `שימו לב`; lists the program name, study year, credits done
  of the goal, passed course names, missing required names, each course of the result with its group numbers and meeting times, the split
  courses when any, the regulation warnings, the date (`now`, Israel time) and DISCLAIMER. Hostile names come out escaped (add to xss.test.mjs).
- [ ] **Step 2: Run** `node --test test/advisor.test.mjs` — FAIL.
- [ ] **Step 3: Implement.** Button in step 4 next to the plan actions: `סיכום ליועץ` (icon `file`). ACT `advisor`: fill `#print` with
  `advisorHtml(...)`, show it, `print()`, hide it on `afterprint`. `@media print`: only `#print` is visible, A4, black on white.
  Footer gains a link `הכוון אקדמי` to `app.settings.counselingUrl` when set.
- [ ] **Step 4: Run** tests — PASS. Browser: print preview of a typical plan fits one A4 page, light and dark both print black on white.
- [ ] **Step 5: Commit** `feat(advisor): one-page summary to bring to an academic advisor`.

### Task 7: Freshness per group and registration turns (#17)

**Files:**
- Modify: `web/ui-text.js`, `web/ui-grid.js:236` (popover), `web/ui-drawer.js` (`regPanel`), `web/ui-me.js` (turn picker), `web/ui-view.js`
  (`renderBanner`), `web/app.js` (normalize `profile.turn`)
- Test: `test/ui-text.test.mjs`

**Interfaces:**
- Consumes: `app.settings.turns`, `data.fetchedAt`, optional `g.fetchedAt`, optional `g.seatsLeft`.
- Produces: `groupFresh(g, fileFetchedAt) -> string`; `turnWarning(turns, turnId, fetchedAt, now) -> string | null`.

- [ ] **Step 1: Write the failing tests:** `groupFresh({ full: true }, '2026-10-16T05:08:00Z')` = `מלא · נכון ל-08:08` (Israel time);
  `{ full: false, seatsLeft: 3 }` = `נשארו 3 מקומות · נכון ל-…`; `{ full: false }` = `פנוי · נכון ל-…`; a group `fetchedAt` wins over the file's.
  `turnWarning`: no turns → null; unknown turn id → null; fetched before opensAt and now after it → the banner text; fetched after → null;
  now before opensAt → null; `opensAt` `2026-11-01T08:00:00+02:00` and fetched `2026-11-01T05:59:00Z` → warning (Review Focus 4).
- [ ] **Step 2: Run** `node --test test/ui-text.test.mjs` — FAIL.
- [ ] **Step 3: Implement.** Banner text: `שימו לב: הנתונים נמשכו לפני פתיחת התור שלך. ייתכנו שינויים במקומות הפנויים.`
  Popover subtitle and each registration-list group get `groupFresh`. Step 1 profile card, only when turns exist: select `התור שלי בהרשמה`
  (options = turn labels, plus `לא יודע/ת`), saved in `state.profile.turn` (normalize: a string, kept only if non-empty).
- [ ] **Step 4: Run** tests + `test/xss.test.mjs` — PASS. Browser: with a sample `turns` in a local settings.json, picker shows, banner shows.
- [ ] **Step 5: Commit** `feat(ui): how fresh each group is, and a warning before your registration turn`.

### Task 8: Conflicts, notice and report button (#19, #20, #21)

**Files:**
- Modify: `web/settings.json` (conflicts from docs/ISSUES.md section 21), `web/ui-me.js`, `web/ui-view.js` (`renderBanner`), `web/index.html`
  (footer button), `web/ui-text.js`, `web/ui-actions.js` (ACT `report`)
- Test: `test/ui-text.test.mjs`, `test/settings.test.mjs`, `test/xss.test.mjs`

**Interfaces:**
- Produces: `conflictsFor(settings, program, startYear) -> string[]`; `reportMailto(email, ctx) -> string` where
  `ctx = { program, startYear, semester, group?, page }`.

- [ ] **Step 1: Write the failing tests:** `conflictsFor` returns only texts whose `cohorts` include the start year, `[]` for an unknown program;
  settings.json has at least one conflict for each of programs 22, 20, 32, 12, 11, 112, 19 (one per section-21 bullet that names a program);
  `reportMailto('a@b', ctx)` starts `mailto:a@b?subject=`, decodes back to subject `דיווח על טעות במערכת השעות` and a body with every ctx field,
  and is under 1800 characters; a hostile `notice` is escaped in the banner.
- [ ] **Step 2: Run** the three files — FAIL.
- [ ] **Step 3: Implement.** Step 1, under the profile: for each conflict `<p class="hint warn-text">יש סתירה בין המקורות הרשמיים: <text>. בדקו מול המחלקה.</p>`.
  renderBanner first: when `app.settings.notice`, `<div class="banner err" role="alert">` with it, no close button. Footer and the popover:
  `דיווח על טעות` (link with the mailto href), only when `supportEmail` is set; the popover fills `group`.
- [ ] **Step 4: Run** tests — PASS. Browser: a local notice shows on every step; the report link opens the mail app with the fields.
- [ ] **Step 5: Commit** `feat(ui): conflict warnings, remote notice, report a mistake`.

### Task 9: "מה הכלי בודק ומה לא" (#18) and docs

**Files:**
- Modify: `web/legal.html` (new `<h2 id="scope">`, after `#terms`), `docs/ARCHITECTURE.md` (settings.json, new modules), `docs/README.md` if it lists web files

- [ ] **Step 1:** Write the section: `הכלי בודק` list (overlaps; prerequisites as the yedion lists them; the regulation sections from
  docs/ARCHITECTURE.md "ליבת הלוגיקה", each with its number) and `הכלי לא בודק` list (live seats beyond "נכון לשעה"; personal approvals;
  exemptions missing from the grade sheet; English level; anything the yedion does not publish; split lecture/tutorial approval).
- [ ] **Step 2:** Check that every regulation number in the section appears in docs/ARCHITECTURE.md and the reverse.
- [ ] **Step 3: Run** `npm test` — all pass. Browser: legal.html#scope opens at the section at 320.
- [ ] **Step 4: Commit** `docs(legal): what the tool checks and what it does not`. Then ask the owner to review the branch; merge and push on OK;
  close #12-#21 with the merge commit.
