// opts-04  Pins and lecturer prefer/avoid inside buildOptions() / byLecturer(), with hand-derived expected values.
// Targets: web/solver-core.js:49-53 (byLecturer), :81 (full groups, pins exempt), :100-101 (order: byLecturer first, pin filter after), :260-261 (how search() calls it), :370-372 (diagnose call),
//          web/ui-grid.js:240 (UI offers prefer/avoid only for primary groups), web/ui-actions.js:73-79 (the toast promise), web/app.js:77-78 (normalisation of constraints.lecturers).
// Run:  node solver-audit/repro/opts-04-pins-lecturers.mjs      (any cwd, ~3 s)
// Proves: CHECK lines = pin / includeFull / lecturer behaviour matches the hand-derived expectation (and where the behaviour is a deliberate limit, that limit);
//         BUG opts-2 = a "prefer lecturer" choice is applied as a HARD per-course filter before courses are combined, so it can turn a feasible search into "no schedule"
//         (synthetic + real data 2027-1/30-2026); BUG opts-7 = a pin on a shared sub-group silently cancels avoid/prefer of the lecturers of the lectures that reach it (latent: real data has one shared sub-group, same lecturer on both sides).
import fs from 'node:fs';
import { buildOptions, search, forbiddenBy } from '../../web/solver-core.js'; // 2026-10-07: forbiddenMask became forbiddenBy (stage 4)
import { loadAll, check, bug, note, finish, g, course, dataOf } from './opts-lib.mjs';

const S = (c, opt) => buildOptions(c, opt).map((o) => o.groups.join('+')).sort();
const eq = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const lec = (lecturers, rest = {}) => ({ lecturers, ...rest });

// ===== pins =====
// L1 (lecturer X) links tutorials T1a,T1b; L2 (lecturer Y) links T2
const P = (o = {}) => course(
  g('L1', 'סופי-הרצאה+תרגול', { lecturer: 'X', linked: ['T1a', 'T1b'], full: o.fullL1, m: [[1, '08:00', '09:50']] }), g('L2', 'סופי-הרצאה+תרגול', { lecturer: 'Y', linked: ['T2'], m: [[2, '08:00', '09:50']] }),
  g('T1a', 'תרגול', { lecturer: 'Z', full: o.fullT1a, m: [[3, '08:00', '08:50']] }), g('T1b', 'תרגול', { lecturer: 'Z', m: [[3, '10:00', '10:50']] }), g('T2', 'תרגול', { lecturer: 'Z', full: o.fullT2, m: [[4, '08:00', '08:50']] }));
check('opts-C50', eq(S(P(), {}), ['L1+T1a', 'L1+T1b', 'L2+T2']), `no pins: ${S(P(), {})}`);
check('opts-C51', eq(S(P(), { pins: ['T1b'] }), ['L1+T1b']), `pin tutorial T1b -> ${S(P(), { pins: ['T1b'] })} (its lecture L1 is implied)`);
check('opts-C52', eq(S(P(), { pins: ['L2'] }), ['L2+T2']), `pin lecture L2 -> ${S(P(), { pins: ['L2'] })}`);
check('opts-C53', eq(S(P(), { pins: ['L1', 'T1a'] }), ['L1+T1a']), 'pin lecture + its tutorial -> one option');
check('opts-C54', S(P(), { pins: ['L1', 'T2'] }).length === 0, 'pins that cannot coexist (L1 and T2 of L2) -> no option');
check('opts-C55', S(P(), { pins: ['L1', 'L2'] }).length === 0, `two primaries of one course pinned -> no option (a registration has exactly one primary): ${S(P(), { pins: ['L1', 'L2'] })}`);
{
  const data = dataOf({ X: P() });
  const r = search({ data, courses: [{ id: 'X', mode: 'optional' }], pins: ['L1', 'L2'], constraints: {}, weights: { progress: 1 } });
  check('opts-C56', r.results.length === 0 && /נעיצה/.test(r.diagnosis.join(' ')), `search(): pinned course is forced to 'must' (solver-core.js:258) and, with two primaries pinned, reports: ${r.diagnosis[0]}`);
  check('opts-C57', S(P(), { pins: ['ZZ'] }).length === 3, 'a pin that belongs to another course is ignored (solver-core.js:100)');
}
// full groups and pins (solver-core.js:81)
check('opts-C58', eq(S(P({ fullL1: true }), {}), ['L2+T2']) && eq(S(P({ fullL1: true }), { includeFull: true }), ['L1+T1a', 'L1+T1b', 'L2+T2']), 'full lecture L1: dropped by default, back with includeFull=true');
check('opts-C59', eq(S(P({ fullL1: true }), { pins: ['L1'] }), ['L1+T1a', 'L1+T1b']), `pinned full lecture is kept although includeFull=false: ${S(P({ fullL1: true }), { pins: ['L1'] })}`);
check('opts-C60', S(P({ fullL1: true }), { pins: ['T1a'] }).length === 0, 'pinning a tutorial does NOT unlock its FULL lecture: no option (pin exemption is per pinned group, :81)');
check('opts-C61', eq(S(P({ fullT1a: true }), {}), ['L1+T1b', 'L2+T2']) && eq(S(P({ fullT1a: true }), { includeFull: true }), ['L1+T1a', 'L1+T1b', 'L2+T2']), 'full linked tutorial T1a: only the options through it disappear (includeFull=false); includeFull=true restores them');
check('opts-C62', eq(S(P({ fullT1a: true }), { pins: ['T1a'] }), ['L1+T1a']), 'pinned full tutorial is allowed when its lecture is not full');
check('opts-C63', eq(S(P({ fullT2: true }), {}), ['L1+T1a', 'L1+T1b']), 'the only tutorial of L2 is full -> the (non-full) lecture L2 has no registration and disappears (includeFull semantics: any full member kills the option)');

// ===== lecturers =====
// A (X) with tutorial A/1 (Z); B (Y); C (X)
const Lc = (o = {}) => course(
  g('A', 'סופי-הרצאה+תרגול', { lecturer: 'X', linked: ['A/1'], m: [[1, '08:00', '09:50']] }), g('A/1', 'תרגול', { lecturer: 'Z', m: [[3, '08:00', '08:50']] }),
  g('B', 'סופי-הרצאה', { lecturer: 'Y', full: o.fullB, m: [[2, '08:00', '09:50']] }), g('C', 'סופי-הרצאה', { lecturer: 'X', m: [[4, '08:00', '09:50']] }));
check('opts-C70', eq(S(Lc(), lec({ X: 'avoid' }, {})), ['A+A/1', 'B', 'C']) === false && eq(S(Lc(), { lecturers: { X: 'avoid' } }), ['B']), `avoid X -> ${S(Lc(), { lecturers: { X: 'avoid' } })}`);
check('opts-C71', eq(S(Lc(), { lecturers: { Y: 'prefer' } }), ['B']), `prefer Y (has options) -> only Y's options: ${S(Lc(), { lecturers: { Y: 'prefer' } })}`);
check('opts-C72', eq(S(Lc(), { lecturers: { X: 'prefer' } }), ['A+A/1', 'C']), `prefer X -> ${S(Lc(), { lecturers: { X: 'prefer' } })}`);
check('opts-C73', eq(S(Lc(), { lecturers: { Q: 'prefer' } }), ['A+A/1', 'B', 'C']), 'prefer a lecturer who has no option -> nothing is narrowed');
check('opts-C74', eq(S(Lc(), { lecturers: { X: 'avoid' }, pins: ['A'] }), ['A+A/1']), 'avoided lecturer but pinned lecture -> its option survives (:50 pinned())');
check('opts-C75', eq(S(Lc(), { lecturers: { X: 'avoid', Y: 'prefer' }, pins: ['C'] }), ['C']), 'avoid X, prefer Y, pin C(X) -> pin wins: only C');
check('opts-C76', eq(S(Lc({ fullB: true }), { lecturers: { Y: 'prefer' } }), ['A+A/1', 'C']), 'preferred lecturer only on a FULL group (includeFull=false): the full option is gone before the preference is applied -> prefer narrows nothing');
check('opts-C77', eq(S(Lc({ fullB: true }), { lecturers: { Y: 'prefer' }, includeFull: true }), ['B']), 'same with includeFull=true: the full group of the preferred lecturer wins over free groups');
{
  const blockB = forbiddenBy({ blocks: [{ day: 2, start: '08:00', end: '10:00' }] });
  check('opts-C78', eq(S(Lc(), { lecturers: { Y: 'prefer' }, forbidden: blockB }), ['A+A/1', 'C']), 'preferred lecturer only in busy time: option removed by the block first, so prefer narrows nothing');
}
check('opts-C79', eq(S(Lc(), { lecturers: { Z: 'avoid' } }), ['A+A/1', 'B', 'C']) && eq(S(Lc(), { lecturers: { Z: 'prefer' } }), ['A+A/1', 'B', 'C']), 'LIMITATION (solver-core.js:48,50): only the PRIMARY group lecturer is matched; avoiding/preferring a tutorial lecturer (Z) changes nothing');
{
  const src = fs.readFileSync(new URL('../../web/ui-grid.js', import.meta.url), 'utf8').split('\n');
  const line = src.findIndex((l) => l.includes('g.lecturer && g.primary ? lecturerBtns')) + 1;
  check('opts-C80', line === 240, `the UI only shows prefer/avoid buttons for primary groups (web/ui-grid.js:${line}) -> the limitation above is not reachable from the UI, only from a hand-edited share link`);
}
{
  const c = course(g('A', 'סופי-הרצאה', { lecturer: 'constructor' }), g('B', 'סופי-הרצאה', { lecturer: '__proto__', m: [[2, '08:00', '09:50']] }));
  let threw = null, n = 0;
  try { n = buildOptions(c, { lecturers: {} }).length; } catch (e) { threw = e.message; }
  check('opts-C81', threw === null && n === 2, `lecturer names like 'constructor'/'__proto__' with lecturers={} do not crash or filter (${n} options)`);
  let nullThrows = false; try { buildOptions(c, { lecturers: null }); } catch { nullThrows = true; }
  check('opts-C82', nullThrows, 'ROBUSTNESS: lecturers:null throws (solver-core.js:50 lecturers[...] on null); unreachable from the UI because web/app.js:77 only copies plain objects, default {} otherwise');
}

// ===== BUG opts-2: prefer is hard =====
{
  // hand-derived: X1 (P, Mon 08-10) X2 (Q, Tue 08-10); Y1 (R, Mon 08-10). Without a choice {X2,Y1} is a valid schedule.
  const X = course(g('X1', 'סופי-הרצאה', { lecturer: 'P', m: [[1, '08:00', '09:50']] }), g('X2', 'סופי-הרצאה', { lecturer: 'Q', m: [[2, '08:00', '09:50']] }));
  const Y = course(g('Y1', 'סופי-הרצאה', { lecturer: 'R', m: [[1, '08:00', '09:50']] }));
  const data = dataOf({ X, Y });
  const run = (lecturers) => search({ data, courses: [{ id: 'X', mode: 'must' }, { id: 'Y', mode: 'must' }], constraints: { lecturers, dayOff: [] }, weights: { progress: 1 }, topK: 5 });
  const base = run({}), pref = run({ P: 'prefer' }), avoid = run({ Q: 'avoid' });
  bug('opts-2', base.results.length === 1 && pref.results.length === 0,
    `synthetic: no choice -> ${base.results.length} plan (${base.results[0]?.groups}); "prefer P" -> ${pref.results.length} plans, diagnosis "${pref.diagnosis[0]}" (a soft preference should still return X2+Y1)`);
  check('opts-C83', avoid.results.length === 0, 'avoid is hard by design (the toast says "החיפוש לא ישבץ"), so avoid Q leaving no plan is consistent with its promise');
  const toast = fs.readFileSync(new URL('../../web/ui-actions.js', import.meta.url), 'utf8').split('\n');
  const tl = toast.findIndex((l) => l.includes('כשאפשר, החיפוש יבחר קבוצות של')) + 1;
  check('opts-C84', tl > 0, `the UI promises "when possible" for prefer: web/ui-actions.js:${tl}`);
}
{
  // real data: first (file, X, Y, L) in sorted order with X,Y in the same mandatory list, Y with a single option, prefer L's options all overlapping Y
  const all = loadAll().filter((f) => f.sem === '2027-1');
  let found = null, triples = 0;
  const lecOf = (c, o) => c.groups.find((x) => x.id === o.groups[0]).lecturer;
  for (const { file, data } of all) {
    if (found) break;
    const offered = Object.keys(data.courses).filter((id) => data.courses[id].offered);
    const opts = Object.fromEntries(offered.map((id) => [id, buildOptions(data.courses[id], {})]));
    for (const l of data.lists.filter((x) => /חובה/.test(x.name))) for (const X of l.courses) for (const Y of l.courses) {
      if (X === Y || !opts[X] || !opts[Y] || opts[Y].length !== 1 || opts[X].length < 2) continue;
      for (const L of new Set(opts[X].map((o) => lecOf(data.courses[X], o)))) {
        const mine = opts[X].filter((o) => lecOf(data.courses[X], o) === L), others = opts[X].filter((o) => lecOf(data.courses[X], o) !== L);
        const clash = (o) => o.mask.some((v, d) => (v & opts[Y][0].mask[d]) !== 0);
        if (mine.every(clash) && others.some((o) => !clash(o))) { triples++; found ??= { file, data, X, Y, L }; }
      }
    }
  }
  const { file, data, X, Y, L } = found;
  const run = (lecturers) => search({ data, courses: [{ id: X, mode: 'must' }, { id: Y, mode: 'must' }], constraints: { lecturers, dayOff: [], includeFull: false }, weights: { progress: 1 }, topK: 3 });
  const a = run({}), b = run({ [L]: 'prefer' });
  bug('opts-2b', a.results.length >= 1 && b.results.length === 0,
    `real data ${file}: courses ${X} "${data.courses[X].name}" + ${Y} "${data.courses[Y].name}" (both in one mandatory list): without a choice ${a.results.length} plan(s); after "prefer ${L}" 0 plans (diagnosis: ${b.diagnosis[0]})`);
  note(`first-found only; number of such (X,Y,lecturer) triples before the loop stopped: ${triples}`);
}

// ===== lecturer identity = raw string =====
{
  const all = loadAll().filter((f) => f.sem === '2027-1');
  const strings = new Map();   // person -> set of raw primary lecturer strings
  let coTaught = 0, prim = 0;
  const seen = new Set();
  for (const { data } of all) for (const [cid, c] of Object.entries(data.courses)) {
    if (seen.has(cid)) continue; seen.add(cid);
    for (const x of c.groups.filter((y) => y.primary)) {
      prim++; if (x.lecturer.includes(',')) coTaught++;
      for (const p of x.lecturer.split(',').map((s) => s.trim()).filter(Boolean)) (strings.get(p) ?? strings.set(p, new Set()).get(p)).add(x.lecturer);
    }
  }
  const multi = [...strings].filter(([, s]) => s.size > 1);
  check('opts-C85', multi.length > 0, `LIMITATION (2027-1 distinct courses): ${coTaught}/${prim} primary groups list several lecturers in one string; ${multi.length} persons occur under >1 raw string, e.g. ${JSON.stringify([...multi[0][1]])}`);
  // concrete: avoid 'ד"ר ערמון דגנית' does not touch the group taught by 'מר כהן תום, ד"ר ערמון דגנית'
  const target = 'ד"ר ערמון דגנית', pairStr = 'מר כהן תום, ד"ר ערמון דגנית';
  const hit = all.map((f) => f.data).flatMap((d) => Object.entries(d.courses)).find(([, c]) => c.groups.some((x) => x.primary && x.lecturer === pairStr));
  if (hit) {
    const [cid, c] = hit;
    const kept = buildOptions(c, { includeFull: true, lecturers: { [target]: 'avoid' } }).map((o) => c.groups.find((x) => x.id === o.groups[0]).lecturer);
    check('opts-C86', kept.includes(pairStr), `avoid "${target}" in course ${cid}: the group "${pairStr}" is still offered (exact-string match, solver-core.js:50)`);
  }
}

// ===== BUG opts-7: pin on a shared sub-group cancels avoid/prefer =====
{
  // lectures A (X) and B (Y) both link the same tutorial S (the structure of course 10013's lab 271001304, here with different lecturers)
  const c = course(g('A', 'סופי-הרצאה+תרגול', { lecturer: 'X', linked: ['S'], m: [[1, '08:00', '09:50']] }), g('B', 'סופי-הרצאה+תרגול', { lecturer: 'Y', linked: ['S'], m: [[2, '08:00', '09:50']] }), g('S', 'תרגול', { lecturer: 'Z', m: [[3, '08:00', '08:50']] }));
  const avoid = S(c, { lecturers: { X: 'avoid' }, pins: ['S'] }), pref = S(c, { lecturers: { X: 'prefer' }, pins: ['S'] });
  const expectedIfPinsFirst = { avoid: ['B+S'], pref: ['A+S'] };   // hand-derived: restrict to pin-compatible options {A+S,B+S} first, then apply avoid X / prefer X
  bug('opts-7', !eq(avoid, expectedIfPinsFirst.avoid) && !eq(pref, expectedIfPinsFirst.pref) && eq(avoid, ['A+S', 'B+S']) && eq(pref, ['A+S', 'B+S']),
    `pin S + avoid X -> ${avoid} (an avoided lecturer's lecture A is still offered); pin S + prefer X -> ${pref} (preference not applied); expected after "pins first": ${expectedIfPinsFirst.avoid} / ${expectedIfPinsFirst.pref}`);
  check('opts-C87', eq(S(c, { lecturers: { X: 'avoid' } }), ['B+S']), 'control: without the pin, avoid X -> B+S');
  const all = loadAll();
  let shared = 0; const seen = new Set();
  for (const { sem, data } of all) for (const [cid, cc] of Object.entries(data.courses)) {
    if (seen.has(sem + cid)) continue; seen.add(sem + cid);
    const parents = new Map();
    for (const x of cc.groups) for (const l of x.linked) (parents.get(l) ?? parents.set(l, []).get(l)).push(x);
    for (const ps of parents.values()) if (ps.length > 1 && new Set(ps.filter((p) => p.primary).map((p) => p.lecturer)).size > 1) shared++;
  }
  check('opts-C88', shared === 0, `real data: sub-groups linked from >1 primary with different lecturers: ${shared} (the only shared sub-group is lab 271001304 of 10013, linked from two TUTORIALS of the same lecturer) -> opts-7 is latent`);
}
finish();
