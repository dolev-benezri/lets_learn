# Research: timetable and calendar app design (2026-10-08)

A deep-research run (5 search angles, 15 fetched sources, 3 adversarial votes per claim). It hit the session limit before its own synthesis, so this file is a hand synthesis of what survived verification. 14 claims were confirmed and 5 refuted; 6 could not be voted. **Overall the evidence is thin.** No primary source was found on how CheeseFork, Coursicle, Semester.ly or the big calendar apps behave on phones (only blogs and add-on pages), and no study measures the effect of motion on perceived quality. Treat everything below as support for decisions, not proof.

## Confirmed (3-0 unless noted), and what it means here

| Claim | Source | Effect on the plan |
|---|---|---|
| Mobile transitions are about 300ms. Entering elements take about 225ms and leaving ones about 195ms. Over 400ms feels slow. | Material Design 1, duration and easing (m1.material.io/motion/duration-easing.html) | Stage 2 tokens: sheets enter in 220ms and leave in 160-190ms; nothing over 300ms. |
| `prefers-reduced-motion` is the W3C sufficient technique (C39) for SC 2.3.3. Two patterns: switch motion off under `reduce`, or add it only under `no-preference`. | w3.org/WAI/WCAG22/Techniques/css/C39 | Stage 2: put **new** motion inside `@media (prefers-reduced-motion: no-preference)`, safe by default. The existing global kill switch stays. |
| Material's HCT colour space keeps hue and chroma and moves only tone, giving tonal palettes. | material-color-utilities | Stage 4: dark course tints keep each course's hue and change tone (as `night.css` does by hand). OKLCH lightness in CSS is the dependency-free equivalent. The contrast check stays the gate. |
| FullCalendar v7 exposes a per-event contrast colour as a CSS variable, so themes can pick the text colour per event. | v7.fullcalendar.io/eventContrastColor | Confirms the token approach: our `--cbg`/`--cfg` pair per course already works this way. Keep the pairs, add the dark pair. |
| Neutral characters at a direction boundary misplace. Mixed Hebrew + Latin + numbers ("MATLAB 12:00-15:50", course codes) need RLM/LRM or a dir-isolated span. | W3C i18n bidi note | New small task (stage 5a): isolate the time ranges, group ids and Latin course names in `<bdi>` where they sit inside Hebrew text. |
| Android's 2014 phone week view showed 5 days and about 7 hours at once; the reviewer found that too little for planning. | ignorethecode.net (blog) | Supports U-07 (less chrome, more hours visible) and U-08 (whole week in landscape). |
| A small online study (62 responses): light mode slightly faster overall, mixed on phones. The authors call it weak support, with no significance tests. | CEUR-WS Vol-3575 Paper15 | Dark mode is not proven to help tasks. That supports D-A: dark **follows the system setting** and is optional, light stays the default. |
| A university timetable colours by activity type (lecture, tutorial, lab), not by course. | mytimetable.falmouth.ac.uk (primary) | Considered and not adopted. Students recognise courses, so we keep colour per course. The type stays as text in the block ("הרצאה+תרגול"). |

## Refuted (do not rely on)
- "SC 2.3.3 requires an off switch for every sheet transition" (1-2). It is AAA and the wording was overstated. We still honour reduced motion.
- Two claims from the 2009 W3C bidi note about `dir` vs CSS (0-3), and two claims attributed to NN/g via a summary blog about dark-mode expectations (0-3).

## Gaps (not researched successfully)
- How CheeseFork, Coursicle and Semester.ly render on phones, and their colour and density choices.
- Measured performance of `backdrop-filter` on mid and low-end Android. The prototype finding (a filter on a fixed element's ancestor breaks `position:fixed`) is our own observation, not research.
- Hebrew font comparisons (Rubik vs Heebo vs Assistant). We keep the self-hosted Rubik.
