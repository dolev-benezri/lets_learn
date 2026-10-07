// year-proto-lib.mjs - builds an instrumented COPY of web/solver-core.js (never edits web/) with prototype fixes for F-11 / F-12.
// Knobs are read from globalThis at call time:
//   __B_K          B search asks for K plans per A alternative (default 1 = as today); the pair with the best PAIR score is kept (one pair per A)
//   __A_DEDUP      1 = A alternatives are reduced to one per course set (best group variant) before B runs
//   __A_TOP        replaces A_TOP (50)
//   __SEEDS        'orig' (default) | 'fix' (skip all-outside prereq groups, seed every anyOf candidate) | 'off'
//   __RELAX_PINS   1 = relax() keeps the pins of musts that stay must (only lifts a pin when its own course is relaxed) + warns on lift
//   __CAPTURE      object: receives { aList }
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = new URL('./', import.meta.url);
function patch(src, from, to) {
  const n = src.split(from).length - 1;
  if (n !== 1) throw new Error(`proto: expected exactly 1 match for ${JSON.stringify(from)}, found ${n}`);
  return src.replace(from, () => to);
}
let counter = 0;
export async function loadProto(extra = (s) => s) {
  let src = fs.readFileSync(new URL('../../web/solver-core.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  src = patch(src, "from './rules.js'", "from '../../web/rules.js'");
  src = patch(src, 'topK: A_TOP, timeLimitMs: timeLimitMs * A_SHARE', 'topK: globalThis.__A_TOP ?? A_TOP, timeLimitMs: timeLimitMs * A_SHARE');
  // ---- F-11 B: K plans per A, choose by pair score
  src = patch(src, 'pinnedB(c.id) ? { ...c, mode: \'must\' } : c));\n    const left', 'pinnedB(c.id) ? { ...c, mode: \'must\' } : c));\n    const left');
  src = patch(src, 'friends, topK: 1, timeLimitMs: left };', 'friends, topK: globalThis.__B_K ?? 1, timeLimitMs: left };');
  src = patch(src, '    const b = rb.results[0] ?? null;\n', '    let bestPair = null;\n    for (const b of rb.results.length ? rb.results : [null]) {\n');
  src = patch(src, '    pairs.push({\n      score:', '    const pr = {\n      score:');
  src = patch(src, '    });\n  }\n  pairs.sort', '    };\n    if (!bestPair || pr.score > bestPair.score) bestPair = pr;\n    }\n    if (bestPair) pairs.push(bestPair);\n  }\n  pairs.sort');
  // ---- F-11 A: one alternative per course set
  src = patch(src, 'const aList = [...seeds, ...ra.results];',
    'let aList = [...seeds, ...ra.results];\n  if (globalThis.__A_DEDUP) { const s2 = new Set(); aList = aList.filter((a) => (s2.has(key(a)) ? false : s2.add(key(a)))); }');
  src = patch(src, 'for (const [i, a] of aList.entries()) {', 'if (globalThis.__CAPTURE) globalThis.__CAPTURE.aList = aList;\n  for (const [i, a] of aList.entries()) {');
  // ---- F-12 seeds
  src = patch(src, 'for (const m of must) {', "for (const m of (globalThis.__SEEDS === 'off' ? [] : must)) {");
  src = patch(src, `    const need = (dataB.courses[m]?.prereqs ?? []).filter((p) => p.kind === 'קדם' && !p.anyOf.some(settled)).map((p) => p.anyOf.find((x) => inA.has(x.id))?.id);
    if (!need.length || need.includes(undefined)) continue;
    const r = search({ ...argsA, courses: coursesA.map((c) => (need.includes(c.id) ? { ...c, mode: 'must' } : c)), topK: 1, timeLimitMs: Math.max(B_FLOOR,
      (deadline - Date.now()) / (must.size + 1)) });
    partial ||= r.partial;
    const s = r.results[0];
    if (s && !seen.has(key(s))) { seen.add(key(s)); seeds.push(s); }
`, `    const open = (dataB.courses[m]?.prereqs ?? []).filter((p) => p.kind === 'קדם' && !p.anyOf.some(settled));
    if (globalThis.__SEEDS === 'fix') {
      const groups = open.filter((p) => !p.anyOf.every((x) => x.id === null)).map((p) => p.anyOf.filter((x) => inA.has(x.id)).map((x) => x.id));
      if (!groups.length || groups.some((g) => !g.length)) continue;
      // one seed search per combination of one candidate from each open anyOf group
      const combos = groups.reduce((acc, g) => acc.flatMap((c) => g.map((x) => [...c, x])), [[]]);
      for (const need of combos) {
        const r = search({ ...argsA, courses: coursesA.map((c) => (need.includes(c.id) ? { ...c, mode: 'must' } : c)), topK: 1, timeLimitMs: Math.max(B_FLOOR,
          (deadline - Date.now()) / (must.size * combos.length + 1)) });
        partial ||= r.partial;
        const s = r.results[0];
        if (s && !seen.has(key(s))) { seen.add(key(s)); seeds.push(s); }
      }
      continue;
    }
    const need = open.map((p) => p.anyOf.find((x) => inA.has(x.id))?.id);
    if (!need.length || need.includes(undefined)) continue;
    const r = search({ ...argsA, courses: coursesA.map((c) => (need.includes(c.id) ? { ...c, mode: 'must' } : c)), topK: 1, timeLimitMs: Math.max(B_FLOOR,
      (deadline - Date.now()) / (must.size + 1)) });
    partial ||= r.partial;
    const s = r.results[0];
    if (s && !seen.has(key(s))) { seen.add(key(s)); seeds.push(s); }
`);
  // ---- F-11 A: distinct-by-course-set top-K inside search() (prototype of option B)
  src = patch(src, 'prune = true, bias = {} }) {', 'prune = true, bias = {}, distinct = false }) {');
  src = patch(src, 'topK: globalThis.__A_TOP ?? A_TOP, timeLimitMs: timeLimitMs * A_SHARE', 'topK: globalThis.__A_TOP ?? A_TOP, distinct: !!globalThis.__A_DISTINCT, timeLimitMs: timeLimitMs * A_SHARE');
  src = patch(src, `    if (top.length === topK && score <= top[top.length - 1].score) return;
`,
    `    if (top.length === topK && score <= top[top.length - 1].score) return;
    const same = distinct ? top.findIndex((t) => t.courses.length === chosen.size && t.courses.every((id) => chosen.has(id))) : -1;
    if (same >= 0) { if (score <= top[same].score) return; top.splice(same, 1); }
`);
  // ---- F-12 pins: a pair whose ב׳ plan holds a pinned course in another group says so
  src = patch(src, '    const yearProgress =', `    const kept = (id) => dataB.courses[id].groups.some((g) => pins.includes(g.id) && b.groups.includes(g.id));
    const regrouped = !globalThis.__RELAX_PINS || !b ? [] : b.courses.filter((id) => pinnedB(id) && !kept(id)).map((id) => \`הנעיצה של \${dataB.courses[id].name} (ב׳) לא נשמרה: הקורס בקבוצה אחרת\`);
    const yearProgress =`);
  src = patch(src, "      warnings: needs.length ? [`התכנון של ב׳ מניח שעוברים את ${needs.map(name).join(', ')} בא׳`] : [],",
    "      warnings: [...(needs.length ? [`התכנון של ב׳ מניח שעוברים את ${needs.map(name).join(', ')} בא׳`] : []), ...regrouped],");
  // ---- F-11 relax: pool the results of every successful relax try, the pair score picks (knob __RELAX_ALL)
  src = patch(src, 'return tries.filter((r) => r.results.length).sort((x, y) => y.results[0].score - x.results[0].score)[0];',
    `const ok = tries.filter((r) => r.results.length);
        return globalThis.__RELAX_ALL ? (ok.length ? { results: ok.flatMap((r) => r.results) } : undefined) : ok.sort((x, y) => y.results[0].score - x.results[0].score)[0];`);
  src = extra(src);
  const out = new URL(`year-proto.generated.${process.pid}.mjs`, HERE);
  fs.writeFileSync(out, `// GENERATED by year-proto-lib.mjs from web/solver-core.js - do not edit.\n${src}`);
  return import(pathToFileURL(fileURLToPath(out)).href + `?t=${Date.now()}_${counter++}`);
}
export const setKnobs = (k) => { for (const key of ['__B_K', '__A_DEDUP', '__A_TOP', '__A_DISTINCT', '__SEEDS', '__RELAX_PINS', '__RELAX_ALL', '__CAPTURE']) delete globalThis[key]; Object.assign(globalThis, k); };
