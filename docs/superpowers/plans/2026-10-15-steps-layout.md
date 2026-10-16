# ארבעה שלבים ו"הצג לפי": תוכנית מימוש

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** דף הבנייה הופך לארבעה שלבים ממוספרים (המצב שלי ← קורסים ← מה חשוב לי ← מערכות), ובשלב 4 נוסף בורר "הצג לפי" שמריץ חיפוש חדש לפי קריטריון.

**Architecture:** כל שלב הוא מסך לפי ה-hash (`#me`, `#courses`, `#prefs`, ריק). הרנדרים הקיימים (`renderSide`, `prefsPanel`, `friendsPanel`) מציירים לתוך מסכים חדשים במקום ל-aside ולמגירה. "הצג לפי" הוא שכבת משקלים (`PRIMARY` על מדד אחד) שמחושבת לפני שליחה ל-worker, ולכן `search` ו-`searchYear` לא מקבלים פרמטר חדש. הם רק מכירים שני מדדים חדשים, `credits` ו-`unlocks`, עם חסם לכל אחד.

**Tech Stack:** JS רגיל (ES modules, בלי build), `node --test`, `node-html-parser` בבדיקת ה-XSS.

**Spec:** `docs/superpowers/specs/2026-10-15-steps-layout-design.md`

## Global Constraints

- ענף `feat/steps`. מיזוג ל-`main` רק אחרי שהבעלים ראה את האתר בפעולה. **לא לפני הפגישה ב-2026-10-18.**
- `PRIMARY = 1e5`.
- `state.sortBy ∈ { 'best', 'credits', 'friends', 'unlocks' }`, ברירת מחדל `'best'`. לא עובר בקישור חבר.
- התוויות בבורר, בדיוק כך: "מומלץ", "הכי הרבה נ״ז", "הכי הרבה עם חברים", "פותחת הכי הרבה קורסי המשך". תווית הבורר: "הצג לפי".
- שמות השלבים: "המצב שלי", "קורסים", "מה חשוב לי", "מערכות". כפתורי "הבא": "הבא: קורסים", "הבא: מה חשוב לי", "הבא: מערכות".
- כל טקסט מנתונים עובר דרך `esc()`. אין שורה ב-`web/` מעל 200 תווים (`test/line-length.test.mjs`).
- טלפון: 375 ו-320 בלי גלילה אופקית. `prefers-reduced-motion` מכבה את מעבר ה-fade.
- הטסט המלא (`npm test`) ירוק לפני כל commit של משימה. במהלך העבודה מריצים רק את הקובץ הרלוונטי.

## Review Focus

1. **שמירה ישנה בלי `sortBy`, או עם ערך עוין** (`'__proto__'`, `5`, `'credits '`): נטען כ-`'best'`. מוצמד במשימה 2.
2. **תכנון שנה מלאה עם קריטריון:** `PRIMARY` מגמד את `MISSING_W = 5`, ולכן זוג שמשמיט קורס חובה יכול לנצח בגלל עוד נ״ז. ציפייה: קורס חובה חסר תמיד גובר על הקריטריון. מוצמד במשימה 1.
3. **"עם חברים" כשכל החברים כבויים** (`active: false`): מתנהג כמו בלי חברים. השורה המסבירה מוצגת, והחיפוש רץ כ-`'best'`. מוצמד במשימה 1 (הפונקציה `showWeights`) ובמשימה 4 (הרנדר).
4. **קישורים ישנים:** `#me`, `#f=`, `#b=` ממשיכים לעבוד, ו-hash לא מוכר (`#mex`, `#courses2`) נוחת בשלב 4. מוצמד במשימה 2.
5. **ביקור ראשון שעובר ישר לשלב 2 או 3 בלחיצה על הפס:** נחשב כמי שסיים את הביקור הראשון, כדי שבכניסה הבאה הוא לא יוחזר ל-`#me`. מוצמד במשימה 3 (בבדיקה בדפדפן).

---

### Task 1: מדדי `credits` ו-`unlocks` בפותר, ושכבת המשקלים

**Files:**
- Modify: `web/solver-core.js` (`metrics`, `KNOWN`, `search`: `ctx`, `bound`, `leaf`; `searchYear`: ציון הזוג)
- Test: `test/solver.test.mjs`

**Interfaces:**
- Produces: `export const PRIMARY = 1e5`
- Produces: `export function showWeights(weights, sortBy, friends) -> weights`. מחזיר את `weights` כמו שהם כאשר `sortBy` הוא `'best'`, או `'friends'` בלי אף חבר עם `active !== false`. אחרת מחזיר `{ ...weights, [sortBy]: (weights[sortBy] ?? 0) + PRIMARY }`.
- Produces: `m.credits` ו-`m.unlocks`, בטווח 0..1, ב-`breakdown` של כל תוצאה.

- [ ] **Step 1: Write the failing tests** ב-`test/solver.test.mjs`, על `synth(rnd)` הקיים:

```js
test('showWeights: best and friendless friends keep the weights, a criterion adds PRIMARY', () => {
  const w = { friends: 3, progress: 3 };
  assert.deepEqual(showWeights(w, 'best', []), w);
  assert.deepEqual(showWeights(w, 'friends', [{ name: 'a', active: false, groups: [] }]), w);
  assert.equal(showWeights(w, 'credits', []).credits, PRIMARY);
  assert.equal(showWeights(w, 'friends', [{ name: 'a', groups: [] }]).friends, 3 + PRIMARY);
});

test('synthetic: credits and unlocks keep pruning identical to the exhaustive search', () => {
  // same loop as 'synthetic (published exams): pruning keeps results...' (seed 13, 40 cases),
  // weights = showWeights(randomWeights, pick(['credits', 'unlocks']), friends)
  // assert.deepEqual(prunedPairs, exhaustivePairs, `case ${t}`)  -- [groups.join(), score.toFixed(9)] like the existing test
});

test('synthetic: sortBy credits puts the most credits first', () => {
  // for 20 synth cases with every course optional and topK 10:
  // const best = Math.max(...search({ ...args, weights: {}, topK: 1000, prune: false }).results.map(sumCredits))
  // assert.equal(sumCredits(search({ ...args, weights: showWeights(w, 'credits', []) }).results[0]), best)
});

test('synthetic: sortBy unlocks puts the most unlocked follow-ups first', () => {
  // same shape as the credits test, comparing r.unlocks
});

test('searchYear: with a criterion, a pair missing a must course never outranks one that misses fewer', () => {
  // real data (skip without REAL), state with year-2 must courses, weights = showWeights(DEFAULT.weights, 'credits', [])
  // for every i < j in results: assert.ok(results[i].missing.length <= results[j].missing.length)
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/solver.test.mjs`
Expected: FAIL, `showWeights is not a function` (ודומיו).

- [ ] **Step 3: Implement in `web/solver-core.js`**
  - `ctx` מקבל `credits` (מזהה ← נ״ז), `maxCredits` (סכום הנ״ז של כל הפריטים, ולפחות 1), `down`, `statuses` ו-`maxUnlocks`. `maxUnlocks` הוא גודל האיחוד של `down[id]` לכל הפריטים, בלי קורסים בסטטוס `'done'`, ולפחות 1.
  - `metrics` מחשב `unlocks` (הקוד שנמצא היום ב-`leaf`), מחזיר אותו ב-`info`, ומוסיף `m.credits = Σcredits / maxCredits` ו-`m.unlocks = unlocks / maxUnlocks`. `leaf` לוקח את `unlocks` מ-`info` במקום לחשב שוב.
  - `KNOWN` מקבל את `'credits'` ואת `'unlocks'`.
  - ב-`bound` יש שני מערכים, `restCredits[i]` ו-`restDown[i]`, שנבנים מהסוף להתחלה כמו `restValue`. `restDown[i]` הוא `Σ down[id].size` של הפריטים מ-`i` והלאה. התוספת לחסם:
    - `W('credits') · (selCredits + restCredits[i]) / maxCredits`
    - `W('unlocks') · min(1, (selUnlocks + restDown[i]) / maxUnlocks)`

    `selUnlocks` הוא גודל האיחוד שיש עכשיו, באותה הגדרה כמו ב-`metrics`.
  - ב-`searchYear`: `const missW = Object.values(weights).some((w) => w >= PRIMARY) ? PRIMARY * 10 : MISSING_W`, ו-`missW` במקום `MISSING_W` בציון הזוג. בלי קריטריון ההתנהגות לא משתנה.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/solver.test.mjs test/solver-props.test.mjs`
Expected: PASS. גם הבדיקות הקיימות של "pruning keeps results" ירוקות.

- [ ] **Step 5: Commit**

```bash
git add web/solver-core.js test/solver.test.mjs
git commit -m "feat(solver): credits and unlocks metrics with bounds, showWeights for a show-by criterion"
```

---

### Task 2: מצב ונתיבים

**Files:**
- Modify: `web/app.js` (`DEFAULT`, `normalize`, `routeOf`, `hashOf`)
- Test: `test/app.test.mjs`, `test/program-switch.test.mjs`

**Interfaces:**
- Produces: `routeOf(h) -> 'me' | 'courses' | 'prefs' | 'plan'`, `hashOf(view) -> '#me' | '#courses' | '#prefs' | ''`
- Produces: `export const STEPS = ['me', 'courses', 'prefs', 'plan']` (סדר השלבים, לשימוש במשימה 3)
- Produces: `app.state.sortBy`

- [ ] **Step 1: Write the failing tests**. מחליפים את שלוש בדיקות `routeOf` ו-`hashOf` הקיימות (`test/app.test.mjs:188-210`) בבדיקות האלה:

```js
test('routeOf: four steps; friend, backup and unknown hashes land on the plans', () => {
  assert.deepEqual(['#me', '#courses', '#prefs'].map(routeOf), ['me', 'courses', 'prefs']);
  for (const h of ['', '#', '#f=abc', '#b=abc', '#mex', '#courses2']) assert.equal(routeOf(h), 'plan');
});
test('hashOf is routeOf inverse for every step', () => {
  for (const v of STEPS) assert.equal(routeOf(hashOf(v)), v);
  assert.equal(hashOf(undefined), '');
});
test('normalize: sortBy keeps the four values, anything else is best', () => {
  for (const v of ['best', 'credits', 'friends', 'unlocks']) assert.equal(normalize({ v: 1, sortBy: v }).sortBy, v);
  for (const v of [undefined, '__proto__', 5, 'credits ', null]) assert.equal(normalize({ v: 1, sortBy: v }).sortBy, 'best');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/app.test.mjs`
Expected: FAIL. `routeOf('#courses')` מחזיר `'plan'`, ו-`STEPS` לא מוגדר.

- [ ] **Step 3: Implement**. `sortBy: 'best'` נכנס ל-`DEFAULT`. `normalize` מקבל רק ערכים מתוך הרשימה. `routeOf` ו-`hashOf` עובדים לפי טבלה אחת: `{ me: '#me', courses: '#courses', prefs: '#prefs', plan: '' }`. `sortBy` נכנס ל-`PERSONAL` (`web/app.js:247`), כי הוא העדפה של "איך מתכננים" ולכן נשאר גם אחרי החלפת תוכנית. הוא לא נכנס לקישור חבר (`share.js` לא משתנה). מוסיפים לבדיקה ב-Step 1:

```js
test('sortBy survives a program switch (PERSONAL)', () => {
  // follow the existing program-switch test in test/program-switch.test.mjs: state with sortBy 'unlocks', switch program, assert sortBy === 'unlocks'
});
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/app.test.mjs test/share.test.mjs test/program-switch.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app.js test/app.test.mjs test/program-switch.test.mjs
git commit -m "feat(state): four step routes and sortBy"
```

---

### Task 3: מסכי השלבים והזזת התוכן

**Files:**
- Modify: `web/index.html`. `<nav class="views">` נהיה `<nav class="steps" aria-label="שלבים">`, ובו 4 `<a>` עם `href` מתוך `hashOf`, `data-view` ו-`<span class="n">`. כפתור מצב כהה נשאר. מוסיפים `<main id="courses" class="step-page" hidden>` ו-`<main id="prefs" class="step-page" hidden>`. `<aside id="side">` עובר לתוך `#courses` והופך ל-`<section id="side">`. מוציאים מהכותרת את `#friendsBtn` ואת כפתור ההעדפות.
- Modify: `web/ui-plan.js`. `renderRoute` מציג מסך אחד מתוך `STEPS`. השאלה של `gated()` לוקחת את `#me` בכל שלב שאינו `me`, כמו היום. על הקישורים: `aria-current="step"` לנוכחי, ומחלקה `done` לכל קישור שלפניו. `document.title` לפי שם השלב. `markOnboarded` בכל שלב שאינו `me`. `focusView` ממקד את הכותרת של המסך שמוצג (`meTitle`, `coursesTitle`, `prefsTitle` או `weekTitle`). `renderAll` קורא ל-`renderPrefs()` במקום ל-`renderDrawer()`.
- Modify: `web/ui-side.js`. `renderSide` כותב ל-`$('side')`, כמו היום, ומעליו `<h2 id="coursesTitle" tabindex="-1">`. מתחת לרשימה יש קישור `<a class="btn primary" href="#prefs">הבא: מה חשוב לי</a>`. מוסיפים `export function coursesSummary(res) -> string`: שורה אחת מתוך `summary()`, שמראה מספר קורסים, נ״ז, ימים ושיעורים עם חברים. כשאין `res` היא מחזירה את המחרוזת הריקה. השורה נכתבת ל-`$('coursesTop')`.
- Modify: `web/ui-drawer.js`. מוסיפים `export function renderPrefs()`, שכותב ל-`$('prefs')` את `prefsPanel` ואחריו את `friendsPanel`, כשני `<section>` עם `<h2>`. ה-h2 הראשון הוא `<h2 id="prefsTitle" tabindex="-1">מה חשוב לי</h2>`. בתחתית: `<a class="btn primary" href="#">הבא: מערכות</a>`. `PANELS` נשאר רק עם `reg`.
- Modify: `web/ui-actions.js`, `web/ui-plan.js:91`, `web/ui-view.js:99`, `web/ui-view.js:136`. כל `keepFocus(renderDrawer)` של חברים נהיה `keepFocus(renderPrefs)`. `removeFriend` ממקד את `#prefsTitle`. `statusDone` מעביר ל-`#courses`. הכפתור "פתח העדפות" בהודעה "אין מערכת" נהיה `<a class="btn" href="#prefs">`.
- Modify: `web/ui-me.js:133`. הטקסט נהיה "הבא: קורסים". כפתור `openMap` (שורה 116) יוצא מכאן.
- Modify: `web/style.css`. ה-selectors `aside` נהיים `#side`, ו-`.layout` מקבל עמודה אחת. ה-CSS של פס השלבים שייך למשימה 4.
- Test: `test/xss.test.mjs`, `test/app.test.mjs`

**Interfaces:**
- Consumes: `STEPS`, `routeOf`, `hashOf` (משימה 2)
- Produces: `renderPrefs()`, `coursesSummary(res)`, ומזהי DOM: `#courses`, `#coursesTop`, `#coursesTitle`, `#prefs`, `#prefsTitle`

- [ ] **Step 1: Update the tests**
  - ב-`test/xss.test.mjs`: במקום הלולאה של `drawer-${p}` יש `run('prefs-page', () => { renderPrefs(); })` ו-`run('drawer-reg', ...)`. רשימת ה-scopes מתעדכנת. הבדיקות על `shareOut`, `maxDays` ו-`lecturerDrop` מסננות לפי `'prefs-page'`. מוסיפים `run('courses-top', () => writes.push({ scope: 'courses-top', id: 'coursesTop', html: coursesSummary(current()) }))`.
  - ב-`test/app.test.mjs` מוסיפים:

```js
test('index.html: one step link per step, in order, with hashOf hrefs', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const links = [...html.matchAll(/<a href="([^"]*)" data-view="([a-z]+)"/g)].map((m) => [m[2], m[1]]);
  assert.deepEqual(links, STEPS.map((v) => [v, hashOf(v) || '#']));
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/xss.test.mjs test/app.test.mjs`
Expected: FAIL, `renderPrefs is not a function`, ובדיקת הקישורים לא מוצאת 4 קישורים.

- [ ] **Step 3: Implement** לפי רשימת ה-Files למעלה.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/xss.test.mjs test/app.test.mjs test/ui-search.test.mjs test/line-length.test.mjs`
Expected: PASS.

- [ ] **Step 5: Browser check**

`preview_start` עם `nostore` מ-`.claude/launch.json`, ברוחב 1280:
- ביקור ראשון (localStorage ריק) נפתח ב-`#me`.
- "הבא: קורסים", "הבא: מה חשוב לי" ו"הבא: מערכות" עוברים שלב, ו"חזור" חוזר.
- רענון בשלב 4 אחרי כל זה נשאר בשלב 4 (Review Focus 5: לחיצה ישירה על "קורסים" בביקור ראשון, ואז רענון, לא מחזירה ל-`#me`).
- הוספת חבר בקישור מתוך שלב 3 עובדת, וההודעה על שגיאה מופיעה בדף.
- `read_console_messages` בלי שגיאות.

- [ ] **Step 6: Commit**

```bash
git add web/index.html web/ui-plan.js web/ui-side.js web/ui-drawer.js web/ui-actions.js web/ui-view.js web/ui-me.js web/style.css test/xss.test.mjs test/app.test.mjs
git commit -m "feat(ui): four step pages; courses and preferences leave the sidebar and the drawer"
```

---

### Task 4: פס השלבים, הכותרת של שלב 4 ו"הצג לפי"

**Files:**
- Modify: `web/style.css`. `.steps`: עיגול מספר, `aria-current` מודגש ו-`.done` עם ✓ (`::before`, בלי שינוי טקסט). מתחת ל-600: לשלב לא נוכחי מוסתר `.lbl` ויש לו `aria-label` מלא. מעבר fade של 150ms על `.step-page`, `#layout` ו-`#me`, כבוי ב-`prefers-reduced-motion`. בטלפון `.actions` עובר ל-`repeat(3, …)`.
- Modify: `web/index.html`. ב-`.actions` יש עכשיו: `<button data-act="openMap" data-k="openMap">` עם התווית "מפה", "רשימה להרשמה" ו"שתף".
- Modify: `web/ui-view.js`. `renderView` כותב מעל ה-pills `<label class="field">הצג לפי <select data-chg="sortBy" data-k="sortBy">` עם ארבע האפשרויות בסדר של Global Constraints. כאשר `sortBy === 'friends'` ואין חבר פעיל, מתחת לבורר מופיעה השורה `<p class="hint">אין עדיין חברים. אפשר להוסיף <a href="#prefs">בשלב 3</a>.</p>`. מ-`renderTop` יוצא הקוד של `friendsBtn`.
- Modify: `web/ui-actions.js`. `CHG.sortBy(el)`: `app.state.sortBy = el.value; refresh();`. `normalize` כבר מסנן ערכים לא חוקיים בשמירה, ו-`refresh` מריץ את `scheduleRun`.
- Modify: `web/ui-search.js:38-40`. בשני ה-`postMessage`: `weights: showWeights(state.weights, state.sortBy, state.friends)`.
- Test: `test/xss.test.mjs`

**Interfaces:**
- Consumes: `showWeights` (משימה 1), `app.state.sortBy` (משימה 2), `#layout` בלי `#side` (משימה 3)

- [ ] **Step 1: Write the failing tests** ב-`test/xss.test.mjs`:

```js
test('the plans step offers show-by with the four criteria', () => {
  const html = writes.filter((w) => w.scope === 'view').map((w) => w.html).join('');
  for (const v of ['best', 'credits', 'friends', 'unlocks']) assert.ok(html.includes(`value="${v}"`), v);
  assert.ok(html.includes('data-chg="sortBy"'));
});
test('show-by friends without an active friend points to step 3', () => {
  // set app.state.sortBy = 'friends', app.state.friends = [] ; run renderView ; restore
  // assert the written html includes 'href="#prefs"'
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test test/xss.test.mjs`
Expected: FAIL, `data-chg="sortBy"` לא נמצא.

- [ ] **Step 3: Implement** לפי רשימת ה-Files למעלה.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test test/xss.test.mjs test/ui-search.test.mjs test/line-length.test.mjs`
Expected: PASS.

- [ ] **Step 5: Browser check**

עם `resize_window` ב-1280, 375 ו-320, ובכל אחד גם `colorScheme` dark:
- בכל שלב `document.documentElement.scrollWidth <= innerWidth`.
- פס השלבים לא נשבר לשתי שורות.
- הסרגל התחתון מכיל 3 כפתורים.
- "מפה" פותח את המפה, והמעבר בין חלופות בתוכה עובד.
- "הצג לפי: הכי הרבה נ״ז" מריץ חיפוש (רואים "מחשב…"), וחלופה 1 משתנה.
- ניווט במקלדת עובר על הפס, על הבורר ועל "הבא".
- axe (עותק מקומי, כמו ב-`docs/ACCESSIBILITY-AUDIT.md`) בלי הפרות חדשות.
- צילום מסך של שלב 4 בטלפון כהוכחה.

- [ ] **Step 6: Commit**

```bash
git add web/style.css web/index.html web/ui-view.js web/ui-actions.js web/ui-search.js test/xss.test.mjs
git commit -m "feat(ui): step bar, plans header with map and show-by"
```

---

### Task 5: תיעוד, טסט מלא ומסירה

**Files:**
- Modify: `docs/ARCHITECTURE.md`. שורות `ui-*.js` ו-`solver-core.js`, ובליבת הלוגיקה משפט אחד על "הצג לפי" (`PRIMARY`, וחסר חובה גובר).
- Modify: `README.md`. "איך מתחילים" לפי ארבעת השלבים. צילומי המסך מתחלפים רק אחרי המיזוג (`npm run ui:shots`).

- [ ] **Step 1:** Run: `npm test`. Expected: כל הבדיקות עוברות, ו-0 fail.
- [ ] **Step 2:** עדכון שני הקבצים, ו-commit `docs: four steps and show-by in README and ARCHITECTURE`.
- [ ] **Step 3:** דחיפת `feat/steps` ל-origin (בלי מיזוג), ושליחת קישור preview לבעלים. **מיזוג ל-`main` רק אחרי אישור מפורש, ואחרי 2026-10-18.**
