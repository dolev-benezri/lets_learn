# Page override: the scheduler app (`web/index.html`), version 2

> Overrides [MASTER.md](../MASTER.md). Rules here win.
> v2 (30.09.2026): v1 was rejected (dark, form-heavy, tables and sliders) as unintuitive. v2 is **light only** and **calendar-first**, like Google Calendar / Semester.ly.
> v2.1 (15.10.2026): the app is **four numbered steps**, one page each (המצב שלי, קורסים, מה חשוב לי, מערכות). The 300px sidebar, the preferences drawer and the friends button are gone. Sections below are updated to match; tokens and rules are unchanged.
> Sources: ui-ux-pro-max ("Calendar & Scheduling App": Flat Design plus micro-interactions, clean blue, a colour per event category, success green), Semester.ly (calendar in the centre, course cards on the side), and the approved inline mockup.

## Principles
1. **The timetable is the screen on step 4.** There the week grid is the largest element and is always visible, and everything else is a popover, a dialog or the registration drawer. Steps 1-3 are full pages: one job each, with a sticky "הבא" bar at the bottom.
2. **No forms up front.** No `<select>` tables or slider walls. Use chips, segmented toggles, day pills and click-to-cycle.
   - The one deliberate exception is the **"הצג לפי"** control on step 4, which is a native `<select>` with four options (מומלץ, הכי הרבה נ״ז, הכי הרבה עם חברים, פותחת הכי הרבה קורסי המשך). Four long labels do not fit a segmented toggle on a phone, and the native select is accessible and compact there.
3. **Instant feedback.** The search re-runs automatically, debounced by 300ms, on every change: status, course mode, pin, friend, or preference. There is no "search" button. While it runs, a subtle progress indicator shows on the grid, and the grid never blanks.
4. **Light, calm, modern.** White surfaces on a very light grey page. Soft course tints, one blue accent, 12–16px radii, and subtle shadows only on floating layers (popover, drawer).

## Theme (light and dark, both from tokens)
> Amended 2026-10-08 (owner): light ("clarity") is the base, dark ("night") follows the device, and a visible "מצב כהה" button at the end of the step bar overrides it
> (`web/theme.js`, stored as `afeka-sched-v1-theme`). Components use tokens only; the dark set is `:root[data-theme="dark"]` in `web/style.css`.
> The token table below is the original v2 light set; `web/style.css` is the source of truth.

```css
@import url('https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600&display=swap');
:root {
  --bg:#F6F7FB; --surface:#FFFFFF; --surface-2:#F1F3F9; --border:#E3E7EF; --border-strong:#CBD2DE;
  --text:#101828; --text-2:#475467; --text-3:#667085;
  --primary:#2563EB; --primary-soft:#EAF1FE; --on-primary:#FFFFFF;
  --success:#12805C; --success-soft:#E7F6EF; --warning:#B54708; --warning-soft:#FEF4E6; --danger:#C0262D; --danger-soft:#FDECEC;
  --friend:#F79009;
  --radius:12px; --radius-sm:8px; --shadow-pop:0 8px 24px rgba(16,24,40,.12), 0 2px 6px rgba(16,24,40,.06);
  --font:"Rubik", system-ui, "Segoe UI", Arial, sans-serif;
  /* course hues: soft fill / border+text (text passes 4.5:1 on its fill) */
  --c0-bg:#EAF1FE; --c0-fg:#1D4ED8;  --c1-bg:#E7F6EF; --c1-fg:#0B6E4F;  --c2-bg:#F3EEFE; --c2-fg:#6D28D9;
  --c3-bg:#FDEEF4; --c3-fg:#BE185D;  --c4-bg:#FEF4E6; --c4-fg:#A15C07;  --c5-bg:#E6F6F8; --c5-fg:#0E7490;
  --c6-bg:#FDEEEB; --c6-fg:#C2410C;  --c7-bg:#EEF1F6; --c7-fg:#344054;
}
```
Body text is 15–16px, line-height 1.5. Nothing is under 12px except the grid's hour labels (12px, `--text-3`).

## Layout
**The step bar** (`<nav class="steps">`) sits under the top bar on every page: four numbered links, `1 המצב שלי`, `2 קורסים`, `3 מה חשוב לי`, `4 מערכות`, then the theme button. The current step is a raised pill with a filled number (`aria-current="step"`), and a finished step shows a check mark in the number. Steps can be visited in any order. Under 600px only the current step shows its label, the others are 44px number buttons.

**The top bar** has the title "המערכת שלי · סמסטר א׳ תשפ״ז", plus the data date as small `--text-3`. The alternative switcher and the plan actions show on step 4 only.

**Steps 1-3** are one column of cards (`.step-page`, max 1200px), each with a heading and a one-line hint, and a sticky bottom bar with "כל שינוי נשמר מיד." and the next-step button (`הבא: קורסים`, `הבא: מה חשוב לי`, `הבא: מערכות`). On these pages the sticky bar replaces the phone's bottom action bar.

**Step 1, "המצב שלי":** see below.

**Step 2, "קורסים" (`#side`):**
- A one-line summary of the shown alternative under the heading: `5 קורסים · 20 נ״ז · יום ה׳ פנוי`, plus the courses shared with each friend.
- One card per candidate course: colour dot matching its grid colour, name, credits, and status tags (`חזרה`, `זמין בתנאי` with its reason as a second line, `פותח N קורסים`).
- Each card has a 3-way **segmented control**: `חובה | אולי | לא`, which maps to must / optional / no.
- Courses in the current alternative are highlighted. Courses left out show as muted with "לא נכנס".
- Collapsible sections, each with a count: the course lists, **"חסומים"** (lock icon and a one-line reason, the chain), **"לא נלמד בסמסטר"**, "פטור" and the English levels.

**Step 3, "מה חשוב לי":** see below. Two cards side by side from 720px (preferences, friends), one column below.

**Step 4, "מערכות":**
- **Top bar actions:** "מפה" (opens the progress map in a dialog), "רשימה להרשמה" and "שתף" (primary). The disclaimer (unofficial tool, the Afeka-net registration is binding) stays in the page footer in `--text-3`.
- **Alternative switcher:** `‹ חלופה 3 מתוך 10 ›`, keyboard ← →.
- **"הצג לפי"** above the summary pills (see Principles). When "הכי הרבה עם חברים" is chosen and no friend is shown, a hint links to step 3.
- **Summary pills row** above the grid, icon plus text: `20 נ״ז`, `יום ה׳ פנוי`, `2 ש׳ חלונות`, `3 שיעורים עם נועה`, and exams "טרם פורסם" or the minimum gap.
- **Grid (fills the rest):**
  - Days א–ה, plus ו only if any block falls on Friday. Hours from the earliest to the latest block, clamped to 08:00–21:00 and padded by an hour.
  - 30-minute rows of 24px on desktop, with hour lines and a light zebra.
  - **Blocks:** course tint background, a 3px `border-inline-start` in the course fg, and course name (500) + type + `HH:MM–HH:MM` (in `<bdi dir="ltr">`) + room. When a block is too short, show only the name and time.
  - A friend avatar (initials, orange ring `--friend`) sits in the block corner when shared. A pin icon plus a 2px primary outline marks pinned blocks.
  - Blocks are `<button>`s. Clicking one opens a **popover**: course, group id, lecturer, room, exams, a "נעץ קבוצה / בטל נעיצה" toggle, "ראה בידיעון ↗", and the friends in this group.
  - An empty state tells the user what to do. The "לא נמצאה מערכת" state shows the diagnosis with an alert icon.

**Mobile (< 760px) on step 4:**
- The grid comes first, full width. Days become a horizontal day selector (א ב ג ד ה) showing one day at a time.
- Under 600px the plan actions (מפה, רשימה להרשמה, שתף) move to a 3-button bottom bar, and the top bar keeps the title and the switcher.
- Popovers and the registration drawer become bottom sheets (in-flow panels, not fixed overlays that block scrolling).

## Onboarding and status (step 1, "המצב שלי")
- The first step. It is where a new visitor starts, and it can be reopened at any time from the step bar. The heading "המצב שלי" has a hint: "צעד ראשון: סמנו מה כבר עברתם, ואז לחצו ״הבא: קורסים״."
- A profile card holds the track and year, the amirnet grade, the specialization and the summer option. A progress card holds the progress bar ("התקדמות: 41/41 נ״ז (יעד 70%)"), the "מה נשאר לסיום התואר" checklist and the grade-sheet import.
- Courses appear as **chips grouped by year** (שנה א׳ … ד׳). Clicking a chip cycles `לא לקחתי → עברתי ✓ → נכשלתי ✗ → לא לקחתי`, with distinct colours plus icons (`--success-soft` + check, `--danger-soft` + x), never colour alone.
- Year א׳ starts as "עברתי". The regulation warnings show above the chips.
- There is no "סיימתי" button: changes save at once, and the step bar and the "הבא: קורסים" button lead on.

## Preferences and friends (step 3, "מה חשוב לי")
Two cards on one page, human wording. Every change saves at once and re-runs the search.

**Preferences card:**
- **"מה חשוב לך?"** has one row per weight, each a 4-step segmented scale `לא חשוב | קצת | חשוב | מאוד`, mapped to weights 0 / 1 / 3 / 5:
  - "להיות עם החברים"
  - "להתקדם בתואר"
  - "ימים פנויים"
  - "בלי חלונות"
  - "שעות נוחות"
  - Plus "פיזור בחינות", shown only when exams are published.
- **Day pills** for the days you want off, with a toggle "חובה / רק העדפה".
- **Time range:** two time inputs "לא לפני / לא אחרי", with the same חובה/העדפה toggle.
- **Busy time** blocks, preferred or avoided lecturers, and pins.
- **More options:** credit cap (number stepper), max days on campus, "לאפשר 2 בחינות באותו יום", "לכלול קבוצות מלאות". At the bottom: reset, and "העתק קישור גיבוי מלא".

**Friends card:**
- "הוספת חבר": a field for pasting a link (with an inline error text on failure) and the button "הזנת מערכת של חבר".
- "החברים שלי": each friend row has initials, name, "כמה חשוב" as the same 4-step scale, a "להציג במערכת" toggle, and remove.
- "הקישור שלי" has a name field plus copy and share buttons, whose confirmation reads "הקישור הועתק".
- Opening a friend link shows an in-flow **banner** above the plans: "נועה שיתפה איתך מערכת (9 שיעורים)" with the buttons "הוסף כחבר" and "לא עכשיו", plus the count of groups not found.

## Registration list and share
- **Registration list:** a drawer (a bottom sheet on phones), opened from step 4. One row per course, `קוד · שם · קבוצה · תרגול`, with a copy-all button, "הוסף ללוח שנה" and a link per course to the Yedion.
- **Share:** copies a friend link with a toast confirmation.

## Accessibility and interaction (binding)
- Every interactive element is keyboard reachable, with `:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }`.
- Hit areas are ≥ 44px (the step links too, on phones). Segmented controls use `role="radiogroup"` / `radio` with arrow keys.
- Status tags, chips, friend and pinned states always pair colour with text or an icon.
- The results area has `aria-live="polite"` with a short text summary of the current alternative.
- Transitions are 150–200ms ease on hover/background/opacity. Overlays and sheets may enter with transform and opacity, 150-240ms ease-out
  (amended 2026-10-08, U-01), only under `prefers-reduced-motion: no-preference`; reduced motion removes all of it.
- No emoji. Icons are inline Lucide SVG (`stroke="currentColor"`, `aria-hidden`), reused from `ui-plan.js` `ICON`, adding: `chevron-left`, `chevron-right`, `lock`, `check`, `x`, `plus`, `sliders`, `clipboard-list`, `user-plus`, `external-link`, `map`.
- No horizontal page scroll at 375px.

## Pre-delivery checklist
- [ ] Light and dark from the same tokens; 0 contrast fails in both (`shoot.mjs` and `shoot.mjs --dark`)
- [ ] On step 4 the grid is the dominant element at 1440px and first at 375px; the step bar shows on every page
- [ ] No `<select>` tables and no raw sliders for weights (segmented scales instead); the only select is "הצג לפי"
- [ ] Auto re-run on every change (debounced), with no search button and no blank flashes
- [ ] Popover on block click, with pin/unpin working
- [ ] Contrast ≥ 4.5:1 for all text, including course fg on course bg
- [ ] Keyboard: tab through the top bar → step bar → grid blocks; ← → switch alternatives (step 4)
- [ ] 375 / 768 / 1440 px checked, with no horizontal page scroll
