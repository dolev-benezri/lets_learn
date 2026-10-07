# precision notes (running)

## Verified facts (read code)
- forbidden mask feeds ONLY buildOptions (web/solver-core.js:84 filter, :261 call, :371 diagnose with blocks removed). bound() never sees it: options are pre-filtered, restValue/restShared are built from filtered items (:288-296).
- prefMask (:265-273) feeds metrics (:199) and bound (:312) -> this is the only place the 30-min grid reaches bound().
- lateMask used only at :41 (hard) and :271 (soft). Not imported by any test or web module.
- F-20 data gate ALREADY EXISTS: scripts/build.mjs:98-101 fieldHealth() rejects day===null and !(start<end && start>='07:00' && end<='23:30'); tests test/build.test.mjs:257-284. findings.md F-20/F-06 fix text is stale for the data side.
- real data: starts all :00, ends :00/:30/:50 (bits-00-survey.mjs).

## Probe 4 (F-15) measured: node solver-audit/plan-probes/p4-cycles.mjs
- 144 files: 84 have a self-referencing קדם prereq (171 records). Multi-course cycles (SCC>1) after dropping self-loops: 0 (also 0 with them left in). 48 yearViews: 0 cycles. chainDepth under 864 random key orders: identical (0 diffs, stripped and raw).
- web/*.js has no assignment to .prereqs/.groups/.credits/.courses of a loaded dataset (grep) -> DOWN WeakMap staleness unreachable. Only yearView() builds a NEW object.

## Prototype (proto-lib.mjs buildProto, precision-ref.mjs, precision-p3-run.mjs)  node solver-audit/plan-probes/precision-p3-run.mjs <g2|g1|slot> 700
- diff vs web/solver-core.js: gap=g2 +29/-46 lines (net -17), includes F-18 (+2) and minute gap (+9)
- P3-1 off-grid synthetic 700: proto == minute reference, 0 mismatches (all 3 gap variants). Current search(): 271 / 341 / 207 mismatches of 700.
- P3-3 on-grid synthetic 700: 0 mismatches. P3-7 real data + off-grid blocks/windows 400: 0 mismatches.
- bound admissibility (instrumented, 3x400 instances, 44095 nodes each): 0 violations. Negative control (bound rounds outside to 30-min slots): 141/400 instances violated -> harness can fail.

## F-14 gap semantics (precision-p2-gap.mjs) and cost (precision-perf*.mjs)
- 13,839 random real-data plans: slot gap == g2 (real minutes, pause minus 10-min recess) in 99.91%; the 12 differing plans contain :00/:30 lesson ends (slot = g2 + 10). slot == g1 (audit oracle, recess counted) in only 7.2%: the audit's "64% under-measured" is the 10-min break being counted as a window. Existing tests encode g2 ('gaps: ... = 60 gap minutes' for 09:50->11:00; 'consecutive late slots: no gap').
- cost: leaf-heavy full enumeration (3 real instances, prune:false) current 46 ms | proto slot-gap 46 ms | proto g2-gap 279 ms (6x, per-leaf arrays+sort). Prune-friendly UI-like set: 79 / 79 / 123 ms.
- => keep the slot gap (bound unaffected either way: bound uses compact<=1).

## F-18 variants
- per-meeting check (any two lessons of the option) breaks test/solver-props.test.mjs ('pin C4ב1 missing', fixtures give one group 2 random overlapping meetings). per-group check (lecture vs linked tutorial/lab, as the audit says) breaks nothing there.
- sandbox copies of test/solver*.test.mjs run on the proto (precision-sandbox/): solver.test.mjs 63 tests -> 5 fail: 'forbidden mask removes options', 'hard time window edges', 'busy blocks...', 'soft time window ... 120 outside minutes' (0.8167 vs 0.8), 'lecturers never strand a course' (passes a mask as forbidden). solver-props passes.

## F-20
- already gated: scripts/build.mjs:98-101. A clamp `dur = Math.max(0, ...)` flips SB-4/SN-3/SN-4 but then SN-2 (prune:false == reference) would break unless search-lib reference clamps too (reference mins unclamped). precision-p20.mjs, precision-sb-clamp.mjs.
- unchanged slot reference (search-lib referenceSolve) vs proto: 240/700 (g2) or 118/700 (slot gap) instances differ on the C-1 generator -> C-1/C-2 reference must move to minute semantics (precision-ref.mjs) in the same commit.
