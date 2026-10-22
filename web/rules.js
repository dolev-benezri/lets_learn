// Afeka regulations engine (תקנון לימודים תואר ראשון, 5.2.2026). Pure: runs in browser and node.
import { TURN_ID_MAX } from './settings.js';
const YEAR_LETTERS = { 'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5 }; // evening programs run five years

// Afeka english clearance (checked 2026-10-01): an English score of 85/100/120/134 exempts the first 1/2/3/4 courses;
// Amirnet and the psychometric English section share one 50-150 scale (NITE Amirnet FAQ, 2026-08-12), so one field holds either.
// exemption gives no credits.
const ENGLISH = ['6000', '6001', '6002', '6003'];
const AMIRNET = [85, 100, 120, 134];
export const amirnetExempt = (score) => (Number.isFinite(score)
  ? ENGLISH.slice(0, AMIRNET.filter((t) => score >= t).length)
  : []);
// The English levels in the data, each with the Amirnet score that exempts it (and the levels below it).
export const englishOptions = (data, score) => ENGLISH
  .map((id, i) => ({ id, name: data.courses[id]?.name, min: AMIRNET[i], exempt: amirnetExempt(score).includes(id) }))
  .filter((e) => e.name);

// Personal profile: integers in range, else null (state, backup links and the form share this).
const int = (x, lo, hi) => (Number.isInteger(x) && x >= lo && x <= hi ? x : null);
// Specialization areas come from the data (data.specializations) and the pick rule from data.specRule, so this stays
// program-neutral.
// cleanProfile only checks the shape (1-2 distinct short ids); validSpecs judges a choice against one dataset. No rule
// in the data = the mechanical one.
const specs = (a) => (
  Array.isArray(a)
  && a.length >= 1
  && a.length <= 2
  && a.every((x) => typeof x === 'string' && /^[a-z][a-z0-9]{0,19}$/.test(x))
  && new Set(a).size === a.length
    ? a
    : []
);
export const specRule = (data) => ({ pick: 2, alone: ['vehicle'], ...data.specRule });
// Valid: every id is an area of this dataset, and there are `pick` of them or exactly one standalone area. Returned in
// the dataset's order, else [].
export function validSpecs(data, ids) {
  if (!Array.isArray(ids)) return [];
  const rule = specRule(data), ok = (data.specializations ?? []).map((s) => s.id).filter((id) => ids.includes(id));
  const paired = ok.length === rule.pick;
  return ok.length === ids.length && (paired || (ok.length === 1 && rule.alone.includes(ok[0]))) ? ok : [];
}
export const cleanProfile = (p) => ({
  year: int(p?.year, 1, 5),
  amirnet: int(p?.amirnet, 50, 150),
  specs: specs(p?.specs),
  summer: p?.summer === true,
  ...turnOf(p?.turn)
});
// The registration turn id (settings.json turns): kept only when it is a non-empty string.
const turnOf = (t) => (typeof t === 'string' && t && t.length <= TURN_ID_MAX ? { turn: t } : {});

// Course sets of the chosen areas (profile.specs, data.specializations): mandatory = their חובה lists, plus the
// standalone extra (aloneExtra) when its area is chosen alone;
// elective = their בחירה lists minus what is mandatory (a course in several lists counts once). chosen / all = list
// codes of the chosen areas / of every specialization list.
// An area's lists as [kind, code]: mandatory and elective may each be one list code or an array of them (an area can
// have a core, a seminar and extra electives).
export const specCodes = (s) => [
  ...[s.mandatory].flat().map((c) => ['mandatory', c]),
  ...[s.elective].flat().map((c) => ['elective', c]),
  ['alone', s.aloneExtra]
].filter(([, c]) => c);
export function specLists(data, specs = []) {
  const alone = specs.length === 1 && specRule(data).alone.includes(specs[0]),
    out = { mandatory: new Set(), elective: new Set(), chosen: new Set(), all: new Set() };
  for (const s of data.specializations ?? []) {
    for (const [kind, code] of specCodes(s)) {
      out.all.add(code);
      if (!specs.includes(s.id) || (kind === 'alone' && !alone)) continue;
      out.chosen.add(code);
      (data.lists.find((l) => l.code === code)?.courses ?? [])
        .filter((id) => data.courses[id])
        .forEach((id) => out[kind === 'elective' ? 'elective' : 'mandatory'].add(id));
    }
  }
  out.mandatory.forEach((id) => out.elective.delete(id));
  return out;
}

// A course not taught in א/ב but taught in summer says so (in place), pointing at the summer tab or at the profile
// switch that opens it.
export function summerOnly(statuses, summer, on) {
  for (const [id, s] of Object.entries(statuses)) {
    if (s.status !== 'notOffered' || !summer?.courses[id]?.offered) continue;
    s.reasons = [on
      ? 'נלמד רק בקיץ: תכננו אותו בלשונית "קיץ"'
      : 'נלמד רק בקיץ. כדי לתכנן אותו, סמנו "אני מתכנן/ת סמסטר קיץ השנה" ב"המצב שלי"'];
  }
  return statuses;
}

// ponytail: profile.year only overrides the label; a real different cohort needs its own data file (data.startYear).
// How many study years the program has: its last mandatory year list ("שנה ב'" in a two-year program). No program is
// one year long, so fewer than two = partial data: four.
export const yearsOf = (data) => {
  const n = Math.max(0, ...(data.lists ?? [])
    .map((l) => ' אבגדה'.indexOf(l.name.match(/שנה ([א-ה])'/)?.[1] ?? ' ')));
  return n >= 2 ? n : 4;
};
export const studyYear = (data, state) => Math.min(
  yearsOf(data),
  state.profile?.year ?? data.year - data.startYear + 1
);

// One requirement (an anyOf) is met by any alternative: an in-program course passed or exempt, or an outside-program one the
// student marked done (state.outsideDone, by name). A requirement entirely outside the program is assumed met.
export const reqMet = (p, { passed, exempt, outside }) =>
  p.anyOf.some((a) => (a.id ? passed.has(a.id) || exempt.has(a.id) : outside.has(a.name)))
  || p.anyOf.every((a) => a.id === null);
export const reqContext = (state, exempt = amirnetExempt(state.profile?.amirnet)) => ({
  passed: new Set(state.passed),
  exempt: new Set(exempt),
  outside: new Set(state.outsideDone ?? [])
});

// The soft warning on a record the regulations would not allow (a faculty exception may): one requirement, unmet by the record.
// A corequisite is only flagged when never taken: taken together and failed is legitimate. null = nothing to say.
const SOFT = 'אם קיבלת אישור חריג, אפשר להשאיר.';
function unmetText(p, failed) {
  const names = p.anyOf.map((a) => a.name).join(' או '),
    tried = p.anyOf.some((a) => a.id && failed[a.id]);
  if (p.kind === 'קדם')
    return `שים לב: ${names} הוא קדם, ${tried ? 'וסומן שנכשלת בו' : 'ולא סומן שעברת אותו'}. ${SOFT}`;
  return tried ? null : `שים לב: ${names} הוא קורס מקביל, ולא סומן שלקחת אותו. ${SOFT}`;
}
// Courses marked passed (not exempt) or failed whose requirements the record does not meet: { id: [text] }.
export function recordWarnings(data, state) {
  const ctx = reqContext(state), failed = state.failed ?? {}, sheet = new Set(state.exempt ?? []), out = {};
  for (const id of new Set([...(state.passed ?? []), ...Object.keys(failed)])) {
    const c = data.courses[id];
    if (!c || sheet.has(id) || ctx.exempt.has(id)) continue;
    const texts = [...new Set(c.prereqs.filter((p) => !reqMet(p, ctx)).map((p) => unmetText(p, failed)).filter(Boolean))];
    if (texts.length) out[id] = texts;
  }
  return out;
}

export function classify(data, state) {
  const passed = new Set(state.passed);
  const failed = state.failed ?? {};
  const exempt = new Set(amirnetExempt(state.profile?.amirnet));
  const statuses = {};
  const when = data.semester === 'שנה' ? 'השנה' : `בסמסטר ${data.semester}`; // the year view has no single semester
  const ctx = reqContext(state, exempt);
  const satisfied = (p) => reqMet(p, ctx);
  const outsideNotes = (c) => c.prereqs.filter((p) => p.anyOf.every((a) => a.id === null))
    .flatMap((p) => p.anyOf)
    .map((a) => `קדם מחוץ לתוכנית (${a.name}): מניחים שעברת`);
  const unmetParallel = (c) => c.prereqs.filter((p) => p.kind === 'מקביל' && !satisfied(p));
  const parallelNote = (par) => `רק יחד עם ${par.map((p) => p.anyOf.map((a) => a.name).join(' או ')).join(', ')} (קורס מקביל, תקנון 6.2.3)`;
  const parallelIds = (par) => par.map((p) => p.anyOf.map((a) => a.id).filter(Boolean));

  for (const [id, c] of Object.entries(data.courses)) {
    if (passed.has(id)) {
      statuses[id] = { status: 'done', reasons: [] };
      continue;
    }
    if (exempt.has(id)) {
      statuses[id] = { status: 'exempt', reasons: ['פטור (ציון אנגלית)'] };
      continue;
    }
    if (!c.offered) {
      statuses[id] = { status: 'notOffered', reasons: [`לא נלמד ${when}`] };
      continue;
    }
    if (failed[id]) { // prerequisites were met on the first attempt; a corequisite must still hold with the retake
      const par = unmetParallel(c),
        // a retake with a prerequisite the record lacks stays possible (an exception), with the soft warning
        lacks = c.prereqs.filter((p) => p.kind === 'קדם' && !satisfied(p)).map((p) => unmetText(p, failed));
      statuses[id] = {
        status: 'retake',
        reasons: [`נכשלת, מוצע ${when} (תקנון 11.6.1)`, ...(par.length ? [parallelNote(par)] : []), ...lacks],
        ...(par.length && { missingParallel: parallelIds(par) })
      };
      continue;
    }
    const hard = c.prereqs.filter((p) => p.kind === 'קדם' && !satisfied(p));
    if (hard.length) {
      statuses[id] = {
        status: 'blocked',
        reasons: [],
        // one group per unmet requirement: its in-program alternatives, any one of which would do
        blockedBy: hard.map((p) => p.anyOf.filter((a) => a.id).map((a) => a.id))
      };
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
      // two requirements naming the same course: once
      return `${c.name} ← ${unique(s.blockedBy).map((g) => anyChain(g, seen)).filter(Boolean).join(' + ')}`;
    }
    return c.name;
  };
  // a requirement group: its alternatives joined by "או", each traced on its own (one branch's visits don't hide another's)
  const anyChain = (g, seen = new Set()) => g.map((id) => chain(id, new Set(seen))).filter(Boolean).join(' או ');
  const unique = (groups) => [...new Map(groups.map((g) => [g.join(), g])).values()];
  // the English level comes from the Amirnet score: without it every level looks blocked
  const noScore = !Number.isFinite(state.profile?.amirnet);
  for (const [id, s] of Object.entries(statuses)) {
    if (s.status !== 'blocked') continue;
    s.reasons = [...new Set(s.blockedBy.map((g) => `חסום: דורש ${anyChain(g)} (תקנון 7.4)`))];
    if (noScore && ENGLISH.includes(id))
      s.reasons.push(`הזינו ציון אנגלית (אמירנט או פסיכומטרי) ב"המצב שלי" כדי לדעת מאיזו רמה מתחילים (${AMIRNET[0]} ומעלה פוטר מהמכינה)`);
  }

  const counts = Object.values(failed).filter((n) => n > 0);
  const warnings = [];
  // "may": the faculty decides; the tool only points to the advisor
  const MAY_EXPEL = 'מצב זה יכול להוות הרחקה מהלימודים. כדאי לשוחח עם ההכוון האקדמי.';
  if (counts.some((n) => n >= 3)) warnings.push(`שימו לב: 3 כישלונות באותו קורס. לפי התקנון (11.5.2) ${MAY_EXPEL}`);
  // 11.4.1/11.5.1 count courses, not attempts
  if (counts.length >= 4) warnings.push(`שימו לב: ציון נכשל ב-4 קורסים ומעלה. לפי התקנון (11.5.1) ${MAY_EXPEL}`);
  if (!warnings.length) { // expulsion outranks probation
    const avg = gradeAverage(data, state).avg,
      year = studyYear(data, state),
      prog = progress(data, state);
    const why = [];
    if (counts.length >= 3) why.push('ציון נכשל ב-3 קורסים במצטבר (11.4.1)');
    // grades of passed courses only: never too low
    if (avg !== null && avg < 65) why.push(`ממוצע מצטבר ${avg.toFixed(1)}, מתחת ל-65 (11.4.2)`);
    // 11.4.4: checked at the end of each of years א'-ג'; progress counts the required lists of the years behind
    if (year >= 2 && year <= 4 && prog.required && !prog.short && prog.ratio < 0.7)
      why.push(`הושלמו ${Math.round(prog.ratio * 100)}% מתוכנית השנים הקודמות, פחות מ-70% (11.4.4)`);
    if (why.length) warnings.push(`שימו לב: ${why.join('; ')}. לפי התקנון (11.4) מצב זה יכול להוביל למעמד "על תנאי". כדאי לשוחח עם ההכוון האקדמי.`);
  }
  return { statuses, warnings };
}

// The one-time note on failed courses: those to retake that were not noted yet. `seen` keeps only courses still failed and not
// passed (a course not offered this semester stays noted), so passing and failing again notes a course again. text: null when nothing is new.
export function retakeNotice(data, cls, state, name) {
  const open = (id) => state.failed[id] && !state.passed.includes(id),
    fresh = Object.keys(cls.statuses).filter((id) => cls.statuses[id].status === 'retake' && !state.retakeSeen.includes(id)),
    one = fresh.length === 1;
  return {
    seen: [...state.retakeSeen.filter(open), ...fresh],
    text: fresh.length
      ? `שימו לב: נכשלת ב${fresh.map((id) => name(data.courses[id].name)).join(', ')}. מומלץ לקחת ${one ? 'אותו' : 'אותם'} שוב בסמסטר הבא ` +
        `שבו ${one ? 'הוא נלמד' : 'הם נלמדים'} (תקנון 11.6.1). כברירת מחדל ${one ? 'הוא נכנס' : 'הם נכנסים'} למערכת כ״חובה״, ואפשר לשנות.`
      : null
  };
}

// Year view only: a blocked course offered in ב׳ whose missing prerequisites are candidates in א׳ becomes afterA
// (second classify pass with those א׳ candidates counted as passed). Pure; searchYear reclassifies ב׳ with the real
// א׳ result.
export function withAfterA(data, state, cls) {
  if (data.semester !== 'שנה') return cls;
  const candA = new Set(Object.keys(cls.statuses)
    .filter((id) => ['retake', 'available', 'conditional'].includes(cls.statuses[id].status)
      && data.courses[id].semesters?.includes('א')));
  const second = classify(data, { ...state, passed: [...state.passed, ...candA] }).statuses;
  const of = (st) => Object.keys(cls.statuses).filter((id) => cls.statuses[id].status === st);
  const ctx = { passed: new Set(of('done')), exempt: new Set(of('exempt')), outside: new Set(state.outsideDone ?? []) };
  const statuses = { ...cls.statuses };
  for (const [id, s] of Object.entries(cls.statuses)) {
    const c = data.courses[id];
    if (s.status !== 'blocked'
      || !c.semesters?.includes('ב')
      || !['available', 'conditional'].includes(second[id].status)) continue;
    const names = [...new Set(c.prereqs.filter((p) => p.kind === 'קדם' && !reqMet(p, ctx))
      .flatMap((p) => p.anyOf.filter((a) => candA.has(a.id)).map((a) => a.name)))];
    statuses[id] = { status: 'afterA', reasons: [`אפשר בסמסטר ב׳ אחרי ${names.join(', ')}`] };
  }
  return { ...cls, statuses };
}

// Direct status choice. Failures stay on file once passed: regulations 11.4.1 and 11.5.x count every failure. An
// exemption lasts while passed.
export function setStatus(state, id, st) {
  state.passed = state.passed.filter((x) => x !== id);
  if (st !== 'passed' && state.exempt) state.exempt = state.exempt.filter((x) => x !== id);
  if (st === 'passed') state.passed.push(id);
  if (st === 'none') delete state.failed[id];
  if (st === 'failed') state.failed[id] ||= 1;
}

// The required lists of the years before the study year, each with the credits of its passed courses (a course in two
// lists counts once).
function earlierTally(data, state) {
  const passed = new Set(state.passed), year = studyYear(data, state), seen = new Set();
  return (data.lists ?? []).filter((l) => {
    const m = l.name.match(/חובה שנה (\S)'/);
    return m && YEAR_LETTERS[m[1]] < year;
  }).map((l) => ({
    l,
    // seen.add returns the set (truthy): a course counts in the first list that has it
    got: l.courses.filter((id) => passed.has(id) && !seen.has(id) && seen.add(id))
      .reduce((s, id) => s + (data.courses[id]?.credits ?? 0), 0)
  }));
}

export function progress(data, state) {
  const tally = earlierTally(data, state), lists = tally.map((t) => t.l);
  const required = lists.reduce((a, l) => a + l.minCredits, 0);
  const earned = tally.reduce((a, { l, got }) => a + Math.min(l.minCredits, got), 0); // a list counts up to its minimum
  // short: a list's courses carry fewer known credits than its minimum (courses without credits in the data), so the
  // ratio can't reach 1
  const short = lists.some((l) => l.courses.reduce((s, id) => s + (data.courses[id]?.credits ?? 0), 0) < l.minCredits);
  return { earned, required, ratio: required ? earned / required : 1, ...(short && { short }) };
}

// Names the credit figure of progress() still needs: the not-passed courses of every earlier-year list that is short
// of its minimum (none for a list that is met).
export function missingRequired(data, state) {
  const passed = new Set(state.passed);
  return [...new Set(earlierTally(data, state)
    .filter(({ l, got }) => got < l.minCredits)
    .flatMap(({ l }) => l.courses.filter((id) => !passed.has(id) && data.courses[id])))];
}

// Credit-weighted average over passed courses that have a grade (courses without credits in the data don't count).
export function gradeAverage(data, state) {
  let sum = 0, credits = 0;
  for (const id of state.passed ?? []) {
    const g = state.grades?.[id], c = data.courses[id]?.credits ?? 0;
    if (g === undefined || !(c > 0)) continue;
    sum += g * c;
    credits += c;
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
