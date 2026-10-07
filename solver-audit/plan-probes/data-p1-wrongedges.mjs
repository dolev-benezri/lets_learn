// Probe 1: classify the prereq rows that the fixed parser drops (exclusion rows), per category, and the effect of the non-self ones.
// Run: node solver-audit/plan-probes/data-p1-wrongedges.mjs   (needs out-before/out-after from data-rebuild-offline.mjs)
import fs from 'node:fs';
import { classify } from '../../web/rules.js';
const here = new URL('./', import.meta.url);
const rd = (f) => JSON.parse(fs.readFileSync(new URL(f, here), 'utf8'));
const files = ['2027-1', '2027-2', '2027-3'].flatMap((s) => fs.readdirSync(new URL(`out-before/${s}/`, here)).map((f) => `${s}/${f}`));
const cat = { self: 0, resolvedOther: 0, allNull: 0, mixed: 0 };
const uniq = { self: new Set(), resolvedOther: new Set(), allNull: new Set(), mixed: new Set() };
let blockedMore = 0, blockedCases = [], mutual = new Set(), notes = 0, offeredBlockedOther = 0;
for (const f of files) {
  const b = rd(`out-before/${f}`), a = rd(`out-after/${f}`);
  for (const [id, cb] of Object.entries(b.courses)) {
    const ca = a.courses[id];
    const kept = new Set(ca.prereqs.map((p) => JSON.stringify(p)));
    for (const p of cb.prereqs) {
      if (kept.has(JSON.stringify(p))) continue;
      const ids = p.anyOf.map((x) => x.id);
      const k = ids.includes(id) ? 'self' : ids.every((x) => x === null) ? 'allNull' : ids.every((x) => x !== null) ? 'resolvedOther' : 'mixed';
      cat[k]++; uniq[k].add(`${id}->${p.anyOf.map((x) => x.id ?? x.name).join('|')}`);
      if (k === 'allNull') notes++;
      if (k === 'resolvedOther') for (const x of p.anyOf) { const back = b.courses[x.id]?.prereqs.some((q) => q.anyOf.some((y) => y.id === id)); if (back) mutual.add([id, x.id].sort().join('<->')); }
    }
  }
  // students who passed every earlier-year course: how many OFFERED courses are blocked before vs after the fix
  const state = { passed: [], failed: {}, profile: { amirnet: 134 } };
  const sb = classify(b, state).statuses, sa = classify(a, state).statuses;
  for (const id of Object.keys(b.courses)) if (sb[id].status === 'blocked' && sa[id].status !== 'blocked') { blockedMore++; if (!b.courses[id].prereqs.some((p) => p.anyOf.some((x) => x.id === id))) { offeredBlockedOther++; blockedCases.push(`${f}:${id}`); } }
}
console.log('INFO dropped rows by category (summed over 144 files):', JSON.stringify(cat));
console.log('INFO distinct (course->target) per category:', JSON.stringify(Object.fromEntries(Object.entries(uniq).map(([k, v]) => [k, v.size]))));
console.log(`INFO bogus "קדם מחוץ לתוכנית" notes caused by all-null exclusion rows: ${notes}`);
console.log(`INFO mutual exclusion pairs stored as two-way requirements: ${[...mutual].join(', ') || 'none'}`);
console.log(`INFO course records blocked only because of the exclusion rows (blocked before, not after), with empty passed list: ${blockedMore}; of these NOT self-referencing: ${offeredBlockedOther} ${blockedCases.slice(0, 6).join(' ')}`);
console.log('INFO examples resolvedOther:', [...uniq.resolvedOther].slice(0, 10).join(' | '));
