# Trust Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Check the student's record, the data and the solver on every real program, and fix the 19 review findings (J1-J19), each proven by a test that failed first.

**Architecture:** One requirement test (`reqMet` in web/rules.js) used by `classify`, the new record warnings and the solver path; small fixes in the files each finding names; a read-only `scripts/check-real.mjs` with its own independent requirement oracle runs the data rules and the solver/state checks over all of `web/data/afeka`, with a 3-program sample in `npm test`.

**Tech Stack:** Plain ES modules (web/), `node --test`, node-html-parser fake DOM (test/xss.test.mjs), no build, no new dependency.

**Spec:** docs/superpowers/specs/2026-10-23-trust-checks-design.md

## Global Constraints

- Branch `claude/trust-checks` from main; merge only after the owner's OK.
- Do not touch `scripts/scrape.mjs` or `ci/gitlab-scrape.yml`; no request to Afeka's sites; `docs/meeting/` is never committed.
- web/ lines at most 160 characters (test/line-length.test.mjs).
- Every text on screen is true today and soft in tone ("שים לב ... אם ..."); every new rendered text joins `test/xss.test.mjs`.
- UI changes checked in the browser at 375 px and desktop, no horizontal scroll.
- `npm test` stays under its current time plus 20 seconds; the full run is `npm run check:real` (target under 10 minutes).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- A save from before this change (no `outsideDone`, old `blockedBy` nowhere persisted): loads with `outsideDone: []`, nothing lost (Task 1).
- 6001's two outside names differ by one character: ticking one leaves the course blocked and the other box still shown (Task 3).
- Summer on, off, on again: completed credits and the "פחות מ-70%" probation warning stay exactly as in year scope (Task 8).
- A program without specializations (19-2026) or a student who chose none: every row has `missingMandatory: []`, checklist unchanged (Task 9).
- A long outside name at 320 px wraps inside the card, no horizontal scroll, the checkbox stays tappable (Task 3 browser step).

---

## File map

- `web/rules.js`: `reqMet`, `outsideDone` in `classify`, `blockedBy` as groups, `recordWarnings`, `setStatus` grade cleanup.
- `web/app.js`: `outsideDone` and dedupe in `normalize`; year migration; summer classification split.
- `web/share.js`: backup keeps every persisted field.
- `web/ui-me.js`, `web/ui-actions.js`: outside checkbox, record warnings, grade handler refresh, import apply.
- `web/grade-import.js`: failed-before and exemption changes.
- `web/map-layout.js`: specialization mandatory courses.
- `web/solver-core.js`: year ranking by total credits; semester ב diagnosis.
- `web/advisor.js`: `res.missing`.
- `web/state-schema.js` (new): the persisted-field list shared by `normalize` and backup links.
- `web/ui-grid.js`, `web/ics.js`, `scripts/check-export.mjs`, `scripts/readme-shots.mjs`: J15-J19.
- Create `scripts/check-real.mjs`, `test/check-real.test.mjs`, `test/readme-shots.test.mjs`, `test/fixtures/solver-data.mjs` (generator
  moved out of test/solver-props.test.mjs); `package.json` script `check:real`.

---

### Task 1: One requirement test with outside alternatives (J3, rules part)

**Files:**
- Modify: `web/rules.js:105-118` (classify's `satisfied`), `web/rules.js:225-241` (`withAfterA`'s `settled`),
  `web/solver-core.js:721-734` (seeding's `settled` / open requirements) and `:831-834` ("assumes you pass" warnings), `web/app.js` (DEFAULT,
  normalize), `web/share.js:124-150` (rebuilt)
- Test: `test/rules.test.mjs`, `test/app.test.mjs`, `test/share.test.mjs`, `test/solver.test.mjs`
- Test helpers: if `test/rules.test.mjs` has no `real(path)` helper, add
  `const real = (p) => JSON.parse(readFileSync(new URL('../web/data/afeka/' + p, import.meta.url), 'utf8'));` and import the new exports.
  Import `normalize`, `backupLink`, `readHash` at module scope in `test/share.test.mjs` (today `normalize` is local to two tests).

**Interfaces:**
- Produces: `export function reqMet(p, { passed: Set<string>, exempt: Set<string>, outside: Set<string> }): boolean` in web/rules.js. True when
  any alternative `a` has `a.id && (passed.has(a.id) || exempt.has(a.id))`, or `a.id === null && outside.has(a.name)`, or every alternative
  has `id === null` (all-outside stays assumed met). `classify` uses it for both `קדם` and `מקביל`.
- Produces: `state.outsideDone: string[]` (DEFAULT `[]`, normalized with `strs(raw.outsideDone, 200, 120) ?? []`, in backup links). Not in
  `PERSONAL` (app.js:492): stashed per program like `passed`.

- [ ] **Step 1: Write the failing tests**

```js
// test/rules.test.mjs
test('reqMet: an outside alternative counts once its name is in outsideDone; all-outside stays met', () => {
  const p = { kind: 'קדם', anyOf: [{ id: '6000', name: 'מכינה' }, { id: null, name: 'מכינה בדרך לאפקה' }] };
  const ctx = (o = []) => ({ passed: new Set(), exempt: new Set(), outside: new Set(o) });
  assert.equal(reqMet(p, ctx()), false);
  assert.equal(reqMet(p, ctx(['מכינה בדרך לאפקה'])), true);
  assert.equal(reqMet({ kind: 'קדם', anyOf: [{ id: null, name: 'x' }] }, ctx()), true);
});
test('classify: 6001 in 10-2024 is blocked, and available once both outside alternatives are ticked', () => {
  const d = real('2027-1/10-2024.json');
  const s = { passed: [], failed: {}, profile: { year: 1 }, outsideDone: [] };
  assert.equal(classify(d, s).statuses['6001'].status, 'blocked');
  s.outsideDone = ['אנגלית - מכינה בדרך לאפקה', 'אנגלית1 - מכינה בדרך לאפקה'];
  assert.equal(classify(d, s).statuses['6001'].status, 'available');
});
// test/share.test.mjs
test('backup link keeps outsideDone', async () => {
  const s = normalize({ v: 1, passed: [], outsideDone: ['x'] });
  assert.deepEqual(normalize((await readHash(await backupLink('', s), s)).payload).outsideDone, ['x']);
});
// test/app.test.mjs
test('a save without outsideDone loads with []', () => assert.deepEqual(normalize({ v: 1, passed: ['A'] }).outsideDone, []));
```

- [ ] **Step 2: Run** `node --test test/rules.test.mjs test/share.test.mjs` — Expected: FAIL (`reqMet` not exported; outsideDone lost).
  Plus (solver.test.mjs): a ב course whose requirement is "6000 or <outside name>", with the outside name in `outsideDone`: the year plan
  carries no "assumes you pass 6000" warning; the existing in-program and all-outside cases keep passing.
- [ ] **Step 3: Implement** `reqMet`, use it in `classify` (`state.outsideDone ?? []`), in `withAfterA` and in the two solver-core.js
  requirement checks (same context: passed, exempt, outsideDone); add the field to DEFAULT, `normalize`, share.js `rebuilt`.
- [ ] **Step 4: Run** `node --test test/rules.test.mjs test/share.test.mjs test/app.test.mjs test/solver.test.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Prerequisites: an outside-program alternative can be marked done (J3)"`

### Task 2: Blocked reasons keep every alternative (J8)

**Files:**
- Modify: `web/rules.js:142-179` (blockedBy, chain, reasons), `web/app.js:384-390` (`waitingOnEarlier`)
- Test: `test/rules.test.mjs`, `test/app.test.mjs`, `test/rules-after-a.test.mjs`, `test/program-switch.test.mjs` (its `waitingOnEarlier`
  fixtures at :342-356 use flat `blockedBy: ['a']`: change them to nested groups and add an earlier-year prerequisite as a group's second
  alternative)

**Interfaces:**
- Consumes: `reqMet` (Task 1).
- Produces: `statuses[id].blockedBy: string[][]` — one array per unmet `קדם` requirement, its in-program ids in data order (an all-outside
  requirement is never unmet). Reason per requirement: `חסום: דורש ${ids.map((id) => chain(id)).join(' או ')} (תקנון 7.4)` — never
  `ids.map(chain)` (map's index would become `chain`'s `seen`); each alternative branch gets its own `seen` Set. Identical rendered reasons
  still collapse to one (the existing duplicate-reason test at rules.test.mjs:113 stays), while `blockedBy` keeps every group.
  `waitingOnEarlier` tests `s.blockedBy.some((g) => g.some((p) => earlier.has(p)))`.

- [ ] **Step 1: Failing test**

```js
test('a blocked course with alternatives names them all, in any order', () => {
  const d = real('2027-1/10-2024.json');
  const r = classify(d, { passed: [], failed: {}, profile: { year: 1 } }).statuses['10243'];
  assert.deepEqual(r.blockedBy, [['10224', '10240']]);
  assert.match(r.reasons[0], /מבוא לראייה ממוחשבת או רשתות נוירונים ולמידה עמוקה/);
});
```

- [ ] **Step 2: Run** `node --test test/rules.test.mjs` — Expected: FAIL (`blockedBy` is `['10224']`).
- [ ] **Step 3: Implement** groups in `classify`, `chain` over a group, `waitingOnEarlier`; grep `blockedBy` in web/ and test/ and update every use.
  Plus: an OR group whose first alternative is itself blocked renders its chain without crashing.
- [ ] **Step 4: Run** `node --test test/rules.test.mjs test/app.test.mjs test/rules-after-a.test.mjs test/program-switch.test.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Blocked courses name every alternative prerequisite (J8)"`

### Task 3: Record warnings and the outside checkbox on #me (J1, J3 UI, layer 1)

**Files:**
- Modify: `web/rules.js` (new export), `web/ui-me.js` `chip()` (around :38-64), `web/ui-actions.js` CHG
- Test: `test/rules.test.mjs`, `test/xss.test.mjs`

**Interfaces:**
- Consumes: `reqMet` (Task 1).
- Produces: `export function recordWarnings(data, state): Record<string, string[]>` — for each course in `passed` (not in `state.exempt`, not
  in `amirnetExempt(state.profile?.amirnet)`) or in `failed` and not passed:
  - unmet `קדם`, the requirement's in-program alternative failed: `שים לב: ${names} הוא קדם, וסומן שנכשלת בו. אם קיבלת אישור חריג, אפשר להשאיר.`
  - unmet `קדם` otherwise: `שים לב: ${names} הוא קדם, ולא סומן שעברת אותו. אם קיבלת אישור חריג, אפשר להשאיר.`
  - unmet `מקביל` whose alternatives are neither passed nor failed: `שים לב: ${names} הוא קורס מקביל, ולא סומן שלקחת אותו. אם קיבלת אישור חריג, אפשר להשאיר.`
  - `names`: the requirement's alternative names joined by ' או '.
- Produces: `CHG.outsideDone(el)`: `el.dataset.name`, `el.checked`; adds or removes the name in `app.state.outsideDone`; returns undefined (full refresh).
- UI: a course row renders `recordWarnings(...)[id]` as `<p class="hint warn">` under the row; a `blocked` course renders, for each unmet
  requirement with an outside alternative, `<label class="check"><input type="checkbox" data-chg="outsideDone" data-name="${esc(name)}"> עשיתי את ${esc(name)}</label>`.
  A retake whose prerequisite is unmet also gets the warning in its `reasons` (classify), so the plan shows it.

- [ ] **Step 1: Failing tests** (rules): mini() with A failed and B passed gives the "וסומן שנכשלת בו" text for B; A none and B passed gives
  "ולא סומן שעברת אותו"; P passed with Q none gives the corequisite text, with Q failed gives none; B in `state.exempt` gives none; 10336
  failed in 30-2026 without 90905 gives the text and stays `retake`. (xss): the warning and the outside label are rendered escaped; render
  #me and assert both of 6001's outside controls exist; call the real `CHG.outsideDone` and refresh: after the first name
  `app.cls.statuses['6001'].status === 'blocked'` and the second control is still rendered; after the second, `'available'`. (`chip()` does
  not render reasons; the "חסום" reason lives in the side list, ui-side.js:147-149 — inspect that render if testing the reason.)
- [ ] **Step 2: Run** `node --test test/rules.test.mjs test/xss.test.mjs` — Expected: FAIL (`recordWarnings` not exported).
- [ ] **Step 3: Implement** `recordWarnings`, the retake reason, `chip()` rendering, `CHG.outsideDone`.
- [ ] **Step 4: Run** the same — Expected: PASS. Then browser: #me at 375, 320 px and desktop, 10-2024 cohort, tick the 6001 boxes, no
  horizontal scroll, long names wrap.
- [ ] **Step 5: Commit** `git commit -m "Me page: soft warning on an impossible record; outside alternative checkbox (J1, J3)"`

### Task 4: Grade import keeps failures and exemption changes (J2, J12)

**Files:**
- Modify: `web/grade-import.js:69-97`, `web/ui-me.js:345-351` (apply loop)
- Test: `test/grade-import.test.mjs`

**Interfaces:**
- Produces: `parseGradeSheet` result rows gain `failedBefore: true` when the course has a `failed` row and the kept row is `passed`.
- Produces: `gradeChanges` includes a row when `r.failedBefore && !state.failed[r.id]`, and when the course is in `state.exempt` and the sheet
  result is a graded `passed` (the row's `to` is `passed`, label shows the exemption removal).
- Produces: `export function applyGradeChanges(state, rows)` in web/grade-import.js: the apply loop moved out of ui-me.js:345-350 (which
  now calls it): `setStatus`, grade, exemption rewrite as today, plus `state.failed[r.id] ||= 1` for `failedBefore` (never lowers a count).

- [ ] **Step 1: Failing tests** (normalized states throughout): rows 40* then 80 give `[{ id, grade: 80, result: 'passed', failedBefore: true }]`,
  in both row orders; an already-passed course with grade 80 and no failures plus that row gives one change; `applyGradeChanges` adds
  `failed[id] = 1`; a reimport gives `[]`; existing counts 2 and 3 stay 2 and 3; a course in `exempt` with a graded pass row gives one change
  and applying it empties `exempt`; the exemption-removal label shows in the real dialog rows (xss).
- [ ] **Step 2: Run** `node --test test/grade-import.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** in `parseGradeSheet`, `gradeChanges`, the ui-me.js apply loop.
- [ ] **Step 4: Run** `node --test test/grade-import.test.mjs test/xss.test.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Grade import: a failure before a pass is kept, a graded pass replaces an exemption (J2, J12)"`

### Task 5: Small state fixes (J7, J13, J14)

**Files:**
- Modify: `web/ui-actions.js:466-480` (`CHG.grade`), `web/rules.js:247-253` (`setStatus`), `web/app.js:143` (`passed` in normalize), `web/rules.js:290-299`
- Test: `test/rules.test.mjs`, `test/app.test.mjs`, `test/xss.test.mjs`

**Interfaces:**
- `renderMe()` renders an always-present `<div id="recordRegWarnings">` where the regulation warnings go today (ui-me.js:298); new export
  `renderRecordRegWarnings()` fills it. `CHG.grade` sets only `app.cls.warnings = classify(app.data, app.state).warnings` (statuses and
  `withAfterA` untouched), calls `renderRecordRegWarnings()` and the average line, returns `'save'`; never `refresh()` (it schedules a search).
- `setStatus(state, id, 'none')` also deletes `state.grades[id]` when `state.grades` exists (minimal states without `grades`, as in
  rules.test.mjs:138 and :152, keep working).
- `normalize`: inside the existing `if (passed)` branch, `out.passed = [...new Set(passed)]` (the `null` default for `ensurePassed()` stays);
  `gradeAverage` iterates `new Set(state.passed)`.

- [ ] **Step 1: Failing tests**: (xss) the real `CHG.grade` with 60 then 90 on a 1-course record: `#recordRegWarnings` gains then loses
  "מתחת ל-65", the input node is the same object and keeps focus, no search was scheduled; (rules) none then passed leaves `grades`
  without the id; (app) `normalize({v:1, passed:['A','A']}).passed` is `['A']`; `gradeAverage` with `['A','A']` counts A once.
- [ ] **Step 2: Run** `node --test test/rules.test.mjs test/app.test.mjs test/xss.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** the three changes.
- [ ] **Step 4: Run** the same — Expected: PASS. Browser: type a grade on #me, the caret stays, the warning appears.
- [ ] **Step 5: Commit** `git commit -m "Grades: warnings follow an edited grade; clearing a course clears its grade; no duplicate passes (J7, J13, J14)"`

### Task 6: Backup links keep every persisted field (J10)

**Files:**
- Create: `web/state-schema.js` (no imports from app.js or share.js: no cycle)
- Modify: `web/share.js:124-150`, `web/app.js` (`normalize` reads the same list)
- Test: `test/share.test.mjs`

**Interfaces:**
- Produces: `export const PERSISTED` in web/state-schema.js: the persisted field names with their shape check kind (`'arr'`, `'obj'`,
  `'str'`, `'num'`, `'bool'`), the one list `readHash` uses to rebuild a backup (replacing its hand-written copies) and `normalize` uses to
  know which fields exist. Each field's value validation stays in `normalize` as today. New fields (`sortBy`, `yearIds`, `specDraft`,
  `retakeSeen`, `programSet`, `outsideDone`) are in it.

- [ ] **Step 1: Failing test**: for every `PERSISTED` field, a valid distinguishing value survives `backupLink -> readHash -> normalize`
  (same year); derived or version fields are excluded by an explicit list; a field with neither a fixture nor an exclusion fails the test.
  `programSet: true` tested alone with the default program and `profile.year: null` (so inference cannot hide its loss).
- [ ] **Step 2: Run** `node --test test/share.test.mjs` — Expected: FAIL listing `sortBy, yearIds, specDraft, retakeSeen, programSet`.
- [ ] **Step 3: Implement** `state-schema.js`, `readHash` from the list, `normalize` reading it.
- [ ] **Step 4: Run** `node --test test/share.test.mjs test/app.test.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Backup links keep every saved field (J10)"`

### Task 7: Year migration for local saves (J9)

**Files:**
- Modify: `web/app.js` (new helper, call at the end of `normalize`, about :212), `web/share.js:149-154` (remove the migration block)
- Test: `test/app.test.mjs`, `test/share.test.mjs:230` (move the migration assertions to the normalized restore)

**Interfaces:**
- Produces: `export function migrateYear(state, fromYear, toYear)` in web/app.js, pure, on a normalized state. When
  `typeof fromYear === 'number' && fromYear < toYear`: clear `pins`, `friends`, `semesterOf`, `yearIds`, `retakeSeen`; advance a non-null
  `profile.year` with `cleanProfile({ year: Math.min(5, year + toYear - fromYear) }).year`. Otherwise return the state unchanged.
- `normalize(raw, catalog)` returns `migrateYear(out, raw?.year, out.year)`. `load()` (:223), the stash restore in `switchTo` (:530) and
  `restoreBackup` (:597) all go through it; `readHash` keeps its old/future-year acceptance rules and no longer migrates (no double advance).
  The explicit study-year override at :541 stays.

- [ ] **Step 1: Failing test**: an old state `{ v: 1, program: 30, startYear: 2026, passed: [], year: 2026, profile: { year: 2 }, pins: ['g'],
  friends: [...], yearIds: ['A'] }` (without `v: 1` and a valid program `normalize` returns defaults, app.js:131) normalized with
  a catalog of year 2027 gives study year 3 and empty `pins`, `friends`, `yearIds`; the same state through `backupLink -> readHash -> normalize`
  gives the same result; study years null/1/4/5 and a two-year jump match today's backup results (5 stays 5, null stays null).
- [ ] **Step 2: Run** `node --test test/app.test.mjs test/share.test.mjs` — Expected: FAIL (local keeps study year 2).
- [ ] **Step 3: Implement** `migrateYear`, the call in `normalize`, remove the block in `readHash`, move the share assertions.
- [ ] **Step 4: Run** `node --test test/app.test.mjs test/share.test.mjs test/program-switch.test.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "A new academic year moves local saves on like backup links (J9)"`

### Task 8: Summer assumptions stay out of the record (J6)

**Files:**
- Modify: `web/app.js:445-455` (`refresh`), `web/ui-common.js:143` (`status`, `doneIds`), `web/app.js:401` (`candidateMode`),
  `web/ui-search.js:95`, `web/ui-side.js:42,117-149`, `web/ui-view.js:288`
- Test: `test/app.test.mjs`, `test/ui-search.test.mjs`

**Interfaces:**
- Produces: `app.cls` is always the real record; `app.clsSummer` is the classification of `passed ∪ yearIds` in summer scope, else `null`.
- Produces: `export const planningCls = () => app.clsSummer ?? app.cls` (web/app.js);
  `status(id, cls = app.cls)` and `doneIds(cls = app.cls)` in web/ui-common.js.
- Planning (`planningCls()`): `candidateMode` (app.js:401), the search request statuses (ui-search.js:95), `card` and `renderSide`
  (ui-side.js:42, :117-149), the unlock count (ui-view.js:288).
- Real (`app.cls`): `waitingOnEarlier`, `checklist` and `renderMe` (ui-me.js:122, :214, :298), `ctxOf` (ui-map.js:83), `ACT.advisor`
  (ui-actions.js:243), `retakeNote` (ui-plan.js:49), readiness checks (ui-plan.js:32, :43, :61; ui-map.js:396), `chip` (ui-me.js:44).

- [ ] **Step 1: Failing test**: mini(), `passed: []`, `yearIds: ['A']`, summer on; after `refresh()` in year scope and in summer scope,
  `progressInfo(app.data, app.cls.statuses).done` is 0 both times and `app.cls.statuses.A.status` is `available`; in summer scope
  `planningCls().statuses.A.status` is `done` and the summer search request sends that planning status. Second case (A2): study year 2,
  the year-א list mostly unpassed, its courses in `yearIds`: the "פחות מ-70%" warning is in `app.cls.warnings` in both scopes, and after
  summer on → off → on.
- [ ] **Step 2: Run** `node --test test/app.test.mjs test/ui-search.test.mjs` — Expected: FAIL (summer `done` is 5).
- [ ] **Step 3: Implement** the split and switch each consumer listed above.
- [ ] **Step 4: Run** `npm test` — Expected: PASS. Browser: summer on, the "המצב שלי" checklist shows the same completed credits in both scopes.
- [ ] **Step 5: Commit** `git commit -m "Summer planning assumes the year plan without counting it as completed (J6)"`

### Task 9: Specialization mandatory courses in the degree checklist (J4)

**Files:**
- Modify: `web/map-layout.js:254-300` (`progressInfo`), `web/ui-me.js:122-130` (`checklist`)
- Test: `test/ui-map.test.mjs`, `test/xss.test.mjs`

**Interfaces:**
- Produces: every row of `progressInfo(data, st, plan, specs).rows` is
  `{ name: string, need: number, done: number, planned: number, missingMandatory: string[] }` (`[]` on rows other than the specialization);
  the specialization row's `missingMandatory` is `specLists(data, specs).mandatory` minus completed courses, computed apart from the
  clipped credit pool. Credit numbers do not change.
- `checklist` marks a row complete only when `r.done >= r.need && r.missingMandatory.length === 0`; otherwise, if credits are met, it adds
  `חסרים קורסי חובה בהתמחות: ${names}` (escaped names). `progressHtml` (map-render.js:260) uses totals only: unchanged.

- [ ] **Step 1: Failing test** "specialization is incomplete when elective credits meet the cap but mandatory courses are missing": 30-2026,
  specs `['solid','flow']`, only `specLists(...).elective` passed; the row has `done >= need` and
  `missingMandatory` deep-equals `['30227', '30235', '30249', '30204', '30213', '30313']`; the rendered checklist does not show it complete
  and names the six courses (xss). Also: 19-2026 with `specs: []` gives `missingMandatory: []` on every row.
- [ ] **Step 2: Run** `node --test test/ui-map.test.mjs test/xss.test.mjs` — Expected: FAIL (no `missingMandatory`).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same — Expected: PASS. Browser: #me checklist at 375 px.
- [ ] **Step 5: Commit** `git commit -m "Degree checklist: a specialization needs its mandatory courses, not only credits (J4)"`

### Task 10: Year plans ranked by year totals; semester ב diagnosis (J5)

**Files:**
- Modify: `web/solver-core.js`, `searchYear`: best-pair selection at :815, pair sorting at :819, final diagnosis at :820, pair metadata
  (`pairOf`) at :822-855
- Test: `test/solver.test.mjs`

**Interfaces:**
- Produces: `export function compareYearPlans(x, y, sortBy)` in solver-core.js (Task 15 uses it): for `'credits'`: fewer `missing` first, then larger
  `credits.a + credits.b`, then `score`; for `'unlocks'`: fewer `missing`, then more year unlocks (union of both semesters' newly unlocked
  courses, excluding courses taken anywhere in the year), then `score`; other keys: `score` as today. `searchYear` reads `state.sortBy`;
  its signature and `{ results, partial, diagnosis }` shape do not change. Single-semester `search` is untouched.
- When no pair exists and semester ב's search failed, `diagnosis` is that search rerun with `why: true` on ב's courses, each message
  prefixed `סמסטר ב׳: `; timeout uncertainty (`partial`) is kept.

- [ ] **Step 1: Failing tests**: (credits) H=10 and L=8 clash in א, H not in ב, L's ב group full, Q=5 only in ב, all optional,
  `sortBy: 'credits'`: the first result has 15 credits (H / Q); (unlocks) the same fixture with 4 descendants of H, 3 of L, 1 of Q, `sortBy:
  'unlocks'`: the first result unlocks 5; (diagnosis) א empty, ב's only course X has one full group: `diagnosis[0]` starts with `סמסטר ב׳:`
  and names X.
- [ ] **Step 2: Run** `node --test test/solver.test.mjs` — Expected: FAIL (13-credit plan first; 4 unlocks first; generic message).
- [ ] **Step 3: Implement** `compareYearPlans` for both the sort and `bestPair`, and the ב diagnosis.
- [ ] **Step 4: Run** `node --test test/solver.test.mjs test/solver-props.test.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Year plans: most credits and most unlocks count the whole year; semester ב says why it failed (J5)"`

Not in this task: the friends metric adds per-semester ratios (Astra's repro: same 600/660 shared year minutes scored 1.9 vs 1.5). Its
year definition is a product decision; it stays as is and is listed in the final report.

### Task 11: Advisor summary lists missing mandatory courses (J11)

**Files:**
- Modify: `web/advisor.js:72-77`
- Test: `test/advisor.test.mjs`

**Interfaces:**
- When `res && 'a' in res && res.missing?.length`, notes gain `קורסי חובה שביקשת ולא נכנסו לאף סמסטר: ${names}` (names via the existing
  `name()` helper), the same fact the year view shows (ui-view.js:198).

- [ ] **Step 1: Failing test**: mini(), `res = { a: { courses: ['A'], groups: ['A2'] }, b: null, missing: ['B'], warnings: [] }`, the html contains `דינמיקה`.
- [ ] **Step 2: Run** `node --test test/advisor.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `node --test test/advisor.test.mjs test/xss.test.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Advisor summary names mandatory courses missing from the year plan (J11)"`

### Task 12: Registration backups use whole valid options (J15)

**Files:**
- Modify: `web/ui-grid.js:149-170` (`backups`)
- Test: `test/ui-grid.test.mjs`

**Interfaces:**
- `backups(data, res, gid)` keeps its signature and `string[]` result (`'P2 + T2 + L2'`, at most 3). For a primary group: candidates come
  from `buildOptions(c, { pins: [g.id] })` (from solver-core.js), skipping `altGroups` entries with `ok: false`; an option is offered only if
  no group in it is full and its meetings do not overlap the rest of `res.groups` (other courses). Non-primary groups keep today's rule.

- [ ] **Step 1: Failing test**: current plan `P1 → T1 → L1`; alternative lecture `P2 → T2 → L2` with `L2.full = true`: `backups` does not
  offer P2; with `L2` free it offers `'P2 + T2 + L2'`.
- [ ] **Step 2: Run** `node --test test/ui-grid.test.mjs` — Expected: FAIL (offers `'P2 + T2'`).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `node --test test/ui-grid.test.mjs test/xss.test.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Registration backups offer whole options, never one with a full lab (J15)"`

### Task 13: Program switch race, ICS time zone, tooling (J16-J19)

**Files:**
- Modify: `web/app.js:517-521` (`switchTo`), `web/ics.js:75-100` (`toIcs`), `scripts/check-export.mjs:59` (`FIELDS.exam.time`),
  `scripts/readme-shots.mjs:149` (`DONE`)
- Test: `test/program-switch.test.mjs`, `test/ics.test.mjs`, `test/check-export.test.mjs`

**Interfaces:**
- `switchTo`: `const gen = ++switchGen;` before the early return for the current program (J16).
- `toIcs`: a `VTIMEZONE` block for `Asia/Jerusalem` (standard +0200, daylight +0300, Israel's rules: last Friday before the last Sunday of
  March 02:00, last Sunday of October 02:00); timed `DTSTART`, `DTEND` and `EXDATE` as `;TZID=Asia/Jerusalem:`; `UNTIL` in UTC with `Z`;
  all-day exams unchanged (J17).
- `FIELDS.exam.time`: accepts `null`; a string must match `^([01]\d|2[0-3]):[0-5]\d$` (J18).
- `DONE` gains `'afeka-sched-v1-terms': TERMS_VERSION` (value `'2'` today; import it from web/ui-common.js if the script can, else copy with a
  comment) (J19).

- [ ] **Step 1: Failing tests**: (switch) start on 30, `switchTo(10, y)` with a held fetch, then `switchTo(30, y)`, release the fetch: state
  stays program 30; (ics) a lesson's lines include `DTSTART;TZID=Asia/Jerusalem:` and the file has `BEGIN:VTIMEZONE`, `UNTIL=` ends in `Z`;
  (check-export) an exam with `time: null` passes, `time: '9:00'` fails; (J19, new `test/readme-shots.test.mjs`) read
  scripts/readme-shots.mjs as text (never import it: it runs Chrome) and assert it seeds `afeka-sched-v1-terms` with the current
  `TERMS_VERSION` from web/ui-common.js.
- [ ] **Step 2: Run** `node --test test/program-switch.test.mjs test/ics.test.mjs test/check-export.test.mjs test/readme-shots.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** the four changes.
- [ ] **Step 4: Run** the same — Expected: PASS. Import the ICS file into one calendar app and check a lesson's hour; `readme-shots` is
  not run here (it writes files): the owner runs it when updating the README.
- [ ] **Step 5: Commit** `git commit -m "Switch race, ICS time zone, exam time may be empty, shots pass the terms gate (J16-J19)"`

### Task 14: Data rules (layer 2)

**Files:**
- Create: `scripts/check-real.mjs` (data part), `test/check-real.test.mjs`
- Modify: `package.json` (`"check:real": "node scripts/check-real.mjs"`)

**Interfaces:**
- Produces: `export function dataRules(data, file): { errors: string[], warnings: string[] }` and
  `export function crossProgram(files: Array<[name, data]>): string[]` (warnings), `export function changedSinceHead(file, data): string[]`
  (warnings; empty when git or the file at HEAD is missing). CLI: walks `web/data/afeka/*/*.json` (skips catalog.json, status.json), prints
  errors then warnings with counts and time, exit 1 on any error.
- Errors: id with no course in the file; self requirement; list id missing from `courses`; non-numeric credits; offered without groups
  (its own check: `auditCohort` output also holds advisory findings, so it is not promoted to errors); an unachievable course, computed as a
  least fixed point: start from nothing, repeatedly admit a course whose every `קדם` requirement (AND) has an achievable alternative (OR) —
  an admitted in-program course or an outside one; for a course in mandatory year Y, an alternative counts only if it is not listed only in
  a later year's mandatory list (unknown placement is not proof). Courses never admitted are errors. Not ordinary cycle reachability.
- Warnings: repeated id inside one requirement; cross-program differences; changes since HEAD.

- [ ] **Step 1: Failing tests** on synthetic data: a dangling id, a self link; `A→B`, `B→A` (both errors) vs `A→B`, `B→A or C`, C free (no
  error); a downstream cycle `A→B`, `B→C`, `C→B` (A, B, C errors); a nested escape alternative; two AND requirements one unachievable (error);
  a later-year-only alternative with and without an earlier escape; a repeated alternative is a warning, not an error; and the 3 sample files
  (`2027-1/19-2026.json`, `2027-1/20-2026.json`, `2027-1/30-2026.json`) give `errors: []`.
- [ ] **Step 2: Run** `node --test test/check-real.test.mjs` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `dataRules`, `crossProgram`, `changedSinceHead`, the CLI part.
- [ ] **Step 4: Run** `node --test test/check-real.test.mjs` and `npm run check:real` — Expected: PASS; CLI exit 0 with about 2,853
  repeated-alternative warnings and 57 cross-program warnings.
- [ ] **Step 5: Commit** `git commit -m "check:real: data rules over every program"`

### Task 15: Solver and state checks on real data (layer 3)

**Files:**
- Modify: `scripts/check-real.mjs` (solver part), `test/check-real.test.mjs`

**Interfaces:**
- Produces: `export function oracle(data, state): Record<string, 'done'|'exempt'|'notOffered'|'retake'|'blocked'|'conditional'|'available'>`
  — written from the spec, not from `classify` (own requirement test, same precedence).
- Produces: `export function scenarios(data, seed): Array<{ name: 'S1'|'S2'|'S3', state }>`. S1: nothing passed. S2: the mandatory courses
  of the years before the cohort's study year passed (clamped to the program's year lists). S3: up to three copies of S2, each failing one
  distinct mandatory course of the study year, chosen deterministically by the printed seed. Every other state field set explicitly.
- Produces: `export function checkPlan(data, state, plan, constraints): string[]` — overlap; first attempts meet every hard prerequisite by
  the oracle; a failed, offered, unpassed course is an eligible retake even with an unmet prerequisite (check its record warning instead);
  every course, retake included, has its corequisites through the record or the same semester; busy time; credit sum.
- Produces: `export function checkYearPlan({ dataA, dataB, state, plan, constraints }): string[]` — A against the record, B against the
  record plus A's courses, same-semester corequisites, no course twice, both reported credit totals; plans ordered by Task 10's
  `compareYearPlans` for 'credits' and 'unlocks'.
- Produces: `export function metamorphic(data, state): string[]` — busy time over a best-plan meeting gives a plan avoiding it or no plan;
  shuffled course/group order: canonical timetable equivalence (interchangeable groups via `alts`, not raw representative ids), full
  plan-set equality only for bounded exhaustive cases with enough topK and `partial === false`, feasibility only otherwise; relaxing a
  constraint keeps a plan; adding a pass never blocks. No production tie-breaking change to satisfy it.
- No plan: relaxing the diagnosis's named constraints together gives a plan, or the diagnosis says it could not tell; cases for a ב-only
  failure and a timeout.
- CLI: single-semester checks for every file of 2027-1 and 2027-2 (2027-3 summer when present), year checks for every matching A/B cohort
  pair, × scenarios; prints file, scenario, seed and ids per failure.
- Sample in `test/check-real.test.mjs`: 19-2026, 20-2026, 30-2026, semester א, S1, `classify` vs `oracle` + `checkPlan` + metamorphic, under 20 s.
  Synthetic cases cover exemption and `outsideDone` contexts the scenarios do not.
- Small cases: move the generator from test/solver-props.test.mjs into `test/fixtures/solver-data.mjs` (no test registered on import), add
  an optional size config keeping today's defaults and seeds, import it from both; bounded small configs, brute force over every feasible
  combination, compare the best score (single semester).

- [ ] **Step 1: Failing tests**: `oracle` on mini() equals the statuses listed in the fixture's comment; `checkPlan` flags a hand-made plan
  with an overlap, with a busy-time meeting and with a missing corequisite, accepts a retake with an unmet prerequisite and rejects a retake
  with a missing corequisite; sample run returns no failures.
- [ ] **Step 2: Run** `node --test test/check-real.test.mjs` — Expected: FAIL (exports missing).
- [ ] **Step 3: Implement**; run `npm run check:real` and record each real failure as its own task below this one (with its repro), unless
  it is one of J1-J19 already fixed.
- [ ] **Step 4: Run** `node --test test/check-real.test.mjs` and `npm run check:real` — Expected: PASS, exit 0, time printed.
- [ ] **Step 5: Commit** `git commit -m "check:real: solver and state checks on every program"`

### Task 16: Final verification and merge

- [ ] `npm test` — all pass. `npm run test:browser` — all pass. `npm run check:real` — exit 0, time under 10 minutes.
- [ ] Browser at 375 px and desktop: #me (warnings, outside checkbox, grade edit), year view sorted by credits, summer on/off checklist.
- [ ] Document `npm run check:real` and when to run it in the repository's README (development section).
- [ ] Report the results and list, unchanged in this work: the partial-scrape freshness issue, the dropped tutorial/link in build.mjs, the
  undefined annual friends score, and the real grade sheet needed before counting attempts.
- [ ] Update memory `solver-audit-2026-10.md` with the new check command; merge to main only after the owner's OK.
