// helper: edit(file, from, to) on the sandbox copy only (CRLF-safe, anchor must occur exactly once).
import { readFileSync, writeFileSync } from 'node:fs';
const SB = new URL('./up-sb/', import.meta.url);
export function edit(file, from, to) {
  const u = new URL(file, SB), raw = readFileSync(u, 'utf8'), crlf = raw.includes('\r\n'), t = raw.replace(/\r\n/g, '\n');
  const n = t.split(from).length - 1;
  if (n !== 1) throw new Error(`${file}: anchor occurs ${n} times: ${from.slice(0, 60)}`);
  const out = t.replace(from, () => to);
  writeFileSync(u, crlf ? out.replace(/\n/g, '\r\n') : out);
}
