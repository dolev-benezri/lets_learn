# Share the schedule as an image (edit mode, design A)

Date: 2026-11-25. Status: approved by the owner on 2026-11-25. No `web/` file changes until the implementation plan is approved.

## Why

The owner asked (Hebrew): in schedule editing, after all the changes, an option to share the schedule as an image to WhatsApp.
The image is for friends, so they can coordinate, mainly to register for the same groups. In the owner's words, the share must be
intuitive and accessible, "because in the end a student will use it only if it is convenient and fast".

Today the end of editing has "שמור הצעה" and "העתק שינויים" (a text list of changes). Elsewhere, the site shares a friend link
(`#f=`, name + group ids) through the phone's share sheet (`shareOut` in `web/ui-actions.js`). Nothing in the site makes an image.

## Decisions the owner made (2026-11-25)

1. **One button, "שלח כתמונה", that always sends what is on the screen.** While a proposal is shown, it sends that proposal (so a
   student can ask friends "which one suits you?" before choosing). When no proposal is shown (after "שמור הצעה", or before a
   search), it sends the week the board shows.
2. **Image plus link.** The friend link to the site goes with the image, so a friend who uses the site adds the student in one tap.
3. **Layout: the week as a table** (draft 1), like the board, not a list by day.
4. **Improve mode shows what was there before, for comparison, the way the board does:** the old place dashed, the new place
   outlined in green.
5. **The dashed old place names the course:** dashed in the course's colour, with "היה כאן" and the course name (the site shows only
   a grey "היה כאן"; in WhatsApp a friend cannot tap it to find out).
6. **The link carries the same week as the image.** With a proposal shown, the link has that proposal's groups, so the image and the
   link always match. The owner accepted the cost: a friend who opens it adds a proposal the student has not chosen yet, and the
   student sends again after choosing another.

Drafts the owner saw (sample data, not built): a table with header, legend, dashed old places and green new places; footer
"נבנתה במתכנן המערכת · אפקה" and "הקישור בהודעה".

## Goals

- One tap from the edit screen to the phone's share sheet, with the image and the link ready; WhatsApp is in that sheet.
- The image shows exactly the week on the screen: the same lessons, colours, hour range, days, old places and new places.
- Readable on a phone in WhatsApp without zooming in for the names and group numbers (the group number is what a friend needs).
- Works on iPhone (WebKit) and Android Chrome. Desktop gets a fallback.

## Non-goals

- The classic design. The button is built in design A only (the classic design is to be deleted, about 2026-12-08).
- A share-as-image button outside edit mode (the main board). Possible later, not now.
- Choosing the layout, colours or content in the image (no settings).
- A dark image. The image is always light, whatever the page theme.
- Courses a proposal removes are not drawn (the board does not draw them either).

## Anti-goals (a failure even if it works)

- The image differs from what is on the screen.
- Text a student cannot read on a phone, or a name cut in the middle of a word with no sign it was cut.
- Slow: more than about a second from the tap to the share sheet on a mid-range phone.
- Anything personal beyond what the friend link already carries (`friendPayload`: name, group ids, year, semester, program, start year)
  and the course names and hours. No ID, no grades, no record.
- A new library, or anything sent to a server. The site stays static.

## Approaches considered

| Approach | Trade-off | Verdict |
|---|---|---|
| **Draw the image ourselves on a `<canvas>` from the week data** | New code (layout + drawing, a few hundred lines). No dependency, the same pixels on every phone, the full week even where the phone board shows one day. | **Chosen** (one sensible way) |
| Snapshot the board's DOM (html-to-image style library) | The phone board shows one day at a time, so a hidden full week would have to be rendered; such libraries are unreliable on iPhone Safari (fonts, foreignObject); a new dependency. | Rejected |
| Make the image on a server | The site has no server. | Not possible |

## The design

### Where the button is (design A, step 2 "שינויים")

- **A proposal is shown:** in `.prop-actions` (built in `resultsHtml`, `web/ui-edit.js`), after the primary "שמור הצעה":
  `[שמור הצעה] [שלח כתמונה] [העתק שינויים] [עוד]`. The row must still read well at 375px (it may wrap).
- **No proposal is shown** and the week has at least one lesson: a secondary button "שלח כתמונה" next to the search button in
  `.edit-search` (`stepTwoA`).
- Not in step 1 (loading a schedule), and not in the classic design.

### What the image shows

Size: 1080 px wide, height from the hour range (the drafts were about 1580 px). Rubik, the page's font, already loaded.

- **Header:** "המערכת של {name}" (from `app.state.name`; "המערכת שלי" when there is no name). Under it, the semester
  (`סמסטר {data.semester}׳`, "סמסטר קיץ" for summer, as `semName` in `web/advisor.js`) and one of three labels, matching the three
  weeks `weekOf` draws: "הצעה X מתוך Y" (a proposal is shown); "שינויים שעוד לא נשמרו" (no proposal, and the board draws pending
  edits: swaps, added or removed courses); "המערכת הנוכחית" (no proposal and nothing pending, or the "original" view, index 0).
  *Builder's call, settled by the writer: the image sends exactly what is drawn, pending edits included, per the owner's
  "what is on the screen".*
- **Legend**, only when the week has old places or new places: a dashed box "היה כאן" and a green box "מקום חדש".
- **The week:** day columns right to left (ראשון … חמישי, and שישי when a lesson is on Friday), the hour range of the board
  (`hourRange`), an hour label at each hour line. The range is the board's, even where it comes from an old place or a removed
  course (`weekOf` feeds it those too), so the image matches the screen; an empty hour or column is accepted.
- **A lesson:** a block in the course's colour (the same colour index the board gives it, `editColors`), with the course name (bold, in the
  course colour), "{type} · קב׳ {number}" (type as `typeLabel` in `web/ui-grid.js`, the number as `groupNumber` in `web/ui-text.js`, in bold; a fixed
  lesson with no group shows the type alone), and the hours
  "HH:MM–HH:MM" left to right.
- **A new place** (a group the proposal puts in, the board's `changed`): the block outlined in green.
- **An old place** (the board's ghosts): a dashed outline in the course's colour, "היה כאן", and the course name.
- **Overlaps:** lessons and old places that share time in one day sit side by side in lanes, so no text is drawn over other text.
- **Footer:** "נבנתה במתכנן המערכת · אפקה" and "הקישור בהודעה". No site address in the image (the address still has the owner's name,
  and the domain move is open).
- **Text that does not fit:** the course name wraps to up to 3 lines and ends with "…" when cut. In a short block the lines are dropped
  in this order until it fits: the hours, then the type and group line; the name stays.

### What happens on a tap

1. Build the image from the same inputs the board used for the week shown (lessons, old places, new places, colours, hour range).
2. Build the friend link for the groups drawn in that week (decision 6) (`friendLink`, the same payload as today). A fixed lesson's synthetic id (`fixed:…`, from `displayData` in
   `web/edit-search.js`) is filtered out: only real group ids go in the link.
3. **Phone or any browser where `navigator.canShare({ files })` is true:** `navigator.share({ files: [png], text })`, where the text is
   `shareText(name)` used today followed by the link. The link goes inside `text`, not in `url`: some share targets keep only one of
   `url` and `text` when a file is attached (writer's call; checked on the owner's iPhone). A closed sheet (`AbortError`) says nothing.
   A week with no group ids at all (only fixed lessons) has no friend link: the image goes with `shareText` alone, and the footer drops
   "הקישור בהודעה" (writer's call).
4. **Elsewhere (most desktops):** download the PNG and copy the link, with a toast saying both happened.
5. Any other failure: a toast saying the image could not be made, and the link is copied instead.

The file name is ASCII (`afeka-schedule.png`), so no platform mangles it.

### Accessibility

A real `<button>` with the visible text "שלח כתמונה"; it is disabled (aria-disabled) while the image is being built; the toast text is the
spoken result. The image itself has no alternative text in WhatsApp; the link carries the same schedule for anyone who needs it.

## Constraints

- Owner's rules: a clean reviewer reads every commit before it is made; unit tests after every edit; a full local WebKit run before the
  push; nothing personal in the public repo; one WebKit run at a time.
- Tests on node 24, as in CI.
- Design A tokens and course colours only; the image is light whatever the theme.

## What is left to the builder

- The module and function names, and how the layout (pure, testable without a canvas) is split from the drawing.
- How the board's ghosts carry their course (today `weekOf` keeps only day and hours) so the image can colour and name them.
- How the image gets the board's inputs: `weekOf` returns HTML only, and `editColors`, `semName` are module-local; reshaping or
  exporting them is the builder's (the image must use the same values the board used).
- Exact font sizes and padding, within the drafts' look; the check is a phone-width view of the PNG.
- The busy state's look.

## How it is checked

- Unit tests for the layout: blocks and old places land in the right day, lane and hours; the legend only when needed; the header for a
  proposal and for the current week; names cut with "…"; the dropped-lines order in a short block; Friday adds a column.
- WebKit spec: the button exists with a proposal and without one, not in step 1; a tap with `navigator.share` stubbed receives one PNG
  file (non-empty, image/png) and a URL with `#f=`; the desktop fallback downloads and copies.
- A look at the real PNG made from the test student, at phone width.
- On the owner's iPhone, in WhatsApp: whether the link arrives as the image's caption or as a separate message, and that both arrive.
