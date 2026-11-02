# Frozen Test Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behavior tests read a frozen copy of the 21.10 data, so a nightly Afeka change no longer fails the deploy; data-invariant tests keep guarding the live export.

**Architecture:** One helper module (`test/fixtures/real.mjs`) owns the list of frozen files, their location and the refresh command. Behavior tests import it instead of building `web/data/afeka` paths. The live-side tests are untouched. A new test runs the export checker's per-file schema check, plus a name/metadata check, on each frozen file.

**Tech Stack:** Node 24 (CI) / 26 (local), `node:test`, `node:fs` with URL paths, `git show` for the refresh.

**Spec:** `docs/superpowers/specs/2026-11-02-frozen-test-data-design.md`

Revised after a Codex review of this plan (2026-11-02): branch ancestry, safe probes, seven live tests, injected `resolve`, exact SHA, deploy tracking, rollback.

## Global Constraints

- Branch `claude/frozen-test-data` starts at 66f5eb7 (the nightly data, the same as `main`) plus the spec and plan commits. So the working tree already has the data that fails; the 21.10 data is reached only through `git show 40d90aa:…`.
- Frozen source: `40d90aacfb923a92efb888da1180ab014fbfa6ea`. Frozen files (13): 2027-1: 10-2024, 11-2027, 12-2027, 19-2026, 22-2027, 30-2026, 30-2027, 32-2024, 32-2027, 42-2027; 2027-2: 19-2026, 30-2026; 2027-3: 30-2026. Minified total 1,585,415 bytes.
- File format: `JSON.stringify(data) + '\n'`, UTF-8, written by Node only (never shell redirection).
- Paths: URL objects relative to `import.meta.url`; `fileURLToPath` only where an API needs a string (`checkExport`). No `.pathname`, no URL-string concatenation.
- Tests on frozen data never skip or return early when a file is missing.
- The 7 live tests (unchanged; the only ones allowed to fail when `web/data/afeka` is absent):
  1. `check-export.test.mjs` — `the data the site ships passes`
  2. `scrape.test.mjs` — `every committed data file carries the specializations, their lists and the degree`
  3. `programs-official.test.mjs` — `areas and pick rules match the curricula`
  4. `programs-official.test.mjs` — `master's programs 61 and 65 are out of the config, the catalog and the data`
  5. `settings.test.mjs` — `the shipped settings.json: a clean, factual conflict for each program section 21 names (22, 20, 32, 12, 11, 112, 19)`
  6. `check-real.test.mjs:47` — `the 3 sample programs have no data errors`
  7. `check-real.test.mjs:145` — `sample: 19-2026, 20-2026, 30-2026 semester א pass the record, plan and metamorphic checks`
- No change under `web/`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A test still reads live data through a path grep misses (template string, `SRC` constant, directory scan) → Task 6 absence probe: only the 7 live tests may fail.
2. A migrated test passes only because a skip or early return hides it → Task 3 removes every skip; Task 6 compares `# tests` / `# skipped` with the Step 0 baseline.
3. The refresh writes half the files, then fails (bad ref, missing file, bad JSON) → Task 1 tests: nothing written, error names the cause.
4. A fixture on disk but not in `FILES`, or listed but missing, or a file whose content is another program → Task 1 tests.
5. Git turns the fixture `\n` into `\r\n` on a Windows checkout → `.gitattributes` `test/fixtures/real/** -text` before the files are staged; Task 1 minified-JSON test reads the bytes.

---

### Task 1: Frozen copy, helper and drift guard

**Files:**
- Create: `test/fixtures/real.mjs`
- Create: `test/fixtures/real/` (13 JSON files + `SOURCE`, generated)
- Create: `test/fixtures-real.test.mjs`
- Modify: `scripts/check-export.mjs:90` (add `export` to `checkFile`, body unchanged)
- Modify: `.gitattributes` (create if missing): `test/fixtures/real/** -text`

**Interfaces:**
- Produces:
  - `FILES: string[]` — the 13 relative paths, e.g. `'2027-1/30-2026.json'`.
  - `REAL_DIR: URL` — `new URL('./real/', import.meta.url)`.
  - `real(path: string): object` — `JSON.parse(readFileSync(new URL(path, REAL_DIR), 'utf8'))`.
  - `freeze(ref: string, { resolve = gitRevParse, show = gitShow, dir = REAL_DIR } = {}): string` — `sha = resolve(ref)`; for every `FILES` entry `text = show(sha, 'web/data/afeka/' + path)` and `JSON.parse(text)`; only when all parse, writes each as `JSON.stringify(d) + '\n'` under `dir` and `SOURCE` as `sha + '\n'`; returns `sha`. On a resolve, read or parse failure it throws an `Error` whose message names the path and the cause, and writes nothing (a failed disk write can leave a half refresh; git restores it).
  - `gitRevParse(ref)` / `gitShow(sha, path)`: `execFileSync('git', […], { cwd: <repo root from import.meta.url>, encoding: 'utf8', maxBuffer: 64e6 })`; `gitRevParse` trims.
  - CLI: `node test/fixtures/real.mjs <ref>` prints the sha; without a ref prints `usage: node test/fixtures/real.mjs <git-ref>` and exits 1. Guarded by `import.meta.url === pathToFileURL(process.argv[1]).href`.
  - `checkFile(d, label, out): boolean` exported from `scripts/check-export.mjs`.

- [ ] **Step 1: Write the failing tests** in `test/fixtures-real.test.mjs`:
  - `'frozen data: FILES matches the files on disk'` — for each `2027-N/` under `REAL_DIR`, `readdirSync` sorted; the union (as `2027-N/<f>`) deep-equals `[...FILES].sort()`.
  - `'frozen data: SOURCE is 40d90aa'` — `readFileSync(new URL('SOURCE', REAL_DIR), 'utf8')` equals `'40d90aacfb923a92efb888da1180ab014fbfa6ea\n'` (a future refresh updates this constant on purpose).
  - `'frozen data: every file passes the export schema (refresh with node test/fixtures/real.mjs <ref> if this fails)'` — for each file, `const out = []`; `checkFile(real(f), f, out)` is `true`; `out` deep-equals `[]`.
  - `'frozen data: each file is the program, cohort and semester its name says'` — for `'2027-N/P-Y.json'`: `d.year === 2027`, `d.program === P`, `d.startYear === Y`, `d.semester === { 1: 'א', 2: 'ב', 3: 'קיץ' }[N]`.
  - `'frozen data: files are minified JSON with one trailing newline'` — raw text `=== JSON.stringify(JSON.parse(raw)) + '\n'`.
  - `'freeze: a missing file writes nothing'` — temp dir URL from `mkdtempSync`; `freeze('x', { resolve: () => 'abc', show: (s, p) => { if (p.endsWith('42-2027.json')) throw new Error('missing'); return '{}'; }, dir })` throws `/42-2027\.json.*missing/`; `readdirSync(dir)` is `[]`.
  - `'freeze: bad JSON writes nothing'` — same with `show` returning `'{'` for `19-2026.json`; throws `/19-2026\.json/`; dir empty.
  - `'freeze: writes every file and SOURCE'` — `show` returns `JSON.stringify({ a: 1 }, null, 2)`; returns `'abc'`; `SOURCE` is `'abc\n'`; each file is `'{"a":1}\n'`.

- [ ] **Step 2: Run to verify they fail** — `node --test test/fixtures-real.test.mjs` → FAIL, `Cannot find module …/fixtures/real.mjs`.
- [ ] **Step 3: Implement** `test/fixtures/real.mjs`, the `export` on `checkFile`, the `.gitattributes` line.
- [ ] **Step 4: Generate** — `node test/fixtures/real.mjs 40d90aa` prints `40d90aacfb923a92efb888da1180ab014fbfa6ea`; `test/fixtures/real/` holds 13 JSON files and `SOURCE`.
- [ ] **Step 5: Verify** — `node --test test/fixtures-real.test.mjs test/check-export.test.mjs` → PASS. `git add --dry-run test/fixtures/real` lists 14 files; `git check-attr text -- test/fixtures/real/2027-1/30-2026.json` says `unset`.
- [ ] **Step 6: Commit** — `git add .gitattributes scripts/check-export.mjs test/fixtures/real.mjs test/fixtures/real test/fixtures-real.test.mjs` then `git commit -m "test: frozen copy of the 21.10 data for behavior tests, with its schema guard"`.

### Task 2: Rules, specs, app, build and report tests read the frozen copy

**Files:**
- Modify: `test/rules.test.mjs:462-463` (`cohort`), `:524` (`real`)
- Modify: `test/rules-after-a.test.mjs:27`
- Modify: `test/specs.test.mjs:67`, `:94`, `:167`
- Modify: `test/app.test.mjs:196`, `:472`
- Modify: `test/build.test.mjs:575`
- Modify: `test/rules-report.test.mjs:10`, `:92`

**Interfaces:**
- Consumes: `real`, `REAL_DIR` (Task 1). Import as `import { real as frozen, REAL_DIR } from './fixtures/real.mjs'` where a local `real` exists; keep each local helper's name and signature, change only its body (app: `const real = (n) => frozen(\`2027-${n}/30-2026.json\`)`). rules-report: `copyFileSync(new URL('2027-1/30-2026.json', REAL_DIR), …)`.

- [ ] **Step 1: See it fail** — `node --test test/rules.test.mjs` → FAIL at `recordWarnings + classify: failing 10336 …` (`'notOffered'` vs `'retake'`). The working tree already has the nightly data.
- [ ] **Step 2: Swap the reads** in the six files.
- [ ] **Step 3: Verify** — `node --test test/rules.test.mjs test/rules-after-a.test.mjs test/specs.test.mjs test/app.test.mjs test/build.test.mjs test/rules-report.test.mjs` → all PASS. `grep -n "web/data/afeka" <same six files>` prints nothing.
- [ ] **Step 4: Commit** — `git commit -am "test: rules, specs, app, build and report tests use the frozen data"`.

### Task 3: Solver tests read the frozen copy, no skips

**Files:**
- Modify: `test/solver.test.mjs:198-199`, `:574-575`, `:686`, `:733`, `:947-950`, `:1118-1121`, `:1141-1144`, `:1235-1240`, `:1458-1460`, `:2119-2121`, `:2137-2142`

**Interfaces:**
- Consumes: `REAL_DIR` (Task 1). `REAL = new URL('2027-1/30-2026.json', REAL_DIR)`, `REAL2 = new URL('2027-2/30-2026.json', REAL_DIR)`; every inline `'web/data/afeka/2027-N/30-2026.json'` becomes `REAL` / `REAL2`; directory scans use `new URL('2027-N/', REAL_DIR)`.

- [ ] **Step 1: Baseline** — `node --test test/solver.test.mjs > <scratch>/solver-before.txt; echo $?`; note `# tests`, `# pass`, `# skipped` from the file's tail.
- [ ] **Step 2: Swap paths; delete every `skip:` option and the `existsSync` guards at 199, 2120, 2138; replace the early `return`s at 2121 and 2142 with `assert.ok(files.length)` / `assert.ok(both.length)`.** Keep the `existsSync(new URL(f, dir(2)))` filter at 2141 (it selects, it does not skip).
- [ ] **Step 3: Verify** — same command to `solver-after.txt`; exit 0; `# tests` equals Step 1; `# skipped 0`. `grep -n "web/data/afeka\|skip:" test/solver.test.mjs` prints nothing.
- [ ] **Step 4: Commit** — `git commit -am "test: solver tests use the frozen data and never skip"`.

### Task 4: Map and XSS tests read the frozen copy

**Files:**
- Modify: `test/ui-map.test.mjs:29`, `:714`, `:729`, `:742`, `:752`, `:890`, and any other `web/data/afeka` read found by grep
- Modify: `test/xss.test.mjs:10`

**Interfaces:** Consumes `real` / `REAL_DIR` (Task 1), same import pattern as Task 2.

- [ ] **Step 1: Record counts** — `node --test test/ui-map.test.mjs test/xss.test.mjs` tail: `# tests`, `# skipped`.
- [ ] **Step 2: Swap the reads.**
- [ ] **Step 3: Verify** — same command: exit 0, same counts. `grep -n "web/data/afeka" test/ui-map.test.mjs test/xss.test.mjs` prints nothing.
- [ ] **Step 4: Commit** — `git commit -am "test: map and XSS tests use the frozen data"`.

### Task 5: Checker tests split between frozen and live

**Files:**
- Modify: `test/check-export.test.mjs:8`, `:16`, `:106`
- Modify: `test/check-real.test.mjs:108` (`no plan: …`), `:139` (`the CLI runs the state suites …`)

**Interfaces:**
- Consumes: `real`, `REAL_DIR` (Task 1).
- check-export: `SRC = 'web/data/afeka'` stays, used only by `the data the site ships passes`; add `const FROZEN = fileURLToPath(REAL_DIR)` for `mini()`'s `cpSync` and `checkExport(dir, { against: FROZEN })`.
- check-real: the two checker tests use `real(f)`; live tests 6 and 7 (Global Constraints) unchanged.

- [ ] **Step 1: Make the edits.**
- [ ] **Step 2: Verify** — `node --test test/check-export.test.mjs test/check-real.test.mjs` → PASS. `grep -n "web/data/afeka\|SRC" test/check-export.test.mjs test/check-real.test.mjs` shows only the `SRC` definition, its one use, and the reads inside live tests 6 and 7.
- [ ] **Step 3: Commit** — `git commit -am "test: checker logic tests use the frozen data; the live export checks stay"`.

### Task 6: Prove it, merge, deploy

**Files:** none in the repo. One scratch script outside it: `<scratch>/probe.mjs`.

**Interfaces:**
- `probe.mjs <mode>` run from the repo root, `mode` = `old` or `absent`:
  - Refuses to start unless `git status --porcelain` is empty and `web/data/afeka.off` does not exist.
  - `old`: `git checkout 40d90aa -- web/data/afeka`; `absent`: `renameSync('web/data/afeka', 'web/data/afeka.off')`.
  - Runs `npm test` with `spawnSync` (`shell: true`, output to `<scratch>/probe-<mode>.txt`), keeps its exit code.
  - `finally`: `absent` renames back; `old` runs `git checkout HEAD -- web/data/afeka`; then asserts `git status --porcelain` is empty again.
  - Prints the `not ok` test names from the output and exits with npm's code.

- [ ] **Step 0: Baseline (before Task 1)** — `git status --porcelain` empty; `npm test > <scratch>/base.txt; echo $?` → exit 1 (the 10336 test). Record `# tests`, `# skipped`.
- [ ] **Step 1: Suite on the nightly data** — `npm test > <scratch>/full.txt; echo $?` → 0; `# tests` = baseline + 9 (Task 1's tests, including the import check added after review); `# skipped` ≤ baseline.
- [ ] **Step 2: Suite on the 21.10 data** — `node <scratch>/probe.mjs old` → exit 0.
- [ ] **Step 3: Data absent** — `node <scratch>/probe.mjs absent` → the `not ok` names are exactly the 7 live tests. On the first other name: stop, keep the data restored (the script does), fix the missed read in its task's file, commit, rerun.
- [ ] **Step 4: Trust checks** — `npm run check:real; echo $?` → 0.
- [ ] **Step 5: Branch review** — one fresh reviewer (subagent, most capable model) on `git diff 66f5eb7..HEAD`; fix what it confirms.
- [ ] **Step 6: Integrate the latest main** — `git fetch origin main`; if `origin/main` moved past 66f5eb7 (another nightly), `git merge --no-edit origin/main` and repeat Steps 1 and 3.
- [ ] **Step 7: Merge and push** — `git switch main && git merge --ff-only origin/main && git merge --no-ff claude/frozen-test-data -m "Merge claude/frozen-test-data: behavior tests read frozen data, nightly data reaches the site again"`; `git push origin main claude/frozen-test-data`. Record `M=$(git rev-parse HEAD)`.
- [ ] **Step 8: Deploy by hand** (the push touches no `web/**`, so no run starts) — `gh workflow run deploy.yml -R dolev-benezri/lets_learn --ref main`; find the run with `gh run list -R dolev-benezri/lets_learn -w deploy.yml -L 3 --json databaseId,headSha,event,status` whose `event` is `workflow_dispatch` and `headSha` is `$M`; `gh run watch <id> --exit-status -R dolev-benezri/lets_learn` as one background wait. If it ends `cancelled` because a newer deploy (a nightly) took its place, check that newer run instead; it carries these tests too.
- [ ] **Step 9: Site check** — `curl -fsSL https://dolev-benezri.github.io/lets_learn/data/afeka/status.json` `checkedAt` equals `checkedAt` in `git show $M:web/data/afeka/status.json`.

## Execution plan

- **Order:** Task 6 Step 0 (baseline), Task 1 (every other task imports it), Tasks 2-5 in order in this session (disjoint files, a few path swaps each; parallel sessions cost more than they save), Task 6 Steps 1-9.
- **Gates:** each task ends on its own focused test command and grep. The full suite runs only in Task 6, where the probes need it.
- **Stop conditions:** a migrated test fails on the frozen data: investigate the migration first (a wrong path is likelier than missing data); never change its assertions to make it pass without the owner. An unexpected name in the absence probe: stop at the first one. The deploy run fails: read its failed log once, report.
- **Rollback, source:** before Step 7 everything is on the branch. After it, `git revert -m 1 $M` restores the old tests, which also brings back the failing 10336 test and blocks nightly deploys again, so prefer a forward fix.
- **Rollback, site:** the change itself touches no `web/` file. Step 8 publishes the nightly data (66f5eb7 or newer); that is the intended effect. If that data is wrong for users, the fix is a data commit (for example, restoring the files from 40d90aa with `git checkout 40d90aa -- web/data/afeka` and a commit), whose push deploys on its own.
- **Owner checkpoints:** before Step 7 (merge to main), report Steps 1-5 results and wait for OK, per the owner's plan-first rule.
