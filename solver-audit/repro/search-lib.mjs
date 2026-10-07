// search-lib.mjs - shared helpers for the search-* audit scripts (NOT a test; never run on its own).
// Contents: seeded PRNG, a random synthetic-instance generator for web/solver-core.js search(), and an INDEPENDENT
// exhaustive reference solver written from the meaning of the problem (minutes, slot sets, plain enumeration).
// Nothing here imports solver code except where a script imports it itself.
//
// Meaning used by the reference (derived from reading web/solver-core.js:4-22,247-373, restated in plain terms):
//   * the week is 7 day-rows (1..6 = Sun..Fri), each a set of 30-minute slots; slot s covers [07:00+30s, 07:00+30(s+1)).
//   * a meeting occupies slots floor((start-07:00)/30) .. ceil((end-07:00)/30)-1.
//   * hard constraints: no slot of two chosen options coincide; slots of busy blocks / hard day-off / hard windows are forbidden;
//     sum of credits <= maxCredits (when a cap is set); days used (days 1..6 with a slot) <= maxDays; no two chosen
//     options with the same moed-1 'בחינה' date when exams are published and examsSameDay != 'allow'; a course whose status
//     has missingParallel needs, for every requirement, one of its alternatives chosen as well; the selection is non-empty.
//   * a must course must be chosen, an optional one may be skipped; a pinned group forces its course (must) and its option.
//   * score = sum_k weight_k * metric_k, metrics as in the comments of metricsRef() below.

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const mm = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const ri = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive

// ---------- slot sets (independent of the solver's bitmasks) ----------
export const slotKey = (d, s) => d * 32 + s;
export function meetingSlots(m) {
  const a = Math.floor((mm(m.start) - 420) / 30), b = Math.ceil((mm(m.end) - 420) / 30), out = [];
  for (let s = Math.max(0, a); s < Math.min(32, b); s++) out.push(slotKey(m.day, s));
  return out;
}
// forbidden / preferred-outside slot sets from constraints
export function forbiddenSlots(c) {
  const out = new Set();
  for (const b of c.blocks ?? []) for (const k of meetingSlots(b)) out.add(k);
  for (let d = 1; d <= 6; d++) for (let s = 0; s < 32; s++) {
    const st = 420 + 30 * s;
    if (c.dayOffHard && (c.dayOff ?? []).includes(d)) out.add(slotKey(d, s));
    if (c.windowHard && c.notBefore && st < mm(c.notBefore)) out.add(slotKey(d, s));
    if (c.windowHard && c.notAfter && st >= mm(c.notAfter)) out.add(slotKey(d, s));
  }
  return out;
}
export function preferOutsideSlots(c) {
  const out = new Set();
  for (let d = 1; d <= 6; d++) for (let s = 0; s < 32; s++) {
    const st = 420 + 30 * s;
    if ((c.dayOff ?? []).includes(d)) out.add(slotKey(d, s));
    if (c.notBefore && st < mm(c.notBefore)) out.add(slotKey(d, s));
    if (c.notAfter && st >= mm(c.notAfter)) out.add(slotKey(d, s));
  }
  return out;
}

// ---------- independent course-value (credits + 1*downstream + 2*chainDepth), only 'קדם' links count ----------
export function valuesRef(data) {
  const ids = Object.keys(data.courses), dep = {};
  for (const id of ids) dep[id] = [];
  for (const id of ids) for (const p of data.courses[id].prereqs) if (p.kind === 'קדם') for (const a of p.anyOf) if (a.id && dep[a.id] && a.id !== id) dep[a.id].push(id); // meaning: a course is not 'downstream of itself' (real data has 5 self-prerequisites, see search-selfloop-prereq.mjs)
  const closure = (id, seen = new Set()) => { for (const x of dep[id]) if (!seen.has(x)) { seen.add(x); closure(x, seen); } return seen; };
  const memo = {};
  const depth = (id) => (id in memo ? memo[id] : (memo[id] = dep[id].length ? 1 + Math.max(...dep[id].map(depth)) : 0));
  const v = {};
  for (const id of ids) v[id] = data.courses[id].credits + closure(id).size + 2 * depth(id);
  return v;
}

// ---------- random synthetic instance ----------
// opts: { nCourses, maxOpts, evening, withExams, ... } all optional. Every group has a distinct lecturer so buildOptions never merges
// two groups into one option; no linked groups, so the options of a course are exactly its primary groups.
export function genInstance(rng, o = {}) {
  const nC = o.nCourses ?? ri(rng, 3, 8);
  const examsPublished = o.examsPublished ?? rng() < 0.5;
  const evening = o.evening ?? rng() < 0.2;
  const dayPool = o.days ?? [1, 2, 3, 4, 5, 6].slice(0, ri(rng, 3, 6));
  const examPool = ['2027-02-01', '2027-02-02', '2027-02-03', '2027-02-05', '2027-02-08', '2027-02-09', '2027-02-14', '2027-02-20'];
  const courses = {}, ids = [];
  let gcount = 0;
  // o.malformed=true restores the first generator version, which could emit meetings like 23:00-22:50 (end before start): see search-negative-duration.mjs.
  const startH = evening ? 16 : 8, spanH = evening ? (o.malformed ? 7 : 5) : 6; // evening: starts 16..21, every lesson ends by 22:50 and lasts >= 50 min
  for (let c = 0; c < nC; c++) {
    const id = `C${c}`; ids.push(id);
    const prereqs = [];
    if (c > 0 && rng() < 0.5) prereqs.push({ kind: 'קדם', anyOf: [{ id: `C${ri(rng, 0, c - 1)}`, name: 'x' }] });
    if (c > 1 && rng() < 0.2) prereqs.push({ kind: 'קדם', anyOf: [{ id: `C${ri(rng, 0, c - 1)}`, name: 'x' }, { id: `C${ri(rng, 0, c - 1)}`, name: 'y' }] });
    if (c > 0 && rng() < 0.15) prereqs.push({ kind: 'מקביל', anyOf: [{ id: `C${ri(rng, 0, c - 1)}`, name: 'p' }] }); // parallel links never feed value
    const nOpt = ri(rng, 1, o.maxOpts ?? 5), groups = [];
    for (let g = 0; g < nOpt; g++) {
      const nm = ri(rng, 1, 2), meetings = [], used = new Set();
      for (let k = 0; k < nm; k++) {
        const day = pick(rng, dayPool), h = startH + ri(rng, 0, spanH), len = o.malformed ? ri(rng, 1, 3) : Math.min(ri(rng, 1, 3), 23 - h);
        if (used.has(`${day}:${h}`)) continue;
        used.add(`${day}:${h}`);
        const endMin = h * 60 + (rng() < 0.7 ? len * 60 - 10 : len * 60 - (rng() < 0.5 ? 30 : 0)); // :50 ends mostly, some :30 / :00
        meetings.push({ day, start: hhmm(h * 60), end: hhmm(Math.min(endMin, 22 * 60 + 50)), room: 'r' });
      }
      const exams = [];
      if (examsPublished) {
        exams.push({ kind: 'בחינה', moed: 1, date: pick(rng, examPool), time: null });
        if (rng() < 0.3) exams.push({ kind: 'בחינה', moed: 2, date: pick(rng, examPool), time: null }); // decoys: must be ignored
        if (rng() < 0.3) exams.push({ kind: 'בוחן אמצע', moed: 1, date: pick(rng, examPool), time: null });
      }
      groups.push({ id: `G${gcount++}`, type: 'הרצאה', primary: true, lecturer: `L${gcount}`, full: rng() < 0.15, semester: 'א', linked: [], meetings, exams });
    }
    courses[id] = { name: `course ${c}`, credits: pick(rng, [0, 0.5, 1, 2, 2, 3, 3, 4, 5]), offered: true, prereqs, groups };
  }
  const data = { semester: 'א', year: 2027, startYear: 2026, examsPublished, courses };
  const allGroupIds = ids.flatMap((id) => courses[id].groups.map((g) => g.id));
  const mode = () => (rng() < 0.4 ? 'must' : 'optional');
  const courseList = ids.map((id) => ({ id, mode: o.allOptional ? 'optional' : mode() }));
  const statuses = {};
  for (const id of ids) if (rng() < (o.parallelRate ?? 0.15)) {
    const nreq = ri(rng, 1, 2), needs = [];
    for (let r = 0; r < nreq; r++) needs.push(Array.from({ length: ri(rng, 1, 2) }, () => pick(rng, rng() < 0.9 ? ids : ['ZZ'])).filter((x) => x !== id));
    const clean = needs.filter((n) => n.length);
    if (clean.length) statuses[id] = { status: 'conditional', reasons: [], missingParallel: clean };
  }
  const pins = [];
  if (rng() < (o.pinRate ?? 0.15)) pins.push(pick(rng, allGroupIds));
  const friends = [];
  const nF = rng() < 0.4 ? ri(rng, 1, 2) : 0;
  for (let f = 0; f < nF; f++) friends.push({ name: `F${f}`, groups: allGroupIds.filter(() => rng() < 0.35), weight: pick(rng, [0, 1, 2, 3]), active: rng() < 0.85 });
  const constraints = {
    dayOff: rng() < 0.5 ? [pick(rng, [1, 2, 3, 4, 5, 6])] : [], dayOffHard: rng() < 0.15,
    notBefore: rng() < 0.3 ? hhmm(pick(rng, [8, 9, 10]) * 60 + pick(rng, [0, 30])) : '', notAfter: rng() < 0.4 ? hhmm(pick(rng, [14, 17, 18, 19, 20]) * 60 + pick(rng, [0, 30])) : '',
    windowHard: rng() < 0.2, maxCredits: rng() < 0.3 ? pick(rng, [2, 3.5, 5, 7, 10]) : null, maxDays: rng() < 0.3 ? ri(rng, 1, 4) : null,
    examsSameDay: rng() < 0.5 ? 'forbid' : 'allow', includeFull: rng() < 0.4, blocks: [], lecturers: {},
  };
  if (rng() < 0.25) { const h = ri(rng, 8, 14); constraints.blocks.push({ day: pick(rng, dayPool), start: hhmm(h * 60 + pick(rng, [0, 30])), end: hhmm((h + ri(rng, 1, 3)) * 60), label: 'b' }); }
  const weights = rng() < 0.05 ? { friends: 0, progress: 0, freeDays: 0, compact: 0, timeWindow: 0, examSpread: 0 }
    : Object.fromEntries(['friends', 'progress', 'freeDays', 'compact', 'timeWindow', 'examSpread'].map((k) => [k, pick(rng, [0, 1, 3, 5])]));
  const bias = {};
  if (rng() < 0.3) for (const id of ids) if (rng() < 0.5) bias[id] = ri(rng, -Math.floor(courses[id].credits), 3);
  return { data, courses: courseList, statuses, pins, constraints, weights, friends, bias, topK: pick(rng, [1, 2, 3, 5, 10]) };
}

// ---------- the independent exhaustive reference ----------
const METRIC_KEYS = ['friends', 'progress', 'freeDays', 'compact', 'timeWindow', 'examSpread'];
// 2026-10-07 (stage 4, issue #4): search() tests busy time and time limits in real minutes, so the reference does too (the compact gap stays in slots).
// The slot reference below is kept for the record.
import { referenceMinutes } from '../plan-probes/precision-ref.mjs';
export const referenceSolve = (inst, o = {}) => referenceMinutes(inst, { ...o, gap: 'slot', f18: 'group' });
export function referenceSlotSolve(inst, { cap = 4_000_000 } = {}) {
  const { data, statuses = {}, pins = [], constraints: c = {}, weights = {}, bias = {} } = inst;
  const friends = (inst.friends ?? []).filter((f) => f.active !== false);
  const val = valuesRef(data);
  const value = {}; let maxValue = 0;
  const forbid = forbiddenSlots(c), prefer = preferOutsideSlots(c);
  const noExamClash = data.examsPublished && c.examsSameDay !== 'allow';
  const items = inst.courses.map(({ id, mode }) => {
    const course = data.courses[id];
    value[id] = val[id] + (bias[id] ?? 0);
    maxValue += Math.max(0, value[id]);
    const pinnedHere = pins.filter((p) => course.groups.some((g) => g.id === p));
    const byId = Object.fromEntries(course.groups.map((g) => [g.id, g]));
    // an option = a list of group ids, the first one the primary (lecture); synthetic courses: one primary each. Real-data scripts pass
    // inst.comboFor(id) (the lecture + tutorial/lab combinations); every filter below is applied by the reference itself.
    const combos = inst.comboFor ? inst.comboFor(id) : course.groups.filter((x) => x.primary).map((g) => [g.id]);
    const options = [];
    for (const ids of combos) {
      const gs = ids.map((x) => byId[x]);
      if (gs.some((g) => g.full && !c.includeFull && !pins.includes(g.id))) continue;
      const slots = gs.flatMap((g) => g.meetings.flatMap(meetingSlots));
      if (slots.some((k) => forbid.has(k))) continue;
      if (pinnedHere.length && !pinnedHere.every((p) => ids.includes(p))) continue;
      const mins = (g) => g.meetings.reduce((a, m) => a + mm(m.end) - mm(m.start), 0);
      const minutes = gs.reduce((a, g) => a + mins(g), 0);
      const sharedMin = friends.map((f) => gs.filter((g) => f.groups.includes(g.id)).reduce((a, g) => a + mins(g), 0));
      options.push({ course: id, groups: ids, slots, minutes, sharedMin, exams: gs[0].exams.filter((e) => e.kind === 'בחינה' && e.moed === 1).map((e) => e.date) });
    }
    return { id, mode: pinnedHere.length ? 'must' : mode, credits: course.credits, options };
  });
  const sols = []; let visited = 0;
  const occ = new Uint8Array(7 * 32), chosen = [];
  const fw = friends.reduce((a, f) => a + f.weight, 0);
  function metricsRef() {
    const total = chosen.reduce((a, o) => a + o.minutes, 0) || 1;
    let fs = 0;
    friends.forEach((f, i) => { fs += f.weight * (chosen.reduce((a, o) => a + o.sharedMin[i], 0) / total); });
    const progress = chosen.reduce((a, o) => a + value[o.course], 0) / (maxValue || 1);
    let freeDays = 0, gap = 0, outside = 0;
    for (let d = 1; d <= 6; d++) {
      let lo = 99, hi = -1, n = 0;
      for (let s = 0; s < 32; s++) if (occ[d * 32 + s]) { n++; lo = Math.min(lo, s); hi = Math.max(hi, s); if (prefer.has(slotKey(d, s))) outside++; }
      if (d <= 5 && n === 0) freeDays++;
      if (n) gap += (hi - lo + 1 - n) * 30;
    }
    const dates = chosen.flatMap((o) => o.exams).sort();
    let minGap = null;
    for (let i = 1; i < dates.length; i++) { const g = (Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 864e5; minGap = minGap === null ? g : Math.min(minGap, g); }
    return {
      friends: fw ? fs / fw : 0, progress, freeDays: freeDays / 5, compact: 1 - Math.min(gap / 600, 1), timeWindow: 1 - Math.min(outside * 30 / 600, 1),
      examSpread: !data.examsPublished ? 0 : minGap === null ? 1 : Math.min(minGap, 7) / 7,
    };
  }
  function leaf() {
    if (!chosen.length) return;
    const ids = new Set(chosen.map((o) => o.course));
    for (const it of inst.courses) if (ids.has(it.id) && statuses[it.id]?.missingParallel && !statuses[it.id].missingParallel.every((alts) => alts.some((x) => ids.has(x)))) return;
    const m = metricsRef();
    const score = Object.entries(weights).reduce((a, [k, w]) => a + w * (m[k] ?? 0), 0);
    sols.push({ key: chosen.flatMap((o) => o.groups.map((g) => `${o.course}:${g}`)).sort().join('|'), score, m });
  }
  const daysNow = () => { let n = 0; for (let d = 1; d <= 6; d++) { for (let s = 0; s < 32; s++) if (occ[d * 32 + s]) { n++; break; } } return n; };
  function rec(i, credits, exams) {
    if (++visited > cap) throw new Error('reference cap exceeded');
    if (i === items.length) return leaf();
    const it = items[i];
    for (const o of it.options) {
      if (o.slots.some((k) => occ[k])) continue;
      if (c.maxCredits != null && credits + it.credits > c.maxCredits) continue; // meaning: a cap of 0 is a cap of 0
      if (noExamClash && o.exams.some((d) => exams.has(d))) continue;
      for (const k of o.slots) occ[k] = 1;
      if (c.maxDays != null && daysNow() > c.maxDays) { for (const k of o.slots) occ[k] = 0; continue; }
      chosen.push(o);
      rec(i + 1, credits + it.credits, noExamClash ? new Set([...exams, ...o.exams]) : exams);
      chosen.pop();
      for (const k of o.slots) occ[k] = 0;
    }
    if (it.mode === 'optional') rec(i + 1, credits, exams);
  }
  rec(0, 0, new Set());
  sols.sort((a, b) => b.score - a.score);
  return { sols, items, value, maxValue };
}

// Compare a search() result list with the reference list. Returns [] when equal, else a list of human-readable problems.
export function compareTopK(results, ref, topK, tol = 1e-9) {
  const bad = [], want = Math.min(topK, ref.sols.length);
  if (results.length !== want) bad.push(`count ${results.length} != ${want}`);
  const byKey = new Map(ref.sols.map((s) => [s.key, s]));
  const seen = new Set();
  for (let i = 0; i < Math.min(results.length, want); i++) {
    if (Math.abs(results[i].score - ref.sols[i].score) > tol) bad.push(`rank ${i} score ${results[i].score} != ref ${ref.sols[i].score}`);
  }
  for (const r of results) {
    const k = r.key;
    if (seen.has(k)) bad.push(`duplicate result ${k}`);
    seen.add(k);
    const s = byKey.get(k);
    if (!s) { bad.push(`result ${k} (score ${r.score}) is not a feasible plan in the reference`); continue; }
    if (Math.abs(s.score - r.score) > tol) bad.push(`result ${k} score ${r.score} != ref ${s.score}`);
    for (const mk of METRIC_KEYS) if (Math.abs((r.breakdown[mk] ?? 0) - s.m[mk]) > tol) bad.push(`result ${k} metric ${mk} ${r.breakdown[mk]} != ref ${s.m[mk]}`);
  }
  if (want) {
    const kth = ref.sols[want - 1].score;
    for (const s of ref.sols) if (s.score > kth + tol && !seen.has(s.key)) bad.push(`missing plan ${s.key} score ${s.score} > K-th ${kth}`);
  }
  return bad;
}
// key of a search() result in the reference's format (course:group sorted) - group ids map back to their course via data
export function resultKey(r, data) {
  const g2c = {};
  for (const [id, c] of Object.entries(data.courses)) for (const g of c.groups) g2c[g.id] = id;
  return r.groups.map((g) => `${g2c[g]}:${g}`).sort().join('|');
}
export function tagResults(results, data) {
  return results.map((r) => ({ ...r, key: resultKey(r, data) }));
}

// ---------- reporting ----------
export class Report {
  constructor() { this.fail = 0; this.lines = []; }
  check(id, ok, detail = '') { this.line(`CHECK ${id} ${ok ? 'PASS' : 'FAIL'} ${detail}`); if (!ok) this.fail++; }
  bug(id, reproduced, detail = '') { this.line(`BUG ${id} ${reproduced ? 'REPRODUCED' : 'NOT-REPRODUCED'} ${detail}`); if (!reproduced) this.fail++; }
  info(text) { this.line(`INFO ${text}`); }
  line(s) { console.log(s); }
  done() { process.exit(this.fail ? 1 : 0); }
}

// ---------- real-data helpers ----------
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const DATA = fileURLToPath(new URL('../../web/data/afeka/', import.meta.url));
export const realFiles = (sem) => fs.readdirSync(DATA + sem).filter((f) => /^\d+-\d{4}\.json$/.test(f)).sort();
export const loadReal = (sem, file) => JSON.parse(fs.readFileSync(`${DATA}${sem}/${file}`, 'utf8'));
// clone of real data with synthetic exams (the committed data has none): one moed-1 'בחינה' date per course shared by its primary groups,
// ~20% of courses get per-group dates, plus decoy moed-2 / 'בוחן אמצע' entries.
export function withExams(data, rng) {
  const d = structuredClone(data);
  d.examsPublished = true;
  const pool = Array.from({ length: 16 }, (_, i) => `2027-02-${String(1 + i + (i > 7 ? 2 : 0)).padStart(2, '0')}`);
  for (const c of Object.values(d.courses)) {
    const base = pick(rng, pool), perGroup = rng() < 0.2;
    for (const g of c.groups) {
      if (!g.primary) continue;
      g.exams = [{ kind: 'בחינה', moed: 1, date: perGroup ? pick(rng, pool) : base, time: null }];
      if (rng() < 0.3) g.exams.push({ kind: 'בחינה', moed: 2, date: pick(rng, pool), time: null });
      if (rng() < 0.2) g.exams.push({ kind: 'בוחן אמצע', moed: 1, date: pick(rng, pool), time: null });
    }
  }
  return d;
}

import { buildOptions } from '../../web/solver-core.js';
import { classify } from '../../web/rules.js';
// A random search() instance over real data: k courses (each with >= 1 and <= maxOpts option combos), real statuses from classify()
// with every course outside the subset counted as passed (so real קדם/מקביל links inside the subset show up as blocked/conditional).
// comboFor = the lecture(+tutorial/lab) combinations from buildOptions with NO filtering (all filters are applied by referenceSolve itself).
export function realInstance(rng, data, o = {}) {
  const k = o.k ?? ri(rng, 4, 7), ids = Object.keys(data.courses).filter((id) => data.courses[id].offered && data.courses[id].groups.some((g) => g.primary));
  const all = (id) => buildOptions(data.courses[id], { includeFull: true });
  const maxOpts = o.maxOpts ?? 7, picked = [];
  let prod = 1, tries = 0;
  while (picked.length < k && tries++ < 400) {
    const id = pick(rng, ids);
    if (picked.includes(id)) continue;
    const n = all(id).length;
    if (!n || n > maxOpts || prod * (n + 1) > (o.maxProduct ?? 150000)) continue;
    picked.push(id); prod *= n + 1;
  }
  const comboCache = Object.fromEntries(picked.map((id) => [id, all(id).map((op) => op.groups)]));
  const statuses = classify(data, { passed: Object.keys(data.courses).filter((id) => !picked.includes(id)), failed: {}, profile: {} }).statuses;
  const groupIds = picked.flatMap((id) => data.courses[id].groups.map((g) => g.id));
  const friends = [];
  for (let f = 0; f < (rng() < 0.4 ? ri(rng, 1, 2) : 0); f++) friends.push({ name: `F${f}`, groups: groupIds.filter(() => rng() < 0.3), weight: pick(rng, [0, 1, 2, 3]), active: true });
  const constraints = {
    dayOff: rng() < 0.6 ? [pick(rng, [1, 2, 3, 4, 5, 6])] : [], dayOffHard: rng() < 0.1, notBefore: rng() < 0.3 ? hhmm(pick(rng, [8, 9, 10]) * 60 + pick(rng, [0, 30])) : '',
    notAfter: rng() < 0.5 ? hhmm(pick(rng, [15, 17, 18, 20]) * 60 + pick(rng, [0, 30])) : '', windowHard: rng() < 0.15,
    maxCredits: rng() < 0.3 ? pick(rng, [4, 6, 8, 12]) : null, maxDays: rng() < 0.3 ? ri(rng, 2, 5) : null,
    examsSameDay: rng() < 0.5 ? 'forbid' : 'allow', includeFull: rng() < 0.5, blocks: [], lecturers: {},
  };
  if (rng() < 0.25) constraints.blocks.push({ day: pick(rng, [1, 2, 3, 4, 5]), start: hhmm(ri(rng, 8, 14) * 60), end: hhmm(ri(rng, 15, 18) * 60), label: 'b' });
  const weights = Object.fromEntries(['friends', 'progress', 'freeDays', 'compact', 'timeWindow', 'examSpread'].map((kk) => [kk, pick(rng, [0, 1, 3, 5])]));
  const pins = [];
  if (rng() < 0.15) { const pid = pick(rng, picked); const gs = data.courses[pid].groups.filter((g) => g.primary); if (gs.length) pins.push(pick(rng, gs).id); }
  return { data, courses: picked.map((id) => ({ id, mode: rng() < 0.35 ? 'must' : 'optional' })), statuses, pins, constraints, weights, friends, bias: {}, topK: pick(rng, [1, 3, 10]),
    comboFor: (id) => comboCache[id], product: prod };
}

// Real data lists 5 courses as their own קדם prerequisite (scraper: exclusive conditions parsed as prerequisites; see search-selfloop-prereq.mjs).
// The reference defines value without self links, so for search-vs-reference comparisons the self links are removed from a clone of the data.
export function stripSelfLoops(data) {
  const d = structuredClone(data);
  for (const [id, c] of Object.entries(d.courses)) c.prereqs = c.prereqs.map((p) => ({ ...p, anyOf: p.anyOf.filter((a) => a.id !== id) })).filter((p) => p.anyOf.length);
  return d;
}
