# Flaky browser tests on GitHub, and the "מקום חדש" mark on an unmoved lecture: plan

Date: 2026-11-25. Status: approved by the owner on 2026-11-25.

The owner asked (2026-11-25): fix both, with a plan first.

## Part 1: the browser tests that fail on GitHub at random

### What happens

The GitHub workflow `browser` (WebKit, Chromium, Firefox) failed 13 times in its last 30 runs. In the recent ones, each failure is one test, and a different test each time:

| Run | Engine | Test | Error |
|---|---|---|---|
| 11-25 | WebKit | flows: "no network offers a retry only…" | a script error: `solver-worker.js due to access control checks` |
| 11-24 | WebKit, Firefox | flows: "advisor summary prints…" | 30 s wait for the print, which never came |
| 11-24 | Chromium | a11y-a: "collapsed and expanded phone sheets…" | the focus was `''` and not yet on `editTitle` |
| 11-23 | Chromium | first-run-a: "the grade sheet fills the list…" | the pass was not ticked yet |
| 11-23 | Firefox | map-targets: "opening centres the plan…" | the focus outline was `none`, not yet `solid` |

Every one of these tests passes when its file runs alone, both here and three times in a row. They fail only inside a full run. Every red run mails the owner.

### Root cause (two layers)

1. **The machine is overloaded.** `test/browser/run.mjs` hands every spec file to one `node --test`. By default that runs about one file per core minus one. GitHub's runner has 4 cores, so 3 browser files run at once. The evidence is in the 11-24 WebKit log: the test times add up to 3,650 s, but the run took 1,251 s. Under that load the page is slower than the tests expect.
2. **Some tests read the page right after an action, without waiting for it to finish.** This shows in the focus, the tick and the outline above. On a quiet machine the page wins the race, and on a loaded one it does not. The no-network test reloads the page while the search engine may still be loading. WebKit then reports the interrupted load as a script error, and the test counts every script error.

### The fix

- **1a. Split the load (the root).**
  - `run.mjs` takes `SHARD=k/n` and runs only its share of the spec files. The split is fixed: the files are sorted, and each one is in exactly one share.
  - On GitHub (`CI` set) it runs one file at a time (`--test-concurrency=1`).
  - The workflow runs each engine in 4 parallel jobs (shards). Each job then has a quiet machine, and the whole run still ends in about 20 minutes.
  - GitHub minutes cost nothing for a public repository.
  - Locally nothing changes. `npm run test:browser` is the same as today, so the owner's full local run is unchanged.
- **1b. The tests that race.** Each of the 5 tests above waits for the state it checks, with a condition wait and no fixed sleep. Each is checked by reading its code; the table is the starting list.
  - The no-network test waits until the week is drawn (the search has run) before it reloads.
  - The print test waits for the button's schedule to be ready before it clicks.

### How it is checked

- A unit test for the split: every spec file is in exactly one share, and `1/1` gives all of them.
- Locally:
  - each changed spec passes 5 times in a row;
  - the full WebKit run passes.
- On GitHub, before the merge, the workflow is run 3 times on the branch (`gh workflow run browser.yml --ref claude/flakes-moved`). All 3 must be green in all three engines.
- After the merge, the run on main is green.

### What this does not do

- No automatic retry of a failed test. A retry would hide a real failure and keep the flake.
- No longer timeouts as a fix.

## Part 2: an unmoved lecture marked "מקום חדש"

### What happens

On the edit page, a proposal (or a change the student made by hand) may change only a course's tutorial group. Even then, the board marks every lesson of that course as moved:

- The lecture, which stays in its group and its hours, gets the green "מקום חדש" outline.
- A dashed "היה כאן" sits under it, unseen on the board.
- The day bar shows a "יש שינוי" dot on the lecture's day.

The new share image repeats the green outline, because it draws what the board draws.

### Root cause

In `web/ui-edit.js`:

- `newGroups(p)` takes every group of each course in `p.changed`. A course counts as changed when any of its groups changed (`edit-search.js`).
- `weekParts` does the same for a change made by hand (`st.swaps`).
- The old places (`ghosts`) are every lesson of those courses in the schedule before the change.

### The fix

One pure helper in `web/ui-edit.js`, `movedParts(baseline, lessons, courses)`. It returns:

- **new groups:** the groups in the new lessons of those courses that are not among the course's groups before the change;
- **old places:** the lessons before the change whose group is not among the new lessons.

`weekParts` uses it for both a proposal and a change made by hand. Then the green outline, "היה כאן", the day dot and the image all follow what really moved. The card in the proposal panel, with the old place struck through and the new one, is not touched.

### How it is checked

- A unit test written first:
  - **the case:** a course whose tutorial changes and whose lecture stays.
  - **expected:** only the tutorial's new group is new; the old place is only the old tutorial.
  - **also:** a course whose lecture and tutorial both change keeps both.
- A WebKit spec written first:
  - **the input:** a hand change that swaps only the tutorial, seeded with real groups from the frozen data.
  - **expected:** the lecture block has no green outline; no "היה כאן" at the lecture's hours; no change dot on a day where nothing moved.
- The existing edit specs and the share-image specs stay green.

## Order and process

1. Part 2 first. It is small, and it is a change to the site the owner can see.
2. Then part 1.

Both parts follow the same process:

- each change goes in with a test that failed first;
- a clean reviewer reads every commit before it is made;
- unit tests run after every edit;
- one WebKit run at a time;
- a full local run before the push.

Then a final review of the whole branch. Merging and pushing come after the 3 green GitHub runs.
