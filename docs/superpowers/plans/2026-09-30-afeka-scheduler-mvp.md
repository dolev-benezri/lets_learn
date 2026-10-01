# Afeka Scheduler MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static website that builds the Afeka semester-A 2027 (תשפ"ז) timetable for mechanical engineering students (start year 2026) from public Yedion data, respecting prerequisites and ranking schedules by friends' overlap and personal preferences.

**Architecture:** A Node scraper (`scripts/`) turns public Yedion HTML pages into one static JSON file under `web/data/`. The site (`web/`) is plain HTML + ES modules. `rules.js` classifies courses, `solver-core.js` searches schedules (backtracking over 30-minute bitmasks, run in a Web Worker), and `share.js` encodes friend links in the URL hash. No server, no DB, no accounts.

**Tech Stack:** Node ≥ 22 (built-in `fetch`, `node:test`, `CompressionStream`), `node-html-parser` (the only dependency), vanilla JS/HTML/CSS. Runs locally with `npx http-server web` (no deployment for now).

**Spec:** [docs/superpowers/specs/2026-09-30-afeka-scheduler-design.md](../specs/2026-09-30-afeka-scheduler-design.md). This plan covers the spec's **MVP** row (section 9). Version 2 (cron, Worker, Gemini import) gets its own plan.

## Deviations from the spec (found while writing this plan, against the real HTML)

1. **Prerequisites are listed by course NAME, not code**, in `S_CourseDetails`. So `prereqs[].anyOf` holds `{ id, name }` objects: `id` is the course code resolved by name, or `null` if the prerequisite is outside the program (for example the physics prep course). Unresolved prerequisites count as satisfied, and the UI says so.
2. **Groups have a "הקורס מלא" (group full) flag.** The data stores `full: true`. The solver skips full groups unless they are pinned or `includeFull` is on.
3. **Primary vs. linked groups:** a group is primary when its type starts with `סופי` (`סופי-הרצאה+תרגול`, `סופי-מעבדה`, `סופי-הרצאה`, `סופי-הרצאה+מעבדה`). Types `תרגול` and `מעבדה` are linked sub-groups. An option is one primary plus **one linked sub-group of each linked type**.
4. **Data location:** `web/data/afeka/{year}-{semesterCode}/{program}-{startYear}.json` (for example `web/data/afeka/2027-1/30-2026.json`). It lives inside `web/` so the static host serves it, and the semester is in the path so semester B won't overwrite it.
5. **Validation thresholds:** at least **40** courses (the program has about 60–80, not ≥100), and 90903 has at least **3** primary groups (5 exist today, but that count changes over time). Unlinked sub-groups produce a **warning**, not an error.
6. **Exams are fetched by form POST** (`PRGNAME=S_EXAMS`, `ARGUMENTS=R1C28,R1C29,R1C30`, fields `R1C28=30&R1C29=0&R1C30=0`) after a POST that sets the session year (`PRGNAME=Enter_Search`, `ARGUMENTS=-A,,-A,ChangeYear`, `ChangeYear=2027`). Verified with curl for 2026: `R1C30=0` returns every year (620 rows). The 2027 exam timetable isn't published yet ("לא נמצאו נתונים").
7. **Compression format:** `CompressionStream('deflate')` instead of `'deflate-raw'`, because it's supported in every Node 20.x and browser.
8. **Hosting:** **local only for now** (project decision, 30.09.2026): `npx http-server web -p 8080 -c-1`. Deployment is deferred and needs a separate go-ahead.
10. **Design:** UI follows ui-ux-pro-max output: [design-system/afeka-scheduler/MASTER.md](../../../design-system/afeka-scheduler/MASTER.md) plus the override [pages/app.md](../../../design-system/afeka-scheduler/pages/app.md), which wins. That means Noto Sans Hebrew, teal/orange tokens, SVG icons (no emoji), week blocks as `<button>`s, and visible focus.
9. **Progress metric:** `credits × (1 + 0.25 × transitive unlock count)`. The spec's "earlier-year bonus" is dropped, because year order is already captured by the unlock chains.

## Global Constraints

- Node ≥ 22 (for `Map.groupBy`; installed: v24). Only runtime dependency: `node-html-parser`. Tests: `node --test` + `node:assert/strict`, no framework.
- No framework, no build step, no server, no DB, no accounts.
- UI language Hebrew, `dir="rtl"`, mobile-first. The constant disclaimer "כלי עזר בלבד. ההרשמה באפקה-נט היא הקובעת." stays visible.
- Data source: `https://yedionpub.afeka.ac.il/yedion/fireflyweb.aspx` only. Requests are sequential, with a delay of about 1 request/second and an identifying User-Agent.
- Scraper: if any parse or validation step fails, it exits non-zero and **does not write** the JSON.
- The friend link contains only `{v, year, semester, program, name, groups}`. No passed/failed state.
- Every `localStorage` access is wrapped in try/catch. The site works without it.
- UI: follow `design-system/afeka-scheduler/pages/app.md` (overrides `MASTER.md`) and pass its pre-delivery checklist.
- Data scope: year 2027, semester `א`, program 30 (day track), start year 2026, lists `30001 30002 30003 30004 30007 30010 30031 30901 60004`.

## Review Focus

1. **Friend link from an untrusted sender carrying HTML in `name`.** The page must render it as text (never execute it). Test: Task 10, `esc()` unit test. Rendering always goes through `esc`.
2. **Friend link whose group ids no longer exist** (group cancelled or renamed). Unknown ids must be ignored, with no crash and a visible count of unmatched groups. Tests: Task 8 (`friends` metric ignores unknown ids) and Task 11 (landing shows the "לא נמצאו" count).
3. **A meeting row with no real time** (`00:00`–`00:00`, empty) or outside 07:00–23:00. The parser must drop it or the mask must clamp it, never throw. Tests: Task 2 (`parseGroups` drops zero-length meetings) and Task 7 (mask clamps).
4. **A prerequisite name that matches no course** (renamed course, alternative name, a course outside the program). It must never silently block. It counts as satisfied, with a note. Tests: Task 4 (`id: null`) and Task 6 (the rules treat it as satisfied).
5. **A primary group with no linked sub-groups even though its type says `+תרגול`.** It must still produce an option (the primary alone). Test: Task 7.

---

## File Structure

```
package.json                     scripts + the single dependency
.gitignore                       node_modules
scripts/parse.mjs                pure HTML parsers: parseProgram, parseGroups, parseDetails, parseExams
scripts/build.mjs                pure: buildDataset (resolve prereqs, attach exams), validate
scripts/scrape.mjs               CLI: session/cookies, requests, calls parse+build, writes JSON
scripts/fixtures/*.html          real Yedion pages for parser tests
web/index.html                   page shell + CSS
web/app.js                       UI: 4 tabs, state, rendering
web/rules.js                     classify(data, state), progress(data, state)
web/solver-core.js               masks, buildOptions, search (pure, used by node tests + worker)
web/solver-worker.js             Web Worker wrapper around search
web/share.js                     encode/decode, friend/backup links, readHash
web/data/afeka/2027-1/30-2026.json   generated data (committed)
test/parse.test.mjs              parser tests on fixtures
test/build.test.mjs              buildDataset + validate
test/rules.test.mjs
test/solver.test.mjs
test/share.test.mjs
test/app.test.mjs                esc() only (UI is verified manually)
test/fixtures/mini-data.mjs      small synthetic dataset shared by rules/solver tests
```

---

### Task 1: Project setup, fixtures, and `parseProgram`

**Files:**
- Create: `package.json`, `.gitignore`, `scripts/parse.mjs`, `test/parse.test.mjs`, `scripts/fixtures/*.html`

**Interfaces:**
- Produces: `parseProgram(html) → { name: string, minCredits: number, courses: [{ id: string, name: string, offered: boolean }] }`, plus the internal helpers `clean(s)` and `tableRows(el)` in `scripts/parse.mjs`.

- [ ] **Step 1: Create `package.json` and `.gitignore`**

```json
{
  "name": "afeka-scheduler",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "node --test",
    "scrape": "node scripts/scrape.mjs"
  },
  "dependencies": {
    "node-html-parser": "^6.1.13"
  }
}
```

`.gitignore`:
```
node_modules/
```

Run: `npm install`
Expected: `added 1 package` (or a few transitive ones), no errors.

- [ ] **Step 2: Download the fixtures (real pages, used offline by the tests)**

```bash
mkdir -p scripts/fixtures
U="https://yedionpub.afeka.ac.il/yedion/fireflyweb.aspx"
A="afeka-scheduler/1.0 (student timetable tool)"
curl -s --compressed -A "$A" -o scripts/fixtures/prog-30001.html "$U?prgname=S_SHOW_PROGS&arguments=-N2026,-N30001"; sleep 1
curl -s --compressed -A "$A" -o scripts/fixtures/groups-90903.html "$U?prgname=S_LOOK_FOR_NOSE&arguments=-N90903"; sleep 1
curl -s --compressed -A "$A" -o scripts/fixtures/groups-10336.html "$U?prgname=S_LOOK_FOR_NOSE&arguments=-N10336"; sleep 1
curl -s --compressed -A "$A" -o scripts/fixtures/details-90903.html "$U?prgname=S_CourseDetails&arguments=-N90903,-N1,-N1,-N279090301,-N"; sleep 1
curl -s --compressed -A "$A" -o scripts/fixtures/details-30120.html "$U?prgname=S_CourseDetails&arguments=-N30120,-N1,-N1,-N273012002,-N"; sleep 1
J=$(mktemp)
curl -s --compressed -A "$A" -c $J -b $J -o /dev/null "$U?prgname=Enter_Search"; sleep 1
curl -s --compressed -A "$A" -c $J -b $J -o /dev/null --data-urlencode "PRGNAME=Enter_Search" --data-urlencode "ARGUMENTS=-A,,-A,ChangeYear" --data-urlencode "ChangeYear=2026" "$U"; sleep 1
curl -s --compressed -A "$A" -c $J -b $J -o scripts/fixtures/exams-2026.html --data-urlencode "PRGNAME=S_EXAMS" --data-urlencode "ARGUMENTS=R1C28,R1C29,R1C30" -d "R1C28=30&R1C29=0&R1C30=0" "$U"; sleep 1
curl -s --compressed -A "$A" -c $J -b $J -o /dev/null --data-urlencode "PRGNAME=Enter_Search" --data-urlencode "ARGUMENTS=-A,,-A,ChangeYear" --data-urlencode "ChangeYear=2027" "$U"; sleep 1
curl -s --compressed -A "$A" -c $J -b $J -o scripts/fixtures/exams-nodata.html --data-urlencode "PRGNAME=S_EXAMS" --data-urlencode "ARGUMENTS=R1C28,R1C29,R1C30" -d "R1C28=30&R1C29=0&R1C30=0" "$U"
grep -c "90903" scripts/fixtures/exams-2026.html; grep -c "לא נמצאו נתונים" scripts/fixtures/exams-nodata.html
```

Expected: both counts are ≥ 1. If `exams-nodata.html` has **no** "לא נמצאו נתונים", the 2027 exams have been published. Keep the file anyway (the Task 3 no-data test then uses a hand-made page, see Task 3 Step 1).

> The expected values in the tests below were observed on 30.09.2026. If a fixture differs (for example a group was added), open the same URL in a browser, confirm, and update the expected value to match the fixture. Never loosen the assertion.

- [ ] **Step 3: Write the failing test**

`test/parse.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseProgram } from '../scripts/parse.mjs';

const fx = (name) => readFileSync(new URL(`../scripts/fixtures/${name}`, import.meta.url), 'utf8');

test('parseProgram reads list name, min credits and courses', () => {
  const p = parseProgram(fx('prog-30001.html'));
  assert.equal(p.name, "קורסי חובה שנה א'");
  assert.equal(p.minCredits, 41);
  assert.equal(p.courses.length, 11);
  assert.deepEqual(p.courses.find((c) => c.id === '90903'), { id: '90903', name: 'פיזיקה-מכניקה', offered: true });
  assert.ok(p.courses.every((c) => /^\d{4,6}$/.test(c.id)));
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `node --test test/parse.test.mjs`
Expected: FAIL with `Cannot find module` or `parseProgram is not a function`.

- [ ] **Step 5: Write minimal implementation**

`scripts/parse.mjs`:
```js
import { parse } from 'node-html-parser';

export const clean = (s) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

// Michlol pages render tables as <div class="row"><div class="col">…</div></div>.
// Returns the text of each row's direct .col children. Wrapper rows show up too;
// callers filter by column count and content.
export function tableRows(el) {
  return el.querySelectorAll('.row').map((row) =>
    row.childNodes.filter((n) => n.classList?.contains('col')).map((n) => clean(n.text)));
}

export function parseProgram(html) {
  const root = parse(html);
  const text = clean(root.text);
  const min = text.match(/לפחות\s*([\d.]+)/);
  const title = clean(root.querySelectorAll('h2').map((h) => h.text).find((t) => t.includes('רשימת קורסים')) ?? '');
  const name = title.split(':')[1]?.split(',')[0].trim() ?? '';
  const courses = tableRows(root)
    .filter((c) => c.length >= 3 && /^\d{4,6}$/.test(c[0]))
    .map(([id, courseName, offered]) => ({ id, name: courseName, offered: offered === 'נלמד' }));
  return { name, minCredits: min ? Number(min[1]) : 0, courses };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test test/parse.test.mjs`
Expected: PASS (1 test).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore scripts/parse.mjs scripts/fixtures test/parse.test.mjs
git commit -m "feat(scrape): project setup, yedion fixtures, parseProgram"
```

---

### Task 2: `parseGroups`

**Files:**
- Modify: `scripts/parse.mjs` (append)
- Test: `test/parse.test.mjs` (append)

**Interfaces:**
- Consumes: `clean`, `tableRows` from Task 1.
- Produces: `parseDay(text) → 1..6 | null`, and `parseGroups(html) → [{ id: string, type: string, primary: boolean, lecturer: string, full: boolean, linked: string[], meetings: [{ semester: string, day: number|null, start: 'HH:MM', end: 'HH:MM', room: string }], detailsArgs: string|null }]`. Sub-group ids use the format `'279090301/1'`.

- [ ] **Step 1: Write the failing tests**

Append to `test/parse.test.mjs`:
```js
import { parseGroups, parseDay } from '../scripts/parse.mjs';

test('parseDay handles words and letters', () => {
  assert.equal(parseDay('יום שני'), 2);
  assert.equal(parseDay('ה'), 5);
  assert.equal(parseDay('xyz'), null);
});

test('parseGroups reads primaries, linked tutorials and meetings for 90903', () => {
  const gs = parseGroups(fx('groups-90903.html'));
  const primaries = gs.filter((g) => g.primary);
  assert.deepEqual(primaries.map((g) => g.id), ['279090301', '279090303', '279090304', '279090305', '279090312']);
  const g303 = gs.find((g) => g.id === '279090303');
  assert.equal(g303.type, 'סופי-הרצאה+תרגול');
  assert.equal(g303.lecturer, 'ד"ר שמעון מאיר');
  assert.deepEqual(g303.linked, ['279090303/1', '279090303/2']);
  assert.deepEqual(g303.meetings[0], { semester: 'א', day: 2, start: '12:00', end: '13:50', room: '208 פיקוס' });
  assert.equal(g303.detailsArgs, '-N90903,-N1,-N1,-N279090303,-N');
  const t = gs.find((g) => g.id === '279090301/1');
  assert.equal(t.type, 'תרגול');
  assert.equal(t.primary, false);
  assert.deepEqual(t.meetings, [{ semester: 'א', day: 2, start: '10:00', end: '11:50', room: "ז'2 קריה - עגלת תחשבים" }]);
});

test('parseGroups reads the full flag and standalone labs', () => {
  const gs = parseGroups(fx('groups-10336.html'));
  const lab = gs.find((g) => g.id === '271033601');
  assert.equal(lab.type, 'סופי-מעבדה');
  assert.equal(lab.primary, true);
  assert.equal(lab.full, true);
  assert.deepEqual(lab.linked, []);
});

test('parseGroups drops meetings without a real time', () => {
  const html = `<div class="TextAlignRight">קורס מסוג סופי-הרצאה <span>קבוצה : 111 </span> מרצה הקורס : מר א פרטים נוספים</div>
    <div class="Table"><div class="row"><div class="col">&nbsp;א</div><div class="col">&nbsp;יום שני</div><div class="col">&nbsp;00:00</div><div class="col">&nbsp;00:00</div><div class="col">x</div><div class="col">y</div></div></div>`;
  assert.deepEqual(parseGroups(html)[0].meetings, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/parse.test.mjs`
Expected: FAIL. `parseGroups` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `scripts/parse.mjs`:
```js
const DAY_WORDS = { 'ראשון': 1, 'שני': 2, 'שלישי': 3, 'רביעי': 4, 'חמישי': 5, 'שישי': 6 };
const DAY_LETTERS = { 'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6 };
const TIME = /^\d{2}:\d{2}$/;

export function parseDay(text) {
  const t = clean(text).replace(/^יום\s*/, '');
  return DAY_WORDS[t] ?? DAY_LETTERS[t] ?? null;
}

// Each group starts with <div class="TextAlignRight"> "קורס מסוג …" and is followed by its meetings table.
export function parseGroups(html) {
  return html.split('<div class="TextAlignRight">').slice(1)
    .filter((chunk) => chunk.includes('קורס מסוג'))
    .map((chunk) => {
      const root = parse(chunk);
      const text = clean(root.text);
      const type = text.match(/קורס מסוג\s*(\S+)/)[1];
      const g = text.match(/קבוצה\s*:\s*(\d+)(?:\s*\/\s*(\d+))?/);
      const linkedText = text.match(/קבוצות הקשורות לקורס זה\s*:\s*([^)]*)\)/)?.[1] ?? '';
      return {
        id: g[2] ? `${g[1]}/${g[2]}` : g[1],
        type,
        primary: type.startsWith('סופי'),
        lecturer: text.match(/מרצה הקורס\s*:\s*(.*?)\s*פרטים נוספים/)?.[1] ?? '',
        full: text.includes('הקורס מלא'),
        linked: [...linkedText.matchAll(/(\d+)\s*\/\s*(\d+)/g)].map((m) => `${m[1]}/${m[2]}`),
        meetings: tableRows(root)
          .filter((c) => c.length === 6 && TIME.test(c[2]) && TIME.test(c[3]) && c[2] !== c[3])
          .map(([semester, day, start, end, , room]) => ({ semester, day: parseDay(day), start, end, room })),
        detailsArgs: chunk.match(/data-progname="S_CourseDetails" data-arguments="([^"]+)"/)?.[1] ?? null,
      };
    });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/parse.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/parse.mjs test/parse.test.mjs
git commit -m "feat(scrape): parseGroups with linked tutorials, full flag, meetings"
```

---

### Task 3: `parseDetails` and `parseExams`

**Files:**
- Modify: `scripts/parse.mjs` (append)
- Test: `test/parse.test.mjs` (append)

**Interfaces:**
- Produces:
  - `parseDetails(html) → { credits: number, prereqs: [{ kind: 'קדם'|'מקביל', population: string, names: string[] }] }`
  - `parseExams(html) → [{ semester: string, courseId: string, lecturer: string, kind: 'בחינה'|'בוחן אמצע', moeds: [{ moed: 1|2|3, date: 'YYYY-MM-DD', time: 'HH:MM'|null }] }]`
  - `toIsoDate('04/02/2026') → '2026-02-04' | null`

- [ ] **Step 1: Write the failing tests**

Append to `test/parse.test.mjs`:
```js
import { parseDetails, parseExams, toIsoDate } from '../scripts/parse.mjs';

test('parseDetails reads credits and a named prerequisite', () => {
  const d = parseDetails(fx('details-90903.html'));
  assert.equal(d.credits, 5);
  assert.deepEqual(d.prereqs, [{ kind: 'קדם', population: '', names: ['קורס הכנה פיזיקה', 'פיזיקה - מכינה בדרך לאפקה'] }]);
});

test('parseDetails separates קדם and מקביל', () => {
  const d = parseDetails(fx('details-30120.html'));
  assert.deepEqual(d.prereqs.map((p) => [p.kind, p.names]), [
    ['קדם', ['תרמודינמיקה 1', 'תרמודינמיקה']],
    ['מקביל', ["משוואות דיפ' חלקיות"]],
  ]);
});

test('toIsoDate', () => {
  assert.equal(toIsoDate('04/02/2026'), '2026-02-04');
  assert.equal(toIsoDate(''), null);
});

test('parseExams reads exam rows with moeds', () => {
  const rows = parseExams(fx('exams-2026.html'));
  const phys = rows.filter((r) => r.courseId === '90903' && r.kind === 'בחינה');
  assert.ok(phys.length >= 1);
  const shimon = phys.find((r) => r.lecturer === 'ד"ר שמעון מאיר');
  assert.deepEqual(shimon.moeds[0], { moed: 1, date: '2026-07-30', time: '09:00' });
  const mid = rows.find((r) => r.kind === 'בוחן אמצע');
  assert.ok(mid.moeds.length >= 1);
});

test('parseExams returns [] on the no-data page', () => {
  const nodata = '<div class="alert">עימכם הסליחה אבל לא נמצאו נתונים</div>';
  assert.deepEqual(parseExams(nodata), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/parse.test.mjs`
Expected: FAIL. `parseDetails` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `scripts/parse.mjs`:
```js
export function parseDetails(html) {
  const root = parse(html);
  const credits = Number(clean(root.text).match(/נקודות זכות\s*:\s*([\d.]+)/)?.[1] ?? 0);
  const card = root.querySelectorAll('.card').find((c) => c.querySelector('h2')?.text.includes('תנאי קדם לנושא'));
  const prereqs = card
    ? tableRows(card)
        .filter((c) => c.length === 4 && c[0].startsWith('תנאי'))
        .map(([kindText, population, name, alt]) => ({
          kind: kindText.includes('מקביל') ? 'מקביל' : 'קדם',
          population,
          names: [name, alt].filter(Boolean),
        }))
    : [];
  return { credits, prereqs };
}

export function toIsoDate(d) {
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

const EMPTY_TIME = /^00:00(:00)?$/;

export function parseExams(html) {
  return tableRows(parse(html))
    .filter((c) => c.length === 11 && /^\d{4,6}$/.test(c[1]))
    .map(([semester, courseId, , kindText, lecturer, d1, t1, d2, t2, d3, t3]) => ({
      semester,
      courseId,
      lecturer,
      kind: kindText.startsWith('בוחן') ? 'בוחן אמצע' : 'בחינה',
      moeds: [[d1, t1], [d2, t2], [d3, t3]]
        .map(([d, t], i) => ({ moed: i + 1, date: toIsoDate(d), time: !t || EMPTY_TIME.test(t) ? null : t.slice(0, 5) }))
        .filter((m) => m.date),
    }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/parse.test.mjs`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/parse.mjs test/parse.test.mjs
git commit -m "feat(scrape): parseDetails (קדם/מקביל by name) and parseExams"
```

---

### Task 4: `buildDataset` and `validate`

**Files:**
- Create: `scripts/build.mjs`, `test/build.test.mjs`

**Interfaces:**
- Consumes: the output shapes of `parseProgram`, `parseGroups`, `parseDetails`, `parseExams`.
- Produces:
  - `normName(s)` and `normLecturer(s)`: strings used for matching.
  - `buildDataset({ year, startYear, program, semester, department, lists, raw, exams, fetchedAt }) → Dataset`, where
    - `lists = [{ code, name, minCredits, courses: [{id,name,offered}] }]`
    - `raw = { [courseId]: { groups: ParsedGroup[], details: ParsedDetails|null } }`
  - The **Dataset** (used by every later task):
    ```
    { fetchedAt, year, startYear, program, semester, examsPublished: boolean,
      lists: [{ code, name, minCredits, courses: string[] }],
      courses: { [id]: { name, credits, offered: boolean,
        prereqs: [{ kind: 'קדם'|'מקביל', anyOf: [{ id: string|null, name: string }] }],
        groups: [{ id, type, primary, lecturer, full, semester, linked: string[],
                   meetings: [{ day, start, end, room }],
                   exams: [{ kind, moed, date, time }] }] } } }
    ```
  - `validate(dataset) → { errors: string[], warnings: string[] }`

- [ ] **Step 1: Write the failing tests**

`test/build.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDataset, validate, normLecturer } from '../scripts/build.mjs';

const g = (id, extra = {}) => ({ id, type: 'סופי-הרצאה+תרגול', primary: true, lecturer: 'ד"ר שמעון מאיר', full: false,
  linked: [], meetings: [{ semester: 'א', day: 2, start: '12:00', end: '13:50', room: 'r' }], detailsArgs: null, ...extra });

const base = () => ({
  year: 2027, startYear: 2026, program: 30, semester: 'א', department: 'מכנית', fetchedAt: '2026-10-01T00:00:00Z',
  lists: [
    { code: 30001, name: "קורסי חובה שנה א'", minCredits: 10, courses: [{ id: '90903', name: 'פיזיקה-מכניקה', offered: true }] },
    { code: 30002, name: "קורסי חובה שנה ב'", minCredits: 10, courses: [
      { id: '20816', name: 'מעבדה בפיזיקה', offered: true },
      { id: '90903', name: 'פיזיקה-מכניקה', offered: true } ] },
  ],
  raw: {
    '90903': { groups: [
      g('279090303', { linked: ['279090303/1', '279090303/9'] }),
      g('279090303/1', { type: 'תרגול', primary: false, lecturer: 'מר א' }),
      g('279090399', { meetings: [{ semester: 'ב', day: 1, start: '08:00', end: '09:50', room: 'r' }] }),
    ], details: { credits: 5, prereqs: [{ kind: 'קדם', population: '', names: ['קורס הכנה פיזיקה'] }] } },
    '20816': { groups: [g('272081601', { lecturer: 'ד"ר אחר' })], details: { credits: 1, prereqs: [
      { kind: 'קדם', population: '', names: ['פיזיקה-מכניקה'] },
      { kind: 'קדם', population: 'מחלקה : הנדסת חשמל', names: ['משהו'] },
    ] } },
  },
  exams: [
    { semester: 'א', courseId: '90903', lecturer: 'ד"ר שמעון מאיר', kind: 'בחינה', moeds: [{ moed: 1, date: '2027-02-04', time: '09:00' }] },
    { semester: 'א', courseId: '20816', lecturer: 'ד"ר לא קיים', kind: 'בחינה', moeds: [{ moed: 1, date: '2027-02-10', time: '09:00' }] },
    { semester: 'ב', courseId: '90903', lecturer: 'ד"ר שמעון מאיר', kind: 'בחינה', moeds: [{ moed: 1, date: '2027-07-01', time: '09:00' }] },
  ],
});

test('normLecturer strips titles and quotes', () => {
  assert.equal(normLecturer('ד"ר שמעון מאיר'), 'שמעון מאיר');
  assert.equal(normLecturer('ד&quot;ר  שמעון מאיר'.replace('&quot;', '"')), 'שמעון מאיר');
  assert.equal(normLecturer('מר שפירא יובל'), 'שפירא יובל');
});

test('buildDataset dedupes courses, keeps only the target semester, drops dangling links', () => {
  const d = buildDataset(base());
  assert.deepEqual(Object.keys(d.courses).sort(), ['20816', '90903']);
  assert.deepEqual(d.lists[1].courses, ['20816', '90903']);
  const phys = d.courses['90903'];
  assert.deepEqual(phys.groups.map((x) => x.id), ['279090303', '279090303/1']);
  assert.deepEqual(phys.groups[0].linked, ['279090303/1']);
  assert.equal(phys.groups[0].semester, 'א');
  assert.equal(phys.credits, 5);
  assert.equal(phys.offered, true);
  assert.deepEqual(phys.groups[0].meetings[0], { day: 2, start: '12:00', end: '13:50', room: 'r' });
});

test('buildDataset resolves prereq names to ids, keeps unknown names as id:null, filters other departments', () => {
  const d = buildDataset(base());
  assert.deepEqual(d.courses['90903'].prereqs, [{ kind: 'קדם', anyOf: [{ id: null, name: 'קורס הכנה פיזיקה' }] }]);
  assert.deepEqual(d.courses['20816'].prereqs, [{ kind: 'קדם', anyOf: [{ id: '90903', name: 'פיזיקה-מכניקה' }] }]);
});

test('buildDataset attaches exams by lecturer, falls back to course level, ignores other semesters', () => {
  const d = buildDataset(base());
  assert.equal(d.examsPublished, true);
  assert.deepEqual(d.courses['90903'].groups[0].exams, [{ kind: 'בחינה', moed: 1, date: '2027-02-04', time: '09:00' }]);
  assert.deepEqual(d.courses['90903'].groups[1].exams, []); // tutorials carry no exams
  assert.deepEqual(d.courses['20816'].groups[0].exams, [{ kind: 'בחינה', moed: 1, date: '2027-02-10', time: '09:00' }]);
});

test('validate flags a too-small dataset and missing 90903', () => {
  const d = buildDataset(base());
  const { errors } = validate(d);
  assert.ok(errors.some((e) => e.includes('40')));
  delete d.courses['90903'];
  assert.ok(validate(d).errors.some((e) => e.includes('90903')));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/build.test.mjs`
Expected: FAIL. Cannot find module `../scripts/build.mjs`.

- [ ] **Step 3: Write minimal implementation**

`scripts/build.mjs`:
```js
export const normName = (s) => s.replace(/["'׳״]/g, '').replace(/\s+/g, ' ').trim();
export const normLecturer = (s) => normName(s).replace(/^(דר|פרופ|מר|גב|גברת)\.?\s+/, '');

export function buildDataset({ year, startYear, program, semester, department, lists, raw, exams, fetchedAt }) {
  const idByName = new Map();
  for (const l of lists) for (const c of l.courses) idByName.set(normName(c.name), c.id);

  const courses = {};
  for (const l of lists) for (const c of l.courses) {
    if (courses[c.id]) continue;
    const r = raw[c.id] ?? { groups: [], details: null };
    const kept = r.groups.filter((g) => g.meetings.length && g.meetings.every((m) => m.semester === semester));
    const ids = new Set(kept.map((g) => g.id));
    const groups = kept.map(({ detailsArgs, meetings, linked, ...g }) => ({
      ...g,
      semester,
      linked: linked.filter((id) => ids.has(id)),
      meetings: meetings.map(({ semester: _s, ...m }) => m),
      exams: [],
    }));
    courses[c.id] = {
      name: c.name,
      credits: r.details?.credits ?? 0,
      offered: groups.some((g) => g.primary),
      prereqs: (r.details?.prereqs ?? [])
        .filter((p) => !p.population || p.population.includes(department))
        .map((p) => ({ kind: p.kind, anyOf: p.names.map((name) => ({ id: idByName.get(normName(name)) ?? null, name })) })),
      groups,
    };
  }

  const semExams = exams.filter((e) => e.semester === semester);
  const byCourse = Map.groupBy(semExams, (e) => e.courseId);
  for (const [courseId, rows] of byCourse) {
    const prim = courses[courseId]?.groups.filter((g) => g.primary) ?? [];
    const add = (g, row) => {
      for (const m of row.moeds) {
        if (!g.exams.some((e) => e.kind === row.kind && e.moed === m.moed)) g.exams.push({ kind: row.kind, moed: m.moed, date: m.date, time: m.time });
      }
    };
    const unmatched = [];
    for (const row of rows) {
      const hits = prim.filter((g) => normLecturer(g.lecturer) === normLecturer(row.lecturer));
      if (hits.length) hits.forEach((g) => add(g, row)); else unmatched.push(row);
    }
    const bare = prim.filter((g) => g.exams.length === 0);
    for (const row of unmatched) bare.forEach((g) => add(g, row));
  }

  return {
    fetchedAt, year, startYear, program, semester,
    examsPublished: semExams.length > 0,
    lists: lists.map((l) => ({ code: l.code, name: l.name, minCredits: l.minCredits, courses: [...new Set(l.courses.map((c) => c.id))] })),
    courses,
  };
}

export function validate(d) {
  const errors = [], warnings = [];
  const n = Object.keys(d.courses).length;
  if (n < 40) errors.push(`only ${n} courses, expected at least 40`);
  const phys = d.courses['90903'];
  if (!phys) errors.push('course 90903 (פיזיקה-מכניקה) missing');
  else if (phys.groups.filter((g) => g.primary).length < 3) errors.push('course 90903 has fewer than 3 primary groups');
  for (const [id, c] of Object.entries(d.courses)) {
    const linked = new Set(c.groups.flatMap((g) => g.linked));
    for (const g of c.groups) if (!g.primary && !linked.has(g.id)) warnings.push(`${id}: sub-group ${g.id} not linked to any primary`);
    if (d.examsPublished && c.offered && d.lists.some((l) => /חובה/.test(l.name) && l.courses.includes(id))
      && !c.groups.some((g) => g.primary && g.exams.some((e) => e.kind === 'בחינה' && e.moed === 1))) {
      warnings.push(`${id}: mandatory course without a moed-1 exam`);
    }
  }
  return { errors, warnings };
}
```


- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/build.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/build.mjs test/build.test.mjs
git commit -m "feat(scrape): buildDataset (prereq names→ids, exams by lecturer) and validate"
```

---

### Task 5: `scrape.mjs` CLI, then a real run and committed data

**Files:**
- Create: `scripts/scrape.mjs`, `web/data/afeka/2027-1/30-2026.json` (generated)

**Interfaces:**
- Consumes: everything from `scripts/parse.mjs` and `scripts/build.mjs`.
- Produces: the Dataset JSON file, which Tasks 10–12 fetch from `data/afeka/2027-1/30-2026.json` (relative to `web/`).

- [ ] **Step 1: Write the CLI**

`scripts/scrape.mjs`:
```js
#!/usr/bin/env node
// Scrape the public Afeka Yedion into web/data/afeka/{year}-{sem}/{program}-{start}.json.
// Writes nothing if any step or validation fails.
import { writeFile, mkdir } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { parseProgram, parseGroups, parseDetails, parseExams } from './parse.mjs';
import { buildDataset, validate } from './build.mjs';

const BASE = 'https://yedionpub.afeka.ac.il/yedion/fireflyweb.aspx';
const LISTS = { 30: [30001, 30002, 30003, 30004, 30007, 30010, 30031, 30901, 60004] };
const DEPARTMENT = { 30: 'מכנית' };
const SEMESTER_CODE = { 'א': 1, 'ב': 2, 'קיץ': 3 };

const { values: opt } = parseArgs({ options: {
  year: { type: 'string', default: '2027' },
  start: { type: 'string', default: '2026' },
  program: { type: 'string', default: '30' },
  semester: { type: 'string', default: 'א' },
  delay: { type: 'string', default: '1000' },
} });

const cookies = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(query, form) {
  await sleep(Number(opt.delay));
  const res = await fetch(form ? BASE : `${BASE}?${query}`, {
    method: form ? 'POST' : 'GET',
    headers: {
      'User-Agent': 'afeka-scheduler/1.0 (student timetable tool)',
      Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
      ...(form && { 'Content-Type': 'application/x-www-form-urlencoded' }),
    },
    body: form ? new URLSearchParams(form) : undefined,
  });
  for (const c of res.headers.getSetCookie()) {
    const kv = c.split(';')[0];
    const i = kv.indexOf('=');
    cookies.set(kv.slice(0, i), kv.slice(i + 1));
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${query ?? form.PRGNAME}`);
  return res.text();
}

async function main() {
  const program = Number(opt.program);
  if (!LISTS[program]) throw new Error(`no list codes configured for program ${program}`);

  await request('prgname=Enter_Search');
  await request(null, { PRGNAME: 'Enter_Search', ARGUMENTS: '-A,,-A,ChangeYear', ChangeYear: opt.year });

  const lists = [];
  for (const code of LISTS[program]) {
    const p = parseProgram(await request(`prgname=S_SHOW_PROGS&arguments=-N${opt.start},-N${code}`));
    if (!p.courses.length) throw new Error(`list ${code} returned no courses`);
    lists.push({ code, ...p });
    console.log(`list ${code} "${p.name}": ${p.courses.length} courses`);
  }

  const ids = [...new Set(lists.flatMap((l) => l.courses.map((c) => c.id)))];
  const raw = {};
  for (const [i, id] of ids.entries()) {
    const groups = parseGroups(await request(`prgname=S_LOOK_FOR_NOSE&arguments=-N${id}`));
    const args = groups.find((g) => g.primary && g.detailsArgs)?.detailsArgs;
    const details = args ? parseDetails(await request(`prgname=S_CourseDetails&arguments=${args}`)) : null;
    raw[id] = { groups, details };
    console.log(`[${i + 1}/${ids.length}] ${id}: ${groups.length} groups`);
  }

  const exams = parseExams(await request(null, {
    PRGNAME: 'S_EXAMS', ARGUMENTS: 'R1C28,R1C29,R1C30', R1C28: String(program), R1C29: '0', R1C30: '0',
  }));
  console.log(`exams: ${exams.length} rows`);

  const dataset = buildDataset({
    year: Number(opt.year), startYear: Number(opt.start), program, semester: opt.semester,
    department: DEPARTMENT[program], lists, raw, exams, fetchedAt: new Date().toISOString(),
  });
  const { errors, warnings } = validate(dataset);
  warnings.forEach((w) => console.warn('WARN', w));
  if (errors.length) {
    errors.forEach((e) => console.error('ERROR', e));
    process.exit(1);
  }
  const dir = `web/data/afeka/${opt.year}-${SEMESTER_CODE[opt.semester]}`;
  await mkdir(dir, { recursive: true });
  const file = `${dir}/${program}-${opt.start}.json`;
  await writeFile(file, JSON.stringify(dataset, null, 1));
  console.log(`wrote ${file}: ${Object.keys(dataset.courses).length} courses, examsPublished=${dataset.examsPublished}`);
}

main().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
```

- [ ] **Step 2: Run it for real (takes about 4–6 minutes)**

Run: `node scripts/scrape.mjs`
Expected, in this order: 9 `list …` lines with non-zero counts, progress lines for each course, `exams: 0 rows` (until the 2027 exams are published), then `wrote web/data/afeka/2027-1/30-2026.json: N courses, examsPublished=false` with N ≥ 40.
If it prints `ERROR`, the file is **not** written. Fix the cause (usually a parser mismatch: save the failing page as a new fixture, add a failing test, fix, re-run) rather than changing the thresholds.

- [ ] **Step 3: Spot-check the data against the Yedion (manual, 5 groups)**

Run:
```bash
node -e "const d=require('./web/data/afeka/2027-1/30-2026.json');const ids=Object.keys(d.courses);for(let i=0;i<5;i++){const c=d.courses[ids[Math.floor(Math.random()*ids.length)]];const g=c.groups.find(x=>x.primary);console.log(c.name,g?.id,JSON.stringify(g?.meetings))}"
```
For each of the 5 lines, open `https://yedionpub.afeka.ac.il/yedion/fireflyweb.aspx?prgname=S_LOOK_FOR_NOSE&arguments=-N<courseId>` and confirm the day, times and room match. Also confirm that `d.courses['90903'].prereqs` and one course with a `מקביל` prerequisite look right.

- [ ] **Step 4: Commit**

```bash
git add scripts/scrape.mjs web/data/afeka/2027-1/30-2026.json
git commit -m "feat(scrape): scrape CLI and first 2027-A dataset for mech 2026"
```

---

### Task 6: `rules.js`: classify and progress

**Files:**
- Create: `web/rules.js`, `test/fixtures/mini-data.mjs`, `test/rules.test.mjs`

**Interfaces:**
- Consumes: the Dataset (Task 4).
- Produces:
  - `classify(data, state) → { statuses: { [id]: { status: 'done'|'retake'|'available'|'conditional'|'blocked'|'notOffered', reasons: string[], blockedBy?: string[], missingParallel?: string[][] } }, warnings: string[] }`
  - `state = { passed: string[], failed: { [id]: number } }`
  - `progress(data, state) → { earned: number, required: number, ratio: number }`
  - `test/fixtures/mini-data.mjs` exports `mini()`, which returns a fresh small Dataset (it is reused in Tasks 7–8).

- [ ] **Step 1: Create the shared mini dataset**

`test/fixtures/mini-data.mjs`:
```js
// Small synthetic Dataset: A (physics) → B → C chain, P parallel-requires Q, X has an unknown prereq.
const grp = (id, day, start, end, extra = {}) => ({
  id, type: 'סופי-הרצאה+תרגול', primary: true, lecturer: 'L', full: false, semester: 'א',
  linked: [], meetings: [{ day, start, end, room: 'r' }], exams: [], ...extra,
});
const sub = (id, day, start, end) => ({ ...grp(id, day, start, end), type: 'תרגול', primary: false });

export function mini() {
  return {
    fetchedAt: '2026-10-01T00:00:00Z', year: 2027, startYear: 2026, program: 30, semester: 'א', examsPublished: true,
    lists: [
      { code: 30001, name: "קורסי חובה שנה א'", minCredits: 10, courses: ['A', 'Q0'] },
      { code: 30002, name: "קורסי חובה שנה ב'", minCredits: 20, courses: ['B', 'C', 'P', 'Q', 'X', 'N'] },
    ],
    courses: {
      A: { name: 'פיזיקה-מכניקה', credits: 5, offered: true, prereqs: [], groups: [
        grp('A1', 2, '08:00', '09:50', { linked: ['A1/1', 'A1/2'], exams: [{ kind: 'בחינה', moed: 1, date: '2027-02-04', time: '09:00' }] }),
        sub('A1/1', 3, '10:00', '11:50'), sub('A1/2', 4, '10:00', '11:50'),
        grp('A2', 1, '12:00', '13:50', { exams: [{ kind: 'בחינה', moed: 1, date: '2027-02-04', time: '09:00' }] }),
      ] },
      Q0: { name: 'חדו"א 1', credits: 5, offered: true, prereqs: [], groups: [grp('Q01', 5, '08:00', '09:50')] },
      B: { name: 'דינמיקה', credits: 4, offered: true, prereqs: [{ kind: 'קדם', anyOf: [{ id: 'A', name: 'פיזיקה-מכניקה' }] }], groups: [grp('B1', 2, '10:00', '11:50')] },
      C: { name: 'רטט', credits: 3, offered: true, prereqs: [{ kind: 'קדם', anyOf: [{ id: 'B', name: 'דינמיקה' }] }], groups: [grp('C1', 3, '08:00', '09:50')] },
      P: { name: 'תרמו 2', credits: 3, offered: true, prereqs: [{ kind: 'מקביל', anyOf: [{ id: 'Q', name: 'משוואות' }] }], groups: [grp('P1', 1, '08:00', '09:50')] },
      Q: { name: 'משוואות', credits: 4, offered: true, prereqs: [], groups: [
        grp('Q1', 1, '10:00', '11:50', { exams: [{ kind: 'בחינה', moed: 1, date: '2027-02-10', time: '09:00' }] }),
        grp('Q2', 2, '08:30', '10:20', { full: true }),
      ] },
      X: { name: 'קורס עם קדם חיצוני', credits: 2, offered: true, prereqs: [{ kind: 'קדם', anyOf: [{ id: null, name: 'קורס הכנה פיזיקה' }] }], groups: [grp('X1', 4, '14:00', '15:50')] },
      N: { name: 'לא נלמד', credits: 3, offered: false, prereqs: [], groups: [] },
    },
  };
}
```

- [ ] **Step 2: Write the failing tests**

`test/rules.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, progress } from '../web/rules.js';
import { mini } from './fixtures/mini-data.mjs';

const me = { passed: ['Q0'], failed: { A: 1 } }; // example: failed physics

test('failed offered course is retake', () => {
  assert.equal(classify(mini(), me).statuses.A.status, 'retake');
});

test('direct and transitive dependents are blocked with a chain', () => {
  const { statuses } = classify(mini(), me);
  assert.equal(statuses.B.status, 'blocked');
  assert.deepEqual(statuses.B.blockedBy, ['A']);
  assert.match(statuses.B.reasons.join(' '), /פיזיקה-מכניקה \(נכשלת\)/);
  assert.equal(statuses.C.status, 'blocked');
  assert.match(statuses.C.reasons.join(' '), /דינמיקה ← פיזיקה-מכניקה \(נכשלת\)/);
});

test('parallel prerequisite gives conditional with the missing ids', () => {
  const s = classify(mini(), me).statuses.P;
  assert.equal(s.status, 'conditional');
  assert.deepEqual(s.missingParallel, [['Q']]);
});

test('unknown (outside program) prerequisite counts as satisfied', () => {
  const s = classify(mini(), me).statuses.X;
  assert.equal(s.status, 'available');
  assert.match(s.reasons.join(' '), /קורס הכנה פיזיקה/);
});

test('done and notOffered', () => {
  const { statuses } = classify(mini(), me);
  assert.equal(statuses.Q0.status, 'done');
  assert.equal(statuses.N.status, 'notOffered');
});

test('failure warnings follow the regulations', () => {
  assert.deepEqual(classify(mini(), me).warnings, []);
  assert.match(classify(mini(), { passed: [], failed: { A: 1, B: 1, C: 1 } }).warnings.join(), /על תנאי/);
  assert.match(classify(mini(), { passed: [], failed: { A: 2, B: 2 } }).warnings.join(), /הרחקה/);
  assert.match(classify(mini(), { passed: [], failed: { A: 3 } }).warnings.join(), /11\.5\.2/);
});

test('progress counts passed credits of earlier-year mandatory lists', () => {
  // studyYear = 2027 - 2026 + 1 = 2, so only the year-1 list counts: required 10, earned Q0 = 5
  assert.deepEqual(progress(mini(), me), { earned: 5, required: 10, ratio: 0.5 });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test test/rules.test.mjs`
Expected: FAIL. Cannot find module `../web/rules.js`.

- [ ] **Step 4: Write minimal implementation**

`web/rules.js`:
```js
// Afeka regulations engine (תקנון לימודים תואר ראשון, 5.2.2026). Pure: runs in browser and node.
const YEAR_LETTERS = { 'א': 1, 'ב': 2, 'ג': 3, 'ד': 4 };

export function classify(data, state) {
  const passed = new Set(state.passed);
  const failed = state.failed ?? {};
  const statuses = {};
  const satisfied = (p) => p.anyOf.some((a) => a.id === null || passed.has(a.id));
  const outsideNotes = (c) => c.prereqs.flatMap((p) => p.anyOf.filter((a) => a.id === null))
    .map((a) => `קדם מחוץ לתוכנית (${a.name}): מניחים שעברת`);

  for (const [id, c] of Object.entries(data.courses)) {
    if (passed.has(id)) { statuses[id] = { status: 'done', reasons: [] }; continue; }
    if (!c.offered) { statuses[id] = { status: 'notOffered', reasons: [`לא נלמד בסמסטר ${data.semester}`] }; continue; }
    if (failed[id]) { statuses[id] = { status: 'retake', reasons: [`נכשלת, מוצע בסמסטר ${data.semester} (תקנון 11.6.1)`] }; continue; }
    const hard = c.prereqs.filter((p) => p.kind === 'קדם' && !satisfied(p));
    if (hard.length) {
      statuses[id] = { status: 'blocked', reasons: [], blockedBy: hard.map((p) => p.anyOf.find((a) => a.id)?.id ?? null) };
      continue;
    }
    const par = c.prereqs.filter((p) => p.kind === 'מקביל' && !satisfied(p));
    if (par.length) {
      statuses[id] = {
        status: 'conditional',
        reasons: [`רק יחד עם ${par.map((p) => p.anyOf.map((a) => a.name).join(' או ')).join(', ')} (קורס מקביל, תקנון 6.2.3)`, ...outsideNotes(c)],
        missingParallel: par.map((p) => p.anyOf.map((a) => a.id).filter(Boolean)),
      };
      continue;
    }
    statuses[id] = { status: 'available', reasons: outsideNotes(c) };
  }

  const chain = (id, seen = new Set()) => {
    const c = data.courses[id];
    if (!c) return '';
    if (failed[id]) return `${c.name} (נכשלת)`;
    const s = statuses[id];
    if (s?.status === 'blocked' && !seen.has(id)) {
      seen.add(id);
      return `${c.name} ← ${chain(s.blockedBy[0], seen)}`;
    }
    return c.name;
  };
  for (const s of Object.values(statuses)) {
    if (s.status === 'blocked') s.reasons = s.blockedBy.map((b) => `חסום: דורש ${chain(b)} (תקנון 7.4)`);
  }

  const counts = Object.values(failed);
  const total = counts.reduce((a, b) => a + b, 0);
  const warnings = [];
  if (counts.some((n) => n >= 3)) warnings.push('3 כישלונות באותו קורס: הרחקה (תקנון 11.5.2)');
  if (total >= 4) warnings.push('4 כישלונות מצטברים ומעלה: הרחקה (תקנון 11.5.1)');
  else if (total >= 3) warnings.push('3 כישלונות מצטברים: מעמד "על תנאי" (תקנון 11.4.1)');
  return { statuses, warnings };
}

export function progress(data, state) {
  const passed = new Set(state.passed);
  const studyYear = data.year - data.startYear + 1;
  const lists = data.lists.filter((l) => {
    const m = l.name.match(/חובה שנה (\S)'/);
    return m && YEAR_LETTERS[m[1]] < studyYear;
  });
  const required = lists.reduce((a, l) => a + l.minCredits, 0);
  const earned = lists.flatMap((l) => l.courses).filter((id) => passed.has(id))
    .reduce((a, id) => a + (data.courses[id]?.credits ?? 0), 0);
  return { earned, required, ratio: required ? earned / required : 1 };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/rules.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add web/rules.js test/rules.test.mjs test/fixtures/mini-data.mjs
git commit -m "feat(rules): classify courses per Afeka regulations, progress meter"
```

---

### Task 7: Solver foundations: masks, options, forbidden mask, unlocks

**Files:**
- Create: `web/solver-core.js`, `test/solver.test.mjs`

**Interfaces:**
- Consumes: the Dataset. `mini()` from Task 6.
- Produces (exports of `web/solver-core.js`):
  - `toMin('HH:MM') → number`
  - `meetingsMask(meetings) → number[7]`: index = day 1..6. 32 half-hour slots per day, 07:00–23:00.
  - `overlaps(a, b) → boolean`
  - `forbiddenMask(constraints) → number[7]`
  - `buildOptions(course, { pins, includeFull, forbidden }) → [{ groups: string[], mask, meetings: [{day,start,end,room,group}], exams: string[] /* moed-1 בחינה dates */, allExams: Exam[] }]`
  - `unlockCounts(data) → { [id]: number }`: transitive dependents.
  - `constraints = { dayOff: number[], dayOffHard: boolean, notBefore: 'HH:MM'|'', notAfter: 'HH:MM'|'', windowHard: boolean, maxCredits: number|null, examsSameDay: 'forbid'|'allow', includeFull: boolean }`

- [ ] **Step 1: Write the failing tests**

`test/solver.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meetingsMask, overlaps, buildOptions, forbiddenMask, unlockCounts } from '../web/solver-core.js';
import { mini } from './fixtures/mini-data.mjs';

test('masks: 08:00-09:50 and 10:00-11:50 do not overlap; 09:30 start does', () => {
  const a = meetingsMask([{ day: 2, start: '08:00', end: '09:50' }]);
  assert.equal(overlaps(a, meetingsMask([{ day: 2, start: '10:00', end: '11:50' }])), false);
  assert.equal(overlaps(a, meetingsMask([{ day: 2, start: '09:30', end: '10:20' }])), true);
  assert.equal(overlaps(a, meetingsMask([{ day: 3, start: '08:00', end: '09:50' }])), false);
});

test('masks clamp meetings outside 07:00-23:00 and ignore missing days', () => {
  const m = meetingsMask([{ day: 1, start: '06:00', end: '23:30' }, { day: null, start: '08:00', end: '09:00' }]);
  assert.equal(m[1] >>> 0, 0xffffffff);
  assert.deepEqual(m.slice(2), [0, 0, 0, 0, 0]);
});

test('buildOptions pairs each primary with one linked tutorial', () => {
  const opts = buildOptions(mini().courses.A);
  assert.deepEqual(opts.map((o) => o.groups), [['A1', 'A1/1'], ['A1', 'A1/2'], ['A2']]);
  assert.deepEqual(opts[0].exams, ['2027-02-04']);
  assert.equal(opts[0].meetings.find((m) => m.group === 'A1/1').day, 3);
});

test('primary with no linked sub-groups still yields an option', () => {
  assert.deepEqual(buildOptions(mini().courses.B).map((o) => o.groups), [['B1']]);
});

test('full groups are skipped unless pinned or includeFull', () => {
  const Q = mini().courses.Q;
  assert.deepEqual(buildOptions(Q).map((o) => o.groups), [['Q1']]);
  assert.deepEqual(buildOptions(Q, { includeFull: true }).map((o) => o.groups), [['Q1'], ['Q2']]);
  assert.deepEqual(buildOptions(Q, { pins: ['Q2'] }).map((o) => o.groups), [['Q2']]);
});

test('forbidden mask removes options (hard day off / window)', () => {
  const A = mini().courses.A;
  const f = forbiddenMask({ dayOff: [1], dayOffHard: true });
  assert.deepEqual(buildOptions(A, { forbidden: f }).map((o) => o.groups), [['A1', 'A1/1'], ['A1', 'A1/2']]);
  const w = forbiddenMask({ notBefore: '10:00', windowHard: true });
  assert.deepEqual(buildOptions(A, { forbidden: w }).map((o) => o.groups), [['A2']]);
});

test('unlockCounts is transitive', () => {
  const u = unlockCounts(mini());
  assert.equal(u.A, 2); // B, C
  assert.equal(u.B, 1);
  assert.equal(u.C, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/solver.test.mjs`
Expected: FAIL. Cannot find module `../web/solver-core.js`.

- [ ] **Step 3: Write minimal implementation**

`web/solver-core.js`:
```js
// Schedule search core. Pure ES module: used by node tests and by solver-worker.js.
const SLOT_START = 7 * 60; // 07:00
const SLOT = 30;           // minutes per bit, 32 bits = 07:00-23:00
const DAYS = 7;            // index 1..6 = Sunday..Friday

export const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

// ponytail: meetings outside 07:00-23:00 are clamped to the edge slots; widen the window if Afeka ever schedules there.
export function meetingsMask(meetings) {
  const mask = new Array(DAYS).fill(0);
  for (const m of meetings) {
    if (!m.day) continue;
    const a = Math.max(0, Math.floor((toMin(m.start) - SLOT_START) / SLOT));
    const b = Math.min(32, Math.ceil((toMin(m.end) - SLOT_START) / SLOT));
    for (let s = a; s < b; s++) mask[m.day] |= 1 << s;
  }
  return mask;
}

export const overlaps = (a, b) => a.some((v, d) => (v & b[d]) !== 0);
export const merge = (a, b) => a.map((v, d) => v | b[d]);

export function forbiddenMask(c = {}) {
  const m = new Array(DAYS).fill(0);
  const span = (d, from, to) => meetingsMask([{ day: d, start: from, end: to }])[d];
  for (let d = 1; d <= 6; d++) {
    if (c.dayOffHard && c.dayOff?.includes(d)) m[d] = ~0;
    if (c.windowHard && c.notBefore) m[d] |= span(d, '07:00', c.notBefore);
    if (c.windowHard && c.notAfter) m[d] |= span(d, c.notAfter, '23:00');
  }
  return m;
}

export function buildOptions(course, { pins = [], includeFull = false, forbidden = null } = {}) {
  const byId = new Map(course.groups.map((g) => [g.id, g]));
  const options = [];
  for (const p of course.groups.filter((g) => g.primary)) {
    const subsByType = {};
    for (const id of p.linked) {
      const s = byId.get(id);
      if (s) (subsByType[s.type] ??= []).push(s);
    }
    let combos = [[p]];
    for (const subs of Object.values(subsByType)) combos = combos.flatMap((c) => subs.map((s) => [...c, s]));
    for (const groups of combos) {
      const ids = groups.map((g) => g.id);
      if (!includeFull && groups.some((g) => g.full) && !pins.some((id) => ids.includes(id))) continue;
      const meetings = groups.flatMap((g) => g.meetings.map((m) => ({ ...m, group: g.id })));
      const mask = meetingsMask(meetings);
      if (forbidden && overlaps(mask, forbidden)) continue;
      options.push({
        groups: ids, mask, meetings,
        exams: p.exams.filter((e) => e.kind === 'בחינה' && e.moed === 1).map((e) => e.date),
        allExams: p.exams,
      });
    }
  }
  const coursePins = pins.filter((id) => byId.has(id));
  return coursePins.length ? options.filter((o) => coursePins.every((id) => o.groups.includes(id))) : options;
}

export function unlockCounts(data) {
  const rev = {};
  for (const [id, c] of Object.entries(data.courses)) {
    for (const p of c.prereqs) for (const a of p.anyOf) if (a.id) (rev[a.id] ??= []).push(id);
  }
  const out = {};
  for (const id of Object.keys(data.courses)) {
    const seen = new Set();
    const stack = [...(rev[id] ?? [])];
    while (stack.length) {
      const x = stack.pop();
      if (seen.has(x)) continue;
      seen.add(x);
      stack.push(...(rev[x] ?? []));
    }
    out[id] = seen.size;
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/solver.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add web/solver-core.js test/solver.test.mjs
git commit -m "feat(solver): bitmask week, options per course, forbidden mask, unlock counts"
```

---

### Task 8: Solver search, scoring, explanation, and diagnosis

**Files:**
- Modify: `web/solver-core.js` (append)
- Create: `web/solver-worker.js`
- Test: `test/solver.test.mjs` (append)

**Interfaces:**
- Consumes: everything from Task 7. `classify` statuses (Task 6) for conditional courses.
- Produces:
  - `search({ data, courses: [{ id, mode: 'must'|'optional' }], statuses, pins, constraints, weights, friends, topK = 10, timeLimitMs = 3000 }) → { results: Result[], partial: boolean, diagnosis: string[] }`
  - `Result = { score, breakdown: { friends, progress, freeDays, compact, timeWindow, examSpread }, groups: string[], courses: string[], explanation: string, exams: [{ course, kind, moed, date, time }] }`
  - `weights = { friends, progress, freeDays, compact, timeWindow, examSpread }` (numbers ≥ 0)
  - `friends = [{ name, groups: string[], weight: number, active: boolean }]`
  - Worker protocol: `postMessage(searchInput)` → `onmessage(e => e.data /* search() return value */)`.

- [ ] **Step 1: Write the failing tests**

Append to `test/solver.test.mjs`:
```js
import { search } from '../web/solver-core.js';
import { classify } from '../web/rules.js';
import { readFileSync, existsSync } from 'node:fs';

const W0 = { friends: 0, progress: 0, freeDays: 0, compact: 0, timeWindow: 0, examSpread: 0 };
const me = { passed: ['Q0'], failed: { A: 1 } };
const run = (over = {}) => {
  const data = over.data ?? mini();
  return search({ data, statuses: classify(data, me).statuses, weights: W0, friends: [], constraints: {}, topK: 1000, ...over });
};

// Independent brute force: enumerate option products, reject overlaps by interval comparison.
function brute(data, courses) {
  const toM = (t) => +t.slice(0, 2) * 60 + +t.slice(3);
  const clash = (a, b) => a.meetings.some((x) => b.meetings.some((y) => x.day === y.day && toM(x.start) < toM(y.end) && toM(y.start) < toM(x.end)));
  let sets = [[]];
  for (const { id, mode } of courses) {
    const opts = buildOptions(data.courses[id]);
    const next = [];
    for (const s of sets) {
      if (mode === 'optional') next.push(s);
      for (const o of opts) if (!s.some((x) => clash(x, o))) next.push([...s, o]);
    }
    sets = next;
  }
  return sets.filter((s) => s.length).map((s) => s.flatMap((o) => o.groups).sort().join(',')).sort();
}

test('search finds exactly the valid combinations (vs brute force)', () => {
  const courses = [{ id: 'A', mode: 'must' }, { id: 'Q', mode: 'optional' }, { id: 'X', mode: 'must' }];
  const got = run({ courses, constraints: { examsSameDay: 'allow' } }).results.map((r) => [...r.groups].sort().join(',')).sort();
  assert.deepEqual(got, brute(mini(), courses));
});

test('exam same-day rule removes clashing exams when published', () => {
  const data = mini();
  data.courses.Q.groups[0].exams = [{ kind: 'בחינה', moed: 1, date: '2027-02-04', time: '09:00' }];
  const r = run({ data, courses: [{ id: 'A', mode: 'must' }, { id: 'Q', mode: 'must' }] });
  assert.equal(r.results.length, 0);
  assert.ok(r.diagnosis.length > 0);
});

test('conditional course only appears with its parallel course', () => {
  const r = run({ courses: [{ id: 'P', mode: 'optional' }, { id: 'Q', mode: 'optional' }], constraints: { examsSameDay: 'allow' } });
  for (const res of r.results) if (res.courses.includes('P')) assert.ok(res.courses.includes('Q'));
  assert.ok(r.results.some((res) => res.courses.includes('P')));
});

test('friends metric rewards shared groups and ignores unknown ids', () => {
  const friends = [{ name: 'דני', groups: ['A2', 'NOPE-123'], weight: 1, active: true }];
  const r = run({ courses: [{ id: 'A', mode: 'must' }], friends, weights: { ...W0, friends: 1 }, topK: 3 });
  assert.deepEqual(r.results[0].groups, ['A2']);
  assert.equal(r.results[0].breakdown.friends, 1);
  assert.match(r.results[0].explanation, /1 קורסים עם דני/);
});

test('freeDays and pins', () => {
  const r = run({ courses: [{ id: 'A', mode: 'must' }], weights: { ...W0, freeDays: 1 }, topK: 1 });
  assert.deepEqual(r.results[0].groups, ['A2']); // 1 busy day beats 2
  const p = run({ courses: [{ id: 'A', mode: 'must' }], pins: ['A1/2'] });
  assert.deepEqual(p.results.map((x) => x.groups), [['A1', 'A1/2']]);
});

test('diagnosis names a course with no option left', () => {
  const r = run({ courses: [{ id: 'B', mode: 'must' }], constraints: { dayOff: [2], dayOffHard: true } });
  assert.equal(r.results.length, 0);
  assert.match(r.diagnosis[0], /דינמיקה/);
});

const REAL = new URL('../web/data/afeka/2027-1/30-2026.json', import.meta.url);
test('real data: all year-2 available courses solve in < 1s with no overlaps', { skip: !existsSync(REAL) }, () => {
  const data = JSON.parse(readFileSync(REAL, 'utf8'));
  const y1 = data.lists.find((l) => l.name.includes("שנה א'")).courses;
  const state = { passed: y1.filter((id) => id !== '90903'), failed: { 90903: 1 } };
  const { statuses } = classify(data, state);
  const y2 = data.lists.find((l) => l.name.includes("שנה ב'")).courses;
  const courses = [{ id: '90903', mode: 'must' }, ...y2.filter((id) => ['available', 'conditional'].includes(statuses[id]?.status)).map((id) => ({ id, mode: 'optional' }))];
  const t = Date.now();
  const r = search({ data, courses, statuses, weights: { ...W0, progress: 1, compact: 1 }, friends: [], constraints: {} });
  assert.ok(Date.now() - t < 1000, `took ${Date.now() - t}ms`);
  assert.ok(r.results.length > 0);
  for (const res of r.results) {
    const ms = res.groups.flatMap((gid) => Object.values(data.courses).flatMap((c) => c.groups).find((g) => g.id === gid).meetings);
    const toM = (t) => +t.slice(0, 2) * 60 + +t.slice(3);
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
      const [a, b] = [ms[i], ms[j]];
      assert.ok(!(a.day === b.day && toM(a.start) < toM(b.end) && toM(b.start) < toM(a.end)), 'overlap in result');
    }
    assert.ok(res.courses.includes('90903'));
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/solver.test.mjs`
Expected: FAIL. `search` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `web/solver-core.js`:
```js
const DAY_NAMES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו'];
const dur = (m) => toMin(m.end) - toMin(m.start);

function metrics(sel, ctx) {
  const meetings = sel.flatMap((o) => o.meetings);
  const total = meetings.reduce((a, m) => a + dur(m), 0) || 1;

  let fw = 0, fs = 0;
  const shared = {};
  for (const f of ctx.friends) {
    const set = new Set(f.groups);
    const s = meetings.filter((m) => set.has(m.group)).reduce((a, m) => a + dur(m), 0);
    fw += f.weight;
    fs += f.weight * (s / total);
    shared[f.name] = sel.filter((o) => o.groups.some((g) => set.has(g))).length;
  }

  const value = sel.reduce((a, o) => a + ctx.value[o.course], 0);
  const busy = new Set(meetings.map((m) => m.day));
  const freeDays = [1, 2, 3, 4, 5].filter((d) => !busy.has(d));

  let gapMin = 0;
  for (const d of busy) {
    const spans = meetings.filter((m) => m.day === d).map((m) => [toMin(m.start), toMin(m.end)]).sort((a, b) => a[0] - b[0]);
    let end = spans[0][1];
    for (const [s, e] of spans.slice(1)) { if (s > end) gapMin += s - end; end = Math.max(end, e); }
  }

  const c = ctx.constraints;
  let outside = 0;
  for (const m of meetings) {
    const s = toMin(m.start), e = toMin(m.end);
    if (c.dayOff?.includes(m.day)) { outside += e - s; continue; }
    if (c.notBefore) outside += Math.max(0, Math.min(e, toMin(c.notBefore)) - s);
    if (c.notAfter) outside += Math.max(0, e - Math.max(s, toMin(c.notAfter)));
  }

  const dates = sel.flatMap((o) => o.exams).sort();
  let minGap = null;
  for (let i = 1; i < dates.length; i++) {
    const g = (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 864e5;
    minGap = minGap === null ? g : Math.min(minGap, g);
  }

  return {
    m: {
      friends: fw ? fs / fw : 0,
      progress: value / ctx.maxValue,
      freeDays: freeDays.length / 5,
      compact: 1 - Math.min(gapMin / 600, 1),
      timeWindow: 1 - Math.min(outside / 600, 1),
      examSpread: ctx.examsPublished && minGap !== null ? Math.min(minGap, 7) / 7 : 0,
    },
    info: { shared, freeDays, gapMin, minGap },
  };
}

function explain(info) {
  const parts = Object.entries(info.shared).filter(([, n]) => n).map(([name, n]) => `${n} קורסים עם ${name}`);
  if (info.freeDays.length) parts.push(`${info.freeDays.map((d) => `יום ${DAY_NAMES[d]}'`).join(', ')} פנוי`);
  parts.push(info.gapMin ? `חלונות: ${Math.round(info.gapMin / 6) / 10} ש'` : 'בלי חלונות');
  if (info.minGap !== null) parts.push(`לפחות ${info.minGap} ימים בין בחינות`);
  return parts.join(' · ');
}

function diagnose(items, data) {
  const name = (id) => data.courses[id].name;
  const out = [];
  for (const it of items) if (it.mode === 'must' && !it.options.length) out.push(`${name(it.id)}: אין קבוצה שמתאימה לאילוצים (חסימות אישיות, קבוצות מלאות או נעיצה)`);
  const must = items.filter((x) => x.mode === 'must' && x.options.length);
  for (let i = 0; i < must.length; i++) for (let j = i + 1; j < must.length; j++) {
    if (must[i].options.every((a) => must[j].options.every((b) => overlaps(a.mask, b.mask)))) {
      out.push(`${name(must[i].id)} ו-${name(must[j].id)} מתנגשים בכל צירוף אפשרי`);
    }
  }
  if (!out.length) out.push('אין מערכת שעומדת בכל האילוצים יחד (בחינות באותו יום, תקרת נ"ז או קורס מקביל). נסה לרכך אילוץ.');
  return out;
}

export function search({ data, courses, statuses = {}, pins = [], constraints = {}, weights, friends = [], topK = 10, timeLimitMs = 3000 }) {
  const forbidden = forbiddenMask(constraints);
  const unlocks = unlockCounts(data);
  const value = {};
  let maxValue = 0;
  const items = courses.map(({ id, mode }) => {
    const c = data.courses[id];
    value[id] = c.credits * (1 + 0.25 * (unlocks[id] ?? 0));
    maxValue += value[id];
    const options = buildOptions(c, { pins, includeFull: constraints.includeFull, forbidden }).map((o) => ({ ...o, course: id }));
    return { id, mode, credits: c.credits, options };
  }).sort((a, b) => a.options.length - b.options.length);

  const ctx = { friends: friends.filter((f) => f.active !== false), value, maxValue: maxValue || 1, constraints, examsPublished: data.examsPublished };
  const noExamClash = data.examsPublished && constraints.examsSameDay !== 'allow';
  const conditional = courses.filter(({ id }) => statuses[id]?.status === 'conditional').map(({ id }) => ({ id, needs: statuses[id].missingParallel }));
  const top = [];
  const sel = [];
  const deadline = Date.now() + timeLimitMs;
  let nodes = 0, partial = false;

  function leaf() {
    if (!sel.length) return;
    const chosen = new Set(sel.map((o) => o.course));
    for (const k of conditional) if (chosen.has(k.id) && !k.needs.every((anyOf) => anyOf.some((x) => chosen.has(x)))) return;
    const { m, info } = metrics(sel, ctx);
    const score = Object.entries(weights).reduce((a, [k, w]) => a + w * (m[k] ?? 0), 0);
    if (top.length === topK && score <= top[top.length - 1].score) return;
    top.push({
      score, breakdown: m, groups: sel.flatMap((o) => o.groups), courses: [...chosen], explanation: explain(info),
      exams: sel.flatMap((o) => o.allExams.map((e) => ({ course: o.course, ...e }))),
    });
    top.sort((a, b) => b.score - a.score);
    if (top.length > topK) top.pop();
  }

  function dfs(i, mask, credits, examDates) {
    if (partial) return;
    if (++nodes % 1000 === 0 && Date.now() > deadline) { partial = true; return; }
    if (i === items.length) return leaf();
    const it = items[i];
    for (const o of it.options) {
      if (overlaps(mask, o.mask)) continue;
      if (constraints.maxCredits && credits + it.credits > constraints.maxCredits) continue;
      if (noExamClash && o.exams.some((d) => examDates.has(d))) continue;
      sel.push(o);
      dfs(i + 1, merge(mask, o.mask), credits + it.credits, noExamClash ? new Set([...examDates, ...o.exams]) : examDates);
      sel.pop();
    }
    if (it.mode === 'optional') dfs(i + 1, mask, credits, examDates);
  }

  dfs(0, new Array(DAYS).fill(0), 0, new Set());
  return { results: top, partial, diagnosis: top.length ? [] : diagnose(items, data) };
}
```

`web/solver-worker.js`:
```js
import { search } from './solver-core.js';

self.onmessage = (e) => self.postMessage(search(e.data));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/solver.test.mjs`
Expected: PASS (14 tests). The real-data test runs if Task 5's file exists and must finish in under 1000 ms. If it's slower, check that `items` are sorted by option count before optimizing anything else.

- [ ] **Step 5: Commit**

```bash
git add web/solver-core.js web/solver-worker.js test/solver.test.mjs
git commit -m "feat(solver): backtracking search, weighted metrics, explanations, diagnosis, worker"
```

---

### Task 9: `share.js`: friend and backup links

**Files:**
- Create: `web/share.js`, `test/share.test.mjs`

**Interfaces:**
- Produces:
  - `encode(obj) → Promise<string>` (base64url of deflate(JSON))
  - `decode(str) → Promise<object>`
  - `friendPayload(state, groups) → { v: 1, year, semester, program, name, groups }`
  - `friendLink(base, state, groups) → Promise<string>` (`${base}#f=…`)
  - `backupLink(base, state) → Promise<string>` (`${base}#b=…`)
  - `readHash(hash, { year, semester }) → Promise<null | { error: string } | { type: 'friend'|'backup', payload }>`

- [ ] **Step 1: Write the failing tests**

`test/share.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode, friendPayload, friendLink, backupLink, readHash } from '../web/share.js';

const state = { v: 1, year: 2027, semester: 'א', program: 30, startYear: 2026, name: 'דולב',
  passed: ['90901'], failed: { 90903: 1 }, choices: { 90903: 'must' }, friends: [], pins: [], weights: {}, constraints: {} };

test('encode/decode round-trips Hebrew JSON', async () => {
  const obj = { a: 'שלום', n: [1, 2, 3] };
  assert.deepEqual(await decode(await encode(obj)), obj);
});

test('friend payload carries no personal academic state', () => {
  const p = friendPayload(state, ['279090303', '279090303/1']);
  assert.deepEqual(Object.keys(p).sort(), ['groups', 'name', 'program', 'semester', 'v', 'year']);
});

test('readHash reads friend and backup links', async () => {
  const f = await friendLink('https://x.test/', state, ['G1']);
  const r = await readHash(f.slice(f.indexOf('#')), { year: 2027, semester: 'א' });
  assert.equal(r.type, 'friend');
  assert.deepEqual(r.payload.groups, ['G1']);
  const b = await backupLink('https://x.test/', state);
  const rb = await readHash(b.slice(b.indexOf('#')), { year: 2027, semester: 'א' });
  assert.equal(rb.type, 'backup');
  assert.deepEqual(rb.payload.failed, { 90903: 1 });
});

test('readHash rejects broken, foreign-semester and empty hashes', async () => {
  assert.equal(await readHash('', { year: 2027, semester: 'א' }), null);
  assert.ok((await readHash('#f=@@@', { year: 2027, semester: 'א' })).error);
  const other = await friendLink('https://x.test/', { ...state, semester: 'ב' }, ['G1']);
  assert.match((await readHash(other.slice(other.indexOf('#')), { year: 2027, semester: 'א' })).error, /סמסטר אחר/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/share.test.mjs`
Expected: FAIL. Cannot find module `../web/share.js`.

- [ ] **Step 3: Write minimal implementation**

`web/share.js`:
```js
// State <-> URL hash. Friend links carry only name + group ids (privacy); backups carry everything.
const toB64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

export const encode = async (obj) => toB64url(await pipe(new TextEncoder().encode(JSON.stringify(obj)), new CompressionStream('deflate')));
export const decode = async (s) => JSON.parse(new TextDecoder().decode(await pipe(fromB64url(s), new DecompressionStream('deflate'))));

export const friendPayload = (state, groups) =>
  ({ v: 1, year: state.year, semester: state.semester, program: state.program, name: state.name, groups });

export const friendLink = async (base, state, groups) => `${base}#f=${await encode(friendPayload(state, groups))}`;
export const backupLink = async (base, state) => `${base}#b=${await encode({ ...state, v: 1 })}`;

export async function readHash(hash, { year, semester }) {
  const m = hash.match(/^#([fb])=(.+)$/);
  if (!m) return null;
  let payload;
  try { payload = await decode(m[2]); } catch { return { error: 'הקישור פגום' }; }
  if (payload?.v !== 1) return { error: 'גרסת קישור לא נתמכת' };
  if (payload.year !== year || payload.semester !== semester) return { error: `הקישור שייך לסמסטר אחר (${payload.year} ${payload.semester})` };
  return { type: m[1] === 'f' ? 'friend' : 'backup', payload };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/share.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/share.js test/share.test.mjs
git commit -m "feat(share): compressed friend/backup links in URL hash"
```

---

### Task 10: UI shell, state, and tabs 1–2 (my status, what to take)

**Files:**
- Create: `web/index.html`, `web/app.js`, `test/app.test.mjs`

**Interfaces:**
- Consumes: `classify`, `progress` (Task 6), `readHash` and `backupLink` (Task 9), the Dataset at `data/afeka/{year}-{semCode}/{program}-{startYear}.json`.
- Produces:
  - `esc(s)` exported from `web/app.js`, used for **every** string interpolated into HTML.
  - The app state saved under localStorage key `afeka-sched-v1`:
    ```
    { v:1, year, semester, program, startYear, name,
      passed: string[]|null, failed: {id:n}, choices: {id:'must'|'optional'|'no'},
      friends: [{name, groups, weight, active}], pins: string[], weights: {...}, constraints: {...} }
    ```
  - DOM sections `#status`, `#courses`, `#friends`, `#results`, and the render hooks `renderFriends()` and `renderResults()` (stubs here, filled in Task 11).

- [ ] **Step 1: Write the failing test (the only unit-tested UI piece)**

`test/app.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc } from '../web/app.js';

test('esc neutralises HTML from untrusted friend links', () => {
  assert.equal(esc('<img src=x onerror=alert(1)>"\''), '&lt;img src=x onerror=alert(1)&gt;&quot;&#39;');
  assert.equal(esc(5), '5');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/app.test.mjs`
Expected: FAIL. Cannot find module `../web/app.js`.

- [ ] **Step 3: Write `web/index.html`**

```html
<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>בונה מערכת אפקה</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@400;500;600;700&display=swap');
/* Tokens: design-system/afeka-scheduler/pages/app.md */
:root {
  --color-primary:#0D9488; --color-on-primary:#FFFFFF; --color-accent:#EA580C; --color-on-accent:#000000;
  --color-background:#F0FDFA; --color-foreground:#134E4A; --color-card:#FFFFFF; --color-muted:#E8F1F4;
  --color-muted-foreground:#475569; --color-border:#99F6E4; --color-destructive:#DC2626; --color-warning:#B45309;
  --color-success:#15803D; --color-ring:#0D9488; --color-friend:#D97706; --radius:10px;
  --font:"Noto Sans Hebrew", system-ui, "Segoe UI", Arial, sans-serif;
  --c0:#0D9488; --c1:#2563EB; --c2:#9333EA; --c3:#DB2777; --c4:#CA8A04; --c5:#16A34A; --c6:#EA580C; --c7:#0891B2;
}
@media (prefers-color-scheme: dark) { :root {
  --color-background:#0B1716; --color-foreground:#E6FFFB; --color-card:#11211F; --color-muted:#1A2E2B;
  --color-muted-foreground:#A7C4C0; --color-border:#1F4D47; --color-primary:#2DD4BF; --color-on-primary:#042F2E;
  --color-destructive:#F87171; --color-warning:#FBBF24; --color-success:#4ADE80; --color-friend:#FBBF24; --color-ring:#2DD4BF;
} }
* { box-sizing:border-box; }
body { margin:0; font:16px/1.5 var(--font); background:var(--color-background); color:var(--color-foreground); }
header, nav, main { max-width:1040px; margin:auto; padding:8px 16px; }
h1 { font-size:1.4rem; font-weight:700; margin:8px 0 0; }
.note { color:var(--color-muted-foreground); font-size:.875rem; margin:2px 0; }
.warn { color:var(--color-warning); } .bad { color:var(--color-destructive); } .ok { color:var(--color-success); }
nav { display:flex; gap:8px; flex-wrap:wrap; position:sticky; top:0; z-index:2; background:var(--color-background); border-bottom:1px solid var(--color-border); }
nav button { min-height:44px; border:0; border-bottom:3px solid transparent; border-radius:0; background:none; color:var(--color-foreground); padding:8px 12px; cursor:pointer; font:inherit; transition:border-color .2s, background-color .2s; }
nav button:hover { background:var(--color-muted); }
nav button[aria-selected="true"] { border-bottom-color:var(--color-primary); font-weight:600; }
.table-wrap { overflow-x:auto; }
table { width:100%; border-collapse:collapse; } td, th { padding:6px 8px; border-bottom:1px solid var(--color-muted); text-align:start; vertical-align:top; }
select, input, button, textarea { font:inherit; color:inherit; background:var(--color-card); border:1px solid var(--color-border); border-radius:8px; padding:6px 8px; min-height:44px; }
input[type=checkbox] { min-height:auto; width:20px; height:20px; accent-color:var(--color-primary); }
input[type=range] { accent-color:var(--color-primary); }
button { cursor:pointer; transition:background-color .2s, border-color .2s; } button:hover { background:var(--color-muted); }
button.primary { background:var(--color-accent); color:var(--color-on-accent); border-color:var(--color-accent); font-weight:600; padding:8px 18px; }
button.primary:hover { filter:brightness(1.08); } button:disabled { opacity:.6; cursor:progress; }
:focus-visible { outline:3px solid var(--color-ring); outline-offset:2px; }
.badge { display:inline-block; font-size:.8125rem; font-weight:600; padding:1px 8px; border-radius:999px; border:1px solid currentColor; white-space:nowrap; }
.card { background:var(--color-card); border:1px solid var(--color-border); border-radius:var(--radius); padding:12px 14px; margin:12px 0; }
.bar { height:8px; background:var(--color-muted); border-radius:4px; overflow:hidden; } .bar > i { display:block; height:100%; background:var(--color-primary); }
.grid2 { display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:8px 16px; align-items:center; }
.icon { width:16px; height:16px; vertical-align:-3px; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
.week { display:grid; grid-template-columns:44px repeat(6, 1fr); grid-template-rows:24px repeat(32, 14px); font-size:.75rem; border:1px solid var(--color-border); border-radius:8px; overflow:hidden; background:var(--color-card); }
.week .h { text-align:center; font-weight:600; border-bottom:1px solid var(--color-border); }
.week .t { color:var(--color-muted-foreground); font-size:11px; padding-inline-start:2px; border-top:1px dashed var(--color-muted); }
.block { all:unset; box-sizing:border-box; margin:1px; padding:2px 4px; border-radius:6px; overflow:hidden; cursor:pointer; line-height:1.25;
  background:color-mix(in srgb, var(--cc) 16%, var(--color-card)); border-inline-start:3px solid var(--cc); transition:filter .2s; }
.block:hover { filter:brightness(.96); } .block:focus-visible { outline:3px solid var(--color-ring); }
.block.friend { outline:2px dashed var(--color-friend); outline-offset:-2px; } .block[aria-pressed="true"] { outline:2px solid var(--color-primary); outline-offset:-2px; }
@media (max-width:600px) { .week { font-size:.6875rem; grid-template-columns:30px repeat(6, 1fr); grid-template-rows:24px repeat(32, 12px); } }
@media (prefers-reduced-motion: reduce) { * { transition:none !important; } }
</style>
</head>
<body>
<header>
  <h1>בונה מערכת אפקה</h1>
  <p id="meta" class="note"></p>
  <p class="note">כלי עזר בלבד. ההרשמה באפקה-נט היא הקובעת.</p>
</header>
<nav id="tabs" role="tablist">
  <button role="tab" data-tab="status" aria-selected="true">1. המצב שלי</button>
  <button role="tab" data-tab="courses">2. מה לומדים</button>
  <button role="tab" data-tab="friends">3. חברים</button>
  <button role="tab" data-tab="results">4. תוצאות</button>
</nav>
<main>
  <section id="status"></section>
  <section id="courses" hidden></section>
  <section id="friends" hidden></section>
  <section id="results" hidden></section>
</main>
<script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 4: Write `web/app.js` (shell + tabs 1–2)**

```js
import { classify, progress } from './rules.js';
import { readHash, backupLink } from './share.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const KEY = 'afeka-sched-v1';
const SEM_CODE = { 'א': 1, 'ב': 2, 'קיץ': 3 };
const STATUS_LABEL = { done: 'עברתי', retake: 'חזרה (חובה)', available: 'זמין', conditional: 'זמין בתנאי', blocked: 'חסום', notOffered: 'לא נלמד' };
const STATUS_CLASS = { retake: 'warn', available: 'ok', conditional: 'warn', blocked: 'bad', notOffered: '' };
const DEFAULT = {
  v: 1, year: 2027, semester: 'א', program: 30, startYear: 2026, name: '',
  passed: null, failed: {}, choices: {}, friends: [], pins: [],
  weights: { friends: 3, progress: 2, freeDays: 1, compact: 1, timeWindow: 1, examSpread: 1 },
  constraints: { dayOff: [], dayOffHard: false, notBefore: '', notAfter: '', windowHard: false, maxCredits: null, examsSameDay: 'forbid', includeFull: false },
};

function load() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY)); } catch { /* storage unavailable */ }
  return { ...structuredClone(DEFAULT), ...saved,
    weights: { ...DEFAULT.weights, ...saved?.weights }, constraints: { ...DEFAULT.constraints, ...saved?.constraints } };
}
export const app = { state: null, data: null, cls: null, friendLanding: null };
export function save() { try { localStorage.setItem(KEY, JSON.stringify(app.state)); } catch { /* storage unavailable */ } }
const $ = (id) => document.getElementById(id);
const dataPath = (s) => `data/afeka/${s.year}-${SEM_CODE[s.semester]}/${s.program}-${s.startYear}.json`;
const yearOneList = () => app.data.lists.find((l) => l.name.includes("שנה א'"));

export function candidateMode(id) {
  const s = app.cls.statuses[id]?.status;
  if (!['retake', 'available', 'conditional'].includes(s)) return null;
  if (app.state.choices[id]) return app.state.choices[id];
  if (s === 'retake') return 'must';
  const studyYear = app.data.year - app.data.startYear + 1;
  const letter = ['', 'א', 'ב', 'ג', 'ד'][studyYear];
  return app.data.lists.find((l) => l.name.includes(`שנה ${letter}'`))?.courses.includes(id) ? 'optional' : 'no';
}

function renderMeta() {
  const d = new Date(app.data.fetchedAt);
  const days = (Date.now() - d) / 864e5;
  $('meta').innerHTML = `נתוני תשפ"ז, סמסטר ${esc(app.data.semester)} · עודכן ${d.toLocaleString('he-IL')}`
    + (days > 3 ? ' · <span class="warn">הנתונים בני יותר מ-3 ימים</span>' : '')
    + (app.data.examsPublished ? '' : ' · לוח הבחינות של תשפ"ז טרם פורסם');
}

function renderStatus() {
  const { state, data } = app;
  const pr = progress(data, state);
  const val = (id) => state.passed.includes(id) ? 'passed' : state.failed[id] ? `failed${state.failed[id]}` : 'none';
  $('status').innerHTML = `
    <div class="card">
      <b>התקדמות בתוכנית (יעד 70%, תקנון 11.4.4):</b> ${pr.earned} מתוך ${pr.required} נ"ז
      <div class="bar"><i style="width:${Math.min(100, Math.round(pr.ratio * 100))}%"></i></div>
      ${app.cls.warnings.map((w) => `<p class="bad">${esc(w)}</p>`).join('')}
    </div>
    ${data.lists.map((l) => `<div class="card"><b>${esc(l.name)}</b> <span class="note">(לפחות ${l.minCredits} נ"ז)</span>
      <div class="table-wrap"><table>${l.courses.map((id) => `<tr><td>${esc(id)}</td><td>${esc(data.courses[id].name)}</td><td>${data.courses[id].credits} נ"ז</td>
        <td><select data-course="${esc(id)}" aria-label="מצב עבור ${esc(data.courses[id].name)}">
          ${[['none', 'לא לקחתי'], ['passed', 'עברתי'], ['failed1', 'נכשלתי'], ['failed2', 'נכשלתי פעמיים']]
            .map(([v, t]) => `<option value="${v}" ${val(id) === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select></td></tr>`).join('')}</table></div></div>`).join('')}
    <p><button id="backup">העתק קישור גיבוי מלא (פרטי, רק למכשירים שלך)</button></p>`;
  $('status').querySelectorAll('select[data-course]').forEach((sel) => sel.onchange = () => {
    const id = sel.dataset.course;
    state.passed = state.passed.filter((x) => x !== id);
    delete state.failed[id];
    if (sel.value === 'passed') state.passed.push(id);
    if (sel.value.startsWith('failed')) state.failed[id] = Number(sel.value.slice(6));
    refresh();
  });
  $('backup').onclick = async () => navigator.clipboard.writeText(await backupLink(location.origin + location.pathname, state));
}

function renderCourses() {
  const { data, cls, state } = app;
  const ids = [...new Set(data.lists.flatMap((l) => l.courses))].filter((id) => cls.statuses[id].status !== 'done');
  const order = { retake: 0, available: 1, conditional: 2, blocked: 3, notOffered: 4 };
  ids.sort((a, b) => order[cls.statuses[a].status] - order[cls.statuses[b].status]);
  $('courses').innerHTML = `<p class="note">"חובה" נכנס לכל מערכת. "אופציונלי" נכנס רק אם משפר את הציון.</p><div class="table-wrap"><table>
    ${ids.map((id) => {
      const s = cls.statuses[id];
      const mode = candidateMode(id);
      return `<tr><td>${esc(id)}</td><td>${esc(data.courses[id].name)}<br><span class="note">${s.reasons.map(esc).join('<br>')}</span></td>
        <td><span class="badge ${STATUS_CLASS[s.status]}">${STATUS_LABEL[s.status]}</span></td>
        <td>${mode ? `<select data-choice="${esc(id)}" aria-label="בחירה עבור ${esc(data.courses[id].name)}">${[['must', 'חובה'], ['optional', 'אופציונלי'], ['no', 'לא']]
          .map(([v, t]) => `<option value="${v}" ${mode === v ? 'selected' : ''}>${t}</option>`).join('')}</select>` : ''}</td></tr>`;
    }).join('')}</table></div>`;
  $('courses').querySelectorAll('select[data-choice]').forEach((sel) => sel.onchange = () => {
    state.choices[sel.dataset.choice] = sel.value;
    save();
  });
}

export let renderFriends = () => {};
export let renderResults = () => {};
export function setRenderers(f, r) { renderFriends = f; renderResults = r; }

export function refresh() {
  app.cls = classify(app.data, app.state);
  save();
  renderStatus(); renderCourses(); renderFriends(); renderResults();
}

function showTab(name) {
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll('main > section').forEach((s) => { s.hidden = s.id !== name; });
}

async function init() {
  app.state = load();
  try {
    const res = await fetch(dataPath(app.state));
    if (!res.ok) throw new Error(res.status);
    app.data = await res.json();
  } catch {
    $('status').innerHTML = '<p class="bad">טעינת הנתונים נכשלה. <button id="retry">נסה שוב</button></p>';
    $('retry').onclick = init;
    return;
  }
  if (!app.state.passed) app.state.passed = [...(yearOneList()?.courses ?? [])];
  const h = await readHash(location.hash, app.state);
  if (h?.error) alert(h.error);
  if (h?.type === 'backup') Object.assign(app.state, h.payload);
  if (h?.type === 'friend') { app.friendLanding = h.payload; showTab('friends'); }
  if (h) history.replaceState(null, '', location.pathname);
  document.querySelectorAll('#tabs button').forEach((b) => b.onclick = () => showTab(b.dataset.tab));
  renderMeta();
  refresh();
}

if (typeof document !== 'undefined') init();
```

- [ ] **Step 5: Run the unit test**

Run: `node --test test/app.test.mjs`
Expected: PASS (1 test). `init()` is skipped in node because `document` is undefined.

- [ ] **Step 6: Manual check in the browser**

Run: `npx --yes http-server web -p 8080 -c-1` (in the background) and open `http://localhost:8080/`.
Expected:
- The header shows the data date and the note that the exams aren't published yet.
- Tab 1 lists 9 lists, with year-1 courses preselected as "עברתי".
- Set 90903 to "נכשלתי". Tab 2 now shows 90903 as "חזרה (חובה)" and its dependents as "חסום" with a chain.
- Reloading keeps the choices.

- [ ] **Step 7: Commit**

```bash
git add web/index.html web/app.js test/app.test.mjs
git commit -m "feat(ui): page shell, state, my-status and what-to-take tabs"
```

---

### Task 11: Friends tab, results tab, worker, pins, registration list

**Files:**
- Create: `web/ui-plan.js`
- Modify: `web/index.html` (script tag), `web/app.js` (no change beyond what's below)

**Interfaces:**
- Consumes: `app`, `esc`, `save`, `refresh`, `candidateMode`, `setRenderers` from `web/app.js`. `friendLink` from `web/share.js`. The worker protocol from Task 8.
- Produces: fills `#friends` and `#results`. No new exports.

- [ ] **Step 1: Point the page at the new module**

In `web/index.html`, replace `<script type="module" src="app.js"></script>` with:
```html
<script type="module" src="ui-plan.js"></script>
```
`ui-plan.js` imports `app.js`, so the shell still initializes.

- [ ] **Step 2: Write `web/ui-plan.js`**

```js
import { app, esc, save, refresh, candidateMode, setRenderers } from './app.js';
import { friendLink } from './share.js';

const $ = (id) => document.getElementById(id);
const DAYS = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו'];
// Lucide icons (design-system/afeka-scheduler/pages/app.md). No emoji in the UI.
const ICON = {
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98"/><path d="m15.41 6.51-6.82 3.98"/>',
};
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;
const WEIGHT_LABEL = { friends: 'קרבה לחברים', progress: 'התקדמות בתואר', freeDays: 'ימים פנויים', compact: 'בלי חלונות', timeWindow: 'שעות מועדפות', examSpread: 'פיזור בחינות' };
const yedion = (id) => `https://yedionpub.afeka.ac.il/yedion/fireflyweb.aspx?prgname=S_LOOK_FOR_NOSE&arguments=-N${encodeURIComponent(id)}`;
let worker = null, last = null;

const allGroupIds = () => new Set(Object.values(app.data.courses).flatMap((c) => c.groups.map((g) => g.id)));

function renderFriends() {
  const { state } = app;
  const known = allGroupIds();
  const landing = app.friendLanding;
  $('friends').innerHTML = `
    ${landing ? `<div class="card"><b>${esc(landing.name || 'חבר')}</b> שיתף איתך מערכת: ${landing.groups.length} קבוצות
      ${landing.groups.filter((g) => !known.has(g)).length ? `<span class="warn">(${landing.groups.filter((g) => !known.has(g)).length} קבוצות לא נמצאו בהיצע הנוכחי)</span>` : ''}
      <p><button class="primary" id="addLanding">הוסף כחבר</button> <button id="dropLanding">לא עכשיו</button></p></div>` : ''}
    <div class="card"><label>השם שלי (מופיע בקישור שאני שולח): <input id="myName" value="${esc(state.name)}"></label></div>
    <div class="card"><b>הוספת חבר מקישור</b><br>
      <input id="friendUrl" placeholder="הדבק כאן קישור שחבר שלח" style="width:100%"> <button id="addFriend">הוסף</button>
      <p class="note" id="friendMsg"></p></div>
    <table>${state.friends.map((f, i) => `<tr>
      <td><input type="checkbox" data-active="${i}" ${f.active ? 'checked' : ''} aria-label="פעיל: ${esc(f.name)}"></td>
      <td>${esc(f.name)}<br><span class="note">${f.groups.filter((g) => known.has(g)).length} קבוצות${f.groups.some((g) => !known.has(g)) ? ` · <span class="warn">${f.groups.filter((g) => !known.has(g)).length} לא נמצאו</span>` : ''}</span></td>
      <td><label>משקל <input type="range" min="0" max="3" step="0.5" value="${f.weight}" data-weight="${i}"> <output>${f.weight}</output></label></td>
      <td><button data-remove="${i}">הסר</button></td></tr>`).join('')}</table>`;
  const addFriend = (p) => { state.friends.push({ name: p.name || `חבר ${state.friends.length + 1}`, groups: p.groups, weight: 1, active: true }); app.friendLanding = null; save(); renderFriends(); };
  $('addLanding')?.addEventListener('click', () => addFriend(landing));
  $('dropLanding')?.addEventListener('click', () => { app.friendLanding = null; renderFriends(); });
  $('myName').onchange = (e) => { state.name = e.target.value.trim(); save(); };
  $('addFriend').onclick = async () => {
    const { readHash } = await import('./share.js');
    const url = $('friendUrl').value.trim();
    const r = await readHash(url.includes('#') ? url.slice(url.indexOf('#')) : '', state);
    if (!r || r.error || r.type !== 'friend') { $('friendMsg').textContent = r?.error ?? 'זה לא קישור חבר'; return; }
    addFriend(r.payload);
  };
  $('friends').querySelectorAll('[data-active]').forEach((el) => el.onchange = () => { state.friends[el.dataset.active].active = el.checked; save(); });
  $('friends').querySelectorAll('[data-weight]').forEach((el) => el.oninput = () => { state.friends[el.dataset.weight].weight = Number(el.value); el.nextElementSibling.textContent = el.value; save(); });
  $('friends').querySelectorAll('[data-remove]').forEach((el) => el.onclick = () => { state.friends.splice(Number(el.dataset.remove), 1); save(); renderFriends(); });
}

function week(result) {
  const byId = new Map(Object.entries(app.data.courses).flatMap(([cid, c]) => c.groups.map((g) => [g.id, { cid, c, g }])));
  const friendsOf = (gid) => app.state.friends.filter((f) => f.active && f.groups.includes(gid)).map((f) => f.name);
  const slot = (t) => { const [h, m] = t.split(':').map(Number); return Math.max(0, Math.min(32, Math.round((h * 60 + m - 420) / 30))); };
  let html = '<div class="week"><div class="h"></div>' + DAYS.slice(1).map((d) => `<div class="h">${d}</div>`).join('');
  for (let s = 0; s < 32; s += 2) html += `<div class="t" style="grid-column:1;grid-row:${s + 2}/span 2">${String(7 + s / 2).padStart(2, '0')}:00</div>`;
  result.courses.forEach((cid, ci) => {
    const c = app.data.courses[cid];
    for (const gid of result.groups.filter((id) => byId.get(id)?.cid === cid)) {
      const { g } = byId.get(gid);
      const fr = friendsOf(gid);
      const pinned = app.state.pins.includes(gid);
      for (const m of g.meetings) {
        html += `<button class="block ${fr.length ? 'friend' : ''}" data-pin="${esc(gid)}" aria-pressed="${pinned}"
          style="--cc:var(--c${ci % 8});grid-column:${m.day + 1};grid-row:${slot(m.start) + 2}/${slot(m.end) + 2}"
          aria-label="${esc(c.name)} ${esc(g.type)} יום ${DAYS[m.day]} ${esc(m.start)}–${esc(m.end)}, לחץ לנעיצה">
          ${pinned ? icon('pin') : ''}<b>${esc(c.name)}</b> · ${esc(g.type.replace('סופי-', ''))}<br>${esc(m.start)}–${esc(m.end)} · ${esc(m.room)}${fr.length ? `<br>${icon('users')} ${fr.map(esc).join(', ')}` : ''}</button>`;
      }
    }
  });
  return html + '</div>';
}

function registrationText(result) {
  return result.courses.map((cid) => {
    const c = app.data.courses[cid];
    return `${cid} ${c.name}: ${result.groups.filter((g) => c.groups.some((x) => x.id === g)).join(', ')}`;
  }).join('\n');
}

function renderResults() {
  const { state } = app;
  const c = state.constraints;
  $('results').innerHTML = `
    <div class="card"><b>משקלות</b><div class="grid2">${Object.entries(WEIGHT_LABEL).map(([k, t]) =>
      `<label>${t} <input type="range" min="0" max="5" step="0.5" value="${state.weights[k]}" data-w="${k}"> <output>${state.weights[k]}</output></label>`).join('')}</div></div>
    <div class="card"><b>אילוצים</b><div class="grid2">
      <label>ימים פנויים: ${DAYS.slice(1, 7).map((d, i) => `<label><input type="checkbox" data-day="${i + 1}" ${c.dayOff.includes(i + 1) ? 'checked' : ''}>${d}</label>`).join(' ')}</label>
      <label><input type="checkbox" id="dayOffHard" ${c.dayOffHard ? 'checked' : ''}> ימים פנויים כחובה</label>
      <label>לא לפני <input type="time" id="notBefore" value="${esc(c.notBefore)}"></label>
      <label>לא אחרי <input type="time" id="notAfter" value="${esc(c.notAfter)}"></label>
      <label><input type="checkbox" id="windowHard" ${c.windowHard ? 'checked' : ''}> שעות כחובה</label>
      <label>תקרת נ"ז <input type="number" id="maxCredits" min="0" step="0.5" value="${c.maxCredits ?? ''}" style="width:5em"></label>
      <label><input type="checkbox" id="examsAllow" ${c.examsSameDay === 'allow' ? 'checked' : ''}> לאפשר 2 בחינות באותו יום</label>
      <label><input type="checkbox" id="includeFull" ${c.includeFull ? 'checked' : ''}> לכלול קבוצות מלאות</label>
    </div>${state.pins.length ? `<p>נעוצות: ${state.pins.map(esc).join(', ')} <button id="clearPins">נקה נעיצות</button></p>` : ''}</div>
    <p><button class="primary" id="run">חפש מערכות</button> <span id="runMsg" class="note" role="status"></span></p>
    <div id="out" aria-live="polite"></div>`;
  const bind = (id, fn) => { const el = $(id); if (el) el.onchange = () => { fn(el); save(); }; };
  $('results').querySelectorAll('[data-w]').forEach((el) => el.oninput = () => { state.weights[el.dataset.w] = Number(el.value); el.nextElementSibling.textContent = el.value; save(); });
  $('results').querySelectorAll('[data-day]').forEach((el) => el.onchange = () => {
    const d = Number(el.dataset.day);
    c.dayOff = el.checked ? [...c.dayOff, d] : c.dayOff.filter((x) => x !== d);
    save();
  });
  bind('dayOffHard', (el) => c.dayOffHard = el.checked);
  bind('notBefore', (el) => c.notBefore = el.value);
  bind('notAfter', (el) => c.notAfter = el.value);
  bind('windowHard', (el) => c.windowHard = el.checked);
  bind('maxCredits', (el) => c.maxCredits = el.value ? Number(el.value) : null);
  bind('examsAllow', (el) => c.examsSameDay = el.checked ? 'allow' : 'forbid');
  bind('includeFull', (el) => c.includeFull = el.checked);
  $('clearPins')?.addEventListener('click', () => { state.pins = []; save(); renderResults(); });
  $('run').onclick = run;
  if (last) showResults(last);
}

function run() {
  const courses = Object.keys(app.data.courses).map((id) => ({ id, mode: candidateMode(id) })).filter((x) => x.mode === 'must' || x.mode === 'optional');
  if (!courses.length) { $('runMsg').textContent = 'לא נבחרו קורסים בלשונית "מה לומדים"'; return; }
  $('runMsg').textContent = 'מחפש…';
  $('run').disabled = true;
  worker?.terminate();
  worker = new Worker(new URL('./solver-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => { last = e.data; showResults(last); $('runMsg').textContent = ''; $('run').disabled = false; };
  worker.onerror = (e) => { $('runMsg').textContent = `שגיאה בחיפוש: ${e.message}`; $('run').disabled = false; };
  const { state, data, cls } = app;
  worker.postMessage({ data, courses, statuses: cls.statuses, pins: state.pins, constraints: state.constraints, weights: state.weights, friends: state.friends });
}

function showResults(r) {
  const out = $('out');
  if (!r.results.length) { out.innerHTML = `<div class="card bad"><b>${icon('alert')} לא נמצאה מערכת</b>${r.diagnosis.map((d) => `<p>${esc(d)}</p>`).join('')}</div>`; return; }
  out.innerHTML = (r.partial ? '<p class="warn">החיפוש חלקי (נגמר הזמן). התוצאות הן הטובות שנמצאו.</p>' : '')
    + r.results.map((res, i) => `<div class="card">
      <b>#${i + 1}</b> · ציון ${res.score.toFixed(2)} · ${res.courses.reduce((a, c) => a + app.data.courses[c].credits, 0)} נ"ז
      <p>${esc(res.explanation)}</p>${week(res)}
      <details><summary>בחינות</summary>${app.data.examsPublished
        ? `<table>${res.exams.filter((e) => e.kind === 'בחינה').sort((a, b) => a.date.localeCompare(b.date)).map((e) =>
            `<tr><td>${esc(app.data.courses[e.course].name)}</td><td>מועד ${e.moed}</td><td>${esc(e.date)} ${esc(e.time ?? '')}</td></tr>`).join('')}</table>`
        : '<p class="note">לוח הבחינות של תשפ"ז טרם פורסם.</p>'}</details>
      <details><summary>רשימה להרשמה</summary><pre>${esc(registrationText(res))}</pre>
        <p>${res.courses.map((cid) => `<a href="${yedion(cid)}" target="_blank" rel="noopener">${esc(cid)}</a>`).join(' · ')}</p>
        <button data-copy="${i}">${icon('copy')} העתק</button></details>
      <button data-share="${i}">${icon('share')} שתף את המערכת הזו עם חברים</button> <span class="note" data-sharemsg="${i}"></span>
    </div>`).join('');
  out.querySelectorAll('[data-copy]').forEach((b) => b.onclick = () => navigator.clipboard.writeText(registrationText(r.results[b.dataset.copy])));
  out.querySelectorAll('[data-share]').forEach((b) => b.onclick = async () => {
    const link = await friendLink(location.origin + location.pathname, app.state, r.results[b.dataset.share].groups);
    await navigator.clipboard.writeText(link);
    out.querySelector(`[data-sharemsg="${b.dataset.share}"]`).textContent = 'הקישור הועתק. אפשר לשלוח לחברים.';
  });
  out.querySelectorAll('[data-pin]').forEach((el) => el.onclick = () => {
    const gid = el.dataset.pin;
    app.state.pins = app.state.pins.includes(gid) ? app.state.pins.filter((x) => x !== gid) : [...app.state.pins, gid];
    save();
    renderResults();
    run();
  });
}

setRenderers(renderFriends, renderResults);
if (app.data) refresh();
```

- [ ] **Step 3: Manual end-to-end check in the browser (your scenario)**

With `npx --yes http-server web -p 8080 -c-1` running, open `http://localhost:8080/`:
1. Tab 1: 90903 → "נכשלתי".
2. Tab 2: 90903 shows "חזרה (חובה)" with `חובה` selected, and the year-2 available courses default to "אופציונלי".
3. Tab 4: "חפש מערכות". Expect up to 10 cards in under ~1 second. Every card includes 90903, no blocks overlap, and the explanation line is filled in.
4. Click a 90903 block (or Tab to it and press Enter). It gets the pin icon and a solid outline, the search re-runs, and every result now keeps that group.
5. "שתף את המערכת הזו". Paste the link into a private window. It opens tab 3 with "הוסף כחבר" and the group count.
6. Back in the main window, add that link in tab 3 and run tab 4 again. The shared groups show a dashed amber outline with the `users` SVG icon and the friend's name, and "קורסים עם …" appears in the explanation.
7. In tab 3, add a friend whose name is `<img src=x onerror=alert(1)>` (change your name to that in a private window and share). The name must render as literal text, and no alert may fire.
8. Set constraints: day off ג as a requirement, plus "לא לפני" 20:00 as a requirement. Expect the "לא נמצאה מערכת" card, with a reason naming 90903.
9. Design checklist (`design-system/afeka-scheduler/pages/app.md`):
   - The Noto Sans Hebrew font is loaded.
   - Tab through the whole page. A visible focus ring appears on every control.
   - Toggle OS dark mode. Text stays readable.
   - Check widths 375, 768 and 1440px. There is no horizontal page scroll, and wide tables scroll inside `.table-wrap`.
   - With reduced-motion on, there are no transitions.
   - There is no emoji anywhere in the UI.

- [ ] **Step 4: Run the whole test suite**

Run: `npm test`
Expected: all tests PASS (parse 10, build 5, rules 7, solver 14, share 4, app 1).

- [ ] **Step 5: Commit**

```bash
git add web/index.html web/ui-plan.js
git commit -m "feat(ui): friends tab, results with worker, pins, sharing, registration list"
```

---

### Task 12: Local run, README, and final verification (no deployment)

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: the whole `web/` folder.
- Produces: a local site at `http://localhost:8080/`. Nothing is published (project decision: local only for now).

- [ ] **Step 1: Write `README.md`**

```markdown
# Afeka scheduler

Builds an Afeka timetable from the public Yedion (yedionpub.afeka.ac.il), respecting prerequisites and friends' schedules.
Spec: docs/superpowers/specs/2026-09-30-afeka-scheduler-design.md · Design: design-system/afeka-scheduler/

- Refresh data: `node scripts/scrape.mjs` (≈5 min; writes web/data/afeka/2027-1/30-2026.json only if validation passes)
- Tests: `npm test`
- Run locally: `npx http-server web -p 8080 -c-1`, then open http://localhost:8080/

Local only for now. Helper tool only. Registration in AfekaNet is authoritative.
```

- [ ] **Step 2: Full verification run**

Run: `npm test`
Expected: all tests PASS (parse 10, build 5, rules 7, solver 14, share 4, app 1). Paste the summary line into the task report.

Run: `npx --yes http-server web -p 8080 -c-1` (in the background), then repeat Task 11 Step 3 items 1–9 in the browser at 375px and 1440px. Report every item as pass or fail, with a screenshot of one results card.

- [ ] **Step 3: Commit and push**

```bash
git add README.md
git commit -m "docs: README with scrape/test/local-run commands"
git push
```

---

## Self-review notes

- **Spec coverage:**
  - §4 data: Tasks 1–5 (exams: 3–5).
  - §5 rules: Task 6.
  - §6 solver: Tasks 7–8.
  - §7 UI and sharing: Tasks 9–11.
  - §8 tests and errors: covered per task. Staleness and the retry are in Task 10. localStorage try/catch is in Task 10. The no-solution diagnosis is in Task 8/11.
  - §9 MVP: Task 12 is a local run only, with deployment deferred by project decision.
  - Version 2 items (cron, Worker, Gemini, transcript import) are intentionally left out.
- **Type consistency:**
  - `anyOf: [{id, name}]` is used in Tasks 4, 6 and 7.
  - `statuses[id].missingParallel: string[][]` is produced in Task 6 and consumed in Task 8.
  - Options `{groups, mask, meetings, exams, allExams, course}` come from Task 7/8, and `Result` from Task 8 is consumed in Task 11.
  - The data path `data/afeka/2027-1/30-2026.json` is written in Task 5 and read in Tasks 8, 10 and 12.
