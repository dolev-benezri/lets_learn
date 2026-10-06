# תיקון ממצאי הסקירה המלאה (2026-10-03) — תוכנית

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** לסגור את כל הממצאים מסקירת הקוד המלאה של 2026-10-03, כך שכל המסלולים (כולל ערב של 5 שנים) מוכנים להפצה ושהעדכון הלילי לא נחסם.

**Architecture:** תיקונים נקודתיים בקבצים הקיימים, בלי מודולים חדשים חוץ מ-polyfill מוכן ל-popover. כל משימה = בדיקה שנכשלת, תיקון, בדיקה שעוברת, commit. ענף `review-fixes` מ-`main`.

**Tech Stack:** ES modules ב-`web/`, `node --test`, Node scripts ב-`scripts/`, GitHub Pages + GitLab nightly.

**Spec:** הדוח בשיחה (2026-10-03) + `docs/ISSUES.md` §19-21 + `docs/LAUNCH-READINESS.md` (P5).

## Global Constraints

- אין בקשות לאתר אפקה או לידיעון מהמחשב המקומי. נתונים חדשים מגיעים רק מהריצה הלילית ב-GitLab או מ-`.yedion-cache` המקומי (offline).
- לא נוגעים בהגדרות GitLab ולא בהחלטות משפטיות.
- `הסבר התמחויות - חשמל.pdf` נשאר מחוץ ל-git.
- שורה ב-`web/` עד 200 תווים (`test/line-length.test.mjs`).
- כל טקסט מהנתונים עובר `esc()` (`test/xss.test.mjs`).
- זהות git `dolev-benezri`; כל commit מסתיים ב-`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- בדיקה ממוקדת אחרי כל שינוי; כל הסוויטה (`npm test`) לפני merge.

## Review Focus

1. סטודנט שנה ה׳ בערב שבחר שנה 5: צריך לראות את רשימת "שנה ה׳" כשנה במפה ובמצב שלי, ושהתכנון רץ על המחזור הקרוב (2024) עם הודעה.
2. נתונים שמורים ישנים (`profile.year` 1-4, קישור גיבוי מ-2027 אחרי מעבר ל-2028): נטענים בלי איבוד מצב.
3. ריצה לילית שמשנה מינימום של רשימה: הפריסה עוברת, והשינוי מופיע כאזהרה ולא כשגיאה.
4. Safari 16 / iOS 16: המפה נטענת ולחיצה על שיעור פותחת חלון.
5. קישור גיבוי זדוני עם אלפי רשומות `failed`/`choices` או `notBefore: "99:99"`: נחתך/נדחה.

לכל שורה יש בדיקה במשימה שאחראית עליה (1: T1, 2: T1+T3, 3: T2, 4: T5, 5: T7).

---

## שלב א׳ — חוסם הפצה

### Task 1: מסלולי ערב של 5 שנים

**הבעיה:** 12, 22, 32, 42 כוללים "קורסי חובה שנה ה'" (10.5 / 4 / 4 / 7.5 נ״ז). `yearsOf` מזהה רק א-ד, `cleanProfile` ו-`YEARS` עוצרים ב-4, ו-`YEAR_LETTERS` (rules, map-layout) בלי ה׳. אין מחזור 2023 בקטלוג.

**דרך הפתרון:** להרחיב את כל הטבלאות לה׳ ו-5. סטודנט שבוחר שנה שאין לה מחזור מקבל את המחזור הקרוב (2024), וההודעה הקיימת ב-`identityPick` ("אין עדיין נתונים למחזור של שנה ה׳. התכנון לפי מחזור 2024") כבר מכסה את זה. מחזור 2023 עצמו נדחה (Task 1b).

**Files:**
- Modify: `web/rules.js:2` (`YEAR_LETTERS` + `'ה': 5`), `web/rules.js:29` (`int(p?.year, 1, 5)`), `web/rules.js:60-63` (`yearsOf`: regex `[א-ה]`, מחרוזת `' אבגדה'`)
- Modify: `web/map-layout.js:5` (`YEAR_LETTERS = 'אבגדה'`)
- Modify: `web/ui-common.js:19` (`YEARS` + `[5, 'ה׳']`)
- Modify: `web/app.js:248` (`clamp(..., 1, 5)`)
- Modify: `web/ui-actions.js:157-158` (`pyear`: `nearest(p.startYears, cohortOf(y))` במקום התאמה מדויקת, כמו בשורה 138)
- Test: `test/rules.test.mjs`, `test/ui-map.test.mjs`

- [ ] **Step 1: בדיקות שנכשלות**

```js
test('evening programs have a fifth year', () => {
  for (const id of [12, 22, 32, 42]) assert.equal(yearsOf(load(`2027-1/${id}-2027.json`)), 5, id);
  assert.equal(yearsOf(load('2027-1/30-2027.json')), 4);
  assert.equal(cleanProfile({ year: 5 }).year, 5);
  assert.equal(cleanProfile({ year: 6 }).year, null);
});
test('progress counts year ה lists only from year 6 on (never), year ד from year 5', () => {
  const d = load('2027-1/12-2027.json'), s = { passed: [], profile: { year: 5 } };
  assert.equal(progress(d, s).required, d.lists.filter((l) => /חובה שנה [א-ד]'/.test(l.name)).reduce((a, l) => a + l.minCredits, 0));
});
// ui-map.test.mjs
test('a fifth-year list gets its own band', () => {
  const d = load('2027-1/32-2027.json');
  assert.ok(layoutMap(d, /* ... as in neighbouring tests */).bands.some((b) => b.year === 5 && b.name === 'שנה ה׳'));
});
```

- [ ] **Step 2:** `node --test test/rules.test.mjs test/ui-map.test.mjs` — Expected: FAIL (`yearsOf` = 4, אין band 5).
- [ ] **Step 3:** ליישם את השינויים ברשימת הקבצים.
- [ ] **Step 4:** אותה פקודה — Expected: PASS. אחריה `node --test test/app.test.mjs test/program-switch.test.mjs test/xss.test.mjs` — PASS.
- [ ] **Step 5:** בדיקה בדפדפן (preview): מסלול 32, שנה ה׳: המפה מציגה עמודת "שנה ה׳", מוצגת הודעת המחזור הקרוב, אין שגיאות בקונסול.
- [ ] **Step 6:** commit `fix: evening programs have a fifth study year`

### Task 1b: מחזור 2023 לערב (נדחה, תיעוד בלבד)

רשימות 2023 לא ידועות בלי בקשה לידיעון, ובסורק רשימה ריקה מפילה את כל הריצה (`scripts/scrape.mjs:224`). ניחוש יסכן את הריצה הלילית.
- [ ] להוסיף ל-`docs/ISSUES.md` סעיף 22: "מחזור 2023 ל-12/22/32/42: לבדוק בידיעון את קודי הרשימות של 2023, להוסיף ל-`lists["2023"]` ול-`cohorts` ב-`scripts/programs.json`, ולהריץ ריצה ידנית ב-GitLab". עד אז: שנה ה׳ מתוכננת לפי 2024.

### Task 2: בדיקה רשמית שלא חוסמת את הריצה הלילית

**הבעיה:** `test/programs-official.test.mjs` נועל ערכים מהנתונים (`SPEC`, 120 ב-CS). שינוי בידיעון מפיל את `npm test`, ולכן הפריסה הלילית נחסמת.

**דרך הפתרון:** לפצל.
- נשאר ב-`test/programs-official.test.mjs` רק מה שנקבע ב-`scripts/programs.json`: 19 = 120, תחומים וכלל בחירה, 61/65 לא קיימים, `verified`.
- הערכים שתלויים בנתונים עוברים ל-`scripts/audit.mjs` כפונקציה `officialDrift(dataDir) -> string[]`, שמחזירה הודעה לכל ערך שזז. הפונקציה רצה בסוף הסריקה ומודפסת כ-`WARN` (לא `errors`).
- בדיקת יחידה של `officialDrift` רצה על fixture קטן, לא על `web/data`.

**Files:**
- Modify: `test/programs-official.test.mjs` (להוציא את 2 הבדיקות התלויות בנתונים)
- Modify: `scripts/audit.mjs` (להוסיף `export function officialDrift(readData)` עם הטבלה `SPEC` והבדיקה של 120)
- Modify: `scripts/scrape.mjs` (אחרי הכתיבה: `officialDrift(...).forEach((w) => log(\`WARN official: ${w}\`))`)
- Test: `test/audit.test.mjs`

- [ ] **Step 1: בדיקה שנכשלת** ב-`test/audit.test.mjs`:

```js
test('officialDrift names a cohort whose specialization credits moved, and nothing when they match', () => {
  const ok = officialDrift(() => fixtureWithSpec(27)), moved = officialDrift(() => fixtureWithSpec(25));
  assert.deepEqual(ok, []);
  assert.match(moved[0], /30-2027.*27.*25/);
});
```

- [ ] **Step 2:** `node --test test/audit.test.mjs` — Expected: FAIL (`officialDrift` לא קיים).
- [ ] **Step 3:** ליישם, ולהעביר את הטבלה מהבדיקה הרשמית.
- [ ] **Step 4:** `node --test test/audit.test.mjs test/programs-official.test.mjs` — PASS. `node scripts/audit.mjs` (offline, על `web/data`) — Expected: 0 אזהרות על הנתונים של היום.
- [ ] **Step 5:** commit `test: data-bound curriculum values warn in the scrape instead of blocking the nightly deploy`

### Task 3: מעבר שנת לימודים (P5)

**הבעיה:**
- `DEFAULT.year: 2027` (`web/app.js:10`) ו-`--year` default `'2027'` (`scripts/scrape.mjs:285`) כתובים קבוע.
- מפתח המטמון לא כולל את השנה (`scripts/scrape.mjs:150`), ולכן אחרי מעבר יוגשו תשובות של השנה הקודמת עד שיפוג ה-TTL.
- `readHash` דוחה גם קישור **גיבוי** משנה אחרת, ואז הקורסים שעברתי הולכים לאיבוד.

**דרך הפתרון:**
1. **שנה במקום אחד:** הסורק כותב `year` ל-`catalog.json`. `normalize(raw, catalog)` לוקח את `out.year = catalog?.year ?? DEFAULT.year`. `goodCatalog` מקבל `year` אופציונלי (מספר שלם).
2. **מטמון לפי שנה:** `cachedRequester(live, \`${opt.cache}/${opt.year}\`, ...)`. העברה חד-פעמית: קבצי `*.html` שבשורש המטמון עוברים ל-`${cache}/2027` (`ponytail:` הקבצים השטוחים הם כולם מ-2027; למחוק את ההעברה אחרי ריצה אחת).
3. **גיבוי חוצה שנים:** ב-`readHash` בדיקת השנה והסמסטר חלה רק על `type === 'f'`. בגיבוי משנה אחרת: לשמור את `passed`, `failed`, `grades`, `choices`, `profile` ו-`friends` בלי `groups`, ולהוריד את `pins`, `semesterOf` ו-`yearIds` (מזהי קבוצות לא עוברים בין שנים). `profile.year` עולה ב-`year - payload.year` (תקרה 5).
4. **נוהל מעבר** ב-README: לשנות את ברירת המחדל של `--year`, להוסיף מחזור חדש ל-`cohorts`/`lists`, להוריד את הישן.

**Files:**
- Modify: `scripts/scrape.mjs` (שורות 150, 194-205 `writeCatalog`, 285, 301), `web/app.js` (`normalize`, `goodCatalog`), `web/share.js:62-70`, `README.md`
- Test: `test/scrape.test.mjs`, `test/app.test.mjs`, `test/share.test.mjs`

- [ ] **Step 1: בדיקות שנכשלות**

```js
// scrape.test.mjs
test('the cache is per academic year', async () => { /* same query, year 2027 vs 2028: two different files under dir/2027 and dir/2028 */ });
test('writeCatalog records the year', async () => { assert.equal(catalog.year, 2027); });
// app.test.mjs
test('normalize takes the year from the catalog', () => {
  assert.equal(normalize({ v: 1 }, { ...cat, year: 2028 }).year, 2028);
  assert.equal(normalize({ v: 1 }, cat).year, 2027);
});
// share.test.mjs
test('a backup from last year keeps the record and drops the groups', async () => {
  const r = await readHash(await backupHash({ year: 2027, passed: ['10001'], pins: ['g1'], profile: { year: 2 } }), { year: 2028, semester: 'א' });
  assert.equal(r.type, 'backup'); assert.deepEqual(r.payload.passed, ['10001']); assert.equal(r.payload.pins, undefined);
  assert.equal(r.payload.profile.year, 3);
});
test('a friend link from last year is still refused', async () => { /* error /סמסטר אחר/ */ });
```

- [ ] **Step 2:** `node --test test/scrape.test.mjs test/app.test.mjs test/share.test.mjs` — Expected: FAIL.
- [ ] **Step 3:** ליישם את 1-3.
- [ ] **Step 4:** אותה פקודה — PASS. `node scripts/scrape.mjs --all-programs --cache .yedion-cache --offline --dry-run` (או הדגל המקביל שקיים) — Expected: הקבצים עברו ל-`.yedion-cache/2027`, הבנייה offline מצליחה, `catalog.json` כולל `"year": 2027`.
- [ ] **Step 5:** לכתוב את הנוהל ב-README. בעדכון P5 ב-`docs/LAUNCH-READINESS.md`: "תוקן".
- [ ] **Step 6:** commit `fix(P5): the academic year lives in the catalog; per-year scrape cache; backups survive the rollover`

### Task 4: נ״ז שלא נספרות במחזורים הנוכחיים (חקירה)

**הבעיה:** בנתונים יש רשימות שסכום הקורסים שבהן קטן מהמינימום שלהן:

| תוכנית | רשימה | מינימום | יש בנתונים |
|---|---|---|---|
| 22-2026 | 22002 שנה ב׳ | 35 | 30 |
| 22-2026/27 | 22005 שנה ה׳ | 4 | 1.5 |
| 50-2026/27 | 50003 שנה ג׳ | 34 | 31.5 |
| 50-2026 | 50103 מכניקה פיזיולוגית חובה | 11 | 10.5 |

**דרך הפתרון:** לבדוק offline ב-`.yedion-cache` את דף הרשימה הגולמי, ולספור את השורות מול `parseProgram`.
- **אם הפרסר מפספס שורות:** לתקן את `scripts/parse.mjs`, להוסיף fixture מהקובץ השמור ל-`test/fixtures` ובדיקה ב-`test/parse.test.mjs` (קודם נכשלת), ואז בנייה offline.
- **אם הידיעון עצמו קצר:** לרשום ב-ISSUES §21 כסתירה במקור. האתר כבר מציג את ההפרש כ"לא נספרים כאן" ולא משקר.

- [ ] **Step 1:** סקריפט זמני ב-scratchpad שמוצא את קובץ המטמון של כל רשימה (חיפוש הקוד בטקסט) ומשווה את מספר השורות בטבלה ל-`parseProgram(html).courses.length`.
- [ ] **Step 2:** לפי התוצאה: תיקון + בדיקה (RED→GREEN) + בנייה offline, או שורה ב-§21.
- [ ] **Step 3:** commit (`fix(parse): ...` או `docs: ...`).

---

## שלב ב׳ — קטן

### Task 5: דפדפנים ישנים (Safari < 17.4, iOS 16)

**דרך הפתרון:**
- **`Object.groupBy`** (`web/map-layout.js:209`): להחליף בלולאה על `Map` (שלוש שורות), בלי helper.
- **Popover:** ב-Safari 16 האלמנט עם `popover` מוצג תמיד, ו-`showPopover` זורק. לשמור את `@oddbird/popover-polyfill` מקומית ב-`web/vendor/popover/` (כמו `panzoom` ו-`pdfjs`), ולטעון אותו רק כשחסרה תמיכה:

```html
<script type="module">if (!HTMLElement.prototype.hasOwnProperty('popover')) import('./vendor/popover/popover.min.js');</script>
```

**Files:** `web/map-layout.js`, `web/index.html`, `web/vendor/popover/*`
**Test:** `test/ui-map.test.mjs`:

```js
test('geometry runs without Object.groupBy', () => {
  const g = Object.groupBy; delete Object.groupBy;
  try { assert.ok(geometry(layoutMap(...)).nodes.length); } finally { Object.groupBy = g; }
});
```

- [ ] RED (`TypeError: Object.groupBy is not a function`) → תיקון → GREEN. להוסיף את ה-polyfill (`npm pack @oddbird/popover-polyfill`, להעתיק את `dist/popover.min.js` ואת הרישיון). בדפדפן: אין שגיאות בקונסול, והחלון נפתח.
- [ ] commit `fix: the map and the lesson popover work on Safari 16`

### Task 6: `progress()` לא סופר מעבר למינימום של רשימה

**דרך הפתרון:** `earned` = סכום על הרשימות של `Math.min(l.minCredits, נ״ז שעברתי ברשימה)`.
**Files:** `web/rules.js:159-170`. **Test:** `test/rules.test.mjs`:

```js
test('progress never counts past a list minimum', () => {
  // list min 5, two passed 3-credit courses => earned 5, ratio 1
});
```

- [ ] RED → GREEN → commit `fix: year progress counts each list up to its minimum`

### Task 7: הגבלות ב-`normalize`

**דרך הפתרון:**
- `failed` ו-`choices`: מפתח עד 20 תווים ועד 200 רשומות, כמו `grades`.
- `notBefore` ו-`notAfter`: הביטוי `/^([01]\d|2[0-3]):[0-5]\d$/`.

**Files:** `web/app.js:35-36, 54, 56`. **Test:** `test/app.test.mjs`:

```js
test('normalize caps failed and choices, and rejects impossible times', () => {
  const many = Object.fromEntries([...Array(500)].map((_, i) => [`c${i}`, 1]));
  const s = normalize({ v: 1, failed: many, choices: { ['x'.repeat(30)]: 'must' }, constraints: { notBefore: '99:99', notAfter: '23:59' } });
  assert.equal(Object.keys(s.failed).length, 200); assert.deepEqual(s.choices, {});
  assert.equal(s.constraints.notBefore, DEFAULT.constraints.notBefore); assert.equal(s.constraints.notAfter, '23:59');
});
```

- [ ] RED → GREEN → commit `fix: backup links can't overfill failed/choices or set impossible hours`

### Task 8: ביצועים — `unlockCounts`

**דרך הפתרון:** `downstream(data)` נשמר ב-`WeakMap` לפי אובייקט `data`, ו-`passed` הופך ל-`Set`. שלושת המקומות שקוראים (`ui-map`, `ui-side`, `ui-view`) לא משתנים.
**Files:** `web/solver-core.js:105-122`. **Test:** `test/solver.test.mjs`:

```js
test('unlockCounts reuses the downstream map of one dataset', () => {
  const a = unlockCounts(data, []), b = unlockCounts(data, ['X']);
  assert.deepEqual(a, unlockCountsReference(data, [])); // same numbers as before
  assert.equal(downstream(data), downstream(data)); // cached object
});
```

- [ ] RED (שני אובייקטים שונים) → GREEN → commit `perf: the prerequisite graph is computed once per dataset`

### Task 9: קישור חבר מתוכנית אחרת

**דרך הפתרון:** ב-`renderBanner`, כש-`L.program !== app.state.program`, להוסיף אחרי מספר השיעורים: `· <span class="warn-text">מתוכנית אחרת (${esc(שם מהקטלוג)})</span>`.
**Files:** `web/ui-view.js:28-40`. **Test:** `test/xss.test.mjs` (או `ui-text.test.mjs`): נחיתה עם `program: 20` כשהמצב 30, וב-HTML יש "מתוכנית אחרת" עם השם אחרי escape.
- [ ] RED → GREEN → commit `feat: a friend link from another program says so`

### Task 10: ריבוי בעברית ("1 קבוצות")

**דרך הפתרון:** helper אחד ב-`web/ui-common.js`:

```js
export const count = (n, one, many) => (n === 1 ? one : `${n} ${many}`);
```

להחליף את המופעים ב-`ui-drawer.js:50,66`, `ui-friend-editor.js` ו-`ui-me.js` (חיפוש: `\$\{[^}]+\} (קבוצות|שיעורים|קורסים|נ״ז)`). כש-n=1 הטקסט הוא "קבוצה אחת".
**Test:** `test/ui-text.test.mjs`: `count(1, 'קבוצה אחת', 'קבוצות') === 'קבוצה אחת'`, וגם `count(3, ...) === '3 קבוצות'`. ואז רינדור של המגירה עם נעיצה אחת: ב-HTML אין "1 קבוצות".
- [ ] RED → GREEN → commit `fix: singular forms in Hebrew counts`

### Task 11: נגישות קלה (ISSUES §20)

| ממצא | פתרון |
|---|---|
| שני `h1` בכל מסך | הכותרות בתצוגות (`ui-me.js:68,90` וכל `h1` שמרונדר) הופכות ל-`h2`, כולל עדכון של בוררי ה-CSS |
| כותרת לשונית זהה | `document.title = \`${שם התצוגה} · המערכת שלי · אפקה\`` במקום שבו מוחלפת תצוגה (`body.dataset.view`) |
| לטינית בלי `lang` | ב-`heb()`/בתצוגת שם קורס: קטע לטיני נעטף ב-`<span lang="en">` (אחרי `esc`) |
| toast של 2.5 שניות | `Math.max(4000, 60 * text.length)` ms |
| תוויות מפה 10-11px | 12px ב-CSS של המפה |
| `prefers-reduced-motion` ו-`::after` | להוסיף `*::after, *::before` לכלל |

**Test:** ב-`test/xss.test.mjs`, הרינדור של 'me' ושל 'view' לא מכיל `<h1`. ב-`test/ui-text.test.mjs`, `heb('Physics 1')` עטוף ב-`lang="en"`.
- [ ] RED → GREEN, בדיקה בדפדפן (Tab ו-reduced motion) → commit `fix(a11y): one h1, per-view titles, lang on Latin, longer toasts`

### Task 12: ממצאים קלים מהסקירה הסופית (ISSUES §20-21)

| ממצא | פתרון | בדיקה |
|---|---|---|
| `noSave` לא מתאפס | לאפס `app.noSave = false` כשהקטלוג נטען בהצלחה ובשמירה הבאה | `app.test.mjs` |
| מחזור שירד נדרס ולא נשמר בצד | `stash()` של המצב הישן לפני המעבר למחזור הקרוב (כמו בתוכנית שירדה) | `program-switch.test.mjs` |
| קישור חבר מוחק את הודעת "התוכנית כבר לא באתר" | `hashError` ו-`friendLanding` מוצגים יחד (באנר נפרד) | `xss.test.mjs` |
| בחירת התמחות מזיזה את הסך בחצי נ״ז | לשחזר על 30-2027, ולעגל את `total` אחרי `fill` ולא לפני | `ui-map.test.mjs` |
| ייבוא ציונים: `t[d-1]` כשהמזהה ראשון | לקחת את הציון רק מתא אחרי המזהה כשהוא ראשון | `grade-import.test.mjs` |
| קוד `specRule.groups` לא בשימוש | למחוק מ-`rules.js` (`areaPos`, `specConflict` ו-groups ב-`validSpecs`) ומ-`ui-me.js`, יחד עם הבדיקות שלו | `specs.test.mjs` ירוק |
| "צפייה בתוכנית של שנתיים מורידה שנה" | לא רלוונטי: 61 ו-65 יצאו. לסמן ב-ISSUES | — |
| תקציבי זמן של הסולבר ב-CI | בלי שינוי (ruling: מונע flaky) | — |
| CS: השלמה ל-120 מעודף חברה ורוח | החלטה של המחלקה, נשאר ב-§21 | — |

- [ ] כל שורה עם תיקון: RED → GREEN → commit נפרד.

### Task 13: סגירה

- [ ] `npm test` — Expected: כל הבדיקות עוברות.
- [ ] לעדכן את `docs/ISSUES.md` (§19, §20 ו-§22 החדש) ואת `docs/LAUNCH-READINESS.md`.
- [ ] סקירה סופית של הענף (code-reviewer), תיקון Critical/Important, merge ל-`main`, push, ובדיקת ה-deploy (המתנה אחת ברקע).

## לא בתוכנית (ruling)

- **tesseract בלי SRI:** import דינמי מ-CDN לא תומך ב-SRI, והעתקה מקומית היא מעל 10MB (נפסל כבר ב-S1).
- **P1, בדיקות בטלפון אמיתי, איש קשר לנגישות, ייעוץ משפטי, לוח בחינות:** לא קוד. נשארים אצלך.
