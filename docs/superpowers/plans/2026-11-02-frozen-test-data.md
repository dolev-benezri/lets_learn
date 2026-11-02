# Frozen Test Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behavior tests read a frozen copy of the 21.10 data, so a nightly Afeka change no longer fails the deploy; data-invariant tests keep guarding the live export.

**Architecture:** One helper module (`test/fixtures/real.mjs`) owns the list of frozen files, their location and the refresh command. Behavior tests import it instead of building `web/data/afeka` paths. The live-side tests are untouched. A new test runs the export checker's per-file schema on each frozen file.

**Tech Stack:** Node 24, `node:test`, `node:fs` with URL paths, `git show` for the refresh.

**Spec:** `docs/superpowers/specs/2026-11-02-frozen-test-data-design.md`

## Global Constraints

- Branch `claude/frozen-test-data` starts at 40d90aa plus the spec and plan commits; the nightly commit 66f5eb7 is only on `main`. Task 6 merges `main` in before the final checks.
- Frozen source commit: `40d90aa`. Frozen files (13): 2027-1: 10-2024, 11-2027, 12-2027, 19-2026, 22-2027, 30-2026, 30-2027, 32-2024, 32-2027, 42-2027; 2027-2: 19-2026, 30-2026; 2027-3: 30-2026.
- File format: `JSON.stringify(data) + '\n'`, UTF-8. Written by Node only, never by shell redirection (PowerShell would change the encoding).
- Paths: URL objects relative to `import.meta.url`; `fileURLToPath` only where an API needs a string (`checkExport`). No `.pathname`, no URL-string concatenation.
- Tests on frozen data never skip or return early when a file is missing.
- Live tests that stay as they are: `check-export.test` "the data the site ships passes"; `scrape.test` "every committed data file carries the specializations…"; `programs-official.test`; `settings.test` catalog test; `check-real.test` "the 3 sample programs have no data errors" and "sample: 19-2026, 20-2026, 30-2026 semester א pass…".
- No change under `web/`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A test still reads live data through a path the grep misses (template string, `SRC` constant, directory scan) → caught by the "data moved away" check in Task 6, where only the 6 live tests listed above may fail.
2. A migrated test passes only because a skip or early return now hides it → Task 3 removes every skip; Task 6 compares the test count before and after (no test may disappear or become skipped).
3. The refresh writes half the files and then fails (bad ref, missing file) → Task 1 test: a ref missing one file writes nothing.
4. A fixture added on disk but not in `FILES`, or listed but missing → Task 1 test compares `FILES` with the directory.
5. Line endings: Git on Windows may turn the fixture `\n` into `\r\n` on checkout → Task 1 adds `test/fixtures/real/** -text` to `.gitattributes` so the bytes stay as written.

---

### Task 1: Frozen copy, helper and drift guard

**Files:**
- Create: `test/fixtures/real.mjs`
- Create: `test/fixtures/real/` (13 JSON files + `SOURCE`, generated)
- Create: `test/fixtures-real.test.mjs`
- Modify: `scripts/check-export.mjs:90` (add `export` to `checkFile`)
- Modify: `.gitattributes` (create if missing): `test/fixtures/real/** -text`

**Interfaces:**
- Produces:
  - `FILES: string[]` — the 13 relative paths, e.g. `'2027-1/30-2026.json'`.
  - `REAL_DIR: URL` — `new URL('./real/', import.meta.url)`, trailing `/`.
  - `real(path: string): object` — `JSON.parse` of `new URL(path, REAL_DIR)`.
  - `freeze(ref: string, { show = gitShow, dir = REAL_DIR } = {}): string` — resolves `ref` with `git rev-parse`, reads every `FILES` entry through `show(sha, 'web/data/afeka/' + path)`, parses all before writing any, writes them and `SOURCE` (`sha + '\n'`), returns the sha. Throws (nothing written) when any file is missing or not JSON.
  - CLI: `node test/fixtures/real.mjs <ref>` calls `freeze`; without a ref it prints usage and exits 1. Guarded by `import.meta.url === pathToFileURL(process.argv[1]).href`, so importing has no side effects.
  - `checkFile(d, label, out): boolean` exported from `scripts/check-export.mjs` (unchanged body).

- [ ] **Step 1: Write the failing tests** in `test/fixtures-real.test.mjs`:
  - `'frozen data: FILES matches the files on disk'` — `readdirSync` of each `2027-N/` under `REAL_DIR`, sorted, deep-equals `FILES` sorted; `SOURCE` exists.
  - `'frozen data: SOURCE is the commit 40d90aa resolves to'` — `readFileSync(new URL('SOURCE', REAL_DIR), 'utf8').trim()` starts with `'40d90aa'` and is 40 hex chars.
  - `'frozen data: every file passes the export schema (refresh with node test/fixtures/real.mjs <ref> if this fails)'` — for each file, `const out = []; checkFile(real(f), f, out)` returns `true` and `out` deep-equals `[]`.
  - `'frozen data: files are minified JSON with one trailing newline'` — raw text ends with `'}\n'`, has no other `\n`, and equals `JSON.stringify(JSON.parse(raw)) + '\n'`.
  - `'freeze: a ref missing one file writes nothing'` — `freeze('HEAD', { show: (sha, p) => { if (p.endsWith('42-2027.json')) throw new Error('missing'); return '{}'; }, dir: <mkdtemp URL> })` throws, and the temp dir stays empty.

- [ ] **Step 2: Run to verify they fail**
  Run: `node --test test/fixtures-real.test.mjs`
  Expected: FAIL — `Cannot find module …/fixtures/real.mjs`.

- [ ] **Step 3: Implement** `test/fixtures/real.mjs` (interfaces above; `gitShow` = `execFileSync('git', ['show', ...], { maxBuffer: 64e6, encoding: 'utf8' })`), add `export` to `checkFile`, add the `.gitattributes` line.

- [ ] **Step 4: Generate the copy**
  Run: `node test/fixtures/real.mjs 40d90aa`
  Expected: prints the full sha of 40d90aa; `test/fixtures/real/` holds 13 JSON files (about 1.5 MB) and `SOURCE`.

- [ ] **Step 5: Run to verify they pass**
  Run: `node --test test/fixtures-real.test.mjs test/check-export.test.mjs`
  Expected: PASS (check-export unchanged by the `export` keyword).

- [ ] **Step 6: Commit**
  `git add .gitattributes scripts/check-export.mjs test/fixtures/real.mjs test/fixtures/real test/fixtures-real.test.mjs`
  `git commit -m "test: frozen copy of the 21.10 data for behavior tests, with its schema guard"`

### Task 2: Rules, specs, app, build and report tests read the frozen copy

**Files:**
- Modify: `test/rules.test.mjs:462-463` (`cohort`), `:524` (`real`)
- Modify: `test/rules-after-a.test.mjs:27`
- Modify: `test/specs.test.mjs:67`, `:94`, and any other `web/data/afeka` read in the file (grep)
- Modify: `test/app.test.mjs:196`, `:472`
- Modify: `test/build.test.mjs:575`
- Modify: `test/rules-report.test.mjs:10`, `:92`

**Interfaces:**
- Consumes: `real`, `REAL_DIR` from `test/fixtures/real.mjs` (Task 1). Import as `import { real as frozen, REAL_DIR } from './fixtures/real.mjs'` where a local `real` already exists; keep each file's local helper name and signature, only change its body (e.g. app: `const real = (n) => frozen(\`2027-${n}/30-2026.json\`)`). `copyFileSync(new URL('2027-1/30-2026.json', REAL_DIR), …)` in rules-report.

- [ ] **Step 1: Show the failure on today's data**
  Run: `git checkout 66f5eb7 -- web/data/afeka/2027-1/30-2026.json && node --test test/rules.test.mjs; git checkout HEAD -- web/data/afeka/2027-1/30-2026.json`
  Expected: FAIL at `recordWarnings + classify: failing 10336 …` (`'notOffered'` vs `'retake'`), and the file is back to the branch version afterwards.

- [ ] **Step 2: Swap the reads** in the six files listed.

- [ ] **Step 3: Verify**
  Run: `git checkout 66f5eb7 -- web/data/afeka/2027-1/30-2026.json && node --test test/rules.test.mjs test/rules-after-a.test.mjs test/specs.test.mjs test/app.test.mjs test/build.test.mjs test/rules-report.test.mjs; git checkout HEAD -- web/data/afeka/2027-1/30-2026.json`
  Expected: all PASS, including the 10336 test. `grep -n "web/data/afeka" test/rules.test.mjs test/rules-after-a.test.mjs test/specs.test.mjs test/app.test.mjs test/build.test.mjs test/rules-report.test.mjs` prints nothing.

- [ ] **Step 4: Commit** `git commit -am "test: rules, specs, app, build and report tests use the frozen data"`

### Task 3: Solver tests read the frozen copy, no skips

**Files:**
- Modify: `test/solver.test.mjs:198-199`, `:574`, `:575`, `:686`, `:733`, `:947-950`, `:1118-1121`, `:1141-1144`, `:1235-1240`, `:1458-1460`, `:2119-2121`, `:2137-2142`

**Interfaces:**
- Consumes: `REAL_DIR` (Task 1).
- `REAL = new URL('2027-1/30-2026.json', REAL_DIR)`, `REAL2 = new URL('2027-2/30-2026.json', REAL_DIR)`; every inline `'web/data/afeka/2027-N/30-2026.json'` becomes `REAL` / `REAL2`; directory scans use `new URL('2027-N/', REAL_DIR)`.

- [ ] **Step 1: Record the baseline** — Run: `node --test test/solver.test.mjs 2>&1 | tail -8`. Note `# tests`, `# pass`, `# skipped`.
- [ ] **Step 2: Swap paths; delete every `skip:` option and the `existsSync` guards at 199, 2120, 2138; replace the early `return`s at 2121 and 2142 with `assert.ok(files.length)` / `assert.ok(both.length)`.** Keep the `existsSync(new URL(f, dir(2)))` filter at 2141 (it selects, it does not skip).
- [ ] **Step 3: Verify** — Run: `node --test test/solver.test.mjs 2>&1 | tail -8`. Expected: same `# tests` as Step 1, `# skipped 0`, all pass. `grep -n "web/data/afeka\|skip:" test/solver.test.mjs` prints nothing.
- [ ] **Step 4: Commit** `git commit -am "test: solver tests use the frozen data and never skip"`

### Task 4: Map and XSS tests read the frozen copy

**Files:**
- Modify: `test/ui-map.test.mjs:29`, `:714`, `:729`, `:742`, `:752`, `:890`, and any other `web/data/afeka` read (grep)
- Modify: `test/xss.test.mjs:10`

**Interfaces:**
- Consumes: `real` / `REAL_DIR` (Task 1), same import pattern as Task 2.

- [ ] **Step 1: Swap the reads.**
- [ ] **Step 2: Verify** — Run: `node --test test/ui-map.test.mjs test/xss.test.mjs`. Expected: PASS, same test counts as before the change. `grep -n "web/data/afeka" test/ui-map.test.mjs test/xss.test.mjs` prints nothing.
- [ ] **Step 3: Commit** `git commit -am "test: map and XSS tests use the frozen data"`

### Task 5: Checker tests split between frozen and live

**Files:**
- Modify: `test/check-export.test.mjs:8`, `:16`, `:106`
- Modify: `test/check-real.test.mjs:108` ("no plan"), `:139` ("the CLI runs the state suites")

**Interfaces:**
- Consumes: `real`, `REAL_DIR` (Task 1).
- check-export: keep `SRC = 'web/data/afeka'` for `'the data the site ships passes'` only; add `const FROZEN = fileURLToPath(REAL_DIR)` and use it in `mini()`'s `cpSync` and in `checkExport(dir, { against: FROZEN })`.
- check-real: those two tests use `real(f)`; the two sample tests at `:46` and `:146` keep reading live data.

- [ ] **Step 1: Make the edits.**
- [ ] **Step 2: Verify** — Run: `node --test test/check-export.test.mjs test/check-real.test.mjs`. Expected: PASS. `grep -n "web/data/afeka\|SRC" test/check-export.test.mjs test/check-real.test.mjs` shows only `SRC` definition + the "ships passes" test, and the two live sample tests.
- [ ] **Step 3: Commit** `git commit -am "test: checker logic tests use the frozen data; the live export checks stay"`

### Task 6: Prove it, merge, deploy

**Files:** none changed (verification and release).

- [ ] **Step 0: Baseline counts (before Task 1)** — Run: `git stash list` is empty, then `npm test 2>&1 | tail -10` on the branch at 40d90aa. Record `# tests` and `# skipped`.
- [ ] **Step 1: Whole suite on the old data (branch as is)** — Run: `npm test 2>&1 | tail -10`. Expected: `# fail 0`; `# tests` = baseline + 5 (Task 1's new tests); `# skipped` no higher than the baseline.
- [ ] **Step 2: Merge today's data** — Run: `git merge --no-edit main` (brings 66f5eb7). Then `npm test 2>&1 | tail -10`. Expected: `# fail 0`.
- [ ] **Step 3: Data moved away** — Run: `mv web/data/afeka web/data/afeka.off; npm test 2>&1 | grep "^not ok\|✖" ; mv web/data/afeka.off web/data/afeka`. Expected: the only failing tests are the 6 live tests in Global Constraints. Any other failure is a missed live read: fix it in its task's file and repeat. Confirm `git status` is clean after moving back.
- [ ] **Step 4: Trust checks** — Run: `npm run check:real`. Expected: exit 0.
- [ ] **Step 5: Merge to main and push** — `git switch main && git merge --no-ff claude/frozen-test-data -m "Merge claude/frozen-test-data: behavior tests read frozen data, nightly data reaches the site again"` then `git push origin main claude/frozen-test-data`.
- [ ] **Step 6: Run the deploy by hand** (the push touches no `web/**`) — `gh workflow run deploy -R dolev-benezri/lets_learn --ref main`; one background wait for the run to finish (`gh run watch` on its id), then one read of its conclusion. Expected: `test` and `deploy` succeed; `https://dolev-benezri.github.io/lets_learn/data/afeka/status.json` shows `checkedAt` from 2026-11-01.

## Execution plan

- Order: Task 6 Step 0 (baseline counts), then Task 1 (all others import it). Tasks 2-5 touch disjoint files and only need Task 1; run them in order in this session (each is a few path swaps; parallel sessions would cost more than they save). Task 6 last.
- Gate per task: its own focused test command and grep. Full suite only in Task 6 (owner's rule: focused tests per change, full suite once before merge).
- Stop conditions: a migrated test fails on the frozen data (means the test depended on something 40d90aa lacks: report, do not edit its assertions); Step 3 of Task 6 shows a failure outside the 6 live tests twice in a row; the deploy run fails.
- Rollback: everything is on the branch until Task 6 Step 5; after it, `git revert -m 1 <merge>` restores the old tests (the site is unaffected either way, the change touches no `web/` file).
- Review: one fresh reviewer on the whole branch diff before Step 5 (subagent, most capable model), plus the owner's OK to merge if they ask for it.
