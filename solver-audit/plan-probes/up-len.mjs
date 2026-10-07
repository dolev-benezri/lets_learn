// usage: node len.mjs <file> [from-to]  -> prints code-point length of each line (the line-length test counts code points, limit 200)
import { readFileSync } from 'node:fs';
const [f, r] = process.argv.slice(2); const [a, b] = (r ?? '1-99999').split('-').map(Number);
readFileSync(f, 'utf8').split(/\r?\n/).forEach((l, i) => { const n = [...l].length; if (i + 1 >= a && i + 1 <= (b ?? a) && (r || n > 170)) console.log(`${f}:${i + 1}: ${n}`); });
