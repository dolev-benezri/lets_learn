# W1 data session plan (until the harvest ends, ETA 00:30)

Rule: sandbox only, zero site requests (they share the 400/hour limit with the harvest). One commit per task, each with its test. Push one commit at a time after the harvest is done.

| # | Task | Check | Needs harvest? |
|---|------|-------|----------------|
| 1 | Commit summary capped (done, 9ed1319) | scrape.test | no |
| 2 | Anchor for 10 = 10016 (min 3 primary groups in א and ב) | `validate` on the partial 10-2027 build | no |
| 3 | Partial offline build of 10 with real `validate`: sizes, ungrouped courses, prerequisite populations, spec lists all scraped | `scratchpad/partial.mjs 10 2027` + `anch.mjs` | no (2027 lists are cached) |
| 4 | Real-data check in the UI: copy the partial 10-2027 into the demo copy, open the planner, pick a specialization, look for console errors | browser | no |
| 5 | Same for 20 (electrical) as soon as its courses are cached; pick its anchor from year-א courses present in both semesters | `anch.mjs` | partly |
| 6 | Cohorts 2024-2026 of 10 and 20, evening tracks: full offline build | `scrape.mjs --offline` | yes |
| 7 | Commit data (separate commit), merge `feat/ci-nightly-programs`, run the full suite | `node --test` | yes |
| 8 | Push, one commit at a time; wait for the pages deploy | live URL | yes |

Open risks: S_EXAMS for every dept is fetched last by the harvest (exam checks stay unverified until then); electrical "power alone" list is approximate.
