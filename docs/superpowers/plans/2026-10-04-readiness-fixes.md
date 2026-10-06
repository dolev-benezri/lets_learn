# Readiness Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every finding of the 2026-10-04 readiness re-assessment (B1, H1, M1-M5 in `docs/LAUNCH-READINESS.md`).

**Architecture:** Small, independent fixes in the existing vanilla ES modules, the static `index.html`/`legal.html`, and `ci/gitlab-scrape.yml`. B1 is a GitLab setting the owner changes (the session cannot sign in to GitLab).

**Tech Stack:** vanilla JS modules, `node --test`, GitLab CI (include:remote of `ci/gitlab-scrape.yml`), GitHub Pages.

**Spec:** `docs/LAUNCH-READINESS.md`, section "הערכה מחדש: 2026-10-04".

## Global Constraints

- No requests to the Afeka site or the yedion.
- Copy in Hebrew, same voice as the site; the site stays "כלי עזר לא רשמי" (no wording that suggests an official Afeka tool).
- Git identity dolhack; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Focused tests per task, full `npm test` (also `CI=1`) before merge.
- Out of scope: the minor items already listed in ISSUES §17ב, §18, §22 and the new-features deferred list.

## Review Focus

1. A student in year 2 must still get exactly the year-1 list (no change for the common case).
2. The CSP must not break the friend picture import (tesseract from jsdelivr: worker via blob, wasm, language data), the PDF import (vendored pdf.js) or the grade import.
3. The token-expiry job must never fail the scrape job or block a data push.
4. A plan with no exams, or one exam, must not rank below a plan with two exams on adjacent days.
5. The og image URL must be absolute and the file must exist in `web/`.

---

### Task 1 (H1): earlier years pre-marked, and an honest no-result message

**Files:** Modify `web/app.js` (`ensurePassed`), `web/ui-me.js:97`, `web/ui-view.js` (no-result branch). Test `test/program-switch.test.mjs`.

- [ ] Test: `ensurePassed: every earlier year's mandatory list is passed (year 3 = years א and ב)`: dataset with lists "קורסי חובה שנה א'" ['a'], "קורסי חובה שנה ב'" ['b'], "קורסי חובה שנה ג'" ['c']; startYear 2025 (year 3) gives `['a','b']`; 2026 gives `['a']`; 2027 gives `[]`. Run, see it fail.
- [ ] `ensurePassed`: union of the lists whose name has `שנה X'` for every X before the study year. The existing year-2 test keeps passing.
- [ ] Onboarding line: "(שנה א׳ מסומנת מראש)" for year 2, "(שנים א׳–ב׳ מסומנות מראש)" from year 3 (last letter = the year before).
- [ ] No-result message: when at least one of this year's courses is blocked by a course of an earlier year's mandatory list (`waitingOnEarlier` in app.js), add the line `N קורסים של השנה מחכים לדרישות קדם משנים קודמות שלא סומנו כ״עברתי״. עדכנו ב״המצב שלי״.` with a link to `#me`. (First drafted as "at least 5 blocked courses of the program", a noise filter for a count that also caught prereqs of the same year; the exact count needs no threshold. Review 2026-10-06.)
- [ ] Commit `fix(H1): earlier study years start as passed; the no-result message names blocked courses`.

### Task 2 (M3): examSpread for plans with fewer than two exams

**Files:** Modify `web/solver-core.js` (`metrics`). Test `test/solver.test.mjs`.

- [ ] Test `examSpread: one exam (nothing to crowd) scores 1, like the bound`: one course with one exam, examsPublished true, weights examSpread 1 → `breakdown.examSpread === 1`. Fail first.
- [ ] `minGap === null` → 1 when exams are published (the bound in `dfs` already uses 1, so pruning stays exact; `solver-props` stays green).
- [ ] Commit `fix(M3): a plan with fewer than two exams gets full exam spread`.

### Task 3 (M5): "no courses" message points to the specialization

**Files:** Modify `web/ui-view.js`. Test `test/xss.test.mjs` only if the renderer list needs it; verify in the browser.

- [ ] From year 3, in a program with specializations and none chosen, the "עוד לא נבחרו קורסים" message reads: `בחרו התמחות ב״המצב שלי״: משנה ג׳ קורסי ההתמחות נכנסים לבד. אפשר גם לסמן "חובה" או "אולי" ליד קורסים ב"הקורסים שלי".`
- [ ] Commit `fix(M5): from year 3 the empty plan suggests choosing a specialization`.

### Task 4 (M1): link preview tags

**Files:** Modify `web/index.html`, add `web/og.png` (1200×630). Test `test/app.test.mjs`.

- [ ] Test `index.html has a description and og/twitter tags with an absolute og:image that exists`: `meta name="description"`, `og:title`, `og:description`, `og:type`, `og:url`, `og:image` = `https://dolhack.github.io/lets_learn/og.png`, `twitter:card` = `summary_large_image`; `web/og.png` exists. Fail first.
- [ ] Tags in `index.html`; description: `כלי עזר לא רשמי לבניית מערכת שעות באפקה: חלופות בלי התנגשויות, חברים, דרישות קדם וייצוא ליומן.`
- [ ] `og.png`: drawn on a canvas in the browser (site colors, title, the description), saved from its data URL.
- [ ] Commit `feat(M1): link preview tags and image`.

### Task 5 (M4): Content Security Policy

**Files:** Modify `web/index.html`, `web/legal.html`. Test `test/app.test.mjs`.

- [ ] Test `both pages carry a CSP: default-src 'self', object-src 'none', base-uri 'none', scripts only from self and jsdelivr`. Fail first.
- [ ] Meta CSP: `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval'; worker-src 'self' blob: https://cdn.jsdelivr.net; connect-src 'self' https://cdn.jsdelivr.net; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'` (adjust only from observed violations, each adjustment ledgered).
- [ ] Browser: a `securitypolicyviolation` listener stays silent through load, every drawer, the map, the friend editor, a PDF render through vendored pdf.js, and a tesseract OCR of a generated canvas.
- [ ] Commit `feat(M4): content security policy`.

### Task 6 (M2): GH_PUSH_TOKEN expiry warning

**Files:** Modify `ci/gitlab-scrape.yml`, `README.md`.

- [ ] A second job `token-expiry` (stage `deploy`, `when: always`, same rules, `GIT_STRATEGY: none`, image `node:24`): reads `github-authentication-token-expiration` from `curl -sI` on `https://api.github.com/rate_limit` with the token, prints the days left, fails (mail) under 14 days. No header (a token without expiry) passes. The scrape job is untouched.
- [ ] YAML parses (python `yaml.safe_load`), the shell snippet runs locally against a fake header for 30, 10 and no expiry.
- [ ] README: where the token lives, how to renew it (fine-grained, this repo only, Contents read/write, paste into the GitLab variable, masked), and that the job warns 14 days ahead.
- [ ] Commit `ci(M2): warn two weeks before GH_PUSH_TOKEN expires`.

### Task 7 (B1): GitLab project visibility, owner action

- [ ] Owner: group `lets_learn-group` → Settings → General → Visibility = Public; then project `lets_learn-scrape` → Settings → General → Visibility = Public (a project cannot be more visible than its group). CI/CD variables stay secret; job logs become readable (the token is masked).
- [ ] After the owner says done: `get_project` shows `visibility: public`.

### Task 8: docs

- [ ] `docs/LAUNCH-READINESS.md`: each finding's status and commit; the decision updated.
- [ ] Commit `docs: readiness fixes status`.
