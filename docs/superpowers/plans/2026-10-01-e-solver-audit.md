# Solver re-check — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. For every suspect below: write the test first, watch it fail (that proves the bug), and only then fix. A suspect whose test passes is recorded as "not a bug" in the ledger.

**Goal:** Re-verify `web/solver-core.js` (`search`, `searchYear`) end to end:
- invariants that must hold for every result, on random data;
- every concrete suspect found while reading the code on 2026-10-01;
- performance on real data.

**Architecture:** Tests only, plus fixes where a test proves a bug. Add a property-based test with a seeded PRNG and no new dependency, which checks invariants over many random two-semester fixtures. Add one targeted test per suspect.

**Tech Stack:** `node --test`. Fixtures follow the existing helpers in `test/solver.test.mjs` (`grp`, `yc`, `pre`, `semData`, `yearFixture`, `yState`, `W`, `W0`, `brute`).

**Note:** the 2026-10-01 debug session read `solver-core.js` and `rules.js` in full and found no crash or correctness bug. The suspects below are ranking and design issues (what is ranked first), so each needs a failing test before it counts.

**Spec:** `docs/superpowers/specs/2026-10-01-full-year-design.md` (year planning) + `docs/superpowers/specs/2026-09-30-afeka-scheduler-design.md` (solver). Regulations engine: `web/rules.js` (תקנון 5.2.2026).

## Global Constraints
- Baseline 2026-10-01: `npm test` → 148/148 pass, 2.2 s.
- Never change a result-ranking constant (`SHARE`, `LOAD_W`, `MISSING_W`, `BONUS`, `DEPTH_BONUS`) without a test that shows why.
- Any solver fix must keep the existing equivalence tests green ("pruning keeps results identical…", "search finds exactly the valid combinations (vs brute force)").

## Review Focus
- Random fixtures must include: courses offered in only one semester, parallel (`מקביל`) prerequisites, `anyOf` with 2 options, full groups, `maxCredits`, pins, and `semesterOf`.
- Invariant failures print the seed so they can be reproduced.

---

### Task 1: Property test for `searchYear` invariants

**Files:** Create `test/solver-props.test.mjs`

- [ ] **Step 1: Write the test.** Use a seeded PRNG: `const rnd = (s) => () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);`. Build 300 random fixtures:
  - 5–8 courses, each offered in A, B or both;
  - 1–3 groups of 1–2 meetings on days 1–5, between 08:00 and 18:00;
  - random `קדם` edges only from a lower to a higher index (no cycles);
  - occasionally a `מקביל` edge;
  - random `choices` (must/optional), random `passed`, an occasional pin, `semesterOf`, and `constraints.maxCredits`.

  For each result `p` of `searchYear(...)`, assert all of the following:
  1. There is no time overlap inside `p.a.groups`, and none inside `p.b.groups`. Check with interval comparison, the way `brute` does, not with masks.
  2. No course is in both `p.a.courses` and `p.b.courses`.
  3. Every course in `p.b` has every `קדם` `anyOf` satisfied by `passed ∪ p.a.courses`. Every course in `p.a` is satisfied by `passed` alone.
  4. `מקביל`: a course with a parallel requirement has it satisfied by `passed`, an earlier semester, or the same semester.
  5. Every group id in `p.a.groups` exists in `dataA`, and every one in `p.b.groups` exists in `dataB`.
  6. A pinned group appears in its semester. A course with `semesterOf: X` appears only in semester X, or not at all (then it is in `missing` if it is must).
  7. Every must course is in `p.a ∪ p.b` or in `p.missing`, and nothing in `p.missing` was actually placed.
  8. `p.credits.a ≤ maxCredits` and `p.credits.b ≤ maxCredits` when `maxCredits` is set.
  9. `p.credits.a` equals the sum of credits of `p.a.courses` (and the same for b).
- [ ] **Step 2: Run** `node --test test/solver-props.test.mjs`. Any failure is a bug. Fix it in `solver-core.js` and rerun. Expect PASS on all 300 seeds and a total runtime under 5 s. Lower the count if it is slower, and say so in the ledger.
- [ ] **Step 3: Commit** `test(solver): property test for year-plan invariants`. If there were fixes, commit them separately as `fix(solver): …`.

### Task 2: Targeted suspects (each: test first, then fix if it fails)

**Files:** `test/solver.test.mjs`, `web/solver-core.js`

- [ ] **S1. The year score adds two separately normalised scores.**
  - **Suspect:** `progress` is `val / ctx.maxValue`, and `maxValue` is the value sum of *that search's* candidates. Phase B candidates depend on which A alternative ran (`stB`), so `b.score` has a different denominator per A alternative. An A choice that unlocks fewer B courses gets a *smaller* B denominator, which inflates B progress and can rank a worse year plan first.
  - **Test:** a fixture where A1 = {P} unlocks N in B and A2 = {Q} unlocks nothing. Equal credits, and N is worth taking. Assert the best pair is A1 + {N, …}.
  - **Fix if it fails:** score pairs by an absolute year-level progress (`(Σ value of all placed courses) / (Σ value of all year candidates)`), computed in `searchYear` with the same `value` formula. Export a small `courseValue(data)` helper from `search` instead of duplicating it.
- [ ] **S2. B fallback drops must priority for everyone.**
  - **Suspect:** when the B search with musts fails, it reruns with *all* courses optional, so a feasible must course may lose to electives.
  - **Test:** B has must X (feasible), must Y (impossible: it clashes with a pinned group), and optional E, which clashes with X and is worth more. Assert the result has X and `missing` is ['Y'].
  - **Fix if it fails:** in the fallback, relax only the must courses that `diagnose` names, or relax one must at a time.
- [ ] **S3. Spurious warning "התכנון של ב׳ מניח שעוברים את X".**
  - **Suspect:** `needs` lists every A-course in a B course's `anyOf`, even when another option of that same `anyOf` is already passed.
  - **Test:** B course N with `anyOf [P, P2]`, P2 already passed, and P placed in A. Assert `warnings` is empty.
  - **Fix:** skip an `anyOf` group that `state.passed` already satisfies.
- [ ] **S4. A course offered in neither semester.**
  - **Suspect:** `forced()` returns 'א' when `!offered(dataB)`, even if A does not offer it either.
  - **Test:** a must course offered nowhere is in `missing` of every pair and never placed, and nothing throws.
- [ ] **S5. Phase A top-50 cut.**
  - **Suspect:** a plan whose A part ranks below 50 in A alone can be the best *year* plan. For example, A rank 60 is the only one that unlocks a heavy must B course.
  - **Test:** a synthetic case with more than 50 A alternatives where only a low-ranked A enables B's must course. Assert it is found, or that `partial`/a note says so.
  - **Fix options, to decide with data:** add a phase-A bias toward courses that unlock year musts, or seed `aList` with the best A that contains each prerequisite of a B must.
- [ ] **S6. Friends counted per semester.** Friend groups span both semesters. Check that the friends metric in each half only counts that half's groups, so a friend fully in B does not make every A alternative look friendless and every B alternative look perfect. **Test:** a friend with groups only in B. Assert `p.a.breakdown.friends` is neutral (equal across A alternatives) and the pair ordering is driven by B.
- [ ] **S7. Retake offered in both semesters:** placed exactly once (the property test covers it; add an explicit case if it is not already covered).
- [ ] **S8. Regulations not modelled.**
  - Read `docs/research.md` and the takanon sections cited in `rules.js` for a per-semester credit cap or a minimum load, then check whether `constraints.maxCredits` has a default.
  - If the regulation has a cap, add it as the default with a test. If not, record "no cap in תקנון" in the ledger.
- [ ] **Commit** each fix as `fix(solver): <suspect>` with its test.

### Task 3: Performance on real data

**Files:** `test/solver.test.mjs`

- [ ] **Step 1:** Add a test (skip when real data is missing). Run 20 random real-data states: random `passed` subsets of year-1 and year-2 lists, random choices, 0–2 friends built from real group ids. Assert that each `searchYear` finishes in ≤ 3.5 s and that at most 2 of 20 are `partial`.
- [ ] **Step 2:** If it fails, profile which phase eats the budget (log `Date.now()` around phase A and the B loop in a scratch run, not in the commit) and record the numbers in the ledger before changing any constant.
- [ ] **Step 3:** Commit `test(solver): real-data timing over random states`.
