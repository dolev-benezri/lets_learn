# "המצב שלי": failure count and softer expulsion warnings

Owner's report, 2026-10-22, with a screen recording. Branch `claude/me-fail-count`.

## Bugs

1. Three fails in one course shows "3 כישלונות באותו קורס: הרחקה (תקנון 11.5.2)". That reads as a verdict. The same holds for the
   four-courses line (11.5.1). Both should say that the situation *can* mean expulsion and send the student to the academic advisor.
2. "נכשלתי" then "עברתי" leaves the "פעם / פעמיים / 3 פעמים" row on the card with no visible title and no way to clear it.
   One wrong tap on "נכשלתי" sticks: the only way out is "לא לקחתי" and back to "עברתי".

Failures must still count after passing (regulations 11.4.1, 11.5.x): only the way the count is entered changes.

## Design (agreed in chat)

Warnings (`web/rules.js`, the only source; the me page, the grid notes and the copied advisor text all read them):

- `שימו לב: 3 כישלונות באותו קורס. לפי התקנון (11.5.2) מצב זה יכול להוות הרחקה מהלימודים. כדאי לשוחח עם ההכוון האקדמי.`
- `שימו לב: ציון נכשל ב-4 קורסים ומעלה. לפי התקנון (11.5.1) מצב זה יכול להוות הרחקה מהלימודים. כדאי לשוחח עם ההכוון האקדמי.`

Course card (`web/ui-me.js` `chip`):

- "נכשלתי": below the status, the count row with a visible title "כמה פעמים נכשלתי?" (פעם / פעמיים / 3 פעמים).
- "עברתי": a checkbox "נכשלתי בעבר בקורס זה" on the grade line.
  - Ticked: the count row appears below it, titled "כמה פעמים?", starting at "פעם".
  - Unticked: the failure is deleted (`state.failed[id]`), the row goes away.
  - Coming from "נכשלתי", the box is already ticked and the count kept.
- An exempt-on-grade-sheet course ("פטור" tag) gets no checkbox: no attempt was made.
- The page-level hint "כישלון נשמר גם אחרי שעברתם, כי הוא נספר בתקנון." goes: the checkbox says it.

## Steps

1. `web/rules.js`: the two warning strings. Tests: `test/rules.test.mjs` (regex on 11.5.1), `test/advisor.test.mjs` (11.5.2 text).
2. `web/ui-actions.js`: handler `failedBefore` (checked: `failed[id] ||= 1`, unchecked: `delete failed[id]`), full re-render like `status`.
3. `web/ui-me.js`: checkbox on passed cards, visible count titles, drop the hint. Screen readers keep the course name in the
   checkbox's `aria-label`.
4. `web/style.css`: grade and checkbox on one line, wrapping on narrow cards.
5. Test: ticking adds a failure, unticking removes it, "נכשלתי" then "עברתי" keeps the count (where the existing me-page tests live).
6. Check in the browser at 375px and desktop: card height, wrap, no horizontal scroll. `npm test`, `npm run test:browser`.

## Added 2026-10-22 (owner, after the first round)

- Probation (11.4) is softened like expulsion: `שימו לב: <why>. לפי התקנון (11.4) מצב זה יכול להוביל למעמד "על תנאי". כדאי לשוחח עם ההכוון האקדמי.`
- A one-time note when building the plan: leaving "המצב שלי" with a course to retake opens a dialog
  "שימו לב: נכשלת ב-X. מומלץ לקחת אותו שוב בסמסטר הבא שבו הוא נלמד (תקנון 11.6.1). כברירת מחדל הוא נכנס למערכת כ״חובה״, ואפשר לשנות."
  with one button, "הבנתי". Several new failures share one dialog. `state.retakeSeen` remembers the noted courses (over refreshes);
  a course drops out of it when it is passed or no longer failed, so failing it again notes it again.
  Code: `retakeNotice` in `web/rules.js` (tested in `test/rules.test.mjs`), shown from `renderRoute` in `web/ui-plan.js`
  with `askConfirm(text, { ok: 'הבנתי', cancel: null })` (`web/ui-dialog.js`: `cancel: null` leaves one button).

## Not in this change

Exemption from English by the psychometric English section, beside the Amirnet score: needs research on the official thresholds first.
