// Rebuild every data file from the local gitignored .yedion-cache with NO network, into an output dir inside plan-probes.
// Usage: node solver-audit/plan-probes/data-rebuild-offline.mjs <scriptsDir relative to this file> <outDir relative to this file>
//   e.g. node solver-audit/plan-probes/data-rebuild-offline.mjs ../../scripts out-before
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const [scriptsRel = '../../scripts', outRel = 'out-before'] = process.argv.slice(2);
const scrape = await import(pathToFileURL(path.resolve(here, scriptsRel, 'scrape.mjs')).href);
const cacheDir = path.resolve(here, '../../.yedion-cache/2027');
const inner = async () => { throw new Error('NETWORK ATTEMPTED'); };
const request = scrape.cachedRequester(inner, cacheDir, { offline: true });
const opt = { year: '2027', 'all-semesters': true, 'all-programs': true, force: true, offline: true, nightly: false, start: '2026', program: '30', semester: 'א' };
const dataDir = path.resolve(here, outRel);
const log = (m) => { if (/^WARN|^SAFETY|FAILED/.test(m)) console.error(m); };
console.log(await scrape.run({ opt, request, dataDir, log }));
