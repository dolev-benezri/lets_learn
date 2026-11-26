// The edit page's saved state (spec: "Data"). Its own localStorage key, read through its own normalize: unknown or bad
// fields are dropped, never trusted. Nothing here touches the build page's save (`afeka-sched-v1`).
export const EDIT_KEY = 'afeka-sched-v1-edit';

const SEMS = ['א', 'ב', 'קיץ'], VIA = ['code', 'name', 'grid', 'xlsx'], CONF = ['sure', 'weak', 'tie', 'none'];
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const str = (x, max) => typeof x === 'string' && x.length <= max;
const strOrNull = (x, max) => x === null || str(x, max);
const strs = (a, max = 40, cap = 200) => (Array.isArray(a) ? [...new Set(a.filter((x) => str(x, max)))].slice(0, cap) : []);
const hhmm = (x) => typeof x === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(x);
const day = (x) => Number.isInteger(x) && x >= 1 && x <= 6;

export const emptyEdit = () => ({
  v: 1,
  dataset: null,
  registered: false,
  owned: [],
  original: [],
  baseline: [],
  movable: [],
  swaps: {},
  added: [],
  removed: [],
  goal: { dayOff: null, notAfter: null, fewerGaps: false },
  draft: null
});

// Lesson = { course, name, type, group | null, day 1-6, start, end }
const lesson = (l) =>
  isObj(l) && str(l.course, 20) && str(l.name, 100) && str(l.type, 60) && strOrNull(l.group, 40) &&
  day(l.day) && hhmm(l.start) && hhmm(l.end)
    ? { course: l.course, name: l.name, type: l.type, group: l.group, day: l.day, start: l.start, end: l.end }
    : null;
const lessons = (a) => (Array.isArray(a) ? a.map(lesson).filter(Boolean).slice(0, 100) : []);

// ReviewRow (web/friend-schedule.js), field by field
const reviewRow = (r) => {
  if (!isObj(r) || !strOrNull(r.code, 40) || !strOrNull(r.name, 100) || !strOrNull(r.type, 60) || typeof r.text !== 'string') return null;
  if (!VIA.includes(r.via) || !CONF.includes(r.confidence) || !strOrNull(r.chosen, 40)) return null;
  if (!Array.isArray(r.meets) || !Array.isArray(r.candidates)) return null;
  const meets = r.meets.filter((m) => isObj(m) && day(m.day) && hhmm(m.start) && hhmm(m.end));
  if (meets.length !== r.meets.length) return null;
  return {
    code: r.code, name: r.name, type: r.type, text: r.text.slice(0, 400), via: r.via, confidence: r.confidence, chosen: r.chosen,
    meets: meets.slice(0, 20).map((m) => ({ day: m.day, start: m.start, end: m.end })),
    candidates: strs(r.candidates, 40, 50)
  };
};

// A bad row is dropped; choices are keyed by row index, so they are re-keyed to the rows that stay.
function draftOf(d) {
  if (!isObj(d) || !Array.isArray(d.rows)) return null;
  const rows = [], choices = {};
  d.rows.slice(0, 100).forEach((raw, i) => {
    const r = reviewRow(raw), v = isObj(d.choices) ? d.choices[i] : undefined;
    if (!r) return;
    if (v !== undefined && strOrNull(v, 40)) choices[rows.length] = v;
    rows.push(r);
  });
  // Missing on older drafts: keep their saved-baseline-first preview behavior.
  return { rows, choices, registered: d.registered === true, sem: SEMS.includes(d.sem) ? d.sem : null,
    ...(typeof d.committed === 'boolean' ? { committed: d.committed } : {}) };
}

export function normalizeEdit(raw) {
  const out = emptyEdit();
  if (!isObj(raw) || raw.v !== 1) return out;
  const ds = raw.dataset;
  if (isObj(ds) && Number.isInteger(ds.year) && SEMS.includes(ds.sem) && Number.isInteger(ds.program) && Number.isInteger(ds.startYear))
    out.dataset = { year: ds.year, sem: ds.sem, program: ds.program, startYear: ds.startYear };
  out.registered = raw.registered === true;
  out.original = lessons(raw.original);
  out.baseline = lessons(raw.baseline);
  const inOriginal = new Set(out.original.map((l) => l.group).filter(Boolean));
  out.owned = strs(raw.owned).filter((id) => inOriginal.has(id));
  out.movable = strs(raw.movable, 20, 100);
  out.added = strs(raw.added, 20, 100);
  out.removed = strs(raw.removed, 20, 100);
  if (isObj(raw.swaps))
    for (const [k, v] of Object.entries(raw.swaps).slice(0, 100)) if (str(k, 20)) out.swaps[k] = strs(v, 40, 20);
  const g = raw.goal;
  if (isObj(g)) {
    out.goal = {
      dayOff: day(g.dayOff) ? g.dayOff : null,
      notAfter: hhmm(g.notAfter) ? g.notAfter : null,
      fewerGaps: g.fewerGaps === true
    };
  }
  out.draft = draftOf(raw.draft);
  return out;
}

export function loadEdit() {
  try {
    return normalizeEdit(JSON.parse(localStorage.getItem(EDIT_KEY)));
  } catch {
    return emptyEdit(); // no storage, or a broken save
  }
}

// true: stored. false: blocked, full or missing; the page keeps working from memory and says so (app.js setEditSaveFailed).
export function saveEdit(st) {
  try {
    localStorage.setItem(EDIT_KEY, JSON.stringify(st));
    held = canon(st);
    return true;
  } catch {
    return false;
  }
}

// This tab's copy of the saved state: read once, replaced by each commit of the edit page and by a restored backup.
// `held`: the last state this tab read from the key or wrote to it (null: it never has), what editMoved compares the key with.
// A copy whose save failed is ahead of it, not different from it.
let E = null;
let held = null;
let restored = 0;
export const getEdit = () => {
  if (!E) {
    E = loadEdit();
    held = canon(E);
  }
  return E;
};
export const setEdit = (st) => {
  held ??= canon(loadEdit()); // a copy set before the key was ever read or written here: the stored state is what it started from
  E = st;
};
export const forgetEdit = () => {
  E = null;
  held = null;
};
// A backup replaced the copy: what the edit page had worked out (its proposals) was for the old one (ui-edit.js stamp).
export const restoredCount = () => restored;
// `write` false (a stale tab: another tab holds a newer copy): the page takes the state, the storage is left alone.
export function restoreEdit(raw, write = true) {
  const st = normalizeEdit(raw);
  setEdit(st);
  restored++;
  return write ? saveEdit(st) : false;
}

// The part of the state a backup link carries: the loaded schedule and the work on it, without the import draft (rows of text
// read from a file would make the link long for nothing). null: no schedule was loaded, so the link has no edit part.
export function backupEdit() {
  const st = getEdit();
  return st.original.length ? { ...st, draft: null } : null;
}

// Another tab wrote the edit key: is this tab's copy old now? Only when this tab has read the state and what is stored now differs
// from what it read or wrote last (key order and what normalize fills in do not count). It reads the key itself, not the event's
// value: events queue, and an older one must not freeze a tab that has read the newer state since.
const canon = (st) =>
  JSON.stringify(normalizeEdit(st), (_, x) => (isObj(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
export function editMoved() {
  if (held === null) return false; // never read here: nothing stale to protect, the next read gets the new state
  let stored;
  try {
    stored = localStorage.getItem(EDIT_KEY);
  } catch {
    return false; // no storage: no other tab either
  }
  try {
    return canon(JSON.parse(stored)) !== held;
  } catch {
    return true; // a broken value is not what this tab read
  }
}

// One lesson per meeting of each group (a meeting with no day or hours cannot be placed and is skipped).
export function lessonsOf(groupIds, data) {
  const owner = new Map();
  for (const [cid, c] of Object.entries(data?.courses ?? {})) for (const g of c.groups) owner.set(g.id, [cid, c, g]);
  return groupIds.flatMap((id) => {
    const [cid, c, g] = owner.get(id) ?? [];
    const mk = (m) => lesson({ course: cid, name: c.name, type: g.type, group: id, day: m.day, start: m.start, end: m.end });
    return g ? g.meetings.map(mk).filter(Boolean) : [];
  });
}

const copy = (l) => l.map((x) => ({ ...x }));
const cleared = { movable: [], swaps: {}, added: [], removed: [] };

export function loadSchedule(st, ls, dataset, registered) {
  const owned = registered ? [...new Set(ls.map((l) => l.group).filter(Boolean))] : [];
  return {
    ...emptyEdit(), dataset, registered: registered === true, owned, original: copy(ls), baseline: copy(ls)
  };
}

export const restoreOriginal = (st) => ({ ...st, baseline: copy(st.original), ...structuredClone(cleared) });

// A saved proposal is not registered: owned and original stay as they are.
export const saveProposal = (st, ls) => ({ ...st, baseline: copy(ls), ...structuredClone(cleared) });

export const datasetOf = (data, state = {}) => ({
  year: data.year, sem: data.semester, program: data.program ?? state.program, startYear: data.startYear ?? state.startYear
});

// Does the saved schedule belong to the data file now shown?
export function sameDataset(st, data, state) {
  const d = st.dataset, now = datasetOf(data, state);
  return !!d && d.year === now.year && d.sem === now.sem && d.program === now.program && d.startYear === now.startYear;
}
