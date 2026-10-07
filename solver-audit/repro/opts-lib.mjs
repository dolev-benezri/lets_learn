// Shared helpers for the opts-* audit scripts (domain: buildOptions() / byLecturer() in web/solver-core.js).
// Not a test and not meant to be run alone (node solver-audit/repro/opts-lib.mjs prints nothing).
// Contents: reporter (CHECK/BUG lines + exit code), data loaders, synthetic course builders, and an INDEPENDENT oracle
// for "what is a valid registration of one course", derived from the data-source semantics (scripts/parse.mjs:57 primary =
// type starts with 'סופי'; parse.mjs:53,60 linked = "קבוצות הקשורות לקורס זה") and NOT from the solver's grow() recursion.
import fs from 'node:fs';

// ---------- reporter ----------
let failed = 0;
export const check = (id, ok, detail = '') => { console.log(`CHECK ${id} ${ok ? 'PASS' : 'FAIL'} ${detail}`); if (!ok) failed++; return ok; };
export const bug = (id, reproduced, detail = '') => { console.log(`BUG ${id} ${reproduced ? 'REPRODUCED' : 'NOT-REPRODUCED'} ${detail}`); if (!reproduced) failed++; return reproduced; };
export const note = (s) => console.log(`NOTE ${s}`);
export const finish = () => { process.exitCode = failed ? 1 : 0; console.log(`# exit code ${process.exitCode} (${failed} line(s) not as asserted)`); };

// ---------- data ----------
const DATA = new URL('../../web/data/afeka/', import.meta.url);
export const dataFiles = () => fs.readdirSync(DATA).filter((s) => /^2027-\d$/.test(s))
  .flatMap((sem) => fs.readdirSync(new URL(`${sem}/`, DATA)).filter((f) => f.endsWith('.json')).map((f) => ({ sem, file: f, path: new URL(`${sem}/${f}`, DATA) })));
export const loadAll = () => dataFiles().map((f) => ({ ...f, data: JSON.parse(fs.readFileSync(f.path, 'utf8')) }));
export const readLocal = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

// ---------- synthetic courses (same shape as web/data/afeka/<sem>/<program>.json courses) ----------
// g(id, type, {lecturer, full, linked, m: [[day,start,end,room?],...], exams, semester})
export const g = (id, type, o = {}) => ({
  id, type, primary: type.startsWith('סופי'), lecturer: o.lecturer ?? 'L', full: !!o.full, semester: o.semester ?? 'א', linked: o.linked ?? [],
  meetings: (o.m ?? [[1, '08:00', '09:50']]).map(([day, start, end, room]) => ({ day, start, end, room: room ?? 'r' })), exams: o.exams ?? [],
});
export const course = (...groups) => ({ name: 'synthetic', credits: 3, offered: true, prereqs: [], groups });
export const dataOf = (courses, extra = {}) => ({ fetchedAt: 'x', year: 2027, startYear: 2026, program: 1, semester: 'א', examsPublished: false, lists: [], courses, ...extra });

// ---------- oracle: declarative definition of a valid registration ----------
// A registration S of one course is a set of group ids such that
//   O1  S contains exactly one primary group;
//   O2  for every member x and every TYPE T that occurs among x's linked groups, exactly one member of S is both linked by x and of type T
//       (the student attends one tutorial of the lecture, one lab of the tutorial ...);
//   O3  every non-primary member is reachable from the primary through "linked" edges that stay inside S (nothing is attended for no reason).
// Enumerated by brute force over all subsets of the primary's reachable closure, so it shares no logic with grow().
export const isPrimaryType = (type) => type.startsWith('סופי');
export function oracleRegistrations(groups, primaryId, limit = 18) {
  const byId = new Map(groups.map((x) => [x.id, x]));
  const closure = [primaryId], seen = new Set(closure);
  for (let i = 0; i < closure.length; i++) for (const id of byId.get(closure[i]).linked) if (byId.has(id) && !seen.has(id)) { seen.add(id); closure.push(id); }
  const rest = closure.slice(1);
  if (rest.length > limit) throw new Error(`oracle: closure of ${primaryId} has ${rest.length} groups`);
  const out = [];
  for (let bits = 0; bits < (1 << rest.length); bits++) {
    const S = new Set([primaryId, ...rest.filter((_, i) => bits >> i & 1)]);
    if ([...S].filter((id) => isPrimaryType(byId.get(id).type)).length !== 1) continue;                       // O1
    let ok = true;
    for (const id of S) {
      const types = new Set(byId.get(id).linked.filter((l) => byId.has(l)).map((l) => byId.get(l).type));
      for (const T of types) {                                                                                  // O2
        const n = byId.get(id).linked.filter((l) => byId.has(l) && byId.get(l).type === T && S.has(l)).length;
        if (n !== 1) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (!ok) continue;
    const reach = new Set([primaryId]), q = [primaryId];                                                        // O3
    for (let i = 0; i < q.length; i++) for (const l of byId.get(q[i]).linked) if (S.has(l) && !reach.has(l)) { reach.add(l); q.push(l); }
    if (reach.size !== S.size) continue;
    out.push([...S]);
  }
  return out;
}
// Identical primaries are one registration with alternatives (what the dedup in buildOptions claims). Oracle-side key, written from the field list only.
export const twinKey = (x, extra = '') => [x.type, x.lecturer, x.full, x.linked.join(','), x.meetings.map((m) => `${m.day}@${m.start}-${m.end}@${m.room}`).join(';'), extra].join('#');
export function oracleOptions(groups, { includeFull = true, pins = [] } = {}) {
  const reps = []; const seen = new Set();
  for (const x of groups.filter((y) => isPrimaryType(y.type))) { const k = twinKey(x, pins.includes(x.id) ? 'PIN' : ''); if (!seen.has(k)) { seen.add(k); reps.push(x.id); } }
  const byId = new Map(groups.map((x) => [x.id, x]));
  const out = [];
  for (const id of reps) for (const S of oracleRegistrations(groups, id)) {
    if (!includeFull && S.some((s) => byId.get(s).full && !pins.includes(s))) continue;
    out.push(S);
  }
  return out;
}
export const setKey = (ids) => [...ids].sort().join('+');
export const multisetKey = (list) => list.map(setKey).sort().join(' | ');

// ---------- minutes ----------
export const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const clash = (a, b) => a.day === b.day && mins(a.start) < mins(b.end) && mins(b.start) < mins(a.end);
// mulberry32 for deterministic randomness
export const rng = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
