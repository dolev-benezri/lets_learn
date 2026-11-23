# Design A: one design system, fewer words, the main thing first (design doc)

Date: 2026-11-22. Status: waiting for the owner's approval. Author: the design-lead session. No web/ file changes with this doc.
Builds on: `2026-11-22-design-a-declutter.md` (approved, being built on claude/design-a). This doc does not reopen it.

## Intent and why

The owner, after using design A on the live site at 1920px:

- "אני חושב שהאתר עדיין לא מעוצב כמו שצריך"
- "הבעיה העיקרית שלי זה העומס במילים שאתה מכניס לכל דף זה צריך להיות מאוד נגיש למשתמש בלי הרבה מילים במקומות מיותרים בלי הדגשת העיקר באתר"
- On the approach: "אני מסכים עם ג אבל וזה אבל גדול לא להיות רובוטי להפעיל שיקול דעת אם יש 301 מילים ומותר רק 300 לא להפוך את העולם
  כדי להוריד מילה הכול בסדר אבל בגדול כן זה צריך להיות עם תוכנית סדורה לדבר הזה"

So the product goal: on every screen a student sees the one thing that matters, said in few words, and can act on it with one obvious
button. Everything else stays one tap away. The site should look like a professional product: aligned, centred, calm, no overlapping layers.

## Goals

1. A shared set of rules for design A (the "system" below), so every screen gets the same width, spacing, type sizes, surfaces and parts.
2. Each screen has one emphasized thing and one primary button.
3. Far fewer words on screen: help and explanations behind a tap, each notice said once in one line, legal and safety notices kept.
4. Fix the layout defects the owner and the browsing pass found (list below), screen by screen, in five phases.

## Non-goals

- No new design: design A's frame stays (the week on screen, tool column or sheet, dock and tabs, build and improve modes).
- No new colours. The palette in `web/design-a.css` stays; the ui-ux-pro-max search suggested its own palette and a Latin font (Plus
  Jakarta Sans): both rejected, since A's teal palette is already the owner's choice and the font must be Rubik for Hebrew.
- Classic design is not touched. The flip to A as the default (adoption plan Task 11) is a separate decision.
- No changes to the solver, the data or what a plan contains.

## Anti-goals (a failure even if every rule is met)

- Robotic rule-following: cutting a useful sentence to hit a number, or a screen that obeys every limit but leaves a student unsure what to
  do. The limits below are targets; judgment wins, and a screen that keeps more says why in one line in its phase notes.
- Hiding what protects the student: "לא רשמי", "אינו הרשמה ואינו המלצה", "הכללים לא אושרו במחלקה", stale data, exam clashes. They get
  shorter, never hidden (declutter spec rules hold).
- Mystery meat: an icon or a "פרטים" that a student does not understand. Every hidden thing sits behind a labelled control.
- A word-count test that fails a build. There is none (owner's "big but").

## Constraints

Hebrew RTL, Rubik. WCAG 2.1 AA: contrast (test/design-contrast.test.mjs), 44px targets, keyboard, visible focus, screen readers can reach
everything hidden. Widths 320 to 1920, light and dark. Plain JS, no build step, no new dependencies. Under design A only (`designOn()` /
`:root[data-design="a"]`). The owner tests on a phone, often over Remote Control.

## Approaches (chosen: C, with B's "one focus per screen")

- A. Clean each screen separately with the declutter rules and fix the logged defects. Fastest, lowest risk; no shared rules, so screens
  drift back and emphasis stays uneven.
- B. Rebuild each screen around one focus: one headline, one primary button, one help line, a "?" help sheet per screen; improve mode as
  three steps. Strongest, but the biggest rewrite and the longest wait.
- C. Rules first, then every screen through them in phases. One set of widths, spacing, type, surfaces and parts, a word budget as a
  target, then phase by phase with one mockup per phase for the owner. Consistent, and the owner sees results after each phase.

The owner chose C, with the "big but" above. From B we keep its principle: one emphasized thing and one primary button per screen.

## The system

### 1. Page frame and widths

```
≥1440px   | ☰ ◐      [מערכת חדשה | שיפור מערכת קיימת]            המערכת שלי |   header inside the frame
          |  נבדק לפני 10 שעות        לא רשמי · אינו הרשמה ואינו המלצה …      |   strip inside the frame
          | [▸ rail 64] [            board            ] [tool 400]             |   build: alternatives folded to a rail
          '----------------------- max 1680, centred -----------------------'
```

- Build mode: one frame, max-width 1680px, centred; outside it, the page background. The header, the strip and the three columns all
  sit inside it, so their edges line up. Below 1680 nothing changes from today's widths.
- The alternatives column folds (owner, 2026-11-22: "זה מעמיס על הדף זה צריך להיות מתקפל"). From 1080px it starts as a 64px rail: an
  open button with the count, then one 48px button per alternative with its number and one tiny dot per teaching day (filled = a day
  with lessons), the shown one filled in the primary colour. The open button widens it to today's 280px (240 at 1080-1279) cards
  with a "הקטנה" button in the header; the choice is remembered on the device. The week gets the space back. The switcher arrows stay
  the main way between alternatives; on a phone nothing changes (swipe and the switcher, no column).
- Improve mode: max-width 1200px, centred. Before a schedule is loaded there is no week to show: one centred column (max 640) with the
  load choice. After loading: the tool column (440) beside the week.
- One scroll area per region where possible: the page scrolls; a column scrolls on its own only when it is sticky (tool, alternatives),
  and its scrollbar is thin (`scrollbar-width: thin`).
- Tabs follow the frame: the improve-mode tabs ("המערכת שלי / שינויים / המצב שלי") sit over the content they switch, with their own width,
  not spread across 1920px.

### 2. Spacing scale

4, 8, 12, 16, 24, 32, 48 px (`--sp-1` … `--sp-7` in `web/design-a.css`). Inside a part: 8-12. Between parts in a column: 16-24. Between
regions: 24-32. New padding, gap and margin values come from the scale; existing one-offs move to the nearest step when a phase touches
them. Not covered by the scale (left as they are): 0, `auto` (centring), safe-area `calc()`s, the screen-reader-only utility, borders
(1-2px), and component sizes such as the 44px tap height.

### 3. Type scale and emphasis

| Role | Size / weight | Use |
|---|---|---|
| Key | 20-22px / 600 | the one emphasized thing on a screen (see the table in Phases) |
| Title | 17-18px / 600 | a screen or panel title |
| Section | 15px / 600 | a group heading inside a panel |
| Body | 15px / 400 | text a student reads |
| Small | 13px / 400, --text-2 | facts, hints, times |
| Tiny | 12px | only timestamps and the week's room line |

Emphasis rule: one Key element per screen. Colour is never the only emphasis (weight or size goes with it). Bold inside running text only
for a number or a name the student acts on.

### 4. Surfaces

Three levels only: the page (--bg), a region (the board, a column, a sheet: --surface), and a group inside a region marked by a heading
and a divider, not a second card. No card inside a card inside a panel (today's tool panels have two). Shadows only on things that float
(sheet, popover, dialog, menu).

### 5. Parts (the kit)

| Part | What it is | Replaces |
|---|---|---|
| Facts line | plain text facts separated by "·", Small size | chips that are not filters (declutter B8) |
| Notice line | icon + one notice block (it wraps freely, never clipped); info (--text-2) or warning (--warning); a link at the end when there is more. A safety qualifier (e.g. "משך הבחינות לא ידוע…") stays in the block, never behind the link | filled banners |
| "פרטים" | native `<details>`, labelled with what it holds, 44px | extra sentences |
| List row | a full-width row: icon, label, optional value or chevron; dividers between rows; 48px | stacked outline buttons and bare links (☰, מידע) |
| Section | heading + divider + content | card inside a card |
| Buttons | one primary (filled) per screen; secondary (outline) for alternatives; tertiary (text) for minor ones; destructive in red text, never next to the primary | rows of equal-weight outline buttons |
| Folding column | a sticky side column with a 64px rail state (an icon button with a count, then one compact button per item) and an open state (full cards, a "הקטנה" button in its header); the open/closed choice remembered on the device | a column that is always open |
| Tab bar | icon above a label, label never wraps (`white-space: nowrap`), ≤ 5 tabs | icon beside a wrapping label |
| Overlay | on a wide screen a tool takes a column and never covers content; a modal side sheet has a scrim, a close button and traps focus; on a phone, the bottom sheet | the record panel fixed over the improve column |
| Empty state | one line saying what will appear here + the one button that makes it appear, centred in the area it fills | a hint floating at the top of a grey field |
| Loading | "מחשב חלופות…" in the switcher and one spinner, nothing that reads as a failure | "אין חלופות" while the search runs |

### 6. Words (targets, with judgment)

- Before any tap, a screen shows: its title, its Key element, the controls, at most one helper line per group, and the notices that apply.
- Targets: the board ≤ about 25 words above the week, warnings aside (the declutter spec reaches 56-67 with the legal strip; the target
  applies from phase 1's second step on, see Phases); a tool group ≤ one helper line; a dialog ≤ two lines before its action.
- A screen may go over when the words carry something a student needs right there; its phase notes say why in one line.
- Copy rules (ux-copy): verb-first buttons ("טוענים קובץ", not "קובץ מערכת (אקסל …)"); one term per idea; each notice once on a screen;
  no instructions a control already shows; numbers as digits.
- Help that explains how something works goes behind an ⓘ button or "פרטים". The ⓘ is an inline disclosure, not a floating popover: a
  `<button aria-expanded aria-controls>` named "עזרה: <topic>", that shows a short paragraph right under its line; Escape or a second tap
  closes it, focus stays on the button. It does not reuse `#pop` (the lesson popover, with its own positioning and focus trap).

### 7. Phone and tablet

- Phone (<600): a tool sheet opens at about 60% of the screen with the week visible above it. Today a build tool sheet is
  `min(84dvh, 100dvh - 120px)` high (design-a.css:201) and, with the dock under it, leaves only the header showing; the improve sheet
  (`.edit-tool`, max 78dvh, design-a.css:213) does the same with two bars. Both sheets follow the new rule. Opening a sheet scrolls the
  page so the board's first lesson row sits in the visible area above it (today the scroll position is kept, shell-a.spec.mjs:158, so
  that test changes). Each sheet gets an expansion button at its top: the `#panel` grip (today decorative, `aria-hidden`, ui-shell.js:56)
  and a new one on `.edit-tool`, named "הגדלה" / "הקטנה" with `aria-expanded`. No drag gesture (none exists today; a drag needs snap
  points and a keyboard alternative). My call; the phase 4 (tools) mockup shows it to the owner.
- One sticky bar at most above the dock (today improve mode stacks two).
- Tablet (600-1079): the dock is centred with a max width of 560px instead of stretching across 768px.

## Phases

Each phase: one mockup (static HTML from the real page, like the declutter mockups) for the owner's approval, then the ui session builds
it on claude/design-a, then I review it by browsing, then the manager merges. A phase may start its mockup while the previous one is built.

| # | Phase | Key element (the one emphasized thing) | What changes | Defects fixed |
|---|---|---|---|---|
| 1 | Board (declutter, in progress) + frame | the week; above it the facts line of the shown alternative | the approved declutter; then the frame (§1), tab bar (§5), loading state, alternatives column folded to a rail (§1), its cards on the type scale, the block above the week folded (Phase details) | W1, W2, W4; owner-3 (part), owner-6, owner-7, owner-8 |
| 2 | Improve mode | before load: the load choice; after: the week with the change; שינויים: "חפש הצעות", then the shown proposal | frame (§1) with the empty state; the record opens in the tool column's place (wide) with a back control, never over it; tabs over the content; "קובץ מערכת" opens the device's file picker at once and the editor opens with the file already read (manual stays a second button); the goal chips wrap; buttons: one primary, the rest secondary or under "עוד"; one sticky bar on a phone; the course search (Phase details) | owner-1, owner-2, owner-4; W7-W12, P1; owner-13 |
| 3 | First run (terms, track and year, what I passed, the guided pass) | the terms on the whole screen, then one step card at a time | the terms cover the whole screen on the first visit; a guided pass of one centred card per step before the first schedule (Phase details, "Phase 3, first run") | D1; owner-9, owner-10 |
| 4 | Tools: המצב שלי, קורסים, מה חשוב לי, חברים, להוציא | המצב שלי: progress ("41 מתוך 41 נ״ז"); קורסים: the planned count and the "חובה/אולי/לא" choice; מה חשוב לי: the 5 importance rows; חברים: add a friend; להוציא: "העתק הכל" | one surface level, sections not cards; helper lines behind ⓘ; the course card status line (declutter C); one destructive control (delete-all lives in ☰ only); the phone sheet at 60% | W3, P2; owner-3 |
| 5 | ☰, מידע, dialogs (schedule editor, friend editor, map, confirmations), the progress map colours (owner-11) | ☰: the list itself; מידע: "על הכלי" first sentence; the editor: the week being built | list rows; a back arrow in the sheet header instead of "חזרה לתפריט"; links as rows with an external-link icon; "מצב כהה" leaves ☰ (the header has it); the editor's side column: one input method visible, the other two under "דרכים נוספות" | owner-5; W5, W6, W12 |

### Phase details (calls made for the builder)

- Phase order (manager, 2026-11-22): improve mode moves up to phase 2, before the tools; the owner keeps meeting it at 1920. Phase 1's
  frame (Task 2) only partly helps there. Then (manager, the same day, owner-9 and owner-10): first run moves up to phase 3, the tools
  to phase 4, ☰/מידע/dialogs to phase 5 with the progress map colours (owner-11). The owner approved phase 2's picture the same day,
  with one addition, the course search.
- Phase 2, the improve-mode mockup (design-lead's `mockups/edit-collage.png`, 1920, today beside the proposal; frames in `mockups/edit/`):
  - Chrome: the header and the strip line up with the 1200 frame (plan Task 2); the strip is phase 1's one line.
  - Tabs: "המערכת שלי / שינויים / המצב שלי" as a segmented control centred over the content (44px segments, the shown one on the
    surface colour, primary text); only the shown one is pressed (today "שינויים" stays pressed while "המצב שלי" is open).
  - Before load: one centred card, max 640: "טוענים את המערכת שלכם" (key size), one line "מאפקה-נט, או בוחרים בעצמכם.", then
    "טוענים קובץ" (primary, the file picker as in "the file button" below) over "בוחרים קורסים ידנית" (secondary), both `min(320px, 100%)` wide, and
    "אקסל, PDF או צילום · איך מורידים מאפקה-נט?" (the link opens today's yedion instructions in place). No week, no hint sentence, no
    footer bar ("לשינויים" with no schedule leads nowhere).
  - After load (המערכת שלי): the 440 tool column as one surface, the week as one surface beside it. The tool: the title, one line of
    what is loaded ("2 קורסים · ימים ג׳ ו-ד׳"), "המערכת כבר רשומה במכללה", "טעינה מחדש או שינוי ידני" (as today), then "לשינויים"
    (primary) inside the section. "כל שינוי נשמר מיד." goes (manager's ruling).
  - שינויים: the step line shortens to "לחצו על שיעור כדי לסמן שיכול לזוז."; the goal chips wrap, every label whole; "חפש הצעות" is the
    section's primary button until there is a proposal, then a secondary "חפש שוב". The proposal: "שמור הצעה" (primary), "העתק שינויים",
    and "עוד" (a disclosure: "הראה את היום החדש", "לבטל את כל השינויים", declutter D4; the mockup shows the old label). The card's
    "הצעה בלבד. ההרשמה נעשית במכללה." (`PROPOSAL_ONLY`) goes: the strip's "אינו הרשמה" is on the same screen (each notice once;
    manager's ruling, 2026-11-22, over Codex's wish to keep it by the button). The footer bar goes: "חזרה למערכת שלי" is the tab, "חפש הצעות" is in the section.
  - המצב שלי: in the tool column's slot, "→ חזרה" above its title, sections on one surface; the week stays beside it. `#panel` stays
    where it is in the DOM (the mockup moved it only for the picture): `renderEdit()` replaces `#edit`'s subtree (ui-edit.js:358), so the
    record is placed over the hidden tool column's slot by CSS (the frame's inline start, 440 wide, under the tabs), never inside `#edit`.
  - Phone: the same buttons and copy; one sticky bar at most (the dock); the sheet rules of phase 4 do not block this phase.
- Phase 2, the course search (owner, approving phase 2: "חייב להיות שם אפשרות לחפש קורס לפי כל אחד מהקריטריונים האלה שיהיה נגיש";
  his recording shows the yedion's "חיפוש קורסים במערכת": by code, by the name's first letter, by day + hour + semester, by program, by
  the lecturer's first letter in Hebrew or English). One field and a few chips, not five forms:
  - Where: in שינויים, "+ קורס" (today the `addCourse` select, ui-edit.js:190) becomes a button "חיפוש קורס" that opens the search in the
    tool column (on a phone, the sheet), in place of the goals and the proposal, with "→ חזרה" at its top.
  - The field: `<input type="search">`, label "חיפוש קורס", placeholder "קוד, שם או מרצה". It matches as you type, from the first
    character: the course code (the start of the course key or of a group id), the name (any part, so a first letter works), a group's
    lecturer (any part; titles such as ד״ר and מר do not count).
  - Chips under it, the goal-chip select pattern: "יום ▾" (א׳-ו׳), "שעה ▾" (08:00-20:00: a group with a meeting that covers that hour, on
    the chosen day or on any), "סמסטר ▾" (the record's by default), "תוכנית ▾" (the student's by default, then the catalog's programs).
  - Results: with no criterion, one line "מקלידים קוד, שם או מרצה, או בוחרים יום ושעה." and no list. Otherwise up to 30 courses, those
    open to the student first, then by name; a count line in a polite live region ("12 קורסים", "אין קורס כזה", "יש עוד, מצמצמים?").
    Each course: its name as a heading, the code and credits; one line per option the site can actually register, as the swap list
    builds them today (a primary group with its required tutorial or lab, `buildOptions()` with the student's registration and the split
    setting): days and hours, lecturer, and a tag: "נכנס" (no part clashes with the shown week, the course itself left out), "מתנגש עם
    <course>" (warning colour), "מלא" (a part is full). A course with no option that can be built: "אין קבוצה פתוחה", no button.
    A course not in the schedule: "הוספה" on each option, which adds the course with that option fixed (the next search keeps it as given
    or says "לא נמצאה מערכת עם הקבוצה הזו"). A course in it: "מעבר לקבוצה" on each other option (today's `pickSwap`). A course that needs
    a parallel course (`conditional`) shows "דורש במקביל: <course>" and its "הוספה" adds both, said on the line. A course closed to the
    student (passed, a missing prerequisite) shows the reason in place of a button.
  - Another program's and another semester's courses are read only: times, lecturer and the tag show, the row says why ("לא בתוכנית
    שלך", "בסמסטר ב׳") and has no button. Ruling (manager, 2026-11-22): another program's courses stay read only for now; adding one
    (credits, prerequisites, the department) becomes a later task only if the owner asks for it.
  - Keyboard and screen reader: the field, the chips, then the results in Tab order; each course a list item under an h3; Escape in the
    field clears it, a second Escape closes the search and returns focus to "חיפוש קורס" (the search takes Escape before the phone sheet
    does, ui-shell.js:266); while the search is open the proposal's arrow keys (ui-edit.js:871) do nothing; a redraw (a search finishing)
    keeps the focused control and the caret. Targets 44px.
  - Data: each program file (`web/data/afeka/<year>-<sem>/<program>-<startYear>.json`) holds the courses with their groups: lecturer,
    meetings (day, start, end, room), `full`, exams; `catalog.json` holds the programs and their start years. Missing: English lecturer
    names (the yedion's English letters; the Hebrew search covers a lecturer), and other programs are not loaded today: choosing one in
    "תוכנית" fetches that program's file for the same semester and the student's start year (or the latest start year it has), once per
    visit; a failed fetch says so in the count line, and only the last chosen program's answer is shown. The program's three semesters
    are already loaded (app.js:598), so "סמסטר" needs no fetch.
  - The build mode's "קורסים" tool gets the same field and matcher (code, name, lecturer; no day or hour, which the solver decides) in
    phase 4. My call: one way to find a course everywhere.
- Phase 3, first run (owner, 2026-11-22. owner-9: "האישור תנאים צריך להופיע בהתחלה על כל המסך ככה שפעם ראשונה אף אחד לא יכול להתחיל
  לתכנן אפילו בטעות בלי לאשר תנאים". owner-10: "אם מישהו בוחר מסלול ואז שנה הוא צריך לעבור את התהליך של קורסים מה חשוב לי וחברים לפני
  שנבנה מערכת"). Decided with the owner in design-lead's session:
  - The first visit: the terms on the whole screen, nothing behind them usable. Then a guided pass, one centred card per step (the owner
    chose it over the steps in the side column after seeing both, `mockups/first-run/way1-1920.png`): תנאים · מה עברתי · קורסים · מה חשוב
    לי · חברים, "שלב N מתוך 5", "→ חזרה" and "המשך". The first schedule is built only after the last step.
  - מה עברתי: the grade sheet first ("מעלים גליון ציונים (PDF)", today's import). Without one, the earlier years' mandatory courses are
    listed ticked and the student unticks what they did not pass before "המשך" (the owner chose this over silently all ticked, today's
    app.js:471, and over nothing ticked). A first-year student has no such step.
  - No step can be skipped; each continues with a default (my proposal, not objected to): קורסים the year's courses as today, מה חשוב לי
    today's settings, חברים "אין לי חברים להוסיף".
  - Changing the year later reruns only מה עברתי, for the years that became earlier; courses, what matters and friends stay (owner).
    What the student confirmed (a course unticked, a failure on file) is kept.
  - The pass is part of the gate: a saved "first run done" flag; until it is set no schedule is computed and the board behind stays
    inert, a reload returns to the step reached. The earlier years are not filled in silently for a new student (app.js:471, :679 become
    the ticked list of מה עברתי); saves from before keep their `assumed` and do not see the pass.
  - Still open, for the owner before this phase's plan: the contents of the קורסים, מה חשוב לי and חברים steps, the phone, and where the
    track and year sit (on the terms card or a step of their own).
- Plan depth (my call): the implementation plan covers phase 1 in full (both steps) and outlines phases 2-5. Each later phase gets its
  task-level plan after its mockup is approved, since the mockup may change it.
- Phase 1 steps: 1a is the declutter spec as approved (the ui session is building it). 1b is the frame (§1), the tab bar (§5), the loading
  state, the folding alternatives column (§1) and its cards on the type scale. The board's ≈25-word target applies from 1b on.
- The folding column (my calls): the rail is the default for every student, including returning ones, until they open it; the choice
  is stored in localStorage under its own key (a private window starts folded). Rail buttons carry the alternative's summary in their
  accessible name ("חלופה 3: 42 נ״ז · 5 ימים") and pick it like a card does; the sort control ("לפי") shows only in the open state. The
  open button is `aria-expanded` with `aria-controls` on the column. Opening or folding keeps focus on the button that did it.
- Phase 1, the block above the week (owner, 2026-11-22, approving phase 1: "כל המלל המוגזם שיש פה שהקפתי בעיגול שחור תצמצם ותקפל
  ותשאיר רק את הרלוונטי"; he circled everything from the board's top to the week). The rule for what stays visible, my judgment, no
  word limit: something wrong with the plan on screen that the student must check before registering, plus the legal minimum. Everything
  that explains goes into "פרטים", one tap away. Built on top of declutter steps 1-8:
  - The strip: one line, "לא רשמי · אינו הרשמה ואינו המלצה", then, only when the data is stale, a short warning ("נבדק לפני 32 ימים",
    "הבדיקה האחרונה נכשלה", "לא ידוע מתי נבדק"), then "פרטים" (the מידע panel, as today). "(ההרשמה באפקה-נט)", the rules clause
    ("הכללים לא אושרו במחלקה") and the full freshness sentence move to the board's "פרטים" and stay in מידע. Phone: the line above the
    week (#boardNote) shows the short stale warning instead of today's stale + rules line; its other warnings (an unverified program,
    courses passed without their prerequisite) stay. מידע says the full freshness sentence (design A's wording) and the full legal line.
  - The A-semester assumption ("התכנון של ב׳ מניח…"): on semester ב׳ it stays as today's short line with "אילו?"; on א׳ (it speaks about
    ב׳) only its sentence in "פרטים" (which holds it on both semesters). The other info lines of that area (a course only in ב׳, and so on) go into "פרטים"; "לא נכנס לאף סמסטר" stays.
  - The search ran out of time: no banner. When there are alternatives, a small text button "חפש עוד" beside the switcher (the same action and `data-k` as today), its
    sentence in "פרטים". At the time cap there is no button, only the sentence in "פרטים".
  - Exam clashes: one warning line, warning colour and icon: "2 בחינות באותו יום, 28.01.2027 · פרטים" for one pair (the date as `examWhen` writes it); "3 זוגות בחינות באותו
    יום · פרטים" for more; adjacent days likewise ("2 בחינות בימים צמודים, …"). "פרטים" opens the board's "פרטים" at the full sentences
    (names, hours, "משך הבחינות לא ידוע, כדאי לבדוק שאין חפיפה"), first in its list. This is the owner's call and replaces, for exam
    warnings only, §5's rule that a safety qualifier stays in the visible block and the declutter spec's "exam warnings stay whole".
  - Courses left out ("2 קורסים לא נכנסו · אילו?", declutter step 5) stay visible: the plan is missing something the student asked for.
  - The credit-cap probe ("מה אם נקודה אחת יותר?") and the outside-hours line ("להפוך לחובה") move into "פרטים" with their buttons.
  - Result, worst case (year plan, stale data, search cut short, one clash): about 180 words above the week today, about 50 after, most of them
    the switcher row and the facts line; with nothing wrong: the strip, the switcher row and the facts line only.
- Wording: the phase mockup carries the exact Hebrew. The owner's approval of the mockup approves its words; the builder does not invent
  copy. A string the mockup does not show follows the copy rules (§6), and I review it when I browse the build.
- Phase 2, the file button: it keeps today's check first (track or year missing: focus the missing field, say why, open nothing;
  ui-edit.js:678). Then it clicks a hidden `<input type="file">` with today's accepted types (the yedion's xlsx, PDF, an image). After a
  file is chosen, the existing schedule editor (ui-friend-editor.js, edit mode) opens at its file step with that file handed over, and
  everything after that is today's flow: a scanned PDF still asks which pages to read (ui-friend-editor.js:434) and shows its reading
  progress; an unreadable file shows today's error at the file control. The only change is the click on "בחירת קובץ" that the student no
  longer has to find. Cancel in the picker: nothing happens. The track and year cannot change while the file is read: the editor is a
  modal dialog (`showModal`, ui-friend-editor.js:72) over the fields, as today.
- Phase 2, "the record": in improve mode the dock's "המצב שלי" opens the המצב שלי tool (`#me` inside `#panel`, `ui.overlay = 'me'`). Today,
  on a wide screen, that panel is `position: fixed`, 440px, at the inline start (design-a.css:355), covering the improve tool column. In the
  new layout it takes the tool column's grid slot with a back control ("חזרה") in its header; on a phone it stays the bottom sheet.
  The swap is driven by state, not by DOM removal: `ui.overlay === 'me'` sets a class on the stage that hides `.edit-tool` by CSS, so
  `renderEdit()` redrawing the tool (ui-edit.js:554, e.g. when search results arrive) does not bring it back. A running search continues.
  Back or Escape closes the record and returns focus to the dock's "המצב שלי" button. The guarantees edit-a.spec.mjs:141 checks today
  (the route and a running search survive the record) carry over.
- Phase 4, delete-all: today it is in ☰ (ui-mode.js:51) and in "המצב שלי" (ui-me.js:335). The "המצב שלי" copy goes; ☰ keeps it with its
  confirmation (ui-actions.js:373).
- Screenshots: docs/media and the README are re-shot once, after the flip to A (adoption plan Task 11), not after each phase.

## How this meets the declutter spec

The declutter spec is phase 1's content and is built as approved. This doc adds the frame, the tab bar, the loading state and the type
scale on top. Where both speak, the declutter spec's wording and legal rules win; this doc only changes the look (sizes, spacing, surfaces).

## Tests and risks

- Existing suites stay the gate, with these planned changes: unit tests; the browser suite under `?design=a` in WebKit; design-contrast
  for any new colour pair.
- widths-a today stops at 1280px (widths-a.spec.mjs:34): add 1440, 1680 and 1920 cases that check the frame width, equal outer margins,
  the RTL order of the columns, and that the header, strip and stage edges line up.
- a11y-a's target scan visits `.a-top`, `.a-bar`, `.dock` and `#panel` only (a11y-a.spec.mjs:54): add `.edit-tool`, `#drawer` and
  `#friendEd` as roots, and for the new disclosures (ⓘ, "פרטים", the sheet button): activation by keyboard, the expanded state, focus kept
  after a redraw and a resize, and the focused control on screen (not under a sticky bar), beyond the outline check at a11y-a.spec.mjs:140.
- Tests that assert the opposite of a phase's change are replaced in that phase, not kept: the goal chips' single row at 1280
  (improve-a.spec.mjs:104) and their horizontal scroll at 320 (edit-a.spec.mjs:76) become "every chip label whole, the row wraps, every
  chip reachable by keyboard"; the sheet scroll test (shell-a.spec.mjs:158) becomes the new scroll rule.
- New checks per phase only where behaviour changes: the record not covering the improve column (a rect test), the file button opening the
  picker (an `input[type=file]` click), the phone sheet's height, the empty states. No word-count tests.
- Risk: the 1680 frame changes the position of everything on very wide screens; screenshots in docs/media and the README need a re-shoot
  (scripts/readme-shots.mjs).
- Risk: the 60% phone sheet changes how a tool feels on a phone, where the owner works; it gets its own mockup and the owner's OK in phase 4.
- Risk: moving delete-all out of "המצב שלי" changes where a student finds it; ☰ keeps it, with its confirmation.

## Left to the builder

Exact token names, the CSS for the frame (grid with `max-width` and auto margins or `min()` columns), the markup of the ⓘ
disclosure (its behaviour is fixed in §6), and the order of commits inside a phase.

## Appendix: the defects this doc fixes

From the owner (screenshots kept privately, 2026-11-22) and my browsing of a local copy with test data (1920, 1280, 768, 375, light/dark):

| ID | Where | Defect |
|---|---|---|
| owner-1 | improve, wide | layout not centred, the board area a near-empty grey field with one sentence floating at its top, cards and the footer bar not aligned |
| owner-2 | improve + המצב שלי | the panel covers the improve content and cuts it |
| owner-3 | build tools | the tab bar is cramped ("מה חשוב לי" wraps), panels and course cards dense |
| owner-4 | improve, load | the green "קובץ מערכת" button does the same as "לבחור קורסים וקבוצות ידנית" |
| owner-5 | ☰ מידע | unstyled: a big outline "חזרה לתפריט" button, plain list, bare links |
| owner-6 | board | the words above the week on alternative 9 (banners, chips, comparison lines) |
| owner-7 | board, wide | the alternatives column (a mini-week card per alternative) is always open and loads the page |
| owner-8 | board | everything between the board's top and the week: tabs, banners, chips, notices, the legal sentences, the search and exam banners |
| owner-9 | first run | the terms card sits in the tool column beside an empty board; it must cover the whole screen on the first visit |
| owner-10 | first run | after choosing year ב the site took all of year א as passed and built a schedule at once |
| owner-11 | progress map | almost every course in one colour; the status does not read at a glance |
| owner-12 | board | the page scrolls far past the content into empty grey (a layout bug, the ui session, phase 1) |
| owner-13 | improve | no way to find a course by code, name, day and hour, program or lecturer (the yedion's "חיפוש קורסים במערכת") |
| W1 | wide | no page max-width: header items at the far edges, three columns edge to edge, three scrollbars side by side |
| W2 | wide | tool tab labels wrap |
| W3 | tools | card inside a card; "התמחות" segment labels wrap; small outline buttons at the far end; delete-all twice |
| W4 | board | while the search runs the switcher says "אין חלופות" and "מחשב…" shows twice |
| W5 | ☰ | five full-width outline buttons, then empty space; "מצב כהה" duplicates the header |
| W6 | מידע | as owner-5: no grouping, no icons, 60px gaps between links |
| W7 | improve, empty | tabs spread across 1920px; the empty-board hint floats; the sticky footer looks cut |
| W8 | improve, loaded | a small block in the middle with empty space both sides; the week shows only 4 hours |
| W9 | improve + המצב שלי | as owner-2; no scrim, no close, and it covers the end of the legal strip |
| W10 | improve, שינויים | the goal chip row clipped, a label wraps, a horizontal scrollbar; six buttons of equal weight |
| W11 | improve, load | as owner-4 |
| W12 | schedule editor | a side column of small grey text and three input methods at once; "שמור / ביטול" far from the content |
| P1 | phone, improve | the sheet hides the whole week; chip row cut; two sticky bars; proposal buttons under the action bar |
| P2 | phone, tools | the sheet and the dock leave only the header showing, so the week is not seen while a tool is open; card inside card |
| P3 | tablet 768 | the phone dock stretched across 768px; week block names cut |
| D1 | first visit, wide | an empty 1435px week with no hint; the terms card in a corner of the tool column |

## Approval asked of the owner

This doc as a whole (the rules, the five phases and their order). After approval: an implementation plan (superpowers:writing-plans), and
the phase 1 frame mockup.
