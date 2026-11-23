// The improve page's course search (phase 2, Task F). Pure, no DOM: a query (text, day, hour, semester, program) becomes up to 30 courses, each with the
// options the site can really register (buildOptions: a lecture with its required tutorial or lab) and, per option, whether it fits the shown week.
//
//   searchCourses(ctx, query) -> { list, more, empty }
//     ctx   = { data: { [sem]: dataset }  the student's program, every loaded semester
//               foreign: { [sem]: dataset } | null  another program's files (read only)
//               sem: the record's semester, week: the shown week's lessons, inSchedule: Set of course ids in it, statuses: classify() of `data[sem]`,
//               registered, owned: the groups of the registered schedule, split: the build page's option }
//     query = { text, day, hour, sem, program }   program: 'mine' (default) or the foreign program's id
//   list: [{ id, name, code, credits, open, why, needs, readOnly, readOnlyWhy, inSchedule, options: [{ ids, line, lecturer, fit, clash }] }]
//     fit: 'fits' (no part clashes with the week, the course itself left out) | 'clash' (names in `clash`) | 'full' (a part is full)
//   empty: nothing was asked (no text, day or hour): no list, the caller says how to ask.
import { buildOptions, meetingsMask, overlaps } from './solver-core.js';

export const MAX_RESULTS = 30;
const DAY = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const OPEN = ['retake', 'available', 'afterA', 'conditional']; // the statuses a course can be taken in (rules.js classify)

// A lecturer's name without its title ("ד״ר", "גב׳", "מר", "פרופ׳"): the titles do not count in a search.
export const stripTitle = (name) => (name ?? '').replace(/^(?:(?:ד["״]ר|גב['׳]|מר|פרופ(?:['׳.]|סור)?)\.?\s+)+/, '').trim();
const norm = (s) => (s ?? '').toString().toLowerCase().replace(/["״'׳]/g, '').replace(/\s+/g, ' ').trim();
const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

// "יום ד׳ 14:00–15:50, יום ה׳ 09:00–10:50": the option's lessons, merged where a lecture and its tutorial follow each other
export function optionLine(meetings) {
  const byDay = new Map();
  for (const m of meetings) (byDay.get(m.day) ?? byDay.set(m.day, []).get(m.day)).push([toMin(m.start), toMin(m.end)]);
  const hhmm = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .flatMap(([d, spans]) => {
      const merged = [];
      for (const s of spans.sort((a, b) => a[0] - b[0])) {
        if (merged.length && s[0] <= merged.at(-1)[1]) merged.at(-1)[1] = Math.max(merged.at(-1)[1], s[1]);
        else merged.push([...s]);
      }
      return merged.map(([a, b]) => `יום ${DAY[d]}׳ ${hhmm(a)}–${hhmm(b)}`);
    })
    .join(', ');
}

// Does this group meet on `day` (any day when null) at `hour` ("HH:MM", any hour when null; a meeting covers it from its start up to its end)?
const meetsAt = (g, day, hour) =>
  g.meetings.some((m) => (!day || m.day === day) && (!hour || (toMin(m.start) <= toMin(hour) && toMin(hour) < toMin(m.end))));

// How the text reads a course: by its code (the key or a group id starts with it), its name (any part), a lecturer (any part, titles aside)
function textHits(id, c, q) {
  const t = norm(stripTitle(q)) || norm(q); // a title in the query does not count either
  if (!t) return { any: true, groups: null };
  const digits = /^\d+$/.test(t);
  const byCode = digits && id.startsWith(t), byName = norm(c.name).includes(t);
  const named = c.groups.filter((g) => (digits && g.id.startsWith(t)) || norm(stripTitle(g.lecturer)).includes(t));
  // a code or name hit takes the whole course; a group id or lecturer hit narrows the options to the groups it names
  return { any: byCode || byName || named.length > 0, groups: byCode || byName || !named.length ? null : new Set(named.map((g) => g.id)) };
}

function reasonOf(status, data) {
  if (!status) return '';
  if (status.status === 'done') return 'עברת את הקורס';
  if (status.status === 'exempt') return status.reasons?.[0] ?? 'פטור';
  if (status.status === 'notOffered') return status.reasons?.[0] ?? 'הקורס לא נלמד';
  if (status.status === 'blocked') {
    const names = (status.blockedBy ?? []).map((alts) => alts.map((a) => data.courses[a]?.name ?? a).join(' או '));
    return names.length ? `חסרה דרישת קדם: ${names.join(', ')}` : 'חסרה דרישת קדם';
  }
  return '';
}

// Can the student take this course now, in the week the edit search builds? Open for their record, and an option it can register: with a registered
// schedule a full group passes only when it is theirs (edit-search.js editQuery: includeFull / allowFull).
const usableNow = (x, ctx, data) =>
  OPEN.includes(ctx.statuses?.[x]?.status) && !!data.courses[x]?.groups.length &&
  buildOptions(data.courses[x], { includeFull: !ctx.registered, allowFull: ctx.registered ? ctx.owned ?? [] : undefined, split: !!ctx.split }).length > 0;

// The courses a course needs in parallel, as ids: for each requirement the schedule does not already meet (an alternative in it), the first alternative the
// student can take; those need theirs in turn (cycles and chains deeper than three cut), so "הוספה" can add the whole set. null when one cannot be met.
function companions(id, ctx, data, seen = new Set([id]), depth = 0) {
  const out = [];
  for (const alts of ctx.statuses?.[id]?.missingParallel ?? []) {
    if (alts.some((x) => ctx.inSchedule?.has(x))) continue;
    const pick = alts.find((x) => !seen.has(x) && usableNow(x, ctx, data));
    if (!pick) return null;
    seen.add(pick);
    const deeper = depth < 3 ? companions(pick, ctx, data, seen, depth + 1) : [];
    if (!deeper) return null;
    out.push(pick, ...deeper);
  }
  return [...new Set(out)];
}

export function searchCourses(ctx, query) {
  const sem = query.sem ?? ctx.sem;
  const mine = !query.program || query.program === 'mine';
  const data = (mine ? ctx.data : ctx.foreign)?.[sem];
  const text = (query.text ?? '').trim(), day = query.day || null, hour = query.hour || null;
  if (!text && !day && !hour) return { list: [], more: false, empty: true };
  if (!data) return { list: [], more: false, empty: false };
  const sameSem = sem === ctx.sem;
  const week = (ctx.week ?? []).filter((l) => l.day);
  const rows = [];
  for (const [id, c] of Object.entries(data.courses)) {
    if (!c.groups.length) continue;
    const hit = textHits(id, c, text);
    if (!hit.any) continue;
    // the groups that satisfy the group-level criteria (day, hour, a lecturer or group-id hit); none asked: every option stays
    const wanted = day || hour || hit.groups;
    const ok = (g) => (!(day || hour) || meetsAt(g, day, hour)) && (!hit.groups || hit.groups.has(g.id));
    if (wanted && !c.groups.some(ok)) continue;
    const status = mine && sameSem ? ctx.statuses?.[id] : null;
    const open = mine && sameSem && OPEN.includes(status?.status);
    const inSchedule = mine && sameSem && !!ctx.inSchedule?.has(id);
    const byId = new Map(c.groups.map((g) => [g.id, g]));
    const others = week.filter((l) => l.course !== id);
    // an option stands for every registration alternative buildOptions folded into it (identical lectures: o.alts): a group id the query names may be one of
    // those, and then the option offered carries that group in place of the one it was built on
    const options = buildOptions(c, { includeFull: true, split: !!ctx.split })
      .flatMap((o) => {
        if (!wanted || o.groups.some((gid) => ok(byId.get(gid)))) return [o];
        const via = Object.entries(o.alts ?? {}).flatMap(([from, list]) => list.filter((a) => ok(byId.get(a))).map((a) => [from, a]))[0];
        return via ? [{ ...o, groups: o.groups.map((gid) => (gid === via[0] ? via[1] : gid)) }] : [];
      })
      .map((o) => {
        const clash = [...new Set(others.filter((l) => overlaps(meetingsMask([l]), o.mask)).map((l) => l.name ?? l.course))];
        const full = o.groups.some((gid) => byId.get(gid).full && !(ctx.owned ?? []).includes(gid));
        return {
          ids: o.groups,
          line: optionLine(o.meetings),
          lecturer: [...new Set(o.groups.map((gid) => stripTitle(byId.get(gid).lecturer)).filter(Boolean))].join(', '),
          fit: full ? 'full' : clash.length ? 'clash' : 'fits',
          clash
        };
      });
    // a course (a conditional one, or a retake with the same requirement) that needs another in parallel: "הוספה" adds them all, see companions(). Closed,
    // with the reason, when a requirement has no course the student can take.
    const need = open ? status.missingParallel ?? [] : [];
    const found = need.length ? companions(id, ctx, data) : [];
    const withIds = found ?? [];
    const stuck = found ? [] : need.filter((alts) => !alts.some((x) => ctx.inSchedule?.has(x)));
    const parallelWhy = stuck.length ? `דורש במקביל קורס שאי אפשר להירשם אליו עכשיו: ${stuck.map((alts) => alts.map((x) => data.courses[x]?.name ?? x).join(' או ')).join(', ')}` : '';
    rows.push({
      id, name: c.name, code: id, credits: c.credits, open: open && !stuck.length, inSchedule,
      // what is already in the schedule needs no "passed" or "blocked" label: it is there
      why: mine && sameSem && !inSchedule ? (open ? parallelWhy : reasonOf(status, data)) : '',
      withIds, needs: withIds.length ? `דורש במקביל: ${withIds.map((x) => data.courses[x]?.name ?? x).join(', ')}` : '',
      readOnly: !(mine && sameSem),
      readOnlyWhy: !mine ? 'לא בתוכנית שלך' : !sameSem ? `בסמסטר ${sem}׳` : '',
      options
    });
  }
  rows.sort((a, b) => Number(b.open) - Number(a.open) || a.name.localeCompare(b.name, 'he'));
  return { list: rows.slice(0, MAX_RESULTS), more: rows.length > MAX_RESULTS, empty: false };
}
