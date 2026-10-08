# Page override: the scheduler app (`web/index.html`), version 2

> Overrides [MASTER.md](../MASTER.md). Rules here win.
> v2 (30.09.2026): v1 was rejected (dark, form-heavy, tables and sliders) as unintuitive. v2 is **light only** and **calendar-first**, like Google Calendar / Semester.ly.
> Sources: ui-ux-pro-max ("Calendar & Scheduling App": Flat Design plus micro-interactions, clean blue, a colour per event category, success green), Semester.ly (calendar in the centre, course cards on the side), and the approved inline mockup.

## Principles
1. **The timetable is the screen.** The week grid is the largest element and is always visible. Everything else is a side panel, a popover, or a drawer.
2. **No forms up front.** No `<select>` tables or slider walls. Use chips, segmented toggles, day pills and click-to-cycle.
3. **Instant feedback.** The search re-runs automatically, debounced by 300ms, on every change: status, course mode, pin, friend, or preference. There is no "search" button. While it runs, a subtle progress indicator shows on the grid, and the grid never blanks.
4. **Light, calm, modern.** White surfaces on a very light grey page. Soft course tints, one blue accent, 12–16px radii, and subtle shadows only on floating layers (popover, drawer).

## Theme (light and dark, both from tokens)
> Amended 2026-10-08 (owner): light ("clarity") is the base, dark ("night") follows the device, and a visible "מצב כהה" button in the view strip overrides it
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
**Desktop (≥ 900px):** CSS grid with a top bar and two columns. In RTL, the sidebar sits on the right.
- **Top bar:**
  - Title "המערכת שלי · סמסטר א׳ תשפ״ז", plus the data date as small `--text-3`.
  - **Alternative switcher:** `‹ חלופה 3 מתוך 10 ›`, keyboard ← →.
  - **Friends avatar stack:** initials circles, the whole stack being a "+" button to add a friend.
  - Buttons "העדפות", "רשימה להרשמה" and "שתף".
  - The disclaimer line "כלי עזר בלבד. ההרשמה באפקה-נט היא הקובעת." in `--text-3` under the bar.
- **Summary pills row** above the grid, icon plus text: `20 נ״ז`, `יום ה׳ פנוי`, `2 ש׳ חלונות`, `3 שיעורים עם נועה`, and exams "טרם פורסם" or the minimum gap.
- **Sidebar (300px), "הקורסים שלי":**
  - One card per candidate course: colour dot matching its grid colour, name, credits, and a status tag (`חזרה`, `זמין בתנאי` with its reason as a tooltip/second line).
  - Each card has a 3-way **segmented control**: `חובה | אולי | לא`, which maps to must / optional / no.
  - Courses in the current alternative are highlighted. Courses left out show as muted with "לא נכנס".
  - A collapsible **"חסומים (5)"** section lists blocked courses with a lock icon and a one-line reason (the chain). A collapsible **"לא נלמד בסמסטר"** section follows it.
- **Grid (fills the rest):**
  - Days א–ה, plus ו only if any block falls on Friday. Hours from the earliest to the latest block, clamped to 08:00–21:00 and padded by an hour.
  - 30-minute rows of 24px on desktop, with hour lines and a light zebra.
  - **Blocks:** course tint background, a 3px `border-inline-start` in the course fg, and course name (500) + type + `HH:MM–HH:MM` (in `<bdi dir="ltr">`) + room. When a block is too short, show only the name and time.
  - A friend avatar (initials, orange ring `--friend`) sits in the block corner when shared. A pin icon plus a 2px primary outline marks pinned blocks.
  - Blocks are `<button>`s. Clicking one opens a **popover**: course, group id, lecturer, room, exams, a "נעץ קבוצה / בטל נעיצה" toggle, "ראה בידיעון ↗", and the friends in this group.
  - An empty state tells the user what to do. The "לא נמצאה מערכת" state shows the diagnosis with an alert icon.

**Mobile (< 900px):**
- The top bar wraps onto two rows.
- The grid comes first, full width. Days become a horizontal day selector (א ב ג ד ה) showing one day at a time, or two columns at ≥ 600px.
- The sidebar moves below as an accordion.
- Popovers become bottom sheets (in-flow panels, not fixed overlays that block scrolling).

## Onboarding and status ("המצב שלי")
- First visit, or when the status hasn't been confirmed yet: an in-flow **welcome panel** above the grid with the title "מה המצב שלך?".
- Courses appear as **chips grouped by year** (שנה א׳ … ד׳). Clicking a chip cycles `לא לקחתי → עברתי ✓ → נכשלתי ✗ → לא לקחתי`, with distinct colours plus icons (`--success-soft` + check, `--danger-soft` + x), never colour alone.
- Year א׳ starts as "עברתי".
- The progress bar sits here: "התקדמות: 41/41 נ״ז (יעד 70%)", plus the regulation warnings.
- The button "סיימתי" collapses the panel. The link "עדכן מצב" in the sidebar header reopens it.

## Preferences drawer ("העדפות")
An in-flow side panel or sheet, with human wording:
- **"מה חשוב לך?"** has 5 rows, each a 4-step segmented scale `לא חשוב | קצת | חשוב | מאוד`, mapped to weights 0 / 1 / 3 / 5:
  - "להיות עם החברים"
  - "להתקדם בתואר"
  - "ימים פנויים"
  - "בלי חלונות"
  - "שעות נוחות"
  - Plus "פיזור בחינות", shown only when exams are published.
- **Day pills** for the days you want off, with a toggle "חובה / רק העדפה".
- **Time range:** two time inputs "לא לפני / לא אחרי", with the same חובה/העדפה toggle.
- **More options:** credit cap (number stepper), "לאפשר 2 בחינות באותו יום", "לכלול קבוצות מלאות".

## Friends
- The avatar stack in the top bar opens a **friends panel**:
  - Each friend row has initials, name, "כמה חשוב" as the same 4-step scale, a visibility toggle, and remove.
  - An "הוסף חבר" field for pasting a link, with an inline error text on failure.
  - "הקישור שלי" has a name field plus a copy button, whose confirmation reads "הקישור הועתק".
- Opening a friend link shows an in-flow **banner** above the grid: "נועה שיתפה איתך מערכת (9 שיעורים)" with the buttons "הוסף כחבר" and "לא עכשיו", plus the count of groups not found.

## Registration list and share
Both open an in-flow panel:
- **Registration list:** one row per course, `קוד · שם · קבוצה · תרגול`, with a copy-all button and a link per course to the Yedion.
- **Share:** copies a friend link with an inline confirmation.

## Accessibility and interaction (binding)
- Every interactive element is keyboard reachable, with `:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }`.
- Hit areas are ≥ 44px. Segmented controls use `role="radiogroup"` / `radio` with arrow keys.
- Status tags, chips, friend and pinned states always pair colour with text or an icon.
- The results area has `aria-live="polite"` with a short text summary of the current alternative.
- Transitions are 150–200ms ease on hover/background/opacity. Overlays and sheets may enter with transform and opacity, 150-240ms ease-out
  (amended 2026-10-08, U-01), only under `prefers-reduced-motion: no-preference`; reduced motion removes all of it.
- No emoji. Icons are inline Lucide SVG (`stroke="currentColor"`, `aria-hidden`), reused from `ui-plan.js` `ICON`, adding: `chevron-left`, `chevron-right`, `lock`, `check`, `x`, `plus`, `sliders`, `clipboard-list`, `user-plus`, `external-link`.
- No horizontal page scroll at 375px.

## Pre-delivery checklist
- [ ] Light and dark from the same tokens; 0 contrast fails in both (`shoot.mjs` and `shoot.mjs --dark`)
- [ ] Grid is the dominant element at 1440px and first at 375px
- [ ] No `<select>` tables and no raw sliders for weights (segmented scales instead)
- [ ] Auto re-run on every change (debounced), with no search button and no blank flashes
- [ ] Popover on block click, with pin/unpin working
- [ ] Contrast ≥ 4.5:1 for all text, including course fg on course bg
- [ ] Keyboard: tab through the top bar → sidebar → grid blocks; ← → switch alternatives
- [ ] 375 / 768 / 1440 px checked, with no horizontal page scroll
