// Builds up-ui-search.patched.generated.mjs = web/ui-search.js with the proposed F-02 fix, imports rewritten to ../../web/.
import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync(new URL('../../web/ui-search.js', import.meta.url), 'utf8');
let out = src.replace(/from '\.\//g, "from '../../web/");
const a = "ui.worker.onmessage = (e) => { ui.last";
const b = "ui.worker.onerror = (e) => { ui.runError";
if (!out.includes(a) || !out.includes(b)) throw new Error('anchor missing');
out = out.replace(a, "ui.worker.onmessage = (e) => { if (my !== ui.gen) return; ui.last").replace(b, "ui.worker.onerror = (e) => { if (my !== ui.gen) return; ui.runError");
out = out.replace("new URL('./solver-worker.js', import.meta.url)", "new URL('../../web/solver-worker.js', import.meta.url)");
writeFileSync(new URL('up-ui-search.patched.generated.mjs', import.meta.url), out);
console.log('written; lines changed:', out.split('\n').filter((l) => l.includes('my !== ui.gen) return')).length);
