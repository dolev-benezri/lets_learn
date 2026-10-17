# Opening screen wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The gate (no track or no year yet) asks one question per screen with large tiles, centered, with no step links.

**Architecture:** The gated branch of `renderMe` picks the screen from state: track tiles while `needsProgram() || ui.gateTrack`, else year tiles.
Tiles are native radios with the existing `data-chg="program"` / `data-chg="pyear"` hooks, so `CHG` logic is reused. CSS does the layout.

**Tech Stack:** ES modules, no build; `node --test`; `node-html-parser` in tests.

**Spec:** `docs/superpowers/specs/2026-10-17-opening-wizard-design.md`

## Global Constraints

- Copy, verbatim: intro "בונים מערכת שעות לאפקה: חלופות בלי התנגשויות, עם חברים ודרישות קדם. שתי שאלות ומתחילים.";
  counters "שאלה 1 מתוך 2", "שאלה 2 מתוך 2"; headings "מה המסלול שלך?", "באיזו שנה את/ה?"; "מסלול: <name>" + button "שינוי";
  the year hint stays "שנת הלימודים קובעת את יעד הנ״ז ואת דרישות האנגלית, ורק אחריה נבנית המערכת."
- Every catalog name goes through `esc(heb(...))`. Tokens only in CSS, light and dark. No emoji. Hit areas >= 44px. No horizontal scroll at 320.
- `h2#meTitle` stays the focus target (`shownTitle()`).
- No requests to the Afeka site. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Re-picking the already loaded track after "שינוי": a checked radio fires no `change`, so the track screen must render with no tile checked.
- Focus after picking a track: the tile is gone after the async switch; focus must land on `#meTitle`, not `<body>`.
- A catalog with one program: no track screen, no counter, no "שינוי".
- A returning visitor with a year but no `programSet` (older saved state): track screen; after the pick the gate lifts straight away.
- 12 long names ("הנדסת תעשייה וניהול (ערב)") at 320px in 2 columns: wrap, no overflow.

---

### Task 1: Two gate screens

**Files:**
- Modify: `web/ui-me.js` (gated branch of `renderMe`, lines 76-81)
- Modify: `web/ui-actions.js` (`ACT`, `CHG.program`)
- Test: `test/xss.test.mjs` (append)

**Interfaces:**
- Produces: `ui.gateTrack` (boolean, transient); `ACT.gateTrack`; markup classes `.gate`, `.gate-step`, `.gate-intro`, `.tiles`, `.tile`, `.gate-track`.

- [ ] **Step 1: Write the failing test** `the opening screen asks one question at a time` in `test/xss.test.mjs`:
  render with `fake('me').hidden = false`, `document.body.dataset.view = 'me'`, collect the writes of one `run` scope.
  - `programSet = false`: html includes `שאלה 1 מתוך 2`, `מה המסלול שלך?`, `name="p-prog"` once per catalog program, no `p-year`.
  - `programSet = true, profile.year = null`: includes `שאלה 2 מתוך 2`, `באיזו שנה את/ה?`, `p-year`, `data-act="gateTrack"`, no `p-prog`.
  - same plus `ui.gateTrack = true`: includes `p-prog`, and no `p-prog` input is `checked` (parse with `node-html-parser`).
  - catalog cut to one program, year null: no `מתוך 2`, no `gateTrack`.
  - a program renamed to the hostile `P`: no raw `<xss-t>` in the html.
  Restore `programSet`, `profile.year`, `ui.gateTrack` and the catalog at the end.
- [ ] **Step 2:** `node --test test/xss.test.mjs` fails on the new test.
- [ ] **Step 3: Implement** in `renderMe`: `const pickTrack = needsProgram() || ui.gateTrack`; counter only when `app.catalog.programs.length > 1`.
  Track screen: intro, counter, heading, `<fieldset class="tiles"><legend class="sr">מסלול</legend>` + one `<label class="tile">` per program
  (`input type="radio" name="p-prog" value=id data-chg="program" data-k="p-prog-<id>"`, checked only when neither `needsProgram()` nor `ui.gateTrack`).
  Year screen: counter, heading, `<p class="gate-track">מסלול: <b>name</b> <button class="btn ghost" data-act="gateTrack" data-k="gateTrack">שינוי</button></p>`
  (only with more than one program), `seg('p-year', 'שנת לימודים', YEARS.slice(0, yearsOf(data)), null, 'data-chg="pyear"')`, the hint.
  `identityPick` stays for the profile card.
- [ ] **Step 4:** in `ui-actions.js`: `ACT.gateTrack = () => { ui.gateTrack = true; renderMe(); shownTitle()?.focus(); }` (import `renderMe` from `./ui-me.js`
  if not imported). `CHG.program`: `const was = gated(); ui.gateTrack = false;` and chain `.then(() => was && shownTitle()?.focus())` on `changeIdentity`.
- [ ] **Step 5:** `node --test test/xss.test.mjs` passes.
- [ ] **Step 6: Commit** `feat(ui): the opening screen asks one question at a time`.

### Task 2: Layout, tiles, design doc

**Files:**
- Modify: `web/style.css` (replace `.gate { max-width:440px; }`, line 503; add next to the `body.gated` rule, line 502)
- Modify: `design-system/afeka-scheduler/pages/app.md` (Layout: the gate sentence; step 1 section: first bullet)

- [ ] **Step 1: CSS:** `body.gated .steps a { display:none; }`; `body.gated #me` a centered column `max-width:560px`, `padding-top:clamp(16px, 6vh, 64px)`;
  `.tiles` grid `repeat(2, minmax(0,1fr))`, 3 columns from 600px, gap 8px; `.tile` reuses the `.seg` radio pattern (input covers the label, opacity 0;
  span `min-height:56px`, `--surface`, `--border`, radius `--radius`, checked = `--primary-soft` + `--primary` border, `:focus-visible` outline on the span);
  `.gate .seg span { min-height:56px; font-size:18px; }`; `.gate-step` `--text-3` 13px.
- [ ] **Step 2: app.md:** the gate is two screens (track tiles, then year tiles, "שינוי" goes back), step links hidden while gated, theme button stays.
- [ ] **Step 3: Verify** with the `debug` server (8144), localStorage cleared: 320, 375, 1440; light and dark; Tab and arrow keys through each screen;
  `document.documentElement.scrollWidth <= innerWidth`; console clean. Screenshot 375 and 1440 for the owner.
- [ ] **Step 4: Commit** `style(ui): centered opening questions with large tiles`.

### Task 3: Ship

- [ ] **Step 1:** `npm test`: all pass (492 + the new one).
- [ ] **Step 2:** show the owner the screenshots; merge to `main` and `git pull --rebase` + push only after their OK. Update `NOTES.md` (task 2 done).
