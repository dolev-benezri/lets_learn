// WHAT: validates solver-audit/flow-agent.json as a graph (unique ids, every edge points to a node, every node reachable from
// app.entry, every ref is path:line[-line] inside the file) and writes solver-audit/flow-agent.md from it (same content, readable).
// RUN: node solver-audit/repro/meta-flow.mjs
import fs from 'node:fs';

const R = new URL('../../', import.meta.url);
const g = JSON.parse(fs.readFileSync(new URL('solver-audit/flow-agent.json', R), 'utf8'));
let ok = true;
const check = (id, pass, detail) => { ok &&= pass; console.log(`CHECK ${id} ${pass ? 'PASS' : 'FAIL'} ${detail}`); };
const ids = new Set(g.nodes.map((n) => n.id));
check('FLOW-1', ids.size === g.nodes.length, `${g.nodes.length} nodes, unique ids`);
const dangling = g.nodes.flatMap((n) => n.next.filter((x) => !ids.has(x)).map((x) => `${n.id}->${x}`));
check('FLOW-2', !dangling.length, `edges to missing nodes: ${dangling.join(', ') || 0}`);
const seen = new Set(['app.entry']), st = ['app.entry'];
const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
const entries = ['app.entry', 'ui.userChange', 'ui.moreClick', 'ui.go']; // user actions start their own paths
for (const e of entries) { seen.add(e); st.push(e); }
while (st.length) for (const x of byId[st.pop()].next) if (!seen.has(x)) { seen.add(x); st.push(x); }
check('FLOW-3', seen.size === ids.size, `nodes reachable from page load or a user action: ${seen.size}/${ids.size} ${[...ids].filter((x) => !seen.has(x)).join(' ')}`);
const len = {};
const refOk = (r) => { const m = r.match(/^([\w./-]+):(\d+)(?:-(\d+))?$/); if (!m) return false; const f = new URL(m[1], R); if (!fs.existsSync(f)) return false;
  len[m[1]] ??= fs.readFileSync(f, 'utf8').split(/\r?\n/).length; return +m[2] >= 1 && +(m[3] ?? m[2]) <= len[m[1]] && +m[2] <= +(m[3] ?? m[2]); };
const bad = g.nodes.filter((n) => !refOk(n.ref)).map((n) => `${n.id}:${n.ref}`);
check('FLOW-4', !bad.length, `node refs that are not path:line inside the file: ${bad.join(', ') || 0}`);
const edges = g.nodes.flatMap((n) => n.next.map((to) => ({ from: n.id, to })));
const md = `# Solver flow for an AI agent

Same content as \`solver-audit/flow-agent.json\` (generated from it by \`node solver-audit/repro/meta-flow.mjs\`; edit the JSON, not this file).
Load order for a new task: read **Structures**, then follow **Nodes** from \`app.entry\` (page load) or a user action (\`ui.userChange\`, \`ui.moreClick\`, \`ui.go\`).
Graph: ${g.nodes.length} nodes, ${edges.length} edges. Finding ids (F-nn) point into \`solver-audit/findings.md\`.

## Structures

| Name | Shape (where defined) |
|---|---|
${Object.entries(g.structures).map(([k, v]) => `| \`${k}\` | ${v.replace(/\|/g, '\\|')} |`).join('\n')}

## Nodes

${g.nodes.map((n) => `### \`${n.id}\`: ${n.label}

- **fn**: \`${n.fn}\` at \`${n.ref}\`
- **in**: ${n.inputs}
- **out**: ${n.outputs}
- **reads**: ${n.reads.length ? n.reads.map((x) => `\`${x}\``).join(', ') : '-'}
- **writes**: ${n.writes.length ? n.writes.map((x) => `\`${x}\``).join(', ') : '-'}
- **next**: ${n.next.length ? n.next.map((x) => `\`${x}\``).join(', ') : '(end: shown to the user)'}${n.notes ? `\n- **notes**: ${n.notes}` : ''}${n.findings ? `\n- **findings**: ${n.findings.join(', ')}` : ''}`).join('\n\n')}

## Edges

| from | to |
|---|---|
${edges.map((e) => `| \`${e.from}\` | \`${e.to}\` |`).join('\n')}
`;
fs.writeFileSync(new URL('solver-audit/flow-agent.md', R), md);
console.log(`INFO wrote solver-audit/flow-agent.md (${g.nodes.length} nodes, ${edges.length} edges)`);
process.exit(ok ? 0 : 1);
