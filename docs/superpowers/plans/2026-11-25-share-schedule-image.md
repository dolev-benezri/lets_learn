# Share the Schedule as an Image: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "שלח כתמונה" button in edit mode (design A) that sends the week on the screen as a week-table PNG plus the friend link, through the phone's share sheet (WhatsApp), with a download-and-copy fallback.

**Architecture:** A new pure-plus-canvas module `web/share-image.js`: a pure layout function (`shareModel`, testable in node with a fake text measurer), a canvas painter (`drawShare`) and a synchronous file maker (`shareImageFile`). `web/ui-edit.js` factors the board's week inputs out of `weekOf` (`weekParts`), so the image is built from exactly the values the board drew, and adds the button and its handler. The friend link is prepared ahead (async), so the tap path up to `navigator.share` stays synchronous (iPhone requires the call inside the tap).

**Tech Stack:** Vanilla ES modules, Canvas 2D, Web Share API level 2 (`navigator.canShare({ files })`), node:test on node 24, Playwright WebKit specs (`test/browser/run.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-25-share-schedule-image-design.md` (approved 2026-11-25).

## Global Constraints

- Design A only: every new control is drawn only when `designOn()`; the classic design is untouched.
- No new dependency; nothing sent to a server; no file under `web/vendor/` or `web/data/` is opened or changed.
- Image: 1080 px wide, always light colours (design A light tokens, course colours c0-c7 light values), font Rubik (the page's).
- File name `afeka-schedule.png`, type `image/png`.
- Exact Hebrew copy: button `שלח כתמונה`; header `המערכת של {name}` / `המערכת שלי`; sub-label `הצעה {i} מתוך {n}` / `שינויים שעוד לא נשמרו` / `המערכת הנוכחית`; semester `סמסטר {s}׳` / `סמסטר קיץ`; legend `היה כאן`, `מקום חדש`; ghost text `היה כאן` + course name; meta `{type} · קב׳ {number}`; footer `נבנתה במתכנן המערכת · אפקה` and `הקישור בהודעה`.
- Toasts (writer's copy): desktop with link `התמונה ירדה והקישור הועתק. אפשר לצרף אותם בוואטסאפ.`; desktop without link `התמונה ירדה. אפשר לצרף אותה בוואטסאפ.`; gesture lost `לחצו שוב על "שלח כתמונה" כדי לשלוח.`; image failed `לא הצלחנו ליצור תמונה. הקישור הועתק במקומה.`
- The link carries the groups drawn (decision 6), never a `fixed:` id; no link when no real group id is drawn.
- No "what's new" entry for this feature (owner's standing direction: do not announce the new).
- Owner's process: a clean reviewer reads every commit before it is made; unit tests after every edit (`npx -y -p node@24 node --test "test/*.test.mjs"`); one WebKit run at a time; a full local WebKit run before the push; never edit files while specs run.

## Review Focus

1. iPhone loses the tap's permission when the handler awaits something slow (`NotAllowedError`): the person expects a second tap to work at once. Test in Task 3.
2. A long course name in a 50-minute lesson: the name stays (cut with `…`), the hours line goes first, then the meta line. Test in Task 1.
3. Two lessons at the same time, and an old place under a new lesson: side by side, no text over text. Test in Task 1.
4. The page in dark theme: the image is still light. Test in Task 2.
5. A week of fixed lessons only (loaded by hand, no groups): the image goes with no link and no `הקישור בהודעה`. Test in Task 3.

---

### Task 1: The image layout (pure)

**Files:**
- Create: `web/share-image.js`
- Modify: `web/advisor.js:22` (export `semName`)
- Test: `test/share-image.test.mjs`

**Interfaces:**
- Consumes: `typeLabel` (`web/ui-grid.js`), `groupNumber` (`web/ui-text.js`), `semName` (`web/advisor.js`, newly exported), `laneMap` (`web/ui-grid.js`, items `{ key, start, end }` in minutes → `Map(key → { l, n })`).
- Produces:
  - `headerLabel({ index: number, count: number, pending: boolean }) → string`: `index > 0` gives `הצעה {index} מתוך {count}`; otherwise `pending` gives `שינויים שעוד לא נשמרו`, else `המערכת הנוכחית`.
  - `fitLines(text: string, maxWidth: number, maxLines: number, measure: (s: string) => number) → string[]`: word wrap; when cut, the last line ends with `…` and still fits.
  - `shareModel(input: ShareInput, measure: (s: string, font: string) => number) → Model`, where
    `ShareInput = { name, semester, label, link: boolean, range: { from, to, days }, lessons: [{ course, name, type, group: string|null, day, start, end, color: 0-7, changed: boolean }], ghosts: [{ course, name, day, start, end, color }] }` and
    `Model = { width: 1080, height, title, sub, legend: boolean, pos: { left, right, title, sub, legend, days, footer }, grid: { top, hour }, cols: [{ day, label, x, w }], hours: [{ text, y }], items: [{ kind: 'lesson'|'ghost', x, y, w, h, color, changed, name: string[], meta: string[], time: string|null }], footer: { right, left } }` (`meta` is wrapped to ≤ 2 lines: in a narrow column `{type} · קב׳ {number}` does not fit one line).
  - `FONTS = { title, sub, day, hour, name, meta, time, ghost, footer }`: the CSS font strings the model measures with and Task 2 draws with.

- [ ] **Step 1: Write the failing tests** in `test/share-image.test.mjs` (fake measurer: `(s) => s.length * 12`):
  - `headerLabel`: `{index:2,count:5}` → `הצעה 2 מתוך 5`; `{index:0,pending:true}` → `שינויים שעוד לא נשמרו`; `{index:0,pending:false}` → `המערכת הנוכחית`.
  - `fitLines('משוואות דיפרנציאליות רגילות', 200, 2, m)` returns ≤ 2 lines, each `m(line) <= 200`, the last ends with `…`; a short name returns `[name]` unchanged.
  - `shareModel`: title `המערכת של נועה`, and `המערכת שלי` for `name: ''`; `sub` is `סמסטר א׳ · {label}`; 5 cols for `days: 5`, 6 for `days: 6`, cols ordered right to left (Sunday's `x` is the largest); a lesson 10:00-11:30 with `range.from = 8` has `y` = grid top + 2 × hour height and `h` = 1.5 × hour height (minus the gap); `meta` is `תרגול · קב׳ 04/1` for type `תרגול`, group `'273011204/1'` (`groupNumber` gives `04/1`), and `סופי-הרצאה+תרגול` shows as `הרצאה+תרגול · קב׳ 04` (`typeLabel`); type alone for `group: null`; a 12:00-13:30 lesson has `time` `12:00–13:30`.
  - Legend: `legend` false with no ghosts and no `changed`; true with either.
  - Ghost: `kind: 'ghost'`, `name[0] === 'היה כאן'`, then the course name's lines.
  - Footer: `left` is `הקישור בהודעה` with `link: true`, `''` with `link: false`; `right` is `נבנתה במתכנן המערכת · אפקה`.
  - Review Focus 2: a 50-minute lesson named `שרטוט הנדסי ממוחשב למהנדסי מכונות מתקדמים` keeps ≥ 1 name line, has `time === null`, and every line fits the block width.
  - Line order: a 90-minute lesson with a short name keeps `time`; a 30-minute lesson drops `time` and keeps 1 name line, and keeps `meta` only when it fits.
  - Review Focus 3: two lessons on day 2 at 10:00-11:30 and 10:30-12:00 plus a ghost at 10:00-11:30: three items, pairwise no rectangle overlap, all inside their column.

- [ ] **Step 2: Run** `npx -y -p node@24 node --test test/share-image.test.mjs`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `headerLabel`, `fitLines`, `shareModel`, `FONTS` in `web/share-image.js`; add `export` to `semName` in `web/advisor.js`. Layout values from the approved draft: page padding 36, card padding 36, hour height 104, hour column 76, column gap 8, block inner padding 10, name ≤ 3 lines. Lanes: one `laneMap` per day over lessons and ghosts together (ghost keys prefixed `g`); lane `l` of `n` takes `(w - (n-1)·gap)/n`, placed right to left. Line dropping in a block that is too short: drop `time`; then the name keeps 1 line; then `meta` keeps 1 line; then `meta` goes; `name` always keeps 1 line (the group number is what a friend needs, so it outlives the name's second line). `time` also goes when it is wider than the block. Hours labels from `range.from` to `range.to - 1`. Height = header + legend (when shown) + day row + `(to - from) × 104` + footer.

- [ ] **Step 4: Run** the same command. Expected: PASS. Then the whole unit suite: `npx -y -p node@24 node --test "test/*.test.mjs"`. Expected: all pass.

- [ ] **Step 5: Review and commit.** A clean reviewer reads `git diff --cached`; then
  `git add web/share-image.js web/advisor.js test/share-image.test.mjs && git commit -m "feat(share-image): the week image layout, pure and tested"`.

### Task 2: Paint the image and make the file

**Files:**
- Modify: `web/share-image.js`
- Test: `test/browser/share-image-file.spec.mjs` (new; `run.mjs` filters by substring, so the name must not match `edit-share-image`)

**Interfaces:**
- Consumes: `shareModel`, `FONTS` (Task 1).
- Produces:
  - `drawShare(ctx: CanvasRenderingContext2D, model: Model) → void`.
  - `shareImageFile(input: ShareInput, doc = document) → File`: **synchronous**. Makes a canvas `1080 × model.height`, measures with `ctx.measureText` under `FONTS`, draws, `canvas.toDataURL('image/png')`, decodes the base64 to bytes, returns `new File([bytes], 'afeka-schedule.png', { type: 'image/png' })`. No `toBlob` and no `await` (Review Focus 1).
  - `fontsReady(doc = document) → boolean`: `doc.fonts.check` for Rubik 400 and 700.

- [ ] **Step 1: Write the failing spec** `test/browser/share-image-file.spec.mjs` (setup as `test/browser/edit-proposals.spec.mjs`: `launch`, `visit(browser, t, 'phone', DONE, '#edit')`). In the page, `import('./share-image.js')` and call `shareImageFile` with a fixed sample input (6 courses, one ghost, one `changed`, one Friday lesson):
  - the result is a `File` named `afeka-schedule.png`, type `image/png`, `size > 20000`;
  - drawn into an `<img>`, its `naturalWidth` is 1080 and `naturalHeight` equals `shareModel(...).height`;
  - the pixel 6 px in from the left and bottom edges of an unchanged lesson's rectangle (from the model; away from the right-side colour bar and the right-aligned text) equals that course's light background colour (`--c{n}-bg`, light values);
  - Review Focus 4: the same check on a page visited with `scheme = 'dark'` gives the same light colours, and the page background pixel is the light `--bg` `#E9EDF1`.

- [ ] **Step 2: Run** `node test/browser/run.mjs share-image-file`. Expected: FAIL (`shareImageFile` is not a function).

- [ ] **Step 3: Implement** `drawShare`, `shareImageFile`, `fontsReady`. Colours: a constant table of the eight light course pairs from `web/design-a.css` (`--c0-bg/--c0-fg` … `--c7-*`), plus `#E9EDF1` page, `#FFFFFF` card, `#CFD7DF` border, `#121820` text, `#4D5A68` secondary, `#0A6B66` primary, `#1D7A3E` green outline. Text: `ctx.direction = 'rtl'`, `textAlign = 'right'` for Hebrew; the hours (`time`, hour labels) drawn with `direction = 'ltr'`. Ghost: dashed `setLineDash([10, 8])` stroke in the course `fg`, white veil fill at 0.6. Changed: 4 px `#1D7A3E` inner outline. The course-colour start edge: 8 px bar on the right side of each block, as in the draft.

- [ ] **Step 4: Run** `node test/browser/run.mjs share-image-file`. Expected: PASS. Unit suite as in Task 1: all pass.

- [ ] **Step 5: Review and commit** (`git add web/share-image.js test/browser/share-image.spec.mjs`, `feat(share-image): paint the week and make the PNG file`).

### Task 3: The button in edit mode, the share and the fallback

**Files:**
- Modify: `web/ui-edit.js` (`weekOf` at ~537, `resultsHtml` at ~664, `stepTwoA` at ~589, the `ACT_ED` handlers at ~1035, the view state `V` at ~408)
- Test: `test/browser/edit-share-image.spec.mjs` (new); `test/ui-edit.test.mjs` (the pure button HTML)

**Interfaces:**
- Consumes: `shareImageFile`, `headerLabel`, `fontsReady` (Tasks 1-2); `friendLink` (`web/share.js`), `shareText` (`web/ui-text.js`), `heb` (`web/ui-text.js`), `copy`, `toast` (`web/ui-common.js`), `FIXED` (`web/edit-search.js`).
- Produces:
  - `weekParts(st, data, pr, zero) → { lessons, dd, range, ghosts: [{ course, day, start, end }], changed: Set, pending: boolean }`: the body of today's `weekOf` up to `renderWeek`, unchanged in values; `ghosts` now keep `course` (`renderWeek` ignores it). `pending` = no `pr`, not `zero`, and any swap, added or removed course. `weekOf` calls it.
  - `export const shareButtonHtml = (where) => '<button type="button" class="btn" data-ed="shareImage" data-k="share-' + where + '">שלח כתמונה</button>'`.
  - `shareInput(st, data, parts, label) → ShareInput` (internal): lessons from `parts.dd` via `groupIndex`, `color` from `editColors` (fallback 7), `name` through `heb`, `group` null for a `FIXED` course; ghost `name` from the baseline lesson, `color` from `editColors` by course or `FIXED + course`, fallback 7.
  - `V.link = { key, url }`, filled by `prepareLink(groups)` (async `friendLink(location.origin + location.pathname, app.state, groups)`), called while step 2 is drawn. `key = JSON.stringify(friendPayload(app.state, groups))` (the name and the dataset are in the payload, so a renamed student never gets an old link); `prepareLink` does nothing when `V.link.key` (or the key already being prepared) equals it.
  - `V.sharing: boolean`: set at the handler's start, cleared at its end; the handler returns at once while it is set (a double tap starts one share); the button is drawn with `aria-disabled="true"` from it.
  - While step 2 is drawn, next to `prepareLink`: `document.fonts.load` for `700 24px Rubik` and `400 21px Rubik` with Hebrew and digits sample text (Rubik's Hebrew and Latin subsets load by `unicode-range`), so the tap never waits for a font.

- [ ] **Step 1: Write the failing tests.** In `test/ui-edit.test.mjs`: `shareButtonHtml('prop')` contains `data-ed="shareImage"` and the text `שלח כתמונה`. In `test/browser/edit-share-image.spec.mjs` (seed and `search` helper as `edit-proposals.spec.mjs`), with `navigator.canShare = () => true` and `navigator.share` replaced by a recorder in `page.evaluate` before the click:
  - a proposal shown: the button sits in `.prop-actions` right after `[data-ed="saveProposal"]`; a tap records one file (`afeka-schedule.png`, `image/png`, size > 20000) and a `text` that starts with `shareText(...)`'s words and contains `#f=`; decoding that hash (`decode` from `share.js`) gives exactly the proposal's real group ids and none starting with `fixed:`;
  - after `שמור הצעה`: the button sits in `.edit-search`; a tap records a file again;
  - not on `#edit` step 1, and not with the classic design (`opts.design: 'classic'`);
  - Review Focus 1: the recorder throws `DOMException('', 'NotAllowedError')` once: the toast reads `לחצו שוב על "שלח כתמונה" כדי לשלוח.`; the second tap records the share;
  - Review Focus 5: a seed whose baseline lessons all have `group: null`: a tap records a file and a `text` equal to `shareText`'s words with no `#f=` (the footer without `הקישור בהודעה` for `link: false` is pinned by Task 1's unit test);
  - desktop fallback: `navigator.canShare` removed: a `download` event with `suggestedFilename() === 'afeka-schedule.png'`, and the toast (or the copy dialog, where WebKit blocks the clipboard) carries the link.
  - `AbortError` from the recorder: no toast.
  - The image fails (`HTMLCanvasElement.prototype.toDataURL` made to throw in the page): the toast `לא הצלחנו ליצור תמונה. הקישור הועתק במקומה.` (or the copy dialog, where WebKit blocks the clipboard) carries the link, and nothing is shared.
  - A double tap (two clicks without awaiting) records one share.

- [ ] **Step 2: Run** `npx -y -p node@24 node --test test/ui-edit.test.mjs` and `node test/browser/run.mjs edit-share-image`. Expected: FAIL.

- [ ] **Step 3: Implement.** `weekParts` and the ghosts' `course`; the button in the design A `.prop-actions` (after `saveProposal`) and in `stepTwoA`'s `.edit-search` when no proposal is shown and the week has lessons; `prepareLink` from `stepTwoA`. The `shareImage` handler, synchronous until `navigator.share`:
  1. `stepTwoBase` → `weekParts` → `label = headerLabel({ index: pr ? V.i : 0, count: props.length, pending })`;
  2. real groups = `parts.dd.groups` without `FIXED` ids; `url = groups.length ? (V.link?.key === key ? V.link.url : null) : null`; if a link is needed and not ready, `await friendLink(...)` (desktop is fine; on a phone the gesture may be lost, which step 4 covers);
  3. `file = shareImageFile(shareInput(...))` (if `!fontsReady()` despite the preload, `await document.fonts.load` first: the gesture may be lost, and step 4's `NotAllowedError` path covers it); on an exception: toast `לא הצלחנו ליצור תמונה. הקישור הועתק במקומה.` and `copy(url)` when there is one;
  4. `navigator.canShare?.({ files: [file] })` → `navigator.share({ files: [file], text: url ? shareText(name) + ' ' + url : shareText(name) })`; `AbortError` silent; `NotAllowedError` → the gesture toast; any other error → the fallback (the image exists, so it is downloaded rather than reported as not made);
  5. fallback: download through an `<a download="afeka-schedule.png">` with an object URL (revoked after), then `copy(url, desktop toast)` or `toast(desktop toast without link)`.
  The button carries `aria-disabled="true"` while steps 1-5 run.

- [ ] **Step 4: Run** both commands. Expected: PASS. Then the unit suite (all pass) and the related WebKit specs one at a time: `node test/browser/run.mjs edit-proposals`, `node test/browser/run.mjs edit-a`. Expected: no new failures (the board looks the same: `weekOf`'s values did not change).

- [ ] **Step 5: Review and commit** (`git add web/ui-edit.js test/ui-edit.test.mjs test/browser/edit-share-image.spec.mjs`, `feat(edit): send the week on the screen as an image with the friend link`).

### Task 4: Look, full run, ship

**Files:**
- No code unless a finding needs it. `docs/superpowers/specs/2026-11-25-share-schedule-image-design.md`: status line only.

- [ ] **Step 1: Look at the real image.** From the test student with a proposal (the Task 3 seed), save the recorded file to the scratchpad and read it at phone width: names readable, nothing cut without `…`, dashed old places with the course name, green new places, legend, footer, no site address. Fix in the owning task's file if needed (unit + spec again).
- [ ] **Step 2: Full local WebKit run** (WebKit is the iPhone's engine; `navigator.share` is recorded, not real), alone: `node test/browser/run.mjs`. Expected: all pass, or only the known load flakes, each passing 3/3 when run alone.
- [ ] **Step 3: Merge and push** to main (the owner's standing direction: upload to the site after it passes). The owner chose (2026-11-25) the GitHub checks in place of a test on the owner's iPhone: deploy (with the unit suite), CodeQL and Lighthouse must be green, and the button live on the site. What no automated check covers, and the report says so: what WhatsApp on a real iPhone does with the link next to the image (caption or second message).
