# Design A system: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put design A on one set of rules (a centred frame, a spacing and type scale, one emphasized thing and one primary button per screen, fewer words) and carry every screen through them in five phases.

**Architecture:** CSS-first. The frame and the scales live in `web/design-a.css`, scoped under `:root[data-design="a"]`. Copy and label logic goes in pure helpers in `web/ui-text.js`, with unit tests. Renderers change only where behaviour changes. Each phase starts with a mockup the owner approves; this plan has full tasks for phase 1b and outlines for phases 2-5, which get task-level plans after their mockups.

**Tech Stack:** plain ES modules, no build step; node:test unit tests (`npx -y -p node@24 node --test "test/*.test.mjs"`); Playwright browser specs (`npm run test:browser -- <name>`, WebKit by default).

**Spec:** `docs/superpowers/specs/2026-11-22-design-a-system-design.md` (approved by the owner, 50fd733). It builds on `docs/superpowers/specs/2026-11-22-design-a-declutter.md` (approved; its 8 steps are phase 1a).

## Global Constraints

- Design A only: every CSS rule under `:root[data-design="a"]` (test/design-a-css.test.mjs enforces it); JS changes behind `designOn()`. Classic renders exactly as before.
- Hebrew RTL, Rubik; no new colours; no new dependencies; no build step.
- WCAG 2.1 AA: 4.5:1 text contrast (test/design-contrast.test.mjs), 44px targets, keyboard, visible focus, screen readers reach everything hidden.
- Widths 320 to 1920, light and dark.
- Words are targets with judgment, never a test: no word-count assertion anywhere (owner: "לא להיות רובוטי").
- Legal and safety notices stay visible (declutter spec rules hold); where both specs speak, the declutter spec's wording wins.
- Frame: build mode max 1680px, improve mode max 1200px, centred; below the cap nothing moves.
- Spacing scale 4, 8, 12, 16, 24, 32, 48 px; type: key 21px/600, title 18px/600, section and body 15px (`--fs`), small 13px (`--fs-sm`), tiny 12px (`--fs-xs`).
- Owner's rules: Codex reviews each change before its commit (never opening `web/vendor/**`); no push or merge without the manager; no personal data; never read the owner's real xlsx.
- `web/design-a.css` is edited the way the ui session already edits it (its private frame.src.css + append-frame.cjs in the ui worktree,
  E:/lets_learn/.claude/worktrees/ui-map-targets-fef683/.superpowers/sessions/dbg/), lines ≤ 160 characters. `web/` files are CRLF.
- `npm run test:browser -- <name>` runs the specs whose file name contains `<name>`: one name per command (test/browser/run.mjs:19).

## Review Focus

1. Around the cap: 1679, 1680 and 1700px keep the same column widths; only the outer margins grow (no jump of a column or the dock).
2. RTL order at 1920: the tool column on the right edge of the frame, the alternatives (rail or open) on its left edge; the margins outside the frame equal on both sides.
3. The sticky header and strip: their background still spans the full window width while their content lines up with the frame.
4. Improve mode at ≥ 1080 before phase 3: the record panel is still `position: fixed`; Task 2 moves it to the frame's edge so it covers
   the tool column only, never the week. Phase 3 replaces it.
5. 1080-1279px keeps today's 360 | board columns (the open alternatives column 240, the rail 64), and the frame padding there is 0.
6. The folded column after a redraw: a new search, a semester switch or a resize redraws `#alts`; it stays in the state the student chose,
   and focus stays on the rail button or the open/fold button that had it.

Each line has its test in the task that owns it (Tasks 2, 3 and 5 below). Also watched: the dock's real height with a mouse (`--tap` is
36px there), which Task 3 fixes and Task 2's scrolled check guards.

---

## Order of work

1. **Phase 1a: the declutter spec, steps 1-8.** The ui session is building these now; they are not repeated here. Where this plan overlaps:
   declutter step 4 puts the semester tabs in the switcher row and the sort select in the alternatives column header. Task 2 below sizes
   those rows and must start after step 4 has merged. Declutter step 1 (the facts line and "פרטים") is the board's key element and must
   not be restyled by Task 1's tokens beyond the type scale.
2. **Phase 1b: Tasks 1-6 below.**
3. **Phase 1 review:** design-lead browses the build (local copy, test data) at 1920, 1680, 1440, 1280, 1080, 768, 375, light and dark,
   and reports to the manager before the owner sees it.
4. **Phases 2-5:** for each, design-lead makes the mockup → the owner approves → design-lead writes that phase's task plan → ui session
   builds → design-lead browses the build → manager merges.

---

### Task 1: Spacing and type tokens

**Files:**
- Modify: `web/design-a.css` (the `:root[data-design="a"]` block at the top)
- Test: `test/design-a-css.test.mjs`

**Interfaces:**
- Produces: `--sp-1` … `--sp-7` (4, 8, 12, 16, 24, 32, 48px), `--fs-key: 21px`, `--fs-title: 18px`, `--frame: 1680px`,
  `--frame-edit: 1200px`. Body, small and tiny stay `--fs`, `--fs-sm`, `--fs-xs` (style.css).

- [ ] **Step 1: Write the failing test** in `test/design-a-css.test.mjs`:

```js
test('design A defines the spacing and type scale and the frame widths of the system design', () => {
  const css = noComments(readFileSync(new URL('../web/design-a.css', import.meta.url), 'utf8'));
  const root = /:root\[data-design="a"\]\s*\{([^}]*)\}/.exec(css)[1];
  const want = { '--sp-1': '4px', '--sp-2': '8px', '--sp-3': '12px', '--sp-4': '16px', '--sp-5': '24px', '--sp-6': '32px', '--sp-7': '48px',
    '--fs-key': '21px', '--fs-title': '18px', '--frame': '1680px', '--frame-edit': '1200px' };
  for (const [k, v] of Object.entries(want)) assert.match(root, new RegExp(`${k}\\s*:\\s*${v}\\s*;`), `${k} is ${v}`);
});
```

- [ ] **Step 2: Run it:** `npx -y -p node@24 node --test test/design-a-css.test.mjs`. Expected: FAIL on `--sp-1`.
- [ ] **Step 3: Add the eleven custom properties** to the first `:root[data-design="a"]` block of `web/design-a.css`.
- [ ] **Step 4: Run it again.** Expected: PASS, and the other tests in the file still pass.
- [ ] **Step 5: Codex review, then commit:** `feat(design): A spacing and type scale and the frame widths (system design §2-3)`.

### Task 2: The frame (centred, max-width) and calmer columns

**Files:**
- Modify: `web/design-a.css` (the `@media (min-width:1080px)` block: `.a-top`, `.a-strip`, `.a-stage`, `.a-alts`, `.a-pb`, `.edit-tool`,
  the improve `.a-panel` rule at design-a.css:355)
- Test: `test/browser/widths-a.spec.mjs`

**Interfaces:**
- Consumes: `--frame`, `--frame-edit`, `--fs`, `--fs-sm` (Task 1).
- Produces: from 1080px, `.a-top`, `.a-strip` and `.a-stage` keep a full-width background and pad their content to the frame:
  `.a-top { padding-inline: max(16px, calc((100% - var(--frame)) / 2)) }`, `.a-strip { … max(12px, …) }`,
  `.a-stage { … max(0px, …) }`; in improve mode (`body[data-view="edit"]`) the same with `var(--frame-edit)`, and the record panel
  (design-a.css:355) at `inset-inline-start: max(0px, calc((100% - var(--frame-edit)) / 2))` so it sits at the frame's edge.
  `scrollbar-width: thin` on `.a-alts`, `.a-pb` and `.edit-tool` (the elements that scroll). Alternative cards: head `var(--fs)`/600,
  sub `var(--fs-sm)`.

- [ ] **Step 1: Write the failing tests** in `test/browser/widths-a.spec.mjs` (it already has `visit`, `settle`, `DONE`):

```js
const frame = (page) => page.evaluate(() => {
  const r = (s) => document.querySelector(s)?.getBoundingClientRect();
  const panel = r('#panel'), alts = r('#alts'), brand = r('.a-brand'), top = r('.a-top'), strip = r('.a-strip');
  return { panelRight: panel.right, panelW: panel.width, altsLeft: alts.left, altsW: alts.width, brandRight: brand.right,
    topW: top.width, stripW: strip.width, fits: document.documentElement.scrollWidth <= innerWidth };
});
for (const w of [1440, 1679, 1680, 1700, 1920])
  test(`${w}px: the build frame is at most 1680px and centred, the columns keep their widths`, async (t) => {
    const page = await visit(t, { width: w, height: 900 }, DONE, '#courses');
    await page.locator('#panel #courses').waitFor({ state: 'visible' });
    await settle(page);
    const m = await frame(page);
    const side = Math.max(0, (w - 1680) / 2);
    assert.ok(m.fits, 'no sideways scroll');
    assert.ok(Math.abs(m.altsLeft - side) <= 1, `alternatives on the frame's left edge: ${JSON.stringify(m)}`);
    assert.ok(Math.abs(w - m.panelRight - side) <= 1, `tool column on the frame's right edge: ${JSON.stringify(m)}`);
    assert.equal(Math.round(m.panelW), 400, 'tool column 400px');
    assert.equal(Math.round(m.altsW), 280, 'alternatives column 280px (Task 5 changes it to the 64px rail)');
    assert.ok(Math.abs(m.topW - w) <= 1 && Math.abs(m.stripW - w) <= 1, 'header and strip backgrounds span the window');
    const stripPad = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.a-strip')).paddingInlineStart));
    assert.ok(Math.abs(stripPad - Math.max(12, side)) <= 1, `the strip's content lines up with the frame: ${stripPad}`);
    assert.ok(m.brandRight <= m.panelRight + 1 && m.brandRight >= m.panelRight - 48, 'the title lines up with the tool column');
    await page.evaluate(() => scrollTo(0, 600));
    const after = await page.evaluate(() => [document.querySelector('.a-top').getBoundingClientRect().top,
      document.querySelector('#panel').getBoundingClientRect().top, document.querySelector('.dock').getBoundingClientRect().bottom]);
    assert.equal(Math.round(after[0]), 0, 'the header stays at the top');
    assert.ok(after[1] >= after[2] - 1, `the tool column never slides under the dock: ${after}`);
  });
```

  In the existing `for (const w of [320, … 1280])` loop's `else` branch add the width check for 1080-1279 (Review Focus 5):

```js
      if (w < 1280) {
        const cols = await page.evaluate(() => [document.getElementById('panel').getBoundingClientRect().width,
          document.getElementById('alts').getBoundingClientRect().width]);
        assert.deepEqual(cols.map(Math.round), [360, 240], 'the 1080-1279 columns are unchanged (Task 5: [360, 64])');
      }
```

  And the improve case (Review Focus 4); `EDIT` is the record of test/browser/edit-a.spec.mjs:16-22, copied (its `BASE` lessons and
  `state()`), as `{ ...DONE, 'afeka-sched-v1-edit': JSON.stringify(state()) }`:

```js
for (const w of [1440, 1920])
test(`${w}px improve mode: the content and the record sit in the 1200px frame, the record not over the week`, async (t) => {
  const page = await visit(t, { width: w, height: 900 }, EDIT, '#edit');
  const side = (w - 1200) / 2;
  await page.locator('#edit .edit-board').waitFor({ state: 'visible' });
  await page.locator('.dock [data-tool="me"]').click();
  await page.locator('#panel #me').waitFor({ state: 'visible' });
  const m = await page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    return { week: r('#edit .edit-board'), panel: r('#panel') };
  });
  assert.ok(m.week.left >= side - 1, `the improve content starts at the frame's left edge or after: ${JSON.stringify(m)}`);
  assert.ok(Math.abs(m.panel.right - (w - side)) <= 1, `the record sits at the frame's right edge: ${JSON.stringify(m)}`);
  assert.ok(m.panel.left >= m.week.right - 1, `the record covers no part of the week: ${JSON.stringify(m)}`);
});
```

- [ ] **Step 2: Run** `npm run test:browser -- widths-a` (the runner takes one name: `test/browser/run.mjs:19`). Expected: 1700 and 1920 FAIL
  on `altsLeft`; the improve case FAILS on the record's right edge (it is at 1920 today).
- [ ] **Step 3: Write the frame rules** (Interfaces), the thin scrollbars and the card sizes in `web/design-a.css`, the way the ui session
  edits it (its private `frame.src.css` + `append-frame.cjs` in the ui worktree), lines ≤ 160 characters.
- [ ] **Step 4: Run, one suite per command:** `npm run test:browser -- widths-a`, then `-- shell-a`, `-- board-a`, `-- a11y-a`,
  `-- edit-a`, `-- improve-a`. Expected: all PASS.
- [ ] **Step 5: Look at it:** in the ui worktree, `node .superpowers/sessions/serve.mjs 8150` and compare 1920 and 1440 with the approved
  phase-1 picture, light and dark.
- [ ] **Step 6: Codex review, then commit:** `feat(design): A frame, max 1680 build and 1200 improve, centred (system design §1)`.

### Task 3: The dock: one-line tool tabs on a wide screen, centred on a tablet

**Files:**
- Modify: `web/design-a.css` (`.dock` / `.dk` at design-a.css:166 and :327-333; the sticky tops that use `var(--tap)` for the dock at
  :336 and :348)
- Test: `test/browser/shell-a.spec.mjs`

**Interfaces:**
- Produces: `--a-dock-h: 52px` from 1080px. `.dk` is a column (icon above label, gap 2px, `min-height: var(--a-dock-h)`), label
  `white-space: nowrap; font-size: var(--fs-xs)`. Every sticky offset that adds the dock (`.a-panel` top and height, `.edit-tool` top and
  max-height, the improve `.a-panel` top) uses `var(--a-dock-h)` instead of `var(--tap)` (which is 36px with a mouse, style.css:149).
  From 600 to 1079px the dock is centred and at most 560px wide: `inset-inline: max(0px, calc((100% - 560px) / 2))`.

- [ ] **Step 1: Write the failing tests** in `test/browser/shell-a.spec.mjs` (with that file's `visit` helper):

```js
const LABELS = ['המצב שלי', 'קורסים', 'מה חשוב לי', 'חברים', 'להוציא'];
for (const w of [1080, 1280, 1920])
  test(`${w}px: every tool tab shows its whole label on one line, under its icon, inside its tab`, async (t) => {
    const page = await visit(t, { width: w, height: 800 }, DONE, '#courses');
    await page.locator('#panel #courses').waitFor({ state: 'visible' });
    const tabs = await page.evaluate(() => [...document.querySelectorAll('.dock .dk:not([hidden])')].map((b) => {
      const r = b.getBoundingClientRect(), s = b.querySelector('span'), sr = s.getBoundingClientRect(), ir = b.querySelector('svg').getBoundingClientRect();
      return { text: s.textContent, seen: s.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && sr.width > 0, oneLine: sr.height <= parseFloat(getComputedStyle(s).fontSize) * 1.6, inside: sr.left >= r.left - 1 && sr.right <= r.right + 1,
        under: ir.bottom <= sr.top + 1, h: r.height };
    }));
    assert.deepEqual(tabs.map((x) => x.text), LABELS);
    for (const x of tabs) assert.ok(x.seen && x.oneLine && x.inside && x.under && x.h >= 44, JSON.stringify(x));
  });
test('768px: the dock is centred and at most 560px wide', async (t) => {
  const page = await visit(t, { width: 768, height: 1024 }, DONE);
  await page.locator('.dock').waitFor({ state: 'visible' });
  const d = await page.evaluate(() => document.querySelector('.dock').getBoundingClientRect());
  assert.ok(d.width <= 560 + 1 && Math.abs(d.left - (768 - d.right)) <= 1, JSON.stringify(d));
});
```

- [ ] **Step 2: Run** `npm run test:browser -- shell-a`. Expected: FAIL (`oneLine` false for "מה חשוב לי" at 1080 and 1280; the dock 768 wide).
- [ ] **Step 3: Restyle the dock** as in Interfaces.
- [ ] **Step 4: Run** `-- shell-a`, then `-- widths-a` (its scrolled check now guards the sticky offsets), then `-- a11y-a`. Expected: PASS.
- [ ] **Step 5: Codex review, then commit:** `fix(design): A dock, one-line tabs (owner-3, W2) and centred on a tablet (P3)`.

### Task 4: The switcher says it is computing (design A)

**Files:**
- Modify: `web/ui-text.js` (new export), `web/ui-view.js` (import; :305-307), `web/ui-search.js` (`setBusy`, :158)
- Test: `test/ui-text.test.mjs`, `test/browser/board-a.spec.mjs`

**Interfaces:**
- Produces: `altLabelText({ nAlt: number, cur: number, split: boolean, running: boolean }) -> string` in `web/ui-text.js`.

- [ ] **Step 1: Write the failing unit test** in `test/ui-text.test.mjs` (add `altLabelText` to the file's import from `../web/ui-text.js`):

```js
test('the switcher label: computing, an alternative, or none', () => {
  assert.equal(altLabelText({ nAlt: 0, cur: 0, split: false, running: true }), 'מחשב חלופות…');
  assert.equal(altLabelText({ nAlt: 10, cur: 2, split: false, running: true }), 'חלופה 3 מתוך 10');
  assert.equal(altLabelText({ nAlt: 10, cur: 0, split: true, running: false }), 'חלופה 1 מתוך 10 · מופרדת');
  assert.equal(altLabelText({ nAlt: 0, cur: 0, split: false, running: false }), 'אין חלופות');
});
```

- [ ] **Step 2: Write the failing browser test** in `test/browser/board-a.spec.mjs`, holding the build worker the way
  edit-a.spec.mjs:24-36 holds `edit-worker.js` (here `**/solver-worker.js`):

```js
test('while the first search runs the switcher says it is computing, then shows the first alternative', async (t) => {
  const page = await visit(t, { width: 1280, height: 800 }, DONE); // board-a's own visit helper
  const held = holdWorker(page, '**/solver-worker.js'); // edit-a.spec.mjs:24-36, with the worker URL as a parameter
  await page.reload(); // the route survives the reload, so the first search of the new page waits at the gate
  await held.reached;
  assert.equal(await page.locator('#altLabel').textContent(), 'מחשב חלופות…');
  held.release();
  await page.waitForFunction(() => /^חלופה 1 מתוך/.test(document.getElementById('altLabel').textContent));
});
```

- [ ] **Step 3: Run** `npx -y -p node@24 node --test test/ui-text.test.mjs` and `npm run test:browser -- board-a`. Expected: both FAIL.
- [ ] **Step 4: Implement.** Export `altLabelText` from `web/ui-text.js`. In `renderView` (ui-view.js:305-307) use it only under
  `designOn()`, keeping classic's ternary as it is. In `setBusy()` (ui-search.js:158), under `designOn()`, when `ui.running` and
  `!hasAlternatives()` (exported by ui-view.js; the two modules already import each other), set `#altLabel` to `altLabelText({ nAlt: 0,
  cur: 0, split: false, running: true })`. `scheduleRun()` calls `setBusy()` when a search starts (ui-search.js:24), so the label changes
  then, not when the results come back.
- [ ] **Step 5: Run** the unit tests, then `npm run test:browser -- board-a`, then, in PowerShell, `$env:DESIGN='classic'; npm run test:browser -- flows; Remove-Item Env:DESIGN` (classic
  unchanged). Expected: PASS.
- [ ] **Step 6: Codex review, then commit:** `fix(design): A switcher says "מחשב חלופות…" while the search runs (W4)`.

The second "מחשב…" (`#coursesBusy` in the tool column) stays: the board's `#busy` is not sticky and scrolls away, so the column's indicator
is the one still on screen after a scroll. The spec asked for one spinner; this is the one-line exception the spec allows (§6).

### Task 5: The alternatives column folds to a rail (owner-7)

Owner, 2026-11-22, on the declutter picture: "זה מעמיס על הדף זה צריך להיות מתקפל". From 1080px the column starts folded and the week gets
the space. The switcher arrows stay the main way between alternatives. Phone and tablet (below 1080): no change, there is no column.

**Files:**
- Modify: `web/ui-common.js` (two storage helpers), `web/ui-view.js` (`renderAltColumn`, :528), `web/ui-plan.js` (one action, next to
  `ACT.altPick` at :302), `web/design-a.css` (the `@media (min-width:1080px)` block, :319-323, and :361-362)
- Test: `test/browser/board-a.spec.mjs` (new tests, and the existing card tests at :22, :42, :60, :169, :175, :181 open the column
  first: they wait for `.alt-card` on a fresh visit, which is folded now); `test/browser/widths-a.spec.mjs` (Task 2's widths, both
  states); `test/browser/a11y-a.spec.mjs` (a dedicated 1440 check, see Step 1: the 1280 case skips the target scan, a11y-a.spec.mjs:113,
  and the other widths hide the column)

**Interfaces:**
- Consumes: `.alt-card` markup and `ACT.altPick` (today's), `keepFocus` by `data-k`, `--fs`, `--fs-xs`, `--primary`, `--on-primary`,
  `--surface-2`.
- Produces: in `web/ui-common.js`, `altsOpen() -> boolean` and `setAltsOpen(open: boolean)`. The state lives in a module variable,
  read once from the key `'afeka-sched-v1-alts'` (value `'open'`; anything else, or storage that throws, means folded); `setAltsOpen`
  sets the variable first and then writes storage best-effort in try/catch, so folding works in a window without storage.
  `ACT.altsFold = (el) => { el.focus({ preventScroll: true }); setAltsOpen(!altsOpen()); keepFocus(renderAltColumn); }` (WebKit does
  not focus a clicked button; ui-plan.js:301 says the same for `altPick`).
- Markup (from the approved phase-1 picture, `rail()` in design-lead's mock.mjs):
  - Folded: `.a-stage` gets the class `alts-rail`. `#alts` holds `<div class="alt-rail">`: first `<button type="button" class="rail-btn"
    data-act="altsFold" data-k="alts-fold" aria-expanded="false" aria-controls="alts" aria-label="הצגת N החלופות">` (a chevron pointing
    into the board, then `<b>N</b>`), then `<ol class="rail-list">` with, per alternative, `<button type="button" class="rail-n"
    data-act="altPick" data-i="i" data-k="altcard-i" aria-current="…" aria-label="חלופה i+1: <the card's head>">` holding the number
    and `<span class="rail-d" aria-hidden="true">`: one `<i>` per day column of the card's mini week, class `on` when that day has a
    lesson (the data `miniWeekHtml` already uses).
  - Open: today's column; its heading becomes a row `.col-h` with the `h2` and `<button type="button" class="rail-btn" data-act="altsFold"
    data-k="alts-fold" aria-expanded="true" aria-controls="alts">` (a chevron pointing away from the board, then "הקטנה"). The sort
    control ("לפי", declutter step 4) shows only in this state.
  - The fold button keeps `data-k="alts-fold"` in both states and a rail button shares its card's `altcard-i`, so `keepFocus` keeps focus
    on the control that was used. When a redraw removes the focused control (a new search with fewer alternatives, or none), focus goes
    to `#altLabel`'s switcher button that is visible (the next arrow, else the previous one), never to `body`. Below 1080 the column is
    `display:none`; a focused rail button there loses focus to the same switcher button on the resize redraw.
- CSS (as in the picture): `.a-stage.has-alts.alts-rail` third track `64px` from 1080 (both the 1080-1279 and the ≥1280 grids); the rail
  padding 8px; `.rail-btn` 48px wide and at least 56px high in the rail, 44px high in the open header; `.rail-n` 48×48 with the number at
  `--fs`/700 and the dots 4px square, 2px apart, unlit at opacity .25; `.rail-n[aria-current="true"]` filled `--primary`, text
  `--on-primary`. Below 1080 `.a-alts` stays `display:none` (design-a.css:249).

- [ ] **Step 1: Write the failing tests** in `test/browser/board-a.spec.mjs` (its own `visit` helper and `DONE`):

```js
test('1440px: the alternatives start as a 64px rail, open on one tap, and the choice is remembered', async (t) => {
  const page = await visit(t, { width: 1440, height: 900 }, DONE);
  await page.locator('#alts .rail-n').first().waitFor({ state: 'visible' });
  const total = Number(/מתוך (\d+)/.exec(await page.locator('#altLabel').textContent())[1]);
  assert.ok(total >= 3, 'the test data gives at least three alternatives');
  assert.equal(await page.locator('#alts .rail-n').count(), total, 'one rail button per alternative');
  assert.equal(Math.round((await page.locator('#alts').boundingBox()).width), 64);
  assert.equal((await page.locator('#alts .rail-n[aria-current="true"]').textContent()).trim(), '1');
  const fold = page.locator('#alts [data-k="alts-fold"]');
  assert.equal(await fold.getAttribute('aria-expanded'), 'false');
  await page.locator('#alts .rail-n').nth(2).click();
  await page.waitForFunction(() => /^חלופה 3 מתוך/.test(document.getElementById('altLabel').textContent));
  assert.equal(await page.locator('#alts .rail-n[aria-current="true"]').count(), 1);
  assert.equal(await page.locator('#alts .rail-n').nth(2).getAttribute('aria-current'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), 'altcard-2', 'focus stays on the picked rail button');
  await fold.click();
  await page.locator('#alts .alt-card').first().waitFor({ state: 'visible' });
  assert.equal(Math.round((await page.locator('#alts').boundingBox()).width), 280);
  assert.equal(await fold.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.k), 'alts-fold', 'focus stays on the fold button');
  await page.reload();
  await page.locator('#alts .alt-card').first().waitFor({ state: 'visible' }); // remembered open
  await page.locator('#alts [data-k="alts-fold"]').press('Enter');
  await page.locator('#alts .rail-n').first().waitFor({ state: 'visible' }); // folds again by keyboard
});
test('375px: no alternatives column, the switcher stays', async (t) => {
  const page = await visit(t, { width: 375, height: 812 }, DONE);
  await page.locator('#altLabel').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#alts').isVisible(), false);
});
test('1440px: storage that throws still folds and opens', async (t) => {
  const page = await visit(t, { width: 1440, height: 900 }, DONE);
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('blocked'); }; });
  await page.reload();
  await page.locator('#alts [data-k="alts-fold"]').click();
  await page.locator('#alts .alt-card').first().waitFor({ state: 'visible' });
});
test('1440px: a new search that leaves fewer alternatives moves focus to the switcher, not to the page', async (t) => {
  // open the rail, focus the last rail button, then change a constraint that cuts the alternatives (the way board-a's existing
  // "search again" test changes one) and wait for the new label
  // assert: document.activeElement is a visible button of the switcher row (`#altLabel`'s arrows), not body
});
```

  The last test's body is left to the builder: the change that cuts the alternatives depends on the test data; any change that
  leaves fewer alternatives than the focused index works.

  In Task 2's widths tests check both states: folded (the default) 64 at the ≥1440 loop and `[360, 64]` at 1080-1279; then click
  `[data-k="alts-fold"]` and check 280 and `[360, 240]`, with the frame edges (`altsLeft`, `panelRight`) unchanged in both.

  In `test/browser/a11y-a.spec.mjs` add one 1440 test, light and dark (that file's `checker`, `check`, `layoutOk` with targets on):
  the board with the column folded, then open, each passing axe and the 44px target scan with `#alts` among the roots.
  In the existing board-a tests that use `.alt-card` (:22, :42, :60, :169, :175, :181) add `await page.locator('#alts
  [data-k="alts-fold"]').click()` before the first card wait; their assertions stay.
- [ ] **Step 2: Run** `npm run test:browser -- board-a`. Expected: FAIL (no `.rail-n`).
- [ ] **Step 3: Implement** the helpers, `ACT.altsFold`, the two states in `renderAltColumn` (the column exists only in design A) and
  the CSS.
- [ ] **Step 4: Run, one suite per command:** `-- board-a`, `-- widths-a`, `-- a11y-a`, `-- shell-a`. Expected: PASS. Then look at 1920
  and 1280, light and dark, against the approved phase-1 picture.
- [ ] **Step 5: Codex review, then commit:** `feat(design): A alternatives column folds to a rail, remembered (owner-7)`.

### Task 6: Phase 1 read-through (no code unless it finds something)

- [ ] **Step 1:** After Tasks 1-5 and declutter steps 1-8 are on claude/design-a, design-lead serves that branch locally and reads the
  board at 1920, 1440, 1280, 768 and 375, light and dark, against the phase-1 picture: the words above the week (target about 25 inside
  the board, warnings and the legal strip aside), the one emphasized thing, the frame edges, the rail folded and open.
- [ ] **Step 2:** design-lead writes the result, with the count made by hand and any exception with its one-line reason, to the manager.
  A gap becomes a small task for the ui session; otherwise phase 1 goes to the owner.

---

## Phases 2-5 (outline; each gets its own task plan after its mockup is approved)

### Phase 2: the tools (המצב שלי, קורסים, מה חשוב לי, חברים, להוציא)
- Sections, not cards inside the panel (one surface level); key element per tool as in the spec's phase table, at `--fs-key`.
- ⓘ inline disclosure component (spec §6): a pure `helpHtml(id, topic, text)` in `web/ui-text.js` with unit tests; one click handler in
  `web/ui-actions.js`; keyboard and Escape tests in a11y-a.
- Course card status line (declutter C1-C9, if not already built in 1a).
- Delete-all only in ☰ (remove from `web/ui-me.js:335`).
- Phone sheets at about 60% with the expansion button on `#panel` and `.edit-tool`; the open-scroll rule; replace shell-a.spec.mjs:158.
- (The tablet dock is done in phase 1b, Task 3.)

### Phase 3: improve mode
- Empty state before load (one centred column, max 640) and the 440 | week layout after it, inside `--frame-edit`.
- The record in the tool column's slot, state-driven (`ui.overlay === 'me'` adds a class on the stage), back control, Escape, focus
  return; keep the edit-a.spec.mjs:141 guarantees.
- "קובץ מערכת" opens the device's file picker, then the existing editor at its file step (spec "Phase details").
- Goal chips wrap; replace improve-a.spec.mjs:104 and edit-a.spec.mjs:76 as the spec says. One primary button; the rest secondary or
  under "עוד"; one sticky bar on a phone.

### Phase 4: ☰, מידע, dialogs
- List rows (48px, icon, label, chevron or external-link icon, dividers) for ☰ and מידע; a back arrow in the sheet header in place of
  "חזרה לתפריט"; "מצב כהה" leaves ☰.
- The schedule editor: one input method visible, the other two under "דרכים נוספות"; "שמור / ביטול" beside the content.
- a11y-a roots extended to `#drawer` and `#friendEd`.

### Phase 5: first run
- The gate stays in `#panel`; the empty week gets the empty state "המערכת תופיע כאן. מתחילים בכרטיס שבצד."; gate card on the type scale.
