# README / GitHub presentation review

Reviewed 2026-10-08 at `af5a15a` (main). Read-only review: no project file except this one was changed.
Method: read README.md (264 lines), web/og.png, LICENSE, TERMS.md, docs/ list, .github/, git log, web/index.html wording;
fetched the live repo page HTML (`curl https://github.com/dolev-benezri/lets_learn`) and ran GitHub's own renderer
(`gh api markdown -f mode=gfm`) on probe snippets to see what the sanitizer keeps. Repo state read with `gh repo view`.

Facts verified empirically (they drive most findings below):

| Probe | Result |
|---|---|
| GitHub sets `dir="auto"` on `<p>`, `<h1-3>`, `<ul>`, `<ol>`, markdown-heading `<div>`, alerts | yes (live page: 15 p, 12 ul, 5 ol, 19 h3 all `dir="auto"`). So Hebrew paragraphs/lists already render RTL. |
| `<blockquote>` (README line 20) | rendered bare, no `dir` |
| `<table>`, `<th>`, `<td>` | no `dir`; they inherit direction from the page (LTR), so column 1 is on the LEFT |
| `<pre>` / fenced code | always LTR |
| `<div dir="rtl" lang="he" align="right">` | `dir`, `lang`, `align` kept; `style=` stripped |
| Table / list / heading inside `<div dir="rtl">` (blank line after the tag) | rendered as markdown, inherits RTL (columns flow right to left) |
| `<picture><source media="(prefers-color-scheme: dark)">` | kept, wrapped in `<themed-picture>` |
| `<details dir="rtl"><summary>` | kept |
| `<video src=...>` | stripped entirely (only a bare `user-attachments` URL on its own line becomes a player) |
| ```` ```mermaid ```` | rendered client-side; `[!NOTE]` alerts supported |
| Auto "Outline" (TOC) button | already present on the live page (>= 2 headings) |
| Repo About | description empty, topics none, homepage empty, custom social preview not set (`usesCustomOpenGraphImage:false`) |
| Releases / issue templates / CONTRIBUTING | none (one open issue, #9, a personal TODO titled "בדיקות פתוחות...") |

## Findings

Severity: H high, M medium, L low. Effort: S under an hour, M a few hours, L a day+.

### R-01 H, repo settings, S: the repo front page has no About, no topics, no homepage URL, no custom social preview
Evidence: `gh repo view` -> `description:""`, `homepageUrl:""`, `repositoryTopics:null`, `usesCustomOpenGraphImage:false`; the live HTML contains
"No description, website, or topics provided". A student arriving from a shared link to the REPO (not the site) sees an empty sidebar, and a pasted repo link in
WhatsApp shows GitHub's generic generated card instead of og.png. Fix: owner sets description, homepage = site URL, topics, uploads og.png as social preview
(section "Repo settings for the owner"). Highest value per minute in this whole review.

### R-02 H, lines 3-18, M: first screen on a phone does not get the student to the CTA
On GitHub mobile web the README sits below the repo header, About block and the file list, so the visible README start is roughly the first 8-12 lines of rendered output.
Rendered order today: H1 (3) -> H3 tagline (5) -> one sentence (7) -> 4 badges, wrapping to 2 rows (9-12) -> og.png (14, `width="800"` is shrunk to ~345px, a 29% scale: the
20px card text becomes ~6px and unreadable) -> **only then** the H2 CTA (16). The one action a student needs is below the image, i.e. likely below the fold at 375px.
Also the CTA is an `<h2>`, so it pollutes the auto Outline with "לפתיחת האתר ←".
Fix: CTA directly under the tagline, as a bold link or a shields "for-the-badge" button (not a heading); image after it; badges collapsed to 3 and
moved under the image or into the footer. See Proposed outline, block 1.

### R-03 H, lines 78-86, 147-162, 245-256, S: all three tables render left-to-right
Probe: `<table>` carries no `dir`, so it takes the LTR page direction. Result: in the coverage table (78) "תוכנית" is the LEFT column and the Hebrew text in each
cell is LTR-based (trailing punctuation and parentheses such as `[יום (תשפ״ו)]` in line 84 land on the wrong side). The flags table (147) mixes `--year` (LTR) with Hebrew in
a row ordered LTR; the docs table (245) is the same.
Fix: wrap each table (or the whole page body) in `<div dir="rtl">` + blank lines. Verified to survive the sanitizer. Limit: `style=` and `text-align` are stripped, so
alignment must come from `dir` and `align`, not CSS.

### R-04 H, lines 123-126 and 200-218, S/M: Hebrew inside fenced code is scrambled
Code blocks are always LTR. Line 124-125 puts Hebrew labels in parentheses between `->` arrows: visually the arrows point "backwards" for an RTL reader, and the
parentheses around Hebrew runs flip. The project tree (200-218) puts Hebrew descriptions after file names in one LTR line, with `(+ fixtures של HTML אמיתי)` (201)
scrambling order.
Fix: replace the data-flow ASCII with a mermaid `flowchart RL` (GitHub renders it; Hebrew labels work in the SVG) or an English-only diagram; replace the tree with a
2-column table (path | purpose) inside an RTL div. Limit: mermaid text is not selectable as a screen-reader-friendly list, so keep a one-line text caption.

### R-05 H, whole file, M/L: 63% of the README is developer/operator material, in front of students
Lines 24-95 (students, 72 lines) vs 98-265 (developers and the owner's runbooks, 168 lines). Lines 167-188 are the OWNER's operations (GitLab CI minutes, GH_PUSH_TOKEN
renewal, year rollover) and 190-196 is "add a program". Students never reach the footer; developers have to scroll past 95 lines of marketing. And a fork-for-another-college
reader has no entry point at all (see R-15).
Fix: README = student page + 15-line developer stub. Move: 98-165 -> `docs/DEVELOPING.md`; 167-196 -> `docs/OPERATIONS.md` (owner runbooks); 198-233 ->
`docs/ARCHITECTURE.md`; 235-241 -> `CONTRIBUTING.md` (root, so GitHub shows the "Contributing" tab and links it from new-issue/PR pages); 243-256 -> `docs/README.md` (index);
74-94 -> `docs/COVERAGE.md` with a compact table left in the README.

### R-06 M, lines 30-62, M: the feature list is a wall of text with no pictures
7 H3 groups, ~33 bullets, zero images. Several bullets pack 4-6 ideas (35, 41, 47-48). A student scanning for "will this solve my problem" has to read prose. Lines 51-52 repeat 27 and 36
(friends), 60-62 repeat the badge row (12) and the disclaimer (20) (privacy x3), 20/262 repeat the disclaimer.
Fix: three picture-led blocks (week + alternatives / progress map / friends), 2-3 lines each, and the long list behind one `<details>` ("כל היכולות"). Dedupe privacy into one section.

### R-07 M, visuals, M: og.png is the only image and it is a marketing card, not the product
It is a good 1200x630 card (reads at desktop width; the bottom-left map chip and the right text are the strongest parts) but it shows a stylised week, no real alternatives UI,
no phone view, no progress-map interaction. The owner's priority is phone widths and animation, and the README shows neither. 140 KB.
Fix: see "Visual assets plan". Keep og.png as the social preview, not as the README hero.

### R-08 M, lines 20, 12, 60, 62, 241, 262, S: trust signals exist but are scattered, legalistic or vague
- Disclaimer (20) is correct and prominent but reads as legal boilerplate ("ניתן כמות שהוא, בלי שום אחריות") and has no dir. A shorter plain version should sit at the top.
- Privacy: only an English-language badge (12) and "בלי חשבון ובלי שרת" (60). "בלי שרת" is slightly inaccurate (GitHub Pages is a server; OCR loads tesseract.js from jsDelivr, line 231) and
  does not say the important thing: the schedule is not sent anywhere; a friend/backup link contains the data in its address.
- Freshness (62, 130): "נתונים עדכניים" with no date. The site has a "נבדק לפני..." header; the README can show it with a dynamic badge (see R-09).
- "How to report a wrong course/time": only at the very bottom (241, 262) and requires a GitHub account, which many students do not have. No issue template, so reports will lack program/semester/course.
Fix: one "פרטיות ונתונים" block high on the page (6 bullets), freshness badge in the header, report link with a prefilled issue form, plus an optional non-GitHub channel (owner's decision).

### R-09 M, lines 9-12, S: badge row is English, one badge is cryptic, and none tells a student what they care about
`deploy` (9) is the Actions status of a workflow that also runs the whole test suite, so it is really "tests passing", but the label says deploy; `sign-up not needed` / `data stays in your
browser` (11-12) are English inside a Hebrew page; the license badge is useful for developers only. No freshness badge.
Fix (all shields.io, Hebrew labels need URL encoding): tests `https://img.shields.io/github/actions/workflow/status/dolev-benezri/lets_learn/deploy.yml?label=בדיקות`;
freshness `https://img.shields.io/github/last-commit/dolev-benezri/lets_learn?path=web/data/afeka/status.json&label=נתונים%20עודכנו` (the nightly scrape rewrites
status.json every successful run, line 130); `https://img.shields.io/badge/פרטיות-הכול%20נשמר%20בדפדפן-success`; keep license in the developer footer. Max 3 badges above the fold.

### R-10 M, copy, S/M: jargon, mixed addressing, inconsistent terms
Details and rewrites in "Copy rewrites". Headlines:
- Tagline "בדקה" (5): reads as "checked" (the Hebrew word בדקה = she checked) or "in a minute"; the og.png and meta copy the same ambiguity.
- Jargon for students: "Web Worker" (33), "לימודים על תנאי והרחקה" (41) without explanation, "ציון אמירנט" (41, 66) never defined, "אילוצים" (28), "ייבוא ... מילוי בעורך" (51).
- Mixed gender: README addresses a masculine singular reader ("שלך" 7, 20; "עברת או נכשלת" 40, 66) while the site speaks plural ("גיבוי שיצרתם"). Use plural.
- Term drift vs the site (`web/index.html`, `ui-*.js`): README "ייצוא ללוח שנה" (56) vs site "ייצוא ליומן"; README "מפת התקדמות" (45, 71) vs site mostly "מפת הקורסים" / "המפה"
  (one "מפת התקדמות"); README "גיבוי בקישור פרטי" (57) vs site "גיבוי". "מערכת" means both "my schedule" and "system" (line 3 vs 47 "מחליפים מערכת"); "מסלול" (66) vs table header (78) vs
  "תוכנית" are used interchangeably.

### R-11 M, line 20, S: the disclaimer blockquote has no direction and an inline link that is easy to miss
Bare `<blockquote>` (probe). Inside an RTL wrapper it is fine; also consider a GitHub alert (`> [!NOTE]`, renders with `dir=auto`) so it is visually a callout. Alert title renders in English
("Note"); acceptable but a custom bold first line in Hebrew inside a plain blockquote is better for a Hebrew page: do that, and keep it inside the RTL div.

### R-12 M, directory-level clutter visible from the repo root, S
- A real college PDF, `הסבר התמחויות - חשמל.pdf`, sits untracked in the repo root and is NOT in .gitignore (verified `git check-ignore`): one `git add .` publishes a college document. Add `*.pdf` (or the folder) to .gitignore. Same for untracked `NOTES.md` (handoff note).
- Root also holds `solver-audit/`, `design-system/`, `ci/`, `TERMS.md`; `docs/superpowers/` (33 plans, 3 specs, AI-workflow artefacts) is linked from the README docs table (253-254). A developer sees process noise before the docs that matter.
  Fix: README links only to `docs/README.md`; consider moving `solver-audit/` under `docs/` and renaming `docs/superpowers` -> `docs/plans` (only if the owner agrees; links in docs would need an update).

### R-13 L, lines 74-94, S: the coverage section is long and will go stale
14 long afeka.ac.il PDF links in a table (each wraps badly on a phone), plus 4 bullets of caveats with dates ("3.10.2026", "תשפ״ז" semester, exams "עוד לא פורסם" at 92) that will be false by next
semester. Fix: README keeps one line + a 7-row table (program | day | evening, no PDF links); move links and caveats to `docs/COVERAGE.md`, and let the site be the source of truth for "what is loaded now".

### R-14 L, repo files, S/M: no FAQ, issue templates, CHANGELOG/releases, CONTRIBUTING, SECURITY
- No `.github/ISSUE_TEMPLATE/` -> reports arrive free-form. Suggest 3 forms: "טעות בנתונים" (program, cohort, semester, course/group, what the site shows vs the yedion), "באג", "בקשה"; `config.yml` with `blank_issues_enabled: false`.
- No releases: for a continuously deployed static site a CHANGELOG is optional; a short "מה חדש" section on the site or GitHub Releases per milestone (e.g. "מפת התקדמות עם חלופות") gives students a reason to return. Low priority.
- FAQ: absent; the questions already answered in README prose (privacy, how to move to a phone, why no exam dates, can I use it for a master's program) become 6 `<details>` items.
- Issue #9 is a private TODO in public view; rename to something students can read or close/convert.

### R-15 L, developers audience 2, M: nothing for "fork this for another college"
The scraper is Afeka-specific (`yedionpub.afeka.ac.il`, `programs.json`), but the data format (`web/data/afeka/{year}-{sem}/{prog}-{cohort}.json`) and the solver/rules are the reusable parts.
Fix: `docs/FORKING.md` (1 page): what is college-specific (scrape.mjs, parse.mjs, programs.json, the regulations in rules.js section numbers), what is generic (solver-core, grid UI), the JSON schema, and a pointer to the "add a program" steps. One README line links it. No code needed now.

### R-16 L, lines 47, 69, S: mirrored bracket characters in instructions
`‹ ›` (U+2039/203A) are Bidi_Mirrored, so inside an RTL run the glyphs can swap sides, and the reader cannot tell which is "next". The site buttons are right-pointing "previous" and left-pointing "next" (index.html lines 38-40,
`chevron-right` = previous). Fix: describe in words ("החצים בראש הלוח, או חצי המקלדת") and avoid the symbols in instructions.

### R-17 L, line 16 and 14, S: image and link details
Image alt text is already Hebrew and descriptive (good). `width="800"` is clamped by GitHub's injected `max-width:100%` (verified), so there is no overflow bug, just the illegibility in R-02. The `←` arrow in the CTA is correct for RTL
(points the reading direction), keep it but make sure it is not hidden in the h2.

### R-18 L, developer-facing accuracy, S
Line 119 lists what `npm test` covers but not the count; the handoff notes 477 tests. A static number in the README rots; say "מאות בדיקות" or put the count only in `docs/DEVELOPING.md`.
`package.json` has `"private": true` and no `repository`/`homepage` fields: add them if the owner wants npm tooling and GitHub to link consistently (optional).

### What is already good (keep)
Hebrew alt text on the image; clear unofficial disclaimer present; MIT license in root and stated; the start-guide (64-72) is concrete and in the right order; data-flow and CI explanation (121-134) is unusually thorough for developers
(just misplaced); relative links used throughout (GitHub rewrites per branch); no emoji spam; auto Outline already gives navigation.

## Proposed outline

Target: README about 130 lines (from 264), student part at most 105 lines, developer stub about 20 lines. The whole body is wrapped once in `<div dir="rtl" lang="he">`
(blank line after the opening tag and before the closing tag so markdown still renders; verified). Do not put `style=`.

| # | Section (heading) | Purpose | Approx lines |
|---|---|---|---|
| 1 | Hero block, centered: `# המערכת שלי`, one-line value, **CTA link** (bold, not a heading), 3 badges, hero image (`<picture>`) | In 5 seconds: what, for whom (Afeka students), where to click. CTA is the first link, above the image | 14 |
| 2 | Short disclaimer (blockquote, 2 lines): unofficial + may be wrong, registration in Afeka-net decides, link to terms | Trust, in plain Hebrew; replaces legalese at line 20 | 3 |
| 3 | `## מה זה עושה` : three picture blocks (week + alternatives, progress map, friends), 2-3 lines each | Show, then tell. Phone screenshot next to desktop | 24 |
| 4 | `## איך מתחילים` : 5 numbered steps (merge today's 7) | Activation path; ends with "העתיקו לאפקה-נט" | 9 |
| 5 | `## עוד יכולות` : one `<details>` with the grouped feature list (today's lines 32-62, trimmed to about 14 bullets) | Completeness without the wall of text | 18 |
| 6 | `## פרטיות ונתונים` : 5-6 bullets: stays in browser, what a share/backup link contains, no account, nightly update + freshness badge, unofficial, **how to report a wrong time** (issue form link) | The single home for all trust content (kills the 3 duplicates) | 10 |
| 7 | `## מה נתמך` : 7-row table program x day/evening, 1 sentence on cohorts/semesters, link to `docs/COVERAGE.md` | Answer "is my program here" without 14 PDF links | 12 |
| 8 | `## שאלות נפוצות` : 6 `<details>` (nowhere to log in? moving to my phone; exams not shown; master's programs; wrong data; can I use it offline/for another college) | Reduces issues; each answer 1-2 lines | 20 |
| 9 | `## למפתחים` : 3-sentence pitch (vanilla JS, no build, static Pages, nightly scrape), mermaid data-flow `flowchart RL`, 4 commands (`npm ci`, `npm test`, `npx http-server web -p 8080 -c-1`), links: DEVELOPING, ARCHITECTURE, CONTRIBUTING, FORKING | Developer entry without the runbooks | 20 |
| 10 | Footer: license MIT + author, font OFL, legal page, link to `docs/README.md` | Compliance | 4 |

Things deliberately removed from the README: manual scrape flags table (147-163), CI minutes/GitLab runbooks (165-169), token renewal (171-179), year rollover (181-188), add a program (190-196),
project tree and logic core (198-233), docs index (243-256). Each moves, nothing is deleted.

New/changed files this implies (owner approves; none created by this review):
- `CONTRIBUTING.md` (root): branch flow, `npm test` green, 200-char line rule, no secrets, how to report; 25 lines from README 235-241.
- `docs/DEVELOPING.md`: README 98-165 (local run, tests, data flow, manual scrape, flags table) plus the real test count.
- `docs/OPERATIONS.md`: README 165-188 (CI minutes, first nightly run, GH_PUSH_TOKEN, year rollover). Owner-only.
- `docs/ARCHITECTURE.md`: README 198-233 as a path/purpose table, plus mermaid module diagram.
- `docs/COVERAGE.md`: README 74-94 with PDF links and dated caveats.
- `docs/FORKING.md`: new, one page (R-15).
- `docs/README.md`: index replacing README 243-256, hides `docs/superpowers` behind one line.
- `.github/ISSUE_TEMPLATE/{data-error,bug,feature}.yml` and `config.yml`.
- `.gitignore`: add `*.pdf` for the root, `NOTES.md` if it stays local.

### Optional collapsible rule
Use `<details>` only for (5), (8) and long tables. Do NOT hide the privacy block, the CTA, or the report link. Add `dir="rtl"` on the `<details>` tag itself if it is outside the global wrapper (verified kept); the
`<summary>` text then aligns right. Do not add a manual table of contents: the Outline button already exists, and once the README is about 130 lines it is not needed. If you want jump links for students,
a single line under the hero ("יכולות · פרטיות · שאלות נפוצות · למפתחים") with anchors is enough; Hebrew heading anchors work on GitHub (`#פרטיות-ונתונים`).

### Hero skeleton (Hebrew; for the implementer to paste and adjust)
```html
<div dir="rtl" lang="he">
<div align="center">

# המערכת שלי

**בונים מערכת שעות לאפקה: בוחרים קורסים, מקבלים עד 10 מערכות בלי התנגשויות.**

**[לפתיחת האתר ←](https://dolev-benezri.github.io/lets_learn/)**


[![בדיקות](https://img.shields.io/github/actions/workflow/status/dolev-benezri/lets_learn/deploy.yml?label=%D7%91%D7%93%D7%99%D7%A7%D7%95%D7%AA)](https://github.com/dolev-benezri/lets_learn/actions/workflows/deploy.yml)
[![נתונים עודכנו](https://img.shields.io/github/last-commit/dolev-benezri/lets_learn?path=web%2Fdata%2Fafeka%2Fstatus.json&label=%D7%A0%D7%AA%D7%95%D7%A0%D7%99%D7%9D%20%D7%A2%D7%95%D7%93%D7%9B%D7%A0%D7%95)](https://dolev-benezri.github.io/lets_learn/)
![פרטיות](https://img.shields.io/badge/%D7%A4%D7%A8%D7%98%D7%99%D7%95%D7%AA-%D7%94%D7%9B%D7%95%D7%9C%20%D7%91%D7%93%D7%A4%D7%93%D7%A4%D7%9F-success)

<img src="docs/media/hero-desktop.png" alt="..." width="720">

</div>
```
Note: the CTA is a bold link, deliberately not a heading, so it stays out of the Outline (R-02). For more weight use a shields "for-the-badge" image as the link.

## Visual assets plan

Constraints found: the site has NO dark theme (`grep prefers-color-scheme web/*.css` = 0), so a `<picture>` dark/light pair of screenshots would show the same light UI twice; skip it for screenshots and
bake a 1px neutral border plus 8px radius into each image so a white screenshot does not melt into GitHub's white (or dark) page. Use `<picture>` only for a text-free logo/banner if one is ever made.
GitHub README content column is about 880px wide on desktop and about 345px on a 375px phone; images are auto-clamped to `max-width:100%`. `<video>` is stripped (probe), so animations are GIF (or a
drag-dropped `user-attachments` MP4 URL on its own line, which becomes a player but lives outside the repo).

Where they live: `docs/media/` (not `web/`, so the site deploy stays untouched; the deploy workflow only triggers on `web/**`, so media commits do not redeploy). Names: `NN-topic-device.ext`.
Reference with relative paths (GitHub rewrites per branch). Alt text in Hebrew, describing what is visible and the point ("לוח שבועי של חלופה 1 מתוך 10, שיעור משותף עם חבר מסומן").

Budgets: PNG at most 150 KB each (pngquant 64-128 colors + oxipng; screenshots of flat UI compress very well), GIF at most 1.5 MB each and 8 s (15 fps, 2-3 distinct frames per action, palette 128), whole `docs/media/` at most 3.5 MB.
Binary history never leaves git, so regenerate rarely (per major UI change), and commit only when the picture meaningfully changes.

| # | File | Shows | Size / shown width | Used in |
|---|---|---|---|---|
| 1 | `01-hero-desktop.png` | Desktop week board, alternative 3 of 10 selected, side panel with courses (חובה/אולי/לא), a shared lesson marked with a friend, summary pills | 1280x800 viewport, export 1280 wide, `width="720"`; at phone width it scales to 345px, so text must be 14px+ in the source: crop to the board + header, not the full window | Hero (section 1) |
| 2 | `02-week-phone.png` | Phone (390x844, DPR 2): week board, alternative switcher visible, 2 friend rings | export 390 wide (downscaled from 780), `width="260"` | Block "מערכות בלי התנגשויות" |
| 3 | `03-map-desktop.png` | Progress map, a course focused with its prerequisite chain lit, mini week pane open, alt switcher in header | 1280x800, crop 1100x620, `width="720"` | Block "מפת התקדמות" |
| 4 | `04-map-phone.png` | Phone map with the mini-pane sheet open | 390 wide, `width="260"` | same block, beside #3 on desktop |
| 5 | `05-friends-phone.png` | Friend schedule imported, shared lessons marked, import dialog showing "הדביקו קישור" (fake names only) | 390 wide, `width="260"` | Block "עם חברים" |
| 6 | `06-switch-alt.gif` | Desktop map: click next alternative -> path flash (the 1.8 s `.spot`), zoom kept | 800x500, 6 s, at most 1.5 MB, `width="720"` | Block "מפת התקדמות", under #3 |
| 7 | `07-mark-courses.gif` | Phone: mark a course "נכשלתי" -> prerequisite chain greys -> alternatives rebuild | 390x844 export 260 wide, 8 s, at most 1.5 MB, `width="260"` | Block "לפי התקנון והמצב שלך" |
| 8 | (optional) `08-register-list.png` | "רשימה להרשמה" panel with its copy button for Afeka-net | 390 wide | FAQ/steps |

Phone layout inside README: a one-row `<table dir="rtl">` with 2 images does not shrink well at 345px (about 150px each, illegible). Instead stack phone shots one per row (`width="260"`, centered) and put text beside only on desktop,
or provide one composite "three phones" PNG (1200x900, three device crops side by side, shown with `width="720"`, scales as a unit and stays consistent). Recommendation: composite for the hero strip, singles inside the three feature blocks.
If images 2/4/5 are put in `<details>` ("עוד תמונות") the page above the fold stays light on mobile data.

### Hero choice
Replace the `og.png` hero with #1 (real product beats a marketing card on the README; the card stays as social preview and site `og:image`). If the owner prefers to keep `og.png` in the README for now it is acceptable, but it must
be moved below the CTA and not larger than `width="720"`; legibility at phone width stays poor.

### How to produce them reproducibly (describe, do not build)
1. Frozen input, so screenshots do not change each night: pin the data. Run the site locally from a tag/commit of `web/data/afeka` (e.g. `git worktree add ../media-data <commit>`, `npx http-server web -p 8080 -c-1`) and record the commit hash in `docs/media/README.md`.
2. Frozen state: the app restores from a backup link (`readHash` in `web/share.js`, line 334 of `app.js`). Create ONE demo backup link: program 30 (software engineering), cohort 2026, a handful of passed/failed courses, 2-3 fictional friends (names like "נועה", "דנה", "רון"), pinned group, grade average blank. Store the `#...` fragment in `docs/media/DEMO-STATE.md`; every capture starts with `http://localhost:8080/#<fragment>`. Never use a real friend's schedule or the owner's own backup link.
3. Fixed viewports and DPR: desktop 1280x800 @2x, phone 390x844 @2x (the built-in browser's `resize_window` presets give 375x812 mobile and a custom size works; use a custom size so all runs are identical). Set `prefers-reduced-motion: no-preference` for the GIFs and stop the clock-dependent header ("נבדק לפני...") by hiding it with a one-off console snippet, or crop it out.
4. A short capture script (`scripts/media.md` as a checklist is enough, `scripts/media.mjs` only if someone wants Playwright, which would add a devDependency: not recommended while the repo has zero): ordered steps per image (open fragment, set viewport, focus course X, capture element `#board`/`#map`). For GIFs record with the browser's recorder (the Chrome tooling has a `gif_creator`), then post-process once: `ffmpeg -i in.mp4 -vf "fps=15,scale=800:-1:flags=lanczos,palettegen" ...` -> `gifsicle -O3 --lossy=60`. Commands go in the same checklist file.
5. Compression pass: `pngquant --quality=70-90 --strip`, `oxipng -o4`, check sizes with a 3-line shell loop; fail the checklist if any file exceeds its budget.
6. Verify on the real page: push the branch, open the README at 375px (browser pane resize) and at 1280, confirm nothing overflows and alt text is read.

## Copy rewrites

Style rules for the rewrite: plural addressing ("אתם", the site already says "שיצרתם"), one idea per bullet, student words first and developer words in the developer docs, site terms as the canonical names
(`ייצוא ליומן`, `נעיצה`, `חלופה`, `המצב שלי`, `הקורסים שלי`, `רשימה להרשמה`; verify "מפת הקורסים" vs "מפת התקדמות" with the owner and align README AND site to one).

| Line | Before | After |
|---|---|---|
| 5 | מערכת שעות לאפקה, בדקה | בונים מערכת שעות לאפקה: בוחרים קורסים ומקבלים עד 10 מערכות מוכנות |
| 7 | חלופות בלי התנגשויות, לפי התקנון ולפי המצב האישי שלך, וקרוב לחברים. | בלי חפיפות, לפי התקנון והקורסים שעברתם או נכשלתם בהם, ועם כמה שיותר שיעורים משותפים עם חברים. |
| 20 | **כלי עזר לא רשמי, שאינו קשור למכללת אפקה.** הנתונים נלקחים מהידיעון הציבורי ועלולים להיות שגויים או ישנים, וההרשמה באפקה-נט היא הקובעת. הכלי ניתן כמות שהוא, בלי שום אחריות. | **כלי לא רשמי של סטודנטים, ללא קשר למכללת אפקה.** הנתונים מהידיעון הציבורי ויכולים להיות שגויים או לא מעודכנים, ולכן ההרשמה באפקה-נט היא הקובעת. [תנאי שימוש ופרטיות](https://dolev-benezri.github.io/lets_learn/legal.html) |
| 24-26 | ## למה זה קיים / **כישלון בקורס משנה את כל המערכת.** מי שנכשל בקורס חייב לחזור עליו, וכל קורס שהוא דרישת קדם שלו נחסם. | ## למה זה שימושי / **נכשלתם בקורס? גם קורסי ההמשך שלו נחסמים.** הכלי מחשב את השרשרת ומראה מה עדיין אפשר לקחת בסמסטר הזה. |
| 28 | **חיפוש לפי אילוצים והעדפות**, ולא רק הצגה של רשימת הקבוצות. במקום לשבץ ביד, מקבלים חלופות מוכנות ומדורגות. | **לא משבצים ביד.** אתם קובעים מה חשוב לכם (ימים פנויים, בלי חלונות, שעות נוחות) ומקבלים מערכות מדורגות, מהטובה לפחות טובה. |
| 33 | **עד 10 חלופות מדורגות** על לוח שבועי. החיפוש רץ מחדש ברקע (Web Worker) בכל שינוי. | **עד 10 חלופות מדורגות** על לוח שבועי. החישוב מתעדכן אחרי כל שינוי, בלי לתקוע את המסך. (Web Worker: לעמוד המפתחים.) |
| 35 | **העדפות ואילוצים:** חברים, ימים פנויים, בלי חלונות, שעות נוחות ופיזור בחינות, כל אחד בסולם של 4 דרגות. יום חופש וטווח שעות אפשר להגדיר כחובה, וגם לכל היותר N ימים בקמפוס והעדפה או הימנעות ממרצה. | **מה חשוב לכם:** חברים, ימים פנויים, בלי חלונות, שעות נוחות ופיזור בחינות, כל אחד בארבע דרגות. **מה חייב להיות:** יום חופש, טווח שעות, מספר מרבי של ימים בקמפוס, או מרצה מסוים (או בלעדיו). |
| 41 | **תקנון:** דרישות קדם בשרשרת, קורסים מקבילים, חזרה על קורס שנכשלת בו, ואזהרות על לימודים על תנאי והרחקה. קורסי אנגלית מסומנים "פטור" לפי ציון אמירנט. | **תקנון:** דרישות קדם, קורסים מקבילים וחזרה על קורס שנכשלתם בו. מופיעה אזהרה כשהממוצע או מספר הכישלונות מסכנים אתכם (לימודים על תנאי, הרחקה). אם ציון האמירנט שלכם מספיק, קורסי האנגלית מסומנים כפטור. |
| 47 | **מעבר בין חלופות בתוך המפה:** ‹ › בכותרת מחליפים מערכת בלי לאבד את הזום. המסלול שבחרת מהבהב בצבע אחר והשאר דועך... | **מעבר בין חלופות בתוך המפה:** החצים בראש המפה מחליפים מערכת בלי לאבד את הזום. הקורסים של המערכת שנבחרה נדלקים לרגע והשאר מתעמעם, כך שרואים מיד מה השתנה. |
| 51 | ייבוא מערכת של חבר בקישור, מילוי בעורך מסך מלא, או הדבקת טקסט, PDF או תמונה (זיהוי הטקסט רץ בדפדפן). | מוסיפים חבר בכל דרך נוחה: קישור שהוא שלח, הדבקת טקסט, קובץ PDF או תמונה של המערכת שלו (זיהוי הטקסט נעשה בדפדפן שלכם), או מילוי ידני. |
| 56 | **ייצוא ללוח שנה** (קובץ `.ics`, עם החגים מוחרגים) ושיתוף הקישור לוואטסאפ. | **ייצוא ליומן** (קובץ `.ics`, בלי שיעורים בחגים) ושיתוף הקישור בוואטסאפ. |
| 57 | **גיבוי בקישור פרטי**, כדי לעבור למכשיר אחר בלי חשבון. | **קישור גיבוי:** מעבירים את הנתונים לטלפון או למחשב אחר בלי להירשם. הקישור כולל את הנתונים שלכם, אז שומרים אותו לעצמכם. |
| 60 | **בלי חשבון ובלי שרת:** הכול נשמר בדפדפן שלך בלבד. | **בלי הרשמה, ובלי שליחת הנתונים לשום מקום:** מה שסימנתם נשמר רק בדפדפן שלכם. |
| 62 | **נתונים עדכניים:** הקבוצות והבחינות נמשכות מהידיעון הציבורי בסריקה לילית. | **הנתונים מתעדכנים כל לילה** מהידיעון הציבורי. בראש האתר כתוב מתי נבדק לאחרונה. |
| 66 | נכנסים לאתר ובוחרים מסלול ושנת לימודים. אפשר להוסיף גם ציון אמירנט (אופציונלי). | נכנסים לאתר ובוחרים תוכנית, יום או ערב, ושנת לימודים. ציון אמירנט אפשר להוסיף אבל לא חובה: הוא קובע אם אתם פטורים מקורסי אנגלית. |
| 69 | מדפדפים בין החלופות ב-‹ › או בחצי המקלדת. | מדפדפים בין החלופות עם החצים בראש הלוח או עם חצי המקלדת. |
| 71 | רוצים לראות איך החלופה מתקדמת בתואר? פותחים את מפת ההתקדמות ומדפדפים בה בין החלופות. | רוצים לראות מה כל חלופה עושה לתואר? פותחים את מפת ההתקדמות ומחליפים בה בין החלופות. |
| 88-90 | **המקור:** ... נבדק ב-3.10.2026 מול תוכניות הלימודים העדכניות של תשפ״ז, ולא מול "הסבר התמחויות"... | (הפסקה עוברת כמות שהיא ל-`docs/COVERAGE.md`, עם התאריך. ב-README נשארת שורה אחת: "הקורסים והקבוצות מהידיעון, והדרישות לתואר מתוכניות הלימודים של תשפ״ז. הפירוט ב-COVERAGE.") |
| 241, 262 | באגים, בקשות והסרת מידע: issues. | מצאתם שיעור שגוי, שעה לא נכונה או רוצים שנסיר מידע? [פותחים פנייה](https://github.com/dolev-benezri/lets_learn/issues/new/choose) (צריך חשבון GitHub). בלי חשבון: (הבעלים יבחר ערוץ יצירת קשר) |

Notes on specific choices:
- Line 5/7: states the output (10 ready schedules) instead of a pun; "בדקה" is dropped from the README only, the og.png and meta can follow if the owner agrees.
- Line 60: "בלי שרת" is replaced because a static host and a jsDelivr OCR script exist (line 231); the promise that matters, and that is true, is "the data is not sent anywhere".
- Line 57: telling students the backup link contains their data prevents an accidental public share of grades (`share.js`: links carry the data in the hash).
- "תוכנית / מסלול / מחזור": define once in the FAQ ("תוכנית = מחלקה, מסלול = יום או ערב, מחזור = שנת תחילת הלימודים") and use only those.
- Keep English technical tokens inside backticks; avoid starting a bullet with a Hebrew prefix glued by hyphen to a long token ("ב-`--year`"): it renders correctly but is harder to scan.

### RTL guardrails (so the new README stays correct)
1. Wrap the body once in `<div dir="rtl" lang="he">` with blank lines inside. Tables, blockquotes and `<details>` then inherit RTL. Limit: `style` and inline CSS are stripped; only attributes like `dir`, `lang`, `align`, `width`, `alt`, `href`, `src`, `srcset`, `media` survive (probe).
2. Every list must START with Hebrew text: GitHub puts `dir="auto"` on the `<ul>`, not on each `<li>` (probe), so a list whose first item begins with `--year` or a filename renders the whole list LTR. If a list must start with a Latin token, put a Hebrew word first or use a table.
3. Fenced code stays LTR: keep code blocks English-only (commands, JSON, mermaid). No Hebrew comments in bash blocks (README 141-144 put Hebrew after `#`, which scrambles trailing text).
4. Numbers and units next to Hebrew are fine (`320px`). The risk is a sentence that BEGINS with a Latin token and ends in punctuation; start with a Hebrew word.
5. Do not use `‹ ›` or `<- ->` to mean direction in prose; use words. Use `←` only as the trailing "forward" arrow in RTL link text.
6. Badges and `<img>` are direction-neutral; keep them in the centered div, outside tables.
7. Use `&rlm;` (U+200F) only as a repair for a line ending in a Latin token plus punctuation that lands on the wrong side; with `dir="auto"` blocks it is rarely needed and it is invisible noise for editors.
8. Preview before merging: push the branch and open the README at 375px and 1280px, or run the file through `gh api markdown -f mode=gfm -f text="$(cat README.md)"` to see what the sanitizer keeps.

## Repo settings for the owner

Only the owner can click these (repo Settings, or the gear next to About). None is a file in the repo.

1. **About -> Description** (Hebrew, one line, used in search and link previews): `מערכת שעות לא רשמית לסטודנטים באפקה: חלופות בלי התנגשויות, לפי התקנון, עם חברים`
2. **About -> Website:** `https://dolev-benezri.github.io/lets_learn/`
3. **About -> Topics:** `afeka`, `timetable`, `scheduler`, `course-scheduling`, `hebrew`, `rtl`, `github-pages`, `vanilla-js`, `student-tools`, `israel` (topics are English slugs).
4. **Settings -> General -> Social preview -> Edit -> Upload:** `web/og.png` (1200x630, 140 KB). GitHub's guidance: recommended 1280x640, minimum 640x320, under 1 MB, PNG/JPG/GIF, so the file is in range; the 2:1 repo card crops slightly, keep text inside the central area (it already is). Today `usesCustomOpenGraphImage:false`.
5. **Settings -> General -> Features:** keep Issues on; turn Discussions on only if the owner wants a Q&A channel (otherwise the FAQ suffices); turn off Wikis and Projects if unused.
6. **Settings -> Pages:** confirm source = GitHub Actions (deploy.yml already publishes).
7. **Settings -> Code security:** enable private vulnerability reporting and Dependabot alerts (one runtime dependency, `node-html-parser`, plus vendored copies in `web/vendor/`).
8. **Issues -> Labels:** create `data-error`, `bug`, `enhancement`, `good first issue` so issue forms can auto-label (the forms are a file task, labels are a click task).
9. **Issue #9** ("בדיקות פתוחות..."): retitle in plain Hebrew or close; it is the first thing a visitor sees in the Issues tab.
10. **Releases (optional):** cut a first release so the sidebar shows "Releases"; later one per visible feature. Not needed for deploys.
11. **Branch protection on main (optional):** `deploy` as a required check protects the site from a broken merge, but the nightly scrape pushes straight to main with a token, so it needs a bypass; owner's decision.

## Sources

- GitHub Docs, Basic writing and formatting syntax (alerts, `<picture>`, relative links, auto-generated outline): https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax
- GitHub Docs, Customizing your repository's social media preview (min 640x320, 1280x640 recommended, PNG/JPG/GIF, under 1 MB): https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview
- GitHub Docs, Configuring issue templates (`.github/ISSUE_TEMPLATE/`, `config.yml`, `blank_issues_enabled`, issue forms): https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository
- DEV, "Add right-to-left text to your GitHub profile README" (the `<div dir="rtl">` technique): https://dev.to/benhayehudi/add-right-to-left-text-to-your-github-profile-readme-5c89
- CommonMark forum, "Explicit RTL indication in pure Markdown" (Markdown has no direction syntax; an HTML wrapper is the workaround): https://talk.commonmark.org/t/explicit-rtl-indication-in-pure-markdown/286/4
- Empirical probes (primary evidence, 2026-10-08): `gh api markdown -f mode=gfm` on snippets (kept `dir`/`lang`/`align`/`details`/`picture`; stripped `style` and `video`; mermaid and alerts supported) and the rendered HTML of https://github.com/dolev-benezri/lets_learn (auto `dir="auto"` on p/ul/ol/h1-3; bare `blockquote`/`table`; Outline present; About empty).
- Repo state via `gh repo view dolev-benezri/lets_learn --json ...`, `gh run list`, `gh issue list`.
- shields.io badge URL forms (`github/actions/workflow/status`, `github/last-commit?path=`, static `badge/`) are from prior knowledge and were not fetched in this review: test each badge URL once in a browser before committing.
