// Afeka regulations engine (תקנון לימודים תואר ראשון, 5.2.2026). Pure: runs in browser and node.
const YEAR_LETTERS = { 'א': 1, 'ב': 2, 'ג': 3, 'ד': 4 };

// Afeka english clearance (checked 2026-10-01): Amirnet 85/100/120/134 exempts the first 1/2/3/4 courses; exemption gives no credits.
const ENGLISH = ['6000', '6001', '6002', '6003'];
export const amirnetExempt = (score) => (Number.isFinite(score) ? ENGLISH.slice(0, [85, 100, 120, 134].filter((t) => score >= t).length) : []);

// Personal profile: integers in range, else null (state, backup links and the form share this).
const int = (x, lo, hi) => (Number.isInteger(x) && x >= lo && x <= hi ? x : null);
export const cleanProfile = (p) => ({ year: int(p?.year, 1, 4), amirnet: int(p?.amirnet, 50, 150) });

// ponytail: profile.year only overrides the label; a real different cohort needs its own data file (data.startYear).
export const studyYear = (data, state) => state.profile?.year ?? data.year - data.startYear + 1;

export function classify(data, state) {
  const passed = new Set(state.passed);
  const failed = state.failed ?? {};
  const exempt = new Set(amirnetExempt(state.profile?.amirnet));
  const statuses = {};
  const when = data.semester === 'שנה' ? 'השנה' : `בסמסטר ${data.semester}`; // the year view has no single semester
  const satisfied = (p) => p.anyOf.some((a) => a.id && (passed.has(a.id) || exempt.has(a.id))) || p.anyOf.every((a) => a.id === null);
  const outsideNotes = (c) => c.prereqs.filter((p) => p.anyOf.every((a) => a.id === null))
    .flatMap((p) => p.anyOf)
    .map((a) => `קדם מחוץ לתוכנית (${a.name}): מניחים שעברת`);

  for (const [id, c] of Object.entries(data.courses)) {
    if (passed.has(id)) { statuses[id] = { status: 'done', reasons: [] }; continue; }
    if (exempt.has(id)) { statuses[id] = { status: 'exempt', reasons: ['פטור (ציון אמירנט)'] }; continue; }
    if (!c.offered) { statuses[id] = { status: 'notOffered', reasons: [`לא נלמד ${when}`] }; continue; }
    if (failed[id]) { statuses[id] = { status: 'retake', reasons: [`נכשלת, מוצע ${when} (תקנון 11.6.1)`] }; continue; }
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
    if (s.status === 'blocked') s.reasons = [...new Set(s.blockedBy.map((b) => `חסום: דורש ${chain(b)} (תקנון 7.4)`))];
  }

  const counts = Object.values(failed);
  const total = counts.reduce((a, b) => a + b, 0);
  const warnings = [];
  if (counts.some((n) => n >= 3)) warnings.push('3 כישלונות באותו קורס: הרחקה (תקנון 11.5.2)');
  if (total >= 4) warnings.push('4 כישלונות מצטברים ומעלה: הרחקה (תקנון 11.5.1)');
  else if (total >= 3 && !warnings.length) warnings.push('3 כישלונות מצטברים: מעמד "על תנאי" (תקנון 11.4.1)'); // expulsion outranks probation
  return { statuses, warnings };
}

// Year view only: a blocked course offered in ב׳ whose missing prerequisites are candidates in א׳ becomes afterA
// (second classify pass with those א׳ candidates counted as passed). Pure; searchYear reclassifies ב׳ with the real א׳ result.
export function withAfterA(data, state, cls) {
  if (data.semester !== 'שנה') return cls;
  const candA = new Set(Object.keys(cls.statuses).filter((id) => ['retake', 'available'].includes(cls.statuses[id].status) && data.courses[id].semesters?.includes('א')));
  const second = classify(data, { ...state, passed: [...state.passed, ...candA] }).statuses;
  const settled = (a) => a.id && ['done', 'exempt'].includes(cls.statuses[a.id]?.status);
  const statuses = { ...cls.statuses };
  for (const [id, s] of Object.entries(cls.statuses)) {
    const c = data.courses[id];
    if (s.status !== 'blocked' || !c.semesters?.includes('ב') || !['available', 'conditional'].includes(second[id].status)) continue;
    const names = [...new Set(c.prereqs.filter((p) => p.kind === 'קדם' && !p.anyOf.some(settled))
      .flatMap((p) => p.anyOf.filter((a) => candA.has(a.id)).map((a) => a.name)))];
    statuses[id] = { status: 'afterA', reasons: [`אפשר בסמסטר ב׳ אחרי ${names.join(', ')}`] };
  }
  return { ...cls, statuses };
}

// Direct status choice. Failures stay on file once passed: regulations 11.4.1 and 11.5.x count every failure.
export function setStatus(state, id, st) {
  state.passed = state.passed.filter((x) => x !== id);
  if (st === 'passed') state.passed.push(id);
  if (st === 'none') delete state.failed[id];
  if (st === 'failed') state.failed[id] ||= 1;
}

export function progress(data, state) {
  const passed = new Set(state.passed);
  const year = studyYear(data, state);
  const lists = data.lists.filter((l) => {
    const m = l.name.match(/חובה שנה (\S)'/);
    return m && YEAR_LETTERS[m[1]] < year;
  });
  const required = lists.reduce((a, l) => a + l.minCredits, 0);
  const earned = lists.flatMap((l) => l.courses).filter((id) => passed.has(id))
    .reduce((a, id) => a + (data.courses[id]?.credits ?? 0), 0);
  return { earned, required, ratio: required ? earned / required : 1 };
}

// Default plan mode for a course: the student's choice, else retakes are must and the study year's list is optional.
export function modeFor(status, choice, inYearList) {
  if (!['retake', 'available', 'afterA', 'conditional'].includes(status)) return null;
  if (choice) return choice;
  if (status === 'retake') return 'must';
  return inYearList ? 'optional' : 'no';
}
