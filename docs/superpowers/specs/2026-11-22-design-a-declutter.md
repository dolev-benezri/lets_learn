# Design A declutter: less text on the board (proposal)

Date: 2026-11-22. Status: proposal, waiting for the owner's decision. No web/ file is changed by this spec.

## Why

The owner opened design A at 1920px (`?design=a`) and said: "יש פה הרבה יותר מידיי מלל וזה נראה גדוש בעיניים".

Measured on the real page (synthetic student from test/browser/helpers.mjs, frozen data in test/fixtures/real, headless WebKit):

| Width | Where the week starts today | Words above the week today | With this proposal |
|---|---|---|---|
| 1920 x 1080 | 534px (half the screen) | 158 | 304px, 67 words |
| 375 x 812 (phone) | 716px (the week is below the fold) | 113 | 591px, 42 words |

Above the week the board stacks: the scope tabs and the semester tabs, a filled teal banner listing 6 courses, a sort select, 7 bordered chips,
4 grey sentences, a second banner, and on a phone also the day row. The same idea is often said twice: the data freshness (strip and board
note), "not official" (strip and disclaimer), "exams on the same day" (chip and banner). The two teal banners use the primary colour, so
information outranks the product.

Design rules used (skills research, private notes in `.superpowers/sessions/design-lead/RESEARCH.md`): progressive disclosure (show the few
facts a student needs every time, defer the rest one tap away); one term per idea, said once, where it matters; facts are not chips (chips
read as filters); three notice levels only (warning line, info line, the "פרטים" list); never colour alone; everything hidden stays in the DOM
behind a real disclosure control (WCAG 2.1 AA 1.3.1, 2.1.1, 4.1.2), with 44px targets. A qualifier that changes the meaning of a warning stays
next to it, never behind a tap.

## Mockups

Built by applying the proposal to the real page in a headless browser (the site itself is unchanged): static HTML and screenshots in
`.superpowers/sessions/design-lead/mockups/` (private, git-ignored). Script: `.superpowers/sessions/design-lead/mock.mjs`; collage:
`mockups/declutter-collage.png`.

- `board-desktop-before` / `board-desktop-after` / `board-desktop-after-open` (1920x1080, "פרטים" closed and open)
- `board-phone-before` / `board-phone-after` (375x812)
- `card-before` / `card-after` (the busiest course card: "מבוא להנדסת חשמל ואלקטרוניקה")

The frozen data has no exam dates, so before and after both carry one example exam clash, in the exact words the site writes.

### The board after, top to bottom (1080px and wider)

```
strip:  ⚠ הנתונים נבדקו לפני 32 ימים, ייתכן שהשתנו            (grey "נבדק לפני 10 שעות" when fresh; see H3 for the other states)
        ⓘ לא רשמי · אינו הרשמה ואינו המלצה (ההרשמה באפקה-נט) · הכללים לא אושרו במחלקה · פרטים
bar:    [סמסטר א׳ | סמסטר ב׳]        ‹ חלופה 1 מתוך 10 ›        [שתף]
board:  9 קורסים · 24 נ״ז · ימים ב׳, ו׳ פנויים · 3 ש׳ חלונות · בחינות: טרם פורסמו     פרטים (6) ▾
        ⓘ התכנון של ב׳ מניח שתעברו בא׳ 6 דרישות קדם. אילו?
        ⚠ שתי בחינות באותו יום: חוזק חומרים 1 ו-תרמודינמיקה 1, ה׳ 11.2. משך הבחינות לא ידוע, כדאי לבדוק שאין חפיפה.
        [the week]
column: חלופות לשנה   לפי [מאוזן ▾]
        cards unchanged (year credits in the head, the shown semester's line under it)
```

The exam fact is the last fact only when no clash is found; a clash replaces it by the warning line.

### On a phone (599px and under, the `PHONE` query in ui-common.js)

The strip is not sticky and the phone scrolls on arrival to `#boardNote` or the first lesson (ui-view.js scrollToDay, gated by `PHONE`), so
the strip can be off screen when a student looks at the plan. On a phone therefore (from 600px the strip rules of the wide screen apply; the
semester tabs join the bar only from 1080px):

- the strip keeps only "לא רשמי · אינו הרשמה ואינו המלצה (ההרשמה באפקה-נט) · פרטים";
- the board note keeps the warnings as one line right above the week: "⚠ הנתונים נבדקו לפני 32 ימים, ייתכן שהשתנו · הכללים לא אושרו במחלקה"
  (each part only when it applies), so the "warnings and the first lesson on screen" test (flows.spec.mjs) keeps its meaning;
- the semester tabs keep their own sticky row, "הצג לפי" moves into "פרטים", the day row stays.

### "פרטים" holds (in this order, only the lines that apply)

בכל השנה: 16 קורסים, 42 נ״ז · מקום 3 מתוך 10 בהתקדמות בתואר · "לפחות 3 ימים בין בחינות" when that is the exam fact · the prerequisites
sentence ("קורסי קדם לקורסים אחרים: … · פותחת לך 42 קורסים חדשים") · "אלה החלופות הטובות ביותר שנמצאו, לא בהכרח כל האפשרויות." · "לעומת
חלופה 1: …" · the full A-semester assumption with its groups ("X או Y") · the left-out course names · "אינו הרשמה ואינו המלצה. לפני ההרשמה מומלץ
להתייעץ עם יועץ לימודים." (with the counselling link) · on a phone, "הצג לפי".

The control is a native `<details>`/`<summary>` ("פרטים (6)"). Its open state is kept in `ui` across re-renders (renderView rewrites the pills
on every change), and focus restoration (app.js keepFocus, by `data-k`) must reopen the ancestor `<details>` of the element it restores, so a
student who changes "הצג לפי" inside it on a phone keeps both the panel and the focus.

## Inventory and verdicts

Frequency: how often a student needs it while choosing a plan (every view / sometimes / rare). Verdicts: keep, shorten, merge, move (where),
remove. Hebrew in the "after" column is proposed wording; the owner has the final word on every string.

### Header and strip (web/ui-shell.js, web/ui-view.js renderTop)

| # | Element (today) | Purpose | Freq. | Verdict | After |
|---|---|---|---|---|---|
| H1 | "המערכת שלי" | name | every | keep | |
| H2 | "· שנה מלאה תשפ״ז · הנדסה מכנית" | which data | every | shorten | drop the leading "·" (it starts the line with a separator) |
| H3 | `#meta` "נבדק לפני 10 שעות · השתנה לאחרונה 22.11" | data freshness | sometimes | shorten | four states (needs freshness() in ui-text.js to return why it is stale): fresh "נבדק לפני 10 שעות"; old "הנתונים נבדקו לפני 32 ימים, ייתכן שהשתנו"; last check failed "הבדיקה האחרונה של הנתונים נכשלה. הם השתנו לאחרונה ב-21.10"; never checked "לא ידוע מתי הנתונים נבדקו. הם השתנו לאחרונה ב-21.10". The three stale states in --warning with the alert icon. "השתנה לאחרונה" for the fresh state stays in ☰ "מידע" (already there) |
| H4 | "אושר על ידי המחלקה, 5.10.2026" (approved programs) | trust | sometimes | keep | stays in the strip; replaces the "not approved" clause |
| H5 | `.a-unofficial` "לא רשמי · ההרשמה באפקה-נט" | legal | every | merge | one legal line with B12 and B15: "לא רשמי · אינו הרשמה ואינו המלצה (ההרשמה באפקה-נט) · הכללים לא אושרו במחלקה · פרטים" ("פרטים" opens ☰ "מידע"). On a phone without the rules clause (it is in the board note) |
| H6 | mode tabs "מערכת חדשה / שיפור מערכת קיימת" | mode | every | keep | |
| H7 | "מצב כהה" | theme | rare | keep | |

### Board (web/ui-view.js renderView, renderBanner, renderBoardNote; index.html #board)

| # | Element (today) | Purpose | Freq. | Verdict | After |
|---|---|---|---|---|---|
| B1 | "שתף" | share | sometimes | keep | |
| B2 | "חלופה 1 מתוך 10" + arrows | switch | every | keep | |
| B3 | scope tabs "לתכנן: שנה / רק א׳ / רק ב׳" | plan scope | rare (set once) | move | off the board; it already lives in "מה חשוב לי" (W2). Owner decision D1 |
| B4 | semester tabs "סמסטר א׳ / סמסטר ב׳" | which semester | every | keep, move | into the switcher row from 1080px; own sticky row on a phone |
| B5 | teal banner "התכנון של ב׳ מניח שעוברים את חוזק חומרים 1, תרמודינמיקה 1, … בא׳" | planning assumption | sometimes | shorten | one info line, no fill: "התכנון של ב׳ מניח שתעברו בא׳ 6 דרישות קדם. אילו?" The count is of groups (rules.js afterAText: "X או Y" is one group, passing either is enough); one group reads "דרישת קדם אחת". "אילו?" opens "פרטים" with the groups in today's words |
| B6 | other `#semnote` notes (summer, semester notice, the defaults-changed ask) | context | rare | keep | same one-line info style |
| B7 | "הצג לפי [מאוזן]" | sort the alternatives | rare | move | from 1080px: the alternatives column header "לפי [מאוזן ▾]"; phone: inside "פרטים" |
| B8a | chip "9 קורסים" | fact | every | keep | plain text, no border, no icon |
| B8b | chip "24 נ״ז" | fact | every | keep | plain text |
| B8c | chip "בכל השנה: 16 קורסים, 42 נ״ז" | year total | sometimes | move | "פרטים"; the column card already says the year's credits |
| B8d | chip "ימים ב׳, ו׳ פנויים" | fact | every | keep | plain text, today's freeDaysText wording (one day, none) |
| B8e | chip "3 שעות חלונות" | fact | every | shorten | "3 ש׳ חלונות" (the column card already uses "ש׳ חלון"); "שעת חלון אחת", "בלי חלונות" unchanged |
| B8f | chip "מקום 3 מתוך 10 בהתקדמות בתואר" | rank | rare | move | "פרטים" |
| B8g | friend chips "2 קורסים עם דנה" | social | every (with friends) | keep | plain text, first friend inline, more friends in "פרטים" |
| B8h | chip "לוח הבחינות טרם פורסם" | exam status | every (until published) | shorten | stays visible as the last fact: "בחינות: טרם פורסמו". Without it, no clash warning could read as a checked, clash-free plan |
| B8i | chip "לפחות 3 ימים בין בחינות" / "פער בין בחינות: לא ידוע" | exam status | sometimes | keep, shorten | the same last-fact slot: "לפחות 3 ימים בין בחינות" / "פער בין בחינות לא ידוע" |
| B8j | chip "בחינות באותו יום" | exams | sometimes | remove | duplicate of the warning line B19, which stays |
| B9 | "קורסי קדם לקורסים אחרים: … · פותחת לך 42 קורסים חדשים" | progress | sometimes | move | "פרטים" |
| B10 | "אלה החלופות הטובות ביותר שנמצאו, לא בהכרח כל האפשרויות." | caveat | rare | move | "פרטים" |
| B11 | "לעומת חלופה 1: …" | compare | sometimes | move | "פרטים". Owner decision D3 |
| B12 | `#disclaimer` "אינו הרשמה ואינו המלצה. לפני ההרשמה מומלץ להתייעץ עם יועץ לימודים." | legal | every | merge, move | "אינו הרשמה ואינו המלצה" verbatim in the strip line (H5); the full sentence with the counselling link in "פרטים", in "להוציא" under "חלופה 1 מתוך 10. ההרשמה עצמה נעשית באפקה-נט." (the moment a student goes to register), and added to ☰ "מידע" (today it holds UNOFFICIAL only, ui-drawer.js:353). Design A hides the site footer (design-a.css:251), so the footer is not a fallback |
| B13 | `#boardNote` stale freshness | data warning | sometimes | move | from 600px: removed (the strip says it and is on screen with the board); phone: stays, merged with B15 into one line (see "On a phone") |
| B14 | "הנתונים של התוכנית הזו עוד לא נבדקו מול תוכנית הלימודים הרשמית." | data warning | rare | keep | one warning line |
| B15 | "הכללים לא אושרו על ידי המחלקה. בדקו מול היועץ לפני ההרשמה." | legal | every (unapproved) | merge | "הכללים לא אושרו במחלקה": in the strip from 600px, in the board-note line on a phone. "בדקו מול היועץ" in "פרטים" and ☰ "מידע" |
| B16 | "קורסים שסומנו כעברתי בלי דרישת הקדם שלהם: 2. פרטים ב״המצב שלי״" | data warning | rare | keep | |
| B17 | "לא נכנסו לחלופה הזו 3 קורסים, 7 נ״ז: …" | left out | sometimes | shorten | "3 קורסים לא נכנסו (7 נ״ז). אילו?" (names in "פרטים"); one course keeps today's single line |
| B18 | "מה אם נקודה אחת יותר?" | cap probe | rare | keep | |
| B19 | "שתי בחינות באותו יום: X ו-Y, ה׳ 11.2. משך הבחינות לא ידוע, כדאי לבדוק שאין חפיפה." and "בחינות בימים צמודים: X (…) ו-Y (…)." | exam warning | sometimes | keep | both stay visible as warning lines, whole (the second sentence qualifies the first). Only the duplicate chip B8j goes |
| B20 | "במערכת הזו כ-4 שעות שבועיות מחוץ לשעות הרצויות. אפשר להפוך את השעות לחובה בהעדפות." | soft limit | sometimes | shorten | "כ-4 שעות מחוץ לשעות שביקשת. להפוך לחובה" (link) |
| B21 | partial search note, split notes, error, turn warning, gone pins, friend landing, save/other-tab banners | rare states | rare | keep | unchanged: rare and actionable |
| B22 | `#live` (screen reader summary) | a11y | every | extend | today it says the alternative, semester, courses, credits, year total, free days, windows, friends, split and partial notes (ui-view.js:425). Add the exam fact and each exam warning, so nothing that leaves the screen is lost and nothing visible is unannounced. The rest of "פרטים" is not announced on change (it is read on demand) |

### Alternatives column (renderAltColumn)

| # | Element | Freq. | Verdict | After |
|---|---|---|---|---|
| A1 | title "חלופות" | every | merge | "חלופות לשנה" for a year plan, with the sort select (B7) under it |
| A2 | card head "בשנה: 42 נ״ז · 4 ימים" | every | keep | the credits are the year's and the days the shown semester's; the head and the sub line together say which is which |
| A3 | card sub "24 נ״ז בסמסטר א׳ · 3 ש׳ חלון · 2 עם חברים" | every | keep | carries the semester qualifier (board-a.spec.mjs checks it follows the semester tabs); the mini week is aria-hidden, so the words must stay |
| A4 | mini week | every | keep | |

### Courses tool (web/ui-side.js)

| # | Element | Freq. | Verdict | After |
|---|---|---|---|---|
| C1 | "חובה: בכל מערכת. אולי: רק אם משתלב טוב. לא: לא בתכנון." | first visits | move | an ⓘ toggletip "מה ההבדל?" beside "בתכנון (16)"; the text unchanged inside |
| C2 | name, credits, "חובה / אולי / לא" | every | keep | |
| C3 | "סמסטר:" + 3-button control "אוטומטי / א׳ / ב׳" | sometimes | shorten | a native select on the status line: "סמסטר [אוטומטי ▾]", labelled as today ("באיזה סמסטר ללמוד את X") |
| C4 | tag "רק בסמסטר ב׳" | sometimes | merge | in the semester slot: "סמסטר ב׳ בלבד" |
| C5 | tag "במערכת · סמסטר ב׳" | every | shorten | status line text "✓ במערכת, ב׳" (icon and words, in --success) |
| C6 | tag "פותח 7 קורסים" | sometimes | shorten | plain text on the status line |
| C7 | tags "זמין בתנאי", "חזרה" | sometimes | keep | the only bordered tags left (warnings) |
| C8 | tags "נעוץ בקיץ", "לא נכנס: …" | rare | keep | on the status line |
| C9 | "רק יחד עם פיזיקה חשמל ומגנטיות (קורס מקביל, תקנון 6.2.3)" | sometimes | shorten | "רק יחד עם פיזיקה חשמל ומגנטיות" + "למה?" (the citation behind it). No data change: `reasons` stay strings (the map, the blocked list and the improve diagnostics read them); a pure helper in ui-text.js splits a trailing "(… תקנון …)" at render time in the A course card only, with unit tests |
| C10 | "תצטרך/י ללמוד אותו בהמשך", "לא נכנס למערכת כי …" | rare | keep | |

Card before: 3 rows of controls + 3 tags + a 2-line rule sentence. Card after: the "חובה / אולי / לא" row, one status line ("סמסטר [אוטומטי ▾]
✓ במערכת, ב׳ · פותח 3 קורסים"), one warning tag, one short reason line.

### The other tools

| # | Element | Verdict | After |
|---|---|---|---|
| W1 | "מה חשוב לי": headings "העדפות", "תכנון", "לתכנן" over one control | merge | one label "לתכנן" (the section heading goes) |
| W2 | "מה חשוב לי": the scope control | keep | its single home after B3 |
| W3 | "מה חשוב לי": 5 importance rows, "איפה להעמיס" | keep | core of the tool |
| M1 | "המצב שלי": "סולם 50–150. ריק אם לא ידוע. יש לכם כמה ציונים? בדקו מול המזכירות איזה מהם נחשב." | shorten | "50–150. ריק אם לא ידוע." + ⓘ with the rest |
| M2 | "המצב שלי": profile, specialization hint, summer, progress "יעד 70% (תקנון 11.4.4)" | keep | |
| F1 | "חברים": add-friend hint, empty state, my link | keep | already one idea per block |
| O1 | "להוציא": "(פנוי · נכון ל-21.10, 21:13)" after every group id | merge | when every listed group has the same time: one line at the top, "המקומות נכונים ל-21.10, 21:13", and per group only "פנוי" / "מלא". A group with its own time (groupFresh reads `g.fetchedAt` before the file's, ui-text.js:303) or no time keeps its own text |
| O2 | "להוציא": "חלופה 1 מתוך 10. ההרשמה עצמה נעשית באפקה-נט." | keep | add the full B12 sentence under it |
| I1 | improve: the goal chips row clips "+ קורס" and wraps "פחות חלונות" to 2 lines at 1280 | fix | wrap the row, keep each chip on one line (`compact-label-overflow`) |
| I2 | improve: "חזרה למערכת המקורית" next to "חזרה למערכת שלי" | rename | the reset becomes "לבטל את כל השינויים" so the two do not read alike. Owner decision D4 |

## Prioritized changes (biggest visual win first)

| P | Change | Items | Win | Risk |
|---|---|---|---|---|
| 1 | Facts line + "פרטים" disclosure | B8, B9, B10, B11, B22 | 7 bordered chips and 3 sentences become one plain line | flows.spec reads `#pills` and pill texts; app/xss tests read pills. `#live` gains the exam fact and warnings (test it). `<details>` open state and focus kept across re-renders (keyboard test: change "הצג לפי" inside it on a phone). board-a's phone sort test expects the select visible: it must open "פרטים" first |
| 2 | One legal line in the strip; phone warnings in one board-note line | H3, H5, B12, B13, B15 | 3 grey sentences and a repeated freshness line leave the desktop board | Legal: "לא רשמי", "אינו הרשמה ואינו המלצה", "ההרשמה באפקה-נט" and "הכללים לא אושרו" stay on screen at every width; the full sentence goes to "פרטים", "להוציא" and ☰ "מידע". Tests: shell-a and out-a read `.a-unofficial`; flows reads `#boardNote` and the rules text and requires the warnings on screen on phone arrival; ui-text and xss pin DISCLAIMER; ui-text pins the freshness states. Classic keeps its texts (A only, through `designOn()`) |
| 3 | The A-semester banner as one info line | B5 | the largest coloured block goes | the count of groups needs a rules.js helper and tests; flows reads `#semnote` |
| 4 | Controls: scope off the board, semester tabs in the bar, sort in the column | B3, B4, B7, A1 | two rows of controls leave the desktop board | flows uses `bscope` on the board (move to the "מה חשוב לי" control); first-run-a reads sortBy; board-a checks the bar at 320. Keyboard order changes: the semester tabs come before the switcher |
| 5 | Shorter notices | B17, B20 | one line each | exam lines B19 untouched; ui-text tests pin leftOutText and outsideHoursText |
| 6 | Course card status line | C1-C9 | 3 tags and a control row become one line | a11y-a, board-a, flows, out-a read `.tag`; the citation split is render-only (C9) |
| 7 | Take-out freshness once | O1, O2 | the registration list reads as a list | out-a and ui-text (groupFresh) |
| 8 | Small ones | H2, W1, M1, I1, I2 | polish | shell-a; edit-a and improve-a for I1, I2 |

Each step is one commit with its tests, in both themes, at 320, 375, 1080 and 1920, under `?design=a` only (classic unchanged until the flip).

## Accessibility notes (WCAG 2.1 AA)

- Nothing becomes hover-only. Every moved text is behind a `<button>` or `<summary>` (keyboard, 44px, visible focus) and stays in the DOM.
- `#live` (B22) keeps every fact still on screen plus the exam warnings; the content of "פרטים" is read on demand, and the summary says how
  many lines it holds ("פרטים (6)").
- Warnings keep icon + words + --warning (`color-only`). The new strip line and the plain facts must pass design-contrast.test.mjs (4.5:1 on
  --bg and --surface, both themes).
- Phone 320: the facts line wraps by whole facts (each fact `white-space: nowrap`), the summary never wraps; no horizontal scroll.
- Focus order after the move: strip link, semester tabs, switcher, share, facts and "פרטים", notices, week. The `<details>` open state and the
  focused element survive a re-render (2.4.3).
- Tests to add: a11y-a's target-size scan covers `.a-top`, `.a-bar`, `.dock` and `#panel` (a11y-a.spec.mjs:54); extend it to the "פרטים"
  summary, the strip's "פרטים" link, the column sort and the course card's "למה?". Add closed/open, keyboard and focus checks for "פרטים".

## Owner decisions needed

- D1. Plan scope ("שנה / רק א׳ / רק ב׳"): only in "מה חשוב לי" (proposed), or keep it on the board and drop it from "מה חשוב לי".
- D2. The legal line: "לא רשמי · אינו הרשמה ואינו המלצה (ההרשמה באפקה-נט) · הכללים לא אושרו במחלקה" (proposed), or other words.
- D3. "לעומת חלופה 1" into "פרטים" (proposed), or keep it visible when an alternative other than 1 is shown.
- D4. Rename the improve reset button to "לבטל את כל השינויים".
- Scope: all eight steps, or steps 1-4 (the board) first.

## Review

Codex (read-only, 2026-11-22) reviewed the first draft: 13 findings, all checked against the code and taken. The main ones: the strip is not
sticky and the phone scrolls past it (warnings stay in the board note on a phone); the unpublished-exams status and the exam-overlap sentence
stay visible; "אינו הרשמה" stays in the visible line; the footer is hidden in A and ☰ "מידע" lacks the full disclaimer; `#live` does not hold
every fact; the alternative cards need their semester qualifier; the A-semester count must count "X או Y" groups; one shared seat time is
true only when the groups share it; the citation split must not change the `reasons` type. Raw answer: `.superpowers/sessions/design-lead/codex-review.md`.

## Not in this proposal

No layout change (the week stays on screen, the panel, dock and tabs stay). No new colours or tokens. Classic is untouched.
