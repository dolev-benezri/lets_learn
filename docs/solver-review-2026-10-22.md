# Solver review, 2026-10-22

Every line of `web/solver-core.js`, `web/solver-worker.js` and `web/rules.js` was read while the files were laid out
one statement per line. Line numbers below are for the files after that layout change (branch
`claude/readable-solver-716da1`).

## Checked and sound

- **Branch and bound (`friendsUp()` and `bound()`, `web/solver-core.js:462-500`).** Each term of the bound is never below what any
  completion can score, so pruning cannot drop a plan that would reach the top K:
  - progress and credits add at most what is left (`restValue`, `restCredits`, negative values clipped to 0);
  - free days and time window only get worse as courses are added;
  - friends: per friend `(s + x) / (T + y)` with `x <= y` (shared minutes are part of the total) and `x <= R` is at
    most `(s + R) / (T + R)`, because `s <= T`;
  - unlocks: whatever a completion opens is a subset of `got ∪ restU[i]`;
  - exam spread: the smallest gap between exams can only shrink as exams are added; compact is at most 1.
  - `leaf()` rejects ties (`<=`) the same way the prune does, and in `distinct` mode a plan that replaces its own
    course set still has to beat the K-th score first, so the prune stays exact.
- **Year search (`searchYear`).** The `forced()` chain parses the way the comment says (`??` binds tighter than
  `?:`). Seeds are deduplicated against the top-50 א׳ list. The relax-one-must rounds lift only the pins of the
  courses they relax.
- **Bit masks.** Bit 31 makes a day mask negative, but `popcount` uses `>>> 0` and `Math.clz32` works on unsigned
  values, so gap minutes are right for 22:30-23:00 lessons too.
- **Data facts checked against `web/data/afeka` (144 files):** every course has numeric credits, no meeting falls
  outside 07:00-23:00, every primary group has a meeting with a day, and no file has exams published yet. Several
  edge cases below cannot happen with today's data for these reasons.

## Findings

### 1. Year view called a course blocked that the year solver plans (fixed)

- **Where:** `web/rules.js:209` (`withAfterA`, the `candA` list).
- **What:** `withAfterA` counted only `available` and `retake` courses as א׳ candidates. `searchYear` counts every א׳
  candidate as passed for ב׳, `conditional` ones too, since `modeFor` plans them.
- **Input:** a year file with Y (א׳), X (א׳, parallel requirement Y) and Z (ב׳, prerequisite X). `withAfterA` gave
  Z the status `blocked`, while `searchYear` with X, Y, Z in the year list returned א׳ = [Y, X], ב׳ = [Z]. The
  course list showed Z as blocked and gave no way to choose it, even though the plan the solver showed included it.
- **Fixed:** commit "Year view: a conditional א׳ course opens its ב׳ follow-ups (afterA)", with
  `test/rules-after-a.test.mjs` (it failed before the fix with `actual: 'blocked'`).

### 2. Meetings fully outside 07:00-23:00 drop out of the mask (not fixed)

- **Where:** `web/solver-core.js:13-24` (`meetingsMask`).
- **What:** the comment says such meetings "are clamped to the edge slots". That is true for a meeting that only
  partly crosses the edge. A meeting entirely before 07:00 or from 23:00 on gets `a >= b` and sets no bit, so it
  never clashes with anything.
- **Input:** two lessons on Sunday 23:00-23:45 give an all-zero mask, so they are not reported as a clash.
- **Status:** cannot happen with today's data (no meeting is outside the window). Either fix the comment or clamp
  `a` to at most 31 and `b` to at least `a + 1` if Afeka ever schedules there.

### 3. The free-days score can go above 1 (not fixed)

- **Where:** `web/solver-core.js:308` (`freeDays: freeDays.length / 5`) and the matching `free / 5` in `bound()`.
- **What:** with Friday wished off (the default), there are six candidate days. The comment above
  `freeDayCandidates` relies on every plan having a lesson on one of them. A plan whose lessons all have no day
  (`m.day` empty) scores 6 / 5 = 1.2, which breaks the "each metric is at most weight * 1" note above `PRIMARY`.
- **Input:** `dayOff: [6]` and one optional course whose only group has `meetings: [{ day: 0, ... }]`.
- **Status:** cannot happen with today's data (every primary group has a meeting with a day). Harmless for
  ranking; `Math.min(..., 1)` would close it.

### 4. A search with no answer can run well past its time budget (not fixed)

- **Where:** `web/solver-core.js:570-579` (the "prefer" retry) and `web/solver-core.js:585-588` (`relaxed`).
- **What:** when the first pass finishes with no plan and a lecturer is marked "prefer", the retry runs again with
  the full `timeLimitMs`, not with what is left. After that, the "why" searches (the campus-day cap plus up to six
  `whyNot` tries, each `timeLimitMs / 8`) run one after the other, and each of them can do its own "prefer" retry.
- **Input:** must courses A (lecturer L Sunday 09:00, lecturer M Monday 09:00) and B (only Sunday 09:00), with
  `lecturers: { L: 'prefer' }`. The first pass finds nothing, so a second full search runs. On a hard input that
  takes almost the whole budget each time, the total is about 2 × budget plus the why searches, roughly 3-4 ×
  `timeLimitMs`.
- **Status:** only the time is affected, never which plans are found. Passing `deadline - Date.now()` to the retry
  would keep it inside the budget.

### 5. "At least 0 days between exams" text (not fixed)

- **Where:** `web/solver-core.js:324` (`explain`).
- **What:** with `examsSameDay: 'allow'` and two exams on one day, `minGap` is 0 and the plan reads
  "לפחות 0 ימים בין בחינות".
- **Status:** cannot happen yet (no exams are published). It should say that two exams fall on the same day.

### 6. Year progress uses two value scales for one course (not fixed, low)

- **Where:** `web/solver-core.js:706-712` (`yearMax`) and `web/solver-core.js:837` (`yearProgress`).
- **What:** an א׳ candidate goes into `yearMax` at its א׳ value (`vA`). When a pair takes that course in ב׳ instead,
  it is scored at its ב׳ value (`vB`). The two can differ (each semester file has its own prerequisite graph), so year
  progress can be a little off, or slightly above 1.
- **Status:** a small ranking effect only. Using one value per course (for example `vA[id] ?? vB[id]`) in both
  places would make the scale match.

### 7. `withAfterA` and `setStatus` assume `passed` and `failed` exist (not fixed, latent)

- **Where:** `web/rules.js:212` (`[...state.passed, ...candA]`) and `web/rules.js:233-234` (`state.failed[id]`).
- **What:** `classify` and `searchYear` accept `state.passed` being null (`new Set(null)`, `?? []`), but
  `withAfterA` throws `TypeError: state.passed is not iterable`. `DEFAULT.passed` in `web/app.js:14` is `null`, and
  only `ensurePassed()` fills it.
- **Input:** `withAfterA(yearData, { passed: null, failed: {} }, classify(yearData, { passed: null }))` throws.
- **Status:** the app always calls `ensurePassed()` first, so this does not happen today. `state.passed ?? []` would
  match the other functions.
