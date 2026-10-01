# Friend schedule editor + import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a student enter a friend's **whole weekly timetable** in a dedicated full-screen editor:
- see it on a real weekly grid;
- place courses with their exact group number and hours;
- or import it by pasting text or loading a PDF.

**Architecture:** A new module `web/ui-friend-editor.js` opens a full-screen `<dialog id="friendEd">`. Its right side is a course and group picker. Its left side is the weekly grid, rendered with the existing `renderWeek(ctx)` from `web/ui-grid.js`, with `res = { groups: draftGroups }`. Saving produces the same friend object as today (`{ name, groups, weight: 1, active: true, manual: true }`) through the existing `addFriend(p)` path, so the solver does not change.

Import:
1. **Paste text.** Zero dependencies. A pure `groupsFromText(text, data)` finds 9-digit group ids, for example copied from Afeka-net "המערכת שלי".
2. **PDF.** pdf.js loaded lazily from cdnjs only when the user picks a file. Its text goes through the same `groupsFromText`.
3. **Image (OCR).** In scope (owner rule 2026-10-01: integrate existing tools). Tesseract.js is loaded lazily from jsdelivr only when an image is chosen, with the `eng` model and a digits-only whitelist (`tessedit_char_whitelist: '0123456789'`). Its text goes through the same `groupsFromText`, so a misread digit can only produce an "לא נמצאו" id, never a wrong silent add. It shows progress, and any error becomes the same "לא נמצא טקסט…" message.

**Tech Stack:** plain ES modules, `node --test`; `pdfjs-dist` from `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/` (an ES module build, lazy `import()`).

**Spec:** user bug map item 2 in `.superpowers/next-session.md`; ISSUES §9 and §11. The current inline form in `friendsPanel()` (`web/ui-plan.js`) is replaced. "ערוך" on a manual friend opens the editor pre-filled.

## Global Constraints
- Group ids are 9-digit strings, for example `270600101` (`data.courses[cid].groups[].id`). In year scope `app.data` holds both semesters, and their group ids are disjoint.
- The friend object limits come from `normalize()`: name ≤ 60, ≤ 40 groups, ≤ 20 friends. The editor enforces 40 with a visible message.
- Friend names and pasted text are untrusted. Everything rendered goes through `esc()`. `askConfirm`/`showText` take plain text (no `esc()`).
- Hebrew, RTL, 44px targets, keyboard: every grid block and picker row is reachable, and Delete removes the focused block.
- Use only one browser agent at a time for checks.

## Must not repeat the old form's bugs (debug report 2026-10-01)
- Save goes through `upsertFriend` from plan 0 (one path, friend identified by **name**, never by index).
- Editing builds its index from **both** semesters and keeps unrepresentable groups (`splitFriendGroups` from plan 0).
- The course picker lists only courses with `groups.length > 0` in the shown semester. It accepts the exact datalist text, a course id, or a unique name substring, and Enter adds the course (`<form>` submit).
- Draft state lives only in the editor until Save. No `save()` / `scheduleRun()` on every pick (the old `'quiet'` CHG handlers did this).
- Every `<select>` and input has an accessible label (`<label for>` or `aria-label`). Focus returns to the opener (the button has a stable id) after Save and after Cancel.
- The editor is self-contained. Delete the old `mf*` branch in `friendsPanel()` and the `mf*` ACT/CHG entries. No second copy of the friends panel.

## Review Focus
- Pasted text with ids from both semesters: all are placed, and the grid shows a semester switch (tabs as on the board).
- Pasted text with unknown ids, or numbers that only look like ids (phone numbers, years): reported as "לא נמצאו: …", never silently added.
- Two groups of the same course and type picked: the second replaces the first (a friend sits in one lecture group).
- A group that overlaps another in the draft is allowed (friends can have clashes), but it is shown with a warning outline.
- A PDF that has no text layer (a scanned image): message "לא נמצא טקסט בקובץ, נסו להעתיק ולהדביק", and pdf.js errors never escape.

---

### Task 1: `groupsFromText`

**Files:** Create `web/friend-import.js`; Test `test/friend-import.test.mjs`

**Interfaces:** Produces `groupsFromText(text: string, data): { found: string[], unknown: string[] }`. Ids are unique, in order of appearance. `found` holds ids present in `groupIndex(data)` (from `web/ui-grid.js`). `unknown` holds 9-digit tokens that are not.

- [ ] **Step 1: Failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { groupsFromText } from '../web/friend-import.js';
const data = { courses: { c1: { groups: [{ id: '270600101' }, { id: '270600102' }] }, c2: { groups: [{ id: '270611201' }] } } };
test('groupsFromText finds known 9-digit ids once, reports unknown ones, ignores other numbers', () => {
  const t = 'קבוצה 270600101 ב׳ 10:00\n270611201, 270600101\nטלפון 0521234567 שנה 2027 קוד 999999999';
  assert.deepEqual(groupsFromText(t, data), { found: ['270600101', '270611201'], unknown: ['999999999'] });
});
test('groupsFromText on empty text', () => assert.deepEqual(groupsFromText('', data), { found: [], unknown: [] }));
```

- [ ] **Step 2:** `node --test test/friend-import.test.mjs` → FAIL, module missing.
- [ ] **Step 3: Implement**

```js
import { groupIndex } from './ui-grid.js';
// Afeka group ids are 9 digits; (?<!\d)…(?!\d) keeps 10-digit phone numbers out.
export function groupsFromText(text, data) {
  const known = groupIndex(data), found = [], unknown = [];
  for (const [id] of String(text).matchAll(/(?<!\d)\d{9}(?!\d)/g)) {
    const list = known.has(id) ? found : unknown;
    if (!list.includes(id)) list.push(id);
  }
  return { found, unknown };
}
```

  First check that `ui-grid.js` imports nothing browser-only at module level, so node can load it. `test/ui-grid.test.mjs` already imports it, so it is safe.
- [ ] **Step 4:** Run → PASS. Commit `feat(friends): find group ids in pasted text`.

### Task 2: `placeGroup` draft logic

**Files:** `web/friend-import.js`, `test/friend-import.test.mjs`

**Interfaces:** Produces `placeGroup(draft: string[], gid: string, data): string[]`. It adds `gid` and removes any other group of the same course **and the same type** (`g.type`). If `gid` is already in the draft, it is removed (a toggle). The result is capped at 40.

- [ ] **Step 1: Failing test**

```js
import { placeGroup } from '../web/friend-import.js';
const d2 = { courses: { c: { groups: [
  { id: 'L1', type: 'הרצאה' }, { id: 'L2', type: 'הרצאה' }, { id: 'T1', type: 'תרגיל' } ] } } };
test('placeGroup replaces a same-course same-type group, keeps other types, toggles off', () => {
  assert.deepEqual(placeGroup(['L1', 'T1'], 'L2', d2), ['T1', 'L2']);
  assert.deepEqual(placeGroup(['L1'], 'L1', d2), []);
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement using `groupIndex(data).get(gid)` → `{ cid, g }`. **Step 4:** PASS. Commit `feat(friends): draft placement rules`.

### Task 3: Editor dialog

**Files:** Create `web/ui-friend-editor.js`. Modify `web/index.html` (add `<dialog id="friendEd" class="dlg-full" aria-labelledby="feTitle"></dialog>` + CSS) and `web/ui-plan.js`:
- replace the manual inline form with a button `הזנת מערכת של חבר` that calls `openFriendEditor()`;
- "ערוך" on a manual friend calls `openFriendEditor(friend)`;
- delete the `mf*` state, CHG and ACT entries.

**Interfaces:** Produces `openFriendEditor(friend?: {name, groups}, onSave: (p) => void)`. `ui-plan.js` passes `addFriend` as `onSave` (it is not exported today, so pass it as a callback to avoid an import cycle).

- [ ] **Step 1: Design pass:** ui-ux-pro-max `"schedule editor weekly calendar" --domain ux`, `"file upload paste import" --domain ux`.
- [ ] **Step 2: Layout.**
  - Header: name input (required), a semester tabs control when `app.sem['ב']` exists, and Save/Cancel.
  - Right column, top to bottom:
    1. course search (`<input list>` + datalist like today);
    2. the chosen course's groups as rows: type, day and hours, lecturer, id, plus a "שבץ" button that calls `placeGroup`;
    3. an "ייבוא" section with a textarea, a "מצא קבוצות" button, and `<input type="file" accept="application/pdf">`.
  - Left: `renderWeek({ data: semData, res: { groups: draft }, range, colors, dashed: new Set(), pins: [], friends: [], day })`. Clicking a block selects it, and the Delete key or a "הסר" button removes it.
  - Phone: the grid sits on top and the picker becomes a bottom sheet.
- [ ] **Step 3: PDF.**
  - Only when a file is chosen: `const pdfjs = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = '…/pdf.worker.min.mjs';`. Before writing this, verify the exact current version path on cdnjs.
  - Join `getTextContent()` items of every page, then call `groupsFromText`. Wrap everything in try/catch and show the "לא נמצא טקסט" message.
- [ ] **Step 4: Import result** shows "נמצאו N קבוצות" + "לא נמצאו: …" (escaped), and found ids are placed through `placeGroup`.
- [ ] **Step 5: Save.** An empty name or empty draft gives an inline error with `aria-invalid`. If a friend with the same name exists, use `askConfirm` (plain text). Then `onSave({ name, groups: draft, weight: 1, active: true, manual: true })`.
- [ ] **Step 6:** `npm test`, then a Chrome check of the Review Focus list (one agent). Commit `feat(friends): full-screen friend timetable editor with paste and PDF import`.
