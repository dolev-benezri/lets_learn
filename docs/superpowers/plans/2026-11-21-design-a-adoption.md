# Design A ("הלוח") Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Plan only: no code is written until the owner approves this file.**

**Goal:** Move the real site (`web/`) to design concept A "הלוח": the week board is always on screen, every tool opens as a panel over it (bottom sheet on a phone, side column on a computer), a bottom dock on the phone, and "build" / "improve" as two tabs at the top. No feature, saved state or old link may be lost.

**Architecture:** The live UI already renders into fixed containers (`#me`, `#courses`, `#side`, `#prefs`, `#edit`, `#layout`, `#week`, `#drawer`, `#pop`) and shows one page at a time through one seam (`PAGE` in `ui-common.js`, `renderRoute` and `onHash` in `ui-plan.js`, `routeOf` in `app.js`). A keeps those renderers, ids and `data-act` / `data-chg` / `data-ed` hooks. A new `web/ui-shell.js` builds the A frame around them at start-up (re-parenting the existing nodes) and decides which panel is open; a new scoped `web/design-a.css` gives the prototype's look. All of it sits behind a switch (`?design=a`, remembered), so `main` keeps the classic site until the owner flips the default.

**Tech Stack:** Plain ES modules, no build step; `node --test` (unit); Playwright in WebKit / Chromium / Firefox (`test/browser/*.spec.mjs`); `@axe-core/playwright`.

**Spec:** No separate spec. The sources are: the owner's decision of 2026-11-21, verbatim: "טוב אז כרגע תלך את א אבל אל תזרוק את ב שמור אותו כאופציה בזכרון"; and the prototype on the local, **unpushed** branch `claude/design-fresh-cdd72e`, **pinned at commit `d43018d`** (worktree `E:/lets_learn/.claude/worktrees/design-fresh-cdd72e`): `design-lab/README.md`, `design-lab/BRIEF.md`, `design-lab/fresh-a/`, `design-lab/shared/`, `design-lab/shots/a/`, `design-lab/shots/collage-a.png`. Read them with `git show d43018d:<path>`. The feature map below was built from the **live code at `cfd184a`**, not from the prototype's README (which maps a brief written blind to the site).

## Global Constraints

- **Concept B is never touched.** Do not delete, rebase, rewrite or force-move the branch `claude/design-fresh-cdd72e`. Do not open, copy, edit or delete `design-lab/fresh-b/` or `design-lab/shots/b/`. B stays an option; the owner asked for it to be kept "in memory" (the manager keeps that note).
- **Classic stays the default and unchanged until Task 11.** Every existing unit and browser test passes through Task 10 with no assertion weakened; the only edits are Task 0's behaviour-neutral helper changes and the assertions its inventory marks "classic only" (they still run under classic).
- **Port the look, not the code.** Copy tokens and component shapes from `a.css` / `panels.css` into `web/design-a.css`, written against the live class names. Do **not** copy `a.js`, `shared/core.js`, `shared/data.js`, `shared/panels.js` (the sample engine and its state model), nor `?demo` seeds. No fake data reaches `web/`.
- `web/` lines: at most 160 characters, 200 for string literals and HTML, **CSS and comments included** (`test/line-length.test.mjs`). The prototype CSS has 47 lines over 160: reformat while porting.
- No new dependency and no download. Fonts: keep the self-hosted Rubik unless the owner answers question 4 differently (a new font goes through the manager first). Nothing loaded from other sites; the CSP in `index.html` does not change.
- Hebrew UI text is kept as the live site has it, except the strings a task names. RTL everywhere.
- localStorage access is always in `try`/`catch`. The only new key is `afeka-sched-v1-design`. No A-only state goes into the `afeka-sched-v1` blob (`watchOtherTabs` and `recordOf` compare it across tabs). `TERMS_VERSION` is **not** bumped (everyone would be asked again).
- WCAG 2.1 AA (the prototype CSS is **not** assumed clean: `a.css` `.bdg.warn` is white on `--warn`, about 1.9:1 in dark), tap targets at least `--tap` (44px), visible focus, `prefers-reduced-motion` turns movement off, widths 320 / 375 / desktop, light and dark.
- Private data: none. Tests use synthetic data and `test/fixtures/real` only. The repository is public.
- Codex reviews every commit before it is made; a full-branch review (high effort, raw `-o` answer saved under `.superpowers/sessions/reviews/`) before any branch is submitted. Codex never opens `web/vendor/**`. Unit tests run on Node 24 (`npx -y -p node@24 node --test "test/*.test.mjs"`) before any push. Nothing reaches `main` or the remote without the owner's OK; the manager merges.
- Commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

Failure modes the owner's request implies but no feature list names (each gets a named test in the task that owns it):

1. **Old `#prefs` link.** Wishes and friends were one page; A splits them. A student who bookmarked `#prefs` to add friends must land on wishes with a visible link to `#friends`. Test in Task 2.
2. **A friend or backup link on a first visit.** `#f=` / `#b=` are stripped from the URL at load (`app.js applyHash`) and live in `app.friendLanding` / `app.pendingBackup`; the shell must read those, never the hash, and must not ask "what do you want to do?" first. Test in Task 6.
3. **Tools tapped before the gate is passed** (no program or year yet). `renderMe` returns early when `#me` is `hidden`, so a dock tap that opens an unrendered panel shows an empty sheet. In build mode the gate locks the dock to "המצב שלי"; a failed data load locks it too. Test in Task 2.
4. **Blocked storage (private mode).** `?design=a` still works for the visit, also after a friend link is read (the query is kept), nothing throws, and nothing is remembered. Test in Task 1.
5. **Printing the advisor summary under the new frame.** `#print` / `html.print-summary` must still print the whole summary on several pages; the prototype's fixed-height shell is not ported. Test in Task 5.
6. **Improve mode is a mode, not a panel.** Opening a shared tool from it must keep the edit route; leaving the edit route writes mode `build` and redraws the builder (`ui-plan.js:97`). An edit visitor is gated on the terms only, never on the builder's track and year. Tests in Tasks 2 and 8.

---

<div dir="rtl" lang="he">

# סיכום לבעלים (בעברית, בלי שמות קבצים)

## מה מתכננים

להעביר את האתר האמיתי לעיצוב א׳ "הלוח": המערכת השבועית תמיד על המסך, וכל כלי (המצב שלי, קורסים, מה חשוב לי, חברים, להוציא) נפתח כחלונית מעליה. בטלפון זה גיליון שעולה מלמטה וסרגל כלים תחתון. במחשב זו עמודה בצד, ועמודה נוספת עם החלופות. למעלה שתי לשוניות: "מערכת חדשה" ו"שיפור מערכת קיימת". עיצוב ב׳ לא נוגעים בו ולא מוחקים אותו.

## מה לא משתנה

- כל הנתונים, החיפוש, הכללים והחישובים. שום דבר שם לא נכתב מחדש.
- כל מה שכבר שמור אצל סטודנטים: ההתקדמות, הציונים, החברים, ההעדפות, ערכת הצבעים (כהה או בהירה), הסיור. הוא ימשיך לעבוד בדיוק כמו היום.
- כל הקישורים הקיימים: קישור חבר, קישור גיבוי, וכתובות כמו `#me`, `#courses`, `#prefs` ו־`#edit`.
- כל היכולות: הכול ממופה בסעיף 2 של התוכנית. מה שאין לו מקום ב־א׳ רשום ברשימה נפרדת (סעיף 2.5), ולא נעלם בשקט.

## איך מגיעים לשם בלי לשבור את האתר

- הכול נבנה מאחורי מתג. האתר כמו שהוא היום נשאר ברירת המחדל. מי שפותח את הכתובת עם `?design=a` רואה את העיצוב החדש (והדפדפן זוכר). כך אפשר לבדוק בטלפון, משימה אחרי משימה, לפני שמישהו אחר רואה משהו.
- 13 משימות קטנות, כל אחת נבדקת לבד. אפשר לעצור אחרי כל אחת. לפני שמתחילים, משימה 0 ממפה אילו בדיקות קיימות קשורות לעיצוב הישן, כי זה קובע כמה עבודה באמת צריך.
- משימה 2 (המסגרת: לשוניות, סרגל תחתון, חלונית, ניווט וקישורים) היא התפר שכל השאר נשען עליו, והיא גדולה מכפי שנראה בהתחלה. אחריה יש נקודת עצירה: רואים אותה בטלפון ומחליטים אם ממשיכים.
- שיפור מערכת קיימת (עמוד העריכה) נעשה אחרון ובשני שלבים, כי הוא החלק המסובך ביותר: קודם הוא נכנס למסגרת החדשה כמו שהוא, ורק אחר כך מתפצל ללוח וחלונית.
- ההחלפה בפועל (שה־א׳ יהיה ברירת המחדל) היא משימה נפרדת, אחרונה, וטעונה אישור שלך. אחריה העיצוב הישן נשאר זמן קצר, ואז נמחק.

## מה משתנה לסטודנט (ולכן שווה לדעת)

1. אין יותר שלבים ממוספרים וכפתורי "הבא". הכול פתוח בבת אחת. (ב־15.10 בחרת שלבים ממוספרים. ראו שאלה 1.)
2. כניסה ראשונה: לא שואלים "מה רוצים לעשות?" במסך נפרד. הלשוניות למעלה הן הבחירה.
3. בטלפון הלוח מראה את כל החמישה ימים יחד ולא יום אחד, אלא אם תחליט אחרת (שאלה 2).
4. קישורי התנאים, הפרטיות והנגישות עוברים מתחתית הדף לתפריט ☰ ולחלונית "מידע". השורה "לא רשמי, ההרשמה באפקה-נט" נשארת תמיד על המסך.
5. קישור חבר מציג את אותה הודעה כמו היום, מעל הלוח. לא מוסיפים חבר בלי אישור.
6. בלשונית "שיפור מערכת קיימת" יש בדיוק מה שיש היום: טעינה, מה זז, הצעות. הדוגמה הראתה שם גם "מה חשוב לי" ו"להוציא", אבל באתר היום אין להם שם מקום (ייצוא קיים רק למערכת הרגילה), ולכן לא בונים אותם בלי החלטה שלך (שאלה 11).

## סיכונים, בפשטות

- **עריכת מערכת קיימת** היא החלק הכי רגיש. הכי הרבה בדיקות תלויות בה. לכן היא אחרונה ובשני שלבים.
- **מסך צפוף בטלפון.** חמישה ימים ב־375 פיקסלים יחתכו שמות קורסים (גם הדוגמה כך). בגלל זה שאלה 2.
- **דוגמה לא מושלמת.** העיצוב של הדוגמה לא עבר בדיקת ניגודיות מלאה: כבר מצאתי תג אחד שלא עובר בכהה. כל משימת עיצוב נחסמת בבדיקת נגישות לפני שהיא נחשבת גמורה.
- **הדוגמה קיימת רק בענף מקומי אחד** שלא נדחף לשום מקום. אם הענף הזה אובד, אובדים גם א׳ וגם ב׳. כדאי להחליט (בלי למזג) אם לגבות אותו.
- **שני עיצובים במקביל** לתקופה. כל תיקון באתר צריך לעבוד בשניים עד שהישן נמחק.
- **איפון.** גיליון תחתון עם מקלדת ב־Safari מתנהג אחרת מאשר ב־Chrome. צריך בדיקה אצלך בטלפון (רשימה בסוף משימה 10).

## שאלות לבעלים (עם המלצה)

1. **סדר פעולות.** בעיצוב הישן בחרת שלבים ממוספרים. א׳ פותח הכול בבת אחת, והדוגמה עצמה מודה שאין בו סדר מומלץ לסטודנט חדש. *המלצה:* כרטיס "מה עושים קודם" על הלוח הריק (מסמנים מה עברתי, בוחרים קורסים, מגדירים מה חשוב), שנעלם אחרי המערכת הראשונה.
2. **טלפון: יום אחד או כל השבוע.** היום: יום אחד עם כפתורי ימים. בדוגמה: כל החמישה יחד, צפוף. *המלצה:* להתחיל ביום אחד, עם מתג "כל השבוע", ולהחליט על ברירת המחדל אחרי שתנסה בטלפון.
3. **השם.** "המערכת שלי" (בכותרת, בתצוגה המקדימה ב־WhatsApp ובתמונה) או "הלוח" כמו בדוגמה. *המלצה:* להשאיר "המערכת שלי", ו"הלוח" יהיה רק שם החלק עם השבוע.
4. **גופן.** Rubik שבאתר היום (שמור באתר עצמו), או גופן המערכת של הדוגמה. *המלצה:* Rubik. כבר מאושר, ולא דורש כלום.
5. **שיפור מערכת בטלפון בשני שלבים.** קודם העמוד הקיים בתוך המסגרת החדשה, אחר כך לוח וחלונית כמו בדוגמה. *המלצה:* כן, בשני שלבים.
6. **סרגל תחתון.** חמישה כפתורים: המצב שלי, קורסים, מה חשוב לי, חברים, להוציא. "שיתוף" נשאר כפתור קבוע מעל הלוח, ו"מפה" בתוך "המצב שלי" ובתפריט. מתאים?
7. **משתמשים חוזרים.** הסבר קצר חד־פעמי של שלוש עצירות ("מה חדש") ביום המעבר? *המלצה:* כן.
8. **תנאים ופרטיות בתפריט.** במקום בתחתית הדף: שתי נגיעות במקום גלילה. מאשר?
9. **כמה זמן להשאיר את הישן אחרי המעבר** (עם `?design=classic` כדרך חזרה) לפני שמוחקים אותו. *המלצה:* שבועיים.
10. **תאריך.** יש תקופה שאסור להחליף בה את האתר (תחילת הרשמה)? *המלצה:* להחליף רק מחוץ לה.
11. **שיפור מערכת: כלים נוספים.** להוסיף ללשונית השיפור גם "מה חשוב לי" ו"להוציא" כמו בדוגמה? זה יכולת חדשה (ייצוא של המערכת המשופרת), לא העברה של משהו קיים. *המלצה:* לא עכשיו. קודם המעבר, אחר כך יכולות חדשות.

</div>

---

## 1. Facts about the live site this plan is built on (cfd184a)

- **One page at a time.** `PAGE = { me, courses, prefs, plan: ['layout', …], edit }` (`ui-common.js:222`); `renderRoute()` (`ui-plan.js:28`) sets `hidden` on every page container except the current one and `document.body.dataset.view`; `onHash()` (`ui-plan.js:71`) re-renders on `hashchange`, blurs the active element, scrolls to the top and focuses `shownTitle()` (the first non-hidden `PAGE` container's heading, `ui-common.js:229`). `routeOf` / `hashOf` / `STEPS` / `isEditHash` live in `app.js:579-585`: **any** `#edit` or `#edit/…` is the edit route; only exactly `#edit/changes` is edit step 2, and step 2 falls back to `#edit` when there is no baseline **or** the data file no longer matches (`ui-edit.js:343`).
- **Leaving the edit route resets the mode.** From the edit route to a hash that is neither an edit hash nor a friend or backup link, `onHash` writes mode `build` and redraws the builder (`ui-plan.js:97-101`; link hashes take the earlier branch at `:92`). Replacing the URL with an empty hash while improve mode is open would trip this. A therefore never uses the URL for improve-mode overlays (section 2.2).
- **Renderers differ in how they treat a hidden container.** Only `renderMe` empties `#me` when it is `hidden` (`ui-me.js:233`); `renderPrefs`, `renderView` and `renderEdit` draw into hidden containers. `renderEdit()` (`ui-edit.js:335`) writes `#edit.innerHTML` itself from `stepOneHtml` or `stepTwo` (a string in which the week sits). Its helpers `inEdit()`, `placeOf()`, `syncSavedHint`, the goal-row scroll restore and the async-result focus all assume controls and results are under `#edit` (`ui-edit.js:295, 351, 508-542`). About 101 test cases are registered in the 8 `edit*.spec.mjs` files (Codex's count after the loops; 77 `test()` blocks).
- **Header and bars.** `<header class="top">` holds `#title`, `#meta`, `#switcher` (`#prev`, `#altLabel`, `#next`), the ☰ button and `.actions` (map, registration list, advisor summary, share). `nav.steps` holds four anchors (`data-view`), `#tourBtn` and `.theme-btn`. `#notice` (remote notice, failed save, other tab) sits above everything; `#banner` (hash error, turn warning, stale pins, friend landing) sits in the plans page.
- **Plans page.** `renderView()` (`ui-view.js:223`) fills `#semtabs` (scope and semester), `#semnote`, `#showby` (sort), `#pills`, `#disclaimer`, `#daysel`, `#boardNote`, `#week`, `#live`, the alternative-1 comparison and the unlock summary (`ui-view.js:368, 390`). `renderWeek` / `renderDaySelector` (`ui-grid.js:310` / `:345`) draw one day at a time on a narrow screen (`ui.mobileDay`). `scrollToDay()` and the popover's stale-position check use **window** scroll (`ui-view.js:458`, `ui-plan.js:243`).
- **The wishes page already holds a lot** (`prefsPanel`, `ui-drawer.js:64-121`): "תכנון" (scope and load split), "מה חשוב לך?", days off, hours, busy time, "עוד אפשרויות" (credit cap, max days, exams rule, full groups, split option), "נעיצות" (pins and clear all), reset, and the **full backup link** in its footer. The courses page (`renderSide`, `ui-side.js`) holds the course cards and the locked, not-offered, exempt and English-level sections.
- **Drawer.** `<dialog id="drawer">` with `PANELS = { reg, advisor, menu }`; modal bottom sheet up to 1079px (`SHEET`), docked non-modal from 1080px, chosen when it opens and kept across a resize. `openPanel('menu')` and every drawer close call `dropAdvisorPdf()` (`ui-drawer.js:314`, `ui-plan.js:226`). The ☰ menu is a modal side sheet at every width and today holds only the two mode links.
- **Three different "phone" behaviours:** popover bottom sheet up to 599px (`PHONE`), the one-day calendar up to 759px (`style.css:1257`), drawer modality at 1079px; plus a landscape-phone full-week mode (`style.css:2108`).
- **Edit page visitors** are gated on the terms only; identity (track and year) is asked inside the edit loader (`ui-plan.js:30`, `ui-edit.js:355`).
- **Link handling.** `applyHash` strips `#f=` / `#b=` with `history.replaceState(null, '', location.pathname + keep)`, which **drops the query** (`app.js:799, 820`). `ACT.removeFriend` focuses `#prefsTitle` (`ui-actions.js:321`). The load-failure renderer writes retry messages only into `week`, `me`, `side`, `prefs`, `edit` (`app.js:708`).
- **Tour.** `renderView` offers the "plans" part (`ui.onResult`) before `renderAll` runs the intro check; `startTour` refuses while any dialog is open; `ACT.tour` returns focus to `#tourBtn` (`ui-view.js:450`, `ui-plan.js:130-138`, `tour.js:52`, `ui-actions.js:132`). Stops are CSS selectors on `nav.steps`, `.steps a[data-view]`, `.actions`, `#tourBtn`, `#switcher`, `#week .blk`, `#advisorBtn`, `[data-act="panel"][data-panel="reg"]`.
- **CSS keyed to the current page.** 18 rules in `style.css` depend on `body[data-view]`, `body.gated`, `body.drawer-open`, `body.touring` or `body.pop-open` (`style.css:1510` hides `.switcher` and `.actions` off the plans view, `:1514` hides the step links while gated or on the edit page, `:1239-1250` reshape the header when the drawer is docked). A's board and switcher are visible on every build view, so each needs an A override (a unit scope test cannot see specificity; Task 2 asserts the result in the browser).
- **Popover, dialogs, map.** `#pop` (`openPop`, `ui-grid.js:409`); `askConfirm` / `askRows` / `showText` (`ui-dialog.js`); `#friendEd` (`ui-friend-editor.js`); `#pmap` (`ui-map.js`, mine); `legal.html` loads `theme.js` and `style.css` only.
- **Tests.** 13 browser specs (about 4,100 lines). `run.mjs` discovers every `*.spec.mjs`; CI runs it once per engine with only `BROWSER` set (`browser.yml`). Some assertions are bound to the old presentation, not only to ids: registration and advisor content inside `#drawer`, friends reachable at `#prefs`, footer focus targets, the exact ☰ contents, DOM order of proposals and week (`flows.spec.mjs:160, 169, 180`, `edit-shell.spec.mjs:75`, `edit-focus.spec.mjs:130`, `edit.spec.mjs:269`). Task 0 inventories them.

## 2. Feature map: where everything lives in A

A = the A frame of Task 2. "Reuse" names the live code that keeps doing the work. A route in A is a pair **(mode, tool)**: mode is *build* or *improve*, tool is the open panel or none.

### 2.1 Features

| # | Feature (live today) | Where in A | Reuse / change |
|---|---|---|---|
| 1 | Terms gate (`acceptTerms`, `termsOk`, `gateHtml`) | Terms card over an empty ghost board; locks the dock | `ui-common.js`, `ui-me.js` unchanged; skin only (Task 6) |
| 2 | Mode choice (`needsModeChoice`, `renderModeChoice`, `pickMode`, `MODE_KEY`) | The two top tabs are the choice; a remembered `edit` still opens `#edit` | Tab tap calls `setMode`; `renderModeChoice` not drawn under A |
| 3 | Track and year gate, one question per screen (`gated`, `gateTrack`, `pickTrack`, `pickYear`) | Build mode: inside the "המצב שלי" panel, dock locked to it until passed. Improve mode: terms only; identity is asked in the edit loader as today | `gateHtml` reused; tiles one column in the panel |
| 4 | Entry screen: grade sheet or manual (`entryScreen`, `gradeImport`, `manualEntry`) | "המצב שלי" panel, first visit only | unchanged |
| 5 | Profile, program/year change with retry (`identityPick`, `switchTo`) | "המצב שלי" panel (profile card) | unchanged |
| 6 | Amirnet, turn, specializations, summer, outside-program courses | "המצב שלי" panel | unchanged |
| 7 | Progress bar, 70% target, checklist, average | "המצב שלי" panel | unchanged |
| 8 | Passed / failed / grade / fail count per course, "all of year X" | "המצב שלי" panel, "קורסים לפי שנה" | unchanged |
| 9 | Grade sheet PDF import and review (`importGrades`, `askRows`) | "המצב שלי" panel; review stays a dialog | unchanged |
| 10 | Record warnings, unverified data line, approval line, legal `#scope` link at the gate | "המצב שלי" panel + status strip | unchanged |
| 11 | Erase all data (`eraseAll`) | "המצב שלי" panel ("הנתונים שלי") and ☰ | one act, two buttons |
| 12 | Progress map: status filters, map/list switch, zoom / fit / pan, legend, excluded electives, prerequisite and unlock cards with catalog links, its own alternative switcher, mini schedule, abbreviations, specialization prompt (`openMap`, `#pmap`) | Button in "המצב שלי", ☰ and the board toolbar; stays a dialog | `ui-map.js`, `map-*.js`, `map.css` not edited; only the chrome is restyled (Task 9); `map-targets.spec` and the map checks in `a11y.spec` re-run under A |
| 13 | Scope (year or semester), load split | "מה חשוב לי" panel ("תכנון", **where they are today**) **and** the board's scope control (`bscope`) | unchanged |
| 14 | Course cards: חובה / אולי / לא, semester, eligibility reasons, blocked / not offered / exempt / English-level sections | "קורסים" panel | `renderSide` unchanged |
| 15 | Weights (4 levels × 6 wishes), reset; the "defaults changed" note with `prefsOk` / `prefsUndo` lives in the board's `#semnote` | "מה חשוב לי" panel (weights, reset); the note stays a board note | `prefsPanel`, `resetPrefs`; `renderView` unchanged |
| 16 | Days off, hours, hard or soft, max days, lecturers, busy blocks (12), exams rule, full groups, split option, credit cap | "מה חשוב לי" panel ("עוד אפשרויות" etc., as today) | unchanged; the "one more credit?" probe stays on the board (`capProbe`, `capApply`) |
| 17 | Friends: link form, editor (text, xlsx, pdf with page picker up to 12, photo OCR, manual), tabs with Arrow / Home / End, Delete / Backspace, dirty-close confirm, list, importance, show/hide, edit, remove, 20 max | "חברים" panel (new `#friends` container); the editor stays the `#friendEd` dialog | `renderPrefs` writes wishes and friends to two containers; editor not edited (Task 9 re-runs its tests) |
| 18 | My link, name, share (`share`, `shareOut`, `myName`) | "חברים" panel; plus a share button on the board toolbar (build mode only: it shares the builder plan) | unchanged acts |
| 19 | Friend link landing (`#f=`, `landingAdd`, `landingDrop`) | Banner above the board + badge on the "חברים" dock button; never auto-added | `renderBanner` unchanged |
| 20 | Alternatives switcher, label, arrow keys, "not all checked", longer search (`more`) | Board bar (phone) / alternatives column (desktop); arrows and swipe | `#switcher` re-parented, ids kept |
| 21 | Summary pills, sort ("הצג לפי"), semester tabs, notes, board note, disclaimer, comparison with alternative 1, unlock summary | Board bar and notes under it | `renderView` unchanged |
| 22 | Week (days, real hours, busy blocks, pins, friends, full, split tag), day chips (narrow), landscape-phone full week | The board | `renderWeek`, `renderDaySelector` restyled; one-day vs five-day: question 2 |
| 23 | Lesson popover: lecturer, rooms, seats and freshness, exams, friends, other groups, catalog link, pin, prefer/avoid, report mistake | Same `#pop` (bottom sheet on a phone) | `openPop` unchanged; lesson-as-panel is a later option |
| 24 | Pins list, clear all (`clearPins`) and vanished-pin banner (`dropPin`) | "מה חשוב לי" panel ("נעיצות", as today) + banner and board | unchanged |
| 25 | Left-out courses, no-result reason, computing, error | Board | `renderView` unchanged |
| 26 | Exams block and warnings | "להוציא" panel | `examsNoteHtml` and the reg panel |
| 27 | Registration list, backup groups, copy, calendar `.ics` (`regPanel`, `copyReg`, `ics`) | "להוציא" panel (build mode) | composed from `regPanel()` (Task 5) |
| 28 | Full backup link (`backup`; today in the wishes page footer) | Stays in the wishes panel footer; the same act is also offered in "להוציא" | unchanged act |
| 29 | Advisor summary: view, copy, print, PDF (`advisorPanel`, `advisorPdf`, `advisorCopy`, `#print`) | "להוציא" panel (build mode) | `advisorPanel()` + PDF lifecycle (Task 5) |
| 30 | Edit page step 1: load (xlsx, pdf, photo, by hand), review rows, registered or not, restore | Improve mode, tool `edit` (stage 1) / `mine` (stage 2) | Task 7 / 8 |
| 31 | Edit page step 2: stays / can move, swaps, add, remove, undo chips, goals, split option, search, proposals, save, copy changes, restore original | Improve mode, tool `edit` / `changes` + the board | Task 7 / 8 |
| 32 | Freshness line, "unofficial" notice, approval, source conflicts | Status strip (one line) + "מידע" panel | `renderTop`, `renderBoardNote` |
| 33 | Remote notice, failed save + backup link, other tab + reload (`noticeHtml`) | Strip under the top bar, every mode | `renderNotice` unchanged |
| 34 | Footer: terms, privacy, accessibility, removal request, report a mistake, counselling link | ☰ → "מידע" panel; the disclaimer line stays on screen | `legal.html` unchanged |
| 35 | Loading skeleton, load failed + retry, unavailable program, substitute cohort, "ב fell back" note | Board; on a failed load the dock is locked and every tool shows the board's retry | `app.js:708` path extended to the new containers (Task 2) |
| 36 | Light / dark / follow device (`theme.js`, `.theme-btn`) | Top bar button and ☰ | `theme.js` unchanged |
| 37 | Tour (`tour.js`, parts `intro`, `plans`, `#tourBtn`) | ☰ item + offered once; new stops | Task 6 |
| 38 | ☰ menu | Modal side sheet: info, map, tour, theme, erase (mode links removed: the tabs are the switch) | `menuPanel` content under A |
| 39 | Backup restore, broken or old link messages (`runBackup`, `applyPendingBackup`, `askConfirm`) | Same dialogs; lands on the board | `app.js` changes only in the two `replaceState` calls, which keep the query (Task 1) |
| 40 | Toast announcements (`toast`) | Same element, above the dock | `index.html`, `ui-common.js` |
| 41 | English-level and exemption disclosure | "קורסים" panel (inside `renderSide`) | unchanged |

### 2.2 Routes

A keeps the hash as the tool state **in build mode**: opening a tool sets the hash (a normal history entry, like the step links today) and Back closes it. A phone sheet closes with ✕, scrim or Escape by replacing the hash with `location.pathname + location.search` (the query is kept) and dispatching `hashchange` (precedent: `app.js:718`); a wide screen has no ✕ and no Escape-close, because the side panel is a column, not a sheet, and the default `courses` panel is what an empty hash means there.

**In improve mode the URL is the edit step and nothing else** (`#edit` or `#edit/changes`). Overlays opened over it (the shared record, ☰, "מידע") are in-memory shell state with no hash: no `hashchange` fires, so `onHash`'s "leave edit" branch, `renderEdit()` and the running proposal search are never touched. `routeA(hash)` returns `{ mode, tool }`; `isEditHash` alone decides the mode. Info (from ☰) is an in-memory overlay in both modes.

| Hash | Today | In A: mode / tool | Test |
|---|---|---|---|
| `''` / `#` | Plans (step 4) | build / none on a phone; build / `courses` (or `me` with no program) from 1080px | unit table + browser at 375 and 1280 |
| `#me` | Step 1 | build / `me` | same |
| `#courses` | Step 2 | build / `courses` | same |
| `#prefs` | Step 3 (wishes **and** friends) | build / `wishes`, with a link chip to `#friends` | Review Focus 1 |
| `#friends` (**new**, A only; classic falls through to Plans) | n/a | build / `friends` | same |
| `#out` (**new**, A only; classic falls through to Plans) | n/a (the drawer opens without a hash) | build / `out` ("להוציא") | same |
| `#edit` | Edit step 1 | improve / `edit` (stage 1) or `mine` (stage 2) | Tasks 7, 8 |
| `#edit/changes` (exact) | Edit step 2; falls back to `#edit` with no baseline or a changed data file | improve / `changes` (stage 2; stage 1: the same page), same fallbacks | Tasks 7, 8 |
| `#edit/<anything else>` (today `#edit/me` is one of these) | Enters the edit route, shows step 1 | same | Task 2 wildcard test |
| `#f=<payload>` | Read at load, stripped, `app.friendLanding`, banner on Plans | Same; banner over the board; no mode question; friends badge | Task 6 |
| `#b=<payload>` | Read at load, stripped, confirm, restore (after the terms) | Same; lands on the board | Task 6 |
| empty `#f=` / `#b=` | `readHash` returns `null` (`share.js:60`): nothing is read or stripped; the hash stays and the route is Plans | same | Task 6 |

Anything else is Plans, as today. `routeA`, `viewOf` and `panelOf` are pure functions with a table-driven unit test, including the empty and wildcard cases.

### 2.3 Saved state (10 keys; nothing is renamed, migrated or dropped)

| Key | What A does with it |
|---|---|
| `afeka-sched-v1` | Unchanged. No A UI state is added. |
| `afeka-sched-v1:{program}-{startYear}` | Unchanged (the stash that `switchTo` restores; the suffix is the cohort start year, `app.js:282`). |
| `afeka-sched-v1-edit` | Unchanged (`EDIT_KEY`, `normalizeEdit`). |
| `afeka-sched-v1-theme` | Unchanged. |
| `afeka-sched-v1-tour` | Unchanged; parts `intro` and `plans` keep their meaning. One new part `shell` (the "what's new" tour) is added at the flip only. |
| `afeka-sched-v1-onboarded` | Unchanged **and still keyed to the route, not to a panel transition**: set when a valid, ungated build route other than `me` renders (`ui-plan.js:38`), never from the edit route. Tests: direct bookmark, default desktop `courses`, switching into improve. |
| `afeka-sched-v1-entry` | Unchanged. |
| `afeka-sched-v1-terms` | Unchanged; `TERMS_VERSION` stays `'2'`. |
| `afeka-sched-v1-mode` | Unchanged. Written by the tabs. |
| `afeka-sched-v1-design` (**new**) | `'a'` or `'classic'`: **both explicit choices are stored**; absence means the current default (classic until Task 11, A after). `?design=a` and `?design=classic` store their value; `?design=default` clears it. It starts with the prefix, so "מחק את כל הנתונים" (`clearSaved`) removes it: erase-all also returns to the default. Deliberate. |
| (conditional) `afeka-sched-v1-days` | Only if question 2 ends with the "כל השבוע" toggle: `'all'` or `'one'`. Same prefix rule. |

A reads and writes nothing in `sessionStorage` or cookies.

### 2.4 Event hooks (every `data-act`, `data-chg`, `data-ed` key in `web/*.js`, grouped by home)

Totals: 51 `data-act` (47 literal values in JavaScript plus `prev`, `next`, `skip`, `tour` from `index.html`), 37 `data-chg`, 22 `data-ed`. They stay bound where they are: the document listener in `ui-plan.js`, `openMap`'s own listener (`ui-map.js:555`), `wire()` and the document delegation of the lesson menu in `ui-edit.js` (`:784`). None changes name.

- **`data-act` (51), frame and first visit:** `acceptTerms`, `gateTrack`, `pickTrack`, `pickYear`, `manualEntry`, `gradeImport`, `pickMode`, `mode`, `menu`, `tour`, `skip`, `statusDone`.
- **board:** `prev`, `next`, `day`, `block`, `more`, `pin`, `popClose`, `lecturer`, `lecturerDrop`, `dropPin`, `clearPins`, `capProbe`, `capApply`, `dismissError`, `reloadPage`.
- **wishes:** `dayOff`, `blkAdd`, `blkRemove`, `resetPrefs`. **Board notes:** `prefsOk`, `prefsUndo` (the "defaults changed" note in `#semnote`).
- **friends:** `openFriendEditor`, `editFriend`, `removeFriend` (its focus target becomes the friends heading under A), `landingAdd`, `landingDrop`, `share`, `shareOut`.
- **take-out:** `panel` (`reg`, `advisor`), `copyReg`, `ics`, `advisor`, `advisorPdf`, `advisorCopy`, `backup`, `closeDrawer`.
- **my record:** `yearPassed`, `eraseAll`, `openMap`.
- **`data-chg` (37):** record and gate: `amirnet`, `failCount`, `failedBefore`, `grade`, `gradeFile`, `outsideDone`, `program`, `pyear`, `specMode`, `specPick`, `status`, `summer`, `turn`, `termsTick`. Courses: `semOf`, `mode`. Wishes (page "תכנון", weights, hours, "עוד אפשרויות"): `scope`, `load`, `maxCredits`, `w`, `dayHard`, `winHard`, `notBefore`, `notAfter`, `maxDays`, `examsForbid`, `includeFull`, `split`, `blkDay`, `blkStart`, `blkEnd`, `blkLabel`. Friends: `factive`, `fw`, `myName`. Board: `sem`, `sortBy`, and the board's own `scope`.
- **`data-ed` (22, edit page):** `loadFile`, `loadHand`, `restore`, `toggleMove`, `letMove`, `pickSwap`, `others`, `drop`, `newDay`, `fewerGaps`, `search`, `propPrev`, `propNext`, `saveProposal`, `copyChanges`, `restoreOriginal`, `day`, `next`, and the four undo chips `unmove`, `unswap`, `unadd`, `unremove`. The lesson-menu actions are drawn into `#pop`, outside `#edit`.
- **`data-k` families.** Beyond the literal keys, renderers generate key families that tests and focus restoration use: `friendUrl`, `addFriend`, `copyMine`, `fa-*`; `blk-*`, `doff-*`; `editSplit`, `editMode`; `grade-*`, `fb-*`, `spec-*`, `pick-*`, `year-*`; `mode-*`, `menu-*`; `b-*`, `day-*`, `alt-*`, `searchMore`; the map's `mn-*`, `pm-*`; and `${name}-${value}`, `sum-*`, `od-*` from `seg()`, `details()` and `outsideBox` in `ui-common.js`. A does not edit these producers, so the families survive; any new A element that copies a producer's markup must not reuse a key (see the alternatives column in Task 4).

### 2.5 What A has no place for, or changes (the "list anything A has no place for" answer)

1. **Numbered step bar, step badges, "הבא: …" foot buttons and "צעד ראשון" lines on the build pages.** A has free tools. Owner decision 2026-10-15 #1 chose numbered steps; #3 ("every step always open, no lock") is kept. Replacement proposed: a first-run "what to do first" card (question 1). The `.steps a.done` state becomes dock badges. (The edit page's own `.me-foot` buttons, "next" and "search", are **kept**.)
2. **First-entry mode tiles, the edit page's mode label ("עורכים מערכת קיימת · החלפה") and the ☰ mode links** (decision 2026-11-09): all replaced by the two tabs.
3. **One-day phone view and day chips**, unless question 2 keeps them (the prototype shows five days at 375px with shortened names).
4. **The header action row** (map, registration list, advisor, share): map moves into "המצב שלי" and ☰; registration list and advisor into "להוציא"; **share stays one tap away** on the board toolbar (build mode).
5. **The footer block** (disclaimer, legal links, report, counselling): the disclaimer line stays on screen at all times; the links move to ☰ → "מידע": two taps instead of a scroll. Needs the owner's OK (question 8).
6. **Edit page "step N of 2" labels.**
7. **The prototype's improve-mode tools beyond the live page.** The prototype offers wishes and an export in the improve tab; the live edit page has neither, and every existing export reads the builder's current alternative, not the improved schedule (`ui-drawer.js:199, 276`, `ui-actions.js:84, 265`). An adoption adds no feature: improve mode gets only what it has today (stage 1: the edit page; stage 2: "המערכת שלי", "שינויים והצעות" and the shared "המצב שלי"). Adding wishes or an export there is question 11.
8. **Prototype-only things, not built:** the "מצבים נדירים" demo page, `?demo` seeds, fake import rows, the fake engine.
9. **Product name:** the prototype says "הלוח"; the live title, link preview (`og:title`, `og.png`) and docs say "המערכת שלי" (question 3).

## 3. What stays, what is rebuilt, and four decisions

**Stays as is** (no edit expected): `solver-core.js`, `solver-worker.js`, `rules.js`, `settings.js`, `state-schema.js`, `share.js`, `advisor.js`, `advisor-pdf.js`, `ics.js`, `grade-import.js`, `friend-import.js`, `friend-scan.js`, `friend-schedule.js`, `friend-blocks.js`, `yedion-xlsx.js`, `edit-search.js`, `edit-state.js`, `edit-worker.js`, `map-layout.js`, `map-render.js`, `ui-map.js` (the dialog), `ui-friend-editor.js`, `ui-dialog.js`, `ui-text.js`, `theme.js`, `web/data/**`, `web/vendor/**`.

**Reused with small edits:** `ui-plan.js` (`renderRoute`, `onHash`, keyboard guards, the drawer close handler), `ui-common.js` (`PAGE.friends` and an A-aware `shownTitle()` under A), `ui-drawer.js` (`renderPrefs` writes wishes and friends to two containers; `renderOut()`), `ui-me.js` (panel variant), `ui-side.js`, `ui-view.js` (alternatives-column writer, the tools refresh hook, the tour call), `ui-actions.js` (tool and tab acts; `removeFriend` focus; `tour`), `ui-mode.js` (`menuPanel` under A), `ui-edit.js` (Tasks 7-8), `tour.js` (stops), `app.js` (two `replaceState` calls keep the query; the load-failure path covers the new containers), `legal.html` (loads `design.js` and `design-a.css`).

**Rebuilt:**
- `web/ui-shell.js` (new): frame, route model, panel state, dock, tabs, focus, swipe.
- `web/design.js` (new): head script that sets `data-design` before first paint, like `theme.js`.
- `web/design-a.css` (new): every selector scoped under `:root[data-design="a"]`; tokens (live token names mapped to the prototype's palette), shell, panels, dock, sheet and side column, the live page classes re-skinned to one column in a 360-400px panel. This is the bulk of the work.

**Decision 1: scroll roots.** The **document** scrolls the board (the prototype's inner-scrolling board with `body{overflow:hidden}` and a fixed `100dvh` shell is **not** ported). Dock and phone sheet are `position:fixed` and scroll themselves; on a wide screen the panel and alternatives columns are `position:sticky` with their own scroll. This keeps `scrollToDay()`, the popover's stale-position check and ordinary printing working unchanged.

**Decision 2: breakpoints.** A's wide layout starts at **1080px** (the live `SHEET` query), not the prototype's 1024. Phone is ≤599 (`PHONE`). The one-day week keeps its own 759 rule; the landscape-phone rule (`max-height:480px`) turns the dock into a side rail and the sheet into full height. Task 10 tests 600 / 759 / 760 / 1079 / 1080 and a resize with a tool open.

**Decision 3: edit containment and stage visibility.** `#edit` stays **one container** in improve mode and is visible for the whole of it. Stage visibility and tool visibility are **two separate things**: `stageOf(route)` picks the board (`#layout`, build mode) or the stage (`#edit`, improve mode); `panelOf(...)` picks only the overlay (`#me`, `#courses`, `#prefs`, `#friends`, `#out`). In stage 2 `#edit` becomes the stage itself: under A `renderEdit` writes an `.edit-stage[data-tool]` wrapper instead of `.edit-step` (CSS grid on it; the phone tool sheet is `position:fixed` on a child). The `.fx` transform animation is applied only to the week or the tool content, **never to an ancestor of the fixed sheet** (a transformed ancestor becomes its containing block, `style.css:2330`). `inEdit()`, `placeOf()`, the saved hint, goal-row scroll and result focus keep working because everything stays under `#edit`. `#layout` is **hidden in improve mode**, which also disables the builder's arrow-key handler there. The edit page's own day selector `#editDays` gets its own sticky offset and landscape rule (the live ones target `#daysel`, `style.css:1266-1275, 2110`).

**Decision 4: focus, scroll and tool rendering have one owner.** `ui-shell.js` exports `routeFocus(reason)` and `routeScroll(reason)` (`'open' | 'close' | 'back' | 'link'`); `onHash` calls them instead of `focusView()`, `scrollTo(0,0)` and the builder's `scrollToDay()` under A: opening focuses the tool's heading, closing returns to the opener when it still exists, Back and direct links focus the heading or the board title; the board's scroll position is **kept** while a tool opens or closes and reset only for a link or a direct load. The drawer's `close` listener (`ui-plan.js:226`) is a competing focus owner: during a navigation it is suppressed, otherwise it routes through `routeFocus`. A route change also calls `renderTool(name)` (`ui-shell.js`: `renderMe`, `renderSide`, `renderPrefs`, `renderOut` as the tool needs), because `renderRoute` renders only `#me` today; and leaving `out` for any reason (tool change, close, Back, mode change) drops the advisor PDF. Each tool's heading is resolved explicitly (`meTitle`, `coursesTitle`, `prefsTitle`, `friendsTitle`, `editTitle`, else `weekTitle`); Task 3 keeps those headings focusable (it hides only the step lines, not the `.me-head`).

**Popover:** stays `#pop` (it is already a bottom sheet on a phone). "Lesson as a panel" (prototype) is a later option; if wanted, extract the body of `openPop` into a shared function first.

## 4. The switch and compatibility

- `web/design.js` (classic script, in `<head>` after `theme.js`, CSP-safe) sets `document.documentElement.dataset.design = 'a'` before first paint when `?design=a` is in the URL (and stores `'a'`), or the stored value is `'a'`; `?design=classic` stores `'classic'`; `?design=default` clears the key. Until Task 11 the default is classic, after it A. Blocked storage: the URL still works for the visit.
- **The query survives link handling.** The two functions that rewrite the URL, `applyHash()` (`app.js:820`) and `applyPendingBackup()` (`app.js:799`), use `location.pathname + location.search + keep` (Task 1), so `?design=a#f=…` stays A after the link is read, with storage blocked too.
- `design-a.css` is linked always, but **every rule is scoped** under `:root[data-design="a"]`, so classic renders byte-for-byte as today. `test/design-a-css.test.mjs` fails if any top-level selector is not.
- `ui-shell.js` returns at once when `designOn()` is false.
- Old links and saved state: sections 2.2 and 2.3 are the contract; Task 9 is a dedicated compatibility spec that seeds an old-version state and walks every hash.
- Task 11 bakes the frame into `index.html` and flips the default. Task 12 deletes classic.

## 5. Tasks

Size: **S** half a session of work, **M** one, **L** two or more. "Behind switch" = the classic site does not change.

| # | Task | Behind switch | Size |
|---|---|---|---|
| 0 | Test helpers, explicit design per spec, test inventory | n/a, neutral, ships first | S |
| 1 | The switch and the A look (tokens only), query kept | yes | S |
| 2 | The frame: tabs, dock, panel host, routes, gate, focus, scroll (the seam; a decision point follows it) | yes | L |
| 3 | Panel content: one-column CSS, accessibility gate, landscape | yes | L |
| 4 | Board: top bar, alternatives column, phone swipe, banners | yes | M |
| 5 | Take-out: "להוציא", ☰, "מידע", print | yes | M |
| 6 | First run: terms card, entry, tour, "what first" card, link landings | yes | M |
| 7 | Improve mode, stage 1: the edit page inside the frame | yes | M |
| 8 | Improve mode, stage 2: board plus panel | yes | L |
| 9 | Dialogs, map, friend editor, legal page; compatibility spec | yes | M |
| 10 | Whole-app verification, both designs; iPhone checklist | yes | S |
| 11 | The flip: A is the default; docs, screenshots, `og.png` | no, needs the owner's OK | M |
| 12 | Delete classic | no, after the grace period | S |

Merge to `main` in at most four pushes (section 7): Tasks 0-1; 2-6; 7-10; 11 (then 12 later). Each task is reviewed on its own commit(s) before it merges locally.

---

### Task 0: Test helpers, explicit design per spec, inventory (neutral, ships first)

**Files:**
- Modify: `test/browser/helpers.mjs`
- Modify: `test/browser/flows.spec.mjs` (the 4 step-bar **clicks** in it plus the tour click: lines 119, 356, 358, 501 and the tour `tour.spec.mjs:204`), `test/browser/edit-shell.spec.mjs:43` (assertion)
- Create: `docs/superpowers/plans/2026-11-21-design-a-test-inventory.md`

**Interfaces:**
- Produces: `export async function openStep(page, view)` (`view`: `'me' | 'courses' | 'prefs' | 'friends' | 'plan'`): under classic it clicks `nav.steps a[data-view=view]` (`'friends'` maps to the `prefs` anchor, which holds both); under A it taps the matching dock button (`'plan'` has no button: it closes the open tool, i.e. sets the empty hash). `visit()` gets a ninth parameter `opts = {}` with `{ design: 'a' | 'classic' }`; the design is seeded into `afeka-sched-v1-design` in the same init script that seeds mode and tour keys. `process.env.DESIGN` is only the **default** for a local rerun. A-only specs always pass `{ design: 'a' }` explicitly, so CI (which runs every spec with only `BROWSER` set) tests what the spec says it tests.

- [ ] **Step 1:** Add `openStep`, the `opts.design` seed and `openFriends(page)` (classic: `#prefs`; A: `#friends`, for the friend-editor helper in `pdf.spec.mjs`) to `helpers.mjs`. Under classic every helper is exactly the old behaviour.
- [ ] **Step 2:** Replace only the **clicks** with `openStep(page, '<view>')`. The assertions at `flows.spec.mjs:509, 510` and `edit-shell.spec.mjs:43` stay as they are and are marked `classic only` (`process.env.DESIGN !== 'a'`; an explicit `DESIGN=classic` still runs them).
- [ ] **Step 3: Inventory.** Write the inventory file: every assertion that is bound to the old **presentation** rather than a shared behaviour (registration and advisor content inside `#drawer`, friends at `#prefs`, footer focus targets, exact ☰ contents, proposal and week DOM order, step-bar state), with a decision per row: shared (parameterize), classic-only, or A-variant. Seed it from `flows.spec.mjs:160, 169, 180`, `edit-shell.spec.mjs:75`, `edit-focus.spec.mjs:130`, `edit.spec.mjs:269`.
- [ ] **Step 4:** Run `npm run test:browser -- flows`, `-- edit-shell`, `-- tour` in WebKit. Expected: all pass with the same counts as before the edit (no behaviour change; no failing-test-first because the change is test-only).
- [ ] **Step 5:** Commit: `test(browser): openStep, explicit design per spec and a test inventory, no behaviour change`.

### Task 1: The switch and the A look (tokens only)

**Files:**
- Create: `web/design.js`, `web/design-a.css`
- Modify: `web/index.html` (two tags), `web/legal.html` (the same two tags), `web/app.js` (the `replaceState` calls in `applyHash()` and `applyPendingBackup()` keep `location.search`)
- Test: `test/design-a-css.test.mjs`, `test/design-contrast.test.mjs`, `test/browser/design-switch.spec.mjs`

**Interfaces:**
- Produces: `html[data-design="a"]` (set by `design.js` before first paint); key `afeka-sched-v1-design`. `design-a.css` defines, under `:root[data-design="a"]` (light) and `:root[data-design="a"][data-theme="dark"]` (dark; `theme.js` resolves "follow the device" and writes `data-theme`, so A defines its themes against that attribute and needs no `prefers-color-scheme` branch of its own, `theme.js:7, 14-20`), the live token names (`--bg`, `--surface`, `--text`, `--primary`, `--border`, the course colours, `--tap`, radii) with the prototype's palette from `a.css` lines 2-25 (light `--bg:#e9edf1 … --accent:#0a6b66`; dark `--bg:#0b0f14 … --accent:#3ccfc1`), after re-checking every pair for 4.5:1 text and 3:1 UI.

- [ ] **Step 1: Write the failing tests.**
  - `design-a-css.test.mjs` → `every top-level selector in design-a.css is scoped under :root[data-design="a"]` (rules inside `@media` are checked too; `@keyframes` bodies exempt).
  - `design-switch.spec.mjs` → `?design=a sets the attribute and stores a`; `a later visit with no parameter keeps A`; `?design=classic stores classic and the attribute stays off`; `?design=default clears the key`; `an unknown value is ignored`; `no key and no parameter leaves the attribute off`; `blocked localStorage: the parameter works for the visit and nothing throws` (Review Focus 4); `?design=a#f=<valid friend link> stays A after the link is read and after a reload, with storage blocked`; `a cancelled backup restore keeps ?design=a`; `erase-all removes the key`.
- [ ] **Step 2:** Run both. Expected: FAIL (files missing, query dropped).
- [ ] **Step 3: Implement** `design.js` as a self-contained IIFE (a classic script has no export), `design-a.css` tokens only, add `<script src="design.js"></script>` after `theme.js` and `<link rel="stylesheet" href="design-a.css">` after `style.css` in `index.html` and `legal.html`, and the two `replaceState` changes in `app.js`.
- [ ] **Step 4:** `design-contrast.test.mjs` asserts the pairs of the private `.superpowers/sessions/design-proto/contrast.mjs` (ported into the test; text on bg / surface, primary on surface, on-primary on primary, borders 3:1) for both themes. Expected: PASS after the palette is adjusted; the known-bad `.bdg.warn` pair is replaced here with an AA pair.
- [ ] **Step 5:** Run `npx -y -p node@24 node --test "test/*.test.mjs"` and `npm run test:browser -- a11y` (no parameter): all pass, classic untouched. Eyeball `?design=a` at 375 and 1280: the classic layout in the new palette.
- [ ] **Step 6:** Commit: `feat(design): ?design=a switch and the A palette, scoped, classic unchanged`.

### Task 2: The frame, routes, gate lock and focus

**Files:**
- Create: `web/ui-shell.js`, `test/shell-panels.test.mjs`, `test/browser/shell-a.spec.mjs`
- Modify: `web/ui-plan.js` (`renderRoute`, `onHash`, `renderAll`'s edit branch, the arrow-key guard, the drawer `close` listener), `web/ui-common.js` (`PAGE.friends` and `PAGE.out`, `shownTitle` under A), `web/ui-drawer.js` (`renderPrefs` under A writes two labelled wrappers: wishes into `#prefs` with the existing `prefsTitle` heading, friends into `#friends` with a new `friendsPageTitle` `h2[tabindex=-1]`, each around `prefsPanel()` / `friendsPanel()`; classic keeps the single page), `web/ui-actions.js` (`removeFriend` focuses `friendsPageTitle` under A), `web/app.js` (load-failure path), `web/index.html` (empty `<main id="friends" class="step-page" hidden>` and `<main id="out" class="step-page" hidden>`), `web/design-a.css` (frame skeleton, the body-state overrides)

**Interfaces:**
- Produces, in `ui-shell.js`:
  - `designOn(): boolean`
  - `routeA(hash: string): { mode: 'build' | 'improve', tool: string | null }` (wraps `routeOf` and `isEditHash`; adds `#friends`, `#out`; classic never calls it)
  - `stageOf(route): 'board' | 'edit'` (build mode: the board `#layout`; improve mode: `#edit`, visible for the whole mode)
  - `panelOf(route: { mode, tool }, ctx: { wide: boolean, program: boolean, gated: boolean, termsOk: boolean }): string | null` (the **overlay** only: `me`, `courses`, `wishes`, `friends`, `out`, or none)
  - `TOOLS = { build: ['me','courses','wishes','friends','out'], improve: [] }` for stage 1 (the improve mode has no dock; stage 2 sets `['mine','changes']` as the edit steps plus the in-memory `me` overlay)
  - `openTool(name: string, opener?: Element): void` (build: sets the hash; improve overlays: in-memory), `closeTool(): void`
  - `renderTool(name: string): void` (calls `renderMe`, `renderSide`, `renderPrefs`, `renderOut` as the tool needs; called by `onHash` under A, by the refresh hook of Task 5 and when an overlay opens)
  - `routeFocus(reason: 'open'|'close'|'back'|'link'): void`, `routeScroll(reason): void`
  - `shellInit(): void` (builds the frame once; re-parents `#title`, `#meta`, `#switcher`, `.theme-btn`, `.menu-btn`, `#notice`, `#layout`, `#me`, `#courses`, `#prefs`, `#friends`, `#out`, `#edit`; ids and classes untouched)
- Consumes: `app`, `routeOf`, `isEditHash`, `gated()`, `needsProgram()`, `termsOk()`, `setMode`, `getMode`, `markOnboarded`, `retakeNotice`.

- [ ] **Step 1: Write the failing unit test** `shell-panels.test.mjs`: table-driven `routeA` for the 12 forms of section 2.2 plus `#zzz` and `#edit/zzz`; `stageOf` (build → board, improve → edit); `panelOf` for: phone `''` → `null`; wide + program `''` → `'courses'`; wide + no program → `'me'`; build + `gated` → `'me'` whatever the tool; **improve + `gated` → not forced to `'me'`** (only `termsOk` gates it); `friends` → `'friends'`; `out` → `'out'`; `#edit` in improve mode never yields a build overlay.
- [ ] **Step 2: Write the failing browser spec** `shell-a.spec.mjs` (every `visit` passes `{ design: 'a' }`): at 375 `#me` shows `#week` (the board) and a panel containing `#me`; `#courses`, `#prefs`, `#friends` open their panels; the `#prefs` panel has a link to `#friends` (Review Focus 1); before the gate is passed every dock button except "המצב שלי" is `aria-disabled` and a tap does nothing (Review Focus 3); an **edit visitor is not forced through the builder gate** (Review Focus 6); Tab order: top bar, board bar, dock, then the open panel; **focus ownership:** Escape closes a phone sheet and returns focus to the dock button that opened it (not overwritten by `onHash`), Back closes an open panel, a direct `#courses` link focuses the panel heading; ✕ leaves no `#courses` in the URL and keeps the query; deleting a friend by keyboard lands on the friends heading; at 1280 three columns, no scrim, default panel "קורסים"; at 320 no horizontal scroll; `#switcher` is visible on every build tool and on the board (classic hides it off the plans view, `style.css:1510`); improve-mode arrows never change `ui.cur`, build-mode arrows still do; the mode tab "שיפור" opens `#edit` and "מערכת חדשה" returns to the board; **a failed data load locks the dock and every tool shows the board's retry, never an empty sheet**; the onboarded flag follows the rule of 2.3 (direct bookmark, default desktop courses, switching into improve); **scroll and drawer:** opening and closing a tool keeps the board's scroll position (a direct load resets it); a navigation that closes the drawer does not let the drawer's close listener steal focus afterwards; a wide screen shows no ✕ and Escape does not close the side panel; **shared header in improve mode:** `#meta` and the status strip are filled on a direct `#edit` visit and after a program or year change made in the record overlay (`renderAll`'s edit branch skips `renderTop` today, `ui-plan.js:119-124`); the record overlay opened over improve mode fires no `hashchange` and leaves a running proposal search and the current edit step untouched.
- [ ] **Step 3:** Run both. Expected: FAIL (module absent).
- [ ] **Step 4: Implement** `ui-shell.js` per the interfaces; call `shellInit()` once from `ui-plan.js` when `designOn()`; in `renderRoute`, when `designOn()`, set the stage's `hidden` from `stageOf(...)` and each overlay container's `hidden` from `panelOf(...)` (two independent decisions, instead of the one-page-at-a-time rule), `layout` hidden in improve mode, and leave the onboarding predicate as it is. In `renderPrefs`, under A, write the two labelled wrappers. `onHash` calls `renderTool`, `routeFocus` and `routeScroll` instead of `focusView()`, `scrollTo(0,0)` and `scrollToDay()` under A; the drawer `close` listener defers to `routeFocus`; `renderAll`'s edit branch also calls `renderTop()` under A. The load-failure path of `app.js:708` writes its retry into the new containers.
- [ ] **Step 5:** Frame CSS in `design-a.css`: top bar, status strip, stage grid (panel 400 | board | alternatives 280, sticky columns), dock (64px + safe area), phone sheet (`min(84dvh, 100dvh - 120px)`), scrim, and an explicit A override for each of the 18 body-state rules of section 1. Numbers from `a.css` lines 33-180, with decision 1 (document scroll) applied.
- [ ] **Step 6:** Run the focused tests, `npm run test:browser -- flows` with no design (must be green) and the new spec; run unit tests on Node 24.
- [ ] **Step 7:** Commit: `feat(design): the A frame, routes, gate lock and focus behind ?design=a`.

### Task 3: Panel content and the accessibility gate

**Files:**
- Modify: `web/design-a.css`, `web/ui-me.js` (panel variant: under A hide the step line `.me-step` only; **keep** `.me-head` and its focusable headings, the gate questions included), `web/ui-side.js` and `web/ui-drawer.js` only for class hooks
- Create: `test/browser/a11y-a.spec.mjs`

**Interfaces:**
- Produces: the A-side contract for the page classes: under `:root[data-design="a"]`, `.me-grid`, `.halves`, `.me-side`, `.me-main`, `.me-card`, `.step-page`, `.gate`, `.tiles`, `.course`, `.chips`, `.year` are one column inside a panel; `.me-step` and the **builder pages'** `.me-foot` are hidden (`#me`, `#courses`, `#prefs`, `#friends` only; the edit page's `.me-foot`, which holds its "next" and "search" buttons, is untouched). A landscape-phone rule (`max-height:480px`) turns the dock into a side rail.

- [ ] **Step 1: Write the failing spec.** For each of "המצב שלי", "קורסים", "מה חשוב לי", "חברים" (and the entry and gate screens), at 320, 375 and 1280, light and dark, plus 667×375 landscape: `axe` reports no violations; `scrollWidth <= innerWidth`; every visible `button`, `a[href]`, `summary`, `select`, `input` is at least 44px both ways under `pointer:coarse`; the focus ring is at least 2px with 3:1 against its background; the panel heading is focusable. Named tests: `panels have no axe violations`, `panels do not overflow at 320`, `panel targets are at least 44px`, `focus ring is visible in light and dark`, `landscape phone keeps the dock reachable and the sheet usable`, `edit page buttons are not hidden by the panel rules`.
- [ ] **Step 2:** Run. Expected: FAIL (the panels are still page-width layouts).
- [ ] **Step 3: Implement** the one-column CSS and the `ui-me.js` variant (a `designOn()` guard around the step line; no change to what is rendered under classic).
- [ ] **Step 4:** Re-run until green; then fix any pair `test/design-contrast.test.mjs` flags.
- [ ] **Step 5:** Commit: `feat(design): panel content in one column, with the accessibility gate`.

### Task 4: The board

**Files:**
- Modify: `web/ui-view.js` (a writer for the desktop alternatives column; no change to what classic draws), `web/design-a.css`, `web/ui-shell.js` (swipe on `#week`; share button on the board toolbar, build mode only)
- Test: extend `shell-a.spec.mjs`, `a11y-a.spec.mjs`

**Interfaces:**
- Produces: `renderAltColumn(): void` in `ui-view.js`, filling `#alts` (cards: rank, credits, days, gap hours, friends, a mini week). `miniWeekHtml(res, data): string` is **non-interactive**: `aria-hidden`, no `data-k`, no `data-act`, no ids (modelled on `map-render.js miniHtml`), so global focus restoration and `block` handlers never find a miniature lesson. A card calls `showAlt(k)` (`ui-view.js:481`).
- Consumes: `ui.last.results`, `semResult(raw, sem)` (`ui-grid.js:199`) and `yearTotals` (`:207`) to turn a year pair into the single-semester `res` that `summary()` (`:230`) needs, `go`, `showAlt`.

- [ ] **Step 1:** Failing tests: `desktop alternatives column lists every alternative and marks the shown one (aria-current)`; `a year plan's cards show year totals and switch semester without throwing` (scope year, semester tabs); `a miniature has no data-k, data-act or id and cannot open a lesson`; `arrow keys still switch alternatives and the label updates`; `swipe on the board switches alternatives on a phone`; `the share button is on the board toolbar and copies the same link as before`; `semester tabs, scope and sort stay reachable at 320`; `a computing, no-result and error state each render on the board`.
- [ ] **Step 2-4:** Run red, implement, run green plus `flows` (classic) green. **Step 5:** Commit: `feat(design): A board bar, alternatives column and swipe`.
- Decision recorded here: the one-day vs five-day phone week follows the owner's answer to question 2. Default until answered: the live one-day view with day chips (at least 44px at 320), plus a "כל השבוע" toggle only if the owner asks.

### Task 5: Take-out, ☰ and information

**Files:**
- Modify: `web/ui-drawer.js` (`renderOut()` composing `regPanel()` and `advisorPanel()`; `openPanel` stops calling `dropAdvisorPdf()` for the ☰ menu under A), `web/ui-view.js` (one `renderTools()` hook called wherever `renderDrawer()` is called today, so an open `#out` follows search results, semester and alternative changes; a route change reaches `#out` through `renderTool('out')` of Task 2), `web/ui-plan.js` (the drawer `close` handler no longer drops the PDF while `#out` is open; every exit from `out`, i.e. tool change, close, Back and mode change, drops it through the shell), `web/ui-mode.js` (`menuPanel` under A: info, map, tour, theme, erase), `web/ui-shell.js`, `web/design-a.css` (print rules)
- Test: `shell-a.spec.mjs`; the advisor, file-lifecycle, Google-app and share tests of **`flows.spec.mjs`** (lines about 908, 1016, 1043) run under `DESIGN=a`; `pdf.spec.mjs` (imports and OCR) re-runs with its friend-editor helper on `openFriends`

**Interfaces:**
- Produces: `renderOut(): void` (fills `#out`; build mode only: improve mode has no export, section 2.5 item 7); an "info" panel built from `renderTop`'s freshness, `approvedText`, `conflictsFor`, the legal links (`legal.html#terms`, `#privacy`, `#accessibility`, `#contact`), `reportHref()` and the counselling link from `app.settings`. PDF ownership follows the advisor section of `#out`: created when it renders, dropped when `#out` closes, **not** when ☰ opens or any drawer closes.

- [ ] **Step 1:** Failing tests: `out tool shows the registration list, backup groups, ics, advisor summary, share and the backup link`; `copy failure shows the text dialog` (clipboard stubbed to reject, as `visit` does); `an open out panel follows a new alternative and a new semester tab` (copy, calendar and share use the shown alternative; a year plan still exports **both** semesters, as `current()` does today, `ui-common.js:138`); `merely opening #out by hash, dock tap or Back renders it and starts the advisor PDF`; `opening ☰ over "להוציא" keeps the advisor PDF button valid`; `the advisor PDF file is created and dropped on every exit from the tool: switching tool, closing, Back, switching mode`; `advisor print: window.print is called once and #print holds the whole summary`; **`printing in print media shows only the summary and paginates: Chromium page.pdf() of a long summary has more than one page and no clipped lines; WebKit checks emulated print layout has no fixed-height ancestor`** (Review Focus 5); `the info panel lists every footer link`; `the unofficial line is visible on every screen at 320`; `☰ has no mode links under A and has theme, tour, map, info, erase`.
- [ ] **Step 2-4:** Red, implement, green. **Step 5:** Commit: `feat(design): A take-out, menu, information and print`.

### Task 6: First run, links and the tour

**Files:**
- Modify: `web/ui-me.js` (terms card skin hooks only), `web/tour.js` (A stops), `web/ui-actions.js` (`tour`: close ☰ and await it, then start with a stable return-focus target), `web/ui-view.js` (the "what first" card when there is no result; the plans-tour call), `web/design-a.css`, `web/ui-shell.js`
- Test: `shell-a.spec.mjs`, `tour.spec.mjs` under `DESIGN=a`

**Interfaces:**
- Produces: `TOUR_INTRO_A`, `TOUR_PLANS_A` (stops on `.modes`, `.dock`, `#week`, `.altbar`), chosen by `designOn()`; same parts `intro` and `plans`. Sequencing rule: the plans tour starts only when the intro was done or skipped **and** no panel is open (an always-visible board must not start it behind the record panel).

- [ ] **Step 1:** Failing tests: `first visit shows the terms card over an empty board, then the track question, then the year question, one per screen`; `a friend link on a first visit shows no mode question and, after the terms, the friend banner above the board` (Review Focus 2); `a backup link runs after the terms and lands on the board`; `an empty #f= and an empty #b= do nothing and break nothing`; `the intro tour has no stop on a hidden element`; `the plans tour waits until the intro is done and no panel is open`; `the tour replays from ☰ after the menu has closed, and focus returns to a visible element`; `the "what first" card disappears after the first result`.
- [ ] **Step 2-4:** Red, implement, green. **Step 5:** Commit: `feat(design): A first run, link landings and tour`.

### Task 7: Improve mode, stage 1 (the edit page inside the frame)

**Files:**
- Modify: `web/ui-shell.js` (mode `improve`: the existing `#edit` container is the whole stage, **no dock**; the tabs and the A top bar stay), `web/design-a.css`, `web/ui-edit.js` (only `designOn()` guards for the mode label and the "step N of 2" text)
- Test: all 8 `edit*.spec.mjs` run under `DESIGN=a`; `edit-shell.spec.mjs`'s "no step bar" assertion becomes "improve tab is selected"; the inventory rows of Task 0 decide the others

- [ ] **Step 1:** Run the 8 edit specs with `DESIGN=a` first: expected FAIL where the frame moves or hides ids. **Step 2:** Fix the frame, not the specs, except for rows the inventory marks "A-variant". **Step 3:** Green on WebKit and Chromium; classic untouched. **Step 4:** Confirm the edit page offers no export of the improved schedule; none is added. **Step 5:** Commit: `feat(design): improve mode, the edit page inside the A frame`.

### Task 8: Improve mode, stage 2 (board plus panel)

**Files:**
- Modify: `web/ui-edit.js` (split `stepOneHtml` / `stepTwo` output into a week part and a tool part, **both still children of `#edit`**), `web/ui-shell.js` (`TOOLS.improve = ['mine','changes']` are the two edit steps, `#edit` and `#edit/changes`; the shared record opens as an in-memory `me` overlay over the board, no hash), `web/design-a.css` (Decision 3: grid on `.edit-stage`, tool shown by `data-tool`, fixed phone sheet on a child, no transformed ancestor, `#editDays` sticky offset and landscape rule)
- Test: the 8 `edit*.spec.mjs` under `DESIGN=a`, plus new `edit-a.spec.mjs`

**Interfaces:**
- Produces: `editWeekHtml(st): string` and `editToolHtml(st, tool): string` (the two halves of today's `stepTwo`); `V.fx`, `touch()`, `invalidate()`, `inEdit()`, `placeOf()` are untouched.

- [ ] **Step 1:** Failing tests (`edit-a.spec.mjs`): `a moved lesson shows "היה כאן" on the board while the proposal tool is open`; `the goal row keeps its horizontal scroll after a redraw`; `saving a proposal updates the board and closes nothing`; `the proposal switcher still moves with arrows and never changes the builder alternative`; `a stale proposal is dropped after a record change and a new search is asked for`; `the record overlay opens over improve mode without leaving it, writing mode build, changing the edit step or cancelling a running search`; `the .fx step animation never leaves a transformed ancestor around the fixed phone sheet`; `the edit day selector stays reachable at 320 and in landscape`; `focus inside the edit tools is never treated as outside the page`.
- [ ] **Step 2-4:** Red, implement, green on the whole edit suite. **Step 5:** Commit: `feat(design): improve mode with the week on the board and tools in a panel`.
- Stop gate: if more than a handful of existing edit tests need edits beyond selectors, stop and report; the fallback is to ship stage 1 as the final improve layout.

### Task 9: Dialogs, map, friend editor, legal page, compatibility

**Files:**
- Modify: `web/design-a.css` (dialogs `#drawer` modal, `#friendEd`, `#pmap` chrome, confirm dialogs; `legal.html` now loads `design.js` and `design-a.css` from Task 1, so its A look is a small scoped block here)
- Create: `test/browser/compat-a.spec.mjs`

- [ ] **Step 1:** `compat-a.spec.mjs` (design passed explicitly): seed the old-version state with all 9 existing keys (using `DONE` / `STUDENT` from `helpers.mjs` and a blob produced by the current `save()`); for each hash of section 2.2 assert A shows the same record, the same plan (course ids and first alternative) as classic and the same friends; an edit state at `#edit` and `#edit/changes`; `afeka-sched-v1:{program}-{startYear}` still restores after a program switch; `?design=classic` returns to the old layout with the same state. Red first, then green.
- [ ] **Step 2:** Re-run `map-targets.spec.mjs` and the map checks of `a11y.spec.mjs` and the friend-editor tests (tabs with Arrow / Home / End, Delete / Backspace, dirty-close confirm, scanned-PDF page picker) under `DESIGN=a`; axe and contrast on all dialogs at 320 / 375 / 1280, light and dark, added to `a11y-a.spec.mjs`. **Step 3:** Commit: `feat(design): A dialogs and map chrome, with the compatibility spec`.

### Task 10: Whole-app verification

- [ ] Run the full browser suite once per design in WebKit and Chromium (`DESIGN=a`, then unset), and the A specs on Firefox; run `npm run check:real`; unit tests on Node 24.
- [ ] Width and resize checks at 600 / 759 / 760 / 1079 / 1080, and a resize with a tool open (the drawer chooses modal or docked when it opens).
- [ ] Screenshots (WebKit) at 320 / 375 / 1280, light and dark, of every tool, the board with each state and the improve mode, saved under `.superpowers/sessions/design-a/` (private, not in git).
- [ ] **iPhone checklist for the owner** (extends `docs/IPHONE-CHECKLIST.md`): bottom sheet with the keyboard open on a text field; dock and the Safari bottom bar and home indicator; swipe on the board versus page scroll; share sheet and WhatsApp from "להוציא"; PDF share in the Google app; add to home screen; landscape.
- [ ] Commit nothing here except fixes the verification finds.

### Task 11: The flip (needs the owner's OK)

**Files:**
- Modify: `web/index.html` (frame baked in), `web/design.js` (default becomes A; `?design=classic` stays), `test/browser/helpers.mjs` (default design is A), the specs that still assume the step bar (`flows.spec.mjs` step-bar assertions at lines 119, 356-358, 501-510; `tour.spec.mjs:204`) per the inventory, `scripts/readme-shots.mjs` (the build-or-edit choice shot disappears; add a tabs shot), `README.md`, `docs/GUIDE.md`, `docs/media/**` (regenerated), `design-system/afeka-scheduler/og.html` and `web/og.png`, `legal.html#accessibility` and `docs/ACCESSIBILITY-*.md` (re-audit statement), `docs/ARCHITECTURE.md`

- [ ] Order: tests first (default flipped, all specs green in WebKit and Chromium locally), then docs and images, then one push. From here CI runs everything in A; classic keeps `design-switch` and a small smoke subset until Task 12. Add the `shell` tour part ("what's new", three stops) for returning visitors if question 7 is yes.

### Task 12: Delete classic (after the grace period)

- [ ] Remove the classic CSS and the step-bar markup and code paths (`.steps`, `renderModeChoice`, the `designOn()` guards, `PAGE` indirection if now unused), the `?design=classic` path and the `-design` key's reader; run the whole suite and `test/line-length.test.mjs`.

## 6. Tests

**Change (Tasks 0, 7, 11):** `helpers.mjs` (`openStep`, `openFriends`, `visit` options); `flows.spec.mjs` (5 step-bar clicks now; the step-bar assertions at the flip); `edit-shell.spec.mjs` ("no step bar", "mode label", first-entry tiles); `tour.spec.mjs` (stops, the replay, the "plans waits" rule); `scripts/readme-shots.mjs`. **Most** other specs keep their selectors because A keeps the ids, `data-act`, `data-chg`, `data-ed` and `data-k` hooks, but some assertions are bound to the old presentation (section 1, last bullet): the Task 0 inventory lists them and decides each one before Task 2.

**New:**
- Unit: `design-a-css.test.mjs` (scope guard), `design-contrast.test.mjs` (token pairs, both themes), `shell-panels.test.mjs` (route to tool mapping, empty and wildcard cases).
- Browser (each passes `{ design: 'a' }` explicitly, so CI runs them as written): `design-switch.spec.mjs`, `shell-a.spec.mjs`, `a11y-a.spec.mjs` (axe, overflow, 44px, focus ring; every tool and dialog; 320 / 375 / 1280 and landscape; light and dark), `edit-a.spec.mjs`, `compat-a.spec.mjs`.
- Parameterized, not duplicated: the 8 edit specs, `tour.spec.mjs`, the advisor tests of `flows.spec.mjs` and `pdf.spec.mjs` re-run locally with `DESIGN=a` before the flip (CI cannot run them under A before Task 11 without a second invocation; adding one is a minutes decision, section 7).

**Keyboard and motion:** Tab order (top bar, board bar, dock, panel); Escape closes a phone sheet and returns focus to its opener; arrow keys switch alternatives in build mode only; visible focus ring in both themes; `prefers-reduced-motion` removes the sheet slide (`visit()` sets `reducedMotion: 'reduce'`; one spec turns it on to check the animation is only under `no-preference`).

**Local runs:** focused spec per task (`npm run test:browser -- <name>`), WebKit first; the full suite once before each merge (the owner's usage rule); Chromium for the A specs before each push so a failure mail does not surprise the owner.

## 7. CI and minutes (#46)

- #46 ("החלטה: דקות ה-CI של הריצה הלילית") is the **GitLab nightly scrape** (400 min/month, about 510 needed). UI work does not touch `ci/` or the scraper, so it adds nothing there.
- The browser checks run on **GitHub Actions** (`.github/workflows/browser.yml`): on every push to `main` that touches `web/**`, `test/browser/**` or `test/fixtures/real/**`, as three parallel jobs (webkit, chromium, firefox). The last six runs took 6 to 12 minutes each, so one push is roughly 20 to 35 job-minutes. Actions on this public repository are not metered, but each failure mails the owner.
- Plan: **at most four pushes** (Tasks 0-1; 2-6; 7-10; 11), everything behind the switch until the last, each verified locally first. The A specs stay small (each under about three minutes) and set their design explicitly. Until the flip CI tests classic plus the A-only specs; the reruns of existing specs under A are local. If the owner wants those reruns in CI too, that is a second `run.mjs` invocation per engine (roughly doubling the browser minutes for those pushes) and a `browser.yml` edit, not part of this plan unless asked.

## 8. Engineering risks and open questions

1. **Improve mode is a mode, not a tool.** Its URL is the edit step and nothing else; overlays opened over it are in-memory (section 2.2), so `onHash` never runs and mode `build` is never written. Covered by the route unit test and the Task 2 / Task 8 specs.
2. **`renderEdit` writes its own HTML and its helpers assume `#edit` contains everything.** Decision 3 keeps one `#edit`; Task 8 carries a stop gate.
3. **Hidden-container behaviour differs per renderer** (only `renderMe` clears itself). Panels are shown before their renderer runs; Task 2 checks that a record change in "המצב שלי" reaches "קורסים" after switching.
4. **Focus and scroll have single owners** (Decisions 1 and 4). The classic `shownTitle()` order (me, courses, prefs, plan, edit) must not be reused as is.
5. **The drawer and the PDF.** `#drawer` stays for classic and ☰; "להוציא" composes the same bodies into `#out` and owns the PDF blob (Task 5).
6. **Print.** Document scroll (Decision 1) removes the fixed-height problem; Task 5 still tests print media.
7. **Safari.** `100dvh`, bottom sheets with the keyboard, safe-area insets and `dialog.showModal` need a real iPhone (Task 10 checklist).
8. **Body-state CSS.** The 18 `body[data-view]` / `body.gated` / `body.drawer-open` / `body.touring` / `body.pop-open` rules silently win over A rules of lower specificity. Each gets an explicit A override and the specs assert the visible result on every view.
9. **Prototype lives on one local, unpushed branch** (`d43018d`). Losing it loses A and B. A backup is the manager's and the owner's call; this plan merges and pushes nothing.
10. **Two designs during the grace period.** Every fix lands twice in CSS until Task 12; the scope test and the parameterized specs keep them honest.
11. **The tests are the biggest cost.** The inventory (Task 0) may show that many more assertions than the 8 step-bar lines encode the old layout; its size decides the real effort of Tasks 7 and 11.

## Self-review

- **Coverage of the request:** (1) the map (2.1 to 2.5, 51 `data-act`, 37 `data-chg`, 22 `data-ed` keys and the `data-k` families, 12 route forms, 10 storage keys; checked against the code and corrected after two Codex reviews); (2) stays / rebuilt (3); (3) saved state and links (2.2, 2.3, 4, Task 9); (4) ordered tasks with the switch (5); (5) tests, phone widths, light and dark, keyboard, CI (6, 7); (6) risks and owner questions (Hebrew summary).
- **Placeholders:** none. Tasks 0-2 carry the full steps; Tasks 3-12 carry Files, Interfaces, named tests and the verification command, because their final shape depends on how the Task 2 seam behaves.
- **Names:** `designOn`, `routeA`, `stageOf`, `panelOf`, `TOOLS`, `openTool`, `closeTool`, `renderTool`, `routeFocus`, `routeScroll`, `shellInit`, `renderOut`, `renderTools`, `renderAltColumn`, `miniWeekHtml`, `editWeekHtml` / `editToolHtml` are spelled the same wherever they appear.
- **Proportion:** the plan is long because the map is the deliverable; the code in it is signatures and test names only.

## Review record

- Codex pass 1 (high effort, `git`-free read of the code): 36 findings (2 blocker, 22 real, 12 minor). All addressed in this file: the route model (mode, tool), improve mode as a mode, edit containment, the test inventory, focus and scroll ownership, PDF ownership, the year-pair alternatives column, the CI design fixture, and the corrected feature, hook and key inventories.
- Codex pass 2 on the revised file: 21 findings (3 blocker, 10 real, 8 minor). All addressed: improve-mode overlays are in-memory with no hash, stage and overlay visibility are separate decisions, closed routes per mode, `#out` and info routing, `renderTool` on route changes, shared header in improve mode, labelled panel wrappers, no transformed ancestor around the fixed sheet, `routeScroll`, the drawer close listener, the `openStep` mapping, year-export semantics, the edit day selector, and the factual corrections (`applyPendingBackup`, `{program}-{startYear}`, `theme.js`, 4,100 lines, `#semnote`).
- No third pass was run. The raw answers are kept privately under `.superpowers/sessions/reviews/` (not in git).
