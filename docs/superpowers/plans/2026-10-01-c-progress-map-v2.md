# Progress map v2 ("neural map") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the retro infographic map with an interactive flowchart that looks like a neural-network diagram:
- columns ("layers") of round nodes;
- curved connections;
- hover or focus lights the whole chain;
- built in the site's own visual language.

**Architecture:** A neural-net diagram is already a layered graph, and `layoutMap` already computes layers by prerequisite depth with crossing reduction. Keep the pure data and logic layer (`makeKeep`, `layoutMap` layering, `chainOf`, statuses from `app.cls`, `unlockCounts`, `test/ui-map.test.mjs`). Throw away all rendering and `map.css`, then rewrite:
- nodes become circles (radius by credits);
- edges become cubic Béziers between layer columns;
- one SVG with pan/zoom through `viewBox`;
- a side card.

No physics engine. A deterministic layout keeps positions stable between visits. **Owner rule (2026-10-01): don't reinvent.** Pan, zoom and pinch come from an existing library loaded from cdnjs/jsdelivr (`@panzoom/panzoom` or anvaka `panzoom`: pick the one that handles SVG + two-finger pinch + an ESM build). Don't hand-write pointer/pinch code. The layout stays our tested `layoutMap`.

**Tech Stack:** SVG + plain ES modules, `node --test`.

**Spec:** user bug map item 3 in `.superpowers/next-session.md`; data and interaction rules carried over from `.superpowers/ux-audit/progress-map-brief.md` ("Correct rules" + "Interaction"). The visual style section of that brief is **void**.

## Global Constraints
- **Colors:** only the app tokens from `web/index.html :root`:
  - `--success` / `--success-soft`: done;
  - `--primary` / `--primary-soft`: available;
  - `--warning` / `--warning-soft`: afterA / conditional;
  - `--danger` / `--danger-soft`: retake;
  - `--border-strong`: blocked;
  - `--text`, `--text-2`, `--surface`, `--surface-2`: text and surfaces;
  - `--friend` only for friend markers.

  No new fonts. Delete the `Suez One` import and `<link rel="stylesheet" href="map.css">` (`web/index.html:11`).
- Status must not rely on color alone. Each node gets an inner glyph: ✓ for done, ↻ for retake, a lock for blocked, a dashed ring for notOffered.
- Every node is focusable with an `aria-label` ("<name>, <status>, דורש: …, פותח: …"). The list view toggle stays for screen readers.
- Respect `prefers-reduced-motion`: no transitions on highlight.
- Works at 375 (pinch/drag pan, fit button), 1024 and 1440. No page-level horizontal scroll.
- Opened from the "המצב שלי" page (plan B). If plan B is not merged yet, it opens from the current `openMap` button.

## Review Focus
- 80+ nodes: the initial "fit" shows the whole graph legibly on 1440. On 375 it fits by height, and pan works with one finger.
- Highlight on a node with no prerequisites and no unlocks: only the node lights, nothing crashes.
- Filter "מה שנשאר לי" with everything done: an empty state message, not a blank SVG.
- Keyboard: Tab order follows layers right-to-left, Enter opens the card, Escape closes the map, and focus returns to the opener.
- An external prerequisite node ("מחוץ לתוכנית") still renders as a small pill/ring and is not clickable to the yedion.

---

### Task 1: Pure geometry helpers

**Files:** `web/ui-map.js` (add exports), `test/ui-map.test.mjs`

**Interfaces:** Produces:
- `nodeRadius(credits: number): number`, 14..30;
- `edgePath(a: {x,y}, b: {x,y}): string`, an SVG cubic path with horizontal tangents.

Consumes the `layoutMap(data, keep)` → `{ nodes, diamonds, paths, edges, lanes, width, height, cols }` that exists today.

- [ ] **Step 1: Failing tests**

```js
import { nodeRadius, edgePath } from '../web/ui-map.js';
test('nodeRadius grows with credits and is clamped', () => {
  assert.equal(nodeRadius(0), 14); assert.equal(nodeRadius(100), 30);
  assert.ok(nodeRadius(5) > nodeRadius(2));
});
test('edgePath is a horizontal-tangent cubic between two points', () => {
  assert.equal(edgePath({ x: 300, y: 50 }, { x: 100, y: 150 }), 'M300,50 C200,50 200,150 100,150');
});
```

- [ ] **Step 2:** Run `node --test test/ui-map.test.mjs`. Expect FAIL: not exported.
- [ ] **Step 3: Implement**

```js
export const nodeRadius = (credits) => Math.max(14, Math.min(30, 12 + 3 * (credits ?? 0)));
export const edgePath = (a, b) => { const mx = (a.x + b.x) / 2; return `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`; };
```

- [ ] **Step 4:** Run → PASS. Commit `feat(map): geometry helpers for the neural map`.

### Task 2: Rewrite the renderer

**Files:**
- Rewrite: the render/interaction part of `web/ui-map.js`. Keep `makeKeep`, `layoutMap`, `chainOf`, and the text helpers.
- Rewrite: `web/map.css` using only app tokens.
- Modify: `web/index.html` (drop the Google Fonts import if only the map used it).

- [ ] **Step 1: Design pass.** Run ui-ux-pro-max: `"interactive node graph flowchart" --domain ux`, `"network graph" --domain chart`, `"pan zoom touch" --domain ux`. Record the 3–5 rules you apply at the top of `map.css` as a comment.
- [ ] **Step 2: Layout to geometry.**
  - Take the layer columns from `layoutMap`: x per column, mirrored for RTL, so layer 0 is on the right.
  - Spread y evenly per column.
  - Replace the rectangle sizes from `SIZE` with `nodeRadius`.
  - Lanes (study years) become faint full-width background bands with a label at the right edge. No boxes.
- [ ] **Step 3: SVG structure.**
  - Draw in this order: `<g class="edges">` (paths via `edgePath`, `קדם` solid, `מקביל` dashed), then `<g class="ors">` (small "או" circles where `anyOf` has more than one option), then `<g class="nodes">` (`<g role="button" tabindex="0">` with a circle, a glyph, and the name as `<text>` under the circle, truncated at 18 chars with a full `<title>`).
  - "פותח N" is a small badge on the ring.
- [ ] **Step 4: Interaction.**
  - Hover or focus calls `chainOf(paths, key)`, which adds `.lit` to the chain and `.dim` to the svg root.
  - Click or Enter opens the side card (bottom sheet under 600px) with status, reason, credits, unlocks and the yedion link.
  - Pan works through pointer events on the svg (`setPointerCapture`) and updates `viewBox`. Zoom works with the wheel (ctrl/trackpad) and the +/−/fit buttons. Pinch uses two pointers.
  - The filters "הכל / מה שנשאר לי / רק השנה שלי" stay.
- [ ] **Step 5:** `npm test` → PASS (existing ui-map tests unchanged). Then a Chrome check, one agent only, covering the Review Focus list. Take screenshots at 375/1440 into `.superpowers/map-v2/`.
- [ ] **Step 6:** Commit `feat(map): neural-style progress map in the site's design`.
