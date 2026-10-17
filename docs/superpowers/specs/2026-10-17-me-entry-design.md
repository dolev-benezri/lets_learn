# Step 1 entry: import first, manual on request (design)

Date: 2026-10-17. Owner's choices: layout B of three (A one column, B two cards centered, C one merged card); the screen shows until the first choice.

## Problem

After the two opening questions, step 1 ("המצב שלי") opens on a wide page: the profile and progress cards in a narrow side column and a long list of
courses by year beside them. The grade-sheet import, the fastest way to fill that list, is a plain button at the bottom of the progress card.
Owner: show the profile and the progress in the centre to encourage the import; whoever does not want it presses "הזנה ידנית" and the courses by year open.

## Design

**When.** The entry screen replaces step 1's page while both hold: the visitor has not made the entry choice (`entered()`, new) and has not left
step 1 before (`onboarded()`, existing; `renderRoute` sets it on any way out of step 1). So returning users never see it.
The choice is a localStorage flag, `afeka-sched-v1-entry` = '1', beside `afeka-sched-v1-onboarded`; "מחק את כל הנתונים שלי" clears it with the rest
(`clearSaved` removes every `afeka-sched-v1*` key).

**The entry screen** (one centered column, max ~900px):
- The heading "המצב שלי" (`h2#meTitle`), and the step line: "<b>צעד ראשון:</b> סמנו מה כבר עברתם. הכי מהיר: גליון הציונים מהפורטל."
- The profile card and the progress card side by side (one column on phones), with the same content as today, except the import button and its
  status line, which move to the card below.
- A wide card, heading "איך מסמנים מה עברתם?":
  - "על מנת להתייחס לפטורים מקורסים מסוימים, העלו את גליון הציונים הרשמי של המכללה." (owner's line; the import already reads פטור)
  - "הקובץ נקרא רק במכשיר שלך ולא נשמר."
  - Two buttons: "ייבוא מגליון ציונים (PDF)" (primary, the existing `gradeImport` action) and "הזנה ידנית" (secondary, new `manualEntry` action).
  - The import status line (`#gradeMsg`) under the buttons.
- No courses list, no warnings, no "הנתונים שלי" card, no sticky "הבא: קורסים" bar. The step bar stays.

**The choice is made** (flag set, the regular page renders, focus moves to the "קורסים לפי שנה" heading) by:
- "הזנה ידנית";
- an import the visitor confirms in the review dialog, or one that finds every course already up to date (its message shows on the regular page).

A cancelled dialog, an unreadable file or a sheet with no courses keeps the entry screen, with the message in `#gradeMsg`.

**The regular page** is unchanged (the import button is back in the progress card).

## Files

- `web/ui-common.js`: `entered()` / `markEntered()` beside `onboarded()`.
- `web/ui-me.js`: `renderMe` builds the profile and progress cards once and lays them out for the entry screen or the regular page; `importGrades`
  marks the choice on success.
- `web/ui-actions.js`: `ACT.manualEntry`.
- `web/style.css`: the entry layout (`.me-entry`), the choice card.
- `design-system/afeka-scheduler/pages/app.md`: step 1 section.

## Testing

- Unit (`test/xss.test.mjs`, which renders `renderMe`): the entry screen (both buttons, the exemption line, no course rows, no "הבא: קורסים");
  the regular page once `entered()`; the regular page when `onboarded()` alone; hostile names still escaped.
- Full `npm test` before merge.
- Browser pane (`debug` server): 320, 375 and 1440, light and dark; "הזנה ידנית" opens the list with focus on its heading; no horizontal scroll;
  console clean.
