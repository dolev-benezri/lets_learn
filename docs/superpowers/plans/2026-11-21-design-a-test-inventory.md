# Design A: browser-test inventory (Task 0)

Which assertions in `test/browser/*.spec.mjs` are bound to the **old presentation** (the step bar, the header actions, the footer, the drawer as the home of the registration list and the advisor summary, the ☰ mode links, DOM order) rather than to a behaviour both designs share. Taken from the specs at `cfd184a`. Plan: `2026-11-21-design-a-adoption.md`, Task 0.

Decisions: **shared** = the assertion holds in both designs (parameterize through `openStep`, `openFriends`, ids and hashes); **classic only** = runs only while classic exists (`process.env.DESIGN !== 'a'`; an explicit `DESIGN=classic` still runs it) and is deleted in Task 12; **A variant** = a new assertion for A written in the task named, next to the classic one.

## Step bar and navigation

| Where | What it asserts | Decision |
|---|---|---|
| `flows.spec.mjs:119` | click `nav.steps a[data-view="plan"]` to reach the plans | shared: `openStep(page, 'plan')` |
| `flows.spec.mjs:356, 358` | click the `prefs` and `plan` step links around a scope change | shared: `openStep` |
| `flows.spec.mjs:501` | click the `me` step link | shared: `openStep` |
| `flows.spec.mjs:509-510` | `.steps a.done` count is 0 and `a[data-view="plan"][aria-current="step"]` is 1 | classic only; A variant (Task 2): the dock has no `aria-pressed="true"` button when no tool is open |
| `tour.spec.mjs:204` | click the plans step link | shared: `openStep` |
| `tour.spec.mjs` (`TOUR_INTRO` stops on `nav.steps`, `.steps a[data-view]`, `.actions`, `#tourBtn`) | the intro tour stops and their count | classic only; A variant: Task 6 |
| `edit-shell.spec.mjs:43` | no step bar on the edit page | classic only; A variant (Task 7): the improve tab is selected and there is no dock |

## Header actions, footer, menu

| Where | What it asserts | Decision |
|---|---|---|
| `edit-shell.spec.mjs` (`.actions`, 1 use) | the header action row is hidden on the edit page | classic only; Task 12 deletes the row |
| `edit-shell.spec.mjs:73-77` | the ☰ menu (`#drawer a`) lists exactly "בניית מערכת" and "עריכת מערכת קיימת" | classic only; A variant (Task 5): ☰ has info, map, tour, theme, erase and no mode links |
| `edit-shell.spec.mjs`, `edit-changes.spec.mjs` (`data-act="menu"` mode label, 7 uses) | the edit page's "עורכים מערכת קיימת · החלפה" label opens the ☰ | classic only; the tabs replace it (Task 7) |
| `edit-focus.spec.mjs:130` (and one more use) | focus moves to `.site-foot a[href="legal.html#terms"]` during a search | classic only; A variant (Task 5): the "מידע" panel's terms link |

## Drawer content

| Where | What it asserts | Decision |
|---|---|---|
| `flows.spec.mjs:158-162` and the registration tests after it (`#drawer[open]`, 3 uses in the file: lines 161, 180, 277) | the registration list is inside `#drawer` | classic only; A variant (Task 5): inside the `#out` tool |
| `flows.spec.mjs:180` and the advisor tests (`#drawer[open] .advisor-sum`) | the advisor summary is inside `#drawer` | classic only; A variant (Task 5) |
| `a11y.spec.mjs` (`#drawer`, 4; `data-panel`, 4) | axe on the open drawer panels | classic only; A variant: `a11y-a.spec.mjs` (Tasks 3 and 5) |
| `edit-changes.spec.mjs:164-174` | starts on the **build** page, opens the registration panel in `#drawer`, then ☰, asserts exactly the two mode links, then reopens registration | classic only; A variant (Task 5): registration in `#out`, ☰ without mode links |

## Pages reached by hash

| Where | What it asserts | Decision |
|---|---|---|
| `flows.spec.mjs:167-169`, `pdf.spec.mjs` friend-editor helper | `#prefs` then `#openFriendEditor`: the friend editor is reachable from the preferences page | shared through `openFriends(page)` (classic: `#prefs`; A: `#friends`) |
| `a11y.spec.mjs` (`#me`, `#prefs`, and `#courses` with `#side` as its content selector) | axe on each step page by hash | classic only; A variant: `a11y-a.spec.mjs` runs the same screens as panels |
| `flows.spec.mjs` (`#me`, 11 uses), `pdf.spec.mjs` (`#me`, 8), `edit-persist.spec.mjs` (`#me`, 4), `tour.spec.mjs` (3) | the record page by hash: grade import, passed courses, warnings | shared: `#me` opens the record in both designs |
| `edit-split.spec.mjs` (`#prefs`, 1), `flows.spec.mjs` (`#prefs`, 7 uses after `noaLink` moved) | the preferences page by hash: the split option, scope, wishes | shared: `#prefs` opens the wishes tool |
| `flows.spec.mjs:456` (`noaLink`) | `#friendUrl` and `addFriend` after opening the preferences page | shared through `friendsHash()` (changed in Task 0) |

## DOM order and layout

| Where | What it asserts | Decision |
|---|---|---|
| `edit.spec.mjs:269` | proposal switcher, panel and week are in a given DOM order, different on a phone and on a desktop | classic only until Task 8 restructures the edit page; A variant: Task 8 (`edit-a.spec.mjs`) |

## First-entry mode cards

| Where | What it asserts | Decision |
|---|---|---|
| `edit-shell.spec.mjs:33-53` | a fresh visitor sees both mode cards (exact text), edit lands on `#edit` with the label | classic only; A variant (Task 6): the tabs are the choice, no cards |
| `edit-shell.spec.mjs:107-119` | the mode choice and the edit page at 320px; the ☰ button is 44px in the same place; the second card opens the edit page | classic only; A variant (Task 7): tabs at 320px and the ☰ target |
| `edit-shell.spec.mjs` (`pickMode`, other tests) | choosing "build" goes on to the track question | classic only; A variant (Task 6) |

## Not bound to presentation (no change)

Everything else uses ids, `data-k`, `data-act`, `data-chg`, `data-ed` and the hash routes, which A keeps: the alternatives and week assertions (`#week .blk`, `#altLabel`), the popover, the map dialog, the friend editor's inner controls, the edit page's inner `data-ed` controls, the solver and import flows.

## Open

The size of this inventory (about 16 groups, 60-odd assertions) is smaller than the "about 100 edit cases" the plan feared, because the edit specs are bound mostly to ids under `#edit`. Task 7 reruns all eight edit specs under `DESIGN=a` and adds rows here for anything the frame moves.
