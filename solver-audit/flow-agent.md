# Solver flow for an AI agent

Same content as `solver-audit/flow-agent.json` (generated from it by `node solver-audit/repro/meta-flow.mjs`; edit the JSON, not this file).
Load order for a new task: read **Structures**, then follow **Nodes** from `app.entry` (page load) or a user action (`ui.userChange`, `ui.moreClick`, `ui.go`).
Graph: 38 nodes, 45 edges. Finding ids (F-nn) point into `solver-audit/findings.md`.

## Structures

| Name | Shape (where defined) |
|---|---|
| `state` | app.state (web/app.js:9-17 DEFAULT, normalize web/app.js:45-80): {program,startYear,year,scope:'year'\|'א'\|'ב'\|'קיץ',passed[],failed{id:n},choices{id:'must'\|'optional'\|'no'},pins[groupId],friends[{name,groups[],weight 0..3,active}],profile{year,amirnet,specs[],summer},load:'א'\|'even'\|'ב',semesterOf{id:'א'\|'ב'},weights{friends,progress,freeDays,compact,timeWindow,examSpread in 0/1/3/5},constraints{dayOff[],dayOffHard,notBefore,notAfter,windowHard,maxCredits,maxDays,examsSameDay,includeFull,blocks[{day,start,end,label}],lecturers{name:'prefer'\|'avoid'}}} |
| `dataset` | semester file: {year,startYear,program,semester,examsPublished,fetchedAt,lists[{code,name,minCredits,courses[]}],specializations[],specRule,degree,courses{id:{name,credits,offered,prereqs[{kind:'קדם'\|'מקביל',anyOf[{id\|null,name}]}],groups[{id,type,primary,lecturer,full,semester,linked[ids],meetings[{day 1..6,start,end,room}],exams[{kind,moed,date,time}]}]}}} |
| `statuses` | classify() output: {statuses{id:{status:'done'\|'exempt'\|'notOffered'\|'retake'\|'blocked'\|'conditional'\|'available'\|'afterA',reasons[],blockedBy?[],missingParallel?[[ids]]}},warnings[]} |
| `semesterRequest` | {data,courses[{id,mode:'must'\|'optional'}],statuses,pins,constraints,weights,friends,timeLimitMs} (web/ui-search.js:40) |
| `yearRequest` | {year:{dataA,dataB,state,yearList:Set,pins,constraints,weights,friends,timeLimitMs}} (web/ui-search.js:38-39) |
| `option` | buildOptions element: {groups[ids],mask[7 ints, 30-min bits from 07:00],meetings[],exams[moed-1 dates],allExams[],minutes,sharedMin[per friend],sharesWith[per friend],alts{primary:[identical primaries]},course} |
| `item` | {id,mode,credits,options[]} sorted by options.length (web/solver-core.js:256-263) |
| `result` | {score,breakdown{friends,progress,freeDays,compact,timeWindow,examSpread},groups[],courses[],unlocks,explanation,alts{},exams[]} (web/solver-core.js:335-339) |
| `pair` | {score,a:result,b:result\|null,credits{a,b},missing[],warnings[]} (web/solver-core.js:493-497) |
| `reply` | {results[result\|pair],partial,diagnosis[]} stored as ui.last = {...reply, ms} (web/ui-search.js:35) |

## Nodes

### `app.entry`: Page loads the app module

- **fn**: `<script type=module>` at `web/index.html:77`
- **in**: -
- **out**: runs web/ui-plan.js (imports app.js which calls init)
- **reads**: -
- **writes**: -
- **next**: `app.init`

### `app.init`: Load catalog, saved state, data files

- **fn**: `init` at `web/app.js:287-312`
- **in**: catalog.json, localStorage
- **out**: app.catalog, app.state, app.sem
- **reads**: `localStorage afeka-sched-v1`
- **writes**: `app.catalog`, `app.state`, `app.status`, `app.loadFailed`
- **next**: `app.load`, `app.fetchSemesters`

### `app.load`: Restore saved state through normalize

- **fn**: `load / normalize` at `web/app.js:83-102`
- **in**: raw saved JSON
- **out**: state (only valid values)
- **reads**: `localStorage`
- **writes**: `app.state`, `app.noSave`, `app.hashError`
- **next**: `app.fetchSemesters`
- **notes**: normalize web/app.js:45-80; CONSTRAINT_OK web/app.js:33-41 admits maxCredits 0 and any HH:MM
- **findings**: F-07

### `app.fetchSemesters`: Fetch semester A, B and summer files

- **fn**: `fetchSemesters` at `web/app.js:229-238`
- **in**: state.year/program/startYear
- **out**: {א,ב,קיץ} datasets (B/summer may be null)
- **reads**: `web/data/afeka/<y>-<n>/<program>-<start>.json`
- **writes**: -
- **next**: `app.setSemesters`

### `app.setSemesters`: Keep datasets, pick the one to show

- **fn**: `setSemesters / pickData / yearView` at `web/app.js:239-244`
- **in**: sem
- **out**: app.data = yearView(A,B) | A | B | summer
- **reads**: `app.state.scope`
- **writes**: `app.sem`, `app.data`, `app.semNotice`
- **next**: `app.applyHash`
- **notes**: pickData web/app.js:152-155, yearView web/app.js:134-142 (merges groups; A's course record wins)

### `app.applyHash`: Apply friend/backup link, default passed courses

- **fn**: `applyHash / ensurePassed` at `web/app.js:333-351`
- **in**: location.hash
- **out**: state.passed defaulted to earlier years' mandatory lists
- **reads**: `location.hash`
- **writes**: `app.state.passed`, `app.friendLanding`
- **next**: `app.refresh`
- **notes**: ensurePassed web/app.js:166, earlierYears web/app.js:162-165

### `app.refresh`: Classify every course, save, render

- **fn**: `refresh` at `web/app.js:211-221`
- **in**: app.state, app.data
- **out**: app.cls
- **reads**: `app.state`, `app.data`, `app.sem`
- **writes**: `app.cls`, `localStorage`
- **next**: `rules.classify`, `ui.renderAll`
- **notes**: withAfterA(app.data, st, classify(app.data, st)) at web/app.js:217; summerOnly at :218

### `rules.classify`: Give each course a status

- **fn**: `classify` at `web/rules.js:61-126`
- **in**: dataset, state{passed,failed,profile.amirnet}
- **out**: statuses
- **reads**: `data.courses[].prereqs/offered`, `state.passed/failed`
- **writes**: -
- **next**: `rules.withAfterA`
- **findings**: F-03, F-19

### `rules.withAfterA`: Year view: mark courses open after A

- **fn**: `withAfterA` at `web/rules.js:130-144`
- **in**: data (semester 'שנה'), state, cls
- **out**: statuses with afterA
- **reads**: -
- **writes**: -
- **next**: `ui.renderAll`

### `ui.renderAll`: Draw the page, then start a search

- **fn**: `renderAll` at `web/ui-plan.js:53-61`
- **in**: app.*
- **out**: DOM
- **reads**: `app.cls`, `ui.last`
- **writes**: `DOM`
- **next**: `ui.renderView`, `ui.scheduleRun`
- **notes**: registered as the renderer at web/ui-plan.js:125

### `ui.userChange`: User changes a preference or course mode

- **fn**: `change dispatcher -> CHG[...]` at `web/ui-plan.js:69-78`
- **in**: DOM change event
- **out**: state mutation; 'quiet' -> save + scheduleRun, else refresh
- **reads**: -
- **writes**: `app.state.*`
- **next**: `ui.scheduleRun`, `app.refresh`
- **notes**: constraint handlers web/ui-actions.js:230-233; controls web/ui-drawer.js:38-50
- **findings**: F-07, F-17

### `ui.moreClick`: User asks to search longer

- **fn**: `ACT.more` at `web/ui-actions.js:64-70`
- **in**: click
- **out**: ui.moreMul *= 2
- **reads**: `ui.running`
- **writes**: `ui.moreMul`
- **next**: `ui.scheduleRun`

### `ui.scheduleRun`: Debounce a new search 300 ms

- **fn**: `scheduleRun` at `web/ui-search.js:8-16`
- **in**: again flag
- **out**: timer -> run
- **reads**: `gated()`
- **writes**: `ui.gen`, `ui.running`, `ui.timer`, `ui.moreMul`
- **next**: `ui.run`
- **findings**: F-02

### `ui.run`: Build the request from state

- **fn**: `run` at `web/ui-search.js:17-41`
- **in**: app.state, app.data, app.cls
- **out**: semesterRequest or yearRequest
- **reads**: `candidateMode (web/app.js:180)`, `yearCourses (web/app.js:174-179)`, `rules.modeFor (web/rules.js:180-185)`
- **writes**: `ui.worker`, `ui.runError`
- **next**: `ui.worker`
- **notes**: budget ms at web/ui-search.js:21; pins filtered for semester (:37) but not for year (:38)

### `ui.worker`: Worker runs the solver off the main thread

- **fn**: `self.onmessage` at `web/solver-worker.js:3`
- **in**: request
- **out**: reply via postMessage
- **reads**: -
- **writes**: -
- **next**: `core.search`, `core.searchYear`

### `core.searchYear`: Plan the year: A plans x best B plan

- **fn**: `searchYear` at `web/solver-core.js:382-501`
- **in**: yearRequest.year
- **out**: reply with pairs
- **reads**: `dataA`, `dataB`, `state`
- **writes**: -
- **next**: `core.yearClassifyA`
- **findings**: F-11, F-12

### `core.yearClassifyA`: Classify A, choose A candidates and musts

- **fn**: `searchYear (part)` at `web/solver-core.js:389-401`
- **in**: dataA, state, yearList
- **out**: coursesA, bias, must
- **reads**: `state.choices/semesterOf/load`, `pins`
- **writes**: -
- **next**: `core.yearMax`

### `core.yearMax`: Year progress denominator over both semesters

- **fn**: `searchYear (part)` at `web/solver-core.js:402-417`
- **in**: coursesA, dataB
- **out**: stY, yearMax, must (B part)
- **reads**: -
- **writes**: -
- **next**: `core.yearSearchA`

### `core.yearSearchA`: Find top 50 semester-A plans

- **fn**: `search (A)` at `web/solver-core.js:419-420`
- **in**: coursesA, topK 50, 60% of budget
- **out**: ra
- **reads**: -
- **writes**: -
- **next**: `core.search`, `core.yearSeeds`

### `core.yearSeeds`: Add A plans that open B musts

- **fn**: `searchYear (part)` at `web/solver-core.js:428-441`
- **in**: must, ra
- **out**: aList (+ empty A plan if nothing is must in A)
- **reads**: -
- **writes**: -
- **next**: `core.yearPairLoop`
- **findings**: F-12

### `core.yearPairLoop`: For each A plan: best B plan

- **fn**: `searchYear (loop)` at `web/solver-core.js:442-454`
- **in**: a
- **out**: rb (topK 1)
- **reads**: `classify(dataB, passed + a.courses)`
- **writes**: -
- **next**: `core.search`, `core.yearRelax`, `core.yearPairScore`

### `core.yearRelax`: No B plan: relax one must at a time

- **fn**: `searchYear (relax)` at `web/solver-core.js:455-479`
- **in**: coursesB musts, pins
- **out**: rb with fewer musts
- **reads**: -
- **writes**: -
- **next**: `core.yearPairScore`
- **findings**: F-12

### `core.yearPairScore`: Score the pair, list missing musts

- **fn**: `searchYear (pair)` at `web/solver-core.js:480-498`
- **in**: a, b
- **out**: pair
- **reads**: `SHARE/LOAD_W/MISSING_W web/solver-core.js:375-379`
- **writes**: -
- **next**: `core.yearSort`

### `core.yearSort`: Rank pairs, keep top 10

- **fn**: `searchYear (end)` at `web/solver-core.js:499-501`
- **in**: pairs
- **out**: reply
- **reads**: -
- **writes**: -
- **next**: `ui.onmessage`

### `core.search`: Search one semester (branch and bound)

- **fn**: `search` at `web/solver-core.js:248-373`
- **in**: semesterRequest
- **out**: reply
- **reads**: -
- **writes**: -
- **next**: `core.forbidden`

### `core.forbidden`: Hard time limits to a week mask

- **fn**: `forbiddenMask / meetingsMask / lateMask` at `web/solver-core.js:33-44`
- **in**: constraints.blocks/dayOff/notBefore/notAfter + hard flags
- **out**: forbidden[7]
- **reads**: -
- **writes**: -
- **next**: `core.value`
- **notes**: grid web/solver-core.js:4-31 (30-min slots from 07:00)
- **findings**: F-04, F-05, F-06

### `core.value`: Course value: credits + unlocks + chain depth

- **fn**: `downstream / chainDepth / courseValue` at `web/solver-core.js:113-161`
- **in**: dataset
- **out**: value{id}
- **reads**: `prereqs (קדם only)`
- **writes**: `DOWN WeakMap cache`
- **next**: `core.items`
- **findings**: F-03, F-15

### `core.items`: Build each course's registration options

- **fn**: `buildOptions / byLecturer` at `web/solver-core.js:256-263`
- **in**: courses, pins, includeFull, forbidden, friends, lecturers
- **out**: items sorted by option count
- **reads**: `groups`
- **writes**: -
- **next**: `core.prefMask`
- **notes**: buildOptions web/solver-core.js:54-102, byLecturer :49-53
- **findings**: F-01, F-08, F-09, F-10

### `core.prefMask`: Soft time wishes to a week mask

- **fn**: `search (part)` at `web/solver-core.js:265-273`
- **in**: dayOff, notBefore, notAfter
- **out**: prefMask[7]
- **reads**: -
- **writes**: -
- **next**: `core.boundSetup`
- **findings**: F-05, F-13

### `core.boundSetup`: Prepare optimistic bounds for pruning

- **fn**: `search (part) / bound` at `web/solver-core.js:281-322`
- **in**: items, weights, friends
- **out**: canPrune, restValue, restShared, bound()
- **reads**: -
- **writes**: -
- **next**: `core.dfs`
- **findings**: F-20

### `core.dfs`: Try every option of every course

- **fn**: `dfs` at `web/solver-core.js:344-360`
- **in**: i, mask, credits, examDates, val
- **out**: calls leaf
- **reads**: `constraints.maxCredits/maxDays/examsSameDay`, `deadline`
- **writes**: `sel`, `nodes`, `partial`
- **next**: `core.leaf`
- **findings**: F-07

### `core.leaf`: Check corequisites, score, keep top K

- **fn**: `leaf / metrics / explain` at `web/solver-core.js:327-342`
- **in**: sel, mask
- **out**: top[] (result)
- **reads**: `conditional (missingParallel)`, `down`
- **writes**: `top`
- **next**: `core.diagnose`
- **notes**: metrics web/solver-core.js:171-220, explain :222-229
- **findings**: F-13, F-14

### `core.diagnose`: No plan: explain why

- **fn**: `maxDays re-search / diagnose` at `web/solver-core.js:363-373`
- **in**: items
- **out**: diagnosis[]
- **reads**: -
- **writes**: -
- **next**: `ui.onmessage`
- **notes**: diagnose web/solver-core.js:232-245
- **findings**: F-16

### `ui.onmessage`: Store the answer, redraw

- **fn**: `worker.onmessage` at `web/ui-search.js:35-36`
- **in**: reply
- **out**: ui.last, ui.cur=0
- **reads**: -
- **writes**: `ui.last`, `ui.cur`, `ui.running`
- **next**: `ui.renderView`
- **findings**: F-02

### `ui.renderView`: Draw the chosen alternative

- **fn**: `renderView` at `web/ui-view.js:52-143`
- **in**: ui.last, ui.cur, ui.sem
- **out**: #week, #daysel, side list
- **reads**: `current/shown/shownData (web/ui-common.js:33-35)`, `semResult (web/ui-grid.js:120-124)`, `pair.missing/warnings (web/ui-view.js:73-77)`, `partial/diagnosis (web/ui-view.js:85-101)`
- **writes**: `DOM`
- **next**: `ui.renderWeek`, `ui.renderSide`
- **findings**: F-13

### `ui.renderWeek`: Draw the week grid

- **fn**: `renderWeek` at `web/ui-grid.js:187-207`
- **in**: data, res, colors, pins, friends
- **out**: HTML
- **reads**: `res.groups`
- **writes**: -
- **next**: (end: shown to the user)

### `ui.renderSide`: Draw the course list with statuses

- **fn**: `renderSide` at `web/ui-side.js:58-88`
- **in**: raw result
- **out**: HTML
- **reads**: `app.cls.statuses`, `unlockCounts (web/solver-core.js:134-137)`
- **writes**: `DOM`
- **next**: (end: shown to the user)
- **findings**: F-03

### `ui.go`: User browses alternatives

- **fn**: `go` at `web/ui-view.js:155-160`
- **in**: +1/-1
- **out**: ui.cur
- **reads**: `ui.last.results.length`
- **writes**: `ui.cur`
- **next**: `ui.renderView`

## Edges

| from | to |
|---|---|
| `app.entry` | `app.init` |
| `app.init` | `app.load` |
| `app.init` | `app.fetchSemesters` |
| `app.load` | `app.fetchSemesters` |
| `app.fetchSemesters` | `app.setSemesters` |
| `app.setSemesters` | `app.applyHash` |
| `app.applyHash` | `app.refresh` |
| `app.refresh` | `rules.classify` |
| `app.refresh` | `ui.renderAll` |
| `rules.classify` | `rules.withAfterA` |
| `rules.withAfterA` | `ui.renderAll` |
| `ui.renderAll` | `ui.renderView` |
| `ui.renderAll` | `ui.scheduleRun` |
| `ui.userChange` | `ui.scheduleRun` |
| `ui.userChange` | `app.refresh` |
| `ui.moreClick` | `ui.scheduleRun` |
| `ui.scheduleRun` | `ui.run` |
| `ui.run` | `ui.worker` |
| `ui.worker` | `core.search` |
| `ui.worker` | `core.searchYear` |
| `core.searchYear` | `core.yearClassifyA` |
| `core.yearClassifyA` | `core.yearMax` |
| `core.yearMax` | `core.yearSearchA` |
| `core.yearSearchA` | `core.search` |
| `core.yearSearchA` | `core.yearSeeds` |
| `core.yearSeeds` | `core.yearPairLoop` |
| `core.yearPairLoop` | `core.search` |
| `core.yearPairLoop` | `core.yearRelax` |
| `core.yearPairLoop` | `core.yearPairScore` |
| `core.yearRelax` | `core.yearPairScore` |
| `core.yearPairScore` | `core.yearSort` |
| `core.yearSort` | `ui.onmessage` |
| `core.search` | `core.forbidden` |
| `core.forbidden` | `core.value` |
| `core.value` | `core.items` |
| `core.items` | `core.prefMask` |
| `core.prefMask` | `core.boundSetup` |
| `core.boundSetup` | `core.dfs` |
| `core.dfs` | `core.leaf` |
| `core.leaf` | `core.diagnose` |
| `core.diagnose` | `ui.onmessage` |
| `ui.onmessage` | `ui.renderView` |
| `ui.renderView` | `ui.renderWeek` |
| `ui.renderView` | `ui.renderSide` |
| `ui.go` | `ui.renderView` |
