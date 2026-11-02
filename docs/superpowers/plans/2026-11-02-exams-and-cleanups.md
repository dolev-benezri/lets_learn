# תוכנית: מועדי בחינות מעמודי הקורסים, ושני ניקיונות

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**מטרה:** מועדי הבחינות של כל השנה מגיעים לאתר בלי להוסיף בקשה לריצה הלילית; `check-real` לא נכשל על חיפוש שנקטע או על שתי בחינות באותו יום; `cache-seed` נמחק.

**גישה:** משיכה חד-פעמית ידנית שומרת את המועדים בקובץ `scripts/exams-2027.json` בריפו. הריצה הלילית קוראת את הקובץ ומעבירה אותו לבנייה הקיימת. רענון רק ביד (הבעלים, 02.11: תאריכי בחינות כמעט לא משתנים).

**כלים:** Node (`node --test`), `node-html-parser` דרך `scripts/parse.mjs`, `gh`.

**מקור:** הבעלים, 02.11. אין מסמך אפיון נפרד; הממצאים למטה הם הבסיס. Codex (gpt-6.1-sol, high) עבר על הגרסה הראשונה מול הקוד, והממצאים שאומתו כבר בתוך המשימות.

## ממצאים (נמדדו ב-02.11 מול האתר החי)

- הריצה של 01.11: `cache seeded: published-at 2026-10-21T18:13:53.421Z (was none)` ו-`Created cache`. כלומר הזריעה עבדה, ומאז יש ל-GitLab מטמון משלו.

- המשיכה החד-פעמית הושלמה ב-02.11, בעותק נפרד: 562 צירופי קורס וסמסטר, 316 עם מועד (א' 145, ב' 140, קיץ 31), תאריכים 2027-01-24 עד 2027-10-28, סוג שורה יחיד `בחינה`. עם המבחנים בעותק: `npm test` 696 מתוך 696, `check:real` בלי כשלים (גם בלי תיקוני משימה 1), ו-81 מתוך 563 תרחישים בלי מערכת, בדיוק כמו בלי מבחנים. בטלפון, ברוחב 375 ו-320 פיקסלים, האתר לא נשבר.
- `S_EXAMS` מחזיר "לא נמצאו נתונים" לתשפ"ז בכל 19 המחלקות שנבדקו, בכל ערכי סמסטר ושנה שנוסו. לתשפ"ו הוא מחזיר 162 שורות, אז הבקשה והמפענח תקינים.
- המועדים נמצאים ב-`S_CourseDetails` של קבוצה: `מועד 1 : בחינה 27/01/2027 13:00`. הארגומנט השני של הקישור הוא הסמסטר (`-N1`, `-N2`, `-N3`).
- מדגם אקראי של 30 קורסים (41 צירופי קורס וסמסטר, 12 עם כמה מרצים): המרצים לא נבדלו באף צירוף. לכן קבוצה אחת לכל קורס וסמסטר מספיקה.
- 19 מתוך 41 הצירופים בלי מועד. זה תקין (פרויקטים, מעבדות). סוג השורה היחיד שנראה: `בחינה`.
- היקף: 559 צירופים של קורס וסמסטר. בקצב של 400 בקשות בשעה זה כשעה וחצי עד שעתיים, בלי עלות CI.
- חשש מ-`partial:true`: **התגלה קטן מכפי שהוצג.** בכל 144 הקבצים, במגבלות של 1500, 200 ו-20 מ"ש, אף חיפוש לא נקטע בלי תוצאה ואין כשלים. במגבלה של 1 מ"ש יש חיפוש אחד כזה, ועדיין 0 כשלים. התיקון נשאר כי הוא קצר, והשורה ב-265-266 תקרוס על `rs.results[0]` אם נפתור רק חלק.
- סיכון חדש שאותו מצאנו בדרך: `loose` ב-`check-real` לא מרפה את `examsSameDay`, ו-`fits` מתעלם ממבחנים. עם מבחנים אמיתיים, התנגשות בין קורסי חובה תיראה כמו "brute force finds one" או "relaxing loses every plan", והבדיקה על הנתונים החיים תעצור את ה-deploy.

## אילוצים כלליים

- לא דוחפים ולא ממזגים ל-`main` לפני שמשימה 4 עברה.
- לא מוסיפים בקשה לריצה הלילית. `S_EXAMS` נשאר כמו שהוא; אם הטבלה תתפרסם, שורותיה קודמות לשורות מהקובץ.
- לא מרעננים את העותק הקפוא (`test/fixtures/real/`). הוא נשאר בלי מבחנים.
- לא מתחייבים נתונים ב-`web/data/afeka` מהמשיכה המקומית: הריצה הלילית כותבת אותם, אחרת GitLab יעצור לילות כי המטמון שלו מאחור.
- בלי טקסט ממשק חדש. קבצים חדשים בלי פרטים אישיים.
- בדיקה ממוקדת אחרי כל שינוי. `npm test` המלא פעם אחת לפני המיזוג.

## מוקדי סקירה

1. קבוצה ראשית עם שם מרצה ריק: השורות מהקובץ (`lecturer: null`) מגיעות גם אליה ולא רק אליה. נבדק במשימה 3.
2. טבלת `S_EXAMS` מתפרסמת בעתיד: שורה לפי מרצה קודמת, ושורת הקובץ ממלאה רק קבוצות שאין להן בחינה מהסוג הזה. נבדק במשימה 3.
3. עמוד פרטים עם הכותרת `תאריך בחינה` בלי אף מועד, או עמוד בלי הכותרת: אפס שורות, בלי קריסה. נבדק במשימה 2.
4. קורס שאין לקבוצה הראשית שלו `detailsArgs`, או שאין לו קבוצות: מדולג בלי בקשת פרטים. נבדק במשימה 3.
5. קובץ שמור עם תאריך מחוץ לחלון השנה יפיל את כל הלילה ב-`validate`: בדיקה על הקובץ השמור נכשלת עוד לפני המיזוג. נבדק במשימה 4.
6. תוכנית שאף אחד מהקורסים שלה לא מופיע בקובץ: `examsPublished` נשאר `false`, והפותר לא נותן ציון מלא על "פיזור בחינות" שלא קיים. נבדק במשימה 3.
7. משפט בתקציר הקורס שנראה כמו מועד: לא נספר כבחינה, כי הקריאה מוגבלת לקטע `תאריך בחינה`. נבדק במשימה 2.

---

### משימה 1: `check-real` לא מאשים חיפוש שנקטע או בחינות באותו יום

**קבצים:** `scripts/check-real.mjs:243-272`, `test/check-real.test.mjs`

- [ ] **1.1: כתיבת בדיקה נכשלת** אחרי הבדיקה `no plan: a solver that finds nothing...`:

```js
test('a cut-off search with no plan is not a failure in any run; a complete one still is', () => {
  const f = '2027-1/19-2026.json', d = real(f), opts = (solve) => ({ scenarios: ['S2'], solve });
  const cut = { results: [], partial: true, diagnosis: ['could not tell'] };
  const none = { results: [], partial: false, diagnosis: ['x'] };
  const relaxed = (a) => a.constraints.includeFull === true;
  const shuffled = (a) => a.data !== d;
  assert.deepEqual(checkFile(f, d, opts((a) => (relaxed(a) ? cut : search(a)))), []);
  assert.deepEqual(checkFile(f, d, opts((a) => (shuffled(a) ? cut : search(a)))), []);
  assert.deepEqual(checkFile(f, d, opts((a) => (relaxed(a) ? cut : none))), []);
  assert.ok(checkFile(f, d, opts((a) => (relaxed(a) ? none : search(a)))).some((e) => /relaxing the constraints loses/.test(e)));
  assert.ok(checkFile(f, d, opts((a) => (shuffled(a) ? none : search(a)))).some((e) => /shuffled order finds no plan/.test(e)));
});
test('the relaxed search also allows two exams on one day', () => {
  const f = '2027-1/19-2026.json', seen = [];
  checkFile(f, real(f), { scenarios: ['S2'], solve: (a) => (seen.push(a.constraints), search(a)) });
  assert.ok(seen.some((c) => c.includeFull === true && c.examsSameDay === 'allow'));
});
test('checkPlan: two first-sitting exams on one day are flagged, unless the student allows it', () => {
  const d = structuredClone(mini());
  d.examsPublished = true;
  const on = { kind: 'בחינה', moed: 1, date: '2027-02-01', time: null };
  for (const [cid, gid] of [['A', 'A1'], ['Q', 'Q1']]) d.courses[cid].groups.find((g) => g.id === gid).exams = [on];
  const plan = { courses: ['A', 'Q'], groups: ['A1', 'A1/1', 'Q1'] };
  assert.ok(checkPlan(d, rec(), plan, {}).some((e) => /same-day exams/.test(e)));
  assert.ok(!checkPlan(d, rec(), plan, { examsSameDay: 'allow' }).some((e) => /same-day exams/.test(e)));
  d.examsPublished = false;
  assert.ok(!checkPlan(d, rec(), plan, {}).some((e) => /same-day exams/.test(e)));
});
```

- [ ] **1.2:** `node --test --test-name-pattern="cut-off search|two exams on one day|first-sitting" test/check-real.test.mjs`. צפוי: 3 כשלים.
- [ ] **1.3: תיקון ב-`checkFile`:** מוסיפים `const noPlan = (x) => !x.results.length && !x.partial;` ומשתמשים בו בשורה 248 על ריצת `loose`, בשורה 272, ובשורה 265 (`if (noPlan(rs)) ...; else if (rs.results.length) { ... }`). מוסיפים `examsSameDay: 'allow'` ל-`loose`.
- [ ] **1.4: תיקון ב-`checkPlan`:** כש-`data.examsPublished` ו-`constraints.examsSameDay !== 'allow'`, אוספים מהקבוצות בתוכנית את התאריכים של `kind === 'בחינה' && moed === 1`, ועל כל תאריך כפול מוסיפים שגיאה `same-day exams: <date>`. זו בדיקה עצמאית של הכלל שהפותר אוכף (`solver-core.js:559`).
- [ ] **1.5:** אותה פקודה ו-`node --test test/check-real.test.mjs`. צפוי: הכול עובר.
- [ ] **1.6: commit** `fix(check-real): a cut-off search proves nothing; exams on one day are checked and relaxed`

### משימה 2: קריאת מועדים מעמוד פרטי הקורס

**קבצים:** `scripts/parse.mjs`, `test/parse.test.mjs`, יצירה: `scripts/fixtures/details-exams.html` (עמוד אמיתי שנשמר ב-02.11, `-N90902,-N1,-N1,-N279090224,-N`)

**מייצר:** `parseCourseExams(html) -> [{ kind: 'בחינה' | 'בוחן אמצע', moeds: [{ moed, date, time }] }]`, שורה אחת לכל סוג, כמו `parseExams` בלי השדות של מרצה, קורס וסמסטר.

- [ ] **2.1: בדיקה נכשלת:**

```js
test('parseCourseExams reads the moeds of a course page', () => {
  assert.deepEqual(parseCourseExams(fx('details-exams.html')), [{
    kind: 'בחינה',
    moeds: [{ moed: 1, date: '2027-01-27', time: '13:00' }, { moed: 2, date: '2027-02-17', time: '17:00' }]
  }]);
});
test('parseCourseExams: no label, or a label with no moed, is no exam', () => {
  assert.deepEqual(parseCourseExams('<article>נקודות זכות : 3</article>'), []);
  assert.deepEqual(parseCourseExams('<strong> תאריך בחינה : </strong><br></div>'), []);
});
test('parseCourseExams: a quiz row is its own kind', () => {
  const r = parseCourseExams('<strong> תאריך בחינה : </strong><br> מועד 1 : בוחן 10/12/2026 09:00<br> מועד 1 : בחינה 27/01/2027<br>');
  assert.deepEqual(r.map((x) => x.kind).sort(), ['בוחן אמצע', 'בחינה']);
  assert.equal(r.find((x) => x.kind === 'בחינה').moeds[0].time, null);
});
test('parseCourseExams: a sentence in the summary that looks like a moed is not an exam', () => {
  const page = '<article><strong> תאריך בחינה : </strong><br> מועד 1 : בחינה 27/01/2027 13:00</article>'
    + '<article><h1><u>תקציר: </u></h1><div>מועד 2 : בחינה 01/01/2020 08:00</div></article>';
  assert.deepEqual(parseCourseExams(page)[0].moeds, [{ moed: 1, date: '2027-01-27', time: '13:00' }]);
});
```

- [ ] **2.2:** `node --test --test-name-pattern=parseCourseExams test/parse.test.mjs`. צפוי: כשל, הפונקציה לא קיימת.
- [ ] **2.3:** מימוש ב-`parse.mjs`. לוקחים את ה-`article` שה-`strong` שלו מכיל `תאריך בחינה`, ורק על הטקסט שלו מריצים `/מועד (\d)\s*:\s*(\S+)\s+(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{2}:\d{2}))?/g`. שימוש חוזר ב-`toIsoDate`, ב-`EMPTY_TIME` ובכלל `startsWith('בוחן')` של `parseExams`. (הבדיקה עם `</div>` בלי `article` מכסה עמוד שמבנהו השתנה: אפס שורות.)
- [ ] **2.4:** אותה פקודה. צפוי: עובר.
- [ ] **2.5: commit** `feat(parse): read exam dates from a course details page`

### משימה 3: משיכה ידנית, וחיבור הקובץ לריצה הלילית

**קבצים:** יצירה: `scripts/pull-exams.mjs`, `test/pull-exams.test.mjs`. שינוי: `scripts/scrape.mjs`, `scripts/build.mjs:73,89`, `web/ui-grid.js:389`, `.gitignore`, `test/build.test.mjs`, `test/scrape.test.mjs`

**מייצר:**
- `detailsToPull(groups) -> [{ semester, args }]` ב-`pull-exams.mjs`, פונקציה טהורה: הקבוצה הראשית הראשונה עם `detailsArgs` לכל ערך של הארגומנט השני (`-N1` א, `-N2` ב, `-N3` קיץ). קוד אחר מדולג.
- `pullExams({ ids, request, log }) -> rows`, כאשר שורה היא `{ semester, courseId, lecturer: null, kind, moeds }`. שורה בלי `moeds` לא נכתבת.
- `loadPulledExams(year) -> rows` ב-`scrape.mjs`: קורא `scripts/exams-${year}.json` יחסית ל-`import.meta.url`, ו-`[]` אם אין קובץ.
- `run({ ..., pulledExams = [] })`: הבנייה מקבלת `exams: [...examsOf.get(u.cfg.dept), ...pulledExams]`. `main()` מעביר `loadPulledExams(opt.year)`. ברירת המחדל `[]` משאירה את הבדיקות הקיימות כמו שהן.
- שורת CLI: `node scripts/pull-exams.mjs [--year 2027]`. הקורסים: כל מי שיש לו קבוצות ב-`web/data/afeka` של השנה. משתמש ב-`patient` וב-`cachedRequester` על תיקייה משלו, `.yedion-exams-cache/`, בלי `ttl`. כך הרצה שנעצרה ממשיכה מאיפה שנעצרה, ו**רענון הוא מחיקת התיקייה**, בלי דגל נוסף. כותב רק בסוף, ורק אם יש שורות, ממוין לפי קורס וסמסטר, שורה לכל רשומה.
- `scripts/pull-exams.mjs` מוסיף הערת `ponytail:`: קבוצה אחת לכל קורס וסמסטר, כי המרצים לא נבדלו במדגם; אם יימצא קורס עם מועד שונה לפי מרצה, למשוך לפי מרצה.
- `examsPublished` ב-`build.mjs:89` מחושב מהבחינות שבאמת נכנסו לקובץ: `Object.values(courses).some((c) => c.groups.some((g) => g.exams.length))`.
- בחלון הקורס (`ui-grid.js:389`) השעה מוצגת אחרי התאריך כשהיא ידועה.

- [ ] **3.1: בדיקות נכשלות:**

```js
// test/pull-exams.test.mjs
const g = (detailsArgs, primary = true) => ({ primary, detailsArgs });
test('detailsToPull: the first primary group of each semester; no link, not primary or an unknown code is skipped', () => {
  assert.deepEqual(detailsToPull([
    g('-NA,-N1,-N1,-N11,-N'), g('-NA,-N1,-N1,-N12,-N'), g('-NA,-N2,-N1,-N21,-N'),
    g(null), g('-NA,-N3,-N1,-N31,-N', false), g('-NA,-N9,-N1,-N91,-N')
  ]), [{ semester: 'א', args: '-NA,-N1,-N1,-N11,-N' }, { semester: 'ב', args: '-NA,-N2,-N1,-N21,-N' }]);
  assert.deepEqual(detailsToPull([]), []);
});
test('pullExams: rows carry course, semester and no lecturer; a page with no exam gives none', async () => {
  const DETAILS = readFileSync(new URL('../scripts/fixtures/details-exams.html', import.meta.url), 'utf8');
  const groupsPage = readFileSync(new URL('../scripts/fixtures/groups-90903.html', import.meta.url), 'utf8'); // the fixture parseGroups is tested on; use the real file name
  const asked = [];
  const request = async (q) => {
    asked.push(q);
    return q.includes('S_LOOK_FOR_NOSE') ? groupsPage : DETAILS;
  };
  const rows = await pullExams({ ids: ['90903'], request, log: () => {} });
  assert.ok(rows.length >= 1);
  assert.equal(new Set(asked.filter((q) => q.includes('S_CourseDetails'))).size, asked.filter((q) => q.includes('S_CourseDetails')).length);
  for (const r of rows) assert.deepEqual([r.courseId, r.lecturer, r.kind], ['90903', null, 'בחינה']);
});

// test/build.test.mjs, on a dataset helper with one course A and the primary groups g1 (lecturer 'כהן') and g2 (lecturer '')
const row = (lecturer, date) => ({ semester: 'א', courseId: 'A', lecturer, kind: 'בחינה', moeds: [{ moed: 1, date, time: null }] });
test('exam rows with no lecturer reach every group without an exam, and a row by lecturer goes first', () => {
  const d = build({ exams: [row(null, '2027-02-02'), row('כהן', '2027-02-01')] });
  assert.deepEqual(dates(d, 'g1'), ['2027-02-01']);
  assert.deepEqual(dates(d, 'g2'), ['2027-02-02']);
});
test('examsPublished: true only when an exam reached this file', () => {
  assert.equal(build({ exams: [{ ...row(null, '2027-02-02'), courseId: 'NOT_HERE' }] }).examsPublished, false);
  assert.equal(build({ exams: [] }).examsPublished, false);
  assert.equal(build({ exams: [row(null, '2027-02-02')] }).examsPublished, true);
});

// test/scrape.test.mjs, in the shape of the run tests at :253
test('run passes the pulled exam rows to the build', async () => {
  // run({ ..., pulledExams: [row for the anchor course] }), then read the written file
  assert.equal(written.courses[ANCHOR].groups.find((g) => g.primary).exams[0].date, '2027-02-02');
});
test('loadPulledExams: a year with no file is empty', async () => assert.deepEqual(await loadPulledExams(2099), []));

// test/xss.test.mjs or the popup's existing test
test('the course popup shows an exam time when it is known', () => { /* render with { moed: 1, date, time: '13:00' }: the text has 13:00; with time null it has no stray separator */ });
```

- [ ] **3.2:** `node --test test/pull-exams.test.mjs` ו-`node --test --test-name-pattern="no lecturer|examsPublished: true|pulled exam|loadPulledExams|exam time" test/build.test.mjs test/scrape.test.mjs test/xss.test.mjs`. צפוי: כשלים.
- [ ] **3.3:** מימוש. ב-`build.mjs:73`: `const hits = row.lecturer == null ? [] : prim.filter(...)`. מוסיפים `.yedion-exams-cache/` ל-`.gitignore`.
- [ ] **3.4:** אותן פקודות. בנוסף `node --test test/build.test.mjs`: הבדיקה הקיימת `real exam page` צריכה להישאר ירוקה עם `examsPublished` החדש. צפוי: עובר.
- [ ] **3.5: commit** `feat(exams): a by-hand exam pull kept in the repo, read by the nightly build`

### משימה 4: המשיכה עצמה ובדיקה על נתונים אמיתיים

**קבצים:** יצירה: `scripts/exams-2027.json`. שינוי: `test/pull-exams.test.mjs`, `docs/DEVELOPING.md`

- [ ] **4.1:** המשיכה החד-פעמית רצה כבר מ-02.11 לתיקייה זמנית, בלי לגעת בריפו (הבעלים אישר). מעתיקים את התשובות שלה ל-`.yedion-exams-cache/2027/` ומריצים `node scripts/pull-exams.mjs`, כך שהקובץ נוצר בקוד האמיתי בלי למשוך שוב. משווים לתוצאה של המשיכה הזמנית: אותן שורות.
- [ ] **4.2: בדיקה על הקובץ השמור:**

```js
test('scripts/exams-2027.json: every row is one the build and validate accept', async () => {
  const rows = await loadPulledExams(2027);
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.ok(['א', 'ב', 'קיץ'].includes(r.semester), r.courseId);
    assert.equal(r.lecturer, null);
    assert.ok(['בחינה', 'בוחן אמצע'].includes(r.kind), r.courseId);
    assert.ok(r.moeds.length > 0, r.courseId);
    for (const m of r.moeds) {
      assert.ok(Number.isInteger(m.moed) && /^\d{4}-\d{2}-\d{2}$/.test(m.date), r.courseId);
      assert.ok(m.date >= '2026-09-01' && m.date <= '2027-11-30', `${r.courseId} ${m.date}`);
    }
  }
});
```

- [ ] **4.3: בנייה מקומית בלי כתיבה קבועה:** `node scripts/scrape.mjs --all-semesters --all-programs --cache .yedion-cache --offline`. אם חסרה תשובה במטמון, משלימים פעם אחת בלי `--offline`, עם `--wait-throttle`. צפוי: `web/data/afeka` מכיל `exams` ו-`examsPublished: true`.
- [ ] **4.4: מול הנתונים האלה:** `npm test` ו-`npm run check:real`. צפוי: 0 כשלים. מודדים גם כמה תרחישי S1 ו-S2 נשארים בלי מערכת, לפני ואחרי, ומדווחים לבעלים. קפיצה משמעותית פירושה שבחינות חובה נופלות באותו יום; לעצור ולשאול.
- [ ] **4.5: סעיף הבחינות של #9, במקום ההשוואה הידנית שהוא ביקש:** בדפדפן (תצוגה מקדימה של האתר), תוכנית 30-2026 ברוחב 375 ו-320 פיקסלים: הבחינות מוצגות בחלון הקורס עם השעה, בתאריך קריא (היום זה `2027-01-27`, טקסט שאף סטודנט לא ראה; אם הוא נראה רע, לעצור ולשאול את הבעלים), קורס בלי בחינה לא נשבר, האפשרות "לא שתי בחינות ביום" פועלת, ו-ICS כולל את המועדים. שמירת צילום מסך.
- [ ] **4.6:** החזרה: `git checkout -- web/data/afeka`, ו-`git status` מראה רק את הקבצים של המשימה.
- [ ] **4.7: תיעוד:** ב-`docs/DEVELOPING.md`, בסעיף "משיכה ידנית": למה הקובץ קיים, פקודת הרענון, ושהלילה לא מושך אותו. מעדכנים את ההערה ב-`ci/gitlab-scrape.yml:7` רק אם היא מטעה.
- [ ] **4.8: commit** `data: exam dates for 2027 from the course pages`

### משימה 5: הסרת `cache-seed`, מיזוג וסיום

**קבצים:** `ci/gitlab-scrape.yml:23-31`

הלילה לא צריך יותר את הזריעה: היא עבדה ב-01.11 (ראו ממצאים), והשינוי הזה לא מבקש דף חדש. נשאר לוודא לילה אחד שהמטמון של GitLab באמת נטען.

- [ ] **5.1:** מחיקת שורות 23-31 (שתי ההערות ושלב `curl`). `grep -r cache-seed ci scripts test` לא מחזיר כלום.
- [ ] **5.2: commit** `ci: remove the one-off cache seed step`
- [ ] **5.3:** סבב תיקונים עם Codex על כל הענף, `npm test` ו-`npm run check:real`, ומיזוג ל-`main`.
- [ ] **5.4: בלילה שאחרי:** קריאה אחת של הריצה ושל ה-deploy (ללא polling). בלוג: המטמון נטען (`Successfully extracted cache`, לא `Failed to extract cache`), והריצה הצליחה. `git show origin/main:web/data/afeka/2027-1/30-2026.json` מכיל `examsPublished: true`, והאתר החי מציג מועדים. עדכון הזיכרון ו-`NOTES.md`.
- [ ] **5.5: מחיקה בלתי הפיכה, רק אחרי ש-5.4 עבר:** `gh release delete cache-seed --cleanup-tag --yes -R dolev-benezri/lets_learn`. נבדק מראש: release אחד בשם "cache-seed (one-off, delete after 1.11)", קובץ של 2 MB. שמירה עד אחרי 5.4 עולה כלום: אחרי 5.1 אף אחד לא מוריד אותו.
