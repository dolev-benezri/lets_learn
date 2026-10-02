export const normName = (s) => s.replace(/["'׳״]/g, '').replace(/\s+/g, ' ').trim();
export const normLecturer = (s) => normName(s).replace(/^(דר|פרופ|מר|גב|גברת)\.?\s+/, '');

export function buildDataset({ year, startYear, program, semester, department, lists, raw, exams, fetchedAt, warnings = [], specializations, degree }) {
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
    specializations, degree,
    courses,
  };
}

const prereqCount = (d, ids = Object.keys(d.courses)) => ids.reduce((a, id) => a + d.courses[id].prereqs.length, 0);

// `prev` (the existing file for this semester, if any) enables the checks that compare against it.
export function validate(d, prev = null) {
  const errors = [], warnings = [];
  const n = Object.keys(d.courses).length;
  if (d.semester === 'קיץ') { // thin: no size or 90903 requirement, but something must be scheduled
    if (!Object.values(d.courses).some((c) => c.groups.length)) errors.push('summer has no course with a group');
  } else {
    if (n < 40) errors.push(`only ${n} courses, expected at least 40`);
    const phys = d.courses['90903'];
    if (!phys) errors.push('course 90903 (פיזיקה-מכניקה) missing');
    else if (phys.groups.filter((g) => g.primary).length < 3) errors.push('course 90903 has fewer than 3 primary groups');
  }
  const listed = new Set(d.lists.map((l) => l.code));
  for (const s of d.specializations ?? []) for (const code of [s.mandatory, s.elective, s.aloneExtra]) if (code && !listed.has(code)) errors.push(`specialization ${s.id}: list ${code} not scraped`);
  for (const [id, c] of Object.entries(d.courses)) {
    if (c.offered && c.credits === 0) warnings.push(`${id}: offered course with 0 credits (check parseDetails)`);
    const linked = new Set(c.groups.flatMap((g) => g.linked));
    for (const g of c.groups) if (!g.primary && !linked.has(g.id)) warnings.push(`${id}: sub-group ${g.id} not linked to any primary`);
    if (d.examsPublished && c.offered && d.lists.some((l) => /חובה/.test(l.name) && l.courses.includes(id))
      && !c.groups.some((g) => g.primary && g.exams.some((e) => e.kind === 'בחינה' && e.moed === 1))) {
      warnings.push(`${id}: mandatory course without a moed-1 exam`);
    }
  }
  fieldHealth(d, prev, errors);
  return { errors, warnings };
}

// A parser that silently stops filling a field must not reach the site: each check guards one field.
function fieldHealth(d, prev, errors) {
  const courses = Object.values(d.courses);
  const meetings = courses.flatMap((c) => c.groups).flatMap((g) => g.meetings);
  const noDay = meetings.filter((m) => m.day === null).length;
  if (noDay) errors.push(`${noDay} meeting(s) without a day (check parseDay)`);

  const offered = courses.filter((c) => c.offered);
  const withCredits = offered.filter((c) => c.credits > 0).length;
  // Summer is too thin for a ratio (3 credit-less מכינה English courses of 29 fail it); the same parser is judged by א and ב in the same run.
  if (d.semester !== 'קיץ' && offered.length && withCredits / offered.length <= 0.9) errors.push(`only ${withCredits} of ${offered.length} offered courses have credits (check parseDetails)`);

  // Only courses in both files: adding a list of new courses is not a parser regression.
  const common = prev ? Object.keys(d.courses).filter((id) => prev.courses[id]) : [];
  if (prev && prereqCount(prev, common)) {
    const a = prereqCount(prev, common), b = prereqCount(d, common), change = (b - a) / a;
    if (Math.abs(change) > 0.2) errors.push(`prerequisite count changed by ${(change * 100).toFixed(1)}% (was ${a}, now ${b})`);
  }

  // The academic year `year` runs from the autumn before it to the September after the spring.
  const lo = `${d.year - 1}-09-01`, hi = `${d.year}-09-30`;
  const badExams = courses.flatMap((c) => c.groups).flatMap((g) => g.exams).filter((e) => e.date < lo || e.date > hi).length;
  if (badExams) errors.push(`${badExams} exam date(s) outside ${lo}..${hi} (check toIsoDate)`);
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
