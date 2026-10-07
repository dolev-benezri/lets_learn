// Schedule search core. Pure ES module: used by node tests and by solver-worker.js.
import { classify, modeFor } from './rules.js';

const SLOT_START = 7 * 60; // 07:00
const SLOT = 30;           // minutes per bit, 32 bits = 07:00-23:00
const DAYS = 7;            // index 1..6 = Sunday..Friday

export const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

// ponytail: meetings outside 07:00-23:00 are clamped to the edge slots; widen the window if Afeka ever schedules there.
export function meetingsMask(meetings) {
  const mask = new Array(DAYS).fill(0);
  for (const m of meetings) {
    if (!m.day) continue;
    const a = Math.max(0, Math.floor((toMin(m.start) - SLOT_START) / SLOT));
    const b = Math.min(32, Math.ceil((toMin(m.end) - SLOT_START) / SLOT));
    for (let s = a; s < b; s++) mask[m.day] |= 1 << s;
  }
  return mask;
}

export const overlaps = (a, b) => a.some((v, d) => (v & b[d]) !== 0);
export const merge = (a, b) => a.map((v, d) => v | b[d]);
const daysUsed = (mask) => mask.filter((m, d) => d >= 1 && m !== 0).length; // campus days of a week mask (index 0 unused)

// Slots strictly after time t. Not meetingsMask(t..23:00): that floors the start, so a lesson ending exactly at t
// (Afeka lessons end at :50) would share t's slot and count as late.
export const lateMask = (t) => {
  const a = Math.max(0, Math.ceil((toMin(t) - SLOT_START) / SLOT));
  return a > 31 ? 0 : ~0 << a;
};

export function forbiddenMask(c = {}) {
  const m = new Array(DAYS).fill(0);
  const span = (d, from, to) => meetingsMask([{ day: d, start: from, end: to }])[d];
  const busy = meetingsMask(c.blocks ?? []); // always hard; floor/ceil in meetingsMask is the safe side for busy time
  for (let d = 1; d <= 6; d++) {
    m[d] |= busy[d];
    if (c.dayOffHard && c.dayOff?.includes(d)) m[d] = ~0;
    if (c.windowHard && c.notBefore) m[d] |= span(d, '07:00', c.notBefore);
    if (c.windowHard && c.notAfter) m[d] |= lateMask(c.notAfter);
  }
  return m;
}

// Lecturer choices (constraints.lecturers), applied to the options that are left after full groups, busy time and pins:
// an avoided lecturer's options go (unless pinned), and of what remains a preferred lecturer's options win when there are any.
// ponytail: only the primary group's lecturer is matched, linked tutorials are not filtered; widen it if students ask.
function byLecturer(options, lecturers, byId, pins) {
  const who = (o) => lecturers[byId.get(o.groups[0])?.lecturer], pinned = (o) => o.groups.some((id) => pins.includes(id));
  const ok = options.filter((o) => who(o) !== 'avoid' || pinned(o)), pref = ok.filter((o) => who(o) === 'prefer' || pinned(o));
  return ok.some((o) => who(o) === 'prefer') ? pref : ok;
}
export function buildOptions(course, { pins = [], includeFull = false, forbidden = null, friendGroups = [], lecturers = {} } = {}) {
  const byId = new Map(course.groups.map((g) => [g.id, g])), primaries = course.groups.filter((g) => g.primary);
  const options = [];
  // Identical primaries (same type, lecturer, meetings, rooms, links, fullness, friends, pin) are one option;
  // the others are listed as registration alternatives instead of producing duplicate schedules (ISSUES 17א#2).
  const sig = (g) => JSON.stringify([g.type, g.lecturer, g.full, g.linked, g.meetings.map((m) => [m.day, m.start, m.end, m.room]),
    friendGroups.map((fg) => fg.includes(g.id)), pins.includes(g.id)]);
  const firstBySig = new Map(), alts = {};
  for (const p of primaries) {
    const k = sig(p);
    if (firstBySig.has(k)) (alts[firstBySig.get(k)] ??= []).push(p.id);
    else firstBySig.set(k, p.id);
  }
  for (const p of primaries.filter((g) => !Object.values(alts).flat().includes(g.id))) {
    // One linked group of each type, then the same for what was added (course 10013: a tutorial links its lab).
    const grow = (combo, g) => {
      const subsByType = {};
      for (const id of g.linked) {
        const s = byId.get(id);
        if (s && !combo.includes(s)) (subsByType[s.type] ??= []).push(s);
      }
      let out = [combo];
      for (const subs of Object.values(subsByType)) out = out.flatMap((c) => subs.map((s) => [...c, s]));
      return out.flatMap((c) => c.slice(combo.length).reduce((acc, s) => acc.flatMap((cc) => grow(cc, s)), [c]));
    };
    for (const groups of grow([p], p)) {
      const ids = groups.map((g) => g.id);
      if (!includeFull && groups.some((g) => g.full && !pins.includes(g.id))) continue;
      const meetings = groups.flatMap((g) => g.meetings.map((m) => ({ ...m, group: g.id })));
      const mask = meetingsMask(meetings);
      if (forbidden && overlaps(mask, forbidden)) continue;
      const minutes = meetings.reduce((a, m) => a + dur(m), 0);
      const sharedMin = friendGroups.map((fg) => {
        const set = new Set(fg);
        return meetings.filter((m) => set.has(m.group)).reduce((a, m) => a + dur(m), 0);
      });
      const sharesWith = friendGroups.map((fg) => ids.some((gid) => fg.includes(gid)));
      options.push({
        groups: ids, mask, meetings,
        exams: p.exams.filter((e) => e.kind === 'בחינה' && e.moed === 1).map((e) => e.date),
        allExams: p.exams,
        minutes, sharedMin, sharesWith,
        alts: alts[p.id] ? { [p.id]: alts[p.id] } : {},
      });
    }
  }
  const coursePins = pins.filter((id) => byId.has(id)), left = byLecturer(options, lecturers, byId, pins);
  return coursePins.length ? left.filter((o) => coursePins.every((id) => o.groups.includes(id))) : left;
}

// Only `קדם` links block: a `מקביל` course can be taken in the same semester.
const dependents = (data) => {
  const rev = {};
  for (const [id, c] of Object.entries(data.courses)) {
    for (const p of c.prereqs) if (p.kind === 'קדם') for (const a of p.anyOf) if (a.id) (rev[a.id] ??= []).push(id);
  }
  return rev;
};

// id -> Set of every course reachable below it. Kept per dataset object: the map, the side list and the view each ask on every render.
const DOWN = new WeakMap();
export function downstream(data) {
  if (DOWN.has(data)) return DOWN.get(data);
  const rev = dependents(data), out = {};
  for (const id of Object.keys(data.courses)) {
    const seen = new Set();
    const stack = [...(rev[id] ?? [])];
    while (stack.length) {
      const x = stack.pop();
      if (seen.has(x)) continue;
      seen.add(x);
      stack.push(...(rev[x] ?? []));
    }
    out[id] = seen;
  }
  DOWN.set(data, out);
  return out;
}

// `passed` (ids already done) are not counted: they are not "still ahead".
export const unlockCounts = (data, passed = []) => {
  const done = new Set(passed);
  return Object.fromEntries(Object.entries(downstream(data)).map(([id, s]) => [id, [...s].filter((x) => !done.has(x)).length]));
};

// Length (in semesters) of the longest `קדם` chain below each course; 0 when nothing depends on it.
export function chainDepth(data) {
  const rev = dependents(data), memo = {}, path = new Set();
  const depth = (id) => {
    if (id in memo) return memo[id];
    if (path.has(id)) return 0; // prereq cycle in bad data: don't recurse forever
    path.add(id);
    memo[id] = Math.max(-1, ...(rev[id] ?? []).map(depth)) + 1;
    path.delete(id);
    return memo[id];
  };
  return Object.fromEntries(Object.keys(data.courses).map((id) => [id, depth(id)]));
}

// value = credits + BONUS * unlocked courses + DEPTH_BONUS * chain depth. Additive so a 0-credit course that
// unlocks others still counts. BONUS 1: a 0-credit course unlocking 3 (value >= 3) beats a 2-credit elective.
// DEPTH_BONUS 2: one more semester of chain (the critical path) is worth about two unlocked courses.
const BONUS = 1, DEPTH_BONUS = 2;
// id -> value (no bias). Shared by search (per semester) and searchYear (year progress) so the formula lives once.
export function courseValue(data, down = downstream(data)) {
  const depth = chainDepth(data);
  return Object.fromEntries(Object.entries(data.courses).map(([id, c]) => [id, c.credits + BONUS * down[id].size + DEPTH_BONUS * depth[id]]));
}

const DAY_NAMES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו'];
const dur = (m) => toMin(m.end) - toMin(m.start);
const popcount = (x) => {
  x = (x >>> 0) - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return ((x + (x >>> 4) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};

function metrics(sel, mask, ctx) {
  const total = sel.reduce((a, o) => a + o.minutes, 0) || 1;

  let fw = 0, fs = 0;
  const shared = {};
  for (let i = 0; i < ctx.friends.length; i++) {
    const f = ctx.friends[i];
    const s = sel.reduce((a, o) => a + o.sharedMin[i], 0);
    fw += f.weight;
    fs += f.weight * (s / total);
    shared[f.name] = sel.filter((o) => o.sharesWith[i]).length;
  }

  const value = sel.reduce((a, o) => a + ctx.value[o.course], 0);
  const freeDays = [1, 2, 3, 4, 5].filter((d) => mask[d] === 0);

  // ponytail: gaps measured at 30-min slot granularity
  let gapMin = 0;
  for (let d = 1; d <= 6; d++) {
    if (mask[d] === 0) continue;
    const bits = mask[d];
    const lo = 31 - Math.clz32(bits & -bits);
    const hi = 31 - Math.clz32(bits);
    gapMin += ((hi - lo + 1) - popcount(bits)) * 30;
  }

  let outside = 0;
  for (let d = 1; d <= 6; d++) {
    outside += popcount(mask[d] & ctx.prefMask[d]) * 30;
  }

  const dates = sel.flatMap((o) => o.exams).sort();
  let minGap = null;
  for (let i = 1; i < dates.length; i++) {
    const g = (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 864e5;
    minGap = minGap === null ? g : Math.min(minGap, g);
  }

  return {
    m: {
      friends: fw ? fs / fw : 0,
      progress: value / ctx.maxValue,
      freeDays: freeDays.length / 5,
      compact: 1 - Math.min(gapMin / 600, 1),
      timeWindow: 1 - Math.min(outside / 600, 1),
      examSpread: !ctx.examsPublished ? 0 : minGap === null ? 1 : Math.min(minGap, 7) / 7, // fewer than two exams: nothing to crowd (the bound in dfs says the same)
    },
    info: { shared, freeDays, gapMin, minGap },
  };
}

function explain(info, unlocks) {
  const parts = Object.entries(info.shared).filter(([, n]) => n).map(([name, n]) => `${n === 1 ? 'קורס אחד' : `${n} קורסים`} עם ${name}`);
  if (info.freeDays.length) parts.push(`${info.freeDays.map((d) => `יום ${DAY_NAMES[d]}'`).join(', ')} פנוי`);
  parts.push(info.gapMin ? `חלונות: ${Math.round(info.gapMin / 6) / 10} ש'` : 'בלי חלונות');
  if (info.minGap !== null) parts.push(`לפחות ${info.minGap === 1 ? 'יום אחד' : `${info.minGap} ימים`} בין בחינות`);
  if (unlocks) parts.push(unlocks === 1 ? 'פותחת קורס אחד להמשך' : `פותחת ${unlocks} קורסים להמשך`);
  return parts.join(' · ');
}

// freedByBlocks(id): the course would have options if the busy blocks were ignored.
function diagnose(items, data, freedByBlocks, avoids = false) {
  const name = (id) => data.courses[id].name;
  const out = [];
  for (const it of items) if (it.mode === 'must' && !it.options.length) {
    out.push(`${name(it.id)}: אין קבוצה שמתאימה לאילוצים (${freedByBlocks(it.id)
      ? 'זמן תפוס, ' : ''}${avoids ? 'בחירת מרצה, ' : ''}חסימות אישיות, קבוצות מלאות או נעיצה)`);
    // Course 10013: every tutorial links the one lab that is full, and the free lab is linked from nothing (the source page is the same).
    const c = data.courses[it.id], linked = new Set(c.groups.flatMap((g) => g.linked));
    const lone = c.groups.filter((g) => !g.primary && !g.full && !linked.has(g.id) && c.groups.some((f) => f.full && f.type === g.type));
    if (lone.length && !freedByBlocks(it.id) && buildOptions(c, { includeFull: true }).length) {
      out.push(`${name(it.id)}: כל הצירופים כוללים קבוצה מלאה, והקבוצה הפנויה ${lone.map((g) => `${g.id} (${g.type})`).join(', ')} לא מקושרת באתר אפקה`
        + ' לאף הרצאה או תרגול, ולכן אי אפשר לשבץ אותה. אפשר לסמן "לכלול קבוצות מלאות" או לפנות למזכירות.');
    }
  }
  const must = items.filter((x) => x.mode === 'must' && x.options.length);
  for (let i = 0; i < must.length; i++) for (let j = i + 1; j < must.length; j++) {
    if (must[i].options.every((a) => must[j].options.every((b) => overlaps(a.mask, b.mask)))) {
      out.push(`${name(must[i].id)} ו-${name(must[j].id)} מתנגשים בכל צירוף אפשרי`);
    }
  }
  if (!out.length) out.push('אין מערכת שעומדת בכל האילוצים יחד (בחינות באותו יום, תקרת נ"ז או קורס מקביל). נסה לרכך אילוץ.');
  return out;
}

const KNOWN = ['friends', 'progress', 'freeDays', 'compact', 'timeWindow', 'examSpread'];
export function search({ data, courses, statuses = {}, pins = [], constraints = {}, weights = {}, friends = [], topK = 10, timeLimitMs = 3000, prune = true, bias = {} }) {
  if (!(topK > 0)) return { results: [], partial: false, diagnosis: [] };
  const forbidden = forbiddenMask(constraints);
  const down = downstream(data), base = courseValue(data, down);
  const value = {};
  let maxValue = 0;
  const activeFriends = friends.filter((f) => f.active !== false);
  const friendGroups = activeFriends.map((f) => f.groups);
  const items = courses.map(({ id, mode: m }) => {
    const c = data.courses[id];
    const mode = pins.some((p) => c.groups.some((g) => g.id === p)) ? 'must' : m; // a pinned group forces its course in
    value[id] = base[id] + (bias[id] ?? 0);
    maxValue += Math.max(0, value[id]);
    const options = buildOptions(c, { pins, includeFull: constraints.includeFull, forbidden, friendGroups, lecturers: constraints.lecturers }).map((o) => ({ ...o, course: id }));
    return { id, mode, credits: c.credits, options };
  }).sort((a, b) => a.options.length - b.options.length);

  const prefMask = new Array(DAYS).fill(0);
  const c = constraints;
  for (let d = 1; d <= 6; d++) {
    let mask = 0;
    if (c.dayOff?.includes(d)) mask = ~0;
    if (c.notBefore) mask |= meetingsMask([{ day: d, start: '07:00', end: c.notBefore }])[d];
    if (c.notAfter) mask |= lateMask(c.notAfter);
    prefMask[d] = mask;
  }

  const ctx = { friends: activeFriends, value, maxValue: maxValue || 1, constraints, examsPublished: data.examsPublished, prefMask };
  const noExamClash = data.examsPublished && constraints.examsSameDay !== 'allow';
  const conditional = courses.filter(({ id }) => statuses[id]?.missingParallel).map(({ id }) => ({ id, needs: statuses[id].missingParallel }));
  const top = [];
  const sel = [];

  // Branch and bound: an optimistic score for anything reachable from a partial selection. Every metric is either
  // monotone as courses are added (free days and time window only get worse, progress only gains what is left) or
  // bounded by 1 (friends, compact, exam spread with fewer than 2 exams). Pruning never drops a result that would
  // have entered the top K, so the output is identical to the exhaustive search (test: "pruning keeps results").
  const W = (k) => weights[k] ?? 0;
  // bound() only knows these metrics: a weighted metric it doesn't know switches pruning off rather than risk a wrong cut.
  const canPrune = prune && Object.values(weights).every((w) => w >= 0) && Object.entries(weights).every(([k, w]) => !(w > 0) || KNOWN.includes(k));
  const restValue = new Array(items.length + 1).fill(0);
  for (let i = items.length - 1; i >= 0; i--) restValue[i] = restValue[i + 1] + Math.max(0, value[items[i].id]);
  // Friends: per friend the ratio is (shared minutes) / (total minutes), so what is left can lift it to at most
  // (s + R) / (T + R), R = the most shared minutes the remaining items could still add (each item at its best option).
  const fw = activeFriends.reduce((a, f) => a + f.weight, 0);
  const restShared = activeFriends.map(() => new Array(items.length + 1).fill(0));
  for (let i = items.length - 1; i >= 0; i--) {
    for (let f = 0; f < activeFriends.length; f++) restShared[f][i] = restShared[f][i + 1] + Math.max(0, ...items[i].options.map((o) => o.sharedMin[f]));
  }
  const fixedUp = W('compact');
  function friendsUp(i) {
    if (!fw) return 0;
    const T = sel.reduce((a, o) => a + o.minutes, 0);
    let up = 0;
    for (let f = 0; f < activeFriends.length; f++) {
      const s = sel.reduce((a, o) => a + o.sharedMin[f], 0), R = restShared[f][i];
      up += activeFriends[f].weight * (T + R ? (s + R) / (T + R) : 0);
    }
    return up / fw;
  }
  function bound(i, mask, val) {
    let free = 0, outside = 0;
    for (let d = 1; d <= 6; d++) {
      if (d <= 5 && mask[d] === 0) free++;
      outside += popcount(mask[d] & prefMask[d]) * 30;
    }
    let b = fixedUp + W('friends') * friendsUp(i) + W('progress') * ((val + restValue[i]) / ctx.maxValue) + W('freeDays') * (free / 5) + W('timeWindow') * (1 - Math.min(outside / 600, 1));
    if (ctx.examsPublished && W('examSpread')) {
      const dates = sel.flatMap((o) => o.exams).sort();
      let g = null;
      for (let k = 1; k < dates.length; k++) { const x = (Date.parse(dates[k]) - Date.parse(dates[k - 1])) / 864e5; g = g === null ? x : Math.min(g, x); }
      b += W('examSpread') * (g === null ? 1 : Math.min(g, 7) / 7);
    }
    return b + 1e-9; // float slack: sums here run in a different order than in metrics()
  }

  const deadline = Date.now() + timeLimitMs;
  let nodes = 0, partial = false;

  function leaf(mask) {
    if (!sel.length) return;
    const chosen = new Set(sel.map((o) => o.course));
    for (const k of conditional) if (chosen.has(k.id) && !k.needs.every((anyOf) => anyOf.some((x) => chosen.has(x)))) return;
    const { m, info } = metrics(sel, mask, ctx);
    const score = Object.entries(weights).reduce((a, [k, w]) => a + w * (m[k] ?? 0), 0);
    if (top.length === topK && score <= top[top.length - 1].score) return;
    const unlocks = new Set([...chosen].flatMap((id) => [...down[id]]).filter((x) => !chosen.has(x) && statuses[x]?.status !== 'done')).size; // only what is still ahead
    top.push({
      score, breakdown: m, groups: sel.flatMap((o) => o.groups), courses: [...chosen], unlocks, explanation: explain(info, unlocks),
      alts: Object.assign({}, ...sel.map((o) => o.alts)),
      exams: sel.flatMap((o) => o.allExams.map((e) => ({ course: o.course, ...e }))),
    });
    top.sort((a, b) => b.score - a.score);
    if (top.length > topK) top.pop();
  }

  function dfs(i, mask, credits, examDates, val) {
    if (partial) return;
    if (++nodes % 1000 === 0 && Date.now() > deadline) { partial = true; return; }
    if (i === items.length) return leaf(mask);
    if (canPrune && top.length === topK && bound(i, mask, val) <= top[top.length - 1].score) return;
    const it = items[i];
    for (const o of it.options) {
      if (overlaps(mask, o.mask)) continue;
      if (constraints.maxCredits && credits + it.credits > constraints.maxCredits) continue;
      if (constraints.maxDays && daysUsed(merge(mask, o.mask)) > constraints.maxDays) continue; // monotone: a course never frees a day
      if (noExamClash && o.exams.some((d) => examDates.has(d))) continue;
      sel.push(o);
      dfs(i + 1, merge(mask, o.mask), credits + it.credits, noExamClash ? new Set([...examDates, ...o.exams]) : examDates, val + value[it.id]);
      sel.pop();
    }
    if (it.mode === 'optional') dfs(i + 1, mask, credits, examDates, val);
  }

  dfs(0, new Array(DAYS).fill(0), 0, new Set(), 0);
  // No plan under the campus-day cap, but one without it: the cap is the reason (checked with a short, single-result search)
  if (!top.length && !partial && constraints.maxDays && search({ data, courses, statuses, pins, constraints: { ...constraints, maxDays: null }, weights, friends,
    topK: 1, timeLimitMs: timeLimitMs / 4, prune, bias }).results.length) {
    const cap = constraints.maxDays === 1 ? 'יום אחד' : `${constraints.maxDays} ימים`;
    return { results: [], partial: false, diagnosis: [`תקרת ${cap} בקמפוס קטנה מדי לקורסי החובה. העלו אותה או סמנו פחות קורסים כ"חובה".`] };
  }
  const timedOut = ['החיפוש נעצר בגלל מגבלת הזמן לפני שנמצאה מערכת, כך שלא בטוח שאין פתרון. נסו לסמן פחות קורסים כ"אולי".'];
  return { results: top, partial, diagnosis: top.length ? [] : partial ? timedOut : diagnose(items, data, (id) => buildOptions(data.courses[id], { pins,
    includeFull: constraints.includeFull, forbidden: forbiddenMask({ ...constraints, blocks: [] }), friendGroups, lecturers: constraints.lecturers }).length > 0,
    Object.keys(constraints.lecturers ?? {}).length > 0) };
}

const SHARE = { 'א': 0.65, even: 0.5, 'ב': 0.35 };
const LOAD_W = 3, MISSING_W = 5, A_TOP = 50;
// Phase A gets most of the budget (B is usually cheap and hands its unused time forward); each B search has a floor,
// and once the budget is spent by more than half again the remaining alternatives are skipped (they are the lowest ranked).
const A_SHARE = 0.6, B_FLOOR = 100;

// Year plan: top א׳ alternatives, each completed by the best ב׳ alternative with the א׳ courses counted as passed.
export function searchYear({ dataA, dataB, state, yearList, pins = [], constraints = {}, weights = {}, friends = [], topK = 10, timeLimitMs = 3000 }) {
  const deadline = Date.now() + timeLimitMs;
  const offered = (d, id) => !!d.courses[id]?.offered;
  const pinnedIn = (d, id) => pins.some((p) => d.courses[id]?.groups.some((g) => g.id === p));
  const pinnedB = (id) => !pinnedIn(dataA, id) && pinnedIn(dataB, id); // an א׳ pin wins (see forced)
  const pinsOf = (d) => pins.filter((p) => Object.values(d.courses).some((c) => c.groups.some((g) => g.id === p)));
  // Where a course must go: a pin wins, then the student's choice, then the only semester that offers it.
  const forced = (id) => (pinnedIn(dataA, id) ? 'א' : pinnedIn(dataB, id) ? 'ב' : state.semesterOf?.[id]
    ?? (!offered(dataB, id) ? 'א' : !offered(dataA, id) ? 'ב' : null));
  const choices = state.choices ?? {};
  const stA = classify(dataA, state).statuses;
  const coursesA = [], bias = {}, must = new Set();
  for (const id of Object.keys(dataA.courses)) {
    const mode = modeFor(stA[id]?.status, choices[id], yearList.has(id));
    if (mode === 'must') must.add(id);
    if ((mode !== 'must' && mode !== 'optional') || forced(id) === 'ב') continue;
    const flexible = !forced(id);
    coursesA.push({ id, mode: pinnedIn(dataA, id) ? 'must' : flexible ? 'optional' : mode }); // a pin forces its course in, so "take nothing in א׳" below is not a plan
    if (flexible && state.load && state.load !== 'even') bias[id] = (state.load === 'א' ? 1 : -1) * dataA.courses[id].credits;
  }
  // Must courses not offered in א׳ (or not yet available there) still count as must for the year.
  // א׳ candidates count as passed here, so a must course that only opens after one of them (status afterA) is still owed.
  const stY = classify(dataB, { ...state, passed: [...(state.passed ?? []), ...coursesA.map((c) => c.id)] }).statuses;
  // Year progress has one denominator for every pair: the value of every course that could enter this year (א׳ candidates,
  // plus ב׳ courses open once all of them are passed). Each search normalises by its own candidates, and the ב׳ candidates
  // depend on the א׳ alternative, so adding the two halves' progress compared numbers on different scales.
  const vA = courseValue(dataA), vB = courseValue(dataB), inA = new Set(coursesA.map((c) => c.id));
  let yearMax = coursesA.reduce((s, c) => s + Math.max(0, vA[c.id]), 0);
  for (const id of Object.keys(dataB.courses)) {
    const mode = modeFor(stY[id]?.status, choices[id], yearList.has(id));
    // A ב׳ pin makes its course must for the year (as in א׳): if ב׳ cannot honour it, the pair lists it as missing.
    if (mode === 'must' || (mode === 'optional' && pinnedB(id))) must.add(id);
    if ((mode === 'must' || mode === 'optional') && !inA.has(id) && forced(id) !== 'א') yearMax += Math.max(0, vB[id]);
  }
  const sumV = (v, ids) => ids.reduce((s, id) => s + Math.max(0, v[id] ?? 0), 0);
  const Wp = weights.progress ?? 0;

  const argsA = { data: dataA, statuses: stA, pins: pinsOf(dataA), constraints, weights, friends, bias };
  const ra = search({ ...argsA, courses: coursesA, topK: A_TOP, timeLimitMs: timeLimitMs * A_SHARE });
  const credits = (d, ids) => ids.reduce((s, id) => s + (d.courses[id]?.credits ?? 0), 0);
  const name = (id) => dataA.courses[id]?.name ?? id;
  const settled = (x) => (state.passed ?? []).includes(x.id) || stA[x.id]?.status === 'exempt';
  const pairs = [];
  let partial = ra.partial;
  // The top-A_TOP cut ranks א׳ alone, so it can drop the only א׳ plans that open a ב׳ must course. Seed one per such
  // course: the best א׳ plan that takes its open prerequisites (the first א׳ candidate of each open anyOf).
  const key = (a) => [...a.courses].sort().join();
  const seen = new Set(ra.results.map(key)), seeds = [];
  for (const m of must) {
    const need = (dataB.courses[m]?.prereqs ?? []).filter((p) => p.kind === 'קדם' && !p.anyOf.some(settled)).map((p) => p.anyOf.find((x) => inA.has(x.id))?.id);
    if (!need.length || need.includes(undefined)) continue;
    const r = search({ ...argsA, courses: coursesA.map((c) => (need.includes(c.id) ? { ...c, mode: 'must' } : c)), topK: 1, timeLimitMs: Math.max(B_FLOOR,
      (deadline - Date.now()) / (must.size + 1)) });
    partial ||= r.partial;
    const s = r.results[0];
    if (s && !seen.has(key(s))) { seen.add(key(s)); seeds.push(s); }
  }
  // search() never returns an empty selection; when nothing is must in א׳, "take nothing in א׳" is a valid year plan.
  const aList = [...seeds, ...ra.results];
  if (!coursesA.some((c) => c.mode === 'must')) aList.push({ score: 0, breakdown: {}, groups: [], courses: [], unlocks: 0, explanation: '', alts: {}, exams: [] });
  for (const [i, a] of aList.entries()) {
    if (Date.now() > deadline + timeLimitMs / 2) { partial = true; break; }
    const takenA = new Set(a.courses);
    const stateB = { ...state, passed: [...(state.passed ?? []), ...a.courses] };
    const stB = classify(dataB, stateB).statuses;
    const coursesB = Object.keys(dataB.courses).filter((id) => !takenA.has(id) && forced(id) !== 'א')
      .map((id) => ({ id, mode: modeFor(stB[id]?.status, choices[id], yearList.has(id)) }))
      .filter((c) => c.mode === 'must' || c.mode === 'optional')
      .map((c) => (pinnedB(c.id) ? { ...c, mode: 'must' } : c));
    const left = Math.max(B_FLOOR, (deadline - Date.now()) / (aList.length - i));
    const args = { data: dataB, statuses: stB, pins: pinsOf(dataB), constraints, weights, friends, topK: 1, timeLimitMs: left };
    let rb = search({ ...args, courses: coursesB });
    partial ||= rb.partial;
    if (!rb.results.length) {
      // Keep the pair and report what is missing, but give up as few must courses as possible: first relax one at a
      // time (the best scoring success wins), and only when no single one is enough fall back to all optional
      // (keeping the pins if that works). Relaxing a pinned course also lifts its pin, since search() forces pins.
      // ponytail: two or more impossible musts fall straight to all optional; relax pairs if that shows up in real data.
      const mustB = coursesB.filter((c) => c.mode === 'must');
      const relax = (keep) => {
        const lifted = new Set(coursesB.filter((c) => !keep(c)).map((c) => c.id));
        return search({ ...args, timeLimitMs: left / (mustB.length + 2), pins: args.pins.filter((p) => ![...lifted].some((id) => pinnedIn(dataB, id)
          && dataB.courses[id].groups.some((g) => g.id === p))),
          courses: coursesB.map((c) => (keep(c) ? c : { ...c, mode: 'optional' })) });
      };
      // A pin names the exact group, so it is a stronger wish than a must choice: pins are only lifted when no
      // unpinned must is enough.
      const round = (ms) => {
        const tries = ms.map((m) => relax((c) => c !== m));
        partial ||= tries.some((r) => r.partial);
        return tries.filter((r) => r.results.length).sort((x, y) => y.results[0].score - x.results[0].score)[0];
      };
      const pinnedMust = mustB.filter((c) => pinnedB(c.id));
      rb = round(mustB.filter((c) => !pinnedB(c.id))) ?? round(pinnedMust);
      if (!rb && pinnedMust.length) { rb = relax((c) => pinnedB(c.id)); if (!rb.results.length) rb = null; }
      rb ??= relax(() => false);
      partial ||= rb.partial;
    }
    const b = rb.results[0] ?? null;
    if (!a.courses.length && !b?.courses.length) continue; // an empty plan is not an answer: let the UI say why nothing fits
    const all = new Set([...a.courses, ...(b?.courses ?? [])]);
    const missing = [...must].filter((id) => !all.has(id));
    const ca = credits(dataA, a.courses), cb = credits(dataB, b?.courses ?? []), total = ca + cb;
    const loadScore = total ? 1 - Math.min(Math.abs(ca - SHARE[state.load ?? 'even'] * total) / (total / 2), 1) : 1;
    // Only prerequisites still open before א׳: an anyOf already met by a passed (or exempt) option needs nothing from א׳.
    const needs = [...new Set((b?.courses ?? []).flatMap((id) => dataB.courses[id].prereqs.filter((p) => p.kind === 'קדם' && !p.anyOf.some(settled))
      .flatMap((p) => p.anyOf.map((x) => x.id)).filter((x) => takenA.has(x))))];
    // Swap the two per-semester progress terms for the year one. Times 2: each half scored progress in [0, 1], so the
    // year term keeps the old scale against LOAD_W and MISSING_W.
    const yearProgress = (sumV(vA, a.courses) + sumV(vB, b?.courses ?? [])) / (yearMax || 1);
    const progressFix = Wp * (2 * yearProgress - (a.breakdown.progress ?? 0) - (b?.breakdown.progress ?? 0));
    pairs.push({
      score: a.score + (b?.score ?? 0) + progressFix + LOAD_W * loadScore - MISSING_W * missing.length,
      a, b, credits: { a: ca, b: cb }, missing,
      warnings: needs.length ? [`התכנון של ב׳ מניח שעוברים את ${needs.map(name).join(', ')} בא׳`] : [],
    });
  }
  pairs.sort((x, y) => y.score - x.score);
  return { results: pairs.slice(0, topK), partial, diagnosis: pairs.length ? [] : ra.diagnosis };
}
