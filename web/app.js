import { classify, withAfterA, cleanProfile, studyYear, modeFor } from './rules.js';
import { readHash } from './share.js';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const KEY = 'afeka-sched-v1';
const SEM_CODE = { 'א': 1, 'ב': 2, 'קיץ': 3 };
export const DEFAULT = {
  v: 1, year: 2027, semester: 'א', program: 30, startYear: 2026, name: '',
  passed: null, failed: {}, choices: {}, friends: [], pins: [], profile: { year: null, amirnet: null },
  scope: 'year', load: 'even', semesterOf: {},
  weights: { friends: 3, progress: 3, freeDays: 1, compact: 1, timeWindow: 1, examSpread: 1 },
  constraints: { dayOff: [6], dayOffHard: false, notBefore: '', notAfter: '20:00', windowHard: false, maxCredits: null, examsSameDay: 'forbid', includeFull: false },
};

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const strs = (a, max, len) => Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.length <= len).slice(0, max) : null;
const CONSTRAINT_OK = {
  dayOff: (v) => Array.isArray(v) && v.every((d) => Number.isInteger(d) && d >= 1 && d <= 6),
  dayOffHard: (v) => typeof v === 'boolean', windowHard: (v) => typeof v === 'boolean', includeFull: (v) => typeof v === 'boolean',
  notBefore: (v) => v === '' || (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v)),
  notAfter: (v) => v === '' || (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v)),
  maxCredits: (v) => v === null || (num(v) && v >= 0),
  examsSameDay: (v) => v === 'forbid' || v === 'allow',
};

// The one gate for state from localStorage and from backup links: only valid values get through.
// year/semester/program/startYear are never taken from input (a foreign program would 404 the data file forever).
export function normalize(raw) {
  const out = structuredClone(DEFAULT);
  if (!isObj(raw) || raw.v !== 1) return out;
  if (typeof raw.name === 'string' && raw.name.length <= 60) out.name = raw.name;
  const passed = strs(raw.passed, 200, 20);
  if (passed) out.passed = passed;
  if (isObj(raw.failed)) out.failed = Object.fromEntries(Object.entries(raw.failed).filter(([, v]) => Number.isInteger(v) && v >= 1 && v <= 3));
  if (isObj(raw.choices)) out.choices = Object.fromEntries(Object.entries(raw.choices).filter(([, v]) => ['must', 'optional', 'no'].includes(v)));
  if (Array.isArray(raw.friends)) {
    out.friends = raw.friends.filter((f) => isObj(f) && typeof f.name === 'string' && f.name.length <= 60 && Array.isArray(f.groups)).slice(0, 20)
      .map((f) => ({ name: f.name, groups: strs(f.groups, 40, 20), weight: num(f.weight) ? clamp(f.weight, 0, 3) : 1, active: typeof f.active === 'boolean' ? f.active : true }));
  }
  out.pins = strs(raw.pins, 40, 20) ?? out.pins;
  out.profile = cleanProfile(raw.profile);
  if (['year', 'א', 'ב'].includes(raw.scope)) out.scope = raw.scope;
  if (['א', 'even', 'ב'].includes(raw.load)) out.load = raw.load;
  if (isObj(raw.semesterOf)) out.semesterOf = Object.fromEntries(Object.entries(raw.semesterOf).filter(([k, v]) => k.length <= 20 && (v === 'א' || v === 'ב')).slice(0, 200));
  if (isObj(raw.weights)) for (const k of Object.keys(DEFAULT.weights)) if (num(raw.weights[k])) out.weights[k] = [0, 1, 3, 5].reduce((b, s) => (Math.abs(s - raw.weights[k]) <= Math.abs(b - raw.weights[k]) ? s : b), 0); // snap to the UI scale; ties go up like nearestStep
  if (isObj(raw.constraints)) for (const k of Object.keys(CONSTRAINT_OK)) if (CONSTRAINT_OK[k](raw.constraints[k])) out.constraints[k] = raw.constraints[k];
  return out;
}

function load() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY)); } catch { /* storage unavailable */ }
  return normalize(saved);
}
export const app = { state: null, data: null, sem: { 'א': null, 'ב': null }, semNotice: null, cls: null, friendLanding: null, hashError: null };

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
  app.data = scope === 'year' && B ? { ...yearView(A, B), fetchedAt: A.fetchedAt, examsPublished: A.examsPublished } : (scope === 'ב' && B ? B : A);
}
export function save() { try { localStorage.setItem(KEY, JSON.stringify(app.state)); } catch { /* storage unavailable */ } }
const dataPath = (s, sem = s.semester) => `data/afeka/${s.year}-${SEM_CODE[sem]}/${s.program}-${s.startYear}.json`;
const yearOneList = () => app.data.lists.find((l) => l.name.includes("שנה א'"));

// The study year's mandatory list (e.g. "שנה ב'"): courses in it default to optional.
export const yearCourses = () => app.data.lists.find((l) => l.name.includes(`שנה ${['', 'א', 'ב', 'ג', 'ד'][studyYear(app.data, app.state)]}'`))?.courses ?? [];
export const candidateMode = (id) => modeFor(app.cls.statuses[id]?.status, app.state.choices[id], yearCourses().includes(id));

// Rendering lives in ui-plan.js / ui-grid.js; they register here. Focus survives a re-render via data-k keys.
let renderers = [];
export function setRenderers(...fns) { renderers = fns; }
export function keepFocus(fn) {
  const k = document.activeElement?.dataset?.k;
  fn();
  if (k && document.activeElement?.dataset?.k !== k) document.querySelector(`[data-k="${CSS.escape(k)}"]`)?.focus({ preventScroll: true });
}

export function refresh() {
  pickData();
  app.cls = withAfterA(app.data, app.state, classify(app.data, app.state));
  save();
  keepFocus(() => renderers.forEach((r) => r()));
}

const SKELETON = `<div class="skel" role="status"><span class="sr">טוען את מערכת השעות…</span><div class="skel-grid" aria-hidden="true">${'<div><i></i><i></i><i></i></div>'.repeat(5)}</div></div>`;

async function init() {
  document.getElementById('week').innerHTML = SKELETON; // replaced by the first render, or by the failure message
  app.state = load();
  const get = async (sem) => {
    const res = await fetch(dataPath(app.state, sem));
    if (!res.ok) throw new Error(res.status);
    return res.json();
  };
  const [a, b] = await Promise.allSettled([get('א'), get('ב')]);
  if (a.status === 'rejected') {
    document.getElementById('week').innerHTML = '<div class="msg bad" role="alert"><div><b>טעינת הנתונים נכשלה</b><p>בדקו את החיבור לאינטרנט ונסו שוב. אם זה חוזר, איפוס הנתונים השמורים עשוי לעזור.</p><p class="msg-actions"><button class="btn" id="retry">נסה שוב</button> <button class="btn" id="reset">אפס נתונים שמורים</button></p></div></div>';
    document.getElementById('retry').onclick = init;
    document.getElementById('reset').onclick = () => { try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ } location.reload(); };
    return;
  }
  app.sem = { 'א': a.value, 'ב': b.status === 'fulfilled' ? b.value : null };
  app.semNotice = app.sem['ב'] ? null : 'נתוני סמסטר ב׳ לא נטענו, מתכננים סמסטר אחד.';
  groupSem = null;
  pickData();
  const h = await readHash(location.hash, app.state);
  if (h?.error) app.hashError = h.error;
  if (h?.type === 'backup') {
    let hadSaved = false;
    try { hadSaved = localStorage.getItem(KEY) !== null; } catch { /* storage unavailable */ }
    if (!hadSaved || typeof confirm !== 'function' || confirm('לשחזר גיבוי? המצב הנוכחי יוחלף.')) app.state = normalize(h.payload);
  }
  if (!app.state.passed) app.state.passed = [...(yearOneList()?.courses ?? [])];
  if (h?.type === 'friend') app.friendLanding = h.payload;
  if (h) history.replaceState(null, '', location.pathname);
  refresh();
}

if (typeof document !== 'undefined') init();
