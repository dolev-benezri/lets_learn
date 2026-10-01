# Disclaimer to footer + terms rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the "כלי עזר לא רשמי" line into a real page footer and rewrite TERMS.md and the README disclaimer to cover everything the refresh/deploy research raised.

**Architecture:** Static HTML. The line becomes the content of a `<footer class="site-foot">` at the end of `<body>`. TERMS.md is a full Hebrew rewrite. No JS.

**Tech Stack:** HTML/CSS in `web/index.html`, Markdown, `node --test`.

**Spec:** user bug map item 4 in `.superpowers/next-session.md` + research report `origin/claude/cool-hawking-xhinen:docs/research/refresh-deploy/report.md` (sections "הנימוס נקבע אצלנו" and "24 KB של נתונים").

## Global Constraints
- No personal data in the repo: no name, no email. Contact means "פתחו issue ב-GitHub" plus the link `https://github.com/dolhack/lets_learn/issues`.
- Hebrew, RTL, contrast ≥ 4.5:1, links ≥ 44px tap height on phones.
- On phones a fixed bottom bar exists (`--bar-h`). The footer must not hide behind it: `padding-bottom: calc(var(--bar-h) + 16px)` under `@media (max-width:599px)`.

## Review Focus
- Phone 375px: footer fully visible above the bottom bar, no horizontal scroll.
- The drawer docked at ≥900px reserves `--drawer-w`. The footer must respect that reserve like the main layout does.
- The line appears exactly once in the page.

---

### Task 1: Footer

**Files:**
- Modify: `web/index.html:493` (remove `<p class="disclaimer">…</p>` from the header) and add a footer just before `<dialog id="drawer"`.
- Test: `test/app.test.mjs`

- [ ] **Step 1: Write the failing test** (append to `test/app.test.mjs`, which already imports `node:test` and `assert`; add `import { readFileSync } from 'node:fs';` if missing)

```js
test('the unofficial-tool line lives once, inside the page footer', () => {
  const html = readFileSync('web/index.html', 'utf8');
  const foot = html.match(/<footer class="site-foot"[\s\S]*?<\/footer>/)?.[0] ?? '';
  assert.match(foot, /כלי עזר לא רשמי/);
  assert.match(foot, /TERMS\.md/);
  assert.equal(html.split('כלי עזר לא רשמי').length, 2);
});
```

- [ ] **Step 2: Run, expect FAIL** (no footer): `node --test test/app.test.mjs`
- [ ] **Step 3: Implement.** Delete the `<p class="disclaimer">` line. Add before `<dialog id="drawer"`:

```html
<footer class="site-foot">
  <p>כלי עזר לא רשמי, שאינו קשור למכללת אפקה. הנתונים נלקחים מהידיעון הציבורי ועלולים להיות שגויים או ישנים. ההרשמה באפקה-נט היא הקובעת.</p>
  <p><a href="https://github.com/dolhack/lets_learn/blob/main/TERMS.md" target="_blank" rel="noopener">תנאי שימוש ופרטיות</a> · <a href="https://github.com/dolhack/lets_learn/issues" target="_blank" rel="noopener">דיווח על טעות או בקשת הסרה</a></p>
</footer>
```

  Next, add CSS next to the old `.disclaimer` rule, and delete that old rule:

```css
.site-foot { margin: 32px auto 0; padding: 16px; max-width: 72ch; text-align: center; font-size: var(--fs-sm); color: var(--text-2); border-top: 1px solid var(--border); }
.site-foot a { display: inline-block; padding: 12px 4px; color: var(--primary); }
@media (min-width:900px) { body.drawer-open .site-foot { margin-inline-start: var(--drawer-w); } }
@media (max-width:599px) { .site-foot { padding-bottom: calc(var(--bar-h) + 16px); } }
```

  Before relying on the `body.drawer-open` selector, check that the main layout reserves the drawer width the same way (`grep -n "drawer-w" web/index.html`), and copy whatever selector it uses.
- [ ] **Step 4: Run, expect PASS:** `npm test`, 149 pass.
- [ ] **Step 5: Check in Chrome at 375/1024/1440** (one browser agent only): the footer is visible, nothing covers it, and there is no horizontal scroll.
- [ ] **Step 6: Commit** `fix(ui): unofficial-tool line moves to the page footer`

### Task 2: TERMS.md and README rewrite

**Files:** `TERMS.md` (full rewrite), `README.md` (disclaimer blockquote + "רישיון ותנאי שימוש" section)

- [ ] **Step 1: Write TERMS.md with exactly these sections (Hebrew):**
  1. `## מה זה` — an unofficial student tool, not affiliated with or endorsed by Afeka College. Its name and design do not represent the college.
  2. `## הנתונים` — courses, groups, hours, lecturers, prerequisites and exams come from the public yedion (yedionpub.afeka.ac.il). They are collected automatically and may be wrong, partial or stale. The date of the last check appears on the site. Afeka-net and the official regulations always decide.
  3. `## איך אנחנו אוספים` — a slow scan (at least 2.5 s between requests), one request at a time, at night, with a User-Agent that names the tool. It stops at the first block. No login and no access to private pages.
  4. `## שמות מרצים` — lecturer names appear exactly as published in the yedion. We do not enrich them, build history per lecturer, or feed them to AI systems. Removal requests go through a GitHub issue.
  5. `## פרטיות` — no account, no server, no tracking. Your choices are saved only in your browser (localStorage). Friend and backup links carry your data inside the link itself (after the `#`, which is not sent to the server). Whoever holds the link sees what is in it.
  6. `## אחריות` — AS IS, no warranty. No liability for any damage, including missed registration, a wrong course or academic standing. Check everything against official sources.
  7. `## רישיון` — code under MIT (`LICENSE`). Yedion data belongs to its owners.
  8. `## שינויים ויצירת קשר` — the terms may change, and the version in the repo is the binding one. Contact via GitHub issues.
- [ ] **Step 2: README** — replace the disclaimer blockquote with a 2-line summary of sections 1, 2 and 6, plus a link to TERMS.md. In "רישיון ותנאי שימוש", keep the credit line "נבנה על ידי dolhack…" and add a link to the issues page for removal requests.
- [ ] **Step 3: Grep check:** `grep -rniE "@gmail|dolev" TERMS.md README.md web/` → expect no output.
- [ ] **Step 4: Commit** `docs: terms and README cover data source, scraping, lecturer names, privacy`
