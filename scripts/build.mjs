export const normName = (s) => s.replace(/["'׳״]/g, '').replace(/\s+/g, ' ').trim();
export const normLecturer = (s) => normName(s).replace(/^(דר|פרופ|מר|גב|גברת)\.?\s+/, '');

export function buildDataset({ year, startYear, program, semester, department, lists, raw, exams, fetchedAt, warnings = [] }) {
  const idByName = new Map();
  for (const l of lists) for (const c of l.courses) idByName.set(normName(c.name), c.id);

  const courses = {};
  for (const l of lists) for (const c of l.courses) {
    if (courses[c.id]) continue;
    const r = raw[c.id] ?? { groups: [], details: null };
    const noMeetings = r.groups.filter((g) => g.primary && !g.meetings.length).map((g) => g.id);
    if (noMeetings.length) warnings.push(`${c.id}: primary group(s) without meetings dropped (online/unscheduled?): ${noMeetings.join(', ')}`);
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
        .filter((p) => p.names.length > 0)
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
    for (const row of unmatched) {
      const bareOfKind = prim.filter((g) => !g.exams.some((e) => e.kind === row.kind));
      bareOfKind.forEach((g) => add(g, row));
    }
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
    if (c.offered && c.credits === 0) warnings.push(`${id}: offered course with 0 credits (check parseDetails)`);
    const linked = new Set(c.groups.flatMap((g) => g.linked));
    for (const g of c.groups) if (!g.primary && !linked.has(g.id)) warnings.push(`${id}: sub-group ${g.id} not linked to any primary`);
    if (d.examsPublished && c.offered && d.lists.some((l) => /חובה/.test(l.name) && l.courses.includes(id))
      && !c.groups.some((g) => g.primary && g.exams.some((e) => e.kind === 'בחינה' && e.moed === 1))) {
      warnings.push(`${id}: mandatory course without a moed-1 exam`);
    }
  }
  return { errors, warnings };
}

// Refuse a scrape that shrank sharply against the existing file (a partly blocked run must not overwrite good data).
const SHRINK = [['course count', 0.1, (d) => Object.keys(d.courses).length],
  ['offered-course count', 0.2, (d) => Object.values(d.courses).filter((c) => c.offered).length],
  ['group count', 0.25, (d) => Object.values(d.courses).reduce((a, c) => a + c.groups.length, 0)]];
export function compareToPrevious(prev, next) {
  const errors = [];
  if (prev) for (const [what, max, count] of SHRINK) {
    const a = count(prev), b = count(next), drop = (a - b) / a;
    if (drop > max) errors.push(`${what} dropped by ${(drop * 100).toFixed(1)}% (was ${a}, now ${b})`);
  }
  return { errors };
}
