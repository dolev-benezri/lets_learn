# Opening screen: one question per screen (design)

Date: 2026-10-17. Owner's choice: option C of three (A centered card, B split, C one question per screen).

## Problem

A first visit shows a small card ("באיזה מסלול ובאיזו שנה את/ה?") pinned to the right edge of a wide page, a footer on a different axis,
a step bar with four steps although none can be used yet, and no word on what the tool is. Goal (owner): "מערכת מסודרת עם שלבים מאוד
מאוד פשוטים שכל אחד יכול להשתמש בה ללא יגע מקדים". Phone widths (375, 320) matter. It ships before the meeting on 2026-10-18.

## Design

The gate (`gated()` in `web/ui-common.js`) stays the rule: planning waits for a track and a study year. Its screen becomes two screens,
both derived from the existing state:

1. **Track screen**, shown while `needsProgram()` (or when the visitor asked to change the track, below).
   - A one-line intro: "בונים מערכת שעות לאפקה: חלופות בלי התנגשויות, עם חברים ודרישות קדם. שתי שאלות ומתחילים."
   - "שאלה 1 מתוך 2" and the heading "מה המסלול שלך?" (`h2#meTitle`, focusable as today).
   - The catalog's programs as large tiles: native radios (`name="p-prog"`, `data-chg="program"`, value = program id), so the existing
     `CHG.program` handler runs unchanged. Catalog order (each evening track next to its day track). 2 columns under 600px, 3 above.
2. **Year screen**, shown once a track is set and the year is not.
   - "שאלה 2 מתוך 2" (just the question when the catalog has one program), heading "באיזו שנה את/ה?".
   - "מסלול: <name>" with a "שינוי" button (`data-act="gateTrack"`) that shows the track screen again. This is the only new state:
     `ui.gateTrack`, transient, cleared by any program change.
   - The years as large tiles, the existing `seg('p-year', …)` radios (`data-chg="pyear"`), and the existing hint
     "שנת הלימודים קובעת את יעד הנ״ז ואת דרישות האנגלית, ורק אחריה נבנית המערכת."
3. After the year the gate lifts and step 1 ("המצב שלי") shows, as today.

Around the screens, while gated:
- The step links are hidden (`body.gated .steps a`). The theme button, which lives in the same bar, stays.
- The content is one centered column (max ~560px) with room above it, on the same axis as the footer.
- Focus goes to the new heading after each answer (the year already does this in `CHG.pyear`; the track does it the same way).

Unchanged: `gated()`, `needsProgram()`, the program and year handlers' logic, the header and its freshness line, the footer text,
the cohort note for a year without data (it shows on step 1's profile card).

## Files

- `web/ui-me.js`: the gated branch of `renderMe` (track tiles, year tiles, step counter, change button).
- `web/ui-actions.js`: `ACT.gateTrack`; `CHG.program` clears `ui.gateTrack` and moves focus to the heading.
- `web/style.css`: tile grid, centered gate column, hidden step links.
- `design-system/afeka-scheduler/pages/app.md`: the gate paragraph in Layout and in step 1.

## Testing

- A unit test: the track screen when no track is set, the year screen once it is, the track screen again with `ui.gateTrack`;
  no step counter with a single program; every program and year rendered through `esc()` (the xss test covers `renderMe` too).
- Full `npm test` before merge.
- Browser pane: 320, 375 and desktop, light and dark, keyboard only (arrows inside each tile group, Tab to "שינוי"), no horizontal scroll.
