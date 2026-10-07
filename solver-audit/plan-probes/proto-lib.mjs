// proto-lib.mjs - builds an instrumented PROTOTYPE copy of web/solver-core.js with the proposed F-04/F-05/F-14/F-18 change.
// The live file is only read. Every patch is asserted to apply exactly once (so a refactor of solver-core.js fails loudly).
// buildProto({ gap, f18, hooks, tag }) -> { mod, file, patches, changed }
//   gap: 'slot' (keep the 30-minute gap), 'g2' (real minutes, a pause of <= RECESS min is not a window; recommended),
//        'g1' (real minutes, every idle minute counts, also the 10-minute break between two back-to-back lessons)
//   f18: reject an option whose own lessons share a slot
//   hooks: add the dfs/bound/leaf hooks used by the bound-admissibility harness (same as repro/search-bound-admissible.mjs)
// The patch list IS the design diff; `changed` counts the lines of the copy that do not exist in the original.
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
export const CORE = here('../../web/solver-core.js');

export async function buildProto({ gap = 'g2', f18 = 'group', hooks = false, tag = 'proto', minuteWindows = true, extra = [] } = {}) {
  const orig = fs.readFileSync(CORE, 'utf8').replace(/\r\n/g, '\n');
  let src = orig;
  const patch = (from, to) => {
    const n = src.split(from).length - 1;
    if (n !== 1) throw new Error(`patch target found ${n} times: ${from.slice(0, 70)}`);
    src = src.replace(from, () => to);
  };
  const cut = (startMark, endMark, to) => { // replace everything from startMark through endMark (inclusive)
    const a = src.indexOf(startMark), b = src.indexOf(endMark, a);
    if (a < 0 || b < 0 || src.indexOf(startMark, a + 1) >= 0) throw new Error(`cut anchors: ${startMark.slice(0, 40)}`);
    src = src.slice(0, a) + to + src.slice(b + endMark.length);
  };
  patch("from './rules.js'", "from '../../web/rules.js'");

  if (minuteWindows) {
    // 1. forbiddenMask + lateMask -> two minute-exact functions on one meeting
    cut('// Slots strictly after time t.', '  return m;\n}\n', `// Busy blocks, hard day off and hard hours as a test on ONE meeting, in real minutes (the 30-minute slots are for lesson-vs-lesson clashes only).
// A lesson [s, e) hits a busy block [a, b) when s < b && a < e, 'not before T' when s < T, 'not after T' when e > T.
export const forbiddenBy = (c = {}) => (m) => !!m.day && ((c.blocks ?? []).some((b) => b.day === m.day && toMin(m.start) < toMin(b.end) && toMin(b.start) < toMin(m.end))
  || (c.dayOffHard && c.dayOff?.includes(m.day)) || (c.windowHard && outsideMin(m, { ...c, dayOff: [] }) > 0));

// Minutes of a lesson outside what the student wished: all of it on a wished day off, else what lies before notBefore or after notAfter.
export const outsideMin = (m, c = {}) => {
  const s = toMin(m.start), e = toMin(m.end);
  if (!m.day) return 0;
  return c.dayOff?.includes(m.day) ? e - s : e - s - Math.max(0, Math.min(e, c.notAfter ? toMin(c.notAfter) : 1440) - Math.max(s, c.notBefore ? toMin(c.notBefore) : 0));
};
`);
    // 2. buildOptions: the hard filter on the meetings, not on the slot mask
    patch('if (forbidden && overlaps(mask, forbidden)) continue;', 'if (forbidden && meetings.some(forbidden)) continue;');
    // 3. search(): the predicate, and every option carries its outside minutes (additive: options never share a minute)
    patch('const forbidden = forbiddenMask(constraints);', 'const forbidden = forbiddenBy(constraints);');
    patch('.map((o) => ({ ...o, course: id }));', '\n      .map((o) => ({ ...o, course: id, out: o.meetings.reduce((a, m) => a + outsideMin(m, constraints), 0) }));');
    cut('  const prefMask = new Array(DAYS).fill(0);', '    prefMask[d] = mask;\n  }\n', '');
    patch('maxValue: maxValue || 1, constraints, examsPublished: data.examsPublished, prefMask };', 'maxValue: maxValue || 1, constraints, examsPublished: data.examsPublished };');
    // 4. leaf metric and bound use the same additive minutes
    patch(`  let outside = 0;
  for (let d = 1; d <= 6; d++) {
    outside += popcount(mask[d] & ctx.prefMask[d]) * 30;
  }
`, '  const outside = sel.reduce((a, o) => a + o.out, 0);\n');
    patch(`    let free = 0, outside = 0;
    for (let d = 1; d <= 6; d++) {
      if (d <= 5 && mask[d] === 0) free++;
      outside += popcount(mask[d] & prefMask[d]) * 30;
    }
`, `    let free = 0;
    for (let d = 1; d <= 5; d++) if (mask[d] === 0) free++;
    const outside = sel.reduce((a, o) => a + o.out, 0);
`);
    patch('forbidden: forbiddenMask({ ...constraints, blocks: [] })', 'forbidden: forbiddenBy({ ...constraints, blocks: [] })');
  }

  if (gap !== 'slot') {
    const slack = gap === 'g2' ? ' - RECESS' : '';
    patch(`  // ponytail: gaps measured at 30-min slot granularity
  let gapMin = 0;
  for (let d = 1; d <= 6; d++) {
    if (mask[d] === 0) continue;
    const bits = mask[d];
    const lo = 31 - Math.clz32(bits & -bits);
    const hi = 31 - Math.clz32(bits);
    gapMin += ((hi - lo + 1) - popcount(bits)) * 30;
  }
`, `  // Idle minutes between the lessons of a day, in real minutes${gap === 'g2' ? '; the 10 minutes between a :50 end and the next :00 are the break, not a window' : ''}.
  let gapMin = 0;
  const days = [];
  for (const o of sel) for (const m of o.meetings) if (m.day >= 1 && m.day <= 6) (days[m.day] ??= []).push([toMin(m.start), toMin(m.end)]);
  for (const iv of days) {
    if (!iv) continue;
    iv.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < iv.length; i++) gapMin += Math.max(0, iv[i][0] - iv[i - 1][1]${slack});
  }
`);
    if (gap === 'g2') patch('const DAY_NAMES =', 'const RECESS = 10;\nconst DAY_NAMES =');
  }

  if (f18) {
    const base = 'if (forbidden && meetings.some(forbidden)) continue;';
    const check = 'if (own.some((a, i) => own.slice(0, i).some((b) => overlaps(a, b)))) continue;';
    patch(base, f18 === 'meeting'
      ? `${base}\n      const own = meetings.map((m) => meetingsMask([m]));\n      ${check} // two lessons of one registration at the same time`
      : `${base}\n      const own = groups.map((g) => meetingsMask(g.meetings));\n      ${check} // a lecture and its own tutorial or lab at the same time`);
  }

  for (const [from, to] of extra) patch(from, to);

  if (hooks) {
    patch('function dfs(i, mask, credits, examDates, val) {',
      `function dfs(i, mask, credits, examDates, val) {
    const H = globalThis.__searchHook;
    if (!H) return dfs0(i, mask, credits, examDates, val);
    const b = bound(i, mask, val), frame = H.enter(i, b, globalThis.__terms, sel.map((o) => o.course + ':' + o.groups.join('+')));
    dfs0(i, mask, credits, examDates, val);
    H.exit(frame);
  }
  function dfs0(i, mask, credits, examDates, val) {`);
    patch("let b = fixedUp + W('friends') * friendsUp(i) + W('progress') * ((val + restValue[i]) / ctx.maxValue) + W('freeDays') * (free / 5) + W('timeWindow') * (1 - Math.min(outside / 600, 1));",
      `const __t = { friends: W('friends') * friendsUp(i), progress: W('progress') * ((val + restValue[i]) / ctx.maxValue), freeDays: W('freeDays') * (free / 5), compact: fixedUp, timeWindow: W('timeWindow') * (1 - Math.min(outside / 600, 1)), examSpread: 0 };
    let b = __t.friends + __t.progress + __t.freeDays + __t.compact + __t.timeWindow;`);
    patch("b += W('examSpread') * (g === null ? 1 : Math.min(g, 7) / 7);", "__t.examSpread = W('examSpread') * (g === null ? 1 : Math.min(g, 7) / 7); b += __t.examSpread;");
    patch('return b + 1e-9; // float slack', 'globalThis.__terms = __t; return b + 1e-9; // float slack');
    patch('const score = Object.entries(weights).reduce((a, [k, w]) => a + w * (m[k] ?? 0), 0);',
      'const score = Object.entries(weights).reduce((a, [k, w]) => a + w * (m[k] ?? 0), 0);\n    globalThis.__searchHook?.leaf(score, m, weights);');
  }

  const origLines = new Set(orig.split('\n'));
  const changed = src.split('\n').filter((l) => !origLines.has(l)).length;
  const file = here(`./${tag}.generated.mjs`);
  fs.writeFileSync(file, `// GENERATED by proto-lib.mjs from web/solver-core.js (prototype, never copied back; safe to delete)\n${src}`);
  return { mod: await import(`${pathToFileURL(file).href}?t=${Date.now()}`), file, changed, src };
}

// Plain line diff stat original -> prototype (without hooks), for the report.
export async function diffStat(opts = {}) {
  const orig = fs.readFileSync(CORE, 'utf8').replace(/\r\n/g, '\n').split('\n');
  const { src } = await buildProto({ ...opts, hooks: false, tag: 'diffstat' });
  const out = src.split('\n').map((l) => l.replace(/\.\.\/\.\.\/web\/rules\.js/, './rules.js'));
  // LCS-free estimate: lines only in one side (multiset difference)
  const count = (a) => a.reduce((m, l) => m.set(l, (m.get(l) ?? 0) + 1), new Map());
  const co = count(orig), cn = count(out);
  let removed = 0, added = 0;
  for (const [l, n] of co) removed += Math.max(0, n - (cn.get(l) ?? 0));
  for (const [l, n] of cn) added += Math.max(0, n - (co.get(l) ?? 0));
  return { added, removed, net: added - removed, lines: out.length };
}
