// WHAT: checks the audit documents themselves: every `path:line` / `path:a-b` they cite exists and is inside the file;
// every script named in findings.md exists; every claim id quoted next to a script in findings.md is printed by that script.
// RUN: node solver-audit/repro/meta-check-refs.mjs        (runs the cited scripts once to collect their claim ids, ~3 min)
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const R = new URL('../../', import.meta.url);
const DOCS = ['solver-audit/findings.md', 'solver-audit/dependencies.md', 'solver-audit/flow-human.md', 'solver-audit/flow-agent.md', 'solver-audit/flow-agent.json', 'solver-audit/repro/README.md'];
let ok = true;
const check = (id, pass, detail) => { ok &&= pass; console.log(`CHECK ${id} ${pass ? 'PASS' : 'FAIL'} ${detail}`); };
const len = {};
const nLines = (p) => (len[p] ??= fs.readFileSync(new URL(p, R), 'utf8').split(/\r?\n/).length);

// 1. path:line refs (full form) and bare ':n' continuations after a full ref in the same sentence are both checked
const bad = [], seen = new Set();
for (const d of DOCS) {
  if (!fs.existsSync(new URL(d, R))) { bad.push(`${d} missing`); continue; }
  const text = fs.readFileSync(new URL(d, R), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    let last = null;
    for (const m of line.matchAll(/((?:web|scripts|test|ci|docs)\/[\w./-]+\.\w+|`)?:(\d+)(?:-(\d+))?/g)) { // a bare :n counts only right after a backtick
      if (!m[1]) continue;
      const full = m[1] !== '`', file = full ? m[1] : last;
      if (!file) continue;
      if (full) last = m[1];
      if (!/^(web|scripts|test|ci|docs)\//.test(file)) continue;
      if (!fs.existsSync(new URL(file, R))) { bad.push(`${d}: ${file} does not exist`); continue; }
      const a = +m[2], b = +(m[3] ?? m[2]);
      seen.add(`${file}:${a}`);
      if (a < 1 || b < a || b > nLines(file)) bad.push(`${d}: ${file}:${a}${m[3] ? '-' + b : ''} outside 1..${nLines(file)}`);
    }
  }
}
check('REF-1', !bad.length, `${seen.size} distinct path:line refs in ${DOCS.length} documents; bad: ${bad.slice(0, 10).join(' | ') || 0}`);

// 2. scripts and claim ids cited in findings.md
const f = fs.readFileSync(new URL('solver-audit/findings.md', R), 'utf8');
const missingScripts = [], missingIds = [];
const out = {};
const run = (s) => (out[s] ??= (() => { try { return execFileSync(process.execPath, [new URL(`solver-audit/repro/${s}`, R).pathname.replace(/^\/(\w:)/, '$1')], { encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return String(e.stdout ?? ''); } })());
for (const line of f.split(/\r?\n/).filter((l) => /Proof|^\| (C-|E2E)/.test(l))) { // only proof statements name scripts
  for (const m of line.matchAll(/`([\w.-]+\.mjs)`(?::|,)?\s*((?:`[^`]+`(?:,\s*|\s*\([^)]*\),?\s*)?)+)?/g)) {
    const s = m[1];
    if (!fs.existsSync(new URL(`solver-audit/repro/${s}`, R))) { missingScripts.push(s); continue; }
    const ids = [...(m[2] ?? '').split(/[;(]/)[0].matchAll(/`([^`]+)`/g)].map((x) => x[1]).filter((x) => !x.includes(' ') && !x.includes('/'));
    if (!ids.length) continue;
    const txt = run(s);
    for (const id of ids) {
      const parts = id.split('..');
      const want = parts.length === 2 ? [parts[0]] : id.endsWith('*-aligned') ? ['aligned'] : id.startsWith('-') ? [id] : [id];
      if (!want.every((w) => txt.includes(w.replace('*', '')))) missingIds.push(`${s}:${id}`);
    }
  }
}
check('REF-2', !missingScripts.length, `scripts named in findings.md that do not exist: ${missingScripts.join(', ') || 0}`);
check('REF-3', !missingIds.length, `claim ids quoted in findings.md that their script does not print: ${missingIds.join(', ') || 0}`);
process.exit(ok ? 0 : 1);
