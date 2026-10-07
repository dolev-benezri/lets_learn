// opts-03  The dedup signature of buildOptions(): which fields decide that two primaries are "identical" and are merged into one option + alts.
// Targets: web/solver-core.js:57-66 (sig = type, lecturer, full, linked, meetings[day,start,end,room], friend membership, pin; NOT exams, NOT semester),
//          :67 (merged primaries are skipped), :93-96 (option.exams / allExams are taken from the representative primary p only, alts = ids of the twins),
//          scripts/build.mjs:35-53 (how the real pipeline assigns exams to primaries), scripts/build.mjs:14-22 (semester of every group).
// Run:  node solver-audit/repro/opts-03-dedup-signature.mjs      (any cwd, ~3 s)
// Proves: synthetic data -> a merge CAN hide a different exam date (and a different semester) of the twin (BUG opts-3, latent);
//         real pipeline + real data -> the precondition does not occur today (every exams[] is empty, build.mjs gives twins identical exams, one file = one semester);
//         the signature otherwise separates what matters (fullness, friends, pins, rooms, lecturer, sub-group ids) -> CHECK lines.
import { buildOptions, search } from '../../web/solver-core.js';
import { buildDataset } from '../../scripts/build.mjs';
import { loadAll, check, bug, note, finish, g, course, dataOf, twinKey } from './opts-lib.mjs';

const ids = (o) => o.groups.join('+');
const show = (c, opt) => buildOptions(c, opt).map((o) => ids(o) + (Object.keys(o.alts).length ? ` alts=${JSON.stringify(o.alts)}` : ''));
const ex = (date) => [{ kind: 'בחינה', moed: 1, date, time: null }];

// ---- A. synthetic: fields that ARE in the signature split twins
{
  const base = () => [g('A', 'סופי-הרצאה'), g('B', 'סופי-הרצאה'), g('C', 'סופי-הרצאה')];
  check('opts-C30', JSON.stringify(show(course(...base()), {})) === JSON.stringify(['A alts={"A":["B","C"]}']), `3 identical primaries -> ${show(course(...base()), {})}`);
  const withMut = (id, f) => course(...base().map((x) => (x.id === id ? f(x) : x)));
  check('opts-C31', show(withMut('B', (x) => ({ ...x, full: true })), { includeFull: true }).length === 2, `a full twin is not merged (includeFull=true): ${show(withMut('B', (x) => ({ ...x, full: true })), { includeFull: true })}`);
  check('opts-C32', show(withMut('B', (x) => ({ ...x, lecturer: 'M' })), {}).length === 2, 'different lecturer is not merged');
  check('opts-C33', show(withMut('B', (x) => ({ ...x, meetings: x.meetings.map((m) => ({ ...m, room: 'other' })) })), {}).length === 2, 'different room is not merged (two options, same times: by design, rooms matter to students)');
  check('opts-C34', show(course(...base()), { friendGroups: [['B']] }).length === 2, `a friend in twin B only splits it: ${show(course(...base()), { friendGroups: [['B']] })}`);
  check('opts-C35', JSON.stringify(show(course(...base()), { pins: ['B'] })) === JSON.stringify(['B']), `pin B -> only B remains, no alts: ${show(course(...base()), { pins: ['B'] })}`);
  check('opts-C36', show(course(...base()), { pins: ['A'] })[0] === 'A', `pin A -> ${show(course(...base()), { pins: ['A'] })}`);
  check('opts-C37', show(course(...base()), { pins: ['ZZ-other-course'] }).length === 1, 'a pin of another course changes nothing (still one merged option)');
  // twins that link different but time-identical tutorials are NOT merged (sig compares link ids): two options with the same times
  const t = course(g('A', 'סופי-הרצאה+תרגול', { linked: ['A/1'] }), g('B', 'סופי-הרצאה+תרגול', { linked: ['B/1'] }), g('A/1', 'תרגול', { m: [[2, '08:00', '08:50']] }), g('B/1', 'תרגול', { m: [[2, '08:00', '08:50']] }));
  const o = buildOptions(t, {});
  check('opts-C38', o.length === 2 && o[0].mask.every((v, d) => v === o[1].mask[d]), `lectures with the same times but different (time-identical) tutorial ids stay 2 options with equal masks: ${o.map(ids)} (info: duplicate-looking alternatives)`);
}

// ---- B. synthetic: fields that are NOT in the signature
{
  const A = g('A', 'סופי-הרצאה', { exams: ex('2027-02-01') }), B = g('B', 'סופי-הרצאה', { exams: ex('2027-02-20') });
  const o = buildOptions(course(A, B), {});
  const merged = o.length === 1 && o[0].alts.A?.[0] === 'B';
  bug('opts-3', merged && JSON.stringify(o[0].exams) === '["2027-02-01"]' && o[0].allExams.length === 1,
    `two primaries with different exam dates are merged: options=${show(course(A, B), {})}, option.exams=${JSON.stringify(o[0].exams)} (B's 2027-02-20 is invisible; solver-core.js:59-60 sig has no exams, :93-94 reads p.exams only)`);
  // consequence in search(): exam-day clash logic (solver-core.js:240) uses only the representative's date
  const C = g('C', 'סופי-הרצאה', { m: [[3, '08:00', '09:50']], exams: ex('2027-02-20') });
  const data = dataOf({ X: course(A, B), Y: course(C) }, { examsPublished: true });
  const res = search({ data, courses: [{ id: 'X', mode: 'must' }, { id: 'Y', mode: 'must' }], constraints: { examsSameDay: 'forbid' }, weights: { progress: 1 }, topK: 5 });
  const r = res.results[0];
  bug('opts-3b', res.results.length === 1 && r.alts.A?.[0] === 'B', `search(X,Y) offers ONE plan ${r?.groups} with alts ${JSON.stringify(r?.alts)}: registering the "alternative" B puts X's exam on 2027-02-20 = Y's exam day, the plan says nothing`);
  const S1 = g('A', 'סופי-הרצאה'), S2 = { ...g('B', 'סופי-הרצאה'), semester: 'ב' };
  check('opts-C39', buildOptions(course(S1, S2), {}).length === 1, 'semester is not in the signature either: twins of different semesters merge (harmless in real data: see C42; one data file = one semester)');
}

// ---- C. real pipeline: can build.mjs ever give two merged twins different exams?
{
  const pg = (id, lecturer) => ({ id, type: 'סופי-הרצאה', primary: true, lecturer, full: false, linked: [], meetings: [{ semester: 'א', day: 2, start: '12:00', end: '13:50', room: 'r' }], detailsArgs: null });
  const build = (lecturerA, lecturerB, exams) => buildDataset({ year: 2027, startYear: 2026, program: 1, semester: 'א', department: 'x', fetchedAt: 'x', exams,
    lists: [{ code: 1, name: 'l', minCredits: 0, courses: [{ id: '1', name: 'c', offered: true }] }],
    raw: { 1: { groups: [pg('101', lecturerA), pg('102', lecturerB)], details: { credits: 3, prereqs: [] } } } }).courses['1'].groups;
  const row = (lecturer, date) => ({ semester: 'א', courseId: '1', lecturer, kind: 'בחינה', moeds: [{ moed: 1, date, time: null }] });
  const twinsSame = build('ד"ר א', 'ד"ר א', [row('ד"ר א', '2027-02-01')]);
  const twinsUnmatched = build('ד"ר א', 'ד"ר א', [row('ד"ר ב', '2027-02-03')]);
  const twinsTwoRows = build('ד"ר א', 'ד"ר א', [row('ד"ר א', '2027-02-01'), row('ד"ר ב', '2027-02-03')]);
  const same = (gs) => JSON.stringify(gs[0].exams) === JSON.stringify(gs[1].exams) && gs[0].exams.length > 0;
  check('opts-C40', same(twinsSame) && same(twinsUnmatched) && same(twinsTwoRows), 'buildDataset: two primaries with the same lecturer always get identical exams (lecturer match, course-level fallback, or both) -> merged twins cannot differ in exams');
  const diff = build('ד"ר א', 'ד"ר ב', [row('ד"ר א', '2027-02-01'), row('ד"ר ב', '2027-02-20')]);
  check('opts-C41b', buildOptions(course(...diff), {}).length === 2, `different lecturers with different exams stay 2 options: ${show(course(...diff), {})}`);
}

// ---- D. real data
const all = loadAll();
{
  let semBad = 0, examsNonEmpty = 0, published = 0, classes = 0, orderMiss = 0, linkOrderMiss = 0;
  const merged = [];
  const sameTime = { lecturer: 0, room: 0, subgroups: 0, fullness: 0, other: 0 };
  const seen = new Set();
  for (const { sem, data } of all) {
    if (data.examsPublished) published++;
    for (const [cid, c] of Object.entries(data.courses)) {
      for (const x of c.groups) { if (x.semester !== data.semester) semBad++; if (x.exams.length) examsNonEmpty++; }
      if (seen.has(sem + cid)) continue; seen.add(sem + cid);
      const o = buildOptions(c, { includeFull: true });
      for (const op of o) for (const [rep, twins] of Object.entries(op.alts)) {
        classes++;
        const gs = [rep, ...twins].map((id) => c.groups.find((x) => x.id === id));
        merged.push(`${sem}#${cid}: ${gs.map((x) => x.id)} (${gs[0].type}, ${gs[0].lecturer}, ${JSON.stringify(gs[0].meetings.map((m) => `${m.day} ${m.start}-${m.end}`))})`);
        if (gs.some((x) => JSON.stringify(x.exams) !== JSON.stringify(gs[0].exams) || x.semester !== gs[0].semester)) semBad += 1000;
      }
      // primaries that are identical except for the ORDER of meetings or of linked ids: not merged (the sig is order-sensitive)
      const prim = c.groups.filter((x) => x.primary);
      for (let i = 0; i < prim.length; i++) for (let j = i + 1; j < prim.length; j++) {
        const a = prim[i], b = prim[j], norm = (x) => [x.type, x.lecturer, x.full, [...x.linked].sort().join(','), x.meetings.map((m) => `${m.day}@${m.start}-${m.end}@${m.room}`).sort().join(';')].join('#');
        if (twinKey(a) !== twinKey(b) && norm(a) === norm(b)) { if (JSON.stringify(a.meetings) !== JSON.stringify(b.meetings)) orderMiss++; else linkOrderMiss++; }
      }
      // options of one course with equal meeting times that are not merged: which field differs?
      const byTime = new Map();
      for (const op of o) { const k = op.meetings.map((m) => `${m.day}@${m.start}-${m.end}`).sort().join(';'); (byTime.get(k) ?? byTime.set(k, []).get(k)).push(op); }
      for (const list of byTime.values()) for (let i = 1; i < list.length; i++) {
        const a = c.groups.find((x) => x.id === list[0].groups[0]), b = c.groups.find((x) => x.id === list[i].groups[0]);
        if (a.lecturer !== b.lecturer) sameTime.lecturer++; else if (JSON.stringify(a.meetings) !== JSON.stringify(b.meetings)) sameTime.room++; else if (a.id === b.id) sameTime.subgroups++; else if (a.full !== b.full) sameTime.fullness++; else sameTime.other++;
      }
    }
  }
  check('opts-C42', semBad === 0 && examsNonEmpty === 0 && published === 0, `real data: groups with semester != file semester or merged twins differing in exams/semester: ${semBad}; non-empty exams[] in any file: ${examsNonEmpty}; files with examsPublished: ${published}`);
  check('opts-C43', classes === 1, `real merges (distinct semester/course pairs): ${classes}: ${merged.join(' ; ')}`);
  check('opts-C44', orderMiss === 0 && linkOrderMiss === 0, `primaries identical except meeting order ${orderMiss} / linked-id order ${linkOrderMiss} (would be missed merges)`);
  check('opts-C45', sameTime.other === 0, `options of one course with identical times that are not merged, by what differs: ${JSON.stringify(sameTime)} (same primary but different tutorial ids ${sameTime.subgroups}; different lecturer ${sameTime.lecturer}; same lecturer different room ${sameTime.room}; identical but one is full ${sameTime.fullness}): all are real differences, none is a missed merge`);
}
note('exam dates are empty in all 144 files (build.mjs:21 writes exams: [] and the exams page is not published), so every exam-related path of buildOptions (solver-core.js:93-94) is only exercisable with synthetic data.');
finish();
