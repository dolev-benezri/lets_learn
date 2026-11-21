# Brief: two new designs for the Afeka course scheduler, from zero

You are the designer of this product. The owner (a mechanical engineering student, not a programmer, reads Hebrew, often on an iPhone) wants two complete design concepts made from zero. A previous attempt only recolored the existing site, and the owner rejected it: "same design in different colors". This time the layout, navigation and structure must be new.

## Rule 1: you must not see the existing site

You design from this brief only. Do not open, read, list, grep, screenshot or browse any of these:
- `web/**` (the live site's code), `docs/**`, `README.md`, `CONTRIBUTING.md`, `test/**`, `scripts/**`, `ci/**`, `.superpowers/**`, `.claude/**` (except `.claude/launch.json`, to add your server).
- Git history or other branches (`git log -p`, `git show`, `git diff` against main, other branches' files). Plain `git status`, `git add`, `git commit` on your own branch are fine.
- The live site (`dolev-benezri.github.io/lets_learn`), any local server serving `web/`, any port other than your own.
If you open something by mistake, say so in your report. Everything you need is in this brief.

## The product in one paragraph

An unofficial, free, static web tool (no account, no server, nothing loaded from other sites) for students of Afeka College of Engineering in Israel. A student says what they study and what they already passed; the tool knows every course, group (section), lecturer, meeting time, exam date and the degree rules, and it builds ready-made weekly timetables with no clashes, ranked by what the student cares about. It also helps a student who already has a timetable change part of it. Registration itself happens in the college's portal ("אפקה-נט"); the tool only plans, and must say so. All UI text is Hebrew, right-to-left.

## The two jobs

1. **Build a new timetable** for a semester or a whole year.
2. **Improve a timetable I already have**: load it, keep what works, move, add or remove one or more courses to reach a goal (free a day, finish earlier, fewer gaps).

Both share the student's profile and record. How the two jobs live together (one flow, two modes, a hub, something else) is your decision.

## What the student must be able to do (every item must exist in both concepts)

Nothing below says where a thing goes or how it looks. That is yours.

### First visit and identity
- Accept the terms of use before anything else: the alternatives are possibilities, not recommendations; see an academic advisor before registering; what the tool checks and what it does not; uploading or sharing another person's timetable needs their consent; anyone holding a shared link can read it. Link to the full terms.
- Both jobs are easy to find and to switch between. A friend's link or a backup link is honored without first asking which job; the entry flow is yours to decide.
- Say their program (7 programs, some with day and evening tracks: הנדסה מכנית, הנדסת חשמל, הנדסת תוכנה, מדעי המחשב, מדעי הנתונים, הנדסת תעשייה וניהול, הנדסה רפואית; nothing preselected) and their study year (א׳–ה׳, only the years the program has), which gives the cohort (start year 2024–2027). Changeable later; a failed change keeps the old choice and offers retry.
- An optional short guided tour, replayable.
- Light and dark theme, switchable, following the device by default.

### My record ("המצב שלי")
- Profile: program, track, year, start year. When registration turns are published: my turn, or "unknown"; warn when my turn has opened but the seat data is older than that.
- Mark what was passed:
  - Import the official grade sheet (PDF from the student portal, up to 5 MB and 10 pages, read only in the browser, never stored or sent). Show the changes it would make and let the student pick which to accept. States: reading, unreadable or timed out, no courses recognized, already up to date, rows skipped, profile changed during the import. The import also recognizes exemptions (פטור).
  - Or by hand, by year (with a "passed the whole year" shortcut): per course not taken / passed / failed, a grade 0–100, an earlier failure even after passing, failure count 1–3.
  - Earlier years' required courses start as passed unless marked failed; the student can correct that. A failed course defaults to "must retake" when offered again, with the reason, and can be changed.
  - Mark a prerequisite done outside this program where relevant. Warn when a passed course lacks its recorded prerequisite or parallel course (an approved exception may explain it).
- English level from an exam score (אמירנט/פסיכומטרי) can exempt English courses.
- Progress: credits done against the requirements of previous years (the 70% threshold where it applies), the weighted average, the remaining degree requirements per group (required per year, electives, specialization), and required credits missing from the catalog.
- Choosing a specialization (התמחות) in year ג׳ under the department's rule.
- Warnings by the college regulations: average or failures that risk conditional studies or dismissal, completion below 70% of previous years' requirements.

### Choosing courses
- The courses open to the student this semester, each set to חובה (must), אולי (maybe) or לא (no).
- Per course: credits, how many later courses it unlocks, its semester: automatic, or a specific offered semester (א, ב, or קיץ when planning summer).
- Each course's eligibility explained: blocked by a missing prerequisite (and which), possible only together with a parallel course, possible in ב after a prerequisite taken in א, or not offered this semester.
- A credit cap per semester; a "what if one more credit?" probe that shows what a higher cap would add, and applies it on request.
- A whole-year plan: a pair of timetables for א and ב, where a course in א unlocks its follow-up in ב; load split: more in א, balanced, or more in ב. Opt-in summer (קיץ) as a third semester: it is planned on top of the chosen year plan (or on the record alone when there is none), counts in the progress, and courses pinned in summer leave the other plans.

### What matters to me (preferences)
- Soft wishes, each with 4 levels of importance: friends, degree progress, free days, no gaps, comfortable hours, spread-out exams.
- Days off and an hours window, each either a wish or a strict rule; a strict maximum number of campus days; prefer or avoid a lecturer (by name, across courses, matched against each course's main group). If no plan fits the preferred lecturers, the tool searches again without them and says so.
- Busy times (work, etc.) that no lesson may cover: up to 12, each a day, start, end and an optional label; add, edit, remove.
- Exams: never two first-sitting (מועד א׳) exams at the same date and hour; optionally not two on the same day. Only known dates are checked.
- Include full groups or not.
- Opt-in, after acknowledging a warning: alternatives that split a lecture from a tutorial the college does not link (teaching pace may differ; needs advising approval). They come after the regular alternatives and name the affected courses. Turning it off removes pins that only it allowed, and says so.
- Reset preferences after a confirmation (the record, course choices, friends and busy times stay). When the default weights changed in an update, explain it and offer the previous weights back.
- Every change is saved at once; there is no save button.

### Friends
- Add a friend's timetable: open a link the friend sent, paste text, upload the portal's `.xlsx` export, a PDF (for scanned PDFs pick the pages to read, up to 12), or a photo/screenshot (read in the browser by OCR, with progress), or pick their courses and groups by hand (search by name or number, check overlaps before saving).
- Review what was read before accepting: unreadable input, unknown groups, duplicates, ambiguous matches, matches by day and time only.
- Per friend: name, importance, show or hide on the timetable, remove; hand-entered friends can be edited. A duplicate name offers replace or add. Up to 20 friends, 40 groups each.
- A friend's link lets the student see whose timetable it is and confirm or decline adding it; it is never added automatically.
- Shared lessons are marked on the timetable with the friend's name; ranking can prefer more shared lessons.

### The timetables (results)
- Built automatically: up to 10 ranked regular alternatives per semester (a year plan's alternative is a pair of semesters). The student can look at any of them. When the time limit cut the search, say better ones may exist and offer a longer search, up to a limit. "Not all was checked" is different from "no solution".
- Order by: balanced (by my wishes), most credits, most with friends, unlocks most follow-up courses. In a year plan, fewer missing required courses always come first.
- A summary per alternative: credits, campus days, gap hours, shared lessons, exams.
- From the second alternative on: what differs from the first.
- What was left out of this alternative (which course, how many credits) and why when known.
- The weekly timetable: the student sees every scheduled day and the real meeting times, can tell courses and busy times apart, on a phone and on a computer. Days are ראשון–שישי.
- Lesson details: course name, type (הרצאה/תרגול/מעבדה), group number, lecturer, room, day and hours, seats left with the time that number was read (it may be stale; show "last checked" vs "last changed", and stale, failed-check or unknown states), full-group warning, exam dates, friends in it, other groups of the same course, a link to the course in the official catalog, prefer/avoid this lecturer, pin/unpin.
- Pins: a pinned group stays in every alternative; a list of pins with clear-all. A pinned group that disappeared from the data is named and can be removed. In a year plan, a ב pin that cannot be kept is released and the tool says so.
- Semester switch (א / ב / קיץ) in a year plan; if ב data fails to load, say the plan fell back to one semester.
- Exams: unpublished or unknown exam data, the source note when there is one, warnings for exams on adjacent days and same-day exams of unknown length.
- Computing state (it can take a few seconds), no-result state with the solver's reason, and an error state.
- A note that this is a plan only and registration happens in אפקה-נט.

### Taking it out
- Registration list: each course with all its group numbers (lecture, tutorial, lab), equivalent groups at the same hours, backup groups that fit the rest of the timetable in case a group fills, when availability was read, split-course approval warnings, the exam list, a link to the course in the catalog; copy button.
- Export to calendar (`.ics`), skipping holidays, with exam events ("estimated end time, exam length not published"); unavailable, with the reason, when that semester's calendar is missing.
- Advisor summary (סיכום ליועץ): profile, average, passed and failed courses, missing earlier required courses, the chosen timetable, warnings. Preview, copy as text, print where possible, share or download as PDF where the browser allows (it may be several pages); show preparing, failure and missing-character messages, with copy as text always there.
- Share: a link that carries the chosen timetable to a friend, with the name I choose; it holds the name and groups, no grades. Copy, or share through the phone's share sheet / WhatsApp. Nothing to share yet: say so.
- Backup link: carries the saved planning data, and the improved timetable when it fits (warn when it was left out because the link would be too long). Restoring asks before replacing current data; a broken, old or incompatible link is explained without touching the current data; a restore never turns the split option on by itself.
- Whenever copying fails, show the text to copy by hand.
- Progress map: degree courses with their requirements (prerequisites, alternatives, parallel courses, what each unlocks); done, eligible, planned and open states; filter all / remaining / my year; degree credits and what the chosen plan adds; zoom, drag, fit to screen, switch alternatives without losing the zoom; optional course initials; a look at the chosen week; an accessible list view, also used when the map cannot load.
- Erase all my data, after a confirmation that says only a backup made earlier can bring it back.

### Improving an existing timetable
- Load it from the portal's Excel export (`.xlsx`; its file properties hold the student's ID number and must never be read), from a PDF or screenshot of the college planner, or by picking courses and groups by hand.
- Every row the reader was not sure of goes to review ("לבדיקה"); continue only when each is confirmed or fixed. A row whose group no longer exists in the data is kept as a fixed lesson with the file's hours, with no error mark.
- The student says whether this timetable is already registered at the college; if so, a full group may stay only where the student already is.
- Semester from the file, else asked; one semester at a time.
- Each recognized course is "stays" or "can move" (its lecture, tutorial and lab move together). Per course: other group combinations found for it, checked against the rest of the timetable (found by a time-limited search, not a promise of every option); remove it. Add a course from the open ones. Removing a course that another one needs in parallel asks whether to remove both.
- Pending changes (movable courses, chosen groups, added, removed) are listed, each undoable on its own.
- Goals: free a day (which), fewer gaps, finish by an hour.
- Problems before searching: overlapping fixed courses (say which must become movable), missing prerequisites.
- Proposals: the current timetable is the reference. Ranking: regular proposals first, then fewer changed courses, then the wish score. Each proposal explains what it gains and costs ("יום ג׳ התפנה · קורס אחד זז · אותו מרצה"), names the changed, added and removed courses, compares old and new day, hours, group and lecturer, and lets the student find where a moved lesson was and where it went.
- No proposal: show the diagnosis. When the follow-up search finds a course whose moving would make it possible, name it ("אם תורת החומרים יזוז, יש פתרון") and offer to let it move. A timeout says "not all was checked", not "no solution".
- The split option applies here too: split proposals are marked; turning it off takes back chosen groups that need it, naming the courses.
- Save a proposal (it becomes the current timetable), copy the changes (to add / to remove, with group numbers), back to the original in one action. Never the words "apply" or "register".
- Registered: "seats checked before X".
- A shown proposal is dropped when the record or the data changed; ask for a new search. A saved timetable that belongs to other data (another year, program or cohort) stays viewable and restorable, and asks to be loaded again before editing.

### Information and states across the whole product
- Data freshness ("updated …") and the unofficial notice: not connected to the college, data from the public catalog may be wrong, registration in אפקה-נט decides.
- Department approval and its date when there is one; otherwise "data not verified / rules not approved". Known disagreements between official sources, with advice to check with the department.
- Loading the data, a failed load with retry, a program or cohort that is not available (and any substitute cohort used).
- Access to: terms, privacy, accessibility statement, removal request, report a mistake (email), academic advising link.
- Notices the owner publishes remotely (e.g. "data for semester ב is late").
- Storage failure: "changes are not saved" with the backup link; another tab changed the data: "reload".

## Sample data (real courses, mechanical engineering, year ב׳, semester א; lecturer names replaced)

Format: course id | name | credits | prerequisites; then groups: id, type, meetings (day 1 = ראשון), lecturer, full, linked tutorial/lab, exam date (מועד א׳). A "+תרגול" group comes with its linked tutorial group (`/1`).

```
20816 | מבוא להנדסת חשמל ואלקטרוניקה | 3 נ"ז | קדם: פיזיקה-מכניקה; פיזיקה חשמל ומגנטיות
  272081601 סופי-הרצאה+תרגול | יום 3 13:00-14:50 | ד"ר אלון | מקושרת ל-272081601/1 | מועד א 2027-01-28
  272081602 סופי-הרצאה+תרגול | יום 1 17:00-18:50 | ד"ר בר | מקושרת ל-272081602/1 | מועד א 2027-01-28
  272081607 סופי-הרצאה+תרגול | יום 5 17:00-18:50 | פרופ' גל | מלאה | מקושרת ל-272081607/1 | מועד א 2027-01-28
  272081601/1 תרגול | יום 1 17:00-18:50 | ד"ר אלון
  272081602/1 תרגול | יום 4 16:00-17:50 | ד"ר בר
30110 | חוזק חומרים 2 | 2.5 נ"ז | קדם: חוזק חומרים 1
  273011005 סופי-הרצאה+תרגול | יום 1 17:00-18:50 | ד"ר דגן | מלאה | מקושרת ל-273011005/1 | מועד א 2026-12-13
  273011005/1 תרגול | יום 1 19:00-19:50 | ד"ר דגן
30112 | תרמודינמיקה 1 | 2.5 נ"ז | קדם: חשבון דיפרנציאלי אינטגרלי1
  273011201 סופי-הרצאה+תרגול | יום 2 13:00-14:50 | מר הדר | מלאה | מקושרת ל-273011201/1 | מועד א 2027-01-28
  273011202 סופי-הרצאה+תרגול | יום 4 14:00-15:50 | מר הדר | מקושרת ל-273011202/1 | מועד א 2027-01-28
  273011203 סופי-הרצאה+תרגול | יום 2 08:00-09:50 | גב' ורד | מלאה | מקושרת ל-273011203/1 | מועד א 2027-01-28
  273011204 סופי-הרצאה+תרגול | יום 3 15:00-16:50 | גב' ורד | מקושרת ל-273011204/1 | מועד א 2027-01-28
  273011201/1 תרגול | יום 2 15:00-15:50 | מר הדר | מלאה
30113 | תרמודינמיקה 2 | 2.5 נ"ז | קדם: תרמודינמיקה 1 או תרמודינמיקה
  273011305 סופי-הרצאה+תרגול | יום 4 18:00-19:50 | מר הדר | מקושרת ל-273011305/1 | מועד א 2027-01-25
  273011305/1 תרגול | יום 4 20:00-20:50 | מר הדר
30117 | תורת הזרימה 1 | 3 נ"ז | קדם: סטטיקה של גוף קשיח או מכניקת המוצקים1
  273011705 סופי-הרצאה+תרגול | יום 3 17:00-18:50 | ד"ר זיו | מקושרת ל-273011705/1 | מועד א 2027-02-10
  273011705/1 תרגול | יום 3 19:00-20:50 | ד"ר זיו
30127 | חוזק חומרים 1 | 3.5 נ"ז | קדם: סטטיקה של גוף קשיח
  273012701 סופי-הרצאה+תרגול | יום 1 08:00-09:50, יום 4 08:00-08:50 | ד"ר חן | מקושרת ל-273012701/1 | מועד א 2026-12-10
  273012702 סופי-הרצאה+תרגול | יום 3 10:00-11:50, יום 4 11:00-11:50 | ד"ר חן | מקושרת ל-273012702/1 | מועד א 2026-12-10
  273012703 סופי-הרצאה+תרגול | יום 3 13:00-14:50, יום 4 14:00-14:50 | ד"ר חן | מקושרת ל-273012703/1 | מועד א 2026-12-10
  273012704 סופי-הרצאה+תרגול | יום 1 10:00-11:50, יום 3 08:00-08:50 | ד"ר חן | מקושרת ל-273012704/1 | מועד א 2026-12-10
  273012701/1 תרגול | יום 4 09:00-09:50 | ד"ר חן
30131 | גרפיקה הנדסית 2 | 3 נ"ז | קדם: גרפיקה הנדסית 1 או גרפיקה הנדסית להנדסה רפואית
  273013101 סופי-הרצאה+מעבדה | יום 1 10:00-11:50 | גב' טל | מלאה | מקושרת ל-273013101/1 | מועד א 2026-11-29
  273013102 סופי-הרצאה+מעבדה | יום 1 08:00-09:50 | גב' טל | מקושרת ל-273013102/1 | מועד א 2026-11-29
  273013103 סופי-הרצאה+מעבדה | יום 1 13:00-14:50 | גב' טל | מקושרת ל-273013103/1 | מועד א 2026-11-29
  273013104 סופי-הרצאה+מעבדה | יום 1 15:00-16:50 | גב' טל | מקושרת ל-273013104/1 | מועד א 2026-11-29
  273013101/1 מעבדה | יום 2 10:00-11:50 | גב' טל | מלאה
30136 | דינמיקה של גוף קשיח | 3.5 נ"ז | קדם: סטטיקה של גוף קשיח או מכניקת המוצקים1; חשבון דיפרנציאלי אינטגרלי1; פיזיקה-מכניקה
  273013605 סופי-הרצאה+תרגול | יום 1 17:00-19:50 | מר יער | מקושרת ל-273013605/1 | מועד א 2027-02-15
  273013605/1 תרגול | יום 1 20:00-20:50 | מר יער
90904 | פיזיקה חשמל ומגנטיות | 5 נ"ז | קדם: פיזיקה-מכניקה
  279090406 סופי-הרצאה+תרגול | יום 2 16:00-17:50, יום 3 18:00-19:50 | ד"ר אלון | מקושרת ל-279090406/1 | מועד א 2027-01-25
  279090407 סופי-הרצאה+תרגול | יום 1 12:00-13:50, יום 3 16:00-17:50 | ד"ר בר | מלאה | מקושרת ל-279090407/1 | מועד א 2027-01-25
  279090408 סופי-הרצאה+תרגול | יום 1 14:00-15:50, יום 3 09:00-10:50 | פרופ' גל | מקושרת ל-279090408/1,279090408/2 | מועד א 2027-01-25
  279090409 סופי-הרצאה+תרגול | יום 1 10:00-11:50, יום 2 10:00-11:50 | ד"ר דגן | מקושרת ל-279090409/1,279090409/2 | מועד א 2027-01-25
  279090410 סופי-הרצאה+תרגול | יום 1 08:00-09:50, יום 4 09:00-10:50 | ד"ר דגן | מלאה | מקושרת ל-279090410/1,279090410/2 | מועד א 2027-01-25
90911 | מבוא להסתברות | 3.5 נ"ז | קדם: חשבון דיפרנציאלי אינטגרלי1
  279091104 סופי-הרצאה+תרגול | יום 2 10:00-12:50 | מר הדר | מלאה | מקושרת ל-279091104/1 | מועד א 2027-01-28
  279091105 סופי-הרצאה+תרגול | יום 4 08:00-10:50 | גב' ורד | מלאה | מקושרת ל-279091105/1 | מועד א 2027-01-28
  279091107 סופי-הרצאה+תרגול | יום 1 08:00-10:50 | גב' ורד | מקושרת ל-279091107/1 | מועד א 2027-01-28
  279091108 סופי-הרצאה+תרגול | יום 1 10:00-12:50 | ד"ר זיו | מלאה | מקושרת ל-279091108/1 | מועד א 2027-01-28
  279091109 סופי-הרצאה+תרגול | יום 1 14:00-16:50 | ד"ר זיו | מקושרת ל-279091109/1 | מועד א 2027-01-28
90915 | משוואות דיפ' חלקיות | 2.5 נ"ז | קדם: אנליזה הרמונית; פונקציות מרוכבות
  279091511 סופי-הרצאה+תרגול | יום 3 17:00-18:50 | ד"ר חן | מקושרת ל-279091511/1 | מועד א 2027-02-01
  279091511/1 תרגול | יום 1 21:00-21:50 | גב' טל
90916 | אנליזה הרמונית | 2.5 נ"ז | קדם: חשבון דיפרנציאלי אינטגרלי2; משוואות דיפ' רגילות
  279091601 סופי-הרצאה+תרגול | יום 2 11:00-12:50 | מר יער | מקושרת ל-279091601/1 | מועד א 2026-12-03
  279091602 סופי-הרצאה+תרגול | יום 2 13:00-14:50 | ד"ר אלון | מקושרת ל-279091602/1 | מועד א 2026-12-03
  279091603 סופי-הרצאה+תרגול | יום 1 08:00-09:50 | ד"ר בר | מקושרת ל-279091603/1 | מועד א 2027-02-01
  279091604 סופי-הרצאה+תרגול | יום 2 16:00-17:50 | מר יער | מקושרת ל-279091604/1 | מועד א 2026-12-03
  279091605 סופי-הרצאה+תרגול | יום 1 13:00-14:50 | ד"ר אלון | מקושרת ל-279091605/1 | מועד א 2026-12-03
90917 | פונקציות מרוכבות | 2.5 נ"ז | קדם: משוואות דיפ' רגילות
  279091701 סופי-הרצאה+תרגול | יום 1 14:00-15:50 | ד"ר חן | מלאה | מקושרת ל-279091701/1 | מועד א 2026-12-17
  279091702 סופי-הרצאה+תרגול | יום 5 17:00-18:50 | ד"ר אלון | מקושרת ל-279091702/1 | מועד א 2026-12-17
  279091703 סופי-הרצאה+תרגול | יום 3 09:00-10:50 | פרופ' גל | מלאה | מקושרת ל-279091703/1 | מועד א 2026-12-17
  279091704 סופי-הרצאה+תרגול | יום 5 11:00-12:50 | ד"ר דגן | מקושרת ל-279091704/1 | מועד א 2027-02-09
  279091705 סופי-הרצאה+תרגול | יום 1 10:00-11:50 | ד"ר חן | מקושרת ל-279091705/1 | מועד א 2026-12-17
90918 | מעבדת פיזיקה מכניקה | 1 נ"ז | קדם: פיזיקה-מכניקה
  279091809 סופי-מעבדה | יום 1 15:00-16:50 | מר הדר
  279091810 סופי-מעבדה | יום 2 18:00-19:50 | גב' ורד
  279091811 סופי-מעבדה | יום 4 11:00-12:50 | ד"ר זיו
  279091812 סופי-מעבדה | יום 4 14:00-15:50 | ד"ר חן | מלאה
  279091813 סופי-מעבדה | יום 3 15:00-16:50 | גב' טל
90919 | מעבדת פיזיקה חשמל | 1 נ"ז | קדם: פיזיקה חשמל ומגנטיות; מעבדת פיזיקה מכניקה
  279091912 סופי-מעבדה | יום 1 20:00-21:50 | מר הדר
```

Use this data in the prototypes (you may invent a profile, grades, two friends with Hebrew first names, and precomputed alternatives that are consistent with it). No real person's name.

## What to deliver

Two concepts, **A** and **B**, that differ in their basic idea (navigation model, layout, how the student moves through the jobs), not only in colors or fonts. For each one, first write a short idea (a paragraph: who it is for, the core metaphor, why it is good on a phone), then build it.

Each concept is a **clickable prototype**:
- Plain HTML, CSS and JavaScript, no build step, no framework from a CDN, nothing loaded from other sites. System fonts only (`system-ui` stack); downloading a font or a library needs the owner's approval, so do not. Icons as inline SVG you write.
- Hebrew, `dir="rtl"`, mobile first: designed at 375 px, works at 320 px with no horizontal scroll, and good at 1440 px on a computer.
- Light and dark; `prefers-reduced-motion` respected; full keyboard use with visible focus; WCAG 2.1 AA contrast; touch targets at least 44 px.
- Fake behavior is fine (precomputed alternatives, a fake "computing" delay, a fake file import that returns sample rows with two "לבדיקה" rows), but every feature above must be reachable, and the main ones must show their real states: empty, computing, result, no result, error. A rarely seen message may be shown once on a "states" page instead of wired in.
- Folders: `design-lab/fresh-a/` and `design-lab/fresh-b/`, each with its own `index.html`; `design-lab/index.html` links both.
- `design-lab/README.md` in Hebrew for the owner: the idea of each concept in 3–5 lines, what is strong and weak in each, and a list of every feature with where it lives in each concept.
- Screenshots of the main screens at 375 px and 1440 px, light and dark, in `design-lab/shots/`.

## How to work

- Work on the branch this session was started on (it is cut from `main` plus one commit holding this brief as `design-lab/BRIEF.md`). Commit only there. Never merge, never push, never touch `main`.
- Serve `design-lab/` on port 8149, bound to all interfaces, so the owner can open it on the phone at `http://<home-pc-ip>:8149/` (add a "design-fresh" entry to `.claude/launch.json`).
- Before each commit, have Codex review the change: `"~/.codex/plugins/.plugin-appserver/codex.exe" exec -c model_reasoning_effort='"high"' --sandbox read-only --skip-git-repo-check -o <out> - < <prompt>`. Codex too must not read the paths in Rule 1, and never `web/vendor/**`.
- Check each concept yourself in the browser at 320, 375 and 1440, light and dark, before reporting.
- No personal data anywhere (the repository is public).
- When done, report in Hebrew to the manager session: the two ideas in a few lines each, the URL, the branch and commits, what Codex found and what you changed, and anything you could not do.
