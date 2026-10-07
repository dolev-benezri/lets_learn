# ui-policy running notes (F-02, F-17, F-07, F-08, F-09, F-10, F-13, F-16, F-19)
Started 2026-10-06. Rules: files only under solver-audit/plan-probes/. Nothing implemented.
## Orientation (opened files)
- web/ui-search.js:8-41 scheduleRun/run. only `new Worker` in web/ is ui-search.js:33 (grep). Only caller of scheduleRun(true): ui-actions.js:69 (ACT.more).
- scheduleRun callers: ui-plan.js:60 (renderAll), ui-plan.js:78 ('quiet' change), ui-actions.js:69.
## Housekeeping (IMPORTANT)
- `node --test` at repo root auto-discovers `*.test.mjs` and anything under a `test/` dir, so plan-probes must hold NO `*.test.mjs` / `test/` dir at hand-off. Draft tests are named *-draft.mjs (run explicitly: node --test <file>).
- sandbox/ = `git archive HEAD` copy (+ copy of solver-audit/repro, node_modules junction) used to apply proposed fixes and run the REAL suite/repros. It contains test/ -> MUST be deleted at the end (rmdirSync the node_modules junction first). Diffs are saved as *.patch in this dir.
- baseline in sandbox: node --test = 437/437 pass.
- len.mjs <file> [from-to]: code-point length of lines (line-length test: <= 200 code points, web/*.js css html).
## F-02 findings
- web/ui-search.js:35 onmessage and :36 onerror never compare `my` (captured at :20) with ui.gen. scheduleRun (:8-16) bumps gen but terminates the old worker only in run() (:29) 300 ms later (and in the gated branch :11).
- Fix: add `if (my !== ui.gen) return;` as first statement of both handlers (lines 35,36 are 84/149 code points -> 111/176, fine).
- Proven with f02-regression-draft.mjs: real ui-search.js FAILS (ui.last replaced by stale reply), ui-search.patched.generated.mjs PASSES.
- terminate() in scheduleRun alone would be enough in a real browser (HTML spec empties queued messages on terminate) but NOT for a unit test that calls the handler directly, and does not protect the `onerror`; keep the guard as the fix, terminate-early is optional extra.
## Probe 1 (done): probe1-exam-gap.mjs
- ui-grid.js:151 actual regex is /לפחות (\S+) ימים בין בחינות/ (task text omitted the tail; same result). explain() singular = "לפחות יום אחד בין בחינות" -> no match -> examGap null -> pill "פער בין בחינות: לא ידוע" (ui-view.js:108) for a 1-day gap (BUG reproduced, only visible once examsPublished=true; real data has none).
- Also ui-view.js:108 count(s.examGap,'יום אחד','ימים') compares a STRING to 1 (n===1) so its singular branch is dead.
- Existing test test/ui-grid.test.mjs:31 expects examGap '3' (string): keep string type.
- Minimal fix: ui-grid.js:151 add `?? (res.explanation.includes('לפחות יום אחד') ? '1' : null)`; ui-view.js:108 count(Number(s.examGap),...).
## F-17: CHG.myName returns 'quiet' (ui-actions.js:238) -> 'save'. state.name used only in share.js:37 / ui-actions.js:45 / drawer input value. f17-regression-draft.mjs fails before (actual 'quiet').
## F-07: UI label 'תקרת נ״ז', placeholder 'ללא' (ui-drawer.js:49), min=0; handler n>=0 (ui-actions.js:233), normalize v>=0 (app.js:38). repro reference solver search-lib.mjs:211 uses != null (cap 0 = cap 0).
## Sandbox results (fixes applied to sandbox/, full suite 437/437 still pass with F-02,F-17,F-07,F-09,F-10 applied)
- apply-simple-fixes.mjs applies F-02,F-17,F-07,F-09,F-10 (sandbox only). apply-repro-adjust.mjs: caller-02 line 88 crashes once stale reply ignored (ui.last null) -> needs `?.` guards.
- caller-02 after fix: BUG flips NOT-REPRODUCED: 02-stale-reply-accepted, 02-stale-reply-after-switch-throws, 02-board-stays-broken-until-next-reply, 02-name-edit-researches-and-resets-cur. CHECK 02-program-switched FAILS after fix (it asserts ui.last !== null = the bug) -> must become === null.
- search-maxcredits: SMC-5, SMC-5b, SMC-6 flip; no CHECK FAIL.
- opts-03: opts-3, opts-3b flip (F-10). opts-04: opts-7 flips (F-09); opts-2/2b stay (F-08 not applied yet).
## F-08 design notes
- byLecturer (solver-core.js:49-53) ALREADY falls back per course (`ok.some(prefer) ? pref : ok`): a course never ends empty because of prefer. Failure is cross-course (preferred options clash with another must), so "(a) ignore if filter empties a course" as worded cannot fire; the working form is a search-level retry without prefer, same pattern as maxDays retry (solver-core.js:363-368).
- UI promise: ui-actions.js:78 toast prefer = 'כשאפשר, החיפוש יבחר קבוצות של X' (when possible); avoid toast 'החיפוש לא ישבץ קבוצות של X' (hard). Button 'להעדיף את X' (ui-grid.js:218), drawer list ui-drawer.js:100-102.
- Existing tests unaffected by (a): test/solver.test.mjs:706-724 are buildOptions-level.
- Reference solvers in repro (search-lib.mjs, year-lib.mjs) never set lecturers ({}), so C-1/C-2/C-3 cannot move.
## !! Sibling agents share plan-probes/ and one of them rewrote sandbox/ at 22:38:33 (patch-data.mjs). My files are now prefixed up-*; my private sandbox is up-sb/ (delete at the end: rmdirSync node_modules junction first). Never touch sandbox/, precision-sandbox/ etc.
- F-09 variant chosen: "pins first, then lecturer choices, a pin beats avoid/prefer" (up-apply-f09.mjs) instead of the 1-token pins.includes(o.groups[0]) which would make a pinned tutorial lose against avoid.
## Verified in up-sb (private sandbox) -- all drafts FAIL on real, PASS on patched:
- up-solver-drafts.mjs: F-07, F-08, F-09, F-10 tests (home test/solver.test.mjs; helpers grp/W0/mini there). up-f02-draft.mjs, up-f17-draft.mjs (home: new test/ui-search.test.mjs / ui-actions).
- F-08 fix = retry in search() after dfs: `if (!top.length && !partial && Object.values(lec).includes('prefer')) return search({...same args, constraints:{...constraints, lecturers: without prefer}})` (up-apply-f08.mjs). opts-2, opts-2b flip. Existing tests 63/63 in test/solver.test.mjs.
- F-09 pins-first: opts-7 flips, all opts-04 CHECKs pass.
- F-07: `!= null`; with cap 0 and a must 3-credit course the user sees the generic 'אין מערכת שעומדת... תקרת נ"ז' (diagnosis names the credit cap). 
