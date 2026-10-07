// rules-classify-ref.mjs
// WHAT: differential + metamorphic test of classify() against an independent reference, on (a) seeded random synthetic prerequisite
//   graphs (cycles, forward refs, null ids, mixed anyOf, both kinds) and (b) all 144 real data files with seeded random
//   passed / failed / Amirnet states. Also status precedence, anyOf semantics, kind semantics (קדם vs מקביל), failed-skips-prereq,
//   blockedBy / reasons content and the failure-warning thresholds.
// TARGETS: web/rules.js:61-126 (classify), web/rules.js:4-7 (ENGLISH/AMIRNET/amirnetExempt), web/rules.js:119-125 (warnings).
// REFERENCE: written from the meaning only (a set of "taken" course ids; a prerequisite group is a disjunction; the Amirnet exemption
//   comes from the official table 6.2.7.8, see rules-regulations.mjs), not copied from rules.js.
// RUN: node solver-audit/repro/rules-classify-ref.mjs        (about 2 s, deterministic: seeds 1..)
// OUTPUT: CHECK <id> PASS|FAIL lines; any FAIL = classify disagrees with the reference.
import { classify } from '../../web/rules.js';
import { mulberry32, ri, pick, shuffle, load, cohorts, SEMS, check, info, finish } from './rules-lib.mjs';

// ---------- independent reference ----------
const LEVELS = [[134, ['6000', '6001', '6002', '6003']], [120, ['6000', '6001', '6002']], [100, ['6000', '6001']], [85, ['6000']]]; // official table
const refExempt = (score) => { if (typeof score !== 'number' || !Number.isFinite(score)) return new Set(); for (const [min, ids] of LEVELS) if (score >= min) return new Set(ids); return new Set(); };
function ref(data, passed, failed, amirnet) {
  const P = new Set(passed), E = refExempt(amirnet), out = {};
  const taken = (id) => P.has(id) || E.has(id);
  // a prerequisite group holds if one alternative is a course the student has, or no alternative is checkable (all ids null = outside the program)
  const holds = (g) => g.anyOf.some((a) => a.id !== null && taken(a.id)) || g.anyOf.every((a) => a.id === null);
  for (const [id, c] of Object.entries(data.courses)) {
    if (P.has(id)) { out[id] = { s: 'done' }; continue; }
    if (E.has(id)) { out[id] = { s: 'exempt' }; continue; }
    if (!c.offered) { out[id] = { s: 'notOffered' }; continue; }
    const openPar = c.prereqs.filter((g) => g.kind === 'מקביל' && !holds(g));
    const firstIds = (gs) => gs.map((g) => g.anyOf.filter((a) => a.id !== null).map((a) => a.id));
    if (failed[id]) { out[id] = { s: 'retake', par: openPar.length ? firstIds(openPar) : undefined }; continue; }
    const openHard = c.prereqs.filter((g) => g.kind === 'קדם' && !holds(g));
    if (openHard.length) { out[id] = { s: 'blocked', by: firstIds(openHard).map((a) => a[0]) }; continue; }
    out[id] = openPar.length ? { s: 'conditional', par: firstIds(openPar) } : { s: 'available' };
  }
  return out;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function compare(data, state, label, bad) {
  const got = classify(data, state).statuses, want = ref(data, state.passed, state.failed ?? {}, state.profile?.amirnet);
  for (const id of Object.keys(data.courses)) {
    const g = got[id], w = want[id];
    const gp = g.missingParallel?.map((a) => [...a]), gb = g.blockedBy;
    if (g.status !== w.s || (w.par && !same(gp, w.par)) || (!w.par && g.missingParallel) || (w.by && !same(gb, w.by)) || (!w.by && g.blockedBy)) {
      if (bad.length < 3) bad.push(`${label} ${id}: got ${g.status}/${JSON.stringify(gp)}/${JSON.stringify(gb)} want ${JSON.stringify(w)}`);
      return false;
    }
  }
  return true;
}

// ---------- (a) synthetic graphs ----------
{
  const rnd = mulberry32(20261006); let n = 0, ok = 0; const bad = [], kinds = new Set();
  for (let t = 0; t < 4000; t++) {
    const N = 6 + ri(rnd, 8), ids = Array.from({ length: N }, (_, i) => String(100 + i));
    const courses = {};
    for (const id of ids) {
      const prereqs = Array.from({ length: ri(rnd, 4) }, () => ({ kind: rnd() < 0.3 ? 'מקביל' : 'קדם',
        anyOf: Array.from({ length: 1 + ri(rnd, 2) }, () => (rnd() < 0.25 ? { id: null, name: 'outside' } : { id: pick(rnd, ids), name: 'n' + ri(rnd, 99) })) }));
      courses[id] = { name: 'c' + id, credits: 3, offered: rnd() < 0.8, prereqs, groups: [] };
    }
    const data = { semester: 'א', courses };
    const passed = ids.filter(() => rnd() < 0.3), failed = {};
    for (const id of ids) if (rnd() < 0.15) failed[id] = 1 + ri(rnd, 3);
    const state = { passed, failed, profile: { amirnet: null } };
    n++; if (compare(data, state, `synthetic#${t}`, bad)) ok++;
    for (const s of Object.values(classify(data, state).statuses)) kinds.add(s.status);
  }
  check('rules-classify-ref-1', ok === n, `${ok}/${n} random graphs: status, blockedBy, missingParallel equal the reference; statuses seen: ${[...kinds].sort().join(',')}${bad.length ? ' | ' + bad.join(' | ') : ''}`);
}

// ---------- (b) all 144 real files ----------
{
  const rnd = mulberry32(7), scores = [null, 50, 84, 85, 99, 100, 119, 120, 133, 134, 150];
  let n = 0, ok = 0, files = 0; const bad = [], seen = {};
  for (const sem of SEMS) for (const c of cohorts()) {
    const data = load(sem, c.id, c.y); files++;
    const ids = Object.keys(data.courses);
    for (let r = 0; r < 4; r++) {
      const frac = rnd() * 0.9;
      const passed = ids.filter(() => rnd() < frac), failed = {};
      for (const id of ids) if (rnd() < 0.05) failed[id] = 1 + ri(rnd, 3);
      const state = { passed, failed, profile: { amirnet: pick(rnd, scores) } };
      n++; if (compare(data, state, `${sem}/${c.id}-${c.y}`, bad)) ok++;
      for (const s of Object.values(classify(data, state).statuses)) seen[s.status] = (seen[s.status] || 0) + 1;
    }
  }
  check('rules-classify-ref-2', ok === n && files === 144, `${files} files x 4 random states = ${ok}/${n} equal the reference; status histogram ${JSON.stringify(seen)}${bad.length ? ' | ' + bad.join(' | ') : ''}`);
}

// ---------- precedence and small hand cases (rules.js:76-98) ----------
{
  const mk = (o) => ({ name: o.name ?? 'x', credits: 3, offered: o.offered ?? true, prereqs: o.prereqs ?? [], groups: [] });
  const A = { kind: 'קדם', anyOf: [{ id: 'P', name: 'P' }] };
  const data = { semester: 'א', courses: { P: mk({ name: 'P' }), X: mk({ name: 'X', prereqs: [A] }), N: mk({ offered: false }), Q: mk({ prereqs: [{ kind: 'מקביל', anyOf: [{ id: 'P', name: 'P' }] }] }) } };
  const st = (state) => Object.fromEntries(Object.entries(classify(data, { failed: {}, ...state }).statuses).map(([k, v]) => [k, v.status]));
  const a = st({ passed: [] }), b = st({ passed: ['P'] }), c = st({ passed: ['N', 'X'], failed: { N: 1, X: 1 } }), d = st({ passed: [], failed: { X: 1 } });
  check('rules-classify-ref-3', a.X === 'blocked' && a.Q === 'conditional' && a.N === 'notOffered' && b.X === 'available' && b.Q === 'available' && b.P === 'done',
    `blocked/conditional/notOffered/available/done: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  check('rules-classify-ref-4', c.N === 'done' && c.X === 'done', `done outranks failed and notOffered: ${JSON.stringify(c)}`);
  check('rules-classify-ref-5', d.X === 'retake', `failed course whose קדם is unmet is 'retake' (prerequisite check skipped, rules.js:79-83): ${JSON.stringify(d)}`);
  // not offered outranks failed (rules.js:78 before :79)
  const e = st({ passed: [], failed: { N: 1 } });
  check('rules-classify-ref-6', e.N === 'notOffered', `notOffered outranks retake: ${JSON.stringify(e)}`);
  // exempt outranks notOffered (6000 is notOffered in the data, exempt by score)
  const d0 = load('2027-1', 30, 2026), cl = classify(d0, { passed: [], failed: {}, profile: { amirnet: 100 } }).statuses;
  check('rules-classify-ref-7', cl['6000'].status === 'exempt' && cl['6001'].status === 'exempt' && cl['6002'].status === 'available' && cl['6003'].status === 'blocked',
    `30-2026 A, Amirnet 100: 6000..6003 = ${['6000', '6001', '6002', '6003'].map((i) => cl[i].status).join(',')}`);
}

// ---------- metamorphic: marking a course passed never makes another course worse (real data, seeded) ----------
{
  const rnd = mulberry32(99), rank = { blocked: 0, conditional: 1, available: 2 };
  let tests = 0, viol = 0, first = '';
  for (const c of cohorts()) {
    const data = load('2027-1', c.id, c.y), ids = Object.keys(data.courses);
    for (let r = 0; r < 10; r++) {
      const passed = ids.filter(() => rnd() < 0.3), x = pick(rnd, ids);
      const s0 = classify(data, { passed, failed: {}, profile: {} }).statuses, s1 = classify(data, { passed: [...passed, x], failed: {}, profile: {} }).statuses;
      for (const id of ids) {
        if (id === x || !(s0[id].status in rank)) continue;
        tests++;
        if (!(s1[id].status in rank) || rank[s1[id].status] < rank[s0[id].status]) { viol++; first ||= `${c.id}-${c.y} ${x}->${id} ${s0[id].status}->${s1[id].status}`; }
      }
    }
  }
  check('rules-classify-ref-8', viol === 0, `monotone: ${tests} (course,added-pass) pairs, ${viol} violations ${first}`);
}

// ---------- blockedBy / reasons content (rules.js:84-87, 101-117) ----------
{
  const rnd = mulberry32(5); let blocked = 0, bad = 0, first = '';
  for (const c of cohorts()) {
    const data = load('2027-1', c.id, c.y), ids = Object.keys(data.courses);
    const passed = ids.filter(() => rnd() < 0.25), P = new Set(passed);
    const got = classify(data, { passed, failed: {}, profile: { amirnet: 90 } }).statuses;
    for (const id of ids) {
      if (got[id].status !== 'blocked') continue; blocked++;
      const c0 = data.courses[id];
      const open = c0.prereqs.filter((g) => g.kind === 'קדם' && !(g.anyOf.some((a) => a.id !== null && (P.has(a.id) || ['6000'].includes(a.id))) || g.anyOf.every((a) => a.id === null)));
      const names = open.map((g) => data.courses[g.anyOf.find((a) => a.id !== null).id].name);
      const text = got[id].reasons.join('\n');
      if (!open.length || !names.every((nm) => text.includes(nm)) || got[id].blockedBy.length !== open.length || !got[id].reasons.every((r) => r.startsWith('חסום: דורש '))) { bad++; first ||= `${c.id}-${c.y} ${id}`; }
    }
  }
  check('rules-classify-ref-9', blocked > 500 && bad === 0, `${blocked} blocked courses: each reason line names the first checkable alternative of every open קדם group and blockedBy has one entry per group; ${bad} mismatches ${first}`);
}

// ---------- failure warnings: thresholds as coded (rules.js:119-124); regulation reading is in rules-regulations.mjs ----------
{
  const data = { semester: 'א', courses: {} };
  const w = (failed) => classify(data, { passed: [], failed, profile: {} }).warnings;
  const tag = (a) => a.map((s) => (s.includes('11.5.2') ? 'E52' : s.includes('11.5.1') ? 'E51' : s.includes('11.4.1') ? 'P41' : '?')).join('+') || '-';
  const table = [[{}, '-'], [{ a: 1 }, '-'], [{ a: 1, b: 1 }, '-'], [{ a: 1, b: 1, c: 1 }, 'P41'], [{ a: 1, b: 1, c: 1, d: 1 }, 'E51'], [{ a: 3 }, 'E52'], [{ a: 2, b: 1 }, 'P41'], [{ a: 2, b: 2 }, 'E51'], [{ a: 3, b: 1 }, 'E52+E51']];
  const rows = table.map(([f, want]) => [JSON.stringify(f), tag(w(f)), want]);
  check('rules-classify-ref-10', rows.every(([, g, want]) => g === want), rows.map(([f, g, want]) => `${f}=>${g}${g === want ? '' : '(want ' + want + ')'}`).join(' '));
}
info('seeded; no wall-clock dependence');
finish();
