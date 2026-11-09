// The edit page's search (spec: "Search"): the edit state becomes one `search` call. No DOM.
import { classify } from './rules.js';
import { toMin } from './solver-core.js';
import { lessonsOf } from './edit-state.js';
import { DEFAULT } from './app.js'; // importing app.js has no side effects (no DOM at import): the build defaults live there

export const FIXED = 'fixed:';
export const FIXED_COURSE = 'fixed:all';
const FIXED_GROUP = 'fixed:g';

const hasGroup = (data, l) => !!l.group && !!data.courses[l.course]?.groups.some((g) => g.id === l.group);
const uniq = (a) => [...new Set(a)];

// A course is fixed when any baseline lesson has no group in the data or the course is not in the data; a fixed course that
// exists in the data and is marked movable counts as real (it is searched with all its options).
export function kinds(edit, data) {
  const ids = uniq(edit.baseline.map((l) => l.course)),
    broken = (id) => !data.courses[id] || edit.baseline.some((l) => l.course === id && !hasGroup(data, l)),
    fixed = ids.filter((id) => broken(id) && !(data.courses[id] && edit.movable.includes(id)));
  return { real: ids.filter((id) => !fixed.includes(id)), fixed };
}

// Every parallel requirement a course has, as { key: '<course>#<n>', ids }, n = its index in `prereqs`.
const parallelsOf = (id, data) =>
  data.courses[id].prereqs.flatMap((p, n) => (p.kind === 'מקביל' ? [{ key: `${id}#${n}`, ids: p.anyOf.map((a) => a.id).filter(Boolean) }] : []));

// classify's missingParallel entries (id lists) of a course, each with the requirement key it came from.
function missingKeys(id, data, statuses) {
  const left = parallelsOf(id, data), used = new Set();
  return (statuses[id]?.missingParallel ?? []).map((ids) => {
    const at = left.findIndex((r) => !used.has(r.key) && r.ids.join() === ids.join());
    if (at >= 0) used.add(left[at].key);
    return { ids, key: at >= 0 ? left[at].key : null };
  });
}

const statusesOf = (data, record) => classify(data, record ?? {}).statuses;

// Parallel requirements the student's schedule already lacked when loaded (they are registered to it): accepted as met.
export function acceptedParallel(edit, data, record) {
  const statuses = statusesOf(data, record),
    inOriginal = new Set(edit.original.map((l) => l.course)),
    out = [];
  for (const id of inOriginal) {
    if (!data.courses[id]) continue;
    for (const { ids, key } of missingKeys(id, data, statuses)) if (key && !ids.some((x) => inOriginal.has(x))) out.push(key);
  }
  return out;
}

// Search arguments for the edit state. record = the shared "המצב שלי" (passed, failed, grades, exempt, outsideDone, profile).
export function editQuery(edit, data, record) {
  const { real, fixed } = kinds(edit, data),
    gone = new Set(edit.removed),
    swapped = (id) => (edit.swaps[id] ?? []).length > 0;
  const fixedLessons = edit.baseline.filter((l) => fixed.includes(l.course) && !gone.has(l.course));
  const courses = uniq([...real, ...edit.added].filter((id) => !gone.has(id) && data.courses[id]));
  const pins = [
    ...edit.baseline
      .filter((l) => real.includes(l.course) && !gone.has(l.course) && !edit.movable.includes(l.course) && !swapped(l.course) && l.group)
      .map((l) => l.group),
    ...Object.entries(edit.swaps).filter(([id]) => !gone.has(id)).flatMap(([, ids]) => ids)
  ];
  const withFixed = { ...data, courses: { ...data.courses } };
  if (fixedLessons.length) {
    withFixed.courses[FIXED_COURSE] = {
      name: 'קבוע', credits: 0, offered: true, prereqs: [],
      groups: [{
        id: FIXED_GROUP, type: 'הרצאה', primary: true, linked: [], full: false, lecturer: '', exams: [],
        meetings: fixedLessons.map((l) => ({ day: l.day, start: l.start, end: l.end, room: '' }))
      }]
    };
    courses.push(FIXED_COURSE);
    pins.push(FIXED_GROUP);
  }

  const constraints = { ...structuredClone(DEFAULT.constraints), blocks: [], split: false, includeFull: !edit.registered };
  const g = edit.goal;
  if (g.dayOff) Object.assign(constraints, { dayOff: [g.dayOff], dayOffHard: true });
  if (g.notAfter) Object.assign(constraints, { notAfter: g.notAfter, windowHard: true });
  const weights = { ...DEFAULT.weights, ...(g.fewerGaps && { compact: 5 }) };

  // A fixed course still present satisfies another course's parallel requirement; a requirement the original already
  // lacked is accepted (solver reads statuses[id].missingParallel, so filtering it there is the same as `present`/`acceptParallel`).
  const present = new Set(fixed.filter((id) => !gone.has(id))),
    accepted = new Set(acceptedParallel(edit, data, record)),
    statuses = statusesOf(data, record);
  for (const id of Object.keys(statuses)) {
    if (!statuses[id].missingParallel) continue;
    const keep = missingKeys(id, data, statuses).filter(({ ids, key }) => !ids.some((x) => present.has(x)) && !accepted.has(key));
    statuses[id] = { ...statuses[id], missingParallel: keep.map((k) => k.ids) };
    if (!keep.length) delete statuses[id].missingParallel;
  }

  const q = {
    data: withFixed, courses: courses.map((id) => ({ id, mode: 'must' })), pins, constraints, weights, statuses,
    topK: 10, timeLimitMs: 3000
  };
  if (edit.registered) q.allowFull = edit.owned;
  return q;
}

// What the week draws: lessons with a group in the data keep it; every other lesson becomes its own group of a display course
// named like the lesson's course, so each can be tapped and removed on its own. The search keeps the single `fixed:all`.
export function displayData(lessons, data) {
  const out = { ...data, courses: { ...data.courses } }, groups = [], count = {};
  for (const l of lessons) {
    if (hasGroup(data, l)) {
      if (!groups.includes(l.group)) groups.push(l.group);
      continue;
    }
    const cid = FIXED + l.course, i = count[cid] ?? 0;
    count[cid] = i + 1;
    out.courses[cid] ??= { name: l.name, credits: 0, offered: true, prereqs: [], groups: [] };
    const id = `${cid}:${i}`;
    out.courses[cid].groups.push({
      id, type: l.type, primary: true, linked: [], full: false, lecturer: '', exams: [],
      meetings: [{ day: l.day, start: l.start, end: l.end, room: '' }]
    });
    groups.push(id);
  }
  return { data: out, groups };
}

// Pairs of courses whose lessons overlap (same day, hours crossing), each pair once.
export function overlaps(lessons) {
  const out = [], seen = new Set();
  lessons.forEach((a, i) => {
    for (const b of lessons.slice(i + 1)) {
      if (a.course === b.course || a.day !== b.day || toMin(a.start) >= toMin(b.end) || toMin(b.start) >= toMin(a.end)) continue;
      const k = [a.course, b.course].sort().join('|');
      if (!seen.has(k)) {
        seen.add(k);
        out.push([a.course, b.course]);
      }
    }
  });
  return out;
}

const lessonKey = (l) => [l.course, l.group, l.day, l.start, l.end].join('|');
const sameLessons = (a, b) => a.length === b.length && a.map(lessonKey).sort().join() === b.map(lessonKey).sort().join();
const groupsOfCourse = (lessons, course) => uniq(lessons.filter((l) => l.course === course && l.group).map((l) => l.group)).sort().join();

// Total minutes between lessons on the same day, after merging overlapping or touching lessons.
export function gapMinutes(lessons) {
  let gap = 0;
  for (let d = 1; d <= 6; d++) {
    const spans = lessons.filter((l) => l.day === d).map((l) => [toMin(l.start), toMin(l.end)]).sort((a, b) => a[0] - b[0]);
    let end = null;
    for (const [a, b] of spans) {
      if (end !== null && a > end) gap += a - end;
      end = end === null ? b : Math.max(end, b);
    }
  }
  return gap;
}

// Search results -> proposals, fewest changed courses first, then best score. `query` is what editQuery returned.
export function proposalsFrom(results, edit, query) {
  const { fixed } = kinds(edit, query.data), gone = new Set(edit.removed);
  const fixedLs = edit.baseline.filter((l) => fixed.includes(l.course) && !gone.has(l.course));
  const was = uniq(edit.baseline.map((l) => l.course)), baseGap = gapMinutes(edit.baseline);
  return results
    .map((r) => {
      const lessons = [...lessonsOf(r.groups.filter((id) => id !== 'fixed:g'), query.data), ...fixedLs];
      const now = uniq(lessons.map((l) => l.course));
      return {
        lessons, score: r.score,
        changed: was.filter((c) => now.includes(c) && groupsOfCourse(lessons, c) !== groupsOfCourse(edit.baseline, c)),
        added: now.filter((c) => !was.includes(c)),
        removed: was.filter((c) => !now.includes(c))
      };
    })
    .filter((p) => !sameLessons(p.lessons, edit.baseline) && !(edit.goal.fewerGaps && gapMinutes(p.lessons) >= baseGap))
    .sort((a, b) => (a.changed.length + a.added.length + a.removed.length) - (b.changed.length + b.added.length + b.removed.length) ||
      b.score - a.score);
}

const DAY_LETTER = ['', 'א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳'];
const countText = (n, one, many) => (n === 1 ? one : `${n} ${many}`);
const lecturers = (lessons, course, data) =>
  uniq(lessons.filter((l) => l.course === course && l.group).map((l) => data.courses[course]?.groups.find((g) => g.id === l.group)?.lecturer ?? ''))
    .sort().join('|');

// "יום ג׳ התפנה · קורס אחד זז · אותו מרצה": what the proposal gains and what it costs.
export function summaryLine(baseline, p, data) {
  const parts = [], days = (ls) => uniq(ls.map((l) => l.day));
  const freed = days(baseline).filter((d) => !days(p.lessons).includes(d)).sort();
  if (freed.length === 1) parts.push(`יום ${DAY_LETTER[freed[0]]} התפנה`);
  else if (freed.length) parts.push(`ימים ${freed.map((d) => DAY_LETTER[d]).join(', ')} התפנו`);
  const gaps = gapMinutes(baseline) - gapMinutes(p.lessons);
  if (gaps > 0) parts.push(`פחות ${gaps} דקות חלון`);
  const last = (ls) => ls.reduce((a, l) => (toMin(l.end) > toMin(a) ? l.end : a), '00:00');
  if (p.lessons.length && baseline.length && toMin(last(p.lessons)) < toMin(last(baseline))) parts.push(`מסיימים ב-${last(p.lessons)}`);
  if (p.changed.length) parts.push(countText(p.changed.length, 'קורס אחד זז', 'קורסים זזו'));
  if (p.added.length) parts.push(countText(p.added.length, 'קורס אחד נוסף', 'קורסים נוספו'));
  if (p.removed.length) parts.push(countText(p.removed.length, 'קורס אחד הוסר', 'קורסים הוסרו'));
  const same = (c) => lecturers(baseline, c, data) !== '' && lecturers(baseline, c, data) === lecturers(p.lessons, c, data);
  if (p.changed.length && p.changed.every(same)) parts.push('אותו מרצה');
  return parts.join(' · ');
}
