// Probe 1: which prerequisite row kinds exist in the cached (gitignored) yedion course-detail pages.
// Run: node solver-audit/plan-probes/data-p1-rowtypes.mjs
import fs from 'node:fs';
import { parse } from 'node-html-parser';
import { clean, tableRows, parseDetails } from '../../scripts/parse.mjs';

const dir = new URL('../../.yedion-cache/2027/', import.meta.url);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html'));
let details = 0, withCard = 0;
const kinds = new Map(), rowKindOfParse = new Map();
const samples = new Map();
for (const f of files) {
  const html = fs.readFileSync(new URL(f, dir), 'utf8');
  if (!html.includes('נקודות זכות')) continue;
  details++;
  const root = parse(html);
  const card = root.querySelectorAll('.card').find((c) => c.querySelector('h2')?.text.includes('תנאי קדם לנושא'));
  if (!card) continue;
  withCard++;
  for (const c of tableRows(card).filter((c) => c.length === 4 && c[0].startsWith('תנאי'))) {
    const k = c[0];
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
    if (!samples.has(k)) samples.set(k, f);
  }
  for (const p of parseDetails(html).prereqs) rowKindOfParse.set(p.kind, (rowKindOfParse.get(p.kind) ?? 0) + 1);
}
console.log(`INFO cache files ${files.length}, detail pages ${details}, with prereq card ${withCard}`);
for (const [k, n] of [...kinds].sort((a, b) => b[1] - a[1])) console.log(`INFO rowkind x${n}: "${k}" (e.g. ${samples.get(k).slice(0, 8)})`);
console.log('INFO parseDetails kinds', JSON.stringify([...rowKindOfParse]));
