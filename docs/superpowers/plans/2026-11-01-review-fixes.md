# תוכנית פתרון: ממצאי הסקירה של 2026-11-01

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**מטרה:** לתקן שני באגים מאומתים (ציון אמירנט נמחק, המתנה של יממה לסריקה), לבדוק את חלון תאריכי הבחינות מול לוח השנה, ולהסיר עטיפה מיותרת. בלי שינוי בתזמון ובלי שינוי ב-token.

**גישה:** תיקון בנקודה אחת שכל הקוראים עוברים דרכה. כל תיקון נכתב קודם כבדיקה שנכשלת. קומיט אחד לכל סעיף בענף `claude/review-2026-11-01`.

**כלים:** Node (`node --test`), JS בדפדפן, GitLab MCP (קריאה בלבד).

**מקור:** [.claude/review-2026-11-01.md](../../../.claude/review-2026-11-01.md)

## אילוצים כלליים

- לא ממזגים ל-main ולא דוחפים (push) בלי אישור מפורש של הבעלים.
- לא משנים את התזמון של GitLab ולא את ה-token. לא מוחקים את ה-release ‏`cache-seed` בלי אישור.
- לא מורידים קבצים בלי אישור (סעיף 3 צריך PDF מאתר אפקה).
- בדיקה ממוקדת אחרי כל שינוי. `npm test` המלא פעם אחת, לפני בקשת המיזוג. `npm run check:real` כי נגעו ב-`scripts/`.
- הודעות למשתמש בעברית, בניסוח של הקוד הקיים. אין טקסט חדש בממשק.

## מוקדי סקירה (מצבים שאף בדיקה לא מכסה עד עכשיו)

1. בשדה אמירנט, קלט שהדפדפן לא מצליח לקרוא כמספר (למשל `e`; `validity.badInput`, והערך `''`) לא צריך למחוק את הציון השמור. הבדיקה בשלב 1.2.
2. אמירנט לא תקין כשאין ציון שמור: השדה מתרוקן והפרופיל נשאר `null`. הבדיקה בשלב 1.2.
3. `msUntil` עם שעה שעברה לפני יותר מ-12 שעות (הדף אומר 08:00 והשעה עכשיו 21:00): הפונקציה ממשיכה לחכות ליום הבא, והקורא זורק שגיאה. זו כוונה, לא באג. הבדיקה בשלב 2.1.
4. חלון הבחינות אחרי ההרחבה: תאריך בדצמבר הוא עדיין שגיאה, והחלון לא נפתח לגמרי. הבדיקה בשלב 3.4.
5. שינוי השם `abbrOf` ל-`courseAbbr`: `uniqueAbbrs` עם התנגשות (הפרמטר `extra`) ממשיכה לעבוד. הבדיקות הקיימות ב-`test/ui-map.test.mjs` מכסות את זה, ושלב 4.2 מריץ אותן.

---

### משימה 0: האם הסריקה הלילית חזרה (תפעול, בלי קוד)

**ממצא (נבדק ב-2026-11-01 בשעה 00:30 בשעון ישראל):** ה-pipelines ‏#32-#36 (26-30.10) הם `failed` תוך כשנייה. ה-job ‏`scrape` של #36 הוא `failed` עם לוג ריק (0 בתים), כלומר הוא לא התחיל לרוץ. זה מתאים לסיום מכסת הדקות. ב-`status.json` ‏`checkedAt` הוא `2026-10-21`. הריצה הבאה מתוזמנת ל-23:07 UTC, שהן 01:07 בשעון ישראל.

- [ ] **0.1:** אחרי 02:00 בשעון ישראל: קריאה אחת ל-`list_pipelines` עם `id: 87136623`, `per_page: 2`, `sort: desc`. בלי polling.
- [ ] **0.2, אם `success`:** `git fetch` ואז `git show origin/main:web/data/afeka/status.json`. התוצאה הצפויה: `checkedAt` מ-2026-11-01. לשאול את הבעלים אם למחוק את `cache-seed`.
- [ ] **0.3, אם `failed`:** `get_job` עם `include: log`. לדווח לבעלים את שורת השגיאה הראשונה, בלי לתקן.

### משימה 1: ציון אמירנט לא תקין מוחק את הציון השמור

**מצב:** הבאג אומת. התיקון כבר בקומיט `a0c1397` (שנעשה לפני שהתבקשה תוכנית), והוא לא מוזג ולא נדחף.

**שורש הבעיה:** ב-`web/ui-actions.js` ‏(`CHG.amirnet`), ההודעה אומרת "הערך לא נשמר", אבל הקוד שומר `cleanProfile({amirnet: 999}).amirnet`, שזה `null`. הציון השמור והפטורים באנגלית (`rules.js amirnetExempt`) נמחקים.

**התיקון:** כשיש `err`, מציגים הודעה, מחזירים לשדה את הציון השמור (`el.value = profile.amirnet ?? ''`) ומחזירים `'none'`, כי אין מה לצייר מחדש. רק שדה ריק מוחק את הציון. זו אותה תבנית כמו בשדה `grade`.

**קבצים:** `web/ui-actions.js` (`CHG.amirnet`), `test/ui-search.test.mjs`.

- [ ] **1.1:** הבעלים מחליט אם להשאיר את `a0c1397`. אם לא: `git reset --hard main` בענף, ואז מבצעים מחדש את 1.2-1.5.
- [ ] **1.2:** להרחיב את הבדיקה `CHG.amirnet: ...` (מוקדי סקירה 1 ו-2):

```js
  app.state = normalize({ v: 1, profile: { year: 2, amirnet: 120 } });
  const bad = { value: '', validity: { badInput: true } };
  assert.equal(CHG.amirnet(bad), 'none');
  assert.equal(app.state.profile.amirnet, 120, 'unreadable input keeps the saved score');
  app.state = normalize({ v: 1, profile: { year: 2, amirnet: null } });
  const none = { value: '40', validity: {} };
  CHG.amirnet(none);
  assert.equal(app.state.profile.amirnet, null);
  assert.equal(none.value, '');
```

- [ ] **1.3:** `node --test test/ui-search.test.mjs`. הצפוי: 0 ‏`✖`. בדיקת שפיות: אחרי `git stash` לקובץ `web/ui-actions.js` הבדיקה נכשלת, ואחרי `git stash pop` היא עוברת שוב.
- [ ] **1.4:** קומיט: `test: amirnet keeps the saved score on unreadable input too (review #1)`.

### משימה 2: `msUntil` מחכה יממה כשהשעה שבדף בדיוק עברה

**שורש הבעיה:** ב-`scripts/polite.mjs:64` כתוב `if (wait <= 0) wait += 86400;`. אם דף ההגבלה אומר 19:00 והקוד מגיע ב-19:00:02, ההמתנה יוצאת כ-24 שעות. הקוראת היחידה היא `scripts/scrape.mjs:310`, שזורקת שגיאה מעל `maxWaitMs = 75 * 60e3`, והריצה נגמרת בלי נתונים אף שההגבלה כבר הסתיימה.

**החלטה שצריך אישור:** הבדיקה הקיימת `'already 21:00: the next day'` מצפה ל-`86400 + 60`. היא בודקת את הבאג עצמו, ולכן היא תשתנה ל-`60`.

**קבצים:** `scripts/polite.mjs:64`, `test/polite.test.mjs:86-91`.

- [ ] **2.1:** לעדכן את הבדיקה `msUntil` ולהוסיף מקרים (מוקד סקירה 3):

```js
  assert.equal(at('2026-10-02T18:00:00Z', '21:00'), 60, 'exactly 21:00: now, plus the minute of margin');
  assert.equal(at('2026-10-02T16:00:02Z', '19:00'), 60, '19:00:02: the hour just passed');
  assert.equal(at('2026-10-02T20:59:50Z', '00:00'), 10 + 60, '23:59:50 -> 00:00');
  assert.equal(at('2026-10-02T18:00:00Z', '08:00'), 11 * 3600 + 60, 'an hour 13 h back: tomorrow (the caller gives up)');
```

- [ ] **2.2:** `node --test test/polite.test.mjs`. הצפוי: FAIL ב-`exactly 21:00` וב-`19:00:02`.
- [ ] **2.3:** ב-`scripts/polite.mjs:64`: `if (wait <= 0) wait = wait > -12 * 3600 ? 0 : wait + 86400;` עם הערה: השעה שבדף תמיד בשעה הקרובה, אז "עברה עכשיו" פירושו עכשיו.
- [ ] **2.4:** `node --test test/polite.test.mjs`. הצפוי: הכול עובר.
- [ ] **2.5:** קומיט: `fix(scrape): a limit hour that just passed means now, not tomorrow (review #2)`.

### משימה 3: חלון תאריכי הבחינות עלול לחסום בחינות קיץ מאוחרות

**הבעיה:** ב-`scripts/build.mjs:174-181`, תאריך מחוץ ל-`${year-1}-09-01..${year}-09-30` הוא `error`, והוא חוסם את בניית הנתונים לכל התוכניות. הקיץ של 2027 נגמר ב-2027-09-17 (`web/ics.js SEMESTER_DATES`), ולכן מועד ב׳ או ג׳ עלול ליפול באוקטובר.

**מה נבדק עד עכשיו:** בנתונים המקומיים (‏2027-1/2/3) עוד אין תאריכי בחינות. לוח השנה באתר אפקה הוא PDF בשם `לוח-שנה-תשפז-10-26.pdf` (בכתובת `afeka.ac.il/media/m54dukdo/...`). הדפדפן מוריד אותו כקובץ, ולכן לא נקרא.

**קבצים:** `scripts/build.mjs:174-181`, `test/build.test.mjs:409-415`.

- [ ] **3.1:** לקבל אישור להוריד את ה-PDF לתיקיית scratchpad, או שהבעלים יפתח אותו ויגיד מתי מסתיימות בחינות הקיץ של תשפ"ז.
- [ ] **3.2:** לקרוא את ה-PDF ולרשום את תאריך הסיום של מועדי הקיץ, עם המקור.
- [ ] **3.3, אם יש בחינות אחרי 30.9:** בבדיקה `validate: exam dates outside...` להוסיף:

```js
  d.courses['20002'].groups[0].exams[0].date = '2027-10-20'; // late summer moed
  assert.deepEqual(validate(d).errors, []);
  d.courses['20002'].groups[0].exams[0].date = '2027-12-01';
  assert.ok(validate(d).errors.some((e) => e.includes('exam')));
```

- [ ] **3.4:** `node --test test/build.test.mjs`. הצפוי: FAIL ב-`2027-10-20`. אחר כך `hi = \`${d.year}-11-30\`` עם הערה שמפנה לתאריך מה-PDF. הצפוי: PASS (מוקד סקירה 4).
- [ ] **3.5, אם אין בחינות אחרי 30.9:** בלי שינוי בקוד. הערה של שורה אחת מעל `lo`/`hi`: "נבדק מול לוח השנה תשפ"ז (2026-11-01): הקיץ נגמר עד …".
- [ ] **3.6:** קומיט: `fix(build): exam window covers late summer moedim (review #3)`, או `docs(build): exam window checked against the 2027 calendar (review #3)`.

### משימה 4 (רשות): להסיר את העטיפה `courseAbbr`

**קבצים:** `web/map-render.js:385, 411, 415, 417`. `test/ui-map.test.mjs` בלי שינוי.

- [ ] **4.1:** לשנות את `function abbrOf(name, extra = 0)` ל-`export function courseAbbr(name, extra = 0)`, למחוק את שורה 411 ולעדכן את 2 הקריאות ב-`uniqueAbbrs`.
- [ ] **4.2:** `node --test test/ui-map.test.mjs`. הצפוי: 0 ‏`✖` (מוקד סקירה 5). אחר כך `grep -rn abbrOf web test`. הצפוי: אין תוצאות.
- [ ] **4.3:** קומיט: `refactor(map): export courseAbbr directly, drop the wrapper (review #4)`.

### משימה 5: אימות לפני מיזוג

- [ ] **5.1:** `npm test`. הצפוי: הכול עובר (686 בדיקות לפני הסקירה, ועוד הבדיקות החדשות).
- [ ] **5.2:** `npm run check:real` (כ-70 שניות, ברקע). הצפוי: יציאה 0.
- [ ] **5.3:** בדפדפן המקומי (`preview_start` מ-`.claude/launch.json`): להגיע ל"המצב שלי", לשמור אמירנט 120 ולהקליד 999. הצפוי: מופיעה ההודעה "צריך מספר שלם בין 50 ל-150. הערך לא נשמר.", השדה חוזר ל-120, ואחרי רענון הערך עדיין 120. לבדוק שאין שגיאות ב-console.

### משימה 6: סיכום ומסירה

- [ ] **6.1:** לעדכן את `NOTES.md` בסגנון המסירות הקודמות: מה בוצע (קומיטים), מה נשאר (משימה 0 אם עוד לא ידוע, ו-cache-seed).
- [ ] **6.2:** לדווח לבעלים ולבקש אישור למיזוג. מיזוג ו-push רק אחרי "כן".

## החלטות שמחכות לבעלים

1. להשאיר את `a0c1397` (משימה 1.1)?
2. לאשר שהבדיקה `msUntil` משנה את ההתנהגות ל"עכשיו" (משימה 2)?
3. להוריד את ה-PDF של לוח השנה, או שתבדוק בעצמך (משימה 3.1)?
4. לבצע את משימה 4 (רשות)?
