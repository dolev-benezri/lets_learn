// Publishes drafts.md as GitHub issues with gh (run only after the owner approved). Prints "stage N -> #number url".
// RUN: node solver-audit/issues/publish.mjs [--dry]
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const dry = process.argv.includes('--dry');
const text = fs.readFileSync(new URL('drafts.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tmp = new URL('body.tmp.md', import.meta.url);
for (const part of text.split(/^=== ISSUE \d+\n/m).filter((p) => p.trim())) {
  const [head, ...rest] = part.split('\n---\n');
  const meta = Object.fromEntries(head.split('\n').filter((l) => l.includes(':')).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
  const body = rest.join('\n---\n').trim() + '\n';
  const labels = meta.labels.split(',').map((s) => s.trim());
  if (dry) { console.log(`stage ${meta.stage} | ${meta.title} | ${labels.join(',')} | ${body.length} chars`); continue; }
  fs.writeFileSync(tmp, body);
  const url = execFileSync('gh', ['issue', 'create', '--repo', 'dolev-benezri/lets_learn', '--title', meta.title, ...labels.flatMap((l) => ['--label', l]),
    '--body-file', tmp.pathname.replace(/^\/(\w:)/, '$1')], { encoding: 'utf8' }).trim();
  console.log(`stage ${meta.stage} -> #${url.split('/').pop()} ${url}`);
}
if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
