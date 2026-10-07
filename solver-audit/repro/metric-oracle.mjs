// metric-oracle.mjs - PREFIX metric. Does each number in search().results[i].breakdown measure what its UI label says?
// Method: enumerate EVERY plan of seeded random mini-datasets (search with weights {}, prune:false, huge topK: breakdown holds all six
// metrics whatever the weights) and recompute friends, progress, freeDays, compact, timeWindow, examSpread for each plan from the
// raw meetings in REAL MINUTES with an independent oracle. Then the same on real data files with UI-default settings.
//
// Targets: web/solver-core.js:171-220 (metrics), 184 (value), 185 (freeDays over [1..5]), 187-195 (compact), 197-200 (timeWindow),
//          202-207+216 (examSpread), 265-273 (prefMask), 26-31 (lateMask), 11-20 (meetingsMask).
// Run:     node solver-audit/repro/metric-oracle.mjs        (any cwd, ~10-20 s, seeded, no network)
// Output:  CHECK <id> PASS|FAIL / BUG <id> REPRODUCED|NOT-REPRODUCED. exit 0 iff all CHECK PASS and all BUG REPRODUCED.
// What it proves: friends, progress, freeDays (as Sun-Thu share), examSpread and - when times sit on the 30-minute grid - compact and
//   timeWindow are exactly the intended formulas; with real Afeka times (:00 start, :50 end) or off-grid times compact and timeWindow
//   deviate from real minutes by a measured, bounded amount (the "ponytail" slot granularity of web/solver-core.js:187).
import { search } from '../../web/solver-core.js';
import { DEFAULT } from '../../web/app.js';
import fs from 'node:fs';

let bad = 0;
const check = (id, ok, d) => { console.log(`CHECK ${id} ${ok ? 'PASS' : 'FAIL'} ${d}`); if (!ok) bad++; };
const bug = (id, rep, d) => { console.log(`BUG ${id} ${rep ? 'REPRODUCED' : 'NOT-REPRODUCED'} ${d}`); if (!rep) bad++; };
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const tm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

// ---- oracle (minutes, sets, plain enumeration) --------------------------------------------------------------------------------
function graphValue(data) { // value = credits + #courses reachable below + 2 * longest chain below (docs say so; the oracle re-derives it)
  const dep = {}; // prerequisite -> dependents
  for (const [id, c] of Object.entries(data.courses)) for (const p of c.prereqs) if (p.kind === 'קדם') for (const a of p.anyOf) if (a.id && a.id !== id) (dep[a.id] ??= []).push(id); // self-references are a data error (see metric-selfloop-source.mjs), not a prerequisite
  const reach = (id, seen = new Set()) => { for (const x of dep[id] ?? []) if (!seen.has(x)) { seen.add(x); reach(x, seen); } return seen; };
  const depth = (id) => Math.max(-1, ...(dep[id] ?? []).map(depth)) + 1; // synthetic graphs are acyclic by construction
  return Object.fromEntries(Object.entries(data.courses).map(([id, c]) => [id, c.credits + reach(id).size + 2 * depth(id)]));
}
function oracle(plan, data, ctx) {
  const byId = new Map(Object.values(data.courses).flatMap((c) => c.groups.map((g) => [g.id, g])));
  const groups = plan.groups.map((id) => byId.get(id));
  const meetings = groups.flatMap((g) => g.meetings.map((m) => ({ day: m.day, a: tm(m.start), b: tm(m.end), gid: g.id })));
  const total = meetings.reduce((s, m) => s + (m.b - m.a), 0) || 1;
  let fs_ = 0, fw = 0;
  for (const f of ctx.friends.filter((x) => x.active !== false)) {
    const sh = meetings.filter((m) => f.groups.includes(m.gid)).reduce((s, m) => s + (m.b - m.a), 0);
    fs_ += f.weight * sh / total; fw += f.weight;
  }
  const friends = fw ? fs_ / fw : 0;
  const progress = plan.courses.reduce((s, id) => s + ctx.value[id], 0) / ctx.maxValue;
  const busyDays = new Set(meetings.map((m) => m.day));
  // 2026-10-07 (D1, issue #7): Sunday..Thursday plus the wished days off; still out of 5 (a plan always has a lesson on one of them)
  const freeDays = [1, 2, 3, 4, 5, 6].filter((d) => (d <= 5 || ctx.constraints.dayOff?.includes(d)) && !busyDays.has(d)).length / 5;
  const perDay = (d) => meetings.filter((m) => m.day === d).map((m) => [m.a, m.b]).sort((x, y) => x[0] - y[0]);
  let gap = 0, outside = 0;
  const nb = ctx.constraints.notBefore ? tm(ctx.constraints.notBefore) : null, na = ctx.constraints.notAfter ? tm(ctx.constraints.notAfter) : null;
  for (let d = 1; d <= 6; d++) {
    const iv = perDay(d); if (!iv.length) continue;
    const merged = []; for (const [a, b] of iv) { if (merged.length && a <= merged.at(-1)[1]) merged.at(-1)[1] = Math.max(merged.at(-1)[1], b); else merged.push([a, b]); }
    for (let i = 1; i < merged.length; i++) gap += merged[i][0] - merged[i - 1][1];
    for (const [a, b] of merged) {
      if (ctx.constraints.dayOff?.includes(d)) { outside += b - a; continue; }
      if (nb !== null) outside += Math.max(0, Math.min(b, nb) - a);
      if (na !== null) outside += Math.max(0, b - Math.max(a, na));
    }
  }
  let examSpread = 0;
  if (data.examsPublished) {
    const dates = groups.filter((g) => g.primary).flatMap((g) => g.exams.filter((e) => e.kind === 'בחינה' && e.moed === 1).map((e) => e.date)).sort();
    let g0 = null; for (let i = 1; i < dates.length; i++) { const x = Math.round((Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 864e5); g0 = g0 === null ? x : Math.min(g0, x); }
    examSpread = g0 === null ? 1 : Math.min(g0, 7) / 7;
  }
  return { friends, progress, freeDays, compact: 1 - Math.min(gap / 600, 1), timeWindow: 1 - Math.min(outside / 600, 1), examSpread, gap, outside };
}

// ---- seeded random mini data ---------------------------------------------------------------------------------------------------
function gen(rnd, mode, examsPublished) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const nC = 3 + Math.floor(rnd() * 2), courses = {}, ids = [];
  const slot = () => { // one meeting time
    const day = 1 + Math.floor(rnd() * 6);
    if (mode === 'aligned') { const a = 8 * 60 + 30 * Math.floor(rnd() * 16), len = 60 + 30 * Math.floor(rnd() * 4); return { day, a, b: a + len }; }
    if (mode === 'afeka') { const a = (8 + Math.floor(rnd() * 12)) * 60, len = 60 * (1 + Math.floor(rnd() * 3)) - 10; return { day, a, b: a + len }; }
    const a = 8 * 60 + Math.floor(rnd() * 600), len = 45 + Math.floor(rnd() * 120); return { day, a, b: Math.min(a + len, 22 * 60 + 50) };
  };
  const mt = (s, room = 'r') => ({ day: s.day, start: hm(s.a), end: hm(s.b), room });
  let gcount = 0;
  for (let i = 0; i < nC; i++) {
    const id = `C${i}`; ids.push(id);
    const groups = [], nP = 2 + Math.floor(rnd() * 2);
    for (let p = 0; p < nP; p++) {
      const gid = `${id}g${gcount++}`, s1 = slot(), linked = [];
      const exam = examsPublished ? [{ kind: 'בחינה', moed: 1, date: `2027-02-${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}`, time: '09:00' }] : [];
      const meetings = [mt(s1)];
      const nT = Math.floor(rnd() * 3); // 0..2 linked tutorials, one is chosen per option
      for (let t = 0; t < nT; t++) {
        const tid = `${gid}/${t + 1}`; let s2 = slot(); while (s2.day === s1.day) s2 = slot(); // different day: an option never overlaps itself
        groups.push({ id: tid, type: 'תרגול', primary: false, lecturer: 'T', full: false, semester: 'א', linked: [], meetings: [mt(s2)], exams: [] }); linked.push(tid);
      }
      groups.unshift({ id: gid, type: 'סופי-הרצאה', primary: true, lecturer: `L${p}`, full: false, semester: 'א', linked, meetings, exams: exam });
    }
    const prereqs = []; for (let j = 0; j < i; j++) if (rnd() < 0.35) prereqs.push({ kind: 'קדם', anyOf: [{ id: `C${j}`, name: `C${j}` }] });
    courses[id] = { name: id, credits: pick([0, 0.5, 2, 3, 4.5]), offered: true, prereqs, groups };
  }
  const allG = Object.values(courses).flatMap((c) => c.groups.map((g) => g.id));
  const friends = Array.from({ length: Math.floor(rnd() * 3) }, (_, k) => ({ name: `F${k}`, weight: pick([0, 1, 2, 3]), active: rnd() < 0.8,
    groups: allG.filter(() => rnd() < 0.3) }));
  const dayOff = [1, 2, 3, 4, 5, 6].filter(() => rnd() < 0.15);
  const constraints = { dayOff, dayOffHard: false, notBefore: pick(['', '', '09:00', '10:30']), notAfter: pick(['', '', '18:00', '19:30']), windowHard: false, examsSameDay: 'allow' };
  const data = { year: 2027, semester: 'א', examsPublished, lists: [], courses };
  const modes = ids.map((id, i) => ({ id, mode: i < 2 ? (rnd() < 0.5 ? 'must' : 'optional') : 'optional' }));
  const bias = {}; if (rnd() < 0.5) for (const id of ids) if (rnd() < 0.5) bias[id] = (rnd() < 0.5 ? 1 : -1) * courses[id].credits;
  return { data, modes, friends, constraints, bias };
}

function runMode(mode, examsPublished, seed, n) {
  const rnd = mulberry32(seed), st = { plans: 0, files: 0, maxDiff: { friends: 0, progress: 0, freeDays: 0, compact: 0, timeWindow: 0, examSpread: 0 },
    cGap: [], cOut: [], dCompact: 0, dWindow: 0, gapSigned: { under: 0, over: 0 }, outSigned: { under: 0, over: 0 } };
  for (let k = 0; k < n; k++) {
    const { data, modes, friends, constraints, bias } = gen(rnd, mode, examsPublished);
    const value = graphValue(data); let maxValue = 0;
    for (const { id } of modes) { value[id] += bias[id] ?? 0; maxValue += Math.max(0, value[id]); }
    const r = search({ data, courses: modes, statuses: {}, constraints, weights: {}, friends, topK: 1e9, timeLimitMs: 30000, prune: false, bias });
    if (r.partial) throw new Error('enumeration timed out');
    st.files++;
    for (const plan of r.results) {
      st.plans++;
      const o = oracle(plan, data, { friends, constraints, value, maxValue: maxValue || 1 });
      for (const key of Object.keys(st.maxDiff)) st.maxDiff[key] = Math.max(st.maxDiff[key], Math.abs(plan.breakdown[key] - o[key]));
      if (Math.abs(plan.breakdown.compact - o.compact) > 1e-9) { st.dCompact++; const solverGap = (1 - plan.breakdown.compact) * 600; st.cGap.push(solverGap - o.gap); (solverGap < o.gap ? st.gapSigned.under++ : st.gapSigned.over++); }
      if (Math.abs(plan.breakdown.timeWindow - o.timeWindow) > 1e-9) { st.dWindow++; const so = (1 - plan.breakdown.timeWindow) * 600; st.cOut.push(so - o.outside); (so < o.outside ? st.outSigned.under++ : st.outSigned.over++); }
    }
  }
  return st;
}
const fmt = (a) => (a.length ? `min ${Math.min(...a).toFixed(1)} / max ${Math.max(...a).toFixed(1)} minutes` : 'none');

// ---- 1. slot-aligned times: every metric must equal its definition exactly --------------------------------------------------------
{
  const s = runMode('aligned', true, 1001, 60);
  const exact = (k) => s.maxDiff[k] < 1e-9;
  for (const k of ['friends', 'progress', 'freeDays', 'compact', 'timeWindow', 'examSpread']) {
    check(`oracle-${k}-aligned`, exact(k), `${s.plans} plans of ${s.files} random datasets (times on the 30-min grid, 3-4 courses, 0-2 friends, bias on/off, exams published): max |solver - oracle| = ${s.maxDiff[k].toExponential(2)}`);
  }
}
// ---- 2. no exams published (every real file): examSpread must be the constant 0 -----------------------------------------------------
{
  const s = runMode('aligned', false, 1002, 20);
  check('oracle-examSpread-unpublished', s.maxDiff.examSpread === 0, `${s.plans} plans with examsPublished=false: examSpread is 0 in every plan (the oracle says 0 too)`);
}
// ---- 3. real Afeka shape (start :00, end :50): the slot grid rounds an end up to the next :00 ----------------------------------------
{
  const s = runMode('afeka', true, 1003, 60);
  check('oracle-others-afeka', ['friends', 'progress', 'freeDays', 'examSpread'].every((k) => s.maxDiff[k] < 1e-9), `with real-shaped times friends/progress/freeDays/examSpread still match exactly over ${s.plans} plans`);
  bug('metric-compact-slot', s.dCompact > 0 && s.gapSigned.over === 0, `compact differs from real minutes in ${s.dCompact}/${s.plans} plans; solver gap - real gap: ${fmt(s.cGap)}; the solver NEVER reports more than the real gap (under-measured: ${s.gapSigned.under}, over-measured: ${s.gapSigned.over}) because a lesson ending at :50 occupies its slot until :00`);
  bug('metric-timewindow-slot', s.dWindow > 0 && s.outSigned.under === 0, `timeWindow differs from real minutes in ${s.dWindow}/${s.plans} plans; solver outside - real outside: ${fmt(s.cOut)}; never less than real (over-measured: ${s.outSigned.over}, under-measured: ${s.outSigned.under}) because the slot count rounds the lesson end up`);
}
// ---- 4. off-grid times: the error is bounded by the 30-minute slot -----------------------------------------------------------------
{
  const s = runMode('offgrid', true, 1004, 60);
  const gapErr = Math.max(...s.cGap.map(Math.abs), 0), outErr = Math.max(...s.cOut.map(Math.abs), 0);
  bug('metric-slot-offgrid', s.dCompact + s.dWindow > 0, `arbitrary-minute times: compact differs in ${s.dCompact}/${s.plans} plans (|gap error| up to ${gapErr.toFixed(0)} min), timeWindow in ${s.dWindow}/${s.plans} (|outside error| up to ${outErr.toFixed(0)} min)`);
  check('oracle-offgrid-others', ['friends', 'progress', 'freeDays', 'examSpread'].every((k) => s.maxDiff[k] < 1e-9), 'friends/progress/freeDays/examSpread do not depend on the grid: exact for off-grid times too');
}

// ---- 5. real data, UI default settings -----------------------------------------------------------------------------------------------
{
  const ROOT = new URL('../../web/data/afeka/2027-1/', import.meta.url);
  const rnd = mulberry32(42);
  let plans = 0, dC = 0, dW = 0, worstC = 0, worstW = 0; const other = { friends: 0, progress: 0, freeDays: 0, examSpread: 0 }; let signsOk = true;
  for (const f of ['30-2026', '10-2026', '12-2026', '40-2026', '20-2026', '11-2026']) {
    const data = JSON.parse(fs.readFileSync(new URL(`${f}.json`, ROOT), 'utf8'));
    const y1 = data.lists.find((l) => l.name.includes("שנה א'"))?.courses ?? [];
    const cand = y1.filter((id) => data.courses[id]?.offered && !data.courses[id].prereqs.some((p) => p.kind === 'קדם' && p.anyOf.some((a) => a.id))).slice(0, 7);
    const modes = cand.map((id, i) => ({ id, mode: i < 3 ? 'must' : 'optional' }));
    const allG = cand.flatMap((id) => data.courses[id].groups.map((g) => g.id));
    const friends = [{ name: 'Dana', weight: 3, active: true, groups: allG.filter(() => rnd() < 0.4) }, { name: 'Ron', weight: 1, active: true, groups: allG.filter(() => rnd() < 0.4) }];
    const constraints = { ...structuredClone(DEFAULT.constraints), examsSameDay: 'allow' }, weights = structuredClone(DEFAULT.weights);
    const value = graphValue(data); let maxValue = 0; for (const { id } of modes) maxValue += Math.max(0, value[id]);
    const r = search({ data, courses: modes, statuses: {}, constraints, weights, friends, topK: 60, timeLimitMs: 8000 });
    for (const plan of r.results) {
      plans++;
      const o = oracle(plan, data, { friends, constraints, value, maxValue });
      for (const k of Object.keys(other)) other[k] = Math.max(other[k], Math.abs(plan.breakdown[k] - o[k]));
      const solverGap = (1 - plan.breakdown.compact) * 600, so = (1 - plan.breakdown.timeWindow) * 600;
      if (Math.abs(plan.breakdown.compact - o.compact) > 1e-9) { dC++; worstC = Math.max(worstC, Math.abs(solverGap - o.gap)); if (solverGap > o.gap) signsOk = false; }
      if (Math.abs(plan.breakdown.timeWindow - o.timeWindow) > 1e-9) { dW++; worstW = Math.max(worstW, Math.abs(so - o.outside)); if (so < o.outside) signsOk = false; }
    }
  }
  check('oracle-real-others', Object.values(other).every((v) => v < 1e-9), `${plans} real-data plans (6 files, UI default weights/constraints, 2 friends): friends/progress/freeDays/examSpread match the oracle (max diff ${Math.max(...Object.values(other)).toExponential(1)})`);
  console.log(`  real data: compact differs in ${dC}/${plans} plans (max ${worstC.toFixed(0)} min of gap), timeWindow in ${dW}/${plans} (max ${worstW.toFixed(0)} min); direction as predicted (gap under-measured, outside over-measured): ${signsOk}`);
  check('oracle-real-slot', signsOk && worstC <= 120 && worstW <= 120, 'on real data the grid error never goes the other way and stays within 10 minutes per gap / lesson (max values above, a handful of lessons per plan)');
}
process.exitCode = bad ? 1 : 0;
