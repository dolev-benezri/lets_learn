// precision-ref.mjs - MINUTE-exact exhaustive reference + off-grid instance generator, for the F-04/F-05/F-14/F-18 prototype.
// Written from the meaning of the problem, not from solver code: lessons are minute intervals, a lesson clashes with another lesson or
// a busy block when the intervals share a minute, 'outside' minutes are counted one minute at a time, gaps from sorted intervals.
// Differences from repro/search-lib.mjs referenceSolve (which encodes the CURRENT 30-minute-slot behaviour):
//   clash lesson/lesson, lesson/block, hard window, hard day off : real minutes
//   timeWindow outside minutes                                   : real minutes (minute loop)
//   compact gap                                                  : gap='slot' | 'g2' (pause - 10 min recess) | 'g1' (whole pause)
//   an option whose own lessons share a minute                    : dropped (F-18)
import { mulberry32, mm, hhmm, pick, ri, genInstance, valuesRef } from '../repro/search-lib.mjs';

export { mulberry32, mm, hhmm };
const METRIC = ['friends', 'progress', 'freeDays', 'compact', 'timeWindow', 'examSpread'];
const RECESS = 10;

export function referenceMinutes(inst, { cap = 4_000_000, gap = 'g2', f18 = 'group' } = {}) {
  const { data, statuses = {}, pins = [], constraints: c = {}, weights = {}, bias = {} } = inst;
  const friends = (inst.friends ?? []).filter((f) => f.active !== false);
  const val = valuesRef(data);
  const value = {}; let maxValue = 0;
  const noExamClash = data.examsPublished && c.examsSameDay !== 'allow';
  const nb = c.notBefore ? mm(c.notBefore) : null, na = c.notAfter ? mm(c.notAfter) : null;
  const hit = (x) => (c.blocks ?? []).some((b) => b.day === x.day && x.s < mm(b.end) && mm(b.start) < x.e)
    || (c.dayOffHard && (c.dayOff ?? []).includes(x.day)) || (c.windowHard && ((nb !== null && x.s < nb) || (na !== null && x.e > na)));
  const outsideOf = (x) => { // minute by minute: minute t is outside when the day is a wished day off, before notBefore, or from notAfter on
    let n = 0;
    for (let t = x.s; t < x.e; t++) if ((c.dayOff ?? []).includes(x.day) || (nb !== null && t < nb) || (na !== null && t >= na)) n++;
    return n;
  };
  const clash = (a, b) => a.day === b.day && a.s < b.e && b.s < a.e;
  const items = inst.courses.map(({ id, mode }) => {
    const course = data.courses[id];
    value[id] = val[id] + (bias[id] ?? 0);
    maxValue += Math.max(0, value[id]);
    const pinnedHere = pins.filter((p) => course.groups.some((g) => g.id === p));
    const byId = Object.fromEntries(course.groups.map((g) => [g.id, g]));
    const combos = inst.comboFor ? inst.comboFor(id) : course.groups.filter((x) => x.primary).map((g) => [g.id]);
    const options = [];
    for (const ids of combos) {
      const gs = ids.map((x) => byId[x]);
      if (gs.some((g) => g.full && !c.includeFull && !pins.includes(g.id))) continue;
      const iv = gs.flatMap((g) => g.meetings.filter((m) => m.day).map((m) => ({ day: m.day, s: mm(m.start), e: mm(m.end), g: g.id })));
      if (iv.some(hit)) continue;
      if (pinnedHere.length && !pinnedHere.every((p) => ids.includes(p))) continue;
      if (f18 && iv.some((x, i) => iv.slice(0, i).some((y) => clash(x, y) && (f18 === 'meeting' || x.g !== y.g)))) continue;
      const mins = (g) => g.meetings.reduce((a, m) => a + mm(m.end) - mm(m.start), 0);
      const minutes = gs.reduce((a, g) => a + mins(g), 0);
      const sharedMin = friends.map((f) => gs.filter((g) => f.groups.includes(g.id)).reduce((a, g) => a + mins(g), 0));
      options.push({ course: id, groups: ids, iv, outside: iv.reduce((a, x) => a + outsideOf(x), 0), minutes, sharedMin,
        exams: gs[0].exams.filter((e) => e.kind === 'בחינה' && e.moed === 1).map((e) => e.date) });
    }
    return { id, mode: pinnedHere.length ? 'must' : mode, credits: course.credits, options };
  });
  const sols = []; let visited = 0;
  const chosen = [];
  const fw = friends.reduce((a, f) => a + f.weight, 0);
  const slotGap = (ivs) => { // the CURRENT behaviour, rebuilt from slot sets: empty slots between the first and last occupied slot
    const s = new Set();
    for (const x of ivs) for (let k = Math.max(0, Math.floor((x.s - 420) / 30)); k < Math.min(32, Math.ceil((x.e - 420) / 30)); k++) s.add(k);
    if (!s.size) return 0;
    return (Math.max(...s) - Math.min(...s) + 1 - s.size) * 30;
  };
  function metricsRef() {
    const total = chosen.reduce((a, o) => a + o.minutes, 0) || 1;
    let fs = 0;
    friends.forEach((f, i) => { fs += f.weight * (chosen.reduce((a, o) => a + o.sharedMin[i], 0) / total); });
    const progress = chosen.reduce((a, o) => a + value[o.course], 0) / (maxValue || 1);
    let freeDays = 0, g = 0;
    const all = chosen.flatMap((o) => o.iv);
    for (let d = 1; d <= 6; d++) {
      const day = all.filter((x) => x.day === d).sort((a, b) => a.s - b.s);
      if ((d <= 5 || (c.dayOff ?? []).includes(d)) && !day.length) freeDays++; // 2026-10-07 (D1, issue #7): a wished-off Friday counts
      if (gap === 'slot') g += slotGap(day);
      else for (let i = 1; i < day.length; i++) g += Math.max(0, day[i].s - day[i - 1].e - (gap === 'g2' ? RECESS : 0));
    }
    const outside = chosen.reduce((a, o) => a + o.outside, 0);
    const dates = chosen.flatMap((o) => o.exams).sort();
    let minGap = null;
    for (let i = 1; i < dates.length; i++) { const x = (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 864e5; minGap = minGap === null ? x : Math.min(minGap, x); }
    return { friends: fw ? fs / fw : 0, progress, freeDays: freeDays / 5, compact: 1 - Math.min(g / 600, 1), timeWindow: 1 - Math.min(outside / 600, 1),
      examSpread: !data.examsPublished ? 0 : minGap === null ? 1 : Math.min(minGap, 7) / 7 };
  }
  function leaf() {
    if (!chosen.length) return;
    const ids = new Set(chosen.map((o) => o.course));
    for (const it of inst.courses) if (ids.has(it.id) && statuses[it.id]?.missingParallel && !statuses[it.id].missingParallel.every((alts) => alts.some((x) => ids.has(x)))) return;
    const m = metricsRef();
    const score = Object.entries(weights).reduce((a, [k, w]) => a + w * (m[k] ?? 0), 0);
    sols.push({ key: chosen.flatMap((o) => o.groups.map((g) => `${o.course}:${g}`)).sort().join('|'), score, m });
  }
  const daysNow = () => new Set(chosen.flatMap((o) => o.iv.map((x) => x.day))).size;
  function rec(i, credits, exams) {
    if (++visited > cap) throw new Error('reference cap exceeded');
    if (i === items.length) return leaf();
    const it = items[i];
    for (const o of it.options) {
      if (o.iv.some((x) => chosen.some((p) => p.iv.some((y) => clash(x, y))))) continue;
      if (c.maxCredits != null && credits + it.credits > c.maxCredits) continue;
      if (noExamClash && o.exams.some((d) => exams.has(d))) continue;
      chosen.push(o);
      if (c.maxDays != null && daysNow() > c.maxDays) { chosen.pop(); continue; }
      rec(i + 1, credits + it.credits, noExamClash ? new Set([...exams, ...o.exams]) : exams);
      chosen.pop();
    }
    if (it.mode === 'optional') rec(i + 1, credits, exams);
  }
  rec(0, 0, new Set());
  sols.sort((a, b) => b.score - a.score);
  return { sols, items, value, maxValue };
}

// genInstance + minute-precision constraints: windows and busy blocks on ANY minute, biased to the spots that hurt (HH:31-HH:59 limits, blocks that start
// at a :50 lesson end or on its last minutes, ends one minute past a :00 start).
export function genOffGrid(rng, o = {}) {
  const inst = genInstance(rng, o);
  const c = inst.constraints;
  const minute = () => pick(rng, [0, 30, 45, 50, 49, 51, 40, 20, 15, 5, ri(rng, 0, 59), ri(rng, 0, 59)]);
  c.notBefore = rng() < 0.4 ? hhmm(ri(rng, 8, 11) * 60 + minute()) : '';
  c.notAfter = rng() < 0.6 ? hhmm(ri(rng, 12, 21) * 60 + minute()) : '';
  c.windowHard = rng() < 0.35;
  c.blocks = [];
  for (let k = rng() < 0.5 ? ri(rng, 1, 2) : 0; k > 0; k--) {
    const s = ri(rng, 8, 19) * 60 + minute(), e = Math.min(s + ri(rng, 10, 240), 23 * 60);
    c.blocks.push({ day: ri(rng, 1, 6), start: hhmm(s), end: hhmm(Math.max(e, s + 1)), label: 'b' });
  }
  return inst;
}
export { METRIC };
