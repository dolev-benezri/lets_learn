// opts-01  buildOptions() against an independent oracle, on EVERY course of all 144 data files.
// Targets: web/solver-core.js:54-102 (buildOptions), 59-66 (dedup into alts), 69-78 (grow), 81 (includeFull), 85-96 (option fields).
// Data semantics the oracle is derived from: scripts/parse.mjs:57 (primary = type starts with 'סופי'), :53,:60 (linked = "קבוצות הקשורות לקורס זה"),
//   scripts/build.mjs:15-19 (a group without meetings or from another semester is dropped, links to dropped groups are removed).
// Oracle: solver-audit/repro/opts-lib.mjs oracleRegistrations() = brute force over subsets of the primary's reachable closure,
//   accepting S iff (O1) exactly one primary, (O2) per member and per linked type exactly one linked group of that type, (O3) every member reachable from the primary.
// Run:  node solver-audit/repro/opts-01-oracle-all-data.mjs      (any cwd, ~3 s; the timing line is wall-clock and informational)
// Proves: CHECK lines PASS = buildOptions agrees with the oracle on all real data (so real-data defects, if any, are in the data/source, not in grow()).
//         The CHECK on "preconditions" proves that the inputs on which grow() diverges (opts-05) do not occur in the 144 files.
import { buildOptions } from '../../web/solver-core.js';
import { loadAll, check, finish, note, g, oracleOptions, multisetKey, setKey, twinKey, isPrimaryType, clash, mins } from './opts-lib.mjs';

const all = loadAll();
const instances = all.reduce((a, f) => a + Object.keys(f.data.courses).length, 0);
check('opts-C01', all.length === 144, `${all.length} files, ${instances} course instances`);

// structure identity: the groups of a (semester, course) are identical in every program file (verified below), so oracle results are cached
const structKey = (sem, id, c) => `${sem}/${id}/${JSON.stringify(c.groups)}`;
const oracleCache = new Map();
const perSem = new Map();
let flagBad = 0, mism = 0, mismFull = 0, mismEx = [], t0 = Date.now(), nOpts = 0, maxOpts = 0, maxOptsAt = '';
const structure = new Set();
let dupInOpt = 0, dupOpt = 0, notOnePrimary = 0, o2bad = 0, altBad = 0, lostPrimary = 0, selfClash = 0, minutesBad = 0, maskBad = 0, meetingTagBad = 0, sharedLinkInOption = 0;
let outOfWindow = 0, badDay = 0, dupLinks = 0, selfLinks = 0, missingLinks = 0, subLinksPrimary = 0, cycles = 0;
const variantsBySem = new Map();

for (const { sem, file, data } of all) {
  for (const [cid, c] of Object.entries(data.courses)) {
    const sk = `${sem}/${cid}`;
    if (!variantsBySem.has(sk)) variantsBySem.set(sk, new Set());
    variantsBySem.get(sk).add(JSON.stringify(c.groups));
    const byId = new Map(c.groups.map((x) => [x.id, x]));
    for (const x of c.groups) {
      if (x.primary !== isPrimaryType(x.type)) flagBad++;
      if (new Set(x.linked).size !== x.linked.length) dupLinks++;
      if (x.linked.includes(x.id)) selfLinks++;
      for (const l of x.linked) { if (!byId.has(l)) missingLinks++; else if (byId.get(l).primary) subLinksPrimary++; }
      for (const m of x.meetings) {
        if (!(m.day >= 1 && m.day <= 6)) badDay++;
        if (mins(m.start) < 7 * 60 || mins(m.end) > 23 * 60) outOfWindow++;
      }
    }
    // cycles in the link graph (DFS colouring)
    const colour = new Map();
    const dfs = (id) => { colour.set(id, 1); for (const l of byId.get(id)?.linked ?? []) { if (colour.get(l) === 1) cycles++; else if (!colour.has(l)) dfs(l); } colour.set(id, 2); };
    for (const x of c.groups) if (!colour.has(x.id)) dfs(x.id);

    const k = structKey(sem, cid, c);
    for (const includeFull of [true, false]) {
      const got = buildOptions(c, { includeFull });
      const ck = `${k}/${includeFull}`;
      if (!oracleCache.has(ck)) oracleCache.set(ck, multisetKey(oracleOptions(c.groups, { includeFull })));
      if (multisetKey(got.map((o) => o.groups)) !== oracleCache.get(ck)) { if (includeFull) mism++; else mismFull++; if (mismEx.length < 5) mismEx.push(`${file}#${cid} includeFull=${includeFull}`); }
      if (!includeFull) continue;
      nOpts += got.length;
      if (got.length > maxOpts) { maxOpts = got.length; maxOptsAt = `${sem}/${file}#${cid}`; }
      const seenSets = new Set();
      const altIds = new Set(got.flatMap((o) => Object.values(o.alts).flat()));
      for (const o of got) {
        if (new Set(o.groups).size !== o.groups.length) dupInOpt++;
        if (seenSets.has(setKey(o.groups))) dupOpt++; seenSets.add(setKey(o.groups));
        if (o.groups.filter((id) => byId.get(id).primary).length !== 1 || !byId.get(o.groups[0]).primary) notOnePrimary++;
        for (const id of o.groups) {                     // independent re-check of O2 on the solver's own output
          const x = byId.get(id);
          for (const T of new Set(x.linked.map((l) => byId.get(l).type))) if (x.linked.filter((l) => byId.get(l).type === T && o.groups.includes(l)).length !== 1) o2bad++;
        }
        for (let i = 0; i < o.groups.length; i++) for (let j = i + 1; j < o.groups.length; j++) {  // precondition of the shared-sub-group divergence
          const a = byId.get(o.groups[i]), b = byId.get(o.groups[j]);
          if (a.linked.some((l) => b.linked.includes(l))) sharedLinkInOption++;
        }
        const ms = o.groups.flatMap((id) => byId.get(id).meetings.map((m) => ({ ...m, group: id })));
        for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) if (clash(ms[i], ms[j])) selfClash++;
        if (o.minutes !== ms.reduce((a, m) => a + mins(m.end) - mins(m.start), 0)) minutesBad++;
        if (JSON.stringify(o.meetings.map((m) => [m.group, m.day, m.start, m.end])) !== JSON.stringify(ms.map((m) => [m.group, m.day, m.start, m.end]))) meetingTagBad++;
        // mask: slot s of a day is set iff some meeting intersects [07:00+30s, 07:00+30(s+1)) -- minute-interval rule, no floor/ceil
        const exp = [0, 0, 0, 0, 0, 0, 0];
        for (const m of ms) for (let s = 0; s < 32; s++) { const lo = 420 + 30 * s; if (mins(m.start) < lo + 30 && lo < mins(m.end)) exp[m.day] |= 1 << s; }
        if (exp.some((v, d) => v !== o.mask[d])) maskBad++;
      }
      for (const p of c.groups.filter((x) => x.primary)) {
        const inOpt = got.some((o) => o.groups[0] === p.id), isAlt = altIds.has(p.id);
        if (!inOpt && !isAlt) lostPrimary++;
        if (isAlt) { const rep = got.find((o) => (o.alts[o.groups[0]] ?? []).includes(p.id)); if (twinKey(byId.get(rep.groups[0])) !== twinKey(p)) altBad++; }
        if (inOpt && isAlt) altBad++;
      }
    }
  }
}
const ms = Date.now() - t0;
const multi = [...variantsBySem.values()].filter((s) => s.size > 1).length;
check('opts-C02', flagBad === 0, `groups whose primary flag disagrees with type.startsWith('סופי'): ${flagBad}`);
check('opts-C03', multi === 0 && variantsBySem.size === 1245, `(semester,course) pairs: ${variantsBySem.size}; pairs whose groups differ between program files: ${multi}`);
check('opts-C04', mism === 0, `buildOptions(includeFull:true) vs oracle: ${mism} mismatching course instances ${mismEx.join(', ')}`);
check('opts-C05', mismFull === 0, `buildOptions(includeFull:false) vs oracle: ${mismFull} mismatching course instances`);
check('opts-C06', dupInOpt === 0 && dupOpt === 0 && notOnePrimary === 0 && o2bad === 0, `options=${nOpts} (distinct course-instances x options): duplicate group inside an option ${dupInOpt}, duplicate option ${dupOpt}, option without exactly one leading primary ${notOnePrimary}, missing/extra required sub-group ${o2bad}`);
check('opts-C07', altBad === 0 && lostPrimary === 0, `alts: every primary is an option head or exactly one alt (lost ${lostPrimary}), alt twins really identical per twinKey (bad ${altBad})`);
check('opts-C08', selfClash === 0, `pairs of meetings of ONE option that overlap in minutes (student could not attend): ${selfClash}`);
check('opts-C09', minutesBad === 0 && meetingTagBad === 0 && maskBad === 0, `option.minutes wrong ${minutesBad}, option.meetings wrong ${meetingTagBad}, option.mask != minute-interval slot rule ${maskBad}`);
check('opts-C10', outOfWindow === 0 && badDay === 0, `meetings outside 07:00-23:00: ${outOfWindow}, day outside 1..6: ${badDay} (solver-core.js:10 clamp / :14 'continue' never hit)`);
check('opts-C11', dupLinks === 0 && selfLinks === 0 && missingLinks === 0 && subLinksPrimary === 0 && cycles === 0 && sharedLinkInOption === 0,
  `inputs on which grow() misbehaves (opts-05) in real data: duplicate ids in linked ${dupLinks}, self-links ${selfLinks}, links to missing ids ${missingLinks}, a sub-group linking a primary ${subLinksPrimary}, link cycles ${cycles}, two members of ONE registration linking a common group ${sharedLinkInOption}`);
check('opts-C12', maxOpts <= 64, `largest real course has ${maxOpts} options (${maxOptsAt}); all ${instances * 2} buildOptions calls took ${ms} ms wall-clock (informational)`);

// the oracle itself must be trustworthy: hand-derived expectations on a tiny course (lecture L -> tutorials T1,T2; T1 -> lab X)
const tiny = [g('L', 'סופי-הרצאה+תרגול', { linked: ['T1', 'T2'] }), g('T1', 'תרגול', { linked: ['X'] }), g('T2', 'תרגול'), g('X', 'מעבדה')];
check('opts-C13', multisetKey(oracleOptions(tiny)) === multisetKey([['L', 'T1', 'X'], ['L', 'T2']]), 'oracle on L->{T1->X, T2} yields exactly {L,T1,X} and {L,T2}');
note(`distinct (semester,course) structures checked by the oracle: ${oracleCache.size / 2}`);
finish();
