// year-lib.mjs - shared helpers for the year-* repro scripts (searchYear audit, web/solver-core.js:375-501).
//
// Contents (all written from the MEANING of the problem, none copied from web/solver-core.js or web/rules.js):
//   * mulberry32            seeded PRNG
//   * grp/crs/semData       tiny builders for synthetic semester datasets (same JSON shape as web/data/afeka/<sem>/<prog>.json)
//   * refClassify/refMode   status of a course from prerequisites / passed / failed (spec: README of the data model, not rules.js code)
//   * refValues             course value = credits + 1*(# transitive dependents via קדם) + 2*(longest dependency chain below)
//   * refYear               exhaustive year enumerator: every A selection x every B selection, scored with the documented
//                           formula  nonprog(A)+nonprog(B)+2*Wp*yearProgress+LOAD_W*loadScore-MISSING_W*missing
//   * refValidatePair       checks one returned pair against hard constraints from first principles
//   * Reporter              prints  'CHECK <id> PASS|FAIL ...'  and  'BUG <id> REPRODUCED|NOT-REPRODUCED ...', sets the exit code
//   * real-data helpers     load a program/cohort pair like web/app.js does (earlier years passed, year list, DEFAULT prefs)
//
// This file is imported by the year-*.mjs scripts; it is not a script itself.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const REPO = fileURLToPath(new URL('../../', import.meta.url));

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- reporter
export class Reporter {
  constructor() { this.bad = 0; }
  check(id, ok, detail = '') { console.log(`CHECK ${id} ${ok ? 'PASS' : 'FAIL'} ${detail}`); if (!ok) this.bad++; }
  bug(id, reproduced, detail = '') { console.log(`BUG ${id} ${reproduced ? 'REPRODUCED' : 'NOT-REPRODUCED'} ${detail}`); if (!reproduced) this.bad++; }
  info(text) { console.log(`INFO ${text}`); }
  done() { process.exitCode = this.bad ? 1 : 0; }
}

// ---------------------------------------------------------------- synthetic data builders
export const tm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
export const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
// meeting: day 1..6, start 'HH:MM', end 'HH:MM'
export const mt = (day, start, end) => ({ day, start, end, room: 'r' });
export const grp = (id, meetings, extra = {}) => ({ id, type: 'סופי-הרצאה', primary: true, lecturer: 'L', full: false, semester: 'א', linked: [], meetings, exams: [], ...extra });
export const sub = (id, meetings, extra = {}) => ({ ...grp(id, meetings), type: 'תרגול', primary: false, ...extra });
export const pre = (id, kind = 'קדם', alt = null) => ({ kind, anyOf: [{ id, name: id }, ...(alt ? [{ id: alt, name: alt }] : [])] });
export const outside = () => ({ kind: 'קדם', anyOf: [{ id: null, name: 'outside' }] });
export const crs = (name, credits, groups, prereqs = [], offered = groups.length > 0) => ({ name, credits, offered, prereqs, groups });
export const semData = (semester, courses, lists = null, extra = {}) => ({
  fetchedAt: '2026-10-01T00:00:00Z', year: 2027, startYear: 2026, program: 1, semester, examsPublished: false,
  lists: lists ?? [{ code: 1, name: "קורסי חובה שנה א'", minCredits: 0, courses: Object.keys(courses) }], specializations: [], courses, ...extra,
});

// ---------------------------------------------------------------- reference: status / mode / value
// status of course `id` in `data` given the courses already passed (spec: passed->done; exempt->exempt; not taught->notOffered;
// failed->retake; an unmet קדם->blocked; an unmet מקביל->conditional; else available).
export function refClassify(data, passed, failed = {}, exempt = new Set()) {
  const out = {};
  const met = (p) => p.anyOf.some((a) => a.id && (passed.has(a.id) || exempt.has(a.id))) || p.anyOf.every((a) => a.id === null);
  for (const [id, c] of Object.entries(data.courses)) {
    if (passed.has(id)) { out[id] = { status: 'done', par: [] }; continue; }
    if (exempt.has(id)) { out[id] = { status: 'exempt', par: [] }; continue; }
    if (!c.offered) { out[id] = { status: 'notOffered', par: [] }; continue; }
    const par = c.prereqs.filter((p) => p.kind === 'מקביל' && !met(p)).map((p) => p.anyOf.map((a) => a.id).filter(Boolean));
    if (failed[id]) { out[id] = { status: 'retake', par }; continue; }
    if (c.prereqs.some((p) => p.kind === 'קדם' && !met(p))) { out[id] = { status: 'blocked', par: [] }; continue; }
    out[id] = par.length ? { status: 'conditional', par } : { status: 'available', par: [] };
  }
  return out;
}
export const refMode = (status, choice, inYearList) => {
  if (!['retake', 'available', 'conditional', 'afterA'].includes(status)) return null;
  if (choice) return choice;
  if (status === 'retake') return 'must';
  return inYearList ? 'optional' : 'no';
};
// value(id) = credits + (# courses that transitively need it via קדם) + 2 * (length of the longest קדם chain above it)
export function refValues(data) {
  const ids = Object.keys(data.courses), kids = Object.fromEntries(ids.map((i) => [i, []]));
  for (const id of ids) for (const p of data.courses[id].prereqs) if (p.kind === 'קדם') for (const a of p.anyOf) if (a.id && kids[a.id]) kids[a.id].push(id);
  const desc = (id) => { const seen = new Set(), st = [...kids[id]]; while (st.length) { const x = st.pop(); if (seen.has(x)) continue; seen.add(x); st.push(...kids[x]); } return seen; };
  const memo = {}, depth = (id, path = new Set()) => {
    if (id in memo) return memo[id];
    if (path.has(id)) return 0;
    path.add(id);
    const d = kids[id].length ? 1 + Math.max(...kids[id].map((k) => depth(k, path))) : 0;
    path.delete(id);
    return (memo[id] = d);
  };
  return Object.fromEntries(ids.map((id) => [id, data.courses[id].credits + desc(id).size + 2 * depth(id)]));
}

// ---------------------------------------------------------------- reference: options / selections / metrics
const meetingsOf = (groups) => groups.flatMap((g) => g.meetings);
export const clashes = (m1, m2) => m1.day === m2.day && tm(m1.start) < tm(m2.end) && tm(m2.start) < tm(m1.end);
const anyClash = (ms1, ms2) => ms1.some((a) => ms2.some((b) => clashes(a, b)));
// 30-minute slots a meeting touches (slot i = [07:00+30i, +30))
const slotsOfMeeting = (m) => { const a = Math.floor((tm(m.start) - 420) / 30), b = Math.ceil((tm(m.end) - 420) / 30), o = []; for (let i = Math.max(0, a); i < Math.min(32, b); i++) o.push(i); return o; };

// options of one course in one semester: primary + one group of each linked type (synthetic data has no nested links)
export function refOptions(course, { pins = [], includeFull = false, forbid = () => false }) {
  const byId = new Map(course.groups.map((g) => [g.id, g]));
  const coursePins = pins.filter((p) => byId.has(p));
  const out = [];
  for (const p of course.groups.filter((g) => g.primary)) {
    const types = {};
    for (const id of p.linked) { const s = byId.get(id); if (s) (types[s.type] ??= []).push(s); }
    let combos = [[p]];
    for (const list of Object.values(types)) combos = combos.flatMap((c) => list.map((s) => [...c, s]));
    for (const groups of combos) {
      if (!includeFull && groups.some((g) => g.full && !pins.includes(g.id))) continue;
      if (coursePins.some((id) => !groups.some((g) => g.id === id))) continue;
      const ms = meetingsOf(groups);
      if (ms.some(forbid)) continue;
      out.push({ groups: groups.map((g) => g.id), meetings: ms });
    }
  }
  return out;
}

// hard per-meeting prohibitions (busy blocks always; day off / time window when hard)
export function forbidFn(c = {}) {
  return (m) => {
    if ((c.blocks ?? []).some((b) => b.day === m.day && tm(b.start) < tm(m.end) && tm(m.start) < tm(b.end))) return true;
    if (c.dayOffHard && (c.dayOff ?? []).includes(m.day)) return true;
    if (c.windowHard && c.notBefore && tm(m.start) < tm(c.notBefore)) return true;
    if (c.windowHard && c.notAfter && tm(m.end) > tm(c.notAfter)) return true;
    return false;
  };
}

// non-progress part of one semester's score for a selection (list of {meetings}); weights wf/wc/wt; friends/exams are 0 in these tests
export function nonProg(sel, weights, c = {}, emptyConvention = 'natural') {
  if (!sel.length && emptyConvention === 'zero') return 0;
  const days = {};
  for (const o of sel) for (const m of o.meetings) { const s = (days[m.day] ??= new Set()); for (const i of slotsOfMeeting(m)) s.add(i); }
  const free = Math.min(1, [1, 2, 3, 4, 5, 6].filter((d) => (d <= 5 || (c.dayOff ?? []).includes(d)) && !days[d]?.size).length / 5); // D1 (issue #7)
  let gap = 0, outsideMin = 0;
  for (const [d, s] of Object.entries(days)) {
    if (!s.size) continue;
    const lo = Math.min(...s), hi = Math.max(...s);
    gap += (hi - lo + 1 - s.size) * 30;
  }
  // 2026-10-07 (stage 4, issue #4): outside minutes are real minutes, minute by minute per lesson (lessons of a valid plan never overlap)
  for (const o of sel) for (const m of o.meetings) for (let t = tm(m.start); t < tm(m.end); t++) {
    if ((c.dayOff ?? []).includes(m.day) || (c.notBefore && t < tm(c.notBefore)) || (c.notAfter && t >= tm(c.notAfter))) outsideMin++;
  }
  return (weights.freeDays ?? 0) * free + (weights.compact ?? 0) * (1 - Math.min(gap / 600, 1)) + (weights.timeWindow ?? 0) * (1 - Math.min(outsideMin / 600, 1));
}

// all feasible selections of one semester: items [{id, must, options}], per-semester caps in c; selection = {ids, groups, meetings, credits, opts}
function* selections(items, creditsOf, c, parOf) {
  const rec = function* (i, chosen, ms, cr) {
    if (i === items.length) {
      const ids = new Set(chosen.map((x) => x.id));
      // conditional courses (unmet מקביל) need one anyOf-course of each requirement in the same semester
      for (const x of chosen) for (const anyOf of parOf(x.id)) if (!anyOf.some((p) => ids.has(p))) return;
      if (c.maxDays) { const d = new Set(ms.map((m) => m.day)); if (d.size > c.maxDays) return; }
      yield { ids: [...ids], chosen, groups: chosen.flatMap((x) => x.opt.groups), meetings: ms, credits: cr };
      return;
    }
    const it = items[i];
    for (const opt of it.options) {
      if (anyClash(ms, opt.meetings)) continue;
      if (c.maxCredits && cr + creditsOf(it.id) > c.maxCredits) continue;
      yield* rec(i + 1, [...chosen, { id: it.id, opt }], [...ms, ...opt.meetings], cr + creditsOf(it.id));
    }
    if (!it.must) yield* rec(i + 1, chosen, ms, cr);
  };
  yield* rec(0, [], [], 0);
}

// ---------------------------------------------------------------- reference: the year
export const SHARE = { 'א': 0.65, even: 0.5, 'ב': 0.35 };
export const LOAD_W = 3, MISSING_W = 5;
// Returns {pairs: [...], ctx} where pairs lists EVERY (A selection, B selection) combination that satisfies the hard rules, with its score.
//   opts.emptyConvention: 'natural' (an empty semester scores its natural metrics: all days free, no gaps, nothing outside the window)
//                         | 'zero' (what searchYear's empty-A / b=null plans use: 0)
//   opts.relaxMusts: true = a B selection may omit a must (it is then 'missing', -5 each); false = B must contain every B must it can
export function refYear({ dataA, dataB, state, yearList, pins = [], constraints = {}, weights = {}, opts = {} }) {
  const { emptyConvention = 'natural', relaxMusts = true, aMustRelax = false } = opts;
  const passed0 = new Set(state.passed ?? []), failed = state.failed ?? {}, choices = state.choices ?? {};
  const groupsOf = (d, id) => d.courses[id]?.groups.map((g) => g.id) ?? [];
  const pinnedIn = (d, id) => pins.some((p) => groupsOf(d, id).includes(p));
  const offered = (d, id) => !!d.courses[id]?.offered;
  const forced = (id) => (pinnedIn(dataA, id) ? 'א' : pinnedIn(dataB, id) ? 'ב' : state.semesterOf?.[id] ?? (!offered(dataB, id) ? 'א' : !offered(dataA, id) ? 'ב' : null));
  const forbid = forbidFn(constraints);
  const pinsIn = (d) => pins.filter((p) => Object.keys(d.courses).some((id) => groupsOf(d, id).includes(p)));
  const mk = (d, id, must) => ({ id, must, options: refOptions(d.courses[id], { pins: pinsIn(d), includeFull: constraints.includeFull, forbid }) });
  const creditsA = (id) => dataA.courses[id].credits, creditsB = (id) => dataB.courses[id].credits;

  const stA = refClassify(dataA, passed0, failed);
  const candA = [], must = new Set();
  for (const id of Object.keys(dataA.courses)) {
    const mode = refMode(stA[id].status, choices[id], yearList.has(id));
    if (mode === 'must') must.add(id);
    if ((mode !== 'must' && mode !== 'optional') || forced(id) === 'ב') continue;
    const flexible = !forced(id);
    candA.push({ id, must: pinnedIn(dataA, id) ? true : flexible ? false : mode === 'must' });
  }
  const stY = refClassify(dataB, new Set([...passed0, ...candA.map((c) => c.id)]), failed);
  const vA = refValues(dataA), vB = refValues(dataB), inA = new Set(candA.map((c) => c.id));
  let yearMax = candA.reduce((s, c) => s + Math.max(0, vA[c.id]), 0);
  const pinnedBonly = (id) => !pinnedIn(dataA, id) && pinnedIn(dataB, id);
  for (const id of Object.keys(dataB.courses)) {
    const mode = refMode(stY[id].status, choices[id], yearList.has(id));
    if (mode === 'must' || (mode === 'optional' && pinnedBonly(id))) must.add(id);
    if ((mode === 'must' || mode === 'optional') && !inA.has(id) && forced(id) !== 'א') yearMax += Math.max(0, vB[id]);
  }
  const Wp = weights.progress ?? 0;
  const pairs = [];
  const bCache = new Map();
  const aItems = candA.map((c) => mk(dataA, c.id, c.must));
  const par = (st) => (id) => st[id]?.par ?? [];
  const aSels = [...selections(aItems, creditsA, constraints, par(stA))];
  for (const a of aSels) {
    if (!a.ids.length && candA.some((c) => c.must)) continue; // an A-must exists: empty A is not a plan
    const takenA = new Set(a.ids);
    const key = [...takenA].sort().join();
    if (!bCache.has(key)) {
      const stB = refClassify(dataB, new Set([...passed0, ...takenA]), failed);
      const bCand = [];
      for (const id of Object.keys(dataB.courses)) {
        if (takenA.has(id) || forced(id) === 'א') continue;
        const mode = refMode(stB[id].status, choices[id], yearList.has(id));
        if (mode !== 'must' && mode !== 'optional') continue;
        bCand.push({ id, must: mode === 'must' || pinnedBonly(id) });
      }
      const items = bCand.map((c) => mk(dataB, c.id, !relaxMusts && c.must)); // relax: every course may be omitted
      bCache.set(key, { sels: [...selections(items, creditsB, constraints, par(stB))], stB });
    }
    const { sels, stB } = bCache.get(key);
    for (const b of sels) {
      if (!a.ids.length && !b.ids.length) continue;
      const all = new Set([...a.ids, ...b.ids]);
      const missing = [...must].filter((id) => !all.has(id));
      const ca = a.credits, cb = b.credits, total = ca + cb;
      const loadScore = total ? 1 - Math.min(Math.abs(ca - SHARE[state.load ?? 'even'] * total) / (total / 2), 1) : 1;
      const yp = (a.ids.reduce((s, id) => s + Math.max(0, vA[id]), 0) + b.ids.reduce((s, id) => s + Math.max(0, vB[id]), 0)) / (yearMax || 1);
      const nA = nonProg(a.chosen.map((x) => x.opt), weights, constraints, emptyConvention), nB = nonProg(b.chosen.map((x) => x.opt), weights, constraints, emptyConvention);
      const score = nA + nB + 2 * Wp * yp + LOAD_W * loadScore - MISSING_W * missing.length;
      pairs.push({ score, aIds: a.ids, bIds: b.ids, aGroups: a.groups, bGroups: b.groups, missing, credits: { a: ca, b: cb }, yp, parts: { nA, nB, prog: 2 * Wp * yp, load: LOAD_W * loadScore, miss: MISSING_W * missing.length } });
    }
  }
  pairs.sort((x, y) => y.score - x.score);
  return { pairs, must, yearMax, candA, vA, vB, stA, nA: aSels.length };
}

// ---------------------------------------------------------------- reference: validate one returned pair from first principles
// Returns a list of violated rules (empty = valid). Checks: group ids exist in the right semester and form legal options, no clash,
// courses offered, prerequisites (A: passed; B: passed + A), mode must/optional, no course twice, caps/blocks/full groups, credits, missing.
export function refValidatePair({ dataA, dataB, state, yearList, pins = [], constraints = {} }, pair) {
  const errs = [];
  const passed0 = new Set(state.passed ?? []), failed = state.failed ?? {}, choices = state.choices ?? {};
  const forbid = forbidFn(constraints);
  const side = (name, data, sel, passed, creditsKey) => {
    const st = refClassify(data, passed, failed);
    const byGroup = new Map(); for (const [id, c] of Object.entries(data.courses)) for (const g of c.groups) byGroup.set(g.id, { id, g });
    const groupIds = sel?.groups ?? [], courseIds = sel?.courses ?? [];
    const ms = [];
    const perCourse = {};
    for (const gid of groupIds) {
      const x = byGroup.get(gid);
      if (!x) { errs.push(`${name}: group ${gid} is not in the ${name} data`); continue; }
      (perCourse[x.id] ??= []).push(x.g);
      for (const m of x.g.meetings) { if (forbid(m)) errs.push(`${name}: ${gid} breaks a hard time rule`); ms.push({ ...m, gid }); }
    }
    for (const id of courseIds) {
      if (!perCourse[id]) errs.push(`${name}: course ${id} has no group`);
      const c = data.courses[id];
      if (!c) { errs.push(`${name}: unknown course ${id}`); continue; }
      const s = st[id]?.status;
      if (!['available', 'conditional', 'retake'].includes(s)) errs.push(`${name}: ${id} has status ${s} (not takeable)`);
      else if (refMode(s, choices[id], yearList.has(id)) !== 'must' && refMode(s, choices[id], yearList.has(id)) !== 'optional') errs.push(`${name}: ${id} has mode no`);
      const gs = perCourse[id] ?? [];
      if (!gs.some((g) => g.primary)) errs.push(`${name}: ${id} has no primary group`);
      else for (const e of refLinkedErrors(c, gs.map((g) => g.id))) errs.push(`${name}: ${id}: ${e}`);
      if (!constraints.includeFull) for (const g of gs) if (g.full && !pins.includes(g.id)) errs.push(`${name}: ${g.id} is full`);
      for (const anyOf of st[id]?.par ?? []) if (!anyOf.some((p) => courseIds.includes(p))) errs.push(`${name}: ${id} needs a parallel course (${anyOf}) in the same semester`);
    }
    for (const id of Object.keys(perCourse)) if (!courseIds.includes(id)) errs.push(`${name}: groups of ${id} but ${id} is not in courses`);
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) if (clashes(ms[i], ms[j])) errs.push(`${name}: clash ${ms[i].gid} x ${ms[j].gid}`);
    const credits = courseIds.reduce((s, id) => s + (data.courses[id]?.credits ?? 0), 0);
    if (constraints.maxCredits && credits > constraints.maxCredits) errs.push(`${name}: credits ${credits} > cap ${constraints.maxCredits}`);
    if (constraints.maxDays && new Set(ms.map((m) => m.day)).size > constraints.maxDays) errs.push(`${name}: more than ${constraints.maxDays} campus days`);
    return credits;
  };
  const ca = side('A', dataA, pair.a, passed0);
  const takenA = new Set(pair.a?.courses ?? []);
  const cb = side('B', dataB, pair.b, new Set([...passed0, ...takenA]));
  for (const id of pair.b?.courses ?? []) if (takenA.has(id)) errs.push(`course ${id} in both semesters`);
  // pins: a pinned group means 'this course, in this semester, in exactly this group' (an A pin wins over a B pin)
  const owner = (d, g) => Object.entries(d.courses).find(([, c]) => c.groups.some((x) => x.id === g))?.[0];
  const pinnedInA = (id) => dataA.courses[id]?.groups.some((g) => pins.includes(g.id));
  const bCourses = pair.b?.courses ?? [], bGroups = pair.b?.groups ?? [];
  for (const p of pins) {
    const oa = owner(dataA, p), ob = owner(dataB, p);
    if (oa) {
      if (bCourses.includes(oa)) errs.push(`pin ${p}: course ${oa} is pinned in A but planned in B`);
      if (takenA.has(oa) && !pair.a.groups.includes(p)) errs.push(`pin ${p}: course ${oa} is in A but not in the pinned group (silently re-grouped)`);
    }
    if (ob && !pinnedInA(ob)) {
      if (takenA.has(ob)) errs.push(`pin ${p}: course ${ob} is pinned in B but planned in A`);
      if (bCourses.includes(ob) && !bGroups.includes(p)) errs.push(`pin ${p}: course ${ob} is in B but not in the pinned group (silently re-grouped)`);
    }
  }
  if (pair.credits.a !== ca || pair.credits.b !== cb) errs.push(`credits ${JSON.stringify(pair.credits)} != ${ca}/${cb}`);
  return errs;
}

// ---------------------------------------------------------------- real data (mirrors web/app.js: yearView data, earlierYears -> passed, yearCourses)
export const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
export const dataFile = (sem, program, startYear) => `${REPO}web/data/afeka/2027-${sem}/${program}-${startYear}.json`;
export const catalog = () => readJson(`${REPO}web/data/afeka/catalog.json`);
// DEFAULT preferences, copied from web/app.js:14-16 (the values the UI starts with)
export const DEFAULT_WEIGHTS = { friends: 3, progress: 3, freeDays: 1, compact: 1, timeWindow: 1, examSpread: 1 };
export const DEFAULT_CONSTRAINTS = () => ({ dayOff: [6], dayOffHard: false, notBefore: '', notAfter: '20:00', windowHard: false, maxCredits: null, maxDays: null, examsSameDay: 'forbid', includeFull: false, blocks: [], lecturers: {} });
const yearsOfData = (A) => { const n = Math.max(0, ...A.lists.map((l) => ' אבגדה'.indexOf(l.name.match(/שנה ([א-ה])'/)?.[1] ?? ' '))); return n >= 2 ? n : 4; };
export function realSetup(program, startYear, year, over = {}) {
  const dataA = readJson(dataFile(1, program, startYear)), dataB = readJson(dataFile(2, program, startYear));
  const letters = 'אבגדה';
  const before = letters.slice(0, year - 1);
  const passed = [...new Set(dataA.lists.filter((l) => [...before].some((y) => l.name.includes(`שנה ${y}'`))).flatMap((l) => l.courses))];
  const list = dataA.lists.find((l) => l.name.includes(`שנה ${' אבגדה'[year]}'`))?.courses ?? [];
  const yearList = new Set(list); // years >= 3 would add the chosen specialization's courses (profile.specs empty here)
  const state = { passed, failed: {}, choices: {}, semesterOf: {}, load: 'even', profile: { year, amirnet: null, specs: [], summer: false }, pins: [], ...over };
  return { dataA, dataB, state, yearList, weights: { ...DEFAULT_WEIGHTS }, constraints: DEFAULT_CONSTRAINTS(), friends: [], yearsOf: yearsOfData(dataA) };
}

// ---------------------------------------------------------------- reference: year context, score of ONE given pair, warnings, linked groups
// What a year plan is scored against: the year's must set, yearMax (the value of every course that could enter the year), per-semester values.
export function refContext({ dataA, dataB, state, yearList, pins = [] }) {
  const passed0 = new Set(state.passed ?? []), failed = state.failed ?? {}, choices = state.choices ?? {};
  const groupsOf = (d, id) => d.courses[id]?.groups.map((g) => g.id) ?? [];
  const pinnedIn = (d, id) => pins.some((p) => groupsOf(d, id).includes(p));
  const offered = (d, id) => !!d.courses[id]?.offered;
  const forced = (id) => (pinnedIn(dataA, id) ? 'א' : pinnedIn(dataB, id) ? 'ב' : state.semesterOf?.[id] ?? (!offered(dataB, id) ? 'א' : !offered(dataA, id) ? 'ב' : null));
  const stA = refClassify(dataA, passed0, failed), candA = [], must = new Set();
  for (const id of Object.keys(dataA.courses)) {
    const mode = refMode(stA[id].status, choices[id], yearList.has(id));
    if (mode === 'must') must.add(id);
    if ((mode !== 'must' && mode !== 'optional') || forced(id) === 'ב') continue;
    candA.push(id);
  }
  const stY = refClassify(dataB, new Set([...passed0, ...candA]), failed);
  const vA = refValues(dataA), vB = refValues(dataB), inA = new Set(candA);
  let yearMax = candA.reduce((s, id) => s + Math.max(0, vA[id]), 0);
  for (const id of Object.keys(dataB.courses)) {
    const mode = refMode(stY[id].status, choices[id], yearList.has(id));
    if (mode === 'must' || (mode === 'optional' && !pinnedIn(dataA, id) && pinnedIn(dataB, id))) must.add(id);
    if ((mode === 'must' || mode === 'optional') && !inA.has(id) && forced(id) !== 'א') yearMax += Math.max(0, vB[id]);
  }
  return { must, yearMax, vA, vB, candA, stA, stY };
}
// Score of one returned pair from first principles (same formula as refYear, nothing enumerated)
export function refScorePair(inst, pair, emptyConvention = 'zero') {
  const { dataA, dataB, state, weights = {}, constraints = {} } = inst;
  const ctx = refContext(inst);
  const meet = (d, groups) => { const set = new Set(groups); return Object.values(d.courses).flatMap((c) => c.groups.filter((g) => set.has(g.id)).flatMap((g) => g.meetings)); };
  const aG = pair.a?.groups ?? [], bG = pair.b?.groups ?? [], aC = pair.a?.courses ?? [], bC = pair.b?.courses ?? [];
  const nA = nonProg(aG.length ? [{ meetings: meet(dataA, aG) }] : [], weights, constraints, emptyConvention);
  const nB = nonProg(bG.length ? [{ meetings: meet(dataB, bG) }] : [], weights, constraints, emptyConvention);
  const ca = aC.reduce((s, id) => s + dataA.courses[id].credits, 0), cb = bC.reduce((s, id) => s + dataB.courses[id].credits, 0), total = ca + cb;
  const load = total ? 1 - Math.min(Math.abs(ca - SHARE[state.load ?? 'even'] * total) / (total / 2), 1) : 1;
  const yp = (aC.reduce((s, id) => s + Math.max(0, ctx.vA[id]), 0) + bC.reduce((s, id) => s + Math.max(0, ctx.vB[id]), 0)) / (ctx.yearMax || 1);
  const all = new Set([...aC, ...bC]), missing = [...ctx.must].filter((id) => !all.has(id));
  return { score: nA + nB + 2 * (weights.progress ?? 0) * yp + LOAD_W * load - MISSING_W * missing.length, missing, yp, ca, cb, ctx };
}
// The courses of A that the B plan leans on: A-taken ids inside a קדם requirement of a B course that no passed course already meets.
export function refNeeds({ dataB, state }, pair) {
  const passed0 = new Set(state.passed ?? []), takenA = new Set(pair.a?.courses ?? []), out = new Set();
  for (const id of pair.b?.courses ?? []) for (const p of dataB.courses[id].prereqs) {
    if (p.kind !== 'קדם' || p.anyOf.some((a) => a.id && passed0.has(a.id))) continue;
    for (const a of p.anyOf) if (a.id && takenA.has(a.id)) out.add(a.id);
  }
  return out;
}
// Chosen groups of one course form a legal registration: one primary, every other group reachable through `linked`,
// and for each linked type of a chosen group at least one chosen group of that type. Returns error strings.
export function refLinkedErrors(course, chosenIds) {
  const byId = new Map(course.groups.map((g) => [g.id, g])), chosen = chosenIds.map((id) => byId.get(id)).filter(Boolean);
  const errs = [], prim = chosen.filter((g) => g.primary);
  if (prim.length !== 1) { errs.push(`${prim.length} primary groups chosen`); return errs; }
  const reach = new Set([prim[0].id]), st = [prim[0]];
  while (st.length) { const g = st.pop(); for (const l of g.linked) if (chosenIds.includes(l) && !reach.has(l)) { reach.add(l); st.push(byId.get(l)); } }
  for (const g of chosen) if (!reach.has(g.id)) errs.push(`group ${g.id} is not linked from the chosen primary`);
  for (const g of chosen) {
    const types = new Set(g.linked.map((l) => byId.get(l)?.type).filter(Boolean));
    for (const t of types) if (!g.linked.some((l) => chosenIds.includes(l) && byId.get(l)?.type === t)) errs.push(`group ${g.id}: no chosen group of linked type ${t}`);
  }
  return errs;
}
