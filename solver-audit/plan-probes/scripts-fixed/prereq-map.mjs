#!/usr/bin/env node
// Prerequisite map: web/data/... JSON -> docs/PREREQS.md (Mermaid flowchart + table) and docs/prereqs.json.
// Usage: node scripts/prereq-map.mjs [data-file]
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2] ?? 'web/data/afeka/2027-1/30-2026.json';
const data = JSON.parse(readFileSync(file, 'utf8'));
const C = data.courses;

// Which list (year / elective group) a course belongs to: first list that has it.
const listOf = {};
for (const l of data.lists) for (const id of l.courses) listOf[id] ??= l.name;

// Edges: from prerequisite to dependent. Alternatives of one requirement share a group number.
const edges = [];
for (const [id, c] of Object.entries(C)) c.prereqs.forEach((p, gi) => {
  for (const a of p.anyOf) edges.push({ from: a.id, fromName: a.name, to: id, kind: p.kind, alt: p.anyOf.length > 1, group: gi });
});

const rev = {};
for (const e of edges) if (e.from && e.kind === 'קדם') (rev[e.from] ??= []).push(e.to);
const downstream = (id, seen = new Set()) => { for (const x of rev[id] ?? []) if (!seen.has(x)) { seen.add(x); downstream(x, seen); } return seen; };
const depthMemo = {};
const depth = (id, stack = new Set()) => {
  if (id in depthMemo) return depthMemo[id];
  if (stack.has(id)) return 0; // ponytail: cycle guard, none in real data
  stack.add(id);
  const d = Math.max(0, ...(rev[id] ?? []).map((x) => 1 + depth(x, stack)));
  stack.delete(id);
  return (depthMemo[id] = d);
};

const rows = Object.entries(C).map(([id, c]) => ({
  id, name: c.name, credits: c.credits, offered: c.offered, list: listOf[id] ?? '',
  requires: c.prereqs.filter((p) => p.kind === 'קדם').map((p) => p.anyOf.map((a) => a.id ?? `(${a.name})`)),
  parallel: c.prereqs.filter((p) => p.kind === 'מקביל').map((p) => p.anyOf.map((a) => a.id ?? `(${a.name})`)),
  unlocksDirect: [...new Set(rev[id] ?? [])],
  unlocksTotal: downstream(id).size,
  depth: depth(id),
}));

writeFileSync('docs/prereqs.json', JSON.stringify({ source: file, fetchedAt: data.fetchedAt, lists: data.lists.map((l) => l.name), courses: rows, edges }, null, 1) + '\n');

// Mermaid: one subgraph per list, solid arrow = קדם, dotted = מקביל, label "או" on alternatives.
const node = (id) => `c${id}`;
const q = (s) => s.replace(/"/g, "'");
const external = new Map();
const lines = ['flowchart LR'];
data.lists.forEach((l, i) => {
  lines.push(`  subgraph L${i}["${q(l.name)}"]`);
  for (const id of l.courses) if (listOf[id] === l.name) lines.push(`    ${node(id)}["${q(C[id].name)}<br/>${id} · ${C[id].credits} נ״ז"]`);
  lines.push('  end');
});
for (const e of edges) {
  let from = e.from && C[e.from] ? node(e.from) : null;
  if (!from) { from = `x${external.size}`; if (![...external.values()].includes(e.fromName)) external.set(from, e.fromName); else from = [...external].find(([, n]) => n === e.fromName)[0]; }
  const label = e.alt ? '|או|' : '';
  lines.push(`  ${from} ${e.kind === 'מקביל' ? '-.->' : '-->'}${label} ${node(e.to)}`);
}
for (const [k, n] of external) lines.push(`  ${k}(["${q(n)}<br/>מחוץ לתוכנית"])`);
lines.push('  classDef off fill:#eee,stroke:#999,color:#555;');
const off = rows.filter((r) => !r.offered).map((r) => node(r.id));
if (off.length) lines.push(`  class ${off.join(',')} off;`);

const cell = (groups) => groups.map((g) => g.join(' או ')).join('; ') || '—';
const md = `# מפת דרישות קדם

נוצר אוטומטית מ-\`${file}\` (נתונים מ-${data.fetchedAt.slice(0, 10)}) על ידי \`node scripts/prereq-map.mjs\`. לא לערוך ידנית.
גרסה אינטראקטיבית ומכונה-קריאה: [prereqs.json](prereqs.json).

- חץ מלא: **קדם** (חייבים לעבור קודם). חץ מקווקו: **מקביל** (אפשר באותו סמסטר).
- "או": כל אחת מהחלופות מספיקה.
- אפור: לא נלמד בסמסטר הנוכחי. צורה מעוגלת: קורס מחוץ לתוכנית.

\`\`\`mermaid
${lines.join('\n')}
\`\`\`

## טבלה

"פותח" = כמה קורסים נחסמים בשרשרת (רק קדם). "עומק" = אורך השרשרת הארוכה ביותר שהקורס פותח.

| קוד | קורס | רשימה | נ״ז | נלמד | דורש (קדם) | מקביל | פותח ישירות | פותח בסך הכל | עומק |
|---|---|---|---|---|---|---|---|---|---|
${rows.sort((a, b) => b.unlocksTotal - a.unlocksTotal || a.id.localeCompare(b.id)).map((r) => `| ${r.id} | ${r.name} | ${r.list} | ${r.credits} | ${r.offered ? 'כן' : 'לא'} | ${cell(r.requires)} | ${cell(r.parallel)} | ${r.unlocksDirect.join(', ') || '—'} | ${r.unlocksTotal} | ${r.depth} |`).join('\n')}
`;
writeFileSync('docs/PREREQS.md', md);
console.log(`courses ${rows.length}, edges ${edges.length}, external ${external.size}`);
