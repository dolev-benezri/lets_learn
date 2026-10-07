// rules-lib.mjs - shared helpers for the rules-*.mjs audit scripts (NOT a test; no *.test.mjs name on purpose).
// Provides: seeded PRNG, data loading (read-only, relative to this file), and CHECK/BUG reporting with the exit-code rule
//   exit 0 iff every CHECK is PASS and every BUG is REPRODUCED, else exit 1.
// It copies no solver/rules logic. Run any rules-*.mjs from any cwd: node solver-audit/repro/rules-<name>.mjs
import fs from 'node:fs';

export const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const ri = (rnd, n) => Math.floor(rnd() * n); // 0..n-1
export const pick = (rnd, a) => a[ri(rnd, a.length)];
export const shuffle = (rnd, a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = ri(rnd, i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };

const DATA = new URL('../../web/data/afeka/', import.meta.url);
export const readJson = (rel) => JSON.parse(fs.readFileSync(new URL(rel, DATA), 'utf8'));
export const catalog = readJson('catalog.json');
export const SEMS = ['2027-1', '2027-2', '2027-3']; // 1 = א, 2 = ב, 3 = summer
const cache = new Map();
export const load = (sem, program, startYear) => {
  const k = `${sem}/${program}-${startYear}`;
  if (!cache.has(k)) cache.set(k, readJson(`${k}.json`));
  return cache.get(k);
};
// every (program, startYear) of the catalog
export const cohorts = () => catalog.programs.flatMap((p) => p.startYears.map((y) => ({ id: p.id, name: p.name, y })));

// ---- reporting ----
let failed = 0, claims = 0;
export const check = (id, ok, detail = '') => { claims++; if (!ok) failed++; console.log(`CHECK ${id} ${ok ? 'PASS' : 'FAIL'} ${detail}`); return ok; };
// reproduced = the defect is observed. After a fix the line flips to NOT-REPRODUCED and the script exits 1.
export const bug = (id, reproduced, detail = '') => { claims++; if (!reproduced) failed++; console.log(`BUG ${id} ${reproduced ? 'REPRODUCED' : 'NOT-REPRODUCED'} ${detail}`); return reproduced; };
export const info = (...a) => console.log('INFO', ...a);
export const finish = () => { console.log(`SUMMARY claims=${claims} unexpected=${failed}`); process.exitCode = failed ? 1 : 0; };
