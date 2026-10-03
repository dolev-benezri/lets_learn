// Afeka regulations engine (תקנון לימודים תואר ראשון, 5.2.2026). Pure: runs in browser and node.
const YEAR_LETTERS = { 'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5 }; // evening programs run five years

// Afeka english clearance (checked 2026-10-01): Amirnet 85/100/120/134 exempts the first 1/2/3/4 courses; exemption gives no credits.
const ENGLISH = ['6000', '6001', '6002', '6003'];
const AMIRNET = [85, 100, 120, 134];
export const amirnetExempt = (score) => (Number.isFinite(score) ? ENGLISH.slice(0, AMIRNET.filter((t) => score >= t).length) : []);
// The English levels in the data, each with the Amirnet score that exempts it (and the levels below it).
export const englishOptions = (data, score) => ENGLISH.map((id, i) => ({ id, name: data.courses[id]?.name, min: AMIRNET[i], exempt: amirnetExempt(score).includes(id) })).filter((e) => e.name);

// Personal profile: integers in range, else null (state, backup links and the form share this).
const int = (x, lo, hi) => (Number.isInteger(x) && x >= lo && x <= hi ? x : null);
// Specialization areas come from the data (data.specializations) and the pick rule from data.specRule, so this stays program-neutral.
// cleanProfile only checks the shape (1-2 distinct short ids); validSpecs judges a choice against one dataset. No rule in the data = the mechanical one.
const specs = (a) => (Array.isArray(a) && a.length >= 1 && a.length <= 2 && a.every((x) => typeof x === 'string' && /^[a-z][a-z0-9]{0,19}$/.test(x)) && new Set(a).size === a.length ? a : []);
export const specRule = (data) => ({ pick: 2, alone: ['vehicle'], ...data.specRule });
// rule.groups (industrial engineering: a main and a secondary area): two lists of area ids, one area from each, and not the same subject (same position in both lists).
const areaPos = (rule, id) => Math.max(...rule.groups.map((g) => g.indexOf(id)));
export const specConflict = (rule, a, b) => !!rule.groups && a !== b
  && (rule.groups.some((g) => g.includes(a) && g.includes(b)) || (areaPos(rule, a) >= 0 && areaPos(rule, a) === areaPos(rule, b)));
// Valid: every id is an area of this dataset, and there are `pick` of them or exactly one standalone area. Returned in the dataset's order, else [].
export function validSpecs(data, ids) {
  if (!Array.isArray(ids)) return [];
  const rule = specRule(data), ok = (data.specializations ?? []).map((s) => s.id).filter((id) => ids.includes(id));
  const inGroups = (id) => rule.groups.flat().includes(id);
  const paired = ok.length === rule.pick && (!rule.groups || (ok.length === 2 && ok.every(inGroups) && !specConflict(rule, ok[0], ok[1])));
  return ok.length === ids.length && (paired || (ok.length === 1 && rule.alone.includes(ok[0]))) ? ok : [];
}
export const cleanProfile = (p) => ({ year: int(p?.year, 1, 5), amirnet: int(p?.amirnet, 50, 150), specs: specs(p?.specs), summer: p?.summer === true });

// Course sets of the chosen areas (profile.specs, data.specializations): mandatory = their חובה lists, plus the standalone extra (aloneExtra) when its area is chosen alone;
// elective = their בחירה lists minus what is mandatory (a course in several lists counts once). chosen / all = list codes of the chosen areas / of every specialization list.
// An area's lists as [kind, code]: mandatory and elective may each be one list code or an array of them (an area can have a core, a seminar and extra electives).
export const specCodes = (s) => [...[s.mandatory].flat().map((c) => ['mandatory', c]), ...[s.elective].flat().map((c) => ['elective', c]), ['alone', s.aloneExtra]].filter(([, c]) => c);
export function specLists(data, specs = []) {
  const alone = specs.length === 1 && specRule(data).alone.includes(specs[0]), out = { mandatory: new Set(), elective: new Set(), chosen: new Set(), all: new Set() };
  for (const s of data.specializations ?? []) {
    for (const [kind, code] of specCodes(s)) {
      out.all.add(code);
      if (!specs.includes(s.id) || (kind === 'alone' && !alone)) continue;
      out.chosen.add(code);
      (data.lists.find((l) => l.code === code)?.courses ?? []).filter((id) => data.courses[id]).forEach((id) => out[kind === 'elective' ? 'elective' : 'mandatory'].add(id));
    }
  }
  out.mandatory.forEach((id) => out.elective.delete(id));
  return out;
}

// A course not taught in א/ב but taught in summer says so (in place), pointing at the summer tab or at the profile switch that opens it.
export function summerOnly(statuses, summer, on) {
  for (const [id, s] of Object.entries(statuses)) {
    if (s.status !== 'notOffered' || !summer?.courses[id]?.offered) continue;
    s.reasons = [on ? 'נלמד רק בקיץ: תכננו אותו בלשונית "קיץ"' : 'נלמד רק בקיץ. כדי לתכנן אותו, סמנו "אני מתכנן/ת סמסטר קיץ השנה" ב"המצב שלי"'];
  }
  return statuses;
}

// ponytail: profile.year only overrides the label; a real different cohort needs its own data file (data.startYear).
// How many study years the program has: its last mandatory year list ("שנה ב'" in a two-year program). No program is one year long, so fewer than two = partial data: four.
export const yearsOf = (data) => {
  const n = Math.max(0, ...(data.lists ?? []).map((l) => ' אבגדה'.indexOf(l.name.match(/שנה ([א-ה])'/)?.[1] ?? ' ')));
  return n >= 2 ? n : 4;
};
export const studyYear = (data, state) => Math.min(yearsOf(data), state.profile?.year ?? data.year - data.startYear + 1);

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
  const unmetParallel = (c) => c.prereqs.filter((p) => p.kind === 'מקביל' && !satisfied(p));
  const parallelNote = (par) => `רק יחד עם ${par.map((p) => p.anyOf.map((a) => a.name).join(' או ')).join(', ')} (קורס מקביל, תקנון 6.2.3)`;
  const parallelIds = (par) => par.map((p) => p.anyOf.map((a) => a.id).filter(Boolean));

  for (const [id, c] of Object.entries(data.courses)) {
    if (passed.has(id)) { statuses[id] = { status: 'done', reasons: [] }; continue; }
    if (exempt.has(id)) { statuses[id] = { status: 'exempt', reasons: ['פטור (ציון אמירנט)'] }; continue; }
    if (!c.offered) { statuses[id] = { status: 'notOffered', reasons: [`לא נלמד ${when}`] }; continue; }
    if (failed[id]) { // prerequisites were met on the first attempt; a corequisite must still hold with the retake
      const par = unmetParallel(c);
      statuses[id] = { status: 'retake', reasons: [`נכשלת, מוצע ${when} (תקנון 11.6.1)`, ...(par.length ? [parallelNote(par)] : [])], ...(par.length && { missingParallel: parallelIds(par) }) };
      continue;
    }
    const hard = c.prereqs.filter((p) => p.kind === 'קדם' && !satisfied(p));
    if (hard.length) {
      statuses[id] = { status: 'blocked', reasons: [], blockedBy: hard.map((p) => p.anyOf.find((a) => a.id)?.id ?? null) };
      continue;
    }
    const par = unmetParallel(c);
    if (par.length) {
      statuses[id] = {
        status: 'conditional',
        reasons: [parallelNote(par), ...outsideNotes(c)],
        missingParallel: parallelIds(par),
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
      return `${c.name} ← ${[...new Set(s.blockedBy)].map((b) => chain(b, seen)).filter(Boolean).join(' + ')}`; // two requirements naming the same course: once
    }
    return c.name;
  };
  const noScore = !Number.isFinite(state.profile?.amirnet); // the English level comes from the Amirnet score: without it every level looks blocked
  for (const [id, s] of Object.entries(statuses)) {
    if (s.status !== 'blocked') continue;
    s.reasons = [...new Set(s.blockedBy.map((b) => `חסום: דורש ${chain(b)} (תקנון 7.4)`))];
    if (noScore && ENGLISH.includes(id)) s.reasons.push(`הזינו ציון אמירנט ב"המצב שלי" כדי לדעת מאיזו רמה מתחילים (${AMIRNET[0]} ומעלה פוטר מהמכינה)`);
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

// Credit-weighted average over passed courses that have a grade (courses without credits in the data don't count).
export function gradeAverage(data, state) {
  let sum = 0, credits = 0;
  for (const id of state.passed ?? []) {
    const g = state.grades?.[id], c = data.courses[id]?.credits ?? 0;
    if (g === undefined || !(c > 0)) continue;
    sum += g * c; credits += c;
  }
  return { avg: credits ? sum / credits : null, credits };
}

// Default plan mode for a course: the student's choice, else retakes are must and the study year's list is optional.
export function modeFor(status, choice, inYearList) {
  if (!['retake', 'available', 'afterA', 'conditional'].includes(status)) return null;
  if (choice) return choice;
  if (status === 'retake') return 'must';
  return inYearList ? 'optional' : 'no';
}
