// WHAT: runs every standalone proof script in this folder and prints one line per script (exit code, PASS/REPRODUCED counts,
// and any line that is not as documented). Exit 0 iff every script exits 0, i.e. every claim in findings.md still holds.
// RUN: node solver-audit/repro/run-all.mjs          (about 1-2 minutes; meta-check-refs.mjs is separate, it re-runs scripts itself)
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const HELPERS = /(-lib|\.generated|\.gen|^caller-worker-host|^year-gen|^year-instrument|^run-all|^meta-check-refs)\.mjs$|^(caller-worker-host|year-gen|year-instrument|run-all|meta-check-refs)\.mjs$/;
const scripts = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs') && !HELPERS.test(f)).sort();
let failed = 0;
for (const s of scripts) {
  const t = Date.now();
  const r = spawnSync(process.execPath, [dir + s], { encoding: 'utf8', timeout: 600000 });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const good = (out.match(/^(CHECK \S+:? ?PASS|BUG \S+:? ?REPRODUCED|CHECK .* PASS|BUG .* REPRODUCED)/gm) ?? []).length;
  const off = out.split(/\r?\n/).filter((l) => /^(CHECK|BUG)/.test(l) && /\b(FAIL|NOT-REPRODUCED)\b/.test(l));
  if (r.status !== 0) failed++;
  console.log(`${r.status === 0 ? 'OK  ' : 'FAIL'} ${s.padEnd(34)} exit=${r.status} claims-as-documented=${good} ${((Date.now() - t) / 1000).toFixed(1)}s`);
  for (const l of off) console.log(`     ${l.slice(0, 200)}`);
}
console.log(`${scripts.length - failed}/${scripts.length} scripts as documented`);
process.exit(failed ? 1 : 0);
