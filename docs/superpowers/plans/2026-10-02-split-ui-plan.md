# פיצול `web/ui-plan.js` (2026-10-02)

## הבעיה
`ui-plan.js` (841 שורות) מכיל חיפוש, מצב אישי, סרגל צד, לוח, מגירות, פעולות ותיווך אירועים. אין בדיקות יחידה לקובץ (תלוי DOM), ולכן הפיצול הוא העברת קוד בלבד: אפס שינוי התנהגות.

## החלטה
- המצב המשותף (`last`, `cur`, `running`, `panel`...) עובר לאובייקט אחד `ui` ב-`ui-common.js`. סיבה: ESM לא מאפשר לשנות `let` מיובא, ואובייקט הוא הדרך הקטנה ביותר (בלי getters/setters).
- תלויות מעגליות בין המודולים (חיפוש <-> תצוגה <-> מגירה) בטוחות, כי הן רק בין פונקציות שנקראות אחרי הטעינה. שום `const` ברמה העליונה לא קורא למודול מעגלי.
- `ui-plan.js` נשאר נקודת הכניסה (`index.html` לא משתנה).

## חלוקה
| קובץ | תוכן |
|---|---|
| `ui-common.js` | `$`, `ui`, קבועים, `seg`/`details`/`pill`, `toast`/`copy`, `heb`/`listTitle`, `onboarded`, עוזרי קריאה (`gated`, `current`, `shown`...), `focusWeek` |
| `ui-search.js` | `scheduleRun`, `run`, `setBusy`, `MAX_MS` |
| `ui-me.js` | דף "המצב שלי": `renderMe`, `chip`, טופס התמחות, `importGrades`, `avgLine` |
| `ui-side.js` | "הקורסים שלי": `card`, `renderSide` |
| `ui-view.js` | `renderTop`, `renderBanner`, `renderView`, `scrollToDay`, `go` |
| `ui-drawer.js` | `prefsPanel`, `friendsPanel`, `regPanel`, `renderDrawer`, `openPanel`, `registrationText` |
| `ui-actions.js` | `addFriend`, `saveManualFriend`, `share`, `ACT`, `CHG` |
| `ui-plan.js` | ניתוב (`renderRoute`, `onHash`), `renderAll`, חיווט המאזינים, אתחול |

## מחוץ להיקף (במכוון)
- שורות ארוכות (127 מעל 200 תווים): שבירה בתוך מחרוזות תבנית משנה רווחים ב-HTML, ואין בדיקה שתופסת זאת. הפיצול לא משנה אותן.
- `ui-map.js` (524 שורות) ו-CSS שב-`index.html`: הפיצול שלהם נוגע בבדיקות קיימות (`app.test.mjs:170` קורא את ה-CSS מ-`index.html`). שלב נפרד אם הבעלים רוצה.

## אימות
1. `node --test` (303) ירוק. אין בו כיסוי ל-`ui-plan`, ולכן:
2. טעינה בדפדפן מכריחה (`cache:'reload'`), בלי שגיאות קונסולה ובלי `import` שנכשל.
3. מעבר בין: בניית מערכת, "המצב שלי", מגירת העדפות/חברים/הרשמה, מפה, בחירת מצב קורס, "חפש עוד", רענון.
4. השוואת `grep` על כל שם משתנה מצב: אין `last`/`cur`/`panel` וכו' חשופים שנשארו.
