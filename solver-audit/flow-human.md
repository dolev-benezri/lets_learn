# How a schedule is made: from your choices to the week on screen

Five small diagrams, read top to bottom. Each box is one step. The file and line under each diagram tell you where it happens in the code, if you want to look.
Boxes with a red border have a known problem (see `findings.md`, ids in brackets).

## 1. The big picture

```mermaid
flowchart TD
  A["You open the site"] --> B["The site loads the course data<br/>for your program and cohort"]
  B --> C["The site loads what you saved before:<br/>passed courses, preferences, friends"]
  C --> D["Each course gets a status:<br/>done, can take, blocked, not taught..."]
  D --> E["Each course gets a mode:<br/>must, maybe, or no"]
  E --> F["A background worker searches<br/>for the best weekly schedules"]
  F --> G["The 10 best schedules come back"]
  G --> H["The first one is drawn on the week grid"]
  H --> I["You browse the other schedules<br/>or change something"]
  I -->|"a change"| D
  classDef bad stroke:#d33,stroke-width:3px;
  class D,F bad;
```

Where: page start `web/app.js:287-312`, statuses `web/rules.js:61-126`, modes `web/app.js:180`, worker `web/ui-search.js:33`, drawing `web/ui-view.js:52-143`.
Known problems: some mandatory courses are blocked forever by bad data [F-03]; the search can show an old answer after a change [F-02].

## 2. What starts a new search

```mermaid
flowchart TD
  A["You change a preference,<br/>a course mode, a pin or a friend"] --> B["The site saves your choice"]
  B --> C["It waits 0.3 seconds<br/>in case you change more"]
  C --> D["It stops the previous search"]
  D --> E["It packs your data and preferences<br/>into one request"]
  E --> F["It sends the request to the worker"]
  F --> G["The answer arrives and is drawn"]
  M["You press 'search more'"] --> N["The time limit doubles,<br/>up to 12 seconds"]
  N --> C
  classDef bad stroke:#d33,stroke-width:3px;
  class D,G bad;
```

Where: change handler `web/ui-plan.js:69-78`, wait `web/ui-search.js:8-16`, request `web/ui-search.js:17-41`, 'search more' `web/ui-actions.js:64-70`.
Known problem [F-02]: during the 0.3-second wait the old search is still running; if it answers then, its out-of-date schedule is drawn, and after a program switch the page breaks until the next answer.

## 3. Searching one semester

```mermaid
flowchart TD
  A["Start with your must and maybe courses"] --> B["For each course, list every way to register:<br/>a lecture plus its linked tutorial or lab"]
  B --> C["Remove full groups, busy hours<br/>and avoided lecturers"]
  C --> D["Try the courses with fewest choices first"]
  D --> E["Add one registration at a time;<br/>skip it if it clashes in time"]
  E --> F["Skip it if it breaks a limit:<br/>credits, campus days, two exams on one day"]
  F --> G["Stop early on a branch that<br/>cannot beat the current 10 best"]
  G --> H["A complete schedule: check courses<br/>that must be taken together"]
  H --> I["Score it by your priorities"]
  I --> J["Keep the 10 best"]
  J --> K{"Found any?"}
  K -->|"yes"| L["Send them back"]
  K -->|"no"| M["Explain why nothing fits"]
  classDef bad stroke:#d33,stroke-width:3px;
  class B,C,E,F,I,M bad;
```

Where: `search` `web/solver-core.js:248-373`; registrations `buildOptions` `:54-102`; time check on a 30-minute grid `:4-44`; limits `:350-356`; early stop `:281-322`, `:348`; score `metrics` `:171-220`; explanation `diagnose` `:232-245`.
What was proven right: for the same input, this search returns exactly the same 10 schedules as trying every combination (1,200 test cases, 500 of them on real data).
Known problems: a course whose only lab is full gets no registration at all [F-01]; times are rounded to half hours, so busy blocks and 'not after' times that are not on :00 or :30 give wrong clashes [F-04, F-05]; a credit limit of 0 means 'no limit' [F-07]; 'prefer this lecturer' can remove every schedule [F-08]; Friday is never counted as a free day [F-13]; the 'why nothing fits' text can name the wrong cause [F-16].

## 4. Planning a whole year (semester A + semester B)

```mermaid
flowchart TD
  A["Decide for each course:<br/>A only, B only, or either"] --> B["Find the 50 best plans for semester A"]
  B --> C["Add A plans that open a must course in B"]
  C --> D["For each A plan: pretend its courses are passed"]
  D --> E["Find the single best B plan for it"]
  E --> F{"B plan found?"}
  F -->|"no"| G["Drop must courses one at a time<br/>until a B plan exists"]
  F -->|"yes"| H["Score the pair: both semesters,<br/>balance of credits, missing musts"]
  G --> H
  H --> I["Keep the 10 best pairs"]
  classDef bad stroke:#d33,stroke-width:3px;
  class B,C,E,G bad;
```

Where: `searchYear` `web/solver-core.js:382-501`.
What was proven right: every returned pair is valid (no clash, prerequisites in order, credits and missing courses correct) and its score matches the formula, on 300 synthetic and 130 real-data pairs.
Known problems [F-11, F-12]: the B plan is picked by the B score alone, so a better year can be missed (175 of 1,752 cases); the 50-plan cut and the 'open a must course' step can each lose the plan that takes a must course.

## 5. Showing the result

```mermaid
flowchart TD
  A["The answer is stored"] --> B["Schedule number 1 is selected"]
  B --> C{"A year plan?"}
  C -->|"yes"| D["Show semester A or B,<br/>whichever tab is open"]
  C -->|"no"| E["Show the one semester"]
  D --> F["Draw lessons on the week grid"]
  E --> F
  F --> G["Show summary: credits, free days,<br/>gaps, missing courses, warnings"]
  G --> H["Show the course list with statuses"]
  H --> I["Next/previous moves between the 10 schedules"]
  classDef bad stroke:#d33,stroke-width:3px;
  class G bad;
```

Where: store `web/ui-search.js:35`, select `web/ui-common.js:33-35`, split a year pair `web/ui-grid.js:120-124`, grid `web/ui-grid.js:187-207`, page `web/ui-view.js:52-143`, list `web/ui-side.js:58-88`, next/previous `web/ui-view.js:155-160`.
Known problem [F-13]: a week with Sunday to Thursday busy and Friday free says 'no free day'.
