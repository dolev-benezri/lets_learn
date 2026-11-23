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

Task B removes the card backgrounds, shadows and radii inside the tool panel, including selected course and passed/failed record rows. The tools expose their specified 21px/600 key element. The record keeps its privacy notice, while delete-all is available only in ☰ with the same confirmation. Preferences no longer duplicate the backup action; להוציא retains it. The advisor PDF and calendar actions are secondary to “העתק הכל”.

Primary-action interpretation: “one primary per tool” means at most one for the three tools that save automatically (המצב שלי, קורסים, מה חשוב לי). Their Next footers stay hidden as approved in phase 1; no invented Save action or emphasized reset action is added. חברים has “הוסף”; להוציא has “העתק הכל”. This difference was raised as an optional clarification while independent work continued.

The sandbox allows writes in this worktree, but its real Git metadata lives outside it (`E:/lets_learn/.git/worktrees/codex-phase4`). Git staging/committing there is denied. Task commits are preserved in a separate worktree-local repository and delivered as a bundle for the manager to apply; the actual branch remains at the starting commit in this session.

Task E folds “הקישור שלי” into native details, matching first-run step 5's label and content. Its `data-key`/`data-k` use the existing disclosure-state and focus restoration, so both open and closed choices survive redraws. Friend rows and the empty list use plain dividers. Copying still uses the shown schedule and the existing clipboard fallback. Browser coverage checks native Enter/Space, focus after redraw, clipboard success and refusal, and “העתק הכל” as the sole primary before and after PDF readiness and an alternative change.

Validation: `node --test "test/*.test.mjs"` before each task commit. No browser suite is launched here. Human browser checks, one suite per command: under `DESIGN=a`, run `shell-a`, `board-a`, `a11y-a`, `declutter-a`, `design-switch`, `out-a` and `flows`; also run `flows` under `DESIGN=classic`. The modified specs are `a11y-a.spec.mjs`, `declutter-a.spec.mjs`, `design-switch.spec.mjs`, `shell-a.spec.mjs` and `out-a.spec.mjs`.
