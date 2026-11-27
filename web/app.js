import {
  classify,
  withAfterA,
  cleanProfile,
  studyYear,
  yearsOf,
  modeFor,
  specLists,
  specRule,
  validSpecs,
  summerOnly
} from './rules.js';
import { readHash } from './share.js';
import { askConfirm } from './ui-dialog.js';
import { esc, freshAt } from './ui-text.js';
import { pinsWithoutSplit } from './solver-core.js';
import { cleanSettings, SETTINGS_DEFAULT } from './settings.js';
import { EDIT_KEY, editMoved, restoreEdit } from './edit-state.js';

export { esc };

const KEY = 'afeka-sched-v1';
const SEM_CODE = { 'א': 1, 'ב': 2, 'קיץ': 3 };
export const DEFAULT = {
  v: 1,
  year: 2027,
  semester: 'א',
  program: 30,
  startYear: 2026,
  name: '',
  passed: null,
  assumed: null, // the part of `passed` the site marked by itself and the student never confirmed; null: not worked out yet (ensurePassed)
  failed: {},
  grades: {},
  exempt: [],
  outsideDone: [], // outside-program prerequisite alternatives marked done, by name (rules.js reqMet)
  choices: {},
  friends: [],
  pins: [],
  profile: { year: null, amirnet: null, specs: [], summer: false },
  scope: 'year',
  load: 'even',
  sortBy: 'best',
  semesterOf: {},
  programSet: false, // programSet: the track was picked (a first visit starts with none)
  specDraft: null,
  // UI leftovers worth keeping over a refresh: a half-made specialization pick, and the year plan the summer tab builds on
  yearIds: [],
  retakeSeen: [], // failed courses whose "take it again" note was shown (rules.js retakeNotice)
  prefsV: 2, // 2: the weights and exam rule of 2026-11-02 (normalize moves older saves once)
  prefsNote: false, // the move happened and the student has not answered the note yet
  weights: { friends: 1, progress: 5, freeDays: 1, compact: 1, timeWindow: 1, examSpread: 1 },
  constraints: {
    dayOff: [6],
    dayOffHard: false,
    notBefore: '',
    notAfter: '20:00',
    windowHard: false,
    maxCredits: null,
    maxDays: null,
    examsSameDay: 'hours', // the same date and hour is always refused; 'forbid': no two exams on a date, the student's choice
    includeFull: false,
    split: false,
    blocks: [],
    lecturers: {}
  },
};

// The programs and cohorts the site has data for (data/afeka/catalog.json, written by the scraper). Without it: mechanical engineering 2026, the first program.
export const FALLBACK_CATALOG = { programs: [{ id: 30, name: 'הנדסה מכנית', startYears: [2026] }] };
export const inCatalog = (c, program, startYear) =>
  !!c?.programs?.some((p) => p.id === program && p.startYears.includes(startYear));
const goodCatalog = (c) =>
  isObj(c) &&
  Array.isArray(c.programs) &&
  c.programs.length > 0 &&
  c.programs.every(
    (p) =>
      isObj(p) &&
      Number.isInteger(p.id) &&
      typeof p.name === 'string' &&
      Array.isArray(p.startYears) &&
      p.startYears.every(Number.isInteger)
  ) &&
  (c.year === undefined || Number.isInteger(c.year));
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const strs = (a, max, len) =>
  Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.length <= len).slice(0, max) : null;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
// Personal busy time. Invalid items are dropped one by one (like friends), the rest are kept; times stay inside the 07:00-23:00 slot grid.
export const cleanBlocks = (a) =>
  Array.isArray(a)
    ? a
        .filter(
          (b) =>
            isObj(b) &&
            Number.isInteger(b.day) &&
            b.day >= 1 &&
            b.day <= 6 &&
            typeof b.start === 'string' &&
            typeof b.end === 'string' &&
            HHMM.test(b.start) &&
            HHMM.test(b.end) &&
            b.start >= '07:00' &&
            b.end <= '23:00' &&
            b.start < b.end &&
            typeof b.label === 'string' &&
            b.label.length <= 30
        )
        .slice(0, 12)
        .map((b) => ({ day: b.day, start: b.start, end: b.end, label: b.label }))
    : [];
const CONSTRAINT_OK = {
  dayOff: (v) => Array.isArray(v) && v.every((d) => Number.isInteger(d) && d >= 1 && d <= 6),
  dayOffHard: (v) => typeof v === 'boolean',
  windowHard: (v) => typeof v === 'boolean',
  includeFull: (v) => typeof v === 'boolean',
  split: (v) => typeof v === 'boolean',
  notBefore: (v) => v === '' || (typeof v === 'string' && HHMM.test(v)),
  notAfter: (v) => v === '' || (typeof v === 'string' && HHMM.test(v)),
  maxCredits: (v) => v === null || (num(v) && v >= 0),
  maxDays: (v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 6),
  examsSameDay: (v) => v === 'hours' || v === 'forbid',
};

// The default weights before prefsV 2. A save holding exactly these never chose them, as far as anyone can tell.
export const OLD_WEIGHTS = { friends: 3, progress: 3, freeDays: 1, compact: 1, timeWindow: 1, examSpread: 1 };
const sameWeights = (a, b) => Object.keys(b).every((k) => a?.[k] === b[k]) && Object.keys(a ?? {}).length === Object.keys(b).length;

// The one gate for state from localStorage and from backup links: only valid values get through.
// year/semester are never taken from input (the year is the catalog's); program/startYear only when the catalog lists
// them (a foreign program would 404 the data file forever).
const SORTS = ['best', 'credits', 'friends', 'unlocks'];
export function normalize(raw, catalog = FALLBACK_CATALOG) {
  const out = structuredClone(DEFAULT);
  // the academic year comes from the scraper's catalog: one place to roll over
  if (Number.isInteger(catalog?.year)) out.year = catalog.year;
  if (!isObj(raw) || raw.v !== 1) return out;
  // a cohort the catalog dropped: the nearest one of the same program (ties: the later)
  const prog = catalog?.programs?.find((p) => p.id === raw.program);
  if (prog?.startYears.length && Number.isInteger(raw.startYear)) {
    out.program = prog.id;
    out.startYear = prog.startYears.reduce((b, y) =>
      (Math.abs(y - raw.startYear) < Math.abs(b - raw.startYear) ||
      (Math.abs(y - raw.startYear) === Math.abs(b - raw.startYear) && y > b)
        ? y
        : b));
  }
  if (typeof raw.name === 'string' && raw.name.length <= 60) out.name = raw.name;
  const passed = strs(raw.passed, 200, 20);
  if (passed) out.passed = [...new Set(passed)];
  const assumed = strs(raw.assumed, 200, 20);
  if (assumed && out.passed) out.assumed = [...new Set(assumed)].filter((id) => out.passed.includes(id));
  if (isObj(raw.failed))
    out.failed = Object.fromEntries(
      Object.entries(raw.failed)
        .filter(([k, v]) => k.length <= 20 && Number.isInteger(v) && v >= 1 && v <= 3)
        .slice(0, 200)
    );
  if (isObj(raw.grades))
    out.grades = Object.fromEntries(
      Object.entries(raw.grades)
        .filter(([k, v]) => k.length <= 20 && Number.isInteger(v) && v >= 0 && v <= 100)
        .slice(0, 200)
    );
  out.exempt = strs(raw.exempt, 200, 20) ?? []; // passed by an exemption on the grade sheet (פ.פנימ): the row says פטור
  if (isObj(raw.choices))
    out.choices = Object.fromEntries(
      Object.entries(raw.choices)
        .filter(([k, v]) => k.length <= 20 && ['must', 'optional', 'no'].includes(v))
        .slice(0, 200)
    );
  if (Array.isArray(raw.friends)) {
    out.friends = raw.friends
      .filter((f) => isObj(f) && typeof f.name === 'string' && f.name.length <= 60 && Array.isArray(f.groups))
      .slice(0, 20)
      .map((f) => ({
        name: f.name,
        groups: strs(f.groups, 40, 20),
        weight: num(f.weight) ? clamp(f.weight, 0, 3) : 1,
        active: typeof f.active === 'boolean' ? f.active : true,
        ...(f.manual === true ? { manual: true } : {})
      }));
  }
  out.pins = strs(raw.pins, 40, 20) ?? out.pins;
  out.profile = cleanProfile(raw.profile);
  const draft = strs(raw.specDraft, 2, 20);
  // shape only (reconcileSpecs checks it against the data); a complete choice lives in profile.specs
  if (draft && draft.length === 1 && /^[a-z][a-z0-9]{0,19}$/.test(draft[0])) out.specDraft = draft;
  out.yearIds = strs(raw.yearIds, 60, 20) ?? [];
  out.retakeSeen = strs(raw.retakeSeen, 200, 20) ?? [];
  out.outsideDone = strs(raw.outsideDone, 100, 120) ?? [];
  if (['year', 'א', 'ב', 'קיץ'].includes(raw.scope)) out.scope = raw.scope;
  if (['א', 'even', 'ב'].includes(raw.load)) out.load = raw.load;
  // older saves: a year or another track was a choice
  out.programSet = raw.programSet === true || out.profile.year !== null || (!!prog && prog.id !== DEFAULT.program);
  // includes() on an array: '__proto__' and non-strings fall through to 'best'
  if (SORTS.includes(raw.sortBy)) out.sortBy = raw.sortBy;
  if (isObj(raw.semesterOf))
    out.semesterOf = Object.fromEntries(
      Object.entries(raw.semesterOf)
        .filter(([k, v]) => k.length <= 20 && (v === 'א' || v === 'ב'))
        .slice(0, 200)
    );
  if (isObj(raw.weights))
    for (const k of Object.keys(DEFAULT.weights))
      if (num(raw.weights[k]))
        out.weights[k] = [0, 1, 3, 5].reduce(
          (b, s) => (Math.abs(s - raw.weights[k]) <= Math.abs(b - raw.weights[k]) ? s : b),
          0
        ); // snap to the UI scale; ties go up like nearestStep
  if (isObj(raw.constraints))
    for (const k of Object.keys(CONSTRAINT_OK))
      if (CONSTRAINT_OK[k](raw.constraints[k])) out.constraints[k] = raw.constraints[k];
  // Saves from before prefsV 2: 'forbid' was only the default and no exam data existed, so it was nobody's choice.
  if (raw.prefsV === 2) out.prefsNote = raw.prefsNote === true;
  else {
    out.constraints.examsSameDay = DEFAULT.constraints.examsSameDay;
    if (sameWeights(raw.weights, OLD_WEIGHTS)) {
      out.weights = structuredClone(DEFAULT.weights);
      out.prefsNote = true;
    }
  }
  // "לא לפני" at or after "לא אחרי" leaves no allowed minute: the later bound stays (HH:MM strings compare as times)
  const { notBefore: nb, notAfter: na } = out.constraints;
  if (nb && na && nb >= na) out.constraints.notBefore = '';
  if (isObj(raw.constraints)) out.constraints.blocks = cleanBlocks(raw.constraints.blocks);
  if (isObj(raw.constraints?.lecturers))
    out.constraints.lecturers = Object.fromEntries(
      Object.entries(raw.constraints.lecturers)
        .filter(([k, v]) => k.length <= 60 && (v === 'prefer' || v === 'avoid'))
        .slice(0, 30)
    );
  return migrateYear(out, raw.year, out.year);
}
// A save from an earlier academic year (local, stashed or a backup link): the record stays; last year's group ids, plan and notes
// go, and the student is that many years further on. One place, so a backup is not advanced twice.
export function migrateYear(state, fromYear, toYear) {
  if (!(typeof fromYear === 'number' && fromYear < toYear)) return state;
  // their groups are last year's, so there is nothing to keep, but the student should know
  const friends = state.friends.length, pins = state.pins.length;
  if (friends || pins) {
    const what = [friends && (friends === 1 ? 'חבר אחד' : `${friends} חברים`), pins && (pins === 1 ? 'קורס נעוץ אחד' : `${pins} קורסים נעוצים`)];
    app.hashError ??= `עברנו לשנת הלימודים החדשה: ${what.filter(Boolean).join(' ו-')} מהשנה שעברה הוסרו, כי הקבוצות שלהם לא קיימות יותר.`;
  }
  Object.assign(state, { pins: [], friends: [], semesterOf: {}, yearIds: [], retakeSeen: [] });
  if (state.profile.year) state.profile.year = cleanProfile({ year: Math.min(5, state.profile.year + toYear - fromYear) }).year;
  return state;
}

// A saved program the catalog lacks is never overwritten: without the real catalog nothing is saved this visit; a program the site dropped is kept aside.
export function load() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY));
  } catch {
    /* storage unavailable */
  }
  const s = normalize(saved, app.catalog);
  app.noSave = false;
  if (!isObj(saved) || saved.v !== 1 || !Number.isInteger(saved.program)) return s;
  const fallback = app.catalog === FALLBACK_CATALOG,
    moved = s.program !== saved.program;
  // the fallback's year is a guess (DEFAULT.year): saving a later-year state under it would move the year back, and the next
  // visit with the real catalog would advance the student a second time (audit #33)
  if (fallback && (moved || s.startYear !== saved.startYear || (Number.isInteger(saved.year) && saved.year > s.year))) {
    app.noSave = true;
    app.hashError = 'רשימת התוכניות לא נטענה. מוצגת הנדסה מכנית, והנתונים השמורים שלכם לא ישתנו עד שהרשימה תיטען.';
  } else if (moved) {
    stash(saved);
    app.hashError = 'התוכנית השמורה כבר לא באתר. מוצגת הנדסה מכנית, וההתקדמות בתוכנית הקודמת נשמרה בצד.';
  } else if (s.startYear !== saved.startYear) {
    stash(saved);
    app.hashError = `המחזור השמור כבר לא באתר. מוצג מחזור ${s.startYear} של אותה תוכנית, וההתקדמות במחזור הקודם נשמרה בצד.`;
  }
  if (moved) return withPersonal({ ...normalize(null, app.catalog), program: s.program, startYear: s.startYear }, s);
  return s;
}
// Per program x cohort the state is kept under its own key while another is active, so switching back finds the progress again.
const stashKey = (p, y) => `${KEY}:${p}-${y}`;
const stash = (s) => {
  if (app.otherTab) return; // this tab's copy is old: over the other tab's stash it would erase what that tab did
  try {
    localStorage.setItem(stashKey(s.program, s.startYear), JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
};
const unstash = (p, y) => {
  try {
    return JSON.parse(localStorage.getItem(stashKey(p, y)));
  } catch {
    return null;
  }
};
export function clearSaved() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(KEY)) localStorage.removeItem(k);
  } catch {
    /* storage unavailable */
  }
}
// One add/replace/rename path for friends. `editing` is the NAME of the friend being edited (names, not indexes, survive deletes mid-edit).
// A link without a name: the friend with the same groups (the same link pasted again), else the first free "חבר N".
export function friendName(friends, p) {
  if (p.name) return p.name;
  const key = (g) => [...g].sort().join();
  const same = friends.find((f) => key(f.groups) === key(p.groups));
  if (same) return same.name;
  let n = 1;
  while (friends.some((f) => f.name === `חבר ${n}`)) n++;
  return `חבר ${n}`;
}
// `name` if no friend has it, else the first free "name 2", "name 3"… (a link that should not replace a namesake)
export function freeName(friends, name) {
  let n = 1;
  const at = () => (n === 1 ? name : `${name.slice(0, 60 - ` ${n}`.length).trimEnd()} ${n}`); // normalize keeps names up to 60
  while (friends.some((f) => f.name === at())) n++;
  return at();
}
export function upsertFriend(friends, p, editing = null) {
  const at = (n) => friends.findIndex((f) => f.name === n);
  let ti = editing == null ? -1 : at(editing);
  if (ti < 0) ti = at(p.name);
  if (ti < 0 && friends.length >= 20)
    return { friends, replaced: false, error: 'אפשר עד 20 חברים. הסירו חבר כדי להוסיף.' };
  const prev = friends[ti];
  const next = {
    name: p.name,
    groups: p.groups,
    weight: prev?.weight ?? 1,
    active: prev?.active ?? true,
    ...(p.manual === true ? { manual: true } : {})
  };
  if (ti < 0) return { friends: [...friends, next], replaced: false };
  return {
    friends: friends.map((f, i) => (i === ti ? next : f)).filter((f, i) => i === ti || f.name !== p.name),
    replaced: true
  };
}

export const app = {
  catalog: FALLBACK_CATALOG,
  loadFailed: false,
  state: null,
  data: null,
  sem: { 'א': null, 'ב': null },
  semNotice: null,
  cls: null,
  planIds: new Set(),
  summerIds: [],
  friendLanding: null,
  hashError: null,
  noSave: false,
  saveFailed: false,
  editSaveFailed: false, // the edit page's key has its own flag: a good save of the other key must not hide this failure
  otherTab: false,
  settings: SETTINGS_DEFAULT,
  termsOk: () => true,
  passOpen: () => false, // design A's first-run pass is open (ui-common.js passOpen)
  // design A: year changes in flight that ask what was passed in the years they make earlier (ui-passed.js); nothing is filled in meanwhile
  holdFill: 0,
  firstLoad: () => {}, // a new visitor's first load, before anything is saved (ui-common.js writes the first-run mark)
  restoredRecord: () => {}, // a waiting backup was restored at a load, not after "המשך" (ui-common.js ends design A's pass)
  pendingBackup: null
}; // ui-common.js swaps in the real checks; a backup link waits in pendingBackup until the terms are accepted

// Both semesters as one catalogue: a course is offered if either semester offers it; groups are merged (ids are disjoint).
export function yearView(dataA, dataB) {
  const courses = {};
  for (const [id, a] of Object.entries(dataA.courses)) {
    const b = dataB.courses[id];
    courses[id] = {
      ...a,
      offered: !!(a.offered || b?.offered),
      groups: [...a.groups, ...(b?.groups ?? [])],
      semesters: [...(a.offered ? ['א'] : []), ...(b?.offered ? ['ב'] : [])]
    };
  }
  for (const [id, b] of Object.entries(dataB.courses))
    if (!courses[id]) courses[id] = { ...b, semesters: b.offered ? ['ב'] : [] };
  return { ...dataA, semester: 'שנה', courses };
}
let groupSem = null;
export const semOfGroup = (gid) => {
  if (!groupSem) {
    groupSem = new Map();
    for (const sem of ['א', 'ב'])
      for (const c of Object.values(app.sem[sem]?.courses ?? {})) for (const g of c.groups) groupSem.set(g.id, sem);
  }
  return groupSem.get(gid) ?? null;
};
// app.data = year view, or the single chosen semester's file (also the fallback when ב is missing).
export function pickData() {
  const { א: A, ב: B } = app.sem,
    scope = app.state.scope;
  app.data = summerScope()
    ? app.sem['קיץ']
    : scope === 'year' && B
      ? { ...yearView(A, B), fetchedAt: A.fetchedAt, examsPublished: !!(A.examsPublished || B.examsPublished) } // either semester (audit #35)
      : (scope === 'ב' && B
        ? B
        : A);
}
// When the shown data was last known to be current (ui-text.js freshAt). The year view spans two files: the older of the two, so a warning is never missed.
export const freshOf = (data) => {
  const files = data.semester === 'שנה' ? [app.sem?.['א'], app.sem?.['ב'], summerOn() && app.sem?.['קיץ']].filter(Boolean) : [data];
  return files
    .map((d) => freshAt(d, app.status))
    .filter(Boolean)
    .sort((a, b) => new Date(a) - new Date(b))[0];
};
// The status as the board should read it: "checked" means the files shown, not the last run, which may have left one out.
export const boardStatus = () => app.status && { ...app.status, checkedAt: freshOf(app.data) ?? app.status.checkedAt };
// When a course's seat counts were read: groups are read every other night, so the last run's time can be a night too new.
// A status from before groupsAt says what the file says.
export const seatsAt = (cid, data) => app.status?.groupsAt?.[cid] ?? freshOf(data);
// Summer is planned after the school year: on only when the profile asks for it and the summer file loaded.
export const summerOn = () => !!(app.state?.profile.summer && app.sem?.['קיץ']);
export const summerScope = () => app.state?.scope === 'קיץ' && summerOn();
// The site says every change is saved, so a save that fails is told (ui-view.js renderNotice) until one succeeds.
export function save() {
  if (app.noSave) return;
  let failed = false;
  try {
    localStorage.setItem(KEY, JSON.stringify(app.state));
  } catch {
    failed = true;
  }
  if (failed !== app.saveFailed) {
    app.saveFailed = failed;
    app.onSaveChange?.();
  }
}
// The edit page's key (ui-edit.js commit): the same, with its own flag. The notice shows while either one is set.
export function setEditSaveFailed(failed) {
  if (failed === app.editSaveFailed) return;
  app.editSaveFailed = failed;
  app.onSaveChange?.();
}
export const saveBroken = () => app.saveFailed || app.editSaveFailed;
// "כל שינוי נשמר מיד" is true only now: both keys save and no other tab holds a newer copy.
export const saving = () => !saveBroken() && !app.otherTab;
// Another tab changed the record (the build page's key, or the edit page's): this tab's old copy must not write over it, so it stops saving
// and asks for a reload (ui-view.js renderNotice). It does not reload by itself: two open windows would reload each other, and an open draft would be lost.
// yearIds is what a tab's shown alternative holds, not the student's record: each tab writes its own when a search ends.
const sortedKeys = (v) =>
  Array.isArray(v) ? v.map(sortedKeys) : isObj(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortedKeys(v[k])])) : v;
export const recordOf = (json) => {
  const told = app.hashError; // only a comparison: a year move in the other copy is not news here
  try {
    // normalized and sorted, so a key order or what a load fills in does not read as a change
    const { yearIds: _, ...record } = normalize(JSON.parse(json), app.catalog);
    return JSON.stringify(sortedKeys(record));
  } catch {
    return json;
  } finally {
    app.hashError = told;
  }
};
export function watchOtherTabs() {
  addEventListener('storage', (e) => {
    const all = e.key === null; // storage cleared in another tab
    const moved =
      ((all || e.key === KEY) && recordOf(e.newValue) !== recordOf(JSON.stringify(app.state))) ||
      ((all || e.key === EDIT_KEY) && editMoved());
    if (!moved) return;
    app.noSave = true;
    app.otherTab = true;
    app.onSaveChange?.();
  });
}
const dataPath = (s, sem = s.semester) => `data/afeka/${s.year}-${SEM_CODE[sem]}/${s.program}-${s.startYear}.json`;
// First time: the earlier years' mandatory lists are assumed passed (a year-3 student starts with years א and ב), except a course on file as failed;
// a first-year student has passed nothing.
const earlierYears = () => {
  const before = 'אבגדה'.slice(0, studyYear(app.data, app.state) - 1);
  return [
    ...new Set(
      app.data.lists.filter((l) => [...before].some((y) => l.name.includes(`שנה ${y}'`))).flatMap((l) => l.courses)
    )
  ];
};
export function ensurePassed() {
  const s = app.state,
    earlier = earlierYears();
  // design A's first run: the student ticks what they passed (step 2); nothing is filled in for them
  if (!s.passed && (app.passOpen() || app.holdFill > 0)) {
    s.passed = [];
    s.assumed = [];
  }
  if (!s.passed) {
    s.passed = earlier.filter((id) => !s.failed[id]);
    s.assumed = [...s.passed];
  }
  // a save from before `assumed` cannot say who marked its earlier years: they count as assumed, unless a grade or an exemption backs them
  s.assumed ??= s.passed.filter((id) => earlier.includes(id) && !(id in s.grades) && !s.exempt.includes(id));
}
// This year's courses blocked by an earlier year's course: that year was not (fully) marked as passed. A prereq of this year itself is normal.
export function waitingOnEarlier() {
  const earlier = new Set(earlierYears());
  return yearCourses().filter((id) => {
    const s = app.cls.statuses[id];
    return s?.status === 'blocked' && s.blockedBy?.some((g) => g.some((p) => earlier.has(p)));
  });
}

// The study year's mandatory list (e.g. "שנה ב'"): courses in it default to optional. From year 3 the chosen
// specialization areas' courses (mandatory and elective) join it, and so does the final project list (four-year
// programs keep it apart from the year lists; its prerequisites still decide when a part opens: bot report 1.2).
export function yearCourses() {
  const y = studyYear(app.data, app.state),
    list = app.data.lists.find((l) => l.name.includes(`שנה ${' אבגדה'[y]}'`))?.courses ?? [];
  if (y < 3) return list;
  const sp = specLists(app.data, app.state.profile.specs),
    project = app.data.lists.filter((l) => /^פרויקט גמר/.test(l.name)).flatMap((l) => l.courses);
  return [...new Set([...list, ...project, ...sp.mandatory, ...sp.elective])];
}
// The classification a plan is built on: the summer assumption in summer, else the record.
export const planningCls = () => app.clsSummer ?? app.cls;
export const candidateMode = (id) =>
  modeFor(planningCls().statuses[id]?.status, app.state.choices[id], yearCourses().includes(id));
// Courses with a pinned summer group are taken in summer: the year and single-semester searches leave them out (audit #32).
export const summerPinned = () => {
  const S = summerOn() && !summerScope() ? app.sem['קיץ'] : null;
  return new Set(S ? Object.keys(S.courses).filter((id) => S.courses[id].groups.some((g) => app.state.pins.includes(g.id))) : []);
};

// Rendering lives in ui-plan.js / ui-grid.js; they register here. Focus survives a re-render via data-k keys.
let renderers = [];
export function setRenderers(...fns) {
  renderers = fns;
}
// What the UI keeps for the current program (results, colors, a half-made pick) must go when the state is replaced; ui-actions.js registers it.
let uiReset = () => {};
export function setUiReset(fn) {
  uiReset = fn;
}
export function keepFocus(fn) {
  const k = document.activeElement?.dataset?.k,
    card = !!document.activeElement?.closest?.('#firstRun'); // the first-run card shares keys with the hidden pages: its own control comes first
  fn();
  if (k && document.activeElement?.dataset?.k !== k) {
    const sel = `[data-k="${CSS.escape(k)}"]`;
    const el = (card && document.querySelector(`#firstRun ${sel}`)) || document.querySelector(sel);
    // design A: a control inside the board's closed "פרטים" (a re-render kept it shut) opens it first, or the focus would have nowhere to go
    // (a summary is not inside its own disclosure's hidden part: a closed one stays closed)
    if (document.documentElement.dataset.design === 'a') {
      const shut = (n) => n?.closest('details:not([open])');
      for (let d = shut(el?.matches('summary') ? el.parentElement.parentElement : el); d; d = shut(d.parentElement)) d.open = true;
    }
    el?.focus({ preventScroll: true });
  }
}

// A saved choice must fit the loaded program: another program's area ids (or a different pick count) would mislead the progress map and the lists.
// An area the program dropped (industrial engineering's old main+secondary pair, mechanical evening's three areas) leaves the others: a whole choice
// when they still make `pick`, else a draft. One area never becomes a standalone choice by itself (vehicle alone adds a mandatory list).
export function reconcileSpecs() {
  const { profile } = app.state,
    rule = specRule(app.data),
    ok = validSpecs(app.data, profile.specs);
  const known = (ids) => (app.data.specializations ?? []).map((s) => s.id).filter((id) => ids.includes(id));
  // a two-year program has no year ג׳ (the same check as the data: once per load)
  if (profile.year > yearsOf(app.data)) profile.year = yearsOf(app.data);
  if (ok.join() !== profile.specs.join()) {
    const left = known(profile.specs);
    profile.specs = left.length === rule.pick ? validSpecs(app.data, left) : [];
    if (!profile.specs.length && left.length && left.length < rule.pick && !app.state.specDraft)
      app.state.specDraft = left;
  }
  const draft = app.state.specDraft;
  if (draft && !profile.specs.length && draft.length === rule.pick && validSpecs(app.data, draft).length) {
    profile.specs = validSpecs(app.data, draft);
    app.state.specDraft = null;
  }
  if (draft && !(draft.length < rule.pick && known(draft).length === draft.length)) app.state.specDraft = null;
}

export function refresh() {
  // summer switched off; a summer file that failed to load keeps the choice
  if (app.state.scope === 'קיץ' && !app.state.profile.summer) app.state.scope = 'year';
  pickData();
  reconcileSpecs();
  // app.cls is the record (#me, checklist, map, warnings). Summer plans as if the shown year plan was passed (as ב assumes א):
  // that assumption lives only in app.clsSummer (planningCls). Elsewhere a course taught only in summer says so.
  // "רק ב׳" makes the year view's assumption too (audit #42): an א׳ candidate counts as passed for a ב׳ course after it
  app.cls = withAfterA(app.data, app.state, classify(app.data, app.state), app.state.scope === 'ב' ? app.sem['א'] : null);
  const st = { ...app.state, passed: [...new Set([...(app.state.passed ?? []), ...app.state.yearIds])] };
  app.clsSummer = summerScope() ? classify(app.data, st) : null;
  if (!summerScope()) summerOnly(app.cls.statuses, app.sem?.['קיץ'], summerOn());
  save();
  keepFocus(() => renderers.forEach((r) => r()));
}

// Four steps, one page: #me, #courses, #prefs (and #edit, the edit page); any other hash (friend and backup links too) is the plans.
const HASH = { me: '#me', courses: '#courses', prefs: '#prefs', plan: '' };
export const STEPS = Object.keys(HASH);
// The edit page (#edit, #edit/changes) is its own route, checked first.
export const isEditHash = (h) => h === '#edit' || h.startsWith('#edit/');
export const routeOf = (h) => (isEditHash(h) ? 'edit' : (STEPS.find((v) => HASH[v] === h && h) ?? 'plan'));
// routeOf's inverse: the hash that shows a view
export const hashOf = (view) => (view === 'edit' ? '#edit' : Object.hasOwn(HASH, view) ? HASH[view] : '');

const SKELETON = `<div class="skel" role="status"><span class="sr">טוען את מערכת השעות…</span><div class="skel-grid" aria-hidden="true">${'<div><i></i><i></i><i></i></div>'.repeat(5)}</div></div>`;

async function fetchSemesters(s) {
  const get = async (sem) => {
    // revalidate (ETag) so a nightly update shows up at once
    const res = await fetch(dataPath(s, sem), { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    const d = await res.json();
    if (!isObj(d?.courses)) throw new Error('a data file with no courses'); // or the page would stay on its loading skeleton
    return d;
  };
  const [a, b, c] = await Promise.allSettled([get('א'), get('ב'), get('קיץ')]);
  if (a.status === 'rejected') throw a.reason;
  return {
    'א': a.value,
    'ב': b.status === 'fulfilled' ? b.value : null,
    'קיץ': c.status === 'fulfilled' ? c.value : null
  };
}
function setSemesters(sem) {
  app.sem = sem;
  app.semNotice = sem['ב'] ? null : 'נתוני סמסטר ב׳ לא נטענו, מתכננים סמסטר אחד.';
  groupSem = null;
  pickData();
}

// The personal part of the state (who you are, how you plan) survives a program change; what you passed does not.
const PERSONAL = ['name', 'friends', 'weights', 'prefsNote', 'constraints', 'load', 'sortBy', 'programSet'];
// What the student did in the program: kept over a cohort switch of the same program (switchTo), passed apart
const RECORD = ['failed', 'grades', 'exempt', 'outsideDone', 'choices', 'retakeSeen', 'specDraft'];
const withPersonal = (to, from) => {
  for (const k of PERSONAL) to[k] = structuredClone(from[k]);
  to.scope = 'year';
  to.profile.amirnet = from.profile.amirnet;
  to.profile.summer = from.profile.summer;
  if (from.profile.turn) to.profile.turn = from.profile.turn;
  else delete to.profile.turn; // a cleared turn must not come back from the stash
  return to;
};
// Evening tracks: a day student is not asked to come before 16:00, so the default hours differ. They follow the track
// only while the student has not changed them.
export const eveningTrack = (catalog, program) =>
  /\(ערב\)$/.test(catalog?.programs?.find((p) => p.id === program)?.name ?? '');
const hoursOf = (catalog, program) =>
  (eveningTrack(catalog, program)
    ? { notBefore: '16:00', notAfter: '' }
    : { notBefore: DEFAULT.constraints.notBefore, notAfter: DEFAULT.constraints.notAfter });
function followTrackHours(constraints, catalog, from, to) {
  const was = hoursOf(catalog, from),
    now = hoursOf(catalog, to);
  if (constraints.notBefore === was.notBefore && constraints.notAfter === was.notAfter) Object.assign(constraints, now);
}
let switchGen = 0;
// Switch program/cohort: every needed file first, the state only after they all arrived (a failed switch changes nothing). A newer choice cancels an older one.
export async function switchTo(program, startYear) {
  const prev = app.state;
  // counted before the early returns: going back to the current program cancels a switch still loading
  const gen = ++switchGen;
  if (!inCatalog(app.catalog, program, startYear) || (prev.program === program && prev.startYear === startYear))
    return false;
  let sem;
  try {
    sem = await fetchSemesters({ ...prev, program, startYear });
  } catch {
    return gen === switchGen ? null : false; // null: this choice could not load, and the student should hear it (ui-actions.js changeIdentity)
  }
  if (gen !== switchGen) return false;
  stash(prev);
  const saved = normalize(unstash(program, startYear), app.catalog);
  const back = saved.program === program && saved.startYear === startYear && !!unstash(program, startYear);
  // The cohort sets the study year, unless the picked year has no cohort here and this is the nearest one (year ה׳ of an evening track: 2024)
  const want = prev.profile.year,
    own = want !== null && inCatalog(app.catalog, program, prev.year - want + 1);
  const year = want === null ? null : own ? clamp(prev.year - startYear + 1, 1, 5) : want;
  const next = back
    ? saved
    // normalize: the catalog's year
    : { ...normalize(null, app.catalog), program, startYear, profile: { ...cleanProfile({}), year } };
  // the year just picked (CHG.pyear sets it first), not the stash's older one
  if (back && prev.profile.year !== null) next.profile.year = prev.profile.year;
  app.state = withPersonal(next, prev);
  // Same program, another cohort = the study year picked (CHG.pyear): the record is the student's, not the cohort's
  // (bot report 1.1). Earlier years are still assumed passed, except a course on file as failed.
  const sameProgram = program === prev.program;
  if (sameProgram) {
    for (const k of RECORD) app.state[k] = structuredClone(prev[k]);
    app.state.profile.specs = [...prev.profile.specs];
  }
  followTrackHours(app.state.constraints, app.catalog, prev.program, program);
  setSemesters(sem);
  if (sameProgram && (app.passOpen() || app.holdFill > 0)) {
    // design A's first run (and a year change that asks): the earlier years are the student's list to tick, not added here
    app.state.passed = [...(prev.passed ?? [])];
    app.state.assumed = [...(prev.assumed ?? [])];
  } else if (sameProgram) {
    const had = prev.passed ?? [],
      added = earlierYears().filter((id) => !app.state.failed[id] && !had.includes(id));
    app.state.passed = [...new Set([...had, ...added])];
    app.state.assumed = [...new Set([...(prev.assumed ?? []), ...added])];
  } else ensurePassed();
  uiReset();
  return true;
}

export async function loadCatalog() {
  const cat = await fetch('data/afeka/catalog.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return goodCatalog(cat) ? cat : FALLBACK_CATALOG;
}

async function init() {
  document.getElementById('week').innerHTML = SKELETON; // replaced by the first render, or by the failure message
  app.catalog = await loadCatalog();
  app.state = load();
  app.firstLoad();
  const status = fetch('data/afeka/status.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const settings = fetch('settings.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  let sem;
  try {
    sem = await fetchSemesters(app.state);
  } catch {
    sem = null;
  }
  app.status = await status;
  app.settings = cleanSettings(await settings);
  const failed = () => {
    app.cls = null; // a failure after the data was classified: ui-plan.js onHash must not route as if all were well
    app.loadFailed = true; // the step bar still switches pages (ui-plan.js onHash), each showing this message
    // design A also has the friends and the take-out tools, which would otherwise open as empty sheets
    const A = document.documentElement.dataset.design === 'a';
    // A focuses and names a tool by its heading, so the failure keeps one
    const HEAD = { me: 'meTitle', prefs: 'prefsTitle', edit: 'editTitle', friends: 'friendsPageTitle', out: 'outTitle' };
    for (const id of A ? ['week', 'me', 'side', 'prefs', 'edit', 'friends', 'out'] : ['week', 'me', 'side', 'prefs', 'edit']) {
      const el = document.getElementById(id);
      el.innerHTML =
        (A && HEAD[id] ? `<h2 id="${HEAD[id]}" tabindex="-1" class="sr">טעינת הנתונים נכשלה</h2>` : '') +
        '<div class="msg bad" role="alert"><div><b>טעינת הנתונים נכשלה</b>' +
        '<p>בדקו את החיבור לאינטרנט ונסו שוב.</p><p class="msg-actions"><button class="btn" data-retry>נסה שוב</button></p></div></div>';
      el.querySelector('[data-retry]').onclick = init;
    }
    dispatchEvent(new Event('hashchange')); // show the view the URL names (ui-plan.js onHash)
  };
  if (!sem) return failed();
  app.loadFailed = false;
  try {
    setSemesters(sem);
    await applyHash();
  } catch (e) {
    console.error(e); // a file that loaded and cannot be read: the same way out, not a skeleton forever
    failed();
  }
}

// Replace the state with a backup. Another program or cohort loads its data first; if that fails nothing changes and it returns false,
// or null when the failure can pass (the catalog or the data did not arrive), so a backup that waits is kept and tried again.
// A program the catalog lacks is refused (normalize would quietly turn it into the default program); a dropped cohort
// moves to the nearest one, like a saved state.
export async function restoreBackup(payload) {
  const p = normalize(payload, app.catalog);
  // Without the real catalog the saved state is protected (noSave): a restore would be saved over it, so none until the list loads
  if (app.catalog === FALLBACK_CATALOG) {
    app.hashError = 'רשימת התוכניות לא נטענה, הגיבוי לא שוחזר. נסו לרענן את הדף.';
    return null;
  }
  if (p.program !== payload?.program) {
    app.hashError = 'התוכנית של הגיבוי לא קיימת באתר, הגיבוי לא שוחזר.';
    return false;
  }
  if (p.program !== app.state.program || p.startYear !== app.state.startYear) {
    let sem;
    try {
      sem = await fetchSemesters(p);
    } catch (e) {
      app.hashError = 'לא הצלחנו לטעון את נתוני התוכנית של הגיבוי';
      // only a missing file (404, fetchSemesters) will not pass; no answer, an error page or a captive Wi-Fi's login page may
      return e?.message === '404' ? false : null;
    }
    setSemesters(sem);
  }
  // a link never switches the split on: that takes the visitor's own confirmation (CHG.split)
  p.constraints.split = false;
  // its split-only pins would leave a course with no schedule
  p.pins = pinsWithoutSplit(Object.values(app.sem), p.pins);
  app.state = p;
  // The edit page's part of the backup (an older link has none: the saved edit state stays). A stale tab takes it in memory and writes
  // nothing, like the rest of the restore (its notice already says to reload).
  if (payload?.edit) {
    const ok = restoreEdit(payload.edit, !app.otherTab);
    if (!app.otherTab) setEditSaveFailed(!ok);
  }
  uiReset();
  return true;
}

// Friend (#f=) and backup (#b=) links: read at load, and again when one is pasted into an open tab (hashchange in ui-plan.js).
let linkError = null;
// Ask before replacing saved state, then restore. Returns the hash to keep when the visitor cancelled (stay on the page the link was pasted into).
export const savedExists = () => {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}; // storage unavailable: nothing to replace
// whether state was saved before this visit's own first save (refresh() saves before the terms are accepted)
let pendingSaved = false;
let pendingLink = null; // the link that goes with app.pendingBackup, kept again if its restore fails for a reason that can pass
// A backup that waits for the terms is kept in storage too, as its link: the link leaves the address once read, so a reload, a closed tab
// or a back before "המשך" would otherwise lose it. It is read back through readHash, as the link was. applyPendingBackup removes it.
const WAITING = KEY + '-pending';
const storedWaiting = () => {
  try {
    return JSON.parse(localStorage.getItem(WAITING));
  } catch {
    return null;
  }
};
const asBackup = async (w) => {
  const h = typeof w?.link === 'string' ? await readHash(w.link, app.state) : null;
  return h?.type === 'backup' ? { payload: h.payload, saved: w.saved === true } : null;
};
const waiting = () => asBackup(storedWaiting());
const setWaiting = (link, saved) => {
  try {
    if (link) localStorage.setItem(WAITING, JSON.stringify({ link, saved }));
    else localStorage.removeItem(WAITING);
  } catch {
    // storage unavailable or full: it waits in memory only, as before, and an older link must not come back in its place
    try {
      localStorage.removeItem(WAITING);
    } catch {}
  }
};
let restoredOk = false; // the last backup run replaced the state (applyPendingBackup says so)
let retryLater = false; // the last backup run failed for a reason that can pass
const ASK = 'לשחזר גיבוי? המצב הנוכחי יוחלף.',
  ASK_AGAIN = 'גיבוי שנפתח קודם עוד לא שוחזר. לשחזר אותו עכשיו? המצב הנוכחי יוחלף.';
async function runBackup(payload, hadSaved = savedExists(), question = ASK) {
  if (!hadSaved || await askConfirm(question, { ok: 'שחזר גיבוי', cancel: 'השאר את המצב הנוכחי' })) {
    const r = await restoreBackup(payload);
    if (r) restoredOk = true;
    else {
      linkError = app.hashError; // its own message, cleared by the next good link like a bad link's
      retryLater = r === null;
    }
    return '';
  }
  return hashOf(document.body.dataset.view);
}
// A backup link opened before the terms were accepted: run it now (called after "המשך"). Returns true when it restored the state.
// again: a load after a restore that failed for a reason that can pass (applyHash).
export async function applyPendingBackup(again = false) {
  // taken and cleared in one step, before any await, so a second tap finds nothing to restore
  const mem = app.pendingBackup,
    memSaved = pendingSaved,
    raw = mem ? null : storedWaiting(), // a tab opened before another tab read the link has none in memory
    link = mem ? pendingLink : raw?.link;
  app.pendingBackup = null;
  pendingLink = null;
  setWaiting(null);
  const w = await asBackup(raw);
  const p = mem ?? w?.payload,
    first = mem ? memSaved : Boolean(w?.saved); // a record saved before the link arrived
  if (!p) return false;
  // a load after the failure: a pass still open holds nothing of the student's yet; a finished one may, so it asks first
  const ask = again && !app.passOpen() ? savedExists() : first;
  restoredOk = false;
  retryLater = false;
  const keep = await runBackup(p, ask, again ? ASK_AGAIN : ASK);
  // restored, declined, or a program the site lacks: it waits no more. A failure that can pass keeps the only copy
  // (an old address hands a record over once), and the next load runs it again.
  if (retryLater && link) setWaiting(link, first);
  if (keep) history.replaceState(null, '', location.pathname + location.search + keep);
  ensurePassed();
  refresh();
  return restoredOk;
}
export async function applyHash() {
  const link = location.hash;
  const h = await readHash(link, app.state);
  let keep = '';
  if (h) {
    // a good link clears a bad link's error, not the load notice ("the saved program is gone")
    app.hashError = h.error ?? (app.hashError === linkError ? null : app.hashError);
    linkError = h.error ?? null;
  }
  if (h?.type === 'backup') {
    if (app.termsOk()) {
      restoredOk = false;
      keep = await runBackup(h.payload);
      if (restoredOk) app.restoredRecord();
    }
    else {
      // a link that already waits knows better whether a state was saved: this visit's own first save came after it
      const before = app.pendingBackup ? null : await waiting();
      pendingSaved = before ? before.saved : app.pendingBackup ? pendingSaved : savedExists();
      app.pendingBackup = h.payload;
      pendingLink = link;
      setWaiting(link, pendingSaved); // a newer link replaces a waiting one
    } // the terms gate comes first (ACT.acceptTerms runs applyPendingBackup)
  } else if (!app.pendingBackup && !app.termsOk()) {
    // a reload or a new tab after the link was read: it still waits
    const raw = storedWaiting(),
      w = await asBackup(raw);
    if (w) {
      app.pendingBackup = w.payload;
      pendingSaved = w.saved;
      pendingLink = raw.link;
    }
  } else if (!app.pendingBackup && app.catalog !== FALLBACK_CATALOG && storedWaiting()) {
    // the terms were accepted and the restore failed for a reason that can pass: again, once the catalog is there to restore with
    if (await applyPendingBackup(true)) app.restoredRecord();
  }
  ensurePassed();
  if (h?.type === 'friend') app.friendLanding = h.payload;
  if (h) history.replaceState(null, '', location.pathname + location.search + keep);
  refresh();
}

if (typeof document !== 'undefined') init();
