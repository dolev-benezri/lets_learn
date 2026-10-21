<div dir="rtl" lang="he">

# אבטחה ופרטיות: מה הכלי עושה ומה לא

לשאלת "מה קורה עם המידע שלי" ולמי שמקבל את הכלי לידיים. הנוסח המחייב לסטודנטים הוא [legal.html](../web/legal.html) באתר. תפעול: [OPERATIONS](OPERATIONS.md).

## אין שרת ואין חשבונות

האתר הוא קבצים סטטיים. אין קוד שרת, אין התחברות, אין מסד נתונים ואין ניתוח שימוש. את מה שהסטודנט מזין (קורסים שעבר, ציונים, חברים, העדפות) האתר שומר רק בדפדפן שלו.

## מה נשמר בדפדפן ואיך מוחקים

הכול ב-`localStorage`, תחת מפתחות שמתחילים ב-`afeka-sched-v1`:

| מפתח | מה בו |
|---|---|
| `afeka-sched-v1` | המצב: תוכנית, מחזור, קורסים שעבר, ציונים, חברים, נעיצות, העדפות ([web/app.js:10](../web/app.js)) |
| `afeka-sched-v1:<תוכנית>-<מחזור>` | מצב שמור של תוכנית אחרת, להחלפה חזרה ([web/app.js:111](../web/app.js)) |
| `afeka-sched-v1-theme` | בחירת ערכת צבעים ([web/theme.js](../web/theme.js)) |
| `afeka-sched-v1-tour`, `-onboarded`, `-entry` | אילו חלקים בסיור כבר הוצגו, והאם הסטודנט עבר את המסך הראשון ([web/tour.js](../web/tour.js), [web/ui-common.js](../web/ui-common.js)) |
| `afeka-sched-v1-terms` | גרסת תנאי השימוש שהסטודנט אישר (`TERMS_VERSION`) |

**מחיקה:** הכפתור "מחק את כל הנתונים שלי" ב"המצב שלי" ([web/ui-me.js:174](../web/ui-me.js)) מוחק כל מפתח שמתחיל ב-`afeka-sched-v1` (`clearSaved`, [web/app.js:114](../web/app.js)). אפשר גם לנקות נתוני אתר בהגדרות הדפדפן. כשאין אחסון (גלישה פרטית, חסום) האתר עובד לביקור הנוכחי בלבד.

קישור גיבוי (`#b=`) ושיתוף לחבר (`#f=`) נושאים את הנתונים אחרי סימן ה-`#`, וחלק זה של הכתובת אף פעם לא נשלח לשרת. קישור חבר מכיל שם, מזהי קבוצות, ובנוסף שנה, סמסטר, תוכנית ומחזור (`year`, `semester`, `program`, `startYear`; [web/share.js:36](../web/share.js)); קישור גיבוי מכיל הכול, ולכן מי שמחזיק בו רואה את הנתונים.

## בקשות החוצה: אין

האתר לא פונה לשום כתובת מחוץ לעצמו: הפונט (Rubik), כל הספריות ונתוני השפה של ה-OCR מוגשים מ-`web/`. כל ה-`fetch` בקוד הם לנתיבים יחסיים ([web/app.js:246](../web/app.js), `:305`, `:308`, `:309`), וה-CSP (להלן) חוסם כל כתובת אחרת. קישורים שהסטודנט לוחץ עליהם (issues, דף הייעוץ שב-`settings.json`, קישור המייל) הם ניווט, לא בקשה של הדף. תמונה או PDF שנבחרים לייבוא נקראים בדפדפן ולא נשלחים.

## מדיניות אבטחת תוכן (CSP)

המדיניות כתובה כתג `<meta>` בשני הדפים ([web/index.html:7](../web/index.html), [web/legal.html:6](../web/legal.html)), כי GitHub Pages לא מאפשר להגדיר כותרות. ב-`index.html`:

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; img-src 'self' data: blob:;
style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'
```

`'wasm-unsafe-eval'` ו-`blob:` נדרשים רק בשביל ה-OCR (ה-worker מתחיל מ-blob וה-core הוא wasm); `legal.html` בלעדיהם. `'unsafe-inline'` ב-`style-src` נדרש כי הממשק כותב מאפייני `style`; הוא לא חל על סקריפטים.

הבדיקה ש**אוכפת** את זה היא [test/app.test.mjs:169](../test/app.test.mjs) ("both pages carry a CSP"): `default-src` הוא `'self'`, `object-src` ו-`base-uri` הם `'none'`, ל-`script-src`, `worker-src` ו-`connect-src` מותרים רק `'self'`, `'wasm-unsafe-eval'` ו-`blob:`, ואין `http:`, `https:` או jsdelivr בשום מקום במדיניות. בשורות 180-181 היא בודקת ש-`legal.html` נקי מ-`wasm` ומ-`blob:`. שינוי שפותח מקור חיצוני מפיל את `npm test`.

**מגבלה ידועה:** CSP בתג `<meta>` לא תומך ב-`frame-ancestors` ולכן אי אפשר למנוע הטמעת האתר בדף אחר. אירוח בשרת שמאפשר כותרות מאפשר להוסיף `Content-Security-Policy: frame-ancestors 'none'`.

## ספריות

כל הספריות הן עותקים ב-`web/vendor/`, בלי חבילות npm בזמן ריצה ובלי build. רק ל-Driver.js ול-tesseract.js יש קובץ `SOURCES.txt`, ושם מתועד שהעותקים זהים בית לבית לחבילה ב-npm (גרסה, גיבוב sha512 ו-sha256 לכל קובץ). ל-pdf.js, Panzoom ו-popover polyfill אין קובץ כזה: הגרסה נלקחה מכותרת הקובץ, ואין תיעוד של מקור וגיבוב. מומלץ כצעד המשך להוסיף להם `SOURCES.txt` באותה צורה.

| ספרייה | גרסה | רישיון | תפקיד |
|---|---|---|---|
| Driver.js | 1.9.0 (ראו [web/vendor/driver/SOURCES.txt](../web/vendor/driver/SOURCES.txt)) | MIT | הסיור באתר |
| tesseract.js (עם `tesseract.js-core` ונתוני שפה עברית ואנגלית) | 7.0.0, ראו [web/vendor/tesseract/SOURCES.txt](../web/vendor/tesseract/SOURCES.txt) | Apache-2.0 (כפי שכתוב שם; עטיפת נתוני השפה MIT) | זיהוי טקסט (OCR) בייבוא מערכת של חבר מתמונה |
| pdf.js | 6.3.289 (מתוך `pdfjsVersion` ב-`web/vendor/pdfjs/pdf.min.mjs`; אין קובץ SOURCES) | Apache-2.0 ([LICENSE](../web/vendor/pdfjs/LICENSE)) | ייבוא ציונים מ-PDF |
| Panzoom | 4.6.0 (מכותרת הקובץ `web/vendor/panzoom/panzoom.es.js`; אין קובץ SOURCES) | MIT ([LICENSE](../web/vendor/panzoom/LICENSE)) | מפת ההתקדמות |
| @oddbird/popover-polyfill | 0.7.3 (מכותרת הקובץ `web/vendor/popover/popover.min.js`; אין קובץ SOURCES) | BSD-3-Clause ([LICENSE](../web/vendor/popover/LICENSE)) | חלוניות ב-Safari ישן |
| Rubik (פונט) | [web/fonts](../web/fonts) | SIL OFL ([OFL.txt](../web/fonts/OFL.txt)) | הפונט של האתר |

תלויות הפיתוח (`package.json`): `node-html-parser` לסורק, ו-`playwright` ו-`@axe-core/playwright` לבדיקות הדפדפן. אף אחת מהן לא נשלחת לאתר.

**עדכון ספרייה:** חבילה חדשה נשלפת עם `npm pack` לתיקייה ריקה מחוץ למאגר, הגיבוב מושווה ל-`dist.integrity` של הרישום, הקבצים מועתקים כמות שהם, וה-`SOURCES.txt` נכתב מחדש. אחר כך `npm test` ו-`npm run test:browser`. הסיור כותב טקסט לחלון דרך `innerHTML` ומעביר אליו רק מחרוזות קבועות של האתר, אף פעם לא נתוני קטלוג או משתמש.

## קישורי חבר וגיבוי: קלט לא מהימן

קישור שמגיע מבחוץ יכול להיות מכוון להזיק, ולכן [web/share.js](../web/share.js) מאמת אותו לפני שהוא נוגע במצב:

- **גודל:** קישור חבר עד 4096 תווים, קישור גיבוי עד 65536 ([web/share.js:49-51](../web/share.js)); אחרי הפריסה (deflate) עד 262144 בתים, והפריסה נעצרת ברגע שחצתה את המגבלה ([web/share.js:24](../web/share.js)), כך שקובץ דחוס זעיר לא מנפח זיכרון.
- **מבנה:** התוכן חייב להיות אובייקט רגיל עם `v: 1`, `year` מספר ו-`semester` טקסט. קישור חבר לסמסטר אחר נדחה; גיבוי משנה קודמת מתקבל, בלי מזהי קבוצות.
- **חבר:** שם עד 60 תווים, עד 40 קבוצות, כל אחת עד 20 תווים.
- **גיבוי:** סוגי השדות נבדקים, והאובייקט נבנה מחדש שדה אחר שדה (מפתחות לא מוכרים, כולל `__proto__`, נושרים), ואז עובר דרך `normalize()` ([web/app.js:49](../web/app.js)), השער היחיד למצב מ-localStorage ומקישורי גיבוי.
- **תצוגה:** כל טקסט שנכנס ל-HTML עובר `esc()`. הבדיקה [test/xss.test.mjs](../test/xss.test.mjs) מוסיפה קוד זדוני לשדות `name`, `lecturer`, `room`, `label` ו-`title` בקבצי נתונים אמיתיים (שדות טקסט אחרים לא נבדקים שם) ומוודאת שאף `innerHTML` לא כותב אותו כמות שהוא.

גם [web/settings.json](../web/settings.json) הוא קלט שמנוקה (`cleanSettings`): כתובת הייעוץ רק `https://`, כתובת התמיכה כתובת אחת בלי תווי הפרדה של mailto, וההודעה מוצגת כטקסט.

## הריצה הלילית

הסורק דוחף ל-GitHub עם טוקן fine-grained שמוגבל לריפו הזה בלבד, הרשאת Contents, ובעל תאריך תפוגה (חידוש: [OPERATIONS](OPERATIONS.md)). פרויקט הסריקה ב-GitLab ציבורי, ולכן הלוגים גלויים: הטוקן לא מודפס בהם והוא משתנה סודי.

## דיווח על פגיעות

- ב-[issues של הריפו](https://github.com/dolev-benezri/lets_learn/issues/new/choose), אם אין בדיווח פרטים שמסכנים משתמשים.
- דיווח רגיש: בלשונית Security של הריפו, "Report a vulnerability", **אם האפשרות מופעלת** (`private vulnerability reporting`; לא נבדק מתוך הקוד, אין לו קובץ ב-`.github/`).
- אחרת: `<כתובת התמיכה>`.

מה שעוזר לנו: מה עשיתם, באיזה דפדפן, ומה ציפיתם לראות. אל תצרפו נתונים אישיים של סטודנטים.

</div>
