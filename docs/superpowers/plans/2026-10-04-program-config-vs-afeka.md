# Program config against Afeka's official curricula

Source of truth: the external check "בדיקת נתוני התוכניות" (claude.ai artifact T8PMUZHmkn6wL7HHUVrcZm, 3.10.2026), which compares every hand-filled value in
`scripts/programs.json` with Afeka's current curricula (תכנית לימודים תשפ״ז, page 2) and the yedion's per-cohort `minCredits`. Cohort Y started in year Y
(2027 = תשפ״ז). Specialization credits exclude the final project. Owner decision (3.10.2026): 61 and 65 are master's programs, take them out of the catalog.

Branch `program-config-afeka`. Every fix: failing test first, fix, browser check, commit. No requests to Afeka: data is rebuilt offline from `.yedion-cache`.

1. Official-values test (`test/programs-official.test.mjs`): per program x cohort the specialization credits the app uses equal 160 minus the
   non-specialization lists' minCredits (the check's table); 19 has a 120 total; 11/112 reach 120; 32 offers solid/flow/vehicle; IE picks one area;
   software's second area is "ממשקי משתמש וחוויית שימוש"; no 61/65 in config, catalog or data; every program verified.
2. `progressInfo`: credits of the degree that no list minimum or specialization covers (CS electives with minCredits 0) fill from surplus courses.
3. `programs.json`: drop the fixed `specCredits` (derived per cohort at load, like the L4 fallback), 19 total 120, 32 three areas, software rename,
   IE = one area (own seminar + own electives + the other areas' "משנית" lists), remove 61/65, `verified: true`. `discover.mjs` defaults follow.
4. `writeCatalog`: a full run drops programs no longer in the config.
5. Rebuild data offline (fetchedAt kept), delete 61/65 files.
6. UI hints: "not checked against the official curriculum" instead of "a student from the department" and "the 2020 document".
7. Docs: README sources + a link per program, ISSUES (source contradictions, not decided), LAUNCH-READINESS (L1 = check against the official document).
