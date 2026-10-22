# Nightly request budget (H1–H4 + H7) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the nightly GitLab scrape from ~488 to ~398 CI minutes a month (quota 400), so the nights from 1.11 on run all month instead of ~10.

**Architecture:** All changes stay in `scripts/scrape.mjs`. H2 is a skip in `run()`'s course loop. H3 and H7 change `nightlyTtl`. H1 needs per-run memory,
so a new `nightlyPolicy()` wraps `nightlyTtl` and `cachedRequester` reports every answer to it (`seen`). H4 is a `budget` option on `cachedRequester`.

**Tech Stack:** Node ≥22.12 ES modules, `node --test`, node-html-parser (via `scripts/parse.mjs`).

**Spec:** `docs/superpowers/plans/2026-10-22-merge-requests-research.md`. This covers sections 2 (H1–H4) and A1–A5, "הצעות הבעלים" (H7) and "החלטת הבעלים" (groups stay every other night).

## Global Constraints

- The 2.5 s delay (`--delay 2500`, `makeRequester`) is unchanged.
- No code path may send more than 400 requests in a clock hour, and nothing works around the site's hourly limit. `patient()` stays as is.
- An offered course's groups stay every other night (`otherNight`, 1.5-day off-night TTL). Owner decision, 22.10.
- No GitLab settings change. `ci/gitlab-scrape.yml` changes in comments only.
- Line length: 160 for code and comments (`test/line-length.test.mjs`).
- Work on a feature branch, never on main. `docs/meeting/` is never committed.
- No live requests to the site while implementing. Every check below is offline.

## Review Focus

1. **First night after the quota reset (1.11) with a 3-week-old cache.** Most pages are stale, the budget defers the rest, and the run must still build valid datasets from stale answers. Task 4's test pins "over budget returns the stale answer, never throws".
2. **A page that is not cached at all when the budget is spent.** It must still be fetched, or the run would fail. Task 4's test pins this.
3. **A course marked "לא נלמד" in one list but "נלמד" in another.** Its groups must still be fetched. Task 1's test pins this.
4. **A follower list whose representative changed tonight.** It must be fetched tonight (TTL 0), not left on the weekly clock. Task 3's test pins this.
5. **Policy memory leaking between runs.** Each run gets a fresh `nightlyPolicy()`. Task 3's test pins "a new policy starts empty".

---

### Task 1: H2 — skip groups for a course no list offers

**Files:**
- Modify: `scripts/scrape.mjs:330-341` (the `ids` loop in `run()`)
- Test: `test/scrape.test.mjs` (next to the "programs that share lists" test, ~line 414)

**Interfaces:**
- Consumes: `parseProgram(html).courses[i].offered: boolean` (`scripts/parse.mjs:33`)
- Produces: no new names. `raw[id]` for a skipped course is `{ groups: [], details: null }`. That is what an unoffered course gets today, after a wasted request.

- [ ] **Step 1: Write the failing test**

```js
test('run: a course that no list marks נלמד costs no group or details request; one offered in any list is fetched', async () => {
  const notTaught = fx('prog-30001.html').replace('>נלמד<', '>לא נלמד<'); // first course becomes unoffered
  const asked = [];
  const real = site();
  const request = async (query, form) => {
    if (query?.startsWith('prgname=S_LOOK_FOR_NOSE')) asked.push(query.split('-N')[1]);
    if (query?.startsWith('prgname=S_SHOW_PROGS')) return query.includes('-N30001') ? notTaught : fx('prog-30001.html');
    return real(query, form);
  };
  const first = P.parseProgram(notTaught).courses[0];
  assert.equal(first.offered, false, 'fixture edit worked');
  const root = join(dirs().status, '..');
  await run({ opt, request, programs: { 77: cfg({ lists: [30001] }) }, dataDir: root, log: () => {}, check: noErrors });
  assert.ok(!asked.includes(first.id), 'unoffered in its only list: skipped');
  asked.length = 0;
  await run({ opt, request, programs: { 77: cfg({ lists: [30001, 30002] }) }, dataDir: join(dirs().status, '..'), log: () => {}, check: noErrors });
  assert.ok(asked.includes(first.id), 'offered in 30002: fetched');
});
```

Add `import * as P from '../scripts/parse.mjs';` at the top if it is not there. If `'>נלמד<'` does not match the fixture's markup, find the first offered cell in `prog-30001.html` and replace that. The `offered === false` assert guards it.

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test --test-name-pattern "no list marks" test/scrape.test.mjs`
Expected: FAIL on "unoffered in its only list: skipped".

- [ ] **Step 3: Implement the skip in `run()`**

Before the `ids` loop, build `offered = new Set(...)` of every id with `offered: true` in any `u.lists[].courses`. In the loop, a course not in `offered` gets `raw[id] = { groups: [], details: null }` and the log line `[i/n] id: not offered (list), skipped`. No request is made for it.

- [ ] **Step 4: Run the scrape tests**

Run: `node --test test/scrape.test.mjs`
Expected: all pass.

- [ ] **Step 5: Offline check that no dataset changes**

```bash
node scripts/scrape.mjs --all-semesters --all-programs --cache .yedion-cache --offline > /dev/null
git diff --stat -- web/data/afeka ':!web/data/afeka/status.json'
git checkout -- web/data/afeka && git clean -fdq -- web/data/afeka
```

Expected: the diff lists no files. Do this once on the base commit, before Task 1, to learn the baseline. If the baseline already shows files, compare the after-run files to the baseline's files instead of to git. A2 says the flag and the groups agree in all 13 snapshots, so any extra file is a bug.

- [ ] **Step 6: Commit**

```bash
git add scripts/scrape.mjs test/scrape.test.mjs
git commit -m "Scrape: no group request for a course no list offers (H2)"
```

### Task 2: H3 + H7 — details every 14–16 days, exams by publication

**Files:**
- Modify: `scripts/scrape.mjs:220-231` (`weekly`, `nightlyTtl`, and the comment above them)
- Test: `test/scrape.test.mjs:523-561` (the two `nightlyTtl` tests)

**Interfaces:**
- Consumes: `parseExams(html): Array` (`scripts/parse.mjs:103`). It returns 0 rows for `exams-nodata.html` and 155 for `exams-2026.html`.
- Produces: `nightlyTtl(key, html, now)` keeps its signature. Exams: `1.5 * DAY` while `parseExams(html)` is empty, `weekly(key)` (7–9 days) once it has rows. `S_CourseDetails`: 14–16 days by key. Everything else is unchanged.

- [ ] **Step 1: Change the tests first**

In the first `nightlyTtl` test:
- Replace `assert.equal(nightlyTtl('PRGNAME=S_EXAMS&ARGUMENTS=R1C28', fx('exams-2026.html')), 0);` with:

```js
  const exams = 'PRGNAME=S_EXAMS&ARGUMENTS=R1C28';
  assert.equal(nightlyTtl(exams, fx('exams-nodata.html')), 1.5 * DAY, 'not published yet: every other night');
  assert.ok(weekly(nightlyTtl(exams, fx('exams-2026.html'))), 'published: weekly');
  assert.ok([14, 15, 16].includes(nightlyTtl('prgname=S_CourseDetails&arguments=x', OK) / DAY), 'details: 14-16 days');
```

- Remove `'prgname=S_CourseDetails&arguments=x'` from the weekly loop.
- Rename the test to say "exams every other night until published, then weekly; details 14-16 days".

In the P6 spread test, change the keys to `prgname=S_SHOW_PROGS&arguments=-N2026,-N${30000 + i}`, so it still checks the 7–9-day spread.

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test --test-name-pattern nightlyTtl test/scrape.test.mjs`
Expected: FAIL. Exams return 0, details return 7–9.

- [ ] **Step 3: Implement the change**

- Let `weekly` take a base: `weekly(key, base = 7)` gives `(base + hash % 3) * DAY`.
- Details use `weekly(key, 14)`.
- Exams return `parseExams(html).length ? weekly(key) : 1.5 * DAY`.
- Rewrite the policy comment to match:
  - exams every other night until published, then weekly;
  - details 14–16 days (research A3: 15 of 415 changed in two weeks);
  - the rest is unchanged.

- [ ] **Step 4: Run the scrape tests**

Run: `node --test test/scrape.test.mjs`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/scrape.mjs test/scrape.test.mjs
git commit -m "Scrape nightly: exams every other night until published then weekly (H7), details every 14-16 days (H3)"
```

### Task 3: H1 — a list cohort that answers like an earlier cohort follows it

**Files:**
- Modify: `scripts/scrape.mjs`:
  - `cachedRequester` (~line 189): new `seen` option.
  - New `nightlyPolicy` after `nightlyTtl`.
  - `main()` (~line 431): use it with `--nightly`.
- Test: `test/scrape.test.mjs` (after the `nightlyTtl` tests)

**Interfaces:**
- Consumes: `nightlyTtl` (Task 2) and `parseProgram(html) → { name, minCredits, courses }`.
- Produces:
  - `cachedRequester(inner, dir, { offline, ttl, seen })`. The new `seen(key, html, old)` is called once for every non-session answer the requester returns. On a cache hit, `old === html`. On a fetch, `old` is the cached answer it replaced, or `undefined`.
  - `export function nightlyPolicy(now = Date.now): { ttl(key, html): number, seen(key, html, old): void }`. Each run makes a new one.

**The rule.** A list key is `prgname=S_SHOW_PROGS&arguments=-N{start},-N{code}`. Its signature is `JSON.stringify([minCredits, courses])` of `parseProgram(html)`. The name is left out because it differs by cohort. This is the same signature `stage-a45.mjs` used for A1. For each code the policy keeps two sets of signatures from this run's `seen` calls:
- `current`: every answer returned.
- `replaced`: each `old` whose signature differs from its new `html`.

For a list key, `ttl` is:
- `Infinity` when the cached signature is in `current[code]`. An earlier cohort answered the same tonight.
- `0` when it is in `replaced[code]`. That cohort's representative just changed.
- Otherwise `nightlyTtl`.

`current` is checked first. Every other key goes straight to `nightlyTtl`. `run()` asks lists in a fixed unit order, so the first cohort of each group is always the one that refreshes: it is the representative.

- [ ] **Step 1: Write the failing tests**

```js
test('nightlyPolicy (H1): a list that answered like an earlier cohort tonight is kept; one whose representative changed is fetched', () => {
  const A = fx('prog-30001.html'),
    B = A.replace('>נלמד<', '>לא נלמד<');
  const key = (start, code = 30001) => `prgname=S_SHOW_PROGS&arguments=-N${start},-N${code}`;
  const p = nightlyPolicy(() => 20000 * DAY);
  p.seen(key(2024), A, A);
  assert.equal(p.ttl(key(2025), A), Infinity, 'same as 2024 tonight: no request');
  assert.ok([7, 8, 9].includes(p.ttl(key(2026), B) / DAY), 'answered differently before: its own weekly clock');
  assert.ok([7, 8, 9].includes(p.ttl(key(2025, 30002), A) / DAY), 'another code is not affected');
  const q = nightlyPolicy(() => 20000 * DAY);
  assert.ok([7, 8, 9].includes(q.ttl(key(2025), A) / DAY), 'a new policy starts empty');
  q.seen(key(2024), B, A);
  assert.equal(q.ttl(key(2025), A), 0, 'its representative changed tonight: fetched now');
  assert.equal(q.ttl(key(2026), B), Infinity, 'already equal to the new answer: kept');
  assert.equal(q.ttl('PRGNAME=S_EXAMS&ARGUMENTS=R1C28', fx('exams-nodata.html')), 1.5 * DAY, 'other keys: nightlyTtl');
});

test('cachedRequester: seen gets every answer with the cached one it replaced', async () => {
  const dir = join(dirs().status, '..', 'cache3'),
    got = [];
  let n = 0;
  const r = cachedRequester(async (q) => (q?.includes('Enter_Search') ? '' : `<p>${++n}</p>`), dir, { ttl: (k) => (k.includes('old') ? 0 : Infinity), seen: (...a) => got.push(a) });
  await r('prgname=Enter_Search');
  await r('prgname=S_a&x=keep');
  await r('prgname=S_a&x=keep');
  await r('prgname=S_a&x=old');
  await new Promise((res) => setTimeout(res, 5));
  await r('prgname=S_a&x=old');
  assert.deepEqual(got, [
    ['prgname=S_a&x=keep', '<p>1</p>', undefined],
    ['prgname=S_a&x=keep', '<p>1</p>', '<p>1</p>'],
    ['prgname=S_a&x=old', '<p>2</p>', undefined],
    ['prgname=S_a&x=old', '<p>3</p>', '<p>2</p>']
  ]);
});
```

Add `nightlyPolicy` to the `import { nightlyTtl, patient }` line. Lift `const DAY = 86400e3` to file level if the new test cannot see it.

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test --test-name-pattern "nightlyPolicy|seen gets" test/scrape.test.mjs`
Expected: FAIL. `nightlyPolicy` is not exported, and `seen` is never called.

- [ ] **Step 3: Implement `seen` in `cachedRequester` and `nightlyPolicy`**

- `cachedRequester` keeps the cached `html` it read, as `old`. It calls `seen?.(key, html, old)` before each return of a cached or a fetched answer, and never for the session requests.
- `nightlyPolicy` follows the rule above, keeping two `Map<code, Set<signature>>`.
- `main()` makes one `nightlyPolicy()` when `opt.nightly` and passes `ttl: policy.ttl, seen: policy.seen`. Without `--nightly`, nothing changes.

- [ ] **Step 4: Run the scrape tests**

Run: `node --test test/scrape.test.mjs`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/scrape.mjs test/scrape.test.mjs
git commit -m "Scrape nightly: a list cohort that answers like an earlier cohort follows it (H1)"
```

### Task 4: H4 — at most 380 fetched answers a night; the rest wait for the next night

**Files:**
- Modify: `scripts/scrape.mjs`:
  - `cachedRequester`: new `budget` option and a `deferred` list.
  - `main()`: `NIGHT_BUDGET` and the log line.
  - The policy comment.
- Modify: `ci/gitlab-scrape.yml:7` (comment only)
- Modify: `docs/superpowers/plans/2026-10-22-merge-requests-research.md` (one status line)
- Test: `test/scrape.test.mjs`

**Interfaces:**
- Consumes: `cachedRequester` with `seen` (Task 3).
- Produces: `cachedRequester(inner, dir, { offline, ttl, seen, budget = Infinity })`. The returned function has a `deferred: string[]` property.
  - Once `budget` answers have been fetched (session replays not counted), a stale answer that is cached is returned as is and its key goes into `deferred`.
  - An answer that is not cached is always fetched, even over budget.

- [ ] **Step 1: Write the failing test**

```js
test('cachedRequester budget (H4): past the budget a stale answer waits for the next night; a missing one is still fetched', async () => {
  const dir = join(dirs().status, '..', 'cache4'),
    calls = [];
  const r = cachedRequester(async (q) => (calls.push(q), `<p>${calls.length}</p>`), dir, { ttl: () => 0, budget: 2 });
  await r('prgname=Enter_Search');
  await r('prgname=S_a&x=1');
  await r('prgname=S_a&x=2');
  assert.deepEqual(calls, ['prgname=Enter_Search', 'prgname=S_a&x=1', 'prgname=S_a&x=2'], 'the session replay is not counted');
  assert.equal(await r('prgname=S_a&x=3'), '<p>4</p>', 'not cached: fetched over budget');
  await new Promise((res) => setTimeout(res, 5));
  assert.equal(await r('prgname=S_a&x=1'), '<p>2</p>', 'stale but cached: kept');
  assert.deepEqual(r.deferred, ['prgname=S_a&x=1']);
  assert.equal(calls.length, 4);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test --test-name-pattern "budget" test/scrape.test.mjs`
Expected: FAIL. The stale answer is fetched, and `deferred` is undefined.

- [ ] **Step 3: Implement the budget**

- **`cachedRequester`:**
  - Count the `inner` calls made for real keys.
  - When the count has reached `budget` and the file exists, push the key to `deferred` and return the cached `html`, after `seen`.
  - Attach the list with `request.deferred = deferred`. Assign the arrow to a `const` first.
- **`main()`:**
  - Add `const NIGHT_BUDGET = 380;`, with the comment: the site allows ~400 an hour; 2 session requests and a few retries leave room, so a night never waits for the clock hour.
  - Pass `budget: opt.nightly ? NIGHT_BUDGET : Infinity`.
  - After `run`, when `request.deferred?.length`, log `deferred N stale answers to the next night` to stderr.
- **`ci/gitlab-scrape.yml:7`:** replace "(~250 requests, ~11 CI minutes; …)" with "(~260 requests, ~11 CI minutes; never more than 380 a night, so no run waits for the hourly limit; …)". The rest of the sentence stays.
- **The research plan:** under "החלטת הבעלים", add the line `- **מומש:** H1–H4 + H7, בענף <branch>, <date>.`

- [ ] **Step 4: Run the full suite once**

Run: `npm test`
Expected: all pass, including `line-length`.

- [ ] **Step 5: Offline replay**

Repeat Task 1 Step 5. Expected: the same result as Task 1. `--offline` ignores TTL and budget, so this confirms the wiring broke nothing.

- [ ] **Step 6: Commit**

```bash
git add scripts/scrape.mjs test/scrape.test.mjs ci/gitlab-scrape.yml docs/superpowers/plans/2026-10-22-merge-requests-research.md
git commit -m "Scrape nightly: at most 380 fetched answers a night, the rest wait for the next night (H4)"
```

## After merge (owner)

- The first real check is the GitLab night of 1.11.
  - **Expected:** the first ~4 nights fetch 380 requests each (~19 min).
  - **After that:** ~260 requests a night (~11 min). Research A5 projects 405 min/30 days for H1–H4, and H7 brings that to ~398.
- Read the job durations once a week. They are the only real measurement.
- H8 (groups by season) is not in this plan. It is checked on November's data commits.
