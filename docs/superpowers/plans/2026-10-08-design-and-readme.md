# Plan: site design and README (2026-10-08)

**Status (2026-10-08, later):** the owner approved D-A with one change: dark mode needs a **visible button**, not only a switch in העדפות.
Done on branch `style/theme`: stage 0; stage 1 colours (every colour a token, `--border-input`; the spacing scale is still open); stage 3 (clarity);
stage 4 (night, `web/theme.js`, a "מצב כהה"/"מצב בהיר" button at the end of the view strip, following the device until clicked);
stage 2 entry motion (sheets, popover, dialogs, scrims; exit motion, `details` height and FLIP still open). Repo About, website, topics and social preview are set.
Written overnight at the owner's request ("decide the design yourself; in the morning I want at least 4 styles").
Inputs, all in `docs/superpowers/design-review/`:
- `ui-audit.md`: 32 findings U-01..U-32 with measurements at 320/375/768/1280 and landscape. Spot-checked: U-17 re-measured (358 vs 320), U-01 and U-26 confirmed in the code.
- `readme-review.md`: R-01..R-18, a new outline, a visual-assets plan, copy rewrites and owner settings. Spot-checked: About empty (`gh repo view`), `<div dir="rtl">` survives GitHub's sanitizer, the PDF is not ignored.
- `styles/`: five style proposals as CSS files over the real app, a preview server, a CDP screenshot and contrast script, and the gallery (published privately: https://claude.ai/artifact/PRQpWkJd8qKWCRQ3oaQUki).
- `research.md`: a hand synthesis of the deep-research run. It has 14 verified claims, and the evidence is thin; the gaps are listed there. It backs the motion durations (Material: enter about 225ms, exit about 195ms, nothing over 400), wrapping motion in `no-preference`, tone-shifted dark tints, `<bdi>` for mixed Hebrew and Latin runs, and dark mode as optional rather than default.

## Decisions (made by me, the owner may override any of them)

| # | Decision | Why |
|---|---|---|
| D-A | Direction: **"בהיר" (clarity) as the base + "לילה" (night) as dark mode**, following the phone setting, with a 3-way switch (system / light / dark) in העדפות. | Lowest risk: keeps the approved v2, its tints and measured contrast. Adds the two things that are really missing: motion (owner priority) and dark mode. The two compose, because both are token sets over the same structure. "קמפוס" is the fallback if the owner wants a stronger personality. "זכוכית" is out: blur cost on weak Android, and it broke the fixed bottom bar during the prototype. "נקי" is out: too cold for students, and it drops the brand font. |
| D-B | Amend `design-system/afeka-scheduler/pages/app.md`: (1) motion: "overlays and sheets may use transform and opacity, 180-240ms, ease-out in, ease-in out; reduced motion removes them" (U-01); (2) targets: "44px on coarse pointers, 36px on fine" (U-24); (3) theme: "light and dark, both from tokens" (replaces "light only"). | The current line 99 is the root cause of "nothing slides". |
| D-C | README becomes a student page (about 130 lines) plus a 20-line developer stub. The runbooks move to `docs/`, nothing is deleted (R-05). | 63% of today's README is developer material in front of students. |
| D-D | No new runtime dependencies, no new external hosts, fonts stay self-hosted, and the CSP stays as it is. | Existing project rules. Every stage below holds to them. |

## Global constraints

- One branch per stage, then merge to `main`. Run `git pull --rebase` before pushing (the nightly `data(afeka)` commits land on main).
- Run focused tests per change, the full `npm test` before each merge, and keep the 200-character line rule (`test/line-length.test.mjs`).
- No requests to the Afeka site or the yedion.
- Phone first: every visual stage is measured at 320x640, 375x812, landscape 740x360, 768 and 1280x800 before it is called done.
- **Visual check after every stage, with the tools built tonight.** Start `python docs/superpowers/design-review/styles/serve.py`, then run `node docs/superpowers/design-review/styles/shoot.mjs base`. The script captures five screens at two widths and runs a WCAG contrast check of every visible text node, with semi-transparent layers composited. The check is proven to catch failures: a planted grey gave 8 fails. 0 fails is required, and the `base` shots before and after are compared by eye.
- **Lesson from the glass prototype:** a `filter` or `backdrop-filter` on `.top` turns it into the containing block of the fixed phone action bar inside it, and the bar jumps to the top of the screen. Never put a filter on an ancestor of a `position:fixed` element; use a pseudo-element.
- Reduced motion: every new animation goes through the existing global switch (`style.css:427`) or tokens that collapse to 0.

## Stages

Sizes: S under an hour, M a few hours, L a day or more. Routing follows the agent matrix: tiny edits inline, multi-file UI work on sonnet, a review before merge.

### Stage 0: housekeeping (S, inline)
- [ ] `.gitignore`: `/*.pdf` (R-12: the college PDF in the root is one `git add .` away from being published) and `docs/superpowers/design-review/styles/shots/` (shots can be regenerated: `shoot.mjs`).
- [ ] Commit `docs/superpowers/design-review/` (reviews, style CSS, `serve.py`, `seed.js`, `shoot.mjs`, `gallery.html`) and this plan.
- [ ] Add `"ui:shots": "node docs/superpowers/design-review/styles/shoot.mjs"` to `package.json` scripts. It is not part of `npm test`, because it needs Chrome and the server.

### Stage 1: `style/tokens` (M): one source for every colour, size and space
Findings: U-23, U-25, U-32, and the 13 hardcoded colours left in `style.css` (`#C9DAFB #F6C7C9 #F9DBAF #B7E4CF #FAFBFD #1E40AF #15803D #fff`, the four `rgba(16,24,40,…)` and `rgba(255,255,255,.6)`).
- [ ] New tokens in the `:root` block (`style.css:8-21`):
  - `--primary-line`, `--danger-line`, `--warning-line`, `--success-line` for the tint borders;
  - `--stripe`, the alternate hour band (`#FAFBFD`, `style.css:219`);
  - `--primary-press` (`#1E40AF`);
  - `--scrim` (`rgba(16,24,40,.45)`, used 4 times);
  - `--shadow-up`, the bottom bar, sheet and `#me` footer shadows;
  - `--hover-veil`;
  - `--ok`.
- [ ] `--border-input:#8A94A6` (3.1:1 on white) for every input, select and textarea outline (U-23). Raise the map's `.e` and `.ar` opacity to .65 (`map.css:82,84`) so edges reach 3:1. Correct `docs/ACCESSIBILITY-AUDIT.md` 1.4.11.
- [ ] Spacing scale `--sp-1..6` (4, 8, 12, 16, 24, 32). Migrate the odd values first: 7px ×20, 9px ×10, 5px ×10, 11px ×5. Type: replace the 35 literal `12px` and 18 literal `13px` with `--fs-xs` and `--fs-sm`.
- [ ] Preload the Latin font subset (U-26, `index.html:27`).
- [ ] Amend `app.md` (D-B).
- Verify: `npm test`. `ui:shots base` shows no visible change except the darker input outlines and map edges, with 0 contrast fails. Grep proof: no hex or rgba left in `style.css` outside `:root` (except `#fff` on canvas).
- Done when: a theme file can restyle the whole app by tokens only. Proof: rewrite `night.css` as tokens only, with no `!important`, and it still renders correctly.

### Stage 2: `style/motion` (M-L): nothing snaps
Findings: U-01 (high), U-02, U-03, and ideas 1 and 10.
- [ ] Motion tokens: `--dur-1:150ms` (micro), `--dur-2:220ms` (sheets enter), `--dur-out:170ms` (sheets leave), `--ease-out:cubic-bezier(.2,.8,.2,1)`, `--ease-in:cubic-bezier(.4,0,1,1)`. Nothing over 300ms (research.md: Material mobile durations).
- [ ] New motion goes inside `@media (prefers-reduced-motion: no-preference)`, so it is off by default for anyone who asked for less (WCAG technique C39). The global switch at `style.css:427` stays as a second guard.
- [ ] Drawer (`style.css:273`): on the desktop it slides in from the inline-end edge; on phones it rises as a sheet. Use `@starting-style` plus `transition-behavior:allow-discrete` on `display` and `overlay`, the native path for `<dialog>` and `[popover]`. Browsers without it get today's instant open: progressive, no fallback code.
- [ ] Scrim fades in. The lesson popover gets scale and fade on desktop and a sheet on phones. `#friendEd` and `.pmap` fade and rise. `.dlg` scales.
- [ ] `details`: rotate the chevron (`style.css:129-130`). Animate the height through `::details-content` + `interpolate-size:allow-keywords` where supported.
- [ ] Docked drawer at 1080-1499px: `body { transition:padding-inline-end var(--dur-2) }`. Move the label hiding from `body.drawer-open` to a container query on `.top`, so the labels don't flip in one frame (U-02).
- [ ] Reduced motion: hide the `.busy::before` ring and make `.board.is-busy::before` static (U-03).
- [ ] (2b, optional, L) Alternative switch glide: FLIP the `.blk` elements that keep their course from the old to the new position, and cross-fade the rest. This is the "gliding week" from the audit ideas. It goes in a separate commit so it can be dropped.
- Verify: watch the motion at 375 and 1280 in a visible window (the hidden pane does not run rAF). Check that reduced-motion emulation (CDP `Emulation.setEmulatedMedia`) shows no motion. 60fps check: a Performance trace shows no layout during the transition (transform and opacity only).

### Stage 3: `style/clarity` (M): the chosen look
Source: `docs/superpowers/design-review/styles/clarity.css`. Port it rule by rule into `style.css` as real edits, not an override file.
- [ ] Brand mark before the title. Use `web/icon.svg` as an `<img>` in `index.html` instead of the CSS gradient tile, so the favicon, og and header share one mark.
- [ ] Cards with a soft shadow token (`--shadow-card`) instead of frames: `.board`, `.me-card`, `.me-main`. Tabs as a pill segment (`.views`). Body at 15px from 600px. Blocks: 4px edge, radius 10, bold name, a 1px lift on hover (transform only).
- [ ] Switcher on `--primary-soft`, label in 600.
- Verify: `ui:shots base` against the clarity shots from tonight; they must match.

### Stage 4: `style/night` (M-L): dark mode
Source: `night.css` (token values already contrast-checked at 0 fails on 5 screens × 2 widths).
- [ ] Dark token set under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }` and again under `:root[data-theme="dark"]`. The course tints `--c0..c7-bg/fg` come from `night.css`.
- [ ] `<meta name="color-scheme" content="light dark">`, and a `theme-color` pair with `media`. `legal.html` too.
- [ ] Switch in העדפות: מערכת / בהיר / כהה, a `.seg` like the others. Stored under `afeka-sched-v1-theme` (outside the backup state: a display choice, not data). It is applied before first paint by a 3-line script (`script-src 'self'`: a small `theme.js` file, not inline, because the CSP forbids inline scripts).
- [ ] Check the hardcoded spots found in the prototype: hour stripe, tint borders, `.seg` hover veil, primary press, toast, scrims, `.fe-page canvas` (stays white: it is a PDF page).
- [ ] Map: tokens only (verified tonight: `map.css` has no literal colours). Check edge contrast on the dark surface.
- Verify: `ui:shots` with CDP `Emulation.setEmulatedMedia` `prefers-color-scheme: dark` (add a `--dark` flag to `shoot.mjs`). 0 contrast fails in both themes. Manual pass of the friend editor, grade import dialog and legal page in dark.

### Stage 5: `fix/phone-layout` (M-L): the phone findings
5a, quick (S each, one branch):
- [ ] **U-17 (high):** in the friend editor at 320, `.fe-pick-body { grid-template-columns:minmax(0,1fr) }` and `.fe-sec { min-width:0 }`. Re-measure 358 → 320.
- [ ] **U-14:** `.btn.sm` at `--tap` on coarse pointers; labels "העדף מרצה" and "הימנע ממרצה".
- [ ] **U-10:** "רשימה להרשמה" fits at 320 (two lines or "הרשמה"); hide the "+" circle once friends exist.
- [ ] **U-11:** title at 320; friend editor title "מערכת של חבר".
- [ ] **U-16:** `nowrap` on "N נ״ז"; `overflow-wrap` on group ids; a shorter placeholder; a grid for the time fields.
- [ ] **U-19:** spacing in the friend editor header.
- [ ] **U-20:** `title` on the icon-only actions from 760 to 1079px.
- [ ] **U-22:** `#me` goes two-column from 720px.
- [ ] Bidi: wrap time ranges, group ids and Latin course names that sit inside Hebrew text in `<bdi>` (research.md, W3C bidi note). Check "MATLAB 12:00-15:50" in blocks, the popover and the registration list.

5b, structural (M each):
- [ ] **U-06:** summary pills wrap to two rows on phones; `.pill-info` becomes a paragraph; the quiet pills go into an "עוד" disclosure. Fallback: a fade mask at the inline-end edge.
- [ ] **U-07:** one sticky row on phones (semester as a small toggle at the start of the day selector), saving 52px.
- [ ] **U-08:** landscape phones get the whole week: `(max-height:480px) and (orientation:landscape)` joins the 5-column rule.
- [ ] **U-09 + U-12 + idea 11:** a five-item bottom bar on phones (המצב שלי, בנייה, העדפות, חברים, רשימה), with share moved to an icon in the top bar. The course list gets a filter box, and the semester row shows only for courses offered in both semesters.
- [ ] **U-13:** a live result strip at the bottom of the preferences and friends sheets (the `#live` text). Preferences sheet at 60dvh with no scrim, so the week stays visible.
- [ ] **U-21:** desktop header in one row (scope, semester, pills); the prerequisite line becomes collapsible.
- [ ] **U-27 + U-28:** map chrome in one row (zoom buttons over a map corner); keep "חלופה 1/10" at 320; the two floating chips become one segmented control.
- Verify: the audit's own measurement table, re-run at every width. Chrome share at 320x640 under 25% (today 34%), first lesson block above y=300 at 375 (today 340).

### Stage 6: `feat/first-run` (M): onboarding and empty states
- [ ] **U-04:** the gate gets a tagline and a faded sample week behind the card. The track select starts on "בחרו מסלול" (no silent Mechanical Engineering), the year stays disabled until a track is chosen, an explicit "המשך" button, and the card centred at 1000px and wider.
- [ ] **U-05:** one dismissible first-use banner on the plan ("לחצו על שיעור כדי לנעוץ או להחליף קבוצה. החצים למעלה מציגים עוד חלופות."), remembered.
- [ ] **U-30:** a zero-course result renders the "לא נמצאה מערכת" card with "פתח העדפות". Flag the solver side (a hard constraint that removes every course) to the solver owner.
- [ ] **U-15:** one red tag per row in the lesson sheet; the rest as plain text.
- [ ] **U-18:** the file import becomes a drop zone styled like `.fr-empty`, with a real button.
- [ ] **U-31:** `legal.html` gets the `.top` bar and the tab style.
- [ ] Idea 6: the day selector opens on today (or the next day with lessons) and draws a "now" line.

### Stage 7: `docs/readme` (M): README and repo presentation
Source: `readme-review.md`. Copy rewrites are in its "Copy rewrites" table; RTL rules in "RTL guardrails".
- [ ] New README by the "Proposed outline" (10 blocks, about 130 lines), wrapped once in `<div dir="rtl" lang="he">`. The CTA is a bold link right under the tagline (not an h2); 3 badges in Hebrew (tests, data freshness via `last-commit?path=web/data/afeka/status.json`, privacy). Open each shields URL once before committing (the agent wrote them from memory).
- [ ] Move without deleting: `docs/DEVELOPING.md` (lines 98-165), `docs/OPERATIONS.md` (165-196), `docs/ARCHITECTURE.md` (198-233, tree as a table plus a mermaid diagram), `docs/COVERAGE.md` (74-94), root `CONTRIBUTING.md` (235-241), `docs/README.md` index (243-256), new `docs/FORKING.md` (R-15).
- [ ] Data-flow ASCII becomes a mermaid `flowchart RL` (R-04). No Hebrew in fenced code.
- [ ] Issue forms: `.github/ISSUE_TEMPLATE/{data-error,bug,feature}.yml` + `config.yml` (R-14).
- [ ] Visuals: extend `shoot.mjs` with `--png --out docs/media`, using the demo seed (`styles/seed.js`, fictional friends) and pinned data. 7 images per the "Visual assets plan" (hero desktop, week phone, map desktop and phone, friends phone, two GIFs), each under budget (PNG ≤150 KB, GIF ≤1.5 MB, folder ≤3.5 MB). After stage 4, a `<picture>` light/dark pair becomes possible for the hero.
- [ ] Terms aligned with the site ("ייצוא ליומן", "מפת התקדמות"/"מפת הקורסים": pick one in both places), plural addressing, "בדקה" dropped from the tagline (R-10).
- Verify: `gh api markdown -f mode=gfm -f text="$(cat README.md)"` keeps `dir`; view the pushed branch at 375 and 1280.
- **Owner only (settings, 5 minutes):** About description, website, topics, upload `web/og.png` as the social preview, labels, retitle or close issue #9, private vulnerability reporting. Exact values: `readme-review.md` → "Repo settings for the owner".

### Stage 8: general improvements (each its own small plan later)
Ordered by value for students vs effort:
1. **Install and offline (PWA)** (M): `manifest.webmanifest`, `theme-color`, apple-touch-icon, and a cache-first service worker for the static files and network-first for `data/` (U-ideas 4). Works on bad campus Wi-Fi. Fits the CSP (`worker-src 'self'`).
2. **Save the week as an image / print** (M): a `@media print` sheet (grid only) and "שמור כתמונה" (canvas from the grid model, no new library). Lock-screen and WhatsApp use.
3. **Visual regression in CI** (M): GitHub's Ubuntu runner has Chrome. A job runs `serve.py` + `shoot.mjs` and fails on any contrast fail or overflow. Today's script already reports both.
4. **Compact density toggle** (M): smaller `--ppm`, one-row course cards (U-07, U-09, U-21).
5. **"מה השתנה מאז הביקור הקודם"** (S-M): the app already keeps the data version and pins; show "2 groups you pinned filled up" from the nightly diff.
6. **Exam calendar view** (M), when the nightly publishes exams (issue #9).
7. **View transitions** between the plan and `#me` (S, idea 10).

## Order and size

| Order | Stage | Size | Depends on |
|---|---|---|---|
| 1 | 0 housekeeping | S | none |
| 2 | 1 tokens | M | 0 |
| 3 | 5a phone quick fixes | S | none (parallel to 1) |
| 4 | 2 motion | M-L | 1 |
| 5 | 3 clarity | M | 1 |
| 6 | 4 night | M-L | 1, 3 |
| 7 | 5b phone structure | M-L | 2 |
| 8 | 6 first run | M | 3 |
| 9 | 7 README | M | 3 (screenshots of the final look), 4 for dark pictures |
| later | 8 improvements | M each | none |

Stage 5a and the README text (without pictures) can start at once. Pictures wait for stage 3, so they are not retaken.

## Done when
- Stages 0-7 merged. `npm test` green. `ui:shots` 0 contrast fails in light and dark at 375 and 1280.
- The audit's measurement table re-run: no overflow at 320 anywhere (including the friend editor), chrome under 25% at 320x640, every overlay animated, reduced motion clean.
- README about 130 lines, RTL-correct on GitHub at 375 and 1280, with real screenshots. The owner has set the About fields.
- `app.md` amended (D-B), and `ACCESSIBILITY-AUDIT.md` corrected for 1.4.11.
