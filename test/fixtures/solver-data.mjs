// Random two-semester fixtures for the solver checks (test/solver-props.test.mjs, test/check-real.test.mjs). No test runs on import.
// Same LCG as the brief, but exact: s * 1103515245 overflows 2^53 in plain JS floats and distinct seeds then collapse
// onto one sequence. The seed is hashed first so consecutive seeds do not start correlated.
export const rnd = (seed) => {
  let s = Math.imul(seed + 1, 2654435761) >>> 1;
  const next = () => ((s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 2 ** 31);
  next();
  next();
  return next;
};

// Fixture helpers (same shapes as solver.test.mjs).
export const toM = (t) => +t.slice(0, 2) * 60 + +t.slice(3);
export const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const grp = (id, meetings) => ({ id, type: 'הרצאה', primary: true, full: false, linked: [], meetings, exams: [] });
export const yc = (name, credits, groups, prereqs) => ({
  name,
  credits,
  offered: groups.length > 0,
  prereqs,
  groups,
  exams: []
});
export const semData = (semester, courses) => ({
  year: 2027,
  startYear: 2026,
  semester,
  examsPublished: false,
  lists: [{ code: 1, name: "חובה שנה א'", minCredits: 0, courses: Object.keys(courses) }],
  courses
});

export function fixture(seed, { min = 5, max = 8 } = {}) {
  const r = rnd(seed);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = (a) => a[int(0, a.length - 1)];
  const n = int(min, max);
  const ids = Array.from({ length: n }, (_, i) => `C${i}`);
  const credits = {},
    offeredIn = {},
    prereqs = {};
  ids.forEach((id, j) => {
    credits[id] = int(1, 4);
    offeredIn[id] = pick([['א'], ['ב'], ['א', 'ב']]);
    const list = [];
    for (let i = 0; i < j; i++) {
      if (r() < 0.25) {
        const anyOf = [{ id: ids[i], name: ids[i] }];
        if (i > 0 && r() < 0.3) anyOf.push({ id: ids[int(0, i - 1)], name: 'alt' }); // "either of two" prerequisite
        list.push({ kind: 'קדם', anyOf });
      } else if (r() < 0.06) {
        list.push({ kind: 'מקביל', anyOf: [{ id: ids[i], name: ids[i] }] });
      }
    }
    prereqs[id] = list;
  });
  const courses = { א: {}, ב: {} };
  for (const sem of ['א', 'ב']) {
    for (const id of ids) {
      const groups = [];
      if (offeredIn[id].includes(sem)) {
        for (let k = 0, gs = int(1, 3); k < gs; k++) {
          const meetings = [];
          for (let m = 0, ms = int(1, 2); m < ms; m++) {
            const start = 8 * 60 + 30 * int(0, 17); // 08:00..16:30
            const end = Math.min(18 * 60, start + 30 * int(2, 6));
            meetings.push({ day: int(1, 5), start: hhmm(start), end: hhmm(end), room: 'r' });
          }
          groups.push({ ...grp(`${id}${sem}${k}`, meetings), full: r() < 0.25 }); // real data: about 25% of groups are full
        }
      }
      courses[sem][id] = yc(id, credits[id], groups, prereqs[id]);
    }
  }
  const dataA = semData('א', courses.א),
    dataB = semData('ב', courses.ב);

  const choices = {};
  for (const id of ids) choices[id] = r() < 0.3 ? 'must' : 'optional';
  const passed = ids.filter(() => r() < 0.15);
  const semesterOf = {};
  for (const id of ids) if (r() < 0.12) semesterOf[id] = pick(['א', 'ב']);
  const state = { passed, failed: {}, choices, semesterOf, load: pick(['even', 'א', 'ב']) };
  const constraints = r() < 0.5 ? { maxCredits: int(3, 12) } : {};
  if (r() < 0.25) constraints.includeFull = true;

  // A pin goes on a group the student can actually take there: course not passed, offered that semester, all of its
  // prerequisites (קדם and מקביל) already passed.
  const pins = [],
    pinned = []; // one pin per semester, never the same course twice
  if (r() < 0.25) {
    const free = (id) => prereqs[id].every((p) => p.anyOf.some((a) => passed.includes(a.id)));
    for (const [sem, data] of [
      ['א', dataA],
      ['ב', dataB]
    ]) {
      const ok = ids.filter(
        (id) => !passed.includes(id) && offeredIn[id].includes(sem) && free(id) && !pinned.includes(id)
      );
      if (ok.length && r() < 0.6) {
        const id = pick(ok);
        pinned.push(id);
        pins.push(pick(data.courses[id].groups).id);
      }
    }
  }
  return { dataA, dataB, state, constraints, pins, ids, credits };
}
