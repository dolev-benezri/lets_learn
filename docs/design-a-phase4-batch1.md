# Design A phase 4, batch 1

Task A moves these explaining lines into section help, preserving their existing Hebrew:

- המצב שלי: the update instructions; the profile's multiple English scores advice, summer planning explanation and specialization timing; the progress target citation.
- קורסים: the חובה / אולי / לא explanation (formerly “מה ההבדל?”); the explanation of English levels and exemptions.
- מה חשוב לי: the default days/hours and strictness explanations; busy-time explanation; the same-hour exam exclusion explanation; lecturer selection instructions; the reset explanation.
- חברים: how to obtain a friend's link, and the empty-list instructions.
- להוציא: the printing troubleshooting explanation.

Input format instructions, empty/result status, outside-program questions and counts remain beside their controls. Record warnings, missing mandatory courses, verification and cohort notices, dropped חובה warnings and their reasons, and all registration, data freshness, privacy and sharing qualifiers stay visible. The first-run preferences retain their existing explanations.

Help uses a native button, labelled “הסבר: <section>”, with `aria-expanded` and `aria-controls`. Enter/Space use native activation. Capture-phase Escape closes visible help before the shell sees it, returns focus to its button, and leaves the tool sheet open. Help state survives redraws.

CSS uses a worktree-local `tools.src.css` / `append-tools.cjs` equivalent of the UI worktree's private source/append workflow, with CRLF output and lines up to 160 characters. The original private files are outside this worktree's writable root.

Browser tests are authored but are not run in this sandbox, as requested.
