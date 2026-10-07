// year-gen.mjs - seeded random two-semester instances for the year-* repro scripts (not a script itself).
// Small datasets: every meeting starts on the hour and lasts 110 or 120 minutes, so the solver's 30-minute slot grid and exact
// minutes agree on what clashes. opts switch features on/off (see keys below).
import { mulberry32, clashes, mt, hhmm, grp, crs, pre, outside, semData } from './year-lib.mjs';

export function genInstance(seed, o = {}) {
  const r = mulberry32(seed);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = (a) => a[int(0, a.length - 1)];
  const n = o.n ?? int(5, 7);
  const ids = Array.from({ length: n }, (_, i) => `C${i}`);
  const credits = {}, where = {}, prereqs = {};
  ids.forEach((id, j) => {
    credits[id] = int(1, 5);
    where[id] = pick(o.where ?? [['א'], ['ב'], ['א', 'ב'], ['א', 'ב']]);
    const list = [];
    for (let i = 0; i < j; i++) {
      if (r() < (o.preP ?? 0.25)) {
        const alt = i > 0 && r() < 0.3 ? ids[int(0, i - 1)] : null;
        list.push(pre(ids[i], 'קדם', alt));
      } else if (r() < (o.parP ?? 0.08)) list.push(pre(ids[i], 'מקביל'));
    }
    if (r() < (o.outsideP ?? 0.08)) list.push(outside());
    prereqs[id] = list;
  });
  const sems = { א: {}, ב: {} };
  for (const sem of ['א', 'ב']) for (const id of ids) {
    const groups = [];
    if (where[id].includes(sem)) {
      const gs = int(1, (sem === 'א' ? o.maxGroupsA : o.maxGroupsB) ?? o.maxGroups ?? 3);
      for (let k = 0; k < gs; k++) {
        const ms = [];
        for (let m = 0, mc = int(1, 2); m < mc; m++) {
          const start = 60 * int(8, 18), dur = pick([110, 120]);
          const x = mt(int(1, 5), hhmm(start), hhmm(start + dur));
          if (!ms.some((y) => clashes(x, y))) ms.push(x); // a group never overlaps itself
        }
        groups.push(grp(`${id}${sem}${k}`, ms, { semester: sem, full: r() < (o.fullP ?? 0.1) }));
      }
    }
    sems[sem][id] = crs(`${id}`, credits[id], groups, prereqs[id]);
  }
  const dataA = semData('א', sems.א), dataB = semData('ב', sems.ב);
  const mustP = o.mustP ?? 0.3;
  const choices = {}, yl = new Set();
  for (const id of ids) {
    const x = r();
    if (x < mustP) choices[id] = 'must'; else if (x < mustP + 0.55) choices[id] = 'optional'; else if (x < 0.95) choices[id] = 'no';
    if (r() < 0.5) yl.add(id);
  }
  const passed = ids.filter(() => r() < (o.passedP ?? 0.1));
  const failed = {};
  for (const id of ids) if (!passed.includes(id) && r() < (o.failedP ?? 0.05)) failed[id] = 1;
  const semesterOf = {};
  for (const id of ids) if (r() < (o.semOfP ?? 0.12)) semesterOf[id] = pick(['א', 'ב']);
  const state = { passed, failed, choices, semesterOf, load: pick(['even', 'א', 'ב']), profile: { year: 1, amirnet: null, specs: [] } };
  const constraints = {};
  if (r() < (o.capP ?? 0.3)) constraints.maxCredits = int(4, 12);
  if (r() < (o.blockP ?? 0.3)) constraints.blocks = [{ day: int(1, 5), start: hhmm(60 * int(8, 15)), end: hhmm(60 * int(16, 20)), label: 'b' }];
  if (r() < 0.3) { constraints.dayOff = [int(1, 5)]; constraints.dayOffHard = r() < 0.5; }
  if (r() < 0.3) { constraints.notAfter = '18:00'; constraints.windowHard = r() < 0.4; }
  const pins = [];
  if (r() < (o.pinP ?? 0.2)) {
    const id = pick(ids), sem = pick(['א', 'ב']), g = (sem === 'א' ? dataA : dataB).courses[id].groups;
    if (g.length) pins.push(pick(g).id);
  }
  const weights = { progress: pick([0, 1, 3, 5]), freeDays: pick([0, 1, 3, 5]), compact: pick([0, 1, 3, 5]), timeWindow: pick([0, 1, 3, 5]), friends: 0, examSpread: 0 };
  return { dataA, dataB, state, yearList: yl, pins, constraints, weights, ids };
}
