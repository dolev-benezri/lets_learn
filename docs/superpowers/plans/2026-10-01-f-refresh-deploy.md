# Nightly data refresh + deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every night, one polite scrape of the yedion for all semesters. Data files are written only if every check passes, and the same run deploys `web/` to the live site. The client shows honest freshness ("נבדק" vs "השתנה").

**Architecture:** Follows the research report (`origin/claude/cool-hawking-xhinen:docs/research/refresh-deploy/report.md`):
- one workflow `refresh-deploy.yml` (scrape, commit, deploy job);
- a hardened `scripts/scrape.mjs` that fetches once and builds every semester;
- `web/data/afeka/status.json`;
- client-side freshness and the `hashchange` fix.

**Tech Stack:** Node ESM scripts, GitHub Actions, GitHub Pages or Cloudflare Workers static assets (the owner decides), `node --test`.

**Spec:** the research report + notes on that branch. The user bug map in `.superpowers/next-session.md` has the summary.

## Global Constraints
- **⚠ Gated on owner decisions (Task 0).** Do not deploy or push a workflow to GitHub without explicit approval. The probe workflow runs on GitHub's servers, so it needs approval too.
- Polite scraping is non-negotiable:
  - delay 2500 ms ± 500 jitter, strictly one request at a time;
  - 25 s timeout per request;
  - honour `Retry-After`;
  - stop the whole run on the hourly-throttle page or after 3 WAF rejections in a row;
  - at most 10 retries per run;
  - a User-Agent that names the tool and the site URL. **No personal email** in the UA: use the repo issues URL.
- Never write a partial dataset. Keep the existing `validate()` + `compareToPrevious()` contract and extend it.
- No secrets in the repo. Tokens go in GitHub Actions secrets.

## Review Focus
- The throttle page arrives mid-run: nothing is written, and the exit code is non-zero.
- A run where nothing changed: no data commit; only `status.json` changes (`checkedAt`).
- A push with `GITHUB_TOKEN` does not trigger `on: push`, so the deploy must be a job in the same workflow.
- Saved user state survives a data refresh. A group that disappeared is flagged in the UI, not deleted.
- DST: the cron uses the `Asia/Jerusalem` timezone, and no slot falls between 02:00 and 03:00.

---

### Task 0: Owner decisions + runner probe (no code in the repo yet)

- [ ] Ask the owner, one decision at a time:
  1. **Domain:** buy one, and which? Not "afeka" alone in the name.
  2. **Host:** with a domain, GitHub Pages; without one, Cloudflare.
  3. **Email to Afeka:** send it in parallel with Task 1? Draft it for the owner. Do not send anything ourselves.
  4. **Lecturer names:** keep them as published, or drop them.
  5. **Analytics:** none, or GoatCounter.
- [ ] After approval: a temporary workflow `probe.yml` (`workflow_dispatch` only) that sends **one** GET to the yedion start page. It prints the runner IP, the status code and the headers. It classifies the response as OK, "Request Rejected" (F5) or the throttle page, using the same detection as Task 1. The owner triggers it once. If the runner is blocked, the scraper runs from the owner's PC through Task Scheduler (record this in the ledger, and Task 2 changes to "deploy only").

### Task 1: Scraper hardening (local, fully testable)

**Files:**
- Modify: `scripts/scrape.mjs` (`request`, `main`, the default delay at line 19).
- Create: `scripts/polite.mjs` (pure helpers).
- Modify: `scripts/build.mjs` (field-health checks).
- Test: `test/polite.test.mjs`, `test/build.test.mjs`.

**Interfaces:** Produces from `scripts/polite.mjs`:
- `pageKind(html: string): 'ok' | 'throttled' | 'rejected'`. Detection is based on `scripts/fixtures/throttled.html` and the F5 "Request Rejected" text.
- `throttleUntil(html): string|null`, which returns the "החל משעה HH:MM" time.
- `nextDelay(base: number, rnd: () => number): number`, which gives `base ± 500`.
- `stableJson(dataset): string`, which gives JSON without `fetchedAt`, so diffs show only real changes.
- `dataHash(str): string`, which gives sha256 hex (node `crypto`).

- [ ] **Step 1: Failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageKind, throttleUntil, nextDelay, stableJson } from '../scripts/polite.mjs';
const throttled = readFileSync('scripts/fixtures/throttled.html', 'utf8');
test('pageKind recognises the hourly throttle page and the F5 rejection', () => {
  assert.equal(pageKind(throttled), 'throttled');
  assert.equal(pageKind('<html><title>Request Rejected</title>The requested URL was rejected'), 'rejected');
  assert.equal(pageKind('<html><body>קורסים</body></html>'), 'ok');
});
test('throttleUntil reads the retry hour', () => assert.match(throttleUntil(throttled), /^\d{2}:\d{2}$/));
test('nextDelay stays within base ± 500', () => {
  assert.equal(nextDelay(2500, () => 0), 2000); assert.equal(nextDelay(2500, () => 0.999999), 2999);
});
test('stableJson drops fetchedAt and is deterministic', () => {
  const a = stableJson({ fetchedAt: '1', year: 2027, courses: {} }), b = stableJson({ fetchedAt: '2', year: 2027, courses: {} });
  assert.equal(a, b); assert.ok(!a.includes('fetchedAt'));
});
```

- [ ] **Step 2:** `node --test test/polite.test.mjs` → FAIL (module missing). **Step 3:** implement `polite.mjs`. **Step 4:** PASS. Commit `feat(scrape): polite helpers`.
- [ ] **Step 5: Wire into `request()`.**
  - Set `default: '2500'`.
  - Use `fetch(url, { signal: AbortSignal.timeout(25000), headers: { 'User-Agent': 'afeka-scheduler/1.1 (+https://github.com/dolhack/lets_learn)' } })`.
  - On `429`/`503`, honour `Retry-After`.
  - Check `pageKind`: `'throttled'` throws `ThrottledError(throttleUntil)`. `'rejected'` counts toward a run-level streak, and 3 in a row throw.
  - Keep a run-level retry budget of 10.
  - Sleep `nextDelay(Number(opt.delay), Math.random)` between requests.
- [ ] **Step 6: Combined run.**
  - Fetch `lists`, `raw` and `exams` once.
  - For each semester present in the meetings, call `buildDataset({ ..., semester })`, then `validate` + `compareToPrevious`.
  - Write all files only if all pass.
  - Write each with `stableJson`, keep `fetchedAt` in `status.json` only, and skip writing a file whose content is unchanged.
  - Write `web/data/afeka/status.json`: `{ checkedAt, ok: true, semesters: { '2027-1': { hash, changedAt }, … } }`, where `changedAt` changes only when the hash changes.
  - Print a one-line change summary to stdout, for example `data(afeka): 2027-1 +3 groups, 12 became full`. That becomes the commit message.
- [ ] **Step 7: Field health** in `build.mjs` `validate()`, with tests in `test/build.test.mjs` (one failing case each):
  - zero meetings with `day === null`;
  - more than 90% of offered courses have credits > 0;
  - prerequisite count within ±20% of the previous file;
  - exam dates fall within the dataset's academic year.
- [ ] **Step 8:** Run the scraper locally once. This is a real request load of about 169 requests at night, so ask the owner first. Then `npm test`. Commit `feat(scrape): one polite run for all semesters, status.json, field health`.

### Task 2: Workflow + deploy (after Task 0 approval)

**Files:** `.github/workflows/refresh-deploy.yml`, `README.md` (badge + scraping rate, hours and UA), `TERMS.md` (section "איך אנחנו אוספים" describes today's 1 s manual scraper; update it to the new rate, hours and stop rules).

- [ ] **Triggers:** `workflow_dispatch` plus a disabled `schedule`. Enable the cron only after a week of manual runs. Cron lines: `17 0 * * *` and `47 3 * * *`, with `timezone: Asia/Jerusalem`. A skip guard exits early if `status.json.checkedAt` is less than 12 h old or if it is after 07:00 in Israel.
- [ ] **Job `scrape`:**
  - checkout, then `node scripts/scrape.mjs --all-semesters`;
  - if `git diff --quiet`, only `status.json` changed, so commit it alone (this keeps the repo active and avoids the 60-day cron disable);
  - otherwise commit with the summary line as the message;
  - push using `GITHUB_TOKEN`.
- [ ] **On failure:** upload the offending HTML as an artifact, then use `gh issue` to open or append to "Scheduled scrape failing". Close the issue on the next success.
- [ ] **Job `deploy`** (`needs: scrape`, runs even when the data did not change):
  - **Pages:** `actions/upload-pages-artifact` with `path: web`, then `actions/deploy-pages`.
  - **Cloudflare:** `wrangler deploy` with `CLOUDFLARE_API_TOKEN` from secrets.
- [ ] **Verify:** one manual dispatch, then check that the site serves the new `status.json`. Commit `ci: nightly refresh and deploy`.

### Task 3: Client freshness and no silent data loss

**Files:** `web/app.js` (`init`), `web/ui-plan.js` (`renderTop`, a new `hashchange` friend handling), tests.

- [ ] **Step 1: Freshness.**
  - Add the pure `freshness(status, now): { text, stale }` to `web/ui-text.js`. The text reads like `נבדק לפני 3 שעות · השתנה לאחרונה 28/9`. `stale` is true when `checkedAt` is more than 36 h old or `ok` is false.
  - Test with fixed dates.
  - `renderTop` uses it in place of the 3-day `fetchedAt` check.
- [ ] **Step 2: Fetch.** `init` fetches `status.json` with `{ cache: 'no-cache' }` in parallel with the data, then refetches the data with `?v=<hash>` only if the hash differs from the hash of the loaded data.
- [ ] **Step 3: `hashchange`:** done in plan B Task 1 (`applyHash`). Here, only check that it still works after the `?v=` refetch.
- [ ] **Step 4: Vanished groups.**
  - Add the pure `staleRefs(state, data): { pins: string[], friends: {name, ids}[] }` with a test.
  - The banner reads "הקבוצה X בקורס Y כבר לא קיימת בנתונים", with a link to pick another group.
  - Never delete anything automatically.
- [ ] **Step 5: Fonts.** Self-host the font files in `web/fonts/` and drop the Google Fonts link.
- [ ] **Step 6:** `npm test`, then a Chrome check. Commit `feat(data): honest freshness, hashchange, vanished-group notice`.

### Later (not in this plan)
Tiered refresh after 2–3 weeks of change logs, blackout windows around registration openings, a dead-man's switch ping, and a service worker plus manifest (iOS deletes storage after 7 days).
