# UI/UX design audit: "המערכת שלי" (Afeka timetable builder)

- Date: 2026-10-08
- Server: `python -m http.server 8140 -d web` (http://localhost:8140), built-in browser pane, Chromium emulation.
- Widths covered: 320, 375, 768, 1280x800, landscape phone 740x360. Screens: first-run gate, plan, no-schedule state, sidebar, prefs/friends/registration sheets, lesson sheet, `#me` (with a failed course), friend editor, progress map (375 and 320), legal.html. See "Not checked" for gaps.
- Method: JS measurement script per width (overflow, 44px targets, text under 12px, accessible names, headings), computed-style contrast, CSS read of `web/style.css` and `web/map.css`, screenshots where the visual matters.
- Baseline docs read: `design-system/afeka-scheduler/pages/app.md`, `docs/ISSUES.md` sections 18/22/23, `docs/ACCESSIBILITY-AUDIT.md`. Repeats are marked "known".
- Owner state in `localStorage['afeka-sched-v1']` was saved to sessionStorage before any change and restored at the end (see last line of this file).

## Measurements

Script checks per width: horizontal overflow (`scrollingElement.scrollWidth - innerWidth`), interactive boxes under 44x44 (radios measured by their label; inline text links ignored), visible text under 12px, controls without an accessible name, heading levels. `pointer:coarse` is true in the 320/375/740 emulation and false at 768 and 1280, so 768 shows the mouse sizes (36px) and says nothing about a real iPad. The 36px mouse targets are the documented `--tap:36px` for `pointer:fine` (`web/style.css:22`) and are listed once as U-24, not per width.

| Screen / width | Overflow X | Targets < 44px (coarse) | Text < 12px | Unnamed controls | Notes |
|---|---|---|---|---|---|
| Gate (first run), 375 | 0 | 0 | 0 | 0 | h1, h2 only |
| Plan, 375 | 0 | 0 | 0 | 0 | body height 4693px; `#side` 3199px tall with 74 course cards |
| Plan, 320 | 0 | 0 | 0 | 0 | title ellipsised (`scrollWidth` 93 > `clientWidth` 84); "רשימה להרשמה" label 81px inside a 73px button |
| Plan, 320, scrolled | - | - | - | - | sticky chrome: top bar 52 + semester tabs and day selector 104 + bottom bar 63 = 219px of 640 (34%); in-flow chrome above the first block at scroll 0: first block at y=385 |
| `#me`, 320 and 375 | 0 | 0 (the checkbox input is 20x20 but its label is 44px) | 0 | 0 | 5087px tall at 320; profile and progress cards first (898px), course lists after |
| Prefs, friends, registration sheets, 320 | 0 | 0 | 0 | 0 | sheet = 480px (75dvh) of 640 plus scrim; prefs content 1825px, registration 2326px |
| Lesson sheet, 320 | 0 | 2: `.btn.sm` lecturer buttons 56x28 and 55x28 | 0 | 0 | sheet 460px tall (72% of 640) |
| Friend editor, 375 | 0 | 0 | 0 | 0 | tabs and header fine |
| Friend editor, 320 | `.fe-pick` 358 > 320 | 0 | 0 | 0 | semester segment and search row start at x=-38; "הצג קבוצות" button cut off; title ellipsised |
| Progress map, 375 | 0 | 27 (nodes 40-42px by design with a larger hit circle; alt buttons 36; filters 36; zoom 44) | 0 (SVG text floor is 12px) | 0 | chrome above the map 252px of 812 (31%) |
| Progress map, 320 | 0 | same set | 0 | 0 | chrome 252px of 640 (39%); alt label shortens to "1/10"; mini chip wraps to two lines (138x41) |
| Landscape 740x360 | 0 | 0 | 0 | 0 | day-selector mode (width < 760): sticky chrome 156px of 360 (43%); first block below the fold (week top at y=351) |
| Plan, 768 | 0 | n/a (pointer:fine) | 0 | 0 | four actions are icon-only with no `title` |
| Plan, 1280x800 | 0 | n/a (36px by design) | 0 | 0 | week grid top at y=305 of 800; header stack = 38% of the viewport |
| Plan + docked prefs drawer, 1280 | 0 | - | - | - | `body` gets `padding-inline-end:358px` instantly; 5 of 16 block titles clipped (0 without the drawer) |
| legal.html, 375 | 0 | 0 (links 46px tall) | 0 | 0 | no site header; body text 15px/25.5px |

Motion (computed style, `getComputedStyle().transitionDuration` and `animationName`): `#drawer`, `.scrim`, `#pop`, `#friendEd`, `.daysel button`, `.pill`, `.course`, `details > summary::after`: 0s and no animation. Non-zero: `.btn`, `.views a`, `.seg span`, `.blk` background (0.15s), `#toast` opacity (0.2s), map edges and rings (0.35s), map meter width (0.5s). `grep` finds no `@starting-style`, no view transitions, no `scroll-behavior`. Alternative switch and course-mode change: sampled `#week` height 780px constant across 6 samples at 60ms (next alternative) and 14 samples at 100ms (mode change); the `מחשב…` indicator shows for about 700ms and the grid never blanks. Layout-shift entries were not recorded: the pane reported `document.hidden = true`, so an empty list proves nothing.

Typography and spacing at 375 (plan view, characters by computed font size): 12px 1987, 13px 9315, 15px 3296, 16-22px about 30. About 64% of all visible text is 13px and 14% is 12px; the 15px body size covers 23%. Literal `font-size` declarations in the two stylesheets: `12px` x35, `13px` x18, `14px` x10, `17px` x6, `16px` x6, `15px` x4, `9px` x1, `12.5px` x1, against `var(--fs-*)` x32. Off-scale spacing values in padding, margin and gap: `14px` x41, `7px` x20, `18px` x12, `9px` x10, `5px` x10, `11px` x5.

Text contrast (WCAG formula on computed `:root` tokens, `web/style.css:9-19`):

| Pair | Ratio | Verdict |
|---|---|---|
| `--text` on `--surface` / `--bg` | 17.75 / 16.58 | pass |
| `--text-2` on surface / bg / surface-2 | 7.69 / 7.18 / 6.93 | pass |
| `--text-3` on surface / bg | 4.97 / 4.65 | pass (used only for `.meta` and hour labels, both on surface: `style.css:69`, `216`) |
| `--on-primary` on `--primary` | 5.17 | pass |
| `--primary` on `--primary-soft` | 4.56 | pass, thin |
| success, warning, danger, friend on their soft tints | 5.61 / 4.99 / 5.17 / 6.50 | pass |
| Course fg on bg c0..c7 | 5.91 / 5.61 / 6.25 / 5.38 / 4.77 / 4.82 / 4.59 / 9.24 | pass, c4, c5, c6 thin |
| `--text-2` (block meta) on c0..c7 bg | 6.76 to 7.06 | pass |
| Non-text: `--border-strong` on `--surface` (input outlines, blocked-course ring) | **1.52** | fails 3:1 |
| Non-text: map prerequisite edge (`--text-2` at stroke-opacity .45, `map.css:82`) on white | **2.13** | fails 3:1 |
| Non-text: map arrow head (fill-opacity .55, `map.css:84`) on white | 2.61 | fails 3:1 |
| Non-text: `--border` on `--surface` (hour lines, card outlines) | 1.24 | decorative |

## Findings

Severity rule: high = breaks an owner priority (phone widths 320/375, smooth animated UI) across the app, or a hard layout failure at 320. Effort: S under an hour, M a few hours, L a day or more. "known" = already in `docs/ISSUES.md` or `docs/ACCESSIBILITY-AUDIT.md`. Anything not marked "known" was not found in those two documents.

### Motion

**U-01. High. Every overlay, sheet and accordion snaps; there is no enter or exit motion anywhere. All screens, all widths.**
- Saw: `getComputedStyle` gives 0s and `animation-name: none` for `#drawer`, `.scrim`, `#pop`, `#friendEd`, `.daysel button`, `.pill`, `.course` and `details > summary::after`. No `@starting-style`, no view transitions (grep over both stylesheets and `ui-*.js`). The only motion is hover and background at 0.15s, the toast fade (0.2s) and the map's edge and ring easing (0.35s).
- Why: the owner's second priority is smooth, animated UI with no jumps. At 320 a 480px sheet, a scrim, a 460px lesson sheet and a full-screen friend editor each appear in a single frame. `details` sections (sidebar, map legend) change height instantly and the chevron flips with no rotation transition (`style.css:129-130`).
- Spec conflict: `design-system/afeka-scheduler/pages/app.md:99` limits motion to "hover/background/opacity only". That line is why nothing slides. Proposed amendment: "overlays and sheets may use transform and opacity, 180-240ms, ease-out in and ease-in out; reduced motion removes them".
- Fix: in `style.css` add `.drawer, .pop, #friendEd, .dlg { transition: opacity .2s ease, transform .22s ease, overlay .22s allow-discrete, display .22s allow-discrete; }` with an `[open]` state and `@starting-style { opacity:0; transform:translateY(24px) }` for phone sheets (translateX for the desktop drawer). Same for `.scrim` (opacity), `details::details-content` (`block-size`, with `interpolate-size: allow-keywords`) and `summary::after` (`transition: transform .2s`). The existing reduced-motion block (`style.css:427`) already zeroes all of it. `.pmap` needs the same for its dialog (`map.css:17-21`).
- Effort: M.

**U-02. Medium. The docked drawer at 1080-1499px jumps the whole layout. Plan, 1280x800.**
- Saw: opening a drawer sets `body.drawer-open { padding-inline-end: 358px }` (`style.css:277`) with no transition. The grid loses 358px in one frame, the four top-bar actions drop their labels (`style.css:368-374`) and the meta line disappears. With the drawer open 5 of 16 block titles are clipped by the line clamp; with it closed, 0.
- Why: this is the "jump" the owner dislikes, and the person is usually editing a preference while watching the week.
- Fix: `body { transition: padding-inline-end .22s ease }`, and drive the top-bar label hiding from a container query on `.top` instead of the `body.drawer-open` rule so the labels do not flip.
- Effort: S for the padding transition, M for the label rule.

**U-03. Low. Reduced motion removes the loading cue entirely. All screens.**
- Saw: `style.css:427-429` sets `animation:none !important` on everything, so the 3px `.board.is-busy::before` bar and the `.busy::before` spinner (`style.css:180-194`) freeze as a static partial bar and a static ring. A frozen ring reads as "stuck".
- Fix: inside the reduced-motion block hide the `.busy::before` ring (the "מחשב…" text stays) and make `.board.is-busy::before` a plain full-width tint, or none.
- Effort: S.

### First impression and onboarding

**U-04. Medium. The first screen asks a question but never says what the product is. Gate, 375 and 1280.**
- Saw: the gate (`ui-me.js:77`) shows the h1 "המערכת שלי", the question "באיזה מסלול ובאיזו שנה את/ה?", a track `<select>` and a four-option year control. There is no one-line promise ("בונה לך מערכת שעות בלי התנגשויות"), no preview of the result and no hint of what happens next. The `<select>` is pre-filled with "הנדסה מכנית" (option 30), so a computer-science student who taps a year gets the wrong programme without noticing. The year control with nothing selected is all grey and looks disabled. Tapping a year navigates at once, so there is no confirm step.
- At 1280 the card is 440px wide in the top-right corner and about 60% of the screen is empty.
- Why: a student on a phone has about 5 seconds. The disclaimer and legal links are the only other text.
- Fix: (1) add a tagline `<p class="hint">` above the card and a faded sample week behind it; (2) start the select on a placeholder "בחרו מסלול" and enable the year control only after a choice; (3) add a visible "המשך" primary button instead of navigating on the radio change; (4) at 1000px and wider centre the card (`.gate { margin-inline:auto }`).
- Effort: M.

**U-05. Low. Nothing teaches the plan screen's main gestures. Plan, 375.**
- Saw: no first-use hint for "tap a lesson to pin or see other groups", "swipe the pills", or what "חלופה 1 מתוך 10" means. A search of `ui-*.js` finds only the map's hint and the `#me` first step.
- Fix: one dismissible `.banner` (existing component, `style.css:101`) on the first plan view, remembered in `localStorage`: "לחצו על שיעור כדי לנעוץ או להחליף קבוצה. החצים למעלה מציגים עוד חלופות."
- Effort: S.

### Phone layout, plan screen

**U-06. Medium. The summary pills are a 1766px swipe row inside a 321px box, with no affordance. Plan, 375 and 320.**
- Saw: `#pills` has `scrollWidth` 1766 and `clientWidth` 321. The first screen shows about 2.5 pills ("8 קורסים", "20.5 נ״ז", a clipped "בכל השנה…"). Free days, windows, exam status, rank and friend counts are off-screen. The long `.pill-info` line ("קורסי קדם לקורסים אחרים…") alone is about 676px on one line. The scrollbar is hidden (`style.css:391-392`); the clipped last pill is the only hint.
- Why: these pills answer "is this alternative good?", which is what a student compares when tapping the arrows.
- Fix: below 600px let `.pills` wrap to two rows and move `.pill.quiet` and `.pill-info` into a "עוד" `<details>`; or add an inline-end fade (`mask-image: linear-gradient(to left, #000 85%, transparent)`) so the scroll is visible. Take `.pill-info` out of the row so it wraps as a paragraph.
- Effort: S for the fade, M for the grouping.

**U-07. Medium. Persistent chrome takes a third of a small phone's height. Plan, 320x640 and 375x812.**
- Saw (320x640, scrolled): sticky top bar 52 + semester tabs and day selector 104 + bottom bar 63 = 219px, 34% of the screen. Before scrolling, the first block starts at y=385 (60% down). At 375x812 it starts at y=340.
- Why: the week is the product (`app.md` principle 1), yet at 320 only about 420px is left for it, roughly 7 hours of one day.
- Fix: merge the semester tabs into the day-selector row on phones (one 52px sticky row with the semester as a small toggle at its start), or release `#semtabs` from sticky and keep only the day selector (`style.css:384-388`).
- Effort: M.

**U-08. Medium. Landscape phones get the one-day layout and show no grid at first. 740x360.**
- Saw: the day-selector mode is chosen by width only (`@media (max-width:759px)`, `style.css:376`). At 740x360 the five day buttons are 130px wide, the single day column is about 600px wide, and the week top is at y=351 of 360, so none of the grid is visible without scrolling. After scrolling, sticky chrome is 156px of 360 (43%).
- Fix: add `, (max-height:480px) and (orientation:landscape)` to the whole-week rule so five columns of about 115px show, or lower the width breakpoint to 640px. Hide `#semnote` and `.pill-info` in short viewports.
- Effort: S.

**U-09. Medium. On phones the course list is 3200px of two-row cards and nothing links to it. Plan, 375 and 320.**
- Saw: `#side` is 3199px tall (74 cards). Each card has a mode selector (חובה/אולי/לא) and a semester selector (אוטומטי/א׳/ב׳, `ui-side.js:49`, `style.css:505-507`), about 130px per card at 320. The 16 planned courses alone are about 2100px. The bottom bar has no entry to "הקורסים שלי", and the tab strip does not either, so a student who wants to mark a course "לא" has to scroll past the week without being told the list exists.
- Fix: (1) show the semester row only for courses that really have both semesters, or behind a per-card "עוד"; (2) add a fifth bottom-bar item or make the top-bar title jump to `#side`; (3) add a filter input at the top of the list.
- Effort: M.

**U-10. Low. Bottom bar: label overflow at 320, share is the loud button, crowded avatar stack. Plan, 320.**
- Saw: the "רשימה להרשמה" label is 81px wide in a 73px button (`.lbl` `scrollWidth` 81), spilling toward its neighbours (`style.css:409-414`). The only filled action is "שתף", while "רשימה להרשמה" is the step that ends the task (registration in Afeka-net). With friends added, the stack shows two initials circles overlapping the "+" circle.
- Fix: shorten to "הרשמה" below 360px or allow two lines (`white-space:normal; line-height:1.1`); make the registration list the primary button and share a secondary one; hide the "+" circle once friends exist (the label already reads "חברים (2)").
- Effort: S.

**U-11. Low. The brand title and the friend editor title truncate at 320. Plan and friend editor, 320.**
- Saw: `#title` `scrollWidth` 93 vs `clientWidth` 84 ("המערכת …"); the friend editor h2 shows "הזנת מערכת ש…" (123px).
- Fix: shrink `.alt-label` padding below 340px (`style.css:406`); shorten the editor title to "מערכת של חבר".
- Effort: S.

**U-12. Low. The tab strip is not sticky, so switching to "המצב שלי" from deep in the plan means scrolling to the top. Plan, 375.**
- Saw: `.views` is in normal flow (`style.css:460`) and the bottom bar has no navigation item.
- Fix: add a "המצב שלי" item to the phone bottom bar, or make `.views` sticky under `.top`.
- Effort: S.

### Sheets, drawers, popovers

**U-13. Medium. Preference and friend sheets cover the result they change. Plan, 375 and 320.**
- Saw: phone sheets are `max-height:75dvh` (480 of 640px) plus a 45% scrim (`style.css:421-424`). Changing a weight in "העדפות" re-runs the solver but the week is hidden; the only feedback is the alternative label behind the scrim.
- Why: `app.md` principle 3 is "instant feedback". On a phone the feedback is not visible.
- Fix: add a sticky `.dr-foot` live summary in the sheet ("חלופה 1 מתוך 10 · 8 קורסים · 3 שעות חלונות", fed from the same text as `#live`); consider `max-height:60dvh` with no scrim for preferences so the top of the week stays visible.
- Effort: M.

**U-14. Medium. Lecturer buttons in the lesson sheet are 28px tall and their labels do not explain themselves. Lesson sheet, 320.**
- Saw: `button.btn.sm[data-act=lecturer]` is 56x28 and 55x28 (`style.css:627`, `min-height:28px`), beside the lecturer name. The labels are "להעדיף" and "להימנע" with no object.
- Fix: `@media (pointer:coarse) { .btn.sm { min-height:var(--tap) } }`; label them "העדף מרצה" and "הימנע ממרצה" (the `aria-label` is already longer).
- Effort: S.

**U-15. Low. The lesson sheet repeats three red tags per row. Lesson sheet, 320.**
- Saw: in "קבוצות … אחרות בקורס", each row can carry "מלאה", "מתנגשת" and "לא זמינה" in the same red tag style. A whole list of red reads as an error screen.
- Fix: show only the highest-priority reason as `.tag.bad` and the rest as plain `--text-2` text.
- Effort: S.

**U-16. Low. Small text-layout slips inside sheets. Registration and friends sheets, 320.**
- Saw: (a) in the registration list "3 נ״ז" splits so "נ״ז" sits alone on a line, and group ids wrap inside a token; (b) the friend-link input's placeholder is cut at its start edge; (c) the two time inputs in "שעות" start 5px apart (x=144 and x=139) because each sits in its own flex row (`style.css:290-291`).
- Fix: wrap "N נ״ז" in a `white-space:nowrap` span; `overflow-wrap:anywhere` on the id; shorten the placeholder to "הדביקו קישור"; put the two time fields in a two-column grid.
- Effort: S.

### Friend editor

**U-17. High. The friend editor's picker overflows horizontally at 320. Friend editor, 320.**
- Saw: `.fe-pick` `scrollWidth` 358 vs `clientWidth` 320. `#fePickSem` (the semester segment), `form#feSearch` and its labels start at x=-38. The "הצג קבוצות" button is cut at the screen edge and a horizontal scrollbar shows at the bottom. At 375 there is no overflow.
- Why: 320 is an owner priority, and this is a hard reflow failure on the screen that holds the headline import feature. `ACCESSIBILITY-AUDIT.md` lists only the friends drawer for 1.4.10, so this is new.
- Fix: `.fe-pick-body { grid-template-columns:minmax(0,1fr) }` and `.fe-sec { min-width:0 }` (`style.css:556-558`); check `.seg label { min-width:var(--tap) }` (`style.css:346`) times the labels in `#fePickSem`.
- Effort: S.

**U-18. Medium. The file import control is the raw browser widget. Friend editor, 375 and 320.**
- Saw: `input[type=file]` shows the grey system button (`::file-selector-button` background `rgb(240,240,240)`) and "לא נבחר קובץ" in a different look from the rest of the screen. `style.css:569` sets only `min-height`.
- Why: importing a friend's PDF or screenshot is the headline feature of this screen, and it looks like a leftover.
- Fix: style `#friendEd input[type=file]::file-selector-button` like `.btn` (radius `--radius`, border `--border`, height `--tap`), or hide the input and drive it from a `.btn` "בחירת קובץ (PDF או תמונה)" inside a dashed drop-zone card like `.fr-empty` (`style.css:325`).
- Effort: S-M.

**U-19. Low. The friend editor header is tight. Friend editor, 375.**
- Saw: the "שם החבר" label starts at y=50, directly under the header's first row, with the input right below. The block is denser than the 16px rhythm used elsewhere.
- Fix: `.fe-name { padding-top:8px }` in the phone block (`style.css:601`).
- Effort: S.

### Desktop and tablet

**U-20. Low. Four top-bar actions are icon-only from 760px to 1079px, with no tooltip. Plan, 768.**
- Saw: `.actions .lbl` is visually hidden below 1080px (`style.css:361-366`); none of the four buttons has a `title`. The icons (sliders, clipboard-list, plus-in-circle) are not self-explanatory.
- Fix: add `title` with the same text as `.lbl` in `index.html:43-46`; keep the label on the primary button down to 760px.
- Effort: S.

**U-21. Medium. The plan header stack pushes the week below the fold on laptops. Plan, 1280x800.**
- Saw: top bar 48 + nav 36 + scope and semester controls 36 + note 39 + pills 89 (two rows plus the long info line) puts the grid top at y=305 of 800. The 13-hour week shows about 495px of its 747px.
- Fix: put scope, semester and pills in one row at 1100px and wider (`.board-ctl` beside `.pills`), and make the "קורסי קדם…" line a collapsible detail.
- Effort: M.

**U-22. Low. `#me` stays one column at tablet widths. `#me`, 768.**
- Saw: below 900px the profile card stretches to 725px, so the track select and the year control are 725px wide (`style.css:490`).
- Fix: lower the two-column breakpoint to 720px (the profile column is 280px) or cap `.me-card` at 560px.
- Effort: S.

### Colour, type, spacing

**U-23. Medium. Input outlines and the map's edges are below 3:1. All screens with inputs; map.**
- Saw: `--border-strong` is 1.52:1 on white and is the only outline of the grade box, track select, time inputs and text inputs (`style.css:120-122`, `293-296`, `567`); the blocked-course ring uses the same token. In the map, prerequisite edges are `--text-2` at `stroke-opacity .45` = 2.13:1 and arrowheads at `.55` = 2.61:1 (`map.css:82`, `84`). `ACCESSIBILITY-AUDIT.md` marks 1.4.11 as passing, which these numbers contradict.
- Why: edges are the data of a prerequisite graph, and an input whose boundary is 1.5:1 is hard to find outdoors on a phone.
- Fix: add `--border-input:#8A94A6` (about 3.1:1 on white) for inputs; raise `.e` and `.ar` opacity to about .65 (about 3.1:1) and keep `.dim` at .14.
- Effort: S.

**U-24. Low. The 36px fine-pointer target size contradicts the binding spec line. Plan and `#me`, 768 and 1280.**
- Saw: `--tap` is 36px for fine pointers (`style.css:22`); `app.md:96` says "Hit areas are ≥ 44px". 36px passes WCAG 2.5.8 (24px); the conflict is between two project documents.
- Fix: amend `app.md:96` to "44px on coarse pointers, 36px on fine pointers".
- Effort: S.

**U-25. Low. The type and spacing scales are tokens in name only. All screens.**
- Saw: at 375, 64% of visible text is 13px, 14% is 12px and 23% is the 15px body. The tokens `--fs-sm` and `--fs-xs` exist, but literal `12px` appears 35 times and `13px` 18 times against 32 token uses. Spacing uses `14px` (41), `7px` (20), `18px` (12), `9px` (10), `5px` (10), `11px` (5); only the friends drawer states a 4/8 scale (`style.css:305`).
- Why: secondary text is the main text in sidebar cards and blocks. The 14px desktop body is fine for Rubik; the issue is that the real reading size is 12-13px and it is set by hand in 50+ places.
- Fix: map each literal to a token, add `--sp-1..6` (4, 8, 12, 16, 24, 32) and migrate `7px`, `9px`, `11px`, `5px` first. Lift `.hint`, `.tag`, `.cr` and `.blk-meta` from 12px to 13px on phones where the line fits.
- Effort: M.

**U-26. Low. The Latin font subset is not preloaded although every digit uses it. Plan, all widths.**
- Saw: `index.html:27` preloads only `rubik-hebrew-wght-normal.woff2`. `fonts/rubik-latin-wght-normal.woff2` is requested about 14ms later and carries all digits, colons and "MATLAB" (range `U+0000-00FF`). On a slow phone hours and times can swap fonts after first paint.
- Fix: add `<link rel="preload" href="fonts/rubik-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>`.
- Effort: S.

### Map

**U-27. Medium. The map's own chrome takes 31% of a 375x812 phone and 39% of a 320x640 phone. Map, 375 and 320.**
- Saw: header 49 + progress block 80 + filter and tools bar 92 + legend 31 = 252px. The zoom row (fit, minus, plus, list view) sits on its own row with 44px buttons although pinch is available. At 320 the alternative label shortens to "1/10" (`map.css:236`), losing the word "חלופה". The mini-pane chip wraps to two lines (138x41).
- Fix: move the three zoom buttons to the end of the legend row or float them over a map corner so the bar is one row; keep "חלופה 1/10" at 320 by shrinking the title instead of dropping the word; give the mini chip `white-space:nowrap` and a shorter label ("שבוע").
- Effort: M.

**U-28. Low, known. Floating "לא רלוונטי" and "המערכת הנבחרת" chips cover map nodes at the bottom of a phone. Map, 375 and 320.**
- Saw: chips at y=766-804 (375) and y=591-632 (320), over the lowest nodes. This is `ISSUES.md` section 18 and 23. The fit-to-screen transform could not be judged because the pane is hidden (see Not checked).
- Fix: collapse both chips into one bottom segmented control.
- Effort: S.

**U-29. Low. The mini pane's abbreviation letters are 9px. Map mini pane.**
- Saw: `.pmap .pm-mini.ab .blk > .blk-ab { font-size:9px }` (`map.css:250`). Not measured live: it shows only when the abbreviations toggle is on. The accessibility statement exempts the map from the 12px rule; the legend list below the pane (12px) is the readable copy.
- Fix: none needed unless the exemption is dropped.
- Effort: none.

### Empty and error states

**U-30. Medium. A zero-course "plan" is shown as a normal alternative, with no explanation or action. Plan, 375.**
- Saw: with all five weekdays set as hard days off, the app shows "חלופה 1 מתוך 1", "0 קורסים", "0 נ״ז", positive pills ("ימים א׳…ה׳ פנויים", "בלי חלונות") and an info note "אין קורסים בסמסטר א׳ בחלופה הזו" with no button (`ui-view.js:111`). With an impossible hour window instead, the app shows the excellent red "לא נמצאה מערכת" card with a "פתח העדפות" button.
- Why: the two failures should look the same. The first looks like a result, not a problem.
- Logic note (outside design scope): a hard constraint that removes every course probably should produce the "לא נמצאה מערכת" diagnosis. For whoever owns the solver.
- Fix: when `res.courses.length === 0` and constraints are set, render the same `.msg.bad` card with the "פתח העדפות" action.
- Effort: S.

### Consistency

**U-31. Low. `legal.html` has no site header, brand or tab strip. legal.html, 375.**
- Saw: the page opens with an underlined text link "→ חזרה למערכת", an h1 and a nav of underlined links (`legal.html:19-26`). There is no `.top` bar and no card surface; the app and `#me` use the bar, tabs and cards. Links are 46px tall (good); reading text is 15px/25.5px (good).
- Fix: reuse the `.top` bar (title plus a back icon button) and the `.views` tab style for the three sections.
- Effort: S.

**U-32. Low. Scrim and shadow values are copied as literals. Sheets, map, `#me`.**
- Saw: `rgba(16,24,40,.45)` appears in `style.css:421, 422, 512, 524`; the map dialog uses a flat `--bg` backdrop (`map.css:20`); the bottom bar, sheets and the `#me` footer each define their own upward shadow (`style.css:410`, `424`, `489`).
- Fix: tokens `--scrim` and `--shadow-up`; needed anyway once U-01 adds scrim fades.
- Effort: S.

## Strengths

Keep these; do not break them.
- The week is the screen: calendar-first, sticky day headers, soft course tints with a 3px colour edge and text-2 meta that passes 6.7:1 or better on every tint (`style.css:221-231`).
- Block content adapts to its own height with container queries (`style.css:234-237`): name lines and the room appear only when there is space.
- The "לא נמצאה מערכת" state is a model empty state: alert icon, plain diagnosis, one action ("פתח העדפות").
- Failed and passed courses use a tinted card plus a text segment plus a second "כמה פעמים" row; state is never colour alone.
- Phone sheets: scrim, `overscroll-behavior:contain`, safe-area padding, body scroll lock, 44px close buttons, and no horizontal overflow in any sheet at 320.
- Bottom action bar on phones with real labels (12px) rather than icons only; day selector marks free days in words ("פנוי").
- Friends drawer empty state (dashed card, icon, two short lines) and the 4/8 spacing used there.
- Contrast of all text tokens passes AA (lowest used is 4.56), `:focus-visible` rings are consistent (`style.css:32`), and the skip link works.
- Reduced motion is handled globally (`style.css:427`, `map.css:257`).
- Zero text under 12px outside SVG, zero unnamed controls, and zero horizontal page overflow at 320, 375 and 768 on every screen checked (the one overflow is inside the friend editor's picker pane, U-17).
- Map: status by glyph and dashed ring as well as colour, list view as fallback, switch flash and mini week pane are well considered.
- Self-hosted Rubik with Hebrew and Latin subsets; CSP-clean pages.

## Improvement ideas

Each is grounded in something seen above.

1. **Animated sheets and a gliding week (U-01, U-02).** Slide-up phone sheets, a sliding docked drawer, and a short FLIP glide when the alternative changes (blocks move to their new place instead of swapping). Value: high for the owner's "smooth" goal and it makes alternatives feel related. Effort: M-L. Needs the `app.md:99` amendment first.
2. **Real first-run onboarding (U-04, U-05).** Tagline, sample week, wrong-programme guard, one dismissible first-use banner. Value: high, since new students decide in seconds. Effort: M.
3. **Phone course list that is searchable and collapsible (U-09).** A filter box, "עוד" for semester, and a bottom-bar jump. Value: high for phone users with 74 cards. Effort: M.
4. **Install as an app and work offline.** There is no manifest, no service worker, no `theme-color` and no apple-touch-icon (grep of `index.html` and `ui-*.js`). A manifest plus a cache-first service worker for the static files and `data/` would give a home-screen icon and a usable timetable on bad campus Wi-Fi. Value: high for students on phones. Effort: M.
5. **Print and image export of the week.** No `@media print` rule exists. A print stylesheet (grid only, no chrome) and a "שמור כתמונה" button would serve the common "put it on my lock screen" need and WhatsApp sharing. Value: medium-high. Effort: M.
6. **Today-aware plan.** At 375 the day selector opened on א׳ although the day was Thursday. Default to today if it has lessons, else the next lesson day, and draw a "now" line. Value: medium. Effort: S.
7. **Compact and comfortable density toggle.** The sidebar cards and the 13-hour grid are tall (U-07, U-09, U-21). A user-chosen compact mode (smaller `--ppm`, one-row cards) helps small phones and laptops. Value: medium. Effort: M.
8. **Live result strip in sheets (U-13).** Doubles as the answer to "did my change help?". Value: medium-high. Effort: M.
9. **Dark mode as an opt-in setting.** Light-only is by design. Everything is already a token on `:root`, so a `[data-theme=dark]` set is mostly a palette. Course tint pairs need re-checking for 4.5:1. Value: medium for night-time planning before registration opens. Effort: M-L.
10. **View transitions between the plan and `#me`.** `document.startViewTransition` with a plain fallback gives a cross-fade instead of a hard swap. Value: low-medium. Effort: S.
11. **Merge navigation and actions on phones.** A five-item bottom bar (מצב, בנייה, העדפות, חברים, רשימה) with share as an icon in the top bar would remove U-10 and U-12 together. Value: medium. Effort: M.

## Not checked

- Real touch devices: pinch zoom on the map, drag, real tap accuracy, `pointer:coarse` at 768 (an iPad would use 44px targets; the emulation at 768 reports a fine pointer).
- Screen readers, `aria-live` announcements, forced-colors and high-contrast modes, browser zoom 200% or 400%, dark-mode emulation.
- Map fit-to-screen and node placement: the pane reports `document.hidden`, so `requestAnimationFrame` and Panzoom may not have applied the real fit. Cropped year columns seen at 375 and 320 may be that artefact, so they are not reported as findings. Map hover, focus chains and the switch flash were not exercised.
- Layout shift: not measurable (`document.hidden` was true), see Measurements for what was sampled instead.
- Friend-link banner (`#f=` link), the grade-sheet import preview dialog, PDF and image import results, confirm dialogs, the "המצב שלי" delete-all flow, share targets (deliberately not clicked), data-load error state.
- Published-exams UI (exam spread weight), the summer semester view, programmes other than 30 (Mechanical Engineering), years other than year 2.
- Desktop popover placement and the friend editor at 768 and 1280.
- The 9px abbreviation letters in the map mini pane (`map.css:250`): cited from the file, not measured live.
- Test data used: my own seeded state (two friends, one failed course, extreme constraints). The owner's original state was kept in `sessionStorage['audit-orig']` and is restored below.


---
State restore: `localStorage["afeka-sched-v1"]` was restored from `sessionStorage["audit-orig"]` (670 chars) and verified byte-identical, both right after the write and after a fresh app load (2026-10-08).
