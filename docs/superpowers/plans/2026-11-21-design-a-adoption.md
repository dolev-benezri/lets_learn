# Design A ("הלוח") Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Plan only: no code is written until the owner approves this file.**

**Goal:** Move the real site (`web/`) to design concept A "הלוח": the week board is always on screen, every tool opens as a panel over it (bottom sheet on a phone, side column on a computer), a bottom dock on the phone, and "build" / "improve" as two tabs at the top. **A full replacement: no screen, state or dialog of the live site keeps the old look when the work is done** (owner, 2026-11-21: "אני רוצה החלפה מלאה על כל מסכי האתר לא לפספס כלום"), and no feature, saved state or old link is lost. Section 9 is the checklist and Task 13 is the proof.

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
- **Full replacement.** Classic exists only as a transition switch. Every row of section 9 gets an A screen; Task 12 removes classic (CSS, markup, code paths, the switch) and Task 13 proves that nothing is left in the old style. A row with no natural place in A is a question for the owner and is still built; nothing is dropped.
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
7. **A state nobody opens by hand** (load failure, search error, no result, blocked storage, print, a stale proposal, a dialog behind a toast). The sweep of Task 13 forces each of them through `page.route`, seeds and emulation, so none is left in the old look unseen.

---

<div dir="rtl" lang="he">

# סיכום לבעלים (בעברית, בלי שמות קבצים)

## מה מתכננים

להעביר את האתר האמיתי לעיצוב א׳ "הלוח": המערכת השבועית תמיד על המסך, וכל כלי (המצב שלי, קורסים, מה חשוב לי, חברים, להוציא) נפתח כחלונית מעליה. בטלפון זה גיליון שעולה מלמטה וסרגל כלים תחתון. במחשב זו עמודה בצד, ועמודה נוספת עם החלופות. למעלה שתי לשוניות: "מערכת חדשה" ו"שיפור מערכת קיימת". עיצוב ב׳ לא נוגעים בו ולא מוחקים אותו.

## החלפה מלאה (מה שביקשת)

ביקשת: "החלפה מלאה על כל מסכי האתר, לא לפספס כלום". לכן יש בתוכנית (סעיף 9) **רשימת בדיקה של 177 פריטים שנלקחה מהקוד, ובתוכה כ־300 תרחישים** (פריט שיש בו כמה מצבים, כמו מפה שנטענת או נכשלת או PDF שמתכונן או נכשל, נבדק בנפרד בכל מצב): כל מסך, חלונית, גיליון, חלון קופץ, תפריט, הודעה קטנה (26 הודעות כאלה), באנר, מצב ריק, מצב שגיאה, מצב טעינה, ההתחלה והתנאים, ההדפסה וה־PDF, השיתוף וכל כתובת. לכל פריט כתוב איזה מסך ב־א׳ מחליף אותו. העיצוב הישן נשאר רק בזמן המעבר. משימה 12 מוחקת אותו (לא מסתירה), ומשימה 13, האחרונה, **מוכיחה** שלא נשאר דבר: צילום מסך חדש לכל פריט (טלפון ומחשב, בהיר וכהה), בדיקה שכל הצבעים והגופנים הם של א׳, בדיקה שאין CSS ישן שלא בשימוש, ובדיקה שלא נשאר בקוד שום "שלב 1" או "הבא:". דברים שאין להם מקום טבעי ב־א׳ לא נמחקים: הם נבנים, ושואלים אותך עליהם (שאלות 12 עד 16).

## מה לא משתנה

- כל הנתונים, החיפוש, הכללים והחישובים. שום דבר שם לא נכתב מחדש.
- כל מה שכבר שמור אצל סטודנטים: ההתקדמות, הציונים, החברים, ההעדפות, ערכת הצבעים (כהה או בהירה), הסיור. הוא ימשיך לעבוד בדיוק כמו היום.
- כל הקישורים הקיימים: קישור חבר, קישור גיבוי, וכתובות כמו `#me`, `#courses`, `#prefs` ו־`#edit`.
- כל היכולות: הכול ממופה בסעיף 2 של התוכנית. מה שאין לו מקום ב־א׳ רשום ברשימה נפרדת (סעיף 2.5), ולא נעלם בשקט.

## איך מגיעים לשם בלי לשבור את האתר

- הכול נבנה מאחורי מתג. האתר כמו שהוא היום נשאר ברירת המחדל. מי שפותח את הכתובת עם `?design=a` רואה את העיצוב החדש (והדפדפן זוכר). כך אפשר לבדוק בטלפון, משימה אחרי משימה, לפני שמישהו אחר רואה משהו.
- 14 משימות (0 עד 13), כל אחת נבדקת לבד. אפשר לעצור אחרי כל אחת. לפני שמתחילים, משימה 0 ממפה אילו בדיקות קיימות קשורות לעיצוב הישן, כי זה קובע כמה עבודה באמת צריך.
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
12. **הדפסה: סיכום ליועץ.** זה נייר, בשחור על לבן. *המלצה:* להשאיר מסמך פשוט בשחור־לבן (כך מדפיסים וכך יועצים קוראים), אבל עם אותן כותרות וגופן של א׳. המסך עצמו (התצוגה המקדימה בחלונית) יהיה בסגנון א׳.
13. **מפה ועורך החברים כחלונות מסך מלא.** הם גדולים מדי לחלונית בצד או לגיליון. *המלצה:* להשאיר אותם מסך מלא, בסגנון א׳ (כותרת, כפתורים, צבעים), עם כפתור סגירה ברור.
14. **עמוד התנאים והפרטיות.** הוא עמוד נפרד עם טקסט ארוך. *המלצה:* עמוד קריאה פשוט עם הכותרת העליונה של א׳ וקישור "חזרה ללוח", בלי חלוניות.
15. **סמל האתר, תמונת התצוגה המקדימה בווטסאפ וצבע שורת הדפדפן.** הם היום בצבעי האתר הישן. *המלצה:* להתאים אותם לצבעי א׳ ביום המעבר (משימה 11), כדי שגם קישור משותף ייראה כמו האתר החדש. מאשר שינוי של הסמל והתמונה?
16. **חלונית פרטי השיעור.** במחשב היא צפה ליד השיעור, בטלפון גיליון מלמטה. א׳ בדוגמה הראה אותה כגיליון גם במחשב. *המלצה:* להשאיר כמו היום (צפה במחשב), בסגנון א׳.

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
| 12 | Delete classic: old CSS, markup, code paths and the switch | no, after the grace period | M |
| 13 | Proof of full replacement: manifest of section 9, sweep, palette audit, unused-CSS and old-markup checks, one screenshot per item | n/a, final gate | M |

Merge to `main` in at most four pushes (section 7): Tasks 0-1; 2-6; 7-10; 11 (then 12 and 13 later). Each task is reviewed on its own commit(s) before it merges locally.

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
- Modify: `web/ui-text.js` (`toolName(key): string`, "שלב 3" in classic and "מה חשוב לי" under A) and the 17 copy sites of section 9.10 (rows Y01-Y17; the ones marked removed are hidden under A and deleted in Task 12), `web/ui-me.js` (terms card skin hooks only), `web/tour.js` (A stops), `web/ui-actions.js` (`tour`: close ☰ and await it, then start with a stable return-focus target), `web/ui-view.js` (the "what first" card when there is no result; the plans-tour call), `web/design-a.css`, `web/ui-shell.js`
- Test: `shell-a.spec.mjs`, `tour.spec.mjs` under `DESIGN=a`

**Interfaces:**
- Produces: `TOUR_INTRO_A`, `TOUR_PLANS_A` (stops on `.modes`, `.dock`, `#week`, `.altbar`), chosen by `designOn()`; same parts `intro` and `plans`. Sequencing rule: the plans tour starts only when the intro was done or skipped **and** no panel is open (an always-visible board must not start it behind the record panel).

- [ ] **Step 1:** Failing tests: `first visit shows the terms card over an empty board, then the track question, then the year question, one per screen`; `a friend link on a first visit shows no mode question and, after the terms, the friend banner above the board` (Review Focus 2); `a backup link runs after the terms and lands on the board`; `an empty #f= and an empty #b= do nothing and break nothing`; `the intro tour has no stop on a hidden element`; `the plans tour waits until the intro is done and no panel is open`; `the tour replays from ☰ after the menu has closed, and focus returns to a visible element`; `the "what first" card disappears after the first result`; `no visible string under A says "שלב N", "צעד N" or "הבא:"` (the 17 copy rows).
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
- Modify: `web/index.html` (frame baked in), `web/design.js` (default becomes A; `?design=classic` stays), `test/browser/helpers.mjs` (default design is A), the specs that still assume the step bar (`flows.spec.mjs` step-bar assertions at lines 119, 356-358, 501-510; `tour.spec.mjs:204`) per the inventory, `scripts/readme-shots.mjs` (the build-or-edit choice shot disappears; add a tabs shot), `README.md`, `docs/GUIDE.md`, `docs/media/**` (regenerated), `design-system/afeka-scheduler/og.html` and `web/og.png`, **`web/icon.svg`** (literal blue and white), **the brand-mark pseudo-element in `web/style.css:306`**, **`web/theme.js:17`** (the two `theme-color` values), `web/legal.html` (accessibility statement: rows Y18-Y20 and the screen list), `docs/ACCESSIBILITY-*.md` (re-audit statement), `docs/ARCHITECTURE.md`

- [ ] Order: tests first (default flipped, all specs green in WebKit and Chromium locally), then docs and images, then one push. From here CI runs everything in A; classic keeps `design-switch` and a small smoke subset until Task 12. Add the `shell` tour part ("what's new", three stops) for returning visitors if question 7 is yes. The brand files are checked by eye (their pixels are not in the DOM): favicon, header mark, `og.png`, and the browser colour in light and dark.

### Task 12: Delete classic (after the grace period)

**Files:** `web/style.css`, `web/map.css`, `web/design-a.css`, `web/index.html`, `web/legal.html`, `web/app.js`, `web/ui-actions.js`, `web/ui-grid.js`, `web/ui-plan.js`, `web/ui-mode.js`, `web/ui-*.js`, `web/tour.js`, `web/theme.js`, `web/design.js`, `test/browser/*.spec.mjs`

- [ ] **Step 1: Migrate what the old attributes still carry.** `body[data-view]` is not only presentation: it decides whether a lesson opens the edit menu (`ui-actions.js:194`), detects leaving the edit route (`ui-plan.js:97`), supplies the report-mistake context (`ui-grid.js:387`) and restores the route after a cancelled backup restore (`app.js:791`). Replace it with `body.dataset.mode` and `body.dataset.tool` (set by `ui-shell.js`) in all four consumers **before** anything is deleted; then only the **step anchors** (`a[data-view]`) are banned, not the body attribute's role.
- [ ] **Step 2: Delete, do not hide, with a disposition for each remnant.** Remove from the code, not only from the cascade:
  - the step bar (`nav.steps`, step anchors with `data-view`, the `.n` badges, `.steps a.done`), the mode tiles (`renderModeChoice`, `.tiles.modes`, `needsModeChoice`), the old ☰ mode links (`.mode-menu`, `.mode-link`, their handler `ACT.mode`, `modeOpen`, `EXPLICIT` in `ui-mode.js:23, 40`), the edit page's mode label and its CSS, the `.actions` header row, the footer block;
  - the **builder pages'** `.me-step` and `.me-foot` "next" buttons only (`#me`, `#courses`, `#prefs`; the edit page's own foot controls stay with A labels);
  - the old page layout rules that keep matching while overridden: fragment-scroll compensation, the desktop profile columns and the sticky sidebar (`style.css:1584, 1607, 1673`), and the 18 body-state rules of section 1, **each with a disposition**: *delete* the docked-drawer layout rules (`body.drawer-open` header reshaping, `style.css:1239-1250, 979`), *replace before deleting* the scroll-lock and scrim rules the retained surfaces still need (`body.pop-open` for the phone lesson sheet, `body:has(.drawer.modal[open])`, the ☰ menu's narrow-screen lock, `style.css:1332, 1337, 1705`), *rewrite* `body.touring` and `body.gated` as A rules with a named purpose;
  - `toolName()` and every `designOn()` guard, `PAGE`'s one-page rule, the `?design=` parameter, `design.js`, the `afeka-sched-v1-design` key and its reader, `legal.html`'s inline `<style>`.
- [ ] **Step 3: Fold.** Move the surviving A rules out of the `:root[data-design="a"]` scope into plain selectors in `style.css` and `map.css` (one stylesheet per concern; `design-a.css` is deleted), and delete the scope test.
- [ ] **Step 4:** Run the whole browser suite in the three engines (the default design is now the only one), the unit tests on Node 24 and `test/line-length.test.mjs`. Expected: green, with `design-switch.spec.mjs` and the classic-only assertions of the Task 0 inventory deleted.
- [ ] **Step 5:** Commit: `refactor(design): remove classic and fold A into the base styles`.

### Task 13: Proof of full replacement (the final gate)

**Files:**
- Create: `test/browser/inventory.mjs` (the manifest), `test/browser/replacement.sweep.mjs` (the sweep), `test/inventory-sync.test.mjs`, `test/old-markup.test.mjs`, `scripts/css-unused.mjs`, `test/browser/css-unused.allow.json`
- Modify: `test/browser/run.mjs` (a `--sweep` argument that selects `*.sweep.mjs` instead of `*.spec.mjs`; without it the sweep is never discovered, so CI never runs it), `test/browser/helpers.mjs` (fixture options below), `package.json` (`"test:sweep": "node test/browser/run.mjs --sweep"`, `"check:css": "node scripts/css-unused.mjs"`)

**Interfaces:**
- Produces: `INVENTORY: Array<{ id: string, scenario: string, area: string, kind: 'screen'|'state'|'dialog'|'toast'|'route'|'print'|'page'|'absent'|'browser-owned', open: (page, ctx) => Promise<void>, expect?: (page) => Promise<void> }>`. **One entry per scenario** (section 9.12): the 177 row ids of section 9, and for the rows that hold exclusive states the `<row>.<letter>` scenarios. `ctx` carries the seed (`DONE`, `STUDENT` and the frozen data from `test/fixtures/real`) and forced-state helpers (`forceSlowSearch`, `forceNoResult`, `forceSearchError`, `forceLoadFailure`, `forceLinkError(kind)`, `forceSavedProgramRemoved`, `forceStorageBlocked`).
- `visit()` (Task 0) gains the fixture options the sweep needs, because today it rejects every clipboard write, marks both tours seen, seeds storage and stubs `print` (`helpers.mjs:66, 90-97`): `{ clipboard: 'fail' | 'ok', tour: 'seen' | 'fresh', storage: 'seeded' | 'blocked-before-init', print: 'stub' | 'real' }`.
- An `absent` entry (rows marked removed: B02, M12, K05, W09, E11's labels, the Y rows marked removed) asserts the **exact** obsolete wrapper or text is missing, never a broad selector; a retained control (the theme button, the tour replay, the edit page's feet, `.me-foot` on the edit page) has its own positive scenario.

- [ ] **Step 1: Write the failing tests.**
  - `inventory-sync.test.mjs` → `every row id and every <row>.<letter> scenario of section 9 of this plan has an entry in INVENTORY, and every entry names a row or scenario` (it parses the tables and the 9.12 tokens of the plan file; plan and manifest stay one list).
  - `old-markup.test.mjs` → `no removed id, class, function or string is left in web/`: the Step 2 list of Task 12 (scoped: `#me .me-foot`, `#courses .me-foot`, `#prefs .me-foot`, never `.me-foot` globally; `a[data-view]`, not the body attribute), `designOn`, `toolName`, `?design`, `data-design`, `afeka-sched-v1-design`, `.mode-menu`, `.mode-link`; and a scan of all strings in `web/*.js` and `web/*.html` for `שלב [0-9]`, `צעד [0-9]`, `הבא:`, `ארבעה שלבים`, `ארבעת השלבים`, `שלבים 1 עד 4`, `סרגל השלבים`, `לשונית לכל שלב`.
  - `replacement.sweep.mjs` → for **every** non-absent, non-browser-owned scenario, at 375 and 1280, light and dark (WebKit; a Chromium run adds CSS coverage), with the forced-state recipe of 9.12: (a) `open` reaches the scenario; (b) **painted-colour audit** (below); (c) **component appearance assertions** (below); (d) no horizontal overflow and `axe` clean; (e) **tap targets** (below); (f) one screenshot, `.superpowers/sessions/design-a/proof/<scenario>-<width>-<theme>.png`.
  - Routes: R01-R13 by URL in each mode they belong to (a hash decides the mode; the record opened over improve mode is a separate in-memory overlay scenario, not a URL); unknown hashes and a direct `#week`; backup links with and without saved state; `legal.html` and each of its five sections by URL; the link-error and recovery sources of C08 selectively failed (9.12), not only the fatal loader.
  - **Print:** call the advisor print action with `window.print` stubbed (`print: 'stub'`), assert `#print` is populated and `html.print-summary` is set, then `page.emulateMedia({ media: 'print' })` and assert only `#print` is visible; the multi-page check uses Chromium `page.pdf()` (O05.d). Opening the advisor panel alone does not fill `#print`, so emulation without the action proves nothing.
- [ ] **Painted-colour audit (definition).** Normalize computed colours (alpha included) and check only **painted** values: `color` of elements with text, `background-color` and `background-image` gradients (their stops), `border-*-color` only where the width is above 0 and the style is not `none`, `outline-color`, `box-shadow` colours, SVG `fill` and `stroke`, and `::before` / `::after` content boxes. Allowed: the A token values of that theme, the course tint set, `transparent`, tokens through `currentColor`, and these explicit exceptions: imported-file thumbnails and the OCR canvas (document colours, white page), the tour's dimming overlay (configured in `tour.js`), print (black on white), the brand pixels of `icon.svg` and `og.png` (checked by eye). Browser-owned controls (9.13) are skipped.
- [ ] **Component appearance assertions.** A colour audit alone passes a dialog with an old radius. For each component family (`.btn`, `.dlg`, `.drawer`, `.pop`, `.toast`, `.dock`, `.me-card`, `.fe`, `.pmap`, `.banner`, `.notice`, `.msg`, `.tile`, the week `.blk`) assert the computed `border-radius`, `border-width`, `box-shadow` and `font-family` equal the A tokens' values. The proof also requires a **human visual review** of the per-area contact sheets by the manager or the owner; the report says so.
- [ ] **Tap-target definition.** Measure the effective clickable surface: for a checkbox or radio, its `<label>` (or the label-wrapped box), not the raw input; under `pointer:coarse` emulation (`hasTouch`), where `--tap` is 44px. Desktop's `--tap:36px` under `pointer:fine` (`style.css:149`) is intentional and is not asserted at 44. The map's zoom-scaled SVG hit circles (`map-render.js:131`, `ui-map.js:261`) are excluded from the 44px rule because the list view is their accessible equal; X14.l checks that the list view is reachable. Any CSS or map change needed to meet 44px on the other surfaces is budgeted inside Tasks 3 and 9.
- [ ] **Step 2:** Run the sweep. Expected: FAIL on whatever is still in the old style (a missing manifest entry, a grey that is not an A token, a dialog on the old radius). Fix each in the stylesheet or the renderer, not in the test.
- [ ] **Step 3: Unused CSS (a report, not an oracle).** `scripts/css-unused.mjs` runs the sweep in Chromium with `page.coverage.startCSSCoverage()`, **aggregated across all navigations**, at widths 320 / 359 / 374 / 599 / 759 / 1079 / 1080 / 1280, with print, reduced-motion and landscape emulations and forced `:hover`, `:focus-visible`, `:active` and `:disabled` states (CDP `CSS.forcePseudoState`) on the component families. It classifies rule families first: element rules, `@media` rules by condition, `@font-face` and `@keyframes` (matched by use, not by selector), and documented browser fallbacks (the Safari popover polyfill selectors, `style.css:1714`), which Chromium can never match. Each unmatched rule is deleted or named in `css-unused.allow.json` with a reason. Coverage cannot show that a **matched but overridden** classic rule was removed: that is the job of Task 12's disposition list and `old-markup.test.mjs`.
- [ ] **Step 4: Proof.** Write `.superpowers/sessions/design-a/proof/INDEX.md` (private): one row per scenario with its screenshot names and the check results; a contact sheet per area (`montage`). The report to the manager carries the counts: rows, scenarios, screenshots, painted-colour violations (0), component-appearance violations (0), unused rules (0 beyond the allowlist), absent items proven absent, strings left (0), browser-owned surfaces listed (9.13).
- [ ] **Step 5:** Commit the manifest, the tests, the runner change and the allowlist: `test: prove that every screen of the site is in the A look`.

## 6. Tests

**Change (Tasks 0, 7, 11):** `helpers.mjs` (`openStep`, `openFriends`, `visit` options); `flows.spec.mjs` (5 step-bar clicks now; the step-bar assertions at the flip); `edit-shell.spec.mjs` ("no step bar", "mode label", first-entry tiles); `tour.spec.mjs` (stops, the replay, the "plans waits" rule); `scripts/readme-shots.mjs`. **Most** other specs keep their selectors because A keeps the ids, `data-act`, `data-chg`, `data-ed` and `data-k` hooks, but some assertions are bound to the old presentation (section 1, last bullet): the Task 0 inventory lists them and decides each one before Task 2.

**New:**
- Unit: `design-a-css.test.mjs` (scope guard), `design-contrast.test.mjs` (token pairs, both themes), `shell-panels.test.mjs` (route to tool mapping, empty and wildcard cases).
- Browser (each passes `{ design: 'a' }` explicitly, so CI runs them as written): `design-switch.spec.mjs`, `shell-a.spec.mjs`, `a11y-a.spec.mjs` (axe, overflow, 44px, focus ring; every tool and dialog; 320 / 375 / 1280 and landscape; light and dark), `edit-a.spec.mjs`, `compat-a.spec.mjs`.
- Final gate (Task 13): `inventory-sync.test.mjs` and `old-markup.test.mjs` (unit, in `npm test`), `replacement.sweep.mjs` (WebKit, plus a Chromium run for CSS coverage; local, `npm run test:sweep`) and `scripts/css-unused.mjs` (`npm run check:css`). The sweep is a one-time proof and a repeatable check, not part of CI.
- Parameterized, not duplicated: the 8 edit specs, `tour.spec.mjs`, the advisor tests of `flows.spec.mjs` and `pdf.spec.mjs` re-run locally with `DESIGN=a` before the flip (CI cannot run them under A before Task 11 without a second invocation; adding one is a minutes decision, section 7).

**Keyboard and motion:** Tab order (top bar, board bar, dock, panel); Escape closes a phone sheet and returns focus to its opener; arrow keys switch alternatives in build mode only; visible focus ring in both themes; `prefers-reduced-motion` removes the sheet slide (`visit()` sets `reducedMotion: 'reduce'`; one spec turns it on to check the animation is only under `no-preference`).

**Local runs:** focused spec per task (`npm run test:browser -- <name>`), WebKit first; the full suite once before each merge (the owner's usage rule); Chromium for the A specs before each push so a failure mail does not surprise the owner.

## 7. CI and minutes (#46)

- #46 ("החלטה: דקות ה-CI של הריצה הלילית") is the **GitLab nightly scrape** (400 min/month, about 510 needed). UI work does not touch `ci/` or the scraper, so it adds nothing there.
- The browser checks run on **GitHub Actions** (`.github/workflows/browser.yml`): on every push to `main` that touches `web/**`, `test/browser/**` or `test/fixtures/real/**`, as three parallel jobs (webkit, chromium, firefox). The last six runs took 6 to 12 minutes each, so one push is roughly 20 to 35 job-minutes. Actions on this public repository are not metered, but each failure mails the owner.
- Plan: **at most five pushes** (Tasks 0-1; 2-6; 7-10; 11; 12-13 together after the grace period), everything behind the switch until the flip, each verified locally first. The Task 13 sweep (about 170 items × 4 combinations) runs only locally: its `.sweep.mjs` suffix keeps it out of `run.mjs` discovery and out of CI. The A specs stay small (each under about three minutes) and set their design explicitly. Until the flip CI tests classic plus the A-only specs; the reruns of existing specs under A are local. If the owner wants those reruns in CI too, that is a second `run.mjs` invocation per engine (roughly doubling the browser minutes for those pushes) and a `browser.yml` edit, not part of this plan unless asked.

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
11. **A state with no recipe.** Some rows of section 9 are hard to reach (a stale proposal, a broken backup link, a failed share). Each needs a forced-state recipe in the manifest; a row with no recipe fails the sweep and is fixed, not skipped.
12. **The palette audit can be too strict or too loose.** Course tints, the dimmed tour page and print are special cases; the allowed set is written once, in the sweep, and reviewed with the first run.
13. **The tests are the biggest cost.** The inventory (Task 0) may show that many more assertions than the 8 step-bar lines encode the old layout; its size decides the real effort of Tasks 7 and 11 (and, with the 177-row manifest, of Task 13).

## 9. Full-replacement inventory (checklist)

The owner's instruction (2026-11-21, verbatim): "אני רוצה החלפה מלאה על כל מסכי האתר לא לפספס כלום". This section is the checklist that makes it checkable. It was taken from the code at `cfd184a` (`web/*.html`, `web/*.js`, `web/style.css`, `web/map.css`), not from memory. **Every row gets a new A screen, panel, dialog or style before Task 13 can pass, and every row is one screenshot in the proof (a row marked removed is proven absent instead).** A row's id is its key in the Task 13 manifest (`test/browser/inventory.mjs`). A row whose destination has no natural place in A carries a question number (Q1, Q2, Q8 and Q11 to Q16 in the owner summary) and is still built, in the way the recommendation says.

Legend of destinations: **board** = the always-visible week; **tool: X** = the panel for tool X (phone sheet / wide column); **dialog** = a modal `<dialog>`; **strip** = the status strip under the top bar; **page** = a standalone page (`legal.html`). "Restyle" = the live renderer is reused and only the A CSS changes; "new" = new A markup.

### 9.1 Documents, routes, titles, brand

| Id | Live item (source) | In A |
|---|---|---|
| D01 | `index.html`, the one app page (header, step bar, `#notice`, `#layout`, four pages, `.scrim`, footer, `#print`, `#drawer`, `#friendEd`, `#pop`, `#toast`) | New frame (Task 2, baked in at Task 11) |
| D02 | `legal.html`, the one other page: title, `#terms`, `#scope`, `#privacy`, `#accessibility`, `#contact`, its inline `<style>`, its in-page nav, "חזרה" link to `./`, updated line | **page**: A palette, type and top bar through `design.js` and `design-a.css`; its inline `<style>` block is removed (Q14 on its header) |
| D03 | Document titles: `PAGE_NAME` (`ui-text.js:321`), the gate title "התחלה" (`ui-plan.js:36`), the legal title | Same strings, no step numbers in them |
| D04 | Brand assets: `icon.svg` (favicon and header mark), `og.png` and the `og:*` meta, `meta theme-color` values written by `theme.js` (`#FFFFFF`, `#0F1627`), `color-scheme`, Rubik preload | Recoloured to the A palette at Task 11, files named: `icon.svg` (literal blue and white), the brand-mark pseudo-element in `style.css:306`, the two `theme-color` values in `theme.js:17`, `og.png`. Their pixels are checked by eye in the proof (a DOM audit cannot read them). Q15 |
| R01 | Route `''` / `#` (plans) | board; wide: tool `courses` or `me` |
| R02 | `#me` | tool `me` |
| R03 | `#courses` | tool `courses` |
| R04 | `#prefs` | tool `wishes` (+ link chip to friends) |
| R05 | `#friends` (new) | tool `friends` |
| R06 | `#out` (new) | tool `out` |
| R07 | `#edit` | improve mode, edit step 1 |
| R08 | `#edit/changes` | improve mode, edit step 2 (+ its fallbacks) |
| R09 | `#edit/<other>` | improve mode, edit step 1 |
| R10 | `#f=<payload>` | board + friend banner (G05) |
| R11 | `#b=<payload>` | backup-restore dialog (X05) **when saved state exists**; with none it restores at once (`app.js:783`); then the board |
| R12 | empty `#f=` / `#b=` | board (plans), nothing read |
| R13 | Any other hash, including a direct `#week` (the skip link `href="#week"` is intercepted by `data-act="skip"`, `app.js:583`, `ui-actions.js:167`) | board (plans) |

### 9.2 First visit, gate and tour

| Id | Live item (source) | In A |
|---|---|---|
| B01 | Terms gate (`termsHtml` at `ui-me.js:184`, called from `gateHtml` at `:194`; tick `termsTick`; `acceptTerms`) | Terms card over the empty ghost board |
| B02 | Mode choice, two tiles (`renderModeChoice`, `ui-mode.js:31`) | **Replaced** by the two top tabs; no screen remains (decision 2026-11-09 superseded) |
| B03 | Track question: intro line, "שאלה 1 מתוך 2", program tiles (`gateHtml`) | tool `me`, one question per screen, one column |
| B04 | Year question: "מסלול: …" + "שינוי", year tiles, hint (`gateHtml`) | same |
| B05 | Entry screen: "איך מסמנים מה עברתם?", import or manual (predicate `entryScreen` at `ui-me.js:223`, renderer branch at `:313`) | tool `me`, first visit |
| B06 | Edit-route gate: terms only, identity asked inside the edit loader (`#editIdentity`) | improve mode, same behaviour |
| B07 | A backup link waiting for the terms (`app.pendingBackup`, `applyPendingBackup`) | same, after B01 |
| B08 | Tour "intro": 8 stops (`TOUR_INTRO`) | New stops on tabs, dock, board bar, ☰ (Task 6) |
| B09 | Tour "plans": 4 stops (`TOUR_PLANS`) | New stops (Task 6) |
| B10 | Tour popover (Driver.js, `vendor/driver/driver.css` + `style.css` restyle), progress text, buttons, the dimmed page | Restyled with A tokens (the vendor files are not edited) |
| B11 | Tour replay button `#tourBtn` and its hidden-while-gated rule | ☰ item |
| B12 | Retake-note dialog, once per failed course (`retakeNote`, `ui-plan.js:56`) | dialog X06 |
| B13 | Loading skeleton `SKELETON` (`app.js:587`) | board skeleton in A |
| B14 | Load-failed message with "נסה שוב" in `week`, `me`, `side`, `prefs`, `edit` (`app.js:708`) | board error state; dock locked; new containers covered |
| B15 | Cohort without data: "אין עדיין נתונים למחזור…" (`ui-me.js:177`) and the substitute-cohort note | tool `me` |
| B16 | `firstVisit` redirect to `#me` (`ui-plan.js:22`) | same, opens tool `me` |

### 9.3 Chrome that is always there

| Id | Live item (source) | In A |
|---|---|---|
| C01 | Skip link "דלג לתוכן הראשי" | Skip link to the board |
| C02 | Top bar: `#title` with semester, year, program; `#meta` freshness and approval line | Top bar brand line + strip |
| C03 | Alternative switcher `#switcher` (`#prev`, `#altLabel`, `#next`) | Board bar |
| C04 | ☰ button and its modal side sheet (`menuPanel`) | ☰ sheet: info, map, tour, theme, erase |
| C05 | `.actions`: map, registration list, advisor summary, share | Map: tool `me` + ☰ + board toolbar; registration and advisor: tool `out`; share: board toolbar |
| C06 | Step bar: four numbered anchors, current / done states, `#tourBtn`, `.theme-btn` | **Removed:** the step anchors, number badges and "done" state. **Retained and relocated:** the theme button (top bar) and the tour replay (☰). Replaced by the dock (phone) / tool tabs (wide) (Q1 on the order) |
| C07 | `#notice`: remote notice, failed save (+ backup button), other tab (+ reload) | strip under the top bar |
| C08 | `#banner`: hash error (+ dismiss), turn warning, vanished pin (+ remove), friend landing (+ add, not now) | banners above the board |
| C09 | Footer: disclaimer, legal links, report link, counselling link (`site-foot`) | strip line + tool `info` (Q8) |
| C10 | Toast `#toast` (`role=status`) and its 26 call sites (9.9) | A toast above the dock |
| C11 | Scrim for the drawer and the sheets | A scrim |
| C12 | `#print` section and `@media print` (advisor summary) | print view (Q12) |
| C13 | Live regions `#live`, `#gradeMsg`, `.pm-live`, `aria-live` notes | unchanged; kept in the A frame |
| C14 | Focus ring, hover, pressed and disabled states, `::backdrop`, `prefers-reduced-motion` rules | A tokens and rules |

### 9.4 My record (build mode, tool `me`)

| Id | Live item (source) | In A |
|---|---|---|
| M01 | Profile card: program, track, year, start year (`identityPick`, failed change + retry via `switchTo`) | restyle |
| M02 | English level (`amirnet`), registration turn (`turnPick`), summer checkbox | restyle |
| M03 | Specialization form (`specForm`, `specMode`, `specPick`) | restyle |
| M04 | Outside-program courses list (`outsideDone`, `outsideBox`) | restyle |
| M05 | Conflict and approval notes (`conflictsFor`, `approvedText`, unverified line) | restyle |
| M06 | Progress card: bar with 70% mark, goal line, degree checklist (`checklist`), average line | restyle |
| M07 | Record warnings (`regWarnHtml`, `renderRecordRegWarnings`) | restyle |
| M08 | Grade-sheet import button + status line (`gradeImport`, `#gradeMsg`) | restyle |
| M09 | Years: per-year heading, "all of year X" button, course chips with passed / failed / grade / fail count / earlier failure (`yearPassed`, `status`, `grade`, `failCount`, `failedBefore`) | restyle |
| M10 | "שנים מתקדמות וקורסים נוספים" and "התמחויות אחרות" collapsed sections (`details`) | restyle |
| M11 | "הנתונים שלי": privacy link, erase button | restyle |
| M12 | The "step line" and the foot button "הבא: קורסים" (`me-step`, `statusDone`) | **removed** (section 2.5 item 1) |

### 9.5 Courses, wishes, friends (build mode)

| Id | Live item (source) | In A |
|---|---|---|
| K01 | Courses page: heading, busy indicator, summary line (`coursesSummary`) | tool `courses` |
| K02 | Course cards: status radios, semester pick, credits, unlock count, eligibility reasons (`renderSide`) | restyle |
| K03 | Locked sections: blocked, not offered, exempt (English score), English levels (`details`) | restyle |
| K04 | Specialization course lists | restyle |
| K05 | Foot "הבא: מה חשוב לי" | **removed** |
| W01 | "תכנון": scope and load split | tool `wishes` |
| W02 | Weights (4 levels × 6), "מה חשוב לך?" | restyle |
| W03 | Days off (`dayOff`, `daypill`, `dayHard`), hours (`notBefore`, `notAfter`, `winHard`) | restyle |
| W04 | Busy time rows, add, remove (`blk*`, max 12) | restyle |
| W05 | "עוד אפשרויות": credit cap, max days, exams rule, full groups, split option | restyle |
| W06 | Lecturer preferences (prefer / avoid chips; `lecturerDrop`) | restyle |
| W07 | "נעיצות": count, clear all | restyle |
| W08 | Reset button and the footer "העתק קישור גיבוי מלא" | restyle |
| W09 | Foot "הבא: מערכות" | **removed** |
| G01 | "הוספת חבר": link form (`addFriendForm`), error line | tool `friends` |
| G02 | "החברים שלי": list, importance, show / hide, edit, remove, 20 max (`fw`, `factive`) | restyle |
| G03 | "הקישור שלי": name, copy, share (`myName`, `share`, `shareOut`) | restyle |
| G04 | Open the friend editor (`openFriendEditor`) | button |
| G05 | Friend landing banner (`landingAdd`, `landingDrop`) | banner |

### 9.6 The board (plans) and the lesson popover

| Id | Live item (source) | In A |
|---|---|---|
| P01 | Semester and scope controls (`#semtabs`, `bscope`, `sem`) | board bar |
| P02 | Notes: semester fallback, summer note, "defaults changed" with `prefsOk` / `prefsUndo`, "only in ב" notes, missing-course note | board notes |
| P03 | Sort select "הצג לפי" and its hint (`#showby`) | board bar |
| P04 | Summary pills (`#pills`): credits, days, gaps, friends, exams | board bar |
| P05 | Disclaimer line (`#disclaimer`) and the board note (`#boardNote`: freshness, rules unapproved, warned courses) | strip + board |
| P06 | Day chips with "פנוי" (`#daysel`, `renderDaySelector`) | board (Q2 on one-day vs five-day) |
| P07 | The week: day headers, hours, blocks (pin mark, friend badges with full-name and "+N" titles, repeat colour, short blocks), busy blocks, landscape full week (`renderWeek`; the full-group and split tags are not drawn on the block, they appear in the popover, the registration list and the notes) | board |
| P08 | Alternative-1 comparison, unlock summary, left-out line (`compareAlts`, `leftOutText`) | board |
| P09 | Cap preview with "החל תקרה…" (`capLine`, `capProbe`, `capApply`) | board |
| P10 | Partial-search notice with "חפש עוד" (`more`) | board |
| P11 | Outside-hours notice with its link | board |
| P12 | State: computing (`#busy` "מחשב…") | board |
| P13 | State: no courses chosen yet (with links to record and courses) | board |
| P14 | State: no result, "החיפוש לא הספיק", diagnosis list, prerequisites line, actions (open wishes, clear pins) | board |
| P15 | State: search error (`ui.runError`) | board |
| P16 | Lesson popover `#pop`: header, pin, catalog link, full tag, lecturer, meetings, exams, friends, group number, report link, other groups, prefer / avoid (`openPop`; a bottom sheet up to 599px) | stays `#pop`, restyled (Q16) |
| P17 | Vanished-pin and stale-pin banners | banner |
| P18 | Alternatives column (new in A), mini weeks | new (Task 4) |
| P19 | Share button (header) and share link copy / WhatsApp / "אין עדיין מערכת לשתף" | board toolbar + tool `friends` |

### 9.7 Take-out (drawer panels) and the ☰ menu

| Id | Live item (source) | In A |
|---|---|---|
| O01 | Registration list panel: courses with groups, equivalents, backups, availability time, split approval notes, exams list, catalog links, copy | tool `out` |
| O02 | Calendar `.ics` button and its states ("לא זמין" with reason) | tool `out` |
| O03 | Backup link button (`backup`) | tool `out` + `wishes` foot |
| O04 | Advisor summary panel: preview, copy, print, PDF button, PDF notes (preparing, failed, missing characters), the Google-app note | tool `out` |
| O05 | Advisor print view `#print` and `@media print` | print view (Q12) |
| O06 | Share-sheet and download flows (`advisorPdfAct`, `shareOut`) | same acts |
| O07 | "עוד אין מערכת" empty panels | tool `out` empty state |
| O08 | ☰ side sheet | ☰ sheet |

### 9.8 Edit (improve) mode

| Id | Live item (source) | In A |
|---|---|---|
| E01 | Edit step 1, no schedule yet: head, identity question `#editIdentity`, ways to load (file, by hand), Yedion hint | improve mode |
| E02 | Edit step 1, review rows "לבדיקה" (`reviewRowHtml`) | improve mode |
| E03 | Edit step 1, loaded: "already registered" check, loaded line, "טעינה מחדש" details | improve mode |
| E04 | Edit step 1, data changed: "המערכת נשמרה מול נתונים אחרים", snapshot, restore | improve mode |
| E05 | Edit step 2, no baseline fallback to step 1 | improve mode |
| E06 | Edit step 2: goals row (`goalsHtml`), pending changes with undo chips (`changesHtml`), split option | improve mode |
| E07 | Edit step 2: blocked lines, parallel-course prompts (`parallelPrompts`, confirm X09) | improve mode |
| E08 | Edit step 2: results: proposal switcher, gains and costs, changed / added / removed, "היה כאן" marks, seats note, save, copy changes, restore original | improve mode |
| E09 | Edit step 2: no proposal, diagnosis, "אם X יזוז" offer, timeout note | improve mode |
| E10 | Edit step 2: the week with marks, `#editDays`, lesson menu in `#pop` (`openLessonMenu`) | improve mode |
| E11 | Edit mode label and the "step N of 2" lines | **removed** (2.5 items 2 and 6). The edit page's own foot controls ("הבא: שינויים", "חזרה לצעד 1", "חפש הצעות") are **retained with A labels** (Y04, Y06) and have positive scenarios |
| E12 | Edit errors: `#edMsg`, `#edWaysMsg`, stale result message | improve mode |

### 9.9 Dialogs, sheets and toasts

**Modal dialogs.** The three generic types are `.dlg` confirm (`askConfirm`), `.dlg-rows` (`askRows`) and text (`showText`) in `ui-dialog.js`; the three large ones are `#drawer`, `#friendEd` and `#pmap`.

| Id | Live item (source) | In A |
|---|---|---|
| X01 | Confirm type (`askConfirm`) | dialog, A style |
| X02 | Rows type, grade-import review (`askRows`, `ui-me.js:393`) | dialog |
| X03 | Text type, "copy failed, copy by hand" (`showText`, `ui-common.js:192`) | dialog |
| X04 | Erase-all confirm (`ui-actions.js:364`) | dialog |
| X05 | Restore-backup confirm (`app.js:785`) | dialog |
| X06 | Retake note (`ui-plan.js:61`) | dialog |
| X07 | Reset-preferences confirm (`ui-actions.js:384`) | dialog |
| X08 | Split-option warning (`ui-actions.js:618`) | dialog |
| X09 | Remove parallel course (`ui-edit.js:606`) | dialog |
| X10 | Friend duplicate: replace or add (`ui-actions.js:60`, `ui-friend-editor.js:583`) | dialog |
| X11 | Close the friend editor without saving (`ui-friend-editor.js:598`) | dialog |
| X12 | `#drawer` as a modal sheet (reg, advisor, ☰) | A sheet (tool `out`, ☰) |
| X13 | `#friendEd`: header and name, tabs (groups, week), picker with semester, search and group list, import with text, file, status and the scan page picker (at most 12 pages per scan, chosen from up to 80 thumbnails), the week tab with overlap bar, errors, full-screen layout `dlg-full` | dialog, full screen (Q13) |
| X14 | `#pmap`: header with credits, mode filters, zoom, fit, abbreviations, view switch, legend, alternative switcher, mini schedule, course card, list view, empty message, "טוען מפה…", failure notice (`ui-map.js`, `map-render.js`, `map.css`) | dialog, full screen (Q13) |

**Toasts, 26 call sites** (the A toast sits above the dock; each message is one row):

| Id | Live item (source) | In A |
|---|---|---|
| T01 | Friend add error text (`ui-actions.js:66`) | toast |
| T02 | Friend added or replaced from a link (`addFriend`, `:73`) | toast |
| T03 | Friend saved from the manual editor (`saveManualFriend`, `:81`) | toast |
| T04 | "אין עדיין מערכת לשתף" from share (`:90`) | toast |
| T05 | The same from share-out (`:96`) | toast |
| T06 | Split-group pins undone (`:114`) | toast |
| T07 | Lecturer preferred, avoided or cleared (`:236`) | toast |
| T08 | Pin set or removed (`:262`) | toast |
| T09 | Calendar file downloaded (`:275`) | toast |
| T10 | Preferences reset (`:393`) | toast |
| T11 | "לא לפני" must be earlier than "לא אחרי" (`:408`) | toast |
| T12 | Program switch failed, nothing changed (`:442`) | toast |
| T13 | Switched program and year (`:454`) | toast |
| T14 | Course pins undone (`:490`) | toast |
| T15 | Field error from a change handler (`:535`) | toast |
| T16 | Summer added to the plan (`:565`) | toast |
| T17 | Grade out of range (`:571`) | toast |
| T18 | Advisor share failed (`ui-advisor-pdf.js:91`) | toast |
| T19 | Advisor file downloaded (`ui-advisor-pdf.js:100`) | toast |
| T20 | Copy done (`ui-common.js:190`) | toast |
| T21 | Edit swap cancelled (`ui-edit.js:367`) | toast |
| T22 | Proposal saved, two texts (`ui-edit.js:729`) | toast |
| T23 | Original restored (`ui-edit.js:742`) | toast |
| T24 | Grades updated, one or many (`ui-me.js:407`) | toast |
| T25 | Search finished, variants (`ui-search.js:54`) | toast |
| T26 | "הבדיקה לא הצליחה" (`ui-search.js:130`) | toast |

### 9.10 Copy that names the old layout

These 20 places say "שלב N", "צעד", "הבא:", "ארבעה שלבים", "שלבים 1 עד 4", "סרגל השלבים" or "לשונית לכל שלב" and must change with the layout. Under A they use the tool's name ("מה חשוב לי", "המצב שלי") through one helper, `toolName(key)`; classic keeps its wording until Task 12 removes the helper. Task 13 scans all strings for "שלב [0-9]", "צעד [0-9]", "הבא:" and "ארבעה שלבים" and fails on any left.

| Id | Live string (source) | In A |
|---|---|---|
| Y01 | "ארבעה שלבים, מימין לשמאל…" tour stop (`tour.js:25`) | new stop text |
| Y02 | "הבא: מערכות" foot of the wishes page (`ui-drawer.js:273`) | removed (W09) |
| Y03 | "צעד 1 מתוך 2" (`ui-edit.js:76`) | removed |
| Y04 | "הבא: שינויים" button (`ui-edit.js:99`) | A label (improve step control) |
| Y05 | "צעד 2 מתוך 2" (`ui-edit.js:400`) | removed |
| Y06 | "חזרה לצעד 1" (`ui-edit.js:407`) | A label ("חזרה למערכת שלי") |
| Y07 | "חזרו לשלב 1" (`ui-edit.js:476`) | A text with the tool's name |
| Y08 | "צעד ראשון: … ״הבא: קורסים״" (`ui-me.js:281`) | removed or the first-run card (Q1) |
| Y09 | "צעד ראשון: סמנו מה כבר עברתם…" entry screen (`ui-me.js:314`) | A text |
| Y10 | "הבא: קורסים" foot of the record page (`ui-me.js:344`) | removed (M12) |
| Y11 | "ארבעה צעדים עד למערכת מוכנה" mode tile (`ui-mode.js:34`) | removed with the tile (B02) |
| Y12 | "הפרטים בשלב 4" (`ui-side.js:161`) | A text with the tool's name |
| Y13 | "פרטים בשלב 1" (`ui-view.js:116`) | A text with the tool's name |
| Y14 | "בשלב 3" friends hint (`ui-view.js:287`) | A text with the tool's name |
| Y15 | "…ב<a>שלב 2</a>" no-courses message (`ui-view.js:315`) | A text with the tool's name |
| Y16 | Step bar labels "שלב 1" to "שלב 4" with number badges (`index.html:62-65`) | removed with the bar (C06) |
| Y17 | "הבא: מה חשוב לי" foot of the courses page (`index.html:101`) | removed (K05) |
| Y18 | "שלבים 1 עד 4" in the accessibility statement's list of screens (`legal.html:154`) | A text, in step with Task 11's accessibility update |
| Y19 | "ארבעת השלבים" and "סרגל השלבים" in the keyboard paragraph (`legal.html:159`) | A text |
| Y20 | "כותרת לשונית לכל שלב" (`legal.html:163`) | A text |

### 9.11 Questions for the owner that come out of the inventory

Already asked: Q1 (the numbered steps and their "done" marks: C06, B02, M12), Q2 (one-day phone week: P06), Q8 (footer links: C09), Q11 (the prototype's improve-mode extras). New from this inventory: **Q12** the print summary (C12, O05); **Q13** the map and the friend editor as full-screen dialogs (X13, X14); **Q14** the header of the legal page (D02); **Q15** the brand mark, `og.png` and the browser theme colour (D04); **Q16** the lesson popover (P16). Each has a recommendation in the Hebrew summary.

### 9.12 Scenarios: rows that hold mutually exclusive states

One row cannot mean one screenshot when it holds states that never show together (a map that is loading, loaded or failed; a PDF that is preparing, ready or failed). **The unit of proof is the scenario.** A row with no list below is one scenario, named by the row id. A row with a list is proven by *each* of its scenarios, named `<row>.<letter>` (for example `X14.f`), each with its own forced-state recipe, reachability assertion and screenshots. `inventory-sync.test.mjs` parses both the row ids and the `<row>.<letter>` tokens of this section, so the manifest follows this list. The recipes below come from the code at `cfd184a` (evidence cited by Codex pass 3); the implementer re-verifies each recipe against the code in Task 13 and adds any branch found missing.

| Row | Scenarios |
|---|---|
| X14 map | **a** all courses, map; **b** "remaining" filter; **c** "my year" filter; **d** empty (everything passed: `ui-map.js:151`); **e** loading ("טוען מפה…", `:211`); **f** load failure, list view plus notice (`:245`); **g** list view by choice; **h** course card (prerequisites, unlocks, catalog link); **i** legend open; **j** specialization prompt link; **k** progress area: planned credits, remaining specialization credits, untracked-credit text (`map-render.js:260, 280`); **l** zoomed out to the minimum (hit-target budget); **m** mini schedule with its hover and tap caption; **n** abbreviations on; **o** node titles, focus ring, highlight and dim chains, selection ring |
| O04 advisor (screen) | **a** summary ready; **b** PDF preparing; **c** PDF ready; **d** PDF failed (`ui-advisor-pdf.js:21`); **e** missing-characters note; **f** Google-app (no print button); **g** failed-course and missing-mandatory lists; **h** prerequisite warnings; **i** source conflicts; **j** annual missing courses; **k** split warnings; **l** close-exam warnings; **m** single, year and summer structures |
| O05 print | **a** single semester; **b** year; **c** summer; **d** multi-page PDF (Chromium `page.pdf()`) |
| O01 registration list | **a** single semester; **b** annual plan with a headed section per semester (`ui-drawer.js:162`); **c** an empty semester; **d** exams not published; **e** published, no exams; **f** published with a source note (`:242-250`); **g** equivalents and backups; **h** split tags; **i** availability time |
| O02 / O03 calendar and backup | **a** `.ics` available; **b** `.ics` unavailable with its reason; **c** backup copied; **d** backup too long: the edited schedule is left out and the explanation is shown (`ui-actions.js:295, 302`); **e** copy failure then the text dialog |
| X03 / T20 copy payloads | **a** a link; **b** registration text; **c** advisor text; **d** edit changes (`ui-edit.js:733`); **e** the oversized-backup explanation |
| M03 specialization form | **a** nothing selected; **b** a standalone specialization; **c** one, two and three areas; **d** an incomplete persisted draft; **e** the remaining choices disabled; **f** unverified-rule notice (`ui-me.js:103-141`) |
| M06 progress | **a** year one, no bar; **b** bar with the 70% mark; **c** checklist rows done; **d** enough credits but a mandatory specialization course missing; **e** untracked degree credits (`ui-me.js:146, 151, 305`) |
| M08 / X02 grade import | **a** reading; **b** file too large or too many pages; **c** unreadable; **d** timed out; **e** no courses recognized; **f** rows skipped; **g** already up to date; **h** the profile changed before the review; **i** it changed after; **j** exemptions; **k** contradictory failures unchecked; **l** Apply disabled with nothing checked; **m** done, toast T24 (`grade-import.js:35, 182`, `ui-me.js:360-390`, `ui-dialog.js:114`) |
| M09 / K03 English and outside alternatives | **a** automatically exempt, disabled record rows; **b** an unchecked outside alternative inside a course row (`ui-common.js:204`); **c** English: no score; **d** English: score present; **e** exempt courses (`ui-me.js:52, 77`, `ui-side.js:132, 155`) |
| K01 / K02 / K04 courses | **a** empty "בתכנון"; **b** required-course rejection warning; **c** a dropped must-course explained; **d** conditional and retake badges; **e** summer-pinned courses; **f** single-semester availability; **g** the year-only semester picker; **h** a program with specializations (`ui-side.js:63-169`) |
| P02 / P04 / P13 board messages | **a** adjacent-day and same-day exam warnings; **b** split-alternative warning and course line; **c** progress-rank pill; **d** annual-search caveat; **e** an empty displayed semester; **f** the specialization-specific "no courses" prompt (`ui-view.js:313-410`) |
| G02 / G05 friends | **a** "עוד אין חברים"; **b** a friend with unknown groups; **c** a manual-only friend with its edit button; **d** landing: missing groups; **e** landing: another program; **f** saving a 21st friend is refused (`app.js:327`) |
| X13 friend editor and edit loader | **a** new friend; **b** existing friend; **c** the edit-loader variant: title "המערכת שלי", no name field, summer allowed, unknown rows kept (`ui-friend-editor.js:27, 82, 357, 550`); **d** OCR progress; **e** unreadable image; **f** unreadable PDF; **g** PDF read timed out; **h** invalid xlsx; **i** ambiguous or weak matches; **j** already present or refused groups; **k** unknown courses explained (`ui-text.js:22`); **l** no groups found; **m** zero pages selected; **n** more than 12 pages selected; **o** overlap bar in the week tab |
| E01-E12 edit mode | **E01.a** no schedule, load buttons; **E01.b** identity question open; **E02.a** review rows; **E03.a** loaded, "already registered"; **E03.b** "טעינה מחדש" open; **E04.a** data changed since saving; **E06.a** goals; **E06.b** pending changes with each undo chip (move, swap, add, remove); **E06.c** split option; **E07.a** blocked line; **E07.b** parallel-course prompt; **E08.a** the original with overlap warnings; **E08.b** proposals with the "היה כאן" marks; **E08.c** the original at proposal 0; **E08.d** seats note; **E09.a** no proposal, diagnosis; **E09.b** "אם X יזוז" offer; **E09.c** timeout; **E09.d** no goal or no movable course; **E09.e** a pinned overlap blocks the search; **E09.f** searching; **E09.g** worker failure; **E10.a** the week with marks; **E10.b** lesson menu in `#pop`: loading, empty, failure, other groups, split swap choices (`ui-edit.js:550-584`); **E10.c** "הראה את היום החדש"; **E12.a** `#edMsg` and `#edWaysMsg` errors; **E12.b** stale result (`ui-edit.js:244-492`) |
| C08 / R10 / R11 link and recovery failures | **a** malformed link; **b** unsupported link; **c** link for another semester; **d** failed backup restore; **e** catalog missing; **f** the saved program was removed; **g** the saved cohort was removed or moved; **h** academic-year migration; **i** dismissing the error (`share.js:69-91`, `app.js:246-268, 737, 749`) |
| B08-B10 tour | **a** first stop; **b** a middle stop; **c** last stop; **d** skipped |
| C14 interaction states | **a** hover; **b** keyboard focus; **c** pressed; **d** disabled; **e** native title tooltips are not restyled (9.13) |

### 9.13 Outside the application's CSS

These surfaces are drawn by the browser or the operating system and application CSS cannot restyle them. They are listed so that "nothing in the old style" is read correctly: the native confirm fallbacks when `<dialog>.showModal` is missing (`ui-dialog.js:39, 127`), file pickers, system share sheets, native `title` tooltips, the browser's own scrollbars and form-control popups (the `<select>` list, the time picker), and the print dialog. The sweep skips them and records them in the proof as "browser-owned". Where a control has a styled alternative (a `<select>`), A styles the closed control and nothing more.

## Self-review

- **Coverage of the request:** (1) the map (2.1 to 2.5, 51 `data-act`, 37 `data-chg`, 22 `data-ed` keys and the `data-k` families, 12 route forms, 10 storage keys; checked against the code and corrected after three Codex reviews); (2) stays / rebuilt (3); (3) saved state and links (2.2, 2.3, 4, Task 9); (4) ordered tasks with the switch (5); (5) tests, phone widths, light and dark, keyboard, CI (6, 7); (6) risks and owner questions (Hebrew summary); (7) the owner's full-replacement requirement: the 177-row inventory of section 9, Tasks 12 and 13, and questions 12 to 16.
- **Placeholders:** none. Tasks 0-2 carry the full steps; Tasks 3-13 carry Files, Interfaces, named tests and the verification command, because their final shape depends on how the Task 2 seam behaves.
- **Names:** `designOn`, `routeA`, `stageOf`, `panelOf`, `TOOLS`, `openTool`, `closeTool`, `renderTool`, `routeFocus`, `routeScroll`, `shellInit`, `renderOut`, `renderTools`, `renderAltColumn`, `miniWeekHtml`, `toolName`, `INVENTORY`, `editWeekHtml` / `editToolHtml` are spelled the same wherever they appear.
- **Proportion:** the plan is long because the map is the deliverable; the code in it is signatures and test names only.

## Review record

- Codex pass 1 (high effort, `git`-free read of the code): 36 findings (2 blocker, 22 real, 12 minor). All addressed in this file: the route model (mode, tool), improve mode as a mode, edit containment, the test inventory, focus and scroll ownership, PDF ownership, the year-pair alternatives column, the CI design fixture, and the corrected feature, hook and key inventories.
- Codex pass 2 on the revised file: 21 findings (3 blocker, 10 real, 8 minor). All addressed: improve-mode overlays are in-memory with no hash, stage and overlay visibility are separate decisions, closed routes per mode, `#out` and info routing, `renderTool` on route changes, shared header in improve mode, labelled panel wrappers, no transformed ancestor around the fixed sheet, `routeScroll`, the drawer close listener, the `openStep` mapping, year-export semantics, the edit day selector, and the factual corrections (`applyPendingBackup`, `{program}-{startYear}`, `theme.js`, 4,100 lines, `#semnote`).
- Codex pass 3 (the full-replacement inventory, section 9 and Tasks 12-13): 32 findings (2 blocker, 27 real, 3 minor). All addressed: the unit of proof became the scenario (9.12, about 300 of them), `data-view` is migrated before deletion and only the step anchors are banned, "removed" now means the exact obsolete markup is absent and retained controls have positive scenarios, body-state rules get a disposition list (delete, replace, rewrite), the painted-colour audit and a component-appearance check replace the three-property palette audit, CSS coverage became a report with classified families and an allowlist, the print proof calls the print action and checks a multi-page PDF, tap targets are defined on the effective surface, the fixture options for clipboard, tours, blocked storage and printing were specified, `run.mjs` gets a `--sweep` mode, and rows were corrected (T02 and T03, P07, X13, B01, B02, B05, D01, R11) and added (R13, Y18 to Y20, 9.13 browser-owned surfaces, the brand files in Task 11).
- No fourth pass was run. The raw answers are kept privately under `.superpowers/sessions/reviews/` (`ui-design-a-plan.md`, `-2.md`, `-3.md`; not in git).
