import { classify, withAfterA, cleanProfile, studyYear, yearsOf, modeFor, specLists, specRule, validSpecs, summerOnly } from './rules.js';
import { readHash } from './share.js';
import { askConfirm } from './ui-dialog.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const KEY = 'afeka-sched-v1';
const SEM_CODE = { 'א': 1, 'ב': 2, 'קיץ': 3 };
export const DEFAULT = {
  v: 1, year: 2027, semester: 'א', program: 30, startYear: 2026, name: '',
  passed: null, failed: {}, grades: {}, choices: {}, friends: [], pins: [], profile: { year: null, amirnet: null, specs: [], summer: false },
  scope: 'year', load: 'even', semesterOf: {},
  specDraft: null, yearIds: [], // UI leftovers worth keeping over a refresh: a half-made specialization pick, and the year plan the summer tab builds on
  weights: { friends: 3, progress: 3, freeDays: 1, compact: 1, timeWindow: 1, examSpread: 1 },
  constraints: { dayOff: [6], dayOffHard: false, notBefore: '', notAfter: '20:00', windowHard: false, maxCredits: null, maxDays: null, examsSameDay: 'forbid', includeFull: false, blocks: [],
    lecturers: {} },
};

// The programs and cohorts the site has data for (data/afeka/catalog.json, written by the scraper). Without it: mechanical engineering 2026, the first program.
export const FALLBACK_CATALOG = { programs: [{ id: 30, name: 'הנדסה מכנית', startYears: [2026] }] };
export const inCatalog = (c, program, startYear) => !!c?.programs?.some((p) => p.id === program && p.startYears.includes(startYear));
const goodCatalog = (c) => isObj(c) && Array.isArray(c.programs) && c.programs.length > 0 && c.programs.every((p) => isObj(p) && Number.isInteger(p.id) && typeof p.name === 'string'
  && Array.isArray(p.startYears) && p.startYears.every(Number.isInteger)) && (c.year === undefined || Number.isInteger(c.year));
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const strs = (a, max, len) => Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.length <= len).slice(0, max) : null;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
// Personal busy time. Invalid items are dropped one by one (like friends), the rest are kept; times stay inside the 07:00-23:00 slot grid.
export const cleanBlocks = (a) => Array.isArray(a) ? a.filter((b) => isObj(b) && Number.isInteger(b.day) && b.day >= 1 && b.day <= 6 && typeof b.start === 'string' && typeof b.end === 'string'
  && HHMM.test(b.start) && HHMM.test(b.end) && b.start >= '07:00' && b.end <= '23:00' && b.start < b.end && typeof b.label === 'string' && b.label.length <= 30)
  .slice(0, 12).map((b) => ({ day: b.day, start: b.start, end: b.end, label: b.label })) : [];
const CONSTRAINT_OK = {
  dayOff: (v) => Array.isArray(v) && v.every((d) => Number.isInteger(d) && d >= 1 && d <= 6),
  dayOffHard: (v) => typeof v === 'boolean', windowHard: (v) => typeof v === 'boolean', includeFull: (v) => typeof v === 'boolean',
  notBefore: (v) => v === '' || (typeof v === 'string' && HHMM.test(v)),
  notAfter: (v) => v === '' || (typeof v === 'string' && HHMM.test(v)),
  maxCredits: (v) => v === null || (num(v) && v >= 0),
  maxDays: (v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 6),
  examsSameDay: (v) => v === 'forbid' || v === 'allow',
};

// The one gate for state from localStorage and from backup links: only valid values get through.
// year/semester are never taken from input (the year is the catalog's); program/startYear only when the catalog lists them (a foreign program would 404 the data file forever).
export function normalize(raw, catalog = FALLBACK_CATALOG) {
  const out = structuredClone(DEFAULT);
  if (Number.isInteger(catalog?.year)) out.year = catalog.year; // the academic year comes from the scraper's catalog: one place to roll over
  if (!isObj(raw) || raw.v !== 1) return out;
  const prog = catalog?.programs?.find((p) => p.id === raw.program); // a cohort the catalog dropped: the nearest one of the same program (ties: the later)
  if (prog?.startYears.length && Number.isInteger(raw.startYear)) {
    out.program = prog.id;
    out.startYear = prog.startYears.reduce((b, y) => (Math.abs(y - raw.startYear) < Math.abs(b - raw.startYear) || (Math.abs(y - raw.startYear) === Math.abs(b - raw.startYear) && y > b) ? y : b));
  }
  if (typeof raw.name === 'string' && raw.name.length <= 60) out.name = raw.name;
  const passed = strs(raw.passed, 200, 20);
  if (passed) out.passed = passed;
  if (isObj(raw.failed)) out.failed = Object.fromEntries(Object.entries(raw.failed).filter(([k, v]) => k.length <= 20 && Number.isInteger(v) && v >= 1 && v <= 3).slice(0, 200));
  if (isObj(raw.grades)) out.grades = Object.fromEntries(Object.entries(raw.grades).filter(([k, v]) => k.length <= 20 && Number.isInteger(v) && v >= 0 && v <= 100).slice(0, 200));
  if (isObj(raw.choices)) out.choices = Object.fromEntries(Object.entries(raw.choices).filter(([k, v]) => k.length <= 20 && ['must', 'optional', 'no'].includes(v)).slice(0, 200));
  if (Array.isArray(raw.friends)) {
    out.friends = raw.friends.filter((f) => isObj(f) && typeof f.name === 'string' && f.name.length <= 60 && Array.isArray(f.groups)).slice(0, 20)
      .map((f) => ({ name: f.name, groups: strs(f.groups, 40, 20), weight: num(f.weight) ? clamp(f.weight, 0, 3) : 1, active: typeof f.active === 'boolean'
        ? f.active : true, ...(f.manual === true ? { manual: true } : {}) }));
  }
  out.pins = strs(raw.pins, 40, 20) ?? out.pins;
  out.profile = cleanProfile(raw.profile);
  const draft = strs(raw.specDraft, 2, 20);
  if (draft && draft.length === 1 && /^[a-z][a-z0-9]{0,19}$/.test(draft[0])) out.specDraft = draft; // shape only (reconcileSpecs checks it against the data); a complete choice lives in profile.specs
  out.yearIds = strs(raw.yearIds, 60, 20) ?? [];
  if (['year', 'א', 'ב', 'קיץ'].includes(raw.scope)) out.scope = raw.scope;
  if (['א', 'even', 'ב'].includes(raw.load)) out.load = raw.load;
  if (isObj(raw.semesterOf)) out.semesterOf = Object.fromEntries(Object.entries(raw.semesterOf).filter(([k, v]) => k.length <= 20 && (v === 'א' || v === 'ב')).slice(0, 200));
  if (isObj(raw.weights)) for (const k of Object.keys(DEFAULT.weights)) if (num(raw.weights[k])) out.weights[k] = [0, 1, 3, 5].reduce((b,
    s) => (Math.abs(s - raw.weights[k]) <= Math.abs(b - raw.weights[k]) ? s : b), 0); // snap to the UI scale; ties go up like nearestStep
  if (isObj(raw.constraints)) for (const k of Object.keys(CONSTRAINT_OK)) if (CONSTRAINT_OK[k](raw.constraints[k])) out.constraints[k] = raw.constraints[k];
  if (isObj(raw.constraints)) out.constraints.blocks = cleanBlocks(raw.constraints.blocks);
  if (isObj(raw.constraints?.lecturers)) out.constraints.lecturers = Object.fromEntries(Object.entries(raw.constraints.lecturers)
    .filter(([k, v]) => k.length <= 60 && (v === 'prefer' || v === 'avoid')).slice(0, 30));
  return out;
}

// A saved program the catalog lacks is never overwritten: without the real catalog nothing is saved this visit; a program the site dropped is kept aside.
export function load() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY)); } catch { /* storage unavailable */ }
  const s = normalize(saved, app.catalog);
  app.noSave = false;
  if (!isObj(saved) || saved.v !== 1 || !Number.isInteger(saved.program)) return s;
  const fallback = app.catalog === FALLBACK_CATALOG, moved = s.program !== saved.program;
  if (fallback && (moved || s.startYear !== saved.startYear)) {
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
const stash = (s) => { try { localStorage.setItem(stashKey(s.program, s.startYear), JSON.stringify(s)); } catch { /* storage unavailable */ } };
const unstash = (p, y) => { try { return JSON.parse(localStorage.getItem(stashKey(p, y))); } catch { return null; } };
export function clearSaved() { try { for (const k of Object.keys(localStorage)) if (k.startsWith(KEY)) localStorage.removeItem(k); } catch { /* storage unavailable */ } }
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
export function upsertFriend(friends, p, editing = null) {
  const at = (n) => friends.findIndex((f) => f.name === n);
  let ti = editing == null ? -1 : at(editing);
  if (ti < 0) ti = at(p.name);
  if (ti < 0 && friends.length >= 20) return { friends, replaced: false, error: 'אפשר עד 20 חברים. הסירו חבר כדי להוסיף.' };
  const prev = friends[ti];
  const next = { name: p.name, groups: p.groups, weight: prev?.weight ?? 1, active: prev?.active ?? true, ...(p.manual === true ? { manual: true } : {}) };
  if (ti < 0) return { friends: [...friends, next], replaced: false };
  return { friends: friends.map((f, i) => (i === ti ? next : f)).filter((f, i) => i === ti || f.name !== p.name), replaced: true };
}

export const app = { catalog: FALLBACK_CATALOG, loadFailed: false, state: null, data: null, sem: { 'א': null, 'ב': null }, semNotice: null, cls: null, planIds: new Set(), summerIds: [],
  friendLanding: null, hashError: null, noSave: false };

// Both semesters as one catalogue: a course is offered if either semester offers it; groups are merged (ids are disjoint).
export function yearView(dataA, dataB) {
  const courses = {};
  for (const [id, a] of Object.entries(dataA.courses)) {
    const b = dataB.courses[id];
    courses[id] = { ...a, offered: !!(a.offered || b?.offered), groups: [...a.groups, ...(b?.groups ?? [])], semesters: [...(a.offered ? ['א'] : []), ...(b?.offered ? ['ב'] : [])] };
  }
  for (const [id, b] of Object.entries(dataB.courses)) if (!courses[id]) courses[id] = { ...b, semesters: b.offered ? ['ב'] : [] };
  return { ...dataA, semester: 'שנה', courses };
}
let groupSem = null;
export const semOfGroup = (gid) => {
  if (!groupSem) {
    groupSem = new Map();
    for (const sem of ['א', 'ב']) for (const c of Object.values(app.sem[sem]?.courses ?? {})) for (const g of c.groups) groupSem.set(g.id, sem);
  }
  return groupSem.get(gid) ?? null;
};
// app.data = year view, or the single chosen semester's file (also the fallback when ב is missing).
export function pickData() {
  const { א: A, ב: B } = app.sem, scope = app.state.scope;
  app.data = summerScope() ? app.sem['קיץ'] : scope === 'year' && B ? { ...yearView(A, B), fetchedAt: A.fetchedAt, examsPublished: A.examsPublished } : (scope === 'ב' && B ? B : A);
}
// Summer is planned after the school year: on only when the profile asks for it and the summer file loaded.
export const summerOn = () => !!(app.state?.profile.summer && app.sem?.['קיץ']);
export const summerScope = () => app.state?.scope === 'קיץ' && summerOn();
export function save() { if (app.noSave) return; try { localStorage.setItem(KEY, JSON.stringify(app.state)); } catch { /* storage unavailable */ } }
const dataPath = (s, sem = s.semester) => `data/afeka/${s.year}-${SEM_CODE[sem]}/${s.program}-${s.startYear}.json`;
const yearOneList = () => app.data.lists.find((l) => l.name.includes("שנה א'"));
// First time: the earlier years are assumed passed; a first-year student has passed nothing.
export function ensurePassed() { if (!app.state.passed) app.state.passed = studyYear(app.data, app.state) > 1 ? [...(yearOneList()?.courses ?? [])] : []; }

// The study year's mandatory list (e.g. "שנה ב'"): courses in it default to optional. From year 3 the chosen specialization areas' courses (mandatory and elective) join it.
export function yearCourses() {
  const y = studyYear(app.data, app.state), list = app.data.lists.find((l) => l.name.includes(`שנה ${' אבגדה'[y]}'`))?.courses ?? [];
  if (y < 3) return list;
  const sp = specLists(app.data, app.state.profile.specs);
  return [...list, ...sp.mandatory, ...sp.elective];
}
export const candidateMode = (id) => modeFor(app.cls.statuses[id]?.status, app.state.choices[id], yearCourses().includes(id));

// Rendering lives in ui-plan.js / ui-grid.js; they register here. Focus survives a re-render via data-k keys.
let renderers = [];
export function setRenderers(...fns) { renderers = fns; }
// What the UI keeps for the current program (results, colors, a half-made pick) must go when the state is replaced; ui-actions.js registers it.
let uiReset = () => {};
export function setUiReset(fn) { uiReset = fn; }
export function keepFocus(fn) {
  const k = document.activeElement?.dataset?.k;
  fn();
  if (k && document.activeElement?.dataset?.k !== k) document.querySelector(`[data-k="${CSS.escape(k)}"]`)?.focus({ preventScroll: true });
}

// A saved choice must fit the loaded program: another program's area ids (or a different pick count) would mislead the progress map and the lists.
// An area the program dropped (industrial engineering's old main+secondary pair, mechanical evening's three areas) leaves the others: a whole choice
// when they still make `pick`, else a draft. One area never becomes a standalone choice by itself (vehicle alone adds a mandatory list).
export function reconcileSpecs() {
  const { profile } = app.state, rule = specRule(app.data), ok = validSpecs(app.data, profile.specs);
  const known = (ids) => (app.data.specializations ?? []).map((s) => s.id).filter((id) => ids.includes(id));
  if (profile.year > yearsOf(app.data)) profile.year = yearsOf(app.data); // a two-year program has no year ג׳ (the same check as the data: once per load)
  if (ok.join() !== profile.specs.join()) {
    const left = known(profile.specs);
    profile.specs = left.length === rule.pick ? validSpecs(app.data, left) : [];
    if (!profile.specs.length && left.length && left.length < rule.pick && !app.state.specDraft) app.state.specDraft = left;
  }
  const draft = app.state.specDraft;
  if (draft && !profile.specs.length && draft.length === rule.pick && validSpecs(app.data, draft).length) { profile.specs = validSpecs(app.data, draft); app.state.specDraft = null; }
  if (draft && !(draft.length < rule.pick && known(draft).length === draft.length)) app.state.specDraft = null;
}

export function refresh() {
  if (app.state.scope === 'קיץ' && !app.state.profile.summer) app.state.scope = 'year'; // summer switched off; a summer file that failed to load keeps the choice
  pickData();
  reconcileSpecs();
  // Summer assumes the shown year plan is passed (as ב assumes א); elsewhere a course taught only in summer says so.
  const st = summerScope() ? { ...app.state, passed: [...new Set([...(app.state.passed ?? []), ...app.state.yearIds])] } : app.state;
  app.cls = withAfterA(app.data, st, classify(app.data, st));
  if (!summerScope()) summerOnly(app.cls.statuses, app.sem?.['קיץ'], summerOn());
  save();
  keepFocus(() => renderers.forEach((r) => r()));
}

// Two views in one page: #me is the status page, any other hash (friend and backup links too) is the builder.
export const routeOf = (h) => (h === '#me' ? 'me' : 'plan');
export const hashOf = (view) => (view === 'me' ? '#me' : ''); // routeOf's inverse: the hash that shows a view

const SKELETON = `<div class="skel" role="status"><span class="sr">טוען את מערכת השעות…</span><div class="skel-grid" aria-hidden="true">${'<div><i></i><i></i><i></i></div>'.repeat(5)}</div></div>`;

async function fetchSemesters(s) {
  const get = async (sem) => {
    const res = await fetch(dataPath(s, sem), { cache: 'no-cache' }); // revalidate (ETag) so a nightly update shows up at once
    if (!res.ok) throw new Error(res.status);
    return res.json();
  };
  const [a, b, c] = await Promise.allSettled([get('א'), get('ב'), get('קיץ')]);
  if (a.status === 'rejected') throw a.reason;
  return { 'א': a.value, 'ב': b.status === 'fulfilled' ? b.value : null, 'קיץ': c.status === 'fulfilled' ? c.value : null };
}
function setSemesters(sem) {
  app.sem = sem;
  app.semNotice = sem['ב'] ? null : 'נתוני סמסטר ב׳ לא נטענו, מתכננים סמסטר אחד.';
  groupSem = null;
  pickData();
}

// The personal part of the state (who you are, how you plan) survives a program change; what you passed does not.
const PERSONAL = ['name', 'friends', 'weights', 'constraints', 'load'];
const withPersonal = (to, from) => {
  for (const k of PERSONAL) to[k] = structuredClone(from[k]);
  to.scope = 'year';
  to.profile.amirnet = from.profile.amirnet;
  to.profile.summer = from.profile.summer;
  return to;
};
// Evening tracks: a day student is not asked to come before 16:00, so the default hours differ. They follow the track only while the student has not changed them.
export const eveningTrack = (catalog, program) => /\(ערב\)$/.test(catalog?.programs?.find((p) => p.id === program)?.name ?? '');
const hoursOf = (catalog, program) => (eveningTrack(catalog, program) ? { notBefore: '16:00', notAfter: '' } : { notBefore: DEFAULT.constraints.notBefore, notAfter: DEFAULT.constraints.notAfter });
function followTrackHours(constraints, catalog, from, to) {
  const was = hoursOf(catalog, from), now = hoursOf(catalog, to);
  if (constraints.notBefore === was.notBefore && constraints.notAfter === was.notAfter) Object.assign(constraints, now);
}
let switchGen = 0;
// Switch program/cohort: every needed file first, the state only after they all arrived (a failed switch changes nothing). A newer choice cancels an older one.
export async function switchTo(program, startYear) {
  const prev = app.state;
  if (!inCatalog(app.catalog, program, startYear) || (prev.program === program && prev.startYear === startYear)) return false;
  const gen = ++switchGen;
  let sem;
  try { sem = await fetchSemesters({ ...prev, program, startYear }); } catch { return false; }
  if (gen !== switchGen) return false;
  stash(prev);
  const saved = normalize(unstash(program, startYear), app.catalog);
  const back = saved.program === program && saved.startYear === startYear && !!unstash(program, startYear);
  // The cohort sets the study year, unless the picked year has no cohort here and this is the nearest one (year ה׳ of an evening track: 2024)
  const want = prev.profile.year, own = want !== null && inCatalog(app.catalog, program, prev.year - want + 1);
  const year = want === null ? null : own ? clamp(prev.year - startYear + 1, 1, 5) : want;
  const next = back ? saved : { ...normalize(null, app.catalog), program, startYear, profile: { ...cleanProfile({}), year } }; // normalize: the catalog's year
  if (back && prev.profile.year !== null) next.profile.year = prev.profile.year; // the year just picked (CHG.pyear sets it first), not the stash's older one
  app.state = withPersonal(next, prev);
  followTrackHours(app.state.constraints, app.catalog, prev.program, program);
  setSemesters(sem);
  ensurePassed();
  uiReset();
  return true;
}

async function init() {
  document.getElementById('week').innerHTML = SKELETON; // replaced by the first render, or by the failure message
  const cat = await fetch('data/afeka/catalog.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  app.catalog = goodCatalog(cat) ? cat : FALLBACK_CATALOG;
  app.state = load();
  const status = fetch('data/afeka/status.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  let sem;
  try { sem = await fetchSemesters(app.state); } catch { sem = null; }
  app.status = await status;
  if (!sem) {
    app.loadFailed = true; // the nav tabs still switch views (ui-plan.js onHash), both showing this message
    for (const id of ['week', 'me']) {
      const el = document.getElementById(id);
      el.innerHTML = '<div class="msg bad" role="alert"><div><b>טעינת הנתונים נכשלה</b>' +
        '<p>בדקו את החיבור לאינטרנט ונסו שוב. אם זה חוזר, איפוס הנתונים השמורים עשוי לעזור.</p><p class="msg-actions">' +
        '<button class="btn" data-retry>נסה שוב</button> <button class="btn" data-reset>אפס נתונים שמורים</button></p></div></div>';
      el.querySelector('[data-retry]').onclick = init;
      el.querySelector('[data-reset]').onclick = () => { clearSaved(); location.reload(); };
    }
    dispatchEvent(new Event('hashchange')); // show the view the URL names (ui-plan.js onHash)
    return;
  }
  app.loadFailed = false;
  setSemesters(sem);
  await applyHash();
}

// Replace the state with a backup. Another program or cohort loads its data first; if that fails nothing changes and it returns false.
// A program the catalog lacks is refused (normalize would quietly turn it into the default program); a dropped cohort moves to the nearest one, like a saved state.
export async function restoreBackup(payload) {
  const p = normalize(payload, app.catalog);
  // Without the real catalog the saved state is protected (noSave): a restore would be saved over it, so none until the list loads
  if (app.catalog === FALLBACK_CATALOG) { app.hashError = 'רשימת התוכניות לא נטענה, הגיבוי לא שוחזר. נסו לרענן את הדף.'; return false; }
  if (p.program !== payload?.program) { app.hashError = 'התוכנית של הגיבוי לא קיימת באתר, הגיבוי לא שוחזר.'; return false; }
  if (p.program !== app.state.program || p.startYear !== app.state.startYear) {
    let sem;
    try { sem = await fetchSemesters(p); } catch { app.hashError = 'לא הצלחנו לטעון את נתוני התוכנית של הגיבוי'; return false; }
    setSemesters(sem);
  }
  app.state = p;
  uiReset();
  return true;
}

// Friend (#f=) and backup (#b=) links: read at load, and again when one is pasted into an open tab (hashchange in ui-plan.js).
let linkError = null;
export async function applyHash() {
  const h = await readHash(location.hash, app.state);
  let keep = '';
  if (h) { // a good link clears a bad link's error, not the load notice ("the saved program is gone")
    app.hashError = h.error ?? (app.hashError === linkError ? null : app.hashError);
    linkError = h.error ?? null;
  }
  if (h?.type === 'backup') {
    let hadSaved = false;
    try { hadSaved = localStorage.getItem(KEY) !== null; } catch { /* storage unavailable */ }
    if (!hadSaved || await askConfirm('לשחזר גיבוי? המצב הנוכחי יוחלף.', { ok: 'שחזר גיבוי', cancel: 'השאר את המצב הנוכחי' })) {
      if (!await restoreBackup(h.payload)) linkError = app.hashError; // its own message, cleared by the next good link like a bad link's
    } else keep = hashOf(document.body.dataset.view); // cancelled: stay on the page the link was pasted into
  }
  ensurePassed();
  if (h?.type === 'friend') app.friendLanding = h.payload;
  if (h) history.replaceState(null, '', location.pathname + keep);
  refresh();
}

if (typeof document !== 'undefined') init();
