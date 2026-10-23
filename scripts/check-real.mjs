#!/usr/bin/env node
// Read-only checks over every program in web/data/afeka: structure rules that must hold (errors, exit 1) and findings the code cannot
// decide (warnings, printed). No request to any site.   npm run check:real [-- --all]   (--all prints every warning, not 5 of each kind)
// Run before merging a change to the solver or the rules, and after every data update (docs/superpowers/specs/2026-10-23-trust-checks-design.md).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { classify, modeFor, amirnetExempt, yearsOf } from '../web/rules.js';
import { search, searchYear, buildOptions, overlaps } from '../web/solver-core.js';
import { DEFAULT } from '../web/app.js';

const DIR = 'web/data/afeka';
const YEAR = /חובה שנה (\S)'/;
const yearOf = (data) => {
  const out = {};
  for (const l of data.lists ?? []) {
    const y = ' אבגדה'.indexOf(l.name.match(YEAR)?.[1] ?? ' ');
    if (y > 0) for (const id of l.courses) out[id] = Math.min(out[id] ?? 9, y);
  }
  return out;
};
const sig = (c) => JSON.stringify(c.prereqs.map((p) => `${p.kind}:${p.anyOf.map((a) => a.id ?? a.name).sort().join('|')}`).sort());

// One data file: { errors, warnings }, each line starting with the file.
export function dataRules(data, file) {
  const errors = [],
    warnings = [],
    courses = data.courses ?? {},
    year = yearOf(data);
  for (const [id, c] of Object.entries(courses)) {
    if (typeof c.credits !== 'number') errors.push(`${file}: course ${id}: credits not a number (${JSON.stringify(c.credits)})`);
    if (c.offered && !c.groups?.length) errors.push(`${file}: course ${id}: offered without groups`);
    for (const p of c.prereqs ?? []) {
      const ids = p.anyOf.map((a) => a.id).filter(Boolean);
      for (const x of ids) {
        if (x === id) errors.push(`${file}: course ${id} requires itself`);
        else if (!courses[x]) errors.push(`${file}: course ${id} requires ${x}, which this file does not have`);
      }
      if (new Set(ids).size < ids.length) warnings.push(`repeat: ${file}: course ${id}: the same course twice in one requirement (${ids.join(' / ')})`);
    }
  }
  for (const l of data.lists ?? [])
    for (const id of l.courses) if (!courses[id]) errors.push(`${file}: list ${l.code} (${l.name}): course ${id} is not in courses`);
  // Achievable courses as a least fixed point: admit a course once every hard requirement (AND) has an achievable alternative (OR), an
  // outside-program one included. An alternative listed only in a later year's mandatory list than the course does not count.
  const ok = new Set();
  const usable = (a, id) =>
    a.id === null || (a.id !== id && ok.has(a.id) && !(year[id] && year[a.id] && year[a.id] > year[id]));
  for (let grew = true; grew; ) {
    grew = false;
    for (const [id, c] of Object.entries(courses)) {
      if (ok.has(id)) continue;
      if ((c.prereqs ?? []).filter((p) => p.kind === 'קדם').every((p) => p.anyOf.some((a) => usable(a, id)))) {
        ok.add(id);
        grew = true;
      }
    }
  }
  for (const id of Object.keys(courses))
    if (!ok.has(id)) errors.push(`${file}: course ${id} (${courses[id].name}) can never be taken: every route of a prerequisite is impossible`);
  return { errors, warnings };
}

// Files of one semester: a course whose prerequisites differ between programs, one warning each (some are real, some may be scrape errors).
export function crossProgram(files) {
  const seen = {};
  for (const [file, d] of files)
    for (const [id, c] of Object.entries(d.courses ?? {})) ((seen[id] ??= { name: c.name, v: {} }).v[sig(c)] ??= []).push(file);
  return Object.entries(seen)
    .filter(([, s]) => Object.keys(s.v).length > 1)
    .map(([id, s]) => `programs differ: course ${id} (${s.name}): ${Object.values(s.v).map((fs) => `${fs.length} file(s) e.g. ${fs[0]}`).join(' / ')}`);
}

// Prerequisites that changed since the last commit of this file: one warning per course. [] when git or the old file is missing.
export function changedSinceHead(file, data) {
  const r = spawnSync('git', ['show', `HEAD:${DIR}/${file}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return [];
  const old = JSON.parse(r.stdout).courses ?? {};
  return Object.entries(data.courses ?? {})
    .filter(([id, c]) => old[id] && sig(old[id]) !== sig(c))
    .map(([id, c]) => `changed: ${file}: course ${id} (${c.name}): prerequisites ${sig(old[id])} -> ${sig(c)}`);
}

// Every data file as [relative path, data], by semester folder.
export function dataFiles(dir = DIR) {
  const out = {};
  for (const sem of readdirSync(dir).filter((s) => statSync(`${dir}/${s}`).isDirectory()))
    out[sem] = readdirSync(`${dir}/${sem}`)
      .filter((f) => f.endsWith('.json'))
      .map((f) => [`${sem}/${f}`, JSON.parse(readFileSync(`${dir}/${sem}/${f}`, 'utf8'))]);
  return out;
}

// ---------------- layer 3: the record and the solver ----------------
// The oracle is written from the spec, not from rules.js: one requirement is met by any alternative (passed, exempt by the English
// score, or an outside one the student marked done); a requirement entirely outside the program is assumed met. Only the English
// score -> exemption table is borrowed (amirnetExempt): it is data, not the logic under test.
const recordMet = (state) => {
  const passed = new Set(state.passed ?? []),
    exempt = new Set(amirnetExempt(state.profile?.amirnet)),
    outside = new Set(state.outsideDone ?? []);
  return (p) =>
    p.anyOf.every((a) => a.id === null) || p.anyOf.some((a) => (a.id ? passed.has(a.id) || exempt.has(a.id) : outside.has(a.name)));
};
export function oracle(data, state) {
  const passed = new Set(state.passed ?? []),
    exempt = new Set(amirnetExempt(state.profile?.amirnet)),
    failed = state.failed ?? {},
    met = recordMet(state),
    out = {};
  for (const [id, c] of Object.entries(data.courses)) {
    const unmet = (kind) => c.prereqs.some((p) => p.kind === kind && !met(p));
    out[id] = passed.has(id) ? 'done' : exempt.has(id) ? 'exempt' : !c.offered ? 'notOffered' : failed[id] ? 'retake'
      : unmet('קדם') ? 'blocked' : unmet('מקביל') ? 'conditional' : 'available';
  }
  return out;
}

const toM = (t) => +t.slice(0, 2) * 60 + +t.slice(3);
const clash = (a, b) => a.day === b.day && toM(a.start) < toM(b.end) && toM(b.start) < toM(a.end);
// One semester's plan ({ courses, groups }) against the record: no overlap, no busy time, a first attempt meets its prerequisites, a
// retake may lack one (a faculty exception: the record warning says so), every corequisite is passed or in the same plan.
export function checkPlan(data, state, plan, constraints = {}) {
  const errs = [],
    where = new Map();
  for (const [cid, c] of Object.entries(data.courses)) for (const g of c.groups) where.set(g.id, { cid, g });
  const ms = [];
  for (const id of plan.groups) {
    if (!where.has(id)) errs.push(`unknown group ${id}`);
    else ms.push(...where.get(id).g.meetings.map((m) => ({ ...m, id })));
  }
  for (let i = 0; i < ms.length; i++)
    for (let j = i + 1; j < ms.length; j++) if (clash(ms[i], ms[j])) errs.push(`overlap: ${ms[i].id} and ${ms[j].id}`);
  for (const m of ms) for (const b of constraints.blocks ?? []) if (clash(m, b)) errs.push(`busy time: ${m.id} on day ${m.day} ${m.start}`);
  const st = oracle(data, state),
    met = recordMet(state),
    inPlan = new Set(plan.courses);
  for (const cid of plan.courses) {
    if (st[cid] === 'blocked') errs.push(`prerequisite: ${cid} is planned without its prerequisite (first attempt)`);
    if (['done', 'exempt', 'notOffered'].includes(st[cid])) errs.push(`${cid} is planned but ${st[cid]}`);
    for (const p of data.courses[cid].prereqs.filter((x) => x.kind === 'מקביל'))
      if (!met(p) && !p.anyOf.some((a) => a.id && inPlan.has(a.id)))
        errs.push(`corequisite: ${cid} needs ${p.anyOf.map((a) => a.id ?? a.name).join(' or ')}`);
  }
  return errs;
}
// A year plan: א against the record, ב against the record plus א, no course in both, both credit totals.
export function checkYearPlan({ dataA, dataB, state, plan, constraints = {} }) {
  const errs = checkPlan(dataA, state, plan.a, constraints).map((e) => `א: ${e}`);
  if (plan.b) {
    const stateB = { ...state, passed: [...(state.passed ?? []), ...plan.a.courses] };
    errs.push(...checkPlan(dataB, stateB, plan.b, constraints).map((e) => `ב: ${e}`));
    for (const id of plan.b.courses) if (plan.a.courses.includes(id)) errs.push(`${id} planned twice (א and ב)`);
  }
  const sum = (d, ids) => ids.reduce((s, id) => s + (d.courses[id]?.credits ?? 0), 0);
  if (plan.credits.a !== sum(dataA, plan.a.courses) || plan.credits.b !== sum(dataB, plan.b?.courses ?? []))
    errs.push(`credits ${JSON.stringify(plan.credits)} do not add up`);
  return errs;
}
// Brute force over every combination of the courses' options (none or one each): the most credits a plan without overlaps and with its
// corequisites in it can have. Small cases only (exponential).
export function bestCredits(data, courses, statuses) {
  const items = courses.map((c) => ({ ...c, os: buildOptions(data.courses[c.id]) }));
  let best = 0;
  const go = (i, mask, chosen) => {
    if (i === items.length) {
      const ids = new Set(chosen);
      if (chosen.every((id) => (statuses[id]?.missingParallel ?? []).every((alts) => alts.some((a) => ids.has(a)))))
        best = Math.max(best, chosen.reduce((s, id) => s + data.courses[id].credits, 0));
      return;
    }
    const it = items[i];
    if (it.mode !== 'must') go(i + 1, mask, chosen);
    for (const o of it.os)
      if (!mask || !overlaps(mask, o.mask)) go(i + 1, mask ? mask.map((v, d) => v | o.mask[d]) : o.mask, [...chosen, it.id]);
  };
  go(0, null, []);
  return best;
}

// Student scenarios for one file: S1 nothing passed; S2 the mandatory years before the cohort's study year passed; S3 up to three
// copies of S2 failing one distinct mandatory course of the study year, chosen by `seed` (printed with any failure).
export function scenarios(data, seed = 1) {
  const study = Math.min(yearsOf(data), Math.max(1, (data.year ?? 0) - (data.startYear ?? 0) + 1)),
    year = yearOf(data);
  const mand = (f) => Object.keys(year).filter((id) => f(year[id]) && data.courses[id]);
  const base = (passed, failed = {}) => ({
    passed, failed, exempt: [], outsideDone: [], grades: {}, choices: {}, semesterOf: {}, load: 'even', sortBy: 'best',
    profile: { year: study, amirnet: null, specs: [], summer: false }
  });
  const earlier = mand((y) => y < study);
  let s = seed;
  const rnd = () => (s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 2 ** 31;
  const pool = mand((y) => y === study).filter((id) => data.courses[id].offered && !earlier.includes(id)),
    fails = [];
  while (pool.length && fails.length < 3) fails.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  const yearList = new Set(mand((y) => y === study));
  return [
    { name: 'S1', state: base([]) },
    { name: 'S2', state: base(earlier) },
    ...fails.map((id) => ({ name: `S3:${id}`, state: base(earlier, { [id]: 1 }) }))
  ].map((x) => ({ ...x, yearList }));
}

// A witness that some plan exists without constraints: no mandatory course and one course that fits alone (an option, no corequisite
// it lacks), or brute force over the mandatory courses only when that is small enough to enumerate (otherwise it cannot tell: false).
export function fits(data, courses, statuses) {
  const must = courses.filter((c) => c.mode === 'must');
  if (!must.length)
    return courses.some((c) => buildOptions(data.courses[c.id]).length && !statuses[c.id]?.missingParallel?.length);
  return must.reduce((n, c) => n * buildOptions(data.courses[c.id]).length, 1) <= 2e5 && bestCredits(data, must, statuses) > 0;
}

const candidates = (data, statuses, yearList) =>
  Object.keys(data.courses)
    .map((id) => ({ id, mode: modeFor(statuses[id]?.status, undefined, yearList.has(id)) }))
    .filter((c) => c.mode === 'must' || c.mode === 'optional');
const run = (data, statuses, courses, constraints, timeLimitMs, solve = search) =>
  solve({ data, courses, statuses, constraints, weights: DEFAULT.weights, friends: [], topK: 5, timeLimitMs });

// Every check for one semester file: classify against the oracle, a pass never blocks, each plan against the record, and the
// metamorphic relations on the best plan. Returns failure lines (file, scenario, seed, ids).
export function checkFile(file, data, { scenarios: only = null, seed = 1, timeLimitMs = 1500, solve = search } = {}) {
  const out = [],
    C = structuredClone(DEFAULT.constraints);
  for (const { name, state, yearList } of scenarios(data, seed)) {
    if (only && !only.some((o) => name.startsWith(o))) continue;
    const at = `${file} ${name} seed ${seed}`,
      st = classify(data, state).statuses,
      want = oracle(data, state);
    for (const id of Object.keys(want))
      if (st[id]?.status !== want[id]) out.push(`${at}: classify ${id} = ${st[id]?.status}, oracle ${want[id]}`);
    // monotone: one more pass never turns an open course into a blocked one
    const open = Object.keys(st).filter((id) => ['available', 'conditional', 'retake'].includes(st[id].status));
    for (const y of Object.keys(data.courses).filter((id) => !state.passed.includes(id)).slice(0, 3)) {
      const after = classify(data, { ...state, passed: [...state.passed, y] }).statuses;
      for (const id of open) if (after[id].status === 'blocked') out.push(`${at}: passing ${y} blocks ${id}`);
    }
    const courses = candidates(data, st, yearList);
    if (!courses.length) continue;
    const r = run(data, st, courses, C, timeLimitMs, solve);
    for (const p of r.results) out.push(...checkPlan(data, state, p, C).map((e) => `${at}: ${e}`));
    const loose = { ...C, includeFull: true, blocks: [], maxCredits: null, maxDays: null, dayOffHard: false, windowHard: false };
    if (!r.results.length) {
      if (!r.diagnosis?.length) out.push(`${at}: no plan and no reason given`);
      // a complete "no plan" is checked: relaxed together the constraints give a plan, or the courses really cannot fit. A cut-off
      // search says it could not tell.
      if (!r.partial && !run(data, st, courses, loose, timeLimitMs, solve).results.length && fits(data, courses, st))
        out.push(`${at}: no plan, but brute force finds one`);
      continue;
    }
    const best = r.results[0];
    const m = Object.values(data.courses).flatMap((c) => c.groups).find((g) => best.groups.includes(g.id) && g.meetings.length)?.meetings[0];
    if (m) {
      const busy = { ...C, blocks: [...C.blocks, { day: m.day, start: m.start, end: m.end, label: 'check' }] };
      for (const p of run(data, st, courses, busy, timeLimitMs, solve).results.slice(0, 1))
        out.push(...checkPlan(data, state, p, busy).map((e) => `${at} busy over ${m.day} ${m.start}: ${e}`));
    }
    // shuffled course and group order: the best plan stays valid; complete searches on both sides find the same best score
    const shuffled = {
      ...data,
      courses: Object.fromEntries(Object.entries(data.courses).reverse().map(([id, c]) => [id, { ...c, groups: [...c.groups].reverse() }]))
    };
    const rs = run(shuffled, st, [...courses].reverse(), C, timeLimitMs, solve);
    if (!rs.results.length) out.push(`${at}: shuffled order finds no plan`);
    else {
      out.push(...checkPlan(shuffled, state, rs.results[0], C).map((e) => `${at} shuffled: ${e}`));
      if (!r.partial && !rs.partial && Math.abs(rs.results[0].score - best.score) > 1e-6)
        out.push(`${at}: shuffled order changes the best score ${best.score} -> ${rs.results[0].score}`);
    }
    // relaxing constraints never loses the last plan (feasibility only: relaxing changes what the score weighs)
    if (!run(data, st, courses, loose, timeLimitMs, solve).results.length) out.push(`${at}: relaxing the constraints loses every plan`);
  }
  return out;
}

// "Most credits" / "most unlocks" year order, recomputed from the data rather than the plans' own totals or compareYearPlans:
// fewer missing mandatory courses first, then the year's credits (or the courses it opens: not passed, not in the plan, below a
// planned course through prerequisites, in either semester), more first. Other keys are not checked. Returns failure lines.
export function yearOrder(dataA, dataB, state, results, sortBy) {
  if (sortBy !== 'credits' && sortBy !== 'unlocks') return [];
  const below = (d) => {
    const rev = {};
    for (const [id, c] of Object.entries(d.courses))
      for (const p of c.prereqs) if (p.kind === 'קדם') for (const a of p.anyOf) if (a.id) (rev[a.id] ??= new Set()).add(id);
    return rev;
  };
  const revs = [below(dataA), below(dataB)],
    passed = new Set(state.passed ?? []);
  const total = (p) => {
    const ids = [...p.a.courses, ...(p.b?.courses ?? [])];
    if (sortBy === 'credits')
      return p.a.courses.reduce((s, id) => s + dataA.courses[id].credits, 0) + (p.b?.courses ?? []).reduce((s, id) => s + dataB.courses[id].credits, 0);
    const opened = new Set();
    for (const rev of revs) {
      // each semester's file on its own, as the year view reads them
      const seen = new Set(), stack = [...ids];
      while (stack.length) for (const x of rev[stack.pop()] ?? []) if (!seen.has(x)) seen.add(x), stack.push(x);
      seen.forEach((x) => opened.add(x));
    }
    return [...opened].filter((x) => !ids.includes(x) && !passed.has(x)).length;
  };
  const out = [];
  for (let i = 1; i < results.length; i++) {
    const [x, y] = [results[i - 1], results[i]],
      worse = x.missing.length - y.missing.length || total(y) - total(x);
    if (worse > 0) out.push(`results ${i - 1} and ${i} out of order (${sortBy})`);
  }
  return out;
}

// Small exhaustive cases: the courses and groups in reverse order give the same set of timetables (a plan read as each course's
// meetings, so interchangeable groups compare equal). Not told apart when either search is cut off or fills topK. Failure lines.
export function shuffleSame(data, statuses, courses, solve = search) {
  const topK = 1e4,
    key = (d, p) => p.courses.map((id) => `${id}:${d.courses[id].groups.filter((g) => p.groups.includes(g.id))
      .flatMap((g) => g.meetings.map((m) => `${m.day} ${m.start}-${m.end}`)).sort().join(',')}`).sort().join('|');
  const shuffled = {
    ...data,
    courses: Object.fromEntries(Object.entries(data.courses).reverse().map(([id, c]) => [id, { ...c, groups: [...c.groups].reverse() }]))
  };
  const go = (d, cs) => solve({ data: d, courses: cs, statuses, weights: DEFAULT.weights, friends: [], topK, timeLimitMs: 5000 });
  const r = go(data, courses), rs = go(shuffled, [...courses].reverse());
  if (r.partial || rs.partial || r.results.length >= topK || rs.results.length >= topK) return [];
  const a = new Set(r.results.map((p) => key(data, p))), b = new Set(rs.results.map((p) => key(shuffled, p)));
  return a.size === b.size && [...a].every((k) => b.has(k)) ? [] : [`shuffled order: ${a.size} timetables, then ${b.size}`];
}

// The year view for one cohort (א and ב files): every pair checked, and "most credits" / "most unlocks" ordered by the year's totals.
export function checkYear(file, dataA, dataB, { seed = 1, timeLimitMs = 3000 } = {}) {
  const out = [];
  for (const { name, state, yearList } of scenarios(dataA, seed).slice(0, 2))
    for (const sortBy of ['credits', 'unlocks']) {
      const at = `${file} year ${name} ${sortBy}`;
      const r = searchYear({
        dataA, dataB, state: { ...state, sortBy }, yearList, constraints: DEFAULT.constraints,
        weights: { ...DEFAULT.weights, [sortBy]: 1e5 }, friends: [], timeLimitMs
      });
      for (const p of r.results)
        out.push(...checkYearPlan({ dataA, dataB, state, plan: p, constraints: DEFAULT.constraints }).map((e) => `${at}: ${e}`));
      out.push(...yearOrder(dataA, dataB, state, r.results, sortBy).map((e) => `${at}: ${e}`));
      if (!r.results.length && !r.diagnosis?.length) out.push(`${at}: no year plan and no reason given`);
    }
  return out;
}

function main() {
  const t0 = Date.now(),
    all = process.argv.includes('--all'),
    bySem = dataFiles();
  const errors = [],
    warnings = [];
  for (const files of Object.values(bySem)) {
    for (const [file, d] of files) {
      const r = dataRules(d, file);
      errors.push(...r.errors);
      warnings.push(...r.warnings, ...changedSinceHead(file, d));
    }
    warnings.push(...crossProgram(files));
  }
  const n = Object.values(bySem).flat().length;
  console.log(`data rules: ${n} files, ${errors.length} error(s), ${warnings.length} warning(s), ${Date.now() - t0} ms`);
  for (const e of errors) console.log(`ERROR ${e}`);
  const kinds = Object.groupBy(warnings, (w) => w.split(':')[0]);
  for (const [k, ws] of Object.entries(kinds)) {
    console.log(`warning "${k}": ${ws.length}`);
    for (const w of all ? ws : ws.slice(0, 5)) console.log(`  ${w}`);
  }
  // layer 3: every semester file alone, then every cohort's year (א + ב of the same file name)
  const t1 = Date.now(),
    fails = [];
  for (const files of Object.values(bySem)) for (const [file, d] of files) fails.push(...checkFile(file, d));
  const sems = Object.keys(bySem).sort(),
    [a, b] = sems,
    byName = new Map((bySem[b] ?? []).map(([f, d]) => [f.split('/')[1], d]));
  for (const [file, dA] of bySem[a] ?? []) if (byName.has(file.split('/')[1])) fails.push(...checkYear(file, dA, byName.get(file.split('/')[1])));
  console.log(`solver and record: ${n} files, ${fails.length} failure(s), ${Date.now() - t1} ms`);
  for (const f of fails) console.log(`FAIL ${f}`);
  return errors.length || fails.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
