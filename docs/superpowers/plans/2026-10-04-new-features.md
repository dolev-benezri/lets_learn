# שש תכונות חדשות (ISSUES §14י, §17ג) — תוכנית לסשן הבא

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**פרומפט פתיחה לסשן הבא:**
> קרא את `docs/superpowers/plans/2026-10-04-new-features.md` ובצע אותו inline (executing-plans) בענף `new-features`. קודם צעד 0: לקרוא פעם אחת את הריצה הלילית ב-GitLab (P1). אחר כך משימות 1-6 לפי הסדר, ובסוף סקירה אחת של כל הענף, merge, push ובדיקת deploy.

**Goal:** שש תכונות שעברו את הביקורת: שיתוף לוואטסאפ, רשימת תיוג לסיום התואר, תקרת ימים בקמפוס, העדפה או הימנעות ממרצה, הסבר מה ההבדל בין חלופות, וייצוא ללוח שנה.

**Architecture:** כל תכונה נכנסת לקבצים שכבר קיימים, ליד הקוד הדומה לה. המודול החדש היחיד הוא `web/ics.js` (פונקציה טהורה). אילוצים נכנסים ל-`constraints` ועוברים דרך `normalize` (`CONSTRAINT_OK`) ודרך קישור הגיבוי, כמו `maxCredits`. כל משימה עצמאית ואין ממשקים משותפים, חוץ מ-`info` שמשימה 5 מוסיפה לתוצאה.

**Tech Stack:** ES modules ב-`web/`, `node --test`, בלי תלויות חדשות.

**Spec:** ISSUES §14י (ייצוא `.ics`) ו-§17ג (טבלת הרעיונות) + ההחלטות בתוכנית הזו.

## Global Constraints

- אין בקשות לאתר אפקה או לידיעון מהמחשב המקומי.
- כל טקסט מהנתונים עובר `esc()`, ו-`test/xss.test.mjs` צריך לכסות כל רנדור חדש.
- שורה ב-`web/` עד 200 תווים.
- בלי תלות חדשה. ספריות שכבר קיימות: panzoom, pdf.js, tesseract.
- ריבוי בעברית עם `count()` / `groupCount()` מ-`web/ui-text.js`.
- שדה חדש במצב: מאומת ב-`normalize` (`web/app.js`), נבנה מחדש ב-`readHash` לגיבוי (`web/share.js`), ומתאפס ב"איפוס העדפות" אם הוא העדפה.
- זהות git `dolhack`; כל commit מסתיים ב-`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- בדיקה ממוקדת אחרי כל שינוי; `npm test` מלא לפני merge.

## Review Focus

1. **תוצאה של שנה מלאה** (`isPair(res)`, סמסטרים א׳ ו-ב׳): ייצוא, השוואה ושיתוף צריכים לעבוד על כל סמסטר בנפרד (`regParts`), לא רק על `res.groups`.
2. **מרצה שמופיע רק בתרגול**, או קורס שכל הקבוצות שלו אצל מרצה שנמנעים ממנו: האילוץ מסנן רק קבוצות ראשיות, ובמקרה כזה `diagnose` אומר למה אין קבוצה.
3. **תקרת ימים נמוכה מדי** (למשל 1, עם 3 קורסי חובה בימים שונים): אין תוצאה, ו-`diagnose` מסביר שהתקרה היא הסיבה.
4. **שם מרצה או קורס עם תווים מיוחדים** (`"`, `,`, `;`, שורה חדשה): נשמר נכון ב-`.ics` (escape לפי RFC 5545) ובקישור הגיבוי.
5. **רשימה עם מינימום 0** (אנגלית, יזמות): לא מוצגת כ"חסר 0", ולא נספרת פעמיים מול רשימת ההתמחות.

---

### צעד 0: P1 (לפני הכל)

- [ ] לקרוא פעם אחת את הריצה הלילית האחרונה ב-GitLab (פרויקט `lets_learn-group/lets_learn-scrape`). מה לבדוק: ירוקה או חלקית, שהמטמון עבר ל-`.yedion-cache/2027`, ושאין שורות `WARN official`. לרשום את התוצאה ב-`docs/LAUNCH-READINESS.md`.

### Task 1: כפתור שיתוף לוואטסאפ (קטן)

**הבעיה:** הקישור האישי רק מועתק. בטלפון צריך לפתוח אפליקציה ולהדביק.

**הפתרון:** כפתור "שתף" ליד "העתק את הקישור שלי".
- אם `navigator.share` קיים (רוב הטלפונים), נפתח חלון השיתוף של המערכת, ווואטסאפ נמצא בו.
- אם לא, נפתח `https://wa.me/?text=<encodeURIComponent(טקסט + קישור)>` בלשונית חדשה (`noopener`).
- אם המשתמש סגר את חלון השיתוף (`AbortError`), לא מוצגת הודעה.

**Files:**
- Modify: `web/ui-drawer.js:86-88` (כפתור `data-act="shareOut"` עם `data-k="shareOut"`)
- Modify: `web/ui-actions.js:37` (פעולה `shareOut`)
- Modify: `web/ui-text.js` (פונקציות `shareText`, `waUrl`)
- Test: `test/ui-text.test.mjs`, `test/xss.test.mjs`

**Interfaces — Produces:**
- `shareText(name: string) -> string` מחזיר `"${name || 'חבר'} שיתף/ה איתך מערכת שעות:"`.
- `waUrl(text: string, url: string) -> string` מחזיר `https://wa.me/?text=` + `encodeURIComponent(\`${text} ${url}\`)`.

- [ ] **Step 1: בדיקות שנכשלות**

```js
test('waUrl: the text and the link, encoded, for wa.me', async () => {
  const { waUrl, shareText } = await import('../web/ui-text.js');
  assert.equal(waUrl('שלום & "x"', 'https://a.test/#f=AB'), 'https://wa.me/?text=' + encodeURIComponent('שלום & "x" https://a.test/#f=AB'));
  assert.equal(shareText(''), 'חבר שיתף/ה איתך מערכת שעות:');
});
// xss.test.mjs: the friends drawer has data-act="shareOut"
```

- [ ] **Step 2:** `node --test test/ui-text.test.mjs` — Expected: FAIL (`waUrl` לא מוגדר).
- [ ] **Step 3:** ליישם. ב-`ui-actions.js` הפעולה `shareOut` בונה את הקישור כמו `share` (שורה 37, `friendLink`), ואז `navigator.share({ title: 'המערכת שלי', text, url })` או `open(waUrl(text, url), '_blank', 'noopener')`.
- [ ] **Step 4:** `node --test test/ui-text.test.mjs test/xss.test.mjs` — PASS.
- [ ] **Step 5:** commit `feat: share my link to WhatsApp (native share sheet, wa.me fallback)`

### Task 2: רשימת תיוג לסיום התואר (קטן)

**הבעיה:** ההתקדמות מוצגת כפס אחד. הסטודנט לא רואה כמה חסר בכל רשימה (חברה ורוח: לפחות 4, פרויקט: 8, וכו׳).

**הפתרון:** `progressInfo` מחזיר גם `rows`, שורה לכל דרישה, מאותו חישוב שכבר קיים (`fill`), כך שהסכום תמיד תואם לפס. בעמוד "המצב שלי", בכרטיס "התקדמות", נוסף `<details>` בשם "מה נשאר לסיום התואר" עם שורה לכל דרישה: "שם · X מתוך Y נ״ז", ו-✓ כשהדרישה הושלמה.

- רשימות עם מינימום 0 לא מוצגות.
- ההתמחות היא שורה אחת: "התמחות" עם `need`.
- ההשלמה מעודפים היא שורה בשם "בחירה (מעבר למינימום)" עם `rest`, ורק כש-`rest > 0`.

**Files:**
- Modify: `web/map-layout.js:149-185` (`progressInfo`: לאסוף `rows` בתוך הלולאה ובשתי הקריאות האחרונות ל-`fill`)
- Modify: `web/ui-me.js:99-108` (כרטיס ההתקדמות)
- Test: `test/ui-map.test.mjs`, `test/xss.test.mjs`

**Interfaces — Produces:**
- `progressInfo(...).rows: Array<{ name: string, need: number, done: number, planned: number }>`. `name` הוא `listTitle`-גולמי: `l.name`, או `'התמחות'`, או `'בחירה (מעבר למינימום)'`. `done` ו-`planned` אחרי חיתוך ל-`need`, כלומר אותם ערכים שנכנסים לפס.

- [ ] **Step 1: בדיקות שנכשלות** (ב-`test/ui-map.test.mjs`)

```js
test('progressInfo rows: one per list with a minimum, the area, the rest; they add up to the bar', () => {
  const d = JSON.parse(readFileSync(new URL('../web/data/afeka/2027-1/11-2027.json', import.meta.url), 'utf8'));
  const all = Object.fromEntries(Object.keys(d.courses).map((c) => [c, { status: 'done' }])), p = progressInfo(d, all);
  assert.ok(p.rows.every((r) => r.need > 0), 'no "0 of 0" rows (English, entrepreneurship)');
  assert.equal(p.rows.reduce((s, r) => s + r.done, 0), p.done);
  assert.ok(p.rows.some((r) => r.name === 'בחירה (מעבר למינימום)'), 'computer science fills 120 from surplus');
  const none = progressInfo(d, {});
  assert.ok(none.rows.every((r) => r.done === 0));
});
```

- [ ] **Step 2:** `node --test test/ui-map.test.mjs` — FAIL (`rows` undefined).
- [ ] **Step 3:** ליישם. הסכום של `need` בשורות שווה ל-`degree` כשהנתונים מכסים את כל התואר. מה שהנתונים לא מכסים כבר מוצג כ-`untracked`.
- [ ] **Step 4:** רנדור ב-`ui-me.js` עם `esc(heb(listTitle(l)))` לשמות רשימות. להוסיף ל-xss scope `me` בדיקה שה-`<details>` קיים.
- [ ] **Step 5:** `node --test test/ui-map.test.mjs test/xss.test.mjs` — PASS.
- [ ] **Step 6:** commit `feat: degree checklist — credits per requirement on the status page`

### Task 3: תקרת ימים בקמפוס (קטן)

**הבעיה:** "ימים פנויים" אומר אילו ימים, לא כמה. מי שעובד רוצה "לכל היותר 3 ימים", ולא משנה אילו.

**הפתרון:** אילוץ מחייב `constraints.maxDays` (`null` או 1-6). ב-`dfs` הענף נגזם כשמספר הימים התפוסים במסכה המצטברת עולה על התקרה. זה מונוטוני (הוספת קורס לא מפנה יום), ולכן הגיזום בטוח.

- כשאין תוצאה, `diagnose` מוסיף: `"תקרת ${n} ימים בקמפוס קטנה מדי לקורסי החובה"`, כשהחובה בלי התקרה כן מסתדרת.
- ב-`searchYear` התקרה חלה על כל סמסטר בנפרד.
- UI: בחלק "עוד אפשרויות" במגירה, `<select>` "לכל היותר ימים בקמפוס" עם האפשרויות ללא, 1, 2, 3, 4, 5, 6.

**Files:**
- Modify: `web/solver-core.js:338-346` (`dfs`: `if (constraints.maxDays && daysUsed(merge(mask, o.mask)) > constraints.maxDays) continue;`), `web/solver-core.js` (`diagnose`)
- Modify: `web/app.js:15` (`DEFAULT.constraints.maxDays: null`), `web/app.js:32-40` (`CONSTRAINT_OK.maxDays: (v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 6)`)
- Modify: `web/ui-drawer.js:46-48`, `web/ui-actions.js` (`CHG.maxDays`)
- Test: `test/solver.test.mjs`, `test/app.test.mjs`

**Interfaces — Produces:** `constraints.maxDays: number | null`. ב-`solver-core.js`: `const daysUsed = (mask) => mask.filter((m, d) => d >= 1 && m !== 0).length`.

- [ ] **Step 1: בדיקות שנכשלות**

```js
test('maxDays: no plan uses more campus days; too low a cap explains itself', () => {
  const r = run({ courses: [{ id: 'A', mode: 'must' }, { id: 'B', mode: 'must' }], constraints: { maxDays: 2 } });
  for (const x of r.results) assert.ok(daysOf(x) <= 2);
  const none = run({ courses: [/* three musts on three different days in mini() */], constraints: { maxDays: 1 } });
  assert.equal(none.results.length, 0);
  assert.ok(none.diagnosis.some((t) => /תקרת 1 ימים/.test(t)));
});
// app.test.mjs: normalize keeps maxDays 3, drops 0, 7, 2.5 and '3'
```

- [ ] **Step 2:** `node --test test/solver.test.mjs test/app.test.mjs` — FAIL.
- [ ] **Step 3:** ליישם. `daysOf(x)` בבדיקה סופר ימים שונים ב-`meetings` של הקבוצות בתוצאה.
- [ ] **Step 4:** PASS. גם `test/solver-props.test.mjs` נשאר ירוק: התוצאות זהות עם גיזום ובלעדיו.
- [ ] **Step 5:** commit `feat: hard cap on campus days`

### Task 4: העדפה או הימנעות ממרצה (קטן)

**הבעיה:** אין דרך לומר "רק לא אצל X" או "אם אפשר, אצל Y".

**הפתרון:** שני מסננים מחייבים ב-`buildOptions`. זה לא משנה את פונקציית הניקוד ואת הגיזום, ולכן `solver-props` נשאר תקף.
- `avoid`: קבוצה ראשית שהמרצה שלה נמנע לא נכנסת.
- `prefer`: אם לקורס יש קבוצה ראשית אצל מרצה מועדף, רק קבוצות כאלה נכנסות. אם אין, כל הקבוצות נכנסות.
- `ponytail:` המסננים חלים רק על המרצה של הקבוצה הראשית. תרגולים מקושרים לא מסוננים. אפשר להרחיב אם יבקשו.
- `diagnose` לקורס בלי אף אפשרות: להוסיף "מרצה שנמנעתם ממנו" לרשימת הסיבות בסוגריים.

**מצב:** `constraints.lecturers: { [name: string]: 'prefer' | 'avoid' }`.
- ב-`normalize`: עד 30 רשומות, מפתח באורך עד 60, ערך מתוך שני הערכים.
- "איפוס העדפות" מאפס אותו (זו העדפה, לא עובדה כמו זמן תפוס).

**UI:**
- בחלון השיעור (`openPop`, `web/ui-grid.js:220-245`), ליד שם המרצה, שני כפתורים קטנים: "להעדיף" ו"להימנע" (`data-act="lecturer"`, עם `data-name` ו-`data-mode`, toggle).
- במגירת ההעדפות, חלק בשם "מרצים" עם רשימה, כפתור הסרה לכל שורה, ו-`esc` על כל שם.

**Files:**
- Modify: `web/solver-core.js:44` (`buildOptions(course, { ..., lecturers = {} })`), `web/solver-core.js:239-262` (להעביר את `constraints.lecturers`), `diagnose`
- Modify: `web/app.js` (`DEFAULT`, `CONSTRAINT_OK.lecturers`), `web/ui-grid.js`, `web/ui-drawer.js`, `web/ui-actions.js` (`ACT.lecturer`, `ACT.lecturerDrop`, איפוס)
- Test: `test/solver.test.mjs`, `test/app.test.mjs`, `test/xss.test.mjs` (שם מרצה עוין בחלון ובמגירה)

**Interfaces — Produces:** `buildOptions(course, { pins, includeFull, forbidden, friendGroups, lecturers })`. `lecturers` הוא אובייקט, וברירת המחדל `{}`.

- [ ] **Step 1: בדיקות שנכשלות**

```js
test('lecturers: avoid drops that lecturer’s groups, prefer keeps only theirs when they teach the course', () => {
  const c = { groups: [grp('g1', 1, '09:00', '11:00', { lecturer: 'כהן' }), grp('g2', 2, '09:00', '11:00', { lecturer: 'לוי' })] };
  assert.deepEqual(buildOptions(c, { lecturers: { 'כהן': 'avoid' } }).map((o) => o.groups[0]), ['g2']);
  assert.deepEqual(buildOptions(c, { lecturers: { 'לוי': 'prefer' } }).map((o) => o.groups[0]), ['g2']);
  assert.equal(buildOptions(c, { lecturers: { 'אחר': 'prefer' } }).length, 2, 'a preferred lecturer who does not teach it changes nothing');
});
// app.test.mjs: normalize keeps { 'כהן': 'avoid' }, drops bad values, caps at 30
```

(`grp` לא מיוצא מ-`test/fixtures/mini-data.mjs`: להוסיף לו `export` שם, בלי לשכפל אותו.)

- [ ] **Step 2:** FAIL → **Step 3:** ליישם → **Step 4:** `node --test test/solver.test.mjs test/solver-props.test.mjs test/app.test.mjs test/xss.test.mjs` PASS.
- [ ] **Step 5:** commit `feat: prefer or avoid a lecturer`

### Task 5: מה ההבדל בין שתי חלופות (קטן)

**הבעיה:** כדי להשוות חלופה 2 לחלופה 1 צריך לעבור הלוך וחזור (§14ז).

**הפתרון:** כשמוצגת חלופה מספר 2 ומעלה, מתחת לשורת הסיכום מופיעה שורה "לעומת חלופה 1: ...". כל המידע כבר מחושב ב-`metrics` (`info`). צריך רק לשמור אותו בתוצאה ולהשוות.

- **ימים:** "יום ד׳ פנוי" / "בלי יום ד׳ פנוי".
- **חברים:** "עם נועה" / "בלי נועה", לפי `shared[name] > 0`.
- **חלונות:** "שעה יותר חלונות" / "2 שעות פחות חלונות", בעיגול לחצי שעה. 0 = לא מוצג.
- **קורסים:** "+ שם קורס" / "− שם קורס".
- **פותחת:** "פותחת 2 קורסים יותר".
- בלי הבדל: "אותם קורסים, שיבוץ אחר".
- **בתוצאה של שנה מלאה (`isPair`):** משווים כל סמסטר בנפרד, עם הכותרת "סמסטר א׳:" או "סמסטר ב׳:", ולא מציגים סמסטר שאין בו הבדל.

**Files:**
- Modify: `web/solver-core.js:325-330` (`top.push({ ..., info })`)
- Modify: `web/ui-text.js` (`compareAlts(a, b, data) -> string[]`)
- Modify: `web/ui-view.js:95-115` (שורה מתחת לסיכום, `esc` על כל חלק, `aria-live` לא משתנה)
- Test: `test/ui-text.test.mjs`, `test/xss.test.mjs`

**Interfaces — Produces:**
- `result.info: { shared: Record<string, number>, freeDays: number[], gapMin: number, minGap: number | null }`.
- `compareAlts(cur, best, data) -> string[]` (טקסט גולמי, ה-escape מתבצע ברנדור).

- [ ] **Step 1: בדיקות שנכשלות**

```js
test('compareAlts names what changes: free day, friend, gaps, courses, unlocks', async () => {
  const { compareAlts } = await import('../web/ui-text.js');
  const data = { courses: { A: { name: 'פיזיקה' }, B: { name: 'כימיה' } } };
  const best = { courses: ['A'], unlocks: 1, info: { shared: { 'נועה': 1 }, freeDays: [], gapMin: 60, minGap: null } };
  const cur = { courses: ['A', 'B'], unlocks: 3, info: { shared: { 'נועה': 0 }, freeDays: [4], gapMin: 0, minGap: null } };
  assert.deepEqual(compareAlts(cur, best, data), ['יום ד׳ פנוי', 'בלי נועה', 'שעה פחות חלונות', '+ כימיה', 'פותחת 2 קורסים יותר']);
  assert.deepEqual(compareAlts(best, best, data), ['אותם קורסים, שיבוץ אחר']);
});
```

- [ ] **Step 2:** FAIL → **Step 3:** ליישם (הסדר במערך כמו בבדיקה) → **Step 4:** PASS, ו-`test/solver.test.mjs` ירוק (שדה נוסף בתוצאה).
- [ ] **Step 5:** בדפדפן: חלופה 2 מציגה את השורה, וחלופה 1 לא.
- [ ] **Step 6:** commit `feat: what changes against the best alternative`

### Task 6: ייצוא ללוח שנה (`.ics`) (בינוני)

**הבעיה:** את הרשימה להרשמה אפשר רק להעתיק כטקסט (§14י).

**הפתרון:** כפתור "הוסף ללוח שנה" במגירה "רשימה להרשמה" מוריד קובץ `afeka-<year>.ics`.
- **שיעורים:** כל מפגש של כל קבוצה שנבחרה הופך ל-`VEVENT` שבועי, `RRULE:FREQ=WEEKLY;UNTIL=<סוף השיעורים>T235959`. האירוע מתחיל במופע הראשון של היום שלו מתאריך תחילת הסמסטר.
- **ימים בלי לימודים** מוחרגים ב-`EXDATE`, אחד לכל מופע שנופל עליהם.
- **בחינות** עם `date` הופכות לאירועי יום שלם (`DTSTART;VALUE=DATE`), ואם יש להן `time`, לאירוע של שלוש שעות.

**תאריכי תשפ״ז, מאומתים** ב-2026-10-03 מול [לוח השנה האקדמי של אפקה](https://www.afeka.ac.il/about-afeka/general-information/academic-calendar/). הימים בשבוע חושבו:

| סמסטר | פתיחה | סוף השיעורים | העמודה השלישית בדף* | שבועות |
|---|---|---|---|---|
| א׳ | 25.10.26 (א׳) | 22.01.27 (ו׳) | 24.01.27 (א׳) | 13 |
| ב׳ | 14.03.27 (א׳) | 25.06.27 (ו׳) | 29.06.27 (ג׳) | 15 |
| קיץ | 08.08.27 (א׳) | 17.09.27 (ו׳) | 19.09.27 (א׳) | 6 |

\*העמודה השלישית נופלת אחרי סוף השיעורים, כנראה תחילת תקופת הבחינות. הייצוא לא משתמש בה: הבחינות באות מ-`exams` בנתונים.

ימים בלי לימודים בתוך הסמסטרים:
- **א׳:** חנוכה 06.12.26, לסטודנטים בלבד.
- **ב׳:** פורים 23.03.27; פסח 21.04.27-29.04.27; יום הזיכרון 11.05.27 (לסטודנטים בלבד); יום העצמאות 12.05.27; שבועות 10.06.27-11.06.27.
- **קיץ:** אין.

(שמחת תורה 03.10.26 וחגי תשרי תשפ״ח נופלים מחוץ לסמסטרים.)

**הקבוע** ב-`web/ics.js` (לעדכן פעם בשנה, יחד עם נוהל מעבר השנה ב-README):

```js
export const SEMESTER_DATES = { // Afeka academic calendar, checked 2026-10-03
  2027: {
    'א': { start: '2026-10-25', end: '2027-01-22', off: ['2026-12-06'] },
    'ב': { start: '2027-03-14', end: '2027-06-25', off: ['2027-03-23', ['2027-04-21', '2027-04-29'], '2027-05-11', '2027-05-12', ['2027-06-10', '2027-06-11']] },
    'קיץ': { start: '2027-08-08', end: '2027-09-17', off: [] },
  },
};
```

**שנה בלי תאריכים** (`SEMESTER_DATES[year]` חסר): לא מורידים קובץ שגוי. הכפתור כבוי, וליד יש הודעה "לוח השנה של <שנה> עוד לא הוזן". אין דיאלוג תאריכים, כי YAGNI: מעבר שנה מוסיף את השורה.

**החלטות:**
- **שעה "צפה"** (בלי TZID): היומן מפרש לפי השעון של המכשיר, ובישראל זה נכון. אין צורך בבלוק `VTIMEZONE`, שאאוטלוק דורש כשיש TZID.
- **`UID`:** `${groupId}-${day}-${start}@afeka-scheduler`, יציב בין ייצואים, כך שייבוא חוזר מעדכן ולא משכפל.
- **escape לפי RFC 5545:** `\` → `\\`, `;` → `\;`, `,` → `\,`, שורה חדשה → `\n`. שורות של יותר מ-75 octets מקופלות.
- **הורדה:** `Blob` עם `type: 'text/calendar'` ו-`<a download>`. אין שרת ואין פנייה החוצה.

**Files:**
- Create: `web/ics.js` (טהור, בלי DOM)
- Modify: `web/ui-drawer.js:121` (כפתור `data-act="ics"`, כבוי בלי תאריכים), `web/ui-actions.js` (`ACT.ics`: `toIcs` והורדה), `README.md` (נוהל מעבר שנה: לעדכן גם את `SEMESTER_DATES`)
- Test: `test/ics.test.mjs`

**Interfaces — Produces:**
- `toIcs(parts: Array<{ title: string | null, res, data, dates: { start: string, end: string, off: Array<string | [string, string]> } }>, now: Date) -> string`. `parts` הם `regParts(current())`, ו-`dates` הוא `SEMESTER_DATES[data.year][data.semester]`.
- `firstOn(start: string, day: 1-6) -> string`: התאריך הראשון שבו `getUTCDay() + 1 === day`, החל מ-`start`.
- `SEMESTER_DATES` כמו בקבוע למעלה.

- [ ] **Step 1: בדיקות שנכשלות** (`test/ics.test.mjs`)

```js
test('toIcs: one weekly event per meeting from the first matching day, escaped text, stable UID, CRLF', () => {
  const data = { courses: { 101: { name: 'פיזיקה, א; "ב"', groups: [{ id: 'g1', lecturer: 'כהן', primary: true,
    meetings: [{ day: 3, start: '09:00', end: '10:50', room: 'A1' }], exams: [{ kind: 'סופי', moed: 'א', date: '2027-02-01' }] }] } } };
  const dates = SEMESTER_DATES[2027]['א'];
  const out = toIcs([{ title: null, res: { courses: ['101'], groups: ['g1'] }, data, dates }], new Date('2026-10-01T00:00:00Z'));
  assert.match(out, /^BEGIN:VCALENDAR\r\n/);
  assert.match(out, /DTSTART:20261027T090000\r\n/); // 25.10.2026 is a Sunday: the first Tuesday (day 3) is 27.10
  assert.match(out, /RRULE:FREQ=WEEKLY;UNTIL=20270122T235959/);
  assert.match(out, /SUMMARY:פיזיקה\\, א\\; "ב"/);
  assert.match(out, /UID:g1-3-0900@afeka-scheduler/);
  assert.match(out, /DTSTART;VALUE=DATE:20270201/);
  assert.ok(out.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75));
  assert.doesNotMatch(out, /EXDATE/, 'a Tuesday meeting never falls on Chanukah (Sunday 06.12.26)');
  const sunday = structuredClone(data);
  sunday.courses[101].groups[0].meetings[0].day = 1;
  assert.match(toIcs([{ title: null, res: { courses: ['101'], groups: ['g1'] }, data: sunday, dates }], new Date()), /EXDATE:20261206T090000/);
});
test('toIcs: a holiday range skips every meeting inside it (Passover 21-29.04.27, a Wednesday meeting: 21.04 and 28.04)', () => {
  const data = { courses: { 9: { name: 'x', groups: [{ id: 'g', lecturer: '', primary: true, meetings: [{ day: 4, start: '12:00', end: '13:00', room: '' }], exams: [] }] } } };
  const out = toIcs([{ title: null, res: { courses: ['9'], groups: ['g'] }, data, dates: SEMESTER_DATES[2027]['ב'] }], new Date());
  assert.match(out, /EXDATE:20270421T120000/); assert.match(out, /EXDATE:20270428T120000/); assert.match(out, /EXDATE:20270512T120000/); // Independence Day
});
test('firstOn: the start date itself when it is that day', () => {
  assert.equal(firstOn('2026-10-25', 1), '2026-10-25');
  assert.equal(firstOn('2026-10-25', 6), '2026-10-30');
});
```

- [ ] **Step 2:** `node --test test/ics.test.mjs` — FAIL (המודול לא קיים).
- [ ] **Step 3:** ליישם את `web/ics.js`. בתוצאה של שנה מלאה: `parts` לכל סמסטר עם תאריך משלו, ו-`SUMMARY` עם שם הקורס בלבד. `LOCATION` = חדר, `DESCRIPTION` = `קבוצה ${id} · ${lecturer}`.
- [ ] **Step 4:** PASS. אחר כך UI: כפתור במגירה, כבוי עם הודעה כשאין `SEMESTER_DATES[year]`. בדיקת xss: המגירה עם שם קורס עוין.
- [ ] **Step 5:** בדפדפן: הקובץ יורד, ופתיחתו ב-Google Calendar (ייבוא) מציגה את השיעורים ביום ובשעה הנכונים. אם אין גישה, לבדוק את הקובץ מול validator מקומי, למשל קריאה חוזרת של השורות בבדיקה.
- [ ] **Step 6:** commit `feat: export the plan to a calendar (.ics)`

### Task 7: סגירה

- [ ] `npm test` — הכל ירוק.
- [ ] `docs/ISSUES.md`: לסמן את §14י ואת שורות §17ג כ"תוקן" עם hash. README "מה אפשר לעשות": שורה לכל תכונה.
- [ ] סקירה סופית של הענף (reviewer אחד, opus), סבב תיקון אחד, merge ל-`main`, push, deploy (המתנה אחת ברקע).

## לא בתוכנית

- **ניקוד "רך" למרצה מועדף** (מדד נוסף במשקלות): דורש הרחבה של `bound()`. המסנן המחייב מכסה את הבקשה. להוסיף רק אם יבקשו "אם אפשר".
- **תמונה מקדימה לקישור בוואטסאפ:** דורשת שרת (§17ג).
