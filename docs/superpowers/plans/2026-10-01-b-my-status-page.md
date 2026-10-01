# "המצב שלי" page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move everything personal (study year, Amirnet, passed/failed per course, grades, progress, the map button) out of the timetable builder into its own full page "המצב שלי". The builder only reads that state.

**Architecture:** Two views in the same `index.html`, switched by `location.hash`. `#me` shows the status page; anything else shows the builder. Friend and backup links (`#f=`, `#b=`) keep working, because `readHash` already returns `null` for any other hash. `renderWelcome` becomes `renderMe`, which renders into a new `<main id="me">`. The small capped `#welcome` panel inside the board is removed.

**Tech Stack:** plain ES modules, `node --test`, no new dependencies.

**Spec:** user bug map item 1 in `.superpowers/next-session.md`; ISSUES §16 (grades).

## Global Constraints
- State shape stays backward compatible: old saved state loads unchanged. A new field `grades` is optional.
- Hebrew, RTL, 44px targets, visible labels, keyboard usable, focus moves to the page heading on view change.
- Every rendered string goes through `esc()`.
- The design pass uses ui-ux-pro-max (`"settings profile page form" --domain ux`, `"progress summary dashboard" --domain ux`) and the existing tokens in `web/index.html :root` (`--primary`, `--surface`, `--border`, `--radius-lg`, `--fs-sm`, …). No new palette.

## Review Focus
- Opening a friend link while on `#me`: the friend link still lands (`readHash` runs on `#f=` and is not confused by the route).
- Back/forward buttons switch views without losing unsaved input. Inputs save on `change` already.
- First visit (not onboarded) opens `#me`. "סיימתי" goes to the builder and marks onboarded.
- Phone 375px: the status page scrolls normally. No more `max-height` cap.
- A grade outside 0–100 or not a number is dropped on load.

---

### Task 1: Route helper + hash listener

**Files:**
- Modify: `web/app.js` (export `routeOf`)
- Modify: `web/ui-plan.js` (listener + view switch in `renderAll`)
- Test: `test/app.test.mjs`, `test/share.test.mjs`

**Interfaces:** Produces `routeOf(hash: string): 'me' | 'plan'`.

- [ ] **Step 1: Failing tests**

```js
// test/app.test.mjs
import { routeOf } from '../web/app.js';
test('routeOf: #me is the status page, everything else is the builder', () => {
  assert.equal(routeOf('#me'), 'me');
  for (const h of ['', '#', '#f=abc', '#b=abc', '#mex']) assert.equal(routeOf(h), 'plan');
});
// test/share.test.mjs
test('readHash ignores the #me route', async () => {
  assert.equal(await readHash('#me', { year: 2027, semester: 'א' }), null);
});
```

- [ ] **Step 2: Run** `npm test`. Expect FAIL: `routeOf` is not exported. The readHash test should already PASS. That is fine: it pins existing behaviour.
- [ ] **Step 3: Implement** in `web/app.js`: `export const routeOf = (h) => (h === '#me' ? 'me' : 'plan');`. In `init()`, the line `if (h) history.replaceState(...)` stays as it is (`h` is null for `#me`).
- [ ] **Step 4:** in `web/ui-plan.js`:
  - add `addEventListener('hashchange', onHash)`, where `onHash` runs `renderAll(); focusView();` for the route;
  - also fix debug report item 4 / ISSUES §17b here: extract the `readHash` block from `init()` in `web/app.js` into `export async function applyHash()`, which handles `#f=` (friend landing) and `#b=` (backup confirm), then calls `refresh()`. `init()` calls it, and so does `onHash` when `location.hash` starts with `#f=` or `#b=`. Add a test in `test/app.test.mjs` that `routeOf('#f=x')` is `'plan'`, so a pasted friend link lands on the builder;
  - in `renderAll` set `$('me').hidden = routeOf(location.hash) !== 'me'` and `$('layout').hidden = !$('me').hidden`, where `layout` is the id given to the existing builder wrapper in Task 2;
  - `focusView` focuses `#meTitle` or `#weekTitle`.
- [ ] **Step 5:** `npm test` → PASS. Commit `feat(nav): #me route for the status page`.

### Task 2: Move the status UI into its own page

**Files:** `web/index.html`, `web/ui-plan.js`

- [ ] **Step 1: Markup.**
  - In `index.html` add a top nav inside the header: `<nav class="views" aria-label="מסכים"><a href="#me" data-view="me">המצב שלי</a><a href="#" data-view="plan">בניית מערכת</a></nav>`.
  - `renderTop` sets `aria-current="page"` on the active link.
  - Wrap the existing builder area (`#banner` … `#side`) in `<div id="layout">` if no wrapper with an id exists. Add `<main id="me" class="me" aria-labelledby="meTitle" hidden></main>` beside it.
  - Delete `<section id="welcome">` and the `.welcome` CSS rules (lines ~105–124, 360, 408–430).
- [ ] **Step 2: Rename `renderWelcome` to `renderMe`** and render into `$('me')`:
  - The heading is `<h1 id="meTitle" tabindex="-1">המצב שלי</h1>`.
  - Remove the `statusOpen` variable and the inner scroll container (`.wel-body`, `keep` scrollTop).
  - Section order:
    1. פרופיל: year and Amirnet;
    2. progress bar plus "הראה התקדמות";
    3. warnings;
    4. year lists with chips;
    5. a closing button bar: `<a class="btn primary" href="#">${icon('check')} סיימתי, לבניית המערכת</a>`.
  - Clicking that button runs `localStorage.setItem(ONBOARDED, '1')` through the existing ACT `statusDone`, which becomes `location.hash = ''`.
- [ ] **Step 3: Replace the openers.**
  - `ACT.openStatus` becomes `location.hash = '#me'`.
  - First visit: in `renderAll`, if `!onboarded() && !location.hash` set `location.hash = '#me'`, once per load.
- [ ] **Step 4: Design pass** (ui-ux-pro-max queries listed above). Desktop uses two columns: profile and progress on the right (sticky), lists on the left. Phone uses one column.
- [ ] **Step 5:** `npm test`, then a Chrome check at 375/1024/1440:
  - nav switches views;
  - back button works;
  - a friend link opened while on `#me` lands;
  - no horizontal scroll.
- [ ] **Step 6:** Commit `feat(ui): status page separate from the builder`.

### Task 3: Grades (ISSUES §16)

**Files:** `web/app.js` (`normalize`), `web/rules.js` (`gradeAverage`), `web/ui-plan.js` (input per passed course), tests.

**Interfaces:** Produces `state.grades: { [courseId]: number }` (0–100 integers) and `gradeAverage(data, state): { avg: number|null, credits: number }`, an average weighted by credits over passed courses that have a grade.

- [ ] **Step 1: Failing tests**

```js
// test/app.test.mjs
test('normalize keeps integer grades 0-100 and drops the rest', () => {
  const s = normalize({ grades: { a: 90, b: 101, c: '80', d: -1, e: 55.5 } });
  assert.deepEqual(s.grades, { a: 90 });
});
// test/rules.test.mjs
import { gradeAverage } from '../web/rules.js';
test('gradeAverage weights by credits and ignores ungraded or not-passed courses', () => {
  const data = { courses: { a: { credits: 4 }, b: { credits: 2 }, c: { credits: 3 } } };
  const r = gradeAverage(data, { passed: ['a', 'b'], grades: { a: 90, b: 60, c: 100 } });
  assert.equal(r.avg, 80); assert.equal(r.credits, 6);
  assert.equal(gradeAverage(data, { passed: [], grades: {} }).avg, null);
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** In `normalize`, add `grades` to the cleaned state: `Object.fromEntries(Object.entries(isObj(raw.grades) ? raw.grades : {}).filter(([k, v]) => k.length <= 20 && Number.isInteger(v) && v >= 0 && v <= 100).slice(0, 200))`. Write `gradeAverage` in `rules.js`.
- [ ] **Step 4: UI.**
  - Each chip of a passed course gets a small `<input type="number" min="0" max="100" inputmode="numeric" aria-label="ציון ב<name>" data-chg="grade" data-cid="…">`.
  - CHG `grade` stores or deletes the value and returns `'quiet'`.
  - The progress section shows `ממוצע: <b>X</b> (על Y נ״ז)` when `avg !== null`.
- [ ] **Step 5:** `npm test` → PASS. Commit `feat(status): grades and weighted average`.
