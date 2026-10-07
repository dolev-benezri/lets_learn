# מעבר בין חלופות במפת ההתקדמות + חלונית מוקטנת — תוכנית מימוש

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** אפשר לעבור בין חלופות המערכת מתוך מפת ההתקדמות. בפינת המפה יש חלונית מוקטנת של המערכת השבועית של החלופה הנבחרת, והבחירה היא אותה בחירה כמו בבונה.

**Architecture:**
- ה-HTML של המתג ושל החלונית נבנה בשתי פונקציות טהורות ב-`map-render.js`. החלונית משתמשת שוב ב-`renderWeek`.
- `ui-map.js` מחבר אותן. לחיצה קוראת ל-`showAlt` החדשה ב-`ui-view.js`, שהיא גם הגוף של `go`.
- `renderView` מסתיים בקריאה ל-`ui.onShown`, והמפה משתמשת בה כדי לצייר את עצמה מחדש. זה תופס גם בחירה מהמפה וגם תוצאת חיפוש שמגיעה באמצע.
- ההקטנה וההתאמה לטלפון נעשות ב-CSS בלבד.

**Tech Stack:** ES modules בלי build. `node:test`. ‏`@panzoom/panzoom` 4.6.0 (עותק מקומי, כבר בשימוש).

**Spec:** `docs/superpowers/specs/2026-10-07-map-alternatives-design.md`

## Global Constraints

- ענף `feat/map-alternatives`. מיזוג ל-main רק אחרי אישור הבעלים. לפני push: `git pull --rebase` (ל-main מגיעים commits לילה של `data(afeka)`).
- כל commit מסתיים ב-`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- שום שורה ב-`web/` לא ארוכה מ-200 תווים (`test/line-length.test.mjs`).
- כל טקסט מהנתונים עובר דרך `esc` או `nameHtml`. אין `innerHTML` מנתונים בלי escape (`test/xss.test.mjs`).
- אין שינוי בסולבר, ב-`state` השמור, ב-`normalize`, בקישורים או ב-DOM של הבונה.
- אין תלות חדשה. ממשק בעברית, ‏RTL, בלי אימוג'י.
- טסטים: קודם הקובץ הממוקד (`node --test test/ui-map.test.mjs`), ו-`npm test` המלא פעם אחת לפני מיזוג.
- דפדפן: `python -m http.server` מאפשר ל-Chrome לשמור מודולים ערוכים במטמון. בודקים עם שרת `no-store` (Task 2, Step 1), או מוודאים את מקור המודול שנטען לפני שמסיקים מסקנה.

## Review Focus

1. **חיפוש מסתיים כשהמפה פתוחה:** המתג חוזר לפעול, מוצגת חלופה 1 מתוך המספר החדש, ואין אינדקס ישן. נבדק ב-Task 2, Step 8.
2. **טלפון ברוחב 320:** הכותרת לא נשברת לשתי שורות, ✕ נשאר 44px, והצ'יפ לא חופף ל"קורסי בחירה". נבדק ב-Task 3, Step 4.
3. **לחיצה על בלוק בחלונית לא פותחת את חלונית הקבוצה של הבונה מאחורי המודאל.** נבדק ב-Task 1 (אין `data-act`) וב-Task 2, Step 7 (לחיצה אמיתית).
4. **צבעי הבונה לא משתנים אחרי ציור החלונית.** נבדק ב-Task 1 (`colors` לפני ואחרי זהה).
5. **אחרי החלפה הפוקוס נשאר על כפתור המתג, ו-Escape עדיין סוגר את המפה ומחזיר פוקוס ל"הראה התקדמות".** נבדק ב-Task 2, Step 6.

---

### Task 1: פונקציות HTML טהורות: `altBarHtml`, `miniHtml`, `miniTotals`

**Files:**
- Modify: `web/map-render.js` (ייבוא מ-`ui-grid.js` ו-`ui-text.js`, ושלוש פונקציות חדשות אחרי `progressHtml`)
- Test: `test/ui-map.test.mjs`, `test/xss.test.mjs`

**Interfaces:**
- Produces:
  - `altBarHtml({ k: number, n: number, running: boolean, summer: boolean }) -> string`. כש-`n < 2` מחזירה `''`.
  - `miniTotals(raw, data) -> { courses: number, credits: number }`. בזוג: `yearTotals(raw)`. בסמסטר אחד: מספר הקורסים וסכום `data.courses[c].credits`.
  - `miniHtml({ raw, sem, data, colors, k, open }) -> string`. בלי `raw` או בלי קורסים מחזירה `''`.
    - `sem` הוא `app.sem` (‏`{ 'א', 'ב' }`), ו-`data` הוא `app.data` (משמש רק כש-`raw` אינו זוג).
    - `colors` הוא `Map` שהפונקציה לא משנה.

- [ ] **Step 1: כתוב את הטסטים הנכשלים** (ב-`test/ui-map.test.mjs`. ‏`read(1)` ו-`read(2)` כבר קיימים בקובץ)

```js
import { altBarHtml, miniHtml, miniTotals } from '../web/map-render.js';
const pick = (d) => { const [cid, c] = Object.entries(d.courses).find(([, x]) => x.groups.some((g) => g.meetings.some((m) => m.day >= 1 && m.day <= 5)));
  return { cid, gid: c.groups.find((g) => g.meetings.length).id, cr: c.credits }; };
const half = (x) => ({ courses: [x.cid], groups: [x.gid], exams: [], alts: {}, unlocks: 0, explanation: '', breakdown: { compact: 1, progress: 0 } });
const A = read(1), B = read(2), xa = pick(A), xb = pick(B);
const pair = { a: half(xa), b: half(xb), credits: { a: xa.cr, b: xb.cr }, missing: [], warnings: [] };

test('altBarHtml: hidden under two alternatives, disabled while searching, summer suffix', () => {
  assert.equal(altBarHtml({ k: 0, n: 1, running: false, summer: false }), '');
  const h = altBarHtml({ k: 1, n: 5, running: false, summer: false });
  assert.match(h, /data-pm="alt" data-d="-1"/); assert.match(h, /data-d="1"/); assert.match(h, />2</); assert.match(h, />5</);
  assert.ok(!h.includes('disabled') && !h.includes('data-act'));
  const r = altBarHtml({ k: 0, n: 3, running: true, summer: false });
  assert.equal(r.match(/ disabled/g).length, 2); assert.ok(r.includes('מחפש חלופות…'));
  assert.ok(altBarHtml({ k: 0, n: 2, running: false, summer: true }).includes('קיץ'));
});
test('miniHtml: a year pair draws both semesters, inert, with no board hooks', () => {
  const colors = new Map([[xa.cid, 3]]), before = [...colors];
  const h = miniHtml({ raw: pair, sem: { 'א': A, 'ב': B }, data: A, colors, k: 1, open: true });
  assert.ok(h.includes('סמסטר א׳') && h.includes('סמסטר ב׳') && h.includes(' inert') && h.includes('<details class="pm-mini" open'));
  assert.ok(!/data-act=/.test(h) && !/data-k="b-/.test(h));
  assert.ok(h.includes('חלופה 2'));
  assert.deepEqual([...colors], before); // the board's sticky colours are untouched
});
test('miniHtml: nothing without a result; one grid for a one-semester result', () => {
  assert.equal(miniHtml({ raw: null, sem: {}, data: A, colors: new Map(), k: 0, open: false }), '');
  const h = miniHtml({ raw: half(xa), sem: {}, data: A, colors: new Map(), k: 0, open: false });
  assert.ok(!h.includes('סמסטר א׳') && !h.includes(' open') && h.includes('class="wk"'));
});
test('miniTotals: year pair sums both semesters, a single result sums its credits', () => {
  assert.deepEqual(miniTotals(pair, A), { courses: 2, credits: xa.cr + xb.cr });
  assert.deepEqual(miniTotals(half(xa), A), { courses: 1, credits: xa.cr });
});
```

- [ ] **Step 2: הרץ ווודא שהטסטים נכשלים**

Run: `node --test test/ui-map.test.mjs`
Expected: FAIL. ‏`altBarHtml` / `miniHtml` / `miniTotals` לא מיוצאות.

- [ ] **Step 3: מימוש ב-`web/map-render.js`**

**`altBarHtml`:**
- עטיפה: `<div class="pm-alt" role="group" aria-label="מעבר בין חלופות">`.
- שני כפתורים, `class="pm-ibtn"`, עם התכונות `data-pm="alt"`, `data-d`, ‏`data-k="pm-prev"` / `"pm-next"`, ו-`aria-label` "החלופה הקודמת" / "החלופה הבאה".
- אייקונים: `icon('chevron-right')` לקודמת, `icon('chevron-left')` לבאה.
- בזמן חיפוש: ` disabled` על שני הכפתורים.
- תווית: `<span class="pm-alt-l">`. בזמן חיפוש הטקסט הוא `מחפש חלופות…`. אחרת:
  `<span class="long">חלופה </span><b>${k + 1}</b><span class="long"> מתוך </span><span class="short" aria-hidden="true">/</span><b>${n}</b>`
- בקיץ מוסיפים `<span class="long"> (קיץ)</span>`.

**`miniHtml`:**
- כל רשת: `renderWeek({ data, res, range, colors: copy, dashed: repeatIds(copy, res.courses), pins: [], friends: [], day: 0 })`, כאשר `copy = assignColors(new Map(colors), res.courses)`. עותק לכל סמסטר.
- את ה-HTML של הרשת מעבירים דרך `.replace(/ data-(?:act|k)="[^"]*"/g, '')`, רק את הרשת ולא את העטיפה.
- `range`: ‏`hourRange` על המפגשים של כל הקבוצות, בשני הסמסטרים (`groupIndex(sem['א'] / sem['ב']).get(gid).g.meetings`). בסמסטר אחד: `groupIndex(data)`.
- בזוג: כל רשת בתוך `<figure class="pm-mini-w"><figcaption>סמסטר א׳</figcaption>…</figure>`, עם `semResult(raw, 'א')` ו-`semResult(raw, 'ב')`. סמסטר בלי קבוצות מקבל רשת ריקה עם כותרת.
- עטיפה:
  ```
  <details class="pm-mini"${open ? ' open' : ''}><summary data-k="pm-mini">המערכת הנבחרת</summary>
  <p class="pm-mini-s">חלופה ${k + 1} · ${courseCount(t.courses)} · <bdi>${t.credits}</bdi> נ״ז</p>
  <div class="pm-mini-g" inert>…</div></details>
  ```
- ייבוא נוסף מ-`ui-grid.js`: `renderWeek, hourRange, groupIndex, assignColors, repeatIds, isPair, semResult, resCourses, yearTotals`. מ-`ui-text.js`: `courseCount`.

- [ ] **Step 4: הוסף את החלונית לבדיקת ה-XSS** (`test/xss.test.mjs`)

אחרי `run('map', …)`:
```js
run('map-mini', () => { writes.push({ scope: 'map-mini', id: 'mini', html: miniHtml({ raw: current(), sem: app.sem, data: app.data, colors: new Map(), k: 0, open: true }) }); });
```
- להוסיף `miniHtml` לייבוא מ-`map-render.js`.
- להוסיף `'map-mini'` למערך `scopes` בטסט "every renderer got the payload".

- [ ] **Step 5: הרץ ווודא שהטסטים עוברים**

Run: `node --test test/ui-map.test.mjs test/xss.test.mjs test/line-length.test.mjs`
Expected: PASS, כולל ש-`map-mini` קיבל את ה-payload ואת ה-escape.

- [ ] **Step 6: Commit**

```bash
git add web/map-render.js test/ui-map.test.mjs test/xss.test.mjs
git commit -m "feat(map): markup for the alternative switcher and the mini week pane"
```

---

### Task 2: חיבור: `showAlt`, `ui.onShown`, המתג והחלונית בתוך המפה

**Files:**
- Modify: `web/ui-common.js` (אובייקט `ui`: ‏`onShown: null`, בשורה חדשה)
- Modify: `web/ui-view.js` (`showAlt`, ‏`go`, סוף `renderView`)
- Modify: `web/ui-map.js` (`M`, ‏`render`, ‏`mount`, ‏`onClick`, ‏`openMap`, ‏`setup`)
- Test: `test/xss.test.mjs` (רץ כמו שהוא: מייבא את `ui-view` ואת `ui-map` ב-node)

**Interfaces:**
- Consumes: `altBarHtml`, ‏`miniHtml`, ‏`miniTotals` מ-Task 1.
- Produces:
  - `export function showAlt(k: number): void` ב-`ui-view.js`: ‏`ui.cur = k; keepFocus(renderView)`.
  - `ui.onShown: (() => void) | null`. ‏`renderView` קורא לה בשורה האחרונה, אחרי `scrollToDay()`.

- [ ] **Step 1: שרת בדיקה בלי מטמון**
  - לכתוב `nostore.py` בתיקיית ה-scratchpad: מחלקה שיורשת מ-`SimpleHTTPRequestHandler` ומוסיפה `Cache-Control: no-store` ב-`end_headers`. היא מגישה את `E:/lets_learn/web` בפורט 8143.
  - להוסיף ל-`.claude/launch.json` את `{ "name": "nostore", "runtimeExecutable": "python", "runtimeArgs": ["<scratchpad>/nostore.py"], "port": 8143 }`.
  - Expected: ‏`preview_start nostore` מחזיר 200, ו-`read_network_requests` מראה `cache-control: no-store` על `ui-map.js`.

- [ ] **Step 2: `ui-common.js` + `ui-view.js`**
  - `go(d)` הופך ל-`showAlt((ui.cur + d + n) % n)`. השמירה `n < 2` נשארת.
  - בסוף `renderView`: ‏`ui.onShown?.();`.

- [ ] **Step 3: `ui-map.js`: ייבוא, מצב, ציור**
  - ייבוא: `ui, current, colors` מ-`./ui-common.js`. ‏`showAlt` מ-`./ui-view.js`. ‏`resCourses` מ-`./ui-grid.js`. ‏`summerScope` מ-`./app.js`. ‏`altBarHtml, miniHtml, miniTotals` מ-`./map-render.js`.
  - ל-`M` נוספים `miniOpen: null` ו-`live: null`.
  - עזר בתוך הקובץ: `const alts = () => { const r = ui.last?.results ?? []; return r.some((x) => resCourses(x).length) ? r : []; };`.
  - `render()`:
    - מכניסים `altBarHtml({ k: ui.cur, n: alts().length, running: ui.running, summer: summerScope() })` בין `<h2>` לכפתור הסגירה.
    - בתצוגת מפה כשהיא לא ריקה, אחרי `asideHtml(c)`, מוסיפים:
      `alts().length && current() ? miniHtml({ raw: current(), sem: app.sem, data: app.data, colors, k: ui.cur, open: M.miniOpen ?? matchMedia('(min-width: 900px) and (min-height: 700px)').matches }) : ''`
    - אחרי `innerHTML`: ‏`M.live ??= …` (`<p class="sr" role="status">`), ואז `dlg.appendChild(M.live)`.
  - `openMap`: מאפסים `M.miniOpen = null`. ביצירת הדיאלוג רושמים:
    `dlg.addEventListener('toggle', (e) => { if (e.target.classList?.contains('pm-mini')) M.miniOpen = e.target.open; }, true);`

- [ ] **Step 4: `mount(keep)` שומר זום והזזה**
  - חתימה: `async function mount(keep = null)`. ‏`keep` הוא `{ s, x, y }` או `null`.
  - ב-`setTimeout`:
    - אם יש `keep`: `pz.zoom(keep.s, { animate: false, force: true })`, אחריו `pz.pan(keep.x, keep.y, { animate: false, force: true })` ואז `ends()`.
    - אחרת: `M.fit()`.
  - שאר הקוראים (`openMap`, ‏`redraw`) לא משתנים, ולכן ממשיכים לעשות fit.

- [ ] **Step 5: לחיצה ו-`onShown`**
  - ב-`onClick`:
    `else if (act === 'alt') { const n = alts().length; if (n > 1 && !ui.running) showAlt((ui.cur + Number(b.dataset.d) + n) % n); }`
  - ב-`setup()`:
    ```js
    ui.onShown = () => {
      if (!dlg?.open) return;
      const keep = M.pz ? { s: M.pz.getScale(), ...M.pz.getPan() } : null;
      keepFocus(render); mount(keep);
      const n = alts().length, raw = current();
      if (n > 1 && raw) { const t = miniTotals(raw, app.data); M.live.textContent = `חלופה ${ui.cur + 1} מתוך ${n}, ${courseCount(t.courses)}, ${t.credits} נ״ז`; }
    };
    ```
    ‏`courseCount` מיובא מ-`./ui-text.js`.

- [ ] **Step 6: בדיקה בדפדפן, מחשב** (`nostore`, פרופיל עם שנה ב׳ וחלופות)
  1. פותחים את "המצב שלי", לוחצים "הראה התקדמות", ואחר כך "החלופה הבאה" פעמיים.
     - Expected: התווית מראה 3. טבעות `.plan-ring` ופס `.pm-prog` משתנים (משווים את `textContent` של `.pm-prog-t` לפני ואחרי).
     - Expected: `M.pz.getScale()` נשאר כמו לפני הלחיצה.
     - Expected: `document.activeElement.dataset.k === 'pm-next'`, ו-`M.live` מכיל את התווית.
  2. Escape.
     - Expected: המפה נסגרת, והפוקוס על `[data-k="openMap"]`.
  3. מעבר לבונה (`#`).
     - Expected: ‏`#altLabel` מראה "חלופה 3 מתוך N".

- [ ] **Step 7: בלוק בחלונית לא פותח כלום**
  - קוראים `elementFromPoint` על בלוק בתוך `.pm-mini-g`, ולוחצים עליו דרך `computer left_click`.
  - Expected: אין `#pop:popover-open`, והמפה נשארת פתוחה.

- [ ] **Step 8: מרוץ עם חיפוש**
  - ב-"המצב שלי" משנים סטטוס של קורס ("עברתי"), ותוך פחות משנייה פותחים את המפה.
  - Expected: הכפתורים `disabled` והתווית "מחפש חלופות…".
  - Expected: אחרי שהחיפוש מסתיים, בלי שום פעולה, הכפתורים פעילים, התווית "חלופה 1 מתוך N" החדש, וטבעות התכנון תואמות ל-`app.planIds`.

- [ ] **Step 9: קיץ**
  - מסמנים "אני מתכנן/ת סמסטר קיץ", ובבונה בוחרים היקף "קיץ".
  - Expected: בתווית במפה מופיעה "(קיץ)". מעבר משנה את `app.summerIds`. ‏`state.yearIds` לא משתנה.

- [ ] **Step 10: טסטים ו-commit**

Run: `node --test test/xss.test.mjs test/ui-map.test.mjs test/line-length.test.mjs`
Expected: PASS. אחר כך בקונסול של טאב חדש: אין שגיאות.

```bash
git add web/ui-common.js web/ui-view.js web/ui-map.js
git commit -m "feat(map): switch alternatives from the progress map; the mini pane follows the shown plan"
```

---

### Task 3: CSS, מחשב וטלפון

**Files:**
- Modify: `web/map.css`. החלק החדש בא אחרי בלוק ה-Round 3, ולפני `prefers-reduced-motion`.

**Interfaces:**
- Consumes: המחלקות מ-Task 1: `.pm-alt`, ‏`.pm-alt-l`, ‏`.long`, ‏`.short`, ‏`.pm-mini`, ‏`.pm-mini-s`, ‏`.pm-mini-g`, ‏`.pm-mini-w`.

- [ ] **Step 1: המתג בכותרת**
  - `.pmap .pm-alt { display:flex; align-items:center; gap:4px; margin-inline-start:auto; }`
  - `.pmap .pm-alt + .pm-close { margin-inline-start:8px; }`. הכלל הקיים `.pm-close { margin-inline-start:auto }` דוחף את ✕ לקצה רק כשאין מתג.
  - `.pmap .pm-alt .short { display:none; }`
  - `.pm-alt-l`: ‏`font-size:var(--fs-sm)` ו-`white-space:nowrap`.
  - עד 599px: כפתורי המתג `width:36px; min-height:36px`.
  - עד 359px: ‏`.pmap .pm-alt .long { display:none; }` ו-`.pmap .pm-alt .short { display:inline; }`.

- [ ] **Step 2: החלונית הצפה והרשת המוקטנת**
  - `.pmap .pm-mini`:
    - `position:absolute; inset-block-end:8px; inset-inline-start:8px; z-index:4;`
    - `max-width:min(360px, calc(100% - 16px)); max-height:min(60%, 360px); overflow:auto;`
    - הרקע, הגבול והצל כמו ב-`.pm-aside`, אותם ערכים.
  - `summary`: כמו ב-`.pm-aside summary`.
  - `.pm-mini-g`: ‏`display:flex; gap:6px; padding:0 8px 8px;`.
  - `.pm-mini-w`: ‏`flex:1; min-width:0; margin:0`.
  - `figcaption`: ‏`font-size:var(--fs-xs)`.
  - `.pmap .pm-mini .wk`:
    - `--ppm:.16px; grid-template-columns:0 repeat(var(--cols), minmax(0, 1fr));`
    - הכלל הזה גובר גם על חוק הטלפון ב-`style.css` שמציג עמודת יום אחת.
  - `.pmap .pm-mini .wk-head { display:contents; }` ו-`.pmap .pm-mini .day { display:block; }`. אסור `revert`: הוא מחזיר את `.wk-head` ל-`block` ולא ל-`contents`. הספציפיות (0,3,0) גוברת על כללי הטלפון `.wk-head` ו-`.day:not(.on)`. ‏`renderWeek` מקבל `day: 0`, ולכן אף יום לא מסומן `.on`.
  - `.pmap .pm-mini .wk-head > *`: ‏`position:static; box-shadow:none; padding:2px 0`.
  - `.pmap .pm-mini .dh span { display:none; }`
  - `.pmap .pm-mini .hours { visibility:hidden; }`
  - `.pmap .pm-mini .blk`: ‏`padding:0; border-inline-start-width:2px;`. ‏`.pmap .pm-mini .blk > * { display:none; }`
  - `.pmap .pm-mini .day`: הרקע ‏`repeating-linear-gradient` נשאר. הוא נגזר מ-`--ppm`, כך שקווי השעות מוקטנים ביחד.

- [ ] **Step 3: טלפון (עד 599px)**
  - `.pmap .pm-mini:not([open])`: ‏`max-width:calc(100% - 182px)`. ‏182 = רוחב צ'יפ "קורסי בחירה" (150) + 2×8 + 16.
  - `.pmap .pm-mini[open]`: ‏`inset-inline:0; inset-block-end:0; max-width:none; max-height:50%; border-radius:var(--radius) var(--radius) 0 0;`

- [ ] **Step 4: בדיקה בדפדפן בגדלים** (`resize_window`, ואחריו `location.reload()` אחרי כל שינוי גודל)

| גודל | מה בודקים | Expected |
|---|---|---|
| 375×740 | `.pm-head` | גובה 49 (כמו לפני). ‏`.pm-alt` ו-`.pm-close` באותה שורה. ‏✕ ברוחב 44 |
| 375×740 | `.pm-mini` הסגור מול `.pm-aside` | `getBoundingClientRect` לא חופפים |
| 375×740 | פתיחת `.pm-mini` | הגובה הוא לכל היותר 50% מ-`.pm-view`. גרירה במפה מעל הגיליון מזיזה אותה |
| 375×740 | לחיצה על צומת | `.pm-card` מכסה את החלונית. ‏`clear` מחזיר אותה |
| 320×640 | תווית ומתג | התווית "2/5". ‏`.pm-head` בשורה אחת (גובה 49 לכל היותר). אין חפיפה בין הצ'יפ ל-`.pm-aside` |
| 740×375 | מצב התחלתי | החלונית סגורה כשהמפה נפתחת |
| 1280×800 | מצב התחלתי ומיקום | החלונית פתוחה בפינה הימנית התחתונה. כרטיס קורס מעוגן משמאל ולא חופף לה. בזוג שנתי שתי רשתות זו לצד זו |

- צילום מסך (`scale:0.5`) של 375 ושל 1280, כהוכחה לבעלים.
- בסוף: `resize_window desktop`.

- [ ] **Step 5: Commit**

```bash
git add web/map.css
git commit -m "style(map): alternative switcher in the header, floating mini week pane, phone sheet"
```

---

### Task 4: אימות מלא, ביקורת ומסירה

**Files:**
- Modify: `NOTES.md` (מקומי, לא ב-git), ‏`docs/ISSUES.md` (שורה שמסמנת שהפיצ'ר נוסף), זיכרון: `afeka-scheduler-project.md`

- [ ] **Step 1: כל הסוויטה**

Run: `npm test`
Expected: כל הטסטים עוברים. היום 436, ועוד בערך 4 חדשים.

- [ ] **Step 2: ביקורת ענף**
  - סוקר אחד (opus) על `git diff main...feat/map-alternatives` מול ה-spec וה-Review Focus.
  - כל ממצא מתוקן ב-commit נפרד.

- [ ] **Step 3: מסירה לבעלים**
  - סיכום, שני צילומי המסך, ובקשת אישור למיזוג.
  - אחרי האישור: `git switch main && git pull --rebase && git merge --no-ff feat/map-alternatives && npm test && git push`.
  - אחרי הפריסה: בדיקה באתר החי, טאב חדש, 375 ומחשב.

---

## סבב 2 (spec: "סבב 2")

### Task 5: `courseAbbr` / `uniqueAbbrs`, `miniHtml` עם שורת זיהוי, מקרא וראשי תיבות, `plan-ring` תמיד
- Modify: `web/map-render.js`
- Test: `test/ui-map.test.mjs`, `test/xss.test.mjs`
- Produces:
  - `courseAbbr(name) -> string`
  - `uniqueAbbrs(names[]) -> string[]`
  - `miniHtml({ ..., abbr })` (פרמטר חדש)
- טסטים (RED קודם):
  - `courseAbbr('מבוא למדעי המחשב') === 'מל״ה'`
  - `courseAbbr('פיזיקה 1') === 'פיז 1'`
  - `courseAbbr('סטטיקה') === 'סטט'`
  - בשם באנגלית `ML` בהתאם
  - `uniqueAbbrs` נותן קיצורים שונים לשני שמות עם אותה תוצאה
  - `miniHtml` בלי `<button`, עם `pm-mini-c`, ‏`aria-hidden="true"` ובלי `inert`
  - המקרא עם כל קורס פעם אחת
  - `blk-ab` רק עם `abbr:true`
  - `mapSvg`: לצומת שלא בתכנון יש `plan-ring`
  - XSS עם `abbr:true`

### Task 6: עדכון במקום, הבזק, אינטראקציה בחלונית
- Modify: `web/ui-map.js`, `web/map.css`
- Consumes: Task 5.
- בדיקה בדפדפן, ב-1280 וב-375:
  - אותו `.pm-svg` לפני ואחרי מעבר, ה-transform לא משתנה.
  - `plan` שווה ל-`planIds`.
  - `spot` מופיע ונעלם תוך 2 שניות.
  - ל-`.pm-meter i` יש transition.
  - מעבר עכבר והקשה ממלאים את `.pm-mini-c`.
  - ראשי תיבות והמקרא בתוך הגיליון ב-375.
  - תוצאת חיפוש עוברת לציור מלא.
  - בקונסול אין שגיאות.

### Task 7: `npm test`, מיזוג ל-main, push, בדיקה באתר החי (אושר על ידי הבעלים)
