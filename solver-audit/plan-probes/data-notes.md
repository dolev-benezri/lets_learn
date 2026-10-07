[data] 22:16 offline rebuild works: node solver-audit/plan-probes/data-rebuild-offline.mjs ../../scripts out-before ; .yedion-cache/2027 has 1794 pages (Oct 3)

## Findings so far (data agent)
- P1: cache .yedion-cache/2027 (1794 pages, gitignored, Oct 3). 425 course-detail pages; row kinds: קדם x527, מקביל x82, אקסקלוסיבי x17 (data-p1-rowtypes.mjs). parse.mjs:77 maps 544 (=527+17) to 'קדם'.
- Offline rebuild with CURRENT parser reproduces committed prereqs 144/144 files (data-p4-compare.mjs). Fixed parser (filter /^תנאי (קדם|מקביל)/ at parse.mjs:75) in scripts-fixed/: self-ref records 171 -> 0.
- Dropped rows summed over 144 files: self 183 (5 distinct), resolved non-self 3 (1 distinct: 10224->30356, file 19-2024 etc), all-null 480 (11 distinct; classify shows bogus 'קדם מחוץ לתוכנית' note). 20% prereq-count guard: 0 files refused.
- P3 existing guards: scripts/build.mjs:98-101 fieldHealth already rejects day null, start>=end, start<07:00, end>23:30 (test/build.test.mjs:280). Gap only: end 23:00..23:30 and start not on :00/:30. Real data: all starts :00, ends :50 (16 x :00, 16 x :30), earliest 08:00, latest end 22:50.
- Rebuild helpers: data-rebuild-offline.mjs <scriptsDir> <outDir>.

## Verified in sandbox (solver-audit/plan-probes/sandbox = copy of repo + fixes + prereq-patched data)
- Full suite: 437/437 pass with prereq-patched data and unfixed code; 441/441 with fixes + 4 new tests (parse, 2x build, solver). Line-length test (web/*.js <= 200 chars) caught my first F-01 patch; split version longest line 188.
- Fixed parser rebuild vs committed: 144/144 files change prereqs only; max prereq-count change 7.2% (guard 20%); proposed validate(): 0 errors on all 144 files.
- Offline whole-file rebuild from the Oct-3 cache would roll back 112/144 files' groups (full flags): patch ONLY prereqs (patch-data.mjs).
- Flips (sandbox): D-10, metric-selfloop, metric-selfloop-values, metric-selfloop-blocks-mandatory, metric-selfloop-unlocks (need regenerated data); metric-selfloop-parser, bits-05k (code only). selfloop-2-*/selfloop-3 are CHECKs of the bug state -> FAIL after data fix (rewrite). SR-1, SRR-1/2, SB-1..3, opts-C04..C09, bits-05l stay PASS. SN-3/SN-4/SB-4/opts-1/opts-1b unchanged (not data-side).
