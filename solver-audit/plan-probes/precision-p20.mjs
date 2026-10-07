// precision-p20.mjs - F-20: does clamping the lesson duration at 0 make the pruning bound admissible for malformed data (end < start)?
// Variants of the CURRENT solver-core.js (no other change): 'current' | 'clamp' (const dur = (m) => Math.max(0, toMin(m.end) - toMin(m.start))).
// Uses the repro's own malformed instance (search-negative-duration.mjs SN-3) and generator seed sweep (SN-4, malformed:true).
// RUN: node solver-audit/plan-probes/precision-p20.mjs
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mulberry32, genInstance, referenceSolve, compareTopK, tagResults } from '../repro/search-lib.mjs';
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const orig = fs.readFileSync(here('../../web/solver-core.js'), 'utf8').replace(/\r\n/g, '\n').replace("from './rules.js'", "from '../../web/rules.js'");
const mk = async (tag, from, to) => {
  let s = orig; if (from) { if (s.split(from).length !== 2) throw new Error('anchor'); s = s.replace(from, to); }
  const f = here(`./p20-${tag}.generated.mjs`); fs.writeFileSync(f, s); return (await import(pathToFileURL(f).href)).search;
};
const cur = await mk('current'), clamp = await mk('clamp', 'const dur = (m) => toMin(m.end) - toMin(m.start);', 'const dur = (m) => Math.max(0, toMin(m.end) - toMin(m.start));');
const grp = (id, day, start, end) => ({ id, type: 'הרצאה', primary: true, lecturer: 'L' + id, full: false, semester: 'א', linked: [], meetings: [{ day, start, end, room: 'r' }], exams: [] });
const course = (id, groups) => ({ name: id, credits: 3, offered: true, prereqs: [], groups });
const data = { semester: 'א', year: 2027, startYear: 2026, examsPublished: false, courses: {
  C0: course('C0', [grp('G0', 2, '11:00', '12:50')]), C1: course('C1', [grp('G1', 1, '11:00', '10:50'), grp('G2', 2, '09:00', '10:50')]), C2: course('C2', [grp('G3', 1, '10:00', '11:50')]) } };
const base = { data, courses: [{ id: 'C0', mode: 'optional' }, { id: 'C1', mode: 'must' }, { id: 'C2', mode: 'must' }], friends: [{ name: 'F', groups: ['G0', 'G2', 'G3'], weight: 1, active: true }],
  weights: { friends: 5, progress: 0, freeDays: 0, compact: 0, timeWindow: 0, examSpread: 0 }, constraints: {}, topK: 1, timeLimitMs: 1e9 };
for (const [name, fn] of [['current', cur], ['clamp', clamp]]) {
  const a = fn({ ...base, prune: true }).results[0].score, b = fn({ ...base, prune: false }).results[0].score;
  console.log(`${name}: SN-3 minimal instance prune:true ${a} vs prune:false ${b} -> ${Math.abs(a - b) > 1e-9 ? 'prune LOSES the optimum' : 'equal'}`);
}
for (const [name, fn] of [['current', cur], ['clamp', clamp]]) {
  let bad = 0, n = 0;
  for (let seed = 1; seed <= 700; seed++) {
    const inst = genInstance(mulberry32(seed * 7919), { malformed: true });
    const p = fn({ ...inst, timeLimitMs: 1e9, prune: true }), q = fn({ ...inst, timeLimitMs: 1e9, prune: false });
    n++; if (compareTopK(tagResults(p.results, inst.data), { sols: tagResults(q.results, inst.data).map((r) => ({ key: r.key, score: r.score, m: r.breakdown })), }, inst.topK).length) bad++;
  }
  console.log(`${name}: malformed generator (end<start allowed), prune:true vs prune:false top-K differs in ${bad}/${n} instances`);
}
